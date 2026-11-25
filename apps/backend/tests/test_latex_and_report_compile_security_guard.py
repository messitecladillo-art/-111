"""Permanent CI guard #27 (CI-BE-27) for LaTeX compile security, report optimistic concurrency, and section coordinator integrity (Wave 29).

Verifies:
1. LaTeX dangerous macro, path-escape, hex-escape, control-byte, and size defense (`latex.py`):
   - Blocks `\\write18`, `\\immediate\\write18`, `\\input{/etc/passwd}`, `\\include{../}`, `\\openin`,
     `\\openout`, `\\catcode`, `\\csname`, `^^` TeX hex escapes, macro definitions (`\\def`, `\\edef`,
     `\\let`, `\\makeatletter`, `\\usepackage`, `\\verbatiminput`), and disallowed `verbatim` environments.
   - Rejects NUL/ASCII control bytes and oversized `.tex` payloads (`> 120,000` body chars -> `422`;
     `> 2 MB` assembled `.tex` source -> `413 latex_source_too_large`; hourly rate cap -> `429`).
   - Enforces subprocess environment hardening (`openin_any=p`, `openout_any=p`, `shell_escape=f`,
     zero ambient API-key/secret forwarding) and RFC 5987 `Content-Disposition` headers on compile exports.
2. Report CRUD optimistic concurrency & multi-tenant isolation (`reports.py`):
   - `expectedRevision` CAS (`0 -> 1 -> 2`), idempotent replay stability, stale/future `expectedRevision`
     conflict -> clean `409 revision_conflict`, cross-tenant `404` read/write isolation, viewer `403`
     write block, prototype-pollution/non-HTTPS `sourceUrl` rejection (`422`), and cross-site `403`.
3. Full report section coordinator security & prose hygiene (`full_report_section.py`):
   - Blocks unauthorized runs (`409`), missing consent (`422`), plain & `\\uXXXX`-escaped API secret leaks
     in inputs/outputs (`422` / `invalid_response`), context/service revision drift (`409`), out-of-order
     `attempt: 2` (`409`), and purifies `[【】「」『』]` / `p = 0.000` while preserving `$...$` and `{G1}`.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path
import re
from urllib.parse import unquote
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event, update
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from evix_api.app import create_app
from infrastructure.database.models import (
    Base,
    Member,
    Project,
    Service,
    Session as DbSessionModel,
    Team,
    User,
    now,
)
from infrastructure.llm import Completion
from infrastructure.security import encrypt, keyed
from infrastructure.settings import Settings
from multi_agent.agents.writing_agent.tools import latex as latex_domain
from shared.errors import ApiError

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_A_ID = "11111111-2929-4111-8111-111111111111"
TEAM_B_ID = "22222222-2929-4222-8222-222222222222"
PROJECT_A_ID = "33333333-2929-4333-8333-333333333333"
SERVICE_A_ID = "44444444-2929-4444-8444-444444444444"
OWNER_ID = "aaaaaaaa-2929-4aaa-8aaa-aaaaaaaaaaaa"
VIEWER_ID = "cccccccc-2929-4ccc-8ccc-cccccccccccc"
OUTSIDER_ID = "bbbbbbbb-2929-4bbb-8bbb-bbbbbbbbbbbb"
CANARY_API_SECRET = "sk-report-canary-secret-2929abcdef012345"

_CONTENT_DISP_RE = re.compile(
    r'^attachment; filename="([A-Za-z0-9._-]+)"; filename\*=UTF-8\'\'([A-Za-z0-9%\-._~]+)$'
)
_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_LEAK_TRACE_OR_PATH_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
)
_EXCEPTION_CLASS_RE = re.compile(
    r"\b(?:UnsafeBody|ValueError|RuntimeError|TypeError|KeyError|AttributeError|OSError|OverflowError"
    r"|SQLAlchemyError|IntegrityError|ValidationError|RequestValidationError)\b"
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


def _make_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:latex_guard_pw@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": ["owner@example.test", "viewer@example.test", "outsider@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "latex_compiler": "",
        "sav_temp_dir": tmp_path / "sav-latex-guard",
        "preflight_temp_dir": tmp_path / "preflight-latex-guard",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_workspace(engine, settings: Settings, monkeypatch) -> dict[str, tuple[str, str]]:
    ts_utc = now()
    ts = ts_utc.replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    monkeypatch.setattr("application.services.latex.now", lambda: ts_utc)
    monkeypatch.setattr("application.services.full_report_section.now", lambda: ts_utc)
    monkeypatch.setattr("multi_agent.agents.writing_agent.services.full_report_section.now", lambda: ts_utc)

    creds = {
        "owner": ("latex-owner-cookie-0123456789", "latex-owner-csrf"),
        "viewer": ("latex-viewer-cookie-5555555555", "latex-viewer-csrf"),
        "outsider": ("latex-outsider-cookie-9876543210", "latex-outsider-csrf"),
    }
    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert(),
            [
                {"id": OWNER_ID, "email": "owner@example.test", "created_at": ts},
                {"id": VIEWER_ID, "email": "viewer@example.test", "created_at": ts},
                {"id": OUTSIDER_ID, "email": "outsider@example.test", "created_at": ts},
            ],
        )
        for uid, (ck, csrf) in (
            (OWNER_ID, creds["owner"]),
            (VIEWER_ID, creds["viewer"]),
            (OUTSIDER_ID, creds["outsider"]),
        ):
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
                {"id": TEAM_A_ID, "name": "报告排版安全组A"},
                {"id": TEAM_B_ID, "name": "外部隔离对照课题组B"},
            ],
        )
        conn.execute(
            Member.__table__.insert(),
            [
                {"team_id": TEAM_A_ID, "user_id": OWNER_ID, "role": "owner"},
                {"team_id": TEAM_A_ID, "user_id": VIEWER_ID, "role": "viewer"},
                {"team_id": TEAM_B_ID, "user_id": OUTSIDER_ID, "role": "owner"},
            ],
        )
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_A_ID,
                team_id=TEAM_A_ID,
                title="县域智慧养老服务满意度实证调查",
                revision=1,
                questionnaire_revision=0,
                created_at=ts,
            )
        )

    with OrmSession(engine) as orm_session:
        svc = Service(
            id=SERVICE_A_ID,
            user_id=OWNER_ID,
            label="报告生成专用模型连接",
            provider="openai",
            base_url="https://api.openai.com/v1",
            model="gpt-4o-mini",
            max_output_tokens=3600,
            capabilities=["report", "topic", "proposal"],
            revision=1,
            key_id=settings.active_key_id,
            iv=b"\x00" * 12,
            ciphertext=b"",
            deleted=False,
        )
        encrypt(settings, svc, CANARY_API_SECRET)
        orm_session.add(svc)
        orm_session.commit()

    return creds


def _auth_headers(cookie_val: str, csrf_val: str) -> dict[str, str]:
    return {
        "Origin": TRUSTED_ORIGIN,
        "Cookie": f"evix_session={cookie_val}",
        "X-CSRF-Token": csrf_val,
    }


def _default_latex_options() -> dict:
    return {
        "part": "main",
        "includeCover": True,
        "includeToc": True,
        "firstLineChars": 2,
        "numberPages": True,
    }


def _sample_report_content(body_text: str = "合成报告摘要正文，仅用于门禁核验。") -> dict:
    sha_zero = "0" * 64
    sha_one = "1" * 64
    return {
        "version": 2,
        "title": "县域社区智慧助餐服务满意度调查报告",
        "subtitle": "基于三县十二社区分层样本的实证检验",
        "accent": "teal",
        "report": [
            {
                "id": "abstract",
                "title": "摘要",
                "body": body_text,
                "source": "",
                "findingIds": ["finding-1"],
                "findingSnapshots": {"finding-1": "社区送餐准时率与复购意愿显著正相关。"},
            }
        ],
        "slides": [
            {
                "id": "slide-1",
                "title": "核心研究发现",
                "body": "准时率边际效应显著",
                "aside": "",
                "notes": "答辩汇报备注",
                "layout": "cover",
            }
        ],
        "quality": {
            "version": 1,
            "results": [
                {
                    "id": "res-1",
                    "title": "满意度均值分布",
                    "sourceName": "调研清洗数据集",
                    "sourceUrl": "https://stats.gov.cn/tjsj",
                    "sourceHash": sha_zero,
                    "resultHash": sha_one,
                    "classification": "user_provided",
                    "method": "descriptive",
                    "n": 320,
                    "total": 320,
                    "headers": ["维度", "均值"],
                    "rows": [["助餐准时度", 4.35]],
                    "metrics": [{"label": "有效样本量", "value": 320}],
                    "warnings": [],
                }
            ],
            "findings": [
                {
                    "id": "finding-1",
                    "title": "准时度核心痛点",
                    "question": "送餐准时率是否关联整体满意度？",
                    "evidenceIds": ["res-1"],
                    "interpretation": "准时率每提升 1 分，满意度均值同步上升。",
                    "alternatives": "季节天气波动",
                    "scope": "县域社区助餐点样本内",
                    "action": "建立社区网格错峰配送调度表",
                    "status": "confirmed",
                    "confirmedHashes": {"res-1": sha_one},
                }
            ],
        },
        "reportFormat": {
            "edition": "第十七届",
            "group": "本科组",
            "region": "华东赛区",
            "track": "民生服务",
            "stage": "省赛",
            "profileId": "btbu-17-report-layout-v1",
            "options": _default_latex_options(),
        },
    }


def _assert_clean_chinese_error(resp, *, expected_statuses: tuple[int, ...], expected_code: str | None = None) -> dict:
    assert resp.status_code != 500, f"Unexpected 500 error: {resp.text}"
    assert resp.status_code in expected_statuses, f"Expected {expected_statuses}, got {resp.status_code}: {resp.text}"
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"

    raw = resp.text
    assert not _LEAK_TRACE_OR_PATH_RE.search(raw), f"Path or stack trace leaked: {raw}"
    assert not _FORBIDDEN_BRACKET_RE.search(raw), f"Forbidden brackets leaked: {raw}"
    assert not _EXCEPTION_CLASS_RE.search(raw), f"Exception class leaked: {raw}"
    assert CANARY_API_SECRET not in raw, "Encrypted API secret leaked in error response"

    data = resp.json()
    err = data.get("error") if isinstance(data.get("error"), dict) else data
    msg = str(err.get("message") or data.get("detail") or "")
    assert _CHINESE_CHAR_RE.search(msg), f"Expected Chinese message, got: {msg!r}"
    if expected_code is not None:
        assert err.get("code") == expected_code, f"Expected code {expected_code!r}, got {err.get('code')!r} ({data})"
    return data


@pytest.mark.parametrize(
    ("attack_id", "malicious_tex"),
    [
        ("write18_shell", r"\section{引言}" + "\n" + r"\write18{whoami}"),
        ("immediate_write18", r"\immediate\write18{cat /etc/passwd}"),
        ("input_etc_passwd", r"\input{/etc/passwd}"),
        ("include_parent_escape", r"\include{../../secret}"),
        ("openin_stream", r"\openin1=/etc/passwd"),
        ("openout_stream", r"\openout1=backdoor.tex"),
        ("catcode_mutation", r"\catcode64=11"),
        ("csname_bypass", r"\csname write18\endcsname{id}"),
        ("caret_hex_backslash", "正文段落 ^^5cwrite18{id}"),
        ("caret_hex_null", "正文段落 ^^00 尾部"),
        ("caret_hex_del", "正文段落 ^^7f 尾部"),
        ("def_macro", r"\def\evil{1}"),
        ("edef_macro", r"\edef\evil{1}"),
        ("let_alias", r"\let\a\section"),
        ("makeatletter_unlock", r"\makeatletter"),
        ("usepackage_in_body", r"\usepackage{shellesc}"),
        ("verbatiminput_file", r"\verbatiminput{/etc/hosts}"),
        ("disallowed_verbatim_env", "\\begin{verbatim}\nraw\n\\end{verbatim}"),
    ],
)
def test_latex_validate_body_blocks_dangerous_macros_path_escapes_and_hex_encodings(
    attack_id: str,
    malicious_tex: str,
) -> None:
    with pytest.raises(latex_domain.UnsafeBody) as exc_info:
        latex_domain.validate_body(malicious_tex)
    err = exc_info.value
    assert isinstance(err.line, int) and err.line >= 1, attack_id
    assert _CHINESE_CHAR_RE.search(err.message), f"Non-Chinese diagnostic for {attack_id}: {err.message!r}"
    assert not _FORBIDDEN_BRACKET_RE.search(err.message)
    assert "/etc/" not in err.message and ".." not in err.message


@pytest.mark.parametrize(
    ("case_id", "title_text", "tex_body", "expect_http_status"),
    [
        ("http_write18", "智慧养老调查报告", r"\write18{id}", 200),
        ("http_immediate_write18", "智慧养老调查报告", r"\immediate\write18{id}", 200),
        ("http_input_passwd", "智慧养老调查报告", r"\input{/etc/passwd}", 200),
        ("http_include_traversal", "智慧养老调查报告", r"\include{../secret}", 200),
        ("http_openin", "智慧养老调查报告", r"\openin1=/etc/passwd", 200),
        ("http_openout", "智慧养老调查报告", r"\openout1=leak.tex", 200),
        ("http_catcode", "智慧养老调查报告", r"\catcode`\@=11", 200),
        ("http_csname", "智慧养老调查报告", r"\csname input\endcsname{/etc/passwd}", 200),
        ("http_hex_escape", '报告"标题"_测试', "第一章 ^^5cinput{/etc/passwd}", 200),
        ("http_null_in_body", "智慧养老调查报告", "第一章 绪论\x00隐蔽载荷", 422),
        ("http_null_in_title", "智慧养老\x00标题注入", r"\section{绪论}正常正文。", 422),
        ("http_ctrl_bell_in_body", "智慧养老调查报告", "第一章 绪论\x07控制符", 422),
        ("http_oversized_body_chars", "智慧养老调查报告", "__OVERSIZED_BODY__", 422),
    ],
    ids=[
        "http_write18",
        "http_immediate_write18",
        "http_input_passwd",
        "http_include_traversal",
        "http_openin",
        "http_openout",
        "http_catcode",
        "http_csname",
        "http_hex_escape",
        "http_null_in_body",
        "http_null_in_title",
        "http_ctrl_bell_in_body",
        "http_oversized_body_chars",
    ],
)
def test_http_latex_compile_rejects_dangerous_tex_null_bytes_and_oversized_body_with_rfc5987_headers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    case_id: str,
    title_text: str,
    tex_body: str,
    expect_http_status: int,
) -> None:
    if tex_body == "__OVERSIZED_BODY__":
        tex_body = "文" * (latex_domain.MAX_BODY + 1)
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])

    app = create_app(settings=settings, engine=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/report/latex/compile",
            headers=owner_headers,
            json={
                "title": title_text,
                "subtitle": "安全边界验证副标题",
                "body": tex_body,
                "options": _default_latex_options(),
            },
        )
        if expect_http_status == 422:
            _assert_clean_chinese_error(resp, expected_statuses=(422,))
            return

        assert resp.status_code == 200, f"{case_id}: {resp.text}"
        assert resp.headers.get("cache-control") == "no-store"
        assert resp.headers.get("x-content-type-options") == "nosniff"
        cdisp = resp.headers.get("content-disposition", "")
        assert "\r" not in cdisp and "\n" not in cdisp
        disp_match = _CONTENT_DISP_RE.match(cdisp)
        assert disp_match is not None, f"Invalid RFC 5987 Content-Disposition: {cdisp!r}"
        assert disp_match.group(1).endswith(".tex")
        assert unquote(disp_match.group(2)).endswith(".tex")

        payload = resp.json()
        assert payload["status"] == "error"
        assert payload["pdfBase64"] is None
        assert isinstance(payload["diagnostics"], list) and len(payload["diagnostics"]) == 1
        diag_msg = payload["diagnostics"][0]["message"]
        assert _CHINESE_CHAR_RE.search(diag_msg)
        assert not _FORBIDDEN_BRACKET_RE.search(diag_msg)
        assert not _LEAK_TRACE_OR_PATH_RE.search(diag_msg)


def test_latex_build_source_2mb_cap_title_escaping_sanitized_env_and_rate_limits(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ApiError) as size_exc:
        latex_domain.build_source(
            "超限体积测试",
            "副标题",
            "汉" * 700_000,
            _default_latex_options(),
        )
    assert size_exc.value.status == 413
    assert size_exc.value.code == "latex_source_too_large"
    assert _CHINESE_CHAR_RE.search(size_exc.value.message)

    safe_src = latex_domain.build_source(
        r"标题\write18{id}$&#%_^~",
        r"副标\input{/etc/passwd}",
        r"\section{第一章 绪论}" + "\n本研究围绕县域养老展开。",
        _default_latex_options(),
    )
    preamble_before_body = safe_src.split("% BODY START", 1)[0]
    assert r"\write18{" not in preamble_before_body
    assert r"\input{" not in preamble_before_body
    assert r"\textbackslash{}write18\{id\}" in preamble_before_body

    monkeypatch.setenv("OPENAI_API_KEY", "sk-ambient-openai-secret-should-not-leak")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-ambient-deepseek-secret-should-not-leak")
    monkeypatch.setenv("EVIX_AUTH_SECRET", "ambient-evix-auth-secret")
    env = latex_domain.sanitized_environment(tmp_path, str(tmp_path / "xelatex"))
    assert env["openin_any"] == "p"
    assert env["openout_any"] == "p"
    assert env["shell_escape"] == "f"
    assert env["MIKTEX_ENABLE_INSTALLER"] == "0"
    assert "OPENAI_API_KEY" not in env
    assert "DEEPSEEK_API_KEY" not in env
    assert "EVIX_AUTH_SECRET" not in env

    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path, latex_hourly_compiles=1)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])
    app = create_app(settings=settings, engine=engine)

    valid_compile_req = {
        "title": "县域智慧养老服务调查报告",
        "subtitle": "基于分层随机抽样的实证研究",
        "body": r"\section{绪论}" + "\n县域养老助餐体系呈现稳步扩面态势。",
        "options": _default_latex_options(),
    }
    with TestClient(app, raise_server_exceptions=False) as client:
        first_ok = client.post(
            f"/api/projects/{PROJECT_A_ID}/report/latex/compile",
            headers=owner_headers,
            json=valid_compile_req,
        )
        assert first_ok.status_code == 200
        first_body = first_ok.json()
        assert first_body["status"] == "unavailable"
        assert _CONTENT_DISP_RE.match(first_ok.headers.get("content-disposition", ""))

        second_limited = client.post(
            f"/api/projects/{PROJECT_A_ID}/report/latex/compile",
            headers=owner_headers,
            json=valid_compile_req,
        )
        _assert_clean_chinese_error(second_limited, expected_statuses=(429,), expected_code="latex_rate_limit")


def test_report_crud_optimistic_concurrency_409_idempotency_and_version_history(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])

    app = create_app(settings=settings, engine=engine)
    base_url = f"/api/projects/{PROJECT_A_ID}/report"
    with TestClient(app, raise_server_exceptions=False) as client:
        empty_res = client.get(base_url, headers=owner_headers)
        assert empty_res.status_code == 200 and empty_res.json() == {"report": None}

        idem_v1 = str(uuid4())
        v1_payload = {
            "content": _sample_report_content("第一版实证摘要正文。"),
            "expectedRevision": 0,
            "idempotencyKey": idem_v1,
        }
        r_v1 = client.post(f"{base_url}/versions", headers=owner_headers, json=v1_payload)
        assert r_v1.status_code == 201, r_v1.text
        v1 = r_v1.json()
        assert v1["revision"] == 1
        assert v1["projectId"] == PROJECT_A_ID
        assert v1["content"]["report"][0]["body"] == "第一版实证摘要正文。"

        replay_v1 = client.post(f"{base_url}/versions", headers=owner_headers, json=v1_payload)
        assert replay_v1.status_code == 201
        assert replay_v1.json() == v1

        stale_conflict = client.post(
            f"{base_url}/versions",
            headers=owner_headers,
            json={
                "content": _sample_report_content("并发冲突覆盖企图。"),
                "expectedRevision": 0,
                "idempotencyKey": str(uuid4()),
            },
        )
        _assert_clean_chinese_error(stale_conflict, expected_statuses=(409,), expected_code="revision_conflict")

        future_conflict = client.post(
            f"{base_url}/versions",
            headers=owner_headers,
            json={
                "content": _sample_report_content("跳号修订冲突企图。"),
                "expectedRevision": 7,
                "idempotencyKey": str(uuid4()),
            },
        )
        _assert_clean_chinese_error(future_conflict, expected_statuses=(409,), expected_code="revision_conflict")

        r_v2 = client.post(
            f"{base_url}/versions",
            headers=owner_headers,
            json={
                "content": _sample_report_content("第二版经核验修订摘要正文。"),
                "expectedRevision": 1,
                "idempotencyKey": str(uuid4()),
            },
        )
        assert r_v2.status_code == 201
        v2 = r_v2.json()
        assert v2["revision"] == 2
        assert v2["id"] != v1["id"]

        latest_get = client.get(base_url, headers=owner_headers)
        assert latest_get.status_code == 200 and latest_get.json()["report"]["revision"] == 2

        list_all = client.get(f"{base_url}/versions", headers=owner_headers)
        assert list_all.status_code == 200
        assert [item["revision"] for item in list_all.json()["versions"]] == [2, 1]

        list_before = client.get(f"{base_url}/versions?beforeRevision=2", headers=owner_headers)
        assert list_before.status_code == 200
        assert [item["revision"] for item in list_before.json()["versions"]] == [1]

        ver_one_get = client.get(f"{base_url}/versions/{v1['id']}", headers=owner_headers)
        assert ver_one_get.status_code == 200 and ver_one_get.json()["id"] == v1["id"]

        missing_ver = client.get(f"{base_url}/versions/{uuid4()}", headers=owner_headers)
        _assert_clean_chinese_error(missing_ver, expected_statuses=(404,), expected_code="not_found")


@pytest.mark.parametrize(
    ("actor", "method", "subpath", "expected_status"),
    [
        ("unauth", "GET", "/report", 401),
        ("unauth", "POST", "/report/versions", 401),
        ("unauth", "POST", "/report/latex/compile", 401),
        ("outsider", "GET", "/report", 404),
        ("outsider", "GET", "/report/versions", 404),
        ("outsider", "POST", "/report/versions", 404),
        ("outsider", "GET", "/report/ai-usage", 404),
        ("outsider", "POST", "/report/latex/compile", 404),
        ("viewer", "POST", "/report/versions", 403),
    ],
)
def test_report_and_latex_cross_tenant_and_role_isolation_matrix(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    actor: str,
    method: str,
    subpath: str,
    expected_status: int,
) -> None:
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)

    if actor == "unauth":
        headers = {"Origin": TRUSTED_ORIGIN}
    else:
        headers = _auth_headers(*creds[actor])

    app = create_app(settings=settings, engine=engine)
    url = f"/api/projects/{PROJECT_A_ID}{subpath}"
    with TestClient(app, raise_server_exceptions=False) as client:
        if actor == "viewer":
            viewer_read = client.get(f"/api/projects/{PROJECT_A_ID}/report", headers=headers)
            assert viewer_read.status_code == 200

        if method == "GET":
            resp = client.get(url, headers=headers)
        elif subpath.endswith("/compile"):
            resp = client.post(
                url,
                headers=headers,
                json={
                    "title": "越权编译测试",
                    "subtitle": "",
                    "body": r"\section{测试}",
                    "options": _default_latex_options(),
                },
            )
        else:
            resp = client.post(
                url,
                headers=headers,
                json={
                    "content": _sample_report_content("越权写入测试"),
                    "expectedRevision": 0,
                    "idempotencyKey": str(uuid4()),
                },
            )
        _assert_clean_chinese_error(resp, expected_statuses=(expected_status,))


@pytest.mark.parametrize(
    ("attack_name", "endpoint", "cross_site", "mutator", "expected_status"),
    [
        (
            "non_https_source_url",
            f"/api/projects/{PROJECT_A_ID}/report/versions",
            False,
            lambda c: c["quality"]["results"][0].__setitem__("sourceUrl", "http://169.254.169.254/latest/meta-data"),
            422,
        ),
        (
            "proto_key_in_confirmed_hashes",
            f"/api/projects/{PROJECT_A_ID}/report/versions",
            False,
            lambda c: (
                c["quality"]["results"][0].__setitem__("id", "__proto__"),
                c["quality"]["findings"][0].__setitem__("evidenceIds", ["__proto__"]),
                c["quality"]["findings"][0].__setitem__("confirmedHashes", {"__proto__": "1" * 64}),
            ),
            422,
        ),
        (
            "control_del_in_region",
            f"/api/projects/{PROJECT_A_ID}/report/versions",
            False,
            lambda c: c["reportFormat"].__setitem__("region", "华东\x7f赛区"),
            422,
        ),
        (
            "forged_extra_root_field",
            f"/api/projects/{PROJECT_A_ID}/report/versions",
            False,
            lambda c: c.__setitem__("officiallyApproved", True),
            422,
        ),
        (
            "cross_site_preflight_audit",
            "/api/reports/preflight-audit",
            True,
            None,
            403,
        ),
        (
            "cross_site_cover_assemble",
            "/api/reports/cover-assemble",
            True,
            None,
            403,
        ),
    ],
)
def test_report_content_and_preflight_endpoints_reject_malicious_payloads_with_chinese_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    attack_name: str,
    endpoint: str,
    cross_site: bool,
    mutator,
    expected_status: int,
) -> None:
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    headers = _auth_headers(*creds["owner"])
    if cross_site:
        headers = {**headers, "Sec-Fetch-Site": "cross-site"}

    app = create_app(settings=settings, engine=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        if mutator is not None:
            bad_content = deepcopy(_sample_report_content())
            mutator(bad_content)
            resp = client.post(
                endpoint,
                headers=headers,
                json={"content": bad_content, "expectedRevision": 0, "idempotencyKey": str(uuid4())},
            )
        else:
            resp = client.post(endpoint, headers=headers, json={"title": attack_name})
        _assert_clean_chinese_error(resp, expected_statuses=(expected_status,))


class _SectionSecurityStubProvider:
    async def section_draft(self, config, key, prompt):
        if "TRIGGER_SECRET_ECHO_PROBE" in prompt:
            leaked = Completion(json.dumps({"paragraphs": [{"text": f"异常回显密钥 {key}"}]}))
            leaked.usage = {"inputTokens": 42, "outputTokens": 18}
            return leaked
        clean = Completion(
            json.dumps(
                {
                    "paragraphs": [
                        {
                            "text": "「县域银发群体」【关键实证】[分层检验]显示显著正相关（p = 0.000），模型拟合度 $R^2 = 0.72$，详见图表 {G1}。"
                        }
                    ]
                },
                ensure_ascii=False,
            )
        )
        clean.usage = {"inputTokens": 120, "outputTokens": 64}
        return clean


def test_full_report_section_authorization_concurrency_secret_redaction_and_prose_hygiene(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])
    viewer_headers = _auth_headers(*creds["viewer"])
    outsider_headers = _auth_headers(*creds["outsider"])

    run_id = str(uuid4())
    base_preflight = {
        "schemaVersion": 1,
        "runId": run_id,
        "projectId": PROJECT_A_ID,
        "inputRevision": "rev-clean-2026-w29",
        "serviceId": SERVICE_A_ID,
        "serviceRevision": 1,
        "consent": True,
        "mode": "empirical",
    }

    app = create_app(settings=settings, engine=engine, provider=_SectionSecurityStubProvider())
    with TestClient(app, raise_server_exceptions=False) as client:
        unauth_run_call = client.post(
            "/api/agent/report-sections",
            headers=owner_headers,
            json={
                **base_preflight,
                "idempotencyKey": str(uuid4()),
                "nodeId": "sample.descriptive",
                "prompt": "未预授权直接调用章节生成。",
                "wave": 1,
                "attempt": 1,
                "purpose": "draft",
            },
        )
        _assert_clean_chinese_error(unauth_run_call, expected_statuses=(409,), expected_code="run_not_authorized")

        no_consent = client.post(
            "/api/agent/report-sections/preflight",
            headers=owner_headers,
            json={**base_preflight, "runId": str(uuid4()), "consent": False},
        )
        _assert_clean_chinese_error(no_consent, expected_statuses=(422,), expected_code="consent_required")

        escaped_secret = "\\u0073\\u006b" + CANARY_API_SECRET[2:]
        for leaked_rev in (f"rev-{CANARY_API_SECRET}", f"rev-{escaped_secret}"):
            secret_pf = client.post(
                "/api/agent/report-sections/preflight",
                headers=owner_headers,
                json={**base_preflight, "runId": str(uuid4()), "inputRevision": leaked_rev},
            )
            _assert_clean_chinese_error(secret_pf, expected_statuses=(422,), expected_code="sensitive_input")

        outsider_pf = client.post(
            "/api/agent/report-sections/preflight",
            headers=outsider_headers,
            json={**base_preflight, "runId": str(uuid4())},
        )
        _assert_clean_chinese_error(outsider_pf, expected_statuses=(404,))

        viewer_pf = client.post(
            "/api/agent/report-sections/preflight",
            headers=viewer_headers,
            json={**base_preflight, "runId": str(uuid4())},
        )
        _assert_clean_chinese_error(viewer_pf, expected_statuses=(403,), expected_code="permission_denied")

        ok_pf = client.post(
            "/api/agent/report-sections/preflight",
            headers=owner_headers,
            json=base_preflight,
        )
        assert ok_pf.status_code == 200, ok_pf.text
        assert ok_pf.json()["status"] == "authorized"
        assert CANARY_API_SECRET not in ok_pf.text

        ctx_drift = client.post(
            "/api/agent/report-sections",
            headers=owner_headers,
            json={
                **base_preflight,
                "inputRevision": "tampered-input-revision",
                "idempotencyKey": str(uuid4()),
                "nodeId": "sample.descriptive",
                "prompt": "上下文篡改测试",
                "wave": 1,
                "attempt": 1,
                "purpose": "draft",
            },
        )
        _assert_clean_chinese_error(ctx_drift, expected_statuses=(409,), expected_code="run_context_conflict")

        bad_wave = client.post(
            "/api/agent/report-sections",
            headers=owner_headers,
            json={
                **base_preflight,
                "idempotencyKey": str(uuid4()),
                "nodeId": "abstract",
                "prompt": "阶段错位测试",
                "wave": 1,
                "attempt": 1,
                "purpose": "draft",
            },
        )
        _assert_clean_chinese_error(bad_wave, expected_statuses=(422,), expected_code="section_wave_mismatch")

        bad_attempt_order = client.post(
            "/api/agent/report-sections",
            headers=owner_headers,
            json={
                **base_preflight,
                "idempotencyKey": str(uuid4()),
                "nodeId": "sample.descriptive",
                "prompt": "未完成首轮起草即请求二轮修订",
                "wave": 1,
                "attempt": 2,
                "purpose": "revision",
            },
        )
        _assert_clean_chinese_error(bad_attempt_order, expected_statuses=(409,), expected_code="attempt_order")

        sec_ok_id = str(uuid4())
        sec_ok = client.post(
            "/api/agent/report-sections",
            headers=owner_headers,
            json={
                **base_preflight,
                "idempotencyKey": sec_ok_id,
                "nodeId": "sample.descriptive",
                "prompt": "请依据已登记满意度统计表撰写样本描述节。",
                "wave": 1,
                "attempt": 1,
                "purpose": "draft",
            },
        )
        assert sec_ok.status_code == 201, sec_ok.text
        sec_data = sec_ok.json()
        assert sec_data["status"] == "ready"
        parsed_content = json.loads(sec_data["content"])
        cleaned_para = parsed_content["paragraphs"][0]["text"]
        assert not _FORBIDDEN_BRACKET_RE.search(cleaned_para)
        assert "p = 0.000" not in cleaned_para
        assert "p < 0.0001" in cleaned_para
        assert "$R^2 = 0.72$" in cleaned_para
        assert "{G1}" in cleaned_para
        assert CANARY_API_SECRET not in sec_ok.text

        sec_echo_id = str(uuid4())
        sec_echo = client.post(
            "/api/agent/report-sections",
            headers=owner_headers,
            json={
                **base_preflight,
                "idempotencyKey": sec_echo_id,
                "nodeId": "compare.tests",
                "prompt": "TRIGGER_SECRET_ECHO_PROBE 验证模型输出密钥回显阻断",
                "wave": 1,
                "attempt": 1,
                "purpose": "draft",
            },
        )
        assert sec_echo.status_code == 201
        echo_body = sec_echo.json()
        assert echo_body["status"] == "failed"
        assert echo_body["content"] is None
        assert echo_body["errorCode"] == "invalid_response"
        assert CANARY_API_SECRET not in sec_echo.text

        outsider_sec_get = client.get(f"/api/agent/report-sections/{sec_ok_id}", headers=outsider_headers)
        _assert_clean_chinese_error(outsider_sec_get, expected_statuses=(404,))

        outsider_run_get = client.get(f"/api/agent/report-runs/{run_id}", headers=outsider_headers)
        _assert_clean_chinese_error(outsider_run_get, expected_statuses=(404,))

        with engine.begin() as conn:
            conn.execute(update(Service).where(Service.id == SERVICE_A_ID).values(revision=2))

        stale_svc_call = client.post(
            "/api/agent/report-sections",
            headers=owner_headers,
            json={
                **base_preflight,
                "idempotencyKey": str(uuid4()),
                "nodeId": "drivers.model",
                "prompt": "模型服务版本变更后的并发保护测试",
                "wave": 1,
                "attempt": 1,
                "purpose": "draft",
            },
        )
        _assert_clean_chinese_error(stale_svc_call, expected_statuses=(409,), expected_code="revision_conflict")

        run_summary = client.get(f"/api/agent/report-runs/{run_id}", headers=owner_headers)
        assert run_summary.status_code == 200
        assert run_summary.json()["serviceCurrent"] is False
        assert CANARY_API_SECRET not in run_summary.text
