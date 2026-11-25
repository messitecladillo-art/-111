import { NextResponse } from 'next/server';
import type sharp from 'sharp';
import { IMAGE_GEN_MODELS, retractFrameRgbaCrisply } from '@/lib/agent/image-gen-engine';
import { boundedGatewayJson, localGatewayAllowed } from '@/lib/agent/local-gateway-policy';

export const runtime = 'nodejs';

const COVER_MAX_BYTES = 1_000_000;
const FRAME_MAX_BYTES = 600_000;
const SECTION_ART_MAX_PNG_BYTES = 580_000;
const SECTION_ART_MAX_JPEG_BYTES = 580_000;

const TRACK2_SERVER_GUARDRAIL =
  'Non-quantitative editorial visual rules: strictly zero embedded text, zero Chinese or English characters, zero garbled pseudo-Chinese strokes, zero numbers or percentages, no fake axis ticks or chart bars, no logos or watermarks, and no photorealistic human faces or fake fieldwork photos.';

const CLEAN_BACKDROP_LIGHT_GUARDRAIL =
  'Clean Cover Backdrop Layer rules: strictly zero embedded text, zero Chinese characters, zero English letters, zero Arabic numerals, zero seal stamps or watermarks; reserve upper 44%–58% and bottom 10% as clean breathable light negative space for vector typography overlay.';

const CLEAN_BACKDROP_DARK_GUARDRAIL =
  'Clean Cover Backdrop Layer rules (dark mood): strictly zero embedded text, zero Chinese characters, zero English letters, zero Arabic numerals, zero seal stamps or watermarks; reserve upper 44%–58% and bottom 10% as calm, deep dark-toned negative space for light luminous vector typography overlay.';

const EMBEDDED_TYPOGRAPHY_SERVER_GUARDRAIL =
  '高精中文排版铁律：仅精确渲染双引号内指定的简体中文标题、类别标签与百分比数值，逐字核对 12 画以上汉字偏旁部首（如“痛”字必为病字头疒而非三点水浦、“触”为角+虫、“庭”为广字头、“频”为步+页、“驿”、“签”、“龄”），笔画锐利零粘连零错字；凡含 10 格小人剪影条，点亮彩色小人数必须严格等于百分比除以 10 四舍五入整数（如 19.6% 必画 2 个彩色小人 + 8 个浅灰未点亮小人）；严禁出现伪汉字乱码、多余英文水印、校徽院徽或机构 Logo。';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triplet >>> 18) & 63];
    out += BASE64_ALPHABET[(triplet >>> 12) & 63];
    out += i + 1 < len ? BASE64_ALPHABET[(triplet >>> 6) & 63] : '=';
    out += i + 2 < len ? BASE64_ALPHABET[triplet & 63] : '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/gu, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = Math.floor((clean.length * 3) / 4) - pad;
  const out = new Uint8Array(byteLen);
  let pos = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 3]);
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (pos < byteLen) out[pos++] = (triplet >>> 16) & 255;
    if (pos < byteLen) out[pos++] = (triplet >>> 8) & 255;
    if (pos < byteLen) out[pos++] = triplet & 255;
  }
  return out;
}

function isRasterSignature(bytes: Uint8Array): boolean {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return true;
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/**
 * Resolves OpenAI API key from env or, ONLY in non-production local dev when env is unset,
 * `.local/openai.key` at the repo root. Never logs or exposes the key.
 */
async function resolveOpenAiServerKey(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const fromEnv = (env.OPENAI_API_KEY || env.IMAGE_GEN_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  if (env.NODE_ENV === 'production') return '';

  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const cwd = typeof process.cwd === 'function' ? process.cwd() : '.';
    const candidates = [
      ...(typeof env.EVIX_LOCAL_OPENAI_KEY_FILE === 'string' && env.EVIX_LOCAL_OPENAI_KEY_FILE.trim()
        ? [env.EVIX_LOCAL_OPENAI_KEY_FILE.trim()]
        : []),
      path.resolve(cwd, '.local', 'openai.key'),
      path.resolve(cwd, '..', '..', '.local', 'openai.key'),
    ];
    for (const candidate of candidates) {
      if (!candidate || !fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, 'utf8').trim();
      if (!raw) continue;
      const kvMatch = raw.match(/^(?:export\s+)?(?:OPENAI_API_KEY|IMAGE_GEN_API_KEY)\s*=\s*['"]?([^\r\n'"]+)['"]?$/mu);
      const parsedKey = (kvMatch ? kvMatch[1] : raw.split(/\r?\n/u)[0] ?? '').trim();
      if (parsedKey && parsedKey.length <= 512 && !/\s/u.test(parsedKey)) {
        return parsedKey;
      }
    }
  } catch {
    return '';
  }
  return '';
}

function derivePaletteFromRgba(rgba: ArrayLike<number>) {
  const toHex = (c: readonly number[]) =>
    `#${c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const hsl = ([r, g, b]: readonly number[]) => {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const h =
      d === 0
        ? 0
        : max === R
          ? 60 * (((G - B) / d) % 6)
          : max === G
            ? 60 * ((B - R) / d + 2)
            : 60 * ((R - G) / d + 4);
    return { h: (h + 360) % 360, s, l };
  };
  const luminance = (hex: string) =>
    channels(hex)
      .map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const scale = (c: readonly number[], t: number) => c.map(v => v * t);

  const points: number[][] = [];
  const count = Math.floor(rgba.length / 4);
  const step = Math.max(1, Math.floor(count / 6000));
  for (let i = 0; i < count; i += step) {
    if (rgba[i * 4 + 3] > 200) points.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  }
  if (points.length < 12) {
    return { schema: 'FigurePalette/v1' as const, primary: '#0F766E', secondary: '#C99A3E', opposite: '#A65A3A', source: 'cover' as const };
  }
  const k = 8;
  let centers = Array.from({ length: k }, (_, j) => points[Math.floor(((j + 0.5) * points.length) / k)].slice());
  let members: number[][][] = [];
  for (let round = 0; round < 12; round++) {
    members = centers.map(() => []);
    for (const p of points) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      members[best].push(p);
    }
    centers = centers.map((c, j) =>
      members[j].length ? [0, 1, 2].map(d => members[j].reduce((s, p) => s + p[d], 0) / members[j].length) : c,
    );
  }
  const clusters = centers
    .map((c, j) => ({ c, weight: members[j].length / points.length, ...hsl(c) }))
    .filter(x => x.weight > 0.01);
  const coloured = clusters.filter(x => x.s >= 0.18);
  const primaryPick =
    [...coloured].filter(x => x.l <= 0.5).sort((a, b) => b.weight - a.weight)[0]
    ?? [...clusters].sort((a, b) => a.l - b.l)[0];
  const secondaryPick = coloured
    .filter(x => x !== primaryPick && hueGap(x.h, primaryPick.h) >= 50 && x.l >= 0.3 && x.l <= 0.75)
    .sort((a, b) => b.weight * b.s - a.weight * a.s)[0];
  const oppositePick = coloured
    .filter(
      x =>
        x !== primaryPick
        && x !== secondaryPick
        && hueGap(x.h, primaryPick.h) >= 40
        && (!secondaryPick || hueGap(x.h, secondaryPick.h) >= 15)
        && x.l >= 0.2
        && x.l <= 0.6,
    )
    .sort((a, b) => b.weight * b.s - a.weight * a.s)[0];

  const saturate = (c: readonly number[], f: number) => {
    const m = (c[0] + c[1] + c[2]) / 3;
    return c.map(v => m + (v - m) * f);
  };
  const base = saturate(primaryPick.c, 1.5);
  let primary = toHex(base);
  for (let t = 0.92; luminance(primary) > 0.09 && t > 0.3; t -= 0.06) primary = toHex(scale(base, t));
  let secondary = secondaryPick ? toHex(secondaryPick.c) : '#C99A3E';
  for (let t = 0.95; secondaryPick && luminance(secondary) > 0.36 && t > 0.5; t -= 0.05) {
    secondary = toHex(scale(secondaryPick.c, t));
  }
  const opposite = oppositePick ? toHex(oppositePick.c) : '#A65A3A';
  return { schema: 'FigurePalette/v1' as const, primary, secondary, opposite, source: 'cover' as const };
}

function buildOpenAiGenerationPayload(
  model: string,
  promptText: string,
  aspect: string,
  isFrame: boolean,
  quality: 'high' | 'medium' | 'low' = 'medium',
  allowEmbeddedTypography = false,
): Record<string, unknown> {
  const effectiveModel =
    allowEmbeddedTypography && /^(?:gpt-image-1|gpt-image-1-mini|dall-e-3)$/iu.test(model)
      ? 'gpt-image-1.5'
      : model;
  const effectiveQuality: 'high' | 'medium' | 'low' = allowEmbeddedTypography ? 'high' : quality;

  if (/^(?:gpt-image-|chatgpt-image-)/iu.test(effectiveModel)) {
    return {
      model: effectiveModel,
      prompt: promptText,
      n: 1,
      size: aspect === '3:4' ? '1024x1536' : aspect === '16:9' ? '1536x1024' : '1024x1024',
      quality: effectiveQuality,
      output_format: 'png',
      ...(isFrame ? { background: 'transparent' } : {}),
    };
  }
  if (/^dall-e-3$/iu.test(effectiveModel)) {
    return {
      model: 'dall-e-3',
      prompt: Array.from(promptText).slice(0, 3900).join(''),
      n: 1,
      size: aspect === '3:4' ? '1024x1792' : aspect === '16:9' ? '1792x1024' : '1024x1024',
      response_format: 'b64_json',
    };
  }
  return {
    model: effectiveModel,
    prompt: promptText,
    n: 1,
    size: aspect === '3:4' ? '1024x1536' : aspect === '16:9' ? '1536x1024' : '1024x1024',
    response_format: 'b64_json',
  };
}

async function normalizeOutputPngViaSharp(params: {
  rawBytes: Uint8Array;
  pageArtKind: 'cover' | 'frame' | null;
  aspect: string;
  accent: string;
  modelLabel: string;
  allowEmbeddedTypography?: boolean;
  canvasBackground?: 'white' | 'paper';
}): Promise<{
  encoded: string;
  mime: 'image/png' | 'image/jpeg';
  widthPx: number;
  heightPx: number;
  byteLength: number;
  pageArt?: Record<string, unknown>;
  figurePalette?: Record<string, unknown>;
  sectionArt?: {
    mime: 'image/png' | 'image/jpeg';
    data: string;
    widthPx: number;
    heightPx: number;
  };
} | null> {
  if (!isRasterSignature(params.rawBytes)) return null;

  let sharpFn: typeof sharp | null = null;
  try {
    const mod = await import('sharp');
    const resolved = (mod as unknown as { default?: typeof sharp }).default ?? (mod as unknown as typeof sharp);
    if (typeof resolved === 'function') sharpFn = resolved;
  } catch {
    return null;
  }
  if (!sharpFn) return null;

  const paperBg =
    params.canvasBackground === 'white'
      ? '#FFFFFF'
      : params.accent === 'blue'
        ? '#FAFAF8'
        : params.accent === 'burgundy'
          ? '#FBF9F7'
          : '#FCFAF5';

  if (params.pageArtKind === 'cover') {
    const steps: Array<{ w: number; h: number; palette: boolean; quality?: number; colours?: number }> = [
      { w: 1000, h: 1414, palette: false },
      { w: 1000, h: 1414, palette: true, quality: 90, colours: 256 },
      { w: 1000, h: 1414, palette: true, quality: 78, colours: 224 },
      { w: 900, h: 1273, palette: true, quality: 75, colours: 192 },
      { w: 840, h: 1188, palette: true, quality: 68, colours: 144 },
      { w: 840, h: 1188, palette: true, quality: 52, colours: 96 },
    ];
    let chosen: Uint8Array | null = null;
    let chosenW = 1000;
    let chosenH = 1414;
    for (const step of steps) {
      const out = await sharpFn(params.rawBytes)
        .flatten({ background: paperBg })
        .resize(step.w, step.h, { fit: 'cover', position: 'centre' })
        .png(
          step.palette
            ? { palette: true, quality: step.quality, colours: step.colours, compressionLevel: 9, effort: 8 }
            : { compressionLevel: 9, adaptiveFiltering: true },
        )
        .toBuffer();
      chosen = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      chosenW = step.w;
      chosenH = step.h;
      if (chosen.byteLength <= COVER_MAX_BYTES) break;
    }
    if (!chosen || chosen.byteLength > COVER_MAX_BYTES) return null;

    const sampleBuf = await sharpFn(chosen).ensureAlpha().resize(120, 170, { fit: 'fill' }).raw().toBuffer();
    const sampleRgba = new Uint8Array(sampleBuf.buffer, sampleBuf.byteOffset, sampleBuf.byteLength);
    const figurePalette = derivePaletteFromRgba(sampleRgba);
    const encoded = bytesToBase64(chosen);
    const safeNote = params.allowEmbeddedTypography
      ? '国奖出版级 A4 图文一体封面（题名字形在图中）'
      : '国奖出版级 A4 报告封面底图';
    return {
      encoded,
      mime: 'image/png',
      widthPx: chosenW,
      heightPx: chosenH,
      byteLength: chosen.byteLength,
      pageArt: {
        schema: 'CoverImage/v1',
        mime: 'image/png',
        data: encoded,
        widthPx: chosenW,
        heightPx: chosenH,
        note: safeNote,
      },
      figurePalette,
    };
  }

  if (params.pageArtKind === 'frame') {
    const steps: Array<{ w: number; h: number; palette: boolean; quality?: number; colours?: number }> = [
      { w: 1000, h: 1414, palette: false },
      { w: 1000, h: 1414, palette: true, quality: 88, colours: 256 },
      { w: 900, h: 1273, palette: true, quality: 78, colours: 192 },
      { w: 840, h: 1188, palette: true, quality: 68, colours: 128 },
      { w: 840, h: 1188, palette: true, quality: 52, colours: 64 },
    ];
    let chosen: Uint8Array | null = null;
    let chosenW = 1000;
    let chosenH = 1414;
    for (const step of steps) {
      const rawBuf = await sharpFn(params.rawBytes)
        .ensureAlpha()
        .resize(step.w, step.h, { fit: 'cover', position: 'centre' })
        .raw()
        .toBuffer();
      const rgba = retractFrameRgbaCrisply(
        new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength),
        step.w,
        step.h,
      );

      const out = await sharpFn(rgba, { raw: { width: step.w, height: step.h, channels: 4 } })
        .png(
          step.palette
            ? { palette: true, quality: step.quality, colours: step.colours, compressionLevel: 9, effort: 8 }
            : { compressionLevel: 9, adaptiveFiltering: true },
        )
        .toBuffer();
      chosen = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      chosenW = step.w;
      chosenH = step.h;
      if (chosen.byteLength <= FRAME_MAX_BYTES) break;
    }
    if (!chosen || chosen.byteLength > FRAME_MAX_BYTES) return null;

    const encoded = bytesToBase64(chosen);
    const safeNote = '国奖出版级 A4 极简透明学术页框';
    return {
      encoded,
      mime: 'image/png',
      widthPx: chosenW,
      heightPx: chosenH,
      byteLength: chosen.byteLength,
      pageArt: {
        schema: 'FrameImage/v1',
        mime: 'image/png',
        data: encoded,
        widthPx: chosenW,
        heightPx: chosenH,
        note: safeNote,
      },
    };
  }

  // Non-page-art section/topic overview illustration: normalize to exact 1280×720 (or 960×960 for 1:1)
  // within SectionIllustration/v1 caps (PNG <= 580 KB preferred for direct LaTeX/Web/Word parity, else JPEG <= 580 KB).
  // When `allowEmbeddedTypography` is true (1536×1024 infographics/roadmaps), use `fit: 'contain'` on warm paper background
  // so top banners and bottom labels are never cropped!
  const outW = params.aspect === '1:1' ? 960 : 1280;
  const outH = params.aspect === '1:1' ? 960 : 720;
  const sectionResizeOpts = params.allowEmbeddedTypography && params.aspect !== '1:1'
    ? ({ fit: 'contain', background: paperBg } as const)
    : ({ fit: 'cover', position: 'centre' } as const);

  const pngAttempts: Array<{ palette: boolean; quality?: number; colours?: number; dither?: number }> = [
    { palette: false },
    { palette: true, quality: 94, colours: 256, dither: 0.1 },
    { palette: true, quality: 86, colours: 240, dither: 0.1 },
    { palette: true, quality: 76, colours: 192, dither: 0.15 },
    { palette: true, quality: 64, colours: 144, dither: 0.15 },
  ];

  for (const step of pngAttempts) {
    const out = await sharpFn(params.rawBytes)
      .flatten({ background: paperBg })
      .resize(outW, outH, sectionResizeOpts)
      .png(
        step.palette
          ? { palette: true, quality: step.quality, colours: step.colours, dither: step.dither ?? 0.15, compressionLevel: 9, effort: 8 }
          : { compressionLevel: 9, adaptiveFiltering: true },
      )
      .toBuffer();
    if (out.byteLength <= SECTION_ART_MAX_PNG_BYTES) {
      const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      const encoded = bytesToBase64(bytes);
      return {
        encoded,
        mime: 'image/png',
        widthPx: outW,
        heightPx: outH,
        byteLength: bytes.byteLength,
        sectionArt: {
          mime: 'image/png',
          data: encoded,
          widthPx: outW,
          heightPx: outH,
        },
      };
    }
  }

  for (const quality of [86, 78, 70, 62, 54]) {
    const out = await sharpFn(params.rawBytes)
      .flatten({ background: paperBg })
      .resize(outW, outH, sectionResizeOpts)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.byteLength <= SECTION_ART_MAX_JPEG_BYTES || quality === 54) {
      const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      const encoded = bytesToBase64(bytes);
      return {
        encoded,
        mime: 'image/jpeg',
        widthPx: outW,
        heightPx: outH,
        byteLength: bytes.byteLength,
        sectionArt: {
          mime: 'image/jpeg',
          data: encoded,
          widthPx: outW,
          heightPx: outH,
        },
      };
    }
  }
  return null;
}

export async function GET(req: Request) {
  const allowed = localGatewayAllowed(req, process.env);
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const openAiKey = allowed ? await resolveOpenAiServerKey(process.env) : '';
  return NextResponse.json(
    {
      providers: {
        gemini: allowed && Boolean(geminiKey),
        imagen: allowed && Boolean(geminiKey),
        openai_compatible: allowed && Boolean(openAiKey),
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

function composite(modelId: string, modelLabel: string, reason: string) {
  return NextResponse.json({ ok: true, mode: 'data_bound_composite', modelId, modelLabel, fallbackReason: reason });
}

function failed(code: string, message: string, status = 502) {
  // The browser already has a deterministic preview. Do not call it a successful provider result.
  return NextResponse.json({ ok: false, code, error: message, fallbackReason: message }, { status });
}

export async function POST(req: Request) {
  if (!localGatewayAllowed(req, process.env)) {
    return composite(
      IMAGE_GEN_MODELS[0].id,
      IMAGE_GEN_MODELS[0].label,
      '未发起外部模型调用。当前展示本地绘制的数据统计图；如需在线精绘，请登录账号并启用已保存的个人服务配置。',
    );
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await boundedGatewayJson(req, 40_000);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_json');
    body = parsed as Record<string, unknown>;
  } catch {
    return failed('invalid_json', '请求内容格式无效或超出大小限制。', 400);
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 8000) return failed('invalid_prompt', '画面描述需在 1 至 8000 字之间。', 422);
  const spec = IMAGE_GEN_MODELS.find(m => m.id === body.modelId) ?? IMAGE_GEN_MODELS[0];
  const aspect = body.aspect ?? '16:9';
  if (!['16:9', '3:4', '1:1'].includes(String(aspect))) return failed('invalid_aspect', '图像比例无效。', 422);
  const requestedModel = typeof body.customModelName === 'string' ? body.customModelName.trim() : '';
  if (requestedModel && !/^[a-zA-Z0-9._:/-]{1,100}$/.test(requestedModel)) return failed('invalid_model', '绘图通道名称无效。', 422);
  const modelName = requestedModel || spec.apiModel;
  const customBase = (process.env.IMAGE_GEN_BASE_URL || '').trim().replace(/\/+$/u, '');
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const defaultOpenAiBase = customBase && /^https:\/\//iu.test(customBase) ? customBase : 'https://api.openai.com/v1';
  let activeProvider: 'openai_compatible' | 'gemini' | 'imagen' = spec.provider;
  const userBase = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/u, '') : '';
  const initialBase = activeProvider === 'openai_compatible' ? defaultOpenAiBase : 'https://generativelanguage.googleapis.com';
  // Public arbitrary URLs would turn this server into a credential-forwarding SSRF proxy.
  if (userBase && userBase !== initialBase && userBase !== 'https://api.openai.com/v1') {
    return failed('unsupported_gateway', '当前入口仅支持受信任的固定服务地址；如需连接自定义服务，请在个人服务设置中配置。', 422);
  }
  const userKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const openAiKey = userKey || (await resolveOpenAiServerKey(process.env));
  let apiKey = activeProvider === 'openai_compatible' ? openAiKey : (userKey || geminiKey);

  // Automatic failover from OpenAI -> Gemini when OpenAI key is missing and Gemini key is configured
  if (!apiKey && activeProvider === 'openai_compatible' && geminiKey && body.disableFallback !== true) {
    activeProvider = 'gemini';
    apiKey = geminiKey;
  }

  if (!apiKey) {
    if (body.allowDeterministicFallback === false) {
      return NextResponse.json(
        {
          ok: false,
          code: 'image_provider_not_configured',
          errorCode: 'image_provider_not_configured',
          error: '尚未配置可用的在线绘图服务凭据，已停止回退占位图。请先在服务设置中完成配置。',
          fallbackReason: '尚未配置可用的在线绘图服务凭据。',
        },
        { status: 503 },
      );
    }
    return composite(spec.id, spec.label, '尚未配置在线绘图服务凭据，未发起外部调用。当前展示本地绘制的数据统计图。');
  }
  const effectiveModelName =
    activeProvider !== spec.provider
      ? 'gemini-2.5-flash-image-preview'
      : modelName;
  const base = activeProvider === 'openai_compatible' ? defaultOpenAiBase : 'https://generativelanguage.googleapis.com';
  if (apiKey.length > 512 || /[\r\n]/u.test(apiKey) || prompt.includes(apiKey)) {
    return failed('sensitive_input', '服务凭据格式或画面描述内容无效，未发起外部调用。', 422);
  }

  const coverPipelineMode: 'direct_illustrated' | 'layered_assembly' | undefined =
    body.coverPipelineMode === 'layered_assembly'
      ? 'layered_assembly'
      : body.coverPipelineMode === 'direct_illustrated'
        ? 'direct_illustrated'
        : undefined;
  const coverLayer: 'reference' | 'clean_backdrop' | undefined =
    body.layer === 'clean_backdrop'
      ? 'clean_backdrop'
      : body.layer === 'reference'
        ? 'reference'
        : undefined;
  const isCleanBackdropLayer = coverLayer === 'clean_backdrop';

  const pageArtKind: 'cover' | 'frame' | null =
    body.pageArtKind === 'cover' || body.task === 'report_cover' || Boolean(coverPipelineMode || coverLayer)
      ? 'cover'
      : body.pageArtKind === 'frame' || body.task === 'report_frame'
        ? 'frame'
        : null;
  const isFrame = pageArtKind === 'frame';
  const accent = typeof body.accent === 'string' && ['teal', 'blue', 'burgundy'].includes(body.accent) ? body.accent : 'teal';
  const allowEmbeddedTypography = isCleanBackdropLayer
    ? false
    : body.allowEmbeddedTypography === true || coverLayer === 'reference';
  const requestedQuality: 'high' | 'medium' | 'low' =
    allowEmbeddedTypography ? 'high' : body.quality === 'high' ? 'high' : body.quality === 'low' ? 'low' : 'medium';

  // Enforce either controlled Chinese typography rules (when allowEmbeddedTypography === true),
  // Clean Backdrop zero-text negative-space rules (`layer === 'clean_backdrop'`),
  // or Track 2 strict zero-text rules when task / pageArtKind is specified.
  let upstreamPrompt = prompt;
  if (isCleanBackdropLayer) {
    if (!/strictly zero text, zero characters|Clean Cover Backdrop Layer/iu.test(prompt)) {
      const backdropGuardrail = body.inkMode === 'light_on_dark' ? CLEAN_BACKDROP_DARK_GUARDRAIL : CLEAN_BACKDROP_LIGHT_GUARDRAIL;
      upstreamPrompt = `${prompt.slice(0, 7400)}\n${backdropGuardrail}`;
    }
  } else if (allowEmbeddedTypography) {
    if (!/高精中文排版铁律/u.test(prompt)) {
      upstreamPrompt = `${prompt.slice(0, 7400)}\n${EMBEDDED_TYPOGRAPHY_SERVER_GUARDRAIL}`;
    }
  } else if (
    Boolean(body.task || pageArtKind)
    && !/(?:零内嵌文字|zero\s+embedded\s+text)/iu.test(prompt)
  ) {
    upstreamPrompt = `${prompt.slice(0, 7400)}\n${TRACK2_SERVER_GUARDRAIL}`;
  }
  if (upstreamPrompt.includes(apiKey)) {
    return failed('sensitive_input', '服务凭据格式或画面描述内容无效，未发起外部调用。', 422);
  }

  let endpoint: string;
  let payload: Record<string, unknown>;
  if (activeProvider === 'gemini') {
    endpoint = `${base}/v1beta/models/${encodeURIComponent(effectiveModelName)}:generateContent`;
    payload = { contents: [{ parts: [{ text: upstreamPrompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } };
  } else if (activeProvider === 'imagen') {
    endpoint = `${base}/v1beta/models/${encodeURIComponent(effectiveModelName)}:predict`;
    payload = { instances: [{ prompt: upstreamPrompt }], parameters: { sampleCount: 1, aspectRatio: aspect } };
  } else {
    endpoint = `${base}/images/generations`;
    payload = buildOpenAiGenerationPayload(
      effectiveModelName,
      upstreamPrompt,
      String(aspect),
      isFrame,
      requestedQuality,
      allowEmbeddedTypography,
    );
  }

  let authHeaders: Record<string, string> =
    activeProvider === 'openai_compatible'
      ? { Authorization: `Bearer ${apiKey}` }
      : { 'x-goog-api-key': apiKey };

  let resolvedModel = typeof payload.model === 'string' ? payload.model : effectiveModelName;

  try {
    let upstream = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });

    // Live OpenAI fallback chain: step through gpt-image-2 -> chatgpt-image-latest -> gpt-image-1.5 -> gpt-image-1 -> dall-e-3
    // on deterministic 400/403/404 model rejections while NEVER retrying 5xx or network-lost unknown outcomes.
    if (
      !upstream.ok
      && upstream.status < 500
      && [400, 403, 404].includes(upstream.status)
      && activeProvider === 'openai_compatible'
      && /^(?:gpt-image-|chatgpt-image-)/iu.test(resolvedModel)
      && base === 'https://api.openai.com/v1'
      && body.disableFallback !== true
    ) {
      const fallbackModels = ['gpt-image-2', 'chatgpt-image-latest', 'gpt-image-1.5', 'gpt-image-1', 'dall-e-3']
        .filter(m => m.toLowerCase() !== resolvedModel.toLowerCase() && m.toLowerCase() !== effectiveModelName.toLowerCase());
      for (const candidateModel of fallbackModels) {
        await upstream.body?.cancel().catch(() => undefined);
        resolvedModel = candidateModel;
        const fallbackPayload = buildOpenAiGenerationPayload(
          candidateModel,
          upstreamPrompt,
          String(aspect),
          /^(?:gpt-image-|chatgpt-image-)/iu.test(candidateModel) ? isFrame : false,
          requestedQuality,
          allowEmbeddedTypography && /^(?:gpt-image-2|gpt-image-1\.5|chatgpt-image-latest)$/iu.test(candidateModel),
        );
        upstream = await fetch(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(fallbackPayload),
          signal: AbortSignal.timeout(90_000),
        });
        if (upstream.ok || upstream.status >= 500 || ![400, 403, 404].includes(upstream.status)) {
          break;
        }
      }
    }

    // Automatic Gemini failover when OpenAI rejects with 429 quota exhaustion and server has GEMINI_API_KEY configured
    if (
      !upstream.ok
      && upstream.status === 429
      && activeProvider === 'openai_compatible'
      && geminiKey
      && body.disableFallback !== true
    ) {
      await upstream.body?.cancel().catch(() => undefined);
      activeProvider = 'gemini';
      resolvedModel = 'gemini-2.5-flash-image-preview';
      apiKey = geminiKey;
      authHeaders = { 'x-goog-api-key': geminiKey };
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`;
      upstream = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ contents: [{ parts: [{ text: upstreamPrompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
        signal: AbortSignal.timeout(90_000),
      });
    }

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return NextResponse.json(
          {
            ok: false,
            code: 'image_provider_quota_exhausted',
            errorCode: 'image_provider_quota_exhausted',
            error: '在线绘图服务调用额度已满（状态码 429），请稍后重试或切换其他可用绘图通道。',
            fallbackReason: '在线绘图服务调用额度已满（状态码 429）。',
          },
          { status: 429 },
        );
      }
      if (upstream.status >= 500) {
        return failed('provider_outcome_unknown', '在线绘图响应尚未确认，请稍后核对调用记录。当前展示本地预览图。');
      }
      return failed('provider_rejected', `在线绘图请求未获通过（状态码 ${upstream.status}）。当前展示本地预览图。`);
    }

    const json = (await boundedGatewayJson(upstream, 20_000_000)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>;
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      data?: Array<{ b64_json?: string; revised_prompt?: string }>;
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find(p => p.inlineData?.data)?.inlineData;
    const prediction = json.predictions?.[0];
    const item = json.data?.[0];
    const encodedRaw =
      activeProvider === 'gemini'
        ? inline?.data
        : activeProvider === 'imagen'
          ? prediction?.bytesBase64Encoded
          : item?.b64_json;
    const mimeRaw =
      (activeProvider === 'gemini' ? inline?.mimeType : activeProvider === 'imagen' ? prediction?.mimeType : undefined)
      || 'image/png';
    const encodedClean = typeof encodedRaw === 'string' ? encodedRaw.replace(/\s+/gu, '') : '';
    if (
      !encodedClean
      || encodedClean.includes(apiKey)
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedClean)
      || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeRaw)
    ) {
      return failed('provider_outcome_unknown', '在线绘图服务未返回可核对的图像，本次调用结果尚未确认，请稍后核对调用记录。');
    }

    let finalEncoded = encodedClean;
    let finalMime: string = mimeRaw;
    let pageArt: Record<string, unknown> | undefined;
    let figurePalette: Record<string, unknown> | undefined;
    let sectionArt: { mime: 'image/png' | 'image/jpeg'; data: string; widthPx: number; heightPx: number } | undefined;

    try {
      const normalized = await normalizeOutputPngViaSharp({
        rawBytes: base64ToBytes(encodedClean),
        pageArtKind,
        aspect: String(aspect),
        accent,
        modelLabel: resolvedModel !== modelName ? `${spec.label}（${resolvedModel}）` : spec.label,
        allowEmbeddedTypography,
        canvasBackground: body.canvasBackground === 'white' ? 'white' : 'paper',
      });
      if (normalized && !normalized.encoded.includes(apiKey)) {
        finalEncoded = normalized.encoded;
        finalMime = normalized.mime;
        pageArt = normalized.pageArt;
        figurePalette = normalized.figurePalette;
        sectionArt = normalized.sectionArt;
      }
    } catch {
      // Keep verified upstream image if sharp normalization fails on synthetic/non-standard input
    }

    const revised = activeProvider === 'gemini' ? parts.find(p => p.text)?.text : item?.revised_prompt;
    return NextResponse.json({
      ok: true,
      mode: 'live_api',
      modelId: spec.id,
      resolvedModel,
      modelLabel: activeProvider !== spec.provider ? `${spec.label} · 自动切换通道` : spec.label,
      mime: finalMime,
      imageDataUrl: `data:${finalMime};base64,${finalEncoded}`,
      ...(coverPipelineMode ? { coverPipelineMode } : {}),
      ...(coverLayer ? { layer: coverLayer } : {}),
      ...(pageArt ? { pageArt } : {}),
      ...(figurePalette ? { figurePalette } : {}),
      ...(sectionArt ? { sectionArt } : {}),
      revisedPrompt: typeof revised === 'string' ? revised.split(apiKey).join('[REDACTED]').slice(0, 8000) : prompt,
    });
  } catch {
    return failed('provider_outcome_unknown', '在线绘图连接中断或响应异常，本次结果尚未确认。当前展示本地预览图。');
  }
}
