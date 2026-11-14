import type { ChatAction, ChatContext, ChatLine, TokenUsage } from './chat.ts';
import type { AgentToolSpec } from './tools-schema.ts';

export type BrainPresetId = 'deepseek' | 'openai' | 'qwen';

export type BrainStatus = {
  available: boolean;
  directGatewayEnabled?: boolean;
  provider: string;
  model: string;
  source: 'env' | 'offline';
  tools: readonly Pick<AgentToolSpec, 'id' | 'zhLabel' | 'category' | 'categoryLabel' | 'mutates' | 'summary' | 'argsHint'>[];
};

export type CustomBrainOverride = {
  preset: BrainPresetId;
  model?: string;
  apiKey?: string;
};

export type BrainToolCall = {
  id: string;
  action: ChatAction;
};

export type BrainStepTrace = {
  assistantContent?: string;
  assistantToolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  toolOutputs: Array<{ toolCallId: string; tool: string; text: string }>;
};

export type BrainTurnResponse = {
  ok: true;
  provider: string;
  model: string;
  reply: string;
  reasoning?: string;
  toolCalls: BrainToolCall[];
  rawToolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  droppedTools: number;
  usage: TokenUsage | null;
  latencyMs: number;
};

export type BrainTurnError = {
  ok: false;
  code: string;
  error: string;
};

export type BrainTurnRequest = {
  message: string;
  history: ChatLine[];
  context: ChatContext;
  step: number;
  steps?: BrainStepTrace[];
  custom?: CustomBrainOverride;
};

export async function fetchBrainStatus(signal?: AbortSignal): Promise<BrainStatus> {
  const res = await fetch('/api/agent/brain', { method: 'GET', cache: 'no-store', signal });
  if (!res.ok) throw new Error(`Brain status failed: ${res.status}`);
  return (await res.json()) as BrainStatus;
}

export async function sendBrainTurn(payload: BrainTurnRequest, signal?: AbortSignal): Promise<BrainTurnResponse> {
  const res = await fetch('/api/agent/brain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal,
  });
  const data = (await res.json().catch(() => null)) as BrainTurnResponse | BrainTurnError | null;
  if (!res.ok || !data || !data.ok) {
    const err = data && !data.ok ? data.error : `请求失败 (${res.status})`;
    const code = data && !data.ok ? data.code : 'brain_error';
    const error = new Error(err) as Error & { code?: string };
    error.code = code;
    throw error;
  }
  return data;
}
