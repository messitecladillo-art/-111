"""Shared role/runtime contracts. Domain behavior belongs to each agent package."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AgentRole(str, Enum):
    RESEARCH = "research"
    SURVEY = "survey"
    DATA = "data"
    WRITING = "writing"
    REVIEWER = "reviewer"


class ReviewDecision(str, Enum):
    APPROVE = "approve"
    REVISE = "revise"
    REJECT = "reject"


@dataclass(frozen=True, slots=True)
class RoleDefinition:
    role: AgentRole
    title: str
    focus: str
    responsibilities: tuple[str, ...]
    deliverables: tuple[str, ...]
    prompt_file: str


@dataclass(frozen=True, slots=True)
class AgentResult:
    """Small workflow handoff; large outputs are addressed by artifact refs."""

    summary: str
    artifact_refs: tuple[str, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    unresolved_questions: tuple[str, ...] = ()
    errors: tuple[str, ...] = ()
    review_decision: ReviewDecision | None = None
    output: AgentOutput | None = None


class AgentInput(BaseModel):
    """Common task envelope inherited by the five role-specific input models."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    task_id: str = Field(min_length=1, max_length=64)
    project_id: str = Field(min_length=1, max_length=64)
    task_type: str = Field(min_length=1, max_length=32)
    requirements: dict[str, Any]
    context: dict[str, Any] = Field(default_factory=dict)
    artifact_refs: list[str] = Field(default_factory=list, max_length=100)
    evidence_refs: list[str] = Field(default_factory=list, max_length=200)
    constraints: dict[str, Any] = Field(default_factory=dict)


class AgentOutput(BaseModel):
    """Common result envelope returned by a specialist implementation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    summary: str = Field(min_length=1, max_length=8_000)
    artifact_refs: list[str] = Field(default_factory=list, max_length=100)
    evidence_refs: list[str] = Field(default_factory=list, max_length=200)
    unresolved_questions: list[str] = Field(default_factory=list, max_length=100)
    errors: list[str] = Field(default_factory=list, max_length=50)


# The workflow engine accepts a callable over its persisted state; keeping this
# alias here avoids making the shared agent contract import the workflow layer.
AgentHandler = Callable[[Any], AgentResult]


class RunStatus(str, Enum):
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    NEEDS_INPUT = "needs_input"
    BLOCKED = "blocked"
    FAILED = "failed"


class ToolResult(BaseModel):
    """A trusted server tool returns data and references it actually produced/read."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    data: dict[str, Any] = Field(default_factory=dict)
    artifact_refs: list[str] = Field(default_factory=list, max_length=100)
    evidence_refs: list[str] = Field(default_factory=list, max_length=200)
    classification: Literal["actual", "simulated", "proposed", "inferred"] = "proposed"

    @field_validator("artifact_refs", "evidence_refs")
    @classmethod
    def nonblank_references(cls, values):
        if any(not value.strip() or len(value) > 512 for value in values):
            raise ValueError("Invalid tool artifact/evidence reference")
        return values


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    step: str
    name: str
    result: ToolResult


class AgentRunState(BaseModel):
    """Per-invocation state; subclasses own their typed task and final output."""

    model_config = ConfigDict(extra="forbid")
    task: AgentInput
    status: RunStatus = RunStatus.READY
    current_step: str | None = None
    completed_steps: list[str] = Field(default_factory=list)
    step_results: dict[str, dict[str, Any]] = Field(default_factory=dict)
    tool_calls: list[ToolCall] = Field(default_factory=list, max_length=32)
    output: AgentOutput | None = None
    errors: list[str] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)


@dataclass(frozen=True, slots=True)
class StepRequest:
    """An executor gets task data and an explicit, role-scoped tool capability.

    Executors are synchronous, trusted server integrations, not model-generated
    Python. Secrets belong in their closures, never in task/state/messages.
    """

    role: AgentRole
    step: str
    task: AgentInput
    previous_results: Mapping[str, dict[str, Any]]
    messages: list[dict[str, str]]
    call_tool: Callable[..., ToolResult]


StepExecutor = Callable[[StepRequest], Mapping[str, Any] | BaseModel]
AgentTool = Callable[..., ToolResult]


class AgentExecutionError(RuntimeError):
    def __init__(self, state: AgentRunState):
        super().__init__("; ".join(state.errors) or f"Agent stopped: {state.status.value}")
        self.state = state.model_copy(deep=True)
