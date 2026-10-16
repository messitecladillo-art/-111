"""Atomic questionnaire versions with immutable, project-scoped topic bindings."""
from alembic import op

revision = "0007_topic_questionnaire"
down_revision = "0006_topic_projects"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE questionnaire_versions ADD CONSTRAINT uq_questionnaire_project_id UNIQUE(project_id,id)")
    op.execute("""CREATE TABLE questionnaire_topic_bindings (
      version_id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
      parent_version_id VARCHAR(36), origin_version_id VARCHAR(36),
      operation_kind VARCHAR(16) NOT NULL CHECK(operation_kind IN ('edit','apply','restore')),
      binding JSON, binding_hash VARCHAR(64), design_transfer_hash VARCHAR(64) NOT NULL,
      audit JSON NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL,
      UNIQUE(project_id,version_id),
      CHECK((binding IS NULL AND binding_hash IS NULL) OR (binding IS NOT NULL AND binding_hash IS NOT NULL)),
      FOREIGN KEY(project_id,version_id) REFERENCES questionnaire_versions(project_id,id),
      FOREIGN KEY(project_id,parent_version_id) REFERENCES questionnaire_versions(project_id,id),
      FOREIGN KEY(project_id,origin_version_id) REFERENCES questionnaire_versions(project_id,id))""")
    op.execute("""CREATE TABLE questionnaire_topic_binding_sources (
      version_id VARCHAR(36) NOT NULL, source_version_id VARCHAR(36) NOT NULL,
      project_id VARCHAR(36) NOT NULL REFERENCES projects(id), source_content_hash VARCHAR(64) NOT NULL,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY(version_id,source_version_id),
      FOREIGN KEY(project_id,version_id) REFERENCES questionnaire_topic_bindings(project_id,version_id),
      FOREIGN KEY(project_id,source_version_id,source_content_hash)
        REFERENCES topic_project_versions(project_id,id,content_hash))""")
    for table in ("questionnaire_topic_bindings", "questionnaire_topic_binding_sources"):
        op.execute(f"CREATE INDEX ix_{table}_project_id ON {table}(project_id)")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        scoped = f"EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id={table}.project_id AND m.user_id=current_setting('evix.user_id',true))"
        editable = f"EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id={table}.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
        op.execute(f"CREATE POLICY scoped_read ON {table} FOR SELECT USING ({scoped})")
        op.execute(f"CREATE POLICY scoped_insert ON {table} FOR INSERT WITH CHECK ({editable} AND created_by=current_setting('evix.user_id',true))")
        op.execute(f"CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION evix_immutable_version()")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
