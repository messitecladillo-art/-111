import { ApiError } from "../../_lib/http";
import { assertEditorOrigin, editorOwner } from "../../_lib/editor-auth";
import { validateProjectId } from "../../_lib/security";
import { OFFICE_LIMITS, parseOfficeFilename, parseOfficeLabel } from "@/lib/office-model";
import { inspectOfficePackage } from "@/lib/office-package";
import { officeStorage, saveOfficeVersion } from "@/db/office-repository";

function decodedHeader(request: Request, key: string): string {
  const value = request.headers.get(key);
  if (!value || value.length > 2200) throw new ApiError(400, "office_invalid_metadata", "缺少有效文件名或版本说明。");
  try { return decodeURIComponent(value); } catch { throw new ApiError(400, "office_invalid_metadata", "文件名或版本说明编码不正确。"); }
}
async function readBytes(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/octet-stream") throw new ApiError(415, "office_invalid_content_type", "上传内容须为原始 Office 文件。");
  if (request.headers.has("content-encoding")) throw new ApiError(415, "office_encoded_body", "请直接上传未经过 HTTP 压缩的文件。");
  const advertised = request.headers.get("content-length");
  if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > OFFICE_LIMITS.bytes)) throw new ApiError(413, "office_file_too_large", "文件不得超过 20 MiB。");
  if (!request.body) throw new ApiError(400, "office_empty_file", "请选择有效文件。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > OFFICE_LIMITS.bytes) { await reader.cancel("office_file_too_large"); throw new ApiError(413, "office_file_too_large", "文件不得超过 20 MiB。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new ApiError(400, "office_empty_file", "不能上传空文件。");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function uploadOffice(request: Request, existingFileId?: string) {
  assertEditorOrigin(request);
  const owner = await editorOwner(request);
  if (!request.headers.get("x-editor-scope")) throw new ApiError(409, "office_scope_required", "请先连接文件库，再确认保存身份。");
  officeStorage();
  const fileId = validateProjectId(existingFileId ?? request.headers.get("x-office-file-id") ?? "");
  const versionId = validateProjectId(request.headers.get("x-office-version-id") ?? "");
  let baseRevision = 0;
  if (existingFileId) {
    const raw = request.headers.get("x-office-base-revision") ?? "";
    if (!/^[1-9]\d?$/.test(raw) || Number(raw) > OFFICE_LIMITS.versions) throw new ApiError(400, "office_invalid_revision", "缺少有效的文件版本号。");
    baseRevision = Number(raw);
  } else if (request.headers.has("x-office-base-revision")) throw new ApiError(400, "office_invalid_revision", "新文件不能携带已有版本号。");
  let metadata; let label;
  try { metadata = parseOfficeFilename(decodedHeader(request, "x-office-name")); label = parseOfficeLabel(decodedHeader(request, "x-office-label")); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "office_invalid_metadata", error instanceof Error ? error.message : "文件信息不正确。"); }
  const bytes = await readBytes(request);
  try { inspectOfficePackage(bytes, metadata.kind); }
  catch (error) { throw new ApiError(400, "office_invalid_package", error instanceof Error ? error.message : "文件结构不正确。"); }
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  return saveOfficeVersion({ fileId, versionId, owner, baseRevision, ...metadata, label, bytes, sha256 });
}
