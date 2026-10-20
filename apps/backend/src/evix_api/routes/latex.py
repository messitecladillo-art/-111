from fastapi import Depends, Request
from evix_api.requests import body
from application.services.latex import LatexService

def register_latex(app, *, settings, auth, db, owned_project):
    service = LatexService(settings=settings, owned_project=owned_project)
    app.state.latex_compiler = service.compiler

    @app.post('/api/projects/{project_id}/report/latex/compile')
    async def compile_report(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        owned_project(session, user, project_id)
        data = await body(request, ('title', 'subtitle', 'body', 'options'), limit=520000)
        return await service.compile_report(project_id=project_id, user=user, session=session, check_session=lambda session, **kwargs: auth(request, session, **kwargs), data=data)
