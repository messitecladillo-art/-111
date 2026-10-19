from importlib import import_module
from pathlib import Path

import pytest
from pydantic import ValidationError

from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.data_agent import DataInput
from multi_agent.agents.research_agent import ResearchInput
from multi_agent.agents.reviewer_agent import ReviewerInput
from multi_agent.agents.survey_agent import SurveyInput
from multi_agent.agents.writing_agent import WritingInput
from multi_agent.prompt_registry import load_system_prompt
from multi_agent.roles import AGENT_ROLES


@pytest.mark.parametrize("role", AgentRole)
def test_agent_package_name_has_explicit_agent_suffix(role):
    name = f"{role.value}_agent"
    package = import_module(f"multi_agent.agents.{name}")
    assert Path(package.__file__).parent.name == name
    assert package.ROLE.role is role
    assert not Path(package.__file__).parent.with_name(role.value).exists()


@pytest.mark.parametrize("definition", AGENT_ROLES, ids=lambda item: item.role.value)
def test_agent_role_owns_its_prompt_resource(definition):
    assert definition.prompt_file == f"{definition.role.value}.md"
    assert load_system_prompt(definition.role)


@pytest.mark.parametrize(
    ("role", "input_type", "task_type"),
    [
        (AgentRole.RESEARCH, ResearchInput, "topic_design"),
        (AgentRole.SURVEY, SurveyInput, "questionnaire"),
        (AgentRole.DATA, DataInput, "data_analysis"),
        (AgentRole.WRITING, WritingInput, "report"),
        (AgentRole.REVIEWER, ReviewerInput, "report"),
    ],
)
def test_each_agent_exposes_a_role_specific_input_contract(role, input_type, task_type):
    payload = {
        "task_id": "task-1",
        "project_id": "project-1",
        "task_type": task_type,
        "requirements": {"goal": "test"},
    }
    if role is AgentRole.DATA:
        payload["artifact_refs"] = ["artifact-1"]

    parsed = input_type.model_validate(payload)

    assert parsed.task_type == task_type
    with pytest.raises(ValidationError):
        input_type.model_validate({**payload, "unexpected": True})


def test_data_agent_requires_real_artifact_references():
    with pytest.raises(ValidationError):
        DataInput.model_validate(
            {
                "task_id": "task-1",
                "project_id": "project-1",
                "task_type": "data_analysis",
                "requirements": {},
            }
        )
