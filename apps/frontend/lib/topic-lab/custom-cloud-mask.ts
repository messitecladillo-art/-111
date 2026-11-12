import type { CloudMask } from './cloud-shapes.ts';

export const MAX_CLOUD_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 4096, MAX_PIXELS = 8_000_000;
const fail = (message: string): never => { throw Error(message); };
const dimensions = (width: number, height: number, mime: string) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 8 || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) return fail('请使用边长 8–4096 像素、总像素不超过 800 万的剪影。');
  return { width, height, mime };
};

/** Read only supported raster headers, before asking the browser to decode a bounded image. */
export function inspectCloudImage(bytes: Uint8Array): { width: number; height: number; mime: string } {
  if (!bytes.length || bytes.length > MAX_CLOUD_IMAGE_BYTES) return fail('剪影文件不能超过 2 MB。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) && String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR') return dimensions(view.getUint32(16), view.getUint32(20), 'image/png');
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) return fail('无法读取这张 JPG 剪影。');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3), 'image/jpeg');
      offset += length;
    }
    return fail('无法读取这张 JPG 剪影。');
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8X') return dimensions(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), 'image/webp');
    if (chunk === 'VP8L' && bytes[20] === 47) return dimensions(1 + bytes[21] + ((bytes[22] & 63) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10), 'image/webp');
    if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return dimensions(view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383, 'image/webp');
  }
  return fail('请选择 PNG、JPG 或 WebP 剪影。');
}

/** Keep only a small binary mask; the source image is neither stored nor uploaded. */
export function pixelsToCloudMask(width: number, height: number, pixels: Uint8ClampedArray, label: string): CloudMask {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 8 || width > 128 || height > 128 || pixels.length !== width * height * 4) return fail('剪影像素格式无效。');
  let translucent = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) translucent++;
  const alphaMask = translucent > width * height * .01;
  const cells = new Uint8Array(width * height);
  let left = width, right = -1, top = height, bottom = -1, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4, a = pixels[offset + 3] / 255;
    const luminance = (.2126 * pixels[offset] + .7152 * pixels[offset + 1] + .0722 * pixels[offset + 2]) * a + 255 * (1 - a);
    if (alphaMask ? a >= .5 : luminance < 190) {
      cells[y * width + x] = 1; count++;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  const w = right - left + 1, h = bottom - top + 1, share = count / (w * h);
  if (count < 24 || w < 8 || h < 8 || share < .04 || count / (width * height) > .95) return fail('未识别到清晰轮廓，请使用透明背景或白底深色的完整剪影。');
  let bits = '';
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) bits += cells[y * width + x] ? '1' : '0';
  return { width: w, height: h, bits, label: label.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 120) || '自定义剪影' };
}

function abortError() { return new DOMException('已取消剪影读取。', 'AbortError'); }
export async function readCustomCloudMask(file: File, signal: AbortSignal): Promise<CloudMask> {
  if (signal.aborted) throw abortError();
  if (file.size > MAX_CLOUD_IMAGE_BYTES) return fail('剪影文件不能超过 2 MB。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (signal.aborted) throw abortError();
  const { mime } = inspectCloudImage(bytes);
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(abortError()); signal.addEventListener('abort', onAbort, { once: true }); });
  // A late decoder result closes itself after cancellation rather than entering the component.
  const decoding = Promise.resolve().then(() => createImageBitmap(new Blob([bytes], { type: mime }), { imageOrientation: 'none' })).then(bitmap => {
    if (signal.aborted) { bitmap.close(); throw abortError(); }
    return bitmap;
  });
  let bitmap: ImageBitmap;
  try { bitmap = await Promise.race([decoding, cancelled]); }
  finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
  try {
    dimensions(bitmap.width, bitmap.height, '');
    if (signal.aborted) throw abortError();
    const ratio = Math.min(128 / bitmap.width, 128 / bitmap.height, 1);
    const width = Math.max(1, Math.round(bitmap.width * ratio)), height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fail('当前浏览器无法读取剪影。');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return pixelsToCloudMask(width, height, ctx.getImageData(0, 0, width, height).data, file.name);
  } finally { bitmap.close(); }
}
