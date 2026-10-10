import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import {
  ACCOUNT_SESSION_TTL_MS, EMAIL_CHALLENGE_TTL_MS, EMAIL_SEND_COOLDOWN_MS, EMAIL_SEND_WINDOW_MS,
  generateEmailCode, hashChallenge, hashEmail, normalizeInvitedEmail, stableAccountOwner,
} from '../lib/agent-email-auth.ts';

const NOW = 1_791_320_000_000;
const mail = 'synthetic.teammate@example.test';
const secret = new Uint8Array(32).fill(57);
const emailHash = await hashEmail(mail), otherHash = await hashEmail('other@example.test');
const correct = '012345';
const fail = (code, status) => error => error?.code === code && (status === undefined || error.status === status);
const binding = '__evix_email_auth_unit_binding__';
globalThis[binding] = {};
const moduleUrl = value => 'data:text/javascript;base64,' + Buffer.from(value).toString('base64');
const environment = moduleUrl(`export const env = globalThis[${JSON.stringify(binding)}];`);
let source = ts.transpileModule(readFileSync(new URL('../db/agent-account-repository.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
source = source.replaceAll("from 'cloudflare:workers'", `from '${environment}'`).replaceAll("from '../lib/agent-email-auth'", `from '${new URL('../lib/agent-email-auth.ts', import.meta.url).href}'`);
const repo = await import(moduleUrl(source));
function adapter(database) {
  return {
    prepare(sql) {
      const make = values => ({
        bind(...parameters) { return make(parameters); },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values), success: true }; },
        async run() { return { meta: database.prepare(sql).run(...values), success: true }; },
        execute() { return { results: database.prepare(sql).all(...values), success: true }; },
      });
      return make([]);
    },
    async batch(statements) {
      database.exec('BEGIN');
      try { const result = statements.map(statement => statement.execute()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}
async function using(work) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../drizzle/0018_agent_accounts.sql', import.meta.url), 'utf8'));
  globalThis[binding].DB = adapter(db);
  try { await work(db); } finally { db.close(); globalThis[binding].DB = undefined; }
}
async function reserve(hash = emailHash, time = NOW) {
  const id = randomUUID(), verifier = await hashChallenge(hash, id, correct, secret);
  const challenge = await repo.reserveEmailChallenge(hash, id, verifier, time);
  return { id, verifier, challenge, hash, time };
}
async function verified(hash = emailHash, time = NOW) {
  const item = await reserve(hash, time); await repo.markChallengeDelivered(hash, item.id);
  return { ...item, ...(await repo.verifyEmailChallenge(hash, item.id, item.verifier, time + 1)) };
}

test('invited email normalization is lowercase ASCII and invalid/noninvited responses are identical', () => {
  assert.equal(normalizeInvitedEmail('  SYNTHETIC.TEAMMATE@EXAMPLE.TEST  ', [mail]), mail);
  assert.equal(normalizeInvitedEmail(mail, [mail.toUpperCase()]), mail);
  const errors = [];
  for (const email of [null, 42, '', 'other@example.test', 'not-mail', 'a@localhost', 'a..b@example.test', '.a@example.test', 'a.@example.test', 'a@-example.test', 'a@ex ample.test', 'a@例子.test', 'a'.repeat(65) + '@example.test', 'a\u0000@example.test', 'a\n@example.test', 'a'.repeat(513)]) {
    try { normalizeInvitedEmail(email, [mail]); assert.fail('must reject'); } catch (error) { errors.push({ status: error.status, code: error.code, message: error.message }); }
  }
  assert(errors.every(error => JSON.stringify(error) === JSON.stringify(errors[0])));
  assert.equal(errors[0].code, 'email_invitation_required'); assert.equal(errors[0].status, 403);
});
test('uniform six-digit code rejects the biased tail of Uint32 and preserves leading zeros', () => {
  const original = crypto.getRandomValues, seen = [];
  crypto.getRandomValues = array => { seen.push(array.constructor.name); array[0] = seen.length === 1 ? 4_294_967_295 : 7; return array; };
  try { assert.equal(generateEmailCode(), '000007'); assert.deepEqual(seen, ['Uint32Array', 'Uint32Array']); }
  finally { crypto.getRandomValues = original; }
  for (let n = 0; n < 50; n++) assert.match(generateEmailCode(), /^\d{6}$/);
});
test('identity hash is stable across normalization and challenges bind email, nonce, code and domain-separated secret', async () => {
  assert.equal(await hashEmail(mail.toUpperCase()), emailHash); assert.notEqual(emailHash, otherHash);
  assert.match(emailHash, /^[a-f0-9]{64}$/); assert.doesNotMatch(emailHash, /example/);
  const id = randomUUID(), hash = await hashChallenge(emailHash, id, correct, secret);
  assert.equal(await hashChallenge(emailHash, id, correct, secret), hash);
  for (const [mailHash, nonce, code, seed] of [[otherHash, id, correct, secret], [emailHash, randomUUID(), correct, secret], [emailHash, id, '012346', secret], [emailHash, id, correct, new Uint8Array(32).fill(58)]]) assert.notEqual(await hashChallenge(mailHash, nonce, code, seed), hash);
  for (const code of ['', '12345', '1234567', '１２３４５６', '123 56', '12345\n']) await assert.rejects(hashChallenge(emailHash, id, code, secret), fail('email_code_invalid', 401));
  await assert.rejects(hashChallenge(emailHash, id, correct, new Uint8Array(16)), fail('email_auth_unavailable', 503));
  assert.equal(await stableAccountOwner(emailHash), await stableAccountOwner(emailHash));
  assert.notEqual(await stableAccountOwner(emailHash), emailHash);
});
test('reserve stores only hashed email/code and is unusable until actual delivery is marked', () => using(async db => {
  const item = await reserve(); assert.equal(item.challenge.delivered, false); assert.equal(item.challenge.expiresAt, NOW + EMAIL_CHALLENGE_TTL_MS);
  const dump = JSON.stringify(db.prepare('SELECT * FROM agent_email_challenges').all()); assert.doesNotMatch(dump, /synthetic.teammate|example.test|012345/);
  assert.deepEqual(await repo.getEmailChallenge(emailHash, NOW), item.challenge);
  await assert.rejects(repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + 1), fail('email_code_invalid', 401));
  assert.equal(db.prepare('SELECT attempts FROM agent_email_challenges').get().attempts, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_accounts').get().n, 0);
  await repo.markChallengeDelivered(emailHash, item.id); assert.equal((await repo.getEmailChallenge(emailHash, NOW)).delivered, true);
}));
test('successful code consumption is one-time and concurrent attempts have exactly one winner', () => using(async db => {
  const item = await reserve(); await repo.markChallengeDelivered(emailHash, item.id);
  const result = await Promise.allSettled([repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + 1), repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + 1)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal(result.find(item => item.status === 'rejected').reason.code, 'email_code_invalid');
  assert.equal(result.find(item => item.status === 'fulfilled').value.accountOwner, await stableAccountOwner(emailHash));
  await assert.rejects(repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + 2), fail('email_code_invalid', 401));
  assert.equal(await repo.getEmailChallenge(emailHash, NOW + 2), null); assert.equal(db.prepare('SELECT count(*) AS n FROM agent_accounts').get().n, 1);
}));
test('five wrong codes lock the challenge and parallel wrong attempts cannot exceed five', () => using(async db => {
  const item = await reserve(); await repo.markChallengeDelivered(emailHash, item.id);
  const wrong = await hashChallenge(emailHash, item.id, '999999', secret);
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => repo.verifyEmailChallenge(emailHash, item.id, wrong, NOW + 1)));
  assert(attempts.every(item => item.status === 'rejected' && item.reason.code === 'email_code_invalid'));
  assert.equal(db.prepare('SELECT attempts FROM agent_email_challenges').get().attempts, 5);
  await assert.rejects(repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + 2), fail('email_code_invalid', 401));
  assert.equal(await repo.getEmailChallenge(emailHash, NOW + 2), null); assert.equal(db.prepare('SELECT count(*) AS n FROM agent_accounts').get().n, 0);
}));
test('correct code after four mistakes succeeds and the TTL expires at its exact boundary', () => using(async () => {
  const item = await reserve(); await repo.markChallengeDelivered(emailHash, item.id); const wrong = await hashChallenge(emailHash, item.id, '999999', secret);
  for (let attempt = 0; attempt < 4; attempt++) await assert.rejects(repo.verifyEmailChallenge(emailHash, item.id, wrong, NOW + attempt));
  assert.equal((await repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + EMAIL_CHALLENGE_TTL_MS - 1)).accountOwner, await stableAccountOwner(emailHash));
  const expiring = await reserve(otherHash); await repo.markChallengeDelivered(otherHash, expiring.id);
  await assert.rejects(repo.verifyEmailChallenge(otherHash, expiring.id, expiring.verifier, NOW + EMAIL_CHALLENGE_TTL_MS), fail('email_code_invalid', 401));
  assert.equal(await repo.getEmailChallenge(otherHash, NOW + EMAIL_CHALLENGE_TTL_MS), null);
}));
test('resend cooldown remains atomic under concurrent reservation and failed delivery does not clear limits', () => using(async db => {
  const one = await reserve();
  for (const time of [NOW, NOW + EMAIL_SEND_COOLDOWN_MS - 1]) await assert.rejects(reserve(emailHash, time), fail('email_auth_rate_limited', 429));
  const outcomes = await Promise.allSettled([reserve(emailHash, NOW + EMAIL_SEND_COOLDOWN_MS), reserve(emailHash, NOW + EMAIL_SEND_COOLDOWN_MS)]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1); assert.equal(outcomes.find(item => item.status === 'rejected').reason.code, 'email_auth_rate_limited');
  await assert.rejects(repo.markChallengeDelivered(emailHash, one.id), fail('email_code_invalid', 401));
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_email_rate_events').get().n, 2);
}));
test('rolling hourly send budget cannot be reset by resend, code consumption or fixed-window boundary', () => using(async db => {
  for (let n = 0; n < 5; n++) await reserve(emailHash, NOW + n * EMAIL_SEND_COOLDOWN_MS);
  for (const time of [NOW + 5 * EMAIL_SEND_COOLDOWN_MS, NOW + EMAIL_SEND_WINDOW_MS - 1]) await assert.rejects(reserve(emailHash, time), fail('email_auth_rate_limited', 429));
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_email_rate_events WHERE email_hash=?').get(emailHash).n, 5);
  await reserve(emailHash, NOW + EMAIL_SEND_WINDOW_MS);
  await assert.rejects(reserve(emailHash, NOW + EMAIL_SEND_WINDOW_MS + EMAIL_SEND_COOLDOWN_MS - 1), fail('email_auth_rate_limited', 429));
  await reserve(emailHash, NOW + EMAIL_SEND_WINDOW_MS + EMAIL_SEND_COOLDOWN_MS);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_email_rate_events WHERE email_hash=?').get(emailHash).n, 5);
  await reserve(otherHash, NOW); assert.equal(db.prepare('SELECT count(*) AS n FROM agent_email_rate_events WHERE email_hash=?').get(otherHash).n, 1);
}));
test('stale nonce cannot verify, mark delivered or reset attempts after resend; reusing latest ID is denied', () => using(async db => {
  const old = await reserve(); await repo.markChallengeDelivered(emailHash, old.id);
  const current = await reserve(emailHash, NOW + EMAIL_SEND_COOLDOWN_MS); await repo.markChallengeDelivered(emailHash, current.id);
  await assert.rejects(repo.verifyEmailChallenge(emailHash, old.id, old.verifier, NOW + EMAIL_SEND_COOLDOWN_MS + 1), fail('email_code_invalid', 401));
  await assert.rejects(repo.markChallengeDelivered(emailHash, old.id), fail('email_code_invalid', 401));
  assert.equal(db.prepare('SELECT attempts FROM agent_email_challenges').get().attempts, 0);
  await assert.rejects(repo.reserveEmailChallenge(emailHash, current.id, current.verifier, NOW + 2 * EMAIL_SEND_COOLDOWN_MS), fail('email_auth_rate_limited', 429));
  assert.equal((await repo.getEmailChallenge(emailHash, NOW + EMAIL_SEND_COOLDOWN_MS + 1)).id, current.id);
}));
test('wrong email cannot consume another email challenge and future-issued challenges do not verify', () => using(async db => {
  const item = await reserve(); await repo.markChallengeDelivered(emailHash, item.id);
  await assert.rejects(repo.verifyEmailChallenge(otherHash, item.id, item.verifier, NOW + 1), fail('email_code_invalid', 401));
  await assert.rejects(repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW - 1), fail('email_code_invalid', 401));
  assert.equal(db.prepare('SELECT attempts FROM agent_email_challenges').get().attempts, 0);
}));
test('account creation and consumption roll back together on database failure', () => using(async db => {
  const item = await reserve(); await repo.markChallengeDelivered(emailHash, item.id);
  db.exec("CREATE TRIGGER fail_account_insert BEFORE INSERT ON agent_accounts BEGIN SELECT RAISE(ABORT,'sensitive driver message'); END;");
  await assert.rejects(repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + 1), fail('email_auth_storage_unavailable', 503));
  assert.equal(db.prepare('SELECT consumed_at FROM agent_email_challenges').get().consumed_at, null);
  db.exec('DROP TRIGGER fail_account_insert'); assert.equal((await repo.verifyEmailChallenge(emailHash, item.id, item.verifier, NOW + 2)).accountOwner, await stableAccountOwner(emailHash));
}));
test('same verified email on different devices resolves one stable owner and unique sessions', () => using(async db => {
  const first = await verified(), second = await verified(emailHash, NOW + EMAIL_SEND_COOLDOWN_MS);
  assert.equal(first.accountOwner, second.accountOwner); assert.equal(db.prepare('SELECT count(*) AS n FROM agent_accounts').get().n, 1);
  const sessionOne = 'a'.repeat(64), sessionTwo = 'b'.repeat(64);
  await repo.bindAccountSession(sessionOne, first.accountOwner, NOW + ACCOUNT_SESSION_TTL_MS, NOW);
  await repo.bindAccountSession(sessionTwo, second.accountOwner, NOW + ACCOUNT_SESSION_TTL_MS, NOW);
  assert.equal(await repo.resolveAccountSession(sessionOne, NOW + 1), first.accountOwner); assert.equal(await repo.resolveAccountSession(sessionTwo, NOW + 1), first.accountOwner);
  assert.equal(await repo.resolveAccountSession('c'.repeat(64), NOW + 1), null);
}));
test('sessions require an actually verified account, cap expiry at 30 days, and expire exactly', () => using(async () => {
  const account = await verified(), session = 'a'.repeat(64);
  await assert.rejects(repo.bindAccountSession(session, 'c'.repeat(64), NOW + 1000, NOW), fail('email_session_required', 401));
  for (const expires of [NOW, NOW - 1, NOW + ACCOUNT_SESSION_TTL_MS + 1]) await assert.rejects(repo.bindAccountSession(session, account.accountOwner, expires, NOW), fail('email_code_invalid', 401));
  await repo.bindAccountSession(session, account.accountOwner, NOW + 1000, NOW);
  assert.equal(await repo.resolveAccountSession(session, NOW - 1), null);
  assert.equal(await repo.resolveAccountSession(session, NOW + 999), account.accountOwner); assert.equal(await repo.resolveAccountSession(session, NOW + 1000), null);
}));
test('logout revokes the server session permanently and cannot rebind it to another account', () => using(async () => {
  const account = await verified(), otherAccount = await verified(otherHash), session = 'a'.repeat(64);
  await repo.bindAccountSession(session, account.accountOwner, NOW + 1000, NOW);
  await assert.rejects(repo.bindAccountSession(session, otherAccount.accountOwner, NOW + 1000, NOW), fail('email_session_required', 401));
  await repo.revokeAccountSession(session); assert.equal(await repo.resolveAccountSession(session, NOW + 1), null);
  await repo.revokeAccountSession(session);
  await assert.rejects(repo.bindAccountSession(session, account.accountOwner, NOW + 1000, NOW), fail('email_session_required', 401));
}));
test('account deletion has no cascade relationship with encrypted BYOK service configurations', () => using(async db => {
  const account = await verified();
  db.exec(readFileSync(new URL('../drizzle/0016_agent_services.sql', import.meta.url), 'utf8'));
  db.prepare("INSERT INTO agent_services(id,owner_hash,label,provider,base_url,model,capabilities,max_output_tokens,revision,key_version,key_id,key_iv,key_ciphertext,created_at,updated_at) VALUES(?,?,'test','openai','https://api.openai.com/v1','test','[\"questionnaire\"]',128,1,1,'test',?,?,?,?)")
    .run(randomUUID(), account.accountOwner, 'a'.repeat(16), 'a'.repeat(32), 'synthetic', 'synthetic');
  db.prepare('DELETE FROM agent_accounts WHERE email_hash=?').run(emailHash);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_services').get().n, 1);
}));
test('storage failures and invalid caller identity remain fixed safe errors', async () => {
  for (const hash of ['not-owner', 'A'.repeat(64), '', null]) await assert.rejects(repo.resolveAccountSession(hash, NOW), fail('email_code_invalid', 401));
  globalThis[binding].DB = { prepare() { throw Error('SQL/raw email ' + mail); } };
  try { await repo.getEmailChallenge(emailHash, NOW); assert.fail('must fail'); } catch (error) { assert.equal(error.code, 'email_auth_storage_unavailable'); assert.doesNotMatch(error.message, /SQL|synthetic.teammate/); }
  finally { globalThis[binding].DB = undefined; }
  await assert.rejects(repo.getEmailChallenge(emailHash, NOW), fail('email_auth_storage_unavailable', 503));
});
