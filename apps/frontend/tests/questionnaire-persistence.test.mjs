import test from 'node:test';
import assert from 'node:assert/strict';
import { newQuestionnaire, exampleQuestionnaire } from '../lib/questionnaire.ts';
import { prepareTopicRestoreMutation } from '../lib/topic-questionnaire-api.ts';
import {
  prepareQuestionnaireSave, questionnaireFingerprint, parseQuestionnaireHeadForProject,
  parseQuestionnaireHeadResponse, validateQuestionnaireSaveReceipt,
  reconcileQuestionnaireHead, parseQuestionnaireHistoryVersion,
} from '../lib/questionnaire-persistence.ts';

const project = '11111111-1111-4111-8111-111111111111';
const otherProject = '22222222-2222-4222-8222-222222222222';
const version = '33333333-3333-4333-8333-333333333333';
const nextVersion = '44444444-4444-4444-8444-444444444444';
const key = '55555555-5555-4555-8555-555555555555';
const at = '2026-10-20T10:00:00Z';
const head = (design, overrides = {}) => ({ id: version, projectId: project, revision: 2, design, updatedAt: at, ...overrides });
const row = (design, overrides = {}) => ({ id: version, revision: 2, title: design.title, createdAt: at, createdBy: project, ...overrides });
const historical = (design, overrides = {}) => ({ id: version, revision: 2, createdAt: at, createdBy: project, design, ...overrides });

test('new questionnaire save captures a detached frozen design and atomic restore mutation', () => {
  const live = exampleQuestionnaire(); live.title = '武汉 · 合成问卷 🧭';
  const mutation = prepareTopicRestoreMutation(null, { questionnaireVersionId: version });
  const request = prepareQuestionnaireSave(live, 1, { idempotencyKey: key, sourceProposalId: nextVersion, topicBindingMutation: mutation });
  const before = structuredClone(request);
  assert.equal(request.sourceProposalId, nextVersion); assert.equal(request.idempotencyKey, key);
  for (const item of [request, request.design, request.design.questions, request.design.questions[0], request.topicBindingMutation.origin]) {
    assert.equal(Object.isFrozen(item), true);
  }
  assert.equal(Object.isFrozen(live), false); assert.equal(Object.isFrozen(mutation), false);
  live.questions[0].text = '保存中改写题目'; mutation.origin.questionnaireVersionId = nextVersion;
  assert.deepEqual(request, before);
  assert.throws(() => { request.design.questions[0].text = '修改冻结请求'; }, TypeError);
});

test('new save rejects invalid versions, missing identity and invalid questionnaire structure', () => {
  const design = newQuestionnaire();
  for (const revision of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => prepareQuestionnaireSave(design, revision));
  assert.throws(() => prepareQuestionnaireSave(design, 0, { idempotencyKey: ' ' }));
  assert.throws(() => prepareQuestionnaireSave({ ...design, unexpected: true }, 0));
  const fresh = prepareQuestionnaireSave(design, 0);
  assert.equal(fresh.expectedRevision, 0); assert.equal(typeof fresh.idempotencyKey, 'string');
});

test('head parsers bind both single and wrapped receipts to current project', () => {
  const value = head(newQuestionnaire());
  assert.equal(parseQuestionnaireHeadForProject(value, project).id, version);
  assert.equal(parseQuestionnaireHeadResponse({ questionnaire: value }, project).id, version);
  assert.equal(parseQuestionnaireHeadResponse({ questionnaire: null }, project), null);
  assert.throws(() => parseQuestionnaireHeadForProject(value, otherProject), /当前项目/);
  assert.throws(() => parseQuestionnaireHeadResponse({ questionnaire: value }, otherProject), /当前项目/);
  assert.throws(() => parseQuestionnaireHeadResponse({ questionnaire: value, extra: true }, project));
});

test('write receipt must confirm exact next revision and original design', () => {
  const live = exampleQuestionnaire(), request = prepareQuestionnaireSave(live, 1, { idempotencyKey: key });
  const received = head(structuredClone(request.design));
  assert.equal(validateQuestionnaireSaveReceipt(request, received, project).revision, 2);
  live.title = '继续编辑的标题';
  assert.equal(validateQuestionnaireSaveReceipt(request, received, project).design.title, request.design.title);
  for (const revision of [1, 3, 7]) assert.throws(() => validateQuestionnaireSaveReceipt(request, { ...received, revision }, project), /原请求/);
  assert.throws(() => validateQuestionnaireSaveReceipt(request, { ...received, projectId: otherProject }, project), /当前项目/);
  assert.throws(() => validateQuestionnaireSaveReceipt(request, head(live), project), /原请求/);
});

test('canonical equality permits JSON member order but protects option order, encoding and question IDs', () => {
  const design = exampleQuestionnaire(), request = prepareQuestionnaireSave(design, 1, { idempotencyKey: key });
  const reordered = Object.fromEntries(Object.entries(structuredClone(design)).reverse());
  assert.equal(questionnaireFingerprint(design), questionnaireFingerprint(reordered));
  assert.equal(validateQuestionnaireSaveReceipt(request, head(reordered), project).revision, 2);
  for (const kind of ['order', 'encoding', 'id']) {
    const changed = structuredClone(design), q = changed.questions.find(item => item.choices.length > 1);
    if (kind === 'order') q.choices.reverse();
    if (kind === 'encoding') q.choices[0].code = 'changed-code';
    if (kind === 'id') q.id = 'changed-question';
    assert.throws(() => validateQuestionnaireSaveReceipt(request, head(changed), project));
  }
});

test('head reconciliation accepts exact current receipt or a newer distinct immutable version', () => {
  const saved = head(exampleQuestionnaire());
  assert.equal(reconcileQuestionnaireHead(saved, { questionnaire: structuredClone(saved) }, project).revision, 2);
  const later = head({ ...saved.design, title: '协作者的新版本' }, { id: nextVersion, revision: 3 });
  assert.equal(reconcileQuestionnaireHead(saved, { questionnaire: later }, project).id, nextVersion);
  assert.notEqual(saved.design.title, later.design.title);
});

test('wrong-project, behind, missing, contradictory and reused-ID heads remain unconfirmed', () => {
  const saved = head(exampleQuestionnaire());
  for (const value of [null, { ...saved, projectId: otherProject }, { ...saved, revision: 1 }, { ...saved, id: nextVersion }, { ...saved, revision: 3 }, { ...saved, design: { ...saved.design, title: '同ID不同内容' } }]) {
    assert.throws(() => reconcileQuestionnaireHead(saved, { questionnaire: value }, project));
  }
  assert.throws(() => reconcileQuestionnaireHead({ ...saved, projectId: otherProject }, { questionnaire: saved }, project));
});

test('selected history is bound to immutable ID, revision and catalogued title', () => {
  const design = exampleQuestionnaire(), selected = row(design);
  assert.equal(parseQuestionnaireHistoryVersion(historical(design), selected).id, selected.id);
  for (const value of [historical(design, { id: nextVersion }), historical(design, { revision: 3 }), historical({ ...design, title: '另一份历史' })]) {
    assert.throws(() => parseQuestionnaireHistoryVersion(value, selected), /所选版本/);
  }
  assert.throws(() => parseQuestionnaireHistoryVersion({ ...historical(design), extra: true }, selected));
});
