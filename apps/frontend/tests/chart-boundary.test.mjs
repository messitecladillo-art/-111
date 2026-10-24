import test from 'node:test';
import assert from 'node:assert/strict';
import sax from 'sax';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { createPlanNode, runPlanNode } from '../lib/analysis-plan.ts';
import { buildChartSnapshot } from '../lib/chart-data.ts';
import { chartChoices } from '../lib/chart-registry.ts';
import { defaultChartSettings, defaultChartStyle, serializeChartSettings, restoreChartSettings, themeColor, resolveFigureSettings, currentChartSettings } from '../lib/chart-theme.ts';
import { buildChartOption, buildTableSVG } from '../lib/chart-options.ts';

// Independent adversarial fixtures: no real respondents or existing result data.
const binding = { dataHash: 'a'.repeat(64), signature: 'synthetic-paired-scope', computedAt: '2026-10-11T01:30:00+08:00' };
function strictXML(svg) {
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  parser.onerror = error => { throw error; };
  parser.write(svg).close();
}
const build = (csv, method, x, y = null, missing = [], override = {}) => {
  const table = parseSurveyCsv(csv);
  const node = { ...createPlanNode(method, 'fixture'), x, y, ...override };
  const result = runPlanNode(table, node, missing);
  return { table, node, result, snapshot: buildChartSnapshot(table, node, result, missing, binding) };
};

test('Tukey whiskers stop at inliers; duplicate high outliers and Type7 quartiles remain exact', () => {
  const { snapshot } = build('数值\n0\n1\n2\n3\n100', 'numeric', 0);
  assert.deepEqual(snapshot.distributions[0].box, { low: 0, q1: 1, median: 2, q3: 3, high: 3, outliers: [100] });
  assert.equal(snapshot.distributions[0].bins.reduce((n, b) => n + b.count, 0), 5);
});

test('singleton and constant observations have undefined density and singleton SD, never fabricated zero', () => {
  const one = build('数值\n7\nNA\nno', 'numeric', 0, null, ['NA']).snapshot;
  assert.equal(one.n, 1); assert.equal(one.distributions[0].summary.sd, null);
  assert.equal(one.distributions[0].density, null);
  assert.deepEqual(one.distributions[0].bins, [{ start: 7, end: 7, count: 1 }]);
  const constant = build('数值\n7\n7\n7', 'numeric', 0).snapshot;
  assert.equal(constant.distributions[0].density, null);
  assert.deepEqual(constant.distributions[0].ecdf, [[7, 1]]);
});

test('group with no valid outcome stays in result table with n0/null and creates no fake distribution', () => {
  const { snapshot } = build('组别,数值\n甲,2\n甲,4\n乙,NA\n乙,no\n丙,5', 'groups', 0, 1, ['NA']);
  assert.equal(snapshot.n, 3);
  assert.deepEqual(snapshot.table.rows.find(row => row[0] === '乙'), ['乙', 0, null, null, null, null, null]);
  assert.deepEqual(snapshot.distributions.map(d => d.label), ['甲', '丙']);
  assert.equal(snapshot.distributions.find(d => d.label === '丙').summary.sd, null);
});

test('Spearman ranks exclude unpaired rows and average ties within actual complete cases', () => {
  const { snapshot } = build('数值甲,数值乙\n1,1\n2,NA\n3,2\nNA,3\n4,4\n4,4\n8,no', 'spearman', 0, 1, ['NA']);
  assert.equal(snapshot.n, 4);
  assert.deepEqual(snapshot.pairs.values, [[1, 1], [3, 2], [4, 4], [4, 4]]);
  assert.deepEqual(snapshot.pairs.ranks, [[1, 1], [2, 2], [3.5, 3.5], [3.5, 3.5]]);
});

test('crosstab frequency and row percentages use paired scope, including explicit zero cells', () => {
  const { snapshot } = build('类别甲,类别乙\n甲,一\n甲,二\n甲,二\n乙,一\n乙,NA\nNA,二', 'crosstab', 0, 1, ['NA']);
  assert.equal(snapshot.n, 4);
  assert.deepEqual(snapshot.cross.cells, [
    { row: '甲', column: '一', count: 1, rowPercent: (1 / 3) * 100 },
    { row: '甲', column: '二', count: 2, rowPercent: (2 / 3) * 100 },
    { row: '乙', column: '一', count: 1, rowPercent: 100 },
    { row: '乙', column: '二', count: 0, rowPercent: 0 },
  ]);
});

test('alpha boundary applies complete-case range/missing exclusions and reverse scoring before item means', () => {
  const { snapshot, result } = build('Q1,Q2\n1,5\n2,4\n3,3\n4,2\nNA,1\n6,1\n2,no', 'alpha', null, null, ['NA'], { scale: { columns: [0, 1], reverse: [1], min: 1, max: 5, construct: '合成构念' } });
  assert.equal(snapshot.n, 4); assert.equal(result.total, 7);
  assert.deepEqual(snapshot.reliability.map(d => d.mean), [2.5, 2.5]);
  assert.deepEqual(snapshot.reliability.map(d => d.correctedItemTotal), [1, 1]);
  assert.deepEqual(snapshot.reliability.map(d => d.alphaIfDeleted), [null, null]);
});

test('snapshot mismatch rejects wrong n, total, method or a source with different valid scope', () => {
  const { table, node, result } = build('数值\n1\n2\n3', 'numeric', 0);
  for (const altered of [{ ...result, n: 2 }, { ...result, total: 4 }, { ...result, method: 'frequency' }]) {
    assert.throws(() => buildChartSnapshot(table, node, altered, [], binding), /样本与计算结果不一致/);
  }
  const changed = { ...table, rows: [['1'], ['2'], ['NA']] };
  assert.throws(() => buildChartSnapshot(changed, node, result, ['NA'], binding), /样本与计算结果不一致/);
});

test('snapshot does not mutate effective input or result and source result has no observation projection', () => {
  const { table, node, result } = build('数值甲,数值乙\n1,2\n3,4\n5,8', 'pearson', 0, 1);
  const before = JSON.stringify({ table, result });
  const snapshot = buildChartSnapshot(table, node, result, [], binding);
  snapshot.pairs.values[0][0] = 999;
  snapshot.table.rows[0][1] = 999;
  snapshot.binding.dataHash = 'changed';
  assert.equal(JSON.stringify({ table, result }), before);
  assert.equal(Object.hasOwn(result, 'pairs'), false);
  assert.equal(binding.dataHash, 'a'.repeat(64));
});

const styledFixture = () => {
  const snapshot = build('类别\n甲\n甲\n乙', 'frequency', 0).snapshot;
  const modules = [{ id: 'fixture', title: '中文标题 🧩', question: '', current: true, snapshot }];
  const settings = { ...defaultChartSettings(), figures: { fixture: { kind: 'bar', style: { ...defaultChartStyle('中文标题 🧩'), note: '有效样本与图形口径' } } } };
  return { modules, settings, raw: serializeChartSettings(settings, modules) };
};

test('style roundtrip binds exact source and calculation scope while containing no observed cells', () => {
  const { modules, settings, raw } = styledFixture();
  assert.deepEqual(restoreChartSettings('\uFEFF' + raw, modules), settings);
  const serialized = JSON.parse(raw);
  assert.deepEqual(Object.keys(serialized.figures[0].binding).sort(), ['dataHash', 'signature']);
  assert.equal(raw.includes('"observations"'), false); assert.equal(raw.includes('"categories"'), false);
  for (const mutation of [
    m => { m[0].current = false; },
    m => { m[0].snapshot.binding.dataHash = 'b'.repeat(64); },
    m => { m[0].snapshot.binding.signature = 'different-filter-mapping-or-missing-policy'; },
    m => { m[0].id = 'other-node'; },
  ]) {
    const changed = structuredClone(modules); mutation(changed);
    assert.throws(() => restoreChartSettings(raw, changed));
  }
  assert.throws(() => serializeChartSettings(settings, [{ ...modules[0], current: false }]), /计算|变化|当前/);
});

test('style parser rejects hidden rows, prototype names, duplicate Unicode fields, active colors and extreme dimensions', () => {
  const { modules, raw } = styledFixture();
  for (const mutation of [
    p => { p.rows = [['private']]; },
    p => { p.figures[0].observations = [1, 2]; },
    p => { p.figures[0].style.result = 7; },
    p => { p.figures[0].binding.mapping = 'forged'; },
    p => { p.figures[0].id = '__proto__'; },
    p => { p.figures[0].style.background = 'url(https://example.test/x)'; },
    p => { p.figures[0].style.fontSize = 1e999; },
    p => { p.figures[0].style.width = 2401; },
    p => { p.figures[0].style.decimals = 1.5; },
    p => { p.figures[0].style.showBorder = 'false'; },
    p => { p.figures[0].style.title = '\u0000'; },
    p => { p.figures.push(structuredClone(p.figures[0])); },
    p => { p.figures[0].kind = 'roc'; },
    p => { p.schema = 'chart-format/v2'; },
  ]) { const poisoned = JSON.parse(raw); mutation(poisoned); assert.throws(() => restoreChartSettings(JSON.stringify(poisoned), modules)); }
  assert.throws(() => restoreChartSettings(raw.replace('"theme":', '"\\u0074heme":"blue","theme":'), modules), /重复/);
  assert.throws(() => restoreChartSettings('中'.repeat(34_000), modules), /100 KB/);
});

test('chart availability is truthful for all-missing, constant and singleton distributions and alpha diagnostics', () => {
  const empty = build('数值\nNA\nno', 'numeric', 0, null, ['NA']).snapshot;
  assert.deepEqual(chartChoices(empty).filter(c => c.available).map(c => c.id), ['table']);
  const one = build('数值\n7', 'numeric', 0).snapshot;
  for (const kind of ['density', 'violin', 'raincloud']) assert.equal(chartChoices(one).find(c => c.id === kind).available, false);
  const two = build('Q1,Q2\n1,2\n2,3\n3,4', 'alpha', null, null, [], { scale: { columns: [0, 1], reverse: [], min: 1, max: 5, construct: '合成构念' } }).snapshot;
  assert.equal(chartChoices(two).find(c => c.id === 'alpha_deleted').available, false);
});

test('same category keeps its identity color after frequency sort and independent source filtering', () => {
  const first = build('类别\n甲\n甲\n乙', 'frequency', 0).snapshot;
  const second = build('类别\n乙\n乙\n甲', 'frequency', 0).snapshot;
  for (const theme of ['blue', 'teal', 'forest', 'plum', 'slate']) {
    for (const label of ['甲', '乙']) {
      const a = first.categories.find(c => c.label === label), b = second.categories.find(c => c.label === label);
      assert.equal(a.key, b.key); assert.equal(themeColor(a.key, theme), themeColor(b.key, theme));
    }
  }
});

test('automatic axes match actual plotted statistic and chart orientation', () => {
  const style = defaultChartStyle('自动语义轴');
  const numeric = build('数值\n1\n2\n3\n4', 'numeric', 0).snapshot;
  const group = build('组别,数值\n甲,1\n甲,2\n乙,3\n乙,4', 'groups', 0, 1).snapshot;
  assert.equal(buildChartOption(numeric, 'density', style, 'blue').yAxis.name, '概率密度');
  assert.equal(buildChartOption(numeric, 'ecdf', style, 'blue').yAxis.name, '累计比例');
  assert.equal(buildChartOption(numeric, 'boxplot', style, 'blue').yAxis.name, '数值');
  assert.equal(buildChartOption(group, 'group_density', style, 'blue').xAxis.name, '数值');
  assert.equal(buildChartOption(group, 'group_density', style, 'blue').yAxis.name, '概率密度');
});

test('table export escapes active text and preserves exact Chinese, null and long labels with intrinsic height', () => {
  const { snapshot } = build('类别\n甲\n乙', 'frequency', 0);
  snapshot.table = { headers: ['中文列名', '空值'], rows: [['<script>alert(1)</script> & "中文"', null], ['长中文'.repeat(70), -0.015]] };
  const style = { ...defaultChartStyle('研究图表'), height: 320, note: '来源 <外部> & 实际结果', decimals: 3 };
  const exported = buildTableSVG(snapshot, style);
  strictXML(exported.svg);
  strictXML(buildTableSVG(snapshot, { ...style, fontFamily: 'serif' }).svg);
  assert.ok(exported.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.equal(exported.svg.includes('<script>'), false);
  assert.ok(exported.svg.includes('&lt;script&gt;'));
  assert.ok(exported.svg.includes('中文列名')); assert.ok(exported.svg.includes('—'));
  assert.ok(exported.svg.includes('-0.015')); assert.ok(exported.height > 320);
  assert.ok(!/<(?:foreignObject|iframe|image)\b/.test(exported.svg));
});

test('every available chart kind renders an actual finite SVG from adversarial synthetic fixtures', async () => {
  const engine = await import('echarts');
  const fixtures = [
    build('类别\n甲\n甲\n乙\n<script>测试</script>', 'frequency', 0).snapshot,
    build('数值\n-4\n0\n1\n2\n3\n100', 'numeric', 0).snapshot,
    build('组别,数值\n甲,0\n甲,2\n甲,3\n乙,-1\n乙,4\n乙,5\n丙,NA', 'groups', 0, 1, ['NA']).snapshot,
    build('类别甲,类别乙\n甲,一\n甲,二\n甲,二\n乙,一', 'crosstab', 0, 1).snapshot,
    build('数值甲,数值乙\n1,2\n3,2\n5,8\n6,10', 'pearson', 0, 1).snapshot,
    build('Q1,Q2,Q3\n1,2,5\n2,4,3\n3,2,4\n4,5,2\n5,4,1', 'alpha', null, null, [], { scale: { columns: [0, 1, 2], reverse: [2], min: 1, max: 5, construct: '合成构念' } }).snapshot,
  ];
  const exercised = new Set();
  for (const snapshot of fixtures) for (const choice of chartChoices(snapshot).filter(c => c.available && c.id !== 'table')) for (const fontFamily of ['sans', 'serif']) {
    const instance = engine.init(null, null, { renderer: 'svg', ssr: true, width: 1200, height: 720 });
    try {
      instance.setOption(buildChartOption(snapshot, choice.id, { ...defaultChartStyle('中文 <script> 结果'), fontFamily }, 'blue'));
      const svg = instance.renderToSVGString();
      strictXML(svg);
      assert.match(svg, /^<svg /, choice.id);
      assert.ok(!svg.includes('<script>'), choice.id);
      assert.ok(!/\b(?:NaN|Infinity)\b/.test(svg), choice.id);
      assert.ok(svg.includes('中文'), choice.id);
      exercised.add(choice.id);
    } finally { instance.dispose(); }
  }
  assert.equal(exercised.size, 30);
});

test('strict SVG validation detects unescaped double quotes inside font attributes', () => {
  const malformed = '<svg xmlns="http://www.w3.org/2000/svg"><text style="font: 20px "Microsoft YaHei", serif">中文</text></svg>';
  assert.throws(() => strictXML(malformed));
});

test('current-format export materializes untouched defaults with automatic semantic axes', () => {
  const { modules } = styledFixture();
  const initial = defaultChartSettings();
  const materialized = currentChartSettings(initial, modules);
  const raw = serializeChartSettings(materialized, modules);
  const actual = restoreChartSettings(raw, modules);
  assert.equal(actual.figures.fixture.kind, 'bar');
  assert.equal(actual.figures.fixture.style.title, modules[0].title);
  assert.equal(actual.figures.fixture.style.xLabel, '');
  assert.equal(actual.figures.fixture.style.yLabel, '');
  assert.deepEqual(initial.figures, {});
});

test('removal excludes inactive formats from downloads while undo restores the same saved preference', () => {
  const { modules, settings } = styledFixture();
  const removed = { ...modules[0], id: 'removed', title: '待撤销的模块' };
  settings.figures.removed = { kind: 'horizontal_bar', style: { ...defaultChartStyle('保留标题'), ink: '#154321' } };
  const before = JSON.stringify(settings);
  const activeExport = currentChartSettings(settings, modules);
  assert.deepEqual(Object.keys(activeExport.figures), ['fixture']);
  assert.doesNotThrow(() => serializeChartSettings(activeExport, modules));
  const undone = currentChartSettings(settings, [...modules, removed]);
  assert.deepEqual(undone.figures.removed, settings.figures.removed);
  assert.deepEqual(resolveFigureSettings(removed, settings), settings.figures.removed);
  assert.equal(JSON.stringify(settings), before);
});

test('pending and stale formats remain in memory while portable scope contains only current modules', () => {
  const { modules, settings } = styledFixture();
  const pending = { id: 'pending', title: '待计算模块', question: '', current: false, snapshot: null };
  const stale = { ...modules[0], id: 'stale', current: false };
  settings.figures.pending = { kind: 'table', style: { ...defaultChartStyle('待用'), fontSize: 18 } };
  settings.figures.stale = { kind: 'bar', style: { ...defaultChartStyle('待更新'), fontSize: 18 } };
  const roster = [...modules, pending, stale];
  const currentSettings = currentChartSettings(settings, roster);
  assert.deepEqual(Object.keys(currentSettings.figures), ['fixture']);
  assert.equal(settings.figures.pending.style.fontSize, 18);
  assert.equal(settings.figures.stale.style.fontSize, 18);
  assert.equal(JSON.parse(serializeChartSettings(currentSettings, roster)).figures.length, 1);
  assert.throws(() => serializeChartSettings(settings, roster), /计算/);
});

test('currently unavailable preferred type fails format export rather than silently substituting a chart', () => {
  const { modules, settings } = styledFixture();
  settings.figures.fixture.kind = 'roc';
  assert.throws(() => serializeChartSettings(currentChartSettings(settings, modules), modules), /不支持/);
  assert.equal(settings.figures.fixture.kind, 'roc');
});

test('plan identifiers that collide with Object.prototype cannot turn inherited values into figure settings', () => {
  const { modules, settings } = styledFixture();
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    const allowedPlanNode = createPlanNode('frequency', id);
    assert.equal(allowedPlanNode.id, id); // Existing plan identity parser accepts these names.
    const item = { ...modules[0], id };
    const figure = resolveFigureSettings(item, defaultChartSettings());
    assert.equal(figure.kind, 'bar');
    assert.equal(figure.style.title, item.title);
    const poisonedNames = { ...settings, figures: Object.fromEntries([[id, settings.figures.fixture]]) };
    assert.throws(() => serializeChartSettings(currentChartSettings(poisonedNames, [item]), [item]), /编号|无效|不支持/);
  }
  for (const id of ['toString', 'valueOf', 'hasOwnProperty', '__defineGetter__']) {
    const item = { ...modules[0], id };
    assert.equal(resolveFigureSettings(item, defaultChartSettings()).kind, 'bar');
    const explicit = { ...settings, figures: Object.fromEntries([[id, settings.figures.fixture]]) };
    const raw = serializeChartSettings(currentChartSettings(explicit, [item]), [item]);
    assert.deepEqual(restoreChartSettings(raw, [item]).figures[id], settings.figures.fixture);
  }
});

test('large serif table titles start below the top and wrap using their rendered title size', () => {
  const { snapshot } = build('类别\n甲\n乙', 'frequency', 0);
  const style = { ...defaultChartStyle('证'.repeat(180)), fontFamily: 'serif', fontSize: 24, width: 480 };
  const { svg } = buildTableSVG(snapshot, style);
  const texts = []; let current = null;
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  parser.onerror = error => { throw error; };
  parser.onopentag = node => { if (node.local === 'text') current = { attrs: node.attributes, content: '' }; };
  parser.ontext = text => { if (current) current.content += text; };
  parser.onclosetag = name => { if (name === 'text' && current) { texts.push(current); current = null; } };
  parser.write(svg).close();
  const titleLines = texts.filter(t => /^证+$/.test(t.content));
  assert.equal(titleLines.map(t => t.content).join(''), style.title);
  assert.ok(titleLines.length > 1);
  const attr = (t, name) => Number(t.attrs[name].value);
  assert.ok(attr(titleLines[0], 'y') >= attr(titleLines[0], 'font-size'), 'first title baseline must leave room for its full glyph above it');
  for (const line of titleLines) {
    assert.equal(attr(line, 'font-size'), style.fontSize * 1.5);
    assert.ok(line.content.length * attr(line, 'font-size') <= style.width - 56, 'Chinese title lines must fit the actual title-font width');
  }
});
