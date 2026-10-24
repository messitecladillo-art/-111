-- BYOK keys use AES-256-GCM. The application supplies a server master key.
-- Owner hashes are derived from authenticated server sessions, never user input.
CREATE TABLE IF NOT EXISTS agent_services (
  id TEXT NOT NULL CHECK(length(id)=36),
  owner_hash TEXT NOT NULL CHECK(length(owner_hash)=64),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
  provider TEXT NOT NULL CHECK(provider IN ('openai','deepseek','qwen','compatible')),
  base_url TEXT NOT NULL CHECK(length(base_url) BETWEEN 1 AND 512),
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 120),
  capabilities TEXT NOT NULL CHECK(json_valid(capabilities) AND json_type(capabilities)='array' AND json_array_length(capabilities) BETWEEN 1 AND 4),
  max_output_tokens INTEGER NOT NULL CHECK(max_output_tokens BETWEEN 128 AND 4096),
  revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483647),
  key_version INTEGER NOT NULL CHECK(key_version=1),
  key_id TEXT NOT NULL CHECK(length(key_id) BETWEEN 1 AND 64),
  key_iv TEXT NOT NULL CHECK(length(key_iv)=16),
  key_ciphertext TEXT NOT NULL CHECK(length(key_ciphertext) BETWEEN 32 AND 2752),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_hash,id)
);
CREATE INDEX IF NOT EXISTS agent_services_owner_updated ON agent_services(owner_hash,updated_at DESC,id DESC);
CREATE TRIGGER IF NOT EXISTS agent_services_capacity BEFORE INSERT ON agent_services
WHEN (SELECT count(*) FROM agent_services WHERE owner_hash=NEW.owner_hash)>=8
BEGIN SELECT RAISE(ABORT,'agent service capacity'); END;

-- Deliberately has no column capable of holding prompts, model answers or keys.
CREATE TABLE IF NOT EXISTS agent_service_usage (
  id TEXT NOT NULL CHECK(length(id)=36),
  owner_hash TEXT NOT NULL CHECK(length(owner_hash)=64),
  service_id TEXT NOT NULL CHECK(length(service_id)=36),
  service_revision INTEGER NOT NULL CHECK(service_revision BETWEEN 1 AND 2147483647),
  capability TEXT NOT NULL CHECK(capability IN ('questionnaire','research','report','defense')),
  status TEXT NOT NULL CHECK(status IN ('succeeded','failed','cancelled')),
  duration_ms INTEGER NOT NULL CHECK(duration_ms BETWEEN 0 AND 120000),
  input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens BETWEEN 0 AND 1000000),
  output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens BETWEEN 0 AND 1000000),
  error_code TEXT CHECK(error_code IS NULL OR length(error_code) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_hash,id),
  FOREIGN KEY (owner_hash,service_id) REFERENCES agent_services(owner_hash,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_service_usage_owner_created ON agent_service_usage(owner_hash,created_at DESC,id DESC);
