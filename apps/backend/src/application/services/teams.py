from sqlalchemy import select
from infrastructure.settings import normalize_email
from shared.errors import ApiError
from shared.contracts import uuid_string
from infrastructure.database.models import User, Team, Member

class TeamService:

    def __init__(self, *, settings, membership):
        self.settings = settings
        self.membership = membership

    def teams(self, *, user, session):
        rows = session.execute(select(Team, Member.role).join(Member).where(Member.user_id == user.id)).all()
        return {'teams': [{'id': t.id, 'name': t.name, 'role': role} for t, role in rows]}

    def members(self, *, team_id: str, user, session):
        self.membership(session, user, team_id, owner=True)
        rows = session.execute(select(User, Member.role).join(Member).where(Member.team_id == team_id)).all()
        return {'members': [{'userId': u.id, 'email': u.email, 'role': role} for u, role in rows]}

    async def add_member(self, *, team_id: str, user, session, data):
        self.membership(session, user, team_id, owner=True)
        session.execute(select(Team).where(Team.id == team_id).with_for_update()).scalar_one()
        try:
            email = normalize_email(data['email'])
        except ValueError:
            raise ApiError() from None
        if data['role'] not in ('editor', 'reviewer', 'viewer'):
            raise ApiError()
        other = session.execute(select(User).where(User.email == email)).scalar_one_or_none() if email in self.settings.invited_emails else None
        if other is None:
            raise ApiError(404, 'not_found', '账号不可添加。')
        member = session.get(Member, (team_id, other.id))
        if member and member.role == 'owner':
            raise ApiError(409, 'owner_protected', '不能修改所有者身份。')
        if member:
            member.role = data['role']
        else:
            session.add(Member(team_id=team_id, user_id=other.id, role=data['role']))
        session.commit()
        return {'userId': other.id, 'email': other.email, 'role': data['role']}

    def remove_member(self, *, team_id: str, user_id: str, user, session):
        self.membership(session, user, team_id, owner=True)
        uuid_string(user_id)
        session.execute(select(Team).where(Team.id == team_id).with_for_update()).scalar_one()
        member = session.get(Member, (team_id, user_id))
        if not member:
            raise ApiError(404, 'not_found', '资源不存在。')
        if member.role == 'owner':
            raise ApiError(409, 'owner_protected', '不能移除所有者。')
        session.delete(member)
        session.commit()
        return None
