"""Independent actual PostgreSQL/RLS topic-provider acceptance; no live model calls."""
import asyncio
import copy
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4
from threading import Event
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update
from evix_api.models import Operation, RateEvent, Session, Service, now
from evix_api.knowledge_models import KnowledgeLookup, KnowledgeMonthlyBudget, KnowledgeDailyBudget
from evix_api.provider import ProviderFailure
from evix_api.security import keyed
from evix_api.topics import SCOPE, load_corpus
from .test_postgres import service_input
from .test_topics import profile

pytestmark = pytest.mark.postgres
PATH = "/api/topic-advisor/proposals"


def setup(client, **extra):
    service = client.post("/api/services", json=service_input(capabilities=["research"])).json()
    corpus = load_corpus()
    candidate = next(p for p in corpus["catalog"]["patterns"] if not p["sensitive"] and not p["regionTags"] and not p["cityTags"])
    data = {"serviceId": service["id"], "serviceRevision": service["revision"], "idempotencyKey": str(uuid4()), "consent": True,
            "catalogVersion": corpus["catalog"]["contentVersion"], "profile": profile(), "candidateIds": [candidate["id"]], "goal": "合成测试：先验证可达性", **extra}
    return service, candidate, data


def as_user(engine, uid, callback):
    with engine.begin() as conn:
        conn.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": uid})
        return callback(conn)


def test_topics_receipt_idempotency_and_cross_account_rls(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    other, other_identity = login("b@example.test")
    _, _, data = setup(owner)
    first = owner.post(PATH, json=data)
    assert first.status_code == 201, first.text
    ready = first.json()
    assert ready["status"] == "ready" and ready["classification"] == "proposed"
    assert ready["proposal"]["classification"] == "proposed" and ready["providerMode"] == "fixture"
    assert owner.post(PATH, json=data).json() == ready and provider.calls == 1
    assert owner.post(PATH, json={**data, "goal": "不同内容"}).status_code == 409 and provider.calls == 1
    assert owner.get(PATH + "/" + ready["id"]).json() == ready
    assert other.get(PATH + "/" + ready["id"]).status_code == 404
    assert other.post(PATH, json={**data, "idempotencyKey": str(uuid4())}).status_code == 404
    assert as_user(pg_engine, other_identity["user"]["id"], lambda c: c.execute(select(Operation).where(Operation.scope == SCOPE)).all()) == []
    assert len(as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation).where(Operation.scope == SCOPE)).all())) == 1


def test_topics_csrf_origin_consent_stale_service_and_corpus_before_provider(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    service, _, data = setup(owner)
    cases = [({**data, "consent": False}, 422), ({**data, "catalogVersion": "old"}, 409),
             ({**data, "serviceRevision": 99}, 409), ({**data, "candidateIds": ["invented"]}, 422),
             ({**data, "candidateIds": []}, 422), ({**data, "candidateIds": data["candidateIds"] * 2}, 422)]
    for body, status in cases:
        response = owner.post(PATH, json={**body, "idempotencyKey": str(uuid4())})
        assert response.status_code == status, response.text
    assert owner.post(PATH, json=data, headers={"x-csrf-token": "invalid"}).status_code == 403
    assert owner.post(PATH, json=data, headers={"origin": "https://attacker.invalid"}).status_code == 403
    assert owner.post(PATH, json=data, headers={"sec-fetch-site": "cross-site"}).status_code == 403
    assert provider.calls == 0
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation).where(Operation.scope == SCOPE)).all()) == []
    scope = keyed(settings, "topic-call-rate/v1", identity["user"]["id"])
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(RateEvent).where(RateEvent.scope == scope)).all()) == []
    response = owner.request("DELETE", "/api/services/" + service["id"], json={"expectedRevision": 1, "idempotencyKey": str(uuid4())})
    assert response.status_code == 204
    assert owner.post(PATH, json=data).status_code == 404 and provider.calls == 0


def test_topics_hard_blocking_and_wrong_capability_make_no_call(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, candidate, data = setup(owner)
    for changes in ({"days": 0}, {"access": {candidate["accessNeeds"][0]: "unavailable"}}, {"resources": {candidate["resourceNeeds"][0]: "unavailable"}}):
        response = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4()), "profile": profile(**changes)})
        assert response.status_code == 409, response.text
        assert response.json()["error"]["code"] == "topic_infeasible"
    wrong_service = owner.post("/api/services", json=service_input()).json()
    assert owner.post(PATH, json={**data, "serviceId": wrong_service["id"], "idempotencyKey": str(uuid4())}).status_code == 422
    assert provider.calls == 0
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation).where(Operation.scope == SCOPE)).all()) == []


def test_topics_unknown_never_replays_with_same_or_new_key(harness, pg_engine):
    _, login, _, provider = harness
    owner, _ = login()
    _, _, data = setup(owner)
    async def uncertain(*args):
        provider.calls += 1
        raise ProviderFailure("provider_timeout", unknown=True)
    provider.topic = uncertain
    first = owner.post(PATH, json=data)
    assert first.status_code == 201, first.text
    receipt = first.json()
    assert receipt["status"] == "outcome_unknown" and receipt["proposal"] is None
    assert owner.post(PATH, json=data).json() == receipt
    blocked = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4())})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "outcome_unknown"
    assert provider.calls == 1


def test_topics_stale_running_receipt_expires_after_restart_without_replay(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, _, data = setup(owner)
    receipt = owner.post(PATH, json=data).json()
    stale = {**receipt, "status": "running", "proposal": None, "createdAt": (now() - timedelta(minutes=4)).isoformat(), "finishedAt": None}
    as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(update(Operation).where(Operation.scope == SCOPE, Operation.key == receipt["id"]).values(response=stale)))
    from evix_api.app import create_app
    with TestClient(create_app(settings, provider=provider, engine=pg_engine), cookies=owner.cookies, headers=dict(owner.headers)) as restarted:
        response = restarted.get(PATH + "/" + receipt["id"])
        assert response.status_code == 200 and response.json()["status"] == "outcome_unknown"
        assert restarted.post(PATH, json=data).json()["status"] == "outcome_unknown"
    assert provider.calls == 1


def test_topics_malformed_provider_result_is_failed_not_accepted(harness):
    _, login, _, provider = harness
    owner, _ = login()
    _, _, data = setup(owner)
    async def fabricated(*args):
        provider.calls += 1
        return json.dumps({"items": [{"patternId": data["candidateIds"][0], "awardProbability": 1}]})
    provider.topic = fabricated
    receipt = owner.post(PATH, json=data).json()
    assert receipt["status"] == "failed" and receipt["proposal"] is None and receipt["errorCode"] == "invalid_proposal"
    assert owner.post(PATH, json=data).json() == receipt and provider.calls == 1


def test_topics_revoked_session_during_call_cannot_receive_result(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, _, data = setup(owner)
    original = provider.topic
    async def revoke(*args):
        result = await original(*args)
        as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(update(Session).where(Session.user_id == identity["user"]["id"]).values(revoked_at=now())))
        return result
    provider.topic = revoke
    response = owner.post(PATH, json=data)
    assert response.status_code == 401, response.text
    assert owner.get(PATH + "/" + data["idempotencyKey"]).status_code == 401
    assert provider.calls == 1


def test_topics_lookup_ownership_status_and_search_excerpt_label(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    other, second_identity = login("b@example.test")
    _, _, data = setup(owner)
    ids = [str(uuid4()), str(uuid4()), str(uuid4())]
    as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(KnowledgeMonthlyBudget.__table__.insert().values(month="2026-10")))
    for uid in (identity["user"]["id"], second_identity["user"]["id"]):
        as_user(pg_engine, uid, lambda c: c.execute(KnowledgeDailyBudget.__table__.insert().values(user_id=uid, day="2026-10-15")))
    for lookup_id, uid, status in ((ids[0], identity["user"]["id"], "ready"), (ids[1], second_identity["user"]["id"], "ready"), (ids[2], identity["user"]["id"], "outcome_unknown")):
        values = {"id": lookup_id, "user_id": uid, "idempotency_key": str(uuid4()), "payload_hash": "0" * 64, "query": "synthetic lookup", "status": status,
                  "budget_month": "2026-10", "budget_day": "2026-10-15", "results": [{"title": "合成片段", "url": "https://example.org/fixture", "snippet": "尚待核查原文"}], "finished_at": now()}
        as_user(pg_engine, uid, lambda c: c.execute(KnowledgeLookup.__table__.insert().values(**values)))
    for lookup_id in ids[1:]:
        response = owner.post(PATH, json={**data, "lookupId": lookup_id, "idempotencyKey": str(uuid4())})
        assert response.status_code == 404 and response.json()["error"]["code"] == "lookup_unavailable"
    assert provider.calls == 0
    ready = owner.post(PATH, json={**data, "lookupId": ids[0]}).json()
    assert ready["status"] == "ready" and provider.calls == 1
    excerpt = next(s for s in ready["sources"] if s["id"].startswith("lookup-"))
    assert excerpt["coverage"] == "search_excerpt" and "尚未核对" in excerpt["limitations"][0]


def test_topics_concurrent_duplicate_has_one_provider_dispatch(harness):
    app, login, _, provider = harness
    owner, _ = login()
    _, _, data = setup(owner)
    original = provider.topic
    async def delayed(*args):
        await asyncio.sleep(.15)
        return await original(*args)
    provider.topic = delayed
    def submit(_):
        with TestClient(app, cookies=owner.cookies, headers=dict(owner.headers)) as client:
            response = client.post(PATH, json=data)
            return response.status_code, response.json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(submit, range(2)))
    assert all(code == 201 for code, _ in responses)
    assert {r["id"] for _, r in responses} == {data["idempotencyKey"]}
    assert provider.calls == 1
    assert owner.get(PATH + "/" + data["idempotencyKey"]).json()["status"] == "ready"


def test_topics_real_service_revision_change_and_capability_revocation(harness):
    _, login, _, provider = harness
    owner, _ = login()
    service, _, data = setup(owner)
    edit = service_input(capabilities=["research"], expectedRevision=1, label="合成设置更新")
    edit.pop("apiKey")
    updated = owner.put("/api/services/" + service["id"], json=edit)
    assert updated.status_code == 200 and updated.json()["revision"] == 2
    stale = owner.post(PATH, json=data)
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "revision_conflict"
    assert provider.calls == 0
    accepted = owner.post(PATH, json={**data, "serviceRevision": 2, "idempotencyKey": str(uuid4())})
    assert accepted.status_code == 201 and accepted.json()["serviceRevision"] == 2 and provider.calls == 1
    edit.update(expectedRevision=2, idempotencyKey=str(uuid4()), capabilities=["questionnaire"])
    assert owner.put("/api/services/" + service["id"], json=edit).json()["revision"] == 3
    revoked = owner.post(PATH, json={**data, "serviceRevision": 3, "idempotencyKey": str(uuid4())})
    assert revoked.status_code == 422 and revoked.json()["error"]["code"] == "capability_unavailable"
    assert provider.calls == 1


def test_topics_distinct_concurrent_call_is_rejected_until_running_receipt_resolves(harness):
    app, login, _, provider = harness
    owner, _ = login()
    _, _, data = setup(owner)
    entered, release = Event(), Event()
    original = provider.topic
    async def delayed(*args):
        entered.set()
        for _ in range(500):
            if release.is_set():
                return await original(*args)
            await asyncio.sleep(.01)
        raise ProviderFailure("provider_timeout", unknown=True)
    provider.topic = delayed
    def first_call():
        with TestClient(app, cookies=owner.cookies, headers=dict(owner.headers)) as client:
            return client.post(PATH, json=data)
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(first_call)
        try:
            assert entered.wait(5)
            second = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4()), "goal": "另一个合成请求"})
            assert second.status_code == 429 and second.json()["error"]["code"] == "call_active"
        finally:
            release.set()
        result = first.result(timeout=10)
    assert result.status_code == 201 and result.json()["status"] == "ready" and provider.calls == 1


def test_topics_hourly_limit_counts_dispatches_but_does_not_charge_idempotent_replay(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, _, data = setup(owner)
    first = owner.post(PATH, json=data)
    assert first.status_code == 201
    for _ in range(3):
        assert owner.post(PATH, json=data).json() == first.json()
    for _ in range(11):
        assert owner.post(PATH, json={**data, "idempotencyKey": str(uuid4())}).status_code == 201
    blocked = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4())})
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "call_rate_limit"
    assert provider.calls == 12
    assert owner.post(PATH, json=data).json() == first.json()
    scope = keyed(settings, "topic-call-rate/v1", identity["user"]["id"])
    assert len(as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(RateEvent).where(RateEvent.scope == scope)).all())) == 12


def test_topics_history_is_personal_bounded_recovers_after_logout_and_preserves_old_receipts(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    other, _ = login("b@example.test")
    _, _, data = setup(owner)
    first = owner.post(PATH, json=data).json()
    assert first["status"] == "ready"
    _, _, other_data = setup(other)
    foreign = other.post(PATH, json=other_data).json()
    assert foreign["status"] == "ready" and provider.calls == 2
    uid = identity["user"]["id"]
    old = {**first, "createdAt": (now() - timedelta(hours=2)).isoformat()}
    as_user(pg_engine, uid, lambda c: c.execute(update(Operation).where(Operation.scope == SCOPE, Operation.key == first["id"]).values(response=old)))
    # Synthetic persisted history exercises the 20-item boundary without making
    # extra supplier calls or bypassing the provider's hourly execution limit.
    histories = []
    for index in range(22):
        receipt_id = str(uuid4())
        row = {**first, "id": receipt_id, "createdAt": (now() - timedelta(minutes=index + 1)).isoformat()}
        if index == 1:
            row.update(status="running", proposal=None, finishedAt=None)
        histories.append(row)
        as_user(pg_engine, uid, lambda c: c.execute(Operation.__table__.insert().values(user_id=uid, scope=SCOPE, key=receipt_id, payload_hash="0" * 64, response=row)))
    as_user(pg_engine, uid, lambda c: c.execute(Operation.__table__.insert().values(user_id=uid, scope=SCOPE, key=str(uuid4()), payload_hash="0" * 64, response=None)))
    response = owner.get(PATH)
    assert response.status_code == 200, response.text
    history = response.json()["receipts"]
    assert len(history) == 20
    assert [row["id"] for row in history] == [row["id"] for row in histories[:20]]
    assert all(set(row) == {"id", "status", "createdAt", "finishedAt", "inputFingerprint"} for row in history)
    assert history[1]["status"] == "outcome_unknown" and history[1]["finishedAt"] is not None
    persisted = owner.get(PATH + "/" + histories[1]["id"]).json()
    assert persisted["status"] == "outcome_unknown" and persisted["errorCode"] == "interrupted_call"
    assert owner.get(PATH + "/" + first["id"]).json() == old
    assert owner.get(PATH + "/" + histories[-1]["id"]).json()["status"] == "ready"
    assert [row["id"] for row in other.get(PATH).json()["receipts"]] == [foreign["id"]]
    assert other.get(PATH + "/" + first["id"]).status_code == 404
    assert owner.post("/api/auth/logout").status_code == 204
    assert owner.get(PATH).status_code == 401
    # Expire only this synthetic account's code cooldown, avoiding a real sleep.
    email_scope = keyed(settings, "email-rate/v1", "a@example.test")
    as_user(pg_engine, uid, lambda c: c.execute(update(RateEvent).where(RateEvent.scope == email_scope).values(created_at=now() - timedelta(minutes=2))))
    recovered, new_identity = login()
    assert new_identity["user"]["id"] == uid
    assert recovered.get(PATH).json()["receipts"] == history
    assert recovered.get(PATH + "/" + first["id"]).json() == old
    assert provider.calls == 2
