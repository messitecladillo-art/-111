from sqlalchemy import select
from shared.errors import ApiError
from shared.contracts import uuid_string, integer, fingerprint
from shared.questionnaire import questionnaire
from infrastructure.database.models import Version, Proposal, new_id
from multi_agent.agents.research_agent.services.topic_questionnaire import prepare_binding_save, persist_binding, topic_binding_receipt
from application.presenters import iso, head

class QuestionnaireService:

    def __init__(self, *, owned_project, operation):
        self.owned_project = owned_project
        self.operation = operation

    def get_questionnaire(self, *, project_id: str, user, session):
        p, _ = self.owned_project(session, user, project_id)
        v = session.execute(select(Version).where(Version.project_id == p.id, Version.revision == p.questionnaire_revision)).scalar_one_or_none()
        return {'questionnaire': head(v) if v else None}

    def get_versions(self, *, project_id: str, beforeRevision: int | None=None, user, session):
        p, _ = self.owned_project(session, user, project_id)
        query = select(Version).where(Version.project_id == p.id)
        if beforeRevision is not None:
            query = query.where(Version.revision < integer(beforeRevision, 1))
        versions = session.execute(query.order_by(Version.revision.desc()).limit(101)).scalars().all()
        page = versions[:100]
        return {'versions': [{'id': v.id, 'revision': v.revision, 'createdAt': iso(v.created_at), 'createdBy': v.created_by, 'title': v.design['title']} for v in page], 'nextBeforeRevision': page[-1].revision if len(versions) > 100 else None}

    def get_version(self, *, project_id: str, version_id: str, user, session):
        p, _ = self.owned_project(session, user, project_id)
        uuid_string(version_id)
        v = session.execute(select(Version).where(Version.project_id == p.id, Version.id == version_id)).scalar_one_or_none()
        if not v:
            raise ApiError(404, 'not_found', '版本不存在。')
        return {'id': v.id, 'revision': v.revision, 'createdAt': iso(v.created_at), 'createdBy': v.created_by, 'design': v.design}

    async def save_questionnaire(self, *, project_id: str, user, session, data):
        p, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, 'questionnaire:' + p.id, data)
        if repeated:
            return op.response
        expected = integer(data['expectedRevision'], 0)
        if expected != p.questionnaire_revision:
            raise ApiError(409, 'revision_conflict', '问卷版本已变化，请保留本地修改后刷新。')
        if expected >= 2147483647 or p.revision >= 2147483647:
            raise ApiError(409, 'version_limit', '项目版本上限已达到。')
        design = questionnaire(data['design'])
        source = data.get('sourceProposalId')
        if source is not None:
            uuid_string(source)
            proposal = session.execute(select(Proposal).where(Proposal.id == source, Proposal.user_id == user.id, Proposal.project_id == p.id)).scalar_one_or_none()
            if not proposal:
                raise ApiError(404, 'not_found', '建议不存在。')
            if proposal.status != 'ready' or proposal.input_revision != expected:
                raise ApiError(409, 'stale_proposal', '建议基于旧版本，不能用来替换当前问卷。')
        current = session.execute(select(Version).where(Version.project_id == p.id).order_by(Version.revision.desc()).limit(1)).scalar_one_or_none()
        if (current.revision if current else 0) != expected:
            raise ApiError(409, 'revision_conflict', '问卷基础版本与项目记录不符。')
        binding_state = prepare_binding_save(session, p, current, design, data.get('topicBindingMutation'), provided='topicBindingMutation' in data)
        v = Version(id=new_id(), project_id=p.id, revision=expected + 1, created_by=user.id, design=design, design_hash=fingerprint(design), source_proposal_id=source)
        session.add(v)
        p.questionnaire_revision += 1
        p.revision += 1
        session.flush()
        persist_binding(session, v, user, binding_state)
        op.response = head(v)
        session.commit()
        return op.response

    def get_questionnaire_topic_binding(self, *, project_id: str, version_id: str, user, session):
        p, _ = self.owned_project(session, user, project_id)
        uuid_string(version_id)
        v = session.execute(select(Version).where(Version.project_id == p.id, Version.id == version_id)).scalar_one_or_none()
        if v is None:
            raise ApiError(404, 'not_found', '版本不存在。')
        return topic_binding_receipt(session, v)
