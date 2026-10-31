/**
 * Multiple linear regression by ordinary least squares, for "影响因素" chapters: coefficients with standard errors,
 * t tests and 95% intervals, standardized β, R² and adjusted R², the overall F test, VIF for collinearity and the
 * Breusch–Pagan test for heteroskedasticity (Koenker's n·R² form). Pure computation on complete cases; the caller
 * chooses the variables and codes categories as dummies.
 *
 * Predictors are centred and scaled to unit length before solving, so the cross-product matrix is their correlation
 * matrix: its inverse gives the coefficients, their variances and VIFᵢ = (R⁻¹)ᵢᵢ.
 */
import { chiSquareUpper, fUpper, tCritical, tTwoSided } from './inference.ts';
import { invert } from './psychometrics.ts';

export type Coefficient = {
  name: string; estimate: number; se: number; t: number; p: number; ci: readonly [number, number];
  /** β in standard-deviation units; null for the intercept. */
  standardized: number | null;
  /** Variance inflation factor; null for the intercept. */
  vif: number | null;
};
export type Regression = {
  n: number; predictors: number;
  /** The intercept first, then the predictors in the order given. */
  coefficients: Coefficient[];
  r2: number; adjustedR2: number;
  f: { value: number; df: readonly [number, number]; p: number };
  residualSe: number;
  breuschPagan: { lm: number; df: number; p: number };
};
export type RegressionRefusal = { refused: 'no-predictors' | 'too-few-cases' | 'constant-outcome' | 'constant-predictor' | 'collinear' | 'perfect-fit' };

const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;

type Fit = { n: number; k: number; mx: number[]; scale: number[]; ginv: number[][]; slopes: number[]; intercept: number; residuals: number[]; sse: number; sst: number };

/** The least-squares fit of y on the predictors (with an intercept), before the tests. */
function fit(y: readonly number[], xs: readonly (readonly number[])[]): Fit | { refused: 'constant-predictor' | 'collinear' } {
  const n = y.length, k = xs.length, my = mean(y), mx = xs.map(mean);
  const centred = xs.map((x, j) => x.map(v => v - mx[j]));
  const scale = centred.map(c => Math.sqrt(c.reduce((s, v) => s + v * v, 0)));
  if (scale.some(s => !(s > 0))) return { refused: 'constant-predictor' };
  const z = centred.map((c, j) => c.map(v => v / scale[j]));
  const g = z.map(a => z.map(b => a.reduce((s, v, i) => s + v * b[i], 0)));
  const ginv = invert(g);
  if (!ginv || ginv.some((row, j) => !(row[j] > 0) || row[j] > 1e10)) return { refused: 'collinear' };
  const zy = z.map(c => c.reduce((s, v, i) => s + v * (y[i] - my), 0));
  const slopes = ginv.map((row, j) => row.reduce((s, v, l) => s + v * zy[l], 0) / scale[j]);
  const intercept = my - slopes.reduce((s, b, j) => s + b * mx[j], 0);
  const fitted = Array.from({ length: n }, (_, i) => intercept + slopes.reduce((s, b, j) => s + b * xs[j][i], 0));
  const residuals = y.map((v, i) => v - fitted[i]);
  const sse = residuals.reduce((s, e) => s + e * e, 0), sst = y.reduce((s, v) => s + (v - my) * (v - my), 0);
  return { n, k, mx, scale, ginv, slopes, intercept, residuals, sse, sst };
}

/**
 * OLS of the outcome on the named predictors. Refuses rather than guesses: no predictors, too few cases for the
 * residual degrees of freedom, an outcome or predictor without variance, or predictors so collinear the fit is
 * not identified.
 */
export function linearRegression(y: readonly number[], predictors: readonly { name: string; values: readonly number[] }[]): Regression | RegressionRefusal {
  const k = predictors.length, n = y.length;
  if (!k) return { refused: 'no-predictors' };
  if (n < k + 3 || predictors.some(p => p.values.length !== n)) return { refused: 'too-few-cases' };
  const my = mean(y);
  if (!y.some(v => v !== my)) return { refused: 'constant-outcome' };
  const xs = predictors.map(p => p.values);
  const m = fit(y, xs);
  if ('refused' in m) return m;
  // The outcome is an exact function of the predictors (often a total score regressed on its own items): no residual
  // variance, so no standard error, t or F exists.
  if (!(m.sse > 1e-12 * m.sst)) return { refused: 'perfect-fit' };
  const df = n - k - 1, sigma2 = m.sse / df, critical = tCritical(0.05, df);
  const sdY = Math.sqrt(m.sst / (n - 1));
  const coefficient = (name: string, estimate: number, variance: number, standardized: number | null, vif: number | null): Coefficient => {
    const se = Math.sqrt(variance), t = estimate / se;
    return { name, estimate, se, t, p: tTwoSided(t, df), ci: [estimate - critical * se, estimate + critical * se], standardized, vif };
  };
  // Var(intercept) = σ²(1/n + x̄ᵀ (XcᵀXc)⁻¹ x̄), with (XcᵀXc)⁻¹ = D⁻¹ R⁻¹ D⁻¹ for the scales D.
  let quad = 0;
  for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) quad += m.mx[j] * m.mx[l] * m.ginv[j][l] / (m.scale[j] * m.scale[l]);
  const coefficients = [
    coefficient('（截距）', m.intercept, sigma2 * (1 / n + quad), null, null),
    ...predictors.map((p, j) => coefficient(p.name, m.slopes[j], sigma2 * m.ginv[j][j] / (m.scale[j] * m.scale[j]),
      m.slopes[j] * (m.scale[j] / Math.sqrt(n - 1)) / sdY, m.ginv[j][j])),
  ];
  const r2 = 1 - m.sse / m.sst, f = (r2 / k) / ((1 - r2) / df);
  // Breusch–Pagan (Koenker): n·R² of the squared residuals regressed on the same predictors, χ² with k df.
  const e2 = m.residuals.map(e => e * e), aux = fit(e2, xs);
  const auxR2 = 'refused' in aux || !(aux.sst > 0) ? 0 : 1 - aux.sse / aux.sst, lm = n * auxR2;
  return {
    n, predictors: k, coefficients, r2, adjustedR2: 1 - (1 - r2) * (n - 1) / df,
    f: { value: f, df: [k, df], p: fUpper(f, k, df) }, residualSe: Math.sqrt(sigma2),
    breuschPagan: { lm, df: k, p: chiSquareUpper(lm, k) },
  };
}
