"""Permanent CI guard for Project Epistemic Memory and Offline Grounding (GB/T 2260 & Scholarly DOI).

Covers Wave 26 (`#539` §12 — 22nd backend permanent CI guard / 33rd full-stack CI guard):
1. Epistemic Memory Priority, Deduplication, Belief-Graph Dirty Propagation & Compaction Hygiene:
   - Verifies priority ranking (`mother_insight` -> `preference` -> `cleaning_rule` -> `refuted_claim`
     -> `hypothesis`), `memoryKey` deduplication, character/item budget bounds, `EpistemicGraph`
     forward BFS staleness propagation (`mark_dirty` / `record_pivot` / `audit_completeness`), and
     strict stripping of forbidden brackets and private internal jargon.
2. Cross-Run Epistemic Memory Persistence, Upsert Deduplication & `memory_recalled` SSE Emission:
   - Exercises Run 1 (`milestone_gated` + `steer` -> `completed`) writing `ProjectEpistemicMemory`
     rows (`GET /api/projects/{pid}/epistemic-memory`), followed by Run 2 (`pi_autonomous`) on the
     same project recalling prior memories (`recalledMemory.recalledCount > 0`), emitting a clean
     Chinese `event: memory_recalled` SSE frame on `/autonomous-runs/{run_id}/stream`, and updating
     `(project_id, memory_key)` in-place without duplicate keys.
3. Strict Cross-Project & Cross-Tenant Epistemic Memory Physical Isolation:
   - Verifies zero memory leakage to a sibling project owned by the same user/team (`memories == []`,
     `recalledCount == 0`, zero `memory_recalled` SSE events) and `404 not_found` pure-Chinese
     rejection when a foreign tenant accesses `/epistemic-memory` or `/stream`.
4. Offline GB/T 2260 County Gazetteer Exact/Fuzzy Determinism & Regional Grounding Hygiene:
   - Validates all 3,212 administrative records (`34` provincial + `333` prefectural + `2,845` county
     units), exact 6-digit adcode lookup, fuzzy / suffix-stripped / multi-token Chinese name lookup,
     nonexistent region empty-match honesty, deterministic `receiptHash`, editorial purity across
     `caveats` & `matchedPatterns`, and HTTP `/grounding/counties` + cross-tenant `404` isolation.
5. Offline Scholarly Citation & DOI Verification Anti-Hallucination Guard (`EVIX_ENABLE_LIVE_SCHOLAR_API=0`):
   - Monkeypatches `httpx.get` to forbid any external network I/O, verifying curated classics resolve
     via exact DOI, URL-prefixed DOI, `altDois`, and bilingual keywords (`verified=True`), while
     unknown/fabricated DOIs, conflicting DOI+query pairs, malformed DOI syntax, and fabricated queries
     honestly return `verified=False`, `citation=None`, `matches=[]`, `evidence_refs=[]` with zero
     hallucinated journal/author metadata, zero forbidden brackets, and zero private jargon.
"""

from __future__ import annotations

from datetime import timezone
import json
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime

from application.providers import FixtureProvider
from evix_api.app import create_app
from infrastructure.database.models import Base
from infrastructure.settings import Settings
from multi_agent.context_memory import (
    compact_agent_messages,
    compact_chat_history,
    format_project_epistemic_memory,
)
from multi_agent.epistemic_graph import EpistemicGraph, EpistemicNode
from multi_agent.grounding_tools import (
    _OFFLINE_SCHOLARLY_FIXTURES,
    _load_county_gazetteer_index,
    lookup_county_gazetteer,
    validate_sampling_design_deff,
    verify_method_or_concept,
    verify_regional_context,
    verify_scholarly_citation,
)

ORIGIN = "http://localhost:3180"

FORBIDDEN_BRACKETS_RE = re.compile("[\u300c\u300d\u300e\u300f\u3010\u3011]")
PRIVATE_JARGON_RE = re.compile(
    r"\b(?:ReAct|DAG|EpistemicGraph|RunLease|BYOK|Bento|Atypica)\b|\u6c99\u76d2|\u7b97\u5b50",
    re.IGNORECASE,
)
CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
STACK_OR_EXCEPTION_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|\b(?:RuntimeError|ValueError|KeyError|TypeError|AttributeError|SQLAlchemyError"
    r"|IntegrityError|OperationalError|RequestValidationError)\b",
    re.IGNORECASE,
)
LOCAL_PATH_OR_URI_RE = re.compile(
    r"(?:(?<![A-Za-z])[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)


class _AwareSqDateTime(SqDateTime):
    """Ensure SQLite returns UTC-aware `datetime` objects matching PostgreSQL `TIMESTAMPTZ`."""

    def result_processor(self, dialect: Any, coltype: Any):
        base = super().result_processor(dialect, coltype)

        def _process(value: Any) -> Any:
            parsed = base(value) if base else value
            if parsed is not None and getattr(parsed, "tzinfo", None) is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed

        return _process


class _PgCompatCursor(sqlite3.Cursor):
    """Translate PostgreSQL `SET LOCAL ...` session statements into no-op `SELECT 1` on SQLite."""

    def execute(self, sql: str, parameters: Any = ()):
        if sql.lstrip().upper().startswith("SET LOCAL "):
            return super().execute("SELECT 1")
        return super().execute(sql, parameters)


class _PgCompatConnection(sqlite3.Connection):
    def cursor(self, *args: Any, **kwargs: Any):
        kwargs.setdefault("factory", _PgCompatCursor)
        return super().cursor(*args, **kwargs)


def _build_wal_sqlite_engine(db_file: Path):
    engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={
            "check_same_thread": False,
            "timeout": 15.0,
            "factory": _PgCompatConnection,
        },
    )
    engine.dialect.colspecs = {**engine.dialect.colspecs, sa.DateTime: _AwareSqDateTime}

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn: Any, _record: Any) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=10000")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _local: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _key: 1)

    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    invited = [
        "owner_a@example.test",
        "outsider_b@example.test",
    ]
    base: dict[str, Any] = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_memory_grounding_test",
        "allowed_origins": [ORIGIN],
        "invited_emails": invited,
        "auth_secret": secrets.token_hex(32),
        "keyring": {"v1": secrets.token_hex(32)},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "mailbox_dir": tmp_path / "mailbox",
        "sav_temp_dir": tmp_path / "sav-imports",
        "preflight_temp_dir": tmp_path / "preflight-imports",
    }
    base.update(overrides)
    return Settings(**base)


def _create_harness(tmp_path: Path, **setting_overrides: Any):
    settings = _make_settings(tmp_path, **setting_overrides)
    engine = _build_wal_sqlite_engine(tmp_path / f"mem_ground_{uuid4().hex[:8]}.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    app = create_app(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    lifespan_ctx = TestClient(app)
    lifespan_ctx.__enter__()
    opened_clients: list[TestClient] = []

    def login(email: str = "owner_a@example.test") -> tuple[TestClient, dict[str, Any]]:
        client = TestClient(app)
        opened_clients.append(client)
        r_code = client.post("/api/auth/code", headers={"origin": ORIGIN}, json={"email": email})
        assert r_code.status_code == 202, r_code.text
        cid = r_code.json()["challengeId"]
        r_ver = client.post(
            "/api/auth/verify",
            headers={"origin": ORIGIN},
            json={"challengeId": cid, "code": deliveries[cid][1]},
        )
        assert r_ver.status_code == 200, r_ver.text
        session_json = r_ver.json()
        client.headers.update({"origin": ORIGIN, "x-csrf-token": session_json["csrfToken"]})
        return client, session_json

    def create_project(client: TestClient, title: str) -> dict[str, Any]:
        teams_resp = client.get("/api/teams")
        assert teams_resp.status_code == 200, teams_resp.text
        team_id = teams_resp.json()["teams"][0]["id"]
        resp = client.post(
            "/api/projects",
            json={
                "idempotencyKey": str(uuid4()),
                "teamId": team_id,
                "title": title,
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        return body["project"] if "project" in body else body

    def cleanup() -> None:
        for c in opened_clients:
            c.close()
        lifespan_ctx.__exit__(None, None, None)
        engine.dispose()

    return app, settings, engine, login, create_project, cleanup


def _assert_no_editorial_or_path_leaks(value: Any, *, label: str) -> None:
    serialized = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    assert not FORBIDDEN_BRACKETS_RE.search(serialized), f"{label} leaked forbidden brackets: {serialized!r}"
    assert not PRIVATE_JARGON_RE.search(serialized), f"{label} leaked private jargon: {serialized!r}"
    assert not STACK_OR_EXCEPTION_RE.search(serialized), f"{label} leaked traceback/exception: {serialized!r}"
    assert not LOCAL_PATH_OR_URI_RE.search(serialized), f"{label} leaked local path/URI: {serialized!r}"


def _assert_clean_chinese_api_error(
    resp: Any,
    *,
    expected_status: int,
    expected_code: str,
) -> dict[str, str]:
    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    _assert_no_editorial_or_path_leaks(resp.text, label=f"HTTP {resp.status_code}")
    payload = resp.json()
    assert set(payload.keys()) == {"error"}
    err = payload["error"]
    assert set(err.keys()) == {"code", "message"}
    assert err["code"] == expected_code
    assert CHINESE_CHAR_RE.search(err["message"]), f"Error message lacks Chinese: {err['message']!r}"
    return err


def _parse_sse_frames(raw_sse: str) -> list[dict[str, Any]]:
    frames: list[dict[str, Any]] = []
    for block in raw_sse.strip().split("\n\n"):
        if not block.strip():
            continue
        event_name = ""
        data_json = ""
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_json = line.split(":", 1)[1].strip()
        if data_json:
            parsed = json.loads(data_json)
            assert parsed["eventType"] == event_name
            frames.append(parsed)
    return frames


# ---------------------------------------------------------------------------
# 1. Epistemic Memory Priority, Deduplication & Belief Graph Hygiene Guard
# ---------------------------------------------------------------------------


def test_epistemic_memory_priority_deduplication_and_working_memory_compaction_hygiene() -> None:
    assert format_project_epistemic_memory([]) == {
        "recalledCount": 0,
        "motherInsights": [],
        "cleaningRules": [],
        "refutedClaims": [],
        "steeringNotes": [],
        "items": [],
        "briefText": "",
    }

    raw_records = [
        {
            "memoryKey": "claim:h_subsidy",
            "kind": "hypothesis",
            "status": "active",
            "summary": "补贴感知正向预测采纳意向（稳健标准误显著）。",
            "snapshotRefs": ["snap_04"],
        },
        {
            "memoryKey": "refuted:h_naive_age",
            "kind": "refuted_claim",
            "status": "refuted",
            "summary": "\u3010\u539f\u5047\u8bbe\u8bc1\u4f2a\u3011\u6df7\u5408\u6837\u672c\u770b\u4f3c\u4e0d\u663e\u8457\uff0c\u5206\u5c42\u540e\u5448\u73b0\u300c\u8f9b\u666e\u68ee\u6096\u8bba\u300d\u3002",
            "snapshotRefs": ["snap_03"],
        },
        {
            "memoryKey": "cleaning:straightliner",
            "kind": "cleaning_rule",
            "status": "active",
            "summary": "剔除连续李克特零方差规律作答样本（影响 14 行）。",
            "snapshotRefs": ["snap_01"],
        },
        # Duplicate key with older/lower-priority payload must be deduplicated cleanly
        {
            "memoryKey": "cleaning:straightliner",
            "kind": "cleaning_rule",
            "status": "active",
            "summary": "旧版重复清洗记录（不应重复出现）。",
            "snapshotRefs": ["snap_old"],
        },
        {
            "memoryKey": "preference:steer_01",
            "kind": "preference",
            "status": "active",
            "summary": "\u5728 ReAct \u7b97\u5b50\u6c99\u76d2\u4e2d\u4f18\u5148\u6838\u67e5 DAG \u5b50\u7fa4\u4ea4\u4e92\u6548\u5e94\u3002",
            "snapshotRefs": [],
        },
        {
            "memoryKey": "mother_insight:core",
            "kind": "mother_insight",
            "status": "active",
            "summary": "独居与共居长者在信任机制上存在显著子群方向反转。",
            "snapshotRefs": ["snap_02", "snap_03"],
        },
    ]

    formatted = format_project_epistemic_memory(raw_records, max_items=10, max_chars=2400)
    assert formatted["recalledCount"] == 5
    # Exact priority order: mother_insight (0) -> preference (1) -> cleaning_rule (2) -> refuted_claim (3) -> hypothesis (4)
    assert [item["kind"] for item in formatted["items"]] == [
        "mother_insight",
        "preference",
        "cleaning_rule",
        "refuted_claim",
        "hypothesis",
    ]
    assert len({item["memoryKey"] for item in formatted["items"]}) == 5
    assert "旧版重复清洗记录" not in formatted["briefText"]
    assert len(formatted["motherInsights"]) == 1
    assert len(formatted["steeringNotes"]) == 1
    assert len(formatted["cleaningRules"]) == 1
    assert len(formatted["refutedClaims"]) == 1
    _assert_no_editorial_or_path_leaks(formatted, label="format_project_epistemic_memory")

    # Tight budget enforcement
    tight = format_project_epistemic_memory(raw_records, max_items=2, max_chars=160)
    assert 1 <= tight["recalledCount"] <= 2
    assert len(tight["briefText"]) <= 160

    # EpistemicGraph forward BFS staleness propagation & completeness gate
    graph = EpistemicGraph(project_id="proj-guard-01")
    graph.upsert_node(node_id="q1", kind="question", label="核心研究问题", status="verified")
    graph.upsert_node(node_id="c_trust", kind="construct", label="技术信任构念", status="verified", snapshot_ids=["s1"])
    graph.upsert_node(node_id="h_main", kind="claim", label="主效应假设", status="verified", snapshot_ids=["s2"])
    graph.upsert_node(node_id="mi_1", kind="mother_insight", label="核心母洞察", status="verified", snapshot_ids=["s2"])
    graph.add_edge("c_trust", "h_main", "supports")
    graph.add_edge("h_main", "mi_1", "synthesizes")

    # Before falsification_check exists, completeness must fail closed
    pre_audit = graph.audit_completeness()
    assert pre_audit["passed"] is False
    assert pre_audit["hasFalsificationCheck"] is False

    # Recording a pivot on c_trust marks downstream claim & mother_insight dirty via BFS
    dirty_ids = graph.record_pivot(
        old_node_id="c_trust",
        new_node=EpistemicNode(
            id="c_trust_purified",
            kind="construct",
            label="\u3010\u51c0\u5316\u540e\u6784\u5ff5\u3011\u5254\u9664\u53cd\u5411\u6c61\u67d3\u9898\u9879",
            status="verified",
            summary="CITC 提升至 0.68，Cronbach α 提升至 0.86。",
            snapshot_ids=["s3"],
        ),
        reason="剔除负向 CITC 题项后重估下游路径",
        refute_old=False,
    )
    assert set(dirty_ids) == {"h_main", "mi_1"}
    assert graph.nodes["c_trust"].status == "pivoted"
    assert graph.audit_completeness()["passed"] is False
    _assert_no_editorial_or_path_leaks(graph.to_dict(), label="EpistemicGraph.to_dict")

    # Re-verifying downstream nodes and adding falsification_check closes completeness gate
    graph.upsert_node(node_id="h_main", kind="claim", label="修正后主效应结论", status="verified", snapshot_ids=["s4"])
    graph.upsert_node(node_id="mi_1", kind="mother_insight", label="修正后核心母洞察", status="verified", snapshot_ids=["s4"])
    graph.upsert_node(node_id="fc_1", kind="falsification_check", label="异质性反证通过", status="verified", snapshot_ids=["s5"])
    post_audit = graph.audit_completeness()
    assert post_audit["passed"] is True
    assert post_audit["dirtyNodes"] == []
    assert post_audit["unsupportedClaims"] == []

    # Working-memory compaction preserves [system, user] head + atomic assistant/tool tail
    msgs: list[dict[str, Any]] = [
        {"role": "system", "content": "系统研究规范"},
        {"role": "user", "content": "初始研究目标"},
    ]
    for idx in range(8):
        msgs.append(
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [{"id": f"call_{idx}", "name": "inspect_distribution", "arguments": {}}],
            }
        )
        msgs.append(
            {
                "role": "tool",
                "tool_call_id": f"call_{idx}",
                "name": "inspect_distribution",
                "content": json.dumps(
                    {"snapshot_id": f"snap_{idx}", "diagnostics": ["LOW_CITC_ITEM:Q_trap"]},
                    ensure_ascii=False,
                ),
            }
        )
    compacted, brief = compact_agent_messages(msgs, max_messages=8, keep_recent_messages=4)
    assert brief is not None
    assert brief.dropped_count > 0
    assert "inspect_distribution" in brief.completed_operators
    assert "snap_0" in brief.verified_snapshots
    assert compacted[2]["role"] == "assistant"
    _assert_no_editorial_or_path_leaks(brief.brief_text, label="WorkingMemoryBrief.brief_text")

    chat_wm = compact_chat_history(
        [{"role": "user", "text": "\u3010\u8bf7\u6c42\u3011\u8bf7\u7528\u7b97\u5b50\u6c99\u76d2\u6838\u67e5\u300c\u4fe1\u5ea6\u300d"}],
        max_chars=240,
    )
    assert chat_wm["droppedCount"] == 1
    _assert_no_editorial_or_path_leaks(chat_wm, label="compact_chat_history")


# ---------------------------------------------------------------------------
# 2. Cross-Run Persistence, Upsert Deduplication & `memory_recalled` SSE Guard
# ---------------------------------------------------------------------------


def test_cross_run_epistemic_memory_persistence_dedup_and_memory_recalled_sse_stream(
    tmp_path: Path,
) -> None:
    _app, _settings, _engine, login, create_project, cleanup = _create_harness(tmp_path)
    try:
        owner_a, _ = login("owner_a@example.test")
        proj = create_project(owner_a, "跨运行认知记忆持久化与召回核验课题")
        pid = proj["id"]

        # Initially project epistemic memory is empty
        r_mem_init = owner_a.get(f"/api/projects/{pid}/epistemic-memory")
        assert r_mem_init.status_code == 200, r_mem_init.text
        assert r_mem_init.json() == {"memories": []}

        # Run 1: milestone_gated -> steer with explicit Chinese steering note -> completed
        steer_text = "后续轮次须重点对比独居与共居老年群体在防跌倒服务上的异质性斜率"
        r_run1 = owner_a.post(
            f"/api/projects/{pid}/autonomous-runs",
            json={
                "idempotencyKey": str(uuid4()),
                "goal": "首轮基准探索并写入跨运行认知记忆",
                "geography": "浙江省湖州市安吉县",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "milestone_gated",
                "maxToolCalls": 28,
            },
        )
        assert r_run1.status_code == 201, r_run1.text
        run1_paused = r_run1.json()
        run1_id = run1_paused["runId"]
        assert run1_paused["status"] == "awaiting_milestone"
        assert run1_paused["recalledMemory"]["recalledCount"] == 0

        # Cold-start stream must NOT emit memory_recalled
        r_stream1_pre = owner_a.get(f"/api/projects/{pid}/autonomous-runs/{run1_id}/stream", params={"afterSeq": 0})
        assert r_stream1_pre.status_code == 200
        frames_run1_pre = _parse_sse_frames(r_stream1_pre.text)
        assert frames_run1_pre[0]["eventType"] == "run_started"
        assert all(f["eventType"] != "memory_recalled" for f in frames_run1_pre)

        # While paused at awaiting_milestone, an active evidence_gap memory is already persisted
        mems_paused = owner_a.get(f"/api/projects/{pid}/epistemic-memory").json()["memories"]
        assert any(m["kind"] == "evidence_gap" and m["status"] == "active" for m in mems_paused)

        # Resume Run 1 with steeringNote -> completed
        r_run1_done = owner_a.post(
            f"/api/projects/{pid}/autonomous-runs/{run1_id}/resume",
            json={
                "expectedRevision": run1_paused["revision"],
                "decision": "steer",
                "steeringNote": steer_text,
            },
        )
        assert r_run1_done.status_code == 200, r_run1_done.text
        run1_done = r_run1_done.json()
        assert run1_done["status"] == "completed"

        # Inspect persisted memories after Run 1 completion
        r_mem_after1 = owner_a.get(f"/api/projects/{pid}/epistemic-memory")
        assert r_mem_after1.status_code == 200, r_mem_after1.text
        _assert_no_editorial_or_path_leaks(r_mem_after1.text, label="GET /epistemic-memory after Run 1")
        mems_after1 = r_mem_after1.json()["memories"]
        assert len(mems_after1) >= 4
        keys_after1 = [m["memoryKey"] for m in mems_after1]
        assert len(keys_after1) == len(set(keys_after1)), "Duplicate memoryKey rows found after Run 1"
        kinds_after1 = {m["kind"] for m in mems_after1}
        assert "mother_insight" in kinds_after1
        assert "preference" in kinds_after1
        assert any(steer_text in m["summary"] for m in mems_after1 if m["kind"] == "preference")
        for m in mems_after1:
            assert m["projectId"] == pid
            assert CHINESE_CHAR_RE.search(m["summary"]), f"Memory summary lacks Chinese: {m}"

        # Run 2 on the SAME project: recalls Run 1 memories & emits memory_recalled SSE event
        r_run2 = owner_a.post(
            f"/api/projects/{pid}/autonomous-runs",
            json={
                "idempotencyKey": str(uuid4()),
                "goal": "次轮探索验证跨运行记忆召回与去重更新",
                "geography": "浙江省湖州市安吉县",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "pi_autonomous",
                "maxToolCalls": 28,
            },
        )
        assert r_run2.status_code == 201, r_run2.text
        run2_done = r_run2.json()
        run2_id = run2_done["runId"]
        assert run2_done["status"] == "completed"

        recalled = run2_done["recalledMemory"]
        assert recalled["recalledCount"] >= 4
        assert len(recalled["motherInsights"]) >= 1
        assert any(steer_text in note for note in recalled["steeringNotes"])
        _assert_no_editorial_or_path_leaks(recalled, label="Run 2 recalledMemory")

        # Verify SSE stream on Run 2 contains deterministic `memory_recalled` event at seq=2
        r_stream2 = owner_a.get(f"/api/projects/{pid}/autonomous-runs/{run2_id}/stream", params={"afterSeq": 0})
        assert r_stream2.status_code == 200
        _assert_no_editorial_or_path_leaks(r_stream2.text, label="Run 2 SSE stream")
        frames_run2 = _parse_sse_frames(r_stream2.text)
        assert frames_run2[0]["eventType"] == "run_started"
        recall_frames = [f for f in frames_run2 if f["eventType"] == "memory_recalled"]
        assert len(recall_frames) == 1
        recall_ev = recall_frames[0]
        assert recall_ev["seq"] == 2
        assert recall_ev["payload"]["recalledCount"] == recalled["recalledCount"]
        assert any(steer_text in s for s in recall_ev["payload"]["steeringNotes"])
        assert CHINESE_CHAR_RE.search(recall_ev["payload"]["briefText"])

        # Verify (project_id, memory_key) upsert deduplication after Run 2
        mems_after2 = owner_a.get(f"/api/projects/{pid}/epistemic-memory").json()["memories"]
        keys_after2 = [m["memoryKey"] for m in mems_after2]
        assert len(keys_after2) == len(set(keys_after2)), "Upsert created duplicate memoryKey rows in Run 2"
        # Shared deterministic keys (e.g. cleaning rules / claims) updated runId to run2_id in-place,
        # while Run 1's unique steering preference remains preserved!
        assert any(m["runId"] == run2_id for m in mems_after2)
        assert any(steer_text in m["summary"] for m in mems_after2 if m["kind"] == "preference")
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 3. Cross-Project & Cross-Tenant Physical Isolation Guard
# ---------------------------------------------------------------------------


def test_epistemic_memory_strict_cross_project_and_cross_tenant_isolation(tmp_path: Path) -> None:
    _app, _settings, _engine, login, create_project, cleanup = _create_harness(tmp_path)
    try:
        owner_a, _ = login("owner_a@example.test")
        outsider_b, _ = login("outsider_b@example.test")

        proj_a1 = create_project(owner_a, "租户A源记忆课题")
        proj_a2 = create_project(owner_a, "租户A同队平行隔离课题")
        proj_b1 = create_project(outsider_b, "租户B外部独立课题")
        pid_a1, pid_a2, pid_b1 = proj_a1["id"], proj_a2["id"], proj_b1["id"]

        # Populate proj_a1 with confidential project-scoped epistemic memories
        secret_steer_marker = "仅限源课题内部使用的专项分层抽样纠偏备注9527"
        r_a1_pause = owner_a.post(
            f"/api/projects/{pid_a1}/autonomous-runs",
            json={
                "idempotencyKey": str(uuid4()),
                "goal": "生成源课题专属认知记忆",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "milestone_gated",
                "maxToolCalls": 28,
            },
        )
        assert r_a1_pause.status_code == 201, r_a1_pause.text
        run_a1_id = r_a1_pause.json()["runId"]
        r_a1_done = owner_a.post(
            f"/api/projects/{pid_a1}/autonomous-runs/{run_a1_id}/resume",
            json={
                "expectedRevision": 1,
                "decision": "steer",
                "steeringNote": secret_steer_marker,
            },
        )
        assert r_a1_done.status_code == 200, r_a1_done.text
        assert len(owner_a.get(f"/api/projects/{pid_a1}/epistemic-memory").json()["memories"]) >= 4

        # 3a. Sibling project owned by the SAME user/team must have ZERO memories & ZERO recall
        r_mem_a2 = owner_a.get(f"/api/projects/{pid_a2}/epistemic-memory")
        assert r_mem_a2.status_code == 200, r_mem_a2.text
        assert r_mem_a2.json() == {"memories": []}

        r_run_a2 = owner_a.post(
            f"/api/projects/{pid_a2}/autonomous-runs",
            json={
                "idempotencyKey": str(uuid4()),
                "goal": "验证同租户跨项目零串扰",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "milestone_gated",
                "maxToolCalls": 28,
            },
        )
        assert r_run_a2.status_code == 201, r_run_a2.text
        run_a2 = r_run_a2.json()
        assert run_a2["recalledMemory"]["recalledCount"] == 0
        assert secret_steer_marker not in r_run_a2.text
        r_stream_a2 = owner_a.get(
            f"/api/projects/{pid_a2}/autonomous-runs/{run_a2['runId']}/stream",
            params={"afterSeq": 0},
        )
        assert all(f["eventType"] != "memory_recalled" for f in _parse_sse_frames(r_stream_a2.text))

        # 3b. Foreign tenant outsider_b attempting to read proj_a1 memories or stream -> 404 pure Chinese
        r_foreign_mem = outsider_b.get(f"/api/projects/{pid_a1}/epistemic-memory")
        _assert_clean_chinese_api_error(r_foreign_mem, expected_status=404, expected_code="not_found")

        r_foreign_stream = outsider_b.get(
            f"/api/projects/{pid_a1}/autonomous-runs/{run_a1_id}/stream",
            params={"afterSeq": 0},
        )
        _assert_clean_chinese_api_error(r_foreign_stream, expected_status=404, expected_code="not_found")

        # Foreign tenant running on own project proj_b1 recalls ZERO memories from proj_a1
        r_run_b1 = outsider_b.post(
            f"/api/projects/{pid_b1}/autonomous-runs",
            json={
                "idempotencyKey": str(uuid4()),
                "goal": "验证跨租户运行零记忆串扰",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "milestone_gated",
                "maxToolCalls": 28,
            },
        )
        assert r_run_b1.status_code == 201, r_run_b1.text
        assert r_run_b1.json()["recalledMemory"]["recalledCount"] == 0
        assert secret_steer_marker not in r_run_b1.text
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 4. Offline GB/T 2260 County Gazetteer & Regional Grounding Determinism Guard
# ---------------------------------------------------------------------------


def test_offline_county_gazetteer_gbt2260_exact_fuzzy_and_http_determinism(tmp_path: Path) -> None:
    idx = _load_county_gazetteer_index()
    cov = idx["coverage"]
    assert cov["provinceCount"] == 34
    assert cov["prefectureCount"] == 333
    assert cov["countyCount"] == 2845
    assert len(idx["records"]) == 34 + 333 + 2845
    assert cov["provinceOnlyCodes"] == ["710000", "810000", "820000"]
    assert isinstance(idx["catalogVersion"], str) and idx["catalogVersion"]

    # 4a. Exact 6-digit GB/T 2260 administrative code resolution
    exact_cases = (
        ("330106", "西湖区", "county", "浙江省", "杭州市"),
        ("330523", "安吉县", "county", "浙江省", "湖州市"),
        ("110108", "海淀区", "county", "北京市", ""),
        ("710000", "台湾省", "province", "台湾省", ""),
    )
    for code, exp_name, exp_level, exp_prov, exp_pref in exact_cases:
        res_a = lookup_county_gazetteer(query=code, limit=5)
        res_b = lookup_county_gazetteer(query=code, limit=5)
        assert res_a.classification == "actual"
        assert res_a.data["receiptHash"] == res_b.data["receiptHash"]
        assert f"adcode:{code}" in res_a.evidence_refs
        top = res_a.data["matches"][0]
        assert top["code"] == code
        assert top["name"] == exp_name
        assert top["level"] == exp_level
        assert top["provinceName"] == exp_prov
        if exp_pref:
            assert top["prefectureName"] == exp_pref
        assert len(res_a.data["caveats"]) >= 3
        _assert_no_editorial_or_path_leaks(res_a.data, label=f"gazetteer[{code}]")

    # 4b. Fuzzy / suffix-stripped / composite province-prefecture-county Chinese queries
    fuzzy_anji = lookup_county_gazetteer(query="安吉", limit=5).data
    assert fuzzy_anji["matches"][0]["code"] == "330523"
    assert fuzzy_anji["matches"][0]["name"] == "安吉县"
    assert fuzzy_anji["matches"][0]["provinceName"] == "浙江省"
    assert fuzzy_anji["matches"][0]["prefectureName"] == "湖州市"

    composite_q = lookup_county_gazetteer(query="浙江 杭州 西湖区", limit=3).data
    assert any(m["code"] == "330106" and m["name"] == "西湖区" for m in composite_q["matches"])
    _assert_no_editorial_or_path_leaks(composite_q, label="gazetteer[浙江 杭州 西湖区]")

    # 4c. Nonexistent adcode / fictional county returns empty matches honestly (zero fabrication)
    fictional_geo = lookup_county_gazetteer(query="亚特兰蒂斯虚构自治县", limit=5)
    assert fictional_geo.evidence_refs == []
    assert fictional_geo.data["matches"] == []
    assert len(fictional_geo.data["caveats"]) >= 3

    unknown_code = lookup_county_gazetteer(query="999999", limit=5)
    assert unknown_code.data["matches"] == []

    # 4d. Companion regional context, knowledge method & Deff sample-size grounding purity
    reg_ctx = verify_regional_context(geography="县域", topic_keywords="养老 社区")
    method_ctx = verify_method_or_concept(query="分层抽样 样本量 Deff")
    deff_ctx = validate_sampling_design_deff(confidence=0.95, margin=0.05, proportion=0.5, design_effect=1.35, valid_rate=0.90)
    assert deff_ctx.data["srsBaseline"] == 385
    assert deff_ctx.data["requiredCompletes"] == 519
    assert deff_ctx.data["plannedContacts"] == 577
    _assert_no_editorial_or_path_leaks(reg_ctx.data, label="verify_regional_context")
    _assert_no_editorial_or_path_leaks(method_ctx.data, label="verify_method_or_concept")
    _assert_no_editorial_or_path_leaks(deff_ctx.data, label="validate_sampling_design_deff")

    # 4e. Live HTTP `/grounding/counties` determinism & cross-tenant 404 isolation
    _app, _settings, _engine, login, create_project, cleanup = _create_harness(tmp_path)
    try:
        owner_a, _ = login("owner_a@example.test")
        outsider_b, _ = login("outsider_b@example.test")
        proj_a = create_project(owner_a, "县域风物志接口核验课题")
        pid_a = proj_a["id"]

        r_http_geo1 = owner_a.get(f"/api/projects/{pid_a}/grounding/counties", params={"q": "安吉", "limit": 3})
        r_http_geo2 = owner_a.get(f"/api/projects/{pid_a}/grounding/counties", params={"q": "安吉", "limit": 3})
        assert r_http_geo1.status_code == 200, r_http_geo1.text
        _assert_no_editorial_or_path_leaks(r_http_geo1.text, label="GET /grounding/counties")
        g_json1, g_json2 = r_http_geo1.json(), r_http_geo2.json()
        assert g_json1 == g_json2
        assert g_json1["matches"][0]["code"] == "330523"
        assert "adcode:330523" in g_json1["evidenceRefs"]

        r_foreign_geo = outsider_b.get(f"/api/projects/{pid_a}/grounding/counties", params={"q": "安吉", "limit": 3})
        _assert_clean_chinese_api_error(r_foreign_geo, expected_status=404, expected_code="not_found")
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 5. Offline Scholarly Citation & DOI Anti-Hallucination Guard
# ---------------------------------------------------------------------------


def test_offline_scholarly_citation_honesty_zero_network_and_anti_hallucination_guard(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EVIX_ENABLE_LIVE_SCHOLAR_API", "0")

    def _forbid_external_http(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Offline scholarly verification must NEVER invoke external httpx.get")

    monkeypatch.setattr(httpx, "get", _forbid_external_http)

    # Audit all 16 curated offline scholarly fixtures for schema & editorial hygiene
    assert len(_OFFLINE_SCHOLARLY_FIXTURES) >= 16
    for entry in _OFFLINE_SCHOLARLY_FIXTURES:
        assert isinstance(entry["doi"], str) and entry["doi"].startswith("10.")
        assert isinstance(entry["title"], str) and entry["title"].strip()
        assert isinstance(entry["authors"], list) and len(entry["authors"]) >= 1
        assert isinstance(entry["year"], int) and 1900 <= entry["year"] <= 2030
        assert isinstance(entry["venue"], str) and entry["venue"].strip()
        _assert_no_editorial_or_path_leaks(entry, label=f"scholarly_fixture[{entry['doi']}]")

    # 5a. Verified offline classics: URL-prefixed DOI, doi: prefix, altDois alias, and bilingual keywords
    r_cronbach = verify_scholarly_citation(doi="https://doi.org/10.1007/BF02310555")
    assert r_cronbach.data["verified"] is True
    assert r_cronbach.data["source"] == "offline_curated_catalog"
    assert r_cronbach.data["citation"]["doi"] == "10.1007/BF02310555"
    assert r_cronbach.data["citation"]["year"] == 1951
    assert r_cronbach.data["citation"]["venue"] == "Psychometrika"
    assert r_cronbach.evidence_refs == ["doi:10.1007/BF02310555"]

    # altDois resolution (Fornell & Larcker 1981 JSTOR alias -> canonical JMR DOI)
    r_fornell_alt = verify_scholarly_citation(doi="doi: 10.2307/3151312")
    assert r_fornell_alt.data["verified"] is True
    assert r_fornell_alt.data["citation"]["doi"] == "10.1177/002224378101800104"
    assert "Fornell, C." in r_fornell_alt.data["citation"]["authors"]

    # Bilingual keyword query resolution without DOI
    r_kw = verify_scholarly_citation(query="共同方法偏差 Podsakoff Harman")
    assert r_kw.data["verified"] is True
    assert r_kw.data["source"] == "offline_curated_catalog"
    assert r_kw.data["citation"]["doi"] == "10.1037/0021-9010.88.5.879"

    # 5b. Unverified / nonexistent DOIs & fabricated queries MUST return verified=False with ZERO fabricated metadata
    unverified_offline_cases = (
        {"doi": "10.9999/nonexistent-fabricated-paper-2099"},
        {"doi": "https://dx.doi.org/10.1038/s41586-099-99999-z"},
        # Unknown DOI paired with a known keyword MUST NOT falsely claim the unknown DOI is verified!
        {"doi": "10.9999/conflict-unverified-doi-2026", "query": "Cronbach alpha Psychometrika"},
        {"query": "2099年虚构量子元宇宙消费者神经感应调研方法学胡编作者"},
    )
    for params in unverified_offline_cases:
        res = verify_scholarly_citation(**params)
        assert res.evidence_refs == [], f"Unverified lookup must emit zero evidence_refs: {params}"
        assert res.data["verified"] is False, f"Unverified lookup falsely marked verified=True: {params}"
        assert res.data["source"] == "offline_only_not_found"
        assert res.data["reason"] == "not_in_verified_catalog_live_lookup_disabled"
        assert res.data["citation"] is None, f"Unverified lookup fabricated citation object: {res.data}"
        assert res.data["matches"] == [], f"Unverified lookup fabricated match list: {res.data}"
        _assert_no_editorial_or_path_leaks(res.data, label=f"unverified_citation[{params}]")

    # 5c. Malformed DOI syntax is rejected as invalid_doi_format (never queried or fabricated)
    for bad_doi in ("not-a-doi-at-all", "10.12/registrant-too-short", "doi:http://example.com/paper"):
        bad_res = verify_scholarly_citation(doi=bad_doi)
        assert bad_res.evidence_refs == []
        assert bad_res.data["verified"] is False
        assert bad_res.data["source"] == "invalid_doi_format"
        assert bad_res.data["reason"] == "invalid_doi_syntax"
        assert bad_res.data["citation"] is None
        assert bad_res.data["matches"] == []

    # 5d. Live HTTP `/grounding/verify-citation` verified vs unverified honesty & cross-tenant 404 isolation
    _app, _settings, _engine, login, create_project, cleanup = _create_harness(tmp_path)
    try:
        owner_a, _ = login("owner_a@example.test")
        outsider_b, _ = login("outsider_b@example.test")
        proj_a = create_project(owner_a, "离线文献与DOI诚实核验课题")
        pid_a = proj_a["id"]

        r_http_ok = owner_a.post(
            f"/api/projects/{pid_a}/grounding/verify-citation",
            json={"doi": "10.1093/biomet/80.1.27"},
        )
        assert r_http_ok.status_code == 200, r_http_ok.text
        _assert_no_editorial_or_path_leaks(r_http_ok.text, label="POST /grounding/verify-citation (verified)")
        ok_body = r_http_ok.json()
        assert ok_body["verified"] is True
        assert ok_body["source"] == "offline_curated_catalog"
        assert ok_body["citation"]["authors"] == ["Firth, D."]
        assert ok_body["evidenceRefs"] == ["doi:10.1093/biomet/80.1.27"]

        r_http_unverified = owner_a.post(
            f"/api/projects/{pid_a}/grounding/verify-citation",
            json={"doi": "10.8888/unverified-offline-doi-2026", "query": "虚构期刊与作者核验"},
        )
        assert r_http_unverified.status_code == 200, r_http_unverified.text
        _assert_no_editorial_or_path_leaks(
            r_http_unverified.text,
            label="POST /grounding/verify-citation (unverified)",
        )
        unv_body = r_http_unverified.json()
        assert unv_body["verified"] is False
        assert unv_body["source"] == "offline_only_not_found"
        assert unv_body["citation"] is None
        assert unv_body["matches"] == []
        assert unv_body["evidenceRefs"] == []

        r_foreign_cit = outsider_b.post(
            f"/api/projects/{pid_a}/grounding/verify-citation",
            json={"doi": "10.1007/BF02310555"},
        )
        _assert_clean_chinese_api_error(r_foreign_cit, expected_status=404, expected_code="not_found")
    finally:
        cleanup()
