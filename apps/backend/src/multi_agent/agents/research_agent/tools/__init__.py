"""Research-only tool entry points; network/search tools are explicitly injected."""

from multi_agent.agents.contracts import ToolResult


def reference_inventory(*, artifact_refs: list[str], evidence_refs: list[str]) -> ToolResult:
    """Inventory supplied IDs; this does not verify their content or provenance."""
    return ToolResult(data={"artifact_refs": list(artifact_refs),
                            "evidence_refs": list(evidence_refs), "verification": "not_verified"})


def build_tools():
    return {"reference_inventory": reference_inventory}
