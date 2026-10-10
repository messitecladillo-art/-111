import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendStageLayout, buildChronicleField, chainFormation, chronicleProgress, chronicleStage, maskFormation, oracleFormation,
  resolveChronicleProgress, ringFormation, seededRandom, stageLayout, CHRONICLE_DUST_RATIO, CHRONICLE_GLYPHS,
  CHRONICLE_LAST_STAGE, CHRONICLE_MIN_PARTICLES, CHRONICLE_MOBILE_PARTICLE_COUNT, CHRONICLE_PARTICLE_COUNT, CHRONICLE_STAGE_COUNT,
} from '../lib/landing-chronicle.ts';

const finite = array => array.every(Number.isFinite);
function squareMask(size, from, to) {
  const alpha = new Uint8Array(size * size);
  for (let y = from; y < to; y++) for (let x = from; x < to; x++) alpha[y * size + x] = 255;
  return { alpha, size };
}

test('desktop and mobile fields allocate equal, finite, bounded buffers for every stage', () => {
  for (const count of [CHRONICLE_PARTICLE_COUNT, CHRONICLE_MOBILE_PARTICLE_COUNT]) {
    const field = buildChronicleField(count);
    assert.equal(field.count, count);
    assert.equal(field.stages.length, CHRONICLE_STAGE_COUNT);
    assert.equal(field.seeds.length, count * 4);
    assert.equal(field.kinds.length, count);
    assert.equal(field.formationCount, Math.round(count * (1 - CHRONICLE_DUST_RATIO)));
    for (const stage of field.stages) {
      assert.equal(stage.length, count * 3);
      assert.ok(finite(stage));
      assert.ok(stage.every(v => Math.abs(v) <= 1.6));
    }
    assert.ok(field.seeds.every(v => v >= 0 && v < 1));
    assert.equal(field.kinds.filter(v => v === 1).length, count - field.formationCount);
  }
});

test('field generation is deterministic, the finale ring closes the loop, and dust is shared', () => {
  const a = buildChronicleField(4096), b = buildChronicleField(4096);
  assert.deepEqual(a, b);
  assert.deepEqual(a.stages[0], a.stages[CHRONICLE_LAST_STAGE]);
  const dustStart = a.formationCount * 3;
  for (const stage of a.stages) assert.deepEqual(stage.subarray(dustStart), a.stages[0].subarray(dustStart));
});

test('invalid particle requests stay inside the allocation bounds', () => {
  for (const value of [-1, 0, NaN, Infinity, 1e9, 3.7]) {
    const field = buildChronicleField(value);
    assert.ok(field.count >= CHRONICLE_MIN_PARTICLES && field.count <= CHRONICLE_PARTICLE_COUNT);
  }
});

test('glyph masks become stage formations; empty or malformed masks fall back without throwing', () => {
  assert.deepEqual(CHRONICLE_GLYPHS, ['徵', '灋', '證']);
  const rng = seededRandom(7);
  const points = maskFormation(squareMask(64, 16, 48), 2000, rng);
  assert.ok(points);
  for (let i = 0; i < points.length; i += 3) {
    assert.ok(points[i] >= -0.5 - 1e-6 && points[i] <= 0.5 + 1e-6);
    assert.ok(points[i + 1] >= -0.5 - 1e-6 && points[i + 1] <= 0.5 + 1e-6);
  }
  assert.equal(maskFormation({ alpha: new Uint8Array(64 * 64), size: 64 }, 100, rng), null);
  assert.equal(maskFormation({ alpha: new Uint8Array(10), size: 64 }, 100, rng), null);
  assert.equal(maskFormation({ alpha: new Uint8Array(16), size: 4 }, 100, rng), null);
  const field = buildChronicleField(2048, [squareMask(64, 8, 56), null, { alpha: [], size: 0 }]);
  assert.ok(field.stages.every(finite));
});

test('procedural formations keep their silhouettes inside the unit frame', () => {
  const rng = seededRandom(11);
  const ring = ringFormation(6000, rng);
  let rim = 0;
  for (let i = 0; i < ring.length; i += 3) {
    const r = Math.hypot(ring[i], ring[i + 1]);
    assert.ok(r >= 0.75 && r <= 1.5);
    if (r >= 0.76 && r <= 1.02) rim++;
  }
  assert.ok(rim / (ring.length / 3) > 0.7, 'most ring particles sit on the band, not the corona');
  for (const shape of [oracleFormation(6000, rng), chainFormation(6000, rng)]) {
    assert.ok(finite(shape));
    for (let i = 0; i < shape.length; i += 3) assert.ok(Math.abs(shape[i]) <= 1.1 && Math.abs(shape[i + 1]) <= 1.1);
  }
});

test('Q → D → I → A chain rises from lower-left to upper-right', () => {
  const chain = chainFormation(8000, seededRandom(3));
  const quadrant = [0, 0, 0, 0];
  for (let i = 0; i < chain.length; i += 3) {
    const [x, y] = [chain[i], chain[i + 1]];
    if (x < -0.5 && y < -0.45) quadrant[0]++;
    if (x > 0.5 && y > 0.45) quadrant[3]++;
    if (x < -0.5 && y > 0.45) quadrant[1]++;
    if (x > 0.5 && y < -0.45) quadrant[2]++;
  }
  assert.ok(quadrant[0] > quadrant[1] * 4 && quadrant[3] > quadrant[2] * 4);
});

test('scroll progress morphs across each boundary window and stays finite', () => {
  const viewport = 1000, span = 700;
  // Boundaries in viewport coordinates (section tops); the focus line is the viewport centre.
  const at = scroll => chronicleProgress([1000, 2200, 3400].map(top => top - scroll), viewport / 2, span);
  assert.equal(at(0), 0);
  assert.equal(at(150), 0);
  assert.equal(at(500), 0.5);
  assert.equal(at(850), 1);
  assert.equal(at(1700), 1.5);
  assert.equal(at(99999), 3);
  let previous = -1;
  for (let scroll = 0; scroll <= 4500; scroll += 7) { const p = at(scroll); assert.ok(p >= previous); previous = p; }
  assert.equal(chronicleProgress([NaN, Infinity, 100], NaN, span), 0);
  assert.equal(chronicleProgress([100], 500, 0), 0);
  assert.equal(chronicleProgress([Infinity, Infinity], 500, span), 0);
});

test('stage index and reduced-motion progress snap to finished formations', () => {
  assert.deepEqual([0, 0.4, 0.6, 2.5, 5.49, 6, 9, -3, NaN].map(p => chronicleStage(p)), [0, 0, 1, 3, 5, 6, 6, 0, 0]);
  assert.equal(resolveChronicleProgress(2.4, true), 2);
  assert.equal(resolveChronicleProgress(2.6, true), 3);
  assert.equal(resolveChronicleProgress(2.6, false), 2.6);
  assert.equal(resolveChronicleProgress(NaN, false), 0);
});

test('layouts centre the ring, place chapters beside the copy and stay continuous', () => {
  const [w, h] = [8.32, 4.68];
  const hero = stageLayout(0, w, h), chapter = stageLayout(3, w, h), finale = stageLayout(CHRONICLE_LAST_STAGE, w, h);
  assert.equal(hero[0], 0);
  assert.deepEqual(hero, finale);
  assert.ok(chapter[0] > w * 0.2 && chapter[0] + chapter[2] < w / 2);
  const portrait = stageLayout(3, 2.2, 4.68);
  assert.equal(portrait[0], 0);
  assert.ok(portrait[2] <= 2.2 * 0.42 + 1e-6);
  const current = new Float32Array(4), previous = new Float32Array(4);
  blendStageLayout(0, w, h, previous);
  for (let i = 1; i <= 6000; i++) {
    blendStageLayout(i / 1000, w, h, current);
    assert.ok(finite(current));
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(current[k] - previous[k]) < 0.02);
    previous.set(current);
  }
  assert.ok(finite(stageLayout(2, NaN, 0)));
});
