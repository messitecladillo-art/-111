import { loadSpreadsheet, SpreadsheetImportError, type SpreadsheetSession, type SpreadsheetWorkerRequest, type SpreadsheetWorkerResponse } from "../lib/spreadsheet-import.ts";

/** A generation owns its file. A late open can never replace a newer file or a disposed session. */
export function createSpreadsheetWorkerHandler(post: (message: SpreadsheetWorkerResponse) => void) {
  let session: SpreadsheetSession | null = null, generation = 0;
  return async (input: unknown): Promise<void> => {
    const request = input as Partial<SpreadsheetWorkerRequest> | null;
    const requestId = typeof request?.requestId === "string" ? request.requestId : "";
    if (!request || !requestId || requestId.length > 120 || !["open", "select", "dispose"].includes(String(request.type))) {
      post({ type: "error", requestId, error: { code: "INVALID_REQUEST", message: "工作簿读取请求不合法。" } }); return;
    }
    let ownedGeneration = generation;
    try {
      if (request.type === "dispose") { generation++; session = null; post({ type: "disposed", requestId }); return; }
      if (request.type === "open") {
        ownedGeneration = ++generation; session = null;
        if (!(request.buffer instanceof ArrayBuffer)) throw new SpreadsheetImportError("FILE_INVALID", "工作簿读取参数不合法。");
        const loaded = await loadSpreadsheet(request.buffer, phase => { if (ownedGeneration === generation) post({ type: "progress", requestId, phase }); });
        if (ownedGeneration !== generation) return;
        session = loaded; post({ type: "opened", requestId, inspection: session.inspect() }); return;
      }
      if (!session) throw new SpreadsheetImportError("NOT_READY", "请先读取工作簿。");
      if (request.type !== "select") throw new SpreadsheetImportError("INVALID_REQUEST", "工作簿读取请求不合法。");
      const result = session.select(request.selection!); post({ type: "selected", requestId, result });
    } catch (error) {
      if (ownedGeneration !== generation) return;
      const normalized = error instanceof SpreadsheetImportError ? { code: error.code, message: error.message, details: error.details } : { code: "READ_FAILED", message: "工作簿读取失败，请检查文件后重试。" };
      post({ type: "error", requestId, error: normalized });
    }
  };
}

type WorkerScope = { onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage: (message: SpreadsheetWorkerResponse) => void };
const scope = globalThis as unknown as WorkerScope;
if (typeof scope.postMessage === "function" && typeof document === "undefined") {
  const handle = createSpreadsheetWorkerHandler(message => scope.postMessage(message));
  scope.onmessage = event => { void handle(event.data); };
}
