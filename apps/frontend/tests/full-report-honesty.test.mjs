import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_NODE,
  awaitsResults,
  buildSectionTokens,
  categoryLabels,
  buildSkillPackContract,
  generateFullReportWithAgent,
  parseAndHydrateSectionDraft,
  sanitizeModelParagraph,
  tidyComparisons,
  unbackedAnalyses,
} from '../lib/agent/full-report-pipeline.ts';
import { decomposeContestTopic, forgeNationalAwardPack } from '../lib/agent/hanchao-benchmark.ts';
import { benchmarkReport } from '../lib/report-benchmark.ts';

const tokens = {
  facts: [
    { id: 'F1', text: '有效回收率为 94.4%', value: '94.4%' },
    { id: 'F2', text: '有效样本为 641', value: '641' },
  ],
  exhibits: [{ id: 'G1', text: '本节表「交叉表」', value: '[[表:t1]]' }],
  references: [],
};
const draft = (...texts) => JSON.stringify({ paragraphs: texts.map(text => ({ text })) });
const results = { methods: ['crosstab', 'spearman', 'alpha'], planSection: false };

test('a number written out in Chinese is refused like a digit', () => {
  for (const text of [
    '高满意度组复游意愿的优势约为参照组的一点八倍，见{G1}。',
    '高校受众的双赛皆看率高出城区受众约十四个百分点。',
    '约百分之三十的受访者表示愿意复游。',
    '超过四成受访者认为交通是短板。',
  ]) {
    const out = parseAndHydrateSectionDraft(draft(text), tokens, results);
    assert.equal(out.paragraphs.length, 0, text);
    assert.deepEqual(out.dropReasons, ['用汉字写了数量'], text);
  }
  // Structure stays expressible: dimensions, item numbers, ordinals and "this point" are not quantities.
  const kept = parseAndHydrateSectionDraft(draft('五维量表覆盖题一至题十二，一是氛围，二是交通；这一点十分关键，有效样本{F2}份。'), tokens, results);
  assert.equal(kept.paragraphs.length, 1);
  assert.match(kept.paragraphs[0], /有效样本641份/u);
});

test('a results paragraph may not claim an analysis no registered result comes from', () => {
  const claims = [
    '在有序 Logit 模型中，满意度每提高一个单位，复游意愿的优势比大于一。',
    '共线性诊断显示各解释变量的方差膨胀因子处于温和区间。',
    '因子分析表明量表结构清晰，KMO 检验通过。',
  ];
  for (const text of claims) {
    const out = parseAndHydrateSectionDraft(draft(text), tokens, results);
    assert.equal(out.paragraphs.length, 0, text);
    assert.match(out.dropReasons[0], /未登记的分析/u, text);
  }
  assert.deepEqual(unbackedAnalyses(claims[0], ['logistic']), [], 'a registered model backs its own claims');
  // The platform registers factor analysis as its validity check: that result backs KMO and loadings.
  assert.deepEqual(unbackedAnalyses(claims[2], ['validity']), []);
  assert.deepEqual(unbackedAnalyses(claims[2], ['alpha']), ['因子分析或 KMO 检验']);
  // A design section names the analyses the study means to run.
  assert.equal(parseAndHydrateSectionDraft(draft(claims[0]), tokens, { ...results, planSection: true }).paragraphs.length, 1);
  assert.ok(PLAN_NODE.test('design.methods') && !PLAN_NODE.test('drivers.model'));
  // A results section still awaiting its results may set out the model as planned, never report it as run.
  const awaiting = { ...results, pending: true };
  assert.equal(parseAndHydrateSectionDraft(draft('本节分析结果尚未登记，拟以复游推荐意愿为被解释变量构建有序 Logit 模型，并计划检验平行线假定。'), tokens, awaiting).paragraphs.length, 1);
  assert.equal(parseAndHydrateSectionDraft(draft(claims[1]), tokens, awaiting).paragraphs.length, 0);
  assert.equal(awaitsResults('drivers.model', []), true);
  assert.equal(awaitsResults('design.methods', []), false, 'a plan section is not a results section');
});

test('the sanitizer keeps what a sentence says: a threshold is not turned into significance, a year not into "recently"', () => {
  assert.match(sanitizeModelParagraph('Pearson χ² 检验的统计量为{F1}。'), /χ²/u);
  for (const text of ['性别差异 p>0.05，不显著。', '该政策于2024年发布。']) {
    const out = parseAndHydrateSectionDraft(draft(text), tokens, results);
    assert.equal(out.paragraphs.length, 0, text);
    assert.deepEqual(out.dropReasons, ['占位符之外写了阿拉伯数字'], text);
  }
});

test('section facts come only from registered results and the study records, never from typed-in numbers', async () => {
  const pack = await forgeNationalAwardPack('');
  const results = pack.report.quality.results;
  const held = { results, findings: pack.report.quality.findings ?? [], pending: false, placed: results.map(r => r.id) };
  const facts = buildSectionTokens(held, pack.report, 'data.pilot', pack.design).facts;
  // Every fact value is a registered metric, a registered cell, a rate worked out from two registered counts, or the questionnaire's length.
  const registered = new Set(results.flatMap(r => [String(r.n), ...r.metrics.map(m => m.value), ...r.rows.flat()].filter(v => v !== null).map(v => String(v).replace(/%$/u, ''))));
  for (const f of facts) {
    const bare = f.value.replace(/%$/u, '');
    const known = registered.has(bare) || [...registered].some(v => Number(v) === Number(bare)) || /有效回收率为/u.test(f.text) || /道题$/u.test(f.text);
    assert.ok(known, `${f.id} ${f.text}`);
  }
  // Typed into the pipeline before, registered by no result: a KMO, a pilot KMO, a CITC floor, an expected count, an n0.
  for (const typed of ['0.864', '0.841', '0.68', '26.37', '384.16']) assert.ok(!facts.some(f => f.value === typed), typed);
  const rate = facts.find(f => /有效回收率为/u.test(f.text));
  assert.equal(rate?.value, '94.4%', 'the rate is 641 valid of 679 issued, as the frame registers them');
});

test('a simulated pack is always written up as a teaching demonstration, and its plain references are not called verified', async () => {
  const pack = await forgeNationalAwardPack('');
  const contract = buildSkillPackContract(pack, decomposeContestTopic(''), 'demonstration');
  assert.ok(contract.literatureLedger.every(l => l.verificationStatus !== 'verified' || (pack.report.references ?? []).some(r => r.id === l.sourceId && r.verification === 'verified')));
  assert.ok(contract.designMatrix.every(row => !/Logit|优势比/u.test(row.analysisMethod)), 'no analysis is planned as done that no result registers');
  const res = await generateFullReportWithAgent({
    mode: 'empirical',
    llm: { apiKey: 'sk-test-mock', concurrency: 4 },
    sectionNodes: ['compare.tests'],
    fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: draft('列联检验显示两类受众的观赛状态分布存在关联，见{G1}。') } }] }), { status: 200 }),
  });
  assert.equal(res.contract.mode, 'demonstration');
  assert.equal(res.contract.dataStatus, 'synthetic');
});

test('a flagged section goes back to the model once; the revision is kept because it clears the problem, and the score is the text\'s own', async () => {
  const prompts = [];
  const reply = paragraphs => new Response(JSON.stringify({ choices: [{ message: { content: draft(...paragraphs) } }], usage: { total_tokens: 10 } }), { status: 200 });
  const fetcher = async (_url, init) => {
    const prompt = JSON.parse(init.body).messages[0].content;
    prompts.push(prompt);
    if (prompt.includes('审稿修订助手')) return reply(['整体满意度与复游推荐意愿呈正向关联，这一关联不能说明因果方向，见{G1}。']);
    return reply(['整体满意度与复游推荐意愿相关，说明满意度导致了复游意愿上升，见{G1}。']);
  };
  const res = await generateFullReportWithAgent({ llm: { apiKey: 'sk-test-mock', concurrency: 2 }, sectionNodes: ['compare.tests'], fetcher });
  const revisions = prompts.filter(p => p.includes('审稿修订助手'));
  assert.equal(revisions.length, 1, 'one revision round');
  assert.match(revisions[0], /因果/u, 'the revision prompt names the problem');
  const section = res.report.report.find(s => s.body.includes('不能说明因果方向'));
  assert.ok(section, 'the revised text is in the report');
  assert.ok(!res.report.report.some(s => s.body.includes('导致了复游意愿上升')), 'the flagged sentence is gone');
  assert.equal(res.summary.revisedSections, 1);
  assert.ok(res.repairsApplied.some(r => r.includes('按审稿意见修订')));
  assert.equal(res.summary.finalScore, benchmarkReport(res.report).score);
  // No sentence is typed in to pass a check.
  const all = res.report.report.map(s => s.body).join('\n');
  for (const boilerplate of ['借鉴了既有权威文献', '有效回收率为 94.4%。', '季度脉冲监测指标']) assert.ok(!all.includes(boilerplate), boilerplate);
});

test('each section is written under its advisor: the advisor\'s skill and rules are in its prompt and its trace names it', async () => {
  const prompts = [];
  const fetcher = async (_url, init) => {
    prompts.push(JSON.parse(init.body).messages[0].content);
    return new Response(JSON.stringify({ choices: [{ message: { content: draft('本节说明分层抽样的设计思路与各层的入样安排。') } }] }), { status: 200 });
  };
  const res = await generateFullReportWithAgent({ llm: { apiKey: 'sk-test-mock', concurrency: 2 }, sectionNodes: ['design.sampling', 'compare.tests'], fetcher });
  const sampling = prompts.find(p => p.includes('节点 ID：design.sampling'));
  assert.match(sampling, /【本节负责顾问】「调查设计顾问」（技能 market-research-design）/u);
  assert.match(sampling, /不借用随机抽样的名称/u, 'the advisor\'s own rule is in the prompt');
  assert.match(prompts.find(p => p.includes('节点 ID：compare.tests')), /「统计建模顾问」/u);
  assert.deepEqual(Object.fromEntries(res.traces.map(t => [t.nodeId, t.advisor])), { 'design.sampling': 'design', 'compare.tests': 'modeling' });
});

test('a rate bound to a count is refused: the share must be a share', () => {
  // F1 is a rate (94.4%), F2 a count (641).
  assert.equal(parseAndHydrateSectionDraft(draft('有效回收率为{F1}。'), tokens, results).paragraphs.length, 1);
  const wrong = parseAndHydrateSectionDraft(draft('实回收有效样本{F2}份，有效回收率为{F2}。'), tokens, results);
  assert.deepEqual(wrong.dropReasons, ['比率处引用了不是比率的数字']);
  assert.equal(parseAndHydrateSectionDraft(draft('有效样本为{F2}份。'), tokens, results).paragraphs.length, 1, 'a count where a count belongs is fine');
});

test('a number is never pointed to as if it were a table or figure, and a cited bound keeps one comparison', () => {
  for (const text of ['回归结果（见{F2}）仅作关联描述。', 'p 值小于{F1}所示水平。']) {
    const out = parseAndHydrateSectionDraft(draft(text), tokens, results);
    assert.deepEqual(out.dropReasons, ['把数字当作图表引用（“见…”“…所示”只能跟图表 {G编号}）'], text);
  }
  assert.equal(parseAndHydrateSectionDraft(draft('有效样本{F2}份，见{G1}。'), tokens, results).paragraphs.length, 1, 'an exhibit may be pointed to');
  // A p-value prints with its own sign: "小于" before it would read "小于<0.001".
  const bound = { ...tokens, facts: [...tokens.facts, { id: 'F3', text: '检验的 p 值为 <0.001', value: '<0.001' }] };
  assert.equal(parseAndHydrateSectionDraft(draft('两组差异的 p 值小于{F3}。'), bound, results).paragraphs[0], '两组差异的 p 值小于0.001。');
  assert.equal(tidyComparisons('p值均为<0.001'), 'p值均小于0.001');
  assert.equal(tidyComparisons('p=<0.001，ρ为0.851'), 'p<0.001，ρ为0.851');
  assert.equal(tidyComparisons('（p<<0.001）'), '（p<0.001）');
  assert.equal(tidyComparisons('p<0.001，F 为187.53'), 'p<0.001，F 为187.53', 'a plain bound and other values are left alone');
});

test('a registered category may carry digits in its name; other digits are still refused', () => {
  const results = [{ rows: [['60–70岁', 120, 45.2], ['71岁及以上', 146, 54.8]] }];
  const design = { questions: [{ choices: [{ code: '1', label: '9–12 元' }, { code: '2', label: '13–18 元' }] }] };
  const labels = categoryLabels(results, design);
  assert.deepEqual(new Set(labels), new Set(['71岁及以上', '60–70岁', '13–18 元', '9–12 元']));
  assert.ok(labels.every((l, i) => i === 0 || labels[i - 1].length >= l.length), 'longest names first, so a short name never cuts a longer one');
  const named = parseAndHydrateSectionDraft(draft('「60–70岁」受访者中选择「9–12 元」档位的比例最高，为{F1}。'), tokens, { ...results, methods: [], planSection: false, labels });
  assert.equal(named.paragraphs.length, 1);
  assert.match(named.paragraphs[0], /60–70岁.*9–12 元.*94\.4%/u);
  const invented = parseAndHydrateSectionDraft(draft('「60–70岁」受访者中约有 45 人选择「9–12 元」档位。'), tokens, { methods: [], planSection: false, labels });
  assert.deepEqual(invented.dropReasons, ['占位符之外写了阿拉伯数字']);
});

test('in a project, only the sections asked for are drafted; the others keep their text, figures and tables', async () => {
  const pack = await forgeNationalAwardPack('城市社区嵌入式养老服务的使用体验与满意度调查');
  const report = structuredClone(pack.report);
  const compare = report.report.find(s => /差异检验/u.test(s.title));
  compare.body = '【教学模拟数据，不能作为实际调查结果】\n这是作者已经写好的比较一节。';
  compare.blocks = [...(compare.blocks ?? []), { id: 'blk-own-paragraph', kind: 'paragraph', text: '作者自己的一段解读。', evidenceId: '', valueColumn: 1 }];
  const fetcher = async () => new Response(JSON.stringify({ choices: [{ message: { content: draft('本节说明调查对象的界定与纳入范围。') } }] }), { status: 200 });
  const res = await generateFullReportWithAgent({ topic: '城市社区嵌入式养老服务的使用体验与满意度调查', base: { design: pack.design, dataset: pack.dataset, report }, llm: { apiKey: 'sk-test-mock', concurrency: 2 }, sectionNodes: ['design.population', 'plan.measures'], fetcher });
  const kept = res.report.report.find(s => s.id === compare.id);
  assert.equal(kept.body, compare.body, 'a section not asked for keeps its text');
  assert.ok(kept.blocks.some(b => b.id === 'blk-own-paragraph'), 'and its own paragraphs');
  const drafted = res.report.report.find(s => /调查对象/u.test(s.title));
  assert.ok(drafted.body.includes('纳入范围'), 'a section asked for is drafted');
  assert.equal(drafted.source, report.report.find(s => s.id === drafted.id).source, 'its printed source stays the author\'s: no drafting note in the submission');
  assert.ok(res.report.report.some(s => /改进措施|方案设计/u.test(s.title) && s.body.includes('纳入范围')), 'a section asked for but missing is added and drafted');
  assert.deepEqual(res.report.quality.results.map(r => r.id), pack.report.quality.results.map(r => r.id), 'the project\'s results are the ones written from');
});

test('a second revision round may fix what the first did not; without a sampling frame the prompt bars probability-sampling names', async () => {
  const prompts = [];
  let revisions = 0;
  const reply = text => new Response(JSON.stringify({ choices: [{ message: { content: draft(text) } }] }), { status: 200 });
  const fetcher = async (_url, init) => {
    const prompt = JSON.parse(init.body).messages[0].content;
    prompts.push(prompt);
    if (!prompt.includes('审稿修订助手')) return reply('整体满意度与复游推荐意愿相关，说明满意度导致了复游意愿上升，见{G1}。');
    revisions++;
    return reply(revisions === 1 ? '整体满意度与复游推荐意愿相关，满意度导致了复游意愿上升，见{G1}。' : '整体满意度与复游推荐意愿呈正向关联，不能说明因果方向，见{G1}。');
  };
  const res = await generateFullReportWithAgent({ llm: { apiKey: 'sk-test-mock', concurrency: 2 }, sectionNodes: ['compare.tests'], fetcher });
  assert.equal(revisions, 2, 'two rounds');
  assert.ok(res.report.report.some(s => s.body.includes('不能说明因果方向')), 'the second round\'s fix is kept');
  assert.equal(res.summary.revisedSections, 1);
  // The teaching package registers a sampling frame, so its prompt allows the design's own name; a project without one does not.
  const pack = await forgeNationalAwardPack('城市社区嵌入式养老服务的使用体验与满意度调查');
  const noFrame = { ...pack.report, quality: { ...pack.report.quality, results: pack.report.quality.results.filter(r => r.method !== 'sampling-frame') } };
  const seen = [];
  await generateFullReportWithAgent({ base: { design: pack.design, dataset: pack.dataset, report: noFrame }, llm: { apiKey: 'x', concurrency: 1 }, sectionNodes: ['design.sampling'], fetcher: async (_u, init) => { seen.push(JSON.parse(init.body).messages[0].content); return reply('本次样本为配额样本。'); } });
  assert.match(seen[0], /没有登记抽样框：不用“随机抽样、分层抽样/u);
});

test('a revision that leaves the problem standing is not kept', async () => {
  const fetcher = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: draft('整体满意度与复游推荐意愿相关，说明满意度导致了复游意愿上升，见{G1}。') } }] }), { status: 200 });
  const res = await generateFullReportWithAgent({ llm: { apiKey: 'sk-test-mock', concurrency: 2 }, sectionNodes: ['compare.tests'], fetcher });
  assert.equal(res.summary.revisedSections, 0);
  assert.ok(res.report.report.some(s => s.body.includes('导致了复游意愿上升')), 'the original stays, and the report check keeps flagging it');
  assert.ok(benchmarkReport(res.report).checks.some(c => c.id === 'causal' && c.status !== 'pass'));
});
