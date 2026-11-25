"""Permanent CI guard for Session Cookie Security, OTP Anti-Replay/Rate-Limits, Multi-Account Isolation & Logout Revocation.

Covers Wave 28 (`#578` §12 — 26th backend permanent CI guard / 39th full-stack CI guard, 44 collected tests):
1. Session Cookie Security Attributes (`local_test` & `production`):
   - Verifies `HttpOnly`, `SameSite=strict`, `Path=/`, `Max-Age=2592000`, `Secure` in `production`,
     `Cache-Control: no-store` + `Vary: Cookie` on `/api/session`, zero raw cookie token echo in JSON,
     and explicit cookie clearing (`Max-Age=0`) on `/api/auth/logout`.
2. Session-Bound CSRF & Origin/Referer/Sec-Fetch-Site Enforcement Matrix (9 vectors):
   - Verifies missing, empty, forged, truncated, and cross-account `x-csrf-token` headers fail closed
     with pure-Chinese `403 csrf_required`, and missing/evil `Origin`, evil `Referer`, and
     `Sec-Fetch-Site: cross-site` fail closed with pure-Chinese `403 origin_forbidden`.
3. Tampered, Forged, Expired & De-Admitted Session Cookie Rejection Matrix (10 vectors):
   - Verifies bit-flipped, truncated, random, CSRF-swapped, SQLi-shaped, oversized, expired, and
     de-admitted session cookies return `authenticated: false` on `/api/session` and pure-Chinese
     `401 session_required` on protected endpoints (`0` `500` status, `0` tracebacks).
4. OTP Single-Use Anti-Replay, Superseded Challenge, Brute-Force Lockout & Expiry Matrix (9 vectors):
   - Verifies one-time OTP consumption, prior-challenge invalidation on re-request, wrong/malformed/
     expired/undelivered OTP rejection, and 5-attempt lockout in pure Chinese.
5. OTP Per-Email 60s Cooldown, 5/Hour Quota & 20/Min IP Burst Rate-Limit Guards (3 tests):
   - Verifies pure-Chinese `429 email_rate_limit` responses across rapid repeat, hourly email cap,
     and IP enumeration burst floods without impacting unrelated accounts.
6. Concurrent Multi-Account Session Isolation & Multi-Device Selective Logout (2 tests):
   - Verifies 4 concurrent accounts under `ThreadPoolExecutor` exhibit zero identity/CSRF/project
     crosstalk, and logging out Device A leaves Device B of the same user active.
7. Immediate Session Revocation Upon Logout Across Protected Project/Survey/Agent Endpoints (9 vectors):
   - Verifies replaying a logged-out session cookie + pre-logout CSRF token against project,
     questionnaire, report, survey, workflow agent-task, agent-chat, autonomous-run, and logout
     endpoints deterministically returns pure-Chinese `401 session_required`.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta, timezone
from http.cookies import SimpleCookie
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, delete, event, select, update
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime
from sqlalchemy.orm import Session as DBSession

from application.providers import FixtureProvider
from evix_api.app import create_app
from infrastructure.database.models import Base, Challenge, RateEvent, Session as DbSessionModel, User, now
from infrastructure.settings import Settings
from multi_agent.roles import AgentRole
from multi_agent.workflow import AgentResult, ReviewDecision

ORIGIN = "http://localhost:3180"
PROD_ORIGIN = "https://evix.example.com"

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


def _make_settings(tmp_path: Path, *, production: bool = False, **overrides: Any) -> Settings:
    invited = [f"acct_{i}@example.test" for i in range(1, 35)]
    if production:
        base: dict[str, Any] = {
            "mode": "production",
            "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_prod_cookie_test",
            "allowed_origins": [PROD_ORIGIN],
            "invited_emails": invited,
            "auth_secret": secrets.token_hex(32),
            "keyring": {"v1": secrets.token_hex(32)},
            "cookie_name": "__Host-evix_session",
            "mail_mode": "resend",
            "mail_api_key": "re_synthetic_placeholder_key_for_cookie_test",
            "mail_from": "noreply@evix.example.com",
            "provider_mode": "live",
            "mailbox_dir": tmp_path / "mailbox-prod",
            "sav_temp_dir": tmp_path / "sav-prod",
            "preflight_temp_dir": tmp_path / "preflight-prod",
        }
    else:
        base = {
            "mode": "local_test",
            "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_auth_guard_test",
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


def _assert_clean_chinese_api_error(
    resp: Any,
    *,
    expected_status: int,
    expected_code: str | None = None,
) -> dict[str, str]:
    assert resp.status_code != 500, f"Unexpected 500 server error: {resp.text}"
    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    raw = resp.text
    assert not FORBIDDEN_BRACKETS_RE.search(raw), f"Forbidden brackets leaked: {raw}"
    assert not PRIVATE_JARGON_RE.search(raw), f"Private jargon leaked: {raw}"
    assert not STACK_OR_EXCEPTION_RE.search(raw), f"Traceback/exception leaked: {raw}"
    assert not LOCAL_PATH_OR_URI_RE.search(raw), f"Local path/URI leaked: {raw}"

    payload = resp.json()
    assert set(payload.keys()) == {"error"}, payload
    err = payload["error"]
    assert set(err.keys()) == {"code", "message"}, payload
    if expected_code is not None:
        assert err["code"] == expected_code, f"Expected {expected_code!r}, got {err['code']!r}: {payload}"
    assert isinstance(err["message"], str) and CHINESE_CHAR_RE.search(err["message"]), payload
    return err


@pytest.fixture(scope="module")
def shared_auth_env(tmp_path_factory: pytest.TempPathFactory):
    root_tmp = tmp_path_factory.mktemp("session_auth_guard")
    settings = _make_settings(root_tmp)
    engine = _build_wal_sqlite_engine(root_tmp / "auth_lifecycle.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    workflow_handlers = {
        AgentRole.RESEARCH: lambda _s: AgentResult("已完成选题草案", ("artifact:t1",)),
        AgentRole.SURVEY: lambda _s: AgentResult("已完成问卷草案", ("artifact:s1",)),
        AgentRole.REVIEWER: lambda _s: AgentResult("复核通过", review_decision=ReviewDecision.APPROVE),
    }
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
    email_seq = {"idx": 0}

    def clear_rate_events() -> None:
        with DBSession(engine) as s:
            s.execute(delete(RateEvent))
            s.commit()

    def next_email() -> str:
        email_seq["idx"] += 1
        email = f"acct_{email_seq['idx']}@example.test"
        if email not in settings.invited_emails:
            settings.invited_emails.append(email)
        return email

    def new_client(*, origin: str | None = ORIGIN) -> TestClient:
        c = TestClient(app)
        opened_clients.append(c)
        if origin is not None:
            c.headers.update({"origin": origin})
        return c

    def login_fresh(email: str | None = None) -> tuple[TestClient, dict[str, Any], str, str]:
        clear_rate_events()
        addr = email or next_email()
        if addr not in settings.invited_emails:
            settings.invited_emails.append(addr)
        client = new_client()
        r_code = client.post("/api/auth/code", json={"email": addr})
        assert r_code.status_code == 202, r_code.text
        cid = r_code.json()["challengeId"]
        r_ver = client.post("/api/auth/verify", json={"challengeId": cid, "code": deliveries[cid][1]})
        assert r_ver.status_code == 200, r_ver.text
        raw_cookie = client.cookies.get(settings.cookie_name) or ""
        assert raw_cookie
        sess_json = r_ver.json()
        client.headers.update({"origin": ORIGIN, "x-csrf-token": sess_json["csrfToken"]})
        return client, sess_json, raw_cookie, addr

    yield {
        "app": app,
        "settings": settings,
        "engine": engine,
        "deliveries": deliveries,
        "clear_rate_events": clear_rate_events,
        "next_email": next_email,
        "new_client": new_client,
        "login_fresh": login_fresh,
    }

    for c in opened_clients:
        c.close()
    lifespan_ctx.__exit__(None, None, None)
    engine.dispose()


# ---------------------------------------------------------------------------
# 1. Session Cookie Security Attributes (`local_test` & `production`) — 2 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("is_production", [False, True], ids=["local_test_cookie", "production_secure_cookie"])
def test_session_cookie_attributes_local_and_production_modes(
    tmp_path: Path,
    is_production: bool,
) -> None:
    settings = _make_settings(
        tmp_path,
        production=False,
        cookie_name="__Host-evix_session" if is_production else "evix_session",
    )
    engine = _build_wal_sqlite_engine(tmp_path / f"cookie_mode_{is_production}.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    if is_production:
        prod_strict = _make_settings(tmp_path, production=True)
        with pytest.raises(ValueError, match="Production rejects injected fixtures"):
            create_app(prod_strict, mail=_mailer, provider=FixtureProvider(), engine=engine)

    app = create_app(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    if is_production:
        settings.mode = "production"
        settings.allowed_origins = [PROD_ORIGIN]
    active_origin = PROD_ORIGIN if is_production else ORIGIN
    client = TestClient(app, base_url=active_origin)
    try:

        r_code = client.post(
            "/api/auth/code",
            headers={"origin": active_origin},
            json={"email": "acct_1@example.test"},
        )
        assert r_code.status_code == 202, r_code.text
        cid = r_code.json()["challengeId"]

        r_ver = client.post(
            "/api/auth/verify",
            headers={"origin": active_origin},
            json={"challengeId": cid, "code": deliveries[cid][1]},
        )
        assert r_ver.status_code == 200, r_ver.text
        set_cookie_raw = r_ver.headers.get("set-cookie") or ""
        assert set_cookie_raw

        parsed_cookie = SimpleCookie()
        parsed_cookie.load(set_cookie_raw)
        assert settings.cookie_name in parsed_cookie
        morsel = parsed_cookie[settings.cookie_name]
        token_val = morsel.value
        assert len(token_val) >= 32
        # Raw session token must NEVER appear in JSON body
        assert token_val not in r_ver.text
        assert morsel["httponly"] is True
        assert morsel["path"] == "/"
        assert morsel["samesite"].lower() in ("strict", "lax")
        assert morsel["samesite"].lower() == "strict"
        assert int(morsel["max-age"]) == 30 * 86400
        if is_production:
            assert settings.cookie_name.startswith("__Host-")
            assert morsel["secure"] is True
        else:
            assert not morsel["secure"]

        # Verify /api/session headers & zero raw token echo
        r_sess = client.get("/api/session")
        assert r_sess.status_code == 200
        assert "no-store" in (r_sess.headers.get("cache-control") or "")
        assert "Cookie" in (r_sess.headers.get("vary") or "")
        assert r_sess.json()["authenticated"] is True
        assert token_val not in r_sess.text

        # Verify /api/auth/logout clears cookie with matching Path, HttpOnly, SameSite & Max-Age=0
        csrf_token = r_ver.json()["csrfToken"]
        r_out = client.post(
            "/api/auth/logout",
            headers={"origin": active_origin, "x-csrf-token": csrf_token},
        )
        assert r_out.status_code == 204
        del_cookie_raw = r_out.headers.get("set-cookie") or ""
        del_parsed = SimpleCookie()
        del_parsed.load(del_cookie_raw)
        del_morsel = del_parsed[settings.cookie_name]
        assert del_morsel["path"] == "/"
        assert del_morsel["httponly"] is True
        assert del_morsel["samesite"].lower() == "strict"
        assert int(del_morsel["max-age"]) == 0
        if is_production:
            assert del_morsel["secure"] is True
    finally:
        client.close()
        engine.dispose()


@pytest.mark.parametrize(
    ("bad_override", "expected_msg"),
    [
        ({"cookie_name": "evix_session"}, "__Host-"),
        ({"allowed_origins": ["http://evix.example.com"]}, "HTTPS"),
    ],
    ids=["reject_non_host_cookie_prefix", "reject_http_origin_in_prod"],
)
def test_production_settings_enforces_host_cookie_prefix_and_https_origins(
    tmp_path: Path,
    bad_override: dict[str, Any],
    expected_msg: str,
) -> None:
    with pytest.raises(ValueError, match=expected_msg):
        _make_settings(tmp_path, production=True, **bad_override)


# ---------------------------------------------------------------------------
# 2. Session-Bound CSRF & Origin Enforcement Matrix — 9 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("vector_kind", "expected_code"),
    [
        ("missing_csrf", "csrf_required"),
        ("empty_csrf", "csrf_required"),
        ("random_forged_csrf", "csrf_required"),
        ("other_user_csrf", "csrf_required"),
        ("truncated_csrf", "csrf_required"),
        ("missing_origin", "origin_forbidden"),
        ("evil_origin", "origin_forbidden"),
        ("evil_referer", "origin_forbidden"),
        ("cross_site_fetch_metadata", "origin_forbidden"),
    ],
)
def test_csrf_and_origin_enforcement_matrix_on_authenticated_mutations(
    shared_auth_env: dict[str, Any],
    vector_kind: str,
    expected_code: str,
) -> None:
    settings: Settings = shared_auth_env["settings"]
    owner_client, owner_sess, raw_cookie, _ = shared_auth_env["login_fresh"]()
    _, other_sess, _, _ = shared_auth_env["login_fresh"]()
    team_id = owner_client.get("/api/teams").json()["teams"][0]["id"]

    probe = shared_auth_env["new_client"](origin=None)
    probe.cookies.set(settings.cookie_name, raw_cookie)

    headers: dict[str, str] = {"origin": ORIGIN, "x-csrf-token": owner_sess["csrfToken"]}
    if vector_kind == "missing_csrf":
        headers.pop("x-csrf-token")
    elif vector_kind == "empty_csrf":
        headers["x-csrf-token"] = ""
    elif vector_kind == "random_forged_csrf":
        headers["x-csrf-token"] = secrets.token_urlsafe(32)
    elif vector_kind == "other_user_csrf":
        headers["x-csrf-token"] = other_sess["csrfToken"]
    elif vector_kind == "truncated_csrf":
        headers["x-csrf-token"] = owner_sess["csrfToken"][:12]
    elif vector_kind == "missing_origin":
        headers.pop("origin")
    elif vector_kind == "evil_origin":
        headers["origin"] = "https://evil-attacker.example"
    elif vector_kind == "evil_referer":
        headers["referer"] = "https://evil-attacker.example/phish"
    elif vector_kind == "cross_site_fetch_metadata":
        headers["sec-fetch-site"] = "cross-site"

    resp = probe.post(
        "/api/projects",
        headers=headers,
        json={"teamId": team_id, "title": f"CSRF阻断核验-{vector_kind}", "idempotencyKey": str(uuid4())},
    )
    _assert_clean_chinese_api_error(resp, expected_status=403, expected_code=expected_code)


# ---------------------------------------------------------------------------
# 3. Tampered, Forged, Expired & De-Admitted Session Cookie Matrix — 10 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "tamper_kind",
    [
        "missing_cookie",
        "empty_cookie",
        "bit_flipped_tail",
        "truncated_half",
        "random_unknown_token",
        "csrf_token_as_cookie",
        "sql_injection_payload",
        "oversized_4kb_cookie",
        "expired_db_session_row",
        "deadmitted_user_account",
    ],
)
def test_tampered_forged_expired_and_malformed_session_cookies_rejected(
    shared_auth_env: dict[str, Any],
    tamper_kind: str,
) -> None:
    settings: Settings = shared_auth_env["settings"]
    engine = shared_auth_env["engine"]
    _client, sess_json, valid_cookie, email = shared_auth_env["login_fresh"]()
    user_id = sess_json["user"]["id"]

    probe = shared_auth_env["new_client"]()
    if tamper_kind == "missing_cookie":
        pass
    elif tamper_kind == "empty_cookie":
        probe.cookies.set(settings.cookie_name, "")
    elif tamper_kind == "bit_flipped_tail":
        flipped_char = "A" if valid_cookie[-1] != "A" else "B"
        probe.cookies.set(settings.cookie_name, valid_cookie[:-1] + flipped_char)
    elif tamper_kind == "truncated_half":
        probe.cookies.set(settings.cookie_name, valid_cookie[: len(valid_cookie) // 2])
    elif tamper_kind == "random_unknown_token":
        probe.cookies.set(settings.cookie_name, secrets.token_urlsafe(32))
    elif tamper_kind == "csrf_token_as_cookie":
        probe.cookies.set(settings.cookie_name, sess_json["csrfToken"])
    elif tamper_kind == "sql_injection_payload":
        probe.cookies.set(settings.cookie_name, "' OR 1=1 --")
    elif tamper_kind == "oversized_4kb_cookie":
        probe.cookies.set(settings.cookie_name, "x" * 4096)
    elif tamper_kind == "expired_db_session_row":
        with DBSession(engine) as db_sess:
            db_sess.execute(
                update(DbSessionModel)
                .where(DbSessionModel.user_id == user_id)
                .values(expires_at=now() - timedelta(minutes=1))
            )
            db_sess.commit()
        probe.cookies.set(settings.cookie_name, valid_cookie)
    elif tamper_kind == "deadmitted_user_account":
        settings.invited_emails.remove(email)
        probe.cookies.set(settings.cookie_name, valid_cookie)

    try:
        # /api/session gracefully reports authenticated=False without 500
        r_sess = probe.get("/api/session")
        assert r_sess.status_code == 200, r_sess.text
        assert r_sess.json()["authenticated"] is False

        # Protected endpoints deterministically reject with 401 session_required pure Chinese
        r_projects = probe.get("/api/projects")
        _assert_clean_chinese_api_error(r_projects, expected_status=401, expected_code="session_required")
    finally:
        if tamper_kind == "deadmitted_user_account" and email not in settings.invited_emails:
            settings.invited_emails.append(email)


# ---------------------------------------------------------------------------
# 4. OTP Single-Use Replay, Superseded, Lockout & Expiry Matrix — 9 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "otp_case",
    [
        "single_use_replay_after_success",
        "superseded_prior_challenge",
        "wrong_6digit_code",
        "expired_challenge_window",
        "undelivered_mail_challenge",
        "five_attempt_bruteforce_lockout",
        "malformed_5digit_code",
        "non_uuid_challenge_id",
        "malformed_email_on_code_request",
    ],
)
def test_otp_single_use_replay_wrong_code_expired_and_malformed_verify_matrix(
    shared_auth_env: dict[str, Any],
    otp_case: str,
) -> None:
    shared_auth_env["clear_rate_events"]()
    engine = shared_auth_env["engine"]
    deliveries: dict[str, tuple[str, str]] = shared_auth_env["deliveries"]
    anon = shared_auth_env["new_client"]()

    if otp_case == "malformed_email_on_code_request":
        r_bad_email = anon.post("/api/auth/code", json={"email": "not-a-valid-email@@example.test"})
        _assert_clean_chinese_api_error(r_bad_email, expected_status=422, expected_code="invalid_input")
        return

    if otp_case == "non_uuid_challenge_id":
        r_bad_cid = anon.post("/api/auth/verify", json={"challengeId": "not-a-uuid", "code": "123456"})
        _assert_clean_chinese_api_error(r_bad_cid, expected_status=422, expected_code="invalid_input")
        return

    email = shared_auth_env["next_email"]()
    r_code1 = anon.post("/api/auth/code", json={"email": email})
    assert r_code1.status_code == 202, r_code1.text
    cid1 = r_code1.json()["challengeId"]
    otp1 = deliveries[cid1][1]

    if otp_case == "single_use_replay_after_success":
        r_ok = anon.post("/api/auth/verify", json={"challengeId": cid1, "code": otp1})
        assert r_ok.status_code == 200, r_ok.text
        anon2 = shared_auth_env["new_client"]()
        r_replay = anon2.post("/api/auth/verify", json={"challengeId": cid1, "code": otp1})
        _assert_clean_chinese_api_error(r_replay, expected_status=401, expected_code="email_code_invalid")
    elif otp_case == "superseded_prior_challenge":
        shared_auth_env["clear_rate_events"]()
        r_code2 = anon.post("/api/auth/code", json={"email": email})
        assert r_code2.status_code == 202, r_code2.text
        cid2 = r_code2.json()["challengeId"]
        otp2 = deliveries[cid2][1]
        # Prior challenge cid1 was marked consumed when cid2 was issued
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid1, "code": otp1}),
            expected_status=401,
            expected_code="email_code_invalid",
        )
        assert anon.post("/api/auth/verify", json={"challengeId": cid2, "code": otp2}).status_code == 200
    elif otp_case == "wrong_6digit_code":
        wrong = "000000" if otp1 != "000000" else "999999"
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid1, "code": wrong}),
            expected_status=401,
            expected_code="email_code_invalid",
        )
    elif otp_case == "expired_challenge_window":
        with DBSession(engine) as db_sess:
            db_sess.execute(
                update(Challenge)
                .where(Challenge.id == cid1)
                .values(expires_at=now() - timedelta(seconds=10))
            )
            db_sess.commit()
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid1, "code": otp1}),
            expected_status=401,
            expected_code="email_code_invalid",
        )
    elif otp_case == "undelivered_mail_challenge":
        with DBSession(engine) as db_sess:
            db_sess.execute(update(Challenge).where(Challenge.id == cid1).values(delivered=False))
            db_sess.commit()
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid1, "code": otp1}),
            expected_status=401,
            expected_code="email_code_invalid",
        )
    elif otp_case == "five_attempt_bruteforce_lockout":
        wrong = "111111" if otp1 != "111111" else "222222"
        for _ in range(5):
            _assert_clean_chinese_api_error(
                anon.post("/api/auth/verify", json={"challengeId": cid1, "code": wrong}),
                expected_status=401,
                expected_code="email_code_invalid",
            )
        # 6th attempt even with the exact real OTP must fail closed
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid1, "code": otp1}),
            expected_status=401,
            expected_code="email_code_invalid",
        )
    elif otp_case == "malformed_5digit_code":
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid1, "code": "12345"}),
            expected_status=401,
            expected_code="email_code_invalid",
        )


# ---------------------------------------------------------------------------
# 5. OTP Cooldown, Per-Email Hourly Cap & IP Burst Rate-Limit Guards — 3 tests
# ---------------------------------------------------------------------------


def test_otp_60s_cooldown_rejects_rapid_repeat_with_chinese_429(shared_auth_env: dict[str, Any]) -> None:
    shared_auth_env["clear_rate_events"]()
    email = shared_auth_env["next_email"]()
    anon = shared_auth_env["new_client"]()
    assert anon.post("/api/auth/code", json={"email": email}).status_code == 202
    r_repeat = anon.post("/api/auth/code", json={"email": email})
    _assert_clean_chinese_api_error(r_repeat, expected_status=429, expected_code="email_rate_limit")


def test_otp_hourly_5_per_email_quota_enforced(shared_auth_env: dict[str, Any]) -> None:
    shared_auth_env["clear_rate_events"]()
    engine = shared_auth_env["engine"]
    email = shared_auth_env["next_email"]()
    other_email = shared_auth_env["next_email"]()
    anon = shared_auth_env["new_client"]()

    for step_idx in range(5):
        r = anon.post("/api/auth/code", json={"email": email})
        assert r.status_code == 202, r.text
        # Shift timestamps back 3 minutes so 60s cooldown clears while staying inside the 1-hour window
        with DBSession(engine) as db_sess:
            db_sess.execute(
                update(RateEvent).values(created_at=now() - timedelta(minutes=3 + step_idx))
            )
            db_sess.commit()

    r_sixth = anon.post("/api/auth/code", json={"email": email})
    _assert_clean_chinese_api_error(r_sixth, expected_status=429, expected_code="email_rate_limit")
    # Unrelated email is NOT blocked by `email`'s per-address hourly quota
    assert anon.post("/api/auth/code", json={"email": other_email}).status_code == 202


def test_otp_ip_burst_limit_blocks_enumeration_flood_with_chinese_429(shared_auth_env: dict[str, Any]) -> None:
    shared_auth_env["clear_rate_events"]()
    anon = shared_auth_env["new_client"]()
    for idx in range(20):
        r = anon.post("/api/auth/code", json={"email": f"flood_target_{idx}@external.test"})
        assert r.status_code == 202, r.text
    r_21st = anon.post("/api/auth/code", json={"email": "flood_target_21@external.test"})
    _assert_clean_chinese_api_error(r_21st, expected_status=429, expected_code="email_rate_limit")
    shared_auth_env["clear_rate_events"]()


# ---------------------------------------------------------------------------
# 6. Concurrent Multi-Account Isolation & Multi-Device Selective Logout — 2 tests
# ---------------------------------------------------------------------------


def test_parallel_4_account_sessions_zero_identity_or_project_crosstalk(shared_auth_env: dict[str, Any]) -> None:
    accounts = [shared_auth_env["login_fresh"]() for _ in range(4)]
    csrf_tokens = {sess["csrfToken"] for _, sess, _, _ in accounts}
    cookies = {ck for _, _, ck, _ in accounts}
    assert len(csrf_tokens) == 4
    assert len(cookies) == 4

    def _exercise_tenant(idx: int) -> tuple[str, str, list[str]]:
        app = shared_auth_env["app"]
        settings: Settings = shared_auth_env["settings"]
        _, sess_json, raw_cookie, email = accounts[idx]
        worker = TestClient(app)
        try:
            worker.cookies.set(settings.cookie_name, raw_cookie)
            worker.headers.update({"origin": ORIGIN, "x-csrf-token": sess_json["csrfToken"]})
            s_body = worker.get("/api/session").json()
            assert s_body["authenticated"] is True
            assert s_body["user"]["email"] == email
            team_id = worker.get("/api/teams").json()["teams"][0]["id"]
            marker = f"并发隔离课题-{idx}-{uuid4().hex[:6]}"
            r_create = worker.post(
                "/api/projects",
                json={"teamId": team_id, "title": marker, "idempotencyKey": str(uuid4())},
            )
            assert r_create.status_code == 201, r_create.text
            titles = [p["title"] for p in worker.get("/api/projects").json()["projects"]]
            return email, marker, titles
        finally:
            worker.close()

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(_exercise_tenant, range(4)))

    all_markers = [marker for _, marker, _ in results]
    for idx, (_email, own_marker, visible_titles) in enumerate(results):
        assert own_marker in visible_titles
        for other_idx, other_marker in enumerate(all_markers):
            if other_idx != idx:
                assert other_marker not in visible_titles


def test_same_user_two_devices_independent_sessions_and_selective_logout(shared_auth_env: dict[str, Any]) -> None:
    email = shared_auth_env["next_email"]()
    dev_a, sess_a, cookie_a, _ = shared_auth_env["login_fresh"](email)
    dev_b, sess_b, cookie_b, _ = shared_auth_env["login_fresh"](email)
    assert cookie_a != cookie_b
    assert sess_a["csrfToken"] != sess_b["csrfToken"]

    # Logout on Device A revokes ONLY Device A
    r_out_a = dev_a.post("/api/auth/logout")
    assert r_out_a.status_code == 204

    replay_a = shared_auth_env["new_client"]()
    replay_a.cookies.set(shared_auth_env["settings"].cookie_name, cookie_a)
    replay_a.headers.update({"origin": ORIGIN, "x-csrf-token": sess_a["csrfToken"]})
    _assert_clean_chinese_api_error(replay_a.get("/api/projects"), expected_status=401, expected_code="session_required")

    # Device B continues operating normally
    assert dev_b.get("/api/session").json()["authenticated"] is True
    assert dev_b.get("/api/projects").status_code == 200


# ---------------------------------------------------------------------------
# 7. Immediate Logout Revocation Across Protected Endpoints — 9 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "endpoint_target",
    [
        "get_project",
        "create_project",
        "save_questionnaire_version",
        "save_report_version",
        "publish_survey_release",
        "create_agent_task",
        "create_agent_chat_turn",
        "create_autonomous_run",
        "repeat_logout",
    ],
)
def test_logout_immediate_revocation_across_protected_project_survey_and_agent_endpoints(
    shared_auth_env: dict[str, Any],
    endpoint_target: str,
) -> None:
    settings: Settings = shared_auth_env["settings"]
    client, sess_json, raw_cookie, _ = shared_auth_env["login_fresh"]()
    team_id = client.get("/api/teams").json()["teams"][0]["id"]
    proj = client.post(
        "/api/projects",
        json={"teamId": team_id, "title": "登出吊销核验课题", "idempotencyKey": str(uuid4())},
    ).json()
    pid = proj["id"]

    # Revoke session via /api/auth/logout
    r_logout = client.post("/api/auth/logout")
    assert r_logout.status_code == 204

    # Prepare replay client still carrying the pre-logout cookie & pre-logout CSRF token
    replayer = shared_auth_env["new_client"]()
    replayer.cookies.set(settings.cookie_name, raw_cookie)
    replayer.headers.update({"origin": ORIGIN, "x-csrf-token": sess_json["csrfToken"]})
    assert replayer.get("/api/session").json()["authenticated"] is False

    if endpoint_target == "get_project":
        resp = replayer.get(f"/api/projects/{pid}")
    elif endpoint_target == "create_project":
        resp = replayer.post(
            "/api/projects",
            json={"teamId": team_id, "title": "登出后立项", "idempotencyKey": str(uuid4())},
        )
    elif endpoint_target == "save_questionnaire_version":
        resp = replayer.post(
            f"/api/projects/{pid}/questionnaire/versions",
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "design": {"schema": "questionnaire-design/v1"}},
        )
    elif endpoint_target == "save_report_version":
        resp = replayer.post(
            f"/api/projects/{pid}/report/versions",
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "content": {"version": 1}},
        )
    elif endpoint_target == "publish_survey_release":
        resp = replayer.post(
            f"/api/projects/{pid}/surveys",
            json={"expectedQuestionnaireRevision": 1, "idempotencyKey": str(uuid4())},
        )
    elif endpoint_target == "create_agent_task":
        resp = replayer.post(
            f"/api/projects/{pid}/agent-tasks",
            json={"taskType": "questionnaire", "requirements": {"goal": "登出后发起协作任务"}},
        )
    elif endpoint_target == "create_agent_chat_turn":
        resp = replayer.post(
            "/api/agent/turns",
            json={
                "schemaVersion": 1,
                "idempotencyKey": str(uuid4()),
                "message": "登出后发起对话",
                "history": [],
                "context": {},
                "serviceId": str(uuid4()),
                "serviceRevision": 1,
                "consent": True,
            },
        )
    elif endpoint_target == "create_autonomous_run":
        resp = replayer.post(
            f"/api/projects/{pid}/autonomous-runs",
            json={
                "idempotencyKey": str(uuid4()),
                "goal": "登出后启动自主探索",
                "datasetMode": "planted_trap_benchmark",
            },
        )
    else:
        resp = replayer.post("/api/auth/logout")

    _assert_clean_chinese_api_error(resp, expected_status=401, expected_code="session_required")
