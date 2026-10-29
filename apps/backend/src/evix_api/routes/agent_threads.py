from fastapi import Depends, Request

from application.services.agent_threads import AgentThreadService
from evix_api.requests import body


def register_agent_threads(app, *, auth, db, owned_project, operation):
    service = AgentThreadService(owned_project=owned_project, operation=operation)

    @app.get("/api/projects/{project_id}/agent-threads")
    def list_threads(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.list(project_id=project_id, user=user, session=session)

    @app.get("/api/projects/{project_id}/agent-threads/{thread_id}")
    def get_thread(project_id: str, thread_id: str, user=Depends(auth), session=Depends(db)):
        return service.get(project_id=project_id, thread_id=thread_id, user=user, session=session)

    @app.put("/api/projects/{project_id}/agent-threads/{thread_id}")
    async def save_thread(project_id: str, thread_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(
            request,
            ("schemaVersion", "idempotencyKey", "expectedRevision", "title", "messages", "events"),
            ("checkpoint",),
            limit=350000,
        )
        return await service.save(project_id=project_id, thread_id=thread_id, user=user, session=session, data=data)
