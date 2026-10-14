/**
 * How a registered result reads in a report table: the columns a reader needs, numbers rounded by meaning
 * (counts as integers, percentages to one decimal, p values as "<0.001"), and a cross-tabulation laid out as a
 * matrix rather than one row per cell. The registered result itself is never changed.
 */
import type { ResultSnapshot } from './research-quality.ts';

export type PresentedTable = { headers: string[]; rows: string[][]; note: string };

// Only an explicit percent sign marks a percentage; a bare 比例 or 占比 may hold proportions between 0 and 1.
const isPercent = (header: string) => /%|％|百分/.test(header);
const isCount = (header: string) => /^n$|样本量|频数|人数|计数|个数|有效数/.test(header.trim());
const isP = (header: string) => /^p$|p\s*值|显著性|sig/i.test(header.trim());

/** One cell, rounded according to what its column measures. */
export function formatCell(value: string | number | null, header: string): string {
  if (value === null) return '—';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '—';
  if (isP(header)) return value < 0.001 ? '<0.001' : value.toFixed(3);
  if (isPercent(header)) return value.toFixed(1);
  if (Number.isInteger(value) && (isCount(header) || Math.abs(value) >= 1)) return String(value);
  return Math.abs(value) < 1 ? value.toFixed(3) : value.toFixed(2);
}

const numeric = (v: string | number | null): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const firstSeen = <T>(values: T[]) => [...new Set(values)];
const fixed = (v: string | number | null, digits: number) => numeric(v) === null ? '—' : (v as number).toFixed(digits);
/**
 * Ordered categories such as age bands or frequencies sort by their leading number ("18–24岁" before "25–34岁");
 * at most one label without a number ("从不") goes first. Anything else keeps its registered order.
 */
export function naturalOrder(labels: string[]): string[] {
  const lead = (s: string) => { const m = /\d+(?:\.\d+)?/.exec(s); return m ? Number(m[0]) : null; };
  const unnumbered = labels.filter(l => lead(l) === null);
  if (labels.length < 3 || unnumbered.length > 1 || labels.length - unnumbered.length < 2) return labels;
  return [...unnumbered, ...labels.filter(l => lead(l) !== null).sort((a, b) => lead(a)! - lead(b)!)];
}

function frequency(r: ResultSnapshot): PresentedTable | null {
  if (r.headers.length < 3 || !r.rows.every(row => numeric(row[1]) !== null)) return null;
  const ci = r.headers.length >= 5;
  const rows = r.rows.map(row => [String(row[0]), formatCell(row[1], '频数'), formatCell(row[2], '%'),
    ...(ci ? [numeric(row[3]) !== null && numeric(row[4]) !== null ? `[${formatCell(row[3], '%')}, ${formatCell(row[4], '%')}]` : '—'] : [])]);
  const total = r.rows.reduce((sum, row) => sum + (numeric(row[1]) ?? 0), 0);
  rows.push(['合计', String(total), formatCell(100, '%'), ...(ci ? [''] : [])]);
  return { headers: ['类别', '频数', '占比（%）', ...(ci ? ['95% 置信区间（%）'] : [])], rows, note: '' };
}

function crosstab(r: ResultSnapshot): PresentedTable | null {
  if (r.headers.length < 4 || !r.rows.every(row => numeric(row[2]) !== null)) return null;
  const rowLabels = naturalOrder(firstSeen(r.rows.map(row => String(row[0])))), colLabels = naturalOrder(firstSeen(r.rows.map(row => String(row[1]))));
  if (rowLabels.length * colLabels.length !== r.rows.length) return null;
  const cell = new Map(r.rows.map(row => [`${row[0]}\u0000${row[1]}`, row]));
  const rows = rowLabels.map(rowLabel => {
    let total = 0;
    const cells = colLabels.map(colLabel => {
      const row = cell.get(`${rowLabel}\u0000${colLabel}`)!;
      total += numeric(row[2]) ?? 0;
      return `${formatCell(row[2], '频数')}（${formatCell(row[3], '%')}%）`;
    });
    return [rowLabel, ...cells, String(total)];
  });
  const colTotals = colLabels.map(colLabel => rowLabels.reduce((sum, rowLabel) => sum + (numeric(cell.get(`${rowLabel}\u0000${colLabel}`)![2]) ?? 0), 0));
  rows.push(['合计', ...colTotals.map(String), String(colTotals.reduce((a, b) => a + b, 0))]);
  return { headers: ['', ...colLabels, '合计'], rows, note: '单元格为频数（行内占比）。' };
}

function groups(r: ResultSnapshot): PresentedTable | null {
  if (r.headers.length < 4) return null;
  return {
    headers: ['组别', '样本量', '均值', '标准差', ...(r.headers.length >= 5 ? ['中位数'] : [])],
    // Statistics of one table share two decimals, so 3.00 and 0.61 line up.
    rows: r.rows.map(row => [String(row[0]), formatCell(row[1], 'n'), fixed(row[2], 2), fixed(row[3], 2), ...(r.headers.length >= 5 ? [fixed(row[4], 2)] : [])]),
    note: '',
  };
}

/** The report view of a result. Only the analysis recipes' own layouts are rearranged; anything else keeps every column, only rounded. */
export function presentResult(r: ResultSnapshot): PresentedTable {
  const h = r.headers;
  const special = r.method === 'frequency' && h[1] === '频数' && /%/.test(h[2] ?? '') ? frequency(r)
    : r.method === 'crosstab' && h[2] === '频数' && /%/.test(h[3] ?? '') ? crosstab(r)
      : r.method === 'groups' && h[1] === 'n' && h[2] === '均值' ? groups(r) : null;
  return special ?? { headers: [...r.headers], rows: r.rows.map(row => row.map((value, i) => formatCell(value, r.headers[i] ?? ''))), note: '' };
}

/** Relative column widths from content: CJK characters count double, so headers never wrap one character per line. */
export function columnWeights(table: PresentedTable): number[] {
  const width = (s: string) => [...s].reduce((w, c) => w + (/[⺀-￿]/.test(c) ? 2 : 1), 0);
  return table.headers.map((header, c) => Math.min(28, Math.max(6, width(header) + 2, ...table.rows.map(row => width(row[c] ?? '') + 2))));
}

/** A one-line source note under a figure or table; method caveats are gathered once per section instead. */
export function sourceLine(r: ResultSnapshot): string {
  const kind = r.classification === 'simulated' ? '；模拟数据' : r.classification === 'public' ? '；公开数据' : '；用户提供数据';
  return `资料来源：${r.sourceName}${r.sourceUrl ? `（${r.sourceUrl}）` : ''}；有效样本 n = ${r.n}${r.total !== r.n ? `（共 ${r.total}）` : ''}${kind}。`;
}

/** Method caveats of several results, de-duplicated and joined without doubled punctuation. */
export function sectionNotes(results: readonly ResultSnapshot[]): string {
  // Results of one survey repeat the same caveats; de-duplicate sentence by sentence.
  const sentences = results.flatMap(r => r.warnings).flatMap(w => w.split('。'))
    .map(s => s.trim().replace(/^[；;，,\s]+|[；;，,\s]+$/gu, '')).filter(Boolean);
  const notes = firstSeen(sentences);
  return notes.length ? `注：${notes.join('；')}。` : '';
}
