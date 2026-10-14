import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { detectQualityColumns, evaluateQuality, exclusionLedger, keptTable, parseDurationSeconds, tableCsv, validateRules } from '../lib/data-quality.ts';

// A synthetic 问卷星-style export: 序号, 所用时间, 来自IP, three Likert items, an attention item.
const csv = [
  '序号,提交答卷时间,所用时间,来自IP,Q1,Q2,Q3,注意力题,渠道',
  '1,2026/10/1 10:00,180秒,1.1.1.1,4,5,3,3,校园',
  '2,2026/10/1 10:05,40秒,2.2.2.2,5,5,5,3,社区',
  '3,2026/10/1 10:09,200秒,1.1.1.1,2,3,4,3,校园',
  '4,2026/10/1 10:10,3分10秒,3.3.3.3,3,3,3,1,社区',
  '5,2026/10/1 10:12,175秒,4.4.4.4,4,5,3,3,校园',
  '6,2026/10/1 10:15,未知,5.5.5.5,4,,4,3,社区',
].join('\n');
const table = parseSurveyCsv(csv);
const base = { idColumn: 0, duration: null, straightlining: null, attention: null, duplicateIp: null, duplicateAnswers: false };

test('platform metadata columns are detected but only by explicit names', () => {
  assert.deepEqual(detectQualityColumns(table), { id: 0, duration: 2, ip: 3 });
  assert.deepEqual(detectQualityColumns(parseSurveyCsv('Q1,shipping_zip,tip\n1,2,3')), { id: null, duration: null, ip: null });
});

test('durations are read from common platform formats', () => {
  assert.equal(parseDurationSeconds('180秒'), 180);
  assert.equal(parseDurationSeconds('3分10秒'), 190);
  assert.equal(parseDurationSeconds('1.5分钟'), 90);
  assert.equal(parseDurationSeconds('00:02:03'), 123);
  assert.equal(parseDurationSeconds('02:03'), 123);
  assert.equal(parseDurationSeconds('95'), 95);
  assert.equal(parseDurationSeconds('1小时2分'), 3720);
  assert.equal(parseDurationSeconds('未知'), null);
  assert.equal(parseDurationSeconds(''), null);
});

test('each rule flags the expected rows and reports its criterion', () => {
  const report = evaluateQuality(table, { ...base, duration: { column: 2, mode: 'median-fraction', value: 0.5 }, straightlining: { columns: [4, 5, 6] }, attention: { column: 7, expected: '3' }, duplicateIp: { column: 3 }, duplicateAnswers: true });
  const by = Object.fromEntries(report.rules.map(r => [r.id, r]));
  // Median of 180, 40, 200, 190, 175 is 180; half of it is 90 seconds.
  assert.equal(by.duration.flagged, 1); assert.equal(by.duration.unparsed, 1); assert.match(by.duration.criterion, /90 秒/);
  assert.equal(by.straightlining.flagged, 2);
  assert.equal(by.attention.flagged, 1);
  assert.equal(by.duplicateIp.flagged, 1);
  // Rows 1 and 5 differ only in metadata, so the later one is a duplicate answer set.
  assert.equal(by.duplicateAnswers.flagged, 1);
  assert.deepEqual(report.flagged.map(f => [f.row, f.id, f.reasons.sort()]), [
    [3, '2', ['duration', 'straightlining']], [4, '3', ['duplicateIp']], [5, '4', ['attention', 'straightlining']], [6, '5', ['duplicateAnswers']],
  ]);
  assert.equal(report.kept, 2);
  assert.ok(report.notes.some(n => n.includes('不是各规则计数之和')));
});

test('only the rules chosen for exclusion remove rows; the ledger records every flag', () => {
  const report = evaluateQuality(table, { ...base, duration: { column: 2, mode: 'seconds', value: 60 }, duplicateIp: { column: 3 } });
  const { table: kept, removed } = keptTable(table, report, new Set(['duration']));
  assert.equal(removed, 1);
  assert.deepEqual(kept.rows.map(r => r[0]), ['1', '3', '4', '5', '6']);
  assert.equal(table.rows.length, 6);
  const ledger = exclusionLedger(report, new Set(['duration']), { sourceName: '合成.csv', sourceHash: 'a'.repeat(64), registeredAt: '2026-10-14T02:00:00Z', missingCodes: ['99', 'NA'] });
  assert.match(ledger, /# SHA-256 a{64}/);
  assert.match(ledger, /# 缺失代码 99;NA/);
  assert.match(exclusionLedger(report, new Set(), { sourceName: 'x', sourceHash: 'a'.repeat(64), registeredAt: 't', missingCodes: [] }), /# 缺失代码 仅空白/);
  assert.match(ledger, /作答过快：用时少于 60 秒（剔除）/);
  assert.match(ledger, /同一 IP 重复提交.*（仅标记）/);
  assert.match(ledger, /\r\n3,2,作答过快,剔除\r\n/);
  assert.match(ledger, /\r\n4,3,同一 IP 重复提交,保留待复核\r\n/);
});

test('CSV round trip keeps quotes, commas and line breaks', () => {
  const tricky = { ...table, headers: ['a', 'b'], rows: [['x,1', 'say "hi"'], ['line\nbreak', '']] };
  assert.deepEqual(parseSurveyCsv(tableCsv(tricky)).rows, tricky.rows);
});

test('invalid or empty rule sets are refused', () => {
  assert.ok(validateRules(table, base).some(i => i.includes('至少启用')));
  assert.ok(validateRules(table, { ...base, straightlining: { columns: [4, 5] } }).length);
  assert.ok(validateRules(table, { ...base, duration: { column: 2, mode: 'median-fraction', value: 1.2 } }).length);
  assert.ok(validateRules(table, { ...base, attention: { column: 7, expected: ' ' } }).length);
  assert.throws(() => evaluateQuality(table, base), /至少启用/);
});

test('straightlining candidates are rating-like columns, not identifiers or metadata', async () => {
  const { likertCandidates } = await import('../lib/data-quality.ts');
  // Q1–Q3 and 注意力题 are small-integer items; 渠道 is text; 序号/时间/IP are metadata.
  assert.deepEqual(likertCandidates(table), [4, 5, 6, 7]);
  assert.deepEqual(likertCandidates(parseSurveyCsv('收入,满意\n3500,4\n8200,5\n12000,3\n5100,2\n6100,1\n7300,4\n8800,5\n9100,3\n4300,2\n2200,1\n3300,4\n5500,5')), [1]);
});

test('answer columns that mention time are not treated as platform duration', () => {
  const survey = parseSurveyCsv('编号,通勤用时（分钟）,每周运动时间,Duration (in seconds),Q1\n1,30,3,240,4\n2,45,5,35,3');
  assert.deepEqual(detectQualityColumns(survey), { id: 0, duration: 3, ip: null });
  assert.equal(detectQualityColumns(parseSurveyCsv('通勤用时,Q1\n30,4')).duration, null);
  const report = evaluateQuality(parseSurveyCsv('编号,提交答卷时间,每周运动时间,Q1,Q2\n1,10:00,3,4,5\n2,10:05,3,4,5'), { ...base, duplicateAnswers: true });
  // The answer column 每周运动时间 stays in the comparison; only the platform time column is ignored.
  assert.equal(report.rules[0].flagged, 1);
});

test('imported tables are matched by their platform labels as well as stable IDs', () => {
  const imported = { ...parseSurveyCsv('c1,c2,c3,c4,c5\n1,10:00,1.1.1.1,4,5\n2,10:09,2.2.2.2,4,5'), columnLabels: { c1: '序号', c2: '提交答卷时间', c3: '来自IP', c4: 'Q1', c5: 'Q2' } };
  assert.deepEqual(detectQualityColumns(imported), { id: 0, duration: null, ip: 2 });
  const report = evaluateQuality(imported, { ...base, duplicateAnswers: true });
  assert.equal(report.rules[0].flagged, 1);
});

test('report paragraphs computed on QC-kept rows carry the exclusion lineage', async () => {
  const { qualityEvidenceSection, collectionEvidenceSection } = await import('../lib/survey-collection.ts');
  const quality = { kind: 'quality', parentName: '回收.csv', parentHash: 'b'.repeat(64), simulated: false, silicon: false, removed: 10, ledgerHash: 'c'.repeat(64), rules: ['作答过快：用时少于 60 秒'] };
  const section = { id: 's', title: '样本结构', body: '频数…\n核验边界：本地文件', source: '浏览器计算' };
  const out = qualityEvidenceSection(section, quality);
  assert.match(out.body, /质控来源：自「回收.csv」剔除 10 行；规则：作答过快：用时少于 60 秒；剔除台账 SHA-256 c{64}。/);
  assert.match(out.source, /质控前数据 SHA-256：b{64}/);
  assert.equal(qualityEvidenceSection(out, quality).body.match(/质控来源/g).length, 1);
  const collection = { kind: 'collection', projectId: 'p', releaseId: 'r', versionId: 'v', questionnaireRevision: 3, classification: 'actual', snapshotHash: 'd'.repeat(64), generatedAt: '2026-10-14T00:00:00Z', design: { title: 't', questions: [] } };
  const both = qualityEvidenceSection(collectionEvidenceSection(section, collection), quality);
  assert.match(both.body, /发布 v3/); assert.match(both.body, /质控来源/); assert.match(both.source, /剔除台账 SHA-256/);
});

test('the canvas receives a compact QC step that survives its 300-character scope', async () => {
  const { qualityLineageStep } = await import('../lib/survey-collection.ts');
  const quality = { kind: 'quality', parentName: '回收.csv', parentHash: 'b'.repeat(64), simulated: false, silicon: false, removed: 10, ledgerHash: 'c'.repeat(64), rules: ['作答过快：用时少于中位数（252.5 秒）的 33%，即 83.3 秒', '注意力题未通过：「注意力题请选4」不等于「4」（未作答也计为未通过）'] };
  const step = qualityLineageStep(quality);
  assert.equal(step, `质控：自「回收.csv」剔除 10 行（作答过快、注意力题未通过），剔除台账 SHA-256 ${'c'.repeat(16)}…`);
  assert.ok(step.length < 120);
});

test('when every response is excluded the kept table is empty and cannot be reloaded', () => {
  const report = evaluateQuality(table, { ...base, duration: { column: 2, mode: 'seconds', value: 100000 } });
  const { table: kept, removed } = keptTable(table, report, new Set(['duration']));
  // Row 6 has an unreadable duration and is never flagged, so one row remains here.
  assert.equal(removed, 5); assert.equal(kept.rows.length, 1);
  const all = evaluateQuality(table, { ...base, attention: { column: 7, expected: '不存在的答案' } });
  assert.equal(keptTable(table, all, new Set(['attention'])).table.rows.length, 0);
  assert.throws(() => parseSurveyCsv(tableCsv(keptTable(table, all, new Set(['attention'])).table)));
});
