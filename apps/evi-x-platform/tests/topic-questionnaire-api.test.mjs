import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exampleQuestionnaire } from '../lib/questionnaire.ts';
import { emptyTopicBrief } from '../lib/topic-project.ts';
import { prepareTopicQuestionnaire, applyTopicQuestionnaire, topicQuestionnaireHash } from '../lib/topic-questionnaire.ts';
import { prepareTopicQuestionnaireMutation, prepareTopicRestoreMutation, verifyTopicBindingReceipt } from '../lib/topic-questionnaire-api.ts';

function fixture() {
  return { source: { brief: { ...emptyTopicBrief(), title: '武汉研究 🧭', geography: '武汉', decisionOwner: '拟沟通的服务方', decision: '比较两种服务说明', population: '拟调查使用者',
    questions: [{ id: 'rq-1', text: '哪种说明更容易理解？' }], constructs: [{ id: 'c-1', name: '说明清晰度', questionIds: ['rq-1'] }] },
    version: { id: 'source-v-1', revision: 1, contentHash: 'a'.repeat(64), createdAt: '2026-10-15T08:00:00Z', createdBy: 'user-a' }, dirty: false, decisionRevision: 2 },
    target: { design: exampleQuestionnaire(), pending: false, versionId: 'design-v-1', revision: 1 } };
}
const mappings = [{ questionId: 'demo-experience', researchQuestionIds: ['rq-1'], constructIds: ['c-1'] }];
async function application(f = fixture(), selected = ['brief:title']) {
  const p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
  return { ...f, app: await applyTopicQuestionnaire(p, f.source, f.target, selected) };
}

test('apply payload freezes full mappings even when their fields were not selected', async () => {
  const { source, target, app } = await application();
  const mutation = await prepareTopicQuestionnaireMutation(app, source, target);
  assert.equal(mutation.hashContract, 'evix-topic-transfer-json/1');
  assert.equal(mutation.source.expectedDecisionRevision, 2);
  assert.deepEqual(mutation.mappings, mappings); assert.deepEqual(mutation.selectedChangeIds, ['brief:title']);
  assert.equal(mutation.expectedBindingHash, null);
  assert.equal(mutation.target.beforeContentHash, await topicQuestionnaireHash(target.design));
  assert.equal(mutation.afterContentHash, await topicQuestionnaireHash(app.after));
  mutation.beforeDesign.title = '修改请求副本'; mutation.mappings[0].researchQuestionIds.length = 0;
  assert.notEqual(target.design.title, mutation.beforeDesign.title); assert.deepEqual(app.mappings, mappings);
});

test('only an exact rebuilt application can be sent, including unchanged manual fields and source metadata', async () => {
  const { source, target, app } = await application();
  for (const mutate of [a => { a.after.questions[0].text += '新增内容'; }, a => { a.binding.sources[0].brief.title += '替换'; }, a => { a.mappings = []; }, a => { a.provenance.changes.push(a.provenance.changes[0]); }]) {
    const changed = structuredClone(app); mutate(changed);
    await assert.rejects(() => prepareTopicQuestionnaireMutation(changed, source, target));
  }
  await assert.rejects(() => prepareTopicQuestionnaireMutation(app, { ...source, decisionRevision: 3 }, target), /已变化/);
  await assert.rejects(() => prepareTopicQuestionnaireMutation(app, source, { ...target, revision: 2 }), /已变化/);
  await assert.rejects(() => prepareTopicQuestionnaireMutation(app, { ...source, decisionRevision: 0 }, target), /确认/);
});

test('receipt verifies exact saved version, full design and binding while supporting a legacy null sidecar', async () => {
  const { app } = await application();
  const receipt = { versionId: 'new-design-v2', binding: app.binding, bindingHash: await topicQuestionnaireHash(app.binding), designTransferHash: await topicQuestionnaireHash(app.after) };
  const result = await verifyTopicBindingReceipt(receipt, { versionId: receipt.versionId, design: app.after });
  assert.deepEqual(result, receipt); assert.notEqual(result.binding, receipt.binding);
  for (const patch of [{ versionId: 'other-version' }, { bindingHash: 'b'.repeat(64) }, { designTransferHash: 'c'.repeat(64) }, { binding: null }, { extra: true }]) {
    await assert.rejects(() => verifyTopicBindingReceipt({ ...receipt, ...patch }, { versionId: receipt.versionId, design: app.after }));
  }
  const legacy = { ...receipt, binding: null, bindingHash: null };
  assert.deepEqual(await verifyTopicBindingReceipt(legacy, { versionId: legacy.versionId, design: app.after }), legacy);
  await assert.rejects(() => verifyTopicBindingReceipt({ ...legacy, bindingHash: receipt.bindingHash }, { versionId: legacy.versionId, design: app.after }));
});

test('restore requires a precise origin and keeps null distinct from an omitted inherited binding', () => {
  assert.deepEqual(prepareTopicRestoreMutation(null, { questionnaireVersionId: 'legacy-v1' }).origin, { questionnaireVersionId: 'legacy-v1' });
  assert.deepEqual(prepareTopicRestoreMutation('a'.repeat(64), { applicationVersionId: 'apply-v2', phase: 'before' }).origin, { applicationVersionId: 'apply-v2', phase: 'before' });
  for (const origin of [null, {}, { questionnaireVersionId: 'a', extra: true }, { applicationVersionId: 'a', phase: 'after' }, { questionnaireVersionId: 'a', applicationVersionId: 'b' }]) assert.throws(() => prepareTopicRestoreMutation(null, origin));
  let reads = 0;
  const origin = {}; Object.defineProperty(origin, 'questionnaireVersionId', { enumerable: true, get() { reads++; return 'a'; } });
  assert.throws(() => prepareTopicRestoreMutation(null, origin)); assert.equal(reads, 0);
});

test('edits during the final awaited digest cannot escape the request fence', { timeout: 5000 }, async () => {
  const original = crypto.subtle.digest;
  let total = 0;
  try {
    const baseline = await application();
    crypto.subtle.digest = function (...args) { total++; return original.apply(this, args); };
    await prepareTopicQuestionnaireMutation(baseline.app, baseline.source, baseline.target);
  } finally { crypto.subtle.digest = original; }
  assert.ok(total > 0);
  for (const change of [f => { f.source.brief.title += '晚到编辑'; }, f => { f.target.design.questions[0].text += '晚到编辑'; }, f => { f.app.after.title += '晚到编辑'; }]) {
    const f = await application();
    let count = 0, entered, release;
    const gate = new Promise(resolve => { entered = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    try {
      crypto.subtle.digest = function (...args) {
        const result = original.apply(this, args);
        if (++count !== total) return result;
        entered(); return result.then(async value => { await wait; return value; });
      };
      const pending = prepareTopicQuestionnaireMutation(f.app, f.source, f.target);
      await gate; change(f); release();
      await assert.rejects(() => pending, /等待期间内容已变化/);
    } finally { release(); crypto.subtle.digest = original; }
  }
});

test('shared complete transfer fixtures freeze proposal, partial application and receipt parity', async () => {
  const cases = JSON.parse(readFileSync(new URL('../../../packages/evi-x-shared/fixtures/topic-questionnaire-transfer-v1.json', import.meta.url), 'utf8')).cases;
  for (const c of cases) {
    const p = await prepareTopicQuestionnaire(c.source, c.target, c.mappings, c.beforeBinding);
    const a = await applyTopicQuestionnaire(p, c.source, c.target, c.selectedChangeIds, c.beforeBinding);
    const mutation = await prepareTopicQuestionnaireMutation(a, c.source, c.target);
    assert.equal(p.id, c.expected.proposalId, c.id); assert.deepEqual(a.after, c.expected.after, c.id);
    assert.deepEqual(a.binding, c.expected.binding, c.id); assert.deepEqual(mutation, c.expected.mutation, c.id);
    assert.equal(await topicQuestionnaireHash(a.binding), c.expected.bindingHash, c.id);
  }
});
