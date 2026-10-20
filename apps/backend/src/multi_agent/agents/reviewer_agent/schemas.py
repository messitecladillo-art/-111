from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from multi_agent.agents.contracts import AgentInput, AgentOutput, ReviewDecision


class ReviewerInput(AgentInput):
    task_type: Literal["full_research", "topic_design", "questionnaire", "data_analysis", "report"]
    review_stage: Literal["research", "survey", "data", "writing", "final"] = "final"


class ReviewFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    severity: Literal["blocking", "major", "minor"]
    location: str
    issue: str
    evidence_ref: str = ""
    required_change: str


class ConsistencyCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    check: str
    result: Literal["pass", "fail", "uncertain"]
    details: str


class CompetitionReadiness(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ready", "not_ready", "not_assessed"]
    items: list[str] = Field(default_factory=list, max_length=100)
    basis: str


class ReviewerDeliverable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: ReviewDecision
    stage: Literal["research", "survey", "data", "writing", "final"]
    findings: list[ReviewFinding] = Field(default_factory=list, max_length=200)
    consistency_checks: list[ConsistencyCheck] = Field(default_factory=list, max_length=200)
    evidence_gaps: list[str] = Field(default_factory=list, max_length=100)
    ethics_and_privacy: list[str] = Field(default_factory=list, max_length=100)
    competition_readiness: CompetitionReadiness
    revision_request: str = ""


class ReviewerOutput(AgentOutput):
    deliverable: ReviewerDeliverable
