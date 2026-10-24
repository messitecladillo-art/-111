import asyncio
from datetime import timedelta
import hmac
import secrets
import re
from sqlalchemy import select, func, text as sql_text, update
from infrastructure.settings import normalize_email
from shared.errors import ApiError
from shared.contracts import uuid_string
from infrastructure.database.models import User, Challenge, RateEvent, Session, Team, Member, now, new_id
from infrastructure.security import keyed, random_token, code_verifier

class AuthenticationService:

    def __init__(self, *, settings, mailer):
        self.settings = settings
        self.mailer = mailer

    async def auth_code(self, *, session, client_host, data):
        try:
            email = normalize_email(data['email'])
        except ValueError:
            raise ApiError() from None
        scope = keyed(self.settings, 'email-rate/v1', email)
        session.execute(sql_text('SELECT pg_advisory_xact_lock(4489371001)'))
        session.execute(sql_text('SELECT pg_advisory_xact_lock(:key)'), {'key': int(scope[:15], 16)})
        ip_scope = keyed(self.settings, 'email-ip-rate/v1', client_host)
        if session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == ip_scope, RateEvent.created_at > now() - timedelta(minutes=1))) >= 20 or session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == 'email-global', RateEvent.created_at > now() - timedelta(hours=1))) >= 200:
            raise ApiError(429, 'email_rate_limit', '请稍后再获取验证码。')
        recent = session.execute(select(RateEvent.created_at).where(RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1)).order_by(RateEvent.created_at.desc())).scalars().all()
        if len(recent) >= 5 or (recent and recent[0] > now() - timedelta(seconds=60)):
            raise ApiError(429, 'email_rate_limit', '请稍后再获取验证码。')
        session.add_all([RateEvent(scope=scope), RateEvent(scope=ip_scope), RateEvent(scope='email-global')])
        challenge_id, code = (new_id(), f'{secrets.randbelow(1000000):06d}')
        challenge = None
        if email in self.settings.invited_emails:
            session.execute(update(Challenge).where(Challenge.email == email, Challenge.consumed.is_(False)).values(consumed=True))
            challenge = Challenge(id=challenge_id, email=email, verifier=code_verifier(self.settings, challenge_id, email, code), expires_at=now() + timedelta(minutes=10))
            session.add(challenge)
        session.commit()
        if challenge:
            try:
                async with asyncio.timeout(10):
                    await self.mailer(challenge_id, email, code)
                session.execute(update(Challenge).where(Challenge.id == challenge_id, Challenge.consumed.is_(False)).values(delivered=True))
                session.commit()
            except Exception:
                session.rollback()
        return {'challengeId': challenge_id}

    async def auth_verify(self, *, session, data):
        challenge_id = uuid_string(data['challengeId'])
        code = data['code']
        invalid = ApiError(401, 'email_code_invalid', '邮箱或验证码不可用。')
        if not isinstance(code, str) or not re.fullmatch('[0-9]{6}', code):
            raise invalid
        challenge = session.execute(select(Challenge).where(Challenge.id == challenge_id).with_for_update()).scalar_one_or_none()
        if not challenge or challenge.consumed or (not challenge.delivered) or (challenge.expires_at <= now()) or (challenge.attempts >= 5) or (challenge.email not in self.settings.invited_emails):
            raise invalid
        challenge.attempts += 1
        if not hmac.compare_digest(challenge.verifier, code_verifier(self.settings, challenge.id, challenge.email, code)):
            session.commit()
            raise invalid
        challenge.consumed = True
        user = session.execute(select(User).where(User.email == challenge.email)).scalar_one_or_none()
        if user is None:
            user = User(id=new_id(), email=challenge.email)
            session.add(user)
            team = Team(id=new_id(), name='我的研究团队')
            session.add(team)
            session.flush()
            session.add(Member(team_id=team.id, user_id=user.id, role='owner'))
        token, csrf = (random_token(), random_token())
        session.add(Session(token_hash=keyed(self.settings, 'session/v1', token), user_id=user.id, csrf=csrf, expires_at=now() + timedelta(days=30)))
        session.commit()
        return ({'authenticated': True, 'user': {'id': user.id, 'email': user.email}, 'csrfToken': csrf, 'mode': self.settings.mode}, token)

    def logout(self, *, user, session, row):
        row.revoked_at = now()
        session.commit()
        return None
