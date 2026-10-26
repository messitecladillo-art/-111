from fastapi import Depends, Request, Response
from evix_api.requests import body
from multi_agent.agents.writing_agent.services import reports as domain
from application.services.reports import ReportService
from application.services.report_ai_usage import ReportAiUsageService

def register_reports(app, *, auth, db, owned_project, operation):
    service = ReportService(owned_project=owned_project, operation=operation)
    usage_service = ReportAiUsageService(owned_project=owned_project)

    @app.get('/api/projects/{project_id}/report/ai-usage')
    def ai_usage(project_id: str, response: Response, user=Depends(auth), session=Depends(db)):
        result = usage_service.ledger(project_id=project_id, user=user, session=session)
        response.headers['cache-control'] = 'no-store'
        response.headers['vary'] = 'Cookie'
        return result

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
