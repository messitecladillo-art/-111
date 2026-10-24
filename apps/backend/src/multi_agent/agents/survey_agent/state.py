"""Private, serializable state for one Survey Agent invocation."""

from multi_agent.agents.contracts import AgentRunState
from .schemas import SurveyInput, SurveyOutput


class SurveyState(AgentRunState):
    task: SurveyInput
    output: SurveyOutput | None = None
