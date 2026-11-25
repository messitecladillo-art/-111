import assert from 'node:assert/strict';
import test from 'node:test';
import { exclusionLedger, tableCsv } from '../lib/data-quality.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import {
  buildLatexSource,
  createLatexReport,
  generateLatexBody,
  latexCompileInput,
} from '../lib/latex-report.ts';
import { newQuestion, newQuestionnaire } from '../lib/questionnaire.ts';
import { emptyReference, formatReference } from '../lib/references.ts';
import { digestText, resultPayload } from '../lib/research-quality.ts';
import { disclosureText, SILICON_ORIGIN_COLUMN, SILICON_ORIGIN_VALUE, siliconCsv } from '../lib/silicon/export.ts';

const glue = (left, right) => `${left}${right}`;

function assertBalancedLatexEnvironmentsAndBraces(texSource) {
  const nonCommentLines = texSource
    .split(/\r?\n/u)
    .map(line => {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '%' && (i === 0 || line[i - 1] !== '\\')) break;
        out += line[i];
      }
      return out;
    });
  const activeTex = nonCommentLines.join('\n');

  const envStack = [];
  let envCount = 0;
  for (const match of activeTex.matchAll(/\\(begin|end)\{([A-Za-z0-9*]+)\}/gu)) {
    const [, kind, envName] = match;
    if (kind === 'begin') {
      envStack.push(envName);
      envCount += 1;
    } else {
      assert.ok(envStack.length > 0, `Unmatched \\end{${envName}} with empty stack`);
      const top = envStack.pop();
      assert.equal(top, envName, `Mismatched LaTeX environment: opened \\begin{${top}} but closed \\end{${envName}}`);
    }
  }
  assert.deepEqual(envStack, [], `Unclosed LaTeX environments remaining on stack: ${envStack.join(', ')}`);
  assert.ok(envCount >= 4, `Expected >= 4 LaTeX environments (document, titlepage, table, tabular, figure), found ${envCount}`);

  let braceDepth = 0;
  for (let i = 0; i < activeTex.length; i++) {
    const ch = activeTex[i];
    const escaped = i > 0 && activeTex[i - 1] === '\\' && (i < 2 || activeTex[i - 2] !== '\\');
    if (escaped) continue;
    if (ch === '{') braceDepth += 1;
    else if (ch === '}') {
      braceDepth -= 1;
      assert.ok(braceDepth >= 0, `Unmatched closing '}' in generated TeX around offset ${i}`);
    }
  }
  assert.equal(braceDepth, 0, `Unbalanced curly braces in generated TeX (final depth=${braceDepth})`);
}

async function buildLatexBlemishedFixture() {
  const gluedMw = glue('Mann-Whitney', 'U');
  const gluedCliff = glue("Cliff's", 'δ');
  const gluedKw = glue('Kruskal-Wallis', 'H');
  const gluedCramer = glue("Cramer's", 'V');

  const shortResult = {
    id: 'mode-crosstab',
    title: '「当前居住模式」与终端采纳率分布',
    sourceName: '【入户调查】实证库 #1',
    sourceUrl: 'https://example.org/dataset',
    sourceHash: 'c'.repeat(64),
    resultHash: '0'.repeat(64),
    classification: 'user_provided',
    method: 'frequency',
    n: 500,
    total: 520,
    headers: ['「当前居住模式」_组别', '有效人数', '采纳比例 (%)'],
    rows: [
      ['居家 & 独居_A #1', 342, '68.4%'],
      ['社区「日间驿站」_B #2', 110, '22.0%'],
      ['机构照护_C #3', 48, '9.6%'],
    ],
    metrics: [],
    warnings: [],
  };
  shortResult.resultHash = await digestText(JSON.stringify(resultPayload(shortResult)));

  const longRows = Array.from({ length: 28 }, (_, idx) => [
    `街道样本组_${idx + 1} & 社区 #${idx + 1}`,
    12 + idx,
    `${(3.2 + idx * 0.1).toFixed(1)}%`,
  ]);
  const longResult = {
    id: 'street-long',
    title: '28 个街道子样本【分布】明细',
    sourceName: '区县抽样框',
    sourceUrl: 'https://example.org/streets',
    sourceHash: 'd'.repeat(64),
    resultHash: '0'.repeat(64),
    classification: 'user_provided',
    method: 'frequency',
    n: 500,
    total: 520,
    headers: ['街道 & 社区_编号', '样本数', '组内占比'],
    rows: longRows,
    metrics: [],
    warnings: [],
  };
  longResult.resultHash = await digestText(JSON.stringify(resultPayload(longResult)));

  const refJournal = {
    ...emptyReference('J'),
    id: 'ref-j1',
    authors: ['张明远', '李秋实'],
    title: '县域老年群体「当前居住模式」与数字服务可得性研究 & 实证_分析',
    source: '人口与统计研究',
    year: '2025',
    volume: '41',
    issue: '3',
    pages: '45-58',
  };

  const content = createEditorContent();
  content.version = 2;
  content.title = '银发群体居住模式与智慧服务采纳意愿实证研究';
  content.subtitle = '分层配额抽样与多维非参数稳健性检验';
  content.references = [refJournal];
  content.quality = { version: 1, results: [shortResult, longResult], findings: [] };
  content.report = [
    {
      id: 'sec-abs',
      title: '摘要',
      body: [
        `本研究调查有效率达 68.4%，围绕「当前居住模式」在 A&B_组 #1 中开展稳健性核验（p=0.000）。`,
        `关键词：智慧养老；当前居住模式；${gluedMw} 与 ${gluedCliff}；${gluedKw}；${gluedCramer}`,
      ].join('\n'),
      source: '',
      blocks: [],
    },
    {
      id: 'sec-emp',
      title: '一、实证检验与矩阵核查',
      body: `【Spearman 矩阵】结合「当前居住模式」分层对照[[引:ref-j1]]，高龄组采纳率为 68.4%，样本分组 A&B_组 #1 的 ${gluedMw} 与 ${gluedCliff} 均显著（p=0.000，rho=0.612），线性约束满足 $x_i + y_i = z_i$ 且总和见[[表:blk-short]]与[[图:blk-chart]]。`,
      source: '实地调研台账 & 复核记录_v2 #1',
      blocks: [
        {
          id: 'blk-short',
          kind: 'table',
          text: '「当前居住模式」与终端采纳率交叉三线表',
          evidenceId: 'mode-crosstab',
          valueColumn: 1,
        },
        {
          id: 'blk-chart',
          kind: 'chart',
          text: '「当前居住模式」样本分布结构图',
          evidenceId: 'mode-crosstab',
          valueColumn: 1,
        },
        {
          id: 'blk-formula',
          kind: 'formula',
          text: '\\sum_{i=1}^{n} (x_i + y_i) = \\sum_{i=1}^{n} z_i',
          evidenceId: '',
          valueColumn: 1,
        },
        {
          id: 'blk-long',
          kind: 'table',
          text: '各街道样本明细跨页三线表',
          evidenceId: 'street-long',
          valueColumn: 1,
        },
      ],
    },
    {
      id: 'sec-ref',
      title: '参考文献',
      body: '',
      source: '',
      blocks: [],
    },
  ];

  return parseEditorContent(content);
}

test('full LaTeX .tex export maintains 100% \\begin/\\end stack balance, escapes %/&/_/#, preserves $...$ math without \\$, and heals typography', async () => {
  const fixture = await buildLatexBlemishedFixture();
  const draft = await createLatexReport(fixture);
  const compileInput = latexCompileInput({ ...fixture, latex: draft });
  const fullTex = buildLatexSource(compileInput);

  // (1) Strict LIFO stack balance for all \begin{...} / \end{...} environments and curly braces
  assertBalancedLatexEnvironmentsAndBraces(fullTex);
  assert.match(fullTex, /\\begin\{tabular\}/u);
  assert.match(fullTex, /\\begin\{longtable\}/u);
  assert.match(fullTex, /\\toprule\[1\.5bp\]/u);
  assert.match(fullTex, /\\midrule\[0\.75bp\]/u);
  assert.match(fullTex, /\\bottomrule\[1\.5bp\]/u);

  // (2) Prose & table cells escape %, &, _, # while inline $x_i + y_i = z_i$ stays real math with zero \$ artifacts
  assert.match(fullTex, /68\.4\\%/u, 'plain percentage 68.4% must be escaped as 68.4\\%');
  assert.match(fullTex, /A\\&B\\_组 \\#1/u, 'special TeX characters &, _, # in prose must be escaped');
  assert.match(fullTex, /居家 \\& 独居\\_A \\#1/u, 'special TeX characters &, _, # in table cells must be escaped');
  assert.match(
    fullTex,
    /\\\(x_i \+ y_i = z_i\\\)/u,
    'inline math $x_i + y_i = z_i$ must convert to \\(x_i + y_i = z_i\\) with subscripts intact',
  );
  assert.match(
    fullTex,
    /\\\[[\s\S]*?\\sum_\{i=1\}\^\{n\} \(x_i \+ y_i\) = \\sum_\{i=1\}\^\{n\} z_i[\s\S]*?\\\]/u,
    'display formula block must remain intact inside \\[ ... \\]',
  );
  assert.doesNotMatch(fullTex, /\\\$/u, 'generated .tex must contain zero literal \\$ currency fallback artifacts');

  // (3) Zero forbidden brackets, healed statistical symbols, healed p < 0.0001, GB/T 7714 reference, zero host paths
  assert.doesNotMatch(fullTex, /[【】「」『』]/u, 'generated .tex must contain zero forbidden brackets');
  assert.equal(fullTex.includes(glue('Mann-Whitney', 'U')), false);
  assert.equal(fullTex.includes(glue("Cliff's", 'δ')), false);
  assert.equal(fullTex.includes(glue('Kruskal-Wallis', 'H')), false);
  assert.equal(fullTex.includes(glue("Cramer's", 'V')), false);
  assert.doesNotMatch(fullTex, /\bp\s*=\s*0\.000\b/iu);

  assert.match(fullTex, /Mann-Whitney U/u);
  assert.match(fullTex, /Cliff's δ/u);
  assert.match(fullTex, /Kruskal-Wallis H/u);
  assert.match(fullTex, /Cramér's V/u);
  assert.match(fullTex, /“当前居住模式”/u);
  assert.match(fullTex, /Spearman 矩阵/u);
  assert.match(fullTex, /p < 0\.0001/u);
  assert.match(fullTex, /\\textsuperscript\{\[1\]\}/u);
  assert.match(fullTex, /人口与统计研究/u);
  assert.doesNotMatch(fullTex, /C:\\Users\\|\/Users\/|\/home\/|AppData\\Local/iu);

  // Idempotent body regeneration
  assert.equal(generateLatexBody(fixture), draft.body);
});

test('frontend CSV, QC exclusion ledger, silicon pre-test CSV/disclosure, and GB/T 7714 reference exporters preserve RFC 4180 quoting and prose hygiene', () => {
  // (1) Survey table CSV & QC exclusion ledger RFC 4180 quoting for commas, quotes, newlines, and %, &, _, #
  const rawCsv = tableCsv({
    headers: ['受访编号', '居住模式,备注', '满意度占比 (%)'],
    rows: [
      ['R001', '社区"日间"驿站, A&B_组 #1', '68.4%'],
      ['R002', '居家养老\n二层住户', '-3.5'],
    ],
  });
  assert.ok(rawCsv.includes('"居住模式,备注"'), 'header with comma must be RFC 4180 quoted');
  assert.ok(rawCsv.includes('"社区""日间""驿站, A&B_组 #1"'), 'embedded quotes and commas must double-quote escape');
  assert.ok(rawCsv.includes('"居家养老\n二层住户"'), 'embedded newline must stay enclosed in quotes');
  assert.ok(rawCsv.includes('68.4%'), 'percentage value preserved cleanly in CSV');
  assert.ok(rawCsv.includes('-3.5'), 'legitimate negative decimal preserved cleanly in CSV');

  const ledger = exclusionLedger(
    {
      total: 100,
      kept: 98,
      notes: [],
      rules: [{ id: 'speed', label: '作答过快', criterion: '耗时 < 60 秒', flagged: 2, unparsed: 0 }],
      flagged: [{ row: 5, id: 'resp,"05"', reasons: ['speed'] }],
    },
    new Set(['speed']),
    {
      sourceName: '义乌调研数据集',
      sourceHash: 'e'.repeat(64),
      registeredAt: '2026-11-25T00:00:00Z',
      missingCodes: ['-99'],
    },
  );
  assert.match(ledger, /# SHA-256 e{64}/u);
  assert.ok(ledger.includes('"resp,""05"""'));

  // (2) Silicon pre-test CSV provenance marker & disclosure prose typography healing
  const q1 = { ...newQuestion('q1', 'Q1'), text: '您的居住模式', type: 'single' };
  const design = {
    ...newQuestionnaire(),
    title: `「当前居住模式」预测试问卷（${glue('Mann-Whitney', 'U')}）`,
    questions: [q1],
  };
  const run = {
    id: 'run-01',
    engine: 'demo',
    createdAt: '2026-11-25T00:00:00Z',
    attributes: [{ key: 'age', label: '年龄段' }],
    personas: [{ id: 'p1', code: 'P01', traits: { age: '65-74岁' } }],
    settings: {
      models: ['demo-local'],
      scenarios: [
        { id: 'base', label: '基准情境' },
        { id: 'rainy', label: `「雨天出行」与【社区助餐】` },
      ],
    },
    responses: [
      {
        personaId: 'p1',
        scenarioId: 'rainy',
        model: 'demo-local',
        status: 'ok',
        answers: [{ questionId: 'q1', shown: true, refused: false, value: '社区驿站, "A组"' }],
      },
    ],
  };

  const simCsv = siliconCsv(design, run);
  assert.ok(simCsv.startsWith('\uFEFF' + SILICON_ORIGIN_COLUMN + ','), 'silicon CSV must start with UTF-8 BOM and __origin column');
  assert.ok(simCsv.includes(SILICON_ORIGIN_VALUE), 'every simulated row must carry silicon_simulated origin');
  assert.ok(simCsv.includes('"社区驿站, ""A组"""'));

  const disclosure = disclosureText(design, run);
  assert.doesNotMatch(disclosure, /[【】「」『』]/u, 'silicon disclosure text must strip forbidden brackets');
  assert.equal(disclosure.includes(glue('Mann-Whitney', 'U')), false);
  assert.match(disclosure, /Mann-Whitney U/u);
  assert.match(disclosure, /“当前居住模式”/u);
  assert.match(disclosure, /“雨天出行”与社区助餐/u);

  // (3) GB/T 7714-2015 reference formatting hygiene
  const formattedRef = formatReference({
    ...emptyReference('J'),
    id: 'r1',
    authors: ['王建国', '陈静'],
    title: '智慧养老服务采纳机制研究',
    source: '统计研究',
    year: '2025',
    volume: '42',
    issue: '2',
    pages: '18-31',
  });
  assert.match(formattedRef, /\[J\]/u);
  assert.doesNotMatch(formattedRef, /[【】「」『』]/u);
});
