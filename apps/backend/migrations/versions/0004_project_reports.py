"""Immutable project report/PPT snapshots, with team-scoped access."""
from alembic import op

revision = "0004_project_reports"
down_revision = "0003_survey_collection"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE report_versions (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      revision INTEGER NOT NULL CHECK (revision > 0),
      content JSON NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      UNIQUE(project_id, revision))""")
    op.execute("CREATE INDEX ix_report_versions_project_id ON report_versions(project_id)")
    op.execute("ALTER TABLE report_versions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE report_versions FORCE ROW LEVEL SECURITY")
    predicate = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=report_versions.project_id AND m.user_id=current_setting('evix.user_id',true))"
    editable = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=report_versions.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
    op.execute(f"CREATE POLICY scoped_read ON report_versions FOR SELECT USING ({predicate})")
    op.execute(f"CREATE POLICY scoped_insert ON report_versions FOR INSERT WITH CHECK ({editable} AND created_by=current_setting('evix.user_id',true))")
    op.execute("CREATE TRIGGER immutable_report_versions BEFORE UPDATE OR DELETE ON report_versions FOR EACH ROW EXECUTE FUNCTION evix_immutable_version()")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
