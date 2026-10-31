/**
 * Binary logistic regression for "影响因素" chapters whose outcome is a choice (使用 / 不使用, 愿意 / 不愿意): maximum
 * likelihood by Newton–Raphson (IRLS), Wald z tests and 95% intervals, odds ratios with their intervals, the
 * likelihood-ratio test against the intercept-only model, McFadden's pseudo-R², and average marginal effects (the mean
 * of ∂P/∂x over the sample, in probability points) with delta-method standard errors. Pure computation on complete
 * cases; the outcome is coded 0/1 and categories enter as dummies.
 */
import { chiSquareUpper, normalUpper } from './inference.ts';
import { invert } from './psychometrics.ts';

const Z975 = 1.959963984540054;

export type LogisticCoefficient = {
  name: string; estimate: number; se: number; z: number; p: number; ci: readonly [number, number];
  oddsRatio: number; oddsRatioCi: readonly [number, number];
  /** Average marginal effect on the probability, with its delta-method SE; null for the intercept. */
  ame: { value: number; se: number } | null;
};
export type Logistic = {
  n: number; predictors: number; events: number;
  coefficients: LogisticCoefficient[];
  logLikelihood: number; nullLogLikelihood: number;
  lr: { chi2: number; df: number; p: number };
  mcFaddenR2: number;
  iterations: number;
};
export type LogisticRefusal = { refused: 'no-predictors' | 'not-binary' | 'one-class' | 'too-few-cases' | 'collinear' | 'separation' | 'no-convergence' | 'extreme-units' };

const sigmoid = (t: number) => (t >= 0 ? 1 / (1 + Math.exp(-t)) : Math.exp(t) / (1 + Math.exp(t)));
const logLikelihood = (y: readonly number[], p: readonly number[]) => y.reduce((s, v, i) => s + (v ? Math.log(p[i]) : Math.log(1 - p[i])), 0);

/**
 * The logit of a 0/1 outcome on the named predictors (with an intercept). Refuses rather than guesses: an outcome that
 * is not 0/1 or has one class, too few cases, collinear predictors, or a predictor that separates the outcome
 * perfectly (the estimates would run off to infinity).
 */
export function logisticRegression(y: readonly number[], predictors: readonly { name: string; values: readonly number[] }[]): Logistic | LogisticRefusal {
  const k = predictors.length, n = y.length, cols = k + 1;
  if (!k) return { refused: 'no-predictors' };
  if (y.some(v => v !== 0 && v !== 1)) return { refused: 'not-binary' };
  const events = y.reduce((s, v) => s + v, 0);
  if (events === 0 || events === n) return { refused: 'one-class' };
  if (n < cols + 2 || predictors.some(p => p.values.length !== n)) return { refused: 'too-few-cases' };
  const x = Array.from({ length: n }, (_, i) => [1, ...predictors.map(p => p.values[i])]);
  // The model is solved on standardized predictors, so a predictor far from zero or in odd units cannot make the
  // information matrix look singular, and mapped back to the original units afterwards. Separation is judged per SD.
  const centre = predictors.map(p => p.values.reduce((s, v) => s + v, 0) / n);
  const spread = predictors.map((p, a) => Math.sqrt(p.values.reduce((s, v) => s + (v - centre[a]) ** 2, 0) / n));
  if (spread.some(s => !(s > 0))) return { refused: 'collinear' };
  const z = x.map(row => row.map((v, j) => (j === 0 ? 1 : (v - centre[j - 1]) / spread[j - 1])));
  const information = (q: readonly number[]) => Array.from({ length: cols }, (_, a) => Array.from({ length: cols }, (_, b) => z.reduce((s, row, i) => s + row[a] * row[b] * q[i] * (1 - q[i]), 0)));
  let gamma = new Array<number>(cols).fill(0), p = new Array<number>(n).fill(0.5), cov: number[][] | null = null, iterations = 0, converged = false;
  gamma[0] = Math.log(events / (n - events));
  for (; iterations < 100; iterations++) {
    p = z.map(row => sigmoid(row.reduce((s, v, j) => s + v * gamma[j], 0)));
    if (p.some(v => v < 1e-12 || v > 1 - 1e-12) && iterations > 25) return { refused: 'separation' };
    cov = invert(information(p));
    if (!cov) return { refused: 'collinear' };
    const score = Array.from({ length: cols }, (_, a) => z.reduce((s, row, i) => s + row[a] * (y[i] - p[i]), 0));
    const step = cov.map(row => row.reduce((s, v, b) => s + v * score[b], 0));
    gamma = gamma.map((b, j) => b + step[j]);
    if (gamma.some((b, j) => !Number.isFinite(b) || (j > 0 && Math.abs(b) > 30))) return { refused: 'separation' };
    if (Math.max(...step.map(Math.abs)) < 1e-12) { iterations++; converged = true; break; }
  }
  if (!converged) return { refused: 'no-convergence' };
  // The covariance at the estimate: refresh p and the information once more after the last step.
  p = z.map(row => sigmoid(row.reduce((s, v, j) => s + v * gamma[j], 0)));
  cov = invert(information(p));
  if (!cov) return { refused: 'collinear' };
  // Back to the original units: β = T·γ with T₀₀ = 1, T₀ⱼ = −mⱼ/sⱼ, Tⱼⱼ = 1/sⱼ, and the covariance T·C·Tᵀ.
  const T = Array.from({ length: cols }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? (c === 0 ? 1 : -centre[c - 1] / spread[c - 1]) : r === c ? 1 / spread[r - 1] : 0)));
  const gcov = cov, beta = T.map(row => row.reduce((s, t, c) => s + t * gamma[c], 0));
  const v = T.map(row => T.map(other => row.reduce((s, t, c) => s + t * other.reduce((u, w, d) => u + w * gcov[c][d], 0), 0)));
  const ll = logLikelihood(y, p), rate = events / n, ll0 = events * Math.log(rate) + (n - events) * Math.log(1 - rate);
  const slope = p.reduce((s, q) => s + q * (1 - q), 0) / n;
  const coefficients = beta.map((b, j): LogisticCoefficient => {
    const se = Math.sqrt(v[j][j]), z = b / se;
    let ame: LogisticCoefficient['ame'] = null;
    if (j > 0) {
      // ∂AMEⱼ/∂βₗ = (1/n) Σ pᵢ(1−pᵢ)(1−2pᵢ) xᵢₗ βⱼ + [l = j] (1/n) Σ pᵢ(1−pᵢ).
      const gradient = Array.from({ length: cols }, (_, l) => x.reduce((s, row, i) => s + p[i] * (1 - p[i]) * (1 - 2 * p[i]) * row[l], 0) * b / n + (l === j ? slope : 0));
      const variance = gradient.reduce((s, g, a) => s + g * gradient.reduce((t, h, c) => t + v[a][c] * h, 0), 0);
      ame = { value: slope * b, se: Math.sqrt(variance) };
    }
    return { name: j === 0 ? '（截距）' : predictors[j - 1].name, estimate: b, se, z, p: 2 * normalUpper(Math.abs(z)), ci: [b - Z975 * se, b + Z975 * se],
      oddsRatio: Math.exp(b), oddsRatioCi: [Math.exp(b - Z975 * se), Math.exp(b + Z975 * se)], ame };
  });
  const chi2 = 2 * (ll - ll0);
  // A coefficient per raw unit so large that e^β overflows (a predictor in tiny units) has no reportable odds ratio.
  // The intercept's e^β has no reading and may overflow when a predictor sits far from zero; only slopes are checked.
  if (coefficients.some((c, j) => j > 0 && ![c.oddsRatio, ...c.oddsRatioCi].every(Number.isFinite))) return { refused: 'extreme-units' };
  return { n, predictors: k, events, coefficients, logLikelihood: ll, nullLogLikelihood: ll0, lr: { chi2, df: k, p: chiSquareUpper(chi2, k) }, mcFaddenR2: 1 - ll / ll0, iterations };
}
