"""Data tool boundary. Real storage/analysis tools must be explicitly injected."""

from multi_agent.agents.contracts import ToolResult


def check_artifact_refs(*, artifact_refs: list[str]) -> ToolResult:
    if not artifact_refs or any(not isinstance(ref, str) or not ref.strip() for ref in artifact_refs):
        raise ValueError("Uploaded data references are required")
    return ToolResult(data={"input_artifact_refs": list(artifact_refs), "status": "not_loaded"})


def build_tools():
    # These checks cannot substitute for load_dataset or analyze_dataset.
    return {"check_artifact_refs": check_artifact_refs}
