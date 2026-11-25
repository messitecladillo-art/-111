"""Permanent CI guard #25 for plot & stat sandbox AST security, subprocess isolation, and HTTP boundary hygiene (Wave 28).

Verifies:
1. AST security validator (`validate_sandbox_ast` in `multi_agent.plot_sandbox`) deterministically blocks:
   - Forbidden system/network/filesystem/serialization imports (`os`, `sys`, `subprocess`, `socket`,
     `shutil`, `pathlib`, `urllib`, `http`, `ctypes`, `pickle`), relative imports, star/private symbol
     imports, disallowed Matplotlib submodules (`backends`), and cross-mode imports (`matplotlib` in
     `stat` mode; `itertools` in `plot` mode).
   - Forbidden calls and builtin identifiers (`open`, `eval`, `exec`, `compile`, `__import__`,
     `getattr`, `setattr`, `globals`, `locals`, `vars`, `breakpoint`, `type`).
   - Dunder attribute traversal (`__class__`, `__bases__`, `__subclasses__`, `__globals__`,
     `__builtins__`, `__mro__`), underscore import aliases, and forbidden AST statements (`global`,
     `nonlocal`, `async def`, `yield`).
   - Syntax errors, NUL/ASCII control bytes, empty scripts, and oversized scripts (`> 16,000` chars).
2. Subprocess & output safety gates:
   - Plot sandbox blocks `plt.savefig(...)` disk writes, enforces child timeouts, and rejects SVG
     `<script>`, `<image>`, `<foreignObject>`, `onload=`, and `javascript:` URI payloads.
   - Readonly stat sandbox strips `type == "text"` open-text PII before spawning the child process and
     blocks raw row exfiltration, `> 40` table rows, `> 32 KB` payloads, and `n_effective < 5` micro-cells.
3. Authenticated HTTP sandbox endpoints (`/api/projects/{id}/sandbox/plot` & `/sandbox/stat`):
   - Reject AST attacks, oversized payloads, runtime failures, unauthenticated callers, and cross-tenant
     outsiders with clean Chinese messages (`0` `500`, `0` `Traceback`, `0` `[【】「」『』]`, `0` class/path leaks).
   - Allow legitimate deterministic SVG plot preset/custom scripts and readonly statistical aggregations
     with 100% reproducible SHA-256 digests and open-text PII stripping.
"""
from __future__ import annotations

from datetime import timedelta
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from evix_api.app import create_app
from infrastructure.database.models import (
    Base,
    Member,
    Project,
    Session as DbSessionModel,
    Team,
    User,
    now,
)
from infrastructure.security import keyed
from infrastructure.settings import Settings
from multi_agent.plot_sandbox import (
    MAX_SCRIPT_CHARS,
    SandboxExecutionError,
    SandboxSecurityError,
    audit_svg_layout,
    execute_sandbox_plot,
    execute_sandbox_readonly_stat,
    validate_sandbox_ast,
)

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_A_ID = "11111111-2828-4111-8111-111111111111"
TEAM_B_ID = "22222222-2828-4222-8222-222222222222"
PROJECT_A_ID = "33333333-2828-4333-8333-333333333333"
OWNER_ID = "aaaaaaaa-2828-4aaa-8aaa-aaaaaaaaaaaa"
OUTSIDER_ID = "bbbbbbbb-2828-4bbb-8bbb-bbbbbbbbbbbb"

_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_EXCEPTION_CLASS_LEAK_RE = re.compile(
    r"\b(?:ZeroDivisionError|PermissionError|ValueError|RuntimeError|TypeError|KeyError|AttributeError"
    r"|SandboxSecurityError|SandboxExecutionError|FileNotFoundError|OSError)\b"
)
_PATH_OR_TRACE_LEAK_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
)


def _make_sqlite_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    def _on_connect(dbapi_conn, _rec):
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _l: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _lock_id: 1)

    event.listen(engine, "connect", _on_connect)
    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        mode="local_test",
        database_url="postgresql+psycopg://evix_user:sandbox_guard_pw@127.0.0.1:55432/evix_prod",
        allowed_origins=[TRUSTED_ORIGIN],
        invited_emails=["owner@example.test", "outsider@example.test"],
        auth_secret="a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        keyring={"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        mail_mode="fixture",
        provider_mode="fixture",
        sav_temp_dir=tmp_path / "sav-sandbox-guard",
        preflight_temp_dir=tmp_path / "preflight-sandbox-guard",
    )


def _seed_workspace(engine, settings: Settings, monkeypatch) -> dict[str, tuple[str, str]]:
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)

    creds = {
        "owner": ("sandbox-owner-cookie-0123456789", "sandbox-owner-csrf"),
        "outsider": ("sandbox-outsider-cookie-9876543210", "sandbox-outsider-csrf"),
    }
    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert(),
            [
                {"id": OWNER_ID, "email": "owner@example.test", "created_at": ts},
                {"id": OUTSIDER_ID, "email": "outsider@example.test", "created_at": ts},
            ],
        )
        for uid, (ck, csrf) in ((OWNER_ID, creds["owner"]), (OUTSIDER_ID, creds["outsider"])):
            conn.execute(
                DbSessionModel.__table__.insert().values(
                    user_id=uid,
                    token_hash=keyed(settings, "session/v1", ck),
                    csrf=csrf,
                    expires_at=ts + timedelta(days=30),
                    revoked_at=None,
                )
            )
        conn.execute(
            Team.__table__.insert(),
            [
                {"id": TEAM_A_ID, "name": "沙箱安全教研组A"},
                {"id": TEAM_B_ID, "name": "外部隔离组B"},
            ],
        )
        conn.execute(
            Member.__table__.insert(),
            [
                {"team_id": TEAM_A_ID, "user_id": OWNER_ID, "role": "owner"},
                {"team_id": TEAM_B_ID, "user_id": OUTSIDER_ID, "role": "owner"},
            ],
        )
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_A_ID,
                team_id=TEAM_A_ID,
                title="沙箱AST安全门禁样本项目",
                revision=1,
                questionnaire_revision=0,
                created_at=ts,
            )
        )
    return creds


def _auth_headers(cookie_val: str, csrf_val: str, *, cookie_name: str = "evix_session") -> dict[str, str]:
    return {
        "Origin": TRUSTED_ORIGIN,
        "Cookie": f"{cookie_name}={cookie_val}",
        "X-CSRF-Token": csrf_val,
    }


def _assert_clean_chinese_error_response(resp, *, expected_statuses: tuple[int, ...]) -> dict:
    assert resp.status_code != 500, f"Unexpected 500 response: {resp.text}"
    assert resp.status_code in expected_statuses, f"Expected {expected_statuses}, got {resp.status_code}: {resp.text}"
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"

    raw_text = resp.text
    assert not _PATH_OR_TRACE_LEAK_RE.search(raw_text), f"Path or traceback leaked in: {raw_text}"
    assert not _FORBIDDEN_BRACKET_RE.search(raw_text), f"Forbidden brackets leaked in: {raw_text}"
    assert not _EXCEPTION_CLASS_LEAK_RE.search(raw_text), f"Python exception class leaked in: {raw_text}"

    body = resp.json()
    err_obj = body.get("error") if isinstance(body.get("error"), dict) else body
    msg = str(err_obj.get("message") or body.get("detail") or "")
    assert _CHINESE_CHAR_RE.search(msg), f"Expected Chinese user-facing message, got: {msg!r}"
    return body


@pytest.mark.parametrize(
    ("code", "modes", "expected_reason"),
    [
        ("import os\nx = 1", ("plot", "stat"), "forbidden_import:os"),
        ("import sys\nx = 1", ("plot", "stat"), "forbidden_import:sys"),
        ("import subprocess\nx = 1", ("plot", "stat"), "forbidden_import:subprocess"),
        ("import socket\nx = 1", ("plot", "stat"), "forbidden_import:socket"),
        ("import shutil\nx = 1", ("plot", "stat"), "forbidden_import:shutil"),
        ("import pathlib\nx = 1", ("plot", "stat"), "forbidden_import:pathlib"),
        ("import urllib.request\nx = 1", ("plot", "stat"), "forbidden_import:urllib.request"),
        ("import http.client\nx = 1", ("plot", "stat"), "forbidden_import:http.client"),
        ("import ctypes\nx = 1", ("plot", "stat"), "forbidden_import:ctypes"),
        ("import pickle\nx = 1", ("plot", "stat"), "forbidden_import:pickle"),
        ("from os import environ\nx = 1", ("plot", "stat"), "forbidden_import:os"),
        ("from . import local_helper\nx = 1", ("plot", "stat"), "forbidden_import:."),
        ("from numpy import *\nx = 1", ("plot", "stat"), "forbidden_import_symbol:*"),
        ("from numpy import _NoValue\nx = 1", ("plot", "stat"), "forbidden_import_symbol:_NoValue"),
        ("from matplotlib import backends\nx = 1", ("plot",), "forbidden_matplotlib_symbol:backends"),
        ("import matplotlib.pyplot as plt\nx = 1", ("stat",), "forbidden_import:matplotlib.pyplot"),
        ("import itertools\nx = 1", ("plot",), "forbidden_import:itertools"),
    ],
)
def test_validate_sandbox_ast_blocks_forbidden_imports_across_plot_and_stat_modes(
    code: str,
    modes: tuple[str, ...],
    expected_reason: str,
) -> None:
    for mode in modes:
        with pytest.raises(SandboxSecurityError) as exc_info:
            validate_sandbox_ast(code, mode=mode)  # type: ignore[arg-type]
        assert expected_reason in str(exc_info.value)


@pytest.mark.parametrize(
    ("code", "expected_identifier"),
    [
        ("f = open('/etc/passwd', 'r')", "forbidden_identifier:open"),
        ("y = eval('2 + 2')", "forbidden_identifier:eval"),
        ("exec('a = 1')", "forbidden_identifier:exec"),
        ("c = compile('1 + 1', '<sandbox>', 'eval')", "forbidden_identifier:compile"),
        ("m = __import__('os')", "forbidden_identifier:__import__"),
        ("k = getattr(DATA, 'keys')", "forbidden_identifier:getattr"),
        ("setattr(DATA, 'injected', 1)", "forbidden_identifier:setattr"),
        ("g = globals()", "forbidden_identifier:globals"),
        ("l = locals()", "forbidden_identifier:locals"),
        ("v = vars()", "forbidden_identifier:vars"),
        ("breakpoint()", "forbidden_identifier:breakpoint"),
        ("Evil = type('Evil', (), {})", "forbidden_identifier:type"),
    ],
)
def test_validate_sandbox_ast_blocks_forbidden_calls_and_builtin_identifiers(
    code: str,
    expected_identifier: str,
) -> None:
    for mode in ("plot", "stat"):
        with pytest.raises(SandboxSecurityError) as exc_info:
            validate_sandbox_ast(code, mode=mode)  # type: ignore[arg-type]
        assert expected_identifier in str(exc_info.value)


@pytest.mark.parametrize(
    ("code", "expected_fragment"),
    [
        ("cls = ().__class__", "dunder_attribute_forbidden:__class__"),
        ("bases = ().__class__.__bases__", "dunder_attribute_forbidden:"),
        ("subs = ().__class__.__mro__[1].__subclasses__()", "dunder_attribute_forbidden:"),
        ("fn = lambda: 0\ng = fn.__globals__", "dunder_attribute_forbidden:__globals__"),
        ("b = ().__builtins__", "dunder_attribute_forbidden:__builtins__"),
        ("import math as _hidden_math\nx = 1", "dunder_alias_forbidden:_hidden_math"),
        ("from math import sqrt as _sqrt_alias\nx = 1", "dunder_alias_forbidden:_sqrt_alias"),
        ("def leak():\n    global SHARED\n    SHARED = 1", "forbidden_syntax:Global"),
        (
            "def outer():\n    x = 1\n    def inner():\n        nonlocal x\n        x = 2",
            "forbidden_syntax:Nonlocal",
        ),
        ("async def coro():\n    return 1", "forbidden_syntax:AsyncFunctionDef"),
        ("def stream_gen():\n    yield 1", "forbidden_syntax:Yield"),
    ],
)
def test_validate_sandbox_ast_blocks_dunder_traversal_aliases_and_forbidden_statements(
    code: str,
    expected_fragment: str,
) -> None:
    for mode in ("plot", "stat"):
        with pytest.raises(SandboxSecurityError) as exc_info:
            validate_sandbox_ast(code, mode=mode)  # type: ignore[arg-type]
        assert expected_fragment in str(exc_info.value)


@pytest.mark.parametrize(
    ("mode", "code", "expected_fragment"),
    [
        ("shell", "x = 1", "invalid_sandbox_mode:shell"),
        ("plot", "", "invalid_script_length"),
        ("stat", "x = 1\n" * ((MAX_SCRIPT_CHARS // 6) + 20), "invalid_script_length"),
        ("plot", "x = 1\x00\ny = 2", "control_char_forbidden"),
        ("stat", "x = 1\x07\ny = 2", "control_char_forbidden"),
        ("plot", "def broken_func(:\n    return 1", "syntax_error:"),
        ("stat", "msg = 'unterminated literal", "syntax_error:"),
    ],
)
def test_validate_sandbox_ast_blocks_syntax_errors_control_chars_empty_and_oversized_scripts(
    mode: str,
    code: str,
    expected_fragment: str,
) -> None:
    with pytest.raises(SandboxSecurityError) as exc_info:
        validate_sandbox_ast(code, mode=mode)  # type: ignore[arg-type]
    assert expected_fragment in str(exc_info.value)


def test_plot_sandbox_blocks_disk_writes_timeouts_and_unsafe_svg_injection(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target_file = tmp_path / "forbidden_escape.svg"
    disk_write_script = (
        "import matplotlib.pyplot as plt\n"
        "fig, ax = plt.subplots()\n"
        "ax.plot([0, 1], [1, 2])\n"
        "plt.savefig('forbidden_escape.svg')\n"
    )
    with pytest.raises(SandboxSecurityError) as disk_exc:
        execute_sandbox_plot(disk_write_script, {}, auto_repair=False, timeout_s=8.0)
    assert "disk_write_forbidden" in str(disk_exc.value)
    assert not target_file.exists()

    infinite_loop_script = "x = 0\nwhile True:\n    x += 1\n"
    with pytest.raises(SandboxExecutionError) as timeout_exc:
        execute_sandbox_plot(infinite_loop_script, {}, auto_repair=False, timeout_s=1.0)
    assert "sandbox_timeout" in str(timeout_exc.value)

    unsafe_svgs = [
        ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><script>alert(1)</script></svg>', "forbidden_svg_tag:script"),
        ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><image href="https://evil.test/x.png"/></svg>', "forbidden_svg_tag:image"),
        ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><foreignObject><div>x</div></foreignObject></svg>', "forbidden_svg_tag:foreignobject"),
        ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect width="10" height="10" onload="evil()"/></svg>', "forbidden_event_attr:onload"),
        ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><a href="javascript:alert(1)"><text>x</text></a></svg>', "forbidden_javascript_uri"),
    ]
    for bad_svg, expected_issue in unsafe_svgs:
        audit_res = audit_svg_layout(bad_svg)
        assert audit_res["vectorPure"] is False
        assert audit_res["passed"] is False
        assert any(expected_issue in item for item in audit_res["issues"])

    monkeypatch.setattr(
        "multi_agent.plot_sandbox._run_child",
        lambda **_kwargs: {"ok": True, "svg": unsafe_svgs[0][0]},
    )
    with pytest.raises(SandboxSecurityError) as svg_exc:
        execute_sandbox_plot("x = 1", {}, auto_repair=False)
    assert "unsafe_svg_output" in str(svg_exc.value)


def test_stat_sandbox_strips_open_text_and_blocks_row_exfiltration_and_oversized_outputs() -> None:
    pii_canary = "受访者实名张某_身份证330106_CANARY"
    questions = [
        {"id": "Q1", "variable": "satisfaction", "type": "scale", "title": "服务满意度"},
        {"id": "Q_open", "variable": "open_feedback", "type": "text", "title": "开放式意见与联系方式"},
    ]
    rows = [
        {
            "answers": {"satisfaction": float((i % 5) + 1), "Q_open": pii_canary, "open_feedback": pii_canary},
            "visibility": {"satisfaction": True, "Q_open": True, "open_feedback": True},
        }
        for i in range(12)
    ]

    verify_strip_script = (
        "q_ids = [q.get('id') for q in QUESTIONS]\n"
        "has_open = ('Q_open' in q_ids) or any('Q_open' in r['answers'] or 'open_feedback' in r['answers'] for r in ROWS)\n"
        "vals = [float(r['answers']['satisfaction']) for r in ROWS]\n"
        "RESULT = {\n"
        "    'summary': '已核验开放文本题项物理剥离与满意度均值汇总。',\n"
        "    'metrics': {'mean_satisfaction': round(sum(vals) / len(vals), 4), 'has_open_leak': 1 if has_open else 0},\n"
        "    'n_effective': len(vals),\n"
        "}\n"
    )
    clean_res = execute_sandbox_readonly_stat(verify_strip_script, questions=questions, rows=rows)
    assert clean_res.data["metrics"]["has_open_leak"] == 0
    assert pii_canary not in str(clean_res.data)

    exfil_script = (
        "RESULT = {\n"
        "    'summary': '试图直接导出全部样本行',\n"
        "    'metrics': {'count': len(ROWS)},\n"
        "    'n_effective': len(ROWS),\n"
        "    'leaked_rows': [r['answers'] for r in ROWS],\n"
        "}\n"
    )
    with pytest.raises(SandboxSecurityError) as exfil_exc:
        execute_sandbox_readonly_stat(exfil_script, questions=questions, rows=rows)
    assert "raw_row_exfiltration_blocked" in str(exfil_exc.value)

    oversized_table_rows = [
        {"answers": {"satisfaction": float((i % 5) + 1)}, "visibility": {"satisfaction": True}}
        for i in range(100)
    ]
    table_flood_script = (
        "RESULT = {\n"
        "    'summary': '超长明细表越界测试',\n"
        "    'metrics': {'ok': 1},\n"
        "    'n_effective': len(ROWS),\n"
        "    'table': {'headers': ['序号', '值'], 'rows': [[i, float(i)] for i in range(41)]},\n"
        "}\n"
    )
    with pytest.raises(SandboxSecurityError) as tbl_exc:
        execute_sandbox_readonly_stat(table_flood_script, questions=questions[:1], rows=oversized_table_rows)
    assert "stat_table_exceeds_40_rows" in str(tbl_exc.value)

    huge_blob_script = (
        "RESULT = {\n"
        "    'summary': '超限字节载荷测试',\n"
        "    'metrics': {'blob': 'A' * 34000},\n"
        "    'n_effective': len(ROWS),\n"
        "}\n"
    )
    with pytest.raises(SandboxSecurityError) as size_exc:
        execute_sandbox_readonly_stat(huge_blob_script, questions=questions[:1], rows=rows)
    assert "stat_result_exceeds_32kb" in str(size_exc.value)

    micro_cell_script = (
        "RESULT = {\n"
        "    'summary': '微小样本单元重识别风险测试',\n"
        "    'metrics': {'sub_mean': 4.5},\n"
        "    'n_effective': 3,\n"
        "}\n"
    )
    with pytest.raises(SandboxSecurityError) as k_exc:
        execute_sandbox_readonly_stat(micro_cell_script, questions=questions[:1], rows=rows)
    assert "stat_result_min_cell_n_violation" in str(k_exc.value)


@pytest.mark.parametrize(
    ("attack_label", "bad_script", "expected_code"),
    [
        ("forbidden_import_subprocess", "import subprocess\nsubprocess.run(['whoami'])", "sandbox_security_error"),
        ("forbidden_call_open", "secret = open('/etc/passwd', 'r').read()", "sandbox_security_error"),
        ("dunder_mro_escape", "escaped = ().__class__.__bases__[0].__subclasses__()", "sandbox_security_error"),
        ("syntax_error_payload", "def invalid_syntax(:\n    return 0", "sandbox_security_error"),
        ("oversized_script_chars", "x = 1\n" * 3000, "sandbox_security_error"),
        ("runtime_zero_division", "boom = 1 / 0", "sandbox_execution_error"),
    ],
)
def test_http_plot_and_stat_sandbox_reject_attacks_with_clean_chinese_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    attack_label: str,
    bad_script: str,
    expected_code: str,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")
    monkeypatch.setenv("EVIX_ENABLE_LIVE_SCHOLAR_API", "0")

    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])

    app = create_app(settings=settings, engine=engine)
    sample_questions = [{"id": "Q1", "variable": "score", "type": "scale", "title": "评分"}]
    sample_rows = [
        {"answers": {"score": float((i % 5) + 1)}, "visibility": {"score": True}}
        for i in range(8)
    ]

    with TestClient(app, raise_server_exceptions=False) as client:
        plot_resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers=owner_headers,
            json={"script": bad_script, "data": {"label": attack_label}, "autoRepair": False},
        )
        plot_body = _assert_clean_chinese_error_response(plot_resp, expected_statuses=(422,))
        plot_err = plot_body.get("error") if isinstance(plot_body.get("error"), dict) else plot_body
        assert plot_err.get("code") == expected_code

        stat_resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/stat",
            headers=owner_headers,
            json={"script": bad_script, "questions": sample_questions, "rows": sample_rows},
        )
        stat_body = _assert_clean_chinese_error_response(stat_resp, expected_statuses=(422,))
        stat_err = stat_body.get("error") if isinstance(stat_body.get("error"), dict) else stat_body
        assert stat_err.get("code") == expected_code


def test_http_sandbox_enforces_body_size_cap_auth_and_tenant_isolation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")
    monkeypatch.setenv("EVIX_ENABLE_LIVE_SCHOLAR_API", "0")

    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])
    outsider_headers = _auth_headers(*creds["outsider"])

    app = create_app(settings=settings, engine=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        oversized_plot_resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers=owner_headers,
            json={"script": "x = 1", "data": {"padding": "P" * 130_000}},
        )
        _assert_clean_chinese_error_response(oversized_plot_resp, expected_statuses=(413,))

        unauth_plot = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers={"Origin": TRUSTED_ORIGIN},
            json={"script": "x = 1"},
        )
        _assert_clean_chinese_error_response(unauth_plot, expected_statuses=(401,))

        outsider_plot = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers=outsider_headers,
            json={"script": "x = 1"},
        )
        _assert_clean_chinese_error_response(outsider_plot, expected_statuses=(404,))

        outsider_stat = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/stat",
            headers=outsider_headers,
            json={
                "script": "RESULT = {'summary': '越权测试', 'metrics': {}, 'n_effective': 6}",
                "questions": [{"id": "Q1", "variable": "score", "type": "scale"}],
                "rows": [{"answers": {"score": 4}, "visibility": {"score": True}} for _ in range(6)],
            },
        )
        _assert_clean_chinese_error_response(outsider_stat, expected_statuses=(404,))


def test_http_plot_and_stat_sandbox_allow_legitimate_deterministic_svg_and_statistical_runs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")
    monkeypatch.setenv("EVIX_ENABLE_LIVE_SCHOLAR_API", "0")

    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])

    app = create_app(settings=settings, engine=engine)
    snapshot_preset = {
        "id": "snap_guard25_bar",
        "title": "[1] 核心母洞察：construct:service_perception 各服务触点评分对比 (p = 0.000)",
        "chart": {
            "kind": "bar",
            "categories": ["预约响应效率", "现场导引体验", "售后反馈闭环", "construct:price_fairness"],
            "values": [4.32, 3.88, 4.15, 3.74],
        },
        "n_effective": 120,
    }
    custom_plot_script = (
        "import numpy as np\n"
        "import matplotlib.pyplot as plt\n"
        "xs = np.arange(len(DATA['labels']))\n"
        "ys = np.asarray(DATA['scores'], dtype=float)\n"
        "fig, ax = plt.subplots(figsize=(7.6, 4.6))\n"
        "ax.plot(xs, ys, marker='o', linewidth=2.0, color='#1f4e78')\n"
        "ax.set_xticks(xs)\n"
        "ax.set_xticklabels(DATA['labels'])\n"
        "ax.set_title('各月度综合满意度趋势')\n"
        "fig.tight_layout(pad=1.3)\n"
    )
    custom_plot_data = {
        "labels": ["一月", "二月", "三月", "四月"],
        "scores": [3.85, 4.02, 4.18, 4.36],
    }

    pii_canary = "受访者机密手机号13800138000_王五"
    stat_questions = [
        {"id": "Q_grp", "variable": "channel", "type": "single", "title": "服务渠道"},
        {"id": "Q_sat", "variable": "satisfaction", "type": "scale", "title": "整体满意度"},
        {"id": "Q_note", "variable": "raw_contact_note", "type": "text", "title": "受访者备注姓名"},
    ]
    stat_rows = [
        {
            "answers": {
                "channel": "线上" if idx % 2 == 0 else "线下",
                "satisfaction": float(4 + ((idx // 2) % 2)) if idx % 2 == 0 else float(3 + ((idx // 2) % 2)),
                "Q_note": pii_canary,
                "raw_contact_note": pii_canary,
            },
            "visibility": {"channel": True, "satisfaction": True, "Q_note": True, "raw_contact_note": True},
        }
        for idx in range(12)
    ]
    legit_stat_script = (
        "import statistics\n"
        "import itertools\n"
        "online = [float(r['answers']['satisfaction']) for r in ROWS if r['answers'].get('channel') == '线上']\n"
        "offline = [float(r['answers']['satisfaction']) for r in ROWS if r['answers'].get('channel') == '线下']\n"
        "pairs = list(itertools.islice(zip(online, offline), 6))\n"
        "diff = round(statistics.mean(online) - statistics.mean(offline), 4)\n"
        "RESULT = {\n"
        "    'summary': f'线上与线下渠道满意度均值差为 {diff:.2f}（配对核验组数 {len(pairs)}）。',\n"
        "    'metrics': {\n"
        "        'online_mean': round(statistics.mean(online), 4),\n"
        "        'offline_mean': round(statistics.mean(offline), 4),\n"
        "        'mean_diff': diff,\n"
        "    },\n"
        "    'table': {\n"
        "        'headers': ['渠道分组', '样本量', '满意度均值'],\n"
        "        'rows': [\n"
        "            ['线上渠道', len(online), round(statistics.mean(online), 4)],\n"
        "            ['线下渠道', len(offline), round(statistics.mean(offline), 4)],\n"
        "        ],\n"
        "    },\n"
        "    'n_effective': len(online) + len(offline),\n"
        "}\n"
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        preset_r1 = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers=owner_headers,
            json={"snapshot": snapshot_preset, "chartKind": "bar"},
        )
        preset_r2 = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers=owner_headers,
            json={"snapshot": snapshot_preset, "chartKind": "bar"},
        )
        assert preset_r1.status_code == 200, preset_r1.text
        assert preset_r2.status_code == 200, preset_r2.text
        b1, b2 = preset_r1.json(), preset_r2.json()
        assert b1["audit"]["passed"] is True
        assert b1["audit"]["vectorPure"] is True
        assert b1["svgSha256"] == b2["svgSha256"]
        assert b1["svg"] == b2["svg"]
        root = ET.fromstring(b1["svg"])
        assert root.tag.endswith("svg")
        svg_visible_text = "".join(root.itertext())
        assert "construct:" not in b1["svg"]
        assert "p = 0.000" not in svg_visible_text
        assert "p < 0.0001" in svg_visible_text
        assert "服务感知综合分" in svg_visible_text
        assert not _FORBIDDEN_BRACKET_RE.search(preset_r1.text)

        custom_r1 = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers=owner_headers,
            json={"script": custom_plot_script, "data": custom_plot_data},
        )
        custom_r2 = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/plot",
            headers=owner_headers,
            json={"script": custom_plot_script, "data": custom_plot_data},
        )
        assert custom_r1.status_code == 200, custom_r1.text
        assert custom_r2.status_code == 200, custom_r2.text
        c1, c2 = custom_r1.json(), custom_r2.json()
        assert c1["audit"]["passed"] is True
        assert c1["svgSha256"] == c2["svgSha256"]

        stat_r1 = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/stat",
            headers=owner_headers,
            json={"script": legit_stat_script, "questions": stat_questions, "rows": stat_rows},
        )
        stat_r2 = client.post(
            f"/api/projects/{PROJECT_A_ID}/sandbox/stat",
            headers=owner_headers,
            json={"script": legit_stat_script, "questions": stat_questions, "rows": stat_rows},
        )
        assert stat_r1.status_code == 200, stat_r1.text
        assert stat_r2.status_code == 200, stat_r2.text
        s1, s2 = stat_r1.json(), stat_r2.json()
        assert s1["n_effective"] == 12
        assert s1["metrics"]["mean_diff"] == 1.0
        assert s1["snapshotId"] == s2["snapshotId"]
        assert s1["result_hash"] == s2["result_hash"]
        assert s1["script_sha256"] == s2["script_sha256"]
        assert pii_canary not in stat_r1.text
        assert not _FORBIDDEN_BRACKET_RE.search(stat_r1.text)
