import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSkillPackContract,
  generateFullReportWithAgent,
  parseAndHydrateSectionDraft,
  sanitizeModelParagraph,
  WAVE_1_SECTION_NODES,
  WAVE_2_SYNTHESIS_NODES,
} from '../lib/agent/full-report-pipeline.ts';
import { UNDRAFTED_NOTE, buildDemoPack, buildDemoStudy, decomposeTopic } from '../lib/agent/demo-study.ts';
import { illuminate } from '../lib/agent/illumination.ts';
import { route } from '../lib/agent/router.ts';
import { auditWritingDraft, buildChartStudioCardData, buildCodeStudioCardData, buildWritingStudioCardData } from '../lib/agent/studios.ts';
import { questionIsMapped, questionnaireIssues } from '../lib/questionnaire.ts';
import { benchmarkReport } from '../lib/report-benchmark.ts';
import { verifyResearchQuality } from '../lib/research-quality.ts';

const TOPIC = '城市社区助餐服务的使用体验、满意度与持续使用意愿调查';
// What a real report's title, catch phrases or statistics would look like here; none may appear.
const BORROWED = /汉超|蒜鸟|武汉城市足球|跨界连接器|母洞察|76\.83|62\.30|28\.64|DEFF\s*=\s*1\.65/u;

test('a teaching simulation: its questionnaire maps every question, its answers are drawn one by one, its results are computed on them', async () => {
  const pack = await buildDemoPack(TOPIC);
  assert.equal(pack.design.questions.length, 20);
  assert.equal(questionnaireIssues(pack.design).filter(i => i.level === 'blocker').length, 0);
  assert.ok(pack.design.questions.every(questionIsMapped));

  // The answers: simulated, screened, and the rows that stay are not copies of each other (copies are only flagged).
  assert.equal(pack.dataset.kind, 'simulated');
  const rows = pack.dataset.table.rows;
  assert.ok(rows.length >= 400, `${rows.length} rows kept`);
  // One topic, one simulation in every engine: the simulator uses only arithmetic IEEE 754 fixes exactly (no Math.log or
  // Math.cos, no random-comparator sort). This fingerprint was produced in Node and in the browser alike.
  const raw = (await import('../lib/agent/demo-study.ts')).buildDemoStudy;
  assert.equal((await raw('城市社区助餐服务的使用体验、满意度与持续使用意愿调查')).dataset.sourceHash.slice(0, 16), 'c34907e3ceddb089');
  const simulator = (await import('node:fs')).readFileSync(new URL('../lib/agent/demo-study.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(simulator.replace(/\/\/[^\n]*/gu, ''), /Math\.(log|cos|sin|exp|pow|tan|atan)\b|\.sort\(\(\) =>/u);
  const distinct = new Set(rows.map(r => r.join('|'))).size;
  assert.ok(distinct >= rows.length * 0.97, `${distinct} distinct of ${rows.length}`);
  assert.match(pack.dataset.lineage.at(-1), /质控：剔除注意力题未通过与直线作答 \d+ 份，答案完全重复的答卷仅标记、未剔除；保留 \d+ \/ \d+ 份/u);

  // The same topic draws the same answers; another topic draws others.
  const again = await buildDemoStudy(TOPIC);
  const other = await buildDemoStudy('大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查');
  assert.equal(again.dataset.sourceHash, pack.dataset.sourceHash);
  assert.notEqual(other.dataset.sourceHash, pack.dataset.sourceHash);

  // Every result was registered with a hash of what it holds, computed on the screened answers.
  const results = pack.report.quality.results;
  assert.ok(results.length >= 14, `${results.length} results`);
  // The rating dimensions are read together: their distributions, every dimension across each background question, and their correlations.
  for (const method of ['likert', 'profile', 'correlation']) assert.ok(results.some(r => r.method === method), `a ${method} result`);
  assert.equal(results.filter(r => r.method === 'groups' || r.method === 'spearman').length, 0, 'no single-dimension comparisons left');
  await verifyResearchQuality(pack.report.quality);
  assert.ok(results.every(r => r.classification === 'simulated'));
  const screening = results.find(r => r.method === 'quality-control');
  assert.equal(screening.n, rows.length);
  assert.ok(screening.rows.some(row => row[0] === '答案完全重复' && row[3] === '仅标记'));
  for (const method of ['frequency', 'alpha', 'crosstab', 'likert', 'profile', 'correlation', 'regression', 'ipa', 'cluster']) assert.ok(results.some(r => r.method === method), method);

  // Nothing borrowed from a real report, and the back matter says what was done.
  assert.ok(!BORROWED.test(JSON.stringify({ design: pack.design, report: pack.report.report, blueprint: pack.blueprint })));
  const ai = pack.report.report.find(s => /^附录二/u.test(s.title));
  assert.ok(ai.body.includes(UNDRAFTED_NOTE), 'no model has drafted anything yet');
  assert.ok(ai.body.includes(`剔除`) && ai.body.includes(`保留 ${rows.length} 份`));
  assert.ok(!pack.report.report.some(s => /^参考文献/u.test(s.title) && /体育科学|中国高等教育|中国劳动|经济研究/u.test(s.body)), 'no invented journal article is cited');
  // P1/P2/P3 upgrade invariants: version 3 with approved frame & TOC, 0 blank subsections, downstream Cluster cross-tabs, and valid verified citations
  const { danglingReferences } = await import('../lib/report-numbering.ts');
  assert.equal(pack.report.version, 3);
  assert.equal(pack.report.reportFormat?.options.includeToc, true);
  assert.equal(pack.report.reportFrame?.status, 'approved');
  assert.deepEqual(danglingReferences(pack.report), []);
  assert.ok(results.some(r => r.method === 'crosstab' && r.variables?.[0] === '聚类人群分群'), 'cluster feeds downstream crosstab');
  assert.equal(pack.report.references?.length, 7);
  assert.ok(pack.report.references?.every(r => r.verification === 'verified'));
  const blankBodySections = pack.report.report.filter(s => (!/^[一二三四五六七八九十]+、/u.test(s.title) && s.title !== '参考文献') && !s.body.trim());
  assert.deepEqual(blankBodySections, [], 'every content section starts with structured prose instead of blank skeleton');
  const { figurePlan, figureSVG } = await import('../lib/report-figures.ts');
  const { isDiagramMethod } = await import('../lib/diagram-figures.ts');
  const { figureInk } = await import('../lib/figure-palette.ts');
  const ink = figureInk(pack.report);
  const chartKinds = new Set();
  for (const sec of pack.report.report) {
    for (const block of sec.blocks ?? []) {
      if (block.kind !== 'chart') continue;
      const result = results.find(x => x.id === block.evidenceId);
      assert.ok(result, `chart block ${block.id} has registered result`);
      const svg = await figureSVG(result, block.valueColumn ?? 1, ink, pack.report.visualStyle);
      assert.ok(svg.includes('<svg') && !/\.\d{3,}%/u.test(svg), `clean SVG for ${block.id}`);
      chartKinds.add(isDiagramMethod(result.method) ? result.method : figurePlan(result, block.valueColumn ?? 1, ink).kind);
    }
  }
  assert.ok(chartKinds.has('scree') && chartKinds.has('likert'), 'EFA scree and diverging likert plots active');
  assert.ok(chartKinds.size >= 10, `expected >= 10 distinct chart types, got ${[...chartKinds].join(',')}`);
});

test('any topic gets its own structure, worded for it and carrying no number', () => {
  const topic = '新能源汽车社区共享充电桩供需错配与动态定价机制调研';
  const bp = decomposeTopic(topic);
  assert.equal(bp.title, topic);
  assert.equal(bp.dimensions.length, 5);
  assert.equal(bp.statusCategories.length, 4);
  assert.ok(bp.dimensions.every(d => d.question.includes('充电桩') || d.question.length > 6));
  // Option labels may hold amounts; nothing else in the structure is a number.
  const { tierChoices: _tiers, ...rest } = bp;
  void _tiers;
  assert.ok(!/\d/u.test(JSON.stringify(rest).replace(/"slug":"[^"]+"|"id":"[^"]+"|"code":"Q\d+"/gu, '')), JSON.stringify(rest));
  assert.equal(bp.shortTitle, '新能源汽车社区共享充电桩', 'the subject is what the topic is about, not what it asks');
  assert.ok(!('motherInsight' in bp) && !('references' in bp));
  // A questionnaire the project already has lends its groups and scale items.
  const design = { questions: [{ type: 'single', construct: '车主类型', choices: [{ code: '1', label: '私家车主' }, { code: '2', label: '网约车司机' }] }, { type: 'likert', purpose: 'research', construct: '充电等待', text: '您对排队等待时间满意吗？' }] };
  const borrowed = decomposeTopic(topic, design);
  assert.equal(borrowed.groupA, '私家车主');
  assert.equal(borrowed.dimensions[0].question, '您对排队等待时间满意吗？');
});

test('the studios show only registered numbers: empty forms before there are results, the results\' own cells after', async () => {
  const emptyLight = illuminate({ design: null, dataset: null, report: null, resultPending: false });
  const bare = { room: null, light: emptyLight };
  assert.deepEqual(buildChartStudioCardData(bare).datasets, []);
  const code = buildCodeStudioCardData(bare, '');
  for (const recipe of code.recipes) {
    assert.ok(recipe.snippets.python.length > 50 && recipe.snippets.r.length > 50 && recipe.snippets.spss.length > 30, recipe.id);
    if (recipe.id !== 'sampling-size') assert.ok(!/\d/u.test(recipe.snippets.latex.replace(/\\[a-z]+\{[^}]*\}|\{[^}]*\}/gu, '')), `${recipe.id} latex has no number before a result exists`);
  }
  const writing = buildWritingStudioCardData(bare, '');
  assert.deepEqual(writing.facts, []);
  // Category names may hold digits ("60–70 岁老年人"); outside them, a template leaves blanks, not numbers.
  const bp = decomposeTopic('');
  const names = [bp.groupA, bp.groupB, ...bp.statusCategories, ...bp.tierChoices];
  assert.ok(writing.templates.every(t => !/\d/u.test(names.reduce((text, name) => text.split(name).join(''), t.defaultDraft))), 'templates leave blanks, not numbers');
  assert.equal(auditWritingDraft(writing.templates[0].defaultDraft).checks.find(c => c.id === 'evidence').passed, false, 'a draft with blanks is not done');
  assert.ok(auditWritingDraft('众所周知，相关性分析表明票务预约直接导致了复游率的绝对变化。').score < 50);

  const pack = await buildDemoPack(TOPIC);
  const results = pack.report.quality.results;
  const ctx = { room: null, light: emptyLight, projectTitle: pack.report.title, design: pack.design, datasetName: pack.dataset.name, results: { results, findings: [], pending: false, placed: results.map(r => r.id) } };
  const charts = buildChartStudioCardData(ctx);
  assert.ok(charts.datasets.length >= 5);
  for (const spec of charts.datasets) {
    const result = results.find(r => `result-${r.id}` === spec.id);
    // A cell such as "12.3%" or "−0.25" is the number 12.3 or −0.25, as the studio reads it.
    const cells = new Set(result.rows.flat().map(c => Number(String(c).replace(/−/gu, '-').replace(/[%％]$/u, ''))).filter(Number.isFinite).map(v => Number(v.toFixed(3))));
    assert.ok(spec.points.every(p => cells.has(p.primary)), `${spec.title}: every bar is a registered cell`);
  }
  const crosstab = buildCodeStudioCardData(ctx, 'latex').recipes.find(r => r.id === 'crosstab-chi2').snippets.latex;
  assert.match(crosstab, /n = \d+/u, 'the booktabs table is the registered crosstab');
  const facts = buildWritingStudioCardData(ctx).facts;
  assert.ok(facts.length > 0 && facts.every(f => f.origin === '已登记结果'));
});

test('the agent routes the demo, the coach and the studios; the old exemplar command is gone', () => {
  const emptyLight = illuminate({ design: null, dataset: null, report: null, resultPending: false });
  const ctx = { room: null, light: emptyLight, theme: 'light' };
  const demo = route('/铸造', ctx);
  assert.ok('turn' in demo && demo.turn.cards?.some(c => c.kind === 'confirm' && c.confirm.action.type === 'loadBenchmark'));
  assert.ok(!BORROWED.test(JSON.stringify(demo.turn)));
  const old = route('/汉超', ctx);
  assert.ok(!('turn' in old) || !old.turn.cards?.some(c => c.kind === 'confirm' && c.confirm.action.type === 'loadBenchmark'));
  assert.equal(route('/备赛', ctx).turn.cards?.[0]?.kind, 'tool');
  assert.equal(route('/绘图', ctx).turn.cards?.[0]?.kind, 'chart-studio');
  const code = route('/编程 latex 隐性ipa', ctx);
  assert.equal(code.turn.cards[0].studio.activeRecipeId, 'implicit-ipa');
  assert.equal(code.turn.cards[0].studio.activeLang, 'latex');
  assert.equal(route('/撰稿 答辩', ctx).turn.cards[0].studio.activeTemplateId, 'defense');
  assert.equal(route('帮我画一张五维满意度图', ctx).turn.cards?.[0]?.kind, 'chart-studio');
  assert.equal(route('生成Python复现代码', ctx).turn.cards?.[0]?.kind, 'code-studio');
});

test('the full-report pipeline writes up the computed simulation, and its AI appendix names the model that drafted', async () => {
  const topic = decomposeTopic('大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查');
  const pack = await buildDemoPack('大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查');
  const contract = buildSkillPackContract(pack, topic, 'demonstration');
  assert.equal(contract.mode, 'demonstration');
  assert.equal(contract.designMatrix.length, 3);
  assert.ok(contract.designMatrix.every(row => !/PPS|分层抽样/u.test(row.analysisMethod)), 'no sampling design is claimed for a convenience sample');
  assert.equal(contract.statsLedger.length, pack.report.quality.results.length, 'one ledger row per registered result');
  assert.equal(contract.claimLedger.length, 0, 'no finding is confirmed until a person confirms it');

  const cleaned = sanitizeModelParagraph('在 Q11 题项与 5 级量表中，有效样本为{F2}，在 95%置信区间下详见{G1}{R1}。');
  assert.ok(cleaned.includes('{F2}') && cleaned.includes('{G1}') && cleaned.includes('{R1}'));
  const hydrated = parseAndHydrateSectionDraft('{"paragraphs":[{"text":"本节基于有效样本{F2}份开展"两组对比"检验，结果如{G1}所示{R1}。"}]}', {
    facts: [{ id: 'F2', text: '有效样本为 576', value: '576' }],
    exhibits: [{ id: 'G1', text: '图1', value: '[[图:res-1]]' }],
    references: [{ id: 'R1', text: '文献1', value: '[1]' }],
  });
  assert.equal(hydrated.paragraphs.length, 1);
  assert.ok(hydrated.paragraphs[0].includes('576份') && hydrated.paragraphs[0].includes('[[图:res-1]]'));

  const fetcher = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ paragraphs: [{ text: '本节交代研究的问题与做法，并说明结论只适用于样本覆盖的人群。' }, { text: '关键词：教学模拟、问卷调查、满意度、持续使用意愿' }] }) } }],
    usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const res = await generateFullReportWithAgent({ topic: '大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查', llm: { apiKey: 'sk-test-mock', model: 'deepseek-chat', concurrency: 6 }, fetcher });
  assert.equal(res.summary.totalSectionsGenerated, WAVE_1_SECTION_NODES.length + WAVE_2_SYNTHESIS_NODES.length);
  assert.equal(res.summary.finalScore, benchmarkReport(res.report).score, 'the score is the text\'s own');
  assert.deepEqual(res.report.quality.results.map(r => r.resultHash), res.pack.report.quality.results.map(r => r.resultHash));
  const ai = res.report.report.find(s => /^附录二/u.test(s.title));
  assert.ok(ai.body.includes('大语言模型（deepseek-chat）') && !ai.body.includes(UNDRAFTED_NOTE), 'the appendix now names the model');

  const rFull = route('/全报告 社区助餐服务调研', { room: null, light: illuminate({ design: null, dataset: null, report: null, resultPending: false }) });
  assert.ok('turn' in rFull && rFull.turn.chips?.some(c => c.action.type === 'generateFullReport'));
  assert.ok(!BORROWED.test(JSON.stringify(rFull.turn)) && !/641|26 节/u.test(JSON.stringify(rFull.turn.cards)));
});
