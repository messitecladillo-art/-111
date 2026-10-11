import asyncio
import time
from datetime import timedelta, timezone
import hmac
import secrets
import re
from contextlib import asynccontextmanager, contextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import create_engine, select, func, text as sql_text, update, event
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.exc import SQLAlchemyError
from .settings import Settings, BASES, normalize_email, validate_base
from .contracts import ApiError, body, uuid_string, text, integer, fingerprint, questionnaire, canonical, object_fields
from .models import User, Challenge, RateEvent, Session, Team, Member, Project, Service, Operation, Version, Proposal, SiliconRun, now, new_id
from .security import keyed, random_token, code_verifier, config_view, encrypt, decrypt
from .provider import LiveProvider, FixtureProvider, ProviderFailure, parse_proposal
from . import silicon
from .mail import FixtureMail, ResendMail, MailFailure
from .survey_import_routes import TemporarySavImports


SCHEMA_REVISION = "0002_silicon_runs"


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def project_view(p):
    return {"id": p.id, "title": p.title, "teamId": p.team_id, "revision": p.revision, "createdAt": iso(p.created_at)}


def head(v):
    return {"id": v.id, "projectId": v.project_id, "revision": v.revision, "design": v.design, "updatedAt": iso(v.created_at)}


def proposal_view(p):
    result = {"id": p.id, "projectId": p.project_id, "serviceId": p.service_id, "serviceRevision": p.service_revision,
              "inputRevision": p.input_revision, "status": p.status, "createdAt": iso(p.created_at)}
    if p.design is not None:
        result["design"] = p.design
    if p.error_code:
        result["errorCode"] = p.error_code
    return result


def silicon_view(run, full=False):
    result = {"id": run.id, "projectId": run.project_id, "status": run.status, "done": run.done, "total": run.total,
              "services": run.services, "classification": "simulated", "createdAt": iso(run.created_at),
              "personas": len(run.plan["personas"]), "scenarios": len(run.plan["scenarios"]), "memory": run.plan["memory"],
              "title": run.plan["design"]["title"]}
    if run.finished_at:
        result["finishedAt"] = iso(run.finished_at)
    if run.error_code:
        result["errorCode"] = run.error_code
    if full:
        result["responses"] = run.responses
    return result


def create_app(settings: Settings | None = None, mail=None, provider=None, engine=None):
    settings = settings or Settings()
    if settings.mode == "production" and (mail is not None or provider is not None or engine is not None):
        raise ValueError("Production rejects injected fixtures")
    owns_engine = engine is None
    engine = engine or create_engine(settings.database_url, pool_pre_ping=True, pool_size=5, max_overflow=5, echo=False)
    mailer = mail or (FixtureMail(settings.mailbox_dir) if settings.mail_mode == "fixture" else ResendMail(settings))
    generator = provider or (FixtureProvider() if settings.provider_mode == "fixture" else LiveProvider())
    sav_imports = TemporarySavImports(settings)

    @asynccontextmanager
    async def lifespan(application):
        if settings.mode == "production":
            with engine.connect() as connection:
                privileged = connection.execute(sql_text("SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user")).scalar_one()
                owner = connection.execute(sql_text("SELECT count(*) FROM pg_tables WHERE schemaname=current_schema() AND tableowner=current_user")).scalar_one()
                revision = connection.execute(sql_text("SELECT version_num FROM alembic_version")).scalar_one()
                if privileged or owner or revision != SCHEMA_REVISION:
                    raise RuntimeError("API requires current migrations and an unprivileged non-owner database role")
        await sav_imports.sweep()
        maintenance = asyncio.create_task(sav_imports.maintenance())
        try:
            yield
        finally:
            maintenance.cancel()
            await asyncio.gather(maintenance, return_exceptions=True)
            await sav_imports.close()
        loop = asyncio.get_running_loop()
        tasks = [task for task in application.state.silicon_tasks if task.get_loop() is loop]
        for task in tasks:
            task.cancel()  # Rows stay "running" and later read as outcome_unknown; nothing is replayed.
        await asyncio.gather(*tasks, return_exceptions=True)
        if owns_engine:
            engine.dispose()
    app = FastAPI(title="EVI-X API", lifespan=lifespan, docs_url=None if settings.mode == "production" else "/docs", redoc_url=None, openapi_url=None if settings.mode == "production" else "/openapi.json")
    app.state.settings, app.state.engine, app.state.provider = settings, engine, generator
    app.state.silicon_tasks = set()
    app.state.sav_imports = sav_imports

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["cache-control"] = "no-store"
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "no-referrer"
        return response

    @app.exception_handler(ApiError)
    async def error_handler(request, error):
        return JSONResponse({"error": {"code": error.code, "message": error.message}}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, error):
        return JSONResponse({"error": {"code": "invalid_input", "message": "请求格式无效。"}}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request, error):
        return JSONResponse({"error": {"code": "not_found" if error.status_code == 404 else "http_error", "message": "接口或请求不可用。"}}, status_code=error.status_code)

    @app.exception_handler(Exception)
    async def internal_handler(request, error):
        return JSONResponse({"error": {"code": "internal_error", "message": "请求暂未完成，请勿自动重发生成请求。"}}, status_code=500,
                            headers={"cache-control": "no-store", "x-content-type-options": "nosniff"})

    @app.exception_handler(SQLAlchemyError)
    async def storage_handler(request, error):
        return JSONResponse({"error": {"code": "storage_unavailable", "message": "存储暂不可用，请勿自动重发生成请求。"}}, status_code=503)

    def db():
        with DBSession(engine, expire_on_commit=False) as session:
            yield session

    def origin(request):
        if request.headers.get("origin") not in settings.allowed_origins or request.headers.get("sec-fetch-site") == "cross-site":
            raise ApiError(403, "origin_forbidden", "请从本站发起操作。")

    def session_user(request, session, required=True):
        token = request.cookies.get(settings.cookie_name, "")
        row = session.execute(select(Session).where(Session.token_hash == keyed(settings, "session/v1", token)).execution_options(populate_existing=True)).scalar_one_or_none() if token else None
        if row is None or row.revoked_at is not None or row.expires_at <= now():
            if required:
                raise ApiError(401, "session_required", "请先登录。")
            return None, None
        user = session.get(User, row.user_id)
        if user is None or user.email not in settings.invited_emails:
            raise ApiError(401, "session_required", "请先登录。")
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {"user_id": user.id})
        if request.method not in ("GET", "HEAD"):
            origin(request)
            if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), row.csrf):
                raise ApiError(403, "csrf_required", "会话操作校验失败，请刷新。")
        return user, row

    def auth(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return user

    def lock_user(session, user):
        session.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()

    def membership(session, user, team_id, edit=False, owner=False):
        uuid_string(team_id)
        role = session.execute(select(Member).where(Member.team_id == team_id, Member.user_id == user.id).execution_options(populate_existing=True)).scalar_one_or_none()
        if role is None:
            raise ApiError(404, "not_found", "资源不存在。")
        if owner and role.role != "owner" or edit and role.role not in ("owner", "editor"):
            raise ApiError(403, "permission_denied", "当前角色不能执行此操作。")
        return role.role

    def owned_project(session, user, project_id, edit=False, lock=False):
        uuid_string(project_id)
        query = select(Project).where(Project.id == project_id).execution_options(populate_existing=True)
        if lock:
            # FOR UPDATE applies the RLS write policy even for a read. Resolve
            # membership first so a known read-only member receives permission_denied.
            visible = session.execute(query).scalar_one_or_none()
            if visible is None:
                raise ApiError(404, "not_found", "资源不存在。")
            membership(session, user, visible.team_id, edit=edit)
            query = query.with_for_update()
        p = session.execute(query).scalar_one_or_none()
        if p is None:
            raise ApiError(404, "not_found", "资源不存在。")
        role = membership(session, user, p.team_id, edit=edit)
        return p, role

    def owned_service(session, user, service_id, lock=False):
        uuid_string(service_id)
        q = select(Service).where(Service.id == service_id, Service.user_id == user.id, Service.deleted.is_(False))
        if lock:
            q = q.with_for_update()
        s = session.execute(q).scalar_one_or_none()
        if not s:
            raise ApiError(404, "not_found", "资源不存在。")
        return s

    def operation(session, user, scope, data):
        key = uuid_string(data["idempotencyKey"])
        # HMAC protects low-entropy secrets in configuration payloads from offline guessing.
        digest = keyed(settings, "operation-payload/v1", canonical(data))
        existing = session.get(Operation, (user.id, scope, key))
        if existing:
            if existing.payload_hash != digest:
                raise ApiError(409, "idempotency_conflict", "操作标识已用于不同请求。")
            return existing, True
        item = Operation(user_id=user.id, scope=scope, key=key, payload_hash=digest)
        session.add(item)
        return item, False

    def settings_input(data):
        label = text(data["label"], 80, 1)
        model = text(data["model"], 120, 1)
        if label != label.strip() or re.search(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]", label) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}", model):
            raise ApiError()
        caps = data["capabilities"]
        if not isinstance(caps, list) or not 1 <= len(caps) <= 4 or any(not isinstance(c, str) for c in caps) or len(set(caps)) != len(caps) or any(c not in ("questionnaire", "research", "report", "defense") for c in caps):
            raise ApiError()
        policy = {**BASES, "compatible": tuple(settings.compatible_bases)}
        try:
            validate_base(data["provider"], data["baseUrl"], policy)
        except (ValueError, TypeError):
            raise ApiError(422, "destination_not_allowed", "服务地址未获运营者允许。") from None
        if "apiKey" in data and (not isinstance(data["apiKey"], str) or not re.fullmatch(r"[!-~]{8,1024}", data["apiKey"])):
            raise ApiError(422, "invalid_key", "密钥格式无效。")
        return {"label": label, "provider": data["provider"], "base_url": data["baseUrl"], "model": model,
                "max_output_tokens": integer(data["maxOutputTokens"], 128, 4096), "capabilities": caps}

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

    @app.get("/api/health")
    def health(session=Depends(db)):
        session.execute(select(User.id).limit(1))
        return {"status": "ok", "database": "ok", "mode": settings.mode}

    @app.get("/api/session")
    def get_session(request: Request, session=Depends(db)):
        user, row = session_user(request, session, required=False)
        if user is None:
            return {"authenticated": False, "mode": settings.mode}
        return {"authenticated": True, "user": {"id": user.id, "email": user.email}, "csrfToken": row.csrf, "mode": settings.mode}

    @app.post("/api/auth/code", status_code=202)
    async def auth_code(request: Request, session=Depends(db)):
        origin(request)
        data = await body(request, ("email",), limit=1024)
        try:
            email = normalize_email(data["email"])
        except ValueError:
            raise ApiError() from None
        scope = keyed(settings, "email-rate/v1", email)
        # PostgreSQL transaction advisory lock serializes both invited and unknown addresses.
        session.execute(sql_text("SELECT pg_advisory_xact_lock(4489371001)"))
        session.execute(sql_text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(scope[:15], 16)})
        ip_scope = keyed(settings, "email-ip-rate/v1", request.client.host if request.client else "unknown")
        if session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == ip_scope, RateEvent.created_at > now() - timedelta(minutes=1))) >= 20 or session.scalar(select(func.count()).select_from(RateEvent).where(RateEvent.scope == "email-global", RateEvent.created_at > now() - timedelta(hours=1))) >= 200:
            raise ApiError(429, "email_rate_limit", "请稍后再获取验证码。")
        recent = session.execute(select(RateEvent.created_at).where(RateEvent.scope == scope, RateEvent.created_at > now() - timedelta(hours=1)).order_by(RateEvent.created_at.desc())).scalars().all()
        if len(recent) >= 5 or recent and recent[0] > now() - timedelta(seconds=60):
            raise ApiError(429, "email_rate_limit", "请稍后再获取验证码。")
        session.add_all([RateEvent(scope=scope), RateEvent(scope=ip_scope), RateEvent(scope="email-global")])
        challenge_id, code = new_id(), f"{secrets.randbelow(1_000_000):06d}"
        challenge = None
        if email in settings.invited_emails:
            # New code invalidates any previously active challenge for this address.
            session.execute(update(Challenge).where(Challenge.email == email, Challenge.consumed.is_(False)).values(consumed=True))
            challenge = Challenge(id=challenge_id, email=email, verifier=code_verifier(settings, challenge_id, email, code), expires_at=now() + timedelta(minutes=10))
            session.add(challenge)
        session.commit()
        if challenge:
            try:
                async with asyncio.timeout(10):
                    await mailer(challenge_id, email, code)
                session.execute(update(Challenge).where(Challenge.id == challenge_id, Challenge.consumed.is_(False)).values(delivered=True))
                session.commit()
            except Exception:
                session.rollback()
                # Uniform response; undelivered challenges can never authenticate.
        return {"challengeId": challenge_id}

    @app.post("/api/auth/verify")
    async def auth_verify(request: Request, session=Depends(db)):
        origin(request)
        data = await body(request, ("challengeId", "code"), limit=1024)
        challenge_id = uuid_string(data["challengeId"])
        code = data["code"]
        invalid = ApiError(401, "email_code_invalid", "邮箱或验证码不可用。")
        if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code):
            raise invalid
        challenge = session.execute(select(Challenge).where(Challenge.id == challenge_id).with_for_update()).scalar_one_or_none()
        if not challenge or challenge.consumed or not challenge.delivered or challenge.expires_at <= now() or challenge.attempts >= 5 or challenge.email not in settings.invited_emails:
            raise invalid
        challenge.attempts += 1
        if not hmac.compare_digest(challenge.verifier, code_verifier(settings, challenge.id, challenge.email, code)):
            session.commit()
            raise invalid
        challenge.consumed = True
        user = session.execute(select(User).where(User.email == challenge.email)).scalar_one_or_none()
        if user is None:
            user = User(id=new_id(), email=challenge.email)
            session.add(user)
            team = Team(id=new_id(), name="我的研究团队")
            session.add(team)
            session.flush()
            session.add(Member(team_id=team.id, user_id=user.id, role="owner"))
        token, csrf = random_token(), random_token()
        session.add(Session(token_hash=keyed(settings, "session/v1", token), user_id=user.id, csrf=csrf, expires_at=now() + timedelta(days=30)))
        session.commit()
        response = JSONResponse({"authenticated": True, "user": {"id": user.id, "email": user.email}, "csrfToken": csrf, "mode": settings.mode})
        response.set_cookie(settings.cookie_name, token, httponly=True, secure=settings.mode == "production", samesite="strict", path="/", max_age=30 * 86400)
        return response

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, user=Depends(auth), session=Depends(db)):
        _, row = session_user(request, session)
        row.revoked_at = now()
        session.commit()
        response = Response(status_code=204)
        response.delete_cookie(settings.cookie_name, path="/", secure=settings.mode == "production", httponly=True, samesite="strict")
        return response

    @app.get("/api/teams")
    def teams(user=Depends(auth), session=Depends(db)):
        rows = session.execute(select(Team, Member.role).join(Member).where(Member.user_id == user.id)).all()
        return {"teams": [{"id": t.id, "name": t.name, "role": role} for t, role in rows]}

    @app.get("/api/teams/{team_id}/members")
    def members(team_id: str, user=Depends(auth), session=Depends(db)):
        membership(session, user, team_id, owner=True)
        rows = session.execute(select(User, Member.role).join(Member).where(Member.team_id == team_id)).all()
        return {"members": [{"userId": u.id, "email": u.email, "role": role} for u, role in rows]}

    @app.post("/api/teams/{team_id}/members", status_code=201)
    async def add_member(team_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("email", "role"), limit=1024)
        membership(session, user, team_id, owner=True)
        session.execute(select(Team).where(Team.id == team_id).with_for_update()).scalar_one()
        try:
            email = normalize_email(data["email"])
        except ValueError:
            raise ApiError() from None
        if data["role"] not in ("editor", "reviewer", "viewer"):
            raise ApiError()
        other = session.execute(select(User).where(User.email == email)).scalar_one_or_none() if email in settings.invited_emails else None
        if other is None:
            raise ApiError(404, "not_found", "账号不可添加。")
        member = session.get(Member, (team_id, other.id))
        if member and member.role == "owner":
            raise ApiError(409, "owner_protected", "不能修改所有者身份。")
        if member:
            member.role = data["role"]
        else:
            session.add(Member(team_id=team_id, user_id=other.id, role=data["role"]))
        session.commit()
        return {"userId": other.id, "email": other.email, "role": data["role"]}

    @app.delete("/api/teams/{team_id}/members/{user_id}", status_code=204)
    def remove_member(team_id: str, user_id: str, user=Depends(auth), session=Depends(db)):
        membership(session, user, team_id, owner=True)
        uuid_string(user_id)
        session.execute(select(Team).where(Team.id == team_id).with_for_update()).scalar_one()
        member = session.get(Member, (team_id, user_id))
        if not member:
            raise ApiError(404, "not_found", "资源不存在。")
        if member.role == "owner":
            raise ApiError(409, "owner_protected", "不能移除所有者。")
        session.delete(member)
        session.commit()
        return Response(status_code=204)

    @app.get("/api/projects")
    def projects(user=Depends(auth), session=Depends(db)):
        rows = session.execute(select(Project).join(Member, Member.team_id == Project.team_id).where(Member.user_id == user.id).order_by(Project.created_at.desc())).scalars().all()
        return {"projects": [project_view(p) for p in rows]}

    @app.post("/api/projects", status_code=201)
    async def create_project(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("title", "teamId", "idempotencyKey"), limit=2048)
        membership(session, user, data["teamId"], edit=True)
        lock_user(session, user)
        op, repeated = operation(session, user, "projects", data)
        if repeated:
            return op.response
        title = text(data["title"], 160, 1).strip()
        if not title:
            raise ApiError()
        p = Project(id=new_id(), team_id=data["teamId"], title=title)
        session.add(p)
        session.flush()
        op.response = project_view(p)
        session.commit()
        return op.response

    @app.get("/api/projects/{project_id}")
    def get_project(project_id: str, user=Depends(auth), session=Depends(db)):
        p, role = owned_project(session, user, project_id)
        return {"project": project_view(p), "membershipRole": role}

    @app.get("/api/services")
    def services(user=Depends(auth), session=Depends(db)):
        return {"services": [config_view(s) for s in session.execute(select(Service).where(Service.user_id == user.id, Service.deleted.is_(False))).scalars()]}

    @app.post("/api/services", status_code=201)
    async def create_service(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("label", "provider", "baseUrl", "model", "maxOutputTokens", "capabilities", "apiKey", "idempotencyKey"), limit=8192)
        lock_user(session, user)
        op, repeated = operation(session, user, "services", data)
        if repeated:
            return op.response
        config = settings_input(data)
        if session.scalar(select(func.count()).select_from(Service).where(Service.user_id == user.id, Service.deleted.is_(False))) >= 8:
            raise ApiError(409, "service_limit", "最多保存8个服务。")
        s = Service(id=new_id(), user_id=user.id, revision=1, **config)
        encrypt(settings, s, data["apiKey"])
        session.add(s)
        op.response = config_view(s)
        session.commit()
        return op.response

    @app.put("/api/services/{service_id}")
    async def edit_service(service_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("label", "provider", "baseUrl", "model", "maxOutputTokens", "capabilities", "expectedRevision", "idempotencyKey"), ("apiKey",), limit=8192)
        lock_user(session, user)
        uuid_string(service_id)
        op, repeated = operation(session, user, "service:" + service_id, data)
        if repeated:
            return op.response
        s = owned_service(session, user, service_id, lock=True)
        if integer(data["expectedRevision"], 1) != s.revision:
            raise ApiError(409, "revision_conflict", "配置已变化，请刷新。")
        if s.revision >= 2_147_483_647:
            raise ApiError(409, "version_limit", "服务版本上限已达到，请新建配置。")
        config = settings_input(data)
        if (config["provider"] != s.provider or config["base_url"] != s.base_url) and "apiKey" not in data:
            raise ApiError(422, "new_key_required", "改变服务地址必须重新提供密钥。")
        key = data.get("apiKey") or decrypt(settings, s)
        for name, value in config.items():
            setattr(s, name, value)
        s.revision += 1
        encrypt(settings, s, key)
        op.response = config_view(s)
        session.commit()
        return op.response

    @app.delete("/api/services/{service_id}", status_code=204)
    async def remove_service(service_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("expectedRevision", "idempotencyKey"), limit=1024)
        lock_user(session, user)
        op, repeated = operation(session, user, "delete-service:" + service_id, data)
        if repeated:
            return Response(status_code=204)
        s = owned_service(session, user, service_id, lock=True)
        if integer(data["expectedRevision"], 1) != s.revision:
            raise ApiError(409, "revision_conflict", "配置已变化，请刷新。")
        s.deleted, s.ciphertext, s.iv = True, b"", b""
        op.response = {"deleted": True}
        session.commit()
        return Response(status_code=204)

    @app.get("/api/projects/{project_id}/questionnaire")
    def get_questionnaire(project_id: str, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id)
        v = session.execute(select(Version).where(Version.project_id == p.id, Version.revision == p.questionnaire_revision)).scalar_one_or_none()
        return {"questionnaire": head(v) if v else None}

    @app.get("/api/projects/{project_id}/questionnaire/versions")
    def get_versions(project_id: str, beforeRevision: int | None = None, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id)
        query = select(Version).where(Version.project_id == p.id)
        if beforeRevision is not None:
            query = query.where(Version.revision < integer(beforeRevision, 1))
        versions = session.execute(query.order_by(Version.revision.desc()).limit(101)).scalars().all()
        page = versions[:100]
        return {"versions": [{"id": v.id, "revision": v.revision, "createdAt": iso(v.created_at), "createdBy": v.created_by, "title": v.design["title"]} for v in page],
                "nextBeforeRevision": page[-1].revision if len(versions) > 100 else None}

    @app.get("/api/projects/{project_id}/questionnaire/versions/{version_id}")
    def get_version(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id)
        uuid_string(version_id)
        v = session.execute(select(Version).where(Version.project_id == p.id, Version.id == version_id)).scalar_one_or_none()
        if not v:
            raise ApiError(404, "not_found", "版本不存在。")
        return {"id": v.id, "revision": v.revision, "createdAt": iso(v.created_at), "createdBy": v.created_by, "design": v.design}

    @app.post("/api/projects/{project_id}/questionnaire/versions", status_code=201)
    async def save_questionnaire(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("design", "expectedRevision", "idempotencyKey"), ("sourceProposalId",))
        p, _ = owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = operation(session, user, "questionnaire:" + p.id, data)
        if repeated:
            return op.response
        expected = integer(data["expectedRevision"], 0)
        if expected != p.questionnaire_revision:
            raise ApiError(409, "revision_conflict", "问卷版本已变化，请保留本地修改后刷新。")
        if expected >= 2_147_483_647 or p.revision >= 2_147_483_647:
            raise ApiError(409, "version_limit", "项目版本上限已达到。")
        design = questionnaire(data["design"])
        source = data.get("sourceProposalId")
        if source is not None:
            uuid_string(source)
            proposal = session.execute(select(Proposal).where(Proposal.id == source, Proposal.user_id == user.id, Proposal.project_id == p.id)).scalar_one_or_none()
            if not proposal:
                raise ApiError(404, "not_found", "建议不存在。")
            if proposal.status != "ready" or proposal.input_revision != expected:
                raise ApiError(409, "stale_proposal", "建议基于旧版本，不能用来替换当前问卷。")
        v = Version(id=new_id(), project_id=p.id, revision=expected + 1, created_by=user.id, design=design, design_hash=fingerprint(design), source_proposal_id=source)
        session.add(v)
        p.questionnaire_revision += 1
        p.revision += 1
        session.flush()
        op.response = head(v)
        session.commit()
        return op.response

    def expire_pending(session, user):
        session.execute(update(Proposal).where(Proposal.user_id == user.id, Proposal.status == "running", Proposal.created_at < now() - timedelta(seconds=settings.proposal_stale_seconds)).values(status="outcome_unknown", error_code="interrupted_call", finished_at=now()))

    @app.post("/api/projects/{project_id}/proposals", status_code=201)
    async def generate_proposal(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id, edit=True)
        data = await body(request, ("serviceId", "serviceRevision", "brief", "expectedQuestionnaireRevision", "idempotencyKey", "consent"), limit=32768)
        key_id = uuid_string(data["idempotencyKey"])
        digest = keyed(settings, "proposal-consent/v1", canonical(data))
        lock_user(session, user)
        expire_pending(session, user)
        old = session.execute(select(Proposal).where(Proposal.project_id == p.id, Proposal.user_id == user.id, Proposal.idempotency_key == key_id)).scalar_one_or_none()
        if old:
            if old.payload_hash != digest:
                raise ApiError(409, "idempotency_conflict", "操作标识已用于不同请求。")
            session.commit()
            return proposal_view(old)
        if data["consent"] is not True:
            raise ApiError(422, "consent_required", "生成前需要明确确认外部调用。")
        s = owned_service(session, user, data["serviceId"])
        if integer(data["serviceRevision"], 1) != s.revision:
            raise ApiError(409, "revision_conflict", "服务配置已变化。")
        if "questionnaire" not in s.capabilities:
            raise ApiError(422, "capability_unavailable", "此服务未启用问卷能力。")
        # Re-read the project after the per-user lock; question head must be current at reservation.
        p, _ = owned_project(session, user, project_id, edit=True, lock=True)
        if integer(data["expectedQuestionnaireRevision"], 0) != p.questionnaire_revision:
            raise ApiError(409, "revision_conflict", "问卷版本已变化。")
        brief = text(data["brief"], 8000, 1)
        if not brief.strip():
            raise ApiError()
        if session.scalar(select(func.count()).select_from(Proposal).where(Proposal.user_id == user.id, Proposal.status == "running")):
            raise ApiError(429, "call_active", "已有生成请求正在处理。")
        if session.scalar(select(func.count()).select_from(Proposal).where(Proposal.user_id == user.id, Proposal.created_at > now() - timedelta(hours=1))) >= 12:
            raise ApiError(429, "call_rate_limit", "每小时最多12次生成请求。")
        config, key = config_view(s), decrypt(settings, s)
        if key in brief:
            raise ApiError(422, "sensitive_input", "研究需求不能包含服务密钥。")
        reserved = Proposal(id=new_id(), user_id=user.id, project_id=p.id, service_id=s.id, service_revision=s.revision,
                            input_revision=p.questionnaire_revision, idempotency_key=key_id, payload_hash=digest,
                            status="running", dispatched_at=now())
        session.add(reserved)
        session.commit()  # Durable reservation BEFORE external I/O; never replay automatically.
        design, failure = None, None
        try:
            async with asyncio.timeout(30):
                raw = await generator(config, key, brief)
                if not isinstance(raw, str) or key in raw:
                    raise ProviderFailure("invalid_response")
                design = parse_proposal(raw)
        except ProviderFailure as error:
            failure = error
        except (TimeoutError, asyncio.CancelledError):
            failure = ProviderFailure("provider_timeout", unknown=True)
        except Exception:
            failure = ProviderFailure("provider_failure", unknown=True)
        finally:
            key = ""  # Never retain credentials in task state or database response.
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {"user_id": user.id})
        result = session.execute(select(Proposal).where(Proposal.id == reserved.id).with_for_update().execution_options(populate_existing=True)).scalar_one()
        if result.status == "running":
            result.status = "outcome_unknown" if failure and failure.unknown else "failed" if failure else "ready"
            result.error_code = failure.code if failure else None
            result.design, result.finished_at = design, now()
        session.commit()
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {"user_id": user.id})
        session_user(request, session)  # Session/membership revoked during I/O cannot receive a response.
        owned_project(session, user, project_id)
        return proposal_view(result)

    @app.get("/api/projects/{project_id}/proposals")
    def get_proposals(project_id: str, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id)
        expire_pending(session, user)
        results = session.execute(select(Proposal).where(Proposal.project_id == p.id, Proposal.user_id == user.id)
                                  .order_by(Proposal.created_at.desc(), Proposal.id.desc()).limit(50)).scalars().all()
        session.commit()
        summaries = []
        for result in results:
            summary = proposal_view(result)
            design = summary.pop("design", None)
            summary["title"] = design["title"] if design else ""
            summaries.append(summary)
        return {"proposals": summaries}

    @app.get("/api/projects/{project_id}/proposals/{proposal_id}")
    def get_proposal(project_id: str, proposal_id: str, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id)
        uuid_string(proposal_id)
        expire_pending(session, user)
        result = session.execute(select(Proposal).where(Proposal.id == proposal_id, Proposal.project_id == p.id, Proposal.user_id == user.id)).scalar_one_or_none()
        if not result:
            raise ApiError(404, "not_found", "建议不存在。")
        session.commit()
        return proposal_view(result)

    # ───────────── 硅基样本 · simulated respondents ─────────────
    def expire_silicon(session, user):
        session.execute(update(SiliconRun).where(SiliconRun.user_id == user.id, SiliconRun.status == "running", SiliconRun.updated_at < now() - timedelta(seconds=settings.silicon_stale_seconds)).values(status="outcome_unknown", error_code="interrupted_run", finished_at=now()))

    def scoped(session, user_id):
        session.execute(sql_text("SELECT set_config('evix.user_id', :user_id, true)"), {"user_id": user_id})

    async def silicon_unit(plan, persona, scenario, service, dead):
        """Run one persona × scenario × model; returns (response, provider calls). Never raises."""
        meta, config, key = service
        design, calls = plan["design"], 0
        response = {"personaId": persona["id"], "scenarioId": scenario["id"] if scenario else "base", "model": meta["name"], "status": "ok", "answers": []}

        async def ask(message, spec):
            nonlocal calls
            if meta["serviceId"] in dead:
                raise ProviderFailure(dead[meta["serviceId"]])
            calls += 1
            try:
                async with asyncio.timeout(settings.silicon_call_seconds):
                    raw = await generator.answer(config, key, message, spec)
            except ProviderFailure as error:
                if error.code in ("authentication_failed", "redirect_blocked", "input_too_large"):
                    dead[meta["serviceId"]] = error.code  # Further calls to this service cannot succeed.
                raise
            except (TimeoutError, asyncio.TimeoutError):
                raise ProviderFailure("provider_timeout", unknown=True) from None
            if not isinstance(raw, str) or key in raw:
                raise ProviderFailure("invalid_response")
            return raw
        try:
            if plan["memory"] == "carry":
                raw = await ask(silicon.carry_prompt(plan, persona, scenario), {"mode": "carry", "questions": [silicon.question_spec(q) for q in design["questions"]]})
                response["answers"] = silicon.assemble_carry(design, silicon.parse_carry(raw, design))
            else:
                answers = {}
                for question in design["questions"]:
                    shown = silicon.is_shown(question, answers)
                    value, unclear = (None, "")
                    if shown:
                        value, unclear = silicon.parse_single(await ask(silicon.single_prompt(plan, persona, scenario, question, answers), {"mode": "single", "questions": [silicon.question_spec(question)]}))
                    answers[question["id"]] = silicon.make_answer(question, shown, value, unclear)
                response["answers"] = [answers[q["id"]] for q in design["questions"]]
        except ProviderFailure as error:
            # A timeout or 5xx may still have been processed (and billed) by the supplier: keep that
            # uncertainty instead of reporting a plain failure.
            response.update(status="outcome_unknown" if error.unknown else "failed", answers=[], error=error.code)
        except ApiError:
            response.update(status="failed", answers=[], error="invalid_response")
        except Exception:
            response.update(status="failed", answers=[], error="provider_failure")
        return response, calls

    async def silicon_worker(run_id, user_id, plan, services):
        stop, dead, lock = asyncio.Event(), {}, asyncio.Semaphore(settings.silicon_concurrency)
        per_unit = len(plan["design"]["questions"]) if plan["memory"] == "independent" else 1

        def persist(response):
            with DBSession(engine, expire_on_commit=False) as session:
                scoped(session, user_id)
                row = session.execute(select(SiliconRun).where(SiliconRun.id == run_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
                if row is None or row.status != "running":
                    stop.set()  # Cancelled or expired: keep what is stored, schedule nothing more.
                    return
                row.responses = [*row.responses, response]
                row.done, row.updated_at = min(row.total, row.done + per_unit), now()
                session.commit()

        async def unit(persona, scenario, service):
            async with lock:
                if stop.is_set():
                    return
                response, _ = await silicon_unit(plan, persona, scenario, service, dead)
                await asyncio.to_thread(persist, response)

        try:
            await asyncio.gather(*(unit(p, sc, sv) for p in plan["personas"] for sc in (plan["scenarios"] or [None]) for sv in services))

            def finish():
                with DBSession(engine, expire_on_commit=False) as session:
                    scoped(session, user_id)
                    row = session.execute(select(SiliconRun).where(SiliconRun.id == run_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
                    if row is not None and row.status == "running":
                        failed = sum(r["status"] == "failed" for r in row.responses)
                        unknown = sum(r["status"] == "outcome_unknown" for r in row.responses)
                        # A run with unreconciled calls never reads as a success, even when other units answered.
                        if row.responses and failed == len(row.responses):
                            row.status = "failed"
                        else:
                            row.status = "outcome_unknown" if unknown else "ready"
                        row.error_code = "unreconciled_calls" if unknown else next((r["error"] for r in row.responses if r["status"] == "failed"), None) if failed else None
                        row.done, row.finished_at, row.updated_at = row.total, now(), now()
                        session.commit()
            await asyncio.to_thread(finish)
        finally:
            services.clear()  # Drop decrypted keys with the task.

    @app.post("/api/projects/{project_id}/silicon-runs", status_code=202)
    async def start_silicon_run(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id, edit=True)
        data = await body(request, ("design", "attributes", "personas", "scenarios", "memory", "shuffleOptions", "services", "expectedCalls", "idempotencyKey", "consent"), limit=400_000)
        key_id = uuid_string(data["idempotencyKey"])
        digest = keyed(settings, "silicon-consent/v1", canonical(data))
        lock_user(session, user)
        expire_silicon(session, user)
        old = session.execute(select(SiliconRun).where(SiliconRun.project_id == p.id, SiliconRun.user_id == user.id, SiliconRun.idempotency_key == key_id)).scalar_one_or_none()
        if old:
            if old.payload_hash != digest:
                raise ApiError(409, "idempotency_conflict", "操作标识已用于不同请求。")
            session.commit()
            return silicon_view(old)
        if data["consent"] is not True:
            raise ApiError(422, "consent_required", "运行前需要明确确认外部调用。")
        if not callable(getattr(generator, "answer", None)):
            raise ApiError(503, "capability_unavailable", "当前部署未启用硅基样本。")
        plan = silicon.silicon_plan(data)
        refs = data["services"]
        if not isinstance(refs, list) or not 1 <= len(refs) <= silicon.LIMITS["services"]:
            raise ApiError()
        chosen = []
        for ref in refs:
            r = object_fields(ref, ("serviceId", "serviceRevision"))
            s = owned_service(session, user, r["serviceId"])
            if any(s.id == c.id for c in chosen):
                raise ApiError()
            if integer(r["serviceRevision"], 1) != s.revision:
                raise ApiError(409, "revision_conflict", "服务配置已变化。")
            if "research" not in s.capabilities:
                raise ApiError(422, "capability_unavailable", "所选服务未启用研究能力。")
            chosen.append(s)
        total = silicon.planned_calls(plan, len(chosen))
        if total > settings.silicon_max_calls:
            raise ApiError(422, "run_too_large", f"本次运行需要 {total} 次模型调用，超过上限 {settings.silicon_max_calls}。")
        if integer(data["expectedCalls"], 1, 1000) != total:
            raise ApiError(409, "estimate_conflict", "调用次数估计已变化，请重新确认。")
        p, _ = owned_project(session, user, project_id, edit=True, lock=True)
        if session.scalar(select(func.count()).select_from(SiliconRun).where(SiliconRun.user_id == user.id, SiliconRun.status == "running")):
            raise ApiError(429, "call_active", "已有硅基样本运行正在进行。")
        if session.scalar(select(func.count()).select_from(SiliconRun).where(SiliconRun.user_id == user.id, SiliconRun.created_at > now() - timedelta(hours=1))) >= settings.silicon_hourly_runs:
            raise ApiError(429, "call_rate_limit", f"每小时最多 {settings.silicon_hourly_runs} 次硅基样本运行。")
        names, services = [], []
        for s in chosen:
            config, key = config_view(s), decrypt(settings, s)
            if key in canonical(plan):
                raise ApiError(422, "sensitive_input", "画像或问卷内容不能包含服务密钥。")
            name = f"{s.label} · {s.model}"
            name = name if name not in names else f"{name} #{names.count(name) + 1}"
            names.append(name)
            services.append(({"serviceId": s.id, "serviceRevision": s.revision, "name": name}, config, key))
        run = SiliconRun(id=new_id(), user_id=user.id, project_id=p.id, idempotency_key=key_id, payload_hash=digest, status="running",
                         services=[meta for meta, _, _ in services], plan=plan, total=total, done=0, responses=[])
        session.add(run)
        session.commit()  # Durable reservation BEFORE any provider call; never replayed automatically.
        task = asyncio.create_task(silicon_worker(run.id, user.id, plan, services))
        app.state.silicon_tasks.add(task)
        task.add_done_callback(app.state.silicon_tasks.discard)
        return silicon_view(run)

    @app.get("/api/projects/{project_id}/silicon-runs")
    def list_silicon_runs(project_id: str, user=Depends(auth), session=Depends(db)):
        p, _ = owned_project(session, user, project_id)
        expire_silicon(session, user)
        rows = session.execute(select(SiliconRun).where(SiliconRun.project_id == p.id, SiliconRun.user_id == user.id)
                               .order_by(SiliconRun.created_at.desc(), SiliconRun.id.desc()).limit(30)).scalars().all()
        session.commit()
        # Limits let the browser warn before a request the server would refuse.
        return {"runs": [silicon_view(row) for row in rows],
                "limits": {"maxCalls": settings.silicon_max_calls, "hourlyRuns": settings.silicon_hourly_runs, "maxServices": silicon.LIMITS["services"]}}

    def silicon_row(session, user, project_id, run_id, lock=False):
        p, _ = owned_project(session, user, project_id)
        uuid_string(run_id)
        expire_silicon(session, user)
        query = select(SiliconRun).where(SiliconRun.id == run_id, SiliconRun.project_id == p.id, SiliconRun.user_id == user.id).execution_options(populate_existing=True)
        row = session.execute(query.with_for_update() if lock else query).scalar_one_or_none()
        if not row:
            raise ApiError(404, "not_found", "运行记录不存在。")
        return row

    @app.get("/api/projects/{project_id}/silicon-runs/{run_id}")
    def get_silicon_run(project_id: str, run_id: str, user=Depends(auth), session=Depends(db)):
        row = silicon_row(session, user, project_id, run_id)
        session.commit()
        return silicon_view(row, full=True)

    @app.post("/api/projects/{project_id}/silicon-runs/{run_id}/cancel")
    def cancel_silicon_run(project_id: str, run_id: str, user=Depends(auth), session=Depends(db)):
        row = silicon_row(session, user, project_id, run_id, lock=True)
        if row.status == "running":
            # Calls already sent may still be billed; only unsent ones are skipped.
            row.status, row.error_code, row.finished_at, row.updated_at = "cancelled", "cancelled_by_user", now(), now()
        session.commit()
        return silicon_view(row, full=True)

    return app
