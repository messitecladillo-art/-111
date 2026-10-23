"""Immutable project-owned topic briefs and exact-version confirmation records."""
from alembic import op

revision = "0006_topic_projects"
down_revision = "0005_knowledge"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE topic_project_versions (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      revision INTEGER NOT NULL CHECK(revision > 0),
      document JSON NOT NULL, content_hash VARCHAR(64) NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE(project_id, revision), UNIQUE(project_id, id, content_hash))""")
    op.execute("""CREATE TABLE topic_project_decisions (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      revision INTEGER NOT NULL CHECK(revision > 0),
      version_id VARCHAR(36) NOT NULL REFERENCES topic_project_versions(id),
      content_hash VARCHAR(64) NOT NULL,
      action VARCHAR(16) NOT NULL CHECK(action IN ('confirm','revoke')),
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE(project_id, revision),
      FOREIGN KEY(project_id,version_id,content_hash)
        REFERENCES topic_project_versions(project_id,id,content_hash))""")
    for table in ("topic_project_versions", "topic_project_decisions"):
        op.execute(f"CREATE INDEX ix_{table}_project_id ON {table}(project_id)")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        scoped = f"EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id={table}.project_id AND m.user_id=current_setting('evix.user_id',true))"
        editable = f"EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id={table}.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
        op.execute(f"CREATE POLICY scoped_read ON {table} FOR SELECT USING ({scoped})")
        op.execute(f"CREATE POLICY scoped_insert ON {table} FOR INSERT WITH CHECK ({editable} AND created_by=current_setting('evix.user_id',true))")
        op.execute(f"CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION evix_immutable_version()")
    op.execute("CREATE INDEX ix_topic_project_decisions_version_id ON topic_project_decisions(version_id)")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
