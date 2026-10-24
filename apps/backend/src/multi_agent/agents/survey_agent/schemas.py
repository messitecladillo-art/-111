from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from multi_agent.agents.contracts import AgentInput, AgentOutput


class SurveyInput(AgentInput):
    task_type: Literal["full_research", "questionnaire"]


class SurveyDeliverable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variables: list[dict] = Field(default_factory=list, max_length=100)
    questionnaire: dict
    sampling: dict
    pilot_plan: dict
    privacy_and_ethics: list[str] = Field(default_factory=list, max_length=100)


class SurveyOutput(AgentOutput):
    deliverable: SurveyDeliverable
