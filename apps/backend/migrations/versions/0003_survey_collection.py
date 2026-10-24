"""Version-bound survey collection, immutable responses and narrowly scoped anonymous intake."""
from alembic import op

revision = "0003_survey_collection"
down_revision = "0002_silicon_runs"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE survey_releases (
          id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
          version_id VARCHAR(36) NOT NULL REFERENCES questionnaire_versions(id),
          questionnaire_revision INTEGER NOT NULL CHECK (questionnaire_revision > 0),
          token VARCHAR(43) NOT NULL UNIQUE, public_design JSON NOT NULL,
          classification VARCHAR(16) NOT NULL CHECK (classification IN ('actual','synthetic')),
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
          response_count INTEGER NOT NULL DEFAULT 0 CHECK (response_count BETWEEN 0 AND 5000),
          response_bytes INTEGER NOT NULL DEFAULT 0 CHECK (response_bytes BETWEEN 0 AND 2097152),
          created_at TIMESTAMPTZ NOT NULL, closed_at TIMESTAMPTZ,
          UNIQUE(project_id,version_id),
          CHECK ((status='open' AND closed_at IS NULL) OR (status='closed' AND closed_at IS NOT NULL))
        )
    """)
    op.execute("CREATE INDEX ix_survey_releases_project_id ON survey_releases(project_id)")
    op.execute("""
        CREATE TABLE survey_responses (
          id VARCHAR(36) PRIMARY KEY, release_id VARCHAR(36) NOT NULL REFERENCES survey_releases(id),
          idempotency_key VARCHAR(36) NOT NULL, payload_hash VARCHAR(64) NOT NULL,
          answers JSON NOT NULL, visibility JSON NOT NULL, created_at TIMESTAMPTZ NOT NULL,
          UNIQUE(release_id,idempotency_key)
        )
    """)
    op.execute("CREATE INDEX ix_survey_responses_release_id ON survey_responses(release_id)")
    member = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=survey_releases.project_id AND m.user_id=current_setting('evix.user_id',true))"
    editor = "EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=survey_releases.project_id AND m.user_id=current_setting('evix.user_id',true) AND m.role IN ('owner','editor'))"
    token = "token=current_setting('evix.survey_token',true)"
    for table in ("survey_releases", "survey_responses"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY release_read ON survey_releases FOR SELECT USING ({member} OR {token})")
    op.execute(f"CREATE POLICY release_insert ON survey_releases FOR INSERT WITH CHECK ({editor})")
    # The update trigger below restricts anonymous intake to two bounded counters.
    op.execute(f"CREATE POLICY release_update ON survey_releases FOR UPDATE USING ({editor} OR {token}) WITH CHECK ({editor} OR {token})")
    response_member = "EXISTS(SELECT 1 FROM survey_releases r JOIN projects p ON p.id=r.project_id JOIN memberships m ON m.team_id=p.team_id WHERE r.id=survey_responses.release_id AND m.user_id=current_setting('evix.user_id',true))"
    response_public = "idempotency_key=current_setting('evix.submission_key',true) AND EXISTS(SELECT 1 FROM survey_releases r WHERE r.id=survey_responses.release_id AND r.token=current_setting('evix.survey_token',true))"
    op.execute(f"CREATE POLICY response_read ON survey_responses FOR SELECT USING ({response_member} OR ({response_public}))")
    op.execute(f"CREATE POLICY response_insert ON survey_responses FOR INSERT WITH CHECK ({response_public} AND EXISTS(SELECT 1 FROM survey_releases r WHERE r.id=survey_responses.release_id AND r.status='open'))")
    op.execute("""
        CREATE FUNCTION evix_frozen_release() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP='DELETE' THEN RAISE EXCEPTION 'survey releases are immutable'; END IF;
          IF (to_jsonb(NEW)-ARRAY['status','revision','closed_at','response_count','response_bytes'])
               IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','revision','closed_at','response_count','response_bytes']) THEN
            RAISE EXCEPTION 'survey release content is immutable';
          END IF;
          IF coalesce(current_setting('evix.survey_token',true),'')=OLD.token THEN
            IF OLD.status<>'open' OR NEW.status<>OLD.status OR NEW.revision<>OLD.revision
               OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
               OR NEW.response_count<>OLD.response_count+1
               OR NEW.response_bytes<OLD.response_bytes OR NEW.response_bytes>OLD.response_bytes+65536 THEN
              RAISE EXCEPTION 'anonymous intake may only advance bounded counters';
            END IF;
          ELSE
            IF OLD.status<>'open' OR NEW.status<>'closed' OR NEW.revision<>OLD.revision+1
               OR NEW.closed_at IS NULL OR NEW.response_count<>OLD.response_count
               OR NEW.response_bytes<>OLD.response_bytes THEN
              RAISE EXCEPTION 'survey release may only close once';
            END IF;
          END IF;
          RETURN NEW;
        END; $$
    """)
    op.execute("CREATE TRIGGER frozen_release BEFORE UPDATE OR DELETE ON survey_releases FOR EACH ROW EXECUTE FUNCTION evix_frozen_release()")
    op.execute("""
        CREATE FUNCTION evix_frozen_response() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'survey responses are immutable'; END; $$
    """)
    op.execute("CREATE TRIGGER frozen_response BEFORE UPDATE OR DELETE ON survey_responses FOR EACH ROW EXECUTE FUNCTION evix_frozen_response()")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
