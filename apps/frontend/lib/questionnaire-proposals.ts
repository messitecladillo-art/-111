import { parseCollection, parseProposal, parseProposalSummary, type Proposal, type Service } from '@evix/shared';

export type QuestionnaireGenerationRequest = {
  serviceId: string;
  serviceRevision: number;
  brief: string;
  expectedQuestionnaireRevision: number;
  idempotencyKey: string;
  consent: true;
};
export type ProposalIdentity = Pick<Proposal, 'id'> & Partial<Pick<Proposal, 'serviceId' | 'serviceRevision' | 'inputRevision' | 'createdAt'>>;

/** Only audited pre-provider branches in ProposalService can establish non-dispatch. */
export function isDefiniteGenerationRejection(status: number, code: string): boolean {
  return (status === 409 && ['revision_conflict', 'idempotency_conflict'].includes(code))
    || (status === 422 && ['consent_required', 'capability_unavailable', 'sensitive_input'].includes(code))
    || (status === 429 && ['call_active', 'call_rate_limit'].includes(code));
}

/** Capture consented inputs only for a new call; uncertain retries retain their original object. */
export function prepareQuestionnaireGeneration(
  service: Pick<Service, 'id' | 'revision' | 'capabilities'>,
  brief: string,
  expectedQuestionnaireRevision: number,
  consent: boolean,
  idempotencyKey = crypto.randomUUID(),
): QuestionnaireGenerationRequest {
  if (!service || !service.id || !Number.isSafeInteger(service.revision) || service.revision < 1 || !service.capabilities.includes('questionnaire')) throw Error('请选择具备问卷能力的有效模型服务。');
  if (!consent) throw Error('生成前请确认本次研究需求与模型服务。');
  if (typeof brief !== 'string' || !brief.trim() || brief.trim().length > 6000) throw Error('研究需求应为 1–6,000 字符。');
  if (!Number.isSafeInteger(expectedQuestionnaireRevision) || expectedQuestionnaireRevision < 0) throw Error('问卷基础版本无效。');
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw Error('模型请求标识无效。');
  return Object.freeze({ serviceId: service.id, serviceRevision: service.revision, brief: brief.trim(), expectedQuestionnaireRevision, idempotencyKey, consent: true });
}

export function parseProjectProposal(raw: unknown, projectId: string, expected?: ProposalIdentity): Proposal {
  const value = parseProposal(raw);
  if (value.projectId !== projectId) throw Error('模型提案回执与当前项目不匹配。');
  if (expected && (value.id !== expected.id || (['serviceId', 'serviceRevision', 'inputRevision', 'createdAt'] as const).some(key => expected[key] !== undefined && value[key] !== expected[key]))) throw Error('模型提案回执与所选调用记录不一致。');
  if (value.status !== 'ready' && value.design !== undefined) throw Error('模型提案状态与内容不一致。');
  return value;
}

export function validateGenerationReceipt(raw: unknown, projectId: string, request: QuestionnaireGenerationRequest): Proposal {
  const value = parseProjectProposal(raw, projectId);
  if (value.serviceId !== request.serviceId || value.serviceRevision !== request.serviceRevision || value.inputRevision !== request.expectedQuestionnaireRevision) throw Error('模型回执与原调用的服务配置或问卷基础版本不一致，请保留原请求核对。');
  return value;
}

export function parseProjectProposalHistory(raw: unknown, projectId: string) {
  const values = parseCollection(raw, 'proposals', parseProposalSummary, 50), ids = new Set<string>();
  for (const value of values) {
    if (value.projectId !== projectId || ids.has(value.id)) throw Error('模型调用目录与当前项目不匹配或包含重复记录。');
    ids.add(value.id);
  }
  return values;
}
