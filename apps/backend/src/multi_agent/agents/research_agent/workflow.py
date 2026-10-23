"""Research Agent: topic selection and research design. Role-specific internal step order and output rules."""

from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.runtime import InternalWorkflow
from .schemas import ResearchInput, ResearchOutput
from .state import ResearchState


class ResearchWorkflow(InternalWorkflow[ResearchState]):
    role = AgentRole.RESEARCH
    input_type = ResearchInput
    output_type = ResearchOutput
    state_type = ResearchState
    steps = ("review_materials", "design_research", "assess_feasibility",)

    def validate_output(self, state: ResearchState, output: ResearchOutput) -> None:
        super().validate_output(state, output)
        _, evidence = self.known_references(state)
        for item in output.deliverable.evidence_plan:
            if item.get("source_ref") and item["source_ref"] not in evidence:
                raise ValueError("Research plan cites unknown evidence")
