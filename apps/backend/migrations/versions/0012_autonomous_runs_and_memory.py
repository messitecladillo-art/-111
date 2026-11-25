"""Durable autonomous research runs, incremental event streams, and project epistemic memory."""

from alembic import op

revision = "0012_autonomous_runs_and_memory"
down_revision = "0011_invite_codes"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE autonomous_runs (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      idempotency_key VARCHAR(36) NOT NULL,
      status VARCHAR(24) NOT NULL CHECK(status IN ('running','awaiting_milestone','completed','failed','cancelled')),
      lease_mode VARCHAR(24) NOT NULL CHECK(lease_mode IN ('pi_autonomous','milestone_gated')),
      dataset_mode VARCHAR(32) NOT NULL,
      goal TEXT NOT NULL,
      geography VARCHAR(120) NOT NULL DEFAULT '',
      budget_cap INTEGER NOT NULL CHECK(budget_cap BETWEEN 8 AND 64),
      used_calls INTEGER NOT NULL DEFAULT 0 CHECK(used_calls >= 0),
      dataset_ref VARCHAR(120) NOT NULL DEFAULT '',
      dataset_sha256 VARCHAR(64) NOT NULL DEFAULT '',
      checkpoint_json JSONB NOT NULL,
      epistemic_graph_json JSONB NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE(created_by, project_id, idempotency_key)
    )""")
    op.execute("CREATE INDEX ix_autonomous_runs_project_id ON autonomous_runs(project_id)")

    op.execute("""CREATE TABLE autonomous_run_events (
      id VARCHAR(36) PRIMARY KEY,
      run_id VARCHAR(36) NOT NULL REFERENCES autonomous_runs(id) ON DELETE CASCADE,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      seq INTEGER NOT NULL CHECK(seq >= 1),
      event_type VARCHAR(32) NOT NULL CHECK(event_type IN ('run_started','thought','tool_start','tool_result','pivot','milestone_pause','steering','reviewer_critique','reanalysis','completed','cancelled','error')),
      payload_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE(run_id, seq)
    )""")
    op.execute("CREATE INDEX ix_autonomous_run_events_run_seq ON autonomous_run_events(run_id, seq)")

    op.execute("""CREATE TABLE project_epistemic_memory (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      run_id VARCHAR(36) REFERENCES autonomous_runs(id) ON DELETE SET NULL,
      memory_key VARCHAR(120) NOT NULL,
      kind VARCHAR(32) NOT NULL CHECK(kind IN ('hypothesis','cleaning_rule','mother_insight','preference','refuted_claim','evidence_gap')),
      status VARCHAR(24) NOT NULL CHECK(status IN ('active','pivoted','refuted','resolved')),
      summary TEXT NOT NULL,
      snapshot_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE(project_id, memory_key)
    )""")
    op.execute("CREATE INDEX ix_project_epistemic_memory_project ON project_epistemic_memory(project_id)")

    own = "created_by=current_setting('evix.user_id',true)"
    for table in ("autonomous_runs", "autonomous_run_events", "project_epistemic_memory"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        scoped = (
            f"EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id "
            f"WHERE p.id={table}.project_id AND m.user_id=current_setting('evix.user_id',true))"
        )
        editable = (
            f"EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id "
            f"WHERE p.id={table}.project_id AND m.user_id=current_setting('evix.user_id',true) "
            f"AND m.role IN ('owner','editor'))"
        )
        op.execute(f"CREATE POLICY scoped_read ON {table} FOR SELECT USING ({scoped})")
        op.execute(f"CREATE POLICY scoped_insert ON {table} FOR INSERT WITH CHECK ({editable} AND {own})")
        if table in ("autonomous_runs", "project_epistemic_memory"):
            op.execute(f"CREATE POLICY scoped_update ON {table} FOR UPDATE USING ({editable}) WITH CHECK ({editable})")

    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evix_app') THEN "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON autonomous_runs, autonomous_run_events, project_epistemic_memory TO evix_app; "
        "END IF; END $$;"
    )


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
