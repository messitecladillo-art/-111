/**
 * Deterministic word-cloud layout. Words are placed largest first along an Archimedean spiral that
 * follows the canvas aspect ratio; a word that cannot be placed without overlap is reported as
 * dropped instead of being shrunk, so font size always encodes the same quantity.
 *
 * Font size scales with √weight: for words of equal length the inked area is then proportional to
 * the weight. Longer words still look bigger, which is why the UI pairs the cloud with a table.
 */
export type CloudItem = { key: string; label: string; weight: number };
export type CloudWord = CloudItem & { x: number; y: number; w: number; h: number; size: number };
export type CloudOptions = {
  width: number;
  height: number;
  minFont?: number;
  maxFont?: number;
  padding?: number;
  /** Text box at a given font size; the caller supplies a real font measurement. */
  measure: (text: string, size: number) => { w: number; h: number };
};

export function fontScale(weights: number[], minFont: number, maxFont: number): (w: number) => number {
  const lo = Math.sqrt(Math.min(...weights)), hi = Math.sqrt(Math.max(...weights));
  return w => hi - lo < 1e-9 ? (minFont + maxFont) / 2 : minFont + (Math.sqrt(w) - lo) / (hi - lo) * (maxFont - minFont);
}

export function layoutCloud(items: CloudItem[], opts: CloudOptions): { placed: CloudWord[]; dropped: CloudItem[] } {
  const { width, height, measure } = opts, pad = opts.padding ?? 3;
  if (!items.length) return { placed: [], dropped: [] };
  const sorted = [...items].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  const scale = fontScale(sorted.map(i => i.weight), opts.minFont ?? 12, opts.maxFont ?? 56);
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
    const size = scale(item.weight), box = measure(item.label, size);
    let done = false;
    for (let theta = 0, r = 0; r <= rMax && !done; theta += Math.min(.5, Math.max(.02, 7 / (r + 1))), r = a * theta) {
      const x = width / 2 + Math.cos(theta) * r * sx, y = height / 2 + Math.sin(theta) * r * sy;
      if (!hits(x, y, box.w, box.h)) { placed.push({ ...item, x, y, w: box.w, h: box.h, size }); done = true; }
    }
    if (!done) dropped.push(item);
  }
  return { placed, dropped };
}
