/**
 * Survey weights: base weights 1/π, nonresponse adjustment within weighting classes, post-stratification,
 * raking (iterative proportional fitting) to several known margins, and trimming. Weighting can reduce bias
 * only for the variables it uses and only if response within each cell is unrelated to the outcome; the
 * interface must say so. References: Kalton & Flores-Cervantes (2003) J. Official Statistics 19(2);
 * Deville & Särndal (1992) JASA 87; checked against R survey::rake and postStratify in tests.
 */
import { sum } from './sampling-core.ts';

export type KishSummary = { n: number; sum: number; nEff: number; deff: number; cv: number; min: number; max: number; ratio: number };
/** Kish's effective sample size (Σw)²/Σw² and weighting design effect 1 + CV². */
export function kish(weights: number[]): KishSummary {
  if (!weights.length || weights.some(w => !(w > 0))) throw Error('权数须全部为正数。');
  const n = weights.length, s = sum(weights), s2 = sum(weights.map(w => w * w)), mean = s / n;
  const cv = Math.sqrt(Math.max(0, s2 / n - mean * mean)) / mean, min = Math.min(...weights), max = Math.max(...weights);
  return { n, sum: s, nEff: s * s / s2, deff: n * s2 / (s * s), cv, min, max, ratio: max / min };
}

export type ClassAdjustment = { weights: number[]; classes: { name: string; eligible: number; respondents: number; rate: number; factor: number }[]; warnings: string[] };
/** Weighting-class nonresponse adjustment: respondents carry the weight of nonrespondents in their class. */
export function classAdjust(classes: string[], responded: boolean[], base: number[]): ClassAdjustment {
  if (classes.length !== responded.length || classes.length !== base.length) throw Error('输入长度不一致。');
  const names = [...new Set(classes)], warnings: string[] = [];
  const info = names.map(name => {
    const idx = classes.map((c, i) => c === name ? i : -1).filter(i => i >= 0);
    const all = sum(idx.map(i => base[i])), resp = sum(idx.filter(i => responded[i]).map(i => base[i]));
    if (resp === 0) throw Error(`调整类「${name}」中没有回答者，请与相邻类合并。`);
    const respondents = idx.filter(i => responded[i]).length;
    if (respondents < 20) warnings.push(`调整类「${name}」只有 ${respondents} 个回答者，调整因子不稳定。`);
    return { name, eligible: idx.length, respondents, rate: resp / all, factor: all / resp };
  });
  const factor = new Map(info.map(c => [c.name, c.factor]));
  return { weights: base.map((w, i) => responded[i] ? w * factor.get(classes[i])! : 0), classes: info, warnings };
}

export type MarginFit = { category: string; before: number; target: number; after: number };
/** Post-stratification: within each cell the weights are scaled so that they sum to the known total. */
export function postStratify(cells: string[], base: number[], targets: Record<string, number>): { weights: number[]; fits: MarginFit[] } {
  if (cells.length !== base.length) throw Error('输入长度不一致。');
  const missing = [...new Set(cells)].filter(c => !(c in targets));
  if (missing.length) throw Error(`缺少类别「${missing.slice(0, 3).join('」「')}」的总体数。`);
  const fits = Object.entries(targets).map(([category, target]) => {
    if (!(target > 0)) throw Error(`类别「${category}」的总体数须为正数。`);
    const before = sum(cells.map((c, i) => c === category ? base[i] : 0));
    if (before === 0) throw Error(`样本中没有类别「${category}」，无法事后分层；请合并类别。`);
    return { category, before, target, after: target };
  });
  const factor = new Map(fits.map(f => [f.category, f.target / f.before]));
  return { weights: base.map((w, i) => w * factor.get(cells[i])!), fits };
}

export type RakeMargin = { name: string; values: string[]; targets: Record<string, number> };
export type RakeResult = { weights: number[]; iterations: number; converged: boolean; maxError: number; fits: { name: string; categories: MarginFit[] }[]; warnings: string[] };
/**
 * Raking (iterative proportional fitting): repeatedly scale weights to match each margin in turn until all
 * margins agree within tolerance. Targets are population totals; margins with different grand totals are
 * rescaled to the first margin's total. Optional bounds trim the adjustment factor relative to the base weight.
 */
export function rake(margins: RakeMargin[], base: number[], { maxIterations = 100, tolerance = 1e-8, bounds = null }: { maxIterations?: number; tolerance?: number; bounds?: { lower: number; upper: number } | null } = {}): RakeResult {
  if (!margins.length) throw Error('至少需要 1 个控制变量。');
  if (base.some(w => !(w > 0))) throw Error('初始权数须为正数。');
  const warnings: string[] = [], grand = sum(Object.values(margins[0].targets));
  const scaled = margins.map(m => {
    if (m.values.length !== base.length) throw Error(`「${m.name}」的取值个数与记录数不一致。`);
    const total = sum(Object.values(m.targets));
    if (!(total > 0)) throw Error(`「${m.name}」的目标总数须大于 0。`);
    const absent = Object.keys(m.targets).filter(c => !m.values.includes(c));
    if (absent.length) throw Error(`样本中没有「${m.name}」的类别「${absent.slice(0, 3).join('」「')}」，无法校准；请合并类别。`);
    const unknown = [...new Set(m.values)].filter(c => !(c in m.targets));
    if (unknown.length) throw Error(`「${m.name}」的类别「${unknown.slice(0, 3).join('」「')}」缺少目标比例。`);
    if (Math.abs(total - grand) > 1e-9 * grand) warnings.push(`「${m.name}」的目标合计与第一个控制变量不同，已按比例调整到相同总数。`);
    return { ...m, targets: Object.fromEntries(Object.entries(m.targets).map(([c, t]) => [c, t * grand / total])) };
  });
  if (bounds && !(bounds.lower > 0 && bounds.lower < 1 && bounds.upper > 1)) throw Error('调整因子的上下限须满足 0 < 下限 < 1 < 上限。');
  const w = [...base];
  let iterations = 0, maxError = Infinity;
  const marginError = () => Math.max(...scaled.map(m => Math.max(...Object.entries(m.targets).map(([c, t]) => Math.abs(sum(m.values.map((v, i) => v === c ? w[i] : 0)) - t) / t))));
  while (iterations < maxIterations) {
    iterations++;
    for (const m of scaled) {
      const totals = new Map<string, number>();
      m.values.forEach((v, i) => totals.set(v, (totals.get(v) ?? 0) + w[i]));
      m.values.forEach((v, i) => {
        let next = w[i] * m.targets[v] / totals.get(v)!;
        if (bounds) next = Math.min(base[i] * bounds.upper, Math.max(base[i] * bounds.lower, next));
        w[i] = next;
      });
    }
    maxError = marginError();
    if (maxError < tolerance) break;
  }
  const converged = maxError < tolerance;
  if (!converged) warnings.push(bounds ? '在给定的调整因子上下限内无法同时满足所有控制总数，请放宽上下限或减少控制变量。' : `迭代 ${maxIterations} 次仍未收敛，可能有类别样本过少；请合并类别。`);
  const fits = scaled.map(m => ({ name: m.name, categories: Object.entries(m.targets).map(([category, target]) => ({
    category, target,
    before: sum(m.values.map((v, i) => v === category ? base[i] : 0)),
    after: sum(m.values.map((v, i) => v === category ? w[i] : 0)),
  })) }));
  return { weights: w, iterations, converged, maxError, fits, warnings };
}

export type TrimResult = { weights: number[]; trimmed: number; cap: number; iterations: number };
/**
 * Cap weights at `cap` and spread the excess over the untrimmed weights so the total is unchanged; repeat
 * until no weight exceeds the cap. Trimming lowers variance at the cost of some bias.
 */
export function trimWeights(weights: number[], cap: number): TrimResult {
  if (weights.some(w => !(w > 0))) throw Error('权数须为正数。');
  const total = sum(weights);
  if (!(cap * weights.length > total)) throw Error('上限过低：所有权数都截到上限也达不到原总数。');
  const w = [...weights];
  let iterations = 0;
  for (; iterations < 100; iterations++) {
    const over = w.map((v, i) => v > cap ? i : -1).filter(i => i >= 0);
    if (!over.length) break;
    over.forEach(i => { w[i] = cap; });
    const fixed = new Set(w.map((v, i) => v >= cap - 1e-12 ? i : -1).filter(i => i >= 0));
    const restSum = sum(w.filter((_, i) => !fixed.has(i))), target = total - fixed.size * cap;
    const factor = target / restSum;
    w.forEach((v, i) => { if (!fixed.has(i)) w[i] = v * factor; });
  }
  return { weights: w, trimmed: weights.filter(v => v > cap).length, cap, iterations };
}
