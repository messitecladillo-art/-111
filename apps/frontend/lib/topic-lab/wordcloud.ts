/**
 * Deterministic word-cloud layout. Free layout uses the original Archimedean spiral. A shape
 * constrains the entire text box and distributes words through its usable regions. Words that
 * cannot fit are reported separately; neither layout changes the frequency-to-size scale.
 *
 * Font size interpolates by √weight between readable size limits. Word length also affects
 * apparent area, which is why the UI pairs the cloud with a table.
 */
import { cloudShapeConstraint, type CloudAppearance } from './cloud-shapes.ts';

export type CloudItem = { key: string; label: string; weight: number };
export type CloudWord = CloudItem & { x: number; y: number; w: number; h: number; size: number };
export type CloudOptions = {
  width: number;
  height: number;
  minFont?: number;
  maxFont?: number;
  padding?: number;
  appearance?: CloudAppearance;
  /** Text box at a given font size; the caller supplies a real font measurement. */
  measure: (text: string, size: number) => { w: number; h: number };
};

export function fontScale(weights: number[], minFont: number, maxFont: number): (w: number) => number {
  const lo = Math.sqrt(Math.min(...weights)), hi = Math.sqrt(Math.max(...weights));
  return w => hi - lo < 1e-9 ? (minFont + maxFont) / 2 : minFont + (Math.sqrt(w) - lo) / (hi - lo) * (maxFont - minFont);
}

export function layoutCloud(items: CloudItem[], opts: CloudOptions): { placed: CloudWord[]; dropped: CloudItem[] } {
  const { width, height, measure, appearance } = opts;
  const pad = opts.padding ?? (appearance?.spacing === 'compact' ? 1 : appearance?.spacing === 'relaxed' ? 7 : 3);
  if (!items.length) return { placed: [], dropped: [] };
  const sorted = [...items].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  const minFont = opts.minFont ?? 12, maxFont = opts.maxFont ?? 56;
  if (![width, height, minFont, maxFont, pad].every(Number.isFinite) || width <= 0 || height <= 0 || width > 16384 || height > 16384 || minFont <= 0 || maxFont < minFont || pad < 0) return { placed: [], dropped: sorted };
  const valid = sorted.filter(i => Number.isFinite(i.weight) && i.weight >= 0);
  const scale = fontScale(valid.map(i => i.weight), minFont, maxFont);
  if (appearance && appearance.shape !== 'free') return layoutInShape(sorted, opts, appearance, pad, scale);
  const placed: CloudWord[] = [], dropped: CloudItem[] = [];
  const aspect = width / height;
  const hits = (x: number, y: number, w: number, h: number) => {
    if (x - w / 2 < 0 || x + w / 2 > width || y - h / 2 < 0 || y + h / 2 > height) return true;
    for (const p of placed) if (Math.abs(p.x - x) * 2 < p.w + w + pad * 2 && Math.abs(p.y - y) * 2 < p.h + h + pad * 2) return true;
    return false;
  };
  // Spiral r = a·θ stretched by the canvas aspect ratio; beyond rMax even the corners are passed.
  const a = 2.2, sx = Math.sqrt(aspect), sy = 1 / sx, rMax = Math.SQRT2 * Math.sqrt(width * height) / 2;
  for (const item of sorted) {
    if (!Number.isFinite(item.weight) || item.weight < 0) { dropped.push(item); continue; }
    const size = scale(item.weight), box = measure(item.label, size);
    if (!fitsCanvas(box, width, height)) { dropped.push(item); continue; }
    let done = false;
    for (let theta = 0, r = 0; r <= rMax && !done; theta += Math.min(.5, Math.max(.02, 7 / (r + 1))), r = a * theta) {
      const x = width / 2 + Math.cos(theta) * r * sx, y = height / 2 + Math.sin(theta) * r * sy;
      if (!hits(x, y, box.w, box.h)) { placed.push({ ...item, x, y, w: box.w, h: box.h, size }); done = true; }
    }
    if (!done) dropped.push(item);
  }
  return { placed, dropped };
}

function fitsCanvas(box: { w: number; h: number }, width: number, height: number) {
  return Number.isFinite(box.w) && Number.isFinite(box.h) && box.w > 0 && box.h > 0 && box.w <= width && box.h <= height;
}

function layoutInShape(sorted: CloudItem[], opts: CloudOptions, appearance: CloudAppearance, pad: number, scale: (weight: number) => number): { placed: CloudWord[]; dropped: CloudItem[] } {
  const { width, height, measure } = opts, contains = cloudShapeConstraint(appearance, width, height);
  const step = Math.max(4, Math.sqrt(width * height / 12000), Math.min(8, (opts.minFont ?? 12) / 2));
  const candidates: { x: number; y: number; distance: number }[] = [];
  for (let y = step / 2; y < height; y += step) for (let x = step / 2; x < width; x += step) {
    if (contains(x, y, 1, 1)) candidates.push({ x, y, distance: ((x - width / 2) / width) ** 2 + ((y - height / 2) / height) ** 2 });
  }
  const center = [...candidates].sort((a, b) => a.distance - b.distance);
  // After placing the headline words near the centre, visit the whole available area. A fixed
  // shuffle avoids restricting later words to the abdomen of a silhouette with separate lobes.
  let seed = 0x9e3779b9;
  for (let i = candidates.length - 1; i > 0; i--) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const j = (seed >>> 0) % (i + 1); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const placed: CloudWord[] = [], dropped: CloudItem[] = [];
  const cellSize = 48, columns = Math.ceil(width / cellSize) + 2, bins = new Map<number, CloudWord[]>();
  const bounds = (x: number, y: number, w: number, h: number) => ({
    x0: Math.floor((x - (w + pad) / 2) / cellSize), x1: Math.floor((x + (w + pad) / 2) / cellSize),
    y0: Math.floor((y - (h + pad) / 2) / cellSize), y1: Math.floor((y + (h + pad) / 2) / cellSize),
  });
  const hits = (x: number, y: number, w: number, h: number) => {
    const b = bounds(x, y, w, h);
    for (let r = b.y0; r <= b.y1; r++) for (let c = b.x0; c <= b.x1; c++) {
      const near = bins.get(r * columns + c);
      if (near?.some(p => Math.abs(p.x - x) * 2 < p.w + w + pad * 2 && Math.abs(p.y - y) * 2 < p.h + h + pad * 2)) return true;
    }
    return false;
  };
  const centralCount = Math.max(1, Math.min(5, Math.floor(sorted.length * .12)));
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (!Number.isFinite(item.weight) || item.weight < 0) { dropped.push(item); continue; }
    const size = scale(item.weight), box = measure(item.label, size);
    if (!fitsCanvas(box, width, height)) { dropped.push(item); continue; }
    const order = i < centralCount ? center : candidates;
    const offset = i < centralCount || !order.length ? 0 : (Math.imul(i + 1, 0x9e3779b1) >>> 0) % order.length;
    let word: CloudWord | undefined;
    for (let n = 0; n < order.length; n++) {
      const { x, y } = order[(n + offset) % order.length];
      if (!contains(x, y, box.w + pad, box.h + pad) || hits(x, y, box.w, box.h)) continue;
      word = { ...item, x, y, w: box.w, h: box.h, size }; break;
    }
    if (!word) { dropped.push(item); continue; }
    placed.push(word);
    const b = bounds(word.x, word.y, word.w, word.h);
    for (let r = b.y0; r <= b.y1; r++) for (let c = b.x0; c <= b.x1; c++) {
      const key = r * columns + c, bucket = bins.get(key);
      if (bucket) bucket.push(word); else bins.set(key, [word]);
    }
  }
  return { placed, dropped };
}
