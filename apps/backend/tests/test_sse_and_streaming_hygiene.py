"""Permanent CI guard for SSE streaming channel hygiene, redaction, and replay boundaries (Wave 21).

Verifies:
1. Streaming response headers on GET /api/projects/{project_id}/autonomous-runs/{run_id}/stream:
   Content-Type: text/event-stream, Cache-Control containing no-cache/no-store/no-transform,
   X-Accel-Buffering: no, hardened security headers, and zero CORS reflection.
2. W3C SSE wire-frame formatting (id / event / single-line compact JSON data / double-LF) and
   neutralization of CRLF header-injection attempts in eventType while keeping structural SVG,
   diagnostics, and epistemicGraph payloads intact.
3. Error-frame and trace prose sanitization across persisted execution failures, adversarial event
   payloads, and mid-stream polling exceptions: zero Python stack traces, zero local filesystem
   paths, zero DB URIs, zero secret/auth headers (Bearer, x-api-key, sk-*, re_*, AIza*), and zero
   forbidden bracket punctuation ([【】「」『』]).
4. Deterministic Last-Event-ID and afterSeq boundary validation (including Unicode non-ASCII digits,
   negative numbers, non-integers, overflow lengths, and max(afterSeq, Last-Event-ID) cursor merge)
   plus session authentication and cross-tenant 404 isolation.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import re
import sys

import fastapi
from fastapi.testclient import TestClient
import pytest
import sqlalchemy
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from application.services.autonomous_research import AutonomousResearchService
from evix_api.app import create_app
from evix_api.routes.autonomous_agent import (
    _format_sse_frame,
    _guard_api_errors,
    _sanitize_outbound_payload,
)
from infrastructure.database.models import (
    AutonomousRun,
    AutonomousRunEvent,
    Member,
    Operation,
    Project,
    Session as DbSessionModel,
    Team,
    User,
    now,
)
from infrastructure.security import keyed
from infrastructure.settings import Settings
from shared.errors import ApiError

_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_RAW_JARGON_RE = re.compile(r"\b(?:ReAct|DAG|Last-Event-ID)\b|算子|沙盒|大模型|大语言模型", re.IGNORECASE)
_STACK_TRACE_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|\b(?:RuntimeError|ValueError|KeyError|TypeError|AttributeError|OperationalError|SQLAlchemyError|DBAPIError)\b",
    re.IGNORECASE,
)
_LOCAL_PATH_OR_URI_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)
_SECRET_LEAK_RE = re.compile(
    r"(?:Authorization|Proxy-Authorization)\s*:"
    r"|\bBearer\s+[A-Za-z0-9._\-]{6,}"
    r"|\bx-api-key\b"
    r"|\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_\-]{8,}"
    r"|\bre_[A-Za-z0-9_\-]{8,}"
    r"|\bAIza[0-9A-Za-z_\-]{12,}",
    re.IGNORECASE,
)

PROJECT_ID = "11111111-2222-4333-8444-555555555555"
TEAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
OWNER_ID = "22222222-2222-4222-8222-222222222222"
OUTSIDER_ID = "99999999-9999-4999-8999-999999999999"
RUN_ID = "33333333-4444-4555-8666-777777777777"


def _make_sqlite_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    event.listen(
        engine,
        "connect",
        lambda dbapi_conn, _: dbapi_conn.create_function("set_config", 3, lambda _k, val, _l: val),
    )
    for table in (
        User.__table__,
        DbSessionModel.__table__,
        Team.__table__,
        Member.__table__,
        Project.__table__,
        Operation.__table__,
        AutonomousRun.__table__,
        AutonomousRunEvent.__table__,
    ):
        table.create(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:db_secret_pw_88@127.0.0.1:55432/evix_prod",
        "allowed_origins": ["http://127.0.0.1:3180"],
        "invited_emails": ["owner@example.test", "outsider@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "sav_temp_dir": tmp_path / "sav-private",
        "preflight_temp_dir": tmp_path / "preflight-private",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_workspace_and_run(
    engine,
    settings: Settings,
    monkeypatch,
    *,
    run_status: str = "completed",
    events: list[tuple[int, str, dict]] | None = None,
) -> dict[str, str]:
    owner_cookie = "sse-owner-session-token-0123456789"
    outsider_cookie = "sse-outsider-session-token-9876543210"
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)

    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert(),
            [
                {"id": OWNER_ID, "email": "owner@example.test", "created_at": ts},
                {"id": OUTSIDER_ID, "email": "outsider@example.test", "created_at": ts},
            ],
        )
        conn.execute(
            DbSessionModel.__table__.insert(),
            [
                {
                    "user_id": OWNER_ID,
                    "token_hash": keyed(settings, "session/v1", owner_cookie),
                    "csrf": "csrf-owner",
                    "expires_at": ts.replace(year=ts.year + 1),
                    "revoked_at": None,
                },
                {
                    "user_id": OUTSIDER_ID,
                    "token_hash": keyed(settings, "session/v1", outsider_cookie),
                    "csrf": "csrf-outsider",
                    "expires_at": ts.replace(year=ts.year + 1),
                    "revoked_at": None,
                },
            ],
        )
        conn.execute(Team.__table__.insert().values(id=TEAM_ID, name="实证调研课题组"))
        conn.execute(Member.__table__.insert().values(team_id=TEAM_ID, user_id=OWNER_ID, role="owner"))
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_ID,
                team_id=TEAM_ID,
                title="县域银发助餐实证调研",
                revision=1,
                questionnaire_revision=1,
                created_at=ts,
            )
        )
        conn.execute(
            AutonomousRun.__table__.insert().values(
                id=RUN_ID,
                project_id=PROJECT_ID,
                created_by=OWNER_ID,
                idempotency_key="44444444-5555-4666-8777-888888888888",
                status=run_status,
                lease_mode="pi_autonomous",
                dataset_mode="planted_trap_benchmark",
                goal="检验量表信度与分层稳健性",
                geography="县域",
                budget_cap=24,
                used_calls=4,
                dataset_ref="benchmark:planted-4-traps",
                dataset_sha256="a" * 64,
                checkpoint_json={},
                epistemic_graph_json={"project_id": PROJECT_ID, "nodes": [], "edges": [], "pivot_log": []},
                revision=1,
                created_at=ts,
                updated_at=ts,
            )
        )
        for seq, ev_type, payload in events or []:
            conn.execute(
                AutonomousRunEvent.__table__.insert().values(
                    id=f"00000000-0000-4000-8000-{seq:012d}",
                    run_id=RUN_ID,
                    project_id=PROJECT_ID,
                    created_by=OWNER_ID,
                    seq=seq,
                    event_type=ev_type,
                    payload_json=payload,
                    created_at=ts,
                )
            )
    return {"owner_cookie": owner_cookie, "outsider_cookie": outsider_cookie}


def _parse_sse_wire(raw_text: str) -> list[dict]:
    if not raw_text:
        return []
    assert raw_text.endswith("\n\n"), f"SSE stream must terminate each frame with \\n\\n: {raw_text!r}"
    blocks = [blk for blk in raw_text.split("\n\n") if blk]
    parsed: list[dict] = []
    for blk in blocks:
        lines = blk.split("\n")
        assert len(lines) == 3, f"Expected exact 3-line SSE frame (id/event/data), got: {lines!r}"
        assert lines[0].startswith("id: ")
        assert lines[1].startswith("event: ")
        assert lines[2].startswith("data: ")
        seq_id = int(lines[0][4:])
        ev_name = lines[1][7:]
        data_obj = json.loads(lines[2][6:])
        parsed.append({"id": seq_id, "event": ev_name, "data": data_obj})
    return parsed


def _assert_zero_sensitive_leak(wire_text: str, headers, settings: Settings) -> None:
    combined = wire_text + "\n" + "\n".join(f"{k}: {v}" for k, v in headers.items())
    assert not _STACK_TRACE_RE.search(combined), f"Python stack trace or exception class leaked: {combined!r}"
    assert not _LOCAL_PATH_OR_URI_RE.search(combined), f"Local path or DB URI leaked: {combined!r}"
    assert not _SECRET_LEAK_RE.search(combined), f"Auth header or API key token leaked: {combined!r}"
    py_ver = sys.version.split()[0]
    for secret in (
        py_ver,
        fastapi.__version__,
        sqlalchemy.__version__,
        settings.auth_secret,
        next(iter(settings.keyring.values())),
        "db_secret_pw_88",
        str(settings.sav_temp_dir),
        str(settings.preflight_temp_dir),
    ):
        assert secret not in combined, f"Internal secret/version {secret!r} leaked"


def test_sse_streaming_headers_and_ordered_wire_frame_formatting(tmp_path: Path, monkeypatch):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    raw_svg = '<svg viewBox="0 0 100 40"><text x="4" y="20">保留矢量节点</text></svg>'
    seeded_events = [
        (1, "run_started", {"summary": "启动【探索沙盒】与 ReAct 推演"}),
        (
            2,
            "thought",
            {
                "thought": "工作记忆压缩：准备在大模型与统计算子中核验 DAG 结构",
                "diagnostics": ["NEGATIVE_CITC_ITEM:Q_trap"],
            },
        ),
        (
            3,
            "tool_result",
            {
                "observationSummary": "绘图沙盒执行失败：「字号回退」已完成修正",
                "svg": raw_svg,
                "args": {"alpha": 0.05},
            },
        ),
        (4, "milestone_pause", {"reason": "发现『方向反转』信号", "proposedAction": "在沙盒中分层复核"}),
        (5, "completed", {"headline": "【母洞察】助餐补贴显著调节采纳意愿", "motherInsights": ["「核心结论」稳健成立"]}),
    ]
    tokens = _seed_workspace_and_run(engine, settings, monkeypatch, run_status="completed", events=seeded_events)
    app = create_app(settings=settings, engine=engine)

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, tokens["owner_cookie"])
        res = client.get(
            f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/stream",
            headers={"Origin": "https://evil.example"},
        )
        assert res.status_code == 200
        assert res.headers.get("content-type", "").startswith("text/event-stream")
        cc = res.headers.get("cache-control", "")
        assert "no-cache" in cc
        assert "no-store" in cc
        assert "no-transform" in cc
        assert res.headers.get("x-accel-buffering") == "no"
        assert res.headers.get("x-content-type-options") == "nosniff"
        assert res.headers.get("x-frame-options") == "DENY"
        assert res.headers.get("x-robots-tag") == "noindex, nofollow, noarchive"
        assert "access-control-allow-origin" not in {k.lower() for k in res.headers.keys()}
        _assert_zero_sensitive_leak(res.text, res.headers, settings)

        frames = _parse_sse_wire(res.text)
        assert [f["id"] for f in frames] == [1, 2, 3, 4, 5]
        assert [f["event"] for f in frames] == [
            "run_started",
            "thought",
            "tool_result",
            "milestone_pause",
            "completed",
        ]
        # Structural SVG and diagnostic codes remain intact while prose fields are de-teched and bracket-free
        assert frames[2]["data"]["payload"]["svg"] == raw_svg
        assert frames[1]["data"]["payload"]["diagnostics"] == ["NEGATIVE_CITC_ITEM:Q_trap"]
        assert frames[1]["data"]["payload"]["thought"].startswith("工作记忆压缩已完成，")

        prose_samples = [
            frames[0]["data"]["payload"]["summary"],
            frames[1]["data"]["payload"]["thought"],
            frames[2]["data"]["payload"]["observationSummary"],
            frames[3]["data"]["payload"]["reason"],
            frames[3]["data"]["payload"]["proposedAction"],
            frames[4]["data"]["payload"]["headline"],
            frames[4]["data"]["payload"]["motherInsights"][0],
        ]
        for sample in prose_samples:
            assert not _FORBIDDEN_BRACKET_RE.search(sample), f"Forbidden bracket leaked in SSE prose: {sample!r}"
            assert not _RAW_JARGON_RE.search(sample), f"Internal jargon leaked in SSE prose: {sample!r}"

    # Verify CRLF / header-injection attempt in event_type is neutralized to single safe frame
    injected_frame = _format_sse_frame(
        seq=9,
        run_id=RUN_ID,
        event_type="thought\r\nretry: 1\r\ndata: {\"hijack\":true}",
        payload={"summary": "正常摘要"},
        created_at="2026-11-25T00:00:00Z",
    )
    parsed_injected = _parse_sse_wire(injected_frame)
    assert len(parsed_injected) == 1
    assert parsed_injected[0]["event"] == "message"
    assert parsed_injected[0]["data"]["eventType"] == "message"


@pytest.mark.parametrize(
    "adversarial_exc",
    [
        RuntimeError(
            'Traceback (most recent call last):\n  File "D:\\evix\\worker\\runner.py", line 142, in step\n'
            "RuntimeError: upstream crashed with Authorization: Bearer sk-proj-9876543210abcdefSECRET"
        ),
        ValueError(
            "postgresql+psycopg://evix_admin:super_pw_99@10.20.30.40:55432/evix_prod "
            "failed while reading /var/lib/evix/private_vault.json 【严重故障】"
        ),
        KeyError(
            "x-api-key: sk-ant-api03-secretTokenValue1234567890 mail_api_key=re_live_secretMailKey998877 "
            "api_key=AIzaSyD1234567890abcdefghijklmnop /Users/admin/.env 「密钥异常」"
        ),
    ],
)
def test_sse_error_frames_scrub_tracebacks_paths_db_uris_secret_headers_and_brackets(
    tmp_path: Path, monkeypatch, adversarial_exc: Exception
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    tokens = _seed_workspace_and_run(
        engine,
        settings,
        monkeypatch,
        run_status="running",
        events=[(1, "run_started", {"summary": "已启动自主实证探索"})],
    )
    app = create_app(settings=settings, engine=engine)

    # Record a real execution failure through AutonomousResearchService._record_execution_failure
    svc = AutonomousResearchService(
        settings=settings,
        lock_user=lambda *_a, **_kw: None,
        operation=lambda *_a, **_kw: (None, False),
        owned_project=lambda *_a, **_kw: (None, "owner"),
        owned_service=lambda *_a, **_kw: None,
        generator=None,
        engine=engine,
    )
    svc._record_execution_failure(
        engine=engine,
        user_id=OWNER_ID,
        project_id=PROJECT_ID,
        run_id=RUN_ID,
        idempotency_key=None,
        exc=adversarial_exc,
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, tokens["owner_cookie"])
        res = client.get(f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/stream")
        assert res.status_code == 200
        _assert_zero_sensitive_leak(res.text, res.headers, settings)
        assert not _FORBIDDEN_BRACKET_RE.search(res.text)

        frames = _parse_sse_wire(res.text)
        assert [f["event"] for f in frames] == ["run_started", "error"]
        err_payload = frames[1]["data"]["payload"]
        assert err_payload["code"] == "execution_failed"
        assert _CHINESE_CHAR_RE.search(err_payload["message"])
        assert not _FORBIDDEN_BRACKET_RE.search(err_payload["message"])

    # Also verify corrupted error codes and nested tool_result error fields are scrubbed
    corrupted_error = _sanitize_outbound_payload(
        {
            "code": "C:\\secret\\path【bad_code】",
            "message": "Authorization: Bearer sk-live-abcdef0123456789",
            "detail": 'Traceback (most recent call last): File "/etc/passwd", line 1',
        },
        _event_type="error",
    )
    assert corrupted_error["code"] == "execution_failed"
    for field in ("message", "detail"):
        assert _CHINESE_CHAR_RE.search(corrupted_error[field])
        assert not _SECRET_LEAK_RE.search(corrupted_error[field])
        assert not _STACK_TRACE_RE.search(corrupted_error[field])
        assert not _LOCAL_PATH_OR_URI_RE.search(corrupted_error[field])
        assert not _FORBIDDEN_BRACKET_RE.search(corrupted_error[field])


def test_mid_stream_polling_exception_emits_sanitized_error_frame_without_leak(tmp_path: Path, monkeypatch):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    tokens = _seed_workspace_and_run(engine, settings, monkeypatch, run_status="running", events=[])

    call_count = 0

    def _exploding_poll(self, *, engine, user_id: str, project_id: str, run_id: str, after_seq: int = 0):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return (
                [
                    {
                        "seq": 1,
                        "eventType": "run_started",
                        "payload": {"summary": "正在校验样本结构"},
                        "createdAt": "2026-11-25T00:00:00Z",
                    }
                ],
                "running",
            )
        raise RuntimeError(
            'Traceback (most recent call last): File "/opt/evix/secret_runner.py", line 77 '
            "Authorization: Bearer sk-live-secret9988776655 postgresql+psycopg://u:pw@db:55432/evix 【流异常】"
        )

    monkeypatch.setattr(AutonomousResearchService, "poll_run_events", _exploding_poll)
    monkeypatch.setattr("evix_api.routes.autonomous_agent.asyncio.sleep", lambda _s: asyncio.sleep(0))
    app = create_app(settings=settings, engine=engine)

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, tokens["owner_cookie"])
        res = client.get(f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/stream")
        assert res.status_code == 200
        _assert_zero_sensitive_leak(res.text, res.headers, settings)
        assert not _FORBIDDEN_BRACKET_RE.search(res.text)

        frames = _parse_sse_wire(res.text)
        assert [f["id"] for f in frames] == [1, 2]
        assert [f["event"] for f in frames] == ["run_started", "error"]
        assert frames[1]["data"]["payload"]["code"] == "stream_interrupted"
        assert _CHINESE_CHAR_RE.search(frames[1]["data"]["payload"]["message"])


def test_last_event_id_and_after_seq_boundary_validation_and_cursor_reconciliation(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    events = [(i, "thought", {"thought": f"第 {i} 步稳健性核验已完成"}) for i in range(1, 6)]
    tokens = _seed_workspace_and_run(engine, settings, monkeypatch, run_status="completed", events=events)
    app = create_app(settings=settings, engine=engine)
    stream_url = f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/stream"

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, tokens["owner_cookie"])

        # Valid Last-Event-ID replay & cursor reconciliation with afterSeq
        res_zero = client.get(stream_url, headers={"Last-Event-ID": "0"})
        assert [f["id"] for f in _parse_sse_wire(res_zero.text)] == [1, 2, 3, 4, 5]

        res_three = client.get(stream_url, headers={"Last-Event-ID": "  3  "})
        assert [f["id"] for f in _parse_sse_wire(res_three.text)] == [4, 5]

        res_merge_a = client.get(f"{stream_url}?afterSeq=4", headers={"Last-Event-ID": "2"})
        assert [f["id"] for f in _parse_sse_wire(res_merge_a.text)] == [5]

        res_merge_b = client.get(f"{stream_url}?afterSeq=1", headers={"Last-Event-ID": "4"})
        assert [f["id"] for f in _parse_sse_wire(res_merge_b.text)] == [5]

        res_empty_hdr = client.get(f"{stream_url}?afterSeq=3", headers={"Last-Event-ID": ""})
        assert [f["id"] for f in _parse_sse_wire(res_empty_hdr.text)] == [4, 5]

        res_caught_up = client.get(stream_url, headers={"Last-Event-ID": "99"})
        assert res_caught_up.status_code == 200
        assert res_caught_up.text == ""

        # Invalid Last-Event-ID values (including raw Latin-1 superscript byte \xb2 -> '²' & giant integer strings) -> 422
        for bad_id in ("-1", "-0", "+1", "abc", "1.5", "0x10", "1;DROP", b"\xb2", "9" * 20, "NaN"):
            bad_res = client.get(stream_url, headers={"Last-Event-ID": bad_id})
            assert bad_res.status_code == 422, f"Expected 422 for Last-Event-ID={bad_id!r}, got {bad_res.status_code}"
            err = bad_res.json()["error"]
            assert err["code"] == "invalid_input"
            assert _CHINESE_CHAR_RE.search(err["message"])
            assert "Last-Event-ID" not in err["message"]
            assert not _FORBIDDEN_BRACKET_RE.search(err["message"])
            _assert_zero_sensitive_leak(bad_res.text, bad_res.headers, settings)

        # Negative afterSeq query or malformed UUID path parameters -> 422 invalid_input
        neg_seq = client.get(f"{stream_url}?afterSeq=-1")
        assert neg_seq.status_code == 422
        bad_uuid = client.get(f"/api/projects/{PROJECT_ID}/autonomous-runs/not-a-uuid/stream")
        assert bad_uuid.status_code == 422


def test_sse_stream_enforces_authentication_and_tenant_isolation_without_leaks(tmp_path: Path, monkeypatch):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    tokens = _seed_workspace_and_run(
        engine,
        settings,
        monkeypatch,
        run_status="completed",
        events=[(1, "completed", {"headline": "内部机密调研结论"})],
    )
    app = create_app(settings=settings, engine=engine)
    stream_url = f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/stream"

    with TestClient(app, raise_server_exceptions=False) as anon_client:
        unauth = anon_client.get(stream_url)
        assert unauth.status_code == 401
        assert unauth.json()["error"]["code"] == "session_required"
        assert "内部机密调研结论" not in unauth.text
        _assert_zero_sensitive_leak(unauth.text, unauth.headers, settings)

    with TestClient(app, raise_server_exceptions=False) as outsider_client:
        outsider_client.cookies.set(settings.cookie_name, tokens["outsider_cookie"])
        denied = outsider_client.get(stream_url)
        assert denied.status_code == 404
        assert denied.json()["error"]["code"] == "not_found"
        assert "内部机密调研结论" not in denied.text
        _assert_zero_sensitive_leak(denied.text, denied.headers, settings)

    with TestClient(app, raise_server_exceptions=False) as owner_client:
        owner_client.cookies.set(settings.cookie_name, tokens["owner_cookie"])
        missing_run = owner_client.get(
            f"/api/projects/{PROJECT_ID}/autonomous-runs/aaaaaaaa-1111-4222-8333-444444444444/stream"
        )
        assert missing_run.status_code == 404
        assert missing_run.json()["error"]["code"] == "not_found"


def test_guard_api_errors_preserves_http_status_and_scrubs_outbound_error_messages():
    async def _failing_coro():
        raise ApiError(
            409,
            "revision_conflict",
            "【沙盒算子】状态冲突 C:\\secret\\app.py Authorization: Bearer sk-live-secret1234567890",
        )

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(_guard_api_errors(_failing_coro()))
    assert exc_info.value.status == 409
    assert exc_info.value.code == "revision_conflict"
    assert _CHINESE_CHAR_RE.search(exc_info.value.message)
    assert not _FORBIDDEN_BRACKET_RE.search(exc_info.value.message)
    assert not _RAW_JARGON_RE.search(exc_info.value.message)
    assert not _SECRET_LEAK_RE.search(exc_info.value.message)
    assert not _LOCAL_PATH_OR_URI_RE.search(exc_info.value.message)
