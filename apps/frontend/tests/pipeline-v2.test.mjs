import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WAVE_1_SECTION_NODES,
  WAVE_2_SYNTHESIS_NODES,
  assembleInterleavedSection,
  buildDeterministicStorylineBrief,
  buildFullReportSectionPrompt,
  buildSectionTokens,
  buildSkillPackContract,
  buildStorylinePrompt,
  checkCrossSectionEcho,
  deduplicateReportFormulas,
  formatSectionEvidenceTables,
  generateFullReportWithAgent,
  parseAndHydrateSectionDraft,
  parseStorylineBrief,
  sanitizeV2Paragraph,
  sectionCorpusSkillBlock,
  verifyAndHydrateV2Section,
} from '../lib/agent/full-report-pipeline.ts';
import { INTERNAL_META_WARNING_RE, MOTHER_INSIGHT_NODES, collectPreservedResultNotes, formatStorylineForSection } from '../lib/agent/storyline-brief.ts';
import { fullReportInputRevision, parseFullReportRequest } from '../lib/agent/full-report-request.ts';
import { buildRichDemoPack } from '../lib/agent/rich-study.ts';
import { parseEditorContent, createEditorContent } from '../lib/editor-model.ts';
import { synthesizeDeterministicCoverArt, synthesizeDeterministicFrameArt } from '../lib/agent/image-gen-engine.ts';
import { newQuestionnaire } from '../lib/questionnaire.ts';
import { matchBlueprintNode } from '../lib/report-blueprint.ts';
import { benchmarkReport } from '../lib/report-benchmark.ts';
import { danglingReferences } from '../lib/report-numbering.ts';
import { verifyResearchQuality } from '../lib/research-quality.ts';

const TOPIC = '大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查';

test('V2 node roster expands to 28 sections and request schema accepts segments.cluster & plan.feasibility up to 32 nodes', async () => {
  assert.ok(WAVE_1_SECTION_NODES.includes('segments.cluster'));
  assert.ok(WAVE_1_SECTION_NODES.includes('plan.feasibility'));
  const allNodes = [...WAVE_1_SECTION_NODES, ...WAVE_2_SYNTHESIS_NODES];
  assert.equal(allNodes.length, 28);

  const runId = 'c0f951d7-54d8-4f43-973f-bcf9d3f36d33';
  const serviceId = '6d33e1c2-7ad3-47c3-862f-7a034ac3bb49';
  const projectId = 'd8ae0d7a-619f-4c13-bcf8-554a0e14c535';
  const reqPayload = {
    schemaVersion: 1,
    runId,
    projectId,
    inputRevision: '0'.repeat(64),
    serviceId,
    serviceRevision: 1,
    consent: true,
    topic: TOPIC,
    mode: 'plan',
    base: { design: newQuestionnaire(), dataset: null, report: createEditorContent() },
    sectionNodes: allNodes,
  };
  reqPayload.inputRevision = await fullReportInputRevision(reqPayload);
  const parsed = parseFullReportRequest(reqPayload);
  assert.equal(parsed.sectionNodes.length, 28);
  assert.ok(parsed.sectionNodes.includes('segments.cluster'));
  assert.ok(parsed.sectionNodes.includes('plan.feasibility'));
});

test('formatSectionEvidenceTables renders full 3-line Markdown tables with all columns, rows up to 20, eligibility, and model fit notes', async () => {
  const pack = await buildRichDemoPack(TOPIC);
  const results = pack.report.quality.results;
  const held = { results, findings: [], pending: false, placed: results.map(r => r.id) };
  const preservedNotes = collectPreservedResultNotes(pack.report);

  const driversMd = formatSectionEvidenceTables(held, pack.report, 'drivers.model', { preservedNotes });
  // OLS all columns + model fit
  for (const col of ['非标准化系数 B', '标准误', '标准化系数 β', 't', 'p', 'VIF']) {
    assert.ok(driversMd.includes(col), `OLS column ${col} must be rendered`);
  }
  assert.match(driversMd, /调整\s*\$?R\^2/u, 'Adjusted R² note rendered');
  assert.match(driversMd, /F\(\d+,\d+\)=/u, 'F statistic rendered');

  // Logistic all columns + model fit
  for (const col of ['Wald z', 'OR', 'OR 95% CI', '平均边际效应']) {
    assert.ok(driversMd.includes(col), `Logistic column ${col} must be rendered`);
  }
  assert.match(driversMd, /McFadden/u, 'McFadden R² rendered');
  assert.match(driversMd, /似然比检验/u, 'LR chi-square rendered');
  assert.match(driversMd, /有效分析样本 n = \d+ \/ 总记录 total = \d+/u, 'sample n/total eligibility rendered');

  // More than 6 rows rendered (OLS has intercept + 12 predictors = 13 rows)
  const olsLines = driversMd.split('\n').filter(l => l.startsWith('| '));
  assert.ok(olsLines.length >= 18, `expected full predictor rows beyond old 6-row cap, got ${olsLines.length}`);

  // Evaluation section renders KANO Better/Worse + explicit KANO column reading guard + IPA quadrant lines
  const evalMd = formatSectionEvidenceTables(held, pack.report, 'diagnosis.evaluation', { preservedNotes });
  assert.ok(evalMd.includes('Better') && evalMd.includes('Worse'), 'KANO Better/Worse columns rendered');
  assert.match(evalMd, /KANO 读表防错护栏/u, 'explicit KANO M/O/A/I vs Better/Worse reading guard rendered');
  assert.match(evalMd, /IPA 四象限均值分界阈值/u);

  // Testing section renders KMO & Bartlett; Cluster section renders Silhouette
  const testMd = formatSectionEvidenceTables(held, pack.report, 'data.testing', { preservedNotes });
  assert.match(testMd, /KMO/u);
  assert.match(testMd, /Bartlett/u);

  const clusterMd = formatSectionEvidenceTables(held, pack.report, 'segments.cluster', { preservedNotes });
  assert.match(clusterMd, /轮廓系数|\\bar\{s\}/u);

  // Fieldwork scoping: design.schedule sees no main-survey tables, while data.pilot sees its own n=48 pre-test table
  assert.equal(formatSectionEvidenceTables(held, pack.report, 'design.schedule', { preservedNotes }), '');
  const pilotMd = formatSectionEvidenceTables(held, pack.report, 'data.pilot', { preservedNotes });
  assert.match(pilotMd, /n = 48/u, 'pilot pre-test table rendered in data.pilot');
  assert.doesNotMatch(pilotMd, new RegExp(`n = ${pack.dataset.table.rows.length}`, 'u'), 'main-survey sample never leaks into data.pilot');
});

test('storyline brief assigns 8 single-owner claims, academic cluster personas, corpus skills, and gates motherInsight strictly to 3 nodes', async () => {
  const pack = await buildRichDemoPack(TOPIC);
  const brief = buildDeterministicStorylineBrief(pack, pack.blueprint, 'demonstration');

  assert.equal(brief.claims.length, 8);
  assert.deepEqual(
    brief.claims.map(c => c.claimId),
    ['CLM-1', 'CLM-2', 'CLM-3', 'CLM-4', 'CLM-5', 'CLM-6', 'CLM-7', 'CLM-8'],
  );
  assert.equal(new Set(brief.claims.map(c => c.ownerNode)).size, 8, 'each claim has ONE unique ownerNode');
  for (const claim of brief.claims) {
    assert.equal(/\d/u.test(claim.qualitativeTakeaway), false, `${claim.claimId} qualitativeTakeaway must be digit-free`);
  }
  assert.equal(/\d/u.test(brief.motherInsight), false, 'motherInsight has no raw echoed digits');
  assert.equal(brief.clusterPersonas.length, 3);
  for (const persona of brief.clusterPersonas) {
    assert.doesNotMatch(persona.academicName, /Cluster|类别|\d/iu);
  }
  assert.ok(brief.pilotGuardrails.length >= 3);

  // Test LLM storyline prompt & safe parser
  const storyPrompt = buildStorylinePrompt(pack, pack.blueprint, 'demonstration', brief);
  assert.match(storyPrompt, /CLM-1/u);
  assert.equal(parseStorylineBrief('{"paragraphs":[{"text":"章节草稿"}]}', brief), null, 'draft JSON is not mistaken for storyline');
  const refined = parseStorylineBrief(
    JSON.stringify({
      motherInsight: '围绕高校智能学习辅助场景，表层高频试用与深层规范顾虑并存，透明启发引导机制优于结果代办包办。',
      claims: [{ claimId: 'CLM-5', qualitativeTakeaway: '控制背景特征后，透明启发式引导对持续意愿与采纳优势呈稳健正向预测。' }],
      clusterPersonas: [{ clusterId: '第 1 类', academicName: '自主深耕领航型', strategyFocus: '深化科研规范协同示范' }],
    }),
    brief,
  );
  assert.ok(refined);
  assert.equal(refined.claims.find(c => c.claimId === 'CLM-5').ownerNode, 'drivers.model', 'ownerNode stays locked');
  assert.equal(refined.clusterPersonas[0].academicName, '自主深耕领航型');

  // Strict 3-node motherInsight gate across all 28 section prompts
  const contract = buildSkillPackContract(pack, pack.blueprint, 'demonstration');
  const held = { results: pack.report.quality.results, findings: [], pending: false, placed: pack.report.quality.results.map(r => r.id) };
  const allNodes = [...WAVE_1_SECTION_NODES, ...WAVE_2_SYNTHESIS_NODES];
  for (const nodeId of allNodes) {
    const sectionStory = formatStorylineForSection(brief, nodeId);
    const fullPrompt = buildFullReportSectionPrompt({
      nodeId,
      content: pack.report,
      design: pack.design,
      held,
      contract,
      tokens: buildSectionTokens(held, pack.report, nodeId, pack.design),
      storyline: brief,
    });
    if (MOTHER_INSIGHT_NODES.has(nodeId)) {
      assert.ok(sectionStory.includes(brief.motherInsight), `${nodeId} receives motherInsight`);
      assert.match(fullPrompt, /全篇统摄母洞察/u, `${nodeId} prompt carries motherInsight`);
    } else {
      assert.ok(!sectionStory.includes(brief.motherInsight), `${nodeId} must NOT receive motherInsight`);
      assert.doesNotMatch(fullPrompt, /全篇统摄母洞察/u, `${nodeId} prompt must NOT echo motherInsight`);
    }
  }

  // Distilled corpus skills & Wave-2 storyline alignment checks
  assert.match(sectionCorpusSkillBlock('abstract', []), /900–1020/u);
  assert.match(sectionCorpusSkillBlock('drivers.model', ['regression', 'logistic']), /12–25 字/u);
  assert.match(sectionCorpusSkillBlock('drivers.model', ['regression', 'logistic']), /陈列公式防重铁律/u);
  assert.match(sectionCorpusSkillBlock('intro.literature', []), /理论文献构念化综述铁律/u);
  assert.match(sectionCorpusSkillBlock('plan.measures', []), /不等于/u, 'bans repetitive X不等于Y openings');
  assert.match(sectionCorpusSkillBlock('plan.feasibility', []), /四要素闭环/u);
  assert.match(sectionCorpusSkillBlock('plan.feasibility', []), /止损/u);
  assert.ok(Array.isArray(brief.clusterPersonaMap) && brief.clusterPersonaMap.length >= 3, 'exact clusterPersonaMap generated');
  const measuresStory = formatStorylineForSection(brief, 'plan.measures');
  assert.match(measuresStory, /clusterPersonaMap.*最低分簇为“第\s*\d\s*类”/su, 'plan.measures gets exact lowest-scoring cluster index per dimension');

  // Full-run prompt disclosure boundary gating + design.qc vs data.cleaning reconciliation
  const samplingFullPrompt = buildFullReportSectionPrompt({
    nodeId: 'design.sampling',
    content: pack.report,
    design: pack.design,
    held,
    contract,
    tokens: buildSectionTokens(held, pack.report, 'design.sampling', pack.design),
    storyline: brief,
    fullRun: true,
  });
  assert.match(samplingFullPrompt, /已登记模拟抽样框：.*外推须谨慎/u, 'registered PPS frame updates boundary disclosure honestly');
  assert.doesNotMatch(samplingFullPrompt, /资料中没有登记抽样框/u, 'does not claim missing sampling frame when registered');
  const heldWithoutSampling = {
    ...held,
    results: held.results.filter(r => r.method !== 'sampling-frame'),
    placed: held.placed.filter(id => !id.startsWith('rich-pps-sampling-frame-')),
  };
  const unframedSamplingPrompt = buildFullReportSectionPrompt({
    nodeId: 'design.sampling',
    content: pack.report,
    design: pack.design,
    held: heldWithoutSampling,
    contract,
    tokens: buildSectionTokens(heldWithoutSampling, pack.report, 'design.sampling', pack.design),
    storyline: brief,
    fullRun: true,
  });
  assert.match(unframedSamplingPrompt, /如实写明抽样方式与覆盖范围待确认/u, 'unframed boundary node keeps sampling disclosure');
  assert.match(samplingFullPrompt, /勿写“不报告剔除数量”/u, 'design.sampling reconciled with simulated QC ledger');

  // Wave-3: canonical neutral cluster names synced identically across segments.cluster, diagnosis.*, plan.*, conclusion.*
  const canonicalLabels = brief.clusterPersonas.map(p => `${p.clusterId}（${p.academicName}）`);
  assert.ok(canonicalLabels.some(l => l.includes('多维高评组')), 'canonical neutral high-rating label present');
  assert.ok(canonicalLabels.some(l => l.includes('低评组')), 'canonical neutral dimension low-rating label present');
  for (const syncNode of ['segments.cluster', 'diagnosis.problems', 'plan.measures', 'conclusion.findings']) {
    const syncText = formatStorylineForSection(brief, syncNode);
    for (const label of canonicalLabels) {
      assert.ok(syncText.includes(label), `${syncNode} receives identical canonical cluster name ${label}`);
    }
  }

  // Wave-3: IPA decimals excluded from conclusion.findings evidence tables while correlation/OLS/Logistic/coding/pilot digest is provided
  const findingsFullPrompt = buildFullReportSectionPrompt({
    nodeId: 'conclusion.findings',
    content: pack.report,
    design: pack.design,
    held,
    contract,
    tokens: buildSectionTokens(held, pack.report, 'conclusion.findings', pack.design),
    storyline: brief,
    preservedNotes: collectPreservedResultNotes(pack.report),
    fullRun: true,
  });
  assert.doesNotMatch(findingsFullPrompt, /IPA 四象限均值分界阈值/u, 'IPA cutoff decimals confined strictly to diagnosis.evaluation');
  assert.match(findingsFullPrompt, /已登记秩相关矩阵关键系数.*ρ=/u, 'conclusion.findings receives correlation ρ values');
  assert.match(findingsFullPrompt, /已登记多元线性回归 OLS/u);
  assert.match(findingsFullPrompt, /已登记二元 Logistic 模型/u);
  assert.match(findingsFullPrompt, /已登记定性编码演练映射台账/u);
  assert.match(findingsFullPrompt, /已登记可证伪试点验证与止损矩阵/u);

  const driversFullPrompt = buildFullReportSectionPrompt({
    nodeId: 'drivers.model',
    content: pack.report,
    design: pack.design,
    held,
    contract,
    tokens: buildSectionTokens(held, pack.report, 'drivers.model', pack.design),
    storyline: brief,
    fullRun: true,
  });
  assert.doesNotMatch(driversFullPrompt, /如实写明抽样方式与覆盖范围待确认/u, 'non-boundary node suppresses 20-section sampling echo');
  assert.match(driversFullPrompt, /严禁在段首或段末重复“本轮仅作教学模拟，不报告真实调查发现”/u);

  const qcFullPrompt = buildFullReportSectionPrompt({
    nodeId: 'design.qc',
    content: pack.report,
    design: pack.design,
    held,
    contract,
    tokens: buildSectionTokens(held, pack.report, 'design.qc', pack.design),
    storyline: brief,
    fullRun: true,
  });
  assert.match(qcFullPrompt, /确定性模拟质控筛查.*严禁写出“不追认任何记录已被剔除”/u);
});

test('verifyAndHydrateV2Section supports natural prose numbers, same-table math, contextual cutoffs, Row-Entity Alignment, OR guard & surgical excision', () => {
  const crosstabResult = {
    id: 'r-cross',
    title: '不同学科门类的使用状态差异',
    sourceName: 'sim.csv',
    sourceUrl: '',
    sourceHash: 'a'.repeat(64),
    resultHash: 'b'.repeat(64),
    classification: 'simulated',
    method: 'crosstab',
    n: 615,
    total: 680,
    headers: ['学科门类', '使用状态', '频数', '行百分比 (%)'],
    rows: [
      ['理工医农类学生', '深度高频使用', 186, 58.1],
      ['理工医农类学生', '偶尔辅助使用', 134, 41.9],
      ['人文社科类学生', '深度高频使用', 102, 34.6],
      ['人文社科类学生', '偶尔辅助使用', 193, 65.4],
    ],
    metrics: [{ label: 'Pearson χ²', value: 34.12 }, { label: 'Cramér’s V', value: 0.236 }],
    warnings: [],
  };

  const logitResult = {
    id: 'r-logit',
    title: '规范采纳转化的二元 Logistic 模型',
    sourceName: 'sim.csv',
    sourceUrl: '',
    sourceHash: 'a'.repeat(64),
    resultHash: 'c'.repeat(64),
    classification: 'simulated',
    method: 'logistic',
    n: 615,
    total: 615,
    headers: ['变量', 'B', '标准误', 'Wald z', 'p', 'OR', 'OR 95% CI', '平均边际效应'],
    rows: [
      ['（截距）', '-2.410', '0.380', '-6.34', '<0.001', '—', '—', '—'],
      ['启发式引导认同', '0.615', '0.142', '4.33', '<0.001', '1.850', '[1.400, 2.444]', '0.112'],
      ['全盘代写包办倾向', '-0.492', '0.155', '-3.17', '0.002', '0.611', '[0.451, 0.828]', '-0.090'],
    ],
    metrics: [],
    warnings: [],
  };

  const preservedNotes = new Map([
    ['r-logit', ['注：$n=615$；似然比检验 $\\chi^2(2)=48.60$，$p<0.001$；McFadden 伪 $R^2=0.284$。']],
  ]);

  const tokens = {
    facts: [{ id: 'F1', text: '有效样本为 615', value: '615' }],
    exhibits: [
      { id: 'G1', text: '交叉表', value: '[[表:b-cross]]' },
      { id: 'G2', text: 'Logistic 表', value: '[[表:b-logit]]' },
    ],
    references: [{ id: 'R1', text: '文献（2024）', value: '[[引:ref-1]]' }],
  };

  const ctx = {
    methods: ['crosstab', 'logistic', 'validity'],
    planSection: false,
    mode: 'demonstration',
    pilotPending: false,
    screening: ['直线作答', '注意力题'],
    duplicatesMarked: true,
    results: [crosstabResult, logitResult],
    preservedNotes,
    labels: ['理工医农类学生', '人文社科类学生'],
  };

  // 1. Natural academic prose + placeholders + same-table diff (58.1 - 34.6 = 23.5 pp) + 0.284 <-> 28.4% + cutoffs + GB/T + Q1-Q32
  const validDraft = JSON.stringify({
    paragraphs: [
      {
        text: '围绕问卷 Q1–Q32 与三因子 F1–F3（参照 GB/T 7714—2015 标准（2024）{R1}），在有效样本 {F1} 份（总计 680 份，剔除 65 份）中，理工医农类学生深度高频使用占比达 58.1%，高出人文社科类学生（34.6%）23.5 个百分点（$\\chi^2=34.12$，$p<0.001$，见{G1}）。',
      },
      {
        text: '二元 Logistic 模型拟合稳健（McFadden 伪 $R^2=0.284$，即 28.4%，VIF 均远低于 5 的共线性阈值），在 95% 置信区间下，启发式引导认同每提高 1 个单位，采纳发生优势变为原来的 1.850 倍（95% CI [1.400, 2.444]，平均边际效应提高 11.2 个百分点，见{G2}）。',
      },
    ],
  });
  const ok = verifyAndHydrateV2Section(validDraft, tokens, ctx);
  assert.equal(ok.paragraphs.length, 2, ok.dropReasons.join(' | '));
  assert.equal(ok.droppedSentences, 0);
  assert.match(ok.paragraphs[0], /Q1–Q32.*615 份.*58\.1%.*23\.5 个百分点.*\[\[表:b-cross\]\]/u);
  assert.match(ok.paragraphs[1], /R\^2=0\.284.*1\.850 倍.*\[\[表:b-logit\]\]/u);

  // 2. Surgical sentence excision: 3 sentences in 1 paragraph -> middle sentence has 张冠李戴 swap (34.6% put on 理工医农类学生)
  const swapDraft = JSON.stringify({
    paragraphs: [
      {
        text: '交叉分析纳入有效样本 615 份，见{G1}。其中理工医农类学生深度高频使用占比为 34.6%，人文社科类学生达 58.1%。两组分布差异达到显著水平（$p<0.001$）。',
      },
    ],
  });
  const swapped = verifyAndHydrateV2Section(swapDraft, tokens, ctx);
  assert.equal(swapped.paragraphs.length, 1, 'paragraph survives after surgical removal of the offending sentence');
  assert.equal(swapped.droppedParagraphs, 0);
  assert.equal(swapped.droppedSentences, 1);
  assert.match(swapped.dropReasons[0], /张冠李戴/u);
  assert.doesNotMatch(swapped.paragraphs[0], /34\.6%/u);
  assert.match(swapped.paragraphs[0], /615 份.*p<0\.001/u);

  // 3. OR-as-probability misreading is surgically excised while valid odds interpretation stays
  const orProbDraft = JSON.stringify({
    paragraphs: [
      {
        text: '启发式引导认同的优势比 OR 为 1.850（$p<0.001$，见{G2}）。这意味着受访者的转化概率是参照组的 1.850 倍。',
      },
    ],
  });
  const orChecked = verifyAndHydrateV2Section(orProbDraft, tokens, ctx);
  assert.equal(orChecked.paragraphs.length, 1);
  assert.equal(orChecked.droppedSentences, 1);
  assert.match(orChecked.dropReasons[0], /OR 误读为概率倍数/u);
  assert.doesNotMatch(orChecked.paragraphs[0], /转化概率是参照组的/u);

  // 4. Unbacked point estimates (off-by-1 integer 616, fake point estimate 95%) are rejected, not exempted as cutoffs
  const fakeNumDraft = JSON.stringify({
    paragraphs: [
      { text: '本次分析共保留有效样本 616 份。' },
      { text: '选择深度使用的受访者占比为 95%。' },
    ],
  });
  const fakeOut = verifyAndHydrateV2Section(fakeNumDraft, tokens, ctx);
  assert.equal(fakeOut.paragraphs.length, 0);
  assert.equal(fakeOut.droppedParagraphs, 2);

  // 5. Legacy parseAndHydrateSectionDraft remains 100% strict when called directly
  assert.equal(parseAndHydrateSectionDraft('{"paragraphs":[{"text":"有效样本 615 份。"}]}', tokens, ctx).paragraphs.length, 0);

  // 6. Wave-2: Correlation matrix, cluster centroid table & multi-entity comparative sentences pass without false-positive 张冠李戴,
  //    and 表[[表:...]] / 图[[图:...]] / 矩阵615 concatenation bugs are cleanly sanitized!
  const corrMatrixResult = {
    id: 'r-corr',
    title: '核心评价维度 Spearman 秩相关矩阵',
    sourceName: 'sim.csv',
    sourceUrl: '',
    sourceHash: 'a'.repeat(64),
    resultHash: 'd'.repeat(64),
    classification: 'simulated',
    method: 'correlation',
    n: 615,
    total: 615,
    headers: ['维度', '感知用处', '操作信心', '复用意愿'],
    rows: [
      ['感知用处', '1.000', '0.512', '0.634'],
      ['操作信心', '0.512', '1.000', '0.588'],
      ['复用意愿', '0.634', '0.588', '1.000'],
    ],
    metrics: [],
    warnings: [],
  };
  const clusterCentroidResult = {
    id: 'r-clu',
    title: '受访群体 K-means 标准化聚类中心',
    sourceName: 'sim.csv',
    sourceUrl: '',
    sourceHash: 'a'.repeat(64),
    resultHash: 'e'.repeat(64),
    classification: 'simulated',
    method: 'cluster',
    n: 615,
    total: 615,
    headers: ['类别', '样本数', '占比', '感知用处', '操作信心'],
    rows: [
      ['第 1 类', 240, '39.0%', '0.82', '0.12'],
      ['第 2 类', 210, '34.1%', '0.05', '0.64'],
      ['第 3 类', 165, '26.8%', '0.19', '-0.93'],
    ],
    metrics: [{ label: '平均轮廓系数', value: 0.338 }],
    warnings: [],
  };
  const multiTokens = {
    facts: [{ id: 'F1', text: '有效分析样本数为 615', value: '615' }],
    exhibits: [
      { id: 'G1', text: '相关表', value: '[[表:b-corr]]' },
      { id: 'G2', text: '热力图', value: '[[图:b-heat]]' },
    ],
    references: [],
  };
  const matrixAndCluDraft = JSON.stringify({
    paragraphs: [
      {
        text: '由相关矩阵表{G1}与碎石图{G2}可见，感知用处与复用意愿呈显著正相关（$r=0.634$），而操作信心与复用意愿的相关系数为 0.588；理工医农类学生与人文社科类学生的深度高频使用占比分别为 58.1% 与 34.6%。',
      },
      {
        text: '聚类中心显示第 3 类在操作信心上最低（-0.93），相比第 1 类（0.12）短板突出，建议按模拟决策矩阵{F1}安排靶向试点。',
      },
    ],
  });
  const multiChecked = verifyAndHydrateV2Section(matrixAndCluDraft, multiTokens, {
    ...ctx,
    methods: ['crosstab', 'correlation', 'cluster'],
    results: [crosstabResult, corrMatrixResult, clusterCentroidResult],
  });
  assert.equal(multiChecked.droppedSentences, 0, multiChecked.dropReasons.join(' | '));
  assert.equal(multiChecked.paragraphs.length, 2);
  assert.doesNotMatch(multiChecked.paragraphs[0], /表\[\[表:|图\[\[图:/u, 'no 表[[表:...]] or 图[[图:...]] duplication');
  assert.match(multiChecked.paragraphs[0], /相关矩阵\[\[表:b-corr\]\]与碎石\[\[图:b-heat\]\]/u);
  assert.doesNotMatch(multiChecked.paragraphs[1], /矩阵615/u, 'bare integer count never glued onto 矩阵');
  assert.match(multiChecked.paragraphs[1], /按模拟决策矩阵安排靶向试点/u);

  // 7. Wave-3 & Wave-4: sanitizeV2Paragraph & INTERNAL_META_WARNING_RE scrub internal coaching/meta-directives, orphan bare counts, and parenthetical duplicate echoes
  const scrubbed = sanitizeV2Paragraph(
    '合计剔除53份（53），最终保留630份（630），有效率为92.24%（92.24%）；严禁将个案普及率绘制成饼图；不要只为提高 α 而删除题项；超出计分范围 0 行；多选题须先按选项拆列；α 不证明单维构念；该结果不证明外部获奖水平；分别登记于12、4，当前产物为草稿。',
  );
  assert.match(scrubbed, /合计剔除53份，最终保留630份，有效率为92\.24%/u);
  assert.doesNotMatch(
    scrubbed,
    /（53）|（630）|（92\.24%）|绘制成饼图|删除题项|超出计分范围|按选项拆列|α 不证明|获奖水平|分别登记于12、4|当前产物为草稿/u,
  );
  for (const w of ['不要只为提高 α 而删除题项', '超出计分范围 0 行', '多选题须先按选项拆列', 'α 不证明单维效度']) {
    assert.equal(INTERNAL_META_WARNING_RE.test(w), true, `INTERNAL_META_WARNING_RE catches ${w}`);
  }

  // 8. Wave-4: Fallback cluster label preserves full 7–10 char construct names without 6-char truncation and prioritizes embedded labels
  const customCluPack = {
    blueprint: { shortTitle: '智能设备', title: '智能设备调查', domainLabel: '消费', groupConstruct: '组别', statusConstruct: '状态', dimensions: [{ short: '操作引导清晰度水平' }, { short: '记录查阅便利性感知' }] },
    design: newQuestionnaire(),
    dataset: null,
    report: {
      ...createEditorContent(),
      quality: {
        results: [
          {
            ...clusterCentroidResult,
            headers: ['类别', '样本数', '占比', '操作引导清晰度水平', '记录查阅便利性感知'],
            rows: [
              ['第 1 类（多维高评组）', 240, '39.0%', '0.82', '0.75'],
              ['第 2 类', 210, '34.1%', '-0.91', '0.32'],
              ['第 3 类（记录查阅便利性低评组）', 165, '26.8%', '0.19', '-0.95'],
            ],
          },
        ],
        findings: [],
      },
    },
  };
  const cluBrief = buildDeterministicStorylineBrief(customCluPack, customCluPack.blueprint, 'demonstration');
  assert.equal(cluBrief.clusterPersonas[0].academicName, '多维高评组');
  assert.equal(cluBrief.clusterPersonas[1].academicName, '操作引导清晰度低评组', 'full 7-char construct preserved without 6-char truncation');
  assert.equal(cluBrief.clusterPersonas[2].academicName, '记录查阅便利性低评组', 'embedded row[0] label preserved 1-to-1');
});

test('full 28-section demonstration run integrates RichDemoPack, deduplicates formulas & banners, interleaves blocks without \\n, and checks 8-gram echo', async () => {
  // Partial run guard: circuit breaker makes exactly 1 call (zero extra blueprint/storyline calls when sectionNodes is passed!)
  let partialCalls = 0;
  const partialRes = await generateFullReportWithAgent({
    mode: 'demonstration',
    topic: TOPIC,
    concurrency: 1,
    sectionNodes: ['design.population', 'design.purpose'],
    sectionGenerator: async () => {
      partialCalls++;
      throw new Error('auth');
    },
  });
  assert.equal(partialCalls, 1, 'no blueprint/storyline call precedes section dispatch when sectionNodes is provided');
  assert.ok(partialRes);

  // Full 28-section run
  const dispatchedPurposes = [];
  let sectionSeq = 0;
  const mockSectionTriplets = [
    ['梳理数智化教学演进脉络与高校课堂生态变迁', '结合宏观教育发展导向剖析生成式工具普及动因', '立足现实推广痛点引出微观学习者行为议题'],
    ['聚焦学术诚信边界与深层认知投入之现实张力', '拆解学生便利诉求同课程考核规范间的核心矛盾', '围绕主线矛盾提炼兼具理论与管理价值的子问题'],
    ['界定高等院校在校本硕群体与多元学科目标范畴', '明确高频课程辅助与低频偶尔试用受访对象口径', '划清观测总体适用外延并衔接经验文献对话'],
    ['评述技术接受框架与学术自我效能既有实证脉络', '辨析国内外智慧教育评估在过程机制上的研究盲区', '锚定现有文献缺口确立本项研究的边际推进方向'],
    ['构建感知收益、规则顾虑与持续采纳整合分析框架', '阐明多维统计方法由浅入深递进验证的逻辑链条', '串联问卷题项测量至对策落地的全流程技术路线'],
    ['围绕核心构念拆解模块化结构测量题项设计体系', '合理排布人口特征、行为筛选、态度量表与开放问答', '核对题项指标与下游统计模型的严密映射关系'],
    ['配置跳题路由、反向计分与多选题限选约束机制', '针对不同接触经历受访者设计差异化分支作答路径', '保障配对评价与隐性重要度测算的数据结构完整'],
    ['综合课程作业辅助与文献检索高频情境拟定调查方案', '兼顾受访者作答隐私顾虑与跨院系覆盖范围权衡', '拟定清晰透明的知情同意说明与匿名采信规范'],
    ['说明教学模拟微观测度生成机理与非概率外推限制', '依据多元统计模型自由度需求阐述样本规模口径', '明确各分群与跳题子集在参数估计时的容量要求'],
    ['规划立项论证、工具打磨、模拟生成与复核阶段日程', '细化各时间窗口的质量检查节点与阶段交付产物', '建立跨环节进度缓冲机制以确保分析链条按期闭合'],
    ['阐明注意力核验、时长截断与直线作答事前质控逻辑', '设定逻辑前后矛盾筛查与重复答卷标记复核准则', '构建事前预防与事后留痕相结合的全程质控框架'],
    ['探讨小规模预测试在诊断题项语义歧义上的设计作用', '规划依据初测内部一致性表现微调冗余表述的流程', '明确调查工具进入主体分析前应当满足的测量品质'],
    ['逐层还原初始记录经既定质控规则筛查后的留存漏斗', '单独列示条件跳题分支的有效受访基数与缺失构成', '锁定各分析模块有效分母口径以杜绝基数混用偏差'],
    ['开展内部一致性检验并核查潜变量探索性因子载荷结构', '考察公共方差解释率与跨因子交叉载荷的收敛区分度', '确认潜构念结构满足进入下游回归建模的测量学前提'],
    ['勾勒受访学子年级层次、学科归属与工具接触基线轮廓', '比照不同学习任务场景下的接触频次与时长结构特征', '奠定后续跨群体交叉检验与异质性分群的样本参照系'],
    ['揭示量表得分均值梯队、标准差离散度与偏态分布特征', '扫描多选痛点题项在受访人群与响应频次上的集中度', '捕捉表层满意度掩盖下的局部功能体验分化信号'],
    ['运用列联检验与秩相关分析排查学科及年级间显著性差异', '审视感知有用性、易用体验与规范焦虑间的双变量关联', '识别单变量交叉无法剥离混杂干扰的解释局限并导入回归'],
    ['构建多元线性与二元转化回归方程剥离各构念独立净效应', '结合共线性诊断与发生优势区间刻画核心促进及抑制因子', '锚定可控关键预测变量为后续人群细分提供实证依据'],
    ['基于标准化潜构念得分实施自适应聚类并校验轮廓分离度', '提炼典型受访学子细分群体的态度组合与行为响应画像', '阐明异质性细分人群在引导策略上的差异化干预诉求'],
    ['融合重要度表现象限矩阵与正反配对需求分类敏感度', '精准锁定高重要低表现亟待修补项及魅力型增值功能点', '打通从客观感知短板到资源优先配置序列的转化桥梁'],
    ['汇合多源定量统计断点与开放式文本高频主题词共现网络', '提炼质性访谈语料扎根编码所映射的认知失调症结', '归纳制约智能工具正向助学效能释放的核心结构性症结'],
    ['针对核心短板制定分主体、分优先级的靶向治理行动清单', '明确高校教务部门、授课教师与工具研发方的协同权责边界', '绑定具体改进动作与预期监测指标以杜绝空泛口号式建议'],
    ['设计院系小范围对照试点评估方案与阶段追踪核验机制', '评估轻量化改造所需师资培训投入、技术对接与合规成本', '预设关键负向反馈触发阈值与可证伪的试点止损回退预案'],
    ['系统凝练全篇递进统计实证对开篇核心研究命题的回应', '贯通从表层采纳渗透到深层净效应及分群异质性的证据链条', '提炼兼具方法严谨性与高校教育治理参考价值的核心洞见'],
    ['面向高校课程评价改革提出过程性留痕与启发式引导规范', '呼吁平台端强化引文溯源透明提示并降低幻觉误导风险', '构建鼓励审慎探索与坚守学术底线相容的校园协同治理生态'],
    ['坦诚剖析教学模拟合成数据在真实外推效度上的固有边界', '交代横截面观测设计在双向互为因果识别上的方法学局限', '展望融合纵向追踪面板与课堂行为日志的后续深化方向'],
    ['凝练高校智能学习辅助工具采纳张力、实证模型与治理路径', '串联潜构念测量、净效应剥离、分群画像与需求优先级证据', '概括分层靶向改进方案及小规模对照试点的审慎落地框架'],
    ['如实披露大语言模型参与章节起草边界与人工统计复核职责', '说明登记证据三线表核验机制及尚未完成的独立审稿事项', '重申严守学术诚信底线与原始分析台账可追溯的合规承诺'],
  ];

  const fullRes = await generateFullReportWithAgent({
    mode: 'demonstration',
    topic: TOPIC,
    concurrency: 4,
    sectionGenerator: async req => {
      dispatchedPurposes.push({ purpose: req.purpose, nodeId: req.nodeId, wave: req.wave, attempt: req.attempt });
      if (req.purpose === 'blueprint') {
        return { content: '{}', usage: { prompt: 20, completion: 10, total: 30 } };
      }
      if (req.purpose === 'storyline') {
        return {
          content: JSON.stringify({
            motherInsight: '围绕高校智能学习场景，高渗透试用与规则顾虑并存，启发式透明引导机制显著优于结果包办代劳。',
          }),
          usage: { prompt: 30, completion: 15, total: 45 },
        };
      }
      const idx = sectionSeq++;
      const [s1, s2, s3] = mockSectionTriplets[idx % mockSectionTriplets.length];
      const gCite = req.prompt.includes('{G1}') ? '，见{G1}' : '';
      const paras = [
        { text: `${s1}${gCite}。` },
        { text: `${s2}。` },
        { text: `${s3}。` },
        ...(req.nodeId === 'abstract'
          ? [{ text: '关键词：生成式人工智能、学习体验、规范认知、二元转化、教学模拟' }]
          : []),
      ];
      return {
        content: JSON.stringify({ paragraphs: paras }),
        usage: { prompt: 40, completion: 20, total: 60 },
      };
    },
  });

  // Verify blueprint + storyline + 28 sections dispatched
  assert.ok(dispatchedPurposes.some(d => d.purpose === 'blueprint' && d.nodeId === 'design.content'));
  assert.ok(dispatchedPurposes.some(d => d.purpose === 'storyline' && d.nodeId === 'intro.roadmap' && d.wave === 1 && d.attempt === 1));
  assert.equal(fullRes.summary.totalSectionsGenerated, 28);
  assert.equal(fullRes.summary.llmSuccessCount, 28);
  assert.equal(fullRes.pack.design.questions.length, 32, 'full demonstration run uses 32-item RichDemoPack');
  assert.ok(fullRes.report.coverImage && fullRes.report.figurePalette, 'full run attaches bespoke A4 cover art & derived figure palette');

  // Editor integrity, SHA-256 quality receipts, zero dangling references
  assert.doesNotThrow(() => parseEditorContent(fullRes.report));
  await verifyResearchQuality(fullRes.report.quality);
  assert.deepEqual(danglingReferences(fullRes.report), []);

  // Formula deduplication across the entire report
  const formulaNorms = [];
  for (const sec of fullRes.report.report) {
    for (const blk of sec.blocks ?? []) {
      if (blk.kind === 'formula') formulaNorms.push(blk.text.replace(/\s+/gu, '').trim());
    }
  }
  assert.ok(formulaNorms.length > 0, 'formulas present');
  assert.equal(new Set(formulaNorms).size, formulaNorms.length, 'zero duplicate formulas across report');

  // Block-interleaved assembly invariants: opening paragraph in body, rest in blocks, no \n inside blocks, <= 60 blocks
  const driversSec = fullRes.report.report.find(s => matchBlueprintNode(s.title)?.id === 'drivers.model');
  assert.ok(driversSec);
  assert.ok(driversSec.body.length > 0 && !driversSec.body.includes('\n'), 'opening paragraph in section.body without newline');
  assert.ok(driversSec.blocks.some(b => b.kind === 'paragraph'), 'remaining drafted paragraphs interleaved into blocks');
  assert.ok(driversSec.blocks.some(b => b.kind === 'table' || b.kind === 'chart'), 'exhibits preserved alongside paragraphs');

  for (const sec of fullRes.report.report) {
    const blocks = sec.blocks ?? [];
    assert.ok(blocks.length <= 60, `${sec.title} blocks <= 60`);
    for (const blk of blocks) {
      if (blk.kind === 'paragraph') {
        assert.equal(blk.text.includes('\n'), false, `paragraph block ${blk.id} in ${sec.title} has no internal newline`);
      }
    }
  }

  // Banner deduplication on full run: explicit banner ONLY on abstract, data.cleaning, conclusion.limits (and appendix.ai)
  assert.match(fullRes.report.subtitle, /模拟/u);
  for (const sec of fullRes.report.report) {
    const nodeId = matchBlueprintNode(sec.title)?.id ?? '';
    if (!nodeId) continue;
    if (['abstract', 'data.cleaning', 'conclusion.limits'].includes(nodeId)) {
      assert.match(sec.body, /【教学模拟数据/u, `${nodeId} retains explicit simulation banner`);
    } else if (!nodeId.startsWith('appendix.')) {
      assert.doesNotMatch(sec.body, /【教学模拟数据/u, `${nodeId} avoids 28x duplicate banner spam`);
    }
  }
  assert.equal(benchmarkReport(fullRes.report).checks.find(c => c.id === 'simulated').status, 'pass');

  // Cross-section 8-gram echo check passes (< 15, actually 0) on distinct prose, avoids blind 本节统计证据详见, and catches verbatim 4-section echo
  assert.equal(fullRes.echoAudit.passed, true, fullRes.echoAudit.detail);
  assert.ok(fullRes.echoAudit.echoedNgrams.length < 15, `expected echoed 8-grams < 15, got ${fullRes.echoAudit.echoedNgrams.length}`);
  assert.equal(fullRes.quality.checks.find(c => c.id === 'cross_section_echo').status, 'pass');
  for (const sec of fullRes.report.report) {
    assert.doesNotMatch(sec.body, /本节统计证据详见/u, `${sec.title} body never tacks blind 本节统计证据详见 onto lead paragraph`);
  }

  // Verify non-boundary disclaimer echo pruning keeps echoedNgrams < 15 even if LLM echoes simulation disclaimer across 20 sections
  let noisyIdx = 0;
  const noisyRes = await generateFullReportWithAgent({
    mode: 'demonstration',
    topic: TOPIC,
    concurrency: 4,
    includeCoverArt: false,
    sectionGenerator: async req => {
      if (req.purpose === 'blueprint') return { content: '{}' };
      if (req.purpose === 'storyline') return { content: '{}' };
      const idx = noisyIdx++;
      const [s1, s2, s3] = mockSectionTriplets[idx % mockSectionTriplets.length];
      const gCite = req.prompt.includes('{G1}') ? '，见{G1}' : '';
      const paras = [
        { text: `本轮仅作教学模拟，不报告真实调查发现。${s1}${gCite}。` },
        { text: `由于抽样方式与覆盖范围待确认，外推须谨慎。${s2}。` },
        { text: `${s3}。` },
        ...(req.nodeId === 'abstract'
          ? [{ text: '关键词：生成式人工智能、学习体验、规范认知、二元转化、教学模拟' }]
          : []),
      ];
      return { content: JSON.stringify({ paragraphs: paras }) };
    },
  });
  assert.ok(
    noisyRes.echoAudit.echoedNgrams.length < 15,
    `expected < 15 echoed 8-grams after boundary gating & pruning, got ${noisyRes.echoAudit.echoedNgrams.length}: ${noisyRes.echoAudit.detail}`,
  );

  const echoedReport = structuredClone(fullRes.report);
  let injected = 0;
  for (const sec of echoedReport.report) {
    const node = matchBlueprintNode(sec.title);
    if (node?.kind === 'section' && injected < 4) {
      sec.body = `受访群体呈现高认知渗透与低复购转化剪刀差。${sec.body}`;
      injected++;
    }
  }
  const echoDetected = checkCrossSectionEcho(echoedReport);
  assert.equal(echoDetected.passed, false);
  assert.ok(echoDetected.echoedNgrams.length > 0);

  // Wave-3: Repeating registered construct/variable/cluster-label proper nouns across 6 sections does NOT trigger false-positive echo
  const properNounReport = structuredClone(fullRes.report);
  const sampleVar = fullRes.report.quality.results.find(r => r.method === 'alpha')?.rows?.[0]?.[0] ?? '感知有用性';
  const sampleClu = fullRes.storyline.clusterPersonas[0]
    ? `${fullRes.storyline.clusterPersonas[0].clusterId}（${fullRes.storyline.clusterPersonas[0].academicName}）`
    : '第 1 类（多维高评组）';
  let nounInjected = 0;
  const distinctFrames = [
    `评估${sampleClu}在${sampleVar}上的基线状态。`,
    `比照${sampleClu}围绕${sampleVar}的离散表现。`,
    `核算${sampleClu}针对${sampleVar}的边际响应。`,
    `归纳${sampleClu}关于${sampleVar}的诉求重点。`,
    `排定${sampleClu}面向${sampleVar}的试点顺序。`,
    `复盘${sampleClu}对应${sampleVar}的适用边界。`,
  ];
  for (const sec of properNounReport.report) {
    const node = matchBlueprintNode(sec.title);
    if (node?.kind === 'section' && nounInjected < 6) {
      sec.body = `${distinctFrames[nounInjected]}${sec.body}`;
      nounInjected++;
    }
  }
  const properNounEcho = checkCrossSectionEcho(properNounReport);
  assert.equal(properNounEcho.passed, true, properNounEcho.detail);

  // Wave-4: Standard statistical method & boundary terms in BENIGN_8GRAM_PATTERNS pass checkCrossSectionEcho cleanly
  const methodTermsReport = structuredClone(fullRes.report);
  const methodLeadSentences = [
    '采用二元Logistic回归与平均边际效应AME检验。',
    '结合二元Logistic回归同KANO正反配对互证。',
    '对照KANO正反配对与Cramér’s V衡量强度。',
    '核查Breusch–Pagan同Kruskal–Wallis检验。',
    '交代抽样方式与覆盖范围边界条件。',
  ];
  let mInjected = 0;
  for (const sec of methodTermsReport.report) {
    const node = matchBlueprintNode(sec.title);
    if (node?.kind === 'section' && mInjected < methodLeadSentences.length) {
      sec.body = `${methodLeadSentences[mInjected]}${sec.body}`;
      mInjected++;
    }
  }
  const methodTermsEcho = checkCrossSectionEcho(methodTermsReport);
  assert.equal(methodTermsEcho.passed, true, methodTermsEcho.detail);

  // Direct unit check on assembleInterleavedSection & deduplicateReportFormulas reference redirection
  const dummySec = {
    id: 'sec-test',
    title: '（一）回归模型分析',
    body: '',
    source: '',
    blocks: [
      { id: 'f-1', kind: 'formula', text: 'Y = \\beta_0 + \\beta_1 X', evidenceId: '', valueColumn: 0 },
      { id: 't-1', kind: 'table', text: '回归估计表', evidenceId: 'r1', valueColumn: 1 },
      { id: 'c-1', kind: 'chart', text: '系数森林图', evidenceId: 'r1', valueColumn: 1 },
    ],
  };
  const interleaved = assembleInterleavedSection(dummySec, [
    '首段说明模型设定与变量选择。',
    '第二段结合[[表:t-1]]拆解显著回归系数。',
    '第三段结合[[图:c-1]]检视置信区间并引出下节聚类。',
  ]);
  assert.equal(interleaved.body, '首段说明模型设定与变量选择。');
  assert.deepEqual(
    interleaved.blocks.map(b => b.kind),
    ['formula', 'paragraph', 'table', 'paragraph', 'chart'],
  );

  const dupFormulaDoc = {
    ...createEditorContent(),
    version: 2,
    report: [
      { id: 's1', title: '（一）第一处', body: '见[[式:eq-a]]。', source: '', blocks: [{ id: 'eq-a', kind: 'formula', text: 'a+b=c', evidenceId: '', valueColumn: 0 }] },
      { id: 's2', title: '（二）第二处', body: '复引[[式:eq-b]]。', source: '', blocks: [{ id: 'eq-b', kind: 'formula', text: 'a + b = c', evidenceId: '', valueColumn: 0 }] },
    ],
  };
  const dedupedDoc = deduplicateReportFormulas(dupFormulaDoc);
  assert.equal(dedupedDoc.report[1].blocks.length, 0);
  assert.equal(dedupedDoc.report[1].body, '复引[[式:eq-a]]。', 'duplicate formula reference redirected to canonical equation block');

  // Wave-5B & Wave-6: Default full run registers structured rich-profile-infographic-* & rich-behavior-infographic-*
  // without injecting an unprompted overview panorama, and synthesizes deterministic coverImage + frameImage (replacing reportFrame);
  // meanwhile includeCoverArt: false (noisyRes) skips all cover/frame/illustration generation cleanly!
  assert.equal(
    fullRes.report.quality.results.some(r => /全景示意图/u.test(r.title)),
    false,
    'offline unit run does NOT insert extra panoramic overview snapshot without explicit featureOverviewEndpoint',
  );
  assert.ok(
    fullRes.report.quality.results.some(r => r.id.startsWith('rich-profile-infographic-')),
    'Wave-6 RichStudy registers respondent profile composite infographic in sample.profile',
  );
  assert.ok(
    fullRes.report.quality.results.some(r => r.id.startsWith('rich-behavior-infographic-')),
    'Wave-6 RichStudy registers respondent behavior composite infographic in sample.descriptive',
  );
  assert.ok(fullRes.report.coverImage, 'default full run attaches deterministic coverImage');
  assert.ok(fullRes.report.figurePalette, 'default full run attaches cover-derived figurePalette');
  assert.ok(fullRes.report.frameImage, 'default full run attaches frameImage');
  assert.equal(fullRes.report.reportFrame, undefined, 'frameImage cleanly replaces drawn reportFrame');
  assert.equal(noisyRes.report.coverImage, undefined, 'includeCoverArt: false skips coverImage');
  assert.equal(noisyRes.report.frameImage, undefined, 'includeCoverArt: false skips frameImage');
  assert.equal(noisyRes.report.illustrations ?? undefined, undefined, 'includeCoverArt: false skips end-of-pipeline section illustrations');

  const testDir = dirname(fileURLToPath(import.meta.url));
  const overviewPngBase64 = readFileSync(resolve(testDir, '../public/art/overview-silver-health.png')).toString('base64');
  const synthCover = await synthesizeDeterministicCoverArt({ title: '银发智能健康监测调查', accent: 'teal' });
  const synthFrame = await synthesizeDeterministicFrameArt({ accent: 'teal' });

  let sampleProfilePromptSeen = '';
  let sampleDescriptivePromptSeen = '';
  let introLitPromptSeen = '';
  let abstractPromptSeen = '';
  let planMeasuresPromptSeen = '';
  let conclusionSuggestionsPromptSeen = '';
  const imageTasksSeen = [];
  let liveSeq = 0;
  const liveOverviewRes = await generateFullReportWithAgent({
    mode: 'demonstration',
    topic: '银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查',
    concurrency: 6,
    coverArtEndpoint: 'http://127.0.0.1:3180/api/agent/image-gen',
    featureOverviewEndpoint: 'http://127.0.0.1:3180/api/agent/image-gen',
    imageFetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      imageTasksSeen.push(`${body.task}:${body.pageArtKind ?? 'section'}:${Boolean(body.allowEmbeddedTypography)}`);
      if (body.task === 'report_cover') {
        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'live_api',
            resolvedModel: 'gpt-image-1.5',
            pageArt: synthCover.coverImage,
            figurePalette: synthCover.figurePalette,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (body.task === 'report_frame') {
        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'live_api',
            resolvedModel: 'gpt-image-1.5',
            pageArt: synthFrame,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (body.task === 'descriptive_infographic' || body.task === 'section_illustration') {
        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'live_api',
            resolvedModel: 'gpt-image-1.5',
            sectionArt: {
              mime: 'image/png',
              data: overviewPngBase64,
              widthPx: 1280,
              heightPx: 720,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 503 });
    },
    sectionGenerator: async req => {
      if (req.purpose === 'blueprint' || req.purpose === 'storyline') return { content: '{}' };
      if (req.nodeId === 'sample.profile') sampleProfilePromptSeen = req.prompt;
      if (req.nodeId === 'sample.descriptive') sampleDescriptivePromptSeen = req.prompt;
      if (req.nodeId === 'intro.literature') introLitPromptSeen = req.prompt;
      if (req.nodeId === 'abstract') abstractPromptSeen = req.prompt;
      if (req.nodeId === 'plan.measures') planMeasuresPromptSeen = req.prompt;
      if (req.nodeId === 'conclusion.suggestions') conclusionSuggestionsPromptSeen = req.prompt;
      const idx = liveSeq++;
      const [s1, s2, s3] = mockSectionTriplets[idx % mockSectionTriplets.length];
      const gCite = req.prompt.includes('{G1}') ? '，见{G1}' : '';
      return {
        content: JSON.stringify({
          paragraphs: [
            { text: `${s1}${gCite}。` },
            { text: `${s2}。` },
            { text: `${s3}。` },
            ...(req.nodeId === 'abstract'
              ? [{ text: '关键词：智能健康监测、老年群体、代际支持、采纳意愿、教学模拟' }]
              : []),
          ],
        }),
      };
    },
  });

  // Wave-6 prompt contract & localGovernancePolicies assertions
  assert.match(abstractPromptSeen, /920–1030\s*中文字/u, 'abstract enforces 920–1030 Chinese chars single-page high-density lock');
  assert.match(planMeasuresPromptSeen, /基层微观实情与当地特色政策工具锚定清单/u, 'plan.measures injects localGovernancePolicies');
  assert.match(planMeasuresPromptSeen, /适老化|长者数字驿站|家庭医生签约|银龄互助/u, 'silver-health blueprint localGovernancePolicies flow into storyline');
  assert.match(planMeasuresPromptSeen, /加强顶层设计、加大宣传力度、完善监管机制、形成多方合力/u, 'plan.measures explicitly blacklists empty slogans');
  assert.match(conclusionSuggestionsPromptSeen, /基层微观实情与当地特色政策工具锚定清单/u, 'conclusion.suggestions injects localGovernancePolicies');
  assert.match(introLitPromptSeen, /文献关键词共现聚类网络/u, 'intro.literature references co-occurrence network cleanly');
  assert.equal(/VOSviewer/iu.test(introLitPromptSeen), false, 'intro.literature prompt never leaks raw software brand VOSviewer');
  assert.match(sampleDescriptivePromptSeen, /主动建言高频语义词云/u, 'sample.descriptive references Q32 active-feedback wordcloud');

  // Pre-Wave-1 panorama + Wave-6 end-of-pipeline 4-generator visual chain assertions
  assert.match(sampleProfilePromptSeen, /总体特征全景示意图/u, 'sample.profile prompt receives {G_k} for AI overview panorama before Wave 1');
  assert.match(sampleProfilePromptSeen, /全景配图引述护栏/u, 'sample.profile prompt carries qualitative-only overview guard');
  assert.match(sampleProfilePromptSeen, /总体特征全景图契约/u, 'sample.profile corpus skill block carries panorama guard');

  assert.ok(imageTasksSeen.includes('report_cover:cover:true'), 'invoked GPT-Image embedded-typography cover generator');
  assert.ok(imageTasksSeen.includes('report_frame:frame:false'), 'invoked GPT-Image thematic frame generator');
  assert.ok(imageTasksSeen.includes('descriptive_infographic:section:true'), 'invoked GPT-Image demographic silhouette+progress-bar infographic generator');
  assert.ok(imageTasksSeen.includes('section_illustration:section:true'), 'invoked GPT-Image Chapter 9 implementation mechanism generator');

  assert.ok(liveOverviewRes.report.coverImage?.note.includes('题名字形在图中'), 'live coverImage carries embedded title note');
  assert.ok(liveOverviewRes.report.frameImage, 'live frameImage attached');
  assert.equal(liveOverviewRes.report.reportFrame, undefined, 'live frameImage replaces reportFrame cleanly');
  const boundResultIds = (liveOverviewRes.report.illustrations ?? []).map(ill => ill.resultId);
  assert.ok(boundResultIds.length >= 4 && boundResultIds.length <= 12, `expected 4..12 bound illustrations, got ${boundResultIds.length}`);
  assert.ok(boundResultIds.some(id => id.startsWith('rich-profile-infographic-')));
  assert.ok(boundResultIds.some(id => id.startsWith('rich-behavior-infographic-')));
  assert.ok(boundResultIds.some(id => id.startsWith('rich-action-roadmap-')));
  assert.doesNotThrow(() => parseEditorContent(liveOverviewRes.report));
  await verifyResearchQuality(liveOverviewRes.report.quality);
});

test('Wave-7 empirical mode enforces zero simulation/AI disclosure leaks, skips noteDrafting, routes一、绪论 macro-trend & summary cards, and binds Python dense wordcloud + Figure-29 summary cards', async () => {
  const silverTopic = '银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查';
  const empPack = await buildRichDemoPack(silverTopic);
  assert.equal(empPack.dataset.kind, 'user_provided');
  assert.ok(empPack.report.quality.results.every(r => r.classification === 'user_provided'));
  assert.ok(empPack.report.report.some(s => s.title === '一、绪论'));

  const testDir = dirname(fileURLToPath(import.meta.url));
  const samplePngBase64 = readFileSync(resolve(testDir, '../public/art/overview-silver-health.png')).toString('base64');
  const synthCover = await synthesizeDeterministicCoverArt({ title: silverTopic, accent: 'teal' });
  const synthFrame = await synthesizeDeterministicFrameArt({ accent: 'teal' });

  let introBgPromptSeen = '';
  let abstractEmpPromptSeen = '';
  let wcPayloadSeen = null;
  const summaryCardPromptsSeen = [];

  const empiricalTriplets = [
    ['课题组结合多阶段分层抽样调查数据审视老年受访群体接触基础', '样本在关键体验指标上呈现出明显结构差异', '为后续多变量建模提供扎实截面依据'],
    ['基于预调查与正式施测质量复核台账核验各模块有效应答分母', '跳题资格掩码将实际使用者与未接触者严格区分', '保障子量表内部一致性与因子载荷稳健'],
    ['描述统计与多重响应分析揭示日常佩戴频次同操作门槛密切关联', '受访者主动填写的开放建议聚焦界面简化与语音提醒', '印证基层驻点辅导的现实迫切性'],
    ['控制人口与接触背景协变量后核心感知指标仍具显著正向预测力', '六变量轮廓系数聚类识别出三类差异化老年受众画像', '依托社区长者驿站与家庭医生签约推进三十天对照试行'],
  ];
  let empSeq = 0;

  const empRes = await generateFullReportWithAgent({
    mode: 'empirical',
    topic: silverTopic,
    base: { design: empPack.design, dataset: empPack.dataset, report: empPack.report },
    project: { projectId: 'proj-wave7-empirical', runId: 'run-wave7-1', inputRevision: 'rev-wave7-1' },
    concurrency: 6,
    coverArtEndpoint: 'http://127.0.0.1:3180/api/agent/image-gen',
    wordCloudEndpoint: 'http://127.0.0.1:8180/api/reports/wordcloud',
    imageFetcher: async (url, init) => {
      const urlStr = String(url);
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (urlStr.includes('/api/reports/wordcloud')) {
        wcPayloadSeen = body;
        return new Response(
          JSON.stringify({
            ok: true,
            illustration: {
              schema: 'SectionIllustration/v1',
              id: body.id || 'wc-silver',
              resultId: body.resultId,
              mime: 'image/png',
              data: samplePngBase64,
              widthPx: 1280,
              heightPx: 720,
              note: '开放式反馈高频语义词云图',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (body.task === 'report_cover') {
        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'live_api',
            resolvedModel: 'gpt-image-2',
            pageArt: synthCover.coverImage,
            figurePalette: synthCover.figurePalette,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (body.task === 'report_frame') {
        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'live_api',
            resolvedModel: 'gpt-image-1.5',
            pageArt: synthFrame,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (body.task === 'section_illustration') {
        summaryCardPromptsSeen.push(String(body.prompt ?? ''));
      }
      if (body.task === 'descriptive_infographic' || body.task === 'section_illustration') {
        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'live_api',
            resolvedModel: 'gpt-image-2',
            sectionArt: {
              mime: 'image/png',
              data: samplePngBase64,
              widthPx: 1280,
              heightPx: 720,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 503 });
    },
    sectionGenerator: async req => {
      if (req.purpose === 'storyline') return { content: '{}' };
      if (req.nodeId === 'intro.background') introBgPromptSeen = req.prompt;
      if (req.nodeId === 'abstract') abstractEmpPromptSeen = req.prompt;
      const idx = empSeq++;
      const [s1, s2, s3] = empiricalTriplets[idx % empiricalTriplets.length];
      const gCite = req.prompt.includes('{G1}') ? '，见{G1}' : '';
      // Intentionally inject forbidden simulation/AI meta-phrases in diagnosis.problems to verify deterministic empirical scrubber!
      const leakProbe = req.nodeId === 'diagnosis.problems'
        ? '【教学模拟数据】本节结合模拟数据、随机种子与演练语料及大语言模型和人工智能AI生成展开归纳。'
        : '';
      return {
        content: JSON.stringify({
          paragraphs: [
            { text: `${leakProbe}${s1}${gCite}。` },
            { text: `${s2}。` },
            { text: `${s3}。` },
            ...(req.nodeId === 'data.cleaning'
              ? [{ text: '注：未加权、未自动删除重复行、未插补；原因计数可能重叠。' }]
              : []),
            ...(req.nodeId === 'abstract'
              ? [{ text: '关键词：智能健康监测、老年群体、代际支持、采纳意愿、分层治理' }]
              : []),
          ],
        }),
      };
    },
  });

  // 1. Empirical prompt mandates & macro-trend table routing
  assert.match(abstractEmpPromptSeen, /mode=empirical/u);
  assert.match(abstractEmpPromptSeen, /严禁单独输出任何以“注：”/u);
  assert.match(abstractEmpPromptSeen, /严禁在正文、摘要、表注或附录中出现任何“教学模拟、模拟数据/u);
  assert.doesNotMatch(abstractEmpPromptSeen, /演练映射台账（同构演练语料/u, 'empirical cross-chapter digest never feeds 演练语料');
  assert.match(introBgPromptSeen, /rich-macro-trend-/u, 'intro.background receives full macro-trend 3-line table');

  // 2. noteDrafting is NEVER called in empirical mode, ZERO `注：…` lines/blocks remain, and ZERO simulation/AI terms exist!
  assert.equal(empRes.revisions.some(r => r.id.startsWith('disclosure-')), false, 'empirical mode never runs noteDrafting');
  for (const sec of empRes.report.report) {
    assert.equal(/^\s*(?:表注|图注|注)[:：]/mu.test(sec.body), false, `unexpected 注： line in ${sec.title}`);
    for (const blk of sec.blocks ?? []) {
      if (blk.kind === 'paragraph') {
        assert.equal(/^\s*(?:表注|图注|注)[:：]/mu.test(blk.text), false, `unexpected 注： block in ${sec.title}`);
      }
    }
  }
  assert.ok((empRes.report.figures ?? []).every(f => !f.note), 'all figure.note entries cleared in empirical mode');
  const app2 = empRes.report.report.find(s => /^附录二/u.test(s.title));
  assert.ok(app2);
  assert.match(app2.title, /抽样配额分配与田野质量控制复核台账/u);

  const wave7ForbiddenRx =
    /教学模拟|模拟数据|模拟样本|模拟记录|随机种子|算法合成|演练语料|机器生成|数据生成|人工智能|大语言模型|AI\s*生成|AIGC/iu;
  const serializedReport = JSON.stringify({
    title: empRes.report.title,
    subtitle: empRes.report.subtitle,
    coverNote: empRes.report.coverImage?.note,
    frameNote: empRes.report.frameImage?.note,
    illustrationNotes: (empRes.report.illustrations ?? []).map(i => i.note),
    sections: empRes.report.report,
    results: empRes.report.quality?.results,
  });
  const leakMatch = wave7ForbiddenRx.exec(serializedReport);
  assert.equal(leakMatch, null, `expected 0 forbidden simulation/AI terms in empirical report, found: ${leakMatch?.[0]}`);

  // 3. Wave-7 visual auto-generation: cover + frame + Python dense wordcloud + 2 demographic infographics + 4 Figure-29 structured summary cards = 7 illustrations (<= 12)
  assert.ok(wcPayloadSeen, 'invoked POST /api/reports/wordcloud for Q32 open-feedback corpus');
  assert.ok(Array.isArray(wcPayloadSeen.words) && wcPayloadSeen.words.length > 0);
  assert.ok(typeof wcPayloadSeen.text === 'string' && wcPayloadSeen.text.length > 20, 'passed Q32 raw corpus text to jieba wordcloud');
  assert.equal(summaryCardPromptsSeen.length, 4, 'generated all 4 Figure-29 structured summary cards (significance, innovation, measures, conclusion)');

  const empIllIds = (empRes.report.illustrations ?? []).map(i => i.resultId);
  assert.equal(empIllIds.length, 7);
  for (const prefix of [
    'rich-wordcloud-',
    'rich-profile-infographic-',
    'rich-behavior-infographic-',
    'rich-significance-summary-',
    'rich-innovation-summary-',
    'rich-action-roadmap-',
    'rich-conclusion-summary-',
  ]) {
    assert.ok(empIllIds.some(id => id.startsWith(prefix)), `missing bound SectionIllustration for ${prefix}`);
  }
  assert.doesNotThrow(() => parseEditorContent(empRes.report));
  await verifyResearchQuality(empRes.report.quality);
});
