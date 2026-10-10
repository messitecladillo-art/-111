import { ApiError, apiErrorResponse, noStoreJson } from "../../../../../_lib/http";
import { editorCookieToken, editorOwner, hasEditorAlternateIdentity } from "../../../../../_lib/editor-auth";
import { assertNativeKey, requireOnlyOfficeBrowserRequest } from "@/lib/onlyoffice-protocol";
import { getOwnedNativeRecovery, getOwnedNativeSession, publicNativeState } from "@/db/native-editor-repository";
type Context = { params: Promise<{ key: string }> };
export async function GET(request: Request, context: Context) {
  try {
    requireOnlyOfficeBrowserRequest(request);
    if (!request.headers.get("x-editor-scope")) throw new ApiError(409, "native_scope_required", "请先连接原文件库并确认编辑身份。");
    if (!editorCookieToken(request) || hasEditorAlternateIdentity(request)) throw new ApiError(401, "editor_session_required", "原生编辑仅支持当前已连接的文件库会话。");
    const key = assertNativeKey((await context.params).key);
    const owner = await editorOwner(request);
    const row = await getOwnedNativeSession(key, owner);
    let recovery = null;
    if (row.state === "conflict") {
      try { recovery = await getOwnedNativeRecovery(key, owner); }
      catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
    }
    return noStoreJson({ state: row.state === "conflict" && !recovery ? "error" : publicNativeState(row),
      ...(recovery ? { recovery: { available: true, sha256: recovery.sha256, size: recovery.size, expiresAt: recovery.expiresAt } } : {}),
      ...(row.saved_revision === null ? {} : { savedRevision: row.saved_revision }) });
  } catch (error) { return apiErrorResponse(error); }
}
