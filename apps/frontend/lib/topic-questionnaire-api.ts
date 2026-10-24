/** Pure request/receipt contract. Transport, permissions and editor epochs remain with the host. */
import { encodeTopicTransfer } from '../../../packages/evi-x-shared/src/topic-transfer.ts';
import { parseQuestionnaire, type Questionnaire } from './questionnaire.ts';
import {
  applyTopicQuestionnaire, prepareTopicQuestionnaire, topicQuestionnaireHash, verifyTopicQuestionnaireBinding,
  type TopicQuestionnaireApplication, type TopicQuestionnaireBinding, type TopicQuestionnaireMapping,
  type TopicQuestionnaireSource, type TopicQuestionnaireTarget,
} from './topic-questionnaire.ts';

export const TOPIC_TRANSFER_HASH_CONTRACT = 'evix-topic-transfer-json/1' as const;
export type TopicBindingRestoreOrigin = { questionnaireVersionId: string } | { applicationVersionId: string; phase: 'before' };
export type TopicApplyMutation = {
  kind: 'apply'; hashContract: typeof TOPIC_TRANSFER_HASH_CONTRACT; expectedBindingHash: string | null;
  source: { versionId: string; revision: number; contentHash: string; briefHash: string; expectedDecisionRevision: number };
  target: { baseVersionId: string | null; baseRevision: number; beforeContentHash: string };
  beforeDesign: Questionnaire; afterContentHash: string; proposalId: string;
  mappings: TopicQuestionnaireMapping[]; selectedChangeIds: string[];
};
export type TopicRestoreMutation = {
  kind: 'restore'; hashContract: typeof TOPIC_TRANSFER_HASH_CONTRACT;
  expectedBindingHash: string | null; origin: TopicBindingRestoreOrigin;
};
export type TopicBindingMutation = TopicApplyMutation | TopicRestoreMutation;
export type TopicBindingReceipt = {
  versionId: string; binding: TopicQuestionnaireBinding | null; bindingHash: string | null; designTransferHash: string;
};

function fail(message: string): never { throw Error(`选题关联：${message}`); }
/** Inspect before JSON serialization so getters, holes and unsupported values cannot be hidden by cloning. */
function snapshot<T>(value: T): T { encodeTopicTransfer(value); return JSON.parse(JSON.stringify(value)) as T; }
function sameSnapshot(value: unknown, frozen: unknown): boolean {
  const current = encodeTopicTransfer(value), expected = encodeTopicTransfer(frozen);
  return current.length === expected.length && current.every((byte, index) => byte === expected[index]);
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('回执格式无效。');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) fail('回执缺少字段或包含未知字段。');
  return result;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail('版本标识无效。');
  return value as string;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('内容指纹无效。');
  return value as string;
}
function maybeHash(value: unknown): string | null { return value === null ? null : hash(value); }

/** Rebuild the entire application before posting; client-side bindings are never authority on the server. */
export async function prepareTopicQuestionnaireMutation(
  application: TopicQuestionnaireApplication, source: TopicQuestionnaireSource, target: TopicQuestionnaireTarget,
): Promise<TopicApplyMutation> {
  const a = snapshot(application), s = snapshot(source), t = snapshot(target);
  const proposal = await prepareTopicQuestionnaire(s, t, a.mappings, a.beforeBinding);
  const rebuilt = await applyTopicQuestionnaire(proposal, s, t, a.provenance.changes.map(change => change.id), a.beforeBinding);
  const [actual, expected] = await Promise.all([topicQuestionnaireHash(a), topicQuestionnaireHash(rebuilt)]);
  if (actual !== expected) fail('字段提案或来源已变化，请重新预览。');
  // The host must also check account/project/edit epochs after its awaited transport.
  // No await may follow these caller-owned input checks: a final digest would reopen the race.
  if (!sameSnapshot(source, s) || !sameSnapshot(target, t) || !sameSnapshot(application, a)) fail('等待期间内容已变化，请重新预览。');
  return snapshot({ kind: 'apply', hashContract: TOPIC_TRANSFER_HASH_CONTRACT, expectedBindingHash: proposal.bindingFingerprint,
    source: { versionId: proposal.source.version.id, revision: proposal.source.version.revision, contentHash: proposal.source.version.contentHash,
      briefHash: proposal.source.briefHash, expectedDecisionRevision: s.decisionRevision },
    target: { baseVersionId: proposal.target.baseVersionId, baseRevision: proposal.target.baseRevision, beforeContentHash: proposal.target.contentHash },
    beforeDesign: rebuilt.before, afterContentHash: rebuilt.provenance.after.contentHash, proposalId: proposal.id,
    mappings: proposal.mappings, selectedChangeIds: rebuilt.provenance.changes.map(change => change.id),
  });
}

/** An omitted mutation inherits the head binding. Clearing/restoring requires this explicit in-project origin. */
export function prepareTopicRestoreMutation(expectedBindingHash: string | null, origin: TopicBindingRestoreOrigin): TopicRestoreMutation {
  const value = snapshot(origin), fields = Object.keys(value);
  let checked: TopicBindingRestoreOrigin;
  if (fields.length === 1 && fields[0] === 'questionnaireVersionId') checked = { questionnaireVersionId: id((value as { questionnaireVersionId: unknown }).questionnaireVersionId) };
  else {
    const source = object(value, ['applicationVersionId', 'phase']);
    if (source.phase !== 'before') fail('仅能恢复到已记录的采纳前关联。');
    checked = { applicationVersionId: id(source.applicationVersionId), phase: 'before' };
  }
  return { kind: 'restore', hashContract: TOPIC_TRANSFER_HASH_CONTRACT, expectedBindingHash: maybeHash(expectedBindingHash), origin: checked };
}

/** Verify the sidecar against the exact questionnaire version and actual design, including legacy null bindings. */
export async function verifyTopicBindingReceipt(raw: unknown, expected: { versionId: string; design: Questionnaire }): Promise<TopicBindingReceipt> {
  const v = object(snapshot(raw), ['versionId', 'binding', 'bindingHash', 'designTransferHash']);
  const expectedSnapshot = snapshot(expected), versionId = id(v.versionId);
  if (versionId !== id(expectedSnapshot.versionId)) fail('关联回执来自其他问卷版本。');
  const design = parseQuestionnaire(JSON.stringify(expectedSnapshot.design));
  const designTransferHash = hash(v.designTransferHash), bindingHash = maybeHash(v.bindingHash);
  if (designTransferHash !== await topicQuestionnaireHash(design)) fail('关联回执与问卷内容不一致。');
  const binding = v.binding === null ? null : await verifyTopicQuestionnaireBinding(v.binding);
  if ((binding === null) !== (bindingHash === null) || binding !== null && await topicQuestionnaireHash(binding) !== bindingHash) fail('关联内容与回执指纹不一致。');
  return { versionId, binding, bindingHash, designTransferHash };
}
