import { EDITOR_LIMITS, parseEditorContent, type EditorContent } from './editor-model.ts';
import {
  parseProjectReport, parseReportHead, reportContentsEqual,
  type ProjectReport, type ProjectReportSummary, type SaveReportRequest,
} from './project-report.ts';

/** Content's existing 2 MB cap plus a bounded report/version JSON envelope. */
export const REPORT_READ_OPTIONS = Object.freeze({ maxBytes: EDITOR_LIMITS.bytes + 16_384 });

/** Freeze only the detached request; never freeze the editor's live object. */
function freezeRequest<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeRequest(child);
    Object.freeze(value);
  }
  return value;
}

/** Capture a new save once. An uncertain retry must reuse this request. */
export function prepareReportSave(
  content: EditorContent,
  expectedRevision: number,
  idempotencyKey = crypto.randomUUID(),
): SaveReportRequest {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw Error('报告基础版本无效。');
  }
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw Error('保存请求标识无效。');
  return freezeRequest({
    content: parseEditorContent(structuredClone(content)),
    expectedRevision,
    idempotencyKey,
  });
}

/** A syntactically valid response is not proof that this frozen save succeeded. */
export function validateReportSaveReceipt(
  request: SaveReportRequest,
  raw: unknown,
  projectId: string,
): ProjectReport {
  const receipt = parseProjectReport(raw, projectId);
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0
    || receipt.revision !== request.expectedRevision + 1
    || !reportContentsEqual(request.content, receipt.content)) {
    throw Error('保存回执与原报告请求不一致，请保留原请求核对。');
  }
  return receipt;
}

/** Reconcile head after a verified save; do not replace newer local editing. */
export function reconcileReportHead(
  receipt: ProjectReport,
  rawHead: unknown,
  projectId: string,
): { kind: 'current' | 'advanced'; head: ProjectReport } {
  // Validate the receipt again so callers cannot skip the project/type boundary.
  const saved = parseProjectReport(receipt, projectId);
  const head = parseReportHead(rawHead, projectId);
  if (!head || head.revision < saved.revision
    || (head.revision === saved.revision
      && (head.id !== saved.id || !reportContentsEqual(head.content, saved.content)))
    || (head.revision > saved.revision && head.id === saved.id)) {
    throw Error('保存回执与当前报告版本尚未完成核对，请重试原保存。');
  }
  return { kind: head.revision === saved.revision ? 'current' : 'advanced', head };
}

/** Loading one history row must return that exact immutable version. */
export function parseReportVersion(raw: unknown, projectId: string, versionId: string): ProjectReport {
  const version = parseProjectReport(raw, projectId);
  if (version.id !== versionId) throw Error('历史报告回执与所选版本不一致，请重新载入。');
  return version;
}

/** Shared bounded parsing for the version catalogue; full versions load separately. */
export function parseReportHistory(
  raw: unknown,
  projectId: string,
): { versions: ProjectReportSummary[]; nextBeforeRevision: number | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('版本目录回执无效。');
  const response = raw as Record<string, unknown>;
  if (Object.keys(response).length !== 2 || !Object.hasOwn(response, 'versions')
    || !Object.hasOwn(response, 'nextBeforeRevision') || !Array.isArray(response.versions)
    || response.versions.length > 30
    || (response.nextBeforeRevision !== null
      && (!Number.isSafeInteger(response.nextBeforeRevision) || (response.nextBeforeRevision as number) < 1))) {
    throw Error('版本目录回执无效。');
  }
  const versions = response.versions.map(item => parseProjectReport(item, projectId, false));
  const ids = new Set<string>(), revisions = new Set<number>();
  for (const version of versions) {
    if (ids.has(version.id) || revisions.has(version.revision)) throw Error('版本目录存在重复记录。');
    ids.add(version.id); revisions.add(version.revision);
  }
  return { versions, nextBeforeRevision: response.nextBeforeRevision as number | null };
}
