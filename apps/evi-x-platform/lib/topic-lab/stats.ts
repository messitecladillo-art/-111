/** Small exact-statistics helpers shared by the topic lab (no dependencies). */
const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function logGamma(x: number): number {
  if (x < .5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  LANCZOS.forEach((c, i) => { a += c / (x + i + 1); });
  return .5 * Math.log(2 * Math.PI) + (x + .5) * Math.log(t) - t + Math.log(a);
}
export const logChoose = (n: number, k: number) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
function logSumExp(xs: number[]): number { const m = Math.max(...xs); return m === -Infinity ? m : m + Math.log(xs.reduce((s, x) => s + Math.exp(x - m), 0)); }

/**
 * One-sided Fisher exact test. With N records, K containing term A and n containing term B, returns
 * P(X ≤ observed) for the number X containing both, under independence (hypergeometric).
 */
export function hypergeomLowerTail(observed: number, N: number, K: number, n: number): number {
  const kMin = Math.max(0, n + K - N), kMax = Math.min(n, K);
  if (observed < kMin) return 0;
  if (observed >= kMax) return 1;
  const logs: number[] = [];
  let lp = logChoose(K, kMin) + logChoose(N - K, n - kMin) - logChoose(N, n);
  for (let k = kMin; k <= observed; k++) {
    logs.push(lp);
    lp += Math.log((K - k) * (n - k)) - Math.log((k + 1) * (N - K - n + k + 1));
  }
  return Math.min(1, Math.exp(logSumExp(logs)));
}

/** Benjamini–Hochberg adjusted p-values (q-values), returned in the input order. */
export function benjaminiHochberg(p: number[]): number[] {
  const m = p.length, order = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) { const [v, i] = order[r]; min = Math.min(min, v * m / (r + 1)); q[i] = min; }
  return q;
}
