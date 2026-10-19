/** Private service capability sessions. This is not an account login provider. */
export class AgentSessionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; }
}
const COOKIE = 'evix_agent_session';
const TTL = 30 * 24 * 60 * 60;
const utf8 = new TextEncoder();
function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function unb64(text: string): Uint8Array {
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
async function signingKey(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.length !== 32) throw new AgentSessionError(503, 'agent_session_unavailable', '服务会话尚未配置。');
  const seed = await crypto.subtle.importKey('raw', new Uint8Array(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:utf8.encode('evix/byok/session/v1'),info:utf8.encode('cookie-signature')}, seed, {name:'HMAC',hash:'SHA-256',length:256}, false, ['sign','verify']);
}
export function assertAgentOrigin(request: Request, mutation = true): void {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new AgentSessionError(403, 'agent_https_required', '服务设置需要 HTTPS 连接。');
  }
  const origin = request.headers.get('origin');
  if ((mutation && origin !== url.origin) || (origin !== null && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AgentSessionError(403, 'agent_origin_forbidden', '请从本站的服务设置发起操作。');
  }
  if (request.headers.has('oai-authenticated-user-id') || request.headers.has('oai-authenticated-user-email') || request.headers.has('x-client-key') || url.searchParams.has('clientKey') || url.searchParams.has('apiKey')) {
    throw new AgentSessionError(401, 'agent_identity_untrusted', '服务设置仅接受当前私密会话。');
  }
}
export async function newAgentSession(secret: Uint8Array, now = Date.now()): Promise<string> {
  const issued = Math.floor(now / 1000);
  const payload = `v1.${b64(crypto.getRandomValues(new Uint8Array(32)))}.${issued}.${issued + TTL}`;
  return `${payload}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), utf8.encode(payload))))}`;
}
export function agentCookie(request: Request, token: string): string {
  assertAgentOrigin(request);
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/agent; Max-Age=${TTL}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function agentOwner(request: Request, secret: Uint8Array, now = Date.now()): Promise<string> {
  assertAgentOrigin(request, !['GET','HEAD'].includes(request.method));
  const cookies = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
  const token = cookies.length === 1 ? cookies[0].slice(COOKIE.length + 1) : '';
  const pieces = token.split('.');
  if (pieces.length !== 5 || pieces[0] !== 'v1' || !/^[A-Za-z0-9_-]{43}$/.test(pieces[1]) || !/^\d{10}$/.test(pieces[2]) || !/^\d{10}$/.test(pieces[3]) || !/^[A-Za-z0-9_-]{43}$/.test(pieces[4])) {
    throw new AgentSessionError(401, 'agent_session_required', '请先连接你的服务工作区。');
  }
  const issued=Number(pieces[2]), expires=Number(pieces[3]), seconds=Math.floor(now/1000);
  if (issued>seconds+30 || expires<=seconds || expires-issued!==TTL || !await crypto.subtle.verify('HMAC',await signingKey(secret),new Uint8Array(unb64(pieces[4])),utf8.encode(pieces.slice(0,4).join('.')))) {
    throw new AgentSessionError(401, 'agent_session_expired', '私密会话无效或已过期，请重新连接。');
  }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(`evix/byok/owner/v1:${pieces[1]}`)));
  return [...hash].map(v=>v.toString(16).padStart(2,'0')).join('');
}
