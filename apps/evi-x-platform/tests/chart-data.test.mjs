import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartSnapshot } from '../lib/chart-data.ts';
import { createPlanNode, filterPlanSample, runPlanNode } from '../lib/analysis-plan.ts';
import { describeNumbers, parseSurveyCsv } from '../lib/survey-analysis.ts';

const binding = { dataHash: 'a'.repeat(64), signature: 'synthetic-scope-v1', computedAt: '2026-10-11T01:30:00+08:00' };
const node = (method, x = 0, y = null) => ({ ...createPlanNode(method, 'synthetic'), x, y });
const compute = (table, selected, codes = []) => {
  const result = runPlanNode(table, selected, codes);
  return { result, snapshot: buildChartSnapshot(table, selected, result, codes, binding) };
};
const numericTable = values => ({ headers: ['数值'], rows: values.map(value => [String(value)]), skippedBlankLines: 0, delimiter: ',' });
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
test('interpolated quartiles keep Tukey whiskers outside the box in small samples',()=>{
 for(const values of [[1,2,2,4],[-4,-2,-2,-1],[1,1,1,9],[2]]){const {snapshot}=compute(numericTable(values),node('numeric'));const d=snapshot.distributions[0];assert.ok(d.box.low<=d.box.q1);assert.ok(d.box.high>=d.box.q3);assert.ok(d.box.q1<=d.box.median&&d.box.median<=d.box.q3);assert.equal(d.bins.reduce((n,b)=>n+b.count,0),values.length);}
 const {snapshot}=compute(numericTable([1,2,2,4]),node('numeric'));assert.equal(snapshot.distributions[0].box.high,2.5);assert.deepEqual(snapshot.distributions[0].box.outliers,[4]);
});

test('frequency uses exact computed counts and Unicode identity without conflating zero and missing', () => {
  const table = parseSurveyCsv('渠道\n校园 🧩\n 社区 \n0\n校园 🧩\nNA\n" "');
  const { result, snapshot } = compute(table, node('frequency'), ['NA']);
  assert.equal(snapshot.n, 4);
  assert.deepEqual(snapshot.categories, result.rows.map(row => ({ key: JSON.stringify(['渠道', row[0]]), label: row[0], count: row[1], percent: row[2] })));
  assert.equal(snapshot.categories.find(item => item.label === '0').count, 1);
  assert.deepEqual(snapshot.table, { headers: result.headers, rows: result.rows });
  snapshot.table.rows[0][0] = 'changed'; snapshot.binding.signature = 'changed';
  assert.equal(result.rows[0][0], '校园 🧩'); assert.equal(binding.signature, 'synthetic-scope-v1');
});

test('numeric projections preserve negative and zero while omitting missing, invalid, overflow and underflow', () => {
  const table = numericTable(['-2', '0', '3', '99', 'NA', '', 'bad', '1e999', '1000000000001', '1e-999']);
  const { result, snapshot } = compute(table, node('numeric'), ['NA', '99']);
  assert.equal(result.n, 3); assert.deepEqual(snapshot.distributions[0].values, [-2, 0, 3]);
  assert.deepEqual(snapshot.distributions[0].summary, describeNumbers([-2, 0, 3]));
  assert.equal(snapshot.distributions[0].bins.reduce((sum, bin) => sum + bin.count, 0), result.n);
  assert.deepEqual(table.rows[3], ['99']);
});

test('Tukey observed whiskers differ from min/max and Type7 quartiles match existing engine', () => {
  const { snapshot } = compute(numericTable([0, 1, 2, 3, 100]), node('numeric'));
  assert.deepEqual(snapshot.distributions[0].box, { low: 0, q1: 1, median: 2, q3: 3, high: 3, outliers: [100] });
  const even = compute(numericTable([0, 1, 2, 3]), node('numeric')).snapshot.distributions[0];
  assert.equal(even.box.q1, .75); assert.equal(even.box.q3, 2.25); assert.equal(even.box.median, 1.5);
});

test('Sturges histogram counts include the final endpoint and each internal boundary only once', () => {
  const { snapshot } = compute(numericTable([0, 1, 2, 3]), node('numeric'));
  assert.deepEqual(snapshot.distributions[0].bins, [
    { start: 0, end: 1, count: 1 }, { start: 1, end: 2, count: 1 }, { start: 2, end: 3, count: 2 },
  ]);
  const many = compute(numericTable(Array.from({ length: 5000 }, (_, i) => i % 97)), node('numeric')).snapshot.distributions[0];
  assert.ok(many.bins.length <= 40); assert.equal(many.bins.reduce((sum, bin) => sum + bin.count, 0), 5000);
});

test('ECDF combines ties at their cumulative right-continuous probability', () => {
  const { snapshot } = compute(numericTable([3, 1, 1, 2, 3]), node('numeric'));
  assert.deepEqual(snapshot.distributions[0].ecdf, [[1, 2 / 5], [2, 3 / 5], [3, 1]]);
});

test('constant and singleton samples retain exact observations without invented KDE or interval width', () => {
  for (const values of [[-2, -2, -2], [0]]) {
    const d = compute(numericTable(values), node('numeric')).snapshot.distributions[0];
    assert.equal(d.density, null);
    assert.deepEqual(d.bins, [{ start: values[0], end: values[0], count: values.length }]);
    assert.deepEqual(d.ecdf, [[values[0], 1]]);
    assert.equal(d.box.low, values[0]); assert.equal(d.box.high, values[0]); assert.deepEqual(d.box.outliers, []);
  }
});

test('Gaussian KDE records explicit robust bandwidth, Gaussian normalization and extent', () => {
  const values = [-2, -1, 0, 0, 0, 1, 2];
  const d = compute(numericTable(values), node('numeric')).snapshot.distributions[0];
  const h = .9 * Math.min(d.summary.sd, (d.summary.q3 - d.summary.q1) / 1.34) * values.length ** (-.2);
  near(d.density.bandwidth, h);
  near(d.density.points[0][0], -2 - 3 * h); near(d.density.points.at(-1)[0], 2 + 3 * h);
  assert.equal(d.density.points.length, 128); assert.match(d.density.method, /Silverman/);
  for (const [x, y] of d.density.points) {
    const exact = values.reduce((sum, value) => sum + Math.exp(-.5 * ((x - value) / h) ** 2), 0) / (values.length * h * Math.sqrt(2 * Math.PI));
    near(y, exact);
  }
  const area = d.density.points.slice(1).reduce((sum, [x, y], i) => { const [previousX, previousY] = d.density.points[i]; return sum + (x - previousX) * (y + previousY) / 2; }, 0);
  assert.ok(area > .998 && area < 1.001);
  const ties = compute(numericTable([0, 0, 0, 0, 1]), node('numeric')).snapshot.distributions[0];
  assert.equal(ties.summary.q3, 0); assert.ok(ties.density.bandwidth > 0); // Explicit positive sd fallback for zero IQR.
});

test('large origins and subnormal ranges remain finite and histogram boundaries never collapse', () => {
  for (const values of [[1e12 - 3 / 8192, 1e12 - 2 / 8192, 1e12 - 1 / 8192, 1e12], [1e-300, 2e-300, 3e-300]]) {
    const d = compute(numericTable(values), node('numeric')).snapshot.distributions[0];
    assert.ok(Object.values(d.summary).every(value => value === null || Number.isFinite(value)));
    assert.equal(d.bins.reduce((sum, bin) => sum + bin.count, 0), values.length);
    assert.ok(d.bins.every(bin => bin.start < bin.end));
    assert.ok(d.density === null || d.density.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  }
});

test('groups preserve first observed order and expose no fabricated distribution for zero-valid groups', () => {
  const table = parseSurveyCsv('人群,数值\n甲,0\n乙,NA\n甲,-2\n丙,4\n乙,bad\nNA,10\n丙,6');
  const { result, snapshot } = compute(table, node('groups', 0, 1), ['NA']);
  assert.equal(snapshot.n, 4);
  assert.deepEqual(snapshot.table.rows, result.rows);
  assert.deepEqual(snapshot.table.rows.map(row => [row[0], row[1]]), [['甲', 2], ['乙', 0], ['丙', 2]]);
  assert.deepEqual(snapshot.distributions.map(d => [d.label, d.values]), [['甲', [0, -2]], ['丙', [4, 6]]]);
  assert.deepEqual(snapshot.distributions.map(d => d.key), ['["人群","甲"]', '["人群","丙"]']);
});

test('cross cells and row percentages copy the complete computed grid including zero cells', () => {
  const table = parseSurveyCsv('渠道,选择\n校园,甲\n校园,甲\n社区,乙\n社区,甲\n校园,NA\nNA,乙');
  const { result, snapshot } = compute(table, node('crosstab', 0, 1), ['NA']);
  assert.deepEqual(snapshot.cross.rows, ['校园', '社区']); assert.deepEqual(snapshot.cross.columns, ['甲', '乙']);
  assert.deepEqual(snapshot.cross.cells, result.rows.map(row => ({ row: row[0], column: row[1], count: row[2], rowPercent: row[3] })));
  assert.equal(snapshot.cross.cells[1].count, 0); assert.equal(snapshot.cross.cells[3].rowPercent, 50);
  assert.equal(snapshot.cross.cells.reduce((sum, cell) => sum + cell.count, 0), snapshot.n);
});

test('paired projections and average ranks use only valid pairs and handle duplicate ties deterministically', () => {
  const table = parseSurveyCsv('X,Y\n1,1\n2,NA\n3,2\nNA,3\n4,4\n3,2\n0,bad');
  for (const method of ['pearson', 'spearman']) {
    const { snapshot } = compute(table, node(method, 0, 1), ['NA']);
    assert.deepEqual(snapshot.pairs.values, [[1, 1], [3, 2], [4, 4], [3, 2]]);
    assert.deepEqual(snapshot.pairs.ranks, [[1, 1], [2.5, 2.5], [4, 4], [2.5, 2.5]]);
    assert.equal(snapshot.n, 4);
  }
});

test('caller effective branch and routing intersection is used once, without repeated filtering', () => {
  const table = parseSurveyCsv('分支,数值,完成\n是,1,是\n否,20,是\n是,2,否\n是,3,是');
  const selected = { ...node('numeric', 1), filter: { column: 0, values: ['是'] } };
  const branch = filterPlanSample(table, selected.filter, []);
  const effective = { ...branch.table, rows: branch.table.rows.filter(row => row[2] === '是') };
  const result = runPlanNode(effective, selected, []);
  const snapshot = buildChartSnapshot(effective, selected, result, [], binding);
  assert.deepEqual(snapshot.distributions[0].values, [1, 3]); assert.equal(snapshot.n, 2);
  assert.throws(() => buildChartSnapshot(table, selected, result, [], binding), /不一致/);
  assert.throws(() => buildChartSnapshot(effective, selected, { ...result, n: 1 }, [], binding), /不一致/);
  assert.throws(() => buildChartSnapshot(effective, { ...selected, method: 'groups' }, result, [], binding), /不一致/);
});

test('reliability uses exact reversed complete-case diagnostics without row-level item data', () => {
  const table = parseSurveyCsv('Q1,Q2\n1,5\n2,4\n3,3\n4,2\nNA,1\n5,bad\n6,1');
  const selected = { ...node('alpha', null), scale: { columns: [0, 1], reverse: [1], min: 1, max: 5, construct: '体验' } };
  const { result, snapshot } = compute(table, selected, ['NA']);
  assert.equal(snapshot.n, 4); assert.equal(result.reliability.alpha, 1);
  assert.deepEqual(snapshot.reliability, result.reliability.items.map(item => ({ key: JSON.stringify([item.name, item.name]), label: item.name, mean: item.mean, sd: item.sd, correctedItemTotal: item.correctedItemTotal, alphaIfDeleted: item.alphaIfDeleted })));
  assert.deepEqual(snapshot.reliability.map(item => item.mean), [2.5, 2.5]);
  assert.deepEqual(snapshot.table.rows.map(row => row[1]), ['否', '是']);
  assert.deepEqual(snapshot.distributions, []); assert.equal(snapshot.pairs, null);
  assert.deepEqual(snapshot.reliability.map(item => item.alphaIfDeleted), [null, null]);
  assert.throws(() => buildChartSnapshot(table, { ...selected, scale: { ...selected.scale, reverse: [] } }, result, ['NA'], binding), /不一致/);
});

test('empty effective inputs preserve null and empty structures instead of inventing measurements', () => {
  const table = { headers: ['X', 'Y'], rows: [], skippedBlankLines: 0, delimiter: ',' };
  for (const method of ['frequency', 'numeric', 'groups', 'crosstab', 'pearson', 'spearman']) {
    const { snapshot } = compute(table, node(method, 0, ['frequency', 'numeric'].includes(method) ? null : 1));
    assert.equal(snapshot.n, 0); assert.deepEqual(snapshot.categories, []); assert.deepEqual(snapshot.distributions, []);
    if (snapshot.pairs) assert.deepEqual(snapshot.pairs, { values: [], ranks: [] });
    if (snapshot.cross) assert.deepEqual(snapshot.cross, { rows: [], columns: [], cells: [] });
  }
});
