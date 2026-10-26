export type ReportFileReference = { id: string; title: string; filename: string; sha256: string; pages: number; bytes: number };
export const CASE_REPORT_LIMITS = { fileBytes: 60 * 1024 * 1024, totalBytes: 250 * 1024 * 1024, coverBytes: 1024 * 1024 } as const;
export const CASE_REPORT_STORAGE_EVENT = 'evix-case-report-storage';
const DATABASE = 'evix-case-originals-v1', STORE = 'reports';
type StoredReport = { id: string; sha256: string; blob: Blob; cover?: Blob; pages: number; bytes: number; storedBytes: number; importedAt: string };

export class CaseReportStorageError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'CaseReportStorageError'; this.code = code; }
}
function failure(cause: unknown): Error {
  if (cause instanceof CaseReportStorageError) return cause;
  const name = cause && typeof cause === 'object' && 'name' in cause ? String(cause.name) : '';
  if (name === 'QuotaExceededError') return new CaseReportStorageError('quota', '浏览器存储空间不足，文件未保存。请释放空间后重新导入。');
  return new CaseReportStorageError('storage', '无法访问浏览器原文库。请检查浏览器存储权限后重试。');
}
export function assertCaseReportReference(report: ReportFileReference): void {
  if (!report || typeof report.id !== 'string' || !report.id.trim() || typeof report.title !== 'string' || !report.title.trim() || typeof report.filename !== 'string' || !report.filename.trim() || !/^[a-f\d]{64}$/i.test(report.sha256) || !Number.isSafeInteger(report.bytes) || report.bytes < 8 || report.bytes > CASE_REPORT_LIMITS.fileBytes || !Number.isSafeInteger(report.pages) || report.pages < 1) throw new CaseReportStorageError('catalog', '原报告目录信息不完整，暂时无法导入。');
}
export function assertCaseReportBytes(bytes: Uint8Array): void {
  if (!bytes.byteLength || bytes.byteLength > CASE_REPORT_LIMITS.fileBytes) throw new CaseReportStorageError('size', '每份 PDF 必须在 60 MiB 以内，且不能为空。');
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(1024, bytes.length)));
  const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  if (!/%PDF-\d\.\d/.test(head) || !/%%EOF\s*$/.test(tail)) throw new CaseReportStorageError('signature', '文件不是完整的 PDF，可能已损坏或下载不完整。');
}
export async function caseReportSha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new CaseReportStorageError('crypto', '此浏览器无法核对原文指纹，请使用安全连接或本地工作台。');
  const buffer = new Uint8Array(bytes).buffer;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Content identity is always a digest; a familiar filename never authorizes a different file. */
export async function identifyCaseReport(file: Blob, reports: readonly ReportFileReference[]): Promise<ReportFileReference> {
  if (!file.size || file.size > CASE_REPORT_LIMITS.fileBytes) throw new CaseReportStorageError('size', '每份 PDF 必须在 60 MiB 以内，且不能为空。');
  reports.forEach(assertCaseReportReference);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertCaseReportBytes(bytes);
  const hash = await caseReportSha256(bytes);
  const matches = reports.filter(report => report.sha256.toLowerCase() === hash);
  if (!matches.length) throw new CaseReportStorageError('unknown', '未匹配到目录中的原报告，或文件内容已改变。');
  if (matches.length !== 1) throw new CaseReportStorageError('catalog', '原报告目录存在重复指纹，暂时无法确定归属。');
  if (matches[0].bytes !== bytes.byteLength) throw new CaseReportStorageError('catalog', '文件大小与目录记录不一致，未保存。');
  return matches[0];
}
export function assertCaseReportCapacity(currentBytes: number, replacingBytes: number, incomingBytes: number): void {
  if (![currentBytes, replacingBytes, incomingBytes].every(value => Number.isSafeInteger(value) && value >= 0) || replacingBytes > currentBytes) throw new CaseReportStorageError('storage', '原文库容量记录异常，请重新打开后重试。');
  if (currentBytes - replacingBytes + incomingBytes > CASE_REPORT_LIMITS.totalBytes) throw new CaseReportStorageError('capacity', '原文库已达到 250 MiB 上限，本文件未保存。');
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new CaseReportStorageError('unavailable', '此浏览器不支持本地原文库。')); return; }
    let settled = false;
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DATABASE, 1); } catch (cause) { reject(failure(cause)); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onblocked = () => { settled = true; reject(new CaseReportStorageError('blocked', '另一个页面正在使用旧版原文库，请关闭该页面后重试。')); };
    request.onerror = () => { settled = true; reject(failure(request.error)); };
    request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); } };
  });
}
async function readRecords(id?: string): Promise<StoredReport[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let records: StoredReport[] = [];
    let transaction: IDBTransaction;
    try { transaction = db.transaction(STORE, 'readonly'); } catch (cause) { db.close(); reject(failure(cause)); return; }
    const store = transaction.objectStore(STORE), request = id === undefined ? store.getAll() : store.get(id);
    request.onsuccess = () => { records = id === undefined ? request.result as StoredReport[] : request.result ? [request.result as StoredReport] : []; };
    transaction.oncomplete = () => { db.close(); resolve(records); };
    transaction.onabort = transaction.onerror = () => { db.close(); reject(failure(transaction.error ?? request.error)); };
  });
}
function matchesStored(stored: StoredReport, report: ReportFileReference): boolean {
  return stored.id === report.id && stored.sha256 === report.sha256.toLowerCase() && stored.blob instanceof Blob && stored.blob.size === report.bytes && stored.bytes === report.bytes;
}
export async function availableCaseReportIds(reports: readonly ReportFileReference[]): Promise<string[]> {
  reports.forEach(assertCaseReportReference);
  const records = await readRecords();
  return reports.filter(report => records.some(stored => matchesStored(stored, report))).map(report => report.id);
}
export async function loadCaseReport(report: ReportFileReference): Promise<Blob | null> {
  assertCaseReportReference(report);
  const record = (await readRecords(report.id))[0];
  if (!record) return null;
  if (!matchesStored(record, report)) throw new CaseReportStorageError('mismatch', '本地原文与目录不一致，请重新导入这份 PDF。');
  await identifyCaseReport(record.blob, [report]);
  return record.blob;
}
export async function loadCaseReportCover(report: ReportFileReference): Promise<Blob | null> {
  assertCaseReportReference(report);
  const record = (await readRecords(report.id)).find(value => matchesStored(value, report));
  return record?.cover instanceof Blob && record.cover.size <= CASE_REPORT_LIMITS.coverBytes ? record.cover : null;
}
export async function saveCaseReport(file: Blob, reports: readonly ReportFileReference[], assets?: { cover?: Blob; pages?: number }): Promise<ReportFileReference> {
  const report = await identifyCaseReport(file, reports);
  if (assets?.cover && (assets.cover.type !== 'image/png' || assets.cover.size > CASE_REPORT_LIMITS.coverBytes)) throw new CaseReportStorageError('cover', '封面缓存格式或大小异常，未保存。');
  if (assets?.pages !== undefined && (!Number.isSafeInteger(assets.pages) || assets.pages < 1)) throw new CaseReportStorageError('pages', 'PDF 页数无效，未保存。');
  if (assets?.pages !== undefined && assets.pages !== report.pages) throw new CaseReportStorageError('pages', 'PDF 实际页数与原报告目录不一致，阅读页码可能有误。本文件未保存。');
  const record: StoredReport = { id: report.id, sha256: report.sha256.toLowerCase(), blob: file.slice(0, file.size, 'application/pdf'), ...(assets?.cover ? { cover: assets.cover } : {}), pages: assets?.pages ?? report.pages, bytes: file.size, storedBytes: file.size + (assets?.cover?.size ?? 0), importedAt: new Date().toISOString() };
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    let reason: unknown;
    let transaction: IDBTransaction;
    try { transaction = db.transaction(STORE, 'readwrite'); } catch (cause) { db.close(); reject(failure(cause)); return; }
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        const records = request.result as StoredReport[];
        const size = (value: StoredReport) => value.blob.size + (value.cover?.size ?? 0);
        assertCaseReportCapacity(records.reduce((sum, value) => sum + size(value), 0), records.filter(value => value.id === report.id).reduce((sum, value) => sum + size(value), 0), record.storedBytes);
        store.put(record);
      } catch (cause) { reason = cause; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = transaction.onerror = () => { db.close(); reject(failure(reason ?? transaction.error ?? request.error)); };
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CASE_REPORT_STORAGE_EVENT));
  return report;
}
