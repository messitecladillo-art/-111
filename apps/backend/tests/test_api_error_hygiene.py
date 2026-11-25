"""Deterministic boundary tests for app/runtime startup, security headers, and 404/405/500/503 error hygiene."""
from __future__ import annotations

from pathlib import Path
import re

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.exc import OperationalError

from evix_api.app import create_app
from evix_api.runtime import create_runtime, sanitize_boundary_error_message
from shared.errors import ApiError

_FORBIDDEN_LEAK_RE = re.compile(
    r"Traceback|ZeroDivisionError|OperationalError|SQLAlchemyError|RuntimeError|ValueError"
    r"|postgresql(?:\+psycopg)?://|secret_db_pwd|private_host_user|/var/lib/pgdata"
    r"|[\u3010\u3011\u300c\u300d\u300e\u300f]",
    re.IGNORECASE,
)


def _assert_api_security_headers(response) -> None:
    assert response.headers.get("cache-control") == "no-store"
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") in ("no-referrer", "same-origin")
    assert response.headers.get("x-robots-tag") == "noindex, nofollow, noarchive"


def _local_settings(settings, tmp_path: Path):
    return settings.model_copy(
        update={
            "sav_temp_dir": tmp_path / "sav",
            "preflight_temp_dir": tmp_path / "preflight",
        }
    )


def test_runtime_engine_hides_sql_parameters_and_rejects_production_fixture_injection(settings, tmp_path: Path):
    local = _local_settings(settings, tmp_path)
    runtime = create_runtime(local)
    try:
        assert runtime.engine.hide_parameters is True
    finally:
        runtime.engine.dispose()

    prod_candidate = local.model_copy(
        update={
            "mode": "production",
            "mail_mode": "resend",
            "resend_api_key": "re_synthetic_key",
            "mail_from": "noreply@example.test",
            "provider_mode": "live",
        }
    )
    with pytest.raises(ValueError, match="Production rejects injected fixtures"):
        create_runtime(prod_candidate, provider=object())


def test_app_disables_debug_and_sanitizes_404_and_405_responses(settings, tmp_path: Path):
    app = create_app(_local_settings(settings, tmp_path))
    assert app.debug is False

    with TestClient(app, raise_server_exceptions=False) as client:
        missing = client.get("/api/nonexistent-internal-probe")
        assert missing.status_code == 404
        _assert_api_security_headers(missing)
        body_404 = missing.json()
        assert body_404["error"]["code"] == "not_found"
        assert not _FORBIDDEN_LEAK_RE.search(missing.text)

        wrong_method = client.delete("/api/session")
        assert wrong_method.status_code == 405
        _assert_api_security_headers(wrong_method)
        body_405 = wrong_method.json()
        assert body_405["error"]["code"] == "http_error"
        assert not _FORBIDDEN_LEAK_RE.search(wrong_method.text)


def test_500_and_503_boundaries_redact_stack_traces_class_names_uris_and_paths(settings, tmp_path: Path):
    app = create_app(_local_settings(settings, tmp_path))

    @app.get("/api/_hygiene_probe/crash")
    def _crash_probe():
        raise ZeroDivisionError(
            r'C:\Users\private_host_user\workspace\secret.py:42 ZeroDivisionError division by zero'
        )

    @app.get("/api/_hygiene_probe/db_down")
    def _db_down_probe():
        raise OperationalError(
            "SELECT 1 FROM users WHERE token = 'secret_db_pwd'",
            {"token": "secret_db_pwd"},
            Exception("postgresql+psycopg://evix_app:secret_db_pwd@127.0.0.1:55432/evix_p0 /var/lib/pgdata"),
        )

    @app.get("/api/_hygiene_probe/api_error_leak")
    def _api_error_probe():
        raise ApiError(
            400,
            "invalid_probe_input",
            "ValueError: 读取 C:\\Users\\private_host_user\\draft.json 失败，请检查\u300c问卷配置\u300d\u3010草稿\u3011。",
        )

    with TestClient(app, raise_server_exceptions=False) as client:
        res_500 = client.get("/api/_hygiene_probe/crash")
        assert res_500.status_code == 500
        _assert_api_security_headers(res_500)
        assert res_500.headers.get("referrer-policy") == "no-referrer"
        body_500 = res_500.json()
        assert body_500["error"]["code"] == "internal_error"
        assert not _FORBIDDEN_LEAK_RE.search(res_500.text)

        res_503 = client.get("/api/_hygiene_probe/db_down")
        assert res_503.status_code == 503
        _assert_api_security_headers(res_503)
        body_503 = res_503.json()
        assert body_503["error"]["code"] == "storage_unavailable"
        assert not _FORBIDDEN_LEAK_RE.search(res_503.text)

        res_400 = client.get("/api/_hygiene_probe/api_error_leak")
        assert res_400.status_code == 400
        _assert_api_security_headers(res_400)
        body_400 = res_400.json()
        assert body_400["error"]["code"] == "invalid_probe_input"
        assert "“问卷配置”草稿" in body_400["error"]["message"]
        assert not _FORBIDDEN_LEAK_RE.search(res_400.text)


def test_health_route_degrades_to_503_storage_unavailable_without_leaking_connection_details(settings, tmp_path: Path):
    app = create_app(_local_settings(settings, tmp_path))
    health_route = next(r for r in app.routes if getattr(r, "path", None) == "/api/health")
    db_dep = health_route.dependant.dependencies[0].call

    def _broken_db():
        raise OperationalError(
            "SELECT users.id FROM users LIMIT 1",
            {},
            Exception("postgresql+psycopg://evix_app:secret_db_pwd@127.0.0.1:55432/evix_p0"),
        )

    app.dependency_overrides[db_dep] = _broken_db
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            res = client.get("/api/health")
            assert res.status_code == 503
            _assert_api_security_headers(res)
            assert res.json()["error"]["code"] == "storage_unavailable"
            assert not _FORBIDDEN_LEAK_RE.search(res.text)
    finally:
        app.dependency_overrides.clear()


def test_sanitize_boundary_error_message_covers_tracebacks_uris_paths_and_classes():
    assert "Traceback" not in sanitize_boundary_error_message("Traceback (most recent call last):\n  File \"/app/x.py\", line 3")
    assert "postgresql" not in sanitize_boundary_error_message("postgresql://user:pwd@localhost:5432/db")
    cleaned = sanitize_boundary_error_message("RuntimeError: /home/private_host_user/config.toml 参数校验未通过")
    assert "RuntimeError" not in cleaned
    assert "private_host_user" not in cleaned
    assert "参数校验未通过" in cleaned
