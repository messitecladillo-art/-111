'use client';

import {
  boxCorners,
  cylinder,
  fitProjection,
  iso,
  joinPaths,
  knurl,
  lineOnTop,
  radialTicks,
  ring,
  segment,
  slabOf,
  type SolidPaths,
} from './vendor/iso-kit';
import styles from './ReportWorkstation.module.css';

type PrismMaterial = 'base' | 'metal' | 'paper' | 'accent' | 'brass' | 'dark';

type PrismPart = {
  id: string;
  shape: SolidPaths;
  material: PrismMaterial;
  lines?: string;
};

const WIDTH = 152;
const HEIGHT = 118;
const PROJ = fitProjection(boxCorners({ x: 4, y: 4, w: 92, d: 92, r: 0 }, 0, 52), WIDTH, HEIGHT, {
  pad: 12,
  azimuth: 52,
  elevation: 32,
});

const slab = (
  id: string,
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  h: number,
  material: PrismMaterial,
  r = 3,
): PrismPart => ({
  id,
  shape: slabOf({ x, y, w, d, r }, z, h, PROJ, 4, h > 1.5 ? 0.45 : 0),
  material,
});

const round = (
  id: string,
  cx: number,
  cy: number,
  radius: number,
  z: number,
  h: number,
  material: PrismMaterial,
  steps = 28,
): PrismPart => ({
  id,
  shape: cylinder(cx, cy, radius, z, h, PROJ, steps, h > 1.5 ? 0.35 : 0),
  material,
});

const PARTS: readonly PrismPart[] = [
  slab('prism-plinth', 8, 8, 84, 84, 0, 7, 'base', 10),
  slab('prism-deck', 14, 14, 72, 72, 7, 4, 'metal', 7),
  ...([
    [20, 20],
    [80, 20],
    [20, 80],
    [80, 80],
  ] as const).map(([x, y], idx) => ({
    ...round(`prism-bolt-${idx}`, x, y, 2.2, 11, 1.4, 'brass', 16),
    lines: lineOnTop([x - 1.1, y], [x + 1.1, y], 12.45, PROJ),
  })),
  {
    ...round('prism-bezel-dark', 50, 50, 29, 11, 5, 'dark', 36),
    lines: knurl(50, 50, 29, 11, 16, 30, PROJ, 0.45),
  },
  round('prism-bezel-brass', 50, 50, 24.5, 16, 3, 'brass', 32),
  slab('prism-chamber', 36, 36, 28, 28, 19, 15, 'accent', 6),
  slab('prism-lens', 40, 40, 20, 20, 34, 6, 'paper', 5),
  round('prism-turret', 50, 50, 5.2, 40, 7.5, 'brass', 24),
];

const VERNIER_TICKS = radialTicks(50, 50, 24, 24, 3, 19.15, [2.2, 4.2], PROJ);
const DIAL_RING = ring(50, 50, 19.6, 19.15, PROJ, 36);
const CROSSHAIR = joinPaths([
  lineOnTop([42, 50], [58, 50], 40.15, PROJ),
  lineOnTop([50, 42], [50, 58], 40.15, PROJ),
  segment([15, 50, 14], [36, 50, 26], PROJ),
  segment([64, 50, 26], [85, 50, 14], PROJ),
]);
const SHADOW_CENTER = iso([50, 50, 0], PROJ);
const BEACON_BEAM = segment([50, 50, 47.5], [50, 50, 54], PROJ);

function SolidMesh({ paths, material }: { paths: SolidPaths; material: PrismMaterial }) {
  return (
    <g className={styles.solid} data-material={material}>
      <path className={styles.fill} d={paths.fill} />
      {paths.shades.map((d, i) => (d ? <path key={i} className={styles.shade} data-shade={i} d={d} /> : null))}
      <path className={styles.top} d={paths.top} />
      {paths.crease && <path className={styles.crease} d={paths.crease} />}
      {paths.bevel && <path className={styles.bevel} d={paths.bevel} />}
      <path className={styles.edge} d={paths.outline} />
    </g>
  );
}

/** Compact isometric optical mirror calibrator built strictly with Anatomy iso-kit primitives. */
export default function AnatomyPrismMark({
  size = 76,
  running = false,
  className,
}: {
  size?: number;
  running?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${styles.prismBadge}${className ? ` ${className}` : ''}`}
      data-running={running ? 'true' : undefined}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={size}
        height={Math.round((size * HEIGHT) / WIDTH)}
        className={styles.machine}
      >
        <ellipse className={styles.ground} cx={SHADOW_CENTER[0]} cy={SHADOW_CENTER[1] + 2} rx="52" ry="13" />
        {PARTS.map((part) => (
          <g key={part.id} data-machine-part={part.id}>
            <SolidMesh paths={part.shape} material={part.material} />
            {part.lines && <path className={styles.detailLine} d={part.lines} />}
          </g>
        ))}
        <path className={styles.ticks} d={VERNIER_TICKS.minor} />
        <path className={styles.detailLine} d={joinPaths([VERNIER_TICKS.major, DIAL_RING, CROSSHAIR])} />
        <path className={styles.lamp} d={BEACON_BEAM} />
      </svg>
    </div>
  );
}
