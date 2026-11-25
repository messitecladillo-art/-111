"""Runtime lifecycle, storage/provider wiring, and outermost ASGI error hygiene guard."""
import asyncio
from contextlib import asynccontextmanager
import json
import os
import re
from types import SimpleNamespace

from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text as sql_text

from application.providers import AuthoredProvider, FixtureProvider, LiveProvider
from evix_api.uploads.sav import TemporarySavImports
from evix_api.uploads.submission import TemporarySubmissionPreflights
from infrastructure.mail import FixtureMail, ResendMail
from infrastructure.settings import Settings

SCHEMA_REVISION = "0013_memory_recalled_event"

_SAFE_INTERNAL_MESSAGE = "当前操作暂未完成，请稍后手动核查状态，勿自动重复提交。"
_SAFE_REDACTED_MESSAGE = "当前请求暂时无法完成，请检查输入或稍后重试。"

_LEAK_TRACE_OR_URI_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://[^\s\"']+",
    re.IGNORECASE,
)
_LEAK_PATH_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
)
_LEAK_CLASS_RE = re.compile(
    r"\b(?:"
    r"SQLAlchemyError|OperationalError|IntegrityError|ProgrammingError|DBAPIError|InterfaceError"
    r"|RequestValidationError|StarletteHTTPException|ValidationError|PydanticUserError"
    r"|RuntimeError|ValueError|KeyError|TypeError|AttributeError|IndexError|ZeroDivisionError"
    r"|FileNotFoundError|PermissionError|OSError|ConnectionRefusedError"
    r")\b\s*:?"
)
_BRACKET_CLEAN_MAP: dict[int, str | None] = {
    0x300C: "“",
    0x300E: "“",
    0x300D: "”",
    0x300F: "”",
    0x3010: None,
    0x3011: None,
}


def sanitize_boundary_error_message(raw: object, *, fallback: str = _SAFE_REDACTED_MESSAGE) -> str:
    """Strip stack traces, DB URIs, local filesystem paths, and Python class names from error messages."""
    text = str(raw or "").strip()
    if not text:
        return fallback
    if _LEAK_TRACE_OR_URI_RE.search(text):
        return fallback
    had_leak = bool(_LEAK_PATH_RE.search(text) or _LEAK_CLASS_RE.search(text))
    cleaned = _LEAK_PATH_RE.sub("", text)
    cleaned = _LEAK_CLASS_RE.sub("", cleaned)
    cleaned = cleaned.translate(_BRACKET_CLEAN_MAP)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ：:;；,，.-")
    if not cleaned:
        return fallback
    if had_leak and not any("\u4e00" <= ch <= "\u9fff" for ch in cleaned):
        return fallback
    return cleaned


def _required_security_headers(path: str) -> dict[str, str]:
    headers = {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
    }
    if path.startswith("/api/"):
        headers["x-robots-tag"] = "noindex, nofollow, noarchive"
    return headers


class BoundaryErrorHygieneMiddleware:
    """Pure ASGI boundary ensuring all 4xx/5xx JSON responses carry security headers and zero internal leaks."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "")
        started_msg = None
        body_chunks: list[bytes] = []
        passthrough = True

        async def _send(message):
            nonlocal started_msg, passthrough
            mtype = message.get("type")
            if mtype == "http.response.start":
                status = int(message.get("status") or 200)
                raw_headers = list(message.get("headers") or [])
                seen_lower = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in raw_headers}
                for hk, hv in _required_security_headers(path).items():
                    if hk not in seen_lower:
                        raw_headers.append((hk.encode("latin-1"), hv.encode("latin-1")))
                message = {**message, "headers": raw_headers}
                ctype = seen_lower.get("content-type", "").lower()
                if status >= 400 and "application/json" in ctype:
                    passthrough = False
                    started_msg = message
                    return
                await send(message)
                return

            if mtype == "http.response.body" and not passthrough:
                body_chunks.append(bytes(message.get("body") or b""))
                if message.get("more_body", False):
                    return
                raw_bytes = b"".join(body_chunks)
                out_bytes = raw_bytes
                try:
                    parsed = json.loads(raw_bytes.decode("utf-8"))
                    if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
                        err_obj = dict(parsed["error"])
                        if "message" in err_obj:
                            err_obj["message"] = sanitize_boundary_error_message(err_obj.get("message"))
                        parsed = {**parsed, "error": err_obj}
                        out_bytes = json.dumps(parsed, ensure_ascii=False).encode("utf-8")
                except Exception:
                    out_bytes = raw_bytes

                assert started_msg is not None
                updated_headers = [
                    (k, v)
                    for k, v in started_msg.get("headers", [])
                    if k.decode("latin-1").lower() != "content-length"
                ]
                updated_headers.append((b"content-length", str(len(out_bytes)).encode("latin-1")))
                await send({**started_msg, "headers": updated_headers})
                await send({"type": "http.response.body", "body": out_bytes, "more_body": False})
                return

            await send(message)

        await self.app(scope, receive, _send)


def install_boundary_guard(app) -> None:
    """Attach outermost ASGI error scrubbing and harden 500 ServerErrorMiddleware security headers."""
    app.add_middleware(BoundaryErrorHygieneMiddleware)

    @app.exception_handler(Exception)
    async def hardened_internal_handler(request, error):
        return JSONResponse(
            {"error": {"code": "internal_error", "message": _SAFE_INTERNAL_MESSAGE}},
            status_code=500,
            headers=_required_security_headers(request.url.path),
        )


def create_runtime(settings=None, mail=None, provider=None, engine=None):
    settings = settings or Settings()
    if settings.mode == "production" and (mail is not None or provider is not None or engine is not None):
        raise ValueError("Production rejects injected fixtures")
    owns_engine = engine is None
    engine = engine or create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_timeout=3,
        connect_args={"connect_timeout": 3},
        echo=False,
        hide_parameters=True,
    )
    mailer = mail or (FixtureMail(settings.mailbox_dir) if settings.mail_mode == "fixture" else ResendMail(settings))
    generator = provider or (FixtureProvider() if settings.provider_mode == "fixture" else LiveProvider())
    # Local-test only: serve report sections authored offline by the coding agent (see AuthoredProvider).
    authored_dir = os.environ.get("EVIXLOCAL_AUTHORED_DIR", "").strip()
    if (
        provider is None
        and authored_dir
        and "\x00" not in authored_dir
        and settings.mode == "local_test"
        and settings.provider_mode == "live"
    ):
        generator = AuthoredProvider(authored_dir)
    sav_imports = TemporarySavImports(settings)
    preflights = TemporarySubmissionPreflights(settings)

    @asynccontextmanager
    async def lifespan(application):
        if settings.mode == "production":
            with engine.connect() as connection:
                privileged = connection.execute(
                    sql_text("SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user")
                ).scalar_one()
                owner = connection.execute(
                    sql_text("SELECT count(*) FROM pg_tables WHERE schemaname=current_schema() AND tableowner=current_user")
                ).scalar_one()
                revision = connection.execute(sql_text("SELECT version_num FROM alembic_version")).scalar_one()
                if privileged or owner or revision != SCHEMA_REVISION:
                    raise RuntimeError("API requires current migrations and an unprivileged non-owner database role")
        await sav_imports.sweep()
        await preflights.sweep()
        maintenance = asyncio.create_task(sav_imports.maintenance())
        preflight_maintenance = asyncio.create_task(preflights.maintenance())
        try:
            yield
        finally:
            maintenance.cancel()
            preflight_maintenance.cancel()
            await asyncio.gather(maintenance, preflight_maintenance, return_exceptions=True)
            await sav_imports.close()
            await preflights.close()
        loop = asyncio.get_running_loop()
        tasks = [task for task in application.state.silicon_tasks if task.get_loop() is loop]
        for task in tasks:
            task.cancel()  # Rows stay "running" and later read as outcome_unknown; nothing is replayed.
        await asyncio.gather(*tasks, return_exceptions=True)
        if owns_engine:
            engine.dispose()

    return SimpleNamespace(
        settings=settings,
        engine=engine,
        mailer=mailer,
        generator=generator,
        sav_imports=sav_imports,
        preflights=preflights,
        lifespan=lifespan,
    )
