'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
export { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

export const STAGE_ORDER = { chat: 0, advisors: 1, library: 2, paper: 3, overview: -1 } as const;
export type StageOrderKey = keyof typeof STAGE_ORDER;
export type StageDirection = 'forward' | 'backward';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const subscribeNothing = () => () => undefined;

function subscribeReducedMotion(listener: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return subscribeNothing();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

function stageRank(key: string): number {
  return key in STAGE_ORDER ? STAGE_ORDER[key as StageOrderKey] : 0;
}

/** Tracks stage order transitions to drive shared-axis directional enters, honoring reduced motion. */
export function useStageDirection(stageKey: string): { direction: StageDirection; reducedMotion: boolean } {
  const [tracker, setTracker] = useState<{ key: string; direction: StageDirection }>({
    key: stageKey,
    direction: 'forward',
  });
  if (tracker.key !== stageKey) {
    const prevRank = stageRank(tracker.key);
    const nextRank = stageRank(stageKey);
    setTracker({
      key: stageKey,
      direction: nextRank < prevRank ? 'backward' : 'forward',
    });
  }
  const reducedMotion = usePrefersReducedMotion();
  return { direction: reducedMotion ? 'forward' : tracker.direction, reducedMotion };
}

/** Pulses true for 700ms whenever illumination score strictly increases (skipped on initial mount and reduced motion). */
export function useIlluminationPulse(score: number): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prevScoreRef = useRef<number | null>(null);
  const timerRef = useRef<{ start?: number; end?: number }>({});

  useEffect(() => {
    const prev = prevScoreRef.current;
    prevScoreRef.current = score;
    if (prev === null || score <= prev || prefersReducedMotion()) return;
    if (timerRef.current.start) window.clearTimeout(timerRef.current.start);
    if (timerRef.current.end) window.clearTimeout(timerRef.current.end);
    timerRef.current.start = window.setTimeout(() => {
      setPulsing(true);
      timerRef.current.end = window.setTimeout(() => setPulsing(false), 700);
    }, 0);
  }, [score]);

  useEffect(() => () => {
    if (timerRef.current.start) window.clearTimeout(timerRef.current.start);
    if (timerRef.current.end) window.clearTimeout(timerRef.current.end);
  }, []);

  return pulsing;
}
