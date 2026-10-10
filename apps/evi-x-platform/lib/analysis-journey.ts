/** A UI projection of observed analysis state; never an execution graph. */
export type JourneyModuleStatus = 'draft' | 'ready' | 'stale' | 'error' | 'diagnostic';
export type JourneyModule = { id: string; title: string; status: JourneyModuleStatus; n: number | null; computedAt: string | null };
export type JourneySnapshot = { scope: string; activeId: string | null; modules: JourneyModule[] };
export const journeyScope = (contextKey: string, missingCodes: readonly string[]) => JSON.stringify({ contextKey, missingCodes });

export function moduleJourneyStatus(input: { hasResult: boolean; current: boolean; error: boolean; n: number | null; estimate: number | null }): JourneyModuleStatus {
  if (input.error) return 'error';
  if (!input.hasResult) return 'draft';
  if (!input.current) return 'stale';
  if (input.n === null || input.n < 1 || input.estimate === null || !Number.isFinite(input.estimate)) return 'diagnostic';
  return 'ready';
}

export function currentJourneyModules(snapshot: JourneySnapshot | null, scope: string): JourneyModule[] {
  return snapshot?.scope === scope ? snapshot.modules : [];
}

export const JOURNEY_STATUS_LABELS: Record<JourneyModuleStatus, string> = {
  draft: '待配置与计算', ready: '结果可用', stale: '待重新计算', error: '需要调整', diagnostic: '诊断已返回',
};
