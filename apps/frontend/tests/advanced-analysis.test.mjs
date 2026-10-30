import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { advancedInsert, completeCases, runAdvanced } from '../lib/advanced-analysis.ts';
import { applyReportInsert } from '../lib/report-insert.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { blueprintSections, matchBlueprintNode } from '../lib/report-blueprint.ts';
import { danglingReferences } from '../lib/report-numbering.ts';
import { figurePlan, figureSVG, planSVG } from '../lib/report-figures.ts';

// A seeded teaching-simulation table: two related scales, an outcome, a 0/1 choice and missing codes; no respondents.
const random = seededRandom('advanced-analysis');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const headers = ['课程内容', '讲解', '作业', '场地', '时间', '报名', '满意度', '续报'];
const rows = Array.from({ length: 160 }, (_, i) => {
  const f = [normal(), normal()], item = (a, b) => (3 + a * f[0] + b * f[1] + 0.6 * normal()).toFixed(2);
  const satisfaction = 3 + 0.7 * f[0] + 0.3 * f[1] + 0.5 * normal(), renew = random() < 1 / (1 + Math.exp(-(f[0] - 0.2))) ? '1' : '0';
  return [item(0.8, 0), item(0.75, 0.1), item(0.7, 0), item(0, 0.8), item(0.1, 0.7), item(0, 0.65), i === 3 ? '99' : satisfaction.toFixed(2), i === 5 ? '' : renew];
});
const table = { headers, rows, skippedBlankLines: 0, delimiter: ',' };
const report = () => parseEditorContent({ ...createEditorContent(), version: 2, report: blueprintSections({ includeOptional: false }), quality: { version: 1, results: [], findings: [] } });

test('complete cases drop missing codes and blanks, and impute nothing', () => {
  const data = completeCases(table, [6, 7], ['99']);
  assert.equal(data.total, 160);
  assert.equal(data.n, 158, 'the row coded 99 and the blank row are left out');
  assert.equal(data.columns[0].length, 158);
});

test('each method runs on the table and is written up; a bad choice is refused in plain words', () => {
  const validity = runAdvanced({ method: 'validity', items: [0, 1, 2, 3, 4, 5] }, table, ['99']);
  assert.ok(!('refused' in validity) && validity.figure.kind === 'scree' && validity.writing.table.headers[1] === '因子 1');
  const regression = runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, table, ['99']);
  assert.ok(!('refused' in regression) && regression.n === 159 && regression.figure.kind === 'forest');
  assert.match(regression.writing.reading, /满意度/);
  const logistic = runAdvanced({ method: 'logistic', outcome: 7, predictors: [0, 3] }, table, ['99']);
  assert.ok(!('refused' in logistic) && logistic.n === 159);
  const cluster = runAdvanced({ method: 'cluster', variables: [0, 3, 6], k: 3 }, table, ['99']);
  assert.ok(!('refused' in cluster) && cluster.writing.table.rows.length === 3);
  const ipa = runAdvanced({ method: 'ipa', performance: [0, 1, 3, 4], importance: null, overall: 6 }, table, ['99']);
  assert.ok(!('refused' in ipa) && ipa.writing.table.rows.length === 4);
  const ahp = runAdvanced({ method: 'ahp', criteria: ['安全', '便利', '价格'], matrix: [[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]] }, table, []);
  assert.ok(!('refused' in ahp) && ahp.figure === null);
  assert.deepEqual(runAdvanced({ method: 'logistic', outcome: 6, predictors: [0] }, table, ['99']), { refused: '因变量须编码为 0 / 1（1 表示事件发生），请先在数据中重新编码。' });
  assert.deepEqual(runAdvanced({ method: 'regression', outcome: 6, predictors: [6] }, table, []), { refused: '同一列不能同时担任两个角色。' });
  assert.deepEqual(runAdvanced({ method: 'validity', items: [0, 1] }, table, []), { refused: '至少需要 3 个题项。' });
});

test('the write-up goes into its blueprint section as one insert whose reading cites its own table', async () => {
  const run = runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, table, ['99']);
  const insert = await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true });
  assert.equal(insert.node, 'drivers.model');
  assert.deepEqual(insert.items.map(i => i.kind), ['paragraph', 'formula', 'formula', 'paragraph', 'table', 'paragraph', 'figure', 'paragraph']);
  assert.match(insert.items[5].text, /^注：\$n=\d+\$；\$R\^2=/u, 'the table note prints under the table, typeset');
  assert.deepEqual(insert.items[4].result.warnings, [], 'the note is not repeated as a plain-text caveat');
  assert.equal(insert.items[4].result.method, 'regression');
  assert.equal(insert.items[4].result.classification, 'simulated');
  const applied = applyReportInsert(report(), insert);
  const section = applied.content.report.find(s => s.id === applied.sectionId);
  assert.equal(matchBlueprintNode(section.title).id, 'drivers.model');
  const tableBlock = applied.blocks.find(b => b.kind === 'table'), chartBlock = applied.blocks.find(b => b.kind === 'chart'), reading = applied.blocks.at(-1);
  assert.ok(reading.text.startsWith(`由[[表:${tableBlock.id}]]和[[图:${chartBlock.id}]]可知，`), 'the "@N" placeholders became the table and figure blocks');
  assert.equal(chartBlock.evidenceId, tableBlock.evidenceId, 'the figure is drawn from the table\'s own result');
  assert.equal(chartBlock.text, '满意度影响因素的回归系数及其 95% 置信区间');
  assert.deepEqual(danglingReferences(applied.content), []);
  assert.ok(section.body.startsWith('【教学模拟数据，不能作为实际调查结果】'), 'simulated numbers are declared where they land');
});

test('the report redraws every method figure from its stored result, as the preview drew it', async () => {
  const runs = [
    runAdvanced({ method: 'validity', items: [0, 1, 2, 3, 4, 5] }, table, ['99']),
    runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, table, ['99']),
    runAdvanced({ method: 'cluster', variables: [0, 1, 2], k: 3 }, table, ['99']),
  ];
  for (const run of runs) {
    assert.ok(!('refused' in run) && run.chart && run.figure, `${run.method} has a figure`);
    const insert = await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true });
    const result = insert.items.find(i => i.kind === 'figure').result;
    // Whatever value column the block holds, the stored result draws the method's own figure.
    assert.equal(figurePlan(result, 1, '#2F6B4F').kind, run.figure.kind);
    assert.equal(await figureSVG(result, 1, '#2F6B4F'), await planSVG(run.figure), `${run.method}: the stored result draws the preview's figure`);
  }
});

test('the Word export numbers and draws the method figure from the stored result', async () => {
  const { buildDocx } = await import('../lib/editor-export.ts'), { default: JSZip } = await import('jszip'), { default: sharp } = await import('sharp');
  const renderSvg = async svg => new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
  const run = runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, table, ['99']);
  const applied = applyReportInsert(report(), await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true }));
  const zip = await JSZip.loadAsync(await (await buildDocx(applied.content, undefined, renderSvg)).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /满意度影响因素的回归系数及其 95% 置信区间/u);
  assert.ok(Object.keys(zip.files).some(name => /^word\/media\/.+\.svg$/u.test(name)), 'the figure is embedded as vector SVG');
});
