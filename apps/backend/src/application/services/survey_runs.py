import asyncio
from types import SimpleNamespace
from datetime import timedelta
from sqlalchemy import select, func, text as sql_text, update
from sqlalchemy.orm import Session as DBSession
from shared.errors import ApiError
from shared.contracts import uuid_string, integer, canonical, object_fields
from infrastructure.database.models import SiliconRun, now, new_id
from infrastructure.security import keyed, config_view, decrypt
from shared.errors import ProviderFailure
from multi_agent.agents.survey_agent.services import interview_pretest, silicon
from application.presenters import silicon_view

PRETEST = 'interview_pretest'


def has_secret(value, key):
    if isinstance(value, str):
        return key in value
    if isinstance(value, dict):
        return any(has_secret(item, key) for item in value.values())
    if isinstance(value, list):
        return any(has_secret(item, key) for item in value)
    return False


class PretestStopped(Exception):
    pass


class SurveyRunService:

    def __init__(self, *, settings, engine, generator, owned_project, owned_service, lock_user, tasks):
        self.settings = settings
        self.engine = engine
        self.generator = generator
        self.owned_project = owned_project
        self.owned_service = owned_service
        self.lock_user = lock_user
        self.tasks = tasks

    def expire_silicon(self, *, session, user):
        session.execute(update(SiliconRun).where(SiliconRun.user_id == user.id, SiliconRun.status == 'running', SiliconRun.updated_at < now() - timedelta(seconds=self.settings.silicon_stale_seconds)).values(status='outcome_unknown', error_code='interrupted_run', finished_at=now()))

    def scoped(self, *, session, user_id):
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {'user_id': user_id})

    async def silicon_unit(self, *, plan, persona, scenario, service, dead):
        """Run one persona × scenario × model; returns (response, provider calls). Never raises."""
        meta, config, key = service
        design, calls = (plan['design'], 0)
        response = {'personaId': persona['id'], 'scenarioId': scenario['id'] if scenario else 'base', 'model': meta['name'], 'status': 'ok', 'answers': []}

        async def ask(message, spec):
            nonlocal calls
            if meta['serviceId'] in dead:
                raise ProviderFailure(dead[meta['serviceId']])
            calls += 1
            try:
                async with asyncio.timeout(self.settings.silicon_call_seconds):
                    raw = await self.generator.answer(config, key, message, spec)
            except ProviderFailure as error:
                if error.code in ('authentication_failed', 'redirect_blocked', 'input_too_large'):
                    dead[meta['serviceId']] = error.code
                raise
            except (TimeoutError, asyncio.TimeoutError):
                raise ProviderFailure('provider_timeout', unknown=True) from None
            if not isinstance(raw, str) or key in raw:
                raise ProviderFailure('invalid_response')
            return raw
        try:
            if plan['memory'] == 'carry':
                raw = await ask(silicon.carry_prompt(plan, persona, scenario), {'mode': 'carry', 'questions': [silicon.question_spec(q) for q in design['questions']]})
                response['answers'] = silicon.assemble_carry(design, silicon.parse_carry(raw, design))
            else:
                answers = {}
                for question in design['questions']:
                    shown = silicon.is_shown(question, answers)
                    value, unclear = (None, '')
                    if shown:
                        value, unclear = silicon.parse_single(await ask(silicon.single_prompt(plan, persona, scenario, question, answers), {'mode': 'single', 'questions': [silicon.question_spec(question)]}))
                    answers[question['id']] = silicon.make_answer(question, shown, value, unclear)
                response['answers'] = [answers[q['id']] for q in design['questions']]
        except ProviderFailure as error:
            response.update(status='outcome_unknown' if error.unknown else 'failed', answers=[], error=error.code)
        except ApiError:
            response.update(status='failed', answers=[], error='invalid_response')
        except Exception:
            response.update(status='outcome_unknown', answers=[], error='provider_failure')
        return (response, calls)

    async def silicon_worker(self, *, run_id, user_id, plan, services):
        stop, dead, lock = (asyncio.Event(), {}, asyncio.Semaphore(self.settings.silicon_concurrency))
        per_unit = len(plan['design']['questions']) if plan['memory'] == 'independent' else 1

        def persist(response):
            with DBSession(self.engine, expire_on_commit=False) as session:
                self.scoped(session=session, user_id=user_id)
                row = session.execute(select(SiliconRun).where(SiliconRun.id == run_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
                if row is None or row.status != 'running':
                    stop.set()
                    return
                row.responses = [*row.responses, response]
                row.done, row.updated_at = (min(row.total, row.done + per_unit), now())
                session.commit()

        async def unit(persona, scenario, service):
            async with lock:
                if stop.is_set():
                    return
                response, _ = await self.silicon_unit(plan=plan, persona=persona, scenario=scenario, service=service, dead=dead)
                await asyncio.to_thread(persist, response)
        try:
            await asyncio.gather(*(unit(p, sc, sv) for p in plan['personas'] for sc in plan['scenarios'] or [None] for sv in services))

            def finish():
                with DBSession(self.engine, expire_on_commit=False) as session:
                    self.scoped(session=session, user_id=user_id)
                    row = session.execute(select(SiliconRun).where(SiliconRun.id == run_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
                    if row is not None and row.status == 'running':
                        failed = sum((r['status'] == 'failed' for r in row.responses))
                        unknown = sum((r['status'] == 'outcome_unknown' for r in row.responses))
                        if row.responses and failed == len(row.responses):
                            row.status = 'failed'
                        else:
                            row.status = 'outcome_unknown' if unknown else 'ready'
                        row.error_code = 'unreconciled_calls' if unknown else next((r['error'] for r in row.responses if r['status'] == 'failed'), None) if failed else None
                        row.done, row.finished_at, row.updated_at = (row.total, now(), now())
                        session.commit()
            await asyncio.to_thread(finish)
        finally:
            services.clear()


    async def pretest_worker(self, *, run_id, user_id, project_id, plan, service):
        meta, config, key = service
        calls = 0
        actor = SimpleNamespace(id=user_id)

        def update_run(action, event=None, status=None, code=None):
            with DBSession(self.engine) as session:
                self.scoped(session=session, user_id=user_id)
                row = session.execute(select(SiliconRun).where(
                    SiliconRun.id == run_id, SiliconRun.user_id == user_id, SiliconRun.project_id == project_id
                ).with_for_update()).scalar_one_or_none()
                if row is None or row.status != 'running':
                    return False
                if action in ('dispatch', 'event'):
                    try:
                        self.owned_project(session, actor, project_id, edit=True)
                        selected = self.owned_service(session, actor, meta['serviceId'])
                        if selected.revision != meta['serviceRevision']:
                            raise ApiError(409, 'revision_conflict')
                    except ApiError as error:
                        row.status, row.error_code, row.finished_at = 'failed', error.code, now()
                        session.commit()
                        return False
                if event is not None:
                    row.responses = [*row.responses, event]
                if status is not None:
                    row.status, row.error_code, row.finished_at = status, code, now()
                row.done, row.updated_at = calls, now()
                session.commit()
                return True

        async def ask(stage, payload, prompt):
            nonlocal calls
            if not await asyncio.to_thread(update_run, 'dispatch'):
                raise PretestStopped()
            if calls >= interview_pretest.MAX_CALLS or key in prompt:
                raise ProviderFailure('input_too_large')
            calls += 1
            try:
                async with asyncio.timeout(self.settings.silicon_call_seconds):
                    raw = await self.generator.answer(config, key, prompt, {
                        'mode': 'interview_pretest', 'stage': stage, 'input': payload,
                    })
            except TimeoutError:
                raise ProviderFailure('provider_timeout', unknown=True) from None
            if not isinstance(raw, str) or key in raw:
                raise ProviderFailure('invalid_response')
            return raw

        async def emit(event):
            if has_secret(event, key):
                raise ProviderFailure('invalid_response')
            if not await asyncio.to_thread(update_run, 'event', event):
                raise PretestStopped()

        try:
            await interview_pretest.run_pretest(plan, ask, emit)
        except PretestStopped:
            return
        except ProviderFailure as error:
            await asyncio.to_thread(update_run, 'finish', status='outcome_unknown' if error.unknown else 'failed', code=error.code)
        except ApiError:
            await asyncio.to_thread(update_run, 'finish', status='failed', code='invalid_response')
        except Exception:
            await asyncio.to_thread(update_run, 'finish', status='outcome_unknown', code='provider_failure')
        else:
            await asyncio.to_thread(update_run, 'finish', status='ready')

    @staticmethod
    def pretest_view(row, full=False):
        result = silicon_view(row)
        result.update(kind='interview_pretest', engine=row.plan['engine'], topic=row.plan['topic'])
        if full:
            result.update(events=row.responses, originalDesign=row.plan['design'])
        return result

    async def start_silicon_run(self, *, project_id: str, user, session, data, p, pretest=False):
        key_id = uuid_string(data['idempotencyKey'])
        digest = keyed(self.settings, 'silicon-pretest-consent/v1' if pretest else 'silicon-consent/v1', canonical(data))
        self.lock_user(session, user)
        self.expire_silicon(session=session, user=user)
        old = session.execute(select(SiliconRun).where(SiliconRun.project_id == p.id, SiliconRun.user_id == user.id, SiliconRun.idempotency_key == key_id)).scalar_one_or_none()
        if old:
            if old.payload_hash != digest:
                raise ApiError(409, 'idempotency_conflict', '操作标识已用于不同请求。')
            session.commit()
            return self.pretest_view(old) if pretest else silicon_view(old)
        if data['consent'] is not True:
            raise ApiError(422, 'consent_required', '运行前需要明确确认外部调用。')
        if not callable(getattr(self.generator, 'answer', None)):
            raise ApiError(503, 'capability_unavailable', '当前部署未启用硅基样本。')
        if pretest:
            plan = interview_pretest.pretest_plan(data)
            plan['engine'] = 'fixture' if self.settings.provider_mode == 'fixture' else 'model'
            refs = [{'serviceId': data['serviceId'], 'serviceRevision': data['serviceRevision']}]
        else:
            plan = silicon.silicon_plan(data)
            refs = data['services']
        if not isinstance(refs, list) or not 1 <= len(refs) <= silicon.LIMITS['services']:
            raise ApiError()
        chosen = []
        for ref in refs:
            r = object_fields(ref, ('serviceId', 'serviceRevision'))
            s = self.owned_service(session, user, r['serviceId'])
            if any((s.id == c.id for c in chosen)):
                raise ApiError()
            if integer(r['serviceRevision'], 1) != s.revision:
                raise ApiError(409, 'revision_conflict', '服务配置已变化。')
            if 'research' not in s.capabilities:
                raise ApiError(422, 'capability_unavailable', '所选服务未启用研究能力。')
            chosen.append(s)
        total = interview_pretest.MAX_CALLS if pretest else silicon.planned_calls(plan, len(chosen))
        if total > self.settings.silicon_max_calls:
            raise ApiError(422, 'run_too_large', f'本次运行需要 {total} 次模型调用，超过上限 {self.settings.silicon_max_calls}。')
        if not pretest and integer(data['expectedCalls'], 1, 1000) != total:
            raise ApiError(409, 'estimate_conflict', '调用次数估计已变化，请重新确认。')
        p, _ = self.owned_project(session, user, project_id, edit=True, lock=True)
        if session.scalar(select(func.count()).select_from(SiliconRun).where(SiliconRun.user_id == user.id, SiliconRun.status == 'running')):
            raise ApiError(429, 'call_active', '已有硅基样本运行正在进行。')
        if session.scalar(select(func.count()).select_from(SiliconRun).where(SiliconRun.user_id == user.id, SiliconRun.created_at > now() - timedelta(hours=1))) >= self.settings.silicon_hourly_runs:
            raise ApiError(429, 'call_rate_limit', f'每小时最多 {self.settings.silicon_hourly_runs} 次硅基样本运行。')
        names, services = ([], [])
        for s in chosen:
            config, key = (config_view(s), decrypt(self.settings, s))
            if key in canonical(plan) or pretest and has_secret(plan, key):
                raise ApiError(422, 'sensitive_input', '画像或问卷内容不能包含服务密钥。')
            name = f'{s.label} · {s.model}'
            name = name if name not in names else f'{name} #{names.count(name) + 1}'
            names.append(name)
            services.append(({'serviceId': s.id, 'serviceRevision': s.revision, 'name': name}, config, key))
        run = SiliconRun(id=new_id(), user_id=user.id, project_id=p.id, idempotency_key=key_id, payload_hash=digest, status='running', services=[meta for meta, _, _ in services], plan=plan, total=total, done=0, responses=[])
        session.add(run)
        session.commit()
        if pretest:
            task = asyncio.create_task(self.pretest_worker(
                run_id=run.id, user_id=user.id, project_id=p.id, plan=plan, service=services[0],
            ))
        else:
            task = asyncio.create_task(self.silicon_worker(run_id=run.id, user_id=user.id, plan=plan, services=services))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return self.pretest_view(run) if pretest else silicon_view(run)

    def list_silicon_runs(self, *, project_id: str, user, session, pretest=False):
        p, _ = self.owned_project(session, user, project_id)
        self.expire_silicon(session=session, user=user)
        kind = SiliconRun.plan['kind'].as_string()
        mode = kind == PRETEST if pretest else kind.is_(None)
        rows = session.execute(select(SiliconRun).where(SiliconRun.project_id == p.id, SiliconRun.user_id == user.id, mode).order_by(SiliconRun.created_at.desc(), SiliconRun.id.desc()).limit(30)).scalars().all()
        session.commit()
        if pretest:
            return {'runs': [self.pretest_view(row) for row in rows]}
        return {'runs': [silicon_view(row) for row in rows], 'limits': {'maxCalls': self.settings.silicon_max_calls, 'hourlyRuns': self.settings.silicon_hourly_runs, 'maxServices': silicon.LIMITS['services']}}

    def silicon_row(self, *, session, user, project_id, run_id, lock=False, pretest=False):
        p, _ = self.owned_project(session, user, project_id)
        uuid_string(run_id)
        self.expire_silicon(session=session, user=user)
        query = select(SiliconRun).where(SiliconRun.id == run_id, SiliconRun.project_id == p.id, SiliconRun.user_id == user.id).execution_options(populate_existing=True)
        row = session.execute(query.with_for_update() if lock else query).scalar_one_or_none()
        if not row or (row.plan.get('kind') == PRETEST) != pretest:
            raise ApiError(404, 'not_found', '运行记录不存在。')
        return row

    def get_silicon_run(self, *, project_id: str, run_id: str, user, session, pretest=False):
        row = self.silicon_row(session=session, user=user, project_id=project_id, run_id=run_id, pretest=pretest)
        session.commit()
        return self.pretest_view(row, full=True) if pretest else silicon_view(row, full=True)

    def cancel_silicon_run(self, *, project_id: str, run_id: str, user, session, pretest=False):
        row = self.silicon_row(session=session, user=user, project_id=project_id, run_id=run_id, lock=True, pretest=pretest)
        if row.status == 'running':
            row.status, row.error_code, row.finished_at, row.updated_at = ('cancelled', 'cancelled_by_user', now(), now())
        session.commit()
        return self.pretest_view(row, full=True) if pretest else silicon_view(row, full=True)
