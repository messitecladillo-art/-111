"""Private knowledge state and conservative, atomic operator lookup budget."""
from alembic import op

revision = "0005_knowledge"
down_revision = "0004_project_reports"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE knowledge_user_states (
        user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id),
        revision INTEGER NOT NULL CHECK(revision > 0), content JSON NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL)""")
    op.execute("""CREATE TABLE knowledge_project_states (
        project_id VARCHAR(36) PRIMARY KEY REFERENCES projects(id),
        revision INTEGER NOT NULL CHECK(revision >= 0))""")
    op.execute("""CREATE TABLE knowledge_references (
        id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
        entry_id VARCHAR(100) NOT NULL, entry_version INTEGER NOT NULL CHECK(entry_version>0),
        created_by VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL,
        deleted BOOLEAN NOT NULL, UNIQUE(project_id,entry_id,entry_version))""")
    op.execute("""CREATE TABLE knowledge_term_requests (
        id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        idempotency_key VARCHAR(36) NOT NULL, payload_hash VARCHAR(64) NOT NULL,
        term VARCHAR(120) NOT NULL, domain VARCHAR(60) NOT NULL, note TEXT NOT NULL,
        status VARCHAR(16) NOT NULL CHECK(status IN ('submitted','reviewed','declined')),
        created_at TIMESTAMPTZ NOT NULL, UNIQUE(user_id,idempotency_key))""")
    op.execute("""CREATE TABLE knowledge_monthly_budgets (
        month VARCHAR(7) PRIMARY KEY, reserved INTEGER NOT NULL CHECK(reserved>=0),
        settled INTEGER NOT NULL CHECK(settled>=0), blocked BOOLEAN NOT NULL)""")
    op.execute("""CREATE TABLE knowledge_daily_budgets (
        user_id VARCHAR(36) NOT NULL REFERENCES users(id), day VARCHAR(10) NOT NULL,
        requests INTEGER NOT NULL CHECK(requests BETWEEN 0 AND 20), PRIMARY KEY(user_id,day))""")
    op.execute("""CREATE TABLE knowledge_lookups (
        id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        idempotency_key VARCHAR(36) NOT NULL, payload_hash VARCHAR(64) NOT NULL,
        query VARCHAR(120) NOT NULL, status VARCHAR(24) NOT NULL
          CHECK(status IN ('running','ready','failed','outcome_unknown')),
        budget_month VARCHAR(7) NOT NULL REFERENCES knowledge_monthly_budgets(month),
        budget_day VARCHAR(10) NOT NULL, reserved_credits INTEGER NOT NULL CHECK(reserved_credits>=0),
        actual_credits INTEGER NULL CHECK(actual_credits>=0), results JSON NOT NULL,
        provider_request_id VARCHAR(120), error_code VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ,
        UNIQUE(user_id,idempotency_key))""")
    for table in ("knowledge_references", "knowledge_term_requests", "knowledge_lookups"):
        column = "project_id" if table == "knowledge_references" else "user_id"
        op.execute(f"CREATE INDEX ix_{table}_{column} ON {table}({column})")
    own = "user_id=current_setting('evix.user_id',true)"
    for table in ("knowledge_user_states", "knowledge_term_requests", "knowledge_lookups", "knowledge_daily_budgets"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY own_rows ON {table} USING ({own}) WITH CHECK ({own})")
    for table in ("knowledge_project_states", "knowledge_references"):
        read = f"EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id={table}.project_id AND m.user_id=current_setting('evix.user_id',true))"
        edit = read[:-1] + " AND m.role IN ('owner','editor'))"
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY project_read ON {table} FOR SELECT USING ({read})")
        authored = " AND created_by=current_setting('evix.user_id',true)" if table == "knowledge_references" else ""
        op.execute(f"CREATE POLICY project_insert ON {table} FOR INSERT WITH CHECK ({edit}{authored})")
        op.execute(f"CREATE POLICY project_update ON {table} FOR UPDATE USING ({edit}) WITH CHECK ({edit})")
    # Aggregate site counters have no query, user or content fields. The application
    # role is server-only; every request still requires the established auth/CSRF helper.
    authenticated = "EXISTS(SELECT 1 FROM users WHERE id=current_setting('evix.user_id',true))"
    op.execute("ALTER TABLE knowledge_monthly_budgets ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE knowledge_monthly_budgets FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY authenticated_budget ON knowledge_monthly_budgets USING ({authenticated}) WITH CHECK ({authenticated})")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
