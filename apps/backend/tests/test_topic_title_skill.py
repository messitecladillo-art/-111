"""Title guidance participates in the bounded model path; no paid/model calls."""
import copy
import json
from pathlib import Path
import runpy

import pytest

from application.providers import FixtureProvider, LiveProvider
from multi_agent.agents.research_agent.services import title_skill, topic_agent as agent
from multi_agent.agents.research_agent.services.topics import load_corpus
from shared.contracts import fingerprint
from shared.errors import ApiError
from tests.test_topic_agent import chain, readable_chain, request

ROOT = Path(__file__).resolve().parents[3]


def test_shipped_title_guidance_matches_canonical_allowlisted_source():
    generator = runpy.run_path(str(ROOT / "scripts/sync-research-title-skill.py"))
    expected = generator["package"]()
    actual = title_skill.load_title_skill()
    assert dict(actual.resources) == expected["resources"]
    assert actual.version == fingerprint(expected["resources"])
    assert set(dict(actual.resources)) == set(title_skill.RESOURCE_PATHS)
    assert all("C:/Users/" not in text and "C:\\Users\\" not in text for _, text in actual.resources)


@pytest.mark.parametrize("change", ["content", "version", "arbitrary_resource", "identity", "empty"])
def test_title_loader_rejects_tampered_or_non_allowlisted_packages(tmp_path, monkeypatch, change):
    value = json.loads(title_skill.PACKAGE_PATH.read_text(encoding="utf-8"))
    if change == "content":
        value["resources"]["SKILL.md"] += "changed"
    elif change == "version":
        value["version"] = "0" * 64
    elif change == "arbitrary_resource":
        value["resources"]["../../private-report.md"] = "must not be loaded"
        value["version"] = fingerprint(value["resources"])
    elif change == "identity":
        value["skill"] = "other-skill"
    else:
        value["resources"]["SKILL.md"] = ""
        value["version"] = fingerprint(value["resources"])
    package = tmp_path / "synthetic-title-guidance.json"
    package.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(title_skill, "PACKAGE_PATH", package)
    with pytest.raises(ValueError):
        title_skill.load_title_skill()


@pytest.mark.asyncio
async def test_actual_topic_provider_callback_receives_title_skill_and_existing_contract(monkeypatch):
    corpus, data = load_corpus(), request(message="请完善给定选题的完整题名，范围仍待核实")
    context = agent.inspect_context(data, corpus, [])
    observed = {}

    async def capture(self, config, key, message, maximum):
        observed.update(message=message, maximum=maximum)
        return await FixtureProvider().topic_agent(config, key, message, context["eligible"])

    monkeypatch.setattr(LiveProvider, "complete", capture)
    provider = LiveProvider()
    raw = await provider.topic_agent({}, "synthetic-key-only", agent.agent_prompt(data, context, []), context["eligible"])
    prompt = observed["message"]
    skill = title_skill.load_title_skill()
    assert f"research-report-title@{skill.version}" in prompt
    assert "不要把“两句四字词＋三个研究维度”变成强制模板" in prompt
    assert "没有确定的人群、城市、方法和样本量不写成既定事实" in prompt
    assert "已有题目获得用户认可时保持原文" in prompt
    material = json.loads(prompt.split("资料JSON：", 1)[1])
    assert material["currentMessage"] == data["message"]
    assert material["currentProfile"] == data["profile"]
    assistant = agent.parse_assistant(raw, data["candidateIds"], {row["id"] for row in context["sources"]})
    assert set(assistant) == {"text", "questions", "items"}
    assert {item["patternId"] for item in assistant["items"]} <= set(data["candidateIds"])
    assert observed["maximum"] == 65536
    assert len(json.dumps({"messages": [{"role": "user", "content": prompt}]}, ensure_ascii=False).encode()) < 65536


def test_title_version_binds_receipts_and_rejects_stale_continuation_without_rewriting_history(monkeypatch):
    session, data, corpus = chain(1)
    original_row = copy.deepcopy(session.rows[("owner", agent.SCOPE, data["parentTurnId"])].response)
    old_versions, old_fingerprint = agent.source_versions(corpus), agent.input_fingerprint(data, corpus)
    current = title_skill.load_title_skill()
    monkeypatch.setattr(agent, "load_title_skill", lambda: title_skill.TitleSkill("1" * 64, current.resources))
    assert agent.source_versions(corpus) != old_versions
    assert agent.input_fingerprint(data, corpus) != old_fingerprint
    with pytest.raises(ApiError) as conflict:
        agent.owned_ancestors(session, "owner", data, corpus)
    assert conflict.value.code == "history_conflict"
    assert session.rows[("owner", agent.SCOPE, data["parentTurnId"])].response == original_row
    historical_session, leaf, _ = readable_chain(1, sourceVersions=old_versions)
    assert agent.read_conversation(historical_session, "owner", leaf, None)[0]["sourceVersions"] == old_versions


def test_public_agent_versions_match_backend_while_topic_proposal_keeps_original_digest():
    corpus = load_corpus()
    public = json.loads((ROOT / "apps/frontend/content/topic-advisor/topic-agent-source-versions.json").read_text())
    original = json.loads((ROOT / "apps/frontend/content/topic-advisor/source-versions.json").read_text())
    assert public == agent.source_versions(corpus)
    assert original["topicDigest"] == corpus["digest"]
    assert public["topicDigest"] != original["topicDigest"]
    assert public["regionCatalog"] == original["regionCatalog"]


def test_active_title_guidance_is_pinned_for_inflight_prompt_and_receipt(monkeypatch):
    title_skill.active_title_skill.cache_clear()
    calls = []
    current = title_skill.load_title_skill()

    def changing_disk():
        calls.append(1)
        return current if len(calls) == 1 else title_skill.TitleSkill("2" * 64, current.resources)

    monkeypatch.setattr(title_skill, "load_title_skill", changing_disk)
    try:
        assert title_skill.active_title_skill().version == current.version
        assert title_skill.active_title_skill().version == current.version
        assert len(calls) == 1
    finally:
        title_skill.active_title_skill.cache_clear()


def test_local_receipt_never_claims_model_or_title_execution():
    corpus, data = load_corpus(), request()
    context = agent.inspect_context(data, corpus, [])
    receipt = agent.turn_receipt(data, corpus, context, [], "fixture")
    assert receipt["modelCalled"] is False and receipt["providerMode"] == "local"
    assert {row["name"] for row in receipt["tools"]} == {"context", "catalog", "feasibility", "sources"}
