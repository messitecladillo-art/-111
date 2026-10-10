/** Original, conceptual voxel geometry. No historical reconstruction or survey data. */
export const LANDING_PARTICLE_COUNT = 4608;
export const LANDING_MOBILE_PARTICLE_COUNT = 3072;
export const LANDING_MAX_DPR = 1.5;
export const LANDING_SCENE_SEED = 0x45564958;

export type LandingShape = { positions: Float32Array; colors: Float32Array; sizes: Float32Array };
export type LandingShapes = { stages: [LandingShape, LandingShape, LandingShape, LandingShape]; seeds: Float32Array; count: number };
type Voxel = [number, number, number, number, number, number, number];
type Color = readonly [number, number, number];
const JADE: Color = [0.08, 0.74, 0.62];
const MINT: Color = [0.50, 0.96, 0.82];
const STONE: Color = [0.55, 0.40, 0.24];
const AMBER: Color = [0.93, 0.63, 0.29];
const PAPER: Color = [0.55, 0.70, 0.65];
const DARK: Color = [0.09, 0.26, 0.25];
const TAU = Math.PI * 2;

export function clampSceneProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 0;
}

/** Match the narrative's chapter threshold without animating between reduced-motion frames. */
export function resolveLandingProgress(value: number, reducedMotion: boolean): number {
  const progress = clampSceneProgress(value);
  return reducedMotion ? clampSceneProgress(Math.floor(progress + 0.45)) : progress;
}

export function seededSceneRandom(seed = LANDING_SCENE_SEED): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function voxel(out: Voxel[], x: number, y: number, z: number, color: Color, size = 0.092) {
  out.push([x, y, z, color[0], color[1], color[2], size]);
}

function box(out: Voxel[], center: readonly number[], extent: readonly number[], color: Color, step = 0.11, tilt = 0) {
  const nx = Math.max(2, Math.round(extent[0] / step));
  const ny = Math.max(2, Math.round(extent[1] / step));
  const nz = Math.max(2, Math.round(extent[2] / step));
  const cs = Math.cos(tilt), sn = Math.sin(tilt);
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    if (x > 0 && x < nx - 1 && y > 0 && y < ny - 1 && z > 0 && z < nz - 1) continue;
    const px = (x / (nx - 1) - 0.5) * extent[0];
    const py = (y / (ny - 1) - 0.5) * extent[1];
    voxel(out, center[0] + px * cs - py * sn, center[1] + px * sn + py * cs, center[2] + (z / (nz - 1) - 0.5) * extent[2], color, step * 0.86);
  }
}

function line(out: Voxel[], from: readonly number[], to: readonly number[], color: Color, step = 0.065, size = 0.04) {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const n = Math.max(2, Math.ceil(distance / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    voxel(out, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t, color, size);
  }
}

function ancientMarket(): Voxel[] {
  const out: Voxel[] = [];
  // A solid, deep stone gateway, its arch cut from concentric voxel courses.
  for (let ring = 0; ring < 5; ring++) for (let depth = 0; depth < 6; depth++) {
    const radius = 1.26 + ring * 0.11;
    for (let a = 0; a <= 49; a++) {
      const theta = Math.PI * a / 49;
      voxel(out, Math.cos(theta) * radius, 0.10 + Math.sin(theta) * radius, (depth - 2.5) * 0.11 - 0.45, ring === 0 && depth === 5 ? AMBER : STONE, 0.10);
    }
  }
  box(out, [-1.48, -0.83, -0.45], [0.44, 1.83, 0.60], STONE);
  box(out, [1.48, -0.83, -0.45], [0.44, 1.83, 0.60], STONE);
  box(out, [0, -1.83, -0.55], [4.4, 0.20, 1.6], DARK, 0.14);
  // The foreground tablet has physical thickness and incised, non-linguistic tally marks.
  box(out, [0.15, -0.70, 0.92], [2.18, 1.42, 0.24], [0.57, 0.38, 0.20], 0.105, -0.14);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
    const x = -0.65 + col * 0.22, y = -0.32 - row * 0.21;
    line(out, [x, y, 1.065], [x + 0.065, y - 0.075, 1.065], row === 3 ? JADE : AMBER, 0.035, 0.043);
  }
  box(out, [-2.15, -1.40, -0.8], [0.46, 0.65, 0.52], STONE, 0.14);
  box(out, [2.05, -1.56, -0.30], [0.50, 0.34, 0.70], STONE, 0.14);
  return out;
}

function detectiveDesk(): Voxel[] {
  const out: Voxel[] = [];
  // A tilted lens with a thick outer rim; the opening remains empty and readable.
  for (let a = 0; a < 112; a++) for (let r = 0; r < 4; r++) for (let d = 0; d < 4; d++) {
    const theta = a / 112 * TAU, radius = 1.38 + r * 0.075;
    const x = Math.cos(theta) * radius, y = Math.sin(theta) * radius;
    voxel(out, x * 0.92 - y * 0.13, 0.30 + y * 0.93 + x * 0.15, 0.40 - x * 0.34 + y * 0.20 + d * 0.075, r === 0 || r === 3 ? MINT : JADE, 0.073);
  }
  box(out, [1.20, -1.40, 0.28], [0.38, 1.66, 0.34], JADE, 0.09, 0.58);
  for (let page = 0; page < 3; page++) {
    const x = -1.25 + page * 1.04;
    const y = -0.57 + (page % 2) * 0.36;
    const z = -0.65 - page * 0.12;
    box(out, [x, y, z], [1.00, 1.42, 0.075], PAPER, 0.11, (page - 1) * 0.18);
    for (let row = 0; row < 5; row++) line(out, [x - 0.31, y + 0.40 - row * 0.19, z + 0.065], [x + (row === 4 ? 0.07 : 0.30), y + 0.40 - row * 0.19, z + 0.065], DARK, 0.07, 0.047);
  }
  line(out, [-2.4, -1.90, -0.45], [2.35, -1.90, -0.45], DARK, 0.075);
  return out;
}

function sampleNetwork(): Voxel[] {
  const out: Voxel[] = [];
  // An abstract sample lattice, not a geographic boundary or an observed dataset.
  const nodes = [[-1.8, -0.20, -0.9], [-0.55, 0.95, -0.55], [0.75, 0.45, -0.85], [1.85, 1.3, 0.0], [-1.15, -0.40, 0.9], [0.35, 0.10, 1.20], [1.40, -0.25, 1.2]];
  for (let x = -22; x <= 22; x++) for (let z = -14; z <= 14; z++) {
    if ((x / 22) ** 2 + (z / 14) ** 2 > 1 || ((x + z) % 3 === 0)) continue;
    voxel(out, x * 0.112, -1.40, z * 0.112, DARK, 0.036);
  }
  for (let i = 0; i < nodes.length; i++) {
    const [x, top, z] = nodes[i];
    const h = top + 1.32;
    box(out, [x, -1.32 + h / 2, z], [0.43, h, 0.43], i === 3 ? MINT : JADE, 0.09);
    box(out, [x, top + 0.08, z], [0.56, 0.10, 0.56], i === 3 ? AMBER : MINT, 0.085);
    if (i > 0) {
      line(out, [nodes[i - 1][0], nodes[i - 1][1] + 0.12, nodes[i - 1][2]], [x, top + 0.12, z], JADE, 0.058, 0.03);
    }
    line(out, [x, -1.35, z], [0, -1.35, 0], JADE, 0.075, 0.035);
  }
  return out;
}

function evidencePrism(): Voxel[] {
  const out: Voxel[] = [];
  // The frame is open at the upper right: an observation window, never a badge.
  const frame: readonly (readonly number[])[] = [[-1.75, -1.32, 0], [-1.75, 1.78, 0], [0.9, 1.78, 0], [1.75, 1.05, 0], [1.75, -1.32, 0], [-1.75, -1.32, 0]];
  for (let i = 0; i < frame.length - 1; i++) {
    if (i === 2) continue;
    for (let d = 0; d < 3; d++) line(out, [frame[i][0], frame[i][1], d * 0.095 - 0.3], [frame[i + 1][0], frame[i + 1][1], d * 0.095 - 0.3], JADE, 0.072, 0.086);
  }
  for (let y = -13; y <= 15; y++) {
    const radius = (1 - Math.abs(y - 1) / 15) * 1.05;
    if (radius <= 0) continue;
    for (let a = 0; a < 42; a++) {
      const t = a / 42 * TAU;
      voxel(out, Math.cos(t) * radius, y * 0.084 + 0.24, Math.sin(t) * radius * 0.65 + 0.30, a % 7 === 0 ? MINT : JADE, 0.075);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 1.03;
    box(out, [x, -1.90, 0.12], [0.36, 0.36, 0.36], i === 3 ? AMBER : MINT, 0.085);
    if (i < 3) line(out, [x + 0.24, -1.90, 0.12], [x + 0.79, -1.90, 0.12], JADE, 0.07, 0.035);
  }
  return out;
}

export function buildLandingShapes(requestedCount = LANDING_PARTICLE_COUNT, seed = LANDING_SCENE_SEED): LandingShapes {
  const count = Math.max(256, Math.min(LANDING_PARTICLE_COUNT, Math.floor(Number.isFinite(requestedCount) ? requestedCount : LANDING_PARTICLE_COUNT)));
  const random = seededSceneRandom(seed);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = random();
  const candidates = [ancientMarket(), detectiveDesk(), sampleNetwork(), evidencePrism()];
  const stages = candidates.map((points, stage) => {
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Even coverage preserves silhouettes. The seed affects stone shading, not semantic shape.
      const point = points[Math.min(points.length - 1, Math.floor(i * points.length / count))];
      const shade = 0.76 + seeds[i] * 0.30;
      positions[i * 3] = point[0]; positions[i * 3 + 1] = point[1]; positions[i * 3 + 2] = point[2];
      colors[i * 3] = point[3] * shade; colors[i * 3 + 1] = point[4] * shade; colors[i * 3 + 2] = point[5] * shade;
      sizes[i] = point[6] * (stage === 2 ? 1.04 : 1);
    }
    return { positions, colors, sizes };
  }) as LandingShapes['stages'];
  return { stages, seeds, count };
}

/** Allocation-free camera sampler. Output: x, y, z, targetY, world rotationY. */
export function sampleLandingCamera(progress: number, mobile: boolean, out: Float32Array, staticView = false, aspect?: number): void {
  const p = clampSceneProgress(progress);
  const tunnel = staticView ? 0 : Math.sin(Math.max(0, Math.min(1, (p - 1.05) / 0.75)) * Math.PI);
  out[0] = 0.15 * Math.sin(p * Math.PI * 0.7);
  out[1] = 0.22 + Math.sin(p * Math.PI / 3) * 0.45;
  out[2] = (mobile ? 11.8 : 8.3) - tunnel * (mobile ? 2.0 : 3.3);
  if (aspect !== undefined && Number.isFinite(aspect) && aspect > 0) {
    // Centered portraits need5.3 units; right-aligned desktop objects need9.2 including copy space.
    const baseDistance = mobile ? 11.8 : 8.3;
    const halfWidth = mobile ? 2.65 : 4.6;
    const framedDistance = Math.max(baseDistance, halfWidth / (Math.tan(21 * Math.PI / 180) * aspect));
    out[2] *= framedDistance / baseDistance; // Preserve the original tunnel's zoom ratio.
  }
  out[3] = -0.02;
  out[4] = -0.14 + Math.sin(p * Math.PI / 3) * 0.37;
}
