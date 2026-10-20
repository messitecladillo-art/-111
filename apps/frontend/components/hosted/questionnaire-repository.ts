import { parseVersionPage, type QuestionnaireHead, type QuestionnaireVersionSummary } from '@evix/shared';
import { canonical } from '@/lib/questionnaire-mapping';
import {
  parseQuestionnaireHeadResponse, parseQuestionnaireHistoryVersion,
  reconcileQuestionnaireHead, validateQuestionnaireSaveReceipt, type QuestionnaireSaveRequest,
} from '@/lib/questionnaire-persistence';
import { verifyTopicBindingReceipt, type TopicBindingReceipt } from '@/lib/topic-questionnaire-api';
import type { TopicQuestionnaireBinding } from '@/lib/topic-questionnaire';

/** One bounded envelope for questionnaires and their paired source-binding sidecars. */
export const QUESTIONNAIRE_READ_OPTIONS = Object.freeze({ maxBytes: 2_100_000 });
type Authority = () => boolean;
type Transport = {
  read(path: string, options?: { maxBytes?: number }): Promise<unknown>;
  mutate(path: string, request: QuestionnaireSaveRequest, method?: string, options?: { maxBytes?: number }): Promise<unknown>;
};

/** The host may resolve a fresh mutation rejection; verification or rejected replays remain uncertain. */
export class QuestionnaireSaveError extends Error {
  readonly phase: 'mutation' | 'verification';
  override readonly cause: unknown;
  constructor(phase: 'mutation' | 'verification', cause: unknown) {
    super(cause instanceof Error ? cause.message : '问卷保存结果尚待核对，请保留原保存请求。');
    this.name = 'QuestionnaireSaveError';
    this.phase = phase;
    this.cause = cause;
  }
}

/** Project-scoped I/O protocol. UI drafts, source epochs, paired loads and history remain in the host. */
export function createQuestionnaireRepository(projectId: string, transport: Transport) {
  const path = `/api/projects/${projectId}/questionnaire`;
  async function head(stillCurrent: Authority = () => true) {
    if (!stillCurrent()) return undefined;
    const raw = await transport.read(path, QUESTIONNAIRE_READ_OPTIONS);
    if (!stillCurrent()) return undefined;
    return parseQuestionnaireHeadResponse(raw, projectId);
  }
  async function bindingFor(value: Pick<QuestionnaireHead, 'id' | 'design'>, stillCurrent: Authority = () => true): Promise<TopicBindingReceipt | undefined> {
    if (!stillCurrent()) return undefined;
    const raw = await transport.read(`${path}/versions/${encodeURIComponent(value.id)}/topic-binding`, QUESTIONNAIRE_READ_OPTIONS);
    if (!stillCurrent()) return undefined;
    const receipt = await verifyTopicBindingReceipt(raw, { versionId: value.id, design: value.design });
    if (!stillCurrent()) return undefined;
    return receipt;
  }
  async function versions(before?: number, stillCurrent: Authority = () => true) {
    if (!stillCurrent()) return undefined;
    const raw = await transport.read(`${path}/versions${before ? `?beforeRevision=${before}` : ''}`, QUESTIONNAIRE_READ_OPTIONS);
    if (!stillCurrent()) return undefined;
    return parseVersionPage(raw);
  }
  async function version(summary: QuestionnaireVersionSummary, stillCurrent: Authority = () => true) {
    if (!stillCurrent()) return undefined;
    const raw = await transport.read(`${path}/versions/${encodeURIComponent(summary.id)}`, QUESTIONNAIRE_READ_OPTIONS);
    if (!stillCurrent()) return undefined;
    return parseQuestionnaireHistoryVersion(raw, summary);
  }
  async function save(request: QuestionnaireSaveRequest, expectedBinding: TopicQuestionnaireBinding | null, stillCurrent: Authority) {
    if (!stillCurrent()) return undefined;
    const binding = structuredClone(expectedBinding);
    let raw: unknown;
    try {
      // Preserve the exact pending object and idempotency key on uncertain retries.
      raw = await transport.mutate(`${path}/versions`, request, 'POST', QUESTIONNAIRE_READ_OPTIONS);
    } catch (cause) {
      if (!stillCurrent()) return undefined;
      throw new QuestionnaireSaveError('mutation', cause);
    }
    if (!stillCurrent()) return undefined;
    try {
      const receipt = validateQuestionnaireSaveReceipt(request, raw, projectId);
      const savedBinding = await bindingFor(receipt, stillCurrent);
      if (!stillCurrent() || !savedBinding) return undefined;
      if (canonical(savedBinding.binding) !== canonical(binding)) throw Error('已保存版本的来源绑定与原保存请求不一致，请保留原请求核对。');
      const rawCurrent = await head(stillCurrent);
      if (!stillCurrent() || rawCurrent === undefined) return undefined;
      const current = reconcileQuestionnaireHead(receipt, { questionnaire: rawCurrent }, projectId);
      const currentBinding = current.id === receipt.id ? savedBinding : await bindingFor(current, stillCurrent);
      if (!stillCurrent() || !currentBinding) return undefined;
      return { receipt, savedBinding, current, currentBinding };
    } catch (cause) {
      if (!stillCurrent()) return undefined;
      throw new QuestionnaireSaveError('verification', cause);
    }
  }
  return { head, bindingFor, versions, version, save };
}
