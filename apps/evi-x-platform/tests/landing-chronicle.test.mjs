import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendStageLayout, buildChronicleField, chainFormation, chronicleChapterFrame, chronicleParticlePosition, chronicleProgress, chronicleStage, chronicleVisualState, maskFormation, matchChronicleFormation, oracleFormation,
  resolveChronicleProgress, ringFormation, seededRandom, stageLayout, CHRONICLE_DUST_RATIO, CHRONICLE_GLYPHS, CHRONICLE_STAGE_PLACEMENT,
  CHRONICLE_LAST_STAGE, CHRONICLE_MIN_PARTICLES, CHRONICLE_MOBILE_PARTICLE_COUNT, CHRONICLE_PARTICLE_COUNT, CHRONICLE_STAGE_COUNT, CHRONICLE_TRANSITIONS,
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

test('directed transitions seek the same state after reversal or a fast jump, with exact endpoints', () => {
  const forward = Array.from({ length: 121 }, (_, i) => i / 20);
  const snapshots = new Map(forward.map(p => [p, chronicleVisualState(p, 1440, false)]));
  // Deliberately jump across unselected chapters, then revisit both routes in reverse.
  for (const p of [5.8, 0.5, 3.2, 4.75, ...forward.toReversed()]) {
    const state = chronicleVisualState(p, 1440, false);
    if (snapshots.has(p)) assert.deepEqual(state, snapshots.get(p));
    assert.ok(state.mix >= 0 && state.mix <= 1 && state.emphasis >= 0 && state.emphasis <= 1);
  }
  for (let start = 0; start < CHRONICLE_LAST_STAGE; start++) {
    const end = start + 1, segment = start + 1, transition = CHRONICLE_TRANSITIONS[start];
    assert.ok(chronicleVisualState(start + 0.0001, 1440, false).mix < 1e-6);
    assert.equal(chronicleVisualState(end, 1440, false).mix, 1);
    assert.equal(chronicleVisualState(start, 1440, false).emphasis, 0);
    assert.equal(chronicleVisualState(end, 1440, false).emphasis, 0);
    const middle = chronicleVisualState((start + end) / 2, 1440, false);
    assert.equal(middle.segment, segment);
    assert.equal(middle.transition, transition);
    assert.equal(middle.emphasis, 1);
    // Near the endpoints both the position and curved offset converge without a snap.
    assert.ok(chronicleVisualState(start + 0.0001, 1440, false).mix < 1e-6);
    assert.ok(chronicleVisualState(end - 0.0001, 1440, false).emphasis < 1e-6);
  }
  assert.deepEqual(CHRONICLE_TRANSITIONS, ['oracle', 'documents', 'balance', 'citations', 'evidence-chain', 'return-ring']);
  assert.equal(chronicleVisualState(Infinity, 1440, false).progress, 0);
  assert.equal(chronicleVisualState(-2, 1440, false).progress, 0);
  assert.equal(chronicleVisualState(99, 1440, false).progress, 6);
});

test('every particle route meets the actual stage buffers exactly and stays continuous across every join', () => {
  const field = buildChronicleField(1024, [squareMask(64, 8, 56), squareMask(64, 12, 52), squareMask(64, 16, 48)]);
  const seek = (p, i) => {
    const state = chronicleVisualState(p, 1440, false), from = state.segment - 1, to = state.segment;
    return chronicleParticlePosition(field.stages[from].subarray(i * 3, i * 3 + 3), field.stages[to].subarray(i * 3, i * 3 + 3), field.seeds.subarray(i * 4, i * 4 + 4), state.segment, state.mix);
  };
  for (let i = 0; i < field.formationCount; i += 7) {
    for (let stage = 0; stage <= CHRONICLE_LAST_STAGE; stage++) {
      assert.deepEqual(seek(stage, i), Array.from(field.stages[stage].subarray(i * 3, i * 3 + 3)));
      if (stage > 0 && stage < CHRONICLE_LAST_STAGE) {
        const before = seek(stage - 0.00001, i), after = seek(stage + 0.00001, i);
        assert.ok(before.every((v, axis) => Math.abs(v - after[axis]) < 1e-7), `join ${stage}, particle ${i}`);
      }
    }
    const forward = Array.from({ length: 121 }, (_, step) => seek(step / 20, i));
    for (let step = 120; step >= 0; step--) {
      assert.deepEqual(seek(step / 20, i), forward[step], 'reverse/fast seek has no accumulated state');
      assert.ok(finite(forward[step]));
      assert.ok(forward[step].every(v => Math.abs(v) < 2));
    }
  }
});

test('stationary and invalid scroll positions keep readable, reversible chapter frames', () => {
  for (let stage = 0; stage <= CHRONICLE_LAST_STAGE; stage++) {
    const active = chronicleChapterFrame(stage, stage);
    assert.deepEqual(active, { enter: 1, exit: 0, opacity: 1, shift: 0, artifactShift: 0 });
    const values = Array.from({ length: 121 }, (_, i) => chronicleChapterFrame(i / 20, stage));
    for (let i = 120; i >= 0; i--) {
      assert.deepEqual(chronicleChapterFrame(i / 20, stage), values[i]);
      assert.ok(Object.values(values[i]).every(Number.isFinite));
      assert.ok(values[i].opacity >= 0.5 && values[i].opacity <= 1, 'copy is never fully hidden');
      assert.deepEqual(chronicleChapterFrame(i / 20, stage, true), active, 'static/reduced mode stays readable');
    }
  }
  assert.deepEqual(chronicleChapterFrame(NaN, 3), chronicleChapterFrame(0, 3));
});

test('phone threshold and reduced motion choose completed, immediately readable stages', () => {
  for (const width of [320, 390, 700]) for (const p of [0.4, 0.6, 4.25, 4.8]) {
    const state = chronicleVisualState(p, width, false);
    assert.equal(state.mode, 'static-mobile');
    assert.equal(state.progress, Math.round(p));
    assert.equal(state.segment, 0);
    assert.equal(state.emphasis, 0);
  }
  assert.equal(chronicleVisualState(0.4, 701, false).progress, 0.4);
  const reduced = chronicleVisualState(4.8, 1440, true);
  assert.equal(reduced.mode, 'static-reduced');
  assert.equal(reduced.progress, 5);
  assert.equal(reduced.transition, 'none');
  assert.equal(chronicleVisualState(4.8, 390, true).mode, 'static-reduced');
});

test('persistent particle matching preserves silhouettes and joins neighbouring destinations', () => {
  const source = new Float32Array([0, 1, 0, -1, 0, 0, 1, 0, 0, 0, -1, 0]);
  const target = new Float32Array([0, -0.7, 0.1, 0.5, 0, 0.2, -0.5, 0, 0.3, 0, 0.7, 0.4]);
  const originalSource = source.slice(), originalTarget = target.slice();
  const matched = matchChronicleFormation(source, target, 'radial');
  const points = array => Array.from({ length: array.length / 3 }, (_, i) => Array.from(array.subarray(i * 3, i * 3 + 3)).join(',')).sort();
  assert.deepEqual(points(matched), points(target), 'no target point is added, removed or altered');
  assert.deepEqual(source, originalSource);
  assert.deepEqual(target, originalTarget);
  for (let i = 0; i < source.length; i += 3) assert.ok(Math.abs(Math.atan2(source[i + 1], source[i]) - Math.atan2(matched[i + 1], matched[i])) < 1e-6);
  const from = new Float32Array([1, 1, 0, -1, -1, 0, 0, 0, 0]);
  const to = new Float32Array([0, 0, 0.2, 0.8, 0.8, 0.3, -0.8, -0.8, 0.1]);
  const diagonal = matchChronicleFormation(from, to, 'diagonal');
  for (let i = 0; i < from.length; i += 3) assert.equal(Math.sign(diagonal[i] + diagonal[i + 1]), Math.sign(from[i] + from[i + 1]));
  assert.throws(() => matchChronicleFormation(from, target, 'diagonal'), RangeError);
});

test('layouts centre the ring, place chapters beside the copy and stay continuous', () => {
  const [w, h] = [8.32, 4.68];
  const hero = stageLayout(0, w, h), chapter = stageLayout(3, w, h), finale = stageLayout(CHRONICLE_LAST_STAGE, w, h);
  assert.equal(hero[0], 0);
  assert.deepEqual(hero, finale);
  assert.ok(chapter[0] > w * 0.2 && chapter[0] + chapter[2] < w / 2);
  // Compositions alternate: oracle art on the left, documents behind centred copy, 灋 on the right.
  assert.equal(CHRONICLE_STAGE_PLACEMENT.length, CHRONICLE_STAGE_COUNT);
  const left = stageLayout(1, w, h), backdrop = stageLayout(2, w, h);
  assert.ok(left[0] < -w * 0.2 && left[0] - left[2] > -w / 2);
  assert.equal(backdrop[0], 0);
  assert.ok(backdrop[3] < chapter[3], 'backdrop formations are dimmer than side formations');
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
