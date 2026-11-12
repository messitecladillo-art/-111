"""Personal model selections on actual task APIs, migrations and PostgreSQL RLS.

Handlers and service credentials are conspicuously synthetic; no provider call
or background execution is claimed by these integration tests.
"""
from copy import deepcopy

import pytest

from tests.test_agent_tasks_postgres import task_harness, step
from tests.test_postgres import idem, project, service_input


pytestmark = pytest.mark.postgres


def configured(client, **extra):
    response = client.post('/api/services', json=service_input(
        capabilities=['research', 'questionnaire', 'report'], **extra))
    assert response.status_code == 201, response.text
    return response.json()


def create(client, project_id, model=None, *, task_type='topic_design', **extra):
    body = {'taskType': task_type, 'requirements': {'goal': 'Synthetic routing test'}, **extra}
    if model is not None:
        body['modelPlan'] = {'schemaVersion': 1, 'default': {
            'serviceId': model['id'], 'revision': model['revision'],
        }}
    response = client.post(f'/api/projects/{project_id}/agent-tasks', json=body)
    assert response.status_code == 201, response.text
    task = response.json()
    return f'/api/projects/{project_id}/agent-tasks/{task["id"]}', task


def test_frozen_model_plan_roundtrips_without_configuration_or_secret_leak(task_harness):
    login, calls = task_harness
    owner, owner_id = login('a@example.test')
    p, _ = project(owner)
    model = configured(owner)
    path, task = create(owner, p['id'], model)
    bindings = task['state']['model_bindings']
    assert bindings['ownerId'] == owner_id
    assert len(bindings['steps']) == 6
    assert bindings['steps']['research.review_materials'] == {
        'serviceId': model['id'], 'revision': 1, 'capability': 'research',
    }
    assert bindings['steps']['reviewer.review_deliverable']['capability'] == 'report'
    response = owner.get(path)
    assert response.status_code == 200
    assert response.json()['state']['model_bindings'] == bindings
    for forbidden in ('apiKey', 'ciphertext', 'baseUrl', 'synthetic-private-model-key', 'fixture-model'):
        assert forbidden not in response.text
    advanced = step(owner, path, 'advance', task['revision'])
    assert advanced['state']['model_bindings'] == bindings
    assert calls == ['research']


@pytest.mark.parametrize('mutation', ['revision', 'deleted'])
def test_stale_or_removed_selection_cannot_claim_a_new_execution(task_harness, mutation):
    login, calls = task_harness
    owner, _ = login('a@example.test')
    p, _ = project(owner)
    model = configured(owner)
    path, task = create(owner, p['id'], model)
    if mutation == 'deleted':
        changed = owner.request('DELETE', '/api/services/' + model['id'], json={
            'expectedRevision': 1, 'idempotencyKey': idem(),
        })
        assert changed.status_code == 204, changed.text
    else:
        changed = owner.put('/api/services/' + model['id'], json=service_input(
            capabilities=['research', 'questionnaire', 'report'], expectedRevision=1, label='Changed fixture service'))
        assert changed.status_code == 200, changed.text
    response = owner.post(path + '/advance', json={'expectedRevision': task['revision']})
    assert response.status_code == 409, response.text
    assert response.json()['error']['code'] == (
        'model_service_unavailable' if mutation == 'deleted' else 'model_service_revision_conflict')
    current = owner.get(path).json()
    assert current['revision'] == task['revision']
    assert current['state'] == task['state']
    assert owner.get(path + '/executions').json() == {'executions': []}
    assert calls == []


def test_personal_bindings_block_teammate_dispatch_but_preserve_read_and_approval(task_harness):
    login, calls = task_harness
    owner, _ = login('a@example.test')
    editor, _ = login('b@example.test')
    p, team = project(owner)
    assert owner.post(f'/api/teams/{team}/members', json={
        'email': 'b@example.test', 'role': 'editor',
    }).status_code == 201
    model = configured(owner)
    path, task = create(owner, p['id'], model)
    assert editor.get(path).status_code == 200
    denied = editor.post(path + '/advance', json={'expectedRevision': task['revision']})
    assert denied.status_code == 403, denied.text
    assert denied.json()['error']['code'] == 'model_bindings_owner_mismatch'
    assert calls == []
    research = step(owner, path, 'advance', task['revision'])
    review = step(owner, path, 'advance', research['revision'])
    assert review['state']['awaiting_approval'] == 'approve_reviewer'
    approved = step(editor, path, 'approval', review['revision'], approved=True)
    assert approved['state']['model_bindings'] == task['state']['model_bindings']
    assert calls == ['research', 'reviewer']


def test_completed_receipt_replay_remains_readable_after_service_removal(task_harness):
    login, calls = task_harness
    owner, _ = login('a@example.test')
    p, _ = project(owner)
    model = configured(owner)
    path, task = create(owner, p['id'], model)
    first = step(owner, path, 'advance', task['revision'])
    assert owner.request('DELETE', '/api/services/' + model['id'], json={
        'expectedRevision': 1, 'idempotencyKey': idem(),
    }).status_code == 204
    replay = step(owner, path, 'advance', task['revision'])
    assert replay['execution'] == first['execution']
    assert replay['revision'] == first['revision']
    assert calls == ['research']
    blocked = owner.post(path + '/advance', json={'expectedRevision': first['revision']})
    assert blocked.status_code == 409
    assert calls == ['research']
    assert len(owner.get(path + '/executions').json()['executions']) == 1


def test_foreign_service_and_forged_snapshot_are_not_accepted_from_http(task_harness):
    login, calls = task_harness
    owner, _ = login('a@example.test')
    other, _ = login('b@example.test')
    p, _ = project(owner)
    model = configured(other)
    endpoint = f'/api/projects/{p["id"]}/agent-tasks'
    rejected = owner.post(endpoint, json={
        'taskType': 'topic_design', 'requirements': {},
        'modelPlan': {'schemaVersion': 1, 'default': {'serviceId': model['id'], 'revision': 1}},
    })
    assert rejected.status_code == 409, rejected.text
    assert rejected.json()['error']['code'] == 'model_service_unavailable'
    for value in (None, {'schemaVersion': 1, 'ownerId': 'forged', 'steps': {}}):
        bad = owner.post(endpoint, json={'taskType': 'topic_design', 'requirements': {}, 'modelPlan': value})
        assert bad.status_code == 422, bad.text
    assert owner.get(endpoint).json() == {'tasks': []}
    assert calls == []


def test_legacy_tasks_do_not_acquire_null_metadata_or_lose_teammate_dispatch(task_harness):
    login, calls = task_harness
    owner, _ = login('a@example.test')
    editor, _ = login('b@example.test')
    p, team = project(owner)
    owner.post(f'/api/teams/{team}/members', json={'email': 'b@example.test', 'role': 'editor'})
    path, task = create(owner, p['id'])
    assert 'model_bindings' not in task['state']
    from multi_agent.workflow import WorkflowState
    assert WorkflowState.from_dict(deepcopy(task['state'])).to_dict() == task['state']
    result = step(editor, path, 'advance', task['revision'])
    assert 'model_bindings' not in result['state']
    assert calls == ['research']
