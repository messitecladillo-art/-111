import { env } from "cloudflare:workers";
import { ApiError } from "../app/api/_lib/http";

export type EditorRecoveryStatus = { configured: boolean; revision: number; updatedAt: string | null };
type KeyRow = { owner_hash: string; verifier_hash: string; revision: number; updated_at_ms: number };
type SessionRow = { owner_hash: string; verifier_hash: string; expires_at_ms: number };
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_SESSION_LIMIT = 20;
const LIFETIME_SESSION_LIMIT = 1024;
const KEY_HISTORY_LIMIT = 1024;
const HASH = /^[a-f0-9]{64}$/;

function assertHash(value: string) {
  if (typeof value !== "string" || value.length !== 64 || !HASH.test(value)) {
    // Never echo credentials or invalid values, even at this internal boundary.
    throw new ApiError(400, "editor_recovery_invalid_hash", "恢复凭据格式无效。");
  }
}
function unavailable() {
  return new ApiError(503, "editor_recovery_storage_unavailable", "恢复凭据存储暂时不可用，请保留当前内容和恢复密钥后重试。");
}
async function withDatabase<T>(operation: (db: D1Database) => Promise<T>): Promise<T> {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw unavailable();
    return await operation(db);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // D1 failures must neither leak SQL/bindings nor become an anonymous owner.
    throw unavailable();
  }
}
function status(row: KeyRow | null): EditorRecoveryStatus {
  return row
    ? { configured: true, revision: row.revision, updatedAt: new Date(row.updated_at_ms).toISOString() }
    : { configured: false, revision: 0, updatedAt: null };
}
function invalidKey() {
  return new ApiError(401, "editor_recovery_invalid_key", "恢复密钥无效或已被更换。");
}
function sessionCollision() {
  return new ApiError(409, "editor_recovery_session_conflict", "恢复会话标识不可用。原身份未被更改，请重新发起恢复。");
}

export async function getEditorRecovery(owner: string): Promise<EditorRecoveryStatus> {
  assertHash(owner);
  return withDatabase(async db => status(await db.prepare(
    "SELECT owner_hash,verifier_hash,revision,updated_at_ms FROM editor_recovery_keys WHERE owner_hash=?",
  ).bind(owner).first<KeyRow>()));
}

export async function setEditorRecovery(owner: string, verifierHash: string, expectedRevision: number): Promise<EditorRecoveryStatus> {
  assertHash(owner);
  assertHash(verifierHash);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw new ApiError(400, "editor_recovery_invalid_revision", "恢复凭据版本无效，请刷新状态后重试。");
  }
  return withDatabase(async db => {
    // The SELECT guards initialization and cross-owner key collision; UPSERT's
    // WHERE is the CAS. All predicates and mutation share one SQLite statement.
    const mutation = db.prepare(`
      INSERT INTO editor_recovery_keys(owner_hash,verifier_hash,revision,updated_at_ms)
      SELECT ?,?,1,?
      WHERE (?=0 OR EXISTS(SELECT 1 FROM editor_recovery_keys WHERE owner_hash=? AND revision=?))
        AND NOT EXISTS(SELECT 1 FROM editor_recovery_keys WHERE verifier_hash=? AND owner_hash<>?)
        AND (NOT EXISTS(SELECT 1 FROM editor_recovery_key_history WHERE verifier_hash=?)
          OR EXISTS(SELECT 1 FROM editor_recovery_keys k JOIN editor_recovery_key_history h ON h.owner_hash=k.owner_hash AND h.verifier_hash=k.verifier_hash WHERE k.owner_hash=? AND k.verifier_hash=?))
        AND ((SELECT COUNT(*) FROM editor_recovery_key_history WHERE owner_hash=?)<?
          OR EXISTS(SELECT 1 FROM editor_recovery_keys WHERE owner_hash=? AND verifier_hash=?))
      ON CONFLICT(owner_hash) DO UPDATE SET
        verifier_hash=excluded.verifier_hash,revision=editor_recovery_keys.revision+1,updated_at_ms=excluded.updated_at_ms
      WHERE editor_recovery_keys.revision=?
      RETURNING owner_hash,verifier_hash,revision,updated_at_ms
    `).bind(owner, verifierHash, Date.now(), expectedRevision, owner, expectedRevision, verifierHash, owner,
      verifierHash, owner, verifierHash, owner, KEY_HISTORY_LIMIT, owner, verifierHash, expectedRevision);
    const reservation = db.prepare(`
      INSERT INTO editor_recovery_key_history(verifier_hash,owner_hash,registered_at_ms)
      SELECT verifier_hash,owner_hash,updated_at_ms FROM editor_recovery_keys
      WHERE owner_hash=? AND verifier_hash=? AND revision=?
      ON CONFLICT(verifier_hash) DO NOTHING
    `).bind(owner, verifierHash, expectedRevision + 1);
    // D1 batch is one transaction: publishing the current key and reserving its
    // hash either BOTH commit or BOTH roll back. No secret is consumed on CAS loss.
    const result = await db.batch<KeyRow>([mutation, reservation]);
    if (result.length !== 2 || result.some(item => !item.success)) throw unavailable();
    const row = result[0].results[0] ?? null;
    if (row) return status(row);
    // Only the immediately following revision with the exact verifier is a
    // retry. Never accept an older request after any intervening rotation.
    const retry = await db.prepare(`
      SELECT owner_hash,verifier_hash,revision,updated_at_ms FROM editor_recovery_keys
      WHERE owner_hash=? AND verifier_hash=? AND revision=?
    `).bind(owner, verifierHash, expectedRevision + 1).first<KeyRow>();
    if (retry) return status(retry);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM editor_recovery_key_history WHERE owner_hash=?").bind(owner).first<{ count: number }>();
    if (count && count.count >= KEY_HISTORY_LIMIT) {
      throw new ApiError(409, "editor_recovery_key_limit", "恢复密钥历史已达 1024 个，当前密钥保持有效。请联系维护者核对，历史记录不会自动删除。");
    }
    throw new ApiError(409, "editor_recovery_conflict", "恢复凭据已变化或该密钥不可用。请刷新状态并明确确认后重试，原凭据未被覆盖。");
  });
}

export async function resolveRecoveredEditorOwner(tokenHash: string): Promise<string | null> {
  assertHash(tokenHash);
  return withDatabase(async db => {
    const row = await db.prepare("SELECT owner_hash,verifier_hash,expires_at_ms FROM editor_recovered_sessions WHERE token_hash=?")
      .bind(tokenHash).first<SessionRow>();
    if (!row) return null;
    if (row.expires_at_ms <= Date.now()) {
      throw new ApiError(401, "editor_recovery_session_expired", "恢复会话已过期，请重新建立会话后使用恢复密钥。");
    }
    return row.owner_hash;
  });
}

export async function restoreEditorRecovery(verifierHash: string, newSessionHash: string): Promise<{ owner: string; expiresAt: string }> {
  assertHash(verifierHash);
  assertHash(newSessionHash);
  return withDatabase(async db => {
    const now = Date.now();
    // Current-key authorization, both quotas and known legacy-owner collisions
    // are checked IN the INSERT. No row is overwritten, even on exact retries.
    const row = await db.prepare(`
      INSERT INTO editor_recovered_sessions(token_hash,owner_hash,verifier_hash,created_at_ms,expires_at_ms)
      SELECT ?,k.owner_hash,k.verifier_hash,?,? FROM editor_recovery_keys k
      WHERE k.verifier_hash=?
        AND (SELECT COUNT(*) FROM editor_recovered_sessions WHERE owner_hash=k.owner_hash AND expires_at_ms>?)<?
        AND (SELECT COUNT(*) FROM editor_recovered_sessions WHERE owner_hash=k.owner_hash)<?
        AND NOT EXISTS(SELECT 1 FROM editor_recovery_keys WHERE owner_hash=?)
        AND NOT EXISTS(SELECT 1 FROM editor_drafts WHERE owner_hash=?)
        AND NOT EXISTS(SELECT 1 FROM office_files WHERE owner_hash=?)
        AND NOT EXISTS(SELECT 1 FROM office_upload_attempts WHERE owner_hash=?)
      ON CONFLICT(token_hash) DO NOTHING
      RETURNING owner_hash,verifier_hash,expires_at_ms
    `).bind(newSessionHash, now, now + SESSION_LIFETIME_MS, verifierHash, now, ACTIVE_SESSION_LIMIT, LIFETIME_SESSION_LIMIT,
      newSessionHash, newSessionHash, newSessionHash, newSessionHash).first<SessionRow>();
    if (row) return { owner: row.owner_hash, expiresAt: new Date(row.expires_at_ms).toISOString() };

    // One diagnostic snapshot: an invalid/currently rotated key is always 401.
    // Retry requires both the creating verifier and the owner's CURRENT key.
    const current = await db.prepare(`
      SELECT k.owner_hash,s.owner_hash AS session_owner,s.verifier_hash AS session_verifier,s.expires_at_ms,
        (SELECT COUNT(*) FROM editor_recovered_sessions WHERE owner_hash=k.owner_hash AND expires_at_ms>?) AS active_count,
        (SELECT COUNT(*) FROM editor_recovered_sessions WHERE owner_hash=k.owner_hash) AS lifetime_count
      FROM editor_recovery_keys k LEFT JOIN editor_recovered_sessions s ON s.token_hash=?
      WHERE k.verifier_hash=?
    `).bind(Date.now(), newSessionHash, verifierHash).first<{
      owner_hash: string; session_owner: string | null; session_verifier: string | null;
      expires_at_ms: number | null; active_count: number; lifetime_count: number;
    }>();
    if (!current) throw invalidKey();
    if (current.session_owner !== null) {
      if (current.session_owner === current.owner_hash && current.session_verifier === verifierHash
        && current.expires_at_ms !== null && current.expires_at_ms > Date.now()) {
        return { owner: current.owner_hash, expiresAt: new Date(current.expires_at_ms).toISOString() };
      }
      throw sessionCollision();
    }
    if (current.active_count >= ACTIVE_SESSION_LIMIT || current.lifetime_count >= LIFETIME_SESSION_LIMIT) {
      throw new ApiError(429, "editor_recovery_session_limit", "恢复会话已达容量上限，请使用已有有效会话，或联系维护者核对；已有文件与会话未被删除。");
    }
    throw sessionCollision();
  });
}
