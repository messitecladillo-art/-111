"""Small shared execution mechanics; role steps/policies live in each agent.

No model client, HTTP route, database transaction or role registry belongs here.
"""

from __future__ import annotations

from copy import deepcopy
import inspect
import json
from typing import Any, Generic, Mapping, TypeVar

from pydantic import BaseModel

from multi_agent.agents.contracts import (
    AgentExecutionError, AgentInput, AgentOutput, AgentRole, AgentRunState,
    AgentTool, RunStatus, StepExecutor, StepRequest, ToolCall, ToolResult,
)
from multi_agent.prompt_registry import MAX_TASK_BYTES, build_messages


StateT = TypeVar("StateT", bound=AgentRunState)


def json_object(value: Any) -> dict[str, Any]:
    """Copy/validate JSON and bound each intermediate/tool/final result."""
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    if not isinstance(value, Mapping):
        raise ValueError("Expected a JSON object")
    raw = json.dumps(dict(value), ensure_ascii=False, allow_nan=False)
    if len(raw.encode("utf-8")) > MAX_TASK_BYTES:
        raise ValueError("Agent result exceeds the size limit")
    return json.loads(raw)


def require_output(state: StateT):
    if state.output is None:
        raise AgentExecutionError(state)
    return state.output


class InternalWorkflow(Generic[StateT]):
    """A bounded sequential workflow with inspectable, JSON-safe step boundaries.

    advance() returns a new state, never mutating a caller's checkpoint. A failed
    step is not automatically retried (tools may have external side effects).
    A running checkpoint is refused rather than replayed blindly.
    """

    role: AgentRole
    input_type: type[AgentInput]
    output_type: type[AgentOutput]
    state_type: type[StateT]
    steps: tuple[str, ...]

    def __init__(self, *, executors: Mapping[str, StepExecutor] | None = None,
                 tools: Mapping[str, AgentTool] | None = None):
        self._executors = dict(executors or {})
        self._tools = dict(tools or {})
        if set(self._executors) - set(self.steps):
            raise ValueError("Unknown internal workflow step")
        if any(not callable(value) for value in (*self._executors.values(), *self._tools.values())):
            raise TypeError("Executors and tools must be callable")
        if any(inspect.iscoroutinefunction(value) for value in (*self._executors.values(), *self._tools.values())):
            raise TypeError("Internal executors/tools must be synchronous")

    def start(self, task: AgentInput | Mapping[str, Any]) -> StateT:
        raw = task.model_dump(mode="python") if isinstance(task, AgentInput) else task
        parsed = self.input_type.model_validate(raw).model_copy(deep=True)
        json_object(parsed)
        for ref in (*parsed.artifact_refs, *parsed.evidence_refs):
            if not ref.strip() or len(ref) > 512:
                raise ValueError("Invalid artifact/evidence reference")
        return self.state_type(task=parsed)

    def run(self, task: AgentInput | Mapping[str, Any]) -> StateT:
        state = self.start(task)
        for _ in self.steps:
            state = self.advance(state)
            if state.status is not RunStatus.READY:
                break
        return state

    def advance(self, checkpoint: StateT) -> StateT:
        state = self.state_type.model_validate(checkpoint.model_dump(mode="python")).model_copy(deep=True)
        if state.status not in (RunStatus.READY, RunStatus.RUNNING):
            return state
        index = len(state.completed_steps)
        if (state.status is RunStatus.RUNNING or index >= len(self.steps)
                or state.completed_steps != list(self.steps[:index])
                or set(state.step_results) != set(state.completed_steps)
                or state.output is not None):
            state.status = RunStatus.BLOCKED
            state.errors.append("invalid_internal_checkpoint")
            return state
        step = self.steps[index]
        state.current_step = step
        executor = self._executors.get(step)
        if executor is None:
            state.status = RunStatus.BLOCKED
            state.errors.append(f"step_not_configured:{self.role.value}:{step}")
            return state
        state.status = RunStatus.RUNNING
        try:
            payload = {
                "task": state.task.model_dump(mode="json"),
                "step": step,
                "previous_results": deepcopy(state.step_results),
                "tool_results": [call.model_dump(mode="json") for call in state.tool_calls],
            }
            messages = build_messages(self.role, payload, step=step)

            def call_tool(name: str, **kwargs: Any) -> ToolResult:
                if state.status is not RunStatus.RUNNING or state.current_step != step:
                    raise RuntimeError("Tool capability is outside its active step")
                if name not in self._tools:
                    raise ValueError("Tool not registered for this agent")
                if len(state.tool_calls) >= 32:
                    raise ValueError("Tool call limit reached")
                result = self._tools[name](**kwargs)
                if not isinstance(result, ToolResult):
                    raise TypeError("Tools must return ToolResult")
                result = ToolResult.model_validate(json_object(result))
                state.tool_calls.append(ToolCall(step=step, name=name, result=result))
                return result.model_copy(deep=True)

            request = StepRequest(self.role, step, state.task.model_copy(deep=True),
                                  deepcopy(state.step_results), messages, call_tool)
            value = json_object(executor(request))
            if index == len(self.steps) - 1:
                output = self.output_type.model_validate(value)
                self.validate_output(state, output)
                state.output = output
                state.errors.extend(output.errors)
                state.unresolved_questions.extend(output.unresolved_questions)
                state.status = (RunStatus.BLOCKED if output.errors else
                                RunStatus.NEEDS_INPUT if output.unresolved_questions else RunStatus.COMPLETED)
            else:
                state.status = RunStatus.READY
            state.step_results[step] = value
            state.completed_steps.append(step)
        except Exception as exc:
            # Tool/provider exception messages can contain keys, URLs or raw PII.
            state.status = RunStatus.FAILED
            state.errors.append(f"step_failed:{self.role.value}:{step}:{type(exc).__name__}")
        return state

    def validate_output(self, state: StateT, output: AgentOutput) -> None:
        artifacts, evidence = self.known_references(state)
        if set(output.artifact_refs) - artifacts or set(output.evidence_refs) - evidence:
            raise ValueError("Agent invented an artifact or evidence reference")

    def known_references(self, state: StateT) -> tuple[set[str], set[str]]:
        artifacts = set(state.task.artifact_refs)
        evidence = set(state.task.evidence_refs)
        for call in state.tool_calls:
            artifacts.update(call.result.artifact_refs)
            evidence.update(call.result.evidence_refs)
        return artifacts, evidence
