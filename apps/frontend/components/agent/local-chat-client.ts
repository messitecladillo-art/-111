'use client';

import { HostedApiError } from '@/components/hosted/api-client';
import { parseChatReceipt, type ChatReceipt, type ChatRequest } from '@/lib/agent/chat';
import type { MemorySnapshot } from '@evix/shared';
import type { LocalModelConfig } from './local-model';

/** One local-model turn through the browser's own key. No login, no project database, no stored key on the server. */
export async function sendLocalChatTurn(request: ChatRequest, config: LocalModelConfig, memory: MemorySnapshot | null): Promise<ChatReceipt> {
  let response: Response;
  try {
    response = await fetch('/api/local-agent/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify({ provider: config.provider, model: config.model, apiKey: config.apiKey, request, memory }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new HostedApiError(0, 'network_outcome_unknown', '本地模型请求没有完成；可能已经发出，请核对服务商用量。');
  }
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new HostedApiError(response.status, 'invalid_server_receipt', '本地模型回执格式无效。'); }
  if (!response.ok) {
    const error = (value as { error?: { code?: unknown; message?: unknown } })?.error;
    const code = typeof error?.code === 'string' ? error.code : 'request_failed';
    const message = typeof error?.message === 'string' ? error.message : '本地模型请求未完成。';
    throw new HostedApiError(response.status, code, message);
  }
  return parseChatReceipt(value);
}
