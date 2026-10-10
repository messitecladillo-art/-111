/** BYOK configuration contracts. This module never reads environment secrets. */
export const SERVICE_LIMIT = 8;
export const SERVICE_PROVIDERS = ['openai', 'deepseek', 'qwen', 'compatible'] as const;
export const SERVICE_CAPABILITIES = ['questionnaire', 'research', 'report', 'defense'] as const;
export type ServiceProvider = typeof SERVICE_PROVIDERS[number];
export type ServiceCapability = typeof SERVICE_CAPABILITIES[number];
export type ServiceConfig = {
  id: string;
  label: string;
  provider: ServiceProvider;
  baseUrl: string;
  model: string;
  capabilities: ServiceCapability[];
  maxOutputTokens: number;
  revision: number;
};
export type ServiceInput = Omit<ServiceConfig, 'revision'> & { apiKey?: string };
export type MasterKey = { keyId: string; key: Uint8Array };
export type ServiceKeyContext = { owner: string; id: string; revision: number; configSha256?: string };
export type EncryptedServiceKey = { version: 1; keyId: string; iv: string; ciphertext: string };
export type ServiceUsage = {
  id: string;
  serviceId: string;
  serviceRevision: number;
  capability: ServiceCapability;
  status: 'succeeded' | 'failed' | 'cancelled';
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
};

export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
  }
}

const control = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function invalid() {
  return new ServiceError(400, 'invalid_service_input', '服务配置格式或长度无效。');
}

/** Reject unknown, symbol, accessor and inherited fields without evaluating getters. */
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))) throw invalid();
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor) || !descriptor.enumerable)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max || control.test(value) || value !== value.trim()) throw invalid();
  return value;
}
export function serviceId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw invalid();
  return value;
}
export function serviceOwner(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new ServiceError(401, 'service_owner_required', '需要有效的私密会话。');
  return value;
}
export function serviceRevision(value: unknown, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 2_147_483_647) throw invalid();
  return value;
}
function apiKey(value: unknown): string {
  const result = text(value, 512);
  if (result.length < 8 || /\s/.test(result)) throw invalid();
  return result;
}
function baseUrl(value: unknown): string {
  const raw = text(value, 512);
  let url: URL;
  try { url = new URL(raw); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || raw.endsWith('/') || url.href !== raw) throw invalid();
  // Server-controlled provider allowlists enforce permitted destinations at transport.
  return raw;
}
export function parseServiceInput(value: unknown): ServiceInput {
  const input = record(value, ['id', 'label', 'provider', 'baseUrl', 'model', 'capabilities', 'maxOutputTokens', 'apiKey']);
  if (typeof input.provider !== 'string' || !SERVICE_PROVIDERS.includes(input.provider as ServiceProvider)) throw invalid();
  const model = text(input.model, 120);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model)) throw invalid();
  if (!Array.isArray(input.capabilities) || Object.getPrototypeOf(input.capabilities) !== Array.prototype || input.capabilities.length < 1 || input.capabilities.length > 4) throw invalid();
  const arrayFields = Object.getOwnPropertyDescriptors(input.capabilities);
  if (Reflect.ownKeys(input.capabilities).length !== input.capabilities.length + 1) throw invalid();
  const capabilities = Array.from({ length: input.capabilities.length }, (_, index) => {
    const descriptor = arrayFields[String(index)];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable || typeof descriptor.value !== 'string' || !SERVICE_CAPABILITIES.includes(descriptor.value as ServiceCapability)) throw invalid();
    return descriptor.value as ServiceCapability;
  });
  if (new Set(capabilities).size !== capabilities.length) throw invalid();
  if (typeof input.maxOutputTokens !== 'number' || !Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 128 || input.maxOutputTokens > 4096) throw invalid();
  return {
    id: serviceId(input.id), label: text(input.label, 80), provider: input.provider as ServiceProvider,
    baseUrl: baseUrl(input.baseUrl), model, capabilities,
    maxOutputTokens: input.maxOutputTokens,
    ...(Object.hasOwn(input, 'apiKey') ? { apiKey: apiKey(input.apiKey) } : {}),
  };
}
export function parseServiceUsage(value: unknown): ServiceUsage {
  const input = record(value, ['id', 'serviceId', 'serviceRevision', 'capability', 'status', 'durationMs', 'inputTokens', 'outputTokens', 'errorCode']);
  if (typeof input.capability !== 'string' || !SERVICE_CAPABILITIES.includes(input.capability as ServiceCapability) || !['succeeded', 'failed', 'cancelled'].includes(input.status as string)) throw invalid();
  if (typeof input.durationMs !== 'number' || !Number.isInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 120_000) throw invalid();
  const result: ServiceUsage = {
    id: serviceId(input.id), serviceId: serviceId(input.serviceId), serviceRevision: serviceRevision(input.serviceRevision),
    capability: input.capability as ServiceCapability, status: input.status as ServiceUsage['status'], durationMs: input.durationMs,
  };
  for (const key of ['inputTokens', 'outputTokens'] as const) {
    if (Object.hasOwn(input, key)) {
      const n = input[key];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1_000_000) throw invalid();
      result[key] = n;
    }
  }
  if (Object.hasOwn(input, 'errorCode')) {
    if (typeof input.errorCode !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(input.errorCode)) throw invalid();
    result.errorCode = input.errorCode;
  }
  return result;
}

const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decode(value: unknown, min: number, max: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > Math.ceil(max * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0));
  } catch { throw invalid(); }
  if (bytes.length < min || bytes.length > max || encode(bytes) !== value) throw invalid();
  return bytes;
}
function checkedMaster(master: MasterKey): { keyId: string; key: Uint8Array<ArrayBuffer> } {
  if (!master || typeof master.keyId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(master.keyId) || !(master.key instanceof Uint8Array) || master.key.length !== 32) {
    throw new ServiceError(503, 'service_master_key_unavailable', '服务密钥保管未完成配置。');
  }
  return { keyId: master.keyId, key: new Uint8Array(master.key) };
}
function associatedData(context: ServiceKeyContext, keyId: string): Uint8Array<ArrayBuffer> {
  if(context.configSha256!==undefined&&!/^[0-9a-f]{64}$/.test(context.configSha256))throw invalid();
  return encoder.encode(JSON.stringify(['evi-x-service-key/v1', serviceOwner(context.owner), serviceId(context.id), serviceRevision(context.revision), keyId,context.configSha256||'unbound']));
}
export async function encryptServiceKey(value: string, context: ServiceKeyContext, master: MasterKey): Promise<EncryptedServiceKey> {
  const secret = apiKey(value), checked = checkedMaster(master), aad = associatedData(context, checked.keyId);
  const key = await crypto.subtle.importKey('raw', checked.key, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, encoder.encode(secret));
  return { version: 1, keyId: checked.keyId, iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
}
export async function decryptServiceKey(value: EncryptedServiceKey, context: ServiceKeyContext, master: MasterKey): Promise<string> {
  const checked = checkedMaster(master);
  try {
    const envelope = record(value, ['version', 'keyId', 'iv', 'ciphertext']);
    if (envelope.version !== 1 || envelope.keyId !== checked.keyId) throw invalid();
    const iv = decode(envelope.iv, 12, 12), ciphertext = decode(envelope.ciphertext, 24, 2064);
    const aad = associatedData(context, checked.keyId);
    const key = await crypto.subtle.importKey('raw', checked.key, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, ciphertext);
    return apiKey(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    throw new ServiceError(409, 'service_key_integrity', '服务密钥校验失败，请重新配置。');
  }
}
