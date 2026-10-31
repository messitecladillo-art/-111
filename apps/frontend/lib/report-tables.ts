/**
 * How a registered result reads in a report table: the columns a reader needs, numbers rounded by meaning
 * (counts as integers, percentages to one decimal, p values as "<0.001"), and a cross-tabulation laid out as a
 * matrix rather than one row per cell. The registered result itself is never changed.
 */
import type { ReportBlock, ResultSnapshot } from './research-quality.ts';
import { mergeSpans } from './sampling-selection.ts';

export type PresentedTable = { headers: string[]; rows: string[][]; note: string };

// Only an explicit percent sign marks a percentage; a bare 比例 or 占比 may hold proportions between 0 and 1.
const isPercent = (header: string) => /%|％|百分/.test(header);
const isCount = (header: string) => /^n$|样本量|频数|人数|计数|个数|有效数|份数/.test(header.trim());
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

// Rating and frequency answers, scored from most negative (1) to most positive (5).
const SCALE_STEPS: readonly [RegExp, number][] = [
  [/^(?:从不|从来不|从未|没有过)/u, 1], [/^(?:很少|极少|偶尔|几乎不)/u, 2], [/^(?:有时|时而)/u, 3], [/^(?:经常|常常|频繁)/u, 4], [/^(?:总是|每次|一直|几乎总是)/u, 5],
  [/^(?:非常|十分|极其|完全|很|特别)(?:不|没)/u, 1], [/^(?:(?:比较|较|有点|有些)(?:不|没)|不太|不大|不怎么|不是很)/u, 2],
  [/^(?:一般|中立|中等|说不清|不确定|无所谓|还行|普通|中性)$/u, 3],
  [/^(?:非常|十分|极其|完全|很|特别)/u, 5], [/^(?:比较|较|还算|基本|有点|有些)/u, 4], [/^(?:不|没)/u, 2],
];
const MODIFIER = /^(?:非常|十分|极其|完全|很|特别|比较|较|还算|基本|有点|有些|不太|不大|不怎么|不是很|不|没)+/u;
/**
 * Scores of rating-scale answers ("非常不满意" … "非常满意", "从不" … "总是") from 1 (most negative or least often)
 * to 5, with 3 neutral; null when the labels are not one scale.
 */
export function scaleScores(labels: readonly string[]): Map<string, number> | null {
  if (labels.length < 3) return null;
  const cores = new Set(labels.map(l => l.replace(MODIFIER, '')).filter(Boolean));
  const scored = labels.map(label => {
    const step = SCALE_STEPS.find(([pattern]) => pattern.test(label));
    // A bare word ("满意") is the positive step only when the other answers modify that same word.
    const bare = !step && cores.has(label) && labels.some(other => other !== label && other.endsWith(label) && MODIFIER.test(other));
    return [label, step ? step[1] : bare ? 4 : null] as const;
  });
  if (scored.some(([, score]) => score === null) || new Set(scored.map(([, score]) => score)).size !== scored.length) return null;
  return new Map(scored as (readonly [string, number])[]);
}
/** Rating-scale answers in scale order, or null when the labels are not one scale. */
export function scaleOrder(labels: readonly string[]): string[] | null {
  const scores = scaleScores(labels);
  return scores && [...labels].sort((a, b) => scores.get(a)! - scores.get(b)!);
}
const RESIDUAL = /^(?:其他|其它)|^(?:以上都不是|以上均不是|都不是|不清楚|不知道|说不清|拒绝回答|拒答|未回答|无|没有)$/u;
/**
 * The reading order of answer categories: a rating scale or numbered bands in their natural order (ordinal), otherwise
 * the registered order with catch-all answers such as "其他" moved to the end.
 */
export function categoryOrder(labels: string[]): { labels: string[]; ordinal: boolean } {
  const scale = scaleOrder(labels);
  if (scale) return { labels: scale, ordinal: true };
  const natural = naturalOrder(labels);
  if (natural !== labels) return { labels: natural, ordinal: true };
  return { labels: [...labels.filter(l => !RESIDUAL.test(l)), ...labels.filter(l => RESIDUAL.test(l))], ordinal: false };
}

function frequency(r: ResultSnapshot): PresentedTable | null {
  if (r.headers.length < 3 || !r.rows.every(row => numeric(row[1]) !== null)) return null;
  const ci = r.headers.length >= 5;
  // Categories in reading order (scale order, "其他" last); repeated labels keep the registered order.
  const at = new Map(r.rows.map(row => [String(row[0]), row]));
  const ordered = at.size === r.rows.length ? categoryOrder([...at.keys()]).labels.map(label => at.get(label)!) : r.rows;
  const rows = ordered.map(row => [String(row[0]), formatCell(row[1], '频数'), formatCell(row[2], '%'),
    ...(ci ? [numeric(row[3]) !== null && numeric(row[4]) !== null ? `[${formatCell(row[3], '%')}, ${formatCell(row[4], '%')}]` : '—'] : [])]);
  const total = r.rows.reduce((sum, row) => sum + (numeric(row[1]) ?? 0), 0);
  rows.push(['合计', String(total), formatCell(100, '%'), ...(ci ? [''] : [])]);
  return { headers: ['类别', '频数', '占比（%）', ...(ci ? ['95% 置信区间（%）'] : [])], rows, note: '' };
}

/**
 * Row and column order of a crosstab, shared by its table and figure: ordinal categories in scale order; nominal
 * columns by overall frequency, so the most common answer comes first, with "其他" last.
 */
export function crosstabOrder(r: ResultSnapshot): { rows: string[]; cols: string[]; colsOrdinal: boolean } {
  const rows = categoryOrder(firstSeen(r.rows.map(row => String(row[0])))).labels, cols = categoryOrder(firstSeen(r.rows.map(row => String(row[1]))));
  if (cols.ordinal) return { rows, cols: cols.labels, colsOrdinal: true };
  const total = (col: string) => r.rows.reduce((sum, row) => sum + (String(row[1]) === col ? numeric(row[2]) ?? 0 : 0), 0);
  const residual = (col: string) => RESIDUAL.test(col) ? 1 : 0;
  return { rows, cols: [...cols.labels].sort((a, b) => residual(a) - residual(b) || total(b) - total(a)), colsOrdinal: false };
}

function crosstab(r: ResultSnapshot): PresentedTable | null {
  if (r.headers.length < 4 || !r.rows.every(row => numeric(row[2]) !== null)) return null;
  const { rows: rowLabels, cols: colLabels } = crosstabOrder(r);
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

/** Group rows in reading order: ordered groups (age bands, rating levels) sort naturally; others keep their order, "其他" last. */
export function groupRows(r: ResultSnapshot): ResultSnapshot['rows'] {
  const order = categoryOrder(r.rows.map(row => String(row[0])));
  if (new Set(order.labels).size !== r.rows.length) return r.rows;
  return order.labels.map(label => r.rows.find(row => String(row[0]) === label)!);
}

function groups(r: ResultSnapshot): PresentedTable | null {
  if (r.headers.length < 4) return null;
  return {
    headers: ['组别', '样本量', '均值', '标准差', ...(r.headers.length >= 5 ? ['中位数'] : [])],
    // Statistics of one table share two decimals, so 3.00 and 0.61 line up.
    rows: groupRows(r).map(row => [String(row[0]), formatCell(row[1], 'n'), fixed(row[2], 2), fixed(row[3], 2), ...(r.headers.length >= 5 ? [fixed(row[4], 2)] : [])]),
    note: '',
  };
}

/** The report view of a result. Only the analysis recipes' own layouts are rearranged; anything else keeps every column, only rounded. */
/** A "注：" paragraph right after a table or figure is that exhibit's note: set small and unindented, before its source line. */
export const isExhibitNote = (blocks: readonly ReportBlock[], index: number): boolean =>
  blocks[index]?.kind === 'paragraph' && /^注[：:]/u.test(blocks[index].text) && (blocks[index - 1]?.kind === 'chart' || blocks[index - 1]?.kind === 'table');

/**
 * Where an exhibit's source line goes: "own" right after it, "note" after its note, "shared" after the next exhibit of
 * the same result (a table and its figure share one source, the table's note between them).
 */
export function sourcePlacement(blocks: readonly ReportBlock[], index: number): 'own' | 'note' | 'shared' {
  const noted = isExhibitNote(blocks, index + 1), next = blocks[index + (noted ? 2 : 1)];
  if (next && (next.kind === 'chart' || next.kind === 'table') && next.evidenceId === blocks[index].evidenceId) return 'shared';
  return noted ? 'note' : 'own';
}

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
  // A sampling frame is part of the design, not a sample: no sample size or data class to report.
  if (r.method === 'sampling-frame') return '资料来源：本研究抽样设计。';
  // AHP weighs experts' judgements: its n is the number of criteria, not a sample.
  if (r.method === 'ahp') return `资料来源：${r.sourceName}（${r.n} 项准则）。`;
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

/**
 * Row spans for a table whose leading columns repeat a parent unit on every child row, as a sampling frame does:
 * 0 marks a cell covered by the merged cell above it. Other tables are not merged (null).
 */
export function tableSpans(r: ResultSnapshot, table: PresentedTable): number[][] | null {
  if (r.method !== 'sampling-frame' || table.rows.length < 2) return null;
  return mergeSpans(table.rows);
}
