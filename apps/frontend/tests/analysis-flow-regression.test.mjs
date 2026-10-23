import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_CSV, FLOW_HEADERS, FLOW_MISSING, flowNodes, flowPlan } from '../scripts/analysis-flow-fixture.mjs';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { filterPlanSample, runPlanNode, serializePlan, restorePlan, exportPlanResult } from '../lib/analysis-plan.ts';
import { buildChartSnapshot } from '../lib/chart-data.ts';
import { buildTableSVG } from '../lib/chart-options.ts';
import { defaultChartStyle } from '../lib/chart-theme.ts';
const near = (a, b) => assert.ok(a !== null && Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const source = parseSurveyCsv(FLOW_CSV);
const node = method => flowNodes().find(item => item.method === method);
const compute = method => {
  const selected = node(method), branch = filterPlanSample(source, selected.filter, FLOW_MISSING);
  return { selected, branch, result: runPlanNode(branch.table, selected, FLOW_MISSING) };
};

test('synthetic UTF8 source retains original rows while every branch excludes unqualified large values', () => {
  assert.deepEqual(source.headers, FLOW_HEADERS); assert.equal(source.rows.length, 20);
  const before = JSON.stringify(source), { branch, result } = compute('numeric');
  assert.deepEqual(branch.evidence, { totalRows: 20, branchRows: 14, excludedRows: 6, missingRows: 2, filterColumn: 0, values: ['参与'] });
  assert.equal(result.total, 14); assert.equal(result.n, 12); assert.equal(result.missingRows, 2); assert.equal(result.invalidRows, 0);
  near(result.metrics[0].value, 37.5); assert.equal(JSON.stringify(source), before);
  assert.ok(runPlanNode(source, { ...node('numeric'), filter: null }, FLOW_MISSING).metrics[0].value > 250);
});

test('seven methods agree with independently derived sufficient statistics including ties and reverse scoring', () => {
  const frequency = compute('frequency').result;
  assert.equal(frequency.n, 14); assert.deepEqual(new Map(frequency.rows.map(row => [row[0], row.slice(1, 3)])), new Map([['校园', [7, 50]], ['社区', [7, 50]]]));
  // Wilson 95% interval for 7/14, z = 1.959963984540054: centre and half-width derived by hand.
  const z = 1.959963984540054, centre = (0.5 + z * z / 28) / (1 + z * z / 14), half = z / (1 + z * z / 14) * Math.sqrt(0.25 / 14 + z * z / (4 * 196));
  frequency.rows.forEach(row => { near(row[3], (centre - half) * 100); near(row[4], (centre + half) * 100); });
  const numeric = compute('numeric').result;
  const values = new Map(numeric.rows); near(values.get('样本标准差'), Math.sqrt(325));
  assert.equal(values.get('Q1'), 23.75); assert.equal(values.get('中位数'), 37.5); assert.equal(values.get('Q3'), 51.25);
  assert.equal(values.get('最小值'), 10); assert.equal(values.get('最大值'), 65);
  const groups = compute('groups').result;
  assert.deepEqual(groups.rows.map(row => row.slice(0, 3)), [['校园', 6, 35], ['社区', 6, 40]]);
  groups.rows.forEach(row => near(row[3], Math.sqrt(350)));
  const cross = compute('crosstab').result;
  assert.equal(cross.n, 14); assert.deepEqual(cross.rows.map(row => row.slice(0, 3)), [['校园', '线下', 5], ['校园', '线上', 2], ['社区', '线下', 3], ['社区', '线上', 4]]);
  near(cross.metrics[0].value, 7 / 6); assert.equal(cross.metrics[1].value, 1); near(cross.metrics[2].value, Math.sqrt(1 / 12));
  near(compute('pearson').result.metrics[0].value, 0.9701294534935903);
  near(compute('spearman').result.metrics[0].value, 0.9752173865600178);
  const alpha = compute('alpha').result;
  assert.equal(alpha.n, 12); assert.equal(alpha.missingRows, 1); assert.equal(alpha.reliability.outOfRangeRows, 1);
  near(alpha.metrics[0].value, 108 / 109);
  alpha.reliability.items.forEach((item, i) => near(item.mean, [3, 19 / 6, 3][i]));
  assert.equal(alpha.reliability.items[2].reversed, true);
});

test('all methods produce matching chart and three-line table snapshots without expanding the analysis sample', () => {
  for (const method of flowNodes().map(item => item.method)) {
    const { selected, branch, result } = compute(method);
    const snapshot = buildChartSnapshot(branch.table, selected, result, FLOW_MISSING, { dataHash: 'a'.repeat(64), signature: 'synthetic-analysis-flow/v1', computedAt: '2026-10-11T13:30:00Z' });
    assert.equal(snapshot.n, ['frequency', 'crosstab'].includes(method) ? 14 : 12);
    assert.deepEqual(snapshot.table, { headers: result.headers, rows: result.rows });
    const { svg } = buildTableSVG(snapshot, { ...defaultChartStyle(`合成验收：${method}`), width: 1200, height: 600 });
    assert.ok(svg.startsWith('<svg')); assert.match(svg, /stroke-width="2"/); assert.match(svg, /stroke-width="1"/); assert.match(svg, /text-anchor="middle"/);
    assert.ok(!svg.includes('999') && !svg.includes('888'));
    if (snapshot.distributions.length) assert.equal(snapshot.distributions.reduce((sum, item) => sum + item.values.length, 0), result.n);
    if (snapshot.pairs) assert.equal(snapshot.pairs.values.length, 12);
    if (snapshot.cross) assert.equal(snapshot.cross.cells.reduce((sum, item) => sum + item.count, 0), 14);
    if (method === 'alpha') assert.deepEqual(snapshot.distributions, []);
  }
});

test('restored plan preserves stable IDs, order, all settings and exact recomputed results, with no raw rows or cached results', async () => {
  const plan = await flowPlan(source), raw = serializePlan(plan), restored = restorePlan(raw, plan.source, ['NA']);
  assert.deepEqual(restored, plan);
  assert.ok(!raw.includes('"rows"') && !raw.includes('"results"'));
  for (const selected of restored.nodes) {
    const branch = filterPlanSample(source, selected.filter, restored.missingCodes);
    assert.deepEqual(runPlanNode(branch.table, selected, restored.missingCodes), compute(selected.method).result);
  }
  assert.throws(() => restorePlan(raw, { ...plan.source, hash: 'f'.repeat(64) }, FLOW_MISSING), /不一致/);
  assert.throws(() => restorePlan(raw, plan.source, ['99']), /缺失代码/);
  assert.throws(() => restorePlan(raw.replace('"schema":', '"schema":"analysis-plan/v1","schema":'), plan.source, FLOW_MISSING), /重复/);
});

test('empty branch, zero variance and uncorrected reverse item never produce a usable high consistency/correlation claim', () => {
  assert.throws(() => filterPlanSample(source, { column: 0, values: [] }, FLOW_MISSING), /筛选/);
  assert.throws(() => filterPlanSample(source, { column: 0, values: ['NA'] }, FLOW_MISSING), /缺失值/);
  const { branch } = compute('alpha');
  const unreversed = runPlanNode(branch.table, { ...node('alpha'), scale: { ...node('alpha').scale, reverse: [] } }, FLOW_MISSING);
  assert.ok(unreversed.metrics[0].value < 0);
  const constant = { ...branch.table, rows: branch.table.rows.map(row => row.map((cell, i) => [3, 4, 5, 6, 7].includes(i) ? '3' : cell)) };
  for (const method of ['pearson', 'spearman', 'alpha']) {
    const result = runPlanNode(constant, node(method), FLOW_MISSING);
    assert.equal(result.metrics[0].value, null); assert.ok(result.warnings.some(text => /无变异|不定义|未定义/.test(text)));
  }
});

test('summary export never mutates source results or leaks row level answers and participant category labels', () => {
  for (const method of ['frequency', 'groups', 'crosstab']) {
    const { result } = compute(method), before = JSON.stringify(result), exported = exportPlanResult(result);
    assert.ok(!JSON.stringify(exported.rows).includes('校园') && !JSON.stringify(exported.rows).includes('社区'));
    assert.equal(JSON.stringify(result), before); assert.equal(exported.n, result.n);
    exported.rows[0][0] = 'edited'; assert.equal(JSON.stringify(result), before);
  }
});
