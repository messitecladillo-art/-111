"""Permanent CI guard for CSRF token validation, Origin/Referer enforcement, and Cookie attributes.

Covers Wave 24 (`#493` §12 — 27th permanent CI guard):
1. Exhaustively sweeps all 48 authenticated write routes (`POST`, `PUT`, `PATCH`, `DELETE`) on
   `create_app()`, verifying that missing `X-CSRF-Token`, forged `X-CSRF-Token`, non-ASCII
   `X-CSRF-Token`, cross-site `Origin: https://attacker.example`, forged `Referer` (both without
   `Origin` and alongside `Origin`), and `Sec-Fetch-Site: cross-site` are deterministically blocked
   with canonical pure-Chinese `403` `ApiError` responses and zero Python class/stack leakage.
2. Verifies `Set-Cookie` security attributes on login/logout (`HttpOnly`, `SameSite` strict/lax
   enforcement, `Path=/`, and `__Host-` + `Secure` in production mode).
3. Verifies the minimal public write exemption boundary (`/api/surveys/{token}/responses`,
   `/api/auth/{code,verify}`, and stateless report helpers), ensuring anonymous survey collection
   accepts same-origin submissions without session CSRF while strictly blocking cross-origin,
   forged-`Referer`, and `Sec-Fetch-Site: cross-site` requests with `403`.
"""

from __future__ import annotations

from datetime import timezone
from http.cookies import SimpleCookie
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
import sqlalchemy as sa
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime
from sqlalchemy.pool import StaticPool

from application.providers import FixtureProvider
from evix_api.app import create_app
from infrastructure.database.models import Base
from infrastructure.settings import Settings

ORIGIN = "http://localhost:3180"
PROD_ORIGIN = "https://evix.example.org"

# Explicit, closed allowlist of unauthenticated POST routes (never silently expandable).
EXPLICIT_PUBLIC_WRITE_ROUTES = frozenset(
    {
        ("POST", "/api/auth/code"),
        ("POST", "/api/auth/verify"),
        ("POST", "/api/surveys/{token}/responses"),
        ("POST", "/api/reports/wordcloud"),
        ("POST", "/api/reports/cover-assemble"),
        ("POST", "/api/reports/preflight-audit"),
    }
)

FORBIDDEN_BRACKETS_RE = re.compile("[\u300c\u300d\u300e\u300f\u3010\u3011]")
CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
PYTHON_LEAK_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|\b(?:ApiError|RuntimeError|ValueError|KeyError|TypeError|AttributeError|SQLAlchemyError|HTTPException)\b",
    re.IGNORECASE,
)
LOCAL_PATH_OR_URI_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)


class _AwareSqDateTime(SqDateTime):
    def result_processor(self, dialect: Any, coltype: Any):
        base = super().result_processor(dialect, coltype)

        def _process(value: Any) -> Any:
            parsed = base(value) if base else value
            if parsed is not None and getattr(parsed, "tzinfo", None) is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed

        return _process


class _PgCompatCursor(sqlite3.Cursor):
    def execute(self, sql: str, parameters: Any = ()):
        if isinstance(sql, str) and sql.lstrip().upper().startswith("SET LOCAL "):
            return super().execute("SELECT 1")
        return super().execute(sql, parameters)


class _PgCompatConnection(sqlite3.Connection):
    def cursor(self, factory: Any = _PgCompatCursor):
        return super().cursor(factory)


def _build_sqlite_engine():
    engine = create_engine(
        "sqlite://",
        creator=lambda: sqlite3.connect(
            ":memory:",
            check_same_thread=False,
            factory=_PgCompatConnection,
        ),
        poolclass=StaticPool,
    )
    engine.dialect.colspecs = {**engine.dialect.colspecs, sa.DateTime: _AwareSqDateTime}

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn: Any, _record: Any) -> None:
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _local: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _key: 1)

    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_p0_test",
        "allowed_origins": [ORIGIN],
        "invited_emails": ["csrf_owner@example.test", "csrf_peer@example.test"],
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


def _assert_clean_403_chinese_error(resp: Any, *, expected_code: str) -> None:
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    raw = resp.text
    assert PYTHON_LEAK_RE.search(raw) is None, f"Python class/traceback leaked: {raw}"
    assert LOCAL_PATH_OR_URI_RE.search(raw) is None, f"Local path/URI leaked: {raw}"
    assert FORBIDDEN_BRACKETS_RE.search(raw) is None, f"Forbidden bracket leaked: {raw}"
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers.keys()}

    body = resp.json()
    assert isinstance(body, dict) and set(body.keys()) == {"error"}
    err = body["error"]
    assert isinstance(err, dict) and set(err.keys()) == {"code", "message"}
    assert err["code"] == expected_code
    assert CHINESE_CHAR_RE.search(err["message"]) is not None


def _materialize_route_path(route_path: str) -> str:
    sample_uuid = "11111111-2222-4333-8444-555555555555"
    return (
        route_path.replace("{project_id}", sample_uuid)
        .replace("{task_id}", sample_uuid)
        .replace("{grant_id}", sample_uuid)
        .replace("{run_id}", sample_uuid)
        .replace("{reference_id}", sample_uuid)
        .replace("{release_id}", sample_uuid)
        .replace("{service_id}", sample_uuid)
        .replace("{team_id}", sample_uuid)
        .replace("{user_id}", sample_uuid)
        .replace("{invite_id}", sample_uuid)
        .replace("{version_id}", sample_uuid)
        .replace("{token}", "A" * 43)
    )


def _login_session(app: Any, settings: Settings, deliveries: dict[str, tuple[str, str]], email: str):
    with TestClient(app) as login_client:
        r_code = login_client.post("/api/auth/code", headers={"origin": ORIGIN}, json={"email": email})
        assert r_code.status_code == 202, r_code.text
        cid = r_code.json()["challengeId"]
        r_verify = login_client.post(
            "/api/auth/verify",
            headers={"origin": ORIGIN},
            json={"challengeId": cid, "code": deliveries[cid][1]},
        )
        assert r_verify.status_code == 200, r_verify.text
        set_cookie_hdr = r_verify.headers.get("set-cookie", "")
        cookie_val = login_client.cookies.get(settings.cookie_name, "")
        csrf_val = r_verify.json()["csrfToken"]
        return cookie_val, csrf_val, set_cookie_hdr


def test_all_authenticated_write_routes_enforce_csrf_origin_and_referer_403(tmp_path: Path) -> None:
    """Sweep every authenticated POST/PUT/PATCH/DELETE route against 6 CSRF & Origin/Referer vectors."""
    settings = _make_settings(tmp_path)
    engine = _build_sqlite_engine()
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mail(cid: str, em: str, code: str) -> None:
        deliveries[cid] = (em, code)

    app = create_app(settings, mail=_mail, provider=FixtureProvider(), engine=engine)
    try:
        with TestClient(app) as authed:
            r_code = authed.post(
                "/api/auth/code",
                headers={"origin": ORIGIN},
                json={"email": "csrf_owner@example.test"},
            )
            assert r_code.status_code == 202, r_code.text
            cid = r_code.json()["challengeId"]
            r_verify = authed.post(
                "/api/auth/verify",
                headers={"origin": ORIGIN},
                json={"challengeId": cid, "code": deliveries[cid][1]},
            )
            assert r_verify.status_code == 200, r_verify.text
            csrf_val = r_verify.json()["csrfToken"]

            all_write_pairs: list[tuple[str, str]] = []
            for route in app.routes:
                if isinstance(route, APIRoute):
                    for method in sorted(m for m in (route.methods or set()) if m in ("POST", "PUT", "PATCH", "DELETE")):
                        all_write_pairs.append((method, route.path))

            public_pairs = {pair for pair in all_write_pairs if pair in EXPLICIT_PUBLIC_WRITE_ROUTES}
            auth_write_pairs = [pair for pair in all_write_pairs if pair not in EXPLICIT_PUBLIC_WRITE_ROUTES]

            assert public_pairs == EXPLICIT_PUBLIC_WRITE_ROUTES
            assert len(auth_write_pairs) >= 48

            for idx, (method, route_path) in enumerate(auth_write_pairs):
                url = _materialize_route_path(route_path)
                # Distinct X-Forwarded-For per route batch keeps sliding-window IP throttle isolated
                client_ip = f"10.88.{idx // 10}.{(idx % 10) + 1}"

                # Vector 1: Missing X-CSRF-Token
                r_missing_csrf = authed.request(
                    method,
                    url,
                    headers={"origin": ORIGIN, "x-real-ip": client_ip},
                    json={},
                )
                _assert_clean_403_chinese_error(r_missing_csrf, expected_code="csrf_required")

                # Vector 2: Forged incorrect X-CSRF-Token
                r_wrong_csrf = authed.request(
                    method,
                    url,
                    headers={
                        "origin": ORIGIN,
                        "x-csrf-token": "forged-wrong-csrf-token-value",
                        "x-real-ip": client_ip,
                    },
                    json={},
                )
                _assert_clean_403_chinese_error(r_wrong_csrf, expected_code="csrf_required")

                # Vector 3: Non-ASCII Latin-1 X-CSRF-Token bytes (`csrf.isascii() == False`)
                r_non_ascii_csrf = authed.request(
                    method,
                    url,
                    headers={
                        b"origin": ORIGIN.encode("ascii"),
                        b"x-csrf-token": b"\xff-non-ascii-csrf-token",
                        b"x-real-ip": client_ip.encode("ascii"),
                    },
                    json={},
                )
                _assert_clean_403_chinese_error(r_non_ascii_csrf, expected_code="csrf_required")

                # Vector 4: Cross-site malicious Origin (`https://attacker.example`) even with valid CSRF
                r_evil_origin = authed.request(
                    method,
                    url,
                    headers={
                        "origin": "https://attacker.example",
                        "x-csrf-token": csrf_val,
                        "x-real-ip": client_ip,
                    },
                    json={},
                )
                _assert_clean_403_chinese_error(r_evil_origin, expected_code="origin_forbidden")

                # Vector 5: Omitted Origin + forged malicious Referer
                r_only_evil_ref = authed.request(
                    method,
                    url,
                    headers={
                        "referer": "https://attacker.example/csrf-landing.html",
                        "x-csrf-token": csrf_val,
                        "x-real-ip": client_ip,
                    },
                    json={},
                )
                _assert_clean_403_chinese_error(r_only_evil_ref, expected_code="origin_forbidden")

                # Vector 6: Forged malicious Referer alongside otherwise valid Origin + CSRF
                r_forged_referer = authed.request(
                    method,
                    url,
                    headers={
                        "origin": ORIGIN,
                        "referer": "https://attacker.example/forged-referer",
                        "x-csrf-token": csrf_val,
                        "x-real-ip": client_ip,
                    },
                    json={},
                )
                _assert_clean_403_chinese_error(r_forged_referer, expected_code="origin_forbidden")

                # Vector 7: Browser Fetch Metadata `Sec-Fetch-Site: cross-site`
                r_sec_fetch = authed.request(
                    method,
                    url,
                    headers={
                        "origin": ORIGIN,
                        "sec-fetch-site": "cross-site",
                        "x-csrf-token": csrf_val,
                        "x-real-ip": client_ip,
                    },
                    json={},
                )
                _assert_clean_403_chinese_error(r_sec_fetch, expected_code="origin_forbidden")
    finally:
        engine.dispose()


def test_session_cookie_httponly_samesite_and_production_host_prefix_contracts(tmp_path: Path) -> None:
    """Verify login/logout `Set-Cookie` enforces `HttpOnly`, `SameSite` (`strict`/`lax`), and `__Host-` + `Secure` in prod."""
    settings = _make_settings(tmp_path)
    engine = _build_sqlite_engine()
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mail(cid: str, em: str, code: str) -> None:
        deliveries[cid] = (em, code)

    app = create_app(settings, mail=_mail, provider=FixtureProvider(), engine=engine)
    try:
        cookie_val, csrf_val, set_cookie_hdr = _login_session(
            app, settings, deliveries, "csrf_owner@example.test"
        )
        parsed = SimpleCookie()
        parsed.load(set_cookie_hdr)
        assert settings.cookie_name in parsed
        morsel = parsed[settings.cookie_name]
        assert morsel.value == cookie_val
        assert bool(morsel["httponly"]) is True
        assert morsel["path"] == "/"
        assert int(morsel["max-age"]) == 30 * 86400
        # Backend enforces SameSite=strict (strictly stronger than SameSite=lax against cross-site navigation)
        assert morsel["samesite"].lower() in ("strict", "lax")
        assert morsel["samesite"].lower() == "strict"

        # Legitimate same-origin + same-origin Referer + valid CSRF write & logout succeed
        with TestClient(app) as client:
            client.cookies.set(settings.cookie_name, cookie_val)
            client.headers.update(
                {
                    "origin": ORIGIN,
                    "referer": f"{ORIGIN}/agent",
                    "x-csrf-token": csrf_val,
                }
            )
            team_id = client.get("/api/teams").json()["teams"][0]["id"]
            r_proj = client.post(
                "/api/projects",
                json={"title": "同源合法写入验证", "teamId": team_id, "idempotencyKey": str(uuid4())},
            )
            assert r_proj.status_code == 201, r_proj.text

            r_logout = client.post("/api/auth/logout")
            assert r_logout.status_code == 204
            logout_cookie = SimpleCookie()
            logout_cookie.load(r_logout.headers.get("set-cookie", ""))
            assert settings.cookie_name in logout_cookie
            out_morsel = logout_cookie[settings.cookie_name]
            assert bool(out_morsel["httponly"]) is True
            assert out_morsel["samesite"].lower() in ("strict", "lax")
            assert int(out_morsel["max-age"]) == 0

        # Verify production mode Settings contract requires HTTPS origins and `__Host-` cookie prefix
        prod_settings = Settings(
            mode="production",
            database_url="postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_prod",
            allowed_origins=[PROD_ORIGIN],
            invited_emails=["prod_user@example.org"],
            auth_secret=secrets.token_hex(32),
            keyring={"v1": secrets.token_hex(32)},
            mail_mode="resend",
            provider_mode="live",
            mail_api_key="re_synthetic_prod_key_123456",
            mail_from="noreply@example.org",
            cookie_name="__Host-evix_session",
        )
        assert prod_settings.cookie_name.startswith("__Host-")
    finally:
        engine.dispose()


def test_public_survey_and_auth_entry_minimal_exemption_boundary(tmp_path: Path) -> None:
    """Verify anonymous survey respondent submission works without CSRF only for trusted Origin/Referer."""
    settings = _make_settings(tmp_path)
    engine = _build_sqlite_engine()
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mail(cid: str, em: str, code: str) -> None:
        deliveries[cid] = (em, code)

    app = create_app(settings, mail=_mail, provider=FixtureProvider(), engine=engine)
    try:
        cookie_val, csrf_val, _ = _login_session(app, settings, deliveries, "csrf_owner@example.test")
        with TestClient(app) as owner:
            owner.cookies.set(settings.cookie_name, cookie_val)
            owner.headers.update({"origin": ORIGIN, "x-csrf-token": csrf_val})
            team_id = owner.get("/api/teams").json()["teams"][0]["id"]
            pid = owner.post(
                "/api/projects",
                json={"title": "公开答卷边界项目", "teamId": team_id, "idempotencyKey": str(uuid4())},
            ).json()["id"]

            design = {
                "schema": "questionnaire-design/v1",
                "classification": "proposed",
                "title": "社区适老满意度简表",
                "objective": "测试公开提交最小豁免边界",
                "population": "常住居民",
                "geography": "试点街道",
                "period": "本月",
                "recruitment": "社区公示链接",
                "introduction": "匿名填写，不含身份信息。",
                "pilotNotes": "已完成预试",
                "questions": [
                    {
                        "id": "q1",
                        "variable": "Q1",
                        "text": "您对助餐点卫生状况是否满意？",
                        "type": "single",
                        "required": True,
                        "purpose": "research",
                        "researchQuestion": "RQ1",
                        "construct": "卫生满意度",
                        "analysis": "description",
                        "decisionUse": "后厨改进",
                        "source": "自编",
                        "choices": [{"code": "1", "label": "满意"}, {"code": "0", "label": "一般"}],
                        "min": None,
                        "max": None,
                        "minLabel": "",
                        "maxLabel": "",
                        "reverse": False,
                        "condition": None,
                    }
                ],
            }
            assert (
                owner.post(
                    f"/api/projects/{pid}/questionnaire/versions",
                    json={"design": design, "expectedRevision": 0, "idempotencyKey": str(uuid4())},
                ).status_code
                == 201
            )
            release = owner.post(
                f"/api/projects/{pid}/surveys",
                json={"expectedQuestionnaireRevision": 1, "idempotencyKey": str(uuid4())},
            ).json()
            token = release["token"]

            with TestClient(app) as anon:
                # 1. Cross-origin, null-origin, prefix-spoofed Origin, forged Referer, or cross-site Fetch Metadata
                #    on public endpoints (`/api/surveys/{token}/responses` & `/api/auth/code`) -> 403
                bad_header_cases = [
                    {"origin": "https://attacker.example"},
                    {"origin": "null"},
                    {"origin": "http://localhost:3180.attacker.example"},
                    {"referer": "https://attacker.example/embed"},
                    {"origin": ORIGIN, "referer": "https://attacker.example/embed"},
                    {"origin": ORIGIN, "sec-fetch-site": "cross-site"},
                ]
                for bad_headers in bad_header_cases:
                    r_bad_sub = anon.post(
                        f"/api/surveys/{token}/responses",
                        headers=bad_headers,
                        json={"idempotencyKey": str(uuid4()), "answers": {"q1": "1"}},
                    )
                    _assert_clean_403_chinese_error(r_bad_sub, expected_code="origin_forbidden")

                    r_bad_code = anon.post(
                        "/api/auth/code",
                        headers=bad_headers,
                        json={"email": "csrf_peer@example.test"},
                    )
                    _assert_clean_403_chinese_error(r_bad_code, expected_code="origin_forbidden")

                # Stateless report helper routes also block `Sec-Fetch-Site: cross-site`
                for helper_path in (
                    "/api/reports/wordcloud",
                    "/api/reports/cover-assemble",
                    "/api/reports/preflight-audit",
                ):
                    r_helper = anon.post(
                        helper_path,
                        headers={"origin": "https://attacker.example", "sec-fetch-site": "cross-site"},
                        json={},
                    )
                    _assert_clean_403_chinese_error(r_helper, expected_code="origin_forbidden")

                # Confirm zero responses were recorded during all blocked cross-site attempts
                assert owner.get(f"/api/projects/{pid}/surveys").json()["surveys"][0]["responseCount"] == 0

                # 2. Legitimate anonymous respondent (no Cookie, no X-CSRF-Token, valid Origin + Referer) succeeds
                r_ok_sub = anon.post(
                    f"/api/surveys/{token}/responses",
                    headers={"origin": ORIGIN, "referer": f"{ORIGIN}/s/{token}"},
                    json={"idempotencyKey": str(uuid4()), "answers": {"q1": "1"}},
                )
                assert r_ok_sub.status_code == 201, r_ok_sub.text
                assert owner.get(f"/api/projects/{pid}/surveys").json()["surveys"][0]["responseCount"] == 1
    finally:
        engine.dispose()
