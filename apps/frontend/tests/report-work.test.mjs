import test from 'node:test';
import assert from 'node:assert/strict';
import { reportWorkState, reportWorkPlacement, ReportRunFence } from '../lib/agent/report-work.ts';

const live = extra => ({ active: true, phase: 'wave1', completed: 2, total: 8, paragraphs: 6, facts: 3,
  lastSectionId: 's1', lastSectionTitle: '调查设计', topicTitle: '示例', autoFollow: true, ...extra });

test('a request has no confirmed counts before the server returns its plan', () => {
  assert.deepEqual(reportWorkState(live({ phase: 'contract', total: 26, completed: 8 })), {
    phase: 'preparing', completed: 0, total: 0, detail: '等待接收章节计划与研究材料',
  });
});
test('counts describe sections received and the latest receipt, not a fabricated percent', () => {
  assert.deepEqual(reportWorkState(live({})), { phase: 'writing', completed: 2, total: 8, detail: '最近写入：调查设计' });
  assert.equal(reportWorkState(live({ phase: 'wave2' })).phase, 'writing');
  assert.equal(reportWorkState(live({ phase: 'repair' })).phase, 'reviewing');
  assert.deepEqual(reportWorkState(live({ total: NaN, completed: Infinity })).completed, 0);
  assert.equal(reportWorkState(live({ total: 3, completed: 8 })).completed, 3);
});
test('failure stops activity, completion removes the screen-only placeholder, and idle never invents a task', () => {
  assert.equal(reportWorkState(live({ active: false, phase: 'error' })).phase, 'error');
  assert.equal(reportWorkState(live({ active: false, phase: 'done' })), null);
  assert.equal(reportWorkState(live({ active: false })), null);
  assert.equal(reportWorkState(null), null);
});
test('one task dispatch stays exclusive; an obsolete finish cannot release a newer task', () => {
  const gate = new ReportRunFence();
  const scope = { owner: 'a', epoch: 1, thread: 't', project: 'p' };
  const old = gate.start(scope);
  assert.ok(old);
  assert.equal(gate.start(scope), null);
  gate.cancel();
  assert.equal(old.controller.signal.aborted, true);
  const next = gate.start(scope);
  gate.finish(old);
  assert.equal(gate.accepts(next, scope), true);
  gate.finish(next);
  assert.equal(gate.active, false);
});
test('abandoning a scope settles its UI exactly once and never revives a running envelope', () => {
  const gate = new ReportRunFence();
  const scope = { owner: 'a', epoch: 1, thread: 't', project: 'p' };
  let ui = 'running', settlements = 0;
  gate.start(scope, () => { ui = 'unknown'; settlements++; });
  gate.cancelScope(scope);
  gate.cancelScope(scope);
  assert.equal(ui, 'unknown');
  assert.equal(settlements, 1);
  assert.equal(gate.active, false);
});
for (const [field, value] of [['owner', 'b'], ['epoch', 2], ['thread', 'other'], ['project', 'other']]) {
  test(`a delayed reply cannot enter another ${field}`, () => {
    const gate = new ReportRunFence();
    const scope = { owner: 'a', epoch: 1, thread: 't', project: 'p' };
    const ticket = gate.start(scope);
    assert.equal(gate.accepts(ticket, { ...scope, [field]: value }), false);
    gate.cancelScope({ ...scope, [field]: value });
    assert.equal(gate.accepts(ticket, scope), true);
    gate.cancelScope(scope);
    assert.equal(gate.accepts(ticket, scope), false);
  });
}
test('the apparatus fits wholly below content; it does not fit within text, cover or footer', () => {
  const pages = [{ first: 0, last: 1, start: 0, end: 200 }, { first: 2, last: 2, start: 200, end: 900 }];
  assert.deepEqual(reportWorkPlacement(pages, [0, 100, 200], [100, 100, 700], ['body', 'body', 'body'], 900, 260), { page: 0, top: 224 });
  assert.equal(reportWorkPlacement(pages, [0, 100, 200], [100, 100, 700], ['cover', 'cover', 'body'], 900, 260), null);
  assert.equal(reportWorkPlacement(pages, [0, 100, 200], [100, 100, 700], ['body', 'body', 'body'], 900, 260, 1), null);
  assert.equal(reportWorkPlacement([], [], [], [], 900, 260), null);
  assert.equal(reportWorkPlacement(pages, [NaN], [], ['body'], 900, 260), null);
});
