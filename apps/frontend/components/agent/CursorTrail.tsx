'use client';

import { useEffect, useRef } from 'react';
import styles from './AgentShell.module.css';

const LIFE = 360, MAX_POINTS = 32;

/**
 * A short, fine trail behind the mouse, in the accent colour, fading within a third of a second. It sits above the page
 * without taking a click, draws only while the mouse moves and stops entirely when it rests, and is off for touch,
 * pens and anyone who asked for reduced motion.
 */
export default function CursorTrail() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const fine = window.matchMedia('(pointer: fine)'), reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const points: { x: number; y: number; t: number }[] = [];
    let raf = 0, colour = '#0f766e';
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr); canvas.height = Math.round(window.innerHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      colour = getComputedStyle(canvas).color || colour;
    };
    // One clock for recording and ageing points: a frame callback's own timestamp is not always on performance.now()'s timeline.
    const draw = () => {
      const now = performance.now();
      while (points.length && now - points[0].t > LIFE) points.shift();
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      context.lineCap = 'round'; context.strokeStyle = colour;
      for (let i = 1; i < points.length; i++) {
        const life = 1 - (now - points[i].t) / LIFE;
        context.globalAlpha = Math.max(0, life) * 0.45;
        context.lineWidth = 0.6 + 2.2 * Math.max(0, life);
        context.beginPath(); context.moveTo(points[i - 1].x, points[i - 1].y); context.lineTo(points[i].x, points[i].y); context.stroke();
      }
      context.globalAlpha = 1;
      raf = points.length ? requestAnimationFrame(draw) : 0;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduced.matches || !fine.matches) return;
      points.push({ x: event.clientX, y: event.clientY, t: performance.now() });
      if (points.length > MAX_POINTS) points.shift();
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const stop = () => { points.length = 0; context.clearRect(0, 0, window.innerWidth, window.innerHeight); };
    size();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('resize', size);
    reduced.addEventListener('change', stop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('resize', size);
      reduced.removeEventListener('change', stop);
    };
  }, []);
  return <canvas ref={ref} className={styles.trail} aria-hidden="true" />;
}
