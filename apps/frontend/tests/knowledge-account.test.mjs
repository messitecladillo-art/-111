import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmedKnowledgeQuery, createKnowledgeAccountSync, isKnownLookupRejection, knowledgeAccountCacheKey, parseStoredKnowledgeLookup, restoreKnowledgeAccountDraft } from '../lib/knowledge/account-sync.ts';

const A = { id: 'p-value', version: 1 }, B = { id: 'confidence-interval', version: 1 };
const wire = (revision = 0, favorites = [], preferences = {}) => ({ revision, favorites, recent: [], preferences });
const ref = entry => ({ entryId: entry.id, entryVersion: entry.version });
const pause = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ids = () => { let next = 0; return () => `aaaaaaaa-aaaa-aaaa-aaaa-${String(++next).padStart(12, '0')}`; };
const error = (status, code) => Object.assign(new Error(code), { status, code });
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values }; };

test('a conflicting idempotency key or a missing existing receipt never releases the recovery locator', () => {
  assert.equal(isKnownLookupRejection(409, 'idempotency_conflict'), false);
  assert.equal(isKnownLookupRejection(409, 'conflict'), false);
  assert.equal(isKnownLookupRejection(400, 'idempotency_conflict'), false);
  assert.equal(isKnownLookupRejection(404, 'not_found', true), false);
  assert.equal(isKnownLookupRejection(503, 'knowledge_lookup_unconfigured'), true);
  assert.equal(isKnownLookupRejection(429, 'knowledge_budget_exhausted'), true);
  assert.equal(isKnownLookupRejection(502, 'provider_failure'), false);
});

test('800ms debounce implementation coalesces rapid edits, with numeric full-version references', async () => {
  let server = wire(); const writes = [];
  const controller = createKnowledgeAccountSync({ debounceMs: 10, createId: ids(), read: async () => server, write: async payload => { writes.push(payload); server = { revision: server.revision + 1, ...payload.state }; return server; } });
  await controller.setIdentity('account-a');
  controller.setFavorite(A); controller.setFavorite(B); controller.setFavorite(A); controller.recordVisit(B); controller.updatePrefs({ query: '置信区间', x: .5 });
  await pause();
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].state.favorites, [ref(B)]); assert.deepEqual(writes[0].state.recent, [ref(B)]);
  assert.equal(writes[0].expectedRevision, 0); assert.equal(controller.getSnapshot().status, 'ready'); assert.equal(controller.getSnapshot().serverRevision, 1);
  assert.equal(controller.getSnapshot().dirty, false); controller.dispose();
});
test('a save receipt never replaces a newer local edit and the next save uses the accepted server revision', async () => {
  const first = deferred(), writes = []; let server = wire();
  const controller = createKnowledgeAccountSync({ debounceMs: 10, createId: ids(), read: async () => server, write: async payload => { writes.push(payload); if (writes.length === 1) return first.promise; server = { revision: 2, ...payload.state }; return server; } });
  await controller.setIdentity('account-a'); controller.setFavorite(A); await pause();
  assert.equal(writes.length, 1); controller.setFavorite(B);
  first.resolve({ revision: 1, ...writes[0].state }); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(controller.getSnapshot().state.favorites, [ref(A), ref(B)]);
  await pause(); assert.equal(writes.length, 2); assert.equal(writes[1].expectedRevision, 1); assert.notEqual(writes[0].idempotencyKey, writes[1].idempotencyKey);
  assert.deepEqual(writes[1].state.favorites, [ref(A), ref(B)]); controller.dispose();
});
test('unknown save stops automatic retries; explicit reconciliation reuses exactly the same request and preserves intervening edits', async () => {
  let server = wire(), fail = true; const writes = [];
  const controller = createKnowledgeAccountSync({ debounceMs: 10, createId: ids(), read: async () => server, write: async payload => { writes.push(structuredClone(payload)); if (fail) throw error(0, 'network_outcome_unknown'); server = { revision: payload.expectedRevision + 1, ...payload.state }; return server; } });
  await controller.setIdentity('account-a'); controller.setFavorite(A); await pause(); assert.equal(controller.getSnapshot().status, 'unknown');
  controller.setFavorite(B); await pause(); assert.equal(writes.length, 1);
  fail = false; await controller.reconcile(); assert.deepEqual(writes[1], writes[0]);
  assert.deepEqual(controller.getSnapshot().state.favorites, [ref(A), ref(B)]);
  controller.dispose();
});
test('CAS conflict keeps a recoverable local draft; explicit discard is the only reload that replaces it', async () => {
  let server = wire(); const cache = storage(), writes = [];
  const controller = createKnowledgeAccountSync({ storage: cache, debounceMs: 10, createId: ids(), read: async () => server, write: async payload => { writes.push(payload); server = wire(1, [ref(B)]); throw error(409, 'version_conflict'); } });
  await controller.setIdentity('account-a'); controller.setFavorite(A); await pause();
  assert.equal(controller.getSnapshot().status, 'conflict'); assert.deepEqual(controller.getSnapshot().state.favorites, [ref(A)]);
  await controller.reload(); assert.equal(controller.getSnapshot().status, 'conflict'); assert.deepEqual(controller.getSnapshot().state.favorites, [ref(A)]); assert.equal(writes.length, 1);
  assert.ok(restoreKnowledgeAccountDraft(cache.getItem(knowledgeAccountCacheKey('account-a')), 'account-a'));
  await controller.discardLocalAndReload(); assert.deepEqual(controller.getSnapshot().state.favorites, [ref(B)]); assert.equal(controller.getSnapshot().dirty, false); assert.equal(cache.getItem(knowledgeAccountCacheKey('account-a')), null);
  controller.dispose();
});
test('account changes immediately clear old favorites and fence late read/save results', async () => {
  const oldRead = deferred(); let reads = 0;
  const controller = createKnowledgeAccountSync({ createId: ids(), read: async () => ++reads === 1 ? oldRead.promise : wire(2, [ref(B)]), write: async () => wire() });
  const first = controller.setIdentity('account-a'); const second = controller.setIdentity('account-b');
  assert.equal(controller.getSnapshot().accountId, 'account-b'); assert.deepEqual(controller.getSnapshot().state.favorites, []);
  await second; oldRead.resolve(wire(1, [ref(A)])); await first;
  assert.deepEqual(controller.getSnapshot().state.favorites, [ref(B)]); controller.dispose();
});
test('refresh restores unresolved key while preserving newer cached edits, without automatic dispatch', async () => {
  const cache = storage(); let server = wire(); const writes = [];
  const first = createKnowledgeAccountSync({ storage: cache, debounceMs: 10, createId: ids(), read: async () => server, write: async payload => { writes.push(structuredClone(payload)); throw error(0, 'network_outcome_unknown'); } });
  await first.setIdentity('account-a'); first.setFavorite(A); await pause(); first.setFavorite(B); first.dispose();
  const restored = createKnowledgeAccountSync({ storage: cache, debounceMs: 10, createId: ids(), read: async () => server, write: async payload => { writes.push(structuredClone(payload)); server = { revision: 1, ...payload.state }; return server; } });
  await restored.setIdentity('account-a'); await pause(); assert.equal(writes.length, 1); assert.equal(restored.getSnapshot().status, 'unknown');
  await restored.reconcile(); assert.deepEqual(writes[1], writes[0]); assert.deepEqual(restored.getSnapshot().state.favorites, [ref(A), ref(B)]);
  restored.dispose();
});
test('reconciliation checks current state after an idempotent historical receipt and does not overwrite another tab', async () => {
  let server = wire(), fail = true, saved; const writes = [];
  const controller = createKnowledgeAccountSync({ debounceMs: 10, createId: ids(), read: async () => server, write: async payload => { writes.push(payload); if (fail) { saved = { revision: 1, ...payload.state }; throw error(0, 'network_outcome_unknown'); } return saved; } });
  await controller.setIdentity('account-a'); controller.setFavorite(A); await pause();
  server = wire(2, [ref(B)]); fail = false; await controller.reconcile();
  assert.equal(controller.getSnapshot().status, 'conflict'); assert.equal(controller.getSnapshot().serverRevision, 2); assert.deepEqual(controller.getSnapshot().state.favorites, [ref(A)]); await pause(); assert.equal(writes.length, 2);
  controller.dispose();
});
test('edits during initial loading remain local and become an explicit conflict rather than disappearing', async () => {
  const reading = deferred();
  const controller = createKnowledgeAccountSync({ read: async () => reading.promise, write: async () => wire(), createId: ids() });
  const load = controller.setIdentity('account-a'); controller.setFavorite(A); reading.resolve(wire(4, [ref(B)])); await load;
  assert.equal(controller.getSnapshot().status, 'conflict'); assert.deepEqual(controller.getSnapshot().state.favorites, [ref(A)]); controller.dispose();
});
test('cache identity and field whitelist exclude foreign accounts, raw pages and malformed API data', () => {
  const valid = JSON.stringify({ schemaVersion: 1, accountId: 'a', state: wire(1), pending: null });
  assert.ok(restoreKnowledgeAccountDraft(valid, 'a')); assert.equal(restoreKnowledgeAccountDraft(valid, 'b'), null);
  assert.equal(restoreKnowledgeAccountDraft(JSON.stringify({ schemaVersion: 1, accountId: 'a', state: { ...wire(), rows: [] }, pending: null }), 'a'), null);
  assert.equal(restoreKnowledgeAccountDraft(JSON.stringify({ schemaVersion: 1, accountId: 'a', state: wire(), pending: null, ocrImage: 'private' }), 'a'), null);
});
test('lookup recovery locators bind identity, short query, immutable key and allowed status only', () => {
  const operation = { schemaVersion: 1, accountId: 'a', idempotencyKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', query: 'SEM', status: 'outcome_unknown' };
  assert.deepEqual(parseStoredKnowledgeLookup(JSON.stringify(operation), 'a'), operation);
  assert.equal(parseStoredKnowledgeLookup(JSON.stringify(operation), 'b'), null);
  for (const patch of [{ query: 'x\ny' }, { pageText: 'private' }, { ocrImage: 'private' }, { query: 'x'.repeat(121) }, { receiptId: '../other' }, { status: 'success' }]) assert.equal(parseStoredKnowledgeLookup(JSON.stringify({ ...operation, ...patch }), 'a'), null);
  assert.equal(confirmedKnowledgeQuery(' ＳＥＭ '), 'SEM'); assert.equal(confirmedKnowledgeQuery('😀'.repeat(60)).length, 120);
  for (const invalid of ['', 'x\ny', 'x\ty', 'x'.repeat(121), '\ud800', 'x\u2028y']) assert.throws(() => confirmedKnowledgeQuery(invalid));
});
