import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as shared from '../../../packages/evi-x-shared/src/index.ts';
import * as questionnaireLibrary from '../lib/questionnaire-library.ts';
import * as mapping from '../lib/questionnaire-mapping.ts';
import { externalStoreHook, workbenchHookModule } from './helpers/workbench-test-harness.mjs';
import { questionnaireRepositoryModule, questionnairePersistence } from './helpers/questionnaire-repository.mjs';
import { questionnaireProposalRepositoryModule, questionnaireProposalContract } from './helpers/questionnaire-proposals.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const label = node => node == null ? '' : Array.isArray(node) ? node.map(label).join('') : typeof node === 'object' ? label(node.props?.children) : String(node);
const moduleStub = name => ({ __esModule: true, default: name });
const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '22222222-2222-4222-8222-222222222222';
const ownerA = '33333333-3333-4333-8333-333333333333';
const ownerB = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const timestamp = '2026-10-20T08:00:00Z';

/**
 * Executes complete production host modules, their actual hook, and the actual
 * store. Child editors and network I/O are bounded at their public interfaces.
 * React DOM reconciliation, focus, and undo retention need browser acceptance.
 */
function mount(relative, { mocks = {}, props = {}, internal, globals = {}, fallback = false } = {}) {
  let cells = [], cursor = 0, queued = [], dirty = true, tree, alive = true;
  const hooks = {
    useState(initial) {
      const at = cursor++;
      if (!cells[at]) cells[at] = { value: typeof initial === 'function' ? initial() : initial };
      return [cells[at].value, next => {
        if (!alive) return;
        next = typeof next === 'function' ? next(cells[at].value) : next;
        if (!Object.is(next, cells[at].value)) { cells[at].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const at = cursor++; return cells[at] ??= { current: initial }; },
    useMemo(fn, deps) { const at = cursor++; if (!cells[at] || !sameDeps(cells[at].deps, deps)) cells[at] = { value: fn(), deps }; return cells[at].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const at = cursor++;
      if (!cells[at] || !sameDeps(cells[at].deps, deps)) {
        const previous = cells[at]; cells[at] = { deps };
        queued.push(() => { previous?.cleanup?.(); cells[at].cleanup = fn(); });
      }
    },
    createContext: () => ({ Provider: 'ContextProvider' }),
    useContext: () => null,
  };
  hooks.useLayoutEffect = hooks.useEffect;
  hooks.useSyncExternalStore = externalStoreHook(hooks, () => { if (alive) dirty = true; });
  const jsx = (type, values, key) => ({ type, props: values ?? {}, key });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/link': moduleStub('Link'),
    'next/dynamic': { __esModule: true, default: loader => {
      const path = loader.toString().match(/(?:require|import)\(["']([^"']+)["']\)/)?.[1];
      assert.ok(path, 'dynamic module path must be preserved');
      return path.split('/').at(-1);
    } },
    '@/components/workbench/useWorkbenchHandoffs': workbenchHookModule(hooks),
    ...mocks,
  };
  if (relative.endsWith('/HostedProject.tsx')) { imports['./questionnaire-repository'] = questionnaireRepositoryModule({ contract: imports['@/lib/topic-questionnaire-api'] }); imports['@/lib/questionnaire-persistence'] = questionnairePersistence; imports['./questionnaire-proposal-repository'] = questionnaireProposalRepositoryModule(); imports['@/lib/questionnaire-proposals'] = questionnaireProposalContract; }
  const window = { location: { hash: '' }, confirm: () => true, addEventListener() {}, removeEventListener() {}, scrollTo() {} };
  const code = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const box = { exports: {}, require(name) {
    if (name in imports) return imports[name];
    assert.ok(fallback, `Unmocked host dependency: ${name}`);
    return moduleStub(name);
  }, window, console, crypto, structuredClone, JSON, queueMicrotask, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, document: { getElementById: () => null }, location: { reload() {} }, ...globals };
  vm.runInNewContext(code + (internal ? `\nexports.tested = ${internal};` : ''), box);
  const component = internal ? box.exports.tested : box.exports.default;
  return {
    get tree() { return tree; }, get window() { return box.window; },
    update(next) { props = { ...props, ...next }; },
    async settle() {
      for (let cycle = 0; cycle < 40; cycle++) {
        assert.ok(alive); cursor = 0; dirty = false; tree = component(props);
        const effects = queued; queued = []; effects.forEach(fn => fn()); await tick();
        if (!dirty && !queued.length) return;
      }
      throw Error('Host did not settle within 40 cycles');
    },
    unmount() { cells.forEach(cell => cell.cleanup?.()); alive = false; },
  };
}

function session() {
  const auth = { session: { user: { id: ownerA }, mode: 'local_test' }, identityEpoch: 1, getDraft() {}, cacheDraft() {}, setUnsaved() {}, mutate() { throw Error('Handoffs must not write to the cloud'); } };
  auth.isCurrentAccount = (id, epoch) => id === auth.session.user.id && epoch === auth.identityEpoch;
  return auth;
}
function platform(auth = session()) {
  return mount('../components/EviXPlatform.tsx', { fallback: true, mocks: {
    '@/components/hosted/HostedSession': { useHostedSession: () => auth },
    '@/data/control-plane-contract.generated': { PROJECT_STAGES: [], GATE_NAMES: [] },
  } });
}
function hosted({ auth = session(), projectId = projectA, role = 'owner', wrapper = false } = {}) {
  const design = shared.newQuestionnaire();
  const head = { id: versionId, projectId, revision: 1, design, updatedAt: timestamp };
  const requests = [];
  const screen = mount('../components/hosted/HostedProject.tsx', { fallback: true, internal: wrapper ? undefined : 'ProjectEditor', props: { projectId }, mocks: {
    '@evix/shared': shared, '@/lib/questionnaire-library': questionnaireLibrary, '@/lib/questionnaire-mapping': mapping,
    '@/lib/topic-questionnaire-api': { verifyTopicBindingReceipt: async value => value },
    './HostedSession': { useHostedSession: () => auth }, './HostedFrame': { LoginRequired: 'LoginRequired' },
    './silicon-runner': { serviceNames: () => new Map(), createSiliconRunner: () => null },
    '@/components/motion/useWorkspaceMotion': { useContentReveal: () => null, useKeyedListMotion: () => null },
    './api-client': { errorMessage: error => error.message, HostedApiError: class extends Error {}, hostedRequest: async path => {
      requests.push(path);
      if (path === '/api/services') return { services: [] };
      if (path.endsWith('/questionnaire')) return { questionnaire: head };
      if (path.endsWith('/topic-binding')) return { versionId, binding: null };
      if (path.endsWith('/questionnaire/versions')) return { versions: [], nextBeforeRevision: null };
      if (path.endsWith('/proposals')) return { proposals: [] };
      if (path.endsWith('/silicon-runs')) return {};
      return { project: { id: projectId, title: '合成边界验收', teamId: projectId, revision: 1, createdAt: timestamp }, membershipRole: role };
    } },
  } });
  return { screen, requests, auth, design };
}
function child(screen, type) {
  const found = nodes(screen.tree).find(node => node.type === type);
  assert.ok(found, `Missing ${type}`); return found;
}
async function open(screen, text) {
  const button = nodes(screen.tree).find(node => node.type === 'button' && label(node) === text);
  assert.ok(button, `Missing tab ${text}`); button.props.onClick(); await screen.settle();
}
const result = (id = 'same-business-id', title = '合成结果') => ({
  id, title, sourceName: '合成数据', sourceUrl: '', sourceHash: 'a'.repeat(64), resultHash: 'b'.repeat(64),
  classification: 'simulated', method: 'frequency', n: 2, total: 2, headers: ['类别', '频数'], rows: [['A', 2]], metrics: [], warnings: ['仅用于合成验收'],
});
const brief = title => ({ id: 'same-brief-id', input: { title, problem: '拟调查问题', decisionOwner: '拟联系负责人', population: '拟联系对象', geography: '武汉', stage: 'problem_framing', evidenceStatus: 'proposed' } });
const section = title => ({ id: 'same-section-id', title, body: '合成统计段落', source: '合成测试来源' });
const dataset = () => ({ id: 'same-dataset-id', name: '合成数据.csv', csv: '类别,频数\nA,2', origin: { kind: 'silicon' } });

test('local host keeps a newer result when a retained acknowledgement arrives, including repeated business IDs', async () => {
  const screen = platform(); await screen.settle();
  let panels = screen.tree.props.panels;
  panels.analysis.props.onResultSnapshot(result()); await screen.settle();
  const acknowledgeA = screen.tree.props.panels.editor.props.onResultHandled;
  const sent = result('same-business-id', '第二次发送');
  screen.tree.props.panels.analysis.props.onResultSnapshot(sent); await screen.settle();
  acknowledgeA(); await screen.settle();
  panels = screen.tree.props.panels;
  assert.equal(panels.editor.props.resultProposal.title, '第二次发送');
  assert.equal(screen.window.location.hash, 'editor');
  sent.rows[0][1] = 99;
  assert.equal(panels.editor.props.resultProposal.rows[0][1], 2);
  panels.editor.props.onResultHandled(); await screen.settle();
  assert.equal(screen.tree.props.panels.editor.props.resultProposal ?? null, null);
  acknowledgeA(); await screen.settle();
  assert.equal(screen.tree.props.panels.editor.props.resultProposal ?? null, null);
  screen.unmount();
});

test('diagnostic brief acknowledgement and invalidation are bound to the rendered delivery', async () => {
  const screen = platform(); await screen.settle();
  screen.tree.props.panels.diagnose.props.onBriefSource(brief('第一版')); await screen.settle();
  const oldConsume = screen.tree.props.panels.design.props.onBriefHandled;
  const oldSource = screen.tree.props.panels.diagnose.props.onBriefSource;
  const newer = brief('第二版');
  oldSource(newer); await screen.settle();
  oldConsume(); oldSource(null); await screen.settle();
  assert.equal(screen.tree.props.panels.design.props.briefSource.input.title, '第二版');
  newer.input.title = '发送后修改';
  assert.equal(screen.tree.props.panels.design.props.briefSource.input.title, '第二版');
  screen.tree.props.panels.diagnose.props.onBriefSource(null); await screen.settle();
  assert.equal(screen.tree.props.panels.design.props.briefSource ?? null, null);
  screen.unmount();
});

test('local design and dataset snapshots detach nested data and remain independent of pending messages', async () => {
  const screen = platform(); await screen.settle();
  const design = { design: shared.newQuestionnaire(), pending: false };
  screen.tree.props.panels.design.props.onSnapshot(design);
  screen.tree.props.panels.design.props.onAnalyze(design);
  const data = dataset();
  screen.tree.props.panels.silicon.props.onSendToAnalysis(data);
  const workspace = { name: '画布数据', sourceHash: 'c'.repeat(64), kind: 'simulated', table: { headers: ['x'], rows: [['2']] }, missingCodes: [], lineage: ['合成验收'] };
  screen.tree.props.panels.analysis.props.onDatasetChange(workspace); await screen.settle();
  design.design.title = '外部修改'; data.name = '被修改'; workspace.table.rows[0][0] = '99';
  let panels = screen.tree.props.panels;
  assert.notEqual(panels.analysis.props.designSnapshot.design.title, '外部修改');
  assert.notEqual(panels.analysis.props.designTransfer.snapshot.design.title, '外部修改');
  assert.equal(panels.analysis.props.datasetTransfer.name, '合成数据.csv');
  assert.equal(panels.sampling.props.dataset.table.rows[0][0], '2');
  assert.equal(panels.canvas.props.dataset, panels.sampling.props.dataset);
  assert.equal(panels.canvas.props.design, panels.silicon.props.designSnapshot);
  assert.equal(screen.window.location.hash, 'analysis');
  const pendingDesign = panels.analysis.props.designTransfer;
  const nextDesign = { ...design, design: { ...design.design, title: '新编辑但未重发' }, pending: true };
  panels.design.props.onSnapshot(nextDesign); panels.analysis.props.onDatasetChange(null); await screen.settle();
  panels = screen.tree.props.panels;
  assert.equal(panels.analysis.props.designSnapshot.pending, true);
  assert.equal(panels.analysis.props.designTransfer, pendingDesign);
  assert.equal(panels.sampling.props.dataset, null);
  assert.equal(panels.analysis.props.datasetTransfer.name, '合成数据.csv');
  screen.unmount();
});

test('local account scope change clears all previous exchanges and old callbacks cannot affect the new store', async () => {
  const auth = session(), screen = platform(auth); await screen.settle();
  const oldProducer = screen.tree.props.panels.analysis.props.onResultSnapshot;
  oldProducer(result());
  screen.tree.props.panels.diagnose.props.onBriefSource(brief('旧账户'));
  screen.tree.props.panels.design.props.onAnalyze({ design: shared.newQuestionnaire(), pending: false });
  screen.tree.props.panels.silicon.props.onSendToAnalysis(dataset());
  screen.tree.props.panels.analysis.props.onDatasetChange({ name: '旧数据', sourceHash: 'c'.repeat(64), kind: 'simulated', table: { headers: ['x'], rows: [['2']] }, missingCodes: [], lineage: [] });
  await screen.settle();
  const oldReceipt = screen.tree.props.panels.editor.props.onResultHandled;
  auth.session = { ...auth.session, user: { id: ownerB } }; auth.identityEpoch++;
  await screen.settle();
  const panels = screen.tree.props.panels;
  assert.equal(panels.editor.props.resultProposal ?? null, null);
  assert.equal(panels.design.props.briefSource ?? null, null);
  assert.equal(panels.analysis.props.designTransfer ?? null, null);
  assert.equal(panels.analysis.props.datasetTransfer ?? null, null);
  assert.equal(panels.analysis.props.designSnapshot, null);
  assert.equal(panels.sampling.props.dataset, null);
  screen.tree.props.panels.analysis.props.onResultSnapshot(result('same-business-id', '新账户'));
  oldProducer(result('late-old', '旧账户迟到')); oldReceipt(); await screen.settle();
  assert.equal(screen.tree.props.panels.editor.props.resultProposal.title, '新账户');
  auth.session = { ...auth.session, user: { id: ownerA } }; auth.identityEpoch++; await screen.settle();
  assert.equal(screen.tree.props.panels.editor.props.resultProposal ?? null, null);
  screen.unmount();
});

test('hosted analysis routes result and section independently and retains newer same-ID deliveries', async () => {
  const { screen, requests } = hosted(); await screen.settle(); await open(screen, '数据分析');
  child(screen, 'SurveyLab').props.onResultSnapshot(result()); await screen.settle();
  const oldResult = child(screen, 'HostedReport').props.onResultHandled;
  child(screen, 'SurveyLab').props.onEvidenceProposal(section('第一段')); await screen.settle();
  const oldSection = child(screen, 'HostedReport').props.onProposalConsumed;
  const latest = section('第二段');
  child(screen, 'SurveyLab').props.onResultSnapshot(result('same-business-id', '第二个结果'));
  child(screen, 'SurveyLab').props.onEvidenceProposal(latest); await screen.settle();
  oldResult(); oldSection(); await screen.settle();
  let report = child(screen, 'HostedReport');
  assert.equal(report.props.resultProposal.title, '第二个结果');
  assert.equal(report.props.proposal.section.title, '第二段');
  latest.title = '外部修改';
  assert.equal(report.props.proposal.section.title, '第二段');
  report.props.onResultHandled(); await screen.settle(); report = child(screen, 'HostedReport');
  assert.equal(report.props.resultProposal ?? null, null);
  assert.equal(report.props.proposal.section.title, '第二段');
  report.props.onProposalConsumed(); await screen.settle();
  assert.equal(child(screen, 'HostedReport').props.proposal, null);
  assert.ok(requests.every(path => !path.includes('/report')), 'handoff does not save or reload report data');
  screen.unmount();
});

test('hosted design, silicon and collection routes keep frozen transfers while panels stay present', async () => {
  const { screen } = hosted(); await screen.settle();
  const design = { design: shared.newQuestionnaire(), pending: false };
  const initialStudio = child(screen, 'QuestionnaireStudio');
  initialStudio.props.onAnalyze(design); await screen.settle();
  design.design.questions[0].text = '外部修改';
  assert.notEqual(child(screen, 'SurveyLab').props.designTransfer.snapshot.design.questions[0].text, '外部修改');
  await open(screen, '硅基样本');
  const data = dataset(); child(screen, 'SiliconLab').props.onSendToAnalysis(data); await screen.settle();
  data.origin.kind = 'changed';
  assert.equal(child(screen, 'SurveyLab').props.datasetTransfer.origin.kind, 'silicon');
  await open(screen, '发布与回收');
  const collection = { ...dataset(), name: '回收数据.csv', origin: { kind: 'collection', projectId: projectA, releaseId: versionId, versionId, questionnaireRevision: 1, classification: 'synthetic', snapshotHash: 'a'.repeat(64), generatedAt: timestamp, design: shared.newQuestionnaire() } };
  child(screen, 'SurveyCollection').props.onAnalyze(collection); await screen.settle();
  collection.origin.design.title = '外部改写来源';
  assert.equal(child(screen, 'SurveyLab').props.datasetTransfer.name, '回收数据.csv');
  assert.notEqual(child(screen, 'SurveyLab').props.datasetTransfer.origin.design.title, '外部改写来源');
  await open(screen, '报告与 PPT');
  for (const name of ['QuestionnaireStudio', 'SurveyLab', 'SiliconLab', 'SurveyCollection', 'HostedReport']) child(screen, name);
  const designPanel = nodes(screen.tree).find(node => node.type === 'div' && node.props.hidden === true && nodes(node.props.children).some(n => n.type === 'QuestionnaireStudio'));
  assert.ok(designPanel, 'the questionnaire subtree remains rendered when another tab is active');
  assert.equal(child(screen, 'QuestionnaireStudio').key, initialStudio.key, 'handoff must not assign a per-delivery editor key');
  screen.unmount();
});

test('hosted project and account identities select separate stores and preserve the remount boundary', async () => {
  const auth = session(), wrapper = hosted({ auth, wrapper: true }).screen; await wrapper.settle();
  const firstKey = wrapper.tree.props.children.key;
  wrapper.update({ projectId: projectB }); await wrapper.settle();
  assert.notEqual(wrapper.tree.props.children.key, firstKey);
  const projectKey = wrapper.tree.props.children.key;
  auth.identityEpoch++; await wrapper.settle();
  assert.notEqual(wrapper.tree.props.children.key, projectKey);
  wrapper.unmount();
  const first = hosted({ auth, projectId: projectA }).screen;
  await first.settle(); await open(first, '数据分析');
  const oldProducer = child(first, 'SurveyLab').props.onResultSnapshot;
  oldProducer(result()); await first.settle();
  const oldReceipt = child(first, 'HostedReport').props.onResultHandled;
  first.unmount();
  auth.session = { ...auth.session, user: { id: ownerB } }; auth.identityEpoch++;
  const second = hosted({ auth, projectId: projectB }).screen;
  await second.settle(); await open(second, '报告与 PPT');
  assert.equal(child(second, 'HostedReport').props.resultProposal ?? null, null);
  await open(second, '数据分析');
  child(second, 'SurveyLab').props.onResultSnapshot(result('same-business-id', '另一个项目'));
  oldProducer(result('late-old', '旧项目')); oldReceipt(); await second.settle();
  assert.equal(child(second, 'HostedReport').props.resultProposal.title, '另一个项目');
  second.unmount();
});

test('hosted viewer has no report/result producer callbacks', async () => {
  const { screen } = hosted({ role: 'viewer' }); await screen.settle(); await open(screen, '数据分析');
  assert.equal(child(screen, 'SurveyLab').props.onResultSnapshot, undefined);
  assert.equal(child(screen, 'SurveyLab').props.onEvidenceProposal, undefined);
  screen.unmount();
});

test('workbench shell retains visited panel subtrees and stable keys across navigation', async () => {
  const names = ['overview', 'design', 'analysis', 'editor', 'canvas'];
  const panels = Object.fromEntries(names.map(name => [name, { type: `${name}-editor`, props: { children: 'existing draft' } }]));
  const shellKit = { NAV_ITEMS: names.map(id => ({ id, group: 'test', title: id, description: '' })), useThemePreference: () => 'light' };
  for (const name of ['NavIcon', 'PageHeading', 'ThemeProvider', 'ThemeToggle', 'WorkbenchFooter', 'WorkbenchSidebar']) shellKit[name] = name;
  const screen = mount('../components/WorkbenchShell.tsx', { props: { panels }, mocks: {
    './knowledge/KnowledgeProvider': { useKnowledge: () => ({ openSearch() {} }) },
    './hosted/HostedFrame': { AccountStatus: 'AccountStatus' }, './canvas/ViewSwitch': moduleStub('ViewSwitch'),
    './workbench/shell-kit': shellKit,
  } });
  await screen.settle();
  for (const name of ['design', 'analysis', 'editor', 'canvas', 'design']) {
    screen.window.location.hash = `#${name}`; await screen.settle();
  }
  const rendered = nodes(screen.tree).filter(node => node.props?.['data-workbench-panel']);
  assert.deepEqual(rendered.map(node => node.key).sort(), [...names].sort());
  for (const node of rendered) {
    assert.equal(node.props.children, panels[node.key]);
    assert.equal(node.props.hidden, node.key !== 'design');
  }
  screen.unmount();
});
