"""Private temporary SAV API acceptance on actual synthetic PostgreSQL."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import threading
import time
from pathlib import Path
import pandas as pd
import pyreadstat
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update, text
from sqlalchemy.orm import Session as DBSession
from starlette.requests import Request
from evix_api import survey_import as sav
from evix_api.contracts import ApiError
from evix_api.models import RateEvent, Session, now
from evix_api.settings import Settings
from evix_api.survey_import_routes import TemporarySavImports, MAX_RESPONSE_BYTES

PATH = "/api/imports/sav"
UPLOAD = {"content-type": "application/octet-stream", "x-evix-temporary-upload": "accepted"}

def result():
    return {"schema": "survey-import/sav-v1", "rows": [[0]], "cleanup": {"completed": True, "reason": "temporary-upload"}}

@pytest.mark.parametrize("override", [
    {"sav_parse_seconds": 0}, {"sav_parse_seconds": 61}, {"sav_upload_seconds": 0}, {"sav_upload_seconds": 61},
    {"sav_cleanup_seconds": 29}, {"sav_cleanup_seconds": 3601}, {"sav_hourly_imports": 0}, {"sav_hourly_imports": 61},
    {"sav_hourly_imports": 12, "sav_global_hourly_imports": 11}, {"sav_global_hourly_imports": 1001},
    {"sav_temp_dir": Path(".")}, {"sav_temp_dir": Path("private/../public")},
])
def test_sav_configuration_is_bounded(settings, override):
    with pytest.raises(ValueError):
        Settings(**(settings.model_dump() | override))

@pytest.mark.postgres
def test_auth_consent_origin_csrf_and_content_are_required(harness):
    app, login, _, _ = harness
    anonymous = TestClient(app)
    assert anonymous.post(PATH, headers=UPLOAD, content=b"x").status_code == 401
    anonymous.close()
    a, _ = login()
    assert a.post(PATH, headers={"content-type": "application/octet-stream"}, content=b"x").json()["error"]["code"] == "sav_upload_consent_required"
    for extra in [{"x-csrf-token": "wrong"}, {"origin": "https://foreign.invalid"}, {"sec-fetch-site": "cross-site"}]:
        assert a.post(PATH, headers=UPLOAD | extra, content=b"x").status_code == 403
    for extra in [{"content-type": "application/json"}, {"content-encoding": "gzip"}]:
        assert a.post(PATH, headers=UPLOAD | extra, content=b"x").status_code == 415
    assert a.post(PATH, headers=UPLOAD | {"content-length": "bad"}, content=b"x").status_code == 422
    assert a.post(PATH, headers=UPLOAD | {"content-length": "2000001"}, content=b"x").status_code == 413
    assert a.post(PATH, headers=UPLOAD, content=b"").json()["error"]["code"] == "sav_empty"
    assert not app.state.sav_imports._users

@pytest.mark.postgres
def test_real_sav_conversion_releases_db_preserves_raw_and_cleans(harness, settings, tmp_path, pg_engine, monkeypatch):
    app, login, _, _ = harness
    settings.sav_temp_dir = tmp_path / "private"
    path = tmp_path / "synthetic-api.sav"
    pyreadstat.write_sav(pd.DataFrame({"score": [0.0, 99.0, float("nan")], "comment": ["中文", "NA", ""]}), str(path),
        column_labels={"score": "评价", "comment": "建议"}, variable_value_labels={"score": {0: "零分", 99: "拒答"}},
        missing_ranges={"score": [99], "comment": ["NA"]})
    raw, observed, original = path.read_bytes(), [], sav.parse_sav_bytes
    async def checked(*args, **kwargs):
        observed.append(pg_engine.pool.checkedout())
        return await original(*args, **kwargs)
    monkeypatch.setattr(sav, "parse_sav_bytes", checked)
    a, _ = login()
    response = a.post(PATH, headers=UPLOAD, content=raw)
    assert response.status_code == 200, response.text
    data = response.json()
    assert observed == [0] and data["rows"] == [[0.0, "中文"], [99.0, "NA"], [None, ""]]
    assert data["sourceSha256"] == hashlib.sha256(raw).hexdigest()
    assert data["columns"][0]["userMissingValues"] == [99.0] and data["columns"][0]["systemMissingCount"] == 1
    assert data["columns"][1]["userMissingValues"] == ["NA"]
    assert data["cleanup"] == {"completed": True, "reason": "temporary-upload"}
    assert not list(settings.sav_temp_dir.glob("sav-*"))
    assert [e["status"] for e in app.state.sav_imports.events] == ["started", "completed_cleaned"]
    assert all(set(e) <= {"importId", "status", "at"} for e in app.state.sav_imports.events)
    assert "建议" not in repr(list(app.state.sav_imports.events))
    assert response.headers["cache-control"] == "no-store" and response.headers["x-content-type-options"] == "nosniff"

@pytest.mark.postgres
def test_malformed_sav_returns_sanitized_error_and_cleanup(harness, settings, tmp_path):
    app, login, _, _ = harness
    settings.sav_temp_dir = tmp_path / "private"
    a, _ = login()
    response = a.post(PATH, headers=UPLOAD, content=b"$FL2private-answer-and-label")
    assert response.status_code == 422 and response.json()["error"]["code"] == "sav_invalid"
    assert "private-answer" not in response.text and str(tmp_path) not in response.text
    assert not list(settings.sav_temp_dir.glob("sav-*")) and app.state.sav_imports.events[-1]["status"] == "failed_cleaned"

@pytest.mark.postgres
def test_rate_limit_survives_an_api_instance_restart(harness, settings, pg_engine, monkeypatch):
    from evix_api.app import create_app
    from evix_api.provider import FixtureProvider
    app, login, _, _ = harness
    settings.sav_hourly_imports = 2
    async def parsed(*args, **kwargs):
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", parsed)
    a, _ = login()
    assert a.post(PATH, headers=UPLOAD, content=b"x").status_code == 200
    assert a.post(PATH, headers=UPLOAD, content=b"x").status_code == 200
    restarted = TestClient(create_app(settings, provider=FixtureProvider(), engine=pg_engine))
    restarted.cookies.update(a.cookies)
    restarted.headers.update(a.headers)
    response = restarted.post(PATH, headers=UPLOAD, content=b"x")
    restarted.close()
    assert response.status_code == 429 and response.json()["error"]["code"] == "sav_rate_limit"
    with DBSession(pg_engine) as session:
        assert session.scalar(select(RateEvent.scope).where(RateEvent.scope == "sav-import-global")) is not None
    assert not app.state.sav_imports._users

@pytest.mark.postgres
def test_two_global_and_one_per_user_conversion_slots(harness, monkeypatch):
    app, login, _, _ = harness
    a, _ = login()
    b, _ = login("b@example.test")
    c, _ = login("c@example.test")
    ready_a, ready_b, release = threading.Event(), threading.Event(), threading.Event()
    async def slow(raw, **kwargs):
        (ready_a if raw == b"a" else ready_b).set()
        await asyncio.to_thread(release.wait, 10)
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", slow)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(a.post, PATH, headers=UPLOAD, content=b"a")
        assert ready_a.wait(5)
        denied = a.post(PATH, headers=UPLOAD, content=b"duplicate")
        assert denied.status_code == 429 and denied.json()["error"]["code"] == "sav_user_active"
        second = pool.submit(b.post, PATH, headers=UPLOAD, content=b"b")
        assert ready_b.wait(5)
        denied = c.post(PATH, headers=UPLOAD, content=b"c")
        assert denied.status_code == 429 and denied.json()["error"]["code"] == "sav_busy"
        release.set()
        assert first.result(5).status_code == second.result(5).status_code == 200
    assert not app.state.sav_imports._users and not app.state.sav_imports._parsers
    assert c.post(PATH, headers=UPLOAD, content=b"c").status_code == 200

@pytest.mark.postgres
def test_logout_during_parse_discards_result(harness, pg_engine, monkeypatch):
    app, login, _, _ = harness
    a, signed = login()
    async def revoked(*args, **kwargs):
        with DBSession(pg_engine) as session:
            session.execute(update(Session).where(Session.user_id == signed["user"]["id"]).values(revoked_at=now()))
            session.commit()
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", revoked)
    response = a.post(PATH, headers=UPLOAD, content=b"x")
    assert response.status_code == 401 and "rows" not in response.text and not app.state.sav_imports._users

@pytest.mark.postgres
@pytest.mark.parametrize("code,status", [("sav_timeout", 408), ("sav_cancelled", 499), ("sav_cleanup_failed", 503), ("sav_dependency", 503), ("sav_limits", 413)])
def test_parser_errors_keep_stable_code(harness, monkeypatch, code, status):
    app, login, _, _ = harness
    a, _ = login()
    async def failed(*args, **kwargs):
        raise sav.SurveyImportError(code)
    monkeypatch.setattr(sav, "parse_sav_bytes", failed)
    response = a.post(PATH, headers=UPLOAD, content=b"x")
    assert response.status_code == status and response.json()["error"]["code"] == code and not app.state.sav_imports._users

@pytest.mark.postgres
def test_missing_cleanup_receipt_and_oversized_response_never_succeed(harness, monkeypatch):
    app, login, _, _ = harness
    a, _ = login()
    async def no_cleanup(*args, **kwargs):
        return {"rows": [[1]]}
    monkeypatch.setattr(sav, "parse_sav_bytes", no_cleanup)
    assert a.post(PATH, headers=UPLOAD, content=b"x").json()["error"]["code"] == "sav_cleanup_failed"
    async def too_large(*args, **kwargs):
        return {**result(), "text": "x" * MAX_RESPONSE_BYTES}
    monkeypatch.setattr(sav, "parse_sav_bytes", too_large)
    response = a.post(PATH, headers=UPLOAD, content=b"x")
    assert response.status_code == 413 and response.json()["error"]["code"] == "sav_result_too_large"

def request_with_events(events):
    iterator = iter(events)
    async def receive():
        item = next(iterator, {"type": "http.request", "body": b"", "more_body": False})
        return await item() if callable(item) else item
    return Request({"type": "http", "method": "POST", "path": PATH, "headers": [(k.encode(), v.encode()) for k, v in UPLOAD.items()]}, receive)

@pytest.mark.asyncio
async def test_streaming_over_limit_stops_before_parser(settings, monkeypatch):
    service, called = TemporarySavImports(settings), []
    async def unexpected(*args, **kwargs):
        called.append(True)
    monkeypatch.setattr(sav, "parse_sav_bytes", unexpected)
    request = request_with_events([{"type": "http.request", "body": b"x" * 1_000_000, "more_body": True}, {"type": "http.request", "body": b"x" * 1_000_001, "more_body": False}])
    with pytest.raises(ApiError) as error:
        await service.convert(request, lambda *_args, **_kwargs: "user", lambda *_args: None)
    assert error.value.code == "sav_too_large" and not called and not service._users

@pytest.mark.asyncio
async def test_upload_timeout_and_disconnect_release_slot(settings):
    settings.sav_upload_seconds = 1
    service = TemporarySavImports(settings)
    async def stalled():
        await asyncio.sleep(2)
        return {"type": "http.request", "body": b"x", "more_body": False}
    for events, code in [([stalled], "sav_upload_timeout"), ([{"type": "http.disconnect"}], "sav_cancelled")]:
        with pytest.raises(ApiError) as error:
            await service.convert(request_with_events(events), lambda *_args, **_kwargs: "user", lambda *_args: None)
        assert error.value.code == code and not service._users

@pytest.mark.asyncio
async def test_disconnect_cancels_parser_before_response(settings, monkeypatch):
    service, observed = TemporarySavImports(settings), []
    async def waiting(*args, cancel_event, **kwargs):
        await cancel_event.wait()
        observed.append("cleanup-completed")
        raise sav.SurveyImportError("sav_cancelled")
    monkeypatch.setattr(sav, "parse_sav_bytes", waiting)
    request = request_with_events([{"type": "http.request", "body": b"x", "more_body": False}, {"type": "http.disconnect"}])
    with pytest.raises(ApiError) as error:
        await service.convert(request, lambda *_args, **_kwargs: "user", lambda *_args: None)
    assert error.value.code == "sav_cancelled" and observed == ["cleanup-completed"] and not service._users and not service._parsers

@pytest.mark.asyncio
async def test_repeated_task_cancellation_waits_for_cleanup(settings, monkeypatch):
    service, started, finished = TemporarySavImports(settings), asyncio.Event(), asyncio.Event()
    async def waiting(*args, cancel_event, **kwargs):
        started.set()
        await cancel_event.wait()
        await asyncio.sleep(.05)
        finished.set()
        raise sav.SurveyImportError("sav_cancelled")
    monkeypatch.setattr(sav, "parse_sav_bytes", waiting)
    operation = asyncio.create_task(service.convert(request_with_events([{"type": "http.request", "body": b"x", "more_body": False}]), lambda *_args, **_kwargs: "user", lambda *_args: None))
    await started.wait()
    operation.cancel()
    await asyncio.sleep(.01)
    operation.cancel()
    with pytest.raises(asyncio.CancelledError):
        await operation
    assert finished.is_set() and not service._users and not service._parsers

@pytest.mark.postgres
def test_startup_cleanup_preserves_unknown_spawn_lease(harness, settings, tmp_path):
    app, _, _, _ = harness
    settings.sav_temp_dir = tmp_path / "private"
    settings.sav_temp_dir.mkdir()
    identifier = "a" * 32
    job = settings.sav_temp_dir / f"sav-{identifier}"
    job.mkdir()
    (job / "lease.json").write_text(json.dumps({"schema": "sav-import-lease/v1", "id": identifier, "parentPid": 2147483000, "childPid": None, "phase": "spawning", "expiresAt": time.time() - 10}), encoding="utf-8")
    with TestClient(app):
        assert job.exists()
        assert any(e.get("importId") == identifier and e["status"] == "deferred" for e in app.state.sav_imports.events)
    assert job.exists()

@pytest.mark.postgres
def test_global_rate_limit_spans_users(harness, settings, monkeypatch):
    app, login, _, _ = harness
    settings.sav_hourly_imports = settings.sav_global_hourly_imports = 2
    async def parsed(*args, **kwargs):
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", parsed)
    a, _ = login()
    b, _ = login("b@example.test")
    c, _ = login("c@example.test")
    assert a.post(PATH, headers=UPLOAD, content=b"x").status_code == 200
    assert b.post(PATH, headers=UPLOAD, content=b"x").status_code == 200
    denied = c.post(PATH, headers=UPLOAD, content=b"x")
    assert denied.status_code == 429 and denied.json()["error"]["code"] == "sav_rate_limit"

@pytest.mark.asyncio
async def test_real_worker_task_cancel_is_clean_before_slot_released(settings, tmp_path, monkeypatch):
    settings.sav_temp_dir = tmp_path / "private"
    path = tmp_path / "synthetic-cancel.sav"
    pyreadstat.write_sav(pd.DataFrame({"score": [0.0, 1.0]}), str(path))
    raw = path.read_bytes()
    service, started, original = TemporarySavImports(settings), asyncio.Event(), sav.parse_sav_bytes
    async def actual(content, on_event, **kwargs):
        def event(value):
            on_event(value)
            if value["status"] == "started":
                started.set()
        return await original(content, on_event=event, **kwargs)
    monkeypatch.setattr(sav, "parse_sav_bytes", actual)
    operation = asyncio.create_task(service.convert(request_with_events([
        {"type": "http.request", "body": raw, "more_body": False}]),
        lambda *_args, **_kwargs: "user", lambda *_args: None))
    await asyncio.wait_for(started.wait(), 5)
    operation.cancel()
    with pytest.raises(asyncio.CancelledError):
        await operation
    assert not list(settings.sav_temp_dir.glob("sav-*"))
    assert service.events[-1]["status"] == "failed_cleaned"
    assert not service._users and not service._parsers

@pytest.mark.asyncio
async def test_shutdown_waits_for_parser_cleanup(settings, monkeypatch):
    service, started, cleaned = TemporarySavImports(settings), asyncio.Event(), asyncio.Event()
    async def slow(*args, cancel_event, **kwargs):
        started.set()
        await cancel_event.wait()
        await asyncio.sleep(.01)
        cleaned.set()
        raise sav.SurveyImportError("sav_cancelled")
    monkeypatch.setattr(sav, "parse_sav_bytes", slow)
    operation = asyncio.create_task(service.convert(request_with_events([
        {"type": "http.request", "body": b"x", "more_body": False}]),
        lambda *_args, **_kwargs: "user", lambda *_args: None))
    await started.wait()
    await service.close()
    with pytest.raises(ApiError) as error:
        await operation
    assert error.value.code == "sav_cancelled" and cleaned.is_set()
    assert not service._users and not service._parsers
    with pytest.raises(ApiError) as error:
        service._claim("next-user")
    assert error.value.code == "sav_unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize("slow_phase", ["initial", "charge", "reauthorize"])
async def test_database_callbacks_do_not_block_event_loop(settings, monkeypatch, slow_phase):
    service = TemporarySavImports(settings)
    started, ticked = threading.Event(), asyncio.Event()
    elapsed = []
    def authorize(_request, charge=False):
        if (slow_phase == "charge" and charge) or (slow_phase == "initial" and not charge):
            started.set()
            time.sleep(.25)
        return "user"
    def reauthorize(*_args):
        if slow_phase == "reauthorize":
            started.set()
            time.sleep(.25)
    async def parsed(*_args, **_kwargs):
        return result()
    async def heartbeat():
        while not started.is_set():
            await asyncio.sleep(.001)
        stamp = time.monotonic()
        await asyncio.sleep(.01)
        elapsed.append(time.monotonic() - stamp)
        ticked.set()
    monkeypatch.setattr(sav, "parse_sav_bytes", parsed)
    clock = asyncio.create_task(heartbeat())
    operation = asyncio.create_task(service.convert(request_with_events([
        {"type": "http.request", "body": b"x", "more_body": False}]), authorize, reauthorize))
    await asyncio.wait_for(ticked.wait(), 2)
    assert not operation.done() and elapsed[0] < .15
    assert (await operation).status_code == 200
    await clock
    assert not service._operations and not service._users


@pytest.mark.asyncio
async def test_database_cancel_keeps_slot_until_callback_closes(settings, monkeypatch):
    service = TemporarySavImports(settings)
    started, release, closed = threading.Event(), threading.Event(), threading.Event()
    parsed = []
    def authorize(_request, charge=False):
        if charge:
            started.set()
            try:
                assert release.wait(3)
            finally:
                closed.set()
        return "user"
    async def parser(*_args, **_kwargs):
        parsed.append(True)
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", parser)
    operation = asyncio.create_task(service.convert(request_with_events([
        {"type": "http.request", "body": b"x", "more_body": False}]), authorize, lambda *_args: None))
    while not started.is_set():
        await asyncio.sleep(.001)
    operation.cancel()
    await asyncio.sleep(.01)
    operation.cancel()
    await asyncio.sleep(.01)
    assert service._users == {"user"} and service._operations and not operation.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await operation
    assert closed.is_set() and not parsed and not service._users and not service._operations


@pytest.mark.asyncio
async def test_database_deadline_waits_for_callback_close_and_never_parses(settings, monkeypatch):
    from evix_api import survey_import_routes as routes
    service, closed, parsed = TemporarySavImports(settings), threading.Event(), []
    monkeypatch.setattr(routes, "DB_DEADLINE_SECONDS", .02)
    def authorize(_request, charge=False):
        if charge:
            time.sleep(.06)
            closed.set()
        return "user"
    async def parser(*_args, **_kwargs):
        parsed.append(True)
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", parser)
    with pytest.raises(ApiError) as error:
        await service.convert(request_with_events([
            {"type": "http.request", "body": b"x", "more_body": False}]), authorize, lambda *_args: None)
    assert error.value.code == "sav_auth_timeout" and closed.is_set() and not parsed
    assert not service._users and not service._operations


@pytest.mark.asyncio
async def test_shutdown_cancels_pending_upload_and_fences_late_parse(settings, monkeypatch):
    service, entered, release, parsed = TemporarySavImports(settings), asyncio.Event(), asyncio.Event(), []
    async def upload():
        entered.set()
        await release.wait()
        return {"type": "http.request", "body": b"x", "more_body": False}
    async def parser(*_args, **_kwargs):
        parsed.append(True)
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", parser)
    operation = asyncio.create_task(service.convert(request_with_events([upload]),
        lambda *_args, **_kwargs: "user", lambda *_args: None))
    await asyncio.wait_for(entered.wait(), 2)
    await asyncio.wait_for(service.close(), 2)
    assert operation.done() and operation.cancelled()
    assert not service._users and not service._parsers and not service._operations
    release.set()
    await asyncio.sleep(.01)
    assert not parsed
    with pytest.raises(ApiError) as error:
        await service.convert(request_with_events([]), lambda *_args, **_kwargs: "user", lambda *_args: None)
    assert error.value.code == "sav_unavailable"


@pytest.mark.asyncio
async def test_shutdown_waits_for_initial_database_callback(settings, monkeypatch):
    service = TemporarySavImports(settings)
    started, release, closed = threading.Event(), threading.Event(), threading.Event()
    def authorize(*_args, **_kwargs):
        started.set()
        try:
            assert release.wait(3)
        finally:
            closed.set()
        return "user"
    operation = asyncio.create_task(service.convert(request_with_events([]), authorize, lambda *_args: None))
    while not started.is_set():
        await asyncio.sleep(.001)
    closing = asyncio.create_task(service.close())
    await asyncio.sleep(.02)
    assert not closing.done() and not operation.done()
    release.set()
    await closing
    assert closed.is_set() and operation.cancelled() and not service._operations and not service._users


@pytest.mark.postgres
def test_postgres_rate_lock_wait_is_bounded_and_transaction_released(harness, pg_engine, monkeypatch):
    app, login, _, _ = harness
    client, _ = login()
    parsed = []
    async def parser(*_args, **_kwargs):
        parsed.append(True)
        return result()
    monkeypatch.setattr(sav, "parse_sav_bytes", parser)
    with pg_engine.connect() as blocker:
        blocker.execute(text("SELECT pg_advisory_xact_lock(4489371009)"))
        stamp = time.monotonic()
        response = client.post(PATH, headers=UPLOAD, content=b"x")
        assert time.monotonic() - stamp < 2.5
        assert response.status_code == 503 and response.json()["error"]["code"] == "storage_unavailable"
        assert not parsed and pg_engine.pool.checkedout() == 1
        blocker.rollback()
    assert not app.state.sav_imports._users and not app.state.sav_imports._operations
    with DBSession(pg_engine) as session:
        assert not session.scalar(select(RateEvent.scope).where(RateEvent.scope == "sav-import-global"))
    assert client.post(PATH, headers=UPLOAD, content=b"x").status_code == 200
