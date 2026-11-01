"""Small, deterministic coordinator for the five specialist roles.

The coordinator owns sequencing and approval gates; specialist handlers own
the domain work. It deliberately stores artifact references, not file contents.
State is JSON-serializable; the application persists each prepared role before
external execution and applies its result against that exact checkpoint.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
import inspect
import json
from enum import Enum
from typing import Any, Awaitable, Callable, Mapping
from uuid import uuid4

from multi_agent.agents.contracts import AgentHandler, AgentOutput, AgentResult, AgentRole, ReviewDecision
from multi_agent.prompt_registry import MAX_TASK_BYTES


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


# Human approval follows review of the research design and questionnaire.
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

_APPROVAL_AFTER_REVIEW: dict[str, frozenset[AgentRole]] = {
    "topic_design": frozenset({AgentRole.RESEARCH}),
    "questionnaire": frozenset({AgentRole.SURVEY}),
    "full_research": frozenset({AgentRole.RESEARCH, AgentRole.SURVEY}),
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


# A task can retain a bounded result from each role and bounded review history.
# This is a persistence bound, not permission to send the whole checkpoint to a model.
MAX_WORKFLOW_STATE_BYTES = 1_000_000
WorkflowStepHandler = Callable[[WorkflowState], AgentResult | Awaitable[AgentResult]]


@dataclass(frozen=True, slots=True)
class PreparedStep:
    """One isolated role invocation, or a no-dispatch transition.

    The application must commit ``state`` before calling ``handler``. Give the
    callback a separate copy and apply its result to the committed snapshot.
    The callable may be async; invocation, leases, timeouts and unknown outcomes
    belong to the application layer, outside database transactions.
    """

    state: WorkflowState
    role: AgentRole | None = None
    handler: WorkflowStepHandler | None = None


def _bounded_json(value: Any, limit: int) -> Any:
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False)
    if len(raw.encode("utf-8")) > limit:
        raise ValueError("Workflow payload exceeds the size limit")
    return json.loads(raw)


def _copy_state(state: WorkflowState) -> WorkflowState:
    if not isinstance(state, WorkflowState):
        raise WorkflowError("Invalid workflow checkpoint")
    try:
        copied = WorkflowState.from_dict(_bounded_json(state.to_dict(), MAX_WORKFLOW_STATE_BYTES))
        if (copied.task_type not in _PIPELINE or type(copied.revision) is not int
                or not 0 <= copied.revision <= len(_PIPELINE[copied.task_type])
                or type(copied.max_retries) is not int or not 0 <= copied.max_retries <= 5):
            raise ValueError("Invalid workflow position")
        if (not isinstance(copied.requirements, dict) or not isinstance(copied.context, dict)
                or not isinstance(copied.constraints, dict) or not isinstance(copied.retry_count, dict)
                or not isinstance(copied.agent_outputs, dict)):
            raise ValueError("Invalid workflow data")
        for values in (copied.input_artifact_refs, copied.artifact_refs, copied.evidence_refs,
                       copied.unresolved_questions, copied.errors):
            if not isinstance(values, list) or any(type(value) is not str for value in values):
                raise ValueError("Invalid workflow references")
        for role, count in copied.retry_count.items():
            if role not in {item.value for item in AgentRole} or type(count) is not int or count < 0:
                raise ValueError("Invalid workflow retry count")
        return copied
    except (TypeError, ValueError, OverflowError, RecursionError, AttributeError):
        raise WorkflowError("Invalid workflow checkpoint") from None


def _copy_result(result: AgentResult, role: AgentRole) -> AgentResult:
    """Validate before merging anything; dataclass annotations alone are not checks."""
    if not isinstance(result, AgentResult):
        raise ValueError("Invalid result type")
    if type(result.summary) is not str or not result.summary.strip() or len(result.summary) > 8_000:
        raise ValueError("Invalid result summary")
    for values, count, width in ((result.artifact_refs, 100, 512),
                                 (result.evidence_refs, 200, 512),
                                 (result.unresolved_questions, 100, 8_000),
                                 (result.errors, 50, 8_000)):
        if (not isinstance(values, (list, tuple)) or len(values) > count
                or any(type(value) is not str or not value.strip() or len(value) > width for value in values)):
            raise ValueError("Invalid result field")
    if result.review_decision is not None and not isinstance(result.review_decision, ReviewDecision):
        raise ValueError("Invalid review decision")
    if role is not AgentRole.REVIEWER and result.review_decision is not None:
        raise ValueError("Only the reviewer can decide a review")
    if (role is AgentRole.REVIEWER and result.review_decision is None
            and not result.errors and not result.unresolved_questions):
        raise ValueError("A completed reviewer handoff needs a decision")
    output = None
    if result.output is not None:
        if not isinstance(result.output, AgentOutput):
            raise ValueError("Invalid structured output")
        # Re-validate instead of trusting a mutable nested object or model_construct.
        raw_output = result.output.model_dump(mode="python", warnings=False)
        # JSON-mode serialization can turn NaN into null; reject it first.
        raw_output = _bounded_json(raw_output, MAX_TASK_BYTES)
        output = type(result.output).model_validate(raw_output)
        if (output.summary != result.summary
                or tuple(output.artifact_refs) != tuple(result.artifact_refs)
                or tuple(output.evidence_refs) != tuple(result.evidence_refs)
                or tuple(output.unresolved_questions) != tuple(result.unresolved_questions)
                or tuple(output.errors) != tuple(result.errors)):
            raise ValueError("Handoff envelope contradicts its structured output")
        if role is AgentRole.REVIEWER and "deliverable" in raw_output:
            deliverable = raw_output["deliverable"]
            if not isinstance(deliverable, dict) or deliverable.get("decision") != result.review_decision:
                raise ValueError("Review decision contradicts its structured deliverable")
    payload = _bounded_json({
        "summary": result.summary, "artifact_refs": result.artifact_refs,
        "evidence_refs": result.evidence_refs,
        "unresolved_questions": result.unresolved_questions, "errors": result.errors,
        "review_decision": result.review_decision.value if result.review_decision else None,
        "output": output.model_dump(mode="json") if output else None,
    }, MAX_TASK_BYTES)
    if output is not None:
        output = type(output).model_validate(payload["output"])
    return AgentResult(
        summary=payload["summary"], artifact_refs=tuple(payload["artifact_refs"]),
        evidence_refs=tuple(payload["evidence_refs"]),
        unresolved_questions=tuple(payload["unresolved_questions"]), errors=tuple(payload["errors"]),
        review_decision=result.review_decision, output=output,
    )


class WorkflowEngine:
    """Execute one specialist step at a time with explicit human checkpoints."""

    def __init__(self, handlers: Mapping[AgentRole, WorkflowStepHandler]):
        self._handlers = dict(handlers)

    def next_role(self, state: WorkflowState) -> AgentRole | None:
        if state.status is not WorkflowStatus.READY:
            return None
        pipeline = _PIPELINE[state.task_type]
        return pipeline[state.revision] if state.revision < len(pipeline) else None

    def prepare_step(self, state: WorkflowState) -> PreparedStep:
        """Prepare exactly one role without executing it or mutating the caller.

        RUNNING checkpoints are never re-issued. A durable caller must reconcile
        its recorded invocation rather than feed it back into automatic execution.
        """
        state = _copy_state(state)
        if state.status is not WorkflowStatus.READY:
            return PreparedStep(state)
        pipeline = _PIPELINE[state.task_type]
        index = state.revision
        if index >= len(pipeline):
            state.status = WorkflowStatus.COMPLETED
            state.current_role = None
            return PreparedStep(state)
        role = pipeline[index]
        if role is AgentRole.DATA and not state.input_artifact_refs:
            state.status = WorkflowStatus.NEEDS_INPUT
            state.current_role = role
            state.awaiting_approval = "upload_real_data"
            state.unresolved_questions = ["请上传真实调查数据文件；未提供数据前不会执行统计分析。"]
            return PreparedStep(state)
        handler = self._handlers.get(role)
        if handler is None:
            state.status = WorkflowStatus.BLOCKED
            state.current_role = role
            state.errors.append(f"No handler registered for role: {role.value}")
            return PreparedStep(state)
        state.status = WorkflowStatus.RUNNING
        state.current_role = role
        return PreparedStep(state, role, handler)

    def apply_result(self, prepared: WorkflowState, result: AgentResult) -> WorkflowState:
        """Apply a returned result only; never invoke or catch a provider call.

        The application passes its committed prepared snapshot, not a callback's
        mutable input. Exceptions raised while invoking the callback stay with
        that application, so it can persist a potentially billed unknown outcome.
        Older internal adapters may already suppress provider exceptions and must
        not be registered for billed execution without an explicit outcome contract.
        """
        state = _copy_state(prepared)
        pipeline = _PIPELINE[state.task_type]
        index = state.revision
        if (state.status is not WorkflowStatus.RUNNING or index >= len(pipeline)
                or state.current_role is not pipeline[index]):
            raise WorkflowError("Result does not match a prepared workflow step")
        role = pipeline[index]
        try:
            checked = _copy_result(result, role)
            updated = self._apply_result(state, checked)
            return _copy_state(updated)
        except (TypeError, ValueError, OverflowError, RecursionError, AttributeError):
            # No partial references/output from a malformed handoff are published.
            failed = _copy_state(prepared)
            failed.status = WorkflowStatus.FAILED
            failed.errors.append("invalid_agent_result")
            return failed

    def advance(self, state: WorkflowState) -> WorkflowState:
        """Legacy synchronous in-place execution; durable callers use prepare/apply."""
        prepared = self.prepare_step(state)
        updated = prepared.state
        if prepared.handler is not None:
            try:
                result = prepared.handler(_copy_state(prepared.state))
                if inspect.isawaitable(result):
                    if inspect.iscoroutine(result):
                        result.close()
                    raise TypeError("Async handlers require the durable prepare/apply caller")
            except Exception as exc:
                updated.status = WorkflowStatus.FAILED
                updated.errors.append(f"{prepared.role.value} failed: {type(exc).__name__}")
            else:
                updated = self.apply_result(prepared.state, result)
        # Preserve the established in-place library API without exposing its
        # authoritative state object to the handler.
        for item in fields(WorkflowState):
            setattr(state, item.name, getattr(updated, item.name))
        return state

    def _apply_result(self, state: WorkflowState, result: AgentResult) -> WorkflowState:
        pipeline = _PIPELINE[state.task_type]
        index = state.revision
        role = pipeline[index]
        if result.output is not None:
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

        needs_approval = review_target(state) in _APPROVAL_AFTER_REVIEW.get(state.task_type, ())
        state.revision += 1
        if needs_approval:
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
