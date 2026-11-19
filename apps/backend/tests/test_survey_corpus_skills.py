"""Verify the 7-skill full-corpus distillation package is synced, tamper-checked and mounted into prompts."""
from pathlib import Path
import json
import runpy

import pytest

from multi_agent import skill_guidance
from multi_agent.agents.contracts import AgentRole
from multi_agent.prompt_registry import build_messages
from shared.contracts import fingerprint

ROOT = Path(__file__).resolve().parents[3]


def test_shipped_survey_corpus_skills_match_canonical_repository_tree():
    generator = runpy.run_path(str(ROOT / "scripts/sync-survey-corpus-skills.py"))
    expected = generator["package"]()
    version, resources = skill_guidance.load_corpus_skills()
    assert resources == expected["resources"]
    assert version == fingerprint(expected["resources"]) == expected["version"]
    assert set(resources) == set(skill_guidance.RESOURCE_PATHS)
    assert all("C:/Users/" not in text and "C:\\Users\\" not in text for text in resources.values())
    assert all("references/" not in text and "scripts/" not in text for text in resources.values())


@pytest.mark.parametrize("role", AgentRole)
def test_every_specialist_role_mounts_signed_corpus_skills(role):
    version, _ = skill_guidance.active_corpus_skills()
    messages = build_messages(role, {"task_id": "synthetic-task", "requirements": {"goal": "test"}})
    system = messages[0]["content"]
    assert f'package="survey-corpus-7pack@{version[:12]}"' in system
    assert "不得据此编造" in system or "绝不据此编造" in system
    if role is AgentRole.RESEARCH:
        assert "双段式标题配方" in system and "母洞察" in system
    elif role is AgentRole.SURVEY:
        assert "Deff" in system and "KANO" in system
    elif role is AgentRole.DATA:
        assert "SHAP" in system and "Runs Test" in system
    elif role is AgentRole.WRITING:
        assert "65" in system and "生图模型" in system and "发散堆叠" in system
    elif role is AgentRole.REVIEWER:
        assert "Logit 完全分离" in system and "1,083" in system


def test_tampered_survey_corpus_package_is_rejected(tmp_path, monkeypatch):
    asset = ROOT / "apps/backend/src/multi_agent/assets/survey-corpus-skills.json"
    tampered = json.loads(asset.read_text(encoding="utf-8"))
    tampered["resources"]["survey-report-architect/SKILL.md"] += "\nextra"
    fake = tmp_path / "tampered.json"
    fake.write_text(json.dumps(tampered, ensure_ascii=False), encoding="utf-8")

    class _FakeFiles:
        def joinpath(self, _name):
            return fake

    monkeypatch.setattr(skill_guidance, "files", lambda _pkg: _FakeFiles())
    with pytest.raises(ValueError, match="hash mismatch"):
        skill_guidance.load_corpus_skills()


def test_standalone_agent_chat_and_proposal_prompts_mount_corpus_norms():
    from uuid import uuid4
    from multi_agent.agents.research_agent.services import agent_chat
    from multi_agent.agents.survey_agent.services import proposals

    chat_prompt = agent_chat.agent_prompt({
        "schemaVersion": 1,
        "idempotencyKey": str(uuid4()),
        "message": "请建议图表和章节思路",
        "history": [],
        "context": {"room": "design", "overall": 0.4},
        "serviceId": str(uuid4()),
        "serviceRevision": 1,
        "consent": True,
    })
    assert "母洞察" in chat_prompt and "<=65页" in chat_prompt and "李克特发散堆叠" in chat_prompt
    prop_prompt = proposals.prompt({"topic": "消费者体验调查"})
    assert "互斥" in prop_prompt and "不兼问" in prop_prompt
