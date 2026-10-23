import os
import secrets
from uuid import uuid4
from pathlib import Path
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from alembic import command
from alembic.config import Config
from infrastructure.settings import Settings
from evix_api.app import create_app
from application.providers import FixtureProvider
from fastapi.testclient import TestClient


@pytest.fixture
def settings(tmp_path):
    return Settings(mode="local_test", database_url="postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_p0_test",
                    allowed_origins=["http://localhost:3180"], invited_emails=["a@example.test", "b@example.test", "c@example.test"],
                    auth_secret=secrets.token_hex(32), keyring={"v1": secrets.token_hex(32)},
                    mail_mode="fixture", provider_mode="fixture", mailbox_dir=tmp_path / "mailbox")


@pytest.fixture
def pg_engine():
    url = os.getenv("EVIX_TEST_DATABASE_URL", "")
    if not url:
        pytest.skip("EVIX_TEST_DATABASE_URL required for actual PostgreSQL integration; no SQLite substitution")
    if not url.startswith("postgresql+psycopg://") or make_url(url).database != "evix_p0_test":
        pytest.fail("Integration tests require the explicitly synthetic evix_p0_test database")
    app_url = (make_url(os.environ["EVIX_TEST_APP_DATABASE_URL"]) if os.getenv("EVIX_TEST_APP_DATABASE_URL")
               else make_url(url).set(username="evix_app", password="local-p0-app-only"))
    if (app_url.database, app_url.host, app_url.port) != ("evix_p0_test", make_url(url).host, make_url(url).port):
        pytest.fail("Test app role must connect to the same explicitly synthetic database")
    schema = "test_" + uuid4().hex
    admin = create_engine(url)
    engine = create_engine(app_url, connect_args={"options": f"-csearch_path={schema},public"}, pool_pre_ping=True)
    try:
        with admin.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
            # Exercise the actual frozen migration, not create_all from current models.
            config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
            config.set_main_option("script_location", str(Path(__file__).parents[1] / "migrations"))
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            role = connection.dialect.identifier_preparer.quote(app_url.username)
            connection.execute(text(f'GRANT USAGE ON SCHEMA "{schema}" TO {role}'))
            connection.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "{schema}" TO {role}'))
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user")) is False
            assert connection.scalar(text("SELECT count(*) FROM pg_tables WHERE schemaname=current_schema() AND tableowner=current_user")) == 0
        yield engine
    finally:
        engine.dispose()
        # Cleanup only the generated schema in the explicitly synthetic database.
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def harness(settings, pg_engine):
    deliveries = {}

    async def mail(challenge_id, email, code):
        deliveries[challenge_id] = (email, code)

    provider = FixtureProvider()
    app = create_app(settings, mail=mail, provider=provider, engine=pg_engine)
    clients = []

    def login(email="a@example.test"):
        client = TestClient(app)
        response = client.post("/api/auth/code", headers={"origin": settings.allowed_origins[0]}, json={"email": email})
        assert response.status_code == 202, response.text
        cid = response.json()["challengeId"]
        response = client.post("/api/auth/verify", headers={"origin": settings.allowed_origins[0]}, json={"challengeId": cid, "code": deliveries[cid][1]})
        assert response.status_code == 200, response.text
        client.headers.update({"origin": settings.allowed_origins[0], "x-csrf-token": response.json()["csrfToken"]})
        clients.append(client)
        return client, response.json()

    yield app, login, deliveries, provider
    for client in clients:
        client.close()
