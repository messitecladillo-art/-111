from fastapi import Depends, Request
from evix_api.requests import body
from shared.contracts import uuid_string
from multi_agent.agents.research_agent.services import agent_chat as domain
from application.services.agent_chat import AgentChatService


def register_agent_chat(app, settings, db, session_user, lock_user, operation, owned_service, generator):
    service = AgentChatService(settings=settings, lock_user=lock_user, operation=operation, owned_service=owned_service, generator=generator)

    def auth(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return user

    @app.get('/api/agent/turns/{turn_id}')
    def receipt(turn_id: str, user=Depends(auth), session=Depends(db)):
        uuid_string(turn_id)
        lock_user(session, user)
        return service.receipt(turn_id=turn_id, user=user, session=session)

    @app.post('/api/agent/turns', status_code=201)
    async def create_turn(request: Request, user=Depends(auth), session=Depends(db)):
        raw_data = await body(request, domain.REQUEST_FIELDS, limit=40000)
        return await service.create_turn(user=user, session=session, check_session=lambda session, **kwargs: session_user(request, session, **kwargs), raw_data=raw_data)
