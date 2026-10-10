CREATE TABLE IF NOT EXISTS agent_service_calls (
  id TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('test','questionnaire')),
  state TEXT NOT NULL CHECK(state IN ('pending','succeeded','failed','unknown')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  PRIMARY KEY(owner_hash,id)
);
CREATE INDEX IF NOT EXISTS agent_calls_owner_started ON agent_service_calls(owner_hash,started_at);
