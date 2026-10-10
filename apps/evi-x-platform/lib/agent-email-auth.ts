/** Invitation-only email challenge contracts. No raw email or code is persisted. */
export const EMAIL_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CHALLENGE_ATTEMPTS = 5;
export const EMAIL_SEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_SEND_WINDOW_MS = 60 * 60 * 1000;
export const EMAIL_SEND_WINDOW_LIMIT = 5;
export const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export type EmailChallenge = {
  emailHash: string;
  id: string;
  expiresAt: number;
  attempts: number;
  delivered: boolean;
  consumedAt: number | null;
};
export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.name = 'AuthError'; this.status = status; this.code = code;
  }
}
export function invalidEmailChallenge(): AuthError {
  return new AuthError(401, 'email_code_invalid', '邮箱或验证码不可用，请重新获取验证码。');
}
function normalized(email: unknown): string | null {
  if (typeof email !== 'string' || email.length > 512) return null;
  const value = email.trim().toLowerCase();
  if (!value.length || value.length > 254 || !/^[\x21-\x7e]+$/.test(value)) return null;
  const split = value.split('@');
  if (split.length !== 2) return null;
  const [local, domain] = split;
  if (!local.length || local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
  return value;
}
export function normalizeInvitedEmail(email: unknown, allowedEmails: readonly string[]): string {
  const value = normalized(email);
  if (!Array.isArray(allowedEmails) || allowedEmails.length > 1000) throw new AuthError(503, 'email_auth_unavailable', '邮箱登录暂时不可用。');
  if (!value || !allowedEmails.some(allowed => normalized(allowed) === value)) {
    throw new AuthError(403, 'email_invitation_required', '当前邮箱暂不能登录，请联系管理员。');
  }
  return value;
}
export function authHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw invalidEmailChallenge();
  return value;
}
export function challengeId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) throw invalidEmailChallenge();
  return value;
}
export function authNow(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - ACCOUNT_SESSION_TTL_MS) throw invalidEmailChallenge();
  return value;
}
export function generateEmailCode(): string {
  const range = 1_000_000, ceiling = Math.floor(2 ** 32 / range) * range;
  let value: number;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= ceiling);
  return String(value % range).padStart(6, '0');
}
const encoder = new TextEncoder();
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
export async function hashEmail(email: string): Promise<string> {
  const value = normalized(email);
  if (!value) throw invalidEmailChallenge();
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(`evix/email/identity/v1:${value}`)));
}
export async function stableAccountOwner(emailHash: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(`account:${authHash(emailHash)}`)));
}
export async function hashChallenge(emailHash: string, id: string, code: string, secret: Uint8Array): Promise<string> {
  authHash(emailHash); challengeId(id);
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw invalidEmailChallenge();
  if (!(secret instanceof Uint8Array) || secret.length !== 32) throw new AuthError(503, 'email_auth_unavailable', '邮箱登录暂时不可用。');
  const seed = await crypto.subtle.importKey('raw', new Uint8Array(secret), 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('evix/email/challenge/v1'), info: encoder.encode('code-verifier') }, seed, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(['evix/email/challenge/v1', emailHash, id, code]))));
}
