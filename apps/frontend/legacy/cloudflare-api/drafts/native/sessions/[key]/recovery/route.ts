import { ApiError, apiErrorResponse } from "../../../../../_lib/http";
import { assertEditorOrigin, editorCookieToken, editorOwner, hasEditorAlternateIdentity } from "../../../../../_lib/editor-auth";
import { getOwnedNativeRecovery } from "@/db/native-editor-repository";
import { officeStorage } from "@/db/office-repository";
import { OFFICE_MIME, officeDisposition } from "@/lib/office-model";
import { assertNativeKey } from "@/lib/onlyoffice-protocol";
type Context = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: Context) {
  try {
    assertEditorOrigin(request);
    if (!request.headers.get("x-editor-scope")) throw new ApiError(409, "native_scope_required", "请先连接原文件库并确认编辑身份。");
    if (!editorCookieToken(request) || hasEditorAlternateIdentity(request)) throw new ApiError(401, "editor_session_required", "请使用创建文件的原编辑会话下载冲突副本。");
    const key = assertNativeKey((await context.params).key);
    const recovery = await getOwnedNativeRecovery(key, await editorOwner(request));
    const object = await officeStorage().bucket.get(recovery.objectKey);
    if (!object || object.size !== recovery.size || object.customMetadata?.sha256 !== recovery.sha256) {
      throw new ApiError(503, "native_recovery_unavailable", "冲突副本内容暂不可用；请保留页面并联系维护者。");
    }
    const bytes = await object.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== recovery.size || digest !== recovery.sha256) throw new ApiError(503, "native_recovery_integrity", "冲突副本完整性检查未通过，下载已阻止。");
    const stem = recovery.filename.slice(0, -(recovery.kind.length + 1)).slice(0, 100);
    const filename = `${stem} - 冲突编辑副本.${recovery.kind}`;
    return new Response(bytes, { headers: {
      "content-type": OFFICE_MIME[recovery.kind], "content-length": String(recovery.size),
      "content-disposition": officeDisposition(filename, recovery.kind), "cache-control": "no-store",
      "x-content-type-options": "nosniff", "x-office-sha256": digest,
      "content-security-policy": "default-src 'none'",
    } });
  } catch (error) { return apiErrorResponse(error); }
}
