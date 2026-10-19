import asyncio
from datetime import timedelta
from sqlalchemy import select, func
from shared.errors import ApiError
from shared.contracts import text
from infrastructure.database.models import RateEvent, User, now
from multi_agent.agents.writing_agent.tools import latex as domain

class LatexService:

    def __init__(self, *, settings, owned_project):
        self.settings = settings
        self.owned_project = owned_project
        self.compiler = domain.LatexCompiler(self.settings)

    async def compile_report(self, *, project_id: str, user, session, check_session, data):
        text(data['title'], 120, 1)
        text(data['subtitle'], 240)
        text(data['body'], domain.MAX_BODY)
        if not data['title'].strip():
            raise ApiError()
        format_options = domain.options(data['options'])
        session.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()
        scope = 'latex:' + user.id
        if session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1))) >= self.settings.latex_hourly_compiles:
            raise ApiError(429, 'latex_rate_limit', '本小时编译次数已达上限，请稍后重试。')
        session.add(RateEvent(scope=scope))
        session.commit()
        result = await asyncio.to_thread(self.compiler.compile, data['title'], data['subtitle'], data['body'], format_options)
        current_user = check_session(session)
        self.owned_project(session, current_user, project_id)
        return result
