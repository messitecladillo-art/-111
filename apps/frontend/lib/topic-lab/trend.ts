/**
 * Term trends from publication years. A term is "rising" only when its share of records in the most
 * recent window is higher than in the earlier window by a two-proportion z-test (|z| ≥ 1.96) and the
 * term has enough records to say so. Everything else is reported as stable or insufficient.
 */
import type { TermIndex } from './terms.ts';

export type TrendSignal = 'rising' | 'falling' | 'stable' | 'insufficient';
export type TermTrend = { key: string; recentDocs: number; earlyDocs: number; recentShare: number; earlyShare: number; ratio: number | null; z: number | null; signal: TrendSignal };
export type CorpusYears = { min: number | null; max: number | null; byYear: Map<number, number>; recentFrom: number | null; recentTotal: number; earlyTotal: number; partialLastYear: boolean; usable: boolean };

export function corpusYears(index: TermIndex, recentYears = 3, today = new Date()): CorpusYears {
  const byYear = new Map<number, number>();
  for (const r of index.records) if (r.year !== null) byYear.set(r.year, (byYear.get(r.year) ?? 0) + 1);
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (!years.length) return { min: null, max: null, byYear, recentFrom: null, recentTotal: 0, earlyTotal: 0, partialLastYear: false, usable: false };
  const max = years[years.length - 1], recentFrom = max - recentYears + 1;
  let recentTotal = 0, earlyTotal = 0;
  for (const [y, n] of byYear) if (y >= recentFrom) recentTotal += n; else earlyTotal += n;
  return { min: years[0], max, byYear, recentFrom, recentTotal, earlyTotal, partialLastYear: max >= today.getFullYear(), usable: recentTotal >= 20 && earlyTotal >= 20 };
}

export function termTrend(index: TermIndex, key: string, cy: CorpusYears, minDocs = 8): TermTrend {
  const t = index.terms.get(key);
  let recentDocs = 0, earlyDocs = 0;
  if (t && cy.recentFrom !== null) for (const [y, n] of t.byYear) if (y >= cy.recentFrom) recentDocs += n; else earlyDocs += n;
  const recentShare = cy.recentTotal ? recentDocs / cy.recentTotal : 0, earlyShare = cy.earlyTotal ? earlyDocs / cy.earlyTotal : 0;
  if (!cy.usable || recentDocs + earlyDocs < minDocs) return { key, recentDocs, earlyDocs, recentShare, earlyShare, ratio: earlyShare ? recentShare / earlyShare : null, z: null, signal: 'insufficient' };
  const p = (recentDocs + earlyDocs) / (cy.recentTotal + cy.earlyTotal);
  const se = Math.sqrt(p * (1 - p) * (1 / cy.recentTotal + 1 / cy.earlyTotal));
  const z = se > 0 ? (recentShare - earlyShare) / se : 0;
  const signal: TrendSignal = z >= 1.96 ? 'rising' : z <= -1.96 ? 'falling' : 'stable';
  return { key, recentDocs, earlyDocs, recentShare, earlyShare, ratio: earlyShare ? recentShare / earlyShare : null, z, signal };
}

export const SIGNAL_LABELS: Record<TrendSignal, string> = { rising: '近期占比显著上升', falling: '近期占比显著下降', stable: '无显著变化', insufficient: '样本不足以判断' };
