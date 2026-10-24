"""Authenticated public API for durable workflow task checkpoints."""
from fastapi import Depends, Request
from evix_api.requests import body
from application.services.agent_tasks import AgentTaskService

def register_routes(app, *, db, auth, owned_project):
    service = AgentTaskService(owned_project=owned_project, workflow_engine=app.state.workflow_engine)

    @app.post('/api/projects/{project_id}/agent-tasks', status_code=201)
    async def create_task(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('taskType', 'requirements'), ('context', 'inputArtifactRefs', 'constraints'), limit=100000)
        return await service.create_task(project_id=project_id, user=user, session=session, data=data)

    @app.get('/api/projects/{project_id}/agent-tasks')
    def list_tasks(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.list_tasks(project_id=project_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/agent-tasks/{task_id}')
    def get_task(project_id: str, task_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_task(project_id=project_id, task_id=task_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/advance')
    async def advance_task(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision',))
        return await service.advance_task(project_id=project_id, task_id=task_id, user=user, session=session, data=data)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/approval')
    async def approve_task(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'approved'), ('feedback',))
        return await service.approve_task(project_id=project_id, task_id=task_id, user=user, session=session, data=data)

    @app.post('/api/projects/{project_id}/agent-tasks/{task_id}/input')
    async def provide_task_input(project_id: str, task_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'artifactRefs'), limit=20000)
        return await service.provide_task_input(project_id=project_id, task_id=task_id, user=user, session=session, data=data)
