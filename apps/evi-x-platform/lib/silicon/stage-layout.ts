/** Ground-plane placement for the 硅基样本 stage: one golden-angle cluster per group, clusters around a ring. */
export type StageSlot = { x: number; z: number; facing: number };
export type StageGroup = { key: string; label: string; count: number; x: number; z: number; radius: number };
export type StageLayout = { slots: StageSlot[]; groups: StageGroup[]; extent: number };

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export const FIGURE_SPACING = 0.62;

function cluster(count: number, spacing: number): Array<{ x: number; z: number }> {
  return Array.from({ length: count }, (_, i) => {
    const r = spacing * Math.sqrt(i + 0.5), a = i * GOLDEN;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
}

export function clusterRadius(count: number, spacing = FIGURE_SPACING): number {
  return count > 0 ? spacing * Math.sqrt(count - 0.5) + spacing * 0.6 : 0;
}

/**
 * Group centres on a true circular arc that bows toward the camera. Adjacent chords are sized for the two radii;
 * the ring then grows until every pair (not only neighbours) clears `ra + rb + gap`.
 */
function arcCenters(radii: number[]): Array<{ x: number; z: number }> {
  const gap = 0.7, maxSpan = Math.PI * 0.8;
  const place = (ring: number) => {
    const steps = radii.slice(1).map((r, i) => 2 * Math.asin(Math.min(1, (radii[i] + r + gap) / (2 * ring))));
    const span = steps.reduce((s, a) => s + a, 0);
    let angle = -span / 2;
    const points = radii.map((_, i) => { if (i) angle += steps[i - 1]; return { x: Math.sin(angle) * ring, z: ring - Math.cos(angle) * ring }; });
    return { points, span };
  };
  const clear = (points: Array<{ x: number; z: number }>) => points.every((a, i) => points.every((b, j) => j <= i || Math.hypot(a.x - b.x, a.z - b.z) >= radii[i] + radii[j] + gap * 0.5));
  let ring = Math.max(...radii) * 1.6, result = place(ring);
  for (let guard = 0; guard < 80 && (result.span > maxSpan || !clear(result.points)); guard++) result = place(ring *= 1.12);
  const meanZ = result.points.reduce((s, p) => s + p.z, 0) / result.points.length;
  return result.points.map(p => ({ x: p.x, z: p.z - meanZ }));
}

/** Row-major grid for portrait stages; uniform cells sized for the largest cluster keep every pair apart. */
function gridCenters(radii: number[], columns: number): Array<{ x: number; z: number }> {
  const cell = Math.max(...radii) * 2 + 0.7, cols = Math.min(columns, radii.length), rows = Math.ceil(radii.length / cols);
  return radii.map((_, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, radii.length - row * cols), col = i % cols;
    return { x: (col - (inRow - 1) / 2) * cell, z: (row - (rows - 1) / 2) * cell };
  });
}

/**
 * `keys[i]` is the group of figure i, `order` lists group keys in display order with labels.
 * Groups never overlap: the arc grows with the clusters, and `columns` switches to a grid for narrow stages.
 */
export function stageLayout(keys: readonly string[], order: ReadonlyArray<{ key: string; label: string }>, options: { columns?: number } = {}): StageLayout {
  const present = order.filter(g => keys.includes(g.key));
  const extra = [...new Set(keys)].filter(k => !present.some(g => g.key === k)).map(key => ({ key, label: key }));
  const groups = [...present, ...extra].map(g => ({ ...g, count: keys.filter(k => k === g.key).length }));
  const radii = groups.map(g => clusterRadius(g.count));
  const centers = groups.length <= 1 ? [{ x: 0, z: 0 }] : options.columns && groups.length > options.columns ? gridCenters(radii, options.columns) : arcCenters(radii);
  const offsets = groups.map(g => cluster(g.count, FIGURE_SPACING));
  const used = groups.map(() => 0);
  const slots = keys.map(key => {
    const gi = groups.findIndex(g => g.key === key), o = offsets[gi][used[gi]++], c = centers[gi];
    return { x: c.x + o.x, z: c.z + o.z, facing: 0 };
  });
  const placed = groups.map((g, i) => ({ ...g, x: centers[i].x, z: centers[i].z, radius: radii[i] }));
  const extent = Math.max(1.5, ...slots.map(s => Math.hypot(s.x, s.z) + 0.6));
  return { slots, groups: placed, extent };
}
