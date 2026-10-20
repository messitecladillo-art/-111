"""Frozen P0 PostgreSQL schema and security. No runtime-model imports."""
from alembic import op

revision = "0001_p0"
down_revision = None
branch_labels = None
depends_on = None

UPGRADE_SQL = (
    '\nCREATE TABLE email_challenges (\n\tid VARCHAR(36) NOT NULL, \n\temail VARCHAR(254) NOT NULL, \n\tverifier VARCHAR(64) NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tattempts INTEGER NOT NULL, \n\tdelivered BOOLEAN NOT NULL, \n\tconsumed BOOLEAN NOT NULL, \n\tPRIMARY KEY (id)\n)\n\n',
    '\nCREATE TABLE rate_events (\n\tid VARCHAR(36) NOT NULL, \n\tscope VARCHAR(80) NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id)\n)\n\n',
    'CREATE INDEX ix_rate_events_created_at ON rate_events (created_at)',
    'CREATE INDEX ix_rate_events_scope ON rate_events (scope)',
    '\nCREATE TABLE teams (\n\tid VARCHAR(36) NOT NULL, \n\tname VARCHAR(120) NOT NULL, \n\tPRIMARY KEY (id)\n)\n\n',
    '\nCREATE TABLE users (\n\tid VARCHAR(36) NOT NULL, \n\temail VARCHAR(254) NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (email)\n)\n\n',
    '\nCREATE TABLE memberships (\n\tteam_id VARCHAR(36) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\trole VARCHAR(16) NOT NULL, \n\tPRIMARY KEY (team_id, user_id), \n\tFOREIGN KEY(team_id) REFERENCES teams (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)\n\n',
    '\nCREATE TABLE operations (\n\tuser_id VARCHAR(36) NOT NULL, \n\tscope VARCHAR(100) NOT NULL, \n\tkey VARCHAR(36) NOT NULL, \n\tpayload_hash VARCHAR(64) NOT NULL, \n\tresponse JSON, \n\tPRIMARY KEY (user_id, scope, key), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)\n\n',
    '\nCREATE TABLE projects (\n\tid VARCHAR(36) NOT NULL, \n\tteam_id VARCHAR(36) NOT NULL, \n\ttitle VARCHAR(160) NOT NULL, \n\trevision INTEGER NOT NULL, \n\tquestionnaire_revision INTEGER NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(team_id) REFERENCES teams (id)\n)\n\n',
    'CREATE INDEX ix_projects_team_id ON projects (team_id)',
    '\nCREATE TABLE services (\n\tid VARCHAR(36) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\tlabel VARCHAR(80) NOT NULL, \n\tprovider VARCHAR(16) NOT NULL, \n\tbase_url VARCHAR(512) NOT NULL, \n\tmodel VARCHAR(120) NOT NULL, \n\tmax_output_tokens INTEGER NOT NULL, \n\tcapabilities JSON NOT NULL, \n\trevision INTEGER NOT NULL, \n\tkey_id VARCHAR(32) NOT NULL, \n\tiv BYTEA NOT NULL, \n\tciphertext BYTEA NOT NULL, \n\tdeleted BOOLEAN NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_services_user_id ON services (user_id)',
    '\nCREATE TABLE sessions (\n\ttoken_hash VARCHAR(64) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\tcsrf VARCHAR(64) NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\trevoked_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (token_hash), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)\n\n',
    '\nCREATE TABLE proposals (\n\tid VARCHAR(36) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\tproject_id VARCHAR(36) NOT NULL, \n\tservice_id VARCHAR(36) NOT NULL, \n\tservice_revision INTEGER NOT NULL, \n\tinput_revision INTEGER NOT NULL, \n\tidempotency_key VARCHAR(36) NOT NULL, \n\tpayload_hash VARCHAR(64) NOT NULL, \n\tstatus VARCHAR(24) NOT NULL, \n\tdesign JSON, \n\terror_code VARCHAR(64), \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tdispatched_at TIMESTAMP WITH TIME ZONE, \n\tfinished_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tUNIQUE (user_id, project_id, idempotency_key), \n\tFOREIGN KEY(user_id) REFERENCES users (id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id), \n\tFOREIGN KEY(service_id) REFERENCES services (id)\n)\n\n',
    'CREATE INDEX ix_proposals_project_id ON proposals (project_id)',
    'CREATE INDEX ix_proposals_user_id ON proposals (user_id)',
    '\nCREATE TABLE questionnaire_versions (\n\tid VARCHAR(36) NOT NULL, \n\tproject_id VARCHAR(36) NOT NULL, \n\trevision INTEGER NOT NULL, \n\tcreated_by VARCHAR(36) NOT NULL, \n\tdesign JSON NOT NULL, \n\tdesign_hash VARCHAR(64) NOT NULL, \n\tsource_proposal_id VARCHAR(36), \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (project_id, revision), \n\tFOREIGN KEY(project_id) REFERENCES projects (id), \n\tFOREIGN KEY(created_by) REFERENCES users (id)\n)\n\n',
    'CREATE INDEX ix_questionnaire_versions_project_id ON questionnaire_versions (project_id)',
    'ALTER TABLE projects ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE projects FORCE ROW LEVEL SECURITY',
    "CREATE POLICY scoped_read ON projects FOR SELECT USING (EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=projects.team_id AND m.user_id=current_setting('evix.user_id',true)))",
    "CREATE POLICY scoped_insert ON projects FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=projects.team_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor')))",
    "CREATE POLICY scoped_update ON projects FOR UPDATE USING (EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=projects.team_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))) WITH CHECK (EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=projects.team_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor')))",
    'ALTER TABLE questionnaire_versions ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE questionnaire_versions FORCE ROW LEVEL SECURITY',
    "CREATE POLICY scoped_read ON questionnaire_versions FOR SELECT USING (EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=questionnaire_versions.project_id AND m.user_id=current_setting('evix.user_id',true)))",
    "CREATE POLICY scoped_insert ON questionnaire_versions FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=questionnaire_versions.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor')))",
    'ALTER TABLE services ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE services FORCE ROW LEVEL SECURITY',
    "CREATE POLICY scoped_access ON services USING (user_id=current_setting('evix.user_id',true)) WITH CHECK (user_id=current_setting('evix.user_id',true))",
    'ALTER TABLE operations ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE operations FORCE ROW LEVEL SECURITY',
    "CREATE POLICY scoped_access ON operations USING (user_id=current_setting('evix.user_id',true)) WITH CHECK (user_id=current_setting('evix.user_id',true))",
    'ALTER TABLE proposals ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE proposals FORCE ROW LEVEL SECURITY',
    "CREATE POLICY scoped_access ON proposals USING (user_id=current_setting('evix.user_id',true)) WITH CHECK (user_id=current_setting('evix.user_id',true))",
    "\n        CREATE FUNCTION evix_immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$\n        BEGIN RAISE EXCEPTION 'questionnaire versions are immutable'; END; $$\n    ",
    'CREATE TRIGGER immutable_versions BEFORE UPDATE OR DELETE ON questionnaire_versions FOR EACH ROW EXECUTE FUNCTION evix_immutable_version()',

)

def upgrade():
    for statement in UPGRADE_SQL:
        op.execute(statement)

def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
