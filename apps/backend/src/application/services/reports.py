from sqlalchemy import select
from infrastructure.database.models import new_id, ReportVersion
from shared.errors import ApiError
from shared.contracts import integer, uuid_string, fingerprint
from multi_agent.agents.writing_agent.services import reports as domain

class ReportService:

    def __init__(self, *, owned_project, operation):
        self.owned_project = owned_project
        self.operation = operation

    def latest(self, *, session, project_id):
        return session.execute(select(ReportVersion).where(ReportVersion.project_id == project_id).order_by(ReportVersion.revision.desc()).limit(1)).scalar_one_or_none()

    def get_report(self, *, project_id: str, user, session):
        project, _ = self.owned_project(session, user, project_id)
        report = self.latest(session=session, project_id=project.id)
        return {'report': domain.view(report) if report else None}

    def versions(self, *, project_id: str, beforeRevision: int | None=None, user, session):
        project, _ = self.owned_project(session, user, project_id)
        query = select(ReportVersion).where(ReportVersion.project_id == project.id)
        if beforeRevision is not None:
            query = query.where(ReportVersion.revision < integer(beforeRevision, 1))
        items = session.execute(query.order_by(ReportVersion.revision.desc()).limit(31)).scalars().all()
        return {'versions': [domain.view(v, False) for v in items[:30]], 'nextBeforeRevision': items[29].revision if len(items) > 30 else None}

    def version(self, *, project_id: str, version_id: str, user, session):
        project, _ = self.owned_project(session, user, project_id)
        uuid_string(version_id)
        item = session.execute(select(ReportVersion).where(ReportVersion.id == version_id, ReportVersion.project_id == project.id)).scalar_one_or_none()
        if item is None:
            raise ApiError(404, 'not_found', '版本不存在。')
        return domain.view(item)

    async def save(self, *, project_id: str, user, session, data):
        project, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, 'report:' + project.id, data)
        if repeated:
            return op.response
        expected = integer(data['expectedRevision'], 0, 2147483646)
        previous = self.latest(session=session, project_id=project.id)
        if expected != (previous.revision if previous else 0):
            raise ApiError(409, 'revision_conflict', '报告已有新版本，请保留当前编辑并核对。')
        content = domain.report_content(data['content'])
        item = ReportVersion(id=new_id(), project_id=project.id, revision=expected + 1, content=content, content_hash=fingerprint(content), created_by=user.id)
        session.add(item)
        session.flush()
        op.response = domain.view(item)
        session.commit()
        return op.response
