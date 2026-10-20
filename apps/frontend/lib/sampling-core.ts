/**
 * Shared numerics for the sampling handbook: critical values, reproducible random draws,
 * summaries and TeX-safe number formatting. Everything here is pure and runs in the browser.
 */
import { normalUpper, tCritical } from './inference.ts';

/** Two-sided critical value z_{1−α/2} for a confidence level such as 0.95. */
export function zCritical(confidence: number): number {
  if (!(confidence > 0 && confidence < 1)) throw Error('置信水平须在 0 与 1 之间。');
  const tail = (1 - confidence) / 2;
  let lo = 0, hi = 1;
  while (normalUpper(hi) > tail) hi *= 2;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (normalUpper(mid) > tail) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** Two-sided t critical value; df = null or Infinity falls back to the normal value. */
export function tCriticalAt(confidence: number, df: number | null): number {
  if (df === null || !Number.isFinite(df)) return zCritical(confidence);
  if (!(df > 0)) throw Error('自由度须大于 0。');
  return tCritical(1 - confidence, df);
}
/** One-sided z_{1−β} used in power calculations. */
export function zOneSided(probability: number): number {
  return zCritical(2 * probability - 1);
}

export const sum = (xs: readonly number[]) => { let s = 0; for (const x of xs) s += x; return s; };
export const meanOf = (xs: readonly number[]) => sum(xs) / xs.length;
/** Sample variance with the n − 1 divisor. */
export function varianceOf(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = meanOf(xs); let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}
/** Sample covariance with the n − 1 divisor. */
export function covarianceOf(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const mx = meanOf(xs), my = meanOf(ys); let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (xs.length - 1);
}

export type Interval = { lower: number; upper: number };
export const interval = (estimate: number, se: number, crit: number): Interval => ({ lower: estimate - crit * se, upper: estimate + crit * se });

/**
 * Reproducible uniform draws in [0, 1) from a text seed (cyrb128 hash feeding sfc32).
 * The same seed always gives the same selection, so a draw can be audited and repeated.
 */
export function seededRandom(seed: string): () => number {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  let a = h1 >>> 0, b = h2 >>> 0, c = h3 >>> 0, d = h4 >>> 0;
  const next = () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();
  return next;
}
/** A 128-bit content fingerprint (cyrb128), used to bind derived results such as weights to their data. */
export function textHash(text: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('');
}
/** User-supplied names placed in notes that render inline math: a dollar sign must not open a formula. */
export const literal = (text: string) => text.replace(/\$/g, '＄');
/** Uniform integer in [0, n). */
export const randomInt = (rand: () => number, n: number) => Math.floor(rand() * n);
/** Standard normal deviate (Box–Muller); used only by simulations. */
export function randomNormal(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Numbers pasted as a list: commas, Chinese punctuation, spaces or new lines all separate values. */
export function parseNumberList(text: string): { values: number[]; invalid: string[] } {
  const values: number[] = [], invalid: string[] = [];
  for (const token of text.split(/[\s,，;；、]+/).filter(Boolean)) {
    const v = Number(token);
    if (Number.isFinite(v)) values.push(v); else invalid.push(token);
  }
  return { values, invalid };
}

/** A number written for TeX: fixed significant digits, trailing zeros trimmed, thousands grouped with {,}. */
export function texNum(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '\\text{—}';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1e-4 && abs < 1e12) {
    const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(abs)));
    text = value.toFixed(Math.min(decimals, 10));
    if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
    const [int, frac] = text.split('.');
    const sign = int.startsWith('-') ? '-' : '';
    const grouped = int.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '{,}');
    text = sign + grouped + (frac ? '.' + frac : '');
  } else {
    const [mant, exp] = value.toExponential(digits - 1).split('e');
    text = `${mant.replace(/\.?0+$/, '')}\\times 10^{${Number(exp)}}`;
  }
  return text;
}
/** A percentage for TeX, e.g. 0.05 → 5\%. */
export const texPct = (value: number, digits = 3) => `${texNum(value * 100, digits)}\\%`;
