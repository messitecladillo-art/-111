"""Independent stop/race challenges using real PostgreSQL and synthetic model calls."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event

import pytest

from tests.test_workflow_grants_postgres import grant, step
from tests.test_workflow_models_postgres import create, model_harness

pytestmark = pytest.mark.postgres


def revoke(client, path, selected):
    response = client.post(path + '/model-grants/' + selected['id'] + '/revoke', json={})
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'stopped'
    assert response.json()['stopReason'] == 'grant_revoked'
    return response.json()


def test_ready_grant_can_be_persistently_revoked_before_any_call(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, task, _ = create(owner, model)
    selected, body = grant(owner, path, task['revision'])
    first = revoke(owner, path, selected)
    assert revoke(owner, path, selected) == first
    assert owner.get(path).json()['revision'] == task['revision']
    assert owner.get(path + '/model-grants').json()['grants'][0] == first
    assert step(owner, path, task['revision'], selected).status_code == 409
    replay = owner.post(path + '/model-grants', json=body)
    assert replay.status_code == 201 and replay.json()['stopReason'] == 'grant_revoked'
    assert provider.calls == [] and first['usedCalls'] == 0


def test_running_grant_revoke_discards_late_result_without_separate_task_cancel(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, _ = grant(owner, path, 0)
    entered, release = Event(), Event()

    def hold(_step):
        entered.set()
        assert release.wait(5)

    provider.hook = hold
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(step, owner, path, 0, selected)
        try:
            assert entered.wait(5)
            stopped = revoke(owner, path, selected)
            assert stopped['usedCalls'] == 1
        finally:
            release.set()
        response = pending.result(timeout=5)
    assert response.status_code == 200, response.text
    current = owner.get(path).json()
    assert current['status'] == 'blocked'
    assert current['execution']['status'] == 'discarded'
    assert current['state']['agent_outputs'] == {}
    calls = owner.get(path + '/model-calls').json()['calls']
    assert len(calls) == 1 and calls[0]['status'] == 'discarded'
    assert len(provider.calls) == 1


def test_revoke_after_last_call_receipt_before_parent_publish_blocks_all_output(model_harness, monkeypatch):
    import application.services.workflow_models as models

    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, _ = grant(owner, path, 0)
    ready_to_publish, release = Event(), Event()
    original = models.model_handler

    def pause_after_completed_role(role, invoke):
        handler = original(role, invoke)

        def run(state):
            result = handler(state)
            # All model call receipts are committed here; DurableTaskExecution
            # has not yet reacquired its task/parent publication locks.
            ready_to_publish.set()
            assert release.wait(5)
            return result

        return run

    monkeypatch.setattr(models, 'model_handler', pause_after_completed_role)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(step, owner, path, 0, selected)
        try:
            assert ready_to_publish.wait(5)
            calls = owner.get(path + '/model-calls').json()['calls']
            assert len(calls) == 3 and all(item['status'] == 'completed' for item in calls)
            assert revoke(owner, path, selected)['usedCalls'] == 3
        finally:
            release.set()
        response = pending.result(timeout=5)
    assert response.status_code == 200, response.text
    current = owner.get(path).json()
    assert current['status'] == 'blocked'
    assert current['execution']['status'] == 'discarded'
    assert current['execution']['errorCode'] == 'execution_authorization_changed'
    assert current['execution']['resultHash'] is None
    assert current['state']['agent_outputs'] == {}
    assert len(provider.calls) == 3
    assert all(item['status'] == 'completed' for item in owner.get(path + '/model-calls').json()['calls'])


def test_expired_parent_lease_truthfully_stops_grant_before_any_recovery_write(model_harness, monkeypatch):
    import application.services.agent_task_execution as execution

    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, _ = grant(owner, path, 0)
    entered, release = Event(), Event()
    real_now = execution.now

    def hold(_step):
        entered.set()
        assert release.wait(5)

    provider.hook = hold
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(step, owner, path, 0, selected)
        try:
            assert entered.wait(5)
            monkeypatch.setattr(execution, 'now', lambda: real_now() + timedelta(minutes=3))
            stopped = owner.get(path + '/model-grants').json()['grants'][0]
            assert stopped['status'] == 'stopped'
            assert stopped['stopReason'] == 'execution_requires_reconciliation'
            assert stopped['usedCalls'] == 1
            current = owner.get(path).json()
            assert current['status'] == 'blocked' and current['execution']['status'] == 'outcome_unknown'
            # GET only derived the expired view; it did not make another call.
            assert len(provider.calls) == 1
        finally:
            release.set()
        response = pending.result(timeout=5)
    assert response.status_code == 200, response.text
    assert owner.get(path).json()['state']['agent_outputs'] == {}
    assert len(provider.calls) == 1


def test_sixth_reservation_blocks_a_seventh_dispatch_and_replay_does_not_debit(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, _ = grant(owner, path, 0)
    producer = step(owner, path, 0, selected)
    assert producer.status_code == 200, producer.text
    entered, release = Event(), Event()

    def hold_last(name):
        if name == 'review_deliverable':
            entered.set()
            assert release.wait(5)

    provider.hook = hold_last
    base_revision = producer.json()['revision']
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(step, owner, path, base_revision, selected)
        try:
            assert entered.wait(5)
            active = owner.get(path).json()
            budget = owner.get(path + '/model-grants').json()['grants'][0]
            assert budget['usedCalls'] == 6 and budget['status'] == 'exhausted'
            assert step(owner, path, active['revision'], selected).status_code == 409
            duplicate = step(owner, path, base_revision, selected)
            assert duplicate.status_code == 200 and duplicate.json()['execution']['status'] == 'running'
            assert owner.get(path + '/model-grants').json()['grants'][0]['usedCalls'] == 6
            assert len(provider.calls) == 6
        finally:
            release.set()
        response = pending.result(timeout=5)
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'needs_input'
    assert response.json()['execution']['status'] == 'completed'
    assert owner.get(path + '/model-grants').json()['grants'][0]['usedCalls'] == 6
    assert len(provider.calls) == 6


def test_editor_cannot_revoke_another_accounts_personal_grant(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    editor, _, _ = login('b@example.test')
    path, _, team = create(owner, model)
    selected, _ = grant(owner, path, 0)
    assert owner.post(f'/api/teams/{team}/members', json={'email': 'b@example.test', 'role': 'editor'}).status_code == 201
    response = editor.post(path + '/model-grants/' + selected['id'] + '/revoke', json={})
    assert response.status_code in (403, 404)
    assert owner.get(path + '/model-grants').json()['grants'][0]['status'] == 'active'
    assert provider.calls == []
