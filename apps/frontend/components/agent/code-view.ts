'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A person's view choices, remembered in this browser for an account and for the tab for a guest. They change what is
 * shown, never what is computed.
 */
const listeners = new Set<() => void>();
const storage = (owner: string) => owner === 'guest' ? window.sessionStorage : window.localStorage;
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

function useChoice<T extends string>(owner: string | null, key: string, values: readonly T[], fallback: T): [T, (next: T) => void] {
  const read = () => {
    if (!owner) return fallback;
    try { const v = storage(owner).getItem(key + owner); return values.includes(v as T) ? v as T : fallback; } catch { return fallback; }
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback((next: T) => {
    if (!owner) return;
    try { storage(owner).setItem(key + owner, next); } catch { /* Without storage the choice is lost on reload. */ }
    for (const listener of listeners) listener();
  }, [owner, key]);
  return [value, set];
}

/**
 * Whether this person sees the code behind each result: off by default, so the agent stays simple for those who do not
 * program, and switched on by whoever handles the code in a team.
 */
export function useShowCode(owner: string | null): [boolean, (on: boolean) => void] {
  const [value, set] = useChoice(owner, 'evix.agent.show-code.v1:', ['1', '0'] as const, '0');
  return [value === '1', useCallback((on: boolean) => set(on ? '1' : '0'), [set])];
}

/** What fills the centre: the conversation, or the report itself with the conversation as a copilot beside it. */
export type Stage = 'chat' | 'paper' | 'advisors';
export const useStage = (owner: string | null) => useChoice<Stage>(owner, 'evix.agent.stage.v1:', ['chat', 'paper', 'advisors'], 'chat');

/** The advisors this person has hired, as a comma list; the snapshot is the stored string, so it is stable between reads. */
export function useHired(owner: string | null): [string[], (ids: string[]) => void] {
  const key = 'evix.agent.advisors.v1:';
  const read = () => {
    if (!owner) return '';
    try { return storage(owner).getItem(key + owner) ?? ''; } catch { return ''; }
  };
  const raw = useSyncExternalStore(subscribe, read, () => '');
  const set = useCallback((ids: string[]) => {
    if (!owner) return;
    try { storage(owner).setItem(key + owner, ids.join(',')); } catch { /* Without storage the choice is lost on reload. */ }
    for (const listener of listeners) listener();
  }, [owner]);
  return [raw ? raw.split(',').filter(Boolean) : [], set];
}
