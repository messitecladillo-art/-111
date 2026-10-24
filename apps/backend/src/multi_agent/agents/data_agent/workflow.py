"""Data Agent: validation, cleaning and statistical analysis. Role-specific internal step order and output rules."""

from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.runtime import InternalWorkflow
from .schemas import DataInput, DataOutput, DataDeliverable
from .state import DataState


class DataWorkflow(InternalWorkflow[DataState]):
    role = AgentRole.DATA
    input_type = DataInput
    output_type = DataOutput
    state_type = DataState
    steps = ("inspect_data", "clean_data", "analyze_data",)

    def validate_output(self, state: DataState, output: DataOutput) -> None:
        super().validate_output(state, output)
        deliverable = output.deliverable
        if set(deliverable.input_artifact_refs) != set(state.task.artifact_refs):
            raise ValueError("Analysis input references changed")
        if deliverable.data_status != "analyzed":
            if not output.errors and not output.unresolved_questions:
                raise ValueError("Incomplete analysis must explain what is missing")
            return
        loaded = [call for call in state.tool_calls
                  if call.name == "load_dataset" and call.step == "inspect_data" and call.result.classification == "actual"
                  and set(state.task.artifact_refs) <= set(call.result.artifact_refs)]
        analyses = [call for call in state.tool_calls
                    if call.name == "analyze_dataset" and call.step == "analyze_data" and call.result.classification == "actual"]
        if not loaded or not analyses:
            raise ValueError("Real data loading and analysis tool receipts are required")
        computed = DataDeliverable.model_validate(analyses[-1].result.data.get("deliverable"))
        if computed.model_dump(mode="json") != deliverable.model_dump(mode="json"):
            raise ValueError("Reported analysis differs from the actual tool result")
        artifacts, _ = self.known_references(state)
        for chart in deliverable.charts:
            if chart.get("artifact_ref") and chart["artifact_ref"] not in artifacts:
                raise ValueError("Chart artifact was not produced by a tool")
