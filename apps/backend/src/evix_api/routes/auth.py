from fastapi import Request, Depends
from fastapi.responses import JSONResponse, Response
from evix_api.requests import body
from application.services.auth import AuthenticationService
from application.services.invites import InviteService

def register_routes(app, *, settings, mailer, db, auth, origin, session_user):
    service = AuthenticationService(settings=settings, mailer=mailer)
    invites = InviteService(settings=settings)

    @app.post('/api/auth/code', status_code=202)
    async def auth_code(request: Request, session=Depends(db)):
        origin(request)
        data = await body(request, ('email',), ('inviteCode',), limit=1024)
        return await service.auth_code(session=session, client_host=request.client.host if request.client else 'unknown', data=data)

    @app.post('/api/auth/verify')
    async def auth_verify(request: Request, session=Depends(db)):
        origin(request)
        data = await body(request, ('challengeId', 'code'), limit=1024)
        result, token = await service.auth_verify(session=session, data=data)
        response = JSONResponse(result)
        response.set_cookie(settings.cookie_name, token, httponly=True, secure=settings.mode == 'production', samesite='strict', path='/', max_age=30 * 86400)
        return response

    @app.get('/api/invites')
    def list_invites(user=Depends(auth), session=Depends(db)):
        return invites.list(user=user, session=session)

    @app.post('/api/invites', status_code=201)
    async def create_invite(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('label', 'maxUses', 'days'), limit=1024)
        return invites.create(user=user, session=session, data=data)

    @app.post('/api/invites/{invite_id}/revoke')
    def revoke_invite(invite_id: str, user=Depends(auth), session=Depends(db)):
        return invites.revoke(invite_id=invite_id, user=user, session=session)

    @app.post('/api/auth/logout', status_code=204)
    def logout(request: Request, user=Depends(auth), session=Depends(db)):
        _, row = session_user(request, session)
        service.logout(user=user, session=session, row=row)
        response = Response(status_code=204)
        response.delete_cookie(settings.cookie_name, path='/', secure=settings.mode == 'production', httponly=True, samesite='strict')
        return response
