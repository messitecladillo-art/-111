import pytest
from sqlalchemy import text

pytestmark = pytest.mark.postgres


def test_memory_version_table_and_rls_exist(pg_engine):
    with pg_engine.connect() as connection:
        assert connection.execute(text("SELECT to_regclass('public.project_memory_versions')")).scalar()
        assert connection.execute(text(
            "SELECT relrowsecurity FROM pg_class WHERE relname='project_memory_versions'"
        )).scalar() is True
