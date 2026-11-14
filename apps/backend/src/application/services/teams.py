import time
from sqlalchemy import func, select
from infrastructure.settings import normalize_email
from shared.errors import ApiError
from shared.contracts import uuid_string
from infrastructure.database.models import User, Team, Member

MAX_TEAM_MEMBERS = 6
PRESENCE_TTL_SECONDS = 180
VALID_PRESENCE_STATUSES = ('online', 'writing', 'offline')


class TeamService:

    def __init__(self, *, settings, membership):
        self.settings = settings
        self.membership = membership
        self._presence: dict[tuple[str, str], dict] = {}

    def teams(self, *, user, session):
        rows = session.execute(select(Team, Member.role).join(Member).where(Member.user_id == user.id)).all()
        return {'teams': [{'id': t.id, 'name': t.name, 'role': role} for t, role in rows]}

    def members(self, *, team_id: str, user, session):
        self.membership(session, user, team_id, owner=True)
        rows = session.execute(select(User, Member.role).join(Member).where(Member.team_id == team_id)).all()
        return {'members': [{'userId': u.id, 'email': u.email, 'role': role} for u, role in rows], 'maxMembers': MAX_TEAM_MEMBERS}

    def heartbeat_presence(self, *, team_id: str, user, session, data):
        self.membership(session, user, team_id, owner=False)
        status = str(data.get('status') or 'online').strip()
        if status not in VALID_PRESENCE_STATUSES:
            raise ApiError()
        note = str(data.get('note') or '').strip()[:80]
        now = time.time()
        self._presence[(team_id, user.id)] = {
            'status': status,
            'note': note,
            'updatedAt': now,
        }
        return {'userId': user.id, 'status': status, 'note': note, 'updatedAt': now}

    def presence(self, *, team_id: str, user, session):
        self.membership(session, user, team_id, owner=False)
        now = time.time()
        self._presence.setdefault((team_id, user.id), {'status': 'online', 'note': '', 'updatedAt': now})
        rows = session.execute(select(User, Member.role).join(Member).where(Member.team_id == team_id)).all()
        members = []
        for u, role in rows:
            entry = self._presence.get((team_id, u.id))
            if entry and now - float(entry.get('updatedAt', 0)) <= PRESENCE_TTL_SECONDS:
                state = entry['status']
                note = entry.get('note', '')
            else:
                state = 'offline'
                note = ''
            members.append({
                'userId': u.id,
                'email': u.email,
                'role': role,
                'status': state,
                'note': note,
            })
        return {'maxMembers': MAX_TEAM_MEMBERS, 'members': members}

    async def add_member(self, *, team_id: str, user, session, data):
        self.membership(session, user, team_id, owner=True)
        session.execute(select(Team).where(Team.id == team_id).with_for_update()).scalar_one()
        try:
            email = normalize_email(data['email'])
        except ValueError:
            raise ApiError() from None
        if data['role'] not in ('editor', 'reviewer', 'viewer'):
            raise ApiError()
        other = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
        # Only admitted accounts join a team: listed addresses, or accounts registered by invitation code.
        if other is None or (email not in self.settings.invited_emails and other.invite_id is None):
            raise ApiError(404, 'not_found', '账号不可添加。')
        member = session.get(Member, (team_id, other.id))
        if member and member.role == 'owner':
            raise ApiError(409, 'owner_protected', '不能修改所有者身份。')
        if member:
            member.role = data['role']
        else:
            count = session.execute(
                select(func.count()).select_from(Member).where(Member.team_id == team_id)
            ).scalar_one()
            if int(count) >= MAX_TEAM_MEMBERS:
                raise ApiError(409, 'team_full', f'团队成员已达 {MAX_TEAM_MEMBERS} 人上限，无法继续添加。')
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
