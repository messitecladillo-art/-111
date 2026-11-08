import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorContent } from '../lib/editor-model.ts';
import { applySectionRevision, prepareSectionRevision, proposalFromReceipt, revisionProblem } from '../lib/agent/section-revision.ts';

const scope = { owner: 'account-a', epoch: 2, thread: 'thread-a', project: 'project-a' };
const service = { id: 'service-a', revision: 1 };
const block = (id, kind, text) => ({ id, kind, text, evidenceId: '', valueColumn: 1 });
function input() {
  const content = createEditorContent();
  content.version = 2;
  content.report[0] = { id: 'target', title: '地方消费现象', body: '【教学模拟数据，不能作为真实调查证据】\n原文第一段。\n原文第二段。', source: '已有来源',
    blocks: [block('before', 'paragraph', '图前解释。'), block('fig', 'formula', 'x+y'), block('after', 'paragraph', '图后解释。'), block('note', 'callout', '保留的重点说明。'), block('cite', 'citation', '保留的引用。')] };
  return { content, version: 4, inputVersion: 'dataset-1' };
}
function candidate(snapshot = input()) {
  const prepared = prepareSectionRevision(snapshot, 'target', null, scope, service);
  const receipt = { id: prepared.request.idempotencyKey, node: 'section.revision', status: 'ready', paragraphs: ['修订正文甲。', '修订正文乙。', '修订正文丙。', '修订正文丁。'].map(text => ({ text, facts: [] })), droppedParagraphs: 0, errorCode: null, usage: null };
  return { prepared, proposal: proposalFromReceipt(prepared, receipt), receipt };
}

test('exact section prose and explicit allowed context, no other sections or raw data in request', () => {
  const s = input(); s.content.report[1].body = '其他章节私有内容。';
  const { prepared } = candidate(s), json = JSON.stringify(prepared.request);
  assert.equal(prepared.request.section.title, '地方消费现象');
  assert.equal(prepared.original.length, 4);
  assert.ok(!json.includes('其他章节私有内容'));
  assert.ok(!json.includes('保留的重点说明'));
  assert.equal(prepared.request.outline, undefined);
  assert.equal(prepared.request.consent, true);
  assert.deepEqual(prepared.request.facts, []);
});

test('apply changes prose only, retains diagram position, source and synthetic declaration', () => {
  const s = input(), before = structuredClone(s), { proposal } = candidate(s);
  const next = applySectionRevision(s, null, scope, proposal), target = next.report[0];
  assert.ok(target.body.startsWith('【教学模拟数据，不能作为真实调查证据】'));
  assert.equal(target.source, before.content.report[0].source);
  assert.deepEqual(target.blocks.map(b => b.id), before.content.report[0].blocks.map(b => b.id));
  assert.deepEqual(target.blocks.filter(b => b.kind !== 'paragraph'), before.content.report[0].blocks.filter(b => b.kind !== 'paragraph'));
  assert.deepEqual(next.report.slice(1), before.content.report.slice(1));
  assert.deepEqual(next.slides, before.content.slides);
  assert.deepEqual(s, before, 'does not mutate original or undo snapshot');
});

test('target body, title, source, blocks and removal each reject stale adoption', () => {
  for (const change of [s => s.content.report[0].body += '改写', s => s.content.report[0].title += '改题', s => s.content.report[0].source += '新来源', s => s.content.report[0].blocks[1].text = 'z', s => s.content.report.shift()]) {
    const s = input(), { proposal } = candidate(s); change(s);
    assert.throws(() => applySectionRevision(s, null, scope, proposal));
  }
});

test('upstream input provenance, editor undo/version and full result provenance are fenced', () => {
  for (const change of [s => s.inputVersion = 'dataset-2', s => s.version++, s => s.content.subtitle += '研究范围变化', s => s.content.quality = { version: 1, results: [], findings: [] }]) {
    const s = input(), { proposal } = candidate(s); change(s);
    assert.ok(revisionProblem(proposal.anchor, s, null, scope));
  }
});

test('account, epoch, thread and project changes all reject; matching facts alone are insufficient', () => {
  const s = input(), { proposal } = candidate(s);
  for (const key of ['owner', 'epoch', 'thread', 'project']) {
    assert.throws(() => applySectionRevision(s, null, { ...scope, [key]: key === 'epoch' ? 3 : 'other' }, proposal));
  }
});

test('receipt must match both request ID and node; unknown receipt cannot be a candidate', () => {
  const { prepared, receipt } = candidate();
  for (const change of [{ id: crypto.randomUUID() }, { node: 'other' }, { status: 'outcome_unknown' }, { paragraphs: [] }]) {
    assert.throws(() => proposalFromReceipt(prepared, { ...receipt, ...change }));
  }
});

test('missing inline citation/formula refuses overwrite instead of silently losing references', () => {
  for (const token of ['[[引:source-a]]', '$x+y$']) {
    const s = input(); s.content.report[0].body += token;
    const { proposal } = candidate(s);
    assert.throws(() => applySectionRevision(s, null, scope, proposal), /行内引用或公式/);
  }
});

test('body-only and block-only sections both preserve exact target and original non-prose blocks', () => {
  for (const mode of ['body', 'blocks']) {
    const s = input();
    if (mode === 'body') delete s.content.report[0].blocks;
    else s.content.report[0].body = '';
    const { proposal } = candidate(s);
    const next = applySectionRevision(s, null, scope, proposal);
    assert.ok(JSON.stringify(next.report[0]).includes('修订正文甲'));
    if (mode === 'blocks') assert.equal(next.report[0].body, '');
  }
});

test('refuses oversized, empty, unauthenticated and malformed proposals', () => {
  const s = input();
  assert.throws(() => prepareSectionRevision(s, 'target', null, { ...scope, owner: null }, service));
  assert.throws(() => prepareSectionRevision(s, 'missing', null, scope, service));
  s.content.report[0].body = '长'.repeat(3001);
  assert.throws(() => prepareSectionRevision(s, 'target', null, scope, service), /3000/);
  const fresh = input(), { proposal } = candidate(fresh);
  assert.throws(() => applySectionRevision(fresh, null, scope, { ...proposal, paragraphs: [] }));
  assert.throws(() => applySectionRevision(fresh, null, scope, { ...proposal, paragraphs: ['长'.repeat(2001)] }));
});
