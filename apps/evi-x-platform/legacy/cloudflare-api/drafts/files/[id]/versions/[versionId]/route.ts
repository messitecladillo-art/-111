import { ApiError, apiErrorResponse } from "../../../../../_lib/http";
import { editorOwner } from "../../../../../_lib/editor-auth";
import { validateProjectId } from "../../../../../_lib/security";
import { officeStorage, readOfficeVersion } from "@/db/office-repository";
import { OFFICE_MIME, officeDisposition } from "@/lib/office-model";
type Context = { params: Promise<{ id: string; versionId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id, versionId } = await context.params;
    const { version, objectKey } = await readOfficeVersion(validateProjectId(id), validateProjectId(versionId), await editorOwner(request));
    const object = await officeStorage().bucket.get(objectKey);
    if (!object || object.size !== version.size || object.customMetadata?.sha256 !== version.sha256) throw new ApiError(503, "office_binary_unavailable", "文件内容暂不可用，未返回其他版本或空文件。");
    const bytes = await object.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
    if (digest !== version.sha256) throw new ApiError(503, "office_binary_integrity", "文件完整性检查失败，请保留本地原件并联系维护者。");
    return new Response(bytes, { headers: { "content-type": OFFICE_MIME[version.kind], "content-disposition": officeDisposition(version.filename, version.kind), "content-length": String(version.size), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-office-sha256": version.sha256 } });
  } catch (error) { return apiErrorResponse(error); }
}
