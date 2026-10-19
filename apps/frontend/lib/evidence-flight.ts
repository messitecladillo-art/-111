// Local, illustrative motion only. These values are never project readiness scores.
export type Point = { x: number; y: number };
export type Flight = { start: Point; end: Point; duration: number; vx: number; vy: number };

export const ARENA = { width: 420, height: 378, left: 70, right: 352 } as const;
export const LANE_Y = [66, 150, 234, 318] as const;
export const INITIAL_X = [146, 218, 268, 310] as const;
export const DEFAULT_PULL = { x: -46, y: 40 };
const GRAVITY = 760;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

export function constrainPull(origin: Point, pull: Point): Point {
  const x = clamp(pull.x, -64, 64);
  const y = clamp(pull.y, -34, 52);
  return {
    x: clamp(origin.x + x, 28, ARENA.width - 28) - origin.x,
    y: clamp(origin.y + y, 32, ARENA.height - 28) - origin.y,
  };
}

export function createFlight(origin: Point, destinationY: number, pull: Point): Flight {
  const bounded = constrainPull(origin, pull);
  const start = { x: origin.x + bounded.x, y: origin.y + bounded.y };
  const end = { x: clamp(origin.x - bounded.x * 2.6, ARENA.left + 10, ARENA.right - 10), y: destinationY };
  const duration = 0.66 + Math.max(0, bounded.y) / 300;
  return {
    start, end, duration,
    vx: (end.x - start.x) / duration,
    vy: (end.y - start.y - 0.5 * GRAVITY * duration ** 2) / duration,
  };
}

export function sampleFlight(flight: Flight, fraction: number): Point {
  const t = clamp(fraction, 0, 1) * flight.duration;
  return {
    x: flight.start.x + flight.vx * t,
    y: flight.start.y + flight.vy * t + 0.5 * GRAVITY * t * t,
  };
}

export function flightPath(flight: Flight): string {
  return Array.from({ length: 33 }, (_, index) => {
    const point = sampleFlight(flight, index / 32);
    return `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}
