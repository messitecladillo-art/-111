from fastapi import Request, Depends
from evix_api.requests import body
from application.services.proposals import ProposalService

def register_routes(app, *, settings, generator, db, auth, owned_project, owned_service, lock_user, session_user):
    service = ProposalService(settings=settings, generator=generator, owned_project=owned_project, owned_service=owned_service, lock_user=lock_user)

    @app.post('/api/projects/{project_id}/proposals', status_code=201)
    async def generate_proposal(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id, edit=True)
        data = await body(request, ('serviceId', 'serviceRevision', 'brief', 'expectedQuestionnaireRevision', 'idempotencyKey', 'consent'), limit=32768)
        return await service.generate_proposal(project_id=project_id, user=user, session=session, check_session=lambda session, **kwargs: session_user(request, session, **kwargs), data=data, p=p)

    @app.get('/api/projects/{project_id}/proposals')
    def get_proposals(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_proposals(project_id=project_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/proposals/{proposal_id}')
    def get_proposal(project_id: str, proposal_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_proposal(project_id=project_id, proposal_id=proposal_id, user=user, session=session)
