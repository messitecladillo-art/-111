import { ApiError, apiErrorResponse, noStoreJson } from "../../../_lib/http";
import { assertEditorOrigin, editorCookieToken, editorOwner, hasEditorAlternateIdentity } from "../../../_lib/editor-auth";
import { listOwnedNativeRecoveries } from "@/db/native-editor-repository";

export async function GET(request: Request) {
  try {
    assertEditorOrigin(request);
    if (!request.headers.get("x-editor-scope")) throw new ApiError(409, "native_scope_required", "请先连接原文件库并确认编辑身份。");
    if (!editorCookieToken(request) || hasEditorAlternateIdentity(request)) throw new ApiError(401, "editor_session_required", "请使用创建文件的原编辑会话查看冲突副本。");
    return noStoreJson({ items: await listOwnedNativeRecoveries(await editorOwner(request)) });
  } catch (error) { return apiErrorResponse(error); }
}
