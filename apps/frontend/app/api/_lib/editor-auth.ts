import { ApiError } from "./http";
import { resolveOwnership, sha256Hex } from "./security";
import { resolveRecoveredEditorOwner } from "../../../db/editor-recovery-repository";
const COOKIE = "evix_editor_session";
const TOKEN = /^evx_[A-Za-z0-9_-]{43}$/;

export function assertEditorOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "origin_forbidden", "请在系统内进行编辑操作。");
  }
}
export function editorCookieToken(request: Request) {
  const value = (request.headers.get("cookie") || "").split(";").map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && TOKEN.test(value) ? value : null;
}
export function hasEditorAlternateIdentity(request: Request) {
  return new URL(request.url).searchParams.has("clientKey") || request.headers.has("x-client-key") || request.headers.has("oai-authenticated-user-id") || request.headers.has("oai-authenticated-user-email");
}
export function newEditorToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `evx_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}
export function editorCookieHeader(request: Request, token: string) {
  if (!TOKEN.test(token)) throw new Error("Invalid generated editor token");
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/drafts; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function editorOwner(request: Request) {
  let owner: string;
  if (hasEditorAlternateIdentity(request)) {
    owner = await sha256Hex(resolveOwnership(request).ownerKey);
  } else {
    const token = editorCookieToken(request);
    if (!token) throw new ApiError(401, "editor_session_required", "编辑会话已过期，请重新连接草稿库。");
    const tokenHash = await sha256Hex(`editor:${token}`);
    owner = await resolveRecoveredEditorOwner(tokenHash) ?? tokenHash;
  }
  const expected = request.headers.get("x-editor-scope");
  if (expected && expected !== owner) throw new ApiError(409, "editor_scope_changed", "登录身份已改变，已暂停保存。请导出备份，或确认另存到当前身份的草稿库。");
  return owner;
}
export async function editorSession(request: Request): Promise<Headers> {
  assertEditorOrigin(request);
  const headers = new Headers();
  if (hasEditorAlternateIdentity(request)) {
    await editorOwner(request);
  } else {
    const token = editorCookieToken(request);
    let expired = false;
    if (token) {
      try { await resolveRecoveredEditorOwner(await sha256Hex(`editor:${token}`)); }
      catch (error) {
        if (error instanceof ApiError && error.code === "editor_recovery_session_expired") expired = true;
        else throw error;
      }
    }
    // An expired recovered cookie may still be replayed by a client. Only this
    // explicit bootstrap resets it; ordinary reads/writes must remain denied.
    if (!token || expired) headers.set("set-cookie", editorCookieHeader(request, newEditorToken()));
  }
  return headers;
}
