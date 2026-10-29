import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listCloudThreads, saveCloudThread } from '../components/hosted/cloud-process-client.ts';

const withFetch = async (mock, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
};
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

test('cloud process requests use the project/thread path and an expected revision', async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    calls.push({ url, body: init?.body });
    if (init?.method === 'PUT') return response({ threadId: 'thread-1', title: '对话', revision: 2, contentHash: 'a'.repeat(64), updatedAt: '2026-10-29T00:00:00Z' });
    return response({ threads: [{ threadId: 'thread-1', title: '对话', revision: 1, updatedAt: '2026-10-29T00:00:00Z', contentHash: 'b'.repeat(64) }] });
  }, async () => {
    const heads = await listCloudThreads('p-1');
    assert.equal(heads[0].revision, 1);
    await saveCloudThread('p-1', 'thread-1', { expectedRevision: 1, title: '对话', messages: [], events: [], checkpoint: null });
  });
  assert.equal(calls[0].url, '/api/projects/p-1/agent-threads');
  assert.match(calls[1].url, /\/api\/projects\/p-1\/agent-threads\/thread-1$/);
  const body = JSON.parse(calls[1].body);
  assert.equal(body.expectedRevision, 1);
  assert.equal(body.schemaVersion, 1);
  assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/);
});
