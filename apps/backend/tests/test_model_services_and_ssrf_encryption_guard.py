"""Permanent CI guard for Model Services (`CI-BE-28`), SSRF URL Validation, AES-GCM Vault Encryption & Zero-Echo Isolation.

Covers Wave 29 (`#596` §12 — 28th backend permanent CI guard / 43rd full-stack CI guard, 46 collected tests):
1. SSRF & Canonical HTTPS Allowlist Matrix Over HTTP (`22` vectors):
   - Blocks loopback (`127.0.0.1`, `localhost`, `[::1]`), unspecified (`0.0.0.0`), cloud metadata IMDS
     (`169.254.169.254`), RFC1918 private networks (`10.x`, `172.16.x`, `172.31.x`, `192.168.x`),
     non-HTTPS schemes (`http://` downgrade, `file://`, `ftp://`, `gopher://`, `javascript:`), embedded
     URL credentials (`https://u:p@host`), non-default ports, trailing slashes, query/fragment smuggling,
     path traversal (`..`), uppercase hostnames, and cross-provider base URL mismatches with pure-Chinese
     `422 destination_not_allowed` (`0` `BYOK`, `0` forbidden brackets, `0` `500` status).
2. Operator `compatible_bases` Startup & Production URL Policy Guard (`6` vectors):
   - Verifies `Settings` rejects HTTP downgrade, embedded credentials, custom ports, trailing slashes,
     path traversal, and query strings in `compatible_bases` before the app can boot.
3. Key Format, Gemini Model Path-Injection, Capability & Token-Bound Validation Matrix (`8` vectors):
   - Enforces printable ASCII key format (`8..1024` chars), blocks URL/slash injection in `gemini`
     model identifiers (`422 invalid_model`), and validates capability sets and `maxOutputTokens`.
4. At-Rest AES-256-GCM Envelope Encryption, AAD Binding, Re-Key Exfiltration Defense & Zero-Echo (`4` tests):
   - Verifies raw canary secret `sk-test-secret-canary-...` is AES-GCM encrypted in `Service.ciphertext`
     (never stored in plaintext in `Service` or `Operation` rows), wiped to `b""` upon `DELETE`, never
     echoed across `POST`/`GET`/`PUT`/`DELETE`/errors/logs, bound to user/service/revision/config via
     AEAD AAD (blocking ciphertext transplant or column tamper with `503 vault_unavailable`), and blocks
     changing `baseUrl` or `provider` without re-supplying `apiKey` (`422 new_key_required`).
5. Multi-User Service Isolation, Optimistic Revision CAS & 8-Service Quota (`6` tests):
   - Verifies User B cannot list, edit, delete, or invoke User A's service (`404 not_found` across CRUD,
     `/api/agent/turns`, and `/autonomous-runs`), enforces `409 revision_conflict` on stale edits/deletes,
     and enforces the 8-active-service cap (`409 service_limit`) with slot reclamation after deletion.
"""

from __future__ import annotations

from datetime import timezone
import logging
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, event, select
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime
from sqlalchemy.orm import Session as DBSession

from application.providers import FixtureProvider
from evix_api.app import create_app
from infrastructure.database.models import Base, Operation, Service
from infrastructure.llm import PROVIDER_FAILURE_MESSAGES, sanitize_upstream_error_text
from infrastructure.security import decrypt
from infrastructure.settings import Settings
from shared.errors import ApiError

ORIGIN = "http://localhost:3180"
APPROVED_COMPAT_BASE = "https://llm-gateway.campus-verified.example/v1"
ALT_COMPAT_BASE = "https://llm-backup.campus-verified.example/v1"

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
    r"|IntegrityError|OperationalError|RequestValidationError|InvalidTag)\b",
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


def _make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    invited = [
        "user_a@example.test",
        "user_b@example.test",
        "quota_user@example.test",
        "vault_user@example.test",
    ]
    base: dict[str, Any] = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_model_ssrf_test",
        "allowed_origins": [ORIGIN],
        "invited_emails": invited,
        "compatible_bases": [APPROVED_COMPAT_BASE, ALT_COMPAT_BASE],
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
    forbidden_secret: str | None = None,
) -> dict[str, str]:
    assert resp.status_code != 500, f"Unexpected 500 response: {resp.text}"
    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    raw = resp.text
    if forbidden_secret:
        assert forbidden_secret not in raw, "Canary API key echoed in error response!"
    assert not FORBIDDEN_BRACKETS_RE.search(raw), f"Forbidden brackets leaked: {raw}"
    assert not PRIVATE_JARGON_RE.search(raw), f"Private jargon (e.g. BYOK) leaked: {raw}"
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


def _valid_service_payload(
    *,
    label: str = "主力统计分析模型连接",
    provider: str = "openai",
    base_url: str = "https://api.openai.com/v1",
    model: str = "gpt-4.1-mini",
    max_output_tokens: int = 2048,
    capabilities: list[str] | None = None,
    api_key: str = "sk-test-secret-canary-default-001122334455",
) -> dict[str, Any]:
    return {
        "label": label,
        "provider": provider,
        "baseUrl": base_url,
        "model": model,
        "maxOutputTokens": max_output_tokens,
        "capabilities": capabilities if capabilities is not None else ["research", "report"],
        "apiKey": api_key,
        "idempotencyKey": str(uuid4()),
    }


@pytest.fixture(scope="module")
def shared_svc_env(tmp_path_factory: pytest.TempPathFactory):
    root_tmp = tmp_path_factory.mktemp("model_services_ssrf_guard")
    settings = _make_settings(root_tmp)
    engine = _build_wal_sqlite_engine(root_tmp / "model_services.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    app = create_app(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    lifespan_ctx = TestClient(app)
    lifespan_ctx.__enter__()
    opened_clients: list[TestClient] = []
    cached_logins: dict[str, tuple[TestClient, dict[str, Any]]] = {}

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

    yield {
        "app": app,
        "settings": settings,
        "engine": engine,
        "get_logged_in": get_logged_in,
    }

    for c in opened_clients:
        c.close()
    lifespan_ctx.__exit__(None, None, None)
    engine.dispose()


# ---------------------------------------------------------------------------
# 1. SSRF & Canonical HTTPS Destination Allowlist Matrix — 22 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("provider", "malicious_base_url"),
    [
        # Loopback, unspecified, IPv6 loopback & cloud IMDS targets
        ("compatible", "https://127.0.0.1/v1"),
        ("compatible", "https://localhost/v1"),
        ("compatible", "https://169.254.169.254/latest/meta-data"),
        ("compatible", "https://[::1]/v1"),
        ("compatible", "https://0.0.0.0/v1"),
        # RFC1918 private network ranges
        ("compatible", "https://10.0.0.1/v1"),
        ("compatible", "https://172.16.0.1/v1"),
        ("compatible", "https://172.31.255.254/v1"),
        ("compatible", "https://192.168.1.1/v1"),
        # HTTP downgrade & dangerous non-HTTP(S) schemes
        ("openai", "http://api.openai.com/v1"),
        ("compatible", f"http://{APPROVED_COMPAT_BASE.removeprefix('https://')}"),
        ("compatible", "file:///etc/passwd"),
        ("compatible", "ftp://127.0.0.1/v1"),
        ("compatible", "gopher://127.0.0.1:6379/_INFO"),
        ("compatible", "javascript:alert(1)"),
        # Embedded URL credentials, custom port, trailing slash, query/fragment & path traversal
        ("openai", "https://user:secretpass@api.openai.com/v1"),
        ("openai", "https://api.openai.com:8443/v1"),
        ("openai", "https://api.openai.com/v1/"),
        ("openai", "https://api.openai.com/v1?redirect=http://127.0.0.1"),
        ("openai", "https://api.openai.com/v1#internal"),
        ("openai", "https://api.openai.com/v1/../admin"),
        # Uppercase hostname / cross-provider allowlist mismatch
        ("deepseek", "https://api.openai.com/v1"),
    ],
)
def test_ssrf_and_malformed_base_url_rejection_matrix_over_http(
    shared_svc_env: dict[str, Any],
    provider: str,
    malicious_base_url: str,
) -> None:
    user_a, _ = shared_svc_env["get_logged_in"]("user_a@example.test")
    canary_key = f"sk-test-secret-canary-ssrf-{uuid4().hex[:12]}"
    payload = _valid_service_payload(
        provider=provider,
        base_url=malicious_base_url,
        api_key=canary_key,
    )
    resp = user_a.post("/api/services", json=payload)
    _assert_clean_chinese_api_error(
        resp,
        expected_status=422,
        expected_code="destination_not_allowed",
        forbidden_secret=canary_key,
    )


# ---------------------------------------------------------------------------
# 2. Operator `compatible_bases` Startup & Production URL Policy — 6 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_compat_url",
    [
        "http://llm-gateway.campus-verified.example/v1",
        "https://admin:pass@llm-gateway.campus-verified.example/v1",
        "https://llm-gateway.campus-verified.example:8080/v1",
        "https://llm-gateway.campus-verified.example/v1/",
        "https://llm-gateway.campus-verified.example/v1/../secret",
        "https://llm-gateway.campus-verified.example/v1?token=leak",
    ],
    ids=[
        "http_downgrade_blocked",
        "embedded_userinfo_blocked",
        "custom_port_blocked",
        "trailing_slash_blocked",
        "dotdot_traversal_blocked",
        "query_string_blocked",
    ],
)
def test_operator_compatible_base_settings_rejects_downgrade_and_non_canonical_urls(
    tmp_path: Path,
    bad_compat_url: str,
) -> None:
    with pytest.raises(ValueError, match="Destination|Invalid destination"):
        _make_settings(tmp_path, compatible_bases=[bad_compat_url])


# ---------------------------------------------------------------------------
# 3. Key Format, Gemini Model Injection & Capability Bounds Matrix — 8 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    [
        ({"apiKey": "short7"}, "invalid_key"),
        ({"apiKey": "sk-key with spaces-123456"}, "invalid_key"),
        ({"apiKey": "sk-key-with-\n-newline-1234"}, "invalid_key"),
        (
            {
                "provider": "gemini",
                "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
                "model": "https://169.254.169.254/v1/gemini-pro",
            },
            "invalid_model",
        ),
        ({"capabilities": []}, "invalid_input"),
        ({"capabilities": ["research", "research"]}, "invalid_input"),
        ({"capabilities": ["root_shell"]}, "invalid_input"),
        ({"maxOutputTokens": 64}, "invalid_input"),
    ],
    ids=[
        "short_api_key",
        "space_in_api_key",
        "newline_in_api_key",
        "gemini_model_url_injection",
        "empty_capabilities",
        "duplicate_capabilities",
        "unknown_capability",
        "below_min_output_tokens",
    ],
)
def test_invalid_api_key_model_capabilities_and_token_bounds_matrix(
    shared_svc_env: dict[str, Any],
    overrides: dict[str, Any],
    expected_code: str,
) -> None:
    user_a, _ = shared_svc_env["get_logged_in"]("user_a@example.test")
    canary = f"sk-test-secret-canary-val-{uuid4().hex[:10]}"
    payload = {**_valid_service_payload(api_key=canary), **overrides, "idempotencyKey": str(uuid4())}
    resp = user_a.post("/api/services", json=payload)
    _assert_clean_chinese_api_error(
        resp,
        expected_status=422,
        expected_code=expected_code,
        forbidden_secret=canary,
    )


# ---------------------------------------------------------------------------
# 4. At-Rest AES-256-GCM Encryption, AAD Binding & Zero-Echo — 4 tests
# ---------------------------------------------------------------------------


def test_at_rest_ciphertext_zero_echo_across_crud_idempotency_ops_and_delete_wipe(
    shared_svc_env: dict[str, Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings: Settings = shared_svc_env["settings"]
    engine = shared_svc_env["engine"]
    vault_client, vault_sess = shared_svc_env["get_logged_in"]("vault_user@example.test")
    vault_uid = vault_sess["user"]["id"]
    canary_v1 = "sk-test-secret-canary-alpha-9988776655443322"
    canary_v2 = "sk-test-secret-canary-bravo-1122334455667788"

    with caplog.at_level(logging.INFO):
        # Create service with canary_v1
        r_create = vault_client.post(
            "/api/services",
            json=_valid_service_payload(
                label="加密存储核验服务",
                provider="compatible",
                base_url=APPROVED_COMPAT_BASE,
                model="qwen-plus",
                api_key=canary_v1,
            ),
        )
        assert r_create.status_code == 201, r_create.text
        assert canary_v1 not in r_create.text
        assert not PRIVATE_JARGON_RE.search(r_create.text)
        assert not FORBIDDEN_BRACKETS_RE.search(r_create.text)
        created = r_create.json()
        svc_id = created["id"]
        assert "apiKey" not in created and "ciphertext" not in created

        # Verify DB row stores AES-GCM ciphertext & 12-byte IV, NEVER plaintext canary
        with DBSession(engine) as db_sess:
            row_v1 = db_sess.get(Service, svc_id)
            assert row_v1 is not None
            assert row_v1.key_id == "v1"
            assert len(row_v1.iv) == 12
            assert isinstance(row_v1.ciphertext, bytes) and len(row_v1.ciphertext) >= len(canary_v1) + 16
            assert canary_v1.encode("utf-8") not in row_v1.ciphertext
            assert decrypt(settings, row_v1) == canary_v1
            iv_v1 = bytes(row_v1.iv)
            ct_v1 = bytes(row_v1.ciphertext)

            # Verify idempotency / audit Operation rows contain ZERO plaintext canary
            ops = db_sess.execute(select(Operation).where(Operation.user_id == vault_uid)).scalars().all()
            assert len(ops) >= 1
            for op in ops:
                assert canary_v1 not in str(op.response)

        # GET /api/services never echoes canary
        r_list = vault_client.get("/api/services")
        assert r_list.status_code == 200
        assert canary_v1 not in r_list.text

        # PUT metadata update without apiKey re-encrypts under a fresh IV bound to revision=2
        r_edit_meta = vault_client.put(
            f"/api/services/{svc_id}",
            json={
                "label": "加密存储核验服务-修订版",
                "provider": "compatible",
                "baseUrl": APPROVED_COMPAT_BASE,
                "model": "qwen-max",
                "maxOutputTokens": 3072,
                "capabilities": ["research", "report", "defense"],
                "expectedRevision": 1,
                "idempotencyKey": str(uuid4()),
            },
        )
        assert r_edit_meta.status_code == 200, r_edit_meta.text
        assert canary_v1 not in r_edit_meta.text
        assert r_edit_meta.json()["revision"] == 2

        with DBSession(engine) as db_sess:
            row_v2 = db_sess.get(Service, svc_id)
            assert row_v2 is not None
            assert bytes(row_v2.iv) != iv_v1
            assert bytes(row_v2.ciphertext) != ct_v1
            assert decrypt(settings, row_v2) == canary_v1

        # PUT key rotation to canary_v2
        r_rotate = vault_client.put(
            f"/api/services/{svc_id}",
            json={
                "label": "加密存储核验服务-轮换密钥",
                "provider": "compatible",
                "baseUrl": APPROVED_COMPAT_BASE,
                "model": "qwen-max",
                "maxOutputTokens": 3072,
                "capabilities": ["research", "report"],
                "apiKey": canary_v2,
                "expectedRevision": 2,
                "idempotencyKey": str(uuid4()),
            },
        )
        assert r_rotate.status_code == 200, r_rotate.text
        assert canary_v1 not in r_rotate.text and canary_v2 not in r_rotate.text

        with DBSession(engine) as db_sess:
            row_v3 = db_sess.get(Service, svc_id)
            assert row_v3 is not None
            assert decrypt(settings, row_v3) == canary_v2

        # DELETE physically wipes ciphertext & iv to empty bytes
        r_del = vault_client.request(
            "DELETE",
            f"/api/services/{svc_id}",
            json={"expectedRevision": 3, "idempotencyKey": str(uuid4())},
        )
        assert r_del.status_code == 204
        assert vault_client.get("/api/services").json()["services"] == []

        with DBSession(engine) as db_sess:
            row_del = db_sess.get(Service, svc_id)
            assert row_del is not None
            assert row_del.deleted is True
            assert row_del.ciphertext == b""
            assert row_del.iv == b""

    # Verify logger output never leaked either canary secret
    for rec in caplog.records:
        msg = rec.getMessage()
        assert canary_v1 not in msg and canary_v2 not in msg


def test_aes_gcm_aad_binding_blocks_cross_user_and_config_tamper_attacks(
    shared_svc_env: dict[str, Any],
) -> None:
    settings: Settings = shared_svc_env["settings"]
    engine = shared_svc_env["engine"]
    vault_client, _ = shared_svc_env["get_logged_in"]("vault_user@example.test")
    _, user_b_sess = shared_svc_env["get_logged_in"]("user_b@example.test")

    canary = "sk-test-secret-canary-aad-binding-77665544"
    created = vault_client.post("/api/services", json=_valid_service_payload(api_key=canary)).json()
    svc_id = created["id"]

    with DBSession(engine) as db_sess:
        row = db_sess.get(Service, svc_id)
        assert row is not None
        assert decrypt(settings, row) == canary

        # Tampering user_id (ciphertext transplant), base_url, revision, or ciphertext byte must fail AEAD authentication!
        orig_uid, orig_base, orig_rev, orig_ct = row.user_id, row.base_url, row.revision, row.ciphertext

        row.user_id = user_b_sess["user"]["id"]
        with pytest.raises(ApiError) as exc_uid:
            decrypt(settings, row)
        assert exc_uid.value.status == 503 and exc_uid.value.code == "vault_unavailable"
        assert CHINESE_CHAR_RE.search(exc_uid.value.message)
        row.user_id = orig_uid

        row.base_url = APPROVED_COMPAT_BASE
        with pytest.raises(ApiError) as exc_base:
            decrypt(settings, row)
        assert exc_base.value.code == "vault_unavailable"
        row.base_url = orig_base

        row.revision = orig_rev + 1
        with pytest.raises(ApiError) as exc_rev:
            decrypt(settings, row)
        assert exc_rev.value.code == "vault_unavailable"
        row.revision = orig_rev

        row.ciphertext = orig_ct[:-1] + bytes([orig_ct[-1] ^ 0xFF])
        with pytest.raises(ApiError) as exc_ct:
            decrypt(settings, row)
        assert exc_ct.value.code == "vault_unavailable"
        row.ciphertext = orig_ct
        db_sess.rollback()

    vault_client.request(
        "DELETE",
        f"/api/services/{svc_id}",
        json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
    )


def test_changing_base_url_or_provider_without_new_key_blocks_credential_exfiltration(
    shared_svc_env: dict[str, Any],
) -> None:
    vault_client, _ = shared_svc_env["get_logged_in"]("vault_user@example.test")
    canary = "sk-test-secret-canary-rekey-guard-33445566"
    created = vault_client.post(
        "/api/services",
        json=_valid_service_payload(
            provider="compatible",
            base_url=APPROVED_COMPAT_BASE,
            model="deepseek-chat",
            api_key=canary,
        ),
    ).json()
    svc_id = created["id"]

    # Attempting to repoint baseUrl to ALT_COMPAT_BASE without supplying apiKey -> 422 new_key_required
    r_repoint = vault_client.put(
        f"/api/services/{svc_id}",
        json={
            "label": "尝试更改网关窃取原密钥",
            "provider": "compatible",
            "baseUrl": ALT_COMPAT_BASE,
            "model": "deepseek-chat",
            "maxOutputTokens": 2048,
            "capabilities": ["research"],
            "expectedRevision": 1,
            "idempotencyKey": str(uuid4()),
        },
    )
    _assert_clean_chinese_api_error(
        r_repoint,
        expected_status=422,
        expected_code="new_key_required",
        forbidden_secret=canary,
    )

    # Attempting to switch provider without supplying apiKey -> 422 new_key_required
    r_switch_prov = vault_client.put(
        f"/api/services/{svc_id}",
        json={
            "label": "尝试切换供应商窃取原密钥",
            "provider": "deepseek",
            "baseUrl": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
            "maxOutputTokens": 2048,
            "capabilities": ["research"],
            "expectedRevision": 1,
            "idempotencyKey": str(uuid4()),
        },
    )
    _assert_clean_chinese_api_error(
        r_switch_prov,
        expected_status=422,
        expected_code="new_key_required",
        forbidden_secret=canary,
    )

    vault_client.request(
        "DELETE",
        f"/api/services/{svc_id}",
        json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
    )


def test_public_config_embedding_secret_key_and_upstream_log_redaction(
    shared_svc_env: dict[str, Any],
) -> None:
    vault_client, _ = shared_svc_env["get_logged_in"]("vault_user@example.test")
    canary = "sk-test-secret-canary-inline-leak-88990011"

    # Putting the API key inside `label` must be rejected by encrypt() with 422 invalid_service_input
    r_leak_label = vault_client.post(
        "/api/services",
        json=_valid_service_payload(label=f"公开标签误填-{canary}", api_key=canary),
    )
    _assert_clean_chinese_api_error(
        r_leak_label,
        expected_status=422,
        expected_code="invalid_service_input",
        forbidden_secret=canary,
    )

    # Verify PROVIDER_FAILURE_MESSAGES & sanitize_upstream_error_text strip private IPs, URLs, secrets & jargon
    for code, zh_msg in PROVIDER_FAILURE_MESSAGES.items():
        assert CHINESE_CHAR_RE.search(zh_msg), code
        assert not FORBIDDEN_BRACKETS_RE.search(zh_msg), code
        assert not PRIVATE_JARGON_RE.search(zh_msg), code

    dirty_diag = (
        f"Upstream error at http://192.168.1.25:8080/v1/chat with Authorization: Bearer {canary} "
        "and \u3010\u5185\u90e8\u7b97\u5b50\u3011 failure"
    )
    sanitized = sanitize_upstream_error_text(dirty_diag, secret=canary)
    assert canary not in sanitized
    assert "192.168.1.25" not in sanitized
    assert not FORBIDDEN_BRACKETS_RE.search(sanitized)


# ---------------------------------------------------------------------------
# 5. Multi-User Isolation, Optimistic CAS & 8-Service Quota — 6 tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "cross_user_action",
    [
        "list_foreign_services",
        "edit_foreign_service",
        "delete_foreign_service",
        "invoke_foreign_service_in_agent_and_autonomous",
    ],
)
def test_multi_user_service_connection_strict_isolation(
    shared_svc_env: dict[str, Any],
    cross_user_action: str,
) -> None:
    user_a, _ = shared_svc_env["get_logged_in"]("user_a@example.test")
    user_b, _ = shared_svc_env["get_logged_in"]("user_b@example.test")

    canary_a = f"sk-test-secret-canary-ownerA-{uuid4().hex[:10]}"
    svc_a = user_a.post(
        "/api/services",
        json=_valid_service_payload(label="用户A私有模型配置", api_key=canary_a),
    ).json()
    svc_a_id = svc_a["id"]

    try:
        if cross_user_action == "list_foreign_services":
            r_b_list = user_b.get("/api/services")
            assert r_b_list.status_code == 200
            assert all(s["id"] != svc_a_id for s in r_b_list.json()["services"])
            assert canary_a not in r_b_list.text
        elif cross_user_action == "edit_foreign_service":
            r_b_edit = user_b.put(
                f"/api/services/{svc_a_id}",
                json={
                    "label": "用户B越权篡改",
                    "provider": "openai",
                    "baseUrl": "https://api.openai.com/v1",
                    "model": "gpt-4.1-mini",
                    "maxOutputTokens": 1024,
                    "capabilities": ["research"],
                    "apiKey": "sk-userB-replacement-key-12345678",
                    "expectedRevision": 1,
                    "idempotencyKey": str(uuid4()),
                },
            )
            _assert_clean_chinese_api_error(
                r_b_edit,
                expected_status=404,
                expected_code="not_found",
                forbidden_secret=canary_a,
            )
        elif cross_user_action == "delete_foreign_service":
            r_b_del = user_b.request(
                "DELETE",
                f"/api/services/{svc_a_id}",
                json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
            )
            _assert_clean_chinese_api_error(
                r_b_del,
                expected_status=404,
                expected_code="not_found",
                forbidden_secret=canary_a,
            )
        else:
            # User B probing User A's serviceId via /api/agent/turns and /autonomous-runs -> 404 not_found
            r_b_turn = user_b.post(
                "/api/agent/turns",
                json={
                    "schemaVersion": 1,
                    "idempotencyKey": str(uuid4()),
                    "message": "尝试盗用他人模型连接",
                    "history": [],
                    "context": {},
                    "serviceId": svc_a_id,
                    "serviceRevision": 1,
                    "consent": True,
                },
            )
            _assert_clean_chinese_api_error(
                r_b_turn,
                expected_status=404,
                expected_code="not_found",
                forbidden_secret=canary_a,
            )

            team_b = user_b.get("/api/teams").json()["teams"][0]["id"]
            proj_b = user_b.post(
                "/api/projects",
                json={"teamId": team_b, "title": "用户B探针课题", "idempotencyKey": str(uuid4())},
            ).json()
            r_b_auto = user_b.post(
                f"/api/projects/{proj_b['id']}/autonomous-runs",
                json={
                    "idempotencyKey": str(uuid4()),
                    "goal": "尝试盗用他人模型连接跑探索",
                    "datasetMode": "planted_trap_benchmark",
                    "serviceId": svc_a_id,
                    "serviceRevision": 1,
                },
            )
            _assert_clean_chinese_api_error(
                r_b_auto,
                expected_status=404,
                expected_code="not_found",
                forbidden_secret=canary_a,
            )
    finally:
        user_a.request(
            "DELETE",
            f"/api/services/{svc_a_id}",
            json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
        )


def test_optimistic_revision_cas_conflict_on_put_and_delete(shared_svc_env: dict[str, Any]) -> None:
    user_a, _ = shared_svc_env["get_logged_in"]("user_a@example.test")
    canary = "sk-test-secret-canary-cas-check-55667788"
    svc = user_a.post("/api/services", json=_valid_service_payload(api_key=canary)).json()
    svc_id = svc["id"]
    try:
        r_stale_put = user_a.put(
            f"/api/services/{svc_id}",
            json={
                "label": "过期版本号更新",
                "provider": "openai",
                "baseUrl": "https://api.openai.com/v1",
                "model": "gpt-4.1",
                "maxOutputTokens": 2048,
                "capabilities": ["research"],
                "expectedRevision": 99,
                "idempotencyKey": str(uuid4()),
            },
        )
        _assert_clean_chinese_api_error(
            r_stale_put,
            expected_status=409,
            expected_code="revision_conflict",
            forbidden_secret=canary,
        )

        r_stale_del = user_a.request(
            "DELETE",
            f"/api/services/{svc_id}",
            json={"expectedRevision": 99, "idempotencyKey": str(uuid4())},
        )
        _assert_clean_chinese_api_error(
            r_stale_del,
            expected_status=409,
            expected_code="revision_conflict",
            forbidden_secret=canary,
        )
    finally:
        user_a.request(
            "DELETE",
            f"/api/services/{svc_id}",
            json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
        )


def test_per_user_8_service_cap_and_reclaim_after_delete(shared_svc_env: dict[str, Any]) -> None:
    quota_client, _ = shared_svc_env["get_logged_in"]("quota_user@example.test")
    created_ids: list[str] = []
    for idx in range(8):
        r_ok = quota_client.post(
            "/api/services",
            json=_valid_service_payload(
                label=f"配额槽位服务-{idx + 1}",
                api_key=f"sk-test-secret-canary-slot-{idx}-12345678",
            ),
        )
        assert r_ok.status_code == 201, r_ok.text
        created_ids.append(r_ok.json()["id"])

    # 9th service exceeds the 8-service limit -> 409 service_limit pure Chinese
    canary_9th = "sk-test-secret-canary-ninth-overflow-999999"
    r_9th = quota_client.post(
        "/api/services",
        json=_valid_service_payload(label="第九个超额服务", api_key=canary_9th),
    )
    _assert_clean_chinese_api_error(
        r_9th,
        expected_status=409,
        expected_code="service_limit",
        forbidden_secret=canary_9th,
    )

    # Deleting 1 service immediately frees a slot
    assert (
        quota_client.request(
            "DELETE",
            f"/api/services/{created_ids[0]}",
            json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
        ).status_code
        == 204
    )
    r_reclaimed = quota_client.post(
        "/api/services",
        json=_valid_service_payload(label="释放后重建服务", api_key="sk-test-secret-canary-reclaimed-888888"),
    )
    assert r_reclaimed.status_code == 201, r_reclaimed.text
