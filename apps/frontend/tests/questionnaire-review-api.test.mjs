import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import ts from 'typescript';
import {legacySource} from './helpers/legacy-source.mjs';
import { newQuestionnaire } from '../lib/questionnaire.ts';
import { reviewQuestionnaire, QUESTIONNAIRE_REVIEW_ENGINE } from '../lib/questionnaire-review.ts';

// Actual route/auth/repository source with an in-memory SQLite implementation of
// D1's small prepared-statement API. No HTTP server, Wrangler or user database.
const app = new URL('../', import.meta.url), binding = '__evix_questionnaire_review_unit_binding__';
globalThis[binding] = {};
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const environment = moduleUrl(`export const env = globalThis[${JSON.stringify(binding)}];`);
function compiled(path, replacements) {
  let text = ts.transpileModule(readFileSync(legacySource(new URL(path, app)), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(replacements)) {
    text = text.replaceAll(`from '${from}'`, `from '${to}'`).replaceAll(`from "${from}"`, `from "${to}"`);
  }
  return moduleUrl(text);
}
const http = compiled('app/api/_lib/http.ts', {});
const security = compiled('app/api/_lib/security.ts', { './http': http });
const recovery = compiled('db/editor-recovery-repository.ts', { 'cloudflare:workers': environment, '../app/api/_lib/http': http });
const auth = compiled('app/api/_lib/editor-auth.ts', { './http': http, './security': security, '../../../db/editor-recovery-repository': recovery });
const libraryUrl = new URL('lib/questionnaire-library.ts', app).href, designUrl = new URL('lib/questionnaire.ts', app).href, engineUrl = new URL('lib/questionnaire-review.ts', app).href;
const integrity = compiled('db/questionnaire-review-integrity.ts', { '../app/api/_lib/http': http, '../app/api/_lib/security': security, '../lib/questionnaire-library': libraryUrl, '../lib/questionnaire-review': engineUrl });
const libraryRepo = compiled('db/questionnaire-repository.ts', { 'cloudflare:workers': environment, '../app/api/_lib/http': http, '../app/api/_lib/security': security, '../lib/questionnaire-library': libraryUrl, './questionnaire-review-integrity': integrity });
const reviewRepo = compiled('db/questionnaire-review-repository.ts', { 'cloudflare:workers': environment, '../app/api/_lib/http': http, '../app/api/_lib/security': security, './questionnaire-repository': libraryRepo, '../lib/questionnaire-review': engineUrl, './questionnaire-review-integrity': integrity });
const legacyInput = compiled('app/api/drafts/questionnaires/_input.ts', { '@/app/api/_lib/http': http, '@/app/api/_lib/security': security, '@/lib/questionnaire-library': libraryUrl, '@/lib/questionnaire': designUrl });
const routeModule = compiled('app/api/drafts/questionnaires/[id]/versions/[versionId]/review/route.ts', { '@/app/api/_lib/http': http, '@/app/api/_lib/editor-auth': auth, '@/lib/questionnaire': designUrl, '../../../../_input': legacyInput, '@/db/questionnaire-review-repository': reviewRepo });
const route = await import(routeModule), repository = await import(libraryRepo), { editorOwner } = await import(auth);
const sha = value => createHash('sha256').update(value).digest('hex');
const cookie = actor => `evix_editor_session=evx_${actor.repeat(43)}`;

function adapter(db) {
  return { prepare(sql) {
    const statement = params => ({
      bind(...values) { return statement(values); },
      async first() { return db.prepare(sql).get(...params) ?? null; },
      async all() { return { results: db.prepare(sql).all(...params), success: true }; },
      async run() { return { ...db.prepare(sql).run(...params), success: true }; },
    });
    return statement([]);
  } };
}
async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync(new URL('drizzle/', app)).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`drizzle/${name}`, app), 'utf8'));
  globalThis[binding].DB = adapter(db);
  const projectId = randomUUID(), versionId = randomUUID();
  const owner = await editorOwner(new Request('http://localhost/api/drafts/questionnaires', { headers: { cookie: cookie('a') } }));
  const content = newQuestionnaire(); content.title = '合成结构检查；不是实际调查';
  const saved = await repository.saveQuestionnaireVersion({ kind: 'create', projectId, versionId, baseRevision: 0, label: 'synthetic v1', content }, owner);
  const context = { params: Promise.resolve({ id: projectId, versionId }) };
  async function call(method = 'GET', options = {}) {
    const body = options.body ?? { expectedSha256: saved.version.sha256, consent: true };
    const request = new Request(`http://localhost/api/drafts/questionnaires/${projectId}/versions/${versionId}/review`, {
      method, headers: { cookie: cookie(options.actor ?? 'a'), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...options.headers },
      ...(method === 'POST' ? { body: options.raw ?? JSON.stringify(body), ...(options.raw instanceof ReadableStream ? { duplex: 'half' } : {}) } : {}),
    });
    const response = await route[method](request, options.context ?? context);
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { db, owner, projectId, versionId, saved, context, content, call,
    count: () => db.prepare('SELECT count(*) AS n FROM questionnaire_design_reviews').get().n,
    close() { db.close(); globalThis[binding].DB = undefined; },
  };
}
async function using(work) { const f = await fixture(); try { await work(f); } finally { f.close(); } }

test('GET is read-only and returns null before explicit execution', () => using(async f => {
  const sourceBefore = JSON.stringify(f.db.prepare('SELECT * FROM questionnaire_versions').all());
  const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.body.review, null);
  assert.equal(result.body.currentRevision, 1); assert.equal(result.body.storage, 'd1'); assert.equal(result.body.scope, f.owner); assert.equal(f.count(), 0);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM questionnaire_versions').all()), sourceBefore);
}));
test('POST executes server engine and returns source-bound hashed result, not a human approval', () => using(async f => {
  const before = JSON.stringify(f.db.prepare('SELECT * FROM questionnaire_versions').all());
  const result = await f.call('POST'); assert.equal(result.status, 201); assert.equal(result.body.replayed, false);
  const review = result.body.review; assert.equal(review.projectId, f.projectId); assert.equal(review.versionId, f.versionId); assert.equal(review.revision, 1);
  assert.equal(review.sourceSha256, f.saved.version.sha256); assert.equal(review.engine, QUESTIONNAIRE_REVIEW_ENGINE);
  assert.deepEqual(review.result, reviewQuestionnaire(f.content)); assert.equal(review.resultSha256, sha(JSON.stringify(review.result)));
  assert.equal(review.result.classification, 'automated_design_check'); assert.notEqual(review.result.status, 'pass');
  assert.equal(new Date(review.createdAt).toISOString(), review.createdAt); assert.equal(f.count(), 1);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM questionnaire_versions').all()), before);
}));
test('same owner/version/engine replay preserves exact ID/time/result and makes no duplicate', () => using(async f => {
  const first = await f.call('POST'), second = await f.call('POST'), read = await f.call();
  assert.equal(second.status, 200); assert.equal(second.body.replayed, true); assert.deepEqual(second.body.review, first.body.review);
  assert.deepEqual(read.body.review, first.body.review); assert.equal(f.count(), 1);
}));
test('concurrent execution calls atomically retain one record', () => using(async f => {
  const results = await Promise.all([f.call('POST'), f.call('POST')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201]); assert.deepEqual(results[0].body.review, results[1].body.review); assert.equal(f.count(), 1);
}));
test('cross-owner GET and POST are indistinguishable from missing source', () => using(async f => {
  await f.call('POST');
  for (const method of ['GET', 'POST']) { const r = await f.call(method, { actor: 'b' }); assert.equal(r.status, 404); assert.equal(r.body.review, undefined); }
  assert.equal(f.count(), 1);
}));
test('origin/scope/auth protections execute before persistence', () => using(async f => {
  assert.equal((await f.call('POST', { headers: { origin: 'https://external.invalid' } })).status, 403);
  assert.equal((await f.call('POST', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await f.call('POST', { headers: { 'x-editor-scope': '0'.repeat(64) } })).status, 409);
  assert.equal((await f.call('POST', { headers: { cookie: '' } })).status, 401); assert.equal(f.count(), 0);
}));
test('client result/source/engine/status injection and non-true consent are rejected', () => using(async f => {
  const body = { expectedSha256: f.saved.version.sha256, consent: true };
  for (const patch of [{ result: {} }, { content: f.content }, { engine: 'approved' }, { status: 'pass' }, { owner: f.owner }, { consent: false }, { consent: 'true' }, { expectedSha256: 'A'.repeat(64) }]) {
    assert.equal((await f.call('POST', { body: { ...body, ...patch } })).status, 400);
  }
  assert.equal(f.count(), 0);
}));
test('invalid content type, JSON, decoded duplicate fields and UTF-8 fail closed', () => using(async f => {
  const raw = JSON.stringify({ expectedSha256: f.saved.version.sha256, consent: true });
  for (const bad of ['{', raw.replace('"consent":true', '"consent":false,"consent":true'), raw.replace('"consent":true', '"consent":false,"conse\\u006et":true'), new Uint8Array([255])]) {
    assert.equal((await f.call('POST', { raw: bad })).status, 400);
  }
  assert.equal((await f.call('POST', { headers: { 'content-type': 'text/plain' } })).status, 415); assert.equal(f.count(), 0);
}));
test('request is capped at 1024 bytes and does not wait for absent EOF', { timeout: 2000 }, () => using(async f => {
  const raw = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1025)); }, cancel() { return new Promise(() => {}); } });
  let timer;
  try { const response = await Promise.race([f.call('POST', { raw }), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('unbounded request read')), 500); })]); assert.equal(response.status, 413); }
  finally { clearTimeout(timer); }
  assert.equal(f.count(), 0);
}));
test('rejected headers never read or lock the original body; following valid execution remains usable', () => using(async f => {
  for (const scenario of [
    { headers: { 'content-type': 'text/plain' }, status: 415, code: 'unsupported_media_type' },
    { headers: { 'content-length': '1025' }, status: 413, code: 'payload_too_large' },
  ]) {
    let pulls = 0;
    const raw = new ReadableStream({ pull() { pulls++; return new Promise(() => {}); } }, { highWaterMark: 0 });
    const result = await f.call('POST', { raw, headers: scenario.headers });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.status, scenario.status); assert.equal(result.body.error.code, scenario.code);
    assert.equal(pulls, 0, 'header validation must precede any request-body read');
    assert.equal(raw.locked, false, 'a rejected header must leave the original stream unlocked');
    assert.equal(f.count(), 0);
  }
  assert.equal((await f.call('POST')).status, 201); assert.equal(f.count(), 1);
}));
test('expected source hash mismatch is a conflict without execution or persistence', () => using(async f => {
  const r = await f.call('POST', { body: { expectedSha256: '0'.repeat(64), consent: true } });
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'questionnaire_review_source_changed'); assert.equal(f.count(), 0);
}));
test('historical source stays explicitly historical after a later questionnaire version exists', () => using(async f => {
  const next = await repository.saveQuestionnaireVersion({ kind: 'append', projectId: f.projectId, versionId: randomUUID(), baseRevision: 1, label: 'v2', content: { ...f.content, title: 'newer draft' } }, f.owner);
  const old = await f.call('POST'); assert.equal(old.body.currentRevision, 2); assert.equal(old.body.review.revision, 1); assert.equal(old.body.review.sourceSha256, f.saved.version.sha256);
  const newerContext = { params: Promise.resolve({ id: f.projectId, versionId: next.version.id }) };
  assert.equal((await f.call('GET', { context: newerContext })).body.review, null);
  const newer = await f.call('POST', { context: newerContext, body: { expectedSha256: next.version.sha256, consent: true } }); assert.equal(newer.status, 201); assert.equal(newer.body.review.revision, 2); assert.equal(f.count(), 2);
}));
test('stored result tamper is rejected even if attacker recomputes its result hash', () => using(async f => {
  await f.call('POST'); f.db.exec('DROP TRIGGER questionnaire_reviews_no_update');
  const forged = reviewQuestionnaire(f.content); forged.summary.blockers = 0; forged.status = 'human_review_required';
  const raw = JSON.stringify(forged);
  f.db.prepare('UPDATE questionnaire_design_reviews SET result_json=?,result_sha256=?,result_size=?').run(raw, sha(raw), Buffer.byteLength(raw));
  assert.equal((await f.call()).status, 409); assert.equal((await f.call('POST')).status, 409); assert.equal(f.count(), 1);
}));
test('source content tamper is rejected before reading or creating review result', () => using(async f => {
  f.db.exec('DROP TRIGGER questionnaire_versions_no_update');
  f.db.prepare('UPDATE questionnaire_versions SET content=?').run(JSON.stringify({ ...f.content, title: 'tampered' }));
  assert.equal((await f.call()).status, 409); assert.equal((await f.call('POST')).status, 409); assert.equal(f.count(), 0);
}));
test('old engine rows are retained but not reinterpreted by the current engine', () => using(async f => {
  await f.call('POST'); f.db.exec('DROP TRIGGER questionnaire_reviews_no_update');
  f.db.prepare('UPDATE questionnaire_design_reviews SET engine_version=?').run('questionnaire-structure/old');
  assert.equal((await f.call()).body.review, null); assert.equal((await f.call('POST')).status, 201); assert.equal(f.count(), 2);
}));
function fillCapacity(f, desired) {
  const result = JSON.stringify(reviewQuestionnaire(f.content));
  const statement = f.db.prepare('INSERT INTO questionnaire_design_reviews(id,owner_hash,project_id,version_id,source_revision,source_sha256,engine_version,result_json,result_sha256,result_size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  while (f.count() < desired) statement.run(randomUUID(), f.owner, f.projectId, f.versionId, 1, f.saved.version.sha256, `synthetic-prior-engine/${f.count()}`, result, sha(result), Buffer.byteLength(result), new Date().toISOString());
}
test('owner capacity rejects a new check atomically without deleting existing rows', () => using(async f => {
  fillCapacity(f, 1600); const r = await f.call('POST'); assert.equal(r.status, 409); assert.equal(r.body.error.code, 'questionnaire_review_capacity'); assert.equal(f.count(), 1600); assert.equal((await f.call()).body.review, null);
}));
test('an existing exact review replays at owner capacity', () => using(async f => {
  const first = await f.call('POST'); fillCapacity(f, 1600);
  const replay = await f.call('POST'); assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); assert.deepEqual(replay.body.review, first.body.review); assert.equal(f.count(), 1600);
}));
test('migration blocks direct UPDATE/DELETE and wrong-source INSERT in in-memory SQLite', () => using(async f => {
  await f.call('POST');
  assert.throws(() => f.db.exec('UPDATE questionnaire_design_reviews SET result_json=result_json'), /immutable/);
  assert.throws(() => f.db.exec('DELETE FROM questionnaire_design_reviews'), /immutable/);
  assert.throws(() => f.db.prepare('INSERT INTO questionnaire_design_reviews SELECT ?,owner_hash,?,version_id,source_revision,source_sha256,?,result_json,result_sha256,result_size,created_at FROM questionnaire_design_reviews').run(randomUUID(), randomUUID(), 'synthetic-invalid-source'), /source mismatch/);
  assert.equal(f.count(), 1);
}));
test('wrong record source metadata or invalid server time is not accepted', () => using(async f => {
  await f.call('POST'); f.db.exec('DROP TRIGGER questionnaire_reviews_no_update');
  f.db.prepare('UPDATE questionnaire_design_reviews SET created_at=?').run('2026-02-30T00:00:00.000Z');
  assert.equal((await f.call()).status, 409);
}));
test('missing D1 binding does not synthesize a success or an in-memory fallback', () => using(async f => {
  globalThis[binding].DB = undefined;
  for (const method of ['GET', 'POST']) { const result = await f.call(method); assert.equal(result.status, 503); assert.equal(result.body.review, undefined); }
  assert.equal(f.count(), 0);
}));
