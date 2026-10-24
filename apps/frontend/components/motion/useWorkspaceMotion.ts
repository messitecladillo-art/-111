'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { createContentReveal, createKeyedListMotion, type MarkerAxis } from '@/lib/workspace-motion';

/** Attach only to navigation/list decoration; never to the active editor. */
export function useKeyedListMotion<T extends HTMLElement>({ ids, activeId = null, markerAxis = 'vertical', enabled = true }: {
  ids: readonly string[]; activeId?: string | null; markerAxis?: MarkerAxis; enabled?: boolean;
}): RefObject<T | null> {
  const ref = useRef<T>(null);
  const current = useRef<{ node: T; motion: ReturnType<typeof createKeyedListMotion> } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (current.current?.node !== node) { current.current?.motion.dispose(); current.current = node ? { node, motion: createKeyedListMotion(node) } : null; }
    current.current?.motion.update(ids, activeId, markerAxis, enabled);
  });
  useEffect(() => () => { current.current?.motion.dispose(); current.current = null; }, []);
  return ref;
}

/** A changing receipt/result token fades a read-only surface, without remounting it. */
export function useContentReveal<T extends HTMLElement>({ token, enabled = true }: { token: string | null; enabled?: boolean }): RefObject<T | null> {
  const ref = useRef<T>(null);
  const current = useRef<{ node: T; motion: ReturnType<typeof createContentReveal> } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (current.current?.node !== node) { current.current?.motion.dispose(); current.current = node ? { node, motion: createContentReveal(node) } : null; }
    current.current?.motion.update(token, enabled);
  });
  useEffect(() => () => { current.current?.motion.dispose(); current.current = null; }, []);
  return ref;
}
