"""Invitation codes: how someone outside the operator's invitation list registers.

An administrator (an address on EVIX_INVITED_EMAILS) issues a code with a purpose label, a number of uses and a
lifetime. The code is shown once; only its keyed hash is stored. Whoever holds a usable code can register one email
address per use; the account remembers the code it came in by. Accounts registered by code cannot issue codes, so an
invitation never spreads beyond the people an administrator chose. Revoking a code stops further registrations; the
accounts it already admitted keep their access.
"""
from datetime import timedelta
import re
import secrets
import unicodedata
from sqlalchemy import select, func
from shared.errors import ApiError
from shared.contracts import integer, text
from infrastructure.database.models import InviteCode, RateEvent, now, new_id
from infrastructure.security import keyed

# 31 symbols without the look-alikes 0/O, 1/I/L: twelve of them carry about 59 bits.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 12
MAX_USES = 50
MAX_DAYS = 30
MAX_ACTIVE = 100
CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def new_code():
    raw = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return "-".join(raw[i:i + 4] for i in range(0, CODE_LENGTH, 4))


def normalize_code(value):
    """The code as stored: full-width forms folded, case, spaces and hyphens ignored. None when it cannot be a code."""
    if not isinstance(value, str) or len(value) > 64:
        return None
    folded = re.sub(r"[\s\-]", "", unicodedata.normalize("NFKC", value)).upper()
    return folded if len(folded) == CODE_LENGTH and all(c in ALPHABET for c in folded) else None


def code_hash(settings, code):
    return keyed(settings, "invite/v1", code)


def usable_invite(session, settings, value):
    """The invitation a code names, if it can still admit someone; otherwise None (never says why)."""
    code = normalize_code(value)
    if code is None:
        return None
    return session.execute(select(InviteCode).where(InviteCode.code_hash == code_hash(settings, code), InviteCode.revoked_at.is_(None),
                                                    InviteCode.expires_at > now(), InviteCode.uses < InviteCode.max_uses)).scalar_one_or_none()


def status(row):
    if row.revoked_at is not None:
        return "revoked"
    if row.uses >= row.max_uses:
        return "used_up"
    return "expired" if row.expires_at <= now() else "active"


def view(row):
    return {"id": row.id, "label": row.label, "maxUses": row.max_uses, "uses": row.uses, "status": status(row),
            "createdAt": row.created_at.isoformat(), "expiresAt": row.expires_at.isoformat(),
            "revokedAt": row.revoked_at.isoformat() if row.revoked_at else None}


class InviteService:

    def __init__(self, *, settings):
        self.settings = settings

    def _issuer(self, user):
        if user.email not in self.settings.invited_emails:
            raise ApiError(403, "invite_forbidden", "只有管理员可以发放邀请码。")

    def create(self, *, user, session, data):
        self._issuer(user)
        label = text(data["label"], 40).strip()
        if CONTROL.search(label):
            raise ApiError()
        max_uses, days = integer(data["maxUses"], 1, MAX_USES), integer(data["days"], 1, MAX_DAYS)
        scope = keyed(self.settings, "invite-create/v1", user.id)
        if session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1))) >= 30:
            raise ApiError(429, "invite_rate_limit", "邀请码发放过于频繁，请稍后再试。")
        active = session.scalar(select(func.count()).select_from(InviteCode).where(InviteCode.created_by == user.id, InviteCode.revoked_at.is_(None),
                                                                                  InviteCode.expires_at > now(), InviteCode.uses < InviteCode.max_uses))
        if active >= MAX_ACTIVE:
            raise ApiError(409, "invite_limit", f"有效邀请码已达 {MAX_ACTIVE} 个，请先作废不再需要的。")
        code = new_code()
        row = InviteCode(id=new_id(), code_hash=code_hash(self.settings, normalize_code(code)), created_by=user.id, label=label,
                         max_uses=max_uses, uses=0, expires_at=now() + timedelta(days=days), created_at=now())
        session.add_all([row, RateEvent(scope=scope)])
        session.commit()
        # The only time the code itself leaves the server.
        return {**view(row), "code": code}

    def list(self, *, user, session):
        self._issuer(user)
        rows = session.execute(select(InviteCode).where(InviteCode.created_by == user.id).order_by(InviteCode.created_at.desc()).limit(200)).scalars().all()
        return {"invites": [view(row) for row in rows]}

    def revoke(self, *, invite_id, user, session):
        self._issuer(user)
        row = session.execute(select(InviteCode).where(InviteCode.id == invite_id, InviteCode.created_by == user.id).with_for_update()).scalar_one_or_none()
        if row is None:
            raise ApiError(404, "not_found", "邀请码不存在。")
        if row.revoked_at is None:
            row.revoked_at = now()
        session.commit()
        return view(row)
