import assert from "node:assert/strict";
import test from "node:test";
import { ARENA, INITIAL_X, LANE_Y, createFlight, sampleFlight, constrainPull } from "../lib/evidence-flight.ts";

test("all permitted pulls land exactly on the next rail and remain inside the arena", () => {
  for (let lane = 0; lane < 3; lane++) {
    for (const x of [ARENA.left + 10, INITIAL_X[lane], ARENA.right - 10]) {
      for (const dx of [-1000, -64, 0, 64, 1000]) {
        for (const dy of [-1000, -34, 0, 52, 1000]) {
          const flight = createFlight({ x, y: LANE_Y[lane] }, LANE_Y[lane + 1], { x: dx, y: dy });
          const end = sampleFlight(flight, 1);
          assert.ok(Math.abs(end.y - LANE_Y[lane + 1]) < 1e-8);
          assert.ok(Math.abs(end.x - flight.end.x) < 1e-8);
          assert.ok(end.x >= ARENA.left && end.x <= ARENA.right);
          for (let i = 0; i <= 100; i++) {
            const point = sampleFlight(flight, i / 100);
            assert.ok(point.x >= 0 && point.x <= ARENA.width);
            assert.ok(point.y >= 0 && point.y <= ARENA.height, JSON.stringify({ lane, dx, dy, point }));
          }
        }
      }
    }
  }
});

test("invalid pointer deltas and overshooting animation time stay bounded", () => {
  const origin = { x: INITIAL_X[0], y: LANE_Y[0] };
  assert.deepEqual(constrainPull(origin, { x: NaN, y: Infinity }), { x: 0, y: 0 });
  const flight = createFlight(origin, LANE_Y[1], { x: -46, y: 40 });
  assert.deepEqual(sampleFlight(flight, -1), flight.start);
  assert.deepEqual(sampleFlight(flight, 2), sampleFlight(flight, 1));
});
