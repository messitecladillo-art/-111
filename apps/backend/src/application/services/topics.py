import asyncio
from datetime import timedelta
from sqlalchemy import select, func, text as sql_text
from shared.errors import ApiError
from shared.contracts import integer, uuid_string
from infrastructure.database.models import Operation, RateEvent, now
from shared.errors import ProviderFailure
from infrastructure.security import keyed, config_view, decrypt
from infrastructure.database.models import KnowledgeLookup
from multi_agent.agents.research_agent.services.topic_regions import assert_profile_region_executable
from multi_agent.agents.research_agent.services import topics as domain

class TopicAdvisorService:

    def __init__(self, *, settings, lock_user, operation, owned_service, generator, corpus=None):
        self.settings = settings
        self.lock_user = lock_user
        self.operation = operation
        self.owned_service = owned_service
        self.generator = generator
        self.corpus = corpus
        self.corpus = self.corpus if self.corpus is not None else domain.load_corpus()
        self.patterns = {self.item['id']: self.item for self.item in self.corpus['catalog']['patterns']}

    def history(self, *, user, session):
        self.lock_user(session, user)
        operations = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.response['createdAt'].as_string().is_not(None)).order_by(Operation.response['createdAt'].as_string().desc()).limit(20)).scalars().all()
        rows = []
        for op in operations:
            domain.expire_receipt(op)
            if op.response:
                r = op.response
                rows.append({key: r[key] for key in ('id', 'status', 'createdAt', 'finishedAt', 'inputFingerprint')})
        session.commit()
        return {'receipts': sorted(rows, key=lambda row: row['createdAt'], reverse=True)[:20]}

    def receipt(self, *, operation_id: str, user, session):
        uuid_string(operation_id)
        self.lock_user(session, user)
        op = session.get(Operation, (user.id, domain.SCOPE, operation_id))
        if not op or not op.response:
            raise ApiError(404, 'not_found', '选题建议不存在。')
        domain.expire_receipt(op)
        session.commit()
        return op.response

    async def propose(self, *, user, session, check_session, data):
        uuid_string(data['idempotencyKey'])
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, domain.SCOPE, data)
        if repeated:
            domain.expire_receipt(op)
            session.commit()
            return op.response
        profile = domain.profile_input(data['profile'])
        assert_profile_region_executable(profile)
        candidate_ids = domain.string_list(data['candidateIds'], 4, 100, set(self.patterns))
        if not candidate_ids:
            raise ApiError()
        goal = domain.clean(data['goal'], 800)
        if data['consent'] is not True:
            raise ApiError(422, 'consent_required', '请确认本次选题材料与模型服务。')
        if data['catalogVersion'] != self.corpus['catalog']['contentVersion']:
            raise ApiError(409, 'catalog_conflict', '选题资料已更新，请重新生成推荐。')
        service = self.owned_service(session, user, data['serviceId'], lock=True)
        if integer(data['serviceRevision'], 1) != service.revision:
            raise ApiError(409, 'revision_conflict', '模型服务已变化，请重新选择。')
        if 'research' not in service.capabilities:
            raise ApiError(422, 'capability_unavailable', '此服务未启用研究能力。')
        scope = keyed(self.settings, 'topic-call-rate/v1', user.id)
        count = session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1)))
        if count >= 12:
            raise ApiError(429, 'call_rate_limit', '每小时最多12次选题细化。')
        active = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key != op.key, Operation.response['status'].as_string() == 'running')).scalars().all()
        for previous in active:
            domain.expire_receipt(previous)
            if previous.response and previous.response['status'] == 'running':
                raise ApiError(429, 'call_active', '已有选题建议正在生成，请先核对回执。')
        lookup = None
        if data.get('lookupId') is not None:
            lookup = session.execute(select(KnowledgeLookup).where(KnowledgeLookup.id == uuid_string(data['lookupId']), KnowledgeLookup.user_id == user.id)).scalar_one_or_none()
            if lookup is None or lookup.status != 'ready':
                raise ApiError(404, 'lookup_unavailable', '这份检索回执尚不可用于选题。')
        selected = [self.patterns[key] for key in candidate_ids]
        if domain.selected_blockers(profile, selected):
            raise ApiError(409, 'topic_infeasible', '当前调查渠道或资源不足，请调整研究范围后再细化。')
        message, allowed_sources, sources, example_ids = domain.build_prompt(profile, selected, self.corpus, goal, lookup)
        config, key = (config_view(service), decrypt(self.settings, service))
        if key in message:
            raise ApiError(422, 'sensitive_input', '选题材料包含服务密钥，请移除后重试。')
        input_fingerprint = domain.proposal_input_fingerprint(data, self.corpus)
        session.flush()
        unknown_exists = select(Operation.key).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE, Operation.key != op.key, Operation.response['status'].as_string() == 'outcome_unknown', Operation.response['inputFingerprint'].as_string() == input_fingerprint, Operation.response['serviceId'].as_string() == service.id).exists()
        if session.scalar(select(unknown_exists)):
            raise ApiError(409, 'outcome_unknown', '相同材料有待核对的调用，请查看原回执。')
        op.response = {'id': op.key, 'status': 'running', 'classification': 'proposed', 'serviceId': service.id, 'serviceRevision': service.revision, 'catalogVersion': data['catalogVersion'], 'inputFingerprint': input_fingerprint, 'createdAt': domain.iso(now()), 'finishedAt': None, 'proposal': None, 'sources': sources, 'trainingExampleIds': example_ids, 'errorCode': None, 'providerMode': self.settings.provider_mode}
        source_versions = domain.proposal_source_versions(profile, self.corpus)
        if source_versions is not None:
            op.response = {**op.response, 'sourceVersions': source_versions}
        session.add(RateEvent(scope=scope))
        session.commit()
        proposal, failure = (None, None)
        try:
            async with asyncio.timeout(35):
                raw = await self.generator.topic(config, key, message, selected)
                if not isinstance(raw, str) or key in raw:
                    raise ProviderFailure('invalid_response')
                proposal = domain.parse_result(raw, candidate_ids, allowed_sources)
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
            current.response = {**current.response, 'status': 'outcome_unknown' if failure and failure.unknown else 'failed' if failure else 'ready', 'proposal': proposal, 'errorCode': failure.code if failure else None, 'finishedAt': domain.iso(now())}
        session.commit()
        check_session(session)
        return current.response
