/**
 * The report's figure palette, taken from its cover so every chart speaks the cover's colours: a deep primary (the
 * main series, agreement, positive correlation), a secondary hue (the second category), and an opposite hue (the
 * other side of a scale with a real midpoint: disagreement, negative correlation). Ordered categories still use one
 * hue's lightness ramp; only unordered categories cycle the hues (research-chart-production: 分类色克制，连续值单向明度).
 */
import { ACCENTS, type EditorContent } from './editor-model.ts';

export type FigurePalette = { schema: 'FigurePalette/v1'; primary: string; secondary: string; opposite: string; source: 'cover' | 'manual' };
/** What a figure is drawn with: the project accent alone, or a full palette. */
export type FigureInk = string | FigurePalette;

const HEX = /^#[0-9A-F]{6}$/u;
export function parseFigurePalette(value: unknown): FigurePalette {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('图表配色无效。');
  const x = value as Record<string, unknown>, keys = ['schema', 'primary', 'secondary', 'opposite', 'source'];
  if (Object.keys(x).length !== keys.length || Object.keys(x).some(k => !keys.includes(k)) || x.schema !== 'FigurePalette/v1') throw Error('图表配色无效。');
  if (![x.primary, x.secondary, x.opposite].every(c => typeof c === 'string' && HEX.test(c)) || (x.source !== 'cover' && x.source !== 'manual')) throw Error('图表配色须为大写十六进制颜色。');
  return { schema: 'FigurePalette/v1', primary: x.primary as string, secondary: x.secondary as string, opposite: x.opposite as string, source: x.source };
}

/** The ink a report's figures are drawn with: its palette, or else its accent colour. */
export const figureInk = (content: Pick<EditorContent, 'accent' | 'figurePalette'>): FigureInk => content.figurePalette ?? `#${ACCENTS[content.accent]}`;

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: readonly number[]) => `#${c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
function hsl([r, g, b]: readonly number[]) {
  const [R, G, B] = [r / 255, g / 255, b / 255], max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  return { h: (h + 360) % 360, s, l };
}
const luminance = (hex: string) => channels(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const scale = (c: readonly number[], t: number) => c.map(v => v * t);

/**
 * The palette of an image's pixels (RGBA, as canvas ImageData gives them): k-means on an even sample from fixed
 * seeds, then the darkest well-coloured cluster as primary, the most prominent clearly different hue as secondary and
 * a third hue as opposite. Deterministic; the primary is deepened until white text on it stays legible.
 */
export function paletteFromPixels(rgba: ArrayLike<number>, source: FigurePalette['source'] = 'cover'): FigurePalette {
  const points: number[][] = [], count = Math.floor(rgba.length / 4), step = Math.max(1, Math.floor(count / 6000));
  for (let i = 0; i < count; i += step) if (rgba[i * 4 + 3] > 200) points.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  if (points.length < 12) throw Error('图像像素太少，无法取色。');
  const k = 8;
  let centers = Array.from({ length: k }, (_, j) => points[Math.floor((j + 0.5) * points.length / k)].slice());
  let members: number[][][] = [];
  for (let round = 0; round < 12; round++) {
    members = centers.map(() => []);
    for (const p of points) {
      let best = 0, bestD = Infinity;
      centers.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bestD) { bestD = d; best = j; } });
      members[best].push(p);
    }
    centers = centers.map((c, j) => (members[j].length ? [0, 1, 2].map(d => members[j].reduce((s, p) => s + p[d], 0) / members[j].length) : c));
  }
  const clusters = centers.map((c, j) => ({ c, weight: members[j].length / points.length, ...hsl(c) })).filter(x => x.weight > 0.01);
  const coloured = clusters.filter(x => x.s >= 0.18);
  // The cover's identity is its largest dark coloured area (a cluster mean is greyer than the paint, so it is
  // re-saturated below).
  const primaryPick = [...coloured].filter(x => x.l <= 0.5).sort((a, b) => b.weight - a.weight)[0] ?? [...clusters].sort((a, b) => a.l - b.l)[0];
  const secondaryPick = coloured.filter(x => x !== primaryPick && hueGap(x.h, primaryPick.h) >= 50 && x.l >= 0.3 && x.l <= 0.75).sort((a, b) => b.weight * b.s - a.weight * a.s)[0];
  const oppositePick = coloured.filter(x => x !== primaryPick && x !== secondaryPick && hueGap(x.h, primaryPick.h) >= 40 && (!secondaryPick || hueGap(x.h, secondaryPick.h) >= 15) && x.l >= 0.2 && x.l <= 0.6).sort((a, b) => b.weight * b.s - a.weight * a.s)[0];
  const saturate = (c: readonly number[], f: number) => { const m = (c[0] + c[1] + c[2]) / 3; return c.map(v => m + (v - m) * f); };
  const base = saturate(primaryPick.c, 1.5);
  let primary = toHex(base);
  for (let t = 0.92; luminance(primary) > 0.09 && t > 0.3; t -= 0.06) primary = toHex(scale(base, t));
  // The second hue marks dots and thin bars on white paper: deepened until it stands out against the page.
  let secondary = secondaryPick ? toHex(secondaryPick.c) : '#C99A3E';
  for (let t = 0.95; secondaryPick && luminance(secondary) > 0.36 && t > 0.5; t -= 0.05) secondary = toHex(scale(secondaryPick.c, t));
  const opposite = oppositePick ? toHex(oppositePick.c) : '#A65A3A';
  return { schema: 'FigurePalette/v1', primary, secondary, opposite, source };
}
