# Agent Project Memory Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give 证见 a project-scoped memory document that a user can fill in and that the Agent reads automatically in every later conversation.

**Architecture:** A versioned JSON document (`intent`, `decisions`, `openQuestions`) lives with the hosted project. The browser fetches it for the project page; the backend validates and builds a compact brief for each model turn, so the model never trusts a client-composed memory. This is slice 1 of the approved spec; evidence indexing, staleness, model proposals and team concurrency are slice 2.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + PostgreSQL, Next.js/React/TypeScript, `@evix/shared`, Node test runner + pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-agent-memory-design.md`

## Global Constraints

- Memory is project-scoped; no cross-project reads or writes.
- Only `owner` and `editor` may create/update versions; `reviewer` and `viewer` are read-only.
- The stored document contains no raw data rows, questionnaire body or report body.
- Text limits: intent field 600 chars; decision statement 1,200; rationale 2,000; question 1,200; why/next 1,000; document 48,000 UTF-8 bytes.
- The server builds the model brief; the browser must not send a memory brief as trusted context.
- No evidence index, staleness, proposals or memory tool writes in this plan; those belong to slice 2.
- Do not start PostgreSQL locally for this plan. Backend API tests are marked `postgres` and run in CI; domain tests run without a database.
- All mutating endpoints use the existing `Operation` idempotency pattern and `expectedRevision`.

---

## File Map

| File | Responsibility |
|---|---|
| `packages/evi-x-shared/src/project-memory.ts` | Shared document/snapshot types and parsers |
| `packages/evi-x-shared/src/index.ts` | Re-export the new module |
| `apps/backend/src/multi_agent/agents/research_agent/services/project_memory.py` | Pure validation, seed, brief |
| `apps/backend/src/infrastructure/database/models/project_memory.py` | SQLAlchemy version model |
| `apps/backend/src/infrastructure/database/models/__init__.py` | Register the model |
| `apps/backend/migrations/versions/0010_project_memory.py` | Table, RLS, immutability |
| `apps/backend/src/evix_api/runtime.py` | `SCHEMA_REVISION` bump |
| `apps/backend/src/application/services/project_memory.py` | Read/save service |
| `apps/backend/src/evix_api/routes/project_memory.py` | GET/POST routes |
| `apps/backend/src/evix_api/app.py` | Registration |
| `apps/backend/src/multi_agent/.../agent_chat.py` | `projectId`, memory brief, `memory` tool |
| `apps/backend/src/application/services/agent_chat.py` | Load brief before the model call |
| `apps/backend/src/evix_api/routes/agent_chat.py` | Pass memory service |
| `apps/frontend/lib/agent/chat.ts` | `ChatRequest.projectId`, `memory` tool contract |
| `apps/frontend/lib/agent/router.ts` | `memory` read turn |
| `apps/frontend/components/agent/AgentShell.tsx` | Project id, memory fetch, memory tool execution |
| `apps/frontend/components/hosted/project-memory-client.ts` | Memory API calls |
| `apps/frontend/components/hosted/useProjectMemory.ts` | Fetch/cache/save hook |
| `apps/frontend/components/hosted/ProjectMemoryPanel.tsx` | Read/edit document, seed, history |
| `apps/frontend/components/hosted/HostedProject.tsx` | `memory` project tab |
| `apps/frontend/components/agent/Lobby.tsx` | Project memory summary |
| `apps/frontend/app/hosted.css` | Memory panel styles |
| `apps/frontend/tests/agent-memory.test.mjs` | Shared/routing/client tests |
| `apps/backend/tests/test_project_memory.py` | Domain tests |
| `apps/backend/tests/test_project_memory_postgres.py` | API/RLS tests |
| `apps/backend/tests/test_agent_chat.py` | Prompt/tool tests |

---

## Task 1: Shared memory contract

**Files:**
- Create: `packages/evi-x-shared/src/project-memory.ts`
- Modify: `packages/evi-x-shared/src/index.ts`
- Test: `packages/evi-x-shared/tests/project-memory.test.mjs`

**Interfaces:**
- Produces: `INTENT_FIELDS`, `ProjectMemoryDocument`, `MemorySnapshot`, `MemorySource`, `MemoryDecision`, `MemoryQuestion`, `MemorySeed`, `parseProjectMemoryDocument(value)`, `parseMemorySnapshot(value)`.
- Consumes: `MembershipRole` from `./api-types.ts`.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTENT_FIELDS, parseMemorySnapshot } from '../src/project-memory.ts';

const emptyIntent = () => Object.fromEntries(INTENT_FIELDS.map(field => [field, { value: '', status: 'unknown' }]));
const snapshot = {
  schemaVersion: 1, projectId: 'p-1', revision: 2, contentHash: 'a'.repeat(64),
  document: { schemaVersion: 1, intent: emptyIntent(), decisions: [], openQuestions: [] },
  permissions: { role: 'editor', canEdit: true }, seed: null,
};

test('a memory snapshot parses and keeps its revision and permissions', () => {
  const parsed = parseMemorySnapshot(snapshot);
  assert.equal(parsed.revision, 2);
  assert.equal(parsed.permissions.canEdit, true);
  assert.equal(parsed.document.intent.title.status, 'unknown');
});

test('a memory document rejects unknown fields, bad statuses and long text', () => {
  assert.throws(() => parseMemorySnapshot({ ...snapshot, extra: true }));
  assert.throws(() => parseMemorySnapshot({ ...snapshot, document: { ...snapshot.document, intent: { ...emptyIntent(), title: { value: 'x', status: 'proposed' } } } }));
  assert.throws(() => parseMemorySnapshot({ ...snapshot, document: { ...snapshot.document, intent: { ...emptyIntent(), title: { value: 'x'.repeat(601), status: 'confirmed' } } } }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/evi-x-shared && node --experimental-strip-types --test tests/project-memory.test.mjs`

Expected: FAIL with `Cannot find module '../src/project-memory.ts'`.

- [ ] **Step 3: Write the contract**

```ts
import type { MembershipRole } from './api-types.ts';

export const INTENT_FIELDS = ['title', 'researchQuestion', 'decisionGoal', 'population', 'geography', 'stage'] as const;
export type IntentField = typeof INTENT_FIELDS[number];
export const SCOPES = ['rules', 'design', 'sampling', 'analysis', 'report', 'general'] as const;
export type DecisionScope = typeof SCOPES[number];
export type MemorySourceKind = 'user' | 'topic' | 'diagnosis' | 'rules' | 'agent' | 'import';
export type MemorySource = { kind: MemorySourceKind; ref?: string; revision?: number; hash?: string; conversationId?: string; turnId?: string; serviceId?: string };
export type IntentValue = { value: string; status: 'confirmed' | 'unknown'; source?: MemorySource; confirmedBy?: string; confirmedAt?: string };
export type MemoryDecision = { id: string; statement: string; rationale: string; scope: DecisionScope; status: 'confirmed' | 'superseded' | 'revoked'; source?: MemorySource; confirmedBy?: string; confirmedAt?: string; supersedes?: string | null };
export type MemoryQuestion = { id: string; question: string; why: string; next: string; status: 'open' | 'resolved'; source?: MemorySource; createdAt: string; resolvedBy?: string };
export type ProjectMemoryDocument = { schemaVersion: 1; intent: Record<IntentField, IntentValue>; decisions: MemoryDecision[]; openQuestions: MemoryQuestion[] };
export type MemorySeed = { intent: Partial<Record<IntentField, string>>; source: MemorySource };
export type MemorySnapshot = { schemaVersion: 1; projectId: string; revision: number; contentHash: string; document: ProjectMemoryDocument; permissions: { role: MembershipRole; canEdit: boolean }; seed: MemorySeed | null };
export type MemoryVersion = { id: string; revision: number; contentHash: string; createdAt: string; createdBy: string; changeNote: string; document: ProjectMemoryDocument };

const fail = (): never => { throw new Error('invalid project memory'); };
const record = (value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  for (const key of keys) if (!(key in row)) fail();
  for (const key of Object.keys(row)) if (!keys.includes(key) && !optional.includes(key)) fail();
  return row;
};
const str = (value: unknown, max: number): string => typeof value === 'string' && value.length <= max ? value : fail();
const source = (value: unknown): MemorySource => {
  const row = record(value, ['kind'], ['ref', 'revision', 'hash', 'conversationId', 'turnId', 'serviceId']);
  if (!['user', 'topic', 'diagnosis', 'rules', 'agent', 'import'].includes(row.kind as string)) fail();
  return { kind: row.kind as MemorySourceKind,
    ...(row.ref === undefined ? {} : { ref: str(row.ref, 120) }),
    ...(row.revision === undefined ? {} : { revision: typeof row.revision === 'number' ? row.revision : fail() }),
    ...(row.hash === undefined ? {} : { hash: str(row.hash, 64) }),
    ...(row.conversationId === undefined ? {} : { conversationId: str(row.conversationId, 64) }),
    ...(row.turnId === undefined ? {} : { turnId: str(row.turnId, 64) }),
    ...(row.serviceId === undefined ? {} : { serviceId: str(row.serviceId, 64) }) };
};
const intent = (value: unknown): Record<IntentField, IntentValue> => {
  const row = record(value, INTENT_FIELDS);
  return Object.fromEntries(INTENT_FIELDS.map(field => {
    const item = record(row[field], ['value', 'status'], ['source', 'confirmedBy', 'confirmedAt']);
    if (item.status !== 'confirmed' && item.status !== 'unknown') fail();
    return [field, { value: str(item.value, 600), status: item.status,
      ...(item.source === undefined ? {} : { source: source(item.source) }),
      ...(item.confirmedBy === undefined ? {} : { confirmedBy: str(item.confirmedBy, 64) }),
      ...(item.confirmedAt === undefined ? {} : { confirmedAt: str(item.confirmedAt, 40) }) }];
  })) as Record<IntentField, IntentValue>;
};
const decision = (value: unknown): MemoryDecision => {
  const row = record(value, ['id', 'statement', 'rationale', 'scope', 'status'], ['source', 'confirmedBy', 'confirmedAt', 'supersedes']);
  if (!SCOPES.includes(row.scope as DecisionScope) || !['confirmed', 'superseded', 'revoked'].includes(row.status as string)) fail();
  return { id: str(row.id, 64), statement: str(row.statement, 1200), rationale: str(row.rationale, 2000), scope: row.scope as DecisionScope, status: row.status as MemoryDecision['status'],
    ...(row.source === undefined ? {} : { source: source(row.source) }),
    ...(row.confirmedBy === undefined ? {} : { confirmedBy: str(row.confirmedBy, 64) }),
    ...(row.confirmedAt === undefined ? {} : { confirmedAt: str(row.confirmedAt, 40) }),
    ...(row.supersedes === undefined ? {} : { supersedes: row.supersedes === null ? null : str(row.supersedes, 64) }) };
};
const question = (value: unknown): MemoryQuestion => {
  const row = record(value, ['id', 'question', 'why', 'next', 'status', 'createdAt'], ['source', 'resolvedBy']);
  if (row.status !== 'open' && row.status !== 'resolved') fail();
  return { id: str(row.id, 64), question: str(row.question, 1200), why: str(row.why, 1000), next: str(row.next, 1000), status: row.status,
    createdAt: str(row.createdAt, 40),
    ...(row.source === undefined ? {} : { source: source(row.source) }),
    ...(row.resolvedBy === undefined ? {} : { resolvedBy: str(row.resolvedBy, 64) }) };
};
export function parseProjectMemoryDocument(value: unknown): ProjectMemoryDocument {
  const row = record(value, ['schemaVersion', 'intent', 'decisions', 'openQuestions']);
  if (row.schemaVersion !== 1 || !Array.isArray(row.decisions) || !Array.isArray(row.openQuestions)) fail();
  return { schemaVersion: 1, intent: intent(row.intent), decisions: row.decisions.map(decision), openQuestions: row.openQuestions.map(question) };
}
export function parseMemorySnapshot(value: unknown): MemorySnapshot {
  const row = record(value, ['schemaVersion', 'projectId', 'revision', 'contentHash', 'document', 'permissions'], ['seed']);
  if (row.schemaVersion !== 1 || typeof row.revision !== 'number') fail();
  const permissions = record(row.permissions, ['role', 'canEdit']);
  if (!['owner', 'editor', 'reviewer', 'viewer'].includes(permissions.role as string)) fail();
  const seedValue = row.seed;
  const seed = seedValue === null || seedValue === undefined ? null : (() => {
    const item = record(seedValue, ['intent', 'source']);
    const values = record(item.intent, Object.keys(item.intent as object));
    const clean = Object.fromEntries(Object.entries(values).filter(([key]) => INTENT_FIELDS.includes(key as IntentField)).map(([key, text]) => [key, str(text, 600)]));
    return { intent: clean as Partial<Record<IntentField, string>>, source: source(item.source) };
  })();
  return { schemaVersion: 1, projectId: str(row.projectId, 64), revision: row.revision, contentHash: str(row.contentHash, 64),
    document: parseProjectMemoryDocument(row.document), permissions: { role: permissions.role as MembershipRole, canEdit: permissions.canEdit === true }, seed };
}
```

- [ ] **Step 4: Export and run the test**

Modify `packages/evi-x-shared/src/index.ts`:

```ts
export * from './questionnaire.ts';
export * from './api-types.ts';
export * from './project-memory.ts';
```

Run: `cd packages/evi-x-shared && node --experimental-strip-types --test tests/project-memory.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/evi-x-shared/src/project-memory.ts packages/evi-x-shared/src/index.ts packages/evi-x-shared/tests/project-memory.test.mjs
git commit -m "feat: add shared project memory contract"
```

---

## Task 2: Backend domain and brief

**Files:**
- Create: `apps/backend/src/multi_agent/agents/research_agent/services/project_memory.py`
- Test: `apps/backend/tests/test_project_memory.py`

**Interfaces:**
- Produces: `INTENT_FIELDS`, `document(value)`, `seed(project_title, topic=None)`, `brief(document_value)`, `content_hash(document_value)`, `MAX_DOCUMENT_BYTES`.
- Consumes: `shared.contracts` (`object_fields`, `text`, `canonical`, `fingerprint`) and `shared.errors.ApiError`.

- [ ] **Step 1: Write the failing tests**

```python
# apps/backend/tests/test_project_memory.py
import pytest
from shared.errors import ApiError
from multi_agent.agents.research_agent.services import project_memory as memory

def empty_intent():
    return {field: {"value": "", "status": "unknown"} for field in memory.INTENT_FIELDS}

def doc():
    return {"schemaVersion": 1, "intent": empty_intent(), "decisions": [], "openQuestions": []}

def test_empty_document_is_valid_and_seed_keeps_the_title():
    value = memory.document(doc())
    assert value["intent"]["title"]["status"] == "unknown"
    seeded = memory.seed("社区体育设施研究")
    assert seeded["intent"]["title"] == "社区体育设施研究"
    assert seeded["source"]["kind"] == "import"

def test_unknown_fields_and_long_intent_are_rejected():
    extra = {**doc(), "extra": True}
    with pytest.raises(ApiError):
        memory.document(extra)
    bad = doc()
    bad["intent"]["title"] = {"value": "x" * 601, "status": "confirmed"}
    with pytest.raises(ApiError):
        memory.document(bad)

def test_brief_lists_only_effective_entries_and_stays_compact():
    value = doc()
    value["intent"]["title"] = {"value": "社区体育设施研究", "status": "confirmed"}
    value["decisions"] = [{"id": "d1", "statement": "分层抽样", "rationale": "街道差异大", "scope": "sampling", "status": "confirmed"}]
    value["openQuestions"] = [{"id": "q1", "question": "要补样吗", "why": "老年样本可能不足", "next": "看年龄分布", "status": "open", "createdAt": "2026-10-29T00:00:00Z"}]
    brief = memory.brief(value)
    assert brief["intent"]["title"] == "社区体育设施研究"
    assert brief["decisions"][0]["id"] == "d1"
    assert len(__import__("json").dumps(brief, ensure_ascii=False)) <= memory.MAX_BRIEF_CHARS
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/backend && uv run pytest -q tests/test_project_memory.py`

Expected: FAIL with `ModuleNotFoundError: ... project_memory`.

- [ ] **Step 3: Implement the domain module**

Create the file with these exact public functions:

```python
"""Project memory: the confirmed research intent, decisions and open questions of one project."""
from copy import deepcopy
import json
from shared.contracts import canonical, fingerprint, object_fields, text
from shared.errors import ApiError

INTENT_FIELDS = ("title", "researchQuestion", "decisionGoal", "population", "geography", "stage")
DECISION_SCOPES = ("rules", "design", "sampling", "analysis", "report", "general")
SOURCE_KINDS = ("user", "topic", "diagnosis", "rules", "agent", "import")
MAX_INTENT = 600
MAX_STATEMENT = 1200
MAX_RATIONALE = 2000
MAX_QUESTION = 1200
MAX_WHY = 1000
MAX_DOCUMENT_BYTES = 48000
MAX_BRIEF_CHARS = 2000

def _source(value):
    object_fields(value, ("kind",), ("ref", "revision", "hash", "conversationId", "turnId", "serviceId"))
    if value["kind"] not in SOURCE_KINDS: raise ApiError()
    if "ref" in value: text(value["ref"], 120, 1)
    if "hash" in value and not isinstance(value["hash"], str): raise ApiError()
    return deepcopy(value)

def _intent(value):
    object_fields(value, INTENT_FIELDS)
    for field in INTENT_FIELDS:
        item = value[field]
        object_fields(item, ("value", "status"), ("source", "confirmedBy", "confirmedAt"))
        if item["status"] not in ("confirmed", "unknown"): raise ApiError()
        text(item["value"], MAX_INTENT)
        if "source" in item: _source(item["source"])
        if "confirmedBy" in item: text(item["confirmedBy"], 64, 1)
        if "confirmedAt" in item: text(item["confirmedAt"], 40, 1)
    return deepcopy(value)

def _decisions(value):
    if not isinstance(value, list) or len(value) > 200: raise ApiError()
    seen = set()
    for item in value:
        object_fields(item, ("id", "statement", "rationale", "scope", "status"), ("source", "confirmedBy", "confirmedAt", "supersedes"))
        if not isinstance(item["id"], str) or item["id"] in seen: raise ApiError()
        seen.add(item["id"])
        text(item["statement"], MAX_STATEMENT, 1)
        text(item["rationale"], MAX_RATIONALE)
        if item["scope"] not in DECISION_SCOPES or item["status"] not in ("confirmed", "superseded", "revoked"): raise ApiError()
        if "source" in item: _source(item["source"])
    return deepcopy(value)

def _questions(value):
    if not isinstance(value, list) or len(value) > 100: raise ApiError()
    seen = set()
    for item in value:
        object_fields(item, ("id", "question", "why", "next", "status", "createdAt"), ("source", "resolvedBy"))
        if not isinstance(item["id"], str) or item["id"] in seen: raise ApiError()
        seen.add(item["id"])
        text(item["question"], MAX_QUESTION, 1)
        text(item["why"], MAX_WHY)
        text(item["next"], MAX_WHY)
        if item["status"] not in ("open", "resolved"): raise ApiError()
        if "source" in item: _source(item["source"])
    return deepcopy(value)

def document(value):
    object_fields(value, ("schemaVersion", "intent", "decisions", "openQuestions"))
    if value["schemaVersion"] != 1: raise ApiError()
    result = {"schemaVersion": 1, "intent": _intent(value["intent"]), "decisions": _decisions(value["decisions"]), "openQuestions": _questions(value["openQuestions"])}
    if len(canonical(result).encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise ApiError(422, "memory_too_large", "项目记忆超过大小上限。")
    return result

def content_hash(value):
    return fingerprint(document(value))

def seed(project_title, topic=None):
    title = (topic or {}).get("title") or project_title
    intent = {"title": title}
    if topic:
        for source_key, target in (("problem", "researchQuestion"), ("population", "population"), ("geography", "geography")):
            if topic.get(source_key): intent[target] = str(topic[source_key])
    return {"intent": intent, "source": {"kind": "topic" if topic else "import", "ref": (topic or {}).get("versionId", "project-title")}}

def _clip(value, limit):
    return value if len(value) <= limit else value[:limit - 1] + "…"

def brief(value, revision=0):
    doc = document(value)
    confirmed = [d for d in doc["decisions"] if d["status"] == "confirmed"]
    return {
        "schemaVersion": 1, "available": True, "revision": revision,
        "intent": {field: _clip(doc["intent"][field]["value"], 160) for field in INTENT_FIELDS if doc["intent"][field]["status"] == "confirmed"},
        "decisions": [{"id": d["id"], "statement": _clip(d["statement"], 160), "rationale": _clip(d["rationale"], 120)} for d in confirmed[:8]],
        "openQuestions": [{"id": q["id"], "question": _clip(q["question"], 140), "next": _clip(q["next"], 100)} for q in doc["openQuestions"] if q["status"] == "open"][:5],
    }
```

`brief` must keep the serialized JSON within `MAX_BRIEF_CHARS`. Add this exact trimming loop at the end of `brief`:

```python
    result = {
        "schemaVersion": 1, "available": True, "revision": revision,
        "intent": {field: _clip(doc["intent"][field]["value"], 160) for field in INTENT_FIELDS if doc["intent"][field]["status"] == "confirmed"},
        "decisions": [{"id": d["id"], "statement": _clip(d["statement"], 160), "rationale": _clip(d["rationale"], 120)} for d in confirmed[:8]],
        "openQuestions": [{"id": q["id"], "question": _clip(q["question"], 140), "next": _clip(q["next"], 100)} for q in doc["openQuestions"] if q["status"] == "open"][:5],
    }
    while len(json.dumps(result, ensure_ascii=False)) > MAX_BRIEF_CHARS and result["decisions"]:
        result["decisions"].pop()
    while len(json.dumps(result, ensure_ascii=False)) > MAX_BRIEF_CHARS and result["openQuestions"]:
        result["openQuestions"].pop()
    return result
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/backend && uv run pytest -q tests/test_project_memory.py`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/multi_agent/agents/research_agent/services/project_memory.py apps/backend/tests/test_project_memory.py
git commit -m "feat: add project memory domain validation and brief"
```

---

## Task 3: Backend storage and migration

**Files:**
- Create: `apps/backend/src/infrastructure/database/models/project_memory.py`
- Modify: `apps/backend/src/infrastructure/database/models/__init__.py`
- Create: `apps/backend/migrations/versions/0010_project_memory.py`
- Modify: `apps/backend/src/evix_api/runtime.py`
- Test: `apps/backend/tests/test_project_memory_postgres.py`

**Interfaces:**
- Produces: `ProjectMemoryVersion` model; table `project_memory_versions`; schema head `0010_project_memory`.
- Consumes: existing `Base`, `now`, `new_id`.

- [ ] **Step 1: Write the failing schema test**

```python
# apps/backend/tests/test_project_memory_postgres.py
import pytest
from sqlalchemy import text

pytestmark = pytest.mark.postgres

def test_memory_version_table_and_rls_exist(pg_engine):
    with pg_engine.connect() as connection:
        assert connection.execute(text("SELECT to_regclass('public.project_memory_versions')")).scalar()
        assert connection.execute(text("SELECT relrowsecurity FROM pg_class WHERE relname='project_memory_versions'")).scalar() is True
```

- [ ] **Step 2: Run and confirm failure**

Run (with the CI PostgreSQL URL): `cd apps/backend && EVIX_TEST_DATABASE_URL=... uv run pytest -q -m postgres tests/test_project_memory_postgres.py`

Expected: FAIL because the table does not exist.

- [ ] **Step 3: Implement model, migration and revision**

Create the model:

```python
from datetime import datetime
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, new_id, now

class ProjectMemoryVersion(Base):
    __tablename__ = "project_memory_versions"
    __table_args__ = (UniqueConstraint("project_id", "revision"), UniqueConstraint("project_id", "id", "content_hash"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    document: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    change_note: Mapped[str] = mapped_column(String(500), default="")
```

Add `from .project_memory import ProjectMemoryVersion` and `'ProjectMemoryVersion'` to `__all__` in `models/__init__.py`.

Create migration `0010_project_memory.py` mirroring `0006_topic_projects.py`:

```python
"""Versioned project memory."""
from alembic import op

revision = "0010_project_memory"
down_revision = "0009_agent_task_collaboration"
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""CREATE TABLE project_memory_versions (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      revision INTEGER NOT NULL CHECK(revision > 0),
      document JSON NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL,
      change_note VARCHAR(500) NOT NULL DEFAULT '',
      UNIQUE(project_id, revision),
      UNIQUE(project_id, id, content_hash))""")
    op.execute("CREATE INDEX ix_project_memory_versions_project_id ON project_memory_versions(project_id)")
    op.execute("ALTER TABLE project_memory_versions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE project_memory_versions FORCE ROW LEVEL SECURITY")
    scoped = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=project_memory_versions.project_id AND m.user_id=current_setting('evix.user_id',true))"
    editable = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=project_memory_versions.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
    op.execute(f"CREATE POLICY scoped_read ON project_memory_versions FOR SELECT USING ({scoped})")
    op.execute(f"CREATE POLICY scoped_insert ON project_memory_versions FOR INSERT WITH CHECK ({editable} AND created_by=current_setting('evix.user_id',true))")
    op.execute("CREATE TRIGGER immutable_project_memory_versions BEFORE UPDATE OR DELETE ON project_memory_versions FOR EACH ROW EXECUTE FUNCTION evix_immutable_version()")

def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
```

Update `runtime.py`:

```python
SCHEMA_REVISION = "0010_project_memory"
```

- [ ] **Step 4: Run the schema test**

Run: `cd apps/backend && EVIX_TEST_DATABASE_URL=... uv run pytest -q -m postgres tests/test_project_memory_postgres.py`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/database/models/project_memory.py apps/backend/src/infrastructure/database/models/__init__.py apps/backend/migrations/versions/0010_project_memory.py apps/backend/src/evix_api/runtime.py apps/backend/tests/test_project_memory_postgres.py
git commit -m "feat: store versioned project memory"
```

---

## Task 4: Read/save API

**Files:**
- Create: `apps/backend/src/application/services/project_memory.py`
- Create: `apps/backend/src/evix_api/routes/project_memory.py`
- Modify: `apps/backend/src/evix_api/app.py`
- Test: `apps/backend/tests/test_project_memory_postgres.py` (extend)

**Interfaces:**
- Produces: `ProjectMemoryService(owned_project=..., operation=...)` with `get`, `versions`, `save`, `brief_for_agent`; routes `GET /api/projects/{id}/memory`, `GET/POST /api/projects/{id}/memory/versions`.
- Consumes: `ProjectMemoryVersion`, domain functions, `owned_project`, `operation`, `integer`, `new_id`, `fingerprint`.

- [ ] **Step 1: Add failing API tests**

```python
def test_project_memory_starts_empty_and_saves_a_version(harness):
    _, login, _, _ = harness
    client, identity = login("memory@example.com")
    project, _ = project(client)
    response = client.get(f"/api/projects/{project['id']}/memory")
    assert response.status_code == 200
    assert response.json()["revision"] == 0
    assert response.json()["seed"]["intent"]["title"] == project["title"]
    document = {"schemaVersion": 1, "intent": {field: {"value": "", "status": "unknown"} for field in ("title", "researchQuestion", "decisionGoal", "population", "geography", "stage")}, "decisions": [], "openQuestions": []}
    saved = client.post(f"/api/projects/{project['id']}/memory/versions", json={"schemaVersion": 1, "idempotencyKey": "11111111-1111-4111-8111-111111111111", "expectedRevision": 0, "document": document, "changeNote": "初始化"})
    assert saved.status_code == 201
    assert saved.json()["revision"] == 1
    assert client.get(f"/api/projects/{project['id']}/memory").json()["document"]["intent"]["title"]["status"] == "unknown"
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/backend && EVIX_TEST_DATABASE_URL=... uv run pytest -q -m postgres tests/test_project_memory_postgres.py -k saves_a_version`

Expected: FAIL with 404.

- [ ] **Step 3: Implement service and routes**

`application/services/project_memory.py`:

```python
from sqlalchemy import select
from shared.errors import ApiError
from shared.contracts import integer
from infrastructure.database.models import ProjectMemoryVersion, TopicProjectDecision, TopicProjectVersion, new_id, now
from multi_agent.agents.research_agent.services import project_memory as domain

class ProjectMemoryService:
    def __init__(self, *, owned_project, operation):
        self.owned_project = owned_project
        self.operation = operation

    def _latest(self, session, project_id):
        return session.execute(select(ProjectMemoryVersion).where(ProjectMemoryVersion.project_id == project_id).order_by(ProjectMemoryVersion.revision.desc()).limit(1)).scalar_one_or_none()

    def _topic_seed(self, session, project_id):
        version = session.execute(select(TopicProjectVersion).where(TopicProjectVersion.project_id == project_id).order_by(TopicProjectVersion.revision.desc()).limit(1)).scalar_one_or_none()
        if not version: return None
        decision = session.execute(select(TopicProjectDecision).where(TopicProjectDecision.project_id == project_id).order_by(TopicProjectDecision.revision.desc()).limit(1)).scalar_one_or_none()
        if not decision or decision.action != "confirm" or decision.version_id != version.id: return None
        return {**version.document, "versionId": version.id, "revision": version.revision, "hash": version.content_hash}

    def get(self, *, project_id, user, session):
        project, role = self.owned_project(session, user, project_id)
        row = self._latest(session, project.id)
        seed = None if row else domain.seed(project.title, self._topic_seed(session, project.id))
        return {"schemaVersion": 1, "projectId": project.id, "revision": row.revision if row else 0,
                "contentHash": row.content_hash if row else "0" * 64,
                "document": row.document if row else {"schemaVersion": 1, "intent": {field: {"value": "", "status": "unknown"} for field in domain.INTENT_FIELDS}, "decisions": [], "openQuestions": []},
                "permissions": {"role": role, "canEdit": role in ("owner", "editor")}, "seed": seed}

    def versions(self, *, project_id, user, session):
        project, _ = self.owned_project(session, user, project_id)
        rows = session.execute(select(ProjectMemoryVersion).where(ProjectMemoryVersion.project_id == project.id).order_by(ProjectMemoryVersion.revision.desc()).limit(30)).scalars().all()
        return {"versions": [{"id": r.id, "revision": r.revision, "contentHash": r.content_hash, "createdBy": r.created_by, "createdAt": r.created_at.isoformat(), "changeNote": r.change_note, "document": r.document} for r in rows]}

    async def save(self, *, project_id, user, session, data):
        project, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, "project-memory:" + project.id, data)
        if repeated: return op.response
        expected = integer(data["expectedRevision"], 0, 2147483646)
        current = self._latest(session, project.id)
        if expected != (current.revision if current else 0): raise ApiError(409, "memory_revision_conflict", "项目记忆已有新版本。")
        document = domain.document(data["document"])
        item = ProjectMemoryVersion(id=new_id(), project_id=project.id, revision=expected + 1, document=document, content_hash=domain.content_hash(document), created_by=user.id, change_note=(data.get("changeNote") or "")[:500])
        session.add(item); session.flush()
        op.response = self.get(project_id=project.id, user=user, session=session)
        session.commit(); return op.response

    def brief_for_agent(self, *, project_id, user, session):
        if not project_id: return {"available": False}
        try:
            snapshot = self.get(project_id=project_id, user=user, session=session)
        except ApiError:
            return {"available": False}
        return {"available": snapshot["revision"] > 0, "revision": snapshot["revision"], "brief": domain.brief(snapshot["document"], snapshot["revision"]) if snapshot["revision"] else None}
```

Routes:

```python
from fastapi import Depends, Request
from evix_api.requests import body
from application.services.project_memory import ProjectMemoryService

def register_memory(app, *, auth, db, owned_project, operation):
    service = ProjectMemoryService(owned_project=owned_project, operation=operation)
    @app.get("/api/projects/{project_id}/memory")
    def get(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.get(project_id=project_id, user=user, session=session)
    @app.get("/api/projects/{project_id}/memory/versions")
    def versions(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.versions(project_id=project_id, user=user, session=session)
    @app.post("/api/projects/{project_id}/memory/versions", status_code=201)
    async def save(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        from shared.errors import ApiError
        data = await body(request, ("schemaVersion", "idempotencyKey", "expectedRevision", "document"), ("changeNote",), limit=70000)
        if data["schemaVersion"] != 1: raise ApiError()
        return await service.save(project_id=project_id, user=user, session=session, data=data)
```

Register in `app.py`:

```python
from evix_api.routes import ..., project_memory
...
project_memory.register_memory(app, auth=deps.auth, db=deps.db, owned_project=deps.owned_project, operation=deps.operation)
```

- [ ] **Step 4: Run the API tests**

Run: `cd apps/backend && EVIX_TEST_DATABASE_URL=... uv run pytest -q -m postgres tests/test_project_memory_postgres.py`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/application/services/project_memory.py apps/backend/src/evix_api/routes/project_memory.py apps/backend/src/evix_api/app.py apps/backend/tests/test_project_memory_postgres.py
git commit -m "feat: expose project memory read and save API"
```

---

## Task 5: Agent server brief and memory tool

**Files:**
- Modify: `apps/backend/src/multi_agent/agents/research_agent/services/agent_chat.py`
- Modify: `apps/backend/src/application/services/agent_chat.py`
- Modify: `apps/backend/src/evix_api/routes/agent_chat.py`
- Modify: `apps/backend/src/evix_api/app.py`
- Test: `apps/backend/tests/test_agent_chat.py`

**Interfaces:**
- Consumes: `ProjectMemoryService.brief_for_agent`.
- Produces: `PROJECT_FIELDS`, `agent_prompt(data, memory=None)`, `TOOLS["memory"]`, `RESULT_TOOLS` includes `memory`.

- [ ] **Step 1: Add failing tests**

```python
def test_project_memory_is_part_of_the_prompt_and_memory_is_read_only():
    data = request(projectId="11111111-1111-4111-8111-111111111111")
    prompt = chat.agent_prompt(chat.request_input(data), {"available": True, "revision": 2, "brief": {"intent": {"title": "社区体育设施研究"}}})
    assert "社区体育设施研究" in prompt
    assert "memory" in chat.TOOLS
    assert "memory" in chat.RESULT_TOOLS
    assert "memory_propose" not in chat.TOOLS
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/backend && uv run pytest -q tests/test_agent_chat.py`

Expected: FAIL because `projectId` is unknown and `memory` is not a tool.

- [ ] **Step 3: Implement**

In `agent_chat.py`:
```python
PROJECT_FIELDS = ("projectId",)
...
def request_input(data):
    object_fields(data, REQUEST_FIELDS, STEP_FIELDS + PROJECT_FIELDS)
    ...
    if data.get("projectId") is not None:
        uuid_string(data["projectId"])
```
Add `"memory": {}` to `TOOLS`, add `"memory"` to `RESULT_TOOLS`, and in `_prompt` add a sentence:
```python
"memory 是服务端从项目档案生成的有界摘要，不是原始数据；stale 条目不得当作有效结论；当前模块版本优先于记忆。"
```
Change `agent_prompt(data, memory=None)`:
```python
material = {"context": data["context"], "history": history, "message": data["message"]}
if memory is not None:
    material["memory"] = memory
```

In `application/services/agent_chat.py`:
```python
def __init__(self, *, settings, lock_user, operation, owned_service, generator, project_memory):
    ...
    self.project_memory = project_memory

async def create_turn(...):
    data = domain.request_input(raw_data)
    memory = self.project_memory.brief_for_agent(project_id=data.get("projectId"), user=user, session=session)
    ...
    message = domain.agent_prompt(data, memory)
```

In `routes/agent_chat.py`:
```python
def register_agent_chat(app, settings, db, session_user, lock_user, operation, owned_service, generator, project_memory):
    ...
    service = AgentChatService(..., project_memory=project_memory)
```
In `app.py`, construct a memory service once or pass the route service. Simplest: import `ProjectMemoryService` and create it in `register_memory`? The route function can expose the instance; or `app.py` creates:
```python
memory_service = ProjectMemoryService(owned_project=deps.owned_project, operation=deps.operation)
project_memory.register_memory(..., service=memory_service)
agent_chat.register_agent_chat(..., project_memory=memory_service)
```
Adjust `register_memory` to accept an optional `service` and reuse.

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && uv run pytest -q tests/test_agent_chat.py`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/multi_agent/agents/research_agent/services/agent_chat.py apps/backend/src/application/services/agent_chat.py apps/backend/src/evix_api/routes/agent_chat.py apps/backend/src/evix_api/app.py apps/backend/tests/test_agent_chat.py
git commit -m "feat: inject project memory brief into agent turns"
```

---

## Task 6: Frontend request and memory read tool

**Files:**
- Modify: `apps/frontend/lib/agent/chat.ts`
- Modify: `apps/frontend/lib/agent/router.ts`
- Modify: `apps/frontend/components/agent/AgentShell.tsx`
- Test: `apps/frontend/tests/agent-chat.test.mjs`

**Interfaces:**
- `ChatRequest.projectId?: string`.
- `ChatAction` gains `{ tool: 'memory'; args: { section?: 'intent'|'decisions'|'open'; id?: string } }`.
- `ToolResult` includes `memory`; `RESULT_TOOLS` includes it.
- `RouterContext` gains `memory?: MemorySnapshot | null`.

- [ ] **Step 1: Write failing tests**

```js
const intent = Object.fromEntries(['title', 'researchQuestion', 'decisionGoal', 'population', 'geography', 'stage'].map(field => [field, { value: '', status: 'unknown' }]));
const snapshot = { schemaVersion: 1, projectId: 'p', revision: 1, contentHash: 'a'.repeat(64), document: { schemaVersion: 1, intent, decisions: [{ id: 'd1', statement: '分层抽样', rationale: '街道差异大', scope: 'sampling', status: 'confirmed' }], openQuestions: [] }, permissions: { role: 'editor', canEdit: true }, seed: null };

test('the memory tool is read-only and asks for a section or an entry', () => {
  assert.equal(isResultTool('memory'), true);
  const action = parseChatReceipt({ id: 't', status: 'ready', reply: '查记忆', actions: [{ tool: 'memory', args: { section: 'decisions' } }] }).actions[0];
  assert.deepEqual(action, { tool: 'memory', args: { section: 'decisions' } });
  const turn = toolTurn({ tool: 'memory', args: { section: 'decisions' } }, { ...ctx(), memory: snapshot });
  assert.match(text(turn.turn), /分层抽样/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-chat.test.mjs`

Expected: FAIL because the tool is not recognized.

- [ ] **Step 3: Implement**

In `chat.ts`, add `projectId?: string` to `ChatRequest`; extend `ChatAction` and `ToolResult` with `memory`; add `'memory'` to `RESULT_TOOLS`; in `action()` add:
```ts
case 'memory': {
  const section = row.args.section;
  const id = row.args.id;
  if (section !== undefined && !['intent', 'decisions', 'open'].includes(section as string)) return null;
  if (id !== undefined && (typeof id !== 'string' || !id.trim() || id.length > 64)) return null;
  if (section === undefined && id === undefined) return null;
  return { tool: 'memory', args: { ...(section === undefined ? {} : { section }), ...(id === undefined ? {} : { id }) } };
}
```
In `router.ts`, import `INTENT_FIELDS` from `@evix/shared` and add to `RouterContext`:
```ts
memory?: import('@evix/shared').MemorySnapshot | null;
```
Add `memory` case to `toolTurn`:
```ts
case 'memory': {
  const snapshot = ctx.memory;
  if (!snapshot) return { turn: { lines: [[{ text: '当前项目还没有项目记忆。', mark: 'dim' }]] } };
  const section = action.args.section;
  const id = action.args.id;
  if (id) {
    const decision = snapshot.document.decisions.find(d => d.id === id);
    const question = snapshot.document.openQuestions.find(q => q.id === id);
    if (!decision && !question) return { turn: { lines: [[{ text: `项目记忆里没有条目 ${id}。`, mark: 'dim' }]] } };
    return { turn: { lines: [[{ text: decision ? `${decision.statement}（${decision.rationale}）` : `${question!.question}：${question!.why}` }]] } };
  }
  const lines = section === 'intent'
    ? INTENT_FIELDS.flatMap(field => snapshot.document.intent[field].status === 'confirmed' ? [[{ text: `${field}：${snapshot.document.intent[field].value}` }]] : [])
    : section === 'open'
      ? snapshot.document.openQuestions.filter(q => q.status === 'open').map(q => [{ text: `${q.question} · ${q.next}` }])
      : snapshot.document.decisions.filter(d => d.status === 'confirmed').map(d => [{ text: `${d.statement}（${d.rationale}）` }]);
  return { turn: { lines: lines.length ? lines : [[{ text: '项目记忆这一节还是空的。', mark: 'dim' }]] } };
}
```
In `AgentShell.tsx`, add `projectId` and `memory: null` to `latest`, pass `projectId` into `ChatRequest`, and pass `latest.current.memory` into the `toolTurn`/`route` context:
```ts
const request: ChatRequest = { ..., ...(projectId ? { projectId } : {}) };
...
const routed = toolTurn(action, { room: panel, light, theme, traces, results: held, plan, memory: latest.current.memory });
```
Task 7 replaces the literal `memory: null` with the fetched snapshot; this task only establishes the contract and keeps the tool unavailable until then.

- [ ] **Step 4: Run tests**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-chat.test.mjs`

Expected: PASS (plus existing tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/lib/agent/chat.ts apps/frontend/lib/agent/router.ts apps/frontend/components/agent/AgentShell.tsx apps/frontend/tests/agent-chat.test.mjs
git commit -m "feat: let the agent read project memory"
```

---

## Task 7: Project memory page and Agent summary

**Files:**
- Create: `apps/frontend/components/hosted/project-memory-client.ts`
- Create: `apps/frontend/components/hosted/useProjectMemory.ts`
- Create: `apps/frontend/components/hosted/ProjectMemoryPanel.tsx`
- Modify: `apps/frontend/components/hosted/HostedProject.tsx`
- Modify: `apps/frontend/components/agent/Lobby.tsx`
- Modify: `apps/frontend/app/hosted.css`
- Test: `apps/frontend/tests/agent-memory.test.mjs`

**Interfaces:**
- `fetchMemory(projectId): Promise<MemorySnapshot>`, `saveMemory(projectId, input)`, `fetchMemoryVersions(projectId)`.
- `useProjectMemory(projectId): { snapshot, status, error, reload, save }`.
- `ProjectMemoryPanel({ projectId, role }): JSX.Element`.
- Lobby receives `memory?: MemorySnapshot | null` and `projectId?: string | null`.

- [ ] **Step 1: Write failing client tests**

```js
const intent = Object.fromEntries(['title', 'researchQuestion', 'decisionGoal', 'population', 'geography', 'stage'].map(field => [field, { value: '', status: 'unknown' }]));
const snapshot = { schemaVersion: 1, projectId: 'p-1', revision: 2, contentHash: 'a'.repeat(64), document: { schemaVersion: 1, intent, decisions: [], openQuestions: [] }, permissions: { role: 'editor', canEdit: true }, seed: null };

test('memory requests carry the project and an expected revision', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, body: init?.body }); return new Response(JSON.stringify(snapshot), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const client = await import('../components/hosted/project-memory-client.ts');
  const result = await client.fetchMemory('p-1');
  assert.equal(result.revision, 2);
  await client.saveMemory('p-1', { expectedRevision: 2, document: snapshot.document, idempotencyKey: 'k', changeNote: '' });
  assert.match(calls[1].url, /\/api\/projects\/p-1\/memory\/versions$/);
  assert.equal(JSON.parse(calls[1].body).expectedRevision, 2);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-memory.test.mjs`

Expected: FAIL with a missing module.

- [ ] **Step 3: Implement client, hook and panel**

`project-memory-client.ts`:
```ts
import { hostedRequest } from './api-client';
import { parseMemorySnapshot, type MemorySnapshot, type ProjectMemoryDocument } from '@evix/shared';

export async function fetchMemory(projectId: string): Promise<MemorySnapshot> {
  return parseMemorySnapshot(await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/memory`));
}

export async function saveMemory(projectId: string, input: { expectedRevision: number; document: ProjectMemoryDocument; idempotencyKey: string; changeNote: string }): Promise<MemorySnapshot> {
  return parseMemorySnapshot(await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/memory/versions`, { method: 'POST', body: { schemaVersion: 1, ...input } }));
}

export async function fetchMemoryVersions(projectId: string): Promise<{ versions: { id: string; revision: number; createdAt: string; changeNote: string }[] }> {
  return await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/memory/versions`) as never;
}
```
- `useProjectMemory`: state snapshot/status/error; `reload` fetches on projectId change; `save` calls saveMemory then sets snapshot; no writes offline.
- Wire the hook into `AgentShell` after Task 6: replace `latest.current.memory: null` with the snapshot, pass `projectId` from `thread?.projectId ?? book.draftProject`, and pass the snapshot to `Lobby` (summary + link).
- `ProjectMemoryPanel`: read-only first, then form. Use existing `.hosted-card`, `.hosted-section-title`, `.hosted-alert`, `.hosted-notice`, `.hosted-tabs`; render:
  - loading / error,
  - seed card with "从选题带入" (prefills the form, still requires save),
  - four sections: intent fields (inputs; only `canEdit`), decisions (statement/rationale/scope, add/void), open questions (question/why/next, add/resolve),
  - save button disabled unless dirty and canEdit; `expectedRevision` from snapshot; on 409 show conflict and reload,
  - history list via fetchMemoryVersions.
- Add tab `'memory'` to `ProjectTab`, lazy-mount flag, tab button, `useKeyedListMotion` id; `HostedProject` initial tab from `?tab=memory`.
- Lobby: add a compact `<section>` or row after the header showing `memory.document.intent.title.value` or "还没有项目记忆", counts, and a link `<a href={`/projects/${projectId}?tab=memory`}>项目档案 →</a>`. AgentShell passes `memory` and `projectId` to Lobby.
- CSS: add `.hosted-memory-*` rules using existing tokens; responsive; no horizontal scroll.

- [ ] **Step 4: Run client tests, lint and browser**

Run: `cd apps/frontend && node --experimental-strip-types --test tests/agent-memory.test.mjs && npm run typecheck && npm run lint`

Expected: tests pass; type/lint clean.

Browser: sign in, create/open a project, open “项目档案”, fill intent, save, open another conversation, verify Agent’s answer uses the saved intent; check viewer cannot save.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/hosted/project-memory-client.ts apps/frontend/components/hosted/useProjectMemory.ts apps/frontend/components/hosted/ProjectMemoryPanel.tsx apps/frontend/components/hosted/HostedProject.tsx apps/frontend/components/agent/Lobby.tsx apps/frontend/app/hosted.css apps/frontend/tests/agent-memory.test.mjs
git commit -m "feat: add project memory page and agent summary"
```

---

## Task 8: Verification and handoff

**Files:**
- Modify: `docs/agent-shell.md` (document project memory)
- No code files.

- [ ] **Step 1: Update the docs**

Add a short “项目记忆” section to `docs/agent-shell.md`: project-scoped, versioned, owner/editor writes, Agent reads a server-built brief, no raw data; link to the spec.

- [ ] **Step 2: Run the frontend verification**

```bash
cd apps/frontend
node --experimental-strip-types --test tests/agent-memory.test.mjs tests/agent-chat.test.mjs tests/agent-shell.test.mjs
npm run typecheck
npm run lint
npm run build
```

Expected: all pass; build includes `/agent` and `/projects/[projectId]`.

- [ ] **Step 3: Run backend unit tests and note Postgres**

```bash
cd apps/backend
uv run pytest -q tests/test_project_memory.py tests/test_agent_chat.py
```

Expected: unit tests pass. Run the `postgres` tests in CI with `EVIX_TEST_DATABASE_URL`; local PostgreSQL is not started by this plan.

- [ ] **Step 4: Browser acceptance**

- Owner opens project → 项目档案 → edits intent → saves.
- New conversation under that project → Agent answers with the saved intent and names it as project memory.
- Viewer/reviewer sees read-only fields and cannot save.
- A project without memory shows the seed and “从选题带入”, not a fake memory.
- Switching to a conversation without a project shows “没有项目记忆”.

- [ ] **Step 5: Commit**

```bash
git add docs/agent-shell.md
git commit -m "docs: describe project memory in the agent"
```

---

## Plan 2 (not in this plan)

The approved spec also requires, in a follow-on plan:

- `project_memory_evidence` and server/client verification;
- dependency-based staleness and UI;
- `project_memory_proposals`, `memory_propose` tool, diff cards, confirm/ignore;
- proposal queue, concurrency conflicts, audit export;
- cold-start proposal from topic/diagnosis and team/RLS acceptance.

Do not implement those in this slice.

---

## Self-Review

- Spec coverage: this plan covers the content document, versioning, seed, server brief, `memory.read`, read/edit project page and Agent summary. Evidence index, staleness, proposals and team concurrency are explicitly deferred to Plan 2.
- No placeholders: each task names exact files, interfaces, test command and commit; UI tasks specify props, state and behaviors; no TBD.
- Type consistency: `ProjectMemoryDocument` uses camelCase; Python responses use the same keys; `projectId`, `expectedRevision`, `contentHash`, `changeNote` are used consistently across tasks.
