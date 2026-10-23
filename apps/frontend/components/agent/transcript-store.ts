'use client';

import type { AgentTurn } from '@/lib/agent/router';

/** One entry of the agent transcript. `at` lets a reply develop once, when it is new, and never on reload. */
export type Message =
  | { id: string; at: number; role: 'user'; text: string }
  | { id: string; at: number; role: 'agent'; turn: AgentTurn; answered?: 'confirmed' | 'cancelled' }
  /** A knowledge lookup waiting for the search index; never stored, since it could not finish after a reload. */
  | { id: string; at: number; role: 'pending'; query: string; explicit: boolean };

const KEY = 'evix.agent.transcript.v1', LIMIT = 160;
const EMPTY: Message[] = [];
let messages: Message[] | null = null;
const listeners = new Set<() => void>();

function read(): Message[] {
  if (messages) return messages;
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    messages = Array.isArray(parsed) ? parsed.filter((m): m is Message => !!m && typeof m === 'object' && typeof m.id === 'string'
      && typeof m.at === 'number' && ((m.role === 'user' && typeof m.text === 'string') || (m.role === 'agent' && Array.isArray(m.turn?.lines)))) : [];
  } catch { messages = []; }
  return messages;
}

/** The transcript of this tab. It is a convenience only: the project never depends on it, and clearing it loses no work. */
export const transcript = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: read,
  serverSnapshot: () => EMPTY,
  update(change: (current: Message[]) => Message[]) {
    messages = change(read()).slice(-LIMIT);
    try { window.sessionStorage.setItem(KEY, JSON.stringify(messages.filter(m => m.role !== 'pending'))); } catch { /* Private browsing keeps the transcript in memory only. */ }
    for (const listener of listeners) listener();
  },
};

/** A fresh identity and timestamp for a new transcript entry. */
export const stamp = () => ({ id: crypto.randomUUID(), at: Date.now() });
