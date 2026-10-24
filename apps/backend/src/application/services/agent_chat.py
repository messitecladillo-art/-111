import asyncio
from datetime import timedelta
from sqlalchemy import func, select, text as sql_text
from shared.errors import ApiError, ProviderFailure
from shared.contracts import uuid_string
from infrastructure.database.models import Operation, RateEvent, now
from infrastructure.security import config_view, decrypt, keyed
from multi_agent.agents.research_agent.services.topics import iso
from multi_agent.agents.research_agent.services import agent_chat as domain

# A conversation turn is cheaper and more frequent than a topic proposal, but still billed to the user's own key.
CALLS_PER_HOUR = 30


class AgentChatService:
    """One model turn of the 证见 Agent: recorded before dispatch, replayed by key, reconciled by receipt."""

    def __init__(self, *, settings, lock_user, operation, owned_service, generator):
        self.settings = settings
        self.lock_user = lock_user
        self.operation = operation
        self.owned_service = owned_service
        self.generator = generator

    def receipt(self, *, turn_id, user, session):
        op = session.get(Operation, (user.id, domain.SCOPE, turn_id))
        if not op or not op.response:
            raise ApiError(404, 'not_found', '对话回执不存在。')
        domain.expire_turn(op)
        session.commit()
        return op.response

    async def create_turn(self, *, user, session, check_session, raw_data):
        uuid_string(raw_data['idempotencyKey'])
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, domain.SCOPE, raw_data)
        if repeated:
            domain.expire_turn(op)
            session.commit()
            return op.response
        data = domain.request_input(raw_data)
        service = self.owned_service(session, user, data['serviceId'], lock=True)
        if service.revision != data['serviceRevision']:
            raise ApiError(409, 'revision_conflict', '模型服务已变化，请重新选择。')
        if 'research' not in service.capabilities:
            raise ApiError(422, 'capability_unavailable', '此服务未启用研究能力。')
        scope = keyed(self.settings, 'agent-chat-call-rate/v1', user.id)
        count = session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1)))
        if count >= CALLS_PER_HOUR:
            raise ApiError(429, 'call_rate_limit', f'每小时最多{CALLS_PER_HOUR}次对话模型调用。')
        active = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key != op.key, Operation.response['status'].as_string() == 'running')).scalars().all()
        for previous in active:
            domain.expire_turn(previous)
            if previous.response['status'] == 'running':
                raise ApiError(429, 'call_active', '上一轮还在生成，请先核对它的回执。')
        session.flush()
        unknown = select(Operation.key).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key != op.key, Operation.response['status'].as_string() == 'outcome_unknown', Operation.response['inputFingerprint'].as_string() == domain.input_fingerprint(data)).exists()
        if session.scalar(select(unknown)):
            raise ApiError(409, 'outcome_unknown', '同样的话有一轮结果尚未明确，请先核对原回执。')
        config, key = (config_view(service), decrypt(self.settings, service))
        message = domain.agent_prompt(data)
        if key in message or domain.contains_secret({'message': data['message'], 'history': data['history'], 'context': data['context']}, key):
            raise ApiError(422, 'sensitive_input', '对话包含服务密钥，请移除后重试。')
        session.add(RateEvent(scope=scope))
        op.response = domain.turn_receipt(data, self.settings.provider_mode)
        session.commit()
        reply, failure = (None, None)
        try:
            async with asyncio.timeout(35):
                raw = await self.generator.agent_chat(config, key, message)
                if not isinstance(raw, str) or key in raw:
                    raise ProviderFailure('invalid_response')
                reply = domain.parse_reply(raw)
                if domain.contains_secret(reply, key):
                    raise ProviderFailure('invalid_response')
        except ProviderFailure as error:
            failure = error
        except (TimeoutError, asyncio.CancelledError):
            failure = ProviderFailure('provider_timeout', unknown=True)
        except Exception:
            failure = ProviderFailure('provider_failure', unknown=True)
        finally:
            key = ''
        session.execute(sql_text("SELECT set_config('evix.user_id', :id, true)"), {'id': user.id})
        current = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key == op.key).with_for_update().execution_options(populate_existing=True)).scalar_one()
        if current.response['status'] == 'running':
            status = 'outcome_unknown' if failure and failure.unknown else 'failed' if failure else 'ready'
            current.response = {**current.response, 'status': status, 'reply': reply['reply'] if reply else None,
                                'actions': reply['actions'] if reply else [], 'droppedActions': reply['droppedActions'] if reply else 0,
                                'errorCode': failure.code if failure else None, 'finishedAt': iso(now())}
        session.commit()
        check_session(session)
        return current.response
