export const PROCESS_EVENT_KINDS = ['user.message', 'agent.message', 'model.request', 'model.receipt', 'tool.request', 'tool.result', 'memory.read', 'checkpoint', 'error'] as const;
export type ProcessEventKind = typeof PROCESS_EVENT_KINDS[number];
export type ProcessEvent = { id: string; threadId: string; at: number; kind: ProcessEventKind; summary: string; correlationId?: string; refs?: string[]; detail?: Record<string, string | number | boolean | null> };
export type ProcessCheckpoint = { id: string; threadId: string; at: number; eventId: string; messageId?: string; projectId?: string | null; memoryRevision?: number };
export const PROCESS_LIMITS = { summary: 400, detailKeys: 24, detailValue: 600, refs: 24 } as const;
const fail = (): never => { throw new Error('invalid process event'); };
const clip = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const text = (value: unknown, limit: number): string => typeof value === 'string' && value.trim() ? clip(value.trim(), limit) : fail();
const detail = (value: unknown): Record<string, string | number | boolean | null> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > PROCESS_LIMITS.detailKeys) fail();
  return Object.fromEntries(entries.map(([key, item]) => {
    if (typeof item === 'string') return [key, clip(item, PROCESS_LIMITS.detailValue)];
    if (typeof item === 'number' && Number.isFinite(item)) return [key, item];
    if (typeof item === 'boolean' || item === null) return [key, item];
    return fail();
  }));
};
export function makeProcessEvent(input: ProcessEvent): ProcessEvent {
  if (!(PROCESS_EVENT_KINDS as readonly string[]).includes(input.kind)) fail();
  if (!input.id || !input.threadId || !Number.isFinite(input.at)) fail();
  const refs = input.refs ? [...new Set(input.refs.filter(item => typeof item === 'string' && item.trim()).map(item => clip(item, 120)))].slice(0, PROCESS_LIMITS.refs) : undefined;
  return { ...input, summary: text(input.summary, PROCESS_LIMITS.summary), ...(input.correlationId ? { correlationId: clip(input.correlationId, 80) } : {}), ...(refs?.length ? { refs } : {}), ...(input.detail ? { detail: detail(input.detail) } : {}) };
}
export function makeProcessCheckpoint(input: ProcessCheckpoint): ProcessCheckpoint {
  if (!input.id || !input.threadId || !input.eventId || !Number.isFinite(input.at)) fail();
  return { ...input, ...(input.projectId === undefined ? {} : { projectId: input.projectId }), ...(input.memoryRevision === undefined ? {} : { memoryRevision: input.memoryRevision }) };
}
const LABELS: Record<ProcessEventKind, string> = { 'user.message': '你', 'agent.message': '证见', 'model.request': '模型请求', 'model.receipt': '模型回执', 'tool.request': '工具请求', 'tool.result': '工具结果', 'memory.read': '读取项目记忆', checkpoint: '检查点', error: '错误' };
export const eventLabel = (kind: ProcessEventKind): string => LABELS[kind];
export const eventTime = (at: number): string => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
