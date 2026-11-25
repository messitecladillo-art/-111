'use client';

import { useEffect, useRef } from 'react';
import styles from './AgentShell.module.css';

const LIFE = 340, MAX_POINTS = 32;

type TrailPoint = { x: number; y: number; t: number; v: number };

/**
 * A dual-spectrum optical prism micro-filament (teal accent + refracted gold) behind the mouse,
 * modulated by pointer velocity and fading within a third of a second. Zero work when idle or reduced-motion.
 */
export default function CursorTrail() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const fine = window.matchMedia('(pointer: fine)'), reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const points: TrailPoint[] = [];
    let raf = 0, teal = '#0f766e', gold = '#9a5b06', smoothSpeed = 0;

    const readPalette = () => {
      const cs = getComputedStyle(canvas);
      teal = cs.getPropertyValue('--c-accent').trim() || cs.color || teal;
      gold = cs.getPropertyValue('--c-gold').trim() || gold;
    };

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr); canvas.height = Math.round(window.innerHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      readPalette();
    };

    // One clock for recording and ageing points: a frame callback's own timestamp is not always on performance.now()'s timeline.
    const draw = () => {
      const now = performance.now();
      while (points.length && now - points[0].t > LIFE) points.shift();
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (points.length >= 2) {
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1], curr = points[i];
          const life = Math.max(0, 1 - (now - curr.t) / LIFE);
          if (life <= 0) continue;
          const velNorm = Math.min(1, curr.v / 2.2);

          // Primary teal optical path
          context.strokeStyle = teal;
          context.globalAlpha = life * (0.24 + 0.24 * velNorm);
          context.lineWidth = 0.55 + (1.35 + 0.9 * velNorm) * life;
          context.beginPath();
          context.moveTo(prev.x, prev.y);
          context.lineTo(curr.x, curr.y);
          context.stroke();

          // Refracted gold dispersion companion filament offset along the normal
          const dx = curr.x - prev.x, dy = curr.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          const shift = (0.75 + 0.85 * velNorm) * life;
          const nx = (-dy / len) * shift, ny = (dx / len) * shift;
          context.strokeStyle = gold;
          context.globalAlpha = life * (0.16 + 0.2 * velNorm);
          context.lineWidth = 0.4 + (0.85 + 0.55 * velNorm) * life;
          context.beginPath();
          context.moveTo(prev.x + nx, prev.y + ny);
          context.lineTo(curr.x + nx, curr.y + ny);
          context.stroke();
        }
        context.globalAlpha = 1;
      }
      raf = points.length ? requestAnimationFrame(draw) : 0;
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduced.matches || !fine.matches || document.hidden) return;
      const now = performance.now();
      if (!points.length) {
        readPalette();
        smoothSpeed = 0;
      } else {
        const last = points[points.length - 1];
        const dt = Math.max(1, now - last.t);
        const speed = Math.min(3.5, Math.hypot(event.clientX - last.x, event.clientY - last.y) / dt);
        smoothSpeed = smoothSpeed * 0.6 + speed * 0.4;
      }
      points.push({ x: event.clientX, y: event.clientY, t: now, v: smoothSpeed });
      if (points.length > MAX_POINTS) points.shift();
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const stop = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      points.length = 0;
      smoothSpeed = 0;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    size();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('resize', size);
    window.addEventListener('evix:theme-change', readPalette);
    reduced.addEventListener('change', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('resize', size);
      window.removeEventListener('evix:theme-change', readPalette);
      reduced.removeEventListener('change', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);
  return <canvas ref={ref} className={styles.trail} role="presentation" aria-hidden="true" tabIndex={-1} />;
}
