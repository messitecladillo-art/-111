from fastapi import Depends, Request
from shared.errors import ApiError
from evix_api.requests import body
from shared.contracts import uuid_string
from multi_agent.agents.research_agent.services import topic_agent as domain

def query_scope(request, *, required=False):
    query = request.query_params
    keys = set(query)
    if keys - {'projectId', 'scope'} or len(keys) > 1 or any((len(query.getlist(key)) != 1 for key in keys)):
        raise ApiError()
    if 'projectId' in query:
        return uuid_string(query['projectId'])
    if 'scope' in query:
        if query['scope'] != 'global':
            raise ApiError()
        return None
    if required:
        raise ApiError(422, 'invalid_input', '请选择项目或独立讨论范围。')
    return domain.UNBOUND_SCOPE
from application.services.topic_agent import TopicAgentService

def register_topic_agent(app, settings, db, session_user, lock_user, operation, owned_service, generator, corpus=None, *, owned_project):
    service = TopicAgentService(settings=settings, lock_user=lock_user, operation=operation, owned_service=owned_service, generator=generator, corpus=corpus, owned_project=owned_project)

    def auth(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return user

    @app.get('/api/topic-agent/turns')
    def history(request: Request, user=Depends(auth), session=Depends(db)):
        lock_user(session, user)
        scope = query_scope(request)
        return service.history(user=user, session=session, scope=scope)

    @app.get('/api/topic-agent/turns/{turn_id}')
    def receipt(turn_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        uuid_string(turn_id)
        lock_user(session, user)
        scope = query_scope(request)
        return service.receipt(turn_id=turn_id, user=user, session=session, scope=scope)

    @app.get('/api/topic-agent/turns/{turn_id}/conversation')
    def conversation(turn_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        uuid_string(turn_id)
        lock_user(session, user)
        scope = query_scope(request, required=True)
        return service.conversation(turn_id=turn_id, user=user, session=session, scope=scope)

    @app.post('/api/topic-agent/turns', status_code=201)
    async def create_turn(request: Request, user=Depends(auth), session=Depends(db)):
        raw_data = await body(request, domain.REQUEST_FIELDS, ('lookupId', 'projectId'), limit=25000)
        return await service.create_turn(user=user, session=session, check_session=lambda session, **kwargs: session_user(request, session, **kwargs), raw_data=raw_data)
