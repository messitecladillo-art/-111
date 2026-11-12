"""Five-role LangGraph execution; SQLAlchemy task rows are durable checkpoints."""

from typing import Any, TypedDict

from multi_agent.agents.contracts import AgentResult, AgentRole
from multi_agent.workflow.orchestrator import PreparedStep, WorkflowEngine, WorkflowState


class _State(TypedDict, total=False):
    task_id: str
    project_id: str
    task_type: str
    requirements: dict[str, Any]
    context: dict[str, Any]
    input_artifact_refs: list[str]
    constraints: dict[str, Any]
    status: str
    current_role: str | None
    awaiting_approval: str | None
    retry_count: dict[str, int]
    max_retries: int
    artifact_refs: list[str]
    evidence_refs: list[str]
    unresolved_questions: list[str]
    errors: list[str]
    summary: str
    revision: int
    agent_outputs: dict[str, dict[str, Any]]
    model_bindings: dict[str, Any] | None


class LangGraphRunner:
    """Run deterministic role steps through a compiled LangGraph until a gate.

    ``advance`` is an in-memory library traversal. Durable API callers use
    ``prepare_step`` and ``apply_result`` to commit each role separately and
    never hold a database transaction while a handler runs.
    """

    def __init__(self, engine: WorkflowEngine):
        from langgraph.graph import END, START, StateGraph

        self.engine = engine

        role_nodes = {
            "research": AgentRole.RESEARCH,
            "survey": AgentRole.SURVEY,
            "data": AgentRole.DATA,
            "writing": AgentRole.WRITING,
            "reviewer": AgentRole.REVIEWER,
        }

        def route(raw: _State) -> str:
            state = WorkflowState.from_dict(raw)
            role = self.engine.next_role(state)
            return role.value if role else END

        def role_node(raw: _State) -> _State:
            state = WorkflowState.from_dict(raw)
            state = self.engine.advance(state)
            return state.to_dict()  # type: ignore[return-value]

        graph = StateGraph(_State)
        for name in role_nodes:
            graph.add_node(name, role_node)
        graph.add_conditional_edges(START, route, {**{name: name for name in role_nodes}, END: END})
        for name in role_nodes:
            graph.add_conditional_edges(name, route, {**{target: target for target in role_nodes}, END: END})
        self.graph = graph.compile()

    def advance(self, state: WorkflowState) -> WorkflowState:
        # An approved final gate has no next role; let the engine complete it.
        if self.engine.next_role(state) is None:
            return self.engine.advance(state)
        return WorkflowState.from_dict(self.graph.invoke(state.to_dict()))

    def prepare_step(self, state: WorkflowState) -> PreparedStep:
        """Durable APIs dispatch one role, never the whole in-memory graph."""
        return self.engine.prepare_step(state)

    def apply_result(self, prepared: WorkflowState, result: AgentResult) -> WorkflowState:
        return self.engine.apply_result(prepared, result)

    def approve(self, state: WorkflowState, *, approved: bool, feedback: str = "") -> WorkflowState:
        return self.engine.approve(state, approved=approved, feedback=feedback)

    def provide_input(self, state: WorkflowState, artifact_refs: list[str] | tuple[str, ...]) -> WorkflowState:
        return self.engine.provide_input(state, artifact_refs)
