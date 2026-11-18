import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type UndiciModule = {
  ProxyAgent: new (uri: string) => unknown;
  fetch: (url: string, init?: RequestInit & { dispatcher?: unknown }) => Promise<Response>;
};

let cachedProxyUrl: { value: string; expiresAt: number } | null = null;
const proxyAgentCache = new Map<string, unknown>();

function loadUndici(): UndiciModule | null {
  try {
    const req = createRequire(import.meta.url);
    return req('undici') as UndiciModule;
  } catch {
    return null;
  }
}

function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Windows ProxyServer can take "http=127.0.0.1:7897;https=127.0.0.1:7897" or "127.0.0.1:7897"
  if (trimmed.includes('=')) {
    const parts = trimmed.split(';').map(s => s.trim());
    const httpsPart = parts.find(p => p.toLowerCase().startsWith('https='));
    const httpPart = parts.find(p => p.toLowerCase().startsWith('http='));
    const chosen = (httpsPart ?? httpPart ?? parts[0] ?? '').replace(/^[^=]+=/u, '').trim();
    if (!chosen) return '';
    return /^https?:\/\//iu.test(chosen) ? chosen : `http://${chosen}`;
  }
  return /^https?:\/\//iu.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/**
 * Resolves explicit env proxy vars or Windows Internet Settings local proxy (cached 60s).
 * Returns '' if no proxy is enabled.
 */
async function resolveLocalProxyUrl(): Promise<string> {
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    '';
  if (envProxy.trim()) return normalizeProxyUrl(envProxy);

  if (process.platform !== 'win32') return '';

  const now = Date.now();
  if (cachedProxyUrl && cachedProxyUrl.expiresAt > now) return cachedProxyUrl.value;

  let resolved = '';
  try {
    const { stdout } = await execFileAsync(
      'reg.exe',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
      { timeout: 1500, windowsHide: true },
    );
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1\b/iu.test(stdout);
    const serverMatch = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/iu.exec(stdout);
    if (enabled && serverMatch?.[1]) {
      resolved = normalizeProxyUrl(serverMatch[1]);
    }
  } catch {
    resolved = '';
  }

  cachedProxyUrl = { value: resolved, expiresAt: now + 60_000 };
  return resolved;
}

function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = `${err.message} ${String((err as { cause?: { code?: string; message?: string } }).cause?.code ?? '')} ${String((err as { cause?: { message?: string } }).cause?.message ?? '')}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|UND_ERR_|socket|TLS|network/iu.test(msg);
}

/**
 * Resilient server-side fetch for external AI/visual APIs.
 * Retries transient TLS/socket resets and alternates cleanly with the user's configured
 * local proxy (env or Windows Internet Settings) when direct sockets drop.
 */
export async function upstreamFetch(
  url: string,
  init: RequestInit,
  options?: { attempts?: number; timeoutMs?: number; preferProxy?: boolean },
): Promise<Response> {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const timeoutMs = options?.timeoutMs ?? 40_000;
  const proxyUrl = await resolveLocalProxyUrl();
  const undiciMod = proxyUrl ? loadUndici() : null;

  const getProxyAgent = () => {
    if (!proxyUrl || !undiciMod) return null;
    if (!proxyAgentCache.has(proxyUrl)) {
      proxyAgentCache.set(proxyUrl, new undiciMod.ProxyAgent(proxyUrl));
    }
    return proxyAgentCache.get(proxyUrl) ?? null;
  };

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (init.signal?.aborted) {
      throw new Error('Request aborted');
    }
    const useProxy = Boolean(proxyUrl && undiciMod && (options?.preferProxy ? i % 2 === 0 : i > 0));
    const signal = init.signal ?? AbortSignal.timeout(timeoutMs);

    try {
      if (useProxy && undiciMod) {
        const agent = getProxyAgent();
        if (agent) {
          return await undiciMod.fetch(url, { ...init, signal, dispatcher: agent });
        }
      }
      return await fetch(url, { ...init, signal });
    } catch (err) {
      lastErr = err;
      if (init.signal?.aborted || !isTransientNetworkError(err) || i === attempts - 1) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 420 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Upstream fetch failed');
}
