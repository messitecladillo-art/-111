import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import {
  SERVICE_LIMIT, encryptServiceKey, decryptServiceKey, parseServiceInput,
  parseServiceUsage, serviceOwner, serviceRevision,
} from '../lib/agent-services.ts';

const owner = 'a'.repeat(64), other = 'b'.repeat(64);
const master = { keyId: 'synthetic-test-key-v1', key: new Uint8Array(32).fill(17) };
const secret = 'synthetic-test-key-do-not-use';
const context = { owner, id: randomUUID(), revision: 1 };
const input = (patch = {}) => ({
  id: randomUUID(), label: 'Synthetic configuration', provider: 'openai', baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-test', capabilities: ['questionnaire', 'report'], maxOutputTokens: 512, apiKey: secret, ...patch,
});
const usage = (serviceId, patch = {}) => ({ id: randomUUID(), serviceId, serviceRevision: 1, capability: 'questionnaire', status: 'succeeded', durationMs: 50, inputTokens: 200, outputTokens: 10, ...patch });
const fail = (code, status) => error => error?.code === code && (status === undefined || error.status === status);

// Compile only the production repository and substitute its Cloudflare binding.
// SQLite executes actual migration SQL and prepared statements, with no server.
const binding = '__evix_agent_service_unit_binding__';
globalThis[binding] = {};
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const environment = url(`export const env = globalThis[${JSON.stringify(binding)}];`);
let source = ts.transpileModule(readFileSync(new URL('../db/agent-service-repository.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
source = source.replaceAll("from 'cloudflare:workers'", `from '${environment}'`)
  .replaceAll("from '../lib/agent-services'", `from '${new URL('../lib/agent-services.ts', import.meta.url).href}'`);
const repository = await import(url(source));
function adapter(database) {
  return {
    prepare(sql) {
      const statement = values => ({
        bind(...parameters) { return statement(parameters); },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values), success: true }; },
        async run() { return { meta: database.prepare(sql).run(...values), success: true }; },
      });
      return statement([]);
    },
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        database.exec('COMMIT');
        return results;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}
async function using(work) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../drizzle/0016_agent_services.sql', import.meta.url), 'utf8'));
  globalThis[binding].DB = adapter(db);
  try { await work(db); } finally { db.close(); globalThis[binding].DB = undefined; }
}
function withoutKey(config) { const result = { ...config }; delete result.apiKey; return result; }

test('strict service input preserves exact HTTPS destinations and copies capabilities', () => {
  const data = input(), parsed = parseServiceInput(data);
  assert.deepEqual(parsed, data); assert.notEqual(parsed.capabilities, data.capabilities);
  for (const baseUrl of ['http://localhost/v1', 'https://api.openai.com/v1/', 'https://api.openai.com/v1?q=secret', 'https://api.openai.com/v1#secret', 'https://secret@api.openai.com/v1', 'https://API.OPENAI.COM/v1', 'https://api.openai.com:443/v1']) {
    assert.throws(() => parseServiceInput(input({ baseUrl })), fail('invalid_service_input', 400));
  }
  assert.equal(parseServiceInput(input({ provider: 'compatible', baseUrl: 'https://operator.example/api/v1' })).provider, 'compatible');
});
test('unknown fields, symbols, getters, prototypes and sparse capability arrays fail before evaluation', () => {
  let reads = 0;
  const getter = input(); Object.defineProperty(getter, 'apiKey', { enumerable: true, get() { reads++; return secret; } });
  const capabilities = ['questionnaire']; Object.defineProperty(capabilities, '0', { enumerable: true, get() { reads++; return 'questionnaire'; } });
  const sparse = ['questionnaire']; sparse.length = 2;
  const hidden = input(); Object.defineProperty(hidden, 'label', { value: 'hidden', enumerable: false });
  for (const bad of [null, [], getter, hidden, Object.assign(Object.create(null), input()), input({ owner }), input({ revision: 1 }), input({ [Symbol('secret')]: 'ignored' }), input({ capabilities }), input({ capabilities: sparse }), input({ capabilities: Object.assign(['questionnaire'], { extra: true }) })]) {
    assert.throws(() => parseServiceInput(bad), fail('invalid_service_input', 400));
  }
  assert.equal(reads, 0);
});
test('all strings, model, key, limits and capability sets have explicit bounded contracts', () => {
  for (const patch of [
    { id: '../escape' }, { id: randomUUID().toUpperCase() }, { label: 'x'.repeat(81) }, { label: '' }, { label: ' bad ' }, { label: 'bad\u0000' },
    { model: 'x'.repeat(121) }, { model: 'bad model' }, { model: 'model\nAuthorization' }, { baseUrl: 'https://example.test/' + 'x'.repeat(510) },
    { apiKey: '' }, { apiKey: 'short' }, { apiKey: 'x'.repeat(513) }, { apiKey: 'bad\u0001key-test' }, { apiKey: 'bad\r\nkey-test' }, { apiKey: secret + '\u0085' }, { apiKey: 'with space' },
    { capabilities: [] }, { capabilities: ['unknown'] }, { capabilities: ['questionnaire', 'questionnaire'] }, { capabilities: ['questionnaire', 'report', 'defense', 'research', 'questionnaire'] },
    { provider: 'not-supported' }, { maxOutputTokens: 127 }, { maxOutputTokens: 4097 }, { maxOutputTokens: 128.5 }, { maxOutputTokens: NaN }, { maxOutputTokens: '512' },
  ]) assert.throws(() => parseServiceInput(input(patch)), fail('invalid_service_input', 400));
  for (const maxOutputTokens of [128, 4096]) assert.equal(parseServiceInput(input({ maxOutputTokens })).maxOutputTokens, maxOutputTokens);
  assert.equal('apiKey' in parseServiceInput(withoutKey(input())), false);
  for (const revision of [-1, 0, 1.2, Infinity, '1', 2_147_483_648]) assert.throws(() => serviceRevision(revision));
  assert.equal(serviceRevision(0, true), 0);
  for (const bad of ['', 'user123', 'A'.repeat(64), null]) assert.throws(() => serviceOwner(bad), fail('service_owner_required', 401));
});
test('AES-256-GCM roundtrips with random 96-bit IV and exposes no plaintext', async () => {
  const one = await encryptServiceKey(secret, context, master), two = await encryptServiceKey(secret, context, master);
  assert.equal(await decryptServiceKey(one, context, master), secret);
  assert.equal(Buffer.from(one.iv, 'base64url').length, 12); assert.notEqual(one.iv, two.iv); assert.notEqual(one.ciphertext, two.ciphertext);
  assert.doesNotMatch(JSON.stringify(one), /synthetic-test-key-do-not-use/);
  assert.deepEqual(Object.keys(one).sort(), ['ciphertext', 'iv', 'keyId', 'version']);
});
test('ciphertext, IV, master key, owner, ID, revision and key ID tampering is rejected', async () => {
  const sealed = await encryptServiceKey(secret, context, master);
  const tamper = value => (value[0] === 'A' ? 'B' : 'A') + value.slice(1);
  for (const changed of [{ ...sealed, ciphertext: tamper(sealed.ciphertext) }, { ...sealed, iv: tamper(sealed.iv) }, { ...sealed, keyId: 'other-key' }, { ...sealed, version: 2 }, { ...sealed, ciphertext: sealed.ciphertext + '=' }, { ...sealed, extra: true }]) {
    await assert.rejects(decryptServiceKey(changed, context, master), fail('service_key_integrity', 409));
  }
  for (const changed of [{ ...context, owner: other }, { ...context, id: randomUUID() }, { ...context, revision: 2 }]) await assert.rejects(decryptServiceKey(sealed, changed, master), fail('service_key_integrity', 409));
  await assert.rejects(decryptServiceKey(sealed, context, { ...master, key: new Uint8Array(32).fill(18) }), fail('service_key_integrity', 409));
});
test('master key must be a server-supplied 256-bit key with a valid ID', async () => {
  for (const invalid of [undefined, { ...master, key: new Uint8Array(16) }, { ...master, key: Array(32).fill(17) }, { ...master, keyId: '../keys' }, { ...master, keyId: '' }]) {
    await assert.rejects(encryptServiceKey(secret, context, invalid), fail('service_master_key_unavailable', 503));
  }
});
test('usage contract rejects prompt/answer/owner injection and unbounded metadata', () => {
  const good = usage(randomUUID()); assert.deepEqual(parseServiceUsage(good), good);
  for (const patch of [{ prompt: secret }, { answer: 'text' }, { owner }, { errorCode: 'raw upstream answer' }, { errorCode: 'x'.repeat(65) }, { inputTokens: -1 }, { outputTokens: 1_000_001 }, { durationMs: 120_001 }, { serviceRevision: 0 }, { status: 'approved' }, { capability: 'test' }]) assert.throws(() => parseServiceUsage({ ...good, ...patch }));
});
test('database stores only authenticated ciphertext and lists exact public summaries', () => using(async db => {
  const data = input(), saved = await repository.saveService(owner, data, 0, master);
  assert.equal(saved.revision, 1); assert.deepEqual(saved, { ...withoutKey(data), revision: 1 });
  assert.deepEqual(await repository.listServices(owner), [saved]); assert.deepEqual(await repository.listServices(other), []);
  const stored = db.prepare('SELECT * FROM agent_services').get();
  assert.doesNotMatch(JSON.stringify(stored), /synthetic-test-key-do-not-use/);
  assert.equal(stored.owner_hash, owner); assert.equal(stored.key_iv.length, 16);
  assert.deepEqual(await repository.readService(owner, data.id, master), { config: saved, apiKey: secret });
  assert.equal(Object.keys(saved).length, 8); assert.equal('keyId' in saved, false); assert.equal('ciphertext' in saved, false);
}));
test('cross-owner reads, writes, removes and logs cannot touch a service', () => using(async db => {
  const data = input(); await repository.saveService(owner, data, 0, master);
  await assert.rejects(repository.readService(other, data.id, master), fail('service_not_found', 404));
  await assert.rejects(repository.saveService(other, data, 1, master), fail('service_not_found', 404));
  await assert.rejects(repository.removeService(other, data.id, 1), fail('service_not_found', 404));
  await assert.rejects(repository.recordServiceUsage(other, usage(data.id)), fail('service_not_found', 404));
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_services').get().n, 1); assert.equal(db.prepare('SELECT count(*) AS n FROM agent_service_usage').get().n, 0);
  // Same UUID in another namespace creates an independent encrypted configuration.
  const otherData = { ...data, apiKey: 'synthetic-other-secret' }; await repository.saveService(other, otherData, 0, master);
  assert.equal((await repository.readService(other, data.id, master)).apiKey, otherData.apiKey);
  assert.equal((await repository.readService(owner, data.id, master)).apiKey, secret);
}));
test('CAS updates select exactly one winner and reencrypt unchanged secrets for each revision', () => using(async db => {
  const data = input(); await repository.saveService(owner, data, 0, master);
  const before = db.prepare('SELECT key_ciphertext FROM agent_services').get().key_ciphertext;
  const changes = await Promise.allSettled(['A', 'B'].map(label => repository.saveService(owner, withoutKey({ ...data, label }), 1, master)));
  assert.equal(changes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(changes.find(result => result.status === 'rejected').reason.code, 'service_revision_conflict');
  const latest = await repository.readService(owner, data.id, master); assert.equal(latest.config.revision, 2); assert.equal(latest.apiKey, secret);
  assert.notEqual(db.prepare('SELECT key_ciphertext FROM agent_services').get().key_ciphertext, before);
  await assert.rejects(repository.removeService(owner, data.id, 1), fail('service_revision_conflict', 409));
  await assert.rejects(repository.saveService(owner, data, 0, master), fail('service_revision_conflict', 409));
}));
test('create requires a key and destination changes require a fresh key', () => using(async () => {
  const data = input(); await assert.rejects(repository.saveService(owner, withoutKey(data), 0, master), fail('service_key_required', 400));
  await repository.saveService(owner, data, 0, master);
  for (const patch of [{ provider: 'deepseek' }, { baseUrl: 'https://operator.example/v1' }]) await assert.rejects(repository.saveService(owner, withoutKey({ ...data, ...patch }), 1, master), fail('service_key_required', 400));
  const upgraded = await repository.saveService(owner, { ...data, provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'synthetic-new-secret' }, 1, master);
  assert.equal(upgraded.revision, 2); assert.equal((await repository.readService(owner, data.id, master)).apiKey, 'synthetic-new-secret');
}));
test('capacity remains eight under concurrent final-slot insertion and updates at capacity', () => using(async () => {
  let first;
  for (let n = 0; n < SERVICE_LIMIT - 1; n++) { const data = input(); first ??= data; await repository.saveService(owner, data, 0, master); }
  const results = await Promise.allSettled([input(), input()].map(data => repository.saveService(owner, data, 0, master)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(results.find(result => result.status === 'rejected').reason.code, 'service_limit');
  assert.equal((await repository.listServices(owner)).length, SERVICE_LIMIT);
  assert.equal((await repository.saveService(owner, withoutKey({ ...first, label: 'update at capacity' }), 1, master)).revision, 2);
  await repository.saveService(other, input(), 0, master); assert.equal((await repository.listServices(other)).length, 1);
}));
test('stored ciphertext cannot be moved to another owner or replayed at another revision', () => using(async db => {
  const data = input(); await repository.saveService(owner, data, 0, master); const original = db.prepare('SELECT * FROM agent_services').get();
  await repository.saveService(other, { ...data, apiKey: 'synthetic-other-secret' }, 0, master);
  db.prepare('UPDATE agent_services SET key_iv=?,key_ciphertext=? WHERE owner_hash=?').run(original.key_iv, original.key_ciphertext, other);
  await assert.rejects(repository.readService(other, data.id, master), fail('service_key_integrity', 409));
  await repository.saveService(owner, withoutKey(data), 1, master);
  db.prepare('UPDATE agent_services SET key_iv=?,key_ciphertext=? WHERE owner_hash=?').run(original.key_iv, original.key_ciphertext, owner);
  await assert.rejects(repository.readService(owner, data.id, master), fail('service_key_integrity', 409));
}));
test('server master rotation accepts a new key only when user supplies a replacement secret', () => using(async () => {
  const data = input(); await repository.saveService(owner, data, 0, master);
  const rotated = { keyId: 'synthetic-test-key-v2', key: new Uint8Array(32).fill(23) };
  await assert.rejects(repository.readService(owner, data.id, rotated), fail('service_key_integrity', 409));
  await assert.rejects(repository.saveService(owner, withoutKey(data), 1, rotated), fail('service_key_integrity', 409));
  await repository.saveService(owner, data, 1, rotated); assert.equal((await repository.readService(owner, data.id, rotated)).apiKey, secret);
}));
test('usage logging is owner-isolated, metadata-only and immutable by idempotency token', () => using(async db => {
  const data = input(); await repository.saveService(owner, data, 0, master);
  const receipt = usage(data.id); await repository.recordServiceUsage(owner, receipt); await repository.recordServiceUsage(owner, receipt);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_service_usage').get().n, 1);
  const row = db.prepare('SELECT * FROM agent_service_usage').get();
  assert.equal(row.owner_hash, owner); assert.equal(row.input_tokens, 200); assert.equal(row.output_tokens, 10); assert.equal('prompt' in row, false); assert.equal('answer' in row, false);
  await assert.rejects(repository.recordServiceUsage(owner, { ...receipt, status: 'failed' }), fail('service_usage_id_reused', 409));
  await repository.saveService(owner, withoutKey(data), 1, master); await repository.recordServiceUsage(owner, usage(data.id));
  await assert.rejects(repository.recordServiceUsage(owner, usage(data.id, { serviceRevision: 3 })), fail('service_not_found', 404));
  await repository.removeService(owner, data.id, 2); assert.equal(db.prepare('SELECT count(*) AS n FROM agent_service_usage').get().n, 0);
  await assert.rejects(repository.readService(owner, data.id, master), fail('service_not_found', 404));
}));
test('log retention keeps the newest insertion at same-millisecond capacity and never deletes another owner', () => using(async db => {
  const data = input(), otherData = input(); await repository.saveService(owner, data, 0, master); await repository.saveService(other, otherData, 0, master);
  const insert = db.prepare("INSERT INTO agent_service_usage(id,owner_hash,service_id,service_revision,capability,status,duration_ms,created_at) VALUES(?,?,?,1,'questionnaire','succeeded',0,?)");
  const timestamp = new Date().toISOString();
  for (let n = 0; n < repository.SERVICE_USAGE_LIMIT; n++) insert.run(randomUUID(), owner, data.id, timestamp);
  insert.run(randomUUID(), other, otherData.id, timestamp);
  const newest = usage(data.id); await repository.recordServiceUsage(owner, newest);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_service_usage WHERE owner_hash=?').get(owner).n, repository.SERVICE_USAGE_LIMIT);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_service_usage WHERE owner_hash=?').get(other).n, 1);
  assert.equal(db.prepare('SELECT id FROM agent_service_usage WHERE owner_hash=? AND id=?').get(owner, newest.id).id, newest.id);
}));
test('missing or failing D1 never falls back to memory and driver bindings never enter errors', async () => {
  globalThis[binding].DB = undefined; await assert.rejects(repository.listServices(owner), fail('service_storage_unavailable', 503));
  globalThis[binding].DB = { prepare() { throw Error('SQL secret=' + secret); } };
  try { await repository.listServices(owner); assert.fail('must fail closed'); } catch (error) { assert.equal(error.code, 'service_storage_unavailable'); assert.doesNotMatch(error.message, /SQL|synthetic-test-key-do-not-use/); }
  finally { globalThis[binding].DB = undefined; }
});
