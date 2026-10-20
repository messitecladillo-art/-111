"""Private, serializable state for one Reviewer Agent invocation."""

from multi_agent.agents.contracts import AgentRunState
from .schemas import ReviewerInput, ReviewerOutput


class ReviewerState(AgentRunState):
    task: ReviewerInput
    output: ReviewerOutput | None = None
