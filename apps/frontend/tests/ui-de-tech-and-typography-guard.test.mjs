import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import { buildRichDemoPack } from '../lib/agent/rich-study.ts';
import { createLatexReport } from '../lib/latex-report.ts';
import { SIMULATED_MARK } from '../lib/report-placement.ts';
import { evidenceSection } from '../lib/research-flow.ts';
import { CHART_CATALOG, renderChartPreviewSvg } from '../lib/resource-library/chart-catalog.ts';
import { DIAGRAM_CATALOG, renderDiagramPreviewSvg } from '../lib/resource-library/diagram-catalog.ts';
import { TABLE_CATALOG, renderTablePreviewSvg } from '../lib/resource-library/table-catalog.ts';
import {
  VISUAL_CATALOG,
  VISUAL_FILTER_LABELS,
  renderPaletteBoardSvg,
  renderVisualSpecSvg,
} from '../lib/resource-library/visual-catalog.ts';
import {
  normalizeAcademicPunctuation,
  normalizeAcademicPunctuationKeepingBraces,
  normalizePaperProse,
  normalizePaperProseKeepingBraces,
} from '../lib/typography.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const FORBIDDEN_BRACKETS_RE = /[【】「」『』]/u;
const CORE_PRIVATE_JARGON_PATTERNS = [
  { name: 'ReAct', re: /\bReAct\b/u },
  { name: 'EpistemicGraph', re: /\bEpistemicGraph\b/u },
  { name: '有向图', re: /有向图/u },
  { name: '算子', re: /算子/u },
  { name: '沙盒', re: /沙盒/u },
  { name: 'BYOK', re: /\bBYOK\b/iu },
  { name: 'Bento', re: /\bBento\b/iu },
  { name: 'Atypica', re: /\bAtypica\b/iu },
  { name: '本地开发密钥', re: /本地开发密钥/u },
  { name: '自定义模型ID', re: /自定义模型\s*ID/iu },
  { name: '去AI味', re: /去\s*AI\s*味/iu },
  { name: '离线演示引擎', re: /离线演示引擎/u },
  { name: 'FILE CHECK', re: /\bFILE\s+CHECK\b/iu },
  { name: 'EVI-X / EXAMPLE PROJECT', re: /EVI-X\s*\/\s*EXAMPLE\s+PROJECT/iu },
  { name: 'CASE STUDY / EVIDENCE ATLAS', re: /CASE\s+STUDY\s*\/\s*EVIDENCE\s+ATLAS/iu },
  { name: 'PENROSE MIRROR ROOM', re: /PENROSE\s+MIRROR\s+ROOM/iu },
  { name: '矢量卡片兜底', re: /矢量卡片兜底/u },
  { name: '保存回调', re: /保存回调/u },
  { name: '并使用我的 API 额度', re: /并使用我的\s*API\s*额度/iu },
];

const CORE_UI_FILES = [
  'app/layout.tsx',
  'app/page.tsx',
  'components/agent/AgentShell.tsx',
  'components/agent/MirrorRoom.tsx',
  'components/agent/Sidebar.tsx',
  'components/agent/GlobalAgentDock.tsx',
  'components/agent/WorkflowExecutionPanel.tsx',
  'components/agent/ReportWorkspace.tsx',
  'components/agent/studios/StudioPanel.tsx',
  'components/agent/studios/QuickSurveyStudio.tsx',
  'components/agent/studios/ImageWorkshopStudio.tsx',
  'components/agent/studios/ResourceLibraryStudio.tsx',
  'components/agent/studios/CrossRefStudio.tsx',
  'components/editors/OnlyOfficeEditor.tsx',
  'components/editors/OfficeFileLibrary.tsx',
  'components/hosted/HostedProject.tsx',
  'components/preflight/SubmissionPreflight.tsx',
  'components/landing/CaseEvidence.tsx',
  'components/landing/LandingDemo.tsx',
  'components/landing/CorpusObservatory.tsx',
  'components/silicon/SiliconLab.tsx',
  'components/silicon/RunConsole.tsx',
];

function isModuleSpecifierString(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
    return parent.moduleSpecifier === node;
  }
  if (
    ts.isCallExpression(parent) &&
    parent.arguments[0] === node &&
    (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(parent.expression) && parent.expression.text === 'require'))
  ) {
    return true;
  }
  return false;
}

function scanTsxSourceForUiLeaks(filename, sourceText) {
  const sf = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bracketHits = [];
  const jargonHits = [];

  function inspectText(node, rawText) {
    if (!rawText) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const snippet = rawText.replace(/\s+/gu, ' ').trim().slice(0, 80);
    if (FORBIDDEN_BRACKETS_RE.test(rawText)) {
      bracketHits.push(`${filename}:${line} -> ${snippet}`);
    }
    for (const { name, re } of CORE_PRIVATE_JARGON_PATTERNS) {
      if (re.test(rawText)) {
        jargonHits.push(`${filename}:${line} [${name}] -> ${snippet}`);
      }
    }
  }

  function visit(node) {
    if (ts.isRegularExpressionLiteral(node)) return;
    if (ts.isJsxText(node)) {
      inspectText(node, node.text);
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !isModuleSpecifierString(node)
    ) {
      inspectText(node, node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      inspectText(node, node.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { bracketHits, jargonHits };
}

function stripMathSegments(text) {
  return text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/gu, '');
}

test('typography & provenance guard: sanitizes brackets, non-math braces, p=0.0, and method colons while preserving $...$ math and simulation sentinel', () => {
  const dirtyAcademic =
    '【核心实证发现】受访者对「智能健康手环」与『远程守护』在{情境}下的态度显著分化（rho = 0.418, p = 0.000, Cliff\'s Delta = 0.34），且满足 $H(2) = 75.56, \\mathrm{KMO} = 0.825$ 与 $$\\hat{\\beta}_{1} = \\frac{\\sum_{i=1}^{n} x_i y_i}{\\sum_{i=1}^{n} x_i^2}$$。';
  const cleanedPlain = normalizeAcademicPunctuation(dirtyAcademic);

  assert.doesNotMatch(cleanedPlain, FORBIDDEN_BRACKETS_RE);
  assert.doesNotMatch(stripMathSegments(cleanedPlain), /[{}]/u);
  assert.match(cleanedPlain, /“智能健康手环”/u);
  assert.match(cleanedPlain, /“远程守护”/u);
  assert.match(cleanedPlain, /ρ=\s*0\.418/u);
  assert.match(cleanedPlain, /p < 0\.0001/u);
  assert.match(cleanedPlain, /Cliff's δ = 0\.34/u);
  assert.ok(cleanedPlain.includes('$H(2) = 75.56, \\mathrm{KMO} = 0.825$'));
  assert.ok(cleanedPlain.includes('$$\\hat{\\beta}_{1} = \\frac{\\sum_{i=1}^{n} x_i y_i}{\\sum_{i=1}^{n} x_i^2}$$'));
  assert.equal(normalizeAcademicPunctuation('检验得 p = 0.004，未触发零截断。'), '检验得 p = 0.004，未触发零截断。');

  const dirtyProse = [
    '【Spearman 秩相关稳健矩阵】两核心维度呈稳健正相关（rho=0.52, p=0.0）。',
    '如表 5-2 所示，Mann-Whitney U 与 Cliff\'s Delta结果显示：高频组评分更高（适用边界：横截面调查样本）。',
    '数据质量与核心机制核查结论：经四步筛查后保留有效样本 610 份。统计修正要点：稳健标准误校准。',
  ].join('\n');
  const cleanedProse = normalizePaperProse(dirtyProse);

  assert.doesNotMatch(cleanedProse, FORBIDDEN_BRACKETS_RE);
  assert.doesNotMatch(cleanedProse, /\bp\s*=\s*0(?:\.0+)?(?![0-9.])/iu);
  assert.doesNotMatch(cleanedProse, /\brho\s*=/iu);
  assert.match(cleanedProse, /采用 Spearman 秩相关稳健矩阵 检验，/u);
  assert.match(cleanedProse, /采用 Mann-Whitney U 与 Cliff's δ 检验，/u);
  assert.match(cleanedProse, /本次核查经四步筛查后保留有效样本 610 份/u);
  assert.match(cleanedProse, /需要说明的是，横截面调查样本/u);

  const keptPlain = normalizeAcademicPunctuationKeepingBraces('「测试」{F1} 与 $\\alpha_{1}$');
  const keptProse = normalizePaperProseKeepingBraces('Spearman 秩相关稳健矩阵：「测试」{G1}');
  assert.equal(keptPlain, '“测试”{F1} 与 $\\alpha_{1}$');
  assert.match(keptProse, /“测试”\{G1\}/u);

  assert.match(SIMULATED_MARK, /^【教学模拟数据/u);
  const baseAggregate = {
    version: 1,
    sourceHash: 'a'.repeat(64),
    question: '样本渠道分布如何？',
    variables: ['渠道'],
    missingCodes: [],
    total: 20,
    n: 20,
    calculation: { method: 'frequency', counts: [12, 8], column: 0 },
  };
  const simEvidence = evidenceSection({ ...baseAggregate, classification: 'simulated' }, 'guard-sim');
  const userEvidence = evidenceSection({ ...baseAggregate, classification: 'user_provided' }, 'guard-user');
  assert.match(simEvidence.body, /【教学模拟数据/u, 'simulated evidence must preserve /【教学模拟数据/ sentinel');
  assert.doesNotMatch(
    simEvidence.body.replace(/【教学模拟数据[^】]*】/gu, ''),
    FORBIDDEN_BRACKETS_RE,
  );
  assert.doesNotMatch(userEvidence.body, FORBIDDEN_BRACKETS_RE);
});

test('core UI AST guard: zero visible forbidden brackets and zero private engineering jargon across shell, studios, and landing views', () => {
  const syntheticCheck = scanTsxSourceForUiLeaks(
    'synthetic.tsx',
    [
      "import dynamic from 'next/dynamic';",
      "const View = dynamic(() => import('@/components/silicon/AtypicaLiveTheater'));",
      'export function Bad() { return <div title="ReAct 算子">【违规】「引号」</div>; }',
    ].join('\n'),
  );
  assert.equal(syntheticCheck.bracketHits.length, 1, 'AST scanner must detect JSX bracket leaks');
  assert.equal(syntheticCheck.jargonHits.length, 2, 'AST scanner must detect prop jargon while ignoring import() paths');

  for (const relPath of CORE_UI_FILES) {
    const fullUrl = new URL(`../${relPath}`, import.meta.url);
    const sourceText = fs.readFileSync(fullUrl, 'utf8');
    const { bracketHits, jargonHits } = scanTsxSourceForUiLeaks(relPath, sourceText);
    assert.deepEqual(bracketHits, [], `Forbidden brackets found in ${relPath}`);
    assert.deepEqual(jargonHits, [], `Private tech jargon found in ${relPath}`);
  }
});

test('rich-study report guard: cross-domain generated reports have zero forbidden brackets, zero non-math braces, zero p=0.000/rho=, and zero dictionary-colon paragraph leads', async () => {
  const topics = [
    '城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制',
    '县域特色农产品品牌溢价与消费复购意愿',
  ];

  for (const topic of topics) {
    const pack = await buildRichDemoPack(topic);
    const { report } = pack;
    assert.ok(report.report.length >= 20, `Expected full multi-chapter report for ${topic}`);

    for (const headerText of [report.title, report.subtitle ?? '']) {
      assert.doesNotMatch(headerText, FORBIDDEN_BRACKETS_RE, `Bracket residue in report header: ${headerText}`);
      assert.doesNotMatch(stripMathSegments(headerText), /[{}]/u, `Non-math braces in report header: ${headerText}`);
    }

    for (const sec of report.report) {
      assert.doesNotMatch(sec.title, FORBIDDEN_BRACKETS_RE, `Bracket residue in section title: ${sec.title}`);
      const bodyWithoutSentinel = (sec.body ?? '').replace(/【教学模拟数据[^】]*】/gu, '');
      assert.doesNotMatch(bodyWithoutSentinel, FORBIDDEN_BRACKETS_RE, `Bracket residue in section ${sec.title}`);
      assert.doesNotMatch(
        stripMathSegments(bodyWithoutSentinel),
        /[{}]/u,
        `Non-math literal braces in section ${sec.title}`,
      );
      assert.doesNotMatch(
        bodyWithoutSentinel,
        /\bp\s*=\s*0(?:\.0+)?(?![0-9.])/iu,
        `Unbounded zero p-value in section ${sec.title}`,
      );
      assert.doesNotMatch(bodyWithoutSentinel, /\brho\s*=/iu, `Bare ASCII rho= in section ${sec.title}`);

      for (const paragraph of bodyWithoutSentinel.split(/\r?\n+/u)) {
        const trimmed = paragraph.trim();
        if (!trimmed || /^注[：:]/u.test(trimmed) || /^关键词[：:]/u.test(trimmed) || /^\[\[.*\]\]$/u.test(trimmed)) {
          continue;
        }
        assert.doesNotMatch(
          trimmed,
          /^[\u4e00-\u9fa5A-Za-z0-9]{1,10}[：:]/u,
          `Dictionary-colon paragraph opening in ${sec.title}: ${trimmed.slice(0, 60)}`,
        );
      }

      for (const block of sec.blocks ?? []) {
        const blockTexts = [
          block.title ?? '',
          block.caption ?? '',
          block.note ?? '',
          ...(block.table ? [...block.table.headers, ...block.table.rows.flat()] : []),
        ];
        for (const cell of blockTexts) {
          const cleanCell = String(cell).replace(/【教学模拟数据[^】]*】/gu, '');
          assert.doesNotMatch(cleanCell, FORBIDDEN_BRACKETS_RE, `Bracket residue in exhibit of ${sec.title}: ${cell}`);
          assert.doesNotMatch(
            stripMathSegments(cleanCell),
            /[{}]/u,
            `Non-math braces in exhibit of ${sec.title}: ${cell}`,
          );
          assert.doesNotMatch(
            cleanCell,
            /\bp\s*=\s*0(?:\.0+)?(?![0-9.])/iu,
            `Unbounded zero p-value in exhibit of ${sec.title}: ${cell}`,
          );
        }
      }
    }

    const latex = await createLatexReport(report);
    assert.doesNotMatch(
      latex.body.replace(/【教学模拟数据[^】]*】/gu, ''),
      FORBIDDEN_BRACKETS_RE,
      `Bracket residue in exported LaTeX for ${topic}`,
    );
  }
});

test('resource-library 503-item catalog guard: all text fields and preview SVGs across chart, table, diagram, and visual catalogs stay 100% clean', () => {
  const catalogJargonRe = /\b(?:ReAct|EpistemicGraph)\b|算子|沙盒|大模型/u;
  const zeroPRe = /\bp\s*=\s*0(?:\.0+)?(?![0-9.])/iu;
  const bareRhoRe = /\brho\s*=/iu;

  function collectCatalogViolations(value, path, out) {
    if (typeof value === 'string') {
      out.stringsChecked += 1;
      if (FORBIDDEN_BRACKETS_RE.test(value)) out.issues.push(`${path} [bracket]: ${value.slice(0, 80)}`);
      if (/[{}]/u.test(stripMathSegments(value))) out.issues.push(`${path} [brace]: ${value.slice(0, 80)}`);
      if (catalogJargonRe.test(value)) out.issues.push(`${path} [jargon]: ${value.slice(0, 80)}`);
      if (zeroPRe.test(value)) out.issues.push(`${path} [p=0.0]: ${value.slice(0, 80)}`);
      if (bareRhoRe.test(value)) out.issues.push(`${path} [rho=]: ${value.slice(0, 80)}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, idx) => collectCatalogViolations(entry, `${path}[${idx}]`, out));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        collectCatalogViolations(entry, `${path}.${key}`, out);
      }
    }
  }

  const probe = { stringsChecked: 0, issues: [] };
  collectCatalogViolations(
    { title: '「测试」', note: '算子与大模型（rho = 0.31, p = 0.000）', formula: '$\\alpha_{1} = 0.85$' },
    'probe',
    probe,
  );
  assert.equal(probe.issues.length, 4, 'Catalog guard helper must flag bracket, jargon, p=0.000, and rho= while sparing $...$ math braces');

  const catalogSuites = [
    ['chart-catalog', CHART_CATALOG],
    ['table-catalog', TABLE_CATALOG],
    ['diagram-catalog', DIAGRAM_CATALOG],
    ['visual-catalog', VISUAL_CATALOG],
  ];

  const totalCatalogItems = catalogSuites.reduce((sum, [, items]) => sum + items.length, 0);
  assert.ok(totalCatalogItems >= 503, `Expected >=503 catalog entries, got ${totalCatalogItems}`);

  const audit = { stringsChecked: 0, issues: [] };
  for (const [suiteName, items] of catalogSuites) {
    items.forEach((item, idx) => {
      collectCatalogViolations(item, `${suiteName}[${idx}:${item.id}]`, audit);
    });
  }
  collectCatalogViolations(VISUAL_FILTER_LABELS, 'visual-catalog.VISUAL_FILTER_LABELS', audit);

  assert.ok(audit.stringsChecked >= 14000, `Expected >=14000 catalog text fields audited, got ${audit.stringsChecked}`);
  assert.deepEqual(audit.issues, []);

  const svgIssues = [];
  const checkSvg = (label, svg) => {
    if (FORBIDDEN_BRACKETS_RE.test(svg)) svgIssues.push(`${label} [bracket]`);
    if (catalogJargonRe.test(svg)) svgIssues.push(`${label} [jargon]`);
    if (zeroPRe.test(svg)) svgIssues.push(`${label} [p=0.0]`);
    if (bareRhoRe.test(svg)) svgIssues.push(`${label} [rho=]`);
  };

  for (const ch of CHART_CATALOG) checkSvg(`chart:${ch.id}`, renderChartPreviewSvg(ch, '#0F766E'));
  for (const tb of TABLE_CATALOG) checkSvg(`table:${tb.id}`, renderTablePreviewSvg(tb, '#0F766E'));
  for (const dg of DIAGRAM_CATALOG) checkSvg(`diagram:${dg.id}`, renderDiagramPreviewSvg(dg, '#0F766E'));
  for (const vs of VISUAL_CATALOG) {
    checkSvg(`visual:${vs.id}`, vs.kind === 'palette_board' ? renderPaletteBoardSvg(vs) : renderVisualSpecSvg(vs));
  }
  assert.deepEqual(svgIssues, []);
});

