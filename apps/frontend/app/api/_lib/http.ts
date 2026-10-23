export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers?: HeadersInit,
  ) {
    super(message);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function readJsonObject(
  request: Request,
  maxBytes = 16_384,
  onJsonText?: (text: string) => void,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "请求内容类型必须为 application/json。",
    );
  }
  const advertised = Number(request.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    throw new ApiError(413, "payload_too_large", "请求内容过大。");
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          // Cancellation can wait indefinitely for a transport or an unread tee
          // branch. The byte limit must return 413 independently of that cleanup.
          void reader.cancel("payload_too_large").catch(() => {});
          throw new ApiError(413, "payload_too_large", "请求内容过大。");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "invalid_json", "请求必须是有效的 JSON 对象。");
  }
  if (!isRecord(parsed)) {
    throw new ApiError(400, "invalid_body", "请求必须是 JSON 对象。");
  }
  // Trusted synchronous validation only, after the same bounded read completes.
  // Consumers needing exact JSON keys must not pre-pipe/tee the request body:
  // that starts a second stream lifecycle even when the headers reject it early.
  // Do not catch observer errors here: callers may reject duplicate JSON members.
  onJsonText?.(raw);
  return parsed;
}

export function assertOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
) {
  const unexpected = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new ApiError(
      400,
      "unexpected_fields",
      `包含不支持的字段：${unexpected.slice(0, 5).join("、")}。`,
    );
  }
}

export function requiredString(
  input: Record<string, unknown>,
  key: string,
  options: { min?: number; max: number; label?: string },
): string {
  const label = options.label ?? key;
  if (typeof input[key] !== "string") {
    throw new ApiError(400, "invalid_field", `${label} 必须是文本。`);
  }
  const value = input[key].trim();
  const min = options.min ?? 1;
  if (value.length < min || value.length > options.max) {
    throw new ApiError(
      400,
      "invalid_field_length",
      `${label} 长度必须为 ${min}–${options.max} 个字符。`,
    );
  }
  return value;
}

export function optionalString(
  value: unknown,
  options: { max: number; label: string },
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_field", `${options.label} 必须是文本。`);
  }
  const normalized = value.trim();
  if (normalized.length > options.max) {
    throw new ApiError(
      400,
      "invalid_field_length",
      `${options.label} 不能超过 ${options.max} 个字符。`,
    );
  }
  return normalized;
}

export function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiError(
      400,
      "invalid_enum",
      `${label} 必须是：${allowed.join("、")} 之一。`,
    );
  }
  return value as T;
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const headers = new Headers(error.headers);
    headers.set("cache-control", "no-store");
    headers.set("content-type", "application/json; charset=utf-8");
    return Response.json(
      { error: { code: error.code, message: error.message } },
      {
        status: error.status,
        headers,
      },
    );
  }

  // Do not echo Error.message: database drivers and bundlers may include local
  // paths, SQL fragments, or binding details.
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "服务暂时不可用，请稍后重试。",
      },
    },
    {
      status: 500,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

export function noStoreJson(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  return Response.json(body, { ...init, headers });
}
