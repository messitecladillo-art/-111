/**
 * Paper-level networks. With cited references available (Web of Science CR), papers are linked by
 * bibliographic coupling: two papers are related when they cite the same works, weighted by the
 * Salton cosine shared / √(refsA · refsB). Without references we fall back to keyword overlap
 * (Jaccard) and say so, because that is a weaker, different relation.
 */
import type { LitRecord } from './parse.ts';
import { forceLayout, louvain } from './network.ts';
import { betweenness, pathfinder } from './metrics.ts';

export type PaperMode = 'coupling' | 'keywords';
export type PaperNode = { id: string; index: number; title: string; year: number | null; citations: number | null; source: string; cluster: number; x: number; y: number; degree: number };
export type PaperLink = { a: number; b: number; shared: number; weight: number };
export type PaperGraph = { mode: PaperMode; nodes: PaperNode[]; links: PaperLink[]; withRefs: number };

export function refCoverage(records: LitRecord[]): number { return records.filter(r => r.refs.length > 0).length; }

/** Pick papers: those matching the focus terms first, then by times cited. */
function selectPapers(records: LitRecord[], docs: string[][], focus: string[], max: number): number[] {
  const f = new Set(focus);
  return records.map((r, i) => ({ i, hit: focus.length ? docs[i].filter(k => f.has(k)).length : 0, c: r.citations ?? 0 }))
    .filter(p => !focus.length || p.hit > 0)
    .sort((a, b) => b.hit - a.hit || b.c - a.c || a.i - b.i)
    .slice(0, max).map(p => p.i);
}

export function paperGraph(records: LitRecord[], docs: string[][], opts: { focus?: string[]; max?: number; minShared?: number; perNode?: number } = {}): PaperGraph {
  const withRefs = refCoverage(records);
  const mode: PaperMode = withRefs >= Math.max(10, records.length * .5) ? 'coupling' : 'keywords';
  const picked = selectPapers(records, docs, opts.focus ?? [], opts.max ?? 140);
  const pairs = new Map<number, number>(), n = picked.length;
  if (mode === 'coupling') {
    const byRef = new Map<string, number[]>();
    picked.forEach((ri, local) => { for (const ref of new Set(records[ri].refs)) { const l = byRef.get(ref) ?? []; l.push(local); byRef.set(ref, l); } });
    for (const list of byRef.values()) if (list.length > 1) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) { const k = list[x] * n + list[y]; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  } else {
    const byTerm = new Map<string, number[]>();
    picked.forEach((ri, local) => { for (const k of docs[ri]) { const l = byTerm.get(k) ?? []; l.push(local); byTerm.set(k, l); } });
    for (const list of byTerm.values()) if (list.length > 1 && list.length < n * .6) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) { const k = list[x] * n + list[y]; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  }
  const minShared = opts.minShared ?? (mode === 'coupling' ? 2 : 2);
  let links: PaperLink[] = [];
  for (const [k, shared] of pairs) {
    if (shared < minShared) continue;
    const a = Math.floor(k / n), b = k % n, ra = records[picked[a]], rb = records[picked[b]];
    const weight = mode === 'coupling' ? shared / Math.sqrt(new Set(ra.refs).size * new Set(rb.refs).size) : shared / (docs[picked[a]].length + docs[picked[b]].length - shared);
    links.push({ a, b, shared, weight });
  }
  // Keep each paper's strongest relations so the graph stays readable.
  const perNode = opts.perNode ?? 6, keep = new Set<PaperLink>(), byNode: PaperLink[][] = Array.from({ length: n }, () => []);
  for (const l of links) { byNode[l.a].push(l); byNode[l.b].push(l); }
  for (const list of byNode) list.sort((x, y) => y.weight - x.weight).slice(0, perNode).forEach(l => keep.add(l));
  links = [...keep];
  const edges: Array<[number, number, number]> = links.map(l => [l.a, l.b, l.weight]);
  const raw = louvain(n, edges);
  const sizes = new Map<number, number>(); raw.forEach(c => sizes.set(c, (sizes.get(c) ?? 0) + 1));
  const degree = new Array(n).fill(0); for (const l of links) { degree[l.a]++; degree[l.b]++; }
  const order = [...sizes].filter(([c]) => raw.some((rc, i) => rc === c && degree[i] > 0)).sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([c]) => c);
  const rank = new Map(order.map((c, i) => [c, i]));
  const cluster = raw.map((c, i) => degree[i] === 0 ? -1 : rank.get(c)!);
  const pos = forceLayout(n, edges, cluster.map(c => c < 0 ? order.length : c), 11, 300);
  const nodes = picked.map((ri, i) => { const r = records[ri]; return { id: r.id, index: ri, title: r.title, year: r.year, citations: r.citations, source: r.source, cluster: cluster[i], x: pos[i].x, y: pos[i].y, degree: degree[i] }; });
  return { mode, nodes, links, withRefs };
}

export type CitedRef = { key: string; label: string; count: number };
/** References cited most often inside the imported set: the shared foundations of this literature. */
export function topCitedReferences(records: LitRecord[], k = 15): CitedRef[] {
  const counts = new Map<string, { n: number; label: string }>();
  for (const r of records) {
    const seen = new Set<string>();
    r.refs.forEach((key, i) => { if (seen.has(key)) return; seen.add(key); const c = counts.get(key) ?? { n: 0, label: r.refLabels[i] }; c.n++; counts.set(key, c); });
  }
  return [...counts].filter(([, c]) => c.n >= 2).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, k).map(([key, c]) => ({ key, label: c.label, count: c.n }));
}

/** "Collins 2007" from a cited-reference string such as "Collins AM, 2007, J VERB LEARN, V8, P240". */
export function refShortLabel(label: string): string {
  const parts = label.split(',').map(p => p.trim());
  const author = (parts[0] ?? '').replace(/\s+[A-Z]{1,3}$/, '').replace(/^\[ANONYMOUS\]$/i, '佚名');
  const year = parts.find(p => /^(19|20)\d{2}$/.test(p));
  const name = author ? author.charAt(0) + author.slice(1).toLowerCase() : label.slice(0, 12);
  return year ? `${name} ${year}` : name;
}
export function refYear(label: string): number | null {
  const m = label.split(',').map(p => p.trim()).find(p => /^(19|20)\d{2}$/.test(p));
  return m ? Number(m) : null;
}

export type CoCitedNode = { key: string; label: string; short: string; year: number | null; count: number; cluster: number; centrality: number; x: number; y: number };
export type CoCitationGraph = { nodes: CoCitedNode[]; links: PaperLink[]; citing: number };

/**
 * Document co-citation (Small, 1973), CiteSpace's default network: the most-cited references in the
 * imported set, linked when the same record cites both. Weight is the cosine count / √(countA·countB).
 */
export function cocitationGraph(records: LitRecord[], opts: { top?: number; minCount?: number; perNode?: number } = {}): CoCitationGraph {
  const top = topCitedReferences(records, opts.top ?? 100).filter(r => r.count >= (opts.minCount ?? 2));
  const idx = new Map(top.map((r, i) => [r.key, i])), n = top.length, pairs = new Map<number, number>();
  let citing = 0;
  for (const r of records) {
    const ids = [...new Set(r.refs.map(k => idx.get(k)).filter((v): v is number => v !== undefined))].sort((a, b) => a - b);
    if (ids.length) citing++;
    for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) { const k = ids[x] * n + ids[y]; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  }
  let links: PaperLink[] = [];
  for (const [k, shared] of pairs) { const a = Math.floor(k / n), b = k % n; links.push({ a, b, shared, weight: shared / Math.sqrt(top[a].count * top[b].count) }); }
  const central = betweenness(n, pathfinder(n, links.map(l => [l.a, l.b, l.shared])).map(i => [links[i].a, links[i].b, 1] as [number, number, number]));
  const perNode = opts.perNode ?? 8, keep = new Set<PaperLink>(), byNode: PaperLink[][] = Array.from({ length: n }, () => []);
  for (const l of links) { byNode[l.a].push(l); byNode[l.b].push(l); }
  for (const list of byNode) list.sort((x, y) => y.weight - x.weight).slice(0, perNode).forEach(l => keep.add(l));
  links = [...keep];
  const edges: Array<[number, number, number]> = links.map(l => [l.a, l.b, l.shared]);
  const raw = louvain(n, edges);
  const degree = new Array(n).fill(0); for (const l of links) { degree[l.a]++; degree[l.b]++; }
  const sizes = new Map<number, number>(); raw.forEach((c, i) => { if (degree[i]) sizes.set(c, (sizes.get(c) ?? 0) + top[i].count); });
  const rank = new Map([...sizes].sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([c], i) => [c, i]));
  const cluster = raw.map((c, i) => degree[i] ? rank.get(c)! : -1);
  const pos = forceLayout(n, edges, cluster.map(c => c < 0 ? rank.size : c), 13, 300);
  const nodes = top.map((r, i) => ({ key: r.key, label: r.label, short: refShortLabel(r.label), year: refYear(r.label), count: r.count, cluster: cluster[i], centrality: central[i], x: pos[i].x, y: pos[i].y }));
  return { nodes, links, citing };
}

/** Per-citing-year counts for cited references, and citing records per year, for burst detection. */
export function referenceYearSeries(records: LitRecord[], keys: Array<{ key: string; label: string }>): { series: Array<{ key: string; label: string; byYear: Map<number, number> }>; totals: Map<number, number> } {
  const want = new Map(keys.map(k => [k.key, { key: k.key, label: k.label, byYear: new Map<number, number>() }])), totals = new Map<number, number>();
  for (const r of records) {
    if (r.year === null || !r.refs.length) continue;
    totals.set(r.year, (totals.get(r.year) ?? 0) + 1);
    for (const k of new Set(r.refs)) { const s = want.get(k); if (s) s.byYear.set(r.year, (s.byYear.get(r.year) ?? 0) + 1); }
  }
  return { series: [...want.values()], totals };
}
