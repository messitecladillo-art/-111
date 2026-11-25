"""Permanent CI guard for HTTP method matrices, Content-Type boundaries, and malformed JSON resilience (Wave 26).

Verifies:
1. Full-application HTTP verb matrix across all 90+ registered /api/* paths (340+ disallowed
   method-path pairs across GET, POST, PUT, PATCH, DELETE): read-only and write-only endpoints
   deterministically return 405 Method Not Allowed (never 500) with pure Chinese error envelopes
   and hardened security headers.
2. Authenticated write endpoints gracefully reject truncated/broken JSON payloads (e.g. '{"title":',
   trailing garbage, blank bodies) with 422 invalid_json in pure Chinese and 0 JSONDecodeError leaks.
3. Authenticated write endpoints gracefully reject invalid raw UTF-8 byte sequences, lone UTF-16
   surrogates (\\ud800), duplicate JSON object keys, and non-finite NaN/Infinity constants with 422
   pure Chinese errors and 0 UnicodeDecodeError/ValueError leaks.
4. Authenticated write endpoints gracefully reject non-object root JSON types ([], "text", 123,
   null, true, false) with 422 invalid_input and 0 AttributeError/TypeError 500 crashes.
5. Authenticated write endpoints deterministically block >16-level and 400-level nested JSON bombs
   (0 RecursionError) as well as unknown/prototype-pollution fields (__proto__, unexpectedField).
6. Exotic JSON-like or non-JSON Content-Type headers across POST/PUT/DELETE JSON routes return 415
   unsupported_media_type in pure Chinese while canonical application/json; charset=utf-8 succeeds.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
import json
from pathlib import Path
import re
import sys

import fastapi
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
import pytest
import sqlalchemy
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

_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_LEAK_TOKEN_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://"
    r"|\b(?:"
    r"JSONDecodeError|UnicodeDecodeError|UnicodeEncodeError|RecursionError"
    r"|Expecting\s+value|Unterminated\s+string|Extra\s+data"
    r"|AttributeError|TypeError|ValueError|KeyError|RuntimeError|SQLAlchemyError"
    r")\b",
    re.IGNORECASE,
)

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_ID = "11111111-1111-4111-8111-111111111111"
PROJECT_ID = "22222222-2222-4222-8222-222222222222"
USER_ID = "33333333-3333-4333-8333-333333333333"
SAMPLE_UUID = "44444444-4444-4444-8444-444444444444"


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
        "database_url": "postgresql+psycopg://evix_user:matrix_secret_pw_66@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": ["owner@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "sav_temp_dir": tmp_path / "sav-matrix-private",
        "preflight_temp_dir": tmp_path / "preflight-matrix-private",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_authenticated_owner(engine, settings: Settings, monkeypatch) -> tuple[str, str]:
    raw_cookie = "matrix-guard-session-cookie-0123456789"
    csrf_token = "matrix-guard-csrf-token"
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)

    with engine.begin() as conn:
        conn.execute(User.__table__.insert().values(id=USER_ID, email="owner@example.test", created_at=ts))
        conn.execute(
            DbSessionModel.__table__.insert().values(
                user_id=USER_ID,
                token_hash=keyed(settings, "session/v1", raw_cookie),
                csrf=csrf_token,
                expires_at=ts + timedelta(days=30),
                revoked_at=None,
            )
        )
        conn.execute(Team.__table__.insert().values(id=TEAM_ID, name="协议矩阵测试课题组"))
        conn.execute(Member.__table__.insert().values(team_id=TEAM_ID, user_id=USER_ID, role="owner"))
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_ID,
                team_id=TEAM_ID,
                title="协议边界核验项目",
                revision=1,
                questionnaire_revision=0,
                created_at=ts,
            )
        )
    return raw_cookie, csrf_token


def _materialize_route_path(path_template: str) -> str:
    return re.sub(
        r"\{([^}]+)\}",
        lambda m: "t" * 43 if m.group(1) == "token" else SAMPLE_UUID,
        path_template,
    )


def _path_regex_from_template(path_template: str) -> re.Pattern[str]:
    escaped = re.sub(r"\{[^}]+\}", r"[^/]+", path_template)
    return re.compile(f"^{escaped}$")


def _assert_clean_chinese_error(
    res,
    *,
    allowed_statuses: tuple[int, ...],
    expected_code: str | None,
    settings: Settings,
) -> None:
    assert res.status_code < 500, f"Server 5xx crash ({res.status_code}): {res.text!r}"
    assert res.status_code in allowed_statuses, (
        f"Expected status in {allowed_statuses}, got {res.status_code}: {res.text!r}"
    )
    assert res.headers.get("cache-control") == "no-store"
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("x-robots-tag") == "noindex, nofollow, noarchive"

    payload = res.json()
    assert set(payload.keys()) == {"error"}
    err = payload["error"]
    if expected_code is not None:
        assert err.get("code") == expected_code
    msg = err.get("message", "")
    assert isinstance(msg, str) and _CHINESE_CHAR_RE.search(msg), f"Non-Chinese error message: {msg!r}"
    assert not _FORBIDDEN_BRACKET_RE.search(msg), f"Forbidden bracket in message: {msg!r}"

    combined = res.text + "\n" + "\n".join(f"{k}: {v}" for k, v in res.headers.items())
    assert not _LEAK_TOKEN_RE.search(combined), f"Internal exception/decoder/path leaked: {combined!r}"
    py_ver = sys.version.split()[0]
    for secret in (
        py_ver,
        fastapi.__version__,
        sqlalchemy.__version__,
        "matrix_secret_pw_66",
        settings.auth_secret,
        next(iter(settings.keyring.values())),
    ):
        assert secret not in combined, f"Internal secret/version leaked: {secret!r}"


def _authed_write_targets() -> tuple[tuple[str, str], ...]:
    return (
        ("POST", "/api/projects"),
        ("POST", "/api/services"),
        ("POST", "/api/invites"),
        ("PUT", "/api/me/knowledge-state"),
        ("POST", f"/api/teams/{TEAM_ID}/presence"),
        ("POST", f"/api/projects/{PROJECT_ID}/questionnaire/versions"),
        ("POST", f"/api/projects/{PROJECT_ID}/report/versions"),
        ("POST", f"/api/projects/{PROJECT_ID}/autonomous-runs"),
        ("POST", f"/api/projects/{PROJECT_ID}/agent-tasks"),
        ("POST", "/api/agent/turns"),
    )


def test_all_90_api_paths_return_405_for_unsupported_http_verbs_and_never_500(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    cookie, csrf = _seed_authenticated_owner(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    methods_by_path: dict[str, set[str]] = defaultdict(set)
    compiled_templates: list[tuple[re.Pattern[str], set[str]]] = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            verbs = {m.upper() for m in (route.methods or set())}
            methods_by_path[route.path].update(verbs)
    for tmpl, verbs in methods_by_path.items():
        compiled_templates.append((_path_regex_from_template(tmpl), verbs))

    assert len(methods_by_path) >= 90

    checked_pairs = 0
    strict_405_count = 0
    headers = {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": csrf}

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)
        for path_tmpl, allowed_verbs in sorted(methods_by_path.items()):
            url = _materialize_route_path(path_tmpl)
            # Determine all verbs supported by ANY matching dynamic route template on this concrete URL
            matched_verbs_for_url: set[str] = set()
            for pat, t_verbs in compiled_templates:
                if pat.match(url):
                    matched_verbs_for_url.update(t_verbs)

            for candidate_verb in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                if candidate_verb in allowed_verbs:
                    continue
                checked_pairs += 1
                res = client.request(candidate_verb, url, headers=headers)
                assert res.status_code < 500, f"{candidate_verb} {url} crashed with {res.status_code}"
                if candidate_verb not in matched_verbs_for_url:
                    strict_405_count += 1
                    _assert_clean_chinese_error(
                        res,
                        allowed_statuses=(405,),
                        expected_code="http_error",
                        settings=settings,
                    )

    assert checked_pairs >= 340
    assert strict_405_count >= 338


def test_authenticated_write_endpoints_reject_truncated_and_corrupted_json_with_chinese_422(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    cookie, csrf = _seed_authenticated_owner(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    headers = {
        "Origin": TRUSTED_ORIGIN,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
    }

    corrupted_payloads = (
        b'{"title":',
        b'{"label": "test", ',
        b"{unquoted_key: 1}",
        b'{"items": [1, 2, ',
        b"",
        b"   \t\r\n  ",
        b'{"status":"online"} trailing_garbage',
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)
        for method, path in _authed_write_targets():
            for raw_bytes in corrupted_payloads:
                res = client.request(method, path, content=raw_bytes, headers=headers)
                _assert_clean_chinese_error(
                    res,
                    allowed_statuses=(400, 422),
                    expected_code="invalid_json",
                    settings=settings,
                )


def test_authenticated_write_endpoints_reject_invalid_utf8_bytes_surrogates_and_nonfinite_numbers(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    cookie, csrf = _seed_authenticated_owner(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    headers = {
        "Origin": TRUSTED_ORIGIN,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
    }

    binary_and_lexical_anomalies = (
        (b'{"title":"\xff\xfe\xfa"}', "invalid_input"),
        (b'{"title":"\xe4\xb8"}', "invalid_input"),
        (b'\xff\xfe{"title":"bom"}', "invalid_input"),
        (b'{"title":"bad\\ud800surrogate"}', "invalid_json"),
        (b'{"status":"online","status":"writing"}', "duplicate_members"),
        (b'{"status":"online","note":NaN}', "invalid_input"),
        (b'{"expectedRevision":Infinity}', "invalid_input"),
        (b'{"expectedRevision":-Infinity}', "invalid_input"),
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)
        for method, path in (
            ("POST", "/api/projects"),
            ("POST", "/api/services"),
            ("POST", f"/api/teams/{TEAM_ID}/presence"),
            ("POST", f"/api/projects/{PROJECT_ID}/report/versions"),
            ("POST", f"/api/projects/{PROJECT_ID}/autonomous-runs"),
        ):
            for payload, expected_code in binary_and_lexical_anomalies:
                res = client.request(method, path, content=payload, headers=headers)
                _assert_clean_chinese_error(
                    res,
                    allowed_statuses=(400, 422),
                    expected_code=expected_code,
                    settings=settings,
                )


def test_authenticated_write_endpoints_reject_wrong_root_json_types_with_chinese_422(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    cookie, csrf = _seed_authenticated_owner(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    headers = {
        "Origin": TRUSTED_ORIGIN,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
    }

    wrong_root_payloads = (
        b"[]",
        b'[{"title":"array-root"}]',
        b'"scalar-string-root"',
        b"123",
        b"-98.6",
        b"null",
        b"true",
        b"false",
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)
        for method, path in _authed_write_targets():
            for raw_bytes in wrong_root_payloads:
                res = client.request(method, path, content=raw_bytes, headers=headers)
                _assert_clean_chinese_error(
                    res,
                    allowed_statuses=(400, 422),
                    expected_code="invalid_input",
                    settings=settings,
                )


def test_authenticated_write_endpoints_reject_deeply_nested_json_bombs_and_unknown_fields(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    cookie, csrf = _seed_authenticated_owner(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    headers = {
        "Origin": TRUSTED_ORIGIN,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
    }

    # 1. Depth-22 object (> 16 depth cap) and 400-level deep nesting bomb
    nested_22: dict = {"leaf": 1}
    for _ in range(22):
        nested_22 = {"child": nested_22}
    depth_22_bytes = json.dumps({"content": nested_22, "expectedRevision": 0, "idempotencyKey": SAMPLE_UUID}).encode()
    depth_400_bytes = (b'{"a":' * 400) + b"1" + (b"}" * 400)

    # 2. Unknown & prototype-pollution fields alongside valid required fields
    unknown_field_cases = (
        (
            "POST",
            "/api/projects",
            {
                "title": "未知字段拦截测试",
                "teamId": TEAM_ID,
                "idempotencyKey": SAMPLE_UUID,
                "unexpectedField": "forbidden",
            },
        ),
        (
            "POST",
            "/api/projects",
            {
                "title": "原型污染键拦截测试",
                "teamId": TEAM_ID,
                "idempotencyKey": SAMPLE_UUID,
                "__proto__": {"isAdmin": True},
            },
        ),
        (
            "POST",
            "/api/invites",
            {"label": "测试邀请", "maxUses": 2, "days": 7, "roleOverride": "owner"},
        ),
        (
            "POST",
            f"/api/projects/{PROJECT_ID}/report/versions",
            {
                "content": {"title": "报告"},
                "expectedRevision": 0,
                "idempotencyKey": SAMPLE_UUID,
                "extraAdminFlag": True,
            },
        ),
        (
            "POST",
            f"/api/projects/{PROJECT_ID}/autonomous-runs",
            {
                "idempotencyKey": SAMPLE_UUID,
                "goal": "测试未知字段阻断",
                "datasetMode": "planted_trap_benchmark",
                "bypassBudget": True,
            },
        ),
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)

        for method, path in (
            ("POST", f"/api/projects/{PROJECT_ID}/report/versions"),
            ("POST", f"/api/projects/{PROJECT_ID}/questionnaire/versions"),
            ("PUT", "/api/me/knowledge-state"),
        ):
            res_22 = client.request(method, path, content=depth_22_bytes, headers=headers)
            _assert_clean_chinese_error(res_22, allowed_statuses=(400, 422), expected_code=None, settings=settings)

            res_400 = client.request(method, path, content=depth_400_bytes, headers=headers)
            _assert_clean_chinese_error(res_400, allowed_statuses=(400, 422), expected_code=None, settings=settings)

        for method, path, body_obj in unknown_field_cases:
            res_unk = client.request(
                method,
                path,
                content=json.dumps(body_obj, ensure_ascii=False).encode("utf-8"),
                headers=headers,
            )
            _assert_clean_chinese_error(
                res_unk,
                allowed_statuses=(400, 422),
                expected_code="invalid_input",
                settings=settings,
            )


def test_content_type_parameter_edge_cases_across_authenticated_mutation_matrix(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    cookie, csrf = _seed_authenticated_owner(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    rejected_media_types = (
        "application/problem+json",
        "application/ld+json",
        "application/vnd.api+json",
        "text/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=----Boundary",
        "application/octet-stream",
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, cookie)
        for media_type in rejected_media_types:
            hdrs = {
                "Origin": TRUSTED_ORIGIN,
                "X-CSRF-Token": csrf,
                "Content-Type": media_type,
            }
            for method, path in (
                ("POST", "/api/projects"),
                ("PUT", "/api/me/knowledge-state"),
                ("DELETE", f"/api/services/{SAMPLE_UUID}"),
                ("POST", f"/api/teams/{TEAM_ID}/presence"),
            ):
                res = client.request(method, path, content=b'{"status":"online"}', headers=hdrs)
                _assert_clean_chinese_error(
                    res,
                    allowed_statuses=(415,),
                    expected_code="unsupported_media_type",
                    settings=settings,
                )

        # Positive control: canonical application/json; charset=utf-8 succeeds cleanly
        ok_res = client.post(
            f"/api/teams/{TEAM_ID}/presence",
            content=json.dumps({"status": "writing", "note": "撰写方法章节"}).encode("utf-8"),
            headers={
                "Origin": TRUSTED_ORIGIN,
                "X-CSRF-Token": csrf,
                "Content-Type": "application/json; charset=utf-8",
            },
        )
        assert ok_res.status_code == 200
        assert ok_res.json()["status"] == "writing"
