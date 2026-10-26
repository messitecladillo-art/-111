"""Personally scoped, read-only call metadata for evidence appendices."""
from sqlalchemy import and_, select

from infrastructure.database.models import Proposal, Service
from multi_agent.agents.writing_agent.services.report_ai_usage import SCOPE, proposal_usage_record


class ReportAiUsageService:
    def __init__(self, *, owned_project):
        self.owned_project = owned_project

    def ledger(self, *, project_id, user, session):
        project, _ = self.owned_project(session, user, project_id)
        # Do not hydrate proposal content, service credentials or endpoint URLs.
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
        records = session.execute(query).mappings().all()
        return {
            "schema": "AiUsageLedger/v1", "coverage": "partial", "projectId": project.id,
            "scope": SCOPE, "records": [proposal_usage_record(row) for row in records],
        }
