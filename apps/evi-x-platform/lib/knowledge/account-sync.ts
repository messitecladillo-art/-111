import { parseKnowledgeUserState, type KnowledgeEntryReferenceWire, type KnowledgePreferencesWire, type KnowledgeUserStateWire } from './api-contracts.ts';
import type { KnowledgeEntry } from './types.ts';

export type KnowledgeAccountStatus = 'guest' | 'loading' | 'ready' | 'saving' | 'unknown' | 'conflict' | 'error';
export type KnowledgeAccountSnapshot = {
  accountId: string | null; state: KnowledgeUserStateWire; serverRevision: number;
  status: KnowledgeAccountStatus; notice: string; dirty: boolean;
};
export type KnowledgeStateWrite = {
  expectedRevision: number; idempotencyKey: string; state: Omit<KnowledgeUserStateWire, 'revision'>;
};
type PendingWrite = { payload: KnowledgeStateWrite; editSequence: number };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type SyncOptions = {
  read: (signal: AbortSignal) => Promise<unknown>;
  write: (payload: KnowledgeStateWrite, signal: AbortSignal) => Promise<unknown>;
  createId?: () => string; storage?: Storage | null; debounceMs?: number;
};
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function emptyKnowledgeAccount(accountId: string | null = null): KnowledgeAccountSnapshot {
  return { accountId, state: { revision: 0, favorites: [], recent: [], preferences: {} }, serverRevision: 0, status: accountId ? 'loading' : 'guest', notice: '', dirty: false };
}
const contentOf = (state: KnowledgeUserStateWire) => ({ favorites: state.favorites, recent: state.recent, preferences: state.preferences });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
const sameContent = (a: KnowledgeUserStateWire, b: KnowledgeUserStateWire) => canonical(contentOf(a)) === canonical(contentOf(b));
export function knowledgeAccountCacheKey(accountId: string): string { return `evix.knowledge.sync.v1:${encodeURIComponent(accountId)}`; }
function pendingFrom(value: unknown): PendingWrite | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as PendingWrite;
  if (!item.payload || !uuid(item.payload.idempotencyKey) || !Number.isInteger(item.payload.expectedRevision) || item.payload.expectedRevision < 0 || !Number.isInteger(item.editSequence) || item.editSequence < 0) return null;
  const state = parseKnowledgeUserState({ revision: item.payload.expectedRevision, ...item.payload.state });
  return { payload: { expectedRevision: item.payload.expectedRevision, idempotencyKey: item.payload.idempotencyKey, state: contentOf(state) }, editSequence: item.editSequence };
}
export function restoreKnowledgeAccountDraft(serialized: string | null, accountId: string): { state: KnowledgeUserStateWire; pending: PendingWrite | null } | null {
  if (!serialized || serialized.length > 100000) return null;
  try {
    const root = JSON.parse(serialized);
    if (root.schemaVersion !== 1 || root.accountId !== accountId || Object.keys(root).some(key => !['schemaVersion', 'accountId', 'state', 'pending'].includes(key))) return null;
    const state = parseKnowledgeUserState(root.state);
    const pending = root.pending === null ? null : pendingFrom(root.pending);
    if (root.pending !== null && !pending) return null;
    return { state, pending };
  } catch { return null; }
}
/** Serializable reducer/controller: receipts never overwrite edits made during the request. */
export function createKnowledgeAccountSync(options: SyncOptions) {
  let snapshot = emptyKnowledgeAccount(), server = snapshot.state, editSequence = 0, epoch = 0, disposed = false;
  let pending: PendingWrite | null = null, timer: ReturnType<typeof setTimeout> | null = null, active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  const emit = (patch: Partial<KnowledgeAccountSnapshot>) => { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(); };
  const persist = () => {
    if (!snapshot.accountId || !options.storage) return;
    try {
      const key = knowledgeAccountCacheKey(snapshot.accountId);
      if (!snapshot.dirty && !pending) options.storage.removeItem(key);
      else options.storage.setItem(key, JSON.stringify({ schemaVersion: 1, accountId: snapshot.accountId, state: snapshot.state, pending }));
    } catch { /* Storage is optional; the mounted draft remains available. */ }
  };
  const current = (token: number, accountId: string | null) => !disposed && token === epoch && accountId === snapshot.accountId;
  function schedule() {
    clearTimer();
    if (!snapshot.accountId || !snapshot.dirty || pending || snapshot.status !== 'ready') return;
    timer = setTimeout(() => { timer = null; void save(); }, options.debounceMs ?? 800);
  }
  function applyReceipt(receipt: KnowledgeUserStateWire, operation: PendingWrite) {
    server = receipt; pending = null;
    const state = editSequence === operation.editSequence ? receipt : { ...snapshot.state, revision: receipt.revision };
    const dirty = !sameContent(state, receipt);
    emit({ state, serverRevision: receipt.revision, status: 'ready', notice: dirty ? '' : '已同步', dirty });
    persist(); schedule();
  }
  async function submit(operation: PendingWrite, verifyLatest = false) {
    const token = epoch, accountId = snapshot.accountId;
    if (!accountId || disposed) return;
    const controller = new AbortController(); active = controller;
    emit({ status: 'saving', notice: '正在同步…' });
    try {
      const receipt = parseKnowledgeUserState(await options.write(operation.payload, controller.signal));
      if (!current(token, accountId)) return;
      if (receipt.revision !== operation.payload.expectedRevision + 1 || !sameContent(receipt, { revision: receipt.revision, ...operation.payload.state })) throw new Error('保存回执与本次内容不一致。');
      if (verifyLatest) {
        const latest = parseKnowledgeUserState(await options.read(controller.signal));
        if (!current(token, accountId)) return;
        if (latest.revision > receipt.revision && !sameContent(latest, snapshot.state)) {
          server = latest; pending = null;
          emit({ state: { ...snapshot.state, revision: latest.revision }, serverRevision: latest.revision, status: 'conflict', notice: '本次保存已核实，云端之后又有更新；当前修改已保留。', dirty: true }); persist(); return;
        }
        if (latest.revision > receipt.revision) { applyReceipt(latest, operation); return; }
      }
      applyReceipt(receipt, operation);
    } catch (error) {
      if (!current(token, accountId)) return;
      const code = (error as { code?: unknown })?.code, status = (error as { status?: unknown })?.status;
      if (status === 409 || code === 'version_conflict' || code === 'idempotency_conflict') {
        pending = null;
        emit({ status: 'conflict', notice: '收藏或阅读设置已有更新，当前修改已保留。', dirty: true });
      } else if (typeof status === 'number' && status >= 400 && status < 500) {
        pending = null;
        emit({ status: 'error', notice: error instanceof Error ? error.message : '同步未完成，请重新载入。', dirty: true });
      } else {
        emit({ status: 'unknown', notice: '同步回执未到达，点击核对本次保存。', dirty: true });
      }
      persist();
    } finally { if (active === controller) active = null; }
  }
  async function save() {
    if (disposed || !snapshot.accountId || !snapshot.dirty || snapshot.status !== 'ready' || pending) return;
    const id = options.createId?.() ?? crypto.randomUUID();
    if (!uuid(id)) throw new Error('无法创建有效的保存标识。');
    pending = { payload: { expectedRevision: snapshot.serverRevision, idempotencyKey: id, state: structuredClone(contentOf(snapshot.state)) }, editSequence };
    persist(); await submit(pending);
  }
  async function load(discard: boolean) {
    if (!snapshot.accountId || disposed) return;
    clearTimer();
    if (pending && !discard) { await reconcile(); return; }
    const token = ++epoch, accountId = snapshot.accountId;
    active?.abort(); const controller = new AbortController(); active = controller;
    const wasDirty = snapshot.dirty;
    if (discard) { pending = null; editSequence++; }
    const loadingSequence = editSequence;
    emit({ status: 'loading', notice: '' });
    try {
      const receipt = parseKnowledgeUserState(await options.read(controller.signal));
      if (!current(token, accountId)) return;
      server = receipt;
      if (((wasDirty && !discard) || editSequence !== loadingSequence) && !sameContent(snapshot.state, receipt)) {
        emit({ serverRevision: receipt.revision, status: 'conflict', notice: '已有其他版本，当前修改已保留。', dirty: true });
      } else {
        emit({ state: receipt, serverRevision: receipt.revision, status: 'ready', notice: '', dirty: false });
      }
      persist();
    } catch (error) {
      if (current(token, accountId)) emit({ status: 'error', notice: error instanceof Error ? error.message : '收藏读取未完成，请重试。' });
    } finally { if (active === controller) active = null; }
  }
  async function reconcile() {
    if (!pending || disposed || !snapshot.accountId || snapshot.status === 'saving') return;
    // Explicit reconciliation reuses the frozen request and key, never a new save intent.
    await submit(pending, true);
  }
  function edit(updater: (state: KnowledgeUserStateWire) => KnowledgeUserStateWire) {
    if (disposed) return;
    const state = parseKnowledgeUserState(updater(snapshot.state));
    if (sameContent(state, snapshot.state)) return;
    editSequence++;
    const dirty = !sameContent(state, server);
    emit({ state, dirty, notice: snapshot.status === 'ready' || snapshot.status === 'guest' ? '' : snapshot.notice });
    persist(); schedule();
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    async setIdentity(accountId: string | null) {
      clearTimer(); active?.abort(); active = null; epoch++; pending = null; editSequence = 0;
      server = emptyKnowledgeAccount(accountId).state;
      emit(emptyKnowledgeAccount(accountId));
      if (!accountId) return;
      let cached = null;
      try { cached = restoreKnowledgeAccountDraft(options.storage?.getItem(knowledgeAccountCacheKey(accountId)) ?? null, accountId); } catch { /* Optional cache. */ }
      if (cached) {
        server = { revision: cached.state.revision, favorites: [], recent: [], preferences: {} };
        pending = cached.pending;
        if (pending) { editSequence = sameContent(cached.state, { revision: cached.state.revision, ...pending.payload.state }) ? 0 : 1; pending.editSequence = 0; emit({ state: cached.state, serverRevision: cached.state.revision, dirty: true, status: 'unknown', notice: '有待核对的保存记录。' }); return; }
        emit({ state: cached.state, dirty: true });
      }
      await load(false);
    },
    setFavorite(entry: Pick<KnowledgeEntry, 'id' | 'version'>, enabled?: boolean) {
      edit(state => {
        const exists = state.favorites.some(item => item.entryId === entry.id && item.entryVersion === entry.version);
        const next = enabled ?? !exists;
        if (exists === next) return state;
        const favorites = state.favorites.filter(item => item.entryId !== entry.id || item.entryVersion !== entry.version);
        if (next) favorites.push({ entryId: entry.id, entryVersion: entry.version });
        return { ...state, favorites };
      });
    },
    recordVisit(entry: Pick<KnowledgeEntry, 'id' | 'version'>) {
      edit(state => ({ ...state, recent: [{ entryId: entry.id, entryVersion: entry.version }, ...state.recent.filter(item => item.entryId !== entry.id || item.entryVersion !== entry.version)].slice(0, 50) }));
    },
    updatePrefs(patch: KnowledgePreferencesWire) { edit(state => ({ ...state, preferences: { ...state.preferences, ...patch } })); },
    reload: () => load(false), reconcile,
    discardLocalAndReload: () => load(true),
    dispose(clearAccountCache = false) {
      if (disposed) return;
      clearTimer(); persist(); active?.abort(); active = null; epoch++; disposed = true;
      if (clearAccountCache && snapshot.accountId) { try { options.storage?.removeItem(knowledgeAccountCacheKey(snapshot.accountId)); } catch { /* Optional cache. */ } }
      listeners.clear();
    },
  };
}

export type StoredKnowledgeLookup = { schemaVersion: 1; accountId: string; idempotencyKey: string; query: string; receiptId?: string; status?: 'running' | 'ready' | 'failed' | 'outcome_unknown' };
export function confirmedKnowledgeQuery(value: string): string {
  const query = value.normalize('NFKC').trim();
  if (!query || query.length > 120 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(query)) throw new Error('请输入 1—120 字的单行检索词。');
  return query;
}
export function parseStoredKnowledgeLookup(serialized: string | null, accountId: string): StoredKnowledgeLookup | null {
  if (!serialized || serialized.length > 2000) return null;
  try {
    const value = JSON.parse(serialized);
    if (value.schemaVersion !== 1 || value.accountId !== accountId || !uuid(value.idempotencyKey) || (value.receiptId !== undefined && !uuid(value.receiptId)) || (value.status !== undefined && !['running', 'ready', 'failed', 'outcome_unknown'].includes(value.status)) || Object.keys(value).some(key => !['schemaVersion', 'accountId', 'idempotencyKey', 'query', 'receiptId', 'status'].includes(key)) || confirmedKnowledgeQuery(value.query) !== value.query) return null;
    return value;
  } catch { return null; }
}
export function isFavoriteReference(favorites: readonly KnowledgeEntryReferenceWire[], entry: Pick<KnowledgeEntry, 'id' | 'version'>): boolean { return favorites.some(item => item.entryId === entry.id && item.entryVersion === entry.version); }

/** A conflicting idempotency key may already identify a billable operation. */
export function isKnownLookupRejection(status: number, code: string, hasReceipt = false): boolean {
  if (hasReceipt || status === 409 || code === 'idempotency_conflict') return false;
  return (status >= 400 && status < 500) || code === 'knowledge_lookup_unconfigured';
}
