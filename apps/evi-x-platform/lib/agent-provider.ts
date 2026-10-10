import type { ServiceConfig, ServiceProvider } from "./agent-services.ts";

/** This map is an operator policy, never a value supplied by an API client. */
export type ProviderAllowedBases = Partial<Record<ServiceProvider, readonly string[]>>;
export const DEFAULT_PROVIDER_BASES: Readonly<Record<ServiceProvider, readonly string[]>> = Object.freeze({
  openai: Object.freeze(["https://api.openai.com/v1"]),
  deepseek: Object.freeze(["https://api.deepseek.com/v1"]),
  qwen: Object.freeze(["https://dashscope.aliyuncs.com/compatible-mode/v1"]),
  compatible: Object.freeze([]),
});
export const AGENT_PROVIDER_LIMITS = Object.freeze({
  inputBytes: 32 * 1024,
  responseBytes: 128 * 1024,
  timeoutMs: 30_000,
  minOutputTokens: 128,
  maxOutputTokens: 4096,
  keyBytes: 1024,
  usageMaxTokens: 1_000_000,
});

export type ProviderErrorCode =
  | "invalid_configuration" | "destination_not_allowed" | "invalid_key" | "invalid_request"
  | "input_too_large" | "timeout" | "authentication_failed" | "rate_limited"
  | "provider_unavailable" | "provider_rejected" | "redirect_blocked"
  | "response_too_large" | "invalid_response" | "model_not_available" | "network_failed";

const ERROR_MESSAGES: Record<ProviderErrorCode, string> = {
  invalid_configuration: "服务配置无效，请检查服务商、地址和模型。",
  destination_not_allowed: "此服务地址未获网站运营者允许。",
  invalid_key: "API Key 格式无效。",
  invalid_request: "生成请求无效，请检查内容和输出上限。",
  input_too_large: "输入超过 32 KB 上限，请缩短内容。",
  timeout: "服务请求超时；生成请求可能已被服务商处理，请先核查用量。",
  authentication_failed: "服务商拒绝了此 API Key，请检查密钥和权限。",
  rate_limited: "服务商返回限流，请稍后手动重试。",
  provider_unavailable: "服务商暂时不可用。",
  provider_rejected: "服务商拒绝了此请求，模型或参数可能不兼容。",
  redirect_blocked: "服务商返回重定向，已阻止向其他地址发送密钥。",
  response_too_large: "服务商响应超过 128 KB 上限。",
  invalid_response: "服务商响应不符合纯文本接口契约。",
  model_not_available: "服务商模型列表未包含所选模型，不能确认此模型可用。",
  network_failed: "无法连接服务商，请检查网络或服务配置。",
};

export class ProviderCallError extends Error {
  readonly code: ProviderErrorCode;
  constructor(code: ProviderErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ProviderCallError";
    this.code = code;
  }
}

export type AgentProviderRequest =
  | { kind: "test"; prompt?: never; maxOutputTokens?: never }
  | { kind: "questionnaire"; prompt: string; maxOutputTokens?: number };

export type AgentProviderResult =
  | { ok: true; kind: "test"; connection: "reachable"; authentication: "provider_accepted";
      modelAvailable: true; generationVerified: false }
  | { ok: true; kind: "questionnaire"; text: string; contentFormat: "plain_text";
      contentClass: "proposed"; verified: false;
      usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null }
  | { ok: false; error: { code: ProviderErrorCode; message: string; retryable: boolean } };

export interface AgentProviderOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  allowedBases?: ProviderAllowedBases;
}

/** Returns an exact approved base. It deliberately rejects silent URL normalization. */
export function validateProviderBase(
  config: Pick<ServiceConfig, "provider" | "baseUrl">,
  allowedBases?: ProviderAllowedBases,
): string {
  if (!config || !Object.hasOwn(DEFAULT_PROVIDER_BASES, config.provider)
    || typeof config.baseUrl !== "string" || config.baseUrl.length > 2048
    || /[\u0000-\u0020\u007f]/u.test(config.baseUrl)) {
    throw new ProviderCallError("invalid_configuration");
  }
  let url: URL;
  try { url = new URL(config.baseUrl); }
  catch { throw new ProviderCallError("invalid_configuration"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || /[?#]/u.test(config.baseUrl) || url.href !== config.baseUrl
    || config.baseUrl.endsWith("/")) {
    throw new ProviderCallError("invalid_configuration");
  }
  const bases = allowedBases && Object.hasOwn(allowedBases, config.provider)
    ? allowedBases[config.provider] : DEFAULT_PROVIDER_BASES[config.provider];
  if (!Array.isArray(bases) || !bases.includes(config.baseUrl)) {
    throw new ProviderCallError("destination_not_allowed");
  }
  return config.baseUrl;
}

/** One bounded call, with no retries, tools, redirects, or upstream error disclosure. */
export async function callAgentProvider(
  config: ServiceConfig,
  key: string,
  request: AgentProviderRequest,
  options: AgentProviderOptions = {},
): Promise<AgentProviderResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const base = validateProviderBase(config, options.allowedBases);
    if (typeof key !== "string" || key.length < 8 || key.length > AGENT_PROVIDER_LIMITS.keyBytes
      || !/^[\x21-\x7e]+$/u.test(key)) {
      throw new ProviderCallError("invalid_key");
    }
    if (typeof config.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(config.model)
      || config.model.includes(key)) throw new ProviderCallError("invalid_configuration");
    if (!Number.isSafeInteger(config.maxOutputTokens)
      || config.maxOutputTokens < AGENT_PROVIDER_LIMITS.minOutputTokens
      || config.maxOutputTokens > AGENT_PROVIDER_LIMITS.maxOutputTokens) {
      throw new ProviderCallError("invalid_configuration");
    }
    if (!request || (request.kind !== "test" && request.kind !== "questionnaire")) {
      throw new ProviderCallError("invalid_request");
    }
    const timeoutMs = options.timeoutMs ?? AGENT_PROVIDER_LIMITS.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > AGENT_PROVIDER_LIMITS.timeoutMs) {
      throw new ProviderCallError("invalid_configuration");
    }
    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== "function") throw new ProviderCallError("invalid_configuration");
    let body: string | undefined;
    if (request.kind === "questionnaire") {
      const maxOutputTokens = request.maxOutputTokens ?? config.maxOutputTokens;
      if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < AGENT_PROVIDER_LIMITS.minOutputTokens
        || maxOutputTokens > config.maxOutputTokens
        || typeof request.prompt !== "string" || !request.prompt.trim()
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(request.prompt)) {
        throw new ProviderCallError("invalid_request");
      }
      if (byteLength(request.prompt) > AGENT_PROVIDER_LIMITS.inputBytes) {
        throw new ProviderCallError("input_too_large");
      }
      body = JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: request.prompt }],
        stream: false,
        n: 1,
        ...(config.provider === "openai" || config.provider === "qwen"
          ? { max_completion_tokens: maxOutputTokens, ...(config.provider === "openai" ? { store: false } : {}) }
          : { max_tokens: maxOutputTokens }),
      });
      if (byteLength(body) > AGENT_PROVIDER_LIMITS.inputBytes) {
        throw new ProviderCallError("input_too_large");
      }
    }
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderCallError("timeout"));
      }, timeoutMs);
    });
    // Racing the entire operation also bounds injected transports/readers that ignore abort.
    return await Promise.race([
      performCall(fetcher, `${base}/${request.kind === "test" ? "models" : "chat/completions"}`,
        key, config.model, request.kind, body, controller.signal),
      deadline,
    ]);
  } catch (error) {
    const code = controller.signal.aborted ? "timeout"
      : error instanceof ProviderCallError ? error.code : "network_failed";
    return { ok: false, error: { code, message: ERROR_MESSAGES[code],
      retryable: code === "rate_limited" || code === "provider_unavailable"
        || (code === "network_failed" && request?.kind === "test") } };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function performCall(
  fetcher: typeof globalThis.fetch,
  endpoint: string,
  key: string,
  model: string,
  kind: AgentProviderRequest["kind"],
  body: string | undefined,
  signal: AbortSignal,
): Promise<AgentProviderResult> {
  const response = await fetcher(endpoint, {
    method: kind === "test" ? "GET" : "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json",
      ...(kind === "questionnaire" ? { "Content-Type": "application/json" } : {}) },
    body,
    signal,
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (signal.aborted) { cancelBody(response); throw new ProviderCallError("timeout"); }
  if (response.redirected || (response.status >= 300 && response.status <= 399)) {
    cancelBody(response); throw new ProviderCallError("redirect_blocked");
  }
  if (response.status < 200 || response.status > 299) {
    cancelBody(response);
    const code = response.status === 401 || response.status === 403 ? "authentication_failed"
      : response.status === 429 ? "rate_limited"
      : response.status >= 500 ? "provider_unavailable" : "provider_rejected";
    throw new ProviderCallError(code);
  }
  const raw = await readBoundedJson(response, signal);
  if (signal.aborted) throw new ProviderCallError("timeout");
  if (!isRecord(raw)) throw new ProviderCallError("invalid_response");
  if (kind === "test") {
    if (!Array.isArray(raw.data) || !raw.data.every(item => isRecord(item) && typeof item.id === "string")) {
      throw new ProviderCallError("invalid_response");
    }
    if (!raw.data.some(item => item.id === model)) throw new ProviderCallError("model_not_available");
    return { ok: true, kind: "test", connection: "reachable", authentication: "provider_accepted",
      modelAvailable: true, generationVerified: false };
  }
  const choice = Array.isArray(raw.choices) && raw.choices.length === 1 ? raw.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  if (!isRecord(choice) || !message || typeof message.content !== "string" || !message.content.trim()
    || (message.role !== undefined && message.role !== "assistant")
    || (message.tool_calls !== undefined && message.tool_calls !== null)
    || (message.function_call !== undefined && message.function_call !== null)
    || choice.finish_reason === "tool_calls" || choice.finish_reason === "function_call"
    || choice.finish_reason === "length"
    || message.content.includes(key)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(message.content)) {
    throw new ProviderCallError("invalid_response");
  }
  return { ok: true, kind: "questionnaire", text: message.content, contentFormat: "plain_text",
    contentClass: "proposed", verified: false, usage: parseUsage(raw.usage) };
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && /^\d+$/u.test(length) && Number(length) > AGENT_PROVIDER_LIMITS.responseBytes) {
    cancelBody(response); throw new ProviderCallError("response_too_large");
  }
  const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!mime || !/^application\/(?:json|[a-z0-9.+-]+\+json)$/u.test(mime) || !response.body) {
    cancelBody(response); throw new ProviderCallError("invalid_response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  const cancel = () => { try { void reader.cancel().catch(() => undefined); } catch { /* no unbounded cleanup */ } };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new ProviderCallError("timeout");
      const chunk = await reader.read();
      if (signal.aborted) throw new ProviderCallError("timeout");
      if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > AGENT_PROVIDER_LIMITS.responseBytes) {
        cancel(); throw new ProviderCallError("response_too_large");
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new ProviderCallError("invalid_response"); }
  } finally {
    signal.removeEventListener("abort", cancel);
    try { reader.releaseLock(); } catch { /* a transport may still have a pending read */ }
  }
}

function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => undefined); } catch { /* do not wait on cancellation */ }
}
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseUsage(value: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  if (!isRecord(value)) return null;
  const { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: totalTokens } = value;
  if (![inputTokens, outputTokens, totalTokens].every(token => typeof token === "number"
    && Number.isSafeInteger(token) && token >= 0 && token <= AGENT_PROVIDER_LIMITS.usageMaxTokens)
    || (totalTokens as number) < (inputTokens as number) + (outputTokens as number)) return null;
  return { inputTokens: inputTokens as number, outputTokens: outputTokens as number, totalTokens: totalTokens as number };
}
