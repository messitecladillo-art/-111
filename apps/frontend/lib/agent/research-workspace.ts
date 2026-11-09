/** Browser-only recovery drafts. Cloud topic versions and competition CLI state remain authoritative. */
import { parseExecutableTopicProfile, stableStringify } from '../topic-advisor/parse.ts';
import { EMPTY_TOPIC_PROFILE, type TopicProfile } from '../topic-advisor/types.ts';
import { parseTopicAgentTurn } from '../topic-agent/index.ts';
import { parseTopicProjectDocument, type TopicProjectDocument } from '../topic-project.ts';
import { MAX_LITERATURE_WORKSPACE_BYTES, parseLiteratureWorkspaceSnapshot, verifyLiteratureWorkspaceSnapshot, type LiteratureWorkspaceSnapshot } from '../topic-lab/workspace.ts';
import { parseDiagnosisBriefSource, type DiagnosisBriefSource } from '../diagnosis-actions.ts';
import { diagnoseProject, type DiagnosisResult } from '../project-diagnosis.ts';
import type { ResearchIntake } from './research-intake.ts';
import { LITERATURE_STUDY_LIMITS, parseLiteratureStudy, type LiteratureStudy } from './literature-study.ts';

export type ResearchWorkspaceDraft = {
  schemaVersion: 1;
  direction: string;
  profile: TopicProfile;
  intake: ResearchIntake | null;
  selected: TopicProjectDocument | null;
  diagnosis: { source: DiagnosisBriefSource; result?: DiagnosisResult | null } | null;
  literature: LiteratureWorkspaceSnapshot | null;
  literatureStudy?: LiteratureStudy;
  autoAdvance: boolean;
  updatedAt: string;
};
export type ResearchWorkspaceCheckpoint = { scope: string; revision: number; draft: ResearchWorkspaceDraft | null };
export type ResearchWorkspaceTicket = { isCurrent: () => boolean };
export type ResearchWorkspaceWriteOptions = { expectedRevision: number; ticket?: ResearchWorkspaceTicket };
export type ResearchWorkspaceRecord = ResearchWorkspaceCheckpoint & { schema: 'research-workspace-checkpoint/v1' };
/** commit must compare and write in one atomic transaction; a deleted draft retains its revision. */
export interface ResearchWorkspaceStorage {
  read(scope: string): Promise<unknown>;
  commit(scope: string, expectedRevision: number, next: ResearchWorkspaceRecord, current: () => boolean): Promise<'committed' | 'conflict' | 'stale'>;
}
export class ResearchWorkspaceConflictError extends Error {
  constructor() { super('研究草稿已有更新，请先读取当前版本；原记录没有被覆盖。'); this.name = 'ResearchWorkspaceConflictError'; }
}
export const MAX_RESEARCH_WORKSPACE_BYTES = MAX_LITERATURE_WORKSPACE_BYTES + 2 * 1024 * 1024 + LITERATURE_STUDY_LIMITS.bytes;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
function fail(message: string): never { throw Error(`研究草稿：${message}`); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('对象格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || ![...required, ...optional].includes(key) || !Object.hasOwn(descriptors[key], 'value'))
    || required.some(key => !Object.hasOwn(descriptors, key))) fail('包含未知字段、缺失字段或访问器。');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value)) fail('文本格式或大小无效。');
  return value;
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= Number.MAX_SAFE_INTEGER) fail('修订版本无效。');
  return value as number;
}
function array<T>(value: unknown, max: number, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) fail('列表格式或大小无效。');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value')) fail('列表包含空项或访问器。');
  return value.map(parse);
}
function matchesResult(value: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return value === expected;
  if (Array.isArray(expected)) {
    if (!Array.isArray(value) || value.length !== expected.length || Reflect.ownKeys(value).length !== expected.length + 1) return false;
    return expected.every((item, i) => {
      const field = Object.getOwnPropertyDescriptor(value, String(i));
      return !!field && Object.hasOwn(field, 'value') && matchesResult(field.value, item);
    });
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const fields = Object.getOwnPropertyDescriptors(value), reference = Object.entries(expected);
  return Reflect.ownKeys(fields).length === reference.length && reference.every(([key, item]) => {
    const field = fields[key];
    return !!field && Object.hasOwn(field, 'value') && matchesResult(field.value, item);
  });
}
function intake(value: unknown): ResearchIntake {
  const x = object(value, ['schemaVersion', 'status', 'classification', 'inputHash', 'turn', 'candidates', 'missing']);
  if (x.schemaVersion !== 1 || !['ready', 'blocked'].includes(x.status as string) || x.classification !== 'proposed' || !/^[a-f0-9]{64}$/u.test(text(x.inputHash, 64))) fail('选题回执无效。');
  const turn = parseTopicAgentTurn(x.turn), seen = new Set<string>();
  const candidates = array(x.candidates, 3, value => {
    const candidate = object(value, ['patternId', 'document']), patternId = text(candidate.patternId, 100);
    const item = turn.assistant?.items.find(item => item.patternId === patternId), document = parseTopicProjectDocument(candidate.document);
    if (seen.has(patternId) || !item || !turn.candidateIds.includes(patternId) || document.selected?.id !== patternId
      || document.selected.kind !== 'pattern' || document.brief.title !== item.title
      || stableStringify(document.provenance.sourceIds) !== stableStringify(item.sourceIds)) fail('候选文档与回执不一致。');
    seen.add(patternId);
    return { patternId, document };
  });
  if (turn.status !== 'ready' || (x.status === 'ready') !== (candidates.length > 0)) fail('选题回执状态不一致。');
  return { schemaVersion: 1, status: x.status as ResearchIntake['status'], classification: 'proposed', inputHash: x.inputHash as string,
    turn, candidates, missing: array(x.missing, 20, value => text(value, 1200)) };
}
function diagnosis(value: unknown): NonNullable<ResearchWorkspaceDraft['diagnosis']> {
  const d = object(value, ['source'], ['result']), parsed = parseDiagnosisBriefSource(d.source);
  if (d.result == null) return { source: parsed, ...(Object.hasOwn(d, 'result') ? { result: null } : {}) };
  // Recompute the canonical deterministic result; a saved score is never accepted as an independent fact.
  const result = diagnoseProject(parsed.input);
  if (!matchesResult(d.result, result)) fail('诊断结果与当前输入或规则不一致。');
  return { source: parsed, result };
}
export function emptyResearchWorkspaceDraft(direction = ''): ResearchWorkspaceDraft {
  return { schemaVersion: 1, direction: text(direction, 1200), profile: structuredClone(EMPTY_TOPIC_PROFILE), intake: null, selected: null, diagnosis: null,
    literature: null, autoAdvance: true, updatedAt: new Date().toISOString() };
}
export function parseResearchWorkspaceDraft(value: unknown): ResearchWorkspaceDraft {
  const x = object(value, ['schemaVersion', 'direction', 'intake', 'selected', 'diagnosis', 'literature', 'updatedAt'], ['autoAdvance', 'profile', 'literatureStudy']);
  if (x.schemaVersion !== 1 || (x.autoAdvance !== undefined && typeof x.autoAdvance !== 'boolean')) fail('版本或自动继续选项无效。');
  const updatedAt = text(x.updatedAt, 50);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt))) fail('更新时间无效。');
  const parsed: ResearchWorkspaceDraft = { schemaVersion: 1, direction: text(x.direction, 1200), profile: parseExecutableTopicProfile(x.profile ?? structuredClone(EMPTY_TOPIC_PROFILE)), intake: x.intake === null ? null : intake(x.intake),
    selected: x.selected === null ? null : parseTopicProjectDocument(x.selected), diagnosis: x.diagnosis === null ? null : diagnosis(x.diagnosis),
    literature: x.literature === null ? null : parseLiteratureWorkspaceSnapshot(x.literature), autoAdvance: x.autoAdvance === undefined ? true : x.autoAdvance as boolean, updatedAt };
  const meta = { ...parsed, literature: null };
  if (new TextEncoder().encode(stableStringify(meta)).byteLength > 2 * 1024 * 1024
    || new TextEncoder().encode(stableStringify(parsed)).byteLength > MAX_RESEARCH_WORKSPACE_BYTES) fail('超过浏览器草稿大小限制。');
  if (Object.hasOwn(x, 'literatureStudy')) {
    parsed.literatureStudy = parseLiteratureStudy(x.literatureStudy);
    if (new TextEncoder().encode(stableStringify(parsed)).byteLength > MAX_RESEARCH_WORKSPACE_BYTES) fail('超过浏览器草稿大小限制。');
  }
  return structuredClone(parsed);
}
export async function verifyResearchWorkspaceDraft(value: unknown): Promise<ResearchWorkspaceDraft> {
  const draft = parseResearchWorkspaceDraft(value);
  if (draft.intake) {
    const turn = draft.intake.turn;
    const bytes = new TextEncoder().encode(stableStringify({ direction: turn.message.trim(), profile: turn.profile,
      projectId: turn.projectId ?? null, sourceVersions: turn.sourceVersions }));
    const inputHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (inputHash !== draft.intake.inputHash) fail('选题输入与指纹不一致，未恢复。');
  }
  if (draft.literature) draft.literature = await verifyLiteratureWorkspaceSnapshot(draft.literature);
  return draft;
}

let guestSession: string | null = null;
export function researchWorkspaceScope(owner: string, projectId: string | null): string {
  if (projectId !== null && (typeof projectId !== 'string' || !UUID.test(projectId))) fail('项目范围无效。');
  if (owner === 'guest') {
    if (typeof window === 'undefined') fail('访客草稿仅能在浏览器会话中使用。');
    if (!guestSession) {
      try { guestSession = window.sessionStorage.getItem('evix.research-guest.v1'); } catch { /* Per-tab memory still isolates guest drafts. */ }
      if (!guestSession || !UUID.test(guestSession)) {
        guestSession = crypto.randomUUID();
        try { window.sessionStorage.setItem('evix.research-guest.v1', guestSession); } catch { /* No account or raw corpus is written here. */ }
      }
    }
    owner = `guest:${guestSession}`;
  } else if (typeof owner !== 'string' || !UUID.test(owner)) fail('账号范围无效。');
  return JSON.stringify(['research-workspace/v1', owner, projectId]);
}
function envelope(raw: unknown, scope: string): ResearchWorkspaceRecord {
  if (raw == null) return { schema: 'research-workspace-checkpoint/v1', scope, revision: 0, draft: null };
  const value = object(raw, ['schema', 'scope', 'revision', 'draft']);
  if (value.schema !== 'research-workspace-checkpoint/v1' || value.scope !== scope) fail('存储范围或版本不一致，原记录已保留。');
  return { schema: 'research-workspace-checkpoint/v1', scope, revision: revision(value.revision),
    draft: value.draft === null ? null : parseResearchWorkspaceDraft(value.draft) };
}
function scoped(draft: ResearchWorkspaceDraft, projectId: string | null) {
  if (draft.intake && (draft.intake.turn.projectId ?? null) !== projectId) fail('选题回执属于其他项目。');
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(Error('浏览器未提供研究草稿存储；当前内容仍保留在页面中。')); return; }
    const request = indexedDB.open('evix-research-workspace-v1', 1); let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(Error('无法打开研究草稿存储，请检查浏览器空间与权限。'));
    request.onblocked = () => { blocked = true; reject(Error('研究草稿存储正在升级，请关闭其他旧版本页面后再试。')); };
  });
}
const indexedDbStorage: ResearchWorkspaceStorage = {
  async read(scope) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly'), request = tx.objectStore('drafts').get(scope);
      tx.oncomplete = () => { db.close(); resolve(request.result ?? null); };
      tx.onabort = tx.onerror = () => { db.close(); reject(Error('研究草稿未能读取；原记录已保留。')); };
    });
  },
  async commit(scope, expectedRevision, next, current) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts'), get = store.get(scope);
      let status: 'committed' | 'conflict' | 'stale' = 'stale', failure: unknown;
      get.onsuccess = () => {
        try {
          if (!current()) return;
          if (envelope(get.result, scope).revision !== expectedRevision) { status = 'conflict'; return; }
          store.put(structuredClone(next), scope); status = 'committed';
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { db.close(); resolve(status); };
      tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? Error('研究草稿未能保存；原记录没有被覆盖。')); };
    });
  },
};

export function createResearchWorkspaceStore(storage: ResearchWorkspaceStorage = indexedDbStorage) {
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(scope: string, action: () => Promise<T>): Promise<T> {
    const pending = (queues.get(scope) ?? Promise.resolve()).catch(() => {}).then(action);
    queues.set(scope, pending);
    void pending.finally(() => { if (queues.get(scope) === pending) queues.delete(scope); }).catch(() => {});
    return pending;
  }
  const current = (ticket?: ResearchWorkspaceTicket) => !ticket || ticket.isCurrent();
  return {
    read(owner: string, projectId: string | null, ticket?: ResearchWorkspaceTicket): Promise<ResearchWorkspaceCheckpoint | null> {
      const scope = researchWorkspaceScope(owner, projectId);
      return serial(scope, async () => {
        if (!current(ticket)) return null;
        const record = envelope(await storage.read(scope), scope);
        if (!current(ticket)) return null;
        const draft = record.draft ? await verifyResearchWorkspaceDraft(record.draft) : null;
        if (!current(ticket)) return null;
        if (draft) scoped(draft, projectId);
        return structuredClone({ scope, revision: record.revision, draft });
      });
    },
    write(owner: string, projectId: string | null, value: ResearchWorkspaceDraft, options: ResearchWorkspaceWriteOptions): Promise<number | null> {
      const scope = researchWorkspaceScope(owner, projectId), expected = revision(options.expectedRevision);
      // Freeze before queuing/async hash validation so later editor changes cannot alter this write.
      const frozen = parseResearchWorkspaceDraft(value); scoped(frozen, projectId);
      return serial(scope, async () => {
        if (!current(options.ticket)) return null;
        const draft = await verifyResearchWorkspaceDraft(frozen);
        if (!current(options.ticket)) return null;
        const status = await storage.commit(scope, expected, { schema: 'research-workspace-checkpoint/v1', scope, revision: expected + 1, draft }, () => current(options.ticket));
        if (status === 'conflict') throw new ResearchWorkspaceConflictError();
        return status === 'committed' ? expected + 1 : null;
      });
    },
    clear(owner: string, projectId: string | null, options: ResearchWorkspaceWriteOptions): Promise<number | null> {
      const scope = researchWorkspaceScope(owner, projectId), expected = revision(options.expectedRevision);
      return serial(scope, async () => {
        if (!current(options.ticket)) return null;
        const status = await storage.commit(scope, expected, { schema: 'research-workspace-checkpoint/v1', scope, revision: expected + 1, draft: null }, () => current(options.ticket));
        if (status === 'conflict') throw new ResearchWorkspaceConflictError();
        return status === 'committed' ? expected + 1 : null;
      });
    },
  };
}
const defaultStore = createResearchWorkspaceStore();
export const readResearchWorkspace = defaultStore.read;
export const writeResearchWorkspace = defaultStore.write;
export const clearResearchWorkspace = defaultStore.clear;
