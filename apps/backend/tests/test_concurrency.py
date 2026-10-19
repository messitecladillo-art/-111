import asyncio
import concurrent.futures
import threading
import pytest
from fastapi.testclient import TestClient
from evix_api.app import create_app
from application.providers import FixtureProvider
from shared.errors import ProviderFailure
from tests.test_postgres import project, service_input, idem
from tests.test_contracts import blank

pytestmark = pytest.mark.postgres


def clone_client(app, authenticated):
    client = TestClient(app)
    client.cookies.update(authenticated.cookies)
    client.headers.update(authenticated.headers)
    return client


def test_concurrent_cas_and_exact_idempotency(harness):
    app, login, _, _ = harness
    a, _ = login()
    p, _ = project(a)
    path = f'/api/projects/{p["id"]}/questionnaire/versions'
    b = clone_client(app, a)
    first = {"design": blank(), "expectedRevision": 0, "idempotencyKey": idem()}
    second = {**first, "idempotencyKey": idem()}
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        tasks = [pool.submit(c.post, path, json=data) for c, data in [(a, first), (b, second)]]
        responses = [task.result(timeout=10) for task in tasks]
    assert sorted(r.status_code for r in responses) == [201, 409]
    current = a.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"]
    data = {"design": blank(), "expectedRevision": current["revision"], "idempotencyKey": idem()}
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        responses = [task.result(timeout=10) for task in [pool.submit(c.post, path, json=data) for c in [a, b]]]
    assert [r.status_code for r in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()


class HeldProvider(FixtureProvider):
    def __init__(self):
        super().__init__()
        self.entered = threading.Event()
        self.release = threading.Event()

    async def __call__(self, config, key, brief):
        self.entered.set()
        if not await asyncio.to_thread(self.release.wait, 10):
            raise ProviderFailure("provider_timeout", unknown=True)
        return await super().__call__(config, key, brief)


def test_running_duplicate_active_limit_and_logout_during_dispatch(harness, settings, pg_engine):
    _, login, _, _ = harness
    a, _ = login()
    p, _ = project(a)
    s = a.post("/api/services", json=service_input()).json()
    provider = HeldProvider()
    app = create_app(settings, provider=provider, engine=pg_engine)
    caller, concurrent_client = clone_client(app, a), clone_client(app, a)
    path = f'/api/projects/{p["id"]}/proposals'
    data = {"serviceId": s["id"], "serviceRevision": 1, "brief": "合成需求", "expectedQuestionnaireRevision": 0, "idempotencyKey": idem(), "consent": True}
    with concurrent.futures.ThreadPoolExecutor(1) as pool:
        task = pool.submit(caller.post, path, json=data)
        assert provider.entered.wait(5)
        running = concurrent_client.post(path, json=data)
        assert running.status_code == 201 and running.json()["status"] == "running"
        assert concurrent_client.post(path, json={**data, "idempotencyKey": idem()}).status_code == 429
        assert concurrent_client.post("/api/auth/logout").status_code == 204
        provider.release.set()
        result = task.result(timeout=10)
    assert result.status_code == 401, result.text
    assert provider.calls == 1


def test_provider_failure_unknown_is_persistent_not_replayed(harness, settings, pg_engine):
    _, login, _, _ = harness
    a, _ = login()
    p, _ = project(a)
    s = a.post("/api/services", json=service_input()).json()
    count = []

    async def unknown(config, key, brief):
        count.append(1)
        raise ProviderFailure("provider_timeout", unknown=True)

    app = create_app(settings, provider=unknown, engine=pg_engine)
    client = clone_client(app, a)
    path = f'/api/projects/{p["id"]}/proposals'
    data = {"serviceId": s["id"], "serviceRevision": 1, "brief": "合成需求", "expectedQuestionnaireRevision": 0, "idempotencyKey": idem(), "consent": True}
    first = client.post(path, json=data)
    assert first.status_code == 201 and first.json()["status"] == "outcome_unknown"
    assert client.post(path, json=data).json() == first.json()
    assert count == [1]


def test_membership_revoked_during_dispatch_blocks_result_and_replay(harness, settings, pg_engine):
    _, login, _, _ = harness
    owner, _ = login()
    editor, identity = login("b@example.test")
    p, team = project(owner)
    assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"}).status_code == 201
    service = editor.post("/api/services", json=service_input()).json()
    provider = HeldProvider()
    app = create_app(settings, provider=provider, engine=pg_engine)
    caller = clone_client(app, editor)
    path = f'/api/projects/{p["id"]}/proposals'
    data = {"serviceId": service["id"], "serviceRevision": 1, "brief": "合成需求", "expectedQuestionnaireRevision": 0,
            "idempotencyKey": idem(), "consent": True}
    with concurrent.futures.ThreadPoolExecutor(1) as pool:
        task = pool.submit(caller.post, path, json=data)
        assert provider.entered.wait(5)
        try:
            assert owner.delete(f'/api/teams/{team}/members/{identity["user"]["id"]}').status_code == 204
        finally:
            provider.release.set()
        result = task.result(timeout=10)
    assert result.status_code == 404
    assert caller.post(path, json=data).status_code == 404
    assert provider.calls == 1
    assert owner.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"] is None


def test_late_proposal_preserves_concurrent_edit_and_exact_base(harness, settings, pg_engine):
    _, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    service = owner.post("/api/services", json=service_input()).json()
    provider = HeldProvider()
    app = create_app(settings, provider=provider, engine=pg_engine)
    caller, writer = clone_client(app, owner), clone_client(app, owner)
    path = f'/api/projects/{p["id"]}/proposals'
    versions = f'/api/projects/{p["id"]}/questionnaire/versions'
    data = {"serviceId": service["id"], "serviceRevision": 1, "brief": "合成需求", "expectedQuestionnaireRevision": 0,
            "idempotencyKey": idem(), "consent": True}
    with concurrent.futures.ThreadPoolExecutor(1) as pool:
        task = pool.submit(caller.post, path, json=data)
        assert provider.entered.wait(5)
        try:
            edited = writer.post(versions, json={"design": {**blank(), "title": "并发人工修改"}, "expectedRevision": 0,
                                               "idempotencyKey": idem()})
            assert edited.status_code == 201
        finally:
            provider.release.set()
        response = task.result(timeout=10)
    assert response.status_code == 201
    proposal = response.json()
    assert proposal["status"] == "ready" and proposal["inputRevision"] == 0
    assert writer.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"] == edited.json()
    forged_base = writer.post(versions, json={"design": proposal["design"], "sourceProposalId": proposal["id"],
                                            "expectedRevision": 1, "idempotencyKey": idem()})
    assert forged_base.status_code == 409 and forged_base.json()["error"]["code"] == "stale_proposal"
    assert provider.calls == 1
