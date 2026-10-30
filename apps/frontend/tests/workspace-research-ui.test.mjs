import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as questionnaire from '../lib/questionnaire.ts';
import * as library from '../lib/questionnaire-library.ts';
import * as mapping from '../lib/questionnaire-mapping.ts';
import * as revision from '../lib/questionnaire-revision.ts';
import * as journey from '../lib/analysis-journey.ts';
import * as survey from '../lib/survey-analysis.ts';

// Production handlers and effects; native focus, IME and layout need browser acceptance.
const ts = createRequire(import.meta.url)('typescript');
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const label = n => n == null ? '' : Array.isArray(n) ? n.map(label).join('') : typeof n === 'object' ? label(n.props?.children) : String(n);
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const styles = { default: new Proxy({}, { get: (_, key) => key }) };
const motion = { useContentReveal: () => null, useKeyedListMotion: () => null };
const tick = () => new Promise(resolve => setImmediate(resolve));
function button(screen, name) {
  const found = nodes(screen.tree).find(n => n.type === 'button' && label(n) === name);
  assert.ok(found, `Missing button: ${name}`);
  return found;
}
function mount(relative, imports, initialProps = {}) {
  let props = initialProps, cells = [], index = 0, effects = [], dirty = true, tree;
  const hooks = {
    useState(init) { const at = index++; if (!cells[at]) cells[at] = { value: typeof init === 'function' ? init() : init }; return [cells[at].value, next => { next = typeof next === 'function' ? next(cells[at].value) : next; if (!Object.is(next, cells[at].value)) { cells[at].value = next; dirty = true; } }]; },
    useRef(init) { const at = index++; return cells[at] ??= { current: init }; },
    useMemo(fn, deps) { const at = index++; if (!cells[at] || !sameDeps(cells[at].deps, deps)) cells[at] = { value: fn(), deps }; return cells[at].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const at = index++; if (!cells[at] || !sameDeps(cells[at].deps, deps)) { const old = cells[at]; cells[at] = { deps }; effects.push(() => { old?.cleanup?.(); cells[at].cleanup = fn(); }); } },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  const jsx = (type, props, key) => ({ type, props, key });
  const mocks = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/motion/useWorkspaceMotion': motion, ...imports };
  const compiled = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  class Element {}
  const box = { exports: {}, require: name => { assert.ok(name in mocks, `Unmocked ${name}`); return mocks[name]; }, JSON, crypto, structuredClone, console, TextDecoder, TextEncoder, HTMLElement: Element, Node: Element, document: { activeElement: null, addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null }, window: { confirm: () => true, addEventListener() {}, removeEventListener() {}, location: { hash: '' }, setTimeout, clearTimeout } };
  vm.runInNewContext(compiled, box);
  return {
    get tree() { return tree; }, get props() { return props; }, update(next) { props = { ...props, ...next }; },
    async settle() { for (let n = 0; n < 40; n++) { index = 0; dirty = false; tree = box.exports.default(props); const queue = effects; effects = []; queue.forEach(f => f()); await tick(); if (!dirty && !effects.length) return; } throw Error('Unstable effects'); },
    unmount() { cells.forEach(c => c.cleanup?.()); },
  };
}

function journeyScreen(props = {}) {
  return mount('../components/analysis/AnalysisJourney.tsx', { '@/lib/analysis-journey': journey, './AnalysisJourney.module.css': styles }, { reading: false, readPhase: 'reading', readName: '', dataset: null, importError: '', setupIssue: '', setupTarget: 'data', modules: [], activeId: null, onNavigate() {}, ...props });
}

test('empty analysis progress is compact, real activity opens it, and manual collapse is retained', async () => {
  const screen = journeyScreen(); await screen.settle();
  assert.equal(screen.tree.props['data-expanded'], false);
  assert.equal(nodes(screen.tree).some(n => n.props?.['aria-label'] === '分析当前动态'), false);
  screen.update({ reading: true, readName: 'actual.csv' }); await screen.settle();
  assert.equal(screen.tree.props['data-expanded'], true);
  assert.match(label(screen.tree), /正在读取文件actual.csv/);
  button(screen, '暂停动效').props.onClick(); await screen.settle();
  assert.equal(screen.tree.props['data-paused'], true);
  button(screen, '收起进度').props.onClick(); await screen.settle();
  screen.update({ reading: false, dataset: { rowCount: 17, columnCount: 4 } }); await screen.settle();
  assert.equal(screen.tree.props['data-expanded'], false, 'new data does not override a manual collapse');
  button(screen, '查看进度').props.onClick(); await screen.settle();
  assert.match(label(screen.tree), /17 行记录，4 个字段/);
  assert.equal(nodes(screen.tree).some(n => n.props?.className === 'resultsCount'), false, 'no invented zero-result dashboard before modules exist');
  screen.unmount();
});

test('only focused engagement pins automatically opened progress across read cancellation or failure', async () => {
  const untouched = journeyScreen({ reading: true }); await untouched.settle();
  untouched.update({ reading: false }); await untouched.settle();
  assert.equal(untouched.tree.props['data-expanded'], false, 'automatic activity alone does not pin the panel');
  untouched.unmount();
  for (const importError of ['', 'invalid CSV']) {
    const screen = journeyScreen({ reading: true }); await screen.settle();
    // React focus capture fires when a descendant receives keyboard or pointer focus.
    // Keeping the panel open preserves both Pause and the data-entry station.
    screen.tree.props.onFocusCapture(); await screen.settle();
    screen.update({ reading: false, importError }); await screen.settle();
    assert.equal(screen.tree.props['data-expanded'], true);
    assert.ok(button(screen, '暂停动效'));
    assert.equal(nodes(screen.tree).find(n => n.props?.className === 'body').props.hidden, false);
    button(screen, '收起进度').props.onClick(); await screen.settle();
    screen.tree.props.onFocusCapture(); await screen.settle();
    screen.update({ reading: true }); await screen.settle();
    assert.equal(screen.tree.props['data-expanded'], false, 'focusing the persistent toggle does not undo an explicit collapse');
    screen.unmount();
  }
});

test('progress totals and navigation follow actual ready, stale and failed modules', async () => {
  const targets = [];
  const screen = journeyScreen({ dataset: { rowCount: 12, columnCount: 3 }, setupIssue: '题目对应尚未确认', setupTarget: 'mapping', onNavigate: value => targets.push(value), modules: [
    { id: 'a', title: '当前描述', status: 'ready', n: 12, computedAt: '2026-10-18T02:00:00Z' },
    { id: 'b', title: '旧版结果', status: 'stale', n: null, computedAt: '2026-10-18T01:00:00Z' },
    { id: 'c', title: '失败计算', status: 'error', n: null, computedAt: null },
  ] }); await screen.settle();
  const counter = nodes(screen.tree).find(n => n.props?.className === 'resultsCount');
  assert.equal(label(counter), '1 / 3项结果可用 · 2 项待查看');
  nodes(screen.tree).find(n => n.type === 'button' && label(n).includes('口径核对')).props.onClick();
  nodes(screen.tree).find(n => n.type === 'button' && label(n).includes('结果汇集')).props.onClick();
  assert.deepEqual(targets, ['mapping', 'recipes']); screen.unmount();
});

function surveyScreen(initialProps = {}) {
  const components = ['AnalysisRecipeBoard', 'AdvancedMethods', 'ResearchFlow', 'QuestionnaireMapping', 'RoutingAudit', 'SpreadsheetImportPanel', 'SavImportPanel', 'PlatformMappingPanel', 'QualityPanel', 'AnalysisJourney'];
  const mocks = Object.fromEntries(components.map(name => [`./${name}`, { default: name }]));
  return mount('../components/analysis/SurveyLab.tsx', { ...mocks, './SurveyLab.module.css': styles, '@/components/math/Tex': { Tex: 'Tex' }, '@/lib/survey-analysis': survey, '@/lib/questionnaire-mapping': mapping, '@/lib/analysis-journey': journey, '@/lib/research-quality': {}, '@/lib/report-figure': {}, '@/lib/research-flow': {}, '@/lib/routing-evidence': {}, '@/lib/analysis-summary': {}, '@/lib/silicon/export': {}, '@/lib/platform-analysis-dataset': {}, '@/lib/survey-import-metadata': {}, '@/lib/survey-collection': {} }, initialProps);
}

test('accepting a questionnaire before data import retains direct navigation both ways', async () => {
  const design = questionnaire.exampleQuestionnaire(), snapshot = { design, pending: false };
  const screen = surveyScreen({ designSnapshot: snapshot, designTransfer: { id: 'before-data', snapshot } }); await screen.settle();
  const byId = id => nodes(screen.tree).find(n => n.props?.id === id);
  const navigation = () => nodes(screen.tree).find(n => n.props?.['aria-label'] === '分析工作步骤');
  assert.equal(byId('analysis-mapping').props.hidden, false);
  nodes(screen.tree).find(n => n.type === 'QuestionnaireMapping').props.onChange({ design, assignments: [], confirmed: null, sourceSignature: mapping.snapshotSignature(snapshot) });
  await screen.settle();
  assert.equal(navigation().props.hidden, false);
  nodes(navigation()).find(n => n.props?.['data-motion-id'] === 'data').props.onClick(); await screen.settle();
  assert.equal(byId('analysis-import').props.hidden, false);
  assert.equal(navigation().props.hidden, false, 'an accepted mapping stays reachable from the empty data page');
  nodes(navigation()).find(n => n.props?.['data-motion-id'] === 'mapping').props.onClick(); await screen.settle();
  nodes(screen.tree).find(n => n.type === 'QuestionnaireMapping').props.onChange(null); await screen.settle();
  screen.update({ designTransfer: null }); await screen.settle();
  assert.equal(navigation().props.hidden, false, 'a non-data page always retains its return path, even after unlinking');
  screen.unmount();
});

test('format tabs preserve mounted import panels and CSV input while busy work stays visible', async () => {
  const screen = surveyScreen(); await screen.settle();
  const byId = id => nodes(screen.tree).find(n => n.props?.id === id);
  assert.equal(nodes(screen.tree).find(n => n.props?.['aria-label'] === '分析工作步骤').props.hidden, true);
  const initialNodes = nodes(screen.tree);
  assert.ok(initialNodes.indexOf(byId('analysis-import')) < initialNodes.findIndex(n => n.type === 'AnalysisJourney'));
  nodes(screen.tree).find(n => n.props?.['aria-label'] === 'CSV 文本').props.onChange({ target: { value: 'Q1,Q2\n1,2' } });
  button(screen, 'Excel · XLSX').props.onClick(); await screen.settle();
  assert.equal(byId('analysis-import-text').props.hidden, true);
  assert.equal(byId('analysis-import-xlsx').props.hidden, false);
  assert.equal(nodes(screen.tree).find(n => n.props?.['aria-label'] === 'CSV 文本').props.value, 'Q1,Q2\n1,2');
  const sheet = nodes(screen.tree).find(n => n.type === 'SpreadsheetImportPanel');
  sheet.props.onBusy(true, 'workbook.xlsx'); await screen.settle();
  assert.equal(button(screen, 'CSV / TSV').props.disabled, true);
  assert.equal(button(screen, 'SPSS · SAV').props.disabled, true);
  assert.equal(byId('analysis-import-xlsx').props.hidden, false);
  assert.equal(nodes(screen.tree).filter(n => ['SpreadsheetImportPanel', 'SavImportPanel'].includes(n.type)).length, 2);
  sheet.props.onBusy(false); await screen.settle();
  button(screen, 'SPSS · SAV').props.onClick(); await screen.settle();
  assert.equal(byId('analysis-import-sav').props.hidden, false);
  // A new text handoff can begin while another format was selected. Its cancellation panel must be visible.
  const input = nodes(screen.tree).find(n => n.type === 'input' && n.props?.accept?.includes('.csv'));
  input.props.onChange({ target: { files: [{ name: 'pending.csv', size: 10, arrayBuffer: () => new Promise(() => {}) }], value: 'pending.csv' } });
  await screen.settle();
  assert.equal(byId('analysis-import-text').props.hidden, false);
  button(screen, '取消读取').props.onClick(); await screen.settle();
  assert.equal(button(screen, 'SPSS · SAV').props.disabled, false);
  assert.match(label(screen.tree), /已取消本次读取/);
  screen.unmount();
});

function studioScreen() {
  const design = questionnaire.exampleQuestionnaire(), drafts = new Map(), snapshots = [];
  const props = { localOnly: true, hosted: { initialDesign: design, writable: true, cacheKey: 'ui-test', savedFingerprint: library.parseQuestionnaireLibraryContent(design).serialized, savedBinding: null, onLoaded() {} }, onSnapshot: snapshot => snapshots.push(snapshot) };
  const screen = mount('../components/design/QuestionnaireStudio.tsx', { '@/lib/questionnaire': questionnaire, './QuestionnaireStudio.module.css': styles, './QuestionBlocks': { default: 'QuestionBlocks' }, './QuestionnairePlatformExport': { default: 'PlatformExport' }, '../research/ResearchMaterialLibrary': { default: 'MaterialLibrary' }, '@/lib/research-materials': {}, '@/lib/questionnaire-mapping': mapping, './DiagnosisBriefProposal': { default: 'DiagnosisProposal' }, './QuestionnaireLibrary': { default: 'QuestionnaireLibrary' }, '@/lib/questionnaire-library': library, '@/lib/questionnaire-revision': revision, '../hosted/HostedSession': { useHostedSession: () => ({ session: { user: { id: 'ui-user' } }, getDraft: key => drafts.get(key), cacheDraft: (key, value) => drafts.set(key, value), setUnsaved() {} }) } }, props);
  return { screen, get snapshot() { return snapshots.at(-1); } };
}

test('save label includes pending composition and binding metadata, and recovers only on a matching saved version', async () => {
  const { screen } = studioScreen(); await screen.settle();
  const state = () => label(nodes(screen.tree).find(n => n.props?.className === 'documentState'));
  assert.match(state(), /已保存到项目/);
  screen.tree.props.onCompositionStart(); await screen.settle();
  assert.match(state(), /有未保存修改/);
  screen.tree.props.onCompositionEnd(); await screen.settle();
  assert.match(state(), /已保存到项目/);
  screen.update({ hosted: { ...screen.props.hosted, savedBinding: { source: 'different saved binding' } } }); await screen.settle();
  assert.match(state(), /有未保存修改/);
  screen.update({ hosted: { ...screen.props.hosted, savedBinding: null } }); await screen.settle();
  assert.match(state(), /已保存到项目/); screen.unmount();
});

test('editing a disclosed variable still updates the design, preview and undo history', async () => {
  const s = studioScreen(); await s.screen.settle();
  const original = s.snapshot.design.questions[0].variable;
  const variable = () => nodes(s.screen.tree).find(n => n.props?.['data-design-field'] === 'variable');
  const disclosure = nodes(s.screen.tree).find(n => n.type === 'details' && label(n.props.children[0]).startsWith('编码与题目角色'));
  assert.ok(disclosure);
  assert.ok(nodes(disclosure).includes(variable()));
  variable().props.onChange({ target: { value: 'updated_var' } }); await s.screen.settle();
  assert.equal(s.snapshot.design.questions[0].variable, 'updated_var');
  const preview = nodes(s.screen.tree).find(n => n.props?.['aria-label'] === '问卷实时预览');
  assert.match(label(preview), /updated_var/);
  assert.equal(nodes(preview).some(n => n.type === 'h4'), false, 'current-question mode avoids repeating the full questionnaire title');
  button(s.screen, '撤销').props.onClick(); await s.screen.settle();
  assert.equal(s.snapshot.design.questions[0].variable, original);
  nodes(s.screen.tree).find(n => n.props?.['aria-label'] === '预览方式').props.onChange({ target: { value: 'route' } }); await s.screen.settle();
  assert.match(label(s.screen.tree), /不保存答卷、不替代预试/);
  s.screen.unmount();
});
