/** Original report press, built with Anatomy's pinned, MIT-licensed geometry kit.
 * Geometry is immutable; task state never changes the drawing's measurements.
 */
import { axisVector, boxCorners, cylinder, fitProjection, iso, joinPaths, lineOnTop, planOutline, radialTicks, ring, segment, slabOf, topTicks, type SolidPaths } from './vendor/iso-kit';

export const WIDTH = 520;
export const HEIGHT = 245;
export const P = fitProjection(boxCorners({ x: -8, y: -8, w: 296, d: 134, r: 0 }, 0, 101), WIDTH, HEIGHT,
  { pad: 24, azimuth: 60, elevation: 32 });
export const travel = axisVector(P, [22, 0, 0]);

export type Part = { id: string; shape: SolidPaths; material: 'base' | 'metal' | 'paper' | 'accent' | 'brass' | 'dark'; lines?: string };
const slab = (id: string, x: number, y: number, w: number, d: number, z: number, h: number, material: Part['material'] = 'metal', r = 2): Part =>
  ({ id, shape: slabOf({ x, y, w, d, r }, z, h, P, 4, h > 1 ? .5 : 0), material });
const round = (id: string, x: number, y: number, radius: number, z: number, h: number, material: Part['material'] = 'metal'): Part =>
  ({ id, shape: cylinder(x, y, radius, z, h, P, 24, h > 1 ? .3 : 0), material });
const screw = (id: string, x: number, y: number, z: number): Part => ({
  ...round(id, x, y, 1.55, z, .7, 'brass'),
  lines: lineOnTop([x - .8, y], [x + .8, y], z + .71, P),
});

const feet = [[12, 13], [266, 13], [12, 108], [266, 108]].map(([x, y], i) => round(`foot-${i}`, x, y, 5, 0, 5, 'dark'));
export const BASE: Part[] = [
  ...feet,
  slab('chassis', 0, 0, 280, 122, 5, 8, 'base', 8),
  slab('deck', 7, 7, 266, 108, 13, 2, 'metal', 5),
  ...[[13, 13], [267, 13], [13, 109], [267, 109]].map(([x, y], i) => screw(`deck-screw-${i}`, x, y, 15)),
  slab('ruler', 60, 101, 163, 6, 15, 1, 'brass', .5),
  slab('rear-support-left', 67, 17, 10, 10, 15, 50),
  slab('rear-support-right', 219, 17, 10, 10, 15, 50),
  slab('rear-shoe-left', 62, 13, 20, 18, 15, 3, 'dark'),
  slab('rear-shoe-right', 214, 13, 20, 18, 15, 3, 'dark'),
  screw('shoe-screw-left', 65, 27, 18), screw('shoe-screw-right', 231, 27, 18),
  slab('paper-bed', 63, 35, 161, 60, 15, 1, 'base'),
  slab('paper', 71, 40, 144, 51, 16.1, .7, 'paper', .5),
];
export const RULER = topTicks(64, 219, 5, 5, 102, 16.1, [2, 4], P);
export const PAPER_LINES = Array.from({ length: 7 }, (_, i) => lineOnTop([89, 49 + i * 5], [i === 6 ? 146 : 195, 49 + i * 5], 16.85, P)).join('');
export const DATA_GRID = joinPaths([
  ...Array.from({ length: 6 }, (_, i) => lineOnTop([87, 48 + i * 7], [198, 48 + i * 7], 16.85, P)),
  ...Array.from({ length: 7 }, (_, i) => lineOnTop([87 + i * 18.5, 48], [87 + i * 18.5, 83], 16.85, P)),
]);
export const REFERENCE_CARDS = joinPaths(Array.from({ length: 3 }, (_, i) => {
  const x = 87 + i * 36;
  return joinPaths([
    planOutline({ x, y: 48, w: 29, d: 32, r: 1 }, 16.85, P),
    lineOnTop([x + 4, 54], [x + 12, 54], 16.85, P),
    lineOnTop([x + 4, 61], [x + 24, 61], 16.85, P),
    lineOnTop([x + 4, 67], [x + 24, 67], 16.85, P),
    lineOnTop([x + 4, 73], [x + 19, 73], 16.85, P),
  ]);
}));

export const FEEDER: Part[] = [
  slab('evidence-tray-bottom', 12, 38, 41, 49, 15, 4, 'base'),
  slab('evidence-tray-left', 11, 36, 3, 53, 19, 9),
  slab('evidence-tray-back', 14, 36, 40, 3, 19, 9),
  slab('evidence-tray-front', 14, 86, 40, 3, 19, 4),
  ...Array.from({ length: 5 }, (_, i) => slab(`evidence-leaf-${i}`, 17 + i * .4, 42 - i * .3, 32, 39, 19 + i * 1.3, 1, 'paper', .5)),
  slab('evidence-tab', 18.6, 43, 7, 10, 25.8, .6, 'brass', .5),
];

export const FRAME: Part[] = [
  slab('gantry', 64, 17, 169, 10, 65, 8, 'base'),
  slab('upper-rail', 77, 18.8, 143, 2.2, 73, 1.5, 'brass', .4),
  slab('lower-rail', 77, 25, 143, 2.2, 68.5, 1.5, 'metal', .4),
  slab('stop-left', 75, 17, 4, 12, 65, 11, 'dark', .6),
  slab('stop-right', 218, 17, 4, 12, 65, 11, 'dark', .6),
  screw('gantry-screw-left', 69, 22, 73), screw('gantry-screw-right', 227, 22, 73),
];

export const CARRIAGE: Part[] = [
  slab('carriage', 137, 15, 24, 19, 64, 13, 'accent', 3),
  slab('carriage-cap', 140, 18, 18, 13, 77, 2, 'metal', 2),
  slab('pen-arm', 144, 30, 10, 26, 62, 5, 'metal'),
  round('pen-collet', 149, 51, 5, 56, 9, 'brass'),
  round('pen-barrel', 149, 51, 2.7, 32, 24, 'dark'),
  round('pen-nib', 149, 51, 1, 17, 15, 'accent'),
  screw('carriage-screw-left', 143, 22, 79), screw('carriage-screw-right', 155, 28, 79),
];

export const OUTPUT: Part[] = [
  slab('output-tray', 236, 39, 31, 54, 15, 5, 'base'),
  slab('output-side', 265, 37, 3, 58, 20, 5, 'metal'),
  ...Array.from({ length: 4 }, (_, i) => slab(`output-leaf-${i}`, 240, 43 - i * .3, 23, 45, 20 + i * 1.1, .8, 'paper', .4)),
  slab('proof-tab', 240, 42, 23, 6, 24.4, .6, 'accent', .5),
];

export const CONTROL: Part[] = [
  slab('control-housing', 238, 99, 28, 13, 15, 5, 'base'),
  round('proof-dial-base', 253, 105, 6, 20, 2, 'brass'),
  round('proof-dial-face', 253, 105, 4.6, 22, .7, 'paper'),
  round('status-socket', 231, 105, 2.8, 15, 1.5, 'dark'),
  round('status-lamp', 231, 105, 1.6, 16.5, 1, 'accent'),
];
export const DIAL = radialTicks(253, 105, 3.8, 12, 3, 22.8, [.8, 1.5], P);
export const DIAL_NEEDLE = lineOnTop([253, 105], [255.2, 103.2], 22.9, P);
export const SEAMS = joinPaths([
  planOutline({ x: 4, y: 4, w: 272, d: 114, r: 7 }, 9, P),
  segment([72, 19, 20], [72, 19, 61], P), segment([224, 19, 20], [224, 19, 61], P),
]);
export const SOCKET = ring(231, 105, 1.7, 17.6, P);
export const SHADOW = iso([143, 63, 0], P);
