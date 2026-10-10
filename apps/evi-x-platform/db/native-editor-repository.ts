import { ApiError } from "../app/api/_lib/http";
import { readOfficeFile, listOfficeVersions, officeStorage, saveOfficeVersion } from "./office-repository";
import { NATIVE_MAX_ACTIVE_SESSIONS, NATIVE_MAX_LIFETIME_SESSIONS, NATIVE_SESSION_TTL_MS, newNativeKey } from "../lib/onlyoffice-protocol";
import type { OfficeKind } from "../lib/office-model";

const NATIVE_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
type NativeRecoveryRow = {
  key: string; owner_hash: string; object_key: string; sha256: string; size: number;
  state: "reserved" | "ready"; created_at_ms: number; expires_at_ms: number | null;
};
function expectedRecoveryPrefix(owner: string, key: string) { return `native-conflicts/v1/${owner}/${key}/`; }
function validRecoveryObjectKey(row: NativeRecoveryRow): boolean {
  return row.object_key.startsWith(expectedRecoveryPrefix(row.owner_hash, row.key)) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.object_key.slice(expectedRecoveryPrefix(row.owner_hash, row.key).length));
}

async function cleanupExpiredNativeRecoveries(owner: string): Promise<void> {
  const { db, bucket } = officeStorage();
  const now = Date.now();
  const expired = await db.prepare("SELECT * FROM native_editor_recoveries WHERE owner_hash=? AND expires_at_ms IS NOT NULL AND expires_at_ms<=? LIMIT 20")
    .bind(owner, now).all<NativeRecoveryRow>();
  for (const row of expired.results) {
    if (!validRecoveryObjectKey(row)) continue;
    try {
      // Only our own exact, owner/session-scoped recovery key may be deleted;
      // never touch a committed Office version object.
      await bucket.delete(row.object_key);
      await db.prepare("DELETE FROM native_editor_recoveries WHERE key=? AND owner_hash=? AND object_key=? AND expires_at_ms<=?")
        .bind(row.key, owner, row.object_key, now).run();
    } catch { /* Keep the capacity reservation until exact-key cleanup succeeds. */ }
  }
}

export type NativeSessionRow = {
  key: string;
  owner_hash: string;
  file_id: string;
  source_version_id: string;
  source_sha256: string;
  filename: string;
  kind: OfficeKind;
  base_revision: number;
  save_version_id: string;
  state: "open" | "closing" | "saving" | "saved" | "conflict" | "error";
  state_changed_at_ms: number | null;
  save_sha256: string | null;
  saved_revision: number | null;
  created_at_ms: number;
  expires_at_ms: number;
};

export async function createNativeSession(owner: string, fileId: string, revision: number): Promise<NativeSessionRow> {
  await cleanupExpiredNativeRecoveries(owner);
  const file = await readOfficeFile(fileId, owner);
  if (file.revision !== revision) throw new ApiError(409, "native_revision_conflict", "原文件已有新版本，请刷新后重新打开。");
  if (revision >= 20) throw new ApiError(409, "native_version_limit", "该文件已有 20 个版本，不能继续原位编辑；请下载并另存为新文件。");
  const source = (await listOfficeVersions(fileId, owner)).find(version => version.revision === revision);
  if (!source) throw new ApiError(503, "native_source_missing", "当前原文件版本不可用。");
  const { db } = officeStorage();
  const now = Date.now();
  const key = newNativeKey();
  const saveVersionId = crypto.randomUUID();
  const created = await db.prepare(`INSERT INTO native_editor_sessions
      (key,owner_hash,file_id,source_version_id,source_sha256,filename,kind,base_revision,save_version_id,state,created_at_ms,expires_at_ms)
      SELECT ?,?,?,?,?,?,?,?,?, 'open',?,? FROM office_files f
      JOIN office_file_versions v ON v.file_id=f.id AND v.revision=f.revision
      WHERE f.id=? AND f.owner_hash=? AND f.revision=? AND v.id=? AND v.sha256=?
      AND (SELECT COUNT(*) FROM native_editor_sessions s LEFT JOIN native_editor_recoveries r ON r.key=s.key
        WHERE s.owner_hash=? AND ((s.state IN ('open','closing','saving','error') AND s.expires_at_ms>?) OR r.key IS NOT NULL))<?
      AND (SELECT COUNT(*) FROM native_editor_sessions WHERE owner_hash=?)<?
      RETURNING key`)
    .bind(key, owner, fileId, source.id, source.sha256, source.filename, source.kind, revision, saveVersionId, now, now + NATIVE_SESSION_TTL_MS,
      fileId, owner, revision, source.id, source.sha256, owner, now, NATIVE_MAX_ACTIVE_SESSIONS, owner, NATIVE_MAX_LIFETIME_SESSIONS)
    .first<{ key: string }>();
  if (!created) throw new ApiError(409, "native_session_conflict", "当前文件版本已变化，或编辑会话已达容量限制；请刷新后重试。");
  return getNativeSession(key);
}

export async function getNativeSession(key: string): Promise<NativeSessionRow> {
  const row = await officeStorage().db.prepare("SELECT * FROM native_editor_sessions WHERE key=?").bind(key).first<NativeSessionRow>();
  if (!row) throw new ApiError(404, "native_session_not_found", "编辑会话不存在。");
  return row;
}
export async function getOwnedNativeSession(key: string, owner: string): Promise<NativeSessionRow> {
  const row = await officeStorage().db.prepare("SELECT * FROM native_editor_sessions WHERE key=? AND owner_hash=?").bind(key, owner).first<NativeSessionRow>();
  if (!row) throw new ApiError(404, "native_session_not_found", "编辑会话不存在或无权访问。");
  return row;
}
export function nativeSessionIsLive(row: NativeSessionRow): boolean { return row.expires_at_ms > Date.now(); }
// A close-without-changes notice may overtake an in-flight final-save callback.
// Keep it provisional briefly; an authenticated status=2 always takes priority.
const NATIVE_CLOSE_SETTLE_MS = 20_000;
const NATIVE_SAVE_SETTLE_MS = 120_000;
export function publicNativeState(row: NativeSessionRow): "open" | "closed" | "saved" | "conflict" | "error" {
  if (!nativeSessionIsLive(row)) return "error";
  if (row.state === "closing") return row.state_changed_at_ms !== null && Date.now() - row.state_changed_at_ms >= NATIVE_CLOSE_SETTLE_MS ? "closed" : "open";
  if (row.state === "saving") return row.state_changed_at_ms !== null && Date.now() - row.state_changed_at_ms >= NATIVE_SAVE_SETTLE_MS ? "error" : "open";
  return row.state;
}
export async function markNativeState(key: string, state: "open" | "closed" | "error" | "conflict") {
  const { db } = officeStorage();
  if (state === "open") {
    await db.prepare("UPDATE native_editor_sessions SET state='open',state_changed_at_ms=NULL WHERE key=? AND state='closing' AND expires_at_ms>?").bind(key, Date.now()).run();
  } else if (state === "closed") {
    const now = Date.now();
    await db.prepare("UPDATE native_editor_sessions SET state='closing',state_changed_at_ms=? WHERE key=? AND state IN ('open','error') AND expires_at_ms>?").bind(now, key, now).run();
  } else {
    await db.prepare("UPDATE native_editor_sessions SET state=?,state_changed_at_ms=NULL WHERE key=? AND state IN ('open','closing','saving','error') AND expires_at_ms>?").bind(state, key, Date.now()).run();
  }
}
export async function markNativeSaving(key: string): Promise<NativeSessionRow> {
  const { db } = officeStorage();
  const now = Date.now();
  await db.prepare("UPDATE native_editor_sessions SET state='saving',state_changed_at_ms=? WHERE key=? AND state IN ('open','closing','saving','error','conflict') AND expires_at_ms>?")
    .bind(now, key, now).run();
  const row = await getNativeSession(key);
  if (!nativeSessionIsLive(row)) throw new ApiError(410, "native_session_expired", "编辑会话已过期，原文件未覆盖。");
  return row;
}
export type NativeRecoverySummary = {
  key: string; fileId: string; filename: string; kind: OfficeKind; sha256: string;
  size: number; expiresAt: string | null; recoveryUrl: string;
};
function recoverySummary(row: NativeRecoveryRow & { file_id: string; filename: string; kind: OfficeKind }): NativeRecoverySummary {
  return { key: row.key, fileId: row.file_id, filename: row.filename, kind: row.kind,
    sha256: row.sha256, size: row.size, expiresAt: row.expires_at_ms === null ? null : new Date(row.expires_at_ms).toISOString(),
    recoveryUrl: `/api/drafts/native/sessions/${row.key}/recovery` };
}
export async function getOwnedNativeRecovery(key: string, owner: string): Promise<NativeRecoverySummary & { objectKey: string }> {
  const row = await officeStorage().db.prepare(`SELECT r.*,s.file_id,s.filename,s.kind FROM native_editor_recoveries r
    JOIN native_editor_sessions s ON s.key=r.key WHERE r.key=? AND r.owner_hash=? AND s.owner_hash=? AND r.state='ready' AND (r.expires_at_ms IS NULL OR r.expires_at_ms>?)`)
    .bind(key, owner, owner, Date.now()).first<NativeRecoveryRow & { file_id: string; filename: string; kind: OfficeKind }>();
  if (!row || !validRecoveryObjectKey(row)) throw new ApiError(404, "native_recovery_not_found", "冲突编辑副本不存在、已过期或无权访问。");
  return { ...recoverySummary(row), objectKey: row.object_key };
}
export async function listOwnedNativeRecoveries(owner: string): Promise<NativeRecoverySummary[]> {
  const result = await officeStorage().db.prepare(`SELECT r.*,s.file_id,s.filename,s.kind FROM native_editor_recoveries r
    JOIN native_editor_sessions s ON s.key=r.key WHERE r.owner_hash=? AND s.owner_hash=? AND r.state='ready' AND (r.expires_at_ms IS NULL OR r.expires_at_ms>?)
    ORDER BY r.created_at_ms DESC LIMIT ?`).bind(owner, owner, Date.now(), NATIVE_MAX_ACTIVE_SESSIONS)
    .all<NativeRecoveryRow & { file_id: string; filename: string; kind: OfficeKind }>();
  return result.results.filter(validRecoveryObjectKey).map(recoverySummary);
}
async function preserveNativeConflict(row: NativeSessionRow, bytes: Uint8Array, sha256: string): Promise<void> {
  const { db, bucket } = officeStorage();
  const now = Date.now();
  if (!nativeSessionIsLive(row)) throw new ApiError(410, "native_session_expired", "编辑会话已过期，不能安全保存冲突副本。");
  const fresh = await getNativeSession(row.key);
  if (fresh.state === "saved") throw new ApiError(409, "native_save_conflict", "此编辑会话已保存不同内容，不能再覆盖。");
  const newKey = expectedRecoveryPrefix(row.owner_hash, row.key) + crypto.randomUUID();
  await db.prepare(`INSERT INTO native_editor_recoveries(key,owner_hash,object_key,sha256,size,state,created_at_ms,expires_at_ms)
    SELECT key,owner_hash,?,?,?,'reserved',?,? FROM native_editor_sessions
    WHERE key=? AND owner_hash=? AND expires_at_ms>? AND state IN ('open','closing','saving','error','conflict')
    ON CONFLICT(key) DO NOTHING`)
    .bind(newKey, sha256, bytes.byteLength, now, now + NATIVE_RECOVERY_TTL_MS, row.key, row.owner_hash, now).run();
  const reserved = await db.prepare("SELECT * FROM native_editor_recoveries WHERE key=? AND owner_hash=?")
    .bind(row.key, row.owner_hash).first<NativeRecoveryRow>();
  if (!reserved || !validRecoveryObjectKey(reserved) || reserved.sha256 !== sha256 || reserved.size !== bytes.byteLength || (reserved.expires_at_ms !== null && reserved.expires_at_ms <= Date.now())) {
    throw new ApiError(409, "native_recovery_reservation_conflict", "此会话的冲突副本标识已对应其他内容；未覆盖任何文件。");
  }
  let object = await bucket.head(reserved.object_key);
  if (!object) {
    await bucket.put(reserved.object_key, bytes, { sha256, onlyIf: { etagDoesNotMatch: "*" },
      customMetadata: { sha256 }, httpMetadata: { contentType: "application/octet-stream", cacheControl: "no-store" } });
    object = await bucket.head(reserved.object_key);
  }
  if (!object || object.size !== bytes.byteLength || object.customMetadata?.sha256 !== sha256) {
    throw new ApiError(503, "native_recovery_write_uncertain", "冲突编辑副本尚未完成完整性确认；请保留页面并重试。");
  }
  try {
    await db.batch([
      db.prepare("UPDATE native_editor_recoveries SET state='ready' WHERE key=? AND owner_hash=? AND object_key=? AND sha256=? AND size=?")
        .bind(row.key, row.owner_hash, reserved.object_key, sha256, bytes.byteLength),
      db.prepare("UPDATE native_editor_sessions SET state='conflict',state_changed_at_ms=NULL WHERE key=? AND owner_hash=? AND state IN ('open','closing','saving','error','conflict')")
        .bind(row.key, row.owner_hash),
    ]);
  } catch { throw new ApiError(503, "native_recovery_commit_uncertain", "冲突编辑副本可能已写入；请保留页面并使用同一会话重试。"); }
  const confirmed = await getOwnedNativeRecovery(row.key, row.owner_hash);
  if (confirmed.sha256 !== sha256 || confirmed.size !== bytes.byteLength || confirmed.objectKey !== reserved.object_key) {
    throw new ApiError(503, "native_recovery_commit_uncertain", "冲突编辑副本确认未完成；请保留页面并重试。");
  }
}
export async function commitNativeVersion(row: NativeSessionRow, bytes: Uint8Array, sha256: string) {
  if (!nativeSessionIsLive(row)) throw new ApiError(410, "native_session_expired", "编辑会话已过期，原文件未覆盖。");
  // A status=4 notice can race ahead of the authenticated final status=2
  // callback (including while R2 writes). A final saved binary takes priority
  // over "closed without changes"; fixed version ID and CAS still prevent an
  // unrelated/stale callback from overwriting another version.
  if (row.state === "saved" && row.save_sha256 !== sha256) throw new ApiError(409, "native_save_conflict", "此编辑会话已保存不同内容，原文件未覆盖。");
  const { db } = officeStorage();
  try {
    const saved = await saveOfficeVersion({ fileId: row.file_id, versionId: row.save_version_id, owner: row.owner_hash,
      baseRevision: row.base_revision, filename: row.filename, kind: row.kind, label: "ONLYOFFICE 编辑保存", bytes, sha256 });
    const updated = await db.prepare(`UPDATE native_editor_sessions SET state='saved',state_changed_at_ms=NULL,save_sha256=?,saved_revision=?
      WHERE key=? AND owner_hash=? AND (state IN ('open','closing','saving','error','conflict') OR (state='saved' AND save_sha256=?))
      RETURNING key`).bind(sha256, saved.version.revision, row.key, row.owner_hash, sha256).first();
    if (!updated) throw new ApiError(503, "native_session_commit_uncertain", "文件版本已保存，但编辑会话确认未完成；请保留页面并重试。");
    return saved.version.revision;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await preserveNativeConflict(row, bytes, sha256);
      throw new ApiError(409, "native_revision_conflict_recoverable", "原文件已有新版本，编辑内容已保留为可下载的冲突副本，未覆盖原件。");
    }
    if (error instanceof ApiError && error.status >= 500) await markNativeState(row.key, "error");
    throw error;
  }
}
