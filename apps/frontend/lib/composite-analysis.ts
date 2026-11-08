/**
 * Composite analyses: one result that reads several dimensions together, where separate single-variable results
 * would make the reader compare a dozen charts. Each takes columns of a survey table and keeps every row whose values
 * it reads are present (nothing imputed):
 *
 * - groupProfile: every dimension's mean in each group, with a Kruskal–Wallis test per dimension (ties corrected),
 *   its ε² effect size and Holm-adjusted p values across the dimensions;
 * - likertDistribution: each rating item's answer shares on its scale, its mean and its share at the top of the scale;
 * - spearmanMatrix: Spearman's ρ between every pair of variables, with Holm-adjusted p values across the pairs.
 */
import { averageRanks, pairedCorrelation } from './analysis-recipes.ts';
import { correlationTest, holm, kruskalWallis } from './inference.ts';
import { categoryOrder } from './report-tables.ts';
import { finiteNumber, isMissing, type SurveyTable } from './survey-analysis.ts';

export type GroupProfile = {
  groups: { label: string; n: number }[];
  dimensions: { name: string; means: number[]; h: number; df: number; p: number; pAdjusted: number; epsilonSquared: number }[];
  n: number; total: number; invalid: number;
};
export type LikertDistribution = {
  levels: number[];
  items: { name: string; n: number; shares: number[]; mean: number; top: number }[];
  n: number; total: number; invalid: number;
};
export type SpearmanMatrix = {
  variables: string[];
  pairs: { a: number; b: number; rho: number; p: number; pAdjusted: number }[];
  n: number; total: number; invalid: number;
};

const value = (cell: string | undefined, missing: readonly string[]) => (isMissing(cell ?? '', [...missing]) ? null : finiteNumber((cell ?? '').trim()));
const invalidCell = (cell: string | undefined, missing: readonly string[]) => !isMissing(cell ?? '', [...missing]) && finiteNumber((cell ?? '').trim()) === null;

/** Rows whose chosen numeric columns all hold numbers; a row with text that is not a missing code is invalid. */
function numericRows(table: SurveyTable, columns: readonly number[], missing: readonly string[]) {
  const rows: { row: string[]; values: number[] }[] = [];
  let invalid = 0;
  for (const row of table.rows) {
    if (columns.some(c => invalidCell(row[c], missing))) { invalid++; continue; }
    const values = columns.map(c => value(row[c], missing));
    if (values.every((v): v is number => v !== null)) rows.push({ row, values });
  }
  return { rows, invalid };
}

/**
 * Group means on several dimensions. Groups follow the category's natural order (rating scales and numbered bands in
 * order, others by size); a group with fewer than two complete rows is left out and named in `dropped`.
 */
export function groupProfile(table: SurveyTable, group: number, dimensions: readonly number[], names: readonly string[], missing: readonly string[]): GroupProfile | { refused: string } {
  if (dimensions.length < 2) return { refused: '至少选择 2 个评价维度。' };
  if (dimensions.includes(group)) return { refused: '分组变量不能同时作为评价维度。' };
  const { rows, invalid } = numericRows(table, dimensions, missing);
  const kept = rows.filter(r => !isMissing(r.row[group] ?? '', [...missing]));
  const byGroup = new Map<string, number[][]>();
  for (const r of kept) { const key = r.row[group].trim(); byGroup.set(key, [...(byGroup.get(key) ?? []), r.values]); }
  const order = categoryOrder([...byGroup.keys()]).labels.filter(label => (byGroup.get(label)?.length ?? 0) >= 2);
  if (order.length < 2) return { refused: '至少需要两个各有 2 条以上完整记录的组。' };
  if (order.length > 6) return { refused: `分组有 ${order.length} 个，超过 6 个，结果表无法排进报告；请先合并类别。` };
  const used = order.reduce((s, label) => s + byGroup.get(label)!.length, 0);
  const tests = dimensions.map((_, d) => kruskalWallis(order.map(label => byGroup.get(label)!.map(v => v[d]))));
  if (tests.some(t => t === null)) return { refused: '有评价维度在各组中没有变化，无法检验。' };
  const adjusted = holm(tests.map(t => t!.p));
  return {
    groups: order.map(label => ({ label, n: byGroup.get(label)!.length })),
    dimensions: dimensions.map((_, d) => ({
      name: names[d],
      means: order.map(label => { const v = byGroup.get(label)!; return v.reduce((s, x) => s + x[d], 0) / v.length; }),
      h: tests[d]!.h, df: tests[d]!.df, p: tests[d]!.p, pAdjusted: adjusted[d], epsilonSquared: tests[d]!.epsilonSquared,
    })),
    n: used, total: table.rows.length, invalid,
  };
}

/** Answer shares of rating items on one integer scale (2 to 7 points), each item on its own complete answers. */
export function likertDistribution(table: SurveyTable, items: readonly number[], names: readonly string[], missing: readonly string[], scale?: { min: number; max: number }): LikertDistribution | { refused: string } {
  if (items.length < 2) return { refused: '至少选择 2 个评分题。' };
  const { rows, invalid } = numericRows(table, items, missing);
  if (rows.length < 2) return { refused: '完整作答太少。' };
  const all = rows.flatMap(r => r.values);
  if (all.some(v => !Number.isInteger(v))) return { refused: '评分须为整数等级。' };
  // The questionnaire's scale when it is known, so a level nobody chose still has its place; else the observed range.
  const low = scale?.min ?? Math.min(...all), high = scale?.max ?? Math.max(...all);
  if (all.some(v => v < low || v > high)) return { refused: `有评分超出 ${low}～${high} 的量表范围。` };
  if (high - low < 1 || high - low > 6) return { refused: '评分等级须在 2 到 7 级之间。' };
  const levels = Array.from({ length: high - low + 1 }, (_, i) => low + i), midpoint = (low + high) / 2;
  return {
    levels,
    items: items.map((_, k) => {
      const values = rows.map(r => r.values[k]);
      return {
        name: names[k], n: values.length,
        shares: levels.map(l => values.filter(v => v === l).length / values.length),
        mean: values.reduce((s, v) => s + v, 0) / values.length,
        // "Top" is every level above the scale's midpoint: 4–5 on a five-point scale, 3–4 on a four-point one.
        top: values.filter(v => v > midpoint).length / values.length,
      };
    }),
    n: rows.length, total: table.rows.length, invalid,
  };
}

/** Spearman's ρ (average ranks for ties) between every pair, on rows complete for all variables. */
export function spearmanMatrix(table: SurveyTable, variables: readonly number[], names: readonly string[], missing: readonly string[]): SpearmanMatrix | { refused: string } {
  if (variables.length < 3) return { refused: '至少选择 3 个变量。' };
  const { rows, invalid } = numericRows(table, variables, missing);
  if (rows.length < 4) return { refused: '完整案例太少。' };
  const ranks = variables.map((_, j) => averageRanks(rows.map(r => r.values[j])));
  const raw: { a: number; b: number; rho: number; p: number }[] = [];
  for (let a = 0; a < variables.length; a++) for (let b = a + 1; b < variables.length; b++) {
    const rho = pairedCorrelation(ranks[a], ranks[b]);
    if (rho === null) return { refused: `“${names[a]}”或“${names[b]}”在完整案例中没有变化，无法计算相关。` };
    const test = correlationTest(rho, rows.length, false);
    if (!test) return { refused: '相关检验不定义。' };
    raw.push({ a, b, rho, p: test.p });
  }
  const adjusted = holm(raw.map(p => p.p));
  return { variables: [...names], pairs: raw.map((p, i) => ({ ...p, pAdjusted: adjusted[i] })), n: rows.length, total: table.rows.length, invalid };
}
