import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  autoLayoutDiagram,
  buildDiagramResultSnapshot,
  buildWordCloudResultSnapshot,
  DIAGRAM_PRESETS,
  diagramSnapshotSVG,
  fromDrawioXml,
  toDrawioXml,
} from '../lib/diagram-figures.ts';
import { buildDemoPack } from '../lib/agent/demo-study.ts';
import {
  applyCrossReferenceToContent,
  buildDefenseScriptDocx,
  buildDefenseScriptMarkdown,
  buildQuickQuestionnaire,
  generateProceduralStudioSvg,
  matchCrossReferences,
  MAX_TEAM_MEMBERS,
  searchReportForQa,
} from '../lib/agent/studio-tools.ts';
import { fullReportInputRevision } from '../lib/agent/full-report-request.ts';
import { buildDocx } from '../lib/editor-export.ts';
import { inspectOfficePackage } from '../lib/office-package.ts';
import { generateLatexBody, latexCompileInput, latexFigureReferences } from '../lib/latex-report.ts';
import { exportWjxBundle } from '../lib/questionnaire-platform-export.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import { figureInk } from '../lib/figure-palette.ts';
import { assertTrueVector } from '../lib/svg-safety.ts';
import {
  CP_AND_AWARD_CROSSREF_PRESETS,
  EDITION_17_OFFICIAL_GUIDE,
  SURVEY_17_CATEGORY_TEMPLATES,
  TOPIC_THEMES_2027,
  TOPICS_2027_POOL,
  ZHENGDA_ARCHIVE_2015_2025,
  ZHENGDA_ARCHIVE_META,
  calculateProvincialQuota,
  zhengdaArchiveLitRecords,
} from '../data/zhengda-corpus-2015-2027.ts';
import { inferAgentCloudShape, synthesizeSemanticCloudMask } from '../lib/topic-lab/cloud-shapes.ts';
import { decomposeTopic } from '../lib/agent/demo-study.ts';
import { verifyResearchQuality } from '../lib/research-quality.ts';
import {
  ARCHIVE_YEAR_DISTRIBUTION,
  CANONICAL_THREE_LINE_TABLES,
  CORPUS_RESERVE_SUMMARY,
  EMPIRICAL_MODEL_STATS,
  SECTION_RHETORICAL_BLUEPRINTS,
  TITLE_RHETORIC_PATTERNS,
  VISUAL_EXHIBIT_STATS,
  getSectionRhetoricalBlueprint,
} from '../data/zhengda-empirical-anatomy.ts';
import {
  WAVE_1_SECTION_NODES,
  WAVE_2_SYNTHESIS_NODES,
  buildFullReportSectionPrompt,
  parseAndHydrateSectionDraft,
  sanitizeModelParagraph,
} from '../lib/agent/full-report-pipeline.ts';
import { buildSkillPackContract } from '../lib/agent/full-report-pipeline.ts';
import { buildSectionTokens } from '../lib/agent/full-report-pipeline.ts';
import {
  TOP10_DEAI_SKILLS,
  buildDeAiPromptRules,
  detectAiFlavor,
  generateInterviewCorpus,
  humanizeTextWithSkills,
} from '../lib/agent/interview-corpus-deai.ts';
import {
  IMAGE_GEN_MODELS,
  REPORT_IMAGE_TASKS,
  buildInfographicResultSnapshot,
  buildReportDrivenImagePrompt,
  cleanInfographicTitle,
  extractDescriptivePanelsFromReport,
} from '../lib/agent/image-gen-engine.ts';
import { appendRegisteredResult } from '../lib/result-registration.ts';
import { placeResult } from '../lib/report-placement.ts';

test('draw.io XML roundtrip and Dagre vector snapshot export cleanly', async () => {
  const preset = DIAGRAM_PRESETS[0].spec;
  const laid = autoLayoutDiagram(preset);
  assert.ok(laid.nodes.every(n => typeof n.x === 'number' && typeof n.y === 'number'));

  const xml = toDrawioXml(laid, '实证技术路线');
  assert.match(xml, /<mxGraphModel\b/);
  const parsed = fromDrawioXml(xml);
  assert.equal(parsed.nodes.length, laid.nodes.length);
  assert.ok(parsed.edges.length >= 1);

  const snap = await buildDiagramResultSnapshot({
    id: 'diag-test',
    method: 'framework',
    title: '技术路线框架图',
    subtitle: 'draw.io 本地仿真链路',
    sourceHash: '0'.repeat(64),
    classification: 'simulated',
    spec: laid,
  });
  await verifyResearchQuality({ version: 1, results: [snap], findings: [] });
  const svg = assertTrueVector(diagramSnapshotSVG(snap, figureInk(createEditorContent())));
  assert.match(svg, /<svg\s/);
  assert.match(svg, /技术路线框架图|准备|设计/);
});

test('wordcloud snapshot renders vector SVG and integrates into demo pack, Word docx, and LaTeX', async () => {
  const cloud = await buildWordCloudResultSnapshot({
    id: 'wc-test',
    title: '调研文献主题词云图',
    sourceHash: 'a'.repeat(64),
    words: [
      { word: '满意度', weight: 18 },
      { word: '分层抽样', weight: 14 },
      { word: '服务效率', weight: 12 },
      { word: '数字鸿沟', weight: 10 },
      { word: '持续意愿', weight: 9 },
    ],
  });
  await verifyResearchQuality({ version: 1, results: [cloud], findings: [] });
  const cloudSvg = assertTrueVector(diagramSnapshotSVG(cloud, figureInk(createEditorContent())));
  assert.match(cloudSvg, /满意度/);

  const pack = await buildDemoPack('青年数字化公共服务满意度实证调研');
  const results = pack.report.quality.results;
  assert.ok(results.some(r => r.method === 'wordcloud'), 'demo pack embeds wordcloud result');
  assert.ok(results.some(r => r.method === 'framework'), 'demo pack embeds framework roadmap result');

  const resultMethodById = new Map(results.map(r => [r.id, r.method]));
  const introLit = pack.report.report.find(s => s.blocks?.some(b => b.kind === 'chart' && resultMethodById.get(b.evidenceId) === 'wordcloud'));
  const designContent = pack.report.report.find(s => s.blocks?.some(b => b.kind === 'chart' && resultMethodById.get(b.evidenceId) === 'framework'));
  assert.ok(introLit, 'wordcloud exhibit placed in a report section');
  assert.match(introLit.title, /文献/);
  assert.ok(designContent, 'framework roadmap exhibit placed in a report section');
  assert.match(designContent.title, /调查内容|问卷结构|研究思路|技术路线/);

  const stubPng = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
  const docxBlob = await buildDocx(pack.report, undefined, async () => stubPng);
  const docxBytes = new Uint8Array(await docxBlob.arrayBuffer());
  const pkg = inspectOfficePackage(docxBytes, 'docx');
  assert.equal(pkg.kind, 'docx');

  const latexBody = generateLatexBody({ ...pack.report, latex: undefined });
  const compileInput = latexCompileInput({ ...pack.report, latex: { version: 1, body: latexBody, reportHash: '0'.repeat(64) } });
  const refs = latexFigureReferences(latexBody, 'ResearchImage');
  assert.ok(refs.length >= 2);
  assert.ok(compileInput.figureImages.length >= 2);
});

test('cross-reference matcher injects citations and updates reference list without drift', async () => {
  const pack = await buildDemoPack('城市智慧文旅服务满意度研究');
  const candidate = {
    id: 'ref-1',
    title: '基于修正 IPA 与回归模型的旅游服务质量评价',
    authors: '王晨曦, 刘思涵',
    year: '2024',
    journal: '旅游学刊',
    keywords: ['满意度', '服务', '回归', '评价', '改进'],
    claim: '修正 IPA 可有效定位优先治理环节',
  };
  const matches = matchCrossReferences(pack.report.report, candidate, 5);
  assert.ok(matches.length >= 1);
  assert.ok(matches[0].score > 0.1);

  const applied = applyCrossReferenceToContent(pack.report, candidate, matches[0]);
  assert.equal(applied.citeNumber, (pack.report.references?.length ?? 0) + 1);
  assert.ok(applied.content.references?.some(r => r.title === candidate.title));
  const targetSec = applied.content.report.find(s => s.id === matches[0].sectionId);
  assert.ok(targetSec?.body.includes(`[[引:${applied.refId}]]`));
});

test('Q/A MiniSearch indexes report sections and exports valid Markdown and Docx defense script', async () => {
  const pack = await buildDemoPack('社区养老助餐服务满意度与优化路径');
  const qa = searchReportForQa(pack.report, '抽样设计 满意度 回归', 4);
  assert.ok(qa.hits.length >= 1);
  assert.ok(qa.highlightTerms.length >= 1);

  const items = [
    {
      id: 'qa-1',
      question: '你们的抽样与信效度如何保障？',
      sourceMode: 'report_hit',
      hits: qa.hits,
      highlightTerms: qa.highlightTerms,
      answerDraft: '我们在第二章与第三章结合分层配额抽样与注意力甄别确保样本可靠性。',
      followUpTip: '当场展示红色高亮定位句。',
      createdAt: new Date().toISOString(),
    },
  ];
  const md = buildDefenseScriptMarkdown(pack.report.title, items);
  assert.match(md, /问辩稿/);
  assert.match(md, /抽样与信效度/);

  const docxBlob = await buildDefenseScriptDocx(pack.report.title, items);
  const docxBytes = new Uint8Array(await docxBlob.arrayBuffer());
  assert.equal(inspectOfficePackage(docxBytes, 'docx').kind, 'docx');
});

test('quick questionnaire builder exports clean WJX bundle and IP/avatar SVGs stay safe', async () => {
  assert.equal(MAX_TEAM_MEMBERS, 6);
  const q = buildQuickQuestionnaire({
    title: '高校智能阅读服务调研',
    objective: '探究高校读者满意度',
    population: '在校本科生与研究生',
    groupQuestion: '您当前的年级阶段是？',
    groupChoices: ['低年级本科', '高年级本科', '硕博研究生'],
    dimensions: ['检索效率', '资源丰富度', '互动体验'],
    includeAttentionCheck: true,
  });
  assert.equal(q.questions.length, 6);
  const wjx = await exportWjxBundle(q, { sourceRevision: 1 });
  assert.ok(wjx.text.includes('检索效率'));
  assert.equal(wjx.manifest.source.questionnaire.title, '高校智能阅读服务调研');

  for (const preset of ['cover', 'frame', 'mascot', 'avatar', 'illustration']) {
    const svg = assertTrueVector(generateProceduralStudioSvg({ preset, prompt: '证见 EVI-X 队员头像', accentHex: '#0F766E' }));
    assert.match(svg, /^<svg\s/);
  }
});

test('fullReportInputRevision preserves legacy hash without steeringNotes and changes when steeringNotes are set', async () => {
  const revBase = await fullReportInputRevision({ topic: '测试课题', mode: 'demonstration' });
  const revEmpty = await fullReportInputRevision({ topic: '测试课题', mode: 'demonstration', steeringNotes: [] });
  assert.equal(revBase, revEmpty);

  const revSteered = await fullReportInputRevision({
    topic: '测试课题',
    mode: 'demonstration',
    steeringNotes: ['重点对比 Z 世代人群的满意度差异'],
  });
  assert.notEqual(revBase, revSteered);
});

test('Zhengda 2015-2027 full archive, 50 topics pool, 17th-edition quota/weights, 17 survey templates, and domain expansion', () => {
  assert.ok(ZHENGDA_ARCHIVE_2015_2025.length >= 200);
  assert.equal(ZHENGDA_ARCHIVE_META.totalReports, ZHENGDA_ARCHIVE_2015_2025.length);
  assert.ok(ZHENGDA_ARCHIVE_2015_2025.some(r => r.isCpProposition));
  for (let y = 2015; y <= 2025; y++) {
    assert.ok(ZHENGDA_ARCHIVE_2015_2025.some(r => r.year === y), `Archive missing year ${y}`);
  }
  const litRecords = zhengdaArchiveLitRecords();
  assert.equal(litRecords.length, ZHENGDA_ARCHIVE_2015_2025.length);
  assert.ok(litRecords.every(r => r.title && r.keywords.length > 0 && r.format === 'library'));
  assert.equal(JSON.stringify(ZHENGDA_ARCHIVE_2015_2025).includes('C:\\Users'), false);

  assert.equal(TOPICS_2027_POOL.length, 50);
  for (const theme of TOPIC_THEMES_2027) {
    assert.ok(TOPICS_2027_POOL.some(t => t.theme === theme), `Missing 2027 theme ${theme}`);
  }

  assert.equal(calculateProvincialQuota('本科组', 300).quota, 15);
  assert.equal(calculateProvincialQuota('本科组', 600).quota, 25);
  assert.equal(calculateProvincialQuota('本科组', 1200).quota, 30);
  assert.equal(calculateProvincialQuota('研究生组', 200).quota, 20);
  assert.equal(calculateProvincialQuota('研究生组', 300).quota, 20);
  assert.equal(calculateProvincialQuota('专科组', 120).quota, 12);
  assert.equal(calculateProvincialQuota('在华留学生组', 100).quota, 3);

  const reportSum = EDITION_17_OFFICIAL_GUIDE.reportScoringWeights.reduce((acc, w) => acc + w.points, 0);
  const defenseSum = EDITION_17_OFFICIAL_GUIDE.defenseScoringWeights.reduce((acc, w) => acc + w.points, 0);
  assert.equal(reportSum, 100);
  assert.equal(defenseSum, 100);
  assert.ok(EDITION_17_OFFICIAL_GUIDE.classicJudgeQaFromWinners.length >= 4);

  assert.equal(SURVEY_17_CATEGORY_TEMPLATES.length, 17);
  for (const tpl of SURVEY_17_CATEGORY_TEMPLATES) {
    const q = buildQuickQuestionnaire({
      title: tpl.title,
      objective: tpl.category,
      population: tpl.population,
      groupQuestion: tpl.groupQuestion,
      groupChoices: tpl.groupChoices,
      dimensions: tpl.dimensions,
      includeAttentionCheck: true,
    });
    assert.ok(q.questions.length >= 6);
  }
  assert.ok(CP_AND_AWARD_CROSSREF_PRESETS.length >= 5);

  const dumplingShape = inferAgentCloudShape([{ label: '正大水饺' }, { label: '预制菜' }, { label: '鸡肉丸' }]);
  assert.equal(dumplingShape.shape, 'crayfish');
  const droneShape = inferAgentCloudShape([{ label: '低空经济' }, { label: '无人机' }, { label: 'UTAUT' }]);
  assert.equal(droneShape.shape, 'brain');
  const hospitalShape = inferAgentCloudShape([{ label: '无陪护病房' }, { label: '护理满意度' }, { label: '就医' }]);
  assert.equal(hospitalShape.shape, 'heart');
  const droneMask = synthesizeSemanticCloudMask('低空无人机外卖配送');
  assert.equal(droneMask.bits.length, droneMask.width * droneMask.height);
  assert.ok(droneMask.bits.includes('1'));
  const pawMask = synthesizeSemanticCloudMask('宠物拟人化智能穿戴消费');
  assert.equal(pawMask.bits.length, pawMask.width * pawMask.height);
  assert.ok(pawMask.bits.includes('1'));

  const cpDecomp = decomposeTopic('正大水饺 Z 世代预制菜购买偏好研究');
  assert.equal(cpDecomp.domainLabel, '快消食饮与正大企业命题');
  const uavDecomp = decomposeTopic('低空经济无人机即时配送接受度调查');
  assert.equal(uavDecomp.domainLabel, '低空经济与智慧智能终端');
  const moodDecomp = decomposeTopic('青年谷子经济与情绪消费复购转化机制');
  assert.equal(moodDecomp.domainLabel, '情绪圈层与新消费模式');
  const wardDecomp = decomposeTopic('西安市三甲医院无陪护病房试点满意度研究');
  assert.equal(wardDecomp.domainLabel, '公共卫生与医疗试点服务');
});

test('Zhengda empirical anatomy covers 26 sections safely, embeds plan.measures roadmap, and exposes 5 diagram presets', async () => {
  assert.equal(CORPUS_RESERVE_SUMMARY.totalReports, 204);
  assert.equal(CORPUS_RESERVE_SUMMARY.totalPages, 18234);
  assert.equal(EMPIRICAL_MODEL_STATS.length, 12);
  assert.equal(VISUAL_EXHIBIT_STATS.length, 10);
  assert.equal(CANONICAL_THREE_LINE_TABLES.length, 8);
  assert.equal(TITLE_RHETORIC_PATTERNS.length, 4);
  assert.equal(
    ARCHIVE_YEAR_DISTRIBUTION.reduce((acc, y) => acc + y.count, 0),
    CORPUS_RESERVE_SUMMARY.totalReports,
  );
  assert.equal(JSON.stringify(SECTION_RHETORICAL_BLUEPRINTS).includes('C:\\Users'), false);

  // Every diagram preset including ipa-kano and action-loop layouts cleanly
  assert.ok(DIAGRAM_PRESETS.length >= 5);
  for (const p of ['ipa-kano', 'action-loop']) {
    const found = DIAGRAM_PRESETS.find(item => item.id === p);
    assert.ok(found, `Missing diagram preset ${p}`);
    const snap = await buildDiagramResultSnapshot({ id: `test-${p}`, title: found.name, spec: found.spec });
    assert.match(assertTrueVector(diagramSnapshotSVG(snap, figureInk(createEditorContent()))), /^<svg\s/);
  }

  // All 26 automated section nodes have blueprints whose opening sentences pass numeric/quantity gating cleanly
  const allNodes = [...WAVE_1_SECTION_NODES, ...WAVE_2_SYNTHESIS_NODES];
  assert.equal(allNodes.length, 26);
  const mockTokens = {
    facts: [],
    exhibits: [{ id: 'G1', text: '测试图表', value: '[[图:res-1]]' }],
    references: [{ id: 'R1', text: '参考文献1', value: '[1]' }],
  };
  for (const nodeId of allNodes) {
    const bp = getSectionRhetoricalBlueprint(nodeId);
    assert.ok(bp, `Missing rhetorical blueprint for ${nodeId}`);
    const cleanedOpening = sanitizeModelParagraph(bp.openingMove);
    const hydrated = parseAndHydrateSectionDraft(
      JSON.stringify({ paragraphs: [{ text: cleanedOpening }] }),
      mockTokens,
      { methods: ['alpha', 'validity', 'crosstab', 'regression', 'ipa', 'cluster'], planSection: true },
    );
    assert.equal(hydrated.paragraphs.length, 1, `Opening move rejected for ${nodeId}: ${hydrated.dropReasons.join(',')}`);
  }

  // Demo pack embeds third diagram snapshot (action roadmap) into plan.measures & injects blueprint into LLM prompt
  const pack = await buildDemoPack('老年居家社区助餐服务质量提升路径研究');
  const results = pack.report.quality.results;
  const actionResult = results.find(r => r.id.startsWith('demo-action-roadmap-'));
  assert.ok(actionResult, 'demo pack registers demo-action-roadmap diagram');
  const measuresSec = pack.report.report.find(s => /措施/.test(s.title) && s.blocks?.some(b => b.evidenceId === actionResult.id));
  assert.ok(measuresSec, 'action roadmap placed in plan.measures section');

  const contract = buildSkillPackContract(pack, decomposeTopic('老年居家社区助餐服务质量提升路径研究'), 'demonstration');
  const held = { results, findings: pack.report.quality.findings ?? [], pending: false, placed: results.map(r => r.id) };
  const prompt = buildFullReportSectionPrompt({
    nodeId: 'plan.measures',
    content: pack.report,
    design: pack.design,
    held,
    contract,
    tokens: buildSectionTokens(held, pack.report, 'plan.measures', pack.design),
  });
  assert.match(prompt, /本节国奖论证骨架与学术修辞引导/);
  assert.match(prompt, /痛点锚定/);
  assert.match(prompt, /去 AI 味学术行文红线/);
});

test('Top-10 De-AI skills and qualitative interview corpus clean AI cliches and wire Appendix 4', async () => {
  assert.equal(TOP10_DEAI_SKILLS.length, 10);

  const clicheSample =
    '在当今时代，随着数字经济与社区服务的不断发展，本研究致力于深度赋能基层治理并形成闭环。值得注意的是，综上所述，该机制毫无疑问具有重要意义，不仅提升了体验，而且产生了积极影响。';
  const before = detectAiFlavor(clicheSample);
  assert.ok(before.score >= 40, `expected high AI flavor score, got ${before.score}`);
  assert.ok(before.hits.length >= 4, 'detects multiple AI cliches');

  const academicCleaned = humanizeTextWithSkills(clicheSample, 'academic_clean');
  assert.ok(academicCleaned.afterScore < academicCleaned.beforeScore, 'academic clean reduces AI score');
  assert.ok(academicCleaned.appliedSkills.length >= 3);

  const spokenCleaned = humanizeTextWithSkills(clicheSample, 'colloquial_interview');
  assert.ok(spokenCleaned.afterScore < spokenCleaned.beforeScore, 'colloquial mode reduces AI score');

  const promptRules = buildDeAiPromptRules('academic_clean');
  assert.equal(/\d/.test(promptRules), false, 'academic de-AI prompt rules must contain zero Arabic digits');

  const corpus = generateInterviewCorpus({
    topic: '城市社区老年助餐服务满意度与供给优化研究',
    population: '社区高龄老人与助餐点运营者',
    dimensions: ['餐食适口性', '配送时效', '价格透明度', '邻里社交互动'],
    groupChoices: ['每日订餐群体', '偶尔试吃观望群体'],
  });
  assert.equal(corpus.guide.length, 5);
  assert.equal(corpus.transcripts.length, 4);
  assert.equal(corpus.codingMatrix.length, 3);
  assert.match(corpus.disclaimer, /教学模拟访谈语料/);
  for (const transcript of corpus.transcripts) {
    assert.ok(
      transcript.aiFlavorScore <= 15,
      `interview transcript ${transcript.id} should stay low-AI, got ${transcript.aiFlavorScore}`,
    );
  }

  const pack = await buildDemoPack('老年居家社区助餐服务质量提升路径研究');
  const app4 = pack.report.report.find(sec => sec.id === 's-appendix-4');
  assert.ok(app4, 'demo pack embeds s-appendix-4 interview corpus appendix');
  assert.match(app4.body, /三级编码/);
});

test('report-driven AI image engine synthesizes real-data prompts and places true-vector descriptive infographics', async () => {
  assert.ok(IMAGE_GEN_MODELS.some(m => m.id === 'gemini-nano-banana-2.1'));
  assert.equal(REPORT_IMAGE_TASKS.length, 4);

  const pack = await buildDemoPack('老年居家社区助餐服务质量提升路径研究');
  const panels = extractDescriptivePanelsFromReport(pack.report);
  assert.ok(panels.sampleN > 0, 'extracts positive sample N from frozen report');
  assert.ok(panels.resultCount > 0, 'extracts frozen analysis snapshot count');

  const prompt = buildReportDrivenImagePrompt(pack.report, 'descriptive_infographic');
  assert.match(prompt, /瑞士 Bento/);

  const snap = await buildInfographicResultSnapshot({
    content: pack.report,
    prompt,
  });
  assert.equal(snap.method, 'infographic');

  const svg = assertTrueVector(diagramSnapshotSVG(snap, figureInk(pack.report)));
  assert.match(svg, /^<svg\s/);

  const appended = appendRegisteredResult(pack.report, { result: snap });
  assert.ok(appended.quality?.results?.some(r => r.id === snap.id), 'registers infographic snapshot');

  const placed = placeResult(appended, snap.id);
  const targetSec = placed.content.report.find(s => s.id === placed.sectionId);
  assert.ok(
    targetSec && targetSec.blocks?.some(b => b.evidenceId === snap.id),
    'places infographic exhibit block into target report section',
  );

  assert.doesNotMatch(snap.title, /为「|创作科研级/);
  assert.equal(cleanInfographicTitle('为「老年居家社区助餐服务质量」创作科研级数据信息图。\n版式：瑞士 Bento', '老年居家社区助餐服务质量'), '老年居家社区助餐服务质量核心描述性统计复合信息图');
  assert.equal(cleanInfographicTitle('受访者消费特征速览', '老年居家社区助餐服务质量'), '受访者消费特征速览');
});
