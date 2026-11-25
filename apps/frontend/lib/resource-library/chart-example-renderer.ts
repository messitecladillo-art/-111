/**
 * Publication-grade SVG example chart renderer for EVI-X Resource Library (192 specialized 360x228 examples).
 * Every generated SVG strictly passes `assertTrueVector` (no gradients, clipPath, url(), <style>, or foreignObject),
 * derives a harmonious multi-color editorial palette from `FigureInk`, and escapes all XML text content.
 */
import type { FigureInk } from '../figure-palette.ts';

export interface ChartExampleSpec {
  id?: string;
  title: string;
  previewKind: string;
  intent?: string;
  methodFit?: string;
}

export interface ResolvedInk {
  primary: string;
  secondary: string;
  opposite: string;
  accent4: string;
  accent5: string;
  primarySoft: string;
  secondarySoft: string;
  oppositeSoft: string;
  primaryMid: string;
  secondaryMid: string;
  oppositeMid: string;
  cat: readonly string[];
  canvas: string;
  surface: string;
  border: string;
  grid: string;
  axis: string;
  text: string;
  muted: string;
  lightMuted: string;
}

const FONT = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif";
const W = 360;
const H = 228;

export function normalizeHex(hex: string, fallback = '#0F766E'): string {
  const s = (hex ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHex(hex);
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${cl(r)}${cl(g)}${cl(b)}`.toUpperCase();
}

export function mixHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const k = Math.min(1, Math.max(0, t));
  return rgbToHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
}

export function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, '#FFFFFF', amount);
}

export function darkenHex(hex: string, amount: number): string {
  return mixHex(hex, '#0F172A', amount);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = ((h * 60) + 360) % 360;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function shiftHueHex(hex: string, deg: number, targetS?: number, targetL?: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToHex(h + deg, targetS ?? Math.max(0.38, Math.min(0.74, s)), targetL ?? Math.max(0.28, Math.min(0.48, l)));
}

export function deriveInkPalette(ink: FigureInk = '#0F766E'): ResolvedInk {
  const primary = normalizeHex(typeof ink === 'string' ? ink : ink.primary, '#0F766E');
  const secondary = typeof ink === 'string'
    ? shiftHueHex(primary, 42, 0.54, 0.36)
    : normalizeHex(ink.secondary, '#234E80');
  const opposite = typeof ink === 'string'
    ? shiftHueHex(primary, 178, 0.68, 0.44)
    : normalizeHex(ink.opposite, '#C05621');
  const accent4 = mixHex(primary, secondary, 0.5);
  const accent5 = shiftHueHex(opposite, -46, 0.55, 0.45);
  return {
    primary,
    secondary,
    opposite,
    accent4,
    accent5,
    primarySoft: lightenHex(primary, 0.8),
    secondarySoft: lightenHex(secondary, 0.8),
    oppositeSoft: lightenHex(opposite, 0.8),
    primaryMid: lightenHex(primary, 0.45),
    secondaryMid: lightenHex(secondary, 0.45),
    oppositeMid: lightenHex(opposite, 0.45),
    cat: [primary, secondary, opposite, accent4, accent5, '#64748B'],
    canvas: '#FAF8F4',
    surface: '#FFFFFF',
    border: '#E4DFD5',
    grid: '#E6E2DA',
    axis: '#475569',
    text: '#1E293B',
    muted: '#64748B',
    lightMuted: '#94A3B8',
  };
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/url\s*\(/gi, 'u-r-l(')
    .replace(/data:/gi, 'd-a-t-a:');
}

const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const f2 = (v: number): string => (Math.round(v * 100) / 100).toString();

function textW(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 127 ? size * 0.98 : size * 0.54;
  return w;
}

interface TextOpts {
  size?: number;
  weight?: number | string;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  opacity?: number;
  rotate?: number;
}

function txt(x: number, y: number, s: string, opts: TextOpts = {}): string {
  const size = opts.size ?? 7.8;
  const fill = opts.fill ?? '#334155';
  const anchor = opts.anchor ?? 'start';
  const weight = opts.weight ? ` font-weight="${opts.weight}"` : '';
  const op = opts.opacity !== undefined ? ` opacity="${opts.opacity}"` : '';
  const tr = opts.rotate !== undefined ? ` transform="rotate(${f1(opts.rotate)} ${f1(x)} ${f1(y)})"` : '';
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="${FONT}" font-size="${size}"${weight} fill="${fill}" text-anchor="${anchor}"${op}${tr}>${escXml(s)}</text>`;
}

interface PillOpts {
  align?: 'left' | 'center' | 'right';
  bg: string;
  stroke: string;
  color: string;
  size?: number;
  h?: number;
  rx?: number;
}

function pill(x: number, y: number, label: string, opts: PillOpts): string {
  const size = opts.size ?? 7.5;
  const h = opts.h ?? 15;
  const w = Math.max(24, Math.ceil(textW(label, size)) + 11);
  const rx = opts.rx ?? h / 2;
  const x0 = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
  return `<rect x="${f1(x0)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(rx)}" fill="${opts.bg}" stroke="${opts.stroke}" stroke-width="0.8"/>`
    + txt(x0 + w / 2, y + h / 2 + size * 0.35, label, { size, weight: 600, fill: opts.color, anchor: 'middle' });
}

function headerFrame(title: string, badge: string, ink: ResolvedInk, inner: string): string {
  const header = `<rect x="0" y="0" width="${W}" height="${H}" rx="8" fill="${ink.canvas}"/>`
    + `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" stroke="${ink.border}" stroke-width="1"/>`
    + `<rect x="10" y="13" width="3" height="12" rx="1.5" fill="${ink.primary}"/>`
    + txt(17, 22.5, title, { size: 10, weight: 700, fill: ink.text })
    + pill(348, 11.5, badge, { bg: ink.primarySoft, stroke: mixHex(ink.primary, ink.canvas, 0.55), color: darkenHex(ink.primary, 0.22), size: 7.4, h: 15, align: 'right', rx: 7.5 })
    + `<line x1="12" y1="31" x2="348" y2="31" stroke="${ink.grid}" stroke-width="0.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">${header}${inner}</svg>`;
}

interface AxisTick {
  pos: number;
  label: string;
}

interface AxesConfig {
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  yTicks?: AxisTick[];
  xTicks?: AxisTick[];
  hGrid?: boolean;
  vGrid?: boolean;
  box?: boolean;
  xTitle?: string;
  yTitle?: string;
  leftAxis?: boolean;
  bottomAxis?: boolean;
}

function axesFrame(cfg: AxesConfig, ink: ResolvedInk): string {
  const x0 = cfg.x0 ?? 44, y0 = cfg.y0 ?? 42, x1 = cfg.x1 ?? 340, y1 = cfg.y1 ?? 192;
  const out: string[] = [];
  if (cfg.box) {
    out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${ink.surface}" fill-opacity="0.55" stroke="${ink.axis}" stroke-width="0.9"/>`);
  }
  if (cfg.yTicks) {
    for (const t of cfg.yTicks) {
      if (cfg.hGrid !== false) out.push(`<line x1="${x0}" y1="${f1(t.pos)}" x2="${x1}" y2="${f1(t.pos)}" stroke="${ink.grid}" stroke-width="0.7" stroke-dasharray="2.5 2"/>`);
      out.push(`<line x1="${x0 - 3}" y1="${f1(t.pos)}" x2="${x0}" y2="${f1(t.pos)}" stroke="${ink.axis}" stroke-width="0.8"/>`);
      out.push(txt(x0 - 5, t.pos + 2.6, t.label, { size: 7.2, fill: ink.muted, anchor: 'end' }));
    }
  }
  if (cfg.xTicks) {
    for (const t of cfg.xTicks) {
      if (cfg.vGrid) out.push(`<line x1="${f1(t.pos)}" y1="${y0}" x2="${f1(t.pos)}" y2="${y1}" stroke="${ink.grid}" stroke-width="0.7" stroke-dasharray="2.5 2"/>`);
      out.push(`<line x1="${f1(t.pos)}" y1="${y1}" x2="${f1(t.pos)}" y2="${y1 + 3}" stroke="${ink.axis}" stroke-width="0.8"/>`);
      out.push(txt(t.pos, y1 + 12, t.label, { size: 7.2, fill: ink.muted, anchor: 'middle' }));
    }
  }
  if (!cfg.box) {
    if (cfg.leftAxis !== false) out.push(`<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="${ink.axis}" stroke-width="1"/>`);
    if (cfg.bottomAxis !== false) out.push(`<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${ink.axis}" stroke-width="1"/>`);
  }
  if (cfg.xTitle) out.push(txt((x0 + x1) / 2, y1 + 23, cfg.xTitle, { size: 7.5, weight: 600, fill: ink.axis, anchor: 'middle' }));
  if (cfg.yTitle) out.push(txt(13, (y0 + y1) / 2, cfg.yTitle, { size: 7.4, weight: 600, fill: ink.axis, anchor: 'middle', rotate: -90 }));
  return out.join('');
}

function evenlySpacedTicks(minPos: number, maxPos: number, labels: readonly string[]): AxisTick[] {
  if (labels.length === 1) return [{ pos: (minPos + maxPos) / 2, label: labels[0] }];
  return labels.map((label, i) => ({ pos: minPos + (maxPos - minPos) * (i / (labels.length - 1)), label }));
}

function smoothCurvePath(pts: readonly [number, number][]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${f1(pts[0][0])} ${f1(pts[0][1])} L ${f1(pts[1][0])} ${f1(pts[1][1])}`;
  let d = `M ${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${f1(c1x)} ${f1(c1y)}, ${f1(c2x)} ${f1(c2y)}, ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}

function polyStr(pts: readonly [number, number][]): string {
  return pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
}

function bandPolygon(topPts: readonly [number, number][], botPts: readonly [number, number][], fill: string, opacity = 0.2): string {
  const all = [...topPts, ...botPts.slice().reverse()];
  return `<polygon points="${polyStr(all)}" fill="${fill}" fill-opacity="${opacity}"/>`;
}

function arrowPoly(x: number, y: number, angleDeg: number, size: number, color: string): string {
  const rad = (angleDeg * Math.PI) / 180;
  const p1: [number, number] = [x, y];
  const p2: [number, number] = [x - size * Math.cos(rad - 0.48), y - size * Math.sin(rad - 0.48)];
  const p3: [number, number] = [x - size * Math.cos(rad + 0.48), y - size * Math.sin(rad + 0.48)];
  return `<polygon points="${polyStr([p1, p2, p3])}" fill="${color}"/>`;
}

function errV(cx: number, yTop: number, yBot: number, color: string, cap = 3.5): string {
  return `<line x1="${f1(cx)}" y1="${f1(yTop)}" x2="${f1(cx)}" y2="${f1(yBot)}" stroke="${color}" stroke-width="1.2"/>`
    + `<line x1="${f1(cx - cap)}" y1="${f1(yTop)}" x2="${f1(cx + cap)}" y2="${f1(yTop)}" stroke="${color}" stroke-width="1.2"/>`
    + `<line x1="${f1(cx - cap)}" y1="${f1(yBot)}" x2="${f1(cx + cap)}" y2="${f1(yBot)}" stroke="${color}" stroke-width="1.2"/>`;
}

function errH(cy: number, xLeft: number, xRight: number, color: string, cap = 3): string {
  return `<line x1="${f1(xLeft)}" y1="${f1(cy)}" x2="${f1(xRight)}" y2="${f1(cy)}" stroke="${color}" stroke-width="1.3"/>`
    + `<line x1="${f1(xLeft)}" y1="${f1(cy - cap)}" x2="${f1(xLeft)}" y2="${f1(cy + cap)}" stroke="${color}" stroke-width="1.2"/>`
    + `<line x1="${f1(xRight)}" y1="${f1(cy - cap)}" x2="${f1(xRight)}" y2="${f1(cy + cap)}" stroke="${color}" stroke-width="1.2"/>`;
}

function legendChips(items: readonly { label: string; color: string; kind?: 'dot' | 'line' | 'box' | 'dash' }[], x: number, y: number, ink: ResolvedInk): string {
  let cx = x;
  return items.map(it => {
    let mark = '';
    if (it.kind === 'line') mark = `<line x1="${f1(cx)}" y1="${f1(y - 2.5)}" x2="${f1(cx + 11)}" y2="${f1(y - 2.5)}" stroke="${it.color}" stroke-width="1.8"/>`;
    else if (it.kind === 'dash') mark = `<line x1="${f1(cx)}" y1="${f1(y - 2.5)}" x2="${f1(cx + 11)}" y2="${f1(y - 2.5)}" stroke="${it.color}" stroke-width="1.6" stroke-dasharray="3 2"/>`;
    else if (it.kind === 'dot') mark = `<circle cx="${f1(cx + 4)}" cy="${f1(y - 2.5)}" r="3.2" fill="${it.color}"/>`;
    else mark = `<rect x="${f1(cx)}" y="${f1(y - 6)}" width="7.5" height="7.5" rx="1.5" fill="${it.color}" fill-opacity="0.85"/>`;
    const offset = it.kind === 'line' || it.kind === 'dash' ? 14 : 10;
    const labelSvg = txt(cx + offset, y, it.label, { size: 7.3, fill: ink.text });
    cx += offset + textW(it.label, 7.3) + 10;
    return mark + labelSvg;
  }).join('');
}

function colorbarV(x: number, y: number, w: number, h: number, colors: readonly string[], minL: string, maxL: string, title: string, ink: ResolvedInk): string {
  const n = colors.length;
  const segH = h / n;
  const rects = colors.map((c, i) =>
    `<rect x="${f1(x)}" y="${f1(y + i * segH)}" width="${w}" height="${f2(segH + 0.4)}" fill="${c}"/>`,
  ).join('');
  return rects
    + `<rect x="${f1(x)}" y="${f1(y)}" width="${w}" height="${h}" stroke="${ink.axis}" stroke-width="0.6"/>`
    + txt(x + w / 2, y - 4, title, { size: 7, weight: 600, fill: ink.muted, anchor: 'middle' })
    + txt(x + w + 3, y + 5, maxL, { size: 6.8, fill: ink.muted })
    + txt(x + w + 3, y + h, minL, { size: 6.8, fill: ink.muted });
}

function polarXY(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, rIn: number, rOut: number, startDeg: number, endDeg: number): string {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [x1, y1] = polarXY(cx, cy, rOut, startDeg);
  const [x2, y2] = polarXY(cx, cy, rOut, endDeg);
  if (rIn <= 0.5) return `M ${f1(cx)} ${f1(cy)} L ${f1(x1)} ${f1(y1)} A ${f1(rOut)} ${f1(rOut)} 0 ${large} 1 ${f1(x2)} ${f1(y2)} Z`;
  const [x3, y3] = polarXY(cx, cy, rIn, endDeg);
  const [x4, y4] = polarXY(cx, cy, rIn, startDeg);
  return `M ${f1(x1)} ${f1(y1)} A ${f1(rOut)} ${f1(rOut)} 0 ${large} 1 ${f1(x2)} ${f1(y2)} L ${f1(x3)} ${f1(y3)} A ${f1(rIn)} ${f1(rIn)} 0 ${large} 0 ${f1(x4)} ${f1(y4)} Z`;
}

type ExampleRenderer = (ink: ResolvedInk) => { title: string; badge: string; body: string };

const RENDERERS: Record<string, ExampleRenderer> = {
  // =========================================================================
  // 1. COMPARISON (比大小) - 14 types
  // =========================================================================
  bar: (ink) => {
    const cats = ['性价比', '渠道便利', '系统信任', '售后保障', '口碑推荐'];
    const vals = [3.18, 4.26, 3.94, 3.42, 3.76];
    const cis = [0.22, 0.18, 0.21, 0.24, 0.19];
    const x0 = 42, y0 = 44, x1 = 340, y1 = 192;
    const yMap = (v: number) => y1 - (v / 5) * (y1 - y0);
    const yTicks = [0, 1, 2, 3, 4, 5].map(v => ({ pos: yMap(v), label: String(v) }));
    const step = (x1 - x0) / cats.length;
    const xTicks = cats.map((label, i) => ({ pos: x0 + (i + 0.5) * step, label }));
    const bm = yMap(3.6);
    const bars = vals.map((v, i) => {
      const cx = xTicks[i].pos, top = yMap(v), c = i === 1 ? ink.primary : i === 2 ? ink.secondary : mixHex(ink.primary, ink.muted, 0.45);
      const yHi = yMap(v + cis[i]), yLo = yMap(v - cis[i]);
      return `<rect x="${f1(cx - 15)}" y="${f1(top)}" width="30" height="${f1(y1 - top)}" rx="2.5" fill="${c}" fill-opacity="0.34" stroke="${c}" stroke-width="1.4"/>`
        + errV(cx, yHi, yLo, darkenHex(c, 0.25), 3.5)
        + txt(cx, yHi - 4, `${v.toFixed(2)}${i === 1 ? '***' : ''}`, { size: 7.2, weight: 700, fill: ink.text, anchor: 'middle' });
    }).join('');
    return {
      title: '满意度五维均值 ± 95%CI 对比',
      badge: 'n=486 · F=18.4***',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '得分 (1–5分)' }, ink)
        + `<line x1="${x0}" y1="${f1(bm)}" x2="${x1}" y2="${f1(bm)}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="4 3"/>`
        + `<line x1="${x0 + 4}" y1="${y0 + 7}" x2="${x0 + 16}" y2="${y0 + 7}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2.5"/>`
        + txt(x0 + 19, y0 + 9.5, '总体均值 3.60', { size: 6.8, weight: 600, fill: ink.opposite, anchor: 'start' })
        + bars,
    };
  },

  hbar: (ink) => {
    const items = [
      ['操作步骤繁琐', 64.2],
      ['隐性费用担忧', 51.8],
      ['客服响应偏慢', 43.6],
      ['线下网点不足', 36.1],
      ['规则解释模糊', 28.4],
      ['退换流程受阻', 19.5],
    ] as const;
    const x0 = 84, y0 = 42, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + (v / 80) * (x1 - x0);
    const xTicks = [0, 20, 40, 60, 80].map(v => ({ pos: xMap(v), label: `${v}%` }));
    const rowH = (y1 - y0) / items.length;
    const bars = items.map(([lbl, v], i) => {
      const cy = y0 + (i + 0.5) * rowH;
      const bw = xMap(v) - x0;
      const c = i < 2 ? ink.primary : i < 4 ? ink.secondary : ink.muted;
      return txt(x0 - 5, cy + 2.6, lbl, { size: 7.4, fill: ink.text, anchor: 'end' })
        + `<rect x="${x0}" y="${f1(cy - 7)}" width="${f1(bw)}" height="14" rx="2.5" fill="${c}" fill-opacity="${f2(0.86 - i * 0.1)}" stroke="${c}" stroke-width="1"/>`
        + txt(x0 + bw + 4, cy + 2.6, `${v}%`, { size: 7.3, weight: 700, fill: c, anchor: 'start' });
    }).join('');
    return {
      title: '多选题用户核心痛点降序排行',
      badge: '普及率 · n=512',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '受访者选择普及率 (%)' }, ink) + bars,
    };
  },

  lollipop: (ink) => {
    const items = [
      ['即时履约', 4.46],
      ['价格透明', 4.21],
      ['数据隐私', 3.95],
      ['人工兜底', 3.68],
      ['界面引导', 3.31],
      ['社交互动', 2.84],
    ] as const;
    const x0 = 64, y0 = 42, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + ((v - 2) / 3) * (x1 - x0);
    const xTicks = [2, 3, 4, 5].map(v => ({ pos: xMap(v), label: `${v}.0` }));
    const refX = xMap(3.5);
    const rowH = (y1 - y0) / items.length;
    const rows = items.map(([lbl, v], i) => {
      const cy = y0 + (i + 0.5) * rowH, px = xMap(v);
      const c = v >= 3.5 ? ink.primary : ink.opposite;
      return txt(x0 - 5, cy + 2.6, lbl, { size: 7.5, fill: ink.text, anchor: 'end' })
        + `<line x1="${f1(refX)}" y1="${f1(cy)}" x2="${f1(px)}" y2="${f1(cy)}" stroke="${c}" stroke-width="2"/>`
        + `<circle cx="${f1(px)}" cy="${f1(cy)}" r="5" fill="${c}" stroke="${ink.surface}" stroke-width="1.2"/>`
        + txt(px + (v >= 3.5 ? 8 : -8), cy + 2.6, v.toFixed(2), { size: 7.2, weight: 700, fill: c, anchor: v >= 3.5 ? 'start' : 'end' });
    }).join('');
    return {
      title: '服务属性重要性基准偏离棒棒糖图',
      badge: '均值基准 3.50 · n=480',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '重要性均分 (1–5)' }, ink)
        + `<line x1="${f1(refX)}" y1="${y0}" x2="${f1(refX)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.1" stroke-dasharray="3.5 2.5"/>`
        + txt(refX + 3, y0 + 8, '基准 3.50', { size: 6.9, fill: ink.axis })
        + rows,
    };
  },

  dumbbell: (ink) => {
    const items = [
      ['配送时效', 3.12, 4.34],
      ['价格公平', 3.45, 4.18],
      ['客服可达', 2.88, 3.74],
      ['数字化率', 2.65, 4.02],
      ['信任口碑', 3.92, 3.56],
    ] as const;
    const x0 = 66, y0 = 48, x1 = 302, y1 = 192;
    const xMap = (v: number) => x0 + ((v - 2) / 3) * (x1 - x0);
    const xTicks = [2, 3, 4, 5].map(v => ({ pos: xMap(v), label: `${v}.0` }));
    const rowH = (y1 - y0) / items.length;
    const rows = items.map(([lbl, a, b], i) => {
      const cy = y0 + (i + 0.5) * rowH, xa = xMap(a), xb = xMap(b), delta = b - a;
      const dColor = delta >= 0 ? ink.primary : ink.opposite;
      return txt(x0 - 6, cy + 2.6, lbl, { size: 7.5, fill: ink.text, anchor: 'end' })
        + `<line x1="${f1(xa)}" y1="${f1(cy)}" x2="${f1(xb)}" y2="${f1(cy)}" stroke="${ink.lightMuted}" stroke-width="2.4"/>`
        + `<circle cx="${f1(xa)}" cy="${f1(cy)}" r="4.8" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="1"/>`
        + `<circle cx="${f1(xb)}" cy="${f1(cy)}" r="4.8" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="1"/>`
        + pill(342, cy - 6.5, `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`, { bg: delta >= 0 ? ink.primarySoft : ink.oppositeSoft, stroke: dColor, color: darkenHex(dColor, 0.15), size: 6.9, h: 13, align: 'right', rx: 4 });
    }).join('');
    return {
      title: '城区 vs 县域五维体验落差哑铃图',
      badge: '配对 t · p < 0.01',
      body: legendChips([{ label: '县域受访组', color: ink.secondary, kind: 'dot' }, { label: '主城区组', color: ink.primary, kind: 'dot' }], 66, 41, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '均值区间 (Δ = 城区 - 县域)' }, ink)
        + rows,
    };
  },

  slope: (ink) => {
    const xL = 96, xR = 252, y0 = 46, y1 = 190;
    const yMap = (v: number) => y1 - ((v - 2.5) / 2.2) * (y1 - y0);
    const items = [
      ['线上政务', 3.12, 4.28, ink.primary, true],
      ['移动支付', 3.44, 4.12, ink.primary, true],
      ['适老改造', 2.82, 3.64, ink.secondary, true],
      ['线下柜面', 3.94, 3.52, ink.opposite, true],
      ['人工热线', 3.22, 3.28, ink.lightMuted, false],
    ] as const;
    const lines = items.map(([lbl, v1, v2, c, bold]) => {
      const yA = yMap(v1), yB = yMap(v2);
      return `<line x1="${xL}" y1="${f1(yA)}" x2="${xR}" y2="${f1(yB)}" stroke="${c}" stroke-width="${bold ? 2.2 : 1.3}" stroke-opacity="${bold ? 0.92 : 0.7}"/>`
        + `<circle cx="${xL}" cy="${f1(yA)}" r="${bold ? 3.8 : 2.8}" fill="${c}"/>`
        + `<circle cx="${xR}" cy="${f1(yB)}" r="${bold ? 3.8 : 2.8}" fill="${c}"/>`
        + txt(xL - 6, yA + 2.5, `${lbl} ${v1.toFixed(2)}`, { size: 7.2, fill: bold ? ink.text : ink.muted, anchor: 'end' })
        + txt(xR + 6, yB + 2.5, `${v2.toFixed(2)} (${v2 >= v1 ? '+' : ''}${(v2 - v1).toFixed(2)})`, { size: 7.2, weight: bold ? 600 : 400, fill: c });
    }).join('');
    return {
      title: '试点前后五类服务满意度斜率变化',
      badge: '追踪配对 · n=316',
      body: `<line x1="${xL}" y1="${y0}" x2="${xL}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.2"/>`
        + `<line x1="${xR}" y1="${y0}" x2="${xR}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.2"/>`
        + txt(xL, y1 + 13, '试点前 (T0)', { size: 7.6, weight: 700, fill: ink.axis, anchor: 'middle' })
        + txt(xR, y1 + 13, '试点后 (T1)', { size: 7.6, weight: 700, fill: ink.primary, anchor: 'middle' })
        + lines,
    };
  },

  grouped_bar: (ink) => {
    const groups = ['Z世代 (18–25)', '中青年 (26–45)', '银发族 (46+)'];
    const series = [
      { name: '高频采纳', color: ink.primary, vals: [54, 42, 21] },
      { name: '偶发试用', color: ink.secondary, vals: [31, 38, 34] },
      { name: '观望未用', color: ink.opposite, vals: [15, 20, 45] },
    ];
    const x0 = 42, y0 = 48, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - (v / 60) * (y1 - y0);
    const yTicks = [0, 15, 30, 45, 60].map(v => ({ pos: yMap(v), label: `${v}%` }));
    const gStep = (x1 - x0) / groups.length;
    const xTicks = groups.map((label, i) => ({ pos: x0 + (i + 0.5) * gStep, label }));
    const bars = groups.flatMap((_, gi) => {
      const gx = xTicks[gi].pos;
      return series.map((s, si) => {
        const bx = gx - 30 + si * 21;
        const v = s.vals[gi], top = yMap(v);
        return `<rect x="${f1(bx)}" y="${f1(top)}" width="17" height="${f1(y1 - top)}" rx="2" fill="${s.color}" fill-opacity="0.78" stroke="${s.color}" stroke-width="0.9"/>`
          + txt(bx + 8.5, top - 3, `${v}%`, { size: 6.7, weight: 600, fill: s.color, anchor: 'middle' });
      });
    }).join('');
    return {
      title: '不同代际群体使用频率交叉柱图',
      badge: 'χ²=34.2 · p < 0.001',
      body: legendChips(series.map(s => ({ label: s.name, color: s.color, kind: 'box' })), 44, 41, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '组内占比 (%)' }, ink)
        + bars,
    };
  },

  diverging_bar: (ink) => {
    const items = [
      ['界面流程流畅', -12, 16, 72],
      ['资费规则透明', -24, 18, 58],
      ['隐私安全感', -19, 21, 60],
      ['人工客服响应', -34, 22, 44],
      ['主动推荐意愿', -15, 19, 66],
    ] as const;
    const x0 = 76, y0 = 48, x1 = 336, y1 = 192;
    const mid = 178, scale = 1.6;
    const rowH = (y1 - y0) / items.length;
    const rows = items.map(([lbl, neg, neu, pos], i) => {
      const cy = y0 + (i + 0.5) * rowH;
      const lw = Math.abs(neg) * scale, nw = neu * scale * 0.5, rw = pos * scale;
      return txt(x0 - 5, cy + 2.6, lbl, { size: 7.4, fill: ink.text, anchor: 'end' })
        + `<rect x="${f1(mid - nw - lw)}" y="${f1(cy - 6.5)}" width="${f1(lw)}" height="13" rx="2" fill="${ink.opposite}" fill-opacity="0.76"/>`
        + `<rect x="${f1(mid - nw)}" y="${f1(cy - 6.5)}" width="${f1(nw * 2)}" height="13" fill="#CBD5E1" fill-opacity="0.65"/>`
        + `<rect x="${f1(mid + nw)}" y="${f1(cy - 6.5)}" width="${f1(rw)}" height="13" rx="2" fill="${ink.primary}" fill-opacity="0.82"/>`
        + txt(mid - nw - lw - 3, cy + 2.4, `${Math.abs(neg)}%`, { size: 6.8, weight: 600, fill: ink.opposite, anchor: 'end' })
        + txt(mid, cy + 2.4, `${neu}%`, { size: 6.4, fill: ink.axis, anchor: 'middle' })
        + txt(mid + nw + rw + 3, cy + 2.4, `${pos}%`, { size: 6.8, weight: 700, fill: ink.primary });
    }).join('');
    return {
      title: '李克特五点态度发散净偏好条图',
      badge: 'Cronbach α=0.884',
      body: legendChips([
        { label: '否定 (1–2分)', color: ink.opposite, kind: 'box' },
        { label: '中性 (3分)', color: '#94A3B8', kind: 'box' },
        { label: '赞同 (4–5分)', color: ink.primary, kind: 'box' },
      ], 76, 41, ink)
        + `<line x1="${mid}" y1="${y0}" x2="${mid}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + txt(mid, y1 + 12, '中性中心轴', { size: 7.1, fill: ink.muted, anchor: 'middle' })
        + rows,
    };
  },

  waterfall: (ink) => {
    const steps = [
      ['基准分', 0, 3.10, 'base'],
      ['渠道触达', 3.10, 3.58, 'pos'],
      ['品牌信任', 3.58, 3.94, 'pos'],
      ['价格摩擦', 3.94, 3.72, 'neg'],
      ['售后兜底', 3.72, 4.01, 'pos'],
      ['风险顾虑', 4.01, 3.87, 'neg'],
      ['总得分', 0, 3.87, 'total'],
    ] as const;
    const x0 = 42, y0 = 44, x1 = 342, y1 = 192;
    const yMap = (v: number) => y1 - (v / 4.5) * (y1 - y0);
    const yTicks = [0, 1, 2, 3, 4].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const stepW = (x1 - x0) / steps.length;
    const xTicks = steps.map(([lbl], i) => ({ pos: x0 + (i + 0.5) * stepW, label: lbl }));
    const bars = steps.map(([, s, e, kind], i) => {
      const cx = xTicks[i].pos, yA = yMap(Math.max(s, e)), yB = yMap(Math.min(s, e));
      const c = kind === 'base' ? ink.muted : kind === 'total' ? ink.secondary : kind === 'pos' ? ink.primary : ink.opposite;
      const delta = e - s;
      const lbl = kind === 'base' || kind === 'total' ? e.toFixed(2) : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
      const conn = i < steps.length - 1
        ? `<line x1="${f1(cx + 12)}" y1="${f1(yMap(e))}" x2="${f1(xTicks[i + 1].pos - 12)}" y2="${f1(yMap(e))}" stroke="${ink.lightMuted}" stroke-width="0.8" stroke-dasharray="2 2"/>`
        : '';
      return conn
        + `<rect x="${f1(cx - 12)}" y="${f1(yA)}" width="24" height="${f1(Math.max(2, yB - yA))}" rx="2" fill="${c}" fill-opacity="${kind === 'base' ? 0.5 : 0.82}" stroke="${c}" stroke-width="1"/>`
        + txt(cx, yA - 3.5, lbl, { size: 7, weight: 700, fill: c, anchor: 'middle' });
    }).join('');
    return {
      title: '总体满意度增量归因瀑布图',
      badge: '净增 Δ=+0.77分',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '累计评分' }, ink) + bars,
    };
  },

  bullet_kpi: (ink) => {
    const kpis = [
      ['核心留存率', 78, 75, 100, '%'],
      ['净推荐 NPS', 46, 50, 80, '分'],
      ['试点转化率', 64, 58, 100, '%'],
      ['综合满意度', 4.18, 4.0, 5.0, '分'],
    ] as const;
    const x0 = 76, y0 = 48, x1 = 304, y1 = 192;
    const rowH = (y1 - y0) / kpis.length;
    const rows = kpis.map(([lbl, act, tgt, maxV, unit], i) => {
      const cy = y0 + (i + 0.5) * rowH, w = x1 - x0;
      const pxAct = x0 + (act / maxV) * w, pxTgt = x0 + (tgt / maxV) * w;
      const ok = act >= tgt;
      return txt(x0 - 6, cy + 2.6, lbl, { size: 7.5, weight: 600, fill: ink.text, anchor: 'end' })
        + `<rect x="${x0}" y="${f1(cy - 9)}" width="${w}" height="18" rx="2" fill="#EAE6DE"/>`
        + `<rect x="${x0}" y="${f1(cy - 9)}" width="${f1(w * 0.78)}" height="18" rx="2" fill="#DAD4C8"/>`
        + `<rect x="${x0}" y="${f1(cy - 9)}" width="${f1(w * 0.52)}" height="18" fill="#C8C1B4"/>`
        + `<rect x="${x0}" y="${f1(cy - 4)}" width="${f1(pxAct - x0)}" height="8" rx="1.5" fill="${ok ? ink.primary : ink.opposite}"/>`
        + `<line x1="${f1(pxTgt)}" y1="${f1(cy - 10)}" x2="${f1(pxTgt)}" y2="${f1(cy + 10)}" stroke="#0F172A" stroke-width="2"/>`
        + txt(x1 + 6, cy + 2.6, `${act}${unit} / ${tgt}`, { size: 7.2, weight: 700, fill: ok ? ink.primary : ink.opposite });
    }).join('');
    return {
      title: '运营 KPI 目标达成子弹对比图',
      badge: '3/4 指标达标',
      body: legendChips([
        { label: '实际绩效', color: ink.primary, kind: 'box' },
        { label: '目标基线', color: '#0F172A', kind: 'line' },
        { label: '优/良/差区间', color: '#C8C1B4', kind: 'box' },
      ], 76, 41, ink)
        + `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + rows,
    };
  },

  nightingale_rose: (ink) => {
    const cx = 170, cy = 135, maxR = 62;
    const petals = [
      ['性价比', 0.92, ink.primary],
      ['功能实用', 0.84, ink.secondary],
      ['渠道便利', 0.76, ink.accent4],
      ['品牌口碑', 0.68, ink.primary],
      ['客服响应', 0.58, ink.secondary],
      ['界面设计', 0.52, ink.accent5],
      ['隐私合规', 0.44, ink.opposite],
      ['社群推荐', 0.36, ink.muted],
    ] as const;
    const rings = [0.33, 0.66, 1.0].map((t, idx) =>
      `<circle cx="${cx}" cy="${cy}" r="${f1(maxR * t)}" stroke="${ink.grid}" stroke-width="0.8" stroke-dasharray="2.5 2"/>`
      + txt(cx + 2, cy - maxR * t + 7, `${(idx + 1) * 20}%`, { size: 6.4, fill: ink.lightMuted }),
    ).join('');
    const step = 360 / petals.length;
    const sectors = petals.map(([lbl, ratio, c], i) => {
      const a0 = i * step + 1.5, a1 = (i + 1) * step - 1.5, r = maxR * ratio;
      const [lx, ly] = polarXY(cx, cy, r + 10, (a0 + a1) / 2);
      const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
      return `<path d="${arcPath(cx, cy, 12, r, a0, a1)}" fill="${c}" fill-opacity="0.38" stroke="${c}" stroke-width="1.3"/>`
        + txt(lx, ly + 2.5, `${lbl} ${Math.round(ratio * 65)}%`, { size: 6.8, weight: 600, fill: ink.text, anchor });
    }).join('');
    return {
      title: '消费决策动因南丁格尔玫瑰图',
      badge: '8大动因 · n=492',
      body: rings + sectors + `<circle cx="${cx}" cy="${cy}" r="11" fill="${ink.canvas}" stroke="${ink.border}" stroke-width="0.8"/>`
        + txt(cx, cy + 2.5, '动因', { size: 6.8, weight: 700, fill: ink.text, anchor: 'middle' }),
    };
  },

  radial_grouped_bar: (ink) => {
    const cx = 148, cy = 129, r0 = 22, rMax = 68;
    const dims = [
      ['易用性', 58, 42],
      ['价格感', 46, 54],
      ['可达性', 62, 34],
      ['信任感', 52, 48],
      ['复购率', 64, 38],
      ['口碑度', 49, 44],
    ] as const;
    const rings = [20, 40, 60].map(v => {
      const r = r0 + (v / 70) * (rMax - r0);
      return `<circle cx="${cx}" cy="${cy}" r="${f1(r)}" stroke="${ink.grid}" stroke-width="0.7" stroke-dasharray="2 2"/>`
        + txt(cx + 2, cy - r + 6, `${v}`, { size: 6.2, fill: ink.lightMuted });
    }).join('');
    const step = 360 / dims.length;
    const wedges = dims.map(([lbl, v1, v2], i) => {
      const mid = i * step;
      const r1 = r0 + (v1 / 70) * (rMax - r0), r2 = r0 + (v2 / 70) * (rMax - r0);
      const [lx, ly] = polarXY(cx, cy, rMax + 11, mid);
      const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
      return `<path d="${arcPath(cx, cy, r0, r1, mid - 13, mid - 1.5)}" fill="${ink.primary}" fill-opacity="0.72" stroke="${ink.primary}" stroke-width="0.9"/>`
        + `<path d="${arcPath(cx, cy, r0, r2, mid + 1.5, mid + 13)}" fill="${ink.secondary}" fill-opacity="0.65" stroke="${ink.secondary}" stroke-width="0.9"/>`
        + txt(lx, ly + 2.5, lbl, { size: 7.2, weight: 600, fill: ink.text, anchor });
    }).join('');
    return {
      title: '城乡六维均值极坐标环形分组柱图',
      badge: '极坐标对比 · n=506',
      body: rings + `<circle cx="${cx}" cy="${cy}" r="${r0}" stroke="${ink.axis}" stroke-width="0.9"/>` + wedges
        + legendChips([{ label: '城区组', color: ink.primary, kind: 'box' }, { label: '县域组', color: ink.secondary, kind: 'box' }], 248, 56, ink)
        + txt(248, 72, '外径刻度: 0–70 分', { size: 7, fill: ink.muted }),
    };
  },

  isometric_bar_3d: (ink) => {
    const ox = 176, oy = 186;
    const project = (ix: number, iy: number, z: number): [number, number] => [
      ox + (ix - iy) * 24,
      oy - (ix + iy) * 11 - z,
    ];
    const rows = ['华东', '华中', '西南'];
    const cols = ['价格', '渠道', '信任', '售后'];
    const gridData = [
      [38, 62, 54, 46],
      [30, 48, 42, 34],
      [22, 36, 32, 26],
    ];
    const floorPts = [project(-0.4, -0.4, 0), project(3.8, -0.4, 0), project(3.8, 2.8, 0), project(-0.4, 2.8, 0)];
    let prisms = `<polygon points="${polyStr(floorPts)}" fill="${ink.surface}" stroke="${ink.grid}" stroke-width="1"/>`;
    // Draw back-to-front so painter's algorithm overlays cleanly
    for (let iy = 2; iy >= 0; iy--) {
      for (let ix = 3; ix >= 0; ix--) {
        const h = gridData[iy][ix];
        const baseColor = ix === 1 ? ink.primary : ix === 2 ? ink.secondary : mixHex(ink.primary, ink.muted, 0.35);
        const topC = lightenHex(baseColor, 0.25), leftC = baseColor, rightC = darkenHex(baseColor, 0.22);
        const dx = 0.62, dy = 0.62;
        const t1 = project(ix, iy, h), t2 = project(ix + dx, iy, h), t3 = project(ix + dx, iy + dy, h), t4 = project(ix, iy + dy, h);
        const b2 = project(ix + dx, iy, 0), b4 = project(ix, iy + dy, 0), b1 = project(ix, iy, 0);
        prisms += `<polygon points="${polyStr([t4, t1, b1, b4])}" fill="${leftC}" stroke="${ink.surface}" stroke-width="0.6"/>`
          + `<polygon points="${polyStr([t1, t2, b2, b1])}" fill="${rightC}" stroke="${ink.surface}" stroke-width="0.6"/>`
          + `<polygon points="${polyStr([t1, t2, t3, t4])}" fill="${topC}" stroke="${ink.surface}" stroke-width="0.7"/>`;
        if (iy === 0 && ix === 1) {
          prisms += txt(t3[0], t3[1] - 5, '峰值 4.42', { size: 7, weight: 700, fill: ink.primary, anchor: 'middle' });
        }
      }
    }
    const colLbls = cols.map((c, ix) => {
      const [px, py] = project(ix + 0.3, -0.7, 0);
      return txt(px + 8, py + 10, c, { size: 7.2, fill: ink.axis, anchor: 'middle' });
    }).join('');
    const rowLbls = rows.map((r, iy) => {
      const [px, py] = project(-0.6, iy + 0.3, 0);
      return txt(px - 10, py + 6, r, { size: 7.2, fill: ink.axis, anchor: 'end' });
    }).join('');
    return {
      title: '区域×维度三维轴测均值柱阵',
      badge: '双因素交互 · n=506',
      body: prisms + colLbls + rowLbls,
    };
  },

  pareto_front_3d_proj: (ink) => {
    const proj = (u: number, v: number, z: number): [number, number] => [
      148 + (u - v) * 74,
      192 - (u + v) * 26 - z * 68,
    ];
    const zFn = (u: number, v: number) => 0.90 - 0.56 * Math.pow(1 - u, 1.35) * Math.pow(1 - v, 1.35);
    const frameEdges: [[number, number, number], [number, number, number]][] = [
      [[0, 0, 0], [1, 0, 0]],
      [[0, 0, 0], [0, 1, 0]],
      [[0, 1, 0], [1, 1, 0]],
      [[1, 0, 0], [1, 1, 0]],
      [[0, 1, 0], [0, 1, 1]],
      [[1, 0, 0], [1, 0, 1]],
      [[1, 1, 0], [1, 1, 1]],
      [[0, 1, 1], [1, 1, 1]],
      [[1, 0, 1], [1, 1, 1]],
    ];
    let boxLines = frameEdges.map(([a, b]) => {
      const pa = proj(...a), pb = proj(...b);
      return `<line x1="${f1(pa[0])}" y1="${f1(pa[1])}" x2="${f1(pb[0])}" y2="${f1(pb[1])}" stroke="${ink.grid}" stroke-width="0.9"/>`;
    }).join('');
    for (const t of [0.25, 0.5, 0.75]) {
      const a1 = proj(t, 0, 0), a2 = proj(t, 1, 0);
      const b1 = proj(0, t, 0), b2 = proj(1, t, 0);
      boxLines += `<line x1="${f1(a1[0])}" y1="${f1(a1[1])}" x2="${f1(a2[0])}" y2="${f1(a2[1])}" stroke="${ink.grid}" stroke-width="0.6" stroke-dasharray="2 2"/>`
        + `<line x1="${f1(b1[0])}" y1="${f1(b1[1])}" x2="${f1(b2[0])}" y2="${f1(b2[1])}" stroke="${ink.grid}" stroke-width="0.6" stroke-dasharray="2 2"/>`;
    }
    const gridN = 4;
    const step = 0.84 / gridN;
    let mesh = '';
    for (let iv = gridN - 1; iv >= 0; iv--) {
      for (let iu = gridN - 1; iu >= 0; iu--) {
        const u0 = 0.08 + iu * step, u1 = u0 + step;
        const v0 = 0.08 + iv * step, v1 = v0 + step;
        const p00 = proj(u0, v0, zFn(u0, v0)), p10 = proj(u1, v0, zFn(u1, v0));
        const p11 = proj(u1, v1, zFn(u1, v1)), p01 = proj(u0, v1, zFn(u0, v1));
        const avgZ = (zFn(u0, v0) + zFn(u1, v0) + zFn(u1, v1) + zFn(u0, v1)) / 4;
        const tCol = Math.min(1, Math.max(0, (avgZ - 0.36) / 0.52));
        const fill = mixHex(ink.secondarySoft, ink.primary, tCol);
        mesh += `<polygon points="${polyStr([p00, p10, p11, p01])}" fill="${fill}" fill-opacity="0.72" stroke="${darkenHex(fill, 0.22)}" stroke-width="0.65"/>`;
      }
    }
    const dominated: [number, number, number][] = [
      [0.32, 0.64, 0.42], [0.58, 0.72, 0.48], [0.76, 0.45, 0.51], [0.46, 0.26, 0.34], [0.72, 0.78, 0.58],
    ];
    const frontNodes: { u: number; v: number; knee?: boolean }[] = [
      { u: 0.14, v: 0.22 }, { u: 0.24, v: 0.62 }, { u: 0.45, v: 0.45, knee: true }, { u: 0.68, v: 0.28 }, { u: 0.84, v: 0.78 },
    ];
    const domSvg = dominated.map(([u, v, z]) => {
      const pf = proj(u, v, 0), p = proj(u, v, z);
      return `<circle cx="${f1(pf[0])}" cy="${f1(pf[1])}" r="1.8" fill="${ink.lightMuted}" fill-opacity="0.45"/>`
        + `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="2.5" fill="${ink.lightMuted}" fill-opacity="0.85" stroke="${ink.surface}" stroke-width="0.6"/>`;
    }).join('');
    const frontSvg = frontNodes.map(({ u, v, knee }) => {
      const z = zFn(u, v), pf = proj(u, v, 0), p = proj(u, v, z);
      const col = knee ? ink.opposite : ink.primary;
      return `<line x1="${f1(pf[0])}" y1="${f1(pf[1])}" x2="${f1(p[0])}" y2="${f1(p[1])}" stroke="${col}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<circle cx="${f1(pf[0])}" cy="${f1(pf[1])}" r="2.2" fill="${col}" fill-opacity="0.5"/>`
        + `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${knee ? 4.3 : 3.2}" fill="${col}" stroke="${ink.surface}" stroke-width="1"/>`
        + (knee ? txt(p[0] + 6, p[1] - 5, '膝点 P*', { size: 7, weight: 700, fill: ink.opposite }) : '');
    }).join('');
    const barCols = [ink.primary, lightenHex(ink.primary, 0.28), lightenHex(ink.primary, 0.56), ink.secondarySoft];
    const axU = proj(1, 0, 0), axV = proj(0, 1, 0), axZ = proj(0, 1, 1);
    return {
      title: '多目标优化非支配帕累托前沿投影',
      badge: 'Pareto* · 3D 投影面',
      body: legendChips([
        { label: '非支配前沿面', color: ink.primary, kind: 'box' },
        { label: '折衷膝点 P*', color: ink.opposite, kind: 'dot' },
        { label: '受支配解', color: ink.lightMuted, kind: 'dot' },
      ], 20, 41, ink)
        + boxLines + mesh + domSvg + frontSvg
        + txt(axU[0] + 4, axU[1] + 9, '实施成本 f1 ↓', { size: 7, weight: 600, fill: ink.axis })
        + txt(axV[0] - 4, axV[1] + 9, '风险代价 f2 ↓', { size: 7, weight: 600, fill: ink.axis, anchor: 'end' })
        + txt(axZ[0] - 4, axZ[1] - 4, '服务效能 f3 ↑', { size: 7, weight: 600, fill: ink.axis, anchor: 'end' })
        + colorbarV(300, 62, 10, 114, barCols, '0.35', '0.90', '效能 f3', ink),
    };
  },

  prompt_eval_radar_diff: (ink) => {
    const cx = 100, cy = 128, maxR = 46;
    const dims = [
      { lbl: '推理准确', base: 70, opt: 88.4, diff: 18.4 },
      { lbl: '事实忠实', base: 74, opt: 88.2, diff: 14.2 },
      { lbl: '格式遵循', base: 80, opt: 91.6, diff: 11.6 },
      { lbl: '指令理解', base: 78, opt: 86.8, diff: 8.8 },
      { lbl: '鲁棒抗扰', base: 68, opt: 74.2, diff: 6.2 },
      { lbl: '吞吐效率', base: 84, opt: 80.6, diff: -3.4 },
    ] as const;
    const rings = [20, 40, 60, 80, 100].map(v => {
      const r = (v / 100) * maxR;
      const pts = dims.map((_, i) => polarXY(cx, cy, r, i * 60));
      return `<polygon points="${polyStr(pts)}" stroke="${ink.grid}" stroke-width="0.75"/>`;
    }).join('');
    const spokes = dims.map((d, i) => {
      const [px, py] = polarXY(cx, cy, maxR, i * 60);
      const [lx, ly] = polarXY(cx, cy, maxR + 11, i * 60);
      const anchor = lx > cx + 6 ? 'start' : lx < cx - 6 ? 'end' : 'middle';
      const dy = ly < cy - maxR ? -2 : ly > cy + maxR ? 7 : 2.5;
      return `<line x1="${cx}" y1="${cy}" x2="${f1(px)}" y2="${f1(py)}" stroke="${ink.grid}" stroke-width="0.75"/>`
        + txt(lx, ly + dy, d.lbl, { size: 6.9, weight: 600, fill: ink.text, anchor });
    }).join('');
    const basePts = dims.map((d, i) => polarXY(cx, cy, (d.base / 100) * maxR, i * 60));
    const optPts = dims.map((d, i) => polarXY(cx, cy, (d.opt / 100) * maxR, i * 60));

    const rx0 = 248, ry0 = 54, rx1 = 342, ry1 = 186;
    const xMap = (v: number) => rx0 + ((v + 12) / 40) * (rx1 - rx0);
    const xZ = xMap(0);
    const xTicks = [-10, 0, 10, 20].map(v => ({ pos: xMap(v), label: v > 0 ? `+${v}` : String(v) }));
    const rowH = (ry1 - ry0) / dims.length;
    const diffBars = dims.map((d, i) => {
      const cyRow = ry0 + (i + 0.5) * rowH;
      const xVal = xMap(d.diff);
      const col = d.diff >= 0 ? ink.primary : ink.opposite;
      const bx = Math.min(xZ, xVal), bw = Math.max(2, Math.abs(xVal - xZ));
      const lblX = d.diff >= 0 ? xVal + 3 : xVal - 3;
      const lblAnc = d.diff >= 0 ? 'start' : 'end';
      return txt(rx0 - 4, cyRow + 2.4, d.lbl, { size: 6.7, weight: 600, fill: ink.text, anchor: 'end' })
        + `<rect x="${f1(bx)}" y="${f1(cyRow - 5.5)}" width="${f1(bw)}" height="11" rx="1.6" fill="${col}" fill-opacity="0.8"/>`
        + txt(lblX, cyRow + 2.4, `${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(1)}`, { size: 6.5, weight: 700, fill: col, anchor: lblAnc });
    }).join('');
    return {
      title: '智能问答方案多维评测雷达差值对比',
      badge: '均分增益 +9.3pt · 6维',
      body: legendChips([
        { label: '优化方案 (CoT+RAG)', color: ink.primary, kind: 'box' },
        { label: '基线方案', color: ink.secondary, kind: 'dash' },
        { label: '效率代价 Δ<0', color: ink.opposite, kind: 'box' },
      ], 20, 40, ink)
        + rings + spokes
        + `<polygon points="${polyStr(basePts)}" fill="${ink.secondary}" fill-opacity="0.1" stroke="${ink.secondary}" stroke-width="1.5" stroke-dasharray="3.5 2"/>`
        + `<polygon points="${polyStr(optPts)}" fill="${ink.primary}" fill-opacity="0.22" stroke="${ink.primary}" stroke-width="1.9"/>`
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, box: true, xTicks, vGrid: true, hGrid: false, xTitle: '相对基线净增益 Δ (分)' }, ink)
        + `<line x1="${f1(xZ)}" y1="${ry0}" x2="${f1(xZ)}" y2="${ry1}" stroke="${ink.axis}" stroke-width="1"/>`
        + diffBars,
    };
  },

  // =========================================================================
  // 2. DISTRIBUTION (看分布) - 17 types
  // =========================================================================
  raincloud: (ink) => {
    const groups = [
      { label: '一线城市', color: ink.primary, y: 62, peak: 222, box: [186, 250], med: 218, pts: [148, 166, 178, 194, 206, 214, 224, 232, 246, 264, 282] },
      { label: '新一线', color: ink.secondary, y: 112, peak: 196, box: [158, 224], med: 194, pts: [122, 138, 152, 168, 180, 192, 204, 216, 234, 254] },
      { label: '县域地区', color: ink.opposite, y: 162, peak: 158, box: [122, 190], med: 154, pts: [96, 112, 126, 138, 148, 162, 176, 192, 210, 228] },
    ];
    const x0 = 66, y0 = 42, x1 = 338, y1 = 192;
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const body = groups.map(g => {
      const kdePts: [number, number][] = [
        [g.peak - 92, g.y], [g.peak - 64, g.y - 4], [g.peak - 36, g.y - 18], [g.peak - 14, g.y - 28],
        [g.peak, g.y - 30], [g.peak + 18, g.y - 26], [g.peak + 44, g.y - 14], [g.peak + 78, g.y - 3], [g.peak + 98, g.y],
      ];
      const kdePath = `${smoothCurvePath(kdePts)} L ${f1(g.peak - 92)} ${g.y} Z`;
      const dots = g.pts.map((px, idx) => `<circle cx="${px}" cy="${f1(g.y + 15 + (idx % 3) * 3.8)}" r="2" fill="${g.color}" fill-opacity="0.72"/>`).join('');
      return txt(x0 - 5, g.y + 4, g.label, { size: 7.5, weight: 600, fill: ink.text, anchor: 'end' })
        + `<path d="${kdePath}" fill="${g.color}" fill-opacity="0.28" stroke="${g.color}" stroke-width="1.3"/>`
        + `<line x1="${g.box[0] - 28}" y1="${g.y + 7}" x2="${g.box[1] + 28}" y2="${g.y + 7}" stroke="${g.color}" stroke-width="1.1"/>`
        + `<rect x="${g.box[0]}" y="${g.y + 3}" width="${g.box[1] - g.box[0]}" height="8" rx="1.5" fill="${ink.surface}" stroke="${g.color}" stroke-width="1.3"/>`
        + `<line x1="${g.med}" y1="${g.y + 3}" x2="${g.med}" y2="${g.y + 11}" stroke="${g.color}" stroke-width="2.2"/>`
        + dots;
    }).join('');
    return {
      title: '不同城市能级采纳得分雨云分布图',
      badge: 'KW H=28.6 · p < 0.001',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '采纳意愿综合分 (1–5)' }, ink) + body,
    };
  },

  violin: (ink) => {
    const groups = [
      ['高中及下', 124, 154, 96, ink.muted],
      ['大专', 106, 140, 76, ink.secondary],
      ['本科', 86, 122, 56, ink.primary],
      ['硕博', 74, 108, 48, ink.accent4],
    ] as const;
    const x0 = 42, y0 = 44, x1 = 338, y1 = 192;
    const yTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}.0` }));
    const step = (x1 - x0) / groups.length;
    const xTicks = groups.map(([lbl], i) => ({ pos: x0 + (i + 0.5) * step, label: lbl }));
    const violins = groups.map(([, med, bot, top, c], i) => {
      const cx = xTicks[i].pos, w = 22;
      const d = `M ${f1(cx)} ${top} C ${f1(cx + w * 0.4)} ${top + 14}, ${f1(cx + w)} ${med - 10}, ${f1(cx + w * 0.85)} ${med} C ${f1(cx + w)} ${med + 12}, ${f1(cx + w * 0.3)} ${bot - 10}, ${f1(cx)} ${bot} C ${f1(cx - w * 0.3)} ${bot - 10}, ${f1(cx - w)} ${med + 12}, ${f1(cx - w * 0.85)} ${med} C ${f1(cx - w)} ${med - 10}, ${f1(cx - w * 0.4)} ${top + 14}, ${f1(cx)} ${top} Z`;
      return `<path d="${d}" fill="${c}" fill-opacity="0.28" stroke="${c}" stroke-width="1.4"/>`
        + `<rect x="${f1(cx - 4.5)}" y="${med - 12}" width="9" height="24" rx="1.5" fill="${ink.surface}" stroke="${c}" stroke-width="1.1"/>`
        + `<circle cx="${f1(cx)}" cy="${med}" r="2.6" fill="${c}"/>`;
    }).join('');
    return {
      title: '受访学历分组消费敏感度小提琴图',
      badge: 'ANOVA F=9.42*',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '量表均值' }, ink) + violins,
    };
  },

  box: (ink) => {
    const groups = [
      ['18–25岁', 142, 114, 96, 78, 60, [48, 166]],
      ['26–35岁', 152, 128, 108, 88, 64, [52]],
      ['36–45岁', 164, 138, 118, 98, 74, [56, 178]],
      ['46岁+', 174, 152, 134, 114, 86, [66]],
    ] as const;
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const yTicks = [0, 100, 200, 300, 400].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}` }));
    const step = (x1 - x0) / groups.length;
    const xTicks = groups.map(([lbl], i) => ({ pos: x0 + (i + 0.5) * step, label: lbl }));
    const boxes = groups.map(([, wLo, q1, med, q3, wHi, outs], i) => {
      const cx = xTicks[i].pos, c = i === 0 ? ink.primary : i === 1 ? ink.secondary : ink.cat[i % ink.cat.length];
      return `<line x1="${f1(cx)}" y1="${wHi}" x2="${f1(cx)}" y2="${wLo}" stroke="${c}" stroke-width="1.3"/>`
        + `<line x1="${f1(cx - 8)}" y1="${wHi}" x2="${f1(cx + 8)}" y2="${wHi}" stroke="${c}" stroke-width="1.2"/>`
        + `<line x1="${f1(cx - 8)}" y1="${wLo}" x2="${f1(cx + 8)}" y2="${wLo}" stroke="${c}" stroke-width="1.2"/>`
        + `<rect x="${f1(cx - 16)}" y="${q3}" width="32" height="${q1 - q3}" rx="2" fill="${lightenHex(c, 0.72)}" stroke="${c}" stroke-width="1.4"/>`
        + `<line x1="${f1(cx - 16)}" y1="${med}" x2="${f1(cx + 16)}" y2="${med}" stroke="${darkenHex(c, 0.2)}" stroke-width="2.4"/>`
        + outs.map(oy => `<circle cx="${f1(cx)}" cy="${oy}" r="2.6" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.2"/>`).join('');
    }).join('');
    return {
      title: '各年龄段作答时长 Tukey 箱线图',
      badge: '1.5×IQR · 离群 6例',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '作答时长 (秒)' }, ink)
        + `<line x1="${x0}" y1="168" x2="${x1}" y2="168" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2.5"/>`
        + txt(x1 - 4, 164, '极速清洗下限 90s', { size: 6.8, fill: ink.opposite, anchor: 'end' })
        + boxes,
    };
  },

  ridge: (ink) => {
    const layers = [
      ['2021 梯队', 82, 134],
      ['2022 梯队', 106, 158],
      ['2023 梯队', 130, 186],
      ['2024 梯队', 154, 218],
      ['2025 梯队', 178, 248],
    ] as const;
    const x0 = 66, y0 = 42, x1 = 336, y1 = 192;
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const ridges = layers.map(([lbl, yBase, peakX], i) => {
      const c = mixHex(ink.secondary, ink.primary, i / 4);
      const pts: [number, number][] = [
        [x0 + 4, yBase], [peakX - 58, yBase - 3], [peakX - 28, yBase - 22], [peakX, yBase - 32],
        [peakX + 26, yBase - 20], [peakX + 54, yBase - 3], [x1 - 4, yBase],
      ];
      return `<path d="${smoothCurvePath(pts)} L ${x0 + 4} ${yBase} Z" fill="${c}" fill-opacity="${f2(0.28 + i * 0.08)}" stroke="${c}" stroke-width="1.4"/>`
        + `<line x1="${peakX}" y1="${yBase}" x2="${peakX}" y2="${yBase - 30}" stroke="${darkenHex(c, 0.2)}" stroke-width="1" stroke-dasharray="2 2"/>`
        + txt(x0 - 5, yBase - 2, lbl, { size: 7.2, weight: 600, fill: ink.text, anchor: 'end' });
    }).join('');
    return {
      title: '多年度认知得分迁移山脊密度图',
      badge: 'Skew=-0.42 · 右移',
      body: axesFrame({ x0, y0, x1, y1, xTicks, hGrid: false, leftAxis: false, xTitle: '数字素养认知分值 (1–5)' }, ink) + ridges,
    };
  },

  hist_density: (ink) => {
    const counts = [8, 18, 42, 78, 112, 106, 68, 44, 22, 8];
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - (v / 120) * (y1 - y0);
    const yTicks = [0, 30, 60, 90, 120].map(v => ({ pos: yMap(v), label: `${v}` }));
    const xTicks = [0, 90, 180, 270, 360].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}s` }));
    const bw = (x1 - x0) / counts.length;
    const bars = counts.map((v, i) => {
      const top = yMap(v), x = x0 + i * bw;
      const rejected = i < 2;
      const c = rejected ? ink.opposite : ink.primary;
      return `<rect x="${f1(x + 1.5)}" y="${f1(top)}" width="${f1(bw - 3)}" height="${f1(y1 - top)}" fill="${c}" fill-opacity="${rejected ? 0.36 : 0.28}" stroke="${c}" stroke-width="1"/>`;
    }).join('');
    const kdePts: [number, number][] = counts.map((v, i) => [x0 + (i + 0.5) * bw, yMap(v * 0.96 + 4)]);
    const x90 = x0 + (90 / 360) * (x1 - x0);
    const xMean = x0 + (184 / 360) * (x1 - x0);
    return {
      title: '有效作答时长直方图与核密度曲线',
      badge: 'n=506 · 剔除34份',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '样本频数 (份)', xTitle: '单卷作答耗时 (秒)' }, ink)
        + `<rect x="${x0}" y="${y0}" width="${f1(x90 - x0)}" height="${y1 - y0}" fill="${ink.opposite}" fill-opacity="0.06"/>`
        + bars
        + `<path d="${smoothCurvePath(kdePts)}" stroke="${ink.secondary}" stroke-width="2"/>`
        + `<line x1="${f1(x90)}" y1="${y0}" x2="${f1(x90)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(x90 + 3, y0 + 10, '90s 剔除线', { size: 6.9, weight: 600, fill: ink.opposite })
        + `<line x1="${f1(xMean)}" y1="${y0}" x2="${f1(xMean)}" y2="${y1}" stroke="${ink.primary}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(xMean + 3, y0 + 20, '均值 184s', { size: 6.9, weight: 600, fill: ink.primary }),
    };
  },

  ecdf: (ink) => {
    const x0 = 44, y0 = 48, x1 = 338, y1 = 192;
    const yTicks = [0, 25, 50, 80, 100].map(v => ({ pos: y1 - (v / 100) * (y1 - y0), label: `${v}%` }));
    const xTicks = [0, 30, 60, 90, 120].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `¥${v}` }));
    const p1 = `M ${x0} ${y1} H 78 V 172 H 108 V 144 H 146 V 110 H 188 V 77 H 236 V 56 H 294 V 48 H ${x1}`;
    const p2 = `M ${x0} ${y1} H 92 V 176 H 134 V 154 H 176 V 124 H 218 V 92 H 264 V 66 H 312 V 50 H ${x1}`;
    const y80 = y1 - 0.8 * (y1 - y0);
    return {
      title: '支付意愿上限 ECDF 经验累积分布',
      badge: 'KS D=0.19 · p < 0.01',
      body: legendChips([{ label: '城区群体 (¥82@80%)', color: ink.primary, kind: 'line' }, { label: '县域群体 (¥104@80%)', color: ink.secondary, kind: 'line' }], 46, 41, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '累积占比 (%)', xTitle: '月度最高愿付价格 (元)' }, ink)
        + `<line x1="${x0}" y1="${f1(y80)}" x2="${x1}" y2="${f1(y80)}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + `<line x1="236" y1="${f1(y80)}" x2="236" y2="${y1}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="2.5 2.5"/>`
        + `<path d="${p2}" stroke="${ink.secondary}" stroke-width="1.8"/>`
        + `<path d="${p1}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<circle cx="236" cy="${f1(y80)}" r="3.6" fill="${ink.opposite}"/>`
        + txt(241, y80 - 4, '80% 拐点 ¥82', { size: 7, weight: 700, fill: ink.opposite }),
    };
  },

  beeswarm: (ink) => {
    const groups = [
      { label: '传统渠道', cx: 92, meanY: 132, color: ink.muted, dy: [-28, -22, -16, -11, -6, 0, 5, 10, 15, 22, 28, -14, -4, 7, 19], dx: [0, -7, 8, -12, 11, -5, 6, -10, 9, -4, 3, 14, -15, 13, -8] },
      { label: '社交裂变', cx: 190, meanY: 92, color: ink.secondary, dy: [-30, -24, -18, -12, -7, -2, 3, 8, 14, 21, 27, -15, -5, 6, 17], dx: [2, -9, 9, -13, 13, -6, 7, -12, 10, -5, 4, 16, -16, 14, -9] },
      { label: '官方直营', cx: 288, meanY: 74, color: ink.primary, dy: [-24, -18, -13, -8, -4, 0, 4, 9, 14, 20, 26, -11, -2, 7, 16], dx: [0, -8, 8, -14, 14, -6, 6, -11, 11, -4, 3, 17, -17, 13, -7] },
    ];
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const yTicks = [0, 25, 50, 75, 100].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}` }));
    const xTicks = groups.map(g => ({ pos: g.cx, label: g.label }));
    const pts = groups.map(g =>
      g.dy.map((dy, i) => `<circle cx="${f1(g.cx + g.dx[i])}" cy="${f1(g.meanY + dy)}" r="2.7" fill="${g.color}" fill-opacity="0.72" stroke="${ink.surface}" stroke-width="0.5"/>`).join('')
      + errV(g.cx, g.meanY - 18, g.meanY + 18, ink.text, 5)
      + `<line x1="${g.cx - 14}" y1="${g.meanY}" x2="${g.cx + 14}" y2="${g.meanY}" stroke="${ink.text}" stroke-width="2"/>`,
    ).join('');
    return {
      title: '三类触达渠道转化评分蜂群分布',
      badge: 'n=180 · 零点遮挡',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '推荐意愿 (0–100)' }, ink) + pts,
    };
  },

  qq_plot: (ink) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [-3, -1.5, 0, 1.5, 3].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [-3, -1.5, 0, 1.5, 3].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: String(v) }));
    const pts: [number, number][] = Array.from({ length: 24 }, (_, i) => {
      const t = (i + 0.5) / 24;
      const x = x0 + 18 + t * (x1 - x0 - 36);
      const yBase = y1 - 14 - t * (y1 - y0 - 28);
      const tailBend = (t < 0.15 ? (0.15 - t) * 42 : t > 0.85 ? -(t - 0.85) * 48 : ((i % 3) - 1) * 2.4);
      return [x, yBase + tailBend];
    });
    const envTop: [number, number][] = pts.map(([x], i) => {
      const t = i / (pts.length - 1);
      const yLine = y1 - 14 - t * (y1 - y0 - 28);
      const w = 7 + Math.abs(t - 0.5) * 22;
      return [x, yLine - w];
    });
    const envBot: [number, number][] = pts.map(([x], i) => {
      const t = i / (pts.length - 1);
      const yLine = y1 - 14 - t * (y1 - y0 - 28);
      const w = 7 + Math.abs(t - 0.5) * 22;
      return [x, yLine + w];
    });
    return {
      title: '残差正态性检验 Q-Q 分位图',
      badge: 'Shapiro-Wilk p=0.14',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, vGrid: true, box: true, yTitle: '样本分位数', xTitle: '理论正态分位数 N(0,1)' }, ink)
        + bandPolygon(envTop, envBot, ink.primary, 0.14)
        + `<line x1="${x0 + 14}" y1="${y1 - 12}" x2="${x1 - 14}" y2="${y0 + 12}" stroke="${ink.opposite}" stroke-width="1.6" stroke-dasharray="4 2.5"/>`
        + pts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.7" fill="${ink.primary}" fill-opacity="0.82"/>`).join('')
        + pill(56, 52, '95% 置信带内贴合良好', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 7.1, h: 14 }),
    };
  },

  gmm_bimodal: (ink) => {
    const x0 = 44, y0 = 46, x1 = 338, y1 = 192;
    const yTicks = [0, 0.2, 0.4, 0.6].map((v, i) => ({ pos: y1 - (i / 3) * (y1 - y0), label: v.toFixed(1) }));
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const xs = Array.from({ length: 36 }, (_, i) => x0 + (i / 35) * (x1 - x0));
    const g1 = (x: number) => Math.exp(-(((x - 134) / 36) ** 2)) * 84;
    const g2 = (x: number) => Math.exp(-(((x - 256) / 34) ** 2)) * 108;
    const c1Pts: [number, number][] = xs.map(x => [x, y1 - g1(x)]);
    const c2Pts: [number, number][] = xs.map(x => [x, y1 - g2(x)]);
    const mixPts: [number, number][] = xs.map(x => [x, y1 - (g1(x) + g2(x) * 0.94)]);
    const bars = Array.from({ length: 14 }, (_, i) => {
      const bx = x0 + i * ((x1 - x0) / 14);
      const xm = bx + (x1 - x0) / 28;
      const bh = g1(xm) + g2(xm) * 0.9;
      return `<rect x="${f1(bx + 1)}" y="${f1(y1 - bh)}" width="${f1((x1 - x0) / 14 - 2)}" height="${f1(bh)}" fill="${ink.lightMuted}" fill-opacity="0.22"/>`;
    }).join('');
    const xCut = 196;
    return {
      title: '消费频率高斯混合双峰拟合 (GMM)',
      badge: '2成分 · BIC最优',
      body: legendChips([
        { label: '保守型 μ1=2.4', color: ink.secondary, kind: 'dash' },
        { label: '活跃型 μ2=4.1', color: ink.primary, kind: 'dash' },
        { label: '混合包络', color: ink.opposite, kind: 'line' },
      ], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '概率密度', xTitle: '综合评分 (1–5)' }, ink)
        + bars
        + `<path d="${smoothCurvePath(c1Pts)}" stroke="${ink.secondary}" stroke-width="1.4" stroke-dasharray="3.5 2.5"/>`
        + `<path d="${smoothCurvePath(c2Pts)}" stroke="${ink.primary}" stroke-width="1.4" stroke-dasharray="3.5 2.5"/>`
        + `<path d="${smoothCurvePath(mixPts)}" stroke="${ink.opposite}" stroke-width="2"/>`
        + `<line x1="${xCut}" y1="${y0}" x2="${xCut}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="2.5 2.5"/>`
        + txt(xCut, y0 + 10, '分群阈值 x*=3.28', { size: 6.9, weight: 600, fill: ink.text, anchor: 'middle' }),
    };
  },

  se_band_dot: (ink) => {
    const x0 = 46, y0 = 46, x1 = 336, y1 = 192;
    const labels = ['第1周', '第2周', '第3周', '第4周', '第5周', '第6周'];
    const means = [3.08, 3.26, 3.54, 3.82, 3.96, 4.14];
    const ses = [0.18, 0.16, 0.14, 0.12, 0.13, 0.15];
    const yMap = (v: number) => y1 - ((v - 2.5) / 2.2) * (y1 - y0);
    const yTicks = [2.5, 3.0, 3.5, 4.0, 4.5].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xTicks = evenlySpacedTicks(x0 + 20, x1 - 20, labels);
    const topPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(means[i] + ses[i] * 1.96)]);
    const botPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(means[i] - ses[i] * 1.96)]);
    const midPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(means[i])]);
    const pts = xTicks.map((t, i) =>
      errV(t.pos, topPts[i][1], botPts[i][1], ink.primary, 4)
      + `<circle cx="${f1(t.pos)}" cy="${f1(midPts[i][1])}" r="4.2" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="1.2"/>`
      + txt(t.pos, topPts[i][1] - 4, means[i].toFixed(2), { size: 7, weight: 600, fill: ink.primary, anchor: 'middle' }),
    ).join('');
    return {
      title: '多期追踪均值与 ±1.96SE 带状点须图',
      badge: '95% CI 连续带',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '均值 ± 95%CI' }, ink)
        + bandPolygon(topPts, botPts, ink.primary, 0.18)
        + `<polyline points="${polyStr(midPts)}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + pts,
    };
  },

  radar_ridge_hybrid: (ink) => {
    const cx = 148, cy = 124, maxR = 72;
    const axes = ['效能感', '信任度', '经济性', '推荐意', '习惯性', '风控感'];
    const rings = [1, 2, 3, 4, 5].map(v => {
      const r = (v / 5) * maxR;
      const pts = axes.map((_, i) => polarXY(cx, cy, r, i * 60));
      return `<polygon points="${polyStr(pts)}" stroke="${ink.grid}" stroke-width="0.8"/>`;
    }).join('');
    const spokes = axes.map((lbl, i) => {
      const [px, py] = polarXY(cx, cy, maxR, i * 60);
      const [lx, ly] = polarXY(cx, cy, maxR + 14, i * 60);
      const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
      return `<line x1="${cx}" y1="${cy}" x2="${f1(px)}" y2="${f1(py)}" stroke="${ink.grid}" stroke-width="0.8"/>`
        + txt(lx, ly + 2.5, lbl, { size: 7.2, weight: 600, fill: ink.text, anchor });
    }).join('');
    const envs = [
      { label: 'P90 高包络', color: ink.primary, vals: [4.6, 4.4, 3.8, 4.5, 4.1, 3.6], dash: '' },
      { label: 'P50 中位核', color: ink.secondary, vals: [3.6, 3.5, 3.2, 3.4, 3.1, 3.0], dash: '' },
      { label: 'P10 低包络', color: ink.opposite, vals: [2.3, 2.2, 2.7, 2.0, 2.1, 2.4], dash: '3 2' },
    ];
    const polys = envs.map(e => {
      const pts = e.vals.map((v, i) => polarXY(cx, cy, (v / 5) * maxR, i * 60));
      return `<polygon points="${polyStr(pts)}" fill="${e.color}" fill-opacity="0.14" stroke="${e.color}" stroke-width="1.6"${e.dash ? ` stroke-dasharray="${e.dash}"` : ''}/>`;
    }).join('');
    return {
      title: '多维分位数密度包络极坐标图',
      badge: 'P10–P50–P90 包络',
      body: rings + spokes + polys
        + legendChips(envs.map(e => ({ label: e.label, color: e.color, kind: e.dash ? 'dash' : 'box' })), 244, 62, ink)
        + txt(244, 82, '环距表示分位数离散', { size: 7, fill: ink.muted }),
    };
  },

  split_violin: (ink) => {
    const cats = ['维度一 · 易用', '维度二 · 信任', '维度三 · 价值'];
    const x0 = 44, y0 = 48, x1 = 338, y1 = 192;
    const yTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}.0` }));
    const step = (x1 - x0) / cats.length;
    const xTicks = cats.map((label, i) => ({ pos: x0 + (i + 0.5) * step, label }));
    const shapes = [
      { lMed: 132, rMed: 96, stars: '***' },
      { lMed: 124, rMed: 88, stars: '***' },
      { lMed: 118, rMed: 108, stars: 'n.s.' },
    ];
    const halves = shapes.map((s, i) => {
      const cx = xTicks[i].pos, w = 26;
      const dL = `M ${f1(cx)} ${s.lMed - 44} C ${f1(cx - w * 0.5)} ${s.lMed - 30}, ${f1(cx - w)} ${s.lMed - 10}, ${f1(cx - w * 0.9)} ${s.lMed} C ${f1(cx - w)} ${s.lMed + 12}, ${f1(cx - w * 0.4)} ${s.lMed + 30}, ${f1(cx)} ${s.lMed + 42} Z`;
      const dR = `M ${f1(cx)} ${s.rMed - 42} C ${f1(cx + w * 0.5)} ${s.rMed - 28}, ${f1(cx + w)} ${s.rMed - 10}, ${f1(cx + w * 0.9)} ${s.rMed} C ${f1(cx + w)} ${s.rMed + 12}, ${f1(cx + w * 0.4)} ${s.rMed + 28}, ${f1(cx)} ${s.rMed + 40} Z`;
      return `<path d="${dL}" fill="${ink.secondary}" fill-opacity="0.34" stroke="${ink.secondary}" stroke-width="1.3"/>`
        + `<path d="${dR}" fill="${ink.primary}" fill-opacity="0.38" stroke="${ink.primary}" stroke-width="1.3"/>`
        + `<line x1="${f1(cx - 12)}" y1="${s.lMed}" x2="${f1(cx)}" y2="${s.lMed}" stroke="${darkenHex(ink.secondary, 0.25)}" stroke-width="2"/>`
        + `<line x1="${f1(cx)}" y1="${s.rMed}" x2="${f1(cx + 12)}" y2="${s.rMed}" stroke="${darkenHex(ink.primary, 0.25)}" stroke-width="2"/>`
        + txt(cx, Math.min(s.lMed, s.rMed) - 46, s.stars, { size: 7.4, weight: 700, fill: s.stars === 'n.s.' ? ink.muted : ink.opposite, anchor: 'middle' });
    }).join('');
    return {
      title: '对照组 vs 实验组镜像半小提琴图',
      badge: 'Welch t · 镜像分布',
      body: legendChips([{ label: '对照组 (左)', color: ink.secondary, kind: 'box' }, { label: '采纳组 (右)', color: ink.primary, kind: 'box' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '得分 (1–5)' }, ink)
        + halves,
    };
  },

  cvar_tail_loss: (ink) => {
    const x0 = 46, y0 = 46, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + ((v + 20) / 36) * (x1 - x0);
    const yMap = (d: number) => y1 - (d / 0.09) * (y1 - y0);
    const xTicks = [-20, -12, -4, 0, 8, 16].map(v => ({ pos: xMap(v), label: v > 0 ? `+${v}%` : `${v}%` }));
    const yTicks = [0, 0.03, 0.06, 0.09].map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const pdf = (v: number) => 0.068 * Math.exp(-0.5 * ((v - 2.6) / 4.2) ** 2) + 0.021 * Math.exp(-0.5 * ((v + 5.6) / 5.4) ** 2);
    const allVs = Array.from({ length: 58 }, (_, i) => -19.5 + (i / 57) * 35.0);
    const allPts: [number, number][] = allVs.map(v => [xMap(v), yMap(pdf(v))]);
    const xVar = xMap(-8.4), xCvar = xMap(-12.6), xZero = xMap(0);
    const tailVs = allVs.filter(v => v <= -8.4).concat([-8.4]);
    const bodyVs = [-8.4].concat(allVs.filter(v => v >= -8.4));
    const tailPoly: [number, number][] = [[xMap(tailVs[0]), y1], ...tailVs.map(v => [xMap(v), yMap(pdf(v))] as [number, number]), [xVar, y1]];
    const bodyPoly: [number, number][] = [[xVar, y1], ...bodyVs.map(v => [xMap(v), yMap(pdf(v))] as [number, number]), [xMap(bodyVs[bodyVs.length - 1]), y1]];
    return {
      title: 'VaR 95% 与 CVaR 条件尾部风险密度图',
      badge: 'VaR95=-8.4% · CVaR=-12.6%',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '概率密度 f(r)', xTitle: '投资/运营损益分布区间 (%)' }, ink)
        + `<polygon points="${polyStr(bodyPoly)}" fill="${ink.primary}" fill-opacity="0.2"/>`
        + `<polygon points="${polyStr(tailPoly)}" fill="${ink.opposite}" fill-opacity="0.45"/>`
        + `<path d="${smoothCurvePath(allPts)}" stroke="${ink.primary}" stroke-width="2"/>`
        + `<line x1="${f1(xZero)}" y1="${y0}" x2="${f1(xZero)}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(xVar)}" y1="${y0}" x2="${f1(xVar)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.4" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xCvar)}" y1="${y0 + 16}" x2="${f1(xCvar)}" y2="${y1}" stroke="${darkenHex(ink.opposite, 0.25)}" stroke-width="1.5"/>`
        + txt(xVar + 4, 86, 'VaR95 = -8.4%', { size: 7.1, weight: 700, fill: ink.opposite })
        + txt(xCvar - 3, 76, 'CVaR = -12.6%', { size: 7.1, weight: 700, fill: darkenHex(ink.opposite, 0.25), anchor: 'end' })
        + txt(xZero - 4, y0 + 10, '盈亏平衡 0%', { size: 6.7, fill: ink.muted, anchor: 'end' })
        + pill(334, 50, 'ES = E[R | R ≤ VaR95]', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.9, h: 14, align: 'right' }),
    };
  },

  lorenz_gini: (ink) => {
    const x0 = 48, y0 = 46, x1 = 334, y1 = 192;
    const xMap = (p: number) => x0 + p * (x1 - x0);
    const yMap = (l: number) => y1 - l * (y1 - y0);
    const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map(v => ({ pos: xMap(v), label: `${Math.round(v * 100)}%` }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(v => ({ pos: yMap(v), label: `${Math.round(v * 100)}%` }));
    const ps = Array.from({ length: 21 }, (_, i) => i / 20);
    const eqPts: [number, number][] = ps.map(p => [xMap(p), yMap(p)]);
    const lPre: [number, number][] = ps.map(p => [xMap(p), yMap(Math.pow(p, 2.04))]);
    const lPost: [number, number][] = ps.map(p => [xMap(p), yMap(Math.pow(p, 1.66))]);
    const p60 = xMap(0.6), y60Pre = yMap(Math.pow(0.6, 2.04)), y60Post = yMap(Math.pow(0.6, 1.66));
    return {
      title: '洛伦兹曲线与基尼系数资源均衡测度',
      badge: 'Gini=0.342 → 0.248',
      body: legendChips([{ label: '绝对均等线', color: ink.axis, kind: 'dash' }, { label: '优化后 (0.248)', color: ink.primary, kind: 'line' }, { label: '基线期 (0.342)', color: ink.opposite, kind: 'dash' }], 48, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, vGrid: true, yTitle: '资源累计份额 L(p)', xTitle: '受访群体累计人口占比 p' }, ink)
        + bandPolygon(eqPts, lPre, ink.opposite, 0.14)
        + bandPolygon(eqPts, lPost, ink.primary, 0.16)
        + `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y0}" stroke="${ink.axis}" stroke-width="1.2" stroke-dasharray="4 2.5"/>`
        + `<path d="${smoothCurvePath(lPre)}" stroke="${ink.opposite}" stroke-width="1.8" stroke-dasharray="4 2"/>`
        + `<path d="${smoothCurvePath(lPost)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<line x1="${f1(p60)}" y1="${f1(y60Post)}" x2="${f1(p60)}" y2="${f1(y60Pre)}" stroke="${ink.secondary}" stroke-width="1.3"/>`
        + `<circle cx="${f1(p60)}" cy="${f1(y60Post)}" r="3" fill="${ink.primary}"/><circle cx="${f1(p60)}" cy="${f1(y60Pre)}" r="3" fill="${ink.opposite}"/>`
        + txt(176, 108, '不均等面积 A', { size: 7.2, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + txt(284, 168, '面积 B', { size: 7.2, weight: 600, fill: ink.primary, anchor: 'middle' })
        + pill(56, 54, 'G = A/(A+B) = 1 - 2∫L(p)dp', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.9, h: 14 }),
    };
  },

  kaplan_competing_risk: (ink) => {
    const x0 = 54, y0 = 48, x1 = 336, y1 = 154;
    const xMap = (m: number) => x0 + (m / 36) * (x1 - x0);
    const yMap = (p: number) => y1 - (p / 0.8) * (y1 - y0);
    const xTicks = [0, 6, 12, 18, 24, 30, 36].map(m => ({ pos: xMap(m), label: `${m}月` }));
    const yTicks = [0, 0.2, 0.4, 0.6, 0.8].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const stepPath = (pts: readonly [number, number][]) => {
      let d = `M ${f1(xMap(pts[0][0]))} ${f1(yMap(pts[0][1]))}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` H ${f1(xMap(pts[i][0]))} V ${f1(yMap(pts[i][1]))}`;
      }
      return d;
    };
    const naiveKm: [number, number][] = [[0, 0], [6, 0.14], [12, 0.28], [18, 0.41], [24, 0.52], [30, 0.60], [36, 0.66]];
    const cif1: [number, number][] = [[0, 0], [6, 0.09], [12, 0.19], [18, 0.28], [24, 0.36], [30, 0.43], [36, 0.48]];
    const cif2: [number, number][] = [[0, 0], [6, 0.04], [12, 0.09], [18, 0.14], [24, 0.18], [30, 0.21], [36, 0.24]];
    const kmPts: [number, number][] = naiveKm.map(([m, p]) => [xMap(m), yMap(p)]);
    const c1Pts: [number, number][] = cif1.map(([m, p]) => [xMap(m), yMap(p)]);
    const riskCols = [
      { m: 0, risk: '420', ev: '0' },
      { m: 6, risk: '364', ev: '36' },
      { m: 12, risk: '316', ev: '68' },
      { m: 18, risk: '265', ev: '98' },
      { m: 24, risk: '218', ev: '124' },
      { m: 30, risk: '176', ev: '144' },
      { m: 36, risk: '142', ev: '158' },
    ];
    return {
      title: '竞争风险 Fine-Gray 累积发病率 CIF',
      badge: 'sHR=1.64 · Gray p=0.003',
      body: legendChips([
        { label: 'Fine-Gray CIF1', color: ink.primary, kind: 'line' },
        { label: '错误 1-KM 上偏', color: ink.opposite, kind: 'dash' },
        { label: '竞争事件 CIF2', color: ink.secondary, kind: 'line' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '累积发病率 CIF(t)' }, ink)
        + bandPolygon(kmPts, c1Pts, ink.opposite, 0.14)
        + `<path d="${stepPath(naiveKm)}" stroke="${ink.opposite}" stroke-width="1.6" stroke-dasharray="4 2"/>`
        + `<path d="${stepPath(cif2)}" stroke="${ink.secondary}" stroke-width="1.8"/>`
        + `<path d="${stepPath(cif1)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + txt(x1 - 4, yMap(0.66) - 4, '朴素 1-KM 66% (高估)', { size: 6.5, weight: 700, fill: ink.opposite, anchor: 'end' })
        + txt(x1 - 4, yMap(0.48) - 4, 'Fine-Gray CIF1 48%', { size: 6.5, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x1 - 4, yMap(0.24) - 4, '竞争事件 CIF2 24%', { size: 6.5, weight: 600, fill: ink.secondary, anchor: 'end' })
        + `<line x1="16" y1="171" x2="338" y2="171" stroke="${ink.grid}" stroke-width="0.8"/>`
        + txt(42, 183, '在险 n', { size: 6.6, weight: 700, fill: ink.axis, anchor: 'end' })
        + txt(42, 196, '事件 1', { size: 6.6, weight: 600, fill: ink.primary, anchor: 'end' })
        + riskCols.map(c =>
          txt(xMap(c.m), 183, c.risk, { size: 6.6, fill: ink.text, anchor: 'middle' })
          + txt(xMap(c.m), 196, c.ev, { size: 6.6, fill: ink.primary, anchor: 'middle' }),
        ).join('')
        + txt((x0 + x1) / 2, 214, '随访观察月数 t (同步对齐在险人数与累计事件表)', { size: 7.1, weight: 600, fill: ink.axis, anchor: 'middle' }),
    };
  },

  order_book_depth: (ink) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (p: number) => x0 + ((p - 99.4) / 1.2) * (x1 - x0);
    const yMap = (d: number) => y1 - (d / 120) * (y1 - y0);
    const xTicks = [99.4, 99.7, 100.0, 100.3, 100.6].map(p => ({ pos: xMap(p), label: p.toFixed(1) }));
    const yTicks = [0, 30, 60, 90, 120].map(v => ({ pos: yMap(v), label: String(v) }));
    const bids: [number, number][] = [
      [99.99, 0], [99.99, 12], [99.95, 12], [99.95, 24], [99.90, 24], [99.90, 39],
      [99.83, 39], [99.83, 54], [99.72, 54], [99.72, 82], [99.60, 82], [99.60, 98], [99.48, 98], [99.48, 114], [99.40, 114],
    ];
    const asks: [number, number][] = [
      [100.01, 0], [100.01, 9], [100.05, 9], [100.05, 19], [100.12, 19], [100.12, 31],
      [100.20, 31], [100.20, 46], [100.32, 46], [100.32, 74], [100.44, 74], [100.44, 88], [100.56, 88], [100.56, 96], [100.60, 96],
    ];
    const bidPts: [number, number][] = bids.map(([p, d]) => [xMap(p), yMap(d)]);
    const askPts: [number, number][] = asks.map(([p, d]) => [xMap(p), yMap(d)]);
    const bidPoly: [number, number][] = [[xMap(99.99), y1], ...bidPts, [xMap(99.40), y1]];
    const askPoly: [number, number][] = [[xMap(100.01), y1], ...askPts, [xMap(100.60), y1]];
    const ticksBar: [number, number, string][] = [
      [99.95, 12, ink.primary], [99.90, 15, ink.primary], [99.83, 15, ink.primary], [99.72, 28, ink.primary], [99.60, 16, ink.primary],
      [100.05, 10, ink.opposite], [100.12, 12, ink.opposite], [100.20, 15, ink.opposite], [100.32, 28, ink.opposite], [100.44, 14, ink.opposite],
    ];
    return {
      title: '限价订单簿深度与微结构冲击',
      badge: 'Spread=2bps · OBI=+0.24',
      body: legendChips([
        { label: '买盘累计 Bid', color: ink.primary, kind: 'box' },
        { label: '卖盘累计 Ask', color: ink.opposite, kind: 'box' },
        { label: '中间价 Mid=100.00', color: ink.axis, kind: 'dash' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '累计挂单深度 (万元)', xTitle: '限价挂单报价档位 (Price)' }, ink)
        + `<rect x="${f1(xMap(99.99))}" y="${y0}" width="${f1(xMap(100.01) - xMap(99.99))}" height="${y1 - y0}" fill="${ink.secondary}" fill-opacity="0.16"/>`
        + `<polygon points="${polyStr(bidPoly)}" fill="${ink.primary}" fill-opacity="0.24"/>`
        + `<polygon points="${polyStr(askPoly)}" fill="${ink.opposite}" fill-opacity="0.24"/>`
        + `<polyline points="${polyStr(bidPts)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + `<polyline points="${polyStr(askPts)}" stroke="${ink.opposite}" stroke-width="2.0"/>`
        + ticksBar.map(([p, sz, col]) => {
          const bh = (sz / 120) * (y1 - y0);
          return `<rect x="${f1(xMap(p) - 2)}" y="${f1(y1 - bh)}" width="4" height="${f1(bh)}" fill="${col}" fill-opacity="0.65"/>`;
        }).join('')
        + `<line x1="${f1(xMap(100.0))}" y1="${y0}" x2="${f1(xMap(100.0))}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + pill(xMap(100.0), 56, '盘口失衡 OBI=+0.24 · 滑点+3.8bps', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.4, h: 14, align: 'center' })
        + txt(xMap(99.72), yMap(82) - 5, '支撑墙 99.72', { size: 6.4, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(xMap(100.32), yMap(74) - 5, '阻力墙 100.32', { size: 6.4, weight: 700, fill: ink.opposite, anchor: 'middle' }),
    };
  },

  bootstrap_bca_dist: (ink: ResolvedInk) => {
    const x0 = 68, x1 = 336, ty0 = 46, ty1 = 142, by0 = 150, by1 = 192;
    const xMap = (v: number) => x0 + ((v + 0.06) / 0.62) * (x1 - x0);
    const xTicks = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const tyTicks = [0, 2, 4].map((v, i) => ({ pos: ty1 - (i / 2) * (ty1 - ty0), label: `${v}` }));
    const bins = [2, 6, 14, 28, 48, 70, 86, 84, 72, 58, 44, 32, 22, 14, 9, 5, 3, 2];
    const bLo = -0.02, bHi = 0.52, bw = (bHi - bLo) / bins.length;
    const bcaLo = 0.118, bcaHi = 0.394, thetaHat = 0.232;
    const barsSvg = bins.map((h, i) => {
      const vc = bLo + (i + 0.5) * bw;
      const bx0 = xMap(bLo + i * bw), bx1 = xMap(bLo + (i + 1) * bw);
      const inBca = vc >= bcaLo && vc <= bcaHi;
      const bh = (h / 92) * (ty1 - ty0);
      return `<rect x="${f1(bx0 + 0.6)}" y="${f1(ty1 - bh)}" width="${f1(Math.max(2, bx1 - bx0 - 1.2))}" height="${f1(bh)}" rx="1" fill="${inBca ? ink.primary : ink.lightMuted}" fill-opacity="${inBca ? 0.48 : 0.34}" stroke="${inBca ? ink.primary : ink.muted}" stroke-width="0.6"/>`;
    }).join('');
    const kdePts: [number, number][] = bins.map((h, i) => [xMap(bLo + (i + 0.5) * bw), ty1 - (h / 92) * (ty1 - ty0) - 2]);
    const ciRows = [
      { lbl: 'BCa 95%', lo: 0.118, hi: 0.394, col: ink.primary, y: 158, dash: '' },
      { lbl: '百分位法', lo: 0.096, hi: 0.358, col: ink.secondary, y: 171, dash: '4 2' },
      { lbl: '正态对称', lo: 0.072, hi: 0.392, col: ink.opposite, y: 184, dash: '2 2' },
    ];
    const ciSvg = ciRows.map(r => {
      const xl = xMap(r.lo), xr = xMap(r.hi), xm = xMap(thetaHat);
      return txt(x0 - 5, r.y + 2.5, r.lbl, { size: 6.7, weight: 700, fill: r.col, anchor: 'end' })
        + `<line x1="${f1(xl)}" y1="${r.y}" x2="${f1(xr)}" y2="${r.y}" stroke="${r.col}" stroke-width="1.8"${r.dash ? ` stroke-dasharray="${r.dash}"` : ''}/>`
        + `<line x1="${f1(xl)}" y1="${r.y - 3}" x2="${f1(xl)}" y2="${r.y + 3}" stroke="${r.col}" stroke-width="1.4"/>`
        + `<line x1="${f1(xr)}" y1="${r.y - 3}" x2="${f1(xr)}" y2="${r.y + 3}" stroke="${r.col}" stroke-width="1.4"/>`
        + `<circle cx="${f1(xm)}" cy="${r.y}" r="2.6" fill="${r.col}"/>`
        + txt(xr + 4, r.y + 2.4, `[${r.lo.toFixed(2)}, ${r.hi.toFixed(2)}]`, { size: 6.1, fill: r.col });
    }).join('');
    return {
      title: 'Bootstrap BCa 非对称置信区间分布',
      badge: 'B=5000 · z0=-0.14 · a=0.07',
      body: legendChips([
        { label: 'BCa 95% 区间 [0.12, 0.39]', color: ink.primary, kind: 'box' },
        { label: '右偏 KDE 包络', color: ink.secondary, kind: 'line' },
        { label: '零假设基准', color: ink.opposite, kind: 'dash' },
      ], 46, 38, ink)
        + axesFrame({ x0, y0: ty0, x1, y1: ty1, yTicks: tyTicks, xTicks: [], box: true, yTitle: '核密度' }, ink)
        + axesFrame({ x0, y0: by0, x1, y1: by1, xTicks, hGrid: false, box: true, xTitle: '自助重抽样统计量估值 θ* (偏态纠正对比)' }, ink)
        + barsSvg
        + `<path d="${smoothCurvePath(kdePts)}" stroke="${ink.secondary}" stroke-width="1.8"/>`
        + `<line x1="${f1(xMap(0))}" y1="${ty0}" x2="${f1(xMap(0))}" y2="${by1}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xMap(thetaHat))}" y1="${ty0}" x2="${f1(xMap(thetaHat))}" y2="${by1}" stroke="${ink.axis}" stroke-width="1.0" stroke-dasharray="2.5 2"/>`
        + txt(xMap(thetaHat) + 4, ty0 + 10, 'θ_hat=0.232', { size: 6.5, weight: 700, fill: ink.text })
        + pill(x1 - 5, ty0 + 6, '右偏修正: BCa 下界上移 +0.046', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.1, h: 13, align: 'right' })
        + ciSvg,
    };
  },

  // =========================================================================
  // 3. RELATIONSHIP & SURFACE (看关系与曲面) - 18 types
  // =========================================================================
  scatter_ci: (ink) => {
    const x0 = 46, y0 = 44, x1 = 338, y1 = 192;
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const yTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}.0` }));
    const pts: [number, number][] = [
      [68, 172], [82, 166], [96, 154], [108, 162], [122, 142], [134, 148], [148, 134], [160, 128],
      [172, 136], [186, 118], [198, 112], [212, 102], [224, 114], [238, 96], [250, 90], [262, 82],
      [274, 88], [286, 74], [298, 68], [314, 62], [142, 124], [204, 124], [268, 76], [116, 152],
    ];
    const xs = [60, 120, 180, 240, 300, 324];
    const lineY = (x: number) => 176 - ((x - 60) / 264) * 116;
    const hw = (x: number) => 7 + (((x - 192) / 140) ** 2) * 11;
    const topB: [number, number][] = xs.map(x => [x, lineY(x) - hw(x)]);
    const botB: [number, number][] = xs.map(x => [x, lineY(x) + hw(x)]);
    return {
      title: '制度信任与采纳意愿线性拟合与 95%CI',
      badge: 'r=0.724 · R²=0.524',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '采纳意愿 Y', xTitle: '系统信任度 X' }, ink)
        + bandPolygon(topB, botB, ink.primary, 0.18)
        + `<line x1="60" y1="${f1(lineY(60))}" x2="324" y2="${f1(lineY(324))}" stroke="${ink.primary}" stroke-width="2"/>`
        + pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.1" fill="${ink.secondary}" fill-opacity="0.72" stroke="${ink.surface}" stroke-width="0.6"/>`).join('')
        + pill(56, 52, 'y = 0.64x + 1.28 · p < 0.001', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 7.2, h: 15 }),
    };
  },

  marginal_scatter: (ink) => {
    const x0 = 46, y0 = 72, x1 = 286, y1 = 192;
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const yTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}.0` }));
    const topHist = [6, 14, 24, 34, 42, 48, 38, 26, 16, 8];
    const rightHist = [8, 16, 28, 38, 44, 32, 20, 10];
    const bw = (x1 - x0) / topHist.length;
    const topBars = topHist.map((v, i) => `<rect x="${f1(x0 + i * bw + 1)}" y="${f1(68 - v * 0.52)}" width="${f1(bw - 2)}" height="${f1(v * 0.52)}" fill="${ink.primary}" fill-opacity="0.34" stroke="${ink.primary}" stroke-width="0.7"/>`).join('');
    const bh = (y1 - y0) / rightHist.length;
    const rightBars = rightHist.map((v, i) => `<rect x="290" y="${f1(y0 + i * bh + 1)}" width="${f1(v * 0.9)}" height="${f1(bh - 2)}" fill="${ink.secondary}" fill-opacity="0.34" stroke="${ink.secondary}" stroke-width="0.7"/>`).join('');
    const pts: [number, number, string][] = [
      [74, 172, ink.secondary], [98, 162, ink.secondary], [118, 152, ink.secondary], [132, 148, ink.secondary],
      [152, 138, ink.primary], [166, 128, ink.primary], [182, 122, ink.primary], [198, 112, ink.primary],
      [212, 104, ink.primary], [228, 96, ink.primary], [244, 90, ink.primary], [260, 84, ink.primary],
      [142, 156, ink.secondary], [176, 134, ink.primary], [206, 118, ink.primary], [236, 102, ink.primary],
    ];
    return {
      title: '信任度与意愿边际联合分布散点图',
      badge: 'Pearson r=0.68***',
      body: topBars + rightBars
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '采纳意愿', xTitle: '感知信任度' }, ink)
        + `<line x1="64" y1="176" x2="270" y2="80" stroke="${ink.primary}" stroke-width="1.6" stroke-dasharray="3.5 2"/>`
        + pts.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${c}" fill-opacity="0.78"/>`).join(''),
    };
  },

  corr_heatmap: (ink) => {
    const vars = ['感知有用', '易用性', '信任度', '风险感', '采纳意'];
    const mat = [
      [1.0, 0.58, 0.64, -0.32, 0.71],
      [0.58, 1.0, 0.52, -0.28, 0.56],
      [0.64, 0.52, 1.0, -0.44, 0.68],
      [-0.32, -0.28, -0.44, 1.0, -0.49],
      [0.71, 0.56, 0.68, -0.49, 1.0],
    ];
    const x0 = 68, y0 = 40, cellW = 42, cellH = 29;
    let cells = '';
    for (let r = 0; r < 5; r++) {
      cells += txt(x0 - 6, y0 + r * cellH + cellH / 2 + 2.5, vars[r], { size: 7.2, weight: 600, fill: ink.text, anchor: 'end' });
      cells += txt(x0 + r * cellW + cellW / 2, y0 + 5 * cellH + 11, vars[r], { size: 7, weight: 600, fill: ink.text, anchor: 'middle' });
      for (let c = 0; c < 5; c++) {
        const v = mat[r][c], cx = x0 + c * cellW, cy = y0 + r * cellH;
        const base = v >= 0 ? ink.primary : ink.opposite;
        if (r === c) {
          cells += `<rect x="${cx}" y="${cy}" width="${cellW - 2}" height="${cellH - 2}" rx="2.5" fill="${ink.grid}"/>`
            + txt(cx + (cellW - 2) / 2, cy + (cellH - 2) / 2 + 2.5, '1.00', { size: 7, weight: 700, fill: ink.axis, anchor: 'middle' });
        } else if (r > c) {
          const op = Math.min(0.85, Math.abs(v) * 0.9);
          const tc = op > 0.55 ? '#FFFFFF' : ink.text;
          cells += `<rect x="${cx}" y="${cy}" width="${cellW - 2}" height="${cellH - 2}" rx="2.5" fill="${base}" fill-opacity="${f2(op)}"/>`
            + txt(cx + (cellW - 2) / 2, cy + (cellH - 2) / 2 + 2.5, `${v.toFixed(2)}**`, { size: 6.7, weight: 700, fill: tc, anchor: 'middle' });
        } else {
          const rad = 3 + Math.abs(v) * 8.5;
          cells += `<rect x="${cx}" y="${cy}" width="${cellW - 2}" height="${cellH - 2}" rx="2.5" fill="${ink.surface}" stroke="${ink.grid}" stroke-width="0.7"/>`
            + `<circle cx="${f1(cx + (cellW - 2) / 2)}" cy="${f1(cy + (cellH - 2) / 2)}" r="${f1(rad)}" fill="${base}" fill-opacity="0.78"/>`;
        }
      }
    }
    const barColors = [ink.primary, lightenHex(ink.primary, 0.35), lightenHex(ink.primary, 0.7), '#F1F5F9', lightenHex(ink.opposite, 0.6), ink.opposite];
    return {
      title: '五大核心构念相关矩阵与气泡阵',
      badge: 'Pearson r · p < 0.01',
      body: cells + colorbarV(296, 46, 10, 128, barColors, '-1.0', '+1.0', 'r 值', ink),
    };
  },

  relief_heatmap_3d: (ink) => {
    const xCols = ['¥19', '¥29', '¥39', '¥49', '¥59', '¥69'];
    const yRows = ['基础版', '标准版', '进阶版', '尊享版', '旗舰版'];
    const zVals = [
      [1.8, 2.2, 2.5, 2.1, 1.7, 1.4],
      [2.4, 3.1, 3.5, 2.9, 2.3, 1.8],
      [2.9, 3.8, 4.4, 3.9, 3.1, 2.4],
      [2.6, 3.5, 4.6, 4.3, 3.6, 2.8],
      [2.1, 2.8, 3.9, 4.1, 3.5, 2.7],
    ];
    const x0 = 62, y0 = 44, cw = 38, ch = 28;
    let rects = '';
    for (let r = 0; r < 5; r++) {
      rects += txt(x0 - 5, y0 + r * ch + ch / 2 + 2.5, yRows[r], { size: 7.1, fill: ink.text, anchor: 'end' });
      for (let c = 0; c < 6; c++) {
        const z = zVals[r][c], t = (z - 1.4) / 3.2;
        const fill = mixHex(ink.primarySoft, ink.primary, t);
        const rx = x0 + c * cw, ry = y0 + r * ch;
        const elev = t * 4;
        rects += `<rect x="${f1(rx + 2)}" y="${f1(ry + 2)}" width="${cw - 4}" height="${ch - 4}" rx="2.5" fill="${darkenHex(fill, 0.28)}"/>`
          + `<rect x="${f1(rx + 2 - elev * 0.4)}" y="${f1(ry + 2 - elev)}" width="${cw - 4}" height="${ch - 4}" rx="2.5" fill="${fill}" stroke="${ink.surface}" stroke-width="0.9"/>`
          + txt(rx + cw / 2 - elev * 0.4, ry + ch / 2 + 2.5 - elev, z.toFixed(1), { size: 6.9, weight: t > 0.7 ? 700 : 500, fill: t > 0.58 ? '#FFFFFF' : ink.text, anchor: 'middle' });
        if (r === 4) rects += txt(rx + cw / 2, y0 + 5 * ch + 12, xCols[c], { size: 7.1, fill: ink.muted, anchor: 'middle' });
      }
    }
    const barColors = [ink.primary, lightenHex(ink.primary, 0.25), lightenHex(ink.primary, 0.5), lightenHex(ink.primary, 0.72), ink.primarySoft];
    return {
      title: '价格档位×服务等级浮雕响应热力图',
      badge: '最优组合 4.6分',
      body: rects + colorbarV(306, 48, 10, 128, barColors, '1.4', '4.6', '效用', ink),
    };
  },

  contour_2d: (ink) => {
    const x0 = 46, y0 = 44, x1 = 296, y1 = 192;
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const yTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}.0` }));
    const cx = 198, cy = 104;
    const rings = [
      { rx: 102, ry: 58, rot: -18, op: 0.14 },
      { rx: 80, ry: 45, rot: -18, op: 0.22 },
      { rx: 58, ry: 32, rot: -18, op: 0.34 },
      { rx: 38, ry: 21, rot: -18, op: 0.52 },
      { rx: 20, ry: 11, rot: -18, op: 0.75 },
    ].map(r => `<ellipse cx="${cx}" cy="${cy}" rx="${r.rx}" ry="${r.ry}" transform="rotate(${r.rot} ${cx} ${cy})" fill="${ink.primary}" fill-opacity="${r.op}" stroke="${ink.primary}" stroke-width="0.9" stroke-opacity="0.6"/>`).join('');
    const pts: [number, number][] = [[142, 134], [164, 118], [186, 108], [202, 98], [218, 92], [178, 126], [212, 114], [190, 92], [234, 86], [156, 142], [116, 152], [254, 78]];
    const barColors = [ink.primary, lightenHex(ink.primary, 0.22), lightenHex(ink.primary, 0.44), lightenHex(ink.primary, 0.65), ink.primarySoft];
    return {
      title: '体验与价格敏感二维核密度等高线',
      badge: '密度峰值 (3.9, 4.2)',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, vGrid: true, yTitle: '支付意愿 Y', xTitle: '体验感知 X' }, ink)
        + rings
        + pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${ink.text}" fill-opacity="0.45"/>`).join('')
        + `<line x1="${cx - 7}" y1="${cy}" x2="${cx + 7}" y2="${cy}" stroke="${ink.opposite}" stroke-width="1.3"/>`
        + `<line x1="${cx}" y1="${cy - 7}" x2="${cx}" y2="${cy + 7}" stroke="${ink.opposite}" stroke-width="1.3"/>`
        + txt(cx + 9, cy - 5, '众数核心', { size: 7, weight: 700, fill: ink.opposite })
        + colorbarV(310, 48, 10, 128, barColors, '低', '高', '密度', ink),
    };
  },

  surface_3d_proj: (ink) => {
    const proj = (u: number, v: number, z: number): [number, number] => [
      180 + (u - v) * 26,
      166 - (u + v) * 10 - z,
    ];
    const zFn = (u: number, v: number) => 58 * Math.exp(-(((u - 2.3) ** 2) / 3.8 + ((v - 2.2) ** 2) / 3.4)) + 10;
    let quads = '';
    for (let v = 4; v >= 0; v--) {
      for (let u = 4; u >= 0; u--) {
        const p00 = proj(u, v, zFn(u, v)), p10 = proj(u + 1, v, zFn(u + 1, v));
        const p11 = proj(u + 1, v + 1, zFn(u + 1, v + 1)), p01 = proj(u, v + 1, zFn(u, v + 1));
        const avg = (zFn(u, v) + zFn(u + 1, v) + zFn(u + 1, v + 1) + zFn(u, v + 1)) / 4;
        const t = Math.min(1, Math.max(0, (avg - 12) / 56));
        const fill = mixHex(ink.secondarySoft, ink.primary, t);
        quads += `<polygon points="${polyStr([p00, p10, p11, p01])}" fill="${fill}" fill-opacity="0.88" stroke="${darkenHex(fill, 0.25)}" stroke-width="0.7"/>`;
      }
    }
    const peak = proj(2.3, 2.2, zFn(2.3, 2.2));
    const axO = proj(0, 0, 0), axU = proj(5.3, 0, 0), axV = proj(0, 5.3, 0), axZ = proj(0, 0, 74);
    return {
      title: '二次响应面回归三维曲面投影图',
      badge: 'R²=0.79 · 极大值点',
      body: `<line x1="${f1(axO[0])}" y1="${f1(axO[1])}" x2="${f1(axU[0])}" y2="${f1(axU[1])}" stroke="${ink.axis}" stroke-width="1"/>`
        + `<line x1="${f1(axO[0])}" y1="${f1(axO[1])}" x2="${f1(axV[0])}" y2="${f1(axV[1])}" stroke="${ink.axis}" stroke-width="1"/>`
        + `<line x1="${f1(axO[0])}" y1="${f1(axO[1])}" x2="${f1(axZ[0])}" y2="${f1(axZ[1])}" stroke="${ink.axis}" stroke-width="1"/>`
        + quads
        + `<circle cx="${f1(peak[0])}" cy="${f1(peak[1])}" r="4" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.2"/>`
        + txt(peak[0], peak[1] - 7, '最优响应点 (x*, y*)', { size: 7.2, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + txt(axU[0] + 6, axU[1] + 8, '补贴强度 X1', { size: 7.2, fill: ink.axis })
        + txt(axV[0] - 6, axV[1] + 8, '服务频次 X2', { size: 7.2, fill: ink.axis, anchor: 'end' })
        + txt(axZ[0] - 5, axZ[1], '效用 Z', { size: 7.2, fill: ink.axis, anchor: 'end' }),
    };
  },

  bubble: (ink) => {
    const x0 = 46, y0 = 44, x1 = 338, y1 = 192;
    const xTicks = [20, 40, 60, 80].map((v, i) => ({ pos: x0 + ((i + 0.5) / 4) * (x1 - x0), label: `${v}%` }));
    const yTicks = [20, 40, 60, 80].map((v, i) => ({ pos: y1 - ((i + 0.5) / 4) * (y1 - y0), label: `${v}%` }));
    const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
    const bubbles = [
      { lbl: '高价值通勤', x: 264, y: 74, r: 22, c: ink.primary },
      { lbl: '校园青年', x: 222, y: 102, r: 16, c: ink.secondary },
      { lbl: '银发刚需', x: 118, y: 78, r: 18, c: ink.opposite },
      { lbl: '县域家庭', x: 248, y: 146, r: 14, c: ink.accent4 },
      { lbl: '低频边缘', x: 104, y: 152, r: 11, c: ink.muted },
    ];
    return {
      title: '细分客群认知×转化×体量气泡矩阵',
      badge: '面积编码 · 潜在规模',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '高意愿转化率', xTitle: '品牌认知普及率' }, ink)
        + `<line x1="${midX}" y1="${y0}" x2="${midX}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3.5 2.5"/>`
        + `<line x1="${x0}" y1="${midY}" x2="${x1}" y2="${midY}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3.5 2.5"/>`
        + bubbles.map(b => `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="${b.c}" fill-opacity="0.34" stroke="${b.c}" stroke-width="1.5"/>`
          + txt(b.x, b.y + 2.5, b.lbl, { size: 6.9, weight: 700, fill: ink.text, anchor: 'middle' })).join('')
        + `<circle cx="300" cy="176" r="5" stroke="${ink.muted}" stroke-width="1"/><circle cx="316" cy="176" r="9" stroke="${ink.muted}" stroke-width="1"/>`
        + txt(328, 179, '规模', { size: 6.6, fill: ink.muted }),
    };
  },

  parallel_coords: (ink) => {
    const dims = ['有用性', '易用性', '信任感', '性价比', '复购意'];
    const xs = dims.map((_, i) => 52 + i * 70);
    const y0 = 52, y1 = 186;
    const yMap = (v: number) => y1 - ((v - 1) / 4) * (y1 - y0);
    const paths = [
      { c: ink.primary, rows: [[4.5, 4.3, 4.6, 3.9, 4.7], [4.2, 4.5, 4.3, 3.6, 4.4], [4.7, 4.1, 4.4, 4.0, 4.5]] },
      { c: ink.secondary, rows: [[3.6, 3.4, 3.1, 4.2, 3.3], [3.3, 3.7, 3.3, 4.0, 3.1], [3.8, 3.2, 3.5, 3.9, 3.4]] },
      { c: ink.opposite, rows: [[2.1, 2.4, 2.0, 2.2, 1.8], [2.4, 2.1, 2.3, 2.5, 2.0]] },
    ];
    const axisLines = xs.map((x, i) =>
      `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.2"/>`
      + txt(x, y1 + 14, dims[i], { size: 7.5, weight: 600, fill: ink.text, anchor: 'middle' })
      + txt(x - 3, y0 + 3, '5', { size: 6.4, fill: ink.muted, anchor: 'end' })
      + txt(x - 3, y1, '1', { size: 6.4, fill: ink.muted, anchor: 'end' }),
    ).join('');
    const curves = paths.flatMap(g => g.rows.map(r => {
      const pts: [number, number][] = r.map((v, i) => [xs[i], yMap(v)]);
      return `<polyline points="${polyStr(pts)}" stroke="${g.c}" stroke-width="1.5" stroke-opacity="0.72"/>`
        + pts.map(([px, py]) => `<circle cx="${px}" cy="${f1(py)}" r="2.2" fill="${g.c}"/>`).join('');
    })).join('');
    return {
      title: '三类细分人群多维平行坐标轨迹图',
      badge: 'K=3 · 构念对比',
      body: legendChips([{ label: '忠实拥趸', color: ink.primary, kind: 'line' }, { label: '价格务实', color: ink.secondary, kind: 'line' }, { label: '高流失风险', color: ink.opposite, kind: 'line' }], 46, 42, ink)
        + curves + axisLines,
    };
  },

  sankey: (ink) => {
    const colX = [36, 168, 304];
    const nodes = [
      { x: colX[0], y: 48, h: 66, c: ink.primary, lbl: '短视频 48%' },
      { x: colX[0], y: 120, h: 44, c: ink.secondary, lbl: '社群口碑 32%' },
      { x: colX[0], y: 170, h: 28, c: ink.muted, lbl: '线下推广 20%' },
      { x: colX[1], y: 46, h: 86, c: ink.primary, lbl: '深度试用 62%' },
      { x: colX[1], y: 140, h: 58, c: ink.opposite, lbl: '浅尝停用 38%' },
      { x: colX[2], y: 48, h: 78, c: ink.primary, lbl: '持续复购 54%' },
      { x: colX[2], y: 134, h: 64, c: ink.opposite, lbl: '流失/观望 46%' },
    ];
    const flows = [
      { x0: 48, y0: 74, x1: 168, y1: 72, w: 38, c: ink.primary },
      { x0: 48, y0: 104, x1: 168, y1: 150, w: 14, c: ink.opposite },
      { x0: 48, y0: 136, x1: 168, y1: 108, w: 26, c: ink.secondary },
      { x0: 48, y0: 184, x1: 168, y1: 182, w: 18, c: ink.muted },
      { x0: 180, y0: 82, x1: 304, y1: 82, w: 54, c: ink.primary },
      { x0: 180, y0: 120, x1: 304, y1: 150, w: 16, c: ink.opposite },
      { x0: 180, y0: 174, x1: 304, y1: 178, w: 34, c: ink.opposite },
    ];
    const ribbons = flows.map(f => {
      const mx = (f.x0 + f.x1) / 2;
      return `<path d="M ${f.x0} ${f.y0} C ${mx} ${f.y0}, ${mx} ${f.y1}, ${f.x1} ${f.y1}" stroke="${f.c}" stroke-opacity="0.28" stroke-width="${f.w}"/>`;
    }).join('');
    const nodeRects = nodes.map((n, i) => {
      const isRight = n.x > 250;
      return `<rect x="${n.x}" y="${n.y}" width="12" height="${n.h}" rx="2" fill="${n.c}"/>`
        + txt(isRight ? n.x - 5 : n.x + 16, n.y + n.h / 2 + 2.5, n.lbl, { size: 7.1, weight: 600, fill: ink.text, anchor: isRight ? 'end' : 'start', ...(i >= 3 && i <= 4 ? {} : {}) });
    }).join('');
    return {
      title: '用户触达→试用→复购转化桑基图',
      badge: '流量守恒 · n=506',
      body: txt(42, 40, '触达渠道', { size: 7.2, weight: 700, fill: ink.muted })
        + txt(174, 40, '体验分层', { size: 7.2, weight: 700, fill: ink.muted, anchor: 'middle' })
        + txt(310, 40, '最终留存', { size: 7.2, weight: 700, fill: ink.muted, anchor: 'end' })
        + ribbons + nodeRects,
    };
  },

  chord: (ink) => {
    const cx = 148, cy = 126, r = 68;
    const nodes = [
      { lbl: '功能效能', a0: 4, a1: 68, c: ink.primary },
      { lbl: '价格透明', a0: 76, a1: 136, c: ink.secondary },
      { lbl: '制度信任', a0: 144, a1: 208, c: ink.accent4 },
      { lbl: '售后保障', a0: 216, a1: 276, c: ink.opposite },
      { lbl: '口碑渠道', a0: 284, a1: 354, c: ink.accent5 },
    ];
    const arcs = nodes.map(n => {
      const mid = (n.a0 + n.a1) / 2;
      const [lx, ly] = polarXY(cx, cy, r + 13, mid);
      const anchor = lx > cx + 6 ? 'start' : lx < cx - 6 ? 'end' : 'middle';
      return `<path d="${arcPath(cx, cy, r - 8, r, n.a0, n.a1)}" fill="${n.c}"/>`
        + txt(lx, ly + 2.5, n.lbl, { size: 7.2, weight: 600, fill: ink.text, anchor });
    }).join('');
    const links: [number, number, number, string][] = [
      [30, 170, 9, ink.primary],
      [50, 102, 7, ink.secondary],
      [114, 246, 6, ink.opposite],
      [186, 322, 8, ink.accent4],
      [258, 336, 5, ink.accent5],
      [18, 310, 6, ink.primary],
    ];
    const chords = links.map(([a, b, w, c]) => {
      const [x1, y1] = polarXY(cx, cy, r - 9, a);
      const [x2, y2] = polarXY(cx, cy, r - 9, b);
      return `<path d="M ${f1(x1)} ${f1(y1)} Q ${cx} ${cy}, ${f1(x2)} ${f1(y2)}" stroke="${c}" stroke-opacity="0.36" stroke-width="${w}"/>`;
    }).join('');
    return {
      title: '多维度共现迁移关联弦图',
      badge: '共现权重矩阵',
      body: chords + arcs
        + legendChips([{ label: '强正向共现', color: ink.primary, kind: 'line' }, { label: '价格摩擦关联', color: ink.opposite, kind: 'line' }], 248, 58, ink)
        + txt(248, 76, '弧宽=共现频次', { size: 7, fill: ink.muted }),
    };
  },

  ternary: (ink) => {
    const top: [number, number] = [174, 48], left: [number, number] = [94, 186], right: [number, number] = [254, 186];
    const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const ternXY = (wTop: number, wLeft: number, wRight: number): [number, number] => [
      wTop * top[0] + wLeft * left[0] + wRight * right[0],
      wTop * top[1] + wLeft * left[1] + wRight * right[1],
    ];
    const grids = [0.2, 0.4, 0.6, 0.8].map(t => {
      const p1 = lerp(left, top, t), p2 = lerp(right, top, t);
      const q1 = lerp(top, right, t), q2 = lerp(left, right, t);
      const r1 = lerp(top, left, t), r2 = lerp(right, left, t);
      return `<line x1="${f1(p1[0])}" y1="${f1(p1[1])}" x2="${f1(p2[0])}" y2="${f1(p2[1])}" stroke="${ink.grid}" stroke-width="0.8"/>`
        + `<line x1="${f1(q1[0])}" y1="${f1(q1[1])}" x2="${f1(q2[0])}" y2="${f1(q2[1])}" stroke="${ink.grid}" stroke-width="0.8"/>`
        + `<line x1="${f1(r1[0])}" y1="${f1(r1[1])}" x2="${f1(r2[0])}" y2="${f1(r2[1])}" stroke="${ink.grid}" stroke-width="0.8"/>`;
    }).join('');
    const pts: [number, number, number, string][] = [
      [0.52, 0.28, 0.20, ink.primary], [0.46, 0.34, 0.20, ink.primary], [0.42, 0.32, 0.26, ink.primary],
      [0.24, 0.56, 0.20, ink.secondary], [0.28, 0.48, 0.24, ink.secondary],
      [0.22, 0.24, 0.54, ink.opposite], [0.18, 0.28, 0.54, ink.opposite],
    ];
    const centroid = ternXY(0.45, 0.35, 0.20);
    return {
      title: '需求偏好三元成分重心三角图',
      badge: '权重和=100%',
      body: `<polygon points="${polyStr([top, left, right])}" fill="${ink.surface}" stroke="${ink.axis}" stroke-width="1.2"/>`
        + grids
        + pts.map(([a, b, c, col]) => { const [px, py] = ternXY(a, b, c); return `<circle cx="${f1(px)}" cy="${f1(py)}" r="3.6" fill="${col}" fill-opacity="0.78"/>`; }).join('')
        + `<circle cx="${f1(centroid[0])}" cy="${f1(centroid[1])}" r="5.5" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.4"/>`
        + txt(centroid[0] + 8, centroid[1] + 2, '重心 (45%,35%,20%)', { size: 7.1, weight: 700, fill: ink.opposite })
        + txt(top[0], top[1] - 6, '功能价值 (100%)', { size: 7.6, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(left[0] - 4, left[1] + 12, '情感体验', { size: 7.6, weight: 700, fill: ink.secondary, anchor: 'middle' })
        + txt(right[0] + 4, right[1] + 12, '价格成本', { size: 7.6, weight: 700, fill: ink.opposite, anchor: 'middle' }),
    };
  },

  pareto_frontier: (ink) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [10, 20, 30, 40, 50].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}万` }));
    const yTicks = [20, 40, 60, 80, 100].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}%` }));
    const front: [number, number][] = [[66, 146], [108, 106], [164, 78], [234, 58], [308, 50]];
    const dominated: [number, number][] = [[124, 152], [148, 134], [182, 128], [212, 114], [248, 102], [282, 96], [192, 154], [268, 132], [166, 168]];
    return {
      title: '投入成本×效果帕累托最优前沿',
      badge: '5个非支配最优解',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '满意度提升 (%)', xTitle: '方案实施预算 (万元)' }, ink)
        + `<polygon points="${polyStr([[x0, y0], ...front, [x1, 50], [x1, y0]])}" fill="${ink.grid}" fill-opacity="0.45"/>`
        + txt(x0 + 10, y0 + 14, '不可行域', { size: 7, fill: ink.muted })
        + dominated.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${ink.lightMuted}" fill-opacity="0.72"/>`).join('')
        + `<path d="${smoothCurvePath(front)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + front.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.2"/>`
          + txt(x, y - 7, `S${i + 1}`, { size: 7.2, weight: 700, fill: ink.primary, anchor: 'middle' })).join(''),
    };
  },

  markowitz_frontier: (ink) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (sig: number) => x0 + (sig / 20) * (x1 - x0);
    const yMap = (ret: number) => y1 - (ret / 18) * (y1 - y0);
    const xTicks = [0, 5, 10, 15, 20].map(v => ({ pos: xMap(v), label: `${v}%` }));
    const yTicks = [0, 4, 8, 12, 16].map(v => ({ pos: yMap(v), label: `${v}%` }));
    const sigFn = (r: number) => 6.4 + 0.12 * (r - 7.5) ** 2;
    const lowerRs = [2.6, 3.8, 5.0, 6.2, 7.5];
    const upperRs = [7.5, 9.0, 10.5, 12.0, 13.5, 15.0, 16.5];
    const lowerPts: [number, number][] = lowerRs.map(r => [xMap(sigFn(r)), yMap(r)]);
    const upperPts: [number, number][] = upperRs.map(r => [xMap(sigFn(r)), yMap(r)]);
    const rf = 2.0;
    let bestR = 12.6, bestSr = 0;
    for (let r = 8.0; r <= 16.5; r += 0.1) {
      const sr = (r - rf) / sigFn(r);
      if (sr > bestSr) { bestSr = sr; bestR = r; }
    }
    const tanSig = sigFn(bestR);
    const calEndSig = Math.min(20, (17.5 - rf) / bestSr);
    const calEndRet = rf + bestSr * calEndSig;
    const cloud: [number, number][] = [
      [8.4, 7.2], [9.6, 8.8], [10.4, 6.6], [11.5, 10.4], [12.8, 8.6], [13.6, 11.4],
      [14.8, 9.8], [15.4, 12.6], [16.2, 10.8], [12.0, 5.8], [14.2, 7.4], [17.0, 11.8],
    ];
    return {
      title: 'Markowitz 均值—方差有效前沿与夏普切点',
      badge: `Sharpe*=${bestSr.toFixed(2)} · rf=2.0%`,
      body: legendChips([{ label: '有效前沿', color: ink.primary, kind: 'line' }, { label: 'CAL 切线', color: ink.opposite, kind: 'dash' }, { label: '可行域组合', color: ink.secondary, kind: 'dot' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '预期收益率 E(R)', xTitle: '组合波动率 σ (%)' }, ink)
        + cloud.map(([s, r]) => `<circle cx="${f1(xMap(s))}" cy="${f1(yMap(r))}" r="2.7" fill="${ink.secondary}" fill-opacity="0.48"/>`).join('')
        + `<path d="${smoothCurvePath(lowerPts)}" stroke="${ink.lightMuted}" stroke-width="1.4" stroke-dasharray="3 2.5"/>`
        + `<path d="${smoothCurvePath(upperPts)}" stroke="${ink.primary}" stroke-width="2.3"/>`
        + `<line x1="${f1(xMap(0))}" y1="${f1(yMap(rf))}" x2="${f1(xMap(calEndSig))}" y2="${f1(yMap(calEndRet))}" stroke="${ink.opposite}" stroke-width="1.5" stroke-dasharray="4 2"/>`
        + `<circle cx="${f1(xMap(0))}" cy="${f1(yMap(rf))}" r="3.2" fill="${ink.opposite}"/>`
        + txt(xMap(0) + 5, yMap(rf) - 4, 'rf=2.0%', { size: 6.8, weight: 600, fill: ink.opposite })
        + `<circle cx="${f1(xMap(6.4))}" cy="${f1(yMap(7.5))}" r="4" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="1.1"/>`
        + txt(xMap(6.4) + 6, yMap(7.5) + 8, 'GMVP 最小方差', { size: 6.9, weight: 600, fill: ink.secondary })
        + `<circle cx="${f1(xMap(tanSig))}" cy="${f1(yMap(bestR))}" r="4.6" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.2"/>`
        + txt(xMap(tanSig) - 6, yMap(bestR) - 7, '最优夏普切点', { size: 7.1, weight: 700, fill: ink.opposite, anchor: 'end' }),
    };
  },

  kuznets_ekc: (ink) => {
    const x0 = 46, y0 = 46, x1 = 336, y1 = 192;
    const xMap = (x: number) => x0 + ((x - 7.5) / 4.0) * (x1 - x0);
    const yMap = (y: number) => y1 - ((y - 1.0) / 2.4) * (y1 - y0);
    const xTicks = [7.5, 8.5, 9.5, 10.5, 11.5].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = [1.0, 1.8, 2.6, 3.4].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const fn = (x: number) => 2.94 - 0.42 * (x - 9.42) ** 2;
    const hw = (x: number) => 0.13 + 0.045 * (x - 9.42) ** 2;
    const xs = Array.from({ length: 25 }, (_, i) => 7.6 + (i / 24) * 3.8);
    const midPts: [number, number][] = xs.map(x => [xMap(x), yMap(fn(x))]);
    const topPts: [number, number][] = xs.map(x => [xMap(x), yMap(fn(x) + hw(x))]);
    const botPts: [number, number][] = xs.map(x => [xMap(x), yMap(fn(x) - hw(x))]);
    const obs: [number, number][] = [
      [7.75, 1.82], [7.95, 1.98], [8.15, 2.34], [8.35, 2.38], [8.55, 2.72], [8.75, 2.68], [8.95, 2.96],
      [9.18, 2.84], [9.38, 3.06], [9.62, 2.88], [9.85, 2.76], [10.05, 2.86], [10.28, 2.52], [10.5, 2.48],
      [10.75, 2.28], [10.95, 1.92], [11.15, 1.78], [11.32, 1.48],
    ];
    const xStar = xMap(9.42), yStar = yMap(2.94), xCiL = xMap(9.05), xCiR = xMap(9.80);
    return {
      title: '环境库兹涅茨倒 U 型曲线 (EKC) 拐点带',
      badge: '拐点 x*=9.42 · SLM p=0.008',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '排放强度 ln(CO₂)', xTitle: '人均发展水平 ln(GDP/P)' }, ink)
        + `<rect x="${f1(xCiL)}" y="${y0}" width="${f1(xCiR - xCiL)}" height="${y1 - y0}" fill="${ink.opposite}" fill-opacity="0.1"/>`
        + bandPolygon(topPts, botPts, ink.primary, 0.18)
        + `<path d="${smoothCurvePath(midPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + obs.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.7" fill="${x < 9.42 ? ink.secondary : ink.primary}" fill-opacity="0.76"/>`).join('')
        + `<line x1="${f1(xStar)}" y1="${f1(yStar)}" x2="${f1(xStar)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + errH(yStar - 11, xCiL, xCiR, ink.opposite, 3)
        + `<circle cx="${f1(xStar)}" cy="${f1(yStar)}" r="4.2" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.1"/>`
        + txt(xStar, yStar - 17, '拐点 95%CI [9.05, 9.80]', { size: 6.8, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + pill(54, 170, 'β₁>0, β₂<0 · x*=-β₁/(2β₂)', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.7, h: 14 }),
    };
  },

  bipartite_network: (ink) => {
    const uNodes = [
      { lbl: 'U1 数字原住民', y: 66, r: 7.5, c: ink.primary },
      { lbl: 'U2 家庭刚需群', y: 102, r: 8.5, c: ink.primary },
      { lbl: 'U3 价格敏感群', y: 138, r: 7.2, c: ink.accent4 },
      { lbl: 'U4 银发保守群', y: 174, r: 6.2, c: ink.secondary },
    ];
    const vNodes = [
      { lbl: 'C1 短视频种草', y: 58, c: ink.secondary },
      { lbl: 'C2 消费券直补', y: 90, c: ink.opposite },
      { lbl: 'C3 社群团购', y: 122, c: ink.secondary },
      { lbl: 'C4 社区网格点', y: 154, c: ink.opposite },
      { lbl: 'C5 权威背书', y: 186, c: ink.secondary },
    ];
    const edges: [number, number, number, string][] = [
      [0, 0, 0.92, ink.primary], [0, 1, 0.52, ink.primary], [0, 2, 0.44, ink.primary],
      [1, 0, 0.56, ink.primary], [1, 1, 0.84, ink.opposite], [1, 2, 0.72, ink.primary], [1, 4, 0.48, ink.secondary],
      [2, 1, 0.94, ink.opposite], [2, 2, 0.68, ink.accent4], [2, 3, 0.35, ink.accent4],
      [3, 3, 0.86, ink.opposite], [3, 4, 0.76, ink.secondary],
    ];
    const xU = 112, xV = 248;
    const edgePaths = edges.map(([ui, vi, w, col]) => {
      const uy = uNodes[ui].y, vy = vNodes[vi].y;
      return `<path d="M ${xU} ${uy} C 166 ${uy}, 194 ${vy}, ${xV} ${vy}" stroke="${col}" stroke-width="${f2(0.7 + w * 2.8)}" stroke-opacity="${f2(0.2 + w * 0.55)}"/>`;
    }).join('');
    const leftSvg = uNodes.map(u =>
      `<circle cx="${xU}" cy="${u.y}" r="${u.r}" fill="${u.c}" stroke="${ink.surface}" stroke-width="1.3"/>`
      + txt(xU - 12, u.y + 2.5, u.lbl, { size: 7.2, weight: 600, fill: ink.text, anchor: 'end' }),
    ).join('');
    const rightSvg = vNodes.map(v =>
      `<rect x="${xV - 6}" y="${v.y - 6}" width="12" height="12" rx="2.5" fill="${v.c}" stroke="${ink.surface}" stroke-width="1.2"/>`
      + txt(xV + 11, v.y + 2.5, v.lbl, { size: 7.2, weight: 600, fill: ink.text }),
    ).join('');
    return {
      title: '消费群体 × 媒介/政策工具二分加权网络',
      badge: '二部图 4×5 · 模块度 Q=0.41',
      body: txt(xU - 4, 41, '消费群体层 (U)', { size: 7.3, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(xV + 4, 41, '媒介/政策工具层 (V)', { size: 7.3, weight: 700, fill: ink.secondary })
        + edgePaths + leftSvg + rightSvg
        + txt(180, 212, '严格双模连边 (U ↔ V) · 边宽正比于触达耦合权重 w_ij', { size: 6.9, fill: ink.muted, anchor: 'middle' }),
    };
  },

  smith_impedance_chart: (ink: ResolvedInk) => {
    const cx = 130, cy = 128, R = 74;
    const toXY = (re: number, im: number): [number, number] => [cx + re * R, cy - im * R];
    const gammaOf = (r: number, x: number): [number, number] => {
      const denom = (r + 1) * (r + 1) + x * x;
      return [(r * r + x * x - 1) / denom, (2 * x) / denom];
    };
    const rCircles = [0.5, 1.0, 2.0].map(r => {
      const gx = (r / (1 + r)) * R;
      const rr = (1 / (1 + r)) * R;
      return `<circle cx="${f1(cx + gx)}" cy="${cy}" r="${f1(rr)}" stroke="${r === 1 ? ink.secondary : ink.grid}" stroke-width="${r === 1 ? 0.95 : 0.75}"${r === 1 ? ' stroke-dasharray="3 2"' : ''}/>`;
    }).join('');
    const rs = [0, 0.1, 0.25, 0.45, 0.75, 1.2, 2.0, 3.5, 6.0, 12.0, 30.0];
    const xArcs = [-2.0, -1.0, -0.5, 0.5, 1.0, 2.0].map(x => {
      const pts: [number, number][] = rs.map(r => {
        const [re, im] = gammaOf(r, x);
        return toXY(re, im);
      });
      return `<path d="${smoothCurvePath(pts)}" stroke="${ink.grid}" stroke-width="0.75"/>`;
    }).join('');
    // Step 1: r=0.35 series inductor from x=-0.65 to x=0.477 (reaches g=1 circle)
    const step1Pts: [number, number][] = Array.from({ length: 13 }, (_, i) => {
      const x = -0.65 + (i / 12) * (0.477 - (-0.65));
      const [re, im] = gammaOf(0.35, x);
      return toXY(re, im);
    });
    // Step 2: g=1.0 shunt capacitor from b=-1.363 to b=0 (reaches 1+j0 center)
    const step2Pts: [number, number][] = Array.from({ length: 13 }, (_, i) => {
      const b = -1.363 * (1 - i / 12);
      const denom = 1 + b * b;
      const r = 1 / denom, x = -b / denom;
      const [re, im] = gammaOf(r, x);
      return toXY(re, im);
    });
    const pStart = step1Pts[0], pMid = step1Pts[step1Pts.length - 1], pEnd = step2Pts[step2Pts.length - 1];
    const m1a = step1Pts[6], m1b = step1Pts[7];
    const m2a = step2Pts[6], m2b = step2Pts[7];
    const ang1 = (Math.atan2(m1b[1] - m1a[1], m1b[0] - m1a[0]) * 180) / Math.PI;
    const ang2 = (Math.atan2(m2b[1] - m2a[1], m2b[0] - m2a[0]) * 180) / Math.PI;
    const infoCard = `<rect x="220" y="48" width="128" height="154" rx="5" fill="${ink.surface}" stroke="${ink.border}" stroke-width="0.9"/>`
      + txt(230, 64, 'L 型集总阻抗匹配网络', { size: 7.3, weight: 700, fill: ink.text })
      + `<line x1="230" y1="81" x2="246" y2="81" stroke="${ink.primary}" stroke-width="2.1"/>`
      + txt(252, 83.5, '串联电感 (+jX)', { size: 6.9, fill: ink.text })
      + `<line x1="230" y1="98" x2="246" y2="98" stroke="${ink.opposite}" stroke-width="2.1"/>`
      + txt(252, 100.5, '并联电容 (+jB)', { size: 6.9, fill: ink.text })
      + `<line x1="230" y1="115" x2="246" y2="115" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3 2"/>`
      + txt(252, 117.5, 'VSWR = 2.0 稳定圆', { size: 6.9, fill: ink.text })
      + `<line x1="230" y1="129" x2="338" y2="129" stroke="${ink.grid}" stroke-width="0.8"/>`
      + txt(230, 145, '特性基准 Z0 = 50 Ω', { size: 6.8, fill: ink.muted })
      + txt(230, 160, '负载 ZL = 17.5-j32.5Ω', { size: 6.8, fill: ink.text })
      + txt(230, 176, '回波损耗 S11: -34.2 dB', { size: 6.9, weight: 700, fill: ink.primary })
      + txt(230, 192, '匹配驻波 VSWR: 1.04', { size: 6.9, weight: 700, fill: ink.opposite });
    return {
      title: '射频/电力阻抗匹配 Smith 史密斯圆图',
      badge: 'S11=-34dB · VSWR=1.04',
      body: `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${ink.surface}" stroke="${ink.axis}" stroke-width="1.2"/>`
        + rCircles + xArcs
        + `<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="${ink.axis}" stroke-width="0.85"/>`
        + `<circle cx="${cx}" cy="${cy}" r="${f1(R / 3)}" stroke="${ink.opposite}" stroke-width="0.95" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(step1Pts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<path d="${smoothCurvePath(step2Pts)}" stroke="${ink.opposite}" stroke-width="2.2"/>`
        + arrowPoly(m1b[0], m1b[1], ang1, 4.8, ink.primary)
        + arrowPoly(m2b[0], m2b[1], ang2, 4.8, ink.opposite)
        + `<circle cx="${f1(pStart[0])}" cy="${f1(pStart[1])}" r="3.6" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="1"/>`
        + `<circle cx="${f1(pMid[0])}" cy="${f1(pMid[1])}" r="3.2" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="0.9"/>`
        + `<circle cx="${f1(pEnd[0])}" cy="${f1(pEnd[1])}" r="4.0" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.1"/>`
        + txt(pStart[0] - 5, pStart[1] + 10, 'ZL', { size: 6.9, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(pEnd[0] + 6, pEnd[1] - 5, '1+j0', { size: 6.8, weight: 700, fill: ink.opposite })
        + txt(cx - R - 5, cy + 2.5, '0', { size: 6.8, fill: ink.muted, anchor: 'end' })
        + txt(cx + R + 4, cy + 2.5, '∞', { size: 7.4, fill: ink.muted })
        + txt(cx, cy - R - 4, '+j1.0', { size: 6.6, fill: ink.muted, anchor: 'middle' })
        + txt(cx, cy + R + 10, '-j1.0', { size: 6.6, fill: ink.muted, anchor: 'middle' })
        + infoCard,
    };
  },

  markov_transition_chord: (ink) => {
    const cx = 96, cy = 124, r = 46;
    const states = [
      { id: 'S1', lbl: 'S1 认知', a0: 5, a1: 77, c: ink.secondary },
      { id: 'S2', lbl: 'S2 试用', a0: 95, a1: 167, c: ink.accent4 },
      { id: 'S3', lbl: 'S3 留存', a0: 185, a1: 257, c: ink.primary },
      { id: 'S4', lbl: 'S4 流失', a0: 275, a1: 347, c: ink.opposite },
    ] as const;
    const arcs = states.map(s => {
      const mid = (s.a0 + s.a1) / 2;
      const [lx, ly] = polarXY(cx, cy, r + 10, mid);
      const anchor = lx > cx + 5 ? 'start' : lx < cx - 5 ? 'end' : 'middle';
      return `<path d="${arcPath(cx, cy, r - 7, r, s.a0, s.a1)}" fill="${s.c}"/>`
        + txt(lx, ly + 2.5, s.lbl, { size: 6.8, weight: 700, fill: s.c, anchor });
    }).join('');
    const flows: { aFrom: number; aTo: number; w: number; c: string; ctrlOffset: [number, number] }[] = [
      { aFrom: 56, aTo: 118, w: 4.5, c: ink.secondary, ctrlOffset: [10, 0] },
      { aFrom: 146, aTo: 206, w: 4.5, c: ink.accent4, ctrlOffset: [0, 12] },
      { aFrom: 236, aTo: 132, w: 2.6, c: ink.primary, ctrlOffset: [-10, 10] },
      { aFrom: 202, aTo: 296, w: 2.2, c: ink.primary, ctrlOffset: [-12, 0] },
      { aFrom: 326, aTo: 26, w: 2.6, c: ink.opposite, ctrlOffset: [0, -12] },
      { aFrom: 156, aTo: 306, w: 2.0, c: ink.opposite, ctrlOffset: [12, -10] },
    ];
    const chords = flows.map(fl => {
      const [x1, y1] = polarXY(cx, cy, r - 8, fl.aFrom);
      const [x2, y2] = polarXY(cx, cy, r - 11, fl.aTo);
      const qx = cx + fl.ctrlOffset[0], qy = cy + fl.ctrlOffset[1];
      const ang = (Math.atan2(y2 - qy, x2 - qx) * 180) / Math.PI;
      return `<path d="M ${f1(x1)} ${f1(y1)} Q ${f1(qx)} ${f1(qy)}, ${f1(x2)} ${f1(y2)}" stroke="${fl.c}" stroke-opacity="0.48" stroke-width="${fl.w}"/>`
        + arrowPoly(x2, y2, ang, 4.6, fl.c);
    }).join('');
    const mx0 = 218, my0 = 64, cw = 29, ch = 24;
    const mat = [
      [0.52, 0.34, 0.08, 0.06],
      [0.14, 0.42, 0.32, 0.12],
      [0.04, 0.16, 0.68, 0.12],
      [0.18, 0.12, 0.08, 0.62],
    ];
    const stIds = ['S1', 'S2', 'S3', 'S4'];
    const matSvg = stIds.map((cLbl, j) => txt(mx0 + (j + 0.5) * cw, my0 - 5, cLbl, { size: 6.8, weight: 700, fill: ink.axis, anchor: 'middle' })).join('')
      + mat.map((row, i) => {
        const rowY = my0 + i * ch;
        return txt(mx0 - 5, rowY + ch / 2 + 2.4, stIds[i], { size: 6.8, weight: 700, fill: ink.axis, anchor: 'end' })
          + row.map((val, j) => {
            const fill = mixHex(ink.surface, ink.primary, Math.min(1, val * 1.15));
            return `<rect x="${f1(mx0 + j * cw)}" y="${f1(rowY)}" width="${cw - 1.5}" height="${ch - 1.5}" rx="2" fill="${fill}" stroke="${ink.border}" stroke-width="0.5"/>`
              + txt(mx0 + (j + 0.5) * cw - 0.5, rowY + ch / 2 + 2.4, val.toFixed(2), { size: 6.6, weight: i === j ? 700 : 500, fill: val >= 0.45 ? '#FFFFFF' : ink.text, anchor: 'middle' });
          }).join('');
      }).join('');
    return {
      title: '马尔可夫状态转移概率矩阵流',
      badge: 'DTMC 4态 · Σ行=1.00',
      body: chords + arcs
        + txt(mx0 + 2 * cw, 47, '一步转移概率矩阵 P_ij', { size: 7.2, weight: 700, fill: ink.text, anchor: 'middle' })
        + matSvg
        + txt(mx0 + 2 * cw, 178, '稳态分布 π*: S3=45% · S2=22%', { size: 6.8, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(mx0 + 2 * cw, 192, 'S4=21% · S1=12% (遍历平稳)', { size: 6.6, fill: ink.muted, anchor: 'middle' }),
    };
  },

  markov_state_transition: (ink: ResolvedInk) => {
    const states = ['S0 流失', 'S1 潜客', 'S2 活跃', 'S3 忠实'] as const;
    const shortS = ['S0', 'S1', 'S2', 'S3'] as const;
    const P = [
      [0.64, 0.24, 0.08, 0.04],
      [0.16, 0.42, 0.32, 0.10],
      [0.06, 0.14, 0.56, 0.24],
      [0.03, 0.05, 0.22, 0.70],
    ] as const;
    const mx0 = 46, my0 = 58, cw = 31, ch = 28;
    const matSvg = shortS.map((s, j) => txt(mx0 + (j + 0.5) * cw, my0 - 5, s, { size: 6.8, weight: 700, fill: ink.axis, anchor: 'middle' })).join('')
      + P.map((row, i) => {
        const ry = my0 + i * ch;
        return txt(mx0 - 4, ry + ch / 2 + 2.4, states[i], { size: 6.6, weight: 600, fill: ink.text, anchor: 'end' })
          + row.map((v, j) => {
            const fill = mixHex(ink.surface, ink.primary, Math.min(1, v * 1.18));
            return `<rect x="${f1(mx0 + j * cw)}" y="${f1(ry)}" width="${cw - 1.5}" height="${ch - 1.5}" rx="2" fill="${fill}" stroke="${i === j ? ink.primary : ink.border}" stroke-width="${i === j ? 1.1 : 0.5}"/>`
              + txt(mx0 + (j + 0.5) * cw - 0.5, ry + ch / 2 + 2.4, v.toFixed(2), { size: 6.6, weight: i === j ? 700 : 500, fill: v >= 0.44 ? '#FFFFFF' : ink.text, anchor: 'middle' });
          }).join('');
      }).join('');

    const rx0 = 204, ry0 = 58, rx1 = 342, ry1 = 176;
    const nSteps = 13;
    const traj: number[][] = [[0.10, 0.50, 0.30, 0.10]];
    for (let k = 1; k < nSteps; k++) {
      const prev = traj[k - 1];
      const nxt = [0, 1, 2, 3].map(j => prev.reduce((acc, pv, i) => acc + pv * P[i][j], 0));
      traj.push(nxt);
    }
    const xMap = (k: number) => rx0 + (k / (nSteps - 1)) * (rx1 - rx0);
    const yMap = (p: number) => ry1 - (p / 0.55) * (ry1 - ry0);
    const xTicks = [0, 4, 8, 12].map(k => ({ pos: xMap(k), label: `t=${k}` }));
    const yTicks = [0, 0.25, 0.50].map(p => ({ pos: yMap(p), label: `${Math.round(p * 100)}%` }));
    const sCols = [ink.opposite, ink.muted, ink.secondary, ink.primary];
    const steady = traj[nSteps - 1];
    const curvesSvg = [0, 1, 2, 3].map(s => {
      const pts: [number, number][] = traj.map((row, k) => [xMap(k), yMap(row[s])]);
      const endY = yMap(steady[s]);
      return `<line x1="${rx0}" y1="${f1(endY)}" x2="${rx1}" y2="${f1(endY)}" stroke="${sCols[s]}" stroke-width="0.7" stroke-dasharray="2.5 2" stroke-opacity="0.55"/>`
        + `<path d="${smoothCurvePath(pts)}" stroke="${sCols[s]}" stroke-width="${s >= 2 ? 2.0 : 1.5}"/>`
        + `<circle cx="${f1(pts[nSteps - 1][0])}" cy="${f1(pts[nSteps - 1][1])}" r="2.4" fill="${sCols[s]}"/>`;
    }).join('');
    return {
      title: '马尔可夫链状态转移矩阵与稳态收敛',
      badge: 'λ2=0.64 · 混合步 k*=8',
      body: legendChips([
        { label: 'S3 忠实', color: ink.primary, kind: 'line' },
        { label: 'S2 活跃', color: ink.secondary, kind: 'line' },
        { label: 'S1 潜客', color: ink.muted, kind: 'line' },
        { label: 'S0 流失', color: ink.opposite, kind: 'line' },
      ], 46, 39, ink)
        + txt(mx0 + 2 * cw, 47, '一步转移概率矩阵 P_ij', { size: 7.0, weight: 700, fill: ink.text, anchor: 'middle' })
        + matSvg
        + txt(mx0 + 2 * cw, 186, '每行之和 ΣP_ij = 1.00', { size: 6.5, fill: ink.muted, anchor: 'middle' })
        + txt(mx0 + 2 * cw, 198, '稳态 π*=[16%,16%,31%,37%]', { size: 6.4, weight: 700, fill: ink.primary, anchor: 'middle' })
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, yTicks, xTicks, box: true, xTitle: '迭代周期步数 k (收敛至稳态 π*)' }, ink)
        + `<line x1="${f1(xMap(8))}" y1="${ry0}" x2="${f1(xMap(8))}" y2="${ry1}" stroke="${ink.opposite}" stroke-width="0.95" stroke-dasharray="3 2"/>`
        + txt(xMap(8) + 3, ry0 + 10, '混合步 k*=8', { size: 6.2, weight: 700, fill: ink.opposite })
        + curvesSvg,
    };
  },
};

Object.assign(RENDERERS, {
  // =========================================================================
  // 4. COMPOSITION & SETS (看构成与集合) - 12 types
  // =========================================================================
  donut: (ink: ResolvedInk) => {
    const cx = 148, cy = 126, rIn = 34, rOut = 64;
    const slices = [
      ['主城区街道', 42.3, ink.primary],
      ['县城核心区', 26.8, ink.secondary],
      ['乡镇典型村', 15.4, ink.accent4],
      ['高校园区', 9.7, ink.opposite],
      ['其他样本', 5.8, ink.muted],
    ] as const;
    let cur = 0;
    const paths = slices.map(([lbl, pct, c]) => {
      const span = (pct / 100) * 360;
      const a0 = cur + 1, a1 = cur + span - 1, mid = cur + span / 2;
      cur += span;
      const [p1x, p1y] = polarXY(cx, cy, rOut + 2, mid);
      const [p2x, p2y] = polarXY(cx, cy, rOut + 14, mid);
      const right = p2x >= cx;
      const lx = right ? p2x + 12 : p2x - 12;
      return `<path d="${arcPath(cx, cy, rIn, rOut, a0, a1)}" fill="${c}" fill-opacity="0.86" stroke="${ink.canvas}" stroke-width="1"/>`
        + `<polyline points="${f1(p1x)},${f1(p1y)} ${f1(p2x)},${f1(p2y)} ${f1(lx)},${f1(p2y)}" stroke="${c}" stroke-width="0.9"/>`
        + txt(lx + (right ? 3 : -3), p2y + 2.5, `${lbl} ${pct}%`, { size: 7.1, weight: 600, fill: ink.text, anchor: right ? 'start' : 'end' });
    }).join('');
    return {
      title: '受访样本地域来源学术环状图',
      badge: '有效样本 n=506',
      body: paths
        + txt(cx, cy - 2, 'n = 506', { size: 11, weight: 700, fill: ink.text, anchor: 'middle' })
        + txt(cx, cy + 11, '有效总样本', { size: 7.2, fill: ink.muted, anchor: 'middle' }),
    };
  },

  percent_stack: (ink: ResolvedInk) => {
    const rows = [
      ['一线城市', 52, 31, 17],
      ['新一线', 44, 36, 20],
      ['二线城区', 36, 39, 25],
      ['县域乡镇', 26, 38, 36],
    ] as const;
    const x0 = 68, y0 = 48, x1 = 338, y1 = 192;
    const xTicks = [0, 25, 50, 75, 100].map(v => ({ pos: x0 + (v / 100) * (x1 - x0), label: `${v}%` }));
    const rowH = (y1 - y0) / rows.length, wTotal = x1 - x0;
    const bars = rows.map(([lbl, a, b, c], i) => {
      const cy = y0 + (i + 0.5) * rowH, h = 18;
      const wa = (a / 100) * wTotal, wb = (b / 100) * wTotal, wc = wTotal - wa - wb;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.4, weight: 600, fill: ink.text, anchor: 'end' })
        + `<rect x="${x0}" y="${f1(cy - h / 2)}" width="${f1(wa)}" height="${h}" fill="${ink.primary}" fill-opacity="0.88" stroke="${ink.surface}" stroke-width="0.8"/>`
        + `<rect x="${f1(x0 + wa)}" y="${f1(cy - h / 2)}" width="${f1(wb)}" height="${h}" fill="${ink.secondary}" fill-opacity="0.72" stroke="${ink.surface}" stroke-width="0.8"/>`
        + `<rect x="${f1(x0 + wa + wb)}" y="${f1(cy - h / 2)}" width="${f1(wc)}" height="${h}" fill="${ink.opposite}" fill-opacity="0.72" stroke="${ink.surface}" stroke-width="0.8"/>`
        + txt(x0 + wa / 2, cy + 2.6, `${a}%`, { size: 7.2, weight: 700, fill: '#FFFFFF', anchor: 'middle' })
        + txt(x0 + wa + wb / 2, cy + 2.6, `${b}%`, { size: 7.2, weight: 700, fill: '#FFFFFF', anchor: 'middle' })
        + txt(x0 + wa + wb + wc / 2, cy + 2.6, `${c}%`, { size: 7.2, weight: 700, fill: '#FFFFFF', anchor: 'middle' });
    }).join('');
    return {
      title: '分城市能级服务频次 100% 堆叠图',
      badge: 'χ²=26.4 · p < 0.001',
      body: legendChips([{ label: '高频采纳', color: ink.primary, kind: 'box' }, { label: '中频使用', color: ink.secondary, kind: 'box' }, { label: '低频尝鲜', color: ink.opposite, kind: 'box' }], 68, 41, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, hGrid: false, vGrid: true, xTitle: '组内结构占比 (%)' }, ink)
        + bars,
    };
  },

  mosaic: (ink: ResolvedInk) => {
    const cols = [
      { lbl: '城区 44%', wShare: 0.44, parts: [56, 26, 18] },
      { lbl: '县城 34%', wShare: 0.34, parts: [41, 32, 27] },
      { lbl: '乡镇 22%', wShare: 0.22, parts: [28, 34, 38] },
    ];
    const x0 = 46, y0 = 48, x1 = 336, y1 = 188;
    const totW = x1 - x0, totH = y1 - y0;
    const partColors = [ink.primary, ink.secondary, ink.opposite];
    let curX = x0;
    const blocks = cols.map(col => {
      const cw = col.wShare * totW - 3;
      let curY = y0;
      const segs = col.parts.map((pct, pi) => {
        const sh = (pct / 100) * totH - 1.5;
        const rect = `<rect x="${f1(curX)}" y="${f1(curY)}" width="${f1(cw)}" height="${f1(sh)}" rx="2" fill="${partColors[pi]}" fill-opacity="0.82"/>`
          + txt(curX + cw / 2, curY + sh / 2 + 2.5, `${pct}%`, { size: 7.1, weight: 700, fill: '#FFFFFF', anchor: 'middle' });
        curY += (pct / 100) * totH;
        return rect;
      }).join('');
      const lbl = txt(curX + cw / 2, y1 + 12, col.lbl, { size: 7.2, weight: 600, fill: ink.text, anchor: 'middle' });
      curX += col.wShare * totW;
      return segs + lbl;
    }).join('');
    return {
      title: '区域类型×支持态度 Marimekko 马赛克图',
      badge: '面积正比于样本量',
      body: legendChips([{ label: '积极支持', color: ink.primary, kind: 'box' }, { label: '中立观望', color: ink.secondary, kind: 'box' }, { label: '持保留', color: ink.opposite, kind: 'box' }], 46, 41, ink)
        + txt(x0 - 4, 72, '支持', { size: 7, fill: ink.primary, anchor: 'end' })
        + txt(x0 - 4, 122, '中立', { size: 7, fill: ink.secondary, anchor: 'end' })
        + txt(x0 - 4, 168, '保留', { size: 7, fill: ink.opposite, anchor: 'end' })
        + blocks,
    };
  },

  pareto: (ink: ResolvedInk) => {
    const causes = [
      ['信息冗杂', 168, 34],
      ['价格偏高', 132, 61],
      ['流程繁琐', 92, 79],
      ['售后滞后', 54, 90],
      ['界面老旧', 32, 97],
      ['其他问题', 16, 100],
    ] as const;
    const x0 = 44, y0 = 44, x1 = 314, y1 = 192;
    const yTicks = [0, 50, 100, 150, 200].map(v => ({ pos: y1 - (v / 200) * (y1 - y0), label: `${v}` }));
    const step = (x1 - x0) / causes.length;
    const xTicks = causes.map(([lbl], i) => ({ pos: x0 + (i + 0.5) * step, label: lbl }));
    const yCum = (p: number) => y1 - (p / 100) * (y1 - y0);
    const bars = causes.map(([, cnt], i) => {
      const cx = xTicks[i].pos, top = y1 - (cnt / 200) * (y1 - y0);
      const core = i < 3;
      return `<rect x="${f1(cx - 14)}" y="${f1(top)}" width="28" height="${f1(y1 - top)}" rx="2" fill="${core ? ink.primary : ink.lightMuted}" fill-opacity="${core ? 0.78 : 0.45}"/>`;
    }).join('');
    const pts: [number, number][] = causes.map(([, , cum], i) => [xTicks[i].pos, yCum(cum)]);
    const y80 = yCum(80);
    return {
      title: '痛点频数与累计占比帕累托双轴图',
      badge: '前3项累计 79.4%',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '反馈频数 (次)' }, ink)
        + `<line x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${ink.opposite}" stroke-width="0.9"/>`
        + [0, 40, 80, 100].map(p => txt(x1 + 4, yCum(p) + 2.5, `${p}%`, { size: 6.9, fill: ink.opposite })).join('')
        + `<line x1="${x0}" y1="${f1(y80)}" x2="${x1}" y2="${f1(y80)}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + bars
        + `<polyline points="${polyStr(pts)}" stroke="${ink.opposite}" stroke-width="2"/>`
        + pts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.2" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.8"/>`
          + (i === 2 ? txt(x + 6, y - 5, '79% 临界', { size: 7, weight: 700, fill: ink.opposite }) : '')).join(''),
    };
  },

  upset: (ink: ResolvedInk) => {
    const sets = ['价格偏高', '流程繁琐', '售后滞后', '入口过深'];
    const setCounts = [214, 186, 128, 84];
    const combos: { count: number; mask: number[] }[] = [
      { count: 142, mask: [1, 1, 0, 0] },
      { count: 96, mask: [1, 0, 0, 0] },
      { count: 74, mask: [0, 1, 1, 0] },
      { count: 52, mask: [1, 1, 1, 0] },
      { count: 31, mask: [0, 1, 0, 1] },
      { count: 18, mask: [1, 1, 1, 1] },
    ];
    const x0 = 118, y0 = 42, yBarBot = 126, yMatTop = 136, rowH = 18, colW = 36;
    const barMax = 160;
    const topBars = combos.map((c, ci) => {
      const cx = x0 + (ci + 0.5) * colW, bh = (c.count / barMax) * (yBarBot - y0);
      const col = ci === 0 ? ink.opposite : ink.primary;
      return `<rect x="${f1(cx - 10)}" y="${f1(yBarBot - bh)}" width="20" height="${f1(bh)}" rx="2" fill="${col}" fill-opacity="0.82"/>`
        + txt(cx, yBarBot - bh - 3, `${c.count}`, { size: 7, weight: 700, fill: col, anchor: 'middle' });
    }).join('');
    const leftSetBars = sets.map((lbl, ri) => {
      const cy = yMatTop + (ri + 0.5) * rowH;
      const bw = (setCounts[ri] / 240) * 44;
      return txt(66, cy + 2.5, lbl, { size: 7.2, weight: 600, fill: ink.text, anchor: 'end' })
        + `<rect x="${f1(112 - bw)}" y="${f1(cy - 5)}" width="${f1(bw)}" height="10" rx="1.5" fill="${ink.secondary}" fill-opacity="0.72"/>`;
    }).join('');
    const matrix = combos.map((c, ci) => {
      const cx = x0 + (ci + 0.5) * colW;
      const activeYs = c.mask.map((m, ri) => m ? yMatTop + (ri + 0.5) * rowH : -1).filter(v => v >= 0);
      const conn = activeYs.length > 1
        ? `<line x1="${f1(cx)}" y1="${f1(Math.min(...activeYs))}" x2="${f1(cx)}" y2="${f1(Math.max(...activeYs))}" stroke="${ink.text}" stroke-width="1.8"/>`
        : '';
      const dots = c.mask.map((m, ri) => {
        const cy = yMatTop + (ri + 0.5) * rowH;
        return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="4.2" fill="${m ? (ci === 0 ? ink.opposite : ink.primary) : '#E2E8F0'}"/>`;
      }).join('');
      return conn + dots;
    }).join('');
    return {
      title: '多重抱怨痛点交集 UpSet 矩阵图',
      badge: '复合痛点 · n=506',
      body: `<line x1="${x0}" y1="${yBarBot}" x2="${x0 + combos.length * colW}" y2="${yBarBot}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + topBars + leftSetBars + matrix
        + txt(90, 125, '单集规模', { size: 6.7, fill: ink.muted, anchor: 'middle' })
        + txt(x0 + 108, 218, '痛点共现组合方式', { size: 7.2, fill: ink.muted, anchor: 'middle' }),
    };
  },

  treemap: (ink: ResolvedInk) => {
    const rects = [
      { x: 24, y: 42, w: 146, h: 112, c: ink.primary, lbl: '核心功能体验', pct: '42.4%' },
      { x: 24, y: 157, w: 146, h: 52, c: ink.accent4, lbl: '社区互动推荐', pct: '16.8%' },
      { x: 173, y: 42, w: 96, h: 98, c: ink.secondary, lbl: '价格透明感知', pct: '21.5%' },
      { x: 272, y: 42, w: 68, h: 98, c: ink.opposite, lbl: '售后兜底', pct: '11.2%' },
      { x: 173, y: 143, w: 108, h: 66, c: ink.accent5, lbl: '隐私合规保障', pct: '5.1%' },
      { x: 284, y: 143, w: 56, h: 66, c: ink.muted, lbl: '其他', pct: '3.0%' },
    ];
    return {
      title: '开放题文本主题权重矩形树图',
      badge: 'LDA 6大主题 · 100%',
      body: rects.map(r =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="${r.c}" fill-opacity="0.82" stroke="${ink.canvas}" stroke-width="1.2"/>`
        + txt(r.x + 7, r.y + 15, r.lbl, { size: r.w > 80 ? 8 : 7, weight: 700, fill: '#FFFFFF' })
        + txt(r.x + 7, r.y + 28, r.pct, { size: 7.4, weight: 600, fill: '#FFFFFF', opacity: 0.9 }),
      ).join(''),
    };
  },

  funnel: (ink: ResolvedInk) => {
    const stages = [
      ['发放问卷总量', 620, 1.0, '100%'],
      ['实际回收量', 568, 0.88, '91.6%'],
      ['通过注意力题', 524, 0.76, '84.5%'],
      ['剔除极速/直线', 506, 0.64, '81.6%'],
      ['高采纳意愿群', 312, 0.44, '50.3%'],
    ] as const;
    const cx = 148, y0 = 44, rowH = 32, maxW = 216;
    const traps = stages.map(([lbl, n, wRatio, pct], i) => {
      const yT = y0 + i * rowH, yB = yT + rowH - 3;
      const wT = maxW * wRatio, nextRatio = i < stages.length - 1 ? stages[i + 1][2] : wRatio * 0.78;
      const wB = maxW * nextRatio;
      const c = mixHex(ink.primary, ink.secondary, i / 4);
      const pts: [number, number][] = [[cx - wT / 2, yT], [cx + wT / 2, yT], [cx + wB / 2, yB], [cx - wB / 2, yB]];
      return `<polygon points="${polyStr(pts)}" fill="${c}" fill-opacity="${f2(0.86 - i * 0.08)}" stroke="${ink.surface}" stroke-width="0.9"/>`
        + txt(cx, (yT + yB) / 2 + 2.5, `${lbl} (${n})`, { size: 7.4, weight: 700, fill: '#FFFFFF', anchor: 'middle' })
        + txt(cx + wT / 2 + 12, (yT + yB) / 2 + 2.5, `留存 ${pct}`, { size: 7.2, weight: 600, fill: c });
    }).join('');
    return {
      title: '问卷四步质控清洗与转化漏斗',
      badge: '有效回收率 81.6%',
      body: traps,
    };
  },

  waffle: (ink: ResolvedInk) => {
    const cols = 10, rows = 10, sz = 11.5, gap = 2.5, x0 = 48, y0 = 46;
    let cells = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = (rows - 1 - r) * cols + c;
        const fill = idx < 54 ? ink.primary : idx < 82 ? ink.secondary : '#CBD5E1';
        cells += `<rect x="${f1(x0 + c * (sz + gap))}" y="${f1(y0 + r * (sz + gap))}" width="${sz}" height="${sz}" rx="2" fill="${fill}" fill-opacity="0.88"/>`;
      }
    }
    const items = [
      { lbl: '积极采纳意愿', pct: '54%', n: '273人', c: ink.primary, y: 74 },
      { lbl: '有条件观望态', pct: '28%', n: '142人', c: ink.secondary, y: 112 },
      { lbl: '暂不考虑使用', pct: '18%', n: '91人', c: '#94A3B8', y: 150 },
    ];
    const side = items.map(it =>
      `<rect x="208" y="${it.y - 8}" width="11" height="11" rx="2.5" fill="${it.c}"/>`
      + txt(224, it.y, it.lbl, { size: 8, weight: 600, fill: ink.text })
      + txt(224, it.y + 13, `${it.pct} · ${it.n}`, { size: 7.4, weight: 700, fill: it.c }),
    ).join('');
    return {
      title: '受访者采纳态度 10×10 华夫格图',
      badge: '每格=1% · n=506',
      body: cells + side + txt(118, 198, '共 100 单位格 (总计 100%)', { size: 7.1, fill: ink.muted, anchor: 'middle' }),
    };
  },

  sunburst: (ink: ResolvedInk) => {
    const cx = 148, cy = 126;
    const inner = [
      { lbl: '高价值群', a0: 0, a1: 162, c: ink.primary },
      { lbl: '观望群', a0: 162, a1: 288, c: ink.secondary },
      { lbl: '保守群', a0: 288, a1: 360, c: ink.opposite },
    ];
    const outer = [
      { lbl: '通勤刚需 26%', a0: 0, a1: 94, c: lightenHex(ink.primary, 0.16) },
      { lbl: '高频复购 19%', a0: 94, a1: 162, c: lightenHex(ink.primary, 0.34) },
      { lbl: '价格敏感 20%', a0: 162, a1: 234, c: lightenHex(ink.secondary, 0.18) },
      { lbl: '体验疑虑 15%', a0: 234, a1: 288, c: lightenHex(ink.secondary, 0.38) },
      { lbl: '数字鸿沟 12%', a0: 288, a1: 331, c: lightenHex(ink.opposite, 0.2) },
      { lbl: '低需求 8%', a0: 331, a1: 360, c: lightenHex(ink.opposite, 0.42) },
    ];
    const r1 = inner.map(s => {
      const [lx, ly] = polarXY(cx, cy, 34, (s.a0 + s.a1) / 2);
      return `<path d="${arcPath(cx, cy, 20, 48, s.a0 + 0.8, s.a1 - 0.8)}" fill="${s.c}" stroke="${ink.canvas}" stroke-width="1"/>`
        + txt(lx, ly + 2.5, s.lbl, { size: 6.7, weight: 700, fill: '#FFFFFF', anchor: 'middle' });
    }).join('');
    const r2 = outer.map(s => {
      const mid = (s.a0 + s.a1) / 2;
      const [lx, ly] = polarXY(cx, cy, 78, mid);
      const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
      return `<path d="${arcPath(cx, cy, 49, 68, s.a0 + 0.6, s.a1 - 0.6)}" fill="${s.c}" stroke="${ink.canvas}" stroke-width="1"/>`
        + txt(lx, ly + 2.5, s.lbl, { size: 6.8, weight: 600, fill: ink.text, anchor });
    }).join('');
    return {
      title: '人群分层与子类构成双环旭日图',
      badge: '3主类×6子类 · n=506',
      body: r1 + r2 + txt(cx, cy + 2.5, 'n=506', { size: 7.6, weight: 700, fill: ink.text, anchor: 'middle' }),
    };
  },

  alluvial: (ink: ResolvedInk) => {
    const xs = [48, 174, 300];
    const cols = [
      [{ y: 48, h: 48, lbl: '高意愿 35%', c: ink.primary }, { y: 102, h: 56, lbl: '中立观望 40%', c: ink.secondary }, { y: 164, h: 34, lbl: '抵触 25%', c: ink.opposite }],
      [{ y: 48, h: 72, lbl: '明确采纳 52%', c: ink.primary }, { y: 126, h: 46, lbl: '待体验 32%', c: ink.secondary }, { y: 178, h: 20, lbl: '放弃 16%', c: ink.opposite }],
      [{ y: 48, h: 86, lbl: '实际转化 61%', c: ink.primary }, { y: 140, h: 38, lbl: '间歇用 26%', c: ink.secondary }, { y: 184, h: 14, lbl: '流失 13%', c: ink.opposite }],
    ];
    const flows = [
      [48, 72, 174, 72, 38, ink.primary],
      [48, 120, 174, 98, 22, ink.primary],
      [48, 142, 174, 146, 26, ink.secondary],
      [48, 178, 174, 162, 12, ink.secondary],
      [48, 188, 174, 188, 14, ink.opposite],
      [174, 84, 300, 86, 62, ink.primary],
      [174, 142, 300, 118, 16, ink.primary],
      [174, 156, 300, 158, 26, ink.secondary],
      [174, 188, 300, 191, 12, ink.opposite],
    ] as const;
    const bands = flows.map(([x1, y1, x2, y2, w, c]) => {
      const mx = (x1 + x2) / 2;
      return `<path d="M ${x1 + 10} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" stroke="${c}" stroke-opacity="0.28" stroke-width="${w}"/>`;
    }).join('');
    const strata = cols.flatMap((col, ci) => col.map(b =>
      `<rect x="${xs[ci]}" y="${b.y}" width="10" height="${b.h}" rx="2" fill="${b.c}"/>`
      + txt(ci === 2 ? xs[ci] - 4 : xs[ci] + 14, b.y + b.h / 2 + 2.5, b.lbl, { size: 6.9, weight: 600, fill: ink.text, anchor: ci === 2 ? 'end' : 'start' }),
    )).join('');
    return {
      title: '政策激励前后态度迁移冲积图',
      badge: '三阶段转化 · +26pp',
      body: txt(48, 40, '基线态度', { size: 7.2, weight: 700, fill: ink.muted })
        + txt(179, 40, '补贴激励后', { size: 7.2, weight: 700, fill: ink.muted, anchor: 'middle' })
        + txt(310, 40, '最终留存', { size: 7.2, weight: 700, fill: ink.muted, anchor: 'end' })
        + bands + strata,
    };
  },

  kaya_carbon_bridge: (ink: ResolvedInk) => {
    const steps = [
      { lbl: '基期20', s: 0, e: 100.0, kind: 'base', tag: '100.0' },
      { lbl: '人口ΔCp', s: 100.0, e: 104.2, kind: 'pos', tag: '+4.2' },
      { lbl: '经济ΔCg', s: 104.2, e: 141.0, kind: 'pos', tag: '+36.8' },
      { lbl: '结构ΔCs', s: 141.0, e: 133.6, kind: 'neg', tag: '-7.4' },
      { lbl: '能效ΔCe', s: 133.6, e: 122.4, kind: 'neg', tag: '-11.2' },
      { lbl: '因子ΔCf', s: 122.4, e: 118.4, kind: 'neg', tag: '-4.0' },
      { lbl: '末期25', s: 0, e: 118.4, kind: 'base', tag: '118.4' },
    ] as const;
    const x0 = 46, y0 = 48, x1 = 338, y1 = 190;
    const yMap = (v: number) => y1 - (v / 160) * (y1 - y0);
    const yTicks = [0, 40, 80, 120, 160].map(v => ({ pos: yMap(v), label: `${v}` }));
    const stepW = (x1 - x0) / steps.length;
    const xTicks = steps.map((st, i) => ({ pos: x0 + (i + 0.5) * stepW, label: st.lbl }));
    const bars = steps.map((st, i) => {
      const cx = xTicks[i].pos, yA = yMap(st.s), yB = yMap(st.e);
      const top = Math.min(yA, yB), bh = Math.max(2.5, Math.abs(yA - yB));
      const c = st.kind === 'base' ? ink.secondary : st.kind === 'pos' ? ink.opposite : ink.primary;
      const conn = i < steps.length - 1
        ? `<line x1="${f1(cx + 12)}" y1="${f1(yB)}" x2="${f1(xTicks[i + 1].pos - 12)}" y2="${f1(yB)}" stroke="${ink.muted}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        : '';
      return `<rect x="${f1(cx - 12)}" y="${f1(top)}" width="24" height="${f1(bh)}" rx="2" fill="${c}" fill-opacity="0.82"/>`
        + txt(cx, top - 3.5, st.tag, { size: 6.9, weight: 700, fill: c, anchor: 'middle' })
        + conn;
    }).join('');
    return {
      title: 'Kaya / LMDI 碳排放全要素增量桥接分解',
      badge: '净增量 +18.4 Mt · 零残差',
      body: legendChips([{ label: '起止总量', color: ink.secondary, kind: 'box' }, { label: '增排驱动 (+ΔC)', color: ink.opposite, kind: 'box' }, { label: '减排贡献 (-ΔC)', color: ink.primary, kind: 'box' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '碳排放量 (MtCO₂)' }, ink)
        + bars
        + pill(334, 48, 'LMDI: ΣΔCi = ΔC', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.7, h: 14, align: 'right' }),
    };
  },

  duck_curve_dispatch: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (h: number) => x0 + (h / 24) * (x1 - x0);
    const yMap = (gw: number) => y1 - (gw / 60) * (y1 - y0);
    const xTicks = [0, 4, 8, 12, 16, 20, 24].map(h => ({ pos: xMap(h), label: `${h}h` }));
    const yTicks = [0, 15, 30, 45, 60].map(gw => ({ pos: yMap(gw), label: String(gw) }));
    const hrs = Array.from({ length: 25 }, (_, i) => i);
    const gross = (h: number) => 31 - 4.5 * Math.cos((Math.PI * (h - 2)) / 12) + 8 * Math.exp(-(((h - 10.5) / 3.8) ** 2)) + 15 * Math.exp(-(((h - 19.5) / 2.6) ** 2));
    const pv = (h: number) => (h >= 6 && h <= 19 ? 26 * Math.exp(-(((h - 12.8) / 2.6) ** 2)) : 0);
    const bess = (h: number) => 8.2 * Math.exp(-(((h - 12.8) / 1.9) ** 2)) - 10.2 * Math.exp(-(((h - 19.5) / 1.8) ** 2));
    const gPts: [number, number][] = hrs.map(h => [xMap(h), yMap(gross(h))]);
    const nPts: [number, number][] = hrs.map(h => [xMap(h), yMap(gross(h) - pv(h))]);
    const sPts: [number, number][] = hrs.map(h => [xMap(h), yMap(gross(h) - pv(h) + bess(h))]);
    return {
      title: '高比例光伏净负荷“鸭子曲线”调度',
      badge: '晚峰爬坡 -38% · BESS削峰',
      body: legendChips([
        { label: '总用电负荷', color: ink.axis, kind: 'dash' },
        { label: '光伏净负荷', color: ink.primary, kind: 'line' },
        { label: '储能削峰后', color: ink.opposite, kind: 'line' },
        { label: '光伏消纳', color: ink.secondary, kind: 'box' },
      ], 44, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '电力负荷 (GW)', xTitle: '日内运行小时 (0–24h 光伏出力与储能谷充峰放)' }, ink)
        + bandPolygon(gPts.slice(6, 20), nPts.slice(6, 20), ink.secondary, 0.14)
        + bandPolygon(sPts.slice(10, 16), nPts.slice(10, 16), ink.primary, 0.20)
        + bandPolygon(nPts.slice(17, 23), sPts.slice(17, 23), ink.opposite, 0.22)
        + `<path d="${smoothCurvePath(gPts)}" stroke="${ink.axis}" stroke-width="1.4" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(nPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + `<path d="${smoothCurvePath(sPts)}" stroke="${ink.opposite}" stroke-width="2.1"/>`
        + txt(xMap(12.8), yMap(7.2), '午间谷充消纳', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'middle' })
        + pill(xMap(20.2), yMap(57.5), '晚峰爬坡降 38%', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.5, h: 13.5, align: 'center' }),
    };
  },

  // =========================================================================
  // 5. CAUSAL & ECONOMETRICS (计量与因果推断) - 34 types
  // =========================================================================
  did_event: (ink: ResolvedInk) => {
    const periods = ['-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4'];
    const betas = [-0.04, 0.03, -0.02, 0.0, 0.18, 0.34, 0.45, 0.51, 0.48];
    const cis = [0.11, 0.10, 0.09, 0.0, 0.10, 0.11, 0.12, 0.12, 0.13];
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - ((v + 0.3) / 1.0) * (y1 - y0);
    const yTicks = [-0.2, 0, 0.2, 0.4, 0.6].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xTicks = evenlySpacedTicks(x0 + 18, x1 - 18, periods);
    const yZero = yMap(0);
    const xShock = (xTicks[3].pos + xTicks[4].pos) / 2;
    const topPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(betas[i] + cis[i])]);
    const botPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(betas[i] - cis[i])]);
    const pts = xTicks.map((t, i) => {
      const cy = yMap(betas[i]), c = i >= 4 ? ink.primary : ink.muted;
      return (cis[i] > 0 ? errV(t.pos, topPts[i][1], botPts[i][1], c, 3.2) : '')
        + `<circle cx="${f1(t.pos)}" cy="${f1(cy)}" r="3.4" fill="${i === 3 ? ink.surface : c}" stroke="${c}" stroke-width="1.3"/>`;
    }).join('');
    return {
      title: '事件研究法 DID 平行趋势与动态效应',
      badge: 'Pre p=0.68 · Post***',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '政策处理效应 βt', xTitle: '相对政策冲击期数 (t=-1 为基期)' }, ink)
        + `<rect x="${f1(xShock)}" y="${y0}" width="${f1(x1 - xShock)}" height="${y1 - y0}" fill="${ink.primary}" fill-opacity="0.06"/>`
        + `<line x1="${x0}" y1="${f1(yZero)}" x2="${x1}" y2="${f1(yZero)}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + `<line x1="${f1(xShock)}" y1="${y0}" x2="${f1(xShock)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(xShock + 4, y0 + 10, '试点实施冲击', { size: 6.9, weight: 700, fill: ink.opposite })
        + bandPolygon(topPts, botPts, ink.primary, 0.14)
        + `<polyline points="${polyStr(xTicks.map((t, i) => [t.pos, yMap(betas[i])]))}" stroke="${ink.primary}" stroke-width="1.6"/>`
        + pts,
    };
  },

  rdd: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const xTicks = [-30, -15, 0, 15, 30].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [2.0, 2.5, 3.0, 3.5, 4.0].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(1) }));
    const xc = (x0 + x1) / 2;
    const leftCurve: [number, number][] = [[54, 168], [86, 158], [122, 148], [156, 138], [xc - 2, 132]];
    const rightCurve: [number, number][] = [[xc + 2, 86], [224, 80], [258, 72], [292, 66], [326, 62]];
    const dotsL: [number, number][] = [[64, 164], [78, 172], [96, 154], [112, 152], [128, 144], [144, 146], [162, 136], [176, 130], [184, 136]];
    const dotsR: [number, number][] = [[198, 84], [210, 92], [226, 78], [242, 84], [258, 70], [274, 76], [290, 64], [306, 70], [320, 60]];
    return {
      title: '断点回归 (RDD) 阈值跳跃局部拟合',
      badge: 'τ=+0.46*** · h=12',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '结果变量 Y', xTitle: '驱动变量中心化 (X - c)' }, ink)
        + `<line x1="${f1(xc)}" y1="${y0}" x2="${f1(xc)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="3.5 2.5"/>`
        + bandPolygon(leftCurve.map(([x, y]) => [x, y - 9]), leftCurve.map(([x, y]) => [x, y + 9]), ink.secondary, 0.16)
        + bandPolygon(rightCurve.map(([x, y]) => [x, y - 9]), rightCurve.map(([x, y]) => [x, y + 9]), ink.primary, 0.18)
        + `<path d="${smoothCurvePath(leftCurve)}" stroke="${ink.secondary}" stroke-width="2"/>`
        + `<path d="${smoothCurvePath(rightCurve)}" stroke="${ink.primary}" stroke-width="2"/>`
        + dotsL.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${ink.secondary}" fill-opacity="0.72"/>`).join('')
        + dotsR.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${ink.primary}" fill-opacity="0.78"/>`).join('')
        + `<line x1="${f1(xc + 8)}" y1="86" x2="${f1(xc + 8)}" y2="132" stroke="${ink.opposite}" stroke-width="1.5"/>`
        + txt(xc + 13, 112, 'LATE τ = +0.46', { size: 7.2, weight: 700, fill: ink.opposite }),
    };
  },

  rdd_local_poly: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + ((v + 30) / 60) * (x1 - x0);
    const yMap = (v: number) => y1 - ((v - 2.0) / 2.5) * (y1 - y0);
    const xTicks = [-30, -15, 0, 15, 30].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const fL = (x: number) => 2.98 + 0.015 * x - 0.00018 * x * x;
    const fR = (x: number) => 3.64 + 0.022 * x - 0.00022 * x * x;
    const xsL = [-28, -23, -18, -13, -8, -4, -0.5];
    const xsR = [0.5, 4, 8, 13, 18, 23, 28];
    const cL: [number, number][] = xsL.map(x => [xMap(x), yMap(fL(x))]);
    const cR: [number, number][] = xsR.map(x => [xMap(x), yMap(fR(x))]);
    const ciBand = (x: number) => 0.11 + 0.0018 * Math.abs(x);
    const topL: [number, number][] = xsL.map(x => [xMap(x), yMap(fL(x) + ciBand(x))]);
    const botL: [number, number][] = xsL.map(x => [xMap(x), yMap(fL(x) - ciBand(x))]);
    const topR: [number, number][] = xsR.map(x => [xMap(x), yMap(fR(x) + ciBand(x))]);
    const botR: [number, number][] = xsR.map(x => [xMap(x), yMap(fR(x) - ciBand(x))]);
    const binL: [number, number][] = [
      [-26, 2.48], [-22, 2.52], [-18, 2.67], [-14, 2.71], [-10, 2.83], [-6, 2.86], [-2.5, 2.96],
    ];
    const binR: [number, number][] = [
      [2.5, 3.68], [6, 3.74], [10, 3.85], [14, 3.89], [18, 3.98], [22, 4.00], [26, 4.09],
    ];
    const xc = xMap(0), hL = xMap(-14), hR = xMap(14);
    return {
      title: 'Sharp RDD 局部多项式断点回归',
      badge: 'p=2 三角核 · h*=14',
      body: legendChips([
        { label: '分箱均值', color: ink.secondary, kind: 'dot' },
        { label: '二次局部多项式 (95%CI)', color: ink.primary, kind: 'line' },
        { label: 'CCT 最优带宽 [-h*,+h*]', color: ink.primary, kind: 'box' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '结果变量 Y', xTitle: '中心化分配变量 (X - c0)' }, ink)
        + `<rect x="${f1(hL)}" y="${y0}" width="${f1(hR - hL)}" height="${y1 - y0}" fill="${ink.primarySoft}" fill-opacity="0.34"/>`
        + `<line x1="${f1(hL)}" y1="${y0}" x2="${f1(hL)}" y2="${y1}" stroke="${ink.primary}" stroke-width="0.8" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(hR)}" y1="${y0}" x2="${f1(hR)}" y2="${y1}" stroke="${ink.primary}" stroke-width="0.8" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(xc)}" y1="${y0}" x2="${f1(xc)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="3.5 2"/>`
        + bandPolygon(topL, botL, ink.secondary, 0.18)
        + bandPolygon(topR, botR, ink.primary, 0.2)
        + `<path d="${smoothCurvePath(cL)}" stroke="${ink.secondary}" stroke-width="2.1"/>`
        + `<path d="${smoothCurvePath(cR)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + binL.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.8" fill="${ink.secondary}" fill-opacity="0.82" stroke="${ink.surface}" stroke-width="0.7"/>`).join('')
        + binR.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.8" fill="${ink.primary}" fill-opacity="0.86" stroke="${ink.surface}" stroke-width="0.7"/>`).join('')
        + `<line x1="${f1(xc + 5)}" y1="${f1(yMap(2.98))}" x2="${f1(xc + 5)}" y2="${f1(yMap(3.64))}" stroke="${ink.opposite}" stroke-width="1.6"/>`
        + txt(xc + 10, yMap(3.31) + 2, 'τ=+0.66***', { size: 7.0, weight: 700, fill: ink.opposite })
        + pill(330, 173, '0.5h*:+0.64 | 1.5h*:+0.67', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.4, h: 13.5, align: 'right' }),
    };
  },

  synthetic_control: (ink: ResolvedInk) => {
    const yrs = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
    const treat = [42, 46, 49, 53, 58, 69, 78, 86];
    const synth = [41, 47, 48, 53, 55, 58, 61, 64];
    const x0 = 44, y0 = 48, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - ((v - 30) / 65) * (y1 - y0);
    const yTicks = [30, 45, 60, 75, 90].map(v => ({ pos: yMap(v), label: `${v}` }));
    const xTicks = evenlySpacedTicks(x0 + 16, x1 - 16, yrs);
    const tPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(treat[i])]);
    const sPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(synth[i])]);
    const xInt = xTicks[3].pos + 18;
    return {
      title: '合成控制法 (SCM) 处理组 vs 合成轨迹',
      badge: 'RMSPE=0.024 · +22pt',
      body: legendChips([{ label: '实际试点区', color: ink.primary, kind: 'line' }, { label: '合成控制对照', color: ink.opposite, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '指标指数', xTitle: '年份' }, ink)
        + bandPolygon(tPts.slice(4), sPts.slice(4), ink.primary, 0.14)
        + `<line x1="${f1(xInt)}" y1="${y0}" x2="${f1(xInt)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.1" stroke-dasharray="3.5 2.5"/>`
        + txt(xInt + 4, y0 + 10, '2022 试点', { size: 6.9, fill: ink.axis })
        + `<polyline points="${polyStr(sPts)}" stroke="${ink.opposite}" stroke-width="1.8" stroke-dasharray="4 2.5"/>`
        + `<polyline points="${polyStr(tPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + txt(xTicks[7].pos - 4, tPts[7][1] - 6, '+22.0', { size: 7.2, weight: 700, fill: ink.primary, anchor: 'end' }),
    };
  },

  synthetic_placebo: (ink: ResolvedInk) => {
    const yrs = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
    const x0 = 46, y0 = 44, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - ((v + 15) / 45) * (y1 - y0);
    const yTicks = [-10, 0, 10, 20, 30].map(v => ({ pos: yMap(v), label: `${v > 0 ? '+' : ''}${v}` }));
    const xTicks = evenlySpacedTicks(x0 + 16, x1 - 16, yrs);
    const placebos = [
      [0.4, -0.6, 0.8, -0.4, 2.1, 3.8, 2.5, 4.1],
      [-0.5, 0.8, -0.7, 0.5, -1.8, -4.2, -5.1, -3.6],
      [0.2, 0.4, -0.3, 0.2, 1.4, -1.6, -2.8, -4.4],
      [-0.3, -0.2, 0.6, -0.5, 4.2, 6.4, 5.2, 7.1],
      [0.6, -0.4, 0.2, 0.4, -3.1, -6.2, -7.8, -8.5],
      [-0.2, 0.3, -0.4, 0.1, 0.8, 2.1, -1.4, 1.8],
    ];
    const treatGap = [0.2, -0.3, 0.4, -0.1, 4.5, 11.2, 17.6, 22.4];
    const xInt = xTicks[3].pos + 16;
    const pLines = placebos.map(arr => `<polyline points="${polyStr(xTicks.map((t, i) => [t.pos, yMap(arr[i])]))}" stroke="${ink.lightMuted}" stroke-width="1" stroke-opacity="0.72"/>`).join('');
    return {
      title: '合成控制空间安慰剂置换检验',
      badge: '置换 p=0.032 (1/31)',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '处理效应 Gap', xTitle: '观测年份' }, ink)
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(xInt)}" y1="${y0}" x2="${f1(xInt)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + pLines
        + `<polyline points="${polyStr(xTicks.map((t, i) => [t.pos, yMap(treatGap[i])]))}" stroke="${ink.primary}" stroke-width="2.4"/>`
        + pill(246, 56, '试点区显著高于 30 个安慰剂', { bg: ink.primarySoft, stroke: ink.primary, color: ink.primary, size: 7, h: 14, align: 'center' }),
    };
  },

  psm_kde: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 48, x1 = 338, y1 = 192;
    const xTicks = [0, 0.25, 0.5, 0.75, 1.0].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v.toFixed(2) }));
    const yTicks = [0, 1, 2, 3].map((v, i) => ({ pos: y1 - (i / 3) * (y1 - y0), label: `${v}.0` }));
    const xs = Array.from({ length: 32 }, (_, i) => x0 + (i / 31) * (x1 - x0));
    const dCtrl = (x: number) => Math.exp(-(((x - 144) / 48) ** 2)) * 108;
    const dTreat = (x: number) => Math.exp(-(((x - 224) / 50) ** 2)) * 114;
    const pC: [number, number][] = xs.map(x => [x, y1 - dCtrl(x)]);
    const pT: [number, number][] = xs.map(x => [x, y1 - dTreat(x)]);
    return {
      title: 'PSM 倾向得分匹配共同支撑域 KDE',
      badge: '支撑留存 92.4%',
      body: legendChips([{ label: '对照组', color: ink.secondary, kind: 'box' }, { label: '处理组', color: ink.primary, kind: 'box' }, { label: '共同支撑域', color: ink.accent4, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '核密度', xTitle: '倾向得分 P(X)' }, ink)
        + `<rect x="86" y="${y0}" width="194" height="${y1 - y0}" fill="${ink.accent4}" fill-opacity="0.06"/>`
        + `<line x1="86" y1="${y0}" x2="86" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="280" y1="${y0}" x2="280" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(pC)} L ${x1} ${y1} L ${x0} ${y1} Z" fill="${ink.secondary}" fill-opacity="0.22" stroke="${ink.secondary}" stroke-width="1.6"/>`
        + `<path d="${smoothCurvePath(pT)} L ${x1} ${y1} L ${x0} ${y1} Z" fill="${ink.primary}" fill-opacity="0.24" stroke="${ink.primary}" stroke-width="1.8"/>`,
    };
  },

  love_plot: (ink: ResolvedInk) => {
    const covs = [
      ['受访年龄', 0.36, 0.04],
      ['家庭月收入', 0.44, 0.06],
      ['受教育年限', 0.29, 0.03],
      ['数字技能分', 0.41, 0.07],
      ['常住城市层', 0.24, 0.02],
      ['基线态度分', 0.19, 0.05],
    ] as const;
    const x0 = 76, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + (v / 0.5) * (x1 - x0);
    const xTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const xThresh = xMap(0.1);
    const rowH = (y1 - y0) / covs.length;
    const rows = covs.map(([lbl, pre, post], i) => {
      const cy = y0 + (i + 0.5) * rowH;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.3, fill: ink.text, anchor: 'end' })
        + `<line x1="${f1(xMap(post))}" y1="${f1(cy)}" x2="${f1(xMap(pre))}" y2="${f1(cy)}" stroke="${ink.grid}" stroke-width="1.2"/>`
        + `<circle cx="${f1(xMap(pre))}" cy="${f1(cy)}" r="4" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.5"/>`
        + `<circle cx="${f1(xMap(post))}" cy="${f1(cy)}" r="4" fill="${ink.primary}"/>`;
    }).join('');
    return {
      title: '协变量平衡性检验 Love Plot',
      badge: '匹配后 SMD < 0.10',
      body: legendChips([{ label: '匹配前 (Unmatched)', color: ink.opposite, kind: 'dot' }, { label: '匹配后 (Matched)', color: ink.primary, kind: 'dot' }], 76, 40, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '标准化均值差 |SMD|' }, ink)
        + `<line x1="${f1(xThresh)}" y1="${y0}" x2="${f1(xThresh)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(xThresh + 3, y0 + 9, 'SMD=0.10 阈值', { size: 6.8, weight: 700, fill: ink.opposite })
        + rows,
    };
  },

  quantile_reg: (ink: ResolvedInk) => {
    const taus = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const betas = [0.18, 0.24, 0.31, 0.35, 0.39, 0.46, 0.54, 0.61, 0.66];
    const ses = [0.07, 0.06, 0.06, 0.05, 0.05, 0.06, 0.06, 0.07, 0.08];
    const x0 = 44, y0 = 48, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - (v / 0.8) * (y1 - y0);
    const yTicks = [0, 0.2, 0.4, 0.6, 0.8].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xTicks = taus.map((t, i) => ({ pos: x0 + 14 + (i / 8) * (x1 - x0 - 28), label: t.toFixed(1) }));
    const topPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(betas[i] + ses[i] * 1.96)]);
    const botPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(betas[i] - ses[i] * 1.96)]);
    const midPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(betas[i])]);
    const yOls = yMap(0.38);
    return {
      title: '分位数回归条件弹性变化轨迹',
      badge: 'τ=0.1–0.9 · QR异质性',
      body: legendChips([{ label: 'QR 系数与 95%CI', color: ink.primary, kind: 'line' }, { label: 'OLS 均值 β=0.38', color: ink.opposite, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '回归系数 β(τ)', xTitle: '条件分位点 τ' }, ink)
        + `<rect x="${x0}" y="${f1(yOls - 8)}" width="${x1 - x0}" height="16" fill="${ink.opposite}" fill-opacity="0.1"/>`
        + `<line x1="${x0}" y1="${f1(yOls)}" x2="${x1}" y2="${f1(yOls)}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="4 2.5"/>`
        + bandPolygon(topPts, botPts, ink.primary, 0.2)
        + `<polyline points="${polyStr(midPts)}" stroke="${ink.primary}" stroke-width="2"/>`
        + midPts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.8" fill="${ink.primary}"/>`).join(''),
    };
  },

  binscatter_iv: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 338, y1 = 192;
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const yTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}.0` }));
    const bins: [number, number][] = Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      return [x0 + 18 + t * (x1 - x0 - 36), 174 - t * 110 + ((i % 3) - 1) * 4];
    });
    return {
      title: '分箱散点与工具变量 2SLS 拟合',
      badge: '1st F=42.6 > 10',
      body: legendChips([{ label: '2SLS 净效应 (β=0.58**)', color: ink.primary, kind: 'line' }, { label: '朴素 OLS (偏误)', color: ink.muted, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '残差化结果 Y', xTitle: '内生解释变量等频分箱 X' }, ink)
        + `<line x1="62" y1="168" x2="322" y2="76" stroke="${ink.muted}" stroke-width="1.4" stroke-dasharray="4 2.5"/>`
        + `<line x1="62" y1="176" x2="322" y2="62" stroke="${ink.primary}" stroke-width="2.1"/>`
        + bins.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.8" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="1"/>`).join('')
        + pill(56, 56, 'Kleibergen-Paap F=42.6', { bg: ink.primarySoft, stroke: ink.primary, color: ink.primary, size: 7, h: 14 }),
    };
  },

  simple_slope: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 338, y1 = 192;
    const xTicks = [{ pos: x0 + 28, label: '低质量 (-1SD)' }, { pos: (x0 + x1) / 2, label: '均值 (0)' }, { pos: x1 - 28, label: '高质量 (+1SD)' }];
    const yTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}.0` }));
    return {
      title: '调节效应简单斜率交互作用图',
      badge: '交互项 β=0.24**',
      body: legendChips([{ label: '高信任调节 (+1SD)', color: ink.primary, kind: 'line' }, { label: '低信任调节 (-1SD)', color: ink.opposite, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '持续使用意愿', xTitle: '平台服务质量 (标准化)' }, ink)
        + `<line x1="${x0 + 28}" y1="168" x2="${x1 - 28}" y2="62" stroke="${ink.primary}" stroke-width="2.3"/>`
        + `<line x1="${x0 + 28}" y1="146" x2="${x1 - 28}" y2="112" stroke="${ink.opposite}" stroke-width="1.9" stroke-dasharray="4.5 2.5"/>`
        + `<circle cx="${x0 + 28}" cy="168" r="3.5" fill="${ink.primary}"/><circle cx="${x1 - 28}" cy="62" r="3.5" fill="${ink.primary}"/>`
        + `<circle cx="${x0 + 28}" cy="146" r="3.5" fill="${ink.opposite}"/><circle cx="${x1 - 28}" cy="112" r="3.5" fill="${ink.opposite}"/>`
        + txt(x1 - 32, 54, '斜率=0.68***', { size: 7.1, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x1 - 32, 105, '斜率=0.22*', { size: 7.1, weight: 600, fill: ink.opposite, anchor: 'end' }),
    };
  },

  mediation_boot: (ink: ResolvedInk) => {
    const pathBox = `<rect x="34" y="42" width="66" height="24" rx="4" fill="${ink.secondarySoft}" stroke="${ink.secondary}" stroke-width="1"/>`
      + txt(67, 56.5, '认知评价 X', { size: 7.4, weight: 700, fill: ink.secondary, anchor: 'middle' })
      + `<rect x="148" y="42" width="66" height="24" rx="4" fill="${ink.primarySoft}" stroke="${ink.primary}" stroke-width="1"/>`
      + txt(181, 56.5, '系统信任 M', { size: 7.4, weight: 700, fill: ink.primary, anchor: 'middle' })
      + `<rect x="262" y="42" width="66" height="24" rx="4" fill="${ink.oppositeSoft}" stroke="${ink.opposite}" stroke-width="1"/>`
      + txt(295, 56.5, '采纳意愿 Y', { size: 7.4, weight: 700, fill: ink.opposite, anchor: 'middle' })
      + `<line x1="100" y1="54" x2="144" y2="54" stroke="${ink.primary}" stroke-width="1.4"/>` + arrowPoly(147, 54, 0, 5, ink.primary)
      + txt(123, 49, 'a=0.46***', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'middle' })
      + `<line x1="214" y1="54" x2="258" y2="54" stroke="${ink.primary}" stroke-width="1.4"/>` + arrowPoly(261, 54, 0, 5, ink.primary)
      + txt(237, 49, 'b=0.39***', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'middle' })
      + `<path d="M 67 66 Q 181 84, 292 67" stroke="${ink.muted}" stroke-width="1.1" stroke-dasharray="3 2"/>`
      + txt(181, 82, '直接效应 c\'=0.21* (中介占比 46.1%)', { size: 6.9, weight: 600, fill: ink.axis, anchor: 'middle' });
    const x0 = 46, y0 = 96, x1 = 336, y1 = 194;
    const xTicks = [0, 0.1, 0.2, 0.3].map((v, i) => ({ pos: x0 + 26 + (i / 3) * (x1 - x0 - 52), label: v.toFixed(1) }));
    const hist = [3, 8, 18, 36, 58, 76, 82, 68, 44, 24, 10, 4];
    const bw = (x1 - x0 - 40) / hist.length;
    const bars = hist.map((v, i) => {
      const bx = x0 + 26 + i * bw;
      const inCi = i >= 2 && i <= 9;
      return `<rect x="${f1(bx + 1)}" y="${f1(y1 - v)}" width="${f1(bw - 2)}" height="${v}" fill="${inCi ? ink.primary : ink.lightMuted}" fill-opacity="${inCi ? 0.56 : 0.35}"/>`;
    }).join('');
    return {
      title: '中介路径分解与 Bootstrap 分布',
      badge: '5000次 · 95%CI不含0',
      body: pathBox
        + axesFrame({ x0, y0, x1, y1, xTicks, hGrid: false, xTitle: '间接效应 a×b 抽样分布 [0.11, 0.26]' }, ink)
        + bars
        + `<line x1="${xTicks[0].pos}" y1="${y0}" x2="${xTicks[0].pos}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(xTicks[0].pos + 4, y0 + 10, '零点线 (0)', { size: 6.8, weight: 700, fill: ink.opposite }),
    };
  },

  panel_fe_forest: (ink: ResolvedInk) => {
    const specs = [
      ['基准 OLS 混合', 0.44, 0.08, '(0.28–0.60)'],
      ['个体固定效应 FE', 0.41, 0.07, '(0.27–0.55)'],
      ['双向固定效应 TWFE', 0.38, 0.06, '(0.26–0.50)'],
      ['区县聚类稳健 SE', 0.38, 0.08, '(0.22–0.54)'],
      ['滞后一阶工具变量', 0.45, 0.11, '(0.23–0.67)'],
    ] as const;
    const x0 = 96, y0 = 44, x1 = 266, y1 = 192;
    const xMap = (v: number) => x0 + (v / 0.8) * (x1 - x0);
    const xTicks = [0, 0.2, 0.4, 0.6, 0.8].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const rowH = (y1 - y0) / specs.length;
    const rows = specs.map(([lbl, b, ci, txtCi], i) => {
      const cy = y0 + (i + 0.5) * rowH, cx = xMap(b), xl = xMap(b - ci), xr = xMap(b + ci);
      const c = i === 2 ? ink.opposite : ink.primary;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.1, weight: i === 2 ? 700 : 500, fill: ink.text, anchor: 'end' })
        + errH(cy, xl, xr, c, 3)
        + `<rect x="${f1(cx - 3.5)}" y="${f1(cy - 3.5)}" width="7" height="7" rx="1" fill="${c}"/>`
        + txt(274, cy + 2.5, `${b.toFixed(2)}*** ${txtCi}`, { size: 6.9, weight: 600, fill: c });
    }).join('');
    return {
      title: '多模型规格固定效应稳健性森林图',
      badge: '5种规格高度稳健',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '核心解释变量回归系数 β (95%CI)' }, ink)
        + `<line x1="${f1(xMap(0))}" y1="${y0}" x2="${f1(xMap(0))}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3 2"/>`
        + txt(274, 39, 'β (95% CI)', { size: 7, weight: 700, fill: ink.muted })
        + rows,
    };
  },

  mccrary_density: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const xc = (x0 + x1) / 2;
    const xTicks = [-20, -10, 0, 10, 20].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [0, 0.02, 0.04, 0.06].map((v, i) => ({ pos: y1 - (i / 3) * (y1 - y0), label: v.toFixed(2) }));
    const lBars = [18, 28, 44, 66, 84, 96, 102];
    const rBars = [100, 94, 82, 68, 46, 32, 20];
    const bw = (x1 - x0) / 14;
    const bars = [...lBars, ...rBars].map((h, i) => {
      const bx = x0 + i * bw, c = i < 7 ? ink.secondary : ink.primary;
      return `<rect x="${f1(bx + 1)}" y="${f1(y1 - h)}" width="${f1(bw - 2)}" height="${h}" fill="${c}" fill-opacity="0.22"/>`;
    }).join('');
    const cL: [number, number][] = [[54, 174], [94, 148], [138, 108], [xc - 2, 86]];
    const cR: [number, number][] = [[xc + 2, 89], [238, 112], [282, 148], [326, 172]];
    return {
      title: 'McCrary 驱动变量密度连续性检验',
      badge: 'θ=0.04 · p=0.72 无操纵',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '样本密度 f(x)', xTitle: '断点居中变量 (X - c)' }, ink)
        + bars
        + bandPolygon(cL.map(([x, y]) => [x, y - 9]), cL.map(([x, y]) => [x, y + 9]), ink.secondary, 0.22)
        + bandPolygon(cR.map(([x, y]) => [x, y - 9]), cR.map(([x, y]) => [x, y + 9]), ink.primary, 0.22)
        + `<path d="${smoothCurvePath(cL)}" stroke="${ink.secondary}" stroke-width="2"/>`
        + `<path d="${smoothCurvePath(cR)}" stroke="${ink.primary}" stroke-width="2"/>`
        + `<line x1="${f1(xc)}" y1="${y0}" x2="${f1(xc)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2.5"/>`
        + pill(xc, 50, '断点两侧置信带重合 · 无人为操纵', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 7, h: 14, align: 'center' }),
    };
  },

  its_interrupted_ts: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (t: number) => x0 + ((t - 1) / 23) * (x1 - x0);
    const yMap = (y: number) => y1 - ((y - 30) / 60) * (y1 - y0);
    const xTicks = [1, 6, 12.5, 18, 24].map((v, i) => ({ pos: xMap(v), label: ['T-12', 'T-6', 'T₀干预', 'T+6', 'T+12'][i] }));
    const yTicks = [30, 45, 60, 75, 90].map(v => ({ pos: yMap(v), label: `${v}` }));
    const xShock = xMap(12.5);
    const preTs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const postTs = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const preFn = (t: number) => 41.5 + 0.88 * t;
    const postFn = (t: number) => 41.5 + 0.88 * t + 7.2 + 1.04 * (t - 12.5);
    const preLine: [number, number][] = preTs.map(t => [xMap(t), yMap(preFn(t))]);
    const cfLine: [number, number][] = [12, ...postTs].map(t => [xMap(t), yMap(preFn(t))]);
    const postLine: [number, number][] = postTs.map(t => [xMap(t), yMap(postFn(t))]);
    const preObs: [number, number][] = preTs.map((t, i) => [xMap(t), yMap(preFn(t) + ((i % 3) - 1) * 1.8)]);
    const postObs: [number, number][] = postTs.map((t, i) => [xMap(t), yMap(postFn(t) + (((i + 1) % 3) - 1) * 2.0)]);
    const yPreEnd = yMap(preFn(13)), yPostStart = yMap(postFn(13));
    return {
      title: '间断时间序列 (ITS) 瞬时跃迁与斜率变迁',
      badge: 'β₂=+7.2*** · β₃=+1.04**',
      body: legendChips([{ label: '干预前拟合', color: ink.secondary, kind: 'line' }, { label: '干预后分段拟合', color: ink.primary, kind: 'line' }, { label: '反事实外推', color: ink.muted, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '观测指标 Yt', xTitle: '相对政策干预时间序列 (月)' }, ink)
        + `<rect x="${f1(xShock)}" y="${y0}" width="${f1(x1 - xShock)}" height="${y1 - y0}" fill="${ink.primary}" fill-opacity="0.06"/>`
        + `<line x1="${f1(xShock)}" y1="${y0}" x2="${f1(xShock)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + bandPolygon(preLine.map(([x, y]) => [x, y - 7]), preLine.map(([x, y]) => [x, y + 7]), ink.secondary, 0.16)
        + bandPolygon(postLine.map(([x, y]) => [x, y - 8]), postLine.map(([x, y]) => [x, y + 8]), ink.primary, 0.18)
        + `<polyline points="${polyStr(cfLine)}" stroke="${ink.muted}" stroke-width="1.4" stroke-dasharray="4 2.5"/>`
        + `<polyline points="${polyStr(preLine)}" stroke="${ink.secondary}" stroke-width="2"/>`
        + `<polyline points="${polyStr(postLine)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + preObs.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.2" fill="${ink.secondary}" fill-opacity="0.78"/>`).join('')
        + postObs.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.3" fill="${ink.primary}" fill-opacity="0.82"/>`).join('')
        + `<line x1="${f1(xMap(13) - 3)}" y1="${f1(yPreEnd)}" x2="${f1(xMap(13) - 3)}" y2="${f1(yPostStart)}" stroke="${ink.opposite}" stroke-width="1.6"/>`
        + txt(xMap(13) + 4, (yPreEnd + yPostStart) / 2 - 7, '瞬时跃迁 β₂=+7.2', { size: 6.9, weight: 700, fill: ink.opposite })
        + txt(x1 - 4, yMap(preFn(24)) + 10, '反事实基线斜率', { size: 6.7, fill: ink.muted, anchor: 'end' }),
    };
  },

  diff_in_disc: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xc = (x0 + x1) / 2;
    const xTicks = [-20, -10, 0, 10, 20].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v === 0 ? '0(c₀)' : `${v}` }));
    const yTicks = [2.0, 2.6, 3.2, 3.8, 4.4].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(1) }));
    const preL: [number, number][] = [[54, 168], [96, 160], [140, 152], [xc - 2, 148]];
    const preR: [number, number][] = [[xc + 2, 140], [234, 134], [280, 128], [326, 122]];
    const postL: [number, number][] = [[54, 146], [96, 138], [140, 130], [xc - 2, 125]];
    const postR: [number, number][] = [[xc + 2, 82], [234, 76], [280, 70], [326, 64]];
    return {
      title: '断点差分法 (Diff-in-Disc) 双期局部拟合',
      badge: 'Δτ = +0.42*** · h=12',
      body: legendChips([{ label: '干预后 (t=1 · τ_post=+0.52)', color: ink.primary, kind: 'line' }, { label: '基线期 (t=0 · τ_pre=+0.10)', color: ink.secondary, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '结果条件均值 Y', xTitle: '中心化驱动变量 (X - c₀)' }, ink)
        + `<line x1="${f1(xc)}" y1="${y0}" x2="${f1(xc)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + bandPolygon(postL.map(([x, y]) => [x, y - 7]), postL.map(([x, y]) => [x, y + 7]), ink.primary, 0.14)
        + bandPolygon(postR.map(([x, y]) => [x, y - 7]), postR.map(([x, y]) => [x, y + 7]), ink.primary, 0.16)
        + `<path d="${smoothCurvePath(preL)}" stroke="${ink.secondary}" stroke-width="1.7" stroke-dasharray="4 2"/>`
        + `<path d="${smoothCurvePath(preR)}" stroke="${ink.secondary}" stroke-width="1.7" stroke-dasharray="4 2"/>`
        + `<path d="${smoothCurvePath(postL)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + `<path d="${smoothCurvePath(postR)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + preL.concat(preR).map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.5" fill="${ink.surface}" stroke="${ink.secondary}" stroke-width="1.2"/>`).join('')
        + postL.concat(postR).map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.6" fill="${ink.primary}"/>`).join('')
        + `<line x1="${f1(xc + 6)}" y1="82" x2="${f1(xc + 6)}" y2="125" stroke="${ink.opposite}" stroke-width="1.6"/>`
        + txt(xc + 10, 105, 'τ_post=+0.52', { size: 6.9, weight: 700, fill: ink.opposite })
        + txt(xc - 8, 145, 'τ_pre=+0.10', { size: 6.7, weight: 600, fill: ink.secondary, anchor: 'end' }),
    };
  },

  dag_backdoor: (ink: ResolvedInk) => {
    const arrowSeg = (x1: number, y1: number, x2: number, y2: number, color: string, dashed = false, sw = 1.4) => {
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${color}" stroke-width="${sw}"${dashed ? ' stroke-dasharray="3.5 2"' : ''}/>`
        + arrowPoly(x2, y2, ang, 5.2, color);
    };
    const boxNode = (cx: number, cy: number, w: number, h: number, label: string, sub: string, bg: string, stroke: string, color: string, dashed = false) =>
      `<rect x="${f1(cx - w / 2)}" y="${f1(cy - h / 2)}" width="${w}" height="${h}" rx="5" fill="${bg}" stroke="${stroke}" stroke-width="1.35"${dashed ? ' stroke-dasharray="3.5 2"' : ''}/>`
      + txt(cx, cy - 1, label, { size: 7.4, weight: 700, fill: color, anchor: 'middle' })
      + txt(cx, cy + 8.5, sub, { size: 6.3, fill: ink.muted, anchor: 'middle' });
    return {
      title: '因果后门路径截断与对撞偏误',
      badge: '最小调整集 Z',
      body: legendChips([{ label: '因果主链', color: ink.primary, kind: 'line' }, { label: '后门截断 Z', color: ink.secondary, kind: 'dash' }, { label: '对撞禁控 C', color: ink.opposite, kind: 'dash' }], 40, 39, ink)
        + arrowSeg(132, 74, 82, 111, ink.secondary, true, 1.3)
        + arrowSeg(228, 74, 278, 111, ink.secondary, true, 1.3)
        + pill(98, 86, '✕ 截断', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.2, h: 12, align: 'center' })
        + pill(262, 86, '✕ 截断', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.2, h: 12, align: 'center' })
        + `<path d="M 88 112 Q 180 88, 272 112" stroke="${ink.primary}" stroke-width="1.35"/>`
        + arrowPoly(273, 112, 14, 5, ink.primary)
        + txt(180, 96, '直接效应 X→Y', { size: 6.6, weight: 600, fill: ink.primary, anchor: 'middle' })
        + arrowSeg(102, 126, 144, 126, ink.primary, false, 1.7)
        + arrowSeg(216, 126, 258, 126, ink.primary, false, 1.7)
        + arrowSeg(82, 141, 134, 173, ink.opposite, true, 1.3)
        + arrowSeg(278, 141, 226, 173, ink.opposite, true, 1.3)
        + txt(96, 165, 'X→C', { size: 6.4, weight: 600, fill: ink.opposite, anchor: 'end' })
        + txt(264, 165, 'Y→C', { size: 6.4, weight: 600, fill: ink.opposite })
        + boxNode(180, 62, 108, 25, '混杂变量 Z', '已控制 · 封闭后门', ink.secondarySoft, ink.secondary, ink.secondary)
        + boxNode(64, 126, 74, 27, '处理变量 X', '外生暴露/政策', ink.primarySoft, ink.primary, ink.primary)
        + boxNode(180, 126, 68, 27, '中介变量 M', '禁控防过度调整', ink.surface, ink.accent4, ink.accent4)
        + boxNode(296, 126, 74, 27, '结果变量 Y', '目标响应指标', ink.primarySoft, ink.secondary, ink.secondary)
        + boxNode(180, 184, 114, 26, '对撞因子 C', 'X→C←Y 误控致偏!', ink.oppositeSoft, ink.opposite, ink.opposite, true)
        + txt(180, 219, '控制 Z 阻断全部后门路径；误控 C 或 M 将引入对撞与中介偏误', { size: 6.6, fill: ink.muted, anchor: 'middle' }),
    };
  },

  sdid_unit_time_weights: (ink: ResolvedInk) => {
    const yrs = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
    const treat = [44, 46, 49, 52, 63, 71, 78, 84];
    const sdidCtrl = [43, 45, 48, 51, 55, 58, 61, 64];
    const lam = [0.06, 0.14, 0.34, 0.46, 0, 0, 0, 0];
    const x0 = 46, y0 = 48, x1 = 336, y1 = 142;
    const xTicks = evenlySpacedTicks(x0 + 18, x1 - 18, yrs);
    const yMap = (v: number) => y1 - ((v - 35) / 55) * (y1 - y0);
    const yTicks = [40, 55, 70, 85].map(v => ({ pos: yMap(v), label: String(v) }));
    const tPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(treat[i])]);
    const cPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(sdidCtrl[i])]);
    const xShock = (xTicks[3].pos + xTicks[4].pos) / 2;
    const wy0 = 152, wy1 = 192;
    const wBars = xTicks.map((t, i) => {
      if (lam[i] <= 0) return '';
      const bh = (lam[i] / 0.52) * (wy1 - wy0 - 4);
      return `<rect x="${f1(t.pos - 10)}" y="${f1(wy1 - bh)}" width="20" height="${f1(bh)}" rx="1.5" fill="${ink.opposite}" fill-opacity="${i >= 2 ? 0.8 : 0.45}"/>`
        + (i >= 2 ? txt(t.pos, wy1 - bh - 3, lam[i].toFixed(2), { size: 6.4, weight: 700, fill: ink.opposite, anchor: 'middle' }) : '');
    }).join('');
    return {
      title: '合成双重差分 (SDID) 双权重趋势',
      badge: 'ATT_SDID = +14.8***',
      body: legendChips([{ label: '处理组均值', color: ink.primary, kind: 'line' }, { label: 'ω加权对照', color: ink.secondary, kind: 'dash' }, { label: '时间权重 λt', color: ink.opposite, kind: 'box' }], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks: [], box: true, yTitle: '结果水平 Y' }, ink)
        + `<rect x="${f1(xShock)}" y="${y0}" width="${f1(x1 - xShock)}" height="${y1 - y0}" fill="${ink.primary}" fill-opacity="0.06"/>`
        + bandPolygon(tPts.slice(3), cPts.slice(3), ink.primary, 0.14)
        + `<line x1="${f1(xShock)}" y1="${y0}" x2="${f1(xShock)}" y2="${wy1}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr(cPts)}" stroke="${ink.secondary}" stroke-width="1.8" stroke-dasharray="4 2"/>`
        + `<polyline points="${polyStr(tPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<line x1="${f1(xTicks[7].pos)}" y1="${f1(tPts[7][1])}" x2="${f1(xTicks[7].pos)}" y2="${f1(cPts[7][1])}" stroke="${ink.opposite}" stroke-width="1.5"/>`
        + txt(xTicks[7].pos - 4, (tPts[7][1] + cPts[7][1]) / 2 + 2, 'ATT=+14.8', { size: 6.8, weight: 700, fill: ink.opposite, anchor: 'end' })
        + `<rect x="${x0}" y="${wy0}" width="${x1 - x0}" height="${wy1 - wy0}" fill="${ink.surface}" fill-opacity="0.55" stroke="${ink.axis}" stroke-width="0.9"/>`
        + wBars
        + txt(x0 - 5, (wy0 + wy1) / 2 + 2, 'λt', { size: 7.2, weight: 700, fill: ink.opposite, anchor: 'end' })
        + txt(x1 - 4, wy0 + 10, '前测锚定 Σλt=1.00', { size: 6.6, weight: 600, fill: ink.opposite, anchor: 'end' })
        + xTicks.map(t => txt(t.pos, wy1 + 11, t.label, { size: 7, fill: ink.muted, anchor: 'middle' })).join('')
        + txt((x0 + x1) / 2, 217, '观测年份（上图反事实平行轨迹 · 下图时间权重 λt）', { size: 7.1, weight: 600, fill: ink.axis, anchor: 'middle' }),
    };
  },

  synthetic_did_unit_weights: (ink: ResolvedInk) => {
    const yrs = ['19', '20', '21', '22', '23', '24', '25'];
    const treat = [42.0, 45.0, 48.2, 58.6, 65.4, 71.2, 76.4];
    const sdid = [41.5, 44.6, 47.7, 50.8, 53.9, 56.8, 59.8];
    const did = [45.8, 48.0, 50.2, 52.6, 55.0, 57.4, 59.8];
    const lx0 = 42, ly0 = 48, lx1 = 208, ly1 = 192;
    const xTicks = evenlySpacedTicks(lx0 + 10, lx1 - 10, yrs);
    const yMap = (v: number) => ly1 - ((v - 38) / 42) * (ly1 - ly0);
    const yTicks = [40, 50, 60, 70, 80].map(v => ({ pos: yMap(v), label: String(v) }));
    const tPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(treat[i])]);
    const sPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(sdid[i])]);
    const dPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(did[i])]);
    const xShock = (xTicks[2].pos + xTicks[3].pos) / 2;

    const units = [
      ['苏州', 0.34, ink.primary],
      ['无锡', 0.25, ink.primary],
      ['嘉兴', 0.18, ink.secondary],
      ['常州', 0.12, ink.secondary],
      ['绍兴', 0.07, ink.accent4],
      ['其他', 0.04, ink.muted],
    ] as const;
    const rx0 = 250, ry0 = 48, rx1 = 344, ry1 = 192;
    const rxMap = (w: number) => rx0 + (w / 0.45) * (rx1 - rx0);
    const rxTicks = [0, 0.15, 0.30].map(w => ({ pos: rxMap(w), label: w.toFixed(2) }));
    const rowH = (ry1 - ry0) / units.length;
    return {
      title: '合成双重差分 SDID 权重轨迹对照',
      badge: 'ATT=+13.6*** · Σωi=1.00',
      body: legendChips([
        { label: '处理组', color: ink.primary, kind: 'line' },
        { label: 'SDID 加权对照', color: ink.secondary, kind: 'dash' },
        { label: '普通 DID', color: ink.lightMuted, kind: 'dash' },
        { label: '捐赠权重 ωi', color: ink.primary, kind: 'box' },
      ], 42, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, box: true, yTicks, xTicks, yTitle: '结果水平 Y', xTitle: '年份 (2019–2025)' }, ink)
        + bandPolygon(tPts.slice(2), sPts.slice(2), ink.primary, 0.15)
        + `<line x1="${f1(xShock)}" y1="${ly0}" x2="${f1(xShock)}" y2="${ly1}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr(dPts)}" stroke="${ink.lightMuted}" stroke-width="1.3" stroke-dasharray="2.5 2"/>`
        + `<polyline points="${polyStr(sPts)}" stroke="${ink.secondary}" stroke-width="1.8" stroke-dasharray="4 2"/>`
        + `<polyline points="${polyStr(tPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + txt(xTicks[6].pos - 3, yMap(69), 'ATT=+13.6', { size: 6.6, weight: 700, fill: ink.opposite, anchor: 'end' })
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, box: true, xTicks: rxTicks, vGrid: true, hGrid: false, xTitle: '捐赠单元权重 ωi' }, ink)
        + units.map(([lbl, w, col], i) => {
          const cyRow = ry0 + (i + 0.5) * rowH, bw = rxMap(w) - rx0;
          return txt(rx0 - 4, cyRow + 2.4, lbl, { size: 6.7, weight: 600, fill: ink.text, anchor: 'end' })
            + `<rect x="${rx0}" y="${f1(cyRow - 6)}" width="${f1(bw)}" height="12" rx="1.8" fill="${col}" fill-opacity="0.78"/>`
            + txt(rx0 + bw + 3, cyRow + 2.4, w.toFixed(2), { size: 6.5, weight: 700, fill: col });
        }).join(''),
    };
  },

  var_irf: (ink: ResolvedInk) => {
    const hs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const irf = [0.0, 0.19, 0.31, 0.34, 0.27, 0.20, 0.14, 0.09, 0.06, 0.035, 0.02, 0.01, 0.005];
    const se = [0.0, 0.06, 0.075, 0.08, 0.08, 0.075, 0.07, 0.065, 0.06, 0.055, 0.05, 0.045, 0.04];
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (h: number) => x0 + 10 + (h / 12) * (x1 - x0 - 20);
    const yMap = (v: number) => y1 - ((v + 0.1) / 0.55) * (y1 - y0);
    const xTicks = [0, 2, 4, 6, 8, 10, 12].map(h => ({ pos: xMap(h), label: String(h) }));
    const yTicks = [-0.1, 0, 0.1, 0.2, 0.3, 0.4].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const midPts: [number, number][] = hs.map((h, i) => [xMap(h), yMap(irf[i])]);
    const topPts: [number, number][] = hs.map((h, i) => [xMap(h), yMap(irf[i] + 1.96 * se[i])]);
    const botPts: [number, number][] = hs.map((h, i) => [xMap(h), yMap(irf[i] - 1.96 * se[i])]);
    return {
      title: 'VAR 脉冲响应函数 (IRF) 与置信带',
      badge: '95% Bootstrap CI · h=12',
      body: legendChips([{ label: '结构冲击响应 IRF', color: ink.primary, kind: 'line' }, { label: '95% 置信带', color: ink.secondary, kind: 'box' }], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '脉冲响应幅度 ΔY', xTitle: '冲击滞后期数 h (期)' }, ink)
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + bandPolygon(topPts, botPts, ink.secondary, 0.18)
        + `<path d="${smoothCurvePath(topPts)}" stroke="${ink.secondary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(botPts)}" stroke="${ink.secondary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(midPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + midPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i === 3 ? 4 : 2.3}" fill="${i === 3 ? ink.opposite : ink.primary}" stroke="${ink.surface}" stroke-width="0.9"/>`).join('')
        + pill(xMap(3) + 10, yMap(0.34) - 24, '峰值 h=3 (+0.34*)', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.8, h: 14 }),
    };
  },

  cs_group_time_att: (ink: ResolvedInk) => {
    const events = ['-3', '-2', '-1', '0', '+1', '+2', '+3', '+4'];
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xTicks = evenlySpacedTicks(x0 + 18, x1 - 18, events);
    const yMap = (v: number) => y1 - ((v + 0.22) / 1.04) * (y1 - y0);
    const yTicks = [-0.2, 0.0, 0.2, 0.4, 0.6, 0.8].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xShock = (xTicks[2].pos + xTicks[3].pos) / 2;
    const cohorts = [
      { lbl: '2020首批', c: ink.primary, vals: [-0.02, 0.03, 0.0, 0.21, 0.36, 0.49, 0.58, 0.63], se: 0.075, tagDx: 0, tagDy: -8 },
      { lbl: '2022扩围', c: ink.secondary, vals: [0.02, -0.02, 0.0, 0.16, 0.28, 0.37, 0.42], se: 0.07, tagDx: 4, tagDy: 10 },
      { lbl: '2023全覆', c: ink.opposite, vals: [-0.03, 0.01, 0.0, 0.12, 0.22, 0.29], se: 0.068, tagDx: 4, tagDy: 10 },
    ] as const;
    const seriesSvg = cohorts.map(coh => {
      const pts: [number, number][] = coh.vals.map((v, i) => [xTicks[i].pos, yMap(v)]);
      const topPts: [number, number][] = coh.vals.map((v, i) => [xTicks[i].pos, yMap(i === 2 ? v : v + 1.96 * coh.se)]);
      const botPts: [number, number][] = coh.vals.map((v, i) => [xTicks[i].pos, yMap(i === 2 ? v : v - 1.96 * coh.se)]);
      const last = pts[pts.length - 1];
      const lastV = coh.vals[coh.vals.length - 1];
      return bandPolygon(topPts, botPts, coh.c, 0.11)
        + `<polyline points="${polyStr(pts)}" stroke="${coh.c}" stroke-width="1.9"/>`
        + pts.map(([x, y], idx) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${idx === 2 ? 2.6 : 2.8}" fill="${idx === 2 ? ink.surface : coh.c}" stroke="${coh.c}" stroke-width="1.1"/>`).join('')
        + txt(last[0] + coh.tagDx, last[1] + coh.tagDy, `+${lastV.toFixed(2)}`, { size: 6.7, weight: 700, fill: coh.c, anchor: coh.tagDx === 0 ? 'middle' : 'start' });
    }).join('');
    return {
      title: 'CS-DID 交错队列组别—时期动态 ATT',
      badge: 'ATT_overall=+0.41***',
      body: legendChips(cohorts.map(c => ({ label: c.lbl, color: c.c, kind: 'line' })), 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '动态处理效应 ATT(g, t)', xTitle: '相对入组期数 e = t - g (干净对照聚合)' }, ink)
        + `<rect x="${f1(xShock)}" y="${y0}" width="${f1(x1 - xShock)}" height="${y1 - y0}" fill="${ink.primary}" fill-opacity="0.05"/>`
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.95" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xShock)}" y1="${y0}" x2="${f1(xShock)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + seriesSvg
        + pill(54, 54, 'Pre F=0.41 (p=0.74) · 平行满足', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.5, h: 14 }),
    };
  },

  bacon_decomp_2x2: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (w: number) => x0 + 12 + (w / 0.34) * (x1 - x0 - 24);
    const yMap = (b: number) => y1 - ((b + 0.24) / 0.88) * (y1 - y0);
    const xTicks = [0.0, 0.1, 0.2, 0.3].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = [-0.2, 0.0, 0.2, 0.4, 0.6].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const pairs: [number, number, string, number][] = [
      [0.26, 0.48, ink.primary, 4.7],
      [0.19, 0.45, ink.primary, 4.1],
      [0.13, 0.43, ink.primary, 3.6],
      [0.11, 0.39, ink.secondary, 3.4],
      [0.07, 0.41, ink.secondary, 3.1],
      [0.05, 0.34, ink.accent4, 2.9],
      [0.04, 0.31, ink.accent4, 2.7],
      [0.09, -0.13, ink.opposite, 4.1],
      [0.06, -0.07, ink.opposite, 3.4],
    ];
    const yTwfe = yMap(0.28), yClean = yMap(0.44);
    return {
      title: 'Goodman-Bacon TWFE 2×2 权重分解',
      badge: 'TWFE=+0.28 · 净=+0.44',
      body: legendChips([
        { label: '早vs未', color: ink.primary, kind: 'dot' },
        { label: '晚vs未', color: ink.secondary, kind: 'dot' },
        { label: '早vs晚', color: ink.accent4, kind: 'dot' },
        { label: '晚vs早(污染)', color: ink.opposite, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '2×2 DID 估计值 β̂_k', xTitle: 'Goodman-Bacon 权重 w_k (Σw_k = 1)' }, ink)
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + `<line x1="${x0}" y1="${f1(yClean)}" x2="${x1}" y2="${f1(yClean)}" stroke="${ink.primary}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${f1(yTwfe)}" x2="${x1}" y2="${f1(yTwfe)}" stroke="${ink.axis}" stroke-width="1.2" stroke-dasharray="4 2.5"/>`
        + txt(x1 - 5, yClean - 4, '干净对照均值 +0.44', { size: 6.5, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x1 - 5, yTwfe - 4, 'TWFE 汇总 +0.28', { size: 6.5, weight: 700, fill: ink.axis, anchor: 'end' })
        + pairs.map(([w, b, c, r]) => {
          const cx = xMap(w), cy = yMap(b);
          const halo = c === ink.opposite ? `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r + 2.4)}" stroke="${ink.opposite}" stroke-width="1" stroke-opacity="0.6"/>` : '';
          return halo + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${c}" fill-opacity="0.82" stroke="${ink.surface}" stroke-width="0.9"/>`;
        }).join('')
        + txt(xMap(0.11), yMap(-0.13) + 2, '禁止比较组负偏误 (权重 15%)', { size: 6.6, weight: 700, fill: ink.opposite, anchor: 'start' }),
    };
  },

  oster_delta_bounds: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (d: number) => x0 + 8 + (d / 2.6) * (x1 - x0 - 16);
    const yMap = (b: number) => y1 - ((b + 0.12) / 0.70) * (y1 - y0);
    const xTicks = [0, 0.5, 1.0, 1.5, 2.0, 2.5].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = [-0.1, 0.0, 0.2, 0.4, 0.6].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const betaFn = (d: number) => 0.46 - 0.16 * d - 0.023 * d * d;
    const ds = Array.from({ length: 27 }, (_, i) => i * 0.1);
    const curvePts: [number, number][] = ds.map(d => [xMap(d), yMap(betaFn(d))]);
    const b0 = betaFn(0), b1 = betaFn(1), dStar = 2.18;
    return {
      title: 'Oster 遗漏变量稳定性边界与 δ 曲线',
      badge: 'δ* = 2.18 > 1 · 稳健',
      body: legendChips([
        { label: '偏误修正 β*(δ)', color: ink.primary, kind: 'line' },
        { label: '识别集 [β*(1), β̃]', color: ink.secondary, kind: 'box' },
        { label: '临界 δ=1', color: ink.opposite, kind: 'dash' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '偏误修正系数 β*(δ)', xTitle: '不可观测/可观测选择比例 δ (Rmax=1.3R̃²)' }, ink)
        + `<rect x="${f1(xMap(0))}" y="${f1(yMap(b0))}" width="${f1(xMap(1) - xMap(0))}" height="${f1(yMap(b1) - yMap(b0))}" fill="${ink.secondary}" fill-opacity="0.14"/>`
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xMap(1))}" y1="${y0}" x2="${f1(xMap(1))}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(curvePts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<circle cx="${f1(xMap(0))}" cy="${f1(yMap(b0))}" r="3.5" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="1"/>`
        + `<circle cx="${f1(xMap(1))}" cy="${f1(yMap(b1))}" r="3.8" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="1"/>`
        + `<circle cx="${f1(xMap(dStar))}" cy="${f1(yMap(0))}" r="3.8" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`
        + txt(xMap(0) + 6, yMap(b0) - 6, 'β̃=0.46', { size: 6.7, weight: 700, fill: ink.secondary })
        + txt(xMap(1) + 6, yMap(b1) - 5, 'β*(1)=0.28', { size: 6.7, weight: 700, fill: ink.primary })
        + txt(xMap(dStar) + 4, yMap(0) - 7, 'δ*=2.18 (归零点)', { size: 6.6, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + pill(xMap(0.5), yMap(0.11), '识别集 [0.28, 0.46] ∌ 0', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.5, h: 14, align: 'center' }),
    };
  },

  spatial_sar_impacts: (ink: ResolvedInk) => {
    const covs = [
      { lbl: '数字基建', d: 0.28, dCi: 0.07, ind: 0.22, iCi: 0.09, tot: 0.50, tCi: 0.12 },
      { lbl: '财政补贴', d: 0.21, dCi: 0.06, ind: 0.15, iCi: 0.08, tot: 0.36, tCi: 0.11 },
      { lbl: '人才集聚', d: 0.17, dCi: 0.05, ind: 0.26, iCi: 0.08, tot: 0.43, tCi: 0.10 },
      { lbl: '行政壁垒', d: -0.14, dCi: 0.05, ind: -0.09, iCi: 0.06, tot: -0.23, tCi: 0.08 },
    ] as const;
    const x0 = 66, y0 = 48, x1 = 338, y1 = 192;
    const xMap = (v: number) => x0 + ((v + 0.38) / 1.18) * (x1 - x0);
    const xTicks = [-0.2, 0.0, 0.2, 0.4, 0.6].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const xZero = xMap(0);
    const rowH = (y1 - y0) / covs.length;
    const rows = covs.map((c, i) => {
      const cy = y0 + (i + 0.5) * rowH;
      const yD = cy - 9, yI = cy, yT = cy + 9;
      const bar = (y: number, val: number, col: string) => {
        const xv = xMap(val), bx = Math.min(xZero, xv), bw = Math.max(2, Math.abs(xv - xZero));
        return `<rect x="${f1(bx)}" y="${f1(y - 2.8)}" width="${f1(bw)}" height="5.6" rx="1.2" fill="${col}" fill-opacity="0.72"/>`;
      };
      const sep = i > 0 ? `<line x1="${x0}" y1="${f1(y0 + i * rowH)}" x2="${x1}" y2="${f1(y0 + i * rowH)}" stroke="${ink.grid}" stroke-width="0.6"/>` : '';
      const xt = xMap(c.tot), xLo = xMap(c.tot - c.tCi), xHi = xMap(c.tot + c.tCi);
      const valTag = c.tot >= 0
        ? txt(xHi + 4, yT + 2.3, `+${c.tot.toFixed(2)}`, { size: 6.5, weight: 700, fill: ink.opposite })
        : txt(xLo - 4, yT + 2.3, `${c.tot.toFixed(2)}`, { size: 6.5, weight: 700, fill: ink.opposite, anchor: 'end' });
      return sep
        + txt(x0 - 5, cy + 2.5, c.lbl, { size: 7.2, weight: 600, fill: ink.text, anchor: 'end' })
        + bar(yD, c.d, ink.primary) + errH(yD, xMap(c.d - c.dCi), xMap(c.d + c.dCi), darkenHex(ink.primary, 0.2), 2.2)
        + bar(yI, c.ind, ink.secondary) + errH(yI, xMap(c.ind - c.iCi), xMap(c.ind + c.iCi), darkenHex(ink.secondary, 0.2), 2.2)
        + errH(yT, xLo, xHi, ink.opposite, 2.4)
        + `<polygon points="${f1(xt)},${f1(yT - 3.6)} ${f1(xt + 3.6)},${f1(yT)} ${f1(xt)},${f1(yT + 3.6)} ${f1(xt - 3.6)},${f1(yT)}" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.7"/>`
        + valTag;
    }).join('');
    return {
      title: '空间杜宾模型 (SDM) 效应分解',
      badge: 'ρ = 0.34*** · 偏微分',
      body: legendChips([
        { label: '直接效应', color: ink.primary, kind: 'box' },
        { label: '空间溢出 ρW', color: ink.secondary, kind: 'box' },
        { label: '总效应 (Total)', color: ink.opposite, kind: 'dot' },
      ], 66, 39, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, box: true, xTitle: 'LeSage-Pace 偏微分边际效应 ± 95% CI' }, ink)
        + `<line x1="${f1(xZero)}" y1="${y0}" x2="${f1(xZero)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + rows,
    };
  },

  sc_donor_convex_hull: (ink: ResolvedInk) => {
    const lx0 = 36, ly0 = 54, lx1 = 178, ly1 = 192;
    const lxMap = (v: number) => lx0 + ((v + 2.5) / 5.0) * (lx1 - lx0);
    const lyMap = (v: number) => ly1 - ((v + 2.5) / 5.0) * (ly1 - ly0);
    const bgDonors: [number, number][] = [[-2.0, -1.5], [-1.7, 1.6], [-0.4, 2.0], [1.9, 1.8], [2.1, -0.5], [1.4, -2.0], [-0.8, -1.9], [0.5, 0.9], [-1.1, -0.3]];
    const hullPts: [number, number][] = [[-2.0, -1.5], [-1.7, 1.6], [-0.4, 2.0], [1.9, 1.8], [2.1, -0.5], [1.4, -2.0], [-0.8, -1.9]].map(([x, y]) => [lxMap(x), lyMap(y)]);
    const active: [number, number, string, number][] = [
      [-1.1, 1.0, 'D1 0.44', 4.6],
      [1.3, 1.1, 'D2 0.33', 4.0],
      [0.2, -1.3, 'D3 0.23', 3.5],
    ];
    const simplexPts: [number, number][] = active.map(([x, y]) => [lxMap(x), lyMap(y)]);
    const treatXY: [number, number] = [lxMap(0.05), lyMap(0.45)];
    const synthXY: [number, number] = [lxMap(-0.02), lyMap(0.41)];

    const rx0 = 214, ry0 = 54, rx1 = 344, ry1 = 192;
    const yrs = ['18', '19', '20', '21', '22', '23', '24'];
    const gaps = [0.4, -0.3, 0.2, -0.2, 6.4, 13.2, 18.8];
    const rxTicks = [0, 3, 6].map(i => ({ pos: rx0 + 12 + (i / 6) * (rx1 - rx0 - 24), label: `20${yrs[i]}` }));
    const ryMap = (g: number) => ry1 - ((g + 4) / 26) * (ry1 - ry0);
    const ryTicks = [0, 10, 20].map(v => ({ pos: ryMap(v), label: String(v) }));
    const gPts: [number, number][] = gaps.map((g, i) => [rx0 + 12 + (i / 6) * (rx1 - rx0 - 24), ryMap(g)]);
    const xInt = (gPts[3][0] + gPts[4][0]) / 2;
    return {
      title: '合成控制捐赠池凸包与残差带',
      badge: '凸包内插 · RMSPE比=18.4',
      body: txt(107, 45, '捐赠池特征凸包与权重', { size: 7.1, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(279, 45, '事前残差带与事后 Gap', { size: 7.1, weight: 700, fill: ink.axis, anchor: 'middle' })
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, box: true, xTicks: [-2, 0, 2].map(v => ({ pos: lxMap(v), label: String(v) })), yTicks: [-2, 0, 2].map(v => ({ pos: lyMap(v), label: String(v) })), xTitle: '协变量 Z1', yTitle: '协变量 Z2' }, ink)
        + `<polygon points="${polyStr(hullPts)}" fill="${ink.grid}" fill-opacity="0.24" stroke="${ink.lightMuted}" stroke-width="0.95" stroke-dasharray="3 2"/>`
        + `<polygon points="${polyStr(simplexPts)}" fill="${ink.primary}" fill-opacity="0.14" stroke="${ink.primary}" stroke-width="1.2"/>`
        + bgDonors.map(([x, y]) => `<circle cx="${f1(lxMap(x))}" cy="${f1(lyMap(y))}" r="2.2" fill="${ink.lightMuted}" fill-opacity="0.75"/>`).join('')
        + active.map(([x, y, lbl, r], idx) => `<circle cx="${f1(lxMap(x))}" cy="${f1(lyMap(y))}" r="${r}" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="0.9"/>`
          + txt(lxMap(x), idx === 2 ? lyMap(y) + 11 : lyMap(y) - 6.5, lbl, { size: 6.4, weight: 700, fill: ink.secondary, anchor: 'middle' })).join('')
        + `<rect x="${f1(synthXY[0] - 3.2)}" y="${f1(synthXY[1] - 3.2)}" width="6.4" height="6.4" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="0.8"/>`
        + `<circle cx="${f1(treatXY[0])}" cy="${f1(treatXY[1])}" r="4.2" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`
        + txt(treatXY[0] + 6, treatXY[1] + 2.5, '试点', { size: 6.6, weight: 700, fill: ink.opposite })
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, box: true, xTicks: rxTicks, yTicks: ryTicks, xTitle: '年份 (2022 干预)' }, ink)
        + `<rect x="${rx0}" y="${f1(ryMap(1.6))}" width="${rx1 - rx0}" height="${f1(ryMap(-1.6) - ryMap(1.6))}" fill="${ink.secondary}" fill-opacity="0.15"/>`
        + `<line x1="${rx0}" y1="${f1(ryMap(0))}" x2="${rx1}" y2="${f1(ryMap(0))}" stroke="${ink.axis}" stroke-width="0.85" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(xInt)}" y1="${ry0}" x2="${f1(xInt)}" y2="${ry1}" stroke="${ink.opposite}" stroke-width="1.05" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(gPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + gPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.4" fill="${i >= 4 ? ink.opposite : ink.primary}"/>`).join('')
        + pill(rx0 + 4, ry0 + 6, '事前RMSPE=0.41', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.1, h: 12.5 }),
    };
  },

  quantile_process_band: (ink: ResolvedInk) => {
    const taus = Array.from({ length: 17 }, (_, i) => 0.1 + i * 0.05);
    const betas = taus.map(t => 0.12 + 0.58 * (t ** 1.35) + 0.03 * Math.sin(6 * t));
    const pw = taus.map(t => 0.05 + 0.15 * ((t - 0.5) ** 2));
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (t: number) => x0 + 10 + ((t - 0.1) / 0.8) * (x1 - x0 - 20);
    const yMap = (b: number) => y1 - ((b + 0.08) / 0.94) * (y1 - y0);
    const xTicks = [0.1, 0.3, 0.5, 0.7, 0.9].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = [0.0, 0.2, 0.4, 0.6, 0.8].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const midPts: [number, number][] = taus.map((t, i) => [xMap(t), yMap(betas[i])]);
    const pwTop: [number, number][] = taus.map((t, i) => [xMap(t), yMap(betas[i] + pw[i])]);
    const pwBot: [number, number][] = taus.map((t, i) => [xMap(t), yMap(betas[i] - pw[i])]);
    const unTop: [number, number][] = taus.map((t, i) => [xMap(t), yMap(betas[i] + 1.45 * pw[i])]);
    const unBot: [number, number][] = taus.map((t, i) => [xMap(t), yMap(betas[i] - 1.45 * pw[i])]);
    const yOls = yMap(0.38), yOlsHi = yMap(0.45), yOlsLo = yMap(0.31);
    return {
      title: '全分位数回归过程曲线 β̂(τ) 与 OLS 对照',
      badge: 'Wald p=0.002 · 异质性',
      body: legendChips([
        { label: 'QR 过程 β̂(τ)', color: ink.primary, kind: 'line' },
        { label: '逐点/一致 95%带', color: ink.primary, kind: 'box' },
        { label: 'OLS 均值±CI', color: ink.opposite, kind: 'dash' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '分位系数 β̂(τ)', xTitle: '条件分位点 τ (0.10 → 0.90 连续过程)' }, ink)
        + `<rect x="${x0}" y="${f1(yOlsHi)}" width="${x1 - x0}" height="${f1(yOlsLo - yOlsHi)}" fill="${ink.opposite}" fill-opacity="0.14"/>`
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.85" stroke-dasharray="2.5 2"/>`
        + `<line x1="${x0}" y1="${f1(yOls)}" x2="${x1}" y2="${f1(yOls)}" stroke="${ink.opposite}" stroke-width="1.4" stroke-dasharray="4 2"/>`
        + bandPolygon(unTop, unBot, ink.primary, 0.11)
        + bandPolygon(pwTop, pwBot, ink.primary, 0.22)
        + `<path d="${smoothCurvePath(midPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + midPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i === 0 || i === midPts.length - 1 ? 3.5 : 2.1}" fill="${i === 0 || i === midPts.length - 1 ? ink.opposite : ink.primary}"/>`).join('')
        + pill(56, 56, '高低分位显著偏离 OLS 带', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.4, h: 13.5 }),
    };
  },

  psm_love_smd_panel: (ink: ResolvedInk) => {
    const covs = [
      { lbl: '家庭月收入', preS: 0.48, postS: 0.04, preV: 1.84, postV: 1.04 },
      { lbl: '数字素养分', preS: 0.41, postS: 0.05, preV: 1.66, postV: 0.96 },
      { lbl: '受访者年龄', preS: 0.34, postS: 0.03, preV: 0.56, postV: 0.98 },
      { lbl: '受教育年限', preS: 0.29, postS: 0.04, preV: 1.54, postV: 1.03 },
      { lbl: '常住城市层', preS: 0.24, postS: 0.02, preV: 1.42, postV: 1.01 },
      { lbl: '基线意愿分', preS: 0.19, postS: 0.05, preV: 0.68, postV: 0.95 },
    ] as const;
    const lx0 = 70, ly0 = 48, lx1 = 216, ly1 = 192;
    const rx0 = 236, ry0 = 48, rx1 = 342, ry1 = 192;
    const lxMap = (v: number) => lx0 + (v / 0.55) * (lx1 - lx0);
    const rxMap = (v: number) => rx0 + ((v - 0.35) / 1.75) * (rx1 - rx0);
    const lxTicks = [0.0, 0.1, 0.25, 0.5].map(v => ({ pos: lxMap(v), label: v.toFixed(v === 0.25 ? 2 : 1) }));
    const rxTicks = [0.5, 1.0, 1.5, 2.0].map(v => ({ pos: rxMap(v), label: v.toFixed(1) }));
    const rowH = (ly1 - ly0) / covs.length;
    const rows = covs.map((c, i) => {
      const cy = ly0 + (i + 0.5) * rowH;
      return txt(lx0 - 5, cy + 2.5, c.lbl, { size: 7.0, fill: ink.text, anchor: 'end' })
        + `<line x1="${f1(lxMap(c.postS))}" y1="${f1(cy)}" x2="${f1(lxMap(c.preS))}" y2="${f1(cy)}" stroke="${ink.grid}" stroke-width="1.1"/>`
        + `<circle cx="${f1(lxMap(c.preS))}" cy="${f1(cy)}" r="3.4" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.4"/>`
        + `<circle cx="${f1(lxMap(c.postS))}" cy="${f1(cy)}" r="3.5" fill="${ink.primary}"/>`
        + `<line x1="${f1(rxMap(c.postV))}" y1="${f1(cy)}" x2="${f1(rxMap(c.preV))}" y2="${f1(cy)}" stroke="${ink.grid}" stroke-width="1.1"/>`
        + `<circle cx="${f1(rxMap(c.preV))}" cy="${f1(cy)}" r="3.2" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.3"/>`
        + `<circle cx="${f1(rxMap(c.postV))}" cy="${f1(cy)}" r="3.3" fill="${ink.secondary}"/>`;
    }).join('');
    return {
      title: 'PSM 匹配前后协变量 |SMD|≤0.10 与方差比',
      badge: '匹配后 max|SMD|=0.05',
      body: legendChips([
        { label: '匹配前', color: ink.opposite, kind: 'dot' },
        { label: '匹配后 |SMD|', color: ink.primary, kind: 'dot' },
        { label: '匹配后 VR', color: ink.secondary, kind: 'dot' },
      ], 70, 39, ink)
        + `<rect x="${lx0}" y="${ly0}" width="${f1(lxMap(0.1) - lx0)}" height="${ly1 - ly0}" fill="${ink.primarySoft}" fill-opacity="0.45"/>`
        + `<rect x="${f1(rxMap(0.5))}" y="${ry0}" width="${f1(rxMap(2.0) - rxMap(0.5))}" height="${ry1 - ry0}" fill="${ink.secondarySoft}" fill-opacity="0.28"/>`
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, xTicks: lxTicks, vGrid: true, hGrid: false, box: true, xTitle: '绝对标准化均值差 |SMD|' }, ink)
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, xTicks: rxTicks, vGrid: true, hGrid: false, box: true, xTitle: 'Rubin 方差比 VR' }, ink)
        + `<line x1="${f1(lxMap(0.1))}" y1="${ly0}" x2="${f1(lxMap(0.1))}" y2="${ly1}" stroke="${ink.primary}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(lxMap(0.25))}" y1="${ly0}" x2="${f1(lxMap(0.25))}" y2="${ly1}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(rxMap(1.0))}" y1="${ry0}" x2="${f1(rxMap(1.0))}" y2="${ry1}" stroke="${ink.axis}" stroke-width="1.0" stroke-dasharray="3 2"/>`
        + txt(lxMap(0.1) + 3, ly0 + 10, '≤0.10', { size: 6.4, weight: 700, fill: ink.primary })
        + rows,
    };
  },

  iv_2sls_first_stage: (ink: ResolvedInk) => {
    const lx0 = 42, ly0 = 48, lx1 = 178, ly1 = 192;
    const rx0 = 224, ry0 = 48, rx1 = 344, ry1 = 192;
    const lxMap = (v: number) => lx0 + (v / 4) * (lx1 - lx0);
    const lyMap = (v: number) => ly1 - ((v - 1) / 4) * (ly1 - ly0);
    const rxMap = (v: number) => rx0 + ((v - 1) / 4) * (rx1 - rx0);
    const ryMap = (v: number) => ry1 - ((v - 1) / 4) * (ry1 - ry0);
    const lxTicks = [0, 1, 2, 3, 4].map(v => ({ pos: lxMap(v), label: String(v) }));
    const lyTicks = [1, 2, 3, 4, 5].map(v => ({ pos: lyMap(v), label: `${v}.0` }));
    const rxTicks = [1, 2, 3, 4, 5].map(v => ({ pos: rxMap(v), label: `${v}.0` }));
    const ryTicks = [1, 2, 3, 4, 5].map(v => ({ pos: ryMap(v), label: `${v}.0` }));
    const s1Pts: [number, number][] = [[0.4, 1.65], [0.8, 1.98], [1.2, 2.24], [1.6, 2.62], [2.0, 2.94], [2.4, 3.28], [2.8, 3.55], [3.2, 3.92], [3.6, 4.24]];
    const s2Pts: [number, number][] = [[1.5, 1.82], [1.9, 2.15], [2.3, 2.38], [2.7, 2.74], [3.1, 3.12], [3.5, 3.44], [3.9, 3.84], [4.3, 4.18]];
    const s2Top: [number, number][] = [[1.4, 2.02], [2.9, 3.04], [4.4, 4.46]];
    const s2Bot: [number, number][] = [[1.4, 1.56], [2.9, 2.62], [4.4, 3.86]];
    return {
      title: '工具变量 2SLS 第一阶段弱工具 F 与 LATE',
      badge: 'KP F=38.4 > 16.38',
      body: legendChips([
        { label: '第一阶段 Z→X', color: ink.secondary, kind: 'line' },
        { label: '2SLS LATE (β=0.64)', color: ink.primary, kind: 'line' },
        { label: 'OLS 偏误 (β=0.34)', color: ink.opposite, kind: 'dash' },
      ], 42, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, yTicks: lyTicks, xTicks: lxTicks, box: true, yTitle: '内生处理 X', xTitle: '工具变量 Z (第一阶段)' }, ink)
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, yTicks: ryTicks, xTicks: rxTicks, box: true, xTitle: '拟合处理 X̂ (第二阶段)' }, ink)
        + txt(rx0 - 24, (ry0 + ry1) / 2, '结果 Y', { size: 7.4, weight: 600, fill: ink.axis, anchor: 'middle', rotate: -90 })
        + `<line x1="${f1(lxMap(0.2))}" y1="${f1(lyMap(1.48))}" x2="${f1(lxMap(3.8))}" y2="${f1(lyMap(4.42))}" stroke="${ink.secondary}" stroke-width="2"/>`
        + s1Pts.map(([z, x]) => `<circle cx="${f1(lxMap(z))}" cy="${f1(lyMap(x))}" r="2.7" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="0.7"/>`).join('')
        + pill(lx0 + 6, ly0 + 6, 'F=38.4 > Stock-Yogo 16.38', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.1, h: 13 })
        + bandPolygon(s2Top.map(([x, y]) => [rxMap(x), ryMap(y)]), s2Bot.map(([x, y]) => [rxMap(x), ryMap(y)]), ink.primary, 0.16)
        + `<line x1="${f1(rxMap(1.4))}" y1="${f1(ryMap(2.12))}" x2="${f1(rxMap(4.4))}" y2="${f1(ryMap(3.16))}" stroke="${ink.opposite}" stroke-width="1.4" stroke-dasharray="4 2.5"/>`
        + `<line x1="${f1(rxMap(1.4))}" y1="${f1(ryMap(1.79))}" x2="${f1(rxMap(4.4))}" y2="${f1(ryMap(4.16))}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + s2Pts.map(([x, y]) => `<circle cx="${f1(rxMap(x))}" cy="${f1(ryMap(y))}" r="2.7" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="0.7"/>`).join('')
        + txt(rx1 - 5, ryMap(3.16) + 12, 'OLS 低估', { size: 6.3, weight: 600, fill: ink.opposite, anchor: 'end' }),
    };
  },

  diff_in_diff_bacon_scatter: (ink: ResolvedInk) => {
    const lx0 = 42, ly0 = 48, lx1 = 224, ly1 = 192;
    const rx0 = 242, ry0 = 48, rx1 = 344, ry1 = 192;
    const lxMap = (w: number) => lx0 + 10 + (w / 0.30) * (lx1 - lx0 - 18);
    const lyMap = (b: number) => ly1 - ((b + 0.25) / 0.90) * (ly1 - ly0);
    const lxTicks = [0.0, 0.1, 0.2, 0.3].map(v => ({ pos: lxMap(v), label: v.toFixed(1) }));
    const lyTicks = [-0.2, 0.0, 0.2, 0.4, 0.6].map(v => ({ pos: lyMap(v), label: v.toFixed(1) }));
    const pts: { w: number; b: number; col: string; kind: 'c' | 's' | 'd' | 'x' }[] = [
      { w: 0.23, b: 0.48, col: ink.primary, kind: 'c' },
      { w: 0.19, b: 0.45, col: ink.primary, kind: 'c' },
      { w: 0.15, b: 0.41, col: ink.secondary, kind: 's' },
      { w: 0.11, b: 0.38, col: ink.secondary, kind: 's' },
      { w: 0.08, b: 0.34, col: ink.accent4, kind: 'd' },
      { w: 0.06, b: 0.31, col: ink.accent4, kind: 'd' },
      { w: 0.10, b: -0.16, col: ink.opposite, kind: 'x' },
      { w: 0.08, b: -0.10, col: ink.opposite, kind: 'x' },
    ];
    const markerSvg = (p: typeof pts[number]) => {
      const cx = lxMap(p.w), cy = lyMap(p.b);
      if (p.kind === 'c') return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="3.8" fill="${p.col}" fill-opacity="0.86" stroke="${ink.surface}" stroke-width="0.9"/>`;
      if (p.kind === 's') return `<rect x="${f1(cx - 3.3)}" y="${f1(cy - 3.3)}" width="6.6" height="6.6" fill="${p.col}" fill-opacity="0.86" stroke="${ink.surface}" stroke-width="0.9"/>`;
      if (p.kind === 'd') return `<polygon points="${f1(cx)},${f1(cy - 4.3)} ${f1(cx + 4.3)},${f1(cy)} ${f1(cx)},${f1(cy + 4.3)} ${f1(cx - 4.3)},${f1(cy)}" fill="${p.col}" fill-opacity="0.86" stroke="${ink.surface}" stroke-width="0.9"/>`;
      return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="5.5" stroke="${p.col}" stroke-width="1" stroke-opacity="0.55"/>`
        + `<path d="M ${f1(cx - 3)} ${f1(cy - 3)} L ${f1(cx + 3)} ${f1(cy + 3)} M ${f1(cx - 3)} ${f1(cy + 3)} L ${f1(cx + 3)} ${f1(cy - 3)}" stroke="${p.col}" stroke-width="1.8"/>`;
    };
    const groups = [
      { lbl: '早vs未 (w=42%)', w: 0.42, est: '+0.47', col: ink.primary },
      { lbl: '晚vs未 (w=26%)', w: 0.26, est: '+0.40', col: ink.secondary },
      { lbl: '早vs晚 (w=14%)', w: 0.14, est: '+0.33', col: ink.accent4 },
      { lbl: '禁忌组 (w=18%)', w: 0.18, est: '-0.13', col: ink.opposite },
    ] as const;
    const rowH = (ry1 - ry0) / groups.length;
    const rxMap = (w: number) => rx0 + 6 + (w / 0.5) * (rx1 - rx0 - 34);
    const bars = groups.map((g, i) => {
      const top = ry0 + i * rowH + 6;
      const bw = Math.max(8, rxMap(g.w) - rx0 - 6);
      return txt(rx0 + 6, top + 7, g.lbl, { size: 6.4, weight: 600, fill: ink.text })
        + `<rect x="${rx0 + 6}" y="${f1(top + 11)}" width="${f1(bw)}" height="10" rx="2" fill="${g.col}" fill-opacity="0.82"/>`
        + txt(rx0 + 6 + bw + 4, top + 19, g.est, { size: 6.5, weight: 700, fill: g.col });
    }).join('');
    return {
      title: 'Goodman-Bacon 交错 DID 2×2 分解诊断',
      badge: 'TWFE=+0.29 · 净=+0.44',
      body: legendChips([
        { label: '早vs未', color: ink.primary, kind: 'dot' },
        { label: '晚vs未', color: ink.secondary, kind: 'box' },
        { label: '早vs晚', color: ink.accent4, kind: 'dot' },
        { label: '晚vs早(禁忌)', color: ink.opposite, kind: 'dot' },
      ], 42, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, yTicks: lyTicks, xTicks: lxTicks, box: true, yTitle: '2×2 估计值 β̂_k', xTitle: 'Bacon 分解权重 w_k' }, ink)
        + `<line x1="${lx0}" y1="${f1(lyMap(0))}" x2="${lx1}" y2="${f1(lyMap(0))}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + `<line x1="${lx0}" y1="${f1(lyMap(0.44))}" x2="${lx1}" y2="${f1(lyMap(0.44))}" stroke="${ink.primary}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${lx0}" y1="${f1(lyMap(0.29))}" x2="${lx1}" y2="${f1(lyMap(0.29))}" stroke="${ink.axis}" stroke-width="1.1" stroke-dasharray="3 2"/>`
        + txt(lx1 - 4, lyMap(0.44) - 3, '净对照 +0.44', { size: 6.2, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(lx1 - 4, lyMap(0.29) - 3, 'TWFE +0.29', { size: 6.2, weight: 700, fill: ink.axis, anchor: 'end' })
        + pts.map(markerSvg).join('')
        + `<rect x="${rx0}" y="${ry0}" width="${rx1 - rx0}" height="${ry1 - ry0}" rx="4" fill="${ink.surface}" fill-opacity="0.7" stroke="${ink.border}" stroke-width="0.9"/>`
        + bars
        + txt((rx0 + rx1) / 2, ry1 + 23, '四类 2×2 权重与均值', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle' }),
    };
  },

  ab_sequential_pvalue: (ink: ResolvedInk) => {
    const x0 = 48, x1 = 338, ty0 = 46, ty1 = 136, by0 = 148, by1 = 192;
    const looks = [0.2, 0.35, 0.5, 0.65, 0.8, 1.0];
    const xMap = (t: number) => x0 + 10 + ((t - 0.2) / 0.8) * (x1 - x0 - 20);
    const pyMap = (p: number) => ty1 - (p / 0.11) * (ty1 - ty0);
    const ayMap = (a: number) => by1 - (a / 0.06) * (by1 - by0);
    const xTicks = [0.2, 0.4, 0.6, 0.8, 1.0].map(t => ({ pos: xMap(t), label: `${Math.round(t * 100)}%` }));
    const pyTicks = [0.00, 0.02, 0.05, 0.10].map(v => ({ pos: pyMap(v), label: v.toFixed(2) }));
    const ayTicks = [0.00, 0.025, 0.05].map(v => ({ pos: ayMap(v), label: v.toFixed(3) }));
    const obfBoundary: [number, number][] = [[0.2, 0.002], [0.35, 0.007], [0.5, 0.015], [0.65, 0.024], [0.8, 0.034], [1.0, 0.044]];
    const obsP: [number, number][] = [[0.2, 0.088], [0.35, 0.062], [0.5, 0.036], [0.65, 0.014], [0.8, 0.008], [1.0, 0.004]];
    const cumAlpha: [number, number][] = [[0.2, 0.002], [0.35, 0.008], [0.5, 0.018], [0.65, 0.029], [0.8, 0.040], [1.0, 0.050]];
    const obfPts = obfBoundary.map(([t, a]) => [xMap(t), pyMap(a)] as [number, number]);
    const obsPts = obsP.map(([t, p]) => [xMap(t), pyMap(p)] as [number, number]);
    const cumPts = cumAlpha.map(([t, a]) => [xMap(t), ayMap(a)] as [number, number]);
    const hitPt = obsPts[3];
    return {
      title: 'A/B 实验序贯 α 消耗边界与实时 p 值监控',
      badge: '65%流量跨越 OBF 边界',
      body: legendChips([
        { label: '实时 p 值轨迹', color: ink.primary, kind: 'line' },
        { label: 'OBF α 消耗边界', color: ink.opposite, kind: 'dash' },
        { label: '累积 α 预算 (0.05)', color: ink.secondary, kind: 'box' },
      ], 48, 39, ink)
        + axesFrame({ x0, y0: ty0, x1, y1: ty1, yTicks: pyTicks, xTicks: [], box: true, yTitle: '实时 p 值' }, ink)
        + axesFrame({ x0, y0: by0, x1, y1: by1, yTicks: ayTicks, xTicks, box: true, yTitle: '累积 α', xTitle: '序贯信息量进度 (样本比 n/N_max)' }, ink)
        + `<line x1="${x0}" y1="${f1(pyMap(0.05))}" x2="${x1}" y2="${f1(pyMap(0.05))}" stroke="${ink.lightMuted}" stroke-width="0.95" stroke-dasharray="3 2"/>`
        + txt(x0 + 4, pyMap(0.05) - 3.5, '固定 p=0.05 (Peeking 假阳性陷阱)', { size: 6.2, fill: ink.muted })
        + `<path d="${smoothCurvePath(obfPts)}" stroke="${ink.opposite}" stroke-width="1.7" stroke-dasharray="4 2"/>`
        + `<polyline points="${polyStr(obsPts)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + obsPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i === 3 ? 4.0 : 2.3}" fill="${i === 3 ? ink.opposite : ink.primary}" stroke="${ink.surface}" stroke-width="0.8"/>`).join('')
        + `<line x1="${f1(hitPt[0])}" y1="${ty0}" x2="${f1(hitPt[0])}" y2="${by1}" stroke="${ink.opposite}" stroke-width="0.95" stroke-dasharray="2.5 2"/>`
        + pill(hitPt[0] + 6, ty0 + 8, '65% 达标停试 (p=0.014 < α_t)', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.2, h: 13 })
        + `<line x1="${x0}" y1="${f1(ayMap(0.05))}" x2="${x1}" y2="${f1(ayMap(0.05))}" stroke="${ink.opposite}" stroke-width="0.8" stroke-dasharray="2.5 2"/>`
        + `<polygon points="${polyStr([[xMap(0.2), by1], ...cumPts, [xMap(1.0), by1]])}" fill="${ink.secondary}" fill-opacity="0.22"/>`
        + `<polyline points="${polyStr(cumPts)}" stroke="${ink.secondary}" stroke-width="1.8"/>`
        + looks.map((t, i) => `<circle cx="${f1(cumPts[i][0])}" cy="${f1(cumPts[i][1])}" r="2.0" fill="${ink.secondary}"/>`).join(''),
    };
  },

  mediation_sem_path: (ink: ResolvedInk) => {
    const arrowLine = (x1: number, y1: number, x2: number, y2: number, col: string, w = 1.4, dash = '') => {
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const ex = x2 - Math.cos((ang * Math.PI) / 180) * 3.5;
      const ey = y2 - Math.sin((ang * Math.PI) / 180) * 3.5;
      return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
        + arrowPoly(x2, y2, ang, 4.4, col);
    };
    const latent = (cx: number, cy: number, rx: number, ry: number, label: string, fill: string, stroke: string) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`
      + txt(cx, cy + 2.6, label, { size: 7.0, weight: 700, fill: stroke, anchor: 'middle' });
    const obsBox = (x: number, y: number, w: number, h: number, label: string) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${ink.surface}" stroke="${ink.axis}" stroke-width="0.9"/>`
      + txt(x + w / 2, y + h / 2 + 2.4, label, { size: 6.4, weight: 600, fill: ink.text, anchor: 'middle' });
    const errNode = (cx: number, cy: number, label: string) =>
      `<circle cx="${cx}" cy="${cy}" r="5.4" fill="${ink.surface}" stroke="${ink.lightMuted}" stroke-width="0.8"/>`
      + txt(cx, cy + 2.0, label, { size: 5.5, fill: ink.muted, anchor: 'middle' });

    const measSvg =
      obsBox(26, 94, 22, 14, 'x1') + errNode(14, 101, 'δ1') + arrowLine(19.5, 101, 26, 101, ink.lightMuted, 0.9)
      + arrowLine(66, 118, 48, 102, ink.secondary, 1.0) + txt(51, 106, '0.81', { size: 5.8, fill: ink.secondary, anchor: 'end' })
      + obsBox(26, 139, 22, 14, 'x2') + errNode(14, 146, 'δ2') + arrowLine(19.5, 146, 26, 146, ink.lightMuted, 0.9)
      + arrowLine(66, 130, 48, 145, ink.secondary, 1.0) + txt(51, 146, '0.85', { size: 5.8, fill: ink.secondary, anchor: 'end' })
      + obsBox(174, 189, 24, 14, 'm1') + errNode(161, 196, 'ε1') + arrowLine(166.5, 196, 174, 196, ink.lightMuted, 0.9)
      + arrowLine(197, 168, 186, 189, ink.primary, 1.0) + txt(182, 181, '0.79', { size: 5.8, fill: ink.primary, anchor: 'end' })
      + obsBox(214, 189, 24, 14, 'm2') + errNode(251, 196, 'ε2') + arrowLine(245.5, 196, 238, 196, ink.lightMuted, 0.9)
      + arrowLine(215, 168, 226, 189, ink.primary, 1.0) + txt(230, 181, '0.84', { size: 5.8, fill: ink.primary })
      + obsBox(329, 94, 22, 14, 'y1') + errNode(340, 77, 'ε3') + arrowLine(340, 82.5, 340, 94, ink.lightMuted, 0.9)
      + arrowLine(318, 118, 329, 103, ink.opposite, 1.0) + txt(321, 106, '0.83', { size: 5.8, fill: ink.opposite, anchor: 'end' })
      + obsBox(329, 139, 22, 14, 'y2') + errNode(340, 170, 'ε4') + arrowLine(340, 164.5, 340, 153, ink.lightMuted, 0.9)
      + arrowLine(318, 130, 329, 145, ink.opposite, 1.0) + txt(321, 146, '0.87', { size: 5.8, fill: ink.opposite, anchor: 'end' });

    const residSvg =
      errNode(246, 178, 'ζ1') + arrowLine(241, 174, 228, 164, ink.muted, 1.0) + txt(254, 180, '0.52', { size: 5.9, fill: ink.muted })
      + errNode(292, 76, 'ζ2') + arrowLine(292, 82, 292, 109, ink.muted, 1.0) + txt(301, 79, '0.41', { size: 5.9, fill: ink.muted });

    const structSvg =
      `<path d="M 92 110 Q 98 63, 129 57" stroke="${ink.muted}" stroke-width="1.0" stroke-dasharray="2.5 2"/>`
      + txt(98, 76, 'r=0.31', { size: 6.0, fill: ink.muted })
      + arrowLine(117, 131, 177, 151, ink.primary, 1.8) + txt(145, 149, 'a1=0.48***', { size: 6.4, weight: 700, fill: ink.primary, anchor: 'middle' })
      + arrowLine(177, 65, 200, 139, ink.secondary, 1.4) + txt(201, 95, 'a2=0.26**', { size: 6.2, weight: 600, fill: ink.secondary })
      + arrowLine(166, 106, 191, 141, ink.opposite, 1.8) + txt(166, 125, 'a3=0.19**', { size: 6.3, weight: 700, fill: ink.opposite, anchor: 'end' })
      + arrowLine(233, 148, 265, 130, ink.primary, 1.8) + txt(253, 148, 'b=0.44***', { size: 6.4, weight: 700, fill: ink.primary })
      + arrowLine(120, 124, 263, 124, ink.axis, 1.2, '3.5 2') + txt(225, 120, "c'=0.21*", { size: 6.3, weight: 600, fill: ink.axis, anchor: 'middle' });

    return {
      title: 'SEM 中介—调节路径与残差拓扑',
      badge: 'CFI=0.962 · RMSEA=0.044',
      body: measSvg + residSvg + structSvg
        + latent(92, 124, 28, 14, 'X 感知质量', ink.secondarySoft, ink.secondary)
        + latent(158, 56, 28, 13, 'W 制度信任', ink.secondarySoft, ink.accent4)
        + `<rect x="128" y="86" width="60" height="20" rx="4" fill="${ink.oppositeSoft}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3 2"/>`
        + txt(158, 98.5, 'X×W 交互项', { size: 6.6, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + latent(206, 154, 28, 14, 'M 平台认同', ink.primarySoft, ink.primary)
        + latent(292, 124, 28, 14, 'Y 持续意愿', ink.oppositeSoft, ink.opposite)
        + pill(12, 198, 'SRMR=0.038 · χ²/df=2.14', { bg: ink.surface, stroke: ink.border, color: ink.axis, size: 6.1, h: 13.5 })
        + pill(348, 198, 'IMM=0.084* [0.02, 0.16]', { bg: ink.primarySoft, stroke: ink.primary, color: ink.primary, size: 6.1, h: 13.5, align: 'right' }),
    };
  },

  moderated_slopes_jn: (ink: ResolvedInk) => {
    const x0 = 46, x1 = 336, ty0 = 48, ty1 = 160, by0 = 166, by1 = 192;
    const xMap = (w: number) => x0 + ((w + 2.5) / 5.0) * (x1 - x0);
    const yMap = (s: number) => ty1 - ((s + 0.35) / 1.45) * (ty1 - ty0);
    const xTicks = [-2, -1, 0, 1, 2].map(v => ({ pos: xMap(v), label: `${v > 0 ? '+' : ''}${v}SD` }));
    const yTicks = [-0.2, 0.2, 0.6, 1.0].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const slopeFn = (w: number) => 0.28 + 0.24 * w;
    const seFn = (w: number) => Math.sqrt(0.0046 + 0.0020 * w * w);
    const wStar = -0.35;
    const wsL = [-2.4, -2.0, -1.5, -1.0, -0.65, wStar];
    const wsR = [wStar, 0.0, 0.5, 1.0, 1.5, 2.0, 2.4];
    const toBand = (ws: readonly number[], sign: number): [number, number][] =>
      ws.map(w => [xMap(w), Math.max(ty0 + 2, Math.min(ty1 - 2, yMap(slopeFn(w) + sign * 1.96 * seFn(w))))]);
    const xStar = xMap(wStar);
    const histCounts = [2, 4, 7, 11, 16, 22, 30, 38, 44, 48, 45, 39, 32, 24, 17, 11, 6, 3];
    const bw = (x1 - x0 - 12) / histCounts.length;
    const histBars = histCounts.map((c, i) => {
      const wVal = -2.3 + (i + 0.5) * (4.6 / histCounts.length);
      const bx = x0 + 6 + i * bw;
      const bh = (c / 52) * (by1 - by0 - 3);
      return `<rect x="${f1(bx + 0.6)}" y="${f1(by1 - bh)}" width="${f1(bw - 1.2)}" height="${f1(bh)}" fill="${wVal >= wStar ? ink.secondary : ink.lightMuted}" fill-opacity="${wVal >= wStar ? 0.65 : 0.42}"/>`;
    }).join('');
    return {
      title: 'Johnson-Neyman 调节显著区间带',
      badge: '显著阈 W*=-0.35 (68%)',
      body: legendChips([
        { label: '显著正向调节区 (p<0.05)', color: ink.primary, kind: 'box' },
        { label: '条件斜率 95% CI', color: ink.secondary, kind: 'line' },
        { label: '临界阈值 W*', color: ink.opposite, kind: 'dash' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0: ty0, x1, y1: ty1, yTicks, xTicks: [], box: true, yTitle: '条件斜率 θ(W)' }, ink)
        + axesFrame({ x0, y0: by0, x1, y1: by1, xTicks, hGrid: false, box: true, xTitle: '调节变量 W (制度信任标准化值及样本分布)' }, ink)
        + `<rect x="${x0}" y="${ty0}" width="${f1(xStar - x0)}" height="${ty1 - ty0}" fill="${ink.lightMuted}" fill-opacity="0.14"/>`
        + `<rect x="${f1(xStar)}" y="${ty0}" width="${f1(x1 - xStar)}" height="${ty1 - ty0}" fill="${ink.primary}" fill-opacity="0.10"/>`
        + bandPolygon(toBand(wsL, 1), toBand(wsL, -1), ink.muted, 0.20)
        + bandPolygon(toBand(wsR, 1), toBand(wsR, -1), ink.primary, 0.22)
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.95" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xStar)}" y1="${ty0}" x2="${f1(xStar)}" y2="${by1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xMap(wsL[0]))}" y1="${f1(yMap(slopeFn(wsL[0])))}" x2="${f1(xStar)}" y2="${f1(yMap(slopeFn(wStar)))}" stroke="${ink.muted}" stroke-width="1.8" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xStar)}" y1="${f1(yMap(slopeFn(wStar)))}" x2="${f1(xMap(wsR[wsR.length - 1]))}" y2="${f1(yMap(slopeFn(wsR[wsR.length - 1])))}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<polyline points="${polyStr(toBand(wsR, -1))}" stroke="${ink.primary}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<polyline points="${polyStr(toBand(wsR, 1))}" stroke="${ink.primary}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<circle cx="${f1(xStar)}" cy="${f1(yMap(0))}" r="3.4" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.9"/>`
        + txt(xStar + 5, yMap(0) - 5, 'J-N 边界 W*=-0.35', { size: 6.4, weight: 700, fill: ink.opposite })
        + txt(x0 + 6, ty0 + 11, '不显著区 (CI 含 0)', { size: 6.3, fill: ink.muted })
        + txt(x1 - 6, ty0 + 11, '显著正向区 (68.4% 样本)', { size: 6.3, weight: 700, fill: ink.primary, anchor: 'end' })
        + histBars,
    };
  },

  panel_fe_event_window: (ink: ResolvedInk) => {
    const ks = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    const twfe = [-0.03, 0.04, -0.02, 0.02, 0.0, 0.19, 0.33, 0.44, 0.49, 0.52, 0.50];
    const sunAbr = [-0.02, 0.03, -0.01, 0.01, 0.0, 0.21, 0.36, 0.47, 0.53, 0.55, 0.54];
    const ses = [0.068, 0.062, 0.056, 0.052, 0.0, 0.054, 0.058, 0.062, 0.065, 0.068, 0.070];
    const x0 = 46, y0 = 48, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - ((v + 0.26) / 0.96) * (y1 - y0);
    const yTicks = [-0.2, 0.0, 0.2, 0.4, 0.6].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xTicks = evenlySpacedTicks(x0 + 15, x1 - 15, ks.map(k => (k > 0 ? `+${k}` : String(k))));
    const xShock = (xTicks[4].pos + xTicks[5].pos) / 2;
    const ptsSvg = ks.map((k, i) => {
      const cx = xTicks[i].pos, cy = yMap(twfe[i]), col = k >= 0 ? ink.primary : ink.secondary;
      const sx = cx + 4.2, sy = yMap(sunAbr[i]);
      const ci95 = k === -1 ? '' : errV(cx, yMap(twfe[i] + 1.96 * ses[i]), yMap(twfe[i] - 1.96 * ses[i]), col, 2.8);
      const ci90 = k === -1 ? '' : `<line x1="${f1(cx)}" y1="${f1(yMap(twfe[i] + 1.645 * ses[i]))}" x2="${f1(cx)}" y2="${f1(yMap(twfe[i] - 1.645 * ses[i]))}" stroke="${col}" stroke-width="2.4"/>`;
      const saMark = k === -1 ? '' : `<polygon points="${f1(sx)},${f1(sy - 3)} ${f1(sx + 3)},${f1(sy)} ${f1(sx)},${f1(sy + 3)} ${f1(sx - 3)},${f1(sy)}" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.1"/>`;
      return ci95 + ci90
        + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="3.1" fill="${k === -1 ? ink.surface : col}" stroke="${col}" stroke-width="1.3"/>`
        + saMark;
    }).join('');
    return {
      title: 'TWFE 动态事件研究窗与前驱检验',
      badge: 'Pre-F p=0.74 · ATT=+0.42***',
      body: legendChips([
        { label: 'TWFE (90%/95% CI)', color: ink.primary, kind: 'dot' },
        { label: 'Sun-Abraham IW', color: ink.opposite, kind: 'dot' },
        { label: '前驱平行校验窗', color: ink.secondary, kind: 'box' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '动态事件研究系数 β_k', xTitle: '相对政策冲击事件窗 k (t=-1 为基期参照)' }, ink)
        + `<rect x="${x0}" y="${y0}" width="${f1(xShock - x0)}" height="${y1 - y0}" fill="${ink.secondarySoft}" fill-opacity="0.28"/>`
        + `<rect x="${f1(xShock)}" y="${y0}" width="${f1(x1 - xShock)}" height="${y1 - y0}" fill="${ink.primarySoft}" fill-opacity="0.24"/>`
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xShock)}" y1="${y0}" x2="${f1(xShock)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr(xTicks.map((t, i) => [t.pos, yMap(twfe[i])]))}" stroke="${ink.primary}" stroke-width="1.3" stroke-opacity="0.7"/>`
        + ptsSvg
        + pill(x0 + 6, y0 + 6, '前驱联合检验 F=0.48 (p=0.74)', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.1, h: 13.5 })
        + pill(x1 - 6, y1 - 19, '冲击后均值 ATT=+0.42***', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.1, h: 13.5, align: 'right' }),
    };
  },

  qca_xy_necessity: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 190, y1 = 192;
    const xMap = (v: number) => x0 + v * (x1 - x0);
    const yMap = (v: number) => y1 - v * (y1 - y0);
    const ticks = [0.0, 0.5, 1.0].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = [0.0, 0.5, 1.0].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const typical: [number, number, string][] = [
      [0.82, 0.91, '杭'], [0.76, 0.88, '甬'], [0.90, 0.94, '苏'], [0.68, 0.78, ''], [0.62, 0.72, ''], [0.85, 0.86, ''], [0.56, 0.64, ''], [0.72, 0.80, ''],
    ];
    const altPath: [number, number][] = [[0.24, 0.78], [0.32, 0.84], [0.18, 0.66], [0.42, 0.74]];
    const contra: [number, number][] = [[0.72, 0.34], [0.64, 0.42]];
    const lowCases: [number, number][] = [[0.14, 0.18], [0.22, 0.28], [0.35, 0.24], [0.28, 0.40], [0.44, 0.36], [0.16, 0.34]];
    const metrics = [
      { lbl: '充分一致性 Cons', val: 0.892, thr: 0.80, col: ink.primary },
      { lbl: 'PRI 一致性', val: 0.841, thr: 0.70, col: ink.primary },
      { lbl: '原始覆盖度 Cov', val: 0.684, thr: 0.0, col: ink.secondary },
      { lbl: '唯一覆盖度 U-Cov', val: 0.215, thr: 0.0, col: ink.accent4 },
    ];
    const bx0 = 208, bw = 136;
    const barsSvg = metrics.map((m, i) => {
      const ry = 76 + i * 21;
      const fillW = m.val * bw;
      return txt(bx0, ry - 3, m.lbl, { size: 6.4, weight: 600, fill: ink.text })
        + txt(bx0 + bw, ry - 3, m.val.toFixed(3), { size: 6.4, weight: 700, fill: m.col, anchor: 'end' })
        + `<rect x="${bx0}" y="${ry}" width="${bw}" height="7.5" rx="2" fill="${ink.grid}" fill-opacity="0.55"/>`
        + `<rect x="${bx0}" y="${ry}" width="${f1(fillW)}" height="7.5" rx="2" fill="${m.col}" fill-opacity="0.82"/>`
        + (m.thr > 0 ? `<line x1="${f1(bx0 + m.thr * bw)}" y1="${ry - 1.5}" x2="${f1(bx0 + m.thr * bw)}" y2="${ry + 9}" stroke="${ink.opposite}" stroke-width="1.2"/>` : '');
    }).join('');
    return {
      title: 'fsQCA 模糊集 XY 一致性—覆盖度图',
      badge: 'Cons=0.892 · Cov=0.684',
      body: legendChips([
        { label: '典型一致 (Y>=X)', color: ink.primary, kind: 'dot' },
        { label: '替代路径', color: ink.secondary, kind: 'dot' },
        { label: '逻辑矛盾案例', color: ink.opposite, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks: ticks, box: true, yTitle: '结果隶属度 Y', xTitle: '组态条件隶属度 X' }, ink)
        + `<polygon points="${x0},${y0} ${x1},${y0} ${x0},${y1}" fill="${ink.primary}" fill-opacity="0.09"/>`
        + `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y0}" stroke="${ink.primary}" stroke-width="1.2"/>`
        + `<line x1="${f1(xMap(0.5))}" y1="${y0}" x2="${f1(xMap(0.5))}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${f1(yMap(0.5))}" x2="${x1}" y2="${f1(yMap(0.5))}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="3 2"/>`
        + lowCases.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.4" fill="${ink.lightMuted}" fill-opacity="0.72"/>`).join('')
        + altPath.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.8" fill="${ink.secondary}" fill-opacity="0.85"/>`).join('')
        + typical.map(([x, y, l]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="3.1" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="0.7"/>` + (l ? txt(xMap(x) + 4, yMap(y) + 2, l, { size: 5.9, weight: 700, fill: ink.primary }) : '')).join('')
        + contra.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="3.4" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.6"/>`).join('')
        + txt(xMap(0.75), yMap(0.20), '矛盾案例区', { size: 6.2, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + `<rect x="202" y="48" width="146" height="144" rx="4" fill="${ink.surface}" stroke="${ink.border}" stroke-width="0.8"/>`
        + txt(208, 61, '组态 H1: 基建 * 信任 * ~摩擦', { size: 6.6, weight: 700, fill: ink.primary })
        + barsSvg
        + `<line x1="208" y1="158" x2="342" y2="158" stroke="${ink.grid}" stroke-width="0.8"/>`
        + txt(208, 171, '必要性检验: Cons_nec=0.918', { size: 6.2, weight: 700, fill: ink.secondary })
        + txt(208, 183, '矛盾案例占比: 4.8% (2/42)', { size: 6.1, fill: ink.opposite }),
    };
  },

  counterfactual_synthetic_ctrl: (ink: ResolvedInk) => {
    const yrs = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
    const treat = [3.12, 3.24, 3.31, 3.44, 3.51, 3.74, 3.96, 4.18, 4.34, 4.48];
    const synth = [3.13, 3.23, 3.32, 3.43, 3.52, 3.57, 3.63, 3.69, 3.74, 3.79];
    const lx0 = 42, ly0 = 48, lx1 = 198, ly1 = 190;
    const lxMap = (i: number) => lx0 + 8 + (i / (yrs.length - 1)) * (lx1 - lx0 - 16);
    const lyMap = (v: number) => ly1 - ((v - 3.0) / 1.65) * (ly1 - ly0);
    const lxTicks = [0, 3, 6, 9].map(i => ({ pos: lxMap(i), label: String(yrs[i]) }));
    const lyTicks = [3.0, 3.5, 4.0, 4.5].map(v => ({ pos: lyMap(v), label: v.toFixed(1) }));
    const tPts: [number, number][] = yrs.map((_, i) => [lxMap(i), lyMap(treat[i])]);
    const sPts: [number, number][] = yrs.map((_, i) => [lxMap(i), lyMap(synth[i])]);
    const xShock = (lxMap(4) + lxMap(5)) / 2;

    const units = [
      ['试点城市', 11.8, true],
      ['对照城市 A', 3.4, false],
      ['对照城市 B', 2.7, false],
      ['对照城市 C', 2.2, false],
      ['对照城市 D', 1.8, false],
      ['对照城市 E', 1.4, false],
      ['对照城市 F', 1.1, false],
      ['对照城市 G', 0.8, false],
    ] as const;
    const rx0 = 252, ry0 = 54, rx1 = 342, ry1 = 178;
    const rowH = (ry1 - ry0) / units.length;
    const rScale = (v: number) => (v / 13.5) * (rx1 - rx0);
    const rankBars = units.map(([lbl, ratio, isT], i) => {
      const cy = ry0 + (i + 0.5) * rowH;
      const bw = rScale(ratio);
      return txt(rx0 - 4, cy + 2.2, lbl, { size: 6.1, weight: isT ? 700 : 500, fill: isT ? ink.primary : ink.muted, anchor: 'end' })
        + `<rect x="${rx0}" y="${f1(cy - 4.2)}" width="${f1(bw)}" height="8.4" rx="1.5" fill="${isT ? ink.primary : ink.lightMuted}" fill-opacity="${isT ? 0.88 : 0.60}"/>`
        + txt(rx0 + bw + 3, cy + 2.2, `${ratio.toFixed(1)}×`, { size: 6.1, weight: isT ? 700 : 500, fill: isT ? ink.primary : ink.muted });
    }).join('');
    return {
      title: 'SCM 反事实拟合与 RMSPE 比置换排序',
      badge: 'Post/Pre=11.8 · p=0.048',
      body: legendChips([
        { label: '实际试点区', color: ink.primary, kind: 'line' },
        { label: '合成控制组', color: ink.opposite, kind: 'dash' },
        { label: '安慰剂对照比', color: ink.lightMuted, kind: 'box' },
      ], 42, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, yTicks: lyTicks, xTicks: lxTicks, box: true, yTitle: '核心指标 Y', xTitle: '反事实轨迹贴合' }, ink)
        + bandPolygon(tPts.slice(4), sPts.slice(4), ink.primary, 0.16)
        + `<line x1="${f1(xShock)}" y1="${ly0}" x2="${f1(xShock)}" y2="${ly1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr(sPts)}" stroke="${ink.opposite}" stroke-width="1.8" stroke-dasharray="4 2"/>`
        + `<polyline points="${polyStr(tPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + pill(lx0 + 6, ly0 + 6, 'Pre-RMSPE=0.032', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.0, h: 13 })
        + txt(296, 48, 'Post/Pre RMSPE 比值排序', { size: 6.8, weight: 700, fill: ink.text, anchor: 'middle' })
        + `<line x1="${rx0}" y1="${ry0}" x2="${rx0}" y2="${ry1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + rankBars
        + pill(296, 184, 'Rank 1/21 · 置换 p=0.048', { bg: ink.primarySoft, stroke: ink.primary, color: ink.primary, size: 6.2, h: 13.5, align: 'center' }),
    };
  },

  // =========================================================================
  // 6. ML & EXPLAINABILITY (机器学习与可解释) - 24 types
  // =========================================================================
  shap_beeswarm: (ink: ResolvedInk) => {
    const feats = [
      ['系统信任度', [-0.42, -0.28, -0.14, 0.08, 0.16, 0.25, 0.34, 0.44, 0.52, 0.62]],
      ['使用频率', [-0.36, -0.22, -0.08, 0.06, 0.14, 0.24, 0.32, 0.41, 0.48]],
      ['价格敏感度', [-0.48, -0.34, -0.24, -0.12, 0.05, 0.14, 0.22, 0.31]],
      ['操作流畅感', [-0.26, -0.16, -0.06, 0.04, 0.11, 0.19, 0.27, 0.34]],
      ['受访者年龄', [-0.22, -0.14, -0.04, 0.03, 0.09, 0.15, 0.22]],
    ] as const;
    const x0 = 74, y0 = 42, x1 = 304, y1 = 192;
    const xMap = (v: number) => x0 + ((v + 0.6) / 1.3) * (x1 - x0);
    const xTicks = [-0.4, -0.2, 0, 0.2, 0.4, 0.6].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const rowH = (y1 - y0) / feats.length;
    const zeroX = xMap(0);
    const rows = feats.map(([lbl, vals], ri) => {
      const cy = y0 + (ri + 0.5) * rowH;
      const dots = vals.map((v, di) => {
        const t = di / (vals.length - 1);
        const col = mixHex(ink.secondary, ink.opposite, ri === 2 ? 1 - t : t);
        const jy = ((di % 3) - 1) * 3.2;
        return `<circle cx="${f1(xMap(v))}" cy="${f1(cy + jy)}" r="2.6" fill="${col}" fill-opacity="0.82"/>`;
      }).join('');
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.3, weight: 600, fill: ink.text, anchor: 'end' })
        + `<line x1="${x0}" y1="${f1(cy)}" x2="${x1}" y2="${f1(cy)}" stroke="${ink.grid}" stroke-width="0.6"/>`
        + dots;
    }).join('');
    const barColors = [ink.opposite, mixHex(ink.opposite, ink.secondary, 0.33), mixHex(ink.opposite, ink.secondary, 0.66), ink.secondary];
    return {
      title: 'SHAP 全局特征归因蜂群排序图',
      badge: 'XGBoost · n=506',
      body: axesFrame({ x0, y0, x1, y1, xTicks, hGrid: false, xTitle: 'SHAP 值 (对采纳概率的边际影响)' }, ink)
        + `<line x1="${f1(zeroX)}" y1="${y0}" x2="${f1(zeroX)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3 2"/>`
        + rows
        + colorbarV(314, 52, 8, 124, barColors, '低值', '高值', '特征', ink),
    };
  },

  shap_composite: (ink: ResolvedInk) => {
    const feats = [
      ['系统信任度', 0.38, [-0.28, -0.14, 0.08, 0.22, 0.36, 0.52]],
      ['使用频率', 0.31, [-0.22, -0.1, 0.06, 0.18, 0.31, 0.44]],
      ['价格敏感度', 0.24, [-0.4, -0.24, -0.1, 0.08, 0.18, 0.28]],
      ['售后保障感', 0.16, [-0.18, -0.06, 0.04, 0.12, 0.2, 0.28]],
    ] as const;
    const xL0 = 72, xL1 = 172, xR0 = 192, xR1 = 336, y0 = 46, y1 = 190;
    const rowH = (y1 - y0) / feats.length;
    const xZeroR = xR0 + 64;
    const rows = feats.map(([lbl, imp, vals], i) => {
      const cy = y0 + (i + 0.5) * rowH, bw = (imp / 0.45) * (xL1 - xL0);
      const dots = vals.map((v, di) => {
        const col = mixHex(ink.secondary, ink.opposite, di / (vals.length - 1));
        return `<circle cx="${f1(xZeroR + v * 135)}" cy="${f1(cy + ((di % 3) - 1) * 3)}" r="2.7" fill="${col}" fill-opacity="0.85"/>`;
      }).join('');
      return txt(xL0 - 5, cy + 2.5, lbl, { size: 7.2, weight: 600, fill: ink.text, anchor: 'end' })
        + `<rect x="${xL0}" y="${f1(cy - 6)}" width="${f1(bw)}" height="12" rx="2" fill="${ink.primary}" fill-opacity="0.78"/>`
        + txt(xL0 + bw + 3, cy + 2.5, imp.toFixed(2), { size: 6.7, weight: 700, fill: ink.primary })
        + `<line x1="${xR0}" y1="${f1(cy)}" x2="${xR1}" y2="${f1(cy)}" stroke="${ink.grid}" stroke-width="0.6"/>`
        + dots;
    }).join('');
    return {
      title: 'SHAP 平均贡献 + 方向蜂群双联图',
      badge: '左: |SHAP| · 右: 方向',
      body: txt((xL0 + xL1) / 2, 40, '平均绝对重要度', { size: 7.2, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt((xR0 + xR1) / 2, 40, '个体特征取值与归因方向', { size: 7.2, weight: 700, fill: ink.axis, anchor: 'middle' })
        + `<line x1="${xL0}" y1="${y0}" x2="${xL0}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + `<line x1="${xL0}" y1="${y1}" x2="${xL1}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + `<line x1="${xZeroR}" y1="${y0}" x2="${xZeroR}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${xR0}" y1="${y1}" x2="${xR1}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + txt(xZeroR, y1 + 12, 'SHAP = 0', { size: 7, fill: ink.muted, anchor: 'middle' })
        + rows,
    };
  },

  shap_waterfall: (ink: ResolvedInk) => {
    const steps = [
      ['信任=4.6分', 0.38, 0.57, '+0.19'],
      ['频次=高频', 0.57, 0.71, '+0.14'],
      ['价格=偏高', 0.71, 0.63, '-0.08'],
      ['推荐=强口碑', 0.63, 0.72, '+0.09'],
      ['其他3特征', 0.72, 0.76, '+0.04'],
    ] as const;
    const x0 = 80, y0 = 46, x1 = 336, y1 = 190;
    const xMap = (v: number) => x0 + ((v - 0.2) / 0.7) * (x1 - x0);
    const xTicks = [0.2, 0.4, 0.6, 0.8].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const rowH = (y1 - y0) / steps.length;
    const xBase = xMap(0.38), xPred = xMap(0.76);
    const bars = steps.map(([lbl, s, e, tag], i) => {
      const cy = y0 + (i + 0.5) * rowH, xs = xMap(s), xe = xMap(e);
      const pos = e >= s, c = pos ? ink.primary : ink.opposite;
      const rx = Math.min(xs, xe), rw = Math.abs(xe - xs);
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.2, fill: ink.text, anchor: 'end' })
        + `<rect x="${f1(rx)}" y="${f1(cy - 7)}" width="${f1(rw)}" height="14" rx="2" fill="${c}" fill-opacity="0.82"/>`
        + txt(Math.max(xs, xe) + 4, cy + 2.5, tag, { size: 7, weight: 700, fill: c });
    }).join('');
    return {
      title: '单样本 #142 SHAP 局部归因瀑布图',
      badge: 'E[f]=0.38 → f(x)=0.76',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '预测采纳概率路径' }, ink)
        + `<line x1="${f1(xBase)}" y1="${y0}" x2="${f1(xBase)}" y2="${y1}" stroke="${ink.muted}" stroke-width="1" stroke-dasharray="3 2"/>`
        + txt(xBase, y0 - 3, '基线 0.38', { size: 6.7, fill: ink.muted, anchor: 'middle' })
        + `<line x1="${f1(xPred)}" y1="${y0}" x2="${f1(xPred)}" y2="${y1}" stroke="${ink.primary}" stroke-width="1.2" stroke-dasharray="3 2"/>`
        + txt(xPred, y0 - 3, '预测 0.76', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'middle' })
        + bars,
    };
  },

  shap_dep: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 296, y1 = 192;
    const xTicks = [1, 2, 3, 4, 5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}.0` }));
    const yTicks = [-0.4, -0.2, 0, 0.2, 0.4].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(1) }));
    const yZero = y1 - 0.5 * (y1 - y0);
    const pts: [number, number, number][] = [
      [66, 166, 0.1], [82, 158, 0.2], [98, 148, 0.3], [116, 138, 0.2], [134, 130, 0.4], [150, 122, 0.5],
      [168, 114, 0.6], [186, 102, 0.7], [202, 92, 0.8], [218, 84, 0.85], [236, 76, 0.9], [254, 68, 0.95], [272, 62, 0.98],
      [176, 128, 0.25], [212, 112, 0.3], [248, 96, 0.35],
    ];
    const barColors = [ink.opposite, mixHex(ink.opposite, ink.secondary, 0.5), ink.secondary];
    return {
      title: 'SHAP 双特征交互依赖散点图',
      badge: '信任度 × 价格敏感',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '信任度 SHAP 值', xTitle: '系统信任评分 (1–5)' }, ink)
        + `<line x1="${x0}" y1="${f1(yZero)}" x2="${x1}" y2="${f1(yZero)}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath([[64, 164], [140, 128], [208, 92], [276, 66]])}" stroke="${ink.primary}" stroke-width="1.8" stroke-dasharray="4 2"/>`
        + pts.map(([x, y, cVal]) => `<circle cx="${x}" cy="${y}" r="3.1" fill="${mixHex(ink.secondary, ink.opposite, cVal)}" fill-opacity="0.86"/>`).join('')
        + colorbarV(308, 48, 9, 128, barColors, '低敏感', '高敏感', '交互项', ink),
    };
  },

  roc_auc: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const xTicks = ticks.map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v.toFixed(2) }));
    const yTicks = ticks.map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(2) }));
    const xgb: [number, number][] = [[x0, y1], [x0 + 8, 92], [x0 + 28, 62], [x0 + 68, 50], [x0 + 145, 45], [x1, y0]];
    const rf: [number, number][] = [[x0, y1], [x0 + 18, 108], [x0 + 48, 76], [x0 + 102, 58], [x0 + 185, 48], [x1, y0]];
    const logit: [number, number][] = [[x0, y1], [x0 + 36, 122], [x0 + 86, 88], [x0 + 148, 68], [x0 + 220, 54], [x1, y0]];
    return {
      title: '多模型受试者工作特征 ROC 曲线',
      badge: 'XGB AUC=0.914',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, vGrid: true, yTitle: '真正例率 TPR', xTitle: '假正例率 FPR (1 - 特异度)' }, ink)
        + `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y0}" stroke="${ink.lightMuted}" stroke-width="1.1" stroke-dasharray="4 3"/>`
        + `<path d="${smoothCurvePath(xgb)} L ${x1} ${y1} L ${x0} ${y1} Z" fill="${ink.primary}" fill-opacity="0.08"/>`
        + `<path d="${smoothCurvePath(logit)}" stroke="${ink.opposite}" stroke-width="1.5" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(rf)}" stroke="${ink.secondary}" stroke-width="1.7"/>`
        + `<path d="${smoothCurvePath(xgb)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<circle cx="${x0 + 28}" cy="62" r="3.6" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`
        + txt(x0 + 36, 65, 'Youden 最优点', { size: 6.9, weight: 700, fill: ink.opposite })
        + legendChips([{ label: 'XGBoost (0.914)', color: ink.primary, kind: 'line' }, { label: '随机森林 (0.882)', color: ink.secondary, kind: 'line' }, { label: 'Logit (0.836)', color: ink.opposite, kind: 'dash' }], 128, 174, ink),
    };
  },

  pr_curve: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const xTicks = ticks.map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v.toFixed(2) }));
    const yTicks = ticks.map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(2) }));
    const yBase = y1 - 0.32 * (y1 - y0);
    const pr1: [number, number][] = [[x0, 46], [116, 52], [186, 60], [244, 74], [292, 98], [x1, 145]];
    const pr2: [number, number][] = [[x0, 54], [108, 72], [176, 90], [236, 114], [286, 134], [x1, 154]];
    return {
      title: '精确率—召回率 PR 曲线评估',
      badge: 'XGB AP=0.874',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, vGrid: true, yTitle: '精确率 Precision', xTitle: '召回率 Recall' }, ink)
        + `<line x1="${x0}" y1="${f1(yBase)}" x2="${x1}" y2="${f1(yBase)}" stroke="${ink.lightMuted}" stroke-width="1.1" stroke-dasharray="4 3"/>`
        + txt(x0 + 6, yBase - 4, '正例基线率 = 0.32', { size: 6.9, fill: ink.muted })
        + `<path d="${smoothCurvePath(pr2)}" stroke="${ink.secondary}" stroke-width="1.7" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(pr1)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + legendChips([{ label: 'XGBoost (AP=0.87)', color: ink.primary, kind: 'line' }, { label: 'Logit (AP=0.76)', color: ink.secondary, kind: 'dash' }], 60, 178, ink),
    };
  },

  calibration_curve: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 166;
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const xTicks = ticks.map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v.toFixed(2) }));
    const yTicks = ticks.map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(2) }));
    const pts: [number, number][] = [[74, 152], [116, 132], [164, 108], [214, 88], [264, 70], [312, 52]];
    const hist = [22, 34, 28, 18, 14, 16, 24, 30, 20, 12];
    const bw = (x1 - x0) / hist.length;
    const hBars = hist.map((v, i) => `<rect x="${f1(x0 + i * bw + 2)}" y="${f1(194 - v * 0.65)}" width="${f1(bw - 4)}" height="${f1(v * 0.65)}" fill="${ink.secondary}" fill-opacity="0.35"/>`).join('');
    return {
      title: '预测概率校准可靠性曲线 (ECE)',
      badge: 'Brier=0.114 · ECE=0.03',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks: [], box: true, vGrid: true, yTitle: '观测正例比例' }, ink)
        + `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y0}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="4 2.5"/>`
        + `<polyline points="${polyStr(pts)}" stroke="${ink.primary}" stroke-width="2"/>`
        + pts.map(([x, y]) => errV(x, y - 6, y + 6, ink.primary, 2.5) + `<circle cx="${x}" cy="${y}" r="3.4" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="1"/>`).join('')
        + hBars
        + xTicks.map(t => txt(t.pos, 206, t.label, { size: 7, fill: ink.muted, anchor: 'middle' })).join('')
        + txt((x0 + x1) / 2, 217, '模型预测概率 (下条为样本分布密度)', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle' }),
    };
  },

  confusion_matrix: (ink: ResolvedInk) => {
    const labels = ['低意愿', '中立观望', '高采纳'];
    const counts = [
      [112, 14, 6],
      [16, 138, 18],
      [5, 17, 180],
    ];
    const pcts = [
      ['84.8%', '10.6%', '4.5%'],
      ['9.3%', '80.2%', '10.5%'],
      ['2.5%', '8.4%', '89.1%'],
    ];
    const x0 = 86, y0 = 46, cw = 72, ch = 46;
    let cells = '';
    for (let r = 0; r < 3; r++) {
      cells += txt(x0 - 8, y0 + r * ch + ch / 2 + 2.5, labels[r], { size: 7.5, weight: 600, fill: ink.text, anchor: 'end' });
      cells += txt(x0 + r * cw + cw / 2, y0 + 3 * ch + 13, labels[r], { size: 7.5, weight: 600, fill: ink.text, anchor: 'middle' });
      for (let c = 0; c < 3; c++) {
        const v = counts[r][c], op = Math.min(0.88, 0.08 + (v / 180) * 0.8);
        const rx = x0 + c * cw, ry = y0 + r * ch;
        const dark = op > 0.52;
        cells += `<rect x="${rx}" y="${ry}" width="${cw - 3}" height="${ch - 3}" rx="3" fill="${ink.primary}" fill-opacity="${f2(op)}" stroke="${ink.surface}" stroke-width="1"/>`
          + txt(rx + (cw - 3) / 2, ry + 20, `${v} 例`, { size: 8.2, weight: 700, fill: dark ? '#FFFFFF' : ink.text, anchor: 'middle' })
          + txt(rx + (cw - 3) / 2, ry + 33, pcts[r][c], { size: 7.1, fill: dark ? '#FFFFFF' : ink.muted, anchor: 'middle', opacity: dark ? 0.92 : 1 });
      }
    }
    return {
      title: '三分类模型混淆矩阵归一化热力图',
      badge: 'Macro-F1=0.842',
      body: cells
        + txt(30, y0 + 70, '真实类别', { size: 7.5, weight: 700, fill: ink.axis, anchor: 'middle', rotate: -90 })
        + txt(x0 + 108, 212, '模型预测类别', { size: 7.5, weight: 700, fill: ink.axis, anchor: 'middle' }),
    };
  },

  learning_curve: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 338, y1 = 192;
    const xTicks = [100, 200, 300, 400, 500].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [0.6, 0.7, 0.8, 0.9, 1.0].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(1) }));
    const tr: [number, number][] = [[46, 56], [119, 64], [192, 72], [265, 76], [338, 78]];
    const cv: [number, number][] = [[46, 164], [119, 126], [192, 102], [265, 90], [338, 86]];
    return {
      title: '训练集 vs 交叉验证学习诊断曲线',
      badge: 'Gap=0.03 · 无过拟合',
      body: legendChips([{ label: '训练集得分', color: ink.opposite, kind: 'line' }, { label: '5折交叉验证', color: ink.primary, kind: 'line' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, vGrid: true, yTitle: '分类 AUC 得分', xTitle: '训练样本规模 (n)' }, ink)
        + bandPolygon(tr.map(([x, y]) => [x, y - 7]), tr.map(([x, y]) => [x, y + 7]), ink.opposite, 0.14)
        + bandPolygon(cv.map(([x, y]) => [x, y - 9]), cv.map(([x, y]) => [x, y + 9]), ink.primary, 0.18)
        + `<path d="${smoothCurvePath(tr)}" stroke="${ink.opposite}" stroke-width="1.8"/>`
        + `<path d="${smoothCurvePath(cv)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + cv.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${ink.primary}"/>`).join(''),
    };
  },

  perm_importance: (ink: ResolvedInk) => {
    const feats = [
      ['系统信任度', 0.142, 0.022],
      ['使用频次', 0.108, 0.018],
      ['价格敏感', 0.074, 0.015],
      ['售后保障', 0.048, 0.014],
      ['年龄分层', 0.016, 0.012],
    ] as const;
    const x0 = 76, y0 = 44, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + (v / 0.18) * (x1 - x0);
    const xTicks = [0, 0.04, 0.08, 0.12, 0.16].map(v => ({ pos: xMap(v), label: v.toFixed(2) }));
    const rowH = (y1 - y0) / feats.length;
    const rows = feats.map(([lbl, m, sd], i) => {
      const cy = y0 + (i + 0.5) * rowH, xm = xMap(m), xl = xMap(m - sd), xr = xMap(m + sd);
      const c = i < 2 ? ink.primary : i < 4 ? ink.secondary : ink.muted;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.3, fill: ink.text, anchor: 'end' })
        + errH(cy, xl - 8, xr + 8, c, 3)
        + `<rect x="${f1(xl)}" y="${f1(cy - 6)}" width="${f1(xr - xl)}" height="12" rx="2" fill="${lightenHex(c, 0.6)}" stroke="${c}" stroke-width="1.2"/>`
        + `<line x1="${f1(xm)}" y1="${f1(cy - 6)}" x2="${f1(xm)}" y2="${f1(cy + 6)}" stroke="${darkenHex(c, 0.25)}" stroke-width="2"/>`
        + txt(xr + 12, cy + 2.5, m.toFixed(3), { size: 7, weight: 700, fill: c });
    }).join('');
    return {
      title: '置换特征重要度 (Permutation) 箱线图',
      badge: '30次置换 · ΔAUC',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '随机打乱后验证集 AUC 下降幅度' }, ink) + rows,
    };
  },

  pdp_ice: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xTicks = [20, 45, 70, 95, 120].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `¥${v}` }));
    const yTicks = [0.2, 0.4, 0.6, 0.8].map((v, i) => ({ pos: y1 - (i / 3) * (y1 - y0), label: v.toFixed(1) }));
    const iceOffsets = [-28, -20, -14, -8, -2, 6, 12, 20, 28, -16, 18];
    const basePts: [number, number][] = [[46, 62], [118, 68], [176, 86], [220, 124], [278, 146], [336, 156]];
    const ices = iceOffsets.map((dy, idx) => {
      const pts = basePts.map(([x, y], pi) => [x, Math.min(y1 - 4, Math.max(y0 + 4, y + dy + (pi === 2 ? (idx % 3 - 1) * 8 : 0)))] as [number, number]);
      return `<path d="${smoothCurvePath(pts)}" stroke="${ink.secondary}" stroke-width="0.9" stroke-opacity="0.32"/>`;
    }).join('');
    const xKnee = 196;
    return {
      title: '个体条件期望 ICE 与 PDP 边际曲线',
      badge: '价格拐点 ¥65',
      body: legendChips([{ label: '个体条件轨迹 (ICE)', color: ink.secondary, kind: 'line' }, { label: '平均部分依赖 (PDP)', color: ink.opposite, kind: 'line' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '预测采纳概率', xTitle: '月度定价水平 (元)' }, ink)
        + ices
        + `<path d="${smoothCurvePath(basePts)}" stroke="${ink.opposite}" stroke-width="2.5"/>`
        + `<line x1="${xKnee}" y1="${y0}" x2="${xKnee}" y2="${y1}" stroke="${ink.primary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + txt(xKnee + 4, y0 + 12, '边际骤降拐点 ¥65', { size: 7, weight: 700, fill: ink.primary }),
    };
  },

  umap_cluster: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [-6, -3, 0, 3, 6].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [-4, -2, 0, 2, 4].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: String(v) }));
    const clusters = [
      { lbl: 'C1 核心高潜', cx: 112, cy: 84, rx: 38, ry: 24, c: ink.primary, pts: [[-18, -6], [-8, 10], [4, -12], [14, 4], [22, -4], [-2, 2], [-14, 12], [8, 14]] },
      { lbl: 'C2 价格务实', cx: 256, cy: 78, rx: 36, ry: 22, c: ink.secondary, pts: [[-16, -4], [-6, 8], [8, -10], [16, 6], [20, -2], [-2, -2], [4, 12]] },
      { lbl: 'C3 观望犹豫', cx: 136, cy: 156, rx: 38, ry: 20, c: ink.accent4, pts: [[-18, -2], [-8, 8], [6, -6], [16, 6], [24, -4], [-4, -8], [10, 10]] },
      { lbl: 'C4 低意愿', cx: 272, cy: 154, rx: 34, ry: 20, c: ink.opposite, pts: [[-14, -4], [-4, 8], [8, -8], [16, 4], [2, 2], [-10, 6]] },
    ];
    const body = clusters.map(cl =>
      `<ellipse cx="${cl.cx}" cy="${cl.cy}" rx="${cl.rx}" ry="${cl.ry}" fill="${cl.c}" fill-opacity="0.1" stroke="${cl.c}" stroke-width="1" stroke-dasharray="3 2"/>`
      + cl.pts.map(([dx, dy]) => `<circle cx="${cl.cx + dx}" cy="${cl.cy + dy}" r="2.7" fill="${cl.c}" fill-opacity="0.82"/>`).join('')
      + txt(cl.cx, cl.cy - cl.ry - 3, cl.lbl, { size: 7.1, weight: 700, fill: cl.c, anchor: 'middle' }),
    ).join('');
    return {
      title: 'UMAP 非线性降维高维人群聚类',
      badge: 'Silhouette=0.61',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: 'UMAP-2', xTitle: 'UMAP-1' }, ink) + body,
    };
  },

  calibration_belt: (ink: ResolvedInk) => {
    const x0 = 48, y0 = 48, x1 = 334, y1 = 192;
    const xMap = (p: number) => x0 + p * (x1 - x0);
    const yMap = (p: number) => y1 - p * (y1 - y0);
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const xTicks = ticks.map(v => ({ pos: xMap(v), label: v.toFixed(2) }));
    const yTicks = ticks.map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const ps = Array.from({ length: 24 }, (_, i) => 0.04 + (i / 23) * 0.92);
    const midP = (p: number) => Math.min(0.99, Math.max(0.01, p + 0.09 * Math.sin(Math.PI * 2 * (p - 0.12)) * p * (1 - p)));
    const w80 = (p: number) => 0.045 + 0.11 * (p - 0.5) ** 2;
    const w95 = (p: number) => 0.078 + 0.19 * (p - 0.5) ** 2;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const top95: [number, number][] = ps.map(p => [xMap(p), yMap(clamp01(midP(p) + w95(p)))]);
    const bot95: [number, number][] = ps.map(p => [xMap(p), yMap(clamp01(midP(p) - w95(p)))]);
    const top80: [number, number][] = ps.map(p => [xMap(p), yMap(clamp01(midP(p) + w80(p)))]);
    const bot80: [number, number][] = ps.map(p => [xMap(p), yMap(clamp01(midP(p) - w80(p)))]);
    const midPts: [number, number][] = ps.map(p => [xMap(p), yMap(midP(p))]);
    return {
      title: 'GiViTI 双层置信校准带 (80% / 95% Belt)',
      badge: '校验 p=0.24 · 无显著偏离',
      body: legendChips([{ label: '80% 校准带', color: ink.primary, kind: 'box' }, { label: '95% 校准带', color: ink.secondary, kind: 'box' }, { label: '理想校准线 y=x', color: ink.opposite, kind: 'dash' }], 48, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, vGrid: true, yTitle: '观测阳性概率 p', xTitle: '模型预测概率 P_hat' }, ink)
        + bandPolygon(top95, bot95, ink.secondary, 0.25)
        + bandPolygon(top80, bot80, ink.primary, 0.44)
        + `<path d="${smoothCurvePath(midPts)}" stroke="${ink.primary}" stroke-width="1.5"/>`
        + `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y0}" stroke="${ink.opposite}" stroke-width="1.6" stroke-dasharray="4 2.5"/>`
        + pill(56, 54, '全区间覆盖 y=x 对角线 · Brier=0.108', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.9, h: 14 }),
    };
  },

  taylor_diagram: (ink: ResolvedInk) => {
    const ox = 54, oy = 192, maxSd = 1.5, pxPerSd = 94;
    const R = maxSd * pxPerSd; // 141px -> right x=195, top y=51
    const rRef = 1.0 * pxPerSd;
    const sdArcs = [0.5, 1.0, 1.5].map(sd => {
      const r = sd * pxPerSd;
      return `<path d="M ${f1(ox + r)} ${oy} A ${f1(r)} ${f1(r)} 0 0 0 ${ox} ${f1(oy - r)}" stroke="${sd === 1.0 ? ink.primary : ink.grid}" stroke-width="${sd === 1.0 ? 1.2 : 0.8}"${sd === 1.0 ? ' stroke-dasharray="3.5 2"' : ''}/>`
        + txt(ox - 4, oy - r + 2.5, sd.toFixed(1), { size: 6.8, fill: sd === 1.0 ? ink.primary : ink.muted, anchor: 'end' })
        + txt(ox + r, oy + 11, sd.toFixed(1), { size: 6.8, fill: sd === 1.0 ? ink.primary : ink.muted, anchor: 'middle' });
    }).join('');
    const corrs = [0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.99];
    const spokes = corrs.map(c => {
      const s = Math.sqrt(1 - c * c);
      const px = ox + R * c, py = oy - R * s;
      const lx = ox + (R + 10) * c, ly = oy - (R + 10) * s;
      return `<line x1="${ox}" y1="${oy}" x2="${f1(px)}" y2="${f1(py)}" stroke="${ink.grid}" stroke-width="0.75"/>`
        + txt(lx, ly + 2.2, c === 0.99 ? '0.99' : c.toFixed(c === 0.95 ? 2 : 1), { size: 6.4, fill: ink.muted, anchor: 'middle' });
    }).join('');
    const crmseArcs = [0.4, 0.8].map(e => {
      const segs: [number, number][][] = [];
      let cur: [number, number][] = [];
      for (let i = 0; i <= 72; i++) {
        const phi = (i / 72) * Math.PI;
        const sx = 1.0 + e * Math.cos(phi), sy = e * Math.sin(phi);
        if (sx >= 0 && sy >= 0 && sx * sx + sy * sy <= maxSd * maxSd) {
          cur.push([ox + sx * pxPerSd, oy - sy * pxPerSd]);
        } else if (cur.length > 1) {
          segs.push(cur);
          cur = [];
        } else {
          cur = [];
        }
      }
      if (cur.length > 1) segs.push(cur);
      const lblX = ox + (1.0 - e * 0.72) * pxPerSd, lblY = oy - e * 0.68 * pxPerSd;
      return segs.map(pts => `<polyline points="${polyStr(pts)}" stroke="${ink.secondary}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`).join('')
        + txt(lblX, lblY - 2, `E=${e.toFixed(1)}`, { size: 6.2, weight: 600, fill: ink.secondary, anchor: 'middle' });
    }).join('');
    const models = [
      { lbl: 'M1 物理融合', sd: 1.04, r: 0.95, c: ink.primary },
      { lbl: 'M2 XGBoost', sd: 0.88, r: 0.89, c: ink.secondary },
      { lbl: 'M3 LSTM', sd: 1.18, r: 0.80, c: ink.accent4 },
      { lbl: 'M4 线性基准', sd: 0.74, r: 0.64, c: ink.opposite },
    ];
    const mSvg = models.map((m, i) => {
      const mx = ox + m.sd * m.r * pxPerSd, my = oy - m.sd * Math.sqrt(1 - m.r * m.r) * pxPerSd;
      const rmse = Math.sqrt(1 + m.sd * m.sd - 2 * m.sd * m.r);
      const rowY = 74 + i * 24;
      return `<circle cx="${f1(mx)}" cy="${f1(my)}" r="4" fill="${m.c}" stroke="${ink.surface}" stroke-width="1"/>`
        + txt(mx + 6, my - 3, `M${i + 1}`, { size: 6.8, weight: 700, fill: m.c })
        + `<circle cx="235" cy="${rowY - 2.5}" r="3.4" fill="${m.c}"/>`
        + txt(242, rowY, m.lbl, { size: 6.9, weight: 600, fill: ink.text })
        + txt(340, rowY, `${m.r.toFixed(2)}/${rmse.toFixed(2)}`, { size: 6.7, fill: ink.muted, anchor: 'end' });
    }).join('');
    return {
      title: '预测模型泰勒极坐标评估图',
      badge: 'σ · 相关 r · CRMSE',
      body: `<line x1="${ox}" y1="${oy}" x2="${f1(ox + R)}" y2="${oy}" stroke="${ink.axis}" stroke-width="1"/>`
        + `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${f1(oy - R)}" stroke="${ink.axis}" stroke-width="1"/>`
        + sdArcs + spokes + crmseArcs
        + `<circle cx="${f1(ox + rRef)}" cy="${oy}" r="4.2" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.1"/>`
        + txt(ox + rRef, oy - 7, '观测Ref', { size: 6.5, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + `<rect x="225" y="48" width="122" height="118" rx="4" fill="${ink.surface}" stroke="${ink.grid}" stroke-width="0.9"/>`
        + txt(232, 60, '模型对比', { size: 7, weight: 700, fill: ink.text })
        + txt(340, 60, 'r / RMSE', { size: 6.7, weight: 700, fill: ink.muted, anchor: 'end' })
        + `<line x1="230" y1="64" x2="342" y2="64" stroke="${ink.grid}" stroke-width="0.7"/>`
        + mSvg
        + txt(ox + R / 2, 215, '标准化标准差 (σ / σ_obs)', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle' })
        + txt(16, oy - R / 2, 'σ / σ_obs', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle', rotate: -90 })
        + txt(182, 52, '相关系数 r', { size: 6.7, weight: 600, fill: ink.muted }),
    };
  },

  shapley_owen: (ink: ResolvedInk) => {
    const groups = [
      {
        name: 'C1 制度信任联盟',
        total: 42.0,
        color: ink.primary,
        members: [['规则透明度', 24.6], ['隐私安全感', 17.4]] as const,
      },
      {
        name: 'C2 体验便利联盟',
        total: 34.5,
        color: ink.secondary,
        members: [['流程极简度', 20.2], ['响应时效', 14.3]] as const,
      },
      {
        name: 'C3 价格摩擦联盟',
        total: 23.5,
        color: ink.opposite,
        members: [['显性费率感', 14.8], ['违约顾虑', 8.7]] as const,
      },
    ];
    const x0 = 132, x1 = 316, y0 = 48;
    const xMap = (v: number) => x0 + (v / 30) * (x1 - x0);
    const xTicks = [0, 10, 20, 30].map(v => ({ pos: xMap(v), label: `${v}%` }));
    const grpBlocks = groups.map((g, gi) => {
      const gy = y0 + gi * 47;
      const bars = g.members.map(([mLbl, val], mi) => {
        const by = gy + 6 + mi * 17;
        const bw = xMap(val) - x0;
        return txt(x0 - 6, by + 8.5, mLbl, { size: 6.9, fill: ink.text, anchor: 'end' })
          + `<rect x="${x0}" y="${by}" width="${f1(bw)}" height="11" rx="2" fill="${g.color}" fill-opacity="${mi === 0 ? 0.82 : 0.52}"/>`
          + txt(x0 + bw + 4, by + 8.5, `${val.toFixed(1)}%`, { size: 6.7, weight: 700, fill: g.color });
      }).join('');
      return `<rect x="16" y="${gy}" width="328" height="42" rx="4" fill="${g.color}" fill-opacity="0.06" stroke="${g.color}" stroke-opacity="0.3" stroke-width="0.8"/>`
        + txt(22, gy + 16, g.name, { size: 7.1, weight: 700, fill: g.color })
        + pill(22, gy + 22, `联盟 ${g.total.toFixed(1)}%`, { bg: ink.surface, stroke: g.color, color: g.color, size: 6.5, h: 13 })
        + bars;
    }).join('');
    return {
      title: 'Shapley-Owen 联盟特征组归因分解',
      badge: 'Σφ_i = 100% · 防稀释',
      body: legendChips([{ label: '组内主特征', color: ink.primary, kind: 'box' }, { label: '组内协同特征', color: ink.secondary, kind: 'box' }, { label: '负向成本联盟', color: ink.opposite, kind: 'box' }], 40, 39, ink)
        + grpBlocks
        + `<line x1="${x0}" y1="191" x2="${x1}" y2="191" stroke="${ink.axis}" stroke-width="0.9"/>`
        + xTicks.map(t => `<line x1="${f1(t.pos)}" y1="191" x2="${f1(t.pos)}" y2="194" stroke="${ink.axis}" stroke-width="0.8"/>`
          + txt(t.pos, 203, t.label, { size: 7, fill: ink.muted, anchor: 'middle' })).join('')
        + txt((x0 + x1) / 2, 215, 'Owen 联盟二级对称归因份额 (%)', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle' }),
    };
  },

  conformal_interval_band: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (i: number) => x0 + 10 + (i / 23) * (x1 - x0 - 20);
    const yMap = (v: number) => y1 - ((v - 1.2) / 4.6) * (y1 - y0);
    const xTicks = [1, 6, 12, 18, 24].map(v => ({ pos: xMap(v - 1), label: `#${v}` }));
    const yTicks = [1.5, 2.5, 3.5, 4.5, 5.5].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const qHat = 0.56;
    const offsets = [0.18, -0.26, 0.34, -0.14, 0.22, -0.38, 0.82, -0.22, 0.16, -0.32, 0.41, -0.19, 0.28, -0.44, 0.12, -0.25, 0.36, -0.15, -0.84, 0.29, -0.34, 0.19, -0.21, 0.31];
    const yhat = (i: number) => 2.15 + 2.65 * (i / 23);
    const meanPts: [number, number][] = offsets.map((_, i) => [xMap(i), yMap(yhat(i))]);
    const topPts: [number, number][] = offsets.map((_, i) => [xMap(i), yMap(yhat(i) + qHat)]);
    const botPts: [number, number][] = offsets.map((_, i) => [xMap(i), yMap(yhat(i) - qHat)]);
    const dots = offsets.map((dy, i) => {
      const yVal = yhat(i) + dy;
      const miss = Math.abs(dy) > qHat;
      const cx = xMap(i), cy = yMap(yVal);
      if (miss) {
        return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="5.2" stroke="${ink.opposite}" stroke-width="1"/>`
          + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="3.2" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.9"/>`;
      }
      return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="2.5" fill="${ink.secondary}" fill-opacity="0.88" stroke="${ink.surface}" stroke-width="0.6"/>`;
    }).join('');
    return {
      title: 'Split Conformal 预测区间与覆盖校准',
      badge: '目标 90% · 实测 91.7%',
      body: legendChips([
        { label: '点预测 f̂(x)', color: ink.primary, kind: 'line' },
        { label: '90% C_q 带', color: ink.primary, kind: 'box' },
        { label: '命中', color: ink.secondary, kind: 'dot' },
        { label: '越界 (2/24)', color: ink.opposite, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '实测与预测响应 Y', xTitle: '测试样本索引 (按 f̂(x) 升序排序)' }, ink)
        + bandPolygon(topPts, botPts, ink.primary, 0.16)
        + `<polyline points="${polyStr(topPts)}" stroke="${ink.primary}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(botPts)}" stroke="${ink.primary}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(meanPts)}" stroke="${ink.primary}" stroke-width="2"/>`
        + dots
        + pill(330, 173, 'q̂_0.90 = ±0.56 · 分布自由保证', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.5, h: 14, align: 'right' }),
    };
  },

  conformal_interval_fan: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (x: number) => x0 + (x / 10) * (x1 - x0);
    const yMap = (y: number) => y1 - ((y - 1.0) / 6.0) * (y1 - y0);
    const xTicks = [0, 2, 4, 6, 8, 10].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [1.0, 2.5, 4.0, 5.5, 7.0].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xs = Array.from({ length: 13 }, (_, i) => i * (10 / 12));
    const fMean = (x: number) => 2.25 + 0.31 * x + 0.28 * Math.sin(x * 0.72);
    const scale = (x: number) => 0.24 + 0.085 * x;
    const mPts: [number, number][] = xs.map(x => [xMap(x), yMap(fMean(x))]);
    const bandPts = (mult: number): [[number, number][], [number, number][]] => [
      xs.map(x => [xMap(x), yMap(fMean(x) + mult * scale(x))]),
      xs.map(x => [xMap(x), yMap(fMean(x) - mult * scale(x))]),
    ];
    const [t95, b95] = bandPts(1.96);
    const [t80, b80] = bandPts(1.28);
    const [t50, b50] = bandPts(0.68);
    const testPts: [number, number, boolean][] = [
      [3.8, 3.64, true], [4.4, 3.38, true], [5.0, 4.12, true], [5.5, 3.34, true], [6.1, 4.54, true],
      [6.6, 3.42, true], [7.2, 4.32, true], [7.8, 5.45, false], [8.3, 4.22, true], [8.9, 5.52, true],
      [9.4, 4.48, true], [9.8, 5.88, true],
    ];
    const xSplit = xMap(3.5);
    return {
      title: 'Split Conformal 分布自由预测扇形带',
      badge: '50/80/95% · 覆盖 95.8%',
      body: legendChips([
        { label: '点预测', color: ink.primary, kind: 'line' },
        { label: '50/80/95% 共形扇', color: ink.primary, kind: 'box' },
        { label: '命中样本', color: ink.secondary, kind: 'dot' },
        { label: '越界样本', color: ink.opposite, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '响应预测区间 C(x)', xTitle: '协变量外推尺度 x (3.5 后进入预测校准扇)' }, ink)
        + bandPolygon(t95, b95, ink.primary, 0.13)
        + bandPolygon(t80, b80, ink.primary, 0.22)
        + bandPolygon(t50, b50, ink.primary, 0.34)
        + `<line x1="${f1(xSplit)}" y1="${y0}" x2="${f1(xSplit)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + txt(xSplit + 4, y0 + 10, '校准分界 x=3.5', { size: 6.6, fill: ink.axis })
        + `<path d="${smoothCurvePath(mPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + testPts.map(([x, y, ok]) => {
          const cx = xMap(x), cy = yMap(y);
          return ok
            ? `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="2.6" fill="${ink.secondary}" fill-opacity="0.88" stroke="${ink.surface}" stroke-width="0.6"/>`
            : `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="5" stroke="${ink.opposite}" stroke-width="1"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="3.1" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.8"/>`;
        }).join('')
        + pill(330, 173, '异方差归一化 · 有限样本保证', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.4, h: 13.5, align: 'right' }),
    };
  },

  uplift_qini_curve: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (p: number) => x0 + (p / 100) * (x1 - x0);
    const yMap = (v: number) => y1 - (v / 13) * (y1 - y0);
    const xTicks = [0, 20, 40, 60, 80, 100].map(v => ({ pos: xMap(v), label: `${v}%` }));
    const yTicks = [0, 3, 6, 9, 12].map(v => ({ pos: yMap(v), label: `${v}%` }));
    const pcts = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const cf = [0, 2.6, 5.1, 7.3, 9.1, 10.2, 10.8, 10.6, 10.0, 9.2, 8.4];
    const tl = [0, 1.9, 3.8, 5.5, 6.9, 8.0, 8.7, 9.0, 8.9, 8.7, 8.4];
    const rnd = pcts.map(p => 8.4 * (p / 100));
    const cfPts: [number, number][] = pcts.map((p, i) => [xMap(p), yMap(cf[i])]);
    const tlPts: [number, number][] = pcts.map((p, i) => [xMap(p), yMap(tl[i])]);
    const rndPts: [number, number][] = pcts.map((p, i) => [xMap(p), yMap(rnd[i])]);
    return {
      title: '因果增益 (Uplift) Qini 增量曲线',
      badge: 'AUUC=0.41 · Qini=0.19',
      body: legendChips([
        { label: 'Causal Forest', color: ink.primary, kind: 'line' },
        { label: 'T-Learner', color: ink.secondary, kind: 'line' },
        { label: '随机基线', color: ink.muted, kind: 'dash' },
        { label: 'Qini 增益', color: ink.primary, kind: 'box' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '累计净增量转化 (%)', xTitle: '按预测 CATE τ̂(x) 降序触达人群比例 (%)' }, ink)
        + bandPolygon(cfPts, rndPts, ink.primary, 0.14)
        + `<line x1="${f1(xMap(60))}" y1="${y0}" x2="${f1(xMap(60))}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr(rndPts)}" stroke="${ink.muted}" stroke-width="1.2" stroke-dasharray="4 2.5"/>`
        + `<path d="${smoothCurvePath(tlPts)}" stroke="${ink.secondary}" stroke-width="1.8"/>`
        + `<path d="${smoothCurvePath(cfPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + cfPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i === 6 ? 4 : 2.1}" fill="${i === 6 ? ink.opposite : ink.primary}" stroke="${ink.surface}" stroke-width="0.8"/>`).join('')
        + pill(xMap(60) + 5, yMap(10.8) - 21, '最优截断 60% (峰值 +10.8%)', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.5, h: 14 }),
    };
  },

  ale_accumulated_local: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (x: number) => x0 + (x / 10) * (x1 - x0);
    const yMap = (v: number) => y1 - ((v + 0.68) / 1.36) * (y1 - y0);
    const xTicks = [0, 2, 4, 6, 8, 10].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [-0.6, -0.3, 0.0, 0.3, 0.6].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xs = [0.6, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.4];
    const aleVals = [-0.42, -0.33, -0.22, -0.11, -0.01, 0.09, 0.19, 0.27, 0.33, 0.36];
    const pdpVals = [-0.58, -0.45, -0.27, -0.13, -0.01, 0.11, 0.24, 0.37, 0.50, 0.61];
    const alePts: [number, number][] = xs.map((x, i) => [xMap(x), yMap(aleVals[i])]);
    const pdpPts: [number, number][] = xs.map((x, i) => [xMap(x), yMap(pdpVals[i])]);
    const rugXs = [1.2, 2.1, 2.5, 2.9, 3.2, 3.5, 3.8, 4.1, 4.4, 4.7, 4.9, 5.1, 5.4, 5.7, 6.0, 6.3, 6.7, 7.1, 7.5, 8.0, 8.8];
    return {
      title: 'ALE 累积局部效应 vs PDP 抗共线',
      badge: '共线 r=0.78 · 零偏外推',
      body: legendChips([
        { label: 'ALE 局部积分', color: ink.primary, kind: 'line' },
        { label: 'PDP 外推 (偏误)', color: ink.opposite, kind: 'dash' },
        { label: '样本分位 Rug', color: ink.secondary, kind: 'line' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '中心化边际效应 Δf̂(X₁)', xTitle: '强共线特征 X₁ 分位区间 (底栏 Rug 为真实分布)' }, ink)
        + `<rect x="${x0}" y="${y0}" width="${f1(xMap(1.8) - x0)}" height="${y1 - y0}" fill="${ink.opposite}" fill-opacity="0.06"/>`
        + `<rect x="${f1(xMap(8.2))}" y="${y0}" width="${f1(x1 - xMap(8.2))}" height="${y1 - y0}" fill="${ink.opposite}" fill-opacity="0.06"/>`
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + rugXs.map(rx => `<line x1="${f1(xMap(rx))}" y1="${y1 - 6}" x2="${f1(xMap(rx))}" y2="${y1}" stroke="${ink.secondary}" stroke-width="1"/>`).join('')
        + `<path d="${smoothCurvePath(pdpPts)}" stroke="${ink.opposite}" stroke-width="1.8" stroke-dasharray="4 2.5"/>`
        + `<path d="${smoothCurvePath(alePts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + alePts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.3" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="0.7"/>`).join('')
        + pill(54, 54, '尾端样本稀疏 · PDP外推偏误', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.5, h: 14 }),
    };
  },

  bertopic_intertopic_map: (ink: ResolvedInk) => {
    const lx0 = 38, ly0 = 52, lx1 = 186, ly1 = 192;
    const lxMap = (v: number) => lx0 + ((v + 3.2) / 6.4) * (lx1 - lx0);
    const lyMap = (v: number) => ly1 - ((v + 3.2) / 6.4) * (ly1 - ly0);
    const topics = [
      { id: 'T0', lbl: 'T0 补贴 28%', x: -1.35, y: 1.25, r: 20, c: ink.opposite, sel: true },
      { id: 'T1', lbl: 'T1 时效 24%', x: 1.45, y: 1.35, r: 18, c: ink.primary, sel: false },
      { id: 'T2', lbl: 'T2 隐私 21%', x: 1.45, y: -1.25, r: 16, c: ink.secondary, sel: false },
      { id: 'T3', lbl: 'T3 价格 16%', x: -1.35, y: -1.35, r: 14, c: ink.accent4, sel: false },
      { id: 'T4', lbl: 'T4 交互 11%', x: 0.1, y: -0.05, r: 11, c: ink.muted, sel: false },
    ] as const;

    const terms = [
      ['专项补贴', 0.42],
      ['门槛资质', 0.36],
      ['兑现周期', 0.31],
      ['县域试点', 0.27],
      ['财政兜底', 0.21],
      ['申报流程', 0.16],
    ] as const;
    const rx0 = 238, ry0 = 52, rx1 = 342, ry1 = 192;
    const rxMap = (v: number) => rx0 + (v / 0.5) * (rx1 - rx0);
    const rowH = (ry1 - ry0) / terms.length;
    return {
      title: 'BERTopic 主题流形与 c-TF-IDF',
      badge: '5主题 · Coher.=0.68',
      body: txt(112, 43, 'UMAP 主题距离流形图', { size: 7.1, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(290, 43, 'T0 焦点主题 c-TF-IDF 词重', { size: 7.1, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, box: true, xTicks: [-2, 0, 2].map(v => ({ pos: lxMap(v), label: String(v) })), yTicks: [-2, 0, 2].map(v => ({ pos: lyMap(v), label: String(v) })), xTitle: 'UMAP-D1', yTitle: 'UMAP-D2' }, ink)
        + `<line x1="${f1(lxMap(0))}" y1="${ly0}" x2="${f1(lxMap(0))}" y2="${ly1}" stroke="${ink.grid}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${lx0}" y1="${f1(lyMap(0))}" x2="${lx1}" y2="${f1(lyMap(0))}" stroke="${ink.grid}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + topics.map(t => {
          const cx = lxMap(t.x), cy = lyMap(t.y);
          return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${t.r}" fill="${t.c}" fill-opacity="${t.sel ? 0.34 : 0.22}" stroke="${t.c}" stroke-width="${t.sel ? 1.8 : 1.2}"/>`
            + txt(cx, cy + 2.5, t.lbl, { size: 6.2, weight: 700, fill: ink.text, anchor: 'middle' });
        }).join('')
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, xTicks: [0, 0.2, 0.4].map(v => ({ pos: rxMap(v), label: v.toFixed(1) })), vGrid: true, hGrid: false, xTitle: 'c-TF-IDF 权重' }, ink)
        + terms.map(([lbl, w], i) => {
          const cy = ry0 + (i + 0.5) * rowH;
          const bw = rxMap(w) - rx0;
          return txt(rx0 - 4, cy + 2.4, lbl, { size: 6.8, fill: ink.text, anchor: 'end' })
            + `<rect x="${rx0}" y="${f1(cy - 5.5)}" width="${f1(bw)}" height="11" rx="1.8" fill="${ink.opposite}" fill-opacity="${0.85 - i * 0.08}"/>`
            + txt(rx0 + bw + 3, cy + 2.4, w.toFixed(2), { size: 6.5, weight: 700, fill: ink.opposite });
        }).join(''),
    };
  },

  rag_latency_faithfulness: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (lat: number) => x0 + ((lat - 0.2) / 4.0) * (x1 - x0);
    const yMap = (f: number) => y1 - ((f - 0.55) / 0.43) * (y1 - y0);
    const xTicks = [0.5, 1.5, 2.5, 3.5].map(v => ({ pos: xMap(v), label: `${v.toFixed(1)}s` }));
    const yTicks = [0.6, 0.7, 0.8, 0.9].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const frontier = [
      { lbl: 'BM25', lat: 0.65, faith: 0.64, rec: 0.61, r: 5.5, knee: false, dx: 7, dy: 4, anc: 'start' as const },
      { lbl: 'Dense向量', lat: 1.05, faith: 0.76, rec: 0.74, r: 7.0, knee: false, dx: 0, dy: -11, anc: 'middle' as const },
      { lbl: '混合+Rerank', lat: 1.60, faith: 0.87, rec: 0.86, r: 8.4, knee: true, dx: -6, dy: -12, anc: 'end' as const },
      { lbl: 'GraphRAG', lat: 3.30, faith: 0.93, rec: 0.92, r: 9.4, knee: false, dx: -12, dy: 2, anc: 'end' as const },
    ];
    const dominated = [
      { lbl: 'HyDE改写', lat: 2.15, faith: 0.80, r: 7.4, dx: 0, dy: 14 },
      { lbl: '长窗全塞', lat: 2.90, faith: 0.71, r: 7.8, dx: 0, dy: 14 },
      { lbl: '多跳深检', lat: 3.70, faith: 0.88, r: 8.6, dx: 0, dy: 15 },
    ];
    const fPts: [number, number][] = frontier.map(p => [xMap(p.lat), yMap(p.faith)]);
    const domPoly: [number, number][] = [...fPts, [x1, fPts[fPts.length - 1][1]], [x1, y1], [fPts[0][0], y1]];
    return {
      title: '检索增强忠实度—延迟帕累托',
      badge: 'Rerank 拐点 F=0.87',
      body: legendChips([
        { label: '帕累托前沿', color: ink.primary, kind: 'line' },
        { label: '最优拐点', color: ink.opposite, kind: 'dot' },
        { label: '受支配方案', color: ink.lightMuted, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '忠实度 Faithfulness', xTitle: '端到端 P95 延迟 Latency (s, 气泡大小=Recall)' }, ink)
        + `<polygon points="${polyStr(domPoly)}" fill="${ink.grid}" fill-opacity="0.35"/>`
        + `<polyline points="${polyStr(fPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + dominated.map(p => {
          const cx = xMap(p.lat), cy = yMap(p.faith);
          return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${p.r}" fill="${ink.lightMuted}" fill-opacity="0.65" stroke="${ink.surface}" stroke-width="0.9"/>`
            + txt(cx + p.dx, cy + p.dy, p.lbl, { size: 6.5, fill: ink.muted, anchor: 'middle' });
        }).join('')
        + frontier.map(p => {
          const cx = xMap(p.lat), cy = yMap(p.faith);
          const col = p.knee ? ink.opposite : ink.primary;
          const halo = p.knee ? `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(p.r + 3)}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="2.5 2"/>` : '';
          return halo
            + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${p.r}" fill="${col}" fill-opacity="0.86" stroke="${ink.surface}" stroke-width="1.1"/>`
            + txt(cx + p.dx, cy + p.dy, p.lbl, { size: 6.7, weight: 700, fill: col, anchor: p.anc });
        }).join('')
        + pill(xMap(2.45), yMap(0.60), '气泡面积 ∝ Context Recall', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.3, h: 13.5, align: 'center' }),
    };
  },

  shap_interaction_matrix: (ink: ResolvedInk) => {
    const feats = ['信任', '频次', '价格', '距离', '年龄'];
    const mat = [
      [0.38, 0.11, 0.16, 0.05, 0.04],
      [0.11, 0.31, 0.08, 0.13, 0.03],
      [0.16, 0.08, 0.27, 0.06, 0.09],
      [0.05, 0.13, 0.06, 0.19, 0.04],
      [0.04, 0.03, 0.09, 0.04, 0.14],
    ];
    const cell = 24;
    const mx0 = 44, my0 = 54;
    let gridSvg = '';
    for (let r = 0; r < 5; r++) {
      gridSvg += txt(mx0 - 5, my0 + r * cell + cell / 2 + 2.5, feats[r], { size: 6.8, weight: 600, fill: ink.text, anchor: 'end' });
      gridSvg += txt(mx0 + r * cell + cell / 2, my0 - 5, feats[r], { size: 6.8, weight: 600, fill: ink.text, anchor: 'middle' });
      for (let c = 0; c < 5; c++) {
        const v = mat[r][c];
        const diag = r === c;
        const fillCol = diag ? ink.primary : ink.secondary;
        const alpha = diag ? 0.32 + (v / 0.42) * 0.52 : 0.12 + (v / 0.18) * 0.56;
        const cx = mx0 + c * cell, cy = my0 + r * cell;
        gridSvg += `<rect x="${cx}" y="${cy}" width="${cell - 1}" height="${cell - 1}" rx="2" fill="${fillCol}" fill-opacity="${f2(alpha)}" stroke="${ink.surface}" stroke-width="0.6"/>`
          + txt(cx + cell / 2 - 0.5, cy + cell / 2 + 2.3, v.toFixed(2), { size: 6.0, weight: diag ? 700 : 500, fill: alpha > 0.56 ? '#FFFFFF' : ink.text, anchor: 'middle' });
      }
    }
    gridSvg += `<rect x="${mx0 + 2 * cell}" y="${my0}" width="${cell - 1}" height="${cell - 1}" rx="2" stroke="${ink.opposite}" stroke-width="1.5"/>`
      + `<rect x="${mx0}" y="${my0 + 2 * cell}" width="${cell - 1}" height="${cell - 1}" rx="2" stroke="${ink.opposite}" stroke-width="1.5"/>`
      + txt(mx0 + 2.5 * cell, my0 + 5 * cell + 14, '对角=主效应 |Φ_i,i| · 非对角=交互 |Φ_i,j|', { size: 6.7, weight: 600, fill: ink.axis, anchor: 'middle' });

    const rx0 = 218, ry0 = 54, rx1 = 342, ry1 = 174;
    const xMap = (v: number) => rx0 + ((v + 0.25) / 0.5) * (rx1 - rx0);
    const xTicks = [-0.2, 0.0, 0.2].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const pairs = [
      { lbl: '信任×价格', vals: [-0.18, -0.11, -0.04, 0.05, 0.12, 0.18, 0.22] },
      { lbl: '频次×距离', vals: [-0.14, -0.07, 0.02, 0.08, 0.14, 0.19] },
      { lbl: '价格×年龄', vals: [-0.12, -0.05, 0.01, 0.06, 0.11, 0.15] },
      { lbl: '信任×频次', vals: [-0.10, -0.04, 0.03, 0.09, 0.13, 0.17] },
    ] as const;
    const rowH = (ry1 - ry0) / pairs.length;
    const beeSvg = pairs.map((p, ri) => {
      const cy = ry0 + (ri + 0.5) * rowH;
      return txt(rx0 - 4, cy + 2.3, p.lbl, { size: 6.4, weight: 600, fill: ink.text, anchor: 'end' })
        + `<line x1="${rx0}" y1="${f1(cy)}" x2="${rx1}" y2="${f1(cy)}" stroke="${ink.grid}" stroke-width="0.6"/>`
        + p.vals.map((v, di) => {
          const t = di / (p.vals.length - 1);
          const col = mixHex(ink.secondary, ink.opposite, t);
          return `<circle cx="${f1(xMap(v))}" cy="${f1(cy + ((di % 3) - 1) * 3.0)}" r="2.5" fill="${col}" fill-opacity="0.88"/>`;
        }).join('');
    }).join('');
    return {
      title: 'SHAP 主效应与二阶特征交互蜂群矩阵',
      badge: '最强交互 信任×价格=0.16',
      body: legendChips([
        { label: '主效应 |Φ_i,i|', color: ink.primary, kind: 'box' },
        { label: '交互强度 |Φ_i,j|', color: ink.secondary, kind: 'box' },
        { label: '高值正耦合', color: ink.opposite, kind: 'dot' },
      ], 44, 39, ink)
        + gridSvg
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, xTicks, hGrid: false, box: true, xTitle: '二阶交互蜂群 Φ_i,j' }, ink)
        + `<line x1="${f1(xMap(0))}" y1="${ry0}" x2="${f1(xMap(0))}" y2="${ry1}" stroke="${ink.axis}" stroke-width="0.95" stroke-dasharray="3 2"/>`
        + beeSvg,
    };
  },

  ridge_lasso_path: (ink: ResolvedInk) => {
    const x0 = 46, x1 = 336, ty0 = 46, ty1 = 112, by0 = 124, by1 = 190;
    const xMap = (lam: number) => x0 + ((lam + 3.0) / 2.8) * (x1 - x0);
    const tyMap = (b: number) => ty1 - ((b + 0.4) / 1.0) * (ty1 - ty0);
    const byMap = (m: number) => by1 - ((m - 0.25) / 0.55) * (by1 - by0);
    const lams = [-3.0, -2.5, -2.1, -1.75, -1.45, -1.24, -0.95, -0.65, -0.35, -0.2];
    const xTicks = [-3.0, -2.0, -1.0, -0.2].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const tyTicks = [-0.3, 0.0, 0.3, 0.6].map(v => ({ pos: tyMap(v), label: v.toFixed(1) }));
    const byTicks = [0.3, 0.5, 0.7].map(v => ({ pos: byMap(v), label: v.toFixed(1) }));
    const paths: { vals: number[]; col: string; lbl: string; w: number }[] = [
      { vals: [0.52, 0.49, 0.44, 0.38, 0.31, 0.25, 0.14, 0.03, 0.0, 0.0], col: ink.primary, lbl: '制度信任', w: 2.0 },
      { vals: [0.36, 0.33, 0.28, 0.22, 0.16, 0.11, 0.02, 0.0, 0.0, 0.0], col: ink.secondary, lbl: '服务便利', w: 1.8 },
      { vals: [-0.34, -0.31, -0.26, -0.20, -0.14, -0.09, -0.01, 0.0, 0.0, 0.0], col: ink.opposite, lbl: '价格摩擦', w: 1.8 },
      { vals: [0.22, 0.19, 0.14, 0.09, 0.04, 0.01, 0.0, 0.0, 0.0, 0.0], col: ink.accent4, lbl: '口碑', w: 1.5 },
      { vals: [-0.14, -0.08, -0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], col: ink.lightMuted, lbl: '', w: 1.1 },
      { vals: [0.10, 0.04, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], col: ink.lightMuted, lbl: '', w: 1.1 },
    ];
    const mseMean = [0.37, 0.35, 0.33, 0.32, 0.335, 0.36, 0.44, 0.56, 0.69, 0.74];
    const mseSe = [0.035, 0.032, 0.030, 0.031, 0.034, 0.038, 0.045, 0.052, 0.058, 0.060];
    const mseTop: [number, number][] = lams.map((l, i) => [xMap(l), byMap(mseMean[i] + mseSe[i])]);
    const mseBot: [number, number][] = lams.map((l, i) => [xMap(l), byMap(mseMean[i] - mseSe[i])]);
    const msePts: [number, number][] = lams.map((l, i) => [xMap(l), byMap(mseMean[i])]);
    const xMin = xMap(-1.75), x1se = xMap(-1.24);
    return {
      title: 'Lasso 系数收缩轨迹与 CV-MSE 调参',
      badge: 'λ_1se=0.058 · 保留4特征',
      body: legendChips([
        { label: '核心信号路径', color: ink.primary, kind: 'line' },
        { label: '10折 CV-MSE±SE', color: ink.secondary, kind: 'box' },
        { label: 'λ_1se 简约最优', color: ink.opposite, kind: 'dash' },
      ], 46, 38, ink)
        + axesFrame({ x0, y0: ty0, x1, y1: ty1, yTicks: tyTicks, xTicks: [], box: true, yTitle: '标准化系数' }, ink)
        + axesFrame({ x0, y0: by0, x1, y1: by1, yTicks: byTicks, xTicks, box: true, yTitle: 'CV-MSE', xTitle: '对数惩罚强度 log10(λ) (左→右稀疏压缩)' }, ink)
        + `<line x1="${x0}" y1="${f1(tyMap(0))}" x2="${x1}" y2="${f1(tyMap(0))}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="2.5 2"/>`
        + paths.map(p => {
          const pts: [number, number][] = lams.map((l, i) => [xMap(l), tyMap(p.vals[i])]);
          return `<polyline points="${polyStr(pts)}" stroke="${p.col}" stroke-width="${p.w}"/>`
            + (p.lbl ? txt(x0 + 4, tyMap(p.vals[0]) + (p.vals[0] > 0 ? -3.5 : 8), p.lbl, { size: 5.9, weight: 600, fill: p.col }) : '');
        }).join('')
        + bandPolygon(mseTop, mseBot, ink.secondary, 0.22)
        + `<path d="${smoothCurvePath(msePts)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + msePts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.2" fill="${ink.primary}"/>`).join('')
        + `<line x1="${f1(xMin)}" y1="${ty0}" x2="${f1(xMin)}" y2="${by1}" stroke="${ink.secondary}" stroke-width="1.0" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(x1se)}" y1="${ty0}" x2="${f1(x1se)}" y2="${by1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(xMin - 3, by0 + 11, 'λ_min', { size: 6.2, weight: 700, fill: ink.secondary, anchor: 'end' })
        + txt(x1se + 3, by0 + 11, 'λ_1se (df=4)', { size: 6.2, weight: 700, fill: ink.opposite }),
    };
  },

  roc_pr_calibration_dual: (ink: ResolvedInk) => {
    const y0 = 52, y1 = 186;
    const p1 = { x0: 32, x1: 116 }, p2 = { x0: 146, x1: 230 }, p3 = { x0: 260, x1: 344 };
    const mapX = (box: { x0: number; x1: number }, v: number) => box.x0 + v * (box.x1 - box.x0);
    const mapY = (v: number, top = y0, bot = y1) => bot - v * (bot - top);
    const t3 = (box: { x0: number; x1: number }) => [0, 0.5, 1.0].map(v => ({ pos: mapX(box, v), label: v.toFixed(1) }));
    const yT3 = [0, 0.5, 1.0].map(v => ({ pos: mapY(v), label: v.toFixed(1) }));
    const yT3c = [0, 0.5, 1.0].map(v => ({ pos: mapY(v, y0, 154), label: v.toFixed(1) }));

    const roc1: [number, number][] = [[0, 0], [0.04, 0.52], [0.12, 0.78], [0.28, 0.90], [0.55, 0.97], [1, 1]].map(([x, y]) => [mapX(p1, x), mapY(y)]);
    const roc2: [number, number][] = [[0, 0], [0.08, 0.42], [0.22, 0.68], [0.44, 0.84], [0.72, 0.94], [1, 1]].map(([x, y]) => [mapX(p1, x), mapY(y)]);
    const pr1: [number, number][] = [[0, 0.98], [0.25, 0.94], [0.52, 0.86], [0.74, 0.74], [0.90, 0.56], [1, 0.24]].map(([x, y]) => [mapX(p2, x), mapY(y)]);
    const pr2: [number, number][] = [[0, 0.92], [0.22, 0.82], [0.48, 0.70], [0.70, 0.56], [0.88, 0.40], [1, 0.24]].map(([x, y]) => [mapX(p2, x), mapY(y)]);
    const cal1: [number, number][] = [[0.08, 0.09], [0.22, 0.20], [0.38, 0.39], [0.55, 0.54], [0.74, 0.76], [0.90, 0.89]].map(([x, y]) => [mapX(p3, x), mapY(y, y0, 154)]);
    const cal2: [number, number][] = [[0.10, 0.15], [0.26, 0.31], [0.45, 0.52], [0.64, 0.60], [0.84, 0.74]].map(([x, y]) => [mapX(p3, x), mapY(y, y0, 154)]);
    const histBins = [26, 18, 12, 9, 8, 10, 14, 19];
    const hbw = (p3.x1 - p3.x0) / histBins.length;
    const hBars = histBins.map((v, i) => `<rect x="${f1(p3.x0 + i * hbw + 1)}" y="${f1(186 - v * 0.88)}" width="${f1(hbw - 2)}" height="${f1(v * 0.88)}" fill="${ink.secondary}" fill-opacity="0.38"/>`).join('');
    return {
      title: '二分类 ROC-PR 判别与概率校准双联图',
      badge: 'AUC=0.91 · AP=0.82',
      body: legendChips([
        { label: 'GBDT 主模型', color: ink.primary, kind: 'line' },
        { label: 'Logit 基准', color: ink.secondary, kind: 'dash' },
        { label: '随机/理想线', color: ink.opposite, kind: 'dash' },
      ], 32, 38, ink)
        + txt((p1.x0 + p1.x1) / 2, 48, 'ROC 曲线 (AUC)', { size: 6.5, weight: 700, fill: ink.text, anchor: 'middle' })
        + axesFrame({ x0: p1.x0, y0, x1: p1.x1, y1, yTicks: yT3, xTicks: t3(p1), box: true, xTitle: 'FPR' }, ink)
        + `<line x1="${p1.x0}" y1="${y1}" x2="${p1.x1}" y2="${y0}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(roc1)} L ${p1.x1} ${y1} L ${p1.x0} ${y1} Z" fill="${ink.primary}" fill-opacity="0.10"/>`
        + `<path d="${smoothCurvePath(roc2)}" stroke="${ink.secondary}" stroke-width="1.5" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(roc1)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + txt(p1.x1 - 3, y1 - 8, '0.91 vs 0.83', { size: 5.9, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt((p2.x0 + p2.x1) / 2, 48, 'PR 曲线 (AP)', { size: 6.5, weight: 700, fill: ink.text, anchor: 'middle' })
        + axesFrame({ x0: p2.x0, y0, x1: p2.x1, y1, yTicks: yT3, xTicks: t3(p2), box: true, xTitle: 'Recall' }, ink)
        + `<line x1="${p2.x0}" y1="${f1(mapY(0.24))}" x2="${p2.x1}" y2="${f1(mapY(0.24))}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(pr2)}" stroke="${ink.secondary}" stroke-width="1.5" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(pr1)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + txt(p2.x0 + 4, mapY(0.24) - 4, '基线 0.24', { size: 5.8, fill: ink.opposite })
        + txt(p2.x1 - 3, y0 + 11, 'AP=0.82', { size: 5.9, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt((p3.x0 + p3.x1) / 2, 48, '校准可靠性斜线', { size: 6.5, weight: 700, fill: ink.text, anchor: 'middle' })
        + axesFrame({ x0: p3.x0, y0, x1: p3.x1, y1: 154, yTicks: yT3c, xTicks: [], box: true }, ink)
        + `<line x1="${p3.x0}" y1="154" x2="${p3.x1}" y2="${y0}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(cal2)}" stroke="${ink.secondary}" stroke-width="1.4" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(cal1)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + cal1.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.3" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="0.6"/>`).join('')
        + txt(p3.x0 + 3, y0 + 10, 'ECE=0.028', { size: 5.9, weight: 700, fill: ink.primary })
        + hBars
        + t3(p3).map(t => txt(t.pos, 198, t.label, { size: 7.0, fill: ink.muted, anchor: 'middle' })).join('')
        + txt((p3.x0 + p3.x1) / 2, 209, '预测概率分布', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle' }),
    };
  },
});

Object.assign(RENDERERS, {
  // =========================================================================
  // 7. BIOSTATISTICS & PSYCHOMETRICS (生物统计与量表) - 23 types
  // =========================================================================
  forest: (ink: ResolvedInk) => {
    const vars = [
      ['系统信任度', 1.92, 1.41, 2.62, '***'],
      ['操作易用性', 1.64, 1.22, 2.21, '**'],
      ['社群示范推荐', 1.48, 1.12, 1.96, '**'],
      ['年龄 (每增10岁)', 0.94, 0.78, 1.13, 'n.s.'],
      ['隐私顾虑指数', 0.62, 0.46, 0.84, '***'],
    ] as const;
    const x0 = 88, y0 = 44, x1 = 248, y1 = 192;
    const xMap = (v: number) => x0 + ((v - 0.3) / 2.6) * (x1 - x0);
    const xTicks = [0.5, 1.0, 1.5, 2.0, 2.5].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const rowH = (y1 - y0) / vars.length;
    const xRef = xMap(1.0);
    const rows = vars.map(([lbl, orVal, lo, hi, sig], i) => {
      const cy = y0 + (i + 0.5) * rowH, cx = xMap(orVal), xl = xMap(lo), xr = xMap(hi);
      const c = sig === 'n.s.' ? ink.muted : orVal > 1 ? ink.primary : ink.opposite;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.2, fill: ink.text, anchor: 'end' })
        + errH(cy, xl, xr, c, 3)
        + `<rect x="${f1(cx - 3.8)}" y="${f1(cy - 3.8)}" width="7.6" height="7.6" rx="1.2" fill="${c}"/>`
        + txt(256, cy + 2.5, `${orVal.toFixed(2)} (${lo.toFixed(2)}–${hi.toFixed(2)}) ${sig}`, { size: 6.8, weight: 600, fill: c });
    }).join('');
    return {
      title: '二元 Logistic 回归优势比森林图',
      badge: 'Pseudo R²=0.342',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '优势比 Odds Ratio (95% CI)' }, ink)
        + `<line x1="${f1(xRef)}" y1="${y0}" x2="${f1(xRef)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + txt(256, 39, 'OR (95% CI)', { size: 7, weight: 700, fill: ink.muted })
        + rows,
    };
  },

  km_survival: (ink: ResolvedInk) => {
    const x0 = 48, y0 = 46, x1 = 336, y1 = 166;
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(2) }));
    const xTicks = [0, 3, 6, 9, 12].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}月` }));
    const hiStep = `M ${x0} ${y0} H 112 V 56 H 176 V 68 H 242 V 82 H 302 V 92 H ${x1}`;
    const loStep = `M ${x0} ${y0} H 94 V 74 H 148 V 98 H 206 V 122 H 268 V 142 H ${x1}`;
    const atRiskHi = [248, 224, 198, 174, 152];
    const atRiskLo = [258, 204, 152, 108, 76];
    const riskRows = txt(x0 - 4, 197, '高信任', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'end' })
      + txt(x0 - 4, 209, '低信任', { size: 6.7, weight: 700, fill: ink.opposite, anchor: 'end' })
      + xTicks.map((t, i) => txt(t.pos, 197, String(atRiskHi[i]), { size: 6.8, fill: ink.primary, anchor: 'middle' })
        + txt(t.pos, 209, String(atRiskLo[i]), { size: 6.8, fill: ink.opposite, anchor: 'middle' })).join('');
    return {
      title: '用户留存时间 Kaplan-Meier 生存曲线',
      badge: 'Log-rank p < 0.001',
      body: legendChips([{ label: '高信任组 (n=248)', color: ink.primary, kind: 'line' }, { label: '低信任组 (n=258)', color: ink.opposite, kind: 'line' }], 50, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '留存概率 S(t)' }, ink)
        + `<polygon points="${x0},${y0} 176,60 336,80 336,104 176,78 ${x0},${y0}" fill="${ink.primary}" fill-opacity="0.12"/>`
        + `<polygon points="${x0},${y0} 148,88 336,128 336,154 148,110 ${x0},${y0}" fill="${ink.opposite}" fill-opacity="0.12"/>`
        + `<path d="${loStep}" stroke="${ink.opposite}" stroke-width="1.8"/>`
        + `<path d="${hiStep}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + [148, 228, 286].map(x => `<line x1="${x}" y1="64" x2="${x}" y2="72" stroke="${ink.primary}" stroke-width="1.2"/>`).join('')
        + `<line x1="${x0}" y1="186" x2="${x1}" y2="186" stroke="${ink.grid}" stroke-width="0.7"/>`
        + riskRows,
    };
  },

  volcano: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [-2, -1, 0, 1, 2].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [0, 2, 4, 6].map((v, i) => ({ pos: y1 - (i / 3) * (y1 - y0), label: String(v) }));
    const ySig = y1 - (1.3 / 6) * (y1 - y0);
    const xL = x0 + 0.35 * (x1 - x0), xR = x0 + 0.65 * (x1 - x0);
    const upPts: [number, number, string][] = [[276, 86, '信任感'], [298, 66, '便利度'], [262, 112, ''], [312, 92, '推荐'], [254, 134, ''], [286, 124, '']];
    const dnPts: [number, number, string][] = [[102, 78, '费用顾虑'], [84, 108, '步骤繁'], [122, 128, ''], [112, 146, '']];
    const nsPts: [number, number][] = [[164, 174], [182, 168], [198, 178], [214, 166], [174, 154], [204, 152], [156, 166], [224, 172], [188, 142], [196, 184]];
    return {
      title: '组间维度差异显著性火山图',
      badge: '上调 18 · 下调 11',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '-log10(p 值)', xTitle: '组间效应差异幅度 (log2FC)' }, ink)
        + `<line x1="${x0}" y1="${f1(ySig)}" x2="${x1}" y2="${f1(ySig)}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xL)}" y1="${y0}" x2="${f1(xL)}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xR)}" y1="${y0}" x2="${f1(xR)}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="3 2"/>`
        + nsPts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${ink.lightMuted}" fill-opacity="0.65"/>`).join('')
        + dnPts.map(([x, y, l]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${ink.secondary}"/>` + (l ? txt(x, y - 5, l, { size: 6.8, weight: 600, fill: ink.secondary, anchor: 'middle' }) : '')).join('')
        + upPts.map(([x, y, l]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${ink.opposite}"/>` + (l ? txt(x, y - 5, l, { size: 6.8, weight: 700, fill: ink.opposite, anchor: 'middle' }) : '')).join(''),
    };
  },

  bland_altman: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [2.0, 3.0, 4.0, 5.0].map((v, i) => ({ pos: x0 + (i / 3) * (x1 - x0), label: v.toFixed(1) }));
    const yTicks = [-0.6, -0.3, 0, 0.3, 0.6].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(1) }));
    const yMean = 110, yHi = 68, yLo = 152;
    const pts: [number, number][] = [
      [76, 118], [94, 96], [112, 126], [128, 102], [146, 114], [162, 88], [178, 134], [194, 106],
      [212, 94], [228, 122], [244, 104], [260, 118], [276, 84], [292, 130], [308, 108], [202, 58],
    ];
    return {
      title: 'Bland-Altman 双量表重测一致性图',
      badge: '95% LoA [-0.42, 0.58]',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '差值 (前测 - 重测)', xTitle: '两次测量均值 (1–5)' }, ink)
        + `<rect x="${x0}" y="${yHi}" width="${x1 - x0}" height="${yLo - yHi}" fill="${ink.primary}" fill-opacity="0.06"/>`
        + `<line x1="${x0}" y1="${yHi}" x2="${x1}" y2="${yHi}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${yLo}" x2="${x1}" y2="${yLo}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${yMean}" x2="${x1}" y2="${yMean}" stroke="${ink.primary}" stroke-width="1.5"/>`
        + txt(x1 - 4, yHi - 4, '+1.96 SD (0.58)', { size: 6.7, weight: 600, fill: ink.opposite, anchor: 'end' })
        + txt(x1 - 4, yMean - 4, '均值偏倚 +0.08', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x1 - 4, yLo + 9, '-1.96 SD (-0.42)', { size: 6.7, weight: 600, fill: ink.opposite, anchor: 'end' })
        + pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.9" fill="${y < yHi ? ink.opposite : ink.secondary}" fill-opacity="0.8"/>`).join(''),
    };
  },

  scree: (ink: ResolvedInk) => {
    const eigs = [4.12, 2.34, 1.48, 0.78, 0.56, 0.42, 0.3];
    const par = [1.46, 1.32, 1.21, 1.12, 1.03, 0.94, 0.86];
    const x0 = 44, y0 = 46, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - (v / 4.5) * (y1 - y0);
    const yTicks = [0, 1, 2, 3, 4].map(v => ({ pos: yMap(v), label: `${v}.0` }));
    const xTicks = eigs.map((_, i) => ({ pos: x0 + 22 + (i / 6) * (x1 - x0 - 44), label: `F${i + 1}` }));
    const pts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(eigs[i])]);
    const parPts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(par[i])]);
    const yKaiser = yMap(1.0);
    return {
      title: 'EFA 特征值碎石图与平行分析判定',
      badge: 'KMO=0.876 · 提取3因子',
      body: legendChips([{ label: '实测特征值', color: ink.primary, kind: 'line' }, { label: '平行分析模拟', color: ink.secondary, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '特征根 λ', xTitle: '因子序号' }, ink)
        + `<line x1="${x0}" y1="${f1(yKaiser)}" x2="${x1}" y2="${f1(yKaiser)}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2.5"/>`
        + txt(x1 - 4, yKaiser - 4, 'Kaiser 阈值 λ=1.0', { size: 6.9, weight: 700, fill: ink.opposite, anchor: 'end' })
        + `<polyline points="${polyStr(parPts)}" stroke="${ink.secondary}" stroke-width="1.4" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(pts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + pts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.8" fill="${i < 3 ? ink.primary : ink.lightMuted}" stroke="${ink.surface}" stroke-width="1"/>`
          + txt(x, y - 6, eigs[i].toFixed(2), { size: 6.7, weight: 600, fill: i < 3 ? ink.primary : ink.muted, anchor: 'middle' })).join(''),
    };
  },

  item_diag: (ink: ResolvedInk) => {
    const items = [
      ['Q1 易用', 0.68, 0.85],
      ['Q2 响应', 0.72, 0.84],
      ['Q3 冗余', 0.22, 0.91],
      ['Q4 信任', 0.64, 0.86],
      ['Q5 价值', 0.74, 0.83],
      ['Q6 推荐', 0.61, 0.86],
    ] as const;
    const x0 = 44, y0 = 48, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - (v / 1.0) * (y1 - y0);
    const yTicks = [0, 0.3, 0.6, 0.9].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const step = (x1 - x0) / items.length;
    const xTicks = items.map(([lbl], i) => ({ pos: x0 + (i + 0.5) * step, label: lbl }));
    const yCitcMin = yMap(0.3), yAlphaBase = yMap(0.884);
    const bars = items.map(([, citc], i) => {
      const cx = xTicks[i].pos, top = yMap(citc), bad = citc < 0.3;
      const c = bad ? ink.opposite : ink.primary;
      return `<rect x="${f1(cx - 12)}" y="${f1(top)}" width="24" height="${f1(y1 - top)}" rx="2" fill="${c}" fill-opacity="${bad ? 0.72 : 0.38}" stroke="${c}" stroke-width="1"/>`
        + (bad ? txt(cx, top - 4, '建议剔除', { size: 6.7, weight: 700, fill: ink.opposite, anchor: 'middle' }) : '');
    }).join('');
    const alphaPts: [number, number][] = items.map(([, , a], i) => [xTicks[i].pos, yMap(a)]);
    return {
      title: '题项 CITC 与删后 Cronbach α 诊断',
      badge: '总体 α=0.884 · 删Q3',
      body: legendChips([{ label: 'CITC 题总相关柱', color: ink.primary, kind: 'box' }, { label: '删后 Cronbach α 折线', color: ink.secondary, kind: 'line' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '指标数值' }, ink)
        + `<line x1="${x0}" y1="${f1(yCitcMin)}" x2="${x1}" y2="${f1(yCitcMin)}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${f1(yAlphaBase)}" x2="${x1}" y2="${f1(yAlphaBase)}" stroke="${ink.secondary}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + bars
        + `<polyline points="${polyStr(alphaPts)}" stroke="${ink.secondary}" stroke-width="1.8"/>`
        + alphaPts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.2" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="0.9"/>`).join(''),
    };
  },

  irt_icc: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xTicks = [-3, -1.5, 0, 1.5, 3].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(2) }));
    const logistic = (theta: number, a: number, b: number) => 1 / (1 + Math.exp(-a * (theta - b)));
    const thetas = Array.from({ length: 25 }, (_, i) => -3 + (i / 24) * 6);
    const makePts = (a: number, b: number): [number, number][] => thetas.map(th => [x0 + ((th + 3) / 6) * (x1 - x0), y1 - logistic(th, a, b) * (y1 - y0)]);
    const yHalf = y1 - 0.5 * (y1 - y0);
    return {
      title: '2PL-IRT 项目特征曲线 (ICC)',
      badge: '区分度 a · 难度 b',
      body: legendChips([{ label: '题1 (a=2.1,b=-0.8)', color: ink.primary, kind: 'line' }, { label: '题2 (a=1.4,b=0.1)', color: ink.secondary, kind: 'line' }, { label: '题3 (a=1.8,b=1.1)', color: ink.opposite, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '答对/认同概率 P(θ)', xTitle: '潜特质水平 θ (Logit)' }, ink)
        + `<line x1="${x0}" y1="${f1(yHalf)}" x2="${x1}" y2="${f1(yHalf)}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(makePts(2.1, -0.8))}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + `<path d="${smoothCurvePath(makePts(1.4, 0.1))}" stroke="${ink.secondary}" stroke-width="1.9"/>`
        + `<path d="${smoothCurvePath(makePts(1.8, 1.1))}" stroke="${ink.opposite}" stroke-width="1.9" stroke-dasharray="4 2"/>`,
    };
  },

  wright_map: (ink: ResolvedInk) => {
    const cx = 178, y0 = 46, y1 = 192;
    const levels = ['+3', '+2', '+1', '0', '-1', '-2', '-3'];
    const ticks = levels.map((lbl, i) => {
      const y = y0 + (i / 6) * (y1 - y0);
      return `<line x1="${cx - 4}" y1="${f1(y)}" x2="${cx + 4}" y2="${f1(y)}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + txt(cx, y + 2.5, lbl, { size: 6.7, weight: 700, fill: ink.axis, anchor: 'middle' });
    }).join('');
    const hist = [14, 28, 56, 84, 72, 46, 24, 12];
    const bh = (y1 - y0) / hist.length;
    const leftBars = hist.map((w, i) => {
      const y = y0 + i * bh;
      return `<rect x="${f1(cx - 16 - w)}" y="${f1(y + 1.5)}" width="${w}" height="${f1(bh - 3)}" rx="1.5" fill="${ink.primary}" fill-opacity="0.58"/>`;
    }).join('');
    const items = [
      ['Q8 深度定制', 54], ['Q6 付费升级', 74], ['Q4 主动推荐', 96], ['Q2 常规复购', 118],
      ['Q5 界面理解', 138], ['Q1 首次认知', 162],
    ] as const;
    const rightItems = items.map(([lbl, y]) =>
      `<line x1="${cx + 14}" y1="${y}" x2="${cx + 26}" y2="${y}" stroke="${ink.secondary}" stroke-width="1.4"/>`
      + `<circle cx="${cx + 28}" cy="${y}" r="2.8" fill="${ink.secondary}"/>`
      + txt(cx + 35, y + 2.5, lbl, { size: 7.2, weight: 600, fill: ink.text }),
    ).join('');
    return {
      title: 'Rasch 怀特图 (能力—难度对齐)',
      badge: '人员信度=0.91',
      body: txt(112, 40, '受访者能力分布 (Person)', { size: 7.3, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(248, 40, '题项难度定位 (Item)', { size: 7.3, weight: 700, fill: ink.secondary, anchor: 'middle' })
        + `<line x1="${cx - 12}" y1="${y0}" x2="${cx - 12}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + `<line x1="${cx + 12}" y1="${y0}" x2="${cx + 12}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + ticks + leftBars + rightItems
        + txt(cx, 206, 'Logit 共振刻度 (-3 ~ +3)', { size: 7.1, fill: ink.muted, anchor: 'middle' }),
    };
  },

  psych_network: (ink: ResolvedInk) => {
    const cx = 180, cy = 124, r = 64;
    const nodes = [
      ['效能感', 0, ink.primary],
      ['易用性', 60, ink.primary],
      ['制度信任', 120, ink.secondary],
      ['采纳意愿', 180, ink.primary],
      ['隐私顾虑', 240, ink.opposite],
      ['转化摩擦', 300, ink.opposite],
    ] as const;
    const pos = nodes.map(([lbl, deg, col]) => {
      const [x, y] = polarXY(cx, cy, r, deg);
      return { lbl, x, y, col };
    });
    const edges: [number, number, number, boolean][] = [
      [0, 1, 3.2, true], [0, 3, 2.4, true], [1, 2, 2.6, true], [2, 3, 3.6, true],
      [2, 4, 2.5, false], [3, 4, 2.2, false], [3, 5, 1.8, false], [4, 5, 2.8, true],
    ];
    const edgeLines = edges.map(([i, j, w, posSign]) =>
      `<line x1="${f1(pos[i].x)}" y1="${f1(pos[i].y)}" x2="${f1(pos[j].x)}" y2="${f1(pos[j].y)}" stroke="${posSign ? ink.primary : ink.opposite}" stroke-width="${w}" stroke-opacity="0.58"${posSign ? '' : ' stroke-dasharray="3.5 2.5"'}/>`,
    ).join('');
    const nodeCircles = pos.map(n =>
      `<circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="16" fill="${ink.surface}" stroke="${n.col}" stroke-width="2.2"/>`
      + txt(n.x, n.y + 2.5, n.lbl, { size: 7, weight: 700, fill: ink.text, anchor: 'middle' }),
    ).join('');
    return {
      title: 'EBICglasso 心理构念偏相关网络',
      badge: '核心桥接: 制度信任',
      body: legendChips([{ label: '正偏相关', color: ink.primary, kind: 'line' }, { label: '负向抑制', color: ink.opposite, kind: 'dash' }], 24, 43, ink)
        + edgeLines + nodeCircles,
    };
  },

  funnel_meta: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xCenter = (x0 + x1) / 2;
    const xTicks = [-0.6, -0.3, 0, 0.3, 0.6].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v.toFixed(1) }));
    const yTicks = [0, 0.1, 0.2, 0.3, 0.4].map((v, i) => ({ pos: y0 + (i / 4) * (y1 - y0), label: v.toFixed(1) }));
    const xMean = xCenter + 22;
    const funnelPts: [number, number][] = [[xMean, y0], [xMean + 96, y1], [xMean - 96, y1]];
    const studies: [number, number][] = [
      [xMean - 12, 62], [xMean + 8, 56], [xMean - 4, 74], [xMean + 18, 82], [xMean - 22, 92],
      [xMean + 28, 102], [xMean - 14, 114], [xMean + 6, 122], [xMean - 38, 134], [xMean + 42, 140],
      [xMean - 28, 156], [xMean + 52, 162], [xMean - 54, 174], [xMean + 14, 168],
    ];
    return {
      title: '文献 Meta 发表偏倚检验漏斗图',
      badge: 'Egger p=0.41 · 无偏倚',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '标准误 SE (倒置)', xTitle: '标准化效应量 SMD' }, ink)
        + `<polygon points="${polyStr(funnelPts)}" fill="${ink.primary}" fill-opacity="0.08" stroke="${ink.primary}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + `<line x1="${xMean}" y1="${y0}" x2="${xMean}" y2="${y1}" stroke="${ink.primary}" stroke-width="1.3"/>`
        + `<line x1="${xCenter}" y1="${y0}" x2="${xCenter}" y2="${y1}" stroke="${ink.lightMuted}" stroke-width="0.8" stroke-dasharray="2 2"/>`
        + studies.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.1" fill="${ink.secondary}" fill-opacity="0.78"/>`).join('')
        + txt(xMean + 4, y0 + 11, '合并效应 0.24', { size: 6.9, weight: 700, fill: ink.primary }),
    };
  },

  dose_response_4pl: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [5, 10, 20, 35, 50].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}%` }));
    const yTicks = [0, 25, 50, 75, 100].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}%` }));
    const xs = Array.from({ length: 28 }, (_, i) => i / 27);
    const fn4pl = (t: number) => 0.08 + 0.84 / (1 + Math.exp(-8.5 * (t - 0.52)));
    const curve: [number, number][] = xs.map(t => [x0 + t * (x1 - x0), y1 - fn4pl(t) * (y1 - y0)]);
    const obs: [number, number][] = [0.08, 0.25, 0.42, 0.52, 0.65, 0.82, 0.94].map(t => [x0 + t * (x1 - x0), y1 - fn4pl(t) * (y1 - y0)]);
    const xEc50 = x0 + 0.52 * (x1 - x0), yEc50 = y1 - 0.5 * (y1 - y0);
    return {
      title: '补贴力度—采纳转化 4PL 剂量效应曲线',
      badge: 'EC50=24.5% · R²=0.98',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '预期转化率 (%)', xTitle: '价格补贴折扣强度' }, ink)
        + bandPolygon(curve.map(([x, y]) => [x, y - 8]), curve.map(([x, y]) => [x, y + 8]), ink.primary, 0.16)
        + `<path d="${smoothCurvePath(curve)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<line x1="${x0}" y1="${f1(yEc50)}" x2="${f1(xEc50)}" y2="${f1(yEc50)}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xEc50)}" y1="${f1(yEc50)}" x2="${f1(xEc50)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + obs.map(([x, y]) => errV(x, y - 7, y + 7, ink.secondary, 2.8) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="3" fill="${ink.secondary}"/>`).join('')
        + `<circle cx="${f1(xEc50)}" cy="${f1(yEc50)}" r="4" fill="${ink.opposite}"/>`
        + txt(xEc50 + 6, yEc50 + 3, '半数有效阈值 EC50=24.5%', { size: 7, weight: 700, fill: ink.opposite }),
    };
  },

  subgroup_forest: (ink: ResolvedInk) => {
    const rowsData = [
      ['总体样本汇总', 1.68, 1.38, 2.04, '—', true],
      ['区域 · 主城区', 1.84, 1.42, 2.38, '0.024*', false],
      ['区域 · 县域', 1.28, 0.96, 1.71, '', false],
      ['年龄 · ≤35岁', 1.96, 1.48, 2.59, '0.018*', false],
      ['年龄 · >35岁', 1.32, 0.99, 1.76, '', false],
    ] as const;
    const x0 = 86, y0 = 44, x1 = 258, y1 = 192;
    const xMap = (v: number) => x0 + ((v - 0.5) / 2.3) * (x1 - x0);
    const xTicks = [0.5, 1.0, 1.5, 2.0, 2.5].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const rowH = (y1 - y0) / rowsData.length;
    const xNull = xMap(1.0);
    const rows = rowsData.map(([lbl, orV, lo, hi, pInt, isSum], i) => {
      const cy = y0 + (i + 0.5) * rowH, cx = xMap(orV), xl = xMap(lo), xr = xMap(hi);
      const c = isSum ? ink.opposite : lo > 1 ? ink.primary : ink.muted;
      const shape = isSum
        ? `<polygon points="${f1(xl)},${f1(cy)} ${f1(cx)},${f1(cy - 5)} ${f1(xr)},${f1(cy)} ${f1(cx)},${f1(cy + 5)}" fill="${c}"/>`
        : errH(cy, xl, xr, c, 2.8) + `<rect x="${f1(cx - 3.2)}" y="${f1(cy - 3.2)}" width="6.4" height="6.4" fill="${c}"/>`;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.1, weight: isSum ? 700 : 500, fill: ink.text, anchor: 'end' })
        + shape
        + txt(266, cy + 2.5, `${orV.toFixed(2)} (${lo.toFixed(2)}–${hi.toFixed(2)})`, { size: 6.7, fill: c })
        + (pInt ? txt(344, cy + 2.5, pInt, { size: 6.8, weight: 700, fill: ink.opposite, anchor: 'end' }) : '');
    }).join('');
    return {
      title: '分层异质性交互亚组森林图',
      badge: 'I²=38% · 交互显著',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '亚组优势比 OR (95%CI)' }, ink)
        + `<line x1="${f1(xNull)}" y1="${y0}" x2="${f1(xNull)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3 2"/>`
        + txt(266, 39, 'OR (95%CI)', { size: 6.8, weight: 700, fill: ink.muted })
        + txt(344, 39, 'p_交互', { size: 6.8, weight: 700, fill: ink.muted, anchor: 'end' })
        + rows,
    };
  },

  hlm_random_slopes: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (x: number) => x0 + ((x + 2) / 4) * (x1 - x0);
    const yMap = (y: number) => y1 - ((y - 2.0) / 3.2) * (y1 - y0);
    const xTicks = [-2, -1, 0, 1, 2].map(v => ({ pos: xMap(v), label: v === 0 ? '0(均值)' : `${v > 0 ? '+' : ''}${v}SD` }));
    const yTicks = [2.0, 2.8, 3.6, 4.4, 5.2].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const groups: [number, number, string, boolean][] = [
      [3.05, 0.16, ink.accent4, false],
      [3.26, 0.72, ink.opposite, true],
      [3.42, 0.34, ink.secondary, false],
      [3.62, 0.50, ink.secondary, false],
      [3.78, 0.26, ink.secondary, false],
      [3.92, 0.64, ink.secondary, false],
      [4.12, 0.42, ink.secondary, false],
    ];
    const gLines = groups.map(([b0, b1, c, hi]) => {
      const yL = yMap(b0 + b1 * -1.8), yR = yMap(b0 + b1 * 1.8);
      return `<line x1="${f1(xMap(-1.8))}" y1="${f1(yL)}" x2="${f1(xMap(1.8))}" y2="${f1(yR)}" stroke="${c}" stroke-width="${hi ? 1.6 : 1.15}" stroke-opacity="${hi ? 0.9 : 0.45}"${hi ? ' stroke-dasharray="3.5 2"' : ''}/>`;
    }).join('');
    const meanTop: [number, number][] = [[-1.9, 3.6 + 0.46 * -1.9 + 0.16], [0, 3.6 + 0.12], [1.9, 3.6 + 0.46 * 1.9 + 0.16]].map(([x, y]) => [xMap(x), yMap(y)]);
    const meanBot: [number, number][] = [[-1.9, 3.6 + 0.46 * -1.9 - 0.16], [0, 3.6 - 0.12], [1.9, 3.6 + 0.46 * 1.9 - 0.16]].map(([x, y]) => [xMap(x), yMap(y)]);
    const dots: [number, number, string][] = [
      [-1.5, 2.35, ink.opposite], [-0.8, 2.75, ink.opposite], [0.2, 3.38, ink.opposite], [1.1, 4.02, ink.opposite], [1.6, 4.46, ink.opposite],
      [-1.4, 3.32, ink.secondary], [-0.5, 3.68, ink.secondary], [0.4, 3.92, ink.secondary], [1.3, 4.38, ink.secondary],
    ];
    return {
      title: '多层线性模型 (HLM) 随机截距与斜率簇',
      badge: 'ICC=0.184 · 7群组BLUP',
      body: legendChips([{ label: '固定效应总斜率 γ10=0.46***', color: ink.primary, kind: 'line' }, { label: '群组随机斜率', color: ink.secondary, kind: 'line' }, { label: '高敏感极端群', color: ink.opposite, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '响应指标 Y_ij', xTitle: '组中心化预测变量 (X_ij - 组均值)' }, ink)
        + bandPolygon(meanTop, meanBot, ink.primary, 0.16)
        + gLines
        + `<line x1="${f1(xMap(-1.9))}" y1="${f1(yMap(3.6 - 0.46 * 1.9))}" x2="${f1(xMap(1.9))}" y2="${f1(yMap(3.6 + 0.46 * 1.9))}" stroke="${ink.primary}" stroke-width="2.5"/>`
        + dots.map(([x, y, c]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.2" fill="${c}" fill-opacity="0.72"/>`).join('')
        + pill(54, 54, 'Y_ij = (γ00+u0j) + (γ10+u1j)X_ij + ε_ij', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.7, h: 14 }),
    };
  },

  competing_cif: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (m: number) => x0 + (m / 36) * (x1 - x0);
    const yMap = (p: number) => y1 - (p / 0.8) * (y1 - y0);
    const xTicks = [0, 6, 12, 18, 24, 30, 36].map(m => ({ pos: xMap(m), label: `${m}月` }));
    const yTicks = [0, 0.2, 0.4, 0.6, 0.8].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const stepPath = (pts: readonly [number, number][]) => {
      let d = `M ${f1(xMap(pts[0][0]))} ${f1(yMap(pts[0][1]))}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` H ${f1(xMap(pts[i][0]))} V ${f1(yMap(pts[i][1]))}`;
      }
      return d;
    };
    const ev1T: [number, number][] = [[0, 0], [5, 0.08], [10, 0.19], [16, 0.34], [22, 0.46], [29, 0.56], [36, 0.62]];
    const ev1C: [number, number][] = [[0, 0], [6, 0.05], [12, 0.12], [18, 0.21], [24, 0.29], [30, 0.35], [36, 0.39]];
    const ev2: [number, number][] = [[0, 0], [7, 0.04], [14, 0.09], [20, 0.14], [27, 0.19], [36, 0.23]];
    const bandPts: [number, number][] = ev1T.map(([m, p]) => [xMap(m), yMap(p)]);
    const bandBase: [number, number][] = ev1C.map(([m, p]) => [xMap(m), yMap(p)]);
    return {
      title: '竞争风险累积发生函数 (CIF) 对比',
      badge: 'Gray p=0.004 · sHR=1.68',
      body: legendChips([{ label: '目标事件(干预)', color: ink.primary, kind: 'line' }, { label: '目标事件(对照)', color: ink.secondary, kind: 'dash' }, { label: '竞争事件(流失)', color: ink.opposite, kind: 'line' }], 44, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '累积发生概率 CIF(t)', xTitle: '随访观察月数 t' }, ink)
        + bandPolygon(bandPts, bandBase, ink.primary, 0.12)
        + `<path d="${stepPath(ev1C)}" stroke="${ink.secondary}" stroke-width="1.8" stroke-dasharray="4 2"/>`
        + `<path d="${stepPath(ev2)}" stroke="${ink.opposite}" stroke-width="1.8"/>`
        + `<path d="${stepPath(ev1T)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + txt(x1 - 4, yMap(0.62) - 5, '干预组 62.0%', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x1 - 4, yMap(0.39) - 5, '对照组 39.0%', { size: 6.7, weight: 600, fill: ink.secondary, anchor: 'end' })
        + txt(x1 - 4, yMap(0.23) - 5, '竞争事件 23.0%', { size: 6.7, weight: 600, fill: ink.opposite, anchor: 'end' })
        + pill(54, 54, 'Aalen-Johansen 估计 · 禁用 1-KM', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.6, h: 14 }),
    };
  },

  decision_curve_dca: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (pt: number) => x0 + (pt / 0.8) * (x1 - x0);
    const yMap = (nb: number) => y1 - ((nb + 0.05) / 0.35) * (y1 - y0);
    const xTicks = [0, 0.2, 0.4, 0.6, 0.8].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = [-0.05, 0, 0.1, 0.2, 0.3].map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const pi = 0.28;
    const ptsGrid = Array.from({ length: 24 }, (_, i) => 0.02 + (i / 23) * 0.72);
    const allPts: [number, number][] = ptsGrid
      .map(pt => [pt, pi - (1 - pi) * (pt / (1 - pt))] as const)
      .filter(([, nb]) => nb >= -0.05)
      .map(([pt, nb]) => [xMap(pt), yMap(nb)]);
    const baseFn = (pt: number) => Math.max(-0.02, 0.275 - 0.56 * pt + 0.24 * pt * pt);
    const fullFn = (pt: number) => Math.max(0, 0.28 - 0.39 * pt + 0.06 * Math.sin(pt * 3.8));
    const basePts: [number, number][] = ptsGrid.filter(pt => baseFn(pt) >= -0.04).map(pt => [xMap(pt), yMap(baseFn(pt))]);
    const fullPts: [number, number][] = ptsGrid.map(pt => [xMap(pt), yMap(fullFn(pt))]);
    const floorPts: [number, number][] = ptsGrid.map(pt => {
      const treatAll = pi - (1 - pi) * (pt / (1 - pt));
      return [xMap(pt), yMap(Math.max(0, treatAll))];
    });
    return {
      title: '临床/风控决策曲线分析 (DCA)',
      badge: '获益窗 Pt ∈ [0.10, 0.68]',
      body: legendChips([{ label: '多维融合模型', color: ink.primary, kind: 'line' }, { label: '单维基准', color: ink.secondary, kind: 'dash' }, { label: '全干预 Treat All', color: ink.opposite, kind: 'dash' }], 44, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '净获益 Net Benefit', xTitle: '决策阈值概率 Pt' }, ink)
        + bandPolygon(fullPts, floorPts, ink.primary, 0.14)
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="1"/>`
        + txt(x1 - 4, yMap(0) - 4, 'Treat None (NB=0)', { size: 6.5, fill: ink.axis, anchor: 'end' })
        + `<path d="${smoothCurvePath(allPts)}" stroke="${ink.opposite}" stroke-width="1.5" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(basePts)}" stroke="${ink.secondary}" stroke-width="1.7" stroke-dasharray="4 2"/>`
        + `<path d="${smoothCurvePath(fullPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + pill(330, 54, '净收益增量窗 Pt∈[0.10, 0.68]', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.6, h: 14, align: 'right' }),
    };
  },

  restricted_cubic_spline: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + ((v - 5) / 85) * (x1 - x0);
    const yMap = (v: number) => y1 - ((v - 0.4) / 2.25) * (y1 - y0);
    const xTicks = [10, 25, 40, 55, 70, 85].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [0.5, 1.0, 1.5, 2.0, 2.5].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const knots: [number, string][] = [[14, 'P5'], [34, 'P35(Ref)'], [52, 'P65'], [78, 'P95']];
    const xs = [8, 14, 22, 30, 34, 42, 48, 56, 65, 74, 82, 86];
    const orFn = (x: number) => {
      if (x <= 34) return 0.88 + 0.12 * Math.pow(x / 34, 1.6);
      const t = (x - 34) / 52;
      return 1.0 + 0.42 * t + 0.98 * t * t;
    };
    const seFn = (x: number) => Math.abs(x - 34) * 0.0062 + (x > 65 ? (x - 65) * 0.005 : 0);
    const midPts: [number, number][] = xs.map(x => [xMap(x), yMap(orFn(x))]);
    const topPts: [number, number][] = xs.map(x => [xMap(x), yMap(orFn(x) + seFn(x))]);
    const botPts: [number, number][] = xs.map(x => [xMap(x), yMap(Math.max(0.45, orFn(x) - seFn(x)))]);
    const xInf = 48;
    return {
      title: '限制性立方样条 (RCS 4-Knot) 效应',
      badge: 'P_all<0.001 · P_nl=0.004',
      body: legendChips([
        { label: '样条 OR 曲线', color: ink.primary, kind: 'line' },
        { label: '95% CI 带', color: ink.primary, kind: 'box' },
        { label: '节点 (P5/35/65/95)', color: ink.opposite, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '优势比 OR (95% CI)', xTitle: '连续暴露强度 X (参照点 Ref = P35)' }, ink)
        + `<line x1="${x0}" y1="${f1(yMap(1.0))}" x2="${x1}" y2="${f1(yMap(1.0))}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xMap(xInf))}" y1="${y0}" x2="${f1(xMap(xInf))}" y2="${y1}" stroke="${ink.secondary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + knots.map(([kx, kl]) => `<line x1="${f1(xMap(kx))}" y1="${y1 - 6}" x2="${f1(xMap(kx))}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.3"/>`
          + `<circle cx="${f1(xMap(kx))}" cy="${y1 - 6}" r="2.2" fill="${ink.opposite}"/>`
          + txt(xMap(kx), y1 - 10, kl, { size: 6.2, weight: 600, fill: ink.opposite, anchor: 'middle' })).join('')
        + bandPolygon(topPts, botPts, ink.primary, 0.18)
        + `<path d="${smoothCurvePath(midPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<circle cx="${f1(xMap(34))}" cy="${f1(yMap(1.0))}" r="3.4" fill="${ink.surface}" stroke="${ink.primary}" stroke-width="1.5"/>`
        + `<circle cx="${f1(xMap(xInf))}" cy="${f1(yMap(orFn(xInf)))}" r="3.4" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="1"/>`
        + pill(54, 54, '拐点 X*=48 起效 · P95 线性外推', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.5, h: 14 }),
    };
  },

  rmst_survival_diff: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (t: number) => x0 + (t / 30) * (x1 - x0);
    const yMap = (s: number) => y1 - s * (y1 - y0);
    const xTicks = [0, 6, 12, 18, 24, 30].map(v => ({ pos: xMap(v), label: `${v}月` }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const expandStep = (pts: readonly [number, number][]): [number, number][] => {
      const out: [number, number][] = [[xMap(pts[0][0]), yMap(pts[0][1])]];
      for (let i = 1; i < pts.length; i++) {
        out.push([xMap(pts[i][0]), yMap(pts[i - 1][1])]);
        out.push([xMap(pts[i][0]), yMap(pts[i][1])]);
      }
      return out;
    };
    const s1Raw: [number, number][] = [[0, 1.0], [3, 0.94], [6, 0.88], [10, 0.82], [14, 0.76], [18, 0.71], [22, 0.67], [24, 0.65], [27, 0.62], [30, 0.58]];
    const s0Raw: [number, number][] = [[0, 1.0], [3, 0.91], [6, 0.78], [9, 0.66], [12, 0.55], [16, 0.44], [20, 0.36], [24, 0.31], [27, 0.27], [30, 0.24]];
    const s1Trunc = s1Raw.filter(([t]) => t <= 24);
    const s0Trunc = s0Raw.filter(([t]) => t <= 24);
    const s1All = expandStep(s1Raw);
    const s0All = expandStep(s0Raw);
    const s1Band = expandStep(s1Trunc);
    const s0Band = expandStep(s0Trunc);
    const xTau = xMap(24);
    return {
      title: '限制性平均生存时间 (RMST) 对照',
      badge: 'ΔRMST=+4.2月 · p=0.002',
      body: legendChips([
        { label: '干预组 (18.4月)', color: ink.primary, kind: 'line' },
        { label: '对照组 (14.2月)', color: ink.secondary, kind: 'line' },
        { label: 'ΔRMST 面积', color: ink.opposite, kind: 'box' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '无事件生存概率 S(t)', xTitle: '随访观察时间 t (截断窗口 τ* = 24月)' }, ink)
        + `<rect x="${f1(xTau)}" y="${y0}" width="${f1(x1 - xTau)}" height="${y1 - y0}" fill="${ink.muted}" fill-opacity="0.08"/>`
        + bandPolygon(s1Band, s0Band, ink.opposite, 0.18)
        + `<line x1="${f1(xTau)}" y1="${y0}" x2="${f1(xTau)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr(s0All)}" stroke="${ink.secondary}" stroke-width="1.9"/>`
        + `<polyline points="${polyStr(s1All)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + txt(xTau + 4, y0 + 11, 'τ*=24月', { size: 6.7, weight: 700, fill: ink.opposite })
        + pill(xMap(9), yMap(0.18), 'ΔRMST = +4.2月 (95%CI: 2.1–6.3)', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.4, h: 14, align: 'center' }),
    };
  },

  mcmc_trace_rhat: (ink: ResolvedInk) => {
    const lx0 = 44, ly0 = 48, lx1 = 212, ly1 = 192;
    const rx0 = 230, ry0 = 48, rx1 = 344, ry1 = 192;
    const lyMap = (v: number) => ly1 - ((v - 0.14) / 0.56) * (ly1 - ly0);
    const nSteps = 32;
    const mkChain = (phase: number, freq: number) => Array.from({ length: nSteps }, (_, i): [number, number] => {
      const val = 0.42 + 0.055 * Math.sin(i * freq + phase) + 0.032 * Math.cos(i * 1.9 + phase * 1.7);
      return [lx0 + (i / (nSteps - 1)) * (lx1 - lx0), lyMap(val)];
    });
    const c1 = mkChain(0.2, 1.35), c2 = mkChain(2.1, 1.52), c3 = mkChain(4.1, 1.21);
    const rxMap = (v: number) => rx0 + ((v - 0.14) / 0.56) * (rx1 - rx0);
    const ryMap = (d: number) => ry1 - (d / 6.8) * (ry1 - ry0);
    const xs = Array.from({ length: 25 }, (_, i) => 0.16 + (i / 24) * 0.52);
    const mkKde = (mu: number, sig: number, scale: number): [number, number][] => xs.map(x => {
      const d = scale * Math.exp(-0.5 * (((x - mu) / sig) ** 2));
      return [rxMap(x), ryMap(d)];
    });
    const k1 = mkKde(0.42, 0.068, 5.6), k2 = mkKde(0.415, 0.070, 5.4), k3 = mkKde(0.424, 0.066, 5.7);
    const lxTicks = [0, 500, 1000].map((v, i) => ({ pos: lx0 + (i / 2) * (lx1 - lx0), label: String(v) }));
    const lyTicks = [0.2, 0.4, 0.6].map(v => ({ pos: lyMap(v), label: v.toFixed(1) }));
    const rxTicks = [0.2, 0.4, 0.6].map(v => ({ pos: rxMap(v), label: v.toFixed(1) }));
    return {
      title: '贝叶斯 MCMC 轨迹与 R̂/ESS 诊断',
      badge: 'R̂=1.003 · ESS=2480',
      body: legendChips([
        { label: 'Chain 1', color: ink.primary, kind: 'line' },
        { label: 'Chain 2', color: ink.secondary, kind: 'line' },
        { label: 'Chain 3', color: ink.opposite, kind: 'line' },
        { label: '95% HDI', color: ink.primary, kind: 'box' },
      ], 44, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, box: true, yTicks: lyTicks, xTicks: lxTicks, yTitle: '参数抽样值 θ', xTitle: 'MCMC 迭代步数 (Post-Warmup)' }, ink)
        + `<rect x="${lx0}" y="${ly0}" width="22" height="${ly1 - ly0}" fill="${ink.muted}" fill-opacity="0.12"/>`
        + txt(lx0 + 11, ly0 + 11, '预热', { size: 6.0, fill: ink.muted, anchor: 'middle' })
        + `<line x1="${lx0}" y1="${f1(lyMap(0.42))}" x2="${lx1}" y2="${f1(lyMap(0.42))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(c3)}" stroke="${ink.opposite}" stroke-width="1.05" stroke-opacity="0.82"/>`
        + `<polyline points="${polyStr(c2)}" stroke="${ink.secondary}" stroke-width="1.05" stroke-opacity="0.82"/>`
        + `<polyline points="${polyStr(c1)}" stroke="${ink.primary}" stroke-width="1.15" stroke-opacity="0.9"/>`
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, box: true, xTicks: rxTicks, xTitle: '后验核密度' }, ink)
        + `<path d="${smoothCurvePath(k1)} L ${rxMap(0.68)} ${ry1} L ${rxMap(0.16)} ${ry1} Z" fill="${ink.primary}" fill-opacity="0.14"/>`
        + `<path d="${smoothCurvePath(k3)}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="3 1.5"/>`
        + `<path d="${smoothCurvePath(k2)}" stroke="${ink.secondary}" stroke-width="1.4"/>`
        + `<path d="${smoothCurvePath(k1)}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + `<line x1="${f1(rxMap(0.29))}" y1="${ry1 - 7}" x2="${f1(rxMap(0.55))}" y2="${ry1 - 7}" stroke="${ink.primary}" stroke-width="3.2"/>`
        + txt(rxMap(0.42), ry1 - 12, '95% HDI [0.29, 0.55]', { size: 6.1, weight: 700, fill: ink.primary, anchor: 'middle' })
        + pill((rx0 + rx1) / 2, ry0 + 6, 'R̂=1.003 · ESS=2480', { bg: ink.surface, stroke: ink.secondary, color: ink.secondary, size: 6.2, h: 13, align: 'center' }),
    };
  },

  trial_sequential_tsa: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (n: number) => x0 + (n / 2100) * (x1 - x0);
    const yMap = (z: number) => y1 - ((z + 4.5) / 9.8) * (y1 - y0);
    const xTicks = [0, 500, 1000, 1500, 2000].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [-4, -2, 0, 2, 4].map(v => ({ pos: yMap(v), label: String(v) }));
    const ris = 1860;
    const obfNs = Array.from({ length: 16 }, (_, i) => 260 + (i / 15) * (2040 - 260));
    const obfVal = (n: number) => Math.min(4.7, 1.96 / Math.sqrt(Math.max(0.14, n / ris)));
    const obfHi: [number, number][] = obfNs.map(n => [xMap(n), yMap(obfVal(n))]);
    const obfLo: [number, number][] = obfNs.map(n => [xMap(n), yMap(-obfVal(n))]);
    const zSteps: [number, number][] = [[140, 0.42], [320, 0.96], [510, 1.48], [720, 1.98], [940, 2.38], [1180, 2.74], [1390, 3.12], [1560, 3.44]];
    const zPts: [number, number][] = zSteps.map(([n, z]) => [xMap(n), yMap(z)]);
    const crossPt = zPts[5];
    return {
      title: '序贯试验分析 (TSA) 累积 Z 与 RIS',
      badge: 'RIS=1860 · 跨越获益界',
      body: legendChips([
        { label: '累积 Z 曲线', color: ink.primary, kind: 'line' },
        { label: 'OBF α-消耗界', color: ink.opposite, kind: 'dash' },
        { label: '无效边界', color: ink.secondary, kind: 'dash' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '累积 Z 统计量', xTitle: '累积样本量 n (期望信息量 RIS = 1860)' }, ink)
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.8"/>`
        + `<line x1="${x0}" y1="${f1(yMap(1.96))}" x2="${x1}" y2="${f1(yMap(1.96))}" stroke="${ink.lightMuted}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${f1(yMap(-1.96))}" x2="${x1}" y2="${f1(yMap(-1.96))}" stroke="${ink.lightMuted}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xMap(ris))}" y1="${y0}" x2="${f1(xMap(ris))}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr([[xMap(760), yMap(0)], [xMap(ris), yMap(1.96)]])}" stroke="${ink.secondary}" stroke-width="1.1" stroke-dasharray="2.5 2"/>`
        + `<polyline points="${polyStr([[xMap(760), yMap(0)], [xMap(ris), yMap(-1.96)]])}" stroke="${ink.secondary}" stroke-width="1.1" stroke-dasharray="2.5 2"/>`
        + `<path d="${smoothCurvePath(obfHi)}" stroke="${ink.opposite}" stroke-width="1.6" stroke-dasharray="4 2"/>`
        + `<path d="${smoothCurvePath(obfLo)}" stroke="${ink.opposite}" stroke-width="1.6" stroke-dasharray="4 2"/>`
        + `<polyline points="${polyStr(zPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + zPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i === 5 ? 4 : 2.3}" fill="${i === 5 ? ink.opposite : ink.primary}" stroke="${ink.surface}" stroke-width="0.9"/>`).join('')
        + txt(xMap(ris) - 4, y1 - 6, 'RIS=1860', { size: 6.5, weight: 700, fill: ink.opposite, anchor: 'end' })
        + pill(crossPt[0] - 8, yMap(3.8), '提前跨越获益界 (n=1180)', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.3, h: 13.5, align: 'center' }),
    };
  },

  cox_nomogram_calibration: (ink: ResolvedInk) => {
    const rulers = [
      { lbl: '得分 Points', y: 66, ticks: ['0', '25', '50', '75', '100'], col: ink.axis },
      { lbl: '风险评分 Xβ', y: 94, ticks: ['低', '中低', '中高', '高'], col: ink.primary },
      { lbl: '年龄分段', y: 122, ticks: ['<35', '45', '55', '65+'], col: ink.secondary },
      { lbl: '总分 Total', y: 150, ticks: ['40', '90', '140', '190'], col: ink.axis },
      { lbl: '5年生存率', y: 178, ticks: ['0.9', '0.7', '0.5', '0.3'], col: ink.opposite },
    ] as const;
    const lx0 = 58, lx1 = 174;
    const nomoCard = `<rect x="12" y="48" width="170" height="148" rx="4" fill="${ink.surface}" fill-opacity="0.72" stroke="${ink.border}" stroke-width="0.9"/>`
      + txt(97, 57, 'Cox 多因素列线图打分尺', { size: 6.8, weight: 700, fill: ink.text, anchor: 'middle' })
      + rulers.map(r => {
        const ts = evenlySpacedTicks(lx0, lx1, r.ticks);
        return txt(lx0 - 5, r.y + 2.2, r.lbl, { size: 6.2, weight: 600, fill: r.col, anchor: 'end' })
          + `<line x1="${lx0}" y1="${r.y}" x2="${lx1}" y2="${r.y}" stroke="${r.col}" stroke-width="1.2"/>`
          + ts.map(t => `<line x1="${f1(t.pos)}" y1="${r.y - 2.5}" x2="${f1(t.pos)}" y2="${r.y + 2.5}" stroke="${r.col}" stroke-width="0.9"/>`
            + txt(t.pos, r.y + 9.5, t.label, { size: 5.8, fill: ink.muted, anchor: 'middle' })).join('');
      }).join('');

    const rx0 = 214, ry0 = 48, rx1 = 342, ry1 = 192;
    const xMap = (v: number) => rx0 + ((v - 0.2) / 0.8) * (rx1 - rx0);
    const yMap = (v: number) => ry1 - ((v - 0.2) / 0.8) * (ry1 - ry0);
    const ticks = [0.2, 0.4, 0.6, 0.8, 1.0];
    const xTicks = ticks.map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = ticks.map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const yr1: [number, number][] = [[0.52, 0.54], [0.66, 0.65], [0.78, 0.79], [0.90, 0.89]];
    const yr3: [number, number][] = [[0.38, 0.36], [0.54, 0.56], [0.70, 0.68], [0.84, 0.83]];
    const yr5: [number, number][] = [[0.26, 0.29], [0.42, 0.40], [0.58, 0.55], [0.74, 0.75]];
    const drawCal = (pts: readonly [number, number][], col: string) =>
      `<polyline points="${polyStr(pts.map(([x, y]) => [xMap(x), yMap(y)]))}" stroke="${col}" stroke-width="1.7"/>`
      + pts.map(([x, y]) => errV(xMap(x), yMap(y + 0.045), yMap(y - 0.045), col, 2.2)
        + `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.6" fill="${col}" stroke="${ink.surface}" stroke-width="0.7"/>`).join('');
    return {
      title: 'Cox 列线图 1/3/5 年生存预测校准曲线',
      badge: 'C-index=0.812 · Brier=0.11',
      body: legendChips([
        { label: '1年生存校准', color: ink.primary, kind: 'line' },
        { label: '3年生存校准', color: ink.secondary, kind: 'line' },
        { label: '5年生存校准', color: ink.opposite, kind: 'line' },
      ], 44, 39, ink)
        + nomoCard
        + txt(97, 214, '总风险积分 → 生存概率映射', { size: 7.0, weight: 600, fill: ink.axis, anchor: 'middle' })
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, yTicks, xTicks, box: true, xTitle: 'Nomogram 预测生存率' }, ink)
        + txt(rx0 - 24, (ry0 + ry1) / 2, 'KM 实测', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle', rotate: -90 })
        + `<line x1="${rx0}" y1="${ry1}" x2="${rx1}" y2="${ry0}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + drawCal(yr5, ink.opposite)
        + drawCal(yr3, ink.secondary)
        + drawCal(yr1, ink.primary),
    };
  },

  pca_biplot_loadings: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + ((v + 3.0) / 6.0) * (x1 - x0);
    const yMap = (v: number) => y1 - ((v + 2.5) / 5.0) * (y1 - y0);
    const xTicks = [-2, -1, 0, 1, 2].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [-2, -1, 0, 1, 2].map(v => ({ pos: yMap(v), label: String(v) }));
    const c1: [number, number][] = [[1.1, 0.9], [1.4, 1.2], [0.8, 0.6], [1.7, 0.8], [1.3, 0.4], [0.9, 1.3], [1.5, 1.0]];
    const c2: [number, number][] = [[-0.2, 0.5], [0.2, 0.9], [-0.4, 1.1], [0.1, 0.2], [-0.5, 0.6], [0.3, 1.3], [-0.1, 0.8]];
    const c3: [number, number][] = [[-1.4, -0.8], [-1.8, -1.1], [-1.1, -0.5], [-1.6, -0.4], [-0.9, -1.2], [-1.5, -1.0], [-1.2, -0.7]];
    const vectors = [
      { lbl: 'Q1 流程便利', vx: 2.1, vy: 1.4, anc: 'start' as const, dx: 4, dy: -2 },
      { lbl: 'Q2 响应时效', vx: 2.3, vy: 0.5, anc: 'start' as const, dx: 4, dy: 2 },
      { lbl: 'Q3 制度信任', vx: 0.7, vy: 1.8, anc: 'start' as const, dx: 4, dy: -1 },
      { lbl: 'Q4 口碑传播', vx: -0.6, vy: 1.6, anc: 'end' as const, dx: -4, dy: -2 },
      { lbl: 'Q5 价格顾虑', vx: -2.0, vy: -1.2, anc: 'end' as const, dx: -4, dy: 6 },
      { lbl: 'Q6 隐私担忧', vx: -1.5, vy: -1.7, anc: 'end' as const, dx: -4, dy: 6 },
    ];
    const ox = xMap(0), oy = yMap(0);
    const vecSvg = vectors.map(v => {
      const ex = xMap(v.vx), ey = yMap(v.vy);
      const ang = (Math.atan2(ey - oy, ex - ox) * 180) / Math.PI;
      return `<line x1="${f1(ox)}" y1="${f1(oy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${ink.opposite}" stroke-width="1.5"/>`
        + arrowPoly(ex, ey, ang, 4.5, ink.opposite)
        + txt(ex + v.dx, ey + v.dy, v.lbl, { size: 6.5, weight: 700, fill: darkenHex(ink.opposite, 0.15), anchor: v.anc });
    }).join('');
    return {
      title: '主成分 PCA/Varimax 双标得分与载荷矢量',
      badge: '累计方差 68.4% · KMO=0.86',
      body: legendChips([
        { label: 'C1 核心高粘群', color: ink.primary, kind: 'dot' },
        { label: 'C2 稳健平衡群', color: ink.secondary, kind: 'dot' },
        { label: 'C3 价格顾虑群', color: ink.muted, kind: 'dot' },
        { label: 'Varimax 载荷矢量', color: ink.opposite, kind: 'line' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: 'PC2 / Factor 2 (25.2%)', xTitle: 'PC1 / Factor 1 (43.2%, Varimax 正交旋转)' }, ink)
        + `<line x1="${x0}" y1="${f1(oy)}" x2="${x1}" y2="${f1(oy)}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(ox)}" y1="${y0}" x2="${f1(ox)}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="3 2"/>`
        + `<ellipse cx="${f1(xMap(1.24))}" cy="${f1(yMap(0.88))}" rx="34" ry="22" fill="${ink.primary}" fill-opacity="0.11" stroke="${ink.primary}" stroke-width="1" stroke-dasharray="3 2" transform="rotate(-14 ${f1(xMap(1.24))} ${f1(yMap(0.88))})"/>`
        + `<ellipse cx="${f1(xMap(-0.08))}" cy="${f1(yMap(0.77))}" rx="28" ry="21" fill="${ink.secondary}" fill-opacity="0.11" stroke="${ink.secondary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<ellipse cx="${f1(xMap(-1.36))}" cy="${f1(yMap(-0.81))}" rx="32" ry="20" fill="${ink.muted}" fill-opacity="0.12" stroke="${ink.muted}" stroke-width="1" stroke-dasharray="3 2" transform="rotate(-12 ${f1(xMap(-1.36))} ${f1(yMap(-0.81))})"/>`
        + c1.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.7" fill="${ink.primary}" fill-opacity="0.82"/>`).join('')
        + c2.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.7" fill="${ink.secondary}" fill-opacity="0.82"/>`).join('')
        + c3.map(([x, y]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(y))}" r="2.7" fill="${ink.muted}" fill-opacity="0.78"/>`).join('')
        + vecSvg,
    };
  },

  meta_funnel_trimfill: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 190;
    const xMap = (v: number) => x0 + ((v + 0.6) / 1.4) * (x1 - x0);
    const yMap = (se: number) => y0 + (se / 0.35) * (y1 - y0);
    const xTicks = [-0.6, -0.3, 0.0, 0.3, 0.6].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const yTicks = [0.0, 0.1, 0.2, 0.3].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xNull = xMap(0.0);
    const muOrig = 0.36, muAdj = 0.25;
    const seMax = 0.35;
    const contourPoly = (zCrit: number, fill: string, op: number) => {
      const dx = (zCrit * seMax) / 1.4 * (x1 - x0);
      const pts: [number, number][] = [[xNull, y0], [Math.min(x1, xNull + dx), y1], [Math.max(x0, xNull - dx), y1]];
      return `<polygon points="${polyStr(pts)}" fill="${fill}" fill-opacity="${op}"/>`;
    };
    const funnelPts: [number, number][] = [
      [xMap(muAdj), y0],
      [xMap(muAdj + 1.96 * seMax), y1],
      [xMap(muAdj - 1.96 * seMax), y1],
    ];
    const obsStudies: [number, number][] = [
      [0.24, 0.04], [0.31, 0.06], [0.18, 0.08], [0.38, 0.09], [0.29, 0.11],
      [0.44, 0.13], [0.22, 0.14], [0.49, 0.17], [0.35, 0.18], [0.56, 0.21],
      [0.42, 0.23], [0.62, 0.26], [0.51, 0.28], [0.66, 0.31],
    ];
    const impStudies: [number, number][] = [
      [-0.06, 0.21], [0.01, 0.26], [-0.12, 0.28], [-0.16, 0.31],
    ];
    return {
      title: 'Meta 轮廓漏斗与 Trim-and-Fill 剪补',
      badge: 'Egger p=0.014 · 剪补 k0=4',
      body: legendChips([
        { label: '实测纳入文献 (k=14)', color: ink.secondary, kind: 'dot' },
        { label: '剪补缺失研究 (k0=4)', color: ink.opposite, kind: 'dot' },
        { label: '校正后效应 0.25', color: ink.primary, kind: 'line' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '标准误 SE (倒置)', xTitle: '标准化效应量 SMD (轮廓区含显著性检验)' }, ink)
        + `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${ink.secondarySoft}" fill-opacity="0.30"/>`
        + contourPoly(2.576, ink.surface, 0.45)
        + contourPoly(1.96, ink.surface, 0.48)
        + contourPoly(1.645, ink.surface, 0.72)
        + `<polygon points="${polyStr(funnelPts)}" stroke="${ink.primary}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xNull)}" y1="${y0}" x2="${f1(xNull)}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.8" stroke-dasharray="2 2"/>`
        + `<line x1="${f1(xMap(muOrig))}" y1="${y0}" x2="${f1(xMap(muOrig))}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xMap(muAdj))}" y1="${y0}" x2="${f1(xMap(muAdj))}" y2="${y1}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + obsStudies.map(([x, se]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(se))}" r="2.9" fill="${ink.secondary}" fill-opacity="0.86"/>`).join('')
        + impStudies.map(([x, se]) => `<circle cx="${f1(xMap(x))}" cy="${f1(yMap(se))}" r="3.2" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.6"/>`).join('')
        + `<line x1="${f1(xMap(muOrig))}" y1="${y1 - 12}" x2="${f1(xMap(muAdj) + 5)}" y2="${y1 - 12}" stroke="${ink.opposite}" stroke-width="1.4"/>`
        + arrowPoly(xMap(muAdj), y1 - 12, 180, 4.5, ink.opposite)
        + txt(xMap(muOrig) + 4, y0 + 11, '原始 0.36', { size: 6.2, weight: 700, fill: ink.opposite })
        + txt(xMap(muAdj) - 4, y0 + 11, '校正 0.25', { size: 6.2, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x0 + 5, y0 + 11, 'p < 0.01 阴影区', { size: 6.0, fill: ink.secondary }),
    };
  },

  // =========================================================================
  // 8. SEGMENTATION & DECISION (人群细分与决策) - 17 types
  // =========================================================================
  radar: (ink: ResolvedInk) => {
    const cx = 148, cy = 124, maxR = 70;
    const dims = ['价值感知', '渠道粘性', '价格敏感', '科技接受', '口碑传播'];
    const rings = [1, 2, 3, 4, 5].map(v => {
      const r = (v / 5) * maxR;
      const pts = dims.map((_, i) => polarXY(cx, cy, r, i * 72));
      return `<polygon points="${polyStr(pts)}" stroke="${ink.grid}" stroke-width="0.8"/>`;
    }).join('');
    const spokes = dims.map((lbl, i) => {
      const [px, py] = polarXY(cx, cy, maxR, i * 72);
      const [lx, ly] = polarXY(cx, cy, maxR + 13, i * 72);
      const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
      return `<line x1="${cx}" y1="${cy}" x2="${f1(px)}" y2="${f1(py)}" stroke="${ink.grid}" stroke-width="0.8"/>`
        + txt(lx, ly + 2.5, lbl, { size: 7.3, weight: 600, fill: ink.text, anchor });
    }).join('');
    const segs = [
      { label: '核心拥趸 (36%)', color: ink.primary, vals: [4.6, 4.4, 2.3, 4.7, 4.5], dash: '' },
      { label: '务实观望 (42%)', color: ink.secondary, vals: [3.5, 3.2, 3.8, 3.3, 3.0], dash: '' },
      { label: '价格敏感 (22%)', color: ink.opposite, vals: [2.4, 2.2, 4.7, 2.1, 2.3], dash: '3.5 2' },
    ];
    const polys = segs.map(s => {
      const pts = s.vals.map((v, i) => polarXY(cx, cy, (v / 5) * maxR, i * 72));
      return `<polygon points="${polyStr(pts)}" fill="${s.color}" fill-opacity="0.18" stroke="${s.color}" stroke-width="1.8"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
    }).join('');
    return {
      title: 'K-Means 聚类五维人群画像雷达图',
      badge: 'K=3 · n=506',
      body: rings + spokes + polys + legendChips(segs.map(s => ({ label: s.label, color: s.color, kind: s.dash ? 'dash' : 'box' })), 236, 56, ink),
    };
  },

  silhouette_elbow: (ink: ResolvedInk) => {
    const ks = [2, 3, 4, 5, 6, 7];
    const sse = [1840, 1120, 860, 740, 680, 640];
    const sil = [0.46, 0.58, 0.49, 0.41, 0.36, 0.33];
    const x0 = 46, y0 = 48, x1 = 304, y1 = 192;
    const xTicks = ks.map((k, i) => ({ pos: x0 + 18 + (i / 5) * (x1 - x0 - 36), label: `K=${k}` }));
    const ySse = (v: number) => y1 - ((v - 400) / 1600) * (y1 - y0);
    const ySil = (v: number) => y1 - ((v - 0.2) / 0.45) * (y1 - y0);
    const yTicks = [400, 800, 1200, 1600, 2000].map(v => ({ pos: ySse(v), label: String(v) }));
    const ssePts: [number, number][] = xTicks.map((t, i) => [t.pos, ySse(sse[i])]);
    const silPts: [number, number][] = xTicks.map((t, i) => [t.pos, ySil(sil[i])]);
    return {
      title: '聚类数肘部 SSE 与轮廓系数双轴判定',
      badge: '最优 K=3 (S=0.58)',
      body: legendChips([{ label: '组内误差 SSE (左)', color: ink.secondary, kind: 'line' }, { label: '轮廓系数 S (右)', color: ink.primary, kind: 'line' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: 'SSE 畸变度' }, ink)
        + `<line x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${ink.primary}" stroke-width="0.9"/>`
        + [0.3, 0.4, 0.5, 0.6].map(v => txt(x1 + 4, ySil(v) + 2.5, v.toFixed(1), { size: 6.9, fill: ink.primary })).join('')
        + `<line x1="${f1(xTicks[1].pos)}" y1="${y0}" x2="${f1(xTicks[1].pos)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<polyline points="${polyStr(ssePts)}" stroke="${ink.secondary}" stroke-width="1.8" stroke-dasharray="4 2"/>`
        + `<polyline points="${polyStr(silPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + silPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i === 1 ? 4.5 : 3}" fill="${i === 1 ? ink.opposite : ink.primary}"/>`).join('')
        + txt(xTicks[1].pos + 6, silPts[1][1] - 4, '拐点 K=3 (0.58)', { size: 7.1, weight: 700, fill: ink.opposite }),
    };
  },

  lca_profile: (ink: ResolvedInk) => {
    const inds = ['高频使用', '付费意愿', '深度功能', '社区互动', '隐私顾虑'];
    const classes = [
      { lbl: 'C1 核心付费 (38%)', c: ink.primary, vals: [0.88, 0.82, 0.79, 0.68, 0.34] },
      { lbl: 'C2 潜力观望 (41%)', c: ink.secondary, vals: [0.54, 0.42, 0.62, 0.48, 0.56] },
      { lbl: 'C3 审慎低频 (21%)', c: ink.opposite, vals: [0.18, 0.14, 0.24, 0.16, 0.84] },
    ];
    const x0 = 46, y0 = 48, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - v * (y1 - y0);
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const xTicks = evenlySpacedTicks(x0 + 22, x1 - 22, inds);
    const lines = classes.map(cl => {
      const pts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(cl.vals[i])]);
      return `<polyline points="${polyStr(pts)}" stroke="${cl.c}" stroke-width="2"/>`
        + pts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.4" fill="${cl.c}" stroke="${ink.surface}" stroke-width="0.9"/>`).join('');
    }).join('');
    return {
      title: '潜在类别分析 (LCA) 条件响应概率剖面',
      badge: 'Entropy=0.86 · 3类',
      body: legendChips(classes.map(c => ({ label: c.lbl, color: c.c, kind: 'line' })), 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '条件响应概率 P' }, ink)
        + lines,
    };
  },

  ipa: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [2.5, 3.0, 3.5, 4.0, 4.5].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v.toFixed(1) }));
    const yTicks = [2.5, 3.0, 3.5, 4.0, 4.5].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(1) }));
    const xm = x0 + 0.52 * (x1 - x0), ym = y1 - 0.55 * (y1 - y0);
    const items: [string, number, number, string][] = [
      ['A1 响应快', 292, 66, ink.primary],
      ['A2 信任高', 258, 82, ink.primary],
      ['A3 价格透', 124, 64, ink.opposite],
      ['A4 客服弱', 142, 88, ink.opposite],
      ['A5 引导清', 252, 146, ink.secondary],
      ['A6 社区活', 112, 158, ink.muted],
    ];
    return {
      title: 'IPA 重要性—满意度四象限改进图',
      badge: '均值十字准星 (3.5,3.6)',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '重要性均分 (I)', xTitle: '满意度表现 (P)' }, ink)
        + `<rect x="${x0}" y="${y0}" width="${f1(xm - x0)}" height="${f1(ym - y0)}" fill="${ink.opposite}" fill-opacity="0.07"/>`
        + `<rect x="${f1(xm)}" y="${y0}" width="${f1(x1 - xm)}" height="${f1(ym - y0)}" fill="${ink.primary}" fill-opacity="0.07"/>`
        + `<line x1="${f1(xm)}" y1="${y0}" x2="${f1(xm)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + `<line x1="${x0}" y1="${f1(ym)}" x2="${x1}" y2="${f1(ym)}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2.5"/>`
        + txt(x0 + 6, y0 + 11, '重点改进区 (高I低P)', { size: 6.9, weight: 700, fill: ink.opposite })
        + txt(x1 - 6, y0 + 11, '继续保持区 (高I高P)', { size: 6.9, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x0 + 6, y1 - 6, '低优先级区', { size: 6.8, fill: ink.muted })
        + txt(x1 - 6, y1 - 6, '过度供给区', { size: 6.8, fill: ink.secondary, anchor: 'end' })
        + items.map(([lbl, x, y, c]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="${c}" stroke="${ink.surface}" stroke-width="1"/>`
          + txt(x + 6, y + 2.5, lbl, { size: 7, weight: 600, fill: c })).join(''),
    };
  },

  kano: (ink: ResolvedInk) => {
    const x0 = 48, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [0, 0.25, 0.5, 0.75, 1.0].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: v.toFixed(2) }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: v.toFixed(2) }));
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const pts: [string, number, number, string][] = [
      ['F1 一键直达', 278, 62, ink.primary],
      ['F2 透明账单', 256, 86, ink.primary],
      ['F3 智能推荐', 118, 68, ink.secondary],
      ['F4 极简退订', 268, 152, ink.opposite],
      ['F5 脱敏核验环境', 238, 166, ink.opposite],
      ['F6 节日皮肤', 102, 162, ink.muted],
    ];
    return {
      title: 'Kano 模型 Better—Worse 需求定位',
      badge: '正反向配对 · n=480',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: 'Better 满意系数 (SI)', xTitle: '|Worse| 不满意系数 (|DSI|)' }, ink)
        + `<line x1="${xm}" y1="${y0}" x2="${xm}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${ym}" x2="${x1}" y2="${ym}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + txt(x0 + 6, y0 + 11, '魅力属性 (A)', { size: 7, weight: 700, fill: ink.secondary })
        + txt(x1 - 6, y0 + 11, '期望属性 (O)', { size: 7, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x0 + 6, y1 - 6, '无差异属性 (I)', { size: 7, fill: ink.muted })
        + txt(x1 - 6, y1 - 6, '必备属性 (M)', { size: 7, weight: 700, fill: ink.opposite, anchor: 'end' })
        + pts.map(([lbl, x, y, c]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="${c}" stroke="${ink.surface}" stroke-width="1"/>`
          + txt(x - 6, y - 5, lbl, { size: 6.9, weight: 600, fill: c, anchor: 'middle' })).join(''),
    };
  },

  kano_better_worse_scatter: (ink: ResolvedInk) => {
    const x0 = 48, y0 = 46, x1 = 336, y1 = 192;
    const xMap = (v: number) => x0 + v * (x1 - x0);
    const yMap = (v: number) => y1 - v * (y1 - y0);
    const xTicks = [0, 0.25, 0.5, 0.75, 1.0].map(v => ({ pos: xMap(v), label: v.toFixed(2) }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const xm = xMap(0.5), ym = yMap(0.5);
    const arcPts = (rad: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const th = (i / 24) * (Math.PI / 2);
        const xv = rad * Math.cos(th), yv = rad * Math.sin(th);
        if (xv <= 1.0 && yv <= 1.0) pts.push([xMap(xv), yMap(yv)]);
      }
      return pts;
    };
    const items: { lbl: string; x: number; y: number; r: number; c: string; dx: number; dy: number; anc: 'start' | 'middle' | 'end' }[] = [
      { lbl: '一键预约', x: 0.78, y: 0.84, r: 5.2, c: ink.primary, dx: -7, dy: 2.5, anc: 'end' },
      { lbl: '透明账单', x: 0.66, y: 0.64, r: 4.5, c: ink.primary, dx: 7, dy: 2.5, anc: 'start' },
      { lbl: '智能导诊', x: 0.24, y: 0.82, r: 4.8, c: ink.secondary, dx: 7, dy: 2.5, anc: 'start' },
      { lbl: '适老语音', x: 0.36, y: 0.66, r: 4.0, c: ink.secondary, dx: -7, dy: 2.5, anc: 'end' },
      { lbl: '隐私脱敏', x: 0.84, y: 0.34, r: 5.0, c: ink.opposite, dx: -7, dy: 2.5, anc: 'end' },
      { lbl: '极简退订', x: 0.65, y: 0.24, r: 4.2, c: ink.opposite, dx: 7, dy: 2.5, anc: 'start' },
      { lbl: '节日换肤', x: 0.18, y: 0.20, r: 3.3, c: ink.muted, dx: 6, dy: 2.5, anc: 'start' },
      { lbl: '徽章积分', x: 0.36, y: 0.36, r: 3.6, c: ink.muted, dx: -6, dy: -6, anc: 'middle' },
    ];
    return {
      title: 'Kano Better—Worse 四象限属性散点',
      badge: '敏感弧优先级 · n=520',
      body: `<rect x="${x0}" y="${y0}" width="${f1(xm - x0)}" height="${f1(ym - y0)}" fill="${ink.secondary}" fill-opacity="0.06"/>`
        + `<rect x="${f1(xm)}" y="${y0}" width="${f1(x1 - xm)}" height="${f1(ym - y0)}" fill="${ink.primary}" fill-opacity="0.07"/>`
        + `<rect x="${f1(xm)}" y="${f1(ym)}" width="${f1(x1 - xm)}" height="${f1(y1 - ym)}" fill="${ink.opposite}" fill-opacity="0.07"/>`
        + `<rect x="${x0}" y="${f1(ym)}" width="${f1(xm - x0)}" height="${f1(y1 - ym)}" fill="${ink.grid}" fill-opacity="0.18"/>`
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: 'Better 满意系数 (SI)', xTitle: '|Worse| 不满意系数 (|DSI|, 气泡面积=提及频次)' }, ink)
        + `<polyline points="${polyStr(arcPts(0.55))}" stroke="${ink.lightMuted}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<polyline points="${polyStr(arcPts(0.85))}" stroke="${ink.lightMuted}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(xm)}" y1="${y0}" x2="${f1(xm)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${f1(ym)}" x2="${x1}" y2="${f1(ym)}" stroke="${ink.axis}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + txt(x0 + 5, y0 + 11, '魅力属性 (A)', { size: 6.9, weight: 700, fill: ink.secondary })
        + txt(x1 - 5, y0 + 11, '期望属性 (O)', { size: 6.9, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x0 + 5, y1 - 5, '无差异属性 (I)', { size: 6.9, fill: ink.muted })
        + txt(x1 - 5, y1 - 5, '必备属性 (M)', { size: 6.9, weight: 700, fill: ink.opposite, anchor: 'end' })
        + items.map(it => {
          const cx = xMap(it.x), cy = yMap(it.y);
          return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${it.r}" fill="${it.c}" fill-opacity="0.78" stroke="${ink.surface}" stroke-width="1"/>`
            + txt(cx + it.dx, cy + it.dy, it.lbl, { size: 6.7, weight: 700, fill: it.c, anchor: it.anc });
        }).join(''),
    };
  },

  conjoint_partworth: (ink: ResolvedInk) => {
    const levels = [
      ['价格 · ¥19/月', 0.62, ink.primary],
      ['价格 · ¥39/月', 0.08, ink.primary],
      ['价格 · ¥59/月', -0.70, ink.opposite],
      ['售后 · 7天无忧', -0.34, ink.opposite],
      ['售后 · 30天保退', 0.34, ink.secondary],
      ['配送 · 当日达', 0.28, ink.accent4],
    ] as const;
    const x0 = 84, y0 = 44, x1 = 248, y1 = 192;
    const xMap = (v: number) => x0 + ((v + 0.8) / 1.6) * (x1 - x0);
    const xTicks = [-0.6, 0, 0.6].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const rowH = (y1 - y0) / levels.length;
    const xZ = xMap(0);
    const bars = levels.map(([lbl, u, c], i) => {
      const cy = y0 + (i + 0.5) * rowH, xu = xMap(u);
      const rx = Math.min(xZ, xu), rw = Math.abs(xu - xZ);
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7, fill: ink.text, anchor: 'end' })
        + `<rect x="${f1(rx)}" y="${f1(cy - 6)}" width="${f1(rw)}" height="12" rx="1.8" fill="${c}" fill-opacity="0.78"/>`
        + txt(u >= 0 ? xu + 3 : xu - 3, cy + 2.4, `${u >= 0 ? '+' : ''}${u.toFixed(2)}`, { size: 6.7, weight: 700, fill: c, anchor: u >= 0 ? 'start' : 'end' });
    }).join('');
    const imp = [['价格档位', 48, ink.primary], ['售后保障', 29, ink.secondary], ['履约时效', 23, ink.accent4]] as const;
    const impBars = imp.map(([lbl, w, c], i) => {
      const y = 66 + i * 38;
      return txt(264, y, `${lbl} ${w}%`, { size: 7.1, weight: 600, fill: ink.text })
        + `<rect x="264" y="${y + 4}" width="${f1(w * 1.4)}" height="10" rx="2" fill="${c}" fill-opacity="0.82"/>`;
    }).join('');
    return {
      title: '联合分析属性效用与相对重要性',
      badge: 'CBC · n=420 · RLH=0.68',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '分部效用 Part-worth' }, ink)
        + `<line x1="${f1(xZ)}" y1="${y0}" x2="${f1(xZ)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1"/>`
        + bars
        + txt(264, 46, '属性相对重要性', { size: 7.4, weight: 700, fill: ink.axis })
        + impBars,
    };
  },

  dea_frontier: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [20, 40, 60, 80, 100].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `${v}` }));
    const yTicks = [20, 40, 60, 80, 100].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: `${v}` }));
    const eff: [string, number, number][] = [['D1(1.0)', 78, 134], ['D3(1.0)', 132, 78], ['D5(1.0)', 234, 58]];
    const ineff: [string, number, number, number, number][] = [
      ['D2(0.74)', 168, 126, 122, 92],
      ['D4(0.81)', 224, 106, 182, 68],
      ['D6(0.68)', 266, 144, 186, 68],
    ];
    return {
      title: 'DEA 数据包络分析技术效率前沿图',
      badge: 'CCR 效率 · 3个有效DMU',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '服务产出指数', xTitle: '资源投入成本指数' }, ink)
        + `<polygon points="${x0},${y1} 78,134 132,78 234,58 ${x1},58 ${x1},${y1}" fill="${ink.primary}" fill-opacity="0.06"/>`
        + `<polyline points="78,134 132,78 234,58 ${x1},58" stroke="${ink.primary}" stroke-width="2.1"/>`
        + ineff.map(([lbl, x, y, tx, ty]) =>
          `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
          + arrowPoly(tx + 2, ty + 2, -135, 5, ink.opposite)
          + `<circle cx="${x}" cy="${y}" r="3.6" fill="${ink.opposite}"/>`
          + txt(x + 6, y + 3, lbl, { size: 6.8, fill: ink.opposite })).join('')
        + eff.map(([lbl, x, y]) =>
          `<circle cx="${x}" cy="${y}" r="4.5" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="1.2"/>`
          + txt(x - 4, y - 7, lbl, { size: 7, weight: 700, fill: ink.primary, anchor: 'middle' })).join(''),
    };
  },

  tornado_sens: (ink: ResolvedInk) => {
    const items = [
      ['获客单位成本', -28, 26],
      ['客单价定价', -21, 24],
      ['核心复购率', -18, 19],
      ['首月留存率', -12, 14],
      ['渠道补贴率', -9, 8],
      ['运维人工费', -5, 6],
    ] as const;
    const x0 = 84, y0 = 48, x1 = 336, y1 = 192;
    const mid = (x0 + x1) / 2;
    const scale = 3.8;
    const xTicks = [-30, -15, 0, 15, 30].map(v => ({ pos: mid + v * scale, label: `${v > 0 ? '+' : ''}${v}%` }));
    const rowH = (y1 - y0) / items.length;
    const bars = items.map(([lbl, lo, hi], i) => {
      const cy = y0 + (i + 0.5) * rowH, lw = Math.abs(lo) * scale, rw = hi * scale;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.2, fill: ink.text, anchor: 'end' })
        + `<rect x="${f1(mid - lw)}" y="${f1(cy - 6)}" width="${f1(lw)}" height="12" rx="1.5" fill="${ink.opposite}" fill-opacity="0.78"/>`
        + `<rect x="${f1(mid)}" y="${f1(cy - 6)}" width="${f1(rw)}" height="12" rx="1.5" fill="${ink.primary}" fill-opacity="0.82"/>`
        + txt(mid - lw - 3, cy + 2.4, `${lo}%`, { size: 6.6, weight: 600, fill: ink.opposite, anchor: 'end' })
        + txt(mid + rw + 3, cy + 2.4, `+${hi}%`, { size: 6.6, weight: 600, fill: ink.primary });
    }).join('');
    return {
      title: '商业测算净收益敏感性龙卷风图',
      badge: '基准 NPV=100万',
      body: legendChips([{ label: '悲观情景 (-20%参数)', color: ink.opposite, kind: 'box' }, { label: '乐观情景 (+20%参数)', color: ink.primary, kind: 'box' }], 84, 40, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '净现值相对基准波动幅度 (%)' }, ink)
        + `<line x1="${f1(mid)}" y1="${y0}" x2="${f1(mid)}" y2="${y1}" stroke="${ink.axis}" stroke-width="1.2"/>`
        + bars,
    };
  },

  monte_carlo_var: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const xTicks = [-10, 0, 10, 20, 30, 40].map((v, i) => ({ pos: x0 + (i / 5) * (x1 - x0), label: `${v}万` }));
    const yTicks = [0, 0.03, 0.06, 0.09].map((v, i) => ({ pos: y1 - (i / 3) * (y1 - y0), label: v.toFixed(2) }));
    const bins = [4, 10, 22, 42, 68, 94, 114, 118, 102, 76, 48, 26, 12, 5];
    const bw = (x1 - x0) / bins.length;
    const xZero = xTicks[1].pos, xMean = xTicks[3].pos - 8;
    const bars = bins.map((h, i) => {
      const bx = x0 + i * bw, isTail = i < 2;
      return `<rect x="${f1(bx + 1)}" y="${f1(y1 - h)}" width="${f1(bw - 2)}" height="${h}" fill="${isTail ? ink.opposite : ink.primary}" fill-opacity="${isTail ? 0.65 : 0.34}" stroke="${isTail ? ink.opposite : ink.primary}" stroke-width="0.7"/>`;
    }).join('');
    const curvePts: [number, number][] = bins.map((h, i) => [x0 + (i + 0.5) * bw, y1 - h - 2]);
    return {
      title: '蒙特卡洛预期净收益与 VaR 风险分布',
      badge: '10,000次 · VaR5%=-4.2万',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '概率密度', xTitle: '模拟年化净收益 (万元)' }, ink)
        + bars
        + `<path d="${smoothCurvePath(curvePts)}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + `<line x1="${f1(xZero)}" y1="${y0}" x2="${f1(xZero)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3 2"/>`
        + txt(xZero - 3, y0 + 12, '盈亏平衡 0', { size: 6.7, weight: 700, fill: ink.opposite, anchor: 'end' })
        + `<line x1="${f1(xMean)}" y1="${y0}" x2="${f1(xMean)}" y2="${y1}" stroke="${ink.secondary}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(xMean + 4, y0 + 12, '期望值 +18.6万', { size: 6.9, weight: 700, fill: ink.secondary }),
    };
  },

  violin_corr_composite: (ink: ResolvedInk) => {
    // Left subpanel: 3 violins; Right subpanel: 4x4 correlation matrix
    const xL0 = 38, xL1 = 176, y0 = 48, y1 = 190;
    const cats = ['C1', 'C2', 'C3'];
    const yTicks = [1, 3, 5].map((v, i) => ({ pos: y1 - (i / 2) * (y1 - y0), label: `${v}.0` }));
    const xTicks = cats.map((lbl, i) => ({ pos: xL0 + 24 + i * 44, label: lbl }));
    const vs = [[78, ink.primary], [108, ink.secondary], [142, ink.opposite]] as const;
    const violins = vs.map(([med, c], i) => {
      const cx = xTicks[i].pos, w = 13;
      const d = `M ${cx} ${med - 30} C ${cx + w} ${med - 14}, ${cx + w} ${med + 14}, ${cx} ${med + 30} C ${cx - w} ${med + 14}, ${cx - w} ${med - 14}, ${cx} ${med - 30} Z`;
      return `<path d="${d}" fill="${c}" fill-opacity="0.32" stroke="${c}" stroke-width="1.3"/><circle cx="${cx}" cy="${med}" r="2.5" fill="${c}"/>`;
    }).join('');
    const mat = [[1, 0.62, 0.54, -0.36], [0.62, 1, 0.68, -0.42], [0.54, 0.68, 1, -0.29], [-0.36, -0.42, -0.29, 1]];
    const mVars = ['效用', '信任', '满意', '风险'];
    const mx0 = 216, my0 = 56, cs = 30;
    let grid = '';
    for (let r = 0; r < 4; r++) {
      grid += txt(mx0 - 4, my0 + r * cs + 17, mVars[r], { size: 6.7, fill: ink.text, anchor: 'end' });
      grid += txt(mx0 + r * cs + 14, my0 + 4 * cs + 10, mVars[r], { size: 6.7, fill: ink.text, anchor: 'middle' });
      for (let c = 0; c < 4; c++) {
        const v = mat[r][c], fill = v >= 0 ? ink.primary : ink.opposite, op = r === c ? 0.14 : Math.abs(v) * 0.8;
        grid += `<rect x="${mx0 + c * cs}" y="${my0 + r * cs}" width="${cs - 2}" height="${cs - 2}" rx="2" fill="${r === c ? ink.grid : fill}" fill-opacity="${f2(op)}"/>`
          + txt(mx0 + c * cs + 14, my0 + r * cs + 17, v.toFixed(2), { size: 6.4, weight: 700, fill: op > 0.5 ? '#FFFFFF' : ink.text, anchor: 'middle' });
      }
    }
    return {
      title: '分群特征小提琴 × 构念相关复合展图',
      badge: '双联机制图 · n=506',
      body: txt(108, 41, 'A. 分群得分密度对照', { size: 7.3, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(274, 41, 'B. 构念相关矩阵', { size: 7.3, weight: 700, fill: ink.secondary, anchor: 'middle' })
        + axesFrame({ x0: xL0, y0, x1: xL1, y1, yTicks, xTicks }, ink)
        + violins + grid,
    };
  },

  ahp_hierarchy: (ink: ResolvedInk) => {
    const goal = `<rect x="128" y="42" width="104" height="22" rx="4" fill="${ink.primary}" stroke="${ink.primary}"/>`
      + txt(180, 56, '方案综合优选目标 (A)', { size: 7.4, weight: 700, fill: '#FFFFFF', anchor: 'middle' });
    const crit = [
      ['经济效益 (0.45)', 66, ink.primary],
      ['实施可行 (0.33)', 180, ink.secondary],
      ['风险可控 (0.22)', 294, ink.opposite],
    ] as const;
    const critSvg = crit.map(([lbl, cx, c]) =>
      `<line x1="180" y1="64" x2="${cx}" y2="86" stroke="${ink.axis}" stroke-width="1"/>`
      + `<rect x="${cx - 46}" y="86" width="92" height="22" rx="3.5" fill="${lightenHex(c, 0.78)}" stroke="${c}" stroke-width="1.2"/>`
      + txt(cx, 100, lbl, { size: 7.1, weight: 700, fill: darkenHex(c, 0.2), anchor: 'middle' }),
    ).join('');
    const inds = [
      ['C1 转化增量', 0.27, ink.primary],
      ['C2 长期留存', 0.18, ink.primary],
      ['C3 改造成本', 0.21, ink.secondary],
      ['C4 试点周期', 0.12, ink.secondary],
      ['C5 隐私合规', 0.22, ink.opposite],
    ] as const;
    const bars = inds.map(([lbl, w, c], i) => {
      const y = 122 + i * 16;
      return txt(102, y + 8.5, lbl, { size: 7, fill: ink.text, anchor: 'end' })
        + `<rect x="108" y="${y}" width="${f1(w * 480)}" height="10" rx="2" fill="${c}" fill-opacity="0.82"/>`
        + txt(108 + w * 480 + 5, y + 8, `${(w * 100).toFixed(0)}%`, { size: 6.9, weight: 700, fill: c });
    }).join('');
    return {
      title: 'AHP 层次分析权重分解与一致性校验',
      badge: 'λmax=3.04 · CR=0.032',
      body: goal + critSvg + bars
        + pill(340, 186, 'CR = 0.032 < 0.10 (一致性通过)', { bg: ink.primarySoft, stroke: ink.primary, color: ink.primary, size: 7, h: 14, align: 'right' }),
    };
  },

  topsis_distance: (ink: ResolvedInk) => {
    const plans = [
      ['方案 A · 精准补贴', 0.78, 0.21, 0.74],
      ['方案 B · 流程重构', 0.64, 0.34, 0.61],
      ['方案 C · 渠道下沉', 0.51, 0.45, 0.47],
      ['方案 D · 维持现状', 0.28, 0.68, 0.26],
    ] as const;
    const x0 = 96, y0 = 48, x1 = 336, y1 = 192;
    const xTicks = [0, 0.25, 0.5, 0.75, 1.0].map(v => ({ pos: x0 + v * (x1 - x0), label: v.toFixed(2) }));
    const rowH = (y1 - y0) / plans.length;
    const rows = plans.map(([lbl, ci, dp, dm], i) => {
      const cy = y0 + (i + 0.5) * rowH, w = ci * (x1 - x0);
      const col = i === 0 ? ink.primary : i === 1 ? ink.secondary : ink.muted;
      return txt(x0 - 6, cy + 2.5, lbl, { size: 7.2, weight: i === 0 ? 700 : 500, fill: ink.text, anchor: 'end' })
        + `<rect x="${x0}" y="${f1(cy - 7.5)}" width="${f1(w)}" height="15" rx="2.5" fill="${col}" fill-opacity="${i === 0 ? 0.88 : 0.58}"/>`
        + txt(x0 + w + 5, cy + 2.5, `Ci=${ci.toFixed(2)} (D+=${dp}, D-=${dm})`, { size: 6.8, weight: 700, fill: col });
    }).join('');
    return {
      title: '熵权 TOPSIS 备选方案贴近度排序',
      badge: '最优推荐: 方案 A',
      body: axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '相对理想解贴近度 Ci = D- / (D+ + D-)' }, ink) + rows,
    };
  },

  pareto_parallel: (ink: ResolvedInk) => {
    const axes = [
      { lbl: '投入成本↓', hi: '12万', lo: '48万' },
      { lbl: '碳排强度↓', hi: '0.2t', lo: '0.9t' },
      { lbl: '服务覆盖↑', hi: '96%', lo: '64%' },
      { lbl: '受众满意↑', hi: '4.6分', lo: '3.0分' },
      { lbl: '区域公平↑', hi: '0.92', lo: '0.58' },
    ];
    const xs = axes.map((_, i) => 54 + i * 63);
    const y0 = 56, y1 = 186;
    const yMap = (score01: number) => y1 - score01 * (y1 - y0);
    const dominated: number[][] = [
      [0.24, 0.32, 0.28, 0.42, 0.30],
      [0.36, 0.22, 0.44, 0.35, 0.26],
      [0.18, 0.46, 0.38, 0.28, 0.44],
      [0.48, 0.34, 0.24, 0.46, 0.38],
      [0.30, 0.50, 0.40, 0.32, 0.34],
    ];
    const pareto: number[][] = [
      [0.92, 0.84, 0.48, 0.54, 0.52],
      [0.46, 0.54, 0.94, 0.86, 0.62],
      [0.62, 0.72, 0.68, 0.92, 0.88],
      [0.84, 0.64, 0.62, 0.68, 0.74],
    ];
    const knee = [0.78, 0.82, 0.84, 0.80, 0.82];
    const axisSvg = axes.map((a, i) => {
      const x = xs[i];
      return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${ink.axis}" stroke-width="1"/>`
        + txt(x, y0 - 4, a.hi, { size: 6.4, weight: 600, fill: ink.primary, anchor: 'middle' })
        + txt(x, y1 + 10, a.lo, { size: 6.4, fill: ink.muted, anchor: 'middle' })
        + txt(x, y1 + 21, a.lbl, { size: 7.1, weight: 700, fill: ink.text, anchor: 'middle' });
    }).join('');
    const linePts = (vals: readonly number[]) => vals.map((v, i) => [xs[i], yMap(v)] as [number, number]);
    return {
      title: 'NSGA-II 多目标平行坐标前沿解集',
      badge: '16前沿解 · 膝点 S*',
      body: legendChips([{ label: '折衷膝点 S*', color: ink.opposite, kind: 'line' }, { label: 'Pareto 前沿', color: ink.primary, kind: 'line' }, { label: '被支配解', color: ink.lightMuted, kind: 'line' }], 44, 39, ink)
        + dominated.map(row => `<polyline points="${polyStr(linePts(row))}" stroke="${ink.lightMuted}" stroke-width="1" stroke-opacity="0.52"/>`).join('')
        + pareto.map(row => `<polyline points="${polyStr(linePts(row))}" stroke="${ink.primary}" stroke-width="1.45" stroke-opacity="0.72"/>`).join('')
        + `<polyline points="${polyStr(linePts(knee))}" stroke="${ink.opposite}" stroke-width="2.4"/>`
        + linePts(knee).map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.4" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`).join('')
        + axisSvg,
    };
  },

  latent_growth_trajectory: (ink: ResolvedInk) => {
    const waves = ['T1 基线', 'T2 (3月)', 'T3 (6月)', 'T4 (12月)'];
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xTicks = evenlySpacedTicks(x0 + 26, x1 - 36, waves);
    const yMap = (v: number) => y1 - ((v - 1.5) / 3.3) * (y1 - y0);
    const yTicks = [1.5, 2.5, 3.5, 4.5].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const classes = [
      { lbl: 'C1 稳步提升 (44%)', c: ink.primary, vals: [2.82, 3.38, 3.94, 4.38], ci: 0.16 },
      { lbl: 'C2 高开回落 (32%)', c: ink.opposite, vals: [4.12, 3.86, 3.34, 2.96], ci: 0.18 },
      { lbl: 'C3 持续低迷 (24%)', c: ink.secondary, vals: [2.24, 2.18, 2.12, 2.14], ci: 0.17 },
    ] as const;
    const curves = classes.map(cl => {
      const pts: [number, number][] = cl.vals.map((v, i) => [xTicks[i].pos, yMap(v)]);
      const topPts: [number, number][] = cl.vals.map((v, i) => [xTicks[i].pos, yMap(v + cl.ci)]);
      const botPts: [number, number][] = cl.vals.map((v, i) => [xTicks[i].pos, yMap(v - cl.ci)]);
      const last = pts[pts.length - 1];
      const lastV = cl.vals[cl.vals.length - 1];
      return bandPolygon(topPts, botPts, cl.c, 0.14)
        + `<path d="${smoothCurvePath(pts)}" stroke="${cl.c}" stroke-width="2.2"/>`
        + pts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.2" fill="${cl.c}" stroke="${ink.surface}" stroke-width="0.9"/>`).join('')
        + txt(last[0] + 6, last[1] + 2.5, lastV.toFixed(2), { size: 6.9, weight: 700, fill: cl.c, anchor: 'start' });
    }).join('');
    return {
      title: '潜变量增长混合模型 (LGMM) 轨迹',
      badge: 'Entropy=0.84 · 3类潜轨',
      body: legendChips(classes.map(c => ({ label: c.lbl, color: c.c, kind: 'line' })), 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '潜变量构念均分 (1–5分)', xTitle: '纵向多波次追踪节点 (T1 → T4)' }, ink)
        + curves,
    };
  },

  network_bridge_ei: (ink: ResolvedInk) => {
    const nodes = [
      { id: 'A1', lbl: '效能', x: 38, y: 80, comm: 1, bridge: false },
      { id: 'A2', lbl: '信任', x: 86, y: 80, comm: 1, bridge: true },
      { id: 'A3', lbl: '便利', x: 60, y: 114, comm: 1, bridge: false },
      { id: 'B1', lbl: '顾虑', x: 102, y: 142, comm: 2, bridge: true },
      { id: 'B2', lbl: '摩擦', x: 146, y: 144, comm: 2, bridge: false },
      { id: 'B3', lbl: '倦怠', x: 124, y: 176, comm: 2, bridge: false },
    ] as const;
    const edges: [number, number, number, boolean, boolean][] = [
      [0, 1, 1.5, true, false], [0, 2, 1.3, true, false], [1, 2, 1.6, true, false],
      [3, 4, 1.6, true, false], [3, 5, 1.4, true, false], [4, 5, 1.5, true, false],
      [1, 3, 2.8, false, true], [2, 3, 2.2, true, true], [1, 4, 1.9, false, true],
    ];
    const ranking = [
      ['A2 信任', 1.68, true],
      ['B1 顾虑', 1.24, true],
      ['A3 便利', 0.36, false],
      ['B2 摩擦', -0.42, false],
      ['A1 效能', -0.94, false],
      ['B3 倦怠', -1.32, false],
    ] as const;
    const rx0 = 228, ry0 = 50, rx1 = 346, ry1 = 192;
    const rxMap = (z: number) => rx0 + ((z + 2.25) / 4.7) * (rx1 - rx0);
    const rxTicks = [-1, 0, 1, 2].map(v => ({ pos: rxMap(v), label: String(v) }));
    const rowH = (ry1 - ry0) / ranking.length;
    const xZero = rxMap(0), xThresh = rxMap(1.0);
    return {
      title: '心理网络桥接预期影响 (Bridge EI)',
      badge: 'Bridge CS=0.59 · 2群落',
      body: legendChips([
        { label: '正向桥边', color: ink.primary, kind: 'line' },
        { label: '负向桥边', color: ink.opposite, kind: 'dash' },
        { label: '关键桥节点', color: ink.opposite, kind: 'dot' },
      ], 16, 39, ink)
        + `<ellipse cx="61" cy="94" rx="43" ry="34" fill="${ink.primary}" fill-opacity="0.08" stroke="${ink.primary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<ellipse cx="124" cy="156" rx="43" ry="34" fill="${ink.secondary}" fill-opacity="0.08" stroke="${ink.secondary}" stroke-width="1" stroke-dasharray="3 2"/>`
        + txt(30, 68, 'C1 认知群', { size: 6.4, weight: 700, fill: ink.primary })
        + txt(138, 186, 'C2 阻滞群', { size: 6.4, weight: 700, fill: ink.secondary, anchor: 'middle' })
        + edges.map(([i, j, w, pos, isBridge]) => {
          const col = isBridge ? (pos ? ink.primary : ink.opposite) : ink.lightMuted;
          return `<line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[j].x}" y2="${nodes[j].y}" stroke="${col}" stroke-width="${w}" stroke-opacity="${isBridge ? 0.8 : 0.45}"${pos ? '' : ' stroke-dasharray="3 2"'}/>`;
        }).join('')
        + nodes.map(n => {
          const baseCol = n.comm === 1 ? ink.primary : ink.secondary;
          const halo = n.bridge ? `<circle cx="${n.x}" cy="${n.y}" r="14.5" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="2.5 1.5"/>` : '';
          return halo
            + `<circle cx="${n.x}" cy="${n.y}" r="11.5" fill="${ink.surface}" stroke="${baseCol}" stroke-width="1.8"/>`
            + txt(n.x, n.y + 2.4, n.lbl, { size: 6.5, weight: 700, fill: ink.text, anchor: 'middle' });
        }).join('')
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, xTicks: rxTicks, vGrid: true, hGrid: false, box: true, xTitle: 'Bridge EI (z-score)' }, ink)
        + `<line x1="${f1(xZero)}" y1="${ry0}" x2="${f1(xZero)}" y2="${ry1}" stroke="${ink.axis}" stroke-width="0.95"/>`
        + `<line x1="${f1(xThresh)}" y1="${ry0}" x2="${f1(xThresh)}" y2="${ry1}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + ranking.map(([lbl, z, hi], i) => {
          const cy = ry0 + (i + 0.5) * rowH, xz = rxMap(z);
          const col = hi ? ink.opposite : z >= 0 ? ink.primary : ink.secondary;
          return txt(rx0 - 4, cy + 2.4, lbl, { size: 6.7, weight: hi ? 700 : 500, fill: ink.text, anchor: 'end' })
            + `<line x1="${f1(xZero)}" y1="${f1(cy)}" x2="${f1(xz)}" y2="${f1(cy)}" stroke="${col}" stroke-width="1.8"/>`
            + `<circle cx="${f1(xz)}" cy="${f1(cy)}" r="${hi ? 3.8 : 3.0}" fill="${col}" stroke="${ink.surface}" stroke-width="0.8"/>`
            + txt(z >= 0 ? xz + 5 : xz - 5, cy + 2.3, `${z >= 0 ? '+' : ''}${z.toFixed(2)}`, { size: 6.3, weight: 700, fill: col, anchor: z >= 0 ? 'start' : 'end' });
        }).join(''),
    };
  },

  topsis_closeness_rank: (ink: ResolvedInk) => {
    const units = [
      { lbl: '#1 余杭区', dp: 0.08, dm: 0.43, ci: 0.842 },
      { lbl: '#2 工业园', dp: 0.12, dm: 0.39, ci: 0.764 },
      { lbl: '#3 高新区', dp: 0.16, dm: 0.35, ci: 0.685 },
      { lbl: '#4 滨海区', dp: 0.22, dm: 0.29, ci: 0.572 },
      { lbl: '#5 经开区', dp: 0.28, dm: 0.23, ci: 0.448 },
      { lbl: '#6 生态县', dp: 0.35, dm: 0.16, ci: 0.316 },
    ] as const;
    const lx0 = 66, ly0 = 48, lx1 = 198, ly1 = 192;
    const rx0 = 216, ry0 = 48, rx1 = 342, ry1 = 192;
    const dMap = (v: number) => lx0 + (v / 0.50) * (lx1 - lx0);
    const cMap = (v: number) => rx0 + (v / 1.05) * (rx1 - rx0);
    const lxTicks = [0.0, 0.2, 0.4].map(v => ({ pos: dMap(v), label: v.toFixed(1) }));
    const rxTicks = [0.0, 0.5, 1.0].map(v => ({ pos: cMap(v), label: v.toFixed(1) }));
    const rowH = (ly1 - ly0) / units.length;
    const rows = units.map((u, i) => {
      const cy = ly0 + (i + 0.5) * rowH;
      const xDp = dMap(u.dp), xDm = dMap(u.dm), xCi = cMap(u.ci);
      const col = u.ci >= 0.65 ? ink.primary : u.ci >= 0.45 ? ink.secondary : ink.muted;
      return txt(lx0 - 5, cy + 2.4, u.lbl, { size: 6.9, weight: i < 2 ? 700 : 500, fill: ink.text, anchor: 'end' })
        + `<line x1="${f1(xDp)}" y1="${f1(cy)}" x2="${f1(xDm)}" y2="${f1(cy)}" stroke="${ink.grid}" stroke-width="1.3"/>`
        + `<rect x="${f1(xDp - 3)}" y="${f1(cy - 3)}" width="6" height="6" rx="1" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.7"/>`
        + `<circle cx="${f1(xDm)}" cy="${f1(cy)}" r="3.4" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="0.7"/>`
        + `<rect x="${rx0}" y="${f1(cy - 5.5)}" width="${f1(xCi - rx0)}" height="11" rx="2" fill="${col}" fill-opacity="0.78"/>`
        + txt(xCi + 3, cy + 2.4, u.ci.toFixed(3), { size: 6.4, weight: 700, fill: col });
    }).join('');
    return {
      title: '熵权 TOPSIS 评价对象贴近度 C_i 与位次',
      badge: '示范阈值 C_i≥0.65 · 3区达标',
      body: legendChips([
        { label: '正理想距 D+', color: ink.opposite, kind: 'box' },
        { label: '负理想距 D-', color: ink.primary, kind: 'dot' },
        { label: '贴近度 C_i = D-/(D++D-)', color: ink.secondary, kind: 'box' },
      ], 46, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, xTicks: lxTicks, vGrid: true, hGrid: false, box: true, xTitle: '理想解距 D+ / D-' }, ink)
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, xTicks: rxTicks, vGrid: true, hGrid: false, box: true, xTitle: '综合贴近度 C_i' }, ink)
        + `<line x1="${f1(cMap(0.65))}" y1="${ry0}" x2="${f1(cMap(0.65))}" y2="${ry1}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3 2"/>`
        + txt(cMap(0.65) - 3, ry1 - 4, '0.65', { size: 6.1, weight: 700, fill: ink.opposite, anchor: 'end' })
        + rows,
    };
  },

  ahp_consistency_radar: (ink: ResolvedInk) => {
    const cx = 104, cy = 122, maxR = 54;
    const dims = ['效能 0.34', '成本 0.26', '可达 0.18', '合规 0.13', '公益 0.09'];
    const expertW = [0.34, 0.26, 0.18, 0.13, 0.09];
    const surveyW = [0.29, 0.31, 0.20, 0.11, 0.09];
    const rMap = (w: number) => (w / 0.40) * maxR;
    const rings = [0.1, 0.2, 0.3, 0.4].map(lv => {
      const r = rMap(lv);
      const pts = dims.map((_, i) => polarXY(cx, cy, r, i * 72));
      return `<polygon points="${polyStr(pts)}" stroke="${ink.grid}" stroke-width="0.7"/>`;
    }).join('');
    const spokes = dims.map((lbl, i) => {
      const deg = i * 72;
      const [px, py] = polarXY(cx, cy, maxR, deg);
      const [lx, ly] = polarXY(cx, cy, maxR + 12, deg);
      const anc = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
      return `<line x1="${cx}" y1="${cy}" x2="${f1(px)}" y2="${f1(py)}" stroke="${ink.grid}" stroke-width="0.7"/>`
        + txt(lx, ly + 2.2, lbl, { size: 6.3, weight: 600, fill: ink.text, anchor: anc });
    }).join('');
    const polyE = expertW.map((w, i) => polarXY(cx, cy, rMap(w), i * 72));
    const polyS = surveyW.map((w, i) => polarXY(cx, cy, rMap(w), i * 72));

    const mat = [
      ['1', '2', '3', '4', '5'],
      ['1/2', '1', '2', '3', '4'],
      ['1/3', '1/2', '1', '2', '3'],
      ['1/4', '1/3', '1/2', '1', '2'],
      ['1/5', '1/4', '1/3', '1/2', '1'],
    ];
    const mx0 = 204, my0 = 54, cell = 22;
    let matSvg = `<rect x="196" y="46" width="150" height="154" rx="5" fill="${ink.surface}" fill-opacity="0.75" stroke="${ink.border}" stroke-width="0.9"/>`;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const valStr = mat[r][c];
        const isDiag = r === c;
        const isUpper = c > r;
        const col = isDiag ? ink.primary : isUpper ? ink.secondary : ink.muted;
        const op = isDiag ? 0.25 : isUpper ? 0.14 : 0.06;
        const x = mx0 + c * cell, y = my0 + r * cell;
        matSvg += `<rect x="${x}" y="${y}" width="${cell - 1.5}" height="${cell - 1.5}" rx="2" fill="${col}" fill-opacity="${op}" stroke="${ink.grid}" stroke-width="0.5"/>`
          + txt(x + cell / 2 - 0.7, y + cell / 2 + 2.2, valStr, { size: 6.1, weight: isDiag ? 700 : 500, fill: ink.text, anchor: 'middle' });
      }
    }
    matSvg += txt(271, 174, 'λ_max = 5.138 · CI = 0.0345', { size: 6.3, weight: 600, fill: ink.axis, anchor: 'middle' })
      + pill(271, 180, 'RI=1.12 · CR=0.031 < 0.10 通过', { bg: ink.primarySoft, stroke: ink.primary, color: ink.primary, size: 6.2, h: 13.5, align: 'center' });
    return {
      title: 'AHP 判断矩阵权重轮廓与 CR 一致性检核',
      badge: 'λ_max=5.14 · CR=0.031',
      body: legendChips([
        { label: '专家判断权重', color: ink.primary, kind: 'line' },
        { label: '调研公众权重', color: ink.secondary, kind: 'dash' },
      ], 44, 39, ink)
        + rings + spokes
        + `<polygon points="${polyStr(polyS)}" fill="${ink.secondary}" fill-opacity="0.14" stroke="${ink.secondary}" stroke-width="1.5" stroke-dasharray="3.5 2"/>`
        + `<polygon points="${polyStr(polyE)}" fill="${ink.primary}" fill-opacity="0.22" stroke="${ink.primary}" stroke-width="1.9"/>`
        + polyE.map(([px, py]) => `<circle cx="${f1(px)}" cy="${f1(py)}" r="2.4" fill="${ink.primary}"/>`).join('')
        + txt(cx, 206, '准则层权重多维轮廓对比', { size: 6.8, weight: 600, fill: ink.axis, anchor: 'middle' })
        + matSvg,
    };
  },

  // =========================================================================
  // 9. SPATIOTEMPORAL & ENGINEERING (时空/空间与工程) - 33 types
  // =========================================================================
  ts_band: (ink: ResolvedInk) => {
    const yrs = ['2020', '2021', '2022', '2023', '2024', '2025', '2026E', '2027E'];
    const vals = [24, 29, 36, 43, 51, 58, 64, 71];
    const x0 = 44, y0 = 48, x1 = 338, y1 = 192;
    const yMap = (v: number) => y1 - ((v - 10) / 75) * (y1 - y0);
    const yTicks = [20, 40, 60, 80].map(v => ({ pos: yMap(v), label: `${v}%` }));
    const xTicks = evenlySpacedTicks(x0 + 16, x1 - 16, yrs);
    const pts: [number, number][] = xTicks.map((t, i) => [t.pos, yMap(vals[i])]);
    const obs = pts.slice(0, 6), fc = pts.slice(5);
    const ci95Top: [number, number][] = fc.map(([x, y], i) => [x, y - i * 11]);
    const ci95Bot: [number, number][] = fc.map(([x, y], i) => [x, y + i * 11]);
    const ci80Top: [number, number][] = fc.map(([x, y], i) => [x, y - i * 6]);
    const ci80Bot: [number, number][] = fc.map(([x, y], i) => [x, y + i * 6]);
    return {
      title: '行业渗透率历史走势与扇形预测置信带',
      badge: 'ARIMA(1,1,1) · 95%CI',
      body: legendChips([{ label: '统计公报实测', color: ink.primary, kind: 'line' }, { label: '外推预测与80/95%CI', color: ink.opposite, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '市场渗透率 (%)' }, ink)
        + `<line x1="${f1(obs[5][0])}" y1="${y0}" x2="${f1(obs[5][0])}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + bandPolygon(ci95Top, ci95Bot, ink.opposite, 0.13)
        + bandPolygon(ci80Top, ci80Bot, ink.opposite, 0.22)
        + `<polyline points="${polyStr(obs)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<polyline points="${polyStr(fc)}" stroke="${ink.opposite}" stroke-width="2" stroke-dasharray="4 2.5"/>`
        + `<circle cx="${f1(fc[2][0])}" cy="${f1(fc[2][1])}" r="3.6" fill="${ink.opposite}"/>`
        + txt(fc[2][0] - 4, fc[2][1] - 8, '71.0%', { size: 7.1, weight: 700, fill: ink.opposite, anchor: 'end' }),
    };
  },

  dual_axis_bar_line: (ink: ResolvedInk) => {
    const yrs = ['2021', '2022', '2023', '2024', '2025'];
    const scale = [124, 158, 196, 242, 286];
    const growth = [14.2, 27.4, 24.1, 23.5, 18.2];
    const x0 = 44, y0 = 48, x1 = 304, y1 = 192;
    const yL = (v: number) => y1 - (v / 320) * (y1 - y0);
    const yR = (v: number) => y1 - (v / 32) * (y1 - y0);
    const yTicks = [0, 80, 160, 240, 320].map(v => ({ pos: yL(v), label: `${v}` }));
    const step = (x1 - x0) / yrs.length;
    const xTicks = yrs.map((lbl, i) => ({ pos: x0 + (i + 0.5) * step, label: lbl }));
    const bars = scale.map((v, i) => {
      const cx = xTicks[i].pos, top = yL(v);
      return `<rect x="${f1(cx - 14)}" y="${f1(top)}" width="28" height="${f1(y1 - top)}" rx="2" fill="${ink.primary}" fill-opacity="0.38" stroke="${ink.primary}" stroke-width="1"/>`
        + txt(cx, y1 - 5, `${v}`, { size: 6.7, weight: 600, fill: darkenHex(ink.primary, 0.25), anchor: 'middle' });
    }).join('');
    const linePts: [number, number][] = growth.map((g, i) => [xTicks[i].pos, yR(g)]);
    return {
      title: '产业市场规模与同比增速双纵轴图',
      badge: '规模286亿 · 增18.2%',
      body: legendChips([{ label: '市场规模 (亿元, 左)', color: ink.primary, kind: 'box' }, { label: '同比增速 (%, 右)', color: ink.opposite, kind: 'line' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '规模 (亿元)' }, ink)
        + `<line x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${ink.opposite}" stroke-width="0.9"/>`
        + [0, 10, 20, 30].map(v => txt(x1 + 4, yR(v) + 2.5, `${v}%`, { size: 6.9, fill: ink.opposite })).join('')
        + bars
        + `<polyline points="${polyStr(linePts)}" stroke="${ink.opposite}" stroke-width="2.1"/>`
        + linePts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.4" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`
          + txt(x, y - 6, `${growth[i]}%`, { size: 6.8, weight: 700, fill: ink.opposite, anchor: 'middle' })).join(''),
    };
  },

  bump: (ink: ResolvedInk) => {
    const cols = ['Q1', 'Q2', 'Q3', 'Q4'];
    const xs = evenlySpacedTicks(86, 266, cols);
    const y0 = 48, y1 = 188;
    const yRank = (r: number) => y0 + ((r - 1) / 4) * (y1 - y0);
    const series = [
      { lbl: '短视频直播', c: ink.primary, ranks: [4, 2, 1, 1] },
      { lbl: '官方直营店', c: ink.secondary, ranks: [1, 1, 2, 2] },
      { lbl: '社群团购', c: ink.accent4, ranks: [3, 4, 3, 3] },
      { lbl: '线下门店', c: ink.opposite, ranks: [2, 3, 4, 5] },
      { lbl: '传统电商', c: ink.muted, ranks: [5, 5, 5, 4] },
    ];
    const yTicks = [1, 2, 3, 4, 5].map(r => ({ pos: yRank(r), label: `#${r}` }));
    const curves = series.map(s => {
      const pts: [number, number][] = xs.map((t, i) => [t.pos, yRank(s.ranks[i])]);
      return `<path d="${smoothCurvePath(pts)}" stroke="${s.c}" stroke-width="2.2" stroke-opacity="0.88"/>`
        + pts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="5" fill="${s.c}" stroke="${ink.surface}" stroke-width="1"/>`
          + txt(x, y + 2.3, String(s.ranks[i]), { size: 6.4, weight: 700, fill: '#FFFFFF', anchor: 'middle' })).join('')
        + txt(pts[3][0] + 9, pts[3][1] + 2.5, s.lbl, { size: 7.1, weight: 700, fill: s.c });
    }).join('');
    return {
      title: '五大消费触达渠道季度位次凹凸图',
      badge: '短视频 #4 → #1',
      body: axesFrame({ x0: 66, y0, x1: 278, y1, yTicks, xTicks: xs, hGrid: true, leftAxis: false, xTitle: '季度演变' }, ink)
        + curves,
    };
  },

  moran_scatter: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 336, y1 = 192;
    const xTicks = [-2, -1, 0, 1, 2].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: String(v) }));
    const yTicks = [-2, -1, 0, 1, 2].map((v, i) => ({ pos: y1 - (i / 4) * (y1 - y0), label: String(v) }));
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const pts: [number, number, string][] = [
      [212, 92, ink.primary], [234, 80, ink.primary], [254, 72, ink.primary], [272, 62, ink.primary], [222, 102, ink.primary], [292, 68, ink.primary],
      [148, 134, ink.secondary], [126, 146, ink.secondary], [108, 158, ink.secondary], [92, 168, ink.secondary], [134, 138, ink.secondary],
      [146, 98, ink.accent4], [228, 144, ink.opposite],
    ];
    return {
      title: '全局莫兰指数 (Moran\'s I) 空间滞后散点',
      badge: 'I=0.418*** · 空间正相关',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '空间滞后项 Wz', xTitle: '标准化渗透率 z' }, ink)
        + `<line x1="${xm}" y1="${y0}" x2="${xm}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${ym}" x2="${x1}" y2="${ym}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + txt(x1 - 6, y0 + 11, 'H-H 高高集聚', { size: 7, weight: 700, fill: ink.primary, anchor: 'end' })
        + txt(x0 + 6, y0 + 11, 'L-H', { size: 7, fill: ink.accent4 })
        + txt(x0 + 6, y1 - 6, 'L-L 低低集聚', { size: 7, weight: 700, fill: ink.secondary })
        + txt(x1 - 6, y1 - 6, 'H-L', { size: 7, fill: ink.opposite, anchor: 'end' })
        + `<line x1="72" y1="176" x2="310" y2="58" stroke="${ink.primary}" stroke-width="1.8"/>`
        + pts.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${c}" fill-opacity="0.82"/>`).join(''),
    };
  },

  choropleth_map: (ink: ResolvedInk) => {
    const tiles: { pts: [number, number][]; val: number; lbl?: string }[] = [
      { pts: [[64, 56], [114, 52], [118, 92], [68, 98]], val: 0.45, lbl: '西北' },
      { pts: [[116, 52], [174, 48], [170, 88], [120, 92]], val: 0.62, lbl: '华北' },
      { pts: [[176, 48], [234, 46], [230, 82], [172, 86]], val: 0.54, lbl: '东北' },
      { pts: [[68, 100], [122, 94], [128, 146], [66, 152]], val: 0.72, lbl: '西南' },
      { pts: [[124, 94], [182, 90], [184, 138], [130, 144]], val: 0.78, lbl: '华中' },
      { pts: [[184, 88], [244, 86], [248, 136], [186, 138]], val: 0.96, lbl: '长三角 4.4' },
      { pts: [[130, 146], [186, 140], [190, 186], [134, 188]], val: 0.68, lbl: '华南' },
      { pts: [[188, 140], [248, 138], [244, 184], [192, 186]], val: 0.90, lbl: '粤港澳 4.2' },
    ];
    const polys = tiles.map(t => {
      const fill = mixHex(ink.primarySoft, ink.primary, t.val);
      const cx = t.pts.reduce((s, p) => s + p[0], 0) / t.pts.length;
      const cy = t.pts.reduce((s, p) => s + p[1], 0) / t.pts.length;
      return `<polygon points="${polyStr(t.pts)}" fill="${fill}" stroke="${ink.canvas}" stroke-width="1.5"/>`
        + (t.lbl ? txt(cx, cy + 2.5, t.lbl, { size: 7.2, weight: 700, fill: t.val > 0.65 ? '#FFFFFF' : ink.text, anchor: 'middle' }) : '');
    }).join('');
    const barColors = [ink.primary, lightenHex(ink.primary, 0.25), lightenHex(ink.primary, 0.5), lightenHex(ink.primary, 0.72), ink.primarySoft];
    return {
      title: '全国分片区采样与渗透率分级专题图',
      badge: '长三角 4.42 居首',
      body: polys
        + colorbarV(294, 52, 11, 126, barColors, '2.8分', '4.5分', '均值', ink)
        + txt(156, 206, '按省域/经济区加权后采样均值分级设色', { size: 7.1, fill: ink.muted, anchor: 'middle' }),
    };
  },

  lisa_cluster: (ink: ResolvedInk) => {
    const tiles: { pts: [number, number][]; cls: 'HH' | 'LL' | 'HL' | 'LH' | 'NS'; lbl: string }[] = [
      { pts: [[64, 56], [116, 52], [120, 96], [68, 100]], cls: 'LL', lbl: 'L-L' },
      { pts: [[118, 52], [176, 48], [172, 92], [122, 96]], cls: 'NS', lbl: 'n.s.' },
      { pts: [[178, 48], [234, 48], [230, 88], [174, 90]], cls: 'LH', lbl: 'L-H' },
      { pts: [[68, 102], [124, 98], [128, 146], [66, 152]], cls: 'LL', lbl: 'L-L' },
      { pts: [[126, 98], [182, 94], [184, 140], [130, 146]], cls: 'HL', lbl: 'H-L' },
      { pts: [[184, 92], [244, 90], [248, 138], [186, 140]], cls: 'HH', lbl: 'H-H' },
      { pts: [[130, 148], [186, 142], [190, 186], [134, 188]], cls: 'NS', lbl: 'n.s.' },
      { pts: [[188, 142], [248, 140], [244, 184], [192, 186]], cls: 'HH', lbl: 'H-H' },
    ];
    const colMap: Record<string, string> = {
      HH: ink.primary,
      LL: ink.secondary,
      HL: ink.opposite,
      LH: ink.accent4,
      NS: '#E2E8F0',
    };
    const polys = tiles.map(t => {
      const fill = colMap[t.cls];
      const cx = t.pts.reduce((s, p) => s + p[0], 0) / t.pts.length;
      const cy = t.pts.reduce((s, p) => s + p[1], 0) / t.pts.length;
      return `<polygon points="${polyStr(t.pts)}" fill="${fill}" fill-opacity="${t.cls === 'NS' ? 0.9 : 0.85}" stroke="${ink.canvas}" stroke-width="1.5"/>`
        + txt(cx, cy + 2.5, t.lbl, { size: 7.4, weight: 700, fill: t.cls === 'NS' ? ink.muted : '#FFFFFF', anchor: 'middle' });
    }).join('');
    const leg = [
      ['高-高 (H-H)', colMap.HH, 64],
      ['低-低 (L-L)', colMap.LL, 90],
      ['高-低 (H-L)', colMap.HL, 116],
      ['低-高 (L-H)', colMap.LH, 142],
      ['不显著', colMap.NS, 168],
    ] as const;
    return {
      title: '局部空间自相关 LISA 集聚分类图',
      badge: '999次置换 · p < 0.05',
      body: polys
        + leg.map(([lbl, c, y]) => `<rect x="270" y="${y - 7}" width="10" height="10" rx="2" fill="${c}"/><text x="285" y="${y + 1}" font-family="${FONT}" font-size="7.2" fill="${ink.text}">${escXml(lbl)}</text>`).join(''),
    };
  },

  calendar_heat: (ink: ResolvedInk) => {
    const days = ['一', '二', '三', '四', '五', '六', '日'];
    const weeks = 12, sz = 16, gap = 3.5, x0 = 52, y0 = 56;
    const months = ['3月', '4月', '5月'];
    let cells = months.map((m, i) => txt(x0 + i * 4 * (sz + gap) + 32, 47, m, { size: 7.4, weight: 700, fill: ink.text, anchor: 'middle' })).join('');
    for (let r = 0; r < 7; r++) {
      cells += txt(x0 - 6, y0 + r * (sz + gap) + 11, days[r], { size: 7, fill: ink.muted, anchor: 'end' });
      for (let c = 0; c < weeks; c++) {
        const val = ((r * 3 + c * 5 + (c > 4 && c < 9 ? 4 : 0)) % 9) / 8;
        const fill = val < 0.12 ? '#E2E8F0' : mixHex(ink.primarySoft, ink.primary, val);
        cells += `<rect x="${f1(x0 + c * (sz + gap))}" y="${f1(y0 + r * (sz + gap))}" width="${sz}" height="${sz}" rx="2.5" fill="${fill}"/>`;
      }
    }
    const ramps = ['#E2E8F0', ink.primarySoft, lightenHex(ink.primary, 0.45), lightenHex(ink.primary, 0.2), ink.primary];
    return {
      title: '调研周期日回收量热力日历矩阵',
      badge: '累计有效 524 份',
      body: cells
        + txt(208, 208, '少', { size: 7, fill: ink.muted, anchor: 'end' })
        + ramps.map((c, i) => `<rect x="${214 + i * 14}" y="200" width="11" height="10" rx="1.5" fill="${c}"/>`).join('')
        + txt(288, 208, '多 (48份/日)', { size: 7, fill: ink.muted }),
    };
  },

  cohort_matrix: (ink: ResolvedInk) => {
    const cohorts = ['第1批', '第2批', '第3批', '第4批', '第5批'];
    const cols = ['首月', '第2月', '第3月', '第4月', '第5月'];
    const vals = [
      [100, 78, 64, 53, 46],
      [100, 81, 67, 58, null],
      [100, 84, 71, null, null],
      [100, 86, null, null, null],
      [100, null, null, null, null],
    ];
    const x0 = 66, y0 = 48, cw = 46, ch = 28;
    let cells = cols.map((c, ci) => txt(x0 + ci * cw + cw / 2, y0 - 5, c, { size: 7.2, weight: 600, fill: ink.muted, anchor: 'middle' })).join('');
    for (let r = 0; r < 5; r++) {
      cells += txt(x0 - 6, y0 + r * ch + 17, cohorts[r], { size: 7.2, weight: 600, fill: ink.text, anchor: 'end' });
      for (let c = 0; c < 5; c++) {
        const v = vals[r][c];
        if (v === null) continue;
        const op = 0.16 + (v / 100) * 0.72;
        const rx = x0 + c * cw, ry = y0 + r * ch;
        cells += `<rect x="${rx}" y="${ry}" width="${cw - 3}" height="${ch - 3}" rx="2.5" fill="${ink.primary}" fill-opacity="${f2(op)}"/>`
          + txt(rx + (cw - 3) / 2, ry + 16, `${v}%`, { size: 7.3, weight: 700, fill: op > 0.54 ? '#FFFFFF' : ink.text, anchor: 'middle' });
      }
    }
    return {
      title: '分批次用户追踪留存率队列斜三角阵',
      badge: '第3批留存提升 +7pp',
      body: cells + txt(x0 + 112, 206, '随追踪月数推移的留存衰减斜角对比', { size: 7.1, fill: ink.muted, anchor: 'middle' }),
    };
  },

  stl_decomp: (ink: ResolvedInk) => {
    const panels = [
      { lbl: '原始序列', y0: 40, h: 32, c: ink.text, pts: [22, 16, 12, 18, 25, 19, 14, 20, 27, 21, 15, 22, 29] },
      { lbl: '趋势 Trend', y0: 78, h: 32, c: ink.primary, pts: [24, 23, 21, 20, 18, 16, 15, 13, 12, 10, 9, 8, 7] },
      { lbl: '季节 Season', y0: 116, h: 32, c: ink.secondary, pts: [16, 8, 16, 24, 16, 8, 16, 24, 16, 8, 16, 24, 16] },
      { lbl: '残差 Resid', y0: 154, h: 32, c: ink.opposite, pts: [16, 19, 13, 17, 15, 21, 14, 18, 16, 13, 19, 15, 17] },
    ];
    const x0 = 76, x1 = 338;
    const xTicks = ['23Q1', '23Q3', '24Q1', '24Q3', '25Q1'].map((label, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label }));
    const sub = panels.map((p, pi) => {
      const pts: [number, number][] = p.pts.map((dy, i) => [x0 + (i / 12) * (x1 - x0), p.y0 + dy]);
      const body = pi === 3
        ? `<line x1="${x0}" y1="${p.y0 + 16}" x2="${x1}" y2="${p.y0 + 16}" stroke="${ink.lightMuted}" stroke-width="0.8"/>`
          + pts.map(([x, y]) => `<line x1="${f1(x)}" y1="${p.y0 + 16}" x2="${f1(x)}" y2="${f1(y)}" stroke="${p.c}" stroke-width="1.6"/>`).join('')
        : `<polyline points="${polyStr(pts)}" stroke="${p.c}" stroke-width="1.6"/>`;
      return `<rect x="${x0}" y="${p.y0}" width="${x1 - x0}" height="${p.h}" fill="${ink.surface}" fill-opacity="0.5" stroke="${ink.grid}" stroke-width="0.8"/>`
        + txt(x0 - 5, p.y0 + p.h / 2 + 2.5, p.lbl, { size: 7, weight: 600, fill: p.c, anchor: 'end' })
        + body;
    }).join('');
    return {
      title: '网络舆情声量 STL 时序分解图',
      badge: '周期=12 · Loess分解',
      body: sub + xTicks.map(t => txt(t.pos, 199, t.label, { size: 7, fill: ink.muted, anchor: 'middle' })).join(''),
    };
  },

  od_flow: (ink: ResolvedInk) => {
    const nodes = [
      { lbl: '中心城区', x: 178, y: 118, r: 10, c: ink.primary },
      { lbl: '城东新区', x: 274, y: 86, r: 7, c: ink.secondary },
      { lbl: '高新园区', x: 258, y: 162, r: 7, c: ink.secondary },
      { lbl: '邻近县A', x: 86, y: 82, r: 6, c: ink.opposite },
      { lbl: '邻近县B', x: 96, y: 164, r: 6, c: ink.accent4 },
    ];
    const flows: [number, number, number, string, number][] = [
      [3, 0, 4.2, ink.opposite, -24],
      [4, 0, 3.2, ink.accent4, 22],
      [0, 1, 3.8, ink.primary, -22],
      [0, 2, 2.8, ink.primary, 20],
      [1, 2, 1.8, ink.secondary, 18],
    ];
    const bgPoly = `<polygon points="56,64 184,48 310,68 300,186 156,196 64,178" fill="${ink.surface}" stroke="${ink.grid}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    const arcs = flows.map(([i, j, w, c, bend]) => {
      const a = nodes[i], b = nodes[j];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + bend;
      const ang = (Math.atan2(b.y - my, b.x - mx) * 180) / Math.PI;
      const tipX = b.x - Math.cos((ang * Math.PI) / 180) * (b.r + 2);
      const tipY = b.y - Math.sin((ang * Math.PI) / 180) * (b.r + 2);
      return `<path d="M ${a.x} ${a.y} Q ${f1(mx)} ${f1(my)}, ${f1(tipX)} ${f1(tipY)}" stroke="${c}" stroke-width="${w}" stroke-opacity="0.55"/>`
        + arrowPoly(tipX, tipY, ang, 6.5, c);
    }).join('');
    const dots = nodes.map(n =>
      `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.c}" stroke="${ink.surface}" stroke-width="1.4"/>`
      + txt(n.x, n.y - n.r - 4, n.lbl, { size: 7.2, weight: 700, fill: ink.text, anchor: 'middle' }),
    ).join('');
    return {
      title: '跨区域服务要素 OD 空间流向弧线图',
      badge: '强中心辐散型流动',
      body: bgPoly + arcs + dots + txt(180, 212, '弧线宽度正比于跨区服务流动频次', { size: 7, fill: ink.muted, anchor: 'middle' }),
    };
  },

  wavelet_spectrum: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 44, x1 = 296, y1 = 192;
    const cols = 18, rows = 10, cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
    const xTicks = ['2021', '2022', '2023', '2024', '2025'].map((label, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label }));
    const yTicks = ['2月', '4月', '8月', '16月', '32月'].map((label, i) => ({ pos: y0 + (i / 4) * (y1 - y0), label }));
    let grid = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d1 = ((c - 10) ** 2) / 14 + ((r - 5) ** 2) / 3.5;
        const d2 = ((c - 5) ** 2) / 10 + ((r - 3) ** 2) / 2.5;
        const power = Math.max(Math.exp(-d1), 0.72 * Math.exp(-d2));
        const fill = power > 0.65 ? ink.opposite : power > 0.35 ? ink.primary : mixHex(ink.secondarySoft, ink.secondary, power);
        grid += `<rect x="${f1(x0 + c * cw)}" y="${f1(y0 + r * ch)}" width="${f1(cw + 0.5)}" height="${f1(ch + 0.5)}" fill="${fill}" fill-opacity="${f2(0.45 + power * 0.45)}"/>`;
      }
    }
    const coi = `M ${x0} ${y0} Q ${x0 + 26} ${y1 - 8}, ${(x0 + x1) / 2} ${y1 - 6} Q ${x1 - 26} ${y1 - 8}, ${x1} ${y0}`;
    const barColors = [ink.opposite, ink.primary, ink.secondary, ink.secondarySoft];
    return {
      title: '舆情波动连续小波时频功率谱图',
      badge: '主周期 12月 · p < 0.05',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, hGrid: false, yTitle: '周期尺度', xTitle: '观测时间窗' }, ink)
        + grid
        + `<ellipse cx="184" cy="126" rx="46" ry="20" stroke="#0F172A" stroke-width="1.3"/>`
        + `<path d="${coi}" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="4 2.5"/>`
        + txt(184, 128, '95% 显著域', { size: 6.8, weight: 700, fill: '#FFFFFF', anchor: 'middle' })
        + colorbarV(310, 48, 9, 128, barColors, '弱', '强', '能量', ink),
    };
  },

  acf_pacf: (ink: ResolvedInk) => {
    const lags = 12;
    const acf = [0.76, 0.58, 0.41, 0.28, 0.16, 0.08, -0.04, -0.09, -0.06, 0.03, 0.05, -0.02];
    const pacf = [0.76, -0.14, 0.09, -0.06, 0.04, -0.08, 0.05, 0.03, -0.04, 0.06, -0.02, 0.01];
    const x0 = 46, x1 = 338;
    const renderPanel = (title: string, vals: number[], y0: number, y1: number) => {
      const yZero = (y0 + y1) / 2 + 8;
      const band = 12;
      const step = (x1 - x0) / lags;
      const stems = vals.map((v, i) => {
        const cx = x0 + (i + 0.5) * step, yv = yZero - v * (yZero - y0 - 4);
        const sig = Math.abs(v) > 0.22;
        const c = sig ? ink.opposite : ink.primary;
        return `<line x1="${f1(cx)}" y1="${f1(yZero)}" x2="${f1(cx)}" y2="${f1(yv)}" stroke="${c}" stroke-width="1.8"/>`
          + `<circle cx="${f1(cx)}" cy="${f1(yv)}" r="2.6" fill="${c}"/>`;
      }).join('');
      return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${ink.surface}" fill-opacity="0.5" stroke="${ink.grid}" stroke-width="0.9"/>`
        + `<rect x="${x0}" y="${f1(yZero - band)}" width="${x1 - x0}" height="${band * 2}" fill="${ink.primary}" fill-opacity="0.1"/>`
        + `<line x1="${x0}" y1="${f1(yZero)}" x2="${x1}" y2="${f1(yZero)}" stroke="${ink.axis}" stroke-width="0.8"/>`
        + txt(x0 + 5, y0 + 10, title, { size: 7.2, weight: 700, fill: ink.text })
        + stems;
    };
    const xTicks = Array.from({ length: 6 }, (_, i) => ({ pos: x0 + ((i * 2 + 0.5) / lags) * (x1 - x0), label: `Lag ${i * 2 + 1}` }));
    return {
      title: '时间序列自相关 ACF / PACF 滞后双图',
      badge: 'AR(1) 截尾 · 95%CI',
      body: renderPanel('ACF 自相关系数 (拖尾衰减)', acf, 42, 110)
        + renderPanel('PACF 偏自相关系数 (Lag 1 截尾)', pacf, 120, 188)
        + xTicks.map(t => txt(t.pos, 200, t.label, { size: 6.9, fill: ink.muted, anchor: 'middle' })).join('')
        + txt((x0 + x1) / 2, 212, '蓝色带为 ±1.96/√n 白噪声置信界限', { size: 6.9, fill: ink.muted, anchor: 'middle' }),
    };
  },

  gantt_critical: (ink: ResolvedInk) => {
    const tasks = [
      ['1. 文献访谈预研', 0, 2, true],
      ['2. 预试与量表净化', 2, 4, true],
      ['3. 线上线下分层收', 4, 7, true],
      ['4. 四步清洗与加权', 6, 8, false],
      ['5. 建模检验与定稿', 7, 10, true],
    ] as const;
    const x0 = 94, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (w: number) => x0 + (w / 10) * (x1 - x0);
    const xTicks = [0, 2, 4, 6, 8, 10].map(w => ({ pos: xMap(w), label: `W${w}` }));
    const rowH = (y1 - y0) / tasks.length;
    const bars = tasks.map(([lbl, s, e, crit], i) => {
      const cy = y0 + (i + 0.5) * rowH, xs = xMap(s), xe = xMap(e);
      const c = crit ? ink.primary : ink.secondary;
      return txt(x0 - 5, cy + 2.5, lbl, { size: 7.1, weight: crit ? 700 : 500, fill: ink.text, anchor: 'end' })
        + `<rect x="${f1(xs)}" y="${f1(cy - 7)}" width="${f1(xe - xs)}" height="14" rx="2.5" fill="${c}" fill-opacity="${crit ? 0.85 : 0.45}" stroke="${c}" stroke-width="1"/>`
        + (i === 4 ? `<polygon points="${f1(xe)},${f1(cy - 6)} ${f1(xe + 6)},${f1(cy)} ${f1(xe)},${f1(cy + 6)} ${f1(xe - 6)},${f1(cy)}" fill="${ink.opposite}"/>` : '');
    }).join('');
    return {
      title: '实证调研工程关键路径甘特图',
      badge: '总工期 10周 · 关键路径',
      body: legendChips([{ label: '关键路径任务', color: ink.primary, kind: 'box' }, { label: '弹性并行环节', color: ink.secondary, kind: 'box' }, { label: '定稿里程碑', color: ink.opposite, kind: 'dot' }], 94, 40, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '调研实施周次进度' }, ink)
        + bars,
    };
  },

  signal_anomaly: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 44, x1 = 338, y1 = 192;
    const xTicks = [1, 125, 250, 375, 500].map((v, i) => ({ pos: x0 + (i / 4) * (x1 - x0), label: `#${v}` }));
    const yTicks = [0, 150, 300, 450].map((v, i) => ({ pos: y1 - (i / 3) * (y1 - y0), label: `${v}s` }));
    const ys = [126, 118, 122, 178, 114, 124, 112, 120, 62, 128, 116, 122, 180, 118, 124, 110, 56, 122, 116];
    const pts: [number, number][] = ys.map((y, i) => [x0 + 8 + (i / (ys.length - 1)) * (x1 - x0 - 16), y]);
    const yUcl = 72, yLcl = 166, yMean = 119;
    return {
      title: '问卷入库序贯质控与异常突刺预警',
      badge: '异常预警 4例 (3σ)',
      body: axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '作答时长 (秒)', xTitle: '问卷回收序贯编号' }, ink)
        + `<rect x="${x0}" y="88" width="${x1 - x0}" height="62" fill="${ink.primary}" fill-opacity="0.1"/>`
        + `<line x1="${x0}" y1="${yUcl}" x2="${x1}" y2="${yUcl}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${yLcl}" x2="${x1}" y2="${yLcl}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${yMean}" x2="${x1}" y2="${yMean}" stroke="${ink.primary}" stroke-width="1" stroke-dasharray="2.5 2"/>`
        + txt(x1 - 4, yUcl - 3, 'UCL +3σ', { size: 6.7, fill: ink.opposite, anchor: 'end' })
        + txt(x1 - 4, yLcl + 9, 'LCL -3σ (快答拦截)', { size: 6.7, fill: ink.opposite, anchor: 'end' })
        + `<polyline points="${polyStr(pts)}" stroke="${ink.secondary}" stroke-width="1.4"/>`
        + pts.map(([x, y]) => {
          const bad = y < yUcl || y > yLcl;
          return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${bad ? 3.8 : 2.2}" fill="${bad ? ink.opposite : ink.primary}"/>`;
        }).join(''),
    };
  },

  weibull_bathtub: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (t: number) => x0 + (t / 10) * (x1 - x0);
    const yMap = (h: number) => y1 - (Math.min(0.6, h) / 0.6) * (y1 - y0);
    const xTicks = [0, 2, 4, 6, 8, 10].map(v => ({ pos: xMap(v), label: `${v}年` }));
    const yTicks = [0, 0.2, 0.4, 0.6].map(v => ({ pos: yMap(v), label: v.toFixed(1) }));
    const xS1 = xMap(2.4), xS2 = xMap(7.2);
    const ts = Array.from({ length: 30 }, (_, i) => 0.2 + (i / 29) * 9.6);
    const h1Fn = (t: number) => 0.29 * Math.pow(t + 0.18, -0.68);
    const h2Fn = () => 0.085;
    const h3Fn = (t: number) => 0.0026 * Math.pow(Math.max(0, t - 4.0), 2.42);
    const totPts: [number, number][] = ts.map(t => [xMap(t), yMap(h1Fn(t) + h2Fn() + h3Fn(t))]);
    const h1Pts: [number, number][] = ts.slice(0, 14).map(t => [xMap(t), yMap(h1Fn(t))]);
    const h3Pts: [number, number][] = ts.slice(12).map(t => [xMap(t), yMap(h3Fn(t))]);
    return {
      title: 'Weibull 可靠性三阶段失效率“浴盆曲线”',
      badge: 'β₁=0.52 · β₂=1.0 · β₃=3.4',
      body: legendChips([{ label: '总失效率 h(t)', color: ink.primary, kind: 'line' }, { label: '早期磨合 (β<1)', color: ink.secondary, kind: 'dash' }, { label: '耗损老化 (β>1)', color: ink.opposite, kind: 'dash' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '瞬时失效率 h(t)', xTitle: '服役时间周期 t (年)' }, ink)
        + `<rect x="${x0}" y="${y0}" width="${f1(xS1 - x0)}" height="${y1 - y0}" fill="${ink.opposite}" fill-opacity="0.06"/>`
        + `<rect x="${f1(xS1)}" y="${y0}" width="${f1(xS2 - xS1)}" height="${y1 - y0}" fill="${ink.primary}" fill-opacity="0.05"/>`
        + `<rect x="${f1(xS2)}" y="${y0}" width="${f1(x1 - xS2)}" height="${y1 - y0}" fill="${ink.secondary}" fill-opacity="0.06"/>`
        + `<line x1="${f1(xS1)}" y1="${y0}" x2="${f1(xS1)}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xS2)}" y1="${y0}" x2="${f1(xS2)}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + txt((x0 + xS1) / 2, y0 + 10, 'I.早期失效', { size: 6.7, weight: 700, fill: ink.opposite, anchor: 'middle' })
        + txt((xS1 + xS2) / 2, y0 + 10, 'II.偶然稳定期', { size: 6.7, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt((xS2 + x1) / 2, y0 + 10, 'III.耗损期', { size: 6.7, weight: 700, fill: ink.secondary, anchor: 'middle' })
        + `<path d="${smoothCurvePath(h1Pts)}" stroke="${ink.secondary}" stroke-width="1.3" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(h3Pts)}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(totPts)}" stroke="${ink.primary}" stroke-width="2.4"/>`
        + pill((xS1 + xS2) / 2, 102, 'h(t) = (β/η)(t/η)^(β-1)', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.7, h: 14, align: 'center' }),
    };
  },

  mm_c_queue_latency: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (rho: number) => x0 + ((rho - 0.1) / 0.86) * (x1 - x0);
    const yMap = (wq: number) => y1 - (Math.min(40, wq) / 40) * (y1 - y0);
    const xTicks = [0.2, 0.4, 0.6, 0.8, 0.95].map(v => ({ pos: xMap(v), label: v.toFixed(2) }));
    const yTicks = [0, 10, 20, 30, 40].map(v => ({ pos: yMap(v), label: `${v}分` }));
    const erlangWq = (rho: number, c: number, mu = 0.25) => {
      const a = c * rho;
      let sum = 0, term = 1;
      for (let k = 0; k < c; k++) {
        if (k > 0) term *= a / k;
        sum += term;
      }
      const termC = (term * a / c) / (1 - rho);
      const pw = termC / (sum + termC);
      return pw / (c * mu * (1 - rho));
    };
    const rhos = Array.from({ length: 30 }, (_, i) => 0.12 + (i / 29) * 0.82);
    const c1Pts: [number, number][] = rhos.filter(r => erlangWq(r, 1) <= 42).map(r => [xMap(r), yMap(erlangWq(r, 1))]);
    const c2Pts: [number, number][] = rhos.map(r => [xMap(r), yMap(erlangWq(r, 2))]);
    const c4Pts: [number, number][] = rhos.map(r => [xMap(r), yMap(erlangWq(r, 4))]);
    const xCrit = xMap(0.85), yC1 = yMap(erlangWq(0.85, 1)), yC4 = yMap(erlangWq(0.85, 4));
    return {
      title: 'M/M/c 排队利用率 ρ 与延迟非线性相变',
      badge: '临界警戒 ρ=0.85',
      body: legendChips([{ label: 'c=1 单窗口', color: ink.opposite, kind: 'line' }, { label: 'c=2 双窗口', color: ink.secondary, kind: 'line' }, { label: 'c=4 并行池', color: ink.primary, kind: 'line' }], 46, 40, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '平均排队等待 Wq (分)', xTitle: '服务台系统利用率 ρ = λ / (cμ)' }, ink)
        + `<rect x="${f1(xCrit)}" y="${y0}" width="${f1(x1 - xCrit)}" height="${y1 - y0}" fill="${ink.opposite}" fill-opacity="0.09"/>`
        + `<line x1="${f1(xCrit)}" y1="${y0}" x2="${f1(xCrit)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + txt(xCrit - 4, y0 + 11, '相变警戒 ρ=0.85', { size: 6.8, weight: 700, fill: ink.opposite, anchor: 'end' })
        + `<path d="${smoothCurvePath(c1Pts)}" stroke="${ink.opposite}" stroke-width="2"/>`
        + `<path d="${smoothCurvePath(c2Pts)}" stroke="${ink.secondary}" stroke-width="1.9"/>`
        + `<path d="${smoothCurvePath(c4Pts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + `<circle cx="${f1(xCrit)}" cy="${f1(yC1)}" r="3.4" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`
        + `<circle cx="${f1(xCrit)}" cy="${f1(yC4)}" r="3.6" fill="${ink.primary}" stroke="${ink.surface}" stroke-width="1"/>`
        + txt(xCrit - 8, yC4 + 3, '并行池化 -83% 延迟', { size: 6.8, weight: 700, fill: ink.primary, anchor: 'end' }),
    };
  },

  lexis_diagram: (ink: ResolvedInk) => {
    const cell = 26;
    const cols = 7, rows = 5;
    const x0 = 56, y0 = 56, x1 = x0 + cols * cell, y1 = y0 + rows * cell; // x1=238, y1=186
    const pLabels = ['90', '95', '00', '05', '10', '15', '20', '25'];
    const aLabels = ['20', '25', '30', '35', '40', '45'];
    const heat = [
      [0.12, 0.14, 0.16, 0.22, 0.28, 0.34, 0.42],
      [0.16, 0.20, 0.25, 0.34, 0.46, 0.58, 0.64],
      [0.22, 0.28, 0.36, 0.50, 0.62, 0.72, 0.68],
      [0.18, 0.24, 0.30, 0.40, 0.48, 0.54, 0.50],
      [0.10, 0.14, 0.18, 0.24, 0.30, 0.34, 0.32],
    ];
    let cellsSvg = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = x0 + c * cell, cy = y1 - (r + 1) * cell;
        cellsSvg += `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" fill="${ink.secondary}" fill-opacity="${f2(heat[r][c] * 0.52)}" stroke="${ink.grid}" stroke-width="0.7"/>`;
      }
    }
    const cohortDiags: [number, number, number, string][] = [
      [0, 1, 4, '1975队列'],
      [1, 0, 5, '1985队列'],
      [3, 0, 4, '1995队列'],
    ];
    const diagSvg = cohortDiags.map(([cStart, rStart, len, lbl], idx) => {
      const sx = x0 + cStart * cell, sy = y1 - rStart * cell;
      const ex = x0 + (cStart + len) * cell, ey = y1 - (rStart + len) * cell;
      const lx = idx < 2 ? ex : ex + 4;
      const ly = idx < 2 ? ey - 4 : ey + 2.5;
      return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + `<circle cx="${ex}" cy="${ey}" r="2.6" fill="${ink.primary}"/>`
        + txt(lx, ly, lbl, { size: 6.5, weight: 700, fill: ink.primary, anchor: idx < 2 ? 'middle' : 'start' });
    }).join('');
    return {
      title: '人口学 APC Lexis 生命网格图',
      badge: '1:1 比例 · A=P-C',
      body: legendChips([{ label: '45° 队列生命线', color: ink.primary, kind: 'line' }, { label: '发生密度', color: ink.secondary, kind: 'box' }, { label: '2015干预期', color: ink.opposite, kind: 'box' }], 44, 39, ink)
        + cellsSvg
        + `<rect x="${x0 + 5 * cell}" y="${y0}" width="${cell}" height="${y1 - y0}" fill="${ink.opposite}" fill-opacity="0.12" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" stroke="${ink.axis}" stroke-width="1"/>`
        + diagSvg
        + pLabels.map((lbl, i) => txt(x0 + i * cell, y1 + 11, lbl, { size: 6.8, fill: ink.muted, anchor: 'middle' })).join('')
        + aLabels.map((lbl, i) => txt(x0 - 5, y1 - i * cell + 2.5, lbl, { size: 6.8, fill: ink.muted, anchor: 'end' })).join('')
        + txt((x0 + x1) / 2, 214, '日历时期 Period (1990–2025)', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle' })
        + txt(20, (y0 + y1) / 2, '年龄 Age (岁)', { size: 7.2, weight: 600, fill: ink.axis, anchor: 'middle', rotate: -90 })
        + `<rect x="292" y="76" width="54" height="82" rx="4" fill="${ink.surface}" stroke="${ink.grid}" stroke-width="0.9"/>`
        + txt(319, 90, 'APC 关系', { size: 7, weight: 700, fill: ink.text, anchor: 'middle' })
        + txt(319, 105, 'A = P - C', { size: 7, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(319, 122, '2015干预期', { size: 6.5, weight: 600, fill: ink.opposite, anchor: 'middle' })
        + txt(319, 134, '斜率=1.0', { size: 6.5, fill: ink.muted, anchor: 'middle' })
        + txt(319, 148, '5年×5岁网格', { size: 6.3, fill: ink.muted, anchor: 'middle' }),
    };
  },

  bode_magnitude_phase: (ink: ResolvedInk) => {
    const x0 = 50, x1 = 336;
    const my0 = 42, my1 = 108;
    const py0 = 120, py1 = 190;
    const logs = Array.from({ length: 28 }, (_, i) => -1 + (i / 27) * 3.1); // log10(w) in [-1, 2.1]
    const xMap = (lw: number) => x0 + ((lw + 1) / 3.1) * (x1 - x0);
    const magY = (db: number) => my1 - ((db + 45) / 70) * (my1 - my0);
    const phY = (deg: number) => py1 - ((deg + 210) / 140) * (py1 - py0);
    const evalTF = (w: number) => {
      // G(jw) = 4.2 / (jw * (0.18jw + 1) * (0.045jw + 1))
      const m = 4.2 / (w * Math.sqrt(1 + (0.18 * w) ** 2) * Math.sqrt(1 + (0.045 * w) ** 2));
      const db = 20 * Math.log10(m);
      const deg = -90 - (Math.atan(0.18 * w) + Math.atan(0.045 * w)) * (180 / Math.PI);
      return { db, deg };
    };
    const magPts: [number, number][] = [];
    const phPts: [number, number][] = [];
    for (const lw of logs) {
      const { db, deg } = evalTF(10 ** lw);
      if (db >= -45 && db <= 25) magPts.push([xMap(lw), magY(db)]);
      if (deg >= -210 && deg <= -70) phPts.push([xMap(lw), phY(deg)]);
    }
    const lwGc = Math.log10(3.15), lwPc = Math.log10(11.11);
    const xGc = xMap(lwGc), xPc = xMap(lwPc);
    const phGc = evalTF(3.15).deg, magPc = evalTF(11.11).db;
    const xTicks = [-1, 0, 1, 2].map(v => ({ pos: xMap(v), label: v < 0 ? '0.1' : String(10 ** v) }));
    const mTicks = [-40, -20, 0, 20].map(v => ({ pos: magY(v), label: `${v}` }));
    const pTicks = [-180, -135, -90].map(v => ({ pos: phY(v), label: `${v}°` }));
    return {
      title: '控制系统伯德 (Bode) 幅频—相频双联图',
      badge: `GM=${(-magPc).toFixed(1)}dB · PM=${(180 + phGc).toFixed(0)}°`,
      body: axesFrame({ x0, y0: my0, x1, y1: my1, yTicks: mTicks, xTicks: [], box: true, yTitle: '幅值 (dB)' }, ink)
        + axesFrame({ x0, y0: py0, x1, y1: py1, yTicks: pTicks, xTicks, box: true, yTitle: '相角 (°)', xTitle: '角频率 ω (rad/s, 对数刻度)' }, ink)
        + `<line x1="${x0}" y1="${f1(magY(0))}" x2="${x1}" y2="${f1(magY(0))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${f1(phY(-180))}" x2="${x1}" y2="${f1(phY(-180))}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xGc)}" y1="${my0}" x2="${f1(xGc)}" y2="${py1}" stroke="${ink.primary}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(xPc)}" y1="${my0}" x2="${f1(xPc)}" y2="${py1}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<path d="${smoothCurvePath(magPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + `<path d="${smoothCurvePath(phPts)}" stroke="${ink.secondary}" stroke-width="2.1"/>`
        + `<line x1="${f1(xPc)}" y1="${f1(magY(0))}" x2="${f1(xPc)}" y2="${f1(magY(magPc))}" stroke="${ink.opposite}" stroke-width="1.8"/>`
        + txt(xPc + 4, (magY(0) + magY(magPc)) / 2 + 2, `GM=${(-magPc).toFixed(1)}dB`, { size: 6.5, weight: 700, fill: ink.opposite })
        + `<line x1="${f1(xGc)}" y1="${f1(phY(phGc))}" x2="${f1(xGc)}" y2="${f1(phY(-180))}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + txt(xGc + 4, (phY(phGc) + phY(-180)) / 2 + 2, `PM=${(180 + phGc).toFixed(0)}°`, { size: 6.5, weight: 700, fill: ink.primary }),
    };
  },

  sir_compartment: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 48, x1 = 310, y1 = 192;
    const xMap = (t: number) => x0 + (t / 90) * (x1 - x0);
    const yMap = (v: number) => y1 - v * (y1 - y0);
    const rtMap = (r: number) => y1 - (r / 3.0) * (y1 - y0);
    const xTicks = [0, 20, 40, 60, 80].map(t => ({ pos: xMap(t), label: `${t}天` }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(v => ({ pos: yMap(v), label: `${Math.round(v * 100)}%` }));
    let s = 0.99, e = 0.01, ii = 0.0, r = 0.0;
    const beta = 0.42, sigma = 0.2, gamma = 0.14, dt = 0.5;
    const sPts: [number, number][] = [], ePts: [number, number][] = [], iPts: [number, number][] = [], rPts: [number, number][] = [], rtPts: [number, number][] = [];
    let maxI = 0, tMax = 0;
    for (let step = 0; step <= 180; step++) {
      const t = step * dt;
      if (step % 6 === 0) {
        sPts.push([xMap(t), yMap(s)]);
        ePts.push([xMap(t), yMap(e)]);
        iPts.push([xMap(t), yMap(ii)]);
        rPts.push([xMap(t), yMap(r)]);
        rtPts.push([xMap(t), rtMap((beta / gamma) * s)]);
      }
      if (ii > maxI) { maxI = ii; tMax = t; }
      const ds = -beta * s * ii;
      const de = beta * s * ii - sigma * e;
      const di = sigma * e - gamma * ii;
      const dr = gamma * ii;
      s += ds * dt; e += de * dt; ii += di * dt; r += dr * dt;
    }
    const iFill = `${smoothCurvePath(iPts)} L ${x1} ${y1} L ${x0} ${y1} Z`;
    return {
      title: '传染病 SEIR 仓室演化与再生数 Rt',
      badge: `R0=3.0 · Imax=${(maxI * 100).toFixed(1)}%`,
      body: legendChips([{ label: 'S易感', color: ink.secondary, kind: 'line' }, { label: 'E潜伏', color: ink.accent4, kind: 'dash' }, { label: 'I感染', color: ink.opposite, kind: 'line' }, { label: 'R康复', color: ink.primary, kind: 'line' }, { label: 'Rt', color: ink.axis, kind: 'dash' }], 44, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, yTitle: '人群仓室占比', xTitle: '仿真时间 t (天)' }, ink)
        + `<line x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + [0, 1, 2, 3].map(rv => `<line x1="${x1}" y1="${f1(rtMap(rv))}" x2="${x1 + 3}" y2="${f1(rtMap(rv))}" stroke="${ink.axis}" stroke-width="0.8"/>`
          + txt(x1 + 5, rtMap(rv) + 2.5, `${rv}.0`, { size: 6.8, fill: ink.muted })).join('')
        + txt(348, (y0 + y1) / 2, '有效再生数 Rt', { size: 7, weight: 600, fill: ink.axis, anchor: 'middle', rotate: 90 })
        + `<line x1="${x0}" y1="${f1(rtMap(1))}" x2="${x1}" y2="${f1(rtMap(1))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<path d="${iFill}" fill="${ink.opposite}" fill-opacity="0.14"/>`
        + `<path d="${smoothCurvePath(sPts)}" stroke="${ink.secondary}" stroke-width="1.7"/>`
        + `<path d="${smoothCurvePath(ePts)}" stroke="${ink.accent4}" stroke-width="1.5" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(rPts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + `<path d="${smoothCurvePath(rtPts)}" stroke="${ink.axis}" stroke-width="1.4" stroke-dasharray="4 2"/>`
        + `<path d="${smoothCurvePath(iPts)}" stroke="${ink.opposite}" stroke-width="2.2"/>`
        + `<circle cx="${f1(xMap(tMax))}" cy="${f1(yMap(maxI))}" r="3.4" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`
        + txt(xMap(tMax), yMap(maxI) - 7, `达峰 ${(maxI * 100).toFixed(1)}%`, { size: 6.7, weight: 700, fill: ink.opposite, anchor: 'middle' }),
    };
  },

  phase_portrait: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (x: number) => x0 + x * (x1 - x0);
    const yMap = (y: number) => y1 - y * (y1 - y0);
    const ticks = [0, 0.25, 0.5, 0.75, 1.0];
    const xTicks = ticks.map(v => ({ pos: xMap(v), label: v.toFixed(2) }));
    const yTicks = ticks.map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const fxy = (x: number, y: number): [number, number] => [
      x * (0.42 - 0.90 * x + 0.24 * y),
      y * (0.36 + 0.22 * x - 0.85 * y),
    ];
    let vecSvg = '';
    for (let gx = 0.1; gx <= 0.92; gx += 0.16) {
      for (let gy = 0.12; gy <= 0.92; gy += 0.18) {
        const [vx, vy] = fxy(gx, gy);
        const norm = Math.hypot(vx, vy) || 1;
        const sx = xMap(gx), sy = yMap(gy);
        const ex = sx + (vx / norm) * 11, ey = sy - (vy / norm) * 9;
        const ang = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
        vecSvg += `<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${ink.lightMuted}" stroke-width="0.95" stroke-opacity="0.72"/>`
          + arrowPoly(ex, ey, ang, 3.2, ink.lightMuted);
      }
    }
    const trajStarts: [number, number][] = [[0.12, 0.88], [0.92, 0.14], [0.14, 0.14], [0.92, 0.90]];
    const trajSvg = trajStarts.map(([sx0, sy0]) => {
      let x = sx0, y = sy0;
      const pts: [number, number][] = [[xMap(x), yMap(y)]];
      const dt = 0.35;
      for (let k = 0; k < 28; k++) {
        const [k1x, k1y] = fxy(x, y);
        const [k2x, k2y] = fxy(x + 0.5 * dt * k1x, y + 0.5 * dt * k1y);
        x = Math.min(0.99, Math.max(0.01, x + dt * k2x));
        y = Math.min(0.99, Math.max(0.01, y + dt * k2y));
        if (k % 2 === 1) pts.push([xMap(x), yMap(y)]);
      }
      const mid = pts[Math.floor(pts.length / 2)];
      const nxt = pts[Math.floor(pts.length / 2) + 1] ?? pts[pts.length - 1];
      const ang = (Math.atan2(nxt[1] - mid[1], nxt[0] - mid[0]) * 180) / Math.PI;
      return `<path d="${smoothCurvePath(pts)}" stroke="${ink.primary}" stroke-width="1.65"/>`
        + `<circle cx="${f1(pts[0][0])}" cy="${f1(pts[0][1])}" r="2.3" fill="${ink.primary}"/>`
        + arrowPoly(mid[0], mid[1], ang, 4.2, ink.primary);
    }).join('');
    // Nullclines: dx/dt=0 => x=(0.42+0.24y)/0.90; dy/dt=0 => y=(0.36+0.22x)/0.85
    const xNull0 = 0.42 / 0.90, xNull1 = (0.42 + 0.24) / 0.90;
    const yNull0 = 0.36 / 0.85, yNull1 = (0.36 + 0.22) / 0.85;
    const xStar = 0.624, yStar = 0.585;
    return {
      title: '动力系统相平面向量场与稳态轨线',
      badge: '吸引子 E*(0.62, 0.58)',
      body: legendChips([{ label: '演化轨线', color: ink.primary, kind: 'line' }, { label: 'dx/dt=0', color: ink.secondary, kind: 'dash' }, { label: 'dy/dt=0', color: ink.opposite, kind: 'dash' }], 44, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '生态协同度 y(t)', xTitle: '技术采纳率 x(t)' }, ink)
        + vecSvg
        + `<line x1="${f1(xMap(xNull0))}" y1="${f1(yMap(0))}" x2="${f1(xMap(xNull1))}" y2="${f1(yMap(1))}" stroke="${ink.secondary}" stroke-width="1.3" stroke-dasharray="3.5 2"/>`
        + `<line x1="${f1(xMap(0))}" y1="${f1(yMap(yNull0))}" x2="${f1(xMap(1))}" y2="${f1(yMap(yNull1))}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="3.5 2"/>`
        + trajSvg
        + `<circle cx="${f1(xMap(0))}" cy="${f1(yMap(0))}" r="3.4" fill="${ink.surface}" stroke="${ink.opposite}" stroke-width="1.4"/>`
        + `<circle cx="${f1(xMap(xStar))}" cy="${f1(yMap(yStar))}" r="4.6" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1.3"/>`
        + pill(xMap(xStar) + 8, yMap(yStar) - 18, 'E*(0.62, 0.58)', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.7, h: 14 }),
    };
  },

  cusum_ewma_control: (ink: ResolvedInk) => {
    const x0 = 48, x1 = 336;
    const ty0 = 42, ty1 = 108;
    const by0 = 120, by1 = 192;
    const n = 25;
    const xMap = (i: number) => x0 + 8 + (i / (n - 1)) * (x1 - x0 - 16);
    const cyMap = (v: number) => ty1 - ((v + 6.5) / 13.0) * (ty1 - ty0);
    const eyMap = (v: number) => by1 - ((v + 1.1) / 2.2) * (by1 - by0);
    const xTicks = [1, 5, 10, 15, 20, 25].map(v => ({ pos: xMap(v - 1), label: `#${v}` }));
    const cTicks = [-5, 0, 5].map(v => ({ pos: cyMap(v), label: String(v) }));
    const eTicks = [-1.0, 0.0, 1.0].map(v => ({ pos: eyMap(v), label: v.toFixed(1) }));
    const xs = [0.2, -0.3, 0.1, 0.4, -0.2, 0.0, -0.4, 0.3, -0.1, 0.2, 0.1, -0.2, 0.3, 0.9, 1.1, 0.8, 1.3, 1.2, 1.4, 1.1, 1.5, 1.3, 1.6, 1.2, 1.4];
    const cPlus: number[] = [];
    const cMinus: number[] = [];
    const ewma: number[] = [];
    let cp = 0, cm = 0, ez = 0;
    const lam = 0.22;
    for (const x of xs) {
      cp = Math.max(0, cp + x - 0.5);
      cm = Math.max(0, cm - x - 0.5);
      ez = lam * x + (1 - lam) * ez;
      cPlus.push(cp);
      cMinus.push(-cm);
      ewma.push(ez);
    }
    const cpPts: [number, number][] = cPlus.map((v, i) => [xMap(i), cyMap(Math.min(6.2, v))]);
    const cmPts: [number, number][] = cMinus.map((v, i) => [xMap(i), cyMap(Math.max(-6.2, v))]);
    const ezPts: [number, number][] = ewma.map((v, i) => [xMap(i), eyMap(Math.min(1.05, Math.max(-1.05, v)))]);
    const xTrig = xMap(17); // #18 (index 17)
    return {
      title: 'SPC 过程控制 CUSUM 与 EWMA 双联',
      badge: '#18 检出 +0.8σ 漂移',
      body: axesFrame({ x0, y0: ty0, x1, y1: ty1, yTicks: cTicks, xTicks: [], box: true, yTitle: 'CUSUM C±' }, ink)
        + axesFrame({ x0, y0: by0, x1, y1: by1, yTicks: eTicks, xTicks, box: true, yTitle: 'EWMA Z_i', xTitle: '序贯抽样监测编号 (#1–#25)' }, ink)
        + `<line x1="${f1(xTrig)}" y1="${ty0}" x2="${f1(xTrig)}" y2="${by1}" stroke="${ink.opposite}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${f1(cyMap(4.5))}" x2="${x1}" y2="${f1(cyMap(4.5))}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${f1(cyMap(-4.5))}" x2="${x1}" y2="${f1(cyMap(-4.5))}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${f1(cyMap(0))}" x2="${x1}" y2="${f1(cyMap(0))}" stroke="${ink.grid}" stroke-width="0.8"/>`
        + `<polyline points="${polyStr(cmPts)}" stroke="${ink.secondary}" stroke-width="1.5"/>`
        + `<polyline points="${polyStr(cpPts)}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + cpPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${cPlus[i] > 4.5 ? 2.8 : 1.7}" fill="${cPlus[i] > 4.5 ? ink.opposite : ink.primary}"/>`).join('')
        + `<line x1="${x0}" y1="${f1(eyMap(0.68))}" x2="${x1}" y2="${f1(eyMap(0.68))}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${f1(eyMap(-0.68))}" x2="${x1}" y2="${f1(eyMap(-0.68))}" stroke="${ink.opposite}" stroke-width="0.9" stroke-dasharray="3.5 2"/>`
        + `<line x1="${x0}" y1="${f1(eyMap(0))}" x2="${x1}" y2="${f1(eyMap(0))}" stroke="${ink.grid}" stroke-width="0.8"/>`
        + `<polyline points="${polyStr(ezPts)}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + ezPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${ewma[i] > 0.68 ? 2.8 : 1.7}" fill="${ewma[i] > 0.68 ? ink.opposite : ink.primary}"/>`).join('')
        + txt(x1 - 4, cyMap(4.5) - 3, 'H=+4.5', { size: 6.3, weight: 700, fill: ink.opposite, anchor: 'end' })
        + txt(x1 - 4, eyMap(0.68) - 3, 'UCL=+0.68', { size: 6.3, weight: 700, fill: ink.opposite, anchor: 'end' })
        + pill(xTrig - 6, ty0 + 4, '#18 触发偏移预警', { bg: ink.surface, stroke: ink.opposite, color: ink.opposite, size: 6.4, h: 13, align: 'right' }),
    };
  },

  nyquist_stability_locus: (ink: ResolvedInk) => {
    const x0 = 46, y0 = 48, x1 = 336, y1 = 192;
    const scale = 46;
    const ox = 216, oy = 104;
    const xMap = (re: number) => ox + re * scale;
    const yMap = (im: number) => oy - im * scale;
    const evalG = (w: number): [number, number] => {
      // G(jw) = 1.6 / ((1 - w^2 + j*0.9w)(1 + j*0.35w))
      const ar = 1 - w * w, ai = 0.9 * w;
      const br = 1, bi = 0.35 * w;
      const dr = ar * br - ai * bi;
      const di = ar * bi + ai * br;
      const denom = dr * dr + di * di;
      return [(1.6 * dr) / denom, (-1.6 * di) / denom];
    };
    const ws = Array.from({ length: 48 }, (_, i) => Math.pow(10, -1.6 + (i / 47) * 2.8));
    const posPts: [number, number][] = [[xMap(1.6), yMap(0)], ...ws.map(w => {
      const [re, im] = evalG(w);
      return [xMap(re), yMap(im)] as [number, number];
    })];
    const negPts: [number, number][] = posPts.slice(0, 32).map(([px, py]) => [px, 2 * oy - py]);
    const [pmRe, pmIm] = evalG(1.32); // |G(j1.32)| ≈ 1.0
    const [gmRe] = evalG(1.88);       // Im ≈ 0, Re ≈ -0.45
    const midIdx = 22;
    const m0 = posPts[midIdx], m1 = posPts[midIdx + 1];
    const dirAng = (Math.atan2(m1[1] - m0[1], m1[0] - m0[0]) * 180) / Math.PI;
    const xTicks = [-3, -2, -1, 0, 1, 2].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [-1, 0, 1].map(v => ({ pos: yMap(v), label: `${v}j` }));
    return {
      title: '复平面 Nyquist 轨迹与相位裕度',
      badge: 'PM=43° · GM=6.9dB',
      body: legendChips([
        { label: 'G(jω) 轨迹', color: ink.primary, kind: 'line' },
        { label: '单位圆 |G|=1', color: ink.secondary, kind: 'dash' },
        { label: '临界点 (-1, j0)', color: ink.opposite, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '虚部 Im[G(jω)]', xTitle: '实部 Re[G(jω)] (等比例复平面)' }, ink)
        + `<line x1="${x0}" y1="${oy}" x2="${x1}" y2="${oy}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<line x1="${ox}" y1="${y0}" x2="${ox}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<circle cx="${ox}" cy="${oy}" r="${scale}" stroke="${ink.secondary}" stroke-width="1.2" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(negPts)}" stroke="${ink.primary}" stroke-width="1.1" stroke-opacity="0.4" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(posPts)}" stroke="${ink.primary}" stroke-width="2.2"/>`
        + arrowPoly(m1[0], m1[1], dirAng, 5.2, ink.primary)
        + `<line x1="${ox}" y1="${oy}" x2="${f1(xMap(pmRe))}" y2="${f1(yMap(pmIm))}" stroke="${ink.secondary}" stroke-width="1.2" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xMap(-1))}" y1="${oy}" x2="${f1(xMap(gmRe))}" y2="${oy}" stroke="${ink.opposite}" stroke-width="2.2"/>`
        + `<circle cx="${f1(xMap(pmRe))}" cy="${f1(yMap(pmIm))}" r="3.1" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="0.9"/>`
        + `<circle cx="${f1(xMap(-1))}" cy="${oy}" r="3.6" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="1"/>`
        + txt(xMap(-1) - 6, oy - 6, '(-1, j0)', { size: 6.7, weight: 700, fill: ink.opposite, anchor: 'end' })
        + txt(xMap(pmRe) - 6, yMap(pmIm) + 10, 'PM=43°', { size: 6.7, weight: 700, fill: ink.secondary, anchor: 'end' })
        + txt((xMap(-1) + xMap(gmRe)) / 2, oy + 12, 'GM', { size: 6.5, weight: 700, fill: ink.opposite, anchor: 'middle' }),
    };
  },

  wind_rose_polar: (ink: ResolvedInk) => {
    const cx = 132, cy = 128, maxR = 66;
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const tierData: readonly [number, number, number, number][] = [
      [2.6, 4.4, 5.2, 3.0], // N (15.2%)
      [2.1, 2.8, 2.2, 0.9], // NNE
      [1.8, 2.2, 1.5, 0.5], // NE
      [1.4, 1.8, 1.0, 0.3], // ENE
      [1.5, 2.1, 1.2, 0.4], // E
      [1.9, 2.8, 2.1, 0.8], // ESE
      [2.4, 3.6, 3.8, 1.8], // SE (11.6%)
      [1.8, 2.4, 1.9, 0.6], // SSE
      [1.6, 2.0, 1.3, 0.4], // S
      [1.2, 1.5, 0.9, 0.2], // SSW
      [1.1, 1.4, 0.8, 0.2], // SW
      [1.3, 1.7, 1.1, 0.3], // WSW
      [1.6, 2.1, 1.6, 0.5], // W
      [2.0, 2.9, 2.4, 0.9], // WNW
      [2.5, 3.8, 4.5, 2.6], // NW (13.4%)
      [2.8, 4.8, 6.2, 4.4], // NNW (18.2%)
    ];
    const tierColors = [mixHex(ink.secondary, ink.surface, 0.45), ink.secondary, ink.primary, ink.opposite];
    const tierLabels = ['< 2 m/s 静微风', '2–5 m/s 轻传输', '5–8 m/s 中传输', '> 8 m/s 强扩散'];
    const rMaxFreq = 20;
    const rings = [5, 10, 15, 20].map(f => {
      const r = (f / rMaxFreq) * maxR;
      const [lx, ly] = polarXY(cx, cy, r, 67.5);
      return `<circle cx="${cx}" cy="${cy}" r="${f1(r)}" stroke="${ink.grid}" stroke-width="0.75" stroke-dasharray="2.5 2"/>`
        + txt(lx + 1, ly - 1, `${f}%`, { size: 6.0, fill: ink.lightMuted });
    }).join('');
    const spokes = dirs.map((d, i) => {
      const deg = i * 22.5;
      const [px, py] = polarXY(cx, cy, maxR, deg);
      const [lx, ly] = polarXY(cx, cy, maxR + 10, deg);
      const isMajor = i % 2 === 0;
      const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
      return `<line x1="${cx}" y1="${cy}" x2="${f1(px)}" y2="${f1(py)}" stroke="${ink.grid}" stroke-width="0.6"/>`
        + (isMajor ? txt(lx, ly + 2.5, d, { size: i % 4 === 0 ? 7.4 : 6.6, weight: i % 4 === 0 ? 700 : 500, fill: i % 4 === 0 ? ink.text : ink.muted, anchor }) : '');
    }).join('');
    const petals = tierData.map((tiers, i) => {
      const deg = i * 22.5;
      const a0 = deg - 9.0, a1 = deg + 9.0;
      let acc = 0;
      return tiers.map((val, tIdx) => {
        const rIn = (acc / rMaxFreq) * maxR;
        acc += val;
        const rOut = (acc / rMaxFreq) * maxR;
        return `<path d="${arcPath(cx, cy, Math.max(4, rIn), rOut, a0, a1)}" fill="${tierColors[tIdx]}" fill-opacity="0.86" stroke="${ink.surface}" stroke-width="0.6"/>`;
      }).join('');
    }).join('');
    const legCard = `<rect x="234" y="54" width="114" height="142" rx="5" fill="${ink.surface}" stroke="${ink.border}" stroke-width="0.9"/>`
      + txt(244, 70, '风速 / 传输强度分档', { size: 7.2, weight: 700, fill: ink.text })
      + tierLabels.map((lbl, idx) => {
        const ry = 86 + idx * 17;
        return `<rect x="244" y="${ry - 6.5}" width="9" height="8" rx="1.5" fill="${tierColors[idx]}"/>`
          + txt(258, ry, lbl, { size: 6.8, fill: ink.text });
      }).join('')
      + `<line x1="244" y1="152" x2="338" y2="152" stroke="${ink.grid}" stroke-width="0.7"/>`
      + txt(244, 165, '主导方位: NNW (18.2%)', { size: 6.6, weight: 700, fill: ink.primary })
      + txt(244, 177, '次主导: SE 山谷道 (11.6%)', { size: 6.5, fill: ink.secondary })
      + txt(244, 189, '强传输 >8m/s: 14.6%', { size: 6.5, fill: ink.opposite });
    return {
      title: '16 方位气象风玫瑰与传输分层',
      badge: '主导 NNW 18.2% · 静风 6.4%',
      body: rings + spokes + petals
        + `<circle cx="${cx}" cy="${cy}" r="4" fill="${ink.canvas}" stroke="${ink.axis}" stroke-width="0.8"/>`
        + legCard,
    };
  },

  swimmer_clinical_lane: (ink: ResolvedInk) => {
    const lanes = [
      { id: 'S01', arm: 1, len: 22.5, pr: 4.0, cr: 9.2, ongoing: true },
      { id: 'S02', arm: 1, len: 21.0, pr: 3.4, cr: 11.2, ongoing: true },
      { id: 'S03', arm: 2, len: 18.8, pr: 5.2, cr: null, ongoing: false },
      { id: 'S04', arm: 1, len: 17.2, pr: 4.6, cr: null, ongoing: true },
      { id: 'S05', arm: 2, len: 15.2, pr: 5.8, cr: 12.0, ongoing: true },
      { id: 'S06', arm: 1, len: 12.8, pr: 3.6, cr: null, ongoing: false },
      { id: 'S07', arm: 2, len: 10.2, pr: null, cr: null, ongoing: false },
      { id: 'S08', arm: 2, len: 7.8, pr: 4.2, cr: null, ongoing: false },
    ] as const;
    const x0 = 54, y0 = 48, x1 = 336, y1 = 192;
    const xMap = (m: number) => x0 + (m / 24) * (x1 - x0);
    const xTicks = [0, 6, 12, 18, 24].map(m => ({ pos: xMap(m), label: `${m}月` }));
    const rowH = (y1 - y0) / lanes.length;
    const bars = lanes.map((ln, i) => {
      const cy = y0 + (i + 0.5) * rowH;
      const xe = xMap(ln.len), col = ln.arm === 1 ? ink.primary : ink.secondary;
      const respSvg = ln.pr !== null
        ? `<rect x="${f1(xMap(ln.pr))}" y="${f1(cy - 3.6)}" width="${f1(xe - xMap(ln.pr))}" height="7.2" rx="1.2" fill="${col}" fill-opacity="0.88"/>`
          + `<circle cx="${f1(xMap(ln.pr))}" cy="${f1(cy)}" r="3.1" fill="${ink.surface}" stroke="${col}" stroke-width="1.5"/>`
        : '';
      const crSvg = ln.cr !== null
        ? `<polygon points="${f1(xMap(ln.cr))},${f1(cy - 4)} ${f1(xMap(ln.cr) + 4)},${f1(cy)} ${f1(xMap(ln.cr))},${f1(cy + 4)} ${f1(xMap(ln.cr) - 4)},${f1(cy)}" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.8"/>`
        : '';
      const endSvg = ln.ongoing
        ? arrowPoly(xe + 6, cy, 0, 5.5, col)
        : `<path d="M ${f1(xe - 2.6)} ${f1(cy - 2.6)} L ${f1(xe + 2.6)} ${f1(cy + 2.6)} M ${f1(xe - 2.6)} ${f1(cy + 2.6)} L ${f1(xe + 2.6)} ${f1(cy - 2.6)}" stroke="${ink.opposite}" stroke-width="1.4"/>`;
      return txt(x0 - 5, cy + 2.4, ln.id, { size: 6.9, weight: 600, fill: ink.text, anchor: 'end' })
        + `<rect x="${x0}" y="${f1(cy - 4.5)}" width="${f1(xe - x0)}" height="9" rx="2" fill="${col}" fill-opacity="0.32" stroke="${col}" stroke-width="0.8"/>`
        + respSvg + crSvg + endSvg;
    }).join('');
    return {
      title: '受试个体纵向随访泳道图 (Swimmer)',
      badge: 'n=8 典型轨迹 · ORR=75.0%',
      body: legendChips([
        { label: '干预组', color: ink.primary, kind: 'box' },
        { label: '对照组', color: ink.secondary, kind: 'box' },
        { label: 'PR起效', color: ink.primary, kind: 'dot' },
        { label: 'CR达标 / 删失→', color: ink.opposite, kind: 'dot' },
      ], 54, 39, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: '随访观察月数 (横线=总随访期, 深色段=持续响应窗)' }, ink)
        + `<line x1="${f1(xMap(12))}" y1="${y0}" x2="${f1(xMap(12))}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.95" stroke-dasharray="3.5 2"/>`
        + bars,
    };
  },

  bullwhip_echelon_var: (ink: ResolvedInk) => {
    const lx0 = 42, ly0 = 48, lx1 = 222, ly1 = 192;
    const ts = Array.from({ length: 20 }, (_, i) => i + 1);
    const lxMap = (t: number) => lx0 + ((t - 1) / 19) * (lx1 - lx0);
    const lyMap = (v: number) => ly1 - ((v - 55) / 95) * (ly1 - ly0);
    const dArr = ts.map(t => 100 + 5 * Math.sin(t * 0.65));
    const rArr = ts.map(t => 100 + 12 * Math.sin(t * 0.65 - 0.35));
    const wArr = ts.map(t => 100 + 22 * Math.sin(t * 0.65 - 0.72));
    const fArr = ts.map(t => 100 + 36 * Math.sin(t * 0.65 - 1.08));
    const toPts = (arr: readonly number[]): [number, number][] => arr.map((v, i) => [lxMap(ts[i]), lyMap(v)]);
    const lxTicks = [1, 5, 10, 15, 20].map(t => ({ pos: lxMap(t), label: `W${t}` }));
    const lyTicks = [60, 80, 100, 120, 140].map(v => ({ pos: lyMap(v), label: String(v) }));

    const rx0 = 262, ry0 = 48, rx1 = 342, ry1 = 192;
    const bwe = [
      ['终端 D', 1.00, ink.axis],
      ['零售 R', 1.48, ink.secondary],
      ['分销 W', 2.34, ink.accent4],
      ['制造 F', 3.86, ink.opposite],
    ] as const;
    const rxMap = (r: number) => rx0 + (r / 4.8) * (rx1 - rx0);
    const rxTicks = [0, 1, 2, 3, 4].map(v => ({ pos: rxMap(v), label: `${v}×` }));
    const rowH = (ry1 - ry0) / bwe.length;
    return {
      title: '多级供应链“牛鞭效应”方差放大',
      badge: 'BWE 放大比 = 3.86×',
      body: legendChips([
        { label: '终端 D', color: ink.axis, kind: 'dash' },
        { label: '零售 R', color: ink.secondary, kind: 'line' },
        { label: '分销 W', color: ink.accent4, kind: 'line' },
        { label: '制造 F', color: ink.opposite, kind: 'line' },
      ], 42, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, box: true, yTicks: lyTicks, xTicks: lxTicks, yTitle: '周订货量 (件)', xTitle: '供应链周次波动演化' }, ink)
        + `<path d="${smoothCurvePath(toPts(fArr))}" stroke="${ink.opposite}" stroke-width="1.9"/>`
        + `<path d="${smoothCurvePath(toPts(wArr))}" stroke="${ink.accent4}" stroke-width="1.6"/>`
        + `<path d="${smoothCurvePath(toPts(rArr))}" stroke="${ink.secondary}" stroke-width="1.5"/>`
        + `<path d="${smoothCurvePath(toPts(dArr))}" stroke="${ink.axis}" stroke-width="1.3" stroke-dasharray="3 2"/>`
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, box: true, xTicks: rxTicks, vGrid: true, hGrid: false, xTitle: '方差放大比 Var(O)/Var(D)' }, ink)
        + `<line x1="${f1(rxMap(1))}" y1="${ry0}" x2="${f1(rxMap(1))}" y2="${ry1}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + bwe.map(([lbl, ratio, col], i) => {
          const cy = ry0 + (i + 0.5) * rowH, bw = rxMap(ratio) - rx0;
          return txt(rx0 - 4, cy + 2.4, lbl, { size: 6.7, weight: 600, fill: ink.text, anchor: 'end' })
            + `<rect x="${rx0}" y="${f1(cy - 7)}" width="${f1(bw)}" height="14" rx="2" fill="${col}" fill-opacity="0.78"/>`
            + txt(rx0 + bw + 3, cy + 2.4, `${ratio.toFixed(2)}×`, { size: 6.5, weight: 700, fill: col });
        }).join(''),
    };
  },

  gantt_critical_path: (ink: ResolvedInk) => {
    const tasks = [
      { id: 'A 抽样框编制', es: 0, ef: 2, lf: 2, crit: true },
      { id: 'B 问卷初稿设计', es: 0, ef: 2, lf: 3, crit: false },
      { id: 'C 预调研与净化', es: 2, ef: 5, lf: 5, crit: true },
      { id: 'D 访员分层培训', es: 3, ef: 5, lf: 7, crit: false },
      { id: 'E 正式入户采集', es: 5, ef: 8, lf: 8, crit: true },
      { id: 'F 四阶清洗加权', es: 8, ef: 10, lf: 10, crit: true },
      { id: 'G 建模复核定稿', es: 10, ef: 12, lf: 12, crit: true },
    ] as const;
    const x0 = 84, y0 = 48, x1 = 306, y1 = 192;
    const xMap = (w: number) => x0 + (w / 12) * (x1 - x0);
    const xTicks = [0, 2, 4, 6, 8, 10, 12].map(w => ({ pos: xMap(w), label: `W${w}` }));
    const rowH = (y1 - y0) / tasks.length;
    const rowCy = (idx: number) => y0 + (idx + 0.5) * rowH;
    const deps: [number, number][] = [[0, 2], [1, 2], [2, 4], [3, 4], [4, 5], [5, 6]];
    const depSvg = deps.map(([src, dst]) => {
      const xs = xMap(tasks[src].ef), ys = rowCy(src);
      const xd = xMap(tasks[dst].es), yd = rowCy(dst);
      const midX = Math.max(xs, xd - 4);
      const pts: [number, number][] = xs < xd
        ? [[xs, ys], [midX, ys], [midX, yd], [xd - 1, yd]]
        : [[xs, ys], [xs, yd]];
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      const ang = (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180) / Math.PI;
      return `<polyline points="${polyStr(pts)}" stroke="${ink.axis}" stroke-width="0.9"/>`
        + arrowPoly(last[0], last[1], ang, 4, ink.axis);
    }).join('');
    const barsSvg = tasks.map((t, i) => {
      const cy = rowCy(i), xs = xMap(t.es), xe = xMap(t.ef), xf = xMap(t.lf);
      const col = t.crit ? ink.primary : ink.secondary;
      const slack = t.lf - t.ef;
      const slackSvg = slack > 0
        ? `<rect x="${f1(xe)}" y="${f1(cy - 4.5)}" width="${f1(xf - xe)}" height="9" rx="1.5" fill="${ink.secondarySoft}" fill-opacity="0.45" stroke="${ink.secondary}" stroke-width="0.8" stroke-dasharray="2.5 1.5"/>`
        : '';
      const milestone = i === tasks.length - 1
        ? `<polygon points="${f1(xe)},${f1(cy - 5)} ${f1(xe + 5)},${f1(cy)} ${f1(xe)},${f1(cy + 5)} ${f1(xe - 5)},${f1(cy)}" fill="${ink.opposite}"/>`
        : '';
      const floatLbl = slack === 0 ? 'Float=0' : `+${slack}周`;
      return txt(x0 - 4, cy + 2.4, t.id, { size: 6.7, weight: t.crit ? 700 : 500, fill: ink.text, anchor: 'end' })
        + slackSvg
        + `<rect x="${f1(xs)}" y="${f1(cy - 5.5)}" width="${f1(xe - xs)}" height="11" rx="2" fill="${col}" fill-opacity="${t.crit ? 0.86 : 0.6}" stroke="${col}" stroke-width="0.9"/>`
        + milestone
        + txt(x1 + 6, cy + 2.4, floatLbl, { size: 6.4, weight: t.crit ? 700 : 500, fill: t.crit ? ink.opposite : ink.muted });
    }).join('');
    return {
      title: '关键路径法 CPM 调研与工程甘特图',
      badge: '总工期 12周 · 关键链 A-C-E-F-G',
      body: legendChips([
        { label: '关键路径', color: ink.primary, kind: 'box' },
        { label: '非关键工序', color: ink.secondary, kind: 'box' },
        { label: '总时差缓冲', color: ink.secondarySoft, kind: 'box' },
        { label: '交付里程碑', color: ink.opposite, kind: 'dot' },
      ], 46, 39, ink)
        + axesFrame({ x0, y0, x1, y1, xTicks, vGrid: true, hGrid: false, xTitle: 'CPM 实施周次 (ES/EF 实心条 + Total Float 虚线缓冲)' }, ink)
        + depSvg + barsSvg,
    };
  },

  bloch_quantum_fidelity: (ink: ResolvedInk) => {
    const x0 = 44, y0 = 48, x1 = 224, y1 = 192;
    const xMap = (m: number) => x0 + (m / 120) * (x1 - x0);
    const yMap = (f: number) => y1 - ((f - 0.5) / 0.52) * (y1 - y0);
    const xTicks = [0, 30, 60, 90, 120].map(m => ({ pos: xMap(m), label: String(m) }));
    const yTicks = [0.5, 0.65, 0.8, 0.95, 1.0].map(v => ({ pos: yMap(v), label: v.toFixed(2) }));
    const ms = [0, 15, 30, 45, 60, 75, 90, 105, 120];
    const rb = (p: number) => ms.map(m => [xMap(m), yMap(0.5 + 0.49 * Math.pow(p, m))] as [number, number]);
    const p1q = rb(0.9984), pDd = rb(0.992), p2q = rb(0.984);
    const errBars = [30, 60, 90].map(m => {
      const f2 = 0.5 + 0.49 * Math.pow(0.984, m);
      const fdd = 0.5 + 0.49 * Math.pow(0.992, m);
      return errV(xMap(m), yMap(f2 + 0.018), yMap(f2 - 0.018), ink.opposite, 2.5)
        + errV(xMap(m), yMap(fdd + 0.014), yMap(fdd - 0.014), ink.secondary, 2.5);
    }).join('');

    const cx = 290, cy = 114, r = 38;
    const traj: [number, number][] = [
      [cx + 26, cy - 18], [cx + 28, cy + 4], [cx + 12, cy + 16], [cx - 10, cy + 10], [cx - 8, cy - 6], [cx + 2, cy - 14],
    ];
    return {
      title: '量子门保真度与退相干衰减曲线',
      badge: 'F1q=99.92% · F2q=99.18%',
      body: legendChips([
        { label: '单门 RB (99.92%)', color: ink.primary, kind: 'line' },
        { label: 'DD 解耦保护', color: ink.secondary, kind: 'line' },
        { label: '双门 CZ (99.18%)', color: ink.opposite, kind: 'line' },
      ], 42, 39, ink)
        + axesFrame({ x0, y0, x1, y1, box: true, yTicks, xTicks, yTitle: '序列保真度 F(m)', xTitle: 'Clifford 门深度 m' }, ink)
        + `<line x1="${x0}" y1="${f1(yMap(0.5))}" x2="${x1}" y2="${f1(yMap(0.5))}" stroke="${ink.lightMuted}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<path d="${smoothCurvePath(p2q)}" stroke="${ink.opposite}" stroke-width="1.9"/>`
        + `<path d="${smoothCurvePath(pDd)}" stroke="${ink.secondary}" stroke-width="1.9"/>`
        + `<path d="${smoothCurvePath(p1q)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + errBars
        + txt(x1 - 4, yMap(0.5) - 4, '完全混合态 0.50', { size: 6.2, fill: ink.muted, anchor: 'end' })
        + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink.surface}" fill-opacity="0.7" stroke="${ink.axis}" stroke-width="1.1"/>`
        + `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="11" stroke="${ink.grid}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`
        + `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${ink.grid}" stroke-width="0.9"/>`
        + `<line x1="${cx - r * 0.72}" y1="${cy + 9}" x2="${cx + r * 0.72}" y2="${cy - 9}" stroke="${ink.grid}" stroke-width="0.9"/>`
        + `<path d="${smoothCurvePath(traj)}" stroke="${ink.opposite}" stroke-width="1.5"/>`
        + `<line x1="${cx}" y1="${cy}" x2="${traj[0][0]}" y2="${traj[0][1]}" stroke="${ink.primary}" stroke-width="1.8"/>`
        + arrowPoly(traj[0][0], traj[0][1], (Math.atan2(traj[0][1] - cy, traj[0][0] - cx) * 180) / Math.PI, 4.5, ink.primary)
        + `<circle cx="${traj[traj.length - 1][0]}" cy="${traj[traj.length - 1][1]}" r="2.6" fill="${ink.opposite}"/>`
        + txt(cx, cy - r - 4, '|0⟩', { size: 7, weight: 700, fill: ink.axis, anchor: 'middle' })
        + txt(cx, cy + r + 9, '|1⟩', { size: 7, weight: 700, fill: ink.axis, anchor: 'middle' })
        + txt(cx + r + 4, cy + 3, '|+⟩', { size: 6.6, fill: ink.muted })
        + `<rect x="242" y="168" width="102" height="32" rx="4" fill="${ink.surface}" stroke="${ink.border}" stroke-width="0.8"/>`
        + txt(293, 181, 'T1 = 84 μs · T2 = 62 μs', { size: 6.5, weight: 700, fill: ink.primary, anchor: 'middle' })
        + txt(293, 193, '单门错误 EPC = 0.08%', { size: 6.4, fill: ink.opposite, anchor: 'middle' }),
    };
  },

  spatial_lisa_quadrant: (ink: ResolvedInk) => {
    const colMap = {
      HH: ink.primary,
      LL: ink.secondary,
      HL: ink.opposite,
      LH: ink.accent4,
      NS: '#CBD5E1',
    } as const;
    const x0 = 42, y0 = 50, x1 = 174, y1 = 190;
    const xMap = (z: number) => x0 + ((z + 2) / 4) * (x1 - x0);
    const yMap = (wz: number) => y1 - ((wz + 2) / 4) * (y1 - y0);
    const xTicks = [-2, 0, 2].map(v => ({ pos: xMap(v), label: String(v) }));
    const yTicks = [-2, 0, 2].map(v => ({ pos: yMap(v), label: String(v) }));
    const pts: [number, number, keyof typeof colMap][] = [
      [0.9, 0.7, 'HH'], [1.3, 1.0, 'HH'], [1.5, 1.2, 'HH'], [0.7, 0.9, 'HH'], [1.1, 0.5, 'HH'],
      [-1.0, -0.8, 'LL'], [-1.4, -1.1, 'LL'], [-0.8, -1.2, 'LL'], [-1.6, -0.9, 'LL'],
      [0.9, -0.6, 'HL'], [-0.7, 0.8, 'LH'],
      [0.3, 0.2, 'NS'], [-0.2, 0.3, 'NS'], [0.4, -0.2, 'NS'], [-0.3, -0.3, 'NS'], [0.2, -0.4, 'NS'],
    ];
    const tiles: { pts: [number, number][]; cls: keyof typeof colMap; lbl: string }[] = [
      { pts: [[194, 54], [234, 52], [236, 94], [196, 96]], cls: 'LL', lbl: 'L-L' },
      { pts: [[236, 52], [288, 50], [286, 92], [238, 94]], cls: 'NS', lbl: 'n.s.' },
      { pts: [[290, 50], [342, 52], [338, 92], [288, 92]], cls: 'LH', lbl: 'L-H' },
      { pts: [[196, 98], [238, 96], [240, 140], [194, 142]], cls: 'LL', lbl: 'L-L' },
      { pts: [[240, 96], [288, 94], [288, 138], [242, 140]], cls: 'HL', lbl: 'H-L' },
      { pts: [[290, 94], [340, 94], [342, 140], [290, 138]], cls: 'HH', lbl: 'H-H' },
      { pts: [[194, 144], [242, 142], [244, 184], [198, 186]], cls: 'NS', lbl: 'n.s.' },
      { pts: [[244, 142], [290, 140], [292, 184], [246, 184]], cls: 'HH', lbl: 'H-H' },
      { pts: [[292, 140], [342, 142], [338, 184], [294, 184]], cls: 'HH', lbl: 'H-H' },
    ];
    return {
      title: '空间自相关 Moran 散点与 LISA 聚类',
      badge: "Moran's I=0.436*** · 999次置换",
      body: legendChips([
        { label: 'H-H 高高', color: colMap.HH, kind: 'box' },
        { label: 'L-L 低低', color: colMap.LL, kind: 'box' },
        { label: 'H-L 高低', color: colMap.HL, kind: 'box' },
        { label: 'L-H 低高', color: colMap.LH, kind: 'box' },
        { label: '不显著', color: colMap.NS, kind: 'box' },
      ], 42, 39, ink)
        + axesFrame({ x0, y0, x1, y1, box: true, yTicks, xTicks, yTitle: '空间滞后 Wz', xTitle: '标准化变量 z' }, ink)
        + `<line x1="${f1(xMap(0))}" y1="${y0}" x2="${f1(xMap(0))}" y2="${y1}" stroke="${ink.axis}" stroke-width="0.85" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${f1(yMap(0))}" x2="${x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.85" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xMap(-1.8))}" y1="${f1(yMap(-0.95))}" x2="${f1(xMap(1.8))}" y2="${f1(yMap(0.95))}" stroke="${ink.primary}" stroke-width="1.6"/>`
        + pts.map(([z, wz, cls]) => `<circle cx="${f1(xMap(z))}" cy="${f1(yMap(wz))}" r="${cls === 'NS' ? 2.2 : 3.0}" fill="${colMap[cls]}" fill-opacity="${cls === 'NS' ? 0.65 : 0.88}"/>`).join('')
        + txt(x1 - 4, y0 + 10, 'H-H', { size: 6.4, weight: 700, fill: colMap.HH, anchor: 'end' })
        + txt(x0 + 4, y1 - 5, 'L-L', { size: 6.4, weight: 700, fill: colMap.LL })
        + tiles.map(t => {
          const cx = t.pts.reduce((s, p) => s + p[0], 0) / t.pts.length;
          const cy = t.pts.reduce((s, p) => s + p[1], 0) / t.pts.length;
          return `<polygon points="${polyStr(t.pts)}" fill="${colMap[t.cls]}" fill-opacity="${t.cls === 'NS' ? 0.65 : 0.86}" stroke="${ink.canvas}" stroke-width="1.4"/>`
            + txt(cx, cy + 2.5, t.lbl, { size: 6.8, weight: 700, fill: t.cls === 'NS' ? ink.muted : '#FFFFFF', anchor: 'middle' });
        }).join('')
        + txt(268, 202, '局部 LISA 显著集聚区划 (p < 0.05)', { size: 7.0, weight: 600, fill: ink.axis, anchor: 'middle' }),
    };
  },

  garch_volatility_cone: (ink: ResolvedInk) => {
    const lx0 = 42, ly0 = 48, lx1 = 208, ly1 = 192;
    const rx0 = 246, ry0 = 48, rx1 = 344, ry1 = 192;
    const nT = 36;
    const sigmas = Array.from({ length: nT }, (_, i) => {
      const spike = Math.exp(-0.5 * (((i - 18) / 4.2) ** 2)) * 2.1;
      const tail = Math.exp(-0.5 * (((i - 30) / 3.0) ** 2)) * 1.1;
      return 1.15 + spike + tail;
    });
    const rets = sigmas.map((s, i) => {
      if (i === 17) return -2.25 * s;
      if (i === 29) return 2.15 * s;
      return Math.sin(i * 1.85) * 0.78 * s + Math.cos(i * 2.7) * 0.35 * s;
    });
    const lxMap = (i: number) => lx0 + (i / (nT - 1)) * (lx1 - lx0);
    const lyMap = (v: number) => ly1 - ((v + 8.5) / 17.0) * (ly1 - ly0);
    const lxTicks = [0, 12, 24, 35].map(i => ({ pos: lxMap(i), label: `T${i * 3}` }));
    const lyTicks = [-6, 0, 6].map(v => ({ pos: lyMap(v), label: `${v}%` }));
    const hi99 = sigmas.map((s, i) => [lxMap(i), lyMap(2.58 * s)] as [number, number]);
    const lo99 = sigmas.map((s, i) => [lxMap(i), lyMap(-2.58 * s)] as [number, number]);
    const hi95 = sigmas.map((s, i) => [lxMap(i), lyMap(1.96 * s)] as [number, number]);
    const lo95 = sigmas.map((s, i) => [lxMap(i), lyMap(-1.96 * s)] as [number, number]);
    const retPts = rets.map((r, i) => [lxMap(i), lyMap(r)] as [number, number]);

    const horizons = ['5D', '20D', '60D', '120D'];
    const rxTicks = evenlySpacedTicks(rx0 + 12, rx1 - 12, horizons);
    const ryMap = (v: number) => ry1 - ((v - 8) / 36) * (ry1 - ry0);
    const ryTicks = [10, 20, 30, 40].map(v => ({ pos: ryMap(v), label: `${v}%` }));
    const maxC = [38, 34, 30, 27], q75 = [30, 27, 24, 22], medC = [23, 21, 19, 18], q25 = [17, 16, 15, 14], minC = [12, 11.5, 11, 10.5];
    const curG = [32, 26, 22, 19.5];
    const toR = (arr: readonly number[]) => rxTicks.map((t, i) => [t.pos, ryMap(arr[i])] as [number, number]);
    return {
      title: 'GARCH(1,1) 动态波动率 VaR 与期限锥',
      badge: 'α+β=0.954 · VaR 突破 4.2%',
      body: legendChips([
        { label: '日度收益率 r_t', color: ink.secondary, kind: 'line' },
        { label: '±1.96σ / 2.58σ VaR带', color: ink.primary, kind: 'box' },
        { label: '当前期限锥 σ(h)', color: ink.opposite, kind: 'line' },
      ], 42, 39, ink)
        + axesFrame({ x0: lx0, y0: ly0, x1: lx1, y1: ly1, yTicks: lyTicks, xTicks: lxTicks, box: true, yTitle: '收益率 / VaR (%)', xTitle: '交易日序列 (动态条件异方差)' }, ink)
        + bandPolygon(hi99, lo99, ink.primary, 0.11)
        + bandPolygon(hi95, lo95, ink.primary, 0.18)
        + `<line x1="${lx0}" y1="${f1(lyMap(0))}" x2="${lx1}" y2="${f1(lyMap(0))}" stroke="${ink.axis}" stroke-width="0.7" stroke-dasharray="2.5 2"/>`
        + `<polyline points="${polyStr(hi95)}" stroke="${ink.primary}" stroke-width="1.1"/>`
        + `<polyline points="${polyStr(lo95)}" stroke="${ink.primary}" stroke-width="1.1"/>`
        + `<polyline points="${polyStr(retPts)}" stroke="${ink.secondary}" stroke-width="1.1"/>`
        + `<circle cx="${f1(retPts[17][0])}" cy="${f1(retPts[17][1])}" r="3.2" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.8"/>`
        + `<circle cx="${f1(retPts[29][0])}" cy="${f1(retPts[29][1])}" r="3.2" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.8"/>`
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, yTicks: ryTicks, xTicks: rxTicks, box: true, xTitle: '年化波动率期限锥' }, ink)
        + bandPolygon(toR(maxC), toR(minC), ink.lightMuted, 0.25)
        + bandPolygon(toR(q75), toR(q25), ink.secondary, 0.22)
        + `<polyline points="${polyStr(toR(medC))}" stroke="${ink.axis}" stroke-width="1.1" stroke-dasharray="3 2"/>`
        + `<polyline points="${polyStr(toR(curG))}" stroke="${ink.opposite}" stroke-width="2.0"/>`
        + toR(curG).map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.6" fill="${ink.opposite}"/>`).join(''),
    };
  },

  spatial_geary_correlogram: (ink: ResolvedInk) => {
    const x0 = 48, x1 = 336, ty0 = 46, ty1 = 114, by0 = 126, by1 = 192;
    const dists = [20, 40, 60, 80, 100, 120];
    const xMap = (d: number) => x0 + 16 + ((d - 20) / 100) * (x1 - x0 - 32);
    const xTicks = dists.map(d => ({ pos: xMap(d), label: `${d}km` }));
    const iyMap = (v: number) => ty1 - ((v + 0.15) / 0.85) * (ty1 - ty0);
    const cyMap = (v: number) => by1 - ((v - 0.30) / 0.90) * (by1 - by0);
    const iyTicks = [0.0, 0.3, 0.6].map(v => ({ pos: iyMap(v), label: v.toFixed(1) }));
    const cyTicks = [0.4, 0.8, 1.0].map(v => ({ pos: cyMap(v), label: v.toFixed(1) }));
    const morans = [0.58, 0.42, 0.24, 0.08, -0.02, -0.06];
    const gearys = [0.42, 0.59, 0.78, 0.94, 1.03, 1.07];
    const mPts = dists.map((d, i) => [xMap(d), iyMap(morans[i])] as [number, number]);
    const gPts = dists.map((d, i) => [xMap(d), cyMap(gearys[i])] as [number, number]);
    const mTop = dists.map(d => [xMap(d), iyMap(0.09)] as [number, number]);
    const mBot = dists.map(d => [xMap(d), iyMap(-0.09)] as [number, number]);
    const gTop = dists.map(d => [xMap(d), cyMap(1.10)] as [number, number]);
    const gBot = dists.map(d => [xMap(d), cyMap(0.90)] as [number, number]);
    const xCrit = xMap(60);
    return {
      title: "空间 Geary's C 与 Moran's I 距离衰减图",
      badge: '溢出临界半径 d*=60 km',
      body: legendChips([
        { label: "Moran's I (正>0)", color: ink.primary, kind: 'line' },
        { label: "Geary's C (正<1)", color: ink.secondary, kind: 'line' },
        { label: '95% 随机置换带', color: ink.lightMuted, kind: 'box' },
      ], 48, 39, ink)
        + axesFrame({ x0, y0: ty0, x1, y1: ty1, yTicks: iyTicks, xTicks: [], box: true, yTitle: "Moran's I" }, ink)
        + axesFrame({ x0, y0: by0, x1, y1: by1, yTicks: cyTicks, xTicks, box: true, yTitle: "Geary's C", xTitle: '空间距离滞后带宽 d (km)' }, ink)
        + bandPolygon(mTop, mBot, ink.lightMuted, 0.28)
        + bandPolygon(gTop, gBot, ink.lightMuted, 0.28)
        + `<line x1="${x0}" y1="${f1(iyMap(0))}" x2="${x1}" y2="${f1(iyMap(0))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${f1(cyMap(1.0))}" x2="${x1}" y2="${f1(cyMap(1.0))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xCrit)}" y1="${ty0}" x2="${f1(xCrit)}" y2="${by1}" stroke="${ink.opposite}" stroke-width="1.1" stroke-dasharray="3.5 2"/>`
        + `<path d="${smoothCurvePath(mPts)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + mPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i < 3 ? 3.2 : 2.5}" fill="${i < 3 ? ink.primary : ink.surface}" stroke="${ink.primary}" stroke-width="1.3"/>`).join('')
        + `<path d="${smoothCurvePath(gPts)}" stroke="${ink.secondary}" stroke-width="2.0"/>`
        + gPts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i < 3 ? 3.2 : 2.5}" fill="${i < 3 ? ink.secondary : ink.surface}" stroke="${ink.secondary}" stroke-width="1.3"/>`).join('')
        + txt(xCrit + 5, ty0 + 11, '有效溢出半径 d*=60km (p<0.05)', { size: 6.4, weight: 700, fill: ink.opposite })
        + txt(x1 - 5, cyMap(1.0) - 4, '随机期望 C=1.0', { size: 6.1, fill: ink.muted, anchor: 'end' }),
    };
  },

  reliability_mtbf_weibull: (ink: ResolvedInk) => {
    const x0 = 48, y0 = 48, x1 = 338, y1 = 192;
    const xMin = Math.log(120), xMax = Math.log(3500);
    const yTransform = (f: number) => Math.log(-Math.log(1 - f));
    const yMin = yTransform(0.04), yMax = yTransform(0.95);
    const xMap = (t: number) => x0 + ((Math.log(t) - xMin) / (xMax - xMin)) * (x1 - x0);
    const yMap = (f: number) => y1 - ((yTransform(f) - yMin) / (yMax - yMin)) * (y1 - y0);
    const xTicks = [200, 500, 1000, 2000, 3000].map(t => ({ pos: xMap(t), label: `${t}h` }));
    const yTicks = [0.05, 0.10, 0.30, 0.632, 0.90].map(f => ({ pos: yMap(f), label: f === 0.632 ? '63.2%' : `${Math.round(f * 100)}%` }));
    const beta = 1.84, eta = 1420;
    const wCDF = (t: number) => 1 - Math.exp(-Math.pow(t / eta, beta));
    const ts = [180, 280, 420, 620, 880, 1180, 1520, 1950, 2450, 2950];
    const linePts: [number, number][] = ts.map(t => [xMap(t), yMap(wCDF(t))]);
    const ciBand = (t: number) => 0.32 + 0.14 * Math.abs(Math.log(t / eta));
    const topPts: [number, number][] = ts.map(t => [xMap(t), Math.max(y0 + 2, y1 - ((yTransform(wCDF(t)) + ciBand(t) - yMin) / (yMax - yMin)) * (y1 - y0))]);
    const botPts: [number, number][] = ts.map(t => [xMap(t), Math.min(y1 - 2, y1 - ((yTransform(wCDF(t)) - ciBand(t) - yMin) / (yMax - yMin)) * (y1 - y0))]);
    const empData: [number, number][] = [
      [255, 0.058], [395, 0.095], [510, 0.155], [685, 0.225], [820, 0.310], [990, 0.410],
      [1180, 0.495], [1390, 0.615], [1640, 0.725], [1980, 0.835], [2380, 0.905],
    ];
    const xEta = xMap(eta), yEta = yMap(0.632);
    const xB10 = xMap(418), yB10 = yMap(0.10);
    return {
      title: '威布尔双对数寿命分布与 MTBF 置信带',
      badge: 'β=1.84 · MTBF=1262h',
      body: legendChips([
        { label: 'Weibull 线性拟合', color: ink.primary, kind: 'line' },
        { label: '95% Fisher 置信带', color: ink.primary, kind: 'box' },
        { label: 'Bernard 中位秩', color: ink.secondary, kind: 'dot' },
      ], 48, 39, ink)
        + axesFrame({ x0, y0, x1, y1, yTicks, xTicks, box: true, yTitle: '累计失效率 F(t)', xTitle: '对数失效时长 t (小时, ln-ln 双对数概率坐标)' }, ink)
        + bandPolygon(topPts, botPts, ink.primary, 0.16)
        + `<line x1="${x0}" y1="${f1(yEta)}" x2="${f1(xEta)}" y2="${f1(yEta)}" stroke="${ink.opposite}" stroke-width="0.95" stroke-dasharray="3 2"/>`
        + `<line x1="${f1(xEta)}" y1="${f1(yEta)}" x2="${f1(xEta)}" y2="${y1}" stroke="${ink.opposite}" stroke-width="0.95" stroke-dasharray="3 2"/>`
        + `<line x1="${x0}" y1="${f1(yB10)}" x2="${f1(xB10)}" y2="${f1(yB10)}" stroke="${ink.secondary}" stroke-width="0.85" stroke-dasharray="2.5 2"/>`
        + `<line x1="${f1(xB10)}" y1="${f1(yB10)}" x2="${f1(xB10)}" y2="${y1}" stroke="${ink.secondary}" stroke-width="0.85" stroke-dasharray="2.5 2"/>`
        + `<polyline points="${polyStr(linePts)}" stroke="${ink.primary}" stroke-width="2.1"/>`
        + empData.map(([t, f]) => `<circle cx="${f1(xMap(t))}" cy="${f1(yMap(f))}" r="2.7" fill="${ink.secondary}" stroke="${ink.surface}" stroke-width="0.7"/>`).join('')
        + `<circle cx="${f1(xEta)}" cy="${f1(yEta)}" r="3.4" fill="${ink.opposite}" stroke="${ink.surface}" stroke-width="0.9"/>`
        + txt(xEta + 6, yEta + 10, 'η=1420h (63.2%)', { size: 6.4, weight: 700, fill: ink.opposite })
        + txt(xB10 + 5, yB10 - 4, 'B10=418h', { size: 6.3, weight: 600, fill: ink.secondary })
        + pill(x0 + 8, y0 + 8, 'β=1.84 (磨损递增) · MTBF=1262h [1148, 1389]', { bg: ink.surface, stroke: ink.primary, color: ink.primary, size: 6.2, h: 13.5 }),
    };
  },

  spatial_gwr_coef_surface: (ink: ResolvedInk) => {
    const gx0 = 38, gy0 = 54, cell = 22, cols = 6;
    const betas = [
      [0.14, 0.22, 0.36, 0.52, 0.64, 0.68],
      [0.12, 0.24, 0.42, 0.58, 0.66, 0.61],
      [0.08, 0.19, 0.34, 0.48, 0.54, 0.46],
      [0.05, 0.14, 0.24, 0.31, 0.35, 0.29],
      [0.04, 0.10, 0.16, 0.21, 0.24, 0.18],
    ];
    const sigGrid = [
      [false, false, true, true, true, true],
      [false, false, true, true, true, true],
      [false, false, false, true, true, true],
      [false, false, false, false, false, false],
      [false, false, false, false, false, false],
    ];
    const gridSvg = betas.map((row, r) =>
      row.map((v, c) => {
        const t = (v - 0.04) / 0.64;
        const fill = t < 0.33 ? mixHex(ink.oppositeSoft, ink.surface, t / 0.33) : mixHex(ink.primarySoft, ink.primary, (t - 0.33) / 0.67);
        const cx = gx0 + c * cell, cy = gy0 + r * cell;
        const isSig = sigGrid[r][c];
        return `<rect x="${cx}" y="${cy}" width="${cell - 0.8}" height="${cell - 0.8}" rx="1.5" fill="${fill}" stroke="${ink.surface}" stroke-width="0.6"/>`
          + (isSig ? `<circle cx="${f1(cx + cell / 2)}" cy="${f1(cy + cell / 2)}" r="2.0" fill="${ink.surface}" fill-opacity="0.9"/>` : '');
      }).join(''),
    ).join('');
    // Bold contour enclosing the |t| >= 1.96 significant cluster
    const sigBoundary = `M ${gx0 + 2 * cell} ${gy0} H ${gx0 + 6 * cell} V ${gy0 + 3 * cell} H ${gx0 + 3 * cell} V ${gy0 + 2 * cell} H ${gx0 + 2 * cell} Z`;
    const cbColors = [ink.primary, ink.primaryMid, ink.primarySoft, ink.secondarySoft, ink.oppositeSoft];

    const rx0 = 228, ry0 = 54, rx1 = 344, ry1 = 184;
    const xMap = (v: number) => rx0 + (v / 0.78) * (rx1 - rx0);
    const yMap = (d: number) => ry1 - (d / 3.4) * (ry1 - ry0);
    const rxTicks = [0.0, 0.3, 0.6].map(v => ({ pos: xMap(v), label: v.toFixed(1) }));
    const xs = Array.from({ length: 24 }, (_, i) => (i / 23) * 0.74);
    const kdeFn = (v: number) => 1.8 * Math.exp(-0.5 * (((v - 0.22) / 0.10) ** 2)) + 2.5 * Math.exp(-0.5 * (((v - 0.54) / 0.11) ** 2));
    const kdePts: [number, number][] = xs.map(v => [xMap(v), yMap(kdeFn(v))]);
    const sigXs = xs.filter(v => v >= 0.36);
    const sigPoly: [number, number][] = [[xMap(0.36), ry1], ...sigXs.map(v => [xMap(v), yMap(kdeFn(v))] as [number, number]), [xMap(sigXs[sigXs.length - 1]), ry1]];
    return {
      title: 'GWR 局域参数异质性与 t 显著区图',
      badge: 'AICc -42.6 · Local R²=0.78',
      body: legendChips([
        { label: '局部系数 β_i(u,v)', color: ink.primary, kind: 'box' },
        { label: '|t| >= 1.96 显著界', color: ink.text, kind: 'line' },
        { label: '全局 OLS 0.31', color: ink.opposite, kind: 'dash' },
      ], 38, 38, ink)
        + gridSvg
        + `<path d="${sigBoundary}" stroke="${ink.text}" stroke-width="1.6"/>`
        + txt(gx0 + 4 * cell, gy0 + 1.5 * cell + 2, '|t|>=1.96 显著簇', { size: 6.2, weight: 700, fill: '#FFFFFF', anchor: 'middle' })
        + colorbarV(gx0 + cols * cell + 5, gy0 + 6, 7, 94, cbColors, '0.04', '0.68', 'β_i', ink)
        + txt(gx0 + (cols * cell) / 2, 180, '自适应双平方核空间表面 (N=64)', { size: 6.5, weight: 600, fill: ink.axis, anchor: 'middle' })
        + txt(gx0 + (cols * cell) / 2, 193, '显著空间单元占比: 42.2%', { size: 6.3, fill: ink.primary, anchor: 'middle' })
        + axesFrame({ x0: rx0, y0: ry0, x1: rx1, y1: ry1, xTicks: rxTicks, box: true, hGrid: false, xTitle: '局域参数 β_i 核密度' }, ink)
        + `<polygon points="${polyStr(sigPoly)}" fill="${ink.primary}" fill-opacity="0.24"/>`
        + `<path d="${smoothCurvePath(kdePts)}" stroke="${ink.primary}" stroke-width="2.0"/>`
        + `<line x1="${f1(xMap(0.31))}" y1="${ry0}" x2="${f1(xMap(0.31))}" y2="${ry1}" stroke="${ink.opposite}" stroke-width="1.3" stroke-dasharray="3.5 2"/>`
        + txt(xMap(0.31) - 3, ry0 + 11, 'OLS=0.31', { size: 6.1, weight: 700, fill: ink.opposite, anchor: 'end' })
        + txt(xMap(0.54), ry0 + 11, 'IQR [0.19,0.54]', { size: 5.9, weight: 700, fill: ink.primary, anchor: 'middle' }),
    };
  },

  cohort_age_period_apc: (ink: ResolvedInk) => {
    const y0 = 54, y1 = 184;
    const yMap = (v: number) => y1 - ((v + 0.55) / 1.15) * (y1 - y0);
    const yTicks = [-0.4, 0.0, 0.4].map(v => ({ pos: yMap(v), label: `${v > 0 ? '+' : ''}${v.toFixed(1)}` }));
    const panels = [
      {
        title: '年龄效应 (Age)',
        x0: 42,
        x1: 128,
        col: ink.primary,
        labels: ['20', '35', '50', '65'],
        vals: [0.18, 0.34, 0.14, -0.26],
        cis: [0.09, 0.07, 0.08, 0.11],
        xTitle: '年龄组 (岁)',
      },
      {
        title: '时期效应 (Period)',
        x0: 146,
        x1: 232,
        col: ink.secondary,
        labels: ['05', '12', '19', '25'],
        vals: [-0.22, -0.04, 0.18, 0.32],
        cis: [0.08, 0.06, 0.07, 0.09],
        xTitle: '调查时期 (年)',
      },
      {
        title: '队列效应 (Cohort)',
        x0: 250,
        x1: 338,
        col: ink.opposite,
        labels: ['60', '75', '90', '05'],
        vals: [-0.30, -0.10, 0.24, 0.40],
        cis: [0.10, 0.07, 0.08, 0.11],
        xTitle: '出生世代',
      },
    ] as const;

    const panelSvg = panels.map((p, idx) => {
      const xs = evenlySpacedTicks(p.x0 + 10, p.x1 - 10, p.labels);
      const pts: [number, number][] = xs.map((t, i) => [t.pos, yMap(p.vals[i])]);
      const hiPts: [number, number][] = xs.map((t, i) => [t.pos, yMap(p.vals[i] + p.cis[i])]);
      const loPts: [number, number][] = xs.map((t, i) => [t.pos, yMap(p.vals[i] - p.cis[i])]);
      return txt((p.x0 + p.x1) / 2, 49, p.title, { size: 6.7, weight: 700, fill: p.col, anchor: 'middle' })
        + axesFrame({ x0: p.x0, y0, x1: p.x1, y1, yTicks: idx === 0 ? yTicks : undefined, xTicks: xs, box: true, yTitle: idx === 0 ? 'IE 净效应偏离 (95% CI)' : undefined, xTitle: p.xTitle }, ink)
        + `<line x1="${p.x0}" y1="${f1(yMap(0))}" x2="${p.x1}" y2="${f1(yMap(0))}" stroke="${ink.axis}" stroke-width="0.9" stroke-dasharray="3 2"/>`
        + bandPolygon(hiPts, loPts, p.col, 0.20)
        + `<path d="${smoothCurvePath(pts)}" stroke="${p.col}" stroke-width="2.1"/>`
        + pts.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.6" fill="${p.col}" stroke="${ink.surface}" stroke-width="0.7"/>`).join('');
    }).join('');

    return {
      title: 'APC 年龄—时期—队列三效应拆解图',
      badge: 'IE 本征估计 · 95% CI',
      body: legendChips([
        { label: '年龄生命周期', color: ink.primary, kind: 'line' },
        { label: '时期宏观冲击', color: ink.secondary, kind: 'line' },
        { label: '出生队列代际', color: ink.opposite, kind: 'line' },
      ], 42, 38, ink) + panelSvg,
    };
  },
});

export function renderPublicationChartExampleSvg(item: ChartExampleSpec, ink: FigureInk = '#0F766E'): string {
  const resolved = deriveInkPalette(ink);
  const renderer = RENDERERS[item.previewKind] ?? RENDERERS.bar;
  const { title, badge, body } = renderer(resolved);
  return headerFrame(title, badge, resolved, body);
}
