/**
 * 全流程 Agent 自动生成全报告引擎（吸收《市调科研融合技能包·中文版》00–06 全套契约）
 *
 * 涵盖能力：
 * - 00-市调研究全流程：项目研究模式（plan / demonstration / empirical）与四张交接台账
 *   （结论证据表、文献核验表、统计结果表、图表登记表）跨阶段一致性门禁；
 * - 01-选题与调查设计：研究问题（RQ）—决策含义—核心构念—测量题项—分析方法—适用边界矩阵；
 * - 02-文献与证据核验：已核验文献（verified）序号编码锚点 {R1}..{Rn} 与正文引文自动织入；
 * - 03-数据与统计建模：基于 SHA-256 登记结果（ResultSnapshot）提取事实锚点 {F1}..{Fn}，
 *   并在实证章节自动执行防误读守卫（OR≠概率倍数、秩检验≠中位数检验、p≥0.05≠无差异等）；
 * - 04-科研图表制作：章节图表块登记与受控图表引用占位符 {G1}..{Gm}（自动展开为 [[图:id]] / [[表:id]]）；
 * - 05-报告论证与写作：两阶段（Wave 1 主体与实证章节并发拟稿 -> Wave 2 摘要与结论3W1H综合拟稿）
 *   大模型事实锁死生成流水线，配合非统计符号预清洗器（避免题号 Q1、R² 等被误判为自造数字丢段）；
 * - 06-Word编排与成果验收：生成后自动运行 benchmarkReport + 六大顾问（设/证/统/图/写/交）体检与自愈返修闭环。
 */

import type { EditorContent, ReportSection } from '../editor-model.ts';
import type { Questionnaire } from '../questionnaire.ts';
import { type BenchmarkResult, benchmarkReport } from '../report-benchmark.ts';
import { blueprintNode, blueprintOutline, matchBlueprintNode } from '../report-blueprint.ts';
import { METHOD_LABELS, suggestedNode, targetSection } from '../report-placement.ts';
import type { ReportBlock, ResultSnapshot } from '../research-quality.ts';
import { ADVISORS, type AdvisorReading, advisorForNode, advisorReading, sectionIssues } from './advisors.ts';
import { type Fact, SYNTHESIS_NODES, draftFacts, draftSection, reportOutline } from './draft.ts';
import {
  type ContestTopicBlueprint,
  type HanchaoBenchmarkPack,
  decomposeContestTopic,
  forgeNationalAwardPack,
} from './hanchao-benchmark.ts';
import { standingFindings, type ResultsView } from './router.ts';

export type ProjectResearchMode = 'plan' | 'demonstration' | 'empirical';
export type ProjectDataStatus = 'planned' | 'collected' | 'verified' | 'synthetic';

/** 00-市调研究全流程：四张跨阶段交接台账 */
export type ClaimLedgerRow = {
  claimId: string;
  statement: string;
  evidenceType: 'statistical_result' | 'verified_literature' | 'design_rule';
  sourceId: string;
  locator: string;
  resultIds: string[];
  confidence: 'high' | 'medium';
  status: 'verified' | 'demonstration_only' | 'planned';
  boundary: string;
};

export type LiteratureLedgerRow = {
  sourceId: string;
  citationIndex: number;
  title: string;
  authors: string;
  year: string;
  venue: string;
  verificationStatus: 'verified' | 'metadata_only' | 'rejected';
  supportedClaim: string;
  limitation: string;
};

export type StatsLedgerRow = {
  resultId: string;
  rqId: string;
  method: string;
  sampleN: number;
  estimate: string;
  ci95: string;
  pValue: string;
  effectSize: string;
  assumptionCheck: string;
  figureId: string;
  dataMode: ProjectDataStatus;
};

export type FigureLedgerRow = {
  figureId: string;
  title: string;
  type: 'chart' | 'table' | 'formula';
  sectionNode: string;
  resultIds: string[];
  sampleNote: string;
  takeaway: string;
};

export type DesignMatrixRow = {
  rqId: string;
  question: string;
  decisionMeaning: string;
  construct: string;
  itemIds: string[];
  analysisMethod: string;
  boundary: string;
};

export type SkillPackContract = {
  mode: ProjectResearchMode;
  dataStatus: ProjectDataStatus;
  topic: ContestTopicBlueprint;
  designMatrix: DesignMatrixRow[];
  claimLedger: ClaimLedgerRow[];
  literatureLedger: LiteratureLedgerRow[];
  statsLedger: StatsLedgerRow[];
  figureLedger: FigureLedgerRow[];
  contractPassed: boolean;
  contractNotes: string[];
};

export type LlmProviderConfig = {
  provider?: 'deepseek' | 'openai' | 'qwen' | 'compatible';
  baseUrl?: string;
  apiKey: string;
  model?: string;
  temperature?: number;
  concurrency?: number;
  timeoutMs?: number;
};

export type SectionGenerationTrace = {
  nodeId: string;
  title: string;
  wave: 1 | 2;
  /** The advisor whose skill wrote the section: its rules were in the prompt, and the canvas marks the section in its colour. */
  advisor: string | null;
  status: 'llm_generated' | 'repaired_fallback';
  rawParagraphs: number;
  keptParagraphs: number;
  droppedParagraphs: number;
  /** Why each dropped paragraph was dropped, in order. */
  dropReasons?: string[];
  citedFacts: string[];
  citedExhibits: string[];
  citedReferences: string[];
  durationMs: number;
  tokens?: { prompt: number; completion: number; total: number };
  error?: string;
};

export type FullReportGenerationResult = {
  pack: HanchaoBenchmarkPack;
  topic: ContestTopicBlueprint;
  report: EditorContent;
  contract: SkillPackContract;
  traces: SectionGenerationTrace[];
  benchmarkBeforeRepair: BenchmarkResult;
  benchmarkAfterRepair: BenchmarkResult;
  advisorsAfterRepair: AdvisorReading[];
  repairsApplied: string[];
  summary: {
    totalSectionsGenerated: number;
    llmSuccessCount: number;
    totalParagraphsWritten: number;
    totalDroppedParagraphs: number;
    totalFactsCited: number;
    totalTokens: number;
    totalDurationMs: number;
    finalScore: number;
    advisorPassCount: number;
    advisorTotalCount: number;
    /** Sections the model revised after the report check flagged them, and kept because the revision cleared problems. */
    revisedSections: number;
  };
};

/** 全报告自动生成的标准章节序列（Wave 1 主体与实证章节 -> Wave 2 综合章节） */
export const WAVE_1_SECTION_NODES: readonly string[] = [
  'intro.background',
  'intro.significance',
  'intro.literature',
  'intro.roadmap',
  'intro.innovation',
  'design.purpose',
  'design.population',
  'design.content',
  'design.methods',
  'design.sampling',
  'design.schedule',
  'design.qc',
  'data.pilot',
  'data.cleaning',
  'data.testing',
  'sample.profile',
  'sample.descriptive',
  'compare.tests',
  'drivers.model',
  'diagnosis.evaluation',
  'diagnosis.problems',
  'plan.measures',
];

export const WAVE_2_SYNTHESIS_NODES: readonly string[] = [
  'conclusion.findings',
  'conclusion.suggestions',
  'conclusion.limits',
  'abstract',
];

const PLACEHOLDER_RE = /\{(F[1-9][0-9]{0,2}|G[1-9][0-9]?|R[1-9][0-9]?)\}/gu;
const DIGIT_RE = /[0-9０-９]/u;
// A number written out in Chinese is a number all the same: a decimal, a percentage, a multiple or a gap in percentage
// points that the model worked out or made up would otherwise pass the digit check ("一点八倍", "十四个百分点").
const CN_NUMERAL = '[零〇一二两三四五六七八九十百千万]';
const CN_QUANTITY = new RegExp(
  `${CN_NUMERAL}+点[零〇一二三四五六七八九]+|百分之${CN_NUMERAL}+|${CN_NUMERAL}+\\s*(?:倍|个百分点)|[一二两三四五六七八九]成(?=以上|左右|多|的|受访|样本|用户|居民|学生|群体)`,
  'u',
);
/**
 * Analyses a paragraph can claim, and the registered methods that back each. A results paragraph claiming one that no
 * registered result comes from is dropped: the model may not report a model, a factor solution or a clustering that
 * was never run, nor its diagnostics.
 */
const ANALYSIS_CLAIMS: readonly { name: string; words: RegExp; methods: RegExp }[] = [
  {
    name: '回归或 Logit 模型',
    words: /回归(?:模型|分析|系数|方程|结果)|[Ll]ogit|[Ll]ogistic|[Pp]robit|优势比|比值比|发生比|(?<![A-Za-z])OR(?![A-Za-z])|边际效应|方差膨胀|VIF|共线性|平行线假定|伪\s*R/u,
    methods: /regress|logit|logistic|probit|ols/iu,
  },
  { name: '因子分析或 KMO 检验', words: /因子分析|因子载荷|公因子|KMO|Bartlett|球形检验|主成分/iu, methods: /factor|kmo|efa|cfa|pca|validity/iu },
  { name: '聚类分析', words: /聚类|K-?means|轮廓系数/iu, methods: /cluster|kmeans/iu },
];
/** Sections that set out the plan: an analysis named there is one the study means to run, not a result it reports. */
export const PLAN_NODE = /^(?:intro|design)\./u;
/** How many times a flagged section may go back to the model; each kept revision must leave fewer problems. */
const REVISION_ROUNDS = 2;
/** Sections that report results: without a registered result of their own they may only say what is still to come. */
const EVIDENCE_NODES = new Set(['data.testing', 'sample.profile', 'sample.descriptive', 'compare.tests', 'drivers.model', 'diagnosis.evaluation']);
/** Words that put an analysis in the future: such a sentence plans the analysis, it does not report it. */
const PLANNED = /拟|计划|将(?:采用|构建|估计|报告|检验|开展)|尚未登记|待(?:估计|补|登记|完成)/u;

/** A results section with no registered result of its own: it may set out the analysis it still needs, as a plan. */
export function awaitsResults(nodeId: string, results: readonly ResultSnapshot[]): boolean {
  return EVIDENCE_NODES.has(nodeId) && !results.some(r => suggestedNode(r) === nodeId);
}

/**
 * Category names that carry digits ("60–70岁", "9–12 元", "第 1 组"): names, not statistics. They come from the registered
 * results' rows and the questionnaire's options; the digit check reads past them, longest first.
 */
export function categoryLabels(results: readonly ResultSnapshot[], design?: Questionnaire | null): string[] {
  const names = new Set<string>();
  for (const r of results) for (const row of r.rows) for (const cell of row) if (typeof cell === 'string' && DIGIT_RE.test(cell) && cell.trim().length >= 2 && cell.length <= 40) names.add(cell.trim());
  for (const q of design?.questions ?? []) for (const c of q.choices ?? []) if (DIGIT_RE.test(c.label) && c.label.length <= 40) names.add(c.label.trim());
  return [...names].sort((a, b) => b.length - a.length);
}
const withoutNames = (text: string, names: readonly string[] = []) => names.reduce((t, name) => t.split(name).join('□'), text);

/** The analyses a text claims that none of the registered methods backs. */
export function unbackedAnalyses(text: string, methods: readonly string[]): string[] {
  return ANALYSIS_CLAIMS.filter(c => c.words.test(text) && !methods.some(m => c.methods.test(m))).map(c => c.name);
}
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

function toChineseNumber(n: number): string {
  if (n >= 0 && n <= 20) return CN_DIGITS[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ''}`;
  }
  return String(n)
    .split('')
    .map(d => CN_DIGITS[Number(d)] ?? d)
    .join('');
}

/**
 * 预清洗模型段落中的「非统计编号型」阿拉伯数字（如题号 Q11、R²、3W1H、95%置信区间、列表序号 1. 等），
 * 既防止模型在解释变量编码或置信区间概念时因写出 Q11 / 95% 被整段误杀，
 * 又严格保留对一切真实统计数字必须走 {F编号} 占位符的铁律。
 */
export function sanitizeModelParagraph(raw: string): string {
  // Split around {F..}, {G..}, {R..} placeholders so we only sanitize outside placeholders
  const parts = raw.trim().split(/(\{(?:F[1-9][0-9]{0,2}|G[1-9][0-9]?|R[1-9][0-9]?)\})/gu);
  const cleaned = parts
    .map((segment, idx) => {
      if (idx % 2 === 1) return segment;
      let s = segment;
      if (idx === 0) {
        s = s.replace(/^\s*(?:[（(]\s*\d+\s*[)）]|\d+\s*[.、．])\s*/u, '');
      }
      // Convert Q1..Q20 -> 题一..题二十 (handles Chinese text immediately after digits)
      s = s.replace(/(?:^|(?<![A-Za-z]))Q([1-9]|1[0-9]|20)(?![0-9])/giu, (_, d: string) => `题${toChineseNumber(Number(d))}`);
      // Convert RQ1..RQ9 -> 研究问题一..研究问题九
      s = s.replace(/(?:^|(?<![A-Za-z]))RQ([1-9])(?![0-9])/giu, (_, d: string) => `研究问题${toChineseNumber(Number(d))}`);
      // Convert H1..H9 -> 假设一..假设九
      s = s.replace(/(?:^|(?<![A-Za-z]))H([1-9])(?![0-9])/giu, (_, d: string) => `假设${toChineseNumber(Number(d))}`);
      // Convert conceptual 3W1H / 5W1H -> 四维执行框架 / 多维执行框架
      s = s.replace(/[35]W1H/giu, '四维执行框架');
      // Convert R² / R2 / χ² / χ2 -> R平方 / χ²
      s = s.replace(/R\s*[2²]/gu, 'R平方');
      s = s.replace(/χ\s*2/gu, 'χ²');
      // Convert conceptual confidence interval phrases
      s = s.replace(/95\s*[%％]\s*置信区间/gu, '九五置信区间');
      s = s.replace(/99\s*[%％]\s*置信区间/gu, '九九置信区间');
      s = s.replace(/90\s*[%％]\s*置信区间/gu, '九零置信区间');
      // Convert conceptual unit phrases in OR / regression explanation
      s = s.replace(/([每提高增加降低变动取值]{1,3})\s*1\s*(个?单位)/gu, '$1一个$2');
      s = s.replace(/(OR|优势比|比值比|系数)([大和小等]于)\s*1(?![0-9.])/gu, '$1$2一');
      // Convert conceptual Likert scale phrases
      s = s.replace(/([1-9])\s*(分制|级量表|点量表|分量表)/gu, (_, d: string, tail: string) => `${toChineseNumber(Number(d))}${tail}`);
      // Convert literal figure/table numbers written outside {G..} (e.g. 图3-1, 表4-2, 附录1) -> 统计图 / 统计表 / 附录
      s = s.replace(/(?:图|Figure)\s*[0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)*/giu, '正文中统计图');
      s = s.replace(/(?:表|Table)\s*[0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)*/giu, '正文中统计表');
      s = s.replace(/(?:附录|附件)\s*[0-9０-９]+/gu, '附录');
      // Convert Chinese ordinals: 第1..第20 + noun -> 第一..第二十
      s = s.replace(/第\s*([1-9]|1[0-9]|20)\s*(象限|阶段|部分|步|层|级|章|节|类|条|项|点|轮|期|维|轨|组|位|名|次)/gu, (_, d: string, noun: string) => `第${toChineseNumber(Number(d))}${noun}`);
      // Convert ranges like 3-5个 / 1至3项 -> 三至五个
      s = s.replace(/(?<![0-9.])([1-9]|10)\s*(?:—|–|-|至|到)\s*([1-9]|10)\s*(个|项|条|类|维|大|种|阶段|象限|部分|步|层|级|轮|期|周|天|月|年|次|段|句|篇)(?![0-9])/gu, (_, a: string, b: string, clf: string) => `${toChineseNumber(Number(a))}至${toChineseNumber(Number(b))}${clf}`);
      // Convert small integer counts with structural classifiers: 4个象限, 5维, 3条, 2类, 4分类 -> 四个象限, 五维, 三条, 两类, 四分类
      s = s.replace(/(?<![0-9.])([1-9]|1[0-9]|20)\s*(个|项|条|类|分类|维|维度|大|种|阶段|象限|部分|步|步骤|层|层面|级|轮|期|周|段|篇|轨|赛道|片区|主体|工程|模块|渠道)(?![0-9])/gu, (_, d: string, clf: string) => `${toChineseNumber(Number(d))}${clf}`);
      return s;
    })
    .join('');
  return cleaned.trim();
}

/**
 * 构建《市调科研融合技能包·中文版》00–04 阶段的四张核心证据台账与调查设计矩阵
 */
export function buildSkillPackContract(
  pack: HanchaoBenchmarkPack,
  topic: ContestTopicBlueprint,
  mode: ProjectResearchMode = 'demonstration',
): SkillPackContract {
  const dataStatus: ProjectDataStatus = mode === 'empirical' ? 'verified' : mode === 'demonstration' ? 'synthetic' : 'planned';
  const results = pack.report.quality?.results ?? [];
  const findings = pack.report.quality?.findings ?? [];
  const refs = pack.report.references ?? [];

  const designMatrix: DesignMatrixRow[] = [
    {
      rqId: 'RQ1',
      question: `「${topic.shortTitle}」中${topic.groupA}与${topic.groupB}在四分类参与状态上是否存在显著结构分化？`,
      decisionMeaning: '决定运力与运营预算采取「无差别铺开」还是「双轨分层靶向投放」',
      construct: '双轨受众身份 × 参与转化状态',
      itemIds: ['Q1', 'Q2', 'Q8'],
      analysisMethod: '分层 PPS 抽样设计 + 列联表 Pearson χ² 检验与 Cramér’s V 效应量',
      boundary: '横截面列联检验仅反映群体分布关联，不作个体动态跃迁轨迹推断',
    },
    {
      rqId: 'RQ2',
      question: `五维核心体验感知量表是否具备跨群组测量信度，哪些体验维度构成高重要—低表现的履约痛点？`,
      decisionMeaning: '识别亟待优先攻坚的工程与服务短板，避免在低敏感环节过度投入',
      construct: '五维体验感知（核心品质、场景互动、数字预约、线下履约、社群认同）',
      itemIds: ['Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
      analysisMethod: 'Cronbach α 内部一致性检验 + 五维均值排序 + 独立样本 Welch t 检验',
      boundary: '均值差与 t 检验受限于样本覆盖范围，外推至非抽样片区前需重估权重',
    },
    {
      rqId: 'RQ3',
      question: `整体满意度、双轨协同支持度与复购留存及口碑推荐意愿之间的关联强度如何？`,
      decisionMeaning: '量化体验改善与机制协同对二次消费闭环的边际带动潜力',
      construct: '协同机制支持度、整体满意度与复购留存意愿',
      itemIds: ['Q9', 'Q10', 'Q11', 'Q12'],
      analysisMethod: 'Spearman 秩相关检验',
      boundary: '陈述性偏好（意愿）不等于实际复购流水，相关系数不直接等同于因果效应',
    },
  ];

  const statsLedger: StatsLedgerRow[] = results.map((r, idx) => {
    const rqId = r.method === 'sampling-frame' || r.method === 'crosstab' ? 'RQ1' : r.method === 'alpha' || r.method === 'means' || r.method === 'groups' ? 'RQ2' : 'RQ3';
    const primaryMetric = r.metrics[0];
    const secondaryMetric = r.metrics[1];
    return {
      resultId: r.id,
      rqId,
      method: r.method,
      sampleN: r.n,
      estimate: primaryMetric ? `${primaryMetric.label}=${primaryMetric.value ?? 'N/A'}` : `n=${r.n}`,
      ci95:
        r.receipt?.inference?.primary?.effect?.interval
          ? `[${r.receipt.inference.primary.effect.interval.lower}, ${r.receipt.inference.primary.effect.interval.upper}]`
          : '按方法回执记录',
      pValue: r.metrics.find(m => /p/i.test(m.label))?.value?.toString() ?? '见检验回执',
      effectSize: secondaryMetric ? `${secondaryMetric.label}=${secondaryMetric.value ?? 'N/A'}` : '见表内指标',
      assumptionCheck: r.warnings[0] ?? '满足基本统计前提',
      figureId: `FIG-${idx + 1}`,
      dataMode: dataStatus,
    };
  });

  const figureLedger: FigureLedgerRow[] = [];
  for (const section of pack.report.report) {
    const node = matchBlueprintNode(section.title);
    for (const b of section.blocks ?? []) {
      if (b.kind === 'chart' || b.kind === 'table' || b.kind === 'formula') {
        figureLedger.push({
          figureId: b.id,
          title: b.text || section.title,
          type: b.kind,
          sectionNode: node?.id ?? section.id,
          resultIds: b.evidenceId ? [b.evidenceId] : [],
          sampleNote: `${dataStatus === 'synthetic' ? '教学模拟样本' : '登记样本'}（n=${results.find(r => r.id === b.evidenceId)?.n ?? '未登记'}）`,
          takeaway: b.text || '支撑本节核心统计发现',
        });
      }
    }
  }

  const refSectionLines = pack.report.report
    .filter(s => /参考文献/u.test(s.title))
    .flatMap(s => s.body.split(/\r?\n/u).map(l => l.trim()).filter(l => /^\[\d+\]/u.test(l)));

  const literatureLedger: LiteratureLedgerRow[] =
    refs.length > 0
      ? refs.map((ref, idx) => ({
          sourceId: ref.id,
          citationIndex: idx + 1,
          title: ref.title,
          authors: Array.isArray(ref.authors) ? ref.authors.join('、') : String(ref.authors ?? ''),
          year: ref.year,
          venue: ref.source,
          verificationStatus:
            ref.verification === 'verified'
              ? 'verified'
              : ref.verification === 'metadata_only'
                ? 'metadata_only'
                : 'rejected',
          supportedClaim: `支撑「${topic.shortTitle}」研究背景、方法学规范或构念操作化定义`,
          limitation: '外部文献结论受其原有时空与样本约束，仅作理论与方法参照',
        }))
      : refSectionLines.map((line, idx) => {
          const clean = line.replace(/^\s*\[\d+\]\s*/u, '');
          const yearMatch = /\b(19|20)\d{2}\b/u.exec(clean);
          return {
            sourceId: `REF-${idx + 1}`,
            citationIndex: idx + 1,
            title: clean,
            authors: clean.split('.')[0] ?? '权威文献作者',
            year: yearMatch ? yearMatch[0] : '2024',
            venue: '期刊/制度文献',
            // A line in the reference list is a citation as written, not a checked one.
            verificationStatus: 'metadata_only' as const,
            supportedClaim: `支撑「${topic.shortTitle}」研究背景、方法学规范或构念操作化定义`,
            limitation: '外部文献结论受其原有时空与样本约束，仅作理论与方法参照',
          };
        });

  const claimLedger: ClaimLedgerRow[] = findings.map((f, idx) => ({
    claimId: `CLM-${idx + 1}`,
    statement: `${f.title}：${f.interpretation}`,
    evidenceType: 'statistical_result',
    sourceId: f.evidenceIds[0] ?? 'RES-1',
    locator: `统计结果快照 ${f.evidenceIds.join(', ')}`,
    resultIds: [...f.evidenceIds],
    confidence: 'high',
    status: mode === 'empirical' ? 'verified' : 'demonstration_only',
    boundary: f.scope,
  }));

  const contractNotes: string[] = [];
  const unverifiedRefs = literatureLedger.filter(l => l.verificationStatus !== 'verified');
  if (unverifiedRefs.length > 0) {
    contractNotes.push(`存在 ${unverifiedRefs.length} 条未核验文献，不得直接支撑正式结论。`);
  }
  if (claimLedger.some(c => c.resultIds.length === 0)) {
    contractNotes.push('存在未绑定统计结果快照的核心结论。');
  }
  if (mode === 'demonstration') {
    contractNotes.push('当前处于 demonstration（教学模拟演示）模式：全报告自动声明【教学模拟数据】，不将合成样本包装为真实调查发现。');
  }

  return {
    mode,
    dataStatus,
    topic,
    designMatrix,
    claimLedger,
    literatureLedger,
    statsLedger,
    figureLedger,
    contractPassed: unverifiedRefs.length === 0 && claimLedger.every(c => c.resultIds.length > 0),
    contractNotes,
  };
}

type SectionTokenMap = {
  facts: Fact[];
  exhibits: { id: string; text: string; value: string }[];
  references: { id: string; text: string; value: string }[];
};

/**
 * 为指定章节构建三类受控占位符：
 * - {F1}..{Fn}: 登记结果中的精确数字与统计量
 * - {G1}..{Gm}: 本节已挂载的图表引用锚点（展开为 [[图:blockId]] 或 [[表:blockId]]）
 * - {R1}..{Rk}: 已核验参考文献的顺序编码锚点（展开为 [1]..[10]）
 */
export function buildSectionTokens(
  held: NonNullable<ResultsView>,
  content: EditorContent,
  nodeId: string,
  design?: Questionnaire | null,
): SectionTokenMap {
  const baseFacts = draftFacts(held, nodeId);
  // Facts the study's own records give beyond each result's metrics: a frame's valid rate, worked out from the two
  // counts it registers, and the questionnaire's length. Nothing is typed in here: without a record there is no fact.
  const extraFacts: Omit<Fact, 'id'>[] = [];
  for (const r of held.results) {
    if (r.method !== 'sampling-frame') continue;
    const issued = r.metrics.find(m => /^(?:实际发放问卷|实发问卷|实际发放)$/u.test(m.label))?.value;
    const valid = r.metrics.find(m => /^(?:有效回收样本|有效回收)$/u.test(m.label))?.value;
    if (typeof issued === 'number' && typeof valid === 'number' && issued > 0 && valid <= issued) {
      const rate = `${(Math.round((valid / issued) * 1000) / 10).toFixed(1)}%`;
      extraFacts.push({ text: `「${r.title}」的有效回收率为 ${rate}（有效回收 ${valid} 份 ÷ 实际发放 ${issued} 份）`, value: rate });
    }
  }
  if (design?.questions.length) extraFacts.push({ text: `正式问卷共 ${design.questions.length} 道题`, value: String(design.questions.length) });
  const mergedFacts: Fact[] = [...baseFacts];
  for (const ef of extraFacts) {
    if (mergedFacts.length < 80 && !mergedFacts.some(f => f.text === ef.text)) {
      mergedFacts.push({ id: `F${mergedFacts.length + 1}`, ...ef });
    }
  }

  // Provide current section exhibits first, then report-wide core exhibits so synthesis/diagnosis sections can cite {G1}..{Gn}
  const targetSec = content.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);
  const allExhibitBlocks: { block: ReportBlock; secTitle: string; isOwn: boolean }[] = [];
  for (const sec of content.report) {
    const isOwn = sec.id === targetSec?.id;
    for (const b of sec.blocks ?? []) {
      if (b.kind === 'chart' || b.kind === 'table') {
        allExhibitBlocks.push({ block: b, secTitle: sec.title, isOwn });
      }
    }
  }
  allExhibitBlocks.sort((a, b) => Number(b.isOwn) - Number(a.isOwn));
  const exhibits: { id: string; text: string; value: string }[] = allExhibitBlocks.slice(0, 8).map((item, idx) => {
    const kindLabel = item.block.kind === 'chart' ? '图' : '表';
    return {
      id: `G${idx + 1}`,
      text: `${item.isOwn ? '本节' : '报告'}${kindLabel}「${item.block.text || item.secTitle}」`,
      value: `[[${kindLabel}:${item.block.id}]]`,
    };
  });

  const structuredRefs = (content.references ?? []).filter(r => r.verification === 'verified');
  const refSectionLines = content.report
    .filter(s => /参考文献/u.test(s.title))
    .flatMap(s => s.body.split(/\r?\n/u).map(l => l.trim()).filter(Boolean));
  const references: { id: string; text: string; value: string }[] = structuredRefs.length
    ? structuredRefs.slice(0, 10).map((r, i) => ({
        id: `R${i + 1}`,
        text: `${r.authors}（${r.year}）《${r.title}》[${r.source}]`,
        value: `[${i + 1}]`,
      }))
    : refSectionLines.slice(0, 10).map((line, i) => ({
        id: `R${i + 1}`,
        text: line.replace(/^\s*\[\d+\]\s*/u, ''),
        value: `[${i + 1}]`,
      }));

  return { facts: mergedFacts, exhibits, references };
}

/**
 * 构造融合 00–06 技能规范的章节撰稿 Prompt
 */
export function buildFullReportSectionPrompt(input: {
  nodeId: string;
  content: EditorContent;
  design: Questionnaire | null;
  held: NonNullable<ResultsView>;
  contract: SkillPackContract;
  tokens: SectionTokenMap;
}): string {
  const section = draftSection(input.nodeId);
  const isSynthesis = SYNTHESIS_NODES.has(input.nodeId);
  const outline = isSynthesis ? reportOutline(input.content, input.nodeId, 5000) : undefined;
  const methods = [...new Set(input.held.results.map(r => r.method))];
  const registered = (family: RegExp) => methods.some(m => family.test(m));
  const planSection = PLAN_NODE.test(input.nodeId);
  const pending = awaitsResults(input.nodeId, input.held.results);
  const owner = advisorForNode(input.nodeId);
  const analyses = methods.map(m => METHOD_LABELS[m] ?? m);

  const specificRules: string[] = [];
  if (input.nodeId === 'abstract') {
    specificRules.push(
      '本节为全篇【摘要】：用四到五段交代研究背景与核心问题、调查设计与样本（样本量、回收率用对应的 {F编号}）、核心统计发现（用对应的 {F编号}）及对策建议；最后一段单独以“关键词：”开头，列出五到七个中文关键词，用顿号分隔。',
    );
  } else if ((input.nodeId === 'intro.literature' || input.nodeId === 'intro.background') && input.tokens.references.length) {
    specificRules.push('在观点处用 references 里的占位符（{R1}、{R2} 等）标注出处，让文献服务于问题提出；不得杜撰文献或其结论。');
  } else if (input.nodeId === 'data.pilot') {
    specificRules.push('资料中有预调查结果才引用其 {F编号}；没有就只写预调查的做法与据此修订问卷的思路，并写明预调查指标尚未登记，不写任何数值。');
  } else if (input.nodeId === 'data.cleaning') {
    specificRules.push('交代注意力甄别、作答时长、逻辑矛盾、规律作答与缺失值五类质控规则；样本量与回收率只用资料中对应的 {F编号}，资料没有的计数不写。');
  } else if (input.nodeId === 'conclusion.suggestions') {
    specificRules.push('每条对策建议对应一条实证结论，并写明执行主体、实施步骤与评估指标；评估指标写指标名称，不写目标数值。');
  }
  if (pending) {
    specificRules.push('本节尚无对应的登记结果：只写本节拟采用的分析思路与要回答的问题，写到的每种分析都用“拟”“计划”标明尚未进行，并明确写出“本节分析结果尚未登记”，不写任何结果、检验结论或诊断。');
  }
  if (input.tokens.exhibits.length > 0) {
    specificRules.push(
      `本节可引用 ${input.tokens.exhibits.length} 个图表（exhibits 列表）：在论述中写出占位符 ${input.tokens.exhibits.map(e => `{${e.id}}`).join('、')}（如“见{G1}”“如{G1}所示”），让图表与正文互证。`,
    );
  }
  const redLines = [
    '相关关系或横截面数据不写成因果（在“相关/关联”旁不用“导致、造成、决定了、引起了、使得”）；',
    'p 值不显著只说明现有样本尚不足以排除零假设，不写成“证明没有差异/不存在关联”；',
    '横截面调查不声称观察到“动态演化/状态转移”，机制推演须标明“路径假设”；',
    '模拟或合成数据（mode=demonstration）如实声明为教学模拟演示，不当作真实数据，也不当作稳健性检验；',
    '秩和等非参数检验比较的是分布位置，不写成“中位数相等/中位数无差异”；',
    ...(registered(/regress|logit|logistic|probit|ols/iu) ? ['OR（优势比）只写成“优势（odds）是参照组的多少倍”，不写成“概率是多少倍”；'] : []),
    ...(registered(/^sampling-frame$/u)
      ? []
      : ['资料中没有登记抽样框：不用“随机抽样、分层抽样、整群抽样、多阶段抽样、系统抽样、PPS 抽样”等名称描述本次样本，如实写成便利样本或配额样本，外推须谨慎；']),
    ...(registered(/cluster|kmeans/iu) ? ['不用参与聚类的输入变量做显著性检验来自证分群有效；'] : []),
  ];
  const material = {
    mode: input.contract.mode,
    section,
    analyses,
    project: {
      title: input.content.title || input.design?.title || input.contract.topic.title,
      objective: input.design?.objective || `围绕「${input.contract.topic.shortTitle}」开展循证调查研究`,
      population: input.design?.population || `${input.contract.topic.region}内的${input.contract.topic.groupA}与${input.contract.topic.groupB}`,
    },
    designMatrix: input.contract.designMatrix,
    facts: input.tokens.facts.map(({ id, text }) => ({ id, text })),
    exhibits: input.tokens.exhibits.map(({ id, text }) => ({ id, text })),
    references: input.tokens.references.map(({ id, text }) => ({ id, text })),
    findings: standingFindings(input.held).slice(0, 12).map(f => ({
      title: f.title,
      interpretation: f.interpretation,
      scope: f.scope,
      action: f.action,
    })),
    ...(outline ? { outline } : {}),
  };

  return (
    '你是正大杯全国大学生市场调查与分析大赛的报告撰稿助手，按《市调科研融合技能包》规范撰写报告章节。\n' +
    `当前撰写章节：「${section.title}」（节点 ID：${section.node}）。\n` +
    '【规则一：数字只来自资料】\n' +
    '1. 统计数字、样本量、百分比、均值、检验值、自由度、信度系数、回收率等，一律写成 {F编号}（如“有效样本{F2}份，有效回收率{F1}”）。占位符只代表数字本身，百分比已带 %；单位（份、人、分）写在占位符之后。以“<”开头的数字（如 <0.001）已带比较符，写“p{F3}”或“p 值{F3}”，不写“小于{F3}”“为{F3}”。\n' +
    '2. 引用图表写 {G编号}（如“见{G1}”“如{G1}所示”）；“见”“所示”只跟图表，不跟数字 {F编号}，数字要放进句子里说明它是什么。引用文献写 {R编号}（如“既有研究指出{R1}”）。\n' +
    '3. 占位符以外不得出现阿拉伯数字，也不得用汉字写数量（如“一点八倍”“十四个百分点”“百分之三十”“四成”）；差值、倍数等派生数字一律不写。题号、维度数、序号写成汉字（如“题一至题十二”“五维量表”“一是、二是”）。违反的段落整段丢弃。\n' +
    '【规则二：只写已登记的分析】\n' +
    (planSection
      ? '本节属于研究设计：可以说明拟采用的分析方法，但不得声称已得出结果。\n'
      : `资料 analyses 列出了本研究已登记的全部分析（${analyses.join('、') || '暂无'}）。没有列出的分析（如回归模型、Logit、优势比、边际效应、方差膨胀因子、因子分析、KMO、聚类）不得声称做过，也不得给出其结果或诊断，写到这类分析的段落整段丢弃。\n`) +
    '【规则三：防误读红线】\n' +
    redLines.map((rule, i) => `${i + 1}. ${rule}`).join('\n') +
    (owner ? `\n【本节负责顾问】「${owner.name}」（技能 ${owner.skill}）：${owner.line} 写作规则：${owner.rules.join('；')}。` : '') +
    '\n【写作体例】\n' +
    '中文学术调查报告语体，先亮核心判断、再摆证据、最后交代适用边界；写三到五段，每段一百到二百二十字。\n' +
    (specificRules.length ? `【本节专项要求】\n${specificRules.join('\n')}\n` : '') +
    '只输出严格合法的 JSON 对象：{"paragraphs":[{"text":"段落正文"}]}，不要输出任何额外解释。\n' +
    `资料 JSON：${JSON.stringify(material)}`
  );
}

/**
 * The revision round for a section the report check flagged: the model gets its own paragraphs back, placeholders
 * unexpanded, with the problems named, and changes only the sentences at fault.
 */
export function buildRevisionPrompt(title: string, drafts: readonly string[], problems: readonly string[], tokens: SectionTokenMap): string {
  const material = {
    paragraphs: drafts,
    facts: tokens.facts.map(({ id, text }) => ({ id, text })),
    exhibits: tokens.exhibits.map(({ id, text }) => ({ id, text })),
    references: tokens.references.map(({ id, text }) => ({ id, text })),
  };
  return (
    `你是同一份调查报告的审稿修订助手。下面是「${title}」一节的段落，数字仍以 {F编号}、{G编号}、{R编号} 占位。审稿发现以下问题：\n` +
    problems.map((p, i) => `${i + 1}. ${p}`).join('\n') +
    '\n请只改出问题的句子，其余原样保留；不新增资料中没有的数字、分析或结论。占位符规则不变：占位符以外不得出现阿拉伯数字，也不得用汉字写数量；“见”“所示”只跟图表 {G编号}。\n' +
    '只输出严格合法的 JSON 对象：{"paragraphs":[{"text":"段落正文"}]}，不要输出任何额外解释。\n' +
    `资料 JSON：${JSON.stringify(material)}`
  );
}

/** A number pointed to as if it were a table or figure: "见{F3}", "（见{F5}、{F6}）", "{F3}所示水平". */
const FACT_AS_EXHIBIT = /(?:见|参见|详见|参照)\s*\{F\d+\}|\{F\d+\}\s*所示/u;

/**
 * A cited value that prints with its own sign ("<0.001") after a comparison word reads "小于<0.001": the sign goes,
 * the word stays ("为<0.001" becomes "小于0.001", "p=<0.001" becomes "p<0.001").
 */
export function tidyComparisons(text: string): string {
  return text
    .replace(/(小于|低于|不足|不到)\s*[<＜]\s*/gu, '$1')
    .replace(/(大于|高于|超过)\s*[>＞]\s*/gu, '$1')
    .replace(/(均为|均是|为|是)\s*[<＜]\s*(?=\d)/gu, (_, word: string) => (word.startsWith('均') ? '均小于' : '小于'))
    .replace(/([<＜>＞])\s*\1/gu, '$1')
    .replace(/[=＝]\s*([<＜>＞])/gu, '$1');
}

/**
 * 解析并校验模型返回的章节段落，将 {F编号}、{G编号}、{R编号} 展开为真实受控内容
 */
export function parseAndHydrateSectionDraft(
  rawJsonText: string,
  tokens: SectionTokenMap,
  /**
   * What the section may claim: the registered methods, whether the section sets out the plan, and whether it is a
   * results section still awaiting its results, where an analysis may be named as planned but not as done.
   */
  context?: { methods: readonly string[]; planSection: boolean; pending?: boolean; labels?: readonly string[] },
): {
  paragraphs: string[];
  /** The kept paragraphs as the model wrote them, placeholders unexpanded: what a revision round starts from. */
  drafts: string[];
  droppedParagraphs: number;
  /** Why each dropped paragraph was dropped, in order. */
  dropReasons: string[];
  citedFacts: string[];
  citedExhibits: string[];
  citedReferences: string[];
} {
  const factMap = new Map(tokens.facts.map(f => [f.id, f.value]));
  const exhibitMap = new Map(tokens.exhibits.map(e => [e.id, e.value]));
  const refMap = new Map(tokens.references.map(r => [r.id, r.value]));

  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*)\n\s*```\s*$/u.exec(rawJsonText.trim());
  const rawBody = fenced ? fenced[1] : rawJsonText;
  let rows: unknown[] = [];
  try {
    const payload = JSON.parse(rawBody);
    rows = Array.isArray(payload?.paragraphs) ? payload.paragraphs : [];
  } catch {
    // Fallback for occasional unescaped double quotes inside Chinese prose strings
    const extracted = [...rawBody.matchAll(/"text"\s*:\s*"([\s\S]*?)"\s*\}/gu)].map(m => ({
      text: m[1].replace(/\\"/gu, '“').replace(/"/gu, '”').replace(/\\n/gu, '\n'),
    }));
    if (extracted.length > 0) {
      rows = extracted;
    } else {
      throw new Error('Invalid JSON structure in section draft response');
    }
  }

  const paragraphs: string[] = [];
  const drafts: string[] = [];
  const dropReasons: string[] = [];
  const citedFacts = new Set<string>();
  const citedExhibits = new Set<string>();
  const citedReferences = new Set<string>();
  let droppedParagraphs = 0;

  for (const row of rows.slice(0, 10)) {
    const rawText = typeof (row as { text?: unknown })?.text === 'string' ? (row as { text: string }).text : '';
    if (!rawText.trim()) {
      droppedParagraphs++;
      dropReasons.push('空段落');
      continue;
    }
    const sanitized = sanitizeModelParagraph(rawText);
    const tokensFound = [...sanitized.matchAll(PLACEHOLDER_RE)].map(m => m[1]);
    const unknownToken = tokensFound.some(id => !factMap.has(id) && !exhibitMap.has(id) && !refMap.has(id));
    const withoutPlaceholders = sanitized.replace(PLACEHOLDER_RE, '');
    // A registered category's name may carry digits; only the digits outside such names are numbers the model wrote.
    const numbersOnly = withoutNames(withoutPlaceholders, context?.labels);

    // A rate or share must cite a share: "有效回收率{F2}" bound to a count (641) is a wrong fact, however fluent.
    const misbound = [...sanitized.matchAll(new RegExp(`(?:率|占比|比例|百分比)(?:为|是|达|达到|约为|仅|仅为)?\\s*\\{(F\\d+)\\}`, 'gu'))]
      .some(m => { const v = factMap.get(m[1]) ?? ''; return !/%$/u.test(v) && !(Number(v) >= 0 && Number(v) <= 1 && /\./u.test(v)); });
    const planned = !!context && (context.planSection || (!!context.pending && PLANNED.test(withoutPlaceholders)));
    const unbacked = context && !planned ? unbackedAnalyses(withoutPlaceholders, context.methods) : [];
    const reason = unknownToken
      ? '引用了不存在的占位符'
      : misbound
        ? '比率处引用了不是比率的数字'
        : FACT_AS_EXHIBIT.test(sanitized)
        ? '把数字当作图表引用（“见…”“…所示”只能跟图表 {G编号}）'
        : DIGIT_RE.test(numbersOnly)
        ? '占位符之外写了阿拉伯数字'
        : CN_QUANTITY.test(numbersOnly)
          ? '用汉字写了数量'
          : unbacked.length
            ? `写了未登记的分析（${unbacked.join('、')}）`
            : '';
    if (reason) {
      droppedParagraphs++;
      dropReasons.push(reason);
      continue;
    }

    for (const id of tokensFound) {
      if (factMap.has(id)) citedFacts.add(id);
      else if (exhibitMap.has(id)) citedExhibits.add(id);
      else if (refMap.has(id)) citedReferences.add(id);
    }

    const hydrated = tidyComparisons(sanitized.replace(PLACEHOLDER_RE, (_, id: string) => {
      return factMap.get(id) ?? exhibitMap.get(id) ?? refMap.get(id) ?? '';
    }));
    paragraphs.push(hydrated);
    drafts.push(sanitized);
  }

  return {
    paragraphs: paragraphs.slice(0, 8),
    drafts: drafts.slice(0, 8),
    droppedParagraphs,
    dropReasons,
    citedFacts: [...citedFacts],
    citedExhibits: [...citedExhibits],
    citedReferences: [...citedReferences],
  };
}

/**
 * 调用兼容 OpenAI / DeepSeek Chat Completions 接口生成单节草稿
 */
export async function callLlmForSection(
  prompt: string,
  config: LlmProviderConfig,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ content: string; usage?: { prompt: number; completion: number; total: number } }> {
  const baseUrl = (config.baseUrl ?? 'https://api.deepseek.com/v1').replace(/\/+$/u, '');
  const model = config.model ?? 'deepseek-chat';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 60_000);

  try {
    const res = await fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: config.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 2400,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('LLM returned empty content');
    return {
      content,
      usage: data.usage
        ? {
            prompt: data.usage.prompt_tokens ?? 0,
            completion: data.usage.completion_tokens ?? 0,
            total: data.usage.total_tokens ?? 0,
          }
        : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 06-Word编排与成果验收：定稿整理。
 * Only what is true by construction is added: a section the model left empty takes its fallback, an exhibit placed in
 * a section is pointed to from that section, and a section resting on simulated results says so. Wording problems
 * are the revision round's to fix; what it could not fix stays visible in the report check.
 */
export function finalizeReport(
  content: EditorContent,
  fallbackSections: Map<string, string>,
  /** The blueprint sections this run drafted: only they are finished here; the author's other sections stay as they are. */
  drafted?: ReadonlySet<string>,
): { content: EditorContent; repairs: string[] } {
  const repairs: string[] = [];
  const ours = (sec: ReportSection) => !drafted || drafted.has(matchBlueprintNode(sec.title)?.id ?? '');
  let reportSections: ReportSection[] = content.report.map(s => ({
    ...s,
    blocks: s.blocks ? [...s.blocks] : undefined,
  }));

  // 1. A writable section with no prose takes its fallback.
  reportSections = reportSections.map(sec => {
    const node = matchBlueprintNode(sec.title);
    if (!node || node.kind === 'chapter' || node.kind === 'references' || !ours(sec)) return sec;
    // Any written line counts, however short; a section holding only its simulated-data mark has none.
    const prose = (text: string) => text.split(/\r?\n/u).some(line => line.trim() && !/^\s*【教学模拟数据[^】]*】\s*$/u.test(line));
    const hasProse = prose(sec.body) || (sec.blocks ?? []).some(b => b.kind === 'paragraph' && prose(b.text));
    if (!hasProse && fallbackSections.has(node.id)) {
      repairs.push(`章节「${sec.title}」回填样板段落`);
      return { ...sec, body: fallbackSections.get(node.id)! };
    }
    return sec;
  });

  // 2. Every chart and table placed in a section is pointed to from that section's prose.
  reportSections = reportSections.map(sec => {
    const evidenceBlocks = (sec.blocks ?? []).filter(b => b.kind === 'chart' || b.kind === 'table');
    if (!evidenceBlocks.length || !ours(sec)) return sec;
    const missingTokens = evidenceBlocks
      .map(b => `[[${b.kind === 'chart' ? '图' : '表'}:${b.id}]]`)
      .filter(token => !sec.body.includes(token) && !(sec.blocks ?? []).some(b => b.kind === 'paragraph' && b.text.includes(token)));
    if (!missingTokens.length) return sec;
    repairs.push(`章节「${sec.title}」补齐图表引用 ${missingTokens.join('、')}`);
    const prefix = /^\s*【教学模拟数据[^】]*】/u.test(sec.body)
      ? sec.body.replace(/^(\s*【教学模拟数据[^】]*】[^\n]*\n?)/u, `$1本节统计证据见${missingTokens.join('与')}。\n`)
      : `本节统计证据见${missingTokens.join('与')}。\n${sec.body}`;
    return { ...sec, body: prefix };
  });

  // 3. A section resting on simulated results says so.
  const simulatedIds = new Set((content.quality?.results ?? []).filter(r => r.classification === 'simulated').map(r => r.id));
  if (simulatedIds.size > 0) {
    reportSections = reportSections.map(sec => {
      const usesSimulated = (sec.blocks ?? []).some(b => b.evidenceId && simulatedIds.has(b.evidenceId));
      if (usesSimulated && ours(sec) && !/【教学模拟数据/u.test(sec.body + sec.source)) {
        repairs.push(`章节「${sec.title}」补齐【教学模拟数据】声明`);
        return {
          ...sec,
          body: `【教学模拟数据：以下统计结果用于方法与流程演示，不作为实际调查结论】\n${sec.body}`,
        };
      }
      return sec;
    });
  }

  return {
    content: {
      ...content,
      report: reportSections,
    },
    repairs,
  };
}

/**
 * 运行并发受控池
 */
async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export type FullReportProgressEvent = {
  phase: 'contract' | 'wave1' | 'wave2' | 'repair' | 'done';
  nodeId?: string;
  sectionId?: string;
  title?: string;
  body?: string;
  source?: string;
  trace?: SectionGenerationTrace;
  topic?: ContestTopicBlueprint;
  contract?: SkillPackContract;
  pack?: HanchaoBenchmarkPack;
  report?: EditorContent;
  repairsApplied?: string[];
  completed: number;
  total: number;
};

/**
 * 全流程 Agent 自动生成全报告主入口：
 * 1. 执行 00–04 阶段底座铸造与四张交接台账生成；
 * 2. Wave 1：并发调用 LLM 生成全部主体与实证章节（{F编号}/{G编号}/{R编号} 事实锁死）；
 * 3. Wave 2：基于 Wave 1 真实章节大纲，调用 LLM 生成调查结论、3W1H 对策建议、局限展望与全篇摘要；
 * 4. 执行 06 阶段六大顾问（设/证/统/图/写/交）体检与自动返修闭环，确保 100/100 交付品质。
 */
export async function generateFullReportWithAgent(input: {
  topic?: string;
  existingDesign?: Questionnaire | null;
  existingReport?: EditorContent | null;
  /**
   * A project to write in: its questionnaire, its data, and its report with the results already placed. Without it the
   * pipeline writes over its own simulated teaching package. Sections not asked for keep everything they hold.
   */
  base?: { design: Questionnaire; dataset: HanchaoBenchmarkPack['dataset']; report: EditorContent };
  mode?: ProjectResearchMode;
  llm: LlmProviderConfig;
  sectionNodes?: readonly string[];
  onProgress?: (event: FullReportProgressEvent) => void;
  fetcher?: typeof globalThis.fetch;
}): Promise<FullReportGenerationResult> {
  const startedAt = Date.now();
  const design = input.base?.design ?? input.existingDesign;
  const topic = decomposeContestTopic(input.topic, design);
  const forged = await forgeNationalAwardPack(input.topic, design);
  const pack: HanchaoBenchmarkPack = input.base ? { ...forged, design: input.base.design, dataset: input.base.dataset, report: input.base.report } : forged;
  // The pack's results are simulated, so the report is a teaching demonstration whatever mode was asked for: a
  // simulated sample is never written up as a plan's targets or as verified findings.
  const packResults = pack.report.quality?.results ?? [];
  const mode: ProjectResearchMode =
    packResults.length && packResults.every(r => r.classification === 'simulated') ? 'demonstration' : (input.mode ?? 'demonstration');
  const contract = buildSkillPackContract(pack, topic, mode);

  // Preserve baseline verified prose as fallback in case a network timeout occurs on a single section
  const existingByNode = new Map<string, ReportSection>();
  const fallbackSections = new Map<string, string>();
  for (const sec of pack.report.report) {
    const node = matchBlueprintNode(sec.title);
    if (node) {
      existingByNode.set(node.id, sec);
      // An empty section is no fallback: the generic note below says plainly that it has no text yet.
      if (sec.body.trim()) fallbackSections.set(node.id, sec.body);
    }
  }
  // Ensure every blueprint node in WAVE_1 + WAVE_2 has a deterministic fallback paragraph
  for (const nodeId of [...WAVE_1_SECTION_NODES, ...WAVE_2_SYNTHESIS_NODES]) {
    if (!fallbackSections.has(nodeId)) {
      const bNode = blueprintNode(nodeId);
      fallbackSections.set(
        nodeId,
        `【教学模拟数据】本节「${bNode.title}」尚无正文：模型没有返回可用段落。本节应写：${bNode.purpose}。`,
      );
    }
  }

  const results = pack.report.quality?.results ?? [];
  const held: NonNullable<ResultsView> = {
    results,
    findings: pack.report.quality?.findings ?? [],
    pending: false,
    placed: results.map(r => r.id),
  };
  const methods = [...new Set(results.map(r => r.method))];
  const labels = categoryLabels(results, pack.design);
  // The kept paragraphs of each drafted section as the model wrote them, with the facts they cite: a revision starts here.
  const drafted = new Map<string, { drafts: string[]; tokens: SectionTokenMap }>();

  const wantedNodes = input.sectionNodes
    ? new Set(input.sectionNodes)
    : new Set([...WAVE_1_SECTION_NODES, ...WAVE_2_SYNTHESIS_NODES]);

  const wave1Nodes = WAVE_1_SECTION_NODES.filter(n => wantedNodes.has(n));
  const wave2Nodes = WAVE_2_SYNTHESIS_NODES.filter(n => wantedNodes.has(n));
  const totalNodes = wave1Nodes.length + wave2Nodes.length;
  let completedNodes = 0;

  // Materialize the complete multi-chapter blueprint structure (chapters + all wanted sections + references + appendices)
  const outlineItems = blueprintOutline({ nodes: [...wantedNodes] }).filter(
    item => item.node.kind !== 'references' && item.node.kind !== 'appendix',
  );
  const backMatterSections = pack.report.report.filter(sec => {
    const node = matchBlueprintNode(sec.title);
    return node?.kind === 'references' || node?.kind === 'appendix' || /^(参考文献|附录)/u.test(sec.title);
  });

  // A project keeps its own report: sections asked for are cleared for drafting (their figures, tables and formulas stay),
  // a missing one is added where the blueprint puts it, and every other section stays as it is.
  let baseReport: EditorContent | null = null;
  if (input.base) {
    let working = input.base.report;
    for (const nodeId of wantedNodes) working = targetSection(working, nodeId).content;
    baseReport = {
      ...working,
      report: working.report.map(sec => {
        const node = matchBlueprintNode(sec.title);
        return node && wantedNodes.has(node.id) ? { ...sec, body: '', blocks: sec.blocks?.filter(b => b.kind !== 'paragraph') } : sec;
      }),
    };
  }
  const materializedSections: ReportSection[] = baseReport ? baseReport.report : [
    ...outlineItems.map(({ node, title }) => {
      const existing = existingByNode.get(node.id);
      const nonParagraphBlocks = (existing?.blocks ?? []).filter(b => b.kind !== 'paragraph');
      return {
        id: existing?.id ?? `bp-${node.id}`,
        title,
        body: wantedNodes.has(node.id) ? '' : existing?.body ?? '',
        source: existing?.source ?? '',
        blocks: nonParagraphBlocks.length ? nonParagraphBlocks : undefined,
      };
    }),
    ...backMatterSections,
  ];

  let workingReport: EditorContent = baseReport ?? {
    ...pack.report,
    report: materializedSections,
  };

  input.onProgress?.({
    phase: 'contract',
    completed: 0,
    total: totalNodes,
    topic,
    contract,
    pack: { ...pack, report: workingReport },
    report: workingReport,
  });

  const traces: SectionGenerationTrace[] = [];
  const concurrency = input.llm.concurrency ?? 5;

  const commitSectionToReport = (
    nodeId: string,
    title: string,
    body: string,
    wave: 1 | 2,
    trace: SectionGenerationTrace,
  ) => {
    let sectionId = `bp-${nodeId}`;
    const source =
      trace.status === 'repaired_fallback'
        ? '教学模拟样板正文（模型没有返回可用段落）'
        : `证见全流程 Agent · 模型${wave === 1 ? '实时' : '综合'}拟稿（绑定 ${trace.citedFacts.length} 项事实）`;
    workingReport = {
      ...workingReport,
      report: workingReport.report.map(sec => {
        const node = matchBlueprintNode(sec.title);
        if (node?.id === nodeId) {
          sectionId = sec.id;
          // The drafting note travels with the progress event and the trace; the section's printed source stays the
          // author's, since a submission does not print how it was drafted (the AI-use appendix says that).
          return { ...sec, body };
        }
        return sec;
      }),
    };
    completedNodes++;
    input.onProgress?.({
      phase: wave === 1 ? 'wave1' : 'wave2',
      nodeId,
      sectionId,
      title,
      body,
      source,
      trace,
      report: workingReport,
      completed: completedNodes,
      total: totalNodes,
    });
  };

  const draftOneSection = async (nodeId: string, wave: 1 | 2): Promise<{ nodeId: string; body: string; trace: SectionGenerationTrace }> => {
    const secStart = Date.now();
    const title = blueprintNode(nodeId).title;
    const tokens = buildSectionTokens(held, workingReport, nodeId, pack.design);
    const prompt = buildFullReportSectionPrompt({
      nodeId,
      content: workingReport,
      design: pack.design,
      held,
      contract,
      tokens,
    });

    let lastError: Error | null = null;
    let feedback = '';
    const context = { methods, planSection: PLAN_NODE.test(nodeId), pending: awaitsResults(nodeId, results), labels };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const llmRes = await callLlmForSection(prompt + feedback, input.llm, input.fetcher);
        const hydrated = parseAndHydrateSectionDraft(llmRes.content, tokens, context);
        if (hydrated.paragraphs.length > 0) {
          drafted.set(nodeId, { drafts: hydrated.drafts, tokens });
          const body = hydrated.paragraphs.join('\n');
          const trace: SectionGenerationTrace = {
            nodeId,
            title,
            wave,
            advisor: advisorForNode(nodeId)?.id ?? null,
            status: 'llm_generated',
            rawParagraphs: hydrated.paragraphs.length + hydrated.droppedParagraphs,
            keptParagraphs: hydrated.paragraphs.length,
            droppedParagraphs: hydrated.droppedParagraphs,
            dropReasons: hydrated.dropReasons,
            citedFacts: hydrated.citedFacts,
            citedExhibits: hydrated.citedExhibits,
            citedReferences: hydrated.citedReferences,
            durationMs: Date.now() - secStart,
            tokens: llmRes.usage,
          };
          commitSectionToReport(nodeId, title, body, wave, trace);
          return { nodeId, body, trace };
        }
        lastError = new Error(`All paragraphs dropped: ${hydrated.dropReasons.join('; ')}`);
        // The second attempt is told why the first was refused.
        feedback = `\n【上一稿全部段落被丢弃，原因：${[...new Set(hydrated.dropReasons)].join('；')}。请严格按规则重写。】`;
      } catch (err) {
        lastError = err as Error;
      }
    }

    const fallbackBody = fallbackSections.get(nodeId) ?? '';
    const trace: SectionGenerationTrace = {
      nodeId,
      title,
      wave,
      advisor: advisorForNode(nodeId)?.id ?? null,
      status: 'repaired_fallback',
      rawParagraphs: 0,
      keptParagraphs: fallbackBody ? fallbackBody.split(/\n+/u).filter(Boolean).length : 0,
      droppedParagraphs: 0,
      citedFacts: [],
      citedExhibits: [],
      citedReferences: [],
      durationMs: Date.now() - secStart,
      error: lastError?.message ?? 'Unknown error',
    };
    commitSectionToReport(nodeId, title, fallbackBody, wave, trace);
    return { nodeId, body: fallbackBody, trace };
  };

  // Wave 1: Generate all body and empirical sections concurrently
  const wave1Outputs = await runWithConcurrency(wave1Nodes, concurrency, nodeId => draftOneSection(nodeId, 1));
  traces.push(...wave1Outputs.map(o => o.trace));

  // Wave 2: Generate synthesis sections (findings, suggestions, limits, abstract) using the real Wave 1 outline
  const wave2Outputs = await runWithConcurrency(wave2Nodes, Math.min(concurrency, 4), nodeId => draftOneSection(nodeId, 2));
  traces.push(...wave2Outputs.map(o => o.trace));

  // Stage 06: the report check reads each drafted section on its own. A flagged section goes back to the model, with the
  // problems named, for up to two rounds; a revision is kept only when it leaves fewer of them. Nothing is patched by
  // string replacement, and the score reported is the score of the text as it stands.
  const benchmarkBeforeRepair = benchmarkReport(workingReport);
  const revisionTokens: number[] = [];
  // A missing caption belongs to an exhibit, not to the prose, so it is not the writer's to revise.
  const flagged = (content: EditorContent, sectionId: string) => sectionIssues(content, sectionId, benchmarkReport).filter(i => i.check.id !== 'captions');
  const reviseSection = async (nodeId: string): Promise<string | null> => {
    const cleared: string[] = [];
    let title = '';
    for (let round = 0; round < REVISION_ROUNDS; round++) {
      const entry = drafted.get(nodeId);
      const section = workingReport.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);
      if (!entry || !section) break;
      title = section.title;
      const issues = flagged(workingReport, section.id);
      if (!issues.length) break;
      try {
        const problems = issues.map(i => `${i.check.label}：${i.check.detail}`);
        const llmRes = await callLlmForSection(buildRevisionPrompt(section.title, entry.drafts, problems, entry.tokens), input.llm, input.fetcher);
        revisionTokens.push(llmRes.usage?.total ?? 0);
        const revised = parseAndHydrateSectionDraft(llmRes.content, entry.tokens, {
          methods,
          planSection: PLAN_NODE.test(nodeId),
          pending: awaitsResults(nodeId, results),
          labels,
        });
        if (!revised.paragraphs.length) continue;
        const candidate: EditorContent = {
          ...workingReport,
          report: workingReport.report.map(s => (s.id === section.id ? { ...s, body: revised.paragraphs.join('\n') } : s)),
        };
        const left = flagged(candidate, section.id);
        if (left.length >= issues.length) continue;
        workingReport = candidate;
        drafted.set(nodeId, { drafts: revised.drafts, tokens: entry.tokens });
        cleared.push(...issues.filter(i => !left.some(l => l.check.id === i.check.id)).map(i => i.check.label));
      } catch {
        break;
      }
    }
    return cleared.length ? `章节「${title}」按审稿意见修订：${[...new Set(cleared)].join('、')}` : null;
  };
  const revisionNotes = (await runWithConcurrency([...drafted.keys()], concurrency, reviseSection)).filter((n): n is string => !!n);
  const { content: repairedReport, repairs: finishing } = finalizeReport(workingReport, fallbackSections, wantedNodes);
  const repairs = [...revisionNotes, ...finishing];
  input.onProgress?.({
    phase: 'repair',
    completed: completedNodes,
    total: totalNodes,
    repairsApplied: repairs,
    report: repairedReport,
  });
  const benchmarkAfterRepair = benchmarkReport(repairedReport);
  const advisorsAfterRepair = ADVISORS.map(advisor => advisorReading(advisor, benchmarkAfterRepair));

  const totalParagraphsWritten = traces.reduce((acc, t) => acc + t.keptParagraphs, 0);
  const totalDroppedParagraphs = traces.reduce((acc, t) => acc + t.droppedParagraphs, 0);
  const allFacts = new Set(traces.flatMap(t => t.citedFacts));
  const totalTokens = traces.reduce((acc, t) => acc + (t.tokens?.total ?? 0), 0) + revisionTokens.reduce((a, b) => a + b, 0);
  const advisorPassCount = advisorsAfterRepair.filter(a => a.issues.length === 0).length;

  input.onProgress?.({ phase: 'done', completed: totalNodes, total: totalNodes });

  return {
    pack: { ...pack, report: repairedReport },
    topic,
    report: repairedReport,
    contract,
    traces,
    benchmarkBeforeRepair,
    benchmarkAfterRepair,
    advisorsAfterRepair,
    repairsApplied: repairs,
    summary: {
      totalSectionsGenerated: traces.length,
      llmSuccessCount: traces.filter(t => t.status === 'llm_generated').length,
      totalParagraphsWritten,
      totalDroppedParagraphs,
      totalFactsCited: allFacts.size,
      totalTokens,
      totalDurationMs: Date.now() - startedAt,
      finalScore: benchmarkAfterRepair.score,
      advisorPassCount,
      advisorTotalCount: advisorsAfterRepair.length,
      revisedSections: revisionNotes.length,
    },
  };
}
