import { ApiError, readJsonObject } from "../../_lib/http";
import { editorOwner, hasEditorAlternateIdentity } from "../../_lib/editor-auth";
import { sha256Hex } from "../../_lib/security";
import { parseRecoveryKey } from "../../../../lib/editor-recovery";

export async function recoveryOwner(request: Request, mutation: boolean): Promise<string> {
  const url = new URL(request.url);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new ApiError(403, "recovery_secure_origin_required", "恢复密钥仅能在 HTTPS 或本机回环地址使用。");
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || (origin !== null && origin !== url.origin) || (mutation ? origin !== url.origin : origin !== url.origin && site !== "same-origin")) {
    throw new ApiError(403, "recovery_origin_forbidden", "请在本站的身份恢复面板中操作。");
  }
  if (request.headers.get("x-editor-recovery") !== "1") throw new ApiError(403, "recovery_intent_required", "需要通过身份恢复面板确认本次操作。");
  if (url.search || hasEditorAlternateIdentity(request)) throw new ApiError(400, "recovery_identity_unsupported", "此功能仅用于浏览器私密会话，不支持网址参数或其他登录身份。");
  if (mutation && !/^[a-f0-9]{64}$/.test(request.headers.get("x-editor-scope") || "")) throw new ApiError(409, "editor_scope_changed", "请先刷新身份状态，再明确确认恢复操作。");
  return editorOwner(request);
}

export async function recoveryBody(request: Request, fields: string[]) {
  if (request.headers.has("content-encoding")) throw new ApiError(415, "recovery_encoding_unsupported", "恢复请求不支持压缩编码。");
  let body: Record<string, unknown>;
  try { body = await readJsonObject(request, 1024); }
  catch (error) {
    if (error instanceof TypeError) throw new ApiError(400, "invalid_recovery_body", "恢复请求编码无效。");
    throw error;
  }
  if (Object.keys(body).some(key => !fields.includes(key)) || fields.some(key => !(key in body))) {
    throw new ApiError(400, "invalid_recovery_body", "恢复请求字段不完整或包含额外字段。");
  }
  let key: string;
  try { key = parseRecoveryKey(body.key); } catch { throw new ApiError(400, "invalid_recovery_key", "恢复密钥格式无效，请检查完整密钥。"); }
  return { body, verifierHash: await sha256Hex(`editor-recovery:v1:${key}`) };
}
