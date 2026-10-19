/**
 * Inferential statistics for the analysis workbench.
 * Every routine is checked against SciPy reference values in tests/inference.test.mjs.
 * p-values assume random sampling or random assignment; callers must say so.
 */

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const FPMIN = 1e-300;
/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaFraction(a: number, b: number, x: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return h;
}
/** Regularized incomplete beta I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2) ? front * betaFraction(a, b, x) / a : 1 - front * betaFraction(b, a, 1 - x) / b;
}

/** Regularized upper incomplete gamma Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let sum = 1 / a, term = sum, ap = a;
    for (let n = 0; n < 2000; n++) { ap += 1; term *= x / ap; sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-17) break; }
    return 1 - sum * front;
  }
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 2000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return front * h;
}

/** Upper tail P(Z > z) of the standard normal, accurate in the far tail. */
export function normalUpper(z: number): number {
  return z >= 0 ? 0.5 * gammaQ(0.5, z * z / 2) : 1 - 0.5 * gammaQ(0.5, z * z / 2);
}
/** Two-sided p for Student t with df degrees of freedom. */
export function tTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}
/** Upper tail P(F > f). */
export function fUpper(f: number, df1: number, df2: number): number {
  if (f <= 0) return 1;
  if (!Number.isFinite(f)) return 0;
  return regularizedBeta(df2 / (df2 + df1 * f), df2 / 2, df1 / 2);
}
/** Upper tail P(X > x) of chi-square with k degrees of freedom. */
export function chiSquareUpper(x: number, k: number): number {
  return x <= 0 ? 1 : gammaQ(k / 2, x / 2);
}

/** Critical value q with P(|T| > q) = alpha. */
export function tCritical(alpha: number, df: number): number {
  let lo = 0, hi = 1;
  while (tTwoSided(hi, df) > alpha) hi *= 2;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (tTwoSided(mid, df) > alpha) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export const Z975 = 1.959963984540054;

export type Interval = { lower: number; upper: number };
/** Wilson score interval for a proportion k/n. */
export function wilsonInterval(k: number, n: number, z = Z975): Interval | null {
  if (!(n > 0) || k < 0 || k > n) return null;
  const p = k / n, z2 = z * z, denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = z / denominator * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
}
export function meanInterval(values: number[]): Interval | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const half = tCritical(0.05, n - 1) * sd / Math.sqrt(n);
  return { lower: mean - half, upper: mean + half };
}

/** Holm step-down adjustment; returns adjusted p in the input order. */
export function holm(pValues: number[]): number[] {
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p), m = pValues.length, out = new Array<number>(m);
  let running = 0;
  order.forEach(({ p, i }, rank) => { running = Math.max(running, Math.min(1, (m - rank) * p)); out[i] = running; });
  return out;
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const variance = (v: number[]) => { const m = mean(v); return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1); };
function ranks(values: number[]): { ranks: number[]; ties: number[] } {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value), out: number[] = [], ties: number[] = [];
  for (let i = 0; i < order.length;) {
    let j = i + 1;
    while (j < order.length && order[j].value === order[i].value) j++;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) out[order[k].index] = rank;
    if (j - i > 1) ties.push(j - i);
    i = j;
  }
  return { ranks: out, ties };
}

export type WelchT = { t: number; df: number; p: number; difference: number; ci: Interval; hedgesG: number | null; gInterval: Interval | null };
export function welchT(x: number[], y: number[]): WelchT | null {
  const n1 = x.length, n2 = y.length;
  if (n1 < 2 || n2 < 2) return null;
  const m1 = mean(x), m2 = mean(y), v1 = variance(x), v2 = variance(y), a = v1 / n1, b = v2 / n2, se = Math.sqrt(a + b);
  if (!(se > 0)) return null;
  const t = (m1 - m2) / se, df = (a + b) ** 2 / (a * a / (n1 - 1) + b * b / (n2 - 1)), half = tCritical(0.05, df) * se;
  const pooled = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  let hedgesG: number | null = null, gInterval: Interval | null = null;
  if (pooled > 0) {
    hedgesG = (1 - 3 / (4 * (n1 + n2) - 9)) * (m1 - m2) / pooled;
    const seG = Math.sqrt((n1 + n2) / (n1 * n2) + hedgesG * hedgesG / (2 * (n1 + n2)));
    gInterval = { lower: hedgesG - Z975 * seG, upper: hedgesG + Z975 * seG };
  }
  return { t, df, p: tTwoSided(t, df), difference: m1 - m2, ci: { lower: m1 - m2 - half, upper: m1 - m2 + half }, hedgesG, gInterval };
}

/** Exact null distribution of U for samples without ties (Mann–Whitney recurrence, all terms positive). */
function exactUDistribution(n1: number, n2: number): number[] {
  let previous: number[][] = Array.from({ length: n2 + 1 }, () => [1]);
  for (let m = 1; m <= n1; m++) {
    const current: number[][] = [[1]];
    for (let n = 1; n <= n2; n++) {
      const out = new Array<number>(m * n + 1).fill(0), left = previous[n], right = current[n - 1], wl = m / (m + n), wr = n / (m + n);
      for (let u = 0; u <= m * n; u++) out[u] = wl * (u >= n ? left[u - n] ?? 0 : 0) + wr * (right[u] ?? 0);
      current.push(out);
    }
    previous = current;
  }
  return previous[n2];
}
export type MannWhitney = { u: number; p: number; method: 'exact' | 'normal'; rankBiserial: number };
/** Two-sided Mann–Whitney U for x versus y, following R's wilcox.test defaults. */
export function mannWhitney(x: number[], y: number[]): MannWhitney | null {
  const n1 = x.length, n2 = y.length;
  if (!n1 || !n2) return null;
  const { ranks: r, ties } = ranks([...x, ...y]), n = n1 + n2;
  const u = r.slice(0, n1).reduce((s, v) => s + v, 0) - n1 * (n1 + 1) / 2, rankBiserial = 2 * u / (n1 * n2) - 1;
  if (!ties.length && n1 < 50 && n2 < 50) {
    const dist = exactUDistribution(n1, n2), q = Math.round(u);
    const lower = dist.slice(0, q + 1).reduce((s, v) => s + v, 0), upper = dist.slice(q).reduce((s, v) => s + v, 0);
    return { u, p: Math.min(1, 2 * Math.min(lower, upper)), method: 'exact', rankBiserial };
  }
  const tieTerm = ties.reduce((s, t) => s + t ** 3 - t, 0);
  const sigma = Math.sqrt(n1 * n2 / 12 * (n + 1 - tieTerm / (n * (n - 1))));
  if (!(sigma > 0)) return null;
  const centred = u - n1 * n2 / 2, z = (centred - Math.sign(centred) * 0.5) / sigma;
  return { u, p: Math.min(1, 2 * normalUpper(Math.abs(z))), method: 'normal', rankBiserial };
}

export type KruskalWallis = { h: number; df: number; p: number; epsilonSquared: number };
export function kruskalWallis(groups: number[][]): KruskalWallis | null {
  const used = groups.filter(g => g.length);
  if (used.length < 2) return null;
  const all = used.flat(), n = all.length, { ranks: r, ties } = ranks(all);
  let offset = 0, sum = 0;
  for (const g of used) { const rs = r.slice(offset, offset + g.length).reduce((s, v) => s + v, 0); sum += rs * rs / g.length; offset += g.length; }
  const correction = 1 - ties.reduce((s, t) => s + t ** 3 - t, 0) / (n ** 3 - n);
  if (!(correction > 0)) return null;
  const h = (12 / (n * (n + 1)) * sum - 3 * (n + 1)) / correction, df = used.length - 1;
  return { h, df, p: chiSquareUpper(h, df), epsilonSquared: h / ((n * n - 1) / (n + 1)) };
}

export type Anova = { f: number; df1: number; df2: number; p: number; etaSquared: number };
export function oneWayAnova(groups: number[][]): Anova | null {
  const used = groups.filter(g => g.length), all = used.flat(), k = used.length, n = all.length;
  if (k < 2 || n - k < 1) return null;
  const grand = mean(all);
  const between = used.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0);
  const within = used.reduce((s, g) => s + g.reduce((t, v) => t + (v - mean(g)) ** 2, 0), 0);
  if (!(within > 0)) return null;
  const df1 = k - 1, df2 = n - k, f = between / df1 / (within / df2);
  return { f, df1, df2, p: fUpper(f, df1, df2), etaSquared: between / (between + within) };
}
export type WelchAnova = { f: number; df1: number; df2: number; p: number };
/** Welch's heteroscedastic one-way ANOVA, as R's oneway.test(var.equal = FALSE). */
export function welchAnova(groups: number[][]): WelchAnova | null {
  const used = groups.filter(g => g.length), k = used.length;
  if (k < 2 || used.some(g => g.length < 2)) return null;
  const vars = used.map(variance);
  if (vars.some(v => !(v > 0))) return null;
  const w = used.map((g, i) => g.length / vars[i]), sw = w.reduce((s, v) => s + v, 0);
  const centre = used.reduce((s, g, i) => s + w[i] * mean(g), 0) / sw;
  const a = used.reduce((s, g, i) => s + w[i] * (mean(g) - centre) ** 2, 0) / (k - 1);
  const tmp = used.reduce((s, g, i) => s + (1 - w[i] / sw) ** 2 / (g.length - 1), 0);
  const f = a / (1 + 2 * (k - 2) / (k * k - 1) * tmp), df1 = k - 1, df2 = (k * k - 1) / (3 * tmp);
  return { f, df1, df2, p: fUpper(f, df1, df2) };
}

export type CorrelationTest = { df: number; p: number; ci: Interval | null };
/** Two-sided t test of a correlation; Fisher z interval when requested and n ≥ 4. */
export function correlationTest(r: number, n: number, withInterval: boolean): CorrelationTest | null {
  if (n < 3 || !Number.isFinite(r)) return null;
  const df = n - 2, p = Math.abs(r) >= 1 ? 0 : tTwoSided(r * Math.sqrt(df / (1 - r * r)), df);
  let ci: Interval | null = null;
  if (withInterval && n >= 4 && Math.abs(r) < 1) {
    const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3);
    ci = { lower: Math.tanh(z - Z975 * se), upper: Math.tanh(z + Z975 * se) };
  }
  return { df, p, ci };
}

/** Two-sided Fisher exact test for a 2 × 2 table, using R's relative tolerance. */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const r1 = a + b, c1 = a + c, n = a + b + c + d;
  const logChoose = (m: number, k: number) => logGamma(m + 1) - logGamma(k + 1) - logGamma(m - k + 1);
  const base = logChoose(n, r1), pmf = (x: number) => Math.exp(logChoose(c1, x) + logChoose(n - c1, r1 - x) - base);
  const observed = pmf(a) * (1 + 1e-7);
  let p = 0;
  for (let x = Math.max(0, r1 + c1 - n); x <= Math.min(r1, c1); x++) { const value = pmf(x); if (value <= observed) p += value; }
  return Math.min(1, p);
}

/** APA-style number formatting used in report lines. */
export function formatP(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return 'p 不定义';
  return p < 0.001 ? 'p < .001' : `p = ${p.toFixed(3).replace(/^0/, '')}`;
}
export function formatStat(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}
export function formatCoefficient(value: number): string {
  return value.toFixed(2).replace(/^(-?)0\./, '$1.');
}
