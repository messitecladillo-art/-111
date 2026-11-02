import test from 'node:test';
import assert from 'node:assert/strict';
const store = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m }; };
const local = store(), session = store();
globalThis.window = { localStorage: local, sessionStorage: session, addEventListener() {} };
const { readReportDraft, saveReportDraft, flushReportDraft } = await import('../lib/agent/report-draft.ts');
const { createEditorContent } = await import('../lib/editor-model.ts');

test('a draft comes back after a reload, for its own identity only', () => {
  const content = { ...createEditorContent(), title: '合成测试报告' };
  saveReportDraft('user-1', content);
  assert.equal(readReportDraft('user-1'), null, 'writes are coalesced, not made on every keystroke');
  assert.equal(flushReportDraft(), true);
  assert.equal(readReportDraft('user-1').title, '合成测试报告');
  assert.equal(readReportDraft('user-2'), null);
  assert.equal(readReportDraft('guest'), null);
});
test('a guest keeps the draft for the tab, not in the browser at large', () => {
  saveReportDraft('guest', { ...createEditorContent(), title: '访客草稿' }); flushReportDraft();
  assert.ok([...session.map.keys()].some(k => k.endsWith(':guest')));
  assert.ok(![...local.map.keys()].some(k => k.endsWith(':guest')));
});
test('switching identity writes the first one out before the second can overwrite it', () => {
  saveReportDraft('user-3', { ...createEditorContent(), title: '三' });
  saveReportDraft('user-4', { ...createEditorContent(), title: '四' });
  flushReportDraft();
  assert.equal(readReportDraft('user-3').title, '三'); assert.equal(readReportDraft('user-4').title, '四');
});
test('a stored draft that no longer parses is dropped, never half-loaded', () => {
  local.setItem('evix.agent.report-draft.v1:user-5', '{"version":2,"report":"broken"}');
  assert.equal(readReportDraft('user-5'), null);
  local.setItem('evix.agent.report-draft.v1:user-6', 'not json');
  assert.equal(readReportDraft('user-6'), null);
});
