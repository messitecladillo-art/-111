import type { PageSlice } from '../paper-layout';

export type LiveWritingStatus = {
  active: boolean;
  phase: 'contract' | 'wave1' | 'wave2' | 'repair' | 'done' | 'error' | 'failed' | 'cancelled';
  completed: number;
  total: number;
  paragraphs: number;
  facts: number;
  lastSectionId: string | null;
  lastSectionTitle: string;
  topicTitle: string;
  autoFollow: boolean;
};

export type ReportWorkState = {
  phase: 'preparing' | 'writing' | 'reviewing' | 'waiting' | 'error' | 'complete';
  detail: string;
  completed: number;
  total: number;
};

const count = (n: number) => Number.isSafeInteger(n) && n >= 0 ? n : 0;

/** Only actual progress receipts supply counts. A completed report replaces this screen-only view. */
export function reportWorkState(live: LiveWritingStatus | null): ReportWorkState | null {
  if (!live || live.phase === 'done' || (!live.active && live.phase !== 'error' && live.phase !== 'failed')) return null;
  const total = live.phase === 'contract' ? 0 : count(live.total);
  const completed = total ? Math.min(count(live.completed), total) : 0;
  if (live.phase === 'error' || live.phase === 'failed') return { phase: 'error', detail: '当前内容已保留，可在对话中查看原因。', completed, total };
  if (live.phase === 'contract') return { phase: 'preparing', detail: '等待接收章节计划与研究材料', completed: 0, total: 0 };
  if (live.phase === 'repair') return { phase: 'reviewing', detail: '正在核对表述与已登记的研究结果', completed, total };
  return {
    phase: 'writing',
    detail: live.lastSectionId ? `最近写入：${live.lastSectionTitle}` : '等待章节返回，内容到达后会写入纸面',
    completed, total,
  };
}

/** Fits entirely below the page's actual last content, never in the measured/printed flow. */
export function reportWorkPlacement(
  pages: readonly PageSlice[],
  tops: readonly number[],
  heights: readonly number[],
  styles: readonly string[],
  contentHeight: number,
  workstationHeight: number,
  preferredPage?: number,
): { page: number; top: number } | null {
  if (![contentHeight, workstationHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  for (let page = pages.length - 1; page >= 0; page--) {
    if (preferredPage !== undefined && preferredPage !== page) continue;
    const slice = pages[page];
    if (!['body', 'front'].includes(styles[slice.first])) continue;
    const bottom = Math.min(slice.end, tops[slice.last] + heights[slice.last]) - slice.start;
    if (!Number.isFinite(bottom) || bottom < 0) continue;
    const top = bottom + 24;
    if (top + workstationHeight + 16 <= contentHeight) return { page, top };
  }
  return null;
}

export type ReportRunScope = { owner: string | null; epoch: number; thread: string | null; project: string | null };
export type ReportRunTicket = { scope: ReportRunScope; controller: AbortController; onCancel?: () => void };
export const sameReportRunScope = (a: ReportRunScope, b: ReportRunScope) =>
  a.owner === b.owner && a.epoch === b.epoch && a.thread === b.thread && a.project === b.project;

/** A late or superseded stream must not update a different conversation/project. No retry is automatic. */
export class ReportRunFence {
  private current: ReportRunTicket | null = null;
  get active(): boolean { return !!this.current && !this.current.controller.signal.aborted; }
  start(scope: ReportRunScope, onCancel?: () => void): ReportRunTicket | null {
    if (this.current && !this.current.controller.signal.aborted) return null;
    const ticket = { scope: { ...scope }, controller: new AbortController(), onCancel };
    this.current = ticket;
    return ticket;
  }
  accepts(ticket: ReportRunTicket, scope: ReportRunScope): boolean {
    return this.current === ticket && !ticket.controller.signal.aborted && sameReportRunScope(ticket.scope, scope);
  }
  finish(ticket: ReportRunTicket): void { if (this.current === ticket) this.current = null; }
  cancel(): void {
    const ticket = this.current;
    this.current = null;
    ticket?.controller.abort();
    ticket?.onCancel?.();
  }
  cancelScope(scope: ReportRunScope): void { if (this.current && sameReportRunScope(this.current.scope, scope)) this.cancel(); }
}
