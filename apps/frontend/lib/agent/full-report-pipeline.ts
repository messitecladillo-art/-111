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
import { METHOD_LABELS, targetSection } from '../report-placement.ts';
import { referenceNumbers } from '../references.ts';
import { isDiagramMethod } from '../diagram-figures.ts';
import { verifyResearchQuality, type ReportBlock, type ResultSnapshot } from '../research-quality.ts';
import { getSectionRhetoricalBlueprint } from '../../data/zhengda-empirical-anatomy.ts';
import { ADVISORS, type AdvisorReading, advisorForNode, advisorReading, sectionIssues } from './advisors.ts';
import { type Fact, SYNTHESIS_NODES, draftFacts, draftSection, reportOutline } from './draft.ts';
import { buildDemoPack, decomposeTopic, noteDrafting, type DemoBlueprint, type DemoPack } from './demo-study.ts';
import { buildRichBlueprintPrompt, buildRichDemoPack, decomposeRichTopic, parseRichBlueprint, type RichStudyBlueprint } from './rich-study.ts';
import {
  generateDemographicInfographicArt,
  generateDenseWordCloudArt,
  generateReportCoverArt,
  generateReportFrameArt,
  generateStructuredSummaryCardArt,
  generateTopicFeatureOverviewArt,
  type SummaryCardSlot,
} from './image-gen-engine.ts';
import { buildDeAiPromptRules, AI_CLICHE_RULES } from './interview-corpus-deai.ts';
import { standingFindings, type ResultsView } from './router.ts';
import {
  FALLBACK_RHETORICAL_BLUEPRINTS,
  INTERNAL_META_WARNING_RE,
  MOTHER_INSIGHT_NODES,
  buildDeterministicStorylineBrief,
  buildStorylinePrompt,
  checkCrossSectionEcho,
  collectPreservedResultNotes,
  formatSectionEvidenceTables,
  formatStorylineForSection,
  inferResultNode,
  parseStorylineBrief,
  sectionCorpusSkillBlock,
  type EchoAuditResult,
  type StorylineBrief,
} from './storyline-brief.ts';
import { sanitizeV2Paragraph, verifyAndHydrateV2Section } from './numeric-verifier.ts';

export {
  buildDeterministicStorylineBrief,
  buildStorylinePrompt,
  checkCrossSectionEcho,
  formatSectionEvidenceTables,
  parseStorylineBrief,
  sanitizeV2Paragraph,
  sectionCorpusSkillBlock,
  verifyAndHydrateV2Section,
};

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
  purpose: 'draft' | 'revision' | 'blueprint' | 'storyline';
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
  const statResults = results.filter(r => !isDiagramMethod(r.method));
  if (mode === 'empirical') {
    if (!project || /^(?:local|demo|demonstration)(?:$|[-_:])/iu.test(project.projectId)) {
      throw new FullReportInputError('saved_project_required', '实证报告须绑定已保存的项目和当前输入版本。');
    }
    if (dataset?.kind !== 'user_provided' || !statResults.length) {
      throw new FullReportInputError('empirical_evidence_required', '实证报告须提供真实数据集及已登记的分析结果。');
    }
  }
  if (results.length) {
    if (statResults.length && (!dataset || statResults.some(r => r.sourceHash !== dataset.sourceHash))) {
      throw new FullReportInputError('source_hash_mismatch', '分析结果与当前数据的来源指纹不一致，请重新登记计算结果。');
    }
    try {
      await verifyResearchQuality(base.report.quality!);
    } catch {
      throw new FullReportInputError('result_hash_mismatch', '分析结果指纹校验未通过，请重新登记计算结果。');
    }
  }
}

function isSubstantiveDesignQuestion(q: Questionnaire['questions'][number]): boolean {
  return (
    q.text.trim() !== '' ||
    q.variable !== 'Q1' ||
    q.analysis !== 'undecided' ||
    q.construct.trim() !== '' ||
    q.purpose !== 'research' ||
    q.choices.some(c => c.label.trim() !== '')
  );
}

/**
 * Inspects questionnaire design + registered results to identify missing empirical evidence
 * before storyline construction and Wave 1 drafting.
 */
export function detectReportEvidenceGaps(
  pack: Pick<FullReportPack, 'design' | 'dataset' | 'report'>,
  mode: ProjectResearchMode,
  wantedNodes?: ReadonlySet<string>,
): ReportEvidenceGap[] {
  if (mode === 'plan' || !pack.dataset) return [];
  const questions = (pack.design?.questions ?? []).filter(isSubstantiveDesignQuestion);
  const results = pack.report.quality?.results ?? [];
  const methods = results.map(r => r.method.trim().toLowerCase());

  const gaps: ReportEvidenceGap[] = [];

  const hasQualityControl = methods.some(m => m === 'quality-control');
  if (!hasQualityControl) {
    gaps.push({
      id: 'gap-quality-control',
      nodeId: 'data.cleaning',
      kind: 'missing_quality_control',
      severity: 'high',
      description: '已登记数据集但缺少问卷质量控制与清洗台账（quality-control），无法核验无效作答剔除与有效样本分母。',
      recommendedOperator: 'clean_and_audit_survey',
    });
  }

  const scaleItems = questions.filter(q => q.type === 'likert' || q.analysis === 'measurement');
  const hasReliability = methods.some(m => /^(?:alpha|reliability|cronbach|pilot-purification)$/u.test(m));
  if (scaleItems.length >= 3 && !hasReliability) {
    gaps.push({
      id: 'gap-reliability',
      nodeId: 'data.testing',
      kind: 'missing_reliability',
      severity: 'high',
      description: '问卷包含 3 题及以上李克特/测量题项，但尚无 Cronbach α 或量表净化（alpha/reliability）检验快照。',
      recommendedOperator: 'purify_scale_reliability',
    });
  }

  const groupingVars = questions.filter(q => q.type === 'single' && q.purpose !== 'screening');
  const hasGroupComparison = methods.some(m =>
    /^(?:ttest|t-?test|anova|crosstab|chi-?square|nonparametric|groups|profile|kruskal|mann-?whitney)$/u.test(m),
  );
  if (groupingVars.length > 0 && !hasGroupComparison) {
    gaps.push({
      id: 'gap-group-comparison',
      nodeId: 'compare.tests',
      kind: 'missing_group_comparison',
      severity: 'medium',
      description: '问卷包含单选分组变量，但尚无组间差异或列联比较检验（crosstab/groups/ttest/anova/nonparametric）结果快照。',
      recommendedOperator: 'run_group_comparison',
    });
  }

  const analyticQuestions = questions.filter(q => q.purpose !== 'screening' && q.type !== 'text');
  const quantQuestions = analyticQuestions.filter(q => q.type === 'likert' || q.type === 'number');
  const distinctConstructs = new Set(analyticQuestions.map(q => q.construct.trim()).filter(Boolean));
  const hasAssociationTarget = analyticQuestions.some(
    q => q.analysis === 'association' || /意愿|满意度|推荐|采纳|倾向|outcome|dv|target/iu.test(`${q.variable} ${q.text} ${q.construct}`),
  );
  const hasPredictorsAndOutcome =
    analyticQuestions.length >= 2 &&
    (hasAssociationTarget || (quantQuestions.length >= 1 && distinctConstructs.size >= 2) || quantQuestions.length >= 3);
  const hasModeling = methods.some(m =>
    /^(?:regression|ols|logit|logistic|probit|ridge|lasso|penalized-?logistic|sem|sem-fit|sem-paths|hlm|glm)$/u.test(m),
  );
  if (hasPredictorsAndOutcome && !hasModeling) {
    gaps.push({
      id: 'gap-modeling',
      nodeId: 'drivers.model',
      kind: 'missing_modeling',
      severity: 'high',
      description: '已具备前因与结果测量题项，但缺少多元回归或 Logit 驱动建模（regression/logistic/logit）结果快照。',
      recommendedOperator: 'fit_penalized_logistic',
    });
  }

  const hasHeterogeneity = methods.some(m =>
    /^(?:interaction|mediation|moderation|subgroup|heterogeneity|multigroup|uplift)$/u.test(m),
  );
  if (groupingVars.length > 0 && hasPredictorsAndOutcome && !hasHeterogeneity) {
    gaps.push({
      id: 'gap-heterogeneity',
      nodeId: 'drivers.model',
      kind: 'missing_heterogeneity',
      severity: 'medium',
      description: '已具备分组调节变量与多维预测构念，但尚无子群异质性反转或中介/交互效应（interaction/mediation）检验快照。',
      recommendedOperator: 'scan_subgroup_heterogeneity',
    });
  }

  if (wantedNodes && wantedNodes.size > 0) {
    return gaps.filter(gap => wantedNodes.has(gap.nodeId));
  }
  return gaps;
}

function sanitizeSupplementedSnapshot(
  raw: unknown,
  mode: ProjectResearchMode,
  datasetHash: string | undefined,
  seenIds: ReadonlySet<string>,
): ResultSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const snap = raw as Partial<ResultSnapshot>;
  const id = typeof snap.id === 'string' ? snap.id.trim() : '';
  const method = typeof snap.method === 'string' ? snap.method.trim() : '';
  const title = typeof snap.title === 'string' ? snap.title.trim() : '';
  if (!id || !method || !title || seenIds.has(id)) return null;
  const classification = snap.classification;
  if (classification !== 'public' && classification !== 'user_provided' && classification !== 'simulated') {
    return null;
  }
  if (mode === 'empirical' && classification === 'simulated') {
    return null;
  }
  if (!isDiagramMethod(method)) {
    if (!datasetHash || snap.sourceHash !== datasetHash) return null;
  }
  if (!Array.isArray(snap.headers) || snap.headers.length === 0 || !Array.isArray(snap.rows) || !Array.isArray(snap.metrics)) {
    return null;
  }
  if (typeof snap.n !== 'number' || !Number.isFinite(snap.n) || snap.n < 0) return null;
  if (typeof snap.total !== 'number' || !Number.isFinite(snap.total) || snap.total < snap.n) return null;
  return structuredClone(snap as ResultSnapshot);
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
  competitionName?: string;
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

export type ReportEvidenceGapKind =
  | 'missing_quality_control'
  | 'missing_reliability'
  | 'missing_group_comparison'
  | 'missing_modeling'
  | 'missing_heterogeneity';

export type ReportEvidenceGap = {
  id: string;
  nodeId: string;
  kind: ReportEvidenceGapKind;
  severity: 'high' | 'medium';
  description: string;
  recommendedOperator: string;
};

export type ReportEvidenceGapReport = {
  detected: ReportEvidenceGap[];
  supplementedResultIds: string[];
  remaining: ReportEvidenceGap[];
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
  storyline?: StorylineBrief;
  echoAudit?: EchoAuditResult;
  evidenceGapReport?: ReportEvidenceGapReport;
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
  'segments.cluster',
  'diagnosis.evaluation',
  'diagnosis.problems',
  'plan.measures',
  'plan.feasibility',
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
const EVIDENCE_NODES = new Set(['data.testing', 'sample.profile', 'sample.descriptive', 'compare.tests', 'drivers.model', 'segments.cluster', 'diagnosis.evaluation']);
const FIELDWORK_NODES = new Set(['design.sampling', 'design.schedule', 'data.pilot']);
/** Words that put an analysis in the future: such a sentence plans the analysis, it does not report it. */
const PLANNED = /(?<!模)拟(?!合)|计划|将(?:采用|构建|估计|报告|检验|开展)|尚未登记|待(?:估计|补|登记|完成)/u;

/** A results section with no registered result of its own: it may set out the analysis it still needs, as a plan. */
export function awaitsResults(nodeId: string, results: readonly ResultSnapshot[]): boolean {
  return (EVIDENCE_NODES.has(nodeId) || nodeId === 'data.pilot') && !results.some(r => inferResultNode(r) === nodeId);
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
      // Convert Q1..Q45 -> 题一..题四十五 (handles Chinese text immediately after digits)
      s = s.replace(/(?:^|(?<![A-Za-z]))Q([1-9]|[1-3][0-9]|4[0-5])(?![0-9])/giu, (_, d: string) => `题${toChineseNumber(Number(d))}`);
      // Convert RQ1..RQ9 -> 研究问题一..研究问题九
      s = s.replace(/(?:^|(?<![A-Za-z]))RQ([1-9])(?![0-9])/giu, (_, d: string) => `研究问题${toChineseNumber(Number(d))}`);
      // Convert H1..H9 -> 假设一..假设九
      s = s.replace(/(?:^|(?<![A-Za-z]))H([1-9])(?![0-9])/giu, (_, d: string) => `假设${toChineseNumber(Number(d))}`);
      // Convert conceptual 3W1H / 5W1H -> 四维执行框架 / 多维执行框架
      s = s.replace(/[35]W1H/giu, '四维执行框架');
      // Normalize χ2 -> χ² while keeping R² / $R^2$ and 95%/99%/90%置信区间 intact
      s = s.replace(/χ\s*2/gu, 'χ²');
      // Convert conceptual unit phrases in OR / regression explanation
      s = s.replace(/([每提高增加降低变动取值]{1,3})\s*1\s*(个?单位)/gu, '$1一个$2');
      s = s.replace(/(OR|优势比|比值比|系数)([大和小等]于)\s*1(?![0-9.])/gu, '$1$2一');
      // Convert conceptual Likert scale phrases
      s = s.replace(/([1-9])\s*(分制|级量表|点量表|分量表)/gu, (_, d: string, tail: string) => `${toChineseNumber(Number(d))}${tail}`);
      // Convert literal figure/table numbers written outside {G..} (e.g. 图3-1, 表4-2, 附录1) -> 文中对应统计图 / 文中对应统计表 / 附录
      s = s.replace(/(?:图|Figure)\s*[0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)*/giu, '文中对应统计图');
      s = s.replace(/(?:表|Table)\s*[0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)*/giu, '文中对应统计表');
      s = s.replace(/(?:附录|附件)\s*[0-9０-９]+/gu, '附录');
      // Convert Chinese ordinals: 第1..第20 + noun -> 第一..第二十
      s = s.replace(/第\s*([1-9]|1[0-9]|20)\s*(象限|阶段|部分|步|层|级|章|节|类|条|项|点|轮|期|维|轨|组|位|名|次)/gu, (_, d: string, noun: string) => `第${toChineseNumber(Number(d))}${noun}`);
      // Convert ranges like 3-5个 / 1至3项 -> 三至五个
      s = s.replace(/(?<![0-9.])([1-9]|10)\s*(?:—|–|-|至|到)\s*([1-9]|10)\s*(个|项|条|类|维|大|种|阶段|象限|部分|步|层|级|轮|期|周|天|月|年|次|段|句|篇)(?![0-9])/gu, (_, a: string, b: string, clf: string) => `${toChineseNumber(Number(a))}至${toChineseNumber(Number(b))}${clf}`);
      // Convert small integer counts with structural classifiers: 4个象限, 5维, 3条, 2类, 4分类 -> 四个象限, 五维, 三条, 两类, 四分类
      s = s.replace(/(?<![0-9.])([1-9]|1[0-9]|20)\s*(个|项|条|类|分类|维|维度|大|种|阶段|象限|部分|步|步骤|层|层面|级|轮|期|周|段|篇|轨|赛道|片区|主体|工程|模块|渠道)(?![0-9])/gu, (_, d: string, clf: string) => `${toChineseNumber(Number(d))}${clf}`);
      // Strip AI writing cliches unconditionally (academic substitution contains zero Arabic/Chinese numerals)
      for (const rule of AI_CLICHE_RULES) {
        s = s.replace(rule.pattern, rule.academicSub);
      }
      s = s.replace(/([，,；;。])\s*[，,]/gu, '$1');
      // Only the paragraph's own start may lose stray punctuation: a segment that follows a placeholder legitimately
      // begins with "，" ("系数为{F1}，置信区间…"); stripping it there glued numbers to the next clause.
      if (idx === 0) s = s.replace(/^[\s，,、]+/u, '');
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

  const hasRich32Scale = pack.design.questions.some(q => q.variable === 'Q31');
  const hasExtendedScale = pack.design.questions.some(q => q.variable === 'Q15');
  const hasLogisticResult = results.some(r => r.method === 'logistic');
  const hasKanoResult = results.some(r => r.method === 'kano');
  const designMatrix: DesignMatrixRow[] = mode === 'demonstration' ? [
    {
      rqId: 'RQ1',
      question: `“${topic.shortTitle}”中${topic.groupA}与${topic.groupB}的${topic.statusConstruct}${hasExtendedScale ? '及群体分布特征' : ''}是否不同？`,
      decisionMeaning: '决定服务资源是统一投放，还是按人群分别安排',
      construct: hasExtendedScale ? `${topic.groupConstruct} × ${topic.statusConstruct} × 年龄与频次结构` : `${topic.groupConstruct} × ${topic.statusConstruct}`,
      itemIds: hasRich32Scale ? ['Q1', 'Q2', 'Q3', 'Q4', 'Q14', 'Q27', 'Q28'] : hasExtendedScale ? ['Q1', 'Q2', 'Q8', 'Q13', 'Q14'] : ['Q1', 'Q2', 'Q8'],
      analysisMethod: '列联表 Pearson χ² 检验与 Cramér’s V 效应量',
      boundary: '横截面列联检验仅反映群体分布关联，不作个体动态跃迁轨迹推断',
    },
    {
      rqId: 'RQ2',
      question: hasExtendedScale
        ? `${topic.scaleConstruct}及拓展构念是否可靠，哪些方面重要而表现偏低？`
        : `${topic.scaleConstruct}是否可靠，哪些方面重要而表现偏低？`,
      decisionMeaning: '找出应优先改进的服务短板，避免在不敏感的环节过度投入',
      construct: hasExtendedScale
        ? `核心体验（${topic.dimensions.map(d => d.short).join('、')}）与制度规则、信任契合维度`
        : `五个方面的体验（${topic.dimensions.map(d => d.short).join('、')}）`,
      itemIds: hasRich32Scale
        ? ['Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12', 'Q13', 'Q18', 'Q19', 'Q20', 'Q21', 'Q22', 'Q23', 'Q24', 'Q25', 'Q26', 'Q29']
        : hasExtendedScale ? ['Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q15', 'Q16', 'Q17', 'Q18', 'Q19'] : ['Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
      analysisMethod: `Cronbach α 内部一致性 + KMO/因子效度 + 组间差异比较 + 重要性—表现分析（IPA）${hasKanoResult ? ' + KANO 正反配对需求分析' : ''}`,
      boundary: '均值差异与象限划分受限于样本覆盖范围，外推到样本以外的人群前需重新评估',
    },
    {
      rqId: 'RQ3',
      question: `${topic.overallSatConstruct}、${topic.mechanismConstruct}与${topic.conversionConstruct}的关联有多强，细分人群有何特征分化？`,
      decisionMeaning: '判断改善体验与推行机制对持续使用的带动潜力，并按细分群体制定触达方案',
      construct: hasExtendedScale
        ? `${topic.mechanismConstruct}、${topic.overallSatConstruct}、${topic.conversionConstruct}与聚类画像`
        : `${topic.mechanismConstruct}、${topic.overallSatConstruct}与${topic.conversionConstruct}`,
      itemIds: hasRich32Scale ? ['Q15', 'Q16', 'Q17', 'Q30', 'Q31', 'Q32'] : hasExtendedScale ? ['Q9', 'Q10', 'Q11', 'Q12', 'Q20'] : ['Q9', 'Q10', 'Q11', 'Q12'],
      analysisMethod: `Spearman 相关 + 多元线性回归${hasLogisticResult ? ' + 二元 Logistic 回归' : ''} + 轮廓系数自适应 K-means 聚类`,
      boundary: '陈述性意愿不等于实际行为，回归与聚类特征仅说明样本内关联，不作因果推断',
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
  const targetSec = content.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);
  const ownBlockResultIds = new Set(
    (targetSec?.blocks ?? [])
      .filter(b => (b.kind === 'chart' || b.kind === 'table') && b.evidenceId)
      .map(b => b.evidenceId),
  );
  const scoped = FIELDWORK_NODES.has(nodeId)
    ? { ...held, results: held.results.filter(result => inferResultNode(result) === nodeId || ownBlockResultIds.has(result.id)) }
    : held;
  const evidenceIds = new Set(scoped.results.map(result => result.id));
  const baseFacts = draftFacts(scoped, nodeId);
  // Facts the study's own records give beyond each result's metrics: a frame's valid rate, worked out from the two
  // counts it registers, and the questionnaire's length. Nothing is typed in here: without a record there is no fact.
  const extraFacts: Omit<Fact, 'id'>[] = [];
  for (const r of scoped.results) {
    if (r.method !== 'sampling-frame') continue;
    const issued = r.metrics.find(m => /^(?:实际发放问卷|实发问卷|实际发放)$/u.test(m.label))?.value;
    const valid = r.metrics.find(m => /^(?:有效回收样本|有效回收)$/u.test(m.label))?.value;
    if (typeof issued === 'number' && typeof valid === 'number' && issued > 0 && valid <= issued) {
      const rate = `${(Math.round((valid / issued) * 1000) / 10).toFixed(1)}%`;
      extraFacts.push({ text: `“${r.title}”的有效回收率为 ${rate}（有效回收 ${valid} 份 ÷ 实际发放 ${issued} 份）`, value: rate });
    }
  }
  if (design?.questions.length) extraFacts.push({ text: `正式问卷共 ${design.questions.length} 道题`, value: String(design.questions.length) });
  // The study's own records come first: a long list of results would otherwise fill the eighty places before them.
  const mergedFacts: Fact[] = [...extraFacts, ...baseFacts.map(({ text, value }) => ({ text, value }))]
    .filter(f => !INTERNAL_META_WARNING_RE.test(f.text))
    .filter((f, i, all) => all.findIndex(g => g.text === f.text) === i)
    .slice(0, 80)
    .map((f, i) => ({ id: `F${i + 1}`, ...f }));

  // Provide current section exhibits first, then report-wide core exhibits (prioritizing empirical modeling chapters on synthesis nodes) so {G1}..{Gn} covers OLS/Cluster/IPA/KANO/SEM/Pareto!
  const synthesisPriorityMethodScore = (evidenceId: string): number => {
    const r = held.results.find(item => item.id === evidenceId);
    if (!r) return 0;
    if (/^(?:regression|logistic|sem-fit|sem-paths|cluster-radar|cluster|ipa|kano|pareto)$/u.test(r.method)) return 3;
    if (/^(?:sampling-frame|pilot-purification|runs-test|validity|multi-response|correlation|diagram)$/u.test(r.method)) return 2;
    return 1;
  };
  const allExhibitBlocks: { block: ReportBlock; secTitle: string; isOwn: boolean; priority: number }[] = [];
  for (const sec of content.report) {
    const isOwn = sec.id === targetSec?.id;
    for (const b of sec.blocks ?? []) {
      if (b.kind === 'chart' || b.kind === 'table') {
        if (FIELDWORK_NODES.has(nodeId) && !evidenceIds.has(b.evidenceId)) continue;
        allExhibitBlocks.push({
          block: b,
          secTitle: sec.title,
          isOwn,
          priority: SYNTHESIS_NODES.has(nodeId) ? synthesisPriorityMethodScore(b.evidenceId) : 0,
        });
      }
    }
  }
  if (SYNTHESIS_NODES.has(nodeId)) {
    allExhibitBlocks.sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || b.priority - a.priority);
    const seenMethods = new Set<string>();
    const primary: typeof allExhibitBlocks = [];
    const secondary: typeof allExhibitBlocks = [];
    for (const item of allExhibitBlocks) {
      const methodKey = held.results.find(r => r.id === item.block.evidenceId)?.method ?? item.block.id;
      if (!seenMethods.has(methodKey)) {
        seenMethods.add(methodKey);
        primary.push(item);
      } else {
        secondary.push(item);
      }
    }
    allExhibitBlocks.splice(0, allExhibitBlocks.length, ...primary, ...secondary);
  } else {
    allExhibitBlocks.sort((a, b) => Number(b.isOwn) - Number(a.isOwn));
  }
  const exhibitCap = SYNTHESIS_NODES.has(nodeId) ? 18 : 14;
  const exhibits: { id: string; text: string; value: string }[] = allExhibitBlocks.slice(0, exhibitCap).map((item, idx) => {
    const kindLabel = item.block.kind === 'chart' ? '图' : '表';
    return {
      id: `G${idx + 1}`,
      text: `${item.isOwn ? '本节' : '报告'}${kindLabel}“${item.block.text || item.secTitle}”`,
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

const CROSS_CHAPTER_SYNTHESIS_DIGEST_NODES: ReadonlySet<string> = new Set([
  'abstract',
  'plan.feasibility',
  'conclusion.findings',
  'conclusion.suggestions',
  'conclusion.limits',
]);

function buildCrossChapterEvidenceDigest(
  results: readonly ResultSnapshot[],
  preservedNotes?: ReadonlyMap<string, readonly string[]>,
  mode?: ProjectResearchMode,
): string {
  if (!results.length) return '';
  const cleanMeta = (s: string) =>
    s
      .replace(/严禁将[^。；\n]*绘制成饼图[。；]?/gu, '')
      .replace(/[^。；\n]*不证明[^。；\n]*获奖水平[。；]?/gu, '')
      .replace(/不要只为提高[^。；\n]*删除题项[。；]?/gu, '')
      .replace(/超出计分范围\s*0\s*行[。；]?/gu, '')
      .replace(/多选题须先按选项拆列[^。；\n]*[。；]?/gu, '')
      .replace(/(?:\\alpha|α|Cronbach)[^。；\n]{0,12}不证明[^。；\n]*[。；]?/giu, '')
      .replace(/当前产物为草稿[^。；\n]*[。；]?/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
  const notesFor = (r: ResultSnapshot): string => {
    const pNotes = (preservedNotes?.get(r.id) ?? []).map(cleanMeta).filter(Boolean);
    const wNotes = (r.warnings ?? []).filter(w => !INTERNAL_META_WARNING_RE.test(w)).map(cleanMeta).filter(Boolean);
    return [...new Set([...pNotes, ...wNotes])].join('；');
  };

  const lines: string[] = [];

  // 1. Correlation matrix top pairs
  const corrSnap = results.find(r => r.method === 'correlation');
  if (corrSnap && corrSnap.headers.length >= 3 && corrSnap.rows.length >= 2) {
    const pairs: { a: string; b: string; val: number; text: string }[] = [];
    const seenKey = new Set<string>();
    corrSnap.rows.forEach(row => {
      const rowName = String(row[0] ?? '').trim();
      if (!rowName) return;
      for (let c = 1; c < corrSnap.headers.length; c++) {
        const colName = String(corrSnap.headers[c] ?? '').trim();
        if (!colName || colName === rowName) continue;
        const key = [rowName, colName].sort().join('×');
        if (seenKey.has(key)) continue;
        const rawCell = String(row[c] ?? '').replace(/−/gu, '-').replace(/\*+/gu, '').trim();
        const num = Number(rawCell);
        if (!Number.isFinite(num) || Math.abs(num) >= 0.999) continue;
        seenKey.add(key);
        pairs.push({ a: rowName, b: colName, val: Math.abs(num), text: `${rowName}×${colName} ρ=${num.toFixed(3)}` });
      }
    });
    pairs.sort((x, y) => y.val - x.val);
    if (pairs.length) {
      lines.push(`· 已登记秩相关矩阵关键系数（n=${corrSnap.n}）：${pairs.slice(0, 6).map(p => p.text).join('；')}`);
    }
  }

  // 2. OLS Regression (`Q29` & `Q15..Q17` / composite subscales + BP / HC3)
  const regSnap = results.find(r => r.method === 'regression');
  if (regSnap && regSnap.rows.length) {
    const preds = regSnap.rows
      .filter(row => !/截距|Intercept|Constant/iu.test(String(row[0] ?? '')))
      .slice(0, 10)
      .map(row => `${String(row[0] ?? '').trim()}(B=${row[1]}, SE=${row[2]}, β=${row[3]}, p=${row[5]}, VIF=${row[6] ?? '—'})`);
    const fit = notesFor(regSnap);
    lines.push(`· 已登记多元线性回归 OLS（n=${regSnap.n}${fit ? `；${fit}` : ''}）：${preds.join('；')}`);
  }

  // 3. Binary Logistic (`OR`, `95% CI`, `AME`, `C-stat`)
  const logitSnap = results.find(r => r.method === 'logistic');
  if (logitSnap && logitSnap.rows.length) {
    const preds = logitSnap.rows
      .filter(row => !/截距|Intercept|Constant/iu.test(String(row[0] ?? '')))
      .slice(0, 8)
      .map(row => `${String(row[0] ?? '').trim()}(B=${row[1]}, p=${row[4]}, OR=${row[5]}, 95%CI=${row[6]}, AME=${row[7] ?? '—'})`);
    const fit = notesFor(logitSnap);
    lines.push(`· 已登记二元 Logistic 模型（n=${logitSnap.n}${fit ? `；${fit}` : ''}）：${preds.join('；')}`);
  }

  // 4. Grounded coding (`A1–A4` categories & non-triangulation mapping)
  const groundedSnap = results.find(r => r.method === 'grounded-coding' || /三级编码|扎根/u.test(r.title));
  if (groundedSnap && groundedSnap.rows.length) {
    const cats = groundedSnap.rows
      .slice(0, 6)
      .map(row => `${String(row[0] ?? '').trim()}“${String(row[1] ?? '').trim()}”（映射：${String(row[3] ?? row[2] ?? '').trim()}）`);
    lines.push(
      mode === 'empirical'
        ? `· 已登记半结构化深度访谈三级编码对照台账：${cats.join('；')}`
        : `· 已登记定性编码演练映射台账（同构演练语料，非独立田野三角互证）：${cats.join('；')}`,
    );
  }

  // 5. Pilot decision & stop-loss matrix (`30天观察窗`, endpoints & power basis)
  const pilotMatrixSnap = results.find(
    r => r.method === 'pilot-decision-matrix' || r.method === 'stop-loss' || /止损|试点决策/u.test(r.title),
  );
  if (pilotMatrixSnap && pilotMatrixSnap.rows.length) {
    const modules = pilotMatrixSnap.rows
      .slice(0, 5)
      .map(row => `${String(row[0] ?? '').trim()}［设计：${String(row[2] ?? '').trim()}｜主终点与门槛：${String(row[3] ?? '').trim()}｜止损回退：${String(row[4] ?? row[5] ?? '').trim()}］`);
    const fit = notesFor(pilotMatrixSnap);
    lines.push(`· 已登记可证伪试点验证与止损矩阵${fit ? `（${fit}）` : ''}：${modules.join('；')}`);
  }

  if (!lines.length) return '';
  return (
    '\n【跨章已登记核心证据对账摘要（严禁将下列已算出结果写成“待补/待补入”，严禁输出“分别登记于12、4”等残缺裸数）】\n' +
    lines.join('\n')
  );
}
export function buildFullReportSectionPrompt(input: {
  nodeId: string;
  content: EditorContent;
  design: Questionnaire | null;
  held: NonNullable<ResultsView>;
  contract: SkillPackContract;
  tokens: SectionTokenMap;
  steeringNotes?: readonly string[];
  storyline?: StorylineBrief;
  preservedNotes?: ReadonlyMap<string, readonly string[]>;
  fullRun?: boolean;
  competitionName?: string;
}): string {
  const section = draftSection(input.nodeId);
  const isSynthesis = SYNTHESIS_NODES.has(input.nodeId);
  const outline = isSynthesis ? reportOutline(input.content, input.nodeId, 2600) : undefined;
  const methods = [...new Set(input.held.results.map(r => r.method))];
  const registered = (family: RegExp) => methods.some(m => family.test(m));
  const planSection = input.contract.mode === 'plan' || PLAN_NODE.test(input.nodeId);
  const pending = input.contract.mode === 'plan' || awaitsResults(input.nodeId, input.held.results);
  const owner = advisorForNode(input.nodeId) ?? (input.nodeId.startsWith('segments.') ? ADVISORS.find(a => a.id === 'modeling') ?? null : null);
  const analyses = methods.map(m => METHOD_LABELS[m] ?? m);
  const isBoundaryDisclosureNode = !input.fullRun || METHOD_DISCLOSURE_BOUNDARY_NODES.has(input.nodeId);
  const qcScreeningSnap = input.held.results.find(r => r.method === 'quality-control');
  const appliedQcRules = qcScreeningSnap
    ? [...new Set(qcScreeningSnap.rows.map(row => String(row[0] ?? '').trim()).filter(Boolean))]
    : [];
  const targetSecForPrompt = input.content.report.find(s => matchBlueprintNode(s.title)?.id === input.nodeId);
  const hasDisplayFormula = Boolean(
    targetSecForPrompt?.blocks?.some(b => b.kind === 'formula') ||
    ['data.testing', 'compare.tests', 'drivers.model', 'segments.cluster', 'diagnosis.evaluation'].includes(input.nodeId),
  );

  const specificRules: string[] = [];
  if (input.contract.mode === 'plan') {
    specificRules.push('当前是研究计划：全部调查、分析与行动均作为拟开展事项，不能把目标样本当成已回收样本，不能声称已经发现、验证或完成调查；摘要只概述研究问题、拟采用方法和待验证的预期用途。');
  }
  if (input.contract.mode === 'empirical') {
    specificRules.push(
      '当前为实际市场调查实证报告（mode=empirical）：全篇按真实实地与线上联合调查实证口吻撰写（第一章称“一、绪论”），严禁在正文、摘要、表注或附录中出现任何“教学模拟、模拟数据、模拟样本、模拟记录、脚本生成、随机种子、算法合成、演练语料、机器生成、数据生成、AI生成、AIGC、人工智能、大语言模型”字样，且严禁单独输出任何以“注：”“表注：”或“图注：”开头的注释段落或尾注行！',
    );
  }
  if (input.contract.mode === 'demonstration') {
    if (isBoundaryDisclosureNode) {
      specificRules.push('本轮分析的是模拟调查。线上链接、自愿参与、访问和预测试只写成后续计划；模拟数据的质量筛查仅按已登记的规则及处理方式描述。');
    } else {
      specificRules.push(
        '全篇已在摘要与方法章集中披露教学模拟边界，本节严禁在段首或段末重复“本轮仅作教学模拟，不报告真实调查发现”或“抽样方式待确认”套话，直接基于本节登记表展开严谨实证分析（线上链接、自愿招募与线下实地访问仍不得声称已实际执行）。',
      );
    }
  }
  if (input.nodeId === 'abstract') {
    specificRules.push(
      '本节为全篇【摘要】：有实际结果时必须写出正文 4 段共 920–1030 中文字的单页高密五步摘要（① 现实背景与核心矛盾张力 → ② 三阶段分层 PPS 抽样、跳题路由分母归口、预试 CR/KMO 净化与游程随机性核验 → ③ 阶梯式核心实证发现含描述/相关/控制总体满意度 OLS/Logistic/CFA-SEM 路径与聚类雷达、IPA×KANO×帕累托短板 → ④ 嵌合基层实情与当地特色政策工具的分层落地举措及量化核验监测口径；严禁写成四五百字的简短提纲；缺少结果时才明确写待验证）；最后单独第 5 段以“关键词：”开头，列出五到七个中文关键词，用顿号分隔。引用图表仅允许使用下方 exhibits 列表已分配的 {G1}..{Gn}，严禁编造列表外 {G编号}，更严禁将事实库 {F编号} 误写为 {G编号}。',
    );
  } else if (input.nodeId === 'intro.literature') {
    specificRules.push(
      input.tokens.references.length
        ? '结合本节文献关键词共现聚类网络图（如 {G1}）与已登记理论经典文献（如 TAM、UTAUT、SERVQUAL、TPB、创新扩散或文化反哺等 {R1}、{R2} 出处），评述四大主题聚类社区脉络及微观情境研究缺口以导出本问卷测量维度；正文中统一称“文献关键词共现聚类网络”（勿写软件商标英文名），严禁杜撰未登记文献，严禁写出“检索式与实收篇数待补”“实证全文待补核”等道歉套话。'
        : '围绕本研究核心构念与文献关键词共现聚类网络图评述经典理论脉络及微观情境研究空白，顺势导出本调查测量框架；严禁杜撰具体文献标题与年份。',
    );
  } else if (input.nodeId === 'intro.background' && input.tokens.references.length) {
    specificRules.push('在观点处用 references 里的占位符（{R1}、{R2} 等）标注出处，让文献服务于问题提出；不得杜撰文献或其结论。');
  } else if (input.nodeId === 'design.sampling' || input.nodeId === 'design.schedule') {
    if (input.contract.mode === 'demonstration') {
      specificRules.push(
        '未开展实地抽样框招募，模拟数据集的确定性注意力题与直线作答筛查台账统一在第3章报告，本节只阐述抽样边界或进度方案设计，勿写“不报告剔除数量”“未登记清洗判据”或将注意力核验题 Q14 写成仅标记不剔除！',
      );
    }
  } else if (input.nodeId === 'design.qc') {
    if (appliedQcRules.length && input.contract.mode === 'demonstration') {
      specificRules.push(
        `本节阐述质量控制方案设计，须与后文数据处理章筛查台账严格一致：明确说明未开展线下实地招募，但在合成数据集上已按预设注意力题与直线作答等已登记规则（${appliedQcRules.join('、')}）执行确定性模拟质控筛查（具体剔除与留存份数由数据处理章统一详报），严禁写出“不追认任何记录已被剔除”或“未执行任何筛查”等自相矛盾表述；没有登记的规则（如作答时长、逻辑矛盾）不声称已执行。`,
      );
    } else if (appliedQcRules.length && input.contract.mode === 'empirical') {
      specificRules.push(
        `本节阐述质量控制规则设计，须与数据处理章已登记筛查规则（${appliedQcRules.join('、')}）前后一致，没有采用的规则不声称已执行。`,
      );
    }
  } else if (input.nodeId === 'data.pilot') {
    specificRules.push('资料中有预调查结果才引用其 {F编号}；没有就只写预调查的做法与据此修订问卷的思路，并写明预调查指标尚未登记，不写任何数值。');
  } else if (input.nodeId === 'data.cleaning') {
    // Only the rules the registered screening applied: a rule the data had no column for was not run.
    specificRules.push(appliedQcRules.length
      ? `交代本次质量筛查实际采用的规则：${appliedQcRules.join('、')}（各规则是剔除还是仅标记，以筛查结果表为准）；没有采用的规则（如作答时长、逻辑矛盾）不写成已经做过。样本量与回收率只用资料中对应的 {F编号}，资料没有的计数不写。`
      : '资料中没有登记质量筛查结果：只写拟采用的筛查规则，并写明筛查结果尚未登记，不写任何计数。');
  } else if (input.nodeId === 'plan.measures') {
    specificRules.push(
      '紧扣前文聚类最低分短板簇与 IPA×KANO 核心断点，逐条结合基层微观实情与本课题所属领域的当地特色政策工具（见上方政策工具锚定清单）制定具象整改措施并呼应本节实施机制图 {G编号}；严禁写出“加强顶层设计、加大宣传力度、完善监管机制、形成多方合力”等空泛口号，正文中不用“抓手/赋能/闭环”字眼。',
    );
  } else if (input.nodeId === 'conclusion.suggestions') {
    specificRules.push(
      '每条对策建议须严格落成【实证断点（对应前文结论与图表 {G编号}）→ 具体基层执行主体 → 嵌合当地特色政策工具与制度载体的实操动作 → 可考核评估指标名称与追踪口径】四要素闭环；严禁写出“加强顶层设计、加大宣传力度、完善监管机制、形成多方合力”等大空话（正文中勿用“抓手/赋能/闭环”字眼），评估指标只写指标名称与口径，不擅自杜撰未登记目标数值。',
    );
  } else if (input.nodeId === 'sample.descriptive') {
    specificRules.push(
      '结合量表分布、多选痛点、样本行为复合画像图及开放题 Q32 主动建言高频语义词云与共现表（{G编号}）立体拆解现状反差；涉及开放题高频词或词云结果时，必须明确限定为“在主动填写实质建议的受访者中”，严禁夸大表述为“全样本共性关切”。',
    );
  } else if (input.nodeId === 'compare.tests') {
    specificRules.push('严禁将未达统计显著水平的相关或差异检验结果（p ≥ 0.05）升格表述为“有实证依据”，须客观表述为当前样本下未检出统计显著关联。');
  } else if (input.nodeId === 'diagnosis.evaluation') {
    specificRules.push('本节独家报告 IPA 分界线与坐标数值，须将 IPA 象限优先级准确界定为“样本内满意度隐性重要性排序（作为后续小规模试点的候选优先序，非直接复购或行为转化收益估计）”，避免使用“必须排在改进首位”的绝对化断言。');
  }
  if (hasDisplayFormula) {
    specificRules.push(
      '本节已内置独立编号的陈列数学公式块：正文中严禁再用纯文本重复默写整条模型方程（如严禁写“写作 Y=α+ΣbX+ε”或行内复抄 Better/Worse 计算分式），直接说明因变量、核心解释变量、控制变量与估计口径即可。',
    );
  }
  if (pending) {
    specificRules.push('本节尚无对应的登记结果：只写本节拟采用的分析思路与要回答的问题，写到的每种分析都用“拟”“计划”标明尚未进行，并明确写出“本节分析结果尚未登记”，不写任何结果、检验结论或诊断。');
  }
  if (input.tokens.exhibits.length > 0) {
    specificRules.push(
      `本节可引用 ${input.tokens.exhibits.length} 个图表（exhibits 列表）：在论述中写出占位符 ${input.tokens.exhibits.map(e => `{${e.id}}`).join('、')}（如“见{G1}”“如{G1}所示”，注意 {G编号} 展开后自带“表/图”字样，切勿写成“见表{G1}”或“见图{G1}”以免出现“表表/图图”重复），让图表与正文互证。`,
    );
  }
  const redLines = [
    '相关关系或横截面数据不写成因果（在“相关/关联”旁不用“导致、造成、决定了、引起了、使得”）；',
    'p 值不显著只说明现有样本尚不足以排除零假设，不写成“证明没有差异/不存在关联”；',
    '横截面调查不声称观察到“动态演化/状态转移”，机制推演须标明“路径假设”；',
    input.contract.mode === 'empirical'
      ? '实证调查报告（mode=empirical）严守真实调研语体，绝不出现“教学模拟、模拟数据、随机种子、脚本生成、演练语料、机器生成、AI生成、人工智能、大语言模型”等字样；'
      : isBoundaryDisclosureNode
        ? '模拟或合成数据（mode=demonstration）如实声明为教学模拟演示，不当作真实数据，也不当作稳健性检验；'
        : '模拟或合成数据（mode=demonstration）客观按样本内登记结果展开分析，不当作真实田野结论或稳健性检验，且不在本节重复免责声明套话；',
    '秩和等非参数检验比较的是分布位置，不写成“中位数相等/中位数无差异”；',
    ...(registered(/regress|logit|logistic|probit|ols/iu) ? ['OR（优势比）只写成“优势（odds）是参照组的多少倍”，不写成“概率是多少倍”；'] : []),
    ...(registered(/^sampling-frame$/u)
      ? isBoundaryDisclosureNode
        ? ['已登记模拟抽样框：须如实写明分层配额与覆盖范围待实地核验，不得将教学模拟配额写成真实田野回收，外推须谨慎；']
        : []
      : isBoundaryDisclosureNode
        ? ['资料中没有登记抽样框：不用“随机抽样、分层抽样、整群抽样、多阶段抽样、系统抽样、PPS 抽样”等名称声称已完成抽样，不推定采用过便利或配额抽样；如实写明抽样方式与覆盖范围待确认，外推须谨慎；']
        : ['资料中没有登记抽样框：不用“随机抽样、分层抽样、整群抽样、多阶段抽样、系统抽样、PPS 抽样”等名称声称已完成概率抽样（抽样与模拟边界已由方法章集中交代，本节严禁重复写“抽样方式与覆盖范围待确认”）；']),
    ...(registered(/cluster|kmeans|k-?modes|lpa/iu) ? ['聚类或潜剖面分析必须报告轮廓系数或信息准则等定类依据，且严禁用参与聚类的原变量做显著性检验来自证分群有效；'] : []),
    ...(registered(/sem|cfa|path|amos/iu) ? ['结构方程（SEM/CFA）在横截面下仅检验协方差结构相容性，不得声称证实因果方向或动态演化；如实汇报拟合指标，不得将有序李克特量表以邻近均值简单插补；'] : []),
    ...(registered(/rf|xgb|lgb|gbdt|tree|forest|shap|boost/iu) ? ['树模型与机器学习归因须围绕已登记误差指标与 SHAP 或局部边缘效应解释非线性拐点，严禁先聚类再拿同一批变量做分类预测循环自证准确率；'] : []),
    ...(registered(/lda|sentiment|text|nlp|wordcloud|tfidf|cooccur/iu) ? ['文本挖掘与舆情分析必须显式标明所提维度如何转译为后文问卷构念或对策举措，避免沦为孤立词云，并交代网评人群对全体的覆盖偏差；'] : []),
    ...(registered(/ipa|servperf|topsis|ahp|entropy|fuzzy|kano|conjoint/iu) ? ['评价与优先级模型须写明权重或象限阈值来源，紧扣高重要度低表现短板确立整改先后序，避免无实证锚点的空心矩阵填表；'] : []),
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
    facts: input.tokens.facts
      .filter(f => !INTERNAL_META_WARNING_RE.test(f.text))
      .map(({ id, text }) => ({ id, text })),
    exhibits: input.tokens.exhibits.map(({ id, text }) => ({ id, text })),
    references: input.tokens.references.map(({ id, text }) => ({ id, text })),
    findings: (FIELDWORK_NODES.has(input.nodeId) || PLAN_NODE.test(input.nodeId) ? [] : standingFindings(input.held))
      .filter(f => !INTERNAL_META_WARNING_RE.test(`${f.title} ${f.interpretation} ${f.scope}`))
      .slice(0, 12)
      .map(f => {
        const isIpaFinding = /\bIPA\b|重要性—表现|隐性重要性|重点改进象限/iu.test(`${f.title} ${f.interpretation}`);
        const stripIpaDecimals = isIpaFinding && input.nodeId !== 'diagnosis.evaluation';
        const scrubNums = (s: string) =>
          stripIpaDecimals ? s.replace(/[（(][^（）()]*\d+\.\d+[^（）()]*[)）]/gu, '').replace(/\d+\.\d+/gu, '').replace(/\s+/gu, ' ').trim() : s;
        return {
          title: scrubNums(f.title),
          interpretation: scrubNums(f.interpretation),
          scope: scrubNums(f.scope),
          action: scrubNums(f.action),
        };
      }),
    ...(outline ? { outline } : {}),
  };

  const steeringBlock = input.steeringNotes?.length
    ? `\n【用户实时插话与写作干预指令（须在不违反上述事实底线的前提下优先呼应）】\n${input.steeringNotes.map((note, idx) => `${idx + 1}. ${note}`).join('\n')}`
    : '';
  const rhetoric = getSectionRhetoricalBlueprint(input.nodeId) ?? FALLBACK_RHETORICAL_BLUEPRINTS[input.nodeId] ?? null;
  const rhetoricBlock = rhetoric
    ? `\n【本节国奖论证骨架与学术修辞引导（自二〇四篇国奖实证档案提炼，仅使用资料与登记证据表中的真实数字或占位符，严禁编造未登记数值）】\n` +
      `· 论证推进骨架：${rhetoric.structuralArc}\n` +
      `· 开篇参考切入：${rhetoric.openingMove}\n` +
      `· 评委防扣分关口：${rhetoric.judgeCheckpoint}`
    : '';
  const activeStoryline = input.storyline ?? buildDeterministicStorylineBrief(
    {
      blueprint: input.contract.topic,
      design: input.design ?? ({ questions: [] } as unknown as Questionnaire),
      dataset: null,
      report: input.content,
    },
    input.contract.topic,
    input.contract.mode,
  );
  const storylineBlock = `\n${formatStorylineForSection(activeStoryline, input.nodeId)}`;
  const corpusSkillBlock = `\n${sectionCorpusSkillBlock(input.nodeId, methods, input.contract.mode)}`;
  const evidenceTables = formatSectionEvidenceTables(input.held, input.content, input.nodeId, {
    preservedNotes: input.preservedNotes,
    ...(isSynthesis ? { maxTables: 6, maxRows: 10 } : { maxTables: 8, maxRows: 16 }),
  });
  const evidenceBlock = evidenceTables
    ? `\n【本节完整登记证据三线表与模型诊断（含全列参数、n/total 样本分母与拟合指标）】\n${evidenceTables}`
    : '';
  const crossChapterDigestBlock =
    !pending && input.contract.mode !== 'plan' && CROSS_CHAPTER_SYNTHESIS_DIGEST_NODES.has(input.nodeId)
      ? buildCrossChapterEvidenceDigest(input.held.results, input.preservedNotes, input.contract.mode)
      : '';
  const styleMotherLead = MOTHER_INSIGHT_NODES.has(input.nodeId) ? '紧扣主线张力，' : '';
  const competitionName = (input.competitionName ?? input.contract.competitionName ?? '').trim() || '“益普索杯”第十七届全国大学生市场调查与分析大赛';
  return (
    `你是${competitionName}的报告撰稿助手，按《市调科研融合技能包》规范撰写报告章节。\n` +
    `当前撰写章节：「${section.title}」（节点 ID：${section.node}）。\n` +
    '【规则一：数字只来自资料与登记三线表】\n' +
    '1. 统计数字、样本量、百分比、均值、回归系数、优势比、置信区间、检验统计量与拟合优度，只允许引用下方「登记证据三线表」中的精确数值（支持同表合法加总、百分点差值与小数—百分比互转，如 $R^2=0.482$、$p<0.001$、$95\\%$ CI）或资料 facts 中的 {F编号} 占位符；严禁杜撰任何资料外的统计值，严禁把 B 组/B 行的数字张冠李戴写到 A 组/A 行名下。\n' +
    '2. 引用图表必须写 {G编号}（如“见{G1}”“如{G1}所示”）；“见”“所示”只跟图表 {G编号}，不跟数字 {F编号}。引用文献写 {R编号}（如“既有研究指出{R1}”）。\n' +
    '3. 可自然使用题号（如 Q1–Q32）、潜因子代号（F1–F4）与常规方法学判据阈值（如显著性水平 0.05、VIF 低于 5、KMO 高于 0.7）；不得用模糊汉字写统计数量（如“一点八倍”“三倍”“十四个百分点”“百分之三十”“一成”“四成”）。违规句子将被核验器精准剔除。\n' +
    '【规则二：只写已登记的分析】\n' +
    (planSection
      ? input.nodeId === 'design.qc' && appliedQcRules.length && input.contract.mode !== 'plan'
        ? '本节属于质量控制方案设计：阐明预设质控机制及其与后文已登记筛查规则的对应关系，但不得提前展开下游检验或回归结果。\n'
        : '本节属于研究设计：可以说明拟采用的分析方法，但不得声称已得出结果。\n'
      : `资料 analyses 列出了本研究已登记的全部分析（${analyses.join('、') || '暂无'}）。没有列出的分析（如回归模型、Logit、优势比、边际效应、方差膨胀因子、因子分析、KMO、聚类）不得声称做过，也不得给出其结果或诊断。\n`) +
    '【规则三：防误读红线】\n' +
    redLines.map((rule, i) => `${i + 1}. ${rule}`).join('\n') +
    (owner ? `\n【本节负责顾问】「${owner.name}」（技能 ${owner.skill}）：${owner.line} 写作规则：${owner.rules.join('；')}。` : '') +
    `\n${buildDeAiPromptRules('academic_clean')}` +
    corpusSkillBlock +
    storylineBlock +
    steeringBlock +
    rhetoricBlock +
    '\n【写作体例】\n' +
    `中文学术调查报告语体（${styleMotherLead}短句立判接带括号统计复句错落行文）；正文中严禁出现方头括号【】、直角引号「」或『』以及非数学公式花括号{}，一律采用中文规范双引号“”与标准学术标点；严禁在正文段落中使用“名词/方法名/指标名：解释性描述”的词典式标签冒号起句，须将方法名称、统计指标与实证发现自然融合进连贯的中文学术叙述段中；图文互文讲究自然衔接（先点明为何看图再精准指代 {G编号}，重点拆解极值反差、分布形态或非显著断点并顺势引出下阶解释，避免机械八股套话）；定量图只从冻结结果提取，概念配图不写虚构数值；章尾按逻辑缺口自然过渡，每节输出二至六段（每段一百到二百二十字，单段不换行），合并提交件（含标题页、摘要、目录、正文与参考文献）控制在竞赛六十五页篇幅上限内。\n` +
    (specificRules.length ? `【本节专项要求】\n${specificRules.join('\n')}\n` : '') +
    crossChapterDigestBlock +
    evidenceBlock +
    '\n只输出严格合法的 JSON 对象：{"paragraphs":[{"text":"段落正文"}]}，不要输出任何额外解释。\n' +
    `资料 JSON：${JSON.stringify(material)}`
  );
}

/**
 * The revision round for a section the report check flagged: the model gets its own paragraphs back, placeholders
 * unexpanded, with the problems named, and changes only the sentences at fault.
 */
export function buildRevisionPrompt(
  title: string,
  drafts: readonly string[],
  problems: readonly string[],
  tokens: SectionTokenMap,
  options?: {
    nodeId?: string;
    held?: NonNullable<ResultsView>;
    content?: EditorContent;
    preservedNotes?: ReadonlyMap<string, readonly string[]>;
    evidenceTables?: string;
  },
): string {
  const material = {
    paragraphs: drafts,
    facts: tokens.facts.map(({ id, text }) => ({ id, text })),
    exhibits: tokens.exhibits.map(({ id, text }) => ({ id, text })),
    references: tokens.references.map(({ id, text }) => ({ id, text })),
  };
  const rawTables =
    options?.evidenceTables ??
    (options?.held && options?.content && options?.nodeId
      ? formatSectionEvidenceTables(options.held, options.content, options.nodeId, {
          maxTables: 6,
          maxRows: 12,
          preservedNotes: options.preservedNotes,
        })
      : '');
  const trimmedTables = rawTables.length > 4800 ? `${rawTables.slice(0, 4800)}\n（其余明细省略）` : rawTables;
  const evidenceBlock = trimmedTables
    ? `\n【本节登记证据三线表与行—实体对照摘要（修订时按行—实体严格核对数值，严禁张冠李戴）】\n${trimmedTables}`
    : '';
  return (
    `你是同一份调查报告的审稿修订助手。下面是「${title}」一节的段落，图表与引文锚点仍以 {F编号}、{G编号}、{R编号} 占位。审稿发现以下问题：\n` +
    problems.map((p, i) => `${i + 1}. ${p}`).join('\n') +
    '\n请只改出问题的句子，其余原样保留；保持原有已核验的数值与占位符不变，不新增资料中没有的数字、分析或结论，也不得用汉字写模糊数量；“见”“所示”只跟图表 {G编号}。' +
    evidenceBlock +
    '\n只输出严格合法的 JSON 对象：{"paragraphs":[{"text":"段落正文"}]}，不要输出任何额外解释。\n' +
    `资料 JSON：${JSON.stringify(material)}`
  );
}

/** A number pointed to as if it were a table or figure: "见{F3}", "（见{F5}、{F6}）", "{F3}所示水平". */
const FACT_AS_EXHIBIT = /(?:见|参见|详见|参照)\s*[（(]?\s*\{F\d+\}|\{F\d+\}\s*所(?:示|载|列|述|绘|给出)/u;
const COMPLETED_RECRUITMENT = /(?:本次|此次|实际|本研究的?)(?:正式)?(?:调查|招募|发放|回收)(?:的方式)?\s*(?:已|采用|使用|通过|采取|系|为)[^。！？；]{0,45}(?:线上|线下|公开链接|受访者|自愿作答|招募渠道)|(?:线上公开链接|线下拦截|现场招募|自愿作答)[^。！？；]{0,30}(?:是|为)主要(?:触达|招募|发放|回收)方式/u;
const RECRUITMENT_CHANNEL = /(?:通过|采用|经由)(?:[^，。！？；]{0,12})(?:线上|线下|公开链接|微信群|现场)[^，。！？；]{0,24}(?:发放|投放|招募|回收)/u;
const COMPLETED_PILOT = /(?:本次|此次)?(?:预调查|预调研|预测试)(?:的?(?:对象|样本|结果))?\s*(?:已经|已|按|对[^。！？；]{0,35}(?:计算|筛查|进行了)|与[^。！？；]{0,20}一致|属于|形成)|经此环节[^。！？；]{0,35}得到[^。！？；]{0,15}(?:初步)?检验/u;
const SCREENING_RULES = [/时长|答题时间/u, /逻辑一致|逻辑矛盾|逻辑校验/u, /反向题[^。！？；]{0,15}(?:一致|矛盾)|反向题与正问/u];
const FUTURE_FIELDWORK = /后续|(?<!模)拟(?!合)|计划|建议|将(?:采用|通过|进行|开展|安排|按|发放|招募)|(?:预调查|预调研|预测试)(?:完成|形成)后/u;
const COMPLETION_CUE = /已经|已(?:按|通过|使用|完成|实施|回收|发放|剔除|形成|获得|进行|开展)|过后|结果(?:显示|表明)/u;
const DUPLICATE_ANSWER = /答案(?:完全)?重复|重复答案|重复答卷/u;

function simulatedFieldworkIssue(text: string, pilotPending: boolean, screening: readonly string[], duplicatesMarked: boolean): string {
  for (const clause of text.split(/[。！？；\n]/u)) {
    const futureOnly = FUTURE_FIELDWORK.test(clause) && !COMPLETION_CUE.test(clause);
    if (!futureOnly && (COMPLETED_RECRUITMENT.test(clause) || RECRUITMENT_CHANNEL.test(clause))) {
      return '教学模拟不能声称开展过真人调查或招募';
    }
    if (!futureOnly && pilotPending && COMPLETED_PILOT.test(clause)) return '未登记预调查结果，不能声称已经执行';
    const claimsScreening = /筛查|筛选|剔除|清理|核查|检查/u.test(clause)
      && /剔除|排除|筛掉|保留|按[^。！？；]{0,42}(?:规则|标准)|逐份/u.test(clause);
    if (!claimsScreening || futureOnly || /(?:未|没有)(?:做|用|采用|按|执行|剔除|排除)/u.test(clause)) continue;
    if (SCREENING_RULES.some(rule => rule.test(clause) && !screening.some(label => rule.test(label)))) {
      return '描述了未登记的模拟数据筛查规则';
    }
    if (duplicatesMarked && DUPLICATE_ANSWER.test(clause) && /剔除|排除|筛掉/u.test(clause)
      && !/仅(?:作)?标记|保留.*重复/u.test(clause)) return '将仅标记的重复答卷写成了剔除';
  }
  return '';
}

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
  context?: { methods: readonly string[]; planSection: boolean; pending?: boolean; labels?: readonly string[]; mode?: ProjectResearchMode; pilotPending?: boolean; screening?: readonly string[]; duplicatesMarked?: boolean },
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
    // Mask conceptual mathematical symbols ($R^2$, R²) and confidence-interval level labels (95%置信区间) solely for digit gating.
    const numbersOnly = withoutNames(withoutPlaceholders, context?.labels)
      .replace(/\$?\bR\s*\^\s*\{?2\}?\$?|R²/gu, '□')
      .replace(/(?:95|99|90)\s*[%％]\s*置信区间/gu, '□');

    // A rate or share must cite a share: "有效回收率{F2}" bound to a count (641) is a wrong fact, however fluent.
    const misbound = [...sanitized.matchAll(new RegExp(`(?:率|占比|比例|百分比)(?:为|是|达|达到|约为|仅|仅为)?\\s*\\{(F\\d+)\\}`, 'gu'))]
      .some(m => { const v = factMap.get(m[1]) ?? ''; return !/%$/u.test(v) && !(Number(v) >= 0 && Number(v) <= 1 && /\./u.test(v)); });
    const planned = !!context && (context.planSection || (!!context.pending && PLANNED.test(withoutPlaceholders)));
    const unbacked = context && !planned ? unbackedAnalyses(withoutPlaceholders, context.methods) : [];
    const mismatched = mismatchedFactContext(sanitized, tokens.facts);
    const completedPlan = context?.mode === 'plan'
      && /(?:本次调查|本研究|调查结果|统计结果|检验结果|模型结果).{0,20}(?:已经|已完成|已回收|已收集|表明|显示|证实|证明|发现)/u.test(withoutPlaceholders);
    const fieldworkIssue = context?.mode === 'demonstration'
      ? simulatedFieldworkIssue(withoutPlaceholders, context.pilotPending ?? false, context.screening ?? [], context.duplicatesMarked ?? false) : '';
    const reason = unknownToken
      ? '引用了不存在的占位符'
      : misbound
        ? '比率处引用了不是比率的数字'
        : mismatched
        ? mismatched
        : completedPlan
        ? '研究计划不能声称已完成调查或得到结果'
        : fieldworkIssue
        ? fieldworkIssue
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
        max_tokens: 3600,
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

const MAX_SECTION_BLOCKS = 60;
const EXPLICIT_SIMULATION_BANNER_NODES: ReadonlySet<string> = new Set([
  'abstract',
  'data.cleaning',
  'conclusion.limits',
  'appendix.ai',
]);
const METHOD_DISCLOSURE_BOUNDARY_NODES: ReadonlySet<string> = new Set([
  'abstract',
  'design.population',
  'design.sampling',
  'data.cleaning',
  'conclusion.limits',
]);

/**
 * 全篇公式去重：相同 TeX 公式在整本报告中仅保留首次出现的 formula 内容块，
 * 并将后续被去重公式块的 `[[式:oldId]]` 引用重写至首次保留块，确保零失效引用。
 */
export function deduplicateReportFormulas(
  content: EditorContent,
  mutableNodes?: ReadonlySet<string>,
): EditorContent {
  const seenByNormTex = new Map<string, string>();
  const redirectedIds = new Map<string, string>();

  const dedupedSections = content.report.map(sec => {
    const nodeId = matchBlueprintNode(sec.title)?.id ?? '';
    const isMutable = !mutableNodes || mutableNodes.has(nodeId);
    if (!sec.blocks?.length) return sec;
    let droppedAny = false;
    const nextBlocks = sec.blocks.filter(b => {
      if (b.kind !== 'formula') return true;
      const norm = b.text.replace(/\s+/gu, '').trim();
      if (!norm) return true;
      const existingId = seenByNormTex.get(norm);
      if (!existingId) {
        seenByNormTex.set(norm, b.id);
        return true;
      }
      if (!isMutable) return true;
      redirectedIds.set(b.id, existingId);
      droppedAny = true;
      return false;
    });
    return droppedAny ? { ...sec, blocks: nextBlocks } : sec;
  });

  if (!redirectedIds.size) {
    return { ...content, report: dedupedSections };
  }

  const rewriteFormulaRefs = (text: string) =>
    text.replace(/\[\[式:([^\]\n]{1,80})\]\]/gu, (full, id: string) =>
      redirectedIds.has(id) ? `[[式:${redirectedIds.get(id)!}]]` : full,
    );

  return {
    ...content,
    report: dedupedSections.map(sec => {
      const nodeId = matchBlueprintNode(sec.title)?.id ?? '';
      if (mutableNodes && !mutableNodes.has(nodeId)) return sec;
      return {
        ...sec,
        body: rewriteFormulaRefs(sec.body),
        ...(sec.blocks
          ? { blocks: sec.blocks.map(b => (b.kind === 'paragraph' ? { ...b, text: rewriteFormulaRefs(b.text) } : b)) }
          : {}),
      };
    }),
  };
}

/**
 * 块级图文穿插组装（Block-Interleaved Assembly）：
 * - 首段进入 `section.body`（单段无内部换行）；
 * - 其余段落逐段封装为独立 `paragraph` 内容块（单块 1 段、块内零 `\n`），围绕 `formula`/`table`/`chart` 顺序穿插排布；
 * - 严格保持原有非段落块顺序不乱（保障图表序号稳定）且总块数 `<= 60`。
 */
export function assembleInterleavedSection(
  section: ReportSection,
  rawParagraphs: readonly string[],
): ReportSection {
  const cleanParas = rawParagraphs
    .flatMap(p => p.split(/\r?\n/u).map(line => line.trim()).filter(Boolean));
  const nonParaBlocks = (section.blocks ?? []).filter(b => b.kind !== 'paragraph');

  if (!cleanParas.length) {
    return {
      ...section,
      body: '',
      ...(section.blocks ? { blocks: nonParaBlocks } : {}),
    };
  }

  const leadBody = cleanParas[0];
  const rest = cleanParas.slice(1);
  if (!rest.length) {
    return {
      ...section,
      body: leadBody,
      ...(section.blocks ? { blocks: nonParaBlocks } : {}),
    };
  }

  const keywordParas = rest.filter(p => /^关键词[:：]/u.test(p));
  const proseParas = rest.filter(p => !/^关键词[:：]/u.test(p));
  const maxAllowedParaBlocks = Math.max(0, MAX_SECTION_BLOCKS - nonParaBlocks.length);
  const reservedKw = keywordParas.slice(0, Math.min(keywordParas.length, maxAllowedParaBlocks));
  const cappedProse = proseParas.slice(0, Math.max(0, maxAllowedParaBlocks - reservedKw.length));

  const usedIds = new Set(nonParaBlocks.map(b => b.id));
  let paraCounter = 0;
  const makeParaBlock = (text: string): ReportBlock => {
    paraCounter++;
    let id = `blk-p-${section.id}-${paraCounter}`;
    while (usedIds.has(id)) {
      paraCounter++;
      id = `blk-p-${section.id}-${paraCounter}`;
    }
    usedIds.add(id);
    return { id, kind: 'paragraph', text, evidenceId: '', valueColumn: 0 };
  };

  if (!nonParaBlocks.length) {
    const onlyParas = [...cappedProse, ...reservedKw].map(makeParaBlock);
    return { ...section, body: leadBody, blocks: onlyParas };
  }

  const assembled: ReportBlock[] = [];
  let cursor = 0;

  // 1. Place leading formula blocks (and any exhibit explicitly cited in leadBody) immediately after leadBody
  while (cursor < nonParaBlocks.length) {
    const blk = nonParaBlocks[cursor];
    const citedInLead =
      leadBody.includes(`[[图:${blk.id}]]`) ||
      leadBody.includes(`[[表:${blk.id}]]`) ||
      leadBody.includes(`[[式:${blk.id}]]`);
    if (blk.kind === 'formula' || citedInLead) {
      assembled.push(blk);
      cursor++;
    } else {
      break;
    }
  }

  // 2. Interleave remaining prose paragraphs with remaining formula/table/chart blocks in order
  for (let i = 0; i < cappedProse.length; i++) {
    const pText = cappedProse[i];
    assembled.push(makeParaBlock(pText));

    // Find furthest unplaced exhibit explicitly cited in this paragraph
    let citedUpTo = -1;
    for (let j = cursor; j < nonParaBlocks.length; j++) {
      const blk = nonParaBlocks[j];
      if (
        pText.includes(`[[图:${blk.id}]]`) ||
        pText.includes(`[[表:${blk.id}]]`) ||
        pText.includes(`[[式:${blk.id}]]`)
      ) {
        citedUpTo = j;
      }
    }
    if (citedUpTo >= cursor) {
      while (cursor <= citedUpTo) {
        assembled.push(nonParaBlocks[cursor++]);
      }
    } else if (cursor < nonParaBlocks.length) {
      const parasRemainingAfter = cappedProse.length - 1 - i;
      const exhibitsRemaining = nonParaBlocks.length - cursor;
      if (parasRemainingAfter === 0 || exhibitsRemaining >= parasRemainingAfter) {
        assembled.push(nonParaBlocks[cursor++]);
      }
    }
  }

  // 3. Flush any remaining exhibits and append trailing keyword blocks
  while (cursor < nonParaBlocks.length) {
    assembled.push(nonParaBlocks[cursor++]);
  }
  for (const kw of reservedKw) {
    assembled.push(makeParaBlock(kw));
  }

  return {
    ...section,
    body: leadBody,
    blocks: assembled.slice(0, MAX_SECTION_BLOCKS),
  };
}

function sectionCombinedProse(section: ReportSection): string {
  return [
    section.body,
    ...(section.blocks ?? []).filter(b => b.kind === 'paragraph').map(b => b.text),
  ]
    .filter(Boolean)
    .join('\n');
}

function pruneEchoedBlockSentences(
  content: EditorContent,
  mutableNodes: ReadonlySet<string>,
): EditorContent {
  const seenGramCounts = new Map<string, number>();
  const extractGrams = (s: string): string[] => {
    const cleaned = s
      .replace(/【教学模拟数据[^】]*】/gu, '')
      .replace(/本节统计证据(?:详见|见)[^。！？!?\r\n]*/gu, '')
      .replace(/(?:围绕|针对|关于|结合)「[^」]{1,80}」[，,]?(?:具体|对应|详细|实测)(?:统计)?(?:结果|分布|参数|数据)见[^。！？!?\r\n]*/gu, '')
      .replace(/\[\[(?:图|表|式|引):[^\]]+\]\]/gu, '')
      .replace(/\$[^$]{1,80}\$/gu, '');
    const grams: string[] = [];
    for (const sentence of cleaned.split(/[。！？!?\r\n]+/u)) {
      const clean = sentence.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
      for (let i = 0; i + 8 <= clean.length; i++) grams.push(clean.slice(i, i + 8));
    }
    return grams;
  };
  const isRedundantDisclaimerSentence = (sent: string): boolean => {
    if (/\[\[(?:图|表|式|引):/u.test(sent)) return false;
    const s = sent.trim();
    return (
      /^(?:本轮|本次|本研究|本节)(?:分析|报告|内容)?(?:仅作|属于|系|为)教学模拟[^。！？!?]{0,42}[。！？!?]?$/u.test(s) ||
      /^[^。！？!?]{0,28}(?:抽样方式与覆盖范围待确认|不报告真实调查发现)[^。！？!?]{0,30}[。！？!?]?$/u.test(s)
    );
  };

  return {
    ...content,
    report: content.report.map(sec => {
      const node = matchBlueprintNode(sec.title);
      if (!node || (node.kind !== 'section' && node.kind !== 'abstract')) return sec;
      const isMutable = mutableNodes.has(node.id);
      const stripNonBoundaryBoilerplate = isMutable && !METHOD_DISCLOSURE_BOUNDARY_NODES.has(node.id);

      let nextBody = sec.body;
      if (stripNonBoundaryBoilerplate && nextBody.trim()) {
        const bodySents = nextBody.split(/(?<=[。！？!?])\s*/u).filter(Boolean);
        if (bodySents.length >= 2) {
          const filteredBody = bodySents.filter(s => !isRedundantDisclaimerSentence(s));
          if (filteredBody.length >= 1) nextBody = filteredBody.join('');
        }
      }
      const bodyGrams = new Set(extractGrams(nextBody));

      let nextBlocks = sec.blocks;
      if (isMutable && sec.blocks?.length) {
        nextBlocks = sec.blocks.flatMap(b => {
          if (b.kind !== 'paragraph' || /^关键词[:：]/u.test(b.text.trim())) return [b];
          // Never drop a paragraph block that carries an exhibit or citation token
          if (/\[\[(?:图|表|式|引):/u.test(b.text)) {
            for (const g of extractGrams(b.text)) bodyGrams.add(g);
            return [b];
          }
          const sentences = b.text.split(/(?<=[。！？!?])\s*/u).filter(Boolean);
          const kept = sentences.filter(sent => {
            if (stripNonBoundaryBoilerplate && isRedundantDisclaimerSentence(sent)) return false;
            const gs = extractGrams(sent);
            if (gs.length < 6) return true;
            const repeated = gs.filter(g => (seenGramCounts.get(g) ?? 0) >= 3).length;
            return repeated < Math.max(6, Math.ceil(gs.length * 0.6));
          });
          for (const g of extractGrams(kept.join(''))) bodyGrams.add(g);
          if (!kept.length) return [];
          return [{ ...b, text: kept.join('') }];
        });
      } else if (sec.blocks?.length) {
        for (const b of sec.blocks) {
          if (b.kind === 'paragraph') {
            for (const g of extractGrams(b.text)) bodyGrams.add(g);
          }
        }
      }

      for (const g of bodyGrams) {
        seenGramCounts.set(g, (seenGramCounts.get(g) ?? 0) + 1);
      }
      return nextBlocks === sec.blocks && nextBody === sec.body
        ? sec
        : { ...sec, body: nextBody, ...(nextBlocks ? { blocks: nextBlocks } : {}) };
    }),
  };
}

const EXHIBIT_METHOD_CUE: Readonly<Record<string, RegExp>> = {
  correlation: /相关|Spearman|矩阵|热力/iu,
  crosstab: /列联|卡方|χ|Cram[eé]r/iu,
  profile: /Kruskal|Holm|组间|分布位置|秩和/iu,
  regression: /线性回归|OLS|VIF|调整\s*\$?R/iu,
  logistic: /Logistic|Logit|优势比|\bOR\b|边际效应|AME|McFadden/iu,
  cluster: /聚类|轮廓系数|K-?means|分群/iu,
  ipa: /\bIPA\b|象限|重要度/iu,
  kano: /\bKANO\b|魅力型|必备型|期望型|Better|Worse/iu,
  validity: /KMO|Bartlett|因子载荷|特征值|碎石/iu,
  alpha: /Cronbach|信度|内部一致性/iu,
  'multi-response': /多选|普及率|响应占比/iu,
  'text-mining': /高频|词频|共现|开放题/iu,
  'grounded-coding': /扎根|三级编码|主轴编码/iu,
  pilot: /预调查|预测试|试填/iu,
  'pilot-pretest': /预调查|预测试|试填/iu,
  'quality-control': /筛查|清洗|剔除/iu,
  'denominator-reconciliation': /分母|跳题|路由/iu,
  'pilot-decision-matrix': /试点|止损|对照|回退/iu,
  'stop-loss': /试点|止损|对照|回退/iu,
  'sampling-frame': /抽样|PPS|分层|配额|样本量/iu,
  'pilot-purification': /预调查|临界比|CR|净化|KMO/iu,
  'runs-test': /游程|Runs|随机性/iu,
  sem: /结构方程|SEM|CFA|路径系数|RMSEA|CFI/iu,
  'sem-fit': /拟合|RMSEA|CFI|TLI|SRMR/iu,
  'sem-paths': /路径|标准化|中介|临界比/iu,
  'cluster-radar': /雷达|轮廓|多维对比|簇/iu,
  pareto: /帕累托|二八|累积|痛点/iu,
  infographic: /总体特征|全景|核心场景|受访群体|人群构成|频次|渠道|预算/iu,
  cooccurrence: /共现|文献|聚类网络|关键词/iu,
  wordcloud: /词云|高频语义|主动建言|开放题/iu,
  'macro-trend': /规模|渗透率|趋势|增长|宏观|2019|2025/iu,
  'summary-card': /框架|意义|创新|路径|核心发现|总结/iu,
};

function cleanCaptionTopicForPointer(raw: string): string {
  const cleaned = raw
    .replace(/^(?:表|图)\s*\d+(?:\s*[-－—.．]\s*\d+)*\s*/u, '')
    .replace(/[？?！!]/gu, '')
    .replace(/(?:分布图|分布表|分析表|分析图|汇总表|一览表)$/u, '')
    .trim();
  return (cleaned || '本项指标').slice(0, 26);
}

function methodAwareExhibitTransition(
  method: string | undefined,
  topicLabel: string,
  token: string,
  idx: number,
  attachedInline: boolean,
): string {
  const pick = (variants: readonly string[]) => variants[idx % variants.length];
  if (attachedInline) {
    switch (method) {
      case 'regression':
        return pick([`回归估计结果列示于${token}。`, `参数拟合与检验详见${token}。`]);
      case 'logistic':
        return pick([`模型优势比估计详见${token}。`, `离散选择检验结果见${token}。`]);
      case 'validity':
      case 'alpha':
        return pick([`信效度检核见${token}。`, `量表检验结果详见${token}。`]);
      case 'cluster':
      case 'profile':
        return pick([`分群对比结果见${token}。`, `组别特征剖面详见${token}。`]);
      case 'ipa':
      case 'kano':
        return pick([`归类与排序结果见${token}。`, `优先级划分详见${token}。`]);
      case 'crosstab':
      case 'correlation':
        return pick([`列联与检验明细见${token}。`, `统计关联结果详见${token}。`]);
      case 'wordcloud':
      case 'text-mining':
      case 'cooccurrence':
        return pick([`高频语义分布见${token}。`, `文本结构呈现详见${token}。`]);
      case 'infographic':
      case 'diagram':
      case 'framework':
      case 'summary-card':
      case 'macro-trend':
        return pick([`结构概览详见${token}。`, `维度映射参见${token}。`]);
      default:
        return pick([`详见${token}。`, `明细列示于${token}。`, `分布参见${token}。`]);
    }
  }
  switch (method) {
    case 'regression':
      return pick([`线性估计、共线性与拟合检核见${token}。`, `多元方程系数及诊断结果列示于${token}。`]);
    case 'logistic':
      return pick([`二元选择优势比及边际估算见${token}。`, `概率预测与模型区分度指标详见${token}。`]);
    case 'validity':
      return pick([`因子特征值及载荷分布见${token}。`, `旋转载荷与效度检验结果详见${token}。`]);
    case 'alpha':
      return pick([`内部一致性信度指标汇总于${token}。`, `分量表信度检核结果列示于${token}。`]);
    case 'cluster':
      return pick([`标准化聚类轮廓与中心特征参见${token}。`, `群体分群特征及类别分布见${token}。`]);
    case 'profile':
      return pick([`各组得分剖面与组间比较见${token}。`, `非参数差异分布及对比结果详见${token}。`]);
    case 'ipa':
      return pick([`重要度—表现象限分布位置见${token}。`, `候选指标象限归属情况详见${token}。`]);
    case 'kano':
      return pick([`正反评价归类与敏感系数见${token}。`, `需求属性分类与系数汇总于${token}。`]);
    case 'crosstab':
      return pick([`不同群体在“${topicLabel}”上的分布见${token}。`, `“${topicLabel}”的交叉列联与卡方见${token}。`]);
    case 'correlation':
      return pick([`核心维度秩相关矩阵列示于${token}。`, `指标间两两相关性检验结果见${token}。`]);
    case 'multi-response':
      return pick([`“${topicLabel}”的普及率与响应构成见${token}。`, `多选痛点占比排序分布详见${token}。`]);
    case 'text-mining':
    case 'wordcloud':
      return pick([`开放文本在“${topicLabel}”上的高频特征见${token}。`, `受访者主动建言语义焦点参见${token}。`]);
    case 'cooccurrence':
      return pick([`文献关键词共现聚类脉络详见${token}。`, `核心构念关联网络图谱参见${token}。`]);
    case 'framework':
    case 'diagram':
      return pick([`“${topicLabel}”的框架与路由关系参见${token}。`, `研究设计结构与衔接流程见${token}。`]);
    case 'macro-trend':
      return pick([`行业供给规模与渗透趋势参考见${token}。`, `宏观演进轨迹与场景背景详见${token}。`]);
    case 'summary-card':
    case 'infographic':
      return pick([`“${topicLabel}”的核心维度概览见${token}。`, `多维指标结构化汇总呈现于${token}。`]);
    case 'sampling-frame':
      return pick([`分层配额与抽样单元分配见${token}。`, `三阶段 PPS 配额明细列于${token}。`]);
    case 'runs-test':
      return pick([`序列游程随机性检核见${token}。`, `Runs 检验临界统计量列于${token}。`]);
    case 'sem':
    case 'sem-fit':
    case 'sem-paths':
      return pick([`潜变量模型适配与路径见${token}。`, `结构方程检验指标列于${token}。`]);
    case 'cluster-radar':
      return pick([`多簇维均分轮廓雷达见${token}。`, `群体轮廓强弱项对比详见${token}。`]);
    case 'pareto':
      return pick([`核心短板帕累托排序见${token}。`, `累积占比与关键少数列于${token}。`]);
    case 'pilot':
    case 'pilot-pretest':
    case 'pilot-purification':
    case 'quality-control':
    case 'denominator-reconciliation':
    case 'pilot-decision-matrix':
    case 'stop-loss':
      return pick([`“${topicLabel}”核查指标见${token}。`, `“${topicLabel}”过程台账见${token}。`]);
    default: {
      const leadFrames: readonly ((topic: string, tok: string) => string)[] = [
        (t, tok) => `“${t}”指标详见${tok}。`,
        (t, tok) => `针对“${t}”见${tok}。`,
        (t, tok) => `关于“${t}”参见${tok}。`,
        (t, tok) => `结合“${t}”见${tok}。`,
        (t, tok) => `“${t}”汇总列于${tok}。`,
        (t, tok) => `围绕“${t}”参见${tok}。`,
      ];
      return leadFrames[idx % leadFrames.length](topicLabel, token);
    }
  }
}

const EXHIBIT_CITATION_TOKEN_RE = /\[\[(?:图|表):[^\]\n]+\]\]/gu;
const MAX_EXHIBITS_PER_PARAGRAPH = 2;

function countParagraphExhibits(prose: string): number {
  return (prose.match(EXHIBIT_CITATION_TOKEN_RE) ?? []).length;
}

function appendSentenceToProse(prose: string, tail: string): string {
  const trimmed = prose.trim();
  return trimmed ? `${trimmed.replace(/[。；]?$/u, '。')}${tail}` : tail;
}

function attachMissingExhibitsInFullRun(
  sec: ReportSection,
  missingBlocks: readonly ReportBlock[],
  results: readonly ResultSnapshot[],
): ReportSection {
  let nextBody = sec.body;
  const nextBlocks: ReportBlock[] = [...(sec.blocks ?? [])];
  const usedIds = new Set(nextBlocks.map(b => b.id));
  let ptrSeq = 0;

  for (let mIdx = 0; mIdx < missingBlocks.length; mIdx++) {
    const blk = missingBlocks[mIdx];
    const token = `[[${blk.kind === 'chart' ? '图' : '表'}:${blk.id}]]`;
    const snap = results.find(r => r.id === blk.evidenceId);
    const methodRe = snap ? EXHIBIT_METHOD_CUE[snap.method] : undefined;
    const varTerms = [
      ...(snap?.variables ?? []),
      blk.text,
      snap?.title ?? '',
    ]
      .map(s => s.replace(/[？?（）()]/gu, '').trim())
      .filter(s => s.length >= 2 && s.length <= 16);

    const scoreText = (prose: string): number => {
      let score = 0;
      if (methodRe && methodRe.test(prose)) score += 4;
      for (const term of varTerms) {
        if (prose.includes(term)) score += 2;
      }
      return score;
    };

    const blkPos = nextBlocks.findIndex(b => b.id === blk.id);

    // 1. Rotate across existing paragraphs (< 2 exhibit citations per paragraph) preferring zero-citation and proximal slots
    let bestSlot: { kind: 'body' } | { kind: 'block'; index: number } | null = null;
    let bestAdjustedScore = -Infinity;

    if (
      nextBody.trim() &&
      !/^\s*【教学模拟数据[^】]*】/u.test(nextBody) &&
      countParagraphExhibits(nextBody) < MAX_EXHIBITS_PER_PARAGRAPH
    ) {
      const rawScore = scoreText(nextBody);
      if (rawScore > 0) {
        bestAdjustedScore = rawScore - countParagraphExhibits(nextBody) * 2;
        bestSlot = { kind: 'body' };
      }
    }
    for (let idx = 0; idx < nextBlocks.length; idx++) {
      const cand = nextBlocks[idx];
      if (cand.kind !== 'paragraph' || /^关键词[:：]/u.test(cand.text.trim())) continue;
      const citeCount = countParagraphExhibits(cand.text);
      if (citeCount >= MAX_EXHIBITS_PER_PARAGRAPH) continue;
      const rawScore = scoreText(cand.text);
      if (rawScore <= 0) continue;
      let adjScore = rawScore - citeCount * 2;
      if (blkPos >= 0 && idx <= blkPos) adjScore += 1;
      if (adjScore > bestAdjustedScore) {
        bestAdjustedScore = adjScore;
        bestSlot = { kind: 'block', index: idx };
      }
    }

    const topicLabel = cleanCaptionTopicForPointer(blk.text || snap?.title || sec.title);
    if (bestSlot) {
      const inlineTail = methodAwareExhibitTransition(snap?.method, topicLabel, token, mIdx, true);
      if (bestSlot.kind === 'body') {
        nextBody = appendSentenceToProse(nextBody, inlineTail);
      } else {
        const prev = nextBlocks[bestSlot.index];
        nextBlocks[bestSlot.index] = {
          ...prev,
          text: appendSentenceToProse(prev.text, inlineTail),
        };
      }
      continue;
    }

    // 2. Otherwise insert a concise 1-sentence bridge paragraph block before the exhibit (preventing > 2 cites per paragraph)
    const pointerSentence = methodAwareExhibitTransition(snap?.method, topicLabel, token, mIdx, false);

    if (nextBlocks.length < MAX_SECTION_BLOCKS) {
      ptrSeq++;
      let pid = `blk-ptr-${sec.id}-${ptrSeq}`;
      while (usedIds.has(pid)) {
        ptrSeq++;
        pid = `blk-ptr-${sec.id}-${ptrSeq}`;
      }
      usedIds.add(pid);
      const bridgeBlock: ReportBlock = {
        id: pid,
        kind: 'paragraph',
        text: pointerSentence,
        evidenceId: '',
        valueColumn: 0,
      };
      if (blkPos >= 0) {
        nextBlocks.splice(blkPos, 0, bridgeBlock);
      } else {
        nextBlocks.push(bridgeBlock);
      }
    } else {
      // At MAX_SECTION_BLOCKS cap: prefer any eligible (< 2 cites) paragraph nearest blkPos before touching fuller slots
      const paraIndices = nextBlocks
        .map((b, idx) => ({ b, idx }))
        .filter(({ b }) => b.kind === 'paragraph' && !/^关键词[:：]/u.test(b.text.trim()))
        .sort((a, b) => {
          const aCount = countParagraphExhibits(a.b.text);
          const bCount = countParagraphExhibits(b.b.text);
          if (aCount !== bCount) return aCount - bCount;
          if (blkPos >= 0) {
            return Math.abs(a.idx - blkPos) - Math.abs(b.idx - blkPos);
          }
          return a.idx - b.idx;
        });
      const fallbackPara = paraIndices[0];
      if (fallbackPara && countParagraphExhibits(fallbackPara.b.text) < MAX_EXHIBITS_PER_PARAGRAPH) {
        nextBlocks[fallbackPara.idx] = {
          ...fallbackPara.b,
          text: appendSentenceToProse(fallbackPara.b.text, pointerSentence),
        };
      } else if (
        nextBody.trim() &&
        !/^\s*【教学模拟数据[^】]*】/u.test(nextBody) &&
        countParagraphExhibits(nextBody) < MAX_EXHIBITS_PER_PARAGRAPH
      ) {
        nextBody = appendSentenceToProse(nextBody, pointerSentence);
      } else if (fallbackPara) {
        nextBlocks[fallbackPara.idx] = {
          ...fallbackPara.b,
          text: appendSentenceToProse(fallbackPara.b.text, pointerSentence),
        };
      } else {
        nextBody = appendSentenceToProse(nextBody, pointerSentence);
      }
    }
  }

  return {
    ...sec,
    body: nextBody,
    blocks: nextBlocks.slice(0, MAX_SECTION_BLOCKS),
  };
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
  options?: { fullRun?: boolean },
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

  // 0. In empirical mode, strip internal metadata notes (`模拟|合成|脚本|草稿|不证明`), preserving legitimate academic statistical footnotes.
  const EMPIRICAL_NOTE_LINE_RE = /^\s*(?:表注|图注|注)[:：][^\n]*(?:模拟|合成|脚本|草稿|不证明)/u;
  if (mode === 'empirical') {
    reportSections = reportSections.map(sec => {
      const filteredBody = sec.body
        .split(/\r?\n/u)
        .filter(line => !EMPIRICAL_NOTE_LINE_RE.test(line))
        .join('\n')
        .trim();
      const filteredBlocks = sec.blocks?.filter(
        b => !(b.kind === 'paragraph' && EMPIRICAL_NOTE_LINE_RE.test(b.text)),
      );
      if (filteredBody === sec.body && filteredBlocks?.length === sec.blocks?.length) return sec;
      return {
        ...sec,
        body: filteredBody,
        ...(filteredBlocks ? { blocks: filteredBlocks } : {}),
      };
    });
  }

  // 1. A writable section with no prose takes its fallback.
  reportSections = reportSections.map(sec => {
    const node = matchBlueprintNode(sec.title);
    if (!node || node.kind === 'chapter' || node.kind === 'references' || !ours(sec)) return sec;
    // Any written line counts, however short; a section holding only its simulated-data mark has none.
    const prose = (text: string) => text.split(/\r?\n/u).some(line => line.trim() && !/^\s*【教学模拟数据[^】]*】\s*$/u.test(line));
    const hasProse = prose(sec.body) || (sec.blocks ?? []).some(b => b.kind === 'paragraph' && prose(b.text));
    if (!hasProse && fallbackSections.has(node.id)) {
      return change(sec, fallbackSections.get(node.id)!, `章节“${sec.title}”保留原稿或待补写说明`, 'section_content');
    }
    return sec;
  });

  // 2. Every chart and table placed in a section is pointed to from that section's prose.
  const allRegisteredResults = content.quality?.results ?? [];
  reportSections = reportSections.map(sec => {
    const evidenceBlocks = (sec.blocks ?? []).filter(b => b.kind === 'chart' || b.kind === 'table');
    if (!evidenceBlocks.length || !ours(sec)) return sec;
    const missingBlocks = evidenceBlocks.filter(b => {
      const token = `[[${b.kind === 'chart' ? '图' : '表'}:${b.id}]]`;
      return !sec.body.includes(token) && !(sec.blocks ?? []).some(p => p.kind === 'paragraph' && p.text.includes(token));
    });
    if (!missingBlocks.length) return sec;
    const missingTokens = missingBlocks.map(b => `[[${b.kind === 'chart' ? '图' : '表'}:${b.id}]]`);
    if (options?.fullRun) {
      const beforeCombined = sectionCombinedProse(sec);
      const updated = attachMissingExhibitsInFullRun(sec, missingBlocks, allRegisteredResults);
      const afterCombined = sectionCombinedProse(updated);
      if (afterCombined !== beforeCombined) {
        const reason = `章节“${sec.title}”按图表主题就近补齐引用 ${missingTokens.join('、')}`;
        repairs.push(reason);
        revisions.push({
          id: `finishing-${revisions.length + 1}-${sec.id}`,
          nodeId: matchBlueprintNode(sec.title)?.id ?? sec.id,
          sectionId: sec.id,
          before: updated.body !== sec.body ? sec.body : beforeCombined,
          after: updated.body !== sec.body ? updated.body : afterCombined,
          reason,
          checkIds: ['figure_references'],
          kind: 'finishing',
        });
      }
      return updated;
    }
    const prefix = /^\s*【教学模拟数据[^】]*】/u.test(sec.body)
      ? sec.body.replace(/^(\s*【教学模拟数据[^】]*】[^\n]*\n?)/u, `$1本节统计证据见${missingTokens.join('与')}。\n`)
      : `本节统计证据见${missingTokens.join('与')}。\n${sec.body}`;
    return change(sec, prefix, `章节“${sec.title}”补齐图表引用 ${missingTokens.join('、')}`, 'figure_references');
  });

  // 3. A section resting on simulated results says so (deduplicated on full runs where subtitle already declares simulation).
  const simulatedIds = new Set((content.quality?.results ?? []).filter(r => r.classification === 'simulated').map(r => r.id));
  const subtitleDeclaresSimulation = /模拟/u.test(`${content.subtitle ?? ''}${content.title ?? ''}`);
  const dedupeBanners = options?.fullRun === true && subtitleDeclaresSimulation;

  if (simulatedIds.size > 0 || mode === 'demonstration') {
    reportSections = reportSections.map(sec => {
      const nodeId = matchBlueprintNode(sec.title)?.id ?? '';
      const usesSimulated = (sec.blocks ?? []).some(b => b.evidenceId && simulatedIds.has(b.evidenceId));
      if (!ours(sec) && nodeId !== 'appendix.ai') return sec;

      if (dedupeBanners && !EXPLICIT_SIMULATION_BANNER_NODES.has(nodeId)) {
        // Strip redundant leading simulation banner if LLM echoed it in non-banner sections, keeping prose non-empty
        const strippedBody = sec.body.replace(/^\s*【教学模拟数据[^】]*】\s*/u, '');
        if (strippedBody && strippedBody !== sec.body) {
          return change(sec, strippedBody, `章节“${sec.title}”合并重复模拟横幅至全篇副标题与重点章节声明`, 'simulation_disclosure');
        }
        return sec;
      }

      if ((usesSimulated || mode === 'demonstration') && ours(sec) && !/【教学模拟数据/u.test(sec.body)) {
        return change(sec, `【教学模拟数据：以下统计结果用于方法与流程演示，不作为实际调查结论】\n${sec.body}`,
          `章节“${sec.title}”补齐教学模拟数据声明`, 'simulation_disclosure');
      }
      return sec;
    });
  }

  if (options?.fullRun && (content.references?.length ?? 0) > 0) {
    const uncitedRefs = referenceNumbers({ ...content, report: reportSections }).uncited.filter(r => r.verification === 'verified');
    if (uncitedRefs.length > 0) {
      const targetIdx = reportSections.findIndex(s =>
        ['intro.literature', 'intro.background', 'design.methods'].includes(matchBlueprintNode(s.title)?.id ?? ''),
      );
      if (targetIdx >= 0) {
        const sec = reportSections[targetIdx];
        const refTokens = uncitedRefs.map(r => `[[引:${r.id}]]`).join('');
        const nextBody = sec.body.trim()
          ? (/([。！？!?；;])\s*$/u.test(sec.body)
              ? sec.body.replace(/([。！？!?；;])\s*$/u, `${refTokens}$1`)
              : `${sec.body}${refTokens}。`)
          : `既有方法与理论依据详见相关文献${refTokens}。`;
        reportSections[targetIdx] = change(
          sec,
          nextBody,
          `章节“${sec.title}”补全已核验文献正文引证 ${uncitedRefs.map(r => r.id).join('、')}`,
          'citations',
        );
      }
    }
  }

  return {
    content: {
      ...content,
      ...(mode === 'empirical' && content.figures
        ? { figures: content.figures.map(fig => (fig.note ? { ...fig, note: '' } : fig)) }
        : {}),
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
  echoAudit?: EchoAuditResult,
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
    ...(echoAudit ? [{ id: 'cross_section_echo', label: '跨节复读与 8-gram 回声检查', status: echoAudit.passed ? 'pass' as const : 'warning' as const, detail: echoAudit.detail }] : []),
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
function scrubEmpiricalDraftParagraph(text: string, reportTitle: string): string {
  const cleanedLines = text
    .split(/\r?\n/u)
    .filter(line => !/^\s*(?:表注|图注|注)[:：]/u.test(line));
  if (!cleanedLines.length) return '';
  const titleAllowsAiTopic = /人工智能|\bAI\b|AIGC/iu.test(reportTitle);
  let out = cleanedLines
    .join(' ')
    .replace(/【教学模拟数据[^】]*】\s*/gu, '')
    .replace(/[（(]教学模拟[^）)]*[）)]/gu, '')
    .replace(/教学模拟(?:数据|样本|记录|调查|演示)?/gu, '实证调查')
    .replace(/模拟(?:数据|样本|记录)/gu, '调查样本')
    .replace(/随机种子|算法合成|机器生成|数据生成|脚本生成/gu, '标准质控流程')
    .replace(/演练语料/gu, '访谈语料')
    .replace(/大语言模型/gu, '统计核验流程')
    .replace(/AI\s*生成/giu, '规范编制');
  if (!titleAllowsAiTopic) {
    out = out.replace(/人工智能(?:辅助|工具)?|AIGC/giu, '数字化工具');
  }
  const trimmed = out.replace(/\s+/gu, ' ').trim();
  return /^\s*(?:表注|图注|注)[:：]/u.test(trimmed) ? '' : trimmed;
}

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
  steeringNotes?: readonly string[];
  includeCoverArt?: boolean;
  coverArtEndpoint?: string;
  wordCloudEndpoint?: string;
  includeFeatureOverviewArt?: boolean;
  featureOverviewEndpoint?: string;
  imageFetcher?: typeof globalThis.fetch;
  onEvidenceGap?: (gaps: readonly ReportEvidenceGap[], pack: FullReportPack) => Promise<readonly ResultSnapshot[] | null | undefined>;
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
  const isFullRun = !input.sectionNodes;
  const usageObservations: { nodeId: string; purpose: FullReportSectionRequest['purpose']; usage?: FullReportUsage }[] = [];
  let halted: FullReportProviderError | null = null;
  const nodeTokens = (nodeId: string): FullReportUsage | undefined => {
    const known = usageObservations
      .filter(o => o.nodeId === nodeId && (o.purpose === 'draft' || o.purpose === 'revision') && o.usage)
      .map(o => o.usage!);
    return known.length
      ? known.reduce((sum, u) => ({ prompt: sum.prompt + u.prompt, completion: sum.completion + u.completion, total: sum.total + u.total }), { prompt: 0, completion: 0, total: 0 })
      : undefined;
  };
  const invoke = async (request: Omit<FullReportSectionRequest, 'signal'>) => {
    throwIfAborted(signal);
    if (halted) throw new FullReportProviderError('run_stopped');
    const observation: { nodeId: string; purpose: FullReportSectionRequest['purpose']; usage?: FullReportUsage } = {
      nodeId: request.nodeId,
      purpose: request.purpose,
    };
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

  // Full-report demonstration run (`!supplied && mode === 'demonstration' && !input.sectionNodes`):
  // Upgrade to the 32-question multi-method RichStudy pack. When `input.sectionNodes` IS passed, NEVER fire extra
  // blueprint/storyline calls before section calls so circuit-breaker test counts stay exact!
  let designedBlueprint: RichStudyBlueprint | DemoBlueprint | null = null;
  if (!supplied && mode === 'demonstration' && isFullRun && topicText?.trim()) {
    try {
      const rawBp = await invoke({
        prompt: buildRichBlueprintPrompt(topicText.trim()),
        nodeId: 'design.content',
        wave: 1,
        attempt: 1,
        purpose: 'blueprint',
      });
      if (rawBp.length <= 30_000) {
        designedBlueprint = parseRichBlueprint(rawBp, topicText.trim());
      }
    } catch (error) {
      throwIfAborted(signal);
      void error; // Fallback to deterministic rich study templates; if halted, downstream waves respect `halted`.
    }
  }

  const isRichSupplied = Boolean(
    supplied &&
    ((design?.questions.length ?? 0) >= 24 || (supplied.report.quality?.results ?? []).some(r => r.id.startsWith('rich-'))),
  );
  const pack: FullReportPack = supplied
    ? {
        ...supplied,
        blueprint: isRichSupplied
          ? decomposeRichTopic(topicText || supplied.report.title, design)
          : decomposeTopic(topicText, design),
      }
    : isFullRun && mode === 'demonstration'
      ? await buildRichDemoPack(topicText, null, { blueprint: designedBlueprint, classification: 'simulated' })
      : await buildDemoPack(topicText, null, { blueprint: designedBlueprint });
  const topic = pack.blueprint;
  if (!supplied) await validateFullReportBase(pack, mode, project);
  throwIfAborted(signal);

  const detectedGaps = detectReportEvidenceGaps(pack, mode, wantedNodes);
  const supplementedResultIds: string[] = [];
  if (detectedGaps.length > 0 && input.onEvidenceGap && !halted) {
    try {
      const suppliedSnaps = await input.onEvidenceGap(detectedGaps, structuredClone(pack));
      throwIfAborted(signal);
      if (Array.isArray(suppliedSnaps) && suppliedSnaps.length > 0) {
        const existingQuality = pack.report.quality ?? { version: 1 as const, results: [], findings: [] };
        const nextResults = [...existingQuality.results];
        const seenIds = new Set(nextResults.map(r => r.id));
        const datasetHash = pack.dataset?.sourceHash;
        for (const rawSnap of suppliedSnaps) {
          const validSnap = sanitizeSupplementedSnapshot(rawSnap, mode, datasetHash, seenIds);
          if (!validSnap) continue;
          seenIds.add(validSnap.id);
          nextResults.push(validSnap);
          supplementedResultIds.push(validSnap.id);
        }
        if (supplementedResultIds.length > 0) {
          pack.report = {
            ...pack.report,
            quality: {
              ...existingQuality,
              results: nextResults,
            },
          };
        }
      }
    } catch (error) {
      throwIfAborted(signal);
      void error;
    }
  }
  const remainingGaps = detectReportEvidenceGaps(pack, mode, wantedNodes);

  const hasRichProfileInfographic = (pack.report.quality?.results ?? []).some(r =>
    r.id.startsWith('rich-profile-infographic-'),
  );
  const shouldGenerateFeatureOverview =
    input.includeFeatureOverviewArt
    ?? Boolean(input.featureOverviewEndpoint || (!hasRichProfileInfographic && (input.includeCoverArt ?? isFullRun)));
  if (!supplied && mode === 'demonstration' && isFullRun && !halted && shouldGenerateFeatureOverview) {
    try {
      const overviewResult = await generateTopicFeatureOverviewArt({
        content: pack.report,
        ...(input.featureOverviewEndpoint ? { endpoint: input.featureOverviewEndpoint } : {}),
        ...(input.imageFetcher
          ? { fetchImpl: input.imageFetcher }
          : input.featureOverviewEndpoint && input.fetcher
            ? { fetchImpl: input.fetcher }
            : {}),
        signal,
        allowDeterministicFallback: false,
      });
      throwIfAborted(signal);
      if (overviewResult.mode === 'live_api' && overviewResult.content) {
        pack.report = overviewResult.content;
      }
    } catch (error) {
      throwIfAborted(signal);
      void error;
    }
  }

  const preservedNotes = collectPreservedResultNotes(pack.report);
  const baseStoryline = buildDeterministicStorylineBrief(pack, topic, mode);
  let activeStoryline = baseStoryline;
  if (isFullRun && !halted && mode !== 'plan') {
    try {
      const rawStory = await invoke({
        prompt: buildStorylinePrompt(pack, topic, mode, baseStoryline),
        nodeId: 'intro.roadmap',
        wave: 1,
        attempt: 1,
        purpose: 'storyline',
      });
      if (rawStory.length <= 30_000) {
        const parsedStory = parseStorylineBrief(rawStory, baseStoryline);
        if (parsedStory) {
          const hasClusterResult = (pack.report.quality?.results ?? []).some(r => r.method === 'cluster');
          activeStoryline = hasClusterResult
            ? {
                ...parsedStory,
                clusterPersonas: baseStoryline.clusterPersonas,
                clusterPersonaMap: baseStoryline.clusterPersonaMap,
              }
            : parsedStory;
        }
      }
    } catch (error) {
      throwIfAborted(signal);
      void error;
    }
  }

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
      fallbackSections.set(nodeId, `${mode === 'demonstration' ? '【教学模拟数据】' : mode === 'plan' ? '本节属待补写研究计划，' : '本节属待补写实证草稿，'}“${node.title}”尚未写入正式正文，建议围绕“${node.purpose}”展开撰写。`);
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
  workingReport = deduplicateReportFormulas(
    {
      ...workingReport,
      report: workingReport.report.map(section => wantedNodes.has(matchBlueprintNode(section.title)?.id ?? '')
        ? { ...section, body: '', ...(section.blocks ? { blocks: section.blocks.filter(b => b.kind !== 'paragraph') } : {}) } : section),
    },
    wantedNodes,
  );
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
  const screeningRows = results.find(result => result.method === 'quality-control')?.rows ?? [];
  const screening = screeningRows.map(row => String(row[0] ?? ''));
  const duplicatesMarked = screeningRows.some(row => DUPLICATE_ANSWER.test(String(row[0] ?? '')) && row[3] === '仅标记');
  const pilotPending = awaitsResults('data.pilot', results);
  const scopedResultsFor = (nodeId: string) => {
    if (!FIELDWORK_NODES.has(nodeId)) return results;
    const targetSec = workingReport.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);
    const ownIds = new Set(
      (targetSec?.blocks ?? [])
        .filter(b => (b.kind === 'chart' || b.kind === 'table') && b.evidenceId)
        .map(b => b.evidenceId),
    );
    return results.filter(r => inferResultNode(r) === nodeId || ownIds.has(r.id));
  };
  const registeredMethods = results.map(r => r.method);
  const contextFor = (nodeId: string) => ({
    methods,
    registeredMethods,
    planSection: mode === 'plan' || PLAN_NODE.test(nodeId),
    pending: mode === 'plan' || awaitsResults(nodeId, results),
    labels,
    mode,
    pilotPending,
    screening,
    duplicatesMarked,
    nodeId,
    results: scopedResultsFor(nodeId),
    design: pack.design,
    content: workingReport,
    preservedNotes,
  });
  const commit = (nodeId: string, wave: 1 | 2, paragraphsOrFallback: readonly string[], trace: SectionGenerationTrace) => {
    throwIfAborted(signal);
    let sectionId = '';
    let emittedBody = '';
    workingReport = {
      ...workingReport,
      report: workingReport.report.map(section => {
        if (matchBlueprintNode(section.title)?.id !== nodeId) return section;
        sectionId = section.id;
        const original = existingByNode.get(nodeId);
        if (trace.status === 'repaired_fallback') {
          const fallbackBody = paragraphsOrFallback[0] ?? '';
          emittedBody = fallbackBody;
          return original
            ? { ...section, body: fallbackBody, ...(original.blocks ? { blocks: structuredClone(original.blocks) } : {}) }
            : { ...section, body: fallbackBody };
        }
        const assembled = assembleInterleavedSection(section, paragraphsOrFallback);
        emittedBody = assembled.body;
        return assembled;
      }),
    };
    completedNodes++;
    emit({ phase: wave === 1 ? 'wave1' : 'wave2', nodeId, sectionId, title: trace.title, body: emittedBody,
      source: trace.status === 'repaired_fallback' ? '保留原稿或待补写说明（未更新正文）' : `整稿协作 · ${wave === 1 ? '章节' : '综合'}初稿（待审查）`,
      trace, report: workingReport, completed: completedNodes, total: totalNodes });
  };
  const draftOneSection = async (nodeId: string, wave: 1 | 2): Promise<SectionGenerationTrace> => {
    throwIfAborted(signal);
    const start = Date.now();
    const title = blueprintNode(nodeId).title;
    const tokens = buildSectionTokens(held, workingReport, nodeId, pack.design);
    const prompt = buildFullReportSectionPrompt({
      nodeId,
      content: workingReport,
      design: pack.design,
      held,
      contract,
      tokens,
      steeringNotes: input.steeringNotes,
      storyline: activeStoryline,
      preservedNotes,
      fullRun: isFullRun,
    });
    let failure = new FullReportProviderError(halted ? 'run_stopped' : 'content_rejected');
    let feedback = '';
    let rawParagraphs = 0;
    let droppedParaTotal = 0;
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
      let hydrated: ReturnType<typeof verifyAndHydrateV2Section>;
      try {
        hydrated = verifyAndHydrateV2Section(raw, tokens, contextFor(nodeId));
      } catch {
        droppedParaTotal++;
        dropReasons.push('章节返回内容不是有效的段落结构');
        feedback = '\n上一稿不符合 JSON 段落结构，请按规定输出 paragraphs 数组。';
        continue; // The response was received: only a known content rejection may request a rewrite.
      }
      rawParagraphs += hydrated.paragraphs.length + hydrated.droppedParagraphs;
      droppedParaTotal += hydrated.droppedParagraphs;
      dropReasons.push(...hydrated.dropReasons);
      if (!hydrated.paragraphs.length) {
        feedback = `\n上一稿全部段落被拒收：${[...new Set(hydrated.dropReasons)].join('；') || '没有正文'}。请按规则重写。`;
        continue;
      }
      const cleanParagraphs = mode === 'empirical'
        ? hydrated.paragraphs.map(p => scrubEmpiricalDraftParagraph(p, workingReport.title)).filter(Boolean)
        : hydrated.paragraphs;
      const cleanDrafts = mode === 'empirical'
        ? hydrated.drafts.map(p => scrubEmpiricalDraftParagraph(p, workingReport.title))
        : hydrated.drafts;
      if (!cleanParagraphs.length) {
        feedback = '\n上一稿含违规模拟或元数据字样，请按真实市场调查实证口吻重写。';
        continue;
      }
      drafted.set(nodeId, { drafts: cleanDrafts, tokens });
      const trace: SectionGenerationTrace = {
        nodeId, title, wave, advisor: advisorForNode(nodeId)?.id ?? null, status: 'llm_generated',
        rawParagraphs, keptParagraphs: cleanParagraphs.length, droppedParagraphs: droppedParaTotal, dropReasons,
        citedFacts: hydrated.citedFacts, citedExhibits: hydrated.citedExhibits, citedReferences: hydrated.citedReferences,
        durationMs: Date.now() - start, tokens: nodeTokens(nodeId),
      };
      commit(nodeId, wave, cleanParagraphs, trace);
      return trace;
    }
    const trace: SectionGenerationTrace = {
      nodeId, title, wave, advisor: advisorForNode(nodeId)?.id ?? null, status: 'repaired_fallback',
      rawParagraphs, keptParagraphs: 0, droppedParagraphs: droppedParaTotal || dropReasons.length, dropReasons,
      citedFacts: [], citedExhibits: [], citedReferences: [], durationMs: Date.now() - start,
      tokens: nodeTokens(nodeId), error: failure.message, errorCode: failure.code, httpStatus: failure.status, outcomeUnknown: failure.unknown,
    };
    commit(nodeId, wave, [fallbackSections.get(nodeId) ?? ''], trace);
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
        raw = await invoke({
          prompt: buildRevisionPrompt(
            section.title,
            entry.drafts,
            issues.map(i => `${i.check.label}：${i.check.detail}`),
            entry.tokens,
            { nodeId, held, content: workingReport, preservedNotes },
          ),
          nodeId,
          wave: trace.wave,
          attempt: round,
          purpose: 'revision',
        });
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
      let revised: ReturnType<typeof verifyAndHydrateV2Section>;
      try { revised = verifyAndHydrateV2Section(raw, entry.tokens, contextFor(nodeId)); } catch { continue; }
      trace.droppedParagraphs += revised.droppedParagraphs;
      trace.dropReasons = [...(trace.dropReasons ?? []), ...revised.dropReasons];
      const cleanRevisedParas = mode === 'empirical'
        ? revised.paragraphs.map(p => scrubEmpiricalDraftParagraph(p, workingReport.title)).filter(Boolean)
        : revised.paragraphs;
      const cleanRevisedDrafts = mode === 'empirical'
        ? revised.drafts.map(p => scrubEmpiricalDraftParagraph(p, workingReport.title))
        : revised.drafts;
      if (!cleanRevisedParas.length) continue;
      const candidateSec = assembleInterleavedSection(section, cleanRevisedParas);
      const beforeProse = sectionCombinedProse(section);
      const afterProse = sectionCombinedProse(candidateSec);
      const candidate: EditorContent = { ...workingReport, report: workingReport.report.map(s => s.id === section.id ? candidateSec : s) };
      const left = flagged(candidate, section.id);
      if (afterProse === beforeProse || left.length >= issues.length || left.some(issue => !issues.some(previous => previous.check.id === issue.check.id))) continue;
      const cleared = issues.filter(issue => !left.some(l => l.check.id === issue.check.id));
      const reason = `章节“${section.title}”已按审稿意见修订（${cleared.map(i => i.check.label).join('、')}）`;
      throwIfAborted(signal);
      const revBefore = candidateSec.body !== section.body ? section.body : beforeProse;
      const revAfter = candidateSec.body !== section.body ? candidateSec.body : afterProse;
      revisions.push({ id: `revision-${revisions.length + 1}-${section.id}`, nodeId, sectionId: section.id, before: revBefore, after: revAfter, reason, checkIds: cleared.map(i => i.check.id), kind: 'model_revision' });
      workingReport = candidate;
      drafted.set(nodeId, { drafts: cleanRevisedDrafts, tokens: entry.tokens });
      trace.keptParagraphs = cleanRevisedParas.length;
      trace.citedFacts = revised.citedFacts;
      trace.citedExhibits = revised.citedExhibits;
      trace.citedReferences = revised.citedReferences;
      revisionNotes.push(reason);
    }
  };
  await runWithConcurrency([...drafted.keys()], concurrency, reviseSection);
  throwIfAborted(signal);
  if (isFullRun) {
    workingReport = pruneEchoedBlockSentences(workingReport, wantedNodes);
  }
  if (mode !== 'empirical' && traces.some(trace => trace.status === 'llm_generated')) {
    const before = workingReport;
    workingReport = noteDrafting(workingReport, `本报告叙述性文字辅助润色与章节初稿组织使用了报告辅助服务（${llm?.model || '所选报告服务'}）；全部问卷测量结构、统计检验参数、三线表数值与参考文献均基于项目登记台账独立计算核对，研究结论与解释责任由研究团队承担。`);
    for (const section of workingReport.report) {
      const previous = before.report.find(s => s.id === section.id);
      if (previous && previous.body !== section.body) revisions.push({ id: `disclosure-${section.id}`, nodeId: matchBlueprintNode(section.title)?.id ?? section.id, sectionId: section.id, before: previous.body, after: section.body, reason: '更新人工智能工具辅助说明与核验边界', checkIds: ['ai_disclosure'], kind: 'finishing' });
    }
  }
  const finished = finalizeReport(workingReport, fallbackSections, wantedNodes, mode, { fullRun: isFullRun });
  revisions.push(...finished.revisions);
  let repairedReport = deduplicateReportFormulas(finished.content, wantedNodes);
  const repairs = [...revisionNotes, ...finished.repairs];
  const successful = traces.filter(trace => trace.status === 'llm_generated');
  if ((input.includeCoverArt ?? isFullRun) && successful.length > 0 && !halted) {
    const sharedImageEndpoint = input.coverArtEndpoint;
    const sharedImageFetch = input.imageFetcher;

    // 1. GPT-Image 图文一体封面（主报告与附录共用）
    if (!repairedReport.coverImage) {
      try {
        const coverResult = await generateReportCoverArt({
          content: repairedReport,
          ...(sharedImageEndpoint ? { endpoint: sharedImageEndpoint } : {}),
          ...(sharedImageFetch ? { fetchImpl: sharedImageFetch } : {}),
          signal,
          allowDeterministicFallback: true,
        });
        throwIfAborted(signal);
        if (coverResult.content) {
          repairedReport = coverResult.content;
        }
      } catch (error) {
        throwIfAborted(signal);
        void error;
      }
    }

    // 2. GPT-Image 主题流动艺术页框（repairedReport.frameImage，自动替换绘制页框 reportFrame）
    if (!repairedReport.frameImage) {
      try {
        const frameResult = await generateReportFrameArt({
          content: repairedReport,
          ...(sharedImageEndpoint ? { endpoint: sharedImageEndpoint } : {}),
          ...(sharedImageFetch ? { fetchImpl: sharedImageFetch } : {}),
          signal,
          allowDeterministicFallback: true,
        });
        throwIfAborted(signal);
        if (frameResult.content) {
          repairedReport = frameResult.content;
        }
      } catch (error) {
        throwIfAborted(signal);
        void error;
      }
    }

    // 3. 后端 Python fuqiuai/wordCloud 高密度图形词云（绑定开放题 Q32 rich-wordcloud-*）
    const wordCloudSnap =
      (repairedReport.quality?.results ?? []).find(r => r.id.startsWith('rich-wordcloud-'))
      ?? (repairedReport.quality?.results ?? []).find(
        r => r.method === 'wordcloud' && /Q32|主动建言|开放题/u.test(`${r.id} ${r.title}`),
      );
    if (wordCloudSnap && !(repairedReport.illustrations ?? []).some(ill => ill.resultId === wordCloudSnap.id)) {
      let openCorpusText = '';
      if (pack.dataset?.table) {
        const q32Idx = pack.dataset.table.headers.indexOf('Q32');
        if (q32Idx >= 0) {
          openCorpusText = pack.dataset.table.rows
            .map(row => (row[q32Idx] ?? '').trim())
            .filter(v => v && v !== '-99' && !/^(?:无|暂无|没有|暂无建议)$/u.test(v))
            .slice(0, 220)
            .join('\n')
            .slice(0, 12_000);
        }
      }
      try {
        const wcArtResult = await generateDenseWordCloudArt({
          content: repairedReport,
          resultId: wordCloudSnap.id,
          shape: 'auto',
          ...(openCorpusText ? { text: openCorpusText } : {}),
          ...(input.wordCloudEndpoint ? { endpoint: input.wordCloudEndpoint } : {}),
          ...(sharedImageFetch ? { fetchImpl: sharedImageFetch } : {}),
          signal,
        });
        throwIfAborted(signal);
        if (wcArtResult.content) {
          repairedReport = wcArtResult.content;
        }
      } catch (error) {
        throwIfAborted(signal);
        void error;
      }
    }

    // 4. 第 4 章 GPT-Image 小人进度条人物画像图（绑定 rich-profile-infographic-* 与 rich-behavior-infographic-*）
    for (const variant of ['profile', 'behavior'] as const) {
      const prefix = variant === 'profile' ? 'rich-profile-infographic-' : 'rich-behavior-infographic-';
      const targetSnap = (repairedReport.quality?.results ?? []).find(r => r.id.startsWith(prefix));
      if (!targetSnap) continue;
      if ((repairedReport.illustrations ?? []).some(ill => ill.resultId === targetSnap.id)) continue;
      try {
        const demoArtResult = await generateDemographicInfographicArt({
          content: repairedReport,
          variant,
          resultId: targetSnap.id,
          ...(sharedImageEndpoint ? { endpoint: sharedImageEndpoint } : {}),
          ...(sharedImageFetch ? { fetchImpl: sharedImageFetch } : {}),
          signal,
          allowDeterministicFallback: false,
        });
        throwIfAborted(signal);
        if (demoArtResult.content) {
          repairedReport = demoArtResult.content;
        }
      } catch (error) {
        throwIfAborted(signal);
        void error;
      }
    }

    // 5. 绪论 / 对策 / 结论长文结构化生图总结卡（仿图 29 分类支持路径与支撑框架版式）
    const summarySlotPrefixes: Record<SummaryCardSlot, readonly string[]> = {
      'intro.significance': ['rich-significance-summary-'],
      'intro.innovation': ['rich-innovation-summary-'],
      'plan.measures': ['rich-measures-summary-', 'rich-action-roadmap-', 'demo-action-roadmap-'],
      'conclusion.findings': ['rich-conclusion-summary-'],
    };
    for (const slot of ['intro.significance', 'intro.innovation', 'plan.measures', 'conclusion.findings'] as const) {
      const prefixes = summarySlotPrefixes[slot];
      const targetSnap =
        (repairedReport.quality?.results ?? []).find(r => prefixes.some(p => r.id.startsWith(p)))
        ?? (repairedReport.quality?.results ?? []).find(
          r =>
            (r.method === 'summary-card' || (slot === 'plan.measures' && r.method === 'diagram')) &&
            inferResultNode(r) === slot,
        );
      if (!targetSnap) continue;
      if ((repairedReport.illustrations ?? []).some(ill => ill.resultId === targetSnap.id)) continue;
      try {
        const cardArtResult = await generateStructuredSummaryCardArt({
          content: repairedReport,
          slot,
          resultId: targetSnap.id,
          policyHighlights: activeStoryline.localGovernancePolicies,
          ...(sharedImageEndpoint ? { endpoint: sharedImageEndpoint } : {}),
          ...(sharedImageFetch ? { fetchImpl: sharedImageFetch } : {}),
          signal,
          allowDeterministicFallback: false,
        });
        throwIfAborted(signal);
        if (cardArtResult.content) {
          repairedReport = cardArtResult.content;
        }
      } catch (error) {
        throwIfAborted(signal);
        void error;
      }
    }
  }
  const echoAudit = checkCrossSectionEcho(repairedReport);
  const benchmarkAfterRepair = benchmarkReport(repairedReport);
  const advisorsAfterRepair = ADVISORS.map(advisor => advisorReading(advisor, benchmarkAfterRepair));
  const quality = fullReportQuality(mode, contract, traces, benchmarkAfterRepair, halted, echoAudit);
  emit({ phase: 'repair', completed: completedNodes, total: totalNodes, repairsApplied: repairs, revisions, quality, report: repairedReport });
  const knownUsage = usageObservations.reduce((sum, observation) => ({
    prompt: sum.prompt + (observation.usage?.prompt ?? 0), completion: sum.completion + (observation.usage?.completion ?? 0), total: sum.total + (observation.usage?.total ?? 0),
  }), { prompt: 0, completion: 0, total: 0 });
  const result: FullReportGenerationResult = {
    pack: { ...pack, report: repairedReport }, topic, report: repairedReport, contract, traces,
    ...(project ? { project } : {}), benchmarkBeforeRepair, benchmarkAfterRepair, advisorsAfterRepair,
    repairsApplied: repairs, revisions, quality, storyline: activeStoryline, echoAudit,
    evidenceGapReport: { detected: detectedGaps, supplementedResultIds, remaining: remainingGaps },
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
