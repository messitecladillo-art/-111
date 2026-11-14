"""Real HTTP/role workflows and PostgreSQL receipts, synthetic model transport."""
import json
from contextlib import ExitStack
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from evix_api.app import create_app
from infrastructure.database.models import Operation
from infrastructure.llm import Completion
from shared.errors import ProviderFailure
from tests.test_postgres import project, service_input

pytestmark = pytest.mark.postgres


class SyntheticSteps:
    def __init__(self, pg_engine):
        self.engine, self.calls, self.hook, self.owners = pg_engine, [], None, {}
        self.transform, self.assert_idle_pool, self.expected_goals = None, True, {}

    async def workflow_step(self, config, key, messages, limit):
        payload = json.loads(messages[1]['content'].split('<task-json>\n')[1].split('\n</task-json>')[0])
        task, step = payload['task'], payload['step']
        assert 'model_bindings' not in json.dumps(messages)
        assert 'ownerId' not in json.dumps(messages)
        assert key not in json.dumps(messages)
        if self.assert_idle_pool:
            assert self.engine.pool.checkedout() == 0
        if config['id'] in self.expected_goals:
            assert task['requirements']['goal'] == self.expected_goals[config['id']]
        # A separate connection sees the committed reservation BEFORE provider I/O.
        with self.engine.connect() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {'id': self.owners[config['id']]})
            receipts = connection.execute(select(Operation.response).where(Operation.scope == 'workflow-model-call/v1')).scalars().all()
            assert any(r['taskId'] == task['task_id'] and r['step'].endswith('.' + step) and r['status'] == 'running' for r in receipts)
        self.calls.append((step, config['id'], config['revision']))
        if self.hook:
            self.hook(step)
        result = {}
        if step == 'assess_feasibility':
            result = {'summary': 'Synthetic model research plan; no fieldwork.', 'deliverable': {
                'title': 'Synthetic local-food research plan', 'background': 'Proposed, not implemented.',
                'research_questions': ['Which purchase situations should be studied?'],
                'objectives': ['Design a testable pilot'], 'population': 'To confirm', 'geography': 'Hubei',
                'period': 'To confirm', 'feasibility': {'status': 'proposed'},
            }}
        elif step == 'analyze_data':
            result = {'summary': 'Synthetic summary of trusted aggregates.'}
        elif step == 'review_deliverable':
            result = {'summary': 'Synthetic review of the proposal only.', 'deliverable': {
                'decision': 'approve', 'stage': task['review_stage'],
                'consistency_checks': [{'check': 'Plan stays proposed', 'result': 'pass', 'details': 'No fieldwork claimed.'}],
                'competition_readiness': {'status': 'not_assessed', 'basis': 'No competition output is delivered.'},
            }}
        raw = self.transform(step, result, key) if self.transform else json.dumps(result)
        response = Completion(raw)
        response.usage = {'inputTokens': 20, 'outputTokens': 30}
        return response


@pytest.fixture
def model_harness(settings, pg_engine):
    deliveries, clients = {}, ExitStack()
    provider = SyntheticSteps(pg_engine)

    async def mail(cid, email, code):
        deliveries[cid] = code

    app = create_app(settings, engine=pg_engine, provider=provider, mail=mail)

    def login(email='a@example.test'):
        # A persistent ASGI loop matches the server's lifetime. A per-request
        # TestClient portal shuts its thread pool down before returning, hiding
        # the timeout response until the deliberately blocked worker finishes.
        client = clients.enter_context(TestClient(app))
        client.headers['origin'] = settings.allowed_origins[0]
        challenge = client.post('/api/auth/code', json={'email': email}).json()
        response = client.post('/api/auth/verify', json={'challengeId': challenge['challengeId'], 'code': deliveries[challenge['challengeId']]})
        assert response.status_code == 200
        identity = response.json()
        client.headers['x-csrf-token'] = identity['csrfToken']
        model = client.post('/api/services', json=service_input(capabilities=['research', 'questionnaire', 'report'])).json()
        provider.owners[model['id']] = identity['user']['id']
        return client, model, identity['user']['id']

    yield app, login, provider
    clients.close()


def create(client, service, **extra):
    p, team = project(client)
    response = client.post(f'/api/projects/{p["id"]}/agent-tasks', json={
        'taskType': 'topic_design', 'requirements': {'goal': 'Synthetic local-food research'},
        'modelPlan': {'schemaVersion': 1, 'default': {'serviceId': service['id'], 'revision': service['revision']}}, **extra,
    })
    assert response.status_code == 201, response.text
    return f'/api/projects/{p["id"]}/agent-tasks/{response.json()["id"]}', response.json(), team


def consent(client, path):
    response = client.get(path + '/model-preview')
    assert response.status_code == 200, response.text
    value = response.json()
    return {'accepted': True, 'previewHash': value['previewHash'], 'maxCalls': value['maxCalls']}


def advance(client, path, revision, approval=None):
    return client.post(path + '/advance', json={'expectedRevision': revision,
        **({'modelConsent': approval} if approval is not None else {})})


def test_actual_public_role_steps_and_review_preserve_human_gate(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, task, _ = create(owner, model)
    approved = consent(owner, path)
    research = advance(owner, path, task['revision'], approved)
    assert research.status_code == 200, research.text
    value = research.json()
    assert value['status'] == 'ready'
    assert value['state']['agent_outputs']['research']['deliverable']['geography'] == 'Hubei'
    receipts = owner.get(path + '/model-calls').json()['calls']
    assert len(receipts) == 3 and all(r['status'] == 'completed' and r['usage']['outputTokens'] == 30 for r in receipts)
    assert all(r['resultHash'] and r['consentHash'] == approved['previewHash'] for r in receipts)
    assert not any(x in json.dumps(receipts) for x in ('Synthetic local-food research', 'synthetic-private-model-key', 'baseUrl'))
    stale = advance(owner, path, value['revision'], approved)
    assert stale.status_code == 422 and len(provider.calls) == 3
    reviewed = advance(owner, path, value['revision'], consent(owner, path))
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()['status'] == 'needs_input'
    assert reviewed.json()['state']['awaiting_approval'] == 'approve_reviewer'
    replay = advance(owner, path, task['revision'])
    assert replay.status_code == 200 and len(provider.calls) == 6


@pytest.mark.parametrize('approval', [None, {'accepted': False, 'previewHash': 'old', 'maxCalls': 3},
    {'accepted': True, 'previewHash': 'old', 'maxCalls': 3}])
def test_no_missing_or_stale_consent_can_dispatch(model_harness, approval):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, task, _ = create(owner, model)
    response = advance(owner, path, task['revision'], approval)
    assert response.status_code == 422
    assert owner.get(path).json()['revision'] == task['revision']
    assert owner.get(path + '/model-calls').json() == {'calls': []}
    assert provider.calls == []


def test_unknown_call_cannot_be_reissued_by_advance_input_or_approval(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, task, _ = create(owner, model)

    def fail(step):
        raise ProviderFailure('provider_timeout', unknown=True)

    provider.hook = fail
    response = advance(owner, path, 0, consent(owner, path))
    assert response.status_code == 200
    value = response.json()
    assert value['status'] == 'blocked' and value['execution']['status'] == 'outcome_unknown'
    assert owner.get(path + '/model-calls').json()['calls'][0]['status'] == 'outcome_unknown'
    for revision in (0, value['revision']):
        assert advance(owner, path, revision).status_code == 200
    for action, fields in [('input', {'artifactRefs': ['artifact:new']}), ('approval', {'approved': True})]:
        assert owner.post(path + '/' + action, json={'expectedRevision': value['revision'], **fields}).status_code == 409
    assert len(provider.calls) == 1


def test_service_change_between_steps_prevents_further_calls(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)

    def change(step):
        if step == 'review_materials':
            updated = owner.put('/api/services/' + model['id'], json=service_input(
                capabilities=['research', 'questionnaire', 'report'], expectedRevision=1, label='Updated synthetic service'))
            assert updated.status_code == 200, updated.text

    provider.hook = change
    response = advance(owner, path, 0, consent(owner, path))
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'failed'
    assert len(provider.calls) == 1
    assert len(owner.get(path + '/model-calls').json()['calls']) == 1


def test_cancelled_parent_fences_late_thread_before_next_model_step(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    approved, entered, release = consent(owner, path), Event(), Event()

    def wait(step):
        entered.set()
        assert release.wait(5)

    provider.hook = wait
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(advance, owner, path, 0, approved)
        try:
            assert entered.wait(5)
            active = owner.get(path).json()
            cancelled = owner.post(path + '/cancel', json={'expectedRevision': active['revision']})
            assert cancelled.status_code == 200, cancelled.text
        finally:
            release.set()
        finished = pending.result(timeout=5)
    assert finished.status_code == 200, finished.text
    assert owner.get(path).json()['execution']['status'] == 'cancelled'
    assert len(provider.calls) == 1
    assert owner.get(path + '/model-calls').json()['calls'][0]['status'] == 'discarded'


def test_model_materials_reject_raw_rows_and_personal_bindings_are_private(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    other, _, _ = login('b@example.test')
    path, _, team = create(owner, model, context={'responses': [{'age': 20}]})
    assert owner.get(path + '/model-preview').status_code == 422
    assert provider.calls == []
    assert owner.post(f'/api/teams/{team}/members', json={'email': 'b@example.test', 'role': 'editor'}).status_code == 201
    assert other.get(path + '/model-calls').status_code == 403
    assert other.get(path + '/model-preview').status_code == 422


def test_data_model_execution_is_not_a_substitute_for_real_analysis_tools(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model, taskType='data_analysis', inputArtifactRefs=['artifact:provided-data'])
    preview = owner.get(path + '/model-preview').json()
    assert preview['available'] is False and preview['missingTools'] == ['load_dataset', 'analyze_dataset']
    response = advance(owner, path, 0, consent(owner, path))
    assert response.status_code == 409 and provider.calls == []


def test_data_role_reads_owned_survey_release_and_reports_tool_values(model_harness, settings):
    from tests.test_surveys_postgres import publish
    app, login, provider = model_harness
    owner, model, _ = login()
    p, _ = project(owner)
    release, _ = publish(owner, p)
    ref = f'survey-release:{release["id"]}'
    task = owner.post(f'/api/projects/{p["id"]}/agent-tasks', json={
        'taskType': 'data_analysis', 'requirements': {'goal': 'Synthetic analysis'}, 'inputArtifactRefs': [ref],
        'modelPlan': {'schemaVersion': 1, 'default': {'serviceId': model['id'], 'revision': model['revision']}}}).json()
    path = f'/api/projects/{p["id"]}/agent-tasks/{task["id"]}'
    empty = owner.get(path + '/model-preview').json()
    assert empty['available'] is False and empty['missingTools'] == ['collected_responses']
    with TestClient(app, headers={'origin': settings.allowed_origins[0]}) as public:
        for i, (choice, score, note) in enumerate([('yes', 4, 'synthetic-private-open-text'), ('yes', 2, None), ('no', None, None)]):
            answers = {'choice': choice, **({'score': score} if score else {}), **({'text': note} if note else {})}
            sent = public.post(f'/api/surveys/{release["token"]}/responses', json={'idempotencyKey': str(uuid4()), 'answers': answers})
            assert sent.status_code == 201, sent.text
    preview = owner.get(path + '/model-preview').json()
    assert preview['available'] is True and preview['datasets'][0]['rowCount'] == 3
    assert preview['dataDisclosure'] == 'aggregate_statistics_only_no_rows_no_open_text'
    approved = {'accepted': True, 'previewHash': preview['previewHash'], 'maxCalls': preview['maxCalls']}
    response = advance(owner, path, 0, approved)
    assert response.status_code == 200, response.text
    value = response.json()
    deliverable = value['state']['agent_outputs']['data']['deliverable']
    assert deliverable['data_status'] == 'analyzed' and deliverable['input_artifact_refs'] == [ref]
    score = next(item for item in deliverable['descriptive_statistics'] if item['variable'] == 'Q2')
    assert (score['n_shown'], score['n_valid'], score['mean']) == (2, 2, 3.0)
    assert [step for step, _, _ in provider.calls] == ['inspect_data', 'clean_data', 'analyze_data']
    assert 'synthetic-private-open-text' not in json.dumps(value)


def test_data_snapshot_change_after_preview_requires_new_consent(model_harness, settings):
    from tests.test_surveys_postgres import publish
    app, login, provider = model_harness
    owner, model, _ = login()
    p, _ = project(owner)
    release, _ = publish(owner, p)
    task = owner.post(f'/api/projects/{p["id"]}/agent-tasks', json={
        'taskType': 'data_analysis', 'requirements': {'goal': 'Synthetic analysis'},
        'inputArtifactRefs': [f'survey-release:{release["id"]}'],
        'modelPlan': {'schemaVersion': 1, 'default': {'serviceId': model['id'], 'revision': model['revision']}}}).json()
    path = f'/api/projects/{p["id"]}/agent-tasks/{task["id"]}'
    with TestClient(app, headers={'origin': settings.allowed_origins[0]}) as public:
        submit = lambda: public.post(f'/api/surveys/{release["token"]}/responses',
                                     json={'idempotencyKey': str(uuid4()), 'answers': {'choice': 'no'}})
        assert submit().status_code == 201
        approved = consent(owner, path)
        assert submit().status_code == 201
    assert advance(owner, path, 0, approved).status_code == 422
    assert provider.calls == []


def test_two_accounts_execute_with_separate_personal_configs_and_inputs(model_harness):
    _, login, provider = model_harness
    first, first_model, _ = login()
    second, second_model, _ = login('b@example.test')
    a, _, _ = create(first, first_model, requirements={'goal': 'Synthetic owner A'})
    b, _, _ = create(second, second_model, requirements={'goal': 'Synthetic owner B'})
    provider.expected_goals = {first_model['id']: 'Synthetic owner A', second_model['id']: 'Synthetic owner B'}
    provider.assert_idle_pool = False
    ready = Barrier(2)
    provider.hook = lambda step: ready.wait(5) if step == 'review_materials' else None
    ca, cb = consent(first, a), consent(second, b)
    with ThreadPoolExecutor(max_workers=2) as pool:
        fa, fb = pool.submit(advance, first, a, 0, ca), pool.submit(advance, second, b, 0, cb)
        assert fa.result(timeout=8).json()['status'] == 'ready'
        assert fb.result(timeout=8).json()['status'] == 'ready'
    assert len(provider.calls) == 6
    assert {r['serviceId'] for r in first.get(a + '/model-calls').json()['calls']} == {first_model['id']}
    assert {r['serviceId'] for r in second.get(b + '/model-calls').json()['calls']} == {second_model['id']}
    assert first.get(b + '/model-calls').status_code == 404


@pytest.mark.parametrize('mutation', ['logout', 'timeout'])
def test_late_call_cannot_start_another_step_after_timeout_or_logout(model_harness, monkeypatch, mutation):
    import application.services.workflow_models as models
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    approved, entered, release, returned = consent(owner, path), Event(), Event(), Event()

    def wait(step):
        entered.set()
        assert release.wait(5)
        returned.set()

    provider.hook = wait
    if mutation == 'timeout':
        monkeypatch.setattr(models, 'MODEL_ROLE_TIMEOUT', .1)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(advance, owner, path, 0, approved)
        assert entered.wait(5)
        if mutation == 'logout':
            assert owner.post('/api/auth/logout').status_code == 204
            release.set()
            assert pending.result(timeout=5).status_code == 401
        else:
            try:
                response = pending.result(timeout=5)
                assert response.json()['execution']['status'] == 'outcome_unknown'
            finally:
                release.set()
            assert returned.wait(5)
    assert len(provider.calls) == 1


@pytest.mark.parametrize('bad', ['duplicate_json', 'key', 'escaped_key', 'invented_reference'])
def test_bad_provider_output_is_not_persisted_as_an_agent_result(model_harness, bad):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)

    def transform(step, value, key):
        if bad == 'duplicate_json':
            return '{"result":1,"result":2}'
        if bad == 'key':
            return json.dumps({'summary': key})
        if bad == 'escaped_key':
            return '{"summary":"' + ''.join('\\u%04x' % ord(char) for char in key) + '"}'
        if step == 'assess_feasibility':
            value['artifact_refs'] = ['artifact:unproduced']
        return json.dumps(value)

    provider.transform = transform
    response = advance(owner, path, 0, consent(owner, path))
    assert response.status_code == 200, response.text
    assert response.json()['status'] == ('blocked' if bad == 'invented_reference' else 'failed')
    assert response.json()['state']['agent_outputs'] == {}
    receipts = owner.get(path + '/model-calls').json()['calls']
    assert 'synthetic-private-model-key' not in json.dumps(receipts)
    assert len(receipts) == (3 if bad == 'invented_reference' else 1)


def test_changed_actual_prompt_requires_new_consent_and_stops_later_calls(model_harness, monkeypatch):
    import multi_agent.prompt_registry as prompts
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    original = prompts.load_system_prompt
    approved = consent(owner, path)
    monkeypatch.setattr(prompts, 'load_system_prompt', lambda role: original(role) + '\nSynthetic changed instruction.')
    assert advance(owner, path, 0, approved).status_code == 422
    assert provider.calls == []
    monkeypatch.setattr(prompts, 'load_system_prompt', original)
    approved = consent(owner, path)

    def change(step):
        if step == 'review_materials':
            monkeypatch.setattr(prompts, 'load_system_prompt', lambda role: original(role) + '\nSynthetic late instruction change.')

    provider.hook = change
    response = advance(owner, path, 0, approved)
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'failed'
    assert len(provider.calls) == 1


def test_committed_call_reservation_interrupted_before_io_is_never_reissued(model_harness, monkeypatch):
    import application.services.workflow_models as models
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    approved = consent(owner, path)
    real_session = models.DBSession
    interrupted = []

    class InterruptedSession(real_session):
        def commit(self):
            reservations = [row for row in self.new if isinstance(row, Operation) and row.scope == models.SCOPE]
            super().commit()
            if reservations and not interrupted:
                interrupted.append(reservations[0].key)
                raise ProviderFailure('synthetic_interruption_after_commit', unknown=True)

    monkeypatch.setattr(models, 'DBSession', InterruptedSession)
    response = advance(owner, path, 0, approved)
    assert response.status_code == 200, response.text
    value = response.json()
    assert value['execution']['status'] == 'outcome_unknown'
    receipt = owner.get(path + '/model-calls').json()['calls'][0]
    assert receipt['id'] == interrupted[0] and receipt['status'] == 'outcome_unknown'
    assert receipt['resultHash'] is None and provider.calls == []
    assert advance(owner, path, 0, approved).status_code == 200
    assert advance(owner, path, value['revision']).status_code == 200
    assert len(owner.get(path + '/model-calls').json()['calls']) == 1 and provider.calls == []


def test_model_cannot_certify_submission_readiness_without_audit_tools(model_harness):
    _, login, provider = model_harness
    owner, model, _ = login()
    path, _, _ = create(owner, model)
    research = advance(owner, path, 0, consent(owner, path)).json()

    def ready(step, value, key):
        if step == 'review_deliverable':
            value['deliverable']['competition_readiness']['status'] = 'ready'
        return json.dumps(value)

    provider.transform = ready
    response = advance(owner, path, research['revision'], consent(owner, path))
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'failed'
    assert set(response.json()['state']['agent_outputs']) == {'research'}
