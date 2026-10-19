from fastapi import Depends, Request
from evix_api.requests import body
from application.services.topics import TopicAdvisorService

def register_topics(app, settings, db, session_user, lock_user, operation, owned_service, generator, corpus=None):
    service = TopicAdvisorService(settings=settings, lock_user=lock_user, operation=operation, owned_service=owned_service, generator=generator, corpus=corpus)

    def auth(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return user

    @app.get('/api/topic-advisor/proposals')
    def history(user=Depends(auth), session=Depends(db)):
        return service.history(user=user, session=session)

    @app.get('/api/topic-advisor/proposals/{operation_id}')
    def receipt(operation_id: str, user=Depends(auth), session=Depends(db)):
        return service.receipt(operation_id=operation_id, user=user, session=session)

    @app.post('/api/topic-advisor/proposals', status_code=201)
    async def propose(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('serviceId', 'serviceRevision', 'idempotencyKey', 'consent', 'catalogVersion', 'profile', 'candidateIds', 'goal'), ('lookupId',), limit=20000)
        return await service.propose(user=user, session=session, check_session=lambda session, **kwargs: session_user(request, session, **kwargs), data=data)
