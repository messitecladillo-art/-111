'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether this person sees the code behind each result: off by default, so the agent stays simple for those who do not
 * program, and switched on by whoever handles the code in a team. It is a per-person view setting, remembered in this
 * browser for an account and for the tab for a guest; it changes nothing that is computed.
 */
const KEY = 'evix.agent.show-code.v1:', listeners = new Set<() => void>();
const storage = (owner: string) => owner === 'guest' ? window.sessionStorage : window.localStorage;
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function read(owner: string | null): boolean {
  if (!owner) return false;
  try { return storage(owner).getItem(KEY + owner) === '1'; } catch { return false; }
}

export function useShowCode(owner: string | null): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => read(owner), () => false);
  const set = useCallback((next: boolean) => {
    if (!owner) return;
    try { storage(owner).setItem(KEY + owner, next ? '1' : '0'); } catch { /* Without storage the choice is lost on reload. */ }
    for (const listener of listeners) listener();
  }, [owner]);
  return [on, set];
}
