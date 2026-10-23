import re
from sqlalchemy import select, func, text as sql_text
from shared.errors import ApiError
from shared.contracts import canonical, fingerprint, integer, uuid_string
from infrastructure.database.models import SurveyRelease, SurveyResponse, Version, now, new_id
from infrastructure.security import keyed, random_token
from multi_agent.agents.survey_agent.services import surveys as domain

class SurveyService:

    def __init__(self, *, settings, owned_project, operation):
        self.settings = settings
        self.owned_project = owned_project
        self.operation = operation
        'Reuse the session/auth contracts without widening anonymous authority.'

    def project_release(self, *, session, user, project_id, release_id, edit=False, lock=False):
        self.owned_project(session, user, project_id, edit=edit)
        uuid_string(release_id)
        query = select(SurveyRelease).where(SurveyRelease.id == release_id, SurveyRelease.project_id == project_id).execution_options(populate_existing=True)
        row = session.execute(query.with_for_update() if lock else query).scalar_one_or_none()
        if row is None:
            raise ApiError(404, 'not_found', '问卷发布记录不存在。')
        return row

    def public_release(self, *, session, token, lock=False):
        if not re.fullmatch('[A-Za-z0-9_-]{43}', token):
            raise ApiError(404, 'not_found', '问卷不存在。')
        session.execute(sql_text("SELECT set_config('evix.survey_token',:token,true)"), {'token': token})
        query = select(SurveyRelease).where(SurveyRelease.token == token).execution_options(populate_existing=True)
        row = session.execute(query.with_for_update() if lock else query).scalar_one_or_none()
        if row is None:
            raise ApiError(404, 'not_found', '问卷不存在。')
        return row

    def list_releases(self, *, project_id: str, user, session):
        self.owned_project(session, user, project_id)
        rows = session.scalars(select(SurveyRelease).where(SurveyRelease.project_id == project_id).order_by(SurveyRelease.created_at.desc(), SurveyRelease.id.desc())).all()
        return {'surveys': [domain.release_view(row) for row in rows]}

    async def publish(self, *, project_id: str, user, session, data):
        project, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, 'survey-publish:' + project_id, data)
        if repeated:
            return op.response
        expected = integer(data['expectedQuestionnaireRevision'], 1)
        if expected != project.questionnaire_revision:
            raise ApiError(409, 'revision_conflict', '问卷版本已变化，请重新载入后发布。')
        version = session.scalar(select(Version).where(Version.project_id == project_id, Version.revision == expected))
        if version is None:
            raise ApiError(409, 'unsaved_questionnaire', '请先保存问卷。')
        existing = session.scalar(select(SurveyRelease).where(SurveyRelease.project_id == project_id, SurveyRelease.version_id == version.id))
        if existing:
            op.response = domain.release_view(existing)
            session.commit()
            return op.response
        if session.scalar(select(func.count()).select_from(SurveyRelease).where(SurveyRelease.project_id == project_id)) >= 50:
            raise ApiError(409, 'release_limit', '每个项目最多发布50个问卷版本。')
        design = domain.publishable_design(version.design)
        release = SurveyRelease(id=new_id(), project_id=project_id, version_id=version.id, questionnaire_revision=expected, token=random_token(), public_design=domain.public_design(design), classification='synthetic' if self.settings.mode == 'local_test' else 'actual', revision=1, status='open', response_count=0, response_bytes=0, created_at=now())
        session.add(release)
        session.flush()
        op.response = domain.release_view(release)
        session.commit()
        return op.response

    async def close(self, *, project_id: str, release_id: str, user, session, data):
        release = self.project_release(session=session, user=user, project_id=project_id, release_id=release_id, edit=True, lock=True)
        op, repeated = self.operation(session, user, 'survey-close:' + release_id, data)
        if repeated:
            return op.response
        if integer(data['expectedRevision'], 1) != release.revision:
            raise ApiError(409, 'revision_conflict', '回收状态已变化，请刷新。')
        if release.status == 'open':
            release.status, release.closed_at, release.revision = ('closed', now(), release.revision + 1)
        session.flush()
        op.response = domain.release_view(release)
        session.commit()
        return op.response

    def export_dataset(self, *, project_id: str, release_id: str, user, session):
        self.project_release(session=session, user=user, project_id=project_id, release_id=release_id)
        session.execute(sql_text('SELECT pg_advisory_xact_lock(:key)'), {'key': int(fingerprint(['survey', release_id])[:15], 16)})
        release = self.project_release(session=session, user=user, project_id=project_id, release_id=release_id)
        version = session.get(Version, release.version_id)
        responses = session.scalars(select(SurveyResponse).where(SurveyResponse.release_id == release_id).order_by(SurveyResponse.created_at, SurveyResponse.id)).all()
        return domain.dataset_view(release, version.design, responses)

    def get_public(self, *, token: str, session):
        release = self.public_release(session=session, token=token)
        return {'id': release.id, 'status': release.status, 'classification': release.classification, **release.public_design}

    async def submit(self, *, token: str, session, data):
        key = uuid_string(data['idempotencyKey'])
        session.execute(sql_text("SELECT set_config('evix.submission_key',:key,true)"), {'key': key})
        release = self.public_release(session=session, token=token)
        session.execute(sql_text('SELECT pg_advisory_xact_lock(:key)'), {'key': int(fingerprint(['survey', release.id])[:15], 16)})
        release = self.public_release(session=session, token=token, lock=True)
        digest = keyed(self.settings, 'survey-response/v1', canonical(data))
        existing = session.scalar(select(SurveyResponse).where(SurveyResponse.release_id == release.id, SurveyResponse.idempotency_key == key))
        if existing:
            if existing.payload_hash != digest:
                raise ApiError(409, 'idempotency_conflict', '提交标识已用于不同答卷。')
            return domain.receipt(existing, release)
        if release.status != 'open':
            raise ApiError(409, 'survey_closed', '本问卷已结束回收。')
        answers, visibility = domain.validate_answers(release.public_design, data['answers'])
        size = len(canonical(answers).encode('utf-8'))
        if size > domain.MAX_REQUEST_BYTES:
            raise ApiError(413, 'response_too_large', '答卷内容超过64 KiB，请缩短开放题回答。')
        if release.response_count >= domain.MAX_RESPONSES or release.response_bytes + size > domain.MAX_ANSWER_BYTES:
            raise ApiError(409, 'survey_capacity', '本问卷回收容量已满。')
        response = SurveyResponse(id=new_id(), release_id=release.id, idempotency_key=key, payload_hash=digest, answers=answers, visibility=visibility, created_at=now())
        session.add(response)
        release.response_count += 1
        release.response_bytes += size
        session.flush()
        result = domain.receipt(response, release)
        session.commit()
        return result
