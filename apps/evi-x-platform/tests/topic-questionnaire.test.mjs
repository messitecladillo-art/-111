import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTopicBrief } from '../lib/topic-project.ts';
import { exampleQuestionnaire, parseQuestionnaire, newQuestionnaire } from '../lib/questionnaire.ts';
import { prepareTopicQuestionnaire, applyTopicQuestionnaire, rejectTopicQuestionnaire, parseTopicQuestionnaireBinding, verifyTopicQuestionnaireBinding, topicQuestionnaireHash } from '../lib/topic-questionnaire.ts';

const version = (revision = 1) => ({ id: `topic-v-${revision}`, revision, contentHash: String(revision).repeat(64), createdAt: '2026-10-15T08:00:00Z', createdBy: 'account-a' });
function fixture() {
  const brief = { ...emptyTopicBrief(), title: '武汉服务研究 🧭', decisionOwner: '拟沟通的服务负责人', decision: '决定优先核查哪些办理困难', population: '拟调查最近使用过服务的居民', geography: '武汉', inclusion: '拟纳入成年人', exclusion: '拟排除未使用者', evidencePlan: '先联系渠道，尚未实施访谈', firstWeekPlan: ['核查进入场所的许可'],
    questions: [{ id: 'rq-1', text: '最近使用时遇到了哪些困难？' }, { id: 'rq-2', text: '说明的清晰程度与使用困难如何关联？' }],
    constructs: [{ id: 'construct-clarity', name: '说明清晰度', questionIds: ['rq-2'] }],
    sources: [{ id: 'source-1', title: '用户提供的来源标题', url: 'https://example.org/source', locator: '待核对原文', coverage: 'reference', publishedAt: '', retrievedAt: '' }] };
  return { source: { brief, version: version(), dirty: false, decisionRevision: 1 }, target: { design: exampleQuestionnaire(), pending: false, versionId: 'questionnaire-v-2', revision: 2 } };
}
const mappings = [{ questionId: 'demo-experience', researchQuestionIds: ['rq-2'], constructIds: ['construct-clarity'] }];

test('preview preserves source and complete questionnaire including IDs, choices and routing', async () => {
  const f = fixture(), before = structuredClone(f), p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
  assert.deepEqual(f, before); assert.equal(p.classification, 'proposed'); assert.equal(p.source.version.id, 'topic-v-1');
  assert.equal(p.source.version.contentHash, f.source.version.contentHash); assert.match(p.target.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(p.fields.find(f => f.id === 'brief:title').after, f.source.brief.title);
  assert.equal(p.fields.find(f => f.id === 'question:demo-experience:construct').after, '说明清晰度');
  assert.equal(new Set(p.fields.map(f => f.id)).size, p.fields.length);
});

test('partial adoption modifies only selected fields and returns independent before/after for one undo', async () => {
  const f = fixture(), original = structuredClone(f.target.design), p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
  const r = await applyTopicQuestionnaire(p, f.source, f.target, ['brief:title', 'question:demo-experience:construct']);
  assert.deepEqual(f.target.design, original); assert.deepEqual(r.before, original);
  assert.equal(r.after.title, f.source.brief.title); assert.equal(r.after.objective, original.objective);
  assert.deepEqual(r.after.questions, original.questions.map(q => q.id === 'demo-experience' ? { ...q, construct: '说明清晰度' } : q));
  assert.deepEqual(parseQuestionnaire(JSON.stringify(r.after)), r.after);
  r.before.title = '修改返回值'; assert.deepEqual(f.target.design, original);
  assert.equal(r.beforeBinding, null); assert.equal(r.provenance.after.contentHash, await topicQuestionnaireHash(r.after));
});

test('source texts exceeding questionnaire limits remain complete, actionable and unselected fields do not block', async () => {
  const f = fixture(); f.source.brief.title = '标'.repeat(161); f.source.brief.population = '人'.repeat(200);
  f.source.brief.questions[1].text = '问'.repeat(501); f.source.brief.constructs[0].name = '概'.repeat(121);
  const p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
  for (const id of ['brief:title', 'brief:population', 'question:demo-experience:researchQuestion', 'question:demo-experience:construct']) {
    const field = p.fields.find(f => f.id === id); assert.ok(field.after.length > field.max); assert.equal(field.issues[0].actual, field.after.length);
    await assert.rejects(() => applyTopicQuestionnaire(p, f.source, f.target, [id]), /未截断/);
  }
  const r = await applyTopicQuestionnaire(p, f.source, f.target, ['brief:geography']);
  assert.equal(r.after.geography, '武汉'); assert.equal(r.after.title, f.target.design.title);
});

test('composed objective and pilot plans enforce actual target limits without source truncation', async () => {
  const f = fixture(); f.source.brief.decision = '决'.repeat(600); f.source.brief.evidencePlan = '证'.repeat(2100);
  const p = await prepareTopicQuestionnaire(f.source, f.target);
  for (const id of ['brief:objective', 'brief:pilotNotes']) {
    const field = p.fields.find(f => f.id === id); assert.ok(field.issues.length); assert.ok(field.after.includes(id === 'brief:objective' ? f.source.brief.decision : f.source.brief.evidencePlan));
    await assert.rejects(() => applyTopicQuestionnaire(p, f.source, f.target, [id]), /超过问卷字段/);
  }
});

test('duplicate source IDs, question IDs, mapping IDs and repeated selection are rejected', async () => {
  const f = fixture(); f.source.brief.questions.push({ ...f.source.brief.questions[0] }); await assert.rejects(() => prepareTopicQuestionnaire(f.source, f.target), /标识重复/);
  const g = fixture(); g.target.design.questions.push({ ...g.target.design.questions[0] }); await assert.rejects(() => prepareTopicQuestionnaire(g.source, g.target), /ID 无效或重复/);
  const h = fixture(); await assert.rejects(() => prepareTopicQuestionnaire(h.source, h.target, [...mappings, ...mappings]), /关联重复/);
  const p = await prepareTopicQuestionnaire(h.source, h.target); await assert.rejects(() => applyTopicQuestionnaire(p, h.source, h.target, ['brief:title', 'brief:title']), /关联重复/);
});

test('missing or incompatible stable mapping references require user repair', async () => {
  const f = fixture();
  for (const patch of [{ questionId: 'deleted' }, { researchQuestionIds: ['missing'] }, { constructIds: ['missing'] }, { researchQuestionIds: ['rq-1'] }]) {
    await assert.rejects(() => prepareTopicQuestionnaire(f.source, f.target, [{ ...mappings[0], ...patch }]), /不存在|全部研究问题/);
  }
  await assert.rejects(() => prepareTopicQuestionnaire(f.source, f.target, [{ questionId: 'demo-open', researchQuestionIds: [], constructIds: [] }]), /至少选择/);
});

test('exact source version, source hash or brief drift invalidates the old proposal', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target);
  for (const mutate of [s => { s.version = version(2); }, s => { s.version.contentHash = 'a'.repeat(64); }, s => { s.brief.title += '改'; }, s => { s.version.createdBy = 'other'; }]) {
    const changed = structuredClone(f.source); mutate(changed);
    await assert.rejects(() => applyTopicQuestionnaire(p, changed, f.target, ['brief:title']), /已变化/);
  }
});

test('late questionnaire edits of any kind and saved base changes invalidate the old proposal', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target);
  for (const mutate of [t => { t.design.questions[0].text += '改'; }, t => { t.design.questions[0].choices[0].code = '99'; }, t => { t.design.questions[1].condition.codes = ['0']; }, t => { t.design.pilotNotes += '计划'; }, t => { t.versionId = 'questionnaire-v-3'; t.revision = 3; }]) {
    const changed = structuredClone(f.target); mutate(changed);
    await assert.rejects(() => applyTopicQuestionnaire(p, f.source, changed, ['brief:title']), /已变化/);
  }
  assert.equal(f.target.design.title, '校园服务体验 · 教学问卷草稿');
});

test('unsaved source and unfinished target inputs block preview and adoption', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target);
  await assert.rejects(() => prepareTopicQuestionnaire({ ...f.source, dirty: true }, f.target), /先保存/);
  await assert.rejects(() => applyTopicQuestionnaire(p, { ...f.source, dirty: true }, f.target, ['brief:title']), /先保存/);
  await assert.rejects(() => applyTopicQuestionnaire(p, f.source, { ...f.target, pending: true }, ['brief:title']), /未完成输入/);
});

test('sidecar stores exact stable IDs and supplied source snapshots without modifying survey facts', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
  const r = await applyTopicQuestionnaire(p, f.source, f.target, ['question:demo-experience:researchQuestion', 'question:demo-experience:construct']);
  assert.deepEqual(await verifyTopicQuestionnaireBinding(r.binding), r.binding);
  assert.deepEqual(r.binding.sources[0].brief.sources, f.source.brief.sources); assert.deepEqual(r.binding.sources[0].brief.questions, f.source.brief.questions);
  const c = r.binding.applications[0].changes.find(c => c.field === 'construct');
  assert.deepEqual(c.researchQuestionIds, ['rq-2']); assert.deepEqual(c.constructIds, ['construct-clarity']); assert.equal(c.questionId, 'demo-experience');
  assert.equal(r.after.questions.length, f.target.design.questions.length);
  assert.deepEqual(r.after.questions.map(q => q.source), f.target.design.questions.map(q => q.source));
  assert.ok(!Object.hasOwn(r.after, 'topicBinding')); assert.ok(!r.after.questions.some(q => q.source.includes('topic-questionnaire-binding')));
});

test('new adoption preserves historical read references even when source RQs and questionnaire items are later removed', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
  const first = await applyTopicQuestionnaire(p, f.source, f.target, ['question:demo-experience:researchQuestion']);
  const old = structuredClone(first.binding), source2 = structuredClone(f.source); source2.version = version(2); source2.brief.questions = [{ id: 'rq-new', text: '新的研究问题' }]; source2.brief.constructs = []; source2.brief.title = '新版本标题';
  const target2 = { ...f.target, design: { ...first.after, questions: first.after.questions.filter(q => q.id !== 'demo-experience') } };
  const p2 = await prepareTopicQuestionnaire(source2, target2, [], first.binding), second = await applyTopicQuestionnaire(p2, source2, target2, ['brief:title'], first.binding);
  assert.deepEqual(first.binding, old); assert.deepEqual(second.binding.sources[0], old.sources[0]); assert.deepEqual(second.binding.applications[0], old.applications[0]);
  assert.equal(second.binding.sources.length, 2); assert.equal(second.binding.applications.length, 2); assert.deepEqual(await verifyTopicQuestionnaireBinding(second.binding), second.binding);
});

test('strict sidecar parser rejects unsupported fields, duplicate members, dangling or tampered source bindings', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target, mappings), r = await applyTopicQuestionnaire(p, f.source, f.target, ['question:demo-experience:construct']);
  assert.throws(() => parseTopicQuestionnaireBinding({ ...r.binding, extra: true }));
  const raw = JSON.stringify(r.binding); assert.throws(() => parseTopicQuestionnaireBinding(raw.replace('"schema":', '"schema":"bad","schema":')), /重复字段/);
  for (const mutate of [b => { b.sources.push(structuredClone(b.sources[0])); }, b => { b.applications[0].sourceContentHash = 'a'.repeat(64); }, b => { b.applications[0].changes[0].constructIds = ['missing']; }, b => { b.applications[0].after.baseRevision = 0; }, b => { b.applications.push(structuredClone(b.applications[0])); }]) {
    const bad = structuredClone(r.binding); mutate(bad); assert.throws(() => parseTopicQuestionnaireBinding(bad));
  }
  const bad = structuredClone(r.binding); bad.sources[0].brief.title += '改'; await assert.rejects(() => verifyTopicQuestionnaireBinding(bad), /指纹不符/);
});

test('changed binding ledger, altered proposal content and unknown selections cannot be applied', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
  const modified = structuredClone(p); modified.fields[0].after = '未经预览的替换'; await assert.rejects(() => applyTopicQuestionnaire(modified, f.source, f.target, [modified.fields[0].id]), /已变化/);
  await assert.rejects(() => applyTopicQuestionnaire(p, f.source, f.target, ['new-question:anything']), /有效修改项/);
  await assert.rejects(() => applyTopicQuestionnaire(p, f.source, f.target, []), /有效修改项/);
  const first = await applyTopicQuestionnaire(p, f.source, f.target, ['brief:title']);
  await assert.rejects(() => applyTopicQuestionnaire(p, f.source, f.target, ['brief:title'], first.binding), /已变化/);
});

test('Unicode whitespace and multiline text remain exact; no default items, answers or scale validity are invented', async () => {
  const f = fixture(); f.source.brief = { ...emptyTopicBrief(), title: '  中文 🧭\n第二行  ' }; f.target.design = newQuestionnaire(); f.target.design.questions = [];
  const p = await prepareTopicQuestionnaire(f.source, f.target); assert.deepEqual(p.fields.map(f => f.id), ['brief:title']);
  const r = await applyTopicQuestionnaire(p, f.source, f.target, ['brief:title']);
  assert.equal(r.after.title, f.source.brief.title); assert.deepEqual(r.after.questions, []); assert.equal(r.after.population, ''); assert.equal(r.after.objective, '');
  assert.deepEqual(r.binding.sources[0].brief.sources, []); assert.deepEqual(parseQuestionnaire(JSON.stringify(r.after)), r.after);
});

test('reject returns only exact proposal acknowledgement and never changes source, questionnaire or bindings', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target), before = structuredClone(f);
  const result = await rejectTopicQuestionnaire(p, f.source, f.target); assert.equal(result.status, 'rejected'); assert.equal(result.proposalId, p.id); assert.deepEqual(f, before);
  const changed = structuredClone(f.target); changed.design.questions[0].text += '后续修改'; await assert.rejects(() => rejectTopicQuestionnaire(p, f.source, changed), /已变化/);
});

test('getters, hidden fields, symbols, sparse arrays and coercive enum values are rejected without invoking accessors', async () => {
  const f = fixture(); let calls = 0; const source = { ...f.source }; Object.defineProperty(source, 'brief', { enumerable: true, get() { calls++; return f.source.brief; } });
  await assert.rejects(() => prepareTopicQuestionnaire(source, f.target), /访问器/); assert.equal(calls, 0);
  const hidden = { ...f.source }; Object.defineProperty(hidden, 'secret', { value: 'no', enumerable: false }); await assert.rejects(() => prepareTopicQuestionnaire(hidden, f.target));
  const symbol = { ...f.source, [Symbol('x')]: 1 }; await assert.rejects(() => prepareTopicQuestionnaire(symbol, f.target));
  const sparse = []; sparse.length = 1; await assert.rejects(() => prepareTopicQuestionnaire(f.source, f.target, sparse));
  const invalid = structuredClone(f.source); invalid.brief.sources[0].coverage = ['reference']; await assert.rejects(() => prepareTopicQuestionnaire(invalid, f.target));
});

test('hash waits cannot overwrite in-place late edits', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target);
  const pending = applyTopicQuestionnaire(p, f.source, f.target, ['brief:title']); f.target.design.questions[0].text += '等待期间编辑';
  await assert.rejects(() => pending, /等待期间输入发生变化/);
});

test('reject also checks edits that occur while hashes are pending', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target);
  const pending = rejectTopicQuestionnaire(p, f.source, f.target); f.target.design.title += '后续编辑';
  await assert.rejects(() => pending, /等待期间输入发生变化/);
});

test('one immutable topic version cannot overwrite a preserved historical source snapshot', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target), first = await applyTopicQuestionnaire(p, f.source, f.target, ['brief:title']);
  const changed = structuredClone(f.source); changed.brief.title = '冒用同版标识的不同研究简报';
  const target = { ...f.target, design: first.after }, next = await prepareTopicQuestionnaire(changed, target, [], first.binding);
  const before = structuredClone(first.binding);
  await assert.rejects(() => applyTopicQuestionnaire(next, changed, target, ['brief:title'], first.binding), /同一选题版本出现不同内容/);
  assert.deepEqual(first.binding, before);
});

test('empty or whitespace mapped source text stays visible as an actionable issue and cannot clear an existing question field', async () => {
  for (const blank of ['', '  \t\n\u3000 ']) {
    const f = fixture(); f.source.brief.questions[1].text = blank; f.source.brief.constructs[0].name = blank;
    const original = structuredClone(f.target.design), p = await prepareTopicQuestionnaire(f.source, f.target, mappings);
    for (const [field, sourceId] of [['researchQuestion', 'rq-2'], ['construct', 'construct-clarity']]) {
      const suggestion = p.fields.find(c => c.id === `question:demo-experience:${field}`);
      assert.equal(suggestion.after, blank); assert.deepEqual(suggestion.issues.map(i => i.code), ['empty_source']);
      assert.ok(suggestion.issues[0].message.includes(sourceId)); assert.match(suggestion.issues[0].message, /补充选题原文|取消这些来源关联/);
      await assert.rejects(() => applyTopicQuestionnaire(p, f.source, f.target, [suggestion.id]), /为空或仅含空白/);
      assert.deepEqual(f.target.design, original);
    }
    const partial = await applyTopicQuestionnaire(p, f.source, f.target, ['brief:title']);
    assert.deepEqual(partial.after.questions, original.questions);
  }
});

test('multiple allblank or mixed blank mapped sources are not silently joined into a usable replacement', async () => {
  for (const firstText of [' \n', '已有内容']) {
    const f = fixture(); f.source.brief.questions[0].text = firstText; f.source.brief.questions[1].text = '\u3000\t';
    f.source.brief.constructs = [{ id: 'c-1', name: firstText, questionIds: ['rq-1'] }, { id: 'c-2', name: ' ', questionIds: ['rq-2'] }];
    const mapping = [{ questionId: 'demo-experience', researchQuestionIds: ['rq-1', 'rq-2'], constructIds: ['c-1', 'c-2'] }];
    const p = await prepareTopicQuestionnaire(f.source, f.target, mapping), original = structuredClone(f.target.design);
    for (const field of ['researchQuestion', 'construct']) {
      const suggestion = p.fields.find(c => c.id === `question:demo-experience:${field}`);
      assert.ok(suggestion.issues.some(i => i.code === 'empty_source'));
      assert.equal(suggestion.after, field === 'researchQuestion' ? `${firstText}\n\u3000\t` : `${firstText}\n `);
      await assert.rejects(() => applyTopicQuestionnaire(p, f.source, f.target, [suggestion.id]), /为空或仅含空白/);
    }
    assert.deepEqual(f.target.design, original);
  }
});

test('selection is snapshotted before waiting so caller mutation cannot change the chosen fields', async () => {
  const f = fixture(), p = await prepareTopicQuestionnaire(f.source, f.target), selected = ['brief:title'];
  const pending = applyTopicQuestionnaire(p, f.source, f.target, selected); selected[0] = 'brief:objective';
  const result = await pending;
  assert.equal(result.after.title, f.source.brief.title); assert.equal(result.after.objective, f.target.design.objective);
  assert.deepEqual(result.provenance.changes.map(c => c.id), ['brief:title']);
});
