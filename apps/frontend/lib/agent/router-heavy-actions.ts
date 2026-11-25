/**
 * On-demand asynchronous resolver for heavy resource-library actions routed by `router.ts`
 * (`lookupCounty` across 2,845 county profiles + `recommendResource` across all 4 catalogs & Dagre diagrams).
 *
 * Keeping this resolver in its own module lets `/agent` and `GlobalAgentDock` load `router.ts` synchronously
 * with zero static runtime bundle cost from `china-county-gazetteer`, `smart-recommender`, or `@dagrejs/dagre`.
 */
import type { EditorContent } from '../editor-model.ts';
import type { CountyGazetteerProfile } from '../resource-library/china-county-gazetteer.ts';
import {
  formatLookupCountyTurn,
  formatRecommendResourceTurn,
  type AgentTurn,
  type RouterContext,
} from './router.ts';

export async function resolveHeavyRouted(
  routed: { lookupCounty: string } | { recommendResource: { query?: string; ctx: RouterContext } },
): Promise<AgentTurn> {
  if ('lookupCounty' in routed) {
    const q = routed.lookupCounty.trim();
    const { getCountyProfile, searchCountyGazetteer } = await import(
      '../resource-library/china-county-gazetteer.ts'
    );
    const hits: CountyGazetteerProfile[] = /^\d{6}$/.test(q)
      ? (() => {
          const exact = getCountyProfile(q);
          return exact ? [exact] : [];
        })()
      : searchCountyGazetteer(q, { limit: 4 });
    return formatLookupCountyTurn(routed.lookupCounty, hits);
  }

  const { query, ctx } = routed.recommendResource;
  const cleanQuery = (query ?? '').trim();
  const [{ createEditorContent }, { buildSmartRecommendations }] = await Promise.all([
    import('../editor-model.ts'),
    import('../resource-library/smart-recommender.ts'),
  ]);
  const base = createEditorContent();
  const title = [ctx.projectTitle?.trim(), cleanQuery].filter(Boolean).join(' · ') || base.title;
  const probe: EditorContent = {
    ...base,
    title,
    subtitle: cleanQuery ? `围绕“${cleanQuery}”匹配研究资料` : base.subtitle,
    report: cleanQuery
      ? [
          {
            id: 'probe-query',
            title: cleanQuery,
            body: cleanQuery,
            source: '',
            blocks: [
              {
                id: 'probe-block',
                kind: 'paragraph' as const,
                text: cleanQuery,
                evidenceId: '',
                valueColumn: 0,
              },
            ],
          },
          ...base.report,
        ]
      : base.report,
    ...(ctx.results
      ? {
          quality: {
            version: 1 as const,
            results: [...ctx.results.results],
            findings: [...ctx.results.findings],
          },
        }
      : {}),
  };
  const bundle = buildSmartRecommendations(probe);
  return formatRecommendResourceTurn(query, bundle);
}
