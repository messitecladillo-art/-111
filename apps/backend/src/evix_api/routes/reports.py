import asyncio
from fastapi import Depends, Request, Response
from evix_api.requests import body
from multi_agent.agents.writing_agent.services import reports as domain
from multi_agent.agents.writing_agent.services.cover_assembly import assemble_cover_request
from multi_agent.agents.writing_agent.services.pre_submission_gate import run_preflight_audit
from multi_agent.agents.writing_agent.services.word_cloud_render import render_dense_wordcloud
from application.services.reports import ReportService
from application.services.report_ai_usage import ReportAiUsageService
from shared.errors import ApiError

WORDCLOUD_OPTIONAL = (
    'frequencies', 'words', 'items', 'entries', 'text', 'texts',
    'topic', 'axis', 'shape', 'accent', 'palette', 'maxWords', 'seed',
    'pairedBar', 'paired_bar', 'maskBase64', 'maskDataUrl',
    'id', 'resultId', 'note',
)

COVER_ASSEMBLE_OPTIONAL = (
    'mode', 'coverPipelineMode', 'preset', 'presetId',
    'referencePreset', 'backdropPreset',
    'referenceDataUrl', 'referenceBase64', 'referenceImage',
    'backdropDataUrl', 'backdropBase64', 'backdropImage',
    'vectorTypographySvg', 'competitionName', 'title', 'mainTitle',
    'subtitle', 'teamName', 'typographyStyle', 'style',
    'accent', 'accentHex', 'inkMode', 'anchors', 'referenceAnchors', 'note',
)

PREFLIGHT_AUDIT_OPTIONAL = (
    'title', 'subtitle', 'competitionName', 'sections', 'report',
    'results', 'estimatedPages', 'expectedEdition', 'requireBlindReview',
)

def register_reports(app, *, auth, db, owned_project, operation):
    service = ReportService(owned_project=owned_project, operation=operation)
    usage_service = ReportAiUsageService(owned_project=owned_project)

    @app.post('/api/reports/wordcloud')
    async def create_wordcloud(request: Request, response: Response):
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise ApiError(403, 'origin_forbidden', '请从当前研究工作台页面发起操作。')
        data = await body(request, (), WORDCLOUD_OPTIONAL, limit=4_000_000)
        rendered = await asyncio.to_thread(render_dense_wordcloud, data)
        response.headers['cache-control'] = 'no-store'
        return rendered

    @app.post('/api/reports/cover-assemble')
    async def create_assembled_cover(request: Request, response: Response):
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise ApiError(403, 'origin_forbidden', '请从当前研究工作台页面发起操作。')
        data = await body(request, (), COVER_ASSEMBLE_OPTIONAL, limit=16_000_000)
        assembled = await asyncio.to_thread(assemble_cover_request, data)
        response.headers['cache-control'] = 'no-store'
        return assembled

    @app.post('/api/reports/preflight-audit')
    async def preflight_audit(request: Request, response: Response):
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise ApiError(403, 'origin_forbidden', '请从当前研究工作台页面发起操作。')
        data = await body(request, (), PREFLIGHT_AUDIT_OPTIONAL, limit=2_500_000)
        audited = await asyncio.to_thread(run_preflight_audit, data)
        response.headers['cache-control'] = 'no-store'
        return audited

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
        data = await body(request, ('content', 'expectedRevision', 'idempotencyKey'), limit=domain.MAX_CONTENT_BYTES + domain.MAX_PAGE_ART_BYTES + 100000)
        return await service.save(project_id=project_id, user=user, session=session, data=data)
