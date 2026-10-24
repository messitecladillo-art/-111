import assert from 'node:assert/strict';
import { test } from 'node:test';

// The transcript store reads the tab's sessionStorage; a map stands in for it.
const storage = new Map();
globalThis.window = { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) } };
const { stamp, transcript } = await import('../components/agent/transcript-store.ts');
const KEY = 'evix.agent.transcript.v2';
const say = text => transcript.update(list => [...list, { ...stamp(), role: 'user', text }]);
const texts = () => transcript.snapshot().map(m => m.text);

test('the transcript belongs to one identity: another account starts empty and the previous one is purged', () => {
  storage.set('evix.agent.transcript.v1', JSON.stringify([{ id: 'old', at: 1, role: 'user', text: '旧版不分账号的记录' }]));
  storage.set(KEY, JSON.stringify({ owner: 'someone-else', messages: [{ id: 'x', at: 1, role: 'user', text: '别的账号的研究需求' }] }));
  assert.deepEqual(texts(), [], 'nothing stored is shown before the identity is known');
  say('登录完成前输入的话');
  transcript.bind('alice');
  assert.deepEqual(texts(), ['登录完成前输入的话'], 'a stored transcript of another account is not restored');
  assert.equal(storage.has('evix.agent.transcript.v1'), false, 'the unscoped v1 transcript is removed');
  assert.doesNotMatch(storage.get(KEY), /别的账号/);
  say('alice 的研究需求');
  transcript.bind('alice');
  assert.equal(texts().length, 2, 'binding the same identity again changes nothing');
  // A shell mounted after the account changed renders before bind runs: what it reads must already be empty.
  assert.equal(transcript.view('alice').length, 2);
  assert.deepEqual(transcript.view('bob'), [], 'another account sees nothing of alice, even before binding');
  assert.deepEqual(transcript.view(null), [], 'nor does a session still being checked');
  transcript.bind('bob');
  assert.deepEqual(texts(), [], 'another account starts empty');
  assert.doesNotMatch(storage.get(KEY), /alice/, "and the previous account's transcript is gone from storage");
  say('bob 的话');
  transcript.bind('guest');
  assert.deepEqual(texts(), [], 'signing out drops it too');
  assert.equal(JSON.parse(storage.get(KEY)).owner, 'guest');
});
