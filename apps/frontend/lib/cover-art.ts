/**
 * A cover ornament: thin vector strokes drawn on the cover page only, under the title, in every output — the canvas,
 * the Word export and the LaTeX export draw the same strokes from this one definition. The band the title is set in
 * stays clear, so the ornament can never collide with the text.
 *
 * The built-in ornament "流线" is drawn from a concept image made with Codex's image generation tool (original line
 * art, no text or marks), traced to millimetres on the A4 page; the definition says so in its note, for the report's
 * AI-use appendix.
 */

export type CoverStroke = { points: [number, number][]; color: string; widthPt: number; opacity: number };
export type CoverArt = { schema: 'CoverArt/v1'; id: string; title: string; note: string; strokes: CoverStroke[] };

export const COVER_PAGE = { widthMm: 210, heightMm: 297 } as const;
/** The band, in millimetres from the top of the page, that the cover's title and subtitle are set in. */
export const COVER_TITLE_BAND = { top: 70, bottom: 170 } as const;
export const COVER_LIMITS = { strokes: 24, points: 400, note: 300 } as const;

const fail = (): never => { throw Error('封面装饰定义无效，或装饰进入了标题区。'); };
const exact2 = (v: unknown, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && Number(v.toFixed(2)) === v ? v : fail());
const text = (v: unknown, max: number): string => (typeof v === 'string' && v.trim().length > 0 && Array.from(v).length <= max && !/[\u0000-\u001f]/u.test(v) ? v : fail());
const keys = (v: unknown, names: readonly string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== names.length || Object.keys(v).some(k => !names.includes(k))) return fail();
  return v as Record<string, unknown>;
};

/**
 * A cover ornament as stored: at most 24 strokes of at most 400 points, each point on the page and outside the title
 * band, coordinates in millimetres to two decimals (so every output prints the same numbers).
 */
export function parseCoverArt(value: unknown): CoverArt {
  const x = keys(value, ['schema', 'id', 'title', 'note', 'strokes']);
  if (x.schema !== 'CoverArt/v1' || !Array.isArray(x.strokes) || !x.strokes.length || x.strokes.length > COVER_LIMITS.strokes) return fail();
  const strokes = x.strokes.map(s => {
    const y = keys(s, ['points', 'color', 'widthPt', 'opacity']);
    if (!Array.isArray(y.points) || y.points.length < 2 || y.points.length > COVER_LIMITS.points) return fail();
    const points = y.points.map(p => {
      if (!Array.isArray(p) || p.length !== 2) return fail();
      const point: [number, number] = [exact2(p[0], 0, COVER_PAGE.widthMm), exact2(p[1], 0, COVER_PAGE.heightMm)];
      if (point[1] > COVER_TITLE_BAND.top && point[1] < COVER_TITLE_BAND.bottom) return fail();
      return point;
    });
    // A segment may not cross the title band either.
    if (points.slice(1).some((b, i) => (points[i][1] <= COVER_TITLE_BAND.top) !== (b[1] <= COVER_TITLE_BAND.top))) return fail();
    const color = typeof y.color === 'string' && /^#[0-9A-F]{6}$/u.test(y.color) ? y.color : fail();
    return { points, color, widthPt: exact2(y.widthPt, 0.1, 2), opacity: exact2(y.opacity, 0.05, 1) };
  });
  return { schema: 'CoverArt/v1', id: text(x.id, 96), title: text(x.title, 40), note: text(x.note, COVER_LIMITS.note), strokes };
}

/** A number as every output prints it: at most two decimals, no trailing zeros. */
export const coverNumber = (v: number) => v.toFixed(2).replace(/\.?0+$/u, '');
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** The ornament as an SVG of the whole page, millimetres as user units. */
export function coverArtSvg(art: CoverArt): string {
  const strokes = art.strokes.map(s => `<polyline points="${s.points.map(([x, y]) => `${coverNumber(x)},${coverNumber(y)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${coverNumber(s.widthPt * 25.4 / 72)}" stroke-opacity="${coverNumber(s.opacity)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_PAGE.widthMm}mm" height="${COVER_PAGE.heightMm}mm" viewBox="0 0 ${COVER_PAGE.widthMm} ${COVER_PAGE.heightMm}">${strokes}</svg>`;
}

/**
 * The ornament as TikZ lines for the title page: an overlay anchored at the page's top-left corner, x to the right and
 * y down in millimetres. Byte-identical with the backend's `cover_art_tex`.
 */
export function coverArtTex(art: CoverArt): string[] {
  return [
    '\\begin{tikzpicture}[remember picture,overlay,x=1mm,y=-1mm,shift={(current page.north west)}]',
    ...art.strokes.map(s => {
      const [r, g, b] = rgb(s.color);
      return `\\draw[line width=${coverNumber(s.widthPt)}bp,line cap=round,line join=round,draw={rgb,255:red,${r};green,${g};blue,${b}},draw opacity=${coverNumber(s.opacity)}] ${s.points.map(([x, y]) => `(${coverNumber(x)},${coverNumber(y)})`).join(' -- ')};`;
    }),
    '\\end{tikzpicture}',
  ];
}

/* ───────── the built-in ornament ───────── */

/** A smooth line through key points (centripetal Catmull–Rom), sampled into a polyline rounded to two decimals. */
function smooth(keyPoints: readonly [number, number][], steps = 6): [number, number][] {
  const out: [number, number][] = [];
  const at = (i: number) => keyPoints[Math.max(0, Math.min(keyPoints.length - 1, i))];
  for (let i = 0; i < keyPoints.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const c = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(keyPoints[keyPoints.length - 1]);
  const clamp = (v: number, max: number) => Number(Math.min(max, Math.max(0, v)).toFixed(2));
  return out.map(([x, y]) => [clamp(x, COVER_PAGE.widthMm), clamp(y, COVER_PAGE.heightMm)]);
}
const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

const FOREST = '#2D6356', SAGE = '#6D9585', PALE = '#C5D8CD', GOLD = '#B59A65';

/** 流线: three river lines that turn into running-track lanes at the foot of the page, and a sparse grid of squares at the top right. */
export const FLOWING_LINES: CoverArt = {
  schema: 'CoverArt/v1',
  id: 'cover-flowing-lines-v1',
  title: '流线',
  note: '封面装饰线条依据 Codex 内置图像生成工具生成的概念图，按 A4 页面描摹为矢量线条；不含文字、标志或照片。',
  strokes: [
    { color: FOREST, widthPt: 0.6, opacity: 1, points: [[155.4, 18], [194.6, 18], [194.6, 54.7]] },
    { color: SAGE, widthPt: 0.6, opacity: 1, points: square(154.1, 28.4, 167, 41.6) },
    { color: GOLD, widthPt: 0.6, opacity: 1, points: square(175.4, 39, 183.7, 47.3) },
    { color: PALE, widthPt: 0.6, opacity: 1, points: square(154.1, 50.3, 162.1, 58.3) },
    { color: FOREST, widthPt: 0.85, opacity: 1, points: smooth([[0, 262.4], [12, 261.1], [24, 257.5], [36, 252.9], [48, 249.3], [60, 247.4], [72, 247.5], [84, 249.3], [96, 251.5], [108, 252.9], [118, 253], [130, 251.7], [142, 249.6], [153, 247.1], [163, 244], [172, 240.8], [179, 236.8], [184, 232.7], [186.6, 227.5], [186.2, 223.6], [183.5, 221.5], [176, 217.8], [166, 215.4], [155.4, 214.4]]) },
    { color: FOREST, widthPt: 0.6, opacity: 1, points: smooth([[159.4, 212.1], [170, 211.4], [180, 211], [190, 210.8], [200, 211], [209.5, 211.6]]) },
    { color: SAGE, widthPt: 0.75, opacity: 1, points: smooth([[0, 278.8], [12, 278.4], [24, 275.9], [36, 271.5], [48, 265.6], [60, 261.1], [72, 258.7], [80, 258.2], [90, 259.1], [102, 260.5], [114, 261.3], [126, 260.8], [138, 259.4], [150, 256.9], [160, 254.3], [170, 250.7], [180, 245.7], [187, 241.3], [193.7, 234.1], [198.5, 229.5], [200.9, 225.4], [199.5, 221.6], [196, 219.3], [191.3, 217.6], [184, 216.4]]) },
    { color: PALE, widthPt: 0.75, opacity: 1, points: smooth([[0, 285.5], [12, 285], [24, 283.1], [36, 279.6], [48, 274.4], [60, 268.6], [72, 264.6], [84, 262.9], [96, 263.8], [108, 265.5], [120, 266.5], [132, 266.3], [144, 265.3], [156, 263.4], [168, 260.1], [180, 255.7], [188, 251.6], [194, 247.4], [199, 243], [202.6, 238.2], [204.6, 232.4], [204.2, 227.2], [201.6, 223.3], [198, 220.8], [193.7, 218.6], [186, 216.8]]) },
  ],
};
