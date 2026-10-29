from sqlalchemy import select

from infrastructure.database.models import ProjectMemoryVersion, TopicProjectDecision, TopicProjectVersion, new_id
from multi_agent.agents.research_agent.services import project_memory as domain
from shared.contracts import integer, uuid_string
from shared.errors import ApiError


class ProjectMemoryService:
    """One project's confirmed memory document; history is append-only."""

    def __init__(self, *, owned_project, operation):
        self.owned_project = owned_project
        self.operation = operation

    def _latest(self, session, project_id):
        return session.execute(
            select(ProjectMemoryVersion)
            .where(ProjectMemoryVersion.project_id == project_id)
            .order_by(ProjectMemoryVersion.revision.desc())
            .limit(1)
        ).scalar_one_or_none()

    def _topic_seed(self, session, project_id):
        version = session.execute(
            select(TopicProjectVersion)
            .where(TopicProjectVersion.project_id == project_id)
            .order_by(TopicProjectVersion.revision.desc())
            .limit(1)
        ).scalar_one_or_none()
        if not version:
            return None
        decision = session.execute(
            select(TopicProjectDecision)
            .where(TopicProjectDecision.project_id == project_id)
            .order_by(TopicProjectDecision.revision.desc())
            .limit(1)
        ).scalar_one_or_none()
        if not decision or decision.action != "confirm" or decision.version_id != version.id:
            return None
        return {**version.document, "versionId": version.id, "revision": version.revision, "hash": version.content_hash}

    @staticmethod
    def _empty_document():
        return {
            "schemaVersion": 1,
            "intent": {field: {"value": "", "status": "unknown"} for field in domain.INTENT_FIELDS},
            "decisions": [],
            "openQuestions": [],
        }

    def get(self, *, project_id, user, session):
        project, role = self.owned_project(session, user, project_id)
        row = self._latest(session, project.id)
        seed = None if row else domain.seed(project.title, self._topic_seed(session, project.id))
        return {
            "schemaVersion": 1,
            "projectId": project.id,
            "revision": row.revision if row else 0,
            "contentHash": row.content_hash if row else "0" * 64,
            "document": row.document if row else self._empty_document(),
            "permissions": {"role": role, "canEdit": role in ("owner", "editor")},
            "seed": seed,
        }

    def versions(self, *, project_id, user, session):
        project, _ = self.owned_project(session, user, project_id)
        rows = session.execute(
            select(ProjectMemoryVersion)
            .where(ProjectMemoryVersion.project_id == project.id)
            .order_by(ProjectMemoryVersion.revision.desc())
            .limit(30)
        ).scalars().all()
        return {"versions": [{
            "id": row.id, "revision": row.revision, "contentHash": row.content_hash,
            "createdBy": row.created_by, "createdAt": row.created_at.isoformat(),
            "changeNote": row.change_note,
        } for row in rows]}

    def version(self, *, project_id, version_id, user, session):
        project, _ = self.owned_project(session, user, project_id)
        uuid_string(version_id)
        row = session.execute(
            select(ProjectMemoryVersion).where(
                ProjectMemoryVersion.id == version_id,
                ProjectMemoryVersion.project_id == project.id,
            )
        ).scalar_one_or_none()
        if row is None:
            raise ApiError(404, "not_found", "项目记忆版本不存在。")
        return {
            "id": row.id, "revision": row.revision, "contentHash": row.content_hash,
            "createdBy": row.created_by, "createdAt": row.created_at.isoformat(),
            "changeNote": row.change_note, "document": row.document,
        }

    async def save(self, *, project_id, user, session, data):
        project, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, "project-memory:" + project.id, data)
        if repeated:
            return op.response
        expected = integer(data["expectedRevision"], 0, 2147483646)
        current = self._latest(session, project.id)
        if expected != (current.revision if current else 0):
            raise ApiError(409, "memory_revision_conflict", "项目记忆已有新版本。")
        value = domain.document(data["document"])
        item = ProjectMemoryVersion(
            id=new_id(), project_id=project.id, revision=expected + 1, document=value,
            content_hash=domain.content_hash(value), created_by=user.id,
            change_note=(data.get("changeNote") or "")[:500],
        )
        session.add(item)
        session.flush()
        op.response = self.get(project_id=project.id, user=user, session=session)
        session.commit()
        return op.response

    def brief_for_agent(self, *, project_id, user, session):
        if not project_id:
            return {"available": False}
        try:
            snapshot = self.get(project_id=project_id, user=user, session=session)
        except ApiError:
            return {"available": False}
        return {
            "available": snapshot["revision"] > 0,
            "revision": snapshot["revision"],
            "brief": domain.brief(snapshot["document"], snapshot["revision"]) if snapshot["revision"] else None,
        }
