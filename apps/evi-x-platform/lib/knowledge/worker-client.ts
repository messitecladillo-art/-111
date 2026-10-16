import { createKnowledgeSearch, type KnowledgeSearch } from './search.ts';
import type { KnowledgeEntry, KnowledgeSearchHit, KnowledgeSearchOptions } from './types.ts';

export type KnowledgeWorkerRequest =
  | { kind: 'initialize'; entries: KnowledgeEntry[] }
  | { kind: 'search' | 'recognize'; id: number; text: string; options: KnowledgeSearchOptions };
export type KnowledgeWorkerResponse =
  | { kind: 'initialized' }
  | { kind: 'result'; id: number; hits: KnowledgeSearchHit[] }
  | { kind: 'error'; id?: number; message: string };
type WorkerHandle = {
  postMessage(message: KnowledgeWorkerRequest): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<KnowledgeWorkerResponse>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
};
type ClientOptions = { workerFactory?: () => WorkerHandle; timeoutMs?: number };
export type KnowledgeSearchClient = {
  readonly ready: Promise<void>; readonly mode: 'worker' | 'fallback';
  search(query: string, options?: KnowledgeSearchOptions & { signal?: AbortSignal }): Promise<KnowledgeSearchHit[]>;
  recognize(text: string, options?: KnowledgeSearchOptions & { signal?: AbortSignal }): Promise<KnowledgeSearchHit[]>;
  dispose(): void;
};
const aborted = () => new DOMException('查询已取消或被更新的查询替代。', 'AbortError');
/** One worker per knowledge host; requests fence stale results per operation. */
export function createKnowledgeSearchClient(entries: readonly KnowledgeEntry[], config: ClientOptions = {}): KnowledgeSearchClient {
  let worker: WorkerHandle | null = null, fallback: KnowledgeSearch | null = null, disposed = false, sequence = 0;
  let mode: 'worker' | 'fallback' = 'worker';
  const latest = { search: 0, recognize: 0 };
  const pending = new Map<number, { kind: 'search' | 'recognize'; resolve: (hits: KnowledgeSearchHit[]) => void; reject: (error: Error) => void; cleanup: () => void }>();
  let completeReady: () => void = () => {};
  const ready = new Promise<void>(resolve => { completeReady = resolve; });
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  const ensureFallback = () => {
    mode = 'fallback';
    worker?.terminate(); worker = null;
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = null;
    completeReady();
  };
  const rejectPending = (error: Error) => {
    for (const request of pending.values()) { request.cleanup(); request.reject(error); }
    pending.clear();
  };
  try {
    worker = config.workerFactory ? config.workerFactory() : typeof Worker === 'undefined' ? null : new Worker(new URL('./knowledge.worker.ts', import.meta.url), { type: 'module', name: 'evix-knowledge-search' });
    if (!worker) ensureFallback();
    else {
      worker.addEventListener('message', event => {
        if (disposed) return;
        const message = event.data;
        if (message.kind === 'initialized') { if (readyTimer) clearTimeout(readyTimer); readyTimer = null; completeReady(); return; }
        if (message.kind === 'error' && message.id === undefined) { ensureFallback(); rejectPending(new Error(message.message)); return; }
        if (!('id' in message) || message.id === undefined) return;
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id); request.cleanup();
        if (message.id !== latest[request.kind]) { request.reject(aborted()); return; }
        if (message.kind === 'result') request.resolve(message.hits);
        else if (message.kind === 'error') request.reject(new Error(message.message));
      });
      worker.addEventListener('error', () => { if (disposed) return; ensureFallback(); rejectPending(new Error('知识搜索处理器加载失败，请重试查询。')); });
      readyTimer = setTimeout(() => ensureFallback(), config.timeoutMs ?? 10000);
      worker.postMessage({ kind: 'initialize', entries: [...entries] });
    }
  } catch { ensureFallback(); }

  async function request(kind: 'search' | 'recognize', text: string, options: KnowledgeSearchOptions & { signal?: AbortSignal } = {}): Promise<KnowledgeSearchHit[]> {
    if (disposed || options.signal?.aborted) throw aborted();
    const id = ++sequence;
    latest[kind] = id;
    for (const [oldId, old] of pending) if (old.kind === kind) { pending.delete(oldId); old.cleanup(); old.reject(aborted()); }
    await ready;
    if (disposed || id !== latest[kind] || options.signal?.aborted) throw aborted();
    const { signal, ...searchOptions } = options;
    if (!worker) {
      fallback ??= createKnowledgeSearch(entries);
      const hits = fallback[kind](text, searchOptions);
      if (disposed || id !== latest[kind] || signal?.aborted) throw aborted();
      return hits;
    }
    return new Promise<KnowledgeSearchHit[]>((resolve, reject) => {
      const onAbort = () => { const item = pending.get(id); if (!item) return; pending.delete(id); item.cleanup(); reject(aborted()); };
      const timer = setTimeout(() => { const item = pending.get(id); if (!item) return; pending.delete(id); item.cleanup(); ensureFallback(); rejectPending(new Error('知识搜索处理器已重启，请重试查询。')); reject(new Error('知识查询超时，请重试。')); }, config.timeoutMs ?? 10000);
      pending.set(id, { kind, resolve, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); } });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      try { worker!.postMessage({ kind, id, text: text.slice(0, kind === 'recognize' ? 12000 : 300), options: searchOptions }); }
      catch { const item = pending.get(id); pending.delete(id); item?.cleanup(); ensureFallback(); reject(new Error('知识查询未能送达，请重试。')); }
    });
  }
  return {
    ready, get mode() { return mode; },
    search: (query, options) => request('search', query, options), recognize: (text, options) => request('recognize', text, options),
    dispose() { if (disposed) return; disposed = true; if (readyTimer) clearTimeout(readyTimer); worker?.terminate(); worker = null; completeReady(); rejectPending(aborted()); },
  };
}
