import { clampKnowledgeWindow, emptyKnowledgeUserState } from './context.ts';
import { isKnowledgeId, isKnowledgeSourceUrl, type KnowledgeLookup, type KnowledgeUserState } from './types.ts';

export type KnowledgeEntryReferenceWire = { entryId: string; entryVersion: number };
export type KnowledgePreferencesWire = {
  mode?: 'float' | 'pinned'; x?: number; y?: number; width?: number; height?: number;
  query?: string; scrollEntryId?: string; scrollTop?: number;
};
export type KnowledgeUserStateWire = {
  revision: number; favorites: KnowledgeEntryReferenceWire[]; recent: KnowledgeEntryReferenceWire[];
  preferences: KnowledgePreferencesWire;
};
export type KnowledgeLookupWire = {
  id: string; status: KnowledgeLookup['status']; query: string; createdAt: string; finishedAt: string | null;
  results: Array<{ title: string; url: string; snippet: string }>; credits: number | null;
  errorCode: string | null; providerRequestId: string | null;
};
export type KnowledgeProjectReferencesWire = {
  revision: number; references: Array<KnowledgeEntryReferenceWire & { id: string; createdBy: string; createdAt: string }>;
};
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('知识接口返回了无效对象。');
  const result = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(result, key)) || Object.keys(result).some(key => !required.includes(key) && !optional.includes(key))) throw new Error('知识接口字段不符合约定。');
  return result;
}
function text(value: unknown, maximum: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (empty || value.length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
function date(value: unknown): value is string { return text(value, 40) && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)); }
function uuid(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value); }
function revision(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function parseEntryReference(value: unknown): KnowledgeEntryReferenceWire {
  const item = object(value, ['entryId', 'entryVersion']);
  if (!isKnowledgeId(item.entryId) || typeof item.entryVersion !== 'number' || !Number.isInteger(item.entryVersion) || item.entryVersion < 1 || item.entryVersion > 2147483647) throw new Error('知识引用版本无效。');
  return { entryId: item.entryId, entryVersion: item.entryVersion };
}
function references(value: unknown, maximum: number): KnowledgeEntryReferenceWire[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error('知识引用列表超出范围。');
  const result = value.map(parseEntryReference);
  if (new Set(result.map(item => `${item.entryId}:${item.entryVersion}`)).size !== result.length) throw new Error('知识引用列表有重复项。');
  return result;
}
export function parseKnowledgeUserState(value: unknown): KnowledgeUserStateWire {
  const root = object(value, ['revision', 'favorites', 'recent', 'preferences']);
  if (!revision(root.revision)) throw new Error('知识收藏版本无效。');
  const prefs = object(root.preferences, [], ['mode', 'x', 'y', 'width', 'height', 'query', 'scrollEntryId', 'scrollTop']);
  if (prefs.mode !== undefined && prefs.mode !== 'float' && prefs.mode !== 'pinned') throw new Error('知识窗口模式无效。');
  for (const [key, low, high] of [['x', 0, 1], ['y', 0, 1], ['width', 280, 1000], ['height', 240, 1200], ['scrollTop', 0, 1000000]] as const) {
    const number = prefs[key];
    if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number < low || number > high)) throw new Error('知识窗口尺寸无效。');
  }
  if ((prefs.query !== undefined && (!text(prefs.query, 120, true) || /[\r\n\u2028\u2029]/.test(prefs.query))) || (prefs.scrollEntryId !== undefined && !isKnowledgeId(prefs.scrollEntryId))) throw new Error('知识阅读位置无效。');
  return { revision: root.revision, favorites: references(root.favorites, 500), recent: references(root.recent, 50), preferences: prefs as KnowledgePreferencesWire };
}
export function knowledgeStateFromWire(wire: KnowledgeUserStateWire, previous = emptyKnowledgeUserState(), viewport = { width: 1440, height: 900 }): KnowledgeUserState {
  const preference = wire.preferences;
  const size = { width: preference.width ?? 400, height: preference.height ?? 560 };
  const x = (preference.x ?? previous.window.x / Math.max(1, viewport.width - size.width)) * Math.max(0, viewport.width - size.width);
  const y = (preference.y ?? previous.window.y / Math.max(1, viewport.height - size.height)) * Math.max(0, viewport.height - size.height);
  return {
    schemaVersion: 1, version: wire.revision, favorites: wire.favorites,
    recent: wire.recent.map(item => ({ ...item, ...(previous.recent.find(local => local.entryId === item.entryId && local.entryVersion === item.entryVersion)?.visitedAt ? { visitedAt: previous.recent.find(local => local.entryId === item.entryId && local.entryVersion === item.entryVersion)!.visitedAt } : {}) })),
    window: clampKnowledgeWindow({ mode: preference.mode === 'pinned' ? 'dock' : 'float', x, y }, viewport, size),
  };
}
export function knowledgeStateToWire(state: KnowledgeUserState, viewport = { width: 1440, height: 900 }, preference: KnowledgePreferencesWire = {}): Omit<KnowledgeUserStateWire, 'revision'> {
  const width = preference.width ?? 400, height = preference.height ?? 560;
  const point = clampKnowledgeWindow(state.window, viewport, { width, height });
  const content = {
    favorites: state.favorites.map(({ entryId, entryVersion }) => ({ entryId, entryVersion })),
    recent: state.recent.map(({ entryId, entryVersion }) => ({ entryId, entryVersion })),
    preferences: { ...preference, mode: state.window.mode === 'dock' ? 'pinned' as const : 'float' as const,
      x: Math.max(0, Math.min(1, point.x / Math.max(1, viewport.width - width))), y: Math.max(0, Math.min(1, point.y / Math.max(1, viewport.height - height))), width, height },
  };
  const checked = parseKnowledgeUserState({ revision: state.version, ...content });
  return { favorites: checked.favorites, recent: checked.recent, preferences: checked.preferences };
}
export function parseKnowledgeLookup(value: unknown): KnowledgeLookupWire {
  const item = object(value, ['id', 'status', 'query', 'createdAt', 'finishedAt', 'results', 'credits', 'errorCode', 'providerRequestId']);
  if (!uuid(item.id) || !['queued', 'running', 'ready', 'failed', 'outcome_unknown'].includes(item.status as string) || !text(item.query, 120) || !date(item.createdAt) || (item.finishedAt !== null && !date(item.finishedAt)) || !Array.isArray(item.results) || item.results.length > 5) throw new Error('联网查证回执无效。');
  if (item.credits !== null && (typeof item.credits !== 'number' || !Number.isInteger(item.credits) || item.credits < 0 || item.credits > 1000)) throw new Error('联网查证用量无效。');
  if (item.status === 'ready' && item.credits === null) throw new Error('尚未核实用量的调用不能标记为完成。');
  if ((item.errorCode !== null && (!text(item.errorCode, 64) || !/^[a-z0-9_]+$/.test(item.errorCode))) || (item.providerRequestId !== null && (!text(item.providerRequestId, 120) || !/^[A-Za-z0-9._:-]+$/.test(item.providerRequestId)))) throw new Error('联网查证服务回执无效。');
  for (const result of item.results) {
    const record = object(result, ['title', 'url', 'snippet']);
    const validUrl = typeof record.url === 'string' && (isKnowledgeSourceUrl(record.url) || (() => { try { const url = new URL(record.url as string); return url.protocol === 'http:' && !!url.hostname && !url.username && !url.password; } catch { return false; } })());
    if (!text(record.title, 240, true) || !text(record.snippet, 2000, true) || !validUrl || (record.url as string).length > 2048) throw new Error('联网查证来源内容无效。');
  }
  return item as unknown as KnowledgeLookupWire;
}
export function knowledgeLookupFromWire(wire: KnowledgeLookupWire): KnowledgeLookup {
  return { id: wire.id, status: wire.status, query: wire.query, requestedAt: wire.createdAt,
    ...(wire.finishedAt ? { retrievedAt: wire.finishedAt } : {}), ...(wire.providerRequestId ? { providerRequestId: wire.providerRequestId } : {}),
    ...(wire.credits !== null ? { creditsUsed: wire.credits } : {}), ...(wire.errorCode ? { error: { code: wire.errorCode, message: wire.errorCode } } : {}), results: wire.results };
}
export function parseKnowledgeProjectReferences(value: unknown): KnowledgeProjectReferencesWire {
  const root = object(value, ['revision', 'references']);
  if (!revision(root.revision) || !Array.isArray(root.references) || root.references.length > 1000) throw new Error('项目术语表回执无效。');
  const parsed = root.references.map(value => {
    const item = object(value, ['id', 'entryId', 'entryVersion', 'createdBy', 'createdAt']);
    if (!uuid(item.id) || !uuid(item.createdBy) || !date(item.createdAt)) throw new Error('项目术语引用身份无效。');
    return { ...parseEntryReference({ entryId: item.entryId, entryVersion: item.entryVersion }), id: item.id, createdBy: item.createdBy, createdAt: item.createdAt };
  });
  if (new Set(parsed.map(item => item.id)).size !== parsed.length) throw new Error('项目术语引用重复。');
  return { revision: root.revision, references: parsed };
}
