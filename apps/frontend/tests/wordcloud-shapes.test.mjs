import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutCloud, fontScale } from '../lib/topic-lab/wordcloud.ts';
import { DEFAULT_CLOUD_APPEARANCE, CLOUD_SHAPES, parseCloudAppearance, cloudShapeAspectRatio, cloudShapePath, cloudShapeContains, cloudShapeConstraint } from '../lib/topic-lab/cloud-shapes.ts';

const appearance = (shape, extra = {}) => ({ ...DEFAULT_CLOUD_APPEARANCE, shape, ...extra });
const mask = (width, height, foreground) => ({ width, height, label: '测试剪影', bits: Array.from({ length: width * height }, (_, i) => foreground(i % width, Math.floor(i / width)) ? '1' : '0').join('') });
const items = Array.from({ length: 64 }, (_, i) => ({ key: `term-${i}`, label: `示例${i}${i % 5 === 0 ? '长词组' : ''}`, weight: 11 - i % 10 }));
const measure = (text, size) => ({ w: [...text].reduce((n, c) => n + (/\d/u.test(c) ? .6 : 1), 0) * size, h: size * 1.12 });
const options = { width: 900, height: 540, minFont: 13, maxFont: 44, measure };

function verifyLayout(input, opts, result) {
  const expected = new Map(input.map(word => [word.key, word]));
  const all = [...result.placed, ...result.dropped];
  assert.equal(all.length, input.length);
  assert.equal(new Set(all.map(p => p.key)).size, input.length);
  const size = fontScale(input.map(p => p.weight), opts.minFont, opts.maxFont);
  const gap = opts.appearance?.spacing === 'relaxed' ? 7 : opts.appearance?.spacing === 'compact' ? 1 : 3;
  for (const word of all) {
    assert.equal(word.label, expected.get(word.key).label);
    assert.equal(word.weight, expected.get(word.key).weight);
  }
  for (const [i, p] of result.placed.entries()) {
    assert.equal(p.size, size(p.weight), `font size never changes for ${p.key}`);
    for (const q of result.placed.slice(i + 1)) {
      assert.ok(Math.abs(p.x - q.x) * 2 >= p.w + q.w + gap * 2 || Math.abs(p.y - q.y) * 2 >= p.h + q.h + gap * 2, `${p.key} and ${q.key} collide`);
    }
    // Check interior points as well as the perimeter, independently of the summed-area query.
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      assert.ok(cloudShapeContains(opts.appearance ?? DEFAULT_CLOUD_APPEARANCE, p.x + (x / 8 - .5) * p.w, p.y + (y / 8 - .5) * p.h, opts.width, opts.height), `${p.key} crosses ${opts.appearance?.shape}`);
    }
  }
}

test('all presets and rotations keep actual word boxes inside their silhouette without editing frequencies', () => {
  const customMask = mask(40, 24, (x, y) => x > 1 && x < 38 && y > 1 && y < 22 && !(x > 14 && x < 25 && y > 8 && y < 15));
  for (const { id: shape } of CLOUD_SHAPES) for (const orientation of ['horizontal', 'vertical']) {
    const look = appearance(shape, { orientation, ...(shape === 'custom' ? { customMask } : {}) });
    const opts = { ...options, appearance: look };
    const result = layoutCloud(items, opts);
    assert.ok(result.placed.length >= 6, `${shape} ${orientation} should remain useful`);
    verifyLayout(items, opts, result);
    assert.deepEqual(layoutCloud([...items].reverse(), opts), result);
  }
});

test('free default preserves its positions; spacing can change without resizing words', () => {
  assert.deepEqual(layoutCloud(items, options), layoutCloud(items, { ...options, appearance: DEFAULT_CLOUD_APPEARANCE }));
  for (const spacing of ['compact', 'standard', 'relaxed']) {
    const opts = { ...options, appearance: appearance('rectangle', { spacing }) };
    verifyLayout(items, opts, layoutCloud(items, opts));
  }
});

test('the claw and tail regions of a crayfish fill with real labels', () => {
  const input = Array.from({ length: 64 }, (_, i) => ({ key: String(i), label: `虾${i}`, weight: 5 - i % 4 }));
  const { width, height } = options;
  const { placed } = layoutCloud(input, { ...options, appearance: appearance('crayfish') });
  assert.ok(placed.some(p => p.x < width * .22), 'tail region populated');
  assert.ok(placed.some(p => p.x > width * .77 && p.y < height * .34), 'upper claw populated');
  assert.ok(placed.some(p => p.x > width * .77 && p.y > height * .66), 'lower claw populated');
});

test('full-box containment rejects an interior hole that all four corners miss', () => {
  const look = appearance('custom', { customMask: mask(32, 16, (x, y) => x < 14 || x > 17 || y < 6 || y > 9) });
  for (const orientation of ['horizontal', 'vertical']) {
    const oriented = { ...look, orientation }, w = 800, h = 650;
    const containsBox = cloudShapeConstraint(oriented, w, h);
    const corners = [[250, 225], [550, 225], [250, 425], [550, 425]];
    assert.ok(corners.every(([x, y]) => cloudShapeContains(oriented, x, y, w, h)));
    assert.equal(containsBox(400, 325, 300, 200), false);
    assert.equal(containsBox(320, 235, 22, 22), true);
    const outline = cloudShapePath(oriented, w, h);
    assert.match(outline, /^[MLZ\d. -]+$/u);
    assert.equal(outline.match(/Z/g).length, 2, 'one outer contour and one hole');
  }
  assert.equal(cloudShapeAspectRatio(look), 2);
  assert.equal(cloudShapeAspectRatio({ ...look, orientation: 'vertical' }), .5);
  assert.equal(cloudShapePath(DEFAULT_CLOUD_APPEARANCE, 800, 650), '');
});

test('circle-edge boxes and oversize labels are reported instead of clipped or shrunk', () => {
  const look = appearance('circle'), containsBox = cloudShapeConstraint(look, 400, 400);
  assert.equal(cloudShapeContains(look, 75, 75, 400, 400), true);
  assert.equal(containsBox(75, 75, 42, 42), false);
  const huge = { key: 'long', label: '不能放下的超长合成词'.repeat(40), weight: 30 };
  const result = layoutCloud([huge, ...items.slice(0, 8)], { ...options, width: 400, height: 400, appearance: look });
  assert.ok(result.dropped.some(p => p.key === huge.key));
  assert.ok(result.placed.length > 0);
  for (const invalid of [{ width: Infinity }, { height: 0 }, { padding: -3 }, { maxFont: 1 }]) {
    assert.deepEqual(layoutCloud([huge], { ...options, ...invalid, appearance: look }), { placed: [], dropped: [huge] });
  }
});

test('saved appearance validates bounded inert data, and rejects unrecognized or executable fields', () => {
  const customMask = mask(128, 128, (x, y) => (x - 64) ** 2 + (y - 64) ** 2 < 58 ** 2), value = appearance('custom', { customMask });
  const restored = parseCloudAppearance(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(restored, value);
  assert.notEqual(restored.customMask, customMask);
  for (const invalid of [appearance('alien'), appearance('custom'), { ...value, angle: 30 }, { ...value, outline: 'true' }, { ...value, orientation: 'diagonal' }, { ...value, customMask: { ...customMask, width: 129 } }, { ...value, customMask: { ...customMask, bits: '0'.repeat(16384) } }, { ...value, customMask: { ...customMask, bits: 'x'.repeat(16384) } }, { ...value, customMask: { ...customMask, label: 'x'.repeat(121) } }, { ...value, customMask: { ...customMask, src: 'https://example.invalid/shape.svg' } }]) assert.throws(() => parseCloudAppearance(invalid), /词云|剪影/);
  let invoked = false;
  const accessor = { ...value }; Object.defineProperty(accessor, 'customMask', { get() { invoked = true; return customMask; } });
  assert.throws(() => parseCloudAppearance(accessor), /访问器/);
  assert.equal(invoked, false);
});

test('200-term pressure input stays deterministic and accounts for every unplaced term', t => {
  const input = Array.from({ length: 200 }, (_, i) => ({ key: `stress-${i}`, label: `合成关键词${i}${'扩展'.repeat(i % 6)}`, weight: 200 - i }));
  for (const [width, height] of [[320, 300], [1440, 810]]) {
    const opts = { ...options, width, height, appearance: appearance('crayfish') };
    const start = performance.now(), result = layoutCloud(input, opts);
    t.diagnostic(`${width}×${height}: ${result.placed.length} placed, ${result.dropped.length} dropped in ${(performance.now() - start).toFixed(1)} ms`);
    assert.ok(result.dropped.length > 0);
    verifyLayout(input, opts, result);
    assert.deepEqual(layoutCloud(input, opts), result);
  }
});
