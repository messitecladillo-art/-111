"""Reviewer Agent: independent evidence and consistency review. Role-specific internal step order and output rules."""

from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.runtime import InternalWorkflow
from .schemas import ReviewerInput, ReviewerOutput
from .state import ReviewerState
from .tools import validate_review


class ReviewerWorkflow(InternalWorkflow[ReviewerState]):
    role = AgentRole.REVIEWER
    input_type = ReviewerInput
    output_type = ReviewerOutput
    state_type = ReviewerState
    steps = ("check_evidence", "check_consistency", "review_deliverable",)

    def validate_output(self, state: ReviewerState, output: ReviewerOutput) -> None:
        super().validate_output(state, output)
        if output.deliverable.stage != state.task.review_stage:
            raise ValueError("Review stage does not match the assigned deliverable")
        validate_review(output.deliverable.model_dump(mode="json"))
        _, evidence = self.known_references(state)
        for finding in output.deliverable.findings:
            if finding.evidence_ref and finding.evidence_ref not in evidence:
                raise ValueError("Review finding cites unknown evidence")
