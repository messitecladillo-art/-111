import hashlib
import json
from fastapi import Depends, Request
from fastapi.responses import Response
from evix_api.requests import body
from shared.contracts import uuid_string
from multi_agent.agents.research_agent.services import agent_chat as domain
from multi_agent.tool_registry import public_tool_catalog
from application.services.agent_chat import AgentChatService
from application.services.section_draft import SectionDraftService
from multi_agent.agents.writing_agent.services import section_draft


def _etag_matches(header_val: str | None, etag: str) -> bool:
    if not header_val:
        return False
    target = etag.removeprefix("W/").strip()
    for candidate in header_val.split(","):
        token = candidate.strip()
        if token == "*" or token.removeprefix("W/").strip() == target:
            return True
    return False


def register_agent_chat(app, settings, db, session_user, lock_user, operation, owned_service, generator):
    service = AgentChatService(settings=settings, lock_user=lock_user, operation=operation, owned_service=owned_service, generator=generator)
    drafts = SectionDraftService(settings=settings, lock_user=lock_user, operation=operation, owned_service=owned_service, generator=generator)
    catalog_bytes = json.dumps(public_tool_catalog(), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    catalog_etag = f'"sha256-{hashlib.sha256(catalog_bytes).hexdigest()[:24]}"'
    catalog_headers = {
        "Cache-Control": "public, max-age=300, must-revalidate",
        "ETag": catalog_etag,
        "Vary": "Accept-Encoding",
    }

    def auth(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return user

    @app.get('/api/agent/tools')
    def tool_catalog(request: Request):
        if _etag_matches(request.headers.get("if-none-match"), catalog_etag):
            return Response(status_code=304, headers=catalog_headers)
        return Response(content=catalog_bytes, media_type="application/json", headers=catalog_headers)

    @app.get('/api/agent/turns/{turn_id}')
    def receipt(turn_id: str, user=Depends(auth), session=Depends(db)):
        uuid_string(turn_id)
        lock_user(session, user)
        return service.receipt(turn_id=turn_id, user=user, session=session)

    @app.post('/api/agent/turns', status_code=201)
    async def create_turn(request: Request, user=Depends(auth), session=Depends(db)):
        raw_data = await body(request, domain.REQUEST_FIELDS, domain.STEP_FIELDS, limit=60000)
        return await service.create_turn(user=user, session=session, check_session=lambda session, **kwargs: session_user(request, session, **kwargs), raw_data=raw_data)

    # A report section drafted from the project's facts; the browser fills the numbers and the user adopts it.
    @app.get('/api/agent/drafts/{draft_id}')
    def draft_receipt(draft_id: str, user=Depends(auth), session=Depends(db)):
        uuid_string(draft_id)
        lock_user(session, user)
        return drafts.receipt(draft_id=draft_id, user=user, session=session)

    @app.post('/api/agent/drafts', status_code=201)
    async def create_draft(request: Request, user=Depends(auth), session=Depends(db)):
        raw_data = await body(request, section_draft.REQUEST_FIELDS, section_draft.OPTIONAL_FIELDS, limit=80000)
        return await drafts.create_draft(user=user, session=session, check_session=lambda session, **kwargs: session_user(request, session, **kwargs), raw_data=raw_data)
