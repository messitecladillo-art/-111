"""Read-only, personally scoped questionnaire-call receipts for report appendices.

This adapter does not decrypt services, load proposal content, expire calls, or
infer per-call records from silicon runs. A payload HMAC is not a content SHA-256.
"""
from collections.abc import Mapping
from datetime import datetime, timezone
import re

from fastapi import Depends, Response
from sqlalchemy import and_, select

from .models import Proposal, Service


SCOPE = "own-questionnaire-proposals/latest-200"
PROVIDERS = frozenset(("openai", "deepseek", "qwen", "anthropic", "compatible", "other"))
STATUSES = {"ready": "succeeded", "outcome_unknown": "unknown", "running": "running",
            "queued": "queued", "failed": "failed", "cancelled": "cancelled"}


def _timestamp(value):
    # Missing timezone information cannot be repaired by assuming UTC.
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        return None
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _model(value):
    if (not isinstance(value, str) or not 1 <= len(value) <= 120
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", value)
            or re.search(r"sk-|tvly-|bearer|api[_-]?key|secret|password", value, re.I)):
        return None
    return value


def proposal_usage_record(metadata: Mapping):
    """Convert only projected, non-secret metadata. Extra fields are never read."""
    revision = metadata["service_revision"]
    current_revision = metadata["current_service_revision"]
    same_revision = (type(revision) is int and type(current_revision) is int
                     and revision > 0 and revision == current_revision)
    provider = metadata["provider"] if same_revision else None
    model = _model(metadata["model"]) if same_revision else None
    if provider not in PROVIDERS:
        provider = None
    return {
        "id": metadata["id"], "provider": provider, "model": model,
        "purpose": "questionnaire", "status": STATUSES.get(metadata["status"], "unknown"),
        "requestedAt": _timestamp(metadata["dispatched_at"]),
        "finishedAt": _timestamp(metadata["finished_at"]),
        # The existing proposal table does not persist these usage receipts.
        "inputHash": None, "outputHash": None,
        "usage": {"inputTokens": None, "outputTokens": None, "cost": None, "currency": None},
    }


def register_report_ai_usage(app, *, auth, db, owned_project):
    @app.get("/api/projects/{project_id}/report/ai-usage")
    def usage(project_id: str, response: Response, user=Depends(auth), session=Depends(db)):
        project, _ = owned_project(session, user, project_id)
        # Select columns instead of ORM entities: design, HMAC, service URL and
        # vault fields never enter this endpoint's result objects.
        query = select(
            Proposal.id, Proposal.status, Proposal.service_revision,
            Proposal.dispatched_at, Proposal.finished_at,
            Service.revision.label("current_service_revision"), Service.provider, Service.model,
        ).select_from(Proposal).outerjoin(Service, and_(
            Service.id == Proposal.service_id,
            Service.user_id == user.id,
            Service.revision == Proposal.service_revision,
            Service.deleted.is_(False),
        )).where(
            Proposal.project_id == project.id, Proposal.user_id == user.id,
        ).order_by(Proposal.created_at.desc(), Proposal.id.desc()).limit(200)
        rows = session.execute(query).mappings().all()
        response.headers["cache-control"] = "no-store"
        response.headers["vary"] = "Cookie"
        return {"schema": "AiUsageLedger/v1", "coverage": "partial", "projectId": project.id,
                "scope": SCOPE, "records": [proposal_usage_record(row) for row in rows]}
