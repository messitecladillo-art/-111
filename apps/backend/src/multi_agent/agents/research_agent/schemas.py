from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from multi_agent.agents.contracts import AgentInput, AgentOutput


class ResearchInput(AgentInput):
    task_type: Literal["full_research", "topic_design"]


class ResearchDeliverable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    background: str
    research_questions: list[str] = Field(min_length=1, max_length=20)
    objectives: list[str] = Field(min_length=1, max_length=20)
    population: str
    geography: str
    period: str
    framework: list[dict] = Field(default_factory=list, max_length=100)
    feasibility: dict
    evidence_plan: list[dict] = Field(default_factory=list, max_length=100)
    assumptions: list[str] = Field(default_factory=list, max_length=100)


class ResearchOutput(AgentOutput):
    deliverable: ResearchDeliverable
