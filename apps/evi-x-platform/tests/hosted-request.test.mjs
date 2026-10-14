import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedRequest } from '../components/hosted/api-client.ts';

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  // AbortSignal.timeout does not keep Node alive; this is only a test watchdog.
  const watchdog = setTimeout(() => {}, 1500);
  try { await run(); } finally { clearTimeout(watchdog); globalThis.fetch = original; }
}
test('caller cancellation and the request deadline both abort a stalled fetch', async () => {
  for (const cancel of [false, true]) {
    const caller = new AbortController(); let observed;
    await withFetch((_path, init) => new Promise((_resolve, reject) => {
      observed = init.signal;
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      if (cancel) caller.abort();
    }), async () => {
      await assert.rejects(hostedRequest('/api/example', { signal: caller.signal, timeoutMs: 15 }), e => e.code === 'network_outcome_unknown');
      assert.equal(observed.aborted, true);
      assert.equal(caller.signal.aborted, cancel, 'deadline does not mutate the caller controller');
    });
  }
});
test('deadline remains active while reading a response body', async () => {
  const caller = new AbortController(); let observed;
  await withFetch((_path, init) => {
    observed = init.signal;
    return Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'));
        init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
      },
    }), { headers: { 'content-type': 'application/json' } }));
  }, async () => {
    await assert.rejects(hostedRequest('/api/example', { signal: caller.signal, timeoutMs: 15 }), e => e.code === 'invalid_server_receipt');
    assert.equal(observed.aborted, true);
    assert.equal(caller.signal.aborted, false);
  });
});
test('bounded reads preserve CSRF, JSON body and duplicate-member rejection', async () => {
  await withFetch((_path, init) => {
    assert.equal(init.headers.get('X-CSRF-Token'), 'synthetic-csrf');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.body, '{"title":"合成验收"}');
    return Promise.resolve(new Response('{"ok":true}'));
  }, async () => assert.deepEqual(await hostedRequest('/api/example', { body: { title: '合成验收' }, csrfToken: 'synthetic-csrf', maxBytes: 64 }), { ok: true }));
  for (const raw of ['{"ok":true,"ok":false}', 'x'.repeat(65)]) {
    await withFetch(() => Promise.resolve(new Response(raw)), async () => {
      await assert.rejects(hostedRequest('/api/example', { maxBytes: 64 }), e => e.code === 'invalid_server_receipt');
    });
  }
});
