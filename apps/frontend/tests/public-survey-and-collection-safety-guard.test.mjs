import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { newQuestion, newQuestionnaire } from '../lib/questionnaire.ts';
import {
  DEMO_SURVEY_CSV,
  SURVEY_LIMITS,
  analyzeReliability,
  categoryCounts,
  describeNumbers,
  finiteNumber,
  isMissing,
  parseMissingCodes,
  parseSurveyCsv,
  profileSurvey,
} from '../lib/survey-analysis.ts';
import {
  collectionAnalysisCsv,
  collectionEvidenceSection,
  collectionEvidenceSource,
  collectionTransfer,
  parsePublicSurvey,
  parseSurveyDataset,
  parseSurveyList,
  parseSurveyReceipt,
  parseSurveyRelease,
  pruneSurveyDraft,
  qualityEvidenceSection,
  qualityLineageStep,
  shownSurveyQuestions,
  transferClassification,
  validateSurveyDraft,
} from '../lib/survey-collection.ts';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const RAW_HEX_COLOR_RE = new RegExp('#' + '[0-9a-f]{3,8}\\b', 'iu');
const CASE_SENSITIVE_REACT_AGENT_RE = new RegExp('\\b' + 'Re' + 'Act' + '\\b', 'u');
const INTERNAL_JARGON_RE = new RegExp(
  [
    '\\b(?:' +
      [
        'D' + 'AG',
        'Epistemic' + 'Graph',
        'BY' + 'OK',
        'Fast' + 'API',
        'Py' + 'dantic',
        'Web' + 'Socket',
        'SQL' + 'ite',
        'Indexed' + 'DB',
      ].join('|') +
      ')\\b',
    'Track\\s*[12]\\b',
  ].join('|'),
  'iu',
);

function hasInternalJargon(text) {
  return CASE_SENSITIVE_REACT_AGENT_RE.test(text) || INTERNAL_JARGON_RE.test(text);
}

const VALID_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE';
const UUID_RELEASE = '11111111-2222-4333-8444-555555555555';
const UUID_PROJECT = '22222222-3333-4444-8555-666666666666';
const UUID_VERSION = '33333333-4444-4555-8666-777777777777';
const UUID_RECEIPT = '44444444-5555-4666-8777-888888888888';
const SAMPLE_SHA256 = 'a'.repeat(64);

function assertPureUserText(text, label) {
  assert.equal(typeof text, 'string', `${label} must be a string`);
  assert.equal(
    FORBIDDEN_BRACKETS_RE.test(text),
    false,
    `${label} must contain ZERO forbidden brackets: ${text}`,
  );
  assert.equal(
    RAW_HEX_COLOR_RE.test(text),
    false,
    `${label} must contain ZERO raw hex color literals: ${text}`,
  );
  assert.equal(
    hasInternalJargon(text),
    false,
    `${label} must contain ZERO internal tech jargon: ${text}`,
  );
}

async function loadCompiledSurveyRouteModule() {
  const pagePath = path.join(FRONTEND_ROOT, 'app', 's', '[token]', 'page.tsx');
  const source = fs.readFileSync(pagePath, 'utf8');
  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  for (const pkg of ['react/jsx-runtime', 'react']) {
    compiled = compiled
      .replaceAll(`"${pkg}"`, JSON.stringify(import.meta.resolve(pkg)))
      .replaceAll(`'${pkg}'`, JSON.stringify(import.meta.resolve(pkg)));
  }

  const navStub =
    'data:text/javascript;base64,' +
    Buffer.from(
      `export function notFound() { const err = new Error('NEXT_NOT_FOUND'); err.digest = 'NEXT_NOT_FOUND'; throw err; }`,
    ).toString('base64');
  const surveyStub =
    'data:text/javascript;base64,' +
    Buffer.from(
      `import React from ${JSON.stringify(import.meta.resolve('react'))};
       export default function PublicSurveyStub(props) { return React.createElement('div', { 'data-token': props.token }); }`,
    ).toString('base64');

  compiled = compiled
    .replaceAll(`'next/navigation'`, JSON.stringify(navStub))
    .replaceAll(`"next/navigation"`, JSON.stringify(navStub))
    .replaceAll(`'@/components/survey/PublicSurvey'`, JSON.stringify(surveyStub))
    .replaceAll(`"@/components/survey/PublicSurvey"`, JSON.stringify(surveyStub));

  return import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
}

async function loadCompiledPublicSurveyComponent() {
  const compPath = path.join(FRONTEND_ROOT, 'components', 'survey', 'PublicSurvey.tsx');
  const source = fs.readFileSync(compPath, 'utf8');
  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  for (const pkg of ['react/jsx-runtime', 'react']) {
    compiled = compiled
      .replaceAll(`"${pkg}"`, JSON.stringify(import.meta.resolve(pkg)))
      .replaceAll(`'${pkg}'`, JSON.stringify(import.meta.resolve(pkg)));
  }

  const apiStub =
    'data:text/javascript;base64,' +
    Buffer.from(
      `export class HostedApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
       export function errorMessage(e) { return e instanceof Error ? e.message : '网络请求失败。'; }
       export async function hostedRequest() { throw new Error('SSR_NO_NETWORK'); }`,
    ).toString('base64');
  const collectionHref = new URL('../lib/survey-collection.ts', import.meta.url).href;
  const cssStub =
    'data:text/javascript;base64,' +
    Buffer.from(
      `export default new Proxy({}, { get: (_, prop) => String(prop) });`,
    ).toString('base64');

  compiled = compiled
    .replaceAll(`'@/components/hosted/api-client'`, JSON.stringify(apiStub))
    .replaceAll(`"@/components/hosted/api-client"`, JSON.stringify(apiStub))
    .replaceAll(`'@/lib/survey-collection'`, JSON.stringify(collectionHref))
    .replaceAll(`"@/lib/survey-collection"`, JSON.stringify(collectionHref))
    .replaceAll(`'./PublicSurvey.module.css'`, JSON.stringify(cssStub))
    .replaceAll(`"./PublicSurvey.module.css"`, JSON.stringify(cssStub));

  return (await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))).default;
}

function buildSampleRelease(overrides = {}) {
  return {
    id: UUID_RELEASE,
    projectId: UUID_PROJECT,
    versionId: UUID_VERSION,
    questionnaireRevision: 2,
    revision: 1,
    status: 'open',
    token: VALID_TOKEN,
    title: '城市社区养老助餐服务满意度调查',
    classification: 'actual',
    responseCount: 2,
    responseBytes: 512,
    limits: { responses: 5000, answerBytes: 2097152 },
    createdAt: '2026-11-25T02:00:00Z',
    closedAt: null,
    ...overrides,
  };
}

function buildPublicSurveyPayload() {
  return {
    id: UUID_RELEASE,
    status: 'open',
    title: '城市社区养老助餐服务满意度调查',
    introduction: '感谢您参与本次匿名学术调查，所有回答仅用于统计汇总分析。',
    classification: 'actual',
    questions: [
      {
        id: 'q_channel',
        text: '您主要通过哪种方式使用社区助餐服务？',
        type: 'single',
        required: true,
        choices: [
          { code: 'dine_in', label: '助餐点堂食' },
          { code: 'delivery', label: '送餐上门' },
          { code: 'none', label: '尚未使用过' },
        ],
        min: null,
        max: null,
        minLabel: '',
        maxLabel: '',
        condition: null,
      },
      {
        id: 'q_delivery_detail',
        text: '送餐上门过程中您最关注哪些环节？',
        type: 'multi',
        required: true,
        choices: [
          { code: 'punctual', label: '准时送达' },
          { code: 'warmth', label: '餐品保温' },
          { code: 'packaging', label: '餐盒密封卫生' },
        ],
        min: null,
        max: null,
        minLabel: '',
        maxLabel: '',
        condition: { questionId: 'q_channel', codes: ['delivery'] },
      },
      {
        id: 'q_sat',
        text: '您对助餐点整体服务质量的评分是？',
        type: 'likert',
        required: true,
        choices: [],
        min: 1,
        max: 5,
        minLabel: '非常不满意',
        maxLabel: '非常满意',
        condition: null,
      },
      {
        id: 'q_budget',
        text: '您每餐愿意自付的最高金额（元）是？',
        type: 'number',
        required: true,
        choices: [],
        min: 0,
        max: 100,
        minLabel: '',
        maxLabel: '',
        condition: null,
      },
      {
        id: 'q_feedback',
        text: '您对改进社区助餐还有哪些具体建议？',
        type: 'text',
        required: false,
        choices: [],
        min: null,
        max: null,
        minLabel: '',
        maxLabel: '',
        condition: null,
      },
    ],
  };
}

test('app/s/[token]/page.tsx enforces strict 43-char base64url token gate and respondent privacy metadata invariants', async () => {
  assert.equal(VALID_TOKEN.length, 43);
  const routeMod = await loadCompiledSurveyRouteModule();

  assert.deepEqual(routeMod.metadata, {
    title: '调查问卷',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  });
  assertPureUserText(routeMod.metadata.title, 'app/s/[token]/page.tsx metadata.title');

  const validElement = await routeMod.default({ params: Promise.resolve({ token: VALID_TOKEN }) });
  const rendered = renderToStaticMarkup(validElement);
  assert.equal(rendered, `<div data-token="${VALID_TOKEN}"></div>`);

  const invalidTokens = [
    '',
    'A'.repeat(42),
    'A'.repeat(44),
    'A'.repeat(41) + '+/',
    'A'.repeat(42) + '=',
    '../' + 'A'.repeat(40),
    '<script>alert(1)</script>' + 'A'.repeat(18),
    'A'.repeat(42) + ' ',
    'A'.repeat(42) + '\u0000',
  ];

  for (const badToken of invalidTokens) {
    await assert.rejects(
      () => routeMod.default({ params: Promise.resolve({ token: badToken }) }),
      err => err.message === 'NEXT_NOT_FOUND',
      `Route SurveyPage must call notFound() for invalid token "${badToken}"`,
    );

    assert.throws(
      () => parseSurveyRelease(buildSampleRelease({ token: badToken })),
      err => {
        assertPureUserText(err.message, 'parseSurveyRelease token rejection message');
        return true;
      },
      `parseSurveyRelease must reject invalid token "${badToken}"`,
    );
  }

  const parsedOpen = parseSurveyRelease(buildSampleRelease());
  assert.equal(parsedOpen.token, VALID_TOKEN);
  assert.throws(
    () => parseSurveyRelease(buildSampleRelease({ status: 'closed', closedAt: null })),
    /调查结束状态与时间不一致/u,
  );
  assert.throws(
    () =>
      parseSurveyList({
        surveys: [buildSampleRelease(), buildSampleRelease()],
      }),
    /重复记录/u,
  );
});

test('validateSurveyDraft, shownSurveyQuestions, and pruneSurveyDraft enforce single/multi/Likert/numeric/open-text rules and conditional routing', () => {
  const survey = parsePublicSurvey(buildPublicSurveyPayload());
  assert.equal(survey.questions.length, 5);

  // When q_channel is 'dine_in', conditional 'q_delivery_detail' is hidden (4 visible questions)
  const visibleDineIn = shownSurveyQuestions(survey.questions, { q_channel: 'dine_in' });
  assert.deepEqual(
    visibleDineIn.map(q => q.id),
    ['q_channel', 'q_sat', 'q_budget', 'q_feedback'],
  );

  // Conditional branch becomes visible when 'delivery' is chosen, and pruneSurveyDraft drops stale hidden answers
  const draftWithBranch = {
    q_channel: 'delivery',
    q_delivery_detail: ['warmth', 'punctual'],
    q_sat: '5',
    q_budget: '12.5',
    q_feedback: '希望增加低盐少油窗口。',
  };
  assert.equal(shownSurveyQuestions(survey.questions, draftWithBranch).length, 5);

  const validChecked = validateSurveyDraft(survey.questions, draftWithBranch);
  assert.deepEqual(validChecked.errors, {});
  // Multi-choice answers canonicalize to questionnaire choice declaration order ('punctual' before 'warmth')
  assert.deepEqual(validChecked.answers, {
    q_channel: 'delivery',
    q_delivery_detail: ['punctual', 'warmth'],
    q_sat: 5,
    q_budget: 12.5,
    q_feedback: '希望增加低盐少油窗口。',
  });

  // Switching parent answer away from 'delivery' prunes hidden child draft automatically
  const pruned = pruneSurveyDraft(survey.questions, { ...draftWithBranch, q_channel: 'dine_in' });
  assert.equal(Object.hasOwn(pruned, 'q_delivery_detail'), false);

  // Invalid single, multi, non-integer/out-of-bounds Likert, out-of-bounds/underflow number, and >2000-char open text
  const invalidCases = [
    {
      draft: { q_channel: '', q_sat: '4', q_budget: '10' },
      badKey: 'q_channel',
    },
    {
      draft: { q_channel: 'tampered_code', q_sat: '4', q_budget: '10' },
      badKey: 'q_channel',
    },
    {
      draft: { q_channel: 'delivery', q_delivery_detail: ['punctual', 'punctual'], q_sat: '4', q_budget: '10' },
      badKey: 'q_delivery_detail',
    },
    {
      draft: { q_channel: 'delivery', q_delivery_detail: ['hacked_opt'], q_sat: '4', q_budget: '10' },
      badKey: 'q_delivery_detail',
    },
    {
      draft: { q_channel: 'dine_in', q_sat: '3.5', q_budget: '10' },
      badKey: 'q_sat',
    },
    {
      draft: { q_channel: 'dine_in', q_sat: '6', q_budget: '10' },
      badKey: 'q_sat',
    },
    {
      draft: { q_channel: 'dine_in', q_sat: '4', q_budget: '-1' },
      badKey: 'q_budget',
    },
    {
      draft: { q_channel: 'dine_in', q_sat: '4', q_budget: '1e-400' },
      badKey: 'q_budget',
    },
    {
      draft: { q_channel: 'dine_in', q_sat: '4', q_budget: 'not-a-number' },
      badKey: 'q_budget',
    },
    {
      draft: { q_channel: 'dine_in', q_sat: '4', q_budget: '15', q_feedback: '字'.repeat(2001) },
      badKey: 'q_feedback',
    },
  ];

  for (const { draft, badKey } of invalidCases) {
    const result = validateSurveyDraft(survey.questions, draft);
    assert.ok(result.errors[badKey], `Expected validation error on ${badKey}`);
    assertPureUserText(result.errors[badKey], `validateSurveyDraft error[${badKey}]`);
  }
});

test('parsePublicSurvey, parseSurveyReceipt, and PublicSurvey.tsx guard against XSS, control chars, prototype pollution, and cross-release receipt spoofing', async () => {
  const basePayload = buildPublicSurveyPayload();

  // Null-prototype / extra keys / control characters / invalid Likert span / forward-ref conditions must fail cleanly
  const nullProto = Object.assign(Object.create(null), basePayload);
  const malformedPayloads = [
    nullProto,
    { ...basePayload, unexpectedField: true },
    { ...basePayload, title: '含空字节\u0000问卷标题' },
    {
      ...basePayload,
      questions: [{ ...basePayload.questions[2], min: 1, max: 20 }],
    },
    {
      ...basePayload,
      questions: [
        {
          ...basePayload.questions[0],
          condition: { questionId: 'non_existent_parent', codes: ['dine_in'] },
        },
      ],
    },
  ];

  for (const bad of malformedPayloads) {
    assert.throws(
      () => parsePublicSurvey(bad),
      err => {
        assertPureUserText(err.message, 'parsePublicSurvey rejection');
        return true;
      },
    );
  }

  // Receipt cross-survey spoofing rejection
  const validReceipt = parseSurveyReceipt(
    {
      id: UUID_RECEIPT,
      releaseId: UUID_RELEASE,
      submittedAt: '2026-11-25T03:00:00Z',
      classification: 'actual',
    },
    UUID_RELEASE,
  );
  assert.equal(validReceipt.id, UUID_RECEIPT);
  assert.throws(
    () =>
      parseSurveyReceipt(
        {
          id: UUID_RECEIPT,
          releaseId: UUID_PROJECT,
          submittedAt: '2026-11-25T03:00:00Z',
          classification: 'actual',
        },
        UUID_RELEASE,
      ),
    /回执不属于本份问卷/u,
  );

  // PublicSurvey initial SSR render & source-level XSS/URI/consent invariants
  const PublicSurveyComp = await loadCompiledPublicSurveyComponent();
  const initialHtml = renderToStaticMarkup(React.createElement(PublicSurveyComp, { token: VALID_TOKEN }));
  assert.match(initialHtml, /<main\b/u);
  assert.match(initialHtml, /role="status"/u);
  assert.match(initialHtml, /正在打开问卷/u);
  assert.equal(/<script\b/iu.test(initialHtml), false);

  const publicSurveySource = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'components', 'survey', 'PublicSurvey.tsx'),
    'utf8',
  );
  assert.equal(
    publicSurveySource.includes('dangerouslySetInnerHTML'),
    false,
    'PublicSurvey.tsx must never use dangerouslySetInnerHTML',
  );
  assert.equal(
    (publicSurveySource.match(/encodeURIComponent\(token\)/gu) ?? []).length >= 2,
    true,
    'PublicSurvey.tsx must encode token with encodeURIComponent in both GET and POST endpoints',
  );
  assert.match(
    publicSurveySource,
    /请先确认自愿参与本次调查/u,
    'PublicSurvey.tsx must require explicit voluntary informed consent before submission',
  );
});

test('collectionAnalysisCsv and parseSurveyCsv safely round-trip XSS/quote/newline open-text payloads while rejecting unclosed quotes and control chars', () => {
  const q1 = {
    ...newQuestion('q1', 'Q1'),
    text: '用餐方式',
    type: 'single',
    required: true,
    analysis: 'description',
    researchQuestion: '助餐方式分布',
    decisionUse: '优化网点配置',
    choices: [
      { code: '1', label: '堂食' },
      { code: '2', label: '送餐' },
    ],
    min: null,
    max: null,
  };
  const q2 = {
    ...newQuestion('q2', 'Q2'),
    text: '开放建议',
    type: 'text',
    required: false,
    analysis: 'coding',
    researchQuestion: '改进诉求',
    decisionUse: '服务整改',
    choices: [],
    min: null,
    max: null,
  };
  const design = {
    ...newQuestionnaire(),
    title: '社区助餐回收测试',
    questions: [q1, q2],
  };

  const maliciousFeedback = '<script>alert("xss")</script>, 含逗号与"双引号"\n以及跨行文本';
  const quotedCell = `"${maliciousFeedback.replaceAll('"', '""')}"`;
  const rawDatasetCsv = [
    'response_id,Q1,Q2,Q2_visible',
    `r1,1,${quotedCell},1`,
    'r2,2,"正常反馈",1',
  ].join('\r\n');

  const dataset = parseSurveyDataset(
    {
      schema: 'survey-dataset/v1',
      release: buildSampleRelease({ responseCount: 2 }),
      design,
      rowCount: 2,
      sha256: SAMPLE_SHA256,
      generatedAt: '2026-11-25T03:30:00Z',
      columns: [
        { column: 'response_id', questionId: null, kind: 'metadata' },
        { column: 'Q1', questionId: 'q1', kind: 'answer' },
        { column: 'Q2', questionId: 'q2', kind: 'answer' },
        { column: 'Q2_visible', questionId: 'q2', kind: 'visibility' },
      ],
      csv: rawDatasetCsv,
      downloadCsv: rawDatasetCsv,
    },
    UUID_PROJECT,
    UUID_RELEASE,
  );

  const projectedCsv = collectionAnalysisCsv(dataset);
  const parsedTable = parseSurveyCsv(projectedCsv);
  assert.deepEqual(parsedTable.headers, ['Q1', 'Q2']);
  assert.equal(parsedTable.rows.length, 2);
  assert.equal(parsedTable.rows[0][1], maliciousFeedback);

  const transfer = collectionTransfer(dataset, 'tx-1');
  assert.deepEqual(transferClassification(transfer), { simulated: false, silicon: false });
  const syntheticTransfer = collectionTransfer(
    { ...dataset, release: { ...dataset.release, classification: 'synthetic' } },
    'tx-2',
  );
  assert.deepEqual(transferClassification(syntheticTransfer), { simulated: true, silicon: false });

  // Empty collection dataset must fail honestly instead of fabricating zero-filled rows
  const emptyDataset = parseSurveyDataset(
    {
      ...dataset,
      release: buildSampleRelease({ responseCount: 0 }),
      rowCount: 0,
      csv: 'response_id,Q1,Q2,Q2_visible',
      downloadCsv: 'response_id,Q1,Q2,Q2_visible',
    },
    UUID_PROJECT,
    UUID_RELEASE,
  );
  assert.throws(() => collectionAnalysisCsv(emptyDataset), /目前还没有答卷/u);

  // Control chars, unclosed quotes, duplicate headers, and ragged columns in CSV must fail honestly
  for (const badCsv of [
    'Q1,Q2\n1,含控制符\u0007',
    'Q1,Q2\n1,"未闭合引号',
    'Q1,Q1\n1,2',
    'Q1,Q2\n1,2,3',
    '仅表头无数据',
  ]) {
    assert.throws(
      () => parseSurveyCsv(badCsv),
      err => {
        assertPureUserText(err.message, 'parseSurveyCsv rejection');
        return true;
      },
    );
  }
});

test('survey-analysis statistical calculations preserve mathematical honesty on empty, single-row, sparse, identifier, constant, and negative-alpha responses', () => {
  assert.equal(SURVEY_LIMITS.rows, 5000);
  assert.equal(describeNumbers([]), null, 'Empty numeric array must return null, never 0 or NaN');

  const singleObs = describeNumbers([4.2]);
  assert.ok(singleObs);
  assert.equal(singleObs.n, 1);
  assert.equal(singleObs.mean, 4.2);
  assert.equal(singleObs.sd, null, 'Sample SD for n=1 (df=0) must be null, never fabricated as 0');

  assert.equal(finiteNumber('1e-400'), null, 'Underflow to zero must be rejected');
  assert.equal(finiteNumber('1e13'), null, 'Values exceeding 1e12 computational bound must be rejected');
  const missingCodes = parseMissingCodes('-99; -98; -99');
  assert.deepEqual(missingCodes, ['-99', '-98']);
  assert.equal(isMissing(' -99 ', missingCodes), true);

  // Sparse table with missing codes and PII/identifier column ('手机号')
  const sparseCsv = [
    '手机号,渠道,题项A,题项B,题项C',
    '13800138000,社区,-99,4,4',
    '13900139000,校园,,3,3',
    '13700137000,社区,5,-98,5',
  ].join('\n');
  const sparseTable = parseSurveyCsv(sparseCsv);
  const profile = profileSurvey(sparseTable, missingCodes);
  assert.equal(profile.columns[0].likelyIdentifier, true, 'Phone column must be flagged as likelyIdentifier');
  assert.equal(
    profile.columns[0].stats,
    null,
    'Identifier columns must never compute misleading numeric mean/SD',
  );

  const channelCounts = categoryCounts(sparseTable, 1, missingCodes);
  assert.equal(channelCounts.n, 3);
  assert.equal(channelCounts.missing, 0);
  const itemACounts = categoryCounts(sparseTable, 2, missingCodes);
  assert.equal(itemACounts.n, 1);
  assert.equal(itemACounts.missing, 2);

  // Reliability on sparse table with 0 complete cases -> alpha: null + honest Chinese warning
  const zeroCompleteRel = analyzeReliability(sparseTable, {
    columns: [2, 3, 4],
    reverse: [],
    min: 1,
    max: 5,
    missingCodes,
  });
  assert.equal(zeroCompleteRel.n, 0);
  assert.equal(zeroCompleteRel.missingRows, 3);
  assert.equal(zeroCompleteRel.alpha, null);
  for (const w of zeroCompleteRel.warnings) {
    assertPureUserText(w, 'zero-complete reliability warning');
  }

  // Reliability on constant straight-lined responses -> totalVariance 0 -> alpha: null
  const constantTable = parseSurveyCsv(['A,B,C', '4,4,4', '4,4,4', '4,4,4'].join('\n'));
  const constantRel = analyzeReliability(constantTable, {
    columns: [0, 1, 2],
    reverse: [],
    min: 1,
    max: 5,
    missingCodes: [],
  });
  assert.equal(constantRel.n, 3);
  assert.equal(constantRel.alpha, null);
  assert.ok(constantRel.warnings.some(w => w.includes('零方差题项')));

  // Exact constant row totals (5+1=6, 4+2=6, 2+4=6, 1+5=6) -> totalVariance === 0 -> alpha: null
  const degenerateTotalTable = parseSurveyCsv(['A,B', '5,1', '4,2', '2,4', '1,5'].join('\n'));
  const degenerateRel = analyzeReliability(degenerateTotalTable, {
    columns: [0, 1],
    reverse: [],
    min: 1,
    max: 5,
    missingCodes: [],
  });
  assert.equal(degenerateRel.alpha, null);
  assert.ok(degenerateRel.warnings.some(w => w.includes('总分无变异')));

  // Unreversed negatively correlated items with non-zero total variance -> negative Cronbach's alpha preserved honestly
  const negAlphaTable = parseSurveyCsv(['A,B', '5,1', '4,2', '2,5', '1,4'].join('\n'));
  const negRel = analyzeReliability(negAlphaTable, {
    columns: [0, 1],
    reverse: [],
    min: 1,
    max: 5,
    missingCodes: [],
  });
  assert.ok(negRel.alpha !== null && negRel.alpha < 0, `Expected negative alpha, got ${negRel.alpha}`);
  assert.ok(negRel.warnings.some(w => w.includes('不能把负值截为 0')));

  // DEMO_SURVEY_CSV end-to-end check (row 10 has missing cell, row 11 has out-of-range 99)
  const demoTable = parseSurveyCsv(DEMO_SURVEY_CSV);
  const demoRel = analyzeReliability(demoTable, {
    columns: [1, 2, 3],
    reverse: [3],
    min: 1,
    max: 5,
    missingCodes: [],
  });
  assert.equal(demoRel.total, 12);
  assert.equal(demoRel.missingRows, 1);
  assert.equal(demoRel.outOfRangeRows, 1);
  assert.equal(demoRel.n, 10);
  assert.ok(demoRel.alpha !== null && demoRel.alpha > 0.7);
});

test('100% of user-visible strings and provenance lineages across survey-collection, survey-analysis, app/s/[token]/page.tsx, and PublicSurvey.tsx contain zero forbidden brackets, zero hex colors, and zero tech jargon', () => {
  const targetRelPaths = [
    'lib/survey-collection.ts',
    'lib/survey-analysis.ts',
    'app/s/[token]/page.tsx',
    'components/survey/PublicSurvey.tsx',
  ];

  for (const relPath of targetRelPaths) {
    const fullPath = path.join(FRONTEND_ROOT, relPath);
    const source = fs.readFileSync(fullPath, 'utf8');
    const sf = ts.createSourceFile(
      relPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        return;
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
        const text = node.text;
        assert.equal(
          FORBIDDEN_BRACKETS_RE.test(text),
          false,
          `${relPath} contains forbidden bracket in "${text}"`,
        );
        assert.equal(
          RAW_HEX_COLOR_RE.test(text),
          false,
          `${relPath} contains raw hex color literal in "${text}"`,
        );
        assert.equal(
          hasInternalJargon(text),
          false,
          `${relPath} contains internal tech jargon in "${text}"`,
        );
      } else if (ts.isTemplateExpression(node)) {
        for (const chunk of [node.head.text, ...node.templateSpans.map(s => s.literal.text)]) {
          assert.equal(FORBIDDEN_BRACKETS_RE.test(chunk), false, `${relPath} template contains forbidden bracket`);
          assert.equal(RAW_HEX_COLOR_RE.test(chunk), false, `${relPath} template contains raw hex color`);
          assert.equal(hasInternalJargon(chunk), false, `${relPath} template contains tech jargon`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // Provenance & quality lineage text hygiene
  const sampleOrigin = {
    kind: 'collection',
    projectId: UUID_PROJECT,
    releaseId: UUID_RELEASE,
    versionId: UUID_VERSION,
    questionnaireRevision: 3,
    classification: 'actual',
    snapshotHash: SAMPLE_SHA256,
    generatedAt: '2026-11-25T04:00:00Z',
    design: newQuestionnaire(),
  };
  const sampleQuality = {
    kind: 'quality',
    parentName: '社区助餐原始回收.csv',
    parentHash: SAMPLE_SHA256,
    simulated: false,
    silicon: false,
    removed: 4,
    ledgerHash: 'b'.repeat(64),
    rules: ['注意力检查题：未通过第8题剔除', '直线作答：连续10题同分剔除'],
    missingCodes: ['-99'],
    collection: sampleOrigin,
  };
  const baseSection = {
    id: 'sec-1',
    title: '样本数据来源与清洗',
    body: '本节汇报问卷回收情况。',
    source: '数据文件：community.csv',
  };

  const evSource = collectionEvidenceSource('原始记录', sampleOrigin);
  const qcStep = qualityLineageStep(sampleQuality);
  const qcSec = qualityEvidenceSection(baseSection, sampleQuality);
  const colSec = collectionEvidenceSection(baseSection, sampleOrigin);

  for (const prose of [evSource, qcStep, qcSec.body, qcSec.source, colSec.body, colSec.source]) {
    assertPureUserText(prose, 'collection/quality provenance text');
  }
});

test('PublicSurvey.module.css enforces mobile viewport, reduced-motion, multi-page print, and zero-hex forced-colors accessibility rules', () => {
  const cssPath = path.join(FRONTEND_ROOT, 'components', 'survey', 'PublicSurvey.module.css');
  const rawCss = fs.readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');

  assert.match(rawCss, /@media\s*\(\s*max-width\s*:\s*640px\s*\)/iu);
  assert.match(rawCss, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/iu);
  assert.match(rawCss, /@media\s+print\b/iu);
  assert.match(rawCss, /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/iu);

  const forcedMatch = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/iu.exec(rawCss);
  assert.ok(forcedMatch, 'PublicSurvey.module.css must contain @media (forced-colors: active)');
  let depth = 1;
  let cursor = forcedMatch.index + forcedMatch[0].length;
  while (cursor < rawCss.length && depth > 0) {
    if (rawCss[cursor] === '{') depth += 1;
    else if (rawCss[cursor] === '}') depth -= 1;
    cursor += 1;
  }
  assert.equal(depth, 0, 'forced-colors block must have balanced braces');
  const forcedBody = rawCss.slice(forcedMatch.index + forcedMatch[0].length, cursor - 1);
  assert.equal(
    RAW_HEX_COLOR_RE.test(forcedBody),
    false,
    'PublicSurvey.module.css @media (forced-colors: active) must contain ZERO hex color literals',
  );
  for (const token of ['Canvas', 'CanvasText', 'ButtonText', 'Highlight', 'HighlightText']) {
    assert.ok(forcedBody.includes(token), `forced-colors block must use semantic system color ${token}`);
  }
});
