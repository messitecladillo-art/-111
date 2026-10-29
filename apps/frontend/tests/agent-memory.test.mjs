import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchMemory, saveMemory } from '../components/hosted/project-memory-client.ts';

const intent = Object.fromEntries(['title', 'researchQuestion', 'decisionGoal', 'population', 'geography', 'stage'].map(field => [field, { value: '', status: 'unknown' }]));
const snapshot = {
  schemaVersion: 1, projectId: 'p-1', revision: 2, contentHash: 'a'.repeat(64),
  document: { schemaVersion: 1, intent, decisions: [], openQuestions: [] },
  permissions: { role: 'editor', canEdit: true }, seed: null,
};
const withFetch = async (mock, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
};

test('memory requests carry the project and an expected revision', async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    calls.push({ url, body: init?.body });
    return new Response(JSON.stringify(snapshot), { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const result = await fetchMemory('p-1');
    assert.equal(result.revision, 2);
    await saveMemory('p-1', { expectedRevision: 2, document: snapshot.document, changeNote: '' });
  });
  assert.equal(calls[0].url, '/api/projects/p-1/memory');
  assert.match(calls[1].url, /\/api\/projects\/p-1\/memory\/versions$/);
  const body = JSON.parse(calls[1].body);
  assert.equal(body.expectedRevision, 2);
  assert.equal(body.schemaVersion, 1);
  assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.equal(body.changeNote, '');
});
