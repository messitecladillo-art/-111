from fastapi import Request, Depends
from fastapi.responses import Response
from evix_api.requests import body
from application.services.model_services import ModelConfigurationService

def register_routes(app, *, settings, db, auth, lock_user, operation, settings_input, owned_service):
    service = ModelConfigurationService(settings=settings, lock_user=lock_user, operation=operation, settings_input=settings_input, owned_service=owned_service)

    @app.get('/api/services')
    def services(user=Depends(auth), session=Depends(db)):
        return service.services(user=user, session=session)

    @app.post('/api/services', status_code=201)
    async def create_service(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('label', 'provider', 'baseUrl', 'model', 'maxOutputTokens', 'capabilities', 'apiKey', 'idempotencyKey'), limit=8192)
        return await service.create_service(user=user, session=session, data=data)

    @app.put('/api/services/{service_id}')
    async def edit_service(service_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('label', 'provider', 'baseUrl', 'model', 'maxOutputTokens', 'capabilities', 'expectedRevision', 'idempotencyKey'), ('apiKey',), limit=8192)
        return await service.edit_service(service_id=service_id, user=user, session=session, data=data)

    @app.delete('/api/services/{service_id}', status_code=204)
    async def remove_service(service_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('expectedRevision', 'idempotencyKey'), limit=1024)
        await service.remove_service(service_id=service_id, user=user, session=session, data=data)
        return Response(status_code=204)
