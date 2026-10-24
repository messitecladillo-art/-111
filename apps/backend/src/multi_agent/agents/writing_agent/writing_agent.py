"""Public entry point. Keep domain steps in workflow/services/tools."""

from typing import Any, Mapping

from multi_agent.agents.contracts import AgentRole, AgentTool, StepExecutor
from multi_agent.agents.runtime import require_output
from .schemas import WritingInput, WritingOutput
from .state import WritingState
from .tools import build_tools
from .workflow import WritingWorkflow


class WritingAgent:
    """Writing Agent: report composition and artifact generation. Each run owns its state; no global task state."""

    role = AgentRole.WRITING

    def __init__(self, *, executors: Mapping[str, StepExecutor] | None = None,
                 tools: Mapping[str, AgentTool] | None = None):
        registry = build_tools()
        registry.update(tools or {})
        self._workflow = WritingWorkflow(executors=executors, tools=registry)

    def run(self, task: WritingInput | Mapping[str, Any]) -> WritingOutput:
        """Return a validated output or raise AgentExecutionError with safe state."""
        return require_output(self.run_with_state(task))

    def run_with_state(self, task: WritingInput | Mapping[str, Any]) -> WritingState:
        """Inspect step outcomes, tool receipts and an explicit terminal status."""
        return self._workflow.run(task)
