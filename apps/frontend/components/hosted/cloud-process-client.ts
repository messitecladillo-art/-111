import type { Message } from '../agent/threads.ts';
import type { ProcessCheckpoint, ProcessEvent } from '../../lib/agent/process.ts';
import { hostedRequest } from './api-client.ts';

export type CloudThreadHead = { threadId: string; title: string; revision: number; updatedAt: string; contentHash: string };
export type CloudThreadSnapshot = {
  schemaVersion: 1; threadId: string; title: string; revision: number;
  messages: Message[]; events: ProcessEvent[]; checkpoint: ProcessCheckpoint | null;
  contentHash: string; updatedAt: string;
};
export type CloudThreadSave = { threadId: string; title: string; revision: number; contentHash: string; updatedAt: string };

export async function listCloudThreads(projectId: string): Promise<CloudThreadHead[]> {
  const value = await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/agent-threads`) as { threads?: unknown };
  if (!Array.isArray(value.threads)) throw new Error('云端过程列表格式无效。');
  return value.threads as CloudThreadHead[];
}

export async function fetchCloudThread(projectId: string, threadId: string): Promise<CloudThreadSnapshot> {
  return await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/agent-threads/${encodeURIComponent(threadId)}`) as CloudThreadSnapshot;
}

export async function saveCloudThread(projectId: string, threadId: string, input: {
  expectedRevision: number; title: string; messages: Message[]; events: readonly ProcessEvent[]; checkpoint: ProcessCheckpoint | null;
}): Promise<CloudThreadSave> {
  return await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/agent-threads/${encodeURIComponent(threadId)}`, {
    method: 'PUT',
    body: { schemaVersion: 1, idempotencyKey: crypto.randomUUID(), ...input },
    timeoutMs: 60_000,
  }) as CloudThreadSave;
}
