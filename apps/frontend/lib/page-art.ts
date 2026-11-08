/**
 * Whole-page artwork made with the user's report skills, stored in the draft and printed edge to edge:
 *
 * - the cover image (research-report-cover): one generated A4 artwork with the title lettering drawn into it. It is
 *   the cover page; no title is set over it.
 * - the frame image (research-report-frame): a transparent A4 PNG whose ornaments sit only in the page perimeter. It
 *   lies behind every page after the cover; the text area and its geometry never change.
 *
 * The pixel size is read from the file's own header, never trusted from the draft, and the page shape must be A4
 * portrait: an image is placed whole, never stretched or cropped. Kept in step with the backend's page_art.py.
 */

export type PageArtMime = 'image/jpeg' | 'image/png';
export type CoverImage = { schema: 'CoverImage/v1'; mime: PageArtMime; data: string; widthPx: number; heightPx: number; note: string };
export type FrameImage = { schema: 'FrameImage/v1'; mime: 'image/png'; data: string; widthPx: number; heightPx: number; note: string };
type PageArt = CoverImage | FrameImage;

export const PAGE_ART_LIMITS = {
  cover: { bytes: 1_000_000, mimes: ['image/jpeg', 'image/png'] as PageArtMime[] },
  frame: { bytes: 600_000, mimes: ['image/png'] as PageArtMime[] },
  minWidth: 800, maxSide: 6000, aspectTolerance: 0.015, note: 300,
} as const;
/** A4 portrait, width over height. */
export const A4_ASPECT = 210 / 297;
/** The A4 page in CSS pixels (96 per inch), as Word image sizes are given. */
export const A4_PAGE_PX = { width: Math.round(210 / 25.4 * 96), height: Math.round(297 / 25.4 * 96) } as const;
/** Where the frame must stay transparent, in millimetres: the body text area plus 3 mm, and the page number. */
export const FRAME_CLEAR_ZONES_MM = [{ x0: 28.8, y0: 22.4, x1: 181.2, y1: 274.6 }, { x0: 80, y0: 276, x1: 130, y1: 293 }] as const;

const LABEL = { cover: '封面图', frame: '页框图' } as const;
const fail = (message: string): never => { throw Error(message); };
const invalid = (kind: 'cover' | 'frame') => fail(kind === 'cover'
  ? '封面图无效：须为 A4 竖版比例的 JPEG 或 PNG 整页图，宽至少 800 像素，大小不超过 1 MB。'
  : '页框图无效：须为 A4 竖版比例的透明 PNG，宽至少 800 像素，大小不超过 600 KB。');

function bytesOf(base64: string, kind: 'cover' | 'frame'): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(base64) || base64.length % 4) return invalid(kind);
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

/** The pixel size a PNG or JPEG file states in its own header, or null when the header is not one of them. */
export function imageSize(bytes: Uint8Array, mime: PageArtMime): { width: number; height: number } | null {
  const u32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  if (mime === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
    return { width: u32(16), height: u32(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = u16(i + 2);
    if (length < 2) return null;
    // Start-of-frame markers (baseline, progressive, …), excluding DHT, JPG and DAC.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) };
    i += 2 + length;
  }
  return null;
}

function parseArt(value: unknown, kind: 'cover' | 'frame'): PageArt {
  const schema = kind === 'cover' ? 'CoverImage/v1' : 'FrameImage/v1', limits = PAGE_ART_LIMITS[kind];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(kind);
  const x = value as Record<string, unknown>;
  const keys = ['schema', 'mime', 'data', 'widthPx', 'heightPx', 'note'];
  if (Object.keys(x).length !== keys.length || Object.keys(x).some(k => !keys.includes(k)) || x.schema !== schema) return invalid(kind);
  if (!limits.mimes.includes(x.mime as PageArtMime)) return invalid(kind);
  const mime = x.mime as PageArtMime;
  if (typeof x.data !== 'string' || x.data.length > Math.ceil(limits.bytes / 3) * 4) return invalid(kind);
  const bytes = bytesOf(x.data, kind);
  if (bytes.length > limits.bytes) return invalid(kind);
  const size = imageSize(bytes, mime);
  if (!size || size.width !== x.widthPx || size.height !== x.heightPx) return invalid(kind);
  if (size.width < PAGE_ART_LIMITS.minWidth || Math.max(size.width, size.height) > PAGE_ART_LIMITS.maxSide) return invalid(kind);
  if (Math.abs(size.width / size.height / A4_ASPECT - 1) > PAGE_ART_LIMITS.aspectTolerance) return invalid(kind);
  const note = typeof x.note === 'string' && x.note.trim() && Array.from(x.note).length <= PAGE_ART_LIMITS.note && !/[\u0000-\u001f\u007f]/u.test(x.note) ? x.note : invalid(kind);
  return { schema, mime, data: x.data, widthPx: size.width, heightPx: size.height, note } as PageArt;
}

export const parseCoverImage = (value: unknown) => parseArt(value, 'cover') as CoverImage;
export const parseFrameImage = (value: unknown) => parseArt(value, 'frame') as FrameImage;
export const pageArtDataUrl = (art: PageArt) => `data:${art.mime};base64,${art.data}`;
export const pageArtBytes = (art: PageArt) => bytesOf(art.data, art.schema === 'CoverImage/v1' ? 'cover' : 'frame');
/** The file names the LaTeX source includes and the compiler writes next to it. */
export const coverImageFile = (cover: Pick<CoverImage, 'mime'>) => (cover.mime === 'image/png' ? 'cover-image.png' : 'cover-image.jpg');
export const FRAME_IMAGE_FILE = 'frame-image.png';

/** The LaTeX title page that prints the cover image over the whole page; byte-identical with page_art.py. */
export const coverImageTitlepage = (cover: Pick<CoverImage, 'mime'>) => [
  '\\begin{titlepage}',
  '\\begin{tikzpicture}[remember picture,overlay]',
  `\\node[inner sep=0pt] at (current page.center) {\\includegraphics[width=\\paperwidth,height=\\paperheight]{${coverImageFile(cover)}}};`,
  '\\end{tikzpicture}',
  '\\end{titlepage}',
];
/** The preamble that lays the frame image behind every page while \ReportFrameImagetrue; byte-identical with page_art.py. */
export const frameImagePreamble = () => [
  '\\newif\\ifReportFrameImage',
  '\\ReportFrameImagefalse',
  `\\AddToHook{shipout/background}{\\ifReportFrameImage\\begin{tikzpicture}[remember picture,overlay]\\node[inner sep=0pt] at (current page.center) {\\includegraphics[width=\\paperwidth,height=\\paperheight]{${FRAME_IMAGE_FILE}}};\\end{tikzpicture}\\fi}`,
];

async function decode(file: File, kind: 'cover' | 'frame') {
  const bitmap = await createImageBitmap(file);
  if (Math.abs(bitmap.width / bitmap.height / A4_ASPECT - 1) > PAGE_ART_LIMITS.aspectTolerance) { bitmap.close(); fail(`${LABEL[kind]}须为 A4 竖版比例（210:297），这张是 ${bitmap.width}×${bitmap.height} 像素。`); }
  if (bitmap.width < PAGE_ART_LIMITS.minWidth) { bitmap.close(); fail(`${LABEL[kind]}宽度至少 ${PAGE_ART_LIMITS.minWidth} 像素，这张只有 ${bitmap.width} 像素。`); }
  const scale = Math.min(1, 2480 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); return fail('浏览器无法处理这张图片。'); }
  if (kind === 'cover') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, context };
}

async function base64Of(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * A chosen file as a cover image, in the browser: drawn once and saved as JPEG at the file's own size (at most 2480
 * pixels wide, A4 at 300 dpi), lowering the quality until it fits. A file that is not A4 portrait is refused rather
 * than cropped or stretched.
 */
export async function coverImageFromFile(file: File, note: string): Promise<CoverImage> {
  const { canvas } = await decode(file, 'cover');
  for (const quality of [0.92, 0.86, 0.8, 0.72, 0.62]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size > PAGE_ART_LIMITS.cover.bytes) continue;
    return parseCoverImage({ schema: 'CoverImage/v1', mime: 'image/jpeg', data: await base64Of(blob), widthPx: canvas.width, heightPx: canvas.height, note });
  }
  return fail('封面图压缩后仍超过 1 MB，请换一张细节少一些或尺寸小一些的图。');
}

/**
 * A chosen file as a frame image: a transparent PNG, kept as PNG. Refused when any ornament reaches into the text
 * area (plus its 3 mm protection) or the page-number zone, so the frame can never cover a word.
 */
export async function frameImageFromFile(file: File, note: string): Promise<FrameImage> {
  const { canvas, context } = await decode(file, 'frame');
  const pxPerMm = canvas.width / 210;
  for (const zone of FRAME_CLEAR_ZONES_MM) {
    const x = Math.floor(zone.x0 * pxPerMm), y = Math.floor(zone.y0 * pxPerMm);
    const pixels = context.getImageData(x, y, Math.ceil(zone.x1 * pxPerMm) - x, Math.ceil(zone.y1 * pxPerMm) - y).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) fail('页框图的装饰进入了正文区（含 3 mm 保护带）或页码区。请用页框技能重新排布，正文区必须完全透明。');
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob || blob.size > PAGE_ART_LIMITS.frame.bytes) return fail('页框图超过 600 KB，请用 150 dpi 的透明 PNG。');
  return parseFrameImage({ schema: 'FrameImage/v1', mime: 'image/png', data: await base64Of(blob), widthPx: canvas.width, heightPx: canvas.height, note });
}
