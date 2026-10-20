import { env } from "cloudflare:workers";
import { ApiError } from "../app/api/_lib/http";
import { OFFICE_LIMITS, type OfficeFileSummary, type OfficeKind, type OfficeVersion } from "../lib/office-model";

type Bindings = { DB?: D1Database; OFFICE_FILES?: R2Bucket; EVI_X_OFFICE_STORAGE_MODE?: string };
export function officeStorage() {
  const bindings = env as unknown as Bindings;
  if (!bindings.DB || !bindings.OFFICE_FILES) throw new ApiError(503, "office_storage_unavailable", "真实文件库尚未连接。原有文本草稿不受影响；请选择已配置的本机文件服务后重试。");
  return { db: bindings.DB, bucket: bindings.OFFICE_FILES, mode: bindings.EVI_X_OFFICE_STORAGE_MODE === "local" ? "local-r2" as const : "r2" as const };
}
type VersionRow = { id: string; file_id: string; revision: number; filename: string; kind: OfficeKind; size: number; sha256: string; label: string; object_key: string; created_at: string };
const versionColumns = "v.id,v.file_id,v.revision,v.filename,f.kind,v.size,v.sha256,v.label,v.object_key,v.created_at";
function publicVersion(row: VersionRow): OfficeVersion {
  return { id: row.id, fileId: row.file_id, revision: row.revision, filename: row.filename, kind: row.kind, size: row.size, sha256: row.sha256, label: row.label, createdAt: row.created_at };
}
function fileSummary(row: VersionRow): OfficeFileSummary {
  return { id: row.file_id, filename: row.filename, kind: row.kind, revision: row.revision, size: row.size, sha256: row.sha256, updatedAt: row.created_at };
}
export async function listOfficeFiles(owner: string): Promise<OfficeFileSummary[]> {
  const { db } = officeStorage();
  const result = await db.prepare(`SELECT ${versionColumns} FROM office_files f JOIN office_file_versions v ON v.file_id=f.id AND v.revision=f.revision WHERE f.owner_hash=? ORDER BY f.updated_at DESC,f.id DESC LIMIT ?`).bind(owner, OFFICE_LIMITS.files).all<VersionRow>();
  return result.results.map(fileSummary);
}
export async function readOfficeFile(id: string, owner: string): Promise<OfficeFileSummary> {
  const row = await officeStorage().db.prepare(`SELECT ${versionColumns} FROM office_files f JOIN office_file_versions v ON v.file_id=f.id AND v.revision=f.revision WHERE f.id=? AND f.owner_hash=?`).bind(id, owner).first<VersionRow>();
  if (!row) throw new ApiError(404, "office_file_not_found", "文件不存在或无权访问。");
  return fileSummary(row);
}
export async function listOfficeVersions(id: string, owner: string): Promise<OfficeVersion[]> {
  await readOfficeFile(id, owner);
  const result = await officeStorage().db.prepare(`SELECT ${versionColumns} FROM office_file_versions v JOIN office_files f ON f.id=v.file_id WHERE f.id=? AND f.owner_hash=? ORDER BY v.revision DESC LIMIT ?`).bind(id, owner, OFFICE_LIMITS.versions).all<VersionRow>();
  return result.results.map(publicVersion);
}
async function versionRow(id: string, versionId: string, owner: string) {
  return officeStorage().db.prepare(`SELECT ${versionColumns} FROM office_file_versions v JOIN office_files f ON f.id=v.file_id WHERE f.id=? AND v.id=? AND f.owner_hash=?`).bind(id, versionId, owner).first<VersionRow>();
}
export async function readOfficeVersion(id: string, versionId: string, owner: string) {
  const row = await versionRow(id, versionId, owner);
  if (!row) throw new ApiError(404, "office_version_not_found", "版本不存在或无权访问。");
  return { version: publicVersion(row), objectKey: row.object_key };
}

type Upload = { fileId: string; versionId: string; owner: string; baseRevision: number; filename: string; kind: OfficeKind; label: string; bytes: Uint8Array; sha256: string };
export async function saveOfficeVersion(input: Upload) {
  const { db, bucket } = officeStorage();
  const { fileId, versionId, owner, baseRevision, filename, kind, label, bytes, sha256 } = input;
  const acceptRetry = async (row: VersionRow) => {
    if (row.revision !== baseRevision + 1 || row.sha256 !== sha256 || row.filename !== filename || row.label !== label || row.kind !== kind || row.size !== bytes.byteLength) throw new ApiError(409, "office_operation_conflict", "该保存标识已对应其他内容，原版本未被修改。请刷新后重新选择文件。");
    const object = await bucket.head(row.object_key);
    if (!object || object.size !== row.size || object.customMetadata?.sha256 !== row.sha256) throw new ApiError(503, "office_binary_unavailable", "版本记录存在，但文件内容校验未通过；未报告保存成功，请保留本地文件。");
    await db.prepare("UPDATE office_upload_attempts SET status='committed' WHERE object_key=? AND owner_hash=?").bind(row.object_key, owner).run();
    return { file: await readOfficeFile(fileId, owner), version: publicVersion(row) };
  };
  const retry = await versionRow(fileId, versionId, owner);
  if (retry) return acceptRetry(retry);
  const retryOrThrow = async (error: ApiError) => {
    const racedRetry = await versionRow(fileId, versionId, owner);
    if (racedRetry) return acceptRetry(racedRetry);
    throw error;
  };
  // Cheap preflight before object I/O; the transaction repeats every race-sensitive check.
  if (baseRevision > 0) {
    const current = await readOfficeFile(fileId, owner);
    if (current.revision !== baseRevision) return retryOrThrow(new ApiError(409, "office_revision_conflict", "此文件已有新版本，未覆盖。请刷新后检查再上传。"));
    if (current.kind !== kind) throw new ApiError(400, "office_kind_mismatch", "同一文件的版本必须保持 DOCX 或 PPTX 类型一致。");
    if (baseRevision >= OFFICE_LIMITS.versions) return retryOrThrow(new ApiError(409, "office_version_limit", "此文件已达 20 个版本，请下载备份后另存为新文件。"));
  } else {
    const occupied = await db.prepare("SELECT id FROM office_files WHERE id=?").bind(fileId).first();
    const quota = await db.prepare("SELECT COUNT(*) AS count FROM office_files WHERE owner_hash=?").bind(owner).first<{ count: number }>();
    if (occupied || Number(quota?.count) >= OFFICE_LIMITS.files) return retryOrThrow(new ApiError(409, "office_file_limit", "文件库已达 20 个文件，或保存标识已被占用。原文件未被改变。"));
  }
  const occupiedVersion = await db.prepare("SELECT id FROM office_file_versions WHERE id=?").bind(versionId).first();
  if (occupiedVersion) return retryOrThrow(new ApiError(409, "office_operation_conflict", "保存标识已被占用，请重新选择文件后重试。"));
  // Every attempt has a distinct object key: an unsuccessful racer can never delete the winner.
  const objectKey = `office/v1/${owner}/${fileId}/${versionId}/${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const reservation = await db.prepare("INSERT INTO office_upload_attempts(object_key,owner_hash,status,created_at) SELECT ?,?,'pending',? WHERE (SELECT COUNT(*) FROM office_upload_attempts WHERE owner_hash=? AND status='pending')<4 AND (SELECT COUNT(*) FROM office_upload_attempts WHERE owner_hash=?)<1024 RETURNING object_key").bind(objectKey, owner, timestamp, owner, owner).first();
  if (!reservation) return retryOrThrow(new ApiError(503, "office_pending_limit", "已有 4 次保存等待核对，或已达到 1024 次文件存储操作上限。请由维护者核对文件状态；为保护原件，已暂停新的上传。"));
  const stored = await bucket.put(objectKey, bytes, { sha256, onlyIf: { etagDoesNotMatch: "*" }, customMetadata: { sha256 }, httpMetadata: { contentType: "application/octet-stream", cacheControl: "no-store" } });
  if (!stored || stored.size !== bytes.byteLength) throw new ApiError(503, "office_binary_write_failed", "文件内容尚未完整保存，请保留本地原件并重试。");
  const statements: D1PreparedStatement[] = [];
  if (baseRevision === 0) statements.push(db.prepare("INSERT INTO office_files(id,owner_hash,kind,revision,created_at,updated_at) SELECT ?,?,?,0,?,? WHERE (SELECT COUNT(*) FROM office_files WHERE owner_hash=?)<? AND NOT EXISTS(SELECT 1 FROM office_file_versions WHERE id=?) ON CONFLICT(id) DO NOTHING").bind(fileId, owner, kind, timestamp, timestamp, owner, OFFICE_LIMITS.files, versionId));
  statements.push(db.prepare("INSERT INTO office_file_versions(id,file_id,revision,filename,label,size,sha256,object_key,created_at) SELECT ?,f.id,?,?,?,?,?,?,? FROM office_files f WHERE f.id=? AND f.owner_hash=? AND f.kind=? AND f.revision=? AND f.revision<? ON CONFLICT DO NOTHING").bind(versionId, baseRevision + 1, filename, label, bytes.byteLength, sha256, objectKey, timestamp, fileId, owner, kind, baseRevision, OFFICE_LIMITS.versions));
  statements.push(db.prepare("UPDATE office_files SET revision=?,updated_at=? WHERE id=? AND owner_hash=? AND revision=? AND EXISTS(SELECT 1 FROM office_file_versions WHERE id=? AND file_id=? AND revision=? AND object_key=?)").bind(baseRevision + 1, timestamp, fileId, owner, baseRevision, versionId, fileId, baseRevision + 1, objectKey));
  try {
    // D1 batch is transactional. No metadata is published before the binary put succeeds.
    await db.batch(statements);
  } catch {
    // A timeout may follow a successful commit: retain the new object for safe retry/reconciliation.
    // Never remove a potentially committed file, nor claim success on an ambiguous outcome.
    throw new ApiError(503, "office_commit_uncertain", "保存结果尚未确认。请保留本地文件，使用同一保存操作重试，不要关闭页面。");
  }
  const committed = await versionRow(fileId, versionId, owner);
  if (committed?.object_key !== objectKey) {
    // Only this newly generated, provably unreferenced attempt object is removed.
    try {
      await bucket.delete(objectKey);
      await db.prepare("UPDATE office_upload_attempts SET status='discarded' WHERE object_key=? AND owner_hash=?").bind(objectKey, owner).run();
    } catch { /* Keep the pending reservation for manual reconciliation, with its quota slot. */ }
  }
  if (committed) return acceptRetry(committed);
  throw new ApiError(409, "office_revision_conflict", "保存时文件版本或容量已变化，原文件未覆盖。请刷新后检查再上传。");
}
