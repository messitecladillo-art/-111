import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeProcessEvent, makeProcessCheckpoint, eventLabel } from '../lib/agent/process.ts';

test('an event keeps its summary, correlation and refs', () => {
  const event = makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'model.request', summary: '请求「服务甲」回答', correlationId: 'c1', refs: ['project:p1'] });
  assert.equal(event.kind, 'model.request');
  assert.equal(event.correlationId, 'c1');
  assert.deepEqual(event.refs, ['project:p1']);
});

test('events reject unknown kinds, blank summaries and oversized detail', () => {
  assert.throws(() => makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'unknown', summary: 'x' }));
  assert.throws(() => makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'user.message', summary: '  ' }));
  const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, 'x']));
  assert.throws(() => makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'model.request', summary: 'x', detail: many }));
});

test('a checkpoint points at the last event and the project memory revision', () => {
  const checkpoint = makeProcessCheckpoint({ id: 'c1', threadId: 't1', at: 2, eventId: 'e1', messageId: 'm1', projectId: 'p1', memoryRevision: 3 });
  assert.equal(checkpoint.eventId, 'e1');
  assert.equal(checkpoint.memoryRevision, 3);
  assert.equal(eventLabel('model.receipt'), '模型回执');
});
