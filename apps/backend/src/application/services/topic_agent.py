import asyncio
from datetime import timedelta
from sqlalchemy import func, or_, select, text as sql_text
from shared.errors import ApiError
from shared.contracts import uuid_string
from infrastructure.database.models import KnowledgeLookup
from infrastructure.database.models import Operation, Project, RateEvent, now
from shared.errors import ProviderFailure
from infrastructure.security import config_view, decrypt, keyed
from multi_agent.agents.research_agent.services.topics import iso, load_corpus
from multi_agent.agents.research_agent.services import topic_agent as domain

class TopicAgentService:

    def __init__(self, *, settings, lock_user, operation, owned_service, generator, corpus=None, owned_project):
        self.settings = settings
        self.lock_user = lock_user
        self.operation = operation
        self.owned_service = owned_service
        self.generator = generator
        self.corpus = corpus
        self.owned_project = owned_project
        self.corpus = load_corpus() if self.corpus is None else self.corpus

    def authorize_scope(self, *, session, user, project_id, edit=False):
        if project_id is not None and project_id is not domain.UNBOUND_SCOPE:
            self.owned_project(session, user, project_id, edit=edit)

    def history(self, *, user, session, scope):
        self.authorize_scope(session=session, user=user, project_id=scope)
        project_scope = Operation.response['projectId'].as_string()
        query = select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.response['createdAt'].as_string().is_not(None))
        if scope is domain.UNBOUND_SCOPE:
            readable_project = select(Project.id).where(Project.id == project_scope).exists()
            query = query.where(or_(project_scope.is_(None), readable_project))
        else:
            query = query.where(project_scope.is_(None) if scope is None else project_scope == scope)
        operations = session.execute(query.order_by(Operation.response['createdAt'].as_string().desc()).limit(30)).scalars().all()
        for op in operations:
            domain.expire_turn(op)
        session.commit()
        return {'turns': [op.response for op in operations if op.response]}

    def receipt(self, *, turn_id: str, user, session, scope):
        self.authorize_scope(session=session, user=user, project_id=scope)
        op = session.get(Operation, (user.id, domain.SCOPE, turn_id))
        if not op or not op.response:
            raise ApiError(404, 'not_found', '会话回执不存在。')
        self.authorize_scope(session=session, user=user, project_id=domain.record_scope(op.response))
        domain.assert_record_scope(op.response, scope)
        domain.expire_turn(op)
        session.commit()
        return op.response

    def conversation(self, *, turn_id: str, user, session, scope):
        self.authorize_scope(session=session, user=user, project_id=scope)
        rows = domain.read_conversation(session, user.id, turn_id, scope)
        session.commit()
        return {'turns': rows}

    async def create_turn(self, *, user, session, check_session, raw_data):
        uuid_string(raw_data['idempotencyKey'])
        self.lock_user(session, user)
        existing = session.get(Operation, (user.id, domain.SCOPE, raw_data['idempotencyKey']))
        if existing and existing.response:
            self.authorize_scope(session=session, user=user, project_id=domain.record_scope(existing.response), edit=True)
        op, repeated = self.operation(session, user, domain.SCOPE, raw_data)
        if repeated:
            domain.expire_turn(op)
            session.commit()
            return op.response
        data = domain.request_input(raw_data, self.corpus)
        self.authorize_scope(session=session, user=user, project_id=data.get('projectId'), edit=True)
        if (issue := domain.research_scope_issue(data['message'])):
            raise ApiError(422, 'research_scope_unavailable', f'本轮请求侧重{issue}。请先明确是否转为相关人群的使用、理解或服务需求调查。')
        ancestors = domain.owned_ancestors(session, user.id, data, self.corpus)
        lookup = None
        if data.get('lookupId') is not None:
            lookup = session.execute(select(KnowledgeLookup).where(KnowledgeLookup.id == data['lookupId'], KnowledgeLookup.user_id == user.id)).scalar_one_or_none()
            if lookup is None or lookup.status != 'ready':
                raise ApiError(404, 'lookup_unavailable', '这份检索回执尚不可用于选题。')
        context = domain.inspect_context(data, self.corpus, ancestors, lookup)
        service, config, key, message = (None, None, '', '')
        if data['mode'] == 'model':
            if context['blockedIds']:
                raise ApiError(409, 'topic_infeasible', '当前条件有明确冲突，请调整后再细化。')
            service = self.owned_service(session, user, data['serviceId'], lock=True)
            if service.revision != data['serviceRevision']:
                raise ApiError(409, 'revision_conflict', '模型服务已变化，请重新选择。')
            if 'research' not in service.capabilities:
                raise ApiError(422, 'capability_unavailable', '此服务未启用研究能力。')
            scope = keyed(self.settings, 'topic-agent-call-rate/v1', user.id)
            count = session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1)))
            if count >= 12:
                raise ApiError(429, 'call_rate_limit', '每小时最多12次选题模型调用。')
            active = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key != op.key, Operation.response['status'].as_string() == 'running')).scalars().all()
            for previous in active:
                domain.expire_turn(previous)
                if previous.response['status'] == 'running':
                    raise ApiError(429, 'call_active', '已有会话正在生成，请先核对回执。')
            session.flush()
            unknown = select(Operation.key).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key != op.key, Operation.response['status'].as_string() == 'outcome_unknown', Operation.response['inputFingerprint'].as_string().in_(domain.equivalent_fingerprints(data, self.corpus))).exists()
            if session.scalar(select(unknown)):
                raise ApiError(409, 'outcome_unknown', '相同材料有待核对调用，请查看原回执。')
            config, key = (config_view(service), decrypt(self.settings, service))
            message = domain.agent_prompt(data, context, ancestors)
            if key in message:
                raise ApiError(422, 'sensitive_input', '会话材料包含服务密钥，请移除后重试。')
            session.add(RateEvent(scope=scope))
        op.response = domain.turn_receipt(data, self.corpus, context, ancestors, self.settings.provider_mode)
        session.commit()
        assistant, failure = (None, None)
        try:
            if data['mode'] == 'local':
                assistant = domain.local_assistant(data, context, ancestors)
            else:
                async with asyncio.timeout(35):
                    raw = await self.generator.topic_agent(config, key, message, context['eligible'])
                    if not isinstance(raw, str) or key in raw:
                        raise ProviderFailure('invalid_response')
                    assistant = domain.parse_assistant(raw, data['candidateIds'], {row['id'] for row in context['sources']})
            context['tools'] = context['tools'] + [domain._tool('draft', f"已整理{len(assistant['items'])}项拟议方案。", [row['patternId'] for row in assistant['items']])]
        except ProviderFailure as error:
            failure = error
        except (TimeoutError, asyncio.CancelledError):
            failure = ProviderFailure('provider_timeout', unknown=data['mode'] == 'model')
        except Exception:
            failure = ProviderFailure('provider_failure', unknown=data['mode'] == 'model')
        finally:
            key = ''
        session.execute(sql_text("SELECT set_config('evix.user_id', :id, true)"), {'id': user.id})
        current = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key == op.key).with_for_update().execution_options(populate_existing=True)).scalar_one()
        if current.response['status'] == 'running':
            current.response = {**current.response, 'status': 'outcome_unknown' if failure and failure.unknown else 'failed' if failure else 'ready', 'assistant': None if failure else assistant, 'errorCode': failure.code if failure else None, 'tools': context['tools'], 'finishedAt': iso(now())}
        session.commit()
        check_session(session)
        self.authorize_scope(session=session, user=user, project_id=domain.record_scope(current.response), edit=True)
        return current.response
