-- Invitation-only email codes. Raw email addresses and codes have no columns.
-- This migration has no relationship or cascading operation on service secrets.
CREATE TABLE IF NOT EXISTS agent_accounts (
  email_hash TEXT NOT NULL PRIMARY KEY CHECK(length(email_hash)=64 AND email_hash NOT GLOB '*[^0-9a-f]*'),
  owner_hash TEXT NOT NULL UNIQUE CHECK(length(owner_hash)=64 AND owner_hash NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
);
CREATE TABLE IF NOT EXISTS agent_email_challenges (
  email_hash TEXT NOT NULL PRIMARY KEY CHECK(length(email_hash)=64 AND email_hash NOT GLOB '*[^0-9a-f]*'),
  challenge_id TEXT NOT NULL UNIQUE CHECK(length(challenge_id)=36),
  code_hash TEXT NOT NULL CHECK(length(code_hash)=64 AND code_hash NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  expires_at INTEGER NOT NULL CHECK(expires_at=created_at+600000),
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 5),
  delivered INTEGER NOT NULL CHECK(delivered IN (0,1)),
  consumed_at INTEGER,
  consumption_nonce TEXT,
  CHECK((consumed_at IS NULL AND consumption_nonce IS NULL) OR (consumed_at>=created_at AND consumed_at<expires_at AND length(consumption_nonce)=36 AND delivered=1))
);
CREATE TABLE IF NOT EXISTS agent_email_rate_events (
  email_hash TEXT NOT NULL CHECK(length(email_hash)=64 AND email_hash NOT GLOB '*[^0-9a-f]*'),
  id TEXT NOT NULL CHECK(length(id)=36),
  challenge_id TEXT NOT NULL CHECK(length(challenge_id)=36),
  reserved_at INTEGER NOT NULL CHECK(reserved_at>=0),
  PRIMARY KEY(email_hash,id)
);
CREATE INDEX IF NOT EXISTS agent_email_rate_events_owner_time ON agent_email_rate_events(email_hash,reserved_at DESC);
CREATE TABLE IF NOT EXISTS agent_account_sessions (
  session_owner_hash TEXT NOT NULL PRIMARY KEY CHECK(length(session_owner_hash)=64 AND session_owner_hash NOT GLOB '*[^0-9a-f]*'),
  account_owner_hash TEXT NOT NULL CHECK(length(account_owner_hash)=64 AND account_owner_hash NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+2592000000),
  revoked_at INTEGER,
  FOREIGN KEY(account_owner_hash) REFERENCES agent_accounts(owner_hash)
);
CREATE INDEX IF NOT EXISTS agent_account_sessions_account_expiry ON agent_account_sessions(account_owner_hash,expires_at DESC);
