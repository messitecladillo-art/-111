'use client';

import { hostedRequest } from '@/components/hosted/api-client';
import { parseChatReceipt, type ChatReceipt, type ChatRequest } from '@/lib/agent/chat';

type Mutate = (path: string, body?: unknown, method?: string, options?: { maxBytes?: number; timeoutMs?: number }) => Promise<unknown>;

/** Sends one turn. The backend records it before calling the model, so the same key replays it and never bills twice. */
export async function sendChatTurn(mutate: Mutate, request: ChatRequest): Promise<ChatReceipt> {
  return parseChatReceipt(await mutate('/api/agent/turns', request, 'POST', { timeoutMs: 60_000, maxBytes: 200_000 }));
}

/** Reads a turn's receipt. This never calls the model. */
export async function readChatTurn(id: string): Promise<ChatReceipt> {
  return parseChatReceipt(await hostedRequest(`/api/agent/turns/${encodeURIComponent(id)}`, { maxBytes: 200_000 }));
}
