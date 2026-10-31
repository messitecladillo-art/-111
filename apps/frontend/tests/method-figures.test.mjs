import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planSVG, svgSize } from '../lib/report-figures.ts';
import { canChart, clusterProfilePlot, figureMetrics, forestPlot, ipaPlot, methodFigure, niceBounds, niceLogBounds, screePlot } from '../lib/method-figures.ts';

const accent = '#2F6B4F';

test('every method figure renders as report SVG: self-contained vector, full width, its labels in place', async () => {
  const figures = {
    forest: [forestPlot([{ name: '课程评价', estimate: 0.372, low: 0.236, high: 0.508 }, { name: '场地评价', estimate: 0.005, low: -0.137, high: 0.147 }], { axis: '回归系数 B（95% 置信区间）', reference: 0 }, accent), ['课程评价', '场地评价', '回归系数']],
    odds: [forestPlot([{ name: '是否会员', estimate: 1.83, low: 1.12, high: 2.98 }, { name: '年级', estimate: 0.91, low: 0.7, high: 1.18 }], { axis: '发生比比率 OR', reference: 1 }, accent), ['是否会员', '年级']],
    scree: [screePlot([2.707, 1.969, 0.629, 0.529], accent), ['特征值 = 1', '2.71', '1.97']],
    ipa: [ipaPlot([{ name: '开放时间', importance: 4.75, performance: 2.25 }, { name: '装饰', importance: 1.75, performance: 4.5 }], { importance: 3.25, performance: 3.375 }, accent), ['重点改进', '继续保持', '低优先', '过度投入', '开放时间', '装饰']],
    profile: [clusterProfilePlot([[0.9, -0.2], [-0.8, 0.9]], [72, 61], ['课程评价', '价格敏感'], accent), ['课程评价', '价格敏感', '第 1 类']],
  };
  for (const [name, [plan, labels]] of Object.entries(figures)) {
    const svg = await planSVG(plan);
    assert.equal(svgSize(svg).width, 960, name);
    assert.ok(!/url\(|<image|<script|href=/.test(svg), `${name}: no references or raster`);
    labels.forEach(label => assert.ok(svg.includes(label), `${name}: “${label}”`));
  }
  const scree = await planSVG(screePlot([2.707, 1.969, 0.629, 0.529], accent));
  assert.ok(!scree.includes('0.63') && !scree.includes('0.53'), 'factors below Kaiser’s line are not labelled');
});

test('axes end on round values', () => {
  assert.deepEqual(niceBounds(-0.162, 0.879), { min: -0.25, max: 1, interval: 0.25 });
  assert.deepEqual(niceBounds(1.91, 4.84), { min: 1, max: 5, interval: 1 });
  assert.deepEqual(niceBounds(0, 0), { min: 0, max: 0, interval: 0.2 });
  assert.deepEqual(niceLogBounds(0.7, 3.29), { min: 0.5, max: 5 });
  assert.deepEqual(niceLogBounds(1.12, 1.8), { min: 1, max: 2 });
  assert.deepEqual(niceLogBounds(0.0004, 12000), { min: 0.0002, max: 20000 }, 'beyond 0.001–5000 the axis still covers the values');
  assert.deepEqual(niceLogBounds(2, 2), { min: 2, max: 5 }, 'never a zero-width axis');
  assert.throws(() => niceLogBounds(0, 1));
});

test('a figure is refused when its numbers are incomplete', () => {
  assert.throws(() => forestPlot([{ name: 'a', estimate: NaN, low: 0, high: 1 }], { axis: 'B', reference: 0 }, accent), /无法作图/);
  assert.throws(() => forestPlot([{ name: 'a', estimate: 1, low: 0, high: 2 }], { axis: 'OR', reference: 1 }, accent), /无法作图/, 'an odds ratio interval cannot reach zero on a log axis');
  assert.throws(() => screePlot([2], accent), /无法作图/);
  assert.throws(() => ipaPlot([{ name: 'a', importance: 1, performance: 1 }], { importance: 1, performance: 1 }, accent), /至少需要两个属性/);
  assert.throws(() => clusterProfilePlot([[1, 2]], [5], ['x', 'y'], accent), /无法作图/);
});

test('figure data round-trips through result metrics; what does not fit is left out', async () => {
  const forest = { kind: 'forest', rows: [{ name: '体验｜清晰', estimate: 0.4, low: 0.1, high: 0.7 }, { name: '价格', estimate: -0.2, low: -0.5, high: 0.1 }] };
  const metrics = figureMetrics(forest);
  assert.equal(metrics.length, 6);
  const plan = methodFigure({ method: 'regression', headers: ['变量', 'B'], metrics }, '#2F6B4F');
  assert.equal(await planSVG(plan), await planSVG(forestPlot(forest.rows, { axis: '回归系数 B（95% 置信区间）', reference: 0 }, '#2F6B4F')), 'a separator inside a name survives');
  const profile = { kind: 'profile', centers: [[1, -1], [-1, 1]], sizes: [30, 20], variables: ['甲｜乙', '丙'] };
  assert.equal(await planSVG(methodFigure({ method: 'cluster', headers: [], metrics: figureMetrics(profile) }, '#2F6B4F')), await planSVG(clusterProfilePlot(profile.centers, profile.sizes, profile.variables, '#2F6B4F')));
  assert.equal(figureMetrics({ kind: 'scree', eigenvalues: Array.from({ length: 41 }, (_, i) => 41 - i) }), null, 'more than 40 numbers: no figure');
  assert.equal(methodFigure({ method: 'regression', headers: [], metrics: [{ label: 'R²', value: 0.3 }] }, '#2F6B4F'), null, 'a result without figure metrics draws as before');
  assert.equal(methodFigure({ method: 'frequency', headers: [], metrics }, '#2F6B4F'), null);
});

test('an advanced result is a figure only through its own figure; a sampling frame never', () => {
  assert.equal(canChart({ method: 'frequency', metrics: [] }), true);
  assert.equal(canChart({ method: 'sampling-frame', metrics: [] }), false);
  assert.equal(canChart({ method: 'ahp', metrics: [] }), false, 'AHP weights are a table');
  assert.equal(canChart({ method: 'regression', metrics: figureMetrics({ kind: 'scree', eigenvalues: [2, 1] }) }), true);
  assert.equal(canChart({ method: 'cluster', metrics: [] }), false, 'a result whose figure did not fit');
});
