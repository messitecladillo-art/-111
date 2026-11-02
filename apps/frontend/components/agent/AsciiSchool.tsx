'use client';

import { useEffect, useRef } from 'react';
import { CATCH_LIFE, NET_RADIUS, RIPPLE_LIFE, castNet, catchText, createSchool, glyph, resizeSchool, stepSchool, type School } from '@/lib/agent/school';
import styles from './AgentShell.module.css';

const STEP = 1 / 60, MAX_STEPS = 4, FONT = 13;
const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [contenteditable="true"]';

/**
 * The school behind the empty conversation: faint, swimming away from the cursor, and a click on open water casts a
 * sampling net. It pauses when out of view or the tab is hidden, and holds one still frame for reduced motion.
 * Decorative only: hidden from assistive technology and never in the way of a click on the page's controls.
 */
export default function AsciiSchool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current, context = canvas?.getContext('2d');
    const host = canvas?.parentElement;
    if (!canvas || !context || !host) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let school: School | null = null, raf = 0, last = 0, acc = 0, visible = true;
    let ink = '', accent = '', family = '', sans = '';
    const readColours = () => {
      const style = getComputedStyle(canvas);
      ink = style.color; accent = style.getPropertyValue('--c-accent').trim() || '#0f766e'; family = style.fontFamily;
      sans = style.getPropertyValue('--c-sans').trim() || 'system-ui, sans-serif';
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (school) resizeSchool(school, rect.width, rect.height); else school = createSchool(rect.width, rect.height);
      school.keepOut = words(rect);
      readColours();
      if (reduced.matches) still();
    };
    // The box around the page's own words, relative to the canvas.
    const words = (rect: DOMRect) => {
      const boxes = [...host.children].filter(child => child !== canvas).map(child => child.getBoundingClientRect()).filter(b => b.width && b.height);
      if (!boxes.length) return null;
      const x = Math.min(...boxes.map(b => b.left)) - rect.left, y = Math.min(...boxes.map(b => b.top)) - rect.top;
      return { x, y, width: Math.max(...boxes.map(b => b.right)) - rect.left - x, height: Math.max(...boxes.map(b => b.bottom)) - rect.top - y };
    };
    const draw = () => {
      if (!school) return;
      const { width, height, time } = school;
      context.clearRect(0, 0, width, height);
      context.font = `500 ${FONT}px ${family}`;
      context.textBaseline = 'middle';
      const cell = FONT * 0.6;
      for (const f of school.fish) {
        const caught = f.caughtUntil > time;
        context.fillStyle = caught ? accent : ink;
        context.globalAlpha = caught ? 0.95 : f.size ? 0.55 : 0.4;
        // Snapped to the character grid, so the school moves the way text would.
        context.fillText(glyph(f), Math.round(f.x / cell) * cell, Math.round(f.y / FONT) * FONT);
      }
      for (const r of school.ripples) {
        const age = (time - r.born) / RIPPLE_LIFE, radius = NET_RADIUS * (0.25 + age * 0.85), dots = Math.max(10, Math.round(radius / 5));
        context.fillStyle = accent; context.globalAlpha = (1 - age) * 0.7;
        for (let i = 0; i < dots; i++) {
          const a = i / dots * Math.PI * 2;
          context.fillText(age < 0.4 ? 'o' : '·', r.x + Math.cos(a) * radius, r.y + Math.sin(a) * radius * 0.6);
        }
      }
      context.textAlign = 'center';
      for (const c of school.catches) {
        const age = (time - c.born) / CATCH_LIFE;
        context.fillStyle = accent; context.globalAlpha = age < 0.75 ? 0.9 : (1 - age) * 3.6;
        context.font = `600 12.5px ${sans}`;
        context.fillText(catchText(c.count), c.x, c.y - NET_RADIUS * 0.6 - age * 10);
        context.font = `500 ${FONT}px ${family}`;
      }
      context.textAlign = 'start';
      context.globalAlpha = 1;
    };
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now; acc += dt;
      let steps = 0;
      while (school && acc >= STEP && steps < MAX_STEPS) { stepSchool(school, STEP); acc -= STEP; steps++; }
      if (steps === MAX_STEPS) acc = 0;
      draw();
      raf = requestAnimationFrame(frame);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      if (!visible || document.hidden || reduced.matches) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    // Reduced motion: let the school settle, then hold one frame.
    const still = () => { if (school && school.time < 3) for (let i = 0; i < 180; i++) stepSchool(school, STEP); draw(); };
    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };
    const move = (event: PointerEvent) => {
      if (!school) return;
      const { x, y, inside } = local(event);
      Object.assign(school.pointer, { x, y, active: inside && event.pointerType !== 'touch' });
    };
    const down = (event: PointerEvent) => {
      if (!school || (event.target as Element | null)?.closest(INTERACTIVE)) return;
      const { x, y, inside } = local(event);
      if (inside) { castNet(school, x, y); if (reduced.matches) draw(); }
    };
    const leave = () => { if (school) school.pointer.active = false; };
    const resizer = new ResizeObserver(resize);
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); });
    const themeWatcher = new MutationObserver(readColours);
    resizer.observe(canvas); resizer.observe(host); watcher.observe(canvas);
    // The shell switches theme on an ancestor's attribute; the colours follow.
    const shell = canvas.closest('[data-theme]');
    if (shell) themeWatcher.observe(shell, { attributes: true, attributeFilter: ['data-theme'] });
    reduced.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerdown', down);
    window.addEventListener('blur', leave);
    resize();
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      resizer.disconnect(); watcher.disconnect(); themeWatcher.disconnect();
      reduced.removeEventListener('change', schedule);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('pointermove', move);
      host.removeEventListener('pointerdown', down);
      window.removeEventListener('blur', leave);
    };
  }, []);
  return <canvas ref={canvasRef} className={styles.school} aria-hidden="true" />;
}
