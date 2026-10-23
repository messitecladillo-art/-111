import { parseProjectProposal, parseProjectProposalHistory, validateGenerationReceipt, type ProposalIdentity, type QuestionnaireGenerationRequest } from '@/lib/questionnaire-proposals';

type Authority = () => boolean;
type Transport = { read(path: string): Promise<unknown>; mutate(path: string, body: QuestionnaireGenerationRequest): Promise<unknown> };

export class QuestionnaireProposalError extends Error {
  readonly phase: 'request' | 'receipt';
  override readonly cause: unknown;
  constructor(phase: 'request' | 'receipt', cause: unknown) {
    super(cause instanceof Error ? cause.message : '模型调用回执尚待核对。');
    this.name = 'QuestionnaireProposalError'; this.phase = phase; this.cause = cause;
  }
}

/** This module performs one request, never retries or starts an unrequested model call. */
export function createQuestionnaireProposalRepository(projectId: string, transport: Transport) {
  const path = `/api/projects/${projectId}/proposals`;
  async function list(current: Authority) {
    if (!current()) return undefined;
    const raw = await transport.read(path);
    return current() ? parseProjectProposalHistory(raw, projectId) : undefined;
  }
  async function get(expected: ProposalIdentity, current: Authority) {
    if (!current()) return undefined;
    const identity = { ...expected };
    const raw = await transport.read(`${path}/${encodeURIComponent(identity.id)}`);
    return current() ? parseProjectProposal(raw, projectId, identity) : undefined;
  }
  async function generate(request: QuestionnaireGenerationRequest, current: Authority) {
    if (!current()) return undefined;
    let raw: unknown;
    try { raw = await transport.mutate(path, request); }
    catch (cause) { if (!current()) return undefined; throw new QuestionnaireProposalError('request', cause); }
    if (!current()) return undefined;
    try { return validateGenerationReceipt(raw, projectId, request); }
    catch (cause) { throw new QuestionnaireProposalError('receipt', cause); }
  }
  return { list, get, generate };
}
