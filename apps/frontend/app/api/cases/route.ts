import { filterReportCases, reportFacet, REPORT_CATALOG_DATE, REPORT_CATALOG_VERSION, REPORT_LIBRARY_STATS, type ReportFilters } from '@/lib/report-case-catalog';
import { ApiError, apiErrorResponse, optionalString } from '../_lib/http';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters: ReportFilters = {};
    for (const key of ['q', 'region', 'method', 'topic', 'edition', 'group', 'award'] as const) {
      const value = optionalString(url.searchParams.get(key), { max: key === 'q' ? 80 : 48, label: '检索条件' });
      if (value) filters[key] = value;
    }
    if (url.searchParams.has('verification')) throw new ApiError(400, 'retired_case_filter', '案例库已按原报告收录，请使用地区、主题或方法筛选。');
    const cases = filterReportCases(filters);
    return Response.json({
      cases, total: cases.length, library: REPORT_LIBRARY_STATS,
      version: REPORT_CATALOG_VERSION, capturedAt: REPORT_CATALOG_DATE,
      facets: { regions: reportFacet('region'), methods: reportFacet('methods'), topics: reportFacet('topic'), editions: reportFacet('edition'), groups: reportFacet('group'), awards: reportFacet('award') },
    }, { headers: { 'cache-control': 'public, max-age=300', 'content-type': 'application/json; charset=utf-8' } });
  } catch (error) { return apiErrorResponse(error); }
}
