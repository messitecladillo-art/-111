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
import { categoryOrder, crosstabOrder, groupRows } from './report-tables.ts';

/** Every figure is this wide; at the full text width (14.64 cm) 22 px text prints at about 9.5 pt. */
export const FIGURE_WIDTH = 960;
const FONT = 'Times New Roman, SimSun, Songti SC, serif';
const INK = '#1F2329', AXIS = '#3A4049', GRID = '#E3E6EA';

export type FigureKind = 'bars' | 'barsHorizontal' | 'ring' | 'stacked' | 'heatmap' | 'grouped' | 'means' | 'box' | 'coefficient';
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
/** Axis titles in report style: "有效样本占比 (%)" → "占比（%）". */
const axisName = (header: string) => header.replace(/\s*[（(]\s*[%％]\s*[)）]/u, '（%）').replace(/^有效样本占比/u, '占比');
/** Negative numbers take a true minus sign, as in the text. */
const minus = (s: string) => s.replace(/^-(?=\d)/, '−');
const format = (v: number, percent: boolean, integer: boolean) => minus(percent ? `${v.toFixed(1)}%` : integer ? String(Math.round(v)) : v.toFixed(2));
// Axis ticks without thousands commas (four-digit numbers stand unseparated) and free of binary noise such as 0.30000000000000004.
const tickLabel = (v: number) => minus(String(Number(v.toPrecision(12))));
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(v)));
const rowsHeight = (rows: number, perRow: number, extra: number) => clamp(extra + perRow * rows, 300, 760);

const text = { color: INK, fontFamily: FONT, fontSize: 22 };
const small = { ...text, fontSize: 20 };
const base = (): EChartsOption => ({ animation: false, backgroundColor: '#FFFFFF', textStyle: text, tooltip: { show: false } });
const grid = (extra: Record<string, unknown> = {}) => ({ left: 24, right: 40, top: 40, bottom: 24, outerBoundsMode: 'same' as const, outerBoundsContain: 'all' as const, ...extra });
const legend = { top: 0, left: 'center', textStyle: small, itemWidth: 18, itemHeight: 12, itemGap: 20 };
const valueAxis = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'value' as const, name, nameTextStyle: { ...small, padding: [0, 0, 4, 0] },
  axisLine: { show: true, lineStyle: { color: AXIS } }, axisTick: { show: true, lineStyle: { color: AXIS } },
  axisLabel: { ...small, formatter: tickLabel }, splitLine: { show: true, lineStyle: { color: GRID, type: 'dashed' as const } }, ...extra,
});
// Sample sizes in labels read "（n=97）" with an italic n, as statistical symbols are set in print.
const italicN = { formatter: (v: string) => v.replace(/（n=/gu, '（{n|n}='), rich: { n: { ...small, fontStyle: 'italic' as const } } };
const categoryAxis = (labels: string[], horizontal: boolean) => ({
  type: 'category' as const, data: labels, axisLine: { show: true, lineStyle: { color: AXIS } }, axisTick: { show: false },
  axisLabel: { ...small, interval: 0, ...italicN, ...(horizontal ? {} : { overflow: 'break' as const, width: Math.max(80, 820 / Math.max(1, labels.length)) }) },
  ...(horizontal ? { inverse: true } : {}),
});
// Horizontal value axes carry their title underneath, clear of the value labels at the bar ends.
const lowerTitle = { nameLocation: 'middle' as const, nameGap: 36 };
type Label = { value: unknown };

/** One series of bars in the accent; long or many labels lie horizontally so they stay readable. */
function bars(labels: string[], values: number[], header: string, accent: string): FigurePlan {
  const horizontal = labels.length > 7 || Math.max(...labels.map(width)) > 12;
  const percent = isPercent(header), integer = values.every(Number.isInteger);
  const series: SeriesOption = {
    type: 'bar', data: values, barMaxWidth: horizontal ? 30 : 60, barCategoryGap: '40%', itemStyle: { color: accent },
    label: { show: true, position: horizontal ? 'right' : 'top', ...small, formatter: (p: Label) => format(Number(p.value), percent, integer) },
  };
  return horizontal
    ? { kind: 'barsHorizontal', height: rowsHeight(labels.length, 46, 110), option: { ...base(), grid: grid({ right: 96 }), xAxis: valueAxis(axisName(header), lowerTitle), yAxis: categoryAxis(labels, true), series: [series] } }
    : { kind: 'bars', height: 460, option: { ...base(), grid: grid({ top: 56 }), xAxis: categoryAxis(labels, false), yAxis: valueAxis(axisName(header)), series: [series] } };
}

/** A composition of two to four answers: a ring in shades of the accent, with the sample size at its centre. */
function ring(labels: string[], values: number[], shares: number[], total: number, ordinal: boolean, accent: string): FigurePlan {
  const height = 420, colors = ordinal ? accentScale(accent, labels.length).reverse() : accentScale(accent, labels.length);
  return { kind: 'ring', height, option: {
    ...base(), color: colors,
    series: [{
      type: 'pie', radius: ['40%', '64%'], center: ['50%', '52%'], startAngle: 90, avoidLabelOverlap: true,
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 3 },
      label: { show: true, ...small, lineHeight: 28, formatter: (p: { dataIndex: number }) => `${labels[p.dataIndex]}\n${shares[p.dataIndex].toFixed(1)}%` },
      labelLine: { show: true, length: 16, length2: 24, lineStyle: { color: AXIS } },
      data: labels.map((name, i) => ({ name, value: values[i] })),
    }],
    graphic: [{ type: 'text', x: FIGURE_WIDTH / 2, y: height * 0.52, style: { text: `{n|n} = ${total}`, rich: { n: { fill: INK, fontSize: 24, fontFamily: FONT, fontStyle: 'italic' } }, fill: INK, fontSize: 24, fontFamily: FONT, align: 'center', verticalAlign: 'middle' } }],
  } };
}

function frequency(r: ResultSnapshot, column: number, accent: string): FigurePlan {
  const at = new Map(r.rows.map(row => [String(row[0]), numeric(row[column])!]));
  const order = at.size === r.rows.length ? categoryOrder([...at.keys()]) : { labels: r.rows.map(row => String(row[0])), ordinal: false };
  const values = order.labels.map(label => at.get(label)!), sum = values.reduce((a, b) => a + b, 0);
  const counts = r.rows.reduce((a, row) => a + (numeric(row[1]) ?? 0), 0);
  if (order.labels.length >= 2 && order.labels.length <= 4 && (column === 1 || column === 2) && sum > 0 && values.every(v => v >= 0))
    return ring(order.labels, values, values.map(v => v / sum * 100), counts, order.ordinal, accent);
  return bars(order.labels, values, r.headers[column], accent);
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
const withN = (c: Cells) => c.rows.map((row, i) => `${row}（n=${c.rowTotals[i]}）`);

/** Row shares as 100 % stacked bars: each group's answers side by side, read against the same 0–100 scale. */
function stacked(c: Cells, accent: string): FigurePlan {
  const colors = c.colsOrdinal ? accentScale(accent, c.cols.length).reverse() : accentScale(accent, c.cols.length);
  return { kind: 'stacked', height: rowsHeight(c.rows.length, 64, 150), option: {
    ...base(), color: colors, legend,
    grid: grid({ top: 64, right: 32 }),
    xAxis: valueAxis('行内占比（%）', { ...lowerTitle, max: 100, interval: 20 }),
    yAxis: categoryAxis(withN(c), true),
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
    xAxis: { type: 'category', data: c.cols, position: 'top', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...small, fontSize: 18, interval: 0, overflow: 'break', width: Math.max(40, cellWidth), lineHeight: 24 } },
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
function grouped(c: Cells, accent: string, column: number, header: string): FigurePlan {
  const colors = c.colsOrdinal ? accentScale(accent, c.cols.length).reverse() : accentScale(accent, c.cols.length);
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
  const rows = groupRows(r), labels = rows.map(row => `${row[0]}（n=${row[1]}）`), values = rows.map(row => numeric(row[column]) ?? 0);
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
  const series = plan.option.series as SeriesOption[];
  // Whiskers occupy the bar ends, so the mean labels sit inside the bars at their base.
  series[0] = { ...series[0], label: { ...(series[0] as { label: object }).label, position: horizontal ? 'insideLeft' : 'insideBottom', distance: 12, color: onFill(accent) } } as SeriesOption;
  return { ...plan, kind: 'means', option: { ...plan.option, series: [...series, whiskers] } };
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
    label: { show: true, position: 'bottom', distance: 26, ...small, fontSize: 18, opacity: 1, textBorderWidth: 0, formatter: () => `均值 ${show(mean)}` } });
  return { kind: 'box', height: 300, option: {
    ...base(), grid: grid({ top: 24, bottom: 24, left: 40, right: 48 }),
    xAxis: valueAxis(r.variables?.[0] ?? '数值', { ...lowerTitle, scale: true }),
    yAxis: { type: 'category', data: [''], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false } },
    series,
  } };
}

/** The figure for a result and the value column the author picked. */
export function figurePlan(r: ResultSnapshot, column: number, accent: string): FigurePlan {
  if (!/^#[0-9A-Fa-f]{6}$/.test(accent)) throw Error('图表颜色无效。');
  if (column < 1 || column >= r.headers.length) throw Error('请选择有效数值列。');
  if (!r.rows.length) throw Error(`图“${r.title}”没有数据行，请重新计算或改用表格。`);
  if (r.method === 'pearson' || r.method === 'spearman') return coefficient(r, accent);
  if (r.method === 'crosstab' && r.headers[2] === '频数') {
    const cells = crosstabCells(r);
    // Counts and expected counts are drawn as they are; the row-share column (and the category column of older
    // blocks, which holds no numbers) shows row shares.
    if (cells && (column === 2 || column === 4)) {
      if (r.rows.some(row => numeric(row[column]) === null)) throw Error('图表所选列含缺失或非数值，请改用表格。');
      return grouped(cells, accent, column, r.headers[column]);
    }
    if (cells) return cells.cols.length > 6 ? heatmap(cells, accent) : stacked(cells, accent);
  }
  if (r.method === 'numeric') { const plan = box(r, accent); if (plan) return plan; throw Error(`“${r.title}”缺少五数概括，无法作箱线图，请改用表格。`); }
  const values = r.rows.map(row => numeric(row[column]));
  if (values.some(v => v === null)) throw Error('图表所选列含缺失或非数值，请改用表格。');
  if (values.length > 30 || values.some(v => Math.abs(v!) > 1e12)) throw Error('图表类别或数值范围过大，请分拆或转换计量单位。');
  if (r.method === 'groups' && r.headers[1] === 'n' && r.headers[2] === '均值') return means(r, column, accent);
  if (r.method === 'frequency' && r.headers[1] === '频数') return frequency(r, column, accent);
  return bars(r.rows.map(row => String(row[0])), values as number[], r.headers[column], accent);
}
export const figureOption = (r: ResultSnapshot, column: number, accent: string) => figurePlan(r, column, accent).option;

/** Width and height written on an SVG root, which Word and the preview use to keep the figure's proportions. */
export function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const width = Number(/\bwidth="(\d+(?:\.\d+)?)"/.exec(root)?.[1]), height = Number(/\bheight="(\d+(?:\.\d+)?)"/.exec(root)?.[1]);
  if (!(width > 0) || !(height > 0)) throw Error('图形尺寸无效。');
  return { width, height };
}

/** Server-rendered SVG with ECharts' interaction styles removed, checked against the vector-asset rules. */
export async function figureSVG(r: ResultSnapshot, column: number, accent: string): Promise<string> {
  const plan = figurePlan(r, column, accent);
  const { engine } = await import('./chart-engine.ts');
  const chart = engine.init(null, undefined, { renderer: 'svg', ssr: true, width: FIGURE_WIDTH, height: plan.height });
  try {
    chart.setOption(plan.option);
    const svg = chart.renderToSVGString()
      .replace(/<style\b[\s\S]*?<\/style>/g, '')
      .replace(/\s(?:class|pointer-events)="[^"]*"/g, '');
    return assertTrueVector(svg);
  } finally { chart.dispose(); }
}
