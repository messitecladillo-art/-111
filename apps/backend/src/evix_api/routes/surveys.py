from fastapi import Depends, Request
from evix_api.requests import body
from multi_agent.agents.survey_agent.services import surveys as domain
from application.services.surveys import SurveyService

def install_routes(app, *, settings, db, auth, origin, owned_project, operation):
    service = SurveyService(settings=settings, owned_project=owned_project, operation=operation)

    @app.get('/api/projects/{project_id}/surveys')
    def list_releases(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.list_releases(project_id=project_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/surveys', status_code=201)
    async def publish(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedQuestionnaireRevision', 'idempotencyKey'), limit=1024)
        return await service.publish(project_id=project_id, user=user, session=session, data=data)

    @app.post('/api/projects/{project_id}/surveys/{release_id}/close')
    async def close(project_id: str, release_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'idempotencyKey'), limit=1024)
        return await service.close(project_id=project_id, release_id=release_id, user=user, session=session, data=data)

    @app.get('/api/projects/{project_id}/surveys/{release_id}/dataset')
    def export_dataset(project_id: str, release_id: str, user=Depends(auth), session=Depends(db)):
        return service.export_dataset(project_id=project_id, release_id=release_id, user=user, session=session)

    @app.get('/api/surveys/{token}')
    def get_public(token: str, session=Depends(db)):
        return service.get_public(token=token, session=session)

    @app.post('/api/surveys/{token}/responses', status_code=201)
    async def submit(token: str, request: Request, session=Depends(db)):
        origin(request)
        data = await body(request, ('idempotencyKey', 'answers'), limit=domain.MAX_REQUEST_BYTES)
        return await service.submit(token=token, session=session, data=data)
