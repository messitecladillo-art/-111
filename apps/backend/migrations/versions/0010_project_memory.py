"""Versioned project memory."""
from alembic import op

revision = "0010_project_memory"
down_revision = "0009_agent_task_collaboration"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE project_memory_versions (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      revision INTEGER NOT NULL CHECK(revision > 0),
      document JSON NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL,
      change_note VARCHAR(500) NOT NULL DEFAULT '',
      UNIQUE(project_id, revision),
      UNIQUE(project_id, id, content_hash))""")
    op.execute("CREATE INDEX ix_project_memory_versions_project_id ON project_memory_versions(project_id)")
    op.execute("ALTER TABLE project_memory_versions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE project_memory_versions FORCE ROW LEVEL SECURITY")
    scoped = ("EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id "
              "WHERE p.id=project_memory_versions.project_id AND m.user_id=current_setting('evix.user_id',true))")
    editable = ("EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id "
                "WHERE p.id=project_memory_versions.project_id AND m.user_id=current_setting('evix.user_id',true) "
                "AND m.role IN ('owner','editor'))")
    op.execute(f"CREATE POLICY scoped_read ON project_memory_versions FOR SELECT USING ({scoped})")
    op.execute(f"CREATE POLICY scoped_insert ON project_memory_versions FOR INSERT WITH CHECK "
               f"({editable} AND created_by=current_setting('evix.user_id',true))")
    op.execute("CREATE TRIGGER immutable_project_memory_versions BEFORE UPDATE OR DELETE ON project_memory_versions "
               "FOR EACH ROW EXECUTE FUNCTION evix_immutable_version()")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
