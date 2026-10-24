from fastapi import Request, Depends
from fastapi.responses import Response
from evix_api.requests import body
from application.services.teams import TeamService

def register_routes(app, *, settings, db, auth, membership):
    service = TeamService(settings=settings, membership=membership)

    @app.get('/api/teams')
    def teams(user=Depends(auth), session=Depends(db)):
        return service.teams(user=user, session=session)

    @app.get('/api/teams/{team_id}/members')
    def members(team_id: str, user=Depends(auth), session=Depends(db)):
        return service.members(team_id=team_id, user=user, session=session)

    @app.post('/api/teams/{team_id}/members', status_code=201)
    async def add_member(team_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ('email', 'role'), limit=1024)
        return await service.add_member(team_id=team_id, user=user, session=session, data=data)

    @app.delete('/api/teams/{team_id}/members/{user_id}', status_code=204)
    def remove_member(team_id: str, user_id: str, user=Depends(auth), session=Depends(db)):
        service.remove_member(team_id=team_id, user_id=user_id, user=user, session=session)
        return Response(status_code=204)
