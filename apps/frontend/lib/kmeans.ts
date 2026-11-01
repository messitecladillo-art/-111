/**
 * K-means clustering for "聚类与人群画像" sections: k-means++ starts from a seeded generator (the same seed gives the
 * same clusters), Lloyd iterations, the best of several restarts by within-cluster sum of squares, and the silhouette
 * to compare choices of k. Pure computation on complete cases; the caller chooses the variables and standardizes them
 * when their scales differ (`standardize`).
 */
import { seededRandom } from './sampling-core.ts';

export type Clustering = {
  k: number; n: number;
  /** Cluster of each row, 0-based, numbered by size (0 is the largest). */
  assignments: number[];
  centers: number[][];
  sizes: number[];
  /** Within-cluster sum of squared distances. */
  inertia: number;
  iterations: number;
};
export type ClusteringRefusal = { refused: 'too-few-rows' | 'bad-k' | 'uneven-rows' | 'too-few-distinct' };

const distance2 = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);

/** Each column as z-scores (sample standard deviation); a column without variance becomes zeros. */
export function standardize(rows: readonly (readonly number[])[]): number[][] {
  const d = rows[0]?.length ?? 0, n = rows.length;
  const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
  const sd = mean.map((m, j) => Math.sqrt(rows.reduce((s, r) => s + (r[j] - m) ** 2, 0) / Math.max(1, n - 1)));
  return rows.map(r => r.map((v, j) => (sd[j] > 0 ? (v - mean[j]) / sd[j] : 0)));
}

function once(rows: readonly (readonly number[])[], k: number, random: () => number, maxIterations: number) {
  const n = rows.length;
  // k-means++: each next centre drawn with probability proportional to its squared distance from the nearest one.
  const centers = [[...rows[Math.floor(random() * n)]]];
  const nearest = rows.map(r => distance2(r, centers[0]));
  while (centers.length < k) {
    const total = nearest.reduce((s, v) => s + v, 0);
    let target = random() * total, pick = n - 1;
    for (let i = 0; i < n; i++) { target -= nearest[i]; if (target <= 0) { pick = i; break; } }
    centers.push([...rows[pick]]);
    rows.forEach((r, i) => { nearest[i] = Math.min(nearest[i], distance2(r, centers[centers.length - 1])); });
  }
  let assignments = new Array<number>(n).fill(-1), iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    const next = rows.map(r => { let best = 0, bestD = Infinity; centers.forEach((c, j) => { const d = distance2(r, c); if (d < bestD) { bestD = d; best = j; } }); return best; });
    const moved = next.some((a, i) => a !== assignments[i]);
    assignments = next;
    for (let j = 0; j < k; j++) {
      const members = rows.filter((_, i) => assignments[i] === j);
      // An emptied cluster restarts at the row farthest from its own centre, so k clusters always remain.
      if (!members.length) { let far = 0, farD = -1; rows.forEach((r, i) => { const d = distance2(r, centers[assignments[i]]); if (d > farD) { farD = d; far = i; } }); centers[j] = [...rows[far]]; assignments[far] = j; continue; }
      centers[j] = centers[j].map((_, d) => members.reduce((s, r) => s + r[d], 0) / members.length);
    }
    if (!moved) break;
  }
  const inertia = rows.reduce((s, r, i) => s + distance2(r, centers[assignments[i]]), 0);
  return { assignments, centers, inertia, iterations };
}

/** The best of `restarts` k-means++ runs from `seed`. Refuses fewer distinct rows than clusters. */
export function kmeans(rows: readonly (readonly number[])[], k: number, options: { seed?: string; restarts?: number; maxIterations?: number } = {}): Clustering | ClusteringRefusal {
  const n = rows.length, d = rows[0]?.length ?? 0;
  if (n < 3) return { refused: 'too-few-rows' };
  if (!Number.isInteger(k) || k < 2 || k >= n) return { refused: 'bad-k' };
  if (!d || rows.some(r => r.length !== d)) return { refused: 'uneven-rows' };
  if (new Set(rows.map(r => r.join(','))).size < k) return { refused: 'too-few-distinct' };
  const random = seededRandom(options.seed ?? 'evix-kmeans');
  let best = once(rows, k, random, options.maxIterations ?? 300);
  for (let r = 1; r < (options.restarts ?? 10); r++) { const next = once(rows, k, random, options.maxIterations ?? 300); if (next.inertia < best.inertia - 1e-12) best = next; }
  // Number the clusters by size, largest first, so the same data read the same whatever order the starts took.
  const sizes = Array.from({ length: k }, (_, j) => best.assignments.filter(a => a === j).length);
  const order = sizes.map((s, j) => [s, j] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, j]) => j), rank = new Map(order.map((j, i) => [j, i]));
  return { k, n, assignments: best.assignments.map(a => rank.get(a)!), centers: order.map(j => best.centers[j]), sizes: order.map(j => sizes[j]), inertia: best.inertia, iterations: best.iterations };
}

/** Mean silhouette and each row's: (b − a) / max(a, b), with a row alone in its cluster scoring 0 (Rousseeuw 1987). */
export function silhouette(rows: readonly (readonly number[])[], assignments: readonly number[]): { mean: number; perRow: number[] } {
  const k = Math.max(...assignments) + 1, distance = (a: readonly number[], b: readonly number[]) => Math.sqrt(distance2(a, b));
  const perRow = rows.map((r, i) => {
    const sums = new Array<number>(k).fill(0), counts = new Array<number>(k).fill(0);
    rows.forEach((o, j) => { if (j !== i) { sums[assignments[j]] += distance(r, o); counts[assignments[j]]++; } });
    const own = assignments[i];
    if (!counts[own]) return 0;
    const a = sums[own] / counts[own];
    const b = Math.min(...sums.map((s, c) => (c !== own && counts[c] ? s / counts[c] : Infinity)));
    return Number.isFinite(b) ? (b - a) / Math.max(a, b) : 0;
  });
  return { mean: perRow.reduce((s, v) => s + v, 0) / perRow.length, perRow };
}
