from fastapi import Depends, Request
from evix_api.requests import body
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
    async def compile_report(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        owned_project(session, user, project_id)
        data = await body(request, COMPILE_REQUIRED, COMPILE_OPTIONAL, limit=COMPILE_LIMIT)
        return await service.compile_report(project_id=project_id, user=user, session=session, check_session=lambda session, **kwargs: auth(request, session, **kwargs), data=data)
