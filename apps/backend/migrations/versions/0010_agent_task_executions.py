"""Persist dispatch before role execution; metadata-only receipts survive revocation."""
from alembic import op

revision = '0010_agent_task_executions'
down_revision = '0009_agent_task_collaboration'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE agent_task_executions (
      id VARCHAR(36) PRIMARY KEY,
      task_id VARCHAR(36) NOT NULL REFERENCES agent_tasks(id),
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      base_revision INTEGER NOT NULL,
      claimed_revision INTEGER NOT NULL,
      role VARCHAR(24) NOT NULL CHECK(role IN ('research','survey','data','writing','reviewer')),
      status VARCHAR(24) NOT NULL CHECK(status IN ('running','completed','failed','outcome_unknown','cancelled','discarded')),
      input_hash VARCHAR(64) NOT NULL,
      result_hash VARCHAR(64),
      error_code VARCHAR(48),
      lease_expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      UNIQUE(task_id,base_revision),
      CHECK(base_revision >= 0 AND claimed_revision=base_revision+1)
    )""")
    op.execute('CREATE INDEX ix_agent_task_executions_task_id ON agent_task_executions(task_id)')
    op.execute('ALTER TABLE agent_task_executions ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE agent_task_executions FORCE ROW LEVEL SECURITY')
    own = "created_by=current_setting('evix.user_id',true)"
    scoped = """EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id
      WHERE p.id=agent_task_executions.project_id AND m.user_id=current_setting('evix.user_id',true))"""
    editable = """EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id
      WHERE p.id=agent_task_executions.project_id AND m.user_id=current_setting('evix.user_id',true)
      AND m.role IN ('owner','editor'))"""
    # The caller can finish its metadata-only receipt after losing project access.
    # Project task content still requires current team permissions; HTTP reads do too.
    op.execute(f'CREATE POLICY scoped_read ON agent_task_executions FOR SELECT USING ({scoped} OR {own})')
    op.execute(f'CREATE POLICY scoped_insert ON agent_task_executions FOR INSERT WITH CHECK ({editable} AND {own})')
    op.execute(f'CREATE POLICY scoped_update ON agent_task_executions FOR UPDATE USING ({editable} OR {own}) WITH CHECK ({editable} OR {own})')
    op.execute("""CREATE FUNCTION evix_execution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='INSERT' THEN
          IF NOT EXISTS(SELECT 1 FROM agent_tasks t WHERE t.id=NEW.task_id
            AND t.project_id=NEW.project_id AND t.revision=NEW.claimed_revision AND t.status='running') THEN
            RAISE EXCEPTION 'execution must bind the claimed task';
          END IF;
        ELSE
          IF ROW(NEW.id,NEW.task_id,NEW.project_id,NEW.created_by,NEW.base_revision,
                 NEW.claimed_revision,NEW.role,NEW.input_hash,NEW.created_at,NEW.lease_expires_at)
            IS DISTINCT FROM
             ROW(OLD.id,OLD.task_id,OLD.project_id,OLD.created_by,OLD.base_revision,
                 OLD.claimed_revision,OLD.role,OLD.input_hash,OLD.created_at,OLD.lease_expires_at) THEN
            RAISE EXCEPTION 'execution identity is immutable';
          END IF;
          IF OLD.status <> 'running' AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'terminal execution is immutable';
          END IF;
        END IF;
        RETURN NEW;
      END; $$""")
    op.execute('CREATE TRIGGER execution_guard BEFORE INSERT OR UPDATE ON agent_task_executions FOR EACH ROW EXECUTE FUNCTION evix_execution_guard()')


def downgrade():
    raise RuntimeError('Destructive downgrade disabled; restore a verified backup')
