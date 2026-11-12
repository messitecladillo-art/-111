/** Saved visual settings only: these never participate in term extraction or document counts. */
export type CloudShape = 'free' | 'circle' | 'rectangle' | 'leaf' | 'crayfish' | 'custom';
export type CloudMask = { width: number; height: number; bits: string; label: string };
export type CloudAppearance = {
  shape: CloudShape;
  orientation: 'horizontal' | 'vertical';
  spacing: 'compact' | 'standard' | 'relaxed';
  outline: boolean;
  customMask?: CloudMask;
};
export const DEFAULT_CLOUD_APPEARANCE: CloudAppearance = { shape: 'free', orientation: 'horizontal', spacing: 'standard', outline: true };
export const CLOUD_SHAPES: readonly { id: CloudShape; label: string }[] = [
  { id: 'free', label: '自由布局' }, { id: 'circle', label: '圆形' }, { id: 'rectangle', label: '矩形' },
  { id: 'leaf', label: '叶片' }, { id: 'crayfish', label: '小龙虾' }, { id: 'custom', label: '自定义' },
];

function plain(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw Error('词云外观格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw Error('词云外观包含未知字段或访问器。');
  return value as Record<string, unknown>;
}
export function parseCloudAppearance(value: unknown): CloudAppearance {
  const v = plain(value, ['shape', 'orientation', 'spacing', 'outline'], ['customMask']);
  if (!CLOUD_SHAPES.some(s => s.id === v.shape) || !['horizontal', 'vertical'].includes(v.orientation as string) || !['compact', 'standard', 'relaxed'].includes(v.spacing as string) || typeof v.outline !== 'boolean') throw Error('词云外观选项无效。');
  let customMask: CloudMask | undefined;
  if (Object.hasOwn(v, 'customMask')) {
    const mask = plain(v.customMask, ['width', 'height', 'bits', 'label']);
    const { width, height, bits, label } = mask;
    if (typeof width !== 'number' || !Number.isSafeInteger(width) || width < 1 || width > 128 || typeof height !== 'number' || !Number.isSafeInteger(height) || height < 1 || height > 128 || width * height > 16384 || typeof bits !== 'string' || bits.length !== width * height || !/^[01]+$/.test(bits) || typeof label !== 'string' || !label.trim() || label.length > 120 || /[\u0000-\u001f\u007f]/u.test(label)) throw Error('剪影网格或名称无效。');
    const occupied = bits.split('1').length - 1;
    if (occupied < Math.max(1, Math.ceil(bits.length * .01))) throw Error('剪影可用面积太小，请换用轮廓清晰的图片。');
    customMask = { width, height, bits, label };
  }
  if (v.shape === 'custom' && !customMask) throw Error('请先上传自定义剪影。');
  return { shape: v.shape as CloudShape, orientation: v.orientation as CloudAppearance['orientation'], spacing: v.spacing as CloudAppearance['spacing'], outline: v.outline, ...(customMask ? { customMask } : {}) };
}

type Point = [number, number];
const CRAYFISH: Point[] = [
  [.025, .28], [.16, .37], [.12, .20], [.25, .35], [.38, .31], [.53, .32], [.64, .38],
  [.665, .285], [.72, .19], [.765, .09], [.86, .025], [.94, .055], [.99, .145],
  [.95, .245], [.895, .285], [.90, .18], [.855, .13], [.815, .19], [.815, .29],
  [.765, .37], [.705, .425], [.72, .46], [.755, .445], [.745, .485], [.765, .50],
  [.745, .515], [.755, .555], [.72, .54], [.705, .575], [.765, .63], [.815, .71],
  [.815, .81], [.855, .87], [.90, .82], [.895, .715], [.95, .755], [.99, .855],
  [.94, .945], [.86, .975], [.765, .91], [.72, .81], [.665, .715], [.64, .62],
  [.60, .68], [.65, .81], [.57, .72], [.52, .69], [.53, .82], [.46, .70],
  [.39, .69], [.40, .79], [.33, .68], [.25, .65], [.12, .80], [.16, .63],
  [.025, .72], [.085, .56], [.015, .50], [.085, .44],
];
const LEAF: Point[] = Array.from({ length: 65 }, (_, i) => {
  const t = i / 64 * Math.PI * 2;
  // A pointed, convex lens. Unlike an image it is the actual placement boundary.
  return [(1 + Math.cos(t)) / 2, .5 + Math.sin(t) * Math.sin(t / 2) * .48] as Point;
});
const CIRCLE: Point[] = Array.from({ length: 96 }, (_, i) => [.5 + Math.cos(i / 96 * Math.PI * 2) * .5, .5 + Math.sin(i / 96 * Math.PI * 2) * .5]);
function polygon(shape: CloudShape): Point[] {
  if (shape === 'crayfish') return CRAYFISH;
  if (shape === 'leaf') return LEAF;
  if (shape === 'circle') return CIRCLE;
  return [[0, 0], [1, 0], [1, 1], [0, 1]];
}
export function cloudShapeAspectRatio(appearance: CloudAppearance): number {
  const ratio = appearance.shape === 'circle' ? 1 : appearance.shape === 'leaf' ? 1.55 : appearance.shape === 'crayfish' ? 1.7 : appearance.shape === 'custom' && appearance.customMask ? appearance.customMask.width / appearance.customMask.height : 1.6;
  return appearance.orientation === 'vertical' ? 1 / ratio : ratio;
}
function frame(appearance: CloudAppearance, width: number, height: number) {
  const margin = Math.min(width, height) * .035, ratio = cloudShapeAspectRatio(appearance);
  const w = Math.min(width - margin * 2, (height - margin * 2) * ratio), h = w / ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
function toCanvas(p: Point, appearance: CloudAppearance, f: ReturnType<typeof frame>): Point {
  const [x, y] = appearance.orientation === 'vertical' ? [1 - p[1], p[0]] : p;
  return [f.x + x * f.w, f.y + y * f.h];
}
function fromCanvas(x: number, y: number, appearance: CloudAppearance, f: ReturnType<typeof frame>): Point {
  const u = (x - f.x) / f.w, v = (y - f.y) / f.h;
  return appearance.orientation === 'vertical' ? [v, 1 - u] : [u, v];
}
function inPolygon(x: number, y: number, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-8 && x >= Math.min(ax, bx) - 1e-8 && x <= Math.max(ax, bx) + 1e-8 && y >= Math.min(ay, by) - 1e-8 && y <= Math.max(ay, by) + 1e-8) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
export function cloudShapeContains(appearance: CloudAppearance, x: number, y: number, width: number, height: number): boolean {
  if (![width, height, x, y].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || x > width || y < 0 || y > height) return false;
  if (appearance.shape === 'free') return true;
  const p = fromCanvas(x, y, appearance, frame(appearance, width, height));
  if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return false;
  if (appearance.shape === 'custom') {
    const m = appearance.customMask;
    return !!m && m.bits[Math.min(m.height - 1, Math.floor(p[1] * m.height)) * m.width + Math.min(m.width - 1, Math.floor(p[0] * m.width))] === '1';
  }
  return inPolygon(p[0], p[1], polygon(appearance.shape));
}

/** Trace exposed pixel edges into closed paths. No uploaded markup is ever used as SVG. */
function maskContours(mask: CloudMask): Point[][] {
  const edges = new Map<string, Point[]>(), on = (x: number, y: number) => x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.bits[y * mask.width + x] === '1';
  const add = (a: Point, b: Point) => { const key = `${a[0]},${a[1]}`; edges.set(key, [...(edges.get(key) ?? []), b]); };
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (on(x, y)) {
    if (!on(x, y - 1)) add([x, y], [x + 1, y]);
    if (!on(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
    if (!on(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
    if (!on(x - 1, y)) add([x, y + 1], [x, y]);
  }
  const result: Point[][] = [];
  while (edges.size) {
    const key = edges.keys().next().value!, start = key.split(',').map(Number) as Point, points: Point[] = [start];
    let p = start, previous: Point = [start[0] - 1, start[1]], guard = mask.width * mask.height * 4 + 1;
    do {
      const k = `${p[0]},${p[1]}`, choices = edges.get(k);
      if (!choices?.length) break;
      // At diagonal contacts prefer a right turn, keeping each filled cell on the right.
      const incoming = Math.atan2(p[1] - previous[1], p[0] - previous[0]);
      choices.sort((a, b) => ((Math.atan2(a[1] - p[1], a[0] - p[0]) - incoming + Math.PI * 2) % (Math.PI * 2)) - ((Math.atan2(b[1] - p[1], b[0] - p[0]) - incoming + Math.PI * 2) % (Math.PI * 2)));
      const next = choices.shift()!; if (!choices.length) edges.delete(k);
      previous = p; p = next; points.push(p);
    } while ((p[0] !== start[0] || p[1] !== start[1]) && --guard > 0);
    result.push(points.map(([x, y]) => [x / mask.width, y / mask.height]));
  }
  return result;
}
export function cloudShapePath(appearance: CloudAppearance, width: number, height: number): string {
  if (appearance.shape === 'free' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  const f = frame(appearance, width, height), contours = appearance.shape === 'custom' ? appearance.customMask ? maskContours(appearance.customMask) : [] : [polygon(appearance.shape)];
  return contours.map(points => points.map((p, i) => { const [x, y] = toCanvas(p, appearance, f); return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`; }).join('') + 'Z').join('');
}

/** A conservative summed-area mask makes full rectangle containment an O(1) query. */
export function cloudShapeConstraint(appearance: CloudAppearance, width: number, height: number): (x: number, y: number, w: number, h: number) => boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return () => false;
  const validBox = (x: number, y: number, w: number, h: number) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  if (appearance.shape === 'free') return (x, y, w, h) => validBox(x, y, w, h) && x - w / 2 >= 0 && x + w / 2 <= width && y - h / 2 >= 0 && y + h / 2 <= height;
  const f = frame(appearance, width, height);
  if (f.w <= 0 || f.h <= 0) return () => false;
  if (appearance.shape === 'rectangle') return (x, y, w, h) => validBox(x, y, w, h) && x - w / 2 >= f.x && x + w / 2 <= f.x + f.w && y - h / 2 >= f.y && y + h / 2 <= f.y + f.h;
  if (appearance.shape === 'circle') {
    // The inradius is conservative against the 96-sided outline used by the renderer.
    const r = f.w / 2 * Math.cos(Math.PI / CIRCLE.length);
    return (x, y, w, h) => validBox(x, y, w, h) && (Math.abs(x - width / 2) + w / 2) ** 2 + (Math.abs(y - height / 2) + h / 2) ** 2 <= r ** 2;
  }
  const mask = appearance.shape === 'custom' ? appearance.customMask : undefined;
  if (appearance.shape === 'custom' && !mask) return () => false;
  const cols = mask?.width ?? Math.min(256, Math.max(16, Math.ceil(f.w / 6))), rows = mask?.height ?? Math.min(256, Math.max(16, Math.ceil(f.h / 6)));
  const stride = cols + 1, prefix = new Uint32Array((rows + 1) * stride), points = polygon(appearance.shape);
  const edges = points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
  for (let r = 0; r < rows; r++) {
    let rowSum = 0;
    for (let c = 0; c < cols; c++) {
      let inside: boolean;
      if (mask) inside = mask.bits[r * cols + c] === '1';
      else {
        const l = c / cols, t = r / rows, rr = (c + 1) / cols, bb = (r + 1) / rows;
        inside = inPolygon(l, t, points) && inPolygon(rr, t, points) && inPolygon(rr, bb, points) && inPolygon(l, bb, points);
        // Four corners alone miss inward notches. Any boundary vertex inside a cell makes it unsafe.
        if (inside && appearance.shape === 'crayfish') inside = !edges.some(({ a, b }) => segmentEntersBox(a, b, l, t, rr, bb));
      }
      rowSum += inside ? 0 : 1; prefix[(r + 1) * stride + c + 1] = prefix[r * stride + c + 1] + rowSum;
    }
  }
  return (x, y, w, h) => {
    if (!validBox(x, y, w, h)) return false;
    const p = fromCanvas(x - w / 2, y - h / 2, appearance, f), q = fromCanvas(x + w / 2, y + h / 2, appearance, f);
    const l = Math.min(p[0], q[0]), t = Math.min(p[1], q[1]), rr = Math.max(p[0], q[0]), bb = Math.max(p[1], q[1]);
    if (l < 0 || t < 0 || rr > 1 || bb > 1) return false;
    const x0 = Math.max(0, Math.floor(l * cols + 1e-9)), y0 = Math.max(0, Math.floor(t * rows + 1e-9));
    const x1 = Math.min(cols, Math.ceil(rr * cols - 1e-9)), y1 = Math.min(rows, Math.ceil(bb * rows - 1e-9));
    return prefix[y1 * stride + x1] - prefix[y0 * stride + x1] - prefix[y1 * stride + x0] + prefix[y0 * stride + x0] === 0;
  };
}
function segmentEntersBox(a: Point, b: Point, left: number, top: number, right: number, bottom: number): boolean {
  const eps = 1e-9; left += eps; top += eps; right -= eps; bottom -= eps;
  if (Math.max(a[0], b[0]) < left || Math.min(a[0], b[0]) > right || Math.max(a[1], b[1]) < top || Math.min(a[1], b[1]) > bottom) return false;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-(b[0] - a[0]), a[0] - left], [b[0] - a[0], right - a[0]], [-(b[1] - a[1]), a[1] - top], [b[1] - a[1], bottom - a[1]]]) {
    if (p === 0) { if (q < 0) return false; } else if (p < 0) lo = Math.max(lo, q / p); else hi = Math.min(hi, q / p);
    if (lo > hi) return false;
  }
  return true;
}
