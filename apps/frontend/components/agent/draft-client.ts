'use client';

import { hostedRequest } from '@/components/hosted/api-client';
import { parseDraftReceipt, type DraftReceipt, type DraftRequest } from '@/lib/agent/draft';

type Mutate = (path: string, body?: unknown, method?: string, options?: { maxBytes?: number; timeoutMs?: number }) => Promise<unknown>;

/** Asks for one section draft. The backend records it before calling the model, so the same key replays it and never bills twice. */
export async function sendDraft(mutate: Mutate, request: DraftRequest): Promise<DraftReceipt> {
  return parseDraftReceipt(await mutate('/api/agent/drafts', request, 'POST', { timeoutMs: 120_000, maxBytes: 200_000 }), new Set(request.facts.map(f => f.id)));
}

/** Reads a draft's receipt. This never calls the model. */
export async function readDraft(id: string, factIds: ReadonlySet<string>): Promise<DraftReceipt> {
  return parseDraftReceipt(await hostedRequest(`/api/agent/drafts/${encodeURIComponent(id)}`, { maxBytes: 200_000 }), factIds);
}
