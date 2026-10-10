import os
from alembic import context
from sqlalchemy import create_engine, pool
from evix_api.models import Base

def run_online(connection):
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


provided_connection = context.config.attributes.get("connection")
url = os.environ.get("EVIX_MIGRATION_DATABASE_URL", "")
if provided_connection is None and not url.startswith("postgresql+psycopg://"):
    raise RuntimeError("Explicit PostgreSQL migration owner URL required")
if context.is_offline_mode():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
elif provided_connection is not None:
    run_online(provided_connection)
else:
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        run_online(connection)
