from datetime import timezone
from sqlalchemy import select
from shared.errors import ApiError
from shared.contracts import integer, text, uuid_string
from infrastructure.database.models import AgentTask, AgentTaskExecution, Team, now
from multi_agent.workflow.orchestrator import WorkflowError, WorkflowState, create_workflow
from application.services.agent_task_execution import DurableTaskExecution, execution_view, latest_execution, visible_task
from application.agent_model_bindings import freeze_model_bindings, validate_frozen_model_bindings, validate_role_bindings

def _view(row: AgentTask) -> dict:
    validate_frozen_model_bindings(row.state.get('model_bindings'), owner_id=row.created_by, task_type=row.task_type)
    return {'id': row.id, 'projectId': row.project_id, 'taskType': row.task_type, 'status': row.status, 'revision': row.revision, 'state': row.state, 'createdAt': row.created_at.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'), 'updatedAt': row.updated_at.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')}

def _save(row: AgentTask, state: WorkflowState) -> None:
    row.state = state.to_dict()
    row.status = state.status.value
    row.revision += 1
    row.updated_at = now()

class AgentTaskService:

    def __init__(self, *, owned_project, workflow_engine, owned_service=None):
        self.owned_project = owned_project
        self.workflow_engine = workflow_engine
        self.owned_service = owned_service
        self.execution = DurableTaskExecution(load=self.load, save=_save, view=_view, engine=workflow_engine,
                                             before_dispatch=self._validate_dispatch_models)

    def _service_resolver(self, session, user, *, lock=False):
        def resolve(service_id):
            if self.owned_service is None:
                raise ApiError(409, 'model_service_unavailable', '模型服务尚未接入此任务。')
            service = self.owned_service(session, user, service_id, lock=lock)
            # A Session can retain a previously loaded object. Validate the
            # current row while its lock is held, not an identity-map snapshot.
            if lock:
                session.refresh(service)
            return service
        return resolve

    def _validate_dispatch_models(self, session, user, row, role):
        snapshot = row.state.get('model_bindings')
        if snapshot is None:
            return
        validate_frozen_model_bindings(snapshot, owner_id=row.created_by, task_type=row.task_type)
        validate_role_bindings(snapshot, owner_id=user.id, role=role,
                               resolve_service=self._service_resolver(session, user, lock=True))

    def load(self, *, session, user, project_id, task_id, lock=False):
        uuid_string(task_id)
        if lock:
            # Membership changes lock Team. Use the same fence before checking
            # authorization and before publishing a result after an external call.
            project, _ = self.owned_project(session, user, project_id)
            session.execute(select(Team).where(Team.id == project.team_id).with_for_update()).scalar_one()
        self.owned_project(session, user, project_id, edit=lock, lock=lock)
        query = select(AgentTask).where(AgentTask.id == task_id, AgentTask.project_id == project_id)
        if lock:
            query = query.with_for_update()
        row = session.execute(query.execution_options(populate_existing=True)).scalar_one_or_none()
        if row is None:
            raise ApiError(404, 'not_found', '任务不存在。')
        validate_frozen_model_bindings(row.state.get('model_bindings'), owner_id=row.created_by, task_type=row.task_type)
        return row

    async def create_task(self, *, project_id: str, user, session, data):
        self.owned_project(session, user, project_id, edit=True, lock=True)
        if not isinstance(data['requirements'], dict):
            raise ApiError()
        context = data.get('context', {})
        constraints = data.get('constraints', {})
        refs = data.get('inputArtifactRefs', [])
        if not isinstance(context, dict) or not isinstance(constraints, dict) or (not isinstance(refs, list)) or any((not isinstance(item, str) for item in refs)):
            raise ApiError()
        try:
            state = create_workflow(project_id=project_id, task_type=text(data['taskType'], 32, 1), requirements=data['requirements'], context=context, input_artifact_refs=refs, constraints=constraints)
        except WorkflowError as exc:
            raise ApiError(422, 'invalid_task', str(exc)) from None
        if 'modelPlan' in data:
            if data['modelPlan'] is None:
                raise ApiError(422, 'invalid_model_plan', '请提供完整的模型分工配置。')
            state.model_bindings = freeze_model_bindings(data['modelPlan'], owner_id=user.id,
                task_type=state.task_type, resolve_service=self._service_resolver(session, user))
        row = AgentTask(id=state.task_id, project_id=project_id, created_by=user.id, task_type=state.task_type, status=state.status.value, state=state.to_dict(), revision=0)
        session.add(row)
        session.commit()
        return _view(row)

    def list_tasks(self, *, project_id: str, user, session):
        self.owned_project(session, user, project_id)
        rows = session.execute(select(AgentTask).where(AgentTask.project_id == project_id).order_by(AgentTask.updated_at.desc()).limit(50)).scalars().all()
        result = {'tasks': [visible_task(_view, row, latest_execution(session, row.id)) for row in rows]}
        session.commit()
        return result

    def get_task(self, *, project_id: str, task_id: str, user, session):
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id)
        result = visible_task(_view, row, latest_execution(session, task_id))
        session.commit()
        return result

    async def advance_task(self, *, project_id: str, task_id: str, user, session, data, check_session):
        return await self.execution.advance(project_id=project_id, task_id=task_id, user=user,
            session=session, data=data, check_session=check_session)

    def cancel_task(self, *, project_id: str, task_id: str, user, session, data):
        return self.execution.cancel(project_id=project_id, task_id=task_id, user=user, session=session, data=data)

    def executions(self, *, project_id: str, task_id: str, user, session):
        self.load(session=session, user=user, project_id=project_id, task_id=task_id)
        rows = session.execute(select(AgentTaskExecution).where(AgentTaskExecution.task_id == task_id)
            .order_by(AgentTaskExecution.base_revision.desc()).limit(100)).scalars().all()
        result = {'executions': [execution_view(row) for row in rows]}
        session.commit()
        return result

    async def approve_task(self, *, project_id: str, task_id: str, user, session, data):
        if type(data['approved']) is not bool:
            raise ApiError()
        feedback = data.get('feedback', '')
        if not isinstance(feedback, str):
            raise ApiError()
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id, lock=True)
        if integer(data['expectedRevision'], 0) != row.revision:
            raise ApiError(409, 'revision_conflict', '任务状态已变化，请先刷新。')
        state = WorkflowState.from_dict(row.state)
        engine = self.workflow_engine
        try:
            engine.approve(state, approved=data['approved'], feedback=feedback)
        except WorkflowError as exc:
            raise ApiError(409, 'invalid_transition', str(exc)) from None
        _save(row, state)
        session.commit()
        return _view(row)

    async def provide_task_input(self, *, project_id: str, task_id: str, user, session, data):
        if not isinstance(data['artifactRefs'], list) or any((not isinstance(ref, str) for ref in data['artifactRefs'])):
            raise ApiError()
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id, lock=True)
        if integer(data['expectedRevision'], 0) != row.revision:
            raise ApiError(409, 'revision_conflict', '任务状态已变化，请先刷新。')
        state = WorkflowState.from_dict(row.state)
        engine = self.workflow_engine
        try:
            engine.provide_input(state, data['artifactRefs'])
        except WorkflowError as exc:
            raise ApiError(409, 'invalid_transition', str(exc)) from None
        _save(row, state)
        session.commit()
        return _view(row)
