"""硅基样本 runs: simulated respondents for questionnaire pretests, scoped to their owner by RLS."""
from alembic import op

revision = "0002_silicon_runs"
down_revision = "0001_p0"
branch_labels = None
depends_on = None

UPGRADE_SQL = (
    '\nCREATE TABLE silicon_runs (\n\tid VARCHAR(36) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\tproject_id VARCHAR(36) NOT NULL, \n\tidempotency_key VARCHAR(36) NOT NULL, \n\tpayload_hash VARCHAR(64) NOT NULL, \n\tstatus VARCHAR(24) NOT NULL, \n\tservices JSON NOT NULL, \n\tplan JSON NOT NULL, \n\ttotal INTEGER NOT NULL, \n\tdone INTEGER NOT NULL, \n\tresponses JSON NOT NULL, \n\terror_code VARCHAR(64), \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tfinished_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tUNIQUE (user_id, project_id, idempotency_key), \n\tFOREIGN KEY(user_id) REFERENCES users (id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id)\n)\n\n',
    'CREATE INDEX ix_silicon_runs_project_id ON silicon_runs (project_id)',
    'CREATE INDEX ix_silicon_runs_user_id ON silicon_runs (user_id)',
    "ALTER TABLE silicon_runs ADD CONSTRAINT silicon_runs_status CHECK (status IN ('running','ready','failed','cancelled','outcome_unknown'))",
    'ALTER TABLE silicon_runs ADD CONSTRAINT silicon_runs_progress CHECK (total BETWEEN 1 AND 1000 AND done BETWEEN 0 AND total)',
    'ALTER TABLE silicon_runs ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE silicon_runs FORCE ROW LEVEL SECURITY',
    "CREATE POLICY scoped_access ON silicon_runs USING (user_id=current_setting('evix.user_id',true)) WITH CHECK (user_id=current_setting('evix.user_id',true))",
)


def upgrade():
    for statement in UPGRADE_SQL:
        op.execute(statement)


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
