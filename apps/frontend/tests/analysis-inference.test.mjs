import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSurveyCsv } from '../lib/survey-analysis.ts';
import { exportRecipeResult, runRecipe } from '../lib/analysis-recipes.ts';

// End to end: survey tables built from the SciPy reference inputs must reproduce the reference tests.
const ref = JSON.parse(readFileSync(new URL('./fixtures/inference-reference.json', import.meta.url), 'utf8'));
const close = (a, b, label) => assert.ok(Math.abs(a - b) <= Math.max(1e-13, Math.abs(b) * 1e-9), `${label}: ${a} vs ${b}`);
const groupTable = groups => parseSurveyCsv(['组别,得分', ...groups.flatMap((values, i) => values.map(v => `组${i + 1},${v}`))].join('\n'));
const run = (table, method, x, y = null) => runRecipe(table, { id: 'r', method, x, y, question: '合成检验' }, []);

test('two groups report Welch t with Mann–Whitney as the robustness check', () => {
  const c = ref.welch[0], result = run(groupTable([c.x, c.y]), 'groups', 0, 1);
  assert.equal(result.inference.primary.name, 'Welch t 检验');
  close(result.inference.primary.p, c.p, 'welch p');
  assert.match(result.inference.primary.line, /^Welch t\(\d+\.\d\) = -?\d+\.\d{2}, p (=|<) \.?\d+/);
  assert.equal(result.inference.robustness[0].name, 'Mann–Whitney U 检验');
  assert.deepEqual(result.metrics.map(m => m.label), ['有效分组数', 'p 值（Welch t）', 'Hedges g', 'Welch t', '自由度']);
  // The statistic and its degrees of freedom are carried as numbers, matching the printed test line.
  const metric = label => result.metrics.find(m => m.label === label).value;
  assert.equal(metric('Welch t').toFixed(2), /= (-?\d+\.\d{2}),/.exec(result.inference.primary.line)[1]);
  assert.equal(metric('自由度').toFixed(1), /^Welch t\((\d+\.\d)\)/.exec(result.inference.primary.line)[1]);
  assert.ok(result.inference.notes.some(n => n.includes('随机抽样')));
  assert.equal(result.rows.length, 2);
});

test('three or more groups report Welch ANOVA, classic ANOVA, Kruskal–Wallis and Holm pairwise comparisons', () => {
  const c = ref.groups[0], result = run(groupTable(c.groups), 'groups', 0, 1);
  close(result.inference.primary.p, c.welchP, 'welch anova p');
  close(result.metrics.find(m => m.label === 'Welch F').value, c.welchF, 'welch F metric');
  assert.equal(result.metrics.find(m => m.label === '分子自由度').value, c.groups.length - 1);
  close(result.metrics.find(m => m.label === '分母自由度').value, c.welchDf2, 'welch df2 metric');
  close(result.inference.robustness.find(r => r.name === '经典方差分析').p, c.fp, 'anova p');
  close(result.inference.robustness.find(r => r.name === 'Kruskal–Wallis 检验').p, c.hp, 'kw p');
  const pairs = result.inference.comparisons;
  assert.equal(pairs.length, 3);
  for (const p of pairs) assert.ok(p.adjusted >= p.p && p.adjusted <= 1);
  const exported = exportRecipeResult(result);
  assert.deepEqual(exported.rows.map(r => r[0]), ['类别 1', '类别 2', '类别 3']);
  assert.deepEqual(exported.inference.comparisons.map(p => [p.a, p.b]), [['类别 1', '类别 2'], ['类别 1', '类别 3'], ['类别 2', '类别 3']]);
  assert.ok(!JSON.stringify(exported).includes('组1'));
});

test('groups with fewer than two values or no variance do not produce a test', () => {
  let result = run(groupTable([[1, 2, 3], [4]]), 'groups', 0, 1);
  assert.equal(result.inference.primary.p, null);
  assert.match(result.inference.primary.line, /^检验不定义/);
  result = run(groupTable([[2, 2, 2], [5, 5]]), 'groups', 0, 1);
  assert.equal(result.inference.primary.p, null);
  result = run(groupTable([[1, 2, 3]]), 'groups', 0, 1);
  assert.equal(result.inference, undefined);
});

test('sparse 2 × 2 tables switch the primary result to Fisher exact; larger sparse tables warn', () => {
  const cells = (a, b, c, d) => [['甲', '是', a], ['甲', '否', b], ['乙', '是', c], ['乙', '否', d]].flatMap(([r, s, n]) => Array.from({ length: n }, () => `${r},${s}`));
  for (const f of ref.fisher.slice(0, 3)) {
    const [[a, b], [c, d]] = f.table, result = run(parseSurveyCsv(['人群,选择', ...cells(a, b, c, d)].join('\n')), 'crosstab', 0, 1);
    const fisher = [result.inference.primary, ...result.inference.robustness].find(r => r.name === 'Fisher 精确检验');
    close(fisher.p, f.p, 'fisher p');
  }
  const sparse = run(parseSurveyCsv(['人群,选择', ...cells(0, 6, 6, 0)].join('\n')), 'crosstab', 0, 1);
  assert.equal(sparse.inference.primary.name, 'Fisher 精确检验'); // expected counts are 3 in every cell
  close(sparse.inference.primary.p, ref.fisher[3].p, 'sparse fisher p');
  const c = ref.chiSquare[0], rows = ['人群,选择'];
  c.table.forEach((row, i) => row.forEach((n, j) => { for (let k = 0; k < n; k++) rows.push(`R${i},C${j}`); }));
  const big = run(parseSurveyCsv(rows.join('\n')), 'crosstab', 0, 1);
  close(big.inference.primary.p, c.p, 'chi p');
  assert.match(big.inference.primary.line, /^χ²\(2, N = 50\)/);
});

test('correlations report two-sided p, a Fisher z interval for Pearson and none for Spearman', () => {
  const c = ref.correlation[0], table = parseSurveyCsv(['x,y', ...c.x.map((v, i) => `${v},${c.y[i]}`)].join('\n'));
  const pearson = run(table, 'pearson', 0, 1), spearman = run(table, 'spearman', 0, 1);
  close(pearson.inference.primary.p, c.p, 'pearson p');
  close(pearson.inference.primary.effect.interval.lower, c.lower, 'lower');
  close(spearman.inference.primary.p, c.rhoP, 'spearman p');
  assert.equal(spearman.inference.primary.effect.interval, null);
  assert.deepEqual(pearson.metrics.map(m => m.label), ['Pearson r', 'p 值（双侧）', '95% CI 下限', '95% CI 上限']);
});

test('frequency and numeric tables append interval columns without disturbing existing positions', () => {
  const table = parseSurveyCsv('v\n1\n2\n2\n3\n3\n3');
  const frequency = run(table, 'frequency', 0), numeric = run(table, 'numeric', 0);
  assert.deepEqual(frequency.headers.slice(0, 3), ['类别', '频数', '有效样本占比 (%)']);
  for (const row of frequency.rows) assert.ok(row[3] <= row[2] && row[2] <= row[4]);
  assert.deepEqual(numeric.rows.slice(0, 7).map(r => r[0]), ['均值', '样本标准差', '最小值', 'Q1', '中位数', 'Q3', '最大值']);
  const [lower, upper] = numeric.rows.slice(7).map(r => r[1]);
  assert.ok(lower < 14 / 6 && 14 / 6 < upper);
});

test('exported summary metadata and method guide describe the inference that is now performed', async () => {
  const board = readFileSync(new URL('../components/analysis/AnalysisRecipeBoard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(board, /inference: 'not performed'|No p-values, confidence intervals/);
  assert.match(board, /assume random sampling or random assignment/);
  const { RESEARCH_METHOD_CARDS: METHOD_CARDS } = await import('../lib/research-method-guide.ts');
  for (const id of ['descriptive-profile', 'categorical-association', 'paired-association']) {
    const card = METHOD_CARDS.find(c => c.id === id), text = JSON.stringify(card);
    assert.doesNotMatch(text, /不输出 p 值|当前没有显著性结论|不执行 t 检验/, id);
    assert.match(text, /随机抽样/, id);
  }
});

test('results with inference can still be registered as research findings', async () => {
  const { snapshotRecipe } = await import('../lib/research-quality.ts');
  // Six groups give the most pairwise comparisons; categories near the 50-value limit give the widest frequency table.
  const lines = ['组别,得分,类别,行,列,评分'];
  for (let i = 0; i < 240; i++) lines.push(`组${i % 6},${(i * 37) % 11},C${i % 48},R${i % 3},K${(i * 7) % 4},${(i * 13) % 5 + 1}`);
  const table = parseSurveyCsv(lines.join('\n'));
  const source = { title: '登记', sourceName: '合成.csv', sourceUrl: '', sourceHash: 'a'.repeat(64), classification: 'simulated' };
  for (const [method, x, y] of [['frequency', 2, null], ['numeric', 1, null], ['groups', 0, 1], ['crosstab', 3, 4], ['pearson', 1, 5], ['spearman', 1, 5]]) {
    const result = run(table, method, x, y);
    // Frequency and numeric results carry their intervals as table columns and rows.
    if (!['frequency', 'numeric'].includes(method)) assert.ok(result.inference, method);
    // SurveyLab appends the sample scope and missing codes before snapshotting.
    const snapshot = await snapshotRecipe({ ...result, warnings: [...result.warnings, '原表 240 行', '缺失编码：空白'] }, source);
    assert.deepEqual(snapshot.headers, result.headers, method);
    assert.equal(snapshot.rows.length, result.rows.length, method);
  }
});
