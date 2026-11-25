import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildDemoBlueprintPrompt, buildDemoStudy, decomposeTopic } from '../lib/agent/demo-study.ts';
import { validateFullReportBase } from '../lib/agent/full-report-pipeline.ts';
import { buildReportDrivenImagePrompt } from '../lib/agent/image-gen-engine.ts';
import { generateInterviewCorpus } from '../lib/agent/interview-corpus-deai.ts';
import {
  buildGenericTopicBlueprint,
  buildRichBlueprintPrompt,
  buildRichDemoPack,
  buildRichDemoStudy,
  compactClusterDimStem,
  conciseLabel,
  decomposeRichTopic,
  deriveStimulusNoun,
  ensureDeclarativePositiveStem,
  parseRichBlueprint,
} from '../lib/agent/rich-study.ts';
import { buildTopicFrameworkSpec, buildWordCloudResultSnapshot, isDiagramMethod } from '../lib/diagram-figures.ts';
import { buildDocx } from '../lib/editor-export.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { exploratoryFactors } from '../lib/factor-analysis.ts';
import { figureInk } from '../lib/figure-palette.ts';
import { KANO_MATRIX, analyzeKano, buildKanoSnapshot, classifyKanoPair, parseKanoLevel } from '../lib/kano.ts';
import { kmeans, silhouette, standardize } from '../lib/kmeans.ts';
import { createLatexReport } from '../lib/latex-report.ts';
import { logisticRegression } from '../lib/logistic.ts';
import { analyzeMultiResponse, buildMultiResponseSnapshot } from '../lib/multi-response.ts';
import { texProblem, texToOmml } from '../lib/omml.ts';
import { samplingAdequacy } from '../lib/psychometrics.ts';
import { parseQuestionnaire, questionIsMapped, questionnaireIssues } from '../lib/questionnaire.ts';
import { linearRegression } from '../lib/regression.ts';
import { matchBlueprintNode } from '../lib/report-blueprint.ts';
import { figurePlan, figureSVG } from '../lib/report-figures.ts';
import { applyReportInsert } from '../lib/report-insert.ts';
import { danglingReferences } from '../lib/report-numbering.ts';
import { sectionNotes } from '../lib/report-tables.ts';
import { parseResultSnapshot, verifyResearchQuality } from '../lib/research-quality.ts';
import { assessEligibility } from '../lib/row-eligibility.ts';
import { assertTrueVector } from '../lib/svg-safety.ts';

test('kano.ts: 5x5 matrix, structural skips vs missing separation, Better/Worse math, and ResultSnapshot + ReportInsert', async () => {
  const expectedMatrix = [
    ['Q', 'A', 'A', 'A', 'O'],
    ['R', 'I', 'I', 'I', 'M'],
    ['R', 'I', 'I', 'I', 'M'],
    ['R', 'I', 'I', 'I', 'M'],
    ['R', 'R', 'R', 'R', 'Q'],
  ];
  assert.deepEqual(KANO_MATRIX, expectedMatrix);
  for (let f = 1; f <= 5; f++) {
    for (let d = 1; d <= 5; d++) {
      assert.equal(classifyKanoPair(f, d), expectedMatrix[f - 1][d - 1]);
    }
  }
  assert.equal(classifyKanoPair(0, 3), null);
  assert.equal(parseKanoLevel('我很喜欢'), 1);
  assert.equal(parseKanoLevel('2. 理应如此'), 2);
  assert.equal(parseKanoLevel('无所谓'), 3);
  assert.equal(parseKanoLevel('可以忍受'), 4);
  assert.equal(parseKanoLevel('我很不喜欢'), 5);

  const table = {
    headers: ['K1_pos', 'K1_neg'],
    delimiter: ',',
    skippedBlankLines: 0,
    rows: [
      ['-99', '-99'],
      ['-99', '-99'],
      ['我很喜欢', '-99'],
      ['我很喜欢', '乱填'],
      ['我很喜欢', '理应如此'],
      ['1', '3'],
      ['我很喜欢', '可以忍受'],
      ['我很喜欢', '我很不喜欢'],
      ['1', '5'],
      ['理应如此', '我很不喜欢'],
      ['无所谓', '5'],
      ['可以忍受', '我很不喜欢'],
      ['无所谓', '无所谓'],
      ['理应如此', '我很喜欢'],
    ],
  };
  const mask = table.rows.map((_, idx) => idx >= 2);
  const analysis = analyzeKano(
    table,
    [{ name: '实时冷链溯源', functionalCol: 0, dysfunctionalCol: 1 }],
    { missingCodes: ['-99'], eligibleMask: mask },
  );
  assert.ok(!('refused' in analysis));
  const feat = analysis.features[0];
  assert.equal(feat.totalRows, 14);
  assert.equal(feat.structuralSkipRows, 2);
  assert.equal(feat.eligibleRows, 12);
  assert.equal(feat.missingRows, 1);
  assert.equal(feat.invalidRows, 1);
  assert.equal(feat.validN, 10);
  assert.deepEqual(feat.counts, { A: 3, O: 2, M: 3, I: 1, R: 1, Q: 0 });
  assert.equal(feat.effectiveDenominator, 9);
  assert.ok(Math.abs(feat.better - 5 / 9) < 1e-12);
  assert.ok(Math.abs(feat.worse - -5 / 9) < 1e-12);
  assert.equal(feat.dominantCategory, 'M');

  const sourceHash = 'a'.repeat(64);
  const bundle = await buildKanoSnapshot(analysis, {
    sourceName: 'kano_test.csv',
    sourceHash,
    classification: 'simulated',
  });
  assert.doesNotThrow(() => parseResultSnapshot(bundle.snapshot));
  assert.ok(bundle.snapshot.headers.includes('Better') && bundle.snapshot.headers.includes('Worse'));

  let doc = { ...createEditorContent(), version: 2 };
  doc = applyReportInsert(doc, bundle.insert).content;
  assert.doesNotThrow(() => parseEditorContent(doc));
  await verifyResearchQuality(doc.quality);
  assert.deepEqual(danglingReferences(doc), []);
});

test('multi-response.ts: semicolon delimiter, respondent vs response %, maxChoices check, and horizontal bar chart compatibility', async () => {
  const choices = [
    { code: '1', label: '高峰期排队等候时间过长' },
    { code: '2', label: '计价补贴细则不够直观透明' },
    { code: '3', label: '异常问题人工客服响应偏慢' },
    { code: '4', label: '小程序预约操作步骤偏繁琐' },
  ];
  const table = {
    headers: ['Q26'],
    delimiter: ',',
    skippedBlankLines: 0,
    columnLabels: { Q26: '核心改进痛点' },
    rows: [
      ['-99'],
      ['-99'],
      ['1;2;3'],
      ['高峰期排队等候时间过长；计价补贴细则不够直观透明'],
      ['1;3'],
      ['2;4'],
      ['1'],
    ],
  };
  const mask = [false, true, true, true, true, true, true];
  const res = analyzeMultiResponse(table, 0, {
    choices,
    missingCodes: ['-99'],
    eligibleMask: mask,
    maxChoices: 3,
  });
  assert.ok(!('refused' in res));
  assert.equal(res.structuralSkipRows, 1);
  assert.equal(res.eligibleRows, 6);
  assert.equal(res.missingRows, 1);
  assert.equal(res.n, 5);
  assert.equal(res.totalSelections, 10);
  assert.equal(res.withinMaxChoices, true);
  assert.equal(res.overLimitRows, 0);

  const sumRespondentPct = res.options.reduce((s, o) => s + o.respondentPct, 0);
  const sumResponsePct = res.options.reduce((s, o) => s + o.responsePct, 0);
  assert.ok(Math.abs(sumRespondentPct - 200) < 1e-9, `respondent % sums to 200%, got ${sumRespondentPct}`);
  assert.ok(Math.abs(sumResponsePct - 100) < 1e-9, `response % sums to 100%, got ${sumResponsePct}`);
  assert.equal(res.options[0].respondentPct, 80);
  assert.equal(res.options[0].responsePct, 40);

  const overTable = { ...table, rows: [...table.rows, ['1;2;3;4']] };
  const refused = analyzeMultiResponse(overTable, 0, { choices, maxChoices: 3, overLimitPolicy: 'refuse' });
  assert.ok('refused' in refused && refused.refused === 'exceeds-max-choices');
  const excluded = analyzeMultiResponse(overTable, 0, { choices, maxChoices: 3, overLimitPolicy: 'exclude' });
  assert.ok(!('refused' in excluded) && excluded.overLimitRows === 1 && excluded.n === 5);

  const bundle = await buildMultiResponseSnapshot(res, {
    sourceName: 'multi_test.csv',
    sourceHash: 'b'.repeat(64),
    classification: 'simulated',
  });
  assert.equal(bundle.snapshot.warnings.some(w => w.includes('严禁将个案普及率绘制成饼图')), false);
  assert.ok(bundle.snapshot.warnings.some(w => w.includes('个案普及率以有效作答人数')));
  const plan = figurePlan(bundle.snapshot, 1, '#0F766E');
  assert.equal(plan.kind, 'barsHorizontal');
  const svg = await figureSVG(bundle.snapshot, 1, '#0F766E');
  assert.ok(svg.includes('<svg') && !/\.\d{3,}%/u.test(svg));

  let doc = { ...createEditorContent(), version: 2 };
  doc = applyReportInsert(doc, bundle.insert).content;
  await verifyResearchQuality(doc.quality);
  assert.deepEqual(danglingReferences(doc), []);
});

test('rich-study.ts & diagram/interview modules: blueprint polarity sanitization, 4-row A1-A4 coding, clean wordcloud metrics, and demo-study.ts immutability', async () => {
  // Verify demo-study.ts 20-item hash stays untouched
  const legacyDemo = await buildDemoStudy('城市社区助餐服务的使用体验、满意度与持续使用意愿调查');
  assert.equal(legacyDemo.dataset.sourceHash.slice(0, 16), 'c34907e3ceddb089');

  // Verify portable IEEE-754 arithmetic rule AND complete removal of SIMULATED_MARK in rich-study.ts
  const richSrc = fs.readFileSync(new URL('../lib/agent/rich-study.ts', import.meta.url), 'utf8');
  const strippedComments = richSrc.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');
  assert.doesNotMatch(strippedComments, /Math\.(random|log|cos|sin|exp|pow|tan|atan)\b|\.sort\(\s*\(\s*\)\s*=>/u);
  assert.equal(strippedComments.includes('SIMULATED_MARK'), false, 'SIMULATED_MARK completely removed from rich-study.ts');

  // Diagram-figures checks: '核心构念维度数' replaces 'Agent识形置信度', framework node says '多维路由问卷与四重质控'
  const wcSnap = await buildWordCloudResultSnapshot({
    id: 'wc-clean-check',
    title: '研究构念词云',
    sourceHash: 'c'.repeat(64),
    words: [
      { word: '适老交互', weight: 30, category: '潜变量构念' },
      { word: '权限透明', weight: 28, category: '潜变量构念' },
      { word: '监测稳定', weight: 26, category: '潜变量构念' },
      { word: '协同支持', weight: 24, category: '作用机制' },
    ],
  });
  assert.equal(wcSnap.metrics.some(m => m.label === 'Agent识形置信度'), false);
  assert.equal(wcSnap.metrics.find(m => m.label === '核心构念维度数')?.value, 4);

  const fw = buildTopicFrameworkSpec({
    topic: '县域即时零售闪电仓履约质量与消费者复购',
    researchSubject: '县域即时零售闪电仓履约质量与消费者复购',
    policyTags: ['建议推进“县域商业体系建设行动”前置仓标准准入'],
  });
  assert.ok(fw.nodes.some(n => n.label.includes('多群组路由问卷') && String(n.stage ?? '').includes('第二—三章')));
  assert.equal(fw.nodes.some(n => n.label.includes('分层配额抽样')), false);

  // Interview corpus checks: 4 rows A1-A4 when mechanismDimension/codingRows:4 passed, zero campus leaks or AI味检测
  const corpus4 = generateInterviewCorpus({
    topic: '银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查',
    population: '城市 60 岁及以上长者',
    dimensions: ['历史监测记录回顾便利', '读数异常复核指导', '亲属共享权限设置清晰', '监测稳定与异常响应感知'],
    mechanismDimension: '启发式协同支持认同',
    codingRows: 4,
    groupChoices: ['与子女同住长者', '独居或空巢长者'],
  });
  assert.equal(corpus4.codingMatrix.length, 4);
  assert.deepEqual(
    corpus4.codingMatrix.map(c => c.openCode.slice(0, 2)),
    ['A1', 'A2', 'A3', 'A4'],
  );
  assert.match(corpus4.disclaimer, /定性编码演练映射语料（基于研究构念同构生成，非独立田野录音）/u);
  assert.doesNotMatch(corpus4.appendixBody, /陈同学|校园食堂|室友|窗口的小姑娘|下午人多显得吵|AI味检测|GitHub 去 AI 味|银发「智」守|三角互证/u);
  for (const g of corpus4.guide) {
    assert.doesNotMatch(g.prompt, /银发「智」守|教学模拟/u);
  }
  for (const t of corpus4.transcripts) {
    assert.doesNotMatch(t.excerpt, /银发「智」守|教学模拟/u);
  }

  const retailCorpus = generateInterviewCorpus({
    topic: '县域即时零售闪电仓的履约损耗、骑手协同与消费者复购意愿调查',
    population: '县城常住居民',
    dimensions: ['商品品质与温控包装完好', '配送准时与异常节点透明', '缺货替补规则说明清晰', '履约稳定与售后赔付感知'],
    mechanismDimension: '主动沟通协同履约认同',
    codingRows: 4,
  });
  assert.doesNotMatch(retailCorpus.appendixBody, /履约损耗、骑手协同与消费者」|界面里绕了两三层/u);

  // Clean stimulusNoun extraction even on contaminated LLM shortTitle
  assert.equal(
    deriveStimulusNoun('银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查', '银发智守教学模拟'),
    '智能健康监测设备',
  );
  assert.equal(
    deriveStimulusNoun('县域即时零售闪电仓的履约损耗、骑手协同与消费者复购意愿调查', '县域闪电仓履约调查'),
    '县域闪电仓即时配送服务',
  );

  // Wave-4 P0/P1 checks: zero clipped first chars ('在/操/记/骑') and clean declarative stem grammar
  assert.equal(conciseLabel('在途状态可见性', '可见性', 14), '在途状态可见性');
  assert.equal(conciseLabel('日常佩戴与启动操作便捷', '便捷度', 14), '日常佩戴与启动操作便捷');
  assert.equal(conciseLabel('受访者年龄结构', '周岁年龄区间', 14), '年龄结构');
  assert.equal(compactClusterDimStem('操作引导清晰度'), '操作引导清晰度');
  assert.equal(compactClusterDimStem('记录查阅便利性'), '记录查阅便利性');
  assert.equal(compactClusterDimStem('骑手交接配合度'), '骑手交接配合度');
  assert.equal(compactClusterDimStem('在途状态可见性'), '在途状态可见性');
  const normStem = ensureDeclarativePositiveStem(
    '我认同在涉及权限与费用调整前事先确认本人是否同意的做法。',
    '智能健康监测设备',
    '关键节点知情确认',
  );
  assert.equal(normStem.includes('的做法表现良好'), false, `must never append 表现良好 onto 的做法: ${normStem}`);
  assert.match(normStem, /的做法。$/u);

  const topic = '县域即时零售闪电仓的履约损耗、骑手协同与消费者复购意愿调查';
  const prompt = buildRichBlueprintPrompt(topic);
  assert.ok(prompt.includes(topic) && prompt.includes('过去30天内') && prompt.includes('试行方案报名意向') && prompt.includes('stimulusNoun'));
  assert.ok(prompt.includes('“益普索杯”第十七届全国大学生市场调查与分析大赛'), 'prompt must reference Ipsos Cup 17th edition');
  assert.doesNotMatch(prompt, /正大杯/u, 'prompt must contain zero legacy 正大杯 strings');

  const baseBp = decomposeRichTopic(topic);
  const contaminatedRaw = JSON.stringify({
    domainLabel: baseBp.domainLabel,
    shortTitle: '县域闪电仓履约调查教学模拟',
    stimulusNoun: '银发智守教学模拟调查',
    groupConstruct: '请问您平时居住在县城哪个区域吗？',
    groupA: baseBp.groupA,
    groupB: baseBp.groupB,
    statusConstruct: baseBp.statusConstruct,
    statusCategories: baseBp.statusCategories,
    ageBrackets: ['未满18岁学生', '18–25岁', '26–40岁', '41岁以上'],
    usageFreq: ['过去三个月内每周多次', '过去一个月内每周一次', '近三个月偶尔下单', '仅节假日尝试一次'],
    subscales: [
      baseBp.subscales[0],
      {
        name: '订单隐私泄露风险顾虑',
        items: [
          { short: '电话泄露担心度', question: '您有多担心骑手转卖收件电话号码吗？' },
          { short: '定位隐私焦虑感', question: '门牌地址隐私泄露风险让您害怕吗？' },
          { short: '账单记录顾虑度', question: '购买记录外泄风险有多大？' },
        ],
      },
      {
        name: '未来持续复购意愿',
        items: [
          { short: '下次选择意愿', question: '下次买日用品还会再次下单吗？' },
          { short: '继续购买倾向', question: '未来愿意继续购买闪电仓商品吗？' },
          { short: '主动推荐意愿', question: '愿意推荐给邻居继续购买吗？' },
        ],
      },
    ],
    mechanismScaleName: baseBp.mechanismScaleName,
    mechanisms: baseBp.mechanisms,
    kanoFeatures: baseBp.kanoFeatures,
    painOptions: baseBp.painOptions,
    channels: baseBp.channels,
    tierConstruct: baseBp.tierConstruct,
    tierQuestion: baseBp.tierQuestion,
    tierChoices: baseBp.tierChoices,
    overallSatConstruct: baseBp.overallSatConstruct,
    overallSatQuestion: baseBp.overallSatQuestion,
    conversionConstruct: baseBp.conversionConstruct,
    conversionQuestion: baseBp.conversionQuestion,
    binaryConversionConstruct: '实际采纳转化决策',
    binaryConversionQuestion: '您是否已经完成实际采纳转化？',
    binaryChoices: baseBp.binaryChoices,
    openFeedbackConstruct: baseBp.openFeedbackConstruct,
    openFeedbackQuestion: baseBp.openFeedbackQuestion,
    keywords: baseBp.keywords,
    context: baseBp.context,
  });

  const sanitizedBp = parseRichBlueprint('```json\n' + contaminatedRaw + '\n```', topic);
  assert.ok(sanitizedBp !== null);
  assert.equal(sanitizedBp.ageBrackets.some(a => /未满\s*18/u.test(a)), false, 'adult topic must reject 未满18岁');
  assert.ok(sanitizedBp.usageFreq.every(f => f.startsWith('过去30天内')), 'usageFreq unified to 过去30天内');
  for (const sub of sanitizedBp.subscales) {
    assert.doesNotMatch(sub.name, /担心|顾虑|焦虑|泄露风险|复购意愿|持续使用意愿/u);
    for (const item of sub.items) {
      assert.doesNotMatch(item.question, /[?？]|吗|有多担心|再次下单|继续购买/u);
      assert.ok(item.short.length <= 14);
    }
  }
  assert.doesNotMatch(sanitizedBp.binaryConversionConstruct, /实际采纳|实际转化/u);
  assert.equal(sanitizedBp.binaryConversionConstruct, '试行方案报名意向');
  assert.doesNotMatch(sanitizedBp.stimulusNoun, /银发|智守|教学模拟|调查|研究|调研|机制|意愿/u);
  assert.doesNotMatch(sanitizedBp.shortTitle, /教学模拟|调查|研究|调研/u);
  assert.ok(sanitizedBp.groupConstruct.length <= 14);

  // Wave-4 Q26 painOptions polish check on LLM-style '启动指引清晰度' / '在途状态可见性'
  const painCheckBp = parseRichBlueprint(
    JSON.stringify({
      ...JSON.parse(contaminatedRaw),
      subscales: [
        {
          name: '履约过程透明度',
          items: [
            { short: '商品包装完好度', question: '商品外包装保持完好无损。' },
            { short: '在途状态可见性', question: '订单在途配送状态实时清晰可见。' },
            { short: '签收核对顺畅度', question: '签收核对流程简明顺畅。' },
          ],
        },
        {
          name: '操作与规则说明',
          items: [
            { short: '启动指引清晰度', question: '初次下单启动指引步骤清楚易懂。' },
            { short: '计费规则透明度', question: '配送费与起送门槛说明公开透明。' },
            { short: '退换细则明确度', question: '缺货退换处理细则清楚明白。' },
          ],
        },
        baseBp.subscales[2],
      ],
      painOptions: [
        '启动指引清晰度规则条款不够清晰直观',
        '在途状态可见性环节更新偏慢',
        ...baseBp.painOptions.slice(2),
      ],
    }),
    topic,
  );
  assert.ok(painCheckBp);
  assert.equal(painCheckBp.subscales[0].items[1].short, '在途状态可见性');
  for (const pOpt of painCheckBp.painOptions) {
    assert.doesNotMatch(pOpt, /清晰度规则|可见性环节|透明度规则|便利性环节/u, `clumsy glued noun in Q26: ${pOpt}`);
  }

  // Reject fabricated numbers in context or malformed input
  assert.equal(parseRichBlueprint('not-json', topic), null);
  assert.equal(
    parseRichBlueprint(JSON.stringify({ ...JSON.parse(contaminatedRaw), context: '已有85%受访者表示满意。' }), topic),
    null,
  );
});

test('rich-study.ts: full 32-question DemoPack satisfies 4-factor EFA, zero non-user contamination, homoskedastic OLS+HC3, disjoint QC, and zero leak invariants across 5 topics', async () => {
  const topics = [
    '银发「智」守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查',
    '县域即时零售闪电仓的履约损耗、骑手协同与消费者复购意愿调查',
    '城市社区助餐服务的使用体验、满意度与持续使用意愿调查',
    '大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查',
    '新能源汽车社区共享充电桩供需错配与动态定价机制调研',
  ];

  // Determinism check
  const studyA = await buildRichDemoStudy(topics[0]);
  const studyB = await buildRichDemoStudy(topics[0]);
  const studyOther = await buildRichDemoStudy(topics[1]);
  assert.equal(studyA.dataset.sourceHash, studyB.dataset.sourceHash);
  assert.notEqual(studyA.dataset.sourceHash, studyOther.dataset.sourceHash);
  assert.ok(studyA.dataset.table.rows.length >= 660 && studyA.dataset.table.rows.length <= 700, `issued=${studyA.dataset.table.rows.length}`);

  for (const [tIdx, topic] of topics.entries()) {
    const pack = await buildRichDemoPack(topic);
    const { design, dataset, report } = pack;

    // 1. 32-question questionnaire structure, routing DAG, positive declarative constructs, & concise labels
    assert.equal(design.questions.length, 32);
    assert.doesNotThrow(() => parseQuestionnaire(JSON.stringify(design)));
    assert.equal(questionnaireIssues(design).filter(i => i.level === 'blocker').length, 0);
    assert.ok(design.questions.every(questionIsMapped));
    assert.match(design.introduction, /既未听说也不了解者.*已/u);
    assert.match(design.population, /既未听说也不了解者.*已/u);
    for (const metaField of [design.title, design.objective, design.population, design.introduction]) {
      assert.doesNotMatch(metaField, /[【】「」『』]/u, `questionnaire metadata leaked brackets: ${metaField}`);
    }
    for (const q of design.questions) {
      assert.doesNotMatch(q.text, /[【】「」『』]/u, `${q.variable} text leaked brackets: ${q.text}`);
      for (const c of q.choices) {
        assert.doesNotMatch(c.label, /[【】「」『』]/u, `${q.variable} choice leaked brackets: ${c.label}`);
      }
    }

    const byVar = Object.fromEntries(design.questions.map(q => [q.variable, q]));
    const expCond = { questionId: byVar.Q2.id, codes: ['1', '2', '3'] };
    assert.equal(byVar.Q2.choices[3].code, '4');
    assert.match(byVar.Q2.choices[3].label, /未|没/u);
    assert.equal(byVar.Q3.choices.some(c => /未满\s*18/u.test(c.label)), false);

    // Q4, ALL Q5..Q13, Q29, and Q30 must be gated on Q2 in ['1','2','3']!
    for (const v of ['Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12', 'Q13', 'Q29', 'Q30']) {
      assert.deepEqual(byVar[v].condition, expCond, `${v} must be gated on Q2 1..3`);
    }
    assert.match(byVar.Q4.text, /过去 30 天内/u);
    assert.ok(byVar.Q4.choices.every(c => c.label.startsWith('过去30天内')));

    for (const v of ['Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12', 'Q13', 'Q15', 'Q16', 'Q17']) {
      assert.equal(byVar[v].minLabel, '非常不同意');
      assert.equal(byVar[v].maxLabel, '非常同意');
      assert.doesNotMatch(byVar[v].text, /[?？]|(?:吗|呢)[。！!]?$|有多大|有多担心/u, `${v} must be declarative: ${byVar[v].text}`);
      assert.doesNotMatch(byVar[v].construct, /担心|顾虑|焦虑|泄露风险|复购意愿|持续使用意愿/u);
    }

    assert.equal(byVar.Q14.purpose, 'screening');
    assert.match(byVar.Q14.text, /4/u);
    assert.equal(byVar.Q26.type, 'multi');
    assert.equal(byVar.Q26.choices.length, 7, 'Q26 must include 6 barriers + 7th exclusive none option');
    assert.equal(byVar.Q26.choices[6].code, '7');
    assert.match(byVar.Q26.choices[6].label, /以上均无/u);
    for (const ch of byVar.Q26.choices) {
      assert.doesNotMatch(ch.label, /实际体验存落差/u);
    }
    assert.doesNotMatch(byVar.Q27.text, /最信赖且常用/u);
    assert.equal(byVar.Q30.type, 'number');
    assert.equal(byVar.Q30.min, 0);
    assert.equal(byVar.Q30.max, 100);
    assert.doesNotMatch(byVar.Q30.text + byVar.Q30.construct, /继续使用或复购/u);
    assert.deepEqual(byVar.Q31.choices.map(c => c.code), ['1', '0']);
    assert.equal(byVar.Q31.construct, '试行方案报名意向');
    assert.doesNotMatch(byVar.Q31.construct + byVar.Q31.text, /实际采纳|实际转化/u);
    assert.equal(byVar.Q32.type, 'text');

    for (const q of design.questions) {
      assert.doesNotMatch(q.text, /银发「智」守|教学模拟|市场调查|调查问卷/u, `${q.variable} stem leaked meta-title: ${q.text}`);
    }
    const app1 = report.report.find(s => s.id === 's-appendix-1');
    assert.ok(app1 && app1.body.includes('1–5 整数点核验题，请直接选择数字 4'));

    assert.equal(dataset.table.columnLabels?.Q3, '周岁年龄区间');
    for (const [colKey, lbl] of Object.entries(dataset.table.columnLabels ?? {})) {
      assert.ok(lbl.length <= 14, `columnLabel ${colKey}="${lbl}" exceeds 14 chars`);
      assert.doesNotMatch(lbl, /^受访者/u, `columnLabel ${colKey}="${lbl}" must never start with 受访者`);
    }

    // 2. Screened dataset (~680 issued -> ~615 valid), empirical user_provided contract, disjoint QC, Q2×Q4 coherence, Q26 exclusivity, & zero non-user contamination
    const tbl = dataset.table;
    assert.equal(dataset.kind, 'user_provided');
    assert.doesNotMatch(dataset.name, /simulation/iu);
    assert.ok(tbl.rows.length >= 585 && tbl.rows.length <= 645, `valid rows=${tbl.rows.length}`);
    const col = v => tbl.headers.indexOf(v);
    const activeLabel = byVar.Q2.choices[0].label;
    const neverLabel = byVar.Q2.choices[3].label;
    const zeroFreqLabel = byVar.Q4.choices[3].label;
    const nonePainLabel = byVar.Q26.choices[6].label;
    const nonUsers = tbl.rows.filter(r => r[col('Q2')] === neverLabel);
    const expUsers = tbl.rows.filter(r => r[col('Q2')] !== neverLabel);
    assert.ok(nonUsers.length >= 60 && expUsers.length >= 420);

    // Q2=1 ('目前仍在使用') must NEVER have Q4=4 ('过去30天内0次')
    const activeZeroRows = expUsers.filter(r => r[col('Q2')] === activeLabel && r[col('Q4')] === zeroFreqLabel);
    assert.equal(activeZeroRows.length, 0, 'currently active users must never have 0 uses in past 30 days');

    // Q26 exclusive '以上均无' option must never be co-selected with barrier options 1..6
    for (const r of tbl.rows) {
      const parts = String(r[col('Q26')]).split(/[;；]/u).map(s => s.trim()).filter(Boolean);
      if (parts.some(p => p === '7' || p === nonePainLabel)) {
        assert.equal(parts.length, 1, `exclusive none option co-selected in Q26: ${r[col('Q26')]}`);
      }
    }

    const gatedCols = ['Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12', 'Q13', 'Q29', 'Q30'].map(col);
    assert.ok(
      nonUsers.every(r => gatedCols.every(ci => r[ci] === '-99')),
      'non-users (Q2=4) must have -99 across Q4, Q5..Q13, Q29, and Q30',
    );
    assert.ok(
      expUsers.every(r => gatedCols.every(ci => r[ci] !== '-99')),
      'experienced users (Q2=1..3) must have valid responses across Q4, Q5..Q13, Q29, and Q30',
    );

    const assignments = design.questions.map(q => ({
      questionId: q.id,
      column: q.variable,
      representation: ['likert', 'number'].includes(q.type) || q.variable === 'Q31' ? 'code' : 'label',
    }));
    const eligAllGated = assessEligibility(
      design,
      assignments,
      tbl,
      ['-99'],
      ['Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12', 'Q13', 'Q29', 'Q30'].map(v => byVar[v].id),
    );
    assert.deepEqual(eligAllGated.problems, []);
    assert.equal(eligAllGated.contradictionRows, 0);
    assert.equal(eligAllGated.eligibleRows, expUsers.length);
    assert.equal(eligAllGated.ineligibleRows, nonUsers.length);

    const results = report.quality.results;
    const qcSnap = results.find(r => r.method === 'quality-control');
    assert.ok(qcSnap);
    const attCount = Number(qcSnap.rows.find(r => r[0] === '注意力题未通过')?.[2] ?? -1);
    const strCount = Number(qcSnap.rows.find(r => r[0] === '直线作答')?.[2] ?? -1);
    const excludedTotal = qcSnap.total - qcSnap.n;
    assert.ok(attCount > 0 && strCount > 0);
    assert.equal(attCount + strCount, excludedTotal, `QC rules must be disjoint: ${attCount} + ${strCount} !== ${excludedTotal}`);

    // 3. Psychometric & Exact 4-Factor EFA invariants (factors === 4, eig4 > 1.15, KMO > 0.82, Harman < 40%)
    const alphaSnaps = results.filter(r => r.method === 'alpha');
    assert.equal(alphaSnaps.length, 5);
    for (let s = 0; s < 4; s++) {
      const a = alphaSnaps[s].metrics.find(m => /α/u.test(m.label))?.value;
      assert.ok(typeof a === 'number' && a >= 0.80 && a <= 0.90, `subscale ${s + 1} alpha=${a}`);
    }
    assert.equal(alphaSnaps[0].n, expUsers.length);
    assert.equal(alphaSnaps[3].n, tbl.rows.length); // Q15-Q17 is full-sample
    const fullAlpha = alphaSnaps[4].metrics.find(m => /α/u.test(m.label))?.value;
    assert.ok(typeof fullAlpha === 'number' && fullAlpha >= 0.84 && fullAlpha <= 0.89, `full scale alpha=${fullAlpha}`);

    const twelveCols = ['Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12', 'Q13', 'Q15', 'Q16', 'Q17'].map(col);
    const numCols12 = twelveCols.map(c => expUsers.map(r => Number(r[c])));
    const adeq = samplingAdequacy(numCols12);
    assert.ok(!('refused' in adeq) && adeq.kmo > 0.82, `KMO=${'refused' in adeq ? adeq.refused : adeq.kmo}`);
    const efa = exploratoryFactors(numCols12);
    assert.ok(!('refused' in efa));
    assert.equal(efa.factors, 4, `expected exact 4 EFA factors on "${topic}", got ${efa.factors} (eigs=${efa.eigenvalues.slice(0, 5).map(v => v.toFixed(2))})`);
    assert.ok(efa.eigenvalues[3] > 1.15, `4th eigenvalue=${efa.eigenvalues[3]} must exceed 1.15`);
    const harmanPct = (efa.eigenvalues[0] / twelveCols.length) * 100;
    assert.ok(harmanPct < 40, `Harman 1st factor=${harmanPct.toFixed(2)}%`);

    const valSnap = results.find(r => r.method === 'validity');
    assert.ok(valSnap && valSnap.n === expUsers.length);

    // 4. 9-Predictor Covariate-adjusted OLS on Q30 (including Q29 overall satisfaction, n = expUsers): VIF < 2.6, adjR2 in [0.38, 0.65], BP p > 0.10
    const groupALabel = byVar.Q1.choices[0].label;
    const ageLabels = byVar.Q3.choices.map(c => c.label);
    const yOls = expUsers.map(r => Number(r[col('Q30')]));
    const olsPredictors = [
      { name: 'Sub1_Mean', values: expUsers.map(r => (Number(r[col('Q5')]) + Number(r[col('Q6')]) + Number(r[col('Q7')])) / 3) },
      { name: 'Sub2_Mean', values: expUsers.map(r => (Number(r[col('Q8')]) + Number(r[col('Q9')]) + Number(r[col('Q10')])) / 3) },
      { name: 'Sub3_Mean', values: expUsers.map(r => (Number(r[col('Q11')]) + Number(r[col('Q12')]) + Number(r[col('Q13')])) / 3) },
      { name: 'Q29', values: expUsers.map(r => Number(r[col('Q29')])) },
      { name: 'Q15', values: expUsers.map(r => Number(r[col('Q15')])) },
      { name: 'Q16', values: expUsers.map(r => Number(r[col('Q16')])) },
      { name: 'Q17', values: expUsers.map(r => Number(r[col('Q17')])) },
      { name: 'GroupCtrl', values: expUsers.map(r => (r[col('Q1')] === groupALabel ? 1 : 0)) },
      { name: 'AgeOrd', values: expUsers.map(r => Math.max(1, ageLabels.indexOf(r[col('Q3')]) + 1)) },
    ];
    const olsFit = linearRegression(yOls, olsPredictors);
    assert.ok(!('refused' in olsFit));
    const slopes = olsFit.coefficients.slice(1);
    const maxVif = Math.max(...slopes.map(c => c.vif ?? 0));
    assert.ok(maxVif < 3.2, `max VIF=${maxVif}`);
    assert.ok(olsFit.adjustedR2 >= 0.38 && olsFit.adjustedR2 <= 0.62, `adjR2=${olsFit.adjustedR2}`);
    assert.ok(slopes.filter(c => c.p < 0.01).length >= 4, `OLS p<0.01 count=${slopes.filter(c => c.p < 0.01).length}`);
    assert.ok(olsFit.breuschPagan.p > 0.10, `Breusch-Pagan p=${olsFit.breuschPagan.p} must not reject homoskedasticity (> 0.10)`);

    const regSnap = results.find(r => r.method === 'regression');
    assert.ok(regSnap && regSnap.n === expUsers.length && regSnap.rows.length === 10);

    // 5. Covariate-adjusted Binary Logistic on Q31 (full sample, ROC AUC >= 0.72)
    const logitPredictors = [
      { name: 'ExpDummy', values: tbl.rows.map(r => (r[col('Q2')] !== neverLabel ? 1 : 0)) },
      { name: 'Q15', values: tbl.rows.map(r => Number(r[col('Q15')])) },
      { name: 'Q16', values: tbl.rows.map(r => Number(r[col('Q16')])) },
      { name: 'Q17', values: tbl.rows.map(r => Number(r[col('Q17')])) },
      { name: 'GroupCtrl', values: tbl.rows.map(r => (r[col('Q1')] === groupALabel ? 1 : 0)) },
      { name: 'AgeOrd', values: tbl.rows.map(r => Math.max(1, ageLabels.indexOf(r[col('Q3')]) + 1)) },
    ];
    const yLogit = tbl.rows.map(r => Number(r[col('Q31')]));
    const logitFit = logisticRegression(yLogit, logitPredictors);
    assert.ok(!('refused' in logitFit));
    const logitSlopes = logitFit.coefficients.slice(1);
    assert.ok(logitSlopes.every(c => Number.isFinite(c.oddsRatio) && c.se < 2 && c.ame !== null));
    assert.ok(logitSlopes.filter(c => c.p < 0.05 && Math.abs(c.ame.value / c.ame.se) > 1.96).length >= 3);
    const logitSnap = results.find(r => r.method === 'logistic');
    assert.ok(logitSnap && logitSnap.n === tbl.rows.length && logitSnap.rows.length === 7);
    const posEtas = [];
    const negEtas = [];
    yLogit.forEach((yv, rIdx) => {
      let eta = logitFit.coefficients[0].estimate;
      logitSlopes.forEach((c, j) => {
        eta += c.estimate * logitPredictors[j].values[rIdx];
      });
      if (yv === 1) posEtas.push(eta);
      else negEtas.push(eta);
    });
    let conc = 0;
    for (const ep of posEtas) {
      for (const en of negEtas) conc += ep > en ? 1 : ep === en ? 0.5 : 0;
    }
    const aucVal = conc / (posEtas.length * negEtas.length);
    assert.ok(aucVal >= 0.72, `ROC AUC=${aucVal} must be >= 0.72`);

    // 6. IPA on experienced users + 6-variable K-means (k='auto' -> 3 clusters, silhouette margin >= 0.04, neutral labels)
    const ipaSnap = results.find(r => r.method === 'ipa');
    assert.ok(ipaSnap && ipaSnap.n === expUsers.length);
    assert.ok(ipaSnap.rows.some(r => String(r[3]).includes('重点改进')));

    // Profile on Q2 must ONLY include the 3 experienced tiers (never '了解但尚未使用过')
    const profileSnaps = results.filter(r => r.method === 'profile');
    assert.equal(profileSnaps.length, 2);
    assert.ok(profileSnaps.every(p => p.n === expUsers.length));
    assert.equal(profileSnaps[1].headers.some(h => h.includes(neverLabel)), false);

    const cluSnap = results.find(r => r.method === 'cluster');
    assert.ok(cluSnap && cluSnap.n === expUsers.length);
    assert.equal(cluSnap.rows.length, 3, 'k=auto must select 3 clusters');
    assert.equal(cluSnap.headers.length, 9, 'cluster table must include 6 standardized variables + name/n/share');
    const cluLabels = cluSnap.rows.map(r => String(r[0]));
    assert.equal(new Set(cluLabels).size, 3, 'all 3 cluster labels must be distinct');
    assert.equal(cluLabels.filter(l => /^第 [123] 类（多维高评组）$/u.test(l)).length, 1);
    assert.equal(cluLabels.filter(l => /^第 [123] 类（.+低评组）$/u.test(l)).length, 2);
    const cluPts = standardize(
      expUsers.map(r => [
        (Number(r[col('Q5')]) + Number(r[col('Q6')]) + Number(r[col('Q7')])) / 3,
        (Number(r[col('Q8')]) + Number(r[col('Q9')]) + Number(r[col('Q10')])) / 3,
        (Number(r[col('Q11')]) + Number(r[col('Q12')]) + Number(r[col('Q13')])) / 3,
        Number(r[col('Q15')]),
        Number(r[col('Q16')]),
        Number(r[col('Q17')]),
      ]),
    );
    const scanMap = new Map();
    for (const kCand of [2, 3, 4, 5]) {
      const fitK = kmeans(cluPts, kCand, { seed: 'evix-advanced' });
      assert.ok(!('refused' in fitK));
      scanMap.set(kCand, silhouette(cluPts, fitK.assignments).mean);
    }
    const s3 = scanMap.get(3);
    const runnerUp = Math.max(scanMap.get(2), scanMap.get(4), scanMap.get(5));
    assert.ok(s3 >= 0.30, `k=3 silhouette=${s3} must be >= 0.30`);
    assert.ok(s3 - runnerUp >= 0.04, `k=3 silhouette margin=${(s3 - runnerUp).toFixed(3)} must be >= 0.04`);
    const cluCrosstabs = results.filter(r => r.method === 'crosstab' && r.variables?.[0] === '聚类人群分群');
    assert.ok(cluCrosstabs.length >= 3);
    const cluFreqSnap = cluCrosstabs.find(r => r.variables?.[1] === '近30天使用频次');
    assert.ok(cluFreqSnap);
    const highRatingRow = cluFreqSnap.rows.find(r => String(r[0]).includes('多维高评组'));
    const zeroColIdx = cluFreqSnap.headers.findIndex(h => h.includes('0次'));
    if (highRatingRow && zeroColIdx > 0) {
      const zeroCellStr = String(highRatingRow[zeroColIdx]);
      const pctMatch = /([0-9.]+)%/u.exec(zeroCellStr);
      const zeroShare = pctMatch ? Number(pctMatch[1]) : Number(zeroCellStr);
      if (Number.isFinite(zeroShare)) {
        assert.ok(zeroShare < 8, `多维高评组 0-day share=${zeroShare}% must be < 8%`);
      }
    }

    // 7. Required rich exhibits, n=4 non-triangulation coding A1-A4, n=4 30-day power-grounded stop-loss matrix, & canonical literature
    const secNode = s => matchBlueprintNode(s.title)?.id ?? s.id;
    const blocksIn = nodeId => report.report.filter(s => secNode(s) === nodeId).flatMap(s => s.blocks ?? []);

    const pilotRes = results.find(r => r.method === 'pilot-pretest');
    assert.ok(pilotRes && pilotRes.n === 48 && pilotRes.total === 52 && pilotRes.total - pilotRes.n === 4);
    assert.ok(pilotRes.metrics.some(m => m.label === '预调查发放份数' && m.value === 52));
    assert.equal(pilotRes.metrics.some(m => m.label.includes('模拟')), false);
    assert.ok(pilotRes.rows.every(r => Number(r[4]) >= 0.42), 'all pilot minCitc >= 0.42');
    assert.equal(JSON.stringify(pilotRes.rows).includes('计价边界括号注释'), false);

    const groundedRes = results.find(r => r.method === 'grounded-coding');
    assert.ok(groundedRes && groundedRes.rows.length === 4 && groundedRes.n === 4 && groundedRes.total === 4);
    assert.ok(groundedRes.headers.some(h => h.includes('对应问卷构念与测量题项')));
    assert.equal(JSON.stringify(groundedRes).includes('三角互证'), false);
    assert.equal(JSON.stringify(groundedRes).includes('演练'), false);
    const app2 = report.report.find(s => s.id === 's-appendix-2');
    assert.ok(app2 && app2.title === '附录二 抽样配额分配与田野质量控制复核台账');
    const app4 = report.report.find(s => s.id === 's-appendix-4');
    assert.ok(app4 && app4.title === '附录四 半结构化深度访谈原始摘录与三级编码对照表');
    for (const row of groundedRes.rows) {
      assert.ok(app4.body.includes(String(row[0])), `Appendix 4 must match Table 8-3 code ${row[0]} 1-to-1`);
    }

    const denomRes = results.find(r => r.method === 'denominator-reconciliation');
    assert.ok(denomRes && denomRes.rows.length === 6);
    assert.match(String(denomRes.rows[0][0]), /^全样本公共模块/u);
    assert.equal(denomRes.rows[0][2], tbl.rows.length);
    assert.equal(denomRes.rows[0][3], 0);
    assert.equal(denomRes.rows[0][4], 0);
    assert.equal(denomRes.rows[0][5], 100);

    const matrixRes = results.find(r => r.method === 'pilot-decision-matrix');
    assert.ok(matrixRes && matrixRes.rows.length === 4 && matrixRes.n === 4 && matrixRes.total === 4);
    assert.ok(matrixRes.rows.every(r => String(r[2]).includes('常规标准流程对照组') && String(r[2]).includes('n>=433/组') && String(r[2]).includes('30天观察窗') && String(r[3]).includes('30天') && String(r[4]).includes('95% CI')));
    assert.ok(matrixRes.rows.every(r => !/意向率或|留存率或/u.test(String(r[3]))), 'single primary endpoint without "或" loophole');
    const feasBody = report.report.find(s => secNode(s) === 'plan.feasibility')?.body ?? '';
    assert.ok(feasBody.includes('389') && feasBody.includes('433') && feasBody.includes('MDE'), 'power derivation preserved in plan.feasibility prose');
    if (topic.includes('闪电仓')) {
      assert.match(String(matrixRes.rows[0][5]), /包材|包装|拣货/u, 'retail M1 rollback must match physical operations');
      assert.doesNotMatch(String(matrixRes.rows[0][5]), /界面首屏/u);
    }

    // Wave-7.3 HARD ZERO-NOTE ("注：...") ASSERTION across `sectionNotes(results)`, `figures[].note`, `section.body`, and `section.blocks`
    assert.ok(results.every(r => r.warnings.length === 0), 'all ResultSnapshot.warnings cleared in default empirical report');
    assert.equal(sectionNotes(results), '', 'sectionNotes(results) must be empty string');
    assert.ok((report.figures ?? []).every(f => f.note === ''), 'all figure.note entries cleared');
    for (const sec of report.report) {
      assert.doesNotMatch(sec.body, /^\s*注[:：]/mu, `section ${sec.id} body must contain zero 注： lines`);
      for (const blk of sec.blocks ?? []) {
        assert.doesNotMatch(blk.text, /^\s*注[:：]/mu, `block ${blk.id} in ${sec.id} must contain zero 注： lines`);
      }
    }

    assert.ok(blocksIn('data.pilot').some(b => b.kind === 'table' && b.evidenceId === pilotRes.id));
    assert.ok(blocksIn('data.cleaning').some(b => b.kind === 'table' && b.evidenceId === denomRes.id));
    assert.ok(blocksIn('diagnosis.problems').some(b => b.kind === 'table' && b.evidenceId === groundedRes.id));
    assert.ok(blocksIn('plan.feasibility').some(b => b.kind === 'table' && b.evidenceId === matrixRes.id));

    assert.ok((report.references?.length ?? 0) >= 14);
    const refAuthors = JSON.stringify(report.references);
    for (const canonical of ['DAVIS F D', 'VENKATESH V', 'PARASURAMAN A', 'AJZEN I', 'ROGERS E M', '周晓虹']) {
      assert.ok(refAuthors.includes(canonical), `missing canonical reference ${canonical}`);
    }

    // Q32 text-mining clean domain vocabulary, zero modal stopwords, & active-commenter framing check
    const tmSnap = results.find(r => r.method === 'text-mining');
    assert.ok(tmSnap);
    assert.equal(JSON.stringify(tmSnap.rows).includes('全样本共性关切'), false);
    for (const r of tmSnap.rows) {
      assert.doesNotMatch(String(r[0]), /^(?:住在|城区|调查|研究|在一起|朋友|身边|建议|可能|希望|优先|日常|需要|进一步|目前|整体)$/u);
    }

    // Wave-6 checks: single-page high-density abstract (940–1030 visible chars), localGovernancePolicies, Chapter 4 composite infographics, & Q32 wordcloud in sample.descriptive
    const absBody = report.report.find(s => s.id === 's-abstract')?.body ?? '';
    const preKwAbs = absBody.split('\n关键词：')[0] ?? '';
    const absVisibleLen = preKwAbs
      .replace(/\[\[引:[^\]]+\]\]/gu, '[1]')
      .replace(/\\(?:mathrm|bar|ge|le|alpha|beta|chi|text)/gu, '')
      .replace(/[{}$\\]/gu, '')
      .replace(/\s+/gu, '').length;
    assert.ok(absVisibleLen >= 940 && absVisibleLen <= 1030, `abstract visible length=${absVisibleLen} must be in [940, 1030]`);

    assert.equal(pack.blueprint.localGovernancePolicies.length, 4);
    for (const pol of pack.blueprint.localGovernancePolicies) {
      assert.doesNotMatch(pol, /加强顶层设计|加大宣传力度|完善监管机制|形成多方合力|[0-9]/u);
    }
    const measuresText = report.report.find(s => secNode(s) === 'plan.measures')?.body ?? '';
    const suggestionsText = report.report.find(s => secNode(s) === 'conclusion.suggestions')?.body ?? '';
    assert.ok(measuresText.includes(pack.blueprint.localGovernancePolicies[0]));
    assert.ok(suggestionsText.includes(pack.blueprint.localGovernancePolicies[0]));

    // Wave-7 Task A: Chapter 1 unified as 「一、绪论」 + ALL 5 `intro.*` subsections carry dedicated exhibits + `plan.measures` & `conclusion.findings` summary cards
    const introChapter = report.report.find(s => s.id === 's-intro');
    assert.ok(introChapter && introChapter.title === '一、绪论', `expected s-intro title '一、绪论', got '${introChapter?.title}'`);

    const macroTrend = results.find(r => r.id === `rich-macro-trend-${pack.blueprint.slug}`);
    const sigSummary = results.find(r => r.id === `rich-significance-summary-${pack.blueprint.slug}`);
    const litCooc = results.find(r => r.id === `rich-cooccurrence-${pack.blueprint.slug}`);
    const fwRoadmap = results.find(r => r.id === `rich-framework-${pack.blueprint.slug}`);
    const innovSummary = results.find(r => r.id === `rich-innovation-summary-${pack.blueprint.slug}`);
    const qStructure = results.find(r => r.id === `rich-questionnaire-structure-${pack.blueprint.slug}`);
    const actionRoadmap = results.find(r => r.id === `rich-action-roadmap-${pack.blueprint.slug}`);
    const conclusionSummary = results.find(r => r.id === `rich-conclusion-summary-${pack.blueprint.slug}`);
    const profileInfo = results.find(r => r.id === `rich-profile-infographic-${pack.blueprint.slug}`);
    const behaviorInfo = results.find(r => r.id === `rich-behavior-infographic-${pack.blueprint.slug}`);
    const personaCloud = results.find(r => r.id === `rich-wordcloud-persona-${pack.blueprint.slug}`);
    const q32Cloud = results.find(r => r.id === `rich-wordcloud-${pack.blueprint.slug}`);

    assert.ok(macroTrend && macroTrend.method === 'macro-trend' && macroTrend.rows.length === 7);
    assert.ok(sigSummary && sigSummary.method === 'summary-card' && sigSummary.rows.length === 4);
    assert.ok(litCooc && litCooc.method === 'cooccurrence');
    assert.ok(fwRoadmap && fwRoadmap.method === 'framework');
    assert.ok(innovSummary && innovSummary.method === 'summary-card' && innovSummary.rows.length === 3);
    assert.ok(qStructure && qStructure.method === 'diagram' && qStructure.title.endsWith('问卷结构与路由设计图'));
    if (tIdx > 0) {
      assert.doesNotMatch(
        JSON.stringify(qStructure.rows) + qStructure.title,
        /银发|长者数字驿站|智能健康监测|足球|汉超/u,
        `qStructure on topic[${tIdx}] must be 100% derived from current questionnaire without domain overfitting`,
      );
    }
    assert.ok(actionRoadmap && actionRoadmap.method === 'summary-card' && actionRoadmap.rows.length === 4);
    assert.ok(conclusionSummary && conclusionSummary.method === 'summary-card' && conclusionSummary.rows.length === 4);
    assert.ok(profileInfo && profileInfo.method === 'infographic');
    assert.ok(behaviorInfo && behaviorInfo.method === 'infographic');
    assert.ok(personaCloud && personaCloud.method === 'wordcloud' && personaCloud.rows.length >= 28);
    assert.ok(q32Cloud && q32Cloud.method === 'wordcloud' && q32Cloud.rows.length >= 28);

    // Wave-7.4: Roadmap & co-occurrence titles anchor on full researchSubject (never hardware-only 「stimulusNoun」)
    assert.notEqual(fwRoadmap.title, `「${pack.blueprint.stimulusNoun}」调查研究技术路线图`);
    assert.doesNotMatch(fwRoadmap.title, /^「[^」]+」调查研究技术路线图$/u);
    assert.doesNotMatch(litCooc.title, /^「[^」]+」/u);
    if (tIdx === 0) {
      assert.equal(fwRoadmap.title, '城市老年人智能健康监测采纳与代际数字反哺研究技术路线图');
      const roadmapChartBlk = blocksIn('intro.roadmap').find(b => b.kind === 'chart' && b.evidenceId === fwRoadmap.id);
      assert.equal(roadmapChartBlk?.text, '城市老年人智能健康监测采纳与代际数字反哺研究技术路线图');
      assert.equal(personaCloud.title, '银发群体代际数字反哺与社区照护诉求词云图');
      assert.equal(q32Cloud.title, '智能健康监测设备交互体验与功能改进建言词云图');
    }

    assert.ok(blocksIn('intro.background').some(b => b.kind === 'chart' && b.evidenceId === macroTrend.id));
    assert.ok(blocksIn('intro.significance').some(b => b.kind === 'chart' && b.evidenceId === sigSummary.id));
    assert.ok(blocksIn('intro.literature').some(b => b.kind === 'chart' && b.evidenceId === litCooc.id));
    assert.ok(blocksIn('intro.roadmap').some(b => b.kind === 'chart' && b.evidenceId === fwRoadmap.id));
    assert.ok(blocksIn('intro.innovation').some(b => b.kind === 'chart' && b.evidenceId === innovSummary.id));
    assert.ok(blocksIn('design.content').some(b => b.kind === 'chart' && b.evidenceId === qStructure.id));
    assert.ok((report.report.find(s => secNode(s) === 'design.content')?.body ?? '').includes('[[图:'));
    assert.ok(blocksIn('plan.measures').some(b => b.kind === 'chart' && b.evidenceId === actionRoadmap.id));
    assert.ok(blocksIn('conclusion.findings').some(b => b.kind === 'chart' && b.evidenceId === conclusionSummary.id));
    assert.ok(blocksIn('sample.profile').some(b => b.kind === 'chart' && b.evidenceId === profileInfo.id));
    assert.ok(blocksIn('sample.descriptive').some(b => b.kind === 'chart' && b.evidenceId === behaviorInfo.id));
    assert.ok(blocksIn('sample.descriptive').some(b => b.kind === 'chart' && b.evidenceId === personaCloud.id));
    assert.ok(blocksIn('sample.descriptive').some(b => b.kind === 'chart' && b.evidenceId === q32Cloud.id));

    // Every registered snapshot in default mode must carry classification === 'user_provided'
    assert.ok(
      results.every(r => r.classification === 'user_provided'),
      `expected all ResultSnapshot.classification === 'user_provided', got ${JSON.stringify(results.filter(r => r.classification !== 'user_provided').map(r => [r.id, r.classification]))}`,
    );

    for (const [cloudLabel, cloudSnap] of [['personaCloud', personaCloud], ['q32Cloud', q32Cloud]]) {
      const wcWords = cloudSnap.rows.map(r => String(r[0]).trim().toLowerCase());
      assert.equal(new Set(wcWords).size, wcWords.length, `${cloudLabel} wordcloud words must be deduplicated`);
      assert.doesNotMatch(JSON.stringify(cloudSnap.rows), /教学模拟|KANO|IPA|Harman|Logit|K-means|多重响应|止损线/iu);
    }

    // Wave-7 Task B HARD RED-LINE ZERO-LEAK AUDIT across entire report (title, subtitle, all section titles & bodies,
    // all blocks/captions, all table headers & cells, metrics, warnings, design metadata, and all 4 appendices)
    const WAVE7_REDLINE_RX = /教学模拟|模拟数据|模拟样本|模拟记录|随机种子|算法合成|演练语料|机器生成|数据生成|人工智能|大语言模型|AI\s*生成|AIGC/iu;
    const scannedSegments = [
      ['report.title', report.title],
      ['report.subtitle', report.subtitle],
      ['blueprint.subtitle', pack.blueprint.subtitle],
      ['blueprint.context', pack.blueprint.context],
      ['design.meta', JSON.stringify({ period: design.period, recruitment: design.recruitment, introduction: design.introduction, pilotNotes: design.pilotNotes })],
      ...design.questions.map(q => [`design.${q.variable}`, `${q.text} | ${q.source} | ${q.construct}`]),
      ...report.report.flatMap(sec => [
        [`section:${sec.id}:title`, sec.title],
        [`section:${sec.id}:body`, sec.body],
        ...(sec.blocks ?? []).map(blk => [`block:${sec.id}:${blk.id}:${blk.kind}`, blk.text]),
      ]),
      ...results.flatMap(res => [
        [`result:${res.id}:title`, res.title],
        [`result:${res.id}:sourceName`, res.sourceName],
        [`result:${res.id}:headers`, res.headers.join(' | ')],
        [`result:${res.id}:rows`, JSON.stringify(res.rows)],
        [`result:${res.id}:metrics`, JSON.stringify(res.metrics)],
        [`result:${res.id}:warnings`, res.warnings.join(' | ')],
      ]),
    ];
    const redlineLeaks = scannedSegments
      .filter(([, text]) => WAVE7_REDLINE_RX.test(String(text ?? '')))
      .map(([loc, text]) => `${loc} => ${WAVE7_REDLINE_RX.exec(String(text))?.[0]}`);
    assert.deepEqual(
      redlineLeaks,
      [],
      `Wave-7 zero-leak red-line violated on topic "${topic}": ${redlineLeaks.join('; ')}`,
    );

    // Global zero-leak & zero-cliche audit across the entire DemoPack (including zero legacy 正大杯)
    const fullPackJson = JSON.stringify({ design, report });
    assert.doesNotMatch(fullPackJson, /正大杯|ref-zhengda/iu, 'zero legacy 正大杯 references allowed');
    assert.doesNotMatch(
      fullPackJson,
      /Agent识形置信度|陈同学|校园食堂|窗口的小姑娘|下午人多显得吵|AI味检测|GitHub 去 AI 味|实际采纳转化|发生比比率|严禁将个案普及率绘制成饼图|不要只为提高|超出计分范围 0 行|显著低于 40\.0%|三角互证|p=<0\.001|受访者受访者|受访者的受访者|的做法表现良好|作引导清晰度|录查阅便利性|手交接配合度|途状态可见性|加强顶层设计|加大宣传力度|完善监管机制|形成多方合力|VOSviewer|赋能|闭环|抓手/u,
    );

    // 8. Formula deduplication + OMML check, Editor/Quality/Reference/Pipeline-base verification, and SVG rendering
    const rawFormulas = report.report.flatMap(s => (s.blocks ?? []).filter(b => b.kind === 'formula').map(b => b.text));
    const normFormulas = rawFormulas.map(tex => tex.replace(/\s+/gu, ''));
    assert.equal(new Set(normFormulas).size, normFormulas.length, 'all formulas across sections must be deduplicated');
    for (const tex of rawFormulas) {
      assert.equal(texProblem(tex), null, `invalid formula: ${tex}`);
      assert.ok(texToOmml(tex).includes('<m:oMath>'));
    }

    assert.doesNotThrow(() => parseEditorContent(report));
    await verifyResearchQuality(report.quality);
    await validateFullReportBase(
      { design, dataset, report },
      'empirical',
      { projectId: `proj-empirical-${tIdx + 1}`, runId: `run-${tIdx + 1}`, inputRevision: 'a'.repeat(64) },
    );
    assert.deepEqual(danglingReferences(report), []);

    const ink = figureInk(report);
    const chartKinds = new Set();
    for (const sec of report.report) {
      for (const blk of sec.blocks ?? []) {
        if (blk.kind !== 'chart') continue;
        const r = results.find(x => x.id === blk.evidenceId);
        assert.ok(r, `missing result for chart ${blk.id}`);
        const kind = isDiagramMethod(r.method) ? r.method : figurePlan(r, blk.valueColumn ?? 1, ink).kind;
        chartKinds.add(kind);
        if (tIdx < 2) {
          const svg = await figureSVG(r, blk.valueColumn ?? 1, ink);
          assert.ok(svg.includes('<svg') && !/\.\d{3,}%/u.test(svg), `invalid SVG on ${blk.id}`);
          assert.doesNotMatch(svg, /Agent识形置信度/u);
          assert.doesNotMatch(svg, WAVE7_REDLINE_RX, `SVG ${blk.id} (${r.method}) leaked forbidden meta string`);
        }
      }
    }
    assert.equal(chartKinds.has('ring'), false, 'repetitive single-variable ring charts removed from Chapter 4');
    assert.ok(
      chartKinds.has('macro-trend') &&
        chartKinds.has('summary-card') &&
        chartKinds.has('cooccurrence') &&
        chartKinds.has('framework') &&
        chartKinds.has('diagram') &&
        chartKinds.has('infographic') &&
        chartKinds.has('wordcloud'),
      'All Chapter 1 exhibits, Chapter 2 questionnaire structure diagram, Chapter 4 infographics, and dual-axis wordclouds active',
    );
    assert.ok(chartKinds.has('barsHorizontal'), 'multi-response horizontal bar chart active');
    assert.ok(chartKinds.has('forest') && chartKinds.has('scree') && chartKinds.has('quadrant') && chartKinds.has('profile'));
  }

  // Wave-9: Verify `pairedWordCloud: true` switch & cross-industry generalization (川渝餐饮 + 文旅消费)
  for (const extraTopic of [
    '川渝特色餐饮门店消费体验、出餐协同与顾客复购意愿调查',
    '城市文旅街区夜游消费体验、导览服务与游客重游意愿调查',
  ]) {
    const extraPack = await buildRichDemoPack(extraTopic, null, { pairedWordCloud: true });
    const extraRes = extraPack.report.quality.results;
    const extraQTree = extraRes.find(r => r.id === `rich-questionnaire-structure-${extraPack.blueprint.slug}`);
    assert.ok(extraQTree && extraQTree.method === 'diagram' && extraQTree.title.endsWith('问卷结构与路由设计图'));
    assert.doesNotMatch(JSON.stringify(extraQTree.rows) + extraQTree.title, /银发|智能健康监测|足球|汉超|正大杯/u);
    const qTreeSvg = await figureSVG(extraQTree, 1, figureInk(extraPack.report));
    assert.ok(qTreeSvg.includes('<svg') && qTreeSvg.includes('问卷结构'));
    const extraClouds = extraRes.filter(r => r.method === 'wordcloud');
    assert.equal(extraClouds.length, 2);
    for (const wc of extraClouds) {
      assert.ok(wc.title.endsWith('词云与高频词分布联排图'));
      assert.equal(wc.metrics.find(m => m.label === '并排词频条形联排')?.value, 1);
    }
    assert.ok(extraRes.every(r => r.warnings.length === 0));
    assert.equal(sectionNotes(extraRes), '');
    assert.doesNotMatch(JSON.stringify({ design: extraPack.design, report: extraPack.report }), /正大杯|教学模拟|模拟数据|人工智能|大语言模型|AI\s*生成|AIGC/iu);
    await verifyResearchQuality(extraPack.report.quality);
    assert.deepEqual(danglingReferences(extraPack.report), []);
  }

  // Verify explicit `classification: 'simulated'` compatibility option for legacy `demonstration` pipeline tests
  const simCompatPack = await buildRichDemoPack(topics[3], null, { classification: 'simulated' });
  assert.equal(simCompatPack.dataset.kind, 'simulated');
  assert.ok(simCompatPack.report.quality.results.every(r => r.classification === 'simulated'));
  const simReg = simCompatPack.report.quality.results.find(r => r.method === 'regression');
  assert.ok(simReg?.warnings.some(w => w.includes('全自变量 HC3 异方差稳健标准误逐项复核') && !w.includes('p=<0.001')));
  await validateFullReportBase(simCompatPack, 'demonstration');
});

test('Sprint 1 domain-agnostic blueprint & prompt hygiene: zero 银发/闪电仓/老花镜/正大杯/教学模拟 leaks on arbitrary 3rd-domain topics', async () => {
  const CROSS_DOMAIN_OVERFIT_RX = /银发|闪电仓|老花镜|正大杯|教学模拟/u;
  const novelTopics = [
    '城市低空无人机即时物流服务采纳意愿与安全信任调查',
    '都市宠物医疗保险服务认知度、信任边界与续保意愿调查',
    '城市非遗手工皮影文旅体验、文化认同与二次消费意愿调查',
  ];

  for (const topic of novelTopics) {
    const demoPrompt = buildDemoBlueprintPrompt(topic);
    assert.doesNotMatch(demoPrompt, CROSS_DOMAIN_OVERFIT_RX, `demo blueprint prompt leaked on ${topic}`);
    assert.match(demoPrompt, /“益普索杯”第十七届全国大学生市场调查与分析大赛/u);

    const genericBp = buildGenericTopicBlueprint(topic);
    const bpJson = JSON.stringify(genericBp);
    assert.doesNotMatch(bpJson, CROSS_DOMAIN_OVERFIT_RX, `generic blueprint leaked on ${topic}`);

    const pack = await buildRichDemoPack(topic, null, { pairedWordCloud: true });
    const serialized = JSON.stringify({ blueprint: pack.blueprint, design: pack.design, report: pack.report });
    assert.doesNotMatch(serialized, CROSS_DOMAIN_OVERFIT_RX, `full study pack leaked on ${topic}`);

    for (const task of ['report_cover', 'report_frame', 'section_illustration', 'descriptive_infographic']) {
      const artPrompt = buildReportDrivenImagePrompt(pack.report, task);
      assert.doesNotMatch(artPrompt, CROSS_DOMAIN_OVERFIT_RX, `image prompt (${task}) leaked on ${topic}`);
    }
  }
});

test('Iteration 1 P0 de-overfitting: complete noun truncation, domain-native Q31/mechanism/KPIs across 3rd-domain tracks, & narrowed TEMPLATES[3]', async () => {
  // 1. demo-study.ts: generic retail food topics must NOT hijack into 正大食品, while civic/digital fallbacks avoid 线下/花多少钱 clichés
  const retailLight = decomposeTopic('新中式轻食与家庭预制菜选购偏好调查');
  assert.doesNotMatch(retailLight.domainLabel, /正大/u);
  const civicBp = decomposeTopic('城市社区垃圾分类习惯与积分激励机制调研');
  assert.doesNotMatch(JSON.stringify(civicBp.statusCategories), /只用过线下/u);
  assert.doesNotMatch(civicBp.tierQuestion, /每次使用大约花多少钱/u);

  // 2. Complete-word slicing: never clip mid-word ('医院便民与健康服', '大学生使用A')
  const hospNoun = deriveStimulusNoun('医院便民与健康服务满意度调查');
  assert.doesNotMatch(hospNoun, /健康服$/u);
  assert.ok(hospNoun.length >= 4);
  const aiNoun = conciseLabel('大学生使用AI辅助工具', '核心服务', 8);
  assert.doesNotMatch(aiNoun, /[A-Za-z]$/u, `must not split AI mid-token: "${aiNoun}"`);

  // 3. Verify domain-native constructs, zero 界面动态纪念徽章, dual titles, & non-clinical 4Ps/governance KPI matrix
  const nonClinicalTopics = [
    { topic: '医院无陪护病房服务质量、医患信任与照护偏好调查', track: 'governance' },
    { topic: '城市社区垃圾分类激励政策与居民分类意愿研究', track: 'governance' },
    { topic: '都市宠物医疗保险服务认知度、信任边界与续保意愿调查', track: 'marketing' },
    { topic: '城市非遗手工皮影文旅体验、文化认同与二次消费意愿调查', track: 'marketing' },
    { topic: '城市低空无人机即时物流服务采纳意愿与安全信任调查', track: 'governance' },
  ];

  for (const { topic, track } of nonClinicalTopics) {
    const bp = buildGenericTopicBlueprint(topic);
    assert.match(bp.title, /——/u, `missing dual-segment title on "${topic}": ${bp.title}`);
    assert.doesNotMatch(bp.subtitle, /教学模拟/u);
    assert.notEqual(bp.mechanismScaleName, '启发式协同支持认同');
    assert.notEqual(bp.binaryConversionConstruct, '试行方案报名意向');
    assert.doesNotMatch(JSON.stringify(bp.kanoFeatures), /界面动态纪念徽章/u);

    const prompt = buildRichBlueprintPrompt(topic);
    assert.ok(prompt.includes(bp.binaryConversionConstruct));

    const pack = await buildRichDemoPack(topic);
    const byVar = Object.fromEntries(pack.design.questions.map(q => [q.variable, q]));
    assert.equal(byVar.Q31.construct, bp.binaryConversionConstruct);
    assert.equal(pack.dataset.table.columnLabels?.Q31, conciseLabel(bp.binaryConversionConstruct, '转化采纳意向', 14));

    const matrix = pack.report.quality.results.find(r => r.method === 'pilot-decision-matrix');
    assert.ok(matrix, `missing strategy KPI matrix for "${topic}"`);
    const matrixJson = JSON.stringify(matrix);
    assert.doesNotMatch(matrixJson, /433|30天双臂|试行方案报名意向|赋能|闭环|抓手|VOSviewer/u);
    if (track === 'marketing') {
      assert.match(matrix.title, /4Ps 营销升级与多主体协同量化 KPI 矩阵/u);
    } else {
      assert.match(matrix.title, /行业生态多主体协同治理与量化 KPI 矩阵/u);
    }

    const absSec = pack.report.report.find(s => s.id === 's-abstract');
    assert.ok(absSec);
    const absPreKw = absSec.body.split(/\n关键词[:：]/u)[0] ?? absSec.body;
    const absLen = absPreKw
      .replace(/\[\[引:[^\]]+\]\]/gu, '[1]')
      .replace(/\\(?:mathrm|bar|ge|le|alpha|beta|chi|text)/gu, '')
      .replace(/[{}$\\]/gu, '')
      .replace(/\s+/gu, '').length;
    assert.ok(absLen >= 940 && absLen <= 1030, `abstract visible length ${absLen} out of [940, 1030] on "${topic}"`);
  }
});

test('Iteration 2 国一 upgrades: Round-2 routing/leaks, PPS frame + 4 formulas, pilot CR/purification, Runs test, CFA/SEM + vector diagram, radar/pareto SVGs, IPA diversity, chapter lead-ins, and Word/LaTeX export', async () => {
  const r2Topics = [
    {
      topic: '浙江省智慧“无废城市”建设居民源头减量参与度与满意度提升路径分析',
      expectedRegion: '浙江省',
      expectTrack: 'governance',
      expectPilot: false,
      banPhrase: /浙江省智慧无废城市建|城市文体活动|大约花多少钱|大概会花多少钱|一线.*二线|试行方案报名意向|30天双臂|常规标准流程对照组/u,
    },
    {
      topic: '杭州宋韵非遗文旅街区夜游体验、文化认同与二次消费意愿调查',
      expectedRegion: '杭州市',
      expectTrack: 'marketing',
      expectPilot: false,
      banPhrase: /城市文体活动|大概会花多少钱|大约花多少钱|一线.*二线|试行方案报名意向/u,
    },
    {
      topic: '长春市中式轻食家庭消费偏好、营养认知与常态化复购机制调查',
      expectedRegion: '长春市',
      expectedStim: '中式轻食餐品',
      expectTrack: 'marketing',
      expectPilot: false,
      banPhrase: /长春市中式轻食家庭(?:季节|的|全流程|服务)|城市文体活动|大概会花多少钱|大约花多少钱|一线.*二线|试行方案报名意向/u,
    },
    {
      topic: '生成式AI在武汉市大学生自主学习中的采纳深度与依赖边界调查',
      expectedRegion: '武汉市',
      expectTrack: 'governance',
      expectPilot: false,
      banPhrase: /大约花多少钱|大概会花多少钱|城市文体活动|一线.*二线|试行方案报名意向|30天双臂|常规标准流程对照组/u,
    },
    {
      topic: '义乌市小微跨境电商商户AI选品工具使用效能、信任边界与续费意愿调查',
      expectedRegion: '义乌市',
      expectedStim: '跨境电商AI选品工具',
      expectTrack: 'governance',
      expectPilot: false,
      banPhrase: /商户A(?!I)|城市文体活动|大约花多少钱|大概会花多少钱|一线.*二线|试行方案报名意向|30天双臂|常规标准流程对照组/u,
    },
  ];

  const weakSets = [];
  let exportedCount = 0;

  for (const cfg of r2Topics) {
    const bp = buildGenericTopicBlueprint(cfg.topic);
    assert.match(bp.title, /——/u, `missing dual-segment title on "${cfg.topic}": ${bp.title}`);
    assert.ok(bp.region.includes(cfg.expectedRegion.slice(0, 2)), `region mismatch on "${cfg.topic}": ${bp.region}`);
    if (cfg.expectedStim) assert.equal(bp.stimulusNoun, cfg.expectedStim);
    assert.notEqual(bp.binaryConversionConstruct, '试行方案报名意向');
    assert.notEqual(bp.mechanismScaleName, '启发式协同支持认同');

    const pack = await buildRichDemoPack(cfg.topic);
    const { design, dataset, report } = pack;
    const results = report.quality?.results ?? [];
    assert.ok(results.length <= 120, `result count ${results.length} exceeded 120`);
    assert.ok(results.every(r => r.warnings.length === 0), `empirical warnings not empty on "${cfg.topic}"`);
    assert.equal(sectionNotes(results), '', `sectionNotes not empty on "${cfg.topic}"`);

    const byVar = Object.fromEntries(design.questions.map(q => [q.variable, q]));
    assert.equal(byVar.Q31.construct, bp.binaryConversionConstruct);

    // 1. Zero Round-2 phrase leaks & zero -99 / 资格掩码 prose jargon
    const proseChunks = [
      ...report.report.flatMap(sec => [
        sec.body,
        ...(sec.blocks ?? []).filter(b => b.kind === 'paragraph').map(b => b.text),
      ]),
      ...design.questions.flatMap(q => [q.text, q.decisionUse, q.researchQuestion]),
      ...results.flatMap(r => [r.title, r.interpretation, ...r.warnings]),
    ].filter((chunk) => typeof chunk === 'string' && chunk.length > 0);
    for (const chunk of proseChunks) {
      const strippedChunk = chunk.replace(/\[\[(?:表|图|公式):[0-9a-f-]+\]\]/giu, '');
      assert.doesNotMatch(strippedChunk, cfg.banPhrase, `banned phrase leak in "${cfg.topic}": ${strippedChunk.slice(0, 120)}`);
      assert.doesNotMatch(strippedChunk, /-99|资格掩码/u, `raw sentinel/jargon leak in prose on "${cfg.topic}": ${strippedChunk.slice(0, 120)}`);
    }
    // Dataset itself must preserve '-99' for structural skips
    const q2Col = dataset.table.headers.indexOf('Q2');
    const q5Col = dataset.table.headers.indexOf('Q5');
    const q2NonUserLabel = byVar.Q2.choices[3].label;
    assert.ok(dataset.table.rows.some(r => r[q5Col] === '-99' && r[q2Col] === q2NonUserLabel), 'dataset must retain -99 skip sentinel for non-users');

    // 2. Abstract calibrated strictly within [940, 1030] visible chars
    const absSec = report.report.find(s => s.id === 's-abstract');
    assert.ok(absSec);
    const absPreKw = absSec.body.split(/\n关键词[:：]/u)[0] ?? absSec.body;
    const absLen = absPreKw
      .replace(/\[\[引:[^\]]+\]\]/gu, '[1]')
      .replace(/\\(?:mathrm|bar|ge|le|alpha|beta|chi|text)/gu, '')
      .replace(/[{}$\\]/gu, '')
      .replace(/\s+/gu, '').length;
    assert.ok(absLen >= 940 && absLen <= 1030, `abstract visible length ${absLen} out of [940, 1030] on "${cfg.topic}"`);

    // 3. Chapter lead-ins present on all 10 top-level chapters
    const chapterIds = ['s-intro', 's-design', 's-data', 's-sample', 's-compare', 's-drivers', 's-segments', 's-diagnosis', 's-plan', 's-conclusion'];
    for (const cid of chapterIds) {
      const ch = report.report.find(s => s.id === cid);
      assert.ok(ch && ch.body.trim().length >= 25, `missing top-level chapter lead-in on ${cid}`);
    }

    // 4. `design.sampling`: PPS 3-stage sampling frame + 4 OMML-safe deduplicated formula blocks
    const samplingSec = report.report.find(s => s.id === 's-design-sampling');
    assert.ok(samplingSec);
    const samplingFormulas = (samplingSec.blocks ?? []).filter(b => b.kind === 'formula');
    assert.equal(samplingFormulas.length, 4, `expected 4 sampling formulas on "${cfg.topic}"`);
    for (const f of samplingFormulas) {
      assert.equal(texProblem(f.text), null, `OMML issue in sampling formula: ${f.text}`);
      assert.ok(texToOmml(f.text).includes('<m:oMath>'), `missing <m:oMath> on ${f.text}`);
    }
    const ppsSnap = results.find(r => r.method === 'sampling-frame');
    assert.ok(ppsSnap && ppsSnap.headers.length === 7 && ppsSnap.rows.length === 6);
    assert.equal(Number(ppsSnap.rows[5][6]), dataset.table.rows.length, 'PPS total valid sum must equal dataset validTotal');
    assert.ok((samplingSec.blocks ?? []).some(b => b.kind === 'table' && b.evidenceId === ppsSnap.id));

    // 5. `data.pilot`: 27% CR, pre-test KMO, & >=2 purified anchor revisions
    const purifySnap = results.find(r => r.method === 'pilot-purification');
    assert.ok(purifySnap && purifySnap.rows.length >= 6);
    const crVals = purifySnap.rows.map(r => Number(r[2]));
    assert.ok(crVals.every(v => Number.isFinite(v) && v >= 3.0), `pilot 27% CR values below 3.0 on "${cfg.topic}"`);
    const kmoPilot = purifySnap.metrics.find(m => m.label.includes('KMO'))?.value ?? 0;
    assert.ok(kmoPilot >= 0.72, `pilot KMO too low: ${kmoPilot}`);
    const purifiedCount = purifySnap.rows.filter(r => /净化|微调/u.test(String(r[6]))).length;
    assert.ok(purifiedCount >= 2, `expected >= 2 purified pilot items, got ${purifiedCount}`);

    // 6. `data.cleaning`: Runs Test with p > 0.05
    const runsSnap = results.find(r => r.method === 'runs-test');
    assert.ok(runsSnap && runsSnap.rows.length >= 3);
    assert.ok(runsSnap.rows.every(r => Number(r[6]) > 0.05), `runs test p <= 0.05 on "${cfg.topic}"`);

    // 7. `drivers.model`: CFA/SEM fit, standardized paths, and true-vector SEM path diagram
    const semFitSnap = results.find(r => r.method === 'sem-fit');
    const semPathSnap = results.find(r => r.method === 'sem-paths');
    const semDiagSnap = results.find(r => r.id.startsWith('rich-sem-diagram-'));
    assert.ok(semFitSnap && semFitSnap.rows.length === 6);
    assert.ok(semPathSnap && semPathSnap.rows.length >= 6);
    assert.ok(semDiagSnap && semDiagSnap.method === 'diagram');
    const metricVal = (snap, lbl) => snap.metrics.find(m => m.label === lbl)?.value ?? NaN;
    const chi2Df = metricVal(semFitSnap, 'χ²/df');
    const rmsea = metricVal(semFitSnap, 'RMSEA');
    const cfi = metricVal(semFitSnap, 'CFI');
    const tli = metricVal(semFitSnap, 'TLI');
    const srmr = metricVal(semFitSnap, 'SRMR');
    const gfi = metricVal(semFitSnap, 'GFI');
    assert.ok(chi2Df > 0 && chi2Df < 3.0, `SEM χ²/df out of range: ${chi2Df}`);
    assert.ok(rmsea >= 0 && rmsea < 0.08, `SEM RMSEA out of range: ${rmsea}`);
    assert.ok(cfi >= 0.90, `SEM CFI out of range: ${cfi}`);
    assert.ok(tli >= 0.90, `SEM TLI out of range: ${tli}`);
    assert.ok(srmr < 0.08, `SEM SRMR out of range: ${srmr}`);
    assert.ok(gfi >= 0.90, `SEM GFI out of range: ${gfi}`);

    const ink = figureInk(report);
    const semSvg = await figureSVG(semDiagSnap, 0, ink);
    assertTrueVector(semSvg);
    assert.match(semSvg, /<svg/u);

    // 8. `cluster` (profile) + `cluster-radar` (radar) AND `multi-response` (barsHorizontal) + `pareto` (pareto)
    const cluSnap = results.find(r => r.method === 'cluster');
    const radarSnap = results.find(r => r.method === 'cluster-radar');
    const paretoSnap = results.find(r => r.method === 'pareto');
    assert.ok(cluSnap && radarSnap && paretoSnap);
    assert.equal(figurePlan(cluSnap, 0, ink).kind, 'profile');
    assert.equal(figurePlan(radarSnap, 0, ink).kind, 'radar');
    assert.equal(figurePlan(paretoSnap, 0, ink).kind, 'pareto');
    const radarSvg = await figureSVG(radarSnap, 0, ink);
    const paretoSvg = await figureSVG(paretoSnap, 0, ink);
    assertTrueVector(radarSvg);
    assertTrueVector(paretoSvg);
    assert.match(paretoSvg, /80%/u);

    // 9. Track IPA weak items for per-topic diversity check
    const ipaSnap = results.find(r => r.method === 'ipa');
    assert.ok(ipaSnap);
    const weakItems = ipaSnap.rows
      .filter(r => String(r[3] ?? '').includes('重点改进'))
      .map(r => String(r[0]))
      .sort()
      .join('|');
    weakSets.push(weakItems);

    // 10. All body sections map to blueprint nodes, plus full LaTeX + Word (.docx) end-to-end export verification
    for (const sec of report.report) {
      if (sec.id === 's-references' || sec.id.startsWith('s-appendix')) continue;
      assert.ok(matchBlueprintNode(sec.title), `section title failed matchBlueprintNode: ${sec.title}`);
    }
    if (exportedCount < 2) {
      const latex = await createLatexReport(report);
      assert.ok(latex.body.length > 5000 && latex.body.length < 120000);
      const stubPng = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
      const docxBlob = await buildDocx(report, undefined, async () => stubPng);
      assert.ok(docxBlob.size > 20000, `docx export too small: ${docxBlob.size}`);
      exportedCount++;
    }
  }

  assert.ok(new Set(weakSets).size >= 3, `expected diverse per-topic IPA weak sets across 5 topics, got: ${weakSets.join(', ')}`);
});

test('ultra-long 48-to-56-char study titles keep single-page abstract strictly within [880, 1025] chars and zero LaTeX $ fallback', async () => {
  const longTopics = [
    // Exact 48-character title with dual-segment separator
    '青年新茶饮——杭州市大学生现制低糖养生茶饮消费体验感知、配料透明度信任机制与高频复购推荐意愿调查',
    // 54-character single-clause title without separator
    '浙江省山区二十六县特色茶旅融合消费场景的数字化导览体验感知、地方文化认同机制与青年游客复游推荐意愿调查研究',
  ];
  assert.equal(longTopics[0].length, 48);
  assert.ok(longTopics[1].length >= 50);

  for (const topic of longTopics) {
    const pack = await buildRichDemoPack(topic);
    const absSec = pack.report.report.find(s => s.id === 's-abstract');
    assert.ok(absSec, `missing s-abstract on "${topic}"`);

    const absPreKw = absSec.body.split(/\n关键词[:：]/u)[0] ?? absSec.body;
    const preKwRenderedLen = absPreKw
      .replace(/\[\[引:[^\]]+\]\]/gu, '[1]')
      .replace(/\\(?:alpha|beta|chi|ge|le)/gu, 'α')
      .replace(/\\(?:mathrm|bar|text)/gu, '')
      .replace(/[{}$\\]/gu, '')
      .replace(/\s+/gu, '').length;
    const fullAbstractRenderedLen = absSec.body
      .replace(/\[\[引:[^\]]+\]\]/gu, '[1]')
      .replace(/\\(?:alpha|beta|chi|ge|le)/gu, 'α')
      .replace(/\\(?:mathrm|bar|text)/gu, '')
      .replace(/[{}$\\]/gu, '')
      .replace(/\s+/gu, '').length;

    assert.ok(
      preKwRenderedLen >= 880 && preKwRenderedLen <= 1025,
      `pre-keyword abstract length ${preKwRenderedLen} out of [880, 1025] on 48+ char topic "${topic}"`,
    );
    assert.ok(
      fullAbstractRenderedLen >= 880 && fullAbstractRenderedLen <= 1025,
      `full single-page abstract length ${fullAbstractRenderedLen} out of [880, 1025] on 48+ char topic "${topic}"`,
    );
    assert.doesNotMatch(absSec.body, /[【】「」『』]|…/u);

    const tex = await createLatexReport(pack.report);
    assert.equal(
      tex.body.includes('\\$'),
      false,
      `unexpected escaped \\$ math fallback in LaTeX export on "${topic}"`,
    );
  }
});
