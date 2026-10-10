/**
 * Particle formations for the public "循证三千年" landing chronicle.
 * Every shape is original, code-generated and conceptual: it is neither an
 * artefact reconstruction nor survey data.
 */
export const CHRONICLE_STAGE_COUNT = 7;
export const CHRONICLE_LAST_STAGE = CHRONICLE_STAGE_COUNT - 1;
export const CHRONICLE_PARTICLE_COUNT = 20000;
export const CHRONICLE_MOBILE_PARTICLE_COUNT = 9000;
export const CHRONICLE_MIN_PARTICLES = 512;
export const CHRONICLE_DUST_RATIO = 0.16;
export const CHRONICLE_MAX_DPR = 1.75;
export const CHRONICLE_STATIC_WIDTH = 700;
export const CHRONICLE_SEED = 0x5a484e47;
/** Glyph-backed stages in order: 春秋 徵, 东汉 灋, 清 證. */
export const CHRONICLE_GLYPHS = ['徵', '灋', '證'] as const;
export const CHRONICLE_GLYPH_STAGES = [2, 3, 4] as const;

export type GlyphMask = { alpha: ArrayLike<number>; size: number };
export type ChronicleField = {
  count: number;
  formationCount: number;
  /** One xyz array per stage, normalised to roughly [-1, 1]. Dust shares positions across stages. */
  stages: Float32Array[];
  /** Four uniform random values per particle (phase, size, colour, motion). */
  seeds: Float32Array;
  /** 0 for formation particles, 1 for background dust. */
  kinds: Float32Array;
};
type Rng = () => number;
type Sink = { out: Float32Array; i: number; end: number };
const TAU = Math.PI * 2;

export function seededRandom(seed = CHRONICLE_SEED): Rng {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampParticleCount(value: number, max = CHRONICLE_PARTICLE_COUNT): number {
  if (!Number.isFinite(value)) return max;
  return Math.max(CHRONICLE_MIN_PARTICLES, Math.min(max, Math.floor(value)));
}

function push(sink: Sink, x: number, y: number, z: number) {
  if (sink.i >= sink.end) return;
  const o = sink.i * 3;
  sink.out[o] = x; sink.out[o + 1] = y; sink.out[o + 2] = z;
  sink.i++;
}

function sinkFor(n: number): Sink {
  return { out: new Float32Array(n * 3), i: 0, end: n };
}

/** Fill any remaining slots by re-sampling already placed points with a little jitter. */
function finish(sink: Sink, rng: Rng, jitter = 0.01): Float32Array {
  const placed = sink.i;
  while (sink.i < sink.end) {
    if (!placed) { push(sink, (rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6, (rng() - 0.5) * 0.2); continue; }
    const k = Math.floor(rng() * placed) * 3;
    push(sink, sink.out[k] + (rng() - 0.5) * jitter, sink.out[k + 1] + (rng() - 0.5) * jitter, sink.out[k + 2]);
  }
  return sink.out;
}

/** Shuffle particle order so morphs dissolve and re-form instead of sliding in bands. */
function shuffle(points: Float32Array, rng: Rng): Float32Array {
  const n = points.length / 3;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    for (let a = 0; a < 3; a++) {
      const t = points[i * 3 + a];
      points[i * 3 + a] = points[j * 3 + a];
      points[j * 3 + a] = t;
    }
  }
  return points;
}

function segment(sink: Sink, n: number, ax: number, ay: number, bx: number, by: number, rng: Rng, spread = 0.006) {
  for (let k = 0; k < n; k++) {
    const t = rng();
    push(sink, ax + (bx - ax) * t + (rng() - 0.5) * spread, ay + (by - ay) * t + (rng() - 0.5) * spread, (rng() - 0.5) * 0.05);
  }
}

function arc(sink: Sink, n: number, cx: number, cy: number, r: number, from: number, to: number, rng: Rng, spread = 0.006) {
  for (let k = 0; k < n; k++) {
    const a = from + (to - from) * rng();
    const rr = r + (rng() - 0.5) * spread;
    push(sink, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, (rng() - 0.5) * 0.05);
  }
}

/** An eclipse-like ring with raised rims, a grain-dot band and a faint corona. Outer radius = 1. */
export function ringFormation(n: number, rng: Rng): Float32Array {
  const sink = sinkFor(n);
  const inner = 0.78;
  arc(sink, Math.round(n * 0.2), 0, 0, 1, 0, TAU, rng, 0.012);
  arc(sink, Math.round(n * 0.13), 0, 0, inner, 0, TAU, rng, 0.01);
  arc(sink, Math.round(n * 0.06), 0, 0, 0.965, 0, TAU, rng, 0.004);
  arc(sink, Math.round(n * 0.05), 0, 0, 0.815, 0, TAU, rng, 0.004);
  // Grain dots between the inner rims: small comma-like clusters on staggered polar rows.
  const rows = [0.85, 0.89, 0.93];
  const clusters: [number, number][] = [];
  rows.forEach((r, row) => {
    const count = Math.round((TAU * r) / 0.042);
    for (let c = 0; c < count; c++) clusters.push([r, (c + (row % 2) * 0.5) / count * TAU]);
  });
  const perCluster = Math.max(2, Math.floor((n * 0.36) / clusters.length));
  for (const [r, a] of clusters) {
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
    for (let k = 0; k < perCluster; k++) {
      const t = k / perCluster;
      const swirl = a + t * 4.2;
      const rad = 0.003 + t * 0.0105;
      push(sink, cx + Math.cos(swirl) * rad, cy + Math.sin(swirl) * rad, (rng() - 0.5) * 0.04);
    }
  }
  // Corona falling off outside the rim.
  while (sink.i < sink.end) {
    const a = rng() * TAU;
    const r = 1.02 + Math.pow(rng(), 2.6) * 0.42;
    push(sink, Math.cos(a) * r, Math.sin(a) * r, (rng() - 0.5) * 0.3);
  }
  return shuffle(finish(sink, rng), rng);
}

/** A stylised plastron with seams, drilled hollows and 卜-shaped crack marks. Height spans [-0.95, 0.95]. */
export function oracleFormation(n: number, rng: Rng): Float32Array {
  const sink = sinkFor(n);
  const halfWidth = (y: number) => {
    const body = 0.6 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y) / 0.95, 2.4)), 1 / 2.4);
    const bridge = 0.07 * Math.exp(-Math.pow(y / 0.24, 2));
    return body + bridge;
  };
  // Outline.
  const outline = Math.round(n * 0.26);
  for (let k = 0; k < outline; k++) {
    const y = -0.95 + 1.9 * rng();
    const side = rng() < 0.5 ? -1 : 1;
    push(sink, side * halfWidth(y) + (rng() - 0.5) * 0.012, y + (rng() - 0.5) * 0.01, (rng() - 0.5) * 0.05);
  }
  // Midline and transverse scute seams.
  segment(sink, Math.round(n * 0.07), 0, -0.93, 0, 0.93, rng, 0.006);
  for (const y of [0.64, 0.3, -0.1, -0.52]) {
    const w = halfWidth(y) * 0.98;
    const bend = y > 0 ? 0.035 : -0.035;
    const m = Math.round(n * 0.025);
    for (let k = 0; k < m; k++) {
      const x = (rng() * 2 - 1) * w;
      push(sink, x, y + bend * (1 - Math.pow(x / w, 2)) + (rng() - 0.5) * 0.006, (rng() - 0.5) * 0.04);
    }
  }
  // Drilled hollows paired with 卜 cracks whose branch points toward the midline.
  const hollows: [number, number][] = [];
  for (const y of [0.5, 0.18, -0.28, -0.68]) for (const side of [-1, 1]) hollows.push([side * (y > 0 ? 0.3 : 0.27), y]);
  for (const y of [0.78, -0.02]) for (const side of [-1, 1]) hollows.push([side * 0.16, y]);
  const perHollow = Math.max(4, Math.floor((n * 0.07) / hollows.length));
  const perCrack = Math.max(8, Math.floor((n * 0.29) / hollows.length));
  for (const [hx, hy] of hollows) {
    for (let k = 0; k < perHollow; k++) {
      const a = rng() * TAU, r = 0.75 + rng() * 0.25;
      push(sink, hx + Math.cos(a) * 0.026 * r, hy + Math.sin(a) * 0.046 * r, (rng() - 0.5) * 0.04);
    }
    // A jagged vertical stem with one branch toward the midline, like the character 卜.
    const toward = hx > 0 ? -1 : 1;
    let x = hx + toward * 0.045, y = hy - 0.12;
    const stem = Math.round(perCrack * 0.6) / 4;
    for (let k = 0; k < 4; k++) {
      const nx = x + (rng() - 0.5) * 0.022, ny = y + 0.06;
      segment(sink, Math.round(stem), x, y, nx, ny, rng, 0.003);
      x = nx; y = ny;
    }
    const bx = hx + toward * 0.045, by = hy + rng() * 0.03 - 0.01;
    const mx = bx + toward * (0.045 + rng() * 0.02), my = by + 0.025 + rng() * 0.02;
    segment(sink, Math.round(perCrack * 0.22), bx, by, mx, my, rng, 0.003);
    segment(sink, Math.round(perCrack * 0.18), mx, my, mx + toward * (0.035 + rng() * 0.03), my + (rng() - 0.3) * 0.04, rng, 0.003);
  }
  // Faint body texture.
  while (sink.i < sink.end) {
    const y = -0.92 + 1.84 * rng();
    const x = (rng() * 2 - 1) * halfWidth(y) * 0.95;
    push(sink, x, y, (rng() - 0.5) * 0.08);
  }
  return shuffle(finish(sink, rng), rng);
}

/** The Q → D → I → A evidence chain, rising from lower-left to upper-right. */
export function chainFormation(n: number, rng: Rng): Float32Array {
  const sink = sinkFor(n);
  const Q: [number, number] = [-0.74, -0.7], D: [number, number] = [-0.25, -0.23], I: [number, number] = [0.25, 0.23], A: [number, number] = [0.74, 0.7];
  // Q: an open ring with its gap facing the next node.
  arc(sink, Math.round(n * 0.17), Q[0], Q[1], 0.2, Math.PI * 0.42, Math.PI * 2.08, rng, 0.012);
  arc(sink, Math.round(n * 0.04), Q[0], Q[1], 0.045, 0, TAU, rng, 0.03);
  // D: a sampled lattice of dots.
  const lattice = Math.round(n * 0.2);
  for (let k = 0; k < lattice; k++) {
    const gx = Math.floor(rng() * 5), gy = Math.floor(rng() * 5);
    if ((gx + gy * 3) % 7 === 0) continue;
    const a = rng() * TAU, r = Math.sqrt(rng()) * 0.018;
    push(sink, D[0] + (gx - 2) * 0.075 + Math.cos(a) * r, D[1] + (gy - 2) * 0.075 + Math.sin(a) * r, (rng() - 0.5) * 0.05);
  }
  // I: a faceted prism.
  const top: [number, number] = [I[0], I[1] + 0.26], bottom: [number, number] = [I[0], I[1] - 0.26];
  const left: [number, number] = [I[0] - 0.16, I[1]], right: [number, number] = [I[0] + 0.16, I[1]];
  const facet = Math.round(n * 0.045);
  for (const [a, b] of [[top, right], [right, bottom], [bottom, left], [left, top]] as const) segment(sink, facet, a[0], a[1], b[0], b[1], rng);
  segment(sink, Math.round(facet * 0.7), top[0], top[1], bottom[0], bottom[1], rng);
  segment(sink, Math.round(facet * 0.7), left[0], left[1], right[0], right[1], rng);
  // A: a single directional arrow.
  const head = 0.17;
  segment(sink, Math.round(n * 0.07), A[0] - 0.2, A[1] - 0.2, A[0], A[1], rng, 0.008);
  segment(sink, Math.round(n * 0.05), A[0], A[1], A[0] - head, A[1], rng, 0.008);
  segment(sink, Math.round(n * 0.05), A[0], A[1], A[0], A[1] - head, rng, 0.008);
  // Links between consecutive nodes.
  const links: [[number, number], [number, number]][] = [[[Q[0] + 0.15, Q[1] + 0.15], [D[0] - 0.17, D[1] - 0.17]], [[D[0] + 0.17, D[1] + 0.17], [left[0] + 0.02, bottom[1] + 0.12]], [[I[0] + 0.12, I[1] + 0.14], [A[0] - 0.21, A[1] - 0.21]]];
  for (const [a, b] of links) segment(sink, Math.round(n * 0.04), a[0], a[1], b[0], b[1], rng, 0.004);
  // Remaining particles glow around the four nodes, in order.
  const nodes = [Q, D, I, A];
  while (sink.i < sink.end) {
    const node = nodes[Math.floor(rng() * 4)];
    const a = rng() * TAU, r = 0.22 + Math.pow(rng(), 1.8) * 0.12;
    push(sink, node[0] + Math.cos(a) * r, node[1] + Math.sin(a) * r, (rng() - 0.5) * 0.25);
  }
  return shuffle(finish(sink, rng), rng);
}

/** Sample filled pixels of a square glyph mask into normalised points; null when the mask is empty. */
export function maskFormation(mask: GlyphMask, n: number, rng: Rng, threshold = 110): Float32Array | null {
  const { alpha, size } = mask;
  if (!Number.isInteger(size) || size < 8 || alpha.length < size * size) return null;
  const filled: number[] = [];
  for (let i = 0; i < size * size; i++) if (alpha[i] >= threshold) filled.push(i);
  if (filled.length < 16) return null;
  const sink = sinkFor(n);
  const px = 2 / size;
  for (let k = 0; k < n; k++) {
    const index = filled[Math.floor(rng() * filled.length)];
    const x = index % size, y = Math.floor(index / size);
    push(sink, (x + rng()) * px - 1, 1 - (y + rng()) * px, (rng() - 0.5) * 0.06);
  }
  return sink.out;
}

/** Fallback when a glyph cannot be rasterised: a soft column cloud. */
export function scatterFormation(n: number, rng: Rng): Float32Array {
  const sink = sinkFor(n);
  while (sink.i < sink.end) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 0.8;
    push(sink, Math.cos(a) * r * 0.7, Math.sin(a) * r, (rng() - 0.5) * 0.3);
  }
  return sink.out;
}

/** Preserve every target point while giving persistent particles neighbouring destinations. */
export function matchChronicleFormation(source: Float32Array, target: Float32Array, order: 'radial' | 'diagonal' | 'vertical' | 'horizontal'): Float32Array {
  if (source.length !== target.length || source.length % 3 !== 0) throw new RangeError('Formation sizes must match');
  const n = source.length / 3;
  const indices = (points: Float32Array) => Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const key = (i: number) => order === 'radial' ? Math.atan2(points[i * 3 + 1], points[i * 3])
      : order === 'vertical' ? points[i * 3] + points[i * 3 + 1] * 0.07
      : order === 'horizontal' ? points[i * 3 + 1] + points[i * 3] * 0.07
      : points[i * 3] + points[i * 3 + 1];
    return key(a) - key(b) || a - b;
  });
  const from = indices(source), to = indices(target), matched = new Float32Array(target.length);
  for (let rank = 0; rank < n; rank++) for (let axis = 0; axis < 3; axis++) matched[from[rank] * 3 + axis] = target[to[rank] * 3 + axis];
  return matched;
}

export function buildChronicleField(requested: number, masks: readonly (GlyphMask | null)[] = [], seed = CHRONICLE_SEED): ChronicleField {
  const count = clampParticleCount(requested);
  const formationCount = Math.round(count * (1 - CHRONICLE_DUST_RATIO));
  const rng = seededRandom(seed);
  const glyph = (slot: number) => {
    const mask = masks[slot];
    return (mask && maskFormation(mask, formationCount, rng)) || scatterFormation(formationCount, rng);
  };
  const ring = ringFormation(formationCount, rng);
  const formations = [ring, oracleFormation(formationCount, rng), glyph(0), glyph(1), glyph(2), chainFormation(formationCount, rng), ring];
  formations[1] = matchChronicleFormation(formations[0], formations[1], 'radial');
  formations[2] = matchChronicleFormation(formations[1], formations[2], 'vertical');
  formations[3] = matchChronicleFormation(formations[2], formations[3], 'horizontal');
  formations[4] = matchChronicleFormation(formations[3], formations[4], 'vertical');
  formations[5] = matchChronicleFormation(formations[4], formations[5], 'diagonal');
  const dust = new Float32Array((count - formationCount) * 3);
  for (let i = 0; i < dust.length; i += 3) {
    dust[i] = rng() * 2 - 1;
    dust[i + 1] = rng() * 2 - 1;
    dust[i + 2] = rng() * 2 - 1;
  }
  const stages = formations.map(formation => {
    const all = new Float32Array(count * 3);
    all.set(formation, 0);
    all.set(dust, formationCount * 3);
    return all;
  });
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
  const kinds = new Float32Array(count);
  kinds.fill(1, formationCount);
  return { count, formationCount, stages, seeds, kinds };
}

/**
 * Scroll progress across stages. `boundaries[i]` is the document offset between stage i and i + 1;
 * each morph runs while the reading focus line crosses a `span`-tall window centred on it.
 */
export function chronicleProgress(boundaries: readonly number[], focus: number, span: number): number {
  if (!Number.isFinite(focus) || !Number.isFinite(span) || span <= 0) return 0;
  let progress = 0;
  for (const boundary of boundaries) {
    if (!Number.isFinite(boundary)) continue;
    progress += Math.max(0, Math.min(1, (focus - (boundary - span / 2)) / span));
  }
  return Math.max(0, Math.min(boundaries.length, progress));
}

export function chronicleStage(progress: number, last = CHRONICLE_LAST_STAGE): number {
  return Number.isFinite(progress) ? Math.max(0, Math.min(last, Math.round(progress))) : 0;
}

/** Reduced motion jumps between finished formations instead of animating through them. */
export function resolveChronicleProgress(progress: number, reducedMotion: boolean, last = CHRONICLE_LAST_STAGE): number {
  const value = Number.isFinite(progress) ? Math.max(0, Math.min(last, progress)) : 0;
  return reducedMotion ? chronicleStage(value, last) : value;
}

export const CHRONICLE_TRANSITIONS = ['oracle', 'documents', 'balance', 'citations', 'evidence-chain', 'return-ring'] as const;
export type ChronicleVisualState = {
  mode: 'scroll' | 'static-mobile' | 'static-reduced';
  progress: number;
  stage: number;
  transition: 'none' | (typeof CHRONICLE_TRANSITIONS)[number];
  /** Shader uniforms: selected segment, eased position, bend/pixel emphasis. */
  segment: number;
  mix: number;
  emphasis: number;
};

/** Directly seek the current scroll position; no animation queue or direction-dependent state. */
export function chronicleVisualState(progress: number, viewportWidth: number, reducedMotion: boolean): ChronicleVisualState {
  const mobile = Number.isFinite(viewportWidth) && viewportWidth > 0 && viewportWidth <= CHRONICLE_STATIC_WIDTH;
  const mode = reducedMotion ? 'static-reduced' : mobile ? 'static-mobile' : 'scroll';
  const p = resolveChronicleProgress(progress, mode !== 'scroll');
  // At a boundary keep the preceding route's exact endpoint. The next route starts
  // from that same buffer, so scroll reversal and a direct rail jump cannot snap.
  const segment = mode !== 'scroll' ? 0 : Math.max(1, Math.ceil(p));
  const local = segment ? p - (segment - 1) : 0;
  const mix = local * local * (3 - 2 * local);
  return {
    mode, progress: p, stage: chronicleStage(p), segment, mix,
    transition: segment ? CHRONICLE_TRANSITIONS[segment - 1] : 'none',
    emphasis: segment ? 4 * mix * (1 - mix) : 0,
  };
}

/** CPU reference for the GPU's six scroll-only routes, used to check the actual path boundaries. */
export function chronicleParticlePosition(from: ArrayLike<number>, to: ArrayLike<number>, seeds: ArrayLike<number>, segment: number, mix: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, Number.isFinite(mix) ? mix : 0));
  const focus = 4 * t * (1 - t), phase = seeds[0] * TAU;
  const x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t, z = from[2] + (to[2] - from[2]) * t;
  let dx = 0, dy = 0, dz = 0;
  if (segment === 1 || segment === 5) {
    const vx = to[0] - from[0], vy = to[1] - from[1], length = Math.hypot(vx, vy);
    const bend = focus * (segment === 1 ? 0.10 : 0.18) * (0.35 + seeds[3] * 0.65);
    if (length > 0.0001) { dx = -vy / length * bend; dy = vx / length * bend; }
    dz = focus * Math.sin(phase) * 0.06;
  } else if (segment === 2) {
    // Crack marks become orderly vertical slips before resolving into 徵.
    dx = Math.sin(from[1] * Math.PI + phase * 0.2) * focus * 0.09;
    dy = Math.cos(phase) * focus * 0.025;
    dz = focus * (seeds[1] - 0.5) * 0.12;
  } else if (segment === 3) {
    // Two sides of the evidence fan out equally, then meet in 灋.
    dx = Math.sign(from[0] + 0.00001) * focus * 0.15;
    dy = Math.sin(phase) * focus * 0.035;
    dz = focus * Math.cos(phase) * 0.08;
  } else if (segment === 4) {
    // A shallow paper fold turns judgement into a layered citation surface.
    dx = focus * Math.sin(from[1] * Math.PI) * 0.08;
    dy = focus * Math.sin(phase) * 0.02;
    dz = focus * (Math.abs(from[0]) - 0.4) * 0.24;
  } else if (segment === 6) {
    // The four-node chain gathers along a short spiral back to the original ring.
    const angle = Math.atan2(to[1], to[0]) + (1 - t) * 0.7;
    dx = Math.cos(angle) * focus * 0.14;
    dy = Math.sin(angle) * focus * 0.14;
    dz = focus * Math.sin(phase) * 0.04;
  }
  return [x + dx, y + dy, z + dz];
}

/** Presentational copy frames share the particle progress; none of the readable content is hidden. */
export function chronicleChapterFrame(progress: number, stage: number, staticVisual = false) {
  if (staticVisual) return { enter: 1, exit: 0, opacity: 1, shift: 0, artifactShift: 0 };
  const p = resolveChronicleProgress(progress, false), index = chronicleStage(stage);
  const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
  const enter = ease((p - index + 0.85) / 0.65), exit = ease((p - index - 0.65) / 0.7);
  return { enter, exit, opacity: 0.7 + enter * 0.3 - exit * 0.18, shift: 18 * (1 - enter) - 10 * exit, artifactShift: 12 * (1 - enter) };
}

/** Horizontal placement of each stage in landscape layouts: art beside, behind or opposite the copy. */
export const CHRONICLE_STAGE_PLACEMENT = ['center', 'left', 'backdrop', 'right', 'backdrop', 'right', 'center'] as const;
export type StagePlacement = (typeof CHRONICLE_STAGE_PLACEMENT)[number];

/** Where a stage sits in world units for a visible plane of `viewW × viewH`: [x, y, scale, brightness]. */
export function stageLayout(stage: number, viewW: number, viewH: number, out: Float32Array = new Float32Array(4)): Float32Array {
  const w = Number.isFinite(viewW) && viewW > 0 ? viewW : 1;
  const h = Number.isFinite(viewH) && viewH > 0 ? viewH : 1;
  const portrait = w / h < 0.9;
  const index = Number.isFinite(stage) ? Math.max(0, Math.min(CHRONICLE_LAST_STAGE, Math.round(stage))) : 0;
  const placement = CHRONICLE_STAGE_PLACEMENT[index];
  if (placement === 'center') {
    out[0] = 0;
    out[1] = portrait ? h * 0.03 : 0;
    out[2] = portrait ? Math.min(w * 0.66, h * 0.4) : Math.min(h * 0.56, w * 0.42);
    out[3] = portrait ? 0.95 : 1.2;
  } else if (portrait) {
    out[0] = 0;
    out[1] = h * 0.2;
    out[2] = Math.min(w * 0.42, h * 0.22);
    out[3] = placement === 'backdrop' ? 0.4 : 0.5;
  } else if (placement === 'backdrop') {
    // Behind centred copy: larger, dimmer, lifted slightly so headings stay legible.
    out[0] = 0;
    out[1] = h * 0.04;
    out[2] = Math.min(h * 0.47, w * 0.3);
    out[3] = 0.42;
  } else {
    out[0] = (placement === 'left' ? -1 : 1) * w * 0.245;
    out[1] = -h * 0.02;
    out[2] = Math.min(h * 0.36, w * 0.2);
    out[3] = 1;
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const scratchA = new Float32Array(4), scratchB = new Float32Array(4);

/** Layout between two stages, eased with the same smoothstep the shader applies to positions. */
export function blendStageLayout(progress: number, viewW: number, viewH: number, out: Float32Array = new Float32Array(4)): Float32Array {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(CHRONICLE_LAST_STAGE, progress)) : 0;
  const from = Math.floor(p), to = Math.min(CHRONICLE_LAST_STAGE, from + 1);
  const t = smooth(p - from);
  stageLayout(from, viewW, viewH, scratchA);
  stageLayout(to, viewW, viewH, scratchB);
  for (let i = 0; i < 4; i++) out[i] = scratchA[i] + (scratchB[i] - scratchA[i]) * t;
  return out;
}
