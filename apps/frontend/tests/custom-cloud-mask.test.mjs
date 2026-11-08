import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCloudImage, MAX_CLOUD_IMAGE_BYTES, pixelsToCloudMask } from '../lib/topic-lab/custom-cloud-mask.ts';

const pngHeader = (w, h) => {
  const bytes = Buffer.alloc(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); bytes.write('IHDR', 12); bytes.writeUInt32BE(w, 16); bytes.writeUInt32BE(h, 20);
  return bytes;
};

test('inspect actual raster headers and reject files whose decode dimensions exceed the bound', () => {
  assert.deepEqual(inspectCloudImage(pngHeader(1024, 768)), { width: 1024, height: 768, mime: 'image/png' });
  const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 7, 8, 0, 80, 0, 120]);
  assert.deepEqual(inspectCloudImage(jpeg), { width: 120, height: 80, mime: 'image/jpeg' });
  const webp = Buffer.alloc(30); webp.write('RIFF'); webp.write('WEBPVP8X', 8); webp[24] = 127; webp[27] = 95;
  assert.deepEqual(inspectCloudImage(webp), { width: 128, height: 96, mime: 'image/webp' });
  assert.throws(() => inspectCloudImage(pngHeader(4097, 1000)), /4096/);
  assert.throws(() => inspectCloudImage(pngHeader(4096, 4096)), /800 万/);
  assert.throws(() => inspectCloudImage(new Uint8Array(MAX_CLOUD_IMAGE_BYTES + 1)), /2 MB/);
  assert.throws(() => inspectCloudImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), /PNG、JPG 或 WebP/);
  assert.throws(() => inspectCloudImage(jpeg.subarray(0, 15)), /无法读取/);
});

function makePixels(w, h, color) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(color(x, y), (y * w + x) * 4);
  return rgba;
}

test('transparent and white backgrounds yield the same cropped silhouette and preserve the hole', () => {
  const shape = (x, y) => x >= 4 && x < 22 && y >= 3 && y < 17 && !(x >= 10 && x < 15 && y >= 6 && y < 13);
  const transparent = makePixels(28, 20, (x, y) => [255, 255, 255, shape(x, y) ? 255 : 0]);
  const white = makePixels(28, 20, (x, y) => shape(x, y) ? [12, 40, 26, 255] : [255, 255, 255, 255]);
  const a = pixelsToCloudMask(28, 20, transparent, 'silhouette.png'), b = pixelsToCloudMask(28, 20, white, 'silhouette.png');
  assert.deepEqual(a, b);
  assert.deepEqual({ width: a.width, height: a.height }, { width: 18, height: 14 });
  assert.equal(a.bits[5 * 18 + 7], '0');
  assert.equal(a.bits[0], '1');
  assert.equal(a.bits.match(/1/g).length, 18 * 14 - 5 * 7);
});

test('blank, solid, undersized and malformed silhouettes are rejected', () => {
  const color = value => makePixels(16, 16, () => [value, value, value, 255]);
  assert.throws(() => pixelsToCloudMask(16, 16, color(255), 'blank.png'), /清晰轮廓/);
  assert.throws(() => pixelsToCloudMask(16, 16, color(0), 'solid.png'), /清晰轮廓/);
  assert.throws(() => pixelsToCloudMask(16, 16, new Uint8ClampedArray(8), 'broken.png'), /像素格式/);
  assert.throws(() => pixelsToCloudMask(16, 16, makePixels(16, 16, (x, y) => [0, 0, 0, x === y ? 255 : 0]), 'thin.png'), /清晰轮廓/);
});

test('a bounded rectangular silhouette is valid even when its cropped mask is solid', () => {
  const pixels = makePixels(32, 24, (x, y) => [0, 0, 0, x >= 4 && x < 28 && y >= 4 && y < 20 ? 255 : 0]);
  assert.deepEqual(pixelsToCloudMask(32, 24, pixels, 'rectangle.png'), { width: 24, height: 16, bits: '1'.repeat(24 * 16), label: 'rectangle.png' });
});
