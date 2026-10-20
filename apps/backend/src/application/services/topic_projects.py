import re
from sqlalchemy import select
from shared.errors import ApiError
from shared.contracts import fingerprint, integer, uuid_string
from infrastructure.database.models import new_id, TopicProjectVersion, TopicProjectDecision
from multi_agent.agents.research_agent.services import topic_projects as domain

class TopicProjectService:

    def __init__(self, *, owned_project, operation):
        self.owned_project = owned_project
        self.operation = operation

    def latest(self, *, session, project_id):
        return session.execute(select(TopicProjectVersion).where(TopicProjectVersion.project_id == project_id).order_by(TopicProjectVersion.revision.desc()).limit(1)).scalar_one_or_none()

    def latest_decision(self, *, session, project_id, version_id=None):
        query = select(TopicProjectDecision).where(TopicProjectDecision.project_id == project_id)
        if version_id is not None:
            query = query.where(TopicProjectDecision.version_id == version_id)
        return session.execute(query.order_by(TopicProjectDecision.revision.desc()).limit(1)).scalar_one_or_none()

    def decision_view(self, *, session, project_id, version, historical=False):
        last = self.latest_decision(session=session, project_id=project_id, version_id=version.id if historical and version else None)
        if last and version and (last.version_id == version.id):
            return {'revision': last.revision, 'status': 'confirmed' if last.action == 'confirm' else 'revoked', 'versionId': last.version_id, 'contentHash': last.content_hash}
        return {'revision': last.revision if last else 0, 'status': 'draft', 'versionId': None, 'contentHash': None}

    def get_topic(self, *, project_id: str, user, session):
        project, role = self.owned_project(session, user, project_id)
        item = self.latest(session=session, project_id=project.id)
        return {'head': domain.version_view(item) if item else None, 'document': item.document if item else None, 'decision': self.decision_view(session=session, project_id=project.id, version=item), 'canEdit': role in ('owner', 'editor')}

    def versions(self, *, project_id: str, before: int | None=None, limit: int=30, user, session):
        project, _ = self.owned_project(session, user, project_id)
        limit = integer(limit, 1, 30)
        query = select(TopicProjectVersion).where(TopicProjectVersion.project_id == project.id)
        if before is not None:
            query = query.where(TopicProjectVersion.revision < integer(before, 1))
        found = session.execute(query.order_by(TopicProjectVersion.revision.desc()).limit(limit + 1)).scalars().all()
        return {'versions': [domain.version_view(item) for item in found[:limit]], 'nextBefore': found[limit - 1].revision if len(found) > limit else None}

    def version(self, *, project_id: str, version_id: str, user, session):
        project, _ = self.owned_project(session, user, project_id)
        uuid_string(version_id)
        item = session.execute(select(TopicProjectVersion).where(TopicProjectVersion.id == version_id, TopicProjectVersion.project_id == project.id)).scalar_one_or_none()
        if item is None:
            raise ApiError(404, 'not_found', '选题版本不存在。')
        return {'version': domain.version_view(item), 'document': item.document, 'decision': self.decision_view(session=session, project_id=project.id, version=item, historical=True)}

    async def save(self, *, project_id: str, user, session, data):
        project, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, 'topic-project-version:' + project.id, data)
        if repeated:
            return op.response
        expected = integer(data['expectedRevision'], 0, 2147483646)
        previous = self.latest(session=session, project_id=project.id)
        if expected != (previous.revision if previous else 0):
            raise ApiError(409, 'revision_conflict', '选题已有新版本，请保留当前编辑并核对。')
        document = domain.topic_document(data['document'])
        item = TopicProjectVersion(id=new_id(), project_id=project.id, revision=expected + 1, document=document, content_hash=fingerprint(document), created_by=user.id)
        session.add(item)
        session.flush()
        op.response = {'version': domain.version_view(item), 'document': item.document, 'decision': self.decision_view(session=session, project_id=project.id, version=item)}
        session.commit()
        return op.response

    async def decide(self, *, project_id: str, user, session, data):
        project, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, 'topic-project-decision:' + project.id, data)
        if repeated:
            return op.response
        expected = integer(data['expectedRevision'], 1, 2147483647)
        expected_decision = integer(data['expectedDecisionRevision'], 0, 2147483646)
        uuid_string(data['versionId'])
        if not isinstance(data['contentHash'], str) or not re.fullmatch('[a-f0-9]{64}', data['contentHash']) or data['action'] not in ('confirm', 'revoke'):
            raise ApiError()
        current = self.latest(session=session, project_id=project.id)
        last = self.latest_decision(session=session, project_id=project.id)
        if current is None or current.revision != expected or current.id != data['versionId'] or (current.content_hash != data['contentHash']):
            raise ApiError(409, 'revision_conflict', '选题版本已变化，请核对后再确认。')
        if expected_decision != (last.revision if last else 0):
            raise ApiError(409, 'decision_conflict', '选题确认记录已变化，请重新读取。')
        status = self.decision_view(session=session, project_id=project.id, version=current)['status']
        if data['action'] == 'revoke' and status != 'confirmed':
            raise ApiError(409, 'decision_conflict', '当前版本尚未确认。')
        if data['action'] == 'confirm':
            if status == 'confirmed':
                raise ApiError(409, 'decision_conflict', '当前版本已确认。')
            domain.confirmable(current.document)
        session.add(TopicProjectDecision(id=new_id(), project_id=project.id, revision=expected_decision + 1, version_id=current.id, content_hash=current.content_hash, action=data['action'], created_by=user.id))
        session.flush()
        op.response = {'decision': self.decision_view(session=session, project_id=project.id, version=current)}
        session.commit()
        return op.response
