'use client';

import type { AgentTurn } from '@/lib/agent/router';

/** One entry of a conversation. `at` lets a reply develop once, when it is new, and never on reload. */
export type Message =
  | { id: string; at: number; role: 'user'; text: string }
  | { id: string; at: number; role: 'agent'; turn: AgentTurn; answered?: 'confirmed' | 'cancelled' }
  /** A knowledge lookup waiting for the search index; never stored, since it could not finish after a reload. */
  | { id: string; at: number; role: 'pending'; query: string; explicit: boolean };
/** A conversation, optionally filed under a hosted project. */
export type Thread = { id: string; title: string; projectId: string | null; createdAt: number; updatedAt: number; messages: Message[] };
/** One identity's conversations, the open one (null while a new one is still a draft), and the draft's project. */
export type Book = { threads: Thread[]; active: string | null; draftProject: string | null };

const PREFIX = 'evix.agent.threads.v1:', LEGACY = ['evix.agent.transcript.v1', 'evix.agent.transcript.v2'];
const MESSAGE_LIMIT = 160, THREAD_LIMIT = 60;
const EMPTY: Book = { threads: [], active: null, draftProject: null };
let owner: string | null = null;
let book: Book = EMPTY;
const listeners = new Set<() => void>();

const validMessage = (m: unknown): m is Message => !!m && typeof m === 'object' && typeof (m as Message).id === 'string' && typeof (m as Message).at === 'number'
  && (((m as Message).role === 'user' && typeof (m as { text?: unknown }).text === 'string') || ((m as Message).role === 'agent' && Array.isArray((m as { turn?: { lines?: unknown } }).turn?.lines)));
function validThread(t: unknown): Thread | null {
  const v = t as Partial<Thread> | null;
  if (!v || typeof v.id !== 'string' || typeof v.title !== 'string' || !Array.isArray(v.messages) || typeof v.createdAt !== 'number' || typeof v.updatedAt !== 'number') return null;
  return { id: v.id, title: v.title.slice(0, 80), projectId: typeof v.projectId === 'string' ? v.projectId : null, createdAt: v.createdAt, updatedAt: v.updatedAt, messages: v.messages.filter(validMessage).slice(-MESSAGE_LIMIT) };
}
/** Accounts keep their conversations in this browser; a guest's last only as long as the tab. */
function storage(id: string): Storage | null {
  try { return id === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; }
}
function load(id: string): Book {
  try {
    const value = JSON.parse(storage(id)?.getItem(PREFIX + id) ?? 'null') as { threads?: unknown; active?: unknown } | null;
    const threads = Array.isArray(value?.threads) ? value.threads.map(validThread).filter((t): t is Thread => !!t) : [];
    const active = typeof value?.active === 'string' && threads.some(t => t.id === value.active) ? value.active : null;
    return { threads, active, draftProject: null };
  } catch { return EMPTY; }
}
function persist() {
  if (owner === null) return;
  const threads = book.threads.map(t => ({ ...t, messages: t.messages.filter(m => m.role !== 'pending') }));
  try { storage(owner)?.setItem(PREFIX + owner, JSON.stringify({ threads, active: book.active })); } catch { /* Without storage the conversations stay in memory only. */ }
}
function notify() { for (const listener of listeners) listener(); }
function commit(next: Book) { book = next; persist(); notify(); }
/**
 * Another tab of the same account saved its conversations. This tab takes them, so its next save does not drop what
 * the other one added. It keeps its own open conversation, draft and unfinished lookups, and does not save back, so
 * two tabs never echo each other.
 */
function adopt(event: StorageEvent) {
  if (owner === null || owner === 'guest' || event.key !== PREFIX + owner) return;
  const stored = load(owner), waiting = new Map(book.threads.map(t => [t.id, t.messages.filter(m => m.role === 'pending')]));
  const threads = stored.threads.map(t => { const pending = waiting.get(t.id); return pending?.length ? { ...t, messages: [...t.messages, ...pending] } : t; });
  book = { threads, active: threads.some(t => t.id === book.active) ? book.active : null, draftProject: book.draftProject };
  notify();
}
let listening = false;
const titleOf = (messages: Message[]) => {
  const first = messages.find(m => m.role === 'user');
  return first && first.role === 'user' ? first.text.replace(/\s+/gu, ' ').trim().slice(0, 30) || '新对话' : '新对话';
};
function inThread(messageId: string) { return book.threads.find(t => t.messages.some(m => m.id === messageId)); }
function withThread(thread: Thread, messages: Message[]): Book {
  const next = { ...thread, messages: messages.slice(-MESSAGE_LIMIT), updatedAt: Date.now() };
  return { ...book, threads: book.threads.map(t => t.id === thread.id ? next : t) };
}

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
    const restored = load(id), unbound = owner === null ? book : EMPTY;
    owner = id;
    for (const key of LEGACY) { try { window.sessionStorage.removeItem(key); } catch { /* Nothing to remove without storage. */ } }
    commit({ threads: [...unbound.threads, ...restored.threads].slice(0, THREAD_LIMIT), active: unbound.active ?? restored.active, draftProject: null });
  },
  /** Opens a new, empty conversation; it becomes a thread with its first message. */
  draft(projectId: string | null = null) { commit({ ...book, active: null, draftProject: projectId }); },
  select(id: string) { if (book.threads.some(t => t.id === id)) commit({ ...book, active: id }); },
  remove(id: string) { commit({ ...book, threads: book.threads.filter(t => t.id !== id), active: book.active === id ? null : book.active }); },
  /** Files the open conversation (or the draft) under a project. */
  setProject(projectId: string | null) {
    const active = book.threads.find(t => t.id === book.active);
    commit(active ? { ...book, threads: book.threads.map(t => t.id === active.id ? { ...t, projectId } : t) } : { ...book, draftProject: projectId });
  },
  /** Adds to the open conversation, starting one from a draft with the user's first words as its title. */
  append(messages: Message[]) {
    const active = book.threads.find(t => t.id === book.active);
    if (active) { commit(withThread(active, [...active.messages, ...messages])); return; }
    const now = Date.now();
    const thread: Thread = { id: crypto.randomUUID(), title: titleOf(messages), projectId: book.draftProject, createdAt: now, updatedAt: now, messages: messages.slice(-MESSAGE_LIMIT) };
    commit({ threads: [thread, ...book.threads].slice(0, THREAD_LIMIT), active: thread.id, draftProject: null });
  },
  /** Adds to the conversation holding `messageId`, wherever the user is now. */
  appendAfter(messageId: string, message: Message) {
    const thread = inThread(messageId);
    if (thread) commit(withThread(thread, [...thread.messages, message]));
  },
  patch(messageId: string, change: (message: Message) => Message) {
    const thread = inThread(messageId);
    if (thread) commit(withThread(thread, thread.messages.map(m => m.id === messageId ? change(m) : m)));
  },
  find(messageId: string): Message | undefined { return inThread(messageId)?.messages.find(m => m.id === messageId); },
  /** The project the conversation holding `messageId` is filed under. */
  projectOf(messageId: string): string | null { return inThread(messageId)?.projectId ?? null; },
  /** Files the conversation holding `messageId` under a project the user just chose for it, unless it already has one. */
  file(messageId: string, projectId: string) {
    const thread = inThread(messageId);
    if (thread && !thread.projectId) commit({ ...book, threads: book.threads.map(t => t.id === thread.id ? { ...t, projectId } : t) });
  },
};

/** A fresh identity and timestamp for a new conversation entry. */
export const stamp = () => ({ id: crypto.randomUUID(), at: Date.now() });
