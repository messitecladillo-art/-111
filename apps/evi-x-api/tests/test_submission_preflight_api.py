"""Consent, private admission, failure receipts and lifecycle on synthetic inputs."""
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
from pathlib import Path
import threading
import time
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DBSession
from starlette.requests import Request

from evix_api import submission_preflight as pf
from evix_api.contracts import ApiError
from evix_api.models import Session, RateEvent, now
from evix_api.settings import Settings
from evix_api.submission_preflight_routes import TemporarySubmissionPreflights
_fixtures = importlib.util.spec_from_file_location("preflight_test_fixtures", Path(__file__).with_name("test_submission_preflight.py"))
_module = importlib.util.module_from_spec(_fixtures)
_fixtures.loader.exec_module(_module)
office_bytes = _module.office_bytes

PATH = "/api/submission/preflight"
UPLOAD = {"content-type": "application/octet-stream", "x-evix-temporary-upload": "accepted",
          "x-evix-audit-format": "docx", "x-evix-audit-name": quote("合成验收.docx"),
          "x-evix-audit-terms": "W10"}


def result(raw, *, name="合成验收.docx", format="docx", terms=None):
    return {"schema": "submission-preflight/v1", "name": name, "format": format, "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(), "scope": "server-deep",
            "termsHash": pf.terms_hash(terms or []), "status": "no_issues_in_checked_scope", "findings": [],
            "coverage": [{"id": "pixels", "label": "页面外观", "status": "manual", "detail": "人工查看。"}],
            "cleanup": {"completed": True, "reason": "temporary-upload"}}


@pytest.mark.parametrize("override", [
    {"preflight_parse_seconds": 0}, {"preflight_parse_seconds": 36}, {"preflight_upload_seconds": 0},
    {"preflight_upload_seconds": 61}, {"preflight_cleanup_seconds": 29}, {"preflight_cleanup_seconds": 3601},
    {"preflight_hourly_imports": 0}, {"preflight_hourly_imports": 61},
    {"preflight_hourly_imports": 12, "preflight_global_hourly_imports": 11}, {"preflight_global_hourly_imports": 1001},
    {"preflight_temp_dir": Path(".")}, {"preflight_temp_dir": Path("private/../elsewhere")},
])
def test_private_preflight_configuration_bounded(settings, override):
    with pytest.raises(ValueError):
        Settings(**(settings.model_dump() | override))


def test_owned_connection_wait_is_bounded_injected_engine_unchanged(settings, monkeypatch):
    import evix_api.app as app_module
    calls, owned, injected = [], object(), object()
    def create(_url, **kwargs):
        calls.append(kwargs)
        return owned
    monkeypatch.setattr(app_module, "create_engine", create)
    app = app_module.create_app(settings)
    assert app.state.engine is owned
    assert calls[0]["pool_timeout"] == 3 and calls[0]["connect_args"] == {"connect_timeout": 3}
    injected_app = app_module.create_app(settings, engine=injected)
    assert injected_app.state.engine is injected and len(calls) == 1


@pytest.mark.postgres
def test_auth_origin_csrf_consent_headers_and_content(harness):
    app, login, _, _ = harness
    anonymous = TestClient(app)
    assert anonymous.post(PATH, headers=UPLOAD, content=b"x").status_code == 401
    anonymous.close()
    client, _ = login()
    no_consent = {k: v for k, v in UPLOAD.items() if k != "x-evix-temporary-upload"}
    assert client.post(PATH, headers=no_consent, content=b"x").json()["error"]["code"] == "preflight_upload_consent_required"
    for extra in [{"origin": "https://foreign.invalid"}, {"x-csrf-token": "wrong"}, {"sec-fetch-site": "cross-site"}]:
        assert client.post(PATH, headers=UPLOAD | extra, content=b"x").status_code == 403
    for extra in [{"content-type": "application/json"}, {"content-encoding": "gzip"}]:
        assert client.post(PATH, headers=UPLOAD | extra, content=b"x").status_code == 415
    for extra in [{"x-evix-audit-format": "sav"}, {"x-evix-audit-name": "%FF.docx"},
                  {"x-evix-audit-name": "..%2Fsecret.docx"}, {"x-evix-audit-terms": "e30"},
                  {"x-evix-audit-terms": "x" * 5463}, {"content-length": "bad"}]:
        assert client.post(PATH, headers=UPLOAD | extra, content=b"x").status_code == 422
    assert client.post(PATH, headers=UPLOAD | {"content-length": str(pf.MAX_BYTES + 1)}, content=b"x").status_code == 413
    assert client.post(PATH, headers=UPLOAD, content=b"").json()["error"]["code"] == "preflight_empty"
    assert not app.state.preflights._users


@pytest.mark.postgres
def test_real_private_subprocess_no_db_during_scan_and_cleanup(harness, settings, pg_engine, tmp_path, monkeypatch):
    app, login, _, _ = harness
    settings.preflight_temp_dir = tmp_path / "private"
    original, checked = pf.audit_bytes, []
    async def audit(*args, **kwargs):
        checked.append(pg_engine.pool.checkedout())
        return await original(*args, **kwargs)
    monkeypatch.setattr(pf, "audit_bytes", audit)
    raw = office_bytes(text="合成验收内容")
    client, _ = login()
    response = client.post(PATH, headers=UPLOAD, content=raw)
    assert response.status_code == 200, response.text
    value = response.json()
    assert checked == [0] and value["sha256"] == hashlib.sha256(raw).hexdigest()
    assert value["cleanup"] == {"completed": True, "reason": "temporary-upload"}
    assert not list(settings.preflight_temp_dir.glob("preflight-*"))
    assert [row["status"] for row in app.state.preflights.events] == ["started", "completed_cleaned"]
    assert "合成验收内容" not in repr(list(app.state.preflights.events))
    assert response.headers["cache-control"] == "no-store" and response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.postgres
def test_malformed_error_sanitized_and_cleaned(harness, settings, tmp_path):
    app, login, _, _ = harness
    settings.preflight_temp_dir = tmp_path / "private"
    client, _ = login()
    response = client.post(PATH, headers=UPLOAD, content=b"private-body-and-school")
    assert response.status_code == 422 and response.json()["error"]["code"] == "preflight_invalid"
    assert "private-body" not in response.text and str(tmp_path) not in response.text
    assert not list(settings.preflight_temp_dir.glob("preflight-*"))


@pytest.mark.postgres
def test_persistent_rate_scope_survives_restart(harness, settings, pg_engine, monkeypatch):
    from evix_api.app import create_app
    from evix_api.provider import FixtureProvider
    app, login, _, _ = harness
    settings.preflight_hourly_imports = 2
    async def fast(raw, **kwargs):
        return result(raw, name=kwargs["name"], format=kwargs["format"], terms=kwargs["terms"])
    monkeypatch.setattr(pf, "audit_bytes", fast)
    client, _ = login()
    assert client.post(PATH, headers=UPLOAD, content=b"a").status_code == 200
    assert client.post(PATH, headers=UPLOAD, content=b"b").status_code == 200
    restarted = TestClient(create_app(settings, provider=FixtureProvider(), engine=pg_engine))
    restarted.cookies.update(client.cookies)
    restarted.headers.update(client.headers)
    response = restarted.post(PATH, headers=UPLOAD, content=b"c")
    restarted.close()
    assert response.status_code == 429 and response.json()["error"]["code"] == "preflight_rate_limit"
    with DBSession(pg_engine) as session:
        scopes = session.scalars(select(RateEvent.scope)).all()
        assert scopes.count("submission-preflight-global") == 2 and "sav-import-global" not in scopes


@pytest.mark.postgres
def test_two_per_process_one_per_user_slots(harness, monkeypatch):
    app, login, _, _ = harness
    a, _ = login()
    b, _ = login("b@example.test")
    c, _ = login("c@example.test")
    ready_a, ready_b, release = threading.Event(), threading.Event(), threading.Event()
    async def slow(raw, **kwargs):
        (ready_a if raw == b"a" else ready_b).set()
        await asyncio.to_thread(release.wait, 10)
        return result(raw)
    monkeypatch.setattr(pf, "audit_bytes", slow)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(a.post, PATH, headers=UPLOAD, content=b"a")
        assert ready_a.wait(5)
        assert a.post(PATH, headers=UPLOAD, content=b"d").json()["error"]["code"] == "preflight_user_active"
        second = pool.submit(b.post, PATH, headers=UPLOAD, content=b"b")
        assert ready_b.wait(5)
        assert c.post(PATH, headers=UPLOAD, content=b"c").status_code == 429
        release.set()
        assert first.result(5).status_code == second.result(5).status_code == 200
    assert not app.state.preflights._users and not app.state.preflights._operations


@pytest.mark.postgres
def test_logout_during_scan_discards_result(harness, pg_engine, monkeypatch):
    app, login, _, _ = harness
    client, signed = login()
    async def revoked(raw, **_):
        with DBSession(pg_engine) as session:
            session.execute(update(Session).where(Session.user_id == signed["user"]["id"]).values(revoked_at=now()))
            session.commit()
        return result(raw)
    monkeypatch.setattr(pf, "audit_bytes", revoked)
    response = client.post(PATH, headers=UPLOAD, content=b"x")
    assert response.status_code == 401 and "findings" not in response.text


@pytest.mark.postgres
@pytest.mark.parametrize("code,status", [("preflight_timeout", 408), ("preflight_cancelled", 499), ("preflight_cleanup_failed", 503), ("preflight_dependency", 503), ("preflight_limits", 413)])
def test_parser_failure_statuses(harness, monkeypatch, code, status):
    app, login, _, _ = harness
    client, _ = login()
    async def fail(*_, **__):
        raise pf.PreflightError(code)
    monkeypatch.setattr(pf, "audit_bytes", fail)
    response = client.post(PATH, headers=UPLOAD, content=b"x")
    assert response.status_code == status and response.json()["error"]["code"] == code
    assert not app.state.preflights._users


@pytest.mark.postgres
@pytest.mark.parametrize("change", ["cleanup", "source", "extra", "falsepass", "oversized", "field"])
def test_partial_or_unbound_process_results_rejected(harness, monkeypatch, change):
    app, login, _, _ = harness
    client, _ = login()
    async def bad(raw, **_):
        value = result(raw)
        if change == "cleanup":
            value.pop("cleanup")
        elif change == "source":
            value["sha256"] = "0" * 64
        elif change == "extra":
            value["rawDocument"] = "secret"
        elif change == "falsepass":
            value["coverage"][0]["status"] = "not_checked"
        elif change == "oversized":
            value["findings"] = [{"level": "error", "code": "identity_metadata", "message": "x" * 601, "location": "metadata"}]
        else:
            value["findings"] = [{"level": "error", "code": "identity_metadata", "message": "x", "location": "metadata", "field": "x" * 121}]
        return value
    monkeypatch.setattr(pf, "audit_bytes", bad)
    response = client.post(PATH, headers=UPLOAD, content=b"x")
    assert response.status_code == 503 and "secret" not in response.text


def request(events, headers=None):
    iterator = iter(events)
    async def receive():
        item = next(iterator, {"type": "http.request", "body": b"", "more_body": False})
        return await item() if callable(item) else item
    return Request({"type": "http", "method": "POST", "path": PATH,
                    "headers": [(k.encode(), v.encode()) for k, v in (headers or UPLOAD).items()]}, receive)


@pytest.mark.asyncio
async def test_streaming_limit_before_parser(settings, monkeypatch):
    service, calls = TemporarySubmissionPreflights(settings), []
    async def unexpected(*_, **__):
        calls.append(True)
    monkeypatch.setattr(pf, "audit_bytes", unexpected)
    req = request([{"type": "http.request", "body": b"x" * pf.MAX_BYTES, "more_body": True}, {"type": "http.request", "body": b"x", "more_body": False}])
    with pytest.raises(ApiError) as error:
        await service.convert(req, lambda *_a, **_k: "user", lambda *_: None)
    assert error.value.code == "preflight_too_large" and not calls and not service._users


@pytest.mark.asyncio
async def test_close_mid_upload_settles_no_parser_or_file(settings, monkeypatch):
    service = TemporarySubmissionPreflights(settings)
    entered = asyncio.Event()
    async def wait():
        entered.set()
        await asyncio.sleep(100)
    async def unexpected(*_, **__):
        pytest.fail("parser ran after close")
    monkeypatch.setattr(pf, "audit_bytes", unexpected)
    task = asyncio.create_task(service.convert(request([wait]), lambda *_a, **_k: "user", lambda *_: None))
    await entered.wait()
    await service.close()
    assert task.cancelled() and not service._users and not service._operations and not service._parsers
    with pytest.raises(ApiError) as error:
        await service.convert(request([]), lambda *_a, **_k: "user", lambda *_: None)
    assert error.value.code == "preflight_unavailable"


@pytest.mark.asyncio
async def test_close_during_parser_waits_for_cleanup(settings, monkeypatch):
    service = TemporarySubmissionPreflights(settings)
    entered, cleaned = asyncio.Event(), asyncio.Event()
    async def parsed(*_, cancel_event, **__):
        entered.set()
        await cancel_event.wait()
        await asyncio.sleep(.01)
        cleaned.set()
        raise pf.PreflightError("preflight_cancelled")
    monkeypatch.setattr(pf, "audit_bytes", parsed)
    task = asyncio.create_task(service.convert(request([{"type": "http.request", "body": b"x", "more_body": False}]), lambda *_a, **_k: "user", lambda *_: None))
    await entered.wait()
    await service.close()
    assert cleaned.is_set() and task.done() and not service._users and not service._operations
    assert isinstance(task.exception(), ApiError)


@pytest.mark.asyncio
async def test_upload_disconnect_timeout_release_slots(settings):
    service = TemporarySubmissionPreflights(settings)
    with pytest.raises(ApiError) as error:
        await service.convert(request([{"type": "http.disconnect"}]), lambda *_a, **_k: "user", lambda *_: None)
    assert error.value.code == "preflight_cancelled"
    settings.preflight_upload_seconds = .02
    async def long():
        await asyncio.sleep(1)
    with pytest.raises(ApiError) as error:
        await service.convert(request([long]), lambda *_a, **_k: "user", lambda *_: None)
    assert error.value.code == "preflight_upload_timeout" and not service._users


@pytest.mark.asyncio
async def test_blocking_db_callbacks_off_loop_bounded_admission_and_settled(settings, monkeypatch):
    import evix_api.submission_preflight_routes as routes
    monkeypatch.setattr(routes, "DB_DEADLINE_SECONDS", .01)
    service, entered, release = TemporarySubmissionPreflights(settings), threading.Event(), threading.Event()
    calls, heartbeat = [], []
    def blocking(*_, **__):
        calls.append(True)
        entered.set()
        release.wait(2)
        return "user"
    task = asyncio.create_task(service.convert(request([]), blocking, lambda *_: None))
    while not entered.is_set():
        await asyncio.sleep(.001)
    for _ in range(10):
        heartbeat.append(True)
        await asyncio.sleep(.002)
    assert not task.done()  # timed out but owner retains the still-active thread
    release.set()
    with pytest.raises(ApiError) as error:
        await task
    assert error.value.code == "preflight_auth_timeout" and len(heartbeat) == 10 and not service._operations
