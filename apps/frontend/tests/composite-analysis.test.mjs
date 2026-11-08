import test from 'node:test';
import assert from 'node:assert/strict';
import { groupProfile, likertDistribution, spearmanMatrix } from '../lib/composite-analysis.ts';
import { kruskalWallis, holm } from '../lib/inference.ts';
import { runRecipe } from '../lib/analysis-recipes.ts';
import { runAdvanced, advancedInsert, ADVANCED_METHODS } from '../lib/advanced-analysis.ts';
import { methodFigure } from '../lib/method-figures.ts';

// A small table: a group column (text), three ratings, a missing code 99 and one invalid cell.
const rows = [
  ['青年', '5', '4', '3'], ['青年', '4', '4', '2'], ['青年', '5', '5', '3'], ['青年', '3', '4', '1'],
  ['中年', '3', '2', '4'], ['中年', '2', '3', '5'], ['中年', '3', '2', '4'], ['中年', '1', '1', '5'],
  ['老年', '2', '3', '3'], ['老年', '4', '3', '3'], ['老年', '3', '3', '2'], ['老年', '99', '3', '3'],
  ['老年', '甲', '2', '2'],
];
const table = { headers: ['G', 'A', 'B', 'C'], rows, columnLabels: { G: '年龄段', A: '口味', B: '环境', C: '价格' } };
const missing = ['99'];

test('a group profile compares every dimension across the groups, Holm-corrected, with ε²', () => {
  const r = groupProfile(table, 0, [1, 2, 3], ['口味', '环境', '价格'], missing);
  assert.ok(!('refused' in r));
  assert.equal(r.invalid, 1, 'the row with a non-number is invalid');
  assert.equal(r.n, 11, 'the row with the missing code is left out');
  assert.deepEqual(r.groups.map(g => g.n).reduce((a, b) => a + b), 11);
  const youth = r.groups.findIndex(g => g.label === '青年');
  assert.equal(r.dimensions[0].means[youth], (5 + 4 + 5 + 3) / 4);
  const values = d => r.groups.map(g => rows.filter(row => row[0] === g.label && !['99', '甲'].includes(row[1])).map(row => Number(row[d + 1])));
  const direct = [0, 1, 2].map(d => kruskalWallis(values(d)));
  r.dimensions.forEach((x, d) => { assert.ok(Math.abs(x.h - direct[d].h) < 1e-12); assert.ok(Math.abs(x.epsilonSquared - direct[d].h / (r.n - 1)) < 1e-12); });
  assert.deepEqual(r.dimensions.map(x => x.pAdjusted), holm(direct.map(t => t.p)));
  assert.ok('refused' in groupProfile(table, 0, [1], ['口味'], missing));
  assert.ok('refused' in groupProfile(table, 1, [1, 2], ['口味', '环境'], missing), 'the grouping column is not a dimension');
});

test('a Likert distribution keeps the questionnaire scale, even a level nobody chose', () => {
  const r = likertDistribution(table, [1, 2, 3], ['口味', '环境', '价格'], missing, { min: 1, max: 5 });
  assert.ok(!('refused' in r));
  assert.deepEqual(r.levels, [1, 2, 3, 4, 5]);
  for (const item of r.items) assert.ok(Math.abs(item.shares.reduce((a, b) => a + b) - 1) < 1e-12);
  const taste = r.items[0];
  assert.equal(taste.top, taste.shares[3] + taste.shares[4], 'the top share is the levels above the midpoint');
  assert.ok('refused' in likertDistribution(table, [1, 2], ['口味', '环境'], missing, { min: 1, max: 4 }), 'a 5 outside a 1–4 scale is refused');
});

test('a Spearman matrix holds the same ρ as the single Spearman recipe, Holm-corrected across pairs', () => {
  const r = spearmanMatrix(table, [1, 2, 3], ['口味', '环境', '价格'], missing);
  assert.ok(!('refused' in r));
  assert.equal(r.pairs.length, 3);
  // Rows complete for all three variables are the ones the single recipe sees here too (the same rows are missing).
  const single = runRecipe({ ...table, rows: rows.filter(row => !['99', '甲'].includes(row[1])) }, { id: 'x', method: 'spearman', x: 1, y: 2, question: '' }, missing);
  const rho = single.metrics.find(m => m.label === 'Spearman ρ').value;
  assert.ok(Math.abs(r.pairs[0].rho - rho) < 1e-12);
  assert.deepEqual(r.pairs.map(p => p.pAdjusted), holm(r.pairs.map(p => p.p)));
});

test('each composite method writes a table, a figure from its own metrics and a reading, placed in its section', async () => {
  const runs = [
    runAdvanced({ method: 'profile', group: 0, dimensions: [1, 2, 3] }, table, missing),
    runAdvanced({ method: 'likert', items: [1, 2, 3], scale: { min: 1, max: 5 } }, table, missing),
    runAdvanced({ method: 'correlation', variables: [1, 2, 3] }, table, missing),
  ];
  const kinds = ['dots', 'likert', 'correlation'];
  for (const [i, run] of runs.entries()) {
    assert.ok(!('refused' in run), run.refused);
    assert.match(run.writing.table.caption, /表$/u, 'tables are named “…表”');
    assert.match(run.chart.caption, /图$/u, 'figures are named “…图”');
    const plan = methodFigure({ method: run.method, headers: run.writing.table.headers, metrics: run.chart.metrics }, '#0F766E');
    assert.equal(plan.kind, kinds[i]);
    const insert = await advancedInsert(run, { name: '模拟数据', hash: 'a'.repeat(64), simulated: true });
    assert.equal(insert.node, ADVANCED_METHODS.find(m => m.id === run.method).node);
    assert.ok(insert.items.some(item => item.kind === 'figure') && insert.items.some(item => item.kind === 'table'));
    assert.doesNotMatch(run.writing.reading, /导致|造成|因此提升/u, 'readings state association, never cause');
  }
});

test('the Likert figure labels the neutral answer with its whole share, once', () => {
  const run = runAdvanced({ method: 'likert', items: [1, 2, 3], scale: { min: 1, max: 5 } }, table, missing);
  const plan = methodFigure({ method: 'likert', headers: run.writing.table.headers, metrics: run.chart.metrics }, '#0F766E');
  const neutral = plan.option.series.filter(s => s.name === '3 分');
  assert.equal(neutral.length, 2, 'the neutral answer is two halves about the centre');
  assert.equal(neutral[1].label.show, false, 'only one half carries a label');
  const share = run.chart.metrics.filter(m => m.label.endsWith('｜3 分')), items = plan.option.yAxis.data;
  items.forEach((item, i) => {
    const whole = share.find(m => m.label.startsWith(`${item}｜`)).value * 100, text = neutral[0].label.formatter({ dataIndex: i });
    if (text) assert.equal(text, `${whole.toFixed(0)}%`);
  });
});
