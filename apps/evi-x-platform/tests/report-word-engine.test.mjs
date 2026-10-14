import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx } from '../lib/editor-export.ts';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { runRecipe } from '../lib/analysis-recipes.ts';
import { snapshotRecipe } from '../lib/research-quality.ts';
import { danglingReferences, numberedCaption, referenceSegments, referenceToken, reportLabels, resolveReferences } from '../lib/report-numbering.ts';
import { columnWeights, formatCell, presentResult, sectionNotes, sourceLine } from '../lib/report-tables.ts';
import { figureOption, figureSVG } from '../lib/report-figures.ts';
import { splitInlineMath } from '../lib/quality-export.ts';

const renderSvg = async svg => new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
const csv = ['编号,年龄组,频次,满意度', ...Array.from({ length: 60 }, (_, i) => `${i + 1},${['青年', '中年', '老年'][i % 3]},${['从不', '偶尔', '经常'][(i * 7) % 3]},${1 + (i * 5) % 5}`)].join('\n');
const table = parseSurveyCsv(csv);
const source = { sourceName: '教学模拟数据', sourceUrl: '', sourceHash: 'c'.repeat(64), classification: 'simulated' };
const snapshot = (id, method, x, y) => snapshotRecipe(runRecipe(table, { id, method, x, y, question: id }, []), { ...source, title: id }, id);
const results = { freq: await snapshot('freq', 'frequency', 2, null), cross: await snapshot('cross', 'crosstab', 1, 2), groups: await snapshot('groups', 'groups', 1, 3) };
const section = (id, title, body = '', blocks) => ({ id, title, body, source: '', ...(blocks ? { blocks } : {}) });
const block = (id, kind, text, evidenceId = '', valueColumn = 1) => ({ id, kind, text, evidenceId, valueColumn });

test('figures, tables and equations are numbered per chapter; appendices use their own sequence', () => {
  const report = [
    section('a', '摘要', '概要'), section('c1', '一、背景', '', [block('f0', 'chart', '图甲', 'freq')]),
    section('c2', '二、分析'), section('s', '（一）结果', '', [block('t1', 'table', '表甲', 'freq'), block('e1', 'formula', 'x^2'), block('f1', 'chart', '图乙', 'freq'), block('f2', 'chart', '图丙', 'freq')]),
    section('ap', '附录1 数据', '', [block('t9', 'table', '附表甲', 'freq')]),
  ];
  const labels = reportLabels(report);
  assert.deepEqual(['f0', 't1', 'e1', 'f1', 'f2', 't9'].map(id => labels.get(id).label), ['图 1-1', '表 2-1', '（2-1）', '图 2-1', '图 2-2', '附表 1']);
  assert.equal(numberedCaption(labels.get('f1'), '使用频次'), '图 2-1  使用频次');
  const text = `如${referenceToken('figure', 'f2')}所示，结合${referenceToken('table', 't1')}与${referenceToken('equation', 'e1')}可知。`;
  assert.equal(resolveReferences(text, labels, '测试'), '如图 2-2所示，结合表 2-1与式（2-1）可知。');
  assert.ok(referenceSegments('见[[图:t1]]', labels).some(s => s.missing), 'a figure token pointing at a table is flagged');
  assert.throws(() => resolveReferences('见[[表:gone]]', labels, '第二章'), /第二章.*引用已失效/);
  const content = { ...createEditorContent(), report: [...report, section('x', '三、讨论', '见[[图:gone]]')] };
  assert.deepEqual(danglingReferences(content).map(d => d.sectionId), ['x']);
});

test('report tables round by meaning and lay a crosstab out as a matrix', () => {
  assert.equal(formatCell(0.375, '比例'), '0.375', 'a bare 比例 is not assumed to be a percentage');
  assert.equal(formatCell(40.465, '占比（%）'), '40.5');
  assert.equal(formatCell(0.0004, 'p 值'), '<0.001');
  assert.equal(formatCell(27.04, '期望频数'), '27.04');
  assert.equal(formatCell(12, '频数'), '12');
  assert.equal(formatCell(null, '均值'), '—');
  const freq = presentResult(results.freq);
  assert.deepEqual(freq.headers, ['类别', '频数', '占比（%）', '95% 置信区间（%）']);
  assert.deepEqual(freq.rows.at(-1).slice(0, 3), ['合计', '60', '100.0']);
  assert.match(freq.rows[0][3], /^\[\d+\.\d, \d+\.\d\]$/);
  const cross = presentResult(results.cross);
  assert.equal(cross.headers.length, 1 + 3 + 1, 'blank corner, three columns and a total');
  assert.equal(cross.rows.length, 3 + 1, 'three age groups and a total row');
  assert.match(cross.rows[0][1], /^\d+（\d+\.\d%）$/);
  assert.equal(cross.rows.at(-1).at(-1), '60');
  assert.match(cross.note, /行内占比/);
  assert.deepEqual(presentResult(results.groups).headers, ['组别', '样本量', '均值', '标准差', '中位数']);
  const generic = presentResult({ ...results.freq, method: 'custom' });
  assert.deepEqual(generic.headers, results.freq.headers, 'unknown layouts keep every column');
  assert.ok(columnWeights(cross).every(w => w >= 6));
  assert.equal(sourceLine(results.freq), '资料来源：教学模拟数据；有效样本 n = 60；模拟数据。');
  assert.equal(sectionNotes([{ ...results.freq, warnings: ['甲。乙；', '乙'] }, { ...results.freq, warnings: ['丙。'] }]), '注：甲；乙；丙。');
});

test('figures use the chart type that fits the result and render to clean vector graphics', async () => {
  const cross = figureOption(results.cross, 3, '#0F766E');
  assert.equal(cross.series.length, 3, 'one series per column category');
  assert.ok(cross.legend);
  const freq = figureOption(results.freq, 1, '#0F766E');
  assert.equal(freq.xAxis.type, 'category', 'few short labels stand upright');
  const many = figureOption({ ...results.freq, rows: Array.from({ length: 9 }, (_, i) => [`类别${i}`, i + 1, 10]) }, 1, '#0F766E');
  assert.equal(many.yAxis.type, 'category', 'many labels lie horizontally');
  const groups = figureOption(results.groups, 2, '#0F766E');
  assert.equal(groups.series.at(-1).type, 'custom', 'group means carry standard-deviation whiskers');
  assert.throws(() => figureOption({ ...results.freq, rows: [] }, 1, '#0F766E'), /没有数据行/);
  const svg = await figureSVG(results.cross, 3, '#0F766E');
  assert.match(svg, /^<svg/);
  assert.doesNotMatch(svg, /<style|class=|pointer-events/);
  assert.match(svg, /Times New Roman/);
});

test('inline math splits only on dollar pairs that hug their content', () => {
  assert.deepEqual(splitInlineMath('样本量 $n_0$ 与 $5 和 $6 元'), [{ text: '样本量 ', math: false }, { text: 'n_0', math: true }, { text: ' 与 $5 和 $6 元', math: false }]);
  assert.deepEqual(splitInlineMath('价格 \\$5'), [{ text: '价格 $5', math: false }]);
});

test('Word export carries native equations, numbered captions, resolved references and one note per section', async () => {
  const content = createEditorContent();
  content.version = 2;
  content.quality = { version: 1, results: Object.values(results), findings: [] };
  content.report = [
    section('c1', '一、调查设计', '样本量按 $n_0=\\frac{z^2p(1-p)}{e^2}$ 计算，见[[式:eq]]。', [block('eq', 'formula', 'n_0=\\frac{z^2p(1-p)}{e^2}')]),
    section('c2', '二、结果', '如[[图:fig]]与[[表:tab]]所示。', [block('fig', 'chart', '年龄组与频次', 'cross', 3), block('tab', 'table', '年龄组与频次', 'cross'), block('g', 'chart', '满意度均值', 'groups', 2)]),
  ];
  const zip = await JSZip.loadAsync(await (await buildDocx(parseEditorContent(content), undefined, renderSvg)).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal([...xml.matchAll(/<m:oMathPara>/g)].length, 1, 'one display equation');
  assert.match(xml, /<w:t xml:space="preserve">样本量按 <\/w:t><\/w:r><m:oMath>/, 'inline math sits inside the sentence');
  assert.match(xml, /（1-1）/);
  assert.match(xml, /见式（1-1）。/);
  assert.match(xml, /如图 2-1与表 2-1所示/);
  assert.match(xml, /图 2-1  年龄组与频次/);
  assert.match(xml, /表 2-1  年龄组与频次/);
  assert.match(xml, /图 2-2  满意度均值/);
  assert.doesNotMatch(xml, /§§OMML/);
  assert.equal([...xml.matchAll(/<w:t xml:space="preserve">资料来源：/g)].length, 2, 'the chart and table of one result share a source line');
  assert.equal([...xml.matchAll(/>注：/g)].length, 1, 'caveats are gathered once for the section');
  assert.match(xml, /TOC \\h \\t &quot;图题,1&quot;/);
  assert.match(xml, /TOC \\h \\t &quot;表题,1&quot;/);
  const broken = structuredClone(content);
  broken.report[1].body = '见[[图:missing]]';
  await assert.rejects(buildDocx(parseEditorContent(broken), undefined, renderSvg), /引用已失效/);
});
