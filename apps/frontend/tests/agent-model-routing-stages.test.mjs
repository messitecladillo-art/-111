import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_CALLS, MODEL_CALL_IDS, RESEARCH_STAGES } from '../lib/agent/research-stages.ts';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OWNER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PREFIX = 'evix.agent.model-routing.v1:';
const service = (id, capabilities, revision = 1) => ({ id, label: `自命名服务 ${id[0]}`, provider: 'compatible', baseUrl: 'https://models.example.test/v1', model: 'synthetic-model', maxOutputTokens: 1024, capabilities, revision });
const prefs = (extra = {}) => ({ schemaVersion: 2, tasks: {}, steps: {}, ...extra });
let sequence = 0;
const fresh = () => import(`../lib/agent/model-routing.ts?stages=${++sequence}`);
function browser({ denied = false, writeDenied = false } = {}) {
  const values = new Map(), listeners = new Set();
  const storage = {
    getItem(key) { if (denied) throw Error('storage denied'); return values.get(key) ?? null; },
    setItem(key, value) { if (denied || writeDenied) throw Error('storage denied'); values.set(key, String(value)); },
  };
  globalThis.window = { localStorage: storage, addEventListener(type, callback) { if (type === 'storage') listeners.add(callback); } };
  return { values, allowWrites() { writeDenied = false; }, update(owner, value) {
    if (value === null) values.delete(PREFIX + owner); else values.set(PREFIX + owner, JSON.stringify(value));
    for (const callback of listeners) callback({ key: PREFIX + owner, storageArea: storage });
  }, clear() { values.clear(); for (const callback of listeners) callback({ key: null, storageArea: storage }); } };
}

test('workflow stages distinguish model calls from local/manual/unimplemented work', () => {
  assert.equal(new Set(RESEARCH_STAGES.map(stage => stage.id)).size, RESEARCH_STAGES.length);
  assert.deepEqual(RESEARCH_STAGES.map(stage => stage.id), ['topic', 'diagnosis', 'literature', 'questionnaire', 'sampling', 'pilot', 'collection', 'quality', 'analysis', 'findings', 'report', 'review', 'export', 'defense']);
  for (const stage of RESEARCH_STAGES) {
    assert.ok(stage.description.length > 10);
    if (stage.execution !== 'model') assert.deepEqual(stage.modelCalls, [], `${stage.id} must not imply a model executor`);
    for (const call of stage.modelCalls) assert.ok(Object.hasOwn(MODEL_CALLS, call));
  }
  assert.deepEqual(MODEL_CALL_IDS, ['research.conversation', 'research.topic', 'survey.questionnaire', 'report.draft', 'report.revision', 'report.full']);
  assert.equal(RESEARCH_STAGES.find(stage => stage.id === 'defense').availability, 'planned');
});

test('step override wins over capability default, global default and implicit selection', async () => {
  const { parseStageModelPreferences, resolveStageModelRoute } = await fresh();
  const services = [service(A, ['research']), service(B, ['research']), service(C, ['research'])];
  const choose = input => resolveStageModelRoute('research.topic', services, parseStageModelPreferences(input));
  const all = prefs({ defaultServiceId: A, tasks: { research: B }, steps: { 'research.topic': C } });
  assert.equal(choose(all).service.id, C);
  assert.equal(choose(all).selectionSource, 'step');
  assert.equal(choose({ ...all, steps: {} }).service.id, B);
  assert.equal(choose({ ...all, steps: {} }).selectionSource, 'capability');
  assert.equal(choose(prefs({ defaultServiceId: A })).service.id, A);
  assert.equal(choose(prefs({ defaultServiceId: A })).selectionSource, 'default');
  assert.equal(choose(prefs()).reason, 'unselected');
  assert.equal(resolveStageModelRoute('research.topic', [services[0]], parseStageModelPreferences({})).reason, 'only_eligible');
});

test('deleted, incompatible or malformed explicit routes block fallback', async () => {
  const { parseStageModelPreferences, resolveStageModelRoute } = await fresh();
  const services = [service(B, ['research']), service(C, ['report'])];
  for (const steps of [{ 'research.topic': A }, { 'research.topic': C }, { 'research.topic': 'api-key' }, { 'invented.tool': B }]) {
    const route = resolveStageModelRoute('research.topic', services, parseStageModelPreferences(prefs({ defaultServiceId: B, steps })));
    assert.equal(route.service, null);
    assert.equal(route.reason, 'stale_selection');
  }
  for (const input of [prefs({ defaultServiceId: A }), prefs({ defaultServiceId: B, tasks: { research: C } }), { schemaVersion: 3 }, { ...prefs(), apiKey: 'secret' }]) {
    assert.equal(resolveStageModelRoute('research.topic', services, parseStageModelPreferences(input)).service, null);
  }
  assert.throws(() => resolveStageModelRoute('diagnosis', services, parseStageModelPreferences({})), /Unknown model call/);
});

test('versioned references reject accessors without reading them and preserve v1 defaults', async () => {
  const { parseStageModelPreferences, parseModelPreferences } = await fresh();
  let read = false;
  const getter = Object.defineProperty({}, 'research.topic', { enumerable: true, get() { read = true; return A; } });
  assert.equal(parseStageModelPreferences(prefs({ steps: getter })).invalid, true);
  assert.equal(read, false);
  const result = parseStageModelPreferences({ research: A });
  assert.deepEqual(result, prefs({ tasks: { research: A } }));
  assert.deepEqual(parseModelPreferences(prefs({ defaultServiceId: B, tasks: { report: C } })), { report: C });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.tasks) && Object.isFrozen(result.steps));
});

test('new account store preserves legacy defaults and survives account A-B-A switches', async () => {
  const env = browser();
  env.values.set(PREFIX + OWNER_A, JSON.stringify({ questionnaire: B }));
  const store = await fresh();
  store.setDefaultModelPreference(OWNER_A, A);
  store.setStageModelPreference(OWNER_A, 'report.full', C);
  store.setDefaultModelPreference(OWNER_B, B);
  const first = store.getStageModelPreferences(OWNER_A);
  assert.equal(store.getStageModelPreferences(OWNER_A), first);
  assert.deepEqual(first, prefs({ defaultServiceId: A, tasks: { questionnaire: B }, steps: { 'report.full': C } }));
  assert.deepEqual(store.getStageModelPreferences(OWNER_B), prefs({ defaultServiceId: B }));
  assert.equal(store.getStageModelPreferences(OWNER_A), first);
  store.setModelPreference(OWNER_A, 'research', C);
  assert.deepEqual(store.getModelPreferences(OWNER_A), { questionnaire: B, research: C });
  assert.equal(store.getStageModelPreferences(OWNER_A).steps['report.full'], C);
  const reloaded = await fresh();
  assert.deepEqual(reloaded.getStageModelPreferences(OWNER_A), store.getStageModelPreferences(OWNER_A));
  assert.equal(store.matchesModelConsent({ owner: OWNER_A, identityEpoch: 1, serviceId: A, serviceRevision: 1 }, OWNER_A, 3, service(A, ['research'])), false, 'returning to the same owner does not revive old consent');
});

test('cross-tab updates, clear and setters preserve unrelated step/default/task fields', async () => {
  const env = browser(), store = await fresh();
  store.setDefaultModelPreference(OWNER_A, A);
  store.setStageModelPreference(OWNER_A, 'research.topic', B);
  store.getStageModelPreferences(OWNER_B);
  env.values.set(PREFIX + OWNER_A, JSON.stringify(prefs({ defaultServiceId: A, tasks: { report: C }, steps: { 'research.topic': B, 'report.full': C } })));
  store.setStageModelPreference(OWNER_A, 'research.conversation', A);
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs({ defaultServiceId: A, tasks: { report: C }, steps: { 'research.topic': B, 'report.full': C, 'research.conversation': A } }));
  env.update(OWNER_A, prefs({ defaultServiceId: B }));
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs({ defaultServiceId: B }));
  assert.deepEqual(store.getStageModelPreferences(OWNER_B), prefs());
  env.clear();
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs());
});

test('failed writes retain default and step edits, removals and remote fields until saved', async () => {
  const env = browser({ writeDenied: true }), store = await fresh();
  store.setDefaultModelPreference(OWNER_A, A);
  store.setStageModelPreference(OWNER_A, 'research.topic', B);
  env.update(OWNER_A, prefs({ tasks: { report: C }, steps: { 'report.full': C } }));
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs({ defaultServiceId: A, tasks: { report: C }, steps: { 'research.topic': B, 'report.full': C } }));
  store.setStageModelPreference(OWNER_A, 'research.topic', null);
  store.setDefaultModelPreference(OWNER_A, null);
  env.update(OWNER_A, prefs({ defaultServiceId: A, steps: { 'research.topic': B, 'report.full': C } }));
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs({ steps: { 'report.full': C } }));
  env.allowWrites();
  store.setStageModelPreference(OWNER_A, 'report.full', C);
  assert.deepEqual(JSON.parse(env.values.get(PREFIX + OWNER_A)), prefs({ steps: { 'report.full': C } }));
  env.update(OWNER_A, prefs({ defaultServiceId: B }));
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs({ defaultServiceId: B }));
});

test('denied storage, guest setters, invalid step setters and SSR never leak accounts', async () => {
  const env = browser({ denied: true }), store = await fresh();
  store.setDefaultModelPreference(OWNER_A, A);
  store.setStageModelPreference(OWNER_A, 'research.topic', B);
  for (const owner of [null, 'guest', '']) {
    store.setDefaultModelPreference(owner, C);
    store.setStageModelPreference(owner, 'research.topic', C);
    assert.deepEqual(store.getStageModelPreferences(owner), prefs());
  }
  store.setStageModelPreference(OWNER_A, 'diagnosis', C);
  store.setDefaultModelPreference(OWNER_A, 'secret');
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs({ defaultServiceId: A, steps: { 'research.topic': B } }));
  assert.deepEqual(store.getStageModelPreferences(OWNER_B), prefs());
  assert.equal(env.values.size, 0);
  delete globalThis.window;
  assert.deepEqual(store.getStageModelPreferences(OWNER_A), prefs());
  assert.equal(store.getServerStageModelPreferences(), store.getServerStageModelPreferences());
});
