import { env } from "cloudflare:workers";
import { ApiError } from "../app/api/_lib/http";
import { DRAFT_VERSION_LIMIT, parseEditorContent, type Draft, type DraftSummary, type DraftVersion, type DraftVersionSummary, type EditorContent } from "../lib/editor-model";

type Row = { id: string; title: string; revision: number; updated_at: string; content: string };
function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new ApiError(503, "editor_storage_unavailable", "草稿存储未连接。当前内容仍可编辑和导出，请暂勿关闭页面。");
  return db;
}
function summary(row: Row): DraftSummary { return { id: row.id, title: row.title, revision: row.revision, updatedAt: row.updated_at }; }
function draft(row: Row): Draft { return { ...summary(row), content: parseEditorContent(JSON.parse(row.content)) }; }
export async function listDrafts(owner: string): Promise<DraftSummary[]> {
  const result = await database().prepare("SELECT id,title,revision,updated_at FROM editor_drafts WHERE owner_hash=? ORDER BY updated_at DESC,id DESC LIMIT 40").bind(owner).all<Row>();
  return result.results.map(summary);
}
export async function readDraft(id: string, owner: string): Promise<Draft> {
  const row = await database().prepare("SELECT id,title,content,revision,updated_at FROM editor_drafts WHERE id=? AND owner_hash=?").bind(id, owner).first<Row>();
  if (!row) throw new ApiError(404, "draft_not_found", "草稿不存在或无权访问。");
  return draft(row);
}
export async function createDraft(id: string, owner: string, content: EditorContent): Promise<Draft> {
  const timestamp = new Date().toISOString();
  const row = await database().prepare("INSERT INTO editor_drafts(id,owner_hash,title,content,revision,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM editor_drafts WHERE owner_hash=?)<40 ON CONFLICT(id) DO NOTHING RETURNING id,title,content,revision,updated_at")
    .bind(id, owner, content.title, JSON.stringify(content), timestamp, timestamp, owner).first<Row>();
  if (row) return draft(row);
  // Client-generated id makes a retry after a dropped response idempotent.
  try {
    const existing = await readDraft(id, owner);
    if (existing.revision !== 1) throw new ApiError(409, "draft_conflict", "这个草稿在首次保存后已有更新。已暂停保存，请导出当前内容或另存副本。");
    return existing;
  } catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
  throw new ApiError(409, "draft_limit", "草稿库已满（最多 40 个），或草稿标识已被占用。请导出后继续编辑现有草稿。");
}
export async function updateDraft(id: string, owner: string, revision: number, content: EditorContent): Promise<Draft> {
  const row = await database().prepare("UPDATE editor_drafts SET title=?,content=?,revision=revision+1,updated_at=? WHERE id=? AND owner_hash=? AND revision=? RETURNING id,title,content,revision,updated_at")
    .bind(content.title, JSON.stringify(content), new Date().toISOString(), id, owner, revision).first<Row>();
  if (row) return draft(row);
  await readDraft(id, owner);
  throw new ApiError(409, "draft_conflict", "另一个页面已更新此草稿。为避免覆盖，已暂停自动保存。请先导出当前内容，或另存副本。");
}

type VersionRow = { id: string; draft_id: string; label: string; source_revision: number; created_at: string; content: string };
function versionSummary(row: VersionRow): DraftVersionSummary {
  return { id: row.id, draftId: row.draft_id, label: row.label, sourceRevision: row.source_revision, createdAt: row.created_at };
}
async function ownedVersion(draftId: string, versionId: string, owner: string) {
  return database().prepare("SELECT v.id,v.draft_id,v.label,v.source_revision,v.created_at,v.content FROM editor_versions v JOIN editor_drafts d ON d.id=v.draft_id WHERE v.id=? AND v.draft_id=? AND d.owner_hash=?")
    .bind(versionId, draftId, owner).first<VersionRow>();
}
export async function listDraftVersions(draftId: string, owner: string): Promise<DraftVersionSummary[]> {
  // Fail closed instead of giving the impression an inaccessible draft has no versions.
  await readDraft(draftId, owner);
  const result = await database().prepare("SELECT v.id,v.draft_id,v.label,v.source_revision,v.created_at FROM editor_versions v JOIN editor_drafts d ON d.id=v.draft_id WHERE v.draft_id=? AND d.owner_hash=? ORDER BY v.created_at DESC,v.id DESC LIMIT ?")
    .bind(draftId, owner, DRAFT_VERSION_LIMIT).all<VersionRow>();
  return result.results.map(versionSummary);
}
export async function readDraftVersion(draftId: string, versionId: string, owner: string): Promise<DraftVersion> {
  const row = await ownedVersion(draftId, versionId, owner);
  if (!row) throw new ApiError(404, "version_not_found", "版本不存在或无权访问。");
  return { ...versionSummary(row), content: parseEditorContent(JSON.parse(row.content)) };
}
export async function createDraftVersion(draftId: string, versionId: string, owner: string, label: string, revision: number): Promise<DraftVersionSummary> {
  const acceptRetry = (row: VersionRow) => {
    if (row.label !== label || row.source_revision !== revision) throw new ApiError(409, "version_conflict", "这个版本标识已用于不同的内容，未修改原版本。请刷新版本列表后重试。");
    return versionSummary(row);
  };
  const existing = await ownedVersion(draftId, versionId, owner);
  if (existing) return acceptRetry(existing);
  // One conditional INSERT captures content and checks revision/capacity atomically.
  // A preceding application read would race an autosave or another browser tab.
  const row = await database().prepare("INSERT INTO editor_versions(id,draft_id,label,source_revision,content,created_at) SELECT ?,d.id,?,d.revision,d.content,? FROM editor_drafts d WHERE d.id=? AND d.owner_hash=? AND d.revision=? AND (SELECT COUNT(*) FROM editor_versions WHERE draft_id=d.id)<? ON CONFLICT(id) DO NOTHING RETURNING id,draft_id,label,source_revision,created_at")
    .bind(versionId, label, new Date().toISOString(), draftId, owner, revision, DRAFT_VERSION_LIMIT).first<VersionRow>();
  if (row) return versionSummary(row);
  const racedRetry = await ownedVersion(draftId, versionId, owner);
  if (racedRetry) return acceptRetry(racedRetry);
  const current = await readDraft(draftId, owner);
  if (current.revision !== revision) throw new ApiError(409, "draft_conflict", "草稿已被更新，未保存过时版本。请先确认最新草稿，或把当前内容另存副本。");
  throw new ApiError(409, "version_limit", `每个草稿最多保留 ${DRAFT_VERSION_LIMIT} 个命名版本，或此版本标识已被占用。已有版本不会被删除；可备份后另存新草稿。`);
}
