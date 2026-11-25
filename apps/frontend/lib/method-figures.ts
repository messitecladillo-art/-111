/**
 * Figures of the advanced methods, in the report's one-hue style (lib/report-figures.ts): a forest plot of
 * coefficients or odds ratios with their 95 % intervals against the no-effect line, a scree plot with Kaiser's line,
 * the IPA quadrant chart, and cluster profiles on standardized variables. Each returns a figure plan; planSVG renders
 * it as report SVG.
 */
import type { CustomSeriesOption, SeriesOption } from 'echarts';
import { AXIS, FONT, GRID, INK, base, categoryAxis, categoryColors, grid, inkOpposite, inkPrimary, legend, lowerTitle, minus, small, tickLabel, valueAxis, wrapLabel, type FigurePlan } from './report-figures.ts';
import { isResourceLibrarySnapshot } from './resource-library/snapshot-vector-bridge.ts';
import type { FigureInk } from './figure-palette.ts';

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(v)));
const clampFloat = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
const textUnits = (s: string) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
const textPx = (s: string, fontSize: number) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? fontSize : fontSize * 0.56), 0);
type Group = ReturnType<NonNullable<CustomSeriesOption['renderItem']>>;

/** Sanitize any label rendered into method SVG `<text>` so zero brackets, braces, `&amp;`, or `…` ever appear. */
function sanitizeSvgLabel(raw: string): string {
  return raw
    .replace(/[\u3010\u3011\u300C\u300D\u300E\u300F{}]/gu, '')
    .replace(/\s*&\s*/gu, '与')
    .replace(/\u2026+|\.{3,}/gu, '')
    .trim();
}

/** Strip raw English variable prefixes/identifiers while preserving pure Chinese dimension & attribute labels. */
export function cleanChineseChartLabel(raw: string): string {
  const trimmed = sanitizeSvgLabel(raw);
  if (!/[\u4e00-\u9fff]/u.test(trimmed)) return trimmed;
  let cleaned = trimmed;
  for (let pass = 0; pass < 3; pass++) {
    const next = cleaned
      .replace(/^(?:\[[A-Za-z0-9_.\-]+\]|[A-Za-z][A-Za-z0-9_.\-]*\s*[:：._\-—)）]?)\s*/u, '')
      .trim();
    if (!next || !/[\u4e00-\u9fff]/u.test(next) || next === cleaned) break;
    cleaned = next;
  }
  cleaned = cleaned
    .replace(/\s*[（(][A-Za-z][A-Za-z0-9_.\-\s]*[）)]\s*/gu, '')
    .replace(/\b[A-Za-z]+_[A-Za-z0-9_]+\b/gu, '')
    .replace(/^(?:注|说明|维度[一二三四五六七八九十\d]+|指标[一二三四五六七八九十\d]+)[：:]\s*/u, '')
    .replace(/^[.．、:：_\-—\s]+|[.．、:：_\-—\s]+$/gu, '')
    .trim();
  return cleaned || trimmed;
}

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

function logTickMarks(min: number, max: number): number[] {
  const from = Math.floor(Math.log10(min)) - 1, to = Math.ceil(Math.log10(max)) + 1;
  const all = Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .flatMap(k => [1, 2, 5].map(m => Number((m * 10 ** k).toPrecision(6))))
    .filter(v => v >= min * 0.999999 && v <= max * 1.000001);
  if (all.length <= 2) {
    const mid = Number(((min + max) / 2).toPrecision(4));
    return [...new Set([min, mid, max])].sort((a, b) => a - b);
  }
  if (all.length <= 8) return all;
  const powers = Array.from({ length: to - from + 1 }, (_, i) => Number((10 ** (from + i)).toPrecision(6)))
    .filter(v => v > min * 1.05 && v < max * 0.95);
  const stride = Math.max(1, Math.ceil(powers.length / 5));
  return [...new Set([min, ...powers.filter((_, idx) => idx % stride === 0), max])].sort((a, b) => a - b);
}

/**
 * Estimates with their 95 % intervals, one row each, against the line of no effect: 0 for coefficients, 1 for odds
 * ratios (on a logarithmic axis with 1–2–5 intermediate ticks, where an interval is symmetric about the estimate).
 */
export function forestPlot(rows: readonly { name: string; estimate: number; low: number; high: number }[], options: { axis: string; reference: 0 | 1 }, accent: string): FigurePlan {
  const log = options.reference === 1;
  if (!rows.length || rows.some(r => ![r.estimate, r.low, r.high].every(Number.isFinite) || (log && Math.min(r.estimate, r.low) <= 0))) throw Error('估计值或置信区间不完整，无法作图。');
  const labels = rows.map(r => sanitizeSvgLabel(r.name)), lo = Math.min(options.reference, ...rows.map(r => r.low)), hi = Math.max(options.reference, ...rows.map(r => r.high));
  const logBounds = log ? niceLogBounds(lo, hi) : null;
  const logTicks = logBounds ? logTickMarks(logBounds.min, logBounds.max) : [];
  const toX = (v: number) => (log ? Math.log10(v) : v);
  const marks: CustomSeriesOption = {
    type: 'custom', clip: false, silent: true, data: rows.map((r, i) => [i, r.estimate, r.low, r.high]),
    renderItem: (params, api) => {
      const i = Number(api.value(0)), at = (v: number) => api.coord([toX(v), i]), style = { stroke: accent, lineWidth: 3 };
      const point = at(Number(api.value(1))), a = at(Number(api.value(2))), b = at(Number(api.value(3)));
      const children: object[] = [
        { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style },
        { type: 'line', shape: { x1: a[0], y1: a[1] - 9, x2: a[0], y2: a[1] + 9 }, style },
        { type: 'line', shape: { x1: b[0], y1: b[1] - 9, x2: b[0], y2: b[1] + 9 }, style },
        { type: 'rect', shape: { x: point[0] - 8, y: point[1] - 8, width: 16, height: 16 }, style: { fill: accent, stroke: '#FFFFFF', lineWidth: 2 } },
      ];
      if (i === 0) {
        const area = (params as unknown as { coordSys: { y: number; height: number } }).coordSys, bottomY = area.y + area.height;
        const zero = api.coord([toX(options.reference), 0]);
        const guides: object[] = [];
        if (log) {
          for (const tk of logTicks) {
            const tx = api.coord([Math.log10(tk), 0])[0];
            if (Math.abs(tk - options.reference) > 1e-9) {
              guides.push({ type: 'line', shape: { x1: tx, y1: area.y, x2: tx, y2: bottomY }, style: { stroke: GRID, lineWidth: 1, lineDash: [4, 4] } });
            }
            guides.push(
              { type: 'line', shape: { x1: tx, y1: bottomY, x2: tx, y2: bottomY + 5 }, style: { stroke: AXIS, lineWidth: 1 } },
              { type: 'text', x: tx, y: bottomY + 10, style: { text: tickLabel(tk), fill: INK, fontSize: 20, fontFamily: FONT, align: 'center', verticalAlign: 'top' } },
            );
          }
        }
        guides.push({ type: 'line', shape: { x1: zero[0], y1: area.y, x2: zero[0], y2: bottomY }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [6, 5] } });
        children.unshift(...guides);
      }
      return { type: 'group', children } as unknown as Group;
    },
  };
  const pad = (hi - lo) * 0.05 || 0.1;
  return { kind: 'forest', height: clamp((log ? 140 : 120) + 64 * rows.length, 280, 760), option: {
    ...base(), grid: grid({ left: 24, right: 48, top: 24, bottom: log ? 52 : 24 }),
    xAxis: log
      ? valueAxis(options.axis, {
          ...lowerTitle, nameGap: 42,
          min: Math.log10(logBounds!.min), max: Math.log10(logBounds!.max),
          axisLine: { show: true, onZero: false, lineStyle: { color: AXIS } },
          axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false },
        })
      : valueAxis(options.axis, { ...lowerTitle, axisLine: { show: true, onZero: false, lineStyle: { color: AXIS } }, ...niceBounds(lo - pad, hi + pad) }),
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
      type: 'custom', clip: false, silent: true, data: [[0]],
      renderItem: (params, api) => {
        const area = (params as unknown as { coordSys: { x: number; width: number } }).coordSys, one = api.coord([0, 1]);
        const points = eigenvalues.map((v, i) => api.coord([i, v]));
        const children: object[] = [
          { type: 'line', shape: { x1: area.x, y1: one[1], x2: area.x + area.width, y2: one[1] }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [6, 5] } },
          { type: 'text', x: area.x + area.width, y: one[1] - 8, style: { text: '特征值 = 1', fill: AXIS, stroke: '#FFFFFF', lineWidth: 3, fontSize: 20, fontFamily: FONT, align: 'right', verticalAlign: 'bottom' } },
          { type: 'polyline', shape: { points }, style: { stroke: accent, lineWidth: 3, fill: 'none' } },
          ...points.flatMap((p, i) => [
            { type: 'circle', shape: { cx: p[0], cy: p[1], r: 7 }, style: { fill: accent, stroke: '#FFFFFF', lineWidth: 2 } },
            // Only the retained factors (eigenvalue at least one) are labelled; the table gives every eigenvalue, and labels
            // on the flat tail would sit on the line or on Kaiser's line.
            ...(eigenvalues[i] >= 1 ? [{ type: 'text', x: p[0], y: p[1] - 14, style: { text: minus(eigenvalues[i].toFixed(2)), fill: INK, stroke: '#FFFFFF', lineWidth: 3.5, fontSize: 20, fontFamily: FONT, align: 'center', verticalAlign: 'bottom' } }] : []),
          ]),
        ];
        return { type: 'group', children } as unknown as Group;
      },
    } satisfies CustomSeriesOption],
  } };
}

type Box2D = { x0: number; y0: number; x1: number; y1: number };
type LabelCand = {
  box: Box2D;
  tx: number;
  ty: number;
  align: 'left' | 'right' | 'center';
  anchorX: number;
  anchorY: number;
};

function boxOverlapArea(a: Box2D, b: Box2D, padX = 0, padY = 0): number {
  const ox = Math.min(a.x1 + padX, b.x1) - Math.max(a.x0 - padX, b.x0);
  const oy = Math.min(a.y1 + padY, b.y1) - Math.max(a.y0 - padY, b.y0);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function pointToSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1);
  const t = clampFloat(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function segsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const ccw = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number) =>
    (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
  return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) && ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
}

function segHitsBox(x1: number, y1: number, x2: number, y2: number, b: Box2D): boolean {
  if ((x1 >= b.x0 && x1 <= b.x1 && y1 >= b.y0 && y1 <= b.y1) || (x2 >= b.x0 && x2 <= b.x1 && y2 >= b.y0 && y2 <= b.y1)) return true;
  return (
    segsCross(x1, y1, x2, y2, b.x0, b.y0, b.x1, b.y0) ||
    segsCross(x1, y1, x2, y2, b.x1, b.y0, b.x1, b.y1) ||
    segsCross(x1, y1, x2, y2, b.x0, b.y1, b.x1, b.y1) ||
    segsCross(x1, y1, x2, y2, b.x0, b.y0, b.x0, b.y1)
  );
}

/**
 * Pure-white borderless Side-by-Side Dual-Panel IPA Chart:
 * Left panel: attributes ranked by performance mean with overall mean reference line;
 * Right panel: non-circular regression-derived implicit (or stated) IPA 4-quadrant scatter matrix.
 */
export function ipaPlot(points: readonly { name: string; importance: number; performance: number }[], lines: { importance: number; performance: number }, ink: FigureInk, importanceAxis = '重要性'): FigurePlan {
  if (points.length < 2) throw Error('IPA 至少需要两个属性。');
  const cleanPoints = points.map(p => ({ ...p, name: cleanChineseChartLabel(p.name) }));
  const accent = inkPrimary(ink), act = inkOpposite(ink);
  const isImplicit = importanceAxis !== '重要性';
  const xs = [...cleanPoints.map(p => p.performance), lines.performance], ys = [...cleanPoints.map(p => p.importance), lines.importance];
  const span = (v: number[]) => (Math.max(...v) - Math.min(...v)) || 1;
  const sx = span(xs), sy = span(ys);
  const bx = niceBounds(Math.min(...xs) - sx * 0.26, Math.max(...xs) + sx * 0.28);
  let by = niceBounds(Math.min(...ys) - sy * 0.15, Math.max(...ys) + sy * 0.15);
  if (by.min >= Math.min(...ys)) {
    by = { ...by, min: Number((by.min - by.interval).toPrecision(12)) };
  }
  const urgent = (p: { importance: number; performance: number }) => p.importance >= lines.importance && p.performance < lines.performance;

  // Left Panel: performance ranking (sorted high -> low; yAxis is inverse: true so index 0 sits at the top)
  const ranked = [...cleanPoints].sort((a, b) => b.performance - a.performance);
  const maxPerfVal = Math.max(...xs, 0.1);
  const barXMax = maxPerfVal <= 5 && Math.min(...xs) >= 0
    ? 5
    : niceBounds(0, maxPerfVal * 1.14, 4).max;
  const barXInterval = barXMax === 5 ? 1 : niceBounds(0, barXMax, 4).interval;

  const leftBarsCustom: CustomSeriesOption = {
    type: 'custom', xAxisIndex: 0, yAxisIndex: 0, clip: false, silent: true, z: 3,
    data: ranked.map((p, idx) => [idx, p.performance, urgent(p) ? 1 : 0]),
    renderItem: (params, api) => {
      const idx = Number(api.value(0));
      const val = Number(api.value(1));
      const isUrgent = Number(api.value(2)) === 1;
      const area = (params as unknown as { coordSys: { x: number; y: number; width: number; height: number } }).coordSys;
      const start = api.coord([0, idx]);
      const end = api.coord([val, idx]);
      const fullEnd = api.coord([barXMax, idx]);
      const barH = Math.min(22, Math.max(12, Math.floor((area.height / ranked.length) * 0.52)));
      const barColor = isUrgent ? act : accent;
      const barW = Math.max(2, end[0] - start[0]);
      const fullW = Math.max(2, fullEnd[0] - start[0]);

      const children: object[] = [
        {
          type: 'rect',
          shape: { x: start[0], y: start[1] - barH / 2, width: fullW, height: barH, r: 4 },
          style: { fill: '#EEF2F6' },
        },
        {
          type: 'rect',
          shape: { x: start[0], y: start[1] - barH / 2, width: barW, height: barH, r: 4 },
          style: { fill: barColor },
        },
        {
          type: 'text',
          x: end[0] + 7,
          y: start[1],
          style: {
            text: minus(val.toFixed(2)),
            fill: isUrgent ? act : INK,
            stroke: '#FFFFFF',
            lineWidth: 3,
            fontSize: 16,
            fontFamily: FONT,
            fontWeight: 'bold',
            align: 'left',
            verticalAlign: 'middle',
          },
        },
      ];

      if (idx === 0) {
        const meanCoord = api.coord([lines.performance, 0]);
        children.unshift(
          {
            type: 'line',
            shape: { x1: 454, y1: area.y - 28, x2: 454, y2: area.y + area.height + 36 },
            style: { stroke: '#E2E8F0', lineWidth: 1 },
          },
          {
            type: 'line',
            shape: { x1: meanCoord[0], y1: area.y - 4, x2: meanCoord[0], y2: area.y + area.height },
            style: { stroke: AXIS, lineWidth: 1.4, lineDash: [5, 4] },
          },
          {
            type: 'text',
            x: meanCoord[0],
            y: area.y - 9,
            style: {
              text: `均值 ${minus(lines.performance.toFixed(2))}`,
              fill: AXIS,
              stroke: '#FFFFFF',
              lineWidth: 3,
              fontSize: 15,
              fontFamily: FONT,
              align: 'center',
              verticalAlign: 'bottom',
            },
          },
        );
      }

      return { type: 'group', children } as unknown as Group;
    },
  };

  // Right Panel: deterministic server-side 2D collision-free quadrant scatter + leader lines
  const scene: CustomSeriesOption = {
    type: 'custom', xAxisIndex: 1, yAxisIndex: 1, clip: false, silent: true, z: 3, data: [[0]],
    renderItem: (params, api) => {
      const area = (params as unknown as { coordSys: { x: number; y: number; width: number; height: number } }).coordSys;
      const [vx, hy] = api.coord([lines.performance, lines.importance]);
      const dash = { stroke: AXIS, lineWidth: 1.5, lineDash: [6, 5] };
      const qLabel = (x: number, y: number, text: string, align: 'left' | 'right', verticalAlign: 'top' | 'bottom', tintFill = AXIS) =>
        ({ type: 'text', x, y, style: { text, fill: tintFill, stroke: '#FFFFFF', lineWidth: 3, fontSize: 17, fontFamily: FONT, fontWeight: 'bold', align, verticalAlign } });
      const left = area.x + 8, right = area.x + area.width - 8, top = area.y + 7, bottom = area.y + area.height - 7;

      const qTopLeft = isImplicit ? '优先改进' : '重点改进';
      const qTopRight = isImplicit ? '优势维持' : '继续保持';
      const qBotLeft = isImplicit ? '次要改进' : '低优先';
      const qBotRight = '过度投入';

      const cornerBoxes: Box2D[] = [
        { x0: area.x + 4, y0: area.y + 4, x1: area.x + 92, y1: area.y + 30 },
        { x0: area.x + area.width - 92, y0: area.y + 4, x1: area.x + area.width - 4, y1: area.y + 30 },
        { x0: area.x + 4, y0: area.y + area.height - 30, x1: area.x + 92, y1: area.y + area.height - 4 },
        { x0: area.x + area.width - 92, y0: area.y + area.height - 30, x1: area.x + area.width - 4, y1: area.y + area.height - 4 },
      ];

      const fontSz = 16;
      const pts = cleanPoints.map(p => {
        const [px, py] = api.coord([p.performance, p.importance]);
        return { ...p, px, py, w: textPx(p.name, fontSz) + 6, h: 20, color: urgent(p) ? act : accent };
      });
      const pointBoxes: Box2D[] = pts.map(p => ({ x0: p.px - 10, y0: p.py - 10, x1: p.px + 10, y1: p.py + 10 }));

      const candsFor = (p: (typeof pts)[number]): LabelCand[] => {
        const out: LabelCand[] = [];
        const dys = [0, -12, 12, -24, 24, -36, 36, -50, 50, -64, 64, -80, 80, -98, 98, -118, 118];
        for (const dx of [12, 20, 32, 46, 62, 80]) {
          for (const dy of dys) {
            const x0 = p.px + dx, x1 = x0 + p.w, cy = p.py + dy, y0 = cy - p.h / 2, y1 = cy + p.h / 2;
            out.push({ box: { x0, y0, x1, y1 }, tx: x0 + 3, ty: cy, align: 'left', anchorX: x0, anchorY: clampFloat(p.py, y0 + 3, y1 - 3) });
          }
        }
        for (const dx of [-12, -20, -32, -46, -62, -80]) {
          for (const dy of dys) {
            const x1 = p.px + dx, x0 = x1 - p.w, cy = p.py + dy, y0 = cy - p.h / 2, y1 = cy + p.h / 2;
            out.push({ box: { x0, y0, x1, y1 }, tx: x1 - 3, ty: cy, align: 'right', anchorX: x1, anchorY: clampFloat(p.py, y0 + 3, y1 - 3) });
          }
        }
        for (const dy of [-18, 18, -34, 34, -50, 50, -68, 68]) {
          for (const dx of [0, -24, 24, -48, 48]) {
            const cx = p.px + dx, cy = p.py + dy, x0 = cx - p.w / 2, x1 = cx + p.w / 2, y0 = cy - p.h / 2, y1 = cy + p.h / 2;
            out.push({ box: { x0, y0, x1, y1 }, tx: cx, ty: cy, align: 'center', anchorX: clampFloat(p.px, x0 + 6, x1 - 6), anchorY: dy < 0 ? y1 : y0 });
          }
        }
        return out;
      };

      const allCands = pts.map(candsFor);
      const chosen: (LabelCand | null)[] = Array(pts.length).fill(null);

      const costOf = (idx: number, c: LabelCand): number => {
        const p = pts[idx], b = c.box;
        let cost = 0;
        const outLeft = Math.max(0, area.x + 4 - b.x0), outRight = Math.max(0, b.x1 - (area.x + area.width - 4));
        const outTop = Math.max(0, area.y + 4 - b.y0), outBottom = Math.max(0, b.y1 - (area.y + area.height - 4));
        const outTotal = outLeft + outRight + outTop + outBottom;
        if (outTotal > 0) cost += 1_000_000 + outTotal * 5_000;

        for (let k = 0; k < pointBoxes.length; k++) {
          const ov = boxOverlapArea(b, pointBoxes[k], 2, 2);
          if (ov > 0) cost += 90_000 + ov * 300;
        }
        for (const cb of cornerBoxes) {
          const ov = boxOverlapArea(b, cb, 2, 2);
          if (ov > 0) cost += 70_000 + ov * 250;
        }
        for (let j = 0; j < chosen.length; j++) {
          if (j === idx || !chosen[j]) continue;
          const ov = boxOverlapArea(b, chosen[j]!.box, 4, 2);
          if (ov > 0) cost += 80_000 + ov * 320;
        }

        if (b.y0 - 2 < hy && b.y1 + 2 > hy) cost += 95_000;
        if (b.x0 - 2 < vx && b.x1 + 2 > vx) cost += 95_000;
        const midX = (b.x0 + b.x1) / 2, midY = (b.y0 + b.y1) / 2;
        if ((midX - vx) * (p.px - vx) < -2) cost += 165_000;
        if ((midY - hy) * (p.py - hy) < -2) cost += 140_000;

        const dist = Math.hypot(c.anchorX - p.px, c.anchorY - p.py);
        if (dist > 14) {
          for (let k = 0; k < pts.length; k++) {
            if (k === idx) continue;
            if (pointToSegDist(pts[k].px, pts[k].py, p.px, p.py, c.anchorX, c.anchorY) < 11) cost += 42_000;
          }
          for (let j = 0; j < chosen.length; j++) {
            if (j === idx || !chosen[j]) continue;
            if (segHitsBox(p.px, p.py, c.anchorX, c.anchorY, chosen[j]!.box)) cost += 75_000;
            if (segsCross(p.px, p.py, c.anchorX, c.anchorY, pts[j].px, pts[j].py, chosen[j]!.anchorX, chosen[j]!.anchorY)) cost += 110_000;
          }
        }

        cost += dist * 0.65 + Math.abs(c.ty - p.py) * 0.28;
        if (c.align === 'left' && Math.abs(c.ty - p.py) < 1) cost -= 6;
        return cost;
      };

      const order = pts
        .map((p, i) => ({
          i,
          crowd: pts.reduce((s, q, k) => (k === i ? s : s + 1 / ((p.px - q.px) ** 2 + (p.py - q.py) ** 2 + 400)), 0),
        }))
        .sort((a, b) => b.crowd - a.crowd || pts[a.i].py - pts[b.i].py || pts[a.i].px - pts[b.i].px)
        .map(x => x.i);

      for (const idx of order) {
        let best = allCands[idx][0], bestCost = Infinity;
        for (const cand of allCands[idx]) {
          const c = costOf(idx, cand);
          if (c < bestCost) { bestCost = c; best = cand; }
        }
        chosen[idx] = best;
      }
      for (let pass = 0; pass < 4; pass++) {
        for (const idx of order) {
          let best = chosen[idx]!, bestCost = costOf(idx, best);
          for (const cand of allCands[idx]) {
            const c = costOf(idx, cand);
            if (c + 0.01 < bestCost) { bestCost = c; best = cand; }
          }
          chosen[idx] = best;
        }
        for (let a = 0; a < pts.length; a++) {
          for (let b = a + 1; b < pts.length; b++) {
            const ca = chosen[a]!, cb = chosen[b]!;
            const crossed =
              segsCross(pts[a].px, pts[a].py, ca.anchorX, ca.anchorY, pts[b].px, pts[b].py, cb.anchorX, cb.anchorY) ||
              segHitsBox(pts[a].px, pts[a].py, ca.anchorX, ca.anchorY, cb.box) ||
              segHitsBox(pts[b].px, pts[b].py, cb.anchorX, cb.anchorY, ca.box);
            if (!crossed) continue;
            const curPairCost = costOf(a, ca) + costOf(b, cb);
            chosen[a] = null;
            chosen[b] = null;
            let bestA = ca, bestB = cb, bestPair = curPairCost;
            const topA = [...allCands[a]].sort((x, y) => costOf(a, x) - costOf(a, y)).slice(0, 48);
            const topB = [...allCands[b]].sort((x, y) => costOf(b, x) - costOf(b, y)).slice(0, 48);
            for (const candA of topA) {
              chosen[a] = candA;
              const cA = costOf(a, candA);
              if (cA >= bestPair) continue;
              for (const candB of topB) {
                chosen[b] = candB;
                const total = costOf(a, candA) + costOf(b, candB);
                if (total + 0.1 < bestPair) {
                  bestPair = total;
                  bestA = candA;
                  bestB = candB;
                }
              }
              chosen[b] = null;
            }
            chosen[a] = bestA;
            chosen[b] = bestB;
          }
        }
      }

      const leaders: object[] = [];
      const dots: object[] = [];
      const texts: object[] = [];
      pts.forEach((p, idx) => {
        const c = chosen[idx]!;
        const dx = c.anchorX - p.px, dy = c.anchorY - p.py, dist = Math.hypot(dx, dy);
        if (dist > 15) {
          const ux = dx / dist, uy = dy / dist;
          leaders.push({
            type: 'line',
            shape: { x1: p.px + ux * 9, y1: p.py + uy * 9, x2: c.anchorX, y2: c.anchorY },
            style: { stroke: AXIS, lineWidth: 1.2, opacity: 0.65 },
          });
        }
        dots.push({
          type: 'circle',
          shape: { cx: p.px, cy: p.py, r: 8 },
          style: { fill: p.color, stroke: '#FFFFFF', lineWidth: 2 },
        });
        texts.push({
          type: 'text',
          x: c.tx,
          y: c.ty,
          style: {
            text: p.name,
            fill: INK,
            stroke: '#FFFFFF',
            lineWidth: 3.5,
            fontSize: fontSz,
            fontFamily: FONT,
            align: c.align,
            verticalAlign: 'middle',
          },
        });
      });

      const priorityZoneW = Math.max(0, Math.min(area.width, vx - area.x));
      const priorityZoneH = Math.max(0, Math.min(area.height, hy - area.y));

      return {
        type: 'group',
        children: [
          ...(priorityZoneW > 4 && priorityZoneH > 4
            ? [{ type: 'rect', shape: { x: area.x, y: area.y, width: priorityZoneW, height: priorityZoneH }, style: { fill: mixHex(act, '#FFFFFF', 0.94) } }]
            : []),
          { type: 'line', shape: { x1: vx, y1: area.y, x2: vx, y2: area.y + area.height }, style: dash },
          { type: 'line', shape: { x1: area.x, y1: hy, x2: area.x + area.width, y2: hy }, style: dash },
          qLabel(left, top, qTopLeft, 'left', 'top', act),
          qLabel(right, top, qTopRight, 'right', 'top', accent),
          qLabel(left, bottom, qBotLeft, 'left', 'bottom'),
          qLabel(right, bottom, qBotRight, 'right', 'bottom'),
          ...leaders,
          ...dots,
          ...texts,
        ],
      } as unknown as Group;
    },
  };

  const height = clamp(Math.max(540, 150 + cleanPoints.length * 46), 540, 720);
  const rightSubtitle = isImplicit ? '非循环回归衍生隐性 IPA 四象限' : '重要性—表现四象限分析';

  return {
    kind: 'quadrant',
    height,
    option: {
      ...base(),
      graphic: [
        { type: 'text', x: 240, y: 14, style: { text: '表现均值排序与基准线对比', fill: INK, fontSize: 18, fontWeight: 'bold', fontFamily: FONT, align: 'center' } },
        { type: 'text', x: 744, y: 14, style: { text: rightSubtitle, fill: INK, fontSize: 18, fontWeight: 'bold', fontFamily: FONT, align: 'center' } },
      ],
      grid: [
        { left: 170, width: 218, top: 68, bottom: 56, containLabel: false },
        { left: 550, right: 24, top: 68, bottom: 56, containLabel: false },
      ],
      xAxis: [
        {
          ...valueAxis('表现均值', { ...lowerTitle, nameGap: 36, min: 0, max: barXMax, interval: barXInterval }),
          gridIndex: 0,
          axisLabel: { ...small, fontSize: 16, formatter: tickLabel },
          nameTextStyle: { ...small, fontSize: 17 },
        },
        {
          ...valueAxis('表现', { ...lowerTitle, nameGap: 36, ...bx, axisLine: { show: true, onZero: false, lineStyle: { color: AXIS } }, splitLine: { show: false } }),
          gridIndex: 1,
          axisLabel: { ...small, fontSize: 16, formatter: tickLabel },
          nameTextStyle: { ...small, fontSize: 17 },
        },
      ],
      yAxis: [
        {
          type: 'category',
          gridIndex: 0,
          inverse: true,
          data: ranked.map(p => wrapLabel(p.name, 16)),
          axisLine: { show: true, lineStyle: { color: AXIS } },
          axisTick: { show: false },
          axisLabel: { ...small, fontSize: 16, lineHeight: 20, margin: 10 },
        },
        {
          ...valueAxis(importanceAxis, { ...by, nameLocation: 'middle', nameRotate: 90, nameGap: 52, axisLine: { show: true, onZero: false, lineStyle: { color: AXIS } }, splitLine: { show: false } }),
          gridIndex: 1,
          axisLabel: { ...small, fontSize: 16, formatter: tickLabel },
          nameTextStyle: { ...small, fontSize: 17 },
        },
      ],
      series: [leftBarsCustom, scene],
    },
  };
}

/** Each cluster's centre on every standardized variable, as grouped bars about the overall mean (zero). */
export function clusterProfilePlot(centers: readonly (readonly number[])[], sizes: readonly number[], variables: readonly string[], ink: FigureInk): FigurePlan {
  if (centers.length < 2 || centers.some(c => c.length !== variables.length)) throw Error('聚类中心与变量不对应，无法作图。');
  const colours = categoryColors(ink, centers.length, false);
  const legendUnits = sizes.reduce((s, n, j) => s + textUnits(`第 ${j + 1} 类（n = ${n}）`) + 5, 0);
  const topPad = legendUnits > 74 ? 84 : 56;
  const zeroLine: CustomSeriesOption = {
    type: 'custom', clip: false, silent: true, z: 2, data: [[0]],
    renderItem: (params, api) => {
      const area = (params as unknown as { coordSys: { x: number; width: number } }).coordSys, zero = api.coord([0, 0]);
      return { type: 'line', shape: { x1: area.x, y1: zero[1], x2: area.x + area.width, y2: zero[1] }, style: { stroke: AXIS, lineWidth: 1.5 } } as unknown as Group;
    },
  };
  return { kind: 'profile', height: clamp(380 + 18 * variables.length + (topPad - 56), 420, 680), option: {
    ...base(), legend, grid: grid({ top: topPad, bottom: 24 }),
    xAxis: categoryAxis(variables.map(sanitizeSvgLabel), false),
    yAxis: valueAxis('标准化中心（标准差）', niceBounds(Math.min(0, ...centers.flat()) - 0.15, Math.max(0, ...centers.flat()) + 0.15)),
    series: [
      ...centers.map((c, j) => ({
        type: 'bar' as const, clip: false, name: `第 ${j + 1} 类（n = ${sizes[j]}）`, data: c.map(v => Number(v.toFixed(3))), barMaxWidth: 36,
        itemStyle: { color: colours[j] },
      })),
      zeroLine,
    ],
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
 * Pure-white borderless Kano Better-Worse 4-Quadrant Scatter Matrix (960px publication standard):
 * X = |Worse| (discontent reduction index [0..1]), Y = Better (satisfaction gain index [0..1]).
 */
export function kanoQuadrantPlot(
  points: readonly { name: string; better: number; worseAbs: number; dominant?: string }[],
  ink: FigureInk,
): FigurePlan {
  if (points.length < 2) throw Error('Kano 四象限至少需要两个需求特性。');
  const cleanPoints = points.map(p => ({
    name: cleanChineseChartLabel(p.name),
    better: clampFloat(p.better, 0, 1),
    worseAbs: clampFloat(p.worseAbs, 0, 1),
    dominant: p.dominant ?? '',
  }));
  const accent = inkPrimary(ink);
  const act = inkOpposite(ink);
  const meanW = cleanPoints.reduce((s, p) => s + p.worseAbs, 0) / cleanPoints.length;
  const meanB = cleanPoints.reduce((s, p) => s + p.better, 0) / cleanPoints.length;
  const cxWorse = clampFloat(meanW, 0.30, 0.70);
  const cyBetter = clampFloat(meanB, 0.30, 0.70);

  const colorOf = (p: (typeof cleanPoints)[number]) => {
    const d = p.dominant.toUpperCase();
    if (d.includes('(O)') || d === 'O' || (p.better >= cyBetter && p.worseAbs >= cxWorse)) return act;
    if (d.includes('(A)') || d === 'A' || (p.better >= cyBetter && p.worseAbs < cxWorse)) return accent;
    if (d.includes('(M)') || d === 'M' || (p.better < cyBetter && p.worseAbs >= cxWorse)) return INK;
    return '#6B7280';
  };

  const scene: CustomSeriesOption = {
    type: 'custom',
    clip: false,
    silent: true,
    data: cleanPoints.map((p, idx) => [p.worseAbs, p.better, idx]),
    renderItem: (params, api) => {
      const idx0 = Number(api.value(2));
      if (idx0 !== 0) return { type: 'group', children: [] } as unknown as Group;

      const area = (params as unknown as { coordSys: { x: number; y: number; width: number; height: number } }).coordSys;
      const [vx, hy] = api.coord([cxWorse, cyBetter]);
      const dash = { stroke: AXIS, lineWidth: 1.4, lineDash: [6, 5] };
      const qLabel = (
        x: number,
        y: number,
        text: string,
        align: 'left' | 'right',
        verticalAlign: 'top' | 'bottom',
        tintFill = AXIS,
      ) => ({
        type: 'text',
        x,
        y,
        style: {
          text,
          fill: tintFill,
          stroke: '#FFFFFF',
          lineWidth: 3,
          fontSize: 17,
          fontFamily: FONT,
          fontWeight: 'bold',
          align,
          verticalAlign,
        },
      });
      const left = area.x + 10;
      const right = area.x + area.width - 10;
      const top = area.y + 8;
      const bottom = area.y + area.height - 8;

      const cornerBoxes: Box2D[] = [
        { x0: area.x + 4, y0: area.y + 4, x1: area.x + 128, y1: area.y + 32 },
        { x0: area.x + area.width - 128, y0: area.y + 4, x1: area.x + area.width - 4, y1: area.y + 32 },
        { x0: area.x + 4, y0: area.y + area.height - 32, x1: area.x + 128, y1: area.y + area.height - 4 },
        { x0: area.x + area.width - 128, y0: area.y + area.height - 32, x1: area.x + area.width - 4, y1: area.y + area.height - 4 },
      ];

      const fontSz = 16;
      const pts = cleanPoints.map(p => {
        const [px, py] = api.coord([p.worseAbs, p.better]);
        return { ...p, px, py, w: textPx(p.name, fontSz) + 8, h: 20, color: colorOf(p) };
      });
      const pointBoxes: Box2D[] = pts.map(p => ({ x0: p.px - 10, y0: p.py - 10, x1: p.px + 10, y1: p.py + 10 }));

      const candsFor = (p: (typeof pts)[number]): LabelCand[] => {
        const out: LabelCand[] = [];
        const dys = [0, -14, 14, -28, 28, -42, 42, -58, 58, -76, 76];
        for (const dx of [14, 24, 38, 56]) {
          for (const dy of dys) {
            const x0 = p.px + dx;
            const x1 = x0 + p.w;
            const cy = p.py + dy;
            const y0 = cy - p.h / 2;
            const y1 = cy + p.h / 2;
            out.push({ box: { x0, y0, x1, y1 }, tx: x0 + 3, ty: cy, align: 'left', anchorX: x0, anchorY: clampFloat(p.py, y0 + 3, y1 - 3) });
          }
        }
        for (const dx of [-14, -24, -38, -56]) {
          for (const dy of dys) {
            const x1 = p.px + dx;
            const x0 = x1 - p.w;
            const cy = p.py + dy;
            const y0 = cy - p.h / 2;
            const y1 = cy + p.h / 2;
            out.push({ box: { x0, y0, x1, y1 }, tx: x1 - 3, ty: cy, align: 'right', anchorX: x1, anchorY: clampFloat(p.py, y0 + 3, y1 - 3) });
          }
        }
        for (const dy of [-20, 20, -36, 36, -54, 54]) {
          for (const dx of [0, -28, 28]) {
            const cx = p.px + dx;
            const cy = p.py + dy;
            const x0 = cx - p.w / 2;
            const x1 = cx + p.w / 2;
            const y0 = cy - p.h / 2;
            const y1 = cy + p.h / 2;
            out.push({ box: { x0, y0, x1, y1 }, tx: cx, ty: cy, align: 'center', anchorX: clampFloat(p.px, x0 + 6, x1 - 6), anchorY: dy < 0 ? y1 : y0 });
          }
        }
        return out;
      };

      const allCands = pts.map(candsFor);
      const chosen: (LabelCand | null)[] = Array(pts.length).fill(null);
      const costOf = (idx: number, c: LabelCand): number => {
        const p = pts[idx];
        const b = c.box;
        let cost = 0;
        const outTotal =
          Math.max(0, area.x + 4 - b.x0)
          + Math.max(0, b.x1 - (area.x + area.width - 4))
          + Math.max(0, area.y + 4 - b.y0)
          + Math.max(0, b.y1 - (area.y + area.height - 4));
        if (outTotal > 0) cost += 1_000_000 + outTotal * 5_000;
        for (const pb of pointBoxes) {
          const ov = boxOverlapArea(b, pb, 2, 2);
          if (ov > 0) cost += 90_000 + ov * 300;
        }
        for (const cb of cornerBoxes) {
          const ov = boxOverlapArea(b, cb, 2, 2);
          if (ov > 0) cost += 70_000 + ov * 250;
        }
        for (let j = 0; j < chosen.length; j++) {
          if (j === idx || !chosen[j]) continue;
          const ov = boxOverlapArea(b, chosen[j]!.box, 4, 2);
          if (ov > 0) cost += 80_000 + ov * 320;
        }
        if (b.y0 - 2 < hy && b.y1 + 2 > hy) cost += 85_000;
        if (b.x0 - 2 < vx && b.x1 + 2 > vx) cost += 85_000;
        const dist = Math.hypot(c.anchorX - p.px, c.anchorY - p.py);
        cost += dist * 0.65 + Math.abs(c.ty - p.py) * 0.25;
        return cost;
      };

      pts.forEach((_, idx) => {
        let best = allCands[idx][0];
        let bestScore = Infinity;
        for (const cand of allCands[idx]) {
          const s = costOf(idx, cand);
          if (s < bestScore) {
            bestScore = s;
            best = cand;
          }
        }
        chosen[idx] = best;
      });

      const leaders: object[] = [];
      const dots: object[] = [];
      const texts: object[] = [];
      pts.forEach((p, idx) => {
        const c = chosen[idx]!;
        const dx = c.anchorX - p.px;
        const dy = c.anchorY - p.py;
        const dist = Math.hypot(dx, dy);
        if (dist > 16) {
          const ux = dx / dist;
          const uy = dy / dist;
          leaders.push({
            type: 'line',
            shape: { x1: p.px + ux * 9, y1: p.py + uy * 9, x2: c.anchorX, y2: c.anchorY },
            style: { stroke: AXIS, lineWidth: 1.2, opacity: 0.65 },
          });
        }
        dots.push({
          type: 'circle',
          shape: { cx: p.px, cy: p.py, r: 8 },
          style: { fill: p.color, stroke: '#FFFFFF', lineWidth: 2 },
        });
        texts.push({
          type: 'text',
          x: c.tx,
          y: c.ty,
          style: {
            text: p.name,
            fill: INK,
            stroke: '#FFFFFF',
            lineWidth: 3.5,
            fontSize: fontSz,
            fontFamily: FONT,
            align: c.align,
            verticalAlign: 'middle',
          },
        });
      });

      const expectZoneX = Math.max(area.x, vx);
      const expectZoneW = Math.max(0, area.x + area.width - expectZoneX);
      const expectZoneH = Math.max(0, Math.min(area.height, hy - area.y));

      return {
        type: 'group',
        children: [
          ...(expectZoneW > 4 && expectZoneH > 4
            ? [{ type: 'rect', shape: { x: expectZoneX, y: area.y, width: expectZoneW, height: expectZoneH }, style: { fill: mixHex(act, '#FFFFFF', 0.94) } }]
            : []),
          { type: 'line', shape: { x1: vx, y1: area.y, x2: vx, y2: area.y + area.height }, style: dash },
          { type: 'line', shape: { x1: area.x, y1: hy, x2: area.x + area.width, y2: hy }, style: dash },
          qLabel(left, top, '魅力属性 (A)', 'left', 'top', accent),
          qLabel(right, top, '期望属性 (O)', 'right', 'top', act),
          qLabel(left, bottom, '无差异 (I)', 'left', 'bottom'),
          qLabel(right, bottom, '必备属性 (M)', 'right', 'bottom', INK),
          ...leaders,
          ...dots,
          ...texts,
        ],
      } as unknown as Group;
    },
  };

  return {
    kind: 'quadrant',
    height: 520,
    option: {
      ...base(),
      graphic: [
        { type: 'text', x: 480, y: 14, style: { text: 'Kano 需求属性 Better—Worse 四象限矩阵', fill: INK, fontSize: 19, fontWeight: 'bold', fontFamily: FONT, align: 'center' } },
      ],
      grid: { left: 96, right: 44, top: 64, bottom: 64, containLabel: false },
      xAxis: {
        ...valueAxis('|Worse| 消除后不满意下降指数', {
          ...lowerTitle,
          nameGap: 38,
          min: 0,
          max: 1.06,
          interval: 0.2,
          axisLine: { show: true, onZero: false, lineStyle: { color: AXIS } },
          splitLine: { show: false },
        }),
        axisLabel: { ...small, fontSize: 16, formatter: (v: number) => (v > 1.001 ? '' : tickLabel(v)) },
        nameTextStyle: { ...small, fontSize: 17 },
      },
      yAxis: {
        ...valueAxis('Better 满意提升指数', {
          min: 0,
          max: 1.06,
          interval: 0.2,
          nameLocation: 'middle',
          nameRotate: 90,
          nameGap: 52,
          axisLine: { show: true, onZero: false, lineStyle: { color: AXIS } },
          splitLine: { show: false },
        }),
        axisLabel: { ...small, fontSize: 16, formatter: (v: number) => (v > 1.001 ? '' : tickLabel(v)) },
        nameTextStyle: { ...small, fontSize: 17 },
      },
      series: [scene],
    },
  };
}

/**
 * Covariate Balance Love Plot (960px publication standard) for Propensity Score Matching:
 * Horizontal lollipop/shift plot comparing pre-matching |SMD| (hollow opposite) vs post-matching |SMD| (filled accent)
 * against the |SMD| = 0.10 balance threshold dashed line.
 */
export function psmLovePlot(
  rows: readonly { name: string; before: number; after: number }[],
  ink: FigureInk,
): FigurePlan {
  if (!rows.length) throw Error('PSM 协变量平衡图至少需要一个协变量。');
  const cleanRows = rows.map(r => ({
    name: cleanChineseChartLabel(r.name),
    before: Math.max(0, r.before),
    after: Math.max(0, r.after),
  }));
  const accent = inkPrimary(ink);
  const act = inkOpposite(ink);
  const maxSmd = Math.max(0.22, ...cleanRows.flatMap(r => [r.before, r.after]));
  const bounds = niceBounds(0, maxSmd * 1.18, 5);
  const labels = cleanRows.map(r => wrapLabel(r.name, 14));

  const marks: CustomSeriesOption = {
    type: 'custom',
    clip: false,
    silent: true,
    data: cleanRows.map((r, i) => [i, r.before, r.after]),
    renderItem: (params, api) => {
      const i = Number(api.value(0));
      const before = Number(api.value(1));
      const after = Number(api.value(2));
      const pBef = api.coord([before, i]);
      const pAft = api.coord([after, i]);
      const children: object[] = [
        { type: 'line', shape: { x1: pBef[0], y1: pBef[1], x2: pAft[0], y2: pAft[1] }, style: { stroke: AXIS, lineWidth: 2, opacity: 0.55 } },
        { type: 'circle', shape: { cx: pBef[0], cy: pBef[1], r: 7 }, style: { fill: '#FFFFFF', stroke: act, lineWidth: 2.4 } },
        { type: 'circle', shape: { cx: pAft[0], cy: pAft[1], r: 7 }, style: { fill: accent, stroke: '#FFFFFF', lineWidth: 1.8 } },
      ];
      if (i === 0) {
        const area = (params as unknown as { coordSys: { y: number; height: number } }).coordSys;
        const thresh = api.coord([0.10, 0]);
        children.unshift(
          { type: 'line', shape: { x1: thresh[0], y1: area.y, x2: thresh[0], y2: area.y + area.height }, style: { stroke: AXIS, lineWidth: 1.5, lineDash: [6, 5] } },
          { type: 'text', x: thresh[0] + 6, y: area.y - 8, style: { text: '|SMD|=0.10', fill: AXIS, fontSize: 16, fontFamily: FONT, align: 'left', verticalAlign: 'bottom' } },
        );
      }
      return { type: 'group', children } as unknown as Group;
    },
  };

  return {
    kind: 'forest',
    height: clamp(160 + 58 * cleanRows.length, 300, 680),
    option: {
      ...base(),
      graphic: [
        { type: 'text', x: 480, y: 14, style: { text: '倾向得分匹配 (PSM) 协变量标准差 |SMD| 平衡对比', fill: INK, fontSize: 18, fontWeight: 'bold', fontFamily: FONT, align: 'center' } },
        { type: 'circle', shape: { cx: 345, cy: 48, r: 6 }, style: { fill: '#FFFFFF', stroke: act, lineWidth: 2.2 } },
        { type: 'text', x: 358, y: 48, style: { text: '匹配前 |SMD|', fill: INK, fontSize: 15, fontFamily: FONT, align: 'left', verticalAlign: 'middle' } },
        { type: 'circle', shape: { cx: 515, cy: 48, r: 6 }, style: { fill: accent, stroke: '#FFFFFF', lineWidth: 1.5 } },
        { type: 'text', x: 528, y: 48, style: { text: '匹配后 |SMD|', fill: INK, fontSize: 15, fontFamily: FONT, align: 'left', verticalAlign: 'middle' } },
      ],
      grid: grid({ top: 76, right: 44, bottom: 32 }),
      xAxis: valueAxis('绝对标准化均值差 |SMD|', { ...lowerTitle, min: 0, max: bounds.max, interval: bounds.interval }),
      yAxis: categoryAxis(labels, true),
      series: [marks],
    },
  };
}

/**
 * Horizontal metric benchmark bar chart (960px publication standard) for Split Conformal calibration metrics:
 * plots numerical uncertainty & coverage diagnostics directly so mixed table strings never block export.
 */
export function conformalCalibrationPlot(
  metrics: readonly { label: string; value: number }[],
  ink: FigureInk,
): FigurePlan {
  if (!metrics.length) throw Error('Split Conformal 图需要有效校准数值指标。');
  const cleanMetrics = metrics.map(m => ({ label: cleanChineseChartLabel(m.label), value: m.value }));
  const accent = inkPrimary(ink);
  const maxVal = Math.max(1.0, ...cleanMetrics.map(m => Math.abs(m.value)));
  const bounds = niceBounds(0, maxVal * 1.18, 5);
  return {
    kind: 'barsHorizontal',
    height: clamp(160 + 58 * cleanMetrics.length, 300, 620),
    option: {
      ...base(),
      graphic: [
        { type: 'text', x: 480, y: 14, style: { text: 'Split Conformal 有限样本校准与区间不确定性指标', fill: INK, fontSize: 18, fontWeight: 'bold', fontFamily: FONT, align: 'center' } },
      ],
      grid: grid({ top: 56, right: 64, bottom: 32 }),
      xAxis: valueAxis('校准测度数值（半宽 / 覆盖率 / 倍率）', { ...lowerTitle, min: 0, max: bounds.max, interval: bounds.interval }),
      yAxis: categoryAxis(cleanMetrics.map(m => wrapLabel(m.label, 16)), true),
      series: [{
        type: 'bar',
        data: cleanMetrics.map(m => Number(m.value.toFixed(4))),
        barMaxWidth: 26,
        itemStyle: { color: accent, borderRadius: [0, 5, 5, 0] },
        label: {
          show: true,
          position: 'right',
          distance: 8,
          ...small,
          formatter: (p: { value: unknown }) => minus(Number(p.value).toFixed(3)),
        },
      }],
    },
  };
}

/**
 * Symmetric binary-subgroup mirrored horizontal comparison bar chart (`groups.length === 2 && dimensions.length >= 3`):
 * Center spine lists 100% Chinese dimension names + signed group difference (and significance stars when known),
 * while Group A bars extend leftward and Group B bars extend rightward on a common symmetric scale.
 */
export function mirroredGroupComparePlot(
  dimensions: readonly string[],
  groups: readonly [
    { label: string; n: number },
    { label: string; n: number },
  ] | readonly { label: string; n: number }[],
  means: readonly (readonly number[])[],
  ink: FigureInk,
  pValues?: readonly (number | null)[],
  isPercent = false,
): FigurePlan {
  if (dimensions.length < 2 || groups.length !== 2 || means.some(row => row.length !== 2 || !row.every(Number.isFinite))) {
    throw Error('二元镜像对比图需要恰好 2 个子群体与完整的维度均值。');
  }
  const cleanDims = dimensions.map(cleanChineseChartLabel);
  const g0Name = cleanChineseChartLabel(groups[0].label);
  const g1Name = cleanChineseChartLabel(groups[1].label);
  const g0Header = groups[0].n > 0 ? `${g0Name}（n = ${groups[0].n}）` : g0Name;
  const g1Header = groups[1].n > 0 ? `${g1Name}（n = ${groups[1].n}）` : g1Name;

  const colours = categoryColors(ink, 2, false);
  const leftCol = colours[0];
  const rightCol = colours[1];
  const oppCol = inkOpposite(ink);

  const allVals = means.flat();
  const maxRaw = Math.max(...allVals, 0.1);
  const scaleMax = !isPercent && maxRaw <= 5
    ? 5
    : isPercent && maxRaw <= 100
      ? Math.min(100, niceBounds(0, maxRaw * 1.12, 4).max)
      : niceBounds(0, maxRaw * 1.14, 4).max;
  const tickStep = scaleMax === 5 ? 1 : niceBounds(0, scaleMax, 4).interval;
  const ticks: number[] = [];
  for (let v = 0; v <= scaleMax + 1e-6; v = Number((v + tickStep).toPrecision(8))) {
    ticks.push(v);
  }

  const rowPitch = 64;
  const topPad = 76;
  const botPad = 56;
  const height = clamp(topPad + botPad + cleanDims.length * rowPitch, 320, 820);

  const centerX = 480;
  const leftOriginX = 368;
  const rightOriginX = 592;
  const maxBarPx = 286;
  const fmtVal = (v: number) => `${minus(v.toFixed(isPercent ? 1 : 2))}${isPercent ? '%' : ''}`;
  const sigStars = (p: number | null | undefined): string => {
    if (p === null || p === undefined || !Number.isFinite(p)) return '';
    if (p < 0.001) return '***';
    if (p < 0.01) return '**';
    if (p < 0.05) return '*';
    return '';
  };

  const mirrorScene: CustomSeriesOption = {
    type: 'custom',
    clip: false,
    silent: true,
    z: 3,
    data: [[0]],
    renderItem: () => {
      const plotTop = topPad;
      const plotBottom = height - botPad;
      const children: object[] = [];

      // Top symmetric legend header
      children.push(
        {
          type: 'rect',
          shape: { x: leftOriginX - 18, y: 20, width: 18, height: 12, r: 3 },
          style: { fill: leftCol },
        },
        {
          type: 'text',
          x: leftOriginX - 26,
          y: 26,
          style: {
            text: g0Header,
            fill: leftCol,
            fontSize: 18,
            fontFamily: FONT,
            fontWeight: 'bold',
            align: 'right',
            verticalAlign: 'middle',
          },
        },
        {
          type: 'text',
          x: centerX,
          y: 26,
          style: {
            text: '测量维度（组间差值 Δ）',
            fill: AXIS,
            fontSize: 15,
            fontFamily: FONT,
            fontWeight: 'bold',
            align: 'center',
            verticalAlign: 'middle',
          },
        },
        {
          type: 'rect',
          shape: { x: rightOriginX, y: 20, width: 18, height: 12, r: 3 },
          style: { fill: rightCol },
        },
        {
          type: 'text',
          x: rightOriginX + 26,
          y: 26,
          style: {
            text: g1Header,
            fill: rightCol,
            fontSize: 18,
            fontFamily: FONT,
            fontWeight: 'bold',
            align: 'left',
            verticalAlign: 'middle',
          },
        },
        {
          type: 'line',
          shape: { x1: 48, y1: 50, x2: 912, y2: 50 },
          style: { stroke: '#E2E8F0', lineWidth: 1 },
        },
      );

      // Symmetric vertical gridlines & bottom ticks
      for (const tk of ticks) {
        const offsetPx = (tk / scaleMax) * maxBarPx;
        const lx = leftOriginX - offsetPx;
        const rx = rightOriginX + offsetPx;
        const tkStr = `${tickLabel(tk)}${isPercent ? '%' : ''}`;
        if (tk > 0) {
          children.push(
            { type: 'line', shape: { x1: lx, y1: plotTop, x2: lx, y2: plotBottom }, style: { stroke: GRID, lineWidth: 1, lineDash: [4, 4] } },
            { type: 'line', shape: { x1: rx, y1: plotTop, x2: rx, y2: plotBottom }, style: { stroke: GRID, lineWidth: 1, lineDash: [4, 4] } },
          );
        }
        children.push(
          { type: 'line', shape: { x1: lx, y1: plotBottom, x2: lx, y2: plotBottom + 5 }, style: { stroke: AXIS, lineWidth: 1 } },
          { type: 'text', x: lx, y: plotBottom + 10, style: { text: tkStr, fill: INK, fontSize: 16, fontFamily: FONT, align: 'center', verticalAlign: 'top' } },
          { type: 'line', shape: { x1: rx, y1: plotBottom, x2: rx, y2: plotBottom + 5 }, style: { stroke: AXIS, lineWidth: 1 } },
          { type: 'text', x: rx, y: plotBottom + 10, style: { text: tkStr, fill: INK, fontSize: 16, fontFamily: FONT, align: 'center', verticalAlign: 'top' } },
        );
      }

      // Dimension rows: center Chinese label + Δ badge, left bar, right bar
      cleanDims.forEach((dim, i) => {
        const cy = plotTop + (i + 0.5) * rowPitch;
        const v0 = means[i][0];
        const v1 = means[i][1];
        const diff = v0 - v1;
        const stars = sigStars(pValues?.[i]);
        const diffSign = diff > 1e-6 ? '+' : '';
        const diffStr = `Δ = ${minus(`${diffSign}${diff.toFixed(isPercent ? 1 : 2)}`)}${isPercent ? '%' : ''}${stars}`;
        const w0 = Math.max(2, (v0 / scaleMax) * maxBarPx);
        const w1 = Math.max(2, (v1 / scaleMax) * maxBarPx);
        const barH = 22;

        if (i % 2 === 1) {
          children.push({
            type: 'rect',
            shape: { x: 40, y: cy - rowPitch / 2 + 2, width: 880, height: rowPitch - 4, r: 6 },
            style: { fill: '#FAFBFD' },
          });
        }

        // Left track & bar (growing leftward from leftOriginX)
        children.push(
          {
            type: 'rect',
            shape: { x: leftOriginX - maxBarPx, y: cy - barH / 2, width: maxBarPx, height: barH, r: 5 },
            style: { fill: '#EEF2F6' },
          },
          {
            type: 'rect',
            shape: { x: leftOriginX - w0, y: cy - barH / 2, width: w0, height: barH, r: [5, 0, 0, 5] },
            style: { fill: leftCol },
          },
          {
            type: 'text',
            x: leftOriginX - w0 - 8,
            y: cy,
            style: {
              text: fmtVal(v0),
              fill: INK,
              stroke: '#FFFFFF',
              lineWidth: 3,
              fontSize: 16.5,
              fontFamily: FONT,
              fontWeight: 'bold',
              align: 'right',
              verticalAlign: 'middle',
            },
          },
        );

        // Right track & bar (growing rightward from rightOriginX)
        children.push(
          {
            type: 'rect',
            shape: { x: rightOriginX, y: cy - barH / 2, width: maxBarPx, height: barH, r: 5 },
            style: { fill: '#EEF2F6' },
          },
          {
            type: 'rect',
            shape: { x: rightOriginX, y: cy - barH / 2, width: w1, height: barH, r: [0, 5, 5, 0] },
            style: { fill: rightCol },
          },
          {
            type: 'text',
            x: rightOriginX + w1 + 8,
            y: cy,
            style: {
              text: fmtVal(v1),
              fill: INK,
              stroke: '#FFFFFF',
              lineWidth: 3,
              fontSize: 16.5,
              fontFamily: FONT,
              fontWeight: 'bold',
              align: 'left',
              verticalAlign: 'middle',
            },
          },
        );

        // Center dimension title + signed Δ
        const dimLabel = dim.length > 14 ? dim.slice(0, 14) : dim;
        const dimFont = dimLabel.length > 11 ? Math.max(13.5, Math.floor(206 / dimLabel.length)) : 17;
        children.push(
          {
            type: 'text',
            x: centerX,
            y: cy - 9,
            style: {
              text: dimLabel,
              fill: INK,
              fontSize: dimFont,
              fontFamily: FONT,
              fontWeight: 'bold',
              align: 'center',
              verticalAlign: 'middle',
            },
          },
          {
            type: 'text',
            x: centerX,
            y: cy + 12,
            style: {
              text: diffStr,
              fill: stars ? oppCol : AXIS,
              fontSize: 14.5,
              fontFamily: FONT,
              fontWeight: stars ? 'bold' : 'normal',
              align: 'center',
              verticalAlign: 'middle',
            },
          },
        );
      });

      // Crisp inner origin spines
      children.push(
        { type: 'line', shape: { x1: leftOriginX, y1: plotTop - 4, x2: leftOriginX, y2: plotBottom }, style: { stroke: AXIS, lineWidth: 1.5 } },
        { type: 'line', shape: { x1: rightOriginX, y1: plotTop - 4, x2: rightOriginX, y2: plotBottom }, style: { stroke: AXIS, lineWidth: 1.5 } },
        { type: 'line', shape: { x1: leftOriginX - maxBarPx, y1: plotBottom, x2: leftOriginX, y2: plotBottom }, style: { stroke: AXIS, lineWidth: 1.2 } },
        { type: 'line', shape: { x1: rightOriginX, y1: plotBottom, x2: rightOriginX + maxBarPx, y2: plotBottom }, style: { stroke: AXIS, lineWidth: 1.2 } },
      );

      return { type: 'group', children } as unknown as Group;
    },
  };

  return {
    kind: 'dots',
    height,
    option: {
      ...base(),
      grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
      xAxis: { type: 'value', min: 0, max: 960, show: false },
      yAxis: { type: 'value', min: 0, max: height, show: false },
      series: [mirrorScene],
    },
  };
}

/**
 * Several dimensions compared across groups:
 * When comparing exactly 2 subgroups across >= 3 non-negative dimensions, renders a symmetric mirrored horizontal
 * butterfly bar chart; for 3+ groups, renders a multi-marker dot plot with horizontal span bars.
 */
export function dotPlot(
  dimensions: readonly string[],
  groups: readonly { label: string; n: number }[],
  means: readonly (readonly number[])[],
  ink: FigureInk,
  pValues?: readonly (number | null)[],
): FigurePlan {
  if (dimensions.length < 2 || groups.length < 2 || means.some(row => row.length !== groups.length || !row.every(Number.isFinite))) throw Error('均值与分组不对应，无法作图。');
  if (groups.length === 2 && dimensions.length >= 3 && means.every(row => row.every(v => v >= 0))) {
    return mirroredGroupComparePlot(dimensions, groups, means, ink, pValues);
  }
  const cleanDims = dimensions.map(cleanChineseChartLabel);
  const colours = categoryColors(ink, groups.length, false), all = means.flat(), bounds = niceBounds(Math.min(...all) - 0.15, Math.max(...all) + 0.15);
  const xSpan = (bounds.max - bounds.min) || 1, closeEps = xSpan * 0.022;
  // Compute deterministic vertical micro-offsets on each row when two or more group means are nearly identical so no marker is occluded.
  const yOffsets: number[][] = means.map(row => {
    const offs = Array(groups.length).fill(0);
    const sortedIdx = row.map((v, j) => ({ v, j })).sort((a, b) => a.v - b.v || a.j - b.j);
    let start = 0;
    while (start < sortedIdx.length) {
      let end = start;
      while (end + 1 < sortedIdx.length && Math.abs(sortedIdx[end + 1].v - sortedIdx[end].v) < closeEps) end++;
      const count = end - start + 1;
      if (count > 1) {
        const step = count === 2 ? 11 : 9;
        for (let k = 0; k < count; k++) {
          offs[sortedIdx[start + k].j] = Math.round((k - (count - 1) / 2) * step);
        }
      }
      start = end + 1;
    }
    return offs;
  });
  const legendUnits = groups.reduce((s, g) => s + textUnits(`${g.label}（n = ${g.n}）`) + 5, 0);
  const legendRows = Math.max(1, Math.ceil(legendUnits / 72));
  const topPad = legendRows === 1 ? 64 : 60 + (legendRows - 1) * 32;
  const spans: CustomSeriesOption = {
    type: 'custom', clip: false, silent: true, z: 1, data: means.map((row, i) => [i, Math.min(...row), Math.max(...row)]),
    renderItem: (_params, api) => {
      const i = Number(api.value(0)), a = api.coord([Number(api.value(1)), i]), b = api.coord([Number(api.value(2)), i]);
      return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#D5D9DE', lineWidth: 8, lineCap: 'round' } } as unknown as Group;
    },
  };
  return { kind: 'dots', height: clamp(150 + (topPad - 64) + 62 * cleanDims.length, 320, 760), option: {
    ...base(), legend: { ...legend, itemWidth: 16, itemHeight: 16 }, grid: grid({ top: topPad, bottom: 24, right: 48 }),
    xAxis: valueAxis('组均值', { ...lowerTitle, ...bounds }),
    yAxis: categoryAxis(cleanDims, true),
    series: [spans, ...groups.map((g, j) => ({
      type: 'scatter' as const, clip: false, name: `${cleanChineseChartLabel(g.label)}（n = ${g.n}）`, z: 3 + j, symbol: SHAPES[j % SHAPES.length], symbolSize: 18,
      itemStyle: { color: colours[j], borderColor: '#FFFFFF', borderWidth: 2, opacity: 1 },
      data: means.map((row, i) => ({ value: [row[j], i], symbolOffset: [0, yOffsets[i][j]] })),
    }))],
  } };
}

/**
 * Rating items as diverging stacked bars: agreement to the right of the neutral answer, disagreement to the left, the
 * neutral share split across the centre line on ONE shared stack so negative and positive segments align horizontally.
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
  // A segment's label is its level's whole share: the neutral answer, drawn as two halves on one shared stack, is labelled once with all of it.
  const segment = (name: string, l: number, values: number[], shown = values.map(Math.abs), centerAtZero = false) => {
    const fill = colourOf(l), textCol = onFillInk(fill), isDarkInk = textCol === INK;
    return {
      type: 'bar' as const, name, stack: 'likert', barWidth: '58%', data: values,
      itemStyle: { color: fill, borderColor: '#FFFFFF', borderWidth: l === mid ? 0 : 1 },
      label: {
        show: true,
        position: (centerAtZero ? 'right' : 'inside') as 'right' | 'inside',
        ...(centerAtZero ? { distance: 0, align: 'center' as const } : {}),
        ...small, fontSize: 17, color: textCol,
        ...(isDarkInk ? { textBorderColor: '#FFFFFF', textBorderWidth: 2.5 } : {}),
        formatter: (p: { dataIndex: number }) => (shown[p.dataIndex] >= 7 && Math.abs(values[p.dataIndex]) >= 3.5 ? `${shown[p.dataIndex].toFixed(0)}%` : ''),
      },
    };
  };
  const half = (i: number) => (neutral >= 0 ? pct(shares[i][neutral]) / 2 : 0);
  const centerGuide: CustomSeriesOption[] = neutral >= 0
    ? [{
        type: 'custom', clip: false, silent: true, z: 2, data: [[0]],
        renderItem: (params, api) => {
          const area = (params as unknown as { coordSys: { y: number; height: number } }).coordSys, center = api.coord([0, 0]);
          return {
            type: 'line',
            shape: { x1: center[0], y1: area.y, x2: center[0], y2: area.y + area.height },
            style: { stroke: AXIS, lineWidth: 1, lineDash: [4, 4], opacity: 0.45 },
          } as unknown as Group;
        },
      }]
    : [];
  // Single stack 'likert': negative values stack leftward from 0, positive values stack rightward from 0 on one row center.
  const series: SeriesOption[] = [
    ...(neutral >= 0
      ? [
          segment(`${mid} 分`, mid, order.map(i => -half(i)), order.map(i => pct(shares[i][neutral])), true),
          { ...segment(`${mid} 分`, mid, order.map(half)), label: { show: false } },
        ]
      : []),
    ...[...below].reverse().map(l => segment(`${l} 分`, l, order.map(i => -pct(shares[i][levels.indexOf(l)])))),
    ...above.map(l => segment(`${l} 分`, l, order.map(i => pct(shares[i][levels.indexOf(l)])))),
    ...centerGuide,
  ];
  const extent = Math.max(...order.map(i => half(i) + below.reduce((s, l) => s + pct(shares[i][levels.indexOf(l)]), 0)), ...order.map(i => half(i) + above.reduce((s, l) => s + pct(shares[i][levels.indexOf(l)]), 0)));
  const reach = Math.min(100, Math.ceil(Math.max(20, extent) / 20) * 20);
  return { kind: 'likert', height: clamp(160 + 58 * items.length, 320, 760), option: {
    ...base(), legend: { ...legend, data: levels.map(l => `${l} 分`) }, grid: grid({ top: 64, bottom: 24, right: 40 }),
    xAxis: valueAxis('作答占比（%，中性回答居中）', { ...lowerTitle, min: -reach, max: reach, interval: 20, axisLabel: { ...small, formatter: (v: number) => `${Math.abs(v)}` } }),
    yAxis: categoryAxis(order.map(i => sanitizeSvgLabel(items[i])), true),
    series,
  } };
}
const onFillInk = (fill: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16) / 255).map(s => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.21 ? INK : '#FFFFFF';
};

/**
 * A correlation matrix as the lower triangle of a heat map on a scale centred at zero: positive in the accent,
 * negative in the opposite hue, each cell labelled with its coefficient, Variable (1) named explicitly, and a
 * url()-free stepped −1…+1 colour bar in the upper-right triangle.
 */
export function correlationPlot(variables: readonly string[], rho: (a: number, b: number) => number, ink: FigureInk): FigurePlan {
  const m = variables.length, accent = inkPrimary(ink), OPPOSITE = inkOpposite(ink);
  if (m < 3) throw Error('至少需要 3 个变量。');
  const deep = mixHex(accent, '#000000', 0.15), cells: [number, number, number][] = [];
  for (let i = 1; i < m; i++) for (let j = 0; j < i; j++) cells.push([j, i - 1, rho(i, j)]);
  const shade = (v: number) => (v >= 0 ? mixHex('#FFFFFF', deep, Math.min(1, v)) : mixHex('#FFFFFF', OPPOSITE, Math.min(1, -v)));
  const colorbar: CustomSeriesOption = {
    type: 'custom', clip: false, silent: true, z: 4, data: [[0]],
    renderItem: (params) => {
      const area = (params as unknown as { coordSys: { x: number; y: number; width: number } }).coordSys;
      const barW = 168, barH = 14, steps = 24;
      const x0 = area.x + area.width - barW - 8, y0 = area.y + 18;
      const stepW = barW / steps;
      const strips: object[] = Array.from({ length: steps }, (_, k) => {
        const v = -1 + ((k + 0.5) / steps) * 2;
        return {
          type: 'rect',
          shape: { x: x0 + k * stepW, y: y0, width: stepW + 0.8, height: barH },
          style: { fill: shade(v) },
        };
      });
      return {
        type: 'group',
        children: [
          { type: 'text', x: x0 + barW / 2, y: y0 - 6, style: { text: '相关系数色标', fill: AXIS, fontSize: 16, fontFamily: FONT, align: 'center', verticalAlign: 'bottom' } },
          ...strips,
          { type: 'rect', shape: { x: x0, y: y0, width: barW, height: barH }, style: { fill: 'none', stroke: AXIS, lineWidth: 1 } },
          { type: 'text', x: x0, y: y0 + barH + 5, style: { text: '−1', fill: INK, fontSize: 16, fontFamily: FONT, align: 'left', verticalAlign: 'top' } },
          { type: 'text', x: x0 + barW / 2, y: y0 + barH + 5, style: { text: '0', fill: INK, fontSize: 16, fontFamily: FONT, align: 'center', verticalAlign: 'top' } },
          { type: 'text', x: x0 + barW, y: y0 + barH + 5, style: { text: '1', fill: INK, fontSize: 16, fontFamily: FONT, align: 'right', verticalAlign: 'top' } },
        ],
      } as unknown as Group;
    },
  };
  const cleanVariables = variables.map(sanitizeSvgLabel);
  return { kind: 'correlation', height: clamp(160 + 62 * (m - 1), 360, 760), option: {
    ...base(), grid: grid({ top: 58, right: 24, bottom: 16 }),
    xAxis: {
      type: 'category',
      data: cleanVariables.slice(0, -1).map((v, j) => (j === 0 ? `（1）\n${wrapLabel(v, 14)}` : `（${j + 1}）`)),
      position: 'top', axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...small, fontSize: 18, lineHeight: 22, interval: 0 },
    },
    yAxis: { type: 'category', data: cleanVariables.slice(1).map((v, i) => `（${i + 2}）${v}`), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...small, interval: 0 } },
    visualMap: { show: false, min: -1, max: 1, dimension: 2, inRange: { color: [OPPOSITE, '#FFFFFF', deep] } },
    series: [{
      type: 'heatmap', data: cells, itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      label: {
        show: true, ...small, fontSize: 18,
        formatter: (p: { value: unknown }) => { const v = Number((p.value as number[])[2]); return `{${onFillInk(shade(v)) === INK ? 'ink' : 'paper'}|${minus(v.toFixed(2))}}`; },
        rich: { ink: { ...small, fontSize: 18, color: INK }, paper: { ...small, fontSize: 18, color: '#FFFFFF' } },
      },
    }, colorbar],
  } };
}

/**
 * Multi-cluster radar chart on raw dimension means, drawn directly via ECharts custom SVG geometry so zero clip-path
 * url() references or SVG filters are emitted while preserving full vector readability.
 */
export function clusterRadarPlot(
  centers: readonly (readonly number[])[],
  sizes: readonly number[],
  variables: readonly string[],
  ink: FigureInk,
  names?: readonly string[],
): FigurePlan {
  if (centers.length < 2 || variables.length < 3 || centers.some(c => c.length !== variables.length || !c.every(Number.isFinite))) {
    throw Error('聚类雷达图需要至少 2 个群体、3 个维度且坐标完整。');
  }
  const cleanVars = variables.map(cleanChineseChartLabel);
  const colours = categoryColors(ink, centers.length, false);
  const cLabels = centers.map((_, j) => {
    const baseName = cleanChineseChartLabel(names?.[j]?.trim() || `第 ${j + 1} 类`);
    const sz = sizes[j];
    return Number.isFinite(sz) && sz > 0 ? `${baseName}（n=${Math.round(sz)}）` : baseName;
  });

  const flat = centers.flat();
  const rawMin = Math.min(...flat), rawMax = Math.max(...flat);
  const isFivePoint = rawMin >= 0.8 && rawMax <= 5.05;
  const bounds = isFivePoint ? { min: 1, max: 5, interval: 1 } : niceBounds(Math.min(0, rawMin), Math.max(5, rawMax), 4);
  const scaleMin = bounds.min;
  const scaleSpan = Math.max(1e-6, bounds.max - bounds.min);
  const ringValues: number[] = [];
  for (let v = bounds.min + bounds.interval; v <= bounds.max + 1e-6; v = Number((v + bounds.interval).toPrecision(8))) {
    ringValues.push(v);
  }
  if (!ringValues.length) ringValues.push(bounds.max);

  const width = 960;
  const legendRows = cLabels.reduce((acc, lbl) => acc + textPx(lbl, 16) + 52, 0) > 840 ? 2 : 1;
  const topPad = legendRows > 1 ? 82 : 54;
  const height = 540 + (legendRows - 1) * 28;
  const cx = width / 2;
  const cy = topPad + (height - topPad - 44) / 2;
  const radius = Math.min(182, (height - topPad - 110) / 2);
  const dimCount = cleanVars.length;

  const angleAt = (k: number) => -Math.PI / 2 + (2 * Math.PI * k) / dimCount;
  const ptAt = (k: number, frac: number): [number, number] => {
    const a = angleAt(k);
    return [cx + Math.cos(a) * radius * frac, cy + Math.sin(a) * radius * frac];
  };

  const radarScene: CustomSeriesOption = {
    type: 'custom',
    clip: false,
    silent: true,
    z: 3,
    data: [[0]],
    renderItem: () => {
      const children: object[] = [];

      // Top legend row(s)
      const itemsPerRow = legendRows === 1 ? cLabels.length : Math.ceil(cLabels.length / 2);
      for (let r = 0; r < legendRows; r++) {
        const slice = cLabels.slice(r * itemsPerRow, (r + 1) * itemsPerRow);
        const widths = slice.map(lbl => 22 + textPx(lbl, 15.5) + 22);
        const totalW = widths.reduce((a, b) => a + b, -22);
        let curX = cx - totalW / 2;
        const curY = 24 + r * 26;
        slice.forEach((lbl, idx) => {
          const j = r * itemsPerRow + idx;
          children.push(
            { type: 'rect', shape: { x: curX, y: curY - 6, width: 16, height: 12, r: 3 }, style: { fill: colours[j] } },
            {
              type: 'text',
              x: curX + 22,
              y: curY,
              style: { text: lbl, fill: INK, fontSize: 15.5, fontFamily: FONT, fontWeight: 'bold', align: 'left', verticalAlign: 'middle' },
            },
          );
          curX += widths[idx];
        });
      }

      // Concentric web rings (outermost drawn first down to innermost for subtle alternating zebra shading)
      for (let idx = ringValues.length - 1; idx >= 0; idx--) {
        const frac = (ringValues[idx] - scaleMin) / scaleSpan;
        const pts = Array.from({ length: dimCount }, (_, k) => ptAt(k, frac));
        const outer = idx === ringValues.length - 1;
        children.push({
          type: 'polygon',
          shape: { points: pts },
          style: {
            fill: idx % 2 === 1 ? '#F7F9FC' : '#FFFFFF',
            stroke: outer ? AXIS : '#D6DCE5',
            lineWidth: outer ? 1.5 : 1,
            lineDash: outer ? undefined : [3, 3],
          },
        });
      }

      // Radial spokes
      for (let k = 0; k < dimCount; k++) {
        const end = ptAt(k, 1);
        children.push({
          type: 'line',
          shape: { x1: cx, y1: cy, x2: end[0], y2: end[1] },
          style: { stroke: '#D6DCE5', lineWidth: 1.1 },
        });
      }

      // Ring tick labels along the top spoke
      for (const rv of ringValues) {
        const frac = (rv - scaleMin) / scaleSpan;
        const p = ptAt(0, frac);
        children.push({
          type: 'text',
          x: p[0] + 6,
          y: p[1],
          style: {
            text: Number.isInteger(rv) ? String(rv) : minus(rv.toFixed(1)),
            fill: AXIS,
            stroke: '#FFFFFF',
            lineWidth: 3,
            fontSize: 13.5,
            fontFamily: FONT,
            align: 'left',
            verticalAlign: 'middle',
          },
        });
      }

      // Cluster polygons (translucent fills first, then crisp strokes + markers)
      const polyCoords = centers.map(row => row.map((v, k) => ptAt(k, clampFloat((v - scaleMin) / scaleSpan, 0.04, 1))));
      polyCoords.forEach((pts, j) => {
        children.push({
          type: 'polygon',
          shape: { points: pts },
          style: { fill: colours[j], opacity: 0.14 },
        });
      });
      polyCoords.forEach((pts, j) => {
        children.push({
          type: 'polygon',
          shape: { points: pts },
          style: { fill: 'none', stroke: colours[j], lineWidth: 2.4 },
        });
        pts.forEach(p => {
          children.push({
            type: 'circle',
            shape: { cx: p[0], cy: p[1], r: 4.5 },
            style: { fill: colours[j], stroke: '#FFFFFF', lineWidth: 1.5 },
          });
        });
      });

      // Dimension axis titles positioned around vertices without clipping
      cleanVars.forEach((v, k) => {
        const a = angleAt(k);
        const ca = Math.cos(a), sa = Math.sin(a);
        const pad = Math.abs(sa) > 0.8 ? radius + 20 : radius + 24;
        const lx = cx + ca * pad;
        const ly = cy + sa * pad;
        const align = Math.abs(ca) < 0.25 ? 'center' : ca > 0 ? 'left' : 'right';
        const verticalAlign = sa < -0.55 ? 'bottom' : sa > 0.55 ? 'top' : 'middle';
        children.push({
          type: 'text',
          x: lx,
          y: ly,
          style: {
            text: wrapLabel(v, 10),
            fill: INK,
            fontSize: 16,
            fontFamily: FONT,
            fontWeight: 'bold',
            lineHeight: 20,
            align,
            verticalAlign,
          },
        });
      });

      // Subtle footer scale guide
      children.push({
        type: 'text',
        x: cx,
        y: height - 16,
        style: {
          text: isFivePoint ? '五点量表各维度原始均值（圆心 = 1.00 分，外环 = 5.00 分）' : `各维度原始均值刻度（圆心 = ${minus(scaleMin.toFixed(1))}，外环 = ${minus(bounds.max.toFixed(1))}）`,
          fill: AXIS,
          fontSize: 13.5,
          fontFamily: FONT,
          align: 'center',
          verticalAlign: 'middle',
        },
      });

      return { type: 'group', children } as unknown as Group;
    },
  };

  return {
    kind: 'radar',
    height,
    option: {
      ...base(),
      grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
      xAxis: { type: 'value', min: 0, max: width, show: false },
      yAxis: { type: 'value', min: 0, max: height, show: false },
      series: [radarScene],
    },
  };
}

/**
 * Dual-axis Pareto 80/20 chart: sorted descending bars for pain/frequency share (left axis) overlaid with the
 * cumulative percentage curve (right axis) and an 80% vital-few reference line. Pure custom SVG shapes guarantee zero
 * url() clipPaths.
 */
export function paretoPlot(
  items: readonly { name: string; count: number; sharePct: number; cumPct: number }[],
  ink: FigureInk,
): FigurePlan {
  if (items.length < 2 || items.some(it => !Number.isFinite(it.count) || !Number.isFinite(it.sharePct) || !Number.isFinite(it.cumPct))) {
    throw Error('帕累托图需要至少 2 项完整频数与累计比例数据。');
  }
  const sorted = [...items].sort((a, b) => b.count - a.count || b.sharePct - a.sharePct);
  const primary = inkPrimary(ink);
  const opp = inkOpposite(ink);
  const tailFill = mixHex(primary, '#FFFFFF', 0.48);

  const width = 960;
  const height = 520;
  const left = 86;
  const right = 870;
  const top = 76;
  const bottom = 398;
  const plotW = right - left;
  const plotH = bottom - top;

  const maxShare = Math.max(...sorted.map(it => it.sharePct), 10);
  const leftBounds = niceBounds(0, Math.min(100, maxShare * 1.2), 4);
  const leftMax = Math.max(leftBounds.max, 10);
  const rightTicks = [0, 25, 50, 75, 100];

  const slotW = plotW / sorted.length;
  const barW = Math.min(58, Math.max(24, slotW * 0.56));
  const maxWrap = sorted.length >= 7 ? 5 : 7;

  const paretoScene: CustomSeriesOption = {
    type: 'custom',
    clip: false,
    silent: true,
    z: 3,
    data: [[0]],
    renderItem: () => {
      const children: object[] = [];

      // Legend bar at top
      const legendItems = [
        { kind: 'bar' as const, label: '单选提及占总提及比（左轴 %）', color: primary },
        { kind: 'tail' as const, label: '次要长尾项（>80%区间）', color: tailFill },
        { kind: 'line' as const, label: '累计占比曲线（右轴 %）', color: opp },
        { kind: 'dash' as const, label: '80% 关键少数分界线', color: opp },
      ];
      let lx = left;
      legendItems.forEach(item => {
        if (item.kind === 'bar' || item.kind === 'tail') {
          children.push({ type: 'rect', shape: { x: lx, y: 18, width: 16, height: 12, r: 2 }, style: { fill: item.color } });
        } else if (item.kind === 'line') {
          children.push(
            { type: 'line', shape: { x1: lx, y1: 24, x2: lx + 18, y2: 24 }, style: { stroke: item.color, lineWidth: 2.5 } },
            { type: 'circle', shape: { cx: lx + 9, cy: 24, r: 4 }, style: { fill: item.color, stroke: '#FFFFFF', lineWidth: 1.2 } },
          );
        } else {
          children.push({ type: 'line', shape: { x1: lx, y1: 24, x2: lx + 18, y2: 24 }, style: { stroke: item.color, lineWidth: 2, lineDash: [4, 3] } });
        }
        children.push({
          type: 'text',
          x: lx + 23,
          y: 24,
          style: { text: item.label, fill: INK, fontSize: 14.5, fontFamily: FONT, align: 'left', verticalAlign: 'middle' },
        });
        lx += 23 + textPx(item.label, 14.5) + 22;
      });

      // Axis headers above spines (horizontal for crisp Chinese rendering)
      children.push(
        { type: 'text', x: left, y: top - 16, style: { text: '提及构成比 (%)', fill: AXIS, fontSize: 14.5, fontFamily: FONT, fontWeight: 'bold', align: 'left', verticalAlign: 'bottom' } },
        { type: 'text', x: right, y: top - 16, style: { text: '累计占比 (%)', fill: AXIS, fontSize: 14.5, fontFamily: FONT, fontWeight: 'bold', align: 'right', verticalAlign: 'bottom' } },
      );

      // Horizontal reference grid aligned to right ticks (0..100%)
      for (const rt of rightTicks) {
        const gy = bottom - (rt / 100) * plotH;
        children.push({
          type: 'line',
          shape: { x1: left, y1: gy, x2: right, y2: gy },
          style: { stroke: rt === 0 ? AXIS : GRID, lineWidth: rt === 0 ? 1.5 : 1 },
        });
        children.push({
          type: 'text',
          x: right + 10,
          y: gy,
          style: { text: `${rt}%`, fill: AXIS, fontSize: 14, fontFamily: FONT, align: 'left', verticalAlign: 'middle' },
        });
      }

      // Left axis ticks using leftBounds
      for (let lv = 0; lv <= leftMax + 1e-6; lv = Number((lv + leftBounds.interval).toPrecision(8))) {
        const gy = bottom - (lv / leftMax) * plotH;
        if (gy < top - 4) break;
        children.push({
          type: 'text',
          x: left - 10,
          y: gy,
          style: { text: `${Number.isInteger(lv) ? lv : lv.toFixed(1)}%`, fill: AXIS, fontSize: 14, fontFamily: FONT, align: 'right', verticalAlign: 'middle' },
        });
      }

      // Vertical left & right spines
      children.push(
        { type: 'line', shape: { x1: left, y1: top, x2: left, y2: bottom }, style: { stroke: AXIS, lineWidth: 1.5 } },
        { type: 'line', shape: { x1: right, y1: top, x2: right, y2: bottom }, style: { stroke: AXIS, lineWidth: 1.5 } },
      );

      // 80% Pareto threshold line
      const y80 = bottom - 0.8 * plotH;
      children.push(
        {
          type: 'line',
          shape: { x1: left, y1: y80, x2: right, y2: y80 },
          style: { stroke: opp, lineWidth: 1.8, lineDash: [6, 4] },
        },
        {
          type: 'text',
          x: left + 8,
          y: y80 - 9,
          style: {
            text: '80% 帕累托关键分界线',
            fill: opp,
            stroke: '#FFFFFF',
            lineWidth: 4,
            fontSize: 14,
            fontFamily: FONT,
            fontWeight: 'bold',
            align: 'left',
            verticalAlign: 'bottom',
          },
        },
      );

      // Determine vital-few cutoff index (items up to crossing 80% cumulative)
      const curvePts: [number, number][] = [];
      let vitalBoundaryX: number | null = null;

      sorted.forEach((it, i) => {
        const cx = left + slotW * (i + 0.5);
        const bh = clampFloat((it.sharePct / leftMax) * plotH, 2, plotH);
        const by = bottom - bh;
        const isVital = i === 0 || sorted[i - 1].cumPct < 80;
        if (!isVital && vitalBoundaryX === null) {
          vitalBoundaryX = left + slotW * i;
        }
        const cy = bottom - (clampFloat(it.cumPct, 0, 100) / 100) * plotH;
        curvePts.push([cx, cy]);

        children.push({
          type: 'rect',
          shape: { x: cx - barW / 2, y: by, width: barW, height: bh, r: [4, 4, 0, 0] },
          style: { fill: isVital ? primary : tailFill },
        });

        // Category label below axis
        children.push({
          type: 'text',
          x: cx,
          y: bottom + 14,
          style: {
            text: wrapLabel(cleanChineseChartLabel(it.name), maxWrap),
            fill: INK,
            fontSize: 14.5,
            fontFamily: FONT,
            lineHeight: 19,
            align: 'center',
            verticalAlign: 'top',
          },
        });
      });

      if (vitalBoundaryX !== null) {
        children.push({
          type: 'line',
          shape: { x1: vitalBoundaryX, y1: top, x2: vitalBoundaryX, y2: bottom },
          style: { stroke: '#C9CDD4', lineWidth: 1.2, lineDash: [4, 4] },
        });
      }

      // Cumulative polyline & markers
      children.push({
        type: 'polyline',
        shape: { points: curvePts },
        style: { fill: 'none', stroke: opp, lineWidth: 2.5 },
      });

      sorted.forEach((it, i) => {
        const [cx, cy] = curvePts[i];
        const bh = clampFloat((it.sharePct / leftMax) * plotH, 2, plotH);
        const by = bottom - bh;

        children.push({
          type: 'circle',
          shape: { cx, cy, r: 4.5 },
          style: { fill: opp, stroke: '#FFFFFF', lineWidth: 1.5 },
        });

        // Place share label inside bar if near cumulative dot, else cleanly above bar
        const shareStr = `${it.sharePct.toFixed(1)}%`;
        const shareInside = Math.abs(by - 10 - cy) < 22 && bh >= 28;
        children.push({
          type: 'text',
          x: cx,
          y: shareInside ? by + 15 : by - 8,
          style: {
            text: shareStr,
            fill: shareInside ? '#FFFFFF' : primary,
            stroke: shareInside ? 'none' : '#FFFFFF',
            lineWidth: shareInside ? 0 : 3,
            fontSize: 13.5,
            fontFamily: FONT,
            fontWeight: 'bold',
            align: 'center',
            verticalAlign: shareInside ? 'middle' : 'bottom',
          },
        });

        // Cumulative label positioned above/below point to dodge 80% line & bar tops
        const near80 = Math.abs(cy - y80) < 16;
        const putBelow = cy < top + 20 || (near80 && cy >= y80);
        children.push({
          type: 'text',
          x: cx,
          y: putBelow ? cy + 14 : cy - 11,
          style: {
            text: `${it.cumPct.toFixed(1)}%`,
            fill: opp,
            stroke: '#FFFFFF',
            lineWidth: 3.5,
            fontSize: 13.5,
            fontFamily: FONT,
            fontWeight: 'bold',
            align: 'center',
            verticalAlign: putBelow ? 'top' : 'bottom',
          },
        });
      });

      return { type: 'group', children } as unknown as Group;
    },
  };

  return {
    kind: 'pareto',
    height,
    option: {
      ...base(),
      grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
      xAxis: { type: 'value', min: 0, max: width, show: false },
      yAxis: { type: 'value', min: 0, max: height, show: false },
      series: [paretoScene],
    },
  };
}

/**
 * A method's figure travels in its registered result: the numbers it plots are the result's metrics, labelled
 * "名称｜量", so the preview, the editor and the Word export redraw the same figure from the stored result alone.
 * A figure whose numbers do not fit the result's 160 metrics is left out; the table still carries every value.
 */
export type FigureMetric = { label: string; value: number };
export type MethodFigureData =
  | { kind: 'forest'; rows: readonly { name: string; estimate: number; low: number; high: number }[] }
  | { kind: 'scree'; eigenvalues: readonly number[] }
  | { kind: 'quadrant'; points: readonly { name: string; importance: number; performance: number }[]; lines: { importance: number; performance: number } }
  | { kind: 'profile'; centers: readonly (readonly number[])[]; sizes: readonly number[]; variables: readonly string[] }
  | { kind: 'radar'; centers: readonly (readonly number[])[]; sizes: readonly number[]; variables: readonly string[]; names?: readonly string[] }
  | { kind: 'pareto'; items: readonly { name: string; count: number; sharePct: number; cumPct: number }[] }
  | { kind: 'dots'; dimensions: readonly string[]; groups: readonly { label: string; n: number }[]; means: readonly (readonly number[])[] }
  | { kind: 'likert'; items: readonly string[]; levels: readonly number[]; shares: readonly (readonly number[])[] }
  | { kind: 'correlation'; variables: readonly string[]; pairs: readonly { a: number; b: number; rho: number }[] };
const SEP = '｜', PAIR = ' ↔ ', MAX_METRICS = 160;
const key = (name: string) => name.replace(/\s+/gu, ' ').trim().slice(0, 120) || '未命名';

export function figureMetrics(data: MethodFigureData): FigureMetric[] | null {
  const metrics: FigureMetric[] = data.kind === 'forest' ? data.rows.flatMap(r => [{ label: `${key(r.name)}${SEP}估计值`, value: r.estimate }, { label: `${key(r.name)}${SEP}下限`, value: r.low }, { label: `${key(r.name)}${SEP}上限`, value: r.high }])
    : data.kind === 'scree' ? data.eigenvalues.map((value, j) => ({ label: `特征值${SEP}${j + 1}`, value }))
      : data.kind === 'quadrant' ? [{ label: `分界线${SEP}重要性`, value: data.lines.importance }, { label: `分界线${SEP}表现`, value: data.lines.performance },
        ...data.points.flatMap(p => [{ label: `${key(p.name)}${SEP}重要性`, value: p.importance }, { label: `${key(p.name)}${SEP}表现`, value: p.performance }])]
        : data.kind === 'profile' ? data.centers.flatMap((c, j) => [{ label: `第 ${j + 1} 类${SEP}人数`, value: data.sizes[j] }, ...c.map((value, d) => ({ label: `第 ${j + 1} 类${SEP}${key(data.variables[d])}`, value }))])
          : data.kind === 'radar' ? data.centers.flatMap((c, j) => {
            const cname = key(data.names?.[j] || `第 ${j + 1} 类`);
            return [{ label: `${cname}${SEP}人数`, value: data.sizes[j] }, ...c.map((value, d) => ({ label: `${cname}${SEP}${key(data.variables[d])}`, value }))];
          })
            : data.kind === 'pareto' ? data.items.flatMap(it => [
              { label: `${key(it.name)}${SEP}频数`, value: it.count },
              { label: `${key(it.name)}${SEP}占比`, value: it.sharePct },
              { label: `${key(it.name)}${SEP}累计`, value: it.cumPct },
            ])
              // A dot plot: each group's size, then every dimension's mean in each group.
              : data.kind === 'dots' ? [...data.groups.map(g => ({ label: `人数${SEP}${key(g.label)}`, value: g.n })), ...data.dimensions.flatMap((d, i) => data.groups.map((g, j) => ({ label: `${key(d)}${SEP}${key(g.label)}`, value: data.means[i][j] })))]
                : data.kind === 'likert' ? data.items.flatMap((item, i) => data.levels.map((l, k) => ({ label: `${key(item)}${SEP}${l} 分`, value: data.shares[i][k] })))
                  : data.pairs.map(p => ({ label: `${key(data.variables[p.a])}${PAIR}${key(data.variables[p.b])}${SEP}ρ`, value: p.rho }));
  return metrics.length <= MAX_METRICS && metrics.every(m => Number.isFinite(m.value)) ? metrics : null;
}

const FIGURE_OF: Record<string, MethodFigureData['kind']> = {
  regression: 'forest',
  logistic: 'forest',
  validity: 'scree',
  ipa: 'quadrant',
  'revised-ipa': 'quadrant',
  cluster: 'profile',
  'cluster-radar': 'radar',
  pareto: 'pareto',
  profile: 'dots',
  'group-compare': 'dots',
  likert: 'likert',
  correlation: 'correlation',
};
// Advanced methods whose results are tables of formatted text: they have no figure but their own.
const ADVANCED = new Set(['regression', 'logistic', 'validity', 'ipa', 'cluster', 'cluster-radar', 'pareto', 'profile', 'likert', 'correlation', 'ahp']);
const AUTONOMOUS_FIGURE_METHODS = new Set(['kano', 'rdd', 'cs-did', 'psm', 'conformal', 'topsis', 'iv', 'ab', 'survival', 'meta']);

/** Whether a result carries a method figure: every exporter then draws that figure instead of bars of a column. */
export const carriesFigure = (r: { id?: string; method: string; metrics: readonly { label: string }[]; variables?: readonly string[] }): boolean =>
  r.method === 'questionnaire-tree' || r.method === 'macro-trend' || r.method === 'summary-card' || r.method === 'cooccurrence' || r.method === 'wordcloud' || r.method === 'framework' || r.method === 'diagram' || r.method === 'infographic'
  || isResourceLibrarySnapshot(r)
  || AUTONOMOUS_FIGURE_METHODS.has(r.method)
  || (!!FIGURE_OF[r.method] && r.metrics.length > 0 && r.metrics.every(m => m.label.includes(SEP)));

/** Whether a result can be shown as a figure at all: not a sampling frame, and an advanced method only through its own figure. */
export const canChart = (r: { id?: string; method: string; metrics: readonly { label: string }[]; variables?: readonly string[] }): boolean =>
  r.method !== 'sampling-frame' && (!ADVANCED.has(r.method) || carriesFigure(r));

function extractProfilePValues(
  rows: readonly (readonly (string | number | null)[])[] | undefined,
  dimensions: readonly string[],
): (number | null)[] | undefined {
  if (!rows?.length) return undefined;
  return dimensions.map(dim => {
    const cleanDim = cleanChineseChartLabel(dim);
    const matched = rows.find(r => {
      const c0 = cleanChineseChartLabel(String(r[0] ?? ''));
      return c0 === cleanDim || String(r[0] ?? '').trim() === dim;
    });
    if (!matched) return null;
    const rawP = matched[matched.length - 1];
    if (typeof rawP === 'number' && Number.isFinite(rawP) && rawP >= 0 && rawP <= 1) return rawP;
    if (typeof rawP === 'string') {
      const s = rawP.trim();
      if (/^<\s*0?\.001$/u.test(s)) return 0.0005;
      if (/^<\s*0?\.01$/u.test(s)) return 0.005;
      if (/^<\s*0?\.05$/u.test(s)) return 0.025;
      const parsed = Number(s);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
    return null;
  });
}

/** The figure a method's result carries, or null when the result is of another method or carries none. */
export function methodFigure(
  r: {
    method: string;
    headers: readonly string[];
    metrics: readonly { label: string; value: number | null }[];
    rows?: readonly (readonly (string | number | null)[])[];
  },
  ink: FigureInk,
): FigurePlan | null {
  const accent = inkPrimary(ink), kind = FIGURE_OF[r.method], parts = r.metrics.map(m => ({ head: m.label.slice(0, m.label.lastIndexOf(SEP)), field: m.label.slice(m.label.lastIndexOf(SEP) + 1), value: m.value }));
  if (!carriesFigure(r) || parts.some(p => p.value === null || !p.head)) return null;
  const pick = (head: string, field: string) => parts.find(p => p.head === head && p.field === field)?.value as number;
  const heads = [...new Set(parts.map(p => p.head))];
  switch (kind) {
    case 'forest': {
      const rows = heads.map(name => ({ name, estimate: pick(name, '估计值'), low: pick(name, '下限'), high: pick(name, '上限') }));
      return r.method === 'logistic'
        ? forestPlot(rows, { axis: '优势比 OR（95% 置信区间，对数刻度）', reference: 1 }, accent)
        : forestPlot(rows, { axis: '回归系数 B（95% 置信区间）', reference: 0 }, accent);
    }
    case 'scree': return screePlot(parts.map(p => p.value as number), accent);
    case 'quadrant': {
      const names = heads.filter(h => h !== '分界线');
      const isImplicit = r.method === 'revised-ipa' || r.headers[1]?.startsWith('隐性') || r.headers[1]?.includes('衍生');
      return ipaPlot(names.map(name => ({ name, importance: pick(name, '重要性'), performance: pick(name, '表现') })), { importance: pick('分界线', '重要性'), performance: pick('分界线', '表现') },
        ink, isImplicit ? '隐性重要性（标准化系数）' : '重要性');
    }
    case 'profile': {
      // A cluster's label is "第 j 类｜变量"; the variable is everything after the first separator.
      const split = r.metrics.map(m => ({ head: m.label.slice(0, m.label.indexOf(SEP)), field: m.label.slice(m.label.indexOf(SEP) + 1), value: m.value as number }));
      const clusters = [...new Set(split.map(p => p.head))], variables = [...new Set(split.filter(p => p.field !== '人数').map(p => p.field))];
      const value = (head: string, field: string) => split.find(p => p.head === head && p.field === field)?.value as number;
      return clusterProfilePlot(clusters.map(c => variables.map(v => value(c, v))), clusters.map(c => value(c, '人数')), variables, ink);
    }
    case 'radar': {
      const split = r.metrics.map(m => ({ head: m.label.slice(0, m.label.indexOf(SEP)), field: m.label.slice(m.label.indexOf(SEP) + 1), value: m.value as number }));
      const clusters = [...new Set(split.map(p => p.head))], variables = [...new Set(split.filter(p => p.field !== '人数').map(p => p.field))];
      const value = (head: string, field: string) => split.find(p => p.head === head && p.field === field)?.value as number;
      return clusterRadarPlot(clusters.map(c => variables.map(v => value(c, v))), clusters.map(c => value(c, '人数')), variables, ink, clusters);
    }
    case 'pareto': {
      const items = heads.map(name => ({
        name,
        count: pick(name, '频数'),
        sharePct: pick(name, '占比'),
        cumPct: pick(name, '累计'),
      }));
      return paretoPlot(items, ink);
    }
    case 'dots': {
      const groups = parts.filter(p => p.head === '人数').map(p => ({ label: p.field, n: p.value as number })), dimensions = heads.filter(h => h !== '人数');
      const pVals = extractProfilePValues(r.rows, dimensions);
      return dotPlot(dimensions, groups, dimensions.map(d => groups.map(g => pick(d, g.label))), ink, pVals);
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
