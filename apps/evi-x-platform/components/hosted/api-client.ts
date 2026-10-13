import { rejectDuplicateMembers } from '@evix/shared';

export class HostedApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'HostedApiError'; this.status = status; this.code = code; }
}
export async function hostedRequest(path: string, options: { method?: string; body?: unknown; csrfToken?: string; signal?: AbortSignal; timeoutMs?: number; maxBytes?: number } = {}): Promise<unknown> {
  if (!path.startsWith('/api/') || path.includes('://')) throw Error('不支持的接口。');
  const headers = new Headers({ accept: 'application/json' });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.csrfToken) headers.set('X-CSRF-Token', options.csrfToken);
  let response: Response;
  try {
    response = await fetch(path, { method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store', headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: options.signal || AbortSignal.timeout(options.timeoutMs ?? 45_000) });
  } catch { throw new HostedApiError(0, 'network_outcome_unknown', '连接未完成，操作结果尚不明确。当前内容已保留，请核对后再操作。'); }
  if (response.status === 204) return undefined;
  let value: unknown;
  try {
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let length = 0;
    if (reader) {
      try { while (true) { const item = await reader.read(); if (item.done) break; length += item.value.byteLength; if (length > (options.maxBytes ?? 1_000_000)) { void reader.cancel().catch(() => {}); throw Error(); } chunks.push(item.value); } }
      finally { reader.releaseLock(); }
    }
    const bytes = new Uint8Array(length); let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); value = JSON.parse(raw); rejectDuplicateMembers(raw);
  } catch { throw new HostedApiError(response.status, 'invalid_server_receipt', '未收到可核对的服务回执。当前内容已保留，请稍后核对。'); }
  if (!response.ok) {
    const error = (value as { error?: { code?: unknown; message?: unknown } })?.error;
    const code = typeof error?.code === 'string' && /^[a-z0-9_]{1,80}$/.test(error.code) ? error.code : 'request_failed';
    const message = typeof error?.message === 'string' && error.message.length <= 400 ? error.message : '操作未完成，请核对当前状态。';
    throw new HostedApiError(response.status, code, message);
  }
  return value;
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '操作未完成，当前内容已保留。'; }
export function downloadQuestionnaire(design: unknown, filename = '问卷设计备份.json'): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
