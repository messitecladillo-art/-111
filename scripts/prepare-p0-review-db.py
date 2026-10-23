"""Create an isolated synthetic review database; never drop or reuse it."""
import os
import re
import subprocess
import sys
from pathlib import Path
import psycopg
from psycopg import sql

name = sys.argv[1]
if not re.fullmatch(r'evix_p0_review_[a-z0-9_]{1,32}', name):
    raise SystemExit('Expected a named synthetic review database')
root = Path(__file__).resolve().parents[1]
owner = 'postgresql://evix_owner:local-p0-owner-only@127.0.0.1:55432/'
with psycopg.connect(owner + 'postgres', autocommit=True, connect_timeout=5) as connection:
    connection.execute(sql.SQL('CREATE DATABASE {} OWNER evix_owner ENCODING {}').format(sql.Identifier(name), sql.Literal('UTF8')))
with psycopg.connect(owner + name, autocommit=True, connect_timeout=5) as connection:
    connection.execute('GRANT USAGE ON SCHEMA public TO evix_app')
    connection.execute('ALTER DEFAULT PRIVILEGES FOR ROLE evix_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO evix_app')
    connection.execute('ALTER DEFAULT PRIVILEGES FOR ROLE evix_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO evix_app')
environment = dict(os.environ, EVIX_MIGRATION_DATABASE_URL=owner.replace('postgresql:', 'postgresql+psycopg:') + name)
subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], cwd=root / 'apps/backend', env=environment, check=True)
with psycopg.connect('postgresql://evix_app:local-p0-app-only@127.0.0.1:55432/' + name) as connection:
    row = connection.execute("SELECT current_user, (SELECT version_num FROM alembic_version), (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)").fetchone()
    assert row == ('evix_app', '0002_silicon_runs', False), row
print(f'{name}: migrations through 0002_silicon_runs verified with unprivileged evix_app')
