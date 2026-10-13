import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePreflightReceipt, uploadTemporaryPreflight, preflightHash, preflightTermsHash, validatePreflightFile } from '../lib/preflight-upload.ts';

const bytes = Uint8Array.of(1, 2, 3, 4).buffer;
const file = { name: '测试.docx', size: 4, arrayBuffer: async () => bytes };
async function fixture() {
  const expected = { name: file.name, format: 'docx', bytes: 4, sha256: await preflightHash(bytes), termsHash: await preflightTermsHash(['学校']) };
  return { expected, report: { schema: 'submission-preflight/v1', ...expected, scope: 'server-deep', status: 'no_issues_in_checked_scope', findings: [],
    coverage: [{ id: 'metadata', label: '作者信息', status: 'checked', detail: '检查 core 与自定义属性。' }, { id: 'render', label: '渲染页面', status: 'manual', detail: '逐页检查图片与版面。' }],
    cleanup: { completed: true, reason: 'temporary-upload' } } };
}
test('temporary preflight uploads only the explicitly chosen file and binds the final cleanup receipt', async () => {
  const { report } = await fixture(); let calls = 0; const phases = [];
  const fetcher = async (url, options) => {
    calls++; assert.equal(url, '/api/submission/preflight'); assert.equal(options.body, bytes); assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['X-CSRF-Token'], 'synthetic-csrf'); assert.equal(options.headers['X-EVIX-Temporary-Upload'], 'accepted');
    assert.equal(decodeURIComponent(options.headers['X-EVIX-Audit-Name']), file.name); assert.equal(options.headers['X-EVIX-Audit-Format'], 'docx');
    assert.deepEqual(JSON.parse(Buffer.from(options.headers['X-EVIX-Audit-Terms'], 'base64url').toString()), ['学校']);
    return Response.json(report);
  };
  const result = await uploadTemporaryPreflight(file, ['学校'], 'synthetic-csrf', new AbortController().signal, phase => phases.push(phase), fetcher);
  assert.equal(result.sha256, report.sha256); assert.equal(calls, 1); assert.deepEqual(phases, ['fingerprint', 'request', 'receipt', 'verify']);
});
test('missing login, cancelled input, invalid file and config limits cannot trigger uploads', async () => {
  let calls = 0; const fetcher = async () => { calls++; throw Error('unexpected upload'); };
  await assert.rejects(uploadTemporaryPreflight(file, [], '', new AbortController().signal, undefined, fetcher), /登录/u);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(uploadTemporaryPreflight(file, [], 'csrf', controller.signal, undefined, fetcher), { name: 'AbortError' });
  await assert.rejects(uploadTemporaryPreflight({ ...file, size: 0 }, [], 'csrf', new AbortController().signal, undefined, fetcher), /不能为空/u);
  await assert.rejects(uploadTemporaryPreflight(file, ['校'.repeat(65)], 'csrf', new AbortController().signal, undefined, fetcher), /64/u);
  await assert.rejects(uploadTemporaryPreflight(file, Array.from({ length: 128 }, (_, n) => '校'.repeat(62) + n), 'csrf', new AbortController().signal, undefined, fetcher), /4 KiB/u);
  assert.equal(calls, 0);
  assert.throws(() => validatePreflightFile({ ...file, name: 'report.docm' }), /Word/u);
});
test('every receipt identity and cleanup field must match exactly', async () => {
  const { expected, report } = await fixture();
  for (const change of [{ sha256: 'a'.repeat(64) }, { termsHash: 'a'.repeat(64) }, { name: '其他.docx' }, { bytes: 5 }, { format: 'pdf' }, { scope: 'local-initial' },
    { cleanup: { completed: false, reason: 'temporary-upload' } }, { cleanup: undefined }]) {
    assert.throws(() => parsePreflightReceipt(JSON.stringify({ ...report, ...change }), expected), /回执/u);
  }
  assert.equal(parsePreflightReceipt(JSON.stringify(report), expected).status, 'no_issues_in_checked_scope');
});
test('duplicate JSON, omitted coverage, impossible no-issue statuses and excessive findings are rejected', async () => {
  const { expected, report } = await fixture();
  assert.throws(() => parsePreflightReceipt('{"schema":1,"schema":2}', expected));
  for (const change of [{ coverage: [] }, { coverage: [...report.coverage, report.coverage[0]] },
    { coverage: [{ ...report.coverage[0], status: 'not_checked' }] },
    { findings: [{ level: 'error', code: 'author', message: '移除作者', location: 'docProps/core.xml' }] },
    { status: 'issues_found' }, { status: 'pass' }, { findings: Array(501).fill({}) }]) {
    assert.throws(() => parsePreflightReceipt(JSON.stringify({ ...report, ...change }), expected));
  }
});
test('HTTP failures and malformed response streams do not become completed checks and are not retried', async () => {
  let calls = 0;
  const response = () => { calls++; return Promise.resolve(Response.json({ error: { code: 'preflight_invalid', message: '文件结构损坏。' } }, { status: 422 })); };
  await assert.rejects(uploadTemporaryPreflight(file, [], 'csrf', new AbortController().signal, undefined, response), /结构损坏/u); assert.equal(calls, 1);
  await assert.rejects(uploadTemporaryPreflight(file, [], 'csrf', new AbortController().signal, undefined, async () => new Response('html', { headers: { 'content-type': 'text/html' } })), /JSON/u);
  await assert.rejects(uploadTemporaryPreflight(file, [], 'csrf', new AbortController().signal, undefined, async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '3000000' } })), /上限/u);
  await assert.rejects(uploadTemporaryPreflight(file, [], 'csrf', new AbortController().signal, undefined, async () => new Response(Uint8Array.of(0xff), { headers: { 'content-type': 'application/json' } })));
});
test('a cancelled late receipt cannot return a report even when a fetch adapter ignores abort', async () => {
  const controller = new AbortController(), { report } = await fixture();
  const fetcher = async () => { controller.abort(); return Response.json(report); };
  await assert.rejects(uploadTemporaryPreflight(file, ['学校'], 'csrf', controller.signal, undefined, fetcher), { name: 'AbortError' });
});
test('terms fingerprints preserve ordered normalized Unicode and file-size changes are rejected before upload', async () => {
  assert.equal(await preflightTermsHash(['Ａ校', 'a\u200b校', '学校']), await preflightTermsHash(['a校', '学校']));
  assert.notEqual(await preflightTermsHash(['a校', '学校']), await preflightTermsHash(['学校', 'a校']));
  let calls = 0;
  await assert.rejects(uploadTemporaryPreflight({ ...file, size: 5 }, [], 'csrf', new AbortController().signal, undefined, async () => { calls++; return Response.json({}); }), /大小不一致/u);
  assert.equal(calls, 0);
});
