"""Data Agent: validation, cleaning and statistical analysis. Role-specific internal step order and output rules."""

from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.runtime import InternalWorkflow
from multi_agent.tool_registry import isa_tool_specs
from .schemas import DataInput, DataOutput, DataDeliverable
from .state import DataState

_ISA_TOOL_NAMES = frozenset(spec.name for spec in isa_tool_specs())


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
            raise ValueError("数据分析输入资料引用与任务登记不一致。")
        if deliverable.data_status != "analyzed":
            if not output.errors and not output.unresolved_questions:
                raise ValueError("数据分析尚未完成时须说明缺失条件或待确认事项。")
            return
        loaded = [call for call in state.tool_calls
                  if call.name == "load_dataset" and call.step == "inspect_data" and call.result.classification == "actual"
                  and set(state.task.artifact_refs) <= set(call.result.artifact_refs)]
        if not loaded:
            raise ValueError("缺少真实数据读取与统计分析回执。")
        if state.task.constraints.get("enableIsaSandbox") is True:
            isa_calls = [
                call for call in state.tool_calls
                if call.step == "analyze_data"
                and call.name in _ISA_TOOL_NAMES
                and call.result.classification in ("actual", "simulated")
                and call.result.data.get("snapshot_id")
                and call.result.data.get("result_hash")
            ]
            if not isa_calls:
                raise ValueError("缺少真实数据读取与统计检验回执。")
            verified_hashes = {
                str(call.result.data["snapshot_id"]): str(call.result.data["result_hash"])
                for call in isa_calls
            }
            for item in deliverable.tests:
                sid = str(item.get("snapshot_id") or "")
                rhash = str(item.get("result_hash") or "")
                if not sid or verified_hashes.get(sid) != rhash:
                    raise ValueError("上报的统计检验结果与已核验回执不一致。")
            finding_refs = {str(item.get("ref") or "") for item in deliverable.schema_findings}
            if not set(state.task.artifact_refs) <= finding_refs:
                raise ValueError("数据结构核查结论缺少输入资料引用。")
        else:
            analyses = [call for call in state.tool_calls
                        if call.name == "analyze_dataset" and call.step == "analyze_data" and call.result.classification == "actual"]
            if not analyses:
                raise ValueError("缺少真实数据读取与统计分析回执。")
            computed = DataDeliverable.model_validate(analyses[-1].result.data.get("deliverable"))
            if computed.model_dump(mode="json") != deliverable.model_dump(mode="json"):
                raise ValueError("上报的统计分析结果与实际计算回执不一致。")
        artifacts, _ = self.known_references(state)
        for chart in deliverable.charts:
            if chart.get("artifact_ref") and chart["artifact_ref"] not in artifacts:
                raise ValueError("图表产物缺少对应的统计绘图回执。")
