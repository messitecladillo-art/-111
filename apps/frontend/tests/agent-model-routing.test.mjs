import assert from 'node:assert/strict';
import { test } from 'node:test';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PREFIX = 'evix.agent.model-routing.v1:';
const service = (id, capabilities, extra = {}) => ({ id, label: `Service ${id[0]}`, provider: 'compatible', baseUrl: 'https://models.example.test/v1', model: 'synthetic-model', maxOutputTokens: 1024, capabilities, revision: 1, ...extra });
let sequence = 0;
const fresh = () => import(`../lib/agent/model-routing.ts?test=${++sequence}`);
function browser({ denied = false, writeDenied = false } = {}) {
  const values = new Map(), listeners = new Set();
  const storage = {
    getItem(key) { if (denied) throw Error('storage denied'); return values.get(key) ?? null; },
    setItem(key, value) { if (denied || writeDenied) throw Error('storage denied'); values.set(key, String(value)); },
    removeItem(key) { if (denied) throw Error('storage denied'); values.delete(key); },
  };
  globalThis.window = { localStorage: storage, addEventListener(type, listener) { if (type === 'storage') listeners.add(listener); } };
  return { values, storage, allowWrites() { writeDenied = false; }, update(key, value, storageArea = storage) {
    if (value === null) values.delete(key); else values.set(key, value);
    for (const listener of listeners) listener({ key, storageArea });
  }, clear() { values.clear(); for (const listener of listeners) listener({ key: null, storageArea: storage }); } };
}

test('each task resolves only its own selected capable service and preserves its current revision', async () => {
  const { eligibleModelServices, resolveModelRoute } = await fresh();
  const research = service(A, ['research']), survey = service(B, ['questionnaire']), writing = service(C, ['report'], { revision: 7 });
  const services = [research, survey, writing], preferences = { research: A, questionnaire: B, report: C };
  assert.deepEqual(eligibleModelServices('report', services), [writing]);
  for (const [task, expected] of [['research', research], ['questionnaire', survey], ['report', writing]]) {
    const route = resolveModelRoute(task, services, preferences);
    assert.equal(route.service, expected);
    assert.equal(route.capability, task);
    assert.equal(route.reason, 'selected');
  }
});

test('only a single eligible service is an initial default; multiple services require a choice', async () => {
  const { resolveModelRoute } = await fresh();
  const first = service(A, ['research']), second = service(B, ['research']);
  assert.equal(resolveModelRoute('research', [first], {}).service, first);
  assert.equal(resolveModelRoute('research', [first], {}).reason, 'only_eligible');
  assert.equal(resolveModelRoute('research', [first, second], {}).service, null);
  assert.equal(resolveModelRoute('research', [second, first], {}).reason, 'unselected');
  assert.equal(resolveModelRoute('report', [first, second], {}).reason, 'no_eligible');
});

test('a removed or capability-changed explicit choice never falls back to another paid destination', async () => {
  const { resolveModelRoute } = await fresh();
  for (const services of [[service(B, ['research'])], [service(A, ['report']), service(B, ['research'])], []]) {
    const route = resolveModelRoute('research', services, { research: A });
    assert.equal(route.service, null);
    assert.equal(route.reason, 'stale_selection');
  }
  assert.equal(resolveModelRoute('report', [service(A, ['research'])], { report: A }).service, null);
});

test('consent belongs to the exact owner, identity epoch, service and service revision', async () => {
  const { matchesModelConsent } = await fresh();
  const current = service(A, ['research'], { revision: 4 });
  const binding = { owner: OWNER_A, identityEpoch: 2, serviceId: A, serviceRevision: 4 };
  assert.equal(matchesModelConsent(binding, OWNER_A, 2, current), true);
  for (const [receipt, owner, epoch, selected] of [
    [undefined, OWNER_A, 2, current], [binding, null, 2, current], [binding, OWNER_B, 2, current],
    [binding, OWNER_A, 3, current], [binding, OWNER_A, 2, null],
    [binding, OWNER_A, 2, service(B, ['research'], { revision: 4 })],
    [binding, OWNER_A, 2, { ...current, revision: 5 }],
    [{ ...binding, identityEpoch: -1 }, OWNER_A, -1, current],
    [{ ...binding, identityEpoch: 0.5 }, OWNER_A, 0.5, current],
    [{ ...binding, identityEpoch: Number.MAX_SAFE_INTEGER + 1 }, OWNER_A, Number.MAX_SAFE_INTEGER + 1, current],
    [{ ...binding, serviceRevision: 0 }, OWNER_A, 2, { ...current, revision: 0 }],
    [{ ...binding, serviceRevision: 1.5 }, OWNER_A, 2, { ...current, revision: 1.5 }],
    [{ ...binding, owner: 'guest' }, 'guest', 2, current],
  ]) assert.equal(matchesModelConsent(receipt, owner, epoch, selected), false);
});

test('preferences accept only three task UUID references and reject credentials, config and accessors', async () => {
  const { parseModelPreferences } = await fresh();
  assert.deepEqual(parseModelPreferences({ research: A, questionnaire: B, report: C }), { research: A, questionnaire: B, report: C });
  let getterRead = false;
  const getter = Object.defineProperty({}, 'research', { enumerable: true, get() { getterRead = true; return A; } });
  for (const invalid of [null, [], 'value', { research: '' }, { research: 'api-key' }, { defense: A }, { research: A, apiKey: 'secret' }, { research: A, model: 'some-model' }, Object.assign(Object.create({ report: C }), { research: A }), getter]) {
    assert.deepEqual(parseModelPreferences(invalid), {});
  }
  assert.equal(getterRead, false);
  assert.equal(Object.isFrozen(parseModelPreferences({ research: A })), true);
});

test('the preference store isolates identities, clears one task and notifies same-tab subscribers', async () => {
  const env = browser();
  const store = await fresh();
  const first = store.getModelPreferences(OWNER_A);
  assert.equal(store.getModelPreferences(OWNER_A), first, 'React snapshots stay stable until a preference changes');
  let notifications = 0;
  const unsubscribe = store.subscribeModelPreferences(() => notifications++);
  store.setModelPreference(OWNER_A, 'research', A);
  store.setModelPreference(OWNER_A, 'report', C);
  assert.deepEqual(store.getModelPreferences(OWNER_A), { research: A, report: C });
  assert.deepEqual(store.getModelPreferences(OWNER_B), {});
  store.setModelPreference(OWNER_B, 'questionnaire', B);
  assert.deepEqual(store.getModelPreferences(OWNER_A), { research: A, report: C });
  store.setModelPreference(OWNER_A, 'research', null);
  assert.deepEqual(store.getModelPreferences(OWNER_A), { report: C });
  assert.deepEqual(JSON.parse(env.values.get(PREFIX + OWNER_A)), { report: C });
  assert.equal(notifications, 4);
  unsubscribe();
  store.setModelPreference(OWNER_A, 'research', A);
  assert.equal(notifications, 4);
  const reloaded = await fresh();
  assert.deepEqual(reloaded.getModelPreferences(OWNER_A), { research: A, report: C });
});

test('guest, missing identities and malformed setters cannot create global preferences', async () => {
  const env = browser(), store = await fresh();
  for (const owner of [null, '', 'guest', 'not-an-account']) {
    store.setModelPreference(owner, 'research', A);
    assert.deepEqual(store.getModelPreferences(owner), {});
  }
  store.setModelPreference(OWNER_A, 'defense', A);
  store.setModelPreference(OWNER_A, 'research', 'not-a-uuid');
  store.setModelPreference(OWNER_A, 'report', undefined);
  assert.deepEqual(store.getModelPreferences(OWNER_A), {});
  assert.equal(env.values.size, 0);
});

test('storage denial keeps account-scoped selections usable in memory and SSR remains empty', async () => {
  browser({ denied: true });
  const store = await fresh();
  store.setModelPreference(OWNER_A, 'research', A);
  assert.deepEqual(store.getModelPreferences(OWNER_A), { research: A });
  assert.deepEqual(store.getModelPreferences(OWNER_B), {});
  assert.deepEqual(store.getServerModelPreferences(), {});
  assert.equal(store.getServerModelPreferences(), store.getServerModelPreferences());
  delete globalThis.window;
  assert.deepEqual(store.getModelPreferences(OWNER_A), {}, 'server reads never expose a cached browser owner');
});

test('another tab refreshes only the changed owner, including removal and clear', async () => {
  const env = browser(), store = await fresh();
  store.setModelPreference(OWNER_A, 'research', A);
  store.setModelPreference(OWNER_B, 'questionnaire', B);
  const other = store.getModelPreferences(OWNER_B);
  let notifications = 0;
  const unsubscribe = store.subscribeModelPreferences(() => notifications++);
  env.update(PREFIX + OWNER_A, JSON.stringify({ report: C }));
  assert.deepEqual(store.getModelPreferences(OWNER_A), { report: C });
  assert.equal(store.getModelPreferences(OWNER_B), other);
  env.update('unrelated-storage-key', 'irrelevant');
  assert.equal(notifications, 1);
  env.update(PREFIX + OWNER_A, null);
  assert.deepEqual(store.getModelPreferences(OWNER_A), {});
  env.clear();
  assert.deepEqual(store.getModelPreferences(OWNER_B), {});
  unsubscribe();
});

test('malformed cross-tab JSON clears that owner rather than retaining an obsolete selection', async () => {
  const env = browser(), store = await fresh();
  store.setModelPreference(OWNER_A, 'research', A);
  env.update(PREFIX + OWNER_A, '{bad-json');
  assert.deepEqual(store.getModelPreferences(OWNER_A), {});
});

test('changing one task preserves another tab’s other task before its storage event arrives', async () => {
  const env = browser(), store = await fresh();
  store.setModelPreference(OWNER_A, 'research', A);
  env.values.set(PREFIX + OWNER_A, JSON.stringify({ research: A, report: C }));
  store.setModelPreference(OWNER_A, 'questionnaire', B);
  assert.deepEqual(store.getModelPreferences(OWNER_A), { research: A, questionnaire: B, report: C });
  assert.deepEqual(JSON.parse(env.values.get(PREFIX + OWNER_A)), { research: A, questionnaire: B, report: C });
});

test('quota denial preserves multiple unsaved tasks and deletions while merging other-tab updates', async () => {
  const env = browser({ writeDenied: true }), store = await fresh();
  store.setModelPreference(OWNER_A, 'research', A);
  store.setModelPreference(OWNER_A, 'report', C);
  assert.deepEqual(store.getModelPreferences(OWNER_A), { research: A, report: C });
  env.update(PREFIX + OWNER_A, JSON.stringify({ questionnaire: B }));
  assert.deepEqual(store.getModelPreferences(OWNER_A), { research: A, questionnaire: B, report: C });
  store.setModelPreference(OWNER_A, 'research', null);
  env.update(PREFIX + OWNER_A, JSON.stringify({ research: A, questionnaire: B }));
  assert.deepEqual(store.getModelPreferences(OWNER_A), { questionnaire: B, report: C }, 'a failed deletion is not resurrected by old storage');
  env.allowWrites();
  store.setModelPreference(OWNER_A, 'report', C);
  assert.deepEqual(JSON.parse(env.values.get(PREFIX + OWNER_A)), { questionnaire: B, report: C }, 'a repeated selection flushes the unsaved task overlay');
  env.update(PREFIX + OWNER_A, JSON.stringify({ research: A }));
  assert.deepEqual(store.getModelPreferences(OWNER_A), { research: A }, 'a successful save releases the overlay for future storage events');
});
