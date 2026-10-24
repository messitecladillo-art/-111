"""Adapt public Agent entries to the cross-role coordinator's handler contract."""

from copy import deepcopy
from typing import Mapping, Protocol

from pydantic import ValidationError

from multi_agent.agents.contracts import AgentResult, AgentRole, AgentRunState, RunStatus
from multi_agent.workflow.orchestrator import WorkflowState, review_target


class Specialist(Protocol):
    role: AgentRole

    def run_with_state(self, task: dict) -> AgentRunState: ...


def create_agent_handlers(agents: Mapping[AgentRole, Specialist]):
    """Only explicitly configured agents are registered; no synthetic fallback.

    This bridge knows each Agent's public entry, not its workflow/tools/services.
    Input data references stay separate from generated plans/charts/report refs.
    """
    handlers = {}
    for role, agent in agents.items():
        if not isinstance(role, AgentRole) or agent.role is not role:
            raise ValueError("Agent instance does not match its registered role")
        handlers[role] = _handler(role, agent)
    return handlers


def _handler(role: AgentRole, agent: Specialist):
    def handle(state: WorkflowState) -> AgentResult:
        context = deepcopy(state.context)
        context["upstream_outputs"] = deepcopy(state.agent_outputs)
        refs = (state.input_artifact_refs if role is AgentRole.DATA else
                list(dict.fromkeys([*state.input_artifact_refs, *state.artifact_refs])))
        task = {
            "task_id": state.task_id, "project_id": state.project_id,
            "task_type": state.task_type, "requirements": deepcopy(state.requirements),
            "context": context, "artifact_refs": list(refs),
            "evidence_refs": list(state.evidence_refs), "constraints": deepcopy(state.constraints),
        }
        if role is AgentRole.REVIEWER:
            target = review_target(state)
            task["review_stage"] = target.value if target else "final"
        try:
            run = agent.run_with_state(task)
        except (ValidationError, ValueError):
            return AgentResult("Agent 输入无效，未执行。", errors=(f"invalid_agent_input:{role.value}",))
        if run.output is None:
            return AgentResult("Agent 未完成，未生成成果。", errors=tuple(run.errors or [f"agent_stopped:{role.value}"]),
                               unresolved_questions=tuple(run.unresolved_questions))
        output = run.output
        return AgentResult(
            summary=output.summary, artifact_refs=tuple(output.artifact_refs),
            evidence_refs=tuple(output.evidence_refs),
            unresolved_questions=tuple(run.unresolved_questions), errors=tuple(run.errors),
            review_decision=(output.deliverable.decision if role is AgentRole.REVIEWER
                             and run.status is RunStatus.COMPLETED else None),
            output=output,
        )
    return handle
