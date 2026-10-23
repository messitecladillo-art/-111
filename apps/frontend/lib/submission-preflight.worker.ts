import { inspectSubmissionLocal, type PreflightWorkerRequest, type PreflightWorkerResponse } from "./submission-preflight.ts";

export function createPreflightWorkerHandler(post: (message: PreflightWorkerResponse) => void) {
  let busy = false;
  return async (input: unknown): Promise<void> => {
    if (!input || typeof input !== "object" || !("id" in input) || typeof input.id !== "string" || !input.id || input.id.length > 128) return;
    const id = input.id;
    if (busy) { post({ id, error: "当前文件仍在检查，请稍后重试。" }); return; }
    if (!("buffer" in input) || !(input.buffer instanceof ArrayBuffer) || !("name" in input) || typeof input.name !== "string" || !("terms" in input) || !Array.isArray(input.terms)) { post({ id, error: "检查请求不完整，请重新选择文件。" }); return; }
    busy = true;
    try {
      const request = input as PreflightWorkerRequest;
      const result = await inspectSubmissionLocal(request.buffer, request.name, request.terms, phase => post({ id, phase }));
      post({ id, result });
    } catch (error) { post({ id, error: error instanceof Error ? error.message : "文件检查失败，请重新导出后重试。" }); }
    finally { busy = false; }
  };
}
type WorkerScope = { onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage: (message: PreflightWorkerResponse) => void };
const scope = globalThis as unknown as WorkerScope;
if (typeof scope.postMessage === "function" && typeof document === "undefined") {
  const handle = createPreflightWorkerHandler(message => scope.postMessage(message));
  scope.onmessage = event => { void handle(event.data); };
}
