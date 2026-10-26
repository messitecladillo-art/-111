import catalog from '../data/report-cases.json' with { type: 'json' };

/** Only works with an inspected, complete original PDF enter the reading library. */
export type ReportCase = {
  id: string; title: string; subtitle: string; filename: string; sha256: string;
  pages: number; bytes: number; year: number | null; edition: string | null;
  institution: string | null; group: string | null; award: string | null;
  region: string[]; topic: string[]; summary: string; methods: string[];
  readingGuide: { label: string; page: number; note: string }[];
  sourceCollection: string;
};

export const REPORT_CASES: readonly ReportCase[] = catalog.cases;
export const REPORT_CATALOG_VERSION = catalog.version;
export const REPORT_CATALOG_DATE = catalog.capturedAt;
export const REPORT_LIBRARY_STATS = {
  total: REPORT_CASES.length,
  fullReports: REPORT_CASES.length,
  pages: REPORT_CASES.reduce((total, report) => total + report.pages, 0),
  readingGuides: REPORT_CASES.reduce((total, report) => total + report.readingGuide.length, 0),
};

export type ReportFilters = { q?: string; region?: string; method?: string; topic?: string; edition?: string; group?: string; award?: string };
export function filterReportCases(filters: ReportFilters = {}): ReportCase[] {
  const terms = (filters.q ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN').trim().split(/\s+/u).filter(Boolean);
  return REPORT_CASES.filter(report => {
    const text = [report.title, report.subtitle, report.summary, report.institution, ...report.region, ...report.topic, ...report.methods].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('zh-CN');
    return terms.every(term => text.includes(term))
      && (!filters.region || report.region.includes(filters.region))
      && (!filters.method || report.methods.includes(filters.method))
      && (!filters.topic || report.topic.includes(filters.topic))
      && (!filters.edition || report.edition === filters.edition)
      && (!filters.group || report.group === filters.group)
      && (!filters.award || report.award === filters.award);
  });
}

export function reportFacet(key: 'region' | 'topic' | 'methods' | 'edition' | 'group' | 'award') {
  const counts = new Map<string, number>();
  for (const report of REPORT_CASES) {
    const field = report[key];
    for (const value of new Set(Array.isArray(field) ? field : field ? [field] : [])) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-CN'));
}
