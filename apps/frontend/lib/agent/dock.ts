import type { Routed } from './router.ts';

export const AGENT_HANDOFF_KEY = 'evix.agent.handoff.v1';

const HANDOFF_TTL_MS = 120_000;
const HIDDEN_PREFIXES = ['/agent', '/login', '/invites', '/s'] as const;

export function shouldShowGlobalDock(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function buildHandoffPayload(text: string, now = Date.now()): string {
  return JSON.stringify({ text: text.trim(), at: now });
}

export function parseHandoffPayload(raw: string | null, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    const fresh = typeof parsed.at === 'number' && now - parsed.at < HANDOFF_TTL_MS && now - parsed.at >= -5_000;
    return text && fresh ? text : null;
  } catch {
    return null;
  }
}

export function needsAgentShellHandoff(routed: Routed): boolean {
  if ('generate' in routed || 'draft' in routed) return true;
  if ('lookup' in routed) return false;
  const act = routed.turn.act;
  if (
    act &&
    (act.type === 'open' ||
      act.type === 'stage' ||
      act.type === 'loadBenchmark' ||
      act.type === 'generateFullReport' ||
      act.type === 'draftSection' ||
      act.type === 'place' ||
      act.type === 'adopt' ||
      act.type === 'insertStudioBlock')
  ) {
    return true;
  }
  return !!routed.turn.cards?.some(
    (card) =>
      card.kind === 'chart-studio' ||
      card.kind === 'code-studio' ||
      card.kind === 'writing-studio' ||
      card.kind === 'confirm',
  );
}
