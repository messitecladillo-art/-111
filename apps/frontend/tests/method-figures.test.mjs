import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planSVG, svgSize } from '../lib/report-figures.ts';
import { clusterProfilePlot, forestPlot, ipaPlot, niceBounds, niceLogBounds, screePlot } from '../lib/method-figures.ts';

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
});

test('a figure is refused when its numbers are incomplete', () => {
  assert.throws(() => forestPlot([{ name: 'a', estimate: NaN, low: 0, high: 1 }], { axis: 'B', reference: 0 }, accent), /无法作图/);
  assert.throws(() => forestPlot([{ name: 'a', estimate: 1, low: 0, high: 2 }], { axis: 'OR', reference: 1 }, accent), /无法作图/, 'an odds ratio interval cannot reach zero on a log axis');
  assert.throws(() => screePlot([2], accent), /无法作图/);
  assert.throws(() => ipaPlot([{ name: 'a', importance: 1, performance: 1 }], { importance: 1, performance: 1 }, accent), /至少需要两个属性/);
  assert.throws(() => clusterProfilePlot([[1, 2]], [5], ['x', 'y'], accent), /无法作图/);
});
