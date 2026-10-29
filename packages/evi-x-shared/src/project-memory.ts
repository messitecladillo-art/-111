import type { MembershipRole } from './api-types.ts';

export const INTENT_FIELDS = ['title', 'researchQuestion', 'decisionGoal', 'population', 'geography', 'stage'] as const;
export type IntentField = typeof INTENT_FIELDS[number];
export const DECISION_SCOPES = ['rules', 'design', 'sampling', 'analysis', 'report', 'general'] as const;
export type DecisionScope = typeof DECISION_SCOPES[number];
export type MemorySourceKind = 'user' | 'topic' | 'diagnosis' | 'rules' | 'agent' | 'import';
export type MemorySource = { kind: MemorySourceKind; ref?: string; revision?: number; hash?: string; conversationId?: string; turnId?: string; serviceId?: string };
export type IntentValue = { value: string; status: 'confirmed' | 'unknown'; source?: MemorySource; confirmedBy?: string; confirmedAt?: string };
export type MemoryDecision = { id: string; statement: string; rationale: string; scope: DecisionScope; status: 'confirmed' | 'superseded' | 'revoked'; source?: MemorySource; confirmedBy?: string; confirmedAt?: string; supersedes?: string | null };
export type MemoryQuestion = { id: string; question: string; why: string; next: string; status: 'open' | 'resolved'; source?: MemorySource; createdAt: string; resolvedBy?: string };
export type ProjectMemoryDocument = { schemaVersion: 1; intent: Record<IntentField, IntentValue>; decisions: MemoryDecision[]; openQuestions: MemoryQuestion[] };
export type MemorySeed = { intent: Partial<Record<IntentField, string>>; source: MemorySource };
export type MemorySnapshot = {
  schemaVersion: 1; projectId: string; revision: number; contentHash: string; document: ProjectMemoryDocument;
  permissions: { role: MembershipRole; canEdit: boolean }; seed: MemorySeed | null;
};
export type MemoryVersion = { id: string; revision: number; contentHash: string; createdAt: string; createdBy: string; changeNote: string; document: ProjectMemoryDocument };

const fail = (): never => { throw new Error('invalid project memory'); };
const record = (value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  for (const key of keys) if (!(key in row)) fail();
  for (const key of Object.keys(row)) if (!keys.includes(key) && !optional.includes(key)) fail();
  return row;
};
const str = (value: unknown, max: number): string => typeof value === 'string' && value.length <= max ? value : fail();
const source = (value: unknown): MemorySource => {
  const row = record(value, ['kind'], ['ref', 'revision', 'hash', 'conversationId', 'turnId', 'serviceId']);
  if (!['user', 'topic', 'diagnosis', 'rules', 'agent', 'import'].includes(row.kind as string)) fail();
  return {
    kind: row.kind as MemorySourceKind,
    ...(row.ref === undefined ? {} : { ref: str(row.ref, 120) }),
    ...(row.revision === undefined ? {} : { revision: typeof row.revision === 'number' ? row.revision : fail() }),
    ...(row.hash === undefined ? {} : { hash: str(row.hash, 64) }),
    ...(row.conversationId === undefined ? {} : { conversationId: str(row.conversationId, 64) }),
    ...(row.turnId === undefined ? {} : { turnId: str(row.turnId, 64) }),
    ...(row.serviceId === undefined ? {} : { serviceId: str(row.serviceId, 64) }),
  };
};
const intent = (value: unknown): Record<IntentField, IntentValue> => {
  const row = record(value, INTENT_FIELDS);
  return Object.fromEntries(INTENT_FIELDS.map(field => {
    const item = record(row[field], ['value', 'status'], ['source', 'confirmedBy', 'confirmedAt']);
    if (item.status !== 'confirmed' && item.status !== 'unknown') fail();
    return [field, {
      value: str(item.value, 600), status: item.status,
      ...(item.source === undefined ? {} : { source: source(item.source) }),
      ...(item.confirmedBy === undefined ? {} : { confirmedBy: str(item.confirmedBy, 64) }),
      ...(item.confirmedAt === undefined ? {} : { confirmedAt: str(item.confirmedAt, 40) }),
    }];
  })) as Record<IntentField, IntentValue>;
};
const decision = (value: unknown): MemoryDecision => {
  const row = record(value, ['id', 'statement', 'rationale', 'scope', 'status'], ['source', 'confirmedBy', 'confirmedAt', 'supersedes']);
  if (!DECISION_SCOPES.includes(row.scope as DecisionScope) || !['confirmed', 'superseded', 'revoked'].includes(row.status as string)) fail();
  return {
    id: str(row.id, 64), statement: str(row.statement, 1200), rationale: str(row.rationale, 2000),
    scope: row.scope as DecisionScope, status: row.status as MemoryDecision['status'],
    ...(row.source === undefined ? {} : { source: source(row.source) }),
    ...(row.confirmedBy === undefined ? {} : { confirmedBy: str(row.confirmedBy, 64) }),
    ...(row.confirmedAt === undefined ? {} : { confirmedAt: str(row.confirmedAt, 40) }),
    ...(row.supersedes === undefined ? {} : { supersedes: row.supersedes === null ? null : str(row.supersedes, 64) }),
  };
};
const question = (value: unknown): MemoryQuestion => {
  const row = record(value, ['id', 'question', 'why', 'next', 'status', 'createdAt'], ['source', 'resolvedBy']);
  if (row.status !== 'open' && row.status !== 'resolved') fail();
  return {
    id: str(row.id, 64), question: str(row.question, 1200), why: str(row.why, 1000), next: str(row.next, 1000),
    status: row.status, createdAt: str(row.createdAt, 40),
    ...(row.source === undefined ? {} : { source: source(row.source) }),
    ...(row.resolvedBy === undefined ? {} : { resolvedBy: str(row.resolvedBy, 64) }),
  };
};
export function parseProjectMemoryDocument(value: unknown): ProjectMemoryDocument {
  const row = record(value, ['schemaVersion', 'intent', 'decisions', 'openQuestions']);
  if (row.schemaVersion !== 1 || !Array.isArray(row.decisions) || !Array.isArray(row.openQuestions)) fail();
  return { schemaVersion: 1, intent: intent(row.intent), decisions: row.decisions.map(decision), openQuestions: row.openQuestions.map(question) };
}
export function parseMemorySnapshot(value: unknown): MemorySnapshot {
  const row = record(value, ['schemaVersion', 'projectId', 'revision', 'contentHash', 'document', 'permissions'], ['seed']);
  if (row.schemaVersion !== 1 || typeof row.revision !== 'number') fail();
  const permissions = record(row.permissions, ['role', 'canEdit']);
  if (!['owner', 'editor', 'reviewer', 'viewer'].includes(permissions.role as string)) fail();
  const seedValue = row.seed;
  const seed = seedValue === null || seedValue === undefined ? null : (() => {
    const item = record(seedValue, ['intent', 'source']);
    const values = record(item.intent, Object.keys(item.intent as object));
    const clean = Object.fromEntries(Object.entries(values)
      .filter(([key]) => INTENT_FIELDS.includes(key as IntentField))
      .map(([key, text]) => [key, str(text, 600)]));
    return { intent: clean as Partial<Record<IntentField, string>>, source: source(item.source) };
  })();
  return {
    schemaVersion: 1, projectId: str(row.projectId, 64), revision: row.revision, contentHash: str(row.contentHash, 64),
    document: parseProjectMemoryDocument(row.document),
    permissions: { role: permissions.role as MembershipRole, canEdit: permissions.canEdit === true },
    seed,
  };
}
