import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../lib/editor-model.ts';
import * as format from '../lib/report-format.ts';

const editorSource = readFileSync(new URL('../components/editors/EditingStudio.tsx', import.meta.url), 'utf8');
const hostedSource = readFileSync(new URL('../components/hosted/HostedReport.tsx', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// Execute the actual component and callbacks with controlled hooks/I/O. This is not a DOM renderer.
function harness(source = editorSource, overrides = {}) {
  const slots = [], layouts = [], effects = [], timers = new Map(), downloads = [], snapshots = [];
  let cursor = 0, timerId = 0, tree, props;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback, deps) { const index = cursor++, previous = slots[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) slots[index] = { callback, deps }; return slots[index].callback; },
    useImperativeHandle(ref, create) { cursor++; if (ref) layouts.push(() => { ref.current = create(); }); },
    useSyncExternalStore() { cursor++; return false; },
  };
  for (const [name, queue] of [['useLayoutEffect', layouts], ['useEffect', effects]]) hooks[name] = (effect, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
      queue.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    }
  };
  const jsx = (type, values, key) => ({ type, key, props: values ?? {} });
  const auth = { setUnsaved() {}, getDraft() {}, cacheDraft() {}, ...overrides.auth };
  const defaultModule = name => ({ __esModule: true, default: name });
  const modules = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@/lib/editor-model': model, '@/lib/report-format': format,
    '@/lib/report-blueprint': { matchBlueprintNode: () => null },
    '@/lib/report-benchmark': { writtenLines: text => text ? [text] : [] },
    '../motion/useWorkspaceMotion': { useContentReveal: () => ({ current: null }), useKeyedListMotion: () => ({ current: null }) },
    '../hosted/HostedSession': { useHostedSession: () => auth }, './HostedSession': { useHostedSession: () => auth },
    '@/lib/editor-recovery': { EDITOR_RECOVERY_EVENT: 'recovery', EDITOR_RECOVERY_CHANNEL: 'recovery' },
    './ReportStoryboard': { ...defaultModule('ReportStoryboard'), ReportLinkNotice: 'ReportLinkNotice' },
    './QualityStudio': { ...defaultModule('QualityStudio'), QualitySlidePreview: 'QualitySlidePreview', QualityGraphic: 'QualityGraphic' },
    '@/lib/research-quality': { makeSlideObject() {} },
    '@/lib/quality-layouts': { appendQualityResult: (content, result) => ({ ...content, subtitle: result.id }) },
    '@/lib/project-report': {
      appendEvidenceSection: (content, section) => ({ ...content, report: [...content.report, section] }),
      reportContentsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b), newProjectReport: () => model.createEditorContent(),
      parseReportHead: value => value, parseProjectReport: value => value,
    },
    '@/lib/report-storyboard': { LINK_LABELS: {}, reportExportWarnings: async () => [] },
    '@/lib/editor-export': { buildDocx: async () => new Blob(['docx']), buildPptx: async () => new Blob(['pptx']), downloadBlob: (blob, filename) => downloads.push({ blob, filename }), fileName: title => title },
    ...overrides.modules,
  };
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => modules[name] ?? (name.endsWith('.css') ? {} : defaultModule(name.replace(/^\.\//, ''))),
    window: { addEventListener() {}, removeEventListener() {}, confirm: () => true, setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id) },
    document: { querySelector: () => null }, TextEncoder, Blob, structuredClone,
    crypto: { randomUUID: () => 'test-id' }, setTimeout, clearTimeout, queueMicrotask, console,
  });
  const api = {
    exports, timers, downloads, snapshots,
    render(nextProps, beforeLayouts) { props = nextProps ?? props; cursor = 0; layouts.length = 0; effects.length = 0; tree = exports.default(props); beforeLayouts?.(); for (const effect of layouts.splice(0)) effect(); for (const effect of effects.splice(0)) effect(); return tree; },
    find(predicate) { const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const child of node) { const found = walk(child); if (found) return found; } return; } if (predicate(node)) return node; return walk(node.props?.children); }; const found = walk(tree); assert.ok(found, 'rendered node must exist'); return found; },
    editorProps(readOnly, extra = {}) { return { localOnly: true, projectBinding: { initialContent: model.createEditorContent(), status: 'ready', readOnly, onSnapshot: value => snapshots.push(value), onSave() {} }, ...extra }; },
    content() { return api.find(node => node.type === 'QualityStudio').props.content; },
  };
  return api;
}

test('permission tickets are revoked by downgrade and stay revoked after restoration', () => {
  const h = harness(), guard = h.exports.createReportPermissionGuard(false), ticket = guard.epoch;
  assert.equal(guard.allows(ticket), true);
  guard.update(true); assert.equal(guard.allows(ticket), false);
  guard.update(false); assert.equal(guard.allows(ticket), false);
  assert.equal(guard.allows(guard.epoch), true);
});

test('read-only rendering and actual edit, quality, storyboard, undo and imperative callbacks preserve content', () => {
  const h = harness(), controllerRef = { current: null };
  h.render(h.editorProps(false, { controllerRef }));
  const initial = h.content(), title = h.find(node => node.props?.['aria-label'] === '作品名称');
  title.props.onChange({ target: { value: 'edited first' } });
  h.render(); const edited = h.content(); assert.equal(edited.title, 'edited first');
  const oldHandle = controllerRef.current, quality = h.find(node => node.type === 'QualityStudio').props.onChange;
  const storyboard = h.find(node => node.type === 'ReportStoryboard').props.onApply;
  const undo = h.find(node => node.type === 'button' && node.props.onClick?.name === 'undo').props.onClick;
  h.render(h.editorProps(true, { controllerRef }));
  const readOnlyTitle = h.find(node => node.props?.['aria-label'] === '作品名称');
  assert.equal(readOnlyTitle.props.readOnly, true);
  readOnlyTitle.props.onChange({ target: { value: 'viewer edit' } });
  assert.equal(h.find(node => node.props?.['aria-label'] === '报告格式设置').props.disabled, true);
  h.find(node => node.type === 'ReportFormatPanel').props.onChange({ ...format.DEFAULT_REPORT_SETTINGS });
  assert.equal(h.find(node => node.type === 'QualityStudio').props.disabled, true);
  assert.equal(h.find(node => node.type === 'ReportStoryboard').props.disabled, true);
  assert.equal(oldHandle.appendSection({ id: 'extra', title: 'extra', body: '', source: '' }), false);
  assert.equal(oldHandle.appendResult({ id: 'forbidden' }), false);
  quality({ ...initial, title: 'forbidden' }); undo();
  assert.equal(storyboard(initial.slides, JSON.stringify(edited)), false);
  h.render(); assert.equal(h.content().title, 'edited first');
  h.render(h.editorProps(false, { controllerRef }));
  quality({ ...initial, title: 'stale after restored access' });
  assert.equal(oldHandle.appendResult({ id: 'still forbidden' }), false);
  h.render(); assert.equal(h.content().title, 'edited first');
  assert.equal(controllerRef.current.appendResult({ id: 'new capability' }), true);
  h.render(); assert.equal(h.content().subtitle, 'new capability');
});

test('read-only redo cannot restore a writable undo history snapshot', () => {
  const h = harness(); h.render(h.editorProps(false));
  h.find(node => node.props?.['aria-label'] === '作品名称').props.onChange({ target: { value: 'edited' } });
  h.render(); h.find(node => node.type === 'button' && node.props.onClick?.name === 'undo').props.onClick();
  h.render(); const before = JSON.stringify(h.content());
  const oldRedo = h.find(node => node.type === 'button' && node.props.onClick?.name === 'redo').props.onClick;
  h.render(h.editorProps(true)); oldRedo(); h.render();
  assert.equal(JSON.stringify(h.content()), before);
});

test('late backup completion is fenced across downgrade and restored permission', async () => {
  const h = harness(), file = deferred();
  h.render(h.editorProps(false)); const before = JSON.stringify(h.content());
  const input = h.find(node => node.type === 'input' && node.props.type === 'file');
  input.props.onChange({ target: { files: [{ size: 100, text: () => file.promise }], value: 'selected' } });
  h.render(h.editorProps(true)); h.render(h.editorProps(false));
  file.resolve(JSON.stringify({ ...model.createEditorContent(), title: 'late replacement' }));
  await tick(); h.render(); assert.equal(JSON.stringify(h.content()), before);
});

test('queued result proposal cannot mutate or consume after its write ticket is revoked', () => {
  const h = harness(); let consumed = 0;
  h.render(h.editorProps(false, { resultProposal: { id: 'stale result' }, onResultHandled: () => consumed++ }));
  const stale = [...h.timers.values()][0]; assert.equal(typeof stale, 'function');
  h.render(h.editorProps(true)); h.render(h.editorProps(false)); stale();
  h.render(); assert.notEqual(h.content().subtitle, 'stale result'); assert.equal(consumed, 0);
});

test('read-only JSON, Word and PPTX downloads execute without changing report content', async () => {
  const h = harness(); h.render(h.editorProps(true)); const before = JSON.stringify(h.content());
  const backup = h.find(node => node.type === 'button' && node.props.children === '下载 JSON 备份');
  assert.notEqual(backup.props.disabled, true); backup.props.onClick(); await tick();
  const word = h.find(node => node.type === 'button' && node.props.children === '导出 Word 报告正文');
  assert.notEqual(word.props.disabled, true); word.props.onClick(); await tick();
  h.find(node => node.type === 'button' && node.props.children === 'PPT 幻灯片').props.onClick(); h.render();
  h.find(node => node.type === 'button' && node.props.children === '导出 PPTX 草稿').props.onClick(); await tick();
  assert.equal(h.downloads.length, 3); assert.equal(JSON.stringify(h.content()), before);
});

test('host forwards read-only state and stale save callbacks cannot write after downgrade/restore', async () => {
  const editor = harness().exports, initial = model.createEditorContent(); let writes = 0;
  const receipt = deferred(), requests = [];
  const h = harness(hostedSource, {
    auth: { mutate: () => { writes++; return receipt.promise; } },
    modules: { '../editors/EditingStudio': { __esModule: true, default: 'EditingStudio', createReportPermissionGuard: editor.createReportPermissionGuard }, './api-client': { hostedRequest: async url => { requests.push(url); return url.endsWith('/versions') ? { versions: [], nextBeforeRevision: null } : null; }, errorMessage: error => error.message, HostedApiError: class extends Error {} } },
  });
  const props = { projectId: 'p', title: 'report', writable: true, proposal: null, onProposalConsumed() {} };
  h.render(props); await tick(); h.render();
  const save = h.find(node => node.type === 'button' && node.props.children === '保存报告与 PPT').props.onClick;
  save(); assert.equal(writes, 1);
  h.render({ ...props, writable: false });
  assert.equal(h.find(node => node.type === 'EditingStudio').props.projectBinding.readOnly, true);
  save(); assert.equal(writes, 1);
  h.render(props); const readsBeforeReceipt = requests.length;
  receipt.resolve({ id: 'r', revision: 1, content: initial }); await tick(); h.render();
  assert.equal(requests.length, readsBeforeReceipt, 'stale save completion cannot load/accept the head');
  save(); assert.equal(writes, 1, 'old callbacks stay revoked after write permission is restored');
});

test('restored child snapshot reaches the host even when child layout runs before host layout', async () => {
  const editor = harness().exports; let payload;
  const h = harness(hostedSource, {
    auth: { mutate: async (url, body) => { payload = body; return { id: 'r', revision: 1, content: body.content }; } },
    modules: { '../editors/EditingStudio': { __esModule: true, default: 'EditingStudio', createReportPermissionGuard: editor.createReportPermissionGuard }, './api-client': { hostedRequest: async url => url.endsWith('/versions') ? { versions: [], nextBeforeRevision: null } : null, errorMessage: error => error.message, HostedApiError: class extends Error {} } },
  });
  const props = { projectId: 'p', title: 'report', writable: true, proposal: null, onProposalConsumed() {} };
  h.render(props); await tick(); h.render(); h.render({ ...props, writable: false });
  h.render(props, () => h.find(node => node.type === 'EditingStudio').props.projectBinding.onSnapshot({ ...model.createEditorContent(), title: 'preserved child content' }));
  await tick(); h.render();
  h.find(node => node.type === 'button' && node.props.children === '保存报告与 PPT').props.onClick();
  assert.equal(payload.content.title, 'preserved child content'); await tick();
});

function loadHarness(readonly = false) {
  const editor = harness().exports, initial = model.createEditorContent(), requests = [];
  let nextRead, payload;
  const h = harness(hostedSource, {
    auth: { mutate: async (url, body) => { payload = body; return { id: 'saved', revision: 2, content: body.content }; } },
    modules: { '../editors/EditingStudio': { __esModule: true, default: 'EditingStudio', createReportPermissionGuard: editor.createReportPermissionGuard }, './api-client': { hostedRequest: async url => {
      requests.push(url);
      if (nextRead) return nextRead(url);
      if (url.endsWith('/versions')) return { versions: [{ id: 'history', title: 'history', revision: 1 }], nextBeforeRevision: null };
      return { id: 'head', revision: 1, content: initial };
    }, errorMessage: error => error.message, HostedApiError: class extends Error {} } },
  });
  return { h, initial, requests, props: { projectId: 'p', title: 'report', writable: !readonly, proposal: null, onProposalConsumed() {} }, setRead(callback) { nextRead = callback; }, get payload() { return payload; } };
}

test('cloud load started before downgrade cannot remount or overwrite unsaved content', async () => {
  const f = loadHarness(), { h } = f, late = deferred();
  h.render(f.props); await tick(); h.render();
  const editor = h.find(node => node.type === 'EditingStudio');
  editor.props.projectBinding.onSnapshot({ ...f.initial, title: 'preserved unsaved content' }); h.render();
  f.setRead(() => late.promise);
  h.find(node => node.type === 'button' && node.props.children === '载入最新版本').props.onClick();
  h.render({ ...f.props, writable: false }); h.render(f.props);
  late.resolve({ id: 'late', revision: 2, content: { ...f.initial, title: 'late overwrite' } });
  await tick(); h.render();
  const retained = h.find(node => node.type === 'EditingStudio');
  assert.equal(retained.key, editor.key, 'existing editor instance and its local undo history stay mounted');
  assert.equal(retained.props.projectBinding.initialContent, editor.props.projectBinding.initialContent, 'initial snapshot must not be replaced');
  h.find(node => node.type === 'button' && node.props.children === '保存报告与 PPT').props.onClick();
  assert.equal(f.payload.content.title, 'preserved unsaved content'); await tick();
});

test('history second read cannot apply after its permission epoch is revoked', async () => {
  const f = loadHarness(), { h } = f, history = deferred();
  h.render(f.props); await tick(); h.render();
  const initial = h.find(node => node.type === 'EditingStudio').props.projectBinding.initialContent;
  f.setRead(url => url.endsWith('/history') ? history.promise : { id: 'head', revision: 1, content: f.initial });
  h.find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children[0] === 'v').props.onClick();
  await tick(); h.render({ ...f.props, writable: false });
  history.resolve({ id: 'history', revision: 1, content: { ...f.initial, title: 'late history' } }); await tick(); h.render();
  assert.equal(h.find(node => node.type === 'EditingStudio').props.projectBinding.initialContent, initial);
});

test('stale cloud load callback cannot start after downgrade and restored access', async () => {
  const f = loadHarness(), { h } = f;
  h.render(f.props); await tick(); h.render();
  const stale = h.find(node => node.type === 'button' && node.props.children === '载入最新版本').props.onClick;
  h.render({ ...f.props, writable: false }); h.render(f.props);
  const reads = f.requests.length; stale(); await tick(); assert.equal(f.requests.length, reads);
});

test('current viewer can deliberately load a cloud report without write capability', async () => {
  const f = loadHarness(true), { h } = f;
  h.render(f.props); await tick(); h.render();
  f.setRead(() => ({ id: 'new-head', revision: 2, content: { ...f.initial, title: 'viewer selected cloud' } }));
  h.find(node => node.type === 'button' && node.props.children === '载入最新版本').props.onClick(); await tick(); h.render();
  const binding = h.find(node => node.type === 'EditingStudio').props.projectBinding;
  assert.equal(binding.readOnly, true); assert.equal(binding.initialContent.title, 'viewer selected cloud'); assert.equal(f.payload, undefined);
});
