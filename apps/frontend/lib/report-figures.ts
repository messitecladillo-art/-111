/**
 * Report figures drawn from registered results with ECharts' server-side SVG renderer, so the same figure is
 * produced in the preview, the Word export and the tests.
 *
 * One hue per report: every colour is a shade or tint of the report accent, so figures never bring colours of their
 * own and stay distinguishable in greyscale print. The figure type follows the result — a short composition becomes a
 * ring, a crosstab becomes 100 % stacked bars of row shares (a heat map when it has many columns), group means carry
 * ±1 SD whiskers, a numeric variable becomes a five-number box — and the canvas height follows the content.
 */
import type { CustomSeriesOption, EChartsOption, SeriesOption } from 'echarts';
import type { ResultSnapshot } from './research-quality.ts';
import { assertTrueVector } from './svg-safety.ts';
import { diagramSnapshotSVG, isDiagramMethod } from './diagram-figures.ts';
import { canChart, conformalCalibrationPlot, forestPlot, ipaPlot, kanoQuadrantPlot, methodFigure, mirroredGroupComparePlot, psmLovePlot } from './method-figures.ts';
import { renderResourceLibraryReportSvg } from './resource-library/snapshot-vector-bridge.ts';
import type { FigureInk } from './figure-palette.ts';
import { categoryOrder, crosstabOrder, groupRows } from './report-tables.ts';
import { normalizeAcademicPunctuation } from './typography.ts';

/** Every figure is this wide; at the full text width (14.64 cm) 22 px text prints at about 9.5 pt. */
export const FIGURE_WIDTH = 960;
export const FONT = 'Times New Roman, SimSun, Songti SC, serif';
export const INK = '#1F2329', AXIS = '#3A4049', GRID = '#E3E6EA';

export type FigureKind = 'bars' | 'barsHorizontal' | 'ring' | 'stacked' | 'heatmap' | 'grouped' | 'means' | 'box' | 'coefficient'
  /** Figures of the advanced methods (lib/method-figures.ts). */
  | 'forest' | 'scree' | 'quadrant' | 'profile' | 'dots' | 'likert' | 'correlation' | 'radar' | 'pareto';
export type FigurePlan = { kind: FigureKind; height: number; option: EChartsOption };

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const mix = (a: string, b: string, t: number) => { const x = channels(a), y = channels(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
/** k colours of the accent's hue, evenly spaced from a deep shade to a light tint. */
export function accentScale(accent: string, k: number): string[] {
  if (k <= 1) return [accent.toUpperCase()];
  const dark = Math.min(0.35, 0.1 * (k - 1)), light = Math.min(0.75, 0.5 + 0.05 * (k - 2));
  return Array.from({ length: k }, (_, i) => {
    const t = -dark + (dark + light) * i / (k - 1);
    return t < 0 ? mix(accent, '#000000', -t) : mix(accent, '#FFFFFF', t);
  });
}
/** The main colour of an ink: the accent, or the palette's primary. */
export const inkPrimary = (ink: FigureInk) => (typeof ink === 'string' ? ink : ink.primary);
/** The other side of a scale with a real midpoint (disagreement, negative correlation). */
export const inkOpposite = (ink: FigureInk) => (typeof ink === 'string' ? '#A65A3A' : ink.opposite);
/**
 * Colours of k categories. Ordered ones (a rating scale, numbered bands) are one hue's lightness ramp; unordered ones
 * take the palette's hues in turn, then their tints. With an accent alone every set is its ramp, as before.
 */
export function categoryColors(ink: FigureInk, k: number, ordinal: boolean): string[] {
  const primary = inkPrimary(ink);
  if (ordinal) return accentScale(primary, k).reverse();
  if (typeof ink === 'string') return accentScale(primary, k);
  const hues = [ink.primary, ink.secondary, ink.opposite];
  return Array.from({ length: k }, (_, i) => (i < hues.length ? hues[i] : mix(hues[i % hues.length], '#FFFFFF', Math.min(0.75, 0.4 + 0.2 * (Math.floor(i / hues.length) - 1)))));
}
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Ink or white, whichever contrasts more with a fill. */
export const onFill = (fill: string) => luminance(fill) > 0.21 ? INK : '#FFFFFF';

const numeric = (v: string | number | null): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const width = (s: string) => [...s].reduce((w, c) => w + (/[⺀-￿]/.test(c) ? 2 : 1), 0);
const isPercent = (header: string) => /%|％|百分/.test(header);

/**
 * Wrap CJK/mixed category labels into balanced lines <= maxUnits (2 units = 1 CJK char)
 * without leaving 1-character orphans or splitting sample-size "(n = ...)" suffixes.
 */
export function wrapLabel(raw: string, maxUnits: number): string {
  const clean = raw.trim();
  if (!clean || width(clean) <= maxUnits) return clean;
  const nMatch = /^(.*?)([（(]n\s*=\s*\d+[）)])$/u.exec(clean);
  if (nMatch) {
    const head = nMatch[1].trim(), tail = nMatch[2];
    if (width(head) <= maxUnits && width(tail) <= maxUnits) return `${head}\n${tail}`;
    const headLines = wrapLabel(head, maxUnits).split('\n');
    const last = headLines.at(-1)!;
    if (width(last) + width(tail) <= maxUnits + 2) {
      headLines[headLines.length - 1] = `${last}${tail}`;
      return headLines.join('\n');
    }
    return `${headLines.join('\n')}\n${tail}`;
  }
  if (width(clean) <= maxUnits * 2) {
    const suffixMatch = /^(.{2,}?)(清晰度均值|便利性均值|易读性均值|可见性均值|认同均值|满意度|清晰度|便利性|可见性|完整性|配合度|可达性|遵从度|完好性|牢固性|适宜性|辨识度|认同|均值|评分|得分|倾向)$/u.exec(clean);
    if (suffixMatch && width(suffixMatch[1]) >= 4 && width(suffixMatch[1]) <= maxUnits && width(suffixMatch[2]) <= maxUnits) {
      return `${suffixMatch[1]}\n${suffixMatch[2]}`;
    }
  }
  const tokens = clean.match(/[A-Za-z0-9.%+-]+|./gu) ?? [clean];
  const total = width(clean), lineCount = Math.max(2, Math.ceil(total / maxUnits));
  const target = Math.min(maxUnits, Math.ceil(total / lineCount) + 1);
  const lines: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    if (cur && width(cur) + width(tok) > (lines.length < lineCount - 1 ? target : maxUnits)) {
      lines.push(cur);
      cur = tok;
    } else {
      cur += tok;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length >= 2 && width(lines.at(-1)!) <= 2 && [...lines.at(-2)!].length >= 3) {
    const prevChars = [...lines[lines.length - 2]];
    const moved = prevChars.pop()!;
    lines[lines.length - 2] = prevChars.join('');
    lines[lines.length - 1] = moved + lines[lines.length - 1];
  }
  return lines.join('\n');
}

function niceUpperBound(high: number, ticks = 5): number {
  if (!(high > 0)) return 1;
  const raw = high / ticks, power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(v => v >= raw * 0.999)!;
  return Number((Math.ceil(high / step) * step).toPrecision(12));
}
/** Axis titles in report style: "有效样本占比 (%)" → "占比（%）". */
const axisName = (header: string) => header.replace(/\s*[（(]\s*[%％]\s*[)）]/u, '（%）').replace(/^有效样本占比/u, '占比');
/** Negative numbers take a true minus sign, as in the text. */
export const minus = (s: string) => s.replace(/^-(?=\d)/, '−');
const format = (v: number, percent: boolean, integer: boolean) => minus(percent ? `${v.toFixed(1)}%` : integer ? String(Math.round(v)) : v.toFixed(2));
// Axis ticks without thousands commas (four-digit numbers stand unseparated) and free of binary noise such as 0.30000000000000004.
export const tickLabel = (v: number) => minus(String(Number(v.toPrecision(12))));
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(v)));
const rowsHeight = (rows: number, perRow: number, extra: number) => clamp(extra + perRow * rows, 300, 760);

export const text = { color: INK, fontFamily: FONT, fontSize: 22 };
export const small = { ...text, fontSize: 20 };
export const base = (): EChartsOption => ({ animation: false, backgroundColor: '#FFFFFF', textStyle: text, tooltip: { show: false } });
export const grid = (extra: Record<string, unknown> = {}) => ({ left: 24, right: 40, top: 40, bottom: 24, outerBoundsMode: 'same' as const, outerBoundsContain: 'all' as const, ...extra });
export const legend = { top: 0, left: 'center', textStyle: small, itemWidth: 18, itemHeight: 12, itemGap: 20 };
export const valueAxis = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'value' as const, name, nameTextStyle: { ...small, padding: [0, 0, 4, 0] },
  axisLine: { show: true, lineStyle: { color: AXIS } }, axisTick: { show: true, lineStyle: { color: AXIS } },
  axisLabel: { ...small, formatter: tickLabel }, splitLine: { show: true, lineStyle: { color: GRID, type: 'dashed' as const } }, ...extra,
});
// Sample sizes in labels read "（n = 97）" with an italic n, spaced like every other "n = …" in the report.
const withItalicN = (v: string) => v.replace(/（n = /gu, '（{n|n} = ');
const italicN = { formatter: withItalicN, rich: { n: { ...small, fontStyle: 'italic' as const } } };
export const categoryAxis = (labels: string[], horizontal: boolean, maxHorizontalPx = 320) => {
  const slotPx = horizontal ? maxHorizontalPx : Math.max(76, Math.floor(760 / Math.max(1, labels.length)));
  const maxUnits = Math.max(8, Math.floor(slotPx / 10));
  return {
    type: 'category' as const, data: labels, axisLine: { show: true, onZero: false, lineStyle: { color: AXIS } }, axisTick: { show: false },
    axisLabel: {
      ...small, lineHeight: 25, interval: 0,
      formatter: (v: string) => withItalicN(wrapLabel(v, maxUnits)),
      rich: italicN.rich,
      overflow: 'break' as const,
      width: slotPx + 16,
    },
    ...(horizontal ? { inverse: true } : {}),
  };
};
// Horizontal value axes carry their title underneath, clear of the value labels at the bar ends.
export const lowerTitle = { nameLocation: 'middle' as const, nameGap: 36 };
type Label = { value: unknown };

/** One series of bars in the accent; long or many labels lie horizontally so they stay readable. */
function bars(labels: string[], values: number[], header: string, accent: string): FigurePlan {
  const percent = isPercent(header), integer = values.every(Number.isInteger);
  const horizontal = labels.length > 7 || Math.max(...labels.map(width)) > 12 || (percent && labels.length >= 4);
  const finite = values.filter(Number.isFinite);
  const avg = finite.length ? finite.reduce((s, v) => s + v, 0) / finite.length : 0;
  const maxVal = finite.length ? Math.max(0, ...finite) : 0, minVal = finite.length ? Math.min(0, ...finite) : 0;
  const hasSpread = finite.length >= 3 && Math.max(...finite) > Math.min(...finite);
  const radius = horizontal ? [6, 6, 6, 6] : [5, 5, 0, 0];
  const xHeadroom = horizontal && minVal >= 0 && maxVal > 0 ? { min: 0, max: niceUpperBound(maxVal * 1.18, 6) } : {};
  const series: SeriesOption[] = [{
    type: 'bar', data: values, barMaxWidth: horizontal ? 26 : 60, barCategoryGap: horizontal ? '42%' : '38%',
    showBackground: true,
    backgroundStyle: { color: horizontal ? '#EAEFF5' : '#F1F5F9', borderRadius: radius },
    itemStyle: { color: accent, borderRadius: radius },
    label: { show: true, position: horizontal ? 'right' : 'top', distance: horizontal ? 8 : 5, ...small, formatter: (p: Label) => format(Number(p.value), percent, integer) },
  }];
  if (hasSpread) {
    const avgLabel = `均值 ${format(avg, percent, integer)}`;
    series.push({
      type: 'custom', clip: false, silent: true, z: 4, data: [[avg]],
      renderItem: (params, api) => {
        const area = (params as unknown as { coordSys: { x: number; y: number; width: number; height: number } }).coordSys;
        if (horizontal) {
          const px = api.coord([avg, 0])[0];
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: px, y1: area.y, x2: px, y2: area.y + area.height }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [5, 4], opacity: 0.72 } },
              { type: 'text', x: px, y: area.y - 8, style: { text: avgLabel, fill: AXIS, stroke: '#FFFFFF', lineWidth: 3, fontSize: 17, fontFamily: FONT, align: 'center', verticalAlign: 'bottom' } },
            ],
          } as unknown as ReturnType<NonNullable<CustomSeriesOption['renderItem']>>;
        }
        const py = api.coord([0, avg])[1];
        return {
          type: 'group',
          children: [
            { type: 'line', shape: { x1: area.x, y1: py, x2: area.x + area.width, y2: py }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [5, 4], opacity: 0.72 } },
            { type: 'text', x: area.x + area.width, y: py - 6, style: { text: avgLabel, fill: AXIS, stroke: '#FFFFFF', lineWidth: 3, fontSize: 17, fontFamily: FONT, align: 'right', verticalAlign: 'bottom' } },
          ],
        } as unknown as ReturnType<NonNullable<CustomSeriesOption['renderItem']>>;
      },
    });
  }
  return horizontal
    ? { kind: 'barsHorizontal', height: rowsHeight(labels.length, 46, 122), option: { ...base(), grid: grid({ top: hasSpread ? 54 : 40, right: 48 }), xAxis: valueAxis(axisName(header), { ...lowerTitle, ...xHeadroom }), yAxis: categoryAxis(labels, true, 320), series } }
    : { kind: 'bars', height: 460, option: { ...base(), grid: grid({ top: 56, right: 40 }), xAxis: categoryAxis(labels, false), yAxis: valueAxis(axisName(header)), series } };
}

/** A composition of two to four answers: a ring in shades of the accent, with the sample size at its centre. */
function ring(labels: string[], values: number[], shares: number[], total: number, ordinal: boolean, ink: FigureInk): FigurePlan {
  const longLabels = Math.max(0, ...labels.map(width)) > 28;
  const height = longLabels ? 440 : 430, colors = categoryColors(ink, labels.length, ordinal);
  const formatCount = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return { kind: 'ring', height, option: {
    ...base(), color: colors,
    series: [{
      type: 'pie', radius: longLabels ? ['36%', '58%'] : ['40%', '64%'], center: ['50%', '52%'], startAngle: 90, avoidLabelOverlap: true,
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 3, borderRadius: 4 },
      label: {
        show: true, ...small, lineHeight: 26, overflow: 'break', width: 236,
        formatter: (p: { dataIndex: number }) => `${wrapLabel(labels[p.dataIndex], 22)}\n${shares[p.dataIndex].toFixed(1)}% (${formatCount(values[p.dataIndex])})`,
      },
      labelLine: { show: true, length: longLabels ? 14 : 18, length2: longLabels ? 18 : 24, lineStyle: { color: AXIS } },
      data: labels.map((name, i) => ({ name, value: values[i] })),
    }],
    graphic: [{ type: 'text', x: FIGURE_WIDTH / 2, y: height * 0.52, style: { text: `{n|n} = ${total}`, rich: { n: { fill: INK, fontSize: 24, fontFamily: FONT, fontStyle: 'italic' } }, fill: INK, fontSize: 24, fontFamily: FONT, align: 'center', verticalAlign: 'middle' } }],
  } };
}

function frequency(r: ResultSnapshot, column: number, ink: FigureInk): FigurePlan {
  const hasCounts = r.rows.every(row => numeric(row[1]) !== null);
  const readColumn = column === 2 && hasCounts ? 1 : column;
  const at = new Map(r.rows.map(row => [String(row[0]), numeric(row[readColumn])!]));
  const shareAt = column === 2 && hasCounts ? new Map(r.rows.map(row => [String(row[0]), numeric(row[2])])) : null;
  const order = at.size === r.rows.length ? categoryOrder([...at.keys()]) : { labels: r.rows.map(row => String(row[0])), ordinal: false };
  const values = order.labels.map(label => at.get(label)!), sum = values.reduce((a, b) => a + b, 0);
  const counts = r.rows.reduce((a, row) => a + (numeric(row[1]) ?? 0), 0);
  if (order.labels.length >= 2 && order.labels.length <= 3 && (column === 1 || column === 2) && sum > 0 && values.every(v => v >= 0)) {
    const shares = order.labels.map((label, i) => shareAt?.get(label) ?? (values[i] / sum * 100));
    return ring(order.labels, values.map(v => Math.round(v)), shares, Math.round(counts), order.ordinal, ink);
  }
  const barValues = column === 2 && hasCounts ? order.labels.map((label, i) => shareAt?.get(label) ?? values[i]) : values;
  return bars(order.labels, barValues, r.headers[column], inkPrimary(ink));
}

type Cells = { rows: string[]; cols: string[]; colsOrdinal: boolean; at: Map<string, (string | number | null)[]>; rowTotals: number[] };
function crosstabCells(r: ResultSnapshot): Cells | null {
  const { rows, cols, colsOrdinal } = crosstabOrder(r);
  if (rows.length * cols.length !== r.rows.length || r.rows.length > 120) return null;
  const at = new Map(r.rows.map(row => [`${row[0]}\u0000${row[1]}`, row]));
  if (r.rows.some(row => numeric(row[2]) === null || numeric(row[3]) === null)) return null;
  const rowTotals = rows.map(row => cols.reduce((s, c) => s + (numeric(at.get(`${row}\u0000${c}`)![2]) ?? 0), 0));
  return { rows, cols, colsOrdinal, at, rowTotals };
}
const cell = (c: Cells, row: string, col: string, index: number) => numeric(c.at.get(`${row}\u0000${col}`)![index])!;
const withN = (c: Cells) => c.rows.map((row, i) => `${row}（n = ${c.rowTotals[i]}）`);

/** Row shares as 100 % stacked bars: each group's answers side by side, read against the same 0–100 scale. */
function stacked(c: Cells, ink: FigureInk): FigurePlan {
  const colors = categoryColors(ink, c.cols.length, c.colsOrdinal);
  const rowLabels = withN(c);
  const maxLines = Math.max(1, ...rowLabels.map(l => wrapLabel(l, 28).split('\n').length));
  const legendUnits = c.cols.reduce((s, col) => s + width(col) + 5, 0);
  const topPad = legendUnits > 72 ? 92 : 64;
  return { kind: 'stacked', height: rowsHeight(c.rows.length, maxLines > 1 ? 82 : 64, 150 + (topPad - 64)), option: {
    ...base(), color: colors, legend,
    grid: grid({ top: topPad, right: 32 }),
    xAxis: valueAxis('行内占比（%）', { ...lowerTitle, max: 100, interval: 20 }),
    yAxis: categoryAxis(rowLabels, true, 280),
    series: c.cols.map((col, j) => ({
      type: 'bar' as const, name: col, stack: 'share', barWidth: '58%', data: c.rows.map(row => cell(c, row, col, 3)),
      itemStyle: { color: colors[j], borderColor: '#FFFFFF', borderWidth: 1 },
      // Shares under 9 % have no room for a label; the table carries every value.
      label: { show: true, position: 'inside' as const, ...small, fontSize: 18, color: onFill(colors[j]), formatter: (p: Label) => Number(p.value) >= 9 ? `${Number(p.value).toFixed(1)}%` : '' },
    })),
  } };
}

/** A wide crosstab as a heat map of row shares on the accent's light-to-deep scale. */
function heatmap(c: Cells, accent: string): FigurePlan {
  const low = mix(accent, '#FFFFFF', 0.9), high = mix(accent, '#000000', 0.15);
  const values = c.rows.flatMap(row => c.cols.map(col => cell(c, row, col, 3))), max = Math.max(1, ...values);
  const shade = (v: number) => mix(low, high, v / max);
  // Column names wrap within their cell instead of slanting; the widest name decides how many lines to allow for.
  const cellWidth = Math.floor(680 / c.cols.length), lines = Math.max(1, ...c.cols.map(col => Math.ceil(width(col) * 9 / Math.max(40, cellWidth))));
  return { kind: 'heatmap', height: rowsHeight(c.rows.length, 52, 120 + 26 * lines), option: {
    ...base(),
    grid: grid({ top: 24, right: 24 }),
    xAxis: { type: 'category', data: c.cols, position: 'top', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...small, fontSize: 18, interval: 0, overflow: 'breakAll', width: Math.max(40, cellWidth), lineHeight: 24 } },
    yAxis: { type: 'category', data: withN(c), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...small, ...italicN } },
    visualMap: { show: false, min: 0, max, dimension: 2, inRange: { color: [low, high] } },
    series: [{
      type: 'heatmap', data: c.rows.flatMap((row, i) => c.cols.map((col, j) => [j, i, cell(c, row, col, 3)])),
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      label: {
        show: true, ...small, fontSize: 18,
        formatter: (p: { value: unknown }) => { const v = Number((p.value as number[])[2]); return `{${onFill(shade(v)) === INK ? 'ink' : 'paper'}|${v.toFixed(1)}%}`; },
        rich: { ink: { ...small, fontSize: 18, color: INK }, paper: { ...small, fontSize: 18, color: '#FFFFFF' } },
      },
    }],
  } };
}

/** Counts (or expected counts) of a crosstab as grouped bars, one shade per column category. */
function grouped(c: Cells, ink: FigureInk, column: number, header: string): FigurePlan {
  const colors = categoryColors(ink, c.cols.length, c.colsOrdinal);
  const integer = c.rows.every(row => c.cols.every(col => Number.isInteger(cell(c, row, col, column))));
  return { kind: 'grouped', height: 480, option: {
    ...base(), color: colors, legend,
    grid: grid({ top: 72 }),
    xAxis: categoryAxis(c.rows, false), yAxis: valueAxis(axisName(header)),
    series: c.cols.map((col, j) => ({
      type: 'bar' as const, name: col, barMaxWidth: 30, data: c.rows.map(row => cell(c, row, col, column)), itemStyle: { color: colors[j] },
      // Whole counts fit above up to 24 bars; decimals (expected counts) only when the bars are few.
      label: { show: c.rows.length * c.cols.length <= (integer ? 24 : 12), position: 'top' as const, ...small, fontSize: 16, formatter: (p: Label) => integer ? format(Number(p.value), false, true) : minus(Number(p.value).toFixed(1)) },
    })),
  } };
}

/** A correlation coefficient on its −1…1 scale: the estimate, its 95 % interval when known, and the zero line. */
function coefficient(r: ResultSnapshot, accent: string): FigurePlan {
  const rank = r.method === 'spearman', get = (label: string) => num(r.metrics.find(m => m.label === label)?.value);
  const value = get(rank ? 'Spearman ρ' : 'Pearson r'), lo = get('95% CI 下限'), hi = get('95% CI 上限');
  if (value === null) throw Error(`“${r.title}”的相关系数不定义，无法作图。`);
  const symbol = rank ? 'ρ' : 'r', interval = lo !== null && hi !== null;
  const marks: CustomSeriesOption = {
    type: 'custom', silent: true, data: [[value, 0]],
    renderItem: (params, api) => {
      const area = (params as unknown as { coordSys: { x: number; y: number; width: number; height: number } }).coordSys;
      const zero = api.coord([0, 0]), point = api.coord([value, 0]), style = { stroke: accent, lineWidth: 3 };
      const children: object[] = [{ type: 'line', shape: { x1: zero[0], y1: area.y, x2: zero[0], y2: area.y + area.height }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [6, 5] } }];
      if (interval) {
        const a = api.coord([lo!, 0]), b = api.coord([hi!, 0]);
        children.push({ type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style }, { type: 'line', shape: { x1: a[0], y1: a[1] - 10, x2: a[0], y2: a[1] + 10 }, style }, { type: 'line', shape: { x1: b[0], y1: b[1] - 10, x2: b[0], y2: b[1] + 10 }, style });
      }
      children.push({ type: 'circle', shape: { cx: point[0], cy: point[1], r: 9 }, style: { fill: accent, stroke: '#FFFFFF', lineWidth: 2 } });
      children.push({ type: 'text', x: point[0], y: point[1] - 24, style: { text: `{i|${symbol}} = ${minus(value.toFixed(3))}`, rich: { i: { fontStyle: 'italic', fontSize: 22, fontFamily: FONT, fill: INK } }, fill: INK, fontSize: 22, fontFamily: FONT, align: 'center', verticalAlign: 'bottom' } });
      if (interval) children.push({ type: 'text', x: point[0], y: point[1] + 24, style: { text: `95% 置信区间 [${minus(lo!.toFixed(3))}, ${minus(hi!.toFixed(3))}]`, fill: INK, fontSize: 18, fontFamily: FONT, align: 'center', verticalAlign: 'top' } });
      return { type: 'group', children } as unknown as ReturnType<NonNullable<CustomSeriesOption['renderItem']>>;
    },
  };
  return { kind: 'coefficient', height: 260, option: {
    ...base(), grid: grid({ top: 24, bottom: 24, left: 48, right: 48 }),
    xAxis: valueAxis(rank ? 'Spearman 秩相关系数' : 'Pearson 相关系数', { ...lowerTitle, min: -1, max: 1, interval: 0.5 }),
    yAxis: { type: 'category', data: [''], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false } },
    series: [marks],
  } };
}

/** Group means as bars with ±1 sample standard deviation whiskers; group sizes travel with the labels. */
function means(r: ResultSnapshot, column: number, accent: string): FigurePlan {
  const rows = groupRows(r), labels = rows.map(row => `${row[0]}（n = ${row[1]}）`), values = rows.map(row => numeric(row[column]) ?? 0);
  const plan = bars(labels, values, r.headers[column], accent);
  const sd = column === 2 ? rows.map(row => numeric(row[3])) : null;
  if (!sd || sd.some(v => v === null)) return plan;
  const horizontal = plan.kind === 'barsHorizontal', cap = 10;
  const whiskers: CustomSeriesOption = {
    type: 'custom', name: '±1 标准差', silent: true, z: 3,
    data: values.map((v, i) => [i, v - sd[i]!, v + sd[i]!]),
    renderItem: (_params, api) => {
      const at = (value: number) => api.coord(horizontal ? [value, api.value(0)] : [api.value(0), value]);
      const low = at(Number(api.value(1))), high = at(Number(api.value(2)));
      const tick = (p: number[]) => horizontal ? { x1: p[0], y1: p[1] - cap, x2: p[0], y2: p[1] + cap } : { x1: p[0] - cap, y1: p[1], x2: p[0] + cap, y2: p[1] };
      const style = { stroke: AXIS, lineWidth: 2 };
      return { type: 'group', children: [
        { type: 'line', shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] }, style },
        { type: 'line', shape: tick(low), style }, { type: 'line', shape: tick(high), style },
      ] };
    },
  };
  const [firstBar] = plan.option.series as SeriesOption[];
  // Whiskers occupy the bar ends, so the mean labels sit inside the bars at their base; omit the overall-avg guide so whiskers stay clear.
  const barSeries = { ...firstBar, label: { ...(firstBar as { label: object }).label, position: horizontal ? 'insideLeft' : 'insideBottom', distance: 12, color: onFill(accent) } } as SeriesOption;
  const maxHigh = Math.max(0, ...values.map((v, i) => v + (sd[i] ?? 0)));
  const minLow = Math.min(0, ...values.map((v, i) => v - (sd[i] ?? 0)));
  const nextOption = horizontal && minLow >= 0 && maxHigh > 0
    ? { ...plan.option, grid: grid({ top: 40, right: 48 }), xAxis: { ...(plan.option.xAxis as object), min: 0, max: niceUpperBound(maxHigh * 1.08, 6) }, series: [barSeries, whiskers] }
    : { ...plan.option, series: [barSeries, whiskers] };
  return { ...plan, kind: 'means', option: nextOption };
}

/** One numeric variable as a five-number box (whiskers to the minimum and maximum) with the mean marked. */
function box(r: ResultSnapshot, accent: string): FigurePlan | null {
  const get = (label: string) => numeric(r.rows.find(row => row[0] === label)?.[1] ?? null);
  const five = ['最小值', 'Q1', '中位数', 'Q3', '最大值'].map(get), mean = get('均值');
  if (five.some(v => v === null)) return null;
  const [min, q1, median, q3, max] = five as number[];
  const integer = five.every(v => Number.isInteger(v));
  const show = (v: number) => minus(integer && Number.isInteger(v) ? String(v) : v.toFixed(2));
  // Two staggered rows above the box keep neighbouring numbers apart when quartiles lie close together.
  const marks: [string, number, number][] = [['最小值', min, 0], ['下四分位数', q1, 1], ['中位数', median, 0], ['上四分位数', q3, 1], ['最大值', max, 0]];
  const labels: CustomSeriesOption = {
    type: 'custom', silent: true, data: marks.map(([, v], i) => [v, 0, i]),
    renderItem: (_params, api) => {
      const [name, value, row] = marks[Number(api.value(2))], p = api.coord([value, 0]);
      return { type: 'text', x: p[0], y: p[1] - 48 - row * 28, style: { text: `${name} ${show(value)}`, fill: INK, fontSize: 18, fontFamily: FONT, align: 'center', verticalAlign: 'bottom' } };
    },
  };
  const series: SeriesOption[] = [
    { type: 'boxplot', data: [[min, q1, median, q3, max]], boxWidth: [44, 64], itemStyle: { color: mix(accent, '#FFFFFF', 0.82), borderColor: accent, borderWidth: 2 } },
    labels,
  ];
  if (mean !== null) series.push({ type: 'scatter', data: [[mean, 0]], symbol: 'diamond', symbolSize: 16, itemStyle: { color: accent, opacity: 1 }, z: 5,
    label: { show: true, position: 'bottom', distance: 44, ...small, fontSize: 18, opacity: 1, textBorderWidth: 0, formatter: () => `均值 ${show(mean)}` } });
  return { kind: 'box', height: 300, option: {
    ...base(), grid: grid({ top: 24, bottom: 24, left: 40, right: 48 }),
    xAxis: valueAxis(r.variables?.[0] ?? '数值', { ...lowerTitle, scale: true }),
    yAxis: { type: 'category', data: [''], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false } },
    series,
  } };
}

/** The figure for a result and the value column the author picked. */
export function figurePlan(r: ResultSnapshot, column: number, ink: FigureInk): FigurePlan {
  const accent = inkPrimary(ink);
  if (!/^#[0-9A-Fa-f]{6}$/.test(accent)) throw Error('图表颜色无效。');
  // An advanced method's result carries its own figure (lib/method-figures.ts), whatever column is picked.
  const method = methodFigure(r, ink);
  if (method) return method;
  if (r.method === 'revised-ipa' && r.rows.length >= 2) {
    const perfIdx = r.headers.findIndex((h, idx) => idx >= 1 && /表现|均值/u.test(h));
    const impIdx = r.headers.findIndex((h, idx) => idx >= 1 && idx !== perfIdx && /重要|权重|系数/u.test(h));
    const cPerf = perfIdx >= 1 ? perfIdx : 2;
    const cImp = impIdx >= 1 ? impIdx : 1;
    const pts = r.rows
      .map(row => ({
        name: String(row[0] ?? ''),
        importance: numeric(row[cImp]),
        performance: numeric(row[cPerf]),
      }))
      .filter((p): p is { name: string; importance: number; performance: number } => Boolean(p.name) && p.importance !== null && p.performance !== null);
    if (pts.length >= 2) {
      const meanImp = pts.reduce((s, p) => s + p.importance, 0) / pts.length;
      const meanPerf = pts.reduce((s, p) => s + p.performance, 0) / pts.length;
      return ipaPlot(pts, { importance: meanImp, performance: meanPerf }, ink, '隐性重要性（标准化系数）');
    }
  }
  if (r.method === 'group-compare' && r.rows.length >= 3 && r.headers.length >= 3) {
    const extractMeanPrefix = (cellVal: string | number | null): number | null => {
      if (typeof cellVal === 'number') return Number.isFinite(cellVal) ? cellVal : null;
      if (typeof cellVal !== 'string') return null;
      const m = /^[+-]?\d+(?:\.\d+)?/u.exec(cellVal.trim().replace(/^−/u, '-'));
      return m ? Number(m[0]) : null;
    };
    const parsedRows = r.rows
      .map(row => ({
        dim: String(row[0] ?? ''),
        v0: extractMeanPrefix(row[1]),
        v1: extractMeanPrefix(row[2]),
        p: row.length >= 4 ? numeric(row[row.length - 1]) : null,
      }))
      .filter((x): x is { dim: string; v0: number; v1: number; p: number | null } => Boolean(x.dim) && x.v0 !== null && x.v1 !== null && x.v0 >= 0 && x.v1 >= 0);
    if (parsedRows.length >= 3) {
      const parseGroupHdr = (hdr: string) => {
        const nMatch = /n\s*=\s*(\d+)/iu.exec(hdr);
        const label = hdr.replace(/[（(][^）)]*n\s*=[^）)]*[）)]/giu, '').trim() || hdr;
        return { label, n: nMatch ? Number(nMatch[1]) : 0 };
      };
      const isPct = /%|％|占比|比例/u.test(`${r.headers[1]} ${r.headers[2]}`);
      return mirroredGroupComparePlot(
        parsedRows.map(x => x.dim),
        [parseGroupHdr(r.headers[1]), parseGroupHdr(r.headers[2])],
        parsedRows.map(x => [x.v0, x.v1]),
        ink,
        parsedRows.map(x => x.p),
        isPct,
      );
    }
  }
  if (r.method === 'kano' && r.rows.length >= 2) {
    const betterIdx = r.headers.findIndex((h, i) => i >= 1 && /Better/iu.test(h));
    const worseIdx = r.headers.findIndex((h, i) => i >= 1 && /Worse/iu.test(h));
    const domIdx = r.headers.findIndex((h, i) => i >= 1 && /主导|属性/u.test(h));
    const cBetter = betterIdx >= 1 ? betterIdx : 3;
    const cWorse = worseIdx >= 1 ? worseIdx : 4;
    const pts = r.rows
      .map(row => {
        const better = numeric(row[cBetter]);
        const worse = numeric(row[cWorse]);
        return better !== null && worse !== null
          ? {
              name: String(row[0] ?? ''),
              better,
              worseAbs: Math.abs(worse),
              dominant: domIdx >= 1 ? String(row[domIdx] ?? '') : '',
            }
          : null;
      })
      .filter((x): x is { name: string; better: number; worseAbs: number; dominant: string } => Boolean(x && x.name));
    if (pts.length >= 2) {
      return kanoQuadrantPlot(pts, ink);
    }
  }
  if (r.method === 'rdd' || r.method === 'cs-did') {
    const valRe = r.method === 'rdd' ? /τ|跳跃|效应/u : /ATT/iu;
    const valIdx = r.headers.findIndex((h, i) => i >= 1 && valRe.test(h));
    const seIdx = r.headers.findIndex((h, i) => i >= 1 && /\bSE\b|标准误/iu.test(h));
    const cVal = valIdx >= 1 ? valIdx : 2;
    const cSe = seIdx >= 1 ? seIdx : 3;
    const rows = r.rows
      .map(row => {
        const est = numeric(row[cVal]);
        const se = numeric(row[cSe]);
        return est !== null && se !== null && se > 0
          ? { name: String(row[0] ?? ''), estimate: est, low: est - 1.96 * se, high: est + 1.96 * se }
          : null;
      })
      .filter((x): x is { name: string; estimate: number; low: number; high: number } => Boolean(x && x.name));
    if (rows.length >= 1) {
      const axis = r.method === 'rdd'
        ? 'Sharp RDD 断点局部处理效应 τ（95% 置信区间）'
        : "Callaway-Sant'Anna 交错多期处理效应 ATT(g,t)（95% 置信区间）";
      return forestPlot(rows, { axis, reference: 0 }, accent);
    }
  }
  if (r.method === 'psm' && r.rows.length >= 1) {
    const befIdx = r.headers.findIndex((h, i) => i >= 1 && /匹配前/u.test(h));
    const aftIdx = r.headers.findIndex((h, i) => i >= 1 && /匹配后/u.test(h));
    const cBef = befIdx >= 1 ? befIdx : 1;
    const cAft = aftIdx >= 1 ? aftIdx : 2;
    const rows = r.rows
      .map(row => {
        const before = numeric(row[cBef]);
        const after = numeric(row[cAft]);
        return before !== null && after !== null
          ? { name: String(row[0] ?? ''), before, after }
          : null;
      })
      .filter((x): x is { name: string; before: number; after: number } => Boolean(x && x.name));
    if (rows.length >= 1) {
      return psmLovePlot(rows, ink);
    }
  }
  if (r.method === 'conformal') {
    const validMetrics = r.metrics
      .filter((m): m is { label: string; value: number } => typeof m.value === 'number' && Number.isFinite(m.value));
    if (validMetrics.length >= 1) {
      return conformalCalibrationPlot(validMetrics, ink);
    }
  }
  if (r.method === 'topsis' && r.rows.length >= 2) {
    const nameIdx = r.headers.findIndex(h => /对象|区域|城市|方案/u.test(h));
    const cName = nameIdx >= 0 ? nameIdx : 1;
    const valIdx = r.headers.findIndex((h, i) => i >= 1 && /贴近度|C_i/iu.test(h));
    const cVal = valIdx >= 1 ? valIdx : Math.min(4, r.headers.length - 1);
    const items = r.rows
      .map(row => ({ label: String(row[cName] ?? ''), val: numeric(row[cVal]) }))
      .filter((x): x is { label: string; val: number } => Boolean(x.label) && x.val !== null);
    if (items.length >= 2) {
      return bars(items.map(x => x.label), items.map(x => x.val), '相对贴近度 C_i', accent);
    }
  }
  if (r.method === 'iv' && r.rows.length >= 1) {
    const estIdx = r.headers.findIndex((h, i) => i >= 1 && /点估计|β|效应/u.test(h));
    const seIdx = r.headers.findIndex((h, i) => i >= 1 && /\bSE\b|标准误/iu.test(h));
    const cEst = estIdx >= 1 ? estIdx : 1;
    const cSe = seIdx >= 1 ? seIdx : 2;
    const rows = r.rows
      .map(row => {
        const est = numeric(row[cEst]);
        const se = numeric(row[cSe]);
        return est !== null && se !== null && se > 0
          ? { name: String(row[0] ?? ''), estimate: est, low: est - 1.96 * se, high: est + 1.96 * se }
          : null;
      })
      .filter((x): x is { name: string; estimate: number; low: number; high: number } => Boolean(x && x.name));
    if (rows.length >= 1) {
      return forestPlot(rows, { axis: 'IV-2SLS 局部效应 β 与 OLS 基准对照（95% 置信区间）', reference: 0 }, accent);
    }
  }
  if (r.method === 'ab' && r.rows.length >= 1) {
    const estIdx = r.headers.findIndex((h, i) => i >= 1 && /净提升|Δ|效应/u.test(h));
    const seIdx = r.headers.findIndex((h, i) => i >= 1 && /\bSE\b|标准误/iu.test(h));
    const cEst = estIdx >= 1 ? estIdx : 3;
    const cSe = seIdx >= 1 ? seIdx : 4;
    const rows = r.rows
      .map(row => {
        const est = numeric(row[cEst]);
        const se = numeric(row[cSe]);
        return est !== null && se !== null && se > 0
          ? { name: String(row[0] ?? ''), estimate: est, low: est - 1.96 * se, high: est + 1.96 * se }
          : null;
      })
      .filter((x): x is { name: string; estimate: number; low: number; high: number } => Boolean(x && x.name));
    if (rows.length >= 1) {
      return forestPlot(rows, { axis: '序贯 A/B 实验主指标与护栏净提升 Δ（95% 置信区间）', reference: 0 }, accent);
    }
  }
  if (r.method === 'survival' && r.rows.length >= 2) {
    const rmstIdx = r.headers.findIndex((h, i) => i >= 1 && /RMST|生存期/iu.test(h));
    const cVal = rmstIdx >= 1 ? rmstIdx : Math.min(5, r.headers.length - 1);
    const items = r.rows
      .map(row => ({ label: String(row[0] ?? ''), val: numeric(row[cVal]) }))
      .filter((x): x is { label: string; val: number } => Boolean(x.label) && x.val !== null);
    if (items.length >= 2) {
      return bars(items.map(x => x.label), items.map(x => x.val), '限制平均生存时间 (RMST)', accent);
    }
  }
  if (r.method === 'meta' && r.rows.length >= 2) {
    const effIdx = r.headers.findIndex((h, i) => i >= 1 && /效应量|θ/u.test(h));
    const seIdx = r.headers.findIndex((h, i) => i >= 1 && /\bSE\b|标准误/iu.test(h));
    const cEff = effIdx >= 1 ? effIdx : 1;
    const cSe = seIdx >= 1 ? seIdx : 2;
    const rows = r.rows
      .map(row => {
        const est = numeric(row[cEff]);
        const se = numeric(row[cSe]);
        return est !== null && se !== null && se > 0
          ? { name: String(row[0] ?? ''), estimate: est, low: est - 1.96 * se, high: est + 1.96 * se }
          : null;
      })
      .filter((x): x is { name: string; estimate: number; low: number; high: number } => Boolean(x && x.name));
    if (rows.length >= 2) {
      return forestPlot(rows, { axis: '随机效应 Meta 合成森林图 θ_i（95% 置信区间）', reference: 0 }, accent);
    }
  }
  // An advanced result without its own figure (AHP, or one whose figure did not fit) is never drawn as bars of its table.
  if (!canChart(r)) throw Error(`“${r.title}”没有可画的图，请改用表格。`);
  if (column < 1 || column >= r.headers.length) throw Error('请选择有效数值列。');
  if (!r.rows.length) throw Error(`图“${r.title}”没有数据行，请重新计算或改用表格。`);
  if (r.method === 'pearson' || r.method === 'spearman') return coefficient(r, accent);
  if (r.method === 'crosstab' && r.headers[2] === '频数') {
    const cells = crosstabCells(r);
    // Counts and expected counts are drawn as they are; the row-share column (and the category column of older
    // blocks, which holds no numbers) shows row shares.
    if (cells && (column === 2 || column === 4)) {
      if (r.rows.some(row => numeric(row[column]) === null)) throw Error('图表所选列含缺失或非数值，请改用表格。');
      return grouped(cells, ink, column, r.headers[column]);
    }
    if (cells) return cells.cols.length > 6 ? heatmap(cells, accent) : stacked(cells, ink);
  }
  if (r.method === 'numeric') { const plan = box(r, accent); if (plan) return plan; throw Error(`“${r.title}”缺少五数概括，无法作箱线图，请改用表格。`); }
  const values = r.rows.map(row => numeric(row[column]));
  if (values.some(v => v === null)) throw Error('图表所选列含缺失或非数值，请改用表格。');
  if (values.length > 30 || values.some(v => Math.abs(v!) > 1e12)) throw Error('图表类别或数值范围过大，请分拆或转换计量单位。');
  if (r.method === 'groups' && r.headers[1] === 'n' && r.headers[2] === '均值') return means(r, column, accent);
  if (r.method === 'frequency' && r.headers[1] === '频数') return frequency(r, column, ink);
  return bars(r.rows.map(row => String(row[0])), values as number[], r.headers[column], accent);
}
export const figureOption = (r: ResultSnapshot, column: number, ink: FigureInk) => figurePlan(r, column, ink).option;

/** Width and height written on an SVG root, which Word and the preview use to keep the figure's proportions. */
export function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const width = Number(/\bwidth="(\d+(?:\.\d+)?)"/.exec(root)?.[1]), height = Number(/\bheight="(\d+(?:\.\d+)?)"/.exec(root)?.[1]);
  if (!(width > 0) || !(height > 0)) throw Error('图形尺寸无效。');
  return { width, height };
}

/** Server-rendered SVG with ECharts' interaction styles removed, checked against the vector-asset rules. */
export async function figureSVG(r: ResultSnapshot, column: number, ink: FigureInk): Promise<string> {
  const libSvg = renderResourceLibraryReportSvg(r, ink);
  if (libSvg) return libSvg;
  if (isDiagramMethod(r.method)) return assertTrueVector(diagramSnapshotSVG(r, ink));
  return planSVG(figurePlan(r, column, ink));
}

/** Any figure plan as report SVG, through the same cleaning and vector check as a result's figure. */
export async function planSVG(plan: FigurePlan): Promise<string> {
  const { engine } = await import('./chart-engine.ts');
  const chart = engine.init(null, undefined, { renderer: 'svg', ssr: true, width: FIGURE_WIDTH, height: plan.height });
  try {
    chart.setOption(plan.option);
    const svg = chart.renderToSVGString()
      .replace(/<style\b[\s\S]*?<\/style>/g, '')
      // Interaction hooks and ECharts' own metadata draw nothing; without them the figure also passes the stricter
      // vector check of the PPT export (lib/vector-svg.ts).
      .replace(/\s(?:class|pointer-events|version|baseProfile|xml:space|ecmeta_[a-z_]+)="[^"]*"/g, '')
      // Word's SVG renderer ignores the CSS font shorthand ECharts writes for rich text; spell it out as properties.
      // Only style attributes inside tags change: chart text is escaped, so a label that reads like CSS stays as written.
      .replace(/<[^>]+>/g, tag => tag.replace(/(\sstyle=")([^"]*)"/g, (_s, open: string, css: string) => `${open}${css.replace(/font:\s*([^;"]*?)(\d+(?:\.\d+)?px)\s+([^;"]+)/g, (_m, lead: string, size: string, family: string) => {
        const words = lead.trim().split(/\s+/);
        const style = words.find(w => /^(?:italic|oblique)$/.test(w)) ?? 'normal', weight = words.find(w => /^(?:bold|bolder|lighter|\d{3})$/.test(w)) ?? 'normal';
        return `font-style:${style};font-weight:${weight};font-size:${size};font-family:${family.trim()}`;
      })}"`))
      // Word and strict SVG 1.1 validators (lib/vector-svg.ts) reject SVG2 paint-order="stroke"; expand stroked text into a halo <text> behind a crisp ink <text>.
      .replace(/<text\b([^>]*?\bpaint-order="stroke"[^>]*)>([\s\S]*?)<\/text>/g, (_full, attrs: string, inner: string) => {
        const strokeColor = /\bstroke="([^"]+)"/.exec(attrs)?.[1] ?? '#FFFFFF';
        const baseAttrs = attrs.replace(/\s*paint-order="[^"]*"/g, '');
        const haloAttrs = `${baseAttrs.replace(/\bfill="[^"]*"/, `fill="${strokeColor}"`)} stroke-linejoin="round"`;
        const inkAttrs = baseAttrs.replace(/\s*(?:stroke|stroke-width|stroke-opacity|stroke-miterlimit|stroke-linejoin)="[^"]*"/g, '');
        return `<text${haloAttrs}>${inner}</text><text${inkAttrs}>${inner}</text>`;
      })
      .replace(/(<(?:text|tspan|desc|title)\b[^>]*>)([^<]+)(<\/(?:text|tspan|desc|title)>)/g, (_full, open: string, inner: string, close: string) => `${open}${normalizeAcademicPunctuation(inner)}${close}`);
    return assertTrueVector(svg);
  } finally { chart.dispose(); }
}
