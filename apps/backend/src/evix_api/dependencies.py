import hmac
from urllib.parse import urlsplit
from fastapi import Request, Depends
from sqlalchemy import select, text as sql_text
from sqlalchemy.orm import Session as DBSession
from shared.errors import ApiError
from infrastructure.database.models import User, Session, now
from infrastructure.security import keyed

from functools import partial
from types import SimpleNamespace
from application.access import AccessControl
from application.idempotency import reserve_operation
from application.model_services import validate_service_config

def create_dependencies(settings, engine):
    def db():
        with DBSession(engine, expire_on_commit=False) as session:
            yield session

    def origin(request):
        req_origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        referer_ok = True
        if referer is not None:
            parts = urlsplit(referer)
            ref_origin = (
                f"{parts.scheme}://{parts.netloc}"
                if parts.scheme and parts.netloc and not parts.username and not parts.password
                else ""
            )
            referer_ok = ref_origin in settings.allowed_origins
        if (
            req_origin not in settings.allowed_origins
            or not referer_ok
            or request.headers.get("sec-fetch-site") == "cross-site"
        ):
            raise ApiError(403, "origin_forbidden", "请从本站发起操作。")

    def session_user(request, session, required=True, *, lock=False):
        token = request.cookies.get(settings.cookie_name, "")
        query = select(Session).where(Session.token_hash == keyed(settings, "session/v1", token))
        if lock:
            query = query.with_for_update()
        row = session.execute(query.execution_options(populate_existing=True)).scalar_one_or_none() if token else None
        user = None
        if row is not None and row.revoked_at is None and row.expires_at > now():
            user = session.get(User, row.user_id)
        # Admitted: an address on the operator's list, or an account registered by invitation code.
        if user is None or (user.email not in settings.invited_emails and user.invite_id is None):
            if required:
                raise ApiError(401, "session_required", "请先登录。")
            return None, None
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {"user_id": user.id})
        if request.method not in ("GET", "HEAD"):
            origin(request)
            csrf = request.headers.get("x-csrf-token", "")
            if not csrf.isascii() or not hmac.compare_digest(csrf, row.csrf):
                raise ApiError(403, "csrf_required", "会话操作校验失败，请刷新。")
        return user, row

    def auth(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return user
    access = AccessControl()
    return SimpleNamespace(db=db, origin=origin, session_user=session_user, auth=auth, lock_user=access.lock_user, membership=access.membership, owned_project=access.owned_project, owned_service=access.owned_service, operation=partial(reserve_operation, settings), settings_input=partial(validate_service_config, settings))
