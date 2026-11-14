/** Unreceipted model gateways are available only in an explicitly local dev server. */
export function localGatewayAllowed(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'development' || env.EVIX_ENABLE_LOCAL_MODEL_GATEWAY !== '1') return false;
  try {
    const configured = new URL(env.EVIX_LOCAL_MODEL_GATEWAY_ORIGIN ?? '');
    if (configured.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(configured.hostname)
      || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash) return false;
    const incoming = new URL(request.url);
    const origin = request.headers.get('origin');
    const sameOriginRead = request.method === 'GET' && !origin
      && request.headers.get('sec-fetch-site') === 'same-origin'
      && new URL(request.headers.get('referer') ?? '').origin === configured.origin;
    return incoming.origin === configured.origin
      && (origin === configured.origin || sameOriginRead)
      && request.headers.get('host') === configured.host
      && (!request.headers.has('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin');
  } catch {
    return false;
  }
}

/** Read once with a byte limit; neither callers nor provider responses are trusted. */
export async function boundedGatewayJson(message: Request | Response, limit: number): Promise<unknown> {
  const reader = message.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('payload_too_large');
      chunks.push(value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
