"""Allow memory_recalled SSE event type in autonomous_run_events."""

from alembic import op

revision = "0013_memory_recalled_event"
down_revision = "0012_autonomous_runs_and_memory"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    DO $$
    DECLARE cname text;
    BEGIN
      FOR cname IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'autonomous_run_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%event_type%'
      LOOP
        EXECUTE format('ALTER TABLE autonomous_run_events DROP CONSTRAINT %I', cname);
      END LOOP;
    END $$;
    """)
    op.execute(
        "ALTER TABLE autonomous_run_events ADD CONSTRAINT autonomous_run_events_event_type_check "
        "CHECK(event_type IN ('run_started','thought','tool_start','tool_result','pivot','milestone_pause','steering','reviewer_critique','reanalysis','memory_recalled','completed','cancelled','error'))"
    )


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
