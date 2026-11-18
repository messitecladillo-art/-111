"""Bounded producer/reviewer consent; budgets share the call reservation transaction."""
from datetime import timedelta, timezone

from sqlalchemy import select

from application.agent_model_bindings import ROLE_STEPS, validate_role_bindings
from application.idempotency import reserve_operation
from application.services.agent_task_execution import latest_execution, expired
from application.workflow_model_adapter import public_materials, instruction_hashes
from infrastructure.database.models import AgentTaskExecution, Operation, User, now
from infrastructure.security import config_view
from multi_agent.agents.contracts import AgentRole
from multi_agent.workflow.orchestrator import WorkflowEngine, WorkflowState
from shared.contracts import fingerprint, integer, uuid_string
from shared.errors import ApiError

SCOPE = 'workflow-model-grant/v1'
CALL_SCOPE = 'workflow-model-call/v1'
GRANT_SECONDS = 1200
PUBLIC = ('schemaVersion', 'id', 'ownerId', 'taskId', 'projectId', 'baseRevision', 'position', 'roles',
          'phaseHash', 'maxCalls', 'usedCalls', 'maxOutputTokens', 'steps', 'createdAt', 'expiresAt')
DATA_FIELDS = ('dataTool', 'datasets', 'dataDisclosure')


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def basis(state):
    return fingerprint({'requirements': state.requirements, 'context': state.context,
        'inputArtifactRefs': state.input_artifact_refs, 'constraints': state.constraints, 'modelBindings': state.model_bindings})


def effective_status(record, row, parent=None):
    if record.get('revokedAt'):
        return 'stopped', 'grant_revoked'
    if record['expiresAt'] <= iso(now()):
        return 'expired', 'grant_expired'
    if row.status == 'running' and (parent is None or expired(parent) or parent.status != 'running'):
        return 'stopped', 'execution_requires_reconciliation'
    state = WorkflowState.from_dict(row.state)
    offset = state.revision - record['position']
    if (basis(state) != record['basisHash'] or state.status.value not in ('ready', 'running')
            or offset not in range(len(record['roles']))
            or row.revision != record['baseRevision'] + 2 * offset + (1 if row.status == 'running' else 0)):
        return 'stopped', 'task_changed_or_paused'
    if record['usedCalls'] >= record['maxCalls']:
        return 'exhausted', 'call_budget_consumed'
    return 'active', None


def view(record, row, parent=None):
    status, reason = effective_status(record, row, parent)
    return {**{key: record[key] for key in PUBLIC}, **{key: record[key] for key in DATA_FIELDS if key in record},
            'status': status, 'stopReason': reason}


class WorkflowGrants:
    def __init__(self, *, settings, models, load, owned_service):
        self.settings, self.models, self.load, self.owned_service = settings, models, load, owned_service

    def preview(self, *, row, user, session):
        first = self.models.preview(row=row, user=user, session=session)
        state = WorkflowState.from_dict(row.state)
        role = AgentRole(first['role'])
        # Current pipelines place Reviewer immediately after these producers.
        # Derive the next role through the same engine instead of row.revision.
        following = WorkflowState.from_dict(row.state)
        following.revision += 1
        following.status = type(following.status).READY
        next_role = WorkflowEngine({}).next_role(following)
        roles = [role] + ([next_role] if next_role is AgentRole.REVIEWER and role is not AgentRole.REVIEWER else [])
        steps, hashes = {}, {}
        for selected_role in roles:
            selected = validate_role_bindings(state.model_bindings, owner_id=user.id, role=selected_role,
                resolve_service=lambda sid: self.owned_service(session, user, sid))
            for step, binding in selected.items():
                steps[step] = config_view(self.owned_service(session, user, binding['serviceId']))
            hashes.update(instruction_hashes(selected_role))
        payload = {'schemaVersion': 1, 'taskId': row.id, 'projectId': row.project_id,
            'baseRevision': row.revision, 'position': state.revision, 'roles': [r.value for r in roles],
            'materials': public_materials(state), 'steps': steps, 'instructionHashes': hashes,
            'maxCalls': len(steps), 'maxOutputTokens': sum(c['maxOutputTokens'] for c in steps.values()),
            'available': first['available'], 'missingTools': first['missingTools'],
            'grantSeconds': GRANT_SECONDS, 'inputHash': fingerprint(row.state)}
        payload.update({key: first[key] for key in DATA_FIELDS if key in first})
        return {**payload, 'phaseHash': fingerprint(payload)}

    def create(self, *, project_id, task_id, user, session, data, check_session):
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id, lock=True)
        check_session(session)
        session.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()
        operation, repeated = reserve_operation(self.settings, session, user, SCOPE,
            {**data, 'projectId': project_id, 'taskId': task_id})
        if repeated:
            result = view(operation.response, row, latest_execution(session, row.id) if row.status == 'running' else None)
            session.commit()
            return result
        preview = self.preview(row=row, user=user, session=session)
        if (integer(data['expectedRevision'], 0) != row.revision or data['consent'] is not True
                or data['phaseHash'] != preview['phaseHash'] or type(data['maxCalls']) is not int
                or data['maxCalls'] != preview['maxCalls']):
            raise ApiError(409, 'model_phase_changed', '研究材料或模型分工已变化，请重新核对本轮授权。')
        if not preview['available']:
            raise ApiError(409, 'workflow_tools_unavailable', '数据读取和统计执行工具尚未接入此流程。')
        previous = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == SCOPE,
            Operation.key != operation.key, Operation.response['taskId'].as_string() == task_id)).scalars().all()
        parent = latest_execution(session, row.id) if row.status == 'running' else None
        if any(effective_status(item.response, row, parent)[0] == 'active' for item in previous):
            raise ApiError(409, 'model_grant_active', '本轮已有授权，请先读取原授权回执。')
        state = WorkflowState.from_dict(row.state)
        record = {**{key: preview[key] for key in ('taskId', 'projectId', 'baseRevision', 'position', 'roles',
            'phaseHash', 'maxCalls', 'maxOutputTokens', 'steps', 'instructionHashes')},
            'schemaVersion': 1, 'id': operation.key, 'ownerId': user.id, 'usedCalls': 0,
            'createdAt': iso(now()), 'expiresAt': iso(now() + timedelta(seconds=GRANT_SECONDS)),
            'basisHash': basis(state), 'producerResultHash': None}
        record.update({key: preview[key] for key in DATA_FIELDS if key in preview})
        operation.response = record
        result = view(record, row)
        session.commit()
        return result

    def load_record(self, session, user, row, grant_id, *, lock=False, allow_exhausted=False):
        uuid_string(grant_id)
        query = select(Operation).where(Operation.user_id == user.id, Operation.scope == SCOPE, Operation.key == grant_id)
        if lock:
            query = query.with_for_update()
        op = session.execute(query.execution_options(populate_existing=True)).scalar_one_or_none()
        if op is None or not op.response or op.response['taskId'] != row.id or op.response['projectId'] != row.project_id:
            raise ApiError(409, 'model_grant_unavailable', '未找到当前任务的模型授权。')
        record = op.response
        status, _ = effective_status(record, row, latest_execution(session, row.id) if row.status == 'running' else None)
        if status != 'active' and not (allow_exhausted and status == 'exhausted'):
            raise ApiError(409, 'model_grant_stopped', '本轮授权已停止，请核对实际回执。')
        return op

    def prepare_role(self, *, row, user, session, grant_id):
        op = self.load_record(session, user, row, grant_id, lock=True)
        record = op.response
        single = self.models.preview(row=row, user=user, session=session)
        if single['role'] == 'data' and any(single.get(key) != record.get(key) for key in DATA_FIELDS):
            raise ApiError(409, 'model_dataset_changed', '答卷快照已变化，请重新核对数据后授权。')
        for step, config in single['steps'].items():
            if config != record['steps'].get(step) or single['instructionHashes'][step] != record['instructionHashes'].get(step):
                raise ApiError(409, 'model_phase_changed', '模型或提示词版本已变化，请重新核对。')
        if row.state['revision'] > record['position']:
            producer = session.execute(select(AgentTaskExecution).where(AgentTaskExecution.task_id == row.id,
                AgentTaskExecution.base_revision == record['baseRevision']).with_for_update()).scalar_one_or_none()
            if producer is None or producer.status != 'completed' or producer.result_hash != fingerprint(row.state):
                raise ApiError(409, 'model_producer_unverified', '前一角色的结果尚未核对。')
            calls = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == CALL_SCOPE,
                Operation.response['executionId'].as_string() == producer.id)).scalars().all()
            expected = {f"{record['roles'][0]}.{step}" for step in ROLE_STEPS[record['roles'][0]]}
            if ({call.response['step'] for call in calls} != expected or any(call.response.get('grantId') != grant_id
                    or call.response['status'] != 'completed' for call in calls)):
                raise ApiError(409, 'model_producer_unverified', '前一角色的调用回执尚未核对。')
            op.response = {**record, 'producerResultHash': producer.result_hash}
        return single

    def validate_invocation(self, *, session, user, row, grant_id, step, reserve=False):
        op = self.load_record(session, user, row, grant_id, lock=reserve, allow_exhausted=not reserve)
        record = op.response
        role = WorkflowEngine({}).next_role(WorkflowState.from_dict({**row.state, 'status': 'ready'}))
        if role is None or not step.startswith(role.value + '.') or step not in record['steps']:
            raise ApiError(409, 'model_grant_scope', '当前步骤不在已授权范围内。')
        if reserve:
            op.response = {**record, 'usedCalls': record['usedCalls'] + 1}

    def list(self, *, project_id, task_id, user, session):
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id)
        if row.created_by != user.id:
            raise ApiError(403, 'model_bindings_owner_mismatch', '个人模型授权仅对使用者开放。')
        rows = session.execute(select(Operation).where(Operation.user_id == user.id, Operation.scope == SCOPE,
            Operation.response['taskId'].as_string() == task_id).order_by(Operation.response['createdAt'].as_string().desc()).limit(30)).scalars().all()
        parent = latest_execution(session, row.id) if row.status == 'running' else None
        result = {'grants': [view(item.response, row, parent) for item in rows]}
        session.commit()
        return result

    def revoke(self, *, project_id, task_id, grant_id, user, session, check_session):
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id, lock=True)
        check_session(session)
        operation = session.execute(select(Operation).where(Operation.user_id == user.id,
            Operation.scope == SCOPE, Operation.key == uuid_string(grant_id)).with_for_update()
            .execution_options(populate_existing=True)).scalar_one_or_none()
        if operation is None or operation.response.get('taskId') != task_id or operation.response.get('projectId') != project_id:
            raise ApiError(404, 'model_grant_unavailable', '未找到当前任务的模型授权。')
        if not operation.response.get('revokedAt'):
            operation.response = {**operation.response, 'revokedAt': iso(now())}
        result = view(operation.response, row)
        session.commit()
        return result
