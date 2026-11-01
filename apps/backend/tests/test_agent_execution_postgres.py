"""Real HTTP/PostgreSQL failure paths for durable, one-role Agent dispatch.

Callbacks are explicitly synthetic and never contact a model supplier. Every
database assertion runs through the non-owner application role from conftest.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import timedelta
from threading import Event
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select, text
from sqlalchemy.exc import DBAPIError

from evix_api.app import create_app
from application.services import agent_task_execution as execution_service
from infrastructure.database.models import AgentTask, AgentTaskExecution
from multi_agent.roles import AgentRole
from multi_agent.workflow import AgentResult, ReviewDecision
from shared.errors import ProviderFailure
from tests.test_postgres import project


pytestmark = pytest.mark.postgres


@pytest.fixture
def execution_harness(settings, pg_engine):
    """Independent clients share an app, not request Sessions or cookie jars."""
    clients = []

    def build(*, configured=True):
        deliveries, calls, hooks = {}, [], {}

        async def mail(challenge_id, email, code):
            deliveries[challenge_id] = code

        def handler(role):
            def execute(state):
                calls.append(role.value)
                hook = hooks.get(role)
                if hook is not None:
                    return hook(state)
                if role is AgentRole.REVIEWER:
                    return AgentResult("Synthetic independent review",
                                       review_decision=ReviewDecision.APPROVE)
                return AgentResult("Synthetic role output", (f"synthetic:{role.value}:v1",))
            return execute

        app = create_app(settings, engine=pg_engine, mail=mail,
                         workflow_handlers={role: handler(role) for role in AgentRole}
                         if configured else {})

        def login(email="a@example.test"):
            client = TestClient(app)
            client.headers["origin"] = settings.allowed_origins[0]
            response = client.post("/api/auth/code", json={"email": email})
            assert response.status_code == 202, response.text
            challenge = response.json()["challengeId"]
            response = client.post("/api/auth/verify", json={
                "challengeId": challenge, "code": deliveries[challenge],
            })
            assert response.status_code == 200, response.text
            client.headers["x-csrf-token"] = response.json()["csrfToken"]
            clients.append(client)
            return client, response.json()["user"]["id"]

        def sibling(client):
            other = TestClient(app)
            other.cookies.update(client.cookies)
            other.headers.update(client.headers)
            clients.append(other)
            return other

        return SimpleNamespace(app=app, calls=calls, hooks=hooks, login=login, sibling=sibling)

    yield build
    for client in clients:
        client.close()


def make_task(client, project_id, *, task_type="questionnaire", refs=None):
    response = client.post(f"/api/projects/{project_id}/agent-tasks", json={
        "taskType": task_type, "requirements": {"goal": "Synthetic execution regression"},
        "inputArtifactRefs": refs or [],
    })
    assert response.status_code == 201, response.text
    task = response.json()
    return f'/api/projects/{project_id}/agent-tasks/{task["id"]}', task


def advance(client, path, revision):
    response = client.post(f"{path}/advance", json={"expectedRevision": revision})
    assert response.status_code == 200, response.text
    return response.json()


@contextmanager
def blocked_callback(harness, *, role=AgentRole.SURVEY, result=None):
    """Never leave a request blocked when an assertion fails."""
    entered, release = Event(), Event()

    def block(state):
        entered.set()
        assert release.wait(15), "test callback was not released"
        return result or AgentResult("Synthetic delayed output", ("synthetic:late:v1",))

    harness.hooks[role] = block
    with ThreadPoolExecutor(max_workers=2) as pool:
        try:
            yield pool, entered, release
        finally:
            release.set()


@pytest.mark.parametrize('publishing', [False, True])
def test_logout_during_team_lock_prevents_dispatch_or_publication(execution_harness, pg_engine, publishing):
    harness = execution_harness()
    client, uid = harness.login()
    other = harness.sibling(client)
    research, team = project(client)
    path, initial = make_task(client, research['id'])
    waiting, observing = Event(), Event()

    def detect_lock(conn, cursor, statement, parameters, context, executemany):
        if observing.is_set() and 'FROM teams' in statement and 'FOR UPDATE' in statement:
            waiting.set()

    event.listen(pg_engine, 'before_cursor_execute', detect_lock)
    try:
        with blocked_callback(harness) as (pool, entered, release):
            if publishing:
                pending = pool.submit(client.post, path + '/advance', json={'expectedRevision': 0})
                assert entered.wait(5)
            with pg_engine.begin() as hold:
                hold.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {'uid': uid})
                hold.execute(text('SELECT id FROM teams WHERE id=:id FOR UPDATE'), {'id': team})
                observing.set()
                if publishing:
                    release.set()
                else:
                    pending = pool.submit(client.post, path + '/advance', json={'expectedRevision': 0})
                assert waiting.wait(5)
                assert other.post('/api/auth/logout').status_code == 204
            response = pending.result(timeout=5)
            assert response.status_code == 401
            assert harness.calls == (['survey'] if publishing else [])
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {'uid': uid})
            receipt = connection.execute(text(
                'SELECT status FROM agent_task_executions WHERE task_id=:id'
            ), {'id': initial['id']}).scalar_one_or_none()
            assert receipt == ('discarded' if publishing else None)
            persisted = connection.execute(text(
                'SELECT revision, state FROM agent_tasks WHERE id=:id'
            ), {'id': initial['id']}).one()
            assert persisted.revision == (1 if publishing else 0)
            assert persisted.state['agent_outputs'] == {}
    finally:
        event.remove(pg_engine, 'before_cursor_execute', detect_lock)


def test_advance_runs_one_role_and_review_has_its_own_checkpoint(execution_harness):
    harness = execution_harness()
    client, _ = harness.login()
    research, _ = project(client)
    path, initial = make_task(client, research["id"])
    survey = advance(client, path, initial["revision"])
    assert harness.calls == ["survey"]
    assert survey["status"] == "ready"
    assert survey["state"]["revision"] == 1
    review = advance(client, path, survey["revision"])
    assert harness.calls == ["survey", "reviewer"]
    assert review["status"] == "needs_input"
    assert review["state"]["awaiting_approval"] == "approve_reviewer"
    assert review["state"]["revision"] == 2


def test_get_and_list_never_execute_a_role(execution_harness):
    harness = execution_harness()
    client, _ = harness.login()
    research, _ = project(client)
    path, initial = make_task(client, research["id"])
    for _ in range(3):
        assert client.get(path).json()["state"] == initial["state"]
        assert client.get(f'/api/projects/{research["id"]}/agent-tasks').status_code == 200
    assert harness.calls == []


def test_missing_configuration_and_missing_data_do_not_fake_execution(execution_harness):
    harness = execution_harness(configured=False)
    client, _ = harness.login()
    research, _ = project(client)
    path, _ = make_task(client, research["id"])
    stopped = advance(client, path, 0)
    assert stopped["status"] == "blocked"
    assert stopped["state"]["artifact_refs"] == []
    assert stopped["state"]["agent_outputs"] == {}
    assert harness.calls == []

    path, _ = make_task(client, research["id"], task_type="data_analysis")
    waiting = advance(client, path, 0)
    assert waiting["status"] == "needs_input"
    assert waiting["state"]["awaiting_approval"] == "upload_real_data"
    assert waiting["state"]["artifact_refs"] == []
    assert harness.calls == []


def test_callback_does_not_hold_project_or_task_database_locks(execution_harness, pg_engine):
    harness = execution_harness()
    client, user_id = harness.login()
    research, team_id = project(client)
    path, initial = make_task(client, research["id"])
    observed = []

    def inspect_committed_claim(state):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": user_id})
            # NOWAIT turns an accidentally retained request transaction into a
            # deterministic failure instead of a slow or deadlocked test.
            connection.execute(text("SELECT id FROM projects WHERE id=:id FOR UPDATE NOWAIT"),
                               {"id": research["id"]}).one()
            connection.execute(text("SELECT id FROM teams WHERE id=:id FOR UPDATE NOWAIT"),
                               {"id": team_id}).one()
            row = connection.execute(text("SELECT status,revision FROM agent_tasks "
                                          "WHERE id=:id FOR UPDATE NOWAIT"),
                                     {"id": initial["id"]}).mappings().one()
            observed.append(dict(row))
        return AgentResult("Synthetic inspected output")

    harness.hooks[AgentRole.SURVEY] = inspect_committed_claim
    completed = advance(client, path, 0)
    assert observed and observed[0]["status"] == "running"
    assert observed[0]["revision"] > 0
    assert completed["status"] == "ready"


def test_async_handler_is_awaited_without_running_a_second_role(execution_harness):
    harness = execution_harness()
    client, _ = harness.login()
    research, _ = project(client)
    path, _ = make_task(client, research["id"])
    reached = []

    async def actual_await(state):
        await asyncio.sleep(0)
        reached.append(state.task_id)
        return AgentResult("Synthetic asynchronous output", ("synthetic:async:v1",))

    harness.hooks[AgentRole.SURVEY] = actual_await
    completed = advance(client, path, 0)
    assert reached == [completed["id"]]
    assert harness.calls == ["survey"]
    assert completed["status"] == "ready"
    assert completed["state"]["artifact_refs"] == ["synthetic:async:v1"]


def test_foreign_task_reads_and_advance_remain_inaccessible(execution_harness, pg_engine):
    harness = execution_harness()
    owner, _ = harness.login()
    outsider, outsider_id = harness.login("b@example.test")
    research, _ = project(owner)
    path, initial = make_task(owner, research["id"])
    assert outsider.get(path).status_code == 404
    assert outsider.post(f"{path}/advance", json={"expectedRevision": 0}).status_code == 404
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": outsider_id})
        assert connection.execute(select(AgentTask.id).where(AgentTask.id == initial["id"])).all() == []
    assert harness.calls == []


def test_committed_receipt_is_visible_before_call_and_concurrent_replay_never_runs_again(
    execution_harness, pg_engine,
):
    harness = execution_harness()
    client, user_id = harness.login()
    observer = harness.sibling(client)
    research, _ = project(client)
    path, initial = make_task(client, research["id"])
    with blocked_callback(harness) as (pool, entered, release):
        pending = pool.submit(client.post, f"{path}/advance", json={"expectedRevision": 0})
        assert entered.wait(5), "callback never started"
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": user_id})
            rows = connection.execute(select(AgentTaskExecution.__table__).where(
                AgentTaskExecution.task_id == initial["id"],
            )).mappings().all()
            assert len(rows) == 1
            persisted = dict(rows[0])
            assert persisted["status"] == "running"
            assert persisted["base_revision"] == 0
            assert persisted["claimed_revision"] > 0
            assert persisted["role"] == "survey"
            assert persisted["created_by"] == user_id
            assert len(persisted["input_hash"]) == 64
        replay = advance(observer, path, 0)
        assert replay["execution"]["id"] == persisted["id"]
        assert replay["execution"]["status"] == "running"
        assert harness.calls == ["survey"]
        # A new expectedRevision cannot queue another role while the previous
        # callback is in flight, even though the durable claim changed revision.
        overlap = observer.post(f"{path}/advance", json={"expectedRevision": replay["revision"]})
        assert overlap.status_code == 409, overlap.text
        assert harness.calls == ["survey"]
        release.set()
        response = pending.result(timeout=5)
        assert response.status_code == 200, response.text
    finished = response.json()
    assert finished["execution"]["id"] == persisted["id"]
    assert finished["execution"]["status"] == "completed"
    assert finished["execution"]["finishedAt"]
    assert len(finished["execution"]["resultHash"]) == 64
    replay = advance(observer, path, 0)
    assert replay["execution"] == finished["execution"]
    assert harness.calls == ["survey"]
    history = observer.get(f"{path}/executions")
    assert history.status_code == 200, history.text
    assert history.json()["executions"] == [finished["execution"]]


def test_cancel_fences_late_callback_and_never_replays_it(execution_harness):
    harness = execution_harness()
    client, _ = harness.login()
    observer = harness.sibling(client)
    research, _ = project(client)
    path, _ = make_task(client, research["id"])
    with blocked_callback(harness) as (pool, entered, release):
        pending = pool.submit(client.post, f"{path}/advance", json={"expectedRevision": 0})
        assert entered.wait(5)
        running = observer.get(path).json()
        response = observer.post(f"{path}/cancel", json={"expectedRevision": running["revision"]})
        assert response.status_code == 200, response.text
        cancelled = response.json()
        assert cancelled["status"] == "blocked"
        assert cancelled["execution"]["status"] == "cancelled"
        release.set()
        late = pending.result(timeout=5)
        assert late.status_code == 200, late.text
    after = observer.get(path).json()
    assert after["state"] == cancelled["state"]
    assert after["revision"] == cancelled["revision"]
    assert after["execution"] == cancelled["execution"]
    assert after["state"]["artifact_refs"] == []
    assert advance(observer, path, 0)["execution"]["status"] == "cancelled"
    assert harness.calls == ["survey"]


def test_revoked_member_cannot_publish_a_late_result(execution_harness):
    harness = execution_harness()
    owner, _ = harness.login()
    editor, editor_id = harness.login("b@example.test")
    research, team = project(owner)
    assert owner.post(f"/api/teams/{team}/members", json={
        "email": "b@example.test", "role": "editor",
    }).status_code == 201
    path, _ = make_task(owner, research["id"])
    with blocked_callback(harness) as (pool, entered, release):
        pending = pool.submit(editor.post, f"{path}/advance", json={"expectedRevision": 0})
        assert entered.wait(5)
        assert owner.delete(f"/api/teams/{team}/members/{editor_id}").status_code == 204
        release.set()
        response = pending.result(timeout=5)
        assert response.status_code in (403, 404), response.text
    current = owner.get(path).json()
    assert current["state"]["artifact_refs"] == []
    assert current["state"]["agent_outputs"] == {}
    assert current["execution"]["status"] == "discarded"
    assert editor.get(f"{path}/executions").status_code == 404
    assert editor.post(f"{path}/advance", json={"expectedRevision": 0}).status_code == 404
    assert harness.calls == ["survey"]


def test_logout_during_callback_returns_no_model_result(execution_harness):
    harness = execution_harness()
    client, _ = harness.login()
    other_tab = harness.sibling(client)
    research, _ = project(client)
    path, _ = make_task(client, research["id"])
    with blocked_callback(harness) as (pool, entered, release):
        pending = pool.submit(client.post, f"{path}/advance", json={"expectedRevision": 0})
        assert entered.wait(5)
        assert other_tab.post("/api/auth/logout").status_code == 204
        release.set()
        response = pending.result(timeout=5)
        assert response.status_code == 401, response.text
    assert "Synthetic delayed output" not in response.text
    assert "synthetic:late:v1" not in response.text
    assert harness.calls == ["survey"]


@pytest.mark.parametrize("error,expected", [
    (ProviderFailure("provider_unavailable", unknown=False), "failed"),
    (ProviderFailure("provider_timeout", unknown=True), "outcome_unknown"),
    (RuntimeError("synthetic-sensitive-detail-must-not-leak"), "outcome_unknown"),
])
def test_uncertain_callback_failure_is_not_retried_or_reported_as_success(
    execution_harness, error, expected,
):
    harness = execution_harness()
    client, _ = harness.login()
    research, _ = project(client)
    path, _ = make_task(client, research["id"])

    def fail(state):
        raise error

    harness.hooks[AgentRole.SURVEY] = fail
    stopped = advance(client, path, 0)
    assert stopped["status"] in ("blocked", "failed")
    assert stopped["execution"]["status"] == expected
    assert stopped["state"]["artifact_refs"] == []
    assert stopped["state"]["agent_outputs"] == {}
    assert stopped["execution"]["resultHash"] is None
    replay = advance(client, path, 0)
    assert replay["execution"] == stopped["execution"]
    assert harness.calls == ["survey"]
    assert "synthetic-sensitive-detail-must-not-leak" not in str(replay)


def test_execution_history_rls_and_readonly_members_cannot_cancel(execution_harness, pg_engine):
    harness = execution_harness()
    owner, owner_id = harness.login()
    reader, reader_id = harness.login("b@example.test")
    outsider, outsider_id = harness.login("c@example.test")
    research, team = project(owner)
    assert owner.post(f"/api/teams/{team}/members", json={
        "email": "b@example.test", "role": "viewer",
    }).status_code == 201
    path, initial = make_task(owner, research["id"])
    done = advance(owner, path, 0)
    assert reader.get(f"{path}/executions").status_code == 200
    assert outsider.get(f"{path}/executions").status_code == 404
    assert reader.post(f"{path}/cancel", json={"expectedRevision": done["revision"]}).status_code == 403
    assert outsider.post(f"{path}/advance", json={"expectedRevision": 0}).status_code == 404
    for user_id, visible in ((owner_id, 1), (reader_id, 1), (outsider_id, 0)):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": user_id})
            rows = connection.execute(select(AgentTaskExecution.id).where(
                AgentTaskExecution.task_id == initial["id"],
            )).all()
            assert len(rows) == visible
            if user_id != owner_id:
                result = connection.execute(text("UPDATE agent_task_executions SET status='cancelled' "
                                                 "WHERE task_id=:task"), {"task": initial["id"]})
                assert result.rowcount == 0
    assert harness.calls == ["survey"]


def test_expired_call_survives_new_application_without_replay_and_late_result_is_ignored(
    execution_harness, pg_engine, monkeypatch,
):
    harness = execution_harness()
    client, user_id = harness.login()
    observer = harness.sibling(client)
    research, _ = project(client)
    path, initial = make_task(client, research["id"])
    with blocked_callback(harness) as (pool, entered, release):
        pending = pool.submit(client.post, f"{path}/advance", json={"expectedRevision": 0})
        assert entered.wait(5)
        running = observer.get(path).json()
        future_time = execution_service.now() + timedelta(
            seconds=execution_service.EXECUTION_LEASE_SECONDS + 1,
        )
        monkeypatch.setattr(execution_service, "now", lambda: future_time)
        # Reading produces an honest derived state but has no authority to
        # rewrite a running task on behalf of a viewer.
        expired = observer.get(path).json()
        assert expired["status"] == "blocked"
        assert expired["execution"]["status"] == "outcome_unknown"
        assert expired["revision"] == running["revision"]
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": user_id})
            task_status = connection.scalar(select(AgentTask.status).where(AgentTask.id == initial["id"]))
            receipt_status = connection.scalar(select(AgentTaskExecution.status).where(
                AgentTaskExecution.task_id == initial["id"],
            ))
            assert task_status == receipt_status == "running"
        # A newly assembled app has no memory of the old invocation or its
        # handler. The stored claim alone must prevent resending that work.
        restarted = execution_harness(configured=False)
        recovered_client = restarted.sibling(client)
        recovered = advance(recovered_client, path, 0)
        assert recovered["status"] == "blocked"
        assert recovered["execution"]["id"] == running["execution"]["id"]
        assert recovered["execution"]["status"] == "outcome_unknown"
        assert recovered["execution"]["resultHash"] is None
        assert recovered["execution"]["finishedAt"]
        assert restarted.calls == []
        release.set()
        response = pending.result(timeout=5)
        assert response.status_code == 200, response.text
    current = recovered_client.get(path).json()
    assert current["execution"] == recovered["execution"]
    assert current["state"] == recovered["state"]
    assert current["state"]["artifact_refs"] == []
    assert current["state"]["agent_outputs"] == {}
    assert harness.calls == ["survey"]


def test_http_execution_timeout_preserves_unknown_receipt_without_retries(
    execution_harness, monkeypatch,
):
    harness = execution_harness()
    client, _ = harness.login()
    research, _ = project(client)
    path, _ = make_task(client, research["id"])
    entered, cancelled = [], []

    async def slow(state):
        entered.append(state.task_id)
        try:
            await asyncio.sleep(30)
        finally:
            cancelled.append(state.task_id)
        return AgentResult("Must never be published")

    harness.hooks[AgentRole.SURVEY] = slow
    monkeypatch.setattr(execution_service, "EXECUTION_TIMEOUT_SECONDS", 0.05)
    failed = advance(client, path, 0)
    assert entered == cancelled == [failed["id"]]
    assert failed["status"] == "blocked"
    assert failed["execution"]["status"] == "outcome_unknown"
    assert failed["execution"]["errorCode"] == "execution_timeout"
    assert failed["execution"]["resultHash"] is None
    assert failed["state"]["artifact_refs"] == []
    assert advance(client, path, 0)["execution"] == failed["execution"]
    assert harness.calls == ["survey"]


def test_demoted_editor_can_read_receipt_but_cannot_publish_or_replay(execution_harness):
    harness = execution_harness()
    owner, _ = harness.login()
    editor, _ = harness.login("b@example.test")
    research, team = project(owner)
    assert owner.post(f"/api/teams/{team}/members", json={
        "email": "b@example.test", "role": "editor",
    }).status_code == 201
    path, _ = make_task(owner, research["id"])
    with blocked_callback(harness) as (pool, entered, release):
        pending = pool.submit(editor.post, f"{path}/advance", json={"expectedRevision": 0})
        assert entered.wait(5)
        # Team service exposes role replacement via the member-add operation.
        response = owner.post(f"/api/teams/{team}/members", json={
            "email": "b@example.test", "role": "viewer",
        })
        assert response.status_code == 201, response.text
        release.set()
        response = pending.result(timeout=5)
        assert response.status_code == 403, response.text
    visible = editor.get(path)
    assert visible.status_code == 200, visible.text
    assert visible.json()["state"]["artifact_refs"] == []
    assert visible.json()["execution"]["status"] == "discarded"
    assert editor.post(f"{path}/advance", json={"expectedRevision": 0}).status_code == 403
    assert owner.get(path).json()["state"]["artifact_refs"] == []
    assert harness.calls == ["survey"]


@pytest.mark.parametrize("assignment,value,expected_error", [
    ("id=:value", "new-id", "execution identity is immutable"),
    ("input_hash=:value", "0" * 64, "execution identity is immutable"),
    ("role=:value", "research", "execution identity is immutable"),
    ("base_revision=base_revision+1", None, "execution identity is immutable"),
    ("lease_expires_at=lease_expires_at + interval '1 second'", None, "execution identity is immutable"),
    ("status=:value", "running", "terminal execution is immutable"),
    ("result_hash=:value", "0" * 64, "terminal execution is immutable"),
])
def test_execution_identity_and_terminal_receipt_are_immutable_even_for_owner(
    execution_harness, pg_engine, assignment, value, expected_error,
):
    harness = execution_harness()
    client, user_id = harness.login()
    research, _ = project(client)
    path, _ = make_task(client, research["id"])
    done = advance(client, path, 0)
    original = done["execution"]
    if value == "new-id":
        value = str(uuid4())
    with pytest.raises(DBAPIError, match=expected_error):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": user_id})
            connection.execute(text(f"UPDATE agent_task_executions SET {assignment} WHERE id=:id"),
                               {"id": original["id"], "value": value})
    assert client.get(path).json()["execution"] == original
    assert harness.calls == ["survey"]
