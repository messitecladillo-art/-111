import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../app/api/local-agent/turn/route.ts';

const body = (extra = {}) => ({
  provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-test-1234567890',
  request: { schemaVersion: 1, idempotencyKey: '11111111-1111-4111-8111-111111111111', message: '下一步做什么', history: [], context: { room: null } },
  ...extra,
});
const post = value => POST(new Request('http://localhost/api/local-agent/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }));

test('a local provider reply becomes a ready chat receipt with its actions', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/api\.deepseek\.com\/v1\/chat\/completions$/);
    assert.equal(JSON.parse(init.body).model, 'deepseek-chat');
    return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: '先补齐问卷映射。', actions: [{ tool: 'next', args: {} }] }) } }] });
  };
  try {
    const response = await post(body());
    const receipt = await response.json();
    assert.equal(response.status, 200);
    assert.equal(receipt.status, 'ready');
    assert.equal(receipt.reply, '先补齐问卷映射。');
    assert.deepEqual(receipt.actions, [{ tool: 'next', args: {} }]);
  } finally { globalThis.fetch = original; }
});

test('a short key is refused before any provider call', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw Error('should not call'); };
  try {
    const response = await post(body({ apiKey: 'short' }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_key');
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
});

test('a provider failure is a failed receipt, not a fake answer', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('no', { status: 401 });
  try {
    const response = await post(body());
    const receipt = await response.json();
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.errorCode, 'authentication_failed');
    assert.equal(receipt.reply, null);
  } finally { globalThis.fetch = original; }
});
