"""Private, serializable state for one Data Agent invocation."""

from multi_agent.agents.contracts import AgentRunState
from .schemas import DataInput, DataOutput


class DataState(AgentRunState):
    task: DataInput
    output: DataOutput | None = None
