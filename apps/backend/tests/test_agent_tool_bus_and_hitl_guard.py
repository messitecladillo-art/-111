"""Permanent CI guard for the 47-tool Agent bus, malformed tool-call containment, and HITL state machines.

Covers Wave 25 (`#517` §12 — 20th backend permanent CI guard / 30th full-stack CI guard):
1. Registered Tool Bus Metadata & JSON Schema Hygiene (`multi_agent.tool_registry` + `GET /api/agent/tools`):
   - Validates all 47 `ToolSpec` definitions across all 6 groups (`isa`, `epistemic`, `reviewer`,
     `orchestrator`, `sandbox`, `grounding`), JSON Schema structural invariants, provider serializer
     parity (`agent`, `openai`, `gemini`, `anthropic`), pure-Chinese user-facing copy, zero forbidden
     brackets, and zero private internal engineering jargon.
2. Tool Executor & Statistical Bus Malformed/Out-of-Bounds Injection Containment (`run_react_step_loop`):
   - Injects missing required args, nonexistent columns, out-of-bounds item counts, runtime exceptions
     containing raw brackets/jargon, disallowed tool names, and malformed tool-call envelopes, verifying
     sanitized Chinese error observations and fail-closed validation with zero uncaught tracebacks.
3. Chat & Autonomous Research HTTP Boundary Injection Resilience:
   - Injects missing args, out-of-bounds numbers (`maxToolCalls=0/3/-5/999`, `step=1/99`, `limit=0/99`),
     wrong types (`maxToolCalls="twenty"`, `maxToolCalls=["bad"]`, `goal=12345`, `script=["bad"]`),
     invalid enums, and AST-forbidden Python imports into `/api/agent/turns`, `/autonomous-runs`,
     `/sandbox/plot`, `/sandbox/stat`, `/grounding/verify-citation`, and `/grounding/counties`, plus
     `agent_chat.parse_reply` action filtering, asserting pure-Chinese `4xx` `ApiError` envelopes with
     zero `500` crashes, zero Python tracebacks, and zero host path/URI leaks.
4. Autonomous Research Milestone HITL State Machine (`/autonomous-runs` `milestone_gated`):
   - Exercises `awaiting_milestone` -> `approve` / `steer` -> `completed` and `abort` / `/cancel` ->
     `cancelled`, stale-revision `409 revision_conflict`, duplicate terminal confirmation/cancel
     `409 invalid_transition`, invalid decision `422`, and cross-tenant `404 not_found` isolation.
5. Multi-Agent Workflow Task HITL State Machine (`/agent-tasks` `approval` / `input` / `cancel`):
   - Exercises `needs_input` (`approve_reviewer` & `upload_real_data`) -> revise / approve -> `completed`,
     live in-flight execution `/cancel` -> `cancelled`, duplicate confirmation/cancel `409` interception,
     and cross-tenant `404 not_found` isolation.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timezone
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime

from application.providers import FixtureProvider
from application.services.autonomous_research import build_planted_trap_benchmark
from application.workflow_data_tools import build_inline_sandbox
from evix_api.app import create_app
from infrastructure.database.models import Base
from infrastructure.settings import Settings
from multi_agent.agents.contracts import ToolResult
from multi_agent.agents.research_agent.services import agent_chat as chat_domain
from multi_agent.react_loop import run_react_step_loop
from multi_agent.roles import AgentRole
from multi_agent.tool_registry import (
    ToolSpec,
    all_tool_specs,
    chat_orchestrator_tool_specs,
    epistemic_tool_specs,
    grounding_tool_specs,
    isa_tool_specs,
    public_tool_catalog,
    reviewer_tool_specs,
    sandbox_tool_specs,
    to_agent_tools,
    to_anthropic_tools,
    to_gemini_function_declarations,
    to_openai_tools,
)
from multi_agent.workflow import AgentResult, ReviewDecision

ORIGIN = "http://localhost:3180"

FORBIDDEN_BRACKETS_RE = re.compile("[\u300c\u300d\u300e\u300f\u3010\u3011]")
PRIVATE_JARGON_RE = re.compile(
    r"\b(?:ReAct|DAG|EpistemicGraph|RunLease|BYOK|Bento|Atypica)\b|\u6c99\u76d2|\u7b97\u5b50",
    re.IGNORECASE,
)
CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
SNAKE_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
STACK_OR_EXCEPTION_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|\b(?:RuntimeError|ValueError|KeyError|TypeError|AttributeError|SQLAlchemyError"
    r"|IntegrityError|OperationalError|RequestValidationError)\b",
    re.IGNORECASE,
)
LOCAL_PATH_OR_URI_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)

ALLOWED_JSON_SCHEMA_TYPES = frozenset(("string", "integer", "number", "boolean", "array", "object"))


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
        "teammate_a@example.test",
        "outsider@example.test",
    ]
    base: dict[str, Any] = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_tool_hitl_test",
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


def _create_harness(
    tmp_path: Path,
    *,
    workflow_handlers: dict[Any, Any] | None = None,
    **setting_overrides: Any,
):
    settings = _make_settings(tmp_path, **setting_overrides)
    engine = _build_wal_sqlite_engine(tmp_path / f"tool_hitl_{uuid4().hex[:8]}.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    app = create_app(
        settings,
        mail=_mailer,
        provider=FixtureProvider(),
        engine=engine,
        workflow_handlers=workflow_handlers,
    )
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

    def create_project(client: TestClient, title: str = "工具总线与人工审阅测试课题") -> dict[str, Any]:
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


def _assert_pure_chinese_prose(text: str, *, label: str) -> None:
    assert isinstance(text, str) and text.strip(), f"{label} must be non-empty"
    assert CHINESE_CHAR_RE.search(text), f"{label} must contain Chinese prose: {text!r}"
    assert not FORBIDDEN_BRACKETS_RE.search(text), f"{label} contains forbidden brackets: {text!r}"
    assert not PRIVATE_JARGON_RE.search(text), f"{label} leaks private jargon: {text!r}"
    assert not STACK_OR_EXCEPTION_RE.search(text), f"{label} leaks exception/traceback: {text!r}"
    assert not LOCAL_PATH_OR_URI_RE.search(text), f"{label} leaks local path or DB URI: {text!r}"


def _assert_clean_chinese_api_error(
    resp: Any,
    *,
    expected_status: int | tuple[int, ...],
    expected_code: str | None = None,
) -> dict[str, str]:
    allowed = (expected_status,) if isinstance(expected_status, int) else expected_status
    assert resp.status_code != 500, f"Unexpected 500 response: {resp.text}"
    assert resp.status_code in allowed, (
        f"Expected HTTP {allowed}, got {resp.status_code}: {resp.text}"
    )
    raw_text = resp.text
    assert not STACK_OR_EXCEPTION_RE.search(raw_text), f"Traceback/exception leaked: {raw_text}"
    assert not LOCAL_PATH_OR_URI_RE.search(raw_text), f"Host path/DB URI leaked: {raw_text}"
    assert not FORBIDDEN_BRACKETS_RE.search(raw_text), f"Forbidden brackets leaked: {raw_text}"
    assert not PRIVATE_JARGON_RE.search(raw_text), f"Private jargon leaked: {raw_text}"

    payload = resp.json()
    assert set(payload.keys()) == {"error"}, f"Unexpected error envelope keys: {payload}"
    err = payload["error"]
    assert isinstance(err, dict) and set(err.keys()) == {"code", "message"}, payload
    assert isinstance(err["code"], str) and err["code"].strip()
    if expected_code is not None:
        assert err["code"] == expected_code, f"Expected code {expected_code!r}, got {err['code']!r}: {payload}"
    _assert_pure_chinese_prose(err["message"], label=f"HTTP {resp.status_code} ({err['code']})")
    return err


def _validate_json_schema_node(schema: dict[str, Any], *, path: str, top_level: bool = False) -> None:
    assert isinstance(schema, dict), f"{path}: schema must be dict"
    if not top_level:
        desc = schema.get("description")
        if desc is not None:
            _assert_pure_chinese_prose(desc, label=f"{path}.description")

    for union_kw in ("anyOf", "oneOf"):
        if union_kw in schema:
            variants = schema[union_kw]
            assert isinstance(variants, list) and len(variants) >= 2, f"{path}: {union_kw} must have >=2 branches"
            for idx, branch in enumerate(variants):
                _validate_json_schema_node(branch, path=f"{path}.{union_kw}[{idx}]", top_level=False)
            return

    node_type = schema.get("type")
    assert node_type in ALLOWED_JSON_SCHEMA_TYPES, f"{path}: invalid schema type {node_type!r}"

    if top_level:
        assert node_type == "object", f"{path}: root tool parameters must be type='object'"
        assert schema.get("additionalProperties") is False, f"{path}: root must set additionalProperties=False"

    if "enum" in schema:
        enum_vals = schema["enum"]
        assert isinstance(enum_vals, list) and len(enum_vals) >= 1, f"{path}: enum must be non-empty list"
        assert len(enum_vals) == len(set(enum_vals)), f"{path}: duplicate enum entries"

    if node_type == "object":
        props = schema.get("properties")
        if top_level or props is not None:
            assert isinstance(props, dict), f"{path}: object schema missing properties dict"
            req = schema.get("required", [])
            assert isinstance(req, list), f"{path}: required must be list"
            assert len(req) == len(set(req)), f"{path}: duplicate required keys"
            assert set(req).issubset(set(props.keys())), (
                f"{path}: required keys {set(req) - set(props.keys())} missing from properties"
            )
            for prop_name, prop_schema in props.items():
                assert isinstance(prop_name, str) and prop_name.strip(), f"{path}: empty property name"
                if top_level:
                    assert isinstance(prop_schema, dict) and isinstance(prop_schema.get("description"), str), (
                        f"{path}.{prop_name}: top-level tool parameter must include Chinese description"
                    )
                _validate_json_schema_node(prop_schema, path=f"{path}.{prop_name}", top_level=False)

    if node_type == "array":
        items = schema.get("items")
        assert isinstance(items, dict), f"{path}: array schema must define items dict"
        _validate_json_schema_node(items, path=f"{path}[]", top_level=False)


# ---------------------------------------------------------------------------
# 1. Registered 47-Tool Bus Metadata, JSON Schema & Editorial Purity Guard
# ---------------------------------------------------------------------------


def test_registered_47_tool_bus_schemas_and_chinese_editorial_hygiene(tmp_path: Path) -> None:
    specs = all_tool_specs()
    assert len(specs) == 47

    grouped_partition = (
        ("isa", isa_tool_specs(), 21),
        ("epistemic", epistemic_tool_specs(), 1),
        ("reviewer", reviewer_tool_specs(), 2),
        ("orchestrator", chat_orchestrator_tool_specs(), 19),
        ("sandbox", sandbox_tool_specs(), 2),
        ("grounding", grounding_tool_specs(), 2),
    )
    assert sum(expected_len for _, _, expected_len in grouped_partition) == 47
    for group_name, group_specs, expected_len in grouped_partition:
        assert len(group_specs) == expected_len
        assert all(s.group == group_name for s in group_specs)

    seen_names: set[str] = set()
    for spec in specs:
        assert SNAKE_NAME_RE.fullmatch(spec.name), f"Invalid snake_case tool name: {spec.name!r}"
        assert spec.name not in seen_names, f"Duplicate tool name: {spec.name!r}"
        seen_names.add(spec.name)
        assert type(spec.mutates) is bool
        if spec.mutates:
            assert spec.risk_tier in ("workspace_draft", "billable_or_commit"), (
                f"{spec.name}: mutating tool cannot declare readonly risk_tier"
            )
        _assert_pure_chinese_prose(spec.zh_label, label=f"{spec.name}.zh_label")
        _assert_pure_chinese_prose(spec.description, label=f"{spec.name}.description")
        _validate_json_schema_node(spec.parameters, path=f"tool:{spec.name}", top_level=True)

    # Every chat orchestrator browser tool in agent_chat.TOOLS must have a registered ToolSpec
    for browser_tool_name in chat_domain.TOOLS:
        assert browser_tool_name in seen_names, f"Browser chat tool {browser_tool_name!r} missing from tool_registry"

    # Fail-closed validation on invalid ToolSpec group / risk_tier
    with pytest.raises(ValueError, match="invalid_tool_group"):
        ToolSpec(
            name="bad_group_tool",
            zh_label="测试工具",
            group="untrusted",
            mutates=False,
            risk_tier="readonly",
            description="测试非法分组拦截。",
            parameters={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        )
    with pytest.raises(ValueError, match="invalid_risk_tier"):
        ToolSpec(
            name="bad_tier_tool",
            zh_label="测试工具",
            group="isa",
            mutates=False,
            risk_tier="root_shell",
            description="测试非法风险等级拦截。",
            parameters={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        )

    # Provider serializer parity & deep-copy isolation
    agent_tools = to_agent_tools()
    openai_tools = to_openai_tools()
    gemini_decls = to_gemini_function_declarations()
    anthropic_tools = to_anthropic_tools()
    assert len(agent_tools) == len(openai_tools) == len(gemini_decls) == len(anthropic_tools) == 47
    for idx, spec in enumerate(specs):
        assert agent_tools[idx]["name"] == spec.name
        assert openai_tools[idx]["type"] == "function"
        assert openai_tools[idx]["function"]["name"] == spec.name
        assert openai_tools[idx]["function"]["parameters"] == spec.parameters
        assert gemini_decls[idx]["name"] == spec.name
        assert gemini_decls[idx]["parameters"] == spec.parameters
        assert anthropic_tools[idx]["name"] == spec.name
        assert anthropic_tools[idx]["input_schema"] == spec.parameters

    openai_tools[0]["function"]["parameters"]["properties"]["injected_bad_key"] = {"type": "string"}
    assert "injected_bad_key" not in specs[0].parameters["properties"]

    # Public HTTP catalog & conditional ETag caching
    catalog = public_tool_catalog()
    assert catalog["schemaVersion"] == 1
    assert catalog["totalCount"] == 47
    assert sum(catalog["groups"].values()) == 47

    _app, _settings, _engine, login, _create_project, cleanup = _create_harness(tmp_path)
    try:
        client, _ = login("owner_a@example.test")
        r_cat = client.get("/api/agent/tools")
        assert r_cat.status_code == 200, r_cat.text
        assert not FORBIDDEN_BRACKETS_RE.search(r_cat.text)
        assert not PRIVATE_JARGON_RE.search(r_cat.text)
        http_catalog = r_cat.json()
        assert http_catalog == catalog
        etag = r_cat.headers.get("etag")
        assert etag and etag.startswith('"sha256-')
        r_304 = client.get("/api/agent/tools", headers={"if-none-match": etag})
        assert r_304.status_code == 304
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 2. ReAct Tool Executor & Statistical Bus Error Containment Guard
# ---------------------------------------------------------------------------


def test_react_tool_executor_and_statistical_bus_graceful_error_containment() -> None:
    ds_title, ds_questions, ds_rows = build_planted_trap_benchmark()
    sandbox = build_inline_sandbox(
        title=ds_title,
        questions=ds_questions,
        rows=ds_rows,
        classification="simulated",
        ref="benchmark:planted-4-traps",
    )

    def _dispatch_with_faults(tool_name: str, **kwargs: Any) -> ToolResult:
        if tool_name == "synthetic_jargon_fault":
            raise ValueError("\u3010\u7b97\u5b50\u6c99\u76d2\u3011\u53d8\u91cf\u300cx_missing\u300d\u5728 DAG \u4e2d\u8d8a\u754c")
        fn = getattr(sandbox, tool_name)
        return fn(**kwargs)

    allowed = (
        "inspect_distribution",
        "test_group_difference",
        "fit_regression",
        "purify_scale_reliability",
        "synthetic_jargon_fault",
    )

    observed_prompts: list[list[dict[str, Any]]] = []
    step_counter = {"n": 0}

    def _fake_agent_step(
        step_label: str,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = "auto",
    ) -> SimpleNamespace:
        assert step_label.startswith("tool_fault_containment.iter")
        assert tools is not None and len(tools) >= 4
        assert tool_choice in ("auto", "none")
        step_counter["n"] += 1
        observed_prompts.append(list(messages))
        if step_counter["n"] == 1:
            return SimpleNamespace(
                reasoning="\u3010\u521d\u6b65\u63a2\u67e5\u3011\u5148\u6d4b\u8bd5\u7f3a\u53c2\u3001\u8d8a\u754c\u4e0e\u4e0d\u5b58\u5728\u53d8\u91cf\u7684\u5bb9\u9519\u8fb9\u754c\u3002",
                text="",
                tool_calls=[
                    # 1) Missing required 'group_var'
                    SimpleNamespace(id="tc_1", name="test_group_difference", arguments={"outcome": "adopt_intention"}),
                    # 2) Nonexistent variable column
                    SimpleNamespace(
                        id="tc_2",
                        name="fit_regression",
                        arguments={"outcome": "nonexistent_var_xyz", "predictors": ["living_mode"]},
                    ),
                    # 3) Out-of-bounds item count (< 2 variables)
                    SimpleNamespace(
                        id="tc_3",
                        name="purify_scale_reliability",
                        arguments={"construct_name": "bad_scale", "variables": ["trust_1"]},
                    ),
                    # 4) Runtime exception containing raw forbidden brackets & private jargon
                    SimpleNamespace(id="tc_4", name="synthetic_jargon_fault", arguments={}),
                ],
            )
        if step_counter["n"] == 2:
            return SimpleNamespace(
                reasoning="收到前序错误回执后改用合法变量分布检验。",
                text="",
                tool_calls=[
                    SimpleNamespace(
                        id="tc_5",
                        name="inspect_distribution",
                        arguments={"variables": ["adopt_intention"]},
                    ),
                ],
            )
        return SimpleNamespace(
            reasoning="完成全部核验并输出汇总结果。",
            text='{"headline": "异常调用已全部降级隔离并完成有效分布核验", "verifiedTools": 1}',
            tool_calls=[],
        )

    tool_defs = [
        *to_agent_tools([s for s in isa_tool_specs() if s.name in allowed]),
        {
            "name": "synthetic_jargon_fault",
            "description": "受控故障注入测试入口。",
            "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        },
    ]
    base_msgs = [
        {"role": "system", "content": "你是严谨的统计分析助手。"},
        {"role": "user", "content": "请核验数据集核心变量。"},
    ]
    final_payload, trace = run_react_step_loop(
        step_name="tool_fault_containment",
        base_messages=base_msgs,
        allowed_tools=set(allowed),
        call_tool_fn=_dispatch_with_faults,
        agent_step_fn=_fake_agent_step,
        tool_specs=tool_defs,
        max_iterations=4,
    )

    assert final_payload["headline"] == "异常调用已全部降级隔离并完成有效分布核验"
    assert final_payload["verifiedTools"] == 1
    explore_entries = [t for t in trace if t["phase"] == "explore"]
    assert len(explore_entries) == 5

    # First 4 calls were safely trapped as structured errors; 5th succeeded
    for fault_entry in explore_entries[:4]:
        assert fault_entry["snapshot_id"] is None
        assert any(str(d).startswith("TOOL_ERROR:") for d in fault_entry["diagnostics"])
        _assert_pure_chinese_prose(fault_entry["summary"], label=f"trace[{fault_entry['tool']}].summary")
        _assert_pure_chinese_prose(fault_entry["thought"], label=f"trace[{fault_entry['tool']}].thought")

    ok_entry = explore_entries[4]
    assert ok_entry["tool"] == "inspect_distribution"
    assert isinstance(ok_entry["snapshot_id"], str) and ok_entry["snapshot_id"]
    _assert_pure_chinese_prose(ok_entry["summary"], label="trace[inspect_distribution].summary")

    # Verify tool role messages fed back to the model carry structured status='error' without raw brackets/jargon
    round2_tool_msgs = [m for m in observed_prompts[1] if m.get("role") == "tool"]
    assert len(round2_tool_msgs) == 4
    for tmsg in round2_tool_msgs:
        assert '"status":"error"' in tmsg["content"]
        assert not FORBIDDEN_BRACKETS_RE.search(tmsg["content"])
        assert not PRIVATE_JARGON_RE.search(tmsg["content"])

    # Fail-closed rejection on structurally compromised LLM tool-call envelopes (JSON invoke_fn path)
    with pytest.raises(ValueError, match="disallowed_tool:drop_all_tables"):
        run_react_step_loop(
            step_name="guard_disallowed",
            base_messages=base_msgs,
            allowed_tools={"inspect_distribution"},
            call_tool_fn=_dispatch_with_faults,
            invoke_fn=lambda _s, _m: '{"thought":"尝试越权","tool_calls":[{"name":"drop_all_tables","args":{}}]}',
        )

    with pytest.raises(ValueError, match="invalid_tool_args:inspect_distribution"):
        run_react_step_loop(
            step_name="guard_bad_args_type",
            base_messages=base_msgs,
            allowed_tools={"inspect_distribution"},
            call_tool_fn=_dispatch_with_faults,
            invoke_fn=lambda _s, _m: '{"thought":"参数非字典","tool_calls":[{"name":"inspect_distribution","args":["bad"]}]}',
        )

    with pytest.raises(ValueError, match="invalid_react_tool_calls:guard_too_many"):
        run_react_step_loop(
            step_name="guard_too_many",
            base_messages=base_msgs,
            allowed_tools={"inspect_distribution"},
            call_tool_fn=_dispatch_with_faults,
            invoke_fn=lambda _s, _m: (
                '{"thought":"超量并发","tool_calls":['
                '{"name":"inspect_distribution","args":{}},'
                '{"name":"inspect_distribution","args":{}},'
                '{"name":"inspect_distribution","args":{}},'
                '{"name":"inspect_distribution","args":{}},'
                '{"name":"inspect_distribution","args":{}}'
                "]}"
            ),
        )

    with pytest.raises(ValueError, match="malformed_tool_call_item:guard_bad_name"):
        run_react_step_loop(
            step_name="guard_bad_name",
            base_messages=base_msgs,
            allowed_tools={"inspect_distribution"},
            call_tool_fn=_dispatch_with_faults,
            invoke_fn=lambda _s, _m: '{"thought":"名称为整数","tool_calls":[{"name":123,"args":{}}]}',
        )


# ---------------------------------------------------------------------------
# 3. Agent Chat & Autonomous Research HTTP Malformed Tool-Call Guard
# ---------------------------------------------------------------------------


def test_chat_and_autonomous_http_endpoints_reject_malformed_tool_calls_in_pure_chinese(
    tmp_path: Path,
) -> None:
    # 3a. Unit verification of agent_chat.parse_reply filtering malformed/unknown/excess model tool actions
    raw_model_json = (
        '{"reply":"\u3010\u6838\u67e5\u7ed3\u8bba\u3011\u5df2\u4e3a\u60a8\u5b9a\u4f4d\u300c\u62bd\u6837\u8bbe\u8ba1\u300d\u6a21\u5757\u3002",'
        '"actions":['
        '{"tool":"unknown_shell_exec","args":{"cmd":"whoami"}},'
        '{"tool":"open","args":{}},'
        '{"tool":"open","args":{"room":"nonexistent_room"}},'
        '{"tool":"lookup_county","args":{}},'
        '{"tool":"render_sandbox_plot","args":{"chartKind":"pie_3d"}},'
        '{"tool":"trace","args":{"reference":12345}},'
        '{"tool":"lookup","args":["not_an_object"]},'
        '{"tool":"open","args":{"room":"sampling"}},'
        '{"tool":"stage","args":{"view":"paper"}},'
        '{"tool":"studio","args":{"kind":"chart"}},'
        '{"tool":"next","args":{}}'
        "]}"
    )
    parsed = chat_domain.parse_reply(raw_model_json, final=False)
    assert not FORBIDDEN_BRACKETS_RE.search(parsed["reply"])
    assert len(parsed["actions"]) == 3
    assert [a["tool"] for a in parsed["actions"]] == ["open", "stage", "studio"]
    # 7 malformed/unknown actions + 1 excess valid action beyond cap of 3 = 8 dropped
    assert parsed["droppedActions"] == 8

    parsed_final = chat_domain.parse_reply(raw_model_json, final=True)
    assert parsed_final["actions"] == []
    assert parsed_final["droppedActions"] == 11

    # 3b. Live HTTP boundary injection across /api/agent/turns and /api/projects/{pid}/...
    _app, _settings, _engine, login, create_project, cleanup = _create_harness(tmp_path)
    try:
        owner, _ = login("owner_a@example.test")
        project = create_project(owner, "异常工具参数注入防护测试")
        pid = project["id"]
        fake_svc_id = str(uuid4())

        # /api/agent/turns malformed / out-of-bounds / wrong-type cases
        base_turn = {
            "schemaVersion": 1,
            "idempotencyKey": str(uuid4()),
            "message": "请检查当前问卷信效度。",
            "history": [],
            "context": {"illumination": {}},
            "serviceId": fake_svc_id,
            "serviceRevision": 1,
            "consent": True,
        }
        malformed_turns: list[tuple[dict[str, Any], int, str | None]] = [
            ({k: v for k, v in base_turn.items() if k != "message"}, 422, "invalid_input"),
            ({**base_turn, "idempotencyKey": str(uuid4()), "schemaVersion": "1"}, 422, "invalid_input"),
            ({**base_turn, "idempotencyKey": str(uuid4()), "consent": False}, 422, "consent_required"),
            (
                {**base_turn, "idempotencyKey": str(uuid4()), "step": 1, "toolResults": [{"tool": "next", "text": "ok"}]},
                422,
                "invalid_input",
            ),
            (
                {**base_turn, "idempotencyKey": str(uuid4()), "step": 99, "toolResults": [{"tool": "next", "text": "ok"}]},
                422,
                "invalid_input",
            ),
            (
                {**base_turn, "idempotencyKey": str(uuid4()), "step": 2, "toolResults": [{"tool": "open", "text": "disallowed_result_tool"}]},
                422,
                "invalid_input",
            ),
            (
                {**base_turn, "idempotencyKey": str(uuid4()), "step": 2, "toolResults": "not_a_list"},
                422,
                "invalid_input",
            ),
            (
                {**base_turn, "idempotencyKey": str(uuid4()), "context": {"blob": "x" * 17000}},
                422,
                "input_too_large",
            ),
        ]
        for bad_turn, exp_status, exp_code in malformed_turns:
            resp = owner.post("/api/agent/turns", json=bad_turn)
            _assert_clean_chinese_api_error(resp, expected_status=exp_status, expected_code=exp_code)

        # /api/projects/{pid}/autonomous-runs missing / out-of-bounds / wrong-type cases
        malformed_runs: list[tuple[dict[str, Any], int, str | None]] = [
            ({"idempotencyKey": str(uuid4()), "datasetMode": "planted_trap_benchmark"}, 422, "invalid_input"),
            ({"idempotencyKey": str(uuid4()), "goal": 12345, "datasetMode": "planted_trap_benchmark"}, 422, "invalid_input"),
            ({"idempotencyKey": str(uuid4()), "goal": "验证数据集", "datasetMode": "raw_sql_dump"}, 422, "invalid_dataset_mode"),
            (
                {"idempotencyKey": str(uuid4()), "goal": "验证租约模式", "datasetMode": "planted_trap_benchmark", "leaseMode": "unbounded"},
                422,
                "invalid_lease_mode",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "预算零步越界", "datasetMode": "planted_trap_benchmark", "maxToolCalls": 0},
                422,
                "invalid_budget",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "预算过低越界", "datasetMode": "planted_trap_benchmark", "maxToolCalls": 3},
                422,
                "invalid_budget",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "预算负数越界", "datasetMode": "planted_trap_benchmark", "maxToolCalls": -5},
                422,
                "invalid_budget",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "预算过高越界", "datasetMode": "planted_trap_benchmark", "maxToolCalls": 999},
                422,
                "invalid_budget",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "预算字符串错误类型", "datasetMode": "planted_trap_benchmark", "maxToolCalls": "twenty"},
                422,
                "invalid_input",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "预算数组错误类型", "datasetMode": "planted_trap_benchmark", "maxToolCalls": ["bad"]},
                422,
                "invalid_input",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "预算布尔错误类型", "datasetMode": "planted_trap_benchmark", "maxToolCalls": True},
                422,
                "invalid_input",
            ),
            (
                {"idempotencyKey": str(uuid4()), "goal": "内联数据缺列", "datasetMode": "inline_dataset", "inlineDataset": {"questions": "bad"}},
                422,
                "invalid_inline_dataset",
            ),
        ]
        for bad_run, exp_status, exp_code in malformed_runs:
            resp = owner.post(f"/api/projects/{pid}/autonomous-runs", json=bad_run)
            _assert_clean_chinese_api_error(resp, expected_status=exp_status, expected_code=exp_code)

        # /api/projects/{pid}/sandbox/plot malformed types & AST security guard
        malformed_plots: list[tuple[dict[str, Any], int, str | None]] = [
            ({}, 422, "invalid_input"),
            ({"script": ["not_a_string"]}, 422, "invalid_input"),
            ({"script": "fig, ax = plt.subplots()", "data": [1, 2, 3]}, 422, "invalid_input"),
            ({"script": "fig, ax = plt.subplots()", "autoRepair": "yes"}, 422, "invalid_input"),
            ({"chartKind": "pie_3d"}, 422, "invalid_input"),
            ({"chartKind": 123}, 422, "invalid_input"),
            ({"script": "import os\nos.system('echo pwned')\n"}, 422, "sandbox_security_error"),
        ]
        for bad_plot, exp_status, exp_code in malformed_plots:
            resp = owner.post(f"/api/projects/{pid}/sandbox/plot", json=bad_plot)
            _assert_clean_chinese_api_error(resp, expected_status=exp_status, expected_code=exp_code)

        # /api/projects/{pid}/sandbox/stat malformed types & AST security guard
        malformed_stats: list[tuple[dict[str, Any], int, str | None]] = [
            ({}, 422, "invalid_input"),
            ({"script": 42, "questions": [], "rows": []}, 422, "invalid_input"),
            ({"script": "RESULT = {'n': 1}", "questions": "not_a_list", "rows": []}, 422, "invalid_input"),
            ({"script": "import subprocess\nRESULT = {}\n", "questions": [], "rows": []}, 422, "sandbox_security_error"),
        ]
        for bad_stat, exp_status, exp_code in malformed_stats:
            resp = owner.post(f"/api/projects/{pid}/sandbox/stat", json=bad_stat)
            _assert_clean_chinese_api_error(resp, expected_status=exp_status, expected_code=exp_code)

        # /grounding/verify-citation & /grounding/counties malformed / out-of-bounds inputs
        r_cit_empty = owner.post(f"/api/projects/{pid}/grounding/verify-citation", json={})
        _assert_clean_chinese_api_error(r_cit_empty, expected_status=422, expected_code="invalid_input")
        r_cit_type = owner.post(f"/api/projects/{pid}/grounding/verify-citation", json={"query": ["bad"]})
        _assert_clean_chinese_api_error(r_cit_type, expected_status=422, expected_code="invalid_input")

        r_cnt_low = owner.get(f"/api/projects/{pid}/grounding/counties", params={"q": "杭州", "limit": 0})
        _assert_clean_chinese_api_error(r_cnt_low, expected_status=422, expected_code="invalid_input")
        r_cnt_high = owner.get(f"/api/projects/{pid}/grounding/counties", params={"q": "杭州", "limit": 99})
        _assert_clean_chinese_api_error(r_cnt_high, expected_status=422, expected_code="invalid_input")
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 4. Autonomous Research Milestone HITL State Machine & Tenant Isolation Guard
# ---------------------------------------------------------------------------


def test_autonomous_milestone_hitl_approve_steer_abort_idempotency_and_tenant_isolation(
    tmp_path: Path,
) -> None:
    _app, _settings, _engine, login, create_project, cleanup = _create_harness(tmp_path)
    try:
        owner_a, _ = login("owner_a@example.test")
        outsider, _ = login("outsider@example.test")
        proj_a = create_project(owner_a, "里程碑人工确认状态机主课题")
        proj_out = create_project(outsider, "异租户隔离对照课题")
        pid_a = proj_a["id"]
        pid_out = proj_out["id"]

        def _start_milestone_run(goal: str) -> dict[str, Any]:
            resp = owner_a.post(
                f"/api/projects/{pid_a}/autonomous-runs",
                json={
                    "idempotencyKey": str(uuid4()),
                    "goal": goal,
                    "datasetMode": "planted_trap_benchmark",
                    "leaseMode": "milestone_gated",
                    "maxToolCalls": 28,
                },
            )
            assert resp.status_code == 201, resp.text
            view = resp.json()
            assert view["status"] == "awaiting_milestone"
            assert view["revision"] == 1
            assert isinstance(view.get("pendingMilestone"), dict)
            _assert_pure_chinese_prose(view["pendingMilestone"]["reason"], label="pendingMilestone.reason")
            _assert_pure_chinese_prose(view["pendingMilestone"]["proposedAction"], label="pendingMilestone.proposedAction")
            return view

        # --- Case A: awaiting_milestone -> cross-tenant 404 -> steer -> completed -> duplicate 409 ---
        run_a = _start_milestone_run("检验里程碑暂停后导引续跑与重复确认拦截")
        run_a_id = run_a["runId"]

        # Foreign user attempting GET / resume / cancel on owner_a's project OR own project with run_a_id -> 404
        for target_pid in (pid_a, pid_out):
            r_get_404 = outsider.get(f"/api/projects/{target_pid}/autonomous-runs/{run_a_id}")
            _assert_clean_chinese_api_error(r_get_404, expected_status=404, expected_code="not_found")
            r_res_404 = outsider.post(
                f"/api/projects/{target_pid}/autonomous-runs/{run_a_id}/resume",
                json={"expectedRevision": 1, "decision": "approve"},
            )
            _assert_clean_chinese_api_error(r_res_404, expected_status=404, expected_code="not_found")
            r_can_404 = outsider.post(
                f"/api/projects/{target_pid}/autonomous-runs/{run_a_id}/cancel",
                json={"expectedRevision": 1},
            )
            _assert_clean_chinese_api_error(r_can_404, expected_status=404, expected_code="not_found")

        # Invalid decision & stale revision checks while still awaiting_milestone
        r_bad_dec = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_a_id}/resume",
            json={"expectedRevision": 1, "decision": "force_skip"},
        )
        _assert_clean_chinese_api_error(r_bad_dec, expected_status=422, expected_code="invalid_decision")

        r_stale_pre = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_a_id}/resume",
            json={"expectedRevision": 0, "decision": "approve"},
        )
        _assert_clean_chinese_api_error(r_stale_pre, expected_status=409, expected_code="revision_conflict")

        # Steer transition -> completed
        r_steered = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_a_id}/resume",
            json={
                "expectedRevision": 1,
                "decision": "steer",
                "steeringNote": "优先核查调节效应与异质性子群方向反转。",
            },
        )
        assert r_steered.status_code == 200, r_steered.text
        done_a = r_steered.json()
        assert done_a["status"] == "completed"
        assert done_a["pendingMilestone"] is None
        assert done_a["revision"] >= 2
        assert isinstance(done_a.get("deliverable"), dict)

        # Duplicate confirmation with stale revision -> 409 revision_conflict
        r_dup_stale = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_a_id}/resume",
            json={"expectedRevision": 1, "decision": "approve"},
        )
        _assert_clean_chinese_api_error(r_dup_stale, expected_status=409, expected_code="revision_conflict")

        # Duplicate confirmation with latest revision on already-completed run -> 409 invalid_transition
        r_dup_curr = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_a_id}/resume",
            json={"expectedRevision": done_a["revision"], "decision": "approve"},
        )
        _assert_clean_chinese_api_error(r_dup_curr, expected_status=409, expected_code="invalid_transition")

        # Cancelling an already-completed run -> 409 invalid_transition
        r_cancel_done = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_a_id}/cancel",
            json={"expectedRevision": done_a["revision"]},
        )
        _assert_clean_chinese_api_error(r_cancel_done, expected_status=409, expected_code="invalid_transition")

        # --- Case B: awaiting_milestone -> approve -> completed ---
        run_b = _start_milestone_run("检验里程碑直接批准闭环")
        r_approved = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_b['runId']}/resume",
            json={"expectedRevision": 1, "decision": "approve"},
        )
        assert r_approved.status_code == 200, r_approved.text
        assert r_approved.json()["status"] == "completed"

        # --- Case C: awaiting_milestone -> resume(decision='abort') -> cancelled ---
        run_c = _start_milestone_run("检验里程碑审阅驳回终止")
        r_aborted = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_c['runId']}/resume",
            json={"expectedRevision": 1, "decision": "abort", "steeringNote": "样本假设不成立，终止本轮"},
        )
        assert r_aborted.status_code == 200, r_aborted.text
        aborted_c = r_aborted.json()
        assert aborted_c["status"] == "cancelled"
        assert aborted_c["pendingMilestone"] is None

        # --- Case D: awaiting_milestone -> /cancel -> cancelled + duplicate cancel/resume 409 ---
        run_d = _start_milestone_run("检验里程碑显式取消端点与幂等拦截")
        r_cancelled = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_d['runId']}/cancel",
            json={"expectedRevision": 1},
        )
        assert r_cancelled.status_code == 200, r_cancelled.text
        cancelled_d = r_cancelled.json()
        assert cancelled_d["status"] == "cancelled"
        assert cancelled_d["revision"] == 2

        r_dup_cancel_stale = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_d['runId']}/cancel",
            json={"expectedRevision": 1},
        )
        _assert_clean_chinese_api_error(r_dup_cancel_stale, expected_status=409, expected_code="revision_conflict")

        r_dup_cancel_curr = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_d['runId']}/cancel",
            json={"expectedRevision": 2},
        )
        _assert_clean_chinese_api_error(r_dup_cancel_curr, expected_status=409, expected_code="invalid_transition")

        r_resume_after_cancel = owner_a.post(
            f"/api/projects/{pid_a}/autonomous-runs/{run_d['runId']}/resume",
            json={"expectedRevision": 2, "decision": "approve"},
        )
        _assert_clean_chinese_api_error(r_resume_after_cancel, expected_status=409, expected_code="invalid_transition")
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 5. Multi-Agent Workflow Task HITL Approval, Cancel & Tenant Isolation Guard
# ---------------------------------------------------------------------------


def test_workflow_agent_task_hitl_approval_cancel_duplicate_and_tenant_isolation(
    tmp_path: Path,
) -> None:
    entered_slow_step = threading.Event()
    release_slow_step = threading.Event()

    def _research_handler(state: Any) -> AgentResult:
        if state.requirements.get("slowCancelTest"):
            entered_slow_step.set()
            release_slow_step.wait(timeout=5.0)
        return AgentResult("已完成研究选题论证", ("artifact:topic-brief",))

    def _survey_handler(_state: Any) -> AgentResult:
        return AgentResult("已完成问卷结构草案", ("artifact:survey-draft",))

    def _data_handler(_state: Any) -> AgentResult:
        return AgentResult("已完成实证统计检验", ("artifact:data-summary",))

    def _reviewer_handler(_state: Any) -> AgentResult:
        return AgentResult("质量复核通过", review_decision=ReviewDecision.APPROVE)

    app, _settings, _engine, login, create_project, cleanup = _create_harness(
        tmp_path,
        workflow_handlers={
            AgentRole.RESEARCH: _research_handler,
            AgentRole.SURVEY: _survey_handler,
            AgentRole.DATA: _data_handler,
            AgentRole.REVIEWER: _reviewer_handler,
        },
    )
    try:
        owner_a, _ = login("owner_a@example.test")
        outsider, _ = login("outsider@example.test")
        proj_a = create_project(owner_a, "协作工作流人工确认课题")
        proj_out = create_project(outsider, "协作工作流异租户课题")
        pid_a = proj_a["id"]
        pid_out = proj_out["id"]

        # Invalid task_type fails closed with pure-Chinese 422 invalid_task
        r_bad_task = owner_a.post(
            f"/api/projects/{pid_a}/agent-tasks",
            json={"taskType": "unsupported_secret_pipeline", "requirements": {"goal": "非法任务类型"}},
        )
        _assert_clean_chinese_api_error(r_bad_task, expected_status=422, expected_code="invalid_task")

        # 5a. Questionnaire HITL: ready -> survey -> reviewer (needs_input: approve_reviewer)
        r_create = owner_a.post(
            f"/api/projects/{pid_a}/agent-tasks",
            json={"taskType": "questionnaire", "requirements": {"goal": "构建县域消费调研量表"}},
        )
        assert r_create.status_code == 201, r_create.text
        task = r_create.json()
        tid = task["id"]
        tpath = f"/api/projects/{pid_a}/agent-tasks/{tid}"

        r_step1 = owner_a.post(f"{tpath}/advance", json={"expectedRevision": 0})
        assert r_step1.status_code == 200, r_step1.text
        after_survey = r_step1.json()
        assert after_survey["status"] == "ready"

        r_step2 = owner_a.post(f"{tpath}/advance", json={"expectedRevision": after_survey["revision"]})
        assert r_step2.status_code == 200, r_step2.text
        awaiting = r_step2.json()
        assert awaiting["status"] == "needs_input"
        assert awaiting["state"]["awaiting_approval"] == "approve_reviewer"
        pending_rev = awaiting["revision"]

        # Cross-tenant outsider attempting GET / approval / cancel / input -> 404 pure Chinese
        for target_pid in (pid_a, pid_out):
            foreign_path = f"/api/projects/{target_pid}/agent-tasks/{tid}"
            _assert_clean_chinese_api_error(outsider.get(foreign_path), expected_status=404, expected_code="not_found")
            _assert_clean_chinese_api_error(
                outsider.post(f"{foreign_path}/approval", json={"expectedRevision": pending_rev, "approved": True}),
                expected_status=404,
                expected_code="not_found",
            )
            _assert_clean_chinese_api_error(
                outsider.post(f"{foreign_path}/cancel", json={"expectedRevision": pending_rev}),
                expected_status=404,
                expected_code="not_found",
            )
            _assert_clean_chinese_api_error(
                outsider.post(f"{foreign_path}/input", json={"expectedRevision": pending_rev, "artifactRefs": ["x"]}),
                expected_status=404,
                expected_code="not_found",
            )

        # Rejecting without feedback fails closed with 409 pure Chinese
        r_no_fb = owner_a.post(
            f"{tpath}/approval",
            json={"expectedRevision": pending_rev, "approved": False, "feedback": "   "},
        )
        _assert_clean_chinese_api_error(r_no_fb, expected_status=409, expected_code="invalid_transition")

        # Requesting revision with feedback routes back to specialist ('ready')
        r_revise = owner_a.post(
            f"{tpath}/approval",
            json={"expectedRevision": pending_rev, "approved": False, "feedback": "请补充注意力甄别题项"},
        )
        assert r_revise.status_code == 200, r_revise.text
        revised = r_revise.json()
        assert revised["status"] == "ready"
        assert revised["state"]["awaiting_approval"] is None
        assert revised["state"]["retry_count"]["survey"] == 1

        # Re-advance through survey + reviewer back to awaiting_approval, then approve -> completed
        s_re1 = owner_a.post(f"{tpath}/advance", json={"expectedRevision": revised["revision"]}).json()
        s_re2 = owner_a.post(f"{tpath}/advance", json={"expectedRevision": s_re1["revision"]}).json()
        assert s_re2["status"] == "needs_input"
        approve_rev = s_re2["revision"]

        r_ok = owner_a.post(
            f"{tpath}/approval",
            json={"expectedRevision": approve_rev, "approved": True},
        )
        assert r_ok.status_code == 200, r_ok.text
        approved_view = r_ok.json()
        done_view = owner_a.post(f"{tpath}/advance", json={"expectedRevision": approved_view["revision"]}).json()
        assert done_view["status"] == "completed"

        # Duplicate confirmation interception: stale revision -> 409 revision_conflict; current revision -> 409 invalid_transition
        r_dup_stale = owner_a.post(
            f"{tpath}/approval",
            json={"expectedRevision": approve_rev, "approved": True},
        )
        _assert_clean_chinese_api_error(r_dup_stale, expected_status=409, expected_code="revision_conflict")

        r_dup_curr = owner_a.post(
            f"{tpath}/approval",
            json={"expectedRevision": done_view["revision"], "approved": True},
        )
        _assert_clean_chinese_api_error(r_dup_curr, expected_status=409, expected_code="invalid_transition")

        # 5b. Real-data gate ('upload_real_data') & duplicate input interception
        r_data_task = owner_a.post(
            f"/api/projects/{pid_a}/agent-tasks",
            json={"taskType": "data_analysis", "requirements": {"goal": "验证真实答卷门禁"}},
        )
        assert r_data_task.status_code == 201, r_data_task.text
        dpath = f"/api/projects/{pid_a}/agent-tasks/{r_data_task.json()['id']}"
        waiting_data = owner_a.post(f"{dpath}/advance", json={"expectedRevision": 0}).json()
        assert waiting_data["status"] == "needs_input"
        assert waiting_data["state"]["awaiting_approval"] == "upload_real_data"

        # Calling /approval instead of /input on upload_real_data fails closed with 409 pure Chinese
        r_wrong_gate = owner_a.post(
            f"{dpath}/approval",
            json={"expectedRevision": waiting_data["revision"], "approved": True},
        )
        _assert_clean_chinese_api_error(r_wrong_gate, expected_status=409, expected_code="invalid_transition")

        r_supplied = owner_a.post(
            f"{dpath}/input",
            json={"expectedRevision": waiting_data["revision"], "artifactRefs": ["dataset:clean-v1"]},
        )
        assert r_supplied.status_code == 200, r_supplied.text
        supplied = r_supplied.json()
        assert supplied["status"] == "ready"

        r_dup_input = owner_a.post(
            f"{dpath}/input",
            json={"expectedRevision": supplied["revision"], "artifactRefs": ["dataset:clean-v1"]},
        )
        _assert_clean_chinese_api_error(r_dup_input, expected_status=409, expected_code="invalid_transition")

        # 5c. Live in-flight execution /cancel transition + duplicate /cancel 409 interception
        r_slow = owner_a.post(
            f"/api/projects/{pid_a}/agent-tasks",
            json={"taskType": "topic_design", "requirements": {"goal": "测试运行中取消", "slowCancelTest": True}},
        )
        assert r_slow.status_code == 201, r_slow.text
        spath = f"/api/projects/{pid_a}/agent-tasks/{r_slow.json()['id']}"

        owner_a_cancel_client = TestClient(app)
        owner_a_cancel_client.cookies.set(
            _settings.cookie_name,
            owner_a.cookies.get(_settings.cookie_name) or "",
        )
        owner_a_cancel_client.headers.update(
            {
                "origin": ORIGIN,
                "x-csrf-token": owner_a.headers["x-csrf-token"],
            }
        )
        try:
            def _advance_in_bg() -> Any:
                return owner_a.post(f"{spath}/advance", json={"expectedRevision": 0})

            with ThreadPoolExecutor(max_workers=1) as pool:
                fut = pool.submit(_advance_in_bg)
                assert entered_slow_step.wait(timeout=4.0), "Background workflow handler did not enter running state"
                time.sleep(0.05)
                # Claimed revision while running is 0 + 1 = 1
                r_cancel = owner_a_cancel_client.post(f"{spath}/cancel", json={"expectedRevision": 1})
                assert r_cancel.status_code == 200, r_cancel.text
                cancelled_task = r_cancel.json()
                assert cancelled_task["status"] == "blocked"
                assert cancelled_task["execution"]["status"] == "cancelled"
                assert cancelled_task["execution"]["errorCode"] == "execution_cancelled"
                release_slow_step.set()
                r_bg_done = fut.result(timeout=5.0)
                assert r_bg_done.status_code == 200, r_bg_done.text
                # Late handler finish must NOT overwrite cancelled execution
                final_slow = owner_a_cancel_client.get(spath).json()
                assert final_slow["status"] == "blocked"
                assert final_slow["execution"]["status"] == "cancelled"

            r_dup_task_cancel = owner_a_cancel_client.post(
                f"{spath}/cancel",
                json={"expectedRevision": final_slow["revision"]},
            )
            _assert_clean_chinese_api_error(r_dup_task_cancel, expected_status=409, expected_code="invalid_transition")
        finally:
            owner_a_cancel_client.close()
    finally:
        release_slow_step.set()
        cleanup()
