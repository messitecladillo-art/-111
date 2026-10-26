import test from 'node:test';
import assert from 'node:assert/strict';
import { CASE_READING_KEY, parseReportReading, saveReportReading } from '../lib/case-report-reading.ts';

const a = { id: 'report-a', sha256: 'a'.repeat(64), pages: 20 };
const b = { id: 'report-b', sha256: 'b'.repeat(64), pages: 50 };
const reports = [a, b];
const receipt = (report, page) => ({ reportId: report.id, sha256: report.sha256, page });
const stored = (report, page) => ({ ...receipt(report, page), updatedAt: 10 });
const wrap = records => JSON.stringify({ version: 1, records });
function memoryStorage(initial = null) {
  let value = initial, writes = 0;
  return { getItem(key) { assert.equal(key, CASE_READING_KEY); return value; }, setItem(key, next) { assert.equal(key, CASE_READING_KEY); value = next; writes++; }, get writes() { return writes; } };
}

test('reading positions are restored only for the current original and valid PDF page', () => {
  assert.deepEqual(parseReportReading(wrap({ [a.id]: stored(a, 9), [b.id]: stored(b, 50) }), reports), { [a.id]: stored(a, 9), [b.id]: stored(b, 50) });
  for (const bad of [stored({ ...a, sha256: 'c'.repeat(64) }, 9), stored(a, 0), stored(a, 21), stored(a, 2.5), { ...stored(a, 9), updatedAt: -1 }, { ...stored(a, 9), reportId: b.id }]) {
    assert.deepEqual(parseReportReading(wrap({ [a.id]: bad }), reports), {});
  }
  for (const raw of [null, '{', '[]', JSON.stringify({ version: 2, records: {} }), 'x'.repeat(65_537)]) assert.deepEqual(parseReportReading(raw, reports), {});
});

test('a real page receipt preserves other reports, and same-page redraws do not rewrite history', () => {
  const storage = memoryStorage(wrap({ [b.id]: stored(b, 8), 'unknown-report': { private: 'must not propagate' } }));
  assert.equal(saveReportReading(receipt(a, 4), reports, storage, 100), true);
  assert.deepEqual(parseReportReading(storage.getItem(CASE_READING_KEY), reports), { [a.id]: { ...receipt(a, 4), updatedAt: 100 }, [b.id]: stored(b, 8) });
  assert.ok(!storage.getItem(CASE_READING_KEY).includes('private'));
  assert.equal(saveReportReading(receipt(a, 4), reports, storage, 200), true);
  assert.equal(storage.writes, 1);
  assert.equal(parseReportReading(storage.getItem(CASE_READING_KEY), reports)[a.id].updatedAt, 100);
});

test('denied, full or mediated storage never reports a newly resumable page', () => {
  const before = wrap({ [a.id]: stored(a, 2) });
  const deniedRead = { getItem() { throw new DOMException('denied', 'SecurityError'); }, setItem() { assert.fail('must not write after denied read'); } };
  const full = { getItem() { return before; }, setItem() { throw new DOMException('full', 'QuotaExceededError'); } };
  const ignoredWrite = { getItem() { return before; }, setItem() {} };
  for (const storage of [null, deniedRead, full, ignoredWrite]) assert.equal(saveReportReading(receipt(a, 10), reports, storage, 100), false);
  assert.equal(parseReportReading(before, reports)[a.id].page, 2);
});

test('stale identities and invalid page receipts never overwrite a useful position', () => {
  const storage = memoryStorage(wrap({ [a.id]: stored(a, 7) }));
  for (const value of [receipt(a, 21), receipt(a, NaN), receipt(a, -1), receipt({ ...a, sha256: b.sha256 }, 8), receipt({ ...a, id: 'unknown-report' }, 8)]) assert.equal(saveReportReading(value, reports, storage, 100), false);
  assert.equal(storage.writes, 0);
  assert.equal(parseReportReading(storage.getItem(CASE_READING_KEY), reports)[a.id].page, 7);
});
