from fastapi import Depends, Request
from evix_api.requests import body
from multi_agent.agents.research_agent.services import topic_projects as domain
from application.services.topic_projects import TopicProjectService

def register_topic_projects(app, *, auth, db, owned_project, operation):
    service = TopicProjectService(owned_project=owned_project, operation=operation)

    @app.get('/api/projects/{project_id}/topic')
    def get_topic(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_topic(project_id=project_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/topic/versions')
    def versions(project_id: str, before: int | None=None, limit: int=30, user=Depends(auth), session=Depends(db)):
        return service.versions(project_id=project_id, before=before, limit=limit, user=user, session=session)

    @app.get('/api/projects/{project_id}/topic/versions/{version_id}')
    def version(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        return service.version(project_id=project_id, version_id=version_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/topic/versions', status_code=201)
    async def save(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'idempotencyKey', 'document'), limit=domain.MAX_DOCUMENT_BYTES + 20000)
        return await service.save(project_id=project_id, user=user, session=session, data=data)

    @app.post('/api/projects/{project_id}/topic/decisions', status_code=201)
    async def decide(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'expectedDecisionRevision', 'idempotencyKey', 'versionId', 'contentHash', 'action'), limit=2000)
        return await service.decide(project_id=project_id, user=user, session=session, data=data)
