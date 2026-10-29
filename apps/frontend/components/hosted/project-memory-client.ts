import { parseMemorySnapshot, type MemorySnapshot, type ProjectMemoryDocument } from '@evix/shared';
import { hostedRequest } from './api-client.ts';

export type MemoryVersionHead = { id: string; revision: number; contentHash: string; createdBy: string; createdAt: string; changeNote: string };

export async function fetchMemory(projectId: string): Promise<MemorySnapshot> {
  return parseMemorySnapshot(await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/memory`));
}

export async function saveMemory(projectId: string, input: {
  expectedRevision: number; document: ProjectMemoryDocument; changeNote: string;
}): Promise<MemorySnapshot> {
  return parseMemorySnapshot(await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/memory/versions`, {
    method: 'POST',
    body: { schemaVersion: 1, idempotencyKey: crypto.randomUUID(), ...input },
  }));
}

export async function fetchMemoryVersions(projectId: string): Promise<MemoryVersionHead[]> {
  const value = await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/memory/versions`) as { versions?: unknown };
  if (!Array.isArray(value.versions)) throw new Error('项目记忆版本格式无效。');
  return value.versions as MemoryVersionHead[];
}

export async function fetchMemoryVersion(projectId: string, versionId: string): Promise<{ document: ProjectMemoryDocument }> {
  const value = await hostedRequest(`/api/projects/${encodeURIComponent(projectId)}/memory/versions/${encodeURIComponent(versionId)}`) as { document?: unknown };
  if (!value.document) throw new Error('项目记忆版本格式无效。');
  return { document: parseMemoryDocument(value.document) };
}

function parseMemoryDocument(value: unknown): ProjectMemoryDocument {
  const snapshot = parseMemorySnapshot({
    schemaVersion: 1, projectId: 'version', revision: 1, contentHash: '0'.repeat(64),
    document: value, permissions: { role: 'viewer', canEdit: false }, seed: null,
  });
  return snapshot.document;
}
