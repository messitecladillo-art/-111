import { createKnowledgeSearch, type KnowledgeSearch } from './search.ts';
import type { KnowledgeWorkerRequest, KnowledgeWorkerResponse } from './worker-client.ts';

let index: KnowledgeSearch | null = null;
const scope = globalThis as unknown as {
  addEventListener(type: 'message', callback: (event: MessageEvent<KnowledgeWorkerRequest>) => void): void;
  postMessage(message: KnowledgeWorkerResponse): void;
};
scope.addEventListener('message', event => {
  const request = event.data;
  try {
    if (request.kind === 'initialize') {
      index = createKnowledgeSearch(request.entries);
      scope.postMessage({ kind: 'initialized' });
      return;
    }
    if (!index) throw new Error('知识索引尚未就绪。');
    scope.postMessage({ kind: 'result', id: request.id, hits: index[request.kind](request.text, request.options) });
  } catch (error) {
    scope.postMessage({ kind: 'error', ...('id' in request ? { id: request.id } : {}), message: error instanceof Error ? error.message : '知识查询失败。' });
  }
});
