/**
 * Exploratory factor analysis for "数据检验" sections, after KMO and Bartlett: principal-axis factoring of the items'
 * correlation matrix (squared multiple correlations as starting communalities, iterated to convergence), varimax
 * rotation with Kaiser normalisation, and the eigenvalues, loadings, communalities and variance explained a report
 * tables. The number of factors is the caller's, or Kaiser's eigenvalue-above-one rule. Pure computation on complete
 * cases; it reports a Heywood case (a communality above one) instead of hiding it.
 */
import { correlationMatrix, invert } from './psychometrics.ts';

export type FactorSolution = {
  n: number; items: number; factors: number;
  /** Eigenvalues of the correlation matrix, largest first: the scree. */
  eigenvalues: number[];
  /** Rotated loadings, item by factor; each factor's sign makes its loadings sum positive, factors by variance. */
  loadings: number[][];
  communalities: number[];
  /** Sum of squared rotated loadings per factor, its share of the items' total variance, and the running total. */
  variance: { ss: number; share: number; cumulative: number }[];
  iterations: number;
};
export type FactorRefusal = { refused: 'too-few-items' | 'too-few-cases' | 'constant-item' | 'bad-factor-count' | 'not-converged' | 'heywood' };

/** Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations; values largest first, vectors as columns. */
export function symmetricEigen(m: readonly (readonly number[])[]): { values: number[]; vectors: number[][] } {
  const p = m.length, a = m.map(r => [...r]), v: number[][] = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) off += a[i][j] * a[i][j];
    if (off < 1e-30) break;
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
      if (Math.abs(a[i][j]) < 1e-300) continue;
      const theta = (a[j][j] - a[i][i]) / (2 * a[i][j]), t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < p; k++) { const ki = a[k][i], kj = a[k][j]; a[k][i] = c * ki - s * kj; a[k][j] = s * ki + c * kj; }
      for (let k = 0; k < p; k++) { const ik = a[i][k], jk = a[j][k]; a[i][k] = c * ik - s * jk; a[j][k] = s * ik + c * jk; }
      for (let k = 0; k < p; k++) { const ki = v[k][i], kj = v[k][j]; v[k][i] = c * ki - s * kj; v[k][j] = s * ki + c * kj; }
    }
  }
  const order = a.map((row, i) => [row[i], i] as const).sort((x, y) => y[0] - x[0]);
  return { values: order.map(([value]) => value), vectors: v.map(row => order.map(([, i]) => row[i])) };
}

/** Varimax rotation by Kaiser's pairwise angles; with `normalize`, rows are scaled to unit communality while rotating. */
export function varimax(loadings: readonly (readonly number[])[], normalize = true): number[][] {
  const p = loadings.length, k = loadings[0]?.length ?? 0;
  const h = loadings.map(row => Math.sqrt(row.reduce((s, v) => s + v * v, 0)) || 1);
  const l = loadings.map((row, i) => row.map(v => (normalize ? v / h[i] : v)));
  for (let sweep = 0; sweep < 1000; sweep++) {
    let largest = 0;
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      let A = 0, B = 0, C = 0, D = 0;
      for (let i = 0; i < p; i++) {
        const u = l[i][a] * l[i][a] - l[i][b] * l[i][b], v = 2 * l[i][a] * l[i][b];
        A += u; B += v; C += u * u - v * v; D += 2 * u * v;
      }
      const phi = Math.atan2(D - 2 * A * B / p, C - (A * A - B * B) / p) / 4;
      largest = Math.max(largest, Math.abs(phi));
      if (Math.abs(phi) < 1e-15) continue;
      const c = Math.cos(phi), s = Math.sin(phi);
      for (let i = 0; i < p; i++) { const x = l[i][a], y = l[i][b]; l[i][a] = c * x + s * y; l[i][b] = -s * x + c * y; }
    }
    if (largest < 1e-13) break;
  }
  return l.map((row, i) => row.map(v => (normalize ? v * h[i] : v)));
}

/** Factors in a fixed form: each column's loadings sum positive, columns by sum of squares, largest first. */
export function canonical(loadings: readonly (readonly number[])[]): number[][] {
  const k = loadings[0]?.length ?? 0, cols = Array.from({ length: k }, (_, j) => loadings.map(row => row[j]));
  const signed = cols.map(c => (c.reduce((s, v) => s + v, 0) < 0 ? c.map(v => -v) : c));
  const ordered = signed.map(c => [c.reduce((s, v) => s + v * v, 0), c] as const).sort((x, y) => y[0] - x[0]).map(([, c]) => c);
  return loadings.map((_, i) => ordered.map(c => c[i]));
}

/**
 * Principal-axis factoring of a correlation matrix into `factors` factors, before rotation. It iterates to `tolerance`;
 * a fit still moving when the iterations run out is kept if its last change is below `settled` (the precision SPSS
 * and psych accept), and refused only when it has not settled at all.
 */
export function principalAxis(r: readonly (readonly number[])[], factors: number, tolerance = 1e-12, maxIterations = 5000, settled = 1e-6): { loadings: number[][]; communalities: number[]; iterations: number } | FactorRefusal {
  const p = r.length, inverse = invert(r);
  let h = inverse ? inverse.map((row, i) => 1 - 1 / row[i]) : r.map((row, i) => Math.max(...row.filter((_, j) => j !== i).map(Math.abs)));
  let last: { loadings: number[][]; change: number } | null = null;
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const reduced = r.map((row, i) => row.map((v, j) => (i === j ? h[i] : v)));
    const { values, vectors } = symmetricEigen(reduced);
    const loadings = vectors.map(row => row.slice(0, factors).map((v, j) => v * Math.sqrt(Math.max(0, values[j]))));
    const next = loadings.map(row => row.reduce((s, v) => s + v * v, 0));
    if (next.some(v => v > 1 + 1e-9)) return { refused: 'heywood' };
    const change = Math.max(...next.map((v, i) => Math.abs(v - h[i])));
    h = next;
    if (change < tolerance) return { loadings, communalities: h, iterations: iteration };
    last = { loadings, change };
  }
  if (last && last.change < settled) return { loadings: last.loadings, communalities: h, iterations: maxIterations };
  return p ? { refused: 'not-converged' } : { refused: 'too-few-items' };
}

/** EFA of items given as columns of complete cases; `factors` defaults to the number of eigenvalues above one. */
export function exploratoryFactors(columns: readonly (readonly number[])[], factors?: number): FactorSolution | FactorRefusal {
  const p = columns.length, n = columns[0]?.length ?? 0;
  if (p < 3) return { refused: 'too-few-items' };
  if (n <= p || columns.some(c => c.length !== n)) return { refused: 'too-few-cases' };
  const r = correlationMatrix(columns);
  if (!r) return { refused: 'constant-item' };
  const eigenvalues = symmetricEigen(r).values;
  const k = factors ?? Math.max(1, eigenvalues.filter(v => v > 1).length);
  if (!Number.isInteger(k) || k < 1 || k >= p) return { refused: 'bad-factor-count' };
  const extracted = principalAxis(r, k);
  if ('refused' in extracted) return extracted;
  const loadings = canonical(k > 1 ? varimax(extracted.loadings) : extracted.loadings);
  let cumulative = 0;
  const variance = Array.from({ length: k }, (_, j) => {
    const ss = loadings.reduce((s, row) => s + row[j] * row[j], 0), share = ss / p;
    cumulative += share;
    return { ss, share, cumulative };
  });
  return { n, items: p, factors: k, eigenvalues, loadings, communalities: loadings.map(row => row.reduce((s, v) => s + v * v, 0)), variance, iterations: extracted.iterations };
}
