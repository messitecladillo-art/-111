"""Actual PostgreSQL acceptance: a conversation turn and a section draft record the tokens their call reported."""
import json
import pytest

from infrastructure.llm import Completion
from tests.test_postgres import service_input
from tests.test_agent_chat import request as chat_request
from tests.test_section_draft import request as draft_request

pytestmark = pytest.mark.postgres


def counted(text, inputs, outputs):
    completion = Completion(text)
    completion.usage = {"inputTokens": inputs, "outputTokens": outputs}
    return completion


def test_turns_and_drafts_record_the_tokens_their_call_reported(harness):
    _, login, _, provider = harness
    owner, _ = login()

    async def chat(config, key, message):
        provider.calls += 1
        return counted(json.dumps({"reply": "合成测试回执。", "actions": []}, ensure_ascii=False), 1800, 120)

    async def draft(config, key, message):
        provider.calls += 1
        return counted(json.dumps({"paragraphs": [{"text": "合成测试拟稿。"}]}, ensure_ascii=False), 5200, 640)

    provider.agent_chat, provider.section_draft = chat, draft
    research = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    turn = owner.post("/api/agent/turns", json=chat_request(serviceId=research["id"], serviceRevision=research["revision"])).json()
    assert turn["status"] == "ready" and turn["usage"] == {"inputTokens": 1800, "outputTokens": 120}
    assert owner.get(f"/api/agent/turns/{turn['id']}").json()["usage"] == turn["usage"], "the receipt keeps it"
    report = owner.post("/api/services", json=service_input(capabilities=["report"])).json()
    made = owner.post("/api/agent/drafts", json=draft_request(serviceId=report["id"], serviceRevision=report["revision"])).json()
    assert made["status"] == "ready" and made["usage"] == {"inputTokens": 5200, "outputTokens": 640}


def test_a_rejected_answer_still_records_what_it_cost(harness):
    _, login, _, provider = harness
    owner, _ = login()

    async def chat(config, key, message):
        provider.calls += 1
        return counted("这不是约定的 JSON", 900, 45)

    provider.agent_chat = chat
    research = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    turn = owner.post("/api/agent/turns", json=chat_request(serviceId=research["id"], serviceRevision=research["revision"])).json()
    assert turn["status"] == "failed" and turn["errorCode"] == "invalid_response"
    assert turn["usage"] == {"inputTokens": 900, "outputTokens": 45}, "billed once the provider answered"


def test_a_synthetic_call_reports_no_tokens(harness):
    _, login, _, _ = harness
    owner, _ = login()
    research = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    turn = owner.post("/api/agent/turns", json=chat_request(serviceId=research["id"], serviceRevision=research["revision"])).json()
    assert turn["status"] == "ready" and turn["usage"] is None
