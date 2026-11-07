import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVISORS, SECTION_CHECKS, advisorReading, hiredAdvisors, sectionIssues } from '../lib/agent/advisors.ts';
import { benchmarkReport } from '../lib/report-benchmark.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import { emptyReference } from '../lib/references.ts';

test('every report check has exactly one advisor, and every advisor check is a real check', () => {
  // Some checks appear only when the report holds what they read (structured references), so both reports are read.
  const checks = [...new Set([createEditorContent(), { ...createEditorContent(), references: [emptyReference('J')] }].flatMap(c => benchmarkReport(c).checks.map(x => x.id)))];
  const owned = ADVISORS.flatMap(a => a.checks);
  assert.equal(new Set(owned).size, owned.length, 'no check is answered for twice');
  assert.deepEqual([...owned].sort(), [...checks].sort(), 'no check is left without an advisor, and no advisor watches a check that does not exist');
  for (const a of ADVISORS) assert.ok(a.rules.length >= 2 && a.skill.startsWith('market-research-') && a.glyph.length === 1, a.id);
});

test('an advisor reports only what the report check found in its field', () => {
  const content = createEditorContent();
  content.report = [{ id: 's', title: '一、分析', body: '性别差异不显著（p>0.05），说明男女之间没有差异。', source: '' }];
  const reading = advisorReading(ADVISORS.find(a => a.id === 'modeling'), benchmarkReport(content));
  assert.ok(reading.issues.some(c => c.id === 'nullResult'));
  assert.ok(reading.issues.every(c => ADVISORS.find(a => a.id === 'modeling').checks.includes(c.id)));
  assert.equal(advisorReading(ADVISORS[0], null).checked, 0, 'without a report there is nothing to read');
});

test('hired advisors keep the listed order and ignore ids that no longer exist', () => {
  assert.deepEqual(hiredAdvisors(['writing', 'gone', 'design']).map(a => a.id), ['design', 'writing']);
});

test('a section is checked on its own words, and each problem names the advisor whose field it is', () => {
  const content = createEditorContent();
  content.report = [
    { id: 'a', title: '一、分析', body: 'Logistic 回归中，有经历者的 OR 为 2.3，即观赛概率是无经历者的 2.3 倍。', source: '' },
    { id: 'b', title: '二、建议', body: '建议由社区牵头，以季度到场人次评估。', source: '' },
  ];
  const a = sectionIssues(content, 'a', benchmarkReport);
  assert.deepEqual(a.map(x => [x.check.id, x.advisor.id]), [['oddsRatio', 'modeling']]);
  assert.deepEqual(sectionIssues(content, 'b', benchmarkReport), [], 'the other section carries none of it');
  assert.deepEqual(sectionIssues(content, 'gone', benchmarkReport), []);
  for (const id of SECTION_CHECKS) assert.ok(ADVISORS.some(adv => adv.checks.includes(id)), id);
});
