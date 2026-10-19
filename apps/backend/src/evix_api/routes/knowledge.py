from fastapi import Depends, Request
from evix_api.requests import body
from application.services.knowledge import KnowledgeService

def register_knowledge(app, settings, db, session_user, owned_project, lock_user, operation, catalog=None, provider=None, config=None):
    service = KnowledgeService(settings=settings, owned_project=owned_project, lock_user=lock_user, operation=operation, catalog=catalog, provider=provider, config=config)
    app.state.knowledge = {'catalogVersions': sum((len(v) for v in service.catalog.values())), 'configured': service.provider is not None}

    @app.get('/api/me/knowledge-state')
    def get_state(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return service.get_state(session=session, user=user)

    @app.put('/api/me/knowledge-state')
    async def put_state(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        data = await body(request, ('expectedRevision', 'idempotencyKey', 'state'), limit=100000)
        return await service.put_state(session=session, data=data, user=user)

    @app.get('/api/projects/{project_id}/knowledge-references')
    def get_references(project_id: str, request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return service.get_references(project_id=project_id, session=session, user=user)

    async def mutate_reference(project_id, request, session, reference_id=None):
        user, _ = session_user(request, session)
        required = ('expectedRevision', 'idempotencyKey') + (() if reference_id else ('entryId', 'entryVersion'))
        data = await body(request, required, limit=2000)
        return await service.mutate_reference(project_id=project_id, session=session, reference_id=reference_id, data=data, user=user)

    @app.post('/api/projects/{project_id}/knowledge-references')
    async def add_reference(project_id: str, request: Request, session=Depends(db)):
        return await mutate_reference(project_id, request, session)

    @app.delete('/api/projects/{project_id}/knowledge-references/{reference_id}')
    async def delete_reference(project_id: str, reference_id: str, request: Request, session=Depends(db)):
        return await mutate_reference(project_id, request, session, reference_id)

    @app.post('/api/knowledge/term-requests', status_code=201)
    async def term_request(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        data = await body(request, ('idempotencyKey', 'term', 'domain', 'note'), limit=4000)
        return await service.term_request(session=session, data=data, user=user)

    @app.get('/api/knowledge/lookups/{lookup_id}')
    def get_lookup(lookup_id: str, request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return service.get_lookup(lookup_id=lookup_id, session=session, user=user)

    @app.post('/api/knowledge/lookups', status_code=202)
    async def create_lookup(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        data = await body(request, ('query', 'idempotencyKey'), limit=1000)
        return await service.create_lookup(session=session, data=data, user=user)
