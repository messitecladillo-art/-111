import {
  awardCaseLibraryNotice,
  awardCaseLibraryStats,
  awardCases,
} from "@/data/award-cases";
import type { AwardCase } from "@/data/case-types";
import {
  ApiError,
  apiErrorResponse,
  optionalString,
} from "../_lib/http";

const FILTER_KEYS = ["edition", "group", "award", "verification"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type CaseFilters = Partial<Record<FilterKey, string>> & { q?: string };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters: CaseFilters = {
      q: optionalString(url.searchParams.get("q"), {
        max: 80,
        label: "搜索词",
      }),
      edition: optionalString(url.searchParams.get("edition"), {
        max: 40,
        label: "届次",
      }),
      group: optionalString(url.searchParams.get("group"), {
        max: 24,
        label: "组别",
      }),
      award: optionalString(url.searchParams.get("award"), {
        max: 48,
        label: "奖项",
      }),
      verification: optionalString(url.searchParams.get("verification"), {
        max: 32,
        label: "核验状态",
      }),
    };

    for (const key of FILTER_KEYS) {
      const value = filters[key];
      if (value && !new Set(awardCases.map((item) => item[key])).has(value)) {
        throw new ApiError(
          400,
          "invalid_case_filter",
          `${filterLabel(key)} 不是案例库中的有效筛选值。`,
        );
      }
    }

    const cases = awardCases.filter((item) => matches(item, filters));
    const facets = Object.fromEntries(
      FILTER_KEYS.map((key) => [
        `${key}s`,
        countFacet(
          awardCases.filter((item) => matches(item, filters, key)),
          key,
        ),
      ]),
    );

    return Response.json(
      {
        cases,
        total: cases.length,
        library: awardCaseLibraryStats,
        notice: awardCaseLibraryNotice,
        facets,
      },
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

function matches(
  item: AwardCase,
  filters: CaseFilters,
  ignore?: FilterKey,
): boolean {
  if (filters.q) {
    const needle = filters.q.toLocaleLowerCase("zh-CN");
    const haystack = [
      item.title,
      item.subtitle,
      item.edition,
      String(item.year),
      item.institution,
      item.group,
      item.award,
      item.summary,
      ...(item.topic ?? []),
      ...(item.region ?? []),
      ...item.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    if (!haystack.includes(needle)) return false;
  }

  return FILTER_KEYS.every(
    (key) => key === ignore || !filters[key] || item[key] === filters[key],
  );
}

function countFacet(items: AwardCase[], key: FilterKey) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item[key], (counts.get(item[key]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN"));
}

function filterLabel(key: FilterKey) {
  return {
    edition: "届次",
    group: "组别",
    award: "奖项",
    verification: "核验状态",
  }[key];
}
