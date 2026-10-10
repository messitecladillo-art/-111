// Finite synthetic payload, deliberately no EOF until cleanup. This detects a
// handler that drains the entire request before responding to an over-limit body.
export function heldOpenUpload(maxBytes, deadlineMs = 5_000) {
  const abort = new AbortController();
  let controller, cancelled = false, eofReleased = false;
  const bytes = new TextEncoder().encode('{"x":"' + 'x'.repeat(maxBytes) + '"}');
  const body = new ReadableStream({
    start(value) {
      controller = value;
      controller.enqueue(bytes.subarray(0, maxBytes));
      controller.enqueue(bytes.subarray(maxBytes));
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const timer = setTimeout(() => abort.abort(new Error('synthetic upload deadline')), deadlineMs);
  return {
    body, signal: abort.signal, bytes: bytes.byteLength,
    get eofReleased() { return eofReleased; },
    cleanup() {
      clearTimeout(timer);
      abort.abort();
      if (!cancelled && !eofReleased) {
        eofReleased = true;
        try { controller.close(); } catch { /* already cancelled/errored */ }
      }
    },
  };
}
