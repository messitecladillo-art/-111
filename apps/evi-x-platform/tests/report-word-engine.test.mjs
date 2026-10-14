import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { buildDocx } from '../lib/editor-export.ts';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { runRecipe } from '../lib/analysis-recipes.ts';
import { snapshotRecipe } from '../lib/research-quality.ts';
import { blockLabel, danglingReferences, numberedCaption, referenceSegments, referenceToken, reportLabels, resolveReferences } from '../lib/report-numbering.ts';
import { categoryOrder, columnWeights, formatCell, presentResult, scaleScores, sectionNotes, sourceLine } from '../lib/report-tables.ts';
import { accentScale, FIGURE_WIDTH, figurePlan, figureSVG, onFill, svgSize } from '../lib/report-figures.ts';
import { splitInlineMath } from '../lib/quality-export.ts';
import { buildStoryboard } from '../lib/report-storyboard.ts';

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

test('slides built from report text cite figures by number, never by raw token', async () => {
  const content = createEditorContent();
  content.version = 2;
  content.quality = { version: 1, results: [results.freq], findings: [] };
  content.report = [section('c1', '一、结果', '如[[图:fig]]所示，青年组更活跃。', [block('fig', 'chart', '使用频次', 'freq')])];
  const [slide] = await buildStoryboard(parseEditorContent(content), [{ id: 'card', sectionId: 'c1', job: 'finding', classification: 'simulated', title: '青年组更活跃', excerpt: '如[[图:fig]]所示，青年组更活跃。', limitation: '仅限模拟样本', implication: '优先面向青年组', locator: '第一章', seconds: 45 }], 'replace');
  assert.match(slide.body, /如图 1-1所示/);
  assert.doesNotMatch(slide.body, /\[\[/);
  const card = excerpt => ({ id: 'card', sectionId: 'c1', job: 'finding', classification: 'simulated', title: '青年组更活跃', excerpt, limitation: '仅限模拟样本', implication: '优先面向青年组', locator: '第一章', seconds: 45 });
  const [fromPreview] = await buildStoryboard(parseEditorContent(content), [card('如图 1-1所示，青年组更活跃。')], 'replace');
  assert.match(fromPreview.body, /如图 1-1所示/, 'text copied from the preview is accepted');
  const broken = structuredClone(content);
  broken.report[0].body = '见[[图:gone]]，青年组更活跃。';
  await assert.rejects(buildStoryboard(parseEditorContent(broken), [card('见[[图:gone]]，青年组更活跃。')], 'replace'), /引用已失效/);
  await assert.rejects(buildStoryboard(parseEditorContent(broken), [card('引用失效）')], 'replace'), /引用已失效/, 'part of a rendered broken marker is refused too');
  const [beside] = await buildStoryboard(parseEditorContent(broken), [card('青年组更活跃。')], 'replace');
  assert.match(beside.body, /青年组更活跃/, 'text next to a broken reference is still usable');
  const math = structuredClone(content);
  math.report[0].body = '样本量为 $n_0=385$。';
  await assert.rejects(buildStoryboard(parseEditorContent(math), [card('样本量为 $n_0=385$。')], 'replace'), /行内公式/);
});

test('a block ID repeated in two sections keeps both numbers but cannot be referenced ambiguously', () => {
  const report = [section('c1', '一、甲', '', [block('dup', 'chart', '甲图', 'freq')]), section('c2', '二、乙', '', [block('dup', 'chart', '乙图', 'freq')])];
  const labels = reportLabels(report);
  assert.equal(blockLabel(labels, 'c1', 'dup').label, '图 1-1');
  assert.equal(blockLabel(labels, 'c2', 'dup').label, '图 2-1');
  assert.equal(labels.get('dup'), undefined);
  assert.ok(referenceSegments('见[[图:dup]]', labels)[1].missing);
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
  assert.equal(sourceLine({ ...results.freq, classification: 'user_provided', total: 64 }), '资料来源：教学模拟数据；有效样本 n = 60（共 64）；用户提供数据。');
  assert.equal(sectionNotes([{ ...results.freq, warnings: ['甲。乙；', '乙'] }, { ...results.freq, warnings: ['丙。'] }]), '注：甲；乙；丙。');
});

// Hue in degrees of a #RRGGBB colour; shades and tints of one colour share it.
const hue = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const freqRows = labels => ({ ...results.freq, rows: labels.map((l, i) => [l, i + 1, 10, 5, 15]) });

test('figures pick the type that fits the result and size their height to it', async () => {
  const cross = figurePlan(results.cross, 3, '#0F766E');
  assert.equal(cross.kind, 'stacked', 'a crosstab shows row shares as 100 % stacked bars');
  assert.equal(cross.option.series.length, 3, 'one series per column category');
  assert.ok(cross.option.series.every(s => s.stack === 'share'));
  assert.equal(cross.option.xAxis.max, 100);
  assert.ok(cross.option.legend);
  assert.equal(figurePlan(results.cross, 2, '#0F766E').kind, 'grouped', 'choosing the count column draws grouped bars');
  const wide = { ...results.cross, rows: ['甲', '乙'].flatMap(a => ['一', '二', '三', '四', '五', '六', '七'].map(b => [a, b, 3, 100 / 7, 3])) };
  assert.equal(figurePlan(wide, 3, '#0F766E').kind, 'heatmap', 'more than six columns become a heat map');
  assert.equal(figurePlan(results.freq, 1, '#0F766E').kind, 'ring', 'two to four answers form a ring');
  assert.equal(figurePlan(freqRows(['甲', '乙', '丙', '丁', '戊']), 1, '#0F766E').kind, 'bars', 'five short labels stand upright');
  assert.equal(figurePlan(freqRows(Array.from({ length: 9 }, (_, i) => `类别${i}`)), 1, '#0F766E').kind, 'barsHorizontal', 'many labels lie horizontally');
  const groups = figurePlan(results.groups, 2, '#0F766E');
  assert.equal(groups.kind, 'means');
  assert.equal(groups.option.series.at(-1).type, 'custom', 'group means carry standard-deviation whiskers');
  const numeric = await snapshotRecipe(runRecipe(table, { id: 'num', method: 'numeric', x: 3, y: null, question: 'num' }, []), { ...source, title: 'num', variables: ['满意度'] }, 'num');
  assert.equal(figurePlan(numeric, 1, '#0F766E').kind, 'box', 'one numeric variable is a five-number box');
  assert.throws(() => figurePlan({ ...results.freq, method: 'pearson' }, 1, '#0F766E'), /不适合作图/);
  assert.throws(() => figurePlan({ ...results.freq, rows: [] }, 1, '#0F766E'), /没有数据行/);
  const heights = new Set(['cross', 'freq', 'groups'].map(id => figurePlan(results[id], id === 'freq' ? 1 : 2, '#0F766E').height));
  assert.ok(heights.size > 1, 'heights follow the content');
  const svg = await figureSVG(results.cross, 3, '#0F766E');
  assert.match(svg, /^<svg/);
  assert.doesNotMatch(svg, /<style|class=|pointer-events/);
  assert.match(svg, /Times New Roman/);
  assert.equal(svgSize(svg).width, FIGURE_WIDTH);
  assert.equal(svgSize(svg).height, cross.height);
});

test('every figure colour is a shade or tint of the report accent', async () => {
  for (const accent of ['#0F766E', '#234E80', '#8A3449']) {
    const scale = accentScale(accent, 6);
    assert.equal(new Set(scale).size, 6, 'distinct steps');
    for (const color of scale) assert.ok(Math.abs(hue(color) - hue(accent)) < 4, `${color} keeps the hue of ${accent}`);
    for (const [id, column] of [['cross', 3], ['freq', 1], ['groups', 2]]) {
      const svg = await figureSVG(results[id], column, accent);
      const fills = [...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map(m => m[1].toUpperCase()).filter(c => hue(c) !== null);
      // Text and axes are neutral greys (no hue); every coloured fill belongs to the accent.
      for (const fill of fills.filter(c => { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) > 24; }))
        assert.ok(Math.abs(hue(fill) - hue(accent)) < 6, `${id}: ${fill} is not a shade of ${accent}`);
    }
  }
  assert.equal(onFill('#0F766E'), '#FFFFFF', 'labels on the deep accent are white');
  assert.equal(onFill(accentScale('#0F766E', 5).at(-1)), '#1F2329', 'labels on a light tint are ink');
});

test('categories read in their natural order: rating scales, numbered bands, "其他" last', () => {
  assert.deepEqual(categoryOrder(['满意', '一般', '非常满意', '不满意', '非常不满意']), { labels: ['非常不满意', '不满意', '一般', '满意', '非常满意'], ordinal: true });
  assert.deepEqual(categoryOrder(['经常', '从不', '偶尔']).labels, ['从不', '偶尔', '经常']);
  assert.deepEqual(categoryOrder(['25–34岁', '18–24岁', '50岁及以上', '35–49岁']).labels, ['18–24岁', '25–34岁', '35–49岁', '50岁及以上']);
  assert.deepEqual(categoryOrder(['其他', '健身路径', '篮球场']), { labels: ['健身路径', '篮球场', '其他'], ordinal: false });
  assert.equal(scaleScores(['男', '女', '其他']), null);
  assert.equal(scaleScores(['不满意', '比较不满意', '一般']), null, 'two answers on the same step are not one scale');
  assert.deepEqual([...scaleScores(['很不满意', '不太满意', '一般', '比较满意', '很满意']).values()], [1, 2, 3, 4, 5]);
  const scale = presentResult({ ...results.freq, rows: [['满意', 5, 50, 1, 2], ['一般', 3, 30, 1, 2], ['不满意', 2, 20, 1, 2]] });
  assert.deepEqual(scale.rows.map(r => r[0]), ['不满意', '一般', '满意', '合计'], 'frequency tables follow the scale');
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
