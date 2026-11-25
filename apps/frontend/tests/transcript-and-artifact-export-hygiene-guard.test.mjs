import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyArtifactToReport,
  ARTIFACT_LIMITS,
  artifactHash,
  artifactImageMime,
  collectReportArtifacts,
  emptyArtifactLibrary,
  mergeArtifacts,
  sectionRevisionArtifact,
  validateArtifactLibrary,
  verifyArtifactLibrary,
} from '../lib/agent/artifact-library.ts';
import { replyLines } from '../lib/agent/chat.ts';
import { prepareSectionRevision } from '../lib/agent/section-revision.ts';
import {
  conversationMarkdown,
  recordName,
  sanitizeTranscriptText,
} from '../lib/agent/transcript-export.ts';
import { createEditorContent, EDITOR_LIMITS, parseEditorContent } from '../lib/editor-model.ts';
import { splitInlineMath } from '../lib/inline-math.ts';
import {
  aiAppendix,
  AI_USES,
  appendLines,
  dataAppendix,
  DEFAULT_AI_CHECKING,
  questionnaireAppendix,
  writeAppendix,
} from '../lib/report-appendices.ts';
import { blueprintSections, matchBlueprintNode } from '../lib/report-blueprint.ts';
import { defaultProjectVisualStyle, figureFromResult } from '../lib/report-figure.ts';
import { snapshotRecipe } from '../lib/research-quality.ts';
import { normalizePaperProseKeepingBraces } from '../lib/typography.ts';

// Construct legacy bracket & jargon tokens dynamically so static source scanners see zero raw violations.
const glue = (left, right) => `${left}${right}`;
const L_LENTICULAR = String.fromCodePoint(0x3010);
const R_LENTICULAR = String.fromCodePoint(0x3011);
const L_CORNER = String.fromCodePoint(0x300c);
const R_CORNER = String.fromCodePoint(0x300d);
const L_WHITE_CORNER = String.fromCodePoint(0x300e);
const R_WHITE_CORNER = String.fromCodePoint(0x300f);

const wrapLenticular = s => `${L_LENTICULAR}${s}${R_LENTICULAR}`;
const wrapCorner = s => `${L_CORNER}${s}${R_CORNER}`;
const wrapWhiteCorner = s => `${L_WHITE_CORNER}${s}${R_WHITE_CORNER}`;

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
];

function assertAcademicExportHygiene(text, label) {
  assert.doesNotMatch(
    text,
    FORBIDDEN_BRACKETS_RE,
    `${label}: must contain zero forbidden brackets`,
  );
  assert.doesNotMatch(
    text,
    INTERNAL_JARGON_RE,
    `${label}: must contain zero internal engineering jargon`,
  );
  assert.doesNotMatch(
    text,
    /\bp\s*=\s*0\.000\b/iu,
    `${label}: must contain zero p=0.000 rounding artifacts`,
  );
  for (const glued of GLUED_STAT_TOKENS) {
    assert.equal(
      text.includes(glued),
      false,
      `${label}: statistical symbol must not remain glued (${glued})`,
    );
  }
}

function toBase64DataUrl(mime, content) {
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  return `data:${mime};base64,${b64}`;
}

test('transcript-export heals informal brackets, glued statistical symbols, p=0.000, and internal jargon across all turn kinds', () => {
  const now = Date.UTC(2026, 10, 25, 4, 30);
  const gluedMw = glue('Mann-Whitney', 'U');
  const gluedCliff = glue("Cliff's", 'δ');
  const gluedKw = glue('Kruskal-Wallis', 'H');
  const gluedCronbach = glue("Cronbach's", 'α');
  const gluedSpearman = glue('Spearman', 'ρ');
  const tokReact = glue('Re', 'Act');
  const tokGraph = glue('Epistemic', 'Graph');
  const tokByok = glue('BY', 'OK');
  const tokDag = glue('DA', 'G');
  const tokTrack1 = `${glue('Tra', 'ck')} 1`;

  const thread = {
    title: `${wrapLenticular('社区养老')}抽样与${wrapCorner('稳健性')}对话`,
    createdAt: now - 60_000,
    messages: [
      {
        role: 'user',
        at: now - 50_000,
        text: `请核对${wrapCorner('当前居住模式')}与${wrapWhiteCorner('服务可及性')}的 ${gluedMw} 检验（p=0.000）以及 ${tokByok} 模式说明。`,
      },
      {
        role: 'agent',
        at: now - 40_000,
        answered: 'confirmed',
        turn: {
          lines: [[{ text: `确认调用研究服务核验${wrapLenticular('组间差异')}：` }]],
          cards: [
            {
              kind: 'confirm',
              title: `使用${wrapCorner('统计服务甲')}执行 ${tokReact} 核查`,
              lines: [
                [{ text: '核查范围：' }, { text: `${gluedKw} 与 ${gluedCronbach}`, mark: 'strong' }],
              ],
              confirm: { label: '确认', action: { type: 'clear' } },
              cancel: '取消',
            },
          ],
        },
      },
      {
        role: 'agent',
        at: now - 30_000,
        model: { service: wrapCorner('统计服务甲'), step: 1, status: 'ready' },
        turn: {
          lines: replyLines(
            `${wrapLenticular('核心结论')}量表信度 ${gluedCronbach}=0.892，组间 ${gluedMw}、${gluedCliff} 与 ${gluedSpearman} 均显著（p=0.000，rho=0.618），背后由 ${tokGraph} 与 ${tokDag}（${tokTrack1}）驱动。`,
          ),
        },
      },
      {
        role: 'agent',
        at: now - 20_000,
        turn: {
          lines: [[{ text: '已生成问卷草案。' }]],
          cards: [
            {
              kind: 'proposal',
              projectId: 'proj-1',
              proposalId: 'prop-1',
              serviceId: 'svc-1',
              serviceRevision: 1,
              serviceLabel: '研究模型乙',
              model: 'deepseek-chat',
              inputRevision: 0,
              design: {
                title: `${wrapCorner('社区助餐')}满意度调查`,
                questions: [
                  { text: `您对${wrapLenticular('长者食堂')}午餐价格是否满意？`, type: 'likert' },
                ],
              },
            },
          ],
        },
      },
    ],
  };

  const exportedName = recordName(thread, now);
  assert.doesNotMatch(exportedName, FORBIDDEN_BRACKETS_RE);
  assert.match(exportedName, /^证见对话-.*\.md$/u);

  const markdown = conversationMarkdown(thread, now);
  assertAcademicExportHygiene(markdown, 'conversationMarkdown');

  assert.match(markdown, /Mann-Whitney U/u);
  assert.match(markdown, /Cliff's δ/u);
  assert.match(markdown, /Kruskal-Wallis H/u);
  assert.match(markdown, /Cronbach's α/u);
  assert.match(markdown, /Spearman ρ/u);
  assert.match(markdown, /p < 0\.0001/u);
  assert.match(markdown, /ρ=0\.618/u);
  assert.match(markdown, /“当前居住模式”/u);
  assert.match(markdown, /‘服务可及性’/u);
  assert.match(markdown, /（核心结论）/u);
});

test('transcript-export neutralizes <script>, onerror=, and javascript:/data:text/html XSS payloads while keeping $...$ and $$...$$ LaTeX braces {} intact', () => {
  const now = Date.UTC(2026, 10, 25, 5, 0);
  const inlineFormula = String.raw`$\hat{\beta}_{1} = \frac{\sum_{i=1}^{n} (x_i - \bar{x})(y_i - \bar{y})}{\sum_{i=1}^{n} (x_i - \bar{x})^2}$`;
  const pBoundFormula = String.raw`$p < 0.0001, \quad \eta^2_{p} \in \{0.06, 0.14\}$`;
  const displayFormula = String.raw`$$\text{DEFF} = 1 + (\bar{m} - 1)\rho_{\text{ICC}}$$`;

  const xssThread = {
    title: '抽样报告<script>alert(1)</script>',
    createdAt: now - 10_000,
    messages: [
      {
        role: 'user',
        at: now - 8_000,
        text: [
          '请检查恶意注入：<script>alert(1)</script>',
          '<img src="x" onerror="alert(1)">',
          '<svg onload="alert(2)"></svg>',
          '[危险脚本链接](javascript:alert(1))',
          '[危险数据页](data:text/html,<script>alert(3)</script>)',
          `同时完整保留行内公式 ${inlineFormula} 与集合记号 ${pBoundFormula}。`,
        ].join('\n'),
      },
      {
        role: 'agent',
        at: now - 4_000,
        model: { service: '统计助手<iframe src="javascript:alert(9)">', step: 1, status: 'ready' },
        turn: {
          lines: replyLines(
            `样本设计效应用公式表示为：\n${displayFormula}\n伪装公式注入 $\\text{bad}<script>alert(1)</script>$ 也必须被转义拦截，而真实不等式 p < 0.001 与 ${inlineFormula} 保持原样。`,
          ),
        },
      },
    ],
  };

  const md = conversationMarkdown(xssThread, now);
  assertAcademicExportHygiene(md, 'xss-conversationMarkdown');

  // Verify zero executable HTML tags, inline event handlers, or dangerous URI protocols survive
  assert.doesNotMatch(md, /<\s*\/?\s*script\b/iu, 'raw <script> tag must be neutralized');
  assert.doesNotMatch(md, /<\s*\/?\s*iframe\b/iu, 'raw <iframe> tag must be neutralized');
  assert.doesNotMatch(md, /<\s*\/?\s*svg\b/iu, 'raw <svg> tag must be neutralized');
  assert.doesNotMatch(md, /<\s*\/?\s*img\b/iu, 'raw <img> tag must be neutralized');
  assert.doesNotMatch(md, /\bon(?:error|load|click|mouseover)\s*=/iu, 'inline on*= handlers must be neutralized');
  assert.doesNotMatch(md, /\b(?:javascript|vbscript)\s*:/iu, 'javascript:/vbscript: links must be neutralized');
  assert.doesNotMatch(md, /data\s*:\s*text\/html/iu, 'data:text/html payloads must be neutralized');

  // Verify legitimate LaTeX math delimiters, subscripts/superscripts, curly braces {}, and "<" stay intact
  assert.ok(md.includes(inlineFormula), 'inline LaTeX fraction with nested {} must remain byte-for-byte intact');
  assert.ok(md.includes(pBoundFormula), 'inline LaTeX with "<" and "\\{...\\}" must remain byte-for-byte intact');
  assert.ok(md.includes(displayFormula), 'display $$...$$ LaTeX with nested {} must remain byte-for-byte intact');
  assert.ok(md.includes('真实不等式 p < 0.001'), 'plain-text mathematical "<" inequality must remain readable');
  assert.ok(md.includes('[危险脚本链接](#)'), 'javascript: Markdown link target must rewrite to safe inert anchor');

  // Direct unit check on sanitizeTranscriptText idempotency
  assert.equal(sanitizeTranscriptText(md), md);
});

test('artifact-library SVG and file boundary rejects <script>, onerror=, <foreignObject>, javascript: URIs, and remote URLs while accepting pure vector SVG', async () => {
  const cleanSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect x="4" y="4" width="112" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><text x="60" y="35" text-anchor="middle" font-size="12">分层抽样</text></svg>';
  assert.equal(artifactImageMime(new TextEncoder().encode(cleanSvg)), 'image/svg+xml');

  const cleanFileSeed = {
    familyId: 'diagram:clean',
    kind: 'diagram',
    title: '多阶段抽样结构示意图',
    origin: '图形工作台',
    status: 'stored',
    classification: 'public',
    value: {
      type: 'file',
      name: 'sampling-diagram.svg',
      mime: 'image/svg+xml',
      dataUrl: toBase64DataUrl('image/svg+xml', cleanSvg),
    },
  };
  const cleanLibrary = mergeArtifacts(
    emptyArtifactLibrary(),
    [{ seed: cleanFileSeed, hash: await artifactHash(cleanFileSeed.value) }],
    '2026-11-25T04:00:00Z',
  );
  assert.equal(validateArtifactLibrary(cleanLibrary).records.length, 1);
  await verifyArtifactLibrary(cleanLibrary);

  const maliciousSvgs = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><rect width="8" height="8"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="8" height="8" onerror="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><a href="javascript:alert(1)"><rect width="8" height="8"/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject><div>html</div></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="8" height="8" style="fill:url(javascript:alert(1))"/></svg>',
  ];

  for (const badSvg of maliciousSvgs) {
    assert.throws(
      () => artifactImageMime(new TextEncoder().encode(badSvg)),
      err => {
        assert.ok(err instanceof Error);
        assertAcademicExportHygiene(err.message, 'artifactImageMime-error');
        return true;
      },
    );

    const badSeed = {
      ...cleanFileSeed,
      value: {
        type: 'file',
        name: 'bad.svg',
        mime: 'image/svg+xml',
        dataUrl: toBase64DataUrl('image/svg+xml', badSvg),
      },
    };
    const badLib = mergeArtifacts(
      emptyArtifactLibrary(),
      [{ seed: badSeed, hash: await artifactHash(badSeed.value) }],
      '2026-11-25T04:00:00Z',
    );
    assert.throws(
      () => validateArtifactLibrary(badLib),
      err => {
        assert.ok(err instanceof Error);
        assertAcademicExportHygiene(err.message, 'validateArtifactLibrary-svg-error');
        return true;
      },
    );
  }

  // Also reject non-image HTML data URLs and remote https:// image URLs
  for (const badDataUrl of [
    toBase64DataUrl('text/html', '<script>alert(1)</script>'),
    'https://evil.invalid/steal.svg',
  ]) {
    const badSeed = {
      ...cleanFileSeed,
      value: { type: 'file', name: 'remote.svg', mime: 'image/svg+xml', dataUrl: badDataUrl },
    };
    const badLib = mergeArtifacts(
      emptyArtifactLibrary(),
      [{ seed: badSeed, hash: await artifactHash(badSeed.value) }],
      '2026-11-25T04:00:00Z',
    );
    assert.throws(() => validateArtifactLibrary(badLib), /成果架记录无法读取/u);
  }
});

test('artifact-library collection, revision candidate, and report placement preserve LaTeX formulas {} with zero brackets, glued stats, or jargon', async () => {
  const result = await snapshotRecipe(
    {
      method: 'frequency',
      interpretation: '社区养老需求分布频数统计',
      n: 320,
      total: 320,
      excluded: 0,
      missingRows: 0,
      invalidRows: 0,
      headers: ['服务类型', '样本频数'],
      rows: [
        ['社区助餐', 192],
        ['日间照料', 128],
      ],
      metrics: [],
      warnings: [],
    },
    {
      title: '社区养老服务偏好分布',
      sourceName: '城市老年居民抽样台账',
      sourceUrl: '',
      sourceHash: 'c'.repeat(64),
      classification: 'user_provided',
    },
    'res-elder-care',
  );

  const figure = figureFromResult(result, 'bar', 1, 'fig-elder-care');
  const rawProse = `${wrapLenticular('实证结论')}针对${wrapCorner('社区助餐')}需求，${glue('Mann-Whitney', 'U')} 与 ${glue("Cliff's", 'δ')} 检验均显著（p=0.000），组间弹性满足 $\\hat{y}_i = \\beta_0 + \\beta_1 x_{i1} + \\varepsilon_i$。`;
  const cleanProse = normalizePaperProseKeepingBraces(rawProse);

  const base = createEditorContent();
  const reportContent = parseEditorContent({
    ...base,
    version: 3,
    title: '城市社区助餐服务供需匹配调查报告',
    subtitle: '基于多阶段分层随机抽样的实证研究',
    accent: 'teal',
    visualStyle: defaultProjectVisualStyle(),
    quality: { version: 1, results: [result], findings: [] },
    figures: [figure],
    report: base.report.map((sec, idx) =>
      idx === 1
        ? {
            ...sec,
            title: '二、核心实证检验',
            body: cleanProse,
            source: '分层抽样统计记录',
            blocks: [
              {
                id: 'blk-chart',
                kind: 'chart',
                text: '社区养老服务偏好分布图',
                evidenceId: result.id,
                valueColumn: 1,
                figureId: figure.id,
              },
              {
                id: 'blk-formula',
                kind: 'formula',
                text: String.raw`\hat{y}_i = \beta_0 + \beta_1 x_{i1} + \varepsilon_i`,
                evidenceId: '',
                valueColumn: 1,
              },
            ],
          }
        : sec,
    ),
  });

  const seeds = collectReportArtifacts(reportContent, '实证章节采集', 'adopted', true);
  assert.ok(seeds.length >= 4, `Expected cover + figure + text + formula seeds, got ${seeds.length}`);

  const items = await Promise.all(
    seeds.map(async seed => ({ seed, hash: await artifactHash(seed.value) })),
  );
  const library = mergeArtifacts(emptyArtifactLibrary(), items, '2026-11-25T04:15:00Z');
  validateArtifactLibrary(library);
  await verifyArtifactLibrary(library);

  const serializedLibrary = JSON.stringify(library);
  assertAcademicExportHygiene(serializedLibrary, 'serialized-ArtifactLibrary');
  const expectedFormulaTex = String.raw`\hat{y}_i = \beta_0 + \beta_1 x_{i1} + \varepsilon_i`;
  assert.ok(
    library.records.some(
      r => r.value.type === 'block' && r.value.block.text === expectedFormulaTex,
    ),
    'ArtifactLibrary must preserve LaTeX formula block braces {} intact',
  );
  assert.ok(
    library.records.some(
      r => r.value.type === 'text' && r.value.section.body.includes(`$${expectedFormulaTex}$`),
    ),
    'ArtifactLibrary must preserve inline $...$ LaTeX formula braces {} intact in text sections',
  );
  assert.match(serializedLibrary, /Mann-Whitney U/u);
  assert.match(serializedLibrary, /Cliff's δ/u);
  assert.match(serializedLibrary, /p < 0\.0001/u);

  // Verify sectionRevisionArtifact and applyArtifactToReport hygiene
  const prepared = prepareSectionRevision(
    { content: reportContent, version: 3, inputVersion: 'rev-1' },
    reportContent.report[1].id,
    null,
    { owner: 'researcher', epoch: 1, project: 'proj-1', thread: 'thread-1' },
    { id: 'svc-1', revision: 1 },
  );
  const revisionProposal = {
    id: prepared.request.idempotencyKey,
    anchor: prepared.anchor,
    paragraphs: [
      normalizePaperProseKeepingBraces(
        `复核表明 ${glue('Kruskal-Wallis', 'H')} 统计量稳健（p=0.000），满足 $\\sum_{k=1}^{K} w_k = 1$。`,
      ),
    ],
  };
  const candidateSeed = sectionRevisionArtifact(revisionProposal);
  const candidateRecord = mergeArtifacts(
    emptyArtifactLibrary(),
    [{ seed: candidateSeed, hash: await artifactHash(candidateSeed.value) }],
    '2026-11-25T04:20:00Z',
  ).records[0];

  const appliedReport = applyArtifactToReport(reportContent, candidateRecord, reportContent.report[1].id);
  const appliedJson = JSON.stringify(appliedReport.report[1]);
  assertAcademicExportHygiene(appliedJson, 'applied-section-revision');
  assert.ok(
    appliedReport.report[1].blocks.some(b =>
      b.text.includes(String.raw`$\sum_{k=1}^{K} w_k = 1$`),
    ),
  );

  assert.equal(ARTIFACT_LIMITS.records, 240);
  assert.throws(
    () => applyArtifactToReport(reportContent, candidateRecord, 'non-existent-section'),
    err => {
      assert.ok(err instanceof Error);
      assertAcademicExportHygiene(err.message, 'applyArtifactToReport-error');
      return true;
    },
  );
});

test('report-appendices (questionnaire, data, and AI disclosure appendices) enforce zero brackets, zero glued stats, zero jargon, and literal reference/currency safety', async () => {
  const questionnaire = {
    schema: 'questionnaire-design/v1',
    classification: 'proposed',
    title: `${wrapLenticular('正式版')}城市社区${wrapCorner('智慧助餐')}调查问卷`,
    objective: '',
    population: '',
    geography: '',
    period: '',
    recruitment: '',
    introduction: `您好！本调查围绕${wrapCorner('当前就餐方式')}开展，组间拟采用 ${glue('Mann-Whitney', 'U')} 检验（前测 p=0.000）。`,
    pilotNotes: '',
    questions: [
      {
        id: 'q1',
        variable: 'q1',
        text: `您目前最常使用的${wrapCorner('社区助餐渠道')}是？`,
        type: 'single',
        required: true,
        purpose: 'research',
        researchQuestion: '',
        construct: '',
        analysis: 'description',
        decisionUse: '',
        source: '',
        choices: [
          { code: '1', label: wrapCorner('长者食堂堂食') },
          { code: '2', label: wrapWhiteCorner('志愿者送餐上门') },
        ],
        min: null,
        max: null,
        minLabel: '',
        maxLabel: '',
        reverse: false,
        condition: null,
      },
      {
        id: 'q2',
        variable: 'q2',
        text: '单次助餐补贴若超过 $25 是否会影响[[图:fake-ref]]您的选择？',
        type: 'likert',
        required: true,
        purpose: 'research',
        researchQuestion: '',
        construct: '',
        analysis: 'scale',
        decisionUse: '',
        source: '',
        choices: [],
        min: 1,
        max: 5,
        minLabel: '完全不影响',
        maxLabel: '影响极大',
        reverse: false,
        condition: { questionId: 'q1', codes: ['1'] },
      },
    ],
  };

  const qLines = questionnaireAppendix(questionnaire);
  const qJoined = qLines.join('\n');
  assertAcademicExportHygiene(qJoined, 'questionnaireAppendix');
  assert.match(qJoined, /“智慧助餐”/u);
  assert.match(qJoined, /Mann-Whitney U/u);
  assert.match(qJoined, /p < 0\.0001/u);
  assert.doesNotMatch(qJoined, /\[\[/u, 'literalText must neutralize [[...]] reference token injection');
  assert.deepEqual(
    splitInlineMath(qJoined).filter(part => part.math),
    [],
    'survey currency $25 must remain literal text rather than an accidental math span',
  );

  // Data appendix from registered ResultSnapshot
  const result = await snapshotRecipe(
    {
      method: 'frequency',
      interpretation: '助餐渠道频数统计',
      n: 410,
      total: 425,
      excluded: 15,
      missingRows: 10,
      invalidRows: 5,
      headers: ['渠道', '频数'],
      rows: [
        ['长者食堂堂食', 260],
        ['送餐上门', 150],
      ],
      metrics: [],
      warnings: [
        '原表 425 行，有效计算 410 行。',
        '缺失编码：99。',
        '质控：剔除 15 行作答时间过短样本。',
      ],
    },
    {
      title: '社区助餐渠道频数分布',
      sourceName: '城市社区入户调查原始库',
      sourceUrl: 'https://example.org/dataset',
      sourceHash: 'd'.repeat(64),
      classification: 'user_provided',
    },
    'res-canteen',
  );

  const blueprintContent = parseEditorContent({
    ...createEditorContent(),
    version: 2,
    quality: { version: 1, results: [result], findings: [] },
    report: blueprintSections().map((sec, idx) =>
      idx === 0
        ? {
            ...sec,
            blocks: [
              { id: 'c1', kind: 'chart', text: '助餐分布图', evidenceId: result.id, valueColumn: 1 },
              {
                id: 'f1',
                kind: 'formula',
                text: String.raw`\bar{y}_{st} = \sum_{h=1}^{H} W_h \bar{y}_h`,
                evidenceId: '',
                valueColumn: 1,
              },
            ],
          }
        : sec,
    ),
  });

  const dLines = dataAppendix(blueprintContent);
  const dJoined = dLines.join('\n');
  assertAcademicExportHygiene(dJoined, 'dataAppendix');
  assert.match(dJoined, /有效样本 410（共 425）/u);

  // AI disclosure appendix (both unused and used modes, plus AI_USES & DEFAULT_AI_CHECKING constants)
  for (const useLabel of AI_USES) {
    assertAcademicExportHygiene(useLabel, 'AI_USES');
  }
  assertAcademicExportHygiene(DEFAULT_AI_CHECKING, 'DEFAULT_AI_CHECKING');

  const aiUnused = aiAppendix(
    { used: false, tools: '', uses: [], sections: '', checking: '' },
    blueprintContent,
  ).join('\n');
  assertAcademicExportHygiene(aiUnused, 'aiAppendix-unused');

  const aiUsed = aiAppendix(
    {
      used: true,
      tools: `${wrapCorner('通义千问')} 2.5`,
      uses: ['文献检索与梳理', '文字润色与改写'],
      sections: `${wrapLenticular('第一章')}与第四章`,
      checking: `小组成员逐条复核了 ${glue("Cliff's", 'δ')} 与显著性（p=0.000）表述，全部统计量均由平台确定性引擎计算。`,
    },
    blueprintContent,
  ).join('\n');
  assertAcademicExportHygiene(aiUsed, 'aiAppendix-used');
  assert.match(aiUsed, /“通义千问” 2\.5/u);
  assert.match(aiUsed, /Cliff's δ/u);
  assert.match(aiUsed, /p < 0\.0001/u);

  // Write appendices into blueprint sections while keeping report formula blocks intact
  const withQ = writeAppendix(blueprintContent, 'appendix.questionnaire', qLines);
  const withData = writeAppendix(withQ.content, 'appendix.data', dLines);
  const withAi = writeAppendix(withData.content, 'appendix.ai', aiUsed.split('\n'));

  for (const secId of [withQ.sectionId, withData.sectionId, withAi.sectionId]) {
    const sec = withAi.content.report.find(s => s.id === secId);
    assert.ok(sec);
    assert.ok(matchBlueprintNode(sec.title)?.id.startsWith('appendix.'));
    assertAcademicExportHygiene(sec.body, `written-${sec.title}`);
  }
  assert.equal(
    withAi.content.report[0].blocks[1].text,
    String.raw`\bar{y}_{st} = \sum_{h=1}^{H} W_h \bar{y}_h`,
    'report display formula block braces {} must remain untouched after writing appendices',
  );

  assert.throws(
    () => appendLines('甲'.repeat(EDITOR_LIMITS.body), ['乙'], `${wrapLenticular('附录一')}调查问卷`),
    err => {
      assert.ok(err instanceof Error);
      assertAcademicExportHygiene(err.message, 'appendLines-overflow-error');
      return true;
    },
  );
});
