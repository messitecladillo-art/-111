import {
  parseHeadResponse, parseQuestionnaireHead, parseQuestionnaireVersion,
  type Questionnaire, type QuestionnaireHead, type QuestionnaireVersion, type QuestionnaireVersionSummary,
} from '@evix/shared';
import { parseQuestionnaireLibraryContent } from './questionnaire-library.ts';
import type { TopicBindingMutation } from './topic-questionnaire-api.ts';

export type QuestionnaireSaveRequest = {
  design: Questionnaire;
  expectedRevision: number;
  idempotencyKey: string;
  sourceProposalId?: string;
  topicBindingMutation?: TopicBindingMutation;
};

/** Same canonical domain serialization used by dirty checks and saved questionnaires. */
export const questionnaireFingerprint = (design: Questionnaire): string => parseQuestionnaireLibraryContent(design).serialized;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Capture new requests once; never normalize or replace a pending uncertain request. */
export function prepareQuestionnaireSave(
  design: Questionnaire,
  expectedRevision: number,
  { idempotencyKey = crypto.randomUUID(), sourceProposalId, topicBindingMutation }: {
    idempotencyKey?: string;
    sourceProposalId?: string;
    topicBindingMutation?: TopicBindingMutation;
  } = {},
): QuestionnaireSaveRequest {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw Error('问卷基础版本无效。');
  }
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw Error('保存请求标识无效。');
  return freeze({
    design: parseQuestionnaireLibraryContent(structuredClone(design)).content,
    expectedRevision,
    idempotencyKey,
    ...(sourceProposalId === undefined ? {} : { sourceProposalId }),
    ...(topicBindingMutation === undefined ? {} : { topicBindingMutation: structuredClone(topicBindingMutation) }),
  });
}

export function parseQuestionnaireHeadForProject(raw: unknown, projectId: string): QuestionnaireHead {
  const head = parseQuestionnaireHead(raw);
  if (head.projectId !== projectId) throw Error('问卷回执与当前项目不匹配。');
  return head;
}

export function parseQuestionnaireHeadResponse(raw: unknown, projectId: string): QuestionnaireHead | null {
  const head = parseHeadResponse(raw);
  if (head && head.projectId !== projectId) throw Error('问卷回执与当前项目不匹配。');
  return head;
}

export function validateQuestionnaireSaveReceipt(
  request: QuestionnaireSaveRequest,
  raw: unknown,
  projectId: string,
): QuestionnaireHead {
  const receipt = parseQuestionnaireHeadForProject(raw, projectId);
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0
    || receipt.revision !== request.expectedRevision + 1
    || questionnaireFingerprint(receipt.design) !== questionnaireFingerprint(request.design)) {
    throw Error('保存回执与原请求不一致，请核对原保存。');
  }
  return receipt;
}

/** A verified write may be followed by a newer head, but version IDs stay immutable. */
export function reconcileQuestionnaireHead(receipt: QuestionnaireHead, rawHead: unknown, projectId: string): QuestionnaireHead {
  const saved = parseQuestionnaireHeadForProject(receipt, projectId);
  const current = parseQuestionnaireHeadResponse(rawHead, projectId);
  if (!current || current.revision < saved.revision
    || (current.revision === saved.revision
      && (current.id !== saved.id || questionnaireFingerprint(current.design) !== questionnaireFingerprint(saved.design)))
    || (current.revision > saved.revision && current.id === saved.id)) {
    throw Error('保存回执与当前版本尚未完成核对，请重试原保存。');
  }
  return current;
}

/** A selected history row names one immutable version, not any valid questionnaire. */
export function parseQuestionnaireHistoryVersion(raw: unknown, summary: QuestionnaireVersionSummary): QuestionnaireVersion {
  const value = parseQuestionnaireVersion(raw, true) as QuestionnaireVersion;
  if (value.id !== summary.id || value.revision !== summary.revision || value.design.title !== summary.title) {
    throw Error('历史问卷回执与所选版本不一致，请重新载入。');
  }
  return value;
}
