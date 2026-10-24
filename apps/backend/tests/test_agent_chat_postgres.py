"""Actual PostgreSQL acceptance of the 证见 Agent conversation, using conspicuously synthetic model fixtures."""
import pytest
from sqlalchemy import select

from multi_agent.agents.research_agent.services import agent_chat as chat
from infrastructure.database.models import Operation
from tests.test_postgres import service_input
from tests.test_agent_chat import request
from tests.test_topics_postgres import as_user

pytestmark = pytest.mark.postgres
PATH = "/api/agent/turns"


def test_a_turn_is_recorded_replayed_and_reconciled_without_a_second_call(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    other, _ = login("b@example.test")
    service = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    data = request(serviceId=service["id"], serviceRevision=service["revision"])
    response = owner.post(PATH, json=data)
    assert response.status_code == 201, response.text
    turn = response.json()
    assert turn["status"] == "ready" and turn["id"] == data["idempotencyKey"] and turn["modelCalled"] is True
    assert turn["reply"].startswith("合成测试回执") and turn["actions"] == [{"tool": "next", "args": {}}]
    assert turn["inputFingerprint"] == chat.input_fingerprint(data) and turn["errorCode"] is None
    assert owner.post(PATH, json=data).json() == turn
    assert owner.get(f"{PATH}/{turn['id']}").json() == turn
    assert provider.calls == 1
    assert other.get(f"{PATH}/{turn['id']}").status_code == 404
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation.key).where(Operation.scope == chat.SCOPE)).all())


def test_no_call_without_research_a_current_revision_or_consent(harness):
    _, login, _, provider = harness
    owner, _ = login()
    drafting = owner.post("/api/services", json=service_input(capabilities=["questionnaire"])).json()
    refused = owner.post(PATH, json=request(serviceId=drafting["id"], serviceRevision=drafting["revision"]))
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "capability_unavailable"
    research = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    stale = owner.post(PATH, json=request(serviceId=research["id"], serviceRevision=research["revision"] + 1))
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "revision_conflict"
    unconsented = owner.post(PATH, json=request(serviceId=research["id"], serviceRevision=research["revision"], consent=False))
    assert unconsented.status_code == 422 and unconsented.json()["error"]["code"] == "consent_required"
    assert provider.calls == 0


def test_continuations_are_turns_of_their_own_and_the_last_one_asks_for_nothing(harness):
    _, login, _, provider = harness
    owner, _ = login()
    service = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    results = [{"tool": "light", "text": "整体照度 25%。"}]
    second = owner.post(PATH, json=request(serviceId=service["id"], serviceRevision=service["revision"], step=2, toolResults=results))
    assert second.status_code == 201, second.text
    assert second.json()["step"] == 2 and second.json()["actions"] == [{"tool": "next", "args": {}}]
    last = owner.post(PATH, json=request(serviceId=service["id"], serviceRevision=service["revision"], step=3, toolResults=results)).json()
    assert last["step"] == 3 and last["actions"] == [] and last["droppedActions"] == 1
    assert provider.calls == 2
