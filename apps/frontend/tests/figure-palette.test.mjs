import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteFromPixels, parseFigurePalette, figureInk } from '../lib/figure-palette.ts';
import { categoryColors, figurePlan } from '../lib/report-figures.ts';
import { applyCoverImage, createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { parseCoverImage } from '../lib/page-art.ts';

// An image of a navy field, a gold band, a rust patch and a little cream, as RGBA pixels.
function image() {
  const pixels = [];
  const fill = (rgb, n) => { for (let i = 0; i < n; i++) pixels.push(...rgb, 255); };
  fill([36, 54, 92], 5000); fill([217, 164, 65], 2500); fill([166, 90, 58], 900); fill([242, 227, 191], 1600);
  return Uint8Array.from(pixels);
}
const hue = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; return d === 0 ? 0 : max === r ? (60 * (((g - b) / d) % 6) + 360) % 360 : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); };

test('the figure palette is the cover’s own hues: its deep colour, a second hue and a third for the other side', () => {
  const p = paletteFromPixels(image());
  assert.equal(p.source, 'cover');
  assert.ok(Math.abs(hue(p.primary) - 220) < 15, `navy primary ${p.primary}`);
  assert.ok(Math.abs(hue(p.secondary) - 39) < 12, `gold secondary ${p.secondary}`);
  assert.ok(Math.abs(hue(p.opposite) - 18) < 12, `rust opposite ${p.opposite}`);
  assert.deepEqual(paletteFromPixels(image()), p, 'deterministic');
  assert.throws(() => parseFigurePalette({ ...p, primary: '#24365c' }), 'colours are upper-case hex');
});

test('unordered categories take the palette hues; ordered ones keep one hue’s ramp', () => {
  const p = { schema: 'FigurePalette/v1', primary: '#293652', secondary: '#C39045', opposite: '#A65A3A', source: 'cover' };
  assert.deepEqual(categoryColors(p, 3, false), ['#293652', '#C39045', '#A65A3A']);
  const ramp = categoryColors(p, 4, true);
  assert.ok(ramp.every(c => Math.abs(hue(c) - hue('#293652')) < 6), 'an ordered scale is one hue');
  assert.deepEqual(categoryColors('#0F766E', 3, false), categoryColors('#0F766E', 3, false), 'an accent alone behaves as before');
  const r = { id: 'r', method: 'frequency', title: '使用方式', headers: ['选项', '频数', '有效样本占比 (%)'], rows: [['堂食', 30, 50], ['送餐', 20, 33.3], ['未用', 10, 16.7]], metrics: [], warnings: [], n: 60, total: 60 };
  const plan = figurePlan(r, 1, p);
  assert.deepEqual(plan.option.color, ['#293652', '#C39045', '#A65A3A'], 'a three-answer ring takes the cover colours');
});

test('a cover brings its palette into the draft; removing the cover removes it, a palette chosen by hand stays', () => {
  const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(1000), ...u32(1414), 8, 2, 0, 0, 0]).toString('base64');
  const cover = parseCoverImage({ schema: 'CoverImage/v1', mime: 'image/png', data: png, widthPx: 1000, heightPx: 1414, note: '封面' });
  const palette = paletteFromPixels(image());
  const withCover = applyCoverImage(createEditorContent(), cover, palette);
  assert.deepEqual(withCover.figurePalette, palette);
  assert.deepEqual(figureInk(withCover), palette);
  assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(withCover))).figurePalette, palette);
  assert.equal(applyCoverImage(withCover, undefined).figurePalette, undefined);
  const manual = { ...palette, source: 'manual' };
  assert.deepEqual(applyCoverImage({ ...withCover, figurePalette: manual }, undefined).figurePalette, manual);
  assert.equal(figureInk(createEditorContent()), '#0F766E', 'without a cover the accent draws the figures');
});
