/**
 * Figures of the advanced methods, in the report's one-hue style (lib/report-figures.ts): a forest plot of
 * coefficients or odds ratios with their 95 % intervals against the no-effect line, a scree plot with Kaiser's line,
 * the IPA quadrant chart, and cluster profiles on standardized variables. Each returns a figure plan; planSVG renders
 * it as report SVG.
 */
import type { CustomSeriesOption, SeriesOption } from 'echarts';
import { AXIS, FONT, INK, base, categoryAxis, categoryColors, grid, inkOpposite, inkPrimary, legend, lowerTitle, minus, small, valueAxis, type FigurePlan } from './report-figures.ts';
import type { FigureInk } from './figure-palette.ts';

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(v)));
type Group = ReturnType<NonNullable<CustomSeriesOption['renderItem']>>;

/** Axis bounds on a round step (1, 2, 2.5 or 5 × 10ᵏ) about five ticks apart, so no axis ends on a raw value. */
export function niceBounds(low: number, high: number, ticks = 5): { min: number; max: number; interval: number } {
  const raw = (high - low || Math.abs(high) || 1) / ticks, power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(v => v >= raw * 0.999)!;
  const round = (v: number) => Number(v.toPrecision(12));
  return { min: round(Math.floor(low / step) * step), max: round(Math.ceil(high / step) * step), interval: round(step) };
}
/** Bounds of a logarithmic axis on the 1–2–5 sequence, covering both (positive) values whatever their magnitude. */
export function niceLogBounds(low: number, high: number): { min: number; max: number } {
  if (!(low > 0) || !(high >= low)) throw Error('对数轴需要正的取值范围。');
  const from = Math.floor(Math.log10(low)) - 1, to = Math.ceil(Math.log10(high)) + 1;
  const marks = Array.from({ length: to - from + 1 }, (_, i) => from + i).flatMap(k => [1, 2, 5].map(m => Number((m * 10 ** k).toPrecision(6))));
  const min = [...marks].reverse().find(v => v <= low)!, max = marks.find(v => v >= high && v > min)!;
  return { min, max };
}

/**
 * Estimates with their 95 % intervals, one row each, against the line of no effect: 0 for coefficients, 1 for odds
 * ratios (on a logarithmic axis, where an interval is symmetric about the estimate).
 */
export function forestPlot(rows: readonly { name: string; estimate: number; low: number; high: number }[], options: { axis: string; reference: 0 | 1 }, accent: string): FigurePlan {
  const log = options.reference === 1;
  if (!rows.length || rows.some(r => ![r.estimate, r.low, r.high].every(Number.isFinite) || (log && Math.min(r.estimate, r.low) <= 0))) throw Error('估计值或置信区间不完整，无法作图。');
  const labels = rows.map(r => r.name), lo = Math.min(options.reference, ...rows.map(r => r.low)), hi = Math.max(options.reference, ...rows.map(r => r.high));
  const marks: CustomSeriesOption = {
    type: 'custom', clip: false, silent: true, data: rows.map((r, i) => [i, r.estimate, r.low, r.high]),
    renderItem: (params, api) => {
      const i = Number(api.value(0)), at = (v: number) => api.coord([v, i]), style = { stroke: accent, lineWidth: 3 };
      const point = at(Number(api.value(1))), a = at(Number(api.value(2))), b = at(Number(api.value(3)));
      const children: object[] = [
        { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style },
        { type: 'line', shape: { x1: a[0], y1: a[1] - 9, x2: a[0], y2: a[1] + 9 }, style },
        { type: 'line', shape: { x1: b[0], y1: b[1] - 9, x2: b[0], y2: b[1] + 9 }, style },
        { type: 'rect', shape: { x: point[0] - 8, y: point[1] - 8, width: 16, height: 16 }, style: { fill: accent, stroke: '#FFFFFF', lineWidth: 2 } },
      ];
      if (i === 0) {
        const area = (params as unknown as { coordSys: { y: number; height: number } }).coordSys, zero = api.coord([options.reference, 0]);
        children.unshift({ type: 'line', shape: { x1: zero[0], y1: area.y, x2: zero[0], y2: area.y + area.height }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [6, 5] } });
      }
      return { type: 'group', children } as unknown as Group;
    },
  };
  const pad = (hi - lo) * 0.05 || 0.1;
  return { kind: 'forest', height: clamp(120 + 64 * rows.length, 260, 760), option: {
    ...base(), grid: grid({ left: 24, right: 48, top: 24, bottom: 24 }),
    xAxis: log
      ? valueAxis(options.axis, { ...lowerTitle, type: 'log', logBase: 10, ...niceLogBounds(lo, hi) })
      : valueAxis(options.axis, { ...lowerTitle, ...niceBounds(lo - pad, hi + pad) }),
    yAxis: categoryAxis(labels, true),
    series: [marks],
  } };
}

/** Eigenvalues of the items' correlation matrix in order, with the eigenvalue-one line of Kaiser's rule. */
export function screePlot(eigenvalues: readonly number[], accent: string): FigurePlan {
  if (eigenvalues.length < 2 || !eigenvalues.every(Number.isFinite)) throw Error('特征值不完整，无法作图。');
  return { kind: 'scree', height: 420, option: {
    ...base(), grid: grid({ top: 48, bottom: 40 }),
    xAxis: { ...categoryAxis(eigenvalues.map((_, i) => String(i + 1)), false), name: '因子序号', nameLocation: 'middle', nameGap: 40, nameTextStyle: small },
    yAxis: valueAxis('特征值', { min: 0, max: Math.ceil(Math.max(...eigenvalues) + 0.5) }),
    // Drawn as one custom series: a line series clips itself to the grid with a url() reference, which report SVG
    // may not carry.
    series: [{
      type: 'custom', silent: true, data: [[0]],
      renderItem: (params, api) => {
        const area = (params as unknown as { coordSys: { x: number; width: number } }).coordSys, one = api.coord([0, 1]);
        const points = eigenvalues.map((v, i) => api.coord([i, v]));
        const children: object[] = [
          { type: 'line', shape: { x1: area.x, y1: one[1], x2: area.x + area.width, y2: one[1] }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [6, 5] } },
          { type: 'text', x: area.x + area.width, y: one[1] - 8, style: { text: '特征值 = 1', fill: AXIS, fontSize: 20, fontFamily: FONT, align: 'right', verticalAlign: 'bottom' } },
          { type: 'polyline', shape: { points }, style: { stroke: accent, lineWidth: 3, fill: 'none' } },
          ...points.flatMap((p, i) => [
            { type: 'circle', shape: { cx: p[0], cy: p[1], r: 7 }, style: { fill: accent, stroke: '#FFFFFF', lineWidth: 2 } },
            // Only the retained factors (eigenvalue at least one) are labelled; the table gives every eigenvalue, and labels
            // on the flat tail would sit on the line or on Kaiser's line.
            ...(eigenvalues[i] >= 1 ? [{ type: 'text', x: p[0], y: p[1] - 14, style: { text: minus(eigenvalues[i].toFixed(2)), fill: INK, fontSize: 20, fontFamily: FONT, align: 'center', verticalAlign: 'bottom' } }] : []),
          ]),
        ];
        return { type: 'group', children } as unknown as Group;
      },
    } satisfies CustomSeriesOption],
  } };
}

/** Each attribute at (performance, importance), split by the two lines into the four IPA quadrants, each named. */
export function ipaPlot(points: readonly { name: string; importance: number; performance: number }[], lines: { importance: number; performance: number }, accent: string, importanceAxis = '重要性'): FigurePlan {
  if (points.length < 2) throw Error('IPA 至少需要两个属性。');
  const xs = [...points.map(p => p.performance), lines.performance], ys = [...points.map(p => p.importance), lines.importance];
  const span = (v: number[]) => (Math.max(...v) - Math.min(...v)) || 1;
  const bx = niceBounds(Math.min(...xs) - span(xs) * 0.12, Math.max(...xs) + span(xs) * 0.12), by = niceBounds(Math.min(...ys) - span(ys) * 0.12, Math.max(...ys) + span(ys) * 0.12);
  // Quadrant names sit just inside the corners, clear of the axes and their ticks.
  const x0 = bx.min + (bx.max - bx.min) * 0.02, x1 = bx.max - (bx.max - bx.min) * 0.02, y0 = by.min + (by.max - by.min) * 0.03, y1 = by.max - (by.max - by.min) * 0.03;
  const corner = (x: number, y: number, name: string, align: 'left' | 'right') => ({ value: [x, y], label: { show: true, formatter: name, ...small, color: AXIS, fontWeight: 'bold' as const, align, verticalAlign: y > lines.importance ? 'top' as const : 'bottom' as const } });
  const quadrants: SeriesOption = {
    type: 'scatter', clip: false, silent: true, symbolSize: 0, z: 1,
    data: [corner(x0, y1, '重点改进', 'left'), corner(x1, y1, '继续保持', 'right'), corner(x0, y0, '低优先', 'left'), corner(x1, y0, '过度投入', 'right')],
  };
  const attributes: SeriesOption = {
    type: 'scatter', clip: false, z: 3, symbolSize: 18, itemStyle: { color: accent, borderColor: '#FFFFFF', borderWidth: 2 },
    data: points.map(p => ({ value: [p.performance, p.importance], name: p.name })),
    label: { show: true, position: 'right', ...small, color: INK, formatter: (p: { name: string }) => p.name },
    labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
    markLine: { silent: true, symbol: 'none', lineStyle: { color: AXIS, type: 'dashed', width: 1.5 }, label: { show: false }, data: [{ xAxis: lines.performance }, { yAxis: lines.importance }] },
  };
  return { kind: 'quadrant', height: 620, option: {
    ...base(), grid: grid({ top: 40, bottom: 48, left: 32, right: 48 }),
    xAxis: valueAxis('表现', { ...lowerTitle, nameGap: 40, ...bx, splitLine: { show: false } }),
    yAxis: valueAxis(importanceAxis, { ...by, splitLine: { show: false } }),
    series: [quadrants, attributes],
  } };
}

/** Each cluster's centre on every standardized variable, as grouped bars about the overall mean (zero). */
export function clusterProfilePlot(centers: readonly (readonly number[])[], sizes: readonly number[], variables: readonly string[], ink: FigureInk): FigurePlan {
  if (centers.length < 2 || centers.some(c => c.length !== variables.length)) throw Error('聚类中心与变量不对应，无法作图。');
  const colours = categoryColors(ink, centers.length, false);
  return { kind: 'profile', height: clamp(380 + 18 * variables.length, 420, 680), option: {
    ...base(), legend, grid: grid({ top: 56, bottom: 24 }),
    xAxis: categoryAxis([...variables], false),
    yAxis: valueAxis('标准化中心（标准差）', niceBounds(Math.min(0, ...centers.flat()) - 0.15, Math.max(0, ...centers.flat()) + 0.15)),
    series: centers.map((c, j) => ({
      type: 'bar', clip: false, name: `第 ${j + 1} 类（n = ${sizes[j]}）`, data: c.map(v => Number(v.toFixed(3))), barMaxWidth: 36,
      itemStyle: { color: colours[j] },
      ...(j === 0 ? { markLine: { silent: true, symbol: 'none', lineStyle: { color: AXIS, width: 1.5 }, label: { show: false }, data: [{ yAxis: 0 }] } } : {}),
    })),
  } };
}

// The neutral answer of a rating scale; the low side of a scale with a real midpoint takes the ink's opposite hue.
const NEUTRAL = '#C9CDD2';
const mixHex = (a: string, b: string, t: number) => {
  const c = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  return `#${c(a).map((v, i) => Math.round(v + (c(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};
const SHAPES = ['circle', 'rect', 'diamond', 'triangle', 'pin', 'roundRect'] as const;

/**
 * Several dimensions compared across groups as a dot plot: one row per dimension, one marker per group (told apart by
 * shade and shape, named in the legend), a grey bar spanning the groups' means. Position on a common scale carries
 * the comparison, so the axis need not start at zero.
 */
export function dotPlot(dimensions: readonly string[], groups: readonly { label: string; n: number }[], means: readonly (readonly number[])[], ink: FigureInk): FigurePlan {
  if (dimensions.length < 2 || groups.length < 2 || means.some(row => row.length !== groups.length || !row.every(Number.isFinite))) throw Error('均值与分组不对应，无法作图。');
  const colours = categoryColors(ink, groups.length, false), all = means.flat(), bounds = niceBounds(Math.min(...all) - 0.15, Math.max(...all) + 0.15);
  const spans: CustomSeriesOption = {
    type: 'custom', silent: true, z: 1, data: means.map((row, i) => [i, Math.min(...row), Math.max(...row)]),
    renderItem: (_params, api) => {
      const i = Number(api.value(0)), a = api.coord([Number(api.value(1)), i]), b = api.coord([Number(api.value(2)), i]);
      return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#D5D9DE', lineWidth: 8, lineCap: 'round' } } as unknown as Group;
    },
  };
  return { kind: 'dots', height: clamp(150 + 62 * dimensions.length, 320, 760), option: {
    ...base(), legend: { ...legend, itemWidth: 16, itemHeight: 16 }, grid: grid({ top: 64, bottom: 24, right: 48 }),
    xAxis: valueAxis('组均值', { ...lowerTitle, ...bounds }),
    yAxis: categoryAxis([...dimensions], true),
    series: [spans, ...groups.map((g, j) => ({
      type: 'scatter' as const, name: `${g.label}（n = ${g.n}）`, z: 3, symbol: SHAPES[j % SHAPES.length], symbolSize: 18,
      itemStyle: { color: colours[j], borderColor: '#FFFFFF', borderWidth: 1.5, opacity: 1 },
      data: means.map((row, i) => [row[j], i]),
    }))],
  } };
}

/**
 * Rating items as diverging stacked bars: agreement to the right of the neutral answer, disagreement to the left, the
 * neutral share split across the centre line. Items run from the most to the least favourable.
 */
export function likertPlot(items: readonly string[], levels: readonly number[], shares: readonly (readonly number[])[], ink: FigureInk): FigurePlan {
  const accent = inkPrimary(ink), OPPOSITE = inkOpposite(ink);
  if (items.length < 2 || levels.length < 2 || shares.some(row => row.length !== levels.length)) throw Error('作答比例与等级不对应，无法作图。');
  const mid = (levels[0] + levels.at(-1)!) / 2, below = levels.filter(l => l < mid), above = levels.filter(l => l > mid), neutral = levels.indexOf(mid);
  const favour = (row: readonly number[]) => row.reduce((s, v, i) => s + (levels[i] > mid ? v : 0), 0);
  const order = items.map((_, i) => i).sort((a, b) => favour(shares[b]) - favour(shares[a]));
  const colourOf = (l: number) => {
    if (l === mid) return NEUTRAL;
    const side = l < mid ? below : above, rank = l < mid ? below.length - below.indexOf(l) : above.indexOf(l) + 1;
    const t = side.length === 1 ? 0 : 0.55 * (1 - (rank - 1) / (side.length - 1));
    return mixHex(l < mid ? OPPOSITE : accent, '#FFFFFF', t);
  };
  const pct = (v: number) => v * 100;
  // A segment's label is its level's whole share: the neutral answer, drawn as two halves, is labelled once with all of it.
  const segment = (name: string, l: number, values: number[], stack: 'left' | 'right', shown = values.map(Math.abs)) => ({
    type: 'bar' as const, name, stack, barWidth: '56%', data: values, itemStyle: { color: colourOf(l), borderColor: '#FFFFFF', borderWidth: 1 },
    label: { show: true, position: 'inside' as const, ...small, fontSize: 17, color: onFillInk(colourOf(l)), formatter: (p: { dataIndex: number }) => (shown[p.dataIndex] >= 7 && Math.abs(values[p.dataIndex]) >= 3.5 ? `${shown[p.dataIndex].toFixed(0)}%` : '') },
  });
  const half = (i: number) => (neutral >= 0 ? pct(shares[i][neutral]) / 2 : 0);
  // Each side stacks outward from the centre: the neutral half first, then the levels nearest the midpoint.
  const series = [
    ...(neutral >= 0 ? [segment(`${mid} 分`, mid, order.map(i => -half(i)), 'left', order.map(i => pct(shares[i][neutral]))), { ...segment(`${mid} 分`, mid, order.map(half), 'right'), label: { show: false } }] : []),
    ...[...below].reverse().map(l => segment(`${l} 分`, l, order.map(i => -pct(shares[i][levels.indexOf(l)])), 'left')),
    ...above.map(l => segment(`${l} 分`, l, order.map(i => pct(shares[i][levels.indexOf(l)])), 'right')),
  ];
  const extent = Math.max(...order.map(i => half(i) + below.reduce((s, l) => s + pct(shares[i][levels.indexOf(l)]), 0)), ...order.map(i => half(i) + above.reduce((s, l) => s + pct(shares[i][levels.indexOf(l)]), 0)));
  const reach = Math.min(100, Math.ceil(extent / 20) * 20);
  return { kind: 'likert', height: clamp(160 + 58 * items.length, 320, 760), option: {
    ...base(), legend: { ...legend, data: levels.map(l => `${l} 分`) }, grid: grid({ top: 64, bottom: 24, right: 40 }),
    xAxis: valueAxis('作答占比（%，中性回答居中）', { ...lowerTitle, min: -reach, max: reach, interval: 20, axisLabel: { ...small, formatter: (v: number) => `${Math.abs(v)}` } }),
    yAxis: categoryAxis(order.map(i => items[i]), true),
    series: series as SeriesOption[],
  } };
}
const onFillInk = (fill: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16) / 255).map(s => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.21 ? INK : '#FFFFFF';
};

/**
 * A correlation matrix as the lower triangle of a heat map on a scale centred at zero: positive in the accent,
 * negative in the opposite hue, each cell labelled with its coefficient. Rows are numbered as in the table.
 */
export function correlationPlot(variables: readonly string[], rho: (a: number, b: number) => number, ink: FigureInk): FigurePlan {
  const m = variables.length, accent = inkPrimary(ink), OPPOSITE = inkOpposite(ink);
  if (m < 3) throw Error('至少需要 3 个变量。');
  const deep = mixHex(accent, '#000000', 0.15), cells: [number, number, number][] = [];
  for (let i = 1; i < m; i++) for (let j = 0; j < i; j++) cells.push([j, i - 1, rho(i, j)]);
  const shade = (v: number) => (v >= 0 ? mixHex('#FFFFFF', deep, v) : mixHex('#FFFFFF', OPPOSITE, -v));
  return { kind: 'correlation', height: clamp(140 + 62 * (m - 1), 340, 760), option: {
    ...base(), grid: grid({ top: 40, right: 24, bottom: 16 }),
    xAxis: { type: 'category', data: variables.slice(0, -1).map((_, j) => `（${j + 1}）`), position: 'top', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...small, interval: 0 } },
    yAxis: { type: 'category', data: variables.slice(1).map((v, i) => `（${i + 2}）${v}`), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...small, interval: 0 } },
    visualMap: { show: false, min: -1, max: 1, dimension: 2, inRange: { color: [OPPOSITE, '#FFFFFF', deep] } },
    series: [{
      type: 'heatmap', data: cells, itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      label: {
        show: true, ...small, fontSize: 18,
        formatter: (p: { value: unknown }) => { const v = Number((p.value as number[])[2]); return `{${onFillInk(shade(v)) === INK ? 'ink' : 'paper'}|${minus(v.toFixed(2))}}`; },
        rich: { ink: { ...small, fontSize: 18, color: INK }, paper: { ...small, fontSize: 18, color: '#FFFFFF' } },
      },
    }],
  } };
}

/**
 * A method's figure travels in its registered result: the numbers it plots are the result's metrics, labelled
 * "名称｜量", so the preview, the editor and the Word export redraw the same figure from the stored result alone.
 * A figure whose numbers do not fit the result's 40 metrics is left out; the table still carries every value.
 */
export type FigureMetric = { label: string; value: number };
export type MethodFigureData =
  | { kind: 'forest'; rows: readonly { name: string; estimate: number; low: number; high: number }[] }
  | { kind: 'scree'; eigenvalues: readonly number[] }
  | { kind: 'quadrant'; points: readonly { name: string; importance: number; performance: number }[]; lines: { importance: number; performance: number } }
  | { kind: 'profile'; centers: readonly (readonly number[])[]; sizes: readonly number[]; variables: readonly string[] }
  | { kind: 'dots'; dimensions: readonly string[]; groups: readonly { label: string; n: number }[]; means: readonly (readonly number[])[] }
  | { kind: 'likert'; items: readonly string[]; levels: readonly number[]; shares: readonly (readonly number[])[] }
  | { kind: 'correlation'; variables: readonly string[]; pairs: readonly { a: number; b: number; rho: number }[] };
const SEP = '｜', PAIR = ' ↔ ', MAX_METRICS = 40;
const key = (name: string) => name.replace(/\s+/gu, ' ').trim().slice(0, 120) || '未命名';

export function figureMetrics(data: MethodFigureData): FigureMetric[] | null {
  const metrics: FigureMetric[] = data.kind === 'forest' ? data.rows.flatMap(r => [{ label: `${key(r.name)}${SEP}估计值`, value: r.estimate }, { label: `${key(r.name)}${SEP}下限`, value: r.low }, { label: `${key(r.name)}${SEP}上限`, value: r.high }])
    : data.kind === 'scree' ? data.eigenvalues.map((value, j) => ({ label: `特征值${SEP}${j + 1}`, value }))
      : data.kind === 'quadrant' ? [{ label: `分界线${SEP}重要性`, value: data.lines.importance }, { label: `分界线${SEP}表现`, value: data.lines.performance },
        ...data.points.flatMap(p => [{ label: `${key(p.name)}${SEP}重要性`, value: p.importance }, { label: `${key(p.name)}${SEP}表现`, value: p.performance }])]
        : data.kind === 'profile' ? data.centers.flatMap((c, j) => [{ label: `第 ${j + 1} 类${SEP}人数`, value: data.sizes[j] }, ...c.map((value, d) => ({ label: `第 ${j + 1} 类${SEP}${key(data.variables[d])}`, value }))])
          // A dot plot: each group's size, then every dimension's mean in each group.
          : data.kind === 'dots' ? [...data.groups.map(g => ({ label: `人数${SEP}${key(g.label)}`, value: g.n })), ...data.dimensions.flatMap((d, i) => data.groups.map((g, j) => ({ label: `${key(d)}${SEP}${key(g.label)}`, value: data.means[i][j] })))]
            : data.kind === 'likert' ? data.items.flatMap((item, i) => data.levels.map((l, k) => ({ label: `${key(item)}${SEP}${l} 分`, value: data.shares[i][k] })))
              : data.pairs.map(p => ({ label: `${key(data.variables[p.a])}${PAIR}${key(data.variables[p.b])}${SEP}ρ`, value: p.rho }));
  return metrics.length <= MAX_METRICS && metrics.every(m => Number.isFinite(m.value)) ? metrics : null;
}

const FIGURE_OF: Record<string, MethodFigureData['kind']> = { regression: 'forest', logistic: 'forest', validity: 'scree', ipa: 'quadrant', cluster: 'profile', profile: 'dots', likert: 'likert', correlation: 'correlation' };
// Advanced methods whose results are tables of formatted text: they have no figure but their own.
const ADVANCED = new Set([...Object.keys(FIGURE_OF), 'ahp']);

/** Whether a result carries a method figure: every exporter then draws that figure instead of bars of a column. */
export const carriesFigure = (r: { method: string; metrics: readonly { label: string }[] }): boolean =>
  !!FIGURE_OF[r.method] && r.metrics.length > 0 && r.metrics.every(m => m.label.includes(SEP));

/** Whether a result can be shown as a figure at all: not a sampling frame, and an advanced method only through its own figure. */
export const canChart = (r: { method: string; metrics: readonly { label: string }[] }): boolean =>
  r.method !== 'sampling-frame' && (!ADVANCED.has(r.method) || carriesFigure(r));

/** The figure a method's result carries, or null when the result is of another method or carries none. */
export function methodFigure(r: { method: string; headers: readonly string[]; metrics: readonly { label: string; value: number | null }[] }, ink: FigureInk): FigurePlan | null {
  const accent = inkPrimary(ink), kind = FIGURE_OF[r.method], parts = r.metrics.map(m => ({ head: m.label.slice(0, m.label.lastIndexOf(SEP)), field: m.label.slice(m.label.lastIndexOf(SEP) + 1), value: m.value }));
  if (!carriesFigure(r) || parts.some(p => p.value === null || !p.head)) return null;
  const pick = (head: string, field: string) => parts.find(p => p.head === head && p.field === field)?.value as number;
  const heads = [...new Set(parts.map(p => p.head))];
  switch (kind) {
    case 'forest': {
      const rows = heads.map(name => ({ name, estimate: pick(name, '估计值'), low: pick(name, '下限'), high: pick(name, '上限') }));
      return r.method === 'logistic'
        ? forestPlot(rows, { axis: '发生比比率 OR（95% 置信区间，对数刻度）', reference: 1 }, accent)
        : forestPlot(rows, { axis: '回归系数 B（95% 置信区间）', reference: 0 }, accent);
    }
    case 'scree': return screePlot(parts.map(p => p.value as number), accent);
    case 'quadrant': {
      const names = heads.filter(h => h !== '分界线');
      return ipaPlot(names.map(name => ({ name, importance: pick(name, '重要性'), performance: pick(name, '表现') })), { importance: pick('分界线', '重要性'), performance: pick('分界线', '表现') },
        accent, r.headers[1]?.startsWith('隐性') ? '隐性重要性（标准化系数）' : '重要性');
    }
    case 'profile': {
      // A cluster's label is "第 j 类｜变量"; the variable is everything after the first separator.
      const split = r.metrics.map(m => ({ head: m.label.slice(0, m.label.indexOf(SEP)), field: m.label.slice(m.label.indexOf(SEP) + 1), value: m.value as number }));
      const clusters = [...new Set(split.map(p => p.head))], variables = [...new Set(split.filter(p => p.field !== '人数').map(p => p.field))];
      const value = (head: string, field: string) => split.find(p => p.head === head && p.field === field)?.value as number;
      return clusterProfilePlot(clusters.map(c => variables.map(v => value(c, v))), clusters.map(c => value(c, '人数')), variables, ink);
    }
    case 'dots': {
      const groups = parts.filter(p => p.head === '人数').map(p => ({ label: p.field, n: p.value as number })), dimensions = heads.filter(h => h !== '人数');
      return dotPlot(dimensions, groups, dimensions.map(d => groups.map(g => pick(d, g.label))), ink);
    }
    case 'likert': {
      const levels = [...new Set(parts.map(p => Number.parseInt(p.field, 10)))];
      return likertPlot(heads, levels, heads.map(h => levels.map(l => pick(h, `${l} 分`))), ink);
    }
    case 'correlation': {
      const pairs = heads.map(h => h.split(PAIR)), variables = [...new Set(pairs.flat())];
      if (pairs.some(p => p.length !== 2)) return null;
      return correlationPlot(variables, (a, b) => pick(`${variables[Math.min(a, b)]}${PAIR}${variables[Math.max(a, b)]}`, 'ρ'), ink);
    }
  }
}
