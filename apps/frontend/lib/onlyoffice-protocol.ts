import { env } from "cloudflare:workers";
import { ApiError, isRecord } from "../app/api/_lib/http";

export const NATIVE_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const NATIVE_MAX_ACTIVE_SESSIONS = 20;
export const NATIVE_MAX_LIFETIME_SESSIONS = 1024;
export const NATIVE_KEY = /^ne_[A-Za-z0-9_-]{43}$/;

type NativeBindings = {
  EVI_X_ONLYOFFICE_BROWSER_ORIGIN?: string;
  EVI_X_ONLYOFFICE_DOWNLOAD_ORIGIN?: string;
  EVI_X_ONLYOFFICE_APP_ORIGIN?: string;
  EVI_X_ONLYOFFICE_BROWSER_APP_ORIGIN?: string;
  EVI_X_ONLYOFFICE_SHELL_ORIGIN?: string;
  EVI_X_ONLYOFFICE_JWT_SECRET?: string;
  EVI_X_ONLYOFFICE_LOCAL_DEV?: string;
};
export type OnlyOfficeSettings = {
  browserOrigin: string;
  downloadOrigin: string;
  appOrigin: string;
  browserAppOrigin: string;
  shellOrigin: string;
  shellUrl: string;
  secret: string;
  scriptUrl: string;
};

function loopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "127.0.0.2" || host === "[::1]" || /^(?:[a-z0-9-]+\.)+localhost$/.test(host);
}
function origin(raw: unknown, localDev: boolean): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 255 || raw.trim() !== raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
    if (parsed.protocol !== "https:" && !(localDev && parsed.protocol === "http:" && (loopback(parsed.hostname) || parsed.hostname === "host.docker.internal"))) return null;
    if (parsed.hostname === "0.0.0.0") return null;
    const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
    return normalized === parsed.origin ? parsed.origin : null;
  } catch { return null; }
}
export function onlyOfficeSettings(request: Request): OnlyOfficeSettings | null {
  const bindings = env as unknown as NativeBindings;
  const localDev = bindings.EVI_X_ONLYOFFICE_LOCAL_DEV === "1";
  const browserOrigin = origin(bindings.EVI_X_ONLYOFFICE_BROWSER_ORIGIN, localDev);
  const downloadOrigin = origin(bindings.EVI_X_ONLYOFFICE_DOWNLOAD_ORIGIN, localDev);
  const appOrigin = origin(bindings.EVI_X_ONLYOFFICE_APP_ORIGIN, localDev);
  const browserAppOrigin = origin(bindings.EVI_X_ONLYOFFICE_BROWSER_APP_ORIGIN ?? bindings.EVI_X_ONLYOFFICE_APP_ORIGIN, localDev);
  const shellOrigin = origin(bindings.EVI_X_ONLYOFFICE_SHELL_ORIGIN, localDev);
  const secret = bindings.EVI_X_ONLYOFFICE_JWT_SECRET;
  if (!browserOrigin || !downloadOrigin || !appOrigin || !browserAppOrigin || !shellOrigin || typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32 || secret.length > 4096) return null;
  if (browserAppOrigin.startsWith("https:") && !browserOrigin.startsWith("https:")) return null;
  if (browserAppOrigin.startsWith("https:") && !shellOrigin.startsWith("https:")) return null;
  if ([browserAppOrigin, appOrigin].includes(browserOrigin) || [browserAppOrigin, appOrigin].includes(downloadOrigin)) return null;
  if ([browserAppOrigin, appOrigin, browserOrigin, downloadOrigin].includes(shellOrigin)) return null;
  // Cookies are scoped by hostname, not port. An iframe or Docs service on a
  // different port of the app host would still receive host-only app cookies.
  const browserAppHost = new URL(browserAppOrigin).hostname;
  const appServiceHost = new URL(appOrigin).hostname;
  const browserDocsHost = new URL(browserOrigin).hostname;
  const downloadServiceHost = new URL(downloadOrigin).hostname;
  const shellHost = new URL(shellOrigin).hostname;
  if ([browserDocsHost, downloadServiceHost, shellHost].includes(browserAppHost)) return null;
  if ([appServiceHost, browserDocsHost, downloadServiceHost].includes(shellHost)) return null;
  // appOrigin and downloadOrigin are service-to-service URLs. They may share a
  // Docker gateway hostname on different exact ports; neither receives the
  // browser app cookie because browserAppHost is distinct from both Docs hosts.
  if (![appOrigin, browserAppOrigin].includes(new URL(request.url).origin)) return null;
  return { browserOrigin, downloadOrigin, appOrigin, browserAppOrigin, shellOrigin, shellUrl: `${shellOrigin}/`, secret, scriptUrl: `${browserOrigin}/web-apps/apps/api/documents/api.js` };
}
export function requireOnlyOfficeSettings(request: Request): OnlyOfficeSettings {
  const settings = onlyOfficeSettings(request);
  if (!settings) throw new ApiError(503, "native_editor_unavailable", "原生文档服务尚未安全配置。原文件仍可下载并用本机 Office 编辑。");
  return settings;
}
export function requireOnlyOfficeBrowserRequest(request: Request): OnlyOfficeSettings {
  const settings = requireOnlyOfficeSettings(request);
  if (new URL(request.url).origin !== settings.browserAppOrigin) throw new ApiError(403, "native_browser_origin_forbidden", "编辑请求来源不在受控浏览器地址内。");
  return settings;
}
export function requireOnlyOfficeServiceRequest(request: Request): OnlyOfficeSettings {
  const settings = requireOnlyOfficeSettings(request);
  if (new URL(request.url).origin !== settings.appOrigin) throw new ApiError(403, "native_service_origin_forbidden", "文档服务回调地址不正确。");
  return settings;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function decodeBase64url(raw: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(raw) || raw.length > 16384 || raw.length % 4 === 1) throw new ApiError(401, "native_invalid_token", "文档服务签名无效。");
  try { return Uint8Array.from(atob(raw.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - raw.length % 4) % 4)), c => c.charCodeAt(0)); }
  catch { throw new ApiError(401, "native_invalid_token", "文档服务签名无效。"); }
}
function jsonPart(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64url(raw))); }
  catch { throw new ApiError(401, "native_invalid_token", "文档服务签名无效。"); }
  if (!isRecord(parsed)) throw new ApiError(401, "native_invalid_token", "文档服务签名无效。");
  return parsed;
}
async function hmac(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signOnlyOfficeConfig(config: Record<string, unknown>, secret: string): Promise<string> {
  const head = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(new TextEncoder().encode(JSON.stringify(config)));
  const data = `${head}.${body}`;
  return `${data}.${base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmac(secret), new TextEncoder().encode(data))))}`;
}
export async function verifyOnlyOfficeOutbound(request: Request, secret: string): Promise<Record<string, unknown>> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization);
  if (!match || authorization.length > 24_576) throw new ApiError(401, "native_invalid_token", "文档服务签名无效。");
  const header = jsonPart(match[1]);
  if (header.alg !== "HS256" || (header.typ !== undefined && header.typ !== "JWT") || Object.keys(header).some(k => !["alg", "typ"].includes(k))) throw new ApiError(401, "native_invalid_token", "文档服务签名无效。");
  const signed = new TextEncoder().encode(`${match[1]}.${match[2]}`);
  const signature = new Uint8Array(decodeBase64url(match[3]));
  if (!await crypto.subtle.verify("HMAC", await hmac(secret), signature, signed)) throw new ApiError(401, "native_invalid_token", "文档服务签名无效。");
  const claims = jsonPart(match[2]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(claims.exp) || (claims.exp as number) <= now || (claims.exp as number) > now + 600 ||
      (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || (claims.nbf as number) > now + 60)) ||
      (claims.iat !== undefined && (!Number.isSafeInteger(claims.iat) || (claims.iat as number) > now + 60))) {
    throw new ApiError(401, "native_expired_token", "文档服务签名已过期或时间无效。");
  }
  if (!isRecord(claims.payload)) throw new ApiError(401, "native_invalid_token", "文档服务签名载荷无效。");
  return claims.payload;
}
export function newNativeKey(): string {
  return `ne_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}
export function assertNativeKey(raw: string): string {
  if (!NATIVE_KEY.test(raw)) throw new ApiError(400, "native_invalid_key", "编辑会话编号无效。");
  return raw;
}
export function exactOnlyOfficeOutputUrl(raw: unknown, settings: OnlyOfficeSettings): URL {
  if (typeof raw !== "string" || raw.length > 2048) throw new ApiError(400, "native_invalid_output_url", "文档服务返回了无效的文件地址。");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new ApiError(400, "native_invalid_output_url", "文档服务返回了无效的文件地址。"); }
  if (parsed.origin !== settings.downloadOrigin || parsed.username || parsed.password || parsed.hash ||
      !parsed.pathname.startsWith("/") || parsed.pathname.includes("\\") || parsed.protocol !== new URL(settings.downloadOrigin).protocol) {
    throw new ApiError(403, "native_output_origin_forbidden", "文档服务文件地址不在受控来源内。");
  }
  return parsed;
}
