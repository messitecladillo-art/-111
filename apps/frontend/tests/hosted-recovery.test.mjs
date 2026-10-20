import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as shared from '../../../packages/evi-x-shared/src/index.ts';
import * as library from '../lib/questionnaire-library.ts';
import * as editor from '../lib/editor-model.ts';
import * as reports from '../lib/project-report.ts';
import * as collection from '../lib/survey-collection.ts';
import * as research from '../lib/research-flow.ts';
import * as mapping from '../lib/questionnaire-mapping.ts';
import * as topicApi from '../lib/topic-questionnaire-api.ts';
import { externalStoreHook, workbenchHookModule } from './helpers/workbench-test-harness.mjs';
import { hostedReportHookModule } from './helpers/hosted-report-hook.mjs';
import { createReportPermissionGuard } from '../lib/report-permission.ts';
import { REPORT_READ_OPTIONS } from '../lib/report-persistence.ts';
import { questionnaireRepositoryModule, questionnairePersistence } from './helpers/questionnaire-repository.mjs';

import { DEFAULT_REPORT_SETTINGS } from '../lib/report-format.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const editingStudioBoundary = { default: 'EditingStudio', createReportPermissionGuard };
const projectId = 'a51fd4b9-7672-491b-9251-dea7809cfc8a';
const requestId = '49e8b234-6365-4916-a6d4-fc4e7930af34';
const timestamp = '2026-10-11T00:00:00Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

// Execute the production event handlers and effects with controlled asynchronous receipts.
// This verifies state transitions; browser rendering and focus have separate acceptance checks.
function mount(relative, mocks, props, internalExport, globals = {}) {
  let cells = [], index = 0, effects = [], dirty = true, tree;
  const hooks = {
    useState(initial) { const at = index++; if (!cells[at]) cells[at] = { value: typeof initial === 'function' ? initial() : initial }; return [cells[at].value, value => { const next = typeof value === 'function' ? value(cells[at].value) : value; if (!Object.is(next, cells[at].value)) { cells[at].value = next; dirty = true; } }]; },
    useRef(initial) { const at = index++; return (cells[at] ??= { current: initial }); },
    useMemo(fn, deps) { const at = index++; if (!cells[at] || !sameDeps(cells[at].deps, deps)) cells[at] = { value: fn(), deps }; return cells[at].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const at = index++; if (!cells[at] || !sameDeps(cells[at].deps, deps)) { const before = cells[at]; cells[at] = { deps }; effects.push(() => { before?.cleanup?.(); cells[at].cleanup = fn(); }); } },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  hooks.useSyncExternalStore = externalStoreHook(hooks, () => { dirty = true; });
  const jsx = (type, props, key) => ({ type, props, key });
  const imports = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/workbench/useWorkbenchHandoffs': workbenchHookModule(hooks), ...mocks };
  if (relative.endsWith('/HostedProject.tsx')) { imports['./questionnaire-repository'] = questionnaireRepositoryModule({ contract: imports['@/lib/topic-questionnaire-api'] }); imports['@/lib/questionnaire-persistence'] = questionnairePersistence; }
  if (relative.endsWith('/HostedReport.tsx')) imports['./useHostedReport'] = hostedReportHookModule(hooks, { auth: imports['./HostedSession'], api: imports['./api-client'], globals });
  const source = fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const box = { exports: {}, require: name => { assert.ok(name in imports, `Unmocked boundary: ${name}`); return imports[name]; }, console, crypto, structuredClone, JSON, queueMicrotask, window: { confirm: () => true }, location: { reload() {} }, ...globals };
  vm.runInNewContext(compiled + (internalExport ? `\nexports.__tested = ${internalExport};` : ''), box);
  const component = internalExport ? box.exports.__tested : box.exports.default;
  return {
    async settle() { for (let cycle = 0; cycle < 30; cycle++) { index = 0; dirty = false; tree = component(props); const queued = effects; effects = []; for (const effect of queued) effect(); await tick(); if (!dirty && !effects.length) return; } throw Error('Component did not settle within 30 effect cycles'); },
    get tree() { return tree; },
    unmount() { for (const cell of cells) cell.cleanup?.(); cells = []; },
  };
}
function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
function button(screen, text) { const found = nodes(screen.tree).find(n => n.type === 'button' && n.props.children === text); assert.ok(found, `Missing button: ${text}`); return found; }
class HostedApiError extends Error { constructor(status, code = 'request_failed') { super(`HTTP ${status}`); this.status = status; this.code = code; } }

function questionnaireScreen({ invalidCurrent = false, denied = false, tab } = {}) {
  const oldDesign = shared.newQuestionnaire(), submitted = { ...oldDesign, title: '已提交问卷' };
  const local = { ...submitted, title: '等待回执时的新编辑' };
  const head = { id: projectId, projectId, revision: 1, design: oldDesign, updatedAt: timestamp };
  const latest = { ...head, id: requestId, revision: 2, design: submitted };
  const pending = { design: submitted, expectedRevision: 1, idempotencyKey: requestId };
  let cache, resolveSave, calls = [], reads = 0;
  const auth = { session: { user: { id: projectId }, mode: 'local_test' }, identityEpoch:1,isCurrentAccount:()=>true,getDraft: () => ({ head, initial: oldDesign, snapshot: { design: local, pending: invalidCurrent }, pendingSave: pending, saveUncertain: false, tab }), cacheDraft: (_key, value) => { cache = value; }, setUnsaved() {}, mutate: (_path, body) => { calls.push(body); return new Promise((resolve, reject) => { resolveSave = () => denied ? reject(new HostedApiError(403)) : resolve(latest); }); } };
  const api = { HostedApiError, errorMessage: e => e.message, downloadQuestionnaire() {}, hostedRequest: async url => { reads++; if(url.endsWith('/topic-binding')){return{versionId:url.split('/').at(-2),binding:null,bindingHash:null,designTransferHash:'a'.repeat(64)};} if (url.endsWith('/questionnaire')) return { questionnaire: latest }; if (url.endsWith('/versions')) return { versions: [], nextBeforeRevision: null }; if (url === '/api/services') return { services: [] }; if (url.endsWith('/proposals')) return { proposals: [] }; return { project: { id: projectId, title: '合成项目', teamId: projectId, revision: 1, createdAt: timestamp }, membershipRole: 'owner' }; } };
  const screen = mount('../components/hosted/HostedProject.tsx', {
    'next/link': { default: 'a' }, 'next/dynamic': { default: () => 'DynamicComponent' }, '@evix/shared': shared, '@/lib/questionnaire-library': library,
    '@/lib/questionnaire-mapping':mapping,'@/components/topic-advisor/TopicQuestionnaireProposal':{default:'TopicQuestionnaireProposal'},'@/lib/topic-questionnaire-api':{...topicApi,verifyTopicBindingReceipt:async raw=>raw},
    './api-client': api, './HostedFrame': { LoginRequired: 'LoginRequired' }, './HostedSession': { useHostedSession: () => auth }, './HostedMembers': { default: 'HostedMembers' },
    '../research-view/ResearchViewHost': { default: 'ResearchViewHost' },
    './silicon-runner': { serviceNames: () => new Map(), createSiliconRunner: () => null }, '@/components/motion/useWorkspaceMotion': { useContentReveal: () => null, useKeyedListMotion: () => null },
  }, { projectId }, 'ProjectEditor');
  return { screen, pending, latest, local, get cache() { return cache; }, get calls() { return calls; }, get reads() { return reads; }, resolve: () => resolveSave() };
}

test('each cached lazy project tab remounts its content instead of restoring an empty panel', async () => {
  for (const tab of ['topic', 'silicon', 'collection', 'analysis', 'report', 'defense']) {
    const s = questionnaireScreen({ tab }); await s.screen.settle();
    assert.equal(s.cache.tab, tab);
    const activePanels = nodes(s.screen.tree).filter(node => node.type === 'div' && node.props.hidden === false && nodes(node.props.children).some(child => child.type === 'DynamicComponent'));
    assert.equal(activePanels.length, 1, `cached ${tab} must have a mounted active editor`);
    assert.equal(s.cache.snapshot.design.title, s.local.title, 'restoring a tab keeps the questionnaire draft');
    s.screen.unmount();
  }
});

test('questionnaire recovers the exact pending save despite a newer head and invalid current edit', async () => {
  const s = questionnaireScreen({ invalidCurrent: true }); await s.screen.settle();
  assert.equal(button(s.screen, '载入最新云端版本').props.disabled, true);
  const readCount = s.reads;
  button(s.screen, '载入最新云端版本').props.onClick(); await tick(); assert.equal(s.reads, readCount, 'handler also refuses to abandon unknown save');
  button(s.screen, '核对并重试原保存').props.onClick(); await tick();
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0], s.pending, 'retry retains original payload and idempotency key');
  s.resolve(); await s.screen.settle();
  assert.equal(s.cache.pendingSave, null); assert.equal(s.cache.saveUncertain, false); assert.equal(s.cache.conflict, false); assert.equal(s.cache.head.revision, 2);
  assert.equal(s.cache.snapshot.design.title, s.local.title); assert.equal(s.cache.snapshot.pending, true, 'receipt must not replace local invalid input');
  s.screen.unmount();
});

test('questionnaire late save receipt keeps edits made while the retry was in flight', async () => {
  const s = questionnaireScreen(); await s.screen.settle(); button(s.screen, '核对并重试原保存').props.onClick(); await tick();
  const studio = nodes(s.screen.tree).find(n => n.props?.hosted);
  studio.props.onSnapshot({ design: { ...s.local, title: '保存中继续输入' }, pending: false });
  s.resolve(); await s.screen.settle();
  assert.equal(s.cache.snapshot.design.title, '保存中继续输入'); assert.equal(s.cache.head.design.title, '已提交问卷'); assert.equal(s.cache.pendingSave, null);
  s.screen.unmount();
});

test('questionnaire permission rejection on an uncertain replay retains the original request and local draft', async () => {
  const s = questionnaireScreen({ denied: true }); await s.screen.settle(); button(s.screen, '核对并重试原保存').props.onClick(); await tick(); s.resolve(); await s.screen.settle();
  assert.equal(s.cache.pendingSave, s.pending); assert.equal(s.cache.saveUncertain, true); assert.equal(s.cache.snapshot.design.title, s.local.title); assert.equal(s.cache.head.revision, 1);
  s.screen.unmount();
});

test('report pending retry resolves a newer head and preserves edits made before the receipt', async () => {
  const content = editor.createEditorContent(), submitted = { ...content, subtitle: '已提交报告' };
  const old = { id: projectId, projectId, revision: 1, title: content.title, updatedAt: timestamp, content };
  const latest = { ...old, revision: 2, content: submitted };
  const pending = { content: submitted, expectedRevision: 1, idempotencyKey: requestId };
  let cache, resolveSave, body;
  const auth = { session: { user: { id: projectId } }, getDraft: () => ({ content: submitted, head: old, pending, conflict: false }), cacheDraft: (_key, value) => { cache = value; }, setUnsaved() {}, mutate: (_path, request) => { body = request; return new Promise(resolve => { resolveSave = resolve; }); } };
  const screen = mount('../components/hosted/HostedReport.tsx', {
    '../editors/EditingStudio': editingStudioBoundary, '@/lib/editor-model': editor, '@/lib/project-report': reports,
    './api-client': { hostedRequest: async url => url.endsWith('/versions') ? { versions: [], nextBeforeRevision: null } : { report: latest }, errorMessage: e => e.message, HostedApiError }, './HostedSession': { useHostedSession: () => auth },
  }, { projectId, title: content.title, writable: true, proposal: null, onProposalConsumed() {} });
  await screen.settle(); assert.equal(button(screen, '载入最新版本').props.disabled, true); assert.equal(button(screen, '核对并重试原保存').props.disabled, false);
  button(screen, '核对并重试原保存').props.onClick(); await tick(); assert.equal(body, pending);
  nodes(screen.tree).find(n => n.props?.projectBinding).props.projectBinding.onSnapshot({ ...submitted, subtitle: '保存中新增段落' });
  resolveSave(latest); await screen.settle();
  assert.equal(cache.content.subtitle, '保存中新增段落'); assert.equal(cache.head.revision, 2); assert.equal(cache.pending, null); assert.equal(cache.conflict, false);
  screen.unmount();
});

test('report format save receipt clears dirty status but later edits remain unsaved',async()=>{
  const initial=editor.createEditorContent();
  let head={id:projectId,projectId,revision:1,title:initial.title,updatedAt:timestamp,content:initial};
  let finishSave,request,cache,unsaved;
  const auth={session:{user:{id:projectId}},getDraft:()=>undefined,cacheDraft:(_key,value)=>{cache=value;},setUnsaved:(_key,value)=>{unsaved=value;},mutate:(_path,body)=>{request=body;return new Promise(resolve=>{finishSave=()=>{const saved=editor.parseEditorContent(body.content);if(saved.reportFormat)saved.reportFormat.options=Object.fromEntries(Object.entries(saved.reportFormat.options).reverse());head={...head,revision:head.revision+1,content:saved};resolve(head);};});}};
  const screen=mount('../components/hosted/HostedReport.tsx',{
    '../editors/EditingStudio':editingStudioBoundary,'@/lib/editor-model':editor,'@/lib/project-report':reports,
    './api-client':{hostedRequest:async url=>url.endsWith('/versions')?{versions:[],nextBeforeRevision:null}:{report:head},errorMessage:e=>e.message,HostedApiError},'./HostedSession':{useHostedSession:()=>auth},
  },{projectId,title:initial.title,writable:true,proposal:null,onProposalConsumed(){}});
  const binding=()=>nodes(screen.tree).find(n=>n.props?.projectBinding).props.projectBinding;
  await screen.settle();
  const formatted={...initial,reportFormat:structuredClone(DEFAULT_REPORT_SETTINGS)};
  formatted.reportFormat.options.firstLineChars=0;
  binding().onSnapshot(formatted);await screen.settle();
  button(screen,'保存报告与 PPT').props.onClick();await tick();finishSave();await screen.settle();
  assert.equal(request.content.reportFormat.options.firstLineChars,0);
  assert.equal(binding().status,'云端 v2');assert.equal(unsaved,false);
  assert.equal(button(screen,'保存报告与 PPT').props.disabled,true);
  assert.equal(cache.content,formatted,'receipt must keep the original editor object');
  const next={...formatted,subtitle:'第二次保存'};
  binding().onSnapshot(next);await screen.settle();button(screen,'保存报告与 PPT').props.onClick();await tick();
  const late={...next,title:'等待回执时继续编辑'};
  binding().onSnapshot(late);finishSave();await screen.settle();
  assert.equal(binding().status,'有未保存修改');assert.equal(unsaved,true);assert.equal(cache.content.title,late.title);
  binding().onSnapshot({...late,title:''});await screen.settle();assert.equal(binding().status,'有未保存修改');
  screen.unmount();
});

function reportLifecycleScreen({ mutate, read } = {}) {
  const initial = editor.createEditorContent();
  let head = { id: requestId, projectId, revision: 1, title: initial.title, updatedAt: timestamp, content: initial }, cache;
  const writes = [], reads = [];
  const auth = {
    session: { user: { id: projectId } }, getDraft: () => undefined,
    cacheDraft: (_key, value) => { cache = value; }, setUnsaved() {},
    mutate: async (url, body, method, options) => {
      writes.push({ url, body, method, options });
      if (mutate) return mutate(body, { head, write: writes.length, setHead: value => { head = value; } });
      head = { ...head, id: projectId, revision: body.expectedRevision + 1, title: body.content.title, content: body.content };
      return head;
    },
  };
  const screen = mount('../components/hosted/HostedReport.tsx', {
    '../editors/EditingStudio': editingStudioBoundary,
    './HostedSession': { useHostedSession: () => auth },
    './api-client': {
      errorMessage: value => value.message, HostedApiError,
      hostedRequest: async (url, options) => {
        reads.push({ url, options });
        if (read) { const value = await read(url, { head, reads, writes }); if (value !== undefined) return value; }
        return url.endsWith('/versions') ? { versions: [], nextBeforeRevision: null } : { report: head };
      },
    },
  }, { projectId, title: initial.title, writable: true, proposal: null, onProposalConsumed() {} });
  return {
    screen, initial, writes, reads,
    get cache() { return cache; },
    binding: () => nodes(screen.tree).find(n => n.props?.projectBinding).props.projectBinding,
    edit(value) { nodes(screen.tree).find(n => n.props?.projectBinding).props.projectBinding.onSnapshot(value); },
  };
}

test('report saves one frozen request and reads full versions with the report-sized receipt limit', async () => {
  const fixture = reportLifecycleScreen(), { screen } = fixture;
  await screen.settle();
  const changed = { ...fixture.initial, title: '完整报告读取边界' };
  fixture.edit(changed); await screen.settle();
  button(screen, '保存报告与 PPT').props.onClick(); await screen.settle();
  assert.equal(fixture.writes.length, 1);
  const write = fixture.writes[0];
  assert.equal(write.method, 'POST'); assert.equal(write.options, REPORT_READ_OPTIONS);
  assert.equal(Object.isFrozen(write.body), true); assert.equal(Object.isFrozen(write.body.content.report), true);
  assert.notEqual(write.body.content, changed); assert.equal(Object.isFrozen(changed), false);
  for (const request of fixture.reads.filter(value => value.url.endsWith('/report'))) assert.equal(request.options, REPORT_READ_OPTIONS);
  button(screen, '载入最新版本').props.onClick(); await screen.settle();
  assert.equal(fixture.reads.at(-1).options, REPORT_READ_OPTIONS);
  screen.unmount();
});

test('report full historical version reads use the same report-sized receipt limit', async () => {
  const fixture = reportLifecycleScreen({ read(url, { head }) {
    if (url.endsWith('/versions')) return { versions: [Object.fromEntries(Object.entries(head).filter(([key]) => key !== 'content'))], nextBeforeRevision: null };
    if (url.endsWith(`/versions/${requestId}`)) return head;
  } });
  await fixture.screen.settle();
  nodes(fixture.screen.tree).find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children[0] === 'v').props.onClick();
  await fixture.screen.settle();
  const read = fixture.reads.find(value => value.url.endsWith(`/versions/${requestId}`));
  assert.ok(read); assert.equal(read.options, REPORT_READ_OPTIONS);
  fixture.screen.unmount();
});

test('a different history version receipt cannot replace the current draft or remount its editor', async () => {
  const fixture = reportLifecycleScreen({ read(url, { head }) {
    if (url.endsWith('/versions')) return { versions: [Object.fromEntries(Object.entries(head).filter(([key]) => key !== 'content'))], nextBeforeRevision: null };
    if (url.endsWith(`/versions/${requestId}`)) return { ...head, id: projectId, content: { ...head.content, subtitle: '错误历史内容' } };
  } });
  await fixture.screen.settle();
  const current = { ...fixture.initial, subtitle: '当前草稿' };
  fixture.edit(current); await fixture.screen.settle();
  const original = nodes(fixture.screen.tree).find(value => value.props?.projectBinding);
  nodes(fixture.screen.tree).find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children[0] === 'v').props.onClick();
  await fixture.screen.settle();
  const retained = nodes(fixture.screen.tree).find(value => value.props?.projectBinding);
  assert.equal(retained.key, original.key); assert.equal(retained.props.projectBinding.initialContent, original.props.projectBinding.initialContent);
  assert.equal(fixture.cache.content, current); assert.equal(fixture.cache.pending, null);
  assert.equal(fixture.binding().status, '有未保存修改');
  assert.ok(nodes(fixture.screen.tree).some(value => value.props?.role === 'alert'));
  fixture.screen.unmount();
});

test('late original report history cannot replace a catalogue refreshed after saving', async () => {
  let resolveOld, historyCalls = 0;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const fixture = reportLifecycleScreen({ read(url, { head }) {
    if (!url.endsWith('/versions')) return;
    if (++historyCalls === 1) return old;
    return { versions: [Object.fromEntries(Object.entries(head).filter(([key]) => key !== 'content'))], nextBeforeRevision: null };
  } });
  await fixture.screen.settle();
  fixture.edit({ ...fixture.initial, subtitle: '新版本目录' }); await fixture.screen.settle();
  button(fixture.screen, '保存报告与 PPT').props.onClick(); await fixture.screen.settle();
  const oldSummary = { id: requestId, projectId, revision: 1, title: fixture.initial.title, updatedAt: timestamp };
  resolveOld({ versions: [oldSummary], nextBeforeRevision: 1 }); await fixture.screen.settle();
  const versions = nodes(fixture.screen.tree).filter(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children[0] === 'v');
  assert.equal(versions.length, 1); assert.equal(versions[0].props.children[1], 2);
  assert.equal(nodes(fixture.screen.tree).some(node => node.type === 'button' && node.props.children === '读取更早版本'), false);
  fixture.screen.unmount();
});

for (const fault of ['different-content', 'wrong-successor', 'different-head', 'head-403', 'head-404', 'invalid-post-receipt']) {
  test(`report ${fault} retains the exact original pending request until a verified retry`, async () => {
    let failed = false;
    const fixture = reportLifecycleScreen({
      mutate(body, state) {
        const receipt = { ...state.head, id: projectId, revision: body.expectedRevision + 1, title: body.content.title, content: body.content };
        state.setHead(receipt);
        if (!failed && fault === 'invalid-post-receipt') { failed = true; throw new HostedApiError(400, 'invalid_server_receipt'); }
        if (!failed && fault === 'different-content') { failed = true; return { ...receipt, content: { ...body.content, subtitle: '不是提交内容' } }; }
        if (!failed && fault === 'wrong-successor') { failed = true; return { ...receipt, revision: receipt.revision + 1 }; }
        return receipt;
      },
      read(url, { head, writes }) {
        if (!failed && writes.length && url.endsWith('/report')) {
          failed = true;
          if (fault === 'head-403' || fault === 'head-404') throw new HostedApiError(Number(fault.slice(5)));
          if (fault === 'different-head') return { report: { ...head, id: requestId } };
        }
      },
    });
    await fixture.screen.settle();
    const local = { ...fixture.initial, subtitle: '尚未提交的新报告' };
    fixture.edit(local); await fixture.screen.settle();
    button(fixture.screen, '保存报告与 PPT').props.onClick(); await fixture.screen.settle();
    const original = fixture.writes[0].body;
    assert.equal(fixture.cache.pending, original);
    assert.equal(fixture.binding().status, '保存结果待核对');
    assert.equal(button(fixture.screen, '载入最新版本').props.disabled, true);
    const current = { ...local, subtitle: '核对期间继续输入' };
    fixture.edit(current); await fixture.screen.settle();
    button(fixture.screen, '核对并重试原保存').props.onClick(); await fixture.screen.settle();
    assert.equal(fixture.writes[1].body, original, 'retry must not substitute the newer edit or key');
    assert.equal(fixture.cache.pending, null); assert.equal(fixture.cache.head.revision, 2);
    assert.equal(fixture.cache.content, current); assert.equal(fixture.binding().status, '有未保存修改');
    fixture.screen.unmount();
  });
}

for (const status of [403, 409]) {
  test(`report definite POST ${status} resolves uncertainty while retaining the local draft`, async () => {
    const fixture = reportLifecycleScreen({ mutate: () => { throw new HostedApiError(status); } });
    await fixture.screen.settle();
    const changed = { ...fixture.initial, subtitle: '保留被拒绝的编辑' };
    fixture.edit(changed); await fixture.screen.settle();
    button(fixture.screen, '保存报告与 PPT').props.onClick(); await fixture.screen.settle();
    assert.equal(fixture.cache.pending, null); assert.equal(fixture.cache.content, changed);
    assert.equal(fixture.cache.conflict, status === 409);
    assert.equal(fixture.binding().status, status === 409 ? '云端版本已变化' : '有未保存修改');
    fixture.screen.unmount();
  });
}

test('public survey retries its frozen payload after timeout, reload and closure, then reuses its receipt', async () => {
  const token = 'a'.repeat(43), storage = new Map(), requests = [];
  let closed = false, timedOut = false;
  const survey = { id: projectId, status: 'open', title: '合成验收', introduction: '请填写测试数字', classification: 'synthetic', questions: [{ id: 'score', text: '分数', type: 'number', required: true, choices: [], min: 0, max: 100, minLabel: '', maxLabel: '', condition: null }] };
  const receipt = { id: requestId, releaseId: projectId, submittedAt: timestamp, classification: 'synthetic' };
  const mocks = {
    '@/components/hosted/api-client': { HostedApiError, errorMessage: e => e.message, hostedRequest: async (_path, options) => { if (options?.method !== 'POST') return { ...survey, status: closed ? 'closed' : 'open' }; requests.push(structuredClone(options.body)); if (!timedOut) { timedOut = true; throw Error('Synthetic lost receipt'); } return receipt; } },
    '@/lib/survey-collection': collection, './PublicSurvey.module.css': { default: {} },
  };
  const globals = { AbortController, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, window: { addEventListener() {}, removeEventListener() {} }, document: { getElementById: () => null } };
  let screen = mount('../components/survey/PublicSurvey.tsx', mocks, { token }, undefined, globals); await screen.settle();
  nodes(screen.tree).find(n => n.type === 'input' && n.props['aria-label'] === '分数').props.onChange({ target: { value: '0' } });
  nodes(screen.tree).find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  await screen.settle(); nodes(screen.tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await screen.settle();
  assert.equal(requests.length, 1); assert.deepEqual(requests[0].answers, { score: 0 });
  assert.equal(nodes(screen.tree).find(n => n.type === 'fieldset').props.disabled, true);
  const pending = JSON.parse(storage.get(`evix.survey-response.v1:${token}`)).pending; assert.deepEqual(pending, requests[0]);
  screen.unmount(); closed = true;
  screen = mount('../components/survey/PublicSurvey.tsx', mocks, { token }, undefined, globals); await screen.settle();
  assert.equal(nodes(screen.tree).find(n => n.type === 'fieldset').props.disabled, true);
  assert.equal(nodes(screen.tree).find(n => n.type === 'input' && n.props['aria-label'] === '分数').props.value, '0');
  nodes(screen.tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await screen.settle();
  assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0], 'reload must retain exact payload and idempotency key');
  assert.ok(nodes(screen.tree).some(n => n.type === 'h1' && n.props.children === '回答已收到'));
  screen.unmount(); screen = mount('../components/survey/PublicSurvey.tsx', mocks, { token }, undefined, globals); await screen.settle();
  assert.ok(nodes(screen.tree).some(n => n.type === 'h1' && n.props.children === '回答已收到')); assert.equal(requests.length, 2, 'known receipt needs no new submission');
  screen.unmount();
});

test('collection ignores a late dataset after the user selects another frozen release', async () => {
  const secondId = 'fa0e29fa-64bf-4dc5-8d1b-7cb695782b8e';
  const first = { id: projectId, projectId, versionId: requestId, questionnaireRevision: 1, revision: 1, status: 'open', token: 'a'.repeat(43), title: '旧问卷', classification: 'actual', responseCount: 1, responseBytes: 10, limits: { responses: 5000, answerBytes: 2097152 }, createdAt: timestamp, closedAt: null };
  const second = { ...first, id: secondId, token: 'b'.repeat(43), questionnaireRevision: 2, title: '新问卷' };
  const design = shared.newQuestionnaire();
  const dataset = { schema: 'survey-dataset/v1', release: first, design, rowCount: 1, sha256: 'a'.repeat(64), generatedAt: timestamp, columns: [{ column: '__response_id', questionId: null, kind: 'metadata' }, { column: 'Q1', questionId: 'initial-question', kind: 'answer' }, { column: '__shown_initial-question', questionId: 'initial-question', kind: 'visibility' }], csv: '__response_id,Q1,__shown_initial-question\r\nr1,1,1\r\n', downloadCsv: '__response_id,Q1,__shown_initial-question\r\nr1,1,1\r\n' };
  let resolveRead; const transfers = [];
  const auth = { session: { user: { id: projectId } }, getDraft: () => undefined, cacheDraft() {} };
  const screen = mount('../components/survey/SurveyCollection.tsx', {
    '@/components/hosted/HostedSession': { useHostedSession: () => auth }, '@/lib/survey-collection': collection, './SurveyCollection.module.css': { default: {} },
    '@/components/hosted/api-client': { HostedApiError, errorMessage: e => e.message, hostedRequest: url => url.endsWith('/dataset') ? new Promise(resolve => { resolveRead = resolve; }) : Promise.resolve({ surveys: [first, second] }) },
  }, { projectId, savedRevision: 2, canPublish: true, writable: true, onAnalyze: value => transfers.push(value) }, undefined, { queueMicrotask, location: { origin: 'https://example.test' } });
  await screen.settle(); button(screen, '带入数据分析 →').props.onClick(); await screen.settle();
  nodes(screen.tree).find(n => n.type === 'button' && n.key === secondId).props.onClick(); await screen.settle();
  resolveRead(dataset); await screen.settle();
  assert.equal(transfers.length, 0, 'a response for the previous selection must not replace the analysis dataset');
  assert.equal(nodes(screen.tree).find(n => n.type === 'button' && n.key === secondId).props['aria-pressed'], true);
  screen.unmount();
});

test('hosted collection evidence uses the same provenance and numbers in preview, download and report proposal', async () => {
  const input = { version: 1, sourceHash: 'a'.repeat(64), classification: 'simulated', question: '合成频数', variables: ['Q1'], missingCodes: [], total: 5, n: 5, calculation: { method: 'frequency', counts: [2, 3], column: 0 } };
  const origin = { kind: 'collection', projectId, releaseId: requestId, versionId: requestId, questionnaireRevision: 2, classification: 'synthetic', snapshotHash: 'b'.repeat(64), generatedAt: timestamp, design: shared.newQuestionnaire() };
  let blob, proposal, identityPending;
  const screen = mount('../components/analysis/ResearchFlow.tsx', {
    '@/lib/editor-model': editor, '@/lib/research-flow': research, '@/lib/project-report': { ...reports, evidenceSectionId: value => (identityPending = reports.evidenceSectionId(value)) }, '@/lib/editor-recovery': {}, './ResearchFlow.module.css': { default: {} },
  }, { candidates: [{ key: 'result', input, label: '合成结果' }], onEvidenceProposal: value => { proposal = value; }, transformSection: section => collection.collectionEvidenceSection(section, origin) }, 'LocalEvidenceSummary', {
    Blob, URL: { createObjectURL: value => { blob = value; return 'blob:synthetic-test'; }, revokeObjectURL() {} }, document: { createElement: () => ({ click() {} }) }, setTimeout: callback => { callback(); },
  });
  await screen.settle(); nodes(screen.tree).find(n => n.type === 'select').props.onChange({ target: { value: 'result' } }); await screen.settle(); await identityPending; await screen.settle();
  const displayedBody = nodes(screen.tree).find(n => n.type === 'p' && typeof n.props.children === 'string' && n.props.children.includes('发布 v2')).props.children;
  const displayedSource = nodes(screen.tree).find(n => n.type === 'pre').props.children;
  assert.ok(displayedBody.includes('2 / 5')); assert.ok(displayedBody.includes('60.00%')); assert.ok(!displayedBody.includes('未读取原始答卷'));
  assert.ok(displayedSource.includes(origin.snapshotHash)); assert.ok(displayedSource.includes('来源分类：合成验收'));
  button(screen, '下载统计证据提案').props.onClick(); const downloaded = JSON.parse(await blob.text());
  assert.equal(button(screen, '预览并加入项目报告').props.disabled, false); button(screen, '预览并加入项目报告').props.onClick();
  assert.equal(downloaded.proposal.body, displayedBody); assert.equal(proposal.body, displayedBody); assert.equal(downloaded.proposal.source, displayedSource); assert.equal(proposal.source, displayedSource);
  assert.deepEqual(downloaded.input, input); assert.match(proposal.id, /^evidence-/);
  screen.unmount();
});
