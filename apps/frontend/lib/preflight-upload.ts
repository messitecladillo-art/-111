import { normalizeIdentityTerms, type PreflightReport } from './submission-preflight.ts';
import { rejectDuplicateMembers } from './questionnaire.ts';

export const PREFLIGHT_FILE_BYTES = 20 * 1024 * 1024;
const RECEIPT_BYTES = 2 * 1024 * 1024;
export type PreflightUploadFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;
export function preflightFormat(name: string): 'docx' | 'pptx' | 'pdf' {
  const value = name.toLowerCase().split('.').pop();
  if (value !== 'docx' && value !== 'pptx' && value !== 'pdf') throw Error('请选择 Word、PowerPoint 或 PDF 文件。');
  return value;
}
export function validatePreflightFile(file: PreflightUploadFile): void {
  preflightFormat(file.name);
  if (file.name.length > 240 || /[\u0000-\u001f\u007f]/u.test(file.name)) throw Error('文件名过长或包含控制字符，请重命名后重试。');
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > PREFLIGHT_FILE_BYTES) throw Error('单个文件须在 20 MiB 以内，且不能为空。');
}
export async function preflightHash(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), value => value.toString(16).padStart(2, '0')).join('');
}
export async function preflightTermsHash(terms: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeIdentityTerms(terms)));
  return preflightHash(bytes.buffer);
}
function abortCheck(signal: AbortSignal) { if (signal.aborted) throw new DOMException('本次检查已取消。', 'AbortError'); }
function encodedTerms(terms: string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(terms));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
export function parsePreflightReceipt(raw: string, expected: { name: string; format: string; bytes: number; sha256: string; termsHash: string }): PreflightReport {
  rejectDuplicateMembers(raw);
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.schema !== 'submission-preflight/v1' || value.scope !== 'server-deep' ||
      value.name !== expected.name || value.format !== expected.format || value.bytes !== expected.bytes ||
      value.sha256 !== expected.sha256 || value.termsHash !== expected.termsHash ||
      !object(value.cleanup) || value.cleanup.completed !== true || value.cleanup.reason !== 'temporary-upload') throw Error('检查回执与当前文件不一致，或临时文件清理尚未确认。');
  if (!['issues_found', 'no_issues_in_checked_scope', 'incomplete'].includes(String(value.status)) ||
      !Array.isArray(value.findings) || value.findings.length > 500 || !Array.isArray(value.coverage) || value.coverage.length < 1 || value.coverage.length > 40) throw Error('检查回执不完整，请重试。');
  for (const item of value.findings) {
    if (!object(item) || !['error', 'warning'].includes(String(item.level)) || !text(item.code, 80) ||
        !text(item.message, 600) || !text(item.location, 500) || (item.field !== undefined && !text(item.field, 120))) throw Error('检查问题记录无法核验。');
  }
  const coverageIds = new Set<string>();
  for (const item of value.coverage) {
    if (!object(item) || !text(item.id, 80) || coverageIds.has(item.id) || !text(item.label, 120) ||
        !['checked', 'manual', 'not_checked'].includes(String(item.status)) || !text(item.detail, 600)) throw Error('检查覆盖记录无法核验。');
    coverageIds.add(item.id);
  }
  if (value.status === 'no_issues_in_checked_scope' && (value.findings.length || value.coverage.some(item => item.status === 'not_checked'))) throw Error('检查状态与问题或覆盖记录不一致。');
  if (value.status === 'issues_found' && !value.findings.length) throw Error('检查状态缺少对应的问题记录。');
  return value as unknown as PreflightReport;
}
async function readReceipt(response: Response, signal: AbortSignal): Promise<string> {
  if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get('content-type') || '')) { void response.body?.cancel(); throw Error('服务未返回 JSON 检查回执。'); }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > RECEIPT_BYTES)) { void response.body?.cancel(); throw Error('检查回执超过处理上限。'); }
  const reader = response.body?.getReader();
  if (!reader) throw Error('服务回执为空。');
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    let total = 0; const chunks: Uint8Array[] = [];
    while (true) { abortCheck(signal); const next = await reader.read(); abortCheck(signal); if (next.done) break; total += next.value.byteLength; if (total > RECEIPT_BYTES) throw Error('检查回执超过处理上限。'); chunks.push(next.value); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
/** Explicit consent is handled by the caller. One request, no automatic retry or persistence. */
export async function uploadTemporaryPreflight(file: PreflightUploadFile, termsInput: string[], csrfToken: string, signal: AbortSignal,
  onPhase: (phase: string) => void = () => {}, fetcher: typeof fetch = fetch): Promise<PreflightReport> {
  validatePreflightFile(file); abortCheck(signal);
  if (!csrfToken) throw Error('请先登录，再进行完整文件检查。');
  const terms = normalizeIdentityTerms(termsInput);
  if (terms.length > 128 || terms.some(term => term.length > 64)) throw Error('最多配置 128 个身份词，每个词最多 64 个字符。');
  if (new TextEncoder().encode(JSON.stringify(terms)).byteLength > 4096) throw Error('身份词配置超过 4 KiB，请减少词数后重试。');
  onPhase('fingerprint'); const buffer = await file.arrayBuffer(); abortCheck(signal);
  if (buffer.byteLength !== file.size) throw Error('文件内容与大小不一致，请重新选择。');
  const sha256 = await preflightHash(buffer), termsHash = await preflightTermsHash(terms); abortCheck(signal);
  onPhase('request');
  const response = await fetcher('/api/submission/preflight', { method: 'POST', body: buffer, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json', 'X-CSRF-Token': csrfToken,
      'X-EVIX-Temporary-Upload': 'accepted', 'X-EVIX-Audit-Format': preflightFormat(file.name),
      'X-EVIX-Audit-Name': encodeURIComponent(file.name), 'X-EVIX-Audit-Terms': encodedTerms(terms) } });
  abortCheck(signal); onPhase('receipt');
  const raw = await readReceipt(response, signal); abortCheck(signal); rejectDuplicateMembers(raw);
  if (!response.ok) {
    const value: unknown = JSON.parse(raw);
    const message = object(value) && object(value.error) && text(value.error.message, 400) ? value.error.message : '检查未完成，请核对文件后重试。';
    throw Error(message);
  }
  onPhase('verify');
  const report = parsePreflightReceipt(raw, { name: file.name, format: preflightFormat(file.name), bytes: buffer.byteLength, sha256, termsHash });
  abortCheck(signal); return report;
}
