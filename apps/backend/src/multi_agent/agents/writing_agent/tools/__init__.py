"""Writing-owned tools. Compilation/export remains an explicitly configured tool."""

from multi_agent.agents.contracts import ToolResult
from ..services.reports import report_content


def validate_report(*, content: dict) -> ToolResult:
    return ToolResult(data={"report": report_content(content)})


def build_tools():
    return {"validate_report": validate_report}
