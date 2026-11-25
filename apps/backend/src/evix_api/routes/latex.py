from fastapi import Depends, Request, Response
from evix_api.requests import body
from evix_api.security import safe_content_disposition
from application.services.latex import LatexService

# The compile request as the browser sends it (lib/latex-images.ts latexCompilePayload): the report's text and format,
# its optional page frame or registered figures, its cover and frame images, and the rendered chart images.
COMPILE_REQUIRED = ('title', 'subtitle', 'body', 'options')
COMPILE_OPTIONAL = ('frame', 'figures', 'visualStyle', 'coverImage', 'frameImage', 'images')
COMPILE_LIMIT = 15_000_000


def register_latex(app, *, settings, auth, db, owned_project):
    service = LatexService(settings=settings, owned_project=owned_project)
    app.state.latex_compiler = service.compiler

    @app.post('/api/projects/{project_id}/report/latex/compile')
    async def compile_report(project_id: str, request: Request, response: Response, user=Depends(auth), session=Depends(db)):
        owned_project(session, user, project_id)
        data = await body(request, COMPILE_REQUIRED, COMPILE_OPTIONAL, limit=COMPILE_LIMIT)
        result = await service.compile_report(project_id=project_id, user=user, session=session, check_session=lambda session, **kwargs: auth(request, session, **kwargs), data=data)
        ext = '.pdf' if result.get('status') == 'compiled' and result.get('pdfBase64') else '.tex'
        raw_title = str(data.get('title') or '学术研究报告').strip() or '学术研究报告'
        response.headers['Content-Disposition'] = safe_content_disposition(
            f'{raw_title}{ext}',
            fallback_stem='report-export',
        )
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return result
