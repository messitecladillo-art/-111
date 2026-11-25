"""Permanent CI guard for file upload, questionnaire/dataset import, archive parsing, and cross-tenant isolation (Wave 23).

Verifies:
1. Path-traversal filenames (../../etc/passwd, ..\\windows\\win.ini, URL-encoded traversals, null
   bytes, CRLF/control chars) are blocked on upload headers AND inside ZIP/DOCX archive entries
   (ZIP-Slip / POSIX symlink / null-byte member names), and auditor location strings scrub paths.
2. Disallowed extensions, format mismatches, non-octet-stream MIME types, compressed encodings,
   and missing temporary-upload consent headers are deterministically rejected with pure Chinese
   ApiError messages.
3. Empty 0-byte uploads and oversized byte streams (via Content-Length and chunked streaming)
   are deterministically rejected with 422 / 413 and release all active user slots.
4. Malformed CSV, XLSX-as-DOCX, truncated/corrupt DOCX/ZIP, XXE-laden OOXML, ZIP extra-field
   archives, corrupt SPSS .sav binaries, and malformed inline dataset imports gracefully return
   pure Chinese ApiError envelopes with zero Python tracebacks, exception class names, or temp
   directory leaks, leaving zero scratch residue on disk.
5. Cross-tenant isolation (404 for outsiders, 403 for read-only viewers, and 401 on mid-flight
   upload session swap) physically prevents unauthorized reading or mutation of uploaded/collected
   datasets, questionnaires, reports, and project attachments.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote
import zipfile

import fastapi
from fastapi.testclient import TestClient
import pytest
import sqlalchemy
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from evix_api.app import create_app
import evix_api.routes.uploads as uploads_route_module
from infrastructure.database.models import (
    Base,
    Member,
    Project,
    ReportVersion,
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
from multi_agent.agents.reviewer_agent.tools import submission_preflight as pf
from multi_agent.agents.survey_agent.tools import survey_import as sav

_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_TRACE_OR_CLASS_LEAK_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|\b(?:"
    r"BadZipFile|LargeZipFile|ParseError|DefusedXmlException|EntitiesForbidden|DTDForbidden"
    r"|ReadstatError|PyreadstatError|UnicodeDecodeError|StructError|zlib\.error"
    r"|RuntimeError|ValueError|KeyError|TypeError|AttributeError|OSError|FileNotFoundError"
    r"|SQLAlchemyError|OperationalError|IntegrityError"
    r")\b",
    re.IGNORECASE,
)
_PATH_OR_URI_LEAK_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_A_ID = "11111111-1111-4111-8111-111111111111"
TEAM_B_ID = "22222222-2222-4222-8222-222222222222"
PROJECT_A_ID = "33333333-3333-4333-8333-333333333333"
PROJECT_B_ID = "44444444-4444-4444-8444-444444444444"
OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
VIEWER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
OUTSIDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
QVER_A_ID = "55555555-5555-4555-8555-555555555555"
RELEASE_A_ID = "66666666-6666-4666-8666-666666666666"


class _NoopSqlEvent:
    @staticmethod
    def listen(*_args, **_kwargs) -> None:
        return None

    @staticmethod
    def remove(*_args, **_kwargs) -> None:
        return None


def _make_sqlite_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    def _on_connect(dbapi_conn, _record):
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _l: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _lock_id: 1)

    event.listen(engine, "connect", _on_connect)
    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:upload_secret_pw@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": ["owner@example.test", "viewer@example.test", "outsider@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "sav_temp_dir": tmp_path / "sav-scratch",
        "preflight_temp_dir": tmp_path / "preflight-scratch",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_tenants(engine, settings: Settings, monkeypatch) -> dict[str, tuple[str, str]]:
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    monkeypatch.setattr("evix_api.routes.uploads.now", lambda: ts)
    monkeypatch.setattr(uploads_route_module, "event", _NoopSqlEvent)

    creds = {
        "owner": ("cookie-owner-upload-0123456789", "csrf-owner-upload"),
        "viewer": ("cookie-viewer-upload-0123456789", "csrf-viewer-upload"),
        "outsider": ("cookie-outsider-upload-0123456789", "csrf-outsider-upload"),
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
        for uid, (raw_cookie, csrf) in (
            (OWNER_ID, creds["owner"]),
            (VIEWER_ID, creds["viewer"]),
            (OUTSIDER_ID, creds["outsider"]),
        ):
            conn.execute(
                DbSessionModel.__table__.insert().values(
                    user_id=uid,
                    token_hash=keyed(settings, "session/v1", raw_cookie),
                    csrf=csrf,
                    expires_at=ts.replace(year=ts.year + 1),
                    revoked_at=None,
                )
            )
        conn.execute(
            Team.__table__.insert(),
            [
                {"id": TEAM_A_ID, "name": "课题组甲"},
                {"id": TEAM_B_ID, "name": "课题组乙"},
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
            Project.__table__.insert(),
            [
                {
                    "id": PROJECT_A_ID,
                    "team_id": TEAM_A_ID,
                    "title": "甲组机密调研项目",
                    "revision": 1,
                    "questionnaire_revision": 1,
                    "created_at": ts,
                },
                {
                    "id": PROJECT_B_ID,
                    "team_id": TEAM_B_ID,
                    "title": "乙组独立调研项目",
                    "revision": 1,
                    "questionnaire_revision": 0,
                    "created_at": ts,
                },
            ],
        )
    return creds


def _build_minimal_docx(*, body_xml: str | None = None, extra_parts: dict[str, bytes | str] | None = None) -> bytes:
    doc_xml = body_xml or (
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>盲审合规正文中性样本</w:t></w:r></w:p></w:body></w:document>"
    )
    parts: dict[str, bytes | str] = {
        "word/document.xml": doc_xml,
        "[Content_Types].xml": (
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="word/document.xml"/>'
            "</Relationships>"
        ),
    }
    if extra_parts:
        parts.update(extra_parts)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in parts.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _build_minimal_xlsx_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
        )
        zf.writestr(
            "_rels/.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/></Relationships>',
        )
        zf.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')
    return buf.getvalue()


def _preflight_headers(csrf: str, *, name: str = "盲审报告.docx", fmt: str = "docx", **extra) -> dict[str, str]:
    base = {
        "Origin": TRUSTED_ORIGIN,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/octet-stream",
        "X-Evix-Temporary-Upload": "accepted",
        "X-Evix-Audit-Format": fmt,
        "X-Evix-Audit-Name": name,
        "X-Evix-Audit-Terms": "W10",
    }
    base.update(extra)
    return base


def _sav_headers(csrf: str, **extra) -> dict[str, str]:
    base = {
        "Origin": TRUSTED_ORIGIN,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/octet-stream",
        "X-Evix-Temporary-Upload": "accepted",
    }
    base.update(extra)
    return base


def _assert_chinese_error_zero_leak(res, expected_status: int, expected_code: str, settings: Settings) -> str:
    assert res.status_code == expected_status, f"Expected {expected_status}, got {res.status_code}: {res.text!r}"
    assert res.headers.get("cache-control") == "no-store"
    assert res.headers.get("x-content-type-options") == "nosniff"
    body = res.json()
    assert set(body.keys()) == {"error"}
    err = body["error"]
    assert err["code"] == expected_code
    msg = err["message"]
    assert isinstance(msg, str) and _CHINESE_CHAR_RE.search(msg), f"Error message must be Chinese: {msg!r}"
    assert not _FORBIDDEN_BRACKET_RE.search(msg), f"Forbidden bracket in error message: {msg!r}"

    combined = res.text + "\n" + "\n".join(f"{k}: {v}" for k, v in res.headers.items())
    assert not _TRACE_OR_CLASS_LEAK_RE.search(combined), f"Traceback or Python class leaked: {combined!r}"
    assert not _PATH_OR_URI_LEAK_RE.search(combined), f"Filesystem path or DB URI leaked: {combined!r}"
    py_ver = sys.version.split()[0]
    for secret in (
        py_ver,
        fastapi.__version__,
        sqlalchemy.__version__,
        "upload_secret_pw",
        str(settings.sav_temp_dir),
        str(settings.preflight_temp_dir),
    ):
        assert secret not in combined, f"Internal path/secret leaked: {secret!r}"
    return msg


def test_path_traversal_null_byte_and_control_char_filenames_blocked_on_upload_and_archive_entries(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_tenants(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    owner_cookie, owner_csrf = creds["owner"]
    valid_docx = _build_minimal_docx()

    malicious_audit_names = (
        "../../etc/passwd.docx",
        "..\\windows\\win.ini.docx",
        "..%2f..%2fetc%2fpasswd.docx",
        "..%5cwindows%5cwin.ini.docx",
        "report%00hidden.docx",
        "report%0d%0ainjected.docx",
        "report%1fctrl.docx",
        "report%ZZmalformed.docx",
        "%20leading.docx",
        "",
        quote("超长" * 130 + ".docx"),
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, owner_cookie)
        for bad_name in malicious_audit_names:
            res = client.post(
                "/api/submission/preflight",
                content=valid_docx,
                headers=_preflight_headers(owner_csrf, name=bad_name),
            )
            _assert_chinese_error_zero_leak(res, 422, "preflight_input", settings)
            assert "passwd" not in res.text.lower()
            assert "win.ini" not in res.text.lower()

        # ZIP-Slip, absolute root, and backslash member names inside a DOCX ZIP archive
        # (Set ZipInfo.filename after __init__ so Python's zipfile does not pre-strip leading '/')
        for bad_member in ("../../etc/passwd", "..\\windows\\win.ini", "/etc/shadow", "word/../../etc/hosts"):
            raw_buf = io.BytesIO()
            with zipfile.ZipFile(raw_buf, "w", compression=zipfile.ZIP_STORED) as zf:
                zf.writestr(
                    "word/document.xml",
                    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
                )
                zf.writestr(
                    "[Content_Types].xml",
                    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                    '<Override PartName="/word/document.xml" '
                    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
                )
                zf.writestr(
                    "_rels/.rels",
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" '
                    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
                    'Target="word/document.xml"/></Relationships>',
                )
                mal_info = zipfile.ZipInfo("placeholder.txt")
                mal_info.filename = bad_member
                zf.writestr(mal_info, b"injected")
            slip_res = client.post(
                "/api/submission/preflight",
                content=raw_buf.getvalue(),
                headers=_preflight_headers(owner_csrf, name=quote("正常文件名.docx")),
            )
            assert slip_res.status_code in (413, 422)
            expected_err = "preflight_limits" if slip_res.status_code == 413 else "preflight_invalid"
            _assert_chinese_error_zero_leak(slip_res, slip_res.status_code, expected_err, settings)

        # POSIX symlink mode (0o120777 << 16) inside archive must also be rejected
        symlink_buf = io.BytesIO()
        with zipfile.ZipFile(symlink_buf, "w", compression=zipfile.ZIP_STORED) as zf:
            zf.writestr("word/document.xml", "<w:document/>")
            zf.writestr("[Content_Types].xml", "<Types/>")
            zf.writestr("_rels/.rels", "<Relationships/>")
            sym_info = zipfile.ZipInfo("word/media/link.png")
            sym_info.external_attr = 0o120777 << 16
            zf.writestr(sym_info, "/etc/passwd")
        sym_res = client.post(
            "/api/submission/preflight",
            content=symlink_buf.getvalue(),
            headers=_preflight_headers(owner_csrf, name=quote("含符号链接.docx")),
        )
        _assert_chinese_error_zero_leak(sym_res, 413, "preflight_limits", settings)

    # Direct unit check: _safe_location strips scratch path and control characters
    fake_file = tmp_path / "preflight-scratch" / "preflight-0123" / "input.docx"
    sanitized_loc = pf._safe_location(f"{fake_file}\x00\r\n段落一", fake_file)
    assert str(fake_file) not in sanitized_loc
    assert "\x00" not in sanitized_loc and "\r" not in sanitized_loc and "\n" not in sanitized_loc


def test_disallowed_extensions_mime_types_encodings_and_missing_consent_blocked(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_tenants(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    owner_cookie, owner_csrf = creds["owner"]
    valid_docx = _build_minimal_docx()

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, owner_cookie)

        # 1. Disallowed extensions / formats / extension-format mismatches
        for bad_filename, bad_fmt in (
            ("表格数据.xlsx", "xlsx"),
            ("原始答卷.csv", "csv"),
            ("压缩包.zip", "zip"),
            ("统计文件.sav", "sav"),
            ("可执行程序.exe", "exe"),
            ("带宏文档.docm", "docx"),
            ("伪装表格.xlsx", "docx"),
            ("伪装网页.html", "pdf"),
        ):
            res = client.post(
                "/api/submission/preflight",
                content=valid_docx,
                headers=_preflight_headers(owner_csrf, name=quote(bad_filename), fmt=bad_fmt),
            )
            _assert_chinese_error_zero_leak(res, 422, "preflight_input", settings)

        # 2. Disallowed Content-Type MIME headers on both binary upload endpoints
        for disallowed_mime in (
            "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxk",
            "text/csv",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/zip",
            "application/x-msdownload",
            "text/plain",
        ):
            pf_res = client.post(
                "/api/submission/preflight",
                content=b"payload",
                headers=_preflight_headers(owner_csrf, name=quote("盲审.docx"), **{"Content-Type": disallowed_mime}),
            )
            _assert_chinese_error_zero_leak(pf_res, 415, "preflight_content_type", settings)

            sav_res = client.post(
                "/api/imports/sav",
                content=b"payload",
                headers=_sav_headers(owner_csrf, **{"Content-Type": disallowed_mime}),
            )
            _assert_chinese_error_zero_leak(sav_res, 415, "sav_content_type", settings)

        # 3. Disallowed compressed Content-Encoding
        for enc in ("gzip", "deflate", "br"):
            pf_enc = client.post(
                "/api/submission/preflight",
                content=b"payload",
                headers=_preflight_headers(owner_csrf, name=quote("盲审.docx"), **{"Content-Encoding": enc}),
            )
            _assert_chinese_error_zero_leak(pf_enc, 415, "preflight_content_encoding", settings)

            sav_enc = client.post(
                "/api/imports/sav",
                content=b"payload",
                headers=_sav_headers(owner_csrf, **{"Content-Encoding": enc}),
            )
            _assert_chinese_error_zero_leak(sav_enc, 415, "sav_content_encoding", settings)

        # 4. Missing explicit temporary-upload consent header
        pf_no_consent = _preflight_headers(owner_csrf, name=quote("盲审.docx"))
        pf_no_consent.pop("X-Evix-Temporary-Upload")
        res_pf_nc = client.post("/api/submission/preflight", content=valid_docx, headers=pf_no_consent)
        _assert_chinese_error_zero_leak(res_pf_nc, 422, "preflight_upload_consent_required", settings)

        sav_no_consent = _sav_headers(owner_csrf)
        sav_no_consent.pop("X-Evix-Temporary-Upload")
        res_sav_nc = client.post("/api/imports/sav", content=b"$FL2", headers=sav_no_consent)
        _assert_chinese_error_zero_leak(res_sav_nc, 422, "sav_upload_consent_required", settings)


def test_empty_files_and_oversized_byte_streams_rejected_deterministically(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_tenants(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    owner_cookie, owner_csrf = creds["owner"]

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, owner_cookie)

        # Empty 0-byte uploads -> 422
        empty_pf = client.post(
            "/api/submission/preflight",
            content=b"",
            headers=_preflight_headers(owner_csrf, name=quote("空文档.docx")),
        )
        _assert_chinese_error_zero_leak(empty_pf, 422, "preflight_empty", settings)

        empty_sav = client.post("/api/imports/sav", content=b"", headers=_sav_headers(owner_csrf))
        _assert_chinese_error_zero_leak(empty_sav, 422, "sav_empty", settings)

        # Malformed Content-Length headers -> 422
        for bad_len in ("-1", "NaN", "1024bytes"):
            bad_pf = client.post(
                "/api/submission/preflight",
                content=b"x",
                headers=_preflight_headers(owner_csrf, name=quote("大小异常.docx"), **{"Content-Length": bad_len}),
            )
            _assert_chinese_error_zero_leak(bad_pf, 422, "preflight_content_length", settings)

            bad_sav = client.post(
                "/api/imports/sav",
                content=b"x",
                headers=_sav_headers(owner_csrf, **{"Content-Length": bad_len}),
            )
            _assert_chinese_error_zero_leak(bad_sav, 422, "sav_content_length", settings)

        # Oversized Content-Length -> 413
        over_pf = client.post(
            "/api/submission/preflight",
            content=b"x",
            headers=_preflight_headers(
                owner_csrf,
                name=quote("超大文稿.pdf"),
                fmt="pdf",
                **{"Content-Length": str(pf.MAX_BYTES + 1)},
            ),
        )
        _assert_chinese_error_zero_leak(over_pf, 413, "preflight_too_large", settings)

        over_sav = client.post(
            "/api/imports/sav",
            content=b"x",
            headers=_sav_headers(owner_csrf, **{"Content-Length": str(sav.MAX_BYTES + 1)}),
        )
        _assert_chinese_error_zero_leak(over_sav, 413, "sav_too_large", settings)

        # Actual > 2 MB byte stream uploaded to /api/imports/sav -> 413 and active user slot cleanly released
        over_stream_sav = client.post(
            "/api/imports/sav",
            content=b"S" * (sav.MAX_BYTES + 128),
            headers=_sav_headers(owner_csrf),
        )
        _assert_chinese_error_zero_leak(over_stream_sav, 413, "sav_too_large", settings)
        assert not app.state.sav_imports._users
        assert not app.state.preflights._users


def test_malformed_csv_xlsx_docx_zip_and_sav_payloads_return_pure_chinese_api_error_without_traceback(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_tenants(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    owner_cookie, owner_csrf = creds["owner"]

    raw_csv_bytes = b"id,q1,q2\n1,5,4\n2,\xff\xfe,bad\n"
    xlsx_bytes = _build_minimal_xlsx_bytes()
    truncated_zip_bytes = b"PK\x03\x04\x14\x00\x00\x00\x08\x00corrupt-archive-payload"
    xxe_docx_bytes = _build_minimal_docx(
        body_xml=(
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>"
        )
    )
    commented_zip_buf = io.BytesIO()
    with zipfile.ZipFile(commented_zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        info = zipfile.ZipInfo("word/document.xml")
        info.comment = b"entry-comment-not-allowed"
        zf.writestr(info, "<w:document/>")
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("_rels/.rels", "<Relationships/>")

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, owner_cookie)

        # 1. Malformed CSV, XLSX-masquerading-as-DOCX, truncated ZIP, and XXE DOCX -> 422 preflight_invalid
        for label, payload in (
            ("伪装CSV.docx", raw_csv_bytes),
            ("伪装XLSX.docx", xlsx_bytes),
            ("截断损坏包.docx", truncated_zip_bytes),
            ("外部实体注入.docx", xxe_docx_bytes),
        ):
            res = client.post(
                "/api/submission/preflight",
                content=payload,
                headers=_preflight_headers(owner_csrf, name=quote(label), fmt="docx"),
            )
            _assert_chinese_error_zero_leak(res, 422, "preflight_invalid", settings)

        # 2. ZIP entry comment / non-standard ZIP extension -> 422 preflight_zip_extensions
        ext_res = client.post(
            "/api/submission/preflight",
            content=commented_zip_buf.getvalue(),
            headers=_preflight_headers(owner_csrf, name=quote("扩展注释包.docx"), fmt="docx"),
        )
        _assert_chinese_error_zero_leak(ext_res, 422, "preflight_zip_extensions", settings)

        # 3. Malformed PDF bytes -> 422 preflight_invalid
        bad_pdf_res = client.post(
            "/api/submission/preflight",
            content=b"%PDF-1.7\ncorrupt-xref-and-trailer\x00\xff",
            headers=_preflight_headers(owner_csrf, name=quote("损坏文稿.pdf"), fmt="pdf"),
        )
        _assert_chinese_error_zero_leak(bad_pdf_res, 422, "preflight_invalid", settings)

        # 4. Malformed CSV / XLSX / corrupt binary uploaded to /api/imports/sav -> 422 sav_invalid
        for bad_sav_payload in (
            b"$FL2@(#) SPSS DATA FILE corrupt-header-secret-row\x00\xff",
            raw_csv_bytes,
            xlsx_bytes,
        ):
            sav_res = client.post(
                "/api/imports/sav",
                content=bad_sav_payload,
                headers=_sav_headers(owner_csrf),
            )
            _assert_chinese_error_zero_leak(sav_res, 422, "sav_invalid", settings)
            assert "secret-row" not in sav_res.text

        # 5. Malformed inline questionnaire dataset import on autonomous-runs -> 422 invalid_inline_dataset
        bad_inline_res = client.post(
            f"/api/projects/{PROJECT_A_ID}/autonomous-runs",
            json={
                "idempotencyKey": "77777777-7777-4777-8777-777777777777",
                "goal": "检验畸形内联问卷数据集拦截",
                "datasetMode": "inline_dataset",
                "inlineDataset": {"title": "畸形CSV映射", "questions": "not-a-list", "rows": "csv,raw"},
            },
            headers={"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": owner_csrf},
        )
        _assert_chinese_error_zero_leak(bad_inline_res, 422, "invalid_inline_dataset", settings)

        # 6. Positive control: valid minimal DOCX succeeds cleanly and leaves 0 temp scratch dirs
        clean_docx = _build_minimal_docx()
        ok_res = client.post(
            "/api/submission/preflight",
            content=clean_docx,
            headers=_preflight_headers(owner_csrf, name=quote("合规盲审报告.docx"), fmt="docx"),
        )
        assert ok_res.status_code == 200, ok_res.text
        ok_data = ok_res.json()
        assert ok_data["status"] == "no_issues_in_checked_scope"
        assert ok_data["sha256"] == hashlib.sha256(clean_docx).hexdigest()
        assert ok_data["cleanup"] == {"completed": True, "reason": "temporary-upload"}

    if settings.preflight_temp_dir.exists():
        assert list(settings.preflight_temp_dir.glob("preflight-*")) == []
    if settings.sav_temp_dir.exists():
        assert list(settings.sav_temp_dir.glob("sav-*")) == []


def test_cross_tenant_uploaded_datasets_attachments_and_midflight_session_swap_isolation(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_tenants(engine, settings, monkeypatch)
    ts = now().replace(tzinfo=None)

    # Seed Project A with a saved questionnaire, published survey release, respondent row, and report version
    with engine.begin() as conn:
        conn.execute(
            QuestionnaireVersionModel.__table__.insert().values(
                id=QVER_A_ID,
                project_id=PROJECT_A_ID,
                revision=1,
                created_by=OWNER_ID,
                design={"title": "甲组机密问卷", "questions": []},
                design_hash="a" * 64,
                source_proposal_id=None,
                created_at=ts,
            )
        )
        conn.execute(
            SurveyRelease.__table__.insert().values(
                id=RELEASE_A_ID,
                project_id=PROJECT_A_ID,
                version_id=QVER_A_ID,
                questionnaire_revision=1,
                token="pub-release-token-secret-0123456789abcdef",
                public_design={"title": "甲组机密快照", "questions": []},
                classification="actual",
                revision=1,
                status="open",
                response_count=1,
                response_bytes=64,
                created_at=ts,
                closed_at=None,
            )
        )
        conn.execute(
            SurveyResponse.__table__.insert().values(
                id="88888888-8888-4888-8888-888888888888",
                release_id=RELEASE_A_ID,
                idempotency_key="99999999-9999-4999-8999-999999999999",
                payload_hash="c" * 64,
                answers={"q1": "机密受访者原始作答"},
                visibility={"q1": True},
                created_at=ts,
            )
        )
        conn.execute(
            ReportVersion.__table__.insert().values(
                id="dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                project_id=PROJECT_A_ID,
                revision=1,
                created_by=OWNER_ID,
                content={"title": "甲组机密研究报告", "sections": []},
                content_hash="d" * 64,
                created_at=ts,
            )
        )

    app = create_app(settings=settings, engine=engine)
    owner_cookie, owner_csrf = creds["owner"]
    viewer_cookie, viewer_csrf = creds["viewer"]
    outsider_cookie, outsider_csrf = creds["outsider"]

    original_audit = pf.audit_bytes

    async def _revoke_owner_midflight(*args, **kwargs):
        out = await original_audit(*args, **kwargs)
        with engine.begin() as conn:
            conn.execute(
                DbSessionModel.__table__.update()
                .where(DbSessionModel.user_id == OWNER_ID)
                .values(revoked_at=ts)
            )
        return out

    # Use a single lifespan context so preflights.close() is only invoked at the end of the test
    with TestClient(app, raise_server_exceptions=False) as client:
        # 1. Outsider (Team B) attempting to read Project A's dataset, questionnaire, report, or attachments -> 404
        client.cookies.set(settings.cookie_name, outsider_cookie)
        for protected_get in (
            f"/api/projects/{PROJECT_A_ID}/surveys/{RELEASE_A_ID}/dataset",
            f"/api/projects/{PROJECT_A_ID}/surveys",
            f"/api/projects/{PROJECT_A_ID}/questionnaire",
            f"/api/projects/{PROJECT_A_ID}/report",
            f"/api/projects/{PROJECT_A_ID}/knowledge-references",
        ):
            res = client.get(protected_get)
            _assert_chinese_error_zero_leak(res, 404, "not_found", settings)
            assert "机密受访者原始作答" not in res.text
            assert "甲组机密" not in res.text

        # Outsider attempting to close or trigger autonomous analysis on Project A's survey release -> 404
        for cross_post, body_obj in (
            (
                f"/api/projects/{PROJECT_A_ID}/surveys/{RELEASE_A_ID}/close",
                {"expectedRevision": 1, "idempotencyKey": "dfdfdfdf-dfdf-4dfd-8dfd-dfdfdfdfdfdf"},
            ),
            (
                f"/api/projects/{PROJECT_A_ID}/autonomous-runs",
                {
                    "idempotencyKey": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                    "goal": "越权启动跨租户答卷实证探索",
                    "datasetMode": "survey_release",
                    "surveyReleaseRef": f"survey-release:{RELEASE_A_ID}",
                },
            ),
        ):
            cross_res = client.post(
                cross_post,
                json=body_obj,
                headers={"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": outsider_csrf},
            )
            _assert_chinese_error_zero_leak(cross_res, 404, "not_found", settings)
            assert "机密受访者原始作答" not in cross_res.text

        # Direct data-tool boundary check: Project B cannot mount Project A's survey release ID
        from application.workflow_data_tools import DataToolError, snapshot as release_snapshot
        from sqlalchemy.orm import Session as OrmSession

        with OrmSession(engine) as check_sess:
            with pytest.raises(DataToolError, match="dataset_not_found"):
                release_snapshot(check_sess, PROJECT_B_ID, f"survey-release:{RELEASE_A_ID}")

        # 2. Read-only Viewer (role="viewer" on Team A) attempting mutating imports/attachments -> 403 permission_denied
        client.cookies.set(settings.cookie_name, viewer_cookie)
        viewer_headers = {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": viewer_csrf}

        for mutating_path, payload in (
            (
                f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
                {"design": {"title": "篡改"}, "expectedRevision": 1, "idempotencyKey": "12121212-1212-4212-8212-121212121212"},
            ),
            (
                f"/api/projects/{PROJECT_A_ID}/surveys",
                {"expectedQuestionnaireRevision": 1, "idempotencyKey": "13131313-1313-4313-8313-131313131313"},
            ),
            (
                f"/api/projects/{PROJECT_A_ID}/report/versions",
                {"content": {"title": "篡改"}, "expectedRevision": 1, "idempotencyKey": "14141414-1414-4414-8414-141414141414"},
            ),
            (
                f"/api/projects/{PROJECT_A_ID}/surveys/{RELEASE_A_ID}/close",
                {"expectedRevision": 1, "idempotencyKey": "15151515-1515-4515-8515-151515151515"},
            ),
        ):
            v_res = client.post(mutating_path, json=payload, headers=viewer_headers)
            _assert_chinese_error_zero_leak(v_res, 403, "permission_denied", settings)

        # 3. Mid-flight upload session revocation (Owner starts upload, session revoked before reauthorize) -> 401
        monkeypatch.setattr(pf, "audit_bytes", _revoke_owner_midflight)
        client.cookies.set(settings.cookie_name, owner_cookie)
        revoked_midflight = client.post(
            "/api/submission/preflight",
            content=_build_minimal_docx(),
            headers=_preflight_headers(owner_csrf, name=quote("中途吊销会话.docx")),
        )
        _assert_chinese_error_zero_leak(revoked_midflight, 401, "session_required", settings)
