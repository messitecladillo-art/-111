"use client";

import { useEffect, useRef, type RefObject } from 'react';

type Props = {
  running: boolean;
  eclipseRef: RefObject<HTMLDivElement | null>;
  className: string;
};

type Mote = { angle: number; phase: number; life: number; speed: number; drift: number; size: number; kind: number };
type Star = { x: number; y: number; size: number; phase: number; depth: number };
type Orbit = { rx: number; ry: number; tilt: number; phase: number; speed: number; kind: number };
type Point = { x: number; y: number };

const TAU = Math.PI * 2;
const COLORS = ['255,212,132', '110,228,212', '233,238,244'];
const ORBITS: Orbit[] = [
  { rx: .52, ry: .31, tilt: -.24, phase: .08, speed: .024, kind: 0 },
  { rx: .57, ry: .235, tilt: .24, phase: .54, speed: -.018, kind: 1 },
  { rx: .43, ry: .4, tilt: -.46, phase: .76, speed: .014, kind: 0 },
  { rx: .67, ry: .34, tilt: .1, phase: .31, speed: -.012, kind: 2 },
];

/** Conceptual evidence constellation. It carries no research or task state. */
export default function HeroAtmosphere({ running, eclipseRef, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;

    // A stable field prevents a pause, resize or reduced-motion change from reshuffling the scene.
    let seed = 41721;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const motes: Mote[] = Array.from({ length: 220 }, () => ({
      angle: (random() * 2 - 1) * 1.12,
      phase: random(), life: 12 + random() * 18,
      speed: 7 + random() * 18, drift: (random() - .5) * 7,
      size: 2 + Math.pow(random(), 3) * 10,
      kind: random() < .63 ? 0 : random() < .78 ? 1 : 2,
    }));
    const stars: Star[] = Array.from({ length: 76 }, () => ({
      x: random(), y: random() * .84,
      size: .45 + random() * .85, phase: random() * TAU, depth: .3 + random() * .7,
    }));
    const sprites = COLORS.map(rgb => {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 32;
      const brush = sprite.getContext('2d');
      if (brush) {
        const glow = brush.createRadialGradient(16, 16, 0, 16, 16, 16);
        glow.addColorStop(0, `rgba(${rgb},1)`);
        glow.addColorStop(.16, `rgba(${rgb},.75)`);
        glow.addColorStop(.45, `rgba(${rgb},.18)`);
        glow.addColorStop(1, `rgba(${rgb},0)`);
        brush.fillStyle = glow;
        brush.fillRect(0, 0, 32, 32);
      }
      return sprite;
    });

    let width = 0, height = 0, left = 0, top = 0;
    let horizonX = 0, horizonY = 0, horizonRadius = 1;
    let frameId = 0, measureId = 0, lastTime = 0, elapsed = elapsedRef.current;
    let disposed = false, visible = true;
    let orbitPaths: Point[][] = [];
    const pointer = { x: -10000, y: -10000, inside: false, offsetX: 0, offsetY: 0 };
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    const orbitPoint = (orbit: Orbit, angle: number): Point => {
      const x = Math.cos(angle) * width * orbit.rx;
      const y = Math.sin(angle) * height * orbit.ry;
      const cos = Math.cos(orbit.tilt), sin = Math.sin(orbit.tilt);
      return { x: width * .5 + x * cos - y * sin, y: height * .42 + x * sin + y * cos };
    };
    // The headline, supporting sentence and calls to action keep a quiet central field.
    const clearance = (x: number, y: number) => {
      const distance = Math.hypot((x - width * .5) / Math.max(1, Math.min(width * .37, 530)), (y - height * .37) / Math.max(1, height * .3));
      return Math.max(0, Math.min(1, (distance - .82) / .48));
    };
    const beyondHorizon = (x: number, y: number) => (x - horizonX) ** 2 + (y - horizonY) ** 2 >= horizonRadius ** 2;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      left = rect.left; top = rect.top;
      const nextWidth = Math.max(1, rect.width), nextHeight = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (nextWidth !== width || nextHeight !== height || canvas.width !== Math.round(nextWidth * dpr)) {
        width = nextWidth; height = nextHeight;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        orbitPaths = ORBITS.map(orbit => Array.from({ length: 97 }, (_, index) => orbitPoint(orbit, index / 96 * TAU)));
      }
      const eclipse = eclipseRef.current?.getBoundingClientRect();
      horizonX = eclipse ? eclipse.left + eclipse.width / 2 - left : width / 2;
      horizonY = eclipse ? eclipse.top + eclipse.height / 2 - top : height * .73 + width * .75;
      horizonRadius = eclipse ? eclipse.width / 2 : width * .75;
    };

    const draw = (delta: number) => {
      if (delta > 0) { elapsed += delta; elapsedRef.current = elapsed; }
      const follow = delta > 0 ? 1 - Math.exp(-delta * 6) : 1;
      const targetX = pointer.inside ? (pointer.x / width - .5) * 12 : 0;
      const targetY = pointer.inside ? (pointer.y / height - .5) * 8 : 0;
      pointer.offsetX += (targetX - pointer.offsetX) * follow;
      pointer.offsetY += (targetY - pointer.offsetY) * follow;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#e9eef4';
      for (const star of stars) {
        const x = star.x * width + pointer.offsetX * star.depth;
        const y = star.y * height + pointer.offsetY * star.depth;
        if (!beyondHorizon(x, y)) continue;
        ctx.globalAlpha = clearance(x, y) * (.16 + (.5 + .5 * Math.sin(elapsed * .65 + star.phase)) * .34);
        ctx.fillRect(x, y, star.size, star.size);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = .65;
      ORBITS.forEach((orbit, index) => {
        const path = orbitPaths[index];
        if (!path) return;
        const ox = pointer.offsetX * (1 + index * .2), oy = pointer.offsetY * (1 + index * .2);
        ctx.strokeStyle = `rgb(${COLORS[orbit.kind]})`;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          const x = (a.x + b.x) / 2 + ox, y = (a.y + b.y) / 2 + oy;
          if (!beyondHorizon(x, y)) continue;
          const alpha = clearance(x, y) * (.075 + index * .012);
          if (alpha < .004) continue;
          ctx.globalAlpha = alpha;
          ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke();
        }
        // Two small beacons make the orbit's direction legible without a persistent flashing trail.
        for (let beacon = 0; beacon < 2; beacon++) {
          const angle = (orbit.phase + elapsed * orbit.speed + beacon * .5) * TAU;
          const point = orbitPoint(orbit, angle);
          const x = point.x + ox, y = point.y + oy;
          if (!beyondHorizon(x, y)) continue;
          ctx.globalAlpha = clearance(x, y) * .78;
          const size = beacon === 0 ? 15 : 9;
          ctx.drawImage(sprites[orbit.kind], x - size / 2, y - size / 2, size, size);
          ctx.globalAlpha *= .7;
          ctx.fillStyle = `rgb(${COLORS[orbit.kind]})`;
          ctx.beginPath(); ctx.arc(x, y, beacon === 0 ? 1.25 : .8, 0, TAU); ctx.fill();
        }
      });

      const neighbors: Point[] = [];
      for (const mote of motes) {
        const age = ((elapsed / mote.life + mote.phase) % 1) * mote.life;
        const angle = -Math.PI / 2 + mote.angle * Math.min(1, width * .6 / horizonRadius);
        const nx = Math.cos(angle), ny = Math.sin(angle);
        let x = horizonX + nx * (horizonRadius + 2 + age * mote.speed) + age * mote.drift;
        let y = horizonY + ny * (horizonRadius + 2 + age * mote.speed) - age * 2;
        x += pointer.offsetX * 1.4; y += pointer.offsetY * 1.4;
        if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
        const distance = pointer.inside ? Math.hypot(x - pointer.x, y - pointer.y) : Infinity;
        if (distance < 160 && distance > .1) {
          const push = (1 - distance / 160) * 15;
          x += (x - pointer.x) / distance * push; y += (y - pointer.y) / distance * push;
        }
        const alpha = Math.pow(Math.sin(Math.PI * age / mote.life), 1.25) * clearance(x, y) * .78;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[mote.kind], x - mote.size / 2, y - mote.size / 2, mote.size, mote.size);
        // A fixed cap plus only three forward neighbors bounds this work at 72 comparisons.
        if (distance < 180 && alpha > .06 && neighbors.length < 24) neighbors.push({ x, y });
      }
      ctx.lineWidth = .65;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < Math.min(neighbors.length, i + 4); j++) {
          const a = neighbors[i], b = neighbors[j], distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > 90) continue;
          ctx.globalAlpha = (1 - distance / 90) * .28 * clearance((a.x + b.x) / 2, (a.y + b.y) / 2);
          ctx.strokeStyle = `rgb(${COLORS[(i + j) % 2]})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const stop = () => {
      cancelAnimationFrame(frameId); frameId = 0; lastTime = 0;
    };
    const active = () => !disposed && running && visible && !document.hidden;
    const loop = (now: number) => {
      frameId = 0;
      if (!active()) return;
      const delta = lastTime ? Math.min(.05, Math.max(0, (now - lastTime) / 1000)) : 0;
      lastTime = now;
      draw(delta);
      frameId = requestAnimationFrame(loop);
    };
    const start = () => {
      if (active() && !frameId) frameId = requestAnimationFrame(loop);
    };
    const scheduleMeasure = () => {
      if (disposed || measureId || document.hidden || !visible) return;
      measureId = requestAnimationFrame(() => {
        measureId = 0;
        if (disposed) return;
        measure(); draw(0); start();
      });
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop(); cancelAnimationFrame(measureId); measureId = 0;
      } else { scheduleMeasure(); start(); }
    };
    const move = (event: PointerEvent) => {
      if (!finePointer.matches || !active()) return;
      pointer.x = event.clientX - left; pointer.y = event.clientY - top;
      pointer.inside = pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height;
    };
    const leave = () => { pointer.inside = false; };
    const onEclipseSettled = () => scheduleMeasure();

    measure();
    const initialRect = canvas.getBoundingClientRect();
    visible = initialRect.bottom > 0 && initialRect.top < window.innerHeight;
    draw(0);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    resize?.observe(canvas);
    if (eclipseRef.current) resize?.observe(eclipseRef.current);
    const seen = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) { scheduleMeasure(); start(); }
      else { stop(); cancelAnimationFrame(measureId); measureId = 0; pointer.inside = false; }
    });
    seen?.observe(canvas);
    const eclipse = eclipseRef.current;
    eclipse?.addEventListener('animationend', onEclipseSettled);
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (running) {
      window.addEventListener('pointermove', move, { passive: true });
      document.documentElement.addEventListener('pointerleave', leave);
      window.addEventListener('blur', leave);
    }
    start();

    return () => {
      disposed = true;
      stop(); cancelAnimationFrame(measureId);
      resize?.disconnect(); seen?.disconnect();
      eclipse?.removeEventListener('animationend', onEclipseSettled);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
      sprites.forEach(sprite => { sprite.width = sprite.height = 0; });
    };
  }, [running, eclipseRef]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
