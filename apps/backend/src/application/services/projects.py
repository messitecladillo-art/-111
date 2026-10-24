from sqlalchemy import select
from shared.errors import ApiError
from shared.contracts import text
from infrastructure.database.models import Member, Project, new_id
from application.presenters import project_view

class ProjectService:

    def __init__(self, *, membership, lock_user, operation, owned_project):
        self.membership = membership
        self.lock_user = lock_user
        self.operation = operation
        self.owned_project = owned_project

    def projects(self, *, user, session):
        rows = session.execute(select(Project).join(Member, Member.team_id == Project.team_id).where(Member.user_id == user.id).order_by(Project.created_at.desc())).scalars().all()
        return {'projects': [project_view(p) for p in rows]}

    async def create_project(self, *, user, session, data):
        self.membership(session, user, data['teamId'], edit=True)
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, 'projects', data)
        if repeated:
            return op.response
        title = text(data['title'], 160, 1).strip()
        if not title:
            raise ApiError()
        p = Project(id=new_id(), team_id=data['teamId'], title=title)
        session.add(p)
        session.flush()
        op.response = project_view(p)
        session.commit()
        return op.response

    def get_project(self, *, project_id: str, user, session):
        p, role = self.owned_project(session, user, project_id)
        return {'project': project_view(p), 'membershipRole': role}
