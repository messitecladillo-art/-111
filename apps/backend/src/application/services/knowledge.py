import asyncio
from datetime import timedelta
from sqlalchemy import select, text as sql_text, func
from sqlalchemy.dialects.postgresql import insert
from shared.errors import ApiError
from shared.contracts import integer, uuid_string
from infrastructure.database.models import now
from infrastructure.database.models import KnowledgeUserState, KnowledgeProjectState, KnowledgeReference, KnowledgeTermRequest, KnowledgeLookup, KnowledgeMonthlyBudget, KnowledgeDailyBudget
from multi_agent.agents.research_agent.services import knowledge as domain

class KnowledgeService:

    def __init__(self, *, settings, owned_project, lock_user, operation, catalog=None, provider=None, config=None):
        self.settings = settings
        self.owned_project = owned_project
        self.lock_user = lock_user
        self.operation = operation
        self.catalog = catalog
        self.provider = provider
        self.config = config
        self.catalog = self.catalog if self.catalog is not None else domain.catalog_from_file()
        self.config = self.config or domain.KnowledgeConfig.from_environment(self.settings.mode == 'production')
        if self.settings.mode == 'production' and self.provider is not None:
            raise ValueError('Production knowledge rejects injected providers')
        self.provider = self.provider or (domain.LiveTavily(self.config) if self.config.api_key else None)

    def bind(self, *, session, user):
        session.execute(sql_text("SELECT set_config('evix.user_id', :uid, true)"), {'uid': user.id})

    def state_view(self, *, row):
        return {'revision': row.revision if row else 0, **(row.content if row else {'favorites': [], 'recent': [], 'preferences': {}})}

    def project_state(self, *, session, project_id):
        state = session.get(KnowledgeProjectState, project_id)
        refs = session.scalars(select(KnowledgeReference).where(KnowledgeReference.project_id == project_id, KnowledgeReference.deleted.is_(False)).order_by(KnowledgeReference.created_at, KnowledgeReference.id)).all()
        return {'revision': state.revision if state else 0, 'references': [{'id': r.id, 'entryId': r.entry_id, 'entryVersion': r.entry_version, 'createdBy': r.created_by, 'createdAt': domain.stamp(r.created_at)} for r in refs]}

    def check_revision(self, *, actual, expected):
        if actual != integer(expected, 0):
            raise ApiError(409, 'version_conflict', '内容已有更新，请载入最新版本。')

    def get_state(self, *, session, user):
        return self.state_view(row=session.get(KnowledgeUserState, user.id))

    async def put_state(self, *, session, data, user):
        content = domain.user_content(data['state'], self.catalog)
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, 'knowledge-state', data)
        if repeated:
            return op.response
        row = session.get(KnowledgeUserState, user.id)
        self.check_revision(actual=row.revision if row else 0, expected=data['expectedRevision'])
        if row:
            row.revision += 1
            row.content = content
            row.updated_at = now()
        else:
            row = KnowledgeUserState(user_id=user.id, revision=1, content=content, updated_at=now())
            session.add(row)
        op.response = self.state_view(row=row)
        session.commit()
        return op.response

    def get_references(self, *, project_id: str, session, user):
        self.owned_project(session, user, project_id)
        return self.project_state(session=session, project_id=project_id)

    async def mutate_reference(self, *, project_id, session, reference_id=None, data, user):
        if reference_id:
            uuid_string(reference_id)
        else:
            domain.validate_entry({'entryId': data['entryId'], 'entryVersion': data['entryVersion']}, self.catalog)
        self.lock_user(session, user)
        self.owned_project(session, user, project_id, edit=True, lock=True)
        scope = 'knowledge-ref:' + project_id + (':' + reference_id if reference_id else '')
        op, repeated = self.operation(session, user, scope, data)
        if repeated:
            return op.response
        state = session.get(KnowledgeProjectState, project_id)
        self.check_revision(actual=state.revision if state else 0, expected=data['expectedRevision'])
        if not state:
            state = KnowledgeProjectState(project_id=project_id, revision=0)
            session.add(state)
        if reference_id:
            row = session.scalar(select(KnowledgeReference).where(KnowledgeReference.id == reference_id, KnowledgeReference.project_id == project_id, KnowledgeReference.deleted.is_(False)))
            if not row:
                raise ApiError(404, 'not_found', '资源不存在。')
            row.deleted = True
        else:
            row = session.scalar(select(KnowledgeReference).where(KnowledgeReference.project_id == project_id, KnowledgeReference.entry_id == data['entryId'], KnowledgeReference.entry_version == data['entryVersion']))
            if row:
                row.deleted = False
            else:
                session.add(KnowledgeReference(project_id=project_id, entry_id=data['entryId'], entry_version=data['entryVersion'], created_by=user.id, deleted=False))
        state.revision += 1
        session.flush()
        op.response = self.project_state(session=session, project_id=project_id)
        session.commit()
        return op.response

    async def term_request(self, *, session, data, user):
        domain.short_line(data['term'], 120, 1)
        domain.short_line(data['domain'], 60)
        domain.short_line(data['note'], 500)
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, 'knowledge-term-request', data)
        if repeated:
            return op.response
        midnight = now().replace(hour=0, minute=0, second=0, microsecond=0)
        count = session.scalar(select(func.count()).select_from(KnowledgeTermRequest).where(KnowledgeTermRequest.user_id == user.id, KnowledgeTermRequest.created_at >= midnight))
        if count >= 5:
            raise ApiError(429, 'knowledge_request_limit', '今天的补词申请已达上限。')
        row = KnowledgeTermRequest(user_id=user.id, idempotency_key=data['idempotencyKey'], payload_hash=op.payload_hash, term=data['term'], domain=data['domain'], note=data['note'], status='submitted')
        session.add(row)
        session.flush()
        op.response = {'id': row.id, 'status': row.status, 'createdAt': domain.stamp(row.created_at)}
        session.commit()
        return op.response

    def expire_lookup(self, *, row):
        if row.status == 'running' and row.created_at <= now() - timedelta(seconds=self.config.timeout_seconds + 30):
            row.status = 'outcome_unknown'
            row.error_code = 'lookup_interrupted_unknown'
            row.finished_at = now()
            return True
        return False

    def get_lookup(self, *, lookup_id: str, session, user):
        uuid_string(lookup_id)
        row = session.scalar(select(KnowledgeLookup).where(KnowledgeLookup.id == lookup_id, KnowledgeLookup.user_id == user.id).with_for_update())
        if not row:
            raise ApiError(404, 'not_found', '资源不存在。')
        if self.expire_lookup(row=row):
            session.commit()
        return domain.lookup_view(row)

    def settle_lookup(self, *, session, user, lookup_id, result=None, failure=None):
        self.bind(session=session, user=user)
        initial = session.get(KnowledgeLookup, lookup_id)
        monthly = session.scalar(select(KnowledgeMonthlyBudget).where(KnowledgeMonthlyBudget.month == initial.budget_month).with_for_update())
        row = session.scalar(select(KnowledgeLookup).where(KnowledgeLookup.id == lookup_id).with_for_update().execution_options(populate_existing=True))
        if row.status not in ('running', 'outcome_unknown'):
            return domain.lookup_view(row)
        if result:
            row.results = result.results
            row.provider_request_id = result.request_id
            row.actual_credits = result.credits
            if result.credits is None:
                row.status = 'outcome_unknown'
                row.error_code = 'lookup_usage_unknown'
            elif result.credits > row.reserved_credits:
                monthly.blocked = True
                monthly.reserved -= row.reserved_credits
                monthly.settled += result.credits
                row.reserved_credits = 0
                row.status = 'outcome_unknown'
                row.error_code = 'lookup_usage_anomaly'
            else:
                monthly.reserved -= row.reserved_credits
                monthly.settled += result.credits
                row.reserved_credits = 0
                row.status = 'ready'
                row.error_code = None
        elif failure.unknown:
            row.status = 'outcome_unknown'
            row.error_code = failure.code
        else:
            monthly.reserved -= row.reserved_credits
            row.reserved_credits = 0
            row.actual_credits = 0
            row.status = 'failed'
            row.error_code = failure.code
        row.finished_at = now()
        session.commit()
        return domain.lookup_view(row)

    async def create_lookup(self, *, session, data, user):
        query = domain.lookup_query(data['query'])
        uuid_string(data['idempotencyKey'])
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, 'knowledge-lookup', data)
        if repeated:
            row = session.get(KnowledgeLookup, op.response['id'])
            if self.expire_lookup(row=row):
                session.commit()
            return domain.lookup_view(row)
        if self.provider is None:
            raise ApiError(503, 'knowledge_lookup_unconfigured', '联网查证尚未配置。')
        month, day = (now().strftime('%Y-%m'), now().strftime('%Y-%m-%d'))
        session.execute(insert(KnowledgeMonthlyBudget).values(month=month, reserved=0, settled=0, blocked=False).on_conflict_do_nothing())
        monthly = session.scalar(select(KnowledgeMonthlyBudget).where(KnowledgeMonthlyBudget.month == month).with_for_update())
        session.execute(insert(KnowledgeDailyBudget).values(user_id=user.id, day=day, requests=0).on_conflict_do_nothing())
        daily = session.scalar(select(KnowledgeDailyBudget).where(KnowledgeDailyBudget.user_id == user.id, KnowledgeDailyBudget.day == day).with_for_update())
        if monthly.blocked or monthly.reserved + monthly.settled >= self.config.monthly_limit:
            raise ApiError(429, 'knowledge_monthly_limit', '本月联网查证额度已用完。')
        if daily.requests >= self.config.daily_limit:
            raise ApiError(429, 'knowledge_daily_limit', '今天的联网查证次数已用完。')
        monthly.reserved += 1
        daily.requests += 1
        row = KnowledgeLookup(user_id=user.id, idempotency_key=data['idempotencyKey'], payload_hash=op.payload_hash, query=query, status='running', budget_month=month, budget_day=day, reserved_credits=1, results=[])
        session.add(row)
        session.flush()
        op.response = {'id': row.id}
        lookup_id = row.id
        session.commit()
        try:
            result = await asyncio.wait_for(self.provider(query), self.config.timeout_seconds)
            if not isinstance(result, domain.LookupResult):
                raise domain.LookupFailure('lookup_invalid_response')
            return self.settle_lookup(session=session, user=user, lookup_id=lookup_id, result=result)
        except domain.LookupFailure as failure:
            return self.settle_lookup(session=session, user=user, lookup_id=lookup_id, failure=failure)
        except asyncio.CancelledError:
            self.settle_lookup(session=session, user=user, lookup_id=lookup_id, failure=domain.LookupFailure('lookup_cancelled_unknown'))
            raise
        except Exception:
            return self.settle_lookup(session=session, user=user, lookup_id=lookup_id, failure=domain.LookupFailure('lookup_dispatch_unknown'))
