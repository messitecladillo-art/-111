'use client';

import type { AgentTurn } from '@/lib/agent/router';

/** One entry of the agent transcript. `at` lets a reply develop once, when it is new, and never on reload. */
export type Message =
  | { id: string; at: number; role: 'user'; text: string }
  | { id: string; at: number; role: 'agent'; turn: AgentTurn; answered?: 'confirmed' | 'cancelled' }
  /** A knowledge lookup waiting for the search index; never stored, since it could not finish after a reload. */
  | { id: string; at: number; role: 'pending'; query: string; explicit: boolean };

/** v2 records whose transcript it is; v1 did not, so it is removed rather than read. */
const KEY = 'evix.agent.transcript.v2', LEGACY_KEY = 'evix.agent.transcript.v1', LIMIT = 160;
const EMPTY: Message[] = [];
let owner: string | null = null;
let messages: Message[] = EMPTY;
const listeners = new Set<() => void>();

const valid = (m: unknown): m is Message => !!m && typeof m === 'object' && typeof (m as Message).id === 'string' && typeof (m as Message).at === 'number'
  && (((m as Message).role === 'user' && typeof (m as { text?: unknown }).text === 'string') || ((m as Message).role === 'agent' && Array.isArray((m as { turn?: { lines?: unknown } }).turn?.lines)));
function stored(id: string): Message[] {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');
    const record = value as { owner?: unknown; messages?: unknown } | null;
    return record?.owner === id && Array.isArray(record.messages) ? record.messages.filter(valid) : [];
  } catch { return []; }
}
function persist() {
  if (owner === null) return;
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ owner, messages: messages.filter(m => m.role !== 'pending') })); } catch { /* Private browsing keeps the transcript in memory only. */ }
}
const notify = () => { for (const listener of listeners) listener(); };

/**
 * The transcript of this tab, for one identity at a time. It holds what was typed and what a model drafted, so it never
 * outlives the account it belongs to: until the identity is known nothing stored is shown, and when it changes the
 * previous identity's transcript is discarded from memory and storage alike. It is a convenience only; clearing it
 * loses no project work.
 */
export const transcript = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => messages,
  serverSnapshot: () => EMPTY,
  /** `id` is the signed-in user's ID, or "guest". What was typed while it was still unknown stays with it. */
  bind(id: string) {
    if (owner === id) return;
    const restored = stored(id);
    messages = owner === null ? [...restored, ...messages].slice(-LIMIT) : restored;
    owner = id;
    try { window.sessionStorage.removeItem(LEGACY_KEY); } catch { /* Nothing to remove without storage. */ }
    persist();
    notify();
  },
  update(change: (current: Message[]) => Message[]) {
    messages = change(messages).slice(-LIMIT);
    persist();
    notify();
  },
};

/** A fresh identity and timestamp for a new transcript entry. */
export const stamp = () => ({ id: crypto.randomUUID(), at: Date.now() });
