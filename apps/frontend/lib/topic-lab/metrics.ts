/**
 * Network measures CiteSpace reports alongside its maps:
 * - betweenness centrality (Brandes, unweighted, normalized to [0, 1]); CiteSpace rings nodes ≥ 0.1
 *   as pivots that connect otherwise separate parts of the field;
 * - modularity Q of a partition (weighted); Q > 0.3 is the usual rule of thumb for a clear structure;
 * - silhouette S per node and cluster, using 1 − cosine similarity of co-occurrence profiles;
 *   S > 0.5 is read as reasonable and S > 0.7 as convincing homogeneity.
 * The thresholds are conventions, not tests.
 */
export type Edge = [number, number, number];

export function betweenness(n: number, edges: Edge[]): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) if (a !== b) { adj[a].push(b); adj[b].push(a); }
  const cb = new Array<number>(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack: number[] = [], pred: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Array<number>(n).fill(0), dist = new Array<number>(n).fill(-1);
    sigma[s] = 1; dist[s] = 0;
    const queue = [s];
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h]; stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) { dist[w] = dist[v] + 1; queue.push(w); }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; pred[w].push(v); }
      }
    }
    const delta = new Array<number>(n).fill(0);
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred[w]) delta[v] += sigma[v] / sigma[w] * (1 + delta[w]);
      if (w !== s) cb[w] += delta[w];
    }
  }
  // Undirected: each pair was counted from both ends; normalize by the number of pairs excluding the node.
  const norm = n > 2 ? (n - 1) * (n - 2) : 1;
  return cb.map(v => v / norm);
}

/** Weighted modularity of a partition; nodes with cluster < 0 are ignored. */
export function modularity(edges: Edge[], cluster: number[]): number {
  let m = 0;
  const internal = new Map<number, number>(), degree = new Map<number, number>();
  for (const [a, b, w] of edges) {
    if (cluster[a] < 0 || cluster[b] < 0) continue;
    m += w;
    degree.set(cluster[a], (degree.get(cluster[a]) ?? 0) + w);
    degree.set(cluster[b], (degree.get(cluster[b]) ?? 0) + w);
    if (cluster[a] === cluster[b]) internal.set(cluster[a], (internal.get(cluster[a]) ?? 0) + w);
  }
  if (!m) return 0;
  let q = 0;
  for (const [c, d] of degree) q += (internal.get(c) ?? 0) / m - (d / (2 * m)) ** 2;
  return q;
}

/**
 * Silhouette with distance 1 − cosine of weighted adjacency rows (self weight on the diagonal, so two
 * terms that mostly appear together are close). Singleton clusters score 0 by convention.
 */
export function silhouette(n: number, edges: Edge[], cluster: number[], self: number[]): { node: number[]; byCluster: Map<number, number>; mean: number } {
  const rows: Map<number, number>[] = Array.from({ length: n }, (_, i) => new Map([[i, self[i]]]));
  for (const [a, b, w] of edges) { rows[a].set(b, (rows[a].get(b) ?? 0) + w); rows[b].set(a, (rows[b].get(a) ?? 0) + w); }
  const norms = rows.map(r => Math.sqrt([...r.values()].reduce((s, v) => s + v * v, 0)) || 1);
  const dist = (i: number, j: number) => {
    const [small, big] = rows[i].size < rows[j].size ? [rows[i], rows[j]] : [rows[j], rows[i]];
    let dot = 0; for (const [k, v] of small) { const u = big.get(k); if (u) dot += u * v; }
    return 1 - dot / (norms[i] * norms[j]);
  };
  const members = new Map<number, number[]>();
  cluster.forEach((c, i) => { if (c >= 0) (members.get(c) ?? members.set(c, []).get(c)!).push(i); });
  const node = new Array<number>(n).fill(0);
  for (const [c, list] of members) {
    if (list.length < 2) continue;
    for (const i of list) {
      const a = list.reduce((s, j) => j === i ? s : s + dist(i, j), 0) / (list.length - 1);
      let b = Infinity;
      for (const [c2, other] of members) if (c2 !== c) b = Math.min(b, other.reduce((s, j) => s + dist(i, j), 0) / other.length);
      node[i] = b === Infinity ? 0 : (b - a) / Math.max(a, b, 1e-12);
    }
  }
  const byCluster = new Map<number, number>();
  for (const [c, list] of members) byCluster.set(c, list.reduce((s, i) => s + node[i], 0) / list.length);
  const clustered = cluster.map((c, i) => [c, i]).filter(([c]) => c >= 0).map(([, i]) => i);
  return { node, byCluster, mean: clustered.length ? clustered.reduce((s, i) => s + node[i], 0) / clustered.length : 0 };
}

/**
 * Pathfinder network scaling with r = ∞ and q = n − 1 (Schvaneveldt, 1990), CiteSpace's usual pruning:
 * a link survives unless the two nodes are already joined by a path whose every link is stronger.
 * This equals the union of all maximum spanning trees. Returns the indices of the kept edges.
 */
export function pathfinder(n: number, edges: Edge[]): number[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const order = edges.map((e, i) => i).sort((a, b) => edges[b][2] - edges[a][2] || a - b);
  const kept: number[] = [];
  for (let g = 0; g < order.length;) {
    let h = g; while (h < order.length && edges[order[h]][2] === edges[order[g]][2]) h++;
    // Every link of this strength that joins two still-separate components is on some spanning tree.
    const group = order.slice(g, h).filter(i => find(edges[i][0]) !== find(edges[i][1]));
    kept.push(...group);
    for (const i of group) parent[find(edges[i][0])] = find(edges[i][1]);
    g = h;
  }
  return kept.sort((a, b) => a - b);
}
