import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVISORS, advisorReading, hiredAdvisors } from '../lib/agent/advisors.ts';
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
