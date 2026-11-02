/**
 * A school of ASCII fish for the agent's empty page: each fish a respondent, the cursor a disturbance they swim away
 * from, a click a sampling net that counts the fish it lands on. Plain flocking (separation, alignment, cohesion) with
 * a seeded wander, so a given seed always swims the same way. Drawing is left to the caller.
 */
export type Fish = { x: number; y: number; vx: number; vy: number; size: 0 | 1; caughtUntil: number };
export type Ripple = { x: number; y: number; born: number };
export type Catch = { x: number; y: number; count: number; born: number };
export type School = {
  width: number; height: number; time: number; fish: Fish[]; ripples: Ripple[]; catches: Catch[];
  pointer: { x: number; y: number; active: boolean }; random: () => number;
  /** Where the page's words are: the school swims around it so the text stays readable. */
  keepOut: { x: number; y: number; width: number; height: number } | null;
};

export const NET_RADIUS = 70;
export const RIPPLE_LIFE = 1.1, CATCH_LIFE = 2.6;
// Distances between fish are measured with the width shrunk by GLYPH, since a fish is a few characters wide and one line tall.
const NEIGHBOUR = 56, SEPARATION = 15, GLYPH = 2.2, FLEE = 110;
const MAX_SPEED = 46, MIN_SPEED = 14;

/** Mulberry32: small, fast and the same everywhere. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** About one fish per 9000 px², between 18 and 80, so a small window is not crowded and a large one not empty. */
export const fishFor = (width: number, height: number) => Math.max(18, Math.min(80, Math.round(width * height / 9000)));

export function createSchool(width: number, height: number, seed = 20261102): School {
  const random = seeded(seed);
  const fish = Array.from({ length: fishFor(width, height) }, (): Fish => {
    const angle = (random() - 0.5) * 0.8 + (random() < 0.5 ? 0 : Math.PI), speed = MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED) * 0.6;
    return { x: random() * width, y: random() * height, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: random() < 0.18 ? 1 : 0, caughtUntil: 0 };
  });
  return { width, height, time: 0, fish, ripples: [], catches: [], pointer: { x: 0, y: 0, active: false }, random, keepOut: null };
}

/**
 * A new size keeps the fish, carried proportionally into the new bounds. A large change (a panel opening or closing)
 * scatters them afresh instead, so a school squeezed into a narrow strip does not stay bunched when the room comes back.
 */
export function resizeSchool(school: School, width: number, height: number) {
  if (width <= 0 || height <= 0) return;
  const rx = width / school.width, ry = height / school.height, large = rx > 1.5 || rx < 1 / 1.5 || ry > 1.5 || ry < 1 / 1.5;
  for (const f of school.fish) {
    if (large) { f.x = school.random() * width; f.y = school.random() * height; }
    else { f.x *= rx; f.y *= ry; }
  }
  school.width = width; school.height = height;
}

const wrap = (value: number, size: number) => ((value % size) + size) % size;

export function stepSchool(school: School, dt: number) {
  const { fish, pointer, width, height, random } = school;
  school.time += dt;
  for (const f of fish) {
    let ax = 0, ay = 0, cx = 0, cy = 0, avx = 0, avy = 0, n = 0;
    for (const o of fish) {
      if (o === f) continue;
      const dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy);
      if (d > NEIGHBOUR || d === 0) continue;
      n++; cx += dx; cy += dy; avx += o.vx; avy += o.vy;
      const near = Math.hypot(dx / GLYPH, dy);
      if (near < SEPARATION) { const push = (SEPARATION - near) * 7 / Math.max(near, 1); ax -= dx / GLYPH * push; ay -= dy * push; }
    }
    // Cohesion is gentle: a school, not a ball.
    if (n) { ax += cx / n * 0.12 + (avx / n - f.vx) * 0.5; ay += cy / n * 0.12 + (avy / n - f.vy) * 0.5; }
    // A slow wander keeps the school from settling into one stream.
    ax += (random() - 0.5) * 30; ay += (random() - 0.5) * 18;
    if (pointer.active) {
      const dx = f.x - pointer.x, dy = f.y - pointer.y, d = Math.hypot(dx, dy);
      if (d < FLEE && d > 0) { const push = (FLEE - d) / FLEE * 260; ax += dx / d * push; ay += dy / d * push; }
    }
    const out = school.keepOut;
    if (out) {
      // Inside the words' box, or close to it, a fish is pushed out the nearer way, above or below.
      const margin = 18, left = out.x - margin, right = out.x + out.width + margin, top = out.y - margin, bottom = out.y + out.height + margin;
      if (f.x > left && f.x < right && f.y > top && f.y < bottom) {
        const up = f.y - top < bottom - f.y;
        ay += (up ? -1 : 1) * 420; f.vy += (up ? -1 : 1) * 2;
      }
    }
    // Fish swim more across than up and down.
    ay -= f.vy * 0.35;
    f.vx += ax * dt; f.vy += ay * dt;
    const speed = Math.hypot(f.vx, f.vy), top = f.caughtUntil > school.time ? MAX_SPEED * 0.4 : MAX_SPEED;
    if (speed > top) { f.vx *= top / speed; f.vy *= top / speed; }
    else if (speed < MIN_SPEED && speed > 0) { f.vx *= MIN_SPEED / speed; f.vy *= MIN_SPEED / speed; }
    f.x = wrap(f.x + f.vx * dt, width); f.y = wrap(f.y + f.vy * dt, height);
  }
  school.ripples = school.ripples.filter(r => school.time - r.born < RIPPLE_LIFE);
  school.catches = school.catches.filter(c => school.time - c.born < CATCH_LIFE);
}

/** Casts a net at (x, y): the fish inside are caught for a moment and counted. Returns the count. */
export function castNet(school: School, x: number, y: number): number {
  let count = 0;
  for (const f of school.fish) {
    if (Math.hypot(f.x - x, f.y - y) > NET_RADIUS) continue;
    f.caughtUntil = school.time + CATCH_LIFE;
    count++;
  }
  school.ripples.push({ x, y, born: school.time });
  school.catches = [...school.catches.slice(-2), { x, y, count, born: school.time }];
  return count;
}

/** The fish as it is drawn, facing the way it swims. */
export const glyph = (f: Fish) => f.size ? (f.vx >= 0 ? "><(('>" : "<'))><") : (f.vx >= 0 ? '><>' : '<><');
export const catchText = (count: number) => count ? `这一网抽到 ${count} 尾` : '这一网落空了';
