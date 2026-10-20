import asyncio
from datetime import timedelta
from sqlalchemy import select, func, text as sql_text, update
from shared.errors import ApiError
from shared.contracts import uuid_string, text, integer, canonical
from infrastructure.database.models import Proposal, now, new_id
from infrastructure.security import keyed, config_view, decrypt
from shared.errors import ProviderFailure
from multi_agent.agents.survey_agent.services.proposals import parse_proposal
from application.presenters import proposal_view

class ProposalService:

    def __init__(self, *, settings, generator, owned_project, owned_service, lock_user):
        self.settings = settings
        self.generator = generator
        self.owned_project = owned_project
        self.owned_service = owned_service
        self.lock_user = lock_user

    def expire_pending(self, *, session, user):
        session.execute(update(Proposal).where(Proposal.user_id == user.id, Proposal.status == 'running', Proposal.created_at < now() - timedelta(seconds=self.settings.proposal_stale_seconds)).values(status='outcome_unknown', error_code='interrupted_call', finished_at=now()))

    async def generate_proposal(self, *, project_id: str, user, session, check_session, data, p):
        key_id = uuid_string(data['idempotencyKey'])
        digest = keyed(self.settings, 'proposal-consent/v1', canonical(data))
        self.lock_user(session, user)
        self.expire_pending(session=session, user=user)
        old = session.execute(select(Proposal).where(Proposal.project_id == p.id, Proposal.user_id == user.id, Proposal.idempotency_key == key_id)).scalar_one_or_none()
        if old:
            if old.payload_hash != digest:
                raise ApiError(409, 'idempotency_conflict', '操作标识已用于不同请求。')
            session.commit()
            return proposal_view(old)
        if data['consent'] is not True:
            raise ApiError(422, 'consent_required', '生成前需要明确确认外部调用。')
        s = self.owned_service(session, user, data['serviceId'])
        if integer(data['serviceRevision'], 1) != s.revision:
            raise ApiError(409, 'revision_conflict', '服务配置已变化。')
        if 'questionnaire' not in s.capabilities:
            raise ApiError(422, 'capability_unavailable', '此服务未启用问卷能力。')
        p, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        if integer(data['expectedQuestionnaireRevision'], 0) != p.questionnaire_revision:
            raise ApiError(409, 'revision_conflict', '问卷版本已变化。')
        brief = text(data['brief'], 8000, 1)
        if not brief.strip():
            raise ApiError()
        if session.scalar(select(func.count()).select_from(Proposal).where(Proposal.user_id == user.id, Proposal.status == 'running')):
            raise ApiError(429, 'call_active', '已有生成请求正在处理。')
        if session.scalar(select(func.count()).select_from(Proposal).where(Proposal.user_id == user.id, Proposal.created_at > now() - timedelta(hours=1))) >= 12:
            raise ApiError(429, 'call_rate_limit', '每小时最多12次生成请求。')
        config, key = (config_view(s), decrypt(self.settings, s))
        if key in brief:
            raise ApiError(422, 'sensitive_input', '研究需求不能包含服务密钥。')
        reserved = Proposal(id=new_id(), user_id=user.id, project_id=p.id, service_id=s.id, service_revision=s.revision, input_revision=p.questionnaire_revision, idempotency_key=key_id, payload_hash=digest, status='running', dispatched_at=now())
        session.add(reserved)
        session.commit()
        design, failure = (None, None)
        try:
            async with asyncio.timeout(30):
                raw = await self.generator(config, key, brief)
                if not isinstance(raw, str) or key in raw:
                    raise ProviderFailure('invalid_response')
                design = parse_proposal(raw)
        except ProviderFailure as error:
            failure = error
        except (TimeoutError, asyncio.CancelledError):
            failure = ProviderFailure('provider_timeout', unknown=True)
        except Exception:
            failure = ProviderFailure('provider_failure', unknown=True)
        finally:
            key = ''
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {'user_id': user.id})
        result = session.execute(select(Proposal).where(Proposal.id == reserved.id).with_for_update().execution_options(populate_existing=True)).scalar_one()
        if result.status == 'running':
            result.status = 'outcome_unknown' if failure and failure.unknown else 'failed' if failure else 'ready'
            result.error_code = failure.code if failure else None
            result.design, result.finished_at = (design, now())
        session.commit()
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {'user_id': user.id})
        check_session(session)
        self.owned_project(session, user, project_id)
        return proposal_view(result)

    def get_proposals(self, *, project_id: str, user, session):
        p, _ = self.owned_project(session, user, project_id)
        self.expire_pending(session=session, user=user)
        results = session.execute(select(Proposal).where(Proposal.project_id == p.id, Proposal.user_id == user.id).order_by(Proposal.created_at.desc(), Proposal.id.desc()).limit(50)).scalars().all()
        session.commit()
        summaries = []
        for result in results:
            summary = proposal_view(result)
            design = summary.pop('design', None)
            summary['title'] = design['title'] if design else ''
            summaries.append(summary)
        return {'proposals': summaries}

    def get_proposal(self, *, project_id: str, proposal_id: str, user, session):
        p, _ = self.owned_project(session, user, project_id)
        uuid_string(proposal_id)
        self.expire_pending(session=session, user=user)
        result = session.execute(select(Proposal).where(Proposal.id == proposal_id, Proposal.project_id == p.id, Proposal.user_id == user.id)).scalar_one_or_none()
        if not result:
            raise ApiError(404, 'not_found', '建议不存在。')
        session.commit()
        return proposal_view(result)
