import type { ReportFileReference } from './case-report-storage';

export type ReportReadingReceipt = { reportId: string; sha256: string; page: number };
export type ReportReadingPosition = ReportReadingReceipt & { updatedAt: number };
export type ReportReadingIndex = Record<string, ReportReadingPosition>;
type ReadingStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const CASE_READING_KEY = 'evix-case-reading-v1';
const CHANGE_EVENT = 'evix-case-reading-changed';
const MAX_READING_BYTES = 64 * 1024;
const objectValue = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Only catalogue identities survive a cache restore; a new PDF starts separately. */
export function parseReportReading(raw: string | null, reports: readonly ReportFileReference[]): ReportReadingIndex {
  const result: ReportReadingIndex = {};
  if (!raw || raw.length > MAX_READING_BYTES) return result;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!objectValue(envelope) || envelope.version !== 1 || !objectValue(envelope.records)) return result;
    for (const report of reports) {
      const item = envelope.records[report.id];
      if (!objectValue(item) || item.reportId !== report.id || item.sha256 !== report.sha256 || !Number.isSafeInteger(item.page) || Number(item.page) < 1 || Number(item.page) > report.pages || !Number.isSafeInteger(item.updatedAt) || Number(item.updatedAt) < 1) continue;
      result[report.id] = { reportId: report.id, sha256: report.sha256, page: Number(item.page), updatedAt: Number(item.updatedAt) };
    }
  } catch { /* A broken reading preference never blocks access to the original. */ }
  return result;
}

function browserStorage(): ReadingStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function reportReadingSnapshot(): string | null {
  try { return browserStorage()?.getItem(CASE_READING_KEY) ?? null; } catch { return null; }
}
export const reportReadingServerSnapshot = () => null;

export function subscribeReportReading(notify: () => void): () => void {
  const changed = (event: StorageEvent) => { if (event.key === null || event.key === CASE_READING_KEY) notify(); };
  window.addEventListener('storage', changed);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => { window.removeEventListener('storage', changed); window.removeEventListener(CHANGE_EVENT, notify); };
}

/** Persist actual render receipts, never requested pages or optimistic UI state. */
export function saveReportReading(receipt: ReportReadingReceipt, reports: readonly ReportFileReference[], storage: ReadingStorage | null = browserStorage(), now = Date.now()): boolean {
  const report = reports.find(item => item.id === receipt.reportId && item.sha256 === receipt.sha256);
  if (!report || !Number.isSafeInteger(receipt.page) || receipt.page < 1 || receipt.page > report.pages || !Number.isSafeInteger(now) || now < 1 || !storage) return false;
  try {
    const records = parseReportReading(storage.getItem(CASE_READING_KEY), reports);
    const previous = records[report.id];
    if (previous?.page === receipt.page) return true;
    records[report.id] = { ...receipt, updatedAt: now };
    const raw = JSON.stringify({ version: 1, records });
    storage.setItem(CASE_READING_KEY, raw);
    // Storage may be disabled or mediated. The shelf only reflects readable data.
    const restored = parseReportReading(storage.getItem(CASE_READING_KEY), reports)[report.id];
    if (restored?.page !== receipt.page || restored.sha256 !== receipt.sha256) return false;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch { return false; }
}
