import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { linearRegression } from '../lib/regression.ts';
import { ipa, quadrant } from '../lib/ipa.ts';

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('stated importance: means of the ratings, split at the means of the points', () => {
  // Placeholder attributes; four respondents rate each attribute's importance and performance on 1–5.
  const r = ipa([
    { name: '开放时间', importance: [5, 5, 4, 5], performance: [2, 3, 2, 2] },
    { name: '设施维护', importance: [4, 5, 5, 4], performance: [4, 5, 4, 4] },
    { name: '停车', importance: [2, 3, 2, 2], performance: [2, 2, 3, 2] },
    { name: '装饰', importance: [2, 2, 1, 2], performance: [4, 5, 5, 4] },
  ]);
  assert.equal(r.mode, 'stated');
  assert.equal(r.r2, null);
  assert.deepEqual(r.points.map(p => [p.name, p.importance, p.performance, p.quadrant]), [
    ['开放时间', 4.75, 2.25, '重点改进'], ['设施维护', 4.5, 4.25, '继续保持'], ['停车', 2.25, 2.25, '低优先'], ['装饰', 1.75, 4.5, '过度投入']]);
  near(r.lines.importance, 3.3125, 1e-12, 'importance line');
  near(r.lines.performance, 3.3125, 1e-12, 'performance line');
  const midpoint = ipa([{ name: 'a', importance: [4], performance: [2.9] }, { name: 'b', importance: [2], performance: [3.1] }], { lines: { importance: 3, performance: 3 } });
  assert.deepEqual(midpoint.points.map(p => p.quadrant), ['重点改进', '过度投入'], 'a fixed scale midpoint can be the split');
});

test('derived importance is the standardized β of each attribute on overall satisfaction', () => {
  // Seeded teaching-simulation ratings: overall satisfaction leans on the first attribute most; no respondents.
  const random = seededRandom('ipa-derived');
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const a = [], b = [], c = [], overall = [];
  for (let i = 0; i < 120; i++) {
    const x = 3 + normal(), y = 3.5 + normal(), z = 2.5 + normal();
    a.push(x); b.push(y); c.push(z); overall.push(0.7 * x + 0.3 * y + 0.05 * z + normal() * 0.5);
  }
  const r = ipa([{ name: 'A', performance: a }, { name: 'B', performance: b }, { name: 'C', performance: c }], { overall });
  const fit = linearRegression(overall, [{ name: 'A', values: a }, { name: 'B', values: b }, { name: 'C', values: c }]);
  assert.equal(r.mode, 'derived');
  r.points.forEach((p, i) => near(p.importance, fit.coefficients[i + 1].standardized, 1e-15, `β ${p.name}`));
  near(r.r2, fit.r2, 1e-15, 'R²');
  assert.ok(r.points[0].importance > r.points[1].importance && r.points[1].importance > r.points[2].importance);
  assert.equal(r.points[0].quadrant === '继续保持' || r.points[0].quadrant === '重点改进', true, 'the strongest driver is on the important side');
});

test('quadrants and refusals', () => {
  const lines = { importance: 3, performance: 3 };
  assert.deepEqual([[4, 4], [4, 2], [2, 2], [2, 4], [3, 3]].map(([i, p]) => quadrant(i, p, lines)), ['继续保持', '重点改进', '低优先', '过度投入', '继续保持']);
  assert.deepEqual(ipa([{ name: 'a', performance: [1] }]), { refused: 'too-few-attributes' });
  assert.deepEqual(ipa([{ name: 'a', performance: [1, 2] }, { name: 'b', performance: [1] }]), { refused: 'uneven-columns' });
  assert.deepEqual(ipa([{ name: 'a', performance: [1, 2] }, { name: 'b', performance: [2, 1] }]), { refused: 'no-importance' });
  assert.deepEqual(ipa([{ name: 'a', performance: [] }, { name: 'b', performance: [] }]), { refused: 'no-cases' });
});
