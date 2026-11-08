import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FullReportInputError, FullReportProviderError, validateFullReportBase,
  generateFullReportWithAgent, callLlmForSection, buildSectionTokens,
  buildSkillPackContract, parseAndHydrateSectionDraft, finalizeReport,
} from '../lib/agent/full-report-pipeline.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { newQuestionnaire } from '../lib/questionnaire.ts';
import { emptyReference } from '../lib/references.ts';
import { digestText, snapshotRecipe } from '../lib/research-quality.ts';
import { buildDemoPack, decomposeTopic } from '../lib/agent/demo-study.ts';
import { matchBlueprintNode } from '../lib/report-blueprint.ts';
import { targetSection } from '../lib/report-placement.ts';

const project = { projectId: 'project-one', runId: 'run-one', inputRevision: 'revision-one' };
const draft = (...texts) => JSON.stringify({ paragraphs: texts.map(text => ({ text })) });
const validText = '拟根据研究问题界定调查对象，并说明样本覆盖范围与待验证的限制。';
const usage = { prompt: 13, completion: 7, total: 20 };
const sectionGenerator = async () => ({ content: draft(validText), usage });
const planBase = () => ({ design: newQuestionnaire(), dataset: null, report: createEditorContent() });
const plan = (extra = {}) => ({ mode: 'plan', base: planBase(), sectionNodes: ['design.population'], concurrency: 1, sectionGenerator, ...extra });
const findSection = (report, nodeId) => report.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);

async function empiricalBase() {
  const sourceHash = await digestText('answer\nA\nB\nA\n');
  const result = await snapshotRecipe({ method: 'fixture-count', n: 3, total: 3, headers: ['答案', '频数'], rows: [['A', 2], ['B', 1]], metrics: [], warnings: [] },
    { title: '测试登记结果', sourceName: 'test.csv', sourceUrl: '', sourceHash, classification: 'user_provided' }, 'real-result');
  const report = { ...createEditorContent(), version: 2, quality: { version: 1, results: [result], findings: [] } };
  return {
    design: newQuestionnaire(),
    dataset: { name: 'test.csv', sourceHash, kind: 'user_provided', table: { headers: ['answer'], rows: [['A'], ['B'], ['A']], delimiter: ',', skippedBlankLines: 0 }, missingCodes: [], lineage: [] },
    report,
  };
}

test('plan accepts dataset:null, captures inputs and propagates project scope without synthesizing data', async () => {
  const base = planBase();
  const snapshot = structuredClone(base);
  const events = [];
  let request;
  const result = await generateFullReportWithAgent(plan({ base, project,
    sectionGenerator: async r => { request = r; return { content: draft(validText), usage }; },
    onProgress: event => { events.push(structuredClone(event)); if (event.report) event.report.title = 'mutated by listener'; },
  }));
  assert.deepEqual(base, snapshot, 'the caller’s project is never cleared or repaired in place');
  assert.equal(result.pack.dataset, null);
  assert.equal(result.contract.mode, 'plan');
  assert.equal(result.contract.dataStatus, 'planned');
  assert.equal(result.report.quality?.results.length ?? 0, 0);
  assert.notEqual(result.report.title, 'mutated by listener');
  assert.doesNotThrow(() => parseEditorContent(result.report), 'the plan draft remains a valid editor document');
  assert.deepEqual(result.project, project);
  assert.ok(events.every(event => JSON.stringify(event.project) === JSON.stringify(project)));
  assert.equal(request.nodeId, 'design.population');
  assert.equal(request.wave, 1);
  assert.equal(request.attempt, 1);
  assert.equal(request.purpose, 'draft');
  assert.match(request.prompt, /当前是研究计划/u);
  assert.equal(result.summary.promptTokens, 13);
  assert.equal(result.summary.completionTokens, 7);
  assert.equal(result.summary.totalTokens, 20);
  assert.equal(result.summary.usageReported, true);
  assert.equal(result.summary.fallbackCount, 0);
});

test('legacy plan inputs form a real design/report base with dataset:null', async () => {
  const base = planBase();
  const result = await generateFullReportWithAgent({ mode: 'plan', existingDesign: base.design, existingReport: base.report, sectionNodes: ['design.purpose'], sectionGenerator });
  assert.equal(result.pack.dataset, null);
  assert.deepEqual(result.pack.design, base.design);
});

test('missing empirical base and project, simulated inputs, source mismatch and tampered results fail before model calls', async () => {
  let calls = 0;
  const never = async () => { calls++; return { content: draft(validText) }; };
  await assert.rejects(generateFullReportWithAgent({ mode: 'empirical', project, sectionGenerator: never }), e => e instanceof FullReportInputError && e.code === 'base_required');
  const base = await empiricalBase();
  const candidates = [
    [base, undefined, 'saved_project_required'],
    [base, { ...project, projectId: 'local' }, 'saved_project_required'],
    [{ ...base, dataset: null }, project, 'empirical_evidence_required'],
    [{ ...base, dataset: { ...base.dataset, kind: 'simulated' } }, project, 'mode_conflict'],
    [{ ...base, dataset: { ...base.dataset, sourceHash: 'b'.repeat(64) } }, project, 'source_hash_mismatch'],
    [{ ...base, report: { ...base.report, quality: { ...base.report.quality, results: [{ ...base.report.quality.results[0], resultHash: 'c'.repeat(64) }] } } }, project, 'result_hash_mismatch'],
    [{ ...base, report: { ...base.report, quality: { ...base.report.quality, results: [{ ...base.report.quality.results[0], classification: 'simulated' }] } } }, project, 'mode_conflict'],
  ];
  for (const [candidate, scope, code] of candidates) await assert.rejects(generateFullReportWithAgent({ mode: 'empirical', base: candidate, project: scope, sectionGenerator: never }), e => e.code === code, code);
  assert.equal(calls, 0);
});

test('valid empirical provenance remains collected, not independently verified research', async () => {
  const base = await empiricalBase();
  await validateFullReportBase(base, 'empirical', project);
  const original = structuredClone(base);
  const result = await generateFullReportWithAgent({ mode: 'empirical', base, project, sectionNodes: ['design.population'], sectionGenerator });
  assert.equal(result.contract.dataStatus, 'collected');
  assert.deepEqual(base, original);
  assert.deepEqual(result.pack.dataset, base.dataset);
  assert.equal(result.contract.statsLedger[0].pValue, '未登记检验 p 值');
  assert.equal(result.contract.statsLedger[0].effectSize, '未登记效应量');
  assert.match(result.contract.statsLedger[0].assumptionCheck, /未独立核验/u);
  assert.equal(result.quality.deliverable, false);
  assert.equal(result.quality.checks.find(c => c.id === 'result_integrity').status, 'pass');
  assert.equal(result.quality.checks.find(c => c.id === 'statistical_review').status, 'not_run');
});

test('captured input does not follow caller mutations during a model request', async () => {
  const base = planBase();
  const title = base.report.title;
  const scope = { ...project };
  const result = await generateFullReportWithAgent(plan({ base, project: scope, sectionGenerator: async () => {
    base.report.title = 'a later project version';
    base.design.title = 'later questionnaire';
    scope.inputRevision = 'later';
    return { content: draft(validText), usage };
  } }));
  assert.equal(result.report.title, title);
  assert.notEqual(result.pack.design.title, base.design.title);
  assert.equal(result.project.inputRevision, 'revision-one');
});

test('a teaching demonstration rejects genuine data and always visibly discloses simulation', async () => {
  await assert.rejects(validateFullReportBase(await empiricalBase(), 'demonstration', project), e => e.code === 'mode_conflict');
  const demo = await buildDemoPack('');
  const before = structuredClone(demo);
  const result = await generateFullReportWithAgent({ mode: 'demonstration', base: demo, sectionNodes: ['design.population'], sectionGenerator });
  assert.deepEqual(demo, before);
  assert.equal(result.contract.dataStatus, 'synthetic');
  assert.match(findSection(result.report, 'design.population').body, /教学模拟数据/u);
});

test('unknown outcome and auth/quota/rate/version errors stop further paid dispatch with no retries', async () => {
  for (const code of ['outcome_unknown', 'provider_auth', 'provider_quota', 'provider_rate_limit', 'service_version_conflict', 'network_outcome_unknown', 'invalid_server_receipt', 'input_revision_changed', 'unauthorized', 'forbidden', 'model_service_unavailable', 'invalid_report_input']) {
    let calls = 0;
    const result = await generateFullReportWithAgent(plan({ sectionNodes: ['design.population', 'design.purpose', 'abstract'], sectionGenerator: async () => {
      calls++;
      throw new FullReportProviderError(code);
    } }));
    assert.equal(calls, 1, code);
    assert.equal(result.summary.llmSuccessCount, 0, code);
    assert.equal(result.summary.totalParagraphsWritten, 0, code);
    assert.equal(result.summary.fallbackCount, 3, code);
    assert.equal(result.quality.status, 'blocked', code);
    assert.equal(result.summary.usageReported, false, code);
    assert.ok(result.traces.every(trace => trace.keptParagraphs === 0), code);
  }
});

test('already in-flight requests may settle, while a circuit breaker prevents new scheduling', async () => {
  let entered = 0;
  let release;
  let secondStarted;
  const secondReady = new Promise(resolve => { secondStarted = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const resultPromise = generateFullReportWithAgent(plan({ concurrency: 2, sectionNodes: ['design.purpose', 'design.population', 'design.content', 'abstract'], sectionGenerator: async () => {
    entered++;
    if (entered === 1) { await secondReady; throw new FullReportProviderError('outcome_unknown'); }
    secondStarted();
    await pending;
    return { content: draft(validText), usage };
  } }));
  await secondReady;
  await new Promise(resolve => setImmediate(resolve));
  release();
  const result = await resultPromise;
  assert.equal(entered, 2);
  assert.equal(result.summary.llmSuccessCount, 1);
  assert.equal(result.quality.status, 'blocked');
  assert.equal(result.summary.totalTokens, 20);
  assert.equal(result.summary.usageReported, false);
});

test('known provider failures never retry a section; raw exception messages never enter results', async () => {
  let calls = 0;
  const secret = 'provider-secret-and-prompt-contents';
  const result = await generateFullReportWithAgent(plan({ sectionGenerator: async () => { calls++; throw Error(secret); } }));
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.traces[0].errorCode, 'outcome_unknown');
  const known = await generateFullReportWithAgent(plan({ sectionGenerator: async () => { throw new FullReportProviderError('provider_failed', { status: 400 }); } }));
  assert.equal(known.traces[0].httpStatus, 400);
  assert.equal(known.summary.llmSuccessCount, 0);
});

test('only known content rejection triggers one rewrite, and both actual token receipts are counted', async () => {
  const requests = [];
  const result = await generateFullReportWithAgent(plan({ sectionGenerator: async request => {
    requests.push(request);
    return requests.length === 1 ? { content: draft('调查已覆盖999名用户。'), usage } : { content: draft(validText), usage: { prompt: 21, completion: 9, total: 30 } };
  } }));
  assert.deepEqual(requests.map(r => [r.attempt, r.purpose]), [[1, 'draft'], [2, 'draft']]);
  assert.equal(result.summary.llmSuccessCount, 1);
  assert.equal(result.summary.totalParagraphsWritten, 1);
  assert.equal(result.summary.totalDroppedParagraphs, 1);
  assert.equal(result.summary.promptTokens, 34);
  assert.equal(result.summary.completionTokens, 16);
  assert.equal(result.summary.totalTokens, 50);
  assert.equal(result.summary.usageReported, true);
  assert.match(requests[1].prompt, /上一稿全部段落被拒收/u);
});

test('an invalid content response is bounded to two attempts and fallback remains non-model prose', async () => {
  let calls = 0;
  const result = await generateFullReportWithAgent(plan({ sectionGenerator: async () => { calls++; return { content: 'not-json', usage }; } }));
  assert.equal(calls, 2);
  assert.equal(result.summary.fallbackCount, 1);
  assert.equal(result.summary.totalParagraphsWritten, 0);
  assert.equal(result.summary.totalTokens, 40);
  assert.equal(result.summary.usageReported, true);
  assert.equal(result.quality.status, 'blocked');
});

test('partial, invalid and missing usage never become a made-up prompt/completion split', async () => {
  for (const incomplete of [undefined, { total: 50 }, { prompt: 1, completion: 2, total: 50 }, { prompt: -1, completion: 2, total: 1 }]) {
    const result = await generateFullReportWithAgent(plan({ sectionGenerator: async () => ({ content: draft(validText), usage: incomplete }) }));
    assert.equal(result.summary.usageReported, false);
    assert.equal(result.summary.totalTokens, 0);
    assert.equal(result.summary.promptTokens, 0);
    assert.equal(result.summary.completionTokens, 0);
  }
  let calls = 0;
  const mixed = await generateFullReportWithAgent(plan({ sectionGenerator: async () => ++calls === 1 ? { content: draft('已调查999人。'), usage } : { content: draft(validText) } }));
  assert.equal(mixed.summary.totalTokens, 20, 'known receipt remains visible although another receipt is missing');
  assert.equal(mixed.summary.usageReported, false);
});

test('cancellation before dispatch and after a late callback never commits or emits done', async () => {
  const before = new AbortController();
  before.abort();
  let calls = 0;
  await assert.rejects(generateFullReportWithAgent(plan({ signal: before.signal, sectionGenerator: async () => { calls++; return { content: draft(validText) }; } })), { name: 'AbortError' });
  assert.equal(calls, 0);
  const during = new AbortController();
  const events = [];
  await assert.rejects(generateFullReportWithAgent(plan({ signal: during.signal, sectionNodes: ['design.purpose', 'design.population'],
    onProgress: event => events.push(event), sectionGenerator: async request => {
      calls++;
      assert.equal(request.signal, during.signal);
      during.abort();
      return { content: draft(validText), usage };
    },
  })), { name: 'AbortError' });
  assert.equal(calls, 1);
  assert.deepEqual(events.map(e => e.phase), ['contract']);
});

test('cancelling from a progress listener stops the queue and never emits repair or done', async () => {
  const controller = new AbortController();
  const phases = [];
  let calls = 0;
  await assert.rejects(generateFullReportWithAgent(plan({ signal: controller.signal, sectionNodes: ['design.purpose', 'design.population'],
    sectionGenerator: async () => { calls++; return { content: draft(validText), usage }; },
    onProgress: event => { phases.push(event.phase); if (event.phase === 'wave1') controller.abort(); },
  })), { name: 'AbortError' });
  assert.equal(calls, 1);
  assert.deepEqual(phases, ['contract', 'wave1']);
});

test('direct HTTP adapter sanitizes provider errors, reports actual usage and preserves cancellation', async () => {
  for (const [status, code] of [[401, 'provider_auth'], [403, 'provider_auth'], [402, 'provider_quota'], [409, 'service_version_conflict'], [429, 'provider_rate_limit'], [503, 'outcome_unknown']]) {
    await assert.rejects(callLlmForSection('private prompt', { apiKey: 'not-a-real-key' }, async () => new Response('secret-key-echo', { status })), error => error.code === code && !error.message.includes('secret'));
  }
  const response = await callLlmForSection('prompt', { apiKey: 'not-a-real-key' }, async () => new Response(JSON.stringify({ choices: [{ message: { content: draft(validText) } }], usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 } })));
  assert.deepEqual(response.usage, { prompt: 11, completion: 5, total: 16 });
  const controller = new AbortController();
  await assert.rejects(callLlmForSection('prompt', { apiKey: 'not-a-real-key' }, async (_url, init) => {
    controller.abort();
    assert.equal(init.signal.aborted, true);
    return new Response(JSON.stringify({ choices: [{ message: { content: draft(validText) } }] }));
  }, controller.signal), { name: 'AbortError' });
});

test('fallback restores the author’s paragraph blocks and is not silently counted as model output', async () => {
  const base = planBase();
  base.report = { ...targetSection(base.report, 'design.population').content, version: 2 };
  const section = findSection(base.report, 'design.population');
  assert.ok(section);
  section.body = '作者已确认的原有调查对象说明。';
  section.blocks = [{ id: 'author-block', kind: 'paragraph', text: '作者的段落块。', evidenceId: '', valueColumn: 0 }];
  const result = await generateFullReportWithAgent(plan({ base, sectionGenerator: async () => { throw new FullReportProviderError('provider_failed'); } }));
  const restored = findSection(result.report, 'design.population');
  assert.equal(restored.body, section.body);
  assert.deepEqual(restored.blocks, section.blocks);
  assert.equal(result.summary.totalParagraphsWritten, 0);
  assert.equal(result.traces[0].keptParagraphs, 0);
});

test('independent, literature, statistics, file, render and submission gates remain not_run', async () => {
  const result = await generateFullReportWithAgent(plan());
  for (const id of ['independent_review', 'literature_verification', 'statistical_review', 'export_files', 'render_review', 'submission_gate']) {
    assert.equal(result.quality.checks.find(check => check.id === id).status, 'not_run', id);
  }
  assert.equal(result.quality.deliverable, false);
  assert.ok(['draft', 'needs_review', 'blocked'].includes(result.quality.status));
  assert.ok(!result.quality.checks.some(check => /100.*交付|已完成.*提交/u.test(check.detail)));
});

test('a real model revision records its actual before/after text, cleared checks and revision usage', async () => {
  const events = [];
  const requests = [];
  const initial = '整体满意度与复游推荐意愿相关，说明满意度导致了复游意愿上升，见{G1}。';
  const revised = '整体满意度与复游推荐意愿呈正向关联，不能说明因果方向，见{G1}。';
  const result = await generateFullReportWithAgent({ mode: 'demonstration', sectionNodes: ['compare.tests'], concurrency: 1,
    sectionGenerator: async request => { requests.push(request); return { content: draft(request.purpose === 'draft' ? initial : revised), usage }; },
    onProgress: event => events.push(event),
  });
  const revision = result.revisions.find(r => r.kind === 'model_revision');
  assert.ok(revision);
  assert.equal(revision.before, events.find(e => e.phase === 'wave1').body);
  assert.match(revision.before, /导致/u);
  assert.match(revision.after, /不能说明因果方向/u);
  assert.ok(revision.checkIds.includes('causal'));
  assert.equal(revision.nodeId, 'compare.tests');
  assert.equal(result.summary.revisedSections, 1);
  assert.equal(result.summary.totalTokens, requests.length * usage.total);
  assert.equal(requests.filter(r => r.purpose === 'revision').length, 1);
  assert.deepEqual(events.find(e => e.phase === 'repair').revisions, result.revisions);
  let replay = revision.after;
  for (const finishing of result.revisions.filter(r => r.kind === 'finishing' && r.sectionId === revision.sectionId)) {
    assert.equal(finishing.before, replay);
    replay = finishing.after;
  }
  assert.equal(findSection(result.report, 'compare.tests').body, replay);
});

test('unchanged or unhelpful model responses never create a synthetic revision history', async () => {
  const text = '整体满意度与复游推荐意愿相关，说明满意度导致了复游意愿上升，见{G1}。';
  const result = await generateFullReportWithAgent({ mode: 'demonstration', sectionNodes: ['compare.tests'], sectionGenerator: async () => ({ content: draft(text), usage }) });
  assert.equal(result.revisions.filter(r => r.kind === 'model_revision').length, 0);
  assert.equal(result.summary.revisedSections, 0);
  assert.ok(result.revisions.every(r => r.before !== r.after));
});

test('finishing logs only actual figure and simulation disclosure edits and leaves other sections intact', () => {
  const original = { ...targetSection(createEditorContent(), 'design.population').content, version: 2 };
  const section = findSection(original, 'design.population');
  section.body = '作者的调查对象说明。';
  section.blocks = [{ id: 'chart-one', kind: 'chart', text: '示意图', evidenceId: '', valueColumn: 0 }];
  const snapshot = structuredClone(original);
  const out = finalizeReport(original, new Map(), new Set(['design.population']), 'demonstration');
  assert.deepEqual(original, snapshot);
  assert.equal(out.revisions.length, 2);
  assert.equal(out.revisions[0].before, section.body);
  assert.equal(out.revisions[1].before, out.revisions[0].after);
  assert.equal(out.revisions[1].after, findSection(out.content, 'design.population').body);
  assert.ok(out.revisions.every(revision => revision.kind === 'finishing'));
  for (const other of original.report.filter(s => s.id !== section.id)) assert.deepEqual(out.content.report.find(s => s.id === other.id), other);
});

test('only verified structured references become stable citation tokens; bare references invent no metadata', () => {
  const base = planBase();
  base.report.references = [
    { ...emptyReference(), id: 'ref-verified', title: '已核原文', authors: ['作者'], year: '2020', verification: 'verified', locator: '方法部分' },
    { ...emptyReference(), id: 'ref-pending', title: '待核条目', verification: 'metadata_only' },
  ];
  const held = { results: [], findings: [], pending: false, placed: [] };
  const tokens = buildSectionTokens(held, base.report, 'intro.literature', base.design);
  assert.deepEqual(tokens.references.map(r => r.value), ['[[引:ref-verified]]']);
  const plain = { ...base.report, references: [], report: [...base.report.report, { id: 'refs', title: '参考文献', body: '[1] 一条来源不详的文献', source: '' }] };
  assert.equal(buildSectionTokens(held, plain, 'intro.literature', base.design).references.length, 0);
  const contract = buildSkillPackContract({ ...base, report: plain, blueprint: decomposeTopic('') }, decomposeTopic(''), 'plan');
  const ref = contract.literatureLedger.find(r => r.title.includes('来源不详'));
  assert.ok(ref);
  assert.equal(ref.authors, '');
  assert.equal(ref.year, '');
  assert.equal(ref.venue, '');
  assert.equal(ref.verificationStatus, 'metadata_only');
  assert.equal(contract.designMatrix.length, 0, 'a blank questionnaire does not inherit a made-up five-factor design');
});

test('valid tokens do not permit response-rate or total-N substitution into subgroup claims', () => {
  const tokens = { facts: [
    { id: 'F1', text: '有效回收率为 80%', value: '80%' },
    { id: 'F2', text: '总体有效样本为 100', value: '100' },
    { id: 'F3', text: '交叉表中「A组」的人数为 20', value: '20' },
  ], exhibits: [], references: [] };
  const context = { methods: [], planSection: false };
  assert.equal(parseAndHydrateSectionDraft(draft('某组选择该服务的比例为{F1}。'), tokens, context).paragraphs.length, 0);
  assert.equal(parseAndHydrateSectionDraft(draft('其中「A组」受访者人数为{F2}人。'), tokens, context).paragraphs.length, 0);
  assert.equal(parseAndHydrateSectionDraft(draft('总体有效样本为{F2}份，有效回收率为{F1}。'), tokens, context).paragraphs.length, 1);
  assert.equal(parseAndHydrateSectionDraft(draft('其中「A组」受访者人数为{F3}人。'), tokens, context).paragraphs.length, 1);
});
