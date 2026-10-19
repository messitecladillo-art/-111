from fastapi import Request, Depends
from evix_api.requests import body
from application.services.projects import ProjectService

def register_routes(app, *, db, auth, membership, lock_user, operation, owned_project):
    service = ProjectService(membership=membership, lock_user=lock_user, operation=operation, owned_project=owned_project)

    @app.get('/api/projects')
    def projects(user=Depends(auth), session=Depends(db)):
        return service.projects(user=user, session=session)

    @app.post('/api/projects', status_code=201)
    async def create_project(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('title', 'teamId', 'idempotencyKey'), limit=2048)
        return await service.create_project(user=user, session=session, data=data)

    @app.get('/api/projects/{project_id}')
    def get_project(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_project(project_id=project_id, user=user, session=session)
