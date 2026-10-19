"""Private, serializable state for one Research Agent invocation."""

from multi_agent.agents.contracts import AgentRunState
from .schemas import ResearchInput, ResearchOutput


class ResearchState(AgentRunState):
    task: ResearchInput
    output: ResearchOutput | None = None
