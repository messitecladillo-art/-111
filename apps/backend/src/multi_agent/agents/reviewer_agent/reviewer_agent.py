"""Public entry point. Keep domain steps in workflow/services/tools."""

from typing import Any, Mapping

from multi_agent.agents.contracts import AgentRole, AgentTool, StepExecutor
from multi_agent.agents.runtime import require_output
from .schemas import ReviewerInput, ReviewerOutput
from .state import ReviewerState
from .tools import build_tools
from .workflow import ReviewerWorkflow


class ReviewerAgent:
    """Reviewer Agent: independent evidence and consistency review. Each run owns its state; no global task state."""

    role = AgentRole.REVIEWER

    def __init__(self, *, executors: Mapping[str, StepExecutor] | None = None,
                 tools: Mapping[str, AgentTool] | None = None):
        registry = build_tools()
        registry.update(tools or {})
        self._workflow = ReviewerWorkflow(executors=executors, tools=registry)

    def run(self, task: ReviewerInput | Mapping[str, Any]) -> ReviewerOutput:
        """Return a validated output or raise AgentExecutionError with safe state."""
        return require_output(self.run_with_state(task))

    def run_with_state(self, task: ReviewerInput | Mapping[str, Any]) -> ReviewerState:
        """Inspect step outcomes, tool receipts and an explicit terminal status."""
        return self._workflow.run(task)
