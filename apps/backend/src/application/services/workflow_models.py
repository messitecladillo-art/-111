"""Consent-bound model steps. Operation rows are private per-call receipts.

Every call owns a fresh Session and commits its reservation before network I/O.
No request Session, credential, prompt, or response body enters workflow state.
"""
import asyncio
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta, timezone
import re
from threading import Event, Lock
from types import SimpleNamespace
from uuid import UUID, uuid5

from sqlalchemy import func, select, text as sql_text
from sqlalchemy.orm import Session as DBSession

from application.agent_model_bindings import ROLE_STEPS, validate_role_bindings
from application.services.agent_task_execution import ExecutionPlan
from application.workflow_model_adapter import model_handler, public_materials, instruction_hashes
from application.workflow_data_tools import TOOL_VERSION, DataToolError, SurveyDataTools, snapshot, supported_refs
from infrastructure.database.models import AgentTaskExecution, Operation, RateEvent, User, now
from infrastructure.llm import AgentModelTurn
from infrastructure.security import config_view, decrypt, keyed
from multi_agent.agents.contracts import AgentRole, ToolResult
from multi_agent.tool_registry import isa_tool_specs
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
        self.grants = None

    def preview(self, *, row, user, session):
        state = WorkflowState.from_dict(row.state)
        role = WorkflowEngine({}).next_role(state)
        if role is None or state.model_bindings is None:
            raise ApiError(409, 'model_preview_unavailable', '当前没有可授权的分析步骤。')
        if not callable(getattr(self.provider, 'workflow_step', None)):
            raise ApiError(409, 'model_runtime_unavailable', '当前环境尚未配置研究步骤执行服务。')
        try:
            materials = public_materials(state)
        except ValueError:
            raise ApiError(422, 'unsupported_model_materials', '分析输入仅支持研究目标、明确的文献摘录与已确认的阶段成果。') from None
        if len(canonical(materials).encode('utf-8')) > 100000:
            raise ApiError(422, 'model_materials_too_large', '本次提交的研究材料体积超出上限。')
        selected = validate_role_bindings(state.model_bindings, owner_id=user.id, role=role,
            resolve_service=lambda sid: self.owned_service(session, user, sid))
        services = {step: config_view(self.owned_service(session, user, binding['serviceId']))
                    for step, binding in selected.items()}
        datasets, missing = [], []
        if role is AgentRole.DATA:
            datasets, missing = self._datasets(session, row.project_id, state.input_artifact_refs)
        isa_enabled = state.constraints.get('enableIsaSandbox') is True
        upstream_tests = (((state.agent_outputs or {}).get('data') or {}).get('deliverable') or {}).get('tests') or []
        falsification_enabled = (
            role is AgentRole.REVIEWER and isa_enabled and isinstance(upstream_tests, list) and len(upstream_tests) > 0
        )
        payload = {'taskId': row.id, 'projectId': row.project_id, 'inputRevision': row.revision,
                   'inputHash': fingerprint(row.state), 'role': role.value, 'materials': materials,
                   'steps': services, 'maxCalls': len(selected),
                   'instructionHashes': instruction_hashes(role),
                   'maxOutputTokens': sum(config['maxOutputTokens'] for config in services.values()),
                   'derivedContent': 'bounded_previous_step_results_and_trusted_tool_results',
                   'available': not missing, 'missingTools': missing}
        if role is AgentRole.DATA:
            if isa_enabled:
                payload.update({'dataTool': 'survey-release-isa-sandbox/v1', 'datasets': datasets,
                                'dataDisclosure': 'aggregate_statistics_only_no_rows_no_open_text',
                                'isaEnabled': True, 'isaToolCount': 21, 'maxCalls': len(selected) + 6})
            else:
                payload.update({'dataTool': TOOL_VERSION, 'datasets': datasets,
                                'dataDisclosure': 'aggregate_statistics_only_no_rows_no_open_text'})
        elif falsification_enabled:
            payload.update({'falsificationToolsEnabled': True, 'maxCalls': len(selected) + 2})
        return {**payload, 'previewHash': fingerprint(payload)}

    @staticmethod
    def _datasets(session, project_id, refs):
        # Only backend-owned survey releases have a trusted reader. Other refs
        # (browser files, free-form ids) keep the role unavailable.
        if not supported_refs(refs):
            return [], ['load_dataset', 'analyze_dataset']
        try:
            datasets = [snapshot(session, project_id, ref) for ref in refs]
        except DataToolError:
            return [], ['load_dataset', 'analyze_dataset']
        return datasets, (['collected_responses'] if any(item['rowCount'] == 0 for item in datasets) else [])

    def prepare(self, *, row, user, session, data, check_session, execution_id):
        state = WorkflowState.from_dict(row.state)
        role = WorkflowEngine({}).next_role(state)
        if state.model_bindings is None or role is None:
            return None
        # Preserve the existing data-input gate, without asking to bill a model.
        if role is AgentRole.DATA and not state.input_artifact_refs:
            return ExecutionPlan(WorkflowEngine({}).prepare_step(state))
        grant_id = data.get('modelGrantId')
        if grant_id is not None:
            if 'modelConsent' in data or self.grants is None:
                raise ApiError(422, 'invalid_model_grant', '请使用单一明确的执行授权方式。')
            preview = self.grants.prepare_role(row=row, user=user, session=session, grant_id=grant_id)
        else:
            preview = self.preview(row=row, user=user, session=session)
        consent = data.get('modelConsent')
        if grant_id is None and (type(consent) is not dict or set(consent) != {'accepted', 'previewHash', 'maxCalls'}
                or consent['accepted'] is not True or type(consent['maxCalls']) is not int
                or consent['maxCalls'] != preview['maxCalls'] or consent['previewHash'] != preview['previewHash']):
            raise ApiError(422, 'model_consent_required', '请核对当前研究材料、阶段分工与调用上限后再确认。')
        if not preview['available']:
            raise ApiError(409, 'workflow_tools_unavailable', '当前流程尚未备妥所需的数据读取与统计检验条件。')
        invocation = ModelInvocation(runtime=self, engine=session.get_bind(), actor_id=user.id,
            project_id=row.project_id, task_id=row.id, execution_id=execution_id,
            preview=deepcopy(preview), check_session=check_session, grant_id=grant_id)
        agent_invoke = invocation.invoke_agent_step if callable(getattr(self.provider, 'agent_step', None)) else None
        if role is AgentRole.DATA and preview.get('isaEnabled'):
            data_tools = SurveyDataTools(open_session=invocation.data_session, project_id=row.project_id,
                                         expected=preview['datasets'])
            sandbox_box = {}

            def get_sandbox():
                if 'sb' not in sandbox_box:
                    sb, _ = data_tools.autonomous_tools(artifact_refs=list(state.input_artifact_refs))
                    sandbox_box['sb'] = sb
                return sandbox_box['sb']

            tools = data_tools.tools()
            for spec in isa_tool_specs():
                op_name = spec.name
                tools[op_name] = (lambda name: (lambda **kwargs: getattr(get_sandbox(), name)(**kwargs)))(op_name)
            sync_handler = model_handler(role, invocation.invoke, tools, sandbox_factory=get_sandbox, agent_invoke=agent_invoke)
        elif role is AgentRole.REVIEWER and preview.get('falsificationToolsEnabled'):
            rev_tools = self._build_reviewer_tools(invocation=invocation, project_id=row.project_id, state=state)
            sync_handler = model_handler(role, invocation.invoke, rev_tools, agent_invoke=agent_invoke)
        else:
            tools = (SurveyDataTools(open_session=invocation.data_session, project_id=row.project_id,
                                     expected=preview['datasets']).tools() if role is AgentRole.DATA else None)
            sync_handler = model_handler(role, invocation.invoke, tools)

        async def handler(current):
            try:
                return await asyncio.to_thread(sync_handler, current)
            finally:
                # to_thread does not kill its thread on timeout. This outer async
                # finally runs immediately, fencing every subsequent call.
                invocation.stopped.set()

        prepared = WorkflowEngine({role: handler}).prepare_step(state)
        invocation.prepared_hash = fingerprint(prepared.state.to_dict())
        return ExecutionPlan(prepared, MODEL_ROLE_TIMEOUT, MODEL_ROLE_LEASE,
            invocation.check_publish if grant_id is not None else None)

    @staticmethod
    def _build_reviewer_tools(*, invocation, project_id, state):
        deliv = ((state.agent_outputs or {}).get('data') or {}).get('deliverable') or {}
        upstream_tests = deliv.get('tests') or []
        by_sid = {
            str(item.get('snapshot_id')): item
            for item in upstream_tests
            if isinstance(item, dict) and item.get('snapshot_id')
        }
        schema_findings = deliv.get('schema_findings') or []
        expected = [
            {'ref': f['ref'], 'sha256': f['sha256']}
            for f in schema_findings
            if isinstance(f, dict) and isinstance(f.get('ref'), str) and isinstance(f.get('sha256'), str)
        ]

        def verify_evidence_hashes(snapshot_ids=None):
            targets = list(snapshot_ids or by_sid.keys())
            verified, missing = [], []
            for sid in targets:
                rec = by_sid.get(sid)
                if rec is None:
                    missing.append(sid)
                    continue
                rhash = rec.get('result_hash')
                if not isinstance(rhash, str) or not re.fullmatch(r'[0-9a-f]{64}', rhash) or sid != f'snap_{rhash[:12]}':
                    missing.append(sid)
                else:
                    verified.append(sid)
            ok = bool(verified) and not missing
            return ToolResult(
                classification='actual',
                evidence_refs=verified,
                data={
                    'verifiedSnapshots': verified,
                    'missingOrInvalid': missing,
                    'auditVerified': ok,
                    'diagnostics': ['HASH_AUDIT_PASSED'] if ok else ['HASH_AUDIT_GAP'],
                    'summary': f'已完成 {len(verified)} 项统计结果校验（缺失或异常 {len(missing)} 项）。',
                },
            )

        def challenge_subgroup_robustness(outcome, predictor, moderators):
            if not supported_refs(state.input_artifact_refs) or not expected:
                return ToolResult(classification='proposed', data={'summary': '未提供已登记的数据集引用，本次跳过分群稳健性复核。', 'diagnostics': ['NO_SANDBOX']})
            try:
                sdt = SurveyDataTools(open_session=invocation.data_session, project_id=project_id, expected=expected)
                sb = sdt.create_sandbox(artifact_refs=list(state.input_artifact_refs))
                return sb.scan_subgroup_heterogeneity(outcome=outcome, predictor=predictor, moderators=list(moderators))
            except (DataToolError, ValueError):
                return ToolResult(classification='proposed', data={'summary': '分群稳健性复核因数据条件受限已跳过。', 'diagnostics': ['SUBGROUP_CHALLENGE_SKIPPED']})

        return {
            'verify_evidence_hashes': verify_evidence_hashes,
            'challenge_subgroup_robustness': challenge_subgroup_robustness,
        }


class ModelInvocation:
    def __init__(self, *, runtime, engine, actor_id, project_id, task_id, execution_id, preview, check_session, grant_id=None):
        self.runtime, self.engine = runtime, engine
        self.actor_id, self.project_id, self.task_id = actor_id, project_id, task_id
        self.execution_id, self.preview, self.check_session = execution_id, preview, check_session
        self.stopped, self.prepared_hash = Event(), None
        self.grant_id = grant_id
        self.call_count = 0
        self._call_lock = Lock()

    def check_publish(self, session, user, row):
        self.runtime.grants.load_record(session, user, row, self.grant_id, lock=True, allow_exhausted=True)

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
            raise ApiError(409, 'workflow_invocation_inactive', '本次执行已结束或状态已变更，请刷新核对当前进度。')
        if self.grant_id is not None:
            self.runtime.grants.load_record(session, user, row, self.grant_id, allow_exhausted=True)
        return user

    @contextmanager
    def data_session(self):
        """A trusted tool read under the same fence as a model call, read-only."""
        if self.stopped.is_set():
            raise ProviderFailure('workflow_invocation_inactive')
        with DBSession(self.engine, expire_on_commit=False) as session:
            self._fence(session)
            try:
                yield session
            finally:
                session.rollback()

    def _execute_reserved_call(self, step, messages, *, tools=None, caller):
        base_step = re.sub(r'\.iter\d+$', '', step)
        if base_step not in self.preview['steps'] or self.stopped.is_set():
            raise ProviderFailure('workflow_invocation_inactive')
        if fingerprint(messages[0]['content']) != self.preview['instructionHashes'][base_step]:
            raise ProviderFailure('workflow_instructions_changed')
        call_id = str(uuid5(UUID(self.execution_id), step))
        input_hash = fingerprint(messages if tools is None else {'messages': messages, 'tools': tools})
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
            selection = self.preview['steps'][base_step]
            service = runtime.owned_service(session, user, selection['id'], lock=True)
            session.refresh(service)
            config = config_view(service)
            if config != selection or ROLE_STEPS[self.preview['role']].count(base_step.partition('.')[2]) != 1:
                raise ProviderFailure('workflow_model_changed')
            key = decrypt(runtime.settings, service)
            if key in canonical(messages) or (tools is not None and key in canonical(tools)):
                raise ProviderFailure('sensitive_input')
            with self._call_lock:
                if self.call_count >= self.preview['maxCalls']:
                    raise ProviderFailure('workflow_call_budget_exceeded')
                if self.grant_id is not None:
                    row = runtime.load(session=session, user=user, project_id=self.project_id, task_id=self.task_id, lock=True)
                    runtime.grants.validate_invocation(session=session, user=user, row=row,
                        grant_id=self.grant_id, step=base_step, reserve=True)
                self.call_count += 1
            record = {'schema': SCOPE, 'id': call_id, 'taskId': self.task_id, 'projectId': self.project_id,
                      'executionId': self.execution_id, 'step': step, 'status': 'running',
                      'inputRevision': self.preview['inputRevision'], 'inputHash': input_hash,
                      'consentHash': self.preview['previewHash'], 'serviceId': service.id,
                      'serviceRevision': service.revision, 'providerMode': runtime.settings.provider_mode,
                      'startedAt': iso(now()), 'finishedAt': None, 'resultHash': None, 'usage': None, 'errorCode': None}
            if self.grant_id is not None:
                record['grantId'] = self.grant_id
            session.add(Operation(user_id=self.actor_id, scope=SCOPE, key=call_id, payload_hash=input_hash, response=record))
            session.add(RateEvent(scope=scope))
            session.commit()
        status, error, result, result_hash, usage = 'completed', None, None, None, None
        try:
            if self.stopped.is_set():
                raise ProviderFailure('workflow_invocation_inactive')
            result, result_hash, usage = caller(config, key)
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

    def invoke(self, step, messages):
        def _run(config, key):
            raw = asyncio.run(self.runtime.provider.workflow_step(config, key, messages, 131072))
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
            return raw, fingerprint(value), usage

        return self._execute_reserved_call(step, messages, caller=_run)

    def invoke_agent_step(self, step, messages, *, tools=None, tool_choice='auto'):
        def _run(config, key):
            turn = asyncio.run(self.runtime.provider.agent_step(
                config, key, messages, tools=tools, tool_choice=tool_choice, limit=196608, timeout=45))
            if not isinstance(turn, AgentModelTurn):
                raise ProviderFailure('invalid_response')
            if len(turn.text.encode('utf-8')) > 120000:
                raise ProviderFailure('invalid_response')
            tc_dicts = [{'id': tc.id, 'name': tc.name, 'arguments': tc.arguments} for tc in turn.tool_calls]
            if key in turn.text or key in turn.reasoning or key in canonical(tc_dicts):
                raise ProviderFailure('invalid_response')
            rhash = fingerprint({
                'text': turn.text, 'reasoning': turn.reasoning,
                'toolCalls': tc_dicts, 'stopReason': turn.stop_reason,
            })
            return turn, rhash, turn.usage

        return self._execute_reserved_call(step, messages, tools=tools, caller=_run)
