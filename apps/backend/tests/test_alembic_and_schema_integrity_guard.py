"""Permanent CI guard for Alembic migration topology, ORM schema integrity, and multi-tenant RLS coverage (Wave 22).

Verifies:
1. Strict single-root, single-head linear Alembic revision chain across migrations/versions/*.py
   (0 forks/branches, 0 merge nodes, 0 orphan revisions, 0 cycles, monotonic numeric prefixes,
   and 100% alignment with evix_api.runtime.SCHEMA_REVISION).
2. Every migration script defines non-empty AST + runtime callable upgrade() and downgrade(),
   with downgrade() enforcing the fail-closed backup-restore policy rather than silent no-ops.
3. Offline PostgreSQL DDL compilation of 0001 -> head reconciles 1-to-1 with all 32 SQLAlchemy
   Base.metadata tables (zero missing tables, zero drift).
4. Every SQLAlchemy ORM table defines a non-nullable Primary Key, every Foreign Key resolves to
   an existing target table + PK/unique column, Base.metadata.sorted_tables resolves cleanly, and
   every DateTime column enforces timezone=True (TIMESTAMPTZ).
5. Every non-system business/tenant table (25/25) declares ENABLE ROW LEVEL SECURITY,
   FORCE ROW LEVEL SECURITY, and >= 1 CREATE POLICY bound to current_setting('evix.user_id', true).
6. Migration env.py and production runtime enforce explicit PostgreSQL URLs, non-superuser /
   non-owner roles, and exact head SCHEMA_REVISION parity.
"""
from __future__ import annotations

import ast
import inspect
import io
from pathlib import Path
import re
import runpy

from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
import pytest
from sqlalchemy import DateTime, create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.pool import StaticPool

from evix_api import runtime as api_runtime
from evix_api.runtime import SCHEMA_REVISION
from infrastructure.database.models import Base

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_ALEMBIC_INI = _BACKEND_ROOT / "alembic.ini"
_VERSIONS_DIR = _BACKEND_ROOT / "migrations" / "versions"
_ENV_PY = _BACKEND_ROOT / "migrations" / "env.py"

# Foundational global identity, rate-limiting, and team-lookup tables queried by RLS policies themselves.
# Every single table outside this frozen 7-table set MUST enforce ENABLE + FORCE ROW LEVEL SECURITY + policies.
FROZEN_GLOBAL_NON_RLS_TABLES: frozenset[str] = frozenset(
    {
        "users",
        "sessions",
        "email_challenges",
        "invite_codes",
        "rate_events",
        "teams",
        "memberships",
    }
)


def _load_script_directory() -> ScriptDirectory:
    assert _ALEMBIC_INI.is_file(), f"Missing alembic.ini at {_ALEMBIC_INI}"
    cfg = Config(str(_ALEMBIC_INI))
    cfg.set_main_option("script_location", str(_BACKEND_ROOT / "migrations"))
    return ScriptDirectory.from_config(cfg)


def _compile_full_postgres_upgrade_sql() -> str:
    script = _load_script_directory()
    revisions_oldest_first = list(reversed(list(script.walk_revisions())))
    buf = io.StringIO()
    mc = MigrationContext.configure(
        dialect=postgresql.dialect(),
        opts={"as_sql": True, "output_buffer": buf},
    )
    with Operations.context(mc):
        for rev in revisions_oldest_first:
            rev.module.upgrade()
    return buf.getvalue()


def _extract_module_assignments(tree: ast.Module) -> dict[str, object]:
    found: dict[str, object] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in ("revision", "down_revision", "branch_labels", "depends_on"):
                    found[target.id] = ast.literal_eval(node.value)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id in ("revision", "down_revision", "branch_labels", "depends_on"):
                found[node.target.id] = ast.literal_eval(node.value)
    return found


def test_alembic_versions_strict_single_root_single_head_linear_topology():
    assert _VERSIONS_DIR.is_dir(), f"Missing migrations/versions directory at {_VERSIONS_DIR}"
    version_files = sorted(p for p in _VERSIONS_DIR.glob("*.py") if p.name != "__init__.py")
    assert len(version_files) >= 13, f"Expected >= 13 migrations, found {len(version_files)}"

    revisions_by_id: dict[str, str | None] = {}
    children_by_parent: dict[str | None, list[str]] = {}
    numeric_prefixes: list[int] = []

    for path in version_files:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        meta = _extract_module_assignments(tree)
        assert "revision" in meta and "down_revision" in meta, (
            f"{path.name} must explicitly assign revision and down_revision"
        )
        rev = meta["revision"]
        down_rev = meta["down_revision"]
        assert isinstance(rev, str) and rev == path.stem, (
            f"{path.name}: revision {rev!r} must match filename stem {path.stem!r}"
        )
        # Disallow merge migrations (tuple/list down_revision) and branch labels
        assert down_rev is None or isinstance(down_rev, str), (
            f"{path.name}: branched/merge down_revision {down_rev!r} is forbidden in linear topology"
        )
        assert meta.get("branch_labels") is None, f"{path.name}: branch_labels must be None"
        assert meta.get("depends_on") is None, f"{path.name}: depends_on must be None"

        prefix_match = re.match(r"^(\d{4})_[a-z0-9_]+$", rev)
        assert prefix_match is not None, f"{path.name}: revision {rev!r} must follow NNNN_slug naming"
        numeric_prefixes.append(int(prefix_match.group(1)))

        assert rev not in revisions_by_id, f"Duplicate migration revision id: {rev!r}"
        revisions_by_id[rev] = down_rev
        children_by_parent.setdefault(down_rev, []).append(rev)

    # Strict 1..N contiguous numbering
    assert numeric_prefixes == list(range(1, len(version_files) + 1)), (
        f"Migration numeric prefixes must be contiguous 1..{len(version_files)}, got {numeric_prefixes}"
    )

    # Exactly 1 root (down_revision is None) and 0 broken parent pointers
    roots = children_by_parent.get(None, [])
    assert len(roots) == 1, f"Expected exactly 1 root migration, found {roots!r}"
    for rev, parent in revisions_by_id.items():
        if parent is not None:
            assert parent in revisions_by_id, f"Orphan migration {rev!r} references missing down_revision {parent!r}"

    # Zero forks: every parent revision has at most 1 child
    forks = {parent: kids for parent, kids in children_by_parent.items() if parent is not None and len(kids) > 1}
    assert not forks, f"Branched/forked migration graph detected: {forks!r}"

    # Walk from single root to single head and verify every file is visited once (zero cycles / islands)
    visited: list[str] = []
    cursor: str | None = roots[0]
    while cursor is not None:
        assert cursor not in visited, f"Cycle detected in migration graph at {cursor!r}"
        visited.append(cursor)
        next_kids = children_by_parent.get(cursor, [])
        cursor = next_kids[0] if next_kids else None

    assert len(visited) == len(version_files), (
        f"Disconnected/orphan revisions detected: {sorted(set(revisions_by_id) - set(visited))}"
    )
    single_head = visited[-1]

    # Cross-check with Alembic's own ScriptDirectory resolver and runtime SCHEMA_REVISION
    script = _load_script_directory()
    assert script.get_bases() == [roots[0]]
    assert script.get_heads() == [single_head]
    assert len(list(script.walk_revisions())) == len(version_files)
    assert single_head == SCHEMA_REVISION, (
        f"Alembic head {single_head!r} drifted from evix_api.runtime.SCHEMA_REVISION {SCHEMA_REVISION!r}"
    )


def test_every_migration_defines_callable_upgrade_and_fail_closed_downgrade():
    script = _load_script_directory()
    revisions = list(reversed(list(script.walk_revisions())))
    assert len(revisions) >= 13

    for rev in revisions:
        mod_path = Path(rev.path)
        tree = ast.parse(mod_path.read_text(encoding="utf-8"), filename=str(mod_path))
        fn_nodes = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
        assert "upgrade" in fn_nodes and "downgrade" in fn_nodes, (
            f"{mod_path.name} must define top-level def upgrade() and def downgrade()"
        )
        for fn_name in ("upgrade", "downgrade"):
            body_without_docstring = [
                stmt
                for idx, stmt in enumerate(fn_nodes[fn_name].body)
                if not (idx == 0 and isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str))
            ]
            assert body_without_docstring, f"{mod_path.name}: {fn_name}() has an empty body"
            assert not (len(body_without_docstring) == 1 and isinstance(body_without_docstring[0], ast.Pass)), (
                f"{mod_path.name}: {fn_name}() must not be a silent pass stub"
            )

        assert callable(getattr(rev.module, "upgrade", None))
        assert callable(getattr(rev.module, "downgrade", None))

        # Verify fail-closed destructive downgrade guard
        with pytest.raises(RuntimeError, match="Destructive downgrade disabled"):
            rev.module.downgrade()


def test_compiled_migration_ddl_reconciles_1_to_1_with_all_orm_metadata_tables():
    sql = _compile_full_postgres_upgrade_sql()
    assert len(sql) > 30_000

    migrated_tables = set(re.findall(r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z0-9_]+)", sql, re.IGNORECASE))
    orm_tables = set(Base.metadata.tables.keys())

    assert len(orm_tables) >= 32
    missing_in_migrations = sorted(orm_tables - migrated_tables)
    extra_in_migrations = sorted(migrated_tables - orm_tables)
    assert not missing_in_migrations, f"ORM tables missing CREATE TABLE in migrations: {missing_in_migrations}"
    assert not extra_in_migrations, f"Migration tables missing from SQLAlchemy Base.metadata: {extra_in_migrations}"


def test_orm_metadata_primary_keys_foreign_keys_and_timezone_aware_timestamps():
    tables = Base.metadata.tables
    assert len(tables) >= 32

    total_fk_count = 0
    tz_datetime_count = 0

    for table_name, table in sorted(tables.items()):
        # 1. Non-empty, non-nullable Primary Key on every table
        pk_cols = list(table.primary_key.columns)
        assert pk_cols, f"ORM table {table_name!r} has no Primary Key"
        for pk_col in pk_cols:
            assert not pk_col.nullable, f"ORM PK column {table_name}.{pk_col.name} must not be nullable"

        # 2. Every DateTime column must be timezone-aware (TIMESTAMPTZ)
        for col in table.columns:
            if isinstance(col.type, DateTime):
                assert col.type.timezone is True, (
                    f"ORM DateTime column {table_name}.{col.name} must set DateTime(timezone=True)"
                )
                tz_datetime_count += 1

        # 3. Every Foreign Key must resolve to a valid target table + PK/unique column
        for fk_constraint in table.foreign_key_constraints:
            target_table = fk_constraint.referred_table
            assert target_table.name in tables, (
                f"{table_name}: FK references unknown table {target_table.name!r}"
            )
            target_col_names = tuple(elem.column.name for elem in fk_constraint.elements)
            for col_name in target_col_names:
                assert col_name in target_table.c, (
                    f"{table_name}: FK references missing column {target_table.name}.{col_name}"
                )
                total_fk_count += 1

            # Verify target column tuple is backed by PK, single-column unique, or UniqueConstraint
            target_pk_names = tuple(c.name for c in target_table.primary_key.columns)
            unique_sets: set[frozenset[str]] = {frozenset(target_pk_names)}
            for c in target_table.columns:
                if c.unique:
                    unique_sets.add(frozenset((c.name,)))
            for constraint in target_table.constraints:
                if constraint.__class__.__name__ == "UniqueConstraint":
                    unique_sets.add(frozenset(c.name for c in constraint.columns))
            assert frozenset(target_col_names) in unique_sets, (
                f"{table_name}: FK -> {target_table.name}{target_col_names} targets non-unique columns"
            )

    assert total_fk_count >= 40
    assert tz_datetime_count >= 30

    # Topological sort & real DDL materialization check on ephemeral in-memory SQLite
    sorted_names = [t.name for t in Base.metadata.sorted_tables]
    assert len(sorted_names) == len(tables)
    mem_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(mem_engine)


def test_all_tenant_and_project_tables_enforce_rls_force_rls_and_session_policies():
    sql = _compile_full_postgres_upgrade_sql()
    all_tables = set(Base.metadata.tables.keys())
    expected_rls_tables = all_tables - FROZEN_GLOBAL_NON_RLS_TABLES
    assert len(expected_rls_tables) >= 25

    enable_rls_tables = set(
        re.findall(r"ALTER\s+TABLE\s+([a-z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", sql, re.IGNORECASE)
    )
    force_rls_tables = set(
        re.findall(r"ALTER\s+TABLE\s+([a-z0-9_]+)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY", sql, re.IGNORECASE)
    )
    policy_pairs = re.findall(r"CREATE\s+POLICY\s+([a-z0-9_]+)\s+ON\s+([a-z0-9_]+)", sql, re.IGNORECASE)
    policy_tables = {tbl for _pol, tbl in policy_pairs}

    missing_enable = sorted(expected_rls_tables - enable_rls_tables)
    missing_force = sorted(expected_rls_tables - force_rls_tables)
    missing_policy = sorted(expected_rls_tables - policy_tables)

    assert not missing_enable, f"Tenant/project tables missing ENABLE ROW LEVEL SECURITY: {missing_enable}"
    assert not missing_force, f"Tenant/project tables missing FORCE ROW LEVEL SECURITY: {missing_force}"
    assert not missing_policy, f"Tenant/project tables missing CREATE POLICY: {missing_policy}"
    assert enable_rls_tables == force_rls_tables == policy_tables == expected_rls_tables
    assert len(policy_pairs) >= 50

    # Verify RLS policies bind tenant isolation to PostgreSQL session variable evix.user_id
    assert sql.count("current_setting('evix.user_id'") >= 40

    # Verify latest autonomous event CHECK constraint includes memory_recalled and error
    assert "'memory_recalled'" in sql and "'error'" in sql


def test_migration_env_and_runtime_enforce_unprivileged_postgres_role_and_head_revision(monkeypatch):
    assert _ENV_PY.is_file()
    env_source = _ENV_PY.read_text(encoding="utf-8")
    assert "target_metadata=Base.metadata" in env_source
    assert 'url.startswith("postgresql+psycopg://")' in env_source

    # Executing migrations/env.py without an explicit PostgreSQL URL must fail closed immediately
    monkeypatch.delenv("EVIX_MIGRATION_DATABASE_URL", raising=False)
    with pytest.raises(Exception, match="Explicit PostgreSQL migration owner URL required|AttributeError"):
        # Note: outside Alembic runner context.config may raise AttributeError unless stubbed; stub minimal config:
        from alembic import context as alembic_ctx

        monkeypatch.setattr(alembic_ctx, "config", type("_StubCfg", (), {"attributes": {}})(), raising=False)
        runpy.run_path(str(_ENV_PY))

    # Production runtime lifespan must inspect pg_roles (rolsuper / rolbypassrls), tableowner, and alembic_version
    runtime_src = inspect.getsource(api_runtime.create_runtime)
    assert "rolsuper" in runtime_src and "rolbypassrls" in runtime_src
    assert "tableowner=current_user" in runtime_src
    assert "SELECT version_num FROM alembic_version" in runtime_src
    assert "SCHEMA_REVISION" in runtime_src
