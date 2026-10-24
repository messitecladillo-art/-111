import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createEditorContent } from "../lib/editor-model.ts";
import { buildDocx, buildPptx } from "../lib/editor-export.ts";

const base = process.env.EVI_X_TEST_BASE_URL;
const docs = process.env.EVI_X_TEST_DOCS_ORIGIN;
const secret = process.env.EVI_X_TEST_DOCS_SECRET;
if (!base || !docs || !secret || !["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !["localhost", "127.0.0.1"].includes(new URL(docs).hostname)) throw Error("Isolated local native-editor HTTP test server required");

const b64 = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
function outbox(payload, overrides = {}) {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const claims = b64({ payload, exp: Math.floor(Date.now() / 1000) + 300, ...overrides });
  const data = `${header}.${claims}`;
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
async function json(path, init = {}) {
  const response = await fetch(base + path, init);
  const raw = await response.text(); let body;
  try { body = JSON.parse(raw); } catch { body = { raw }; }
  return { status: response.status, headers: response.headers, body };
}
async function owner() {
  const bootstrap = await json("/api/drafts/session", { method: "POST", headers: { origin: base } });
  assert.equal(bootstrap.status, 200);
  const cookie = bootstrap.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie);
  const listed = await json("/api/drafts/files", { headers: { cookie } }); assert.equal(listed.status, 200);
  return { cookie, "x-editor-scope": listed.body.scope };
}
async function officeBytes(kind, title) {
  const content = createEditorContent(); content.title = title;
  content.report[0].body = title;
  content.slides[0].notes = title;
  return Buffer.from(await (kind === "docx" ? buildDocx(content) : buildPptx(content)).then(file => file.arrayBuffer()));
}
async function upload(headers, kind, bytes) {
  const fileId = crypto.randomUUID(), versionId = crypto.randomUUID();
  const result = await json("/api/drafts/files", { method: "POST", headers: { ...headers, "content-type": "application/octet-stream", "x-office-file-id": fileId,
    "x-office-version-id": versionId, "x-office-name": encodeURIComponent(`原生编辑测试.${kind}`), "x-office-label": encodeURIComponent("原件") }, body: bytes });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { fileId, versionId, revision: result.body.file.revision };
}
async function open(headers, fileId, revision = 1, extras = {}) {
  return json("/api/drafts/native/sessions", { method: "POST", headers: { ...headers, origin: base, "x-native-editor-intent": "open", "content-type": "application/json", ...extras },
    body: JSON.stringify({ fileId, revision }) });
}
async function output(path, bytes) {
  const response = await fetch(docs + path, { method: "PUT", body: bytes }); assert.equal(response.status, 200);
  return docs + path;
}
function callback(key, payload, overrideBody, token = outbox(payload)) {
  return json(`/api/drafts/native/sessions/${key}/callback`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(overrideBody ?? payload) });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForSlowOutput(url) {
  const probe = docs + "/probe" + new URL(url).pathname;
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await fetch(probe)).status === 200) return;
    await sleep(30);
  }
  assert.fail("final callback did not reach the mock document download");
}

test("native settings and signed config fail closed on origin, intent, scope and owner", async () => {
  assert.deepEqual((await json("/api/drafts/native/status")).body, { configured: true });
  const a = await owner(), b = await owner(), bytes = await officeBytes("docx", "原件甲");
  const file = await upload(a, "docx", bytes);
  assert.equal((await open(a, file.fileId, 1, { origin: "https://evil.invalid" })).status, 403);
  assert.equal((await open(a, file.fileId, 1, { "x-native-editor-intent": "wrong" })).status, 403);
  assert.equal((await open({ cookie: a.cookie }, file.fileId)).status, 409);
  assert.equal((await open(a, file.fileId, 1, { "x-client-key": "synthetic-alternate-identity" })).status, 401);
  assert.equal((await open(b, file.fileId)).status, 404);
  const opened = await open(a, file.fileId); assert.equal(opened.status, 201, JSON.stringify(opened.body));
  assert.match(opened.body.scriptUrl, /^http:\/\/127\.0\.0\.1:\d+\/web-apps\/apps\/api\/documents\/api\.js$/);
  assert.equal(opened.body.shellUrl, "http://127.0.0.2:3002/");
  assert.match(opened.body.session.key, /^ne_[A-Za-z0-9_-]{43}$/);
  assert.equal(opened.body.config.document.key, opened.body.session.key);
  assert.equal(opened.body.config.document.url, `${base}/api/drafts/native/sessions/${opened.body.session.key}/source`);
  assert.equal(opened.body.config.editorConfig.callbackUrl, `${base}/api/drafts/native/sessions/${opened.body.session.key}/callback`);
  assert.equal(JSON.stringify(opened.body).includes(a.cookie), false);
  assert.equal(JSON.stringify(opened.body).includes(secret), false);
  const tokenParts = opened.body.config.token.split("."); assert.equal(tokenParts.length, 3);
  const valid = createHmac("sha256", secret).update(`${tokenParts[0]}.${tokenParts[1]}`).digest("base64url"); assert.equal(tokenParts[2], valid);
  const unsignedConfig = { ...opened.body.config }; delete unsignedConfig.token;
  assert.deepEqual(JSON.parse(Buffer.from(tokenParts[1], "base64url").toString()), unsignedConfig);
  assert.equal((await json(`/api/drafts/native/sessions/${opened.body.session.key}/status`, { headers: b })).status, 404);
  assert.equal((await json(`/api/drafts/native/sessions/${opened.body.session.key}/status`, { headers: a })).body.state, "open");
});

test("source download needs valid outbox JWT bound to exact URL and session", async () => {
  const own = await owner(), bytes = await officeBytes("pptx", "未泄露演示");
  const file = await upload(own, "pptx", bytes);
  const opened = await open(own, file.fileId); assert.equal(opened.status, 201);
  const source = opened.body.config.document.url;
  assert.equal((await fetch(source)).status, 401);
  assert.equal((await fetch(source, { headers: { authorization: `Bearer ${outbox({ url: source + "?tampered=1" })}` } })).status, 403);
  assert.equal((await fetch(source, { headers: { authorization: `Bearer ${outbox({ url: source }, { exp: Math.floor(Date.now() / 1000) - 1 })}` } })).status, 401);
  const valid = await fetch(source, { headers: { authorization: `Bearer ${outbox({ url: source })}` } });
  assert.equal(valid.status, 200); assert.equal(valid.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await valid.arrayBuffer()), bytes);
});

test("callback validates JWT and output URL; DOCX/PPTX saves become immutable CAS versions", async () => {
  for (const kind of ["docx", "pptx"]) {
    const own = await owner(), original = await officeBytes(kind, `原件-${kind}`), revised = await officeBytes(kind, `编辑后-${kind}`);
    const file = await upload(own, kind, original);
    const opened = await open(own, file.fileId); assert.equal(opened.status, 201, JSON.stringify(opened.body));
    const key = opened.body.session.key, url = await output(`/fixture/${crypto.randomUUID()}`, revised);
    const payload = { key, status: 2, url, filetype: kind };
    assert.equal((await callback(key, payload, { ...payload, url: docs + "/different" })).status, 403);
    assert.equal((await callback(key, payload, undefined, outbox(payload).slice(0, -2) + "XX")).status, 401);
    assert.equal((await callback(key, { ...payload, url: "http://169.254.169.254/latest/meta-data" })).status, 403);
    assert.equal((await callback(key, { ...payload, url: `${docs}/redirect` })).status, 503);
    const oversized = await callback(key, { ...payload, url: `${docs}/oversized` });
    assert.equal(oversized.status, 413, JSON.stringify(oversized.body));
    const saved = await callback(key, payload); assert.equal(saved.status, 200, JSON.stringify(saved.body)); assert.equal(saved.body.error, 0);
    assert.equal((await callback(key, payload)).status, 200, "exact callback replay must be idempotent");
    const state = await json(`/api/drafts/native/sessions/${key}/status`, { headers: own }); assert.deepEqual(state.body, { state: "saved", savedRevision: 2 });
    const meta = await json(`/api/drafts/files/${file.fileId}`, { headers: own }); assert.equal(meta.body.versions.length, 2);
    const latest = meta.body.versions[0];
    const download = await fetch(`${base}/api/drafts/files/${file.fileId}/versions/${latest.id}`, { headers: own });
    assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), revised);
    const old = await fetch(`${base}/api/drafts/files/${file.fileId}/versions/${file.versionId}`, { headers: own });
    assert.equal(old.status, 200); assert.deepEqual(Buffer.from(await old.arrayBuffer()), original);
    const different = await officeBytes(kind, `第二次回调-${kind}`); await output(new URL(url).pathname, different);
    assert.equal((await callback(key, payload)).status, 409, "same key may not overwrite a saved revision");
  }
});

test("status 4 closes without write, status 6 rejected, corrupt package and stale revision do not overwrite", async () => {
  const own = await owner(), bytes = await officeBytes("docx", "冲突原件");
  const file = await upload(own, "docx", bytes);
  const nochange = await open(own, file.fileId); assert.equal(nochange.status, 201);
  const close = await callback(nochange.body.session.key, { key: nochange.body.session.key, status: 4 }); assert.equal(close.status, 200);
  assert.deepEqual((await json(`/api/drafts/native/sessions/${nochange.body.session.key}/status`, { headers: own })).body, { state: "open" }, "close remains provisional while a final-save callback may be in flight");
  await sleep(20_100);
  assert.deepEqual((await json(`/api/drafts/native/sessions/${nochange.body.session.key}/status`, { headers: own })).body, { state: "closed" });
  const active = await open(own, file.fileId); assert.equal(active.status, 201);
  const key = active.body.session.key, url = await output(`/fixture/${crypto.randomUUID()}`, Buffer.from("invalid-ooxml"));
  assert.equal((await callback(key, { key, status: 6, url, filetype: "docx" })).status, 409);
  const corrupt = await callback(key, { key, status: 2, url, filetype: "docx" });
  assert.equal(corrupt.status, 400, JSON.stringify(corrupt.body));
  assert.equal((await json(`/api/drafts/files/${file.fileId}`, { headers: own })).body.file.revision, 1);
  const another = await open(own, file.fileId); assert.equal(another.status, 201);
  const currentBytes = await officeBytes("docx", "并发先胜");
  const uploadRevision = await json(`/api/drafts/files/${file.fileId}`, { method: "POST", headers: { ...own, "content-type": "application/octet-stream", "x-office-version-id": crypto.randomUUID(),
    "x-office-base-revision": "1", "x-office-name": encodeURIComponent("原生编辑测试.docx"), "x-office-label": encodeURIComponent("并发外部上传") }, body: currentBytes });
  assert.equal(uploadRevision.status, 201);
  const callbackBytes = await officeBytes("docx", "过期旧回调");
  const lateUrl = await output(`/fixture/${crypto.randomUUID()}`, callbackBytes);
  const staleFinal = { key: another.body.session.key, status: 2, url: lateUrl, filetype: "docx" };
  assert.deepEqual((await callback(another.body.session.key, staleFinal)).body, { error: 0 },
    "Docs is acknowledged only after the losing edit bytes are durably recoverable");
  assert.deepEqual((await callback(another.body.session.key, staleFinal)).body, { error: 0 }, "exact losing callback replay remains idempotent");
  const recoveryKey = another.body.session.key;
  const conflictState = (await json(`/api/drafts/native/sessions/${recoveryKey}/status`, { headers: own })).body;
  assert.equal(conflictState.state, "conflict");
  assert.equal(conflictState.recovery.available, true);
  assert.equal(conflictState.recovery.size, callbackBytes.length);
  assert.match(conflictState.recovery.expiresAt, /^\d{4}-\d\d-\d\dT/);
  assert.ok(Math.abs(Date.parse(conflictState.recovery.expiresAt) - Date.now() - 7 * 86_400_000) < 60_000);
  const recoveries = await json("/api/drafts/native/recoveries", { headers: own });
  assert.equal(recoveries.status, 200); assert.equal(recoveries.body.items.filter(item => item.key === recoveryKey).length, 1);
  assert.ok(recoveries.body.items.some(item => item.key === recoveryKey && item.recoveryUrl.endsWith(`/${recoveryKey}/recovery`)));
  const other = await owner();
  assert.equal((await json(`/api/drafts/native/sessions/${recoveryKey}/recovery`, { headers: other })).status, 404);
  assert.equal((await json(`/api/drafts/native/sessions/${recoveryKey}/recovery`, { headers: { cookie: own.cookie } })).status, 409);
  assert.equal((await json(`/api/drafts/native/sessions/${recoveryKey}/recovery`, { headers: { "x-editor-scope": own["x-editor-scope"] } })).status, 401);
  const recovered = await fetch(`${base}/api/drafts/native/sessions/${recoveryKey}/recovery`, { headers: own });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("cache-control"), "no-store");
  assert.match(recovered.headers.get("content-disposition"), /attachment;/);
  assert.deepEqual(Buffer.from(await recovered.arrayBuffer()), callbackBytes);
  assert.equal((await json(`/api/drafts/files/${file.fileId}`, { headers: own })).body.file.revision, 2);
  const current = await fetch(`${base}/api/drafts/files/${file.fileId}/versions/${uploadRevision.body.version.id}`, { headers: own });
  assert.deepEqual(Buffer.from(await current.arrayBuffer()), currentBytes, "conflict artifact cannot overwrite the current head");
  let admitted = 0, capacity = null;
  for (let attempt = 0; attempt < 21; attempt++) {
    const opened = await open(own, file.fileId, 2);
    if (opened.status === 201) admitted++;
    else { capacity = opened; break; }
  }
  assert.equal(admitted, 17, "active sessions and recovery artifacts must share the 20-slot owner quota");
  assert.equal(capacity?.status, 409);
  const stillRecoverable = await fetch(`${base}/api/drafts/native/sessions/${recoveryKey}/recovery`, { headers: own });
  assert.equal(stillRecoverable.status, 200);
  assert.deepEqual(Buffer.from(await stillRecoverable.arrayBuffer()), callbackBytes);
  assert.ok(process.env.EVI_X_TEST_RECOVERY_RECORD_PATH);
  await writeFile(process.env.EVI_X_TEST_RECOVERY_RECORD_PATH,
    JSON.stringify({ cookie: own.cookie, scope: own["x-editor-scope"], key: recoveryKey,
      sha256: conflictState.recovery.sha256, size: callbackBytes.length,
      fileId: file.fileId, headVersionId: uploadRevision.body.version.id,
      headSha256: uploadRevision.body.version.sha256 }), "utf8");
});

test("final status 2 wins over a concurrent or earlier no-change status 4 without losing CAS confirmation", async () => {
  const own = await owner(), original = await officeBytes("docx", "竞态原件"), changed = await officeBytes("docx", "竞态修改");
  const file = await upload(own, "docx", original);
  const opened = await open(own, file.fileId); assert.equal(opened.status, 201);
  const key = opened.body.session.key;
  const url = await output(`/slowfixture/${crypto.randomUUID()}`, changed);
  const final = { key, status: 2, url, filetype: "docx" };
  const closing = { key, status: 4 };
  const finalRequest = callback(key, final);
  await waitForSlowOutput(url);
  const closed = await callback(key, closing);
  assert.deepEqual((await json(`/api/drafts/native/sessions/${key}/status`, { headers: own })).body, { state: "open" }, "status 4 must not expose a false closed state while status 2 is saving");
  const saved = await finalRequest;
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.deepEqual((await json(`/api/drafts/native/sessions/${key}/status`, { headers: own })).body, { state: "saved", savedRevision: 2 });
  assert.equal((await callback(key, final)).status, 200);
  const versions = (await json(`/api/drafts/files/${file.fileId}`, { headers: own })).body.versions;
  assert.equal(versions.length, 2);
  const downloaded = await fetch(`${base}/api/drafts/files/${file.fileId}/versions/${versions[0].id}`, { headers: own });
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), changed);

  const earlierFile = await upload(own, "docx", original);
  const earlier = await open(own, earlierFile.fileId); assert.equal(earlier.status, 201);
  const earlierKey = earlier.body.session.key;
  assert.equal((await callback(earlierKey, { key: earlierKey, status: 4 })).status, 200);
  assert.deepEqual((await json(`/api/drafts/native/sessions/${earlierKey}/status`, { headers: own })).body, { state: "open" });
  const earlierUrl = await output(`/fixture/${crypto.randomUUID()}`, changed);
  assert.equal((await callback(earlierKey, { key: earlierKey, status: 2, url: earlierUrl, filetype: "docx" })).status, 200);
  assert.deepEqual((await json(`/api/drafts/native/sessions/${earlierKey}/status`, { headers: own })).body, { state: "saved", savedRevision: 2 });
});
