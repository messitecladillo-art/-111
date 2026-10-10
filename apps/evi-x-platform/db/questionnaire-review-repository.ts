import { env } from 'cloudflare:workers';
import { ApiError } from '../app/api/_lib/http';
import { sha256Hex } from '../app/api/_lib/security';
import { readQuestionnaireVersion } from './questionnaire-repository';
import { QUESTIONNAIRE_REVIEW_ENGINE, reviewQuestionnaire } from '../lib/questionnaire-review';
import {verifyStoredQuestionnaireReview as verifiedRecord,QUESTIONNAIRE_REVIEW_RESULT_BYTES as RESULT_BYTES,type QuestionnaireReviewRow as Row} from './questionnaire-review-integrity';

export const QUESTIONNAIRE_REVIEW_CAPACITY = 1600;
function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new ApiError(503, 'questionnaire_review_storage_unavailable', '设计检查未连接持久存储，未记录检查结果。');
  return db;
}
async function rowFor(owner: string, versionId: string): Promise<Row | null> {
  return database().prepare('SELECT * FROM questionnaire_design_reviews WHERE owner_hash=? AND version_id=? AND engine_version=?')
    .bind(owner, versionId, QUESTIONNAIRE_REVIEW_ENGINE).first<Row>();
}

/** Read-only: an absent check remains null, never implicitly executes or creates a result. */
export async function readQuestionnaireDesignReview(projectId: string, versionId: string, owner: string) {
  const { version, currentRevision } = await readQuestionnaireVersion(projectId, versionId, owner);
  const row = await rowFor(owner, versionId);
  return { review: row ? await verifiedRecord(row, version, owner) : null, currentRevision };
}

/** Explicit execution only. Does not receive or persist client-supplied findings or modified designs. */
export async function executeQuestionnaireDesignReview(projectId: string, versionId: string, expectedSha256: string, owner: string) {
  const { version, currentRevision } = await readQuestionnaireVersion(projectId, versionId, owner);
  if (version.sha256 !== expectedSha256) throw new ApiError(409, 'questionnaire_review_source_changed', '确认的问卷指纹与保存版本不一致，未执行检查。请重新读取并核对版本。');
  const prior = await rowFor(owner, versionId);
  if (prior) return { review: await verifiedRecord(prior, version, owner), currentRevision, replayed: true };
  const result = JSON.stringify(reviewQuestionnaire(version.content));
  const size = new TextEncoder().encode(result).length;
  if (size > RESULT_BYTES) throw new ApiError(409, 'questionnaire_review_result_limit', '检查结果超过记录容量，未写入部分结果；请保留问卷并联系维护者。');
  const id = crypto.randomUUID(), createdAt = new Date().toISOString(), resultHash = await sha256Hex(result);
  // Capacity and idempotency share one atomic INSERT; no parent shell or partial result.
  const inserted = await database().prepare(`INSERT INTO questionnaire_design_reviews
    (id,owner_hash,project_id,version_id,source_revision,source_sha256,engine_version,result_json,result_sha256,result_size,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM questionnaire_design_reviews WHERE owner_hash=?)<?
    ON CONFLICT DO NOTHING RETURNING *`)
    .bind(id, owner, projectId, versionId, version.revision, version.sha256, QUESTIONNAIRE_REVIEW_ENGINE, result, resultHash, size, createdAt, owner, QUESTIONNAIRE_REVIEW_CAPACITY).first<Row>();
  const saved = inserted ?? await rowFor(owner, versionId);
  if (!saved) throw new ApiError(409, 'questionnaire_review_capacity', '当前身份最多保留 1600 条设计检查；既有记录不会自动删除，已存在的同版检查仍可读取。');
  return { review: await verifiedRecord(saved, version, owner), currentRevision, replayed: !inserted };
}
