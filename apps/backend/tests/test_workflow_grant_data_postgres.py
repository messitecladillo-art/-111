"""Data phase grants bind real PostgreSQL survey snapshots; model I/O is synthetic."""
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from application.workflow_data_tools import TOOL_VERSION, SurveyDataTools
from shared.contracts import fingerprint
from tests.test_postgres import project
from tests.test_surveys_postgres import publish
from tests.test_workflow_grants_postgres import step
from tests.test_workflow_models_postgres import model_harness

pytestmark = pytest.mark.postgres

PRIVATE_TEXT = 'synthetic-private-data-grant-open-answer'
DATA_FIELDS = ('dataTool', 'datasets', 'dataDisclosure')


def submit(app, settings, release, answers):
    with TestClient(app, headers={'origin': settings.allowed_origins[0]}) as public:
        response = public.post(f'/api/surveys/{release["token"]}/responses',
            json={'idempotencyKey': str(uuid4()), 'answers': answers})
    assert response.status_code == 201, response.text
    return response.json()


def collected_task(model_harness, settings):
    app, login, provider = model_harness
    owner, model, _ = login()
    p, _ = project(owner)
    release, _ = publish(owner, p)
    receipts = [submit(app, settings, release, answers) for answers in (
        {'choice': 'yes', 'score': 4, 'text': PRIVATE_TEXT},
        {'choice': 'yes', 'score': 2},
        {'choice': 'no'},
    )]
    response = owner.post(f'/api/projects/{p["id"]}/agent-tasks', json={
        'taskType': 'data_analysis', 'requirements': {'goal': 'Synthetic grant-bound analysis'},
        'inputArtifactRefs': [f'survey-release:{release["id"]}'],
        'modelPlan': {'schemaVersion': 1,
            'default': {'serviceId': model['id'], 'revision': model['revision']}},
    })
    assert response.status_code == 201, response.text
    task = response.json()
    path = f'/api/projects/{p["id"]}/agent-tasks/{task["id"]}'
    return app, owner, provider, release, receipts, path, task


def authorize(owner, path, revision):
    response = owner.get(path + '/model-phase-preview')
    assert response.status_code == 200, response.text
    preview = response.json()
    body = {'expectedRevision': revision, 'consent': True, 'phaseHash': preview['phaseHash'],
        'maxCalls': preview['maxCalls'], 'idempotencyKey': str(uuid4())}
    created = owner.post(path + '/model-grants', json=body)
    assert created.status_code == 201, created.text
    return preview, created.json(), body


def assert_no_dispatch(owner, path, provider, selected, revision=0):
    assert provider.calls == []
    assert owner.get(path + '/model-calls').json() == {'calls': []}
    task = owner.get(path).json()
    assert task['revision'] == revision and task['state']['agent_outputs'] == {}
    assert 'execution' not in task
    grants = owner.get(path + '/model-grants').json()['grants']
    assert len(grants) == 1 and grants[0]['id'] == selected['id']
    assert grants[0]['usedCalls'] == 0


def test_data_phase_preview_and_grant_preserve_exact_disclosure_snapshot(model_harness, settings):
    _, owner, provider, release, _, path, task = collected_task(model_harness, settings)
    single = owner.get(path + '/model-preview').json()
    preview, selected, body = authorize(owner, path, task['revision'])
    assert preview['roles'] == ['data', 'reviewer'] and preview['maxCalls'] == 6
    assert preview['available'] is True and preview['missingTools'] == []
    assert preview['dataTool'] == TOOL_VERSION
    assert preview['dataDisclosure'] == 'aggregate_statistics_only_no_rows_no_open_text'
    dataset = preview['datasets'][0]
    assert (dataset['ref'], dataset['rowCount'], dataset['classification']) == (
        f'survey-release:{release["id"]}', 3, 'synthetic')
    assert len(dataset['sha256']) == 64
    assert preview['phaseHash'] == fingerprint({key: value for key, value in preview.items() if key != 'phaseHash'})
    listed = owner.get(path + '/model-grants').json()['grants'][0]
    replay = owner.post(path + '/model-grants', json=body)
    assert replay.status_code == 201, replay.text
    assert replay.json()['id'] == selected['id']
    for field in DATA_FIELDS:
        assert single[field] == preview[field] == selected[field] == listed[field] == replay.json()[field]
    assert PRIVATE_TEXT not in json.dumps([single, preview, selected, listed, replay.json()])
    assert_no_dispatch(owner, path, provider, selected)


def test_new_collected_answer_after_grant_rejects_before_any_fee(model_harness, settings):
    app, owner, provider, release, _, path, task = collected_task(model_harness, settings)
    preview, selected, _ = authorize(owner, path, task['revision'])
    submit(app, settings, release, {'choice': 'yes', 'score': 5})
    current = owner.get(path + '/model-phase-preview').json()
    assert current['datasets'][0]['rowCount'] == 4
    assert current['datasets'][0]['sha256'] != preview['datasets'][0]['sha256']
    assert current['phaseHash'] != preview['phaseHash']
    denied = step(owner, path, task['revision'], selected)
    assert denied.status_code == 409, denied.text
    assert denied.json()['error']['code'] == 'model_dataset_changed'
    assert_no_dispatch(owner, path, provider, selected)


@pytest.mark.parametrize('field', ['dataTool', 'dataDisclosure'])
def test_changed_data_policy_after_grant_rejects_before_any_fee(model_harness, settings, monkeypatch, field):
    import application.services.workflow_models as models

    _, owner, provider, _, _, path, task = collected_task(model_harness, settings)
    preview, selected, _ = authorize(owner, path, task['revision'])
    original = models.WorkflowModels.preview

    def changed(self, **kwargs):
        value = original(self, **kwargs)
        if value['role'] == 'data':
            value[field] = preview[field] + '-changed'
            value['previewHash'] = fingerprint({key: item for key, item in value.items() if key != 'previewHash'})
        return value

    # A future tool or disclosure policy change must invalidate an existing
    # grant even when the task, provider, instructions and survey rows agree.
    monkeypatch.setattr(models.WorkflowModels, 'preview', changed)
    denied = step(owner, path, task['revision'], selected)
    assert denied.status_code == 409, denied.text
    assert denied.json()['error']['code'] == 'model_dataset_changed'
    assert_no_dispatch(owner, path, provider, selected)


def test_unchanged_data_grant_runs_data_and_reviewer_with_only_aggregates(model_harness, settings, monkeypatch):
    _, owner, provider, release, response_receipts, path, task = collected_task(model_harness, settings)
    preview, selected, _ = authorize(owner, path, task['revision'])
    prompts = []
    original = provider.workflow_step

    async def capture(config, key, messages, limit):
        prompts.append(messages)
        return await original(config, key, messages, limit)

    monkeypatch.setattr(provider, 'workflow_step', capture)

    def forged_statistics(name, value, key):
        if name == 'analyze_data':
            value['deliverable'] = {'descriptive_statistics': [{'variable': 'Q2', 'mean': 999}]}
        return json.dumps(value)

    provider.transform = forged_statistics
    analyzed = step(owner, path, task['revision'], selected)
    assert analyzed.status_code == 200, analyzed.text
    assert analyzed.json()['status'] == 'ready', analyzed.text
    data = analyzed.json()['state']['agent_outputs']['data']['deliverable']
    assert data['data_status'] == 'analyzed'
    assert data['input_artifact_refs'] == [f'survey-release:{release["id"]}']
    assert data['schema_findings'] == [{'ref': f'survey-release:{release["id"]}', 'rows': 3,
        'variables': 5, 'classification': 'synthetic', 'sha256': preview['datasets'][0]['sha256']}]
    score = next(value for value in data['descriptive_statistics'] if value['variable'] == 'Q2')
    assert (score['n_shown'], score['n_valid'], score['n_missing'], score['mean']) == (2, 2, 0, 3.0)
    text = next(value for value in data['descriptive_statistics'] if value['variable'] == 'Q4')
    assert text['content'] == 'withheld_open_text' and text['n_valid'] == 1
    assert any('合成数据' in limitation for limitation in data['limitations'])
    assert data['tests'] == []
    reviewed = step(owner, path, analyzed.json()['revision'], selected)
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()['status'] == 'completed'
    assert reviewed.json()['state']['agent_outputs']['data']['deliverable'] == data
    assert reviewed.json()['state']['agent_outputs']['reviewer']['deliverable']['decision'] == 'approve'
    assert [name for name, _, _ in provider.calls] == ['inspect_data', 'clean_data', 'analyze_data',
        'check_evidence', 'check_consistency', 'review_deliverable']
    calls = owner.get(path + '/model-calls').json()['calls']
    assert len(calls) == 6 and all(call['status'] == 'completed' and call['grantId'] == selected['id'] for call in calls)
    record = owner.get(path + '/model-grants').json()['grants'][0]
    assert record['usedCalls'] == 6 and record['status'] == 'stopped'
    for field in DATA_FIELDS:
        assert record[field] == preview[field]
    disclosed = json.dumps([prompts, analyzed.json(), reviewed.json(), calls], ensure_ascii=False)
    assert PRIVATE_TEXT not in disclosed
    for response in response_receipts:
        assert response['id'] not in disclosed and response['submittedAt'] not in disclosed
    assert any('<tool-json>' in message['content'] for messages in prompts for message in messages)


def test_revoked_data_grant_never_reads_tools_or_reserves_model_fee(model_harness, settings, monkeypatch):
    _, owner, provider, _, _, path, task = collected_task(model_harness, settings)
    _, selected, _ = authorize(owner, path, task['revision'])
    called = []

    def unexpected_tool(self, **kwargs):
        called.append(kwargs)
        raise AssertionError('Revoked grant entered a Data tool')

    monkeypatch.setattr(SurveyDataTools, 'load_dataset', unexpected_tool)
    monkeypatch.setattr(SurveyDataTools, 'analyze_dataset', unexpected_tool)
    revoked = owner.post(path + f'/model-grants/{selected["id"]}/revoke', json={})
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()['status'] == 'stopped' and revoked.json()['stopReason'] == 'grant_revoked'
    denied = step(owner, path, task['revision'], selected)
    assert denied.status_code == 409, denied.text
    assert denied.json()['error']['code'] == 'model_grant_stopped'
    assert called == []
    assert_no_dispatch(owner, path, provider, selected)


def test_grant_revoked_after_dispatch_is_fenced_before_first_tool_read(model_harness, settings, monkeypatch):
    _, owner, provider, _, _, path, task = collected_task(model_harness, settings)
    _, selected, _ = authorize(owner, path, task['revision'])
    original = SurveyDataTools.load_dataset
    entered = []

    def revoke_before_read(self, **kwargs):
        active = owner.get(path).json()
        assert active['status'] == 'running' and active['execution']['status'] == 'running'
        response = owner.post(path + f'/model-grants/{selected["id"]}/revoke', json={})
        assert response.status_code == 200, response.text
        entered.append(response.json()['stopReason'])
        return original(self, **kwargs)

    monkeypatch.setattr(SurveyDataTools, 'load_dataset', revoke_before_read)
    response = step(owner, path, task['revision'], selected)
    assert response.status_code == 200, response.text
    assert entered == ['grant_revoked']
    assert response.json()['status'] == 'blocked'
    assert response.json()['execution']['status'] == 'discarded'
    assert response.json()['state']['agent_outputs'] == {}
    assert provider.calls == []
    assert owner.get(path + '/model-calls').json() == {'calls': []}
    record = owner.get(path + '/model-grants').json()['grants'][0]
    assert record['usedCalls'] == 0 and record['stopReason'] == 'grant_revoked'
