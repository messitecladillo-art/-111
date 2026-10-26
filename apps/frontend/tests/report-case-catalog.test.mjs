import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_CASES, REPORT_LIBRARY_STATS, filterReportCases, reportFacet } from '../lib/report-case-catalog.ts';

test('every reading-library case has an original PDF identity and valid reading destinations', () => {
  assert.equal(REPORT_CASES.length, 9);
  assert.equal(new Set(REPORT_CASES.map(item => item.id)).size, REPORT_CASES.length);
  assert.equal(new Set(REPORT_CASES.map(item => item.sha256)).size, REPORT_CASES.length);
  for (const item of REPORT_CASES) {
    assert.match(item.id, /^report-[a-z0-9-]+$/);
    assert.match(item.filename, /\.pdf$/i);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.ok(item.pages > 10 && Number.isSafeInteger(item.pages));
    assert.ok(item.bytes > 1000 && item.bytes < 60 * 1024 * 1024);
    assert.ok(item.summary && item.methods.length && item.sourceCollection);
    assert.ok(item.readingGuide.length >= 3);
    for (const step of item.readingGuide) {
      assert.ok(Number.isSafeInteger(step.page) && step.page >= 1 && step.page <= item.pages, `${item.id}: ${step.page}`);
      assert.ok(step.label && step.note);
    }
    // The user-provided collection name is not award verification.
    assert.equal(item.award, null);
    assert.ok(!JSON.stringify(item).includes('C:\\Users'));
  }
  assert.equal(REPORT_LIBRARY_STATS.pages, REPORT_CASES.reduce((n, item) => n + item.pages, 0));
  assert.equal(REPORT_LIBRARY_STATS.fullReports, REPORT_CASES.length);
});

test('search finds actual subject matter and respects independent region and method filters', () => {
  const camping = filterReportCases({ q: '露营' });
  assert.equal(camping.length, 1);
  assert.ok(camping[0].region.includes('重庆'));
  assert.equal(filterReportCases({ q: '露营', region: '武汉' }).length, 0);
  const [sample] = REPORT_CASES;
  const method = sample.methods[0];
  assert.ok(filterReportCases({ method }).length > 0);
  assert.ok(filterReportCases({ method }).every(item => item.methods.includes(method)));
  assert.deepEqual(filterReportCases({ q: '不会出现的合成测试词-zzxq' }), []);
  assert.equal(filterReportCases({}).length, REPORT_CASES.length);
  assert.deepEqual(reportFacet('award'), []);
  assert.ok(reportFacet('methods').every(item => item.count === REPORT_CASES.filter(report => report.methods.includes(item.value)).length));
});

test('case-list replaces title-only announcements without deleting the separate provenance archive', async () => {
  const { awardCases } = await import('../data/award-cases.ts');
  const titleOnly = new Set(awardCases.filter(item => item.caseDepth === 'listing_only').map(item => item.id));
  assert.ok(titleOnly.size > 0);
  assert.ok(REPORT_CASES.every(item => !titleOnly.has(item.id)));
});
