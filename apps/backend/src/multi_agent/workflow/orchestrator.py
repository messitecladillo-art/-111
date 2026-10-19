"""Small, deterministic coordinator for the five specialist roles.

The coordinator owns sequencing and approval gates; specialist handlers own
the domain work. It deliberately stores artifact references, not file contents.
State is JSON-serializable so a repository/checkpointer can persist it later.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Mapping
from uuid import uuid4

from multi_agent.agents.contracts import AgentHandler, AgentOutput, AgentResult, AgentRole, ReviewDecision


class WorkflowError(ValueError):
    """Raised when a task or workflow transition violates the contract."""


class WorkflowStatus(str, Enum):
    READY = "ready"
    RUNNING = "running"
    NEEDS_INPUT = "needs_input"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(slots=True)
class WorkflowState:
    task_id: str
    project_id: str
    task_type: str
    requirements: dict[str, Any]
    context: dict[str, Any] = field(default_factory=dict)
    input_artifact_refs: list[str] = field(default_factory=list)
    constraints: dict[str, Any] = field(default_factory=dict)
    status: WorkflowStatus = WorkflowStatus.READY
    current_role: AgentRole | None = None
    awaiting_approval: str | None = None
    retry_count: dict[str, int] = field(default_factory=dict)
    max_retries: int = 2
    artifact_refs: list[str] = field(default_factory=list)
    evidence_refs: list[str] = field(default_factory=list)
    unresolved_questions: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    summary: str = ""
    revision: int = 0
    agent_outputs: dict[str, dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["status"] = self.status.value
        value["current_role"] = self.current_role.value if self.current_role else None
        return value

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "WorkflowState":
        data = dict(value)
        data["status"] = WorkflowStatus(data["status"])
        if data.get("current_role"):
            data["current_role"] = AgentRole(data["current_role"])
        return cls(**data)


# The three human gates mirror the v0.1 workflow: approved research design,
# approved questionnaire, and final reviewed report.
_PIPELINE: dict[str, tuple[AgentRole, ...]] = {
    "full_research": (
        AgentRole.RESEARCH,
        AgentRole.REVIEWER,
        AgentRole.SURVEY,
        AgentRole.REVIEWER,
        AgentRole.DATA,
        AgentRole.REVIEWER,
        AgentRole.WRITING,
        AgentRole.REVIEWER,
    ),
    "topic_design": (AgentRole.RESEARCH, AgentRole.REVIEWER),
    "questionnaire": (AgentRole.SURVEY, AgentRole.REVIEWER),
    "data_analysis": (AgentRole.DATA, AgentRole.REVIEWER),
    "report": (AgentRole.WRITING, AgentRole.REVIEWER),
}

_APPROVAL_AFTER: dict[str, frozenset[int]] = {
    "topic_design": frozenset({1}),
    "questionnaire": frozenset({3}),
    "full_research": frozenset({1, 3}),
}


def review_target(state: WorkflowState) -> AgentRole | None:
    """Derive the review target from the actual pipeline, not caller-supplied context."""
    pipeline = _PIPELINE[state.task_type]
    index = state.revision
    if 0 < index < len(pipeline) and pipeline[index] is AgentRole.REVIEWER:
        return pipeline[index - 1]
    return None


def create_workflow(
    *,
    project_id: str,
    task_type: str,
    requirements: Mapping[str, Any],
    context: Mapping[str, Any] | None = None,
    input_artifact_refs: tuple[str, ...] | list[str] = (),
    constraints: Mapping[str, Any] | None = None,
    task_id: str | None = None,
    max_retries: int = 2,
) -> WorkflowState:
    if task_type not in _PIPELINE:
        raise WorkflowError(f"Unsupported task_type: {task_type}")
    if not project_id.strip():
        raise WorkflowError("project_id is required")
    if max_retries < 0 or max_retries > 5:
        raise WorkflowError("max_retries must be between 0 and 5")
    return WorkflowState(
        task_id=task_id or str(uuid4()),
        project_id=project_id,
        task_type=task_type,
        requirements=dict(requirements),
        context=dict(context or {}),
        input_artifact_refs=list(input_artifact_refs),
        constraints=dict(constraints or {}),
        max_retries=max_retries,
    )


class WorkflowEngine:
    """Execute one specialist step at a time with explicit human checkpoints."""

    def __init__(self, handlers: Mapping[AgentRole, AgentHandler]):
        self._handlers = dict(handlers)

    def next_role(self, state: WorkflowState) -> AgentRole | None:
        if state.status not in (WorkflowStatus.READY, WorkflowStatus.RUNNING):
            return None
        pipeline = _PIPELINE[state.task_type]
        return pipeline[state.revision] if state.revision < len(pipeline) else None

    def advance(self, state: WorkflowState) -> WorkflowState:
        if state.status in (WorkflowStatus.COMPLETED, WorkflowStatus.FAILED, WorkflowStatus.BLOCKED):
            return state
        if state.status == WorkflowStatus.NEEDS_INPUT:
            return state
        pipeline = _PIPELINE[state.task_type]
        index = state.revision
        if index >= len(pipeline):
            state.status = WorkflowStatus.COMPLETED
            state.current_role = None
            return state

        role = pipeline[index]
        if role == AgentRole.DATA and not state.input_artifact_refs:
            state.status = WorkflowStatus.NEEDS_INPUT
            state.current_role = role
            state.awaiting_approval = "upload_real_data"
            state.unresolved_questions = ["请上传真实调查数据文件；未提供数据前不会执行统计分析。"]
            return state
        handler = self._handlers.get(role)
        if handler is None:
            state.status = WorkflowStatus.BLOCKED
            state.current_role = role
            state.errors.append(f"No handler registered for role: {role.value}")
            return state

        state.status = WorkflowStatus.RUNNING
        state.current_role = role
        try:
            result = handler(state)
        except Exception as exc:  # convert role failures into an inspectable task result
            state.status = WorkflowStatus.FAILED
            state.errors.append(f"{role.value} failed: {type(exc).__name__}")
            return state

        if not isinstance(result, AgentResult):
            state.status = WorkflowStatus.FAILED
            state.errors.append(f"{role.value} returned an invalid result")
            return state
        if result.output is not None:
            if not isinstance(result.output, AgentOutput):
                state.status = WorkflowStatus.FAILED
                state.errors.append(f"{role.value} returned an invalid structured output")
                return state
            state.agent_outputs[role.value] = result.output.model_dump(mode="json")
        state.summary = result.summary
        state.artifact_refs.extend(ref for ref in result.artifact_refs if ref not in state.artifact_refs)
        state.evidence_refs.extend(ref for ref in result.evidence_refs if ref not in state.evidence_refs)
        state.unresolved_questions = list(result.unresolved_questions)
        state.errors.extend(result.errors)

        if result.errors:
            state.status = WorkflowStatus.BLOCKED
            return state
        if result.unresolved_questions:
            state.status = WorkflowStatus.NEEDS_INPUT
            state.awaiting_approval = "agent_input"
            return state
        if role == AgentRole.REVIEWER:
            if result.review_decision is None:
                state.status = WorkflowStatus.FAILED
                state.errors.append("Reviewer must return a review_decision")
                return state
            if result.review_decision == ReviewDecision.REJECT:
                state.status = WorkflowStatus.BLOCKED
                state.errors.append("Reviewer rejected the current deliverable")
                return state
            if result.review_decision == ReviewDecision.REVISE:
                target = pipeline[index - 1]
                attempts = state.retry_count.get(target.value, 0) + 1
                state.retry_count[target.value] = attempts
                if attempts > state.max_retries:
                    state.status = WorkflowStatus.BLOCKED
                    state.errors.append(f"Retry limit reached for {target.value}")
                    return state
                state.revision = index - 1
                state.status = WorkflowStatus.READY
                return state

        state.revision += 1
        if index in _APPROVAL_AFTER.get(state.task_type, ()):
            state.status = WorkflowStatus.NEEDS_INPUT
            state.awaiting_approval = f"approve_{role.value}"
            return state
        state.status = WorkflowStatus.READY
        if state.revision >= len(pipeline):
            state.status = WorkflowStatus.COMPLETED
            state.current_role = None
        return state

    def approve(self, state: WorkflowState, *, approved: bool, feedback: str = "") -> WorkflowState:
        if state.status != WorkflowStatus.NEEDS_INPUT or not state.awaiting_approval:
            raise WorkflowError("Workflow is not waiting for user input")
        if state.awaiting_approval == "agent_input":
            if not feedback.strip():
                raise WorkflowError("Feedback is required to answer an agent question")
            state.context["user_feedback"] = feedback.strip()
            state.unresolved_questions.clear()
        elif state.awaiting_approval == "upload_real_data":
            raise WorkflowError("Use provide_input to attach real data artifact references")
        elif not approved:
            if not feedback.strip():
                raise WorkflowError("Feedback is required when requesting changes")
            pipeline = _PIPELINE[state.task_type]
            if state.current_role is None:
                raise WorkflowError("Cannot route feedback without a current role")
            role_index = state.revision - 1
            target_index = role_index - 1 if state.current_role == AgentRole.REVIEWER else role_index
            if target_index < 0:
                raise WorkflowError("Cannot route feedback to a prior specialist")
            role = pipeline[target_index]
            attempts = state.retry_count.get(role.value, 0) + 1
            state.retry_count[role.value] = attempts
            if attempts > state.max_retries:
                state.status = WorkflowStatus.BLOCKED
                state.errors.append(f"Retry limit reached for {role.value}")
                state.awaiting_approval = None
                return state
            state.context["user_feedback"] = feedback.strip()
            state.revision = target_index
        state.awaiting_approval = None
        state.status = WorkflowStatus.READY
        return state

    def provide_input(self, state: WorkflowState, artifact_refs: list[str] | tuple[str, ...]) -> WorkflowState:
        if state.status != WorkflowStatus.NEEDS_INPUT or state.awaiting_approval != "upload_real_data":
            raise WorkflowError("Workflow is not waiting for a data upload")
        refs = [ref.strip() for ref in artifact_refs if isinstance(ref, str) and ref.strip()]
        if not refs:
            raise WorkflowError("At least one uploaded artifact reference is required")
        state.input_artifact_refs.extend(ref for ref in refs if ref not in state.input_artifact_refs)
        state.unresolved_questions.clear()
        state.awaiting_approval = None
        state.status = WorkflowStatus.READY
        return state
