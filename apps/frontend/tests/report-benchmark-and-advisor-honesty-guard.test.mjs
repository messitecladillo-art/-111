import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADVISORS,
  advisorForNode,
  advisorReading,
  exhibitAdvisor,
  hiredAdvisors,
  SECTION_CHECKS,
  sectionIssues,
} from '../lib/agent/advisors.ts';
import {
  canPublishStudioResult,
  citationEvidenceReady,
  sameWorkspaceIdentity,
} from '../lib/agent/integration-safety.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { folio, MAIN_PAGE_LIMIT, PAGE, paginate } from '../lib/paper-layout.ts';
import { newProjectReport } from '../lib/project-report.ts';
import { emptyReference } from '../lib/references.ts';
import {
  BENCHMARK_DIMENSIONS,
  BENCHMARK_TARGETS,
  benchmarkReport,
} from '../lib/report-benchmark.ts';
import {
  DEFAULT_REPORT_OPTIONS,
  outlineKind,
  REPORT_FORMAT,
  reportExportOptions,
  reportPart,
} from '../lib/report-format.ts';
import { SIMULATED_MARK } from '../lib/report-placement.ts';
import {
  chartData,
  confirmFinding,
  defaultFinding,
  findingNeedsReview,
  makeSlideObject,
  parseResearchQuality,
  parseResultSnapshot,
  QUALITY_LIMITS,
  snapshotRecipe,
  verifyResearchQuality,
} from '../lib/research-quality.ts';

const glue = (left, right) => `${left}${right}`;

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const INTERNAL_JARGON_RE = new RegExp(
  `\\b(?:${[
    glue('Re', 'Act'),
    glue('Epistemic', 'Graph'),
    glue('BY', 'OK'),
    glue('DA', 'G'),
    `${glue('Tra', 'ck')}\\s*[12]`,
  ].join('|')})\\b`,
  'u',
);

const GLUED_STAT_TOKENS = [
  glue('Mann-Whitney', 'U'),
  glue("Cliff's", 'δ'),
  glue('Kruskal-Wallis', 'H'),
  glue("Cronbach's", 'α'),
  glue('Spearman', 'ρ'),
  glue("Cohen's", 'd'),
  glue("Cramér's", 'V'),
];

function assertUserVisibleHygiene(text, context) {
  assert.equal(typeof text, 'string', `${context}: expected string`);
  assert.doesNotMatch(
    text,
    FORBIDDEN_BRACKETS_RE,
    `${context}: must contain zero forbidden brackets: "${text}"`,
  );
  assert.doesNotMatch(
    text,
    INTERNAL_JARGON_RE,
    `${context}: must contain zero internal engineering jargon: "${text}"`,
  );
  assert.doesNotMatch(
    text,
    /\bp\s*=\s*0\.000\b/iu,
    `${context}: must contain zero p=0.000 rounding artifact: "${text}"`,
  );
  for (const token of GLUED_STAT_TOKENS) {
    assert.equal(
      text.includes(token),
      false,
      `${context}: must contain zero glued statistical symbol (${token}): "${text}"`,
    );
  }
}

function makeSection(id, title, body = '', extra = {}) {
  return { id, title, body, source: '', ...extra };
}

function findCheck(benchmark, id) {
  const found = benchmark.checks.find(c => c.id === id);
  assert.ok(found, `Expected benchmark check "${id}" to exist`);
  return found;
}

test('all 6 expert advisors partition 100% of benchmark checks cleanly and uphold pure academic Chinese hygiene', () => {
  assert.deepEqual(
    ADVISORS.map(a => a.id),
    ['design', 'evidence', 'modeling', 'figures', 'writing', 'delivery'],
  );
  assert.deepEqual(
    ADVISORS.map(a => a.glyph),
    ['设', '证', '统', '图', '写', '交'],
  );

  for (const advisor of ADVISORS) {
    assert.ok(advisor.skill.startsWith('market-research-'), advisor.id);
    assert.ok(advisor.checks.length >= 5, `${advisor.id} should cover >= 5 checks`);
    assert.ok(advisor.rules.length >= 3, `${advisor.id} should carry >= 3 working rules`);
    assertUserVisibleHygiene(advisor.name, `ADVISORS[${advisor.id}].name`);
    assertUserVisibleHygiene(advisor.glyph, `ADVISORS[${advisor.id}].glyph`);
    assertUserVisibleHygiene(advisor.line, `ADVISORS[${advisor.id}].line`);
    for (const [idx, rule] of advisor.rules.entries()) {
      assertUserVisibleHygiene(rule, `ADVISORS[${advisor.id}].rules[${idx}]`);
    }
  }

  for (const [dimId, dimLabel] of Object.entries(BENCHMARK_DIMENSIONS)) {
    assertUserVisibleHygiene(dimLabel, `BENCHMARK_DIMENSIONS.${dimId}`);
  }
  assert.deepEqual(BENCHMARK_TARGETS.abstract, [800, 2000]);
  assert.deepEqual(BENCHMARK_TARGETS.keywords, [3, 8]);

  // Verify strict 1-to-1 bijection between ADVISORS[].checks and all benchmarkReport check IDs
  const allBenchmarkIds = [
    ...new Set(
      [
        createEditorContent(),
        { ...createEditorContent(), references: [emptyReference('J')] },
      ].flatMap(doc => benchmarkReport(doc).checks.map(c => c.id)),
    ),
  ];
  const advisorOwnedIds = ADVISORS.flatMap(a => a.checks);
  assert.equal(new Set(advisorOwnedIds).size, advisorOwnedIds.length);
  assert.deepEqual([...advisorOwnedIds].sort(), [...allBenchmarkIds].sort());

  // Verify blueprint node routing to exact specialist advisor
  assert.equal(advisorForNode('intro.literature')?.id, 'evidence');
  assert.equal(advisorForNode('references')?.id, 'evidence');
  assert.equal(advisorForNode('design.sampling')?.id, 'design');
  assert.equal(advisorForNode('data.pilot')?.id, 'design');
  assert.equal(advisorForNode('data.cleaning')?.id, 'modeling');
  assert.equal(advisorForNode('compare.groups')?.id, 'modeling');
  assert.equal(advisorForNode('drivers.regression')?.id, 'modeling');
  assert.equal(advisorForNode('diagnosis.evaluation')?.id, 'modeling');
  assert.equal(advisorForNode('sample.profile')?.id, 'figures');
  assert.equal(advisorForNode('appendix')?.id, 'delivery');
  assert.equal(advisorForNode('appendix.ai')?.id, 'delivery');
  assert.equal(advisorForNode('abstract')?.id, 'writing');
  assert.equal(advisorForNode('conclusion.suggestions')?.id, 'writing');
  assert.equal(advisorForNode(null), null);
  assert.equal(advisorForNode('unknown.custom'), null);
  assert.equal(exhibitAdvisor().id, 'figures');
  assert.deepEqual(
    hiredAdvisors(['delivery', 'nonexistent', 'design', 'modeling']).map(a => a.id),
    ['design', 'modeling', 'delivery'],
  );
  for (const secCheck of SECTION_CHECKS) {
    assert.ok(allBenchmarkIds.includes(secCheck), `SECTION_CHECKS "${secCheck}" must exist`);
  }
});

test('benchmarkReport and evidence/modeling advisors catch undeclared simulated data, simulated findings, simulation-as-robustness, and unverified references', async () => {
  const simResult = await snapshotRecipe(
    {
      method: 'frequency',
      interpretation: '教学模拟频数分布',
      n: 200,
      total: 200,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      headers: ['偏好', '频数'],
      rows: [
        ['线上预约', 120],
        ['线下窗口', 80],
      ],
      metrics: [],
      warnings: [],
    },
    {
      title: '模拟偏好分布',
      sourceName: '合成教学演练样本',
      sourceUrl: '',
      sourceHash: 'a'.repeat(64),
      classification: 'simulated',
    },
    'sim-res-1',
  );

  const quality = { version: 1, results: [simResult], findings: [] };
  const confirmedSimFinding = confirmFinding(
    {
      ...defaultFinding(simResult),
      title: '线上预约偏好更高',
      question: '居民更偏好哪种办理渠道？',
      interpretation: '多数受访者倾向线上预约。',
      alternatives: '可能受年龄结构影响。',
      action: '由政务中心牵头优化预约入口，按月监测办理完成率。',
    },
    quality,
  );
  quality.findings.push(confirmedSimFinding);

  const unverifiedRef = {
    ...emptyReference('J'),
    id: 'ref-unverified',
    authors: ['王华'],
    title: '基层政务数字化服务满意度研究',
    source: '公共管理评论',
    year: '2025',
    volume: '7',
    issue: '2',
    pages: '45-58',
    verification: 'metadata_only',
  };
  const rejectedRef = {
    ...emptyReference('J'),
    id: 'ref-rejected',
    authors: ['赵敏'],
    title: '撤稿或失实样本分析',
    source: '某刊',
    year: '2024',
    volume: '1',
    issue: '1',
    pages: '1-5',
    verification: 'rejected',
  };

  const doc = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    title: '城市社区政务服务体验调查报告',
    subtitle: '实证研究',
    quality,
    references: [unverifiedRef, rejectedRef],
    report: [
      makeSection(
        'sec-body',
        '一、实证分析与稳健性检验',
        '如图 1-1 所示，线上预约占比较高[[引:ref-unverified]][[引:ref-rejected]]。进一步通过模拟数据开展稳健性检验，模拟结果十分稳健可靠。',
        {
          blocks: [
            {
              id: 'blk-sim-chart',
              kind: 'chart',
              text: '图 1-1 预约渠道分布',
              evidenceId: simResult.id,
              valueColumn: 1,
            },
          ],
        },
      ),
    ],
  });

  const bench = benchmarkReport(doc);
  assert.equal(findCheck(bench, 'simulated').status, 'fail');
  assert.equal(findCheck(bench, 'findingEvidence').status, 'fail');
  assert.equal(findCheck(bench, 'simulationRobust').status, 'fail');
  assert.equal(findCheck(bench, 'referenceVerification').status, 'fail');

  const evidenceAdvisor = ADVISORS.find(a => a.id === 'evidence');
  const evidenceReading = advisorReading(evidenceAdvisor, bench);
  const evidenceIssueIds = new Set(evidenceReading.issues.map(c => c.id));
  assert.ok(evidenceIssueIds.has('simulated'));
  assert.ok(evidenceIssueIds.has('findingEvidence'));
  assert.ok(evidenceIssueIds.has('referenceVerification'));

  const modelingAdvisor = ADVISORS.find(a => a.id === 'modeling');
  const modelingReading = advisorReading(modelingAdvisor, bench);
  assert.ok(modelingReading.issues.some(c => c.id === 'simulationRobust'));

  // Declaring SIMULATED_MARK, marking report as simulation demo, negating simulation robustness, and verifying reference resolves all four
  const honestDoc = parseEditorContent({
    ...doc,
    subtitle: '教学模拟演示稿',
    references: [{ ...unverifiedRef, verification: 'verified' }],
    report: [
      makeSection(
        'sec-body',
        '一、方法演示',
        `${SIMULATED_MARK}\n如图 1-1 所示，本节仅演示图表流程[[引:ref-unverified]]。需要注意，模拟数据不能当作真实样本的稳健性检验。`,
        { blocks: doc.report[0].blocks },
      ),
    ],
  });
  const honestBench = benchmarkReport(honestDoc);
  assert.equal(findCheck(honestBench, 'simulated').status, 'pass');
  assert.equal(findCheck(honestBench, 'findingEvidence').status, 'pass');
  assert.equal(findCheck(honestBench, 'simulationRobust').status, 'na');
  assert.equal(findCheck(honestBench, 'referenceVerification').status, 'pass');
});

test('benchmarkReport and sectionIssues catch cross-sectional causal overclaims and all 6 statistical misreading traps without penalizing negated disclaimers', () => {
  const overclaimDoc = createEditorContent();
  overclaimDoc.report = [
    makeSection(
      'sec-misuse',
      '四、统计推断与模型解释',
      [
        '社区养老驿站可达性与居民主观幸福感显著相关，这导致老年居民幸福感大幅提升。',
        '基于本次单期横截面问卷，模型刻画了居民养老意愿的长期动态演化与状态转移过程。',
        '二元 Logistic 回归显示知晓政策组的 OR 为 2.65，说明该组参保概率是未知晓组的 2.65 倍。',
        'Mann-Whitney U 秩和检验显著（p < 0.01），直接证明城乡两组老年人的服务开支中位数存在差异。',
        '不同性别在满意度上的差异不显著（p > 0.05），这表明男女受访者之间不存在差异。',
        '采用 K-means 聚类划分三类人群后，对参与聚类的四个原始维度做单因素方差分析（ANOVA）均呈显著差异，证明聚类效果良好且区分度合理。',
      ].join('\n'),
    ),
    makeSection(
      'sec-sampling',
      '（二）抽样设计',
      '本次调查通过问卷星线上发放与社区微信群朋友圈转发收集自愿作答问卷，严格采用多阶段分层随机抽样方法保证代表性。',
    ),
  ];

  const bench = benchmarkReport(overclaimDoc);
  for (const trapId of [
    'causal',
    'dynamicClaim',
    'oddsRatio',
    'rankMedian',
    'nullResult',
    'clusterCircular',
    'samplingWording',
  ]) {
    assert.notEqual(
      findCheck(bench, trapId).status,
      'pass',
      `Expected ${trapId} to flag methodological overclaim`,
    );
    assert.notEqual(findCheck(bench, trapId).status, 'na');
  }

  const secMisuseIssues = sectionIssues(overclaimDoc, 'sec-misuse', benchmarkReport);
  const secIssuePairs = secMisuseIssues.map(item => `${item.check.id}:${item.advisor.id}`);
  for (const expectedPair of [
    'causal:writing',
    'dynamicClaim:modeling',
    'oddsRatio:modeling',
    'rankMedian:modeling',
    'nullResult:modeling',
    'clusterCircular:modeling',
  ]) {
    assert.ok(secIssuePairs.includes(expectedPair), `Missing section issue ${expectedPair}`);
  }

  const secSamplingIssues = sectionIssues(overclaimDoc, 'sec-sampling', benchmarkReport);
  assert.ok(
    secSamplingIssues.some(i => i.check.id === 'samplingWording' && i.advisor.id === 'design'),
  );

  // Negated methodological cautions must NOT be penalized
  const cautiousDoc = createEditorContent();
  cautiousDoc.report = [
    makeSection(
      'sec-cautious',
      '四、统计推断与模型解释',
      [
        '可达性与幸福感存在显著正相关，但横截面观测关联不能说明这导致了幸福感变化。',
        '由于本研究并非纵向面板数据，下文机制图仅作为横截面路径假设与情境推演，不声称动态演化。',
        '知晓政策组的参保优势（odds）是对照组的 2.65 倍（OR = 2.65），注意优势比并非概率倍数。',
        'Mann-Whitney U 检验反映两组分布位置存在显著偏移，在分布形态不同时不宜简单等同于中位数差异。',
        '组间差异未达到显著水平（p > 0.05），说明当前样本量尚不足以排除零差异，95% 置信区间为 [-0.12, 0.18]。',
      ].join('\n'),
    ),
    makeSection(
      'sec-honest-sampling',
      '（二）抽样设计',
      '问卷通过线上链接与社群转发开展便利与配额招募，不借用随机抽样、分层抽样或整群抽样的名称，并在局限部分交代覆盖偏倚。',
    ),
  ];

  const cautiousBench = benchmarkReport(cautiousDoc);
  assert.equal(findCheck(cautiousBench, 'causal').status, 'pass');
  for (const cleanTrap of ['dynamicClaim', 'oddsRatio', 'rankMedian', 'nullResult', 'samplingWording']) {
    assert.equal(
      findCheck(cautiousBench, cleanTrap).status,
      'na',
      `Cautious methodological prose must not fail ${cleanTrap}`,
    );
  }
});

test('missing sample/reliability/citation/action defects are caught across all 6 advisors and dummy method stuffing never inflates score', () => {
  const legacyAlphaWithoutReceipt = parseResultSnapshot({
    id: 'alpha-no-receipt',
    title: '满意度量表信度结果',
    sourceName: '调查数据',
    sourceUrl: '',
    sourceHash: '1'.repeat(64),
    resultHash: '2'.repeat(64),
    classification: 'user_provided',
    method: 'alpha',
    n: 150,
    total: 160,
    headers: ['量表', '系数'],
    rows: [['总体满意度', 0.86]],
    metrics: [{ label: "Cronbach's α", value: 0.86 }],
    warnings: [],
  });

  const defectiveDoc = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    quality: { version: 1, results: [legacyAlphaWithoutReceipt], findings: [] },
    report: [
      makeSection('ab', '摘要', '本研究开展社区调查。\n关键词：'),
      makeSection('d1', '（一）调查目的', '旨在了解社区助餐需求与定价接受程度。'),
      makeSection('d2', '（二）抽样设计', ''),
      makeSection('d3', '（一）预调查', '正式发放前开展了小范围预调查，修改了题干措辞。'),
      makeSection('d4', '（二）正式调查数据处理', '正式回收有效问卷 312 份，未交代发放总量与有效回收率。'),
      makeSection(
        'an',
        '四、实证分析',
        '本节展示了信度表，但正文中既未引用表号，也未登记量表题项计分计算凭据。',
        {
          blocks: [
            {
              id: 'tbl-untitled',
              kind: 'table',
              text: '',
              evidenceId: 'alpha-no-receipt',
              valueColumn: 1,
            },
          ],
        },
      ),
      makeSection('sg', '（一）对策建议', '建议进一步加强宣传引导，提升服务温度。'),
      makeSection('rf', '参考文献', '1. 缺少文献类型标识与年份的不规范条目\n2. 张三. 社区治理研究[J]. 社会学刊, 2024, 10(2): 12-20.'),
    ],
  });

  const bench = benchmarkReport(defectiveDoc);
  assert.equal(findCheck(bench, 'keywords').status, 'fail');
  assert.equal(findCheck(bench, 'objectives').status, 'partial');
  assert.equal(findCheck(bench, 'sampling').status, 'fail');
  assert.equal(findCheck(bench, 'pilot').status, 'partial');
  assert.equal(findCheck(bench, 'validRate').status, 'partial');
  assert.equal(findCheck(bench, 'reliability').status, 'fail');
  assert.equal(findCheck(bench, 'denominators').status, 'fail');
  assert.equal(findCheck(bench, 'captions').status, 'fail');
  assert.equal(findCheck(bench, 'figureReferences').status, 'fail');
  assert.equal(findCheck(bench, 'findings').status, 'fail');
  assert.equal(findCheck(bench, 'executable').status, 'fail');
  assert.equal(findCheck(bench, 'limitations').status, 'fail');
  assert.equal(findCheck(bench, 'referenceFormat').status, 'partial');
  assert.equal(findCheck(bench, 'citations').status, 'fail');
  assert.equal(findCheck(bench, 'questionnaire').status, 'fail');
  assert.equal(findCheck(bench, 'aiDisclosure').status, 'fail');
  assert.equal(findCheck(bench, 'reproducible').status, 'fail');

  // Every single one of the 6 advisors must surface domain-specific issues on this defective report
  for (const advisor of ADVISORS) {
    const reading = advisorReading(advisor, bench);
    assert.ok(
      reading.issues.length >= 1,
      `Advisor "${advisor.id}" (${advisor.name}) must report >= 1 issue on defective draft`,
    );
  }

  // Anti-gaming: stuffing 10 fancy model names and 15 unreferenced formulas/tables must NOT raise score
  const baselineScore = bench.score;
  const stuffedDoc = structuredClone(defectiveDoc);
  stuffedDoc.report[5].body +=
    '\n此外还提及结构方程 SEM、随机森林、XGBoost、神经网络、层次分析法 AHP、TOPSIS 与 LDA 主题模型。';
  for (let i = 0; i < 15; i += 1) {
    stuffedDoc.report[5].blocks.push({
      id: `extra-eq-${i}`,
      kind: 'formula',
      text: `y_${i} = x_${i}`,
      evidenceId: '',
      valueColumn: 0,
    });
  }
  const stuffedBench = benchmarkReport(stuffedDoc);
  assert.ok(
    stuffedBench.score <= baselineScore,
    `Method/formula stuffing must never increase benchmark score (before=${baselineScore}, after=${stuffedBench.score})`,
  );
});

test('delivery 65-page main-volume rule, REPORT_FORMAT spec, and paper-layout paginate accurately distinguish <=65-page compliance from >65-page breaches', () => {
  assert.equal(MAIN_PAGE_LIMIT, 65);
  const deliveryAdvisor = ADVISORS.find(a => a.id === 'delivery');
  assert.ok(deliveryAdvisor);
  assert.ok(
    deliveryAdvisor.rules.some(rule => rule.includes('<=65页')),
    'delivery advisor must explicitly state the <=65-page combined main-volume rule',
  );
  assert.match(REPORT_FORMAT.verified.parts, /不超过 65 页/u);
  assertUserVisibleHygiene(REPORT_FORMAT.verified.parts, 'REPORT_FORMAT.verified.parts');

  const buildMainVolumeFlowBoxes = pageCount => {
    const step = PAGE.contentHeight * 0.92;
    return Array.from({ length: pageCount }, (_, index) => ({
      top: index * step,
      height: step,
      breakBefore: index > 0,
      keepNext: false,
    }));
  };

  // 1. Compliant main volume: 1 cover + 2 front-matter (abstract + TOC) + 60 body pages = 63 pages <= 65
  const compliantSlices = paginate(buildMainVolumeFlowBoxes(63), PAGE.contentHeight);
  assert.equal(compliantSlices.length, 63);
  assert.ok(compliantSlices.length <= MAIN_PAGE_LIMIT);
  assert.equal(folio('cover', 1), '');
  assert.equal(folio('front', 1), 'I');
  assert.equal(folio('front', 2), 'II');
  assert.equal(folio('body', 60), '60');

  // 2. Breaching main volume: 1 cover + 2 front-matter + 66 body pages = 69 pages > MAIN_PAGE_LIMIT (65)
  const breachingSlices = paginate(buildMainVolumeFlowBoxes(69), PAGE.contentHeight);
  assert.equal(breachingSlices.length, 69);
  assert.ok(
    breachingSlices.length > MAIN_PAGE_LIMIT,
    `Expected 69-page main volume to exceed MAIN_PAGE_LIMIT=${MAIN_PAGE_LIMIT}`,
  );

  // Appendices are separated into the standalone appendix volume so they do not breach the 65-page main limit
  assert.equal(reportPart('附录1 调查问卷'), 'appendix');
  assert.equal(outlineKind('附录1 调查问卷'), 'back');
  assert.equal(reportExportOptions(DEFAULT_REPORT_OPTIONS, 'main').part, 'main');
  assert.equal(reportExportOptions(DEFAULT_REPORT_OPTIONS, 'appendix').part, 'appendix');
});

test('integration-safety and research-quality guards prevent cross-project/stale overwrites, unverified citations, and tampered result hashes', async () => {
  const baseIdentity = {
    owner: 'user-alpha',
    epoch: 3,
    thread: 'thread-main',
    project: 'proj-elder-care',
  };
  assert.equal(sameWorkspaceIdentity(baseIdentity, { ...baseIdentity }), true);
  assert.equal(
    sameWorkspaceIdentity({ ...baseIdentity, owner: null }, { ...baseIdentity, owner: null }),
    false,
    'unauthenticated null owner must never match workspace identity',
  );
  for (const mutated of [
    { ...baseIdentity, owner: 'user-beta' },
    { ...baseIdentity, epoch: 4 },
    { ...baseIdentity, thread: 'thread-other' },
    { ...baseIdentity, project: 'proj-other' },
  ]) {
    assert.equal(sameWorkspaceIdentity(baseIdentity, mutated), false);
  }

  const pubState = {
    ...baseIdentity,
    sourceKey: 'sec-4:v2',
    previewKey: 'cand-9',
    pending: false,
  };
  assert.equal(canPublishStudioResult(pubState, { ...pubState }), true);
  assert.equal(canPublishStudioResult(pubState, { ...pubState, pending: true }), false);
  assert.equal(canPublishStudioResult({ ...pubState, pending: true }, pubState), false);
  assert.equal(canPublishStudioResult(pubState, { ...pubState, sourceKey: 'sec-4:v3' }), false);
  assert.equal(canPublishStudioResult(pubState, { ...pubState, previewKey: 'cand-10' }), false);

  // citationEvidenceReady: requires checked=true, valid 4-digit year, non-empty locator, and clean http/https URL without credentials
  const validCitation = {
    title: '中国城市社区养老服务可及性实证研究',
    authors: '李明, 陈静',
    year: '2025',
    source: '中国人口科学',
    url: 'https://example.org/papers/elder-care-2025',
    locator: '第 34 页第 2 段',
    checked: true,
  };
  assert.equal(citationEvidenceReady(validCitation), true);
  assert.equal(citationEvidenceReady({ ...validCitation, checked: false }), false);
  assert.equal(citationEvidenceReady({ ...validCitation, locator: '   ' }), false);
  assert.equal(citationEvidenceReady({ ...validCitation, year: '25' }), false);
  assert.equal(citationEvidenceReady({ ...validCitation, url: 'javascript:alert(1)' }), false);
  assert.equal(citationEvidenceReady({ ...validCitation, url: 'file:///etc/passwd' }), false);
  assert.equal(
    citationEvidenceReady({ ...validCitation, url: 'https://user:secret@example.org/paper' }),
    false,
  );

  // research-quality tamper & correlation-chart misuse guards
  assert.deepEqual(QUALITY_LIMITS, { results: 120, findings: 40 });
  const corrResult = await snapshotRecipe(
    {
      method: 'spearman',
      interpretation: '秩相关检验',
      n: 260,
      total: 260,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      headers: ['指标', '数值'],
      rows: [
        ['ρ', 0.54],
        ['p', 0.0002],
      ],
      metrics: [{ label: 'ρ', value: 0.54 }],
      warnings: [],
    },
    {
      title: '满意度秩相关',
      sourceName: '调查库',
      sourceUrl: 'https://example.org/data',
      sourceHash: 'e'.repeat(64),
      classification: 'user_provided',
    },
    'res-spearman',
  );

  const quality = parseResearchQuality({ version: 1, results: [corrResult], findings: [] });
  const confirmed = confirmFinding(
    {
      ...defaultFinding(corrResult),
      question: '可达性与满意度是否正相关？',
      interpretation: '呈中等强度正相关。',
      alternatives: '受年龄混杂影响。',
      action: '优先加密老旧小区助餐网点。',
    },
    quality,
  );
  quality.findings.push(confirmed);
  await verifyResearchQuality(quality);
  assert.equal(findingNeedsReview(confirmed, quality), false);

  // Mutating a result row invalidates verifyResearchQuality, and rehashing marks prior confirmed finding as needing review
  const tamperedQuality = structuredClone(quality);
  tamperedQuality.results[0].rows[0][1] = 0.99;
  await assert.rejects(
    verifyResearchQuality(tamperedQuality),
    err => {
      assert.ok(err instanceof Error);
      assertUserVisibleHygiene(err.message, 'verifyResearchQuality-tamper-error');
      return true;
    },
  );

  const updatedResult = await snapshotRecipe(
    {
      method: 'spearman',
      interpretation: '重算后的秩相关检验',
      n: 265,
      total: 265,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      headers: ['指标', '数值'],
      rows: [
        ['ρ', 0.51],
        ['p', 0.0003],
      ],
      metrics: [{ label: 'ρ', value: 0.51 }],
      warnings: [],
    },
    {
      title: '满意度秩相关',
      sourceName: '调查库',
      sourceUrl: 'https://example.org/data',
      sourceHash: 'e'.repeat(64),
      classification: 'user_provided',
    },
    'res-spearman',
  );
  assert.equal(
    findingNeedsReview(confirmed, { version: 1, results: [updatedResult], findings: [confirmed] }),
    true,
  );

  assert.throws(
    () => chartData(corrResult, 1),
    err => {
      assert.ok(err instanceof Error);
      assertUserVisibleHygiene(err.message, 'chartData-correlation-guard');
      return true;
    },
  );
  assert.equal(makeSlideObject('text', { text: '匿名答辩要点' }).kind, 'text');
});

test('100% of benchmarkReport checks, dimension labels, and fix prompts across blank, skeleton, defective, and complete states uphold strict string hygiene', () => {
  const structuredRef = {
    ...emptyReference('J'),
    id: 'ref-1',
    authors: ['周楠'],
    title: '分层抽样调查方法实务',
    source: '统计与信息论坛',
    year: '2025',
    volume: '40',
    issue: '3',
    pages: '18-29',
    verification: 'verified',
  };

  const corpusStates = [
    ['blank', createEditorContent()],
    ['skeleton', newProjectReport('社区公共服务调查')],
    [
      'referenced-draft',
      parseEditorContent({
        ...createEditorContent(),
        references: [structuredRef, { ...structuredRef, id: 'ref-2', verification: 'rejected' }],
        report: [
          makeSection(
            's1',
            '一、引言与分析',
            '前期文献讨论了分层指标[[引:ref-1]][[引:ref-2]]。相关性导致满意度变化，且 OR 为 2.1 说明概率是 2.1 倍。',
          ),
        ],
      }),
    ],
  ];

  for (const [stateName, doc] of corpusStates) {
    const result = benchmarkReport(doc);
    for (const dim of result.dimensions) {
      assertUserVisibleHygiene(dim.label, `${stateName}:dimension:${dim.id}`);
    }
    for (const check of result.checks) {
      assertUserVisibleHygiene(check.label, `${stateName}:check:${check.id}:label`);
      assertUserVisibleHygiene(check.detail, `${stateName}:check:${check.id}:detail`);
      for (const [fIdx, fix] of check.fixes.entries()) {
        assertUserVisibleHygiene(fix.label, `${stateName}:check:${check.id}:fix[${fIdx}]`);
      }
    }
    for (const advisor of ADVISORS) {
      const reading = advisorReading(advisor, result);
      for (const issue of reading.issues) {
        assertUserVisibleHygiene(issue.detail, `${stateName}:advisor:${advisor.id}:${issue.id}`);
      }
    }
  }
});
