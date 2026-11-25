"""Deterministic CI guard for high-frequency read endpoints (/api/health, /api/session, /api/agent/tools, /api/net-exam/bank).

Verifies response security headers, explicit cache/Vary/ETag semantics, conditional 304 revalidation,
auth-before-ETag ordering on member-only corpus banks, and strict payload redaction against path/version/URI leaks.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys

import fastapi
from fastapi.testclient import TestClient
import sqlalchemy
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from evix_api.app import create_app
from infrastructure.database.models import Session as DbSessionModel, User, now
from infrastructure.security import keyed
from infrastructure.settings import Settings
from multi_agent.tool_registry import public_tool_catalog

_PATH_OR_URI_LEAK_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)


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
    User.__table__.create(engine)
    DbSessionModel.__table__.create(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:super_secret_db_pw@127.0.0.1:55432/evix_prod",
        "allowed_origins": ["http://127.0.0.1:3180"],
        "invited_emails": ["member@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "sav_temp_dir": tmp_path / "sav-private",
        "preflight_temp_dir": tmp_path / "preflight-private",
    }
    payload.update(overrides)
    return Settings(**payload)


def _assert_security_headers(headers) -> None:
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "no-referrer"
    assert headers.get("x-robots-tag") == "noindex, nofollow, noarchive"


def _assert_no_internal_metadata_leak(raw_body: str, headers, settings: Settings) -> None:
    combined = raw_body + "\n" + "\n".join(f"{k}: {v}" for k, v in headers.items())
    assert not _PATH_OR_URI_LEAK_RE.search(combined), f"Leaked path or DB URI: {combined!r}"
    py_ver = sys.version.split()[0]
    for secret_or_version in (
        py_ver,
        fastapi.__version__,
        sqlalchemy.__version__,
        "super_secret_db_pw",
        settings.auth_secret,
        next(iter(settings.keyring.values())),
        str(settings.sav_temp_dir),
        str(settings.preflight_temp_dir),
    ):
        assert secret_or_version not in combined, f"Leaked internal token {secret_or_version!r}"


def _write_synthetic_bank(path: Path, version: str = "corpus-v1") -> Path:
    bank = {
        "version": version,
        "sources": [{"id": "s1", "filename": "抽样理论题源.docx", "sha256": "0" * 64}],
        "questions": [
            {
                "id": "q1",
                "type": "single",
                "chapter": "分层抽样设计",
                "stem": "分层随机抽样相比简单随机抽样的主要优势是什么？",
                "options": [{"id": "A", "text": "降低层间异质性带来的抽样误差"}, {"id": "B", "text": "无需抽样框"}],
                "answer": ["A"],
                "answerStatus": "valid",
                "sourceRefs": [{"sourceId": "s1", "locators": ["p1"]}],
            }
        ],
    }
    path.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
    return path


def test_health_endpoint_headers_and_zero_internal_metadata_leak(tmp_path: Path):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    app = create_app(settings=settings, engine=engine)

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.get("/api/health")
        assert res.status_code == 200
        assert res.headers.get("cache-control") == "no-store"
        _assert_security_headers(res.headers)
        body = res.json()
        assert set(body.keys()) == {"status", "database", "mode"}
        assert body == {"status": "ok", "database": "ok", "mode": "local_test"}
        _assert_no_internal_metadata_leak(res.text, res.headers, settings)

    # Broken database must return sanitized 503 storage_unavailable with no SQL/URI/path leak
    broken_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    broken_app = create_app(settings=settings, engine=broken_engine)
    with TestClient(broken_app, raise_server_exceptions=False) as client:
        err_res = client.get("/api/health")
        assert err_res.status_code == 503
        assert err_res.headers.get("cache-control") == "no-store"
        _assert_security_headers(err_res.headers)
        assert err_res.json()["error"]["code"] == "storage_unavailable"
        _assert_no_internal_metadata_leak(err_res.text, err_res.headers, settings)


def test_session_probe_enforces_no_store_vary_cookie_and_payload_redaction(tmp_path: Path, monkeypatch):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    raw_token = "synthetic-session-cookie-token-0123456789"
    token_hash = keyed(settings, "session/v1", raw_token)
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert().values(
                id="11111111-1111-4111-8111-111111111111",
                email="member@example.test",
                created_at=ts,
            )
        )
        conn.execute(
            DbSessionModel.__table__.insert().values(
                user_id="11111111-1111-4111-8111-111111111111",
                token_hash=token_hash,
                csrf="csrf-token-xyz",
                expires_at=ts.replace(year=ts.year + 1),
                revoked_at=None,
            )
        )

    app = create_app(settings=settings, engine=engine)
    with TestClient(app) as client:
        anon = client.get("/api/session")
        assert anon.status_code == 200
        assert anon.headers.get("cache-control") == "no-store"
        assert "Cookie" in (anon.headers.get("vary") or "")
        _assert_security_headers(anon.headers)
        assert anon.json() == {"authenticated": False, "mode": "local_test", "providerMode": "fixture"}
        _assert_no_internal_metadata_leak(anon.text, anon.headers, settings)

        client.cookies.set(settings.cookie_name, raw_token)
        authed = client.get("/api/session")
        assert authed.status_code == 200
        assert authed.headers.get("cache-control") == "no-store"
        assert "Cookie" in (authed.headers.get("vary") or "")
        _assert_security_headers(authed.headers)
        payload = authed.json()
        assert set(payload.keys()) == {"authenticated", "user", "csrfToken", "mode", "providerMode"}
        assert payload["authenticated"] is True
        assert payload["user"] == {"id": "11111111-1111-4111-8111-111111111111", "email": "member@example.test"}
        assert token_hash not in authed.text and raw_token not in authed.text
        _assert_no_internal_metadata_leak(authed.text, authed.headers, settings)


def test_public_tool_catalog_preencoded_caching_etag_304_and_zero_leak(tmp_path: Path):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    app = create_app(settings=settings, engine=engine)

    with TestClient(app) as client:
        first = client.get("/api/agent/tools")
        assert first.status_code == 200
        assert first.headers.get("cache-control") == "public, max-age=300, must-revalidate"
        etag = first.headers.get("etag") or ""
        assert etag.startswith('"sha256-') and etag.endswith('"')
        assert "Accept-Encoding" in (first.headers.get("vary") or "")
        _assert_security_headers(first.headers)
        assert first.json() == public_tool_catalog()
        _assert_no_internal_metadata_leak(first.text, first.headers, settings)

        # Conditional GET with matching strong, weak, or multi-value If-None-Match returns 0-byte 304
        for inm in (etag, f"W/{etag}", f'"other-tag", {etag}'):
            not_mod = client.get("/api/agent/tools", headers={"If-None-Match": inm})
            assert not_mod.status_code == 304
            assert not_mod.content == b""
            assert not_mod.headers.get("etag") == etag
            assert not_mod.headers.get("cache-control") == "public, max-age=300, must-revalidate"
            _assert_security_headers(not_mod.headers)

        stale = client.get("/api/agent/tools", headers={"If-None-Match": '"sha256-000000000000"'})
        assert stale.status_code == 200
        assert stale.json()["totalCount"] == 47


def test_net_exam_bank_corpus_requires_auth_before_etag_304_and_preserves_no_store(tmp_path: Path, monkeypatch):
    engine = _make_sqlite_engine()
    bank_file = _write_synthetic_bank(tmp_path / "private-exam-bank.json", version="corpus-v1")
    settings = _make_settings(tmp_path, net_exam_bank_path=bank_file)
    raw_token = "synthetic-bank-session-token-9876543210"
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert().values(
                id="33333333-3333-4333-8333-333333333333",
                email="member@example.test",
                created_at=ts,
            )
        )
        conn.execute(
            DbSessionModel.__table__.insert().values(
                user_id="33333333-3333-4333-8333-333333333333",
                token_hash=keyed(settings, "session/v1", raw_token),
                csrf="csrf-bank",
                expires_at=ts.replace(year=ts.year + 1),
                revoked_at=None,
            )
        )

    app = create_app(settings=settings, engine=engine)
    with TestClient(app) as anon_client:
        unauth = anon_client.get("/api/net-exam/bank", headers={"If-None-Match": "*"})
        assert unauth.status_code == 401
        assert unauth.json()["error"]["code"] == "session_required"
        assert "etag" not in {k.lower() for k in unauth.headers.keys()}
        assert str(bank_file) not in unauth.text

    with TestClient(app) as authed_client:
        authed_client.cookies.set(settings.cookie_name, raw_token)
        res1 = authed_client.get("/api/net-exam/bank")
        assert res1.status_code == 200
        assert res1.headers.get("cache-control") == "no-store"
        assert "Cookie" in (res1.headers.get("vary") or "")
        etag1 = res1.headers.get("etag") or ""
        assert etag1.startswith('"sha256-') and etag1.endswith('"')
        _assert_security_headers(res1.headers)
        assert res1.json()["version"] == "corpus-v1"
        assert str(bank_file) not in res1.text
        _assert_no_internal_metadata_leak(res1.text, res1.headers, settings)

        res_304 = authed_client.get("/api/net-exam/bank", headers={"If-None-Match": etag1})
        assert res_304.status_code == 304
        assert res_304.content == b""
        assert res_304.headers.get("cache-control") == "no-store"
        assert "Cookie" in (res_304.headers.get("vary") or "")
        assert res_304.headers.get("etag") == etag1

        # Updating bank corpus invalidates prior ETag and serves fresh payload
        _write_synthetic_bank(bank_file, version="corpus-v2-updated")
        os.utime(bank_file, ns=(bank_file.stat().st_atime_ns, bank_file.stat().st_mtime_ns + 2_000_000))
        res2 = authed_client.get("/api/net-exam/bank", headers={"If-None-Match": etag1})
        assert res2.status_code == 200
        assert res2.json()["version"] == "corpus-v2-updated"
        assert res2.headers.get("etag") != etag1
