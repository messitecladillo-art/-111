'use client';

import { makeProcessEvent, type ProcessCheckpoint, type ProcessEvent } from '../../lib/agent/process.ts';

type Entry = { events: ProcessEvent[]; checkpoint?: ProcessCheckpoint };
type Book = { threads: Record<string, Entry>; gone: Record<string, number> };
const PREFIX = 'evix.agent.process.v1:', EMPTY: Book = { threads: {}, gone: {} };
let owner: string | null = null, book: Book = EMPTY, listening = false;
const listeners = new Set<() => void>();

const storage = (id: string) => { try { return id === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; } };
const clone = (value: Book): Book => ({
  threads: Object.fromEntries(Object.entries(value.threads).map(([key, entry]) => [key, {
    events: [...entry.events],
    ...(entry.checkpoint ? { checkpoint: entry.checkpoint } : {}),
  }])),
  gone: { ...value.gone },
});
const parse = (raw: string | null): Book => {
  try {
    const value = JSON.parse(raw ?? 'null') as Book | null;
    if (!value || !value.threads || typeof value.threads !== 'object') return EMPTY;
    return clone(value);
  } catch { return EMPTY; }
};
const read = (id: string): Book => { try { return parse(storage(id)?.getItem(PREFIX + id) ?? null); } catch { return EMPTY; } };
const merge = (mine: Book, theirs: Book): Book => {
  const next = clone(mine);
  for (const [key, at] of Object.entries(theirs.gone)) {
    if (at > (next.gone[key] ?? 0)) next.gone[key] = at;
    if (next.threads[key]) delete next.threads[key];
  }
  for (const [threadId, entry] of Object.entries(theirs.threads)) {
    if (next.gone[threadId]) continue;
    const current = next.threads[threadId] ?? { events: [] };
    const byId = new Map(current.events.map(event => [event.id, event]));
    for (const event of entry.events) if (!byId.has(event.id)) byId.set(event.id, event);
    const checkpoint = entry.checkpoint && (!current.checkpoint || entry.checkpoint.at > current.checkpoint.at)
      ? entry.checkpoint
      : current.checkpoint;
    next.threads[threadId] = {
      events: [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
      ...(checkpoint ? { checkpoint } : {}),
    };
  }
  return next;
};
const persist = (next: Book): boolean => {
  if (owner === null) return false;
  try { storage(owner)?.setItem(PREFIX + owner, JSON.stringify(next)); return true; } catch { return false; }
};
const notify = () => { for (const listener of listeners) listener(); };
const adopt = (event: StorageEvent) => {
  if (!owner || owner === 'guest' || event.key !== PREFIX + owner) return;
  const before = JSON.stringify(book), next = merge(book, read(owner));
  book = next;
  if (JSON.stringify(next) !== before) persist(next);
  notify();
};
const listen = () => {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('storage', adopt);
  listening = true;
};

export const processJournal = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  view: (id: string | null): Book => id === owner ? book : EMPTY,
  serverSnapshot: () => EMPTY,
  bind(id: string) {
    listen();
    if (owner === id) return;
    const carried = owner === null || (owner === 'guest' && id !== 'guest') ? book : EMPTY;
    const guest = id === 'guest' ? EMPTY : read('guest');
    owner = id;
    book = merge(read(id), merge(guest, carried));
    if (id !== 'guest') { try { window.sessionStorage.removeItem(PREFIX + 'guest'); } catch { /* no storage */ } }
    persist(book);
    notify();
  },
  append(threadId: string, value: ProcessEvent): boolean {
    if (owner === null || book.gone[threadId]) return false;
    let event: ProcessEvent;
    try { event = makeProcessEvent(value); } catch { return false; }
    const entry = book.threads[threadId] ?? { events: [] };
    if (entry.events.some(item => item.id === event.id)) return true;
    const next = clone(book);
    next.threads[threadId] = {
      ...entry,
      events: [...entry.events, event].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
    };
    if (!persist(next)) return false;
    book = next;
    notify();
    return true;
  },
  events(threadId: string): readonly ProcessEvent[] { return book.threads[threadId]?.events ?? []; },
  checkpoint(threadId: string): ProcessCheckpoint | undefined { return book.threads[threadId]?.checkpoint; },
  saveCheckpoint(threadId: string, checkpoint: ProcessCheckpoint): boolean {
    if (owner === null || book.gone[threadId]) return false;
    const entry = book.threads[threadId] ?? { events: [] };
    const next = clone(book);
    next.threads[threadId] = { ...entry, checkpoint: { ...checkpoint, threadId } };
    if (!persist(next)) return false;
    book = next;
    notify();
    return true;
  },
  remove(threadId: string): boolean {
    if (owner === null) return false;
    const next = clone(book);
    delete next.threads[threadId];
    next.gone[threadId] = Date.now();
    if (!persist(next)) return false;
    book = next;
    notify();
    return true;
  },
  retain(threadIds: ReadonlySet<string>) {
    const next = clone(book);
    let changed = false;
    for (const threadId of Object.keys(next.threads)) {
      if (threadIds.has(threadId)) continue;
      delete next.threads[threadId];
      next.gone[threadId] = Date.now();
      changed = true;
    }
    if (!changed || !persist(next)) return;
    book = next;
    notify();
  },
};
