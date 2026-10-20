import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContent } from '../lib/editor-model.ts';
import { DEFAULT_REPORT_SETTINGS } from '../lib/report-format.ts';
import { prepareReportSave, validateReportSaveReceipt, reconcileReportHead, parseReportVersion, parseReportHistory, REPORT_READ_OPTIONS } from '../lib/report-persistence.ts';

const project = '11111111-1111-4111-8111-111111111111';
const otherProject = '22222222-2222-4222-8222-222222222222';
const version = '33333333-3333-4333-8333-333333333333';
const nextVersion = '44444444-4444-4444-8444-444444444444';
const key = '55555555-5555-4555-8555-555555555555';
const at = '2026-10-20T08:00:00Z';
const receipt = (content, overrides = {}) => ({ id: version, projectId: project, revision: 2, title: content.title, updatedAt: at, content, ...overrides });
const summary = (revision, id = version) => ({ id, projectId: project, revision, title: '合成验收报告', updatedAt: at });

test('new request freezes a detached normalized snapshot without freezing live report, slides or format', () => {
  const live = createEditorContent();
  live.title = '湖北小龙虾 · 😀 合成验收';
  live.reportFormat = structuredClone(DEFAULT_REPORT_SETTINGS);
  const frozen = prepareReportSave(live, 1, key), before = structuredClone(frozen);
  assert.equal(frozen.expectedRevision, 1); assert.equal(frozen.idempotencyKey, key);
  assert.notEqual(frozen.content, live);
  for (const item of [frozen, frozen.content, frozen.content.report, frozen.content.report[0], frozen.content.slides[0], frozen.content.reportFormat.options]) {
    assert.equal(Object.isFrozen(item), true);
  }
  assert.equal(Object.isFrozen(live), false);
  live.report[0].body = '保存期间的新编辑'; live.slides[0].notes = '新讲稿'; live.reportFormat.options.firstLineChars = 0;
  assert.deepEqual(frozen, before);
  assert.throws(() => { frozen.content.report[0].body = '篡改'; }, TypeError);
});

test('invalid draft and base revision do not create a new request', () => {
  const content = createEditorContent();
  for (const revision of [-1, 1.2, Number.MAX_SAFE_INTEGER, NaN, Infinity]) assert.throws(() => prepareReportSave(content, revision, key));
  assert.throws(() => prepareReportSave({ ...content, title: '' }, 0, key));
  assert.throws(() => prepareReportSave(content, 0, ' '));
  assert.equal(content.title, '我的市场调查研究');
});

test('valid save accepts reordered format fields and requires the exact next revision', () => {
  const content = { ...createEditorContent(), reportFormat: structuredClone(DEFAULT_REPORT_SETTINGS) };
  const request = prepareReportSave(content, 1, key), server = structuredClone(request.content);
  server.reportFormat.options = Object.fromEntries(Object.entries(server.reportFormat.options).reverse());
  assert.equal(validateReportSaveReceipt(request, receipt(server), project).revision, 2);
  for (const revision of [1, 3, 7]) assert.throws(() => validateReportSaveReceipt(request, receipt(server, { revision }), project), /原报告请求/);
});

test('valid-schema but wrong content receipt cannot confirm the frozen save', () => {
  const request = prepareReportSave(createEditorContent(), 1, key);
  const wrong = structuredClone(request.content);
  wrong.report[0].body = '来自另一份保存的正文';
  assert.throws(() => validateReportSaveReceipt(request, receipt(wrong), project), /原报告请求/);
  wrong.report = [...request.content.report]; wrong.slides = [...request.content.slides].reverse();
  assert.throws(() => validateReportSaveReceipt(request, receipt(wrong), project), /原报告请求/);
});

test('save validation is scoped to project and rejects malformed/title-mismatched receipts', () => {
  const request = prepareReportSave(createEditorContent(), 1, key);
  assert.throws(() => validateReportSaveReceipt(request, receipt(request.content, { projectId: otherProject }), project));
  assert.throws(() => validateReportSaveReceipt(request, receipt(request.content, { title: '另一个标题' }), project));
  assert.throws(() => validateReportSaveReceipt(request, { ...receipt(request.content), extra: true }, project));
  assert.throws(() => validateReportSaveReceipt(request, null, project));
});

test('receipt is compared with submitted snapshot rather than a newer live draft', () => {
  const live = createEditorContent(), request = prepareReportSave(live, 1, key);
  live.report[0].body = '回执尚未到达时继续撰写';
  assert.equal(validateReportSaveReceipt(request, receipt(structuredClone(request.content)), project).revision, 2);
  assert.equal(live.report[0].body, '回执尚未到达时继续撰写');
  assert.notEqual(live.report[0].body, request.content.report[0].body);
});

test('head confirms only the same immutable version and content at the receipt revision', () => {
  const request = prepareReportSave(createEditorContent(), 1, key);
  const saved = validateReportSaveReceipt(request, receipt(request.content), project);
  assert.equal(reconcileReportHead(saved, { report: structuredClone(saved) }, project).kind, 'current');
  assert.throws(() => reconcileReportHead(saved, { report: { ...saved, id: nextVersion } }, project), /当前报告版本/);
  const changed = structuredClone(saved); changed.content.subtitle = '相同编号下的不同内容';
  assert.throws(() => reconcileReportHead(saved, { report: changed }, project), /当前报告版本/);
});

test('a newer distinct head reports conflict while preserving submitted receipt and local data', () => {
  const request = prepareReportSave(createEditorContent(), 1, key), saved = receipt(request.content);
  const next = receipt({ ...request.content, subtitle: '协作者新版本' }, { id: nextVersion, revision: 3 });
  const result = reconcileReportHead(saved, { report: next }, project);
  assert.equal(result.kind, 'advanced'); assert.equal(result.head.revision, 3);
  assert.equal(saved.revision, 2); assert.equal(request.content.subtitle, saved.content.subtitle);
  assert.notEqual(next.content.subtitle, request.content.subtitle);
});

test('missing, older, cross-project or reused immutable ID heads remain unconfirmed', () => {
  const saved = receipt(createEditorContent());
  for (const report of [null, { ...saved, revision: 1 }, { ...saved, revision: 3 }, { ...saved, projectId: otherProject }]) {
    assert.throws(() => reconcileReportHead(saved, { report }, project));
  }
  assert.throws(() => reconcileReportHead({ ...saved, projectId: otherProject }, { report: saved }, project));
});

test('explicit historical load requires the chosen immutable version ID', () => {
  const old = receipt(createEditorContent(), { revision: 1 });
  assert.equal(parseReportVersion(old, project, version).id, version);
  assert.throws(() => parseReportVersion(old, project, nextVersion), /所选版本/);
  assert.throws(() => parseReportVersion({ ...old, projectId: otherProject }, project, version));
});

test('version catalogue preserves pagination and parses at most thirty summaries', () => {
  const versions = Array.from({ length: 30 }, (_, i) => summary(40 - i, `${String(i + 1).padStart(8, '0')}-1111-4111-8111-111111111111`));
  const parsed = parseReportHistory({ versions, nextBeforeRevision: 11 }, project);
  assert.equal(parsed.versions.length, 30); assert.equal(parsed.nextBeforeRevision, 11);
  assert.deepEqual(parseReportHistory({ versions: [], nextBeforeRevision: null }, project), { versions: [], nextBeforeRevision: null });
  assert.throws(() => parseReportHistory({ versions: [...versions, summary(1)], nextBeforeRevision: null }, project));
});

test('valid report above the old one MB transport cap fits the bounded full receipt read budget', () => {
  const content = createEditorContent();
  content.report = Array.from({ length: 40 }, (_, i) => ({ id: `large-${i}`, title: `合成章节 ${i + 1}`, body: '验'.repeat(10_000), source: '' }));
  const request = prepareReportSave(content, 1, key);
  const reply = receipt(request.content);
  const serializedBytes = Buffer.byteLength(JSON.stringify(reply), 'utf8');
  assert.ok(serializedBytes > 1_000_000);
  assert.ok(serializedBytes < REPORT_READ_OPTIONS.maxBytes);
  assert.ok(REPORT_READ_OPTIONS.maxBytes < 2_100_000, 'budget remains bounded near the existing content limit');
  const parsed = validateReportSaveReceipt(request, reply, project);
  assert.equal(parsed.content.report.length, 40);
  assert.equal(reconcileReportHead(parsed, { report: reply }, project).kind, 'current');
});

test('malformed or duplicate version catalogue never becomes a visible history', () => {
  for (const raw of [null, [], { versions: [] }, { versions: [], nextBeforeRevision: 0 }, { versions: [], nextBeforeRevision: 2.5 }, { versions: [], nextBeforeRevision: null, surprise: true }, { versions: [summary(2), summary(2, nextVersion)], nextBeforeRevision: null }, { versions: [summary(2), summary(1)], nextBeforeRevision: null }, { versions: [{ ...summary(1), projectId: otherProject }], nextBeforeRevision: null }]) {
    assert.throws(() => parseReportHistory(raw, project));
  }
});
