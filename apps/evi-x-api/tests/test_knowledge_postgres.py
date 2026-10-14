"""Actual PostgreSQL/RLS integration: no SQLite or live provider substitution."""
import asyncio
from datetime import timedelta
from uuid import uuid4
import pytest
from sqlalchemy import select, text, update
from evix_api.knowledge import KnowledgeConfig, LookupFailure, LookupResult, register_knowledge
from evix_api.knowledge_models import KnowledgeLookup, KnowledgeMonthlyBudget, KnowledgeDailyBudget, KnowledgeUserState, KnowledgeReference
from evix_api.models import now
from .test_postgres import project

pytestmark = pytest.mark.postgres
CATALOG = {"confidence-interval": {2, 1}, "effect-size": {2}}


class FakeLookup:
    def __init__(self):
        self.calls = []
        self.failure = None
        self.credits = 1
        self.delay = 0

    async def __call__(self, query):
        self.calls.append(query)
        await asyncio.sleep(self.delay)
        if self.failure:
            raise self.failure
        return LookupResult([{"url": "https://example.org/fixture", "title": "Synthetic test", "snippet": "fixture"}], self.credits, "fixture-request")


@pytest.fixture
def knowledge_harness(monkeypatch, request, pg_engine):
    import evix_api.app as app_module
    fake = FakeLookup()
    config_holder = [KnowledgeConfig(monthly_limit=3, daily_limit=2)]

    def register(*args, **kwargs):
        kwargs.pop("config", None)  # Harness owns the controlled quota/provider configuration.
        return register_knowledge(*args, **kwargs, provider=fake, config=config_holder[0], catalog=CATALOG)

    monkeypatch.setattr(app_module, "register_knowledge", register)
    app, login, deliveries, model_provider = request.getfixturevalue("harness")
    return app, login, fake


def lookup(client, query="SEM", key=None):
    return client.post("/api/knowledge/lookups", json={"query": query, "idempotencyKey": key or str(uuid4())})


def test_knowledge_state_cas_replay_and_account_isolation(knowledge_harness, pg_engine):
    _, login, _ = knowledge_harness
    owner, _ = login()
    other, other_identity = login("b@example.test")
    path = "/api/me/knowledge-state"
    assert owner.get(path).json() == {"revision": 0, "favorites": [], "recent": [], "preferences": {}}
    data = {"expectedRevision": 0, "idempotencyKey": str(uuid4()), "state": {
        "favorites": [{"entryId": "confidence-interval", "entryVersion": 1}], "recent": [], "preferences": {"mode": "float"}}}
    saved = owner.put(path, json=data)
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    assert owner.put(path, json=data).json() == saved.json()
    assert owner.put(path, json={**data, "idempotencyKey": str(uuid4())}).status_code == 409
    assert other.get(path).json()["favorites"] == []
    assert owner.put(path, json={**data, "state": {**data["state"], "preferences": {}}}).status_code == 409
    no_csrf = owner.headers.pop("x-csrf-token")
    assert owner.put(path, json=data).status_code == 403
    owner.headers["x-csrf-token"] = no_csrf
    with pg_engine.begin() as conn:
        conn.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": other_identity["user"]["id"]})
        assert conn.execute(select(KnowledgeUserState)).all() == []


def test_project_references_exact_versions_viewer_revoke_and_delete(knowledge_harness, pg_engine):
    _, login, _ = knowledge_harness
    owner, owner_session = login()
    other, other_session = login("b@example.test")
    p, team = project(owner)
    path = f'/api/projects/{p["id"]}/knowledge-references'
    assert other.get(path).status_code == 404
    data = {"expectedRevision": 0, "idempotencyKey": str(uuid4()), "entryId": "confidence-interval", "entryVersion": 1}
    added = owner.post(path, json=data)
    assert added.status_code == 200, added.text
    assert added.json()["references"][0]["entryVersion"] == 1
    assert owner.post(path, json=data).json() == added.json()
    assert owner.post(path, json={**data, "idempotencyKey": str(uuid4()), "entryVersion": "draft"}).status_code == 422
    owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": "viewer"})
    assert other.get(path).json() == added.json()
    assert other.post(path, json={**data, "expectedRevision": 1, "idempotencyKey": str(uuid4())}).status_code == 403
    ref_id = added.json()["references"][0]["id"]
    deleted = owner.request("DELETE", path + "/" + ref_id, json={"expectedRevision": 1, "idempotencyKey": str(uuid4())})
    assert deleted.status_code == 200 and deleted.json() == {"revision": 2, "references": []}
    owner.delete(f'/api/teams/{team}/members/{other_session["user"]["id"]}')
    assert other.get(path).status_code == 404
    with pg_engine.begin() as conn:
        conn.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": other_session["user"]["id"]})
        assert conn.execute(select(KnowledgeReference)).all() == []


def test_lookup_unknown_idempotency_daily_budget_and_cross_account(knowledge_harness, pg_engine):
    _, login, provider = knowledge_harness
    owner, identity = login()
    other, _ = login("b@example.test")
    provider.failure = LookupFailure("lookup_network_unknown")
    key = str(uuid4())
    response = lookup(owner, key=key)
    assert response.status_code == 202, response.text
    receipt = response.json()
    assert receipt["status"] == "outcome_unknown" and receipt["credits"] is None
    assert lookup(owner, key=key).json() == receipt
    assert provider.calls == ["SEM"]
    assert lookup(owner, "different", key=key).status_code == 409
    assert other.get("/api/knowledge/lookups/" + receipt["id"]).status_code == 404
    assert lookup(owner).status_code == 202
    assert lookup(owner).status_code == 429
    with pg_engine.begin() as conn:
        conn.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": identity["user"]["id"]})
        budget = conn.execute(select(KnowledgeMonthlyBudget)).mappings().one()
        assert budget["reserved"] == 2 and budget["settled"] == 0


def test_lookup_missing_usage_unknown_and_known_rejection_releases_only_month(knowledge_harness, pg_engine):
    _, login, provider = knowledge_harness
    owner, identity = login()
    provider.credits = None
    first = lookup(owner).json()
    assert first["status"] == "outcome_unknown" and first["errorCode"] == "lookup_usage_unknown"
    provider.failure = LookupFailure("lookup_rate_limited", False)
    second = lookup(owner).json()
    assert second["status"] == "failed" and second["credits"] == 0
    assert lookup(owner).status_code == 429
    with pg_engine.begin() as conn:
        conn.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": identity["user"]["id"]})
        monthly = conn.execute(select(KnowledgeMonthlyBudget)).mappings().one()
        daily = conn.execute(select(KnowledgeDailyBudget)).mappings().one()
        assert monthly["reserved"] == 1 and monthly["settled"] == 0 and daily["requests"] == 2


def test_monthly_budget_and_independent_users(knowledge_harness):
    _, login, provider = knowledge_harness
    owner, _ = login()
    other, _ = login("b@example.test")
    assert lookup(owner).json()["status"] == "ready"
    assert lookup(owner).json()["status"] == "ready"
    assert lookup(other).json()["status"] == "ready"
    response = lookup(other)
    assert response.status_code == 429 and response.json()["error"]["code"] == "knowledge_monthly_limit"
    assert len(provider.calls) == 3


def test_stale_receipt_after_restart_preserves_budget_and_never_resends(knowledge_harness, pg_engine):
    _, login, provider = knowledge_harness
    owner, identity = login()
    key = str(uuid4())
    provider.failure = LookupFailure("lookup_network_unknown")
    first = lookup(owner, key=key).json()
    with pg_engine.begin() as conn:
        conn.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": identity["user"]["id"]})
        conn.execute(update(KnowledgeLookup).where(KnowledgeLookup.id == first["id"]).values(
            status="running", error_code=None, finished_at=None, created_at=now() - timedelta(minutes=5)))
    restored = owner.get("/api/knowledge/lookups/" + first["id"]).json()
    assert restored["status"] == "outcome_unknown" and restored["errorCode"] == "lookup_interrupted_unknown"
    assert lookup(owner, key=key).json() == restored
    assert provider.calls == ["SEM"]


def test_lookup_concurrent_duplicate_and_global_budget(knowledge_harness):
    from concurrent.futures import ThreadPoolExecutor
    from fastapi.testclient import TestClient
    app, login, provider = knowledge_harness
    owner, _ = login()
    other, _ = login("b@example.test")
    provider.delay = .1
    key = str(uuid4())

    def submit(item):
        client, item_key = item
        with TestClient(app, cookies=client.cookies, headers=dict(client.headers)) as connection:
            response = lookup(connection, key=item_key)
            return response.status_code, response.json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(submit, [(owner, key), (owner, key)]))
    assert all(code == 202 for code, _ in replies)
    assert replies[0][1]["id"] == replies[1][1]["id"]
    assert provider.calls == ["SEM"]
    with ThreadPoolExecutor(max_workers=3) as pool:
        replies = list(pool.map(submit, [(owner, str(uuid4())), (other, str(uuid4())), (other, str(uuid4()))]))
    assert sorted(code for code, _ in replies) == [202, 202, 429]
    assert len(provider.calls) == 3


def test_term_request_rate_replay_and_unknown_fields(knowledge_harness):
    _, login, _ = knowledge_harness
    owner, _ = login()
    payload = {"idempotencyKey": str(uuid4()), "term": "罕见概念", "domain": "统计", "note": "合成软件测试"}
    receipt = owner.post("/api/knowledge/term-requests", json=payload)
    assert receipt.status_code == 201
    assert owner.post("/api/knowledge/term-requests", json=payload).json() == receipt.json()
    assert owner.post("/api/knowledge/term-requests", json={**payload, "rawPage": "no"}).status_code == 422
    for _ in range(4):
        assert owner.post("/api/knowledge/term-requests", json={**payload, "idempotencyKey": str(uuid4())}).status_code == 201
    assert owner.post("/api/knowledge/term-requests", json={**payload, "idempotencyKey": str(uuid4())}).status_code == 429


def test_unconfigured_lookup_has_no_dispatch_or_budget(harness, pg_engine):
    _, login, _, _ = harness
    owner, identity = login()
    response = lookup(owner)
    assert response.status_code == 503 and response.json()["error"]["code"] == "knowledge_lookup_unconfigured"
    with pg_engine.begin() as conn:
        conn.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": identity["user"]["id"]})
        assert conn.execute(select(KnowledgeLookup)).all() == []
        assert conn.execute(select(KnowledgeDailyBudget)).all() == []
        assert conn.execute(select(KnowledgeMonthlyBudget)).all() == []
