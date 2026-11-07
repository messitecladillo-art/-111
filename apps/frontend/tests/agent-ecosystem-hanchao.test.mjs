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
import {
  buildHanchaoBenchmarkPack,
  decomposeContestTopic,
  diagnoseAgainstHanchao,
  forgeNationalAwardPack,
  HANCHAO_BENCHMARK_META,
  NATIONAL_EXEMPLAR_CASES,
  toHanchaoProjectView,
} from '../lib/agent/hanchao-benchmark.ts';
import { illuminate } from '../lib/agent/illumination.ts';
import { route } from '../lib/agent/router.ts';
import {
  auditWritingDraft,
  buildChartStudioCardData,
  buildCodeStudioCardData,
  buildWritingStudioCardData,
} from '../lib/agent/studios.ts';
import { questionIsMapped, questionnaireIssues } from '../lib/questionnaire.ts';
import { benchmarkReport } from '../lib/report-benchmark.ts';
import { verifyResearchQuality } from '../lib/research-quality.ts';

test('Hanchao benchmark pack satisfies 641-row arithmetic, SHA-256 receipts, and 100% four-room illumination', async () => {
  const pack = buildHanchaoBenchmarkPack();

  // 1. Questionnaire checks
  assert.equal(pack.design.questions.length, 12);
  assert.equal(questionnaireIssues(pack.design).filter(i => i.level === 'blocker').length, 0);
  assert.equal(pack.design.questions.every(questionIsMapped), true);

  // 2. Dataset arithmetic checks (328 students + 313 residents = 641; viewing statuses 447+85+54+55 = 641)
  assert.equal(pack.dataset.kind, 'simulated');
  assert.equal(pack.dataset.table.rows.length, HANCHAO_BENCHMARK_META.validCount);
  const students = pack.dataset.table.rows.filter(r => r[0] === '1').length;
  const residents = pack.dataset.table.rows.filter(r => r[0] === '2').length;
  assert.equal(students, 328);
  assert.equal(residents, 313);

  const statusCounts = {
    both: pack.dataset.table.rows.filter(r => r[1] === '1').length,
    urbanOnly: pack.dataset.table.rows.filter(r => r[1] === '2').length,
    campusOnly: pack.dataset.table.rows.filter(r => r[1] === '3').length,
    neither: pack.dataset.table.rows.filter(r => r[1] === '4').length,
  };
  assert.deepEqual(statusCounts, HANCHAO_BENCHMARK_META.viewingStatusCounts);

  // 3. Report & SHA-256 quality verification
  assert.ok(pack.report.quality);
  await verifyResearchQuality(pack.report.quality);
  assert.equal(pack.report.quality.results.length, 6);
  assert.equal(pack.report.quality.findings.length, 4);
  assert.equal(pack.report.slides.length, 8);

  const bench = benchmarkReport(pack.report);
  assert.equal(bench.score, 100);

  // 4. Full 4-room illumination (Q -> D -> I -> A = 100%, 0 blind spots)
  const view = toHanchaoProjectView(pack);
  const light = illuminate(view);
  assert.equal(light.overall, 1);
  assert.equal(light.blind.length, 0);
  for (const room of light.rooms) {
    assert.equal(room.score, 1, `Expected room ${room.room} to have score 1, got ${room.score}`);
  }

  // 5. Hanchao comparator diagnosis
  const diag = diagnoseAgainstHanchao(view);
  assert.equal(diag.isHanchaoLoaded, true);
  assert.equal(diag.overallMatchPct, 100);
  assert.equal(diag.provenancePassed, 9);
});

test('Agent router routes /汉超, /备赛, /绘图, /编程, /撰稿 and natural-language contestant intents', () => {
  const emptyLight = illuminate({ design: null, dataset: null, report: null, resultPending: false });
  const ctx = { room: null, light: emptyLight, theme: 'light' };

  const hc = route('/汉超', ctx);
  assert.ok('turn' in hc);
  assert.ok(hc.turn.cards?.some(c => c.kind === 'confirm' && c.confirm.action.type === 'loadBenchmark'));

  const coach = route('/备赛', ctx);
  assert.ok('turn' in coach);
  assert.ok(coach.turn.cards?.[0]?.kind === 'tool');

  const plot = route('/绘图 列联', ctx);
  assert.ok('turn' in plot);
  assert.equal(plot.turn.cards?.[0]?.kind, 'chart-studio');
  if (plot.turn.cards?.[0]?.kind === 'chart-studio') {
    assert.equal(plot.turn.cards[0].studio.activeDatasetId, 'hc-connector-crosstab');
  }

  const code = route('/编程 latex 隐性ipa', ctx);
  assert.ok('turn' in code);
  assert.equal(code.turn.cards?.[0]?.kind, 'code-studio');
  if (code.turn.cards?.[0]?.kind === 'code-studio') {
    assert.equal(code.turn.cards[0].studio.activeRecipeId, 'implicit-ipa');
    assert.equal(code.turn.cards[0].studio.activeLang, 'latex');
  }

  const writing = route('/撰稿 答辩', ctx);
  assert.ok('turn' in writing);
  assert.equal(writing.turn.cards?.[0]?.kind, 'writing-studio');
  if (writing.turn.cards?.[0]?.kind === 'writing-studio') {
    assert.equal(writing.turn.cards[0].studio.activeTemplateId, 'defense-5w1h');
  }

  // Natural language routing
  const nlHanchao = route('我想看汉超双轨赛道标杆样板', ctx);
  assert.ok('turn' in nlHanchao && nlHanchao.turn.cards?.some(c => c.kind === 'confirm'));

  const nlPlot = route('帮我画一张五维满意度图', ctx);
  assert.ok('turn' in nlPlot && nlPlot.turn.cards?.[0]?.kind === 'chart-studio');

  const nlCode = route('生成Python复现代码', ctx);
  assert.ok('turn' in nlCode && nlCode.turn.cards?.[0]?.kind === 'code-studio');
});

test('Studios provide multi-language code recipes and real-time academic writing compliance audit', () => {
  const emptyLight = illuminate({ design: null, dataset: null, report: null, resultPending: false });
  const ctx = { room: null, light: emptyLight };

  const chartStudio = buildChartStudioCardData(ctx, '消费');
  assert.equal(chartStudio.activeDatasetId, 'hc-spend-pareto');
  assert.ok(chartStudio.datasets.length >= 3);

  const codeStudio = buildCodeStudioCardData(ctx, '聚类');
  assert.equal(codeStudio.activeRecipeId, 'kmeans-bootstrap');
  for (const recipe of codeStudio.recipes) {
    assert.ok(recipe.snippets.python.length > 50);
    assert.ok(recipe.snippets.r.length > 50);
    assert.ok(recipe.snippets.spss.length > 30);
    assert.ok(recipe.snippets.latex.length > 50);
  }

  const writingStudio = buildWritingStudioCardData(ctx, '3w1h');
  assert.equal(writingStudio.activeTemplateId, 'mother-insight-3w1h');
  const defaultTpl = writingStudio.templates.find(t => t.id === 'mother-insight-3w1h');
  assert.ok(defaultTpl);

  const goodAudit = auditWritingDraft(defaultTpl.defaultDraft);
  assert.equal(goodAudit.score, 100);

  const flawedAudit = auditWritingDraft('众所周知，相关性分析表明票务预约直接导致了复游率的绝对变化。');
  assert.ok(flawedAudit.score < 50);
});

test('Universal National Award Forging Engine de-overfits Hanchao and forges arbitrary topics to 100/100 standard', async () => {
  // 1. Exemplar catalog includes 8 diverse national prize archetypes across domains
  assert.equal(NATIONAL_EXEMPLAR_CASES.length, 8);

  // 2. Arbitrary user topic string is dynamically decomposed and forged to 100% illumination + 100/100 score
  const arbitraryTopic = '新能源汽车社区共享充电桩供需错配与动态定价机制调研';
  const blueprint = decomposeContestTopic(arbitraryTopic);
  assert.ok(blueprint.id.startsWith('CASE-CUSTOM-'));
  assert.ok(blueprint.title.includes('新能源汽车社区共享充电桩'));
  assert.equal(blueprint.dimensions.length, 5);
  assert.equal(blueprint.actors.length, 3);

  const customPack = forgeNationalAwardPack(arbitraryTopic);
  assert.equal(customPack.design.questions.length, 12);
  assert.equal(questionnaireIssues(customPack.design).filter(i => i.level === 'blocker').length, 0);
  assert.equal(customPack.dataset.table.rows.length, 641);
  assert.ok(customPack.report.title.includes('新能源汽车社区共享充电桩'));
  assert.ok(customPack.report.quality);
  await verifyResearchQuality(customPack.report.quality);

  const customBench = benchmarkReport(customPack.report);
  assert.equal(customBench.score, 100);

  const customView = toHanchaoProjectView(customPack);
  const customLight = illuminate(customView);
  assert.equal(customLight.overall, 1);
  assert.equal(customLight.blind.length, 0);

  // 3. Curated non-Hanchao domain archetypes (e.g. campus-ai, silver-care) also pass 100/100
  for (const presetId of ['campus-ai', 'new-blue-collar', 'silver-care']) {
    const pack = forgeNationalAwardPack(presetId);
    await verifyResearchQuality(pack.report.quality);
    assert.equal(benchmarkReport(pack.report).score, 100);
    assert.equal(illuminate(toHanchaoProjectView(pack)).overall, 1);
  }

  // 4. Studios dynamically adapt to the active project's topic instead of hardcoding Hanchao
  const customCtx = {
    room: null,
    light: customLight,
    projectTitle: customPack.report.title,
    design: customPack.design,
    datasetName: customPack.dataset.name,
  };
  const routedForge = route('/铸造 银发族智慧助餐', customCtx);
  assert.ok('turn' in routedForge);
  assert.ok(routedForge.turn.cards?.some(c => c.kind === 'confirm' && c.confirm.action.type === 'loadBenchmark'));

  const adaptiveChart = buildChartStudioCardData(customCtx, '五维');
  assert.ok(adaptiveChart.datasets[0].title.includes('新能源汽车'));

  const adaptiveCode = buildCodeStudioCardData(customCtx, 'logit');
  assert.equal(adaptiveCode.activeRecipeId, 'logit-sem-topsis');
  assert.ok(adaptiveCode.recipes.length >= 5);

  const adaptiveWriting = buildWritingStudioCardData(customCtx, '3w1h');
  assert.ok(adaptiveWriting.templates[0].defaultDraft.includes('新能源汽车'));
});

test('Full-Report Skill-Pack Pipeline (00-06) builds 4 stage-handoff ledgers, sanitizes non-statistical digits, and generates 26/26 sections at 100/100 score', async () => {
  const topic = decomposeContestTopic('校园AI自习室与智慧书院空间错峰预约及学习效能循证调研');
  const pack = await forgeNationalAwardPack('campus-ai');
  const contract = buildSkillPackContract(pack, topic, 'demonstration');

  // 1. Verify 00-04 four canonical stage-handoff ledgers and RQ design matrix
  assert.equal(contract.mode, 'demonstration');
  assert.ok(contract.claimLedger.length >= 4);
  assert.ok(contract.literatureLedger.length >= 3);
  assert.ok(contract.statsLedger.length >= 6);
  assert.ok(contract.figureLedger.length >= 6);
  assert.equal(contract.designMatrix.length, 3);

  // 2. Verify sanitizeModelParagraph preserves {F..}/{G..}/{R..} while converting Q11/95%/3W1H/ordinals
  const raw = '在 Q11 题项与 5 级量表中，有效样本为{F2}（有效回收率{F1}），在 95%置信区间下详见{G1}与第1象限对策（遵循 3W1H 闭环）{R1}。';
  const cleaned = sanitizeModelParagraph(raw);
  assert.ok(cleaned.includes('{F2}'));
  assert.ok(cleaned.includes('{F1}'));
  assert.ok(cleaned.includes('{G1}'));
  assert.ok(cleaned.includes('{R1}'));
  assert.equal(/[0-9]/u.test(cleaned.replace(/\{(?:F|G|R)\d+\}/gu, '')), false);

  // 3. Verify parseAndHydrateSectionDraft handles unescaped inner quotes and hydrates tokens
  const mockTokens = {
    facts: [
      { id: 'F1', text: '有效回收率为94.4%', value: '94.4%' },
      { id: 'F2', text: '有效样本为641份', value: '641份' },
    ],
    exhibits: [{ id: 'G1', text: '图1', value: '[[图:res-1]]' }],
    references: [{ id: 'R1', text: '文献1', value: '[1]' }],
  };
  const hydrated = parseAndHydrateSectionDraft(
    '{"paragraphs":[{"text":"本节基于有效样本{F2}（回收率{F1}）开展"双轨对比"实证检验，结果如{G1}所示{R1}。"}]}',
    mockTokens,
  );
  assert.equal(hydrated.paragraphs.length, 1);
  assert.equal(hydrated.droppedParagraphs, 0);
  assert.ok(hydrated.paragraphs[0].includes('641份'));
  assert.ok(hydrated.paragraphs[0].includes('[[图:res-1]]'));
  assert.ok(hydrated.paragraphs[0].includes('[1]'));

  // 4. Verify full 26-section pipeline with mock LLM fetcher achieves 26/26 sections, 100/100 score, and 6/6 advisors with 0 issues
  const mockFetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    const promptText = body.messages[0].content;
    const hasG1 = promptText.includes('"id":"G1"');
    const hasR1 = promptText.includes('"id":"R1"');
    const paragraphs = [
      {
        text: `本研究围绕核心议题开展分层随机抽样与多维量表测量，基于有效样本{F2}（有效回收率{F1}，预调查样本{F3}）构建完整证据链${hasG1 ? '，核心图表详见{G1}' : ''}${hasR1 ? '，理论脉络参见{R1}{R2}{R3}' : ''}。`,
      },
      {
        text: '在调查执行与统计建模过程中，研究团队严格遵循注意力甄别、作答时长底线、逻辑矛盾校验、规律作答筛查与缺失值多重插补五道质控工序，由行业主管部门、核心运营方与技术平台团队协同推进季度监测指标复盘。',
      },
      {
        text: '关键词：正大杯市场调查、分层抽样设计、五维体验量表、多元统计检验、循证决策转化',
      },
    ];
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ paragraphs }) } }],
        usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const fullRes = await generateFullReportWithAgent({
    topic: '校园AI自习室与智慧书院空间错峰预约及学习效能循证调研',
    mode: 'demonstration',
    llm: { apiKey: 'sk-test-mock', concurrency: 6 },
    fetcher: mockFetcher,
  });

  assert.equal(fullRes.summary.totalSectionsGenerated, WAVE_1_SECTION_NODES.length + WAVE_2_SYNTHESIS_NODES.length);
  assert.equal(fullRes.summary.llmSuccessCount, 26);
  assert.equal(fullRes.summary.finalScore, 100);
  assert.equal(fullRes.summary.advisorPassCount, 6);
  assert.equal(fullRes.summary.advisorTotalCount, 6);

  // 5. Verify router commands /全报告 and /密钥
  const emptyLight = illuminate({ design: null, dataset: null, report: null, resultPending: false });
  const rFull = route('/全报告 智慧养老助餐服务调研', { room: null, light: emptyLight });
  assert.ok('turn' in rFull && rFull.turn.chips?.some(c => c.action.type === 'generateFullReport'));

  const rKey = route('/密钥 sk-test1234567890', { room: null, light: emptyLight });
  assert.ok('turn' in rKey && rKey.turn.act?.type === 'setApiKey');
});
