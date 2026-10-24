"""Allow team task updates while preserving the original task identity."""

from alembic import op

revision = "0009_agent_task_collaboration"
down_revision = "0008_agent_tasks"
branch_labels = None
depends_on = None


def upgrade():
    # Keep the creator check on INSERT. For UPDATE, authorization follows the
    # current team membership; identity columns remain immutable for all actors.
    op.execute("""
        CREATE FUNCTION evix_agent_task_identity() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF ROW(NEW.id, NEW.project_id, NEW.created_by, NEW.task_type, NEW.created_at)
             IS DISTINCT FROM
             ROW(OLD.id, OLD.project_id, OLD.created_by, OLD.task_type, OLD.created_at)
          THEN
            RAISE EXCEPTION 'agent task identity is immutable';
          END IF;
          RETURN NEW;
        END; $$
    """)
    op.execute("""
        CREATE TRIGGER immutable_agent_task_identity BEFORE UPDATE ON agent_tasks
        FOR EACH ROW EXECUTE FUNCTION evix_agent_task_identity()
    """)
    editable = """EXISTS(
        SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id
        WHERE p.id=agent_tasks.project_id
          AND m.user_id=current_setting('evix.user_id',true)
          AND m.role IN ('owner','editor')
    )"""
    op.execute("DROP POLICY scoped_update ON agent_tasks")
    op.execute(
        f"CREATE POLICY scoped_update ON agent_tasks FOR UPDATE "
        f"USING ({editable}) WITH CHECK ({editable})"
    )


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
