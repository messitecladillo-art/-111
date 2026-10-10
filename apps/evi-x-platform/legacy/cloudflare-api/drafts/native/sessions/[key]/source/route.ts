import { ApiError, apiErrorResponse } from "../../../../../_lib/http";
import { assertNativeKey, requireOnlyOfficeServiceRequest, verifyOnlyOfficeOutbound } from "@/lib/onlyoffice-protocol";
import { getNativeSession, nativeSessionIsLive } from "@/db/native-editor-repository";
import { officeStorage, readOfficeVersion } from "@/db/office-repository";
import { OFFICE_MIME } from "@/lib/office-model";
type Context = { params: Promise<{ key: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const settings = requireOnlyOfficeServiceRequest(request);
    const key = assertNativeKey((await context.params).key);
    if (new URL(request.url).search || new URL(request.url).hash) throw new ApiError(400, "native_source_url_invalid", "源文件地址无效。");
    const payload = await verifyOnlyOfficeOutbound(request, settings.secret);
    if (payload.url !== request.url) throw new ApiError(403, "native_source_signature_mismatch", "取件签名与文件地址不一致。");
    const row = await getNativeSession(key);
    if (!nativeSessionIsLive(row) || row.state === "saved") throw new ApiError(410, "native_session_expired", "编辑会话已关闭或过期。");
    const { version, objectKey } = await readOfficeVersion(row.file_id, row.source_version_id, row.owner_hash);
    if (version.revision !== row.base_revision || version.sha256 !== row.source_sha256 || version.kind !== row.kind) throw new ApiError(503, "native_source_mismatch", "源文件版本校验未通过。");
    const object = await officeStorage().bucket.get(objectKey);
    if (!object || object.size !== version.size || object.customMetadata?.sha256 !== version.sha256) throw new ApiError(503, "native_source_unavailable", "源文件暂不可用。");
    const bytes = await object.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    if (digest !== version.sha256) throw new ApiError(503, "native_source_integrity", "源文件完整性检查未通过。");
    return new Response(bytes, { headers: { "content-type": OFFICE_MIME[row.kind], "content-length": String(version.size), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-office-sha256": digest } });
  } catch (error) { return apiErrorResponse(error); }
}
