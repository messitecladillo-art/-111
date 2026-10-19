from fastapi import Depends, Request
from evix_api.requests import body
from multi_agent.agents.writing_agent.services import reports as domain
from application.services.reports import ReportService

def register_reports(app, *, auth, db, owned_project, operation):
    service = ReportService(owned_project=owned_project, operation=operation)

    @app.get('/api/projects/{project_id}/report')
    def get_report(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_report(project_id=project_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/report/versions')
    def versions(project_id: str, beforeRevision: int | None=None, user=Depends(auth), session=Depends(db)):
        return service.versions(project_id=project_id, beforeRevision=beforeRevision, user=user, session=session)

    @app.get('/api/projects/{project_id}/report/versions/{version_id}')
    def version(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        return service.version(project_id=project_id, version_id=version_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/report/versions', status_code=201)
    async def save(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('content', 'expectedRevision', 'idempotencyKey'), limit=domain.MAX_CONTENT_BYTES + 100000)
        return await service.save(project_id=project_id, user=user, session=session, data=data)
