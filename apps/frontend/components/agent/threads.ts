'use client';

import type { AgentTurn } from '@/lib/agent/router';

/**
 * One entry of a conversation. `at` lets a reply develop once, when it is new, and never on reload; `rev` dates its last
 * change, so the later of two copies wins when two tabs are merged.
 */
export type Message = (
  | { id: string; at: number; role: 'user'; text: string }
  /**
   * `model`: a model call through this service, at this step of its sentence, recorded when it is sent and kept as it
   * settles (refused means the service turned it away before any model ran). Without it the answer was given by rule.
   */
  | { id: string; at: number; role: 'agent'; turn: AgentTurn; answered?: 'confirmed' | 'cancelled'; model?: ModelCall }
  /** A knowledge lookup waiting for the search index; never stored, since it could not finish after a reload. */
  | { id: string; at: number; role: 'pending'; query: string; explicit: boolean }
) & { rev?: number };
export type ModelCall = { service: string; step: number; status?: 'running' | 'ready' | 'failed' | 'unknown' | 'refused' };
/**
 * A conversation, optionally filed under a hosted project; `filedAt` dates the filing for the same reason. `titledAt`
 * dates a name the user gave it; without one the title is its first words.
 */
export type Thread = { id: string; title: string; titledAt?: number; projectId: string | null; filedAt?: number; createdAt: number; updatedAt: number; messages: Message[] };
/** One identity's conversations, the open one (null while a new one is still a draft), and the draft's project. */
export type Book = { threads: Thread[]; active: string | null; draftProject: string | null };
/** What one identity keeps in storage: its conversations, the last open one, and those deleted, so none comes back. */
type Stored = { threads: Thread[]; active: string | null; removed: string[] };

/** Earlier versions kept one transcript per tab: v2 recorded its owner and is carried over; v1 did not and is dropped. */
const PREFIX = 'evix.agent.threads.v1:', TRANSCRIPT = 'evix.agent.transcript.v2', LEGACY = ['evix.agent.transcript.v1', TRANSCRIPT];
const MESSAGE_LIMIT = 160, THREAD_LIMIT = 60, REMOVED_LIMIT = 200;
const EMPTY: Book = { threads: [], active: null, draftProject: null };
let owner: string | null = null;
let book: Book = EMPTY;
let removed: string[] = [];
const listeners = new Set<() => void>();

const validMessage = (m: unknown): m is Message => !!m && typeof m === 'object' && typeof (m as Message).id === 'string' && typeof (m as Message).at === 'number'
  && (((m as Message).role === 'user' && typeof (m as { text?: unknown }).text === 'string') || ((m as Message).role === 'agent' && Array.isArray((m as { turn?: { lines?: unknown } }).turn?.lines)));
function validThread(t: unknown): Thread | null {
  const v = t as Partial<Thread> | null;
  if (!v || typeof v.id !== 'string' || typeof v.title !== 'string' || !Array.isArray(v.messages) || typeof v.createdAt !== 'number' || typeof v.updatedAt !== 'number') return null;
  return { id: v.id, title: v.title.slice(0, 80), ...(typeof v.titledAt === 'number' ? { titledAt: v.titledAt } : {}), projectId: typeof v.projectId === 'string' ? v.projectId : null, ...(typeof v.filedAt === 'number' ? { filedAt: v.filedAt } : {}),
    createdAt: v.createdAt, updatedAt: v.updatedAt, messages: v.messages.filter(validMessage).slice(-MESSAGE_LIMIT) };
}
/** Accounts keep their conversations in this browser; a guest's last only as long as the tab. */
function storage(id: string): Storage | null {
  try { return id === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; }
}
function read(id: string): Stored {
  try {
    const value = JSON.parse(storage(id)?.getItem(PREFIX + id) ?? 'null') as { threads?: unknown; active?: unknown; removed?: unknown } | null;
    const threads = Array.isArray(value?.threads) ? value.threads.map(validThread).filter((t): t is Thread => !!t) : [];
    const active = typeof value?.active === 'string' && threads.some(t => t.id === value.active) ? value.active : null;
    const gone = Array.isArray(value?.removed) ? value.removed.filter((r): r is string => typeof r === 'string') : [];
    return { threads, active, removed: gone };
  } catch { return { threads: [], active: null, removed: [] }; }
}
const kept = (thread: Thread) => ({ ...thread, messages: thread.messages.filter(m => m.role !== 'pending') });
function persist() {
  if (owner === null) return;
  try { storage(owner)?.setItem(PREFIX + owner, JSON.stringify({ threads: book.threads.map(kept), active: book.active, removed })); } catch { /* Without storage the conversations stay in memory only. */ }
}
function notify() { for (const listener of listeners) listener(); }

const version = (m: Message) => m.rev ?? m.at;
/**
 * Two copies of one conversation as one: every message either holds, each in its later version. The order is this
 * copy's; a message only the other holds goes after the one it followed there, among this copy's own newer messages
 * by time.
 */
function mergeThread(mine: Thread, theirs: Thread): Thread {
  const messages = [...mine.messages], shared = new Set(theirs.messages.map(m => m.id));
  const place = (id: string) => messages.findIndex(m => m.id === id);
  let after = -1;
  for (const m of theirs.messages) {
    const at = place(m.id);
    if (at >= 0) { if (version(m) > version(messages[at])) messages[at] = m; after = at; continue; }
    let slot = after + 1;
    while (slot < messages.length && !shared.has(messages[slot].id) && messages[slot].at <= m.at) slot++;
    messages.splice(slot, 0, m);
    after = slot;
  }
  const filed = (theirs.filedAt ?? 0) > (mine.filedAt ?? 0) ? theirs : mine, titled = (theirs.titledAt ?? 0) > (mine.titledAt ?? 0) ? theirs : mine;
  return { ...mine, title: titled.title, ...(titled.titledAt !== undefined ? { titledAt: titled.titledAt } : {}), projectId: filed.projectId, ...(filed.filedAt !== undefined ? { filedAt: filed.filedAt } : {}), createdAt: Math.min(mine.createdAt, theirs.createdAt),
    updatedAt: Math.max(mine.updatedAt, theirs.updatedAt), messages: messages.slice(-MESSAGE_LIMIT) };
}
/** This tab's conversations with the stored ones: nothing either side holds is lost, and nothing either deleted returns. */
function reconcile(mine: Book, stored: Stored): { book: Book; removed: string[] } {
  const gone = new Set([...stored.removed, ...removed]), theirs = new Map(stored.threads.map(t => [t.id, t])), own = new Set(mine.threads.map(t => t.id));
  const threads = [
    ...mine.threads.filter(t => !gone.has(t.id)).map(t => { const other = theirs.get(t.id); return other ? mergeThread(t, other) : t; }),
    ...stored.threads.filter(t => !own.has(t.id) && !gone.has(t.id)),
  ].sort((a, b) => b.createdAt - a.createdAt).slice(0, THREAD_LIMIT);
  return { book: { threads, active: threads.some(t => t.id === mine.active) ? mine.active : null, draftProject: mine.draftProject }, removed: [...gone].slice(-REMOVED_LIMIT) };
}
/** Whether this tab holds anything the stored copy lacks: a conversation, a later message, filing or name, or a deletion. */
function holdsMore(stored: Stored): boolean {
  if (removed.some(id => !stored.removed.includes(id))) return true;
  const theirs = new Map(stored.threads.map(t => [t.id, t]));
  return book.threads.some(t => {
    const other = theirs.get(t.id);
    if (!other) return true;
    if ((t.filedAt ?? 0) > (other.filedAt ?? 0) || (t.titledAt ?? 0) > (other.titledAt ?? 0)) return true;
    const versions = new Map(other.messages.map(m => [m.id, version(m)]));
    return kept(t).messages.some(m => !versions.has(m.id) || version(m) > versions.get(m.id)!);
  });
}
/** Every change is merged with what is stored before it is saved, so a tab that has not yet heard of another's save does not drop it. */
function commit(next: Book) {
  if (owner === null) book = next;
  else ({ book, removed } = reconcile(next, read(owner)));
  persist();
  notify();
}
/**
 * Another tab of the same account saved its conversations. This tab merges them in, keeping its own open conversation,
 * draft and unfinished lookups, and saves back only when it holds something that save lacked, so two tabs settle
 * instead of echoing each other.
 */
function adopt(event: StorageEvent) {
  if (owner === null || owner === 'guest' || event.key !== PREFIX + owner) return;
  const stored = read(owner);
  ({ book, removed } = reconcile(book, stored));
  if (holdsMore(stored)) persist();
  notify();
}
let listening = false;
const titleOf = (messages: Message[]) => {
  const first = messages.find(m => m.role === 'user');
  return first && first.role === 'user' ? first.text.replace(/\s+/gu, ' ').trim().slice(0, 30) || '新对话' : '新对话';
};
/** This tab's transcript from before conversations were threads, if it belongs to `id`. */
function carriedOver(id: string): Thread | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(TRANSCRIPT) ?? 'null') as { owner?: unknown; messages?: unknown } | null;
    const messages = value?.owner === id && Array.isArray(value.messages) ? value.messages.filter(validMessage).slice(-MESSAGE_LIMIT) : [];
    if (!messages.length) return null;
    return { id: crypto.randomUUID(), title: titleOf(messages), projectId: null, createdAt: messages[0].at, updatedAt: messages[messages.length - 1].at, messages };
  } catch { return null; }
}
function inThread(messageId: string) { return book.threads.find(t => t.messages.some(m => m.id === messageId)); }
function withThread(thread: Thread, messages: Message[]): Book {
  const next = { ...thread, messages: messages.slice(-MESSAGE_LIMIT), updatedAt: Date.now() };
  return { ...book, threads: book.threads.map(t => t.id === thread.id ? next : t) };
}
const filing = (thread: Thread, projectId: string | null): Thread => ({ ...thread, projectId, filedAt: Date.now() });

/**
 * The conversations of whoever is signed in. They never outlive the identity in view: until it is known nothing stored
 * is shown, `view` gives another identity nothing, and binding a new identity loads only that identity's own
 * conversations. A reply that arrives later goes to the conversation its request came from, whichever one is open.
 */
export const threads = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  /** What identity `id` may see; before any identity is known (`null` on both sides), only what was typed on this page. */
  view: (id: string | null): Book => id === owner ? book : EMPTY,
  serverSnapshot: () => EMPTY,
  /** `id` is the signed-in user's ID, or "guest". Conversations begun while it was unknown stay with it. */
  bind(id: string) {
    if (!listening) { window.addEventListener('storage', adopt); listening = true; }
    if (owner === id) return;
    const restored = read(id), earlier = carriedOver(id);
    // What this page holds goes with the identity it turns out to be: what was typed before any identity was known, and
    // what a visitor said as a guest in this tab when they sign in, read from memory as well as storage, since storage
    // may have failed. It then leaves the tab. An account's conversations never pass to another identity.
    const unbound = owner === null || (owner === 'guest' && id !== 'guest') ? book : EMPTY;
    const visited = id === 'guest' ? null : read('guest');
    owner = id;
    removed = restored.removed;
    // Another identity's transcript is dropped unread, as it always was.
    for (const key of [...LEGACY, ...(visited?.threads.length ? [PREFIX + 'guest'] : [])]) { try { window.sessionStorage.removeItem(key); } catch { /* Nothing to remove without storage. */ } }
    const carried = new Map([...(visited?.threads ?? []), ...(earlier ? [earlier] : []), ...unbound.threads].map(t => [t.id, t]));
    const wanted = [unbound.active, earlier?.id, visited?.active, restored.active];
    commit({ threads: [...carried.values()], active: wanted.find(Boolean) ?? null, draftProject: null });
    // Past the cap the wanted conversation may be gone; the next one still held opens instead.
    const open = wanted.find(t => t && book.threads.some(held => held.id === t)) ?? null;
    if (open !== book.active) commit({ ...book, active: open });
  },
  /** Opens a new, empty conversation; it becomes a thread with its first message. */
  draft(projectId: string | null = null) { commit({ ...book, active: null, draftProject: projectId }); },
  select(id: string) { if (book.threads.some(t => t.id === id)) commit({ ...book, active: id }); },
  remove(id: string) {
    removed = [...removed.filter(r => r !== id), id].slice(-REMOVED_LIMIT);
    commit({ ...book, threads: book.threads.filter(t => t.id !== id), active: book.active === id ? null : book.active });
  },
  /** Names a conversation; when two tabs name it, the later name holds. An empty name changes nothing. */
  rename(id: string, title: string) {
    const name = title.replace(/\s+/gu, ' ').trim().slice(0, 80);
    if (name && book.threads.some(t => t.id === id && t.title !== name)) commit({ ...book, threads: book.threads.map(t => t.id === id ? { ...t, title: name, titledAt: Date.now() } : t) });
  },
  /** Files the open conversation (or the draft) under a project. */
  setProject(projectId: string | null) {
    const active = book.threads.find(t => t.id === book.active);
    commit(active ? { ...book, threads: book.threads.map(t => t.id === active.id ? filing(t, projectId) : t) } : { ...book, draftProject: projectId });
  },
  /** Adds to the open conversation, starting one from a draft with the user's first words as its title. */
  append(messages: Message[]) {
    const active = book.threads.find(t => t.id === book.active);
    if (active) { commit(withThread(active, [...active.messages, ...messages])); return; }
    const now = Date.now();
    const thread: Thread = { id: crypto.randomUUID(), title: titleOf(messages), projectId: book.draftProject, filedAt: now, createdAt: now, updatedAt: now, messages: messages.slice(-MESSAGE_LIMIT) };
    commit({ threads: [thread, ...book.threads], active: thread.id, draftProject: null });
  },
  /** Adds to the conversation holding `messageId`, wherever the user is now. */
  appendAfter(messageId: string, message: Message) {
    const thread = inThread(messageId);
    if (thread) commit(withThread(thread, [...thread.messages, message]));
  },
  patch(messageId: string, change: (message: Message) => Message) {
    const thread = inThread(messageId);
    if (thread) commit(withThread(thread, thread.messages.map(m => m.id === messageId ? { ...change(m), rev: Date.now() } : m)));
  },
  find(messageId: string): Message | undefined { return inThread(messageId)?.messages.find(m => m.id === messageId); },
  /** The conversation holding `messageId`, while it still exists. */
  threadOf(messageId: string): Thread | undefined { return inThread(messageId); },
  /** The project the conversation holding `messageId` is filed under. */
  projectOf(messageId: string): string | null { return inThread(messageId)?.projectId ?? null; },
  /** Files the conversation holding `messageId` under a project the user just chose for it, unless it already has one. */
  file(messageId: string, projectId: string) {
    const thread = inThread(messageId);
    if (thread && !thread.projectId) commit({ ...book, threads: book.threads.map(t => t.id === thread.id ? filing(t, projectId) : t) });
  },
};

/** A fresh identity and timestamp for a new conversation entry. */
export const stamp = () => ({ id: crypto.randomUUID(), at: Date.now() });
