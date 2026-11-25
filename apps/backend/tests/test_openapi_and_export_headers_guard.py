"""Permanent CI guard for OpenAPI 3.1 schema integrity and RFC 5987 export Content-Disposition headers (Wave 24).

Verifies:
1. app.openapi() generates a complete OpenAPI 3.1 specification across 110+ route operations with
   unique operationIds and 0 dangling or external $ref pointers.
2. OpenAPI operation summaries, descriptions, titles, and error/validation schemas leak 0 stack
   traces, 0 local filesystem paths, 0 database URIs/secrets, and 0 forbidden brackets ([【】「」『』]).
3. OpenAPI JSON serialization is 100% byte-deterministic across independent app instances, while
   mode="production" disables /openapi.json, /docs, and /redoc (404).
4. safe_content_disposition() produces pure-ASCII RFC 6266 + RFC 5987 (filename*=UTF-8''...)
   headers for Chinese filenames and neutralizes CRLF header splitting, NUL/control chars,
   double-quote/semicolon parameter injection, and path traversal sequences.
5. Survey dataset CSV export (GET /api/projects/{id}/surveys/{rid}/dataset) and LaTeX TeX/PDF
   export (POST /api/projects/{id}/report/latex/compile) emit compliant Content-Disposition,
   Cache-Control: no-store, and X-Content-Type-Options: nosniff headers end-to-end.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
from typing import Any
from urllib.parse import unquote

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from evix_api.app import create_app
from evix_api.security import safe_content_disposition
from infrastructure.database.models import (
    Base,
    Member,
    Project,
    Session as DbSessionModel,
    SurveyRelease,
    SurveyResponse,
    Team,
    User,
    Version as QuestionnaireVersionModel,
    now,
)
from infrastructure.security import keyed
from infrastructure.settings import Settings
from multi_agent.agents.writing_agent.tools import latex as latex_domain

_HTTP_METHODS = ("get", "post", "put", "patch", "delete", "options", "head", "trace")
_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_LEAK_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://"
    r"|\b(?:SQLAlchemyError|OperationalError|IntegrityError|DBAPIError|RuntimeError)\b",
    re.IGNORECASE,
)
_CONTENT_DISP_RE = re.compile(
    r'^(attachment|inline); filename="([A-Za-z0-9._-]+)"; filename\*=UTF-8\'\'([A-Za-z0-9%\-._~]+)$'
)

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_ID = "11111111-1111-4111-8111-111111111111"
PROJECT_ID = "22222222-2222-4222-8222-222222222222"
USER_ID = "33333333-3333-4333-8333-333333333333"
QVER_ID = "44444444-4444-4444-8444-444444444444"
RELEASE_ID = "55555555-5555-4555-8555-555555555555"


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


def _make_local_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:openapi_secret_pw_77@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": ["researcher@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "sav_temp_dir": tmp_path / "sav-openapi-private",
        "preflight_temp_dir": tmp_path / "preflight-openapi-private",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_export_workspace(engine, settings: Settings, monkeypatch) -> tuple[str, str]:
    raw_cookie = "export-guard-session-cookie-0123456789"
    csrf_token = "export-guard-csrf-token"
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    monkeypatch.setattr("application.services.latex.now", lambda: ts)

    design = {
        "title": '县域银发助餐"调研"; 阶段一',
        "introduction": "匿名学术调研说明",
        "questions": [
            {
                "id": "q_note",
                "variable": "open_note",
                "text": "请填写建议",
                "type": "text",
                "required": False,
                "reverse": False,
                "choices": [],
                "min": None,
                "max": None,
                "minLabel": "",
                "maxLabel": "",
                "condition": None,
            }
        ],
    }

    with engine.begin() as conn:
        conn.execute(User.__table__.insert().values(id=USER_ID, email="researcher@example.test", created_at=ts))
        conn.execute(
            DbSessionModel.__table__.insert().values(
                user_id=USER_ID,
                token_hash=keyed(settings, "session/v1", raw_cookie),
                csrf=csrf_token,
                expires_at=ts.replace(year=ts.year + 1),
                revoked_at=None,
            )
        )
        conn.execute(Team.__table__.insert().values(id=TEAM_ID, name="导出门禁课题组"))
        conn.execute(Member.__table__.insert().values(team_id=TEAM_ID, user_id=USER_ID, role="owner"))
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_ID,
                team_id=TEAM_ID,
                title="县域银发助餐导出测试项目",
                revision=1,
                questionnaire_revision=1,
                created_at=ts,
            )
        )
        conn.execute(
            QuestionnaireVersionModel.__table__.insert().values(
                id=QVER_ID,
                project_id=PROJECT_ID,
                revision=1,
                created_by=USER_ID,
                design=design,
                design_hash="a" * 64,
                source_proposal_id=None,
                created_at=ts,
            )
        )
        conn.execute(
            SurveyRelease.__table__.insert().values(
                id=RELEASE_ID,
                project_id=PROJECT_ID,
                version_id=QVER_ID,
                questionnaire_revision=1,
                token="export-public-token-0123456789abcdefABCDEFG",
                public_design={"title": design["title"], "introduction": design["introduction"], "questions": design["questions"]},
                classification="synthetic",
                revision=1,
                status="open",
                response_count=1,
                response_bytes=48,
                created_at=ts,
                closed_at=None,
            )
        )
        conn.execute(
            SurveyResponse.__table__.insert().values(
                id="66666666-6666-4666-8666-666666666666",
                release_id=RELEASE_ID,
                idempotency_key="77777777-7777-4777-8777-777777777777",
                payload_hash="b" * 64,
                answers={"q_note": "=SUM(1,2)"},
                visibility={"q_note": True},
                created_at=ts,
            )
        )
    return raw_cookie, csrf_token


def _collect_refs(node: Any, out: list[str]) -> None:
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            out.append(ref)
        for val in node.values():
            _collect_refs(val, out)
    elif isinstance(node, list):
        for item in node:
            _collect_refs(item, out)


def _resolve_json_pointer(doc: dict[str, Any], pointer: str) -> Any:
    assert pointer.startswith("#/"), f"External or non-root OpenAPI $ref forbidden: {pointer!r}"
    cur: Any = doc
    for raw_part in pointer[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        assert isinstance(cur, dict) and part in cur, f"Dangling OpenAPI $ref {pointer!r} at segment {part!r}"
        cur = cur[part]
    return cur


def _collect_human_texts(node: Any, out: list[str]) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("summary", "description", "title") and isinstance(v, str):
                out.append(v)
            else:
                _collect_human_texts(v, out)
    elif isinstance(node, list):
        for item in node:
            _collect_human_texts(item, out)


def test_openapi_31_schema_completeness_and_zero_dangling_refs(tmp_path: Path):
    settings = _make_local_settings(tmp_path)
    app = create_app(settings=settings, engine=_make_sqlite_engine())
    spec = app.openapi()

    assert isinstance(spec, dict)
    assert str(spec.get("openapi", "")).startswith("3.1.")
    assert spec.get("info", {}).get("title") == "EVI-X API"

    paths = spec.get("paths") or {}
    assert len(paths) >= 90

    operation_ids: list[str] = []
    operation_count = 0
    for path_key, path_item in paths.items():
        assert path_key.startswith("/api/"), f"Unexpected non-/api OpenAPI route: {path_key!r}"
        for method, op in path_item.items():
            if method.lower() not in _HTTP_METHODS:
                continue
            operation_count += 1
            op_id = op.get("operationId")
            assert isinstance(op_id, str) and op_id.strip(), f"Missing operationId on {method.upper()} {path_key}"
            operation_ids.append(op_id)
            responses = op.get("responses") or {}
            assert responses, f"Empty responses map on {method.upper()} {path_key}"

    assert operation_count >= 110
    assert len(set(operation_ids)) == len(operation_ids), "Duplicate OpenAPI operationId detected"

    all_refs: list[str] = []
    _collect_refs(spec, all_refs)
    assert all_refs, "Expected component schema $ref entries in OpenAPI spec"
    for ref in set(all_refs):
        resolved = _resolve_json_pointer(spec, ref)
        assert isinstance(resolved, dict) and resolved, f"Resolved $ref {ref!r} is empty"


def test_openapi_operation_metadata_and_error_models_leak_zero_paths_secrets_or_brackets(tmp_path: Path):
    settings = _make_local_settings(tmp_path)
    app = create_app(settings=settings, engine=_make_sqlite_engine())
    spec = app.openapi()
    serialized = json.dumps(spec, ensure_ascii=False, sort_keys=True)

    assert not _LEAK_RE.search(serialized), "OpenAPI specification leaked local path, DB URI, or traceback"
    for secret in (
        "openapi_secret_pw_77",
        settings.auth_secret,
        next(iter(settings.keyring.values())),
        str(settings.sav_temp_dir),
        str(settings.preflight_temp_dir),
    ):
        assert secret not in serialized, f"OpenAPI leaked sensitive setting value: {secret!r}"

    human_texts: list[str] = []
    _collect_human_texts(spec, human_texts)
    assert human_texts
    for txt in human_texts:
        assert not _FORBIDDEN_BRACKET_RE.search(txt), f"Forbidden bracket punctuation in OpenAPI text: {txt!r}"
        assert not _LEAK_RE.search(txt), f"Internal path/exception leaked in OpenAPI text: {txt!r}"


def test_openapi_deterministic_serialization_and_production_surface_disablement(tmp_path: Path):
    settings_a = _make_local_settings(tmp_path / "a")
    settings_b = _make_local_settings(tmp_path / "b")
    app_a = create_app(settings=settings_a, engine=_make_sqlite_engine())
    app_b = create_app(settings=settings_b, engine=_make_sqlite_engine())

    bytes_a = json.dumps(app_a.openapi(), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    bytes_b = json.dumps(app_b.openapi(), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    assert hashlib.sha256(bytes_a).hexdigest() == hashlib.sha256(bytes_b).hexdigest()

    with TestClient(app_a, raise_server_exceptions=False) as local_client:
        res = local_client.get("/openapi.json")
        assert res.status_code == 200
        assert res.headers.get("x-content-type-options") == "nosniff"
        assert res.json()["openapi"].startswith("3.1.")

    prod_settings = Settings(
        mode="production",
        database_url="postgresql+psycopg://evix_app:prod_pw@127.0.0.1:55432/evix_prod",
        allowed_origins=["https://app.evix.example"],
        invited_emails=["researcher@evix.example"],
        auth_secret="1234567890abcdeffedcba0987654321" * 2,
        keyring={"v1": "abcdef01234567899876543210fedcba" * 2},
        mail_mode="resend",
        mail_api_key="re_prod_synthetic_openapi_0123456789",
        mail_from="noreply@evix.example",
        provider_mode="live",
        cookie_name="__Host-evix_session",
        sav_temp_dir=tmp_path / "prod-sav",
        preflight_temp_dir=tmp_path / "prod-pf",
    )
    prod_app = create_app(settings=prod_settings)
    assert prod_app.openapi_url is None and prod_app.docs_url is None and prod_app.redoc_url is None
    prod_client = TestClient(prod_app, raise_server_exceptions=False)
    assert prod_client.get("/openapi.json").status_code == 404


def test_safe_content_disposition_rfc5987_utf8_encoding_and_crlf_quote_injection_neutralization():
    # 1. Standard Chinese export filenames (CSV, PDF, TeX)
    for raw_name, fb, expected_ext, expected_sub in (
        ("县域银发助餐调研-答卷数据.csv", "survey-dataset", ".csv", "县域银发助餐调研-答卷数据.csv"),
        ("正大杯全国总决赛盲审报告.pdf", "report-export", ".pdf", "正大杯全国总决赛盲审报告.pdf"),
        ("三线表与回归模型排版源码.tex", "report-export", ".tex", "三线表与回归模型排版源码.tex"),
    ):
        hdr = safe_content_disposition(raw_name, fallback_stem=fb)
        assert hdr.isascii() and "\r" not in hdr and "\n" not in hdr
        m = _CONTENT_DISP_RE.fullmatch(hdr)
        assert m is not None, f"Header failed strict RFC 6266/5987 grammar: {hdr!r}"
        disp, ascii_name, encoded_utf8 = m.groups()
        assert disp == "attachment"
        assert ascii_name == f"{fb}{expected_ext}"
        decoded = unquote(encoded_utf8, encoding="utf-8", errors="strict")
        assert decoded == expected_sub

    # 2. Adversarial CRLF header splitting, double-quote breakouts, NUL/control chars, and path traversal
    adversarial_inputs = (
        'evil"\r\nSet-Cookie: evix_session=hacked\r\nX-Split: 1.csv',
        'report"; filename="trojan.exe"; dummy=".pdf',
        "../../etc/passwd\x00\x1f\u2028\u2029机密导出.tex",
        "..\\..\\windows\\win.ini.csv",
        '   ...;;;""\'\'\\\\///   .pdf',
        "",
    )
    for hostile in adversarial_inputs:
        hdr = safe_content_disposition(hostile, fallback_stem="safe-download")
        assert hdr.isascii()
        assert "\r" not in hdr and "\n" not in hdr and "\x00" not in hdr
        assert "Set-Cookie" not in hdr.replace("Set-Cookie_", "") or hdr.count(";") == 2
        m = _CONTENT_DISP_RE.fullmatch(hdr)
        assert m is not None, f"Adversarial filename escaped strict header grammar: {hostile!r} -> {hdr!r}"
        _, ascii_name, encoded_utf8 = m.groups()
        assert '"' not in ascii_name and "\\" not in ascii_name and "/" not in ascii_name
        decoded = unquote(encoded_utf8, encoding="utf-8", errors="strict")
        assert "/" not in decoded and "\\" not in decoded and ".." not in decoded and '"' not in decoded

    with pytest.raises(ValueError, match="Invalid Content-Disposition type"):
        safe_content_disposition("report.pdf", disposition="attachment\r\nX-Evil: 1")


def test_survey_dataset_csv_export_emits_rfc5987_content_disposition_nosniff_and_formula_guard(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_local_settings(tmp_path)
    cookie, _csrf = _seed_export_workspace(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)
        res = client.get(f"/api/projects/{PROJECT_ID}/surveys/{RELEASE_ID}/dataset")
        assert res.status_code == 200, res.text
        assert res.headers.get("cache-control") == "no-store"
        assert res.headers.get("x-content-type-options") == "nosniff"
        assert res.headers.get("x-frame-options") == "DENY"
        assert res.headers.get("x-robots-tag") == "noindex, nofollow, noarchive"

        cd = res.headers.get("content-disposition", "")
        m = _CONTENT_DISP_RE.fullmatch(cd)
        assert m is not None, f"Invalid dataset Content-Disposition: {cd!r}"
        disp, ascii_name, encoded_utf8 = m.groups()
        assert disp == "attachment"
        assert ascii_name == "survey-dataset.csv"
        decoded = unquote(encoded_utf8, encoding="utf-8", errors="strict")
        assert "县域银发助餐" in decoded and decoded.endswith(".csv")
        assert '"' not in decoded and ";" not in decoded

        payload = res.json()
        assert "'=SUM(1,2)" in payload["downloadCsv"]


def test_latex_tex_and_pdf_export_routes_emit_rfc5987_content_disposition_and_nosniff(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_local_settings(tmp_path)
    cookie, csrf = _seed_export_workspace(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    compile_url = f"/api/projects/{PROJECT_ID}/report/latex/compile"
    req_body = {
        "title": '银发智守"盲审"; 终稿',
        "subtitle": "县域实证调研报告",
        "body": "\\section{引言}\n本研究基于分层随机抽样开展稳健性检验。",
        "options": {
            "part": "main",
            "includeCover": True,
            "includeToc": True,
            "firstLineChars": 2,
            "numberPages": True,
        },
    }
    headers = {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": csrf}

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)

        # 1. Without xelatex configured -> exports .tex source with RFC 5987 .tex filename
        tex_res = client.post(compile_url, json=req_body, headers=headers)
        assert tex_res.status_code == 200, tex_res.text
        assert tex_res.json()["status"] == "unavailable"
        assert tex_res.headers.get("cache-control") == "no-store"
        assert tex_res.headers.get("x-content-type-options") == "nosniff"
        cd_tex = tex_res.headers.get("content-disposition", "")
        m_tex = _CONTENT_DISP_RE.fullmatch(cd_tex)
        assert m_tex is not None, f"Invalid TeX Content-Disposition: {cd_tex!r}"
        assert m_tex.group(2) == "report-export.tex"
        decoded_tex = unquote(m_tex.group(3), encoding="utf-8", errors="strict")
        assert "银发智守" in decoded_tex and decoded_tex.endswith(".tex")
        assert '"' not in decoded_tex and ";" not in decoded_tex

        # 2. With simulated xelatex pass producing valid %PDF- bytes -> switches to .pdf filename
        fake_xelatex = tmp_path / "xelatex.exe"
        fake_xelatex.write_bytes(b"stub")
        app.state.latex_compiler.settings.latex_compiler = str(fake_xelatex)

        def _fake_run_pass(_exe, directory: Path, _deadline: float):
            (directory / "document.pdf").write_bytes(b"%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF\n")
            return 0, "Output written on document.pdf (1 page)."

        monkeypatch.setattr(latex_domain, "run_pass", _fake_run_pass)
        pdf_res = client.post(compile_url, json=req_body, headers=headers)
        assert pdf_res.status_code == 200, pdf_res.text
        assert pdf_res.json()["status"] == "compiled"
        assert pdf_res.json()["pdfBase64"]
        assert pdf_res.headers.get("cache-control") == "no-store"
        assert pdf_res.headers.get("x-content-type-options") == "nosniff"
        cd_pdf = pdf_res.headers.get("content-disposition", "")
        m_pdf = _CONTENT_DISP_RE.fullmatch(cd_pdf)
        assert m_pdf is not None, f"Invalid PDF Content-Disposition: {cd_pdf!r}"
        assert m_pdf.group(2) == "report-export.pdf"
        decoded_pdf = unquote(m_pdf.group(3), encoding="utf-8", errors="strict")
        assert "银发智守" in decoded_pdf and decoded_pdf.endswith(".pdf")
