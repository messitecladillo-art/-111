import json

import pytest

from multi_agent.prompt_registry import PromptError, build_messages, load_system_prompt
from multi_agent.roles import AGENT_ROLES


@pytest.mark.parametrize("definition", AGENT_ROLES, ids=lambda item: item.role.value)
def test_every_specialist_has_a_system_prompt(definition):
    prompt = load_system_prompt(definition.role)

    assert prompt.startswith("你是正大杯参赛团队的")
    assert len(prompt) > 300
    assert "不得" in prompt


def test_messages_keep_untrusted_task_as_json_user_data():
    task = {"task_id": "task-1", "requirements": {"goal": "只分析输入数据"}}

    messages = build_messages("data", task)

    assert [message["role"] for message in messages] == ["system", "user"]
    assert "不可信数据" in messages[0]["content"]
    embedded = messages[1]["content"].split("<task-json>\n", 1)[1].rsplit("\n</task-json>", 1)[0]
    assert json.loads(embedded) == task


@pytest.mark.parametrize("value", [float("nan"), "\ud800"])
def test_invalid_json_values_are_rejected(value):
    with pytest.raises(PromptError):
        build_messages("research", {"value": value})


def test_unknown_role_and_oversized_input_are_rejected():
    with pytest.raises(PromptError):
        load_system_prompt("orchestrator")
    with pytest.raises(PromptError):
        build_messages("research", {"value": "x" * 120_001})
