/**
 * Figures of the advanced methods, in the report's one-hue style (lib/report-figures.ts): a forest plot of
 * coefficients or odds ratios with their 95 % intervals against the no-effect line, a scree plot with Kaiser's line,
 * the IPA quadrant chart, and cluster profiles on standardized variables. Each returns a figure plan; planSVG renders
 * it as report SVG.
 */
import type { CustomSeriesOption, SeriesOption } from 'echarts';
import { AXIS, FONT, INK, accentScale, base, categoryAxis, grid, legend, lowerTitle, minus, small, valueAxis, type FigurePlan } from './report-figures.ts';

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(v)));
type Group = ReturnType<NonNullable<CustomSeriesOption['renderItem']>>;

/** Axis bounds on a round step (1, 2, 2.5 or 5 × 10ᵏ) about five ticks apart, so no axis ends on a raw value. */
export function niceBounds(low: number, high: number, ticks = 5): { min: number; max: number; interval: number } {
  const raw = (high - low || Math.abs(high) || 1) / ticks, power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(v => v >= raw * 0.999)!;
  const round = (v: number) => Number(v.toPrecision(12));
  return { min: round(Math.floor(low / step) * step), max: round(Math.ceil(high / step) * step), interval: round(step) };
}
/** Bounds of a logarithmic axis on the 1–2–5 sequence, covering both values. */
export function niceLogBounds(low: number, high: number): { min: number; max: number } {
  const marks = [-3, -2, -1, 0, 1, 2, 3].flatMap(k => [1, 2, 5].map(m => Number((m * 10 ** k).toPrecision(6))));
  return { min: [...marks].reverse().find(v => v <= low) ?? marks[0], max: marks.find(v => v >= high) ?? marks.at(-1)! };
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
export function clusterProfilePlot(centers: readonly (readonly number[])[], sizes: readonly number[], variables: readonly string[], accent: string): FigurePlan {
  if (centers.length < 2 || centers.some(c => c.length !== variables.length)) throw Error('聚类中心与变量不对应，无法作图。');
  const colours = accentScale(accent, centers.length);
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
