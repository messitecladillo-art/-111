# Agent Process Cloud Backup (P3b1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner back up one project-bound agent thread (messages, process events, checkpoint) to the project and restore it on another device.

**Architecture:** A new owner-only `agent_thread_snapshots` table stores explicit backups. The process drawer gets a “备份到云端” action; the project memory page lists the current user's backups and restores one into the local thread + process journal. No automatic upload, no team visibility, no raw data beyond the conversation the user explicitly backs up.

**Tech Stack:** FastAPI/SQLAlchemy/Alembic/PostgreSQL, React/Next.js, existing thread/process stores, `hostedRequest`.

**Spec:** `docs/superpowers/specs/2026-10-29-agent-memory-system-design.md` (P3b), P3a plan `docs/superpowers/plans/2026-10-29-agent-process-ledger.md`.

## Global Constraints

- Backup is **explicit and per thread**: only when the user presses “备份到云端”.
- A snapshot is owner-only; project teammates cannot read another member’s thread content.
- Only signed-in users with a project-bound thread can back up.
- The snapshot contains the thread messages, process events and checkpoint; no raw datasets, report bodies or model keys beyond what the thread itself already holds.
- Expected revision + idempotency prevent silent overwrite; conflicts are shown.
- Restore never overwrites an existing local thread; it refuses and tells the user.
- P3b1 does not add automatic sync, append-only cloud events, ContextManifest storage, or replay.

---

## Task 1: Backend snapshot storage and API

**Files:**
- Create: `apps/backend/src/infrastructure/database/models/agent_threads.py`
- Create: `apps/backend/migrations/versions/0011_agent_thread_snapshots.py`
- Modify: `apps/backend/src/infrastructure/database/models/__init__.py`
- Modify: `apps/backend/src/evix_api/runtime.py` (`SCHEMA_REVISION = "0011_agent_thread_snapshots"`)
- Create: `apps/backend/src/application/services/agent_threads.py`
- Create: `apps/backend/src/evix_api/routes/agent_threads.py`
- Modify: `apps/backend/src/evix_api/app.py`
- Test: `apps/backend/tests/test_agent_thread_snapshots_postgres.py`

**Interfaces:**
- `AgentThreadSnapshot`: `id, project_id, owner_id, client_thread_id, revision, title, messages JSON, events JSON, checkpoint JSON, content_hash, created_at, updated_at`
- `GET /api/projects/{project_id}/agent-threads` — list own backups (heads only)
- `GET /api/projects/{project_id}/agent-threads/{thread_id}` — own snapshot
- `PUT /api/projects/{project_id}/agent-threads/{thread_id}` — explicit backup with `expectedRevision`, `idempotencyKey`, `title`, `messages`, `events`, `checkpoint`

**RLS:** select/insert/update/delete only when `owner_id = current_setting('evix.user_id', true)` and the user is a project member. Any project role may back up their own thread; no role can read another owner’s snapshot.

- [ ] Step 1: Write a failing PG test that creates a project, backs up a snapshot, lists it, reads it, and proves another user in the same project gets 404.
- [ ] Step 2: Create the model and migration; update the schema revision.
- [ ] Step 3: Implement service + routes; register in `app.py`; use the existing `Operation` idempotency and `expectedRevision`.
- [ ] Step 4: Run the PG test in CI (local PostgreSQL is not started).
- [ ] Step 5: Commit.

Validation limits: title ≤80; messages ≤160; events ≤2000; checkpoint object or null; canonical payload ≤300,000 bytes; `threadId` UUID; revision conflict 409.

---

## Task 2: Store restore/import methods

**Files:**
- Modify: `apps/frontend/components/agent/threads.ts`
- Modify: `apps/frontend/components/agent/process-journal.ts`
- Test: `apps/frontend/tests/agent-threads.test.mjs`, `agent-process-journal.test.mjs`

**Interfaces:**
- `threads.restore(thread: Thread): boolean` — adds a thread if its id is not already held; sets it active; refuses otherwise.
- `processJournal.import(threadId, events, checkpoint): boolean` — merges missing events by id and keeps the later checkpoint; refuses if the thread is tombstoned or owner is null.

- [ ] Step 1: Add tests for restore (new thread, duplicate refused) and import (events merged, duplicate ids ignored, checkpoint later wins).
- [ ] Step 2: Implement; validate messages with the existing `validMessage`.
- [ ] Step 3: Run the two test files.
- [ ] Step 4: Commit.

---

## Task 3: Explicit backup in the process drawer

**Files:**
- Create: `apps/frontend/components/hosted/cloud-process-client.ts`
- Modify: `apps/frontend/components/agent/ProcessTimeline.tsx`
- Modify: `apps/frontend/components/agent/AgentShell.tsx`
- Test: `apps/frontend/tests/agent-process-cloud.test.mjs` (client parse/request shape; no browser)

**Interfaces:**
- `fetchCloudThread(projectId, threadId)`, `saveCloudThread(projectId, threadId, payload)`.
- `ProcessTimeline` adds optional `onBackup`, `backupLabel`, `backupNote`, `canBackup`.
- AgentShell backup handler: only signed-in + project-bound + thread; reads current cloud revision (404→0), PUTs `{schemaVersion:1,idempotencyKey,expectedRevision,title,messages,events,checkpoint}`; shows “已备份第 N 版” or 409 conflict.

- [ ] Step 1: Client test for URLs, body, revision.
- [ ] Step 2: Implement client + drawer button + AgentShell handler.
- [ ] Step 3: Typecheck/lint and a local command browser smoke (no backend: button disabled with a clear “需要登录并归入项目” note).
- [ ] Step 4: Commit.

---

## Task 4: Restore from the project page

**Files:**
- Create: `apps/frontend/components/hosted/CloudProcessBackups.tsx`
- Modify: `apps/frontend/components/hosted/ProjectMemoryPanel.tsx`
- Modify: `apps/frontend/app/hosted.css`
- Test: browser when backend available; unit for client list shape.

**Interfaces:**
- List own backups; restore calls `fetchCloudThread`, `threads.restore`, `processJournal.import`, then `window.location.assign('/agent')`.
- If the local thread exists, show “本机已有这段对话，未覆盖”。
- No backup list for guests; owner-only API.

- [ ] Step 1: Implement the list/restore section under 项目档案.
- [ ] Step 2: Typecheck/lint; add a static unit test for the list parser.
- [ ] Step 3: When backend is available, back up on one browser and restore in another; otherwise state this acceptance is pending.
- [ ] Step 4: Commit.

---

## Task 5: Docs and verification

- [ ] Update `docs/agent-shell.md` with “显式云端备份、仅本人可见、恢复不覆盖本地”。
- [ ] Run `test:unit`, `typecheck`, `lint`, `build`; CI must pass.
- [ ] Commit.

## Self-Review

- P3b1 covers explicit cloud backup/restore for project-bound threads; automatic sync, append-only cloud events, ContextManifest and replay are P3b2.
- No raw data beyond the explicitly backed-up conversation is sent.
- Types: `agent_thread_snapshots` naming matches the API and client.
