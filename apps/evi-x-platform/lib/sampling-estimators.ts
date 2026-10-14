/**
 * Design-based estimators for the sampling handbook. Each function returns the estimate, its
 * estimated standard error, a confidence interval and the substitution steps as TeX so the
 * interface can typeset every formula. Notation follows the usual textbook convention:
 * N, n, f = n/N, W_h = N_h/N, V(·) for a variance and v(·) for its sample estimate.
 * References: Cochran (1977) Sampling Techniques, 3rd ed.; Lohr (2022) Sampling: Design and Analysis, 3rd ed.
 */
import { covarianceOf, interval, meanOf, sum, tCriticalAt, texNum, varianceOf, type Interval } from './sampling-core.ts';

const tex = String.raw;
export type Step = { label: string; tex: string };
export type Estimate = { value: number; variance: number; se: number; ci: Interval; df: number | null; crit: number };

function estimate(value: number, variance: number, confidence: number, df: number | null): Estimate {
  const v = Math.max(0, variance), se = Math.sqrt(v), crit = tCriticalAt(confidence, df);
  return { value, variance: v, se, ci: interval(value, se, crit), df, crit };
}
const critTex = (confidence: number, df: number | null) => df === null ? tex`z_{${texNum((1 + confidence) / 2, 4)}}` : tex`t_{${texNum((1 + confidence) / 2, 4)}}(${texNum(df, 4)})`;
function ciStep(symbol: string, e: Estimate, confidence: number): Step {
  return { label: `${Math.round(confidence * 1000) / 10}% 置信区间`, tex: tex`${symbol}\pm ${critTex(confidence, e.df)}\sqrt{v(${symbol})}=${texNum(e.value, 6)}\pm ${texNum(e.crit, 4)}\times ${texNum(e.se, 4)}=\left[${texNum(e.ci.lower, 6)},\ ${texNum(e.ci.upper, 6)}\right]` };
}
function checkPopulation(N: number | null, n: number, label = '总体规模 N') {
  if (N !== null && !(Number.isInteger(N) && N >= n)) throw Error(`${label}须为不小于样本量的整数，或留空表示总体很大。`);
}
const fraction = (n: number, N: number | null) => N === null ? 0 : n / N;
function fpcStep(n: number, N: number | null): Step[] {
  return N === null ? [] : [{ label: '抽样比', tex: tex`f=\frac{n}{N}=\frac{${texNum(n, 8)}}{${texNum(N, 10)}}=${texNum(n / N, 4)}` }];
}

/* ───────────── Simple random sampling ───────────── */

export type SrsMeanResult = { n: number; N: number | null; f: number; s2: number; mean: Estimate; total: Estimate | null; steps: Step[]; warnings: string[] };
/** Mean (and total when N is known) from an SRS without replacement. */
export function srsMean(values: number[], { N, confidence }: { N: number | null; confidence: number }): SrsMeanResult {
  const n = values.length;
  if (n < 2) throw Error('至少需要 2 个样本值。');
  checkPopulation(N, n);
  const f = fraction(n, N), ybar = meanOf(values), s2 = varianceOf(values), v = (1 - f) * s2 / n;
  const mean = estimate(ybar, v, confidence, n - 1);
  const total = N === null ? null : estimate(N * ybar, N * N * v, confidence, n - 1);
  const steps: Step[] = [
    { label: '样本均值', tex: tex`\bar{y}=\frac{1}{n}\sum_{i=1}^{n}y_i=\frac{${texNum(sum(values), 8)}}{${n}}=${texNum(ybar, 6)}` },
    { label: '样本方差', tex: tex`s^{2}=\frac{1}{n-1}\sum_{i=1}^{n}\left(y_i-\bar{y}\right)^{2}=${texNum(s2, 6)}` },
    ...fpcStep(n, N),
    { label: '均值估计量的方差估计', tex: tex`v(\bar{y})=\frac{1-f}{n}\,s^{2}=\frac{1-${texNum(f, 4)}}{${n}}\times ${texNum(s2, 6)}=${texNum(v, 6)}` },
    ciStep(tex`\bar{y}`, mean, confidence),
  ];
  if (total) steps.push({ label: '总体总量', tex: tex`\hat{Y}=N\bar{y}=${texNum(N!, 10)}\times ${texNum(ybar, 6)}=${texNum(total.value, 7)},\quad \operatorname{se}(\hat{Y})=N\sqrt{v(\bar{y})}=${texNum(total.se, 6)}` });
  const warnings = N === null ? ['未填写总体规模，按总体很大处理（不作有限总体校正）。'] : [];
  if (n < 30) warnings.push('样本少于 30，区间按 t 分布计算；若数据明显偏态，区间可能不准确。');
  return { n, N, f, s2, mean, total, steps, warnings };
}

export type SrsProportionResult = { n: number; a: number; N: number | null; f: number; p: Estimate; total: Estimate | null; steps: Step[]; warnings: string[] };
/** Proportion a/n from an SRS without replacement; v(p) = (1 − f)·p(1 − p)/(n − 1). */
export function srsProportion({ a, n, N, confidence }: { a: number; n: number; N: number | null; confidence: number }): SrsProportionResult {
  if (!(Number.isInteger(n) && n >= 2)) throw Error('样本量须为不小于 2 的整数。');
  if (!(Number.isInteger(a) && a >= 0 && a <= n)) throw Error('具有该特征的样本数须为 0 到 n 之间的整数。');
  checkPopulation(N, n);
  const f = fraction(n, N), p = a / n, v = (1 - f) * p * (1 - p) / (n - 1);
  const est = estimate(p, v, confidence, null);
  const total = N === null ? null : estimate(N * p, N * N * v, confidence, null);
  const steps: Step[] = [
    { label: '样本比例', tex: tex`p=\frac{a}{n}=\frac{${a}}{${n}}=${texNum(p, 5)}` },
    ...fpcStep(n, N),
    { label: '比例估计量的方差估计', tex: tex`v(p)=\frac{1-f}{n-1}\,p(1-p)=\frac{1-${texNum(f, 4)}}{${n - 1}}\times ${texNum(p, 5)}\times ${texNum(1 - p, 5)}=${texNum(v, 5)}` },
    ciStep('p', est, confidence),
  ];
  if (total) steps.push({ label: '具有该特征的总体单位数', tex: tex`\hat{A}=Np=${texNum(total.value, 7)},\quad \operatorname{se}(\hat{A})=N\sqrt{v(p)}=${texNum(total.se, 6)}` });
  const warnings: string[] = [];
  if (n * p < 5 || n * (1 - p) < 5) warnings.push('np 或 n(1−p) 小于 5，正态近似不可靠；样本比例接近 0 或 1 时请改用 Wilson 区间或精确区间。');
  return { n, a, N, f, p: est, total, steps, warnings };
}

/* ───────────── Stratified random sampling ───────────── */

export type StratumSummary = { name: string; N: number; n: number; mean: number; sd: number };
export type StratifiedRow = StratumSummary & { W: number; f: number; contribution: number; share: number };
export type StratifiedResult = { N: number; n: number; mean: Estimate; total: Estimate; rows: StratifiedRow[]; deff: number | null; steps: Step[]; warnings: string[] };

function validateStrata(strata: StratumSummary[]) {
  if (strata.length < 2) throw Error('至少需要 2 层。');
  for (const s of strata) {
    if (!(Number.isInteger(s.N) && s.N >= 1)) throw Error(`「${s.name}」的层规模 N_h 须为正整数。`);
    if (!(Number.isInteger(s.n) && s.n >= 1 && s.n <= s.N)) throw Error(`「${s.name}」的样本量 n_h 须为 1 到 N_h 之间的整数。`);
    if (s.n < 2 && s.n < s.N) throw Error(`「${s.name}」只有 1 个样本，无法估计层内方差；每层至少抽 2 个单位。`);
    if (!Number.isFinite(s.mean) || !(s.sd >= 0)) throw Error(`「${s.name}」的样本均值与标准差须为有效数值。`);
  }
}
/** Stratified mean with Satterthwaite degrees of freedom; strata given as sample summaries. */
export function stratifiedMean(strata: StratumSummary[], { confidence }: { confidence: number }): StratifiedResult {
  return stratifiedCore(strata, confidence, false);
}
/** Stratified proportion: each stratum's p_h is turned into s_h² = n_h p_h(1 − p_h)/(n_h − 1). */
export function stratifiedProportion(strata: { name: string; N: number; n: number; p: number }[], { confidence }: { confidence: number }): StratifiedResult {
  for (const s of strata) if (!(s.p >= 0 && s.p <= 1)) throw Error(`「${s.name}」的样本比例须在 0 与 1 之间。`);
  return stratifiedCore(strata.map(s => ({ name: s.name, N: s.N, n: s.n, mean: s.p, sd: s.n > 1 ? Math.sqrt(s.n * s.p * (1 - s.p) / (s.n - 1)) : 0 })), confidence, true);
}
function stratifiedCore(strata: StratumSummary[], confidence: number, proportion: boolean): StratifiedResult {
  validateStrata(strata);
  const N = sum(strata.map(s => s.N)), n = sum(strata.map(s => s.n));
  const parts = strata.map(s => {
    const W = s.N / N, f = s.n / s.N, contribution = W * W * (1 - f) * s.sd * s.sd / s.n;
    return { ...s, W, f, contribution };
  });
  const ybar = sum(parts.map(p => p.W * p.mean)), v = sum(parts.map(p => p.contribution));
  // Satterthwaite: g_h = N_h(N_h − n_h)/n_h.
  const g = parts.map(p => p.N * (p.N - p.n) / p.n), numerator = sum(parts.map((p, i) => g[i] * p.sd ** 2)) ** 2;
  const denominator = sum(parts.map((p, i) => p.n > 1 ? (g[i] * p.sd ** 2) ** 2 / (p.n - 1) : 0));
  const df = denominator > 0 ? numerator / denominator : null;
  const mean = estimate(ybar, v, confidence, df), total = estimate(N * ybar, N * N * v, confidence, df);
  const rows = parts.map(p => ({ ...p, share: v > 0 ? p.contribution / v : 0 }));
  // Design effect against an SRS of the same n: S² is rebuilt without bias from the stratum summaries.
  let deff: number | null = null;
  if (N > n && v > 0) {
    const between = sum(parts.map(p => p.N * (p.mean - ybar) ** 2)) - sum(parts.map(p => p.N * (1 - 2 * p.W) * (1 - p.f) * p.sd ** 2 / p.n)) - N * v;
    const S2 = (sum(parts.map(p => (p.N - 1) * p.sd ** 2)) + Math.max(0, between)) / (N - 1);
    const vSrs = (1 - n / N) * S2 / n;
    deff = vSrs > 0 ? v / vSrs : null;
  }
  const symbol = proportion ? 'p_{st}' : tex`\bar{y}_{st}`, part = proportion ? 'p_h' : tex`\bar{y}_h`;
  const steps: Step[] = [
    { label: '层权', tex: tex`W_h=\frac{N_h}{N},\quad N=\sum_{h=1}^{L}N_h=${texNum(N, 10)}` },
    { label: proportion ? '分层样本比例' : '分层样本均值', tex: tex`${symbol}=\sum_{h=1}^{L}W_h${part}=${parts.map(p => tex`${texNum(p.W, 4)}\times ${texNum(p.mean, 5)}`).join('+')}=${texNum(ybar, 6)}` },
    { label: '方差估计', tex: proportion
      ? tex`v(p_{st})=\sum_{h=1}^{L}W_h^{2}\,\frac{1-f_h}{n_h-1}\,p_h(1-p_h)=${texNum(v, 6)}`
      : tex`v(\bar{y}_{st})=\sum_{h=1}^{L}W_h^{2}\,\frac{1-f_h}{n_h}\,s_h^{2}=${texNum(v, 6)}` },
    ...(df === null ? [] : [{ label: '有效自由度（Satterthwaite）', tex: tex`n_e=\frac{\left(\sum_h g_h s_h^{2}\right)^{2}}{\sum_h \frac{g_h^{2}s_h^{4}}{n_h-1}},\quad g_h=\frac{N_h(N_h-n_h)}{n_h};\qquad n_e=${texNum(df, 4)}` }]),
    ciStep(symbol, mean, confidence),
    proportion
      ? { label: '具有该特征的总体单位数', tex: tex`\hat{A}_{st}=Np_{st}=${texNum(total.value, 7)},\quad \operatorname{se}(\hat{A}_{st})=${texNum(total.se, 6)}` }
      : { label: '总体总量', tex: tex`\hat{Y}_{st}=N\bar{y}_{st}=${texNum(total.value, 7)},\quad \operatorname{se}(\hat{Y}_{st})=${texNum(total.se, 6)}` },
  ];
  const warnings: string[] = [];
  if (strata.some(s => s.n < 5 && s.n < s.N)) warnings.push('有层的样本少于 5，层内标准差估计不稳定，区间可能偏窄。');
  if (deff !== null) warnings.push(`与同样本量的简单随机抽样相比，方差比（设计效应）约为 ${texNum(deff, 3)}；小于 1 说明分层提高了精度。`);
  return { N, n, mean, total, rows, deff, steps, warnings };
}

export type PostStratifiedResult = { mean: Estimate; unconditionalVariance: number; steps: Step[]; warnings: string[] };
/**
 * Post-stratification of an SRS: point estimate Σ W_h ȳ_h with the conditional variance
 * Σ W_h² (1 − n_h/N_h) s_h²/n_h (Holt & Smith 1979) and Cochran's unconditional approximation
 * (1 − f)/n · Σ W_h s_h² + Σ (1 − W_h) s_h²/n² for planning.
 */
export function postStratified(cells: StratumSummary[], { confidence }: { confidence: number }): PostStratifiedResult {
  validateStrata(cells);
  const N = sum(cells.map(c => c.N)), n = sum(cells.map(c => c.n)), f = n / N;
  const ybar = sum(cells.map(c => c.N / N * c.mean));
  const conditional = sum(cells.map(c => (c.N / N) ** 2 * (1 - c.n / c.N) * c.sd ** 2 / c.n));
  const unconditional = (1 - f) / n * sum(cells.map(c => c.N / N * c.sd ** 2)) + sum(cells.map(c => (1 - c.N / N) * c.sd ** 2)) / (n * n);
  const mean = estimate(ybar, conditional, confidence, null);
  const steps: Step[] = [
    { label: '事后分层估计量', tex: tex`\bar{y}_{pst}=\sum_{h=1}^{L}W_h\bar{y}_h=${texNum(ybar, 6)}` },
    { label: '条件方差估计（给定各层实际样本量）', tex: tex`v(\bar{y}_{pst}\mid n_1,\dots,n_L)=\sum_{h=1}^{L}W_h^{2}\Bigl(1-\frac{n_h}{N_h}\Bigr)\frac{s_h^{2}}{n_h}=${texNum(conditional, 6)}` },
    { label: '设计阶段的近似方差（规划用）', tex: tex`V(\bar{y}_{pst})\approx\frac{1-f}{n}\sum_{h}W_h S_h^{2}+\frac{1}{n^{2}}\sum_{h}(1-W_h)S_h^{2}=${texNum(unconditional, 6)}` },
    ciStep(tex`\bar{y}_{pst}`, mean, confidence),
  ];
  const warnings = cells.some(c => c.n < 20) ? ['有事后层样本少于 20，事后分层估计的稳定性较差；可合并相邻层后再计算。'] : [];
  return { mean, unconditionalVariance: unconditional, steps, warnings };
}

/* ───────────── Ratio, regression and difference estimators ───────────── */

export type Pair = { x: number; y: number };
export type AuxiliaryResult = {
  n: number; f: number; xbar: number; ybar: number; sx2: number; sy2: number; sxy: number; r: number; R: number; b: number; cvXbar: number;
  simple: Estimate; ratio: Estimate; regression: Estimate; efficiency: { ratio: number; regression: number };
  ratioFavoured: { threshold: number; holds: boolean };
  steps: { simple: Step[]; ratio: Step[]; regression: Step[] }; warnings: string[];
};
function pairSummary(pairs: Pair[]) {
  const xs = pairs.map(p => p.x), ys = pairs.map(p => p.y);
  return { xs, ys, xbar: meanOf(xs), ybar: meanOf(ys), sx2: varianceOf(xs), sy2: varianceOf(ys), sxy: covarianceOf(xs, ys) };
}
/**
 * Simple, ratio and regression estimators of the population mean of y when the population mean X̄
 * of an auxiliary variable x is known (SRS without replacement).
 */
export function auxiliaryEstimators(pairs: Pair[], { N, Xbar, confidence }: { N: number | null; Xbar: number; confidence: number }): AuxiliaryResult {
  const n = pairs.length;
  if (n < 3) throw Error('至少需要 3 对 (x, y) 数据。');
  if (!Number.isFinite(Xbar)) throw Error('请填写辅助变量的总体均值 X̄。');
  checkPopulation(N, n);
  const { xbar, ybar, sx2, sy2, sxy } = pairSummary(pairs);
  if (!(sx2 > 0)) throw Error('辅助变量 x 没有变异，无法使用比率或回归估计。');
  if (xbar === 0) throw Error('样本中 x 的均值为 0，比率估计无意义。');
  const f = fraction(n, N), r = sxy / Math.sqrt(sx2 * sy2), R = ybar / xbar, b = sxy / sx2;
  const ratioResidual = sy2 - 2 * R * sxy + R * R * sx2, regressionResidual = (n - 1) * (sy2 - sxy * sxy / sx2) / (n - 2);
  const simple = estimate(ybar, (1 - f) * sy2 / n, confidence, n - 1);
  const ratio = estimate(R * Xbar, (1 - f) * ratioResidual / n, confidence, n - 1);
  const regression = estimate(ybar + b * (Xbar - xbar), (1 - f) * regressionResidual / n, confidence, n - 2);
  const cvXbar = Math.sqrt((1 - f) / n * sx2) / Math.abs(xbar);
  const cx = Math.sqrt(sx2) / Math.abs(xbar), cy = Math.sqrt(sy2) / Math.abs(ybar), threshold = cx / (2 * cy);
  const steps = {
    simple: [
      { label: '简单估计', tex: tex`\bar{y}=${texNum(ybar, 6)},\quad v(\bar{y})=\frac{1-f}{n}s_y^{2}=${texNum(simple.variance, 6)}` },
      ciStep(tex`\bar{y}`, simple, confidence),
    ],
    ratio: [
      { label: '样本比率', tex: tex`\hat{R}=\frac{\bar{y}}{\bar{x}}=\frac{${texNum(ybar, 6)}}{${texNum(xbar, 6)}}=${texNum(R, 6)}` },
      { label: '比率估计量', tex: tex`\bar{y}_R=\hat{R}\,\bar{X}=${texNum(R, 6)}\times ${texNum(Xbar, 6)}=${texNum(ratio.value, 6)}` },
      { label: '方差估计', tex: tex`v(\bar{y}_R)=\frac{1-f}{n}\cdot\frac{\sum_{i=1}^{n}\left(y_i-\hat{R}x_i\right)^{2}}{n-1}=\frac{1-f}{n}\left(s_y^{2}-2\hat{R}s_{xy}+\hat{R}^{2}s_x^{2}\right)=${texNum(ratio.variance, 6)}` },
      ciStep(tex`\bar{y}_R`, ratio, confidence),
    ],
    regression: [
      { label: '回归系数', tex: tex`b=\frac{s_{xy}}{s_x^{2}}=\frac{${texNum(sxy, 6)}}{${texNum(sx2, 6)}}=${texNum(b, 6)}` },
      { label: '回归估计量', tex: tex`\bar{y}_{lr}=\bar{y}+b\left(\bar{X}-\bar{x}\right)=${texNum(ybar, 6)}+${texNum(b, 6)}\times\left(${texNum(Xbar, 6)}-${texNum(xbar, 6)}\right)=${texNum(regression.value, 6)}` },
      { label: '方差估计', tex: tex`v(\bar{y}_{lr})=\frac{1-f}{n}\cdot\frac{\sum_{i=1}^{n}\left[(y_i-\bar{y})-b(x_i-\bar{x})\right]^{2}}{n-2}=${texNum(regression.variance, 6)}` },
      ciStep(tex`\bar{y}_{lr}`, regression, confidence),
    ],
  };
  const warnings: string[] = [];
  if (cvXbar >= 0.1) warnings.push(`x̄ 的变异系数为 ${texNum(cvXbar, 3)}，不小于 0.1，比率估计的偏倚可能不可忽略；可增大样本或改用回归估计。`);
  if (r <= threshold) warnings.push('样本相关系数未超过 C_x/(2C_y)，比率估计未必优于简单估计。');
  if (n < 30) warnings.push('比率与回归估计的方差公式是大样本近似，样本较小时区间可能偏窄。');
  return { n, f, xbar, ybar, sx2, sy2, sxy, r, R, b, cvXbar, simple, ratio, regression,
    efficiency: { ratio: simple.variance / ratio.variance, regression: simple.variance / regression.variance },
    ratioFavoured: { threshold, holds: r > threshold }, steps, warnings };
}

export type RatioOfMeansResult = { R: Estimate; steps: Step[] };
/** The ratio R = Ȳ/X̄ itself (e.g. spending per unit of income) when X̄ is unknown. */
export function ratioOfMeans(pairs: Pair[], { N, confidence }: { N: number | null; confidence: number }): RatioOfMeansResult {
  const n = pairs.length;
  if (n < 2) throw Error('至少需要 2 对数据。');
  checkPopulation(N, n);
  const { xbar, ybar, sx2, sy2, sxy } = pairSummary(pairs);
  if (xbar === 0) throw Error('样本中 x 的均值为 0，比率无意义。');
  const f = fraction(n, N), R = ybar / xbar, v = (1 - f) / (n * xbar * xbar) * (sy2 - 2 * R * sxy + R * R * sx2);
  const est = estimate(R, v, confidence, n - 1);
  return { R: est, steps: [
    { label: '比率估计', tex: tex`\hat{R}=\frac{\bar{y}}{\bar{x}}=${texNum(R, 6)}` },
    { label: '方差估计', tex: tex`v(\hat{R})=\frac{1-f}{n\bar{x}^{2}}\left(s_y^{2}-2\hat{R}s_{xy}+\hat{R}^{2}s_x^{2}\right)=${texNum(v, 6)}` },
    ciStep(tex`\hat{R}`, est, confidence),
  ] };
}

export type StratifiedRatioResult = { separate: Estimate; combined: Estimate; Xbar: number; steps: { separate: Step[]; combined: Step[] }; warnings: string[] };
/** Separate and combined ratio estimators in stratified sampling (normal critical values). */
export function stratifiedRatio(rows: { stratum: string; x: number; y: number }[], strata: { name: string; N: number; Xbar: number }[], { confidence }: { confidence: number }): StratifiedRatioResult {
  if (strata.length < 2) throw Error('至少需要 2 层。');
  const N = sum(strata.map(s => s.N));
  const parts = strata.map(s => {
    const pairs = rows.filter(r => r.stratum === s.name);
    if (pairs.length < 2) throw Error(`「${s.name}」少于 2 对样本。`);
    if (!(Number.isInteger(s.N) && s.N >= pairs.length)) throw Error(`「${s.name}」的层规模须为不小于层样本量的整数。`);
    const summary = pairSummary(pairs);
    if (summary.xbar === 0) throw Error(`「${s.name}」的 x 均值为 0。`);
    return { ...s, ...summary, n: pairs.length, W: s.N / N, f: pairs.length / s.N };
  });
  const Xbar = sum(parts.map(p => p.W * p.Xbar));
  const separateValue = sum(parts.map(p => p.W * p.ybar / p.xbar * p.Xbar));
  const separateVariance = sum(parts.map(p => { const R = p.ybar / p.xbar; return p.W ** 2 * (1 - p.f) / p.n * (p.sy2 - 2 * R * p.sxy + R * R * p.sx2); }));
  const yst = sum(parts.map(p => p.W * p.ybar)), xst = sum(parts.map(p => p.W * p.xbar)), Rc = yst / xst;
  const combinedVariance = sum(parts.map(p => p.W ** 2 * (1 - p.f) / p.n * (p.sy2 - 2 * Rc * p.sxy + Rc * Rc * p.sx2)));
  const separate = estimate(separateValue, separateVariance, confidence, null), combined = estimate(Rc * Xbar, combinedVariance, confidence, null);
  const warnings: string[] = [];
  if (parts.some(p => p.n < 20)) warnings.push('有层的样本少于 20：分别比率估计的偏倚会在各层累积，此时更宜采用联合比率估计。');
  return { separate, combined, Xbar, warnings, steps: {
    separate: [
      { label: '分别比率估计', tex: tex`\bar{y}_{RS}=\sum_{h=1}^{L}W_h\frac{\bar{y}_h}{\bar{x}_h}\bar{X}_h=${texNum(separateValue, 6)}` },
      { label: '方差估计', tex: tex`v(\bar{y}_{RS})=\sum_{h=1}^{L}W_h^{2}\frac{1-f_h}{n_h}\left(s_{yh}^{2}-2\hat{R}_h s_{yxh}+\hat{R}_h^{2}s_{xh}^{2}\right)=${texNum(separateVariance, 6)}` },
      ciStep(tex`\bar{y}_{RS}`, separate, confidence),
    ],
    combined: [
      { label: '联合比率', tex: tex`\hat{R}_c=\frac{\bar{y}_{st}}{\bar{x}_{st}}=\frac{${texNum(yst, 6)}}{${texNum(xst, 6)}}=${texNum(Rc, 6)}` },
      { label: '联合比率估计', tex: tex`\bar{y}_{RC}=\hat{R}_c\bar{X}=${texNum(Rc, 6)}\times ${texNum(Xbar, 6)}=${texNum(Rc * Xbar, 6)}` },
      { label: '方差估计', tex: tex`v(\bar{y}_{RC})=\sum_{h=1}^{L}W_h^{2}\frac{1-f_h}{n_h}\left(s_{yh}^{2}-2\hat{R}_c s_{yxh}+\hat{R}_c^{2}s_{xh}^{2}\right)=${texNum(combinedVariance, 6)}` },
      ciStep(tex`\bar{y}_{RC}`, combined, confidence),
    ],
  } };
}

/* ───────────── Cluster and two-stage sampling ───────────── */

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) { const k = key(row); const list = map.get(k); if (list) list.push(row); else map.set(k, [row]); }
  return map;
}
export type ClusterResult = { clusters: number; elements: number; mbar: number; equalSize: boolean; mean: Estimate; total: Estimate | null; icc: number | null; deff: number | null; steps: Step[]; warnings: string[] };
/**
 * One-stage cluster sampling: an SRS of n clusters out of N, every element of a sampled cluster observed.
 * The per-element mean is the ratio Σy_i / ΣM_i; with equal sizes this is the classic (1 − f)s_b²/n.
 */
export function clusterSample(rows: { cluster: string; y: number }[], { N, Mbar, confidence }: { N: number | null; Mbar: number | null; confidence: number }): ClusterResult {
  const groups = [...groupBy(rows, r => r.cluster).values()], n = groups.length;
  if (n < 2) throw Error('至少需要 2 个群。');
  checkPopulation(N, n, '总体群数 N');
  if (Mbar !== null && !(Mbar > 0)) throw Error('总体平均群规模须大于 0。');
  const totals = groups.map(g => sum(g.map(r => r.y))), sizes = groups.map(g => g.length), elements = sum(sizes);
  const f = fraction(n, N), ybar = sum(totals) / elements, mbar = elements / n, scale = Mbar ?? mbar;
  const residual = sum(totals.map((t, i) => (t - ybar * sizes[i]) ** 2)) / (n - 1);
  const v = (1 - f) / (n * scale * scale) * residual;
  const mean = estimate(ybar, v, confidence, n - 1);
  const total = N === null ? null : estimate(N / n * sum(totals), N * N * (1 - f) * varianceOf(totals) / n, confidence, n - 1);
  // ANOVA estimator of the intraclass correlation (allows unequal cluster sizes).
  let icc: number | null = null;
  const msb = sum(groups.map((g, i) => sizes[i] * (totals[i] / sizes[i] - ybar) ** 2)) / (n - 1);
  const within = sum(groups.map((g, i) => sum(g.map(r => (r.y - totals[i] / sizes[i]) ** 2)))), dfWithin = elements - n;
  if (dfWithin > 0) {
    const msw = within / dfWithin, m0 = (elements - sum(sizes.map(s => s * s)) / elements) / (n - 1);
    const denominator = msb + (m0 - 1) * msw;
    icc = denominator > 0 ? (msb - msw) / denominator : null;
  }
  const s2 = varianceOf(rows.map(r => r.y)), vSrs = (1 - f) * s2 / elements;
  const deff = vSrs > 0 ? v / vSrs : null;
  const equalSize = sizes.every(s => s === sizes[0]);
  const steps: Step[] = [
    { label: '每个单元的均值（比率估计）', tex: tex`\bar{y}=\frac{\sum_{i=1}^{n}y_i}{\sum_{i=1}^{n}M_i}=\frac{${texNum(sum(totals), 8)}}{${elements}}=${texNum(ybar, 6)}` },
    ...fpcStep(n, N),
    { label: '方差估计', tex: tex`v(\bar{y})=\frac{1-f}{n\bar{M}^{2}}\cdot\frac{\sum_{i=1}^{n}\left(y_i-\bar{y}M_i\right)^{2}}{n-1}=${texNum(v, 6)}` },
    ciStep(tex`\bar{y}`, mean, confidence),
  ];
  if (icc !== null) steps.push({ label: '群内相关系数（方差分析估计）', tex: tex`\hat{\rho}=\frac{MSB-MSW}{MSB+(m_0-1)MSW}=${texNum(icc, 4)},\qquad \mathrm{deff}=\frac{v(\bar{y})}{v_{srs}(\bar{y})}=${deff === null ? tex`\text{—}` : texNum(deff, 4)}` });
  if (total) steps.push({ label: '总体总量（无偏估计）', tex: tex`\hat{Y}=\frac{N}{n}\sum_{i=1}^{n}y_i=${texNum(total.value, 7)},\quad \operatorname{se}(\hat{Y})=${texNum(total.se, 6)}` });
  const warnings: string[] = [];
  if (!equalSize) warnings.push('各群规模不等，均值采用比率估计（大样本近似）；群数较少时偏倚与区间误差都可能较大。');
  if (n < 10) warnings.push('群数少于 10，自由度只有 n − 1，区间会很宽；整群抽样的精度主要取决于群数而不是总人数。');
  if (Mbar === null) warnings.push('未填写总体平均群规模，方差公式中的 M̄ 用样本平均群规模代替。');
  return { clusters: n, elements, mbar, equalSize, mean, total, icc, deff, steps, warnings };
}

export type TwoStageResult = { n: number; m: number; f1: number; f2: number; s1: number; s2: number; mean: Estimate; total: Estimate; components: { S1: number; S2: number; Su: number }; steps: Step[]; warnings: string[] };
/** Two-stage sampling with equal primary units: SRS of n of N PSUs, then SRS of m of M elements in each. */
export function twoStage(rows: { psu: string; y: number }[], { N, M, confidence }: { N: number; M: number; confidence: number }): TwoStageResult {
  const groups = [...groupBy(rows, r => r.psu).values()], n = groups.length;
  if (n < 2) throw Error('至少需要 2 个初级单元。');
  const m = groups[0].length;
  if (groups.some(g => g.length !== m)) throw Error('各初级单元的二级样本量须相等；不等时请使用“复杂样本估计”。');
  if (m < 2) throw Error('每个初级单元至少抽 2 个二级单元，才能估计第二阶段方差。');
  if (!(Number.isInteger(N) && N >= n)) throw Error('初级单元总数 N 须为不小于 n 的整数。');
  if (!(Number.isInteger(M) && M >= m)) throw Error('每个初级单元的二级单元数 M 须为不小于 m 的整数。');
  const f1 = n / N, f2 = m / M, means = groups.map(g => meanOf(g.map(r => r.y))), ybar = meanOf(means);
  const s1 = varianceOf(means), s2 = sum(groups.map((g, i) => sum(g.map(r => (r.y - means[i]) ** 2)))) / (n * (m - 1));
  const v = (1 - f1) / n * s1 + f1 * (1 - f2) / (n * m) * s2;
  const mean = estimate(ybar, v, confidence, n - 1), total = estimate(N * M * ybar, (N * M) ** 2 * v, confidence, n - 1);
  const S2 = s2, S1 = Math.max(0, s1 - (1 - f2) * s2 / m), Su = S1 - S2 / M;
  const warnings: string[] = [];
  if (s1 - (1 - f2) * s2 / m < 0) warnings.push('初级单元间方差的估计为负，已截断为 0：说明各初级单元之间差异很小，可考虑减少每个单元内的样本、增加初级单元数。');
  return { n, m, f1, f2, s1, s2, mean, total, components: { S1, S2, Su }, warnings, steps: [
    { label: '样本均值', tex: tex`\bar{\bar{y}}=\frac{1}{nm}\sum_{i=1}^{n}\sum_{j=1}^{m}y_{ij}=${texNum(ybar, 6)}` },
    { label: '两个阶段的样本方差', tex: tex`s_1^{2}=\frac{\sum_{i}(\bar{y}_i-\bar{\bar{y}})^{2}}{n-1}=${texNum(s1, 6)},\qquad s_2^{2}=\frac{\sum_{i}\sum_{j}(y_{ij}-\bar{y}_i)^{2}}{n(m-1)}=${texNum(s2, 6)}` },
    { label: '方差估计', tex: tex`v(\bar{\bar{y}})=\frac{1-f_1}{n}s_1^{2}+\frac{f_1(1-f_2)}{nm}s_2^{2}=${texNum(v, 6)},\quad f_1=${texNum(f1, 4)},\ f_2=${texNum(f2, 4)}` },
    ciStep(tex`\bar{\bar{y}}`, mean, confidence),
  ] };
}

/* ───────────── Systematic sampling ───────────── */

export type SystematicResult = { mean: Estimate; vSrs: number; vDiff: number; steps: Step[]; warnings: string[] };
/** Systematic sample in frame order; the variance is approximated as SRS and by successive differences. */
export function systematicEstimate(values: number[], { N, confidence }: { N: number | null; confidence: number }): SystematicResult {
  const n = values.length;
  if (n < 3) throw Error('至少需要 3 个按抽样顺序排列的样本值。');
  checkPopulation(N, n);
  const f = fraction(n, N), ybar = meanOf(values), vSrs = (1 - f) * varianceOf(values) / n;
  let d = 0;
  for (let i = 1; i < n; i++) d += (values[i] - values[i - 1]) ** 2;
  const vDiff = (1 - f) / n * d / (2 * (n - 1));
  const mean = estimate(ybar, vDiff, confidence, n - 1);
  return { mean, vSrs, vDiff, warnings: ['系统抽样只有一个随机起点，方差没有无偏估计；这里给出两种近似，总体按与目标变量相关的顺序排列时差分法更合适。若名单存在周期，与抽样间距重合会使估计严重偏离。'], steps: [
    { label: '样本均值', tex: tex`\bar{y}_{sy}=${texNum(ybar, 6)}` },
    { label: '按简单随机抽样近似', tex: tex`v_1=\frac{1-f}{n}s^{2}=${texNum(vSrs, 6)}` },
    { label: '相邻差分法', tex: tex`v_2=\frac{1-f}{n}\cdot\frac{\sum_{i=1}^{n-1}\left(y_{i+1}-y_i\right)^{2}}{2(n-1)}=${texNum(vDiff, 6)}` },
    ciStep(tex`\bar{y}_{sy}`, mean, confidence),
  ] };
}

/* ───────────── Unequal probability sampling ───────────── */

export type TotalResult = { total: Estimate; mean: Estimate | null; steps: Step[]; warnings: string[] };
/** Hansen–Hurwitz estimator for n independent PPS draws with replacement; p_i = M_i/M_0. */
export function hansenHurwitz(draws: { y: number; p: number }[], { N, confidence }: { N: number | null; confidence: number }): TotalResult {
  const n = draws.length;
  if (n < 2) throw Error('至少需要 2 次抽取。');
  if (draws.some(d => !(d.p > 0 && d.p <= 1))) throw Error('每次抽取的概率 p_i 须在 0 与 1 之间。');
  const z = draws.map(d => d.y / d.p), Y = meanOf(z), v = varianceOf(z) / n;
  const total = estimate(Y, v, confidence, n - 1), mean = N === null ? null : estimate(Y / N, v / (N * N), confidence, n - 1);
  return { total, mean, warnings: [], steps: [
    { label: 'Hansen–Hurwitz 估计量', tex: tex`\hat{Y}_{HH}=\frac{1}{n}\sum_{i=1}^{n}\frac{y_i}{p_i}=${texNum(Y, 7)}` },
    { label: '方差估计', tex: tex`v(\hat{Y}_{HH})=\frac{1}{n(n-1)}\sum_{i=1}^{n}\left(\frac{y_i}{p_i}-\hat{Y}_{HH}\right)^{2}=${texNum(v, 6)}` },
    ciStep(tex`\hat{Y}_{HH}`, total, confidence),
  ] };
}
/**
 * Horvitz–Thompson total for a without-replacement πps sample. Joint inclusion probabilities are rarely
 * available, so the variance uses the with-replacement approximation, which is usually conservative.
 */
export function horvitzThompson(units: { y: number; pi: number }[], { N, confidence }: { N: number | null; confidence: number }): TotalResult {
  const n = units.length;
  if (n < 2) throw Error('至少需要 2 个入样单元。');
  if (units.some(u => !(u.pi > 0 && u.pi <= 1))) throw Error('入样概率 π_i 须在 0 与 1 之间。');
  const z = units.map(u => u.y / u.pi), Y = sum(z);
  const v = n / (n - 1) * sum(z.map(t => (t - Y / n) ** 2));
  const total = estimate(Y, v, confidence, n - 1), mean = N === null ? null : estimate(Y / N, v / (N * N), confidence, n - 1);
  return { total, mean, warnings: ['方差按“放回抽样”近似，未使用二阶入样概率 π_ij，结果通常略为保守；抽样比较大时高估更明显。'], steps: [
    { label: 'Horvitz–Thompson 估计量', tex: tex`\hat{Y}_{HT}=\sum_{i=1}^{n}\frac{y_i}{\pi_i}=${texNum(Y, 7)}` },
    { label: '方差估计（放回近似）', tex: tex`v(\hat{Y}_{HT})\approx\frac{n}{n-1}\sum_{i=1}^{n}\left(\frac{y_i}{\pi_i}-\frac{\hat{Y}_{HT}}{n}\right)^{2}=${texNum(v, 6)}` },
    ciStep(tex`\hat{Y}_{HT}`, total, confidence),
  ] };
}

/* ───────────── Two-phase (double) sampling ───────────── */

export type TwoPhaseResult = { mean: Estimate; steps: Step[]; warnings: string[] };
/**
 * Double sampling for stratification: a large first-phase SRS of n′ is classified into strata, then a
 * subsample is measured in each. Variance estimator from Cochran (1977, eq. 12.20); it reduces to the
 * SRS formula when every first-phase unit is measured.
 */
export function twoPhaseStratified(phase1: { name: string; count: number }[], rows: { stratum: string; y: number }[], { N, confidence }: { N: number | null; confidence: number }): TwoPhaseResult {
  if (phase1.length < 2) throw Error('至少需要 2 层。');
  const n1 = sum(phase1.map(p => p.count));
  if (n1 < 3) throw Error('第一相样本过少。');
  checkPopulation(N, n1, '总体规模 N');
  const groups = groupBy(rows, r => r.stratum);
  const parts = phase1.map(p => {
    const ys = (groups.get(p.name) ?? []).map(r => r.y);
    if (!(Number.isInteger(p.count) && p.count >= 1)) throw Error(`「${p.name}」第一相计数须为正整数。`);
    if (ys.length < 2) throw Error(`「${p.name}」第二相至少需要 2 个样本值。`);
    if (ys.length > p.count) throw Error(`「${p.name}」第二相样本不能多于第一相计数。`);
    return { name: p.name, n1h: p.count, nh: ys.length, w: p.count / n1, ybar: meanOf(ys), s2: varianceOf(ys) };
  });
  const value = sum(parts.map(p => p.w * p.ybar));
  const finite = N ?? Infinity;
  const term1 = sum(parts.map(p => ((p.n1h - 1) / (n1 - 1) - (p.nh - 1) / (finite - 1)) * p.w * p.s2 / p.nh)) * (N === null ? 1 : (N - 1) / N);
  const term2 = (N === null ? 1 / (n1 - 1) : (N - n1) / (N * (n1 - 1))) * sum(parts.map(p => p.w * (p.ybar - value) ** 2));
  const mean = estimate(value, term1 + term2, confidence, null);
  return { mean, warnings: [], steps: [
    { label: '二重分层估计量', tex: tex`\bar{y}_{st}=\sum_{h=1}^{L}w_h\bar{y}_h,\quad w_h=\frac{n'_h}{n'};\qquad \bar{y}_{st}=${texNum(value, 6)}` },
    { label: '方差估计', tex: tex`v(\bar{y}_{st})=\frac{N-1}{N}\sum_{h}\left(\frac{n'_h-1}{n'-1}-\frac{n_h-1}{N-1}\right)\frac{w_h s_h^{2}}{n_h}+\frac{N-n'}{N(n'-1)}\sum_{h}w_h\left(\bar{y}_h-\bar{y}_{st}\right)^{2}=${texNum(term1 + term2, 6)}` },
    ciStep(tex`\bar{y}_{st}`, mean, confidence),
  ] };
}
export type TwoPhaseAuxiliaryResult = { ratio: Estimate; regression: Estimate; steps: { ratio: Step[]; regression: Step[] }; warnings: string[] };
/** Two-phase ratio and regression estimators: x̄′ from the large first phase, (x, y) on the subsample. */
export function twoPhaseAuxiliary({ n1, xbar1 }: { n1: number; xbar1: number }, pairs: Pair[], { N, confidence }: { N: number | null; confidence: number }): TwoPhaseAuxiliaryResult {
  const n = pairs.length;
  if (n < 3) throw Error('第二相至少需要 3 对数据。');
  if (!(Number.isInteger(n1) && n1 > n)) throw Error('第一相样本量 n′ 须为大于第二相样本量的整数。');
  checkPopulation(N, n1);
  const { xbar, ybar, sx2, sy2, sxy } = pairSummary(pairs);
  if (!(sx2 > 0) || xbar === 0) throw Error('辅助变量 x 须有变异且均值不为 0。');
  const R = ybar / xbar, b = sxy / sx2, inv = N === null ? 0 : 1 / N;
  const sd2 = sy2 - 2 * R * sxy + R * R * sx2, se2 = (n - 1) * (sy2 - sxy * sxy / sx2) / (n - 2);
  const ratio = estimate(R * xbar1, sy2 * (1 / n1 - inv) + sd2 * (1 / n - 1 / n1), confidence, null);
  const regression = estimate(ybar + b * (xbar1 - xbar), se2 * (1 / n - 1 / n1) + sy2 * (1 / n1 - inv), confidence, null);
  return { ratio, regression, warnings: [], steps: {
    ratio: [
      { label: '二重比率估计', tex: tex`\bar{y}_{Rd}=\frac{\bar{y}}{\bar{x}}\,\bar{x}'=${texNum(ratio.value, 6)}` },
      { label: '方差估计', tex: tex`v(\bar{y}_{Rd})=s_y^{2}\Bigl(\frac{1}{n'}-\frac{1}{N}\Bigr)+\Bigl(\frac{1}{n}-\frac{1}{n'}\Bigr)\left(s_y^{2}-2\hat{R}s_{xy}+\hat{R}^{2}s_x^{2}\right)=${texNum(ratio.variance, 6)}` },
      ciStep(tex`\bar{y}_{Rd}`, ratio, confidence),
    ],
    regression: [
      { label: '二重回归估计', tex: tex`\bar{y}_{lrd}=\bar{y}+b\left(\bar{x}'-\bar{x}\right)=${texNum(regression.value, 6)}` },
      { label: '方差估计', tex: tex`v(\bar{y}_{lrd})=s_{y\cdot x}^{2}\Bigl(\frac{1}{n}-\frac{1}{n'}\Bigr)+s_y^{2}\Bigl(\frac{1}{n'}-\frac{1}{N}\Bigr)=${texNum(regression.variance, 6)}` },
      ciStep(tex`\bar{y}_{lrd}`, regression, confidence),
    ],
  } };
}

/* ───────────── Randomized response for sensitive questions ───────────── */

export type RrDesign =
  | { model: 'warner'; p: number }
  | { model: 'unrelated'; p: number; piU: number }
  | { model: 'forced'; truth: number; forcedYes: number };
export type RrResult = { lambda: number; pi: Estimate; raw: number; jeopardy: { yes: number; no: number }; steps: Step[]; warnings: string[] };
function rrCoefficients(design: RrDesign): { slope: number; intercept: number; yesGivenA: number; yesGivenNotA: number } {
  if (design.model === 'warner') {
    if (!(design.p > 0 && design.p < 1) || Math.abs(design.p - 0.5) < 1e-9) throw Error('Warner 模型的 p 须在 0 与 1 之间且不等于 0.5。');
    return { slope: 2 * design.p - 1, intercept: 1 - design.p, yesGivenA: design.p, yesGivenNotA: 1 - design.p };
  }
  if (design.model === 'unrelated') {
    if (!(design.p > 0 && design.p <= 1) || !(design.piU >= 0 && design.piU <= 1)) throw Error('回答敏感问题的概率 p 须在 (0, 1]，无关问题的“是”比例 π_U 须在 [0, 1]。');
    return { slope: design.p, intercept: (1 - design.p) * design.piU, yesGivenA: design.p + (1 - design.p) * design.piU, yesGivenNotA: (1 - design.p) * design.piU };
  }
  if (!(design.truth > 0 && design.forcedYes >= 0 && design.truth + design.forcedYes <= 1)) throw Error('强制回答模型中，如实回答概率须大于 0，且与强制答“是”的概率之和不超过 1。');
  return { slope: design.truth, intercept: design.forcedYes, yesGivenA: design.truth + design.forcedYes, yesGivenNotA: design.forcedYes };
}
/** Randomized response estimate of a sensitive proportion π_A from the observed share of “yes”. */
export function randomizedResponse(design: RrDesign, { n, yes, confidence }: { n: number; yes: number; confidence: number }): RrResult {
  if (!(Number.isInteger(n) && n >= 2)) throw Error('样本量须为不小于 2 的整数。');
  if (!(Number.isInteger(yes) && yes >= 0 && yes <= n)) throw Error('回答“是”的人数须在 0 与 n 之间。');
  const { slope, intercept, yesGivenA, yesGivenNotA } = rrCoefficients(design);
  const lambda = yes / n, raw = (lambda - intercept) / slope, value = Math.min(1, Math.max(0, raw));
  const v = lambda * (1 - lambda) / ((n - 1) * slope * slope);
  const pi = estimate(value, v, confidence, null);
  const pYes = yesGivenA * value + yesGivenNotA * (1 - value);
  const jeopardy = { yes: pYes > 0 ? yesGivenA * value / pYes : 0, no: pYes < 1 ? (1 - yesGivenA) * value / (1 - pYes) : 0 };
  const formula = design.model === 'warner'
    ? tex`\hat{\pi}_A=\frac{\hat{\lambda}-(1-p)}{2p-1}`
    : design.model === 'unrelated' ? tex`\hat{\pi}_A=\frac{\hat{\lambda}-(1-p)\pi_U}{p}` : tex`\hat{\pi}_A=\frac{\hat{\lambda}-p_{\text{是}}}{p_{\text{如实}}}`;
  const denominator = design.model === 'warner' ? tex`(2p-1)^{2}` : design.model === 'unrelated' ? tex`p^{2}` : tex`p_{\text{如实}}^{2}`;
  const warnings: string[] = [];
  if (raw < 0 || raw > 1) warnings.push('由抽样波动得到的估计值落在 [0, 1] 之外，已截断；样本量偏小或设计参数不合适。');
  return { lambda, pi, raw, jeopardy, warnings, steps: [
    { label: '回答“是”的比例', tex: tex`\hat{\lambda}=\frac{${yes}}{${n}}=${texNum(lambda, 5)}` },
    { label: '敏感特征比例', tex: tex`${formula}=${texNum(raw, 5)}` },
    { label: '方差估计', tex: tex`v(\hat{\pi}_A)=\frac{\hat{\lambda}(1-\hat{\lambda})}{(n-1)${denominator}}=${texNum(v, 5)}` },
    ciStep(tex`\hat{\pi}_A`, pi, confidence),
    { label: '隐私保护程度', tex: tex`P(A\mid\text{是})=${texNum(jeopardy.yes, 4)},\qquad P(A\mid\text{否})=${texNum(jeopardy.no, 4)}` },
  ] };
}
