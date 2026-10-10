import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLandingShapes, sampleLandingCamera, LANDING_PARTICLE_COUNT, LANDING_MOBILE_PARTICLE_COUNT } from '../lib/landing-scene.ts';

test('desktop and mobile GPU attributes have equal, finite, bounded instance layouts', () => {
  for (const count of [LANDING_PARTICLE_COUNT, LANDING_MOBILE_PARTICLE_COUNT]) {
    const result = buildLandingShapes(count);
    assert.equal(result.stages.length, 4);
    assert.equal(result.count, count);
    assert.equal(result.seeds.length, count);
    for (const shape of result.stages) {
      assert.equal(shape.positions.length, count * 3);
      assert.equal(shape.colors.length, count * 3);
      assert.equal(shape.sizes.length, count);
      assert.ok(shape.positions.every(v => Number.isFinite(v) && Math.abs(v) < 5));
      assert.ok(shape.colors.every(v => Number.isFinite(v) && v >= 0 && v <= 1.2));
      assert.ok(shape.sizes.every(v => Number.isFinite(v) && v > 0 && v < 0.3));
    }
  }
});

test('geometry generation is deterministic and invalid allocation requests stay bounded', () => {
  assert.deepEqual(buildLandingShapes(3072), buildLandingShapes(3072));
  for (const value of [-1, 0, Infinity, NaN, 1e9]) {
    const result = buildLandingShapes(value);
    assert.ok(result.count >= 256 && result.count <= LANDING_PARTICLE_COUNT);
  }
});

test('camera path is continuous through chapter boundaries and never clips through the scene', () => {
  const current = new Float32Array(5), previous = new Float32Array(5);
  for (const mobile of [false, true]) {
    sampleLandingCamera(0, mobile, previous);
    for (let i = 0; i <= 3000; i++) {
      sampleLandingCamera(i / 1000, mobile, current);
      assert.ok(current.every(Number.isFinite));
      assert.ok(current[2] >= 4.9);
      assert.ok(current.every((v, j) => Math.abs(v - previous[j]) < 0.02));
      previous.set(current);
    }
  }
});

test('portrait and tall desktop layouts preserve silhouettes without changing normal widescreen framing', () => {
  const original = new Float32Array(5), responsive = new Float32Array(5);
  for (const [mobile, aspect, minimumWidth] of [[true,375/844,5.3],[false,1167/1386,9.2]]) {
    for (const chapter of [0,1,2,3]) {
      sampleLandingCamera(chapter, mobile, responsive, false, aspect);
      assert.ok(2*Math.tan(21*Math.PI/180)*responsive[2]*aspect >= minimumWidth-1e-5);
    }
  }
  for (let i=0;i<=300;i++) {
    sampleLandingCamera(i/100, false, original);
    sampleLandingCamera(i/100, false, responsive, false, 16/9);
    assert.deepEqual(original,responsive);
  }
});
