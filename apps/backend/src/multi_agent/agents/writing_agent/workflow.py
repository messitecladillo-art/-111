"""Writing Agent: report composition and artifact generation. Role-specific internal step order and output rules."""

from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.runtime import InternalWorkflow
from .schemas import WritingInput, WritingOutput
from .state import WritingState


class WritingWorkflow(InternalWorkflow[WritingState]):
    role = AgentRole.WRITING
    input_type = WritingInput
    output_type = WritingOutput
    state_type = WritingState
    steps = ("outline_report", "draft_report",)

    def validate_output(self, state: WritingState, output: WritingOutput) -> None:
        super().validate_output(state, output)
        deliverable = output.deliverable
        if (deliverable.status == "needs_input" or deliverable.missing_material) and not output.unresolved_questions:
            raise ValueError("Missing report material must be returned as an input request")
        exported = {ref for call in state.tool_calls for ref in call.result.artifact_refs}
        if deliverable.export_artifact_ref and deliverable.export_artifact_ref not in exported:
            raise ValueError("Report export has no successful tool receipt")
