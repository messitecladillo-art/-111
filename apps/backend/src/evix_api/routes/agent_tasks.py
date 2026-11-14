"""Authenticated public API for durable workflow task checkpoints."""
from fastapi import Depends, Request
from evix_api.requests import body
from application.services.agent_tasks import AgentTaskService
from shared.errors import ApiError

def register_routes(app, *, db, auth, owned_project, session_user, owned_service=None, model_runtime=None):
    service = AgentTaskService(owned_project=owned_project, workflow_engine=app.state.workflow_engine,
                               owned_service=owned_service, model_runtime=model_runtime, settings=app.state.settings)

    @app.post('/api/projects/{project_id}/agent-tasks', status_code=201)
    async def create_task(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('taskType', 'requirements'), ('context', 'inputArtifactRefs', 'constraints', 'modelPlan', 'idempotencyKey'), limit=100000)
        return await service.create_task(project_id=project_id, user=user, session=session, data=data)

    @app.get('/api/projects/{project_id}/agent-task-creations/{key}')
    def creation_receipt(project_id: str, key: str, user=Depends(auth), session=Depends(db)):
        return service.creation_receipt(project_id=project_id, key=key, user=user, session=session)

    @app.get('/api/projects/{project_id}/agent-tasks')
    def list_tasks(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.list_tasks(project_id=project_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/agent-tasks/{task_id}')
    def get_task(project_id: str, task_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_task(project_id=project_id, task_id=task_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/advance')
    async def advance_task(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision',), ('modelConsent', 'modelGrantId'))
        return await service.advance_task(project_id=project_id, task_id=task_id, user=user, session=session,
            data=data, check_session=lambda current: session_user(request, current, lock=True))

    @app.get('/api/projects/{project_id}/agent-tasks/{task_id}/model-phase-preview')
    def phase_preview(project_id: str, task_id: str, user=Depends(auth), session=Depends(db)):
        return service.phase_preview(project_id=project_id, task_id=task_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/model-grants', status_code=201)
    async def create_grant(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'consent', 'phaseHash', 'maxCalls', 'idempotencyKey'))
        if service.grants is None:
            raise ApiError(409, 'model_runtime_unavailable', '此部署尚未配置模型步骤执行器。')
        return service.grants.create(project_id=project_id, task_id=task_id, user=user, session=session,
            data=data, check_session=lambda current: session_user(request, current, lock=True))

    @app.get('/api/projects/{project_id}/agent-tasks/{task_id}/model-grants')
    def grants(project_id: str, task_id: str, user=Depends(auth), session=Depends(db)):
        if service.grants is None:
            raise ApiError(409, 'model_runtime_unavailable', '此部署尚未配置模型步骤执行器。')
        return service.grants.list(project_id=project_id, task_id=task_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/model-grants/{grant_id}/revoke')
    async def revoke_grant(project_id: str, task_id: str, grant_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        await body(request, (), limit=1000)
        if service.grants is None:
            raise ApiError(409, 'model_runtime_unavailable', '此部署尚未配置模型步骤执行器。')
        return service.grants.revoke(project_id=project_id, task_id=task_id, grant_id=grant_id,
            user=user, session=session, check_session=lambda current: session_user(request, current, lock=True))

    @app.get('/api/projects/{project_id}/agent-tasks/{task_id}/model-preview')
    def model_preview(project_id: str, task_id: str, user=Depends(auth), session=Depends(db)):
        return service.model_preview(project_id=project_id, task_id=task_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/agent-tasks/{task_id}/model-calls')
    def model_calls(project_id: str, task_id: str, user=Depends(auth), session=Depends(db)):
        return service.model_calls(project_id=project_id, task_id=task_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/agent-tasks/{task_id}/executions')
    def executions(project_id: str, task_id: str, user=Depends(auth), session=Depends(db)):
        return service.executions(project_id=project_id, task_id=task_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/cancel')
    async def cancel_task(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision',))
        return service.cancel_task(project_id=project_id, task_id=task_id, user=user, session=session, data=data)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/approval')
    async def approve_task(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'approved'), ('feedback',))
        return await service.approve_task(project_id=project_id, task_id=task_id, user=user, session=session, data=data)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/input')
    async def provide_task_input(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'artifactRefs'), limit=20000)
        return await service.provide_task_input(project_id=project_id, task_id=task_id, user=user, session=session, data=data)
