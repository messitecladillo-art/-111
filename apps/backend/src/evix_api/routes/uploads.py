import time
from datetime import timedelta
from contextlib import contextmanager
from fastapi import Request
from sqlalchemy import select, func, text as sql_text, event
from sqlalchemy.orm import Session as DBSession
from shared.errors import ApiError
from infrastructure.database.models import RateEvent, now
from infrastructure.security import keyed


def register_routes(app, *, settings, engine, sav_imports, preflights, session_user):
    @contextmanager
    def sav_db_session():
        # This callback runs in a bounded route-owned thread. Connection-pool
        # acquisition still uses the existing engine's pool bound; never detach
        # a callback whose transaction may still be active after HTTP cancel.
        deadline = time.monotonic() + 2.5
        with engine.connect() as connection:
            def bound_statement(_connection, cursor, _statement, _parameters, _context, _many):
                remaining_ms = int((deadline - time.monotonic()) * 1000)
                if remaining_ms <= 0:
                    raise ApiError(503, "sav_auth_timeout", "SAV 转换授权等待超时，请稍后重试。")
                # Values are locally derived integers, never request text. Set
                # each statement against one absolute transaction deadline.
                cursor.execute(f"SET LOCAL statement_timeout = {remaining_ms}")
                cursor.execute(f"SET LOCAL lock_timeout = {min(1000, remaining_ms)}")
            event.listen(connection, "before_cursor_execute", bound_statement)
            try:
                with DBSession(bind=connection, expire_on_commit=False) as session:
                    yield session
            finally:
                event.remove(connection, "before_cursor_execute", bound_statement)

    def sav_authorize(request, charge=False):
        with sav_db_session() as session:
            user, _ = session_user(request, session)
            user_id = user.id
            if charge:
                # One transaction serializes admission across API processes.
                # This lock and connection are released before upload/parse I/O.
                session.execute(sql_text("SELECT pg_advisory_xact_lock(4489371009)"))
                scope = keyed(settings, "sav-import-rate/v1", user_id)
                cutoff = now() - timedelta(hours=1)
                personal = session.scalar(select(func.count()).select_from(RateEvent).where(
                    RateEvent.scope == scope, RateEvent.created_at > cutoff))
                total = session.scalar(select(func.count()).select_from(RateEvent).where(
                    RateEvent.scope == "sav-import-global", RateEvent.created_at > cutoff))
                if personal >= settings.sav_hourly_imports or total >= settings.sav_global_hourly_imports:
                    raise ApiError(429, "sav_rate_limit", "SAV 转换次数较多，请稍后重试。")
                session.add_all([RateEvent(scope=scope), RateEvent(scope="sav-import-global")])
                session.commit()
            return user_id

    def sav_reauthorize(request, expected_user_id):
        with sav_db_session() as session:
            user, _ = session_user(request, session)
            if user.id != expected_user_id:
                raise ApiError(401, "session_required", "请先登录。")

    @app.post("/api/imports/sav")
    async def import_sav(request: Request):
        return await sav_imports.convert(request, sav_authorize, sav_reauthorize)

    @contextmanager
    def preflight_db_session():
        deadline = time.monotonic() + 2.5
        with engine.connect() as connection:
            def bounded(_connection, cursor, _statement, _parameters, _context, _many):
                remaining = int((deadline - time.monotonic()) * 1000)
                if remaining <= 0:
                    raise ApiError(503, "preflight_auth_timeout", "文件检查授权等待超时，请稍后重试。")
                cursor.execute(f"SET LOCAL statement_timeout = {remaining}")
                cursor.execute(f"SET LOCAL lock_timeout = {min(1000, remaining)}")
            event.listen(connection, "before_cursor_execute", bounded)
            try:
                with DBSession(bind=connection, expire_on_commit=False) as session:
                    yield session
            finally:
                event.remove(connection, "before_cursor_execute", bounded)

    def preflight_authorize(request, charge=False):
        with preflight_db_session() as session:
            user, _ = session_user(request, session)
            user_id = user.id
            if charge:
                session.execute(sql_text("SELECT pg_advisory_xact_lock(4489371010)"))
                scope = keyed(settings, "submission-preflight-rate/v1", user_id)
                cutoff = now() - timedelta(hours=1)
                personal = session.scalar(select(func.count()).select_from(RateEvent).where(
                    RateEvent.scope == scope, RateEvent.created_at > cutoff))
                total = session.scalar(select(func.count()).select_from(RateEvent).where(
                    RateEvent.scope == "submission-preflight-global", RateEvent.created_at > cutoff))
                if personal >= settings.preflight_hourly_imports or total >= settings.preflight_global_hourly_imports:
                    raise ApiError(429, "preflight_rate_limit", "文件检查次数较多，请稍后重试。")
                session.add_all([RateEvent(scope=scope), RateEvent(scope="submission-preflight-global")])
                session.commit()
            return user_id

    def preflight_reauthorize(request, expected_user_id):
        with preflight_db_session() as session:
            user, _ = session_user(request, session)
            if user.id != expected_user_id:
                raise ApiError(401, "session_required", "请先登录。")

    @app.post("/api/submission/preflight")
    async def submission_preflight(request: Request):
        return await preflights.convert(request, preflight_authorize, preflight_reauthorize)
