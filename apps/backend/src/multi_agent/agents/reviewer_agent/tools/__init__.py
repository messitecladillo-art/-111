"""Reviewer-only checks; file preflight lives in submission_preflight.py."""

from multi_agent.agents.contracts import ReviewDecision, ToolResult
from ..schemas import ReviewerDeliverable


def validate_review(deliverable: dict) -> ToolResult:
    review = ReviewerDeliverable.model_validate(deliverable)
    issues = (any(item.severity in {"blocking", "major"} for item in review.findings)
              or any(item.result != "pass" for item in review.consistency_checks)
              or bool(review.evidence_gaps))
    if review.decision is ReviewDecision.APPROVE and (issues or not review.consistency_checks):
        raise ValueError("Approval requires explicit passing checks and no unresolved major issues")
    if review.competition_readiness.status == "ready" and issues:
        raise ValueError("Competition readiness contradicts the review findings")
    if review.decision is not ReviewDecision.APPROVE and not review.revision_request.strip():
        raise ValueError("A failed review requires actionable revision instructions")
    return ToolResult(data={"decision": review.decision.value, "consistent": True})


def build_tools():
    return {"validate_review": validate_review}
