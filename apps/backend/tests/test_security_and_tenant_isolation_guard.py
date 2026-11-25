"""Permanent CI security & tenant-isolation guard codifying the Wave 16 security audit."""

from __future__ import annotations

import ast
import inspect
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlalchemy import create_engine

from application.access import AccessControl
from evix_api import dependencies as dep_module
from evix_api.app import create_app
from infrastructure import llm
from infrastructure.llm import ChatCompletionClient
from infrastructure.settings import BASES, Settings, validate_base
from shared.errors import ApiError, ProviderFailure

# Explicit allowlist of controlled non-session endpoints audited in Wave 16 (#338).
# Every single other business route on create_app() MUST enforce session authentication
# via Depends(auth) or transitive closure binding of session_user.
CONTROLLED_NON_SESSION_ENDPOINTS: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/api/health"),
        ("GET", "/api/agent/tools"),
        ("POST", "/api/auth/code"),
        ("POST", "/api/auth/verify"),
        ("GET", "/api/surveys/{token}"),
        ("POST", "/api/surveys/{token}/responses"),
        ("POST", "/api/reports/wordcloud"),
        ("POST", "/api/reports/cover-assemble"),
        ("POST", "/api/reports/preflight-audit"),
    }
)
# /api/session binds session_user(required=False) to inspect current login state safely.
SESSION_PROBE_ENDPOINT: tuple[str, str] = ("GET", "/api/session")


def _build_local_settings(**overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix:evix@127.0.0.1:55432/evix",
        "allowed_origins": ["http://127.0.0.1:3180"],
        "invited_emails": ["researcher@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
    }
    payload.update(overrides)
    return Settings(**payload)


def _closure_transitively_captures_name(fn: object, target_var: str, _seen: set[int] | None = None) -> bool:
    """Walk Python closure cells recursively to verify helper wrappers (e.g. mutate_reference, sav_authorize)."""
    if _seen is None:
        _seen = set()
    obj_id = id(fn)
    if obj_id in _seen:
        return False
    _seen.add(obj_id)

    code = getattr(fn, "__code__", None)
    closure = getattr(fn, "__closure__", None)
    if code is None or closure is None:
        return False
    freevars = code.co_freevars
    if target_var in freevars:
        return True
    for cell in closure:
        try:
            contents = cell.cell_contents
        except ValueError:
            continue
        if callable(contents) and _closure_transitively_captures_name(contents, target_var, _seen):
            return True
    return False


def test_all_create_app_routes_enforce_session_auth_outside_explicit_allowlist():
    settings = _build_local_settings()
    engine = create_engine("sqlite:///:memory:")
    app = create_app(settings=settings, engine=engine)

    api_routes = [route for route in app.routes if isinstance(route, APIRoute)]
    assert len(api_routes) >= 110

    observed_unauthenticated: set[tuple[str, str]] = set()
    authenticated_count = 0

    for route in api_routes:
        methods = sorted(m for m in (route.methods or set()) if m not in ("HEAD", "OPTIONS"))
        dep_names = {getattr(dep.call, "__name__", "") for dep in route.dependant.dependencies}
        has_depends_auth = "auth" in dep_names
        has_closure_session_user = _closure_transitively_captures_name(route.endpoint, "session_user")

        for method in methods:
            key = (method, route.path)
            if key == SESSION_PROBE_ENDPOINT:
                assert has_closure_session_user, "/api/session must bind session_user"
                continue
            if has_depends_auth or has_closure_session_user:
                authenticated_count += 1
                assert key not in CONTROLLED_NON_SESSION_ENDPOINTS, (
                    f"Authenticated route {key} should not appear in non-session allowlist"
                )
            else:
                observed_unauthenticated.add(key)

    unexpected = observed_unauthenticated - CONTROLLED_NON_SESSION_ENDPOINTS
    assert not unexpected, f"Business routes missing auth dependency or session_user guard: {sorted(unexpected)}"
    assert observed_unauthenticated == CONTROLLED_NON_SESSION_ENDPOINTS
    assert authenticated_count >= 99

    # Verify cross-site protection on non-session POST endpoints
    for route in api_routes:
        methods = {m for m in (route.methods or set()) if m not in ("HEAD", "OPTIONS")}
        if "POST" in methods and ("POST", route.path) in {
            ("POST", "/api/auth/code"),
            ("POST", "/api/auth/verify"),
            ("POST", "/api/surveys/{token}/responses"),
        }:
            assert _closure_transitively_captures_name(route.endpoint, "origin"), (
                f"Public mutation route POST {route.path} must enforce same-origin guard"
            )

    with TestClient(app, raise_server_exceptions=False) as client:
        for stateless_path in (
            "/api/reports/wordcloud",
            "/api/reports/cover-assemble",
            "/api/reports/preflight-audit",
        ):
            res = client.post(stateless_path, json={}, headers={"sec-fetch-site": "cross-site"})
            assert res.status_code == 403
            assert res.json()["error"]["code"] == "origin_forbidden"

        # Production mode rejects injected fixtures AND disables /docs and /openapi.json surface
        prod_settings = _build_local_settings(
            mode="production",
            allowed_origins=["https://evix.example.org"],
            invited_emails=["researcher@example.org"],
            cookie_name="__Host-evix_session",
            mail_mode="resend",
            mail_api_key="re_synthetic_prod_mail_token_123456",
            mail_from="noreply@evix.example.org",
            provider_mode="live",
        )
        with pytest.raises(ValueError, match="Production rejects injected fixtures"):
            create_app(settings=prod_settings, engine=engine)
        prod_app = create_app(settings=prod_settings)
        assert prod_app.docs_url is None and prod_app.redoc_url is None and prod_app.openapi_url is None
        prod_app.state.engine.dispose()


@pytest.mark.parametrize(
    "provider,approved_url",
    [
        ("openai", "https://api.openai.com/v1"),
        ("deepseek", "https://api.deepseek.com/v1"),
        ("qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        ("anthropic", "https://api.anthropic.com/v1"),
        ("gemini", "https://generativelanguage.googleapis.com/v1beta"),
    ],
)
def test_validate_base_accepts_canonical_allowlisted_https_origins(provider: str, approved_url: str):
    assert validate_base(provider, approved_url) == approved_url


@pytest.mark.parametrize(
    "provider,malicious_url,allowlist",
    [
        # 1. Plain HTTP scheme rejected (SSRF / downgrade)
        ("openai", "http://api.openai.com/v1", None),
        ("compatible", "http://approved-gateway.example.org/v1", {"compatible": ("http://approved-gateway.example.org/v1",)}),
        ("compatible", "http://169.254.169.254/latest/meta-data", {"compatible": ("http://169.254.169.254/latest/meta-data",)}),
        # 2. Embedded userinfo / credentials rejected
        ("openai", "https://user:secret@api.openai.com/v1", None),
        ("compatible", "https://token@approved-gateway.example.org/v1", {"compatible": ("https://token@approved-gateway.example.org/v1",)}),
        # 3. Explicit port overrides rejected (even when listed in custom allowlist!)
        ("openai", "https://api.openai.com:443/v1", None),
        ("openai", "https://api.openai.com:8443/v1", None),
        ("compatible", "https://approved-gateway.example.org:8080/v1", {"compatible": ("https://approved-gateway.example.org:8080/v1",)}),
        # 4. Path traversal segments (. and ..) & backslashes rejected
        ("compatible", "https://approved-gateway.example.org/v1/../admin", {"compatible": ("https://approved-gateway.example.org/v1/../admin",)}),
        ("compatible", "https://approved-gateway.example.org/./v1", {"compatible": ("https://approved-gateway.example.org/./v1",)}),
        ("compatible", "https://approved-gateway.example.org\\v1", {"compatible": ("https://approved-gateway.example.org\\v1",)}),
        # 5. Query strings, fragments, trailing slashes, non-canonical uppercase hostnames & control chars rejected
        ("openai", "https://api.openai.com/v1?api_key=leak", None),
        ("openai", "https://api.openai.com/v1#fragment", None),
        ("openai", "https://api.openai.com/v1/", None),
        ("compatible", "https://APPROVED-GATEWAY.example.org/v1", {"compatible": ("https://APPROVED-GATEWAY.example.org/v1",)}),
        ("openai", "https://api.openai.com/v1\r\nX-Injected: 1", None),
        # 6. Unapproved domains, suffix spoofing & unknown providers rejected
        ("openai", "https://api.openai.com.attacker.invalid/v1", None),
        ("openai", "https://evil-openai.example.org/v1", None),
        ("compatible", "https://unapproved.example.org/v1", {"compatible": ("https://approved-gateway.example.org/v1",)}),
        ("unknown_provider", "https://api.openai.com/v1", BASES),
    ],
)
def test_validate_base_blocks_http_credentials_ports_traversal_and_unapproved_hosts(
    provider: str,
    malicious_url: str,
    allowlist,
):
    with pytest.raises(ValueError):
        validate_base(provider, malicious_url, allowlist)


@pytest.mark.asyncio
async def test_llm_enforces_follow_redirects_false_and_trust_env_false_statically_and_at_runtime(
    monkeypatch: pytest.MonkeyPatch,
):
    # 1. Static AST verification on infrastructure/llm.py
    llm_path = Path(inspect.getsourcefile(llm) or "").resolve()
    tree = ast.parse(llm_path.read_text(encoding="utf-8"), filename=str(llm_path))

    async_client_calls = 0
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "httpx"
            and node.func.attr == "AsyncClient"
        ):
            async_client_calls += 1
            kw_map = {
                kw.arg: kw.value.value
                for kw in node.keywords
                if kw.arg and isinstance(kw.value, ast.Constant)
            }
            assert kw_map.get("follow_redirects") is False, (
                f"llm.py:{node.lineno} httpx.AsyncClient must set follow_redirects=False"
            )
            assert kw_map.get("trust_env") is False, (
                f"llm.py:{node.lineno} httpx.AsyncClient must set trust_env=False"
            )
    assert async_client_calls >= 2

    # 2. Runtime verification even when proxy env vars are present
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:9999")
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9999")
    captured_client_kwargs: list[dict] = []
    original_async_client = httpx.AsyncClient

    def _redirect_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(307, headers={"location": "http://169.254.169.254/latest/meta-data"})

    def _spy_client(**kwargs):
        captured_client_kwargs.append(dict(kwargs))
        return original_async_client(transport=httpx.MockTransport(_redirect_handler), **kwargs)

    monkeypatch.setattr("infrastructure.llm.httpx.AsyncClient", _spy_client)
    cfg = {
        "provider": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "maxOutputTokens": 256,
    }
    key = "sk-synthetic-guard-key-1234567890"
    msgs = [
        {"role": "system", "content": "输出结构化结论。"},
        {"role": "user", "content": "核查问卷信效度。"},
    ]

    for call in (
        lambda: ChatCompletionClient().complete(cfg, key, "核查问卷信效度", 65536),
        lambda: ChatCompletionClient().complete_messages(cfg, key, msgs, 65536),
        lambda: ChatCompletionClient().complete_agent_turn(cfg, key, msgs),
    ):
        with pytest.raises(ProviderFailure) as exc_info:
            await call()
        assert exc_info.value.code == "redirect_blocked"

    assert len(captured_client_kwargs) == 3
    for kw in captured_client_kwargs:
        assert kw["follow_redirects"] is False
        assert kw["trust_env"] is False


def test_tenant_isolation_anti_enumeration_and_rls_csrf_source_invariants():
    # 1. Verify RLS set_config('evix.user_id', ..., true) & hmac.compare_digest in dependencies.py
    dep_src = Path(inspect.getsourcefile(dep_module) or "").read_text(encoding="utf-8")
    assert "set_config('evix.user_id', :user_id, true)" in dep_src
    assert "hmac.compare_digest" in dep_src

    # 2. Verify AccessControl returns uniform 404 not_found on cross-tenant UUID probes (zero IDOR enumeration)
    class _EmptyScalarResult:
        def scalar_one_or_none(self):
            return None

    class _FakeEmptySession:
        def execute(self, _stmt):
            return _EmptyScalarResult()

    ac = AccessControl()
    user_a = SimpleNamespace(id=str(uuid4()))
    foreign_id = str(uuid4())

    # Malformed non-UUID rejected with 422 before DB query
    with pytest.raises(ApiError) as bad_uuid:
        ac.owned_project(_FakeEmptySession(), user_a, "../not-a-uuid")
    assert bad_uuid.value.status == 422

    # Unowned / cross-tenant UUID uniformly raises 404 not_found (never 403)
    for probe in (
        lambda: ac.membership(_FakeEmptySession(), user_a, foreign_id),
        lambda: ac.owned_project(_FakeEmptySession(), user_a, foreign_id, edit=True, lock=True),
        lambda: ac.owned_service(_FakeEmptySession(), user_a, foreign_id, lock=True),
    ):
        with pytest.raises(ApiError) as not_found_exc:
            probe()
        assert not_found_exc.value.status == 404
        assert not_found_exc.value.code == "not_found"
