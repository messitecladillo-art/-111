from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from multi_agent.agents.contracts import AgentInput, AgentOutput


class DataInput(AgentInput):
    task_type: Literal["full_research", "data_analysis"]
    artifact_refs: list[str] = Field(min_length=1, max_length=100)


class DataDeliverable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data_status: Literal["analyzed", "needs_data", "blocked"]
    input_artifact_refs: list[str] = Field(min_length=1, max_length=100)
    schema_findings: list[dict] = Field(default_factory=list, max_length=500)
    cleaning_log: list[dict] = Field(default_factory=list, max_length=500)
    descriptive_statistics: list[dict] = Field(default_factory=list, max_length=500)
    tests: list[dict] = Field(default_factory=list, max_length=500)
    charts: list[dict] = Field(default_factory=list, max_length=100)
    limitations: list[str] = Field(default_factory=list, max_length=100)


class DataOutput(AgentOutput):
    deliverable: DataDeliverable
