from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from multi_agent.agents.contracts import AgentInput, AgentOutput


class WritingInput(AgentInput):
    task_type: Literal["full_research", "report"]


class WritingDeliverable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["draft", "needs_input"]
    title: str
    abstract: str
    chapters: list[dict] = Field(min_length=1, max_length=100)
    conclusions: list[dict] = Field(default_factory=list, max_length=100)
    recommendations: list[dict] = Field(default_factory=list, max_length=100)
    missing_material: list[str] = Field(default_factory=list, max_length=100)
    export_artifact_ref: str = ""


class WritingOutput(AgentOutput):
    deliverable: WritingDeliverable
