"""Private, serializable state for one Writing Agent invocation."""

from multi_agent.agents.contracts import AgentRunState
from .schemas import WritingInput, WritingOutput


class WritingState(AgentRunState):
    task: WritingInput
    output: WritingOutput | None = None
