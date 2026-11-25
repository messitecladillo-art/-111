"""Permanent CI guard for production HTTP attack-surface lockdown (Wave 20).

Verifies:
1. Untrusted Origin values (evil domain, "null", host/port/scheme prefix-spoofing) on OPTIONS
   preflight and cross-origin GET/POST requests NEVER emit Access-Control-Allow-Origin or
   Access-Control-Allow-Credentials, and cross-origin mutations deterministically fail with 403.
2. Unknown /api/* 404 probes (including traversal-shaped paths) and disallowed HTTP method 405
   requests carry full security headers and leak zero request paths, filesystem paths, DB URIs,
   or framework versions.
3. Production-mode surface hardening disables /docs, /redoc, and /openapi.json, rejects fixture
   injection and non-HTTPS/non-exact origins, and blocks automated scanner User-Agent strings.
4. Oversized JSON payloads (413 payload_too_large) across route caps, chunked streams without
   Content-Length, and questionnaire envelope limits, plus invalid Content-Type headers
   (415 unsupported_media_type), are deterministically intercepted with pure Chinese messages.
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

from evix_api.app import create_app
from evix_api.requests import body as parse_json_body
from infrastructure.database.models import Session as DbSessionModel, User, now
from infrastructure.security import keyed
from infrastructure.settings import Settings
from shared.errors import ApiError

_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_PATH_OR_URI_LEAK_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://"
    r"|Traceback\s*\(most recent call last\)",
    re.IGNORECASE,
)

_CORS_ALLOW_HEADERS = frozenset(
    {
        "access-control-allow-origin",
        "access-control-allow-credentials",
        "access-control-allow-methods",
        "access-control-allow-headers",
        "access-control-expose-headers",
    }
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


def _make_local_settings(tmp_path: Path, **overrides) -> Settings:
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


def _make_production_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "production",
        "database_url": "postgresql+psycopg://evix_app:prod_secret_pw_99@127.0.0.1:55432/evix_prod",
        "allowed_origins": ["https://app.evix.example"],
        "invited_emails": ["researcher@evix.example"],
        "auth_secret": "1234567890abcdeffedcba0987654321" * 2,
        "keyring": {"v1": "abcdef01234567899876543210fedcba" * 2},
        "mail_mode": "resend",
        "mail_api_key": "re_prod_synthetic_token_0123456789",
        "mail_from": "noreply@evix.example",
        "provider_mode": "live",
        "cookie_name": "__Host-evix_session",
        "sav_temp_dir": tmp_path / "prod-sav-private",
        "preflight_temp_dir": tmp_path / "prod-preflight-private",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_authenticated_session(engine, settings: Settings, monkeypatch) -> tuple[str, str]:
    raw_token = "lockdown-session-cookie-token-0123456789"
    csrf_token = "lockdown-csrf-token-abcdef"
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert().values(
                id="22222222-2222-4222-8222-222222222222",
                email="member@example.test",
                created_at=ts,
            )
        )
        conn.execute(
            DbSessionModel.__table__.insert().values(
                user_id="22222222-2222-4222-8222-222222222222",
                token_hash=keyed(settings, "session/v1", raw_token),
                csrf=csrf_token,
                expires_at=ts.replace(year=ts.year + 1),
                revoked_at=None,
            )
        )
    return raw_token, csrf_token


def _assert_zero_cors_headers(headers) -> None:
    lower_keys = {k.lower() for k in headers.keys()}
    leaked_cors = sorted(lower_keys & _CORS_ALLOW_HEADERS)
    assert not leaked_cors, f"Unexpected CORS header(s) emitted: {leaked_cors} -> {dict(headers)!r}"


def _assert_api_security_headers(headers, *, expect_robots: bool = True) -> None:
    assert headers.get("cache-control") == "no-store"
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") in {"no-referrer", "same-origin"}
    if expect_robots:
        assert headers.get("x-robots-tag") == "noindex, nofollow, noarchive"


def _assert_clean_error_envelope(res, expected_status: int, expected_code: str, settings: Settings) -> str:
    assert res.status_code == expected_status
    _assert_zero_cors_headers(res.headers)
    _assert_api_security_headers(res.headers, expect_robots=res.request.url.path.startswith("/api/"))
    payload = res.json()
    assert set(payload.keys()) == {"error"}
    err = payload["error"]
    assert err.get("code") == expected_code
    msg = err.get("message", "")
    assert isinstance(msg, str) and _CHINESE_CHAR_RE.search(msg), f"Expected Chinese message, got: {msg!r}"
    assert not _FORBIDDEN_BRACKET_RE.search(msg), f"Forbidden bracket in message: {msg!r}"

    combined = res.text + "\n" + "\n".join(f"{k}: {v}" for k, v in res.headers.items())
    assert not _PATH_OR_URI_LEAK_RE.search(combined), f"Internal path/URI/traceback leaked: {combined!r}"
    py_ver = sys.version.split()[0]
    for secret in (
        py_ver,
        fastapi.__version__,
        sqlalchemy.__version__,
        settings.auth_secret,
        next(iter(settings.keyring.values())),
        str(settings.sav_temp_dir),
        str(settings.preflight_temp_dir),
        "super_secret_db_pw",
        "prod_secret_pw_99",
    ):
        assert secret not in combined, f"Leaked internal token {secret!r}"
    return msg


def test_untrusted_origin_options_preflight_never_emits_cors_allow_or_credentials_headers(tmp_path: Path):
    local_engine = _make_sqlite_engine()
    local_settings = _make_local_settings(tmp_path)
    local_app = create_app(settings=local_settings, engine=local_engine)

    untrusted_local_origins = (
        "https://evil.example",
        "null",
        "http://127.0.0.1:3180.evil.example",
        "http://127.0.0.1:31809",
        "https://127.0.0.1:3180",
        "http://evil-127.0.0.1:3180",
    )
    preflight_targets = (
        "/api/auth/code",
        "/api/projects",
        "/api/agent/tools",
        "/api/reports/preflight-audit",
        "/api/surveys/demo-token/responses",
    )

    with TestClient(local_app, raise_server_exceptions=False) as client:
        for origin in untrusted_local_origins:
            for target in preflight_targets:
                res = client.options(
                    target,
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "content-type, x-csrf-token",
                    },
                )
                _assert_zero_cors_headers(res.headers)
                assert res.headers.get("x-content-type-options") == "nosniff"
                assert res.headers.get("x-frame-options") == "DENY"
                assert res.headers.get("x-robots-tag") == "noindex, nofollow, noarchive"

    # Also verify production-mode app against prefix/subdomain/scheme spoofing of https://app.evix.example
    prod_settings = _make_production_settings(tmp_path)
    prod_app = create_app(settings=prod_settings)
    prod_client = TestClient(prod_app, raise_server_exceptions=False)
    for prod_evil_origin in (
        "https://evil.example",
        "null",
        "https://app.evix.example.evil.example",
        "https://app.evix.example:8443",
        "http://app.evix.example",
        "https://sub.app.evix.example",
    ):
        res = prod_client.options(
            "/api/auth/code",
            headers={
                "Origin": prod_evil_origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        _assert_zero_cors_headers(res.headers)
        assert res.headers.get("x-content-type-options") == "nosniff"
        assert res.headers.get("x-frame-options") == "DENY"


def test_cross_origin_requests_reject_mutations_and_never_reflect_cors_headers(tmp_path: Path, monkeypatch):
    engine = _make_sqlite_engine()
    settings = _make_local_settings(tmp_path)
    raw_token, csrf_token = _seed_authenticated_session(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    untrusted_origins = (
        "https://evil.example",
        "null",
        "http://127.0.0.1:3180.evil.example",
        "http://127.0.0.1:31800",
        "https://127.0.0.1:3180",
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        # Cross-origin GETs on public/session endpoints must never emit CORS allow/credentials headers
        for origin in untrusted_origins:
            for get_path in ("/api/health", "/api/session", "/api/agent/tools"):
                get_res = client.get(get_path, headers={"Origin": origin})
                _assert_zero_cors_headers(get_res.headers)

        # Public mutation endpoints must reject every untrusted Origin with 403 origin_forbidden
        for origin in untrusted_origins:
            for post_path, body in (
                ("/api/auth/code", {"email": "member@example.test"}),
                ("/api/auth/verify", {"challengeId": "ch-1", "code": "000000"}),
                ("/api/surveys/public-token/responses", {"idempotencyKey": "k-1", "answers": {}}),
            ):
                res = client.post(post_path, json=body, headers={"Origin": origin})
                _assert_clean_error_envelope(res, 403, "origin_forbidden", settings)

        # Even with a valid session cookie + valid CSRF token, authenticated mutations must reject
        # untrusted Origins AND trusted Origins carrying Sec-Fetch-Site: cross-site
        client.cookies.set(settings.cookie_name, raw_token)
        for bad_headers in (
            {"Origin": "https://evil.example", "X-CSRF-Token": csrf_token},
            {"Origin": "null", "X-CSRF-Token": csrf_token},
            {"Origin": "http://127.0.0.1:3180.evil.example", "X-CSRF-Token": csrf_token},
            {
                "Origin": "http://127.0.0.1:3180",
                "Sec-Fetch-Site": "cross-site",
                "X-CSRF-Token": csrf_token,
            },
            {"X-CSRF-Token": csrf_token},  # Missing Origin header on state-changing POST
        ):
            authed_res = client.post(
                "/api/projects",
                json={"title": "跨域阻断核验", "teamId": "team-1", "idempotencyKey": "idem-1"},
                headers=bad_headers,
            )
            _assert_clean_error_envelope(authed_res, 403, "origin_forbidden", settings)

        # Stateless report endpoints must reject cross-site fetch metadata without CORS reflection
        for stateless_path in (
            "/api/reports/wordcloud",
            "/api/reports/cover-assemble",
            "/api/reports/preflight-audit",
        ):
            cross_res = client.post(
                stateless_path,
                json={},
                headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
            )
            _assert_clean_error_envelope(cross_res, 403, "origin_forbidden", settings)


def test_unknown_api_404_and_disallowed_method_405_enforce_security_headers_and_zero_path_leak(tmp_path: Path):
    engine = _make_sqlite_engine()
    settings = _make_local_settings(tmp_path)
    app = create_app(settings=settings, engine=engine)

    unknown_probes = (
        ("GET", "/api/nonexistent-route", "nonexistent-route"),
        ("POST", "/api/v99/internal/debug-dump", "debug-dump"),
        ("GET", "/api/projects/..%2f..%2fetc%2fpasswd", "passwd"),
        ("GET", "/api/uploads/C%3A%5CWindows%5Cwin.ini", "win.ini"),
        ("DELETE", "/api/admin/config.json", "config.json"),
    )

    disallowed_method_probes = (
        ("DELETE", "/api/health"),
        ("PUT", "/api/session"),
        ("PATCH", "/api/agent/tools"),
        ("GET", "/api/auth/code"),
        ("DELETE", "/api/auth/verify"),
        ("PUT", "/api/reports/preflight-audit"),
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        for method, path, canary in unknown_probes:
            res = client.request(method, path, headers={"Origin": "https://evil.example"})
            msg = _assert_clean_error_envelope(res, 404, "not_found", settings)
            assert canary.lower() not in res.text.lower(), f"404 echoed probed path segment {canary!r}: {msg!r}"

        for method, path in disallowed_method_probes:
            res = client.request(method, path, headers={"Origin": "https://evil.example"})
            _assert_clean_error_envelope(res, 405, "http_error", settings)


def test_production_mode_disables_openapi_docs_rejects_fixtures_and_blocks_scanner_ua(tmp_path: Path):
    sqlite_engine = _make_sqlite_engine()
    prod_settings = _make_production_settings(tmp_path)

    # Production runtime refuses injected test/fixture engines, mailers, or providers
    with pytest.raises(ValueError, match="Production rejects injected fixtures"):
        create_app(settings=prod_settings, engine=sqlite_engine)

    # Production settings reject non-HTTPS origins, non-exact origins, and non-__Host- cookies
    with pytest.raises(ValueError, match="Production requires HTTPS origins"):
        _make_production_settings(tmp_path, allowed_origins=["http://app.evix.example"])
    with pytest.raises(ValueError, match="Origin must be exact"):
        _make_production_settings(tmp_path, allowed_origins=["https://app.evix.example/subpath"])
    with pytest.raises(ValueError, match="Production requires a __Host- cookie"):
        _make_production_settings(tmp_path, cookie_name="evix_session")

    prod_app = create_app(settings=prod_settings)
    prod_client = TestClient(prod_app, raise_server_exceptions=False)

    # Interactive API docs and OpenAPI schema routes must be completely disabled in production
    for doc_path in ("/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"):
        res = prod_client.get(doc_path, headers={"Origin": "https://evil.example"})
        _assert_clean_error_envelope(res, 404, "not_found", prod_settings)
        assert "openapi" not in res.text.lower()
        assert "swagger" not in res.text.lower()

    # Automated vulnerability/scraping User-Agents must be blocked with 403 forbidden_client
    for scanner_ua in ("sqlmap/1.8.2", "Mozilla/5.0 (Nikto/2.5.0)", "Nmap Scripting Engine"):
        blocked = prod_client.get(
            "/api/agent/tools",
            headers={"User-Agent": scanner_ua, "Origin": "https://evil.example"},
        )
        _assert_clean_error_envelope(blocked, 403, "forbidden_client", prod_settings)


def test_oversized_json_payload_413_interception_across_advertised_streamed_and_envelope_caps(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_local_settings(tmp_path)
    raw_token, csrf_token = _seed_authenticated_session(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    trusted_origin = "http://127.0.0.1:3180"

    with TestClient(app, raise_server_exceptions=False) as client:
        # 1. Public auth endpoint tight cap (limit=1024 bytes)
        oversized_auth = json.dumps({"email": ("a" * 1150) + "@example.test"}).encode("utf-8")
        assert len(oversized_auth) > 1024
        res_auth = client.post(
            "/api/auth/code",
            content=oversized_auth,
            headers={"Origin": trusted_origin, "Content-Type": "application/json"},
        )
        _assert_clean_error_envelope(res_auth, 413, "payload_too_large", settings)

        # 2. Forged excessive or malformed non-decimal Content-Length header intercepted upfront
        forged_cl = client.post(
            "/api/auth/code",
            content=b'{"email":"member@example.test"}',
            headers={
                "Origin": trusted_origin,
                "Content-Type": "application/json",
                "Content-Length": "999999999",
            },
        )
        _assert_clean_error_envelope(forged_cl, 413, "payload_too_large", settings)

        # 3. Authenticated project creation cap (limit=2048 bytes) & questionnaire save cap (350_000 bytes)
        client.cookies.set(settings.cookie_name, raw_token)
        authed_json_headers = {
            "Origin": trusted_origin,
            "X-CSRF-Token": csrf_token,
            "Content-Type": "application/json",
        }
        oversized_project = json.dumps(
            {"title": "研" * 900, "teamId": "team-1", "idempotencyKey": "idem-oversized"}
        ).encode("utf-8")
        assert len(oversized_project) > 2048
        res_proj = client.post("/api/projects", content=oversized_project, headers=authed_json_headers)
        _assert_clean_error_envelope(res_proj, 413, "payload_too_large", settings)

        oversized_questionnaire = json.dumps(
            {
                "design": {"pad": "x" * 360_000},
                "expectedRevision": 0,
                "idempotencyKey": "idem-q-oversized",
            }
        ).encode("utf-8")
        assert 350_000 < len(oversized_questionnaire) < 1_000_000
        res_q = client.post(
            "/api/projects/proj-1/questionnaire/versions",
            content=oversized_questionnaire,
            headers=authed_json_headers,
        )
        _assert_clean_error_envelope(res_q, 413, "payload_too_large", settings)

        # 4. Stateless report preflight endpoint cap (limit=2_500_000 bytes)
        oversized_preflight = ('{"title":"' + ("文" * 850_000) + '"}').encode("utf-8")
        assert len(oversized_preflight) > 2_500_000
        res_pf = client.post(
            "/api/reports/preflight-audit",
            content=oversized_preflight,
            headers={"Origin": trusted_origin, "Content-Type": "application/json"},
        )
        _assert_clean_error_envelope(res_pf, 413, "payload_too_large", settings)

    # 5. Chunked transfer stream without Content-Length header must still abort at > limit
    class _ChunkedNoContentLengthRequest:
        headers = {"content-type": "application/json"}

        async def stream(self):
            yield b'{"note":"'
            for _ in range(12):
                yield b"x" * 128
            yield b'"}'

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(parse_json_body(_ChunkedNoContentLengthRequest(), ("note",), limit=1024))
    assert exc_info.value.status == 413
    assert exc_info.value.code == "payload_too_large"
    assert _CHINESE_CHAR_RE.search(exc_info.value.message)


def test_invalid_content_type_415_deterministic_interception_on_public_and_authenticated_routes(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_local_settings(tmp_path)
    raw_token, csrf_token = _seed_authenticated_session(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    trusted_origin = "http://127.0.0.1:3180"

    invalid_media_types = (
        "text/plain",
        "text/plain; charset=utf-8",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=----BoundaryLockdown",
        "application/xml",
        "text/html",
        "application/json-patch+json",
        "text/application/json",
        "",
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, raw_token)
        for media_type in invalid_media_types:
            public_headers = {"Origin": trusted_origin}
            authed_headers = {"Origin": trusted_origin, "X-CSRF-Token": csrf_token}
            if media_type:
                public_headers["Content-Type"] = media_type
                authed_headers["Content-Type"] = media_type

            for path, headers in (
                ("/api/auth/code", public_headers),
                ("/api/reports/preflight-audit", public_headers),
                ("/api/projects", authed_headers),
                ("/api/projects/proj-1/questionnaire/versions", authed_headers),
            ):
                res = client.post(path, content=b'{"email":"member@example.test"}', headers=headers)
                _assert_clean_error_envelope(res, 415, "unsupported_media_type", settings)

        # Positive control: canonical application/json with charset parameter passes the 415 gate
        valid_json_res = client.post(
            "/api/reports/preflight-audit",
            content=b"{}",
            headers={
                "Origin": trusted_origin,
                "Content-Type": "Application/JSON; charset=utf-8",
            },
        )
        assert valid_json_res.status_code == 200
        _assert_zero_cors_headers(valid_json_res.headers)
        _assert_api_security_headers(valid_json_res.headers)
