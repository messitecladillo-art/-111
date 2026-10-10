import { ApiError } from "./http";

const GENERATED_CLIENT_KEY_PATTERN = /^evx_[A-Za-z0-9_-]{43}$/;
const LEGACY_CLIENT_KEY_PATTERN = /^[0-9a-f]{48}$/i;
const AUTHENTICATED_USER_ID_PATTERN = /^[\x21-\x7e]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractClientKey(
  request: Request,
): string {
  const url = new URL(request.url);
  if (url.searchParams.has("clientKey")) {
    throw new ApiError(
      400,
      "client_key_location_forbidden",
      "clientKey 不得放入网址，请仅通过 x-client-key 请求头提供。",
    );
  }
  const headerValue = request.headers.get("x-client-key")?.trim() || undefined;
  const clientKey = headerValue;
  if (!clientKey) {
    throw new ApiError(
      400,
      "client_key_required",
      "请通过 x-client-key 请求头提供 clientKey。",
    );
  }
  if (
    !GENERATED_CLIENT_KEY_PATTERN.test(clientKey) &&
    !LEGACY_CLIENT_KEY_PATTERN.test(clientKey)
  ) {
    throw new ApiError(
      400,
      "invalid_client_key",
      "匿名访问密钥格式无效，请使用页面生成的高强度密钥。",
    );
  }
  return clientKey;
}

export type OwnershipIdentity = {
  ownerKey: string;
  mode: "authenticated" | "anonymous_key";
};

/**
 * The platform-injected opaque user id takes precedence. Email and display
 * name are intentionally neither read nor stored. Anonymous sessions fall
 * back to a high-entropy client key.
 */
export function resolveOwnership(
  request: Request,
): OwnershipIdentity {
  // Reject URL-carried keys even for authenticated requests so secrets never
  // enter browser history, access logs, analytics, or referrer headers.
  if (new URL(request.url).searchParams.has("clientKey")) {
    throw new ApiError(
      400,
      "client_key_location_forbidden",
      "clientKey 不得放入网址，请仅通过 x-client-key 请求头提供。",
    );
  }
  const authenticatedUserId = request.headers.get("oai-authenticated-user-id")?.trim();
  const authenticatedUserEmail = request.headers.get("oai-authenticated-user-email")?.trim();
  if (authenticatedUserId || authenticatedUserEmail) {
    // Sites dispatch guarantees that a signed-in visitor receives both
    // headers. A partial identity is never accepted or allowed to fall back.
    if (!authenticatedUserId || !authenticatedUserEmail) {
      throw new ApiError(
        401,
        "incomplete_authenticated_identity",
        "登录身份信息不完整，请重新登录后再试。",
      );
    }
    if (
      authenticatedUserId.length > 256 ||
      !AUTHENTICATED_USER_ID_PATTERN.test(authenticatedUserId) ||
      authenticatedUserEmail.length > 320 ||
      !EMAIL_PATTERN.test(authenticatedUserEmail)
    ) {
      throw new ApiError(
        401,
        "invalid_authenticated_user",
        "认证用户标识无效。",
      );
    }
    return {
      ownerKey: `authenticated:${authenticatedUserId}`,
      mode: "authenticated",
    };
  }

  return {
    ownerKey: `anonymous:${extractClientKey(request)}`,
    mode: "anonymous_key",
  };
}

export function validateProjectId(value: string): string {
  if (!PROJECT_ID_PATTERN.test(value)) {
    throw new ApiError(400, "invalid_project_id", "项目 ID 格式无效。");
  }
  return value;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
