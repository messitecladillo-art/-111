"""Persist project-scoped multi-agent workflow state and approval checkpoints."""

from alembic import op

revision = "0008_agent_tasks"
down_revision = "0007_topic_questionnaire"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE agent_tasks (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      task_type VARCHAR(32) NOT NULL CHECK(task_type IN ('full_research','topic_design','questionnaire','data_analysis','report')),
      status VARCHAR(24) NOT NULL CHECK(status IN ('ready','running','needs_input','blocked','completed','failed')),
      state JSON NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )""")
    op.execute("CREATE INDEX ix_agent_tasks_project_id ON agent_tasks(project_id)")
    op.execute("CREATE INDEX ix_agent_tasks_project_updated ON agent_tasks(project_id,updated_at DESC)")
    op.execute("ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE agent_tasks FORCE ROW LEVEL SECURITY")
    scoped = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=agent_tasks.project_id AND m.user_id=current_setting('evix.user_id',true))"
    editable = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=agent_tasks.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
    op.execute(f"CREATE POLICY scoped_read ON agent_tasks FOR SELECT USING ({scoped})")
    op.execute(f"CREATE POLICY scoped_insert ON agent_tasks FOR INSERT WITH CHECK ({editable} AND created_by=current_setting('evix.user_id',true))")
    op.execute(f"CREATE POLICY scoped_update ON agent_tasks FOR UPDATE USING ({editable}) WITH CHECK ({editable} AND created_by=current_setting('evix.user_id',true))")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
