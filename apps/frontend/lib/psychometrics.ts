/**
 * Before a factor analysis, whether the items are fit for one: the Kaiser–Meyer–Olkin measure of sampling adequacy,
 * overall and per item, and Bartlett's test that the items' correlation matrix is an identity (no shared variance to
 * factor). Pure computation on complete cases; the caller chooses the items and the rows, and reverses coded items.
 *
 * KMO = Σ r²ᵢⱼ / (Σ r²ᵢⱼ + Σ a²ᵢⱼ) over i ≠ j, where a is the anti-image (partial) correlation from R⁻¹; Bartlett's
 * χ² = −(n − 1 − (2p + 5)/6) · ln|R| with p(p − 1)/2 degrees of freedom (Kaiser 1974; Bartlett 1950).
 */
import { chiSquareUpper } from './inference.ts';

export type Adequacy = {
  /** Complete cases and items used. */
  n: number; items: number;
  kmo: number;
  /** Per-item measure of sampling adequacy, in item order. */
  msa: number[];
  bartlett: { chi2: number; df: number; p: number };
  /** ln|R|: near zero means little shared variance, very negative means near-collinear items. */
  logDeterminant: number;
};
export type AdequacyRefusal = { refused: 'too-few-items' | 'too-few-cases' | 'constant-item' | 'singular' | 'no-shared-variance' };

/** Pearson correlations of equal-length columns; null when a column has no variance. */
export function correlationMatrix(columns: readonly (readonly number[])[]): number[][] | null {
  const n = columns[0]?.length ?? 0;
  const centred = columns.map(c => { const mean = c.reduce((s, v) => s + v, 0) / n; return c.map(v => v - mean); });
  const scale = centred.map(c => Math.sqrt(c.reduce((s, v) => s + v * v, 0)));
  if (scale.some(s => !(s > 0))) return null;
  return centred.map((a, i) => centred.map((b, j) => {
    if (i === j) return 1;
    let sum = 0;
    for (let k = 0; k < n; k++) sum += a[k] * b[k];
    return Math.max(-1, Math.min(1, sum / (scale[i] * scale[j])));
  }));
}

/** ln|M| of a symmetric positive-definite matrix by Cholesky; null when it is not positive definite. */
export function logDeterminant(m: readonly (readonly number[])[]): number | null {
  const p = m.length, l = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  let log = 0;
  for (let j = 0; j < p; j++) {
    let d = m[j][j];
    for (let k = 0; k < j; k++) d -= l[j][k] * l[j][k];
    if (!(d > 1e-12)) return null;
    l[j][j] = Math.sqrt(d);
    log += Math.log(l[j][j]);
    for (let i = j + 1; i < p; i++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      l[i][j] = s / l[j][j];
    }
  }
  return 2 * log;
}

/** The inverse by Gauss–Jordan elimination with partial pivoting; null when the matrix is singular. */
export function invert(m: readonly (readonly number[])[]): number[][] | null {
  const p = m.length, a = m.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < p; c++) {
    let pivot = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (!(Math.abs(a[pivot][c]) > 1e-12)) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const head = a[c][c];
    for (let k = 0; k < 2 * p; k++) a[c][k] /= head;
    for (let r = 0; r < p; r++) {
      if (r === c || a[r][c] === 0) continue;
      const f = a[r][c];
      for (let k = 0; k < 2 * p; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map(row => row.slice(p));
}

/**
 * KMO and Bartlett's test for items given as columns of complete cases. Refuses rather than guesses: fewer than three
 * items, no more cases than items, an item without variance, or items so collinear that the matrix cannot be inverted.
 */
export function samplingAdequacy(columns: readonly (readonly number[])[]): Adequacy | AdequacyRefusal {
  const p = columns.length, n = columns[0]?.length ?? 0;
  if (p < 3) return { refused: 'too-few-items' };
  if (n <= p || columns.some(c => c.length !== n)) return { refused: 'too-few-cases' };
  const r = correlationMatrix(columns);
  if (!r) return { refused: 'constant-item' };
  const inverse = invert(r), log = logDeterminant(r);
  if (!inverse || log === null) return { refused: 'singular' };
  const partial = inverse.map((row, i) => row.map((v, j) => -v / Math.sqrt(inverse[i][i] * inverse[j][j])));
  let r2 = 0, a2 = 0;
  const msa = r.map((row, i) => {
    let rr = 0, aa = 0;
    for (let j = 0; j < p; j++) if (j !== i) { rr += row[j] * row[j]; aa += partial[i][j] * partial[i][j]; }
    r2 += rr; a2 += aa;
    return rr / (rr + aa);
  });
  // Items that correlate with nothing leave KMO and every MSA undefined (0 / 0): there is no common variance to factor.
  if (!(r2 > 0) || msa.some(v => !Number.isFinite(v))) return { refused: 'no-shared-variance' };
  const chi2 = -(n - 1 - (2 * p + 5) / 6) * log, df = p * (p - 1) / 2;
  return { n, items: p, kmo: r2 / (r2 + a2), msa, bartlett: { chi2, df, p: chiSquareUpper(chi2, df) }, logDeterminant: log };
}

/** Kaiser's (1974) descriptive bands for a KMO or MSA value; descriptive only, never a pass mark. */
export function kmoBand(value: number): string {
  return value >= 0.9 ? '极好' : value >= 0.8 ? '良好' : value >= 0.7 ? '中等' : value >= 0.6 ? '一般' : value >= 0.5 ? '较差' : '不可接受';
}
