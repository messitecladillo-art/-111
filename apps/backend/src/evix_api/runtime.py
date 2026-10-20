import asyncio
from contextlib import asynccontextmanager
from sqlalchemy import create_engine, text as sql_text
from infrastructure.settings import Settings
from application.providers import LiveProvider, FixtureProvider
from infrastructure.mail import FixtureMail, ResendMail
from evix_api.uploads.sav import TemporarySavImports
from evix_api.uploads.submission import TemporarySubmissionPreflights

from types import SimpleNamespace

SCHEMA_REVISION = "0009_agent_task_collaboration"

def create_runtime(settings=None, mail=None, provider=None, engine=None):
    settings = settings or Settings()
    if settings.mode == "production" and (mail is not None or provider is not None or engine is not None):
        raise ValueError("Production rejects injected fixtures")
    owns_engine = engine is None
    engine = engine or create_engine(settings.database_url, pool_pre_ping=True, pool_size=5, max_overflow=5,
                                     pool_timeout=3, connect_args={"connect_timeout": 3}, echo=False)
    mailer = mail or (FixtureMail(settings.mailbox_dir) if settings.mail_mode == "fixture" else ResendMail(settings))
    generator = provider or (FixtureProvider() if settings.provider_mode == "fixture" else LiveProvider())
    sav_imports = TemporarySavImports(settings)
    preflights = TemporarySubmissionPreflights(settings)

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
    return SimpleNamespace(settings=settings, engine=engine, mailer=mailer, generator=generator, sav_imports=sav_imports, preflights=preflights, lifespan=lifespan)
