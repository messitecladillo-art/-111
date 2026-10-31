"""Actual PostgreSQL acceptance of section drafting, using conspicuously synthetic model fixtures."""
import pytest
from sqlalchemy import select

from multi_agent.agents.writing_agent.services import section_draft as draft
from infrastructure.database.models import Operation
from tests.test_postgres import service_input
from tests.test_section_draft import request
from tests.test_topics_postgres import as_user

pytestmark = pytest.mark.postgres
PATH = "/api/agent/drafts"


def test_a_draft_is_recorded_replayed_and_reconciled_without_a_second_call(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    other, _ = login("b@example.test")
    service = owner.post("/api/services", json=service_input(capabilities=["report"])).json()
    data = request(serviceId=service["id"], serviceRevision=service["revision"])
    response = owner.post(PATH, json=data)
    assert response.status_code == 201, response.text
    made = response.json()
    assert made["status"] == "ready" and made["id"] == data["idempotencyKey"] and made["modelCalled"] is True and made["node"] == "sample.profile"
    assert made["paragraphs"] == [{"text": "合成测试拟稿：只验证拟稿链，不代表真实模型的写作。", "facts": []},
                                  {"text": "合成测试拟稿引用第一条事实：{F1}。", "facts": ["F1"]}]
    assert made["inputFingerprint"] == draft.input_fingerprint(data) and made["errorCode"] is None
    assert owner.post(PATH, json=data).json() == made
    assert owner.get(f"{PATH}/{made['id']}").json() == made
    assert provider.calls == 1
    assert other.get(f"{PATH}/{made['id']}").status_code == 404
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation.key).where(Operation.scope == draft.SCOPE)).all())


def test_no_call_without_the_report_capability_a_current_revision_or_consent(harness):
    _, login, _, provider = harness
    owner, _ = login()
    research = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    refused = owner.post(PATH, json=request(serviceId=research["id"], serviceRevision=research["revision"]))
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "capability_unavailable"
    report = owner.post("/api/services", json=service_input(capabilities=["report"])).json()
    stale = owner.post(PATH, json=request(serviceId=report["id"], serviceRevision=report["revision"] + 1))
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "revision_conflict"
    unconsented = owner.post(PATH, json=request(serviceId=report["id"], serviceRevision=report["revision"], consent=False))
    assert unconsented.status_code == 422 and unconsented.json()["error"]["code"] == "consent_required"
    assert provider.calls == 0


def test_a_key_in_the_outline_is_refused_before_any_call(harness):
    _, login, _, provider = harness
    owner, _ = login()
    # A quote in the key: escaped once in the prompt, so only the check of the decoded outline can find it.
    key = 'synthetic-"quoted"-private-key'
    service = owner.post("/api/services", json=service_input(capabilities=["report"], apiKey=key)).json()
    data = request(section={**request()["section"], "node": "abstract", "title": "摘要"}, serviceId=service["id"], serviceRevision=service["revision"],
                   outline=[{"title": "样本特征分析", "excerpt": f"误贴的密钥 {key}"}])
    refused = owner.post(PATH, json=data)
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "sensitive_input"
    assert provider.calls == 0
