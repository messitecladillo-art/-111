from fastapi import Depends, Request

from application.services.project_memory import ProjectMemoryService
from evix_api.requests import body
from shared.errors import ApiError


def register_memory(app, *, auth, db, owned_project, operation, service=None):
    service = service or ProjectMemoryService(owned_project=owned_project, operation=operation)

    @app.get("/api/projects/{project_id}/memory")
    def get(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.get(project_id=project_id, user=user, session=session)

    @app.get("/api/projects/{project_id}/memory/versions")
    def versions(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.versions(project_id=project_id, user=user, session=session)

    @app.get("/api/projects/{project_id}/memory/versions/{version_id}")
    def version(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        return service.version(project_id=project_id, version_id=version_id, user=user, session=session)

    @app.post("/api/projects/{project_id}/memory/versions", status_code=201)
    async def save(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(
            request,
            ("schemaVersion", "idempotencyKey", "expectedRevision", "document"),
            ("changeNote",),
            limit=70000,
        )
        if data["schemaVersion"] != 1:
            raise ApiError()
        return await service.save(project_id=project_id, user=user, session=session, data=data)
