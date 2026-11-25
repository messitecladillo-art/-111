/**
 * Lightweight zero-dependency schema types and binary PNG/JPEG header validators for report cover, page-frame,
 * and section-illustration payloads. Kept separate from prompt pools and canvas pixel processors in `page-art.ts`
 * so `editor-model.ts` (and initial `/agent` & `/workspace` bundles) stay free of heavy artwork generation logic.
 */

export type PageArtMime = 'image/jpeg' | 'image/png';
export type CoverImage = {
  schema: 'CoverImage/v1';
  mime: PageArtMime;
  data: string;
  widthPx: number;
  heightPx: number;
  note: string;
};
export type FrameImage = {
  schema: 'FrameImage/v1';
  mime: 'image/png';
  data: string;
  widthPx: number;
  heightPx: number;
  note: string;
};
export type SectionIllustration = {
  schema: 'SectionIllustration/v1';
  id: string;
  resultId: string;
  mime: PageArtMime;
  data: string;
  widthPx: number;
  heightPx: number;
  note: string;
};
export type PageArt = CoverImage | FrameImage;

export const PAGE_ART_LIMITS = {
  cover: { bytes: 1_000_000, mimes: ['image/jpeg', 'image/png'] as PageArtMime[] },
  frame: { bytes: 600_000, mimes: ['image/png'] as PageArtMime[] },
  minWidth: 800,
  maxSide: 6000,
  aspectTolerance: 0.015,
  note: 300,
} as const;

export const SECTION_ILLUSTRATION_LIMITS = {
  maxBytes: 650_000,
  maxCount: 12,
  minWidth: 320,
  maxWidth: 2400,
  minHeight: 200,
  maxHeight: 1800,
} as const;

/** A4 portrait, width over height. */
export const A4_ASPECT = 210 / 297;

/** The A4 page in CSS pixels (96 per inch), as Word image sizes are given. */
export const A4_PAGE_PX = {
  width: Math.round((210 / 25.4) * 96),
  height: Math.round((297 / 25.4) * 96),
} as const;

const fail = (message: string): never => {
  throw Error(message);
};

const invalid = (kind: 'cover' | 'frame') =>
  fail(
    kind === 'cover'
      ? '所选封面图不符合规格，请使用宽至少 800 像素且不超过 1 MB 的 A4 竖版 JPEG 或 PNG 整页图。'
      : '所选页框图不符合规格，请使用宽至少 800 像素且不超过 600 KB 的 A4 竖版透明 PNG。',
  );

function bytesOf(base64: string, kind: 'cover' | 'frame'): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(base64) || base64.length % 4) return invalid(kind);
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The pixel size a PNG or JPEG file states in its own header, or null when the header is not one of them. */
export function imageSize(bytes: Uint8Array, mime: PageArtMime): { width: number; height: number } | null {
  const u32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  if (mime === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (
      bytes.length < 24
      || signature.some((b, i) => bytes[i] !== b)
      || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
    ) {
      return null;
    }
    return { width: u32(16), height: u32(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = u16(i + 2);
    if (length < 2) return null;
    // Start-of-frame markers (baseline, progressive, …), excluding DHT, JPG and DAC.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: u16(i + 7), height: u16(i + 5) };
    }
    i += 2 + length;
  }
  return null;
}

function parseArt(value: unknown, kind: 'cover' | 'frame'): PageArt {
  const schema = kind === 'cover' ? 'CoverImage/v1' : 'FrameImage/v1';
  const limits = PAGE_ART_LIMITS[kind];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(kind);
  const x = value as Record<string, unknown>;
  const keys = ['schema', 'mime', 'data', 'widthPx', 'heightPx', 'note'];
  if (Object.keys(x).length !== keys.length || Object.keys(x).some((k) => !keys.includes(k)) || x.schema !== schema) {
    return invalid(kind);
  }
  if (!limits.mimes.includes(x.mime as PageArtMime)) return invalid(kind);
  const mime = x.mime as PageArtMime;
  if (typeof x.data !== 'string' || x.data.length > Math.ceil(limits.bytes / 3) * 4) return invalid(kind);
  const bytes = bytesOf(x.data, kind);
  if (bytes.length > limits.bytes) return invalid(kind);
  const size = imageSize(bytes, mime);
  if (!size || size.width !== x.widthPx || size.height !== x.heightPx) return invalid(kind);
  if (size.width < PAGE_ART_LIMITS.minWidth || Math.max(size.width, size.height) > PAGE_ART_LIMITS.maxSide) {
    return invalid(kind);
  }
  if (Math.abs(size.width / size.height / A4_ASPECT - 1) > PAGE_ART_LIMITS.aspectTolerance) return invalid(kind);
  const note =
    typeof x.note === 'string'
    && x.note.trim()
    && Array.from(x.note).length <= PAGE_ART_LIMITS.note
    && !/[\u0000-\u001f\u007f]/u.test(x.note)
      ? x.note
      : invalid(kind);
  return { schema, mime, data: x.data, widthPx: size.width, heightPx: size.height, note } as PageArt;
}

export const parseCoverImage = (value: unknown) => parseArt(value, 'cover') as CoverImage;
export const parseFrameImage = (value: unknown) => parseArt(value, 'frame') as FrameImage;
export const pageArtDataUrl = (art: PageArt) => `data:${art.mime};base64,${art.data}`;
export const pageArtBytes = (art: PageArt) => bytesOf(art.data, art.schema === 'CoverImage/v1' ? 'cover' : 'frame');

const invalidIllustration = () =>
  fail('章节配图不符合规格，请使用 320×200 至 2400×1800 像素且单幅不超过 650 KB 的 PNG 或 JPEG 图像。');

function illustrationBytesOf(base64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(base64) || base64.length % 4) return invalidIllustration();
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function parseSectionIllustration(value: unknown): SectionIllustration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidIllustration();
  const x = value as Record<string, unknown>;
  const keys = ['schema', 'id', 'resultId', 'mime', 'data', 'widthPx', 'heightPx', 'note'];
  if (
    Object.keys(x).length !== keys.length
    || Object.keys(x).some((k) => !keys.includes(k))
    || x.schema !== 'SectionIllustration/v1'
  ) {
    return invalidIllustration();
  }
  const cleanToken = (v: unknown) =>
    typeof v === 'string' && v.trim().length >= 1 && v.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(v)
      ? v.trim()
      : null;
  const id = cleanToken(x.id);
  const resultId = cleanToken(x.resultId);
  if (!id || !resultId) return invalidIllustration();
  if (x.mime !== 'image/png' && x.mime !== 'image/jpeg') return invalidIllustration();
  const mime = x.mime as PageArtMime;
  if (typeof x.data !== 'string' || x.data.length > Math.ceil(SECTION_ILLUSTRATION_LIMITS.maxBytes / 3) * 4) {
    return invalidIllustration();
  }
  const bytes = illustrationBytesOf(x.data);
  if (bytes.length > SECTION_ILLUSTRATION_LIMITS.maxBytes) return invalidIllustration();
  const size = imageSize(bytes, mime);
  if (!size || size.width !== x.widthPx || size.height !== x.heightPx) return invalidIllustration();
  if (
    size.width < SECTION_ILLUSTRATION_LIMITS.minWidth
    || size.width > SECTION_ILLUSTRATION_LIMITS.maxWidth
    || size.height < SECTION_ILLUSTRATION_LIMITS.minHeight
    || size.height > SECTION_ILLUSTRATION_LIMITS.maxHeight
  ) {
    return invalidIllustration();
  }
  const note =
    typeof x.note === 'string'
    && x.note.trim()
    && Array.from(x.note).length <= PAGE_ART_LIMITS.note
    && !/[\u0000-\u001f\u007f]/u.test(x.note)
      ? x.note.trim()
      : invalidIllustration();
  return { schema: 'SectionIllustration/v1', id, resultId, mime, data: x.data, widthPx: size.width, heightPx: size.height, note };
}

export const sectionIllustrationDataUrl = (art: SectionIllustration): string => `data:${art.mime};base64,${art.data}`;
export const sectionIllustrationBytes = (art: SectionIllustration): Uint8Array => illustrationBytesOf(art.data);
