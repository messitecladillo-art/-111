"""Stage grants and creation reconciliation on real migrations/RLS, synthetic model I/O."""
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import uuid4

import pytest

from shared.errors import ProviderFailure
from tests.test_workflow_models_postgres import model_harness, create

pytestmark = pytest.mark.postgres


def grant(client, path, revision):
    preview = client.get(path + '/model-phase-preview')
    assert preview.status_code == 200, preview.text
    view = preview.json()
    body = {'expectedRevision': revision, 'consent': True, 'phaseHash': view['phaseHash'],
            'maxCalls': view['maxCalls'], 'idempotencyKey': str(uuid4())}
    response = client.post(path + '/model-grants', json=body)
    assert response.status_code == 201, response.text
    return response.json(), body


def step(client, path, revision, selected):
    return client.post(path + '/advance', json={'expectedRevision': revision, 'modelGrantId': selected['id']})


def test_one_grant_executes_only_producer_then_reviewer_and_preserves_approval(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, task, _ = create(owner, model)
    selected, body = grant(owner, path, task['revision'])
    assert selected['roles'] == ['research', 'reviewer'] and selected['maxCalls'] == 6
    producer = step(owner, path, 0, selected)
    assert producer.status_code == 200, producer.text
    assert producer.json()['status'] == 'ready'
    assert owner.get(path + '/model-grants').json()['grants'][0]['usedCalls'] == 3
    review = step(owner, path, producer.json()['revision'], selected)
    assert review.status_code == 200, review.text
    assert review.json()['status'] == 'needs_input'
    actual = owner.get(path + '/model-grants').json()['grants'][0]
    assert actual['usedCalls'] == 6 and actual['status'] == 'stopped'
    assert all(call['grantId'] == selected['id'] for call in owner.get(path + '/model-calls').json()['calls'])
    assert step(owner, path, 0, selected).status_code == 200
    assert len(provider.calls) == 6
    replay = owner.post(path + '/model-grants', json=body)
    assert replay.status_code == 201 and replay.json()['id'] == selected['id'] and replay.json()['usedCalls'] == 6


def test_review_revision_cannot_reuse_original_grant_for_another_draw(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, _ = grant(owner, path, 0)
    producer = step(owner, path, 0, selected).json()

    def revise(name, value, key):
        if name == 'review_deliverable':
            value['deliverable'].update(decision='revise', revision_request='Synthetic review: narrow the target population.')
        return json.dumps(value)

    provider.transform = revise
    reviewed = step(owner, path, producer['revision'], selected)
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()['status'] == 'ready' and reviewed.json()['state']['revision'] == 0
    assert owner.get(path + '/model-grants').json()['grants'][0]['status'] == 'stopped'
    denied = step(owner, path, reviewed.json()['revision'], selected)
    assert denied.status_code == 409 and len(provider.calls) == 6
    fresh, _ = grant(owner, path, reviewed.json()['revision'])
    assert fresh['id'] != selected['id'] and fresh['usedCalls'] == 0


def test_unknown_result_stops_grant_without_restoring_consumed_budget(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, _ = grant(owner, path, 0)
    provider.hook = lambda name: (_ for _ in ()).throw(ProviderFailure('synthetic_timeout', unknown=True))
    outcome = step(owner, path, 0, selected)
    assert outcome.status_code == 200, outcome.text
    assert outcome.json()['execution']['status'] == 'outcome_unknown'
    record = owner.get(path + '/model-grants').json()['grants'][0]
    assert record['usedCalls'] == 1 and record['status'] == 'stopped'
    assert step(owner, path, 0, selected).status_code == 200 and len(provider.calls) == 1


def test_cancelled_parent_stops_grant_and_late_model_cannot_consume_more(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, _ = grant(owner, path, 0)
    entered, release = Event(), Event()

    def wait(name):
        entered.set()
        assert release.wait(5)

    provider.hook = wait
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(step, owner, path, 0, selected)
        try:
            assert entered.wait(5)
            active = owner.get(path).json()
            assert owner.post(path + '/cancel', json={'expectedRevision': active['revision']}).status_code == 200
        finally:
            release.set()
        assert future.result(timeout=5).status_code == 200
    state = owner.get(path + '/model-grants').json()['grants'][0]
    assert state['status'] == 'stopped' and state['usedCalls'] == 1 and len(provider.calls) == 1


def test_grant_idempotency_conflict_active_scope_and_other_task_are_rejected(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, body = grant(owner, path, 0)
    assert owner.post(path + '/model-grants', json={**body, 'maxCalls': 3}).status_code == 409
    assert owner.post(path + '/model-grants', json={**body, 'idempotencyKey': str(uuid4())}).status_code == 409
    other, _, _ = create(owner, model)
    assert step(owner, other, 0, selected).status_code == 409
    assert provider.calls == []


def test_stale_phase_and_missing_consent_do_not_create_a_grant(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    phase = owner.get(path + '/model-phase-preview').json()
    for fields in ({'consent': False}, {'phaseHash': 'old'}, {'maxCalls': True}, {'expectedRevision': 9}):
        response = owner.post(path + '/model-grants', json={'expectedRevision': 0, 'consent': True,
            'phaseHash': phase['phaseHash'], 'maxCalls': 6, 'idempotencyKey': str(uuid4()), **fields})
        assert response.status_code in (409, 422), response.text
    assert owner.get(path + '/model-grants').json() == {'grants': []} and provider.calls == []


def test_task_creation_idempotency_can_reconcile_without_creating_another_task(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    key = str(uuid4())
    path, task, _ = create(owner, model, idempotencyKey=key)
    project_id = task['projectId']
    body = {'taskType': 'topic_design', 'requirements': {'goal': 'Synthetic local-food research'},
        'modelPlan': {'schemaVersion': 1, 'default': {'serviceId': model['id'], 'revision': 1}}, 'idempotencyKey': key}
    endpoint = f'/api/projects/{project_id}/agent-tasks'
    replay = owner.post(endpoint, json=body)
    assert replay.status_code == 201 and replay.json()['id'] == task['id']
    recovered = owner.get(f'/api/projects/{project_id}/agent-task-creations/{key}')
    assert recovered.status_code == 200 and recovered.json()['id'] == task['id']
    assert owner.post(endpoint, json={**body, 'requirements': {'goal': 'changed'}}).status_code == 409
    assert len(owner.get(endpoint).json()['tasks']) == 1
    assert provider.calls == []


def test_teammate_can_read_task_but_not_private_grant_or_create_locator(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    editor, _, _ = login('b@example.test')
    key = str(uuid4())
    path, task, team = create(owner, model, idempotencyKey=key)
    selected, _ = grant(owner, path, 0)
    assert owner.post(f'/api/teams/{team}/members', json={'email': 'b@example.test', 'role': 'editor'}).status_code == 201
    assert editor.get(path).status_code == 200
    assert editor.get(path + '/model-grants').status_code == 403
    assert editor.get(f'/api/projects/{task["projectId"]}/agent-task-creations/{key}').status_code == 404
    assert step(editor, path, 0, selected).status_code in (403, 409) and provider.calls == []


def test_primary_team_form_payload_runs_research_and_survey_then_waits_for_real_data(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, task, _ = create(owner, model, taskType='full_research',
        requirements={'goal': 'Synthetic Hubei specialty research', 'geography': '湖北省 · 武汉市'},
        constraints={'notes': '学校：合成测试学校；可用时间：30天；经费：1000元'})
    assert task['state']['context'] == {}

    def survey(name, value, key):
        if name == 'design_sampling':
            return json.dumps({'summary': 'Synthetic proposed survey, not fieldwork.', 'deliverable': {
                'variables': [{'name': 'purchase_situation', 'status': 'proposed'}],
                'questionnaire': {'title': 'Synthetic pilot questionnaire', 'sections': [{'questions': [{'id': 'Q1', 'text': 'Which purchase situation?', 'type': 'single'}]}]},
                'sampling': {'status': 'proposed'}, 'pilot_plan': {'status': 'planned'}, 'privacy_and_ethics': []}})
        return json.dumps(value)

    provider.transform = survey
    selected, _ = grant(owner, path, 0)
    research = step(owner, path, 0, selected).json()
    reviewed = step(owner, path, research['revision'], selected).json()
    approved = owner.post(path + '/approval', json={'expectedRevision': reviewed['revision'], 'approved': True})
    assert approved.status_code == 200, approved.text
    selected, _ = grant(owner, path, approved.json()['revision'])
    survey = step(owner, path, approved.json()['revision'], selected).json()
    reviewed = step(owner, path, survey['revision'], selected).json()
    assert reviewed['status'] == 'needs_input' and reviewed['state']['revision'] == 4
    approved = owner.post(path + '/approval', json={'expectedRevision': reviewed['revision'], 'approved': True})
    gate = owner.post(path + '/advance', json={'expectedRevision': approved.json()['revision']})
    assert gate.status_code == 200, gate.text
    assert gate.json()['status'] == 'needs_input' and gate.json()['state']['awaiting_approval'] == 'upload_real_data'
    assert set(gate.json()['state']['agent_outputs']) == {'research', 'survey', 'reviewer'}
    assert len(provider.calls) == 12


def test_running_grant_creation_replay_reports_same_effective_state_as_reads(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    selected, body = grant(owner, path, 0)
    entered, release = Event(), Event()
    provider.hook = lambda name: (entered.set(), release.wait(5))
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(step, owner, path, 0, selected)
        try:
            assert entered.wait(5)
            replay = owner.post(path + '/model-grants', json=body)
            read = owner.get(path + '/model-grants')
            assert replay.status_code == 201 and read.status_code == 200
            assert replay.json() == read.json()['grants'][0]
            assert replay.json()['status'] == 'active'
        finally:
            release.set()
        assert pending.result(timeout=5).status_code == 200
