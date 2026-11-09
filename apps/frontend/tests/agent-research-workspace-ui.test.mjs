import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { parseDiagnosisBriefSource } from '../lib/diagnosis-actions.ts';
import { literatureEvidenceReference } from '../lib/topic-lab/workspace.ts';
import { emptyLiteratureStudy } from '../lib/agent/literature-study.ts';
import { literatureEvidenceReferencesEqual } from '../lib/topic-lab/evidence-reference.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const path = new URL('../components/agent/ResearchWorkspace.tsx', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
const tree = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) expressions.set(node.name.getText(tree), node.initializer.getText(tree));
  if (ts.isFunctionDeclaration(node) && node.name) expressions.set(node.name.text, node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
function load(name, globals) {
  const value = expressions.get(name);
  assert.ok(value, `Missing production handler ${name}`);
  const expression = value.startsWith('function ') ? `(${value})` : value;
  const compiled = ts.transpileModule(`globalThis.run = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const context = vm.createContext({ ...globals });
  vm.runInContext(compiled, context);
  return context.run;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('editing research input invalidates old proposal, selected topic, diagnosis and pending computations', () => {
  const job = { current: 8 }, literatureJob = { current: 3 }, events = [];
  let draft = { direction: '旧方向', profile: {}, intake: { id: 'old' }, selected: { id: 'old' }, diagnosis: { id: 'old' } };
  const change = load('changeResearchInput', { job, literatureJob,
    retractAdoptedTopic: () => {},
    setProposal: value => events.push(['proposal', value]), setReceipt: value => events.push(['receipt', value]),
    setBusy: value => events.push(['busy', value]), setLiteratureBusy: value => events.push(['literatureBusy', value]),
    update: fn => { draft = fn(draft); } });
  change(value => ({ ...value, direction: '新方向' }));
  assert.equal(draft.direction, '新方向');
  for (const key of ['intake', 'selected', 'diagnosis']) assert.equal(draft[key], null);
  assert.equal(job.current, 9);
  assert.equal(literatureJob.current, 4);
  assert.deepEqual(events, [['proposal', null], ['receipt', null], ['busy', false], ['literatureBusy', false]]);
});

function literatureHarness() {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const source = { corpus: { id: 'corpus-a' } }, literatureJob = { current: 0 }, latest = { current: { literature: source } }, events = [];
  const next = load('continueStep', { draft: { selected: { id: 'topic' } }, literature: source, receipt: null, literatureJob, latest,
    current: () => true, literatureWorkspaceReceipt: () => pending,
    setLiteratureBusy: value => events.push(['busy', value]), setReceipt: value => events.push(['receipt', value]),
    setError: value => events.push(['error', value]), props: { onOpenStage: value => events.push(['open', value]) } });
  return { next, source, literatureJob, latest, events, resolve };
}

test('manual literature result for a replaced corpus cannot become the displayed receipt', async () => {
  const h = literatureHarness();
  h.next('literature');
  h.latest.current.literature = { corpus: { id: 'corpus-b' } };
  h.resolve({ resultHash: 'old-result' });
  await tick();
  assert.equal(h.events.filter(([event]) => event === 'receipt' || event === 'error').length, 0);
});

test('input invalidation also cancels a manual result even when the corpus is unchanged', async () => {
  const h = literatureHarness();
  h.next('literature');
  h.literatureJob.current++;
  h.resolve({ resultHash: 'old-result' });
  await tick();
  assert.equal(h.events.filter(([event]) => event === 'receipt').length, 0);
});

test('current manual literature analysis publishes its receipt and settles busy state', async () => {
  const h = literatureHarness(), receipt = { resultHash: 'current-result' };
  h.next('literature');
  h.resolve(receipt);
  await tick();
  assert.deepEqual(h.events, [['busy', true], ['receipt', receipt], ['busy', false]]);
});

const componentCode = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = v => v == null || typeof v !== 'object' ? [] : Array.isArray(v) ? v.flatMap(walk) : [v, ...walk(v.props?.children)];
const emptyDraft = () => ({ schemaVersion: 1, direction: '', profile: { school: '', city: '', region: '', regionRef: null, days: null, budgetYuan: null, access: {} }, intake: null, selected: null, diagnosis: null, literature: null, autoAdvance: false, updatedAt: '2026-11-08T20:00:00Z' });

function componentHarness({ owner = 'owner-old', projectId = 'project-old', read, write } = {}) {
  let index = 0, dirty = true, tree, mounted = true, timerId = 0;
  const cells = [], layouts = [], effects = [], timers = new Map(), writes = [];
  const effect = (fn, deps, queue) => { const i = index++, old = cells[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { const cell = cells[i] = { deps }; queue.push(() => { old?.cleanup?.(); cell.cleanup = fn(); }); } };
  const hooks = {
    useState(init) { const i = index++; cells[i] ??= { value: typeof init === 'function' ? init() : init }; return [cells[i].value, next => { const value = typeof next === 'function' ? next(cells[i].value) : next; if (!Object.is(value, cells[i].value)) { cells[i].value = value; dirty = true; } }]; },
    useRef(init) { const i = index++; cells[i] ??= { current: init }; return cells[i]; },
    useLayoutEffect: (fn, deps) => effect(fn, deps, layouts), useEffect: (fn, deps) => effect(fn, deps, effects),
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/diagnosis-actions': { parseDiagnosisBriefSource }, '@/lib/agent/research-stages': { RESEARCH_STAGES: [{ id: 'topic' }] },
    '@/lib/agent/research-workspace': { emptyResearchWorkspaceDraft: emptyDraft,
      readResearchWorkspace: read ?? (async () => ({ revision: 0, draft: null })),
      writeResearchWorkspace: async (id, project, value, options) => { const event = { owner: id, project, value: structuredClone(value), expectedRevision: options.expectedRevision, hasTicket: !!options.ticket }; writes.push(event); return write ? write(event, options) : options.expectedRevision + 1; } },
    '@/lib/topic-advisor/types': { ACCESS_OPTIONS: [] }, '@/lib/topic-advisor/regions': { regionPath: () => [] },
    '@/lib/topic-lab/workspace': { literatureWorkspaceReceipt: async () => { throw Error('Unexpected literature compute'); }, literatureEvidenceReference },
    '@/lib/topic-lab/evidence-reference': { literatureEvidenceReferencesEqual },
    '@/lib/agent/literature-study': { emptyLiteratureStudy },
    './ResearchJourney': { default: 'ResearchJourney' }, '@/components/topic-advisor/TopicAgent': { default: 'TopicAgent' }, '@/components/topic-advisor/RegionPicker': { default: 'RegionPicker' },
  };
  const exports = {};
  vm.runInNewContext(componentCode, { exports, require: name => imports[name] ?? { default: {} }, Date, JSON, Promise, crypto, structuredClone,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  const props = { owner, projectId, identityEpoch: 1, literature: null, services: [], modelRoutes: {}, onLiterature() {}, onTopic() {}, onOpenStage() {} };
  async function flush() { for (let n = 0; n < 25; n++) { if (dirty && mounted) { index = 0; dirty = false; tree = exports.default(props); while (layouts.length) layouts.shift()(); while (effects.length) effects.shift()(); } await tick(); } }
  return { writes, flush, edit(direction) { walk(tree).find(n => n.type === 'ResearchJourney').props.onDirectionChange(direction); },
    advance() { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); },
    unmount() { mounted = false; cells.forEach(cell => cell?.cleanup?.()); } };
}

test('actual component flushes edits made less than 800ms before leaving only to its old namespace', async () => {
  const old = componentHarness(); await old.flush(); old.edit('Edited before debounce'); await old.flush(); assert.equal(old.writes.length, 0);
  old.unmount(); const next = componentHarness({ owner: 'owner-new', projectId: 'project-new' }); await old.flush(); await next.flush();
  assert.equal(old.writes.length, 1); assert.equal(old.writes[0].owner, 'owner-old'); assert.equal(old.writes[0].project, 'project-old');
  assert.equal(old.writes[0].value.direction, 'Edited before debounce'); assert.equal(old.writes[0].hasTicket, false);
  assert.equal(next.writes.length, 0); next.unmount(); await next.flush();
});

test('actual cleanup serializes after an already committed save and uses its new CAS revision', async () => {
  let resolveFirst; const first = new Promise(resolve => { resolveFirst = resolve; });
  const h = componentHarness({ write: event => event.expectedRevision === 0 ? first : event.expectedRevision + 1 });
  await h.flush(); h.edit('first'); await h.flush(); h.advance(); await h.flush(); assert.equal(h.writes.length, 1);
  h.edit('second before cleanup'); await h.flush(); h.unmount(); resolveFirst(1); await h.flush();
  assert.equal(h.writes.length, 2); assert.equal(h.writes[1].expectedRevision, 1); assert.equal(h.writes[1].value.direction, 'second before cleanup');
});

test('cleanup never flushes unhydrated or conflicted drafts and does not retry a CAS rejection', async () => {
  let resolveRead; const pending = new Promise(resolve => { resolveRead = resolve; });
  const early = componentHarness({ read: () => pending }); await early.flush(); early.unmount(); resolveRead({ revision: 3, draft: emptyDraft() }); await early.flush(); assert.equal(early.writes.length, 0);
  const conflict = componentHarness({ write: () => { throw Error('Synthetic CAS conflict'); } });
  await conflict.flush(); conflict.edit('do not overwrite'); await conflict.flush(); conflict.advance(); await conflict.flush(); conflict.unmount(); await conflict.flush();
  assert.equal(conflict.writes.length, 1);
});

test('current metadata evidence is handed off as v2 without raw corpus and drift cannot downgrade it', () => {
  const snapshot = { schema: 'literature-workspace/v1', corpus: null, settings: { basket: ['selected term'] }, corpusHash: 'a'.repeat(64), parameterHash: 'b'.repeat(64), snapshotHash: 'c'.repeat(64) };
  const base = { id: 'diagnosis-current', input: { title: 'Current proposed topic', problem: 'Compare proposed service options', decisionOwner: 'Proposed service owner', population: 'Proposed adults', geography: 'Proposed location', stage: 'intake', evidenceStatus: 'proposed' } };
  const enrich = load('withLiterature', { literatureEvidenceReference, literatureEvidenceReferencesEqual, parseDiagnosisBriefSource: value => parseDiagnosisBriefSource(structuredClone(value)), crypto });
  const source = enrich(base, snapshot); assert.equal(source.schemaVersion, 2); assert.equal(source.literature.snapshotHash, snapshot.snapshotHash); assert.equal(Object.hasOwn(source, 'corpus'), false);
  const published = [], errors = [];
  const send = load('sendBrief', { current: () => true, draft: { diagnosis: { source } }, literature: { ...snapshot, snapshotHash: 'd'.repeat(64) }, receipt: null,
    literatureEvidenceReferencesEqual, literatureEvidenceReference, withLiterature: enrich, setError: value => errors.push(value), props: { onTopic: value => published.push(value), onOpenStage() {} } });
  send(); assert.equal(published.length, 0); assert.equal(errors.length, 1);
});
