"""Permanent CI guard #50 (`CI-BE-32`) for Knowledge & System Endpoints (`/api/health`, `/api/ready`, `/api/session`, `/api/net-exam/bank`, `/api/me/knowledge-state`, `/api/projects/{id}/knowledge-references`, `/api/knowledge/**`).

Covers Wave 30 (`#617` §11 — 32nd backend permanent CI guard / 50th full-stack permanent CI guard, 46 collected tests):
1. System Health, Readiness Probe, Session & Net-Exam Bank Zero-Leak & Header Hygiene (`6` tests):
   - Verifies `/api/health`, `/api/ready`, `/api/session`, and `/api/net-exam/bank` enforce `nosniff`
     and `Cache-Control: no-store` (plus `ETag` `304` conditional caching on valid exam banks) while
     NEVER leaking `auth_secret`, `keyring`, `mail_api_key`, database URIs, or local filesystem paths
     even when the exam bank file is missing, malformed, unverified, or oversized (`503`).
2. Knowledge Account State Sync, Optimistic CAS, Payload Size Caps & Multi-User Isolation (`6` tests):
   - Verifies `/api/me/knowledge-state` bookmark/recent/preference sync, idempotent replay, `409
     version_conflict`, strict per-user isolation, and `413 payload_too_large` enforcement across all
     4 knowledge write endpoints (`100 KB`, `2 KB`, `4 KB`, `1 KB`).
3. Slug/Version Validation, Path-Traversal Rejection & Preference Bounds Matrix (`15` vectors):
   - Blocks `../` / `..\\` / hidden-dot path traversal slugs, unknown slugs, wrong/non-int versions
     (`422 knowledge_version_unavailable`), duplicate entries, `> 50` recent items, out-of-range float
     coordinates/dimensions, path-traversal `scrollEntryId`, and control characters in queries.
4. Project Knowledge References 4-Role RBAC, Soft-Delete/Restore Lifecycle & Traversal Guard (`8` tests):
   - Verifies `owner`/`editor` add/delete/restore lifecycle, `viewer` read-only `403 permission_denied`
     on mutations, `outsider` `404 not_found` across read/write, and path-traversal rejection.
5. Knowledge Term-Request Validation & Per-User 5/Day Rate-Limit Isolation (`6` tests):
   - Blocks whitespace-padded, control-char, empty, and overlong `term`/`domain`/`note` inputs (`422`),
     and enforces the 5/day per-user quota (`429 knowledge_request_limit`) without blocking other users.
6. Knowledge Lookups Offline `503`, HTML/URL Sanitization, Budget Circuit-Breaker & Catalog Audit (`5` tests):
   - Verifies offline default `503 knowledge_lookup_unconfigured`, `PlainText` HTML stripping &
     `safe_result_url` scheme/credential filtering, cross-user lookup `404` isolation, daily/monthly
     budget caps & usage-anomaly circuit-breaker (`monthly.blocked`), and 360-entry catalog integrity.
"""

from __future__ import annotations

from datetime import timezone
import json
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime

from application.providers import FixtureProvider
from evix_api.app import create_app
from evix_api.dependencies import create_dependencies
from evix_api.errors import install_handlers
from evix_api.routes import auth as auth_routes
from evix_api.routes import knowledge as knowledge_routes
from evix_api.runtime import create_runtime, install_boundary_guard
from evix_api.security import install_security_middleware
from infrastructure.database.models import Base
from infrastructure.settings import Settings
from multi_agent.agents.research_agent.services import knowledge as knowledge_domain

ORIGIN = "http://localhost:3180"
CANARY_DB_URL = "postgresql+psycopg://canary_db_user:canary_db_pass_9911@127.0.0.1:55432/evix_secret_db"

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
    r"|IntegrityError|OperationalError|RequestValidationError|FileNotFoundError)\b",
    re.IGNORECASE,
)
LOCAL_PATH_OR_URI_RE = re.compile(
    r"(?:(?<![A-Za-z])[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root|etc)/[^\s\"'<>]+)"
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


def _make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    invited = [
        "know_a@example.test",
        "know_b@example.test",
        "know_editor@example.test",
        "know_viewer@example.test",
        "term_quota_a@example.test",
        "term_quota_b@example.test",
    ]
    base: dict[str, Any] = {
        "mode": "local_test",
        "database_url": CANARY_DB_URL,
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


def _assert_security_headers_and_zero_leaks(resp: Any, settings: Settings, *, extra_secret: str = "") -> None:
    assert resp.status_code != 500, f"Unexpected 500 response: {resp.text}"
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert "no-store" in (resp.headers.get("cache-control") or "")
    raw = resp.text
    assert settings.auth_secret not in raw
    for vault_key in settings.keyring.values():
        assert vault_key not in raw
    assert "canary_db_pass_9911" not in raw
    assert str(settings.mailbox_dir) not in raw
    if settings.net_exam_bank_path is not None:
        assert str(settings.net_exam_bank_path) not in raw
        assert settings.net_exam_bank_path.as_posix() not in raw
    if extra_secret:
        assert extra_secret not in raw
    assert not FORBIDDEN_BRACKETS_RE.search(raw), f"Forbidden brackets leaked: {raw}"
    assert not PRIVATE_JARGON_RE.search(raw), f"Private jargon leaked: {raw}"
    assert not STACK_OR_EXCEPTION_RE.search(raw), f"Traceback/exception leaked: {raw}"
    assert not LOCAL_PATH_OR_URI_RE.search(raw), f"Host path or DB URI leaked: {raw}"


def _assert_clean_chinese_api_error(
    resp: Any,
    settings: Settings,
    *,
    expected_status: int,
    expected_code: str | None = None,
) -> dict[str, str]:
    _assert_security_headers_and_zero_leaks(resp, settings)
    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    payload = resp.json()
    assert set(payload.keys()) == {"error"}, payload
    err = payload["error"]
    assert set(err.keys()) == {"code", "message"}, payload
    if expected_code is not None:
        assert err["code"] == expected_code, f"Expected {expected_code!r}, got {err['code']!r}: {payload}"
    assert isinstance(err["message"], str) and CHINESE_CHAR_RE.search(err["message"]), payload
    return err


def _valid_exam_bank_payload() -> dict[str, Any]:
    return {
        "version": "2026.1-verified",
        "sources": [{"id": "src-gbt-sampling", "title": "抽样调查方法学导论"}],
        "questions": [
            {
                "id": "q-srs-001",
                "type": "single",
                "stem": "分层随机抽样相比简单随机抽样在层间异质性较大时的主要统计优势是什么？",
                "chapter": "抽样设计",
                "options": [
                    {"id": "A", "text": "显著降低估计量方差并缩小设计效应"},
                    {"id": "B", "text": "完全消除非抽样拒访偏差"},
                ],
                "answer": ["A"],
                "answerStatus": "valid",
                "sourceRefs": [{"sourceId": "src-gbt-sampling", "locators": ["p.42"]}],
            }
        ],
    }


@pytest.fixture(scope="module")
def shared_know_env(tmp_path_factory: pytest.TempPathFactory):
    root_tmp = tmp_path_factory.mktemp("knowledge_system_guard")
    settings = _make_settings(root_tmp)
    engine = _build_wal_sqlite_engine(root_tmp / "knowledge_system.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    app = create_app(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    lifespan_ctx = TestClient(app)
    lifespan_ctx.__enter__()
    opened_clients: list[TestClient] = []
    cached_logins: dict[str, tuple[TestClient, dict[str, Any]]] = {}
    catalog = knowledge_domain.catalog_from_file()
    sorted_entries = sorted((eid, sorted(vers)[0]) for eid, vers in catalog.items())
    assert len(sorted_entries) >= 60

    def get_logged_in(email: str) -> tuple[TestClient, dict[str, Any]]:
        if email in cached_logins:
            return cached_logins[email]
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
        sess_json = r_ver.json()
        client.headers.update({"origin": ORIGIN, "x-csrf-token": sess_json["csrfToken"]})
        cached_logins[email] = (client, sess_json)
        return client, sess_json

    anon = TestClient(app)
    opened_clients.append(anon)

    # Set up a shared team & project for RBAC reference tests
    owner, _ = get_logged_in("know_a@example.test")
    editor, _ = get_logged_in("know_editor@example.test")
    viewer, _ = get_logged_in("know_viewer@example.test")
    outsider, _ = get_logged_in("know_b@example.test")
    team_id = owner.get("/api/teams").json()["teams"][0]["id"]
    assert owner.post(f"/api/teams/{team_id}/members", json={"email": "know_editor@example.test", "role": "editor"}).status_code == 201
    assert owner.post(f"/api/teams/{team_id}/members", json={"email": "know_viewer@example.test", "role": "viewer"}).status_code == 201
    proj = owner.post(
        "/api/projects",
        json={"teamId": team_id, "title": "知识镜引用与角色隔离课题", "idempotencyKey": str(uuid4())},
    ).json()

    yield {
        "app": app,
        "settings": settings,
        "engine": engine,
        "anon": anon,
        "get_logged_in": get_logged_in,
        "catalog_entries": sorted_entries,
        "project_id": proj["id"],
        "owner": owner,
        "editor": editor,
        "viewer": viewer,
        "outsider": outsider,
    }

    for c in opened_clients:
        c.close()
    lifespan_ctx.__exit__(None, None, None)
    engine.dispose()


# ---------------------------------------------------------------------------
# 1. System Endpoints (`/api/health`, `/api/ready`, `/api/session`, `/api/net-exam/bank`) — 6 tests
# ---------------------------------------------------------------------------


def test_health_endpoint_headers_and_zero_secret_db_or_path_leak(shared_know_env: dict[str, Any]) -> None:
    anon: TestClient = shared_know_env["anon"]
    settings: Settings = shared_know_env["settings"]
    resp = anon.get("/api/health")
    _assert_security_headers_and_zero_leaks(resp, settings)
    assert resp.status_code == 200
    assert resp.headers.get("referrer-policy") == "no-referrer"
    assert resp.json() == {"status": "ok", "database": "ok", "mode": "local_test"}


def test_ready_probe_returns_clean_chinese_404_with_security_headers_and_zero_leaks(
    shared_know_env: dict[str, Any],
) -> None:
    anon: TestClient = shared_know_env["anon"]
    settings: Settings = shared_know_env["settings"]
    resp = anon.get("/api/ready")
    _assert_clean_chinese_api_error(resp, settings, expected_status=404, expected_code="not_found")


def test_session_endpoint_anonymous_and_authenticated_headers_and_zero_leaks(
    shared_know_env: dict[str, Any],
) -> None:
    anon: TestClient = shared_know_env["anon"]
    owner: TestClient = shared_know_env["owner"]
    settings: Settings = shared_know_env["settings"]

    r_anon = anon.get("/api/session")
    _assert_security_headers_and_zero_leaks(r_anon, settings)
    assert r_anon.status_code == 200
    assert "Cookie" in (r_anon.headers.get("vary") or "")
    assert r_anon.json() == {"authenticated": False, "mode": "local_test", "providerMode": "fixture"}

    raw_cookie = owner.cookies.get(settings.cookie_name) or ""
    r_auth = owner.get("/api/session")
    _assert_security_headers_and_zero_leaks(r_auth, settings, extra_secret=raw_cookie)
    assert r_auth.status_code == 200
    assert "Cookie" in (r_auth.headers.get("vary") or "")
    assert r_auth.json()["authenticated"] is True


def test_net_exam_bank_unauthenticated_and_unconfigured_zero_path_leak(
    shared_know_env: dict[str, Any],
) -> None:
    anon: TestClient = shared_know_env["anon"]
    owner: TestClient = shared_know_env["owner"]
    settings: Settings = shared_know_env["settings"]

    _assert_clean_chinese_api_error(
        anon.get("/api/net-exam/bank"),
        settings,
        expected_status=401,
        expected_code="session_required",
    )
    _assert_clean_chinese_api_error(
        owner.get("/api/net-exam/bank"),
        settings,
        expected_status=404,
        expected_code="net_exam_bank_unavailable",
    )


def test_net_exam_bank_missing_corrupt_and_unverified_files_never_leak_filesystem_path(
    tmp_path: Path,
) -> None:
    bank_file = tmp_path / "secret_operator_dir" / "exam_bank.json"
    bank_file.parent.mkdir(parents=True, exist_ok=True)
    settings = _make_settings(tmp_path, net_exam_bank_path=bank_file)
    engine = _build_wal_sqlite_engine(tmp_path / "exam_invalid.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(cid: str, email: str, code: str) -> None:
        deliveries[cid] = (email, code)

    app = create_app(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    client = TestClient(app)
    try:
        cid = client.post("/api/auth/code", headers={"origin": ORIGIN}, json={"email": "know_a@example.test"}).json()["challengeId"]
        sess = client.post("/api/auth/verify", headers={"origin": ORIGIN}, json={"challengeId": cid, "code": deliveries[cid][1]}).json()
        client.headers.update({"origin": ORIGIN, "x-csrf-token": sess["csrfToken"]})

        # 1) Missing file on disk -> 404 net_exam_bank_unavailable (zero path leak)
        _assert_clean_chinese_api_error(
            client.get("/api/net-exam/bank"),
            settings,
            expected_status=404,
            expected_code="net_exam_bank_unavailable",
        )

        # 2) Corrupt JSON -> 503 net_exam_bank_invalid (zero path/JSONDecodeError leak)
        bank_file.write_text("{corrupt json", encoding="utf-8")
        _assert_clean_chinese_api_error(
            client.get("/api/net-exam/bank"),
            settings,
            expected_status=503,
            expected_code="net_exam_bank_invalid",
        )

        # 3) Unverified question (`answerStatus != 'valid'`) -> 503 net_exam_bank_invalid
        bad_bank = _valid_exam_bank_payload()
        bad_bank["questions"][0]["answerStatus"] = "unverified"
        bank_file.write_text(json.dumps(bad_bank, ensure_ascii=False), encoding="utf-8")
        _assert_clean_chinese_api_error(
            client.get("/api/net-exam/bank"),
            settings,
            expected_status=503,
            expected_code="net_exam_bank_invalid",
        )
    finally:
        client.close()
        engine.dispose()


def test_net_exam_bank_valid_etag_304_caching_and_headers(tmp_path: Path) -> None:
    bank_file = tmp_path / "verified_bank.json"
    bank_file.write_text(json.dumps(_valid_exam_bank_payload(), ensure_ascii=False), encoding="utf-8")
    settings = _make_settings(tmp_path, net_exam_bank_path=bank_file)
    engine = _build_wal_sqlite_engine(tmp_path / "exam_valid.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(cid: str, email: str, code: str) -> None:
        deliveries[cid] = (email, code)

    app = create_app(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    client = TestClient(app)
    try:
        cid = client.post("/api/auth/code", headers={"origin": ORIGIN}, json={"email": "know_a@example.test"}).json()["challengeId"]
        sess = client.post("/api/auth/verify", headers={"origin": ORIGIN}, json={"challengeId": cid, "code": deliveries[cid][1]}).json()
        client.headers.update({"origin": ORIGIN, "x-csrf-token": sess["csrfToken"]})

        r_ok = client.get("/api/net-exam/bank")
        _assert_security_headers_and_zero_leaks(r_ok, settings)
        assert r_ok.status_code == 200
        assert "Cookie" in (r_ok.headers.get("vary") or "")
        etag = r_ok.headers.get("etag") or ""
        assert etag.startswith('"sha256-')
        assert r_ok.json()["version"] == "2026.1-verified"

        # Strong ETag, weak W/ ETag, and wildcard '*' all return 304 Not Modified
        for match_hdr in (etag, f"W/{etag}", "*"):
            r_304 = client.get("/api/net-exam/bank", headers={"if-none-match": match_hdr})
            assert r_304.status_code == 304
            assert r_304.headers.get("etag") == etag
    finally:
        client.close()
        engine.dispose()


# ---------------------------------------------------------------------------
# 2. Knowledge Account State Sync, CAS, Size Caps & Multi-User Isolation — 6 tests
# ---------------------------------------------------------------------------


def test_knowledge_state_sync_idempotency_cas_and_multi_user_isolation(
    shared_know_env: dict[str, Any],
) -> None:
    settings: Settings = shared_know_env["settings"]
    owner: TestClient = shared_know_env["owner"]
    outsider: TestClient = shared_know_env["outsider"]
    entries: list[tuple[str, int]] = shared_know_env["catalog_entries"]
    e1_id, e1_ver = entries[0]
    e2_id, e2_ver = entries[1]

    # Initial state
    r_init = owner.get("/api/me/knowledge-state")
    _assert_security_headers_and_zero_leaks(r_init, settings)
    assert r_init.status_code == 200
    assert r_init.json() == {"revision": 0, "favorites": [], "recent": [], "preferences": {}}

    # Put revision 1 with bookmarks, recent history & pinned preferences
    idem_1 = str(uuid4())
    state_v1 = {
        "favorites": [{"entryId": e1_id, "entryVersion": e1_ver}],
        "recent": [
            {"entryId": e1_id, "entryVersion": e1_ver},
            {"entryId": e2_id, "entryVersion": e2_ver},
        ],
        "preferences": {
            "mode": "pinned",
            "x": 0.25,
            "y": 0.5,
            "width": 420,
            "height": 680,
            "query": "分层抽样",
            "scrollEntryId": e1_id,
            "scrollTop": 120,
        },
    }
    r_put1 = owner.put(
        "/api/me/knowledge-state",
        json={"expectedRevision": 0, "idempotencyKey": idem_1, "state": state_v1},
    )
    _assert_security_headers_and_zero_leaks(r_put1, settings)
    assert r_put1.status_code == 200, r_put1.text
    assert r_put1.json()["revision"] == 1
    assert r_put1.json()["favorites"] == state_v1["favorites"]
    assert r_put1.json()["preferences"]["query"] == "分层抽样"

    # Idempotent replay returns exact revision=1 without conflict
    r_replay = owner.put(
        "/api/me/knowledge-state",
        json={"expectedRevision": 0, "idempotencyKey": idem_1, "state": state_v1},
    )
    assert r_replay.status_code == 200
    assert r_replay.json()["revision"] == 1

    # Stale expectedRevision=0 with new idempotencyKey -> 409 version_conflict pure Chinese
    _assert_clean_chinese_api_error(
        owner.put(
            "/api/me/knowledge-state",
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "state": state_v1},
        ),
        settings,
        expected_status=409,
        expected_code="version_conflict",
    )

    # Multi-user isolation: outsider's knowledge-state remains untouched at revision=0
    r_other = outsider.get("/api/me/knowledge-state")
    assert r_other.status_code == 200
    assert r_other.json() == {"revision": 0, "favorites": [], "recent": [], "preferences": {}}


def test_unauthenticated_knowledge_endpoints_reject_with_chinese_401(
    shared_know_env: dict[str, Any],
) -> None:
    anon: TestClient = shared_know_env["anon"]
    settings: Settings = shared_know_env["settings"]
    pid = shared_know_env["project_id"]
    for resp in (
        anon.get("/api/me/knowledge-state"),
        anon.get(f"/api/projects/{pid}/knowledge-references"),
        anon.get(f"/api/knowledge/lookups/{uuid4()}"),
    ):
        _assert_clean_chinese_api_error(resp, settings, expected_status=401, expected_code="session_required")


@pytest.mark.parametrize(
    ("endpoint_kind", "byte_cap"),
    [
        ("me_state", 100_000),
        ("project_refs", 2_000),
        ("term_requests", 4_000),
        ("lookups", 1_000),
    ],
)
def test_knowledge_endpoints_enforce_strict_payload_size_caps(
    shared_know_env: dict[str, Any],
    endpoint_kind: str,
    byte_cap: int,
) -> None:
    settings: Settings = shared_know_env["settings"]
    owner: TestClient = shared_know_env["owner"]
    pid = shared_know_env["project_id"]
    oversized_body = json.dumps({"pad": "x" * (byte_cap + 512)}).encode("utf-8")
    hdrs = {"content-type": "application/json"}

    if endpoint_kind == "me_state":
        resp = owner.put("/api/me/knowledge-state", content=oversized_body, headers=hdrs)
    elif endpoint_kind == "project_refs":
        resp = owner.post(f"/api/projects/{pid}/knowledge-references", content=oversized_body, headers=hdrs)
    elif endpoint_kind == "term_requests":
        resp = owner.post("/api/knowledge/term-requests", content=oversized_body, headers=hdrs)
    else:
        resp = owner.post("/api/knowledge/lookups", content=oversized_body, headers=hdrs)

    _assert_clean_chinese_api_error(resp, settings, expected_status=413, expected_code="payload_too_large")


# ---------------------------------------------------------------------------
# 3. Slug/Version Validation, Path-Traversal & Preference Bounds Matrix — 15 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("case_id", "expected_code"),
    [
        ("traversal_dotdot_slash", "knowledge_version_unavailable"),
        ("traversal_parent_catalog", "knowledge_version_unavailable"),
        ("traversal_windows_backslash", "knowledge_version_unavailable"),
        ("traversal_nested_slug", "knowledge_version_unavailable"),
        ("hidden_dot_slug", "knowledge_version_unavailable"),
        ("unknown_entry_slug", "knowledge_version_unavailable"),
        ("wrong_entry_version_999", "knowledge_version_unavailable"),
        ("zero_entry_version", "knowledge_version_unavailable"),
        ("string_entry_version", "knowledge_version_unavailable"),
        ("duplicate_favorites", "invalid_input"),
        ("recent_exceeds_50_cap", "invalid_input"),
        ("invalid_pref_mode", "invalid_input"),
        ("out_of_bounds_pref_x", "invalid_input"),
        ("traversal_scroll_entry_id", "invalid_input"),
        ("control_char_in_pref_query", "invalid_input"),
    ],
)
def test_knowledge_slug_version_path_traversal_and_preference_bounds_matrix(
    shared_know_env: dict[str, Any],
    case_id: str,
    expected_code: str,
) -> None:
    settings: Settings = shared_know_env["settings"]
    outsider: TestClient = shared_know_env["outsider"]
    entries: list[tuple[str, int]] = shared_know_env["catalog_entries"]
    valid_id, valid_ver = entries[0]

    favs: list[dict[str, Any]] = [{"entryId": valid_id, "entryVersion": valid_ver}]
    recent: list[dict[str, Any]] = []
    prefs: dict[str, Any] = {}

    if case_id == "traversal_dotdot_slash":
        favs = [{"entryId": "../../etc/passwd", "entryVersion": 1}]
    elif case_id == "traversal_parent_catalog":
        favs = [{"entryId": "../knowledge-catalog.json", "entryVersion": 1}]
    elif case_id == "traversal_windows_backslash":
        favs = [{"entryId": "..\\windows\\win.ini", "entryVersion": 1}]
    elif case_id == "traversal_nested_slug":
        favs = [{"entryId": f"{valid_id}/../../secret", "entryVersion": 1}]
    elif case_id == "hidden_dot_slug":
        favs = [{"entryId": ".env", "entryVersion": 1}]
    elif case_id == "unknown_entry_slug":
        favs = [{"entryId": "nonexistent-bogus-term-2099", "entryVersion": 1}]
    elif case_id == "wrong_entry_version_999":
        favs = [{"entryId": valid_id, "entryVersion": 999}]
    elif case_id == "zero_entry_version":
        favs = [{"entryId": valid_id, "entryVersion": 0}]
    elif case_id == "string_entry_version":
        favs = [{"entryId": valid_id, "entryVersion": "1"}]
    elif case_id == "duplicate_favorites":
        favs = [
            {"entryId": valid_id, "entryVersion": valid_ver},
            {"entryId": valid_id, "entryVersion": valid_ver},
        ]
    elif case_id == "recent_exceeds_50_cap":
        recent = [{"entryId": eid, "entryVersion": ver} for eid, ver in entries[:51]]
    elif case_id == "invalid_pref_mode":
        prefs = {"mode": "fullscreen_hack"}
    elif case_id == "out_of_bounds_pref_x":
        prefs = {"x": 1.5}
    elif case_id == "traversal_scroll_entry_id":
        prefs = {"scrollEntryId": "../../etc/passwd"}
    elif case_id == "control_char_in_pref_query":
        prefs = {"query": "抽样误差\x07"}

    resp = outsider.put(
        "/api/me/knowledge-state",
        json={
            "expectedRevision": 0,
            "idempotencyKey": str(uuid4()),
            "state": {"favorites": favs, "recent": recent, "preferences": prefs},
        },
    )
    _assert_clean_chinese_api_error(resp, settings, expected_status=422, expected_code=expected_code)


# ---------------------------------------------------------------------------
# 4. Project Knowledge References Lifecycle, 4-Role RBAC & Traversal — 8 tests
# ---------------------------------------------------------------------------


def test_project_knowledge_references_add_delete_restore_and_cas_lifecycle(
    shared_know_env: dict[str, Any],
) -> None:
    settings: Settings = shared_know_env["settings"]
    owner: TestClient = shared_know_env["owner"]
    editor: TestClient = shared_know_env["editor"]
    pid = shared_know_env["project_id"]
    (e1_id, e1_ver), (e2_id, e2_ver) = shared_know_env["catalog_entries"][:2]

    assert owner.get(f"/api/projects/{pid}/knowledge-references").json() == {"revision": 0, "references": []}

    # Owner adds e1 (revision -> 1)
    r_add1 = owner.post(
        f"/api/projects/{pid}/knowledge-references",
        json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "entryId": e1_id, "entryVersion": e1_ver},
    )
    assert r_add1.status_code == 200, r_add1.text
    assert r_add1.json()["revision"] == 1
    ref1_id = r_add1.json()["references"][0]["id"]

    # Editor adds e2 (revision -> 2)
    r_add2 = editor.post(
        f"/api/projects/{pid}/knowledge-references",
        json={"expectedRevision": 1, "idempotencyKey": str(uuid4()), "entryId": e2_id, "entryVersion": e2_ver},
    )
    assert r_add2.status_code == 200, r_add2.text
    assert r_add2.json()["revision"] == 2
    assert len(r_add2.json()["references"]) == 2

    # Stale expectedRevision -> 409 version_conflict
    _assert_clean_chinese_api_error(
        owner.post(
            f"/api/projects/{pid}/knowledge-references",
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "entryId": e1_id, "entryVersion": e1_ver},
        ),
        settings,
        expected_status=409,
        expected_code="version_conflict",
    )

    # Delete ref1 (revision -> 3)
    r_del1 = owner.request(
        "DELETE",
        f"/api/projects/{pid}/knowledge-references/{ref1_id}",
        json={"expectedRevision": 2, "idempotencyKey": str(uuid4())},
    )
    assert r_del1.status_code == 200, r_del1.text
    assert r_del1.json()["revision"] == 3
    assert [r["entryId"] for r in r_del1.json()["references"]] == [e2_id]

    # Deleting already-deleted ref1 -> 404 not_found
    _assert_clean_chinese_api_error(
        owner.request(
            "DELETE",
            f"/api/projects/{pid}/knowledge-references/{ref1_id}",
            json={"expectedRevision": 3, "idempotencyKey": str(uuid4())},
        ),
        settings,
        expected_status=404,
        expected_code="not_found",
    )

    # Re-adding e1 restores soft-deleted row cleanly (revision -> 4)
    r_restore = owner.post(
        f"/api/projects/{pid}/knowledge-references",
        json={"expectedRevision": 3, "idempotencyKey": str(uuid4()), "entryId": e1_id, "entryVersion": e1_ver},
    )
    assert r_restore.status_code == 200
    assert r_restore.json()["revision"] == 4
    assert len(r_restore.json()["references"]) == 2


@pytest.mark.parametrize(
    ("actor_role", "op_kind", "expected_status", "expected_code"),
    [
        ("viewer", "get", 200, None),
        ("viewer", "add", 403, "permission_denied"),
        ("viewer", "delete", 403, "permission_denied"),
        ("outsider", "get", 404, "not_found"),
        ("outsider", "add", 404, "not_found"),
        ("outsider", "delete", 404, "not_found"),
        ("owner", "add_traversal_slug", 422, "knowledge_version_unavailable"),
    ],
)
def test_project_knowledge_references_rbac_and_traversal_matrix(
    shared_know_env: dict[str, Any],
    actor_role: str,
    op_kind: str,
    expected_status: int,
    expected_code: str | None,
) -> None:
    settings: Settings = shared_know_env["settings"]
    pid = shared_know_env["project_id"]
    client: TestClient = shared_know_env[actor_role]
    e_id, e_ver = shared_know_env["catalog_entries"][5]
    curr_state = shared_know_env["owner"].get(f"/api/projects/{pid}/knowledge-references").json()
    curr_rev = curr_state["revision"]
    fake_ref_id = str(uuid4())

    if op_kind == "get":
        resp = client.get(f"/api/projects/{pid}/knowledge-references")
        if expected_status == 200:
            _assert_security_headers_and_zero_leaks(resp, settings)
            assert resp.status_code == 200
            return
    elif op_kind == "add":
        resp = client.post(
            f"/api/projects/{pid}/knowledge-references",
            json={"expectedRevision": curr_rev, "idempotencyKey": str(uuid4()), "entryId": e_id, "entryVersion": e_ver},
        )
    elif op_kind == "delete":
        resp = client.request(
            "DELETE",
            f"/api/projects/{pid}/knowledge-references/{fake_ref_id}",
            json={"expectedRevision": curr_rev, "idempotencyKey": str(uuid4())},
        )
    else:
        resp = client.post(
            f"/api/projects/{pid}/knowledge-references",
            json={
                "expectedRevision": curr_rev,
                "idempotencyKey": str(uuid4()),
                "entryId": "../../etc/shadow",
                "entryVersion": 1,
            },
        )

    _assert_clean_chinese_api_error(resp, settings, expected_status=expected_status, expected_code=expected_code)


# ---------------------------------------------------------------------------
# 5. Knowledge Term-Request Validation & 5/Day Per-User Quota — 6 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_fields",
    [
        {"term": "", "domain": "统计学", "note": "补充说明"},
        {"term": "  前后含空格词条  ", "domain": "统计学", "note": "补充说明"},
        {"term": "含控制符\x07词条", "domain": "统计学", "note": "补充说明"},
        {"term": "x" * 121, "domain": "统计学", "note": "补充说明"},
        {"term": "稳健标准误", "domain": "统计学", "note": "补充说明\n含换行符"},
    ],
    ids=[
        "empty_term",
        "padded_whitespace_term",
        "control_char_term",
        "overlong_121_term",
        "newline_in_note",
    ],
)
def test_knowledge_term_request_input_hygiene_matrix(
    shared_know_env: dict[str, Any],
    bad_fields: dict[str, str],
) -> None:
    settings: Settings = shared_know_env["settings"]
    owner: TestClient = shared_know_env["owner"]
    resp = owner.post(
        "/api/knowledge/term-requests",
        json={"idempotencyKey": str(uuid4()), **bad_fields},
    )
    _assert_clean_chinese_api_error(resp, settings, expected_status=422, expected_code="invalid_input")


def test_knowledge_term_request_daily_5_quota_and_cross_user_independence(
    shared_know_env: dict[str, Any],
) -> None:
    settings: Settings = shared_know_env["settings"]
    quota_a, _ = shared_know_env["get_logged_in"]("term_quota_a@example.test")
    quota_b, _ = shared_know_env["get_logged_in"]("term_quota_b@example.test")

    first_idem = str(uuid4())
    for idx in range(5):
        key = first_idem if idx == 0 else str(uuid4())
        r_ok = quota_a.post(
            "/api/knowledge/term-requests",
            json={
                "idempotencyKey": key,
                "term": f"异质性处理效应词条{idx + 1}",
                "domain": "因果推断",
                "note": "竞赛实证高频概念",
            },
        )
        assert r_ok.status_code == 201, r_ok.text
        assert r_ok.json()["status"] == "submitted"

    # Idempotent replay of #1 still succeeds without spending quota
    r_replay = quota_a.post(
        "/api/knowledge/term-requests",
        json={
            "idempotencyKey": first_idem,
            "term": "异质性处理效应词条1",
            "domain": "因果推断",
            "note": "竞赛实证高频概念",
        },
    )
    assert r_replay.status_code == 201

    # 6th distinct request today -> 429 knowledge_request_limit pure Chinese
    _assert_clean_chinese_api_error(
        quota_a.post(
            "/api/knowledge/term-requests",
            json={
                "idempotencyKey": str(uuid4()),
                "term": "第六条超限补词申请",
                "domain": "抽样调查",
                "note": "超限测试",
            },
        ),
        settings,
        expected_status=429,
        expected_code="knowledge_request_limit",
    )

    # Separate user quota_b is completely unaffected
    r_b = quota_b.post(
        "/api/knowledge/term-requests",
        json={
            "idempotencyKey": str(uuid4()),
            "term": "设计效应校准",
            "domain": "抽样调查",
            "note": "独立用户正常提交",
        },
    )
    assert r_b.status_code == 201, r_b.text


# ---------------------------------------------------------------------------
# 6. Knowledge Lookups, HTML/URL Sanitization, Budgets & Catalog Audit — 5 tests
# ---------------------------------------------------------------------------


def test_knowledge_lookup_offline_unconfigured_503_and_invalid_query_422(
    shared_know_env: dict[str, Any],
) -> None:
    settings: Settings = shared_know_env["settings"]
    owner: TestClient = shared_know_env["owner"]

    # Invalid queries rejected before provider check
    for bad_q in ("", "  前导空格查询", "x" * 121):
        _assert_clean_chinese_api_error(
            owner.post("/api/knowledge/lookups", json={"query": bad_q, "idempotencyKey": str(uuid4())}),
            settings,
            expected_status=422,
            expected_code="invalid_input",
        )

    # Valid query when offline provider is None -> 503 knowledge_lookup_unconfigured pure Chinese
    _assert_clean_chinese_api_error(
        owner.post("/api/knowledge/lookups", json={"query": "Cronbach 信度系数", "idempotencyKey": str(uuid4())}),
        settings,
        expected_status=503,
        expected_code="knowledge_lookup_unconfigured",
    )


def test_knowledge_lookup_html_sanitization_url_filtering_isolation_and_budget_caps(
    tmp_path: Path,
) -> None:
    settings = _make_settings(tmp_path)
    engine = _build_wal_sqlite_engine(tmp_path / "lookup_budget.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(cid: str, email: str, code: str) -> None:
        deliveries[cid] = (email, code)

    call_mode = {"credits": 1}

    async def _synthetic_provider(_query: str) -> knowledge_domain.LookupResult:
        parsed = knowledge_domain.parse_provider_result(
            {
                "request_id": "req_synth_001",
                "usage": {"credits": call_mode["credits"]},
                "results": [
                    {
                        "url": "https://itl.nist.gov/div898/handbook/eda.htm",
                        "title": "<b>NIST</b> <script>alert(1)</script>Exploratory\x07 Data",
                        "content": "<p>严谨统计检验手册 &amp; 方差齐性核验。</p>",
                    },
                    # Dangerous URLs must be silently stripped by safe_result_url
                    {"url": "javascript:alert(document.cookie)", "title": "XSS", "content": "bad"},
                    {"url": "file:///etc/passwd", "title": "LocalFile", "content": "bad"},
                    {"url": "https://user:pass@itl.nist.gov/secret", "title": "CredsInUrl", "content": "bad"},
                ],
            }
        )
        return parsed

    runtime = create_runtime(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    deps = create_dependencies(settings, runtime.engine)
    app = FastAPI(debug=False)
    install_handlers(app)
    auth_routes.register_routes(
        app,
        settings=settings,
        mailer=runtime.mailer,
        db=deps.db,
        auth=deps.auth,
        origin=deps.origin,
        session_user=deps.session_user,
    )
    knowledge_routes.register_knowledge(
        app,
        settings,
        deps.db,
        deps.session_user,
        deps.owned_project,
        deps.lock_user,
        deps.operation,
        provider=_synthetic_provider,
        config=knowledge_domain.KnowledgeConfig(timeout_seconds=5, daily_limit=2, monthly_limit=3),
    )
    install_security_middleware(app, settings)
    install_boundary_guard(app)

    c_a = TestClient(app)
    c_b = TestClient(app)
    try:
        for client, email in ((c_a, "know_a@example.test"), (c_b, "know_b@example.test")):
            cid = client.post("/api/auth/code", headers={"origin": ORIGIN}, json={"email": email}).json()["challengeId"]
            sess = client.post("/api/auth/verify", headers={"origin": ORIGIN}, json={"challengeId": cid, "code": deliveries[cid][1]}).json()
            client.headers.update({"origin": ORIGIN, "x-csrf-token": sess["csrfToken"]})

        # User A lookup #1 -> 202 ready, HTML tags & unsafe URLs stripped!
        r_l1 = c_a.post("/api/knowledge/lookups", json={"query": "方差分析置信区间", "idempotencyKey": str(uuid4())})
        _assert_security_headers_and_zero_leaks(r_l1, settings)
        assert r_l1.status_code == 202, r_l1.text
        l1 = r_l1.json()
        assert l1["status"] == "ready"
        assert len(l1["results"]) == 1
        assert l1["results"][0]["url"] == "https://itl.nist.gov/div898/handbook/eda.htm"
        assert "<script>" not in l1["results"][0]["title"] and "<b>" not in l1["results"][0]["title"]
        assert "&" in l1["results"][0]["snippet"] and "<p>" not in l1["results"][0]["snippet"]

        # Cross-user lookup isolation: User B cannot read User A's lookup receipt -> 404 not_found
        _assert_clean_chinese_api_error(
            c_b.get(f"/api/knowledge/lookups/{l1['id']}"),
            settings,
            expected_status=404,
            expected_code="not_found",
        )

        # User A lookup #2 hits daily_limit=2; User A lookup #3 -> 429 knowledge_daily_limit!
        assert c_a.post("/api/knowledge/lookups", json={"query": "卡方独立性检验", "idempotencyKey": str(uuid4())}).status_code == 202
        _assert_clean_chinese_api_error(
            c_a.post("/api/knowledge/lookups", json={"query": "第三次超日限查询", "idempotencyKey": str(uuid4())}),
            settings,
            expected_status=429,
            expected_code="knowledge_daily_limit",
        )

        # User B triggers credits > reserved_credits anomaly -> trips monthly.blocked circuit breaker!
        call_mode["credits"] = 5
        r_anomaly = c_b.post("/api/knowledge/lookups", json={"query": "触发计费异常熔断", "idempotencyKey": str(uuid4())})
        assert r_anomaly.status_code == 202
        assert r_anomaly.json()["status"] == "outcome_unknown"
        assert r_anomaly.json()["errorCode"] == "lookup_usage_anomaly"

        # Subsequent lookup by User B is blocked by monthly circuit-breaker -> 429 knowledge_monthly_limit!
        _assert_clean_chinese_api_error(
            c_b.post("/api/knowledge/lookups", json={"query": "熔断后再次查询", "idempotencyKey": str(uuid4())}),
            settings,
            expected_status=429,
            expected_code="knowledge_monthly_limit",
        )
    finally:
        c_a.close()
        c_b.close()
        engine.dispose()


def test_shipped_knowledge_catalog_360_entries_and_four_eyes_review_gate(tmp_path: Path) -> None:
    cat = knowledge_domain.catalog_from_file()
    assert len(cat) >= 360

    # Verify self-reviewed (`producer == reviewer`) and unreviewed entries are ignored, while traversal IDs fail closed
    filtered_file = tmp_path / "filtered_catalog.json"
    filtered_file.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "entries": [
                    {
                        "id": "valid-term",
                        "version": 1,
                        "review": {"status": "reviewed", "producer": "alice", "reviewer": "bob", "checkedAt": "2026-01-01"},
                    },
                    {
                        "id": "self-reviewed-skip",
                        "version": 1,
                        "review": {"status": "reviewed", "producer": "alice", "reviewer": "alice", "checkedAt": "2026-01-01"},
                    },
                    {
                        "id": "draft-skip",
                        "version": 1,
                        "review": {"status": "draft", "producer": "alice", "reviewer": "bob", "checkedAt": "2026-01-01"},
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    loaded = knowledge_domain.catalog_from_file(filtered_file)
    assert loaded == {"valid-term": {1}}

    bad_slug_file = tmp_path / "bad_slug_catalog.json"
    bad_slug_file.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "entries": [
                    {
                        "id": "../traversal-term",
                        "version": 1,
                        "review": {"status": "reviewed", "producer": "alice", "reviewer": "bob", "checkedAt": "2026-01-01"},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="Invalid knowledge catalog reference"):
        knowledge_domain.catalog_from_file(bad_slug_file)


def test_production_knowledge_rejects_injected_provider_and_bad_config(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Invalid knowledge lookup configuration"):
        knowledge_domain.KnowledgeConfig(timeout_seconds=0)
    with pytest.raises(ValueError, match="Invalid knowledge lookup configuration"):
        knowledge_domain.KnowledgeConfig(daily_limit=99)

    prod_settings = _make_settings(
        tmp_path,
        mode="production",
        allowed_origins=["https://evix.example.com"],
        cookie_name="__Host-evix_session",
        mail_mode="resend",
        mail_api_key="re_synthetic_placeholder_key_123456",
        mail_from="noreply@evix.example.com",
        provider_mode="live",
    )
    with pytest.raises(ValueError, match="Production knowledge rejects injected providers"):
        knowledge_routes.KnowledgeService(
            settings=prod_settings,
            owned_project=lambda *_a, **_k: None,
            lock_user=lambda *_a, **_k: None,
            operation=lambda *_a, **_k: None,
            provider=lambda _q: None,
        )


def test_authoritative_domains_and_safe_result_url_whitelist() -> None:
    assert "itl.nist.gov" in knowledge_domain.authoritative_domains("Cronbach 信度与方差分析")
    assert "aapor.org" in knowledge_domain.authoritative_domains("问卷预测试方法")
    assert knowledge_domain.authoritative_domains("完全无关的日常问候") == []

    assert knowledge_domain.safe_result_url("https://stats.oarc.ucla.edu/stata/dae/") == "https://stats.oarc.ucla.edu/stata/dae/"
    assert knowledge_domain.safe_result_url("javascript:alert(1)") is None
    assert knowledge_domain.safe_result_url("file:///etc/passwd") is None
    assert knowledge_domain.safe_result_url("https://admin:secret@stats.oarc.ucla.edu/") is None
    assert knowledge_domain.safe_result_url("https://stats.oarc.ucla.edu:99999/badport") is None
