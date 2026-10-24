/**
 * Keyword co-occurrence maps in the spirit of VOSviewer: full-counting co-occurrence, association
 * strength normalization, modularity clustering (Louvain) and a seeded force-directed layout.
 * Everything is deterministic for the same input so a map can be reproduced and cited.
 */
import type { TermIndex } from './terms.ts';
import { betweenness, modularity, pathfinder, silhouette } from './metrics.ts';

export type MapNode = { key: string; label: string; df: number; meanYear: number | null; firstYear: number | null; meanCitations: number | null; cluster: number; strength: number; centrality: number; silhouette: number; x: number; y: number };
export type MapLink = { a: number; b: number; count: number; strength: number };
export type ClusterInfo = { id: number; label: string; size: number; silhouette: number; meanYear: number | null };
export type TermMap = { nodes: MapNode[]; links: MapLink[]; backbone: MapLink[]; clusters: number; clusterInfo: ClusterInfo[]; modularity: number; silhouette: number; totalLinks: number; totalDocs: number; minDf: number };

export function mulberry32(seed: number) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Co-occurrence counts among the selected term keys (number of records containing both). */
export function cooccurrence(docs: string[][], keys: string[]): Map<number, number> {
  const idx = new Map(keys.map((k, i) => [k, i])), out = new Map<number, number>(), n = keys.length;
  for (const doc of docs) {
    const ids = doc.map(k => idx.get(k)).filter((v): v is number => v !== undefined).sort((x, y) => x - y);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const key = ids[i] * n + ids[j]; out.set(key, (out.get(key) ?? 0) + 1); }
  }
  return out;
}

/**
 * Louvain modularity optimisation (two-level, deterministic visiting order). Returns one community
 * id per node; isolated nodes keep singleton communities.
 */
export function louvain(n: number, edges: Array<[number, number, number]>, resolution = 1): number[] {
  let community = Array.from({ length: n }, (_, i) => i);
  let nodes = n, adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (const [a, b, w] of edges) { if (a === b) continue; adj[a].set(b, (adj[a].get(b) ?? 0) + w); adj[b].set(a, (adj[b].get(a) ?? 0) + w); }
  let selfLoops = new Array(n).fill(0);
  for (let level = 0; level < 6; level++) {
    const k = adj.map((m, i) => [...m.values()].reduce((s, w) => s + w, 0) + 2 * selfLoops[i]);
    const m2 = k.reduce((s, v) => s + v, 0);
    if (m2 === 0) break;
    const comm = Array.from({ length: nodes }, (_, i) => i), tot = k.slice();
    const order = Array.from({ length: nodes }, (_, i) => i).sort((a, b) => k[b] - k[a] || a - b);
    let moved = true, pass = 0, anyMove = false;
    while (moved && pass++ < 30) {
      moved = false;
      for (const i of order) {
        const ci = comm[i], weights = new Map<number, number>();
        for (const [j, w] of adj[i]) weights.set(comm[j], (weights.get(comm[j]) ?? 0) + w);
        tot[ci] -= k[i];
        let best = ci, bestGain = (weights.get(ci) ?? 0) - resolution * tot[ci] * k[i] / m2;
        for (const [c, w] of weights) { const gain = w - resolution * tot[c] * k[i] / m2; if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && c < best)) { best = c; bestGain = gain; } }
        tot[best] += k[i];
        if (best !== ci) { comm[i] = best; moved = true; anyMove = true; }
      }
    }
    // Relabel and fold the graph.
    const relabel = new Map<number, number>(); comm.forEach(c => { if (!relabel.has(c)) relabel.set(c, relabel.size); });
    community = community.map(c => relabel.get(comm[c])!);
    if (!anyMove) break;
    const size = relabel.size, nextAdj: Map<number, number>[] = Array.from({ length: size }, () => new Map()), nextSelf = new Array(size).fill(0);
    for (let i = 0; i < nodes; i++) {
      const ci = relabel.get(comm[i])!; nextSelf[ci] += selfLoops[i];
      for (const [j, w] of adj[i]) { const cj = relabel.get(comm[j])!; if (ci === cj) nextSelf[ci] += w / 2; else nextAdj[ci].set(cj, (nextAdj[ci].get(cj) ?? 0) + w); }
    }
    adj = nextAdj; selfLoops = nextSelf; nodes = size;
  }
  return community;
}

/**
 * Fruchterman–Reingold layout with edge weights, seeded start positions grouped by cluster, and a
 * fixed number of cooling steps. Coordinates are returned in [0, 1]; only relative distance matters.
 */
export function forceLayout(n: number, edges: Array<[number, number, number]>, clusters: number[], seed = 7, iterations = 360): Array<{ x: number; y: number }> {
  if (n === 0) return [];
  const rnd = mulberry32(seed), nc = Math.max(...clusters) + 1;
  const pos = clusters.map(c => { const a = (c / Math.max(1, nc)) * Math.PI * 2; return { x: Math.cos(a) * .35 + (rnd() - .5) * .25, y: Math.sin(a) * .35 + (rnd() - .5) * .25 }; });
  const maxW = Math.max(1e-9, ...edges.map(e => e[2]));
  const k = Math.sqrt(1 / n) * .9;
  let temp = .12;
  const disp = pos.map(() => ({ x: 0, y: 0 }));
  for (let it = 0; it < iterations; it++) {
    for (const d of disp) { d.x = 0; d.y = 0; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y; let d2 = dx * dx + dy * dy;
      if (d2 < 1e-9) { dx = (rnd() - .5) * 1e-3; dy = (rnd() - .5) * 1e-3; d2 = dx * dx + dy * dy; }
      const f = (k * k) / d2 * (clusters[i] === clusters[j] ? .8 : 1.1);
      disp[i].x += dx * f; disp[i].y += dy * f; disp[j].x -= dx * f; disp[j].y -= dy * f;
    }
    for (const [a, b, w] of edges) {
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y, d = Math.sqrt(dx * dx + dy * dy) + 1e-9;
      const f = (d * d / k) * (.25 + .75 * w / maxW) / d;
      disp[a].x -= dx * f; disp[a].y -= dy * f; disp[b].x += dx * f; disp[b].y += dy * f;
    }
    for (let i = 0; i < n; i++) {
      // weak gravity keeps disconnected parts on screen
      disp[i].x -= pos[i].x * .9; disp[i].y -= pos[i].y * .9;
      const d = Math.hypot(disp[i].x, disp[i].y) + 1e-9, step = Math.min(d, temp);
      pos[i].x += disp[i].x / d * step; pos[i].y += disp[i].y / d * step;
    }
    temp *= .985;
  }
  const xs = pos.map(p => p.x), ys = pos.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  return pos.map(p => ({ x: (p.x - minX) / span + (1 - (maxX - minX) / span) / 2, y: (p.y - minY) / span + (1 - (maxY - minY) / span) / 2 }));
}

export type MapOptions = { maxTerms?: number; minDf?: number; maxLinks?: number; resolution?: number; seed?: number };

/** Build the keyword map: top terms by frequency, co-occurrence links, clusters ordered by size. */
export function buildTermMap(index: TermIndex, opts: MapOptions = {}): TermMap {
  const maxTerms = opts.maxTerms ?? 100, minDf = opts.minDf ?? 2, maxLinks = opts.maxLinks ?? 500;
  const ranked = [...index.terms.values()].filter(t => t.df >= minDf).sort((a, b) => b.df - a.df || a.key.localeCompare(b.key)).slice(0, maxTerms);
  const keys = ranked.map(t => t.key), n = keys.length;
  const co = cooccurrence(index.docs, keys);
  const links: MapLink[] = [];
  for (const [key, count] of co) {
    const a = Math.floor(key / n), b = key % n;
    // Association strength: observed co-occurrence relative to what the two frequencies alone predict.
    links.push({ a, b, count, strength: count / (ranked[a].df * ranked[b].df) * index.docs.length });
  }
  // Clustering and layout weigh links by raw co-occurrence; association strength alone over-weights
  // single co-occurrences between rare terms.
  const edges: Array<[number, number, number]> = links.map(l => [l.a, l.b, l.count]);
  const raw = louvain(n, edges, opts.resolution ?? 1);
  // Order clusters by summed frequency so the largest gets the first palette slot every time.
  const weight = new Map<number, number>(); raw.forEach((c, i) => weight.set(c, (weight.get(c) ?? 0) + ranked[i].df));
  const degree = new Array(n).fill(0); for (const l of links) { degree[l.a]++; degree[l.b]++; }
  const ordered = [...weight].sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([c]) => c);
  const rank = new Map(ordered.map((c, i) => [c, i]));
  const cluster = raw.map((c, i) => degree[i] === 0 ? -1 : rank.get(c)!);
  const used = [...new Set(cluster.filter(c => c >= 0))].sort((x, y) => x - y), dense = new Map(used.map((c, i) => [c, i]));
  const finalCluster = cluster.map(c => c < 0 ? -1 : dense.get(c)!);
  const pos = forceLayout(n, edges, finalCluster.map(c => c < 0 ? used.length : c), opts.seed ?? 7);
  const strength = new Array(n).fill(0); for (const l of links) { strength[l.a] += l.count; strength[l.b] += l.count; }
  // CiteSpace-style structure measures. Betweenness on the full-counting network is near zero for
  // every term (almost everything co-occurs), so it is computed on the Pathfinder backbone instead.
  const backbone = pathfinder(n, edges).map(i => links[i]);
  const central = betweenness(n, backbone.map(l => [l.a, l.b, l.count] as [number, number, number]));
  const sil = silhouette(n, edges, finalCluster, ranked.map(t => t.df));
  const q = modularity(edges, finalCluster);
  const nodes = ranked.map((t, i) => ({ key: t.key, label: t.label, df: t.df, meanYear: t.meanYear, firstYear: t.byYear.size ? Math.min(...t.byYear.keys()) : null, meanCitations: t.meanCitations, cluster: finalCluster[i], strength: strength[i], centrality: central[i], silhouette: sil.node[i], x: pos[i].x, y: pos[i].y }));
  const clusterInfo = used.map((_, c) => {
    const members = nodes.filter(nd => nd.cluster === c).sort((a, b) => b.df - a.df || a.key.localeCompare(b.key));
    const dated = members.filter(m => m.meanYear !== null);
    const w = dated.reduce((sum, m) => sum + m.df, 0);
    return { id: c, label: members[0]?.label ?? '', size: members.length, silhouette: sil.byCluster.get(c) ?? 0, meanYear: w ? dated.reduce((sum, m) => sum + m.meanYear! * m.df, 0) / w : null };
  });
  const totalLinks = links.length;
  const shown = links.sort((x, y) => y.count - x.count || y.strength - x.strength).slice(0, maxLinks);
  return { nodes, links: shown, backbone, clusters: used.length, clusterInfo, modularity: q, silhouette: sil.mean, totalLinks, totalDocs: index.docs.length, minDf };
}
