import { parseTopicDraft, parseTopicProfile } from '../../lib/topic-advisor/parse.ts';
import { rejectDuplicateMembers } from '../../lib/questionnaire.ts';
import type { TopicDraft, TopicProfile } from '../../lib/topic-advisor/types.ts';

export const MAX_TOPIC_BACKUP_BYTES = 128 * 1024;
export type TopicBackup = {
  kind: 'evix-topic-advisor'; schemaVersion: 1; ownerId: string; exportedAt: string;
  contentVersion: string; modelVersion: string; draft: TopicDraft;
  analysisProfile: TopicProfile | null; compareIds: string[]; selectedId: string;
};
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function boundedText(value: unknown, limit: number, label: string): string {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) throw Error(`${label}无效。请重新导出草稿。`);
  return value;
}
/** Local backup data remains account-bound. Recomputed results are never accepted from the file. */
export function readTopicBackup(raw: string, ownerId: string): TopicBackup {
  if (!ownerId) throw Error('请先登录，再打开本账号的草稿。');
  if (new TextEncoder().encode(raw).byteLength > MAX_TOPIC_BACKUP_BYTES) throw Error('草稿文件不能超过 128 KB。');
  let input: unknown;
  try { rejectDuplicateMembers(raw); input = JSON.parse(raw); } catch { throw Error('草稿文件不是有效的 JSON，请重新导出后打开。'); }
  if (!object(input) || input.kind !== 'evix-topic-advisor' || input.schemaVersion !== 1 || input.ownerId !== ownerId) throw Error('这不是本账号导出的选题草稿，无法打开。');
  const allowed = ['kind', 'schemaVersion', 'ownerId', 'exportedAt', 'contentVersion', 'modelVersion', 'draft', 'analysisProfile', 'compareIds', 'selectedId'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw Error('草稿包含不支持的字段，请重新导出。');
  const selectedId = boundedText(input.selectedId, 100, '所选题目');
  if (!Array.isArray(input.compareIds) || input.compareIds.length > 3) throw Error('草稿最多可比较三个方向。');
  const compareIds = input.compareIds.map(value => boundedText(value, 100, '比较题目'));
  if (new Set(compareIds).size !== compareIds.length) throw Error('草稿的比较题目重复。');
  const exportedAt = boundedText(input.exportedAt, 40, '导出日期');
  if (!Number.isFinite(Date.parse(exportedAt))) throw Error('草稿的导出日期无效。');
  return {
    kind: 'evix-topic-advisor', schemaVersion: 1, ownerId, exportedAt,
    contentVersion: boundedText(input.contentVersion ?? '', 100, '资料版本'),
    modelVersion: boundedText(input.modelVersion ?? '', 100, '模型版本'),
    draft: parseTopicDraft(input.draft), analysisProfile: input.analysisProfile == null ? null : parseTopicProfile(input.analysisProfile), compareIds, selectedId,
  };
}
