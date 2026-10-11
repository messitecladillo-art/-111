import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildStoryboard } from '../lib/report-storyboard.ts';
import { DEFENSE_REFERENCE_LIMITS, defenseReferenceLocator, defenseReferencePreview, projectDefenseSource } from '../lib/project-defense.ts';
const projectId = '12345678-9abc-4def-8123-456789abcdef', reportId = '23456789-abcd-4def-8123-456789abcdef';
function report() { const content = createEditorContent(); content.title = '合成检验研究'; content.report[0].body = '合成算例：组 A 有 6 / 10 条记录。\n适用范围：测试输入。'; content.report[0].source = '输入 SHA-256：' + 'a'.repeat(64); content.slides[0].notes = '讲述合成算例，保留 6 / 10 的分母。'; return { id: reportId, projectId, revision: 3, title: content.title, updatedAt: '2026-10-11T08:00:00Z', content }; }
test('defense source binds exact saved project/report revision and reproducible content hash', async () => {
  const input = report(), result = await projectDefenseSource(input, projectId);
  assert.equal(result.revision, 3); assert.equal(result.reportId, reportId); assert.equal(result.projectId, projectId);
  assert.equal(result.contentHash, createHash('sha256').update(JSON.stringify(parseEditorContent(input.content))).digest('hex'));
  assert.equal(result.sections[0].body, input.content.report[0].body); assert.equal(result.sections[0].source, input.content.report[0].source); assert.equal(result.slides[0].notes, input.content.slides[0].notes);
  assert.equal(result.slides[0].linkState, 'unlinked'); assert.equal(result.slides[0].sourceSectionId, null);
  assert.equal(Object.hasOwn(result, 'officialDuration'), false); assert.equal(Object.hasOwn(result, 'verified'), false);
  await assert.rejects(() => projectDefenseSource(input, reportId), /不匹配/);
});
test('source detaches before hashing; later caller edits cannot leak into pending result', async () => {
  const input = report(), original = input.content.report[0].body, pending = projectDefenseSource(input, projectId);
  input.content.report[0].body = 'later edit'; input.content.slides[0].notes = 'later note';
  const result = await pending; assert.equal(result.sections[0].body, original); assert.notEqual(result.slides[0].notes, 'later note');
  const changed = await projectDefenseSource(input, projectId); assert.notEqual(result.contentHash, changed.contentHash);
});
test('preview is bounded display text while full source/notes stay untouched', async () => {
  const raw = '🙂'.repeat(250) + '\n完整原文'; const preview = defenseReferencePreview(raw);
  assert.ok(preview.length <= DEFENSE_REFERENCE_LIMITS.preview); assert.ok(preview.endsWith('…')); assert.ok(!preview.slice(0, -1).endsWith('\ud83d'));
  assert.equal(defenseReferencePreview('  行一\n\n行二 '), '行一 行二');
  const input = report(); input.content.report[0].body = raw; input.content.slides[0].notes = raw;
  const source = await projectDefenseSource(input, projectId); assert.equal(source.sections[0].body, raw); assert.equal(source.slides[0].notes, raw);
});
test('reference locator names real section/slide positions and exact saved version, rejects missing selection', async () => {
  const source = await projectDefenseSource(report(), projectId);
  const section = defenseReferenceLocator(source, 'section', source.sections[0].id), slide = defenseReferenceLocator(source, 'slide', source.slides[0].id);
  for (const locator of [section, slide]) { assert.ok(locator.includes('报告 v3')); assert.ok(locator.includes(reportId)); assert.ok(locator.includes(source.contentHash)); }
  assert.ok(section.includes('章节 1')); assert.ok(slide.includes('PPT 页 1')); assert.throws(() => defenseReferenceLocator(source, 'section', 'missing'), /不属于/);
});
test('PPT reference preserves fingerprint change state instead of claiming stale slide is current', async () => {
  const input = report(), first = input.content.report[0];
  input.content.slides = await buildStoryboard(input.content, [{ id: 'card', sectionId: first.id, job: 'finding', classification: 'simulated', title: '合成发现', excerpt: first.body, limitation: '只用于单元测试', implication: '核对映射', locator: '报告 v3 / 章节1', seconds: 40 }], 'replace');
  const current = await projectDefenseSource(input, projectId); assert.equal(current.slides[0].linkState, 'current'); assert.equal(current.slides[0].sourceSectionId, first.id);
  input.content.report[0].body += '\n修改依据'; const changed = await projectDefenseSource(input, projectId); assert.equal(changed.slides[0].linkState, 'report_changed'); assert.notEqual(current.contentHash, changed.contentHash);
});
