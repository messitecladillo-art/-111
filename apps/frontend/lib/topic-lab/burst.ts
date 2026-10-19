/**
 * Kleinberg burst detection for yearly counts, as used by CiteSpace for "keywords / references with
 * the strongest citation bursts". A two-state automaton (baseline rate p0, burst rate s·p0) is fitted
 * by Viterbi; entering the burst state costs γ·ln(n). A burst is a run of years in the burst state and
 * its strength is the log-likelihood gained over staying at the baseline during that run.
 *
 * Bursts describe when a term was unusually frequent relative to its own baseline. They are not a
 * significance test and say nothing about quality.
 */
import { logChoose } from './stats.ts';

export type Burst = { begin: number; end: number; strength: number };
export type BurstOptions = { s?: number; gamma?: number; minDuration?: number };

function cost(r: number, d: number, p: number): number {
  if (d === 0) return 0;
  return -(logChoose(d, r) + r * Math.log(p) + (d - r) * Math.log(1 - p));
}

/**
 * r[t]: records containing the item in period t; d[t]: all records in period t; years[t] labels the periods.
 * Returns bursts in time order.
 */
export function kleinberg(r: number[], d: number[], years: number[], opts: BurstOptions = {}): Burst[] {
  const n = r.length, s = opts.s ?? 2, gamma = opts.gamma ?? 1, minDuration = opts.minDuration ?? 1;
  const R = r.reduce((a, b) => a + b, 0), D = d.reduce((a, b) => a + b, 0);
  if (n < 2 || R === 0 || D === 0) return [];
  const p0 = R / D, p1 = Math.min(s * p0, .9999);
  if (p0 >= p1) return [];
  const c0 = r.map((x, t) => cost(x, d[t], p0)), c1 = r.map((x, t) => cost(x, d[t], p1));
  const up = gamma * Math.log(n);
  // Viterbi over two states, starting in the baseline state.
  let f0 = c0[0], f1 = up + c1[0];
  const back: Array<[number, number]> = [[0, 0]];
  for (let t = 1; t < n; t++) {
    const to0from0 = f0, to0from1 = f1; // leaving a burst is free
    const to1from0 = f0 + up, to1from1 = f1;
    const b0 = to0from0 <= to0from1 ? 0 : 1, b1 = to1from1 <= to1from0 ? 1 : 0;
    const n0 = Math.min(to0from0, to0from1) + c0[t], n1 = Math.min(to1from0, to1from1) + c1[t];
    back.push([b0, b1]); f0 = n0; f1 = n1;
  }
  const states = new Array<number>(n);
  states[n - 1] = f0 <= f1 ? 0 : 1;
  for (let t = n - 1; t > 0; t--) states[t - 1] = back[t][states[t]];
  const bursts: Burst[] = [];
  for (let t = 0; t < n; t++) {
    if (states[t] !== 1) continue;
    let e = t, strength = 0;
    while (e < n && states[e] === 1) { strength += c0[e] - c1[e]; e++; }
    if (e - t >= minDuration && strength > 0) bursts.push({ begin: years[t], end: years[e - 1], strength });
    t = e - 1;
  }
  return bursts;
}

export type BurstRow = { key: string; label: string; first: number; total: number; burst: Burst };

/**
 * Strongest burst per item over a continuous year range (missing years count as zero records).
 * `series` maps each item to its per-year counts; `totals` gives all records per year.
 */
export function strongestBursts(series: Array<{ key: string; label: string; byYear: Map<number, number> }>, totals: Map<number, number>, opts: BurstOptions & { limit?: number; minTotal?: number } = {}): { rows: BurstRow[]; years: number[] } {
  const ys = [...totals.keys()];
  if (!ys.length) return { rows: [], years: [] };
  const lo = Math.min(...ys), hi = Math.max(...ys), years = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const d = years.map(y => totals.get(y) ?? 0);
  const rows: BurstRow[] = [];
  for (const item of series) {
    const r = years.map(y => item.byYear.get(y) ?? 0), total = r.reduce((a, b) => a + b, 0);
    if (total < (opts.minTotal ?? 4)) continue;
    const bursts = kleinberg(r, d, years, opts);
    if (!bursts.length) continue;
    const best = bursts.reduce((a, b) => b.strength > a.strength ? b : a);
    rows.push({ key: item.key, label: item.label, first: years[r.findIndex(v => v > 0)], total, burst: best });
  }
  rows.sort((a, b) => b.burst.strength - a.burst.strength || a.key.localeCompare(b.key));
  return { rows: rows.slice(0, opts.limit ?? 25), years };
}

/** Keyword bursts over the most frequent terms of an index (CiteSpace runs bursts on the network's nodes). */
export function keywordBursts(index: { terms: Map<string, { key: string; label: string; df: number; byYear: Map<number, number> }>; records: Array<{ year: number | null }> }, opts: BurstOptions & { limit?: number; maxTerms?: number } = {}) {
  const totals = new Map<number, number>();
  for (const r of index.records) if (r.year !== null) totals.set(r.year, (totals.get(r.year) ?? 0) + 1);
  const series = [...index.terms.values()].sort((a, b) => b.df - a.df || a.key.localeCompare(b.key)).slice(0, opts.maxTerms ?? 400);
  return strongestBursts(series, totals, opts);
}
