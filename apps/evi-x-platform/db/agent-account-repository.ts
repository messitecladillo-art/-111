import { env } from 'cloudflare:workers';
import {
  ACCOUNT_SESSION_TTL_MS, EMAIL_CHALLENGE_ATTEMPTS, EMAIL_CHALLENGE_TTL_MS,
  EMAIL_SEND_COOLDOWN_MS, EMAIL_SEND_WINDOW_LIMIT, EMAIL_SEND_WINDOW_MS,
  AuthError, authHash, authNow, challengeId, invalidEmailChallenge, stableAccountOwner,
  type EmailChallenge,
} from '../lib/agent-email-auth';

type ChallengeRow = {
  email_hash: string; challenge_id: string; created_at: number; expires_at: number;
  attempts: number; delivered: number; consumed_at: number | null;
};
const challengeColumns = 'email_hash,challenge_id,created_at,expires_at,attempts,delivered,consumed_at';
async function withDatabase<T>(operation: (db: D1Database) => Promise<T>): Promise<T> {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('unavailable');
    return await operation(db);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(503, 'email_auth_storage_unavailable', '邮箱登录暂时不可用，请稍后重试。');
  }
}
function challenge(row: ChallengeRow): EmailChallenge {
  authHash(row.email_hash); challengeId(row.challenge_id); authNow(row.created_at); authNow(row.expires_at);
  if (row.expires_at - row.created_at !== EMAIL_CHALLENGE_TTL_MS || !Number.isInteger(row.attempts) || row.attempts < 0 || row.attempts > EMAIL_CHALLENGE_ATTEMPTS || ![0, 1].includes(row.delivered)) throw invalidEmailChallenge();
  if (row.consumed_at !== null) authNow(row.consumed_at);
  return { emailHash: row.email_hash, id: row.challenge_id, expiresAt: row.expires_at, attempts: row.attempts, delivered: row.delivered === 1, consumedAt: row.consumed_at };
}

/** A true rolling-hour limit survives replacing the active challenge. */
export async function reserveEmailChallenge(emailHash: string, id: string, codeHash: string, now = Date.now()): Promise<EmailChallenge> {
  authHash(emailHash); challengeId(id); authHash(codeHash); authNow(now);
  return withDatabase(async db => {
    const reservation = crypto.randomUUID();
    const results = await db.batch([
      db.prepare('DELETE FROM agent_email_rate_events WHERE email_hash=? AND reserved_at<=?').bind(emailHash, now - EMAIL_SEND_WINDOW_MS),
      db.prepare(`INSERT INTO agent_email_rate_events(email_hash,id,challenge_id,reserved_at)
        SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM agent_email_rate_events WHERE email_hash=?)<?
        AND NOT EXISTS(SELECT 1 FROM agent_email_rate_events WHERE email_hash=? AND reserved_at>?)
        AND NOT EXISTS(SELECT 1 FROM agent_email_challenges WHERE email_hash=? AND challenge_id=?) RETURNING id`)
        .bind(emailHash, reservation, id, now, emailHash, EMAIL_SEND_WINDOW_LIMIT, emailHash, now - EMAIL_SEND_COOLDOWN_MS, emailHash, id),
      db.prepare(`INSERT INTO agent_email_challenges(email_hash,challenge_id,code_hash,created_at,expires_at,attempts,delivered,consumed_at,consumption_nonce)
        SELECT ?,?,?,?,?,0,0,NULL,NULL WHERE EXISTS(SELECT 1 FROM agent_email_rate_events WHERE email_hash=? AND id=?)
        ON CONFLICT(email_hash) DO UPDATE SET challenge_id=excluded.challenge_id,code_hash=excluded.code_hash,
        created_at=excluded.created_at,expires_at=excluded.expires_at,attempts=0,delivered=0,consumed_at=NULL,consumption_nonce=NULL
        RETURNING ${challengeColumns}`)
        .bind(emailHash, id, codeHash, now, now + EMAIL_CHALLENGE_TTL_MS, emailHash, reservation),
    ]);
    const row = results[2].results[0] as ChallengeRow | undefined;
    if (!row) throw new AuthError(429, 'email_auth_rate_limited', '验证码请求过于频繁，请稍后再试。');
    return challenge(row);
  });
}
export async function getEmailChallenge(emailHash: string, now = Date.now()): Promise<EmailChallenge | null> {
  authHash(emailHash); authNow(now);
  return withDatabase(async db => {
    const row = await db.prepare(`SELECT ${challengeColumns} FROM agent_email_challenges
      WHERE email_hash=? AND expires_at>? AND consumed_at IS NULL AND attempts<?`).bind(emailHash, now, EMAIL_CHALLENGE_ATTEMPTS).first<ChallengeRow>();
    return row ? challenge(row) : null;
  });
}
/** Only the server mail adapter may mark a successfully delivered challenge. */
export async function markChallengeDelivered(emailHash: string, id: string): Promise<void> {
  authHash(emailHash); challengeId(id);
  return withDatabase(async db => {
    const row = await db.prepare('UPDATE agent_email_challenges SET delivered=1 WHERE email_hash=? AND challenge_id=? AND consumed_at IS NULL AND attempts<? RETURNING challenge_id')
      .bind(emailHash, id, EMAIL_CHALLENGE_ATTEMPTS).first();
    if (!row) throw invalidEmailChallenge();
  });
}
/** The nonce is mandatory: a resend between read/hash/verify cannot use an old code. */
export async function verifyEmailChallenge(emailHash: string, id: string, codeHash: string, now = Date.now()): Promise<{ accountOwner: string }> {
  authHash(emailHash); challengeId(id); authHash(codeHash); authNow(now);
  const accountOwner = await stableAccountOwner(emailHash), consumption = crypto.randomUUID();
  return withDatabase(async db => {
    const results = await db.batch([
      db.prepare(`UPDATE agent_email_challenges SET
        attempts=CASE WHEN code_hash=? THEN attempts ELSE attempts+1 END,
        consumed_at=CASE WHEN code_hash=? THEN ? ELSE NULL END,
        consumption_nonce=CASE WHEN code_hash=? THEN ? ELSE NULL END
        WHERE email_hash=? AND challenge_id=? AND delivered=1 AND expires_at>? AND created_at<=?
        AND consumed_at IS NULL AND attempts<? RETURNING consumed_at,consumption_nonce`)
        .bind(codeHash, codeHash, now, codeHash, consumption, emailHash, id, now, now, EMAIL_CHALLENGE_ATTEMPTS),
      db.prepare(`INSERT INTO agent_accounts(email_hash,owner_hash,created_at)
        SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM agent_email_challenges WHERE email_hash=? AND challenge_id=? AND consumption_nonce=? AND consumed_at=?)
        ON CONFLICT(email_hash) DO NOTHING RETURNING owner_hash`)
        .bind(emailHash, accountOwner, now, emailHash, id, consumption, now),
    ]);
    const receipt = results[0].results[0] as { consumed_at: number | null; consumption_nonce: string | null } | undefined;
    if (!receipt || receipt.consumed_at !== now || receipt.consumption_nonce !== consumption) throw invalidEmailChallenge();
    const account = await db.prepare('SELECT owner_hash FROM agent_accounts WHERE email_hash=? AND owner_hash=?').bind(emailHash, accountOwner).first<{ owner_hash: string }>();
    if (!account) throw invalidEmailChallenge();
    return { accountOwner: account.owner_hash };
  });
}

/** Bind only a newly server-signed session, after successful email verification. */
export async function bindAccountSession(sessionOwner: string, accountOwner: string, expiresAt: number, now = Date.now()): Promise<void> {
  authHash(sessionOwner); authHash(accountOwner); authNow(expiresAt); authNow(now);
  if (expiresAt <= now || expiresAt - now > ACCOUNT_SESSION_TTL_MS) throw invalidEmailChallenge();
  return withDatabase(async db => {
    const row = await db.prepare(`INSERT INTO agent_account_sessions(session_owner_hash,account_owner_hash,created_at,expires_at,revoked_at)
      SELECT ?,?,?,?,NULL WHERE EXISTS(SELECT 1 FROM agent_accounts WHERE owner_hash=?)
      ON CONFLICT(session_owner_hash) DO UPDATE SET expires_at=excluded.expires_at
      WHERE account_owner_hash=excluded.account_owner_hash AND revoked_at IS NULL RETURNING session_owner_hash`)
      .bind(sessionOwner, accountOwner, now, expiresAt, accountOwner).first();
    if (!row) throw new AuthError(401, 'email_session_required', '请重新完成邮箱登录。');
  });
}
export async function resolveAccountSession(sessionOwner: string, now = Date.now()): Promise<string | null> {
  authHash(sessionOwner); authNow(now);
  return withDatabase(async db => {
    const row = await db.prepare(`SELECT s.account_owner_hash FROM agent_account_sessions s
      JOIN agent_accounts a ON a.owner_hash=s.account_owner_hash
      WHERE s.session_owner_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.created_at<=?`)
      .bind(sessionOwner, now, now).first<{ account_owner_hash: string }>();
    return row ? authHash(row.account_owner_hash) : null;
  });
}
export async function revokeAccountSession(sessionOwner: string): Promise<void> {
  authHash(sessionOwner);
  return withDatabase(async db => {
    await db.prepare('UPDATE agent_account_sessions SET revoked_at=? WHERE session_owner_hash=? AND revoked_at IS NULL')
      .bind(Date.now(), sessionOwner).run();
  });
}
