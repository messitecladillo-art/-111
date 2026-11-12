"""Consent-bound model steps. Operation rows are private per-call receipts.

Every call owns a fresh Session and commits its reservation before network I/O.
No request Session, credential, prompt, or response body enters workflow state.
"""
import asyncio
from copy import deepcopy
from datetime import timedelta, timezone
from threading import Event
from types import SimpleNamespace
from uuid import UUID, uuid5

from sqlalchemy import func, select, text as sql_text
from sqlalchemy.orm import Session as DBSession

from application.agent_model_bindings import ROLE_STEPS, validate_role_bindings
from application.services.agent_task_execution import ExecutionPlan
from application.workflow_model_adapter import model_handler, public_materials, instruction_hashes
from infrastructure.database.models import AgentTaskExecution, Operation, RateEvent, User, now
from infrastructure.security import config_view, decrypt, keyed
from multi_agent.agents.contracts import AgentRole
from multi_agent.workflow.orchestrator import WorkflowEngine, WorkflowState
from shared.contracts import canonical, fingerprint, strict_json
from shared.errors import ApiError, ProviderFailure

SCOPE = 'workflow-model-call/v1'
MODEL_ROLE_TIMEOUT = 110
MODEL_ROLE_LEASE = 140
CALLS_PER_HOUR = 60


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


class WorkflowModels:
    def __init__(self, *, settings, provider, load, owned_service):
        self.settings, self.provider = settings, provider
        self.load, self.owned_service = load, owned_service

    def preview(self, *, row, user, session):
        state = WorkflowState.from_dict(row.state)
        role = WorkflowEngine({}).next_role(state)
        if role is None or state.model_bindings is None:
            raise ApiError(409, 'model_preview_unavailable', '当前没有可授权的模型步骤。')
        if not callable(getattr(self.provider, 'workflow_step', None)):
            raise ApiError(409, 'model_runtime_unavailable', '此部署尚未配置模型步骤执行器。')
        try:
            materials = public_materials(state)
        except ValueError:
            raise ApiError(422, 'unsupported_model_materials', '模型输入仅支持研究目标、明确的文献摘录和已确认的角色成果。') from None
        if len(canonical(materials).encode('utf-8')) > 100000:
            raise ApiError(422, 'model_materials_too_large', '本次模型材料超出限额。')
        selected = validate_role_bindings(state.model_bindings, owner_id=user.id, role=role,
            resolve_service=lambda sid: self.owned_service(session, user, sid))
        services = {step: config_view(self.owned_service(session, user, binding['serviceId']))
                    for step, binding in selected.items()}
        payload = {'taskId': row.id, 'projectId': row.project_id, 'inputRevision': row.revision,
                   'inputHash': fingerprint(row.state), 'role': role.value, 'materials': materials,
                   'steps': services, 'maxCalls': len(selected),
                   'instructionHashes': instruction_hashes(role),
                   'maxOutputTokens': sum(config['maxOutputTokens'] for config in services.values()),
                   'derivedContent': 'bounded_previous_step_results_and_trusted_tool_results',
                   'available': role is not AgentRole.DATA,
                   'missingTools': ['load_dataset', 'analyze_dataset'] if role is AgentRole.DATA else []}
        return {**payload, 'previewHash': fingerprint(payload)}

    def prepare(self, *, row, user, session, data, check_session, execution_id):
        state = WorkflowState.from_dict(row.state)
        role = WorkflowEngine({}).next_role(state)
        if state.model_bindings is None or role is None:
            return None
        # Preserve the existing data-input gate, without asking to bill a model.
        if role is AgentRole.DATA and not state.input_artifact_refs:
            return ExecutionPlan(WorkflowEngine({}).prepare_step(state))
        preview = self.preview(row=row, user=user, session=session)
        consent = data.get('modelConsent')
        if (type(consent) is not dict or set(consent) != {'accepted', 'previewHash', 'maxCalls'}
                or consent['accepted'] is not True or type(consent['maxCalls']) is not int
                or consent['maxCalls'] != preview['maxCalls'] or consent['previewHash'] != preview['previewHash']):
            raise ApiError(422, 'model_consent_required', '请核对当前材料、模型分工和调用上限后确认。')
        if not preview['available']:
            raise ApiError(409, 'workflow_tools_unavailable', '数据读取和统计执行工具尚未接入此流程。')
        invocation = ModelInvocation(runtime=self, engine=session.get_bind(), actor_id=user.id,
            project_id=row.project_id, task_id=row.id, execution_id=execution_id,
            preview=deepcopy(preview), check_session=check_session)
        sync_handler = model_handler(role, invocation.invoke)

        async def handler(current):
            try:
                return await asyncio.to_thread(sync_handler, current)
            finally:
                # to_thread does not kill its thread on timeout. This outer async
                # finally runs immediately, fencing every subsequent call.
                invocation.stopped.set()

        prepared = WorkflowEngine({role: handler}).prepare_step(state)
        invocation.prepared_hash = fingerprint(prepared.state.to_dict())
        return ExecutionPlan(prepared, MODEL_ROLE_TIMEOUT, MODEL_ROLE_LEASE)


class ModelInvocation:
    def __init__(self, *, runtime, engine, actor_id, project_id, task_id, execution_id, preview, check_session):
        self.runtime, self.engine = runtime, engine
        self.actor_id, self.project_id, self.task_id = actor_id, project_id, task_id
        self.execution_id, self.preview, self.check_session = execution_id, preview, check_session
        self.stopped, self.prepared_hash = Event(), None

    def _identity(self, session):
        session.execute(sql_text("SELECT set_config('evix.user_id', :id, true)"), {'id': self.actor_id})
        return SimpleNamespace(id=self.actor_id)

    def _fence(self, session):
        user = self._identity(session)
        row = self.runtime.load(session=session, user=user, project_id=self.project_id, task_id=self.task_id, lock=True)
        parent = session.execute(select(AgentTaskExecution).where(AgentTaskExecution.id == self.execution_id)
            .with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
        self.check_session(session)
        if (self.stopped.is_set() or parent is None or parent.created_by != self.actor_id
                or parent.task_id != self.task_id or parent.status != 'running' or parent.lease_expires_at <= now()
                or row.status != 'running' or row.revision != parent.claimed_revision
                or parent.base_revision != self.preview['inputRevision'] or parent.input_hash != self.preview['inputHash']
                or fingerprint(row.state) != self.prepared_hash):
            raise ApiError(409, 'workflow_invocation_inactive', '该次执行已结束或需要对账。')
        return user

    def invoke(self, step, messages):
        if step not in self.preview['steps'] or self.stopped.is_set():
            raise ProviderFailure('workflow_invocation_inactive')
        if fingerprint(messages[0]['content']) != self.preview['instructionHashes'][step]:
            raise ProviderFailure('workflow_instructions_changed')
        call_id = str(uuid5(UUID(self.execution_id), step))
        input_hash = fingerprint(messages)
        runtime, config, key = self.runtime, None, ''
        with DBSession(self.engine, expire_on_commit=False) as session:
            user = self._fence(session)
            # Serialize the actor's rate reservation, including parallel tasks.
            session.execute(select(User).where(User.id == self.actor_id).with_for_update()).scalar_one()
            scope = keyed(runtime.settings, 'workflow-model-rate/v1', self.actor_id)
            count = session.scalar(select(func.count()).select_from(RateEvent).where(
                RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1)))
            if count >= CALLS_PER_HOUR:
                raise ProviderFailure('workflow_call_rate_limit')
            if session.get(Operation, (self.actor_id, SCOPE, call_id)) is not None:
                # A reserved call is never resent, including a process death in
                # the gap between commit and opening the connection.
                raise ProviderFailure('workflow_call_requires_reconciliation', unknown=True)
            selection = self.preview['steps'][step]
            service = runtime.owned_service(session, user, selection['id'], lock=True)
            session.refresh(service)
            config = config_view(service)
            if config != selection or ROLE_STEPS[self.preview['role']].count(step.partition('.')[2]) != 1:
                raise ProviderFailure('workflow_model_changed')
            key = decrypt(runtime.settings, service)
            if key in canonical(messages):
                raise ProviderFailure('sensitive_input')
            record = {'schema': SCOPE, 'id': call_id, 'taskId': self.task_id, 'projectId': self.project_id,
                      'executionId': self.execution_id, 'step': step, 'status': 'running',
                      'inputRevision': self.preview['inputRevision'], 'inputHash': input_hash,
                      'consentHash': self.preview['previewHash'], 'serviceId': service.id,
                      'serviceRevision': service.revision, 'providerMode': runtime.settings.provider_mode,
                      'startedAt': iso(now()), 'finishedAt': None, 'resultHash': None, 'usage': None, 'errorCode': None}
            session.add(Operation(user_id=self.actor_id, scope=SCOPE, key=call_id, payload_hash=input_hash, response=record))
            session.add(RateEvent(scope=scope))
            session.commit()
        status, error, result, result_hash, usage = 'completed', None, None, None, None
        try:
            if self.stopped.is_set():
                raise ProviderFailure('workflow_invocation_inactive')
            raw = asyncio.run(runtime.provider.workflow_step(config, key, messages, 131072))
            usage = getattr(raw, 'usage', None)
            if not isinstance(raw, str) or len(raw.encode('utf-8')) > 120000 or key in raw:
                raise ProviderFailure('invalid_response')
            try:
                value = strict_json(raw)
            except ApiError:
                raise ProviderFailure('invalid_response') from None
            if type(value) is not dict:
                raise ProviderFailure('invalid_response')
            if key in canonical(value):
                raise ProviderFailure('invalid_response')
            result, result_hash = raw, fingerprint(value)
        except ProviderFailure as exc:
            status, error = ('outcome_unknown', 'model_call_outcome_unknown') if exc.unknown else ('failed', 'model_call_rejected')
        except (Exception, asyncio.CancelledError):
            status, error = 'outcome_unknown', 'model_call_outcome_unknown'
        finally:
            key = ''
        if (type(usage) is not dict or set(usage) != {'inputTokens', 'outputTokens'}
                or any(type(x) is not int or not 0 <= x <= 10000000 for x in usage.values())):
            usage = None
        with DBSession(self.engine, expire_on_commit=False) as session:
            try:
                self._fence(session)
            except ApiError:
                session.rollback()
                self._identity(session)
                status, error, result = 'discarded', 'model_call_access_changed', None
            receipt = session.execute(select(Operation).where(Operation.user_id == self.actor_id,
                Operation.scope == SCOPE, Operation.key == call_id).with_for_update()).scalar_one()
            if receipt.response['status'] != 'running':
                raise ProviderFailure('workflow_call_requires_reconciliation', unknown=True)
            receipt.response = {**receipt.response, 'status': status, 'errorCode': error, 'usage': usage,
                                'resultHash': result_hash, 'finishedAt': iso(now())}
            session.commit()
        if status != 'completed':
            raise ProviderFailure(error, unknown=status in ('outcome_unknown', 'discarded'))
        return result
