/**
 * Multinomial logistic regression for "影响因素" chapters whose outcome is one of several unordered choices (出行方式,
 * 首选品牌): one logit equation per category against a reference category, by Newton–Raphson maximum likelihood, with
 * Wald z tests and 95% intervals, relative-risk ratios (RRR = e^β) and their intervals, the likelihood-ratio test
 * against the intercept-only model and McFadden's pseudo-R². The reference is the lowest outcome code, as in
 * statsmodels' MNLogit. Pure computation on complete cases; categorical predictors enter as dummies.
 */
import { chiSquareUpper, normalUpper } from './inference.ts';
import { invert } from './psychometrics.ts';

const Z975 = 1.959963984540054;
/** More categories than this make each equation too thin to read; such an outcome should be grouped first. */
export const MAX_CATEGORIES = 8;

export type MultinomialCoefficient = {
  name: string; estimate: number; se: number; z: number; p: number; ci: readonly [number, number];
  rrr: number; rrrCi: readonly [number, number];
};
export type Multinomial = {
  n: number; predictors: number;
  categories: { code: number; count: number }[];
  /** The reference category's code; every equation compares one other category with it. */
  reference: number;
  equations: { code: number; coefficients: MultinomialCoefficient[] }[];
  logLikelihood: number; nullLogLikelihood: number;
  lr: { chi2: number; df: number; p: number };
  mcFaddenR2: number;
  iterations: number;
};
export type MultinomialRefusal = { refused: 'no-predictors' | 'two-classes' | 'too-many-categories' | 'too-few-cases' | 'collinear' | 'separation' };

/**
 * The multinomial logit of a categorical outcome (numeric codes) on the named predictors, with an intercept per
 * equation. Refuses rather than guesses: fewer than three categories (a binary logit is the right model), more than
 * eight, too few cases for the parameters, collinear predictors, or a predictor that separates categories perfectly.
 */
export function multinomialRegression(y: readonly number[], predictors: readonly { name: string; values: readonly number[] }[]): Multinomial | MultinomialRefusal {
  const k = predictors.length, n = y.length, cols = k + 1;
  if (!k) return { refused: 'no-predictors' };
  const codes = [...new Set(y)].sort((a, b) => a - b), J = codes.length;
  if (J < 3) return { refused: 'two-classes' };
  if (J > MAX_CATEGORIES) return { refused: 'too-many-categories' };
  const m = (J - 1) * cols;
  if (n < m + J || predictors.some(p => p.values.length !== n)) return { refused: 'too-few-cases' };
  const category = y.map(v => codes.indexOf(v)), counts = codes.map((_, j) => category.filter(c => c === j).length);
  const x = Array.from({ length: n }, (_, i) => [1, ...predictors.map(p => p.values[i])]);
  // Separation is judged per standard deviation of the predictor, so a predictor's units cannot trigger it.
  const spread = predictors.map(p => { const mean = p.values.reduce((s, v) => s + v, 0) / n; return Math.sqrt(p.values.reduce((s, v) => s + (v - mean) ** 2, 0) / n); });
  // beta[j][a]: equation j (category j + 1 against the reference), predictor a (0 = intercept).
  let beta = Array.from({ length: J - 1 }, (_, j) => Array.from({ length: cols }, (_, a) => (a === 0 ? Math.log(counts[j + 1] / counts[0]) : 0)));
  const probabilities = () => x.map(row => {
    const eta = beta.map(b => b.reduce((s, v, a) => s + v * row[a], 0)), top = Math.max(0, ...eta);
    const e = eta.map(v => Math.exp(v - top)), base = Math.exp(-top), total = base + e.reduce((s, v) => s + v, 0);
    return [base / total, ...e.map(v => v / total)];
  });
  // The information matrix over the stacked parameters (j, a) ↦ j·cols + a.
  const information = (p: number[][]) => Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, c) => {
    const j = Math.floor(r / cols), a = r % cols, l = Math.floor(c / cols), b = c % cols;
    return x.reduce((s, row, i) => s + row[a] * row[b] * p[i][j + 1] * ((j === l ? 1 : 0) - p[i][l + 1]), 0);
  }));
  let p = probabilities(), iterations = 0;
  for (; iterations < 100; iterations++) {
    if (iterations > 25 && p.some(row => row.some(v => v < 1e-12))) return { refused: 'separation' };
    const cov = invert(information(p));
    if (!cov) return { refused: 'collinear' };
    const score = Array.from({ length: m }, (_, r) => { const j = Math.floor(r / cols), a = r % cols; return x.reduce((s, row, i) => s + row[a] * ((category[i] === j + 1 ? 1 : 0) - p[i][j + 1]), 0); });
    const step = cov.map(row => row.reduce((s, v, c) => s + v * score[c], 0));
    beta = beta.map((b, j) => b.map((v, a) => v + step[j * cols + a]));
    if (beta.some(b => b.some((v, a) => !Number.isFinite(v) || (a > 0 && Math.abs(v) * spread[a - 1] > 30)))) return { refused: 'separation' };
    p = probabilities();
    if (Math.max(...step.map(Math.abs)) < 1e-12) { iterations++; break; }
  }
  // The covariance at the estimate.
  const cov = invert(information(p));
  if (!cov) return { refused: 'collinear' };
  const ll = category.reduce((s, c, i) => s + Math.log(p[i][c]), 0), ll0 = counts.reduce((s, c) => s + c * Math.log(c / n), 0);
  const equations = beta.map((b, j) => ({ code: codes[j + 1], coefficients: b.map((estimate, a): MultinomialCoefficient => {
    const se = Math.sqrt(cov[j * cols + a][j * cols + a]), z = estimate / se;
    return { name: a === 0 ? '（截距）' : predictors[a - 1].name, estimate, se, z, p: 2 * normalUpper(Math.abs(z)), ci: [estimate - Z975 * se, estimate + Z975 * se],
      rrr: Math.exp(estimate), rrrCi: [Math.exp(estimate - Z975 * se), Math.exp(estimate + Z975 * se)] };
  }) }));
  const chi2 = 2 * (ll - ll0), df = (J - 1) * k;
  return { n, predictors: k, categories: codes.map((code, j) => ({ code, count: counts[j] })), reference: codes[0], equations,
    logLikelihood: ll, nullLogLikelihood: ll0, lr: { chi2, df, p: chiSquareUpper(chi2, df) }, mcFaddenR2: 1 - ll / ll0, iterations };
}
