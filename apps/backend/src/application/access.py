from sqlalchemy import select
from shared.errors import ApiError
from shared.contracts import uuid_string
from infrastructure.database.models import User, Member, Project, Service

class AccessControl:
    def lock_user(self, session, user):
        session.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()

    def membership(self, session, user, team_id, edit=False, owner=False):
        uuid_string(team_id)
        role = session.execute(select(Member).where(Member.team_id == team_id, Member.user_id == user.id).execution_options(populate_existing=True)).scalar_one_or_none()
        if role is None:
            raise ApiError(404, 'not_found', '资源不存在。')
        if owner and role.role != 'owner' or (edit and role.role not in ('owner', 'editor')):
            raise ApiError(403, 'permission_denied', '当前角色不能执行此操作。')
        return role.role

    def owned_project(self, session, user, project_id, edit=False, lock=False):
        uuid_string(project_id)
        query = select(Project).where(Project.id == project_id).execution_options(populate_existing=True)
        if lock:
            visible = session.execute(query).scalar_one_or_none()
            if visible is None:
                raise ApiError(404, 'not_found', '资源不存在。')
            self.membership(session, user, visible.team_id, edit=edit)
            query = query.with_for_update()
        p = session.execute(query).scalar_one_or_none()
        if p is None:
            raise ApiError(404, 'not_found', '资源不存在。')
        role = self.membership(session, user, p.team_id, edit=edit)
        return (p, role)

    def owned_service(self, session, user, service_id, lock=False):
        uuid_string(service_id)
        q = select(Service).where(Service.id == service_id, Service.user_id == user.id, Service.deleted.is_(False))
        if lock:
            q = q.with_for_update()
        s = session.execute(q).scalar_one_or_none()
        if not s:
            raise ApiError(404, 'not_found', '资源不存在。')
        return s
