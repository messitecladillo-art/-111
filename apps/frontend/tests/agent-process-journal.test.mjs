import assert from 'node:assert/strict';
import { test } from 'node:test';

const fake = () => { const map = new Map(); return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
const local = fake(), session = fake(), handlers = [];
globalThis.window = { localStorage: local, sessionStorage: session, addEventListener: (type, fn) => { if (type === 'storage') handlers.push(fn); } };
const { processJournal } = await import('../components/agent/process-journal.ts');
const event = (id, threadId = 't1') => ({ id, threadId, at: Number(id.slice(1)) || 1, kind: 'user.message', summary: `第 ${id} 步` });

test('events append in order and survive a reload', async () => {
  processJournal.bind('ann');
  assert.equal(processJournal.append('t1', event('e1')), true);
  assert.equal(processJournal.append('t1', event('e2')), true);
  processJournal.saveCheckpoint('t1', { id: 'c1', threadId: 't1', at: 2, eventId: 'e2', projectId: 'p1' });
  const fresh = await import('../components/agent/process-journal.ts?reload');
  fresh.processJournal.bind('ann');
  assert.deepEqual(fresh.processJournal.events('t1').map(item => item.id), ['e1', 'e2']);
  assert.equal(fresh.processJournal.checkpoint('t1').eventId, 'e2');
});

test('another identity cannot read this journal, and deletion leaves a tombstone', async () => {
  processJournal.bind('bob');
  assert.deepEqual(processJournal.events('t1'), []);
  processJournal.bind('ann');
  processJournal.remove('t1');
  assert.deepEqual(processJournal.events('t1'), []);
  assert.equal(processJournal.append('t1', event('e3')), false);
});

test('storage failure is reported instead of silently dropping the event', async () => {
  processJournal.bind('guest');
  const original = session.setItem;
  session.setItem = () => { throw new Error('QuotaExceededError'); };
  const ok = processJournal.append('new-thread', { ...event('e9', 'new-thread') });
  session.setItem = original;
  assert.equal(ok, false);
});
