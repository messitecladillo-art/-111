import test from 'node:test';
import assert from 'node:assert/strict';
import { newQuestionnaire, summarizeProposal } from '@evix/shared';
import { isDefiniteGenerationRejection, prepareQuestionnaireGeneration, parseProjectProposal, parseProjectProposalHistory, validateGenerationReceipt } from '../lib/questionnaire-proposals.ts';
import { questionnaireProposalRepositoryModule } from './helpers/questionnaire-proposals.mjs';

const project = '11111111-1111-4111-8111-111111111111';
const service = { id: '22222222-2222-4222-8222-222222222222', revision: 3, capabilities: ['questionnaire'] };
const proposalId = '33333333-3333-4333-8333-333333333333';
const key = '44444444-4444-4444-8444-444444444444';
const at = '2026-10-20T10:00:00Z';
const { createQuestionnaireProposalRepository, QuestionnaireProposalError } = questionnaireProposalRepositoryModule();
const request = () => prepareQuestionnaireGeneration(service, '  武汉高校 · 😀 合成需求  ', 2, true, key);
const proposal = (overrides = {}) => ({ id: proposalId, projectId: project, serviceId: service.id, serviceRevision: 3, inputRevision: 2, status: 'ready', design: newQuestionnaire(), createdAt: at, ...overrides });

test('new generation freezes only the explicitly consented request and retains Unicode inputs', () => {
  const result = request();
  assert.equal(result.brief, '武汉高校 · 😀 合成需求'); assert.equal(result.serviceRevision, 3);
  assert.equal(result.expectedQuestionnaireRevision, 2); assert.equal(result.idempotencyKey, key);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(service), false);
  assert.throws(() => { result.brief = '更改'; }, TypeError);
  assert.deepEqual(Object.keys(result).sort(), ['brief', 'consent', 'expectedQuestionnaireRevision', 'idempotencyKey', 'serviceId', 'serviceRevision']);
});

test('invalid consent, capabilities, blank/over-limit brief or revision cannot construct a call', () => {
  assert.throws(() => prepareQuestionnaireGeneration(service, '需求', 2, false, key));
  for (const value of [{ ...service, capabilities: [] }, { ...service, revision: 0 }, { ...service, id: '' }]) assert.throws(() => prepareQuestionnaireGeneration(value, '需求', 2, true, key));
  for (const brief of ['', '   ', '字'.repeat(6001)]) assert.throws(() => prepareQuestionnaireGeneration(service, brief, 2, true, key));
  for (const revision of [-1, 0.5, NaN, Infinity]) assert.throws(() => prepareQuestionnaireGeneration(service, '需求', revision, true, key));
  assert.throws(() => prepareQuestionnaireGeneration(service, '需求', 2, true, ' '));
});

test('generation receipt matches the project, service snapshot and questionnaire base', () => {
  assert.equal(validateGenerationReceipt(proposal(), project, request()).id, proposalId);
  for (const overrides of [{ projectId: key }, { serviceId: key }, { serviceRevision: 4 }, { inputRevision: 3 }]) assert.throws(() => validateGenerationReceipt(proposal(overrides), project, request()));
});

test('read receipts bind selected ID and known immutable metadata, allowing status to finish', () => {
  const expected = summarizeProposal(proposal({ status: 'running', design: undefined }));
  assert.equal(parseProjectProposal(proposal(), project, expected).status, 'ready');
  for (const overrides of [{ id: key }, { projectId: key }, { serviceId: key }, { serviceRevision: 4 }, { inputRevision: 3 }, { createdAt: '2026-10-20T10:01:00Z' }]) assert.throws(() => parseProjectProposal(proposal(overrides), project, expected));
  assert.throws(() => parseProjectProposal(proposal({ status: 'outcome_unknown' }), project));
});

test('history rejects foreign-project and duplicate IDs instead of accepting an ambiguous catalogue', () => {
  const summary = summarizeProposal(proposal());
  assert.equal(parseProjectProposalHistory({ proposals: [summary] }, project).length, 1);
  assert.throws(() => parseProjectProposalHistory({ proposals: [summary, summary] }, project));
  assert.throws(() => parseProjectProposalHistory({ proposals: [{ ...summary, projectId: key }] }, project));
  assert.throws(() => parseProjectProposalHistory({ proposals: Array(51).fill(summary) }, project));
});

test('repository dispatches exact object once and never automatically retries any returned status', async () => {
  for (const status of ['ready', 'failed', 'outcome_unknown', 'running']) {
    const original = request(), calls = [];
    const repo = createQuestionnaireProposalRepository(project, { read: async () => { throw Error('unexpected GET'); }, mutate: async (...args) => { calls.push(args); return proposal({ status, ...(status === 'ready' ? {} : { design: undefined }) }); } });
    const result = await repo.generate(original, () => true);
    assert.equal(result.status, status); assert.equal(calls.length, 1); assert.equal(calls[0][1], original);
    assert.equal(calls[0][0], `/api/projects/${project}/proposals`);
  }
});

test('repository distinguishes transport dispatch failure from a malformed or unrelated receipt', async () => {
  const denied = Object.assign(Error('403'), { status: 403 });
  const repo = createQuestionnaireProposalRepository(project, { read: async () => null, mutate: async () => { throw denied; } });
  await assert.rejects(repo.generate(request(), () => true), error => error instanceof QuestionnaireProposalError && error.phase === 'request' && error.cause === denied);
  for (const result of [null, proposal({ projectId: key }), proposal({ serviceRevision: 4 })]) {
    const bad = createQuestionnaireProposalRepository(project, { read: async () => null, mutate: async () => result });
    await assert.rejects(bad.generate(request(), () => true), error => error instanceof QuestionnaireProposalError && error.phase === 'receipt');
  }
});

test('authority fences prevent initial IO and ignore late generate, list and get replies', async () => {
  for (const kind of ['generate', 'list', 'get']) {
    let valid = false, count = 0, complete;
    const response = new Promise(resolve => { complete = resolve; });
    const io = async () => { count++; return response; };
    const repo = createQuestionnaireProposalRepository(project, { read: io, mutate: io });
    const call = () => kind === 'generate' ? repo.generate(request(), () => valid) : kind === 'list' ? repo.list(() => valid) : repo.get({ id: proposalId }, () => valid);
    assert.equal(await call(), undefined); assert.equal(count, 0);
    valid = true; const pending = call(); valid = false;
    complete(kind === 'list' ? { proposals: [summarizeProposal(proposal())] } : proposal());
    assert.equal(await pending, undefined); assert.equal(count, 1);
  }
});

test('get captures the selected identity before await and never changes it with caller mutation', async () => {
  let complete; const response = new Promise(resolve => { complete = resolve; });
  const repo = createQuestionnaireProposalRepository(project, { read: async () => response, mutate: async () => null });
  const selected = { id: proposalId, serviceRevision: 3 }, pending = repo.get(selected, () => true);
  selected.id = key; selected.serviceRevision = 9; complete(proposal());
  assert.equal((await pending).id, proposalId);
});

test('only audited pre-provider code/status pairs establish a definite first-request rejection', () => {
  for (const [status, code] of [[409, 'revision_conflict'], [409, 'idempotency_conflict'], [422, 'consent_required'], [422, 'capability_unavailable'], [422, 'sensitive_input'], [429, 'call_active'], [429, 'call_rate_limit']]) {
    assert.equal(isDefiniteGenerationRejection(status, code), true);
    assert.equal(isDefiniteGenerationRejection(403, code), false);
    assert.equal(isDefiniteGenerationRejection(500, code), false);
  }
  for (const [status, code] of [[401, 'login_required'], [403, 'permission_denied'], [404, 'not_found'], [409, 'synthetic_error'], [422, 'invalid_input'], [400, 'invalid_server_receipt'], [429, 'unknown']]) assert.equal(isDefiniteGenerationRejection(status, code), false);
});
