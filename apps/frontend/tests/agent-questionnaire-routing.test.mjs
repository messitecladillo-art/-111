import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as routing from '../lib/agent/model-routing.ts';
import { prepareQuestionnaireGeneration, isDefiniteGenerationRejection } from '../lib/questionnaire-proposals.ts';

// Execute production useGeneration and ConsentCard. No real HTTP or provider.
const ts = createRequire(import.meta.url)('typescript');
const compiled = ts.transpileModule(fs.readFileSync(new URL('../components/agent/generation.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const service = (id, revision = 1) => ({ id, revision, label: `Synthetic ${id[0]}`, model: `synthetic-${id[0]}`, capabilities: ['questionnaire'] });
const walk = v => v == null || typeof v !== 'object' ? [] : Array.isArray(v) ? v.flatMap(walk) : [v, ...walk(v.props?.children)];
const text = v => v == null ? '' : Array.isArray(v) ? v.map(text).join('') : typeof v === 'object' ? text(v.props?.children) : String(v);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve: value => resolve(value) }; };

function harness() {
  let cursor = 0, dirty = true, generation, tree, sequence = 0;
  let services = [service(A), service(B)];
  let preferences = { schemaVersion: 2, tasks: { questionnaire: A }, steps: { 'survey.questionnaire': A } };
  const cells = [], effects = [], requests = [], heads = [], messages = [{ id: 'consent', role: 'agent', turn: { cards: [{ kind: 'consent', brief: 'Synthetic questionnaire request', state: 'open' }] } }];
  const head = deferred();
  const memo = (fn, deps) => { const i = cursor++, old = cells[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) cells[i] = { deps, value: fn() }; return cells[i].value; };
  const hooks = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => generation,
    useState(init) { const i = cursor++; cells[i] ??= { value: typeof init === 'function' ? init() : init }; return [cells[i].value, next => { const value = typeof next === 'function' ? next(cells[i].value) : next; if (!Object.is(value, cells[i].value)) { cells[i].value = value; dirty = true; } }]; },
    useRef(init) { const i = cursor++; cells[i] ??= { current: init }; return cells[i]; },
    useCallback: (fn, deps) => memo(() => fn, deps), useMemo: memo,
    useSyncExternalStore: (_subscribe, get) => get(),
    useEffect(fn, deps) { const i = cursor++, old = cells[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { const cell = cells[i] = { deps }; effects.push(() => { old?.cleanup?.(); cell.cleanup = fn(); }); } },
    useLayoutEffect(fn,deps) { return hooks.useEffect(fn,deps); },
  };
  const threads = {
    patch(id, fn) { const i = messages.findIndex(m => m.id === id); if (i >= 0) { messages[i] = fn(messages[i]); dirty = true; } },
    appendAfter(id, message) { const i = messages.findIndex(m => m.id === id); messages.splice(i + 1, 0, message); dirty = true; },
    file() {}, subscribe: () => () => {}, projectOf: () => PROJECT, find: id => messages.find(m => m.id === id),
  };
  const auth = { session: { authenticated: true, user: { id: OWNER } }, loading: false, identityEpoch: 1, isCurrentAccount: (id, epoch) => id === OWNER && epoch === 1, mutate() { throw Error('Unexpected transport'); } };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a' },
    '@evix/shared': { parseCollection: (raw, key) => raw[key], parseProject: v => v, parseService: v => v },
    '@/components/hosted/HostedSession': { useHostedSession: () => auth },
    '@/components/hosted/api-client': { hostedRequest: async path => path === '/api/projects' ? { projects: [{ id: PROJECT, title: 'Synthetic project' }] } : { services }, HostedApiError: class extends Error {}, downloadQuestionnaire() {} },
    '@/components/hosted/questionnaire-repository': { createQuestionnaireRepository: project => ({ head: () => { heads.push(project); return head.promise; } }) },
    '@/components/hosted/questionnaire-proposal-repository': { QuestionnaireProposalError: class extends Error {}, createQuestionnaireProposalRepository: project => ({ generate: async (request, current) => { if (!current()) return undefined; requests.push({ project, ...structuredClone(request) }); return { status: 'failed', errorCode: 'synthetic_no_provider' }; } }) },
    '@/lib/questionnaire-proposals': { prepareQuestionnaireGeneration, isDefiniteGenerationRejection },
    '@/lib/questionnaire': { QUESTION_TYPES: {} }, './threads': { stamp: () => ({ id: `synthetic-message-${++sequence}`, at: Date.now() }), threads },
    '@/lib/agent/model-routing': { ...routing, getStageModelPreferences: () => preferences, getModelPreferences: () => preferences.tasks, getServerModelPreferences: () => ({}), getServerStageModelPreferences: () => preferences, subscribeModelPreferences: () => () => {}, setStageModelPreference: (_owner, step, id) => { preferences = { ...preferences, steps: { ...preferences.steps, [step]: id } }; dirty = true; } },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => imports[name] ?? { default: new Proxy({}, { get: (_target, key) => String(key) }) }, crypto, setTimeout, clearTimeout, Date, Map, Set, Promise });
  function render() {
    cursor = 0; dirty = false;
    generation = exports.useGeneration(() => {}, () => {});
    const card = messages[0].turn.cards[0];
    tree = exports.ConsentCard({ messageId: 'consent', card, at: 0 });
    while (effects.length) effects.shift()();
  }
  async function flush() { for (let n = 0; n < 25; n++) { if (dirty) render(); await new Promise(r => setImmediate(r)); } }
  const cards = () => messages.flatMap(m => m.turn.cards ?? []);
  return {
    flush, requests, heads, head, cards,
    choose(id) { preferences = { ...preferences, steps: { ...preferences.steps, 'survey.questionnaire': id } }; dirty = true; },
    async revision(id, value) { services = services.map(s => s.id === id ? service(id, value) : s); generation.load(true); await flush(); },
    selected() { return walk(tree).find(n => n.type === 'select' && n.props.children?.some?.(v => v?.props?.children === '请选择问卷起草模型'))?.props.value; },
    submit() { const button = walk(tree).find(n => n.type === 'button' && /^(?:确认并)?起草/.test(text(n))); assert.ok(button, 'actual consent button exists'); assert.equal(button.props.disabled, false); button.props.onClick(); },
    // A DOM event from before the store notification must also be checked at entry.
    staleSubmit(id) { generation.submit('consent', { brief: 'Synthetic questionnaire request', projectId: PROJECT, serviceId: id }); },
  };
}

test('survey route changes while questionnaire head is pending prevent provider dispatch and record noCall', async () => {
  const h = harness(); await h.flush(); h.submit(); await h.flush(); assert.deepEqual(h.heads, [PROJECT]);
  h.choose(B); await h.flush(); h.head.resolve({ revision: 9 }); await h.flush();
  assert.equal(h.requests.length, 0); assert.equal(h.cards().find(c => c.kind === 'job').noCall, true);
});

test('service revision changes during questionnaire head read require renewed confirmation', async () => {
  const h = harness(); await h.flush(); h.submit(); await h.flush(); await h.revision(A, 2);
  h.head.resolve({ revision: 9 }); await h.flush();
  assert.equal(h.requests.length, 0); assert.equal(h.cards().find(c => c.kind === 'job').noCall, true);
});

test('a stable explicit survey override is the actual request destination with its revision', async () => {
  const h = harness(); await h.flush(); h.choose(B); await h.flush(); await h.revision(B, 3); h.submit(); await h.flush();
  h.head.resolve({ revision: 9 }); await h.flush();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].serviceId, B); assert.equal(h.requests[0].serviceRevision, 3);
  assert.equal(h.requests[0].expectedQuestionnaireRevision, 9); assert.equal(h.requests[0].project, PROJECT);
});

test('a stale consent event cannot acquire a head read for a no-longer-selected service', async () => {
  const h = harness(); await h.flush(); h.choose(B); h.staleSubmit(A); await h.flush();
  assert.equal(h.heads.length, 0); assert.equal(h.requests.length, 0);
});
