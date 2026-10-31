import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { advancedColumns, advancedInsert, completeCases, reverseScored, runAdvanced } from '../lib/advanced-analysis.ts';
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
  // Table, its note (small, typeset), the figure and its caption, then the one source line they share.
  // Captions appear first in the lists of tables and figures; the body's are the last.
  const shown = xml.lastIndexOf('满意度影响因素的回归估计结果'), note = xml.indexOf('>注：', shown), drawn = xml.lastIndexOf('满意度影响因素的回归系数及其 95% 置信区间');
  assert.ok(shown > 0 && shown < note && note < drawn && drawn < xml.indexOf('资料来源', drawn), 'note between table and figure, source after both');
  assert.doesNotMatch(xml.slice(shown, drawn), /<w:t[^>]*>资料来源/u, 'no source line between the table and its figure (the image alt text names it)');
  const paragraph = xml.slice(Math.max(xml.lastIndexOf('<w:p>', note), xml.lastIndexOf('<w:p ', note)), note);
  assert.match(paragraph, /w:val="ReportSource"/u, 'the note is set in the small source style');
});

test('an AHP result names the expert judgement matrix, never the loaded survey or its sample size', async () => {
  const { AHP_SOURCE } = await import('../lib/advanced-analysis.ts'), { sourceLine } = await import('../lib/report-tables.ts');
  const run = runAdvanced({ method: 'ahp', criteria: ['器材', '环境', '服务'], matrix: [[1, 3, 2], [1 / 3, 1, 1 / 2], [1 / 2, 2, 1]] }, table, []);
  const result = (await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true })).items.find(i => i.kind === 'table').result;
  assert.equal(result.sourceName, AHP_SOURCE);
  const { digestText } = await import('../lib/research-quality.ts');
  assert.equal(result.sourceHash, await digestText(JSON.stringify({ criteria: ['器材', '环境', '服务'], matrix: [[1, 3, 2], [1 / 3, 1, 1 / 2], [1 / 2, 2, 1]] })), 'the hash binds the judgement matrix itself');
  assert.equal(result.classification, 'user_provided', 'the judgements are entered, not simulated survey answers');
  assert.equal(sourceLine(result), `资料来源：${AHP_SOURCE}（3 项准则）。`);
  assert.match(AHP_SOURCE, /来源未核验/, 'never presented as an expert panel the app cannot vouch for');
});

test('tables the exporters cannot take are refused before anything is written', () => {
  const wide = runAdvanced({ method: 'cluster', variables: [0, 1, 2, 3, 4, 5, 6, 7], k: 3 }, table, ['99']);
  assert.match(wide.refused, /至多 7 个/);
  const fits = runAdvanced({ method: 'cluster', variables: [0, 1, 2, 3, 4, 5, 6], k: 3 }, table, ['99']);
  assert.ok(!('refused' in fits) && fits.writing.table.headers.length === 10);
});

test('the PPT draws an advanced method figure as the report does, not bars of a table column', async () => {
  const { buildPptx } = await import('../lib/editor-export.ts'), { makeSlideObject } = await import('../lib/research-quality.ts');
  const { default: JSZip } = await import('jszip'), { default: sharp } = await import('sharp');
  const run = runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, table, ['99']);
  const applied = applyReportInsert(report(), await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true }));
  const result = applied.content.quality.results[0];
  const content = { ...applied.content, slides: [{ id: 'slide', title: '回归结果', body: '', aside: '', notes: '', layout: 'chart', objects: [makeSlideObject('chart', { evidenceId: result.id, x: 5, y: 20, width: 60, height: 65 })] }] };
  const renderSvg = async svg => new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
  const zip = await JSZip.loadAsync(await (await buildPptx(content, renderSvg)).arrayBuffer());
  assert.ok(Object.keys(zip.files).some(name => /^ppt\/media\/.+\.svg$/u.test(name)), 'the method figure, as vector SVG');
  assert.ok(!Object.keys(zip.files).some(name => /^ppt\/charts\/chart\d*\.xml$/u.test(name)), 'no native bar chart of the table');
});

test('stated IPA reads each importance rating from the column chosen for it', () => {
  const t = { headers: ['表现1', '表现2', '重要1', '重要2'], rows: Array.from({ length: 40 }, (_, i) => [String(2 + (i % 4)), String(3 + (i % 3)), String(4 + (i % 2)), String(1 + (i % 3))]), skippedBlankLines: 0, delimiter: ',' };
  const run = runAdvanced({ method: 'ipa', performance: [0, 1], importance: [2, 3], overall: null }, t, []);
  assert.ok(!('refused' in run));
  assert.deepEqual(run.writing.table.rows.map(r => r.slice(0, 3)), [['表现1', '4.500', '3.500'], ['表现2', '1.975', '3.975']], 'importance means of columns 3 and 4');
});

test('a method names the columns a linked questionnaire must check, the 0/1 outcome apart from the quantities', () => {
  assert.deepEqual(advancedColumns({ method: 'logistic', outcome: 7, predictors: [0, 3] }), { all: [7, 0, 3], scaled: [0, 3] });
  assert.deepEqual(advancedColumns({ method: 'ipa', performance: [0, 1], importance: null, overall: 6 }), { all: [0, 1, 6], scaled: [0, 1, 6] });
  assert.deepEqual(advancedColumns({ method: 'ahp', criteria: ['a', 'b'], matrix: [[1, 2], [0.5, 1]] }), { all: [], scaled: [] }, 'AHP reads no survey column');
});

test('edge cases are refused in plain words, never written as NaN or Infinity', async () => {
  const { samplingAdequacy } = await import('../lib/psychometrics.ts'), { linearRegression } = await import('../lib/regression.ts');
  // Three items that share no variance: a 2³ factorial design repeated, every correlation exactly zero.
  const design = Array.from({ length: 40 }, (_, i) => [i & 1, (i >> 1) & 1, (i >> 2) & 1]);
  assert.deepEqual(samplingAdequacy([0, 1, 2].map(j => design.map(r => r[j]))), { refused: 'no-shared-variance' });
  const a = Array.from({ length: 30 }, (_, i) => (i * 7) % 5), b = Array.from({ length: 30 }, (_, i) => (i * 3) % 4);
  assert.deepEqual(linearRegression(a.map((v, i) => v + b[i]), [{ name: 'a', values: a }, { name: 'b', values: b }]), { refused: 'perfect-fit' }, 'a total regressed on its own items');
});

test('items the questionnaire scores in reverse are turned before any method reads them', () => {
  const t = { headers: ['正向', '反向'], rows: [['1', '5'], ['4', '99'], ['5', ''], ['2', '2']], skippedBlankLines: 0, delimiter: ',' };
  assert.deepEqual(reverseScored(t, [{ column: 1, min: 1, max: 5 }], ['99']).rows, [['1', '1'], ['4', '99'], ['5', ''], ['2', '4']], 'missing codes and blanks untouched');
  assert.equal(reverseScored(t, [], []), t);
});

test('a result placed again from the catalogue goes to its method section, with its own figure', async () => {
  const { suggestedNode, suggestedExhibits, placeResult } = await import('../lib/report-placement.ts');
  const run = runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, table, ['99']);
  const result = (await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true })).items.find(i => i.kind === 'table').result;
  assert.equal(suggestedNode(result), 'drivers.model');
  assert.deepEqual(suggestedExhibits(result), ['table', 'chart']);
  const ahp = (await advancedInsert(runAdvanced({ method: 'ahp', criteria: ['a', 'b', 'c'], matrix: [[1, 3, 2], [1 / 3, 1, 1 / 2], [1 / 2, 2, 1]] }, table, []), { name: 'x', hash: 'a'.repeat(64), simulated: true })).items.find(i => i.kind === 'table').result;
  assert.deepEqual([suggestedNode(ahp), suggestedExhibits(ahp)], ['plan.priority', ['table']]);
  const placed = applyReportInsert(report(), await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true })).content;
  assert.throws(() => placeResult(placed, placed.quality.results[0].id), /高级方法的结果请在/, 'never rewritten from its table alone');
});

test('a report holding every advanced method still exports to LaTeX: formulas on the allowed list, method figures as captioned notes', async () => {
  const { generateLatexBody } = await import('../lib/latex-report.ts');
  let content = report();
  for (const spec of [
    { method: 'validity', items: [0, 1, 2, 3, 4, 5] }, { method: 'regression', outcome: 6, predictors: [0, 3] },
    { method: 'logistic', outcome: 7, predictors: [0, 3] }, { method: 'ipa', performance: [0, 1, 3, 4], importance: null, overall: 6 },
    { method: 'cluster', variables: [0, 3, 6], k: 3 }, { method: 'ahp', criteria: ['器材', '环境', '服务'], matrix: [[1, 3, 2], [1 / 3, 1, 1 / 2], [1 / 2, 2, 1]] },
  ]) content = applyReportInsert(content, await advancedInsert(runAdvanced(spec, table, ['99']), { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true })).content;
  const body = generateLatexBody(content);
  assert.equal((body.match(/此图为方法图/g) ?? []).length, 5, 'five method figures, each kept as a captioned figure');
  assert.doesNotMatch(body, /\\(?:boldsymbol|fbox|parbox)\b/u);
  if (process.env.EVIX_LATEX_BODY) (await import('node:fs')).writeFileSync(process.env.EVIX_LATEX_BODY, body);
});

test('a value that is neither a number nor a missing code is counted as invalid, not missing', async () => {
  const t = { headers: ['a', 'b'], rows: [['1', '2'], ['x', '3'], ['99', '4'], ['', '5'], ['2', 'n/a'], ['3', '1']], skippedBlankLines: 0, delimiter: ',' };
  const data = completeCases(t, [0, 1], ['99']);
  assert.deepEqual([data.n, data.total, data.invalid], [2, 6, 2], 'x and n/a are invalid; 99 and the blank are missing');
});

test('the registered result keeps missing and invalid rows apart', async () => {
  const rows = table.rows.map((row, i) => (i === 10 ? row.map((cell, c) => (c === 0 ? '无法辨认' : cell)) : row));
  const run = runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, { ...table, rows }, ['99']);
  const result = (await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true })).items.find(i => i.kind === 'table').result;
  assert.equal(run.invalid, 1);
  assert.equal(result.n, 158);
});

test('an AHP result is never drawn as bars of its table', async () => {
  const { figurePlan } = await import('../lib/report-figures.ts');
  const run = runAdvanced({ method: 'ahp', criteria: ['器材', '环境', '服务'], matrix: [[1, 3, 2], [1 / 3, 1, 1 / 2], [1 / 2, 2, 1]] }, table, []);
  const result = (await advancedInsert(run, { name: 'x', hash: 'a'.repeat(64), simulated: true })).items.find(i => i.kind === 'table').result;
  assert.throws(() => figurePlan(result, 1, '#2F6B4F'), /没有可画的图/);
});

test('calculating before choosing columns is refused in plain words, never a crash', () => {
  assert.deepEqual(runAdvanced({ method: 'cluster', variables: [], k: 3 }, table, []), { refused: '至少选择 2 个聚类变量。' });
  assert.deepEqual(runAdvanced({ method: 'validity', items: [0] }, table, []), { refused: '至少需要 3 个题项。' });
  assert.deepEqual(runAdvanced({ method: 'ipa', performance: [], importance: null, overall: 6 }, table, []), { refused: '至少选择 2 个属性。' });
  assert.deepEqual(runAdvanced({ method: 'regression', outcome: 6, predictors: [] }, table, []), { refused: '请选择因变量和至少一个自变量。' });
});

test('an AHP matrix of another order than its criteria, or an overflowing odds ratio, is refused', async () => {
  assert.deepEqual(runAdvanced({ method: 'ahp', criteria: ['a', 'b'], matrix: [[1, 3, 2], [1 / 3, 1, 1 / 2], [1 / 2, 2, 1]] }, table, []), { refused: '准则数与判断矩阵的阶数不一致。' });
  const { logisticRegression } = await import('../lib/logistic.ts');
  const x = Array.from({ length: 200 }, (_, i) => ((i * 37) % 100) / 100), y = x.map((v, i) => (v + ((i * 53) % 100) / 100 > 1 ? 1 : 0));
  assert.ok(!('refused' in logisticRegression(y, [{ name: 'x', values: x }])), 'ordinary units fit');
  assert.deepEqual(logisticRegression(y, [{ name: 'x', values: x.map(v => v * 1e-3) }]), { refused: 'extreme-units' }, 'thousandths of the unit overflow e^β');
});

test('repeated AHP criteria are refused', () => {
  assert.deepEqual(runAdvanced({ method: 'ahp', criteria: ['器材', '器材', '服务'], matrix: [[1, 3, 2], [1 / 3, 1, 1 / 2], [1 / 2, 2, 1]] }, table, []), { refused: '准则名称不能重复。' });
});

test('the scope a result was computed under is registered with it', async () => {
  const scope = ['原表 160 行，共同应答范围 150 行，有效计算 148 行。', '缺失编码：99', '按已确认的问卷对应与跳题策略取数。'];
  const run = runAdvanced({ method: 'regression', outcome: 6, predictors: [0, 3] }, table, ['99']);
  const result = (await advancedInsert(run, { name: '教学模拟问卷', hash: 'a'.repeat(64), simulated: true }, scope)).items.find(i => i.kind === 'table').result;
  assert.deepEqual(result.warnings, scope);
});

test('tables beyond what the exports take are refused at computation', () => {
  const wide = { headers: Array.from({ length: 30 }, (_, i) => `x${i}`), rows: table.rows.map(r => Array.from({ length: 30 }, (_, i) => r[i % 6])), skippedBlankLines: 0, delimiter: ',' };
  assert.match(runAdvanced({ method: 'regression', outcome: 29, predictors: Array.from({ length: 14 }, (_, i) => i) }, wide, []).refused, /至多 13 个/);
  assert.match(runAdvanced({ method: 'ipa', performance: Array.from({ length: 15 }, (_, i) => i), importance: null, overall: 29 }, wide, []).refused, /至多 14 个/);
  assert.match(runAdvanced({ method: 'validity', items: Array.from({ length: 25 }, (_, i) => i) }, wide, []).refused, /至多 24 个/);
});
