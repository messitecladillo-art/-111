"""Authorization, reservation and reconciliation for the report coordinator.

Each provider dispatch has one durable Operation committed before external I/O.
There is no background report runner and no automatic replay of uncertain work.
"""
import asyncio
from copy import deepcopy
from datetime import timedelta

from sqlalchemy import func, select, text as sql_text

from infrastructure.database.models import Member, Operation, RateEvent, now
from infrastructure.security import config_view, decrypt, keyed
from multi_agent.agents.writing_agent.services import full_report_section as domain
from shared.contracts import canonical, uuid_string
from shared.errors import ApiError, ProviderFailure


class FullReportSectionService:
    def __init__(self, *, settings, lock_user, operation, owned_project, owned_service, generator):
        self.settings, self.lock_user, self.operation = settings, lock_user, operation
        self.owned_project, self.owned_service, self.generator = owned_project, owned_service, generator

    def _project(self, session, user, project_id, *, edit=False):
        if project_id is not None:
            project, _ = self.owned_project(session, user, project_id, edit=edit, lock=edit)
            if edit:
                # Keep permission stable through the reservation/finalization commit.
                member = session.execute(select(Member).where(Member.team_id == project.team_id, Member.user_id == user.id)
                    .with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
                if member is None or member.role not in ("owner", "editor"):
                    raise ApiError(403, "permission_denied", "当前项目权限不能生成报告。")

    def _service(self, session, user, data):
        service = self.owned_service(session, user, data["serviceId"], lock=True)
        # Sessions use expire_on_commit=False: an earlier identity-map object must
        # not hide a model configuration change that happened during provider I/O.
        session.refresh(service)
        if service.deleted or service.user_id != user.id:
            raise ApiError(404, "not_found", "模型服务不存在。")
        if service.revision != data["serviceRevision"]:
            raise ApiError(409, "revision_conflict", "模型服务已变化，请重新确认生成计划。")
        if "report" not in service.capabilities:
            raise ApiError(422, "capability_unavailable", "此模型服务未启用报告能力。")
        return service

    def _run(self, session, user, data, *, authorize=True):
        op = session.get(Operation, (user.id, domain.RUN_SCOPE, data["runId"]))
        if not op or not op.response:
            raise ApiError(409, "run_not_authorized", "请先确认并校验本轮生成计划。")
        if domain.context(data) != domain.context(op.response):
            raise ApiError(409, "run_context_conflict", "本轮项目、输入或服务版本不匹配。")
        if authorize and domain.authorization_expired(op.response):
            raise ApiError(409, "run_expired", "本轮授权已过期，已有调用仍可核对回执。")
        return op.response

    def preflight(self, *, user, session, check_session, raw_data):
        data = domain.preflight_input(raw_data)
        self.lock_user(session, user)
        self._project(session, user, data["projectId"], edit=True)
        service = self._service(session, user, data)
        check_session(session, lock=True)
        key = decrypt(self.settings, service)
        try:
            if domain.contains_secret(canonical(data), key) or domain.contains_secret(canonical(config_view(service)), key):
                raise ApiError(422, "sensitive_input", "运行信息包含模型服务密钥，请移除后再试。")
        finally:
            key = ""
        op, repeated = self.operation(session, user, domain.RUN_SCOPE, {**data, "idempotencyKey": data["runId"]})
        if repeated:
            if not op.response or domain.authorization_expired(op.response):
                raise ApiError(409, "run_expired", "本轮授权已过期，不能通过重放延长。")
        else:
            op.response = domain.run_receipt(data, service, self.settings.provider_mode)
        result = deepcopy(op.response)
        session.commit()
        return result

    def receipt(self, *, section_id, user, session, check_session):
        uuid_string(section_id)
        self.lock_user(session, user)
        check_session(session, lock=True)
        op = session.get(Operation, (user.id, domain.SCOPE, section_id))
        if not op or not op.response:
            raise ApiError(404, "not_found", "章节调用回执不存在。")
        self._project(session, user, op.response["projectId"])
        domain.expire_section(op)
        result = deepcopy(op.response)
        session.commit()
        return result

    def run_receipt(self, *, run_id, user, session, check_session):
        uuid_string(run_id)
        self.lock_user(session, user)
        check_session(session, lock=True)
        op = session.get(Operation, (user.id, domain.RUN_SCOPE, run_id))
        if not op or not op.response:
            raise ApiError(404, "not_found", "报告运行回执不存在。")
        run = op.response
        self._project(session, user, run["projectId"])
        calls = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE,
            Operation.response["runId"].as_string() == run_id)).scalars().all()
        for call in calls:
            domain.expire_section(call)
        try:
            service = self.owned_service(session, user, run["serviceId"])
            session.refresh(service)
            service_current = not service.deleted and service.revision == run["serviceRevision"] and "report" in service.capabilities
        except ApiError:
            service_current = False
        result = {**run, "serviceCurrent": service_current, "authorizationExpired": domain.authorization_expired(run),
                  "reconciliationOnly": True, "sections": sorted([domain.section_metadata(call.response) for call in calls],
                      key=lambda row: (row["createdAt"], row["nodeId"], row["purpose"], row["attempt"]))}
        session.commit()
        return result

    def _reserve_limits(self, session, user, data, op):
        rate_scope = keyed(self.settings, "agent-full-report-call-rate/v1", user.id)
        count = session.scalar(select(func.count()).select_from(RateEvent).where(
            RateEvent.scope == rate_scope, RateEvent.created_at > now() - timedelta(hours=1)))
        if count >= domain.CALLS_PER_HOUR:
            raise ApiError(429, "call_rate_limit", f"每账号每小时最多 {domain.CALLS_PER_HOUR} 次报告章节调用。")
        # The account row is locked by the caller, serializing all slot and limit decisions.
        active = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE,
            Operation.key != op.key, Operation.response["status"].as_string() == "running")).scalars().all()
        for previous in active:
            domain.expire_section(previous)
        session.flush()
        if sum(previous.response["status"] == "running" for previous in active) >= domain.MAX_CONCURRENCY:
            raise ApiError(429, "call_active", "报告章节调用已达到并发上限，请先核对已有回执。")
        unknown = select(Operation.key).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE,
            Operation.key != op.key, Operation.response["status"].as_string() == "outcome_unknown",
            Operation.response["inputFingerprint"].as_string() == domain.input_fingerprint(data)).exists()
        if session.scalar(select(unknown)):
            raise ApiError(409, "outcome_unknown", "相同输入的章节已有一次结果待核对，不能自动再次调用。")
        slots = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE,
            Operation.key != op.key, Operation.response["runId"].as_string() == data["runId"],
            Operation.response["nodeId"].as_string() == data["nodeId"],
            Operation.response["purpose"].as_string() == data["purpose"])).scalars().all()
        if any(previous.response["attempt"] == data["attempt"] for previous in slots):
            raise ApiError(409, "slot_already_reserved", "本轮章节尝试已经预约，请读取原回执。")
        if data["attempt"] == 2 and not any(previous.response["attempt"] == 1 and previous.response["status"] == "ready" for previous in slots):
            raise ApiError(409, "attempt_order", "只有已返回正文的章节才可以进行第二次内容修订。")
        return rate_scope

    async def create_section(self, *, user, session, check_session, raw_data):
        data = domain.request_input(raw_data)
        self.lock_user(session, user)
        run = self._run(session, user, data)
        self._project(session, user, data["projectId"], edit=True)
        service = self._service(session, user, data)
        check_session(session, lock=True)
        op, repeated = self.operation(session, user, domain.SCOPE, data)
        if repeated:
            domain.expire_section(op)
            result = deepcopy(op.response)
            session.commit()
            return result
        rate_scope = self._reserve_limits(session, user, data, op)
        config, key = config_view(service), decrypt(self.settings, service)
        config["maxOutputTokens"] = min(config["maxOutputTokens"], domain.MAX_OUTPUT_TOKENS)
        prompt = domain.section_prompt(data)
        if domain.contains_secret(data["prompt"], key) or domain.contains_secret(prompt, key):
            raise ApiError(422, "sensitive_input", "资料包含模型服务密钥，请移除后再试。")
        session.add(RateEvent(scope=rate_scope))
        op.response = domain.section_receipt(data, run)
        # No database transaction remains open during the potentially billable I/O.
        session.commit()

        content, failure, usage, cancelled = None, None, None, False
        try:
            async with asyncio.timeout(domain.CALL_TIMEOUT_SECONDS):
                raw = await self.generator.section_draft(config, key, prompt)
                usage = domain.safe_usage(getattr(raw, "usage", None))
                content = domain.safe_content(raw, key)
        except ProviderFailure as error:
            failure = error
        except asyncio.CancelledError:
            failure, cancelled = ProviderFailure("provider_timeout", unknown=True), True
        except TimeoutError:
            failure = ProviderFailure("provider_timeout", unknown=True)
        except Exception:
            failure = ProviderFailure("provider_failure", unknown=True)
        finally:
            key = ""

        # The reservation commit consumed SET LOCAL. Restoring this request's actor
        # permits only recording its receipt, even if its session has since expired.
        session.execute(sql_text("SELECT set_config('evix.user_id', :id, true)"), {"id": user.id})
        self.lock_user(session, user)
        current = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == domain.SCOPE,
            Operation.key == op.key).with_for_update().execution_options(populate_existing=True)).scalar_one()
        access_error = None
        try:
            self._run(session, user, data)
            self._project(session, user, data["projectId"], edit=True)
            self._service(session, user, data)
            check_session(session, lock=True)
        except ApiError as error:
            access_error = error
        domain.expire_section(current)
        if current.response["status"] == "running":
            # Losing permission suppresses access, but cannot establish whether an
            # interrupted provider call incurred work. Preserve its replay barrier.
            status = "outcome_unknown" if failure and failure.unknown else "failed" if access_error or failure else "ready"
            current.response = {**current.response, "status": status, "content": content if status == "ready" else None,
                "usage": usage, "errorCode": access_error.code if access_error else failure.code if failure else None,
                "finishedAt": domain.iso(now())}
        elif current.response["status"] == "outcome_unknown" and usage is not None:
            current.response = {**current.response, "usage": usage}
        result = deepcopy(current.response)
        session.commit()
        if cancelled:
            raise asyncio.CancelledError()
        if access_error:
            raise access_error
        return result
