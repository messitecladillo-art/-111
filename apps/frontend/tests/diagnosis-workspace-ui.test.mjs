import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = new URL('../components/EviXPlatform.tsx', import.meta.url), source = fs.readFileSync(path, 'utf8');
const tree = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'DiagnosisPanel');
assert.ok(component, 'Use the production DiagnosisPanel function');
const compiled = ts.transpileModule(`globalThis.DiagnosisPanel = ${component.getText(tree).replace(/^export\s+/, '')}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
}).outputText;
const copy = value => JSON.parse(JSON.stringify(value));
const reference = { schema: 'literature-evidence/v1', classification: 'metadata_analysis', corpusHash: 'a'.repeat(64), parameterHash: 'b'.repeat(64), snapshotHash: 'c'.repeat(64), sourceIds: ['p0'], selectedTerms: ['public service'] };
const incoming = version => ({ ...(version === 2 ? { schemaVersion: 2, literature: copy(reference) } : {}), id: `diagnosis-${version}`,
  input: { title: `来源 ${version} 的新题目`, decisionOwner: '实际服务负责人', population: '拟调查社区居民', geography: '研究社区', stage: 'intake', problem: '比较拟议公共服务方案，支持负责人安排后续调研。', evidenceStatus: 'proposed' } });

function harness(initial = {}) {
  const slots = [], layouts = [], effects = []; let cursor = 0, dirty = false, props = initial, rendered;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initialValue) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(callback, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, callback }; return slots[i].callback; },
  };
  for (const [name, queue] of [['useLayoutEffect', layouts], ['useEffect', effects]]) hooks[name] = (effect, deps) => {
    const i = cursor++, previous = slots[i];
    if (!previous || !same(previous.deps, deps)) queue.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
  };
  const context = vm.createContext({ ...hooks, crypto, useWorkbenchTheme: () => 'light',
    React: { Fragment: 'Fragment', createElement: (type, values, ...children) => ({ type, props: { ...values, children } }) },
    TopicAdvisor: 'TopicAdvisor', TopicModelProposal: 'TopicModelProposal', TopicLab: 'TopicLab', ChoiceGroup: 'ChoiceGroup', DiagnosisActions: 'DiagnosisActions',
    topicCatalog: { contentVersion: 'fixture' }, STAGES: [['intake', '接收']], STAGE_LABELS: {}, GATE_LABELS: {},
    literatureEvidenceReference: snapshot => snapshot.reference,
    literatureEvidenceReferencesEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    parseLiteratureEvidenceReference: copy, parseDiagnosisBriefSource: copy,
    apiRequest: async () => ({}), normalizeDiagnosis: () => ({ score: 20, summary: '合成接口回执，仅验证 UI', dimensions: [], risks: [], nextActions: [], actionCodes: [] }),
  });
  vm.runInContext(compiled, context);
  function render(next) {
    if (next) props = { ...props, ...next };
    for (let pass = 0; pass < 10; pass++) {
      cursor = 0; dirty = false; layouts.length = 0; effects.length = 0;
      rendered = context.DiagnosisPanel(props);
      for (const effect of layouts.splice(0)) effect(); for (const effect of effects.splice(0)) effect();
      if (!dirty) return rendered;
    }
    throw Error('DiagnosisPanel effects did not settle');
  }
  function find(predicate, node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const child of node) { const found = find(predicate, child); if (found) return found; } return null; }
    return predicate(node) ? node : node.props?.children === undefined ? null : find(predicate, node.props.children);
  }
  const panel = mode => find(node => node.props?.id === `dg-panel-${mode}`, rendered);
  render();
  return { render, panel, async submit() { await find(node => node.type === 'form', rendered).props.onSubmit({ preventDefault() {} }); render();
    return copy(find(node => node.type === 'DiagnosisActions', rendered).props.source); } };
}

test('incoming v2 autoattachment preserves the open literature view while updating actual form fields and bound evidence', async () => {
  const requestedMode = { id: 'open-topics', mode: 'topics' }, source = incoming(2);
  const h = harness({ requestedMode, literature: { reference: copy(reference) } });
  assert.equal(h.panel('topics').props.hidden, false);
  h.render({ incomingSource: source });
  assert.equal(h.panel('topics').props.hidden, false, 'a new source must not steal the current literature view');
  assert.equal(h.panel('readiness').props.hidden, true);
  const submitted = await h.submit();
  assert.deepEqual(submitted.input, source.input);
  assert.equal(submitted.schemaVersion, 2);
  assert.deepEqual(submitted.literature, reference);
  assert.equal(h.panel('topics').props.hidden, false);
});

test('a new explicit readiness request switches the literature view even with a bound v2 source', () => {
  const h = harness({ requestedMode: { id: 'topics', mode: 'topics' }, literature: { reference: copy(reference) }, incomingSource: incoming(2) });
  assert.equal(h.panel('topics').props.hidden, false);
  h.render({ requestedMode: { id: 'explicit-readiness', mode: 'readiness' } });
  assert.equal(h.panel('readiness').props.hidden, false);
  assert.equal(h.panel('topics').props.hidden, true);
});

test('incoming v1 topic from the advisor still opens readiness and updates the actual form without literature provenance', async () => {
  const h = harness(), source = incoming(1);
  assert.equal(h.panel('advisor').props.hidden, false);
  h.render({ incomingSource: source });
  assert.equal(h.panel('readiness').props.hidden, false);
  const submitted = await h.submit();
  assert.deepEqual(submitted.input, source.input);
  assert.equal(Object.hasOwn(submitted, 'schemaVersion'), false);
  assert.equal(Object.hasOwn(submitted, 'literature'), false);
});
