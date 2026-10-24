from fastapi import Request, Depends
from evix_api.requests import body
from application.services.survey_runs import SurveyRunService

def register_routes(app, *, settings, engine, generator, db, auth, owned_project, owned_service, lock_user, session_user):
    service = SurveyRunService(settings=settings, engine=engine, generator=generator, owned_project=owned_project, owned_service=owned_service, lock_user=lock_user, tasks=app.state.silicon_tasks)

    @app.post('/api/projects/{project_id}/silicon-runs', status_code=202)
    async def start_silicon_run(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id, edit=True)
        data = await body(request, ('design', 'attributes', 'personas', 'scenarios', 'memory', 'shuffleOptions', 'services', 'expectedCalls', 'idempotencyKey', 'consent'), limit=400000)
        return await service.start_silicon_run(project_id=project_id, user=user, session=session, data=data, p=p)

    @app.get('/api/projects/{project_id}/silicon-runs')
    def list_silicon_runs(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.list_silicon_runs(project_id=project_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/silicon-runs/{run_id}')
    def get_silicon_run(project_id: str, run_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_silicon_run(project_id=project_id, run_id=run_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/silicon-runs/{run_id}/cancel')
    def cancel_silicon_run(project_id: str, run_id: str, user=Depends(auth), session=Depends(db)):
        return service.cancel_silicon_run(project_id=project_id, run_id=run_id, user=user, session=session)
