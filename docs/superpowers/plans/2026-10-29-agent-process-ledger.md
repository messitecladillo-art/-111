# Agent Process Ledger (P3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every step of an agent conversation visible and recoverable on this device: user message, model request/receipt, tool call/result, agent reply, and a turn checkpoint.

**Architecture:** An identity-scoped append-only local journal sits beside the existing thread store. AgentShell writes the event before a model/tool call; the thread and journal are local, synchronous, and survive a reload. A process drawer reads the journal and shows a timeline. Cloud sync, IndexedDB and cross-device recovery are P3b.

**Tech Stack:** React/Next.js, existing thread store, localStorage/sessionStorage, shared TypeScript types, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-29-agent-memory-system-design.md` (P3); P1 is `docs/superpowers/specs/2026-10-29-agent-memory-design.md`.

## Global Constraints

- P3a is local-first: no backend tables, no cloud sync, no new network calls.
- An event must be written **before** its model/tool call; if the journal cannot persist, the model call is not made.
- No silent truncation: if storage is full, fail visibly and keep the unsent text in the thread; do not drop events.
- Events are append-only; never edit/delete an event. Deleting a thread deletes its process with it.
- Journal is identity-scoped: account localStorage, guest sessionStorage; never mix identities.
- Payloads are summaries and refs, not raw data rows, questionnaires or report bodies.
- The process view is read-only; no replay of models or tools in P3a.
- This plan does not include P3b cloud sync, ContextManifest storage on a server, or personal memory.

---

## File Map

| File | Responsibility |
|---|---|
| `apps/frontend/lib/agent/process.ts` | Event/checkpoint types, validation, labels, pure grouping |
| `apps/frontend/components/agent/process-journal.ts` | Identity-scoped append-only local journal |
| `apps/frontend/components/agent/ProcessTimeline.tsx` | Process drawer UI |
| `apps/frontend/components/agent/AgentShell.tsx` | Write events around sends, model calls, tools, replies, checkpoints |
| `apps/frontend/components/agent/AgentShell.module.css` | Drawer styles |
| `apps/frontend/tests/agent-process.test.mjs` | Pure process model tests |
| `apps/frontend/tests/agent-process-journal.test.mjs` | Journal persistence/merge tests |
| `docs/agent-shell.md` | Process view docs |

---

## Task 1: Process event model

**Files:**
- Create: `apps/frontend/lib/agent/process.ts`
- Test: `apps/frontend/tests/agent-process.test.mjs`

**Interfaces:**
- Produces: `ProcessEventKind`, `ProcessEvent`, `ProcessCheckpoint`, `makeProcessEvent(input)`, `makeProcessCheckpoint(input)`, `eventLabel(kind)`, `eventTime(at)`.
- Limits: summary 400 chars; detail 24 keys; each detail value 600 chars; refs 24.

- [ ] **Step 1: Write failing tests**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeProcessEvent, makeProcessCheckpoint, eventLabel } from '../lib/agent/process.ts';

test('an event keeps its summary, correlation and refs', () => {
  const event = makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'model.request', summary: '请求「服务甲」回答', correlationId: 'c1', refs: ['project:p1'] });
  assert.equal(event.kind, 'model.request');
  assert.equal(event.correlationId, 'c1');
  assert.deepEqual(event.refs, ['project:p1']);
});

test('events reject unknown kinds, blank summaries and oversized detail', () => {
  assert.throws(() => makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'unknown', summary: 'x' }));
  assert.throws(() => makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'user.message', summary: '  ' }));
  const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, 'x']));
  assert.throws(() => makeProcessEvent({ id: 'e1', threadId: 't1', at: 1, kind: 'model.request', summary: 'x', detail: many }));
});

test('a checkpoint points at the last event and the project memory revision', () => {
  const checkpoint = makeProcessCheckpoint({ id: 'c1', threadId: 't1', at: 2, eventId: 'e1', messageId: 'm1', projectId: 'p1', memoryRevision: 3 });
  assert.equal(checkpoint.eventId, 'e1');
  assert.equal(checkpoint.memoryRevision, 3);
  assert.equal(eventLabel('model.receipt'), '模型回执');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-process.test.mjs`

Expected: FAIL with `Cannot find module '../lib/agent/process.ts'`.

- [ ] **Step 3: Implement the model**

```ts
export const PROCESS_EVENT_KINDS = ['user.message', 'agent.message', 'model.request', 'model.receipt', 'tool.request', 'tool.result', 'memory.read', 'checkpoint', 'error'] as const;
export type ProcessEventKind = typeof PROCESS_EVENT_KINDS[number];
export type ProcessEvent = { id: string; threadId: string; at: number; kind: ProcessEventKind; summary: string; correlationId?: string; refs?: string[]; detail?: Record<string, string | number | boolean | null> };
export type ProcessCheckpoint = { id: string; threadId: string; at: number; eventId: string; messageId?: string; projectId?: string | null; memoryRevision?: number };
export const PROCESS_LIMITS = { summary: 400, detailKeys: 24, detailValue: 600, refs: 24 } as const;
const fail = (): never => { throw new Error('invalid process event'); };
const clip = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const text = (value: unknown, limit: number): string => typeof value === 'string' && value.trim() ? clip(value.trim(), limit) : fail();
const detail = (value: unknown): Record<string, string | number | boolean | null> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > PROCESS_LIMITS.detailKeys) fail();
  return Object.fromEntries(entries.map(([key, item]) => {
    if (typeof item === 'string') return [key, clip(item, PROCESS_LIMITS.detailValue)];
    if (typeof item === 'number' && Number.isFinite(item)) return [key, item];
    if (typeof item === 'boolean' || item === null) return [key, item];
    return fail();
  }));
};
export function makeProcessEvent(input: ProcessEvent): ProcessEvent {
  if (!(PROCESS_EVENT_KINDS as readonly string[]).includes(input.kind)) fail();
  if (!input.id || !input.threadId || !Number.isFinite(input.at)) fail();
  const refs = input.refs ? [...new Set(input.refs.filter(item => typeof item === 'string' && item.trim()).map(item => clip(item, 120)))].slice(0, PROCESS_LIMITS.refs) : undefined;
  return { ...input, summary: text(input.summary, PROCESS_LIMITS.summary), ...(input.correlationId ? { correlationId: clip(input.correlationId, 80) } : {}), ...(refs?.length ? { refs } : {}), ...(input.detail ? { detail: detail(input.detail) } : {}) };
}
export function makeProcessCheckpoint(input: ProcessCheckpoint): ProcessCheckpoint {
  if (!input.id || !input.threadId || !input.eventId || !Number.isFinite(input.at)) fail();
  return { ...input, ...(input.projectId === undefined ? {} : { projectId: input.projectId }), ...(input.memoryRevision === undefined ? {} : { memoryRevision: input.memoryRevision }) };
}
const LABELS: Record<ProcessEventKind, string> = { 'user.message': '你', 'agent.message': '证见', 'model.request': '模型请求', 'model.receipt': '模型回执', 'tool.request': '工具请求', 'tool.result': '工具结果', 'memory.read': '读取项目记忆', checkpoint: '检查点', error: '错误' };
export const eventLabel = (kind: ProcessEventKind): string => LABELS[kind];
export const eventTime = (at: number): string => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
```

- [ ] **Step 4: Run tests**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-process.test.mjs`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/lib/agent/process.ts apps/frontend/tests/agent-process.test.mjs
git commit -m "feat: add agent process event model"
```

---

## Task 2: Identity-scoped local journal

**Files:**
- Create: `apps/frontend/components/agent/process-journal.ts`
- Test: `apps/frontend/tests/agent-process-journal.test.mjs`

**Interfaces:**
- Produces: `processJournal.bind(id)`, `view(id)`, `append(threadId, event)`, `events(threadId)`, `checkpoint(threadId)`, `saveCheckpoint(threadId, checkpoint)`, `remove(threadId)`, `retain(ids)`, `subscribe`, `serverSnapshot`.
- `append` returns `boolean`; false means storage failed and the caller must not call the model.

- [ ] **Step 1: Write failing tests**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const fake = () => { const map = new Map(); return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
const local = fake(), session = fake(), handlers = [];
globalThis.window = { localStorage: local, sessionStorage: session, addEventListener: (type, fn) => { if (type === 'storage') handlers.push(fn); } };
const { processJournal } = await import('../components/agent/process-journal.ts');
const event = (id, threadId = 't1') => ({ id, threadId, at: Number(id.slice(1)) || 1, kind: 'user.message', summary: `第 ${id} 步` });

test('events append in order and survive a reload', async () => {
  processJournal.bind('ann');
  assert.equal(processJournal.append('t1', event('e1')), true);
  assert.equal(processJournal.append('t1', event('e2')), true);
  processJournal.saveCheckpoint('t1', { id: 'c1', threadId: 't1', at: 2, eventId: 'e2', projectId: 'p1' });
  const fresh = await import('../components/agent/process-journal.ts?reload');
  fresh.processJournal.bind('ann');
  assert.deepEqual(fresh.processJournal.events('t1').map(item => item.id), ['e1', 'e2']);
  assert.equal(fresh.processJournal.checkpoint('t1').eventId, 'e2');
});

test('another identity cannot read this journal, and deletion leaves a tombstone', async () => {
  processJournal.bind('bob');
  assert.deepEqual(processJournal.events('t1'), []);
  processJournal.bind('ann');
  processJournal.remove('t1');
  assert.deepEqual(processJournal.events('t1'), []);
  assert.equal(processJournal.append('t1', event('e3')), false);
});

test('storage failure is reported instead of silently dropping the event', async () => {
  processJournal.bind('cass');
  const original = session.setItem;
  session.setItem = () => { throw new Error('QuotaExceededError'); };
  const ok = processJournal.append('new-thread', { ...event('e9', 'new-thread') });
  session.setItem = original;
  assert.equal(ok, false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-process-journal.test.mjs`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the journal**

```ts
'use client';
import type { ProcessCheckpoint, ProcessEvent } from '@/lib/agent/process';
import { makeProcessEvent } from '@/lib/agent/process';

type Entry = { events: ProcessEvent[]; checkpoint?: ProcessCheckpoint };
type Book = { threads: Record<string, Entry>; gone: Record<string, number> };
const PREFIX = 'evix.agent.process.v1:', EMPTY: Book = { threads: {}, gone: {} };
let owner: string | null = null, book: Book = EMPTY;
const listeners = new Set<() => void>();
const storage = (id: string) => { try { return id === 'guest' ? window.sessionStorage : window.localStorage; } catch { return null; } };
const clone = (value: Book): Book => ({ threads: Object.fromEntries(Object.entries(value.threads).map(([key, entry]) => [key, { events: [...entry.events], ...(entry.checkpoint ? { checkpoint: entry.checkpoint } : {}) }])), gone: { ...value.gone } });
const parse = (raw: string | null): Book => { try { const value = JSON.parse(raw ?? 'null') as Book | null; if (!value || !value.threads || typeof value.threads !== 'object') return EMPTY; return clone(value); } catch { return EMPTY; } };
const read = (id: string) => { try { return parse(storage(id)?.getItem(PREFIX + id) ?? null); } catch { return EMPTY; } };
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
    next.threads[threadId] = { events: [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)), ...(entry.checkpoint && (!current.checkpoint || entry.checkpoint.at > current.checkpoint.at) ? { checkpoint: entry.checkpoint } : current.checkpoint ? { checkpoint: current.checkpoint } : {}) };
  }
  return next;
};
const persist = (next: Book) => { if (owner === null) return false; try { storage(owner)?.setItem(PREFIX + owner, JSON.stringify(next)); return true; } catch { return false; } };
const notify = () => { for (const listener of listeners) listener(); };
const adopt = (event: StorageEvent) => { if (!owner || owner === 'guest' || event.key !== PREFIX + owner) return; book = merge(book, read(owner)); notify(); };
let listening = false;
const listen = () => { if (listening || typeof window === 'undefined') return; window.addEventListener('storage', adopt); listening = true; };

export const processJournal = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  view: (id: string | null): Book => id === owner ? book : EMPTY,
  serverSnapshot: () => EMPTY,
  bind(id: string) {
    listen();
    if (owner === id) return;
    const carried = owner === null || owner === 'guest' && id !== 'guest' ? book : EMPTY;
    const guest = id === 'guest' ? EMPTY : read('guest');
    owner = id;
    book = merge(read(id), merge(guest, carried));
    if (id !== 'guest') { try { window.sessionStorage.removeItem(PREFIX + 'guest'); } catch { /* no storage */ } }
    notify();
  },
  append(threadId: string, value: ProcessEvent): boolean {
    if (owner === null || book.gone[threadId]) return false;
    let event: ProcessEvent;
    try { event = makeProcessEvent(value); } catch { return false; }
    const entry = book.threads[threadId] ?? { events: [] };
    if (entry.events.some(item => item.id === event.id)) return true;
    const next = clone(book);
    next.threads[threadId] = { ...entry, events: [...entry.events, event].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)) };
    if (!persist(next)) return false;
    book = next; notify(); return true;
  },
  events(threadId: string): readonly ProcessEvent[] { return book.threads[threadId]?.events ?? []; },
  checkpoint(threadId: string): ProcessCheckpoint | undefined { return book.threads[threadId]?.checkpoint; },
  saveCheckpoint(threadId: string, checkpoint: ProcessCheckpoint): boolean {
    if (owner === null || book.gone[threadId]) return false;
    const entry = book.threads[threadId] ?? { events: [] };
    const next = clone(book);
    next.threads[threadId] = { ...entry, checkpoint: { ...checkpoint, threadId } };
    if (!persist(next)) return false;
    book = next; notify(); return true;
  },
  remove(threadId: string): boolean {
    if (owner === null) return false;
    const next = clone(book);
    delete next.threads[threadId];
    next.gone[threadId] = Date.now();
    if (!persist(next)) return false;
    book = next; notify(); return true;
  },
  retain(threadIds: ReadonlySet<string>) {
    const next = clone(book);
    for (const threadId of Object.keys(next.threads)) if (!threadIds.has(threadId)) { delete next.threads[threadId]; next.gone[threadId] = Date.now(); }
    if (JSON.stringify(next) === JSON.stringify(book)) return;
    if (persist(next)) { book = next; notify(); }
  },
};
```

- [ ] **Step 4: Run tests**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-process-journal.test.mjs`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/agent/process-journal.ts apps/frontend/tests/agent-process-journal.test.mjs
git commit -m "feat: persist agent process journal locally"
```

---

## Task 3: Write events from AgentShell

**Files:**
- Modify: `apps/frontend/components/agent/AgentShell.tsx`
- Test: manual browser (local command mode); no new pure test.

**Interfaces:**
- Consumes: `processJournal`, `makeProcessEvent`, `makeProcessCheckpoint`.
- Produces: events for user/agent messages, model request/receipt, tool request/result, checkpoints; process drawer state.

- [ ] **Step 1: Bind and subscribe**

Add imports:
```ts
import { makeProcessCheckpoint, makeProcessEvent } from '@/lib/agent/process';
import { processJournal } from './process-journal';
```
In the owner effect add:
```ts
processJournal.bind(owner);
processJournal.retain(new Set(threads.view(owner).threads.map(t => t.id)));
```
After the thread/drafts hooks:
```ts
const processBook = useSyncExternalStore(processJournal.subscribe, () => processJournal.view(owner), processJournal.serverSnapshot);
```
- Add `showProcess` state.

- [ ] **Step 2: Record local and model events**

Add helpers in the component (outside the `agent` memo):
```ts
const record = (threadId: string | undefined, kind: ProcessEventKind, summary: string, extra: Partial<ProcessEvent> = {}) => {
  if (!threadId) return false;
  return processJournal.append(threadId, makeProcessEvent({ id: crypto.randomUUID(), threadId, at: Date.now(), kind, summary, ...extra }));
};
const checkpoint = (threadId: string | undefined, messageId?: string) => {
  if (!threadId) return;
  const events = processJournal.events(threadId), last = events.at(-1);
  if (!last) return;
  processJournal.saveCheckpoint(threadId, makeProcessCheckpoint({ id: crypto.randomUUID(), threadId, at: Date.now(), eventId: last.id, messageId, projectId: latest.current.projectId, memoryRevision: latest.current.memory?.revision }));
};
```
In `local`: after `threads.append`, get `const threadId = threads.view(latest.current.owner).active ?? undefined;` then `record(threadId, 'user.message', text)` and `record(threadId, 'agent.message', turnText(routed.turn, 120))`; `checkpoint(threadId)`.
In `ask`: after appending user consent message, `record(threadId,'user.message',text)` (get active).
In `turn`: after appending `waiting`, `const threadId = threads.threadOf(waiting.id)?.id;` and:
```ts
const persisted = record(threadId, 'model.request', `请求「${chatService.label}」回答`, {
  correlationId: request.idempotencyKey, refs: [projectId ? `project:${projectId}` : 'project:none', `memory:${memory?.revision ?? 0}`],
  detail: { service: chatService.id, step: request.step ?? 1, history: request.history.length, projectId: projectId ?? null, memoryRevision: memory?.revision ?? 0 },
});
if (!persisted) { mark(waiting.id, 'failed'); replace(waiting.id, { lines: [[span('过程没有保存，未调用模型。', 'error')]] }); return; }
```
- In `settle`: `const threadId = threads.threadOf(messageId)?.id; record(threadId,'model.receipt', ...); checkpoint(threadId,messageId);`
- In `fail`/`check`: similar.
- In `run`: `record(threadId,'tool.request', action.tool)` before toolTurn; after result `record(threadId,'tool.result', ...)`.
- In `/清空`/Sidebar remove: `processJournal.remove(active)`.
- Use `threads.threadOf` after append; for local new thread, `threads.view(owner).active`.
- In `askDraft`/draft not included in P3a.

- [ ] **Step 3: Add process button**

In the top header next to export:
```tsx
{thread && <button type="button" className={styles.processButton} onClick={() => setShowProcess(true)}>过程</button>}
```
Render before the scroll:
```tsx
{showProcess && <ProcessTimeline events={thread ? processBook.threads[thread.id]?.events ?? [] : []} checkpoint={thread ? processBook.threads[thread.id]?.checkpoint : undefined} onClose={() => setShowProcess(false)} />}
```
Import `ProcessTimeline`.

- [ ] **Step 4: Browser check**

Send `/帮助` in a new conversation, open “过程”, verify user/agent/checkpoint rows; reload and verify they remain. In model mode (backend unavailable) the request failure card should not appear because no call is made; process remains.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/agent/AgentShell.tsx
git commit -m "feat: record agent process steps and checkpoints"
```

---

## Task 4: Process timeline drawer

**Files:**
- Create: `apps/frontend/components/agent/ProcessTimeline.tsx`
- Modify: `apps/frontend/components/agent/AgentShell.module.css`
- Test: browser smoke (Task 3) plus typecheck/lint.

**Interfaces:**
- `ProcessTimeline({ events, checkpoint, onClose })`.

- [ ] **Step 1: Implement the component**

```tsx
'use client';
import type { ProcessCheckpoint, ProcessEvent } from '@/lib/agent/process';
import { eventLabel, eventTime } from '@/lib/agent/process';
import { Icon } from './icons';
import styles from './AgentShell.module.css';

export default function ProcessTimeline({ events, checkpoint, onClose }: { events: readonly ProcessEvent[]; checkpoint?: ProcessCheckpoint; onClose: () => void }) {
  return <aside className={styles.processDrawer} role="dialog" aria-modal="true" aria-label="对话过程">
    <header className={styles.processHead}><div><b>对话过程</b><small>{events.length} 个步骤 · 只读</small></div><button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭过程"><Icon name="close" /></button></header>
    <div className={styles.processList}>
      {!events.length && <p className={styles.note}>这段对话还没有过程记录。</p>}
      {events.map(event => <article className={styles.processItem} key={event.id} data-kind={event.kind}>
        <span className={styles.processDot} aria-hidden="true" />
        <div><div className={styles.processTitle}><b>{eventLabel(event.kind)}</b><time>{eventTime(event.at)}</time></div><p>{event.summary}</p>
          {event.correlationId && <small>关联 {event.correlationId.slice(0, 8)}</small>}
          {event.refs?.length ? <small>{event.refs.join(' · ')}</small> : null}
          {event.detail && <details><summary>查看上下文与来源</summary><pre>{JSON.stringify(event.detail, null, 2)}</pre></details>}
        </div>
      </article>)}
      {checkpoint && <p className={styles.processCheckpoint}>检查点 · {new Date(checkpoint.at).toLocaleString('zh-CN')}{checkpoint.projectId ? ' · 已归入项目' : ''}{checkpoint.memoryRevision ? ` · 项目记忆第 ${checkpoint.memoryRevision} 版` : ''}</p>}
    </div>
  </aside>;
}
```

- [ ] **Step 2: Add drawer styles**

```css
.processButton { min-height: 30px; padding: 0 9px; border: 1px solid var(--c-line); border-radius: 8px; background: var(--c-raise); color: var(--c-dim); font-size: 12px; cursor: pointer; }
.processButton:hover { color: var(--c-fg); border-color: var(--c-line-strong); }
.processDrawer { position: absolute; z-index: 30; top: 52px; right: 0; bottom: 0; width: min(430px, 100%); overflow-y: auto; border-left: 1px solid var(--c-line); background: var(--c-raise); box-shadow: var(--c-shadow); }
.processHead { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--c-line); position: sticky; top: 0; background: var(--c-raise); }
.processHead > div { flex: 1; display: grid; gap: 2px; }
.processHead b { font-size: 14px; }
.processHead small { color: var(--c-dim); font-size: 11.5px; }
.processList { display: grid; gap: 2px; padding: 12px 14px 24px; }
.processItem { display: grid; grid-template-columns: 10px minmax(0, 1fr); gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--c-line); }
.processDot { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--c-dim); }
.processItem[data-kind="user.message"] .processDot { background: var(--c-accent); }
.processItem[data-kind="model.request"] .processDot, .processItem[data-kind="model.receipt"] .processDot { background: var(--c-cyan); }
.processItem[data-kind="error"] .processDot { background: var(--c-err); }
.processTitle { display: flex; align-items: baseline; gap: 8px; }
.processTitle b { font-size: 12.5px; }
.processTitle time { color: var(--c-faint); font-size: 11px; }
.processItem p { margin: 2px 0; color: var(--c-fg); font-size: 12.5px; line-height: 1.55; overflow-wrap: anywhere; }
.processItem small { display: block; color: var(--c-faint); font-size: 11px; overflow-wrap: anywhere; }
.processItem details { margin-top: 4px; color: var(--c-dim); font-size: 11.5px; }
.processItem pre { overflow: auto; max-height: 180px; padding: 6px; border-radius: 6px; background: var(--c-bubble); font-size: 10.5px; }
.processCheckpoint { margin: 12px 0 0; padding: 9px 10px; border: 1px dashed var(--c-gold-line); border-radius: 8px; color: var(--c-gold); font-size: 11.5px; }
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/frontend && npm run typecheck && npx eslint components/agent/ProcessTimeline.tsx components/agent/process-journal.ts lib/agent/process.ts components/agent/AgentShell.tsx`

- [ ] **Step 4: Browser smoke**

Send `/帮助`, open “过程”, verify rows; reload, reopen; verify persistence. Switch to another conversation and back; verify each thread has its own process.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/agent/ProcessTimeline.tsx apps/frontend/components/agent/AgentShell.module.css
git commit -m "feat: show the agent process timeline"
```

---

## Task 5: Cleanup, identity and docs

**Files:**
- Modify: `apps/frontend/components/agent/AgentShell.tsx` (remove calls)
- Modify: `docs/agent-shell.md`
- Test: journal tests; browser.

- [ ] **Step 1: Remove process on deletion**

In Sidebar `onRemove` and `/清空`, call `processJournal.remove(id)` after `threads.remove(id)`. Do not remove on tab switch.

- [ ] **Step 2: Identity**

Process journal is bound in the owner effect and carries guest events into the account like drafts. Verify sign-in/out does not show another identity's process; add a journal test for `bind` if not covered.

- [ ] **Step 3: Docs**

Add to `docs/agent-shell.md`:

```md
## 过程视图

顶栏“过程”打开当前对话的只读时间线：消息、模型请求/回执、工具请求/结果、项目记忆读取和回合检查点。事件先写本地日志再发请求；刷新后仍在。日志按身份保存，访客只在本标签页；删除对话会一并删除其过程。P3a 只做本机；云端同步、完整 ContextManifest 与跨设备恢复在 P3b。
```

- [ ] **Step 4: Verification**

```bash
cd apps/frontend
node --experimental-strip-types --test tests/agent-process.test.mjs tests/agent-process-journal.test.mjs tests/agent-chat.test.mjs
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/agent/AgentShell.tsx docs/agent-shell.md
git commit -m "docs: describe the agent process view"
```

---

## Self-Review

- Spec coverage (P3a): process events, local journal, checkpoints, process timeline, deletion/identity; cloud sync/ContextManifest server/cross-device are P3b.
- No placeholders: types, functions, tests, CSS and commit steps are concrete.
- Type consistency: `ProcessEvent`, `ProcessCheckpoint`, `processJournal` names match across tasks; `makeProcessEvent`/`makeProcessCheckpoint` used by AgentShell and tests.
- Known limit: the journal is localStorage-based for P3a; P3b replaces it with IndexedDB + cloud events while keeping the same API.
