import { REPORT_CASES, REPORT_CATALOG_VERSION } from '@/lib/report-case-catalog';
import { ApiError, apiErrorResponse } from '../../_lib/http';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{2,127}$/.test(id)) throw new ApiError(400, 'invalid_case_id', '案例 ID 格式无效。');
    const report = REPORT_CASES.find(item => item.id === id);
    if (!report) throw new ApiError(404, 'case_not_found', '未收录这份原报告。');
    return Response.json({ case: report, version: REPORT_CATALOG_VERSION }, { headers: { 'cache-control': 'public, max-age=300' } });
  } catch (error) { return apiErrorResponse(error); }
}
