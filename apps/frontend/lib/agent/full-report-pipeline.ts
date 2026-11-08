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
 * - 06-Word编排与成果验收：运行本地规则检查及有限内容返修；独立审稿、文件导出、渲染和提交门禁另行验收。
 */

import { createEditorContent, parseEditorContent, type EditorContent, type ReportSection } from '../editor-model.ts';
import { ANALYSIS_PLANS, parseQuestionnaire, type Questionnaire } from '../questionnaire.ts';
import type { DatasetValue } from '../canvas/execute.ts';
import { type BenchmarkResult, benchmarkReport } from '../report-benchmark.ts';
import { blueprintNode, matchBlueprintNode } from '../report-blueprint.ts';
import { METHOD_LABELS, suggestedNode, targetSection } from '../report-placement.ts';
import { verifyResearchQuality, type ReportBlock, type ResultSnapshot } from '../research-quality.ts';
import { ADVISORS, type AdvisorReading, advisorForNode, advisorReading, sectionIssues } from './advisors.ts';
import { type Fact, SYNTHESIS_NODES, draftFacts, draftSection, reportOutline } from './draft.ts';
import { buildDemoPack, decomposeTopic, noteDrafting, type DemoBlueprint, type DemoPack } from './demo-study.ts';
import { standingFindings, type ResultsView } from './router.ts';

export type ProjectResearchMode = 'plan' | 'demonstration' | 'empirical';
export type ProjectDataStatus = 'planned' | 'collected' | 'verified' | 'synthetic';

export type FullReportPack = Omit<DemoPack, 'dataset'> & { dataset: DatasetValue | null };
export type FullReportBase = Pick<FullReportPack, 'design' | 'dataset' | 'report'>;
export type FullReportProjectScope = { projectId: string; runId: string; inputRevision: string };
export type FullReportSectionRequest = {
  prompt: string;
  nodeId: string;
  wave: 1 | 2;
  attempt: number;
  purpose: 'draft' | 'revision';
  signal?: AbortSignal;
};
export type FullReportUsage = { prompt: number; completion: number; total: number };
export type FullReportSectionGenerator = (request: FullReportSectionRequest) => Promise<{ content: string; usage?: FullReportUsage }>;
export type FullReportRevision = {
  id: string;
  nodeId: string;
  sectionId: string;
  before: string;
  after: string;
  reason: string;
  checkIds: string[];
  kind: 'model_revision' | 'finishing';
};
export type FullReportQuality = {
  status: 'draft' | 'needs_review' | 'blocked';
  deliverable: false;
  checks: { id: string; label: string; status: 'pass' | 'warning' | 'failed' | 'not_run'; detail: string }[];
  blockers: string[];
};

/** Stable, safe error codes are part of the server/UI contract. Provider response bodies never enter them. */
export class FullReportInputError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FullReportInputError';
    this.code = code;
  }
}
const PROVIDER_MESSAGES: Record<string, string> = {
  provider_auth: '模型服务鉴权失败，请检查已保存的服务配置。',
  provider_quota: '模型服务额度不足，本次运行已停止继续发起请求。',
  provider_rate_limit: '模型服务触发限流，本次运行已停止继续发起请求。',
  service_version_conflict: '模型服务配置版本已变化，请重新检查配置后运行。',
  outcome_unknown: '模型调用结果未知，可能已产生费用；请先核对服务记录。',
  provider_failed: '模型服务调用失败，本节保留原稿或待补写说明。',
  invalid_provider_response: '模型服务未返回可识别的响应，本次调用结果需核对。',
  content_rejected: '模型返回的正文未通过本地内容检查。',
  run_stopped: '本次运行已停止继续调用模型，本节保留原稿或待补写说明。',
  network_outcome_unknown: '模型调用结果未知，可能已产生费用；请先核对服务记录。',
  invalid_server_receipt: '模型服务回执无效，调用结果与费用需要核对。',
  invalid_report_input: '报告输入未通过服务校验，本次运行已停止。',
  input_revision_changed: '项目输入版本已变化，本次运行已停止。',
  unauthorized: '当前模型服务授权已失效，本次运行已停止。',
  forbidden: '当前账号没有该模型服务的使用权限，本次运行已停止。',
  model_service_unavailable: '当前模型服务不可用，本次运行已停止。',
};
export class FullReportProviderError extends Error {
  code: string;
  unknown: boolean;
  status?: number;
  constructor(code: string, options: { unknown?: boolean; status?: number } = {}) {
    const safeCode = Object.hasOwn(PROVIDER_MESSAGES, code) ? code : 'provider_failed';
    super(PROVIDER_MESSAGES[safeCode]);
    this.name = 'FullReportProviderError';
    this.code = safeCode;
    this.unknown = options.unknown === true || ['outcome_unknown', 'network_outcome_unknown', 'invalid_server_receipt'].includes(safeCode);
    this.status = Number.isInteger(options.status) && options.status! >= 400 && options.status! <= 599 ? options.status : undefined;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('本次运行已取消。', 'AbortError');
}

/** Provenance checks establish consistency of registered input; they do not certify fieldwork or statistical validity. */
export async function validateFullReportBase(
  base: FullReportBase | undefined,
  mode: ProjectResearchMode,
  project?: FullReportProjectScope,
): Promise<void> {
  if (!['plan', 'demonstration', 'empirical'].includes(mode)) throw new FullReportInputError('invalid_mode', '请选择有效的研究模式。');
  if (project && (![project.projectId, project.runId, project.inputRevision].every(v => typeof v === 'string' && v.trim() && v.length <= 200))) {
    throw new FullReportInputError('invalid_project_scope', '项目、运行和输入版本标识不完整。');
  }
  if (!base) {
    if (mode === 'demonstration') return;
    throw new FullReportInputError('base_required', '研究计划和实证报告须提供当前项目的问卷与报告底座。');
  }
  try {
    parseQuestionnaire(JSON.stringify(base.design));
    parseEditorContent(structuredClone(base.report));
  } catch {
    throw new FullReportInputError('invalid_base', '项目问卷或报告结构无效，请重新载入项目。');
  }
  const results = base.report.quality?.results ?? [];
  const dataset = base.dataset;
  if (dataset !== null) {
    if (!dataset || !['simulated', 'user_provided'].includes(dataset.kind)
      || typeof dataset.sourceHash !== 'string' || !/^[a-f0-9]{64}$/u.test(dataset.sourceHash)
      || !dataset.table || !Array.isArray(dataset.table.headers) || !dataset.table.headers.length
      || !Array.isArray(dataset.table.rows) || !dataset.table.rows.length
      || !dataset.table.headers.every(h => typeof h === 'string')
      || !dataset.table.rows.every(row => Array.isArray(row) && row.length === dataset.table.headers.length && row.every(cell => typeof cell === 'string'))) {
      throw new FullReportInputError('invalid_dataset', '数据集结构或来源指纹不完整，请重新登记数据。');
    }
  }
  if (mode === 'demonstration') {
    if (dataset?.kind !== 'simulated' || results.some(r => r.classification !== 'simulated')) {
      throw new FullReportInputError('mode_conflict', '教学演示仅接受明确标记的模拟数据与模拟结果。');
    }
  } else if (dataset?.kind === 'simulated' || results.some(r => r.classification === 'simulated')) {
    throw new FullReportInputError('mode_conflict', '模拟数据不能用于研究计划或实证报告模式，请明确选择教学演示。');
  }
  if (mode === 'empirical') {
    if (!project || /^(?:local|demo|demonstration)(?:$|[-_:])/iu.test(project.projectId)) {
      throw new FullReportInputError('saved_project_required', '实证报告须绑定已保存的项目和当前输入版本。');
    }
    if (dataset?.kind !== 'user_provided' || !results.length) {
      throw new FullReportInputError('empirical_evidence_required', '实证报告须提供真实数据集及已登记的分析结果。');
    }
  }
  if (results.length) {
    if (!dataset || results.some(r => r.sourceHash !== dataset.sourceHash)) {
      throw new FullReportInputError('source_hash_mismatch', '分析结果与当前数据的来源指纹不一致，请重新登记计算结果。');
    }
    try {
      await verifyResearchQuality(base.report.quality!);
    } catch {
      throw new FullReportInputError('result_hash_mismatch', '分析结果指纹校验未通过，请重新登记计算结果。');
    }
  }
}

/** 00-市调研究全流程：四张跨阶段交接台账 */
export type ClaimLedgerRow = {
  claimId: string;
  statement: string;
  evidenceType: 'statistical_result' | 'verified_literature' | 'design_rule';
  sourceId: string;
  locator: string;
  resultIds: string[];
  confidence: 'high' | 'medium' | 'unassessed';
  status: 'verified' | 'demonstration_only' | 'planned' | 'needs_review';
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
  topic: DemoBlueprint;
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
  errorCode?: string;
  httpStatus?: number;
  outcomeUnknown?: boolean;
};

export type FullReportGenerationResult = {
  pack: FullReportPack;
  project?: FullReportProjectScope;
  topic: DemoBlueprint;
  report: EditorContent;
  contract: SkillPackContract;
  traces: SectionGenerationTrace[];
  benchmarkBeforeRepair: BenchmarkResult;
  benchmarkAfterRepair: BenchmarkResult;
  advisorsAfterRepair: AdvisorReading[];
  repairsApplied: string[];
  revisions: FullReportRevision[];
  quality: FullReportQuality;
  summary: {
    totalSectionsGenerated: number;
    llmSuccessCount: number;
    totalParagraphsWritten: number;
    totalDroppedParagraphs: number;
    totalFactsCited: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    usageReported: boolean;
    fallbackCount: number;
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
  pack: FullReportPack,
  topic: DemoBlueprint,
  mode: ProjectResearchMode = 'demonstration',
): SkillPackContract {
  const dataStatus: ProjectDataStatus = mode === 'empirical' ? 'collected' : mode === 'demonstration' ? 'synthetic' : 'planned';
  const results = pack.report.quality?.results ?? [];
  const findings = pack.report.quality?.findings ?? [];
  const refs = pack.report.references ?? [];

  const designMatrix: DesignMatrixRow[] = mode === 'demonstration' ? [
    {
      rqId: 'RQ1',
      question: `「${topic.shortTitle}」中${topic.groupA}与${topic.groupB}的${topic.statusConstruct}是否不同？`,
      decisionMeaning: '决定服务资源是统一投放，还是按人群分别安排',
      construct: `${topic.groupConstruct} × ${topic.statusConstruct}`,
      itemIds: ['Q1', 'Q2', 'Q8'],
      analysisMethod: '列联表 Pearson χ² 检验与 Cramér’s V 效应量',
      boundary: '横截面列联检验仅反映群体分布关联，不作个体动态跃迁轨迹推断',
    },
    {
      rqId: 'RQ2',
      question: `${topic.scaleConstruct}是否可靠，哪些方面重要而表现偏低？`,
      decisionMeaning: '找出应优先改进的服务短板，避免在不敏感的环节过度投入',
      construct: `五个方面的体验（${topic.dimensions.map(d => d.short).join('、')}）`,
      itemIds: ['Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
      analysisMethod: 'Cronbach α 内部一致性检验 + 均值比较（Welch t / Welch F）+ 重要性—表现分析',
      boundary: '均值差异受限于样本覆盖范围，外推到样本以外的人群前需重新评估',
    },
    {
      rqId: 'RQ3',
      question: `${topic.overallSatConstruct}、${topic.mechanismConstruct}与${topic.conversionConstruct}之间的关联有多强？`,
      decisionMeaning: '判断改善体验与推行机制对持续使用的带动潜力',
      construct: `${topic.mechanismConstruct}、${topic.overallSatConstruct}与${topic.conversionConstruct}`,
      itemIds: ['Q9', 'Q10', 'Q11', 'Q12'],
      analysisMethod: 'Spearman 秩相关检验',
      boundary: '陈述性意愿不等于实际行为，相关系数不直接等同于因果效应',
    },
  ] : pack.design.questions.filter(q => q.researchQuestion.trim() || q.construct.trim()).map((q, idx) => ({
    rqId: `RQ${idx + 1}`,
    question: q.researchQuestion || '研究问题尚未登记',
    decisionMeaning: q.decisionUse || '决策用途尚未登记',
    construct: q.construct || '构念尚未登记',
    itemIds: [q.variable || q.id],
    analysisMethod: ANALYSIS_PLANS[q.analysis],
    boundary: '由当前问卷设计登记；分析方法适用性、抽样覆盖和推断范围仍需审查。',
  }));

  const statsLedger: StatsLedgerRow[] = results.map(r => {
    const rqId = designMatrix.find(row => row.itemIds.some(id => r.variables?.includes(id)))?.rqId ?? '尚未映射';
    const primaryMetric = r.metrics[0];
    const inference = r.receipt?.inference?.primary;
    const effect = inference?.effect;
    const interval = effect?.interval;
    return {
      resultId: r.id,
      rqId,
      method: r.method,
      sampleN: r.n,
      estimate: primaryMetric ? `${primaryMetric.label}=${primaryMetric.value ?? 'N/A'}` : `n=${r.n}`,
      ci95: interval ? `[${interval.lower}, ${interval.upper}]` : '未登记置信区间',
      pValue: typeof inference?.p === 'number' ? String(inference.p) : '未登记检验 p 值',
      effectSize: effect ? `${effect.name}=${effect.value ?? '未估计'}` : '未登记效应量',
      assumptionCheck: r.warnings.length ? r.warnings.join('；') : '未独立核验统计前提；无警告不代表前提成立',
      figureId: pack.report.report.flatMap(s => s.blocks ?? []).find(b => b.evidenceId === r.id && (b.kind === 'chart' || b.kind === 'table'))?.id ?? '',
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
          supportedClaim: '具体论点与原文支持关系尚待逐条核对',
          limitation: '外部文献结论受其原有时空与样本约束，仅作理论与方法参照',
        }))
      : refSectionLines.map((line, idx) => {
          const clean = line.replace(/^\s*\[\d+\]\s*/u, '');
          const yearMatch = /\b(19|20)\d{2}\b/u.exec(clean);
          return {
            sourceId: `REF-${idx + 1}`,
            citationIndex: idx + 1,
            title: clean,
            authors: '',
            year: yearMatch ? yearMatch[0] : '',
            venue: '',
            // A line in the reference list is a citation as written, not a checked one.
            verificationStatus: 'metadata_only' as const,
            supportedClaim: '仅记录原有参考文献文本，尚未核验其元数据或论点',
            limitation: '未核验条目不能作为已核验引文交给模型引用',
          };
        });

  const claimLedger: ClaimLedgerRow[] = findings.map((f, idx) => ({
    claimId: `CLM-${idx + 1}`,
    statement: `${f.title}：${f.interpretation}`,
    evidenceType: 'statistical_result',
    sourceId: f.evidenceIds[0] ?? '',
    locator: `统计结果快照 ${f.evidenceIds.join(', ')}`,
    resultIds: [...f.evidenceIds],
    confidence: 'unassessed',
    status: mode === 'empirical' ? 'needs_review' : mode === 'plan' ? 'planned' : 'demonstration_only',
    boundary: f.scope,
  }));

  const contractNotes: string[] = [];
  const unverifiedRefs = literatureLedger.filter(l => l.verificationStatus !== 'verified');
  if (unverifiedRefs.length > 0) {
    contractNotes.push(`存在 ${unverifiedRefs.length} 条未核验文献，不得直接支撑正式结论。`);
  }
  const evidenceIds = new Set(results.map(r => r.id));
  const missingBindings = claimLedger.some(c => !c.resultIds.length || c.resultIds.some(id => !evidenceIds.has(id)));
  if (missingBindings) {
    contractNotes.push('存在未绑定当前统计结果快照的核心结论。');
  }
  if (!designMatrix.length) contractNotes.push('当前问卷尚未登记研究问题与构念映射。');
  contractNotes.push('台账检查仅检查登记的一致性；统计假设、文献原文和结论支持关系未在本流水线中独立核验。');
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
    contractPassed: designMatrix.length > 0 && unverifiedRefs.length === 0 && !missingBindings,
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
 * - {R1}..{Rk}: 已登记为核验的参考文献稳定锚点（展开为 [[引:referenceId]]）
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
  // The study's own records come first: a long list of results would otherwise fill the eighty places before them.
  const mergedFacts: Fact[] = [...extraFacts, ...baseFacts.map(({ text, value }) => ({ text, value }))]
    .filter((f, i, all) => all.findIndex(g => g.text === f.text) === i)
    .slice(0, 80)
    .map((f, i) => ({ id: `F${i + 1}`, ...f }));

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
  const references: { id: string; text: string; value: string }[] = structuredRefs.slice(0, 10).map((r, i) => ({
        id: `R${i + 1}`,
        text: `${r.authors}（${r.year}）《${r.title}》[${r.source}]`,
        value: `[[引:${r.id}]]`,
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
  const planSection = input.contract.mode === 'plan' || PLAN_NODE.test(input.nodeId);
  const pending = input.contract.mode === 'plan' || awaitsResults(input.nodeId, input.held.results);
  const owner = advisorForNode(input.nodeId);
  const analyses = methods.map(m => METHOD_LABELS[m] ?? m);

  const specificRules: string[] = [];
  if (input.contract.mode === 'plan') {
    specificRules.push('当前是研究计划：全部调查、分析与行动均作为拟开展事项，不能把目标样本当成已回收样本，不能声称已经发现、验证或完成调查；摘要只概述研究问题、拟采用方法和待验证的预期用途。');
  }
  if (input.nodeId === 'abstract') {
    specificRules.push(
      '本节为全篇【摘要】：交代研究背景与核心问题、已登记的设计与证据边界；有实际结果才归纳发现，缺少结果则明确写待验证；最后一段单独以“关键词：”开头，列出五到七个中文关键词，用顿号分隔。',
    );
  } else if ((input.nodeId === 'intro.literature' || input.nodeId === 'intro.background') && input.tokens.references.length) {
    specificRules.push('在观点处用 references 里的占位符（{R1}、{R2} 等）标注出处，让文献服务于问题提出；不得杜撰文献或其结论。');
  } else if (input.nodeId === 'data.pilot') {
    specificRules.push('资料中有预调查结果才引用其 {F编号}；没有就只写预调查的做法与据此修订问卷的思路，并写明预调查指标尚未登记，不写任何数值。');
  } else if (input.nodeId === 'data.cleaning') {
    // Only the rules the registered screening applied: a rule the data had no column for was not run.
    const screening = input.held.results.find(r => r.method === 'quality-control');
    const applied = screening ? [...new Set(screening.rows.map(row => String(row[0] ?? '').trim()).filter(Boolean))] : [];
    specificRules.push(applied.length
      ? `交代本次质量筛查实际采用的规则：${applied.join('、')}（各规则是剔除还是仅标记，以筛查结果表为准）；没有采用的规则（如作答时长、逻辑矛盾）不写成已经做过。样本量与回收率只用资料中对应的 {F编号}，资料没有的计数不写。`
      : '资料中没有登记质量筛查结果：只写拟采用的筛查规则，并写明筛查结果尚未登记，不写任何计数。');
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
      : ['资料中没有登记抽样框：不用“随机抽样、分层抽样、整群抽样、多阶段抽样、系统抽样、PPS 抽样”等名称声称已完成抽样，不推定采用过便利或配额抽样；如实写明抽样方式与覆盖范围待确认，外推须谨慎；']),
    ...(registered(/cluster|kmeans/iu) ? ['不用参与聚类的输入变量做显著性检验来自证分群有效；'] : []),
  ];
  const material = {
    mode: input.contract.mode,
    section,
    analyses,
    project: {
      title: input.content.title || input.design?.title || input.contract.topic.title,
      objective: input.design?.objective || '研究目标尚未提供',
      population: input.design?.population || '目标人群尚未提供',
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

/** Catch concrete context substitutions; a valid numeric token alone does not establish the sentence it is used in. */
function mismatchedFactContext(text: string, facts: readonly Fact[]): string | null {
  for (const match of text.matchAll(/\{(F\d+)\}/gu)) {
    const fact = facts.find(f => f.id === match[1]);
    if (!fact) continue;
    const prefix = text.slice(0, match.index).split(/[。；！？\n]/u).at(-1) ?? '';
    const immediate = prefix.split(/[，,]/u).at(-1) ?? '';
    if (/有效回收率|回收比例/u.test(fact.text)
      && /占比|比例|比率|百分比|率/u.test(prefix)
      && !/回收率|回收比例/u.test(prefix)) return '把回收率用于其他人群或指标的比例';
    const totalSample = /有效样本|总样本|样本总数|参与分析的样本/u.test(fact.text) && !/中「[^」]+」/u.test(fact.text);
    if (totalSample && /(?:其中|某组|该组|子组|组内|选择「[^」]+」|「[^」]+」(?:组|人群|受访者))[^。；]*$/u.test(immediate)
      && !/全部|总体|总样本/u.test(immediate)) return '把分析总样本数用于未登记的分组人数';
  }
  return null;
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
  context?: { methods: readonly string[]; planSection: boolean; pending?: boolean; labels?: readonly string[]; mode?: ProjectResearchMode },
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

  for (const row of rows.slice(0, 8)) {
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
    const mismatched = mismatchedFactContext(sanitized, tokens.facts);
    const completedPlan = context?.mode === 'plan'
      && /(?:本次调查|本研究|调查结果|统计结果|检验结果|模型结果).{0,20}(?:已经|已完成|已回收|已收集|表明|显示|证实|证明|发现)/u.test(withoutPlaceholders);
    const reason = unknownToken
      ? '引用了不存在的占位符'
      : misbound
        ? '比率处引用了不是比率的数字'
        : mismatched
        ? mismatched
        : completedPlan
        ? '研究计划不能声称已完成调查或得到结果'
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
function validUsage(value: unknown): FullReportUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as Partial<FullReportUsage>;
  if (![usage.prompt, usage.completion, usage.total].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return undefined;
  if (usage.prompt! + usage.completion! !== usage.total) return undefined;
  return { prompt: usage.prompt!, completion: usage.completion!, total: usage.total! };
}

function providerHttpError(status: number): FullReportProviderError {
  const code = status === 401 || status === 403 ? 'provider_auth'
    : status === 402 ? 'provider_quota'
    : status === 429 ? 'provider_rate_limit'
    : status === 409 || status === 412 ? 'service_version_conflict'
    : status >= 500 || status === 408 ? 'outcome_unknown' : 'provider_failed';
  return new FullReportProviderError(code, { status, unknown: status >= 500 || status === 408 });
}

/** A service exception is never allowed to carry its raw message or response into progress events. */
function safeProviderError(error: unknown): FullReportProviderError {
  if (error instanceof FullReportProviderError) return new FullReportProviderError(error.code, { unknown: error.unknown, status: error.status });
  return new FullReportProviderError('outcome_unknown', { unknown: true });
}

function stopsDispatch(error: FullReportProviderError): boolean {
  return error.unknown || !!(error.status && (error.status >= 500 || [401, 402, 403, 408, 409, 412, 429].includes(error.status)))
    || ['provider_auth', 'provider_quota', 'provider_rate_limit', 'service_version_conflict', 'outcome_unknown',
    'invalid_report_input', 'input_revision_changed', 'unauthorized', 'forbidden', 'model_service_unavailable'].includes(error.code);
}

export async function callLlmForSection(
  prompt: string,
  config: LlmProviderConfig,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<{ content: string; usage?: FullReportUsage }> {
  throwIfAborted(signal);
  const baseUrl = (config.baseUrl ?? 'https://api.deepseek.com/v1').replace(/\/+$/u, '');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs ?? 60_000);
  try {
    const res = await fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model ?? 'deepseek-chat',
        temperature: config.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 2400,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    throwIfAborted(signal);
    if (timedOut) throw new FullReportProviderError('outcome_unknown', { unknown: true });
    if (!res.ok) {
      // Cancel the body without reading it: upstream errors can contain credentials and prompt fragments.
      await res.body?.cancel().catch(() => undefined);
      throw providerHttpError(res.status);
    }
    const data = await res.json() as {
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    throwIfAborted(signal);
    if (timedOut) throw new FullReportProviderError('outcome_unknown', { unknown: true });
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 150_000) throw new FullReportProviderError('invalid_provider_response', { unknown: true });
    return {
      content,
      usage: validUsage(data.usage ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens, total: data.usage.total_tokens } : undefined),
    };
  } catch (error) {
    throwIfAborted(signal);
    throw safeProviderError(error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
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
  mode?: ProjectResearchMode,
): { content: EditorContent; repairs: string[]; revisions: FullReportRevision[] } {
  const repairs: string[] = [];
  const revisions: FullReportRevision[] = [];
  const ours = (sec: ReportSection) => !drafted || drafted.has(matchBlueprintNode(sec.title)?.id ?? '');
  const change = (section: ReportSection, after: string, reason: string, checkId: string): ReportSection => {
    if (after === section.body) return section;
    repairs.push(reason);
    revisions.push({
      id: `finishing-${revisions.length + 1}-${section.id}`,
      nodeId: matchBlueprintNode(section.title)?.id ?? section.id,
      sectionId: section.id,
      before: section.body,
      after,
      reason,
      checkIds: [checkId],
      kind: 'finishing',
    });
    return { ...section, body: after };
  };
  let reportSections: ReportSection[] = content.report.map(s => ({
    ...s,
    ...(s.blocks ? { blocks: [...s.blocks] } : {}),
  }));

  // 1. A writable section with no prose takes its fallback.
  reportSections = reportSections.map(sec => {
    const node = matchBlueprintNode(sec.title);
    if (!node || node.kind === 'chapter' || node.kind === 'references' || !ours(sec)) return sec;
    // Any written line counts, however short; a section holding only its simulated-data mark has none.
    const prose = (text: string) => text.split(/\r?\n/u).some(line => line.trim() && !/^\s*【教学模拟数据[^】]*】\s*$/u.test(line));
    const hasProse = prose(sec.body) || (sec.blocks ?? []).some(b => b.kind === 'paragraph' && prose(b.text));
    if (!hasProse && fallbackSections.has(node.id)) {
      return change(sec, fallbackSections.get(node.id)!, `章节「${sec.title}」保留原稿或待补写说明`, 'section_content');
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
    const prefix = /^\s*【教学模拟数据[^】]*】/u.test(sec.body)
      ? sec.body.replace(/^(\s*【教学模拟数据[^】]*】[^\n]*\n?)/u, `$1本节统计证据见${missingTokens.join('与')}。\n`)
      : `本节统计证据见${missingTokens.join('与')}。\n${sec.body}`;
    return change(sec, prefix, `章节「${sec.title}」补齐图表引用 ${missingTokens.join('、')}`, 'figure_references');
  });

  // 3. A section resting on simulated results says so.
  const simulatedIds = new Set((content.quality?.results ?? []).filter(r => r.classification === 'simulated').map(r => r.id));
  if (simulatedIds.size > 0 || mode === 'demonstration') {
    reportSections = reportSections.map(sec => {
      const usesSimulated = (sec.blocks ?? []).some(b => b.evidenceId && simulatedIds.has(b.evidenceId));
      if ((usesSimulated || mode === 'demonstration') && ours(sec) && !/【教学模拟数据/u.test(sec.body)) {
        return change(sec, `【教学模拟数据：以下统计结果用于方法与流程演示，不作为实际调查结论】\n${sec.body}`,
          `章节「${sec.title}」补齐【教学模拟数据】声明`, 'simulation_disclosure');
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
    revisions,
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
  topic?: DemoBlueprint;
  contract?: SkillPackContract;
  pack?: FullReportPack;
  report?: EditorContent;
  repairsApplied?: string[];
  revisions?: FullReportRevision[];
  quality?: FullReportQuality;
  project?: FullReportProjectScope;
  completed: number;
  total: number;
};

function fullReportQuality(
  mode: ProjectResearchMode,
  contract: SkillPackContract,
  traces: readonly SectionGenerationTrace[],
  benchmark: BenchmarkResult,
  halted: FullReportProviderError | null,
): FullReportQuality {
  const success = traces.filter(t => t.status === 'llm_generated').length;
  const fallback = traces.length - success;
  const blockers: string[] = [];
  if (halted) blockers.push(halted.message);
  if (!success) blockers.push('本次运行未形成通过内容检查的模型正文。');
  if (fallback) blockers.push(`仍有 ${fallback} 节保留原稿或待补写说明，需要逐节处理。`);
  const unverified = contract.literatureLedger.filter(r => r.verificationStatus !== 'verified').length;
  const checks: FullReportQuality['checks'] = [
    { id: 'input_mode', label: '研究模式与输入', status: 'pass', detail: mode === 'plan' ? '使用当前研究计划；未自动生成模拟数据。' : mode === 'demonstration' ? '仅使用明确标记的教学模拟数据。' : '使用绑定到当前项目的非模拟数据与登记结果。' },
    { id: 'result_integrity', label: '登记结果一致性', status: contract.statsLedger.length ? 'pass' : 'not_run', detail: contract.statsLedger.length ? '已核对结果分类、来源指纹一致性及结果载荷 SHA-256；不证明原始调查真实性或统计方法正确。' : '尚无分析结果，不适用结果指纹检查。' },
    { id: 'generated_content', label: '模型正文生成', status: success === 0 ? 'failed' : fallback ? 'warning' : 'pass', detail: `通过内容检查 ${success} 节；回填或待补写 ${fallback} 节。保留原稿不计入模型产出。` },
    { id: 'evidence_ledger', label: '证据台账登记', status: contract.contractPassed ? 'pass' : 'warning', detail: contract.contractPassed ? '登记映射和已有绑定通过结构检查，仍需审查论点与证据是否相符。' : contract.contractNotes.join(' ') },
    { id: 'literature_registration', label: '文献登记状态', status: unverified || !contract.literatureLedger.length ? 'warning' : 'pass', detail: unverified ? `有 ${unverified} 条未核验文献；未交给模型作为已核验引文。` : contract.literatureLedger.length ? '仅沿用项目已有的核验标记；本次未重新查阅原文。' : '没有已登记文献，不能宣称文献核验已完成。' },
    { id: 'provider_outcome', label: '模型调用状态', status: halted ? 'failed' : 'pass', detail: halted ? halted.message : '未触发全程熔断；费用以服务记录为准。' },
    ...benchmark.checks.map(check => ({ id: `report_${check.id}`, label: check.label, status: check.status === 'pass' ? 'pass' as const : check.status === 'fail' ? 'failed' as const : check.status === 'partial' ? 'warning' as const : 'not_run' as const, detail: check.detail })),
    { id: 'statistical_review', label: '统计前提独立复核', status: 'not_run', detail: '未独立复算数据、抽样设计、模型适用性与统计前提。' },
    { id: 'literature_verification', label: '文献原文核验', status: 'not_run', detail: '本次未打开文献原文核对具体论点、页码与适用边界。' },
    { id: 'independent_review', label: '独立内容审查', status: 'not_run', detail: '尚未由独立审稿流程检查论证、遗漏和事实解释。' },
    { id: 'export_files', label: '成果文件导出', status: 'not_run', detail: '尚未导出并检查 Word、PDF 或其他提交文件。' },
    { id: 'render_review', label: '渲染版面检查', status: 'not_run', detail: '尚未逐页检查排版、图表、分页和参考文献显示。' },
    { id: 'submission_gate', label: '正式提交验收', status: 'not_run', detail: '尚未核对适用赛规、匿名要求和项目 handoff；当前产物只能作为草稿。' },
  ];
  return {
    status: halted || !success ? 'blocked' : checks.some(c => c.status === 'failed' || c.status === 'warning') ? 'needs_review' : 'draft',
    deliverable: false,
    checks,
    blockers,
  };
}

/**
 * Draft a captured project snapshot, then perform bounded content revisions and observable finishing changes.
 * A returned report is a draft. Paid requests with uncertain outcomes are never automatically repeated.
 */
export async function generateFullReportWithAgent(input: {
  topic?: string;
  existingDesign?: Questionnaire | null;
  existingReport?: EditorContent | null;
  base?: FullReportBase;
  mode?: ProjectResearchMode;
  llm?: LlmProviderConfig;
  sectionGenerator?: FullReportSectionGenerator;
  signal?: AbortSignal;
  project?: FullReportProjectScope;
  concurrency?: number;
  sectionNodes?: readonly string[];
  onProgress?: (event: FullReportProgressEvent) => void;
  fetcher?: typeof globalThis.fetch;
}): Promise<FullReportGenerationResult> {
  const startedAt = Date.now();
  const signal = input.signal;
  throwIfAborted(signal);
  // Capture before the first await: neither the caller's current project nor a progress listener can edit this run.
  const topicText = input.topic;
  const project = input.project ? structuredClone(input.project) : undefined;
  const supplied = input.base ? structuredClone(input.base)
    : input.existingDesign ? { design: structuredClone(input.existingDesign), dataset: null, report: structuredClone(input.existingReport ?? createEditorContent()) } : undefined;
  const mode: ProjectResearchMode = input.mode ?? (supplied ? supplied.dataset?.kind === 'simulated' ? 'demonstration' : supplied.dataset ? 'empirical' : 'plan' : 'demonstration');
  const wantedNodes = new Set(input.sectionNodes ?? [...WAVE_1_SECTION_NODES, ...WAVE_2_SYNTHESIS_NODES]);
  const allowedNodes = new Set([...WAVE_1_SECTION_NODES, ...WAVE_2_SYNTHESIS_NODES]);
  if (!wantedNodes.size || [...wantedNodes].some(n => !allowedNodes.has(n))) throw new FullReportInputError('invalid_sections', '请选择有效且非空的报告章节。');
  await validateFullReportBase(supplied, mode, project);
  throwIfAborted(signal);
  const llm = input.llm ? { ...input.llm } : undefined;
  const service = input.sectionGenerator;
  if (!service && (!llm || !llm.apiKey.trim())) throw new FullReportInputError('provider_required', '请选择已配置的模型服务。');
  const design = supplied?.design;
  const topic = decomposeTopic(topicText, design);
  const pack: FullReportPack = supplied ? { ...supplied, blueprint: topic } : await buildDemoPack(topicText);
  if (!supplied) await validateFullReportBase(pack, mode, project);
  throwIfAborted(signal);
  const contract = buildSkillPackContract(pack, topic, mode);
  const existingByNode = new Map<string, ReportSection>();
  const fallbackSections = new Map<string, string>();
  for (const section of pack.report.report) {
    const node = matchBlueprintNode(section.title);
    if (!node) continue;
    existingByNode.set(node.id, section);
    if (section.body.trim()) fallbackSections.set(node.id, section.body);
  }
  for (const nodeId of wantedNodes) {
    if (!fallbackSections.has(nodeId)) {
      const node = blueprintNode(nodeId);
      fallbackSections.set(nodeId, `${mode === 'demonstration' ? '【教学模拟数据】' : mode === 'plan' ? '【研究计划·待补写】' : '【实证草稿·待补写】'}本节「${node.title}」尚无可用模型正文。本节应写：${node.purpose}。`);
    }
  }
  const results = pack.report.quality?.results ?? [];
  const held: NonNullable<ResultsView> = { results, findings: pack.report.quality?.findings ?? [], pending: mode === 'plan', placed: results.map(r => r.id) };
  const methods = [...new Set(results.map(r => r.method))];
  const labels = categoryLabels(results, pack.design);
  const drafted = new Map<string, { drafts: string[]; tokens: SectionTokenMap }>();
  const wave1Nodes = WAVE_1_SECTION_NODES.filter(n => wantedNodes.has(n));
  const wave2Nodes = WAVE_2_SYNTHESIS_NODES.filter(n => wantedNodes.has(n));
  const totalNodes = wave1Nodes.length + wave2Nodes.length;
  let completedNodes = 0;
  let workingReport = pack.report;
  for (const nodeId of wantedNodes) workingReport = targetSection(workingReport, nodeId).content;
  workingReport = {
    ...workingReport,
    report: workingReport.report.map(section => wantedNodes.has(matchBlueprintNode(section.title)?.id ?? '')
      ? { ...section, body: '', ...(section.blocks ? { blocks: section.blocks.filter(b => b.kind !== 'paragraph') } : {}) } : section),
  };
  const emit = (event: FullReportProgressEvent) => {
    throwIfAborted(signal);
    input.onProgress?.(structuredClone({ ...event, ...(project ? { project } : {}) }));
    throwIfAborted(signal);
  };
  emit({ phase: 'contract', completed: 0, total: totalNodes, topic, contract, pack: { ...pack, report: workingReport }, report: workingReport });
  const requestedConcurrency = input.concurrency ?? llm?.concurrency ?? 3;
  const concurrency = Number.isFinite(requestedConcurrency) ? Math.max(1, Math.min(6, Math.floor(requestedConcurrency))) : 3;
  const traces: SectionGenerationTrace[] = [];
  const revisions: FullReportRevision[] = [];
  const usageObservations: { nodeId: string; usage?: FullReportUsage }[] = [];
  let halted: FullReportProviderError | null = null;
  const nodeTokens = (nodeId: string): FullReportUsage | undefined => {
    const known = usageObservations.filter(o => o.nodeId === nodeId && o.usage).map(o => o.usage!);
    return known.length ? known.reduce((sum, u) => ({ prompt: sum.prompt + u.prompt, completion: sum.completion + u.completion, total: sum.total + u.total }), { prompt: 0, completion: 0, total: 0 }) : undefined;
  };
  const invoke = async (request: Omit<FullReportSectionRequest, 'signal'>) => {
    throwIfAborted(signal);
    if (halted) throw new FullReportProviderError('run_stopped');
    const observation: { nodeId: string; usage?: FullReportUsage } = { nodeId: request.nodeId };
    usageObservations.push(observation);
    try {
      const response = service ? await service({ ...request, signal }) : await callLlmForSection(request.prompt, llm!, input.fetcher, signal);
      throwIfAborted(signal);
      if (!response || typeof response.content !== 'string' || response.content.length > 150_000) throw new FullReportProviderError('invalid_provider_response', { unknown: true });
      observation.usage = validUsage(response.usage);
      return response.content;
    } catch (error) {
      throwIfAborted(signal);
      const safe = safeProviderError(error);
      if (stopsDispatch(safe)) halted ??= safe;
      throw safe;
    }
  };
  const contextFor = (nodeId: string) => ({ methods, planSection: mode === 'plan' || PLAN_NODE.test(nodeId), pending: mode === 'plan' || awaitsResults(nodeId, results), labels, mode });
  const commit = (nodeId: string, wave: 1 | 2, body: string, trace: SectionGenerationTrace) => {
    throwIfAborted(signal);
    let sectionId = '';
    workingReport = {
      ...workingReport,
      report: workingReport.report.map(section => {
        if (matchBlueprintNode(section.title)?.id !== nodeId) return section;
        sectionId = section.id;
        const original = existingByNode.get(nodeId);
        return trace.status === 'repaired_fallback' && original
          ? { ...section, body, ...(original.blocks ? { blocks: structuredClone(original.blocks) } : {}) }
          : { ...section, body };
      }),
    };
    completedNodes++;
    emit({ phase: wave === 1 ? 'wave1' : 'wave2', nodeId, sectionId, title: trace.title, body,
      source: trace.status === 'repaired_fallback' ? '保留原稿或待补写说明（不计入模型产出）' : `全流程 Agent · ${wave === 1 ? '章节' : '综合'}拟稿（待审查）`,
      trace, report: workingReport, completed: completedNodes, total: totalNodes });
  };
  const draftOneSection = async (nodeId: string, wave: 1 | 2): Promise<SectionGenerationTrace> => {
    throwIfAborted(signal);
    const start = Date.now();
    const title = blueprintNode(nodeId).title;
    const tokens = buildSectionTokens(held, workingReport, nodeId, pack.design);
    const prompt = buildFullReportSectionPrompt({ nodeId, content: workingReport, design: pack.design, held, contract, tokens });
    let failure = new FullReportProviderError(halted ? 'run_stopped' : 'content_rejected');
    let feedback = '';
    let rawParagraphs = 0;
    const dropReasons: string[] = [];
    for (let attempt = 1; attempt <= 2 && !halted; attempt++) {
      let raw: string;
      try {
        raw = await invoke({ prompt: prompt + feedback, nodeId, wave, attempt, purpose: 'draft' });
      } catch (error) {
        throwIfAborted(signal);
        failure = safeProviderError(error);
        break; // A provider failure is not evidence that repeating a paid request is safe.
      }
      throwIfAborted(signal);
      let hydrated: ReturnType<typeof parseAndHydrateSectionDraft>;
      try {
        hydrated = parseAndHydrateSectionDraft(raw, tokens, contextFor(nodeId));
      } catch {
        dropReasons.push('章节返回内容不是有效的段落结构');
        feedback = '\n上一稿不符合 JSON 段落结构，请按规定输出 paragraphs 数组。';
        continue; // The response was received: only a known content rejection may request a rewrite.
      }
      rawParagraphs += hydrated.paragraphs.length + hydrated.droppedParagraphs;
      dropReasons.push(...hydrated.dropReasons);
      if (!hydrated.paragraphs.length) {
        feedback = `\n上一稿全部段落被拒收：${[...new Set(hydrated.dropReasons)].join('；') || '没有正文'}。请按规则重写。`;
        continue;
      }
      drafted.set(nodeId, { drafts: hydrated.drafts, tokens });
      const trace: SectionGenerationTrace = {
        nodeId, title, wave, advisor: advisorForNode(nodeId)?.id ?? null, status: 'llm_generated',
        rawParagraphs, keptParagraphs: hydrated.paragraphs.length, droppedParagraphs: dropReasons.length, dropReasons,
        citedFacts: hydrated.citedFacts, citedExhibits: hydrated.citedExhibits, citedReferences: hydrated.citedReferences,
        durationMs: Date.now() - start, tokens: nodeTokens(nodeId),
      };
      commit(nodeId, wave, hydrated.paragraphs.join('\n'), trace);
      return trace;
    }
    const trace: SectionGenerationTrace = {
      nodeId, title, wave, advisor: advisorForNode(nodeId)?.id ?? null, status: 'repaired_fallback',
      rawParagraphs, keptParagraphs: 0, droppedParagraphs: dropReasons.length, dropReasons,
      citedFacts: [], citedExhibits: [], citedReferences: [], durationMs: Date.now() - start,
      tokens: nodeTokens(nodeId), error: failure.message, errorCode: failure.code, httpStatus: failure.status, outcomeUnknown: failure.unknown,
    };
    commit(nodeId, wave, fallbackSections.get(nodeId) ?? '', trace);
    return trace;
  };
  traces.push(...await runWithConcurrency(wave1Nodes, concurrency, nodeId => draftOneSection(nodeId, 1)));
  throwIfAborted(signal);
  traces.push(...await runWithConcurrency(wave2Nodes, Math.min(concurrency, 4), nodeId => draftOneSection(nodeId, 2)));
  throwIfAborted(signal);
  const benchmarkBeforeRepair = benchmarkReport(workingReport);
  const flagged = (content: EditorContent, sectionId: string) => sectionIssues(content, sectionId, benchmarkReport).filter(issue => issue.check.id !== 'captions');
  const revisionNotes: string[] = [];
  const reviseSection = async (nodeId: string): Promise<void> => {
    for (let round = 1; round <= REVISION_ROUNDS; round++) {
      throwIfAborted(signal);
      if (halted) return;
      const entry = drafted.get(nodeId);
      const section = workingReport.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);
      const trace = traces.find(t => t.nodeId === nodeId);
      if (!entry || !section || !trace) return;
      const issues = flagged(workingReport, section.id);
      if (!issues.length) return;
      let raw: string;
      try {
        raw = await invoke({ prompt: buildRevisionPrompt(section.title, entry.drafts, issues.map(i => `${i.check.label}：${i.check.detail}`), entry.tokens), nodeId, wave: trace.wave, attempt: round, purpose: 'revision' });
      } catch (error) {
        throwIfAborted(signal);
        const failure = safeProviderError(error);
        trace.error = failure.message;
        trace.errorCode = failure.code;
        trace.httpStatus = failure.status;
        trace.outcomeUnknown = failure.unknown;
        return;
      } finally {
        trace.tokens = nodeTokens(nodeId);
      }
      throwIfAborted(signal);
      let revised: ReturnType<typeof parseAndHydrateSectionDraft>;
      try { revised = parseAndHydrateSectionDraft(raw, entry.tokens, contextFor(nodeId)); } catch { continue; }
      trace.droppedParagraphs += revised.droppedParagraphs;
      trace.dropReasons = [...(trace.dropReasons ?? []), ...revised.dropReasons];
      if (!revised.paragraphs.length) continue;
      const after = revised.paragraphs.join('\n');
      const candidate: EditorContent = { ...workingReport, report: workingReport.report.map(s => s.id === section.id ? { ...s, body: after } : s) };
      const left = flagged(candidate, section.id);
      if (after === section.body || left.length >= issues.length || left.some(issue => !issues.some(previous => previous.check.id === issue.check.id))) continue;
      const cleared = issues.filter(issue => !left.some(l => l.check.id === issue.check.id));
      const reason = `章节「${section.title}」按审稿意见修订：${cleared.map(i => i.check.label).join('、')}`;
      throwIfAborted(signal);
      revisions.push({ id: `revision-${revisions.length + 1}-${section.id}`, nodeId, sectionId: section.id, before: section.body, after, reason, checkIds: cleared.map(i => i.check.id), kind: 'model_revision' });
      workingReport = candidate;
      drafted.set(nodeId, { drafts: revised.drafts, tokens: entry.tokens });
      trace.keptParagraphs = revised.paragraphs.length;
      trace.citedFacts = revised.citedFacts;
      trace.citedExhibits = revised.citedExhibits;
      trace.citedReferences = revised.citedReferences;
      revisionNotes.push(reason);
    }
  };
  await runWithConcurrency([...drafted.keys()], concurrency, reviseSection);
  throwIfAborted(signal);
  if (traces.some(trace => trace.status === 'llm_generated')) {
    const before = workingReport;
    workingReport = noteDrafting(workingReport, `叙述性章节由大语言模型（${llm?.model || (service ? '所选报告模型' : 'deepseek-chat')}）在证见全报告流水线中起草：数字由登记结果占位符回填，本地规则检查可能遗漏语义错误；问题段落仅作有限内容返修。当前产物为草稿，独立审稿、文献原文核验、文件导出、逐页渲染与正式提交验收尚未完成。`);
    for (const section of workingReport.report) {
      const previous = before.report.find(s => s.id === section.id);
      if (previous && previous.body !== section.body) revisions.push({ id: `disclosure-${section.id}`, nodeId: matchBlueprintNode(section.title)?.id ?? section.id, sectionId: section.id, before: previous.body, after: section.body, reason: '更新本次实际模型参与及尚未完成的验收说明', checkIds: ['ai_disclosure'], kind: 'finishing' });
    }
  }
  const finished = finalizeReport(workingReport, fallbackSections, wantedNodes, mode);
  revisions.push(...finished.revisions);
  const repairedReport = finished.content;
  const repairs = [...revisionNotes, ...finished.repairs];
  const benchmarkAfterRepair = benchmarkReport(repairedReport);
  const advisorsAfterRepair = ADVISORS.map(advisor => advisorReading(advisor, benchmarkAfterRepair));
  const quality = fullReportQuality(mode, contract, traces, benchmarkAfterRepair, halted);
  emit({ phase: 'repair', completed: completedNodes, total: totalNodes, repairsApplied: repairs, revisions, quality, report: repairedReport });
  const knownUsage = usageObservations.reduce((sum, observation) => ({
    prompt: sum.prompt + (observation.usage?.prompt ?? 0), completion: sum.completion + (observation.usage?.completion ?? 0), total: sum.total + (observation.usage?.total ?? 0),
  }), { prompt: 0, completion: 0, total: 0 });
  const successful = traces.filter(trace => trace.status === 'llm_generated');
  const result: FullReportGenerationResult = {
    pack: { ...pack, report: repairedReport }, topic, report: repairedReport, contract, traces,
    ...(project ? { project } : {}), benchmarkBeforeRepair, benchmarkAfterRepair, advisorsAfterRepair,
    repairsApplied: repairs, revisions, quality,
    summary: {
      totalSectionsGenerated: traces.length,
      llmSuccessCount: successful.length,
      totalParagraphsWritten: successful.reduce((sum, trace) => sum + trace.keptParagraphs, 0),
      totalDroppedParagraphs: traces.reduce((sum, trace) => sum + trace.droppedParagraphs, 0),
      totalFactsCited: new Set(successful.flatMap(trace => trace.citedFacts.map(fact => `${trace.nodeId}:${fact}`))).size,
      totalTokens: knownUsage.total,
      promptTokens: knownUsage.prompt,
      completionTokens: knownUsage.completion,
      usageReported: usageObservations.length > 0 && usageObservations.every(observation => !!observation.usage),
      fallbackCount: traces.length - successful.length,
      totalDurationMs: Date.now() - startedAt,
      finalScore: benchmarkAfterRepair.score,
      advisorPassCount: advisorsAfterRepair.filter(advisor => advisor.issues.length === 0).length,
      advisorTotalCount: advisorsAfterRepair.length,
      revisedSections: new Set(revisions.filter(revision => revision.kind === 'model_revision').map(revision => revision.nodeId)).size,
    },
  };
  emit({ phase: 'done', completed: totalNodes, total: totalNodes, quality, revisions });
  return result;
}
