'use client';

/**
 * Unsent text, kept per conversation and per identity. A draft follows the conversation it was typed in when the user
 * switches away, survives a reload, and is never sent with another conversation. `NEW_DRAFT` is the conversation that
 * has not started yet. Two tabs merge by the later draft; clearing is a tombstone, so a sent draft does not come back
 * from the other tab's older copy.
 */
export type Draft = { text: string; at: number };
type Stored = { entries: Record<string, Draft>; gone: Record<string, number> };
export const NEW_DRAFT = 'new';
const PREFIX = 'evix.agent.drafts.v1:', ENTRY_LIMIT = 80, GONE_LIMIT = 240, LENGTH = 20_000;
const EMPTY: Stored = { entries: {}, gone: {} };
let owner: string | null = null, state: Stored = EMPTY, dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null, listening = false;
const listeners = new Set<() => void>();

function storage(id: string): Storage | null {
  try { return id === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; }
}
function prune(next: Stored): Stored {
  return {
    entries: Object.fromEntries(Object.entries(next.entries).sort((a, b) => b[1].at - a[1].at).slice(0, ENTRY_LIMIT)),
    gone: Object.fromEntries(Object.entries(next.gone).sort((a, b) => b[1] - a[1]).slice(0, GONE_LIMIT)),
  };
}
function parse(raw: string | null): Stored {
  try {
    const value = JSON.parse(raw ?? 'null') as { entries?: unknown; gone?: unknown } | null;
    const entries: Record<string, Draft> = {}, gone: Record<string, number> = {};
    if (value?.entries && typeof value.entries === 'object') for (const [key, row] of Object.entries(value.entries)) {
      const draft = row as { text?: unknown; at?: unknown };
      if (typeof draft?.text === 'string' && typeof draft.at === 'number') entries[key] = { text: draft.text.slice(0, LENGTH), at: draft.at };
    }
    if (value?.gone && typeof value.gone === 'object') for (const [key, at] of Object.entries(value.gone)) {
      if (typeof at === 'number') gone[key] = at;
    }
    return prune({ entries, gone });
  } catch { return EMPTY; }
}
function read(id: string): Stored {
  try { return parse(storage(id)?.getItem(PREFIX + id) ?? null); } catch { return EMPTY; }
}
/** A tombstone at `at` hides every entry it is not older than. */
function bury(entries: Record<string, Draft>, gone: Record<string, number>, key: string, at: number) {
  if (at > (gone[key] ?? 0)) gone[key] = at;
  if (entries[key] && entries[key].at <= at) delete entries[key];
}
function merge(mine: Stored, theirs: Stored): Stored {
  const entries = { ...mine.entries }, gone = { ...mine.gone };
  for (const [key, at] of Object.entries(theirs.gone)) bury(entries, gone, key, at);
  for (const [key, draft] of Object.entries(theirs.entries)) {
    if (draft.at <= (gone[key] ?? 0)) continue;
    const held = entries[key];
    if (!held || draft.at > held.at || (draft.at === held.at && draft.text > held.text)) entries[key] = draft;
  }
  return prune({ entries, gone });
}
function same(a: Stored, b: Stored): boolean {
  const keys = Object.keys(a.entries), other = Object.keys(b.entries);
  if (keys.length !== other.length || Object.keys(a.gone).length !== Object.keys(b.gone).length) return false;
  return keys.every(key => a.entries[key]?.at === b.entries[key]?.at && a.entries[key]?.text === b.entries[key]?.text)
    && Object.keys(a.gone).every(key => a.gone[key] === b.gone[key]);
}
function persist() {
  if (owner === null) return;
  try { storage(owner)?.setItem(PREFIX + owner, JSON.stringify(state)); } catch { /* Without storage drafts last for this page. */ }
  dirty = false;
}
function notify() { for (const listener of listeners) listener(); }
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!dirty) return;
  persist();
  notify();
}
// Keystrokes stay in memory at once and reach storage together, so typing does not write to storage or re-render the shell.
function schedule() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; if (!dirty) return; persist(); notify(); }, 250);
}
/** Another tab saved: take whatever is newer, and save back only if this tab holds something that save lacked. */
function adopt(event: StorageEvent) {
  if (!owner || owner === 'guest' || event.key !== PREFIX + owner) return;
  const theirs = read(owner), next = merge(state, theirs);
  state = next;
  notify();
  if (!same(next, theirs)) { dirty = true; schedule(); }
}
function listen() {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('storage', adopt);
  // A page being put away writes the last keystrokes, not only the debounce before them.
  window.addEventListener('pagehide', flush);
  listening = true;
}
/** Keeps what was typed in `key`; empty text clears it as a tombstone. */
function keep(key: string, text: string) {
  const value = text.slice(0, LENGTH);
  const at = Math.max(Date.now(), (state.entries[key]?.at ?? 0) + 1, (state.gone[key] ?? 0) + 1);
  if (!value.trim()) {
    // Nothing was typed here: no tombstone is needed, and another tab's draft stays as it is.
    if (!state.entries[key]) return;
    const entries = { ...state.entries }, gone = { ...state.gone };
    delete entries[key];
    bury(entries, gone, key, at);
    state = prune({ entries, gone });
  } else {
    if (state.entries[key]?.text === value) return;
    const gone = { ...state.gone };
    delete gone[key];
    state = prune({ entries: { ...state.entries, [key]: { text: value, at } }, gone });
  }
  schedule();
}

export const drafts = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  /** What identity `id` may see; another identity reads nothing. */
  view: (id: string | null): Stored => id === owner ? state : EMPTY,
  serverSnapshot: () => EMPTY,
  /** Binds drafts to the identity in view, carrying a guest's drafts into the account as its conversations are carried. */
  bind(id: string) {
    listen();
    if (owner === id) return;
    const carried = owner === null || (owner === 'guest' && id !== 'guest') ? state : EMPTY;
    const guest = id === 'guest' ? EMPTY : read('guest');
    if (owner !== null) flush();
    owner = id;
    state = merge(read(id), merge(guest, carried));
    if (id !== 'guest') { try { window.sessionStorage.removeItem(PREFIX + 'guest'); } catch { /* Nothing to remove without storage. */ } }
    persist();
    notify();
  },
  /** A draft only for the identity in view; the render between two identities shows nothing of the one before. */
  textFor(id: string | null, key: string): string { return id === owner ? state.entries[key]?.text ?? '' : ''; },
  text(key: string): string { return state.entries[key]?.text ?? ''; },
  has(key: string): boolean { return !!state.entries[key]?.text.trim(); },
  /** Keeps what was typed in `key`; empty text clears it as a tombstone. */
  save(key: string, text: string) { keep(key, text); },
  /** The same, only for the identity in view: a frame in which the identity has changed cannot write to the one before. */
  saveFor(id: string | null, key: string, text: string) { if (id === owner) keep(key, text); },
  clear(key: string) { keep(key, ''); },
  /** Drops drafts whose conversation is no longer held; the new, unsent conversation keeps its draft. */
  retain(keys: ReadonlySet<string>) {
    const at = Date.now(), entries = { ...state.entries }, gone = { ...state.gone };
    let changed = false;
    for (const key of Object.keys(entries)) {
      if (key === NEW_DRAFT || keys.has(key)) continue;
      delete entries[key];
      bury(entries, gone, key, at);
      changed = true;
    }
    if (changed) { state = prune({ entries, gone }); schedule(); }
  },
  flush,
};
