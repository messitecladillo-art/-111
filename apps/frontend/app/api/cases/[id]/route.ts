import {
  awardCaseLibraryNotice,
  awardCases,
} from "@/data/award-cases";
import { ApiError, apiErrorResponse } from "../../_lib/http";

const CASE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,127}$/;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = await Promise.resolve(context.params);
    if (!CASE_ID_PATTERN.test(params.id)) {
      throw new ApiError(400, "invalid_case_id", "案例 ID 格式无效。");
    }
    const item = awardCases.find((candidate) => candidate.id === params.id);
    if (!item) {
      throw new ApiError(404, "case_not_found", "未找到该案例。");
    }
    return Response.json(
      { case: item, notice: awardCaseLibraryNotice },
      {
        headers: {
          "cache-control": "public, max-age=300, stale-while-revalidate=3600",
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
