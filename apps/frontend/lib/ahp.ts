/**
 * The analytic hierarchy process for "方案优先级" sections: the weights a pairwise comparison matrix implies (its
 * principal eigenvector, normalised to sum to one), λmax, the consistency index CI = (λmax − n)/(n − 1) and the
 * consistency ratio CR = CI / RI with Saaty's random index. CR below 0.1 is the conventional threshold; the caller
 * reports it, it does not certify the judgements. Pure computation; the comparisons come from the user's experts.
 */

/** Saaty's random consistency index for n = 1…15 (Saaty 1980; values for n ≥ 11 from the extended table). */
export const RANDOM_INDEX = [0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59] as const;

export type Ahp = { weights: number[]; lambdaMax: number; ci: number; ri: number; cr: number | null; consistent: boolean };
export type AhpRefusal = { refused: 'too-small' | 'too-large' | 'not-square' | 'not-positive' | 'not-reciprocal' };

/**
 * Weights and consistency of a pairwise comparison matrix: square, positive, with aᵢᵢ = 1 and aⱼᵢ = 1/aᵢⱼ. Power
 * iteration converges to the principal eigenvector of a positive matrix (Perron–Frobenius).
 */
export function ahp(matrix: readonly (readonly number[])[]): Ahp | AhpRefusal {
  const n = matrix.length;
  if (n < 2) return { refused: 'too-small' };
  if (n > RANDOM_INDEX.length) return { refused: 'too-large' };
  if (matrix.some(row => row.length !== n)) return { refused: 'not-square' };
  if (matrix.some(row => row.some(v => !(v > 0) || !Number.isFinite(v)))) return { refused: 'not-positive' };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Math.abs(matrix[i][j] * matrix[j][i] - 1) > 1e-6) return { refused: 'not-reciprocal' };
  let w = new Array<number>(n).fill(1 / n), lambda = n;
  for (let iteration = 0; iteration < 1000; iteration++) {
    const next = matrix.map(row => row.reduce((s, v, j) => s + v * w[j], 0));
    const total = next.reduce((s, v) => s + v, 0);
    lambda = total;
    const normalised = next.map(v => v / total), change = normalised.reduce((s, v, i) => s + Math.abs(v - w[i]), 0);
    w = normalised;
    if (change < 1e-15) break;
  }
  // With w summing to one, Σ(Aw)ᵢ is λmax at convergence.
  const ci = n > 2 ? (lambda - n) / (n - 1) : 0, ri = RANDOM_INDEX[n - 1], cr = ri > 0 ? ci / ri : null;
  return { weights: w, lambdaMax: lambda, ci, ri, cr, consistent: cr === null || cr < 0.1 };
}
