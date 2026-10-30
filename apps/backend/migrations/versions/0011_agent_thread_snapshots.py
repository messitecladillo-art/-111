"""Explicit, owner-only agent thread backups."""
from alembic import op

revision = "0011_agent_thread_snapshots"
down_revision = "0010_project_memory"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE agent_thread_snapshots (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      owner_id VARCHAR(36) NOT NULL REFERENCES users(id),
      client_thread_id VARCHAR(36) NOT NULL,
      revision INTEGER NOT NULL CHECK(revision > 0),
      title VARCHAR(80) NOT NULL,
      messages JSON NOT NULL,
      events JSON NOT NULL,
      checkpoint JSON,
      content_hash VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE(project_id, owner_id, client_thread_id))""")
    op.execute("CREATE INDEX ix_agent_thread_snapshots_project_id ON agent_thread_snapshots(project_id)")
    op.execute("CREATE INDEX ix_agent_thread_snapshots_owner_id ON agent_thread_snapshots(owner_id)")
    op.execute("ALTER TABLE agent_thread_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE agent_thread_snapshots FORCE ROW LEVEL SECURITY")
    member = ("EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id "
              "WHERE p.id=agent_thread_snapshots.project_id AND m.user_id=current_setting('evix.user_id',true))")
    owner = f"({member} AND owner_id=current_setting('evix.user_id',true))"
    op.execute(f"CREATE POLICY scoped_read ON agent_thread_snapshots FOR SELECT USING ({owner})")
    op.execute(f"CREATE POLICY scoped_insert ON agent_thread_snapshots FOR INSERT WITH CHECK ({owner})")
    op.execute(f"CREATE POLICY scoped_update ON agent_thread_snapshots FOR UPDATE USING ({owner}) WITH CHECK ({owner})")
    op.execute(f"CREATE POLICY scoped_delete ON agent_thread_snapshots FOR DELETE USING ({owner})")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
