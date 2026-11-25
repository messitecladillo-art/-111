'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { flushSync } from 'react-dom';
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useIlluminationPulse, useKeyedListMotion, useStageDirection } from './useEvixMotion';
import BrandMark from '@/components/brand/BrandMark';
import AnatomyPrismMark from '@/components/figures/report-workstation/AnatomyPrismMark';
import type { WorkKind } from '@/components/figures/report-workstation/ReportWorkstation';
import { useWorkbenchModules } from '@/components/EviXPlatform';
import { WorkbenchNavProvider, type WorkbenchNav, type WorkbenchPanel } from '@/components/workbench/nav-context';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { errorMessage, HostedApiError } from '@/components/hosted/api-client';
import { CHAT_ERRORS, HISTORY_LIMIT, MAX_STEPS, TEXT_LIMIT, chatContext, chatHistory, isDefiniteChatRejection, isResultTool, replyLines, spanText, thousands, turnText, type ChatAction, type ChatLine, type ChatReceipt, type ChatRequest, type ToolResult, usageText, type TokenUsage } from '@/lib/agent/chat';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { ThemeProvider, saveTheme, switchTheme, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { percent } from '@/lib/agent/glyphs';
import { illuminate, roomLight } from '@/lib/agent/illumination';
import { traceExhibits } from '@/lib/agent/provenance';
import { resultPlaced, suggestedNode } from '@/lib/report-placement';
import { blueprintNode } from '@/lib/report-blueprint';
import { SYNTHESIS_NODES, draftFacts, draftLine, draftRequest, draftText, reportOutline, sectionText, type DraftReceipt, type Fact } from '@/lib/agent/draft';
import { reportPlan } from '@/lib/agent/report-plan';
import { readDraft, sendDraft } from './draft-client';
import { ROOM_GROUPS, ROOMS, roomById, type RoomGroup, type RoomId } from '@/lib/agent/rooms';
import { CHART_KIND_LABEL_ZH, lookupTurn, parseDirectChatToolIntent, route, standingFindings, toolTurn, type AgentAction, type AgentCard, type AgentLink, type AgentTurn, type Line, type Mark, type ResultsView, type Span } from '@/lib/agent/router';
import { AGENT_HANDOFF_KEY, parseHandoffPayload } from '@/lib/agent/dock';
import { readChatTurn, sendChatTurn } from './chat-client';
import type { RecordThread } from '@/lib/agent/transcript-export';
import Composer from './Composer';
import ArtifactShelf, { ArtifactShelfLauncher } from './ArtifactShelf';
import { useArtifactLibrary } from './useArtifactLibrary';
import { artifactScope, sectionRevisionArtifact } from '@/lib/agent/artifact-library';
import { useSectionRevision } from './useSectionRevision';
import { applySectionRevision, revisionProse } from '@/lib/agent/section-revision';
import { reportWorkState, sameReportRunScope, type ReportRunScope, type ReportWorkState } from '@/lib/agent/report-work';
import { GenerationProvider, useGeneration } from './generation';
import { LightBar } from './Glyphs';
import { EvixIcon, Icon, ROOM_EVIX_ICON } from './icons';
import { useHired, useShowCode, useStage } from './code-view';
import { ADVISORS, advisorReading } from '@/lib/agent/advisors';
import type { DocFormatMode, PaperAnnotation, PaperSelectionAction } from '@/components/editors/ReportPaper';
import type { LiveWritingStatus, LocalBrainSectionRevision } from './ReportWorkspace';
import { useLiveReportChoreography } from './useLiveReportChoreography';
import { matchBlueprintNode } from '@/lib/report-blueprint';
import type { InsertItem } from '@/lib/report-insert';
import { emptyReference, type ReferenceEntry } from '@/lib/references';
import { captionText } from '@/lib/report-templates';
import { benchmarkReport } from '@/lib/report-benchmark';
import { createEditorContent, type EditorContent } from '@/lib/editor-model';
import { newQuestion, newQuestionnaire, type AnalysisPlan, type DesignQuestion, type Questionnaire, type QuestionType } from '@/lib/questionnaire';
import { METHOD_LABELS } from '@/lib/report-placement';
import type { ResultSnapshot } from '@/lib/research-quality';
import Sidebar from './Sidebar';
import type { WritingModelStatus } from './StudioCards';
import type { StudioTabId } from './studios/StudioPanel';
import Transcript from './Transcript';
import { stamp, threads, type Message, type ModelCall, type ToolExecution } from './threads';
import { fetchBrainStatus, sendBrainTurn, type BrainPresetId, type BrainStatus, type BrainStepTrace, type CustomBrainOverride } from '@/lib/agent/brain-client';
import type { AgentToolSpec } from '@/lib/agent/tools-schema';
import type { Service } from '@evix/shared';
import { eligibleModelServices, getStageModelPreferences, getServerStageModelPreferences, matchesModelConsent, resolveStageModelRoute, setDefaultModelPreference, setStageModelPreference, subscribeModelPreferences, type ModelConsentBinding, type ModelTask } from '@/lib/agent/model-routing';
import { MODEL_CALL_IDS, RESEARCH_STAGES, type ModelCallId, type ResearchStageId } from '@/lib/agent/research-stages';
import { RESEARCH_OVERVIEW_HASH, agentPanelFromHash, defaultResearchStage, researchStageFromHash, researchStageHash } from '@/lib/agent/research-navigation';
import ResearchRouteBar from './ResearchRouteBar';
import type { JourneyModelRoute } from './ResearchJourney';
import type {
  AutonomousRunView,
  StatSandboxPresetId,
  runProjectStatSandbox,
  serializeDatasetForAutonomousSandbox,
} from '@/lib/agent/autonomous-agent';

type AutonomousAgentModule = typeof import('@/lib/agent/autonomous-agent');
let autonomousAgentPromise: Promise<AutonomousAgentModule> | null = null;
function loadAutonomousAgent(): Promise<AutonomousAgentModule> {
  if (!autonomousAgentPromise) {
    autonomousAgentPromise = import('@/lib/agent/autonomous-agent').catch(err => {
      autonomousAgentPromise = null;
      throw err;
    });
  }
  return autonomousAgentPromise;
}

/**
 * A sentence's later steps: what the tools found, which ran already, the service the user agreed to, and `after`, the
 * reply they follow, which ties them to the conversation the sentence was asked in.
 */
type Chain = { step: number; results: ToolResult[]; seen: Set<string>; service: Service; after: string; owner: string; epoch: number };
import styles from './AgentShell.module.css';
import type { FullReportGenerationResult, FullReportPack, ProjectResearchMode } from '@/lib/agent/full-report-pipeline';
import type { DemoBlueprint, DemoDimension } from '@/lib/agent/demo-study';
import { buildSiliconTheaterCardData, inferSiliconTemplate, type SiliconTemplateKey } from '@/lib/agent/studios';
import type { AtypicaFlowBlueprint } from '@/lib/silicon/live-flow';
import type { DatasetHandoff } from '@/components/silicon/ResultsBoard';

import { canAcceptReportCandidate, hasUserResearchSource, mergeReportCandidate, reportChanges, reportSourceKey, type ReportRunSource } from '@/lib/agent/report-run';
import { canPublishStudioResult, sameWorkspaceIdentity, type StudioPublicationIdentity, type WorkspaceIdentity } from '@/lib/agent/integration-safety';
import type { PaperSectionDiff } from '@/lib/agent/paper-diff';
import { fullReportInputRevision } from '@/lib/agent/full-report-request';
import type { ReportStreamEvent } from './full-report-client';

const UNRECORDED_SERVICE = '未记录的服务';
const DEFAULT_AGENT_TOOLS_COUNT = 19;
const EMPTY_PAPER_SECTION_DIFFS: PaperSectionDiff[] = [];
const ABOUT_FIGURE_RE = /图|配色|颜色|色系|小数|数值|标签|网格|格线|边框|字号|字体/u;

type TranscriptExportModule = typeof import('@/lib/agent/transcript-export');
let transcriptExportPromise: Promise<TranscriptExportModule> | null = null;
function loadTranscriptExport(): Promise<TranscriptExportModule> {
  if (!transcriptExportPromise) {
    transcriptExportPromise = import('@/lib/agent/transcript-export').catch(err => {
      transcriptExportPromise = null;
      throw err;
    });
  }
  return transcriptExportPromise;
}

type ReportAppendicesModule = typeof import('@/lib/report-appendices');
let reportAppendicesPromise: Promise<ReportAppendicesModule> | null = null;
function loadReportAppendices(): Promise<ReportAppendicesModule> {
  if (!reportAppendicesPromise) {
    reportAppendicesPromise = import('@/lib/report-appendices').catch(err => {
      reportAppendicesPromise = null;
      throw err;
    });
  }
  return reportAppendicesPromise;
}

type PaperDiffModule = typeof import('@/lib/agent/paper-diff');
let loadedPaperDiffMod: PaperDiffModule | null = null;
let paperDiffPromise: Promise<PaperDiffModule> | null = null;
function loadPaperDiff(): Promise<PaperDiffModule> {
  if (loadedPaperDiffMod) return Promise.resolve(loadedPaperDiffMod);
  if (!paperDiffPromise) {
    paperDiffPromise = import('@/lib/agent/paper-diff')
      .then(mod => {
        loadedPaperDiffMod = mod;
        return mod;
      })
      .catch(err => {
        paperDiffPromise = null;
        throw err;
      });
  }
  return paperDiffPromise;
}

type FigureTweakModule = typeof import('@/lib/agent/figure-tweak');
let loadedFigureTweakMod: FigureTweakModule | null = null;
let figureTweakPromise: Promise<FigureTweakModule> | null = null;
function loadFigureTweak(): Promise<FigureTweakModule> {
  if (loadedFigureTweakMod) return Promise.resolve(loadedFigureTweakMod);
  if (!figureTweakPromise) {
    figureTweakPromise = import('@/lib/agent/figure-tweak')
      .then(mod => {
        loadedFigureTweakMod = mod;
        return mod;
      })
      .catch(err => {
        figureTweakPromise = null;
        throw err;
      });
  }
  return figureTweakPromise;
}

function findReportFigure(content: EditorContent, result: ResultSnapshot) {
  const figures = (content.figures ?? []).filter(
    f => f.resultId === result.id && f.resultHash === result.resultHash && f.kind !== 'table',
  );
  const used = new Set(content.report.flatMap(s => s.blocks ?? []).flatMap(b => (b.figureId ? [b.figureId] : [])));
  return figures.find(f => used.has(f.id)) ?? figures[0] ?? null;
}

type ToolsSchemaModule = typeof import('@/lib/agent/tools-schema');
let loadedToolsSchemaMod: ToolsSchemaModule | null = null;
let toolsSchemaPromise: Promise<ToolsSchemaModule> | null = null;
function loadToolsSchema(): Promise<ToolsSchemaModule> {
  if (loadedToolsSchemaMod) return Promise.resolve(loadedToolsSchemaMod);
  if (!toolsSchemaPromise) {
    toolsSchemaPromise = import('@/lib/agent/tools-schema')
      .then(mod => {
        loadedToolsSchemaMod = mod;
        return mod;
      })
      .catch(err => {
        toolsSchemaPromise = null;
        throw err;
      });
  }
  return toolsSchemaPromise;
}

type FullReportClientModule = typeof import('./full-report-client');
let loadedFullReportClientMod: FullReportClientModule | null = null;
let fullReportClientPromise: Promise<FullReportClientModule> | null = null;
function loadFullReportClient(): Promise<FullReportClientModule> {
  if (loadedFullReportClientMod) return Promise.resolve(loadedFullReportClientMod);
  if (!fullReportClientPromise) {
    fullReportClientPromise = import('./full-report-client')
      .then(mod => {
        loadedFullReportClientMod = mod;
        return mod;
      })
      .catch(err => {
        fullReportClientPromise = null;
        throw err;
      });
  }
  return fullReportClientPromise;
}

const Lobby = dynamic(() => import('./Lobby'), {
  ssr: false,
  loading: () => <p role="status">正在载入项目全景照度图</p>,
});
const CursorTrail = dynamic(() => import('./CursorTrail'), { ssr: false });
const AnatomyStageCard = dynamic(() => import('@/components/figures/report-workstation/AnatomyStageCard'), {
  ssr: false,
  loading: () => <p role="status">正在载入实证照度罗盘</p>,
});
const AtypicaLiveTheater = dynamic(() => import('@/components/silicon/AtypicaLiveTheater'), {
  ssr: false,
  loading: () => <div className={styles.theaterLoading} role="status">正在准备硅基样本预测试流程</div>,
});

type SiliconRuntimeBundle = {
  siliconExampleQuestionnaire: typeof import('@/lib/silicon/example').siliconExampleQuestionnaire;
  generatePanel: typeof import('@/lib/silicon/persona').generatePanel;
  PANEL_TEMPLATES: typeof import('@/lib/silicon/persona').PANEL_TEMPLATES;
  demoRun: typeof import('@/lib/silicon/run').demoRun;
  NO_SCENARIO: typeof import('@/lib/silicon/run').NO_SCENARIO;
};
let cachedSiliconRuntime: SiliconRuntimeBundle | null = null;
let pendingSiliconRuntime: Promise<SiliconRuntimeBundle> | null = null;
function loadSiliconRuntime(): Promise<SiliconRuntimeBundle> {
  if (cachedSiliconRuntime) return Promise.resolve(cachedSiliconRuntime);
  if (!pendingSiliconRuntime) {
    pendingSiliconRuntime = Promise.all([
      import('@/lib/silicon/example'),
      import('@/lib/silicon/persona'),
      import('@/lib/silicon/run'),
    ]).then(([exampleMod, personaMod, runMod]) => {
      cachedSiliconRuntime = {
        siliconExampleQuestionnaire: exampleMod.siliconExampleQuestionnaire,
        generatePanel: personaMod.generatePanel,
        PANEL_TEMPLATES: personaMod.PANEL_TEMPLATES,
        demoRun: runMod.demoRun,
        NO_SCENARIO: runMod.NO_SCENARIO,
      };
      return cachedSiliconRuntime;
    });
  }
  return pendingSiliconRuntime;
}
const StudioPanel = dynamic(() => import('./studios/StudioPanel'), {
  ssr: false,
  loading: () => <p role="status">正在载入创作工坊</p>,
});
const ResourceLibraryStudio = dynamic(() => import('./studios/ResourceLibraryStudio'), {
  ssr: false,
  loading: () => <p role="status">正在载入学术图表与资料库</p>,
});
const AutonomousAgentTheater = dynamic(() => import('./AutonomousAgentTheater'), {
  ssr: false,
  loading: () => <p role="status">正在载入自主实证分析台</p>,
});
const Advisors = dynamic(() => import('./Advisors'), {
  ssr: false,
  loading: () => <p role="status">正在载入专家顾问团</p>,
});
const ResearchWorkspace = dynamic(() => import('./ResearchWorkspace'), {
  ssr: false,
  loading: () => <p role="status">正在载入研究案卷</p>,
});
const AgentRunReview = dynamic(() => import('./AgentRunReview'), {
  ssr: false,
  loading: () => <p role="status">正在载入候选稿审阅台</p>,
});
const ReportPaper = dynamic(() => import('@/components/editors/ReportPaper'), {
  ssr: false,
  loading: () => <p role="status">正在展开报告成稿纸面</p>,
});
const ReportLiveTheater = dynamic(
  () => import('./ReportLiveTheater').then(m => m.ReportLiveTheater),
  { ssr: false },
);
const PaperToolbar = dynamic(
  () => import('./ReportWorkspace').then(m => m.PaperToolbar),
  { ssr: false, loading: () => <p role="status">正在准备成稿工具栏</p> },
);
const ReportInspector = dynamic(
  () => import('./ReportWorkspace').then(m => m.ReportInspector),
  { ssr: false, loading: () => <p role="status">正在载入写作检查器</p> },
);
const ReportNav = dynamic(
  () => import('./ReportWorkspace').then(m => m.ReportNav),
  { ssr: false, loading: () => <p role="status">正在载入章节目录</p> },
);
const SectionRevision = dynamic(() => import('./SectionRevision'), {
  ssr: false,
  loading: () => <p role="status">正在载入本节修订对照</p>,
});
const OutputPanel = dynamic(() => import('./OutputPanel'), {
  ssr: false,
  loading: () => <p role="status">正在载入统计结果详情</p>,
});

type ReportCandidate = { runId: string; scope: string; threadId: string | null; sourceKey: string; source: ReportRunSource; mode: ProjectResearchMode; before: EditorContent; preview: EditorContent; pack?: FullReportPack; result?: FullReportGenerationResult; pending: boolean; failed?: string; receipts: { id: string; nodeId: string; status: string }[] };
type ReportRunHandle = { runId: string; scope: ReportRunScope; threadId: string | null; owner: string; epoch: number; messageId: string; controller: AbortController };
const REPORT_MODES: Record<ProjectResearchMode, string> = { plan: '研究方案', demonstration: '教学模拟', empirical: '真实资料' };

// Every workbench module opens in the panel and every panel hosts a module: the two lists cannot drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const ROOMS_ARE_PANELS: Same<RoomId, WorkbenchPanel> = true;
void ROOMS_ARE_PANELS;

type ShellTopicTemplate = Omit<DemoBlueprint, 'id' | 'slug' | 'title' | 'subtitle' | 'region'> & {
  match: RegExp;
  defaultTitle: string;
};

const SHELL_TOPIC_TEMPLATES: readonly ShellTopicTemplate[] = [
  {
    match: /银发|养老|助餐|适老|老年|长者|社区食堂/u,
    defaultTitle: '城市社区助餐服务的使用体验、满意度与持续使用意愿调查',
    domainLabel: '社区养老与助餐服务',
    shortTitle: '社区助餐服务',
    groupConstruct: '年龄分组',
    groupA: '60–70 岁老年人',
    groupB: '71 岁及以上老年人',
    statusConstruct: '助餐服务使用方式',
    statusCategories: ['堂食和送餐都用过', '只在助餐点堂食', '只用过送餐上门', '知道但还没用过'],
    scaleConstruct: '助餐服务体验量表',
    dimensions: [
      { code: 'Q3', short: '菜品口味与营养搭配', question: '您对助餐点菜品的口味和营养搭配满意吗？' },
      { code: 'Q4', short: '步行可达与就餐环境', question: '您对从家走到助餐点的方便程度和就餐环境满意吗？' },
      { code: 'Q5', short: '点餐与支付的便利', question: '您觉得助餐点点餐、刷卡或扫码付款方便吗？' },
      { code: 'Q6', short: '送餐准时与补贴结算', question: '您对送餐是否准时、补贴是否算得清楚满意吗？' },
      { code: 'Q7', short: '邻里交流与健康服务', question: '您对在助餐点和邻居交流、参加健康服务活动满意吗？' },
    ],
    mechanismConstruct: '助餐与健康服务联动的支持度',
    mechanismQuestion: '如果助餐点和社区卫生服务、文体活动联动起来，您支持吗？',
    overallSatConstruct: '助餐服务整体满意度',
    overallSatQuestion: '总的来说，您对社区助餐服务满意吗？',
    conversionConstruct: '继续使用并推荐的意愿',
    conversionQuestion: '今后您愿意继续使用社区助餐服务，并推荐给身边的老人吗？',
    tierConstruct: '可接受的每餐自付金额',
    tierQuestion: '一顿饭您自己最多愿意付多少钱？',
    tierChoices: ['8 元及以下', '9–12 元', '13–18 元', '18 元以上'],
    keywords: ['社区助餐', '老年人', '服务体验', '满意度', '持续使用意愿'],
    context: '社区助餐是居家养老服务的一部分，服务能否让老人愿意长期使用，取决于饭菜、距离、价格和服务细节。',
  },
  {
    match: /aigc|生成式|\u5927\u6a21\u578b|人工智能|ai\s*工具|chatgpt|deepseek|智能助手/iu,
    defaultTitle: '大学生使用人工智能学习工具的体验、规范认知与持续使用意愿调查',
    domainLabel: '高校学习与数字工具',
    shortTitle: '大学生智能学习工具',
    groupConstruct: '学科门类',
    groupA: '理工医农类学生',
    groupB: '人文社科类学生',
    statusConstruct: '工具使用场景',
    statusCategories: ['课程学习和科研都用', '只在课程作业中用', '只用来查资料或润色', '了解但还没用过'],
    scaleConstruct: '智能学习工具体验量表',
    dimensions: [
      { code: 'Q3', short: '查找资料与启发思路', question: '您对智能学习工具帮助查找资料、启发思路的效果满意吗？' },
      { code: 'Q4', short: '解题与写作辅助', question: '您对智能学习工具在解题、编程或写作中的辅助效果满意吗？' },
      { code: 'Q5', short: '回答的可靠程度', question: '您觉得智能学习工具给出的内容和引用可靠吗？' },
      { code: 'Q6', short: '使用规范的清晰程度', question: '您所在学校或课程关于使用智能工具的规定清楚吗？' },
      { code: 'Q7', short: '对独立思考的帮助', question: '您觉得使用智能学习工具对自己的独立思考有帮助吗？' },
    ],
    mechanismConstruct: '透明使用声明制度的支持度',
    mechanismQuestion: '如果课程要求在作业中说明智能工具的使用方式，您支持吗？',
    overallSatConstruct: '智能学习工具整体满意度',
    overallSatQuestion: '总的来说，您对用智能工具辅助学习满意吗？',
    conversionConstruct: '继续规范使用的意愿',
    conversionQuestion: '今后您愿意在遵守规定的前提下继续使用智能工具学习吗？',
    tierConstruct: '每月在学习工具上的花费',
    tierQuestion: '您每月在智能学习工具上大约花多少钱？',
    tierChoices: ['不花钱', '1–30 元', '31–100 元', '100 元以上'],
    keywords: ['生成式人工智能', '大学生', '学习体验', '使用规范', '持续使用意愿'],
    context: '智能工具已进入许多大学生的日常学习，高校需要弄清学生怎样使用、遇到哪些问题，才能把规范定得既清楚又可行。',
  },
  {
    match: /赛事|球赛|足球|篮球|演出|音乐节|演唱会|文旅|景区|旅游|观赛|展会|博物馆/u,
    defaultTitle: '城市文体活动的现场体验、满意度与重游意愿调查',
    domainLabel: '城市文体活动与文旅消费',
    shortTitle: '城市文体活动',
    groupConstruct: '受访者身份',
    groupA: '本地常住居民',
    groupB: '外地来访者',
    statusConstruct: '参与方式',
    statusCategories: ['现场和线上都参与过', '只到过现场', '只在线上关注', '了解但没参与过'],
    scaleConstruct: '活动体验量表',
    dimensions: [
      { code: 'Q3', short: '现场氛围与内容质量', question: '您对活动现场氛围和内容质量满意吗？' },
      { code: 'Q4', short: '场馆设施与秩序', question: '您对场馆设施和现场秩序满意吗？' },
      { code: 'Q5', short: '购票与信息获取', question: '您觉得购票、查询活动信息方便吗？' },
      { code: 'Q6', short: '交通往返与散场疏导', question: '您对往返交通和散场疏导满意吗？' },
      { code: 'Q7', short: '周边餐饮与文创消费', question: '您对活动周边的餐饮和文创消费体验满意吗？' },
    ],
    mechanismConstruct: '凭票享受周边优惠的支持度',
    mechanismQuestion: '如果凭活动票可以在周边商家享受优惠，您支持吗？',
    overallSatConstruct: '活动整体满意度',
    overallSatQuestion: '总的来说，您对这项活动满意吗？',
    conversionConstruct: '再次参与并推荐的意愿',
    conversionQuestion: '今后您愿意再次参加，并推荐给亲友吗？',
    tierConstruct: '单次活动的周边花费',
    tierQuestion: '参加一次活动，您在周边大约会花多少钱？',
    tierChoices: ['50 元及以下', '51–100 元', '101–200 元', '200 元以上'],
    keywords: ['文体活动', '现场体验', '满意度', '重游意愿', '文旅消费'],
    context: '文体活动能把人带到城市里来，但人们愿不愿意再来，取决于现场体验和交通、购票、周边消费这些配套。',
  },
  {
    match: /正大|水饺|好咖|鸡肉|无抗/u,
    defaultTitle: '食品饮料新品口味感知、场景渠道触达与复购意愿调查',
    domainLabel: '快消食饮与正大企业命题',
    shortTitle: '正大食品与新消费',
    groupConstruct: '日常食饮消费层级',
    groupA: '青年高频尝鲜群体',
    groupB: '家庭日常刚需采购者',
    statusConstruct: '当前购买渠道',
    statusCategories: ['线下商超或零售柜常买', '即时零售或外卖平台下单', '偶尔线上拼团购入', '关注但暂未购买'],
    scaleConstruct: '食饮产品感知与复购量表',
    dimensions: [
      { code: 'Q3', short: '口味研发与减糖低脂配方', question: '您对产品风味口感及配料健康透明度满意吗？' },
      { code: 'Q4', short: '烹饪还原度与便携封装', question: '您对食用制备便利性及包装锁鲜体验满意吗？' },
      { code: 'Q5', short: '质价感知与单份性价比', question: '您觉得当前定价与日常份量配置合理吗？' },
      { code: 'Q6', short: '品牌信任与食品溯源背书', question: '您对企业品控溯源与冷链配送卫生放心吗？' },
      { code: 'Q7', short: '创意跨界联名与话题吸引', question: '产品的创新风味或联名场景对您的尝鲜驱动大吗？' },
    ],
    mechanismConstruct: '定制小份多拼与企业命题优化支持度',
    mechanismQuestion: '如果推出可自选组合的小份尝鲜装与营养标签可视化展示，您愿意复购吗？',
    overallSatConstruct: '产品与品牌整体满意度',
    overallSatQuestion: '总的来说，您对该食饮产品与消费体验满意吗？',
    conversionConstruct: '常态化复购并口碑推荐意愿',
    conversionQuestion: '今后您愿意将其纳入日常饮食清单并向亲友推荐吗？',
    tierConstruct: '单次采购预算区间',
    tierQuestion: '您单次购买该品类产品通常预算在什么区间？',
    tierChoices: ['20 元及以下', '21–45 元', '46–80 元', '80 元以上'],
    keywords: ['食品创新', '正大命题', '购买偏好', '复购意愿', '特征重要度'],
    context: '面对青年健康轻食与家庭快捷餐厨双重需求，食品企业需要识别口感、配料透明与渠道可达对复购转化的真实权重。',
  },
  {
    match: /低空|无人机|无人驾驶|自动驾驶|智能眼镜|机器人|智能客服|utaut/iu,
    defaultTitle: '新兴智能硬件与低空应用的技术信任、场景接受度与付费意愿调查',
    domainLabel: '低空经济与智慧智能终端',
    shortTitle: '新兴智能技术采纳',
    groupConstruct: '科技产品涉入度',
    groupA: '早期科技尝鲜用户',
    groupB: '审慎实用观望人群',
    statusConstruct: '接触与体验状态',
    statusCategories: ['高频日常或工作场景使用', '线下体验或试乘试戴过', '仅在短视频看过评测', '听说但仍存疑虑'],
    scaleConstruct: '技术采纳与体验量表',
    dimensions: [
      { code: 'Q3', short: '功能效能与效率提升预期', question: '您认可该智能技术或低空服务在日常场景中的效率提升吗？' },
      { code: 'Q4', short: '交互易用性与学习门槛', question: '您觉得硬件操控或低空配送预约流程直观易上手吗？' },
      { code: 'Q5', short: '隐私合规与运行安全信任', question: '您对该技术运行中的人身安全与个人数据隐私保护放心吗？' },
      { code: 'Q6', short: '价格价值与维护成本匹配', question: '相比同类传统方案，您认为它的收费或售价物有所值吗？' },
      { code: 'Q7', short: '同辈口碑与社群示范影响', question: '身边朋友评价或行业示范案例对您的使用意愿影响大吗？' },
    ],
    mechanismConstruct: '安全认证分级与透明提示支持度',
    mechanismQuestion: '若产品加装明显的安全运行认证与一键人工接管机制，您会更愿意尝试吗？',
    overallSatConstruct: '新兴智能场景整体认可度',
    overallSatQuestion: '总的来说，您对该新兴智能或低空应用的当前表现满意吗？',
    conversionConstruct: '实际下单或推广应用意愿',
    conversionQuestion: '未来一年内您愿意为相关智能硬件或服务付费并推荐他人吗？',
    tierConstruct: '单次服务可接受溢价区间',
    tierQuestion: '相比传统方式，您最多愿意额外支付多少便捷服务溢价？',
    tierChoices: ['不愿付溢价', '5 元及以下', '6–15 元', '15 元以上'],
    keywords: ['低空经济', '智能终端', '技术信任', '场景接受度', '采纳意愿'],
    context: '以低空配送、自动驾驶与智能可穿戴为代表的新兴业态正处市场培育期，安全感、隐私顾虑与价格价值决定了大众跃迁速度。',
  },
  {
    match: /情绪|悦己|谷子|盲盒|联名|宠物|即时零售|社区团购|二手|会员/u,
    defaultTitle: '青年情绪价值消费、圈层认同与复购转化机制调查',
    domainLabel: '情绪圈层与新消费模式',
    shortTitle: '情绪与圈层新消费',
    groupConstruct: '消费者年龄层',
    groupA: '18–25 岁青年学生群体',
    groupB: '26 岁以上在职消费群体',
    statusConstruct: '消费频次与卷入度',
    statusCategories: ['每月稳定复购核心玩家', '仅因喜爱或刚需偶尔购入', '曾经购买现已趋于理性', '仅围观关注尚未下单'],
    scaleConstruct: '情绪价值与商业转化量表',
    dimensions: [
      { code: 'Q3', short: '情绪舒压与悦己治愈感知', question: '该类消费是否能显著带来快乐、舒压或陪伴满足感？' },
      { code: 'Q4', short: '创意共鸣与圈层社交标签', question: '您对商品创意设计或圈层同好认同感满意吗？' },
      { code: 'Q5', short: '实用耐用品质与售后保障', question: '相比颜值与噱头，您认为实物品质和售后规范达标吗？' },
      { code: 'Q6', short: '定价合理性与隐性规则透明', question: '您觉得会员权益、抽取机制与配送费规则清楚公平吗？' },
      { code: 'Q7', short: '线下快闪体验与社群互动', question: '线上社群或线下主题快闪活动能否增强您的消费黏性？' },
    ],
    mechanismConstruct: '透明配比与实用融合升级支持度',
    mechanismQuestion: '若产品增强日常实用属性并明确售后与定价透明机制，您支持吗？',
    overallSatConstruct: '情绪与圈层消费整体满意度',
    overallSatQuestion: '总的来说，您对该消费体验的性价比与获得感满意吗？',
    conversionConstruct: '持续支持并长期活跃意愿',
    conversionQuestion: '未来半年您愿意继续为同系列优质商品买单并向亲友推荐吗？',
    tierConstruct: '月均情绪与圈层消费支出',
    tierQuestion: '您每月在该类悦己或圈层消费上的预算大约是多少？',
    tierChoices: ['50 元及以下', '51–150 元', '151–400 元', '400 元以上'],
    keywords: ['情绪消费', '圈层认同', '即时体验', '消费者行为', '复购黏性'],
    context: '从悦己消费到即时零售，消费者既为情绪瞬时愉悦买单，也会迅速以实用性与透明规则检验长期忠诚度。',
  },
  {
    match: /无陪护|病房|医护|医疗|陪护|医院|疫苗|健康/u,
    defaultTitle: '医院便民医疗试点与家庭健康服务信任度及满意度调查',
    domainLabel: '公共卫生与医疗试点服务',
    shortTitle: '医院便民与健康服务',
    groupConstruct: '就医角色视角',
    groupA: '就诊患者与直接体验人',
    groupB: '陪护家属与缴费决策者',
    statusConstruct: '服务使用经历',
    statusCategories: ['全程使用过该医疗试点服务', '部分环节接触体验过', '仅在就医时听说了解', '尚不清楚具体流程'],
    scaleConstruct: '医疗照护服务感知量表',
    dimensions: [
      { code: 'Q3', short: '医护与照护专业操作水平', question: '您对护理或医疗团队的专业操作技能和责任心满意吗？' },
      { code: 'Q4', short: '收费公开与医保分担可承受度', question: '您觉得服务日费标准透明度及家庭负担可接受吗？' },
      { code: 'Q5', short: '陪护沟通反馈与探视制度便利', question: '日常状态反馈及探视安排方便放心吗？' },
      { code: 'Q6', short: '病区安全隐私与饮食照料细节', question: '您对住院期间患者隐私保护、安全监护和餐食照料满意吗？' },
      { code: 'Q7', short: '缓解家庭陪护人力压力效果', question: '该试点服务在减轻子女请假陪护压力方面帮助明显吗？' },
    ],
    mechanismConstruct: '日费明细公示与分级照护机制支持度',
    mechanismQuestion: '如果推行按护理等级明码标价并开通家属日报小程序，您支持吗？',
    overallSatConstruct: '医疗便民试点整体满意度',
    overallSatQuestion: '总的来说，您对当前医疗便民试点服务的质量满意吗？',
    conversionConstruct: '优先选择与主动推荐意愿',
    conversionQuestion: '若亲友未来有住院照护需要，您愿意推荐并优先选用该服务吗？',
    tierConstruct: '可接受日均自付护理费用',
    tierQuestion: '在医保外，您家庭每天最多能接受多高的专业照护自付费用？',
    tierChoices: ['80 元及以下', '81–150 元', '151–220 元', '220 元以上'],
    keywords: ['无陪护病房', '患者满意度', '家庭减负', '重要度表现矩阵', '医疗服务'],
    context: '在一人住院全家忙的现实痛点下，评估无陪护病房等医疗试点必须兼顾护理专业度、家属知情安心感与分层费用可及性。',
  },
];

const SHELL_REGIONS = /^(全国|北京|上海|广州|深圳|武汉|重庆|南京|杭州|成都|西安|长沙|苏州|天津|青岛|郑州|合肥|厦门|宁波|济南|沈阳|大连|昆明|福州|长三角|粤港澳|京津冀|川渝)/u;

function shellFnvHash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pure, dependency-free topic blueprint resolver matching `demo-study.ts:decomposeTopic` without pulling in
 * the simulation/analysis/diagram/dagre graph at initial `/agent` bundle evaluation time.
 */
function decomposeShellTopic(rawTopic = '', existingDesign?: Questionnaire | null): DemoBlueprint {
  const input = (rawTopic || existingDesign?.title || '').trim();
  const region = SHELL_REGIONS.exec(input)?.[1] ?? '样本城市';
  const slug = `topic_${shellFnvHash32(input || 'demo').toString(16).padStart(8, '0')}`;
  const template = SHELL_TOPIC_TEMPLATES.find(tpl => tpl.match.test(input)) ?? (input ? null : SHELL_TOPIC_TEMPLATES[0]);
  if (template) {
    const { match: _match, defaultTitle, ...rest } = template;
    void _match;
    const title = input.length >= 8 ? input : defaultTitle;
    return { ...rest, id: `demo-${slug}`, slug, title, subtitle: '教学模拟数据，不作为实际调查结论', region };
  }

  const stem = input
    .replace(/^.*——/u, '')
    .replace(/^(基于|围绕|关于)/u, '')
    .replace(new RegExp(`^${region}(市|省|地区)?`, 'u'), '')
    .trim();
  const cut = stem.slice(4).search(/的|与|及|和|供需|使用|消费|满意|体验|需求|现状|发展|影响|机制|优化|问题|行为|意愿|调研|调查|研究|分析/u);
  const subject = (cut >= 0 ? stem.slice(0, cut + 4) : stem).slice(0, 16) || '目标服务';
  const shortTitle = subject.slice(0, 12);
  const single = existingDesign?.questions.find(q => q.type === 'single' && q.choices.length >= 2);
  const likerts = (existingDesign?.questions ?? []).filter(q => q.type === 'likert' && q.purpose !== 'screening');
  const aspect = (i: number, short: string, question: string): DemoDimension => ({
    code: (['Q3', 'Q4', 'Q5', 'Q6', 'Q7'] as const)[i],
    short: likerts[i]?.construct?.slice(0, 12) || short,
    question: likerts[i]?.text || question,
  });
  const isCivic = /社区|政务|垃圾分类|环保|低碳|公益|养老|医保|医疗|托育|公交|地铁|物业|公租房|惠民|社保|志愿/u.test(input);
  const isDigital = /软件|小程序|平台|系统|数字化|在线|互联网|电商|直播|算法/iu.test(input);
  const statusCategories: [string, string, string, string] = isCivic
    ? ['长期稳定参与使用', '经常按需使用', '仅偶尔尝试了解', '了解但尚未使用过']
    : isDigital
      ? ['高频深度使用', '常规按需使用', '偶尔浅层试用', '了解但尚未使用过']
      : ['经常使用该服务', '偶尔按需体验', '早先试用后暂停', '了解但尚未使用过'];
  const tierSpec: { construct: string; question: string; choices: [string, string, string, string] } = isCivic
    ? {
        construct: '可接受的月度配套支出',
        question: `若使用${subject}相关便民增值服务，您每月最多愿意承担多少费用？`,
        choices: ['零额外支出', '10 元及以下', '11–30 元', '30 元以上'],
      }
    : isDigital
      ? {
          construct: '每月可接受的服务支出',
          question: `在${subject}相关服务或功能上，您每月可接受的支出区间是？`,
          choices: ['仅用免费功能', '1–20 元', '21–50 元', '50 元以上'],
        }
      : {
          construct: '单次体验可接受的费用区间',
          question: `体验或消费${subject}时，您单次可接受的费用区间大致是？`,
          choices: ['20 元及以下', '21–50 元', '51–100 元', '100 元以上'],
        };

  return {
    id: `demo-${slug}`,
    slug,
    domainLabel: `${shortTitle}调查`,
    title: input.length >= 8 ? input : `${region}${subject}的使用体验与满意度调查`,
    shortTitle,
    subtitle: '教学模拟数据，不作为实际调查结论',
    region,
    groupConstruct: single?.construct || '使用频率分组',
    groupA: single?.choices[0]?.label?.slice(0, 18) || '经常使用者',
    groupB: single?.choices[1]?.label?.slice(0, 18) || '偶尔使用者',
    statusConstruct: '使用状态',
    statusCategories,
    scaleConstruct: `${shortTitle}体验量表`,
    dimensions: [
      aspect(0, '核心服务质量', `您对${subject}的核心服务质量满意吗？`),
      aspect(1, '环境与设施', `您对${subject}的环境和设施满意吗？`),
      aspect(2, '预约与信息获取', `您觉得了解${subject}的规则与使用方式方便吗？`),
      aspect(3, '配套与衔接保障', `您对${subject}的配套支持与响应服务满意吗？`),
      aspect(4, '综合体验与获得感', `您对${subject}的综合体验与长期价值满意吗？`),
    ],
    mechanismConstruct: isCivic ? '规则透明与分步指引支持度' : '规则透明与自主选择支持度',
    mechanismQuestion: isCivic
      ? `如果${subject}配备清晰分步指引并公开服务规则，您支持吗？`
      : `如果${subject}提供透明规则说明并保留本人自主选择权，您支持吗？`,
    overallSatConstruct: `${shortTitle}整体满意度`,
    overallSatQuestion: `总的来说，您对${subject}满意吗？`,
    conversionConstruct: '继续使用并推荐的意愿',
    conversionQuestion: `今后您愿意继续使用${subject}，并推荐给亲友吗？`,
    tierConstruct: tierSpec.construct,
    tierQuestion: tierSpec.question,
    tierChoices: tierSpec.choices,
    keywords: [shortTitle, '使用体验', '满意度', '持续使用意愿'],
    context: `${subject}能否留住使用者，取决于核心服务和配套细节；本研究据此设计问卷。`,
  };
}

function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
/** The module open in the side panel, read from the address: none, the overview, or a workbench module. */
function currentPanel(): RoomId | null {
  return agentPanelFromHash(window.location.hash);
}
const CHAT_HASH = '#chat';
const currentHash = () => window.location.hash;
const serverHash = () => '';
/** A registered result opened beside the conversation, `#output/<id>`; it takes the panel's place while no module is open. */
function currentOutput(): string | null {
  const match = /^#output\/(.{1,400})$/.exec(window.location.hash);
  try { return match ? decodeURIComponent(match[1]) : null; } catch { return null; }
}
/** The research path as the sidebar shows it, in working order. */
const STAGES: RoomId[] = ['diagnose', 'design', 'sampling', 'analysis', 'editor', 'defense'];
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const subscribeNothing = () => () => {};
const searchKey = () => /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
const EMPTY_MESSAGES: Message[] = [];
const PANEL_KEY = 'evix.agent.panel-width.v1';
// Gutters: the canvas padding on the right and the margins between floating panels (see AgentShell.module.css).
const RAIL = 52, SIDEBAR = 264, GUTTERS = 24, MIN_PANEL = 480, MIN_TALK = 360, INSPECTOR = 264;
const GROUPS = (Object.keys(ROOM_GROUPS) as RoomGroup[]).filter(g => g !== 'lobby');

/** The panel width remembered in this browser, if any; a width is a convenience only. */
/**
 * How this identity talks to the agent, remembered: an account's choice in this browser, a guest's for the tab. It is
 * read through a store so the first client render matches the server's, which always starts in 指令模式.
 */
type ChatMode = 'command' | 'model';
const MODE_KEY = 'evix.agent.chat-mode.v1:', modeListeners = new Set<() => void>();
const modeStorage = (owner: string) => owner === 'guest' ? window.sessionStorage : window.localStorage;
function subscribeMode(listener: () => void) { modeListeners.add(listener); return () => { modeListeners.delete(listener); }; }
function readMode(owner: string | null): ChatMode {
  if (!owner) return 'model';
  try { return modeStorage(owner).getItem(MODE_KEY + owner) === 'command' ? 'command' : 'model'; } catch { return 'model'; }
}
function writeMode(owner: string | null, mode: ChatMode) {
  if (!owner) return;
  try { modeStorage(owner).setItem(MODE_KEY + owner, mode); } catch { /* Without storage the choice lasts until the page reloads. */ }
  for (const listener of modeListeners) listener();
}

function savedPanelWidth(): number | null {
  try { const saved = Number(window.localStorage.getItem(PANEL_KEY)); if (saved >= 480 && saved <= 1800) return saved; } catch { /* Not remembered without storage. */ }
  return null;
}

function buildGuestDraftGateTurn(brief: string, provider: string, model: string): AgentTurn {
  return {
    lines: [[span('起草本地研究问卷前，请先核对以下安排。', 'dim')]],
    cards: [
      {
        kind: 'confirm',
        title: `起草本地研究问卷 · ${brief.slice(0, 30)}`,
        lines: [
          [span('本次围绕“'), span(brief.slice(0, 140)), span('”梳理研究目标与测量维度。', 'dim')],
          [span('确认后将由当前连接的“'), span(`${provider} · ${model}`, 'strong'), span('”生成含甄别题、人口学变量与测量量表的结构化题库，并直接写入右侧“问卷设计”本地草稿。')],
        ],
        confirm: { label: '确认生成本地问卷', action: { type: 'draftLocalQuestionnaire', brief }, primary: true },
        cancel: '暂不生成',
      },
    ],
  };
}

type ChatToolExecOutcome = {
  cards: AgentCard[];
  chips: AgentLink[];
  replyLinesList: Line[];
  execStatus: 'done' | 'error';
  execAction: AgentAction;
  resultSummary: string;
  toolOutputText: string;
};

async function executeChatCitationLookup(params: {
  projectId: string;
  csrfToken: string | undefined;
  signal: AbortSignal;
  rawDoi?: string;
  rawQuery?: string;
}): Promise<ChatToolExecOutcome> {
  const cleanDoi = (params.rawDoi ?? '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  const cleanQuery = (params.rawQuery ?? '').trim();
  if (!cleanQuery && !cleanDoi) {
    return {
      cards: [],
      chips: [],
      replyLinesList: [[span('请提供待核验的 DOI（如 10.1016/j.jeconom.2020.12.001）或方法学文献关键词。', 'dim')]],
      execStatus: 'done',
      execAction: { type: 'stage', stage: 'paper' },
      resultSummary: '请提供 DOI 或文献关键词',
      toolOutputText: '未提供待核验的 DOI 或文献关键词。请向用户确认具体 DOI（如 10.1016/j.jeconom.2020.12.001）或方法学/作者关键词，也可提示前往“文献交叉引用”面板检索。',
    };
  }
  const { verifyProjectCitation } = await loadAutonomousAgent();
  const res = await verifyProjectCitation(
    params.projectId,
    { ...(cleanQuery ? { query: cleanQuery } : {}), ...(cleanDoi ? { doi: cleanDoi } : {}) },
    { csrfToken: params.csrfToken, signal: params.signal },
  );
  if (res.verified && res.citation) {
    const cite = res.citation;
    const authorsText = cite.authors.slice(0, 4).join(', ') + (cite.authors.length > 4 ? ' et al.' : '');
    const yearText = cite.year ? String(cite.year) : '年份未详';
    const venueText = cite.venue || '期刊未详';
    const doiValue = (cite.doi || res.doi || '').trim();
    const doiText = doiValue || '无 DOI';
    const refEntry: ReferenceEntry = {
      ...emptyReference('J'),
      id: crypto.randomUUID(),
      authors: cite.authors.map(a => a.trim()).filter(Boolean).slice(0, 30),
      title: (cite.title || doiText).trim().slice(0, 400),
      source: (cite.venue || '').trim().slice(0, 200),
      year: cite.year ? String(cite.year).slice(0, 20) : '',
      doi: doiValue.slice(0, 200),
      url: (cite.url || (doiValue ? `https://doi.org/${doiValue}` : '')).trim().slice(0, 1000),
      verification: 'metadata_only',
    };
    const cards: AgentCard[] = [{
      kind: 'tool',
      title: '文献核验通过',
      lines: [
        [span('题名 ', 'teal'), span(cite.title || doiText, 'strong')],
        [span('作者与出处 ', 'teal'), span([authorsText || '未知作者', yearText, venueText].filter(Boolean).join(' · '))],
        [span('DOI ', 'teal'), span(doiText, 'gold')],
        ...(res.matches.length > 1 ? [[span('候选记录 ', 'dim'), span(`共核验命中 ${res.matches.length} 条可核实文献`, 'dim')]] : []),
      ],
      links: [
        { label: '一键加入参考文献', action: { type: 'insertReference', entry: refEntry }, primary: true },
        { label: '在文献交叉引用中插引', action: { type: 'stage', stage: 'paper' } },
      ],
    }];
    const chips: AgentLink[] = [
      { label: '一键加入参考文献', action: { type: 'insertReference', entry: refEntry }, primary: true },
      { label: '打开文献交叉引用核对插引', action: { type: 'stage', stage: 'paper' } },
    ];
    const topMatches = res.matches.slice(0, 3).map((m, idx) =>
      `${idx + 1}. DOI=${m.doi || '无'} | 题名=${m.title} | 作者=${m.authors.join(', ') || '未知'} | 年份=${m.year ?? '未知'} | 期刊=${m.venue || '未知'} | URL=${m.url || '无'}`,
    ).join('\n');
    return {
      cards,
      chips,
      replyLinesList: [[span('已完成文献核验，检索到可核实的学术文献记录。')]],
      execStatus: 'done',
      execAction: { type: 'stage', stage: 'paper' },
      resultSummary: `已核验 ${(cite.title || doiText).slice(0, 28)}`,
      toolOutputText: [
        '已完成文献核验，元数据信息如下。',
        `主文献 DOI=${doiText} | 题名=${cite.title} | 作者=${authorsText || '未知'} | 年份=${yearText} | 期刊=${venueText} | URL=${cite.url || '无'}`,
        ...(res.matches.length > 1 ? [`候选文献共 ${res.matches.length} 条\n${topMatches}`] : []),
        '请在回答中如实给出以上核验元数据，并提醒用户插入正文前在“文献交叉引用”面板核对原文页码与支持位置。',
      ].join('\n'),
    };
  }
  return {
    cards: [{
      kind: 'tool',
      title: '未检索到该文献',
      lines: [
        [span('检索目标 ', 'teal'), span(cleanDoi || cleanQuery)],
        [span('核验说明 ', 'error'), span('未在文献核验库或学术索引中查到匹配记录，暂不自动生成引用。', 'dim')],
      ],
      links: [{ label: '在文献交叉引用中手动录入核对', action: { type: 'stage', stage: 'paper' } }],
    }],
    chips: [{ label: '前往文献交叉引用核对', action: { type: 'stage', stage: 'paper' } }],
    replyLinesList: [[span('暂未在可信文献库中找到该条文献，请核对 DOI 或作者关键词后再试。', 'dim')]],
    execStatus: 'done',
    execAction: { type: 'stage', stage: 'paper' },
    resultSummary: '未检索到匹配文献',
    toolOutputText: `文献核验未命中（verified=false, reason=${res.reason || 'not_found'}）。仅采纳可核实文献，绝不编造 DOI、作者、年份或期刊，请如实告知用户未查到并建议核对检索词或在“文献交叉引用”面板手动确认。`,
  };
}

async function executeChatSandboxPlot(params: {
  projectId: string;
  csrfToken: string | undefined;
  signal: AbortSignal;
  availableResults: readonly ResultSnapshot[];
  requestedSnapId?: string;
  targetHint?: string;
  chartKind: 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell';
  saveArtifact: (title: string, svg: string) => void;
}): Promise<ChatToolExecOutcome> {
  const {
    fetchAutonomousRuns,
    prepareSandboxSvgForArtifact,
    runProjectPlotSandbox,
    sandboxSvgToDataUri,
    sanitizeAdvisorDisplayText,
  } = await loadAutonomousAgent();
  const cleanRequestedId = (params.requestedSnapId ?? '').trim();
  const cleanHint = (params.targetHint ?? '').trim().toLowerCase();
  type PlotCandidate = Record<string, unknown> & { id: string; title: string; n: number; method: string; summary?: string };
  const matchesTitleHint = (item: PlotCandidate): boolean => {
    if (!cleanHint) return false;
    const rawTitle = String(item.title ?? '');
    const cleanTitle = sanitizeAdvisorDisplayText(rawTitle);
    return `${cleanTitle} ${rawTitle}`.toLowerCase().includes(cleanHint);
  };
  const matchesBroadHint = (item: PlotCandidate): boolean => {
    if (!cleanHint) return false;
    if (matchesTitleHint(item)) return true;
    const summaryText = typeof item.summary === 'string' ? sanitizeAdvisorDisplayText(item.summary) : '';
    const methodLabel = String(item.method ?? '');
    return `${summaryText} ${methodLabel}`.toLowerCase().includes(cleanHint);
  };
  const pickByMatcher = <T extends PlotCandidate>(items: readonly T[], matcher: (item: T) => boolean): T | null => {
    const rev = [...items].reverse();
    return (
      rev.find(r => r.method !== 'quality-control' && r.method !== 'sampling-frame' && matcher(r))
      ?? rev.find(r => matcher(r))
      ?? null
    );
  };
  const pickLatest = <T extends PlotCandidate>(items: readonly T[]): T | null =>
    cleanRequestedId
      ? items.find(r => r.id === cleanRequestedId) ?? null
      : [...items].reverse().find(r => r.method !== 'quality-control' && r.method !== 'sampling-frame')
        ?? [...items].reverse().find(r => r.method !== 'quality-control')
        ?? items.at(-1)
        ?? null;

  const localCandidates = params.availableResults as unknown as readonly PlotCandidate[];
  let targetSnap: PlotCandidate | null = cleanRequestedId ? pickLatest(localCandidates) : null;
  let resolvedRunId = '';
  let cloudRunsCache: AutonomousRunView[] | null = null;
  const loadCloudRuns = async (): Promise<AutonomousRunView[]> => {
    if (cloudRunsCache) return cloudRunsCache;
    cloudRunsCache = await fetchAutonomousRuns(params.projectId, { signal: params.signal }).catch(() => []);
    return cloudRunsCache;
  };

  if (!targetSnap && !cleanRequestedId && cleanHint) {
    targetSnap = pickByMatcher(localCandidates, matchesTitleHint);
    if (!targetSnap) {
      const cloudRuns = await loadCloudRuns();
      for (const runItem of cloudRuns) {
        if (runItem.status === 'failed' || runItem.status === 'cancelled' || runItem.registeredResults.length === 0) continue;
        const picked = pickByMatcher(runItem.registeredResults as unknown as readonly PlotCandidate[], matchesTitleHint);
        if (picked) {
          targetSnap = picked;
          resolvedRunId = runItem.runId;
          break;
        }
      }
    }
    if (!targetSnap) {
      targetSnap = pickByMatcher(localCandidates, matchesBroadHint);
    }
    if (!targetSnap) {
      const cloudRuns = await loadCloudRuns();
      for (const runItem of cloudRuns) {
        if (runItem.status === 'failed' || runItem.status === 'cancelled' || runItem.registeredResults.length === 0) continue;
        const picked = pickByMatcher(runItem.registeredResults as unknown as readonly PlotCandidate[], matchesBroadHint);
        if (picked) {
          targetSnap = picked;
          resolvedRunId = runItem.runId;
          break;
        }
      }
    }
  } else if (!targetSnap && !cleanRequestedId) {
    targetSnap = pickLatest(localCandidates);
  }

  if (!targetSnap) {
    const cloudRuns = await loadCloudRuns();
    for (const runItem of cloudRuns) {
      if (runItem.status === 'failed' || runItem.status === 'cancelled' || runItem.registeredResults.length === 0) continue;
      const picked = pickLatest(runItem.registeredResults as unknown as readonly PlotCandidate[]);
      if (picked) {
        targetSnap = picked;
        resolvedRunId = runItem.runId;
        break;
      }
    }
  }

  if (!targetSnap && !cleanRequestedId && cleanHint) {
    targetSnap = pickLatest(localCandidates);
  }

  if (!targetSnap) {
    const existingList = params.availableResults.slice(-5).map(r => r.title).join('、');
    return {
      cards: [{
        kind: 'tool',
        title: '暂无可用于制图的统计结果',
        lines: [
          [span('提示 ', 'teal'), span('当前项目尚未检测到已登记的分析结果，请先在“深度数据分析与发现”运行分析后再生成配图。', 'dim')],
        ],
        links: [{ label: '前往数据分析', action: { type: 'href', href: '#research/analysis' }, primary: true }],
      }],
      chips: [
        { label: '前往数据分析生成统计结果', action: { type: 'href', href: '#research/analysis' }, primary: true },
        { label: '打开数据分析模块', action: { type: 'open', room: 'analysis' } },
      ],
      replyLinesList: [[span('当前项目尚未发现可用于出图的统计结果，请先在数据分析模块完成计算。', 'dim')]],
      execStatus: 'done',
      execAction: { type: 'href', href: '#research/analysis' },
      resultSummary: cleanRequestedId ? '未找到对应统计结果' : '尚无可用统计结果',
      toolOutputText: cleanRequestedId
        ? `未在当前项目中找到对应统计结果（${cleanRequestedId}），当前可用结果包括${existingList || '暂无'}。请先核对或运行分析后再出图。`
        : '当前项目尚无可用于绘制配图的统计结果。请引导用户先在“数据与分析”模块完成分析后再生成配图。',
    };
  }

  let plotRes;
  if (resolvedRunId) {
    try {
      plotRes = await runProjectPlotSandbox(
        params.projectId,
        { runId: resolvedRunId, snapshotId: targetSnap.id, chartKind: params.chartKind, autoRepair: true },
        { csrfToken: params.csrfToken, signal: params.signal },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/404|not[_\s-]?found|未找到/i.test(msg)) throw err;
      plotRes = await runProjectPlotSandbox(
        params.projectId,
        { snapshot: targetSnap, chartKind: params.chartKind, autoRepair: true },
        { csrfToken: params.csrfToken, signal: params.signal },
      );
    }
  } else {
    plotRes = await runProjectPlotSandbox(
      params.projectId,
      { snapshot: targetSnap, chartKind: params.chartKind, autoRepair: true },
      { csrfToken: params.csrfToken, signal: params.signal },
    );
  }

  const cleanSnapTitle = sanitizeAdvisorDisplayText(String(targetSnap.title || '统计分析配图').replace(/^\[\d+\]\s*/u, '')) || '统计分析配图';
  const kindLabel = CHART_KIND_LABEL_ZH[params.chartKind] ?? '自动适配';
  const cleanSvg = prepareSandboxSvgForArtifact(plotRes.svg);
  const previewSvgDataUri = sandboxSvgToDataUri(cleanSvg);
  params.saveArtifact(cleanSnapTitle, cleanSvg);
  const layoutStatus = plotRes.audit.passed
    ? '版面清晰，已自动收存至右侧素材架'
    : '局部标签较紧凑，建议下载或切换图表样式复核';
  const altStyleChips: AgentLink[] = (['forest', 'dumbbell', 'bar', 'line'] as const)
    .filter(k => k !== params.chartKind)
    .slice(0, 2)
    .map(k => ({
      label: `切换为${CHART_KIND_LABEL_ZH[k]}`,
      action: { type: 'say', text: `生成${CHART_KIND_LABEL_ZH[k]}` },
    }));
  const resultLineText = /\bn\s*=\s*\d+/i.test(cleanSnapTitle)
    ? cleanSnapTitle
    : `${cleanSnapTitle}（n=${targetSnap.n}）`;
  return {
    cards: [{
      kind: 'tool',
      title: `已生成高清配图 · ${cleanSnapTitle}`,
      lines: [
        [span('对应结果 ', 'teal'), span(resultLineText, 'strong')],
        [span('图表样式 ', 'teal'), span(kindLabel, 'gold')],
        [span('配图状态 ', 'teal'), span(layoutStatus, plotRes.audit.passed ? 'dim' : 'error')],
      ],
      previewSvgDataUri,
      previewAlt: cleanSnapTitle,
      links: [
        { label: '前往成文视图', action: { type: 'stage', stage: 'paper' }, primary: true },
        { label: '查看配图面板', action: { type: 'href', href: '#research/analysis' } },
      ],
    }],
    chips: [
      ...altStyleChips,
      { label: '查看配图面板', action: { type: 'href', href: '#research/analysis' } },
      { label: '前往成文视图', action: { type: 'stage', stage: 'paper' } },
    ],
    replyLinesList: [[span(`已基于最新统计结果生成“${kindLabel}”矢量配图，并自动收入右上角“素材架”。`)]],
    execStatus: 'done',
    execAction: { type: 'href', href: '#research/analysis' },
    resultSummary: '已生成高清配图并存入素材架',
    toolOutputText: [
      `已根据统计结果“${cleanSnapTitle}”（n=${targetSnap.n}）生成高清矢量配图（${kindLabel}），并存入项目素材架。`,
      `当前版面状态为${layoutStatus}。`,
      '可提示用户打开右上角“素材架”预览、下载或直接插入报告正文。',
    ].join('\n'),
  };
}

async function executeChatCountyLookup(params: {
  projectId: string;
  signal: AbortSignal;
  query: string;
}): Promise<ChatToolExecOutcome> {
  const cleanQuery = params.query.trim();
  if (!cleanQuery) {
    return {
      cards: [],
      chips: [{ label: '打开资料库县域风物志', action: { type: 'stage', stage: 'library' }, primary: true }],
      replyLinesList: [[span('请提供省市县区名称或 6 位行政区划代码，例如“义乌市”或“330782”。', 'dim')]],
      execStatus: 'done',
      execAction: { type: 'stage', stage: 'library' },
      resultSummary: '请提供地区名称或区划代码',
      toolOutputText: '未提供具体区县名称或行政区划代码，请引导用户在提问中写明地区名称或前往“资料库 → 中国县域风物志”检索。',
    };
  }
  const { queryProjectCountyGazetteer } = await loadAutonomousAgent();
  const res = await queryProjectCountyGazetteer(params.projectId, cleanQuery, { limit: 5, signal: params.signal });
  if (res.matches.length === 0) {
    return {
      cards: [{
        kind: 'tool',
        title: '未检索到匹配区县名录',
        lines: [
          [span('检索关键词 ', 'teal'), span(cleanQuery)],
          [span('说明 ', 'error'), span('未在行政区划与县域风物名录中找到精确对应项，可核对地名全称或在资料库浏览。', 'dim')],
        ],
        links: [{ label: '打开资料库县域风物志', action: { type: 'stage', stage: 'library' }, primary: true }],
      }],
      chips: [{ label: '打开资料库县域风物志', action: { type: 'stage', stage: 'library' } }],
      replyLinesList: [[span(`暂未在名录中找到与“${cleanQuery}”精确匹配的区县记录。`, 'dim')]],
      execStatus: 'done',
      execAction: { type: 'stage', stage: 'library' },
      resultSummary: '未检索到匹配区县',
      toolOutputText: `未能检索到“${cleanQuery}”对应的行政区划或区县风物记录。请如实告知用户并建议检查地名全称或前往资料库查看。`,
    };
  }
  const matchLines: Line[] = res.matches.slice(0, 3).map((m) => [
    span(`${m.name || m.code} `, 'strong'),
    ...(m.code ? [span(`· ${m.code} `, 'gold')] : []),
    span([m.provinceName, m.prefectureName].filter(Boolean).join(' · ') || '行政区划名录', 'dim'),
  ]);
  if (res.matchedPatterns.length > 0) {
    matchLines.push([
      span('关联研究话题 ', 'teal'),
      span(res.matchedPatterns.slice(0, 2).map(p => p.title).join('；')),
    ]);
  }
  if (res.caveats.length > 0) {
    matchLines.push([span('名录说明 ', 'teal'), span(res.caveats[0], 'dim')]);
  }
  const primaryMatch = res.matches[0];
  const topLabel = [primaryMatch.provinceName, primaryMatch.prefectureName, primaryMatch.name].filter(Boolean).join(' · ');
  const regionFull = [primaryMatch.provinceName, primaryMatch.prefectureName, primaryMatch.name].filter(Boolean).join('');
  const codeText = primaryMatch.code ? `（行政区划代码 ${primaryMatch.code}）` : '';
  const topicText = res.matchedPatterns.length > 0
    ? `结合县域风物名录与主题关联线索，相关调研可重点围绕${res.matchedPatterns.slice(0, 2).map(p => `“${p.title}”`).join('与')}展开实地访谈与抽样布点。`
    : '结合行政区划层级与区域特征，可作为本研究空间分层抽样与实地调查的区域背景依据。';
  const caveatText = res.caveats.length > 0 ? res.caveats[0].replace(/[。；\s]+$/u, '') : '';
  const countyParagraph = `${regionFull || primaryMatch.name || cleanQuery}${codeText}纳入本研究区域考察范围。${topicText}${caveatText ? `需要说明的是，${caveatText}。` : ''}`;
  const insertCountyAction: AgentAction = {
    type: 'insertStudioBlock',
    node: 'intro.background',
    title: `${primaryMatch.name || cleanQuery}区域背景`,
    paragraphs: [countyParagraph],
  };
  return {
    cards: [{
      kind: 'tool',
      title: '区县风物与行政区划核验',
      lines: matchLines,
      links: [
        { label: '一键写入研究背景', action: insertCountyAction, primary: true },
        { label: '打开资料库县域风物志', action: { type: 'stage', stage: 'library' } },
      ],
    }],
    chips: [
      { label: '一键写入研究背景', action: insertCountyAction, primary: true },
      { label: '打开资料库县域风物志', action: { type: 'stage', stage: 'library' } },
    ],
    replyLinesList: [[span(`已核验行政区划名录，命中“${topLabel || cleanQuery}”等 ${res.matches.length} 条记录。`)]],
    execStatus: 'done',
    execAction: { type: 'stage', stage: 'library' },
    resultSummary: `核验命中 ${res.matches[0].name || res.matches[0].code}`,
    toolOutputText: [
      `已完成“${cleanQuery}”区县风物与行政区划核验。`,
      ...res.matches.slice(0, 5).map((m, idx) => `${idx + 1}. ${m.name} (${m.code}) · ${[m.provinceName, m.prefectureName].filter(Boolean).join(' · ')}`),
      ...(res.matchedPatterns.length > 0 ? [`相关研究话题包括${res.matchedPatterns.slice(0, 3).map(p => p.title).join('、')}。`] : []),
      ...(res.caveats.length > 0 ? [`需要留意${res.caveats[0]}`] : []),
    ].join('\n'),
  };
}

function formatMemoryKindZh(kind: string): string {
  const k = kind.trim().toLowerCase();
  if (k === 'mother_insight') return '核心结论';
  if (/warning|risk|caveat/i.test(k)) return '风险警示';
  if (/pivot|reversal/i.test(k)) return '方向修正';
  return '实证记忆';
}

async function executeChatMemoryRecall(params: {
  projectId: string;
  signal: AbortSignal;
}): Promise<ChatToolExecOutcome> {
  const { fetchProjectEpistemicMemory, sanitizeAdvisorDisplayText } = await loadAutonomousAgent();
  const items = await fetchProjectEpistemicMemory(params.projectId, { signal: params.signal });
  const activeItems = items.filter(i => i.status === 'active');
  const displayItems = (activeItems.length > 0 ? activeItems : items).slice(0, 6);
  if (displayItems.length === 0) {
    return {
      cards: [{
        kind: 'tool',
        title: '暂无已积累的研究记忆',
        lines: [
          [span('说明 ', 'teal'), span('当前项目尚未沉淀持久化的研究结论与风险记忆，完成一轮深度数据分析后会自动沉淀关键结论。', 'dim')],
        ],
        links: [{ label: '前往深度数据分析', action: { type: 'href', href: '#research/analysis' }, primary: true }],
      }],
      chips: [{ label: '前往深度数据分析', action: { type: 'href', href: '#research/analysis' } }],
      replyLinesList: [[span('当前项目暂未查询到历史研究记忆记录。', 'dim')]],
      execStatus: 'done',
      execAction: { type: 'href', href: '#research/analysis' },
      resultSummary: '暂无研究记忆',
      toolOutputText: '当前项目尚无跨会话研究记忆。可引导用户前往“深度数据分析与发现”运行分析以自动沉淀核心结论。',
    };
  }
  const lines: Line[] = displayItems.map((item) => {
    const cleanText = sanitizeAdvisorDisplayText(item.summary) || '已记录核心发现';
    return [span(`${formatMemoryKindZh(item.kind)} `, 'teal'), span(cleanText)];
  });
  return {
    cards: [{
      kind: 'tool',
      title: '本项目已积累的研究记忆',
      lines,
      links: [{ label: '前往深度数据分析', action: { type: 'href', href: '#research/analysis' }, primary: true }],
    }],
    chips: [{ label: '前往深度数据分析', action: { type: 'href', href: '#research/analysis' } }],
    replyLinesList: [[span(`已为您调取本项目积累的 ${displayItems.length} 条核心研究记忆。`)]],
    execStatus: 'done',
    execAction: { type: 'href', href: '#research/analysis' },
    resultSummary: `已调取 ${displayItems.length} 条研究记忆`,
    toolOutputText: displayItems.map((item, idx) => `${idx + 1}. （${formatMemoryKindZh(item.kind)}）${sanitizeAdvisorDisplayText(item.summary)}`).join('\n'),
  };
}

type StatPresetPlotSpec = {
  categories: string[];
  values: number[];
  chartKind: 'forest' | 'dumbbell' | 'bar';
  title: string;
};

function buildStatPresetPlotSpec(
  presetId: StatSandboxPresetId,
  presetLabel: string,
  res: Awaited<ReturnType<typeof runProjectStatSandbox>>,
  sanitizeAdvisorDisplayText: (raw: string) => string,
): StatPresetPlotSpec | null {
  const tbl = res.table && typeof res.table === 'object' ? (res.table as { rows?: unknown }) : null;
  const rows = Array.isArray(tbl?.rows) ? tbl.rows.filter((r): r is unknown[] => Array.isArray(r)) : [];
  if (presetId === 'mann_whitney_cliff' && rows.length >= 2) {
    const r0 = rows[0];
    const r1 = rows[1];
    const m0 = Number(r0[2]);
    const m1 = Number(r1[2]);
    const md0 = Number(r0[3]);
    const md1 = Number(r1[3]);
    if ([m0, m1, md0, md1].every(Number.isFinite)) {
      const g0 = (sanitizeAdvisorDisplayText(String(r0[0] ?? '分组一')) || '分组一').slice(0, 10);
      const g1 = (sanitizeAdvisorDisplayText(String(r1[0] ?? '分组二')) || '分组二').slice(0, 10);
      return {
        categories: [`${g0} 均值`, `${g1} 均值`, `${g0} 中位数`, `${g1} 中位数`],
        values: [m0, m1, md0, md1],
        chartKind: 'dumbbell',
        title: `${presetLabel} 分组均值与中位数对比`,
      };
    }
  }
  if (presetId === 'spearman_matrix' && rows.length > 0) {
    const cleanPairTerm = (raw: unknown, fallback: string): string => {
      let s = sanitizeAdvisorDisplayText(String(raw ?? fallback)) || fallback;
      s = s.replace(/^(?:未反向重编码陷阱题|开放题)[：:]\s*/u, '');
      const parenIdx = s.search(/[（(]/u);
      if (parenIdx >= 4) s = s.slice(0, parenIdx).trim();
      return s.slice(0, 8).replace(/[与及和的：:、\s]+$/u, '') || s.slice(0, 8) || fallback;
    };
    const pairs = rows
      .slice(0, 6)
      .map((r) => ({
        label: `${cleanPairTerm(r[0], '指标A')}×${cleanPairTerm(r[1], '指标B')}`,
        rho: Number(r[2]),
      }))
      .filter(p => Number.isFinite(p.rho));
    if (pairs.length > 0) {
      return {
        categories: pairs.map(p => p.label),
        values: pairs.map(p => p.rho),
        chartKind: 'forest',
        title: `${presetLabel} 核心相关系数分布`,
      };
    }
  }
  if (presetId === 'bootstrap_ci') {
    const m = res.metrics ?? {};
    const entries: Array<[string, unknown]> = [
      ['均值', m.mean],
      ['95%置信下限', m.ci_95_low ?? m.ci_low],
      ['95%置信上限', m.ci_95_high ?? m.ci_high],
      ['标准差', m.sd ?? m.std],
    ];
    const valid = entries
      .map(([lbl, v]) => [lbl, Number(v)] as const)
      .filter(([, num]) => Number.isFinite(num));
    if (valid.length >= 2) {
      return {
        categories: valid.map(([lbl]) => lbl),
        values: valid.map(([, num]) => num),
        chartKind: 'forest',
        title: `${presetLabel} 核心估计分布`,
      };
    }
  }
  return null;
}

async function executeChatStatPreset(params: {
  projectId: string;
  csrfToken: string | undefined;
  signal: AbortSignal;
  presetId: StatSandboxPresetId;
  design: Questionnaire | null;
  dataset: Parameters<typeof serializeDatasetForAutonomousSandbox>[1];
  saveArtifact: (title: string, svg: string) => void;
}): Promise<ChatToolExecOutcome> {
  const {
    STAT_METRIC_LABEL_ZH,
    STAT_SANDBOX_PRESETS,
    buildStatPresetFinding,
    buildStatPresetResultSnapshot,
    fetchAutonomousRuns,
    prepareSandboxSvgForArtifact,
    runProjectPlotSandbox,
    runProjectStatSandbox,
    sandboxSvgToDataUri,
    sanitizeAdvisorDisplayText,
    serializeDatasetForAutonomousSandbox,
  } = await loadAutonomousAgent();
  const preset = STAT_SANDBOX_PRESETS.find(p => p.id === params.presetId);
  if (!preset) {
    return {
      cards: [],
      chips: [{ label: '前往深度数据分析', action: { type: 'href', href: '#research/analysis' }, primary: true }],
      replyLinesList: [[span('未识别该项稳健统计检验方案，可前往“深度数据分析与发现”选择预设方案。', 'dim')]],
      execStatus: 'done',
      execAction: { type: 'href', href: '#research/analysis' },
      resultSummary: '未找到对应统计方案',
      toolOutputText: '未找到指定的专项稳健统计检验方案，请引导用户前往“深度数据分析与发现”面板选择执行。',
    };
  }
  const cloudRuns = await fetchAutonomousRuns(params.projectId, { signal: params.signal }).catch(() => []);
  const targetRun = cloudRuns.find(r => r.status !== 'failed' && r.status !== 'cancelled');
  const serialized = !targetRun && params.dataset && params.dataset.table.rows.length >= 10
    ? serializeDatasetForAutonomousSandbox(params.design, params.dataset)
    : null;
  if (!targetRun && !serialized) {
    return {
      cards: [{
        kind: 'tool',
        title: '暂无可用样本数据',
        lines: [
          [span('说明 ', 'teal'), span('当前项目尚未上传数据表或运行云端分析，请先在“数据与分析”加载数据后再发起专项稳健检验。', 'dim')],
        ],
        links: [{ label: '前往数据分析', action: { type: 'href', href: '#research/analysis' }, primary: true }],
      }],
      chips: [{ label: '前往数据分析', action: { type: 'href', href: '#research/analysis' }, primary: true }],
      replyLinesList: [[span('当前项目尚未检测到可用于统计检验的样本数据。', 'dim')]],
      execStatus: 'done',
      execAction: { type: 'href', href: '#research/analysis' },
      resultSummary: '尚无可用样本数据',
      toolOutputText: '当前项目尚无可用数据集或历史分析运行记录，无法执行稳健统计检验。',
    };
  }

  const res = await runProjectStatSandbox(
    params.projectId,
    targetRun
      ? { script: preset.script, runId: targetRun.runId }
      : {
          script: preset.script,
          questions: serialized!.questions,
          rows: serialized!.rows,
          classification: serialized!.classification === 'user_provided' ? 'actual' : 'simulated',
        },
    { csrfToken: params.csrfToken, signal: params.signal },
  );
  const cleanSummary = sanitizeAdvisorDisplayText(res.summary) || `${preset.label}已完成`;
  const metricPairs = Object.entries(res.metrics ?? {})
    .filter(([, val]) => typeof val === 'number' || typeof val === 'string')
    .slice(0, 4)
    .map(([k, val]) => {
      const label = STAT_METRIC_LABEL_ZH[k] ?? k;
      let numText: string;
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (k === 'p_value' || k === 'top_p') {
          numText = val < 0.0001 ? '< 0.0001' : val.toFixed(4);
        } else if (Math.abs(val) < 0.0001 && val !== 0) {
          numText = val.toExponential(2);
        } else {
          numText = Number(val.toPrecision(4)).toString();
        }
      } else {
        numText = String(val);
      }
      return `${label} ${numText}`;
    });
  const metricLine = metricPairs.join(' · ');

  let previewSvgDataUri: string | undefined;
  let previewAlt: string | undefined;
  let plotAttached = false;
  const plotSpec = buildStatPresetPlotSpec(params.presetId, preset.label, res, sanitizeAdvisorDisplayText);
  if (plotSpec) {
    try {
      const plotRes = await runProjectPlotSandbox(
        params.projectId,
        {
          snapshot: {
            id: res.snapshotId || `stat_${params.presetId}`,
            title: plotSpec.title,
            n: res.nEffective ?? 0,
            chart: {
              title: plotSpec.title,
              categories: plotSpec.categories,
              values: plotSpec.values,
            },
          },
          chartKind: plotSpec.chartKind,
          autoRepair: true,
        },
        { csrfToken: params.csrfToken, signal: params.signal },
      );
      const cleanSvg = prepareSandboxSvgForArtifact(plotRes.svg);
      previewSvgDataUri = sandboxSvgToDataUri(cleanSvg);
      previewAlt = plotSpec.title;
      params.saveArtifact(plotSpec.title, cleanSvg);
      plotAttached = true;
    } catch (chainErr) {
      if ((chainErr as Error)?.name === 'AbortError' || params.signal.aborted) throw chainErr;
    }
  }

  const targetNode = params.presetId === 'bootstrap_ci' ? 'sample.descriptive' : 'compare.tests';
  const statSnapshot = await buildStatPresetResultSnapshot(params.presetId, preset.label, res).catch(() => null);
  const hasSampleCount = !!res.nEffective && new RegExp(`n\\s*=\\s*${res.nEffective}\\b`, 'u').test(cleanSummary);
  const tableCaption = statSnapshot ? captionText(`${preset.label}结果汇总`) : undefined;
  const introRef = statSnapshot ? '如[[表:@0]]所示，' : '';
  const cleanBody = cleanSummary.replace(/[。；\s]+$/u, '');
  const methodMentioned = /Spearman|Bootstrap|Mann-Whitney/iu.test(cleanBody);
  const sampleClause = !hasSampleCount && res.nEffective ? `（有效样本 n=${res.nEffective}）` : '';
  const reportParagraph = methodMentioned
    ? `${introRef}${cleanBody}${sampleClause}。`
    : `${introRef}采用${preset.label}检验，${cleanBody}${sampleClause}。`;
  const insertAction: AgentAction = {
    type: 'insertStudioBlock',
    node: targetNode,
    title: preset.label,
    paragraphs: [reportParagraph],
    ...(statSnapshot ? { tableResult: statSnapshot, tableCaption } : {}),
  };

  const statFinding = statSnapshot
    ? buildStatPresetFinding(params.presetId, preset.label, res, statSnapshot)
    : null;
  const registerFindingAction: AgentAction | null = statFinding && statSnapshot
    ? (() => {
        const cleanInterp = statFinding.interpretation.replace(/[。；\s]+$/u, '');
        const cleanScope = statFinding.scope.replace(/[。；\s]+$/u, '');
        return {
          type: 'insertFinding' as const,
          finding: statFinding,
          result: statSnapshot,
          node: 'conclusion.findings',
          paragraph: `${cleanInterp}；需要说明的是，该结论${cleanScope}。`,
        };
      })()
    : null;
  const findingBtnLabel = statSnapshot?.classification === 'simulated' ? '登记为待核发现' : '一键采纳为已确认发现';

  const lines: Line[] = [
    [span('核心结论 ', 'teal'), span(cleanSummary, 'strong')],
    ...(res.nEffective ? [[span('有效样本 ', 'teal'), span(`n=${res.nEffective}`, 'gold')]] : []),
    ...(metricLine ? [[span('关键指标 ', 'teal'), span(metricLine, 'gold')]] : []),
    ...(plotAttached ? [[span('配图状态 ', 'teal'), span('已自动生成配套矢量配图并收存至右侧素材架', 'dim')]] : []),
  ];
  return {
    cards: [{
      kind: 'tool',
      title: `专项稳健统计检验完成 · ${preset.label}`,
      lines,
      ...(previewSvgDataUri ? { previewSvgDataUri, previewAlt } : {}),
      links: [
        { label: '一键写入报告对应章节', action: insertAction, primary: true },
        ...(registerFindingAction ? [{ label: findingBtnLabel, action: registerFindingAction }] : []),
        { label: '前往数据分析', action: { type: 'href', href: '#research/analysis' } },
        { label: '一键生成差异对比图', action: { type: 'say', text: '生成差异对比图' } },
      ],
    }],
    chips: [
      { label: '一键写入报告对应章节', action: insertAction, primary: true },
      ...(registerFindingAction ? [{ label: findingBtnLabel, action: registerFindingAction }] : []),
      { label: '一键生成差异对比图', action: { type: 'say', text: '生成差异对比图' } },
      { label: '前往数据分析', action: { type: 'href', href: '#research/analysis' } },
    ],
    replyLinesList: [[span(
      plotAttached
        ? `已完成“${preset.label}”实证复核检验，并自动生成配套矢量配图收入“素材架”。`
        : `已完成“${preset.label}”实证复核检验，主要统计指标汇总如下。`,
    )]],
    execStatus: 'done',
    execAction: { type: 'href', href: '#research/analysis' },
    resultSummary: plotAttached ? `已完成检验并生成配图 · ${preset.label}` : `已完成检验 · ${preset.label}`,
    toolOutputText: [
      `已完成专项稳健统计检验（${preset.label}）。`,
      cleanSummary,
      ...(res.nEffective ? [`有效样本为 n=${res.nEffective}。`] : []),
      ...(metricLine ? [`主要统计指标包括 ${metricLine}。`] : []),
      ...(plotAttached ? ['已自动绘制配套矢量配图并收存至素材架。'] : []),
    ].join('\n'),
  };
}

async function executeChatAutonomousAudit(params: {
  projectId: string;
  csrfToken: string | undefined;
  signal: AbortSignal;
  design: Questionnaire | null;
  dataset: Parameters<typeof serializeDatasetForAutonomousSandbox>[1];
  forceFresh: boolean;
}): Promise<ChatToolExecOutcome> {
  const {
    fetchAutonomousRuns,
    runAutonomousResearch,
    sanitizeAdvisorDisplayText,
    serializeDatasetForAutonomousSandbox,
  } = await loadAutonomousAgent();
  let run: AutonomousRunView | null = null;
  let reusedLatest = false;
  if (!params.forceFresh) {
    const history = await fetchAutonomousRuns(params.projectId, { signal: params.signal }).catch(() => []);
    const reusable = history.find(item => item.status !== 'failed' && item.status !== 'cancelled' && item.registeredResults.length > 0);
    if (reusable) {
      run = reusable;
      reusedLatest = true;
    }
  }
  if (!run) {
    const canInline = Boolean(params.dataset && params.dataset.table.rows.length >= 10);
    const inlineDataset = canInline ? serializeDatasetForAutonomousSandbox(params.design, params.dataset) : null;
    const goalTitle = (params.design?.title || '').trim();
    run = await runAutonomousResearch(
      {
        goal: (goalTitle || '调研数据质量核查与核心机制检验').slice(0, 120),
        geography: '县域',
        datasetMode: inlineDataset ? 'inline_dataset' : 'planted_trap_benchmark',
        leaseMode: 'pi_autonomous',
        maxToolCalls: 28,
        projectId: params.projectId,
        inlineDataset,
      },
      {
        authenticated: true,
        projectId: params.projectId,
        csrfToken: params.csrfToken,
      },
      params.signal,
    );
  }
  const cleanHeadline = sanitizeAdvisorDisplayText(run.motherInsight?.headline ?? '') || '已完成核心分组对比与数据质量复核';
  const cleanMechanism = sanitizeAdvisorDisplayText(run.motherInsight?.paradoxDetail || run.motherInsight?.mechanism || '');
  const cleanPivots = (run.epistemicGraph?.pivot_log ?? [])
    .map(p => sanitizeAdvisorDisplayText(p.reason))
    .filter(Boolean);
  const pivotCount = run.epistemicGraph?.completeness?.pivotCount ?? cleanPivots.length;
  const reviewLabel = run.falsificationReport?.decision === 'approve' ? '复核通过（可直接采纳实证依据）' : '已标记待复核风险点';
  const conclusionPara = `本次实证核查在 ${run.datasetSummary.rawRowCount} 份回收样本中剔除异常记录后保留有效样本 n=${run.datasetSummary.cleanedRowCount}，结果表明${cleanHeadline.replace(/[。；\s]+$/u, '')}${cleanMechanism ? `，进一步分析显示${cleanMechanism.replace(/[。；\s]+$/u, '')}` : ''}${cleanPivots.length ? `；核查过程同步完成了${cleanPivots.slice(0, 2).join('与')}等统计修正` : ''}。`;
  const writeConclusionAction: AgentAction = {
    type: 'insertStudioBlock',
    node: 'conclusion.findings',
    title: '数据核查与核心研究结论',
    paragraphs: [conclusionPara],
  };
  const topSnapTitles = run.registeredResults
    .slice(0, 2)
    .map(r => sanitizeAdvisorDisplayText(r.title))
    .filter(Boolean)
    .join('、');

  return {
    cards: [{
      kind: 'tool',
      title: reusedLatest ? '深度数据分析与风险核查结论（已复用最新核验结果）' : '深度数据分析与风险核查结论',
      lines: [
        [
          span('有效样本 ', 'teal'),
          span(`${run.datasetSummary.cleanedRowCount} / ${run.datasetSummary.rawRowCount}`, 'gold'),
          span(' · 统计纠偏 ', 'dim'),
          span(`${pivotCount} 处`, 'gold'),
          span(' · 登记结果 ', 'dim'),
          span(`${run.registeredResults.length} 项`, 'gold'),
        ],
        [span('核心结论 ', 'teal'), span(cleanHeadline, 'strong')],
        ...(cleanMechanism ? [[span('分化机理 ', 'teal'), span(cleanMechanism.slice(0, 140))]] : []),
        ...(topSnapTitles ? [[span('主要证据 ', 'teal'), span(topSnapTitles, 'dim')]] : []),
        [span('质量门禁 ', 'teal'), span(reviewLabel, 'dim')],
      ],
      links: [
        { label: '一键写入核心结论', action: writeConclusionAction, primary: true },
        { label: '一键生成效应对比图', action: { type: 'say', text: '生成效应对比图' } },
        { label: '进入深度数据分析工作台', action: { type: 'href', href: '#research/analysis' } },
      ],
    }],
    chips: [
      { label: '一键写入核心结论', action: writeConclusionAction, primary: true },
      { label: '一键生成效应对比图', action: { type: 'say', text: '生成效应对比图' } },
      { label: '进入深度数据分析工作台', action: { type: 'href', href: '#research/analysis' } },
    ],
    replyLinesList: [[span(
      reusedLatest
        ? `已调取本项目最新一次完整数据质量核查与机制分析结果（有效样本 n=${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount}）。`
        : `已完成新一轮全流程数据质量核查与机制复核（有效样本 n=${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount}）。`,
    )]],
    execStatus: 'done',
    execAction: { type: 'href', href: '#research/analysis' },
    resultSummary: `样本 ${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount} · ${run.registeredResults.length} 项结果`,
    toolOutputText: [
      `已完成深度数据核查与机制分析（有效样本 ${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount}，统计纠偏 ${pivotCount} 处）。`,
      cleanHeadline,
      ...(cleanMechanism ? [cleanMechanism] : []),
      `复核状态为${reviewLabel}。`,
    ].join('\n'),
  };
}

async function executeChatGroundedAbstract(params: {
  projectId: string;
  signal: AbortSignal;
  projectTitle?: string;
  report?: EditorContent | null;
  design?: Questionnaire | null;
  dataset: Parameters<typeof serializeDatasetForAutonomousSandbox>[1];
}): Promise<ChatToolExecOutcome> {
  const { buildGroundedAbstractDraft, fetchAutonomousRuns } = await loadAutonomousAgent();
  const history = await fetchAutonomousRuns(params.projectId, { signal: params.signal }).catch(() => []);
  const latestRun = history.find(item => item.status !== 'failed' && item.status !== 'cancelled' && item.registeredResults.length > 0) ?? null;
  const draft = buildGroundedAbstractDraft({
    projectTitle: params.projectTitle,
    report: params.report,
    design: params.design,
    dataset: params.dataset,
    latestRun,
  });
  const writeAbstractAction: AgentAction = {
    type: 'insertStudioBlock',
    node: 'abstract',
    title: '执行摘要',
    paragraphs: draft.paragraphs,
  };
  const previewSnippet = draft.paragraphs[2] || draft.paragraphs[0] || '';
  return {
    cards: [{
      kind: 'tool',
      title: '基于已核验结果整理的执行摘要草稿',
      lines: [
        [span('事实依据 ', 'teal'), span(draft.evidenceSummary, 'gold')],
        [span('核心预览 ', 'teal'), span(previewSnippet.slice(0, 130) + (previewSnippet.length > 130 ? '…' : ''))],
        [span('关键词 ', 'teal'), span(draft.keywords.join('；'), 'dim')],
        ...(draft.isSimulated ? [[span('口径声明 ', 'teal'), span('含教学模拟数据，写入后将自动标注模拟说明', 'dim')]] : []),
      ],
      links: [
        { label: '一键写入报告摘要', action: writeAbstractAction, primary: true },
        { label: '前往报告查看排版', action: { type: 'stage', stage: 'paper' } },
      ],
    }],
    chips: [
      { label: '一键写入报告摘要', action: writeAbstractAction, primary: true },
      { label: '前往报告查看排版', action: { type: 'stage', stage: 'paper' } },
    ],
    replyLinesList: [[span(`已汇总${draft.evidenceSummary}，为您整理出执行摘要草稿。`)]],
    execStatus: 'done',
    execAction: { type: 'stage', stage: 'paper' },
    resultSummary: `已整理执行摘要草稿（${draft.keywords.length} 个关键词）`,
    toolOutputText: [
      `已基于${draft.evidenceSummary}整理出执行摘要草稿。`,
      ...draft.paragraphs,
    ].join('\n\n'),
  };
}

async function executeChatPreSubmissionAudit(
  report: EditorContent,
  design?: Questionnaire | null,
): Promise<ChatToolExecOutcome> {
  const { buildPreSubmissionAuditSummary } = await loadAutonomousAgent();
  const audit = buildPreSubmissionAuditSummary(report);
  const gapLines: Line[] = audit.topGaps.slice(0, 2).map(g => [
    span(`${g.status === 'fail' ? '待补关键项 ' : '建议完善 '} `, g.status === 'fail' ? 'error' : 'teal'),
    span(`${g.label}，${g.detail}`, 'dim'),
  ]);
  const lines: Line[] = [
    [span('完整度评分 ', 'teal'), span(`${audit.score} / 100（适用项通过 ${audit.passedChecks}/${audit.totalChecks}）`, 'strong')],
    [
      span('引用与文献 ', 'teal'),
      span(
        `${audit.danglingCount === 0 ? '无失效交叉引用' : `发现 ${audit.danglingCount} 处失效引用（${audit.danglingTitles.slice(0, 2).join('、')}）`} · 参考文献 ${audit.referenceCount} 篇${audit.metadataOnlyRefs > 0 ? `（其中 ${audit.metadataOnlyRefs} 篇建议核对正文支持页码）` : ''}`,
        audit.danglingCount > 0 ? 'error' : 'dim',
      ),
    ],
    [
      span('盲审匿名核查 ', 'teal'),
      span(
        audit.blindLeakHits.length === 0
          ? '未检出院校名称、导师姓名或学号等匿名泄密线索'
          : `疑似包含匿名敏感信息（${audit.blindLeakHits.join('、')}），提交盲审前请做匿名化处理`,
        audit.blindLeakHits.length > 0 ? 'error' : 'dim',
      ),
    ],
    ...(audit.formatNotices.length > 0 ? [[span('格式提醒 ', 'teal'), span(audit.formatNotices[0], 'dim')]] : []),
    ...gapLines,
  ];

  const actionPool: AgentLink[] = [];
  if (
    (audit.needsQuestionnaireAppendix && design && design.questions.length > 0) ||
    audit.needsDataAppendix
  ) {
    const { dataAppendix, questionnaireAppendix } = await loadReportAppendices();
    if (audit.needsQuestionnaireAppendix && design && design.questions.length > 0) {
      const qLines = questionnaireAppendix(design);
      if (qLines.length > 0) {
        actionPool.push({
          label: '一键补齐问卷附录',
          action: {
            type: 'insertStudioBlock',
            node: 'appendix.questionnaire',
            title: '调查问卷附录',
            paragraphs: [qLines.join('\n')],
          },
        });
      }
    }
    if (audit.needsDataAppendix) {
      const dLines = dataAppendix(report);
      if (dLines.length > 0) {
        actionPool.push({
          label: '一键补齐数据处理说明附录',
          action: {
            type: 'insertStudioBlock',
            node: 'appendix.data',
            title: '数据与处理说明附录',
            paragraphs: [dLines.join('\n')],
          },
        });
      }
    }
  }
  if (audit.needsAbstract) {
    actionPool.push({ label: '一键汇总执行摘要', action: { type: 'say', text: '汇总当前结果生成执行摘要' } });
  }
  if (audit.needsResults) {
    actionPool.push({ label: '执行数据质量与稳健分析', action: { type: 'say', text: '自动核查数据质量' } });
  } else if (audit.needsFindings) {
    actionPool.push({ label: '运行 Mann-Whitney 检验并登记发现', action: { type: 'say', text: '运行 Mann-Whitney 秩和检验' } });
  }
  if (audit.needsReferences) {
    actionPool.push({ label: '打开文献核验工作台', action: { type: 'stage', stage: 'paper' } });
  }
  actionPool.push({ label: '打开提交前体检工作台', action: { type: 'open', room: 'preflight' } });
  actionPool.push({ label: '前往报告查看细节', action: { type: 'stage', stage: 'paper' } });

  const dedupedLinks: AgentLink[] = [];
  for (const item of actionPool) {
    if (!dedupedLinks.some(existing => existing.label === item.label)) {
      dedupedLinks.push(dedupedLinks.length === 0 ? { ...item, primary: true } : item);
    }
  }

  return {
    cards: [{
      kind: 'tool',
      title: '交稿前合规与证据完整性体检报告',
      lines,
      links: dedupedLinks.slice(0, 4),
    }],
    chips: dedupedLinks.slice(0, 4),
    replyLinesList: [[span(`已完成交稿前综合体检（证据完整度 ${audit.score}/100，适用项通过 ${audit.passedChecks}/${audit.totalChecks}）。`)]],
    execStatus: 'done',
    execAction: { type: 'open', room: 'preflight' },
    resultSummary: `合规体检 ${audit.score}/100 · 通过 ${audit.passedChecks}/${audit.totalChecks}`,
    toolOutputText: [
      `已完成交稿前综合体检，完整度 ${audit.score}/100，适用检查通过 ${audit.passedChecks}/${audit.totalChecks}。`,
      `交叉引用失效 ${audit.danglingCount} 处，参考文献 ${audit.referenceCount} 篇，盲审敏感词命中 ${audit.blindLeakHits.length} 处。`,
    ].join('\n'),
  };
}

function parseJsonObjectFromReply(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const candidates = [fenced?.[1]?.trim(), cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  for (const item of candidates) {
    if (!item) continue;
    try {
      const parsed = JSON.parse(item) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* try next candidate */ }
  }
  return null;
}

function buildLocalQuestionnaireFromReply(brief: string, rawReply: string): Questionnaire {
  const base = newQuestionnaire();
  const parsed = parseJsonObjectFromReply(rawReply);
  const shortTopic = brief.replace(/^课题[：:]\s*/u, '').split(/[。；\n]/u)[0]?.trim().slice(0, 32) || '专题调研';
  const title = typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 60) : `${shortTopic}调查问卷`;
  const objective = typeof parsed?.objective === 'string' && parsed.objective.trim() ? parsed.objective.trim() : `围绕“${brief.slice(0, 100)}”评估核心构念、消费偏好与改进驱动路径。`;
  const population = typeof parsed?.population === 'string' && parsed.population.trim() ? parsed.population.trim() : '目标受众及潜在消费群体';
  const introduction = typeof parsed?.introduction === 'string' && parsed.introduction.trim()
    ? parsed.introduction.trim()
    : '您好！我们正在开展一项学术市场调查，所有作答严格匿名且仅用于统计分析，预计占用您 3~5 分钟，衷心感谢您的配合！';
  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const validTypes = new Set<QuestionType>(['single', 'multi', 'likert', 'number', 'text']);
  const validAnalyses = new Set<AnalysisPlan>(['undecided', 'description', 'comparison', 'association', 'measurement', 'coding', 'routing']);
  const questions: DesignQuestion[] = rawQuestions
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim().length > 0)
    .slice(0, 20)
    .map((item, idx) => {
      const varCode = `Q${idx + 1}`;
      const q = newQuestion(`ai-draft-${Date.now().toString(36)}-${idx + 1}`, varCode);
      const qType = typeof item.type === 'string' && validTypes.has(item.type as QuestionType) ? (item.type as QuestionType) : 'single';
      const purpose = item.purpose === 'screening' || item.purpose === 'background' ? item.purpose : 'research';
      const analysis = typeof item.analysis === 'string' && validAnalyses.has(item.analysis as AnalysisPlan) ? (item.analysis as AnalysisPlan) : (qType === 'likert' ? 'measurement' : qType === 'text' ? 'coding' : purpose === 'screening' ? 'routing' : 'description');
      const rawChoices = Array.isArray(item.choices) ? item.choices : [];
      const choices = rawChoices
        .map((c, ci) => {
          if (typeof c === 'string' && c.trim()) return { code: String(ci + 1), label: c.trim() };
          if (c && typeof c === 'object' && typeof (c as { label?: unknown }).label === 'string') {
            return { code: String((c as { code?: unknown }).code ?? ci + 1), label: String((c as { label: string }).label).trim() };
          }
          return null;
        })
        .filter((c): c is { code: string; label: string } => !!c && c.label.length > 0);
      return {
        ...q,
        variable: varCode,
        text: String(item.text).trim(),
        type: qType,
        required: true,
        purpose,
        researchQuestion: typeof item.researchQuestion === 'string' ? item.researchQuestion.trim() : brief.slice(0, 48),
        construct: typeof item.construct === 'string' && item.construct.trim() ? item.construct.trim() : (purpose === 'screening' ? '样本甄别' : purpose === 'background' ? '人口学特征' : '核心测量构念'),
        analysis,
        decisionUse: typeof item.decisionUse === 'string' && item.decisionUse.trim() ? item.decisionUse.trim() : '用于核心群体对比与回归/聚类分析',
        source: '智能助手起草',
        choices: qType === 'single' || qType === 'multi' ? (choices.length >= 2 ? choices : q.choices) : [],
        min: qType === 'likert' ? 1 : qType === 'number' ? 0 : null,
        max: qType === 'likert' ? 5 : null,
        minLabel: qType === 'likert' ? (typeof item.minLabel === 'string' && item.minLabel.trim() ? item.minLabel.trim() : '非常不同意') : '',
        maxLabel: qType === 'likert' ? (typeof item.maxLabel === 'string' && item.maxLabel.trim() ? item.maxLabel.trim() : '非常同意') : '',
      };
    });

  if (!questions.length) {
    const q1 = { ...newQuestion('draft-q1', 'Q1'), text: `请问您近期是否接触或消费过“${brief.slice(0, 24)}”相关产品或服务？`, type: 'single' as const, purpose: 'screening' as const, construct: '准入甄别', analysis: 'routing' as const, decisionUse: '过滤非目标受访者，保证样本口径纯净', choices: [{ code: '1', label: '是，近半年内有过体验' }, { code: '2', label: '曾了解但未实际体验' }, { code: '3', label: '从未听说（终止作答）' }], required: true };
    const q2 = { ...newQuestion('draft-q2', 'Q2'), text: '您的年龄段属于？', type: 'single' as const, purpose: 'background' as const, construct: '人口统计学基线', analysis: 'description' as const, decisionUse: '与统计年鉴人口结构核对加权', choices: [{ code: '1', label: '18~25 岁' }, { code: '2', label: '26~35 岁' }, { code: '3', label: '36~45 岁' }, { code: '4', label: '46 岁及以上' }], required: true };
    const q3 = { ...newQuestion('draft-q3', 'Q3'), text: '整体而言，该品类或服务的核心品质与性价比达到我的预期。', type: 'likert' as const, purpose: 'research' as const, construct: '感知价值与品质', researchQuestion: brief.slice(0, 40), analysis: 'measurement' as const, decisionUse: 'CFA/SEM 潜变量测度与满意度归因', min: 1, max: 5, minLabel: '非常不同意', maxLabel: '非常同意', choices: [], required: true };
    const q4 = { ...newQuestion('draft-q4', 'Q4'), text: '如果身边亲友询问类似消费选择，我愿意主动推荐该产品或品牌。', type: 'likert' as const, purpose: 'research' as const, construct: '口碑推荐意愿', researchQuestion: brief.slice(0, 40), analysis: 'association' as const, decisionUse: '复购与推荐转化路径预测', min: 1, max: 5, minLabel: '非常不愿意', maxLabel: '非常愿意', choices: [], required: true };
    const q5 = { ...newQuestion('draft-q5', 'Q5'), text: '针对现有体验中您最不满意的一个细节，您希望品牌方如何改进？', type: 'text' as const, purpose: 'research' as const, construct: '开放性痛点洞察', researchQuestion: brief.slice(0, 40), analysis: 'coding' as const, decisionUse: '质性主题聚类补全量表盲区', choices: [], required: false };
    questions.push(q1, q2, q3, q4, q5);
  }
  return { ...base, title, objective, population, introduction, questions };
}

let brainStatusProbe: Promise<BrainStatus> | null = null;
function readBrainStatusOnce(): Promise<BrainStatus> {
  if (!brainStatusProbe) {
    brainStatusProbe = fetchBrainStatus().catch(err => {
      brainStatusProbe = null;
      throw err;
    });
  }
  return brainStatusProbe;
}

/**
 * 证见 Agent, laid out like Codex: an icon rail, a sidebar of projects and conversations, one conversation in the
 * middle, and every workbench module opening in a panel on the right, kept mounted once opened. The panel follows the
 * address hash, so a module that moves the user on (analysis sending a result to the report) moves the panel too.
 */
export default function AgentShell() {
  const knowledge = useKnowledge();
  const theme = useThemePreference('light');
  const { session: account, loading: accountLoading, error: sessionError, logout, refresh, mutate, identityEpoch, isCurrentAccount, isCurrentIdentity } = useHostedSession();
  const [accountNotice, setAccountNotice] = useState('');
  // Conversations belong to whoever is signed in; they are bound once the session is known and never shown to another.
  const owner = accountLoading ? null : account?.authenticated && account.user?.id ? account.user.id : 'guest';
  useEffect(() => { if (owner) threads.bind(owner); }, [owner]);
  const book = useSyncExternalStore(threads.subscribe, () => threads.view(owner), threads.serverSnapshot);
  const thread = book.threads.find(t => t.id === book.active) ?? null;
  const projectId = thread ? thread.projectId : book.draftProject;
  const displayScope: ReportRunScope = { owner: owner === 'guest' ? null : owner, epoch: identityEpoch, thread: thread?.id ?? null, project: projectId };
  const readReportScope = useCallback((): ReportRunScope => {
    const live = threads.view(owner), selected = live.threads.find(item => item.id === live.active);
    return { owner: owner && owner !== 'guest' && isCurrentAccount(owner, identityEpoch) ? owner : null, epoch: identityEpoch,
      thread: selected?.id ?? null, project: selected ? selected.projectId : live.draftProject };
  }, [owner, identityEpoch, isCurrentAccount]);
  const readWorkspaceIdentity = useCallback((): WorkspaceIdentity => {
    const live = threads.view(owner), selected = live.threads.find(item => item.id === live.active);
    return { owner: owner && isCurrentIdentity(owner === 'guest' ? null : owner, identityEpoch) ? owner : null,
      epoch: identityEpoch, thread: selected?.id ?? null, project: selected ? selected.projectId : live.draftProject };
  }, [owner, identityEpoch, isCurrentIdentity]);
  const agentHash = useSyncExternalStore(subscribeHash, currentHash, serverHash);
  const researchStage = researchStageFromHash(agentHash);
  const [researchStageVisit, setResearchStageVisit] = useState(0);
  const researchOverview = agentHash === RESEARCH_OVERVIEW_HASH;
  const explicitChat = agentHash === CHAT_HASH;
  const { panels, view, reportSource, publishProposal, sendToReport, tweakFigure, loadBenchmark, applyCandidate, reportVersions, restoreReportVersion, readRevisionSnapshot, reviseSection, applyArtifact, research, sendSiliconToAnalysis } = useWorkbenchModules(true, projectId, researchStage, researchStageVisit);
  const reportScope = `${owner ?? 'loading'}:${identityEpoch}:${projectId ?? 'local'}`;
  const activeReportRun = useRef<ReportRunHandle | null>(null);
  const preparingReport = useRef<{ id: string; scope: ReportRunScope } | null>(null);
  const [candidate, setCandidate] = useState<ReportCandidate | null>(null);
  const [lockedSections, setLockedSections] = useState<{ runId: string; ids: string[] }>({ runId: '', ids: [] });
  const [reviewNotice, setReviewNotice] = useState('');
  const visibleCandidate = candidate?.scope === reportScope && candidate.threadId === book.active ? candidate : null;
  const sourceKey = useMemo(() => reportSourceKey(reportSource), [reportSource]);
  const candidateConflict = !!visibleCandidate && (visibleCandidate.sourceKey !== sourceKey || !!reportSource.inputPending);
  const candidateChanges = useMemo(() => visibleCandidate ? reportChanges(visibleCandidate.before, visibleCandidate.preview) : [], [visibleCandidate]);
  const lockedSectionIds = useMemo(
    () => (lockedSections.runId === visibleCandidate?.runId ? lockedSections.ids : []),
    [lockedSections, visibleCandidate],
  );
  // Remove the legacy direct-key slot; credentials are entered only in the hosted model-service form.
  useEffect(() => { try { window.sessionStorage.removeItem('evix.agent.direct-api-key.v1'); } catch { /* no browser storage */ } }, []);
  const messages = thread?.messages ?? EMPTY_MESSAGES;
  const panel = useSyncExternalStore(subscribeHash, currentPanel, () => null);
  const outputId = useSyncExternalStore(subscribeHash, currentOutput, () => null);
  const [showCode, setShowCode] = useShowCode(owner);
  const [preferredStage, setPreferredStage] = useStage(owner);
  const stage = researchStage === 'report' ? 'paper' : researchOverview || explicitChat ? 'chat' : preferredStage;
  const setStage = useCallback((next: typeof preferredStage) => {
    const hash = window.location.hash;
    if (((hash === RESEARCH_OVERVIEW_HASH || hash === CHAT_HASH) && next !== 'chat') || (researchStageFromHash(hash) === 'report' && next !== 'paper')) {
      window.location.hash = '';
    }
    setPreferredStage(next);
  }, [setPreferredStage]);
  const [hired, setHired] = useHired(owner);
  // In the report stage the conversation is a copilot card; it starts folded to a pill, as an assistant waits to be asked.
  const [copilotOpen, setCopilotOpen] = useState(false);
  const researchOpen = researchOverview || (!agentHash && !messages.length && stage === 'chat');
  const displayedResearchStage = researchStage ?? (panel ? defaultResearchStage(panel) : stage === 'paper' ? 'report' : null);
  const [benchStation, setBenchStation] = useState<WorkKind>('survey');
  const [theaterConfig, setTheaterConfig] = useState<{
    open: boolean;
    topic: string;
    templateKey: SiliconTemplateKey;
    size: number;
    seed: number;
    customDesign: Questionnaire | null;
    playKey: number;
  }>({
    open: false,
    topic: '',
    templateKey: 'residents',
    size: 24,
    seed: 2026,
    customDesign: null,
    playKey: 0,
  });
  const [theaterTopicDesign, setTheaterTopicDesign] = useState<{ topic: string; design: Questionnaire } | null>(null);
  const [siliconRuntime, setSiliconRuntime] = useState<SiliconRuntimeBundle | null>(() => cachedSiliconRuntime);
  const [pickedSection, setPickedSection] = useState<string | null>(null);
  const [docFormat, setDocFormat] = useState<DocFormatMode>('latex');
  const [activeStudio, setActiveStudio] = useState<StudioTabId | null>(null);
  const [steeringNotes, setSteeringNotes] = useState<string[]>([]);
  const [quickSteeringDraft, setQuickSteeringDraft] = useState('');
  const [heroTopicDraft, setHeroTopicDraft] = useState('');
  const [annotations, setAnnotations] = useState<PaperAnnotation[]>([]);
  const [qaHighlightTerms, setQaHighlightTerms] = useState<string[]>([]);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const [customBrain, setCustomBrain] = useState<CustomBrainOverride | null>(null);
  const [brainModalOpen, setBrainModalOpen] = useState(false);
  const [brainPresetDraft, setBrainPresetDraft] = useState<BrainPresetId>('deepseek');
  const [brainModelDraft, setBrainModelDraft] = useState('');
  const [brainKeyDraft, setBrainKeyDraft] = useState('');
  const brainAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    readBrainStatusOnce().then(status => { if (alive) setBrainStatus(status); }).catch(() => {});
    return () => {
      alive = false;
      brainAbortRef.current?.abort();
    };
  }, []);
  const effectiveBrain = useMemo(() => {
    if (customBrain?.apiKey?.trim()) {
      const preset = customBrain.preset;
      const provider = preset === 'openai' ? 'OpenAI' : preset === 'qwen' ? '通义千问' : 'DeepSeek';
      const defaultModel = preset === 'openai' ? 'gpt-4o-mini' : preset === 'qwen' ? 'qwen-plus' : 'deepseek-chat';
      return {
        available: true,
        preset,
        provider,
        model: customBrain.model?.trim() || defaultModel,
        source: 'custom' as const,
      };
    }
    if (brainStatus?.available) {
      return {
        available: true,
        preset: 'deepseek' as BrainPresetId,
        provider: brainStatus.provider,
        model: customBrain?.model?.trim() || brainStatus.model,
        source: customBrain?.model?.trim() ? ('custom' as const) : ('env' as const),
      };
    }
    return {
      available: false,
      preset: 'deepseek' as BrainPresetId,
      provider: '基础模式',
      model: '内置向导',
      source: 'offline' as const,
    };
  }, [brainStatus, customBrain]);
  // Only requests dispatched in this mounted workspace may animate. Restored messages are records, not live jobs.
  const [activeCalls, setActiveCalls] = useState<{ id: string; owner: string; epoch: number }[]>([]);
  const startCall = useCallback((id: string, owner: string, epoch: number) => {
    setActiveCalls(calls => [...calls.filter(call => call.id !== id), { id, owner, epoch }]);
  }, []);
  const finishCall = useCallback((id: string) => setActiveCalls(calls => calls.filter(call => call.id !== id)), []);

  const [writingEnvelope, setWritingEnvelope] = useState<{ scope: ReportRunScope; status: LiveWritingStatus } | null>(null);
  const [workflowWorkState, setWorkflowWorkState] = useState<ReportWorkState | null>(null);
  const liveWriting = writingEnvelope && sameReportRunScope(writingEnvelope.scope, displayScope) ? writingEnvelope.status : null;
  const setReportWriting = useCallback((scope: ReportRunScope, update: LiveWritingStatus | null | ((previous: LiveWritingStatus) => LiveWritingStatus)) => {
    setWritingEnvelope(previous => {
      if (typeof update === 'function') return previous && sameReportRunScope(previous.scope, scope) ? { ...previous, status: update(previous.status) } : previous;
      return update ? { scope: { ...scope }, status: update } : previous && sameReportRunScope(previous.scope, scope) ? null : previous;
    });
  }, []);
  const autoFollowRef = useRef(true);
  const toggleAutoFollow = useCallback(() => {
    autoFollowRef.current = !autoFollowRef.current;
    setReportWriting(readReportScope(), previous => ({ ...previous, autoFollow: autoFollowRef.current }));
  }, [readReportScope, setReportWriting]);
  const pauseAutoFollowOnUserScroll = useCallback(() => {
    if (!liveWriting?.active || !autoFollowRef.current) return;
    autoFollowRef.current = false;
    setReportWriting(readReportScope(), previous => ({ ...previous, autoFollow: false }));
  }, [liveWriting?.active, readReportScope, setReportWriting]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.dataset.evixPickedSection = pickedSection ?? '';
    window.dispatchEvent(new CustomEvent('evix:picked-section', { detail: pickedSection }));
  }, [pickedSection]);
  // Before any report exists in this browser the paper shows the blank template, as the editor would open it.
  const [blankReport] = useState(createEditorContent);
  const [mobileTheaterControls, setMobileTheaterControls] = useState(false);
  const shortcut = useSyncExternalStore(subscribeNothing, searchKey, () => '⌘K');
  const [expanded, setExpanded] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false), [artifactNotice, setArtifactNotice] = useState<string | null>(null);
  const go = useCallback((id: RoomId) => {
    if (id === 'services') { setArtifactOpen(false); setExpanded(true); }
    if (currentPanel() !== id) window.location.hash = id;
  }, [setExpanded]);
  const closePanel = useCallback(() => { window.location.hash = ''; }, []);
  const generation = useGeneration(publishProposal, go, projectId);
  const { account: generationAccount, load: loadLists, lists } = generation;
  // Projects and services fill the sidebar and the composer's menus as soon as an account is known.
  useEffect(() => { if (generationAccount === 'ready') loadLists(); }, [generationAccount, loadLists]);
  const projects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of lists.projects) {
      const key = p.title.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return lists.projects.map(p => {
      const key = p.title.trim();
      if ((counts.get(key) ?? 0) <= 1) return { id: p.id, label: p.title, rawTitle: p.title };
      const shortId = p.id.replace(/-/g, '').slice(0, 4) || p.id.slice(0, 4);
      return { id: p.id, label: `${p.title} #${shortId}`, rawTitle: p.title };
    });
  }, [lists.projects]);
  const activeProject = projects.find(p => p.id === projectId);
  const projectLabel = activeProject ? `${activeProject.label}` : undefined;
  // The report is re-scored as it is typed; deferring keeps typing in the editor ahead of the benchmark.
  const deferredView = useDeferredValue(view);
  const light = useMemo(() => illuminate(deferredView), [deferredView]);
  const basePaperContent = visibleCandidate?.preview ?? view.report ?? blankReport;
  const paperContent = useMemo(() => {
    if (projectLabel && (!basePaperContent.title.trim() || basePaperContent.title === blankReport.title)) {
      return { ...basePaperContent, title: projectLabel };
    }
    return basePaperContent;
  }, [basePaperContent, blankReport.title, projectLabel]);
  const paperRef = useRef<HTMLDivElement>(null);
  const stageMotionKey = stage === 'chat' && researchOpen ? 'overview' : stage;
  const { direction: stageDirection } = useStageDirection(stageMotionKey);
  const lightPulsing = useIlluminationPulse(light.overall);
  const stageSwitchIds = useMemo(() => ['chat', 'paper', 'advisors', 'library'] as const, []);
  const stageSwitchRef = useKeyedListMotion<HTMLSpanElement>({
    ids: stageSwitchIds,
    activeId: stage === 'chat' ? (researchOpen ? null : 'chat') : stage,
    markerAxis: 'horizontal',
  });

  // The report check runs on whatever the paper shows, the blank template included, so the inspector always has a score.
  const paperBenchmark = useMemo(() => benchmarkReport(paperContent), [paperContent]);
  const rawInspecting = stage === 'paper' && !panel && !outputId;
  // A section picked from the outline is scrolled into view on the paper.
  const pickSection = useCallback((id: string) => {
    setPickedSection(id);
    if (typeof window !== 'undefined' && window.getSelection()?.toString().trim()) return;
    const box = paperRef.current, target = box?.querySelector<HTMLElement>(`[data-report-section="${CSS.escape(id)}"]`);
    if (box && target) {
      const bounds = box.getBoundingClientRect(), toolbar = box.querySelector<HTMLElement>('[data-report-toolbar]');
      const inset = Math.max(24, (toolbar?.getBoundingClientRect().bottom ?? bounds.top) - bounds.top + 16);
      box.scrollTo({ top: Math.max(0, box.scrollTop + target.getBoundingClientRect().top - bounds.top - inset),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, []);
  const choreo = useLiveReportChoreography(paperRef, paperContent, pickSection);
  // In the report, [ and ] step to the previous and next section, as a reader pages through.
  const stepSection = useCallback((by: number) => {
    if (stage !== 'paper') return;
    const list = paperContent.report; if (!list.length) return;
    const at = list.findIndex(sec => sec.id === pickedSection);
    const next = list[Math.max(0, Math.min(list.length - 1, at < 0 ? (by > 0 ? 0 : list.length - 1) : at + by))];
    pickSection(next.id);
  }, [stage, paperContent, pickedSection, pickSection]);

  const traces = useMemo(() => traceExhibits(deferredView.report, deferredView.design), [deferredView]);
  // The plan makes room for the sections the registered results belong in.
  const plan = useMemo(() => deferredView.report ? reportPlan(deferredView.report, light.benchmark, (deferredView.report.quality?.results ?? []).map(suggestedNode)) : null, [deferredView, light]);
  const held = useMemo<ResultsView>(() => {
    const report = deferredView.report, results = report?.quality?.results ?? [];
    return report ? { results, findings: report.quality?.findings ?? [], pending: deferredView.resultPending, placed: results.filter(r => resultPlaced(report, r)).map(r => r.id) } : null;
  }, [deferredView]);

  // A result opened beside the conversation, while no module holds the panel and the result is known in this visit.
  const output = !panel && outputId ? held?.results.find(r => r.id === outputId) ?? null : null;
  const [visited, setVisited] = useState<RoomId[]>([]);
  if (stage === 'paper' && !visited.includes('editor')) setVisited([...visited, 'editor']);
  if (panel && panel !== 'overview' && !visited.includes(panel)) setVisited([...visited, panel]);
  const [railMenu, setRailMenu] = useState<'modules' | 'account' | null>(null);
  // Workbench modules are laid out for a whole screen. While a panel or right inspector is open on a tight screen the sidebar folds
  // to give it room and comes back when closed; what the user chooses in either state is kept for that state.
  const viewport = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
  const crowded = viewport < 960 || ((!!panel || !!output || artifactOpen) && viewport < 1680) || (rawInspecting && viewport < (activeStudio ? 1680 : 1480));
  const [sideAlone, setSideAlone] = useState(true), [sideBeside, setSideBeside] = useState(false);
  const sideOpen = crowded ? sideBeside : sideAlone;
  const setSideOpen = crowded ? setSideBeside : setSideAlone;
  // The writing inspector stands where the module panel would, yielding when the 412px studio is open on tight 1440px screens.
  const inspecting = rawInspecting && !(sideOpen && !!activeStudio && viewport < 1600);
  // The panel takes seven tenths of the room beside the sidebar, or the width last dragged to, and always leaves the
  // conversation its minimum. Widths are read through stores so the first client render matches the server's.
  const savedWidth = useSyncExternalStore(subscribeNothing, savedPanelWidth, () => null);
  const [draggedWidth, setPanelWidth] = useState<number | null>(null);
  const room = viewport - RAIL - GUTTERS - (sideOpen ? (activeStudio ? 412 : SIDEBAR) : 0);
  const available = Math.max(MIN_PANEL, room - MIN_TALK);
  const panelWidth = Math.min(available, draggedWidth ?? savedWidth ?? Math.round(Math.min(1240, Math.max(MIN_PANEL, room * 0.7))));
  const [dragging, setDragging] = useState(false);
  const [lastPanel, setLastPanel] = useState<{ room: RoomId; hash: string } | null>(null);
  const [lastModule, setLastModule] = useState('#overview');
  const [shownHash, setShownHash] = useState(serverHash);
  const [canvasReturn, setCanvasReturn] = useState<{ nodeId: string; title: string } | null>(null);
  const [canvasFocus, setCanvasFocus] = useState<{ nodeId: string; token: number } | null>(null);
  if (shownHash !== agentHash) {
    setShownHash(agentHash);
    if (panel) setLastPanel({ room: panel, hash: agentHash });
    if (panel && panel !== 'canvas') setLastModule(agentHash);
    if (researchStage) setExpanded(!!panel);
    else if (!panel || (panel !== 'services' && researchStageFromHash(shownHash))) setExpanded(false);
  }

  const inputRef = useRef<HTMLTextAreaElement>(null), scrollRef = useRef<HTMLDivElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  const railRef = useRef<HTMLElement>(null), launcherRef = useRef<HTMLDivElement>(null), modulesRef = useRef<HTMLButtonElement>(null);
  // A module picked from the launcher takes focus at its heading once the launcher has closed, the open one included,
  // so the keyboard goes on into it rather than losing its place.
  const focusPicked = useRef(false);
  useEffect(() => {
    if (railMenu || !focusPicked.current || !panel) return;
    focusPicked.current = false;
    headingRef.current?.focus();
  }, [railMenu, panel]);
  // The launcher takes focus when it opens, on the module already open or else the first, so the keyboard starts there.
  useEffect(() => {
    const launcher = launcherRef.current;
    if (railMenu === 'modules') (launcher?.querySelector<HTMLButtonElement>('button[aria-current="true"]') ?? launcher?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [railMenu]);
  // The rail's menus close on a click outside the rail, as the composer's menus do.
  useEffect(() => {
    if (!railMenu) return;
    const away = (event: PointerEvent) => { if (!railRef.current?.contains(event.target as Node)) setRailMenu(null); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [railMenu]);
  // Every way to the input goes through here. While the panel fills the screen the input is hidden, so the conversation
  // comes back first, synchronously, and a "/" typed to get there still lands in it.
  const focusInput = useCallback(() => {
    if (inputRef.current?.offsetParent === null) flushSync(() => { setExpanded(false); setCopilotOpen(true); });
    inputRef.current?.focus();
  }, [setExpanded, setCopilotOpen]);
  const pick = (id: RoomId) => { focusPicked.current = true; setRailMenu(null); go(id); };
  // Talking with a model is the user's choice, for this visit; every conversation asks once before its first sentence goes.
  // Without storage the choice is still kept for this page, in memory.
  // It belongs to the identity that chose it; another identity reads its own.
  const [modeHere, setModeHere] = useState<{ owner: string | null; mode: ChatMode } | null>(null);
  const storedMode = useSyncExternalStore(subscribeMode, () => readMode(owner), () => 'command' as ChatMode);
  const chatMode = modeHere && modeHere.owner === owner ? modeHere.mode : storedMode;
  const setChatMode = useCallback((mode: ChatMode) => { setModeHere({ owner, mode }); writeMode(owner, mode); }, [owner]);
  const consented = useRef(new Set<string>());
  const stagePreferences=useSyncExternalStore(subscribeModelPreferences,()=>getStageModelPreferences(owner),getServerStageModelPreferences);
  const chatService = resolveStageModelRoute('research.conversation', lists.services, stagePreferences).service;
  const reportService = resolveStageModelRoute('report.revision', lists.services, stagePreferences).service;
  const writingModelStatus = useMemo<WritingModelStatus>(
    () => ({
      offline: !!sessionError,
      authenticated: generationAccount === 'ready',
      reportServiceLabel: reportService ? `${reportService.label}（${reportService.model}）` : null,
    }),
    [sessionError, generationAccount, reportService],
  );
  const journeyModelRoutes = useMemo<Partial<Record<ModelCallId, JourneyModelRoute>>>(() => Object.fromEntries(MODEL_CALL_IDS.map(call => {
    const selected = resolveStageModelRoute(call, lists.services, stagePreferences);
    const source: JourneyModelRoute['source'] = selected.reason === 'stale_selection' || selected.reason === 'no_eligible' || selected.reason === 'unselected'
      ? selected.reason : selected.selectionSource === 'step' ? 'step' : selected.selectionSource === 'capability' ? 'task'
        : selected.selectionSource === 'default' ? 'default' : 'only_eligible';
    return [call, { selectedServiceId: stagePreferences.steps[call] ?? null, effectiveServiceId: selected.service?.id ?? null, source }];
  })), [lists.services, stagePreferences]);
  const openResearchStage = useCallback((id: ResearchStageId) => {
    setArtifactOpen(false);
    setRailMenu(null);
    const hash = researchStageHash(id);
    if (window.location.hash === hash) setResearchStageVisit(visit => visit + 1);
    else window.location.hash = hash;
  }, []);
  const openChat = () => {
    if (!panel && !outputId) {
      if (!explicitChat) window.location.assign(CHAT_HASH);
    } else {
      setStage('chat');
    }
  };
  const openResearchOverview = useCallback(() => {
    setArtifactOpen(false);
    setCopilotOpen(false);
    setExpanded(false);
    setRailMenu(null);
    if (window.location.hash !== RESEARCH_OVERVIEW_HASH) window.location.hash = RESEARCH_OVERVIEW_HASH;
    else scrollRef.current?.scrollTo({ top: 0 });
  }, [setExpanded, setCopilotOpen]);
  useEffect(() => {
    if (researchOverview) scrollRef.current?.scrollTo({ top: 0 });
  }, [researchOverview]);

  const revisionScope = useCallback((): ReportRunScope => {
    const b = threads.view(owner), t = b.threads.find(item => item.id === b.active);
    if (!owner || owner === 'guest' || !isCurrentAccount(owner, identityEpoch)) return { owner: null, epoch: identityEpoch, thread: t?.id ?? null, project: t ? t.projectId : b.draftProject };
    return { owner, epoch: identityEpoch, thread: t?.id ?? null, project: t ? t.projectId : b.draftProject };
  }, [owner, identityEpoch, isCurrentAccount]);
  const openRevisionSettings = useCallback(() => go('services'), [go]);
  const revision = useSectionRevision({
    sectionId: pickedSection, scope: { owner: owner === 'guest' ? null : owner, epoch: identityEpoch, thread: thread?.id ?? null, project: projectId }, service: reportService, design: view.design,
    readScope: revisionScope, readSnapshot: readRevisionSnapshot, apply: reviseSection,
    mountEditor: () => setVisited(v => v.includes('editor') ? v : [...v, 'editor']),
    openSettings: openRevisionSettings, mutate, disabled: !!liveWriting?.active || !!visibleCandidate, disabledReason: visibleCandidate ? '请先采纳或关闭整稿候选，再修订当前报告。' : undefined, readDisabled: () => !!activeReportRun.current || !!preparingReport.current,
  });

  const draftWriter=useRef<{scope:string;write:(text:string)=>boolean}|null>(null);
  const artifactThreadId=`${thread?.id??''}`;
  const artifactProjectId=projectId==null?null:`${projectId}`;
  const composerScope=useMemo(()=>JSON.stringify([owner,identityEpoch,artifactThreadId,artifactProjectId]),[owner,identityEpoch,artifactThreadId,artifactProjectId]);
  const registerDraftWriter=useCallback((write:(text:string)=>boolean)=>{
    const registration={scope:composerScope,write};draftWriter.current=registration;
    return()=>{if(draftWriter.current===registration)draftWriter.current=null;};
  },[composerScope]);
  const readArtifactCurrent=useCallback(()=>{
    const b=threads.view(owner),t=b.threads.find(item=>item.id===b.active),actualProject=t?t.projectId:b.draftProject;
    const fresh=!!owner&&isCurrentIdentity(owner==='guest'?null:owner,identityEpoch)&&(b.active??'')===artifactThreadId&&actualProject===artifactProjectId;
    return {scope:fresh?artifactScope(owner!,artifactProjectId):null,content:readRevisionSnapshot()?.content??view.report,sectionId:pickedSection,blocked:!!activeReportRun.current||!!preparingReport.current||!!visibleCandidate};
  },[owner,identityEpoch,isCurrentIdentity,artifactThreadId,artifactProjectId,readRevisionSnapshot,view.report,pickedSection,visibleCandidate]);
  const prefillArtifactCommand=useCallback((text:string)=>{
    const captured=readArtifactCurrent().scope,registration=draftWriter.current;if(!captured||!registration)return;
    setArtifactNotice(null);setCopilotOpen(true);if(stage==='advisors'||stage==='library')setStage('chat');
    window.requestAnimationFrame(()=>{if(readArtifactCurrent().scope!==captured||draftWriter.current!==registration)return;if(registration.scope!==composerScope||!registration.write(text))setArtifactNotice('输入框暂时无法加入指令，请保留现有草稿后重试。');});
  },[readArtifactCurrent,stage,setStage,composerScope,setCopilotOpen]);
  const stableArtifactCandidate=useMemo(()=>visibleCandidate?.result&&!visibleCandidate.pending&&!visibleCandidate.failed?{id:visibleCandidate.runId,report:visibleCandidate.preview}:null,[visibleCandidate]);
  const sectionArtifactCandidate=useMemo(()=>revision.artifactCandidate?{id:revision.artifactCandidate.id,seed:sectionRevisionArtifact(revision.artifactCandidate)}:null,[revision.artifactCandidate]);
  const artifacts=useArtifactLibrary({owner,projectId,content:view.report,candidate:stableArtifactCandidate,sectionCandidate:sectionArtifactCandidate,selectedSectionId:pickedSection,readCurrent:readArtifactCurrent,apply:applyArtifact,onSay:prefillArtifactCommand});
  const examplePending=useRef(false);
  const addInfographicExample=useCallback(async()=>{
    const captured=readArtifactCurrent().scope;if(!captured||examplePending.current)return;
    const existing=artifacts.items.find(item=>item.origin==='内置示例');if(existing){artifacts.onSelect(existing.id);return;}
    examplePending.current=true;setArtifactNotice(null);
    try{const response=await fetch('/research-visuals/respondent-profile-concept.png');if(!response.ok)throw Error('示例素材暂时无法读取。');const blob=await response.blob();if(readArtifactCurrent().scope!==captured)return;await artifacts.onImport(new File([blob],'湖北主题受访者画像图.png',{type:'image/png'}),'diagram',{origin:'内置示例',classification:'simulated'});}
    catch(error){if(readArtifactCurrent().scope===captured)setArtifactNotice(error instanceof Error?error.message:'示例素材未能加入。');}
    finally{examplePending.current=false;}
  },[readArtifactCurrent,artifacts]);
  const openArtifactShelf=()=>{setVisited(v=>v.includes('editor')?v:[...v,'editor']);setArtifactOpen(v=>!v);};
  const triggerXrefSynapse = choreo.triggerXrefSynapse;
  const toggleSectionLock = useCallback((id: string) => {
    if (!visibleCandidate) return;
    setLockedSections(previous => {
      const ids = previous.runId === visibleCandidate.runId ? previous.ids : [];
      return { runId: visibleCandidate.runId, ids: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] };
    });
  }, [visibleCandidate]);
  const hasActiveDiffInputs =
    Boolean(visibleCandidate && candidateChanges.length > 0) ||
    Boolean(revision.phase === 'ready' && revision.section);
  const [paperDiffMod, setPaperDiffMod] = useState<PaperDiffModule | null>(() => loadedPaperDiffMod);
  useEffect(() => {
    if (!hasActiveDiffInputs || paperDiffMod) return;
    let active = true;
    void loadPaperDiff()
      .then(mod => {
        if (active) setPaperDiffMod(() => mod);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hasActiveDiffInputs, paperDiffMod]);
  useEffect(() => {
    if (!outputId || loadedFigureTweakMod) return;
    void loadFigureTweak().catch(() => {});
  }, [outputId]);
  const activePaperDiffMod = paperDiffMod ?? loadedPaperDiffMod;
  const paperSectionDiffs = useMemo(() => {
    if (!hasActiveDiffInputs || !activePaperDiffMod) return EMPTY_PAPER_SECTION_DIFFS;
    return activePaperDiffMod.buildPaperSectionDiffs({
      changes: visibleCandidate ? candidateChanges : [],
      lockedSectionIds,
      revision: revision.phase === 'ready' && revision.section
        ? { active: true, sectionId: revision.section.id, title: revision.section.title, original: revision.original, proposed: revision.proposed }
        : null,
    });
  }, [hasActiveDiffInputs, activePaperDiffMod, visibleCandidate, candidateChanges, lockedSectionIds, revision.phase, revision.section, revision.original, revision.proposed]);
  const locateArtifact = useCallback((id: string) => {
    const record = artifacts.recordOf(id);
    if (!record) return;
    void loadPaperDiff().then(({ locateArtifactTarget }) => {
      const target = locateArtifactTarget(paperContent, record);
      if (!target.sectionId && !target.pageZero) {
        setArtifactNotice('该成果尚未嵌入当前报告正文，可先点击“用于报告”加入文档。');
        return;
      }
      setArtifactNotice(null);
      const jump = () => {
        if (target.xrefBlockId && target.sectionId) {
          const hasNode = !!paperRef.current?.querySelector(`[data-xref-target="${CSS.escape(target.xrefBlockId)}"]`);
          if (hasNode) {
            setPickedSection(target.sectionId);
            triggerXrefSynapse('xref', target.xrefBlockId, true);
          } else {
            pickSection(target.sectionId);
            triggerXrefSynapse('xref', target.xrefBlockId, false);
          }
        } else if (target.sectionId) {
          pickSection(target.sectionId);
        } else if (target.pageZero) {
          setPickedSection(null);
          paperRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
      if (stage !== 'paper') {
        setStage('paper');
        requestAnimationFrame(() => requestAnimationFrame(jump));
      } else {
        jump();
      }
    });
  }, [artifacts, paperContent, stage, setStage, pickSection, triggerXrefSynapse]);
  const artifactPanelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!artifactOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panelElement = artifactPanelRef.current;
    const frame = requestAnimationFrame(() => panelElement?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      if (previous?.isConnected && (document.activeElement === document.body || panelElement?.contains(document.activeElement))) previous.focus({ preventScroll: true });
    };
  }, [artifactOpen]);

  const openFromCanvas = useCallback((target: Section, nodeId: string, title: string) => { setCanvasReturn({ nodeId, title }); window.location.hash = target; }, [setCanvasReturn]);
  const showWorkbench = useCallback(() => { window.location.hash = lastModule; }, [lastModule]);
  const nav = useMemo<WorkbenchNav>(() => ({ section: panel ?? 'overview', openFromCanvas, showWorkbench, canvasFocus }), [panel, openFromCanvas, showWorkbench, canvasFocus]);
  const backToCanvas = () => {
    if (canvasReturn) setCanvasFocus({ nodeId: canvasReturn.nodeId, token: Date.now() });
    setCanvasReturn(null);
    window.location.hash = 'canvas';
  };

  // A panel opened by the user takes focus at its heading; one opened from the composer leaves the keyboard there.
  const lastFocusPanel = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (panel !== currentPanel()) return;
    const destination = researchStage ?? panel;
    if (lastFocusPanel.current === undefined || lastFocusPanel.current === destination) { lastFocusPanel.current = destination; return; }
    lastFocusPanel.current = destination;
    if (!panel || panel === 'canvas' || document.activeElement === inputRef.current) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [panel, researchStage]);

  // What the agent routes against is read when a message is sent, so its handlers stay stable.
  const toggleSide = () => setSideOpen(!sideOpen);
  const report = deferredView.report, design = deferredView.design, dataset = deferredView.dataset, liveReport = view.report;
  // The editor must be mounted to take a figure change; it then stays mounted, hidden, as a visited module does.
  const mountEditor = useCallback(() => setVisited(v => v.includes('editor') ? v : [...v, 'editor']), []);
  const latest = useRef({ projectId, reportScope, reportSource, csrfToken: account?.csrfToken, sessionError, panel, light, theme, knowledge, traces, held, plan, report, liveReport, design, dataset, generation, owner, identityEpoch, isCurrentAccount, lastPanel, toggleSide, chatMode, chatService, reportService, mutate, outputId, tweakFigure, mountEditor, stepSection, steeringNotes, stage, expanded, effectiveBrain, customBrain, applyCandidate, blankReport });
  useLayoutEffect(() => { latest.current = { projectId, reportScope, reportSource, csrfToken: account?.csrfToken, sessionError, panel, light, theme, knowledge, traces, held, plan, report, liveReport, design, dataset, generation, owner, identityEpoch, isCurrentAccount, lastPanel, toggleSide, chatMode, chatService, reportService, mutate, outputId, tweakFigure, mountEditor, stepSection, steeringNotes, stage, expanded, effectiveBrain, customBrain, applyCandidate, blankReport }; });
  const saveStudioSvgArtifactRef = useRef<(title: string, svg: string) => void>(() => {});

  const commitAutonomousRun = useCallback(async (run: AutonomousRunView): Promise<boolean> => {
    const {
      buildAlignedDatasetValue,
      hydrateAutonomousRunToQuality,
      sanitizeAdvisorDisplayText,
    } = await loadAutonomousAgent();
    const expected = latest.current.reportSource;
    const mergedQuality = await hydrateAutonomousRunToQuality(run, expected.report?.quality);
    const alignedDataset = buildAlignedDatasetValue(run, expected.dataset ?? null);
    const baseReport = expected.report ?? blankReport;
    const nextReport: EditorContent = {
      ...baseReport,
      title: baseReport.title.trim() && baseReport.title !== blankReport.title ? baseReport.title : run.datasetSummary.title,
      quality: mergedQuality,
    };
    const nextDesign = expected.design ?? newQuestionnaire();
    const outcome = applyCandidate({
      design: nextDesign,
      dataset: alignedDataset,
      report: nextReport,
      blueprint: decomposeShellTopic(nextReport.title || run.datasetSummary.title, nextDesign),
    }, expected);
    if (outcome !== 'applied') return false;
    setReviewNotice(`已同步 ${run.registeredResults.length} 项统计结果与核心结论（有效样本 ${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount}）。`);
    threads.append([{
      ...stamp(),
      role: 'agent',
      turn: {
        lines: [
          [span(`已完成深度分析，并同步 ${run.registeredResults.length} 项统计结果（有效样本 ${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount}）。`, 'gold')],
          [span(sanitizeAdvisorDisplayText(run.motherInsight.headline))],
        ],
        chips: [{ label: '一键按分析结果起草报告', action: { type: 'generateFullReport', topic: nextReport.title }, primary: true }],
      },
    }]);
    return true;
  }, [applyCandidate, blankReport]);

  const ensureTheaterTopicDesign = useCallback((rawTopic: string) => {
    const trimmed = rawTopic.trim();
    if (!trimmed) return;
    void import('@/lib/agent/demo-study').then(({ buildDemoQuestionnaire }) => {
      setTheaterTopicDesign(prev =>
        prev?.topic === trimmed ? prev : { topic: trimmed, design: buildDemoQuestionnaire(decomposeShellTopic(trimmed)) },
      );
    });
  }, []);

  const launchSiliconTheater = useCallback(
    (opts?: {
      topic?: string;
      templateKey?: SiliconTemplateKey;
      size?: number;
      seed?: number;
      design?: Questionnaire | null;
      openCopilot?: boolean;
    }) => {
      const snap = latest.current;
      const topicHint = opts?.topic?.trim() || opts?.design?.title || snap.design?.title || snap.liveReport?.title || '';
      const popHint = opts?.design?.population || snap.design?.population || '';
      const nextCustomDesign = opts?.design !== undefined ? opts.design : undefined;
      void loadSiliconRuntime().then(loaded => {
        setSiliconRuntime(prev => prev ?? loaded);
      });
      if (!nextCustomDesign && !snap.design && topicHint) {
        ensureTheaterTopicDesign(topicHint);
      }
      setTheaterConfig(prev => ({
        open: true,
        topic: topicHint,
        templateKey: opts?.templateKey ?? (topicHint || popHint ? inferSiliconTemplate(`${topicHint} ${popHint}`) : prev.templateKey),
        size: opts?.size ?? prev.size,
        seed: opts?.seed ?? prev.seed,
        customDesign: opts?.design !== undefined ? opts.design : prev.customDesign,
        playKey: prev.playKey + 1,
      }));
      if (opts?.openCopilot !== undefined) setCopilotOpen(Boolean(opts.openCopilot));
    },
    [ensureTheaterTopicDesign, setCopilotOpen, setTheaterConfig],
  );

  const closeSiliconTheater = useCallback(() => {
    setTheaterConfig(prev => (prev.open ? { ...prev, open: false } : prev));
  }, [setTheaterConfig]);

  const liveTheaterBundle = useMemo(() => {
    if (!theaterConfig.open || !siliconRuntime) return null;
    const trimmedTopic = theaterConfig.topic.trim();
    const resolvedTopicDesign =
      trimmedTopic && theaterTopicDesign?.topic === trimmedTopic ? theaterTopicDesign.design : null;
    if (!theaterConfig.customDesign && !design && trimmedTopic && !resolvedTopicDesign) {
      return null;
    }
    const activeDesign =
      theaterConfig.customDesign ??
      design ??
      resolvedTopicDesign ??
      siliconRuntime.siliconExampleQuestionnaire();
    const sourceLabel = theaterConfig.customDesign
      ? '工坊定制问卷'
      : design
        ? '当前项目问卷'
        : trimmedTopic
          ? '按课题自动构念'
          : '内置示例问卷';
    const attrs =
      siliconRuntime.PANEL_TEMPLATES[theaterConfig.templateKey]?.attributes ??
      siliconRuntime.PANEL_TEMPLATES.residents.attributes;
    const panel = siliconRuntime.generatePanel({
      attributes: attrs,
      size: theaterConfig.size,
      allocation: 'quota',
      seed: theaterConfig.seed,
      background: activeDesign.population || theaterConfig.topic || '分层硅基预测试受访人群',
    });
    const runSettings = {
      engine: 'demo' as const,
      memory: 'carry' as const,
      shuffleOptions: false,
      scenarios: [siliconRuntime.NO_SCENARIO],
      models: [],
    };
    const run = siliconRuntime.demoRun(activeDesign, attrs, panel, runSettings);
    return { design: activeDesign, sourceLabel, attrs, panel, runSettings, run };
  }, [theaterConfig, design, theaterTopicDesign, siliconRuntime]);
  const stopChoreography = choreo.stop;
  const stopReportRun = useCallback((reason = '已取消运行；原稿已保留。已发出的调用可能仍计费，请核对回执。') => {
    preparingReport.current = null;
    const run = activeReportRun.current;
    if (run) {
      activeReportRun.current = null; run.controller.abort();
      finishCall(run.messageId);
      threads.patch(run.messageId, message => message.role === 'agent' ? { ...message, model: message.model ? { ...message.model, status: 'unknown' } : undefined, turn: { lines: [[span(reason, 'dim')]], chips: [{ label: '核对本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${run.runId}` } }] } } : message);
      setCandidate(previous => previous?.runId === run.runId ? { ...previous, pending: false, failed: reason } : previous);
      setReportWriting(run.scope, previous => ({ ...previous, active: false, phase: 'cancelled' }));
    }
    stopChoreography();
  }, [stopChoreography, finishCall, setReportWriting]);
  useLayoutEffect(() => {
    const scope: ReportRunScope = { owner: owner === 'guest' ? null : owner, epoch: identityEpoch, thread: thread?.id ?? null, project: projectId };
    const run = activeReportRun.current;
    if (run && !sameReportRunScope(run.scope, readReportScope())) stopReportRun('账号、项目或对话已切换。本次运行已停止接收，请核对原对话中的调用回执。');
    else stopChoreography();
    return () => {
      const current = activeReportRun.current;
      if (current && sameReportRunScope(current.scope, scope)) stopReportRun('账号、项目或对话已切换。本次运行已停止接收，请核对原对话中的调用回执。');
      if (preparingReport.current && sameReportRunScope(preparingReport.current.scope, scope)) preparingReport.current = null;
      setReportWriting(scope, null);
    };
  }, [owner, identityEpoch, thread?.id, projectId, readReportScope, stopReportRun, stopChoreography, setReportWriting]);
  useEffect(() => () => { activeReportRun.current?.controller.abort(); activeReportRun.current = null; preparingReport.current = null; }, []);

  const agent = useMemo(() => {
    // Read the store synchronously at dispatch: a selection can change before the next effect updates `latest`.
    const currentService = (task: ModelTask, call?:ModelCallId) => resolveStageModelRoute(call??(task==='research'?'research.conversation':task==='questionnaire'?'survey.questionnaire':'report.draft'), latest.current.generation.lists.services, getStageModelPreferences(latest.current.owner)).service;
    // Commands always run here, in the browser; other sentences go to the model when the user has chosen to talk with one.
    const send = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (/^[/／]密钥(?:\s|$)|\bsk-[A-Za-z0-9_-]{12,}/u.test(text)) {
        say([span('检测到可能的服务密钥，本条内容未写入对话。请在模型设置中接入服务。', 'dim')]); go('services'); return;
      }
      if (restyle(text)) return;
      if (latest.current.chatMode === 'model' && !/^[/／]/u.test(text)) ask(text);
      else local(text);
    };
    // With an output open, a sentence about its figure changes the report's figure directly, in either mode: no model is
    // needed to recolour a chart. The reply lists each change, from what it was to what it is now.
    const applyRestyleWith = (mod: FigureTweakModule, text: string): boolean => {
      const { outputId, liveReport, tweakFigure, mountEditor } = latest.current;
      const result = outputId && liveReport ? liveReport.quality?.results.find(r => r.id === outputId) : undefined;
      const request = result ? mod.parseFigureRequest(text) : null;
      if (!result || !liveReport || !request) return false;
      const lines: Line[] = [];
      let changed = false;
      if (Object.keys(request.change).length) {
        try {
          const preview = mod.applyFigureChange(liveReport, result.id, request.change);
          if (preview.changes.length) {
            mountEditor();
            tweakFigure({ id: crypto.randomUUID(), resultId: result.id, change: request.change });
            lines.push([span('已调整“'), span(result.title, 'strong'), span('”的图表样式。')], ...preview.changes.map(c => [span('· ', 'dim'), span(c, 'teal')]));
            changed = true;
          } else lines.push([span('图已经是这样了，没有改动。', 'dim')]);
        } catch (error) { lines.push([span('未能调整图表样式，', 'error'), span((error as Error).message)]); }
      }
      for (const note of request.unsupported) lines.push([span(note, 'dim')]);
      if (changed) lines.push([span('◆ ', 'cyan'), span('改动写进了报告，在“报告与 PPT”里可以撤销。', 'dim')]);
      threads.append([{ ...stamp(), role: 'user', text }, { ...stamp(), role: 'agent', turn: { lines } }]);
      return true;
    };
    const restyle = (text: string) => {
      const { outputId, liveReport } = latest.current;
      if (!outputId || !liveReport || !ABOUT_FIGURE_RE.test(text.trim()) || /^[/／]/u.test(text.trim())) return false;
      if (loadedFigureTweakMod) return applyRestyleWith(loadedFigureTweakMod, text);
      void loadFigureTweak().then(mod => {
        if (!applyRestyleWith(mod, text)) {
          if (latest.current.chatMode === 'model' && !/^[/／]/u.test(text)) ask(text);
          else local(text);
        }
      });
      return true;
    };
    const local = (text: string): boolean => {
      const { panel, light, theme, traces, held, plan, report, reportSource, design, dataset, generation, projectId: activeProjectId, csrfToken: activeCsrf, owner: activeOwner, identityEpoch: activeEpoch, isCurrentAccount: stillSameAccount } = latest.current;
      const user: Message = { ...stamp(), role: 'user', text };
      const directIntent = parseDirectChatToolIntent(text);
      if (directIntent?.kind === 'audit_report_readiness') {
        const auditReport = reportSource.report ?? report ?? createEditorContent();
        const auditDesign = reportSource.design ?? design ?? null;
        const waiting: Message = {
          ...stamp(),
          role: 'agent',
          turn: { lines: [[span('正在执行交稿前合规与证据完整性核查…', 'dim')]] },
        };
        threads.append([user, waiting]);
        const callOwner = activeOwner;
        const callEpoch = activeEpoch;
        const activeThreadId = threads.view(activeOwner).active;
        void (async () => {
          try {
            const outcome = await executeChatPreSubmissionAudit(auditReport, auditDesign);
            if (
              (callOwner && !stillSameAccount(callOwner, callEpoch)) ||
              threads.view(callOwner).active !== activeThreadId
            ) {
              return;
            }
            replace(waiting.id, {
              lines: outcome.replyLinesList,
              ...(outcome.cards.length ? { cards: outcome.cards } : {}),
              ...(outcome.chips.length ? { chips: outcome.chips } : {}),
            });
          } catch (err) {
            if (
              (callOwner && !stillSameAccount(callOwner, callEpoch)) ||
              threads.view(callOwner).active !== activeThreadId
            ) {
              return;
            }
            const errMsg = err instanceof Error ? err.message : '合规核查暂时未能完成，请稍后重试。';
            replace(waiting.id, {
              lines: [[span(`合规核查暂时未能完成（${errMsg}）。`, 'error')]],
            });
          }
        })();
        return true;
      }
      const isCloudProject = generation.account === 'ready' && Boolean(activeProjectId && !/^(?:local|demo)/i.test(activeProjectId));
      if (directIntent && isCloudProject && activeProjectId) {
        const waitText = directIntent.kind === 'verify_citation'
          ? '正在检索文献核验库核查该文献元数据…'
          : directIntent.kind === 'lookup_county'
            ? '正在检索区县风物与行政区划名录…'
            : directIntent.kind === 'recall_memory'
              ? '正在读取本项目已积累的研究记忆…'
              : directIntent.kind === 'run_stat_preset'
                ? '正在执行专项稳健统计检验并核验数据…'
                : directIntent.kind === 'run_autonomous_audit'
                  ? '正在自动核查数据质量、统计风险与核心结论…'
                  : directIntent.kind === 'compose_grounded_abstract'
                    ? '正在汇总已核验结果与文献整理执行摘要草稿…'
                    : '正在为您生成高清矢量统计配图…';
        const waiting: Message = { ...stamp(), role: 'agent', turn: { lines: [[span(waitText, 'dim')]] } };
        threads.append([user, waiting]);
        const targetProject = activeProjectId;
        const callOwner = activeOwner;
        const callEpoch = activeEpoch;
        const availResults = reportSource.report?.quality?.results ?? report?.quality?.results ?? [];
        const ac = new AbortController();
        void (async () => {
          try {
            let outcome: ChatToolExecOutcome;
            if (directIntent.kind === 'verify_citation') {
              outcome = await executeChatCitationLookup({
                projectId: targetProject,
                csrfToken: activeCsrf,
                signal: ac.signal,
                rawDoi: directIntent.doi,
                rawQuery: directIntent.query,
              });
            } else if (directIntent.kind === 'lookup_county') {
              outcome = await executeChatCountyLookup({
                projectId: targetProject,
                signal: ac.signal,
                query: directIntent.query,
              });
            } else if (directIntent.kind === 'recall_memory') {
              outcome = await executeChatMemoryRecall({
                projectId: targetProject,
                signal: ac.signal,
              });
            } else if (directIntent.kind === 'run_stat_preset') {
              outcome = await executeChatStatPreset({
                projectId: targetProject,
                csrfToken: activeCsrf,
                signal: ac.signal,
                presetId: directIntent.presetId,
                design: reportSource.design ?? design ?? null,
                dataset: reportSource.dataset ?? null,
                saveArtifact: (title, svg) => saveStudioSvgArtifactRef.current(title, svg),
              });
            } else if (directIntent.kind === 'run_autonomous_audit') {
              outcome = await executeChatAutonomousAudit({
                projectId: targetProject,
                csrfToken: activeCsrf,
                signal: ac.signal,
                design: reportSource.design ?? design ?? null,
                dataset: reportSource.dataset ?? null,
                forceFresh: directIntent.forceFresh,
              });
            } else if (directIntent.kind === 'compose_grounded_abstract') {
              const cloudProjectTitle = generation.lists?.projects?.find(p => p.id === targetProject)?.title;
              outcome = await executeChatGroundedAbstract({
                projectId: targetProject,
                signal: ac.signal,
                projectTitle: cloudProjectTitle || reportSource.report?.title || report?.title || design?.title,
                report: reportSource.report ?? report ?? null,
                design: reportSource.design ?? design ?? null,
                dataset: reportSource.dataset ?? null,
              });
            } else {
              outcome = await executeChatSandboxPlot({
                projectId: targetProject,
                csrfToken: activeCsrf,
                signal: ac.signal,
                availableResults: availResults,
                targetHint: directIntent.targetHint,
                chartKind: directIntent.chartKind,
                saveArtifact: (title, svg) => saveStudioSvgArtifactRef.current(title, svg),
              });
            }
            if (!callOwner || !stillSameAccount(callOwner, callEpoch) || latest.current.projectId !== targetProject) return;
            replace(waiting.id, {
              lines: outcome.replyLinesList,
              ...(outcome.cards.length ? { cards: outcome.cards } : {}),
              ...(outcome.chips.length ? { chips: outcome.chips } : {}),
            });
          } catch (err) {
            if (!callOwner || !stillSameAccount(callOwner, callEpoch) || latest.current.projectId !== targetProject) return;
            const errMsg = err instanceof Error ? err.message : '操作执行失败，请稍后重试。';
            replace(waiting.id, {
              lines: [[span(`未能完成该项处理（${errMsg}）。`, 'error')]],
            });
          }
        })();
        return true;
      }
      const routed = route(text, { room: panel, light, theme, traces, results: held, plan, projectTitle: report?.title || design?.title, design, datasetName: dataset?.name });
      if ('draft' in routed) { threads.append([user]); askDraft(routed.draft); return false; }
      // Drafting with a model always starts with the user's consent, never with a call.
      if ('generate' in routed) {
        const brain = latest.current.effectiveBrain;
        const turnOut = generation.account !== 'ready' && brain.available
          ? buildGuestDraftGateTurn(routed.generate, brain.provider, brain.model)
          : generation.start(routed.generate);
        threads.append([user, { ...stamp(), role: 'agent', turn: turnOut }]);
        return false;
      }
      if ('lookup' in routed) { threads.append([user, { ...stamp(), role: 'pending', query: routed.lookup, explicit: routed.explicit }]); return false; }
      if ('lookupCounty' in routed || 'recommendResource' in routed) {
        const waitText = 'lookupCounty' in routed ? '正在检索区县风物与行政区划名录…' : '正在匹配适配当前课题的图表与研究资源…';
        const waiting: Message = { ...stamp(), role: 'agent', turn: { lines: [[span(waitText, 'dim')]] } };
        threads.append([user, waiting]);
        const callOwner = activeOwner;
        const callEpoch = activeEpoch;
        const activeThreadId = threads.view(activeOwner).active;
        void (async () => {
          try {
            const { resolveHeavyRouted } = await import('@/lib/agent/router-heavy-actions');
            const turnOut = await resolveHeavyRouted(routed);
            if (!callOwner || !stillSameAccount(callOwner, callEpoch) || threads.view(callOwner).active !== activeThreadId) return;
            replace(waiting.id, turnOut);
            if (turnOut.act) perform(turnOut.act);
          } catch (err) {
            if (!callOwner || !stillSameAccount(callOwner, callEpoch) || threads.view(callOwner).active !== activeThreadId) return;
            const errMsg = err instanceof Error ? err.message : '检索未能完成，请稍后重试。';
            replace(waiting.id, { lines: [[span(`资源检索暂时未能完成（${errMsg}）。`, 'error')]] });
          }
        })();
        return true;
      }
      threads.append([user, { ...stamp(), role: 'agent', turn: routed.turn }]);
      if (routed.turn.act) perform(routed.turn.act);
      return false;
    };
    // The first sentence of a conversation waits for consent: what goes to the service, what never does, who pays.
    const ask = (text: string) => {
      const { generation, owner, identityEpoch, sessionError } = latest.current;
      const chatService = currentService('research');
      if (generation.account !== 'ready' || !chatService) {
        // Whatever the sentence routes to here, the user learns why the model was not asked.
        const handledDirect = local(text);
        if (handledDirect) return;
        if (generation.account !== 'ready') {
          say(
            [
              span(
                sessionError
                  ? '当前未连接在线模型，已先用内置向导为你响应；连接模型并登录后即可自由对话。'
                  : '开启智能自由对话需先邮箱登录并在“模型设置”中启用对话服务，这一句已先由内置向导处理。',
                'dim',
              ),
            ],
            sessionError
              ? [{ label: '打开模型设置', action: { type: 'open', room: 'services' } }]
              : [
                  { label: '邮箱登录 ↗', action: { type: 'href', href: '/login?next=/agent' }, primary: true },
                  { label: '打开模型设置', action: { type: 'open', room: 'services' } },
                ],
          );
        } else {
          say(
            [span('请在输入框选择对话模型，或到“模型设置”启用模型服务，这一句已先由内置向导处理。', 'dim')],
            [{ label: '打开模型设置', action: { type: 'open', room: 'services' }, primary: true }],
          );
        }
        return;
      }
      threads.append([{ ...stamp(), role: 'user', text }]);
      if (text.length > TEXT_LIMIT) { say([span(`模型对话一次最多 ${TEXT_LIMIT} 字，这一句有 ${text.length} 字；请分开发送。`, 'error')]); return; }
      const thread = threads.view(owner).active;
      if (thread && consented.current.has(`${owner}:${identityEpoch}:${thread}:${chatService.id}:${chatService.revision}`)) { turn(text); return; }
      threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('发送给对话服务前请先确认。')]], cards: [{ kind: 'confirm', title: `用“${chatService.label} · ${chatService.model} · v${chatService.revision}”回答`,
        lines: [[span('本次将发送当前提问、这段对话最近的 '), span(String(HISTORY_LIMIT), 'gold'), span(' 条记录，以及项目照度、盲区、可回溯图表与已登记结果数量的摘要；涉及结果核对时，还会附上已登记结果的标题、方法、有效样本、主要统计量与提醒，以及已确认研究发现的标题与解释。')],
          [span('问卷原题、原始逐行数据与报告全文均不会外发；服务无法直接改动项目，所有请求的操作仍由本地执行并在改动前向你确认。', 'dim')],
          [span(`服务读完核查结果后可能继续补充回答，单句提问最多调用 ${MAX_STEPS} 次，费用按所选服务商计费；本段对话后续提问不再重复询问。`, 'dim')]],
        confirm: { label: '发送', action: { type: 'chat', text, modelBinding: { owner: owner!, identityEpoch, serviceId: chatService.id, serviceRevision: chatService.revision } } }, cancel: '不发送' }] } }]);
    };
    const say = (line: Line, chips?: AgentTurn['chips']) => threads.append([{ ...stamp(), role: 'agent', turn: { lines: [line], chips } }]);
    // `next` continues a sentence from what the previous step's tools found; without it, a new sentence starts.
    // `seen` holds the tools already run for this sentence: a repeat draws no second card and finds nothing new. A
    // continuation keeps the service the sentence began with, the one the user agreed to, even if the menu has moved on.
    const turn = (text: string, next?: Chain, selectedService?: Service) => {
      const { panel, light, traces, held, owner, mutate, identityEpoch, isCurrentAccount } = latest.current;
      const callOwner = next?.owner ?? owner, callEpoch = next?.epoch ?? identityEpoch;
      if (!callOwner || !isCurrentAccount(callOwner, callEpoch)) return false;
      const chatService = next?.service ?? selectedService ?? currentService('research');
      if (!chatService) return false;
      // A later step stays in the sentence's own conversation, whichever one is open now, and stops if it was deleted.
      const book = threads.view(owner), home = next ? threads.threadOf(next.after) : book.threads.find(t => t.id === book.active);
      if (next && !home) return false;
      const messages = home?.messages ?? [];
      const asked = messages.map(m => m.role === 'user' && m.text === text).lastIndexOf(true);
      // A sentence whose consent card was declined, or never answered, was not sent and is not sent later either.
      const declined = new Set(messages.flatMap((m, i) => m.role === 'agent' && m.answered !== 'confirmed'
        && m.turn.cards?.some(card => card.kind === 'confirm' && card.confirm.action.type === 'chat') ? [i - 1] : []));
      // A continuation sees the whole sentence so far: the reply and the tools' cards come after the question.
      const said = (next ? messages : messages.slice(0, asked < 0 ? messages.length : asked)).filter((_, i) => !declined.has(i));
      const request: ChatRequest = { schemaVersion: 1, idempotencyKey: crypto.randomUUID(), message: text, history: chatHistory(said.flatMap(chatLine)),
        context: chatContext(panel, light, traces, held), serviceId: chatService.id, serviceRevision: chatService.revision, consent: true,
        ...(next ? { step: next.step, toolResults: next.results } : {}) };
      const waiting: Message = { ...stamp(), role: 'agent', model: { service: chatService.label, serviceId: chatService.id, serviceRevision: chatService.revision, provider: chatService.provider, modelName: chatService.model, step: next?.step ?? 1, status: 'running' }, turn: { lines: next
        ? [[span('正在根据工具结果接着回答…', 'dim')]]
        : [[span('正在请'), span(`“${chatService.label}”`, 'strong'), span('回答…', 'dim')]] } };
      if (next) threads.appendAfter(next.after, waiting); else threads.append([waiting]);
      const seen = next?.seen ?? new Set<string>();
      startCall(waiting.id, callOwner, callEpoch);
      sendChatTurn(mutate, request).then(receipt => { if (isCurrentAccount(callOwner, callEpoch)) settle(waiting.id, receipt, chatService.label, seen, chatService, callOwner, callEpoch); }, failure => { if (isCurrentAccount(callOwner, callEpoch)) fail(waiting.id, failure, request.idempotencyKey, text); }).finally(() => finishCall(waiting.id));
      return true;
    };
    // How a model call ended, on the message that holds it; the service and step stay those it was sent with.
    const mark = (messageId: string, status: NonNullable<ModelCall['status']>, service?: string, step?: number, usage?: TokenUsage | null) =>
      threads.patch(messageId, m => m.role === 'agent' && m.model ? { ...m, model: { ...m.model, ...(service ? { service } : {}), ...(step ? { step } : {}), ...(usage ? { usage } : {}), status } } : m);
    // What the call cost, beside the answer, when the provider said.
    const spent = (usage: TokenUsage | null) => (usage ? [span(' · ', 'dim'), span(usageText(usage), 'dim')] : []);
    const replace = (messageId: string, next: AgentTurn) => threads.patch(messageId, m => m.role === 'agent' ? { ...m, turn: next } : m);
    // A receipt in place of the waiting line: the reply, marked as unverified, then each tool it asked for, run here.
    // A receipt read back by 核对回执 has no chain to continue: it settles, and the user can ask again from there.
    const settle = (messageId: string, receipt: ChatReceipt, label: string, seen = new Set<string>(), service?: Service, callOwner?: string, callEpoch?: number) => {
      if (receipt.status === 'ready' && receipt.reply) {
        mark(messageId, 'ready', label, receipt.step, receipt.usage);
        replace(messageId, { lines: [...replyLines(receipt.reply), [span('◆ ', 'cyan'), span(`${label} 的回答，未经核实；项目里的数字以工具读到的为准。`, 'dim'), ...spent(receipt.usage)]] });
        const asked = receipt.message;
        if (receipt.droppedActions) threads.appendAfter(messageId, { ...stamp(), role: 'agent', turn: { lines: [[span(`模型还请求了 ${receipt.droppedActions} 个不在清单里的操作，没有执行。`, 'dim')]] } });
        // What the read-only tools found goes back to the model, until the sentence's last step.
        const fresh = receipt.actions.filter(action => { const key = action.tool + JSON.stringify(action.args); return !seen.has(key) && !!seen.add(key); });
        const current = () => !!callOwner && callEpoch !== undefined && latest.current.isCurrentAccount(callOwner, callEpoch) && !!threads.threadOf(messageId);
        void Promise.all(fresh.map(action => run(messageId, action, current))).then(found => {
          if (!current()) return;
          const results = found.filter((r): r is ToolResult => !!r).slice(0, 4);
          if (results.length && asked && service && callOwner && callEpoch !== undefined && receipt.step < MAX_STEPS) turn(asked, { step: receipt.step + 1, results, seen, service, after: messageId, owner: callOwner, epoch: callEpoch });
        });
      } else if (receipt.status === 'failed') {
        mark(messageId, 'failed', label, receipt.step, receipt.usage);
        replace(messageId, { lines: [[span('本轮回复未能完成，', 'error'), span(CHAT_ERRORS[receipt.errorCode ?? ''] ?? '模型服务出错了。'), ...spent(receipt.usage)]], chips: receipt.message ? [{ label: '再问一次', action: { type: 'say', text: receipt.message } }] : undefined });
      } else {
        mark(messageId, 'unknown', label, receipt.step);
        replace(messageId, { lines: [[span('本轮回执状态待核对，', 'error'), span('请求已记下；核对只读取回执，不会再次发起调用。')]], chips: [{ label: '核对回执', action: { type: 'check', turn: receipt.id, message: messageId }, primary: true }] });
      }
    };
    const fail = (messageId: string, failure: unknown, turnId: string, text: string) => {
      if (failure instanceof HostedApiError && isDefiniteChatRejection(failure.status, failure.code)) {
        mark(messageId, 'refused');
        replace(messageId, { lines: [[span('本轮请求未能发出，', 'error'), span(CHAT_ERRORS[failure.code] ?? errorMessage(failure))]], chips: [{ label: '再问一次', action: { type: 'say', text } }] });
      } else {
        mark(messageId, 'unknown');
        replace(messageId, { lines: [[span('本轮回执状态待核对，', 'error'), span(`${errorMessage(failure)} 请求可能已经记下；核对只读取回执，不会再次发起调用。`)]], chips: [{ label: '核对回执', action: { type: 'check', turn: turnId, message: messageId }, primary: true }] });
      }
    };
    const check = (turnId: string, messageId: string) => {
      const { owner, identityEpoch, isCurrentAccount } = latest.current;
      const current = () => !!owner && isCurrentAccount(owner, identityEpoch) && !!threads.threadOf(messageId);
      if (!current()) return;
      // The call is credited to the service it went to. A message from before calls were recorded does not name one, so
      // it is recorded as unknown rather than credited to whichever service is chosen now.
      const sent = threads.find(messageId);
      const label = sent?.role === 'agent' && sent.model ? sent.model.service : UNRECORDED_SERVICE;
      if (sent?.role === 'agent' && !sent.model) threads.patch(messageId, m => m.role === 'agent' ? { ...m, model: { service: label, step: 1, status: 'unknown' } } : m);
      replace(messageId, { lines: [[span('正在核对回执…', 'dim')]] });
      readChatTurn(turnId).then(receipt => { if (current()) settle(messageId, receipt, label, new Set(), undefined, owner!, identityEpoch); },
        failure => !current() ? undefined : failure instanceof HostedApiError && failure.status === 404
          ? (mark(messageId, 'refused'), replace(messageId, { lines: [[span('这一轮没有发出，', 'error'), span('没有产生费用，可以再问一次。')]] }))
          : fail(messageId, failure, turnId, ''));
    };

    // Drafting a report section: consent first, every time, naming what goes to the service and the number rule.
    const askDraft = (nodeId: string, existingOverride?: string) => {
      const { generation, held, report, owner, identityEpoch, sessionError } = latest.current;
      const reportService = currentService('report');
      const title = blueprintNode(nodeId).title;
      if (generation.account !== 'ready') {
        say(
          [
            span(
              sessionError
                ? '云端撰稿服务当前离线，暂无法按事实起草；请检查服务连接或前往“模型设置”核对。'
                : '按事实起草需使用你接入的撰稿服务，请先邮箱登录并在“模型设置”保存个人配置。',
              'dim',
            ),
          ],
          sessionError
            ? [
                { label: '打开模型设置', action: { type: 'open', room: 'services' }, primary: true },
                { label: '邮箱登录 ↗', action: { type: 'href', href: '/login?next=/agent' } },
              ]
            : [
                { label: '邮箱登录 ↗', action: { type: 'href', href: '/login' }, primary: true },
                { label: '打开模型设置', action: { type: 'open', room: 'services' } },
              ],
        );
        return;
      }
      if (!held || !report) {
        say([span(`起草“${title}”要先读到报告与登记结果；这次访问还没有打开报告与 PPT。`, 'dim')],
          [{ label: '打开报告与 PPT', action: { type: 'open', room: 'editor' }, primary: true }]);
        return;
      }
      if (!reportService) {
        say([span('请到模型设置的“任务分工”选择报告拟稿服务；服务需启用报告能力。', 'dim')],
          [{ label: '打开模型设置', action: { type: 'open', room: 'services' }, primary: true }]);
        return;
      }
      const trimmedOverride = existingOverride?.trim() ? existingOverride.trim().slice(0, 3000) : undefined;
      const facts = draftFacts(held, nodeId).length, findings = standingFindings(held).length, existing = trimmedOverride ? trimmedOverride.length : sectionText(report, nodeId).length;
      const outline = SYNTHESIS_NODES.has(nodeId) ? reportOutline(report, nodeId).length : 0;
      threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('起草本节之前请先确认。')]], cards: [{ kind: 'confirm', title: `用“${reportService.label} · ${reportService.model} · v${reportService.revision}”起草“${title}”`,
        lines: [
          [span('本次将发送本节在报告蓝图里的写作要求（目的、步骤与必备要素）、课题名称与研究目的、'), span(String(facts), 'gold'),
            span(' 条事实（已登记结果的方法、有效样本、统计量与表中数字）、'), span(String(findings), 'gold'), span(` 条已确认研究发现的标题与解释${existing ? `、本节已有的 ${existing} 字正文` : ''}${outline ? `，以及报告其他 ${outline} 个章节的标题与开头摘录（每节至多 400 字），供这一节概括` : ''}。`)],
          [span(outline ? '问卷原题、原始逐行数据，以及其他章节超出摘录范围的正文均不会外发。' : '问卷原题、原始逐行数据与报告其他章节的正文均不会外发。', 'dim')],
          [span('服务只能用事实编号引用数字，自行编造数字的段落将整段丢弃；数字由本地按登记结果填入。拟稿未经核实，经你确认后才写进报告。费用按所选服务商计费。', 'dim')],
        ], confirm: { label: '起草', action: { type: 'draft', node: nodeId, ...(trimmedOverride ? { existingText: trimmedOverride } : {}), modelBinding: { owner: owner!, identityEpoch, serviceId: reportService.id, serviceRevision: reportService.revision } } }, cancel: '不起草' }] } }]);
    };
    const draftNow = (nodeId: string, binding?: ModelConsentBinding, existingText?: string) => {
      const { held, report, design, mutate, owner, identityEpoch, isCurrentAccount } = latest.current;
      if (!owner || !isCurrentAccount(owner, identityEpoch)) return false;
      const reportService = currentService('report');
      if (!matchesModelConsent(binding, owner, identityEpoch, reportService)) { say([span('模型配置或登录状态已变化，请重新确认本次拟稿。', 'dim')]); askDraft(nodeId, existingText); return false; }
      if (!reportService || !held || !report) { askDraft(nodeId, existingText); return false; }
      const title = blueprintNode(nodeId).title;
      const { request, facts } = draftRequest({ nodeId, held, content: report, design, service: reportService, existingText });
      const waiting: Message = { ...stamp(), role: 'agent', model: { service: reportService.label, serviceId: reportService.id, serviceRevision: reportService.revision, provider: reportService.provider, modelName: reportService.model, step: 1, status: 'running' },
        turn: { lines: [[span('正在请'), span(`“${reportService.label}”`, 'strong'), span(`起草“${title}”…`, 'dim')]] } };
      threads.append([waiting]);
      startCall(waiting.id, owner, identityEpoch);
      sendDraft(mutate, request).then(receipt => { if (owner && isCurrentAccount(owner, identityEpoch)) settleDraft(waiting.id, receipt, reportService.label, nodeId, facts); }, failure => { if (owner && isCurrentAccount(owner, identityEpoch)) failDraft(waiting.id, failure, request.idempotencyKey, nodeId, facts); }).finally(() => finishCall(waiting.id));
      return true;
    };
    const draftError = (code: string | null) => code === 'capability_unavailable' ? '这个模型服务没有启用“报告”能力。' : CHAT_ERRORS[code ?? ''] ?? '模型服务出错了。';
    // A draft in place of the waiting line: its paragraphs with each fact's value in gold, marked unverified, ready to adopt.
    const settleDraft = (messageId: string, receipt: DraftReceipt, label: string, nodeId: string, facts: Fact[]) => {
      const title = blueprintNode(nodeId).title, again = { label: '重新起草', action: { type: 'draftSection' as const, node: nodeId } };
      if (receipt.status === 'ready' && receipt.paragraphs.length) {
        mark(messageId, 'ready', label, 1, receipt.usage);
        replace(messageId, {
          lines: [[span(`“${title}”共拟出 `), span(String(receipt.paragraphs.length), 'gold'), span(' 段初稿。')], ...receipt.paragraphs.map(p => draftLine(p, facts)),
            ...(receipt.droppedParagraphs ? [[span(`另有 ${receipt.droppedParagraphs} 段因含自造数字或引用未登记事实已自动剔除。`, 'dim')]] : []),
            [span('◆ ', 'cyan'), span(`${label} 的拟稿，未经核实；金色数字由登记结果填入。`, 'dim'), ...spent(receipt.usage)]],
          chips: [{ label: `写进“${title}”`.slice(0, 26), action: { type: 'adopt', node: nodeId, paragraphs: receipt.paragraphs.map(p => draftText(p, facts)),
            cited: [...new Set(receipt.paragraphs.flatMap(p => p.facts))].flatMap(id => facts.filter(f => f.id === id).map(f => f.text)) }, primary: true }, again],
        });
      } else if (receipt.status === 'failed' || receipt.status === 'ready') {
        mark(messageId, 'failed', label, 1, receipt.usage);
        replace(messageId, { lines: [[span('本次起草未能完成，', 'error'), span(draftError(receipt.errorCode)), ...spent(receipt.usage)]], chips: [again] });
      } else {
        mark(messageId, 'unknown', label, 1);
        replace(messageId, { lines: [[span('本次起草状态待核对，', 'error'), span('请求已记下；核对只读取回执，不会再次发起调用。')]],
          chips: [{ label: '核对回执', action: { type: 'checkDraft', draft: receipt.id, message: messageId, node: nodeId, facts }, primary: true }] });
      }
    };
    const failDraft = (messageId: string, failure: unknown, draftId: string, nodeId: string, facts: Fact[]) => {
      const again = { label: '重新起草', action: { type: 'draftSection' as const, node: nodeId } };
      if (failure instanceof HostedApiError && isDefiniteChatRejection(failure.status, failure.code)) {
        mark(messageId, 'refused');
        replace(messageId, { lines: [[span('本次起草请求未能发出，', 'error'), span(failure.code === 'capability_unavailable' ? draftError(failure.code) : CHAT_ERRORS[failure.code] ?? errorMessage(failure))]], chips: [again] });
      } else {
        mark(messageId, 'unknown');
        replace(messageId, { lines: [[span('本次起草状态待核对，', 'error'), span(`${errorMessage(failure)} 请求可能已经记下；核对只读取回执，不会再次发起调用。`)]],
          chips: [{ label: '核对回执', action: { type: 'checkDraft', draft: draftId, message: messageId, node: nodeId, facts }, primary: true }] });
      }
    };
    const checkDraft = (draftId: string, messageId: string, nodeId: string, facts: Fact[]) => {
      const { owner, identityEpoch, isCurrentAccount } = latest.current;
      const current = () => !!owner && isCurrentAccount(owner, identityEpoch) && !!threads.threadOf(messageId);
      if (!current()) return;
      const sent = threads.find(messageId);
      const label = sent?.role === 'agent' && sent.model ? sent.model.service : UNRECORDED_SERVICE;
      replace(messageId, { lines: [[span('正在核对回执…', 'dim')]] });
      readDraft(draftId, new Set(facts.map(f => f.id))).then(receipt => { if (current()) settleDraft(messageId, receipt, label, nodeId, facts); },
        failure => !current() ? undefined : failure instanceof HostedApiError && failure.status === 404
          ? (mark(messageId, 'refused'), replace(messageId, { lines: [[span('这次起草没有发出，', 'error'), span('没有产生费用，可以重新起草。')]] }))
          : failDraft(messageId, failure, draftId, nodeId, facts));
    };
    // The knowledge index loads once per visit; a lookup in the loop waits for it a little rather than going unanswered.
    const knowledgeReady = async (current: () => boolean, limit = 10_000) => {
      for (const started = Date.now(); current() && !latest.current.knowledge.ready && Date.now() - started < limit;) await new Promise(resolve => setTimeout(resolve, 250));
      return current() && latest.current.knowledge.ready;
    };
    // A tool the model asked for, run as the matching command runs; drafting still begins with its own consent card.
    // A read-only tool's finding is returned so it can go back to the model.
    const run = async (afterId: string, action: ChatAction, current: () => boolean): Promise<ToolResult | null> => {
      if (!current()) return null;
      const { panel, light, theme, traces, held, plan, report, design, dataset, generation, knowledge } = latest.current;
      const routed = toolTurn(action, { room: panel, light, theme, traces, results: held, plan, projectTitle: report?.title || design?.title, design, datasetName: dataset?.name });
      if ('draft' in routed) { askDraft(routed.draft); return null; }
      if ('generate' in routed) { threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: generation.start(routed.generate) }); return null; }
      if ('lookup' in routed) {
        let found: AgentTurn;
        if (!(knowledge.ready || await knowledgeReady(current))) found = { lines: [[span('知识镜还在加载，这次没有查到“', 'dim'), span(routed.lookup, 'strong'), span('”，稍后可以再问。', 'dim')]] };
        else {
          if (!current()) return null;
          try { found = lookupTurn(routed.lookup, await latest.current.knowledge.search(routed.lookup), routed.explicit); }
          catch { found = { lines: [[span('知识镜暂时没有回应，请稍后再问。', 'error')]] }; }
        }
        if (!current()) return null;
        threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: found });
        return { tool: 'lookup', text: turnText(found) };
      }
      if ('lookupCounty' in routed || 'recommendResource' in routed) {
        let turnOut: AgentTurn;
        try {
          const { resolveHeavyRouted } = await import('@/lib/agent/router-heavy-actions');
          turnOut = await resolveHeavyRouted(routed);
        } catch {
          turnOut = { lines: [[span('资料库检索暂时没有回应，请稍后再试。', 'error')]] };
        }
        if (!current()) return null;
        threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: turnOut });
        if (turnOut.act) perform(turnOut.act);
        return isResultTool(action.tool) ? { tool: action.tool, text: turnText(turnOut) } : null;
      }
      threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: routed.turn });
      if (routed.turn.act) perform(routed.turn.act);
      return isResultTool(action.tool) ? { tool: action.tool, text: turnText(routed.turn) } : null;
    };
    const perform = (action: AgentAction) => {
      switch (action.type) {
        case 'open': go(action.room); break;
        case 'stage': setStage(action.stage); break;
        case 'theme': saveTheme(action.theme); break;
        case 'search': latest.current.knowledge.openSearch(); break;
        case 'entry': latest.current.knowledge.open(action.id); break;
        case 'clear': { const active = threads.view(latest.current.owner).active; if (active) threads.remove(active); focusInput(); break; }
        // Only paths of this site; API receipts open in a new tab so in-memory candidate review state is never wiped.
        case 'href':
          if (action.href.startsWith('#')) {
            window.location.assign(action.href);
          } else if (/^\/(?!\/)/.test(action.href)) {
            if (action.href.startsWith('/api/')) window.open(action.href, '_blank', 'noopener,noreferrer');
            else window.location.assign(action.href);
          }
          break;
        case 'say': send(action.text); break;
        case 'chat': {
          const { owner, identityEpoch } = latest.current, thread = threads.view(owner).active;
          const chatService = currentService('research');
          if (!matchesModelConsent(action.modelBinding, owner, identityEpoch, chatService)) { say([span('模型配置或登录状态已变化，请重新确认发送。', 'dim')]); ask(action.text); return false; }
          const started = turn(action.text, undefined, chatService ?? undefined);
          if (started && thread && chatService) consented.current.add(`${owner}:${identityEpoch}:${thread}:${chatService.id}:${chatService.revision}`);
          return started;
        }
        case 'check': check(action.turn, action.message); break;
        case 'draft': return draftNow(action.node, action.modelBinding, action.existingText);
        case 'draftSection': { askDraft(action.node, action.draft); break; }
        case 'checkDraft': checkDraft(action.draft, action.message, action.node, action.facts); break;
        // A draft adopted from a stored conversation is checked again: a blueprint section, a few paragraphs of text.
        case 'adopt': {
          let title: string;
          try { title = blueprintNode(action.node).title; } catch { break; }
          const paragraphs = action.paragraphs.filter(p => typeof p === 'string' && p.trim()).slice(0, 8).map(p => p.slice(0, 2000));
          if (!paragraphs.length) break;
          // A draft's numbers stand only while the facts it cites are still the project's facts, word for word.
          const { liveReport } = latest.current;
          const current = liveReport ? new Set(draftFacts({ results: liveReport.quality?.results ?? [], findings: [], pending: false, placed: [] }, action.node).map(f => f.text)) : null;
          if (!current || !Array.isArray(action.cited) || action.cited.some(text => typeof text !== 'string' || !current.has(text))) {
            say([span(current ? '登记结果在起草之后变了，拟稿里的数字可能已经过时，没有写入。' : '要先读到报告与登记结果才能核对拟稿里的数字；打开报告与 PPT 后再写入。', 'error')],
              [current ? { label: '重新起草', action: { type: 'draftSection', node: action.node }, primary: true } : { label: '打开报告与 PPT', action: { type: 'open', room: 'editor' }, primary: true }]);
            break;
          }
          sendToReport({ id: crypto.randomUUID(), node: action.node, source: '证见 Agent 拟稿', items: paragraphs.map(text => ({ kind: 'paragraph', text })) });
          go('editor');
          say([span(`已把拟稿交给报告与 PPT，写进“${title}”；可以在编辑器里修改或撤销。`, 'dim')]);
          break;
        }
        // The report applies it as one undoable step once its editor is open, as it does for the sampling module.
        case 'place':
          sendToReport({ id: crypto.randomUUID(), node: '', source: '证见 Agent', items: action.results.map(resultId => ({ kind: 'result', resultId })) });
          go('editor');
          say([span('已交给右侧的报告与 PPT 写入；写了哪些内容会显示在编辑器顶部，可以撤销。', 'dim')]);
          break;
        case 'setApiKey': {
          say([span('请在“模型设置”中保存服务密钥。对话框不会保存或使用直接粘贴的密钥。', 'dim')], [{ label: '打开模型设置', action: { type: 'open', room: 'services' } }]);
          go('services');
          break;
        }
        case 'generateFullReport': {
          if (activeReportRun.current || preparingReport.current) { say([span('当前已有候选稿任务在准备或生成，请等待完成或取消运行。', 'dim')]); break; }
          const current = latest.current;
          const service = currentService('report','report.full');
          if (!current.owner || current.owner === 'guest' || current.generation.account !== 'ready' || !service || !current.csrfToken) {
            const unauthed = !current.owner || current.owner === 'guest' || current.generation.account !== 'ready' || !current.csrfToken;
            if (unauthed) {
              const userSource = hasUserResearchSource(current.reportSource);
              const alreadyDemo = current.reportSource.dataset?.kind === 'simulated';
              say(
                [span(alreadyDemo
                  ? '当前工作区已生成完整教学样板成稿，可直接查阅右侧排版并导出可编辑文档或学术排版稿；如需在线服务逐章精修改写，请先登录并在“模型设置”中启用写作服务。'
                  : '在线逐章扩写需先登录并在“模型设置”中启用写作服务；若暂不连接在线服务，也可先使用“教学模拟研究”生成完整定量教学样板。', 'dim')],
                [
                  ...(!alreadyDemo && !userSource ? [{ label: '生成教学模拟样板', action: { type: 'loadBenchmark' as const, benchmarkId: 'current' }, primary: true as const }] : []),
                  { label: '邮箱登录 ↗', action: { type: 'href' as const, href: '/login?next=/agent' }, ...((alreadyDemo || userSource) ? { primary: true as const } : {}) },
                  { label: '打开模型设置', action: { type: 'open' as const, room: 'services' as const } },
                ],
              );
            } else {
              say([span('请在“模型设置”选择或启用支持报告生成的模型服务。', 'dim')], [{ label: '打开模型设置', action: { type: 'open', room: 'services' }, primary: true }]);
              go('services');
            }
            break;
          }
          const requestScope = readReportScope();
          if (requestScope.owner !== current.owner || requestScope.epoch !== current.identityEpoch || requestScope.project !== current.projectId) {
            say([span('登录或项目已变化，请等待当前资料就绪后重新生成。', 'dim')]); break;
          }
          const source = current.reportSource;
          if (source.inputPending) { say([span('原稿或研究资料仍在载入，请等待载入完成后再生成。', 'dim')]); break; }
          const mode = action.mode ?? (source.dataset?.kind === 'simulated' ? 'demonstration' : source.dataset ? 'empirical' : 'plan');
          if (mode === 'demonstration' && hasUserResearchSource(source)) {
            say([span('当前工作区已有用户资料。请新建空白项目载入教学模拟，避免混用研究来源。', 'dim')]); go('workspace'); break;
          }
          if (mode !== 'demonstration' && !source.design) {
            say([span('先完成调查设计，再以当前资料生成研究方案或实证候选稿。空白工作区也可明确载入教学模拟。', 'dim')], [{ label: '打开调查设计', action: { type: 'open', room: 'design' }, primary: true }, { label: '教学模拟', action: { type: 'generateFullReport', topic: action.topic, mode: 'demonstration' } }]); break;
          }
          if (mode === 'empirical' && !current.projectId) { say([span('真实资料报告需要先关联一个项目，以便核对调用归属和资料版本。', 'dim')]); go('workspace'); break; }
          // Never let the editor's blank-report placeholder stand in for the user's research topic.
          const placeholderTitle = blankReport.title;
          const usable = (value?: string | null) => { const v = (value ?? '').trim(); return v && v !== placeholderTitle ? v : ''; };
          const projectTitle = current.generation.lists?.projects?.find(p => p.id === current.projectId)?.title;
          const topic = (usable(action.topic) || usable(source.design?.title) || usable(projectTitle) || usable(source.report?.title) || '当前研究课题').slice(0, 160);
          const before = source.report ?? blankReport;
          const base = source.design && (mode !== 'demonstration' || source.dataset?.kind === 'simulated') ? { design: source.design, dataset: source.dataset, report: before } : undefined;
          const sourceKey = reportSourceKey(source), scope = current.reportScope, callOwner = current.owner, callEpoch = current.identityEpoch;
          const preparation = { id: crypto.randomUUID(), scope: { ...requestScope } };
          preparingReport.current = preparation;
          setCopilotOpen(true);
          void (async () => {
            let handle: ReportRunHandle | null = null;
            try {
              const activeSteering = latest.current.steeringNotes ?? [];
              const inputRevision = await fullReportInputRevision({ topic, mode, base, ...(activeSteering.length ? { steeringNotes: activeSteering } : {}) });
              if (preparingReport.current !== preparation || !sameReportRunScope(requestScope, readReportScope()) || reportSourceKey(latest.current.reportSource) !== sourceKey) return;
              const selected = currentService('report','report.full');
              if (!selected || selected.id !== service.id || selected.revision !== service.revision) { say([span('报告模型配置已变化，请重新点击生成并核对服务。', 'dim')]); return; }
              if (!matchesModelConsent(action.modelBinding, callOwner, callEpoch, service) || action.inputRevision !== inputRevision) {
                threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('生成独立候选稿前请先核对本次范围。')]], cards: [{ kind: 'confirm', title: `${REPORT_MODES[mode]} · ${service.label} · ${service.model} · v${service.revision}`,
                  lines: [
                    [span(`本次围绕“${topic}”生成独立候选稿，审阅差异后再决定是否采纳。`)],
                    [span(`纳入依据包括${base ? `当前调查设计、${source.dataset ? `${source.dataset.table.rows.length} 行${source.dataset.kind === 'simulated' ? '模拟' : '用户'}数据的本地统计结果` : '无采集数据'}、原稿正文与已登记证据` : '由课题构建并明确标注的教学模拟资料'}。`)],
                    [span('系统会核对问卷、数据指纹及登记结果；写作服务仅接收研究设计、章节上下文和证据摘要，原始逐行作答不会外发。', 'dim')],
                    [span('全篇共覆盖 28 个核心章节节点，支持并发起草与自动校验返修。用量按服务商实际回执显示，费用以服务商账单为准。', 'dim')],
                    [span('资料、问卷或模型配置变更后会自动要求重新确认，确保候选稿与当前研究口径一致。', 'dim')],
                  ], confirm: { label: '确认并生成候选稿', action: { ...action, topic, mode, inputRevision, modelBinding: { owner: callOwner, identityEpoch: callEpoch, serviceId: service.id, serviceRevision: service.revision } } }, cancel: '暂不发送' }] } }]);
                return;
              }
              const runId = crypto.randomUUID(), controller = new AbortController();
              const waiting: Message = { ...stamp(), role: 'agent', model: { service: service.label, serviceId: service.id, serviceRevision: service.revision, provider: service.provider, modelName: service.model, reportRunId: runId, step: 1, status: 'running' }, turn: { lines: [[span(`正在生成“${topic}”的独立候选稿。原稿保持在编辑器中。`, 'dim')]], chips: [{ label: '查看本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${runId}` } }] } };
              threads.append([waiting]);
              const runScope = { ...requestScope, thread: threads.threadOf(waiting.id)?.id ?? null };
              handle = { runId, scope: runScope, owner: callOwner, epoch: callEpoch, threadId: runScope.thread, messageId: waiting.id, controller };
              activeReportRun.current = handle;
              startCall(waiting.id, callOwner, callEpoch);
              const run = handle;
              const stillCurrent = () => activeReportRun.current === run && !controller.signal.aborted && sameReportRunScope(run.scope, readReportScope()) && !!threads.threadOf(waiting.id);
              if (!stillCurrent()) { mark(waiting.id, 'refused'); replace(waiting.id, { lines: [[span('项目或对话已变化，本次尚未发送模型请求。', 'dim')]] }); return; }
              setCandidate({ runId, scope, threadId: handle.threadId, sourceKey, source, mode, before, preview: before, pending: true, receipts: [] });
              setLockedSections({ runId, ids: [] }); setReviewNotice('');
              setStage('paper'); closePanel(); setCopilotOpen(false); choreo.stop();
              setReportWriting(run.scope, { active: true, phase: 'contract', completed: 0, total: 0, paragraphs: 0, facts: 0, lastSectionId: null, lastSectionTitle: '', topicTitle: topic, autoFollow: autoFollowRef.current });
              const seenSections = new Map<string, { paragraphs: number; facts: string[] }>();
              const hostFullReport = globalThis as {
                requestFullReport?: FullReportClientModule['requestFullReport'];
              };
              let dispatchFullReport = hostFullReport.requestFullReport;
              if (!dispatchFullReport) {
                dispatchFullReport = (await loadFullReportClient()).requestFullReport;
                if (!stillCurrent()) return;
              }
              const result = await dispatchFullReport({ schemaVersion: 1, runId, projectId: current.projectId, inputRevision, serviceId: service.id, serviceRevision: service.revision, consent: true, topic, mode, base, ...(activeSteering.length ? { steeringNotes: activeSteering } : {}), stream: true, concurrency: 3 }, {
                csrfToken: current.csrfToken!, signal: controller.signal,
                onEvent: (event: ReportStreamEvent) => {
                  if (!stillCurrent()) return;
                  if (event.type === 'receipt') {
                    setCandidate(previous => previous?.runId === runId ? { ...previous, receipts: [...previous.receipts.filter(receipt => receipt.id !== event.id), { id: event.id, nodeId: event.nodeId, status: event.status }] } : previous);
                    return;
                  }
                  if (event.type === 'evidence_gap') {
                    const gapMsg = event.phase === 'gap_detected'
                      ? `检测到 ${Math.max(1, event.count ?? 1)} 处待补充的数据分析项，正在自动补跑统计结果…`
                      : event.phase === 'gap_supplemented'
                        ? `已自动补充 ${event.count ?? 0} 项统计结果，继续按实证数据撰写章节…`
                        : '已基于现有统计结果继续撰写报告章节…';
                    replace(waiting.id, { lines: [[span(gapMsg, 'dim')]], chips: [{ label: '查看本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${runId}` } }] });
                    return;
                  }
                  if (event.report || event.pack) setCandidate(previous => previous?.runId === runId ? { ...previous, preview: event.report ?? event.pack!.report } : previous);
                  if (event.sectionId && event.trace) seenSections.set(event.sectionId, { paragraphs: event.trace.status === 'llm_generated' ? event.trace.keptParagraphs : 0, facts: event.trace.status === 'llm_generated' ? event.trace.citedFacts : [] });
                  const sections = [...seenSections.values()];
                  setReportWriting(run.scope, previous => ({ ...previous, phase: event.phase, completed: event.completed, total: event.total, paragraphs: sections.reduce((sum, section) => sum + section.paragraphs, 0), facts: new Set(sections.flatMap(section => section.facts)).size, lastSectionId: event.sectionId ?? previous.lastSectionId, lastSectionTitle: event.title ?? previous.lastSectionTitle, autoFollow: autoFollowRef.current }));
                  if (event.type === 'section' && event.report && event.sectionId) {
                    const section = event.report.report.find(item => item.id === event.sectionId);
                    if (section && event.trace?.status === 'llm_generated') choreo.animateIncomingSection(section, event.report);
                    if (autoFollowRef.current) pickSection(event.sectionId);
                  }
                  if (event.type === 'repair' && event.report && event.revisions?.length) choreo.runReviewAndFormatChoreography(event.report, event.revisions);
                  replace(waiting.id, { lines: [[span(`候选稿已处理 ${event.completed}/${event.total} 节；所有内容仍待完整检查与审阅。`, 'dim')]], chips: [{ label: '查看本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${runId}` } }] });
                },
              });
              if (!stillCurrent()) return;
              setCandidate(previous => previous?.runId === runId ? { ...previous, preview: result.report, pack: result.pack, result, pending: false } : previous);
              setReportWriting(run.scope, previous => ({ ...previous, active: false, phase: 'done', completed: result.summary.totalSectionsGenerated, total: result.summary.totalSectionsGenerated, paragraphs: result.summary.totalParagraphsWritten, facts: result.summary.totalFactsCited }));
              mark(waiting.id, result.summary.llmSuccessCount > 0 ? 'ready' : 'failed', undefined, undefined, result.summary.usageReported ? { inputTokens: result.summary.promptTokens, outputTokens: result.summary.completionTokens } : undefined);
              replace(waiting.id, { lines: [[span(`本轮模型写成 ${result.summary.llmSuccessCount}/${result.summary.totalSectionsGenerated} 节，${result.summary.fallbackCount} 节待补写。`, 'strong')], [span(result.quality.status === 'blocked' ? '存在阻断项，暂不能采纳。请查看候选稿审阅工作台。' : '候选稿已就绪，请检查证据、实际修订和原稿差异后采纳。', 'dim')], [span(result.summary.usageReported ? `服务商报告输入 ${result.summary.promptTokens} / 输出 ${result.summary.completionTokens} 词元。` : '服务商未完整报告用量；未推算词元或费用。', 'dim')]], chips: [{ label: '查看本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${runId}` } }] });
              if (result.revisions.length) choreo.runReviewAndFormatChoreography(result.report, result.revisions); else choreo.stop();
            } catch (error) {
              if (!handle) { if (sameReportRunScope(requestScope, readReportScope())) say([span('无法核对本次资料版本，尚未启动生成。请重新检查资料。', 'error')]); return; }
              if (activeReportRun.current !== handle || handle.controller.signal.aborted || !sameReportRunScope(handle.scope, readReportScope()) || !threads.threadOf(handle.messageId)) return;
              const notice = error instanceof HostedApiError ? error.message : '连接或结果校验未完成，原稿已保留。请先核对本轮调用回执。';
              setCandidate(previous => previous?.runId === handle!.runId ? { ...previous, pending: false, failed: notice } : previous);
              setReportWriting(handle.scope, previous => ({ ...previous, active: false, phase: 'failed' })); choreo.stop();
              const resolveFailureStatus =
                (globalThis as { fullReportFailureStatus?: FullReportClientModule['fullReportFailureStatus'] })
                  .fullReportFailureStatus ??
                (typeof loadedFullReportClientMod !== 'undefined' && loadedFullReportClientMod
                  ? loadedFullReportClientMod.fullReportFailureStatus
                  : (err: unknown): 'refused' | 'unknown' =>
                      err instanceof HostedApiError && err.status >= 400 && err.status < 500 ? 'refused' : 'unknown');
              mark(handle.messageId, resolveFailureStatus(error));
              replace(handle.messageId, { lines: [[span(notice, 'error')]], chips: [{ label: '核对本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${handle.runId}` } }] });
            } finally {
              if (handle) finishCall(handle.messageId);
              if (handle && activeReportRun.current === handle) activeReportRun.current = null;
              if (preparingReport.current === preparation) preparingReport.current = null;
            }
          })();
          break;
        }
        case 'loadBenchmark': {
          const source = latest.current.reportSource, scope = latest.current.reportScope, activeThread = threads.view(latest.current.owner).active;
          if (activeReportRun.current || hasUserResearchSource(source)) { say([span('当前已有生成任务或用户资料。请先完成任务，或切换到空白项目再载入教学模拟。', 'dim')]); break; }
          setStage('paper'); closePanel();
          void loadBenchmark(action.benchmarkId).then(loaded => {
            if (latest.current.reportScope !== scope || threads.view(latest.current.owner).active !== activeThread) return;
            if (!loaded) { say([span('教学模拟未载入，当前工作区已保留。请核对资料来源。', 'dim')]); return; }
            setCandidate(null); choreo.stop();
            say([span('已载入明确标注的教学模拟研究。模拟结果由分析引擎计算，不能作为真实调研证据；叙述性章节可另行生成候选稿。', 'dim')], [{ label: '生成模拟候选稿', action: { type: 'generateFullReport', topic: '', mode: 'demonstration' }, primary: true }]);
          });
          break;
        }
        case 'insertStudioBlock': {
          const cleanParagraphs = action.paragraphs.filter(p => typeof p === 'string' && p.trim()).slice(0, 12);
          const items: InsertItem[] = [
            ...(action.tableResult
              ? [{ kind: 'table' as const, result: action.tableResult, caption: (action.tableCaption ?? `${action.title}结果汇总`).trim().slice(0, 160) }]
              : []),
            ...cleanParagraphs.map(text => ({ kind: 'paragraph' as const, text })),
          ];
          if (!items.length) break;
          sendToReport({
            id: crypto.randomUUID(),
            node: action.node,
            source: '证见工坊',
            items,
          });
          setStage('paper');
          closePanel();
          say([span(`已将“${action.title}”写入报告对应章节，可随时在编辑器顶部撤销。`, 'dim')]);
          break;
        }
        case 'insertReference': {
          sendToReport({
            id: crypto.randomUUID(),
            node: 'references',
            source: '文献核验',
            items: [{ kind: 'reference', entry: action.entry }],
          });
          setStage('paper');
          closePanel();
          say([span(`已核验并登记参考文献“${action.entry.title.slice(0, 32)}”至目录，可随时在编辑器顶部撤销。`, 'dim')]);
          break;
        }
        case 'insertFinding': {
          const items: InsertItem[] = [
            { kind: 'finding', finding: action.finding, ...(action.result ? { result: action.result } : {}) },
            ...(action.paragraph && action.paragraph.trim() ? [{ kind: 'paragraph' as const, text: action.paragraph.trim() }] : []),
          ];
          sendToReport({
            id: crypto.randomUUID(),
            node: action.node || 'conclusion.findings',
            source: '研究发现登记',
            items,
          });
          setStage('paper');
          closePanel();
          say([span(`已登记研究发现“${action.finding.title.slice(0, 32)}”并同步至报告，可随时在编辑器顶部撤销。`, 'dim')]);
          break;
        }
        case 'draftLocalQuestionnaire': {
          const snap = latest.current;
          const waitingMsg: Message = {
            ...stamp(),
            role: 'agent',
            model: {
              service: snap.effectiveBrain.provider,
              provider: snap.effectiveBrain.preset,
              modelName: snap.effectiveBrain.model,
              step: 1,
              status: 'running',
            },
            turn: { lines: [[span(`已确认请求，正在连接“${snap.effectiveBrain.provider}”起草“${action.brief.slice(0, 28)}”结构化问卷初稿…`, 'dim')]] },
          };
          threads.append([waitingMsg]);
          const jsonPrompt = [
            `请围绕调研主题“${action.brief}”设计一份可直接用于全国大学生市场调查与分析大赛的高信效度问卷，仅输出纯 JSON 对象，字段依次包含 title（问卷主标题）、objective（一句研究目的）、population（目标总体说明）、introduction（匿名卷首语）以及 questions 数组。`,
            '每道题目对象包含 text（题干）、type（single、multi、likert 或 text）、purpose（screening、background 或 research）、construct（构念名称）、analysis（routing、description、comparison、association、measurement 或 coding）、decisionUse（统计用途）及 choices（文字选项列表）。',
            '问卷须在首题设置准入甄别题，配置 2 道互斥穷尽的人口学特征题，围绕核心构念拆解 4 至 6 道五级李克特量表题，并在末尾设置 1 道开放建议题，总题量控制在 8 至 10 题。',
          ].join('\n');
          void sendBrainTurn({
            message: jsonPrompt,
            history: [],
            context: chatContext(snap.panel, snap.light, snap.traces, snap.held),
            step: 1,
            noTools: true,
            ...(snap.customBrain ? { custom: snap.customBrain } : {}),
          }).then((resp) => {
            const cur = latest.current;
            const built = buildLocalQuestionnaireFromReply(action.brief, resp.reply);
            const src = cur.reportSource;
            cur.applyCandidate({
              design: built,
              dataset: src.dataset ?? null,
              report: src.report ?? cur.blankReport,
              blueprint: decomposeShellTopic(built.title, built),
            }, src);
            go('design');
            threads.patch(waitingMsg.id, m => m.role === 'agent' ? {
              ...m,
              model: {
                service: resp.provider,
                provider: cur.effectiveBrain.preset,
                modelName: resp.model,
                step: 1,
                status: 'ready',
                usage: resp.usage ?? undefined,
                latencyMs: resp.latencyMs,
              },
              turn: {
                lines: [
                  [span('已为你生成本地研究问卷 '), span(`“${built.title}”`, 'strong'), span(`（共 ${built.questions.length} 题），并同步打开右侧“问卷设计”面板。`)],
                  [span('你可以直接在右侧逐题微调量表构念与跳题条件，再切回“对话”继续规划抽样方案。', 'dim')],
                ],
                cards: [{
                  kind: 'tool',
                  title: `本地问卷草案已落盘 · ${built.questions.length} 题`,
                  columns: true,
                  lines: built.questions.slice(0, 6).map(q => [span(`${q.variable} · ${q.construct}`, 'teal'), span(q.text)]),
                  links: [
                    { label: '定位到问卷设计器', action: { type: 'open', room: 'design' }, primary: true },
                    {
                      label: '用硅基样本预测试',
                      action: {
                        type: 'siliconTheater',
                        topic: built.title,
                        templateKey: inferSiliconTemplate(`${built.title} ${built.population}`),
                        size: 24,
                        autoPlay: true,
                        design: built,
                      },
                    },
                  ],
                }],
                chips: [
                  {
                    label: '启动内置硅基预测试',
                    action: {
                      type: 'siliconTheater',
                      topic: built.title,
                      templateKey: inferSiliconTemplate(`${built.title} ${built.population}`),
                      size: 24,
                      autoPlay: true,
                      design: built,
                    },
                    primary: true,
                  },
                ],
              },
            } : m);
          }).catch((error) => {
            const cur = latest.current;
            const built = buildLocalQuestionnaireFromReply(action.brief, '');
            const src = cur.reportSource;
            cur.applyCandidate({
              design: built,
              dataset: src.dataset ?? null,
              report: src.report ?? cur.blankReport,
              blueprint: decomposeShellTopic(built.title, built),
            }, src);
            go('design');
            threads.patch(waitingMsg.id, m => m.role === 'agent' ? {
              ...m,
              model: { service: cur.effectiveBrain.provider, provider: cur.effectiveBrain.preset, modelName: cur.effectiveBrain.model, step: 1, status: 'ready' },
              turn: {
                lines: [
                  [span('在线服务响应超时，已启用内置结构化模板生成 '), span(`“${built.title}”`, 'strong'), span(`（共 ${built.questions.length} 题，${(error as Error)?.message ?? '连接超时'}），可直接编辑。`, 'dim')],
                ],
                chips: [
                  { label: '查看问卷设计', action: { type: 'open', room: 'design' }, primary: true },
                  {
                    label: '用硅基样本预测试',
                    action: {
                      type: 'siliconTheater',
                      topic: built.title,
                      templateKey: inferSiliconTemplate(`${built.title} ${built.population}`),
                      size: 24,
                      autoPlay: true,
                      design: built,
                    },
                  },
                ],
              },
            } : m);
          });
          break;
        }
        case 'siliconTheater': {
          launchSiliconTheater({
            topic: action.topic,
            templateKey: action.templateKey,
            size: action.size,
            design: action.design,
            openCopilot: false,
          });
          break;
        }
      }
    };
    const answer = (id: string, answered: 'confirmed' | 'cancelled', action?: AgentAction) => {
      if (answered === 'confirmed' && action && (action.type === 'chat' || action.type === 'draft')) {
        const accepted = perform(action);
        threads.patch(id, m => m.role === 'agent' ? { ...m, answered: accepted === false ? 'cancelled' : 'confirmed' } : m);
        return;
      }
      threads.patch(id, m => m.role === 'agent' ? { ...m, answered } : m);
      if (answered === 'confirmed' && action) perform(action);
      else focusInput();
    };
    return { send, perform, answer };
  }, [go, closePanel, setStage, pickSection, focusInput, sendToReport, loadBenchmark, choreo, blankReport, readReportScope, setReportWriting, startCall, finishCall, launchSiliconTheater]);

  const runBrainConversation = useCallback(async (rawText: string) => {
    const currentOwner = latest.current.owner;
    if (!currentOwner) return;
    if (rawText.length > TEXT_LIMIT) {
      threads.append([
        { ...stamp(), role: 'user', text: rawText },
        { ...stamp(), role: 'agent', turn: { lines: [[span(`单次提问最多 ${TEXT_LIMIT} 字，当前已有 ${rawText.length} 字；请精简或分段发送。`, 'error')]] } },
      ]);
      return;
    }

    brainAbortRef.current?.abort();
    const controller = new AbortController();
    brainAbortRef.current = controller;

    const currentBook = threads.view(currentOwner);
    const activeThread = currentBook.threads.find(t => t.id === currentBook.active) ?? null;
    const historyLines = chatHistory((activeThread?.messages ?? []).flatMap(chatLine));

    const userMsg: Message = { ...stamp(), role: 'user', text: rawText };
    const pendingMsg: Message = {
      ...stamp(),
      role: 'agent',
      model: {
        service: effectiveBrain.provider,
        provider: effectiveBrain.preset,
        modelName: effectiveBrain.model,
        step: 1,
        status: 'running',
      },
      turn: { lines: [[span(`正在连接“${effectiveBrain.provider}”梳理研究意图…`, 'dim')]] },
    };
    threads.append([userMsg, pendingMsg]);
    const homeThread = threads.threadOf(pendingMsg.id);
    const homeThreadId = homeThread?.id ?? null;
    const requestScope: WorkspaceIdentity = { owner: currentOwner, epoch: latest.current.identityEpoch,
      thread: homeThreadId, project: homeThread?.projectId ?? null };
    startCall(pendingMsg.id, currentOwner, requestScope.epoch);

    const stillCurrent = () =>
      !controller.signal.aborted &&
      sameWorkspaceIdentity(requestScope, readWorkspaceIdentity()) &&
      threads.threadOf(pendingMsg.id)?.id === homeThreadId &&
      Boolean(threads.find(pendingMsg.id));

    const ledger: ToolExecution[] = [];
    const stepTraces: BrainStepTrace[] = [];
    const reasoningParts: string[] = [];
    const collectedCards: NonNullable<AgentTurn['cards']> = [];
    const collectedChips: NonNullable<AgentTurn['chips']> = [];
    const usageTotals: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let hasUsage = false;
    let totalLatency = 0;
    let finalReply = '';
    let finalProvider = effectiveBrain.provider;
    let finalModel = effectiveBrain.model;
    let settledStep = 1;
    let lastToolTexts: string[] = [];

    const BRAIN_MAX_STEPS = 6;
    try {
      for (let step = 1; step <= BRAIN_MAX_STEPS; step++) {
        if (!stillCurrent()) return;
        settledStep = step;
        const snap = latest.current;
        if (step > 1) {
          threads.patch(pendingMsg.id, m =>
            m.role === 'agent'
              ? {
                  ...m,
                  model: m.model ? { ...m.model, step, status: 'running' } : m.model,
                  toolCalls: [...ledger],
                  turn: { lines: [[span(`已汇总 ${ledger.length} 项证见工具结果，正在完成第 ${step} 步综合研判…`, 'dim')]] },
                }
              : m,
          );
        }

        const resp = await sendBrainTurn(
          {
            message: rawText,
            history: historyLines,
            context: chatContext(snap.panel, snap.light, snap.traces, snap.held),
            step,
            ...(stepTraces.length ? { steps: stepTraces } : {}),
            ...(customBrain ? { custom: customBrain } : {}),
          },
          controller.signal,
        );
        if (!stillCurrent()) return;

        finalProvider = resp.provider;
        finalModel = resp.model;
        totalLatency += resp.latencyMs;
        if (resp.usage) {
          hasUsage = true;
          usageTotals.inputTokens += resp.usage.inputTokens;
          usageTotals.outputTokens += resp.usage.outputTokens;
        }
        if (resp.reasoning) reasoningParts.push(resp.reasoning);

        if (!resp.toolCalls.length || step >= BRAIN_MAX_STEPS) {
          finalReply = resp.reply || (lastToolTexts.length ? lastToolTexts.join('\n\n') : '已完成核查与工具调度。');
          break;
        }

        const toolsSchemaMod = await loadToolsSchema();
        if (!stillCurrent()) return;
        const stepOutputs: BrainStepTrace['toolOutputs'] = [];
        const seenKeys = new Set<string>();
        for (const tc of resp.toolCalls) {
          if (!stillCurrent()) return;
          const toolKey = `${tc.action.tool}:${JSON.stringify(tc.action.args)}`;
          const spec: AgentToolSpec | undefined = toolsSchemaMod.toolSpecById(tc.action.tool);
          const execItem: ToolExecution = {
            id: tc.id,
            tool: tc.action.tool,
            label: spec?.zhLabel ?? tc.action.tool,
            args: tc.action.args as Record<string, unknown>,
            status: 'running',
          };
          ledger.push(execItem);
          threads.patch(pendingMsg.id, m =>
            m.role === 'agent'
              ? {
                  ...m,
                  toolCalls: [...ledger],
                  turn: { lines: [[span(resp.reply || `正在调度“${execItem.label}”…`, 'dim')]] },
                }
              : m,
          );

          const startedToolAt = performance.now();
          if (seenKeys.has(toolKey)) {
            execItem.status = 'done';
            execItem.durationMs = 0;
            execItem.summary = '复用同一步查询结果';
            execItem.resultText = '同一步已执行过相同参数调用，直接复用观察结果。';
            stepOutputs.push({ toolCallId: tc.id, tool: tc.action.tool, text: execItem.resultText });
            continue;
          }
          seenKeys.add(toolKey);

          const cur = latest.current;
          let resultSummary = '';
          let toolOutputText = '';
          if (tc.action.tool === 'run_autonomous_research') {
            try {
              const usableTitle = (value?: string | null) => {
                const text = (value ?? '').trim();
                return text && text !== cur.blankReport.title ? text : '';
              };
              const sourceDataset = cur.reportSource.dataset ?? null;
              const sourceDesign = cur.reportSource.design ?? null;
              const goal = tc.action.args.goal?.trim()
                || usableTitle(cur.reportSource.report?.title)
                || usableTitle(cur.report?.title)
                || usableTitle(sourceDesign?.title)
                || usableTitle(cur.design?.title)
                || rawText.slice(0, 120);
              const {
                runAutonomousResearch,
                sanitizeAdvisorDisplayText,
                serializeDatasetForAutonomousSandbox,
              } = await loadAutonomousAgent();
              const canUseInline = Boolean(sourceDataset && sourceDataset.table.rows.length >= 10);
              const wantInline = tc.action.args.datasetMode !== 'planted_trap_benchmark' && canUseInline;
              const inlineDataset = wantInline ? serializeDatasetForAutonomousSandbox(sourceDesign, sourceDataset) : null;
              const effectiveMode = wantInline && inlineDataset ? 'inline_dataset' : 'planted_trap_benchmark';
              const run = await runAutonomousResearch(
                {
                  goal,
                  geography: '县域',
                  datasetMode: effectiveMode,
                  leaseMode: 'pi_autonomous',
                  maxToolCalls: 28,
                  projectId: cur.projectId ?? 'local-studio',
                  inlineDataset,
                },
                {
                  authenticated: cur.generation.account === 'ready',
                  projectId: cur.projectId,
                  csrfToken: cur.csrfToken,
                },
                controller.signal,
              );
              if (!stillCurrent()) return;
              const committed = await commitAutonomousRun(run);
              if (!stillCurrent()) return;
              const pivotCount = run.epistemicGraph.completeness.pivotCount;
              const pivotReasons = run.epistemicGraph.pivot_log.length
                ? run.epistemicGraph.pivot_log.map((p, idx) => `${idx + 1}. ${p.reason}`).join('；')
                : run.reasoningTrace.filter(s => s.pivotTaken).map((s, idx) => `${idx + 1}. ${s.pivotTaken}`).join('；') || '无';
              const snapshotTitles = run.registeredResults.map(r => `${r.title} (n=${r.n})`).join('；');
              collectedCards.push({
                kind: 'tool',
                title: '深度数据分析摘要',
                lines: [
                  [
                    span('有效样本 ', 'teal'),
                    span(`${run.datasetSummary.cleanedRowCount} / ${run.datasetSummary.rawRowCount}`, 'gold'),
                    span(' · 方法调整 ', 'dim'),
                    span(`${pivotCount}`, 'gold'),
                    span(' 次 · 产出结果 ', 'dim'),
                    span(`${run.registeredResults.length}`, 'gold'),
                    span(' 项', 'dim'),
                  ],
                  [span('核心结论 ', 'teal'), span(sanitizeAdvisorDisplayText(run.motherInsight.headline), 'strong')],
                  [span('复核状态 ', 'teal'), span(`${run.falsificationReport.decision === 'approve' ? '已通过' : '建议复核'}${committed ? ' · 已同步到项目报告' : ''}`, 'dim')],
                ],
                links: [{ label: '查看完整分析与风险提醒', action: { type: 'href', href: '#research/analysis' }, primary: true }],
              });
              const theaterChip = { label: '查看完整分析与风险提醒', action: { type: 'href' as const, href: '#research/analysis' } };
              if (!collectedChips.some(existing => existing.label === theaterChip.label)) {
                collectedChips.push(theaterChip);
              }
              execItem.status = 'done';
              execItem.action = { type: 'href', href: '#research/analysis' };
              resultSummary = `${run.datasetSummary.cleanedRowCount}/${run.datasetSummary.rawRowCount} 样本 · ${run.registeredResults.length} 项结果`;
              toolOutputText = [
                `样本规模 cleaned=${run.datasetSummary.cleanedRowCount}，raw=${run.datasetSummary.rawRowCount}，variables=${run.datasetSummary.variables}`,
                `方法调整共 ${pivotCount} 次（${pivotReasons}）`,
                `主要发现为${run.motherInsight.headline}`,
                `分化机理表现为${run.motherInsight.paradoxDetail}`,
                `复核决定为 ${run.falsificationReport.decision}`,
                `已登记结果共 ${run.registeredResults.length} 项（${snapshotTitles || '无'}）`,
              ].join('\n');
            } catch (autoErr) {
              if ((autoErr as Error)?.name === 'AbortError' || controller.signal.aborted) throw autoErr;
              const autoMsg = (autoErr as Error)?.message || '深度数据分析未能顺利完成。';
              execItem.status = 'error';
              execItem.action = { type: 'href', href: '#research/analysis' };
              resultSummary = `分析未完成 · ${autoMsg.slice(0, 30)}`;
              toolOutputText = `深度数据分析未能顺利完成（${autoMsg}）。请向用户如实说明原因并建议前往“数据与分析”模块手动重试，绝不编造统计量。`;
            }
          } else if (tc.action.tool === 'verify_citation') {
            const isCloudProject = cur.generation.account === 'ready' && Boolean(cur.projectId && !/^(?:local|demo)/i.test(cur.projectId));
            if (!isCloudProject) {
              collectedCards.push({
                kind: 'tool',
                title: '文献核验 · 请先登录项目',
                lines: [
                  [span('当前状态 ', 'teal'), span('处于未登录或本地演示模式，自动文献核验需登录并打开项目后启用。', 'dim')],
                  [span('替代操作 ', 'teal'), span('可前往邮箱登录，或打开“文献交叉引用”面板手动核对原文与页码后再引用。', 'dim')],
                ],
                links: [
                  { label: '邮箱登录 ↗', action: { type: 'href', href: '/login?next=/agent' }, primary: true },
                  { label: '前往成文与文献交叉引用', action: { type: 'stage', stage: 'paper' } },
                ],
              });
              for (const chip of [
                { label: '邮箱登录 ↗', action: { type: 'href' as const, href: '/login?next=/agent' }, primary: true as const },
                { label: '打开文献交叉引用工作台', action: { type: 'stage' as const, stage: 'paper' as const } },
              ]) {
                if (!collectedChips.some(existing => existing.label === chip.label)) collectedChips.push(chip);
              }
              execItem.status = 'done';
              execItem.action = { type: 'stage', stage: 'paper' };
              resultSummary = '请登录项目后核验文献';
              toolOutputText = '当前处于未登录或本地模式，未执行自动文献核验。请提示用户先登录并选择项目，或打开“文献交叉引用”面板手动核对原文后再引用，绝不编造文献或 DOI。';
            } else {
              try {
                const outcome = await executeChatCitationLookup({
                  projectId: cur.projectId!,
                  csrfToken: cur.csrfToken,
                  signal: controller.signal,
                  rawDoi: tc.action.args.doi,
                  rawQuery: tc.action.args.query,
                });
                if (!stillCurrent()) return;
                collectedCards.push(...outcome.cards);
                for (const chip of outcome.chips) {
                  if (!collectedChips.some(existing => existing.label === chip.label)) collectedChips.push(chip);
                }
                execItem.status = outcome.execStatus;
                execItem.action = outcome.execAction;
                resultSummary = outcome.resultSummary;
                toolOutputText = outcome.toolOutputText;
              } catch (citeErr) {
                if ((citeErr as Error)?.name === 'AbortError' || controller.signal.aborted) throw citeErr;
                const citeMsg = (citeErr as Error)?.message || '文献核验请求失败。';
                execItem.status = 'error';
                execItem.action = { type: 'stage', stage: 'paper' };
                resultSummary = `核验未完成 · ${citeMsg.slice(0, 28)}`;
                toolOutputText = `文献核验请求未能完成（${citeMsg}）。请向用户如实说明原因并建议前往“文献交叉引用”面板手动查证，绝不编造任何参考文献。`;
              }
            }
          } else if (tc.action.tool === 'render_sandbox_plot') {
            const isCloudProject = cur.generation.account === 'ready' && Boolean(cur.projectId && !/^(?:local|demo)/i.test(cur.projectId));
            if (!isCloudProject) {
              execItem.status = 'done';
              execItem.action = { type: 'href', href: '#research/analysis' };
              for (const chip of [
                { label: '邮箱登录 ↗', action: { type: 'href' as const, href: '/login?next=/agent' }, primary: true as const },
                { label: '打开交互绘图工坊', action: { type: 'say' as const, text: '/绘图' } },
              ]) {
                if (!collectedChips.some(existing => existing.label === chip.label)) collectedChips.push(chip);
              }
              resultSummary = '请登录项目后生成高清配图';
              toolOutputText = '当前处于未登录或本地模式，高清图表生成服务需要登录并打开项目后使用。请建议用户先登录，或直接调用交互绘图工坊（/绘图）绘制图表。';
            } else {
              try {
                const outcome = await executeChatSandboxPlot({
                  projectId: cur.projectId!,
                  csrfToken: cur.csrfToken,
                  signal: controller.signal,
                  availableResults: cur.reportSource.report?.quality?.results ?? cur.report?.quality?.results ?? [],
                  requestedSnapId: tc.action.args.snapshotId,
                  chartKind: tc.action.args.chartKind ?? 'auto',
                  saveArtifact: (title, svg) => saveStudioSvgArtifactRef.current(title, svg),
                });
                if (!stillCurrent()) return;
                collectedCards.push(...outcome.cards);
                for (const chip of outcome.chips) {
                  if (!collectedChips.some(existing => existing.label === chip.label)) collectedChips.push(chip);
                }
                execItem.status = outcome.execStatus;
                execItem.action = outcome.execAction;
                resultSummary = outcome.resultSummary;
                toolOutputText = outcome.toolOutputText;
              } catch (plotErr) {
                if ((plotErr as Error)?.name === 'AbortError' || controller.signal.aborted) throw plotErr;
                const plotMsg = (plotErr as Error)?.message || '生成高清配图失败。';
                execItem.status = 'error';
                execItem.action = { type: 'href', href: '#research/analysis' };
                resultSummary = `配图未完成 · ${plotMsg.slice(0, 28)}`;
                toolOutputText = `高清配图未能生成（${plotMsg}）。请向用户如实说明原因并建议前往“数据与分析”或“交互绘图工坊”重试。`;
              }
            }
          } else if (tc.action.tool === 'lookup_county' && cur.generation.account === 'ready' && Boolean(cur.projectId && !/^(?:local|demo)/i.test(cur.projectId))) {
            try {
              const outcome = await executeChatCountyLookup({
                projectId: cur.projectId!,
                signal: controller.signal,
                query: tc.action.args.query ?? '',
              });
              if (!stillCurrent()) return;
              collectedCards.push(...outcome.cards);
              for (const chip of outcome.chips) {
                if (!collectedChips.some(existing => existing.label === chip.label)) collectedChips.push(chip);
              }
              execItem.status = outcome.execStatus;
              execItem.action = outcome.execAction;
              resultSummary = outcome.resultSummary;
              toolOutputText = outcome.toolOutputText;
            } catch (countyErr) {
              if ((countyErr as Error)?.name === 'AbortError' || controller.signal.aborted) throw countyErr;
              const countyMsg = (countyErr as Error)?.message || '检索区县名录失败。';
              execItem.status = 'error';
              execItem.action = { type: 'stage', stage: 'library' };
              resultSummary = `区县检索未完成 · ${countyMsg.slice(0, 28)}`;
              toolOutputText = `区县风物检索未能完成（${countyMsg}）。请向用户如实说明原因并建议前往“资料库 → 中国县域风物志”手动查找。`;
            }
          } else {
          const routed = toolTurn(tc.action, {
            room: cur.panel,
            light: cur.light,
            theme: cur.theme,
            traces: cur.traces,
            results: cur.held,
            plan: cur.plan,
            projectTitle: cur.report?.title || cur.design?.title,
            design: cur.design,
            datasetName: cur.dataset?.name,
          });
          if ('draft' in routed) {
            const secTitle = blueprintNode(routed.draft).title;
            if (cur.generation.account === 'ready') {
              agent.perform({ type: 'draftSection', node: routed.draft });
              execItem.status = 'awaiting_confirm';
              resultSummary = `已呼出“${secTitle}”起草门控`;
              toolOutputText = `已弹出“${secTitle}”托管起草确认门控，等待用户确认后拟稿。`;
            } else {
              agent.perform({ type: 'open', room: 'editor' });
              collectedCards.push({
                kind: 'tool',
                title: `章节共创起草 · ${secTitle}`,
                lines: [
                  [span('当前处于免登录体验模式，已为您打开写作工作台；请在下方审阅结构化初稿并手动保存。', 'dim')],
                ],
                links: [
                  { label: '切入写作润色工坊', action: { type: 'say', text: '/撰稿' } },
                  { label: '定位到报告与 PPT', action: { type: 'open', room: 'editor' } },
                ],
              });
              execItem.status = 'done';
              execItem.summary = `已就绪“${secTitle}”共创起草`;
              execItem.action = { type: 'open', room: 'editor' };
              toolOutputText = `当前处于免登录体验模式，未触发云端登录门控；已在右侧打开“${secTitle}”章节与报告编辑器，请直接在当前回复中给出符合实证口径的结构化章节草稿。`;
            }
          } else if ('generate' in routed) {
            if (cur.generation.account === 'ready') {
              threads.appendAfter(pendingMsg.id, { ...stamp(), role: 'agent', turn: cur.generation.start(routed.generate) });
              execItem.status = 'awaiting_confirm';
              resultSummary = '已生成问卷草案确认卡';
              toolOutputText = `已在对话下方弹出问卷草案生成确认卡片：${routed.generate.slice(0, 100)}。`;
            } else {
              const gateTurn = buildGuestDraftGateTurn(routed.generate, effectiveBrain.provider, effectiveBrain.model);
              threads.appendAfter(pendingMsg.id, { ...stamp(), role: 'agent', turn: gateTurn });
              execItem.status = 'awaiting_confirm';
              resultSummary = '已生成本地问卷确认卡';
              execItem.action = { type: 'open', room: 'design' };
              toolOutputText = `已在对话下方弹出本地问卷生成确认卡片（需用户点击“确认生成本地问卷”后才会调用模型写入“问卷设计”面板）。请向用户简要说明本问卷将拆解的关键构念维度、甄别逻辑与量表设计思路，不要要求用户登录。`;
            }
          } else if ('lookup' in routed) {
            for (const s = Date.now(); stillCurrent() && !latest.current.knowledge.ready && Date.now() - s < 8000;) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            if (!stillCurrent()) return;
            let found: AgentTurn;
            if (!latest.current.knowledge.ready) {
              found = { lines: [[span('知识镜词条目录正在准备，请稍后再试。', 'dim')]] };
              execItem.status = 'error';
              resultSummary = '知识镜词条准备中';
            } else {
              try {
                found = lookupTurn(routed.lookup, await latest.current.knowledge.search(routed.lookup), routed.explicit);
                execItem.status = 'done';
                resultSummary = found.cards?.length ? `命中“${routed.lookup}”词条` : `完成知识镜检索`;
              } catch {
                found = { lines: [[span('知识镜检索暂时无响应。', 'error')]] };
                execItem.status = 'error';
                resultSummary = '知识镜检索失败';
              }
            }
            if (found.cards?.length) collectedCards.push(...found.cards);
            toolOutputText = turnText(found);
            execItem.action = found.cards?.[0]?.kind === 'entry' ? { type: 'entry', id: found.cards[0].id } : { type: 'search' };
          } else {
            let turnOut: AgentTurn;
            let heavyError = false;
            if ('lookupCounty' in routed || 'recommendResource' in routed) {
              try {
                const { resolveHeavyRouted } = await import('@/lib/agent/router-heavy-actions');
                turnOut = await resolveHeavyRouted(routed);
              } catch {
                heavyError = true;
                turnOut = { lines: [[span('资料库检索暂时无响应。', 'error')]] };
              }
              if (!stillCurrent()) return;
            } else {
              turnOut = routed.turn;
            }
            const hasGateCard = Boolean(turnOut.cards?.some(c => c.kind === 'confirm' || c.kind === 'consent' || c.kind === 'job' || c.kind === 'proposal'));
            if (hasGateCard) {
              threads.appendAfter(pendingMsg.id, { ...stamp(), role: 'agent', turn: turnOut });
              execItem.status = 'awaiting_confirm';
            } else {
              execItem.status = heavyError ? 'error' : 'done';
              if (turnOut.cards?.length) collectedCards.push(...turnOut.cards);
              if (turnOut.chips?.length) {
                for (const chip of turnOut.chips) {
                  if (!collectedChips.some(existing => existing.label === chip.label)) collectedChips.push(chip);
                }
              }
            }
            if (turnOut.act) {
              agent.perform(turnOut.act);
              if ((turnOut.act.type === 'stage' && turnOut.act.stage !== 'chat') || turnOut.act.type === 'loadBenchmark') {
                setCopilotOpen(true);
              }
            }
            toolOutputText = turnText(turnOut);
            const preview = toolOutputText.replace(/\s+/gu, ' ').trim();
            resultSummary = preview.slice(0, 40) + (preview.length > 40 ? '…' : '');
            if (tc.action.tool === 'open') {
              execItem.action = { type: 'open', room: tc.action.args.room };
              if (tc.action.args.room === 'silicon' && !collectedCards.some(c => c.kind === 'silicon-theater')) {
                const snap = latest.current;
                const studio = buildSiliconTheaterCardData(
                  {
                    room: snap.panel,
                    light: snap.light,
                    theme: snap.theme,
                    traces: snap.traces,
                    results: snap.held,
                    plan: snap.plan,
                    projectTitle: snap.report?.title || snap.design?.title,
                    design: snap.design,
                    datasetName: snap.dataset?.name,
                  },
                  rawText,
                );
                collectedCards.push({
                  kind: 'silicon-theater',
                  title: `硅基预测试推演 · 《${studio.shortTitle}》`,
                  studio,
                });
                if (!collectedChips.some(ch => ch.action.type === 'siliconTheater')) {
                  collectedChips.unshift({
                    label: '启动内置硅基推演',
                    action: {
                      type: 'siliconTheater',
                      topic: studio.topic,
                      templateKey: studio.templateKey,
                      size: studio.size,
                      autoPlay: true,
                    },
                    primary: true,
                  });
                }
                if (/(atypica|推演|剧场|深访|焦点小组|1[:：]1)/iu.test(rawText)) {
                  launchSiliconTheater({
                    topic: studio.topic,
                    templateKey: studio.templateKey,
                    size: studio.size,
                  });
                }
              }
            }
            else if (tc.action.tool === 'simulate') {
              execItem.action = {
                type: 'siliconTheater',
                topic: tc.action.args.topic || latest.current.design?.title || rawText,
                autoPlay: true,
              };
            }
            else if (tc.action.tool === 'stage') execItem.action = { type: 'stage', stage: tc.action.args.view };
            else if (tc.action.tool === 'light' || tc.action.tool === 'blind' || tc.action.tool === 'next') execItem.action = { type: 'open', room: 'overview' };
            else if (tc.action.tool === 'results') execItem.action = { type: 'open', room: 'analysis' };
            else if (tc.action.tool === 'trace') execItem.action = { type: 'open', room: 'editor' };
            else if (tc.action.tool === 'recommend_resource' || tc.action.tool === 'lookup_county') execItem.action = { type: 'stage', stage: 'library' };
          }
          }

          execItem.durationMs = Math.max(1, Math.round(performance.now() - startedToolAt));
          execItem.summary = resultSummary || execItem.label;
          execItem.resultText = toolOutputText.slice(0, 1200);
          stepOutputs.push({ toolCallId: tc.id, tool: tc.action.tool, text: toolOutputText.slice(0, 1800) });
        }

        if (!stillCurrent()) return;
        lastToolTexts = stepOutputs.map(o => o.text);
        threads.patch(pendingMsg.id, m => m.role === 'agent' ? { ...m, toolCalls: [...ledger] } : m);
        stepTraces.push({
          assistantContent: resp.reply,
          assistantToolCalls: resp.rawToolCalls,
          toolOutputs: stepOutputs,
        });
      }

      if (!stillCurrent()) return;
      const totalUsage = hasUsage ? { ...usageTotals } : null;
      const renderedReplyLines = replyLines(finalReply);
      threads.patch(pendingMsg.id, m =>
        m.role === 'agent'
          ? {
              ...m,
              model: {
                service: finalProvider,
                provider: effectiveBrain.preset,
                modelName: finalModel,
                step: settledStep,
                status: 'ready',
                usage: totalUsage ?? undefined,
                latencyMs: totalLatency,
              },
              ...(reasoningParts.length ? { reasoning: reasoningParts.join('\n\n') } : {}),
              ...(ledger.length ? { toolCalls: [...ledger] } : {}),
              turn: {
                lines: renderedReplyLines.length
                  ? renderedReplyLines
                  : [[span(`${finalProvider} · 已完成工具协同调度。`, 'dim')]],
                ...(collectedCards.length ? { cards: collectedCards.slice(0, 3) } : {}),
                ...(collectedChips.length ? { chips: collectedChips.slice(0, 5) } : {}),
              },
            }
          : m,
      );
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || controller.signal.aborted) return;
      if (!stillCurrent()) return;
      const errMsg = (error as Error)?.message || '对话服务请求未完成。';
      threads.patch(pendingMsg.id, m =>
        m.role === 'agent'
          ? {
              ...m,
              model: {
                service: effectiveBrain.provider,
                provider: effectiveBrain.preset,
                modelName: effectiveBrain.model,
                step: settledStep,
                status: 'failed',
              },
              ...(ledger.length ? { toolCalls: [...ledger] } : {}),
              turn: {
                lines: [[span('本轮回复未能完成，', 'error'), span(errMsg)]],
                chips: [
                  { label: '重试这一句', action: { type: 'say', text: rawText }, primary: true },
                  { label: '检查服务配置', action: { type: 'open', room: 'services' } },
                ],
              },
            }
          : m,
      );
    } finally {
      finishCall(pendingMsg.id);
      if (brainAbortRef.current === controller) brainAbortRef.current = null;
    }
  }, [agent, commitAutonomousRun, customBrain, effectiveBrain, finishCall, launchSiliconTheater, readWorkspaceIdentity, setCopilotOpen, startCall]);

  const dispatchUserMessage = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const snap = latest.current;
    if (snap.stage !== 'chat' || snap.expanded) setCopilotOpen(true);
    if (/^[/／]密钥(?:\s|$)|\bsk-[A-Za-z0-9_-]{12,}/u.test(text) || /^[/／]/u.test(text) || snap.chatMode === 'command') {
      agent.send(text);
      return;
    }
    if (snap.generation.account === 'ready' && snap.chatService) {
      agent.send(text);
      return;
    }
    const openResult = snap.outputId && snap.liveReport ? snap.liveReport.quality?.results.find(r => r.id === snap.outputId) : undefined;
    if (openResult && ABOUT_FIGURE_RE.test(text)) {
      if (loadedFigureTweakMod) {
        if (loadedFigureTweakMod.parseFigureRequest(text)) {
          agent.send(text);
          return;
        }
      } else {
        void loadFigureTweak().then(mod => {
          if (mod.parseFigureRequest(text)) {
            agent.send(text);
            return;
          }
          if (effectiveBrain.available) void runBrainConversation(text);
          else agent.send(text);
        });
        return;
      }
    }
    if (effectiveBrain.available) {
      void runBrainConversation(text);
      return;
    }
    agent.send(text);
  }, [agent, effectiveBrain.available, runBrainConversation, setCopilotOpen]);

  const performAction = useCallback((action: AgentAction) => {
    if (action.type === 'say') {
      dispatchUserMessage(action.text);
      return;
    }
    agent.perform(action);
  }, [agent, dispatchUserMessage]);

  const sendRef = useRef(dispatchUserMessage);
  useLayoutEffect(() => { sendRef.current = dispatchUserMessage; }, [dispatchUserMessage]);
  const handoffTextRef = useRef<string | null>(null);
  useEffect(() => {
    if (!owner) return;
    if (!handoffTextRef.current) {
      try {
        const raw = window.sessionStorage.getItem(AGENT_HANDOFF_KEY);
        if (raw) {
          window.sessionStorage.removeItem(AGENT_HANDOFF_KEY);
          const text = parseHandoffPayload(raw);
          if (text) handoffTextRef.current = text;
        }
      } catch { /* Ignore storage failures. */ }
    }
    const text = handoffTextRef.current;
    if (!text) return;
    const timer = window.setTimeout(() => {
      if (handoffTextRef.current !== text) return;
      handoffTextRef.current = null;
      setStage('chat');
      sendRef.current(text);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [owner, setStage]);

  // The toolbar writes into the section in view through the editor, as one undoable step; the paper shows it at once.
  const insertIntoSection = useCallback((items: InsertItem[]) => {
    if (visibleCandidate) return;
    const section = paperContent.report.find(s => s.id === pickedSection);
    if (!section) return;
    sendToReport({ id: crypto.randomUUID(), node: matchBlueprintNode(section.title)?.id ?? '', source: '报告工具栏', items, sectionId: section.id });
  }, [paperContent, pickedSection, sendToReport, visibleCandidate]);
  // A writing tool opens the copilot and says its command there, as if typed.
  const sayFromTool = useCallback((text: string) => { setCopilotOpen(true); dispatchUserMessage(text); }, [dispatchUserMessage, setCopilotOpen]);
  const sendFromDock = useCallback((text: string) => {
    dispatchUserMessage(text);
  }, [dispatchUserMessage]);

  // Lookups wait for the knowledge index, then answer in place of their placeholder, in their own conversation.
  const pendingLookup = useMemo(() => book.threads.flatMap(t => t.messages).find(m => m.role === 'pending'), [book]);
  const { ready: knowledgeReady, search } = knowledge;
  useEffect(() => {
    if (pendingLookup?.role !== 'pending' || !knowledgeReady) return;
    let live = true;
    const settle = (turn: AgentTurn) => threads.patch(pendingLookup.id, () => ({ id: pendingLookup.id, at: Date.now(), role: 'agent', turn }));
    search(pendingLookup.query)
      .then(hits => { if (live) settle(lookupTurn(pendingLookup.query, hits, pendingLookup.explicit)); })
      .catch(() => { if (live) settle({ lines: [[{ text: '知识镜暂时没有回应，请稍后再问。', mark: 'error' }]] }); });
    return () => { live = false; };
  }, [pendingLookup, knowledgeReady, search]);

  // "/" anywhere outside a field starts a command, bringing the conversation back if the panel fills the screen;
  // Ctrl B folds the sidebar; Ctrl \ closes or reopens the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) focusInput();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'b') { event.preventDefault(); latest.current.toggleSide(); }
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        const reopen = latest.current.lastPanel;
        if (currentPanel()) window.location.hash = ''; else if (reopen) window.location.hash = reopen.hash;
      }
      if (event.key === 'Escape') setRailMenu(null);
      if (!typing && (event.key === '[' || event.key === ']') && !event.ctrlKey && !event.metaKey && !event.altKey) latest.current.stepSection(event.key === ']' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusInput]);

  // The panel is widened or narrowed by dragging its edge; the width is remembered in this browser.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = Math.min(panelWidth, available);
    const limit = () => Math.max(MIN_PANEL, window.innerWidth - RAIL - GUTTERS - (sideOpen ? (activeStudio ? 412 : SIDEBAR) : 0) - MIN_TALK);
    setDragging(true);
    const move = (e: PointerEvent) => setPanelWidth(Math.round(Math.min(limit(), Math.max(MIN_PANEL, startWidth + startX - e.clientX))));
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPanelWidth(width => { try { if (width) window.localStorage.setItem(PANEL_KEY, String(width)); } catch { /* Not remembered without storage. */ } return width; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const services = eligibleModelServices('research', lists.services).map(s => ({ id: s.id, label: s.label, detail: `${s.model} · v${s.revision}` }));
  const email = account?.user?.email ?? '';
  const here = panel ? roomById(panel) : null, lit = panel ? roomLight(light, panel) : null;
  const outputs = [...(held?.results ?? [])].reverse().map(r => ({ id: r.id, title: r.title, detail: `${METHOD_LABELS[r.method] ?? r.method} · 有效样本 ${r.n}` }));
  const stages = STAGES.map(id => ({ id, name: roomById(id).name, glyph: roomById(id).glyph, score: roomLight(light, id)?.score ?? null }));
  // The work in view: the call still running in this conversation, and what its model calls have cost so far.
  const running = messages.find(m => m.role === 'agent' && m.model?.status === 'running') as Extract<Message, { role: 'agent' }> | undefined;
  const looking = messages.some(m => m.role === 'pending');
  const spent = messages.reduce((sum, m) => m.role === 'agent' && m.model?.usage ? { inputTokens: sum.inputTokens + m.model.usage.inputTokens, outputTokens: sum.outputTokens + m.model.usage.outputTokens } : sum, { inputTokens: 0, outputTokens: 0 });
  const today = useSyncExternalStore(subscribeNothing, startOfToday, () => 0);
  const todayTokens = book.threads.reduce((total, t) => total + t.messages.reduce((sum, m) => m.role === 'agent' && m.at >= today && m.model?.usage ? sum + m.model.usage.inputTokens + m.model.usage.outputTokens : sum, 0), 0);
  const exportThread = thread && messages.length > 0 ? () => exportRecord(thread) : null;

  const studioPreviewKey = useMemo(() => JSON.stringify([visibleCandidate?.runId ?? null, paperContent]), [visibleCandidate?.runId, paperContent]);

  const studioIdentity = useMemo<StudioPublicationIdentity>(() => ({ owner, epoch: identityEpoch, thread: artifactThreadId || null,
    project: artifactProjectId, sourceKey, previewKey: studioPreviewKey, pending: !!reportSource.inputPending || !!visibleCandidate?.pending || !!liveWriting?.active }),
  [owner, identityEpoch, artifactThreadId, artifactProjectId, sourceKey, studioPreviewKey, reportSource.inputPending, visibleCandidate?.pending, liveWriting?.active]);
  const latestStudioIdentity = useRef(studioIdentity);
  useLayoutEffect(() => { latestStudioIdentity.current = studioIdentity; }, [studioIdentity]);
  const studioResultCurrent = useCallback((expected: StudioPublicationIdentity) => canPublishStudioResult(expected,
    { ...latestStudioIdentity.current, ...readWorkspaceIdentity(), sourceKey: reportSourceKey(latest.current.reportSource) }), [readWorkspaceIdentity]);

  const commitStudioReport = useCallback((nextContent: EditorContent, message: string, nextDesign?: Questionnaire | null) => {
    if (!studioResultCurrent(studioIdentity)) {
      setReviewNotice('原稿、候选稿或所在项目已变化，请根据当前材料重新生成这项成果。');
      return;
    }
    if (visibleCandidate && !visibleCandidate.pending) {
      setCandidate(prev =>
        prev?.runId === visibleCandidate.runId && prev.preview === visibleCandidate.preview
          ? {
              ...prev,
              preview: nextContent,
              ...(prev.pack ? { pack: { ...prev.pack, report: nextContent } } : {}),
            }
          : prev,
      );
      setStage('paper');
      setReviewNotice(`${message}（已同步至当前候选稿预览，采纳后永久落盘）`);
      return;
    }
    // This is the source captured when the studio received its input, never whichever project is now visible.
    const source = reportSource;
    const resolvedDesign = nextDesign ?? source.design ?? newQuestionnaire();
    const outcome = applyCandidate({
      design: resolvedDesign,
      dataset: source.dataset ?? null,
      report: nextContent,
      blueprint: decomposeShellTopic(nextContent.title || resolvedDesign.title || '专题实证调研', resolvedDesign),
    }, source);
    setStage('paper');
    if (outcome === 'applied') {
      setReviewNotice(message);
      threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span(message, 'dim')]] } }]);
    } else {
      setReviewNotice('工作区资料正在同步中，请稍候片刻重试写入。');
    }
  }, [applyCandidate, reportSource, setStage, studioIdentity, studioResultCurrent, visibleCandidate]);

  const saveStudioSvgArtifact = useCallback((title: string, svg: string) => {
    if (!studioResultCurrent(studioIdentity)) return;
    const cleanName = title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || 'evix-studio-asset';
    void artifacts.onImport(
      new File([new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })], `${cleanName}.svg`, { type: 'image/svg+xml' }),
      'diagram',
      { origin: '证见创作工坊', classification: 'simulated' },
    );
  }, [artifacts, studioIdentity, studioResultCurrent]);
  useLayoutEffect(() => { saveStudioSvgArtifactRef.current = saveStudioSvgArtifact; });

  const addSteeringNote = useCallback((raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    setSteeringNotes(prev => (prev.includes(clean) ? prev : [...prev.slice(-7), clean]));
  }, []);

  const rewriteSectionWithIdea = useCallback((sectionId: string, quote: string, idea: string) => {
    const secTitle = paperContent.report.find(s => s.id === sectionId)?.title ?? sectionId;
    addSteeringNote(`${secTitle} · ${idea}`);
    setAnnotations(prev => prev.map(a => a.sectionId === sectionId && a.note === idea ? { ...a, status: 'applied' } : a));
    sayFromTool(`请起草“${secTitle}”：结合选段“${quote.slice(0, 48)}”，按“${idea}”精修重写`);
  }, [paperContent.report, addSteeringNote, sayFromTool]);

  const handleSelectionAction = useCallback((sel: PaperSelectionAction) => {
    if (sel.action === 'qa') {
      const tokens = sel.text.split(/[\s，。、；！？（）()]+/u).filter(t => t.length >= 2).slice(0, 6);
      setQaHighlightTerms(tokens.length ? tokens : [sel.text.slice(0, 12)]);
      setSideOpen(true);
      setActiveStudio('qa');
      pickSection(sel.sectionId);
      return;
    }
    const idea = quickSteeringDraft.trim() || (sel.action === 'rewrite' ? '增强因果分析密度与数据佐证，精简空泛套话' : '待复核论据与统计口径');
    setAnnotations(prev => [
      { id: `ann-${Date.now().toString(36)}`, sectionId: sel.sectionId, quote: sel.text, note: idea, status: sel.action === 'rewrite' ? 'applied' : 'open' },
      ...prev.slice(0, 29),
    ]);
    setSideOpen(true);
    setActiveStudio('steering');
    if (sel.action === 'rewrite') {
      setQuickSteeringDraft('');
      rewriteSectionWithIdea(sel.sectionId, sel.text, idea);
    }
  }, [quickSteeringDraft, rewriteSectionWithIdea, setSideOpen, pickSection]);

  const handlePaperEdit = useCallback(() => {
    if (visibleCandidate) {
      paperRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      setReviewNotice('当前正在预览独立候选稿，请先在上方审阅工作台点击“采纳候选稿”写入编辑器后再编辑，或点击“丢弃候选稿”返回原稿。');
      return;
    }
    go('editor');
  }, [visibleCandidate, go]);

  const localBrainRevision = useMemo<LocalBrainSectionRevision | null>(() => {
    const hostedReady = !!account?.authenticated && !!reportService;
    if (hostedReady || !effectiveBrain.available) return null;
    return {
      available: true,
      providerLabel: `${effectiveBrain.provider} · ${effectiveBrain.model}`,
      previewOnly: !!visibleCandidate,
      onRevise: async (targetSec, instruction) => {
        const existingParagraphs = revisionProse(targetSec);
        const existing = existingParagraphs.join('\n\n');
        const protectedTokens = [...new Set(existing.match(/\[\[[^\]]+\]\]|\$[^$\n]+\$/gu) ?? [])];
        const factSummary = (paperContent.quality?.results ?? [])
          .slice(0, 8)
          .map(r => `- ${r.title}（n=${r.n}，主要指标为 ${r.metrics.slice(0, 3).map(m => `${m.label}=${m.value}`).join('，') || r.method}）`)
          .join('\n');
        const promptLines = [
          `你正在协助修订市场调查实证报告“${paperContent.title}”中的章节“${targetSec.title}”。`,
          existing
            ? `以下是当前章节待修订的正文草稿。\n${existing}`
            : '当前章节尚无正文，请根据研究课题与已登记结果起草 2–3 段严谨学术实证正文。',
          factSummary ? `以下为本项目已登记的统计结果，请严格核对且不得编造未登记数字。\n${factSummary}` : '',
          protectedTokens.length
            ? `请在修订后的正文中原样保留以下全部行内公式与引用标记，一个都不能少。\n${protectedTokens.join('  ')}`
            : '',
          instruction || '请采用严谨计量实证学术句式理顺论证，去除“综上所述、值得注意的是、赋能、抓手”等套话，禁止出现把方法名或指标名放在句首加冒号作词典式解释的写法，须将方法与指标自然融入连贯段落，严禁输出标题符号、列表符号、方头括号或直角引号，只输出纯正文自然段（段与段之间空一行）。',
        ].filter(Boolean);
        const res = await sendBrainTurn({
          message: promptLines.join('\n\n'),
          history: [],
          context: chatContext(panel, light, traces, held),
          step: 1,
          custom: customBrain ?? undefined,
          noTools: true,
        });
        const cleaned = res.reply
          .replace(/^```[\s\S]*?\n|```$/gmu, '')
          .split(/\r?\n\s*\r?\n|\r?\n/)
          .map(line => line.replace(/^#{1,6}\s+/u, '').trim())
          .filter(line => line.length > 0 && !/^【教学模拟数据|^注[：:]/u.test(line))
          .slice(0, 12);
        if (!cleaned.length) throw new Error('模型未返回有效段落，请重试。');
        return { paragraphs: cleaned };
      },
      onApply: (targetSec, paragraphs) => {
        try {
          const existingParagraphs = revisionProse(targetSec);
          let nextReportContent: EditorContent;
          if (existingParagraphs.length > 0) {
            const scope = readReportScope();
            const snapshot = { content: paperContent, version: 0, inputVersion: 'local' };
            const basis = JSON.stringify({
              title: paperContent.title,
              subtitle: paperContent.subtitle,
              quality: paperContent.quality ?? null,
              references: paperContent.references ?? null,
              design: design ?? null,
            });
            nextReportContent = applySectionRevision(snapshot, design ?? null, scope, {
              id: `local-${crypto.randomUUID()}`,
              anchor: {
                scope,
                editorVersion: 0,
                inputVersion: 'local',
                sectionId: targetSec.id,
                section: JSON.stringify(targetSec),
                basis,
              },
              paragraphs,
            });
          } else {
            nextReportContent = {
              ...paperContent,
              report: paperContent.report.map(s =>
                s.id === targetSec.id ? { ...s, body: paragraphs.join('\n') } : s,
              ),
            };
          }
          commitStudioReport(nextReportContent, `已完成章节“${targetSec.title}”的修订润色。`);
          return { ok: true as const };
        } catch (err) {
          return {
            ok: false as const,
            reason: err instanceof Error ? err.message : '本节修订校验未通过，请在编辑器中人工修改。',
          };
        }
      },
    };
  }, [account?.authenticated, reportService, effectiveBrain, visibleCandidate, paperContent, panel, light, traces, held, customBrain, readReportScope, design, commitStudioReport]);

  const hideChatColumn = stage !== 'chat' || (expanded && !!panel);
  const overlayDock = hideChatColumn || researchOpen;
  const hasRightSidePanel = !(expanded && panel) && (panel || output || inspecting || artifactOpen);
  const dockPanelReserve = hasRightSidePanel
    ? (artifactOpen ? 360 : inspecting ? INSPECTOR : panelWidth) + 8
    : 0;
  const composerElement = (
    <Composer
      key="persistent-agent-composer"
      onDraftWriter={registerDraftWriter}
      onSend={sendFromDock}
      inputRef={inputRef}
      account={generationAccount}
      onNeedLists={() => loadLists(true)}
      projects={projects}
      projectId={projectId}
      onProject={threads.setProject}
      services={services}
      serviceId={chatService?.id ?? ''}
      onService={id => setStageModelPreference(owner, 'research.conversation', id || null)}
      mode={chatMode}
      onMode={setChatMode}
      chatLabel={chatService?.label ?? ''}
      onOpen={go}
      brainInfo={{
        available: effectiveBrain.available,
        provider: effectiveBrain.provider,
        model: effectiveBrain.model,
        source: effectiveBrain.source,
        toolsCount: loadedToolsSchemaMod?.AGENT_TOOL_SPECS.length ?? DEFAULT_AGENT_TOOLS_COUNT,
        onConfigureBrain: () => setBrainModalOpen(true),
        onToggleTools: () => setBrainModalOpen(true),
      }}
    />
  );

  return <ThemeProvider value={theme}><WorkbenchNavProvider value={nav}><GenerationProvider value={generation}>
    <div className={`workbench ${styles.shell}`} data-theme={theme} data-side={sideOpen ? 'open' : 'closed'} data-panel={panel ?? (output ? 'output' : 'none')} data-expanded={expanded && !!panel} data-studio-open={activeStudio ? 'true' : undefined} data-dragging={dragging ? 'true' : undefined} style={dockPanelReserve ? { ['--dock-panel' as string]: `${dockPanelReserve}px` } : undefined}>
      <CursorTrail />
      <a className={styles.skip} href="#agent-command-line" onClick={event => { event.preventDefault(); focusInput(); }}>跳到输入框</a>

      <nav ref={railRef} className={styles.rail} aria-label="工具" style={{ position: 'relative' }}>
        <button type="button" className={styles.railButton} aria-label="对话" title="对话" aria-pressed={!panel} onClick={() => {
          // From a panel filling the screen the conversation comes back beside it; otherwise the panel closes.
          if (!expanded) closePanel();
          focusInput();
        }}><EvixIcon name="judge-qa" size={18} variant={!panel ? 'duotone' : 'outline'} /></button>
        <button ref={modulesRef} type="button" className={styles.railButton} aria-label="模块" title="模块" aria-haspopup="dialog" aria-expanded={railMenu === 'modules'} aria-pressed={!!panel && panel !== 'overview'} onClick={() => setRailMenu(railMenu === 'modules' ? null : 'modules')}><EvixIcon name="overview" size={18} variant={!!panel && panel !== 'overview' ? 'duotone' : 'outline'} /></button>
        <button type="button" className={styles.railButton} aria-label="项目全景" title="项目全景" aria-pressed={panel === 'overview'} onClick={() => panel === 'overview' ? closePanel() : go('overview')}><EvixIcon name="ipa" size={18} variant={panel === 'overview' ? 'duotone' : 'outline'} /></button>
        <button type="button" className={styles.railButton} aria-label={`知识镜搜索（${shortcut}）`} title={`知识镜搜索（${shortcut}）`} onClick={knowledge.openSearch}><EvixIcon name="literature" size={18} variant="duotone" /></button>
        <Link href="/workspace" className={styles.railButton} aria-label="返回研究工作台" title="返回经典工作台"><Icon name="home" size={18} /></Link>
        <span className={styles.spacer} />
        <button type="button" className={styles.railButton} aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} title={theme === 'dark' ? '浅色' : '深色'} onClick={event => switchTheme(theme === 'dark' ? 'light' : 'dark', event)}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        {owner && owner !== 'guest'
          ? <button type="button" className={styles.avatar} aria-label={`当前登录账号 ${email}`} title={email} aria-haspopup="menu" aria-expanded={railMenu === 'account'}
            onClick={() => setRailMenu(railMenu === 'account' ? null : 'account')}>{(email[0] ?? '?').toUpperCase()}</button>
          : <Link className={styles.avatar} data-guest="true" href="/login?next=/agent" aria-label="邮箱登录" title="邮箱登录">访</Link>}
        {railMenu === 'account' && <div className={styles.menu} role="menu" aria-label="账号" aria-describedby="agent-account-note" style={{ left: 50, bottom: 10, zIndex: 60 }}>
          <p id="agent-account-note" className={styles.menuNote} aria-hidden="true">{email}</p>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { go('workspace'); setRailMenu(null); }}>项目门户</button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { go('services'); setRailMenu(null); }}>模型服务</button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={openResearchOverview}>研究路线</button>
          {/* Signing out asks first when this tab still holds unsaved drafts. */}
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setRailMenu(null); setAccountNotice(''); logout().catch(error => setAccountNotice(errorMessage(error))); }}>退出登录</button>
        </div>}
        {railMenu === 'modules' && <div ref={launcherRef} className={styles.launcher} role="dialog" aria-modal="true" aria-label="模块" onKeyDown={event => {
          // Arrow keys walk the modules in order; Esc closes and gives focus back to the rail.
          if (event.key === 'Escape') { event.preventDefault(); setRailMenu(null); modulesRef.current?.focus(); return; }
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
          if (!step) return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], at = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(at + step + buttons.length) % buttons.length]?.focus();
        }}>
          <div className={styles.launcherHead}><b>模块</b><small>在右侧面板打开；也可以在输入框输入 <kbd>/</kbd> 调出隐藏命令菜单</small></div>
          {/* The research path in working order: what each step is for, and how much evidence it holds where that is measured. */}
          <p className={styles.launcherLabel}>{ROOM_GROUPS.path}</p>
          <div className={styles.steps}>
            {ROOMS.filter(r => r.group === 'path').map((r, i) => {
              const lightOf = roomLight(light, r.id);
              // The visible text is the name, so voice control can say what it sees: number, module, state, purpose.
              return <button key={r.id} type="button" className={styles.step} aria-current={panel === r.id ? 'true' : undefined} onClick={() => pick(r.id)}>
                <span className={styles.glyph} aria-hidden="true"><EvixIcon name={ROOM_EVIX_ICON[r.id]} size={15} /></span>
                <b><small>{String(i + 1).padStart(2, '0')}</small>{r.name}</b>
                <span className={styles.stepLight}>{panel === r.id ? <em>已打开</em> : lightOf && (lightOf.score > 0 ? <><LightBar score={lightOf.score} />照度 {percent(lightOf.score)}</> : <i>尚无证据</i>)}</span>
                <span className={styles.stepLine}>{r.line}</span>
              </button>;
            })}
          </div>
          {GROUPS.filter(group => group !== 'path').map(group => <div key={group}>
            <p className={styles.launcherLabel}>{ROOM_GROUPS[group]}</p>
            <div className={styles.extras}>
              {ROOMS.filter(r => r.group === group).map(r => <button key={r.id} type="button" className={styles.extra} aria-current={panel === r.id ? 'true' : undefined} title={r.line}
                onClick={() => pick(r.id)}>
                <span className={styles.glyph} aria-hidden="true"><EvixIcon name={ROOM_EVIX_ICON[r.id]} size={14} /></span>{r.name}
              </button>)}
            </div>
          </div>)}
        </div>}
      </nav>

      <Sidebar book={book} projectId={projectId} projects={projects} account={generationAccount} email={email} notice={accountNotice}
        failed={!!sessionError} onRetry={() => { setAccountNotice(''); refresh().catch(error => setAccountNotice(errorMessage(error))); }} onNew={id => { threads.draft(id); focusInput(); }}
        onSelect={threads.select} onRemove={threads.remove} onRename={threads.rename} onCollapse={() => setSideOpen(false)}
        stages={stages} openRoom={panel} onRoom={go} outputs={outputs} openOutput={output?.id ?? null} onOutput={id => { window.location.hash = `output/${encodeURIComponent(id)}`; }}
        todayTokens={todayTokens} onModels={() => go('services')} onExport={exportThread}
        onLogout={() => { setAccountNotice(''); logout().catch(error => setAccountNotice(errorMessage(error))); }}
        activeStudio={activeStudio}
        onOpenStudio={tab => {
          if (tab === 'library') {
            setActiveStudio(null);
            setStage('library');
            return;
          }
          if (tab) { setSideAlone(true); setSideBeside(true); }
          setActiveStudio(tab);
        }}
        steeringCount={steeringNotes.length}
        brainStatus={effectiveBrain}
        studioContent={activeStudio ? <StudioPanel key={composerScope}
          activeTab={activeStudio}
          onSelectTab={tab => {
            if (tab === 'library') {
              setActiveStudio(null);
              setStage('library');
              return;
            }
            setActiveStudio(tab);
          }}
          onClose={() => setActiveStudio(null)}
          content={paperContent}
          design={design ?? null}
          onSaveDesign={nextDesign => {
            const merged = { ...paperContent, design: nextDesign };
            commitStudioReport(merged, '已同步极简问卷结构到研究工作台。', nextDesign);
          }}
          onUpdateReport={(next, msg, nextDesign) => commitStudioReport(next, msg, nextDesign)}
          onSaveArtifact={saveStudioSvgArtifact}
          onJumpToSection={sectionId => { setStage('paper'); requestAnimationFrame(() => pickSection(sectionId)); }}
          highlightTerms={qaHighlightTerms}
          onHighlightChange={setQaHighlightTerms}
          onOpenKnowledge={knowledge.openSearch}
          onAskExternalAi={q => sayFromTool(q)}
          steeringNotes={steeringNotes}
          onAddSteering={addSteeringNote}
          onRemoveSteering={idx => setSteeringNotes(prev => prev.filter((_, i) => i !== idx))}
          annotations={annotations}
          onAddAnnotation={ann => setAnnotations(prev => [{ id: `ann-${Date.now().toString(36)}`, status: 'open', ...ann }, ...prev])}
          onToggleAnnotationStatus={id => setAnnotations(prev => prev.map(a => a.id === id ? { ...a, status: a.status === 'applied' ? 'open' : 'applied' } : a))}
          onRemoveAnnotation={id => setAnnotations(prev => prev.filter(a => a.id !== id))}
          onRewriteWithIdea={rewriteSectionWithIdea}
          onOpenMainTheater={payload =>
            launchSiliconTheater({
              topic: payload.design.title,
              templateKey: payload.templateKey,
              seed: payload.seed,
              design: payload.design,
              openCopilot: false,
            })
          }
          signedIn={!!account?.authenticated}
          currentUserEmail={email}
          csrfToken={account?.csrfToken}
          projectId={activeProject?.id ?? null}
        /> : null}
        nav={stage === 'paper' ? <ReportNav content={paperContent} picked={pickedSection} onPick={pickSection} onSay={sayFromTool} onDraftSection={sec => sayFromTool(`起草“${sec}”`)} onStartFullReport={topic => agent.perform({ type: 'generateFullReport', topic: topic ?? '' })} liveWriting={liveWriting} /> : undefined} />

      <main className={styles.main} aria-label={stage === 'paper' ? '报告' : stage === 'advisors' ? '专家顾问' : stage === 'library' ? '资料库' : '对话'} data-stage={stage} data-stage-dir={stageDirection} data-dialog-background>
        <header className={styles.top}>
          {!sideOpen && <button type="button" className={styles.iconButton} aria-label="展开侧栏（Ctrl B）" title="展开侧栏（Ctrl B）" onClick={() => setSideOpen(true)}><Icon name="sidebar" /></button>}
          {(!sideOpen || expanded) && <Link href="/workspace" className={styles.backWorkbench} aria-label="返回研究工作台">← 工作台</Link>}
          {(() => {
            const primaryTitle = stage === 'paper' ? paperContent.title : thread?.title ?? '新对话';
            const showSubProject = !!projectLabel && primaryTitle.trim() !== projectLabel.trim() && primaryTitle.trim() !== (activeProject?.rawTitle?.trim() ?? '');
            return (
              <span className={styles.topTitle} title={showSubProject ? `${primaryTitle} · ${projectLabel}` : primaryTitle}>
                {primaryTitle}
                {showSubProject && <small>{projectLabel}</small>}
              </span>
            );
          })()}
          <span ref={stageSwitchRef} className={styles.stageSwitch} role="group" aria-label="中间显示">
            <span data-motion-marker data-motion-variant="pill" className={styles.stageActivePill} aria-hidden="true" />
            <button type="button" data-motion-id="chat" aria-pressed={stage === 'chat' && !researchOpen} onClick={openChat}><EvixIcon name="judge-qa" size={14} />对话</button>
            <button type="button" data-motion-id="paper" aria-pressed={stage === 'paper'} onClick={() => setStage('paper')}><EvixIcon name="editorial" size={14} />报告</button>
            <button type="button" data-motion-id="advisors" aria-pressed={stage === 'advisors'} onClick={() => setStage('advisors')}><EvixIcon name="causal-scale" size={14} />顾问{hired.length ? <small>{hired.length}</small> : null}</button>
            <button type="button" data-motion-id="library" aria-pressed={stage === 'library'} onClick={() => setStage('library')}><EvixIcon name="page-grid" size={14} />资料库</button>
          </span>
          {(!!running || looking || !!liveWriting?.active) && (
            <span className={styles.workState} data-busy="true" role="status">
              <i aria-hidden="true" />{liveWriting?.active ? `实时撰稿中 · ${liveWriting.completed}/${liveWriting.total} 节` : running?.model ? `推理中 · 第 ${running.model.step} 步 · ${running.model.service}` : '查阅知识镜'}
            </span>
          )}
          <button type="button" className={styles.lightGaugePill} data-illuminating={lightPulsing ? 'true' : undefined} onClick={() => go('overview')} aria-label={`查看全站证据照度与盲区全景（当前照度 ${percent(light.overall)}）`} title="查看全站证据照度与盲区全景">
            <LightBar score={light.overall} />
            <span>照度 {percent(light.overall)}</span>
            {light.blind.length > 0 && <em>盲区 {light.blind.length}</em>}
          </button>
          <button type="button" className={styles.enginePill} data-online={effectiveBrain.available ? 'true' : 'false'} onClick={() => setBrainModalOpen(true)} aria-label="打开模型连接与助手设置" title="模型连接与助手设置">
            <i aria-hidden="true" />
            <span>{chatService ? `${chatService.label}` : effectiveBrain.available ? `${effectiveBrain.provider} · ${effectiveBrain.model}` : brainStatus === null ? '连接中…' : '基础模式'}</span>
          </button>
          <ArtifactShelfLauncher count={artifacts.count} open={artifactOpen} onClick={openArtifactShelf} />
          <span className={styles.spacer} />
          {!accountLoading && !account?.authenticated && (
            <Link href="/login?next=/agent" className={`${styles.chip} ${styles.chipPrimary} ${styles.topLoginBtn}`}>邮箱登录</Link>
          )}
          <button type="button" className={`${styles.chip} ${styles.topConfigBtn}`} onClick={() => go('services')} aria-label="模型配置">模型配置</button>
          <details className={styles.topMore} onKeyDown={event => {
            if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
          }} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
          }}>
            <summary aria-label="更多对话操作" title="更多对话操作"><Icon name="more" /></summary>
            <div className={styles.topMenu}>
              <p>{chatMode === 'model' ? chatService ? `${chatService.label} · ${chatService.model}` : '未选模型' : '指令模式'}</p>
              {(spent.inputTokens > 0 || spent.outputTokens > 0) && <p>本次对话 {thousands(spent.inputTokens + spent.outputTokens)} 词元<br />输入 {thousands(spent.inputTokens)} · 输出 {thousands(spent.outputTokens)}</p>}
              <button type="button" aria-pressed={showCode} onClick={event => { setShowCode(!showCode); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Icon name="code" />{showCode ? '隐藏代码' : '显示代码'}</button>
              {exportThread && <button type="button" onClick={event => { exportThread(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Icon name="download" />导出对话记录</button>}
            </div>
          </details>
          {!panel && lastPanel && <button type="button" className={styles.iconButton} aria-label={`重新打开${roomById(lastPanel.room).name}（Ctrl \\）`} title={`重新打开${roomById(lastPanel.room).name}（Ctrl \\）`} onClick={() => { window.location.hash = lastPanel.hash; }}><Icon name="panel" /></button>}
        </header>
        {(!panel || artifactOpen) && <ResearchRouteBar current={displayedResearchStage} overviewActive={researchOpen && !artifactOpen} onSelect={openResearchStage} onOverview={openResearchOverview} />}
        {stage === 'advisors' && (
          <Advisors
            benchmark={paperBenchmark}
            hired={hired}
            onHire={setHired}
            onConsult={(_advisor, prompt) => {
              setStage('chat');
              sendFromDock(prompt);
            }}
          />
        )}
        {stage === 'library' && (
          <ResourceLibraryStudio
            content={paperContent}
            onUpdateReport={(next, msg) => commitStudioReport(next, msg)}
            onSaveArtifact={art => saveStudioSvgArtifact(art.title, art.svg)}
            onJumpToSection={sectionId => {
              setStage('paper');
              requestAnimationFrame(() => pickSection(sectionId));
            }}
            onSendPrompt={prompt => {
              setStage('chat');
              sendFromDock(prompt);
            }}
          />
        )}
        {stage === 'paper' && <div ref={paperRef} className={styles.paperStage} role="region" aria-label="报告实时排版" onWheel={pauseAutoFollowOnUserScroll} onTouchMove={pauseAutoFollowOnUserScroll}>
          <PaperToolbar
            content={paperContent}
            section={paperContent.report.find(s => s.id === pickedSection) ?? null}
            results={paperContent.quality?.results ?? []}
            onInsert={insertIntoSection}
            onEdit={handlePaperEdit}
            onStartFullReport={topic => agent.perform({ type: 'generateFullReport', topic: topic ?? '' })}
            onInstantForge={topic => agent.perform({ type: 'loadBenchmark', benchmarkId: topic || 'current' })}
            previewOnly={!!visibleCandidate}
            candidateReady={!!visibleCandidate && !visibleCandidate.pending && !visibleCandidate.failed}
            onReviewCandidate={() => paperRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            canWriteCandidateAppendix={!!visibleCandidate && !visibleCandidate.pending && !visibleCandidate.failed}
            onPlayChoreography={() => choreo.playFullTheaterShowcase(paperContent, visibleCandidate?.result?.revisions ?? [])}
            liveWriting={liveWriting}
            onToggleAutoFollow={toggleAutoFollow}
            onJumpToSection={pickSection}
            docFormat={docFormat}
            onChangeDocFormat={setDocFormat}
            projectId={projectId}
            signedIn={!!account?.authenticated}
            fullReportSummary={visibleCandidate ? {
              used: true,
              modelLabel: reportService ? `${reportService.label}（${reportService.model}）` : null,
              sectionCount: visibleCandidate.receipts.length || visibleCandidate.preview.report.length,
              note: `当前采用${REPORT_MODES[visibleCandidate.mode]}口径，共记录回执 ${visibleCandidate.receipts.length} 条`,
            } : null}
            onWriteAiAppendix={lines => {
              if (visibleCandidate && !visibleCandidate.pending && !visibleCandidate.failed) {
                const candidateRunId = visibleCandidate.runId;
                const candidatePreview = visibleCandidate.preview;
                void loadReportAppendices().then(({ writeAppendix }) => {
                  const updated = writeAppendix(candidatePreview, 'appendix.ai', lines).content;
                  setCandidate(prev =>
                    prev && prev.runId === candidateRunId
                      ? {
                          ...prev,
                          preview: updated,
                          ...(prev.pack ? { pack: { ...prev.pack, report: updated } } : {}),
                          ...(prev.result ? { result: { ...prev.result, report: updated, ...(prev.result.pack ? { pack: { ...prev.result.pack, report: updated } } : {}) } } : {}),
                        }
                      : prev,
                  );
                  setReviewNotice('已将《AI 工具使用情况说明》写入当前候选稿附录，点击“采纳候选稿”后将一并保存。');
                });
                return;
              }
              sendToReport({
                id: crypto.randomUUID(),
                node: 'appendix.ai',
                source: 'AI 使用说明',
                items: lines.map(text => ({ kind: 'paragraph', text })),
              });
            }}
            onOpenPreflightPanel={() => go('preflight')}
            versions={reportVersions.slice(0, 3).map((version, index) => ({
              key: `${version.savedAt}-${index}`,
              title: version.content.title,
              savedAt: version.savedAt,
              sectionCount: version.content.report.length,
              onRestore: () => {
                const scope = readReportScope();
                if (scope.owner !== owner || scope.epoch !== identityEpoch || scope.project !== projectId) {
                  setReviewNotice('登录或项目已变化，请重新核对版本。');
                  return;
                }
                const outcome = restoreReportVersion(version.content, latest.current.reportSource);
                if (outcome === 'applied') {
                  choreo.stop();
                  setCandidate(null);
                  setReviewNotice('已恢复所选原稿版本，恢复前的版本也已保留。');
                } else {
                  setReviewNotice(outcome === 'conflict' ? '原稿正在更新，请等待资料载入完成后再恢复。' : '无法保存版本，当前原稿未被替换。');
                }
              },
            }))}
            versionsDisabled={!!liveWriting?.active || !!reportSource.inputPending}
            steeringControls={{
              notesCount: steeringNotes.length,
              quickDraft: quickSteeringDraft,
              onQuickDraftChange: setQuickSteeringDraft,
              onSubmitNote: openStudio => {
                addSteeringNote(quickSteeringDraft);
                setQuickSteeringDraft('');
                if (openStudio) {
                  setSideOpen(true);
                  setActiveStudio('steering');
                }
              },
              qaActive: activeStudio === 'qa',
              qaCount: qaHighlightTerms.length,
              onToggleQa: () => {
                setSideOpen(true);
                setActiveStudio(activeStudio === 'qa' ? null : 'qa');
              },
              watermarkEnabled,
              onToggleWatermark: () => setWatermarkEnabled(v => !v),
            }}
          />
          {reviewNotice && <p className={styles.reviewNotice} role="status">{reviewNotice}</p>}
          {visibleCandidate && <>
            <AgentRunReview quality={visibleCandidate.result?.quality} revisions={visibleCandidate.result?.revisions} summary={visibleCandidate.result?.summary} mode={visibleCandidate.mode} conflict={candidateConflict} pending={visibleCandidate.pending} failed={visibleCandidate.failed} changes={candidateChanges} lockedSectionIds={lockedSectionIds} before={visibleCandidate.before} preview={visibleCandidate.preview}
              onCancel={() => stopReportRun()}
              onDiscard={() => { stopReportRun(); setCandidate(null); setReportWriting(readReportScope(), null); setReviewNotice('候选稿已丢弃，原稿保留。'); }}
              onSelectSection={pickSection}
              onToggleSectionLock={toggleSectionLock}
              onApply={() => {
                const result = visibleCandidate.result, pack = visibleCandidate.pack;
                const scope = readReportScope();
                if (!scope.owner || visibleCandidate.scope !== `${scope.owner}:${scope.epoch}:${scope.project ?? 'local'}` || visibleCandidate.threadId !== scope.thread) { setReviewNotice('登录、项目或对话已变化，请重新核对候选稿。'); return; }
                if (!result || !pack || visibleCandidate.failed || !canAcceptReportCandidate({ sourceKey: visibleCandidate.sourceKey, currentSource: latest.current.reportSource, status: result.quality.status, pending: visibleCandidate.pending })) { setReviewNotice('原稿或资料已变化，当前候选稿不能采纳。请重新核对输入。'); return; }
                const merged = mergeReportCandidate(latest.current.reportSource.report ?? blankReport, pack.report, lockedSectionIds);
                const outcome = applyCandidate({ ...pack, report: merged }, visibleCandidate.source);
                if (outcome === 'applied') { choreo.stop(); setCandidate(null); setReportWriting(scope, null); setReviewNotice('已采纳所选变更，采纳前的原稿可从最近版本中恢复。'); }
                else setReviewNotice(outcome === 'conflict' ? '原稿或研究资料已修改，没有覆盖当前版本。' : '无法保存原稿快照，本次没有采纳。请检查浏览器可用存储。');
              }} />
            <details className={styles.receipts}>
              <summary>本轮调用记录 · {visibleCandidate.receipts.length} 条</summary>
              <a href={`/api/agent/report-runs/${visibleCandidate.runId}`} target="_blank" rel="noreferrer">核对运行回执 ↗</a>
              <p>“已发出”表示等待回执核对。取消或断流不会自动撤销已发出的服务商调用。</p>
              <ul>{visibleCandidate.receipts.map(receipt => <li key={receipt.id}><a href={`/api/agent/report-sections/${encodeURIComponent(receipt.id)}`} target="_blank" rel="noreferrer">{blueprintNode(receipt.nodeId)?.title ?? receipt.nodeId} ↗</a><span>{({ dispatched: '已发出 · 待核对', ready: '已返回', failed: '失败', unknown: '结果待核对', running: '处理中' } as Record<string, string>)[receipt.status] ?? '待核对'}</span></li>)}</ul>
            </details>
          </>}
          <ReportLiveTheater
            paperRef={paperRef}
            robotRole={choreo.robotRole}
            robotStatusText={choreo.robotStatusText}
            robotVisible={choreo.robotVisible}
            forgePod={choreo.forgePod}
            beams={choreo.beams}
          />
          <ReportPaper
            content={paperContent}
            activeSectionId={pickedSection}
            onPick={pickSection}
            label="报告实时排版"
            writingActive={!!liveWriting?.active || !!choreo.typingState || !!choreo.reviewState || !!workflowWorkState}
            workState={reportWorkState(liveWriting) ?? workflowWorkState ?? choreo.workState ?? null}
            typingState={choreo.typingState}
            reviewState={choreo.reviewState}
            formatScanSectionId={choreo.formatScanSectionId}
            activeCatalogKey={choreo.activeTargetKey}
            onCatalogHover={(attr, id) => choreo.triggerXrefSynapse(attr, id, false)}
            onCatalogClick={(attr, id) => choreo.triggerXrefSynapse(attr, id, true)}
            docFormat={docFormat}
            sectionDiffs={paperSectionDiffs}
            onToggleDiffLock={visibleCandidate ? toggleSectionLock : undefined}
            onApplyRevisionDiff={revision.onApply}
            onKeepRevisionDiff={revision.onKeep}
            highlightTerms={qaHighlightTerms}
            annotations={annotations}
            onSelectionAction={handleSelectionAction}
            watermarkText={watermarkEnabled ? `证见 EVI-X · ${email || '内部审阅副本'} · 防未授权摘抄与外传` : null}
          />
        </div>}
        <div className={styles.chatColumn} hidden={hideChatColumn}>
        <div ref={scrollRef} className={styles.scroll}>
          {!messages.length && !researchOpen && (
            <section className={styles.empty} aria-label="证见智能研究工作台">
              <header className={styles.emptyHeaderBar}>
                <div className={styles.emptyTitleBlock}>
                  <div className={styles.emptyEyebrow}>
                    <span className={styles.livePulse} data-online={effectiveBrain.available ? 'true' : 'false'} aria-hidden="true" />
                    证见 · 智能实证调研工作台
                  </div>
                  <h1 tabIndex={-1}>以对话为中枢，按需唤醒整座实证研究工坊</h1>
                  <p className={styles.emptyLead}>
                    {chatService
                      ? `已连接“${chatService.label}（${chatService.model}）”；当前完成度 ${percent(light.overall)}，随时协助选题、分析与成文。`
                      : effectiveBrain.available
                        ? `对话模型“${effectiveBrain.provider} · ${effectiveBrain.model}”已就绪，随时协作推进研究。`
                        : brainStatus === null
                          ? `正在准备智能助手服务；当前完成度 ${percent(light.overall)}。`
                          : `当前工作区完成度 ${percent(light.overall)}（基础向导模式）。`}
                  </p>
                </div>
                <div className={styles.emptyHeaderActions}>
                  {!effectiveBrain.available && (
                    <button type="button" className={styles.brainSecondaryBtn} onClick={() => setBrainModalOpen(true)}>
                      <Icon name="bolt" />
                      <span>模型配置</span>
                    </button>
                  )}
                  <button type="button" className={styles.brainSecondaryBtn} onClick={openResearchOverview}>
                    <Icon name="spark" />
                    <span>研究路线</span>
                  </button>
                </div>
              </header>

              <div className={styles.heroQuickStart} role="region" aria-label="一句话课题快速启动">
                <input
                  className={styles.heroQuickInput}
                  aria-label="输入一句话研究课题"
                  maxLength={160}
                  value={heroTopicDraft}
                  onChange={e => setHeroTopicDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      agent.perform({ type: 'loadBenchmark', benchmarkId: heroTopicDraft.trim() || 'current' });
                    }
                  }}
                  placeholder="输入一句话研究课题（如：城市社区老年助餐服务满意度与优化路径研究）…"
                />
                <button
                  type="button"
                  className={styles.heroQuickPrimary}
                  disabled={!!liveWriting?.active}
                  onClick={() => agent.perform({ type: 'loadBenchmark', benchmarkId: heroTopicDraft.trim() || 'current' })}
                >
                  <EvixIcon name="page-grid" tone="on-dark" size={15} />
                  <span>秒级装入 28 节样板全案</span>
                </button>
                <button
                  type="button"
                  className={styles.heroQuickSecondary}
                  disabled={!!liveWriting?.active}
                  onClick={() => agent.perform({ type: 'generateFullReport', topic: heroTopicDraft.trim() })}
                >
                  <EvixIcon name="prism" size={15} />
                  <span>生成独立候选稿</span>
                </button>
              </div>

              <div className={styles.opticalBenchGrid}>
                <div className={styles.benchInstrumentCol}>
                  <AnatomyStageCard
                    overallScore={light.overall}
                    blindCount={light.blind.length}
                    litCount={light.rooms.filter(r => r.score > 0).length}
                    totalRooms={light.rooms.length}
                    activeKind={benchStation}
                    onKindChange={setBenchStation}
                    busy={!!running || looking}
                  />
                </div>

                <div className={styles.bentoGrid} role="group" aria-label="典型研究调度情境">
                  {[
                    {
                      kind: 'survey' as const,
                      tag: '01 · 照度巡检',
                      title: '全站证据体检与问卷构念校准',
                      desc: '扫描四象限照度、定位尚未补全的研究盲区并规划问卷构念。',
                      prompt: '帮我扫描当前项目各模块的证据照度，目前还缺哪些核心证据？下一步该优先完善哪一块？',
                    },
                    {
                      kind: 'analysis' as const,
                      tag: '02 · 统计绘图',
                      title: '多维统计检验与交互绘图工坊',
                      desc: '推导卡方、回归、结构方程等方案，在对话内直接呼出统计绘图工坊。',
                      prompt: '我想研究青年群体人工智能消费满意度的群体差异，帮我设计实证检验思路并打开统计绘图工坊。',
                    },
                    {
                      kind: 'research' as const,
                      tag: '03 · 公式溯源',
                      title: '抽样设计效应与样本量校验',
                      desc: '检索知识镜已审核词条，核对精确统计公式与抽样框边界。',
                      prompt: '什么是抽样设计效应（DEFF）？请用知识镜查一下公式，并说说多阶段分层抽样里怎么设定它。',
                    },
                    {
                      kind: 'report' as const,
                      tag: '04 · 样板全案',
                      title: '铸造社区助餐教学模拟全案',
                      desc: '生成完整问卷、模拟样本与实测结果，直接切入 A4 成文镜台。',
                      prompt: '请围绕“社区养老助餐服务满意度与优化路径”生成一套教学模拟研究样板，并切到报告视图讲讲结构。',
                    },
                    {
                      kind: 'survey' as const,
                      tag: '05 · 硅基预测试',
                      title: '分层硅基受访者预测试与焦点深访',
                      desc: '按需呼出内置硅基预测试演播室，运行分层模拟试答、3 轮访谈与焦点圆桌排查题干盲区。',
                      prompt: '/硅基推演',
                    },
                  ].map((card, index) => (
                    <button
                      key={card.title}
                      type="button"
                      className={styles.bentoCard}
                      style={{ '--stagger-i': Math.min(index, 10) } as CSSProperties}
                      data-active={benchStation === card.kind ? 'true' : undefined}
                      onMouseEnter={() => setBenchStation(card.kind)}
                      onFocus={() => setBenchStation(card.kind)}
                      onClick={() => sendFromDock(card.prompt)}
                    >
                      <div className={styles.bentoTop}>
                        <span className={styles.bentoTag}>{card.tag}</span>
                        <span className={styles.bentoArrow} aria-hidden="true">↗</span>
                      </div>
                      <strong className={styles.bentoTitle}>{card.title}</strong>
                      <span className={styles.bentoDesc}>{card.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
            <section className={styles.researchDrawer} aria-label="研究路线" hidden={!researchOpen}>
              <div className={styles.researchDrawerHead}>
                <h1>{projectLabel || '研究案卷'}</h1>
                <div className={styles.researchProject}>
                  {projects.length > 0 && <select aria-label="当前研究项目" value={projectId ?? ''} onChange={event => { const next = event.target.value || null; if (next) threads.setProject(next); else threads.draft(null); }}>
                    <option value="">本地研究</option>
                    {projects.map(project => <option key={project.id} value={project.id}>{project.label}</option>)}
                  </select>}
                  <a href={projectId ? '/projects/' + encodeURIComponent(projectId) : '/projects'}>{projectId ? '项目资料' : '团队项目'}</a>
                </div>
              </div>
              {!hasUserResearchSource(reportSource) && (
                <div className={styles.heroQuickStart} role="region" aria-label="一句话课题快速生成">
                  <input
                    className={styles.heroQuickInput}
                    aria-label="研究课题名称"
                    maxLength={160}
                    value={heroTopicDraft}
                    onChange={e => setHeroTopicDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agent.perform({ type: 'loadBenchmark', benchmarkId: heroTopicDraft.trim() || 'current' });
                      }
                    }}
                    placeholder="输入一句话研究课题（如：大学生人工智能学习工具采纳机制调查），即刻生成问卷、样本与 28 节报告…"
                  />
                  <button
                    type="button"
                    className={styles.heroQuickPrimary}
                    disabled={!!liveWriting?.active}
                    onClick={() => agent.perform({ type: 'loadBenchmark', benchmarkId: heroTopicDraft.trim() || 'current' })}
                  >
                    <EvixIcon name="page-grid" tone="on-dark" size={15} />
                    <span>秒级装入样板全案</span>
                  </button>
                  <button
                    type="button"
                    className={styles.heroQuickSecondary}
                    disabled={!!liveWriting?.active}
                    onClick={() => agent.perform({ type: 'generateFullReport', topic: heroTopicDraft.trim() })}
                  >
                    <EvixIcon name="prism" size={15} />
                    <span>智能起草整稿</span>
                  </button>
                </div>
              )}
              <ResearchWorkspace key={`${owner ?? 'loading'}:${identityEpoch}:${projectId ?? 'local'}`}
                owner={owner} projectId={projectId} identityEpoch={identityEpoch} services={lists.services}
                execution={{ mutate, isCurrent: () => !!owner && owner !== 'guest' && isCurrentAccount(owner, identityEpoch), onProduced: artifacts.onProduced }}
                modelRoutes={journeyModelRoutes} defaultServiceId={stagePreferences.defaultServiceId ?? null}
                onDefaultServiceChange={id => setDefaultModelPreference(owner, id)}
                onModelCallChange={(call, id) => setStageModelPreference(owner, call, id)}
                onOpenSettings={() => go('services')} onOpenStage={openResearchStage}
                onTopic={research.topic} onRetractTopic={research.retractTopic} literature={research.literature} onLiterature={research.setLiterature}
                onLiteratureToReport={lines => {
                  sendToReport({ id: crypto.randomUUID(), node: 'appendix.data', source: '选题研读资料',
                    items: lines.map(text => ({ kind: 'paragraph', text })) });
                  go('editor');
                }}
                onDraftQuestionnaire={({ input }, destination) => {
                  if (destination !== readReportScope().project) return;
                  const brief = [input.title, input.problem, `围绕${input.decisionOwner}的决策需求`,
                    `面向${input.population}`, `聚焦${input.geography}地区`].join('\n');
                  threads.append([{ ...stamp(), role: 'agent', turn: generation.start(brief, destination) }]);
                }}
                simulation={{
                  source: reportSource,
                  apply: applyCandidate,
                  openReport: () => go('editor'),
                  startWriting: title => agent.perform({ type: 'generateFullReport', topic: title, mode: 'demonstration' }),
                  openTheater: (simDesign, brief) =>
                    launchSiliconTheater({
                      topic: brief.title,
                      templateKey: inferSiliconTemplate(`${brief.title} ${brief.population}`),
                      design: simDesign,
                    }),
                }}
                onOpenSiliconFlow={() => launchSiliconTheater()}
                onWorkflowWorkState={setWorkflowWorkState} />
            </section>
          {!!messages.length && <Transcript activeCallIds={new Set(activeCalls.filter(c => c.owner === owner && c.epoch === identityEpoch).map(c => c.id))} messages={messages} scrollRef={scrollRef} workInPaper={false} writingModelStatus={writingModelStatus} onAction={performAction} onAnswer={agent.answer} />}
        </div>
        </div>
      </main>

      <section ref={artifactPanelRef} className={styles.panel} hidden={!panel && !output && !inspecting && !artifactOpen} aria-label={artifactOpen ? '成果架' : here ? here.name : output ? '产出' : inspecting ? '写作检查器' : '模块'} data-dialog-background
        onKeyDown={event => { if (artifactOpen && event.key === 'Escape') { event.stopPropagation(); setArtifactOpen(false); } }}
        data-inspector={inspecting || artifactOpen || undefined} style={{ ['--panel-w' as string]: `${artifactOpen ? 360 : inspecting ? INSPECTOR : panelWidth}px` }}>
        {artifactOpen && <ArtifactShelf {...artifacts} error={artifacts.error??artifactNotice} onClose={()=>setArtifactOpen(false)} onExample={()=>void addInfographicExample()} onLocate={locateArtifact} />}
        {!artifactOpen && inspecting && <ReportInspector content={paperContent} picked={pickedSection} benchmark={paperBenchmark}
          advisors={ADVISORS.filter(a => hired.includes(a.id)).map(a => advisorReading(a, paperBenchmark))} onSay={sayFromTool} onDraftSection={sec => sayFromTool(`起草“${sec}”`)} onEdit={handlePaperEdit} onAdvisors={() => setStage('advisors')} localBrainRevision={localBrainRevision} onJumpToIssue={sectionId => { if (stage !== 'paper') { setStage('paper'); requestAnimationFrame(() => pickSection(sectionId)); } else { pickSection(sectionId); } }} revision={<SectionRevision {...revision} content={paperContent} />} />}
        <div className={styles.resize} data-dragging={dragging} role="separator" aria-orientation="vertical" aria-label="拖动调整面板宽度" onPointerDown={startResize} />
        {!artifactOpen && here && <header className={styles.panelHead}>
          <h2 ref={headingRef} tabIndex={-1}>{RESEARCH_STAGES.find(item => item.id === researchStage)?.label ?? here.name}</h2>
          {lit && <span className={styles.panelLight}><LightBar score={lit.score} /><b>{percent(lit.score)}</b>{lit.summary}</span>}
          <span className={styles.spacer} />
          {panel !== 'overview' && !expanded && <button type="button" className={styles.codeToggle} onClick={() => setExpanded(true)}><Icon name="edit" />展开编辑</button>}
          <button type="button" className={styles.iconButton} aria-pressed={expanded} aria-label={expanded ? '还原，显示对话' : '铺满，暂时收起对话'}
            title={expanded ? '还原，显示对话' : '铺满，暂时收起对话'} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? 'shrink' : 'expand'} /></button>
          <button type="button" className={styles.iconButton} aria-label="关闭面板（Ctrl \）" title="关闭面板（Ctrl \）" onClick={closePanel}><Icon name="close" /></button>
        </header>}
        {panel && (!artifactOpen || expanded) && <ResearchRouteBar current={displayedResearchStage} overviewActive={researchOpen && !artifactOpen} onSelect={openResearchStage} onOverview={openResearchOverview} />}
        {!artifactOpen && output && <OutputPanel key={output.id} result={output} showCode={showCode} onClose={closePanel} onOpenAnalysis={() => go('analysis')} onSay={sendFromDock}
          figure={deferredView.report ? findReportFigure(deferredView.report, output) : null} visualStyle={deferredView.report?.visualStyle} />}
        <div className={styles.panelBody} data-room={panel ?? undefined} hidden={!panel || artifactOpen}>
          {researchStage === 'collection' && <section className={styles.routeLanding} aria-label="调查收集安排">
            <h3>{projectLabel || '准备发布问卷'}</h3>
            <p>{projectId ? '在项目里选择已保存的问卷版本，创建发布链接并查看回收进度。' : '先选择有已保存问卷的团队项目。'}</p>
            <a href={projectId ? '/projects/' + encodeURIComponent(projectId) + '#collection' : '/projects'}>{projectId ? '打开发布与回收' : '前往团队项目'} <span aria-hidden="true">↗</span></a>
          </section>}
          {researchStage === 'pilot' && <section className={styles.routeLanding} aria-label="预测试入口">
            <h3>试答与访谈推演</h3>
            <p>用当前问卷检查题目理解、选项覆盖和跳题，再记录修订。</p>
            <button type="button" onClick={() => launchSiliconTheater({ design: latest.current.design ?? null })}>打开硅基推演 <span aria-hidden="true">↗</span></button>
          </section>}
          {researchStage === 'review' && <div className={styles.routeSecondary}><button type="button" onClick={() => go('preflight')}>检查提交文件与匿名信息 ↗</button></div>}
          {(researchStage === 'analysis' || researchStage === 'quality' || researchStage === 'findings') && (
            <AutonomousAgentTheater
              projectId={projectId}
              projectTitle={projectLabel || paperContent.title}
              authenticated={account?.authenticated === true}
              csrfToken={account?.csrfToken ?? null}
              design={view.design}
              dataset={reportSource.dataset ?? null}
              onCommitRun={commitAutonomousRun}
              onSavePlotArtifact={saveStudioSvgArtifact}
              onJumpReview={() => openResearchStage('review')}
              onJumpPaper={() => setStage('paper')}
            />
          )}
          {panel === 'overview' && <Lobby light={light} view={deferredView} traces={traces.length} onOpen={go} onSay={sendFromDock} headingRef={null} />}
          {/* The report editor stays mounted, hidden, while the report fills the centre: the paper shows its content and the
              toolbar writes through it. */}
          {(Object.keys(panels) as WorkbenchPanel[]).filter(id => id !== 'overview' && (visited.includes(id) || (id === 'editor' && stage === 'paper'))).map(id =>
            <div key={id} className={styles.pane} data-workbench-panel={id} hidden={panel !== id || (id === 'workspace' && researchStage === 'collection')}>{panels[id]}</div>)}
        </div>
        {canvasReturn && panel && panel !== 'canvas' && <div className={styles.canvasReturn} role="region" aria-label="画布返回">
          <button type="button" onClick={backToCanvas}>⟲ 返回画布{canvasReturn.title ? ` · ${canvasReturn.title}` : ''}</button>
          <button type="button" aria-label="不再显示返回画布" onClick={() => setCanvasReturn(null)}>×</button>
        </div>}
      </section>

      <div className={styles.floatingDock} data-overlay={overlayDock || undefined} data-folded={overlayDock && !copilotOpen ? 'true' : undefined} data-dialog-background>
        {overlayDock && !copilotOpen && (
          <div className={styles.overlayMiniBar} role="region" aria-label="证见快捷对话副驾">
            <button type="button" className={styles.overlayMiniPrompt} onClick={() => { setCopilotOpen(true); requestAnimationFrame(() => focusInput()); }}>
              <BrandMark size={15} />
              <span>{researchOpen ? '继续对话、添加资料或下达指令' : '向证见提问、下达指令或改写本节…'}</span>
              <kbd>/</kbd>
            </button>
            <button type="button" className={styles.overlayMiniExpand} onClick={() => setCopilotOpen(true)} aria-label={messages.length ? `展开对话记录 (${messages.length})` : '展开对话抽屉'}>
              {running || looking ? <><i aria-label="工作中" />思考中…</> : messages.length ? `对话 (${messages.length}) ▴` : '展开对话抽屉 ▴'}
            </button>
          </div>
        )}
        {overlayDock && copilotOpen && (
          <section className={styles.copilot} aria-label="证见对话抽屉">
            <div className={styles.copilotHead}>
              <BrandMark size={16} />
              <b>证见研究助手</b>
              <small>{thread?.title ?? '新对话'}</small>
              <span className={styles.spacer} />
              <button type="button" className={styles.chip} onClick={() => { setExpanded(false); openChat(); }}>回到对话</button>
              <button type="button" className={styles.iconButton} aria-label="收起对话抽屉" title="收起" onClick={() => setCopilotOpen(false)}><Icon name="down" /></button>
            </div>
            <div ref={scrollRef} className={styles.scroll}>
              {messages.length ? (
                <Transcript activeCallIds={new Set(activeCalls.filter(c => c.owner === owner && c.epoch === identityEpoch).map(c => c.id))} messages={messages} scrollRef={scrollRef} workInPaper={stage === 'paper' && !!reportWorkState(liveWriting)} writingModelStatus={writingModelStatus} onAction={performAction} onAnswer={agent.answer} />
              ) : (
                <div className={styles.copilotEmpty}>直接在下方输入框描述研究问题或任务，报告、问卷、图表与分析模块会按需在此协同呼出。</div>
              )}
            </div>
          </section>
        )}
        <div className={styles.dockComposerWrap} data-overlay={overlayDock || undefined} hidden={overlayDock && !copilotOpen}>
          {composerElement}
        </div>
      </div>

      {brainModalOpen && (
        <div
          className={styles.brainModalBackdrop}
          role="presentation"
          onClick={event => { if (event.target === event.currentTarget) setBrainModalOpen(false); }}
          onKeyDown={event => { if (event.key === 'Escape') setBrainModalOpen(false); }}
        >
          <section className={styles.brainModal} role="dialog" aria-modal="true" aria-label="模型连接与助手设置">
            <header className={styles.brainModalHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AnatomyPrismMark size={54} running={effectiveBrain.available} />
                <div>
                  <h2>模型连接设置</h2>
                </div>
              </div>
              <button type="button" autoFocus className={styles.iconButton} aria-label="关闭设置" onClick={() => setBrainModalOpen(false)}>
                <Icon name="close" />
              </button>
            </header>

            <div className={styles.brainModalBody}>
              <div className={styles.brainEngineBox}>
                <div className={styles.brainEngineRow}>
                  <div>
                    <strong className={styles.brainEngineTitle}>
                      {chatService
                        ? `${chatService.label}（${chatService.model}）`
                        : effectiveBrain.available
                          ? `${effectiveBrain.provider} · ${effectiveBrain.model}`
                          : '当前使用基础向导模式'}
                    </strong>
                    <p className={styles.brainEngineSub}>
                      {chatService
                        ? '已选定在线对话服务，支持全程研究协作与报告辅助。'
                        : effectiveBrain.source === 'custom'
                          ? '正在使用当前会话专属服务连接，关闭或刷新页面后自动失效。'
                          : effectiveBrain.available
                            ? '在线研究助手已就绪，可直接协助选题构思、数据分析、配图与成文撰写。'
                            : '如需开启自然语言深度协作，可在下方填写当前会话连接信息，或登录后在“模型设置”中保存常用服务。'}
                    </p>
                  </div>
                  <span className={styles.brainEngineBadge} data-online={effectiveBrain.available ? 'true' : 'false'}>
                    {effectiveBrain.available ? '已连接' : '未连接'}
                  </span>
                </div>

                {!chatService && (
                  <div className={styles.brainByokForm}>
                    <div className={styles.brainByokFields}>
                      <label>
                        <span>服务商预设</span>
                        <select value={brainPresetDraft} onChange={e => setBrainPresetDraft(e.target.value as BrainPresetId)}>
                          <option value="deepseek">DeepSeek（deepseek-chat / deepseek-reasoner）</option>
                          <option value="openai">OpenAI（gpt-4o-mini / gpt-4.1）</option>
                          <option value="qwen">通义千问（qwen-plus / qwen-max）</option>
                        </select>
                      </label>
                      <label>
                        <span>指定模型名称（选填）</span>
                        <input
                          type="text"
                          value={brainModelDraft}
                          onChange={e => setBrainModelDraft(e.target.value)}
                          placeholder={brainPresetDraft === 'openai' ? 'gpt-4o-mini' : brainPresetDraft === 'qwen' ? 'qwen-plus' : 'deepseek-chat'}
                        />
                      </label>
                      <label>
                        <span>当前会话访问凭证（仅本次有效，不保存至本地磁盘）</span>
                        <input
                          type="password"
                          autoComplete="off"
                          value={brainKeyDraft}
                          onChange={e => setBrainKeyDraft(e.target.value)}
                          placeholder={brainStatus?.available ? '留空则沿用已配置服务' : '输入服务商访问凭证'}
                        />
                      </label>
                    </div>
                    <div className={styles.brainByokActions}>
                      {brainPresetDraft === 'deepseek' && (
                        <>
                          <button type="button" className={styles.chip} onClick={() => setBrainModelDraft('deepseek-chat')}>deepseek-chat</button>
                          <button type="button" className={styles.chip} onClick={() => setBrainModelDraft('deepseek-reasoner')}>deepseek-reasoner（深度思考）</button>
                        </>
                      )}
                      <span className={styles.spacer} />
                      {customBrain && (
                        <button
                          type="button"
                          className={styles.chip}
                          onClick={() => { setCustomBrain(null); setBrainModelDraft(''); setBrainKeyDraft(''); }}
                        >
                          恢复默认设置
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${styles.chip} ${styles.chipPrimary}`}
                        onClick={() => {
                          const cleanModel = brainModelDraft.trim() || undefined;
                          const cleanKey = brainKeyDraft.trim() || undefined;
                          if (!cleanModel && !cleanKey) setCustomBrain(null);
                          else setCustomBrain({ preset: brainPresetDraft, ...(cleanModel ? { model: cleanModel } : {}), ...(cleanKey ? { apiKey: cleanKey } : {}) });
                          setBrainModalOpen(false);
                        }}
                      >
                        应用至当前会话
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.brainToolsSection}>
                <div className={styles.brainToolsHead}>
                  <strong>研究助手核心能力</strong>
                </div>

                <div className={styles.brainToolGrid}>
                  {[
                    {
                      title: '选题与问卷设计',
                      summary: '梳理研究背景、构建概念与题项映射矩阵，并核查地区田野调研参考资料。',
                    },
                    {
                      title: '深度数据分析',
                      summary: '自动核查样本质量、规避统计陷阱，检验人群差异并提炼核心实证发现。',
                    },
                    {
                      title: '图表与素材制作',
                      summary: '生成学术三线表与高清统计配图，支持一键收存至素材架并规范插入报告。',
                    },
                    {
                      title: '文献核验与报告撰写',
                      summary: '核对真实学术文献信息，按章节规范生成严谨报告初稿并给出答辩审阅建议。',
                    },
                  ].map((cap, index) => (
                    <div key={cap.title} className={styles.brainToolCard} style={{ '--stagger-i': index } as CSSProperties}>
                      <strong>{cap.title}</strong>
                      <p>{cap.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {theaterConfig.open && (
        <div
          className={styles.theaterModalBackdrop}
          role="presentation"
          onClick={event => { if (event.target === event.currentTarget) closeSiliconTheater(); }}
          onKeyDown={event => { if (event.key === 'Escape') closeSiliconTheater(); }}
        >
          <section className={styles.theaterModalShell} role="dialog" aria-modal="true" aria-label="硅基预测试内置流程">
            <header className={styles.theaterModalHead}>
              <div className={styles.theaterModalTopRow}>
                <div className={styles.theaterRibbonMeta}>
                  <span className={styles.theaterSourcePill}>{liveTheaterBundle ? `${liveTheaterBundle.sourceLabel} · ${liveTheaterBundle.design.questions.length} 题` : '正在准备课题构念'}</span>
                  <span className={styles.theaterHonestTag}>硅基模拟 · 与真实调查分开</span>
                </div>
                <div className={styles.theaterModalPrimaryActions}>
                  <button
                    type="button"
                    className={`${styles.theaterRibbonBtn} ${styles.mobileControlsBtn}`}
                    aria-expanded={mobileTheaterControls}
                    onClick={() => setMobileTheaterControls(v => !v)}
                  >
                    {mobileTheaterControls ? '收起 ▴' : '队列 ▾'}
                  </button>
                  <Link href="/workspace#silicon" className={styles.theaterRibbonBtn} onClick={closeSiliconTheater}>
                    去“硅基样本”↗
                  </Link>
                  <button type="button" autoFocus className={styles.theaterCloseBtn} aria-label="关闭硅基推演窗口" onClick={closeSiliconTheater}>
                    <Icon name="close" />
                  </button>
                </div>
              </div>
              <div className={styles.theaterRibbonControls} data-mobile-open={mobileTheaterControls ? 'true' : 'false'}>
                <select
                  aria-label="选择硅基受访人群模板"
                  className={styles.theaterRibbonSelect}
                  value={theaterConfig.templateKey}
                  onChange={e =>
                    setTheaterConfig(prev => ({
                      ...prev,
                      templateKey: e.target.value as SiliconTemplateKey,
                      playKey: prev.playKey + 1,
                    }))
                  }
                >
                  <option value="residents">城市与社区居民</option>
                  <option value="students">高校大学生</option>
                  <option value="seniors">银发高龄群体</option>
                </select>
                <select
                  aria-label="选择硅基推演样本量"
                  className={styles.theaterRibbonSelect}
                  value={String(theaterConfig.size)}
                  onChange={e =>
                    setTheaterConfig(prev => ({
                      ...prev,
                      size: Number(e.target.value) || 24,
                      playKey: prev.playKey + 1,
                    }))
                  }
                >
                  <option value="12">12 位人设</option>
                  <option value="24">24 位人设</option>
                  <option value="36">36 位人设</option>
                </select>
                <button
                  type="button"
                  className={styles.theaterRibbonBtn}
                  onClick={() =>
                    setTheaterConfig(prev => ({
                      ...prev,
                      seed: prev.seed + 1,
                      playKey: prev.playKey + 1,
                    }))
                  }
                >
                  换一批受访者
                </button>
                {theaterConfig.customDesign && (
                  <button
                    type="button"
                    className={styles.theaterRibbonBtn}
                    onClick={() => {
                      if (!design && theaterConfig.topic.trim()) {
                        ensureTheaterTopicDesign(theaterConfig.topic.trim());
                      }
                      setTheaterConfig(prev => ({
                        ...prev,
                        customDesign: null,
                        playKey: prev.playKey + 1,
                      }));
                    }}
                  >
                    恢复项目问卷
                  </button>
                )}
              </div>
            </header>

            <div className={styles.theaterMountInner}>
              {liveTheaterBundle ? (
              <AtypicaLiveTheater
                key={`${theaterConfig.templateKey}:${theaterConfig.size}:${theaterConfig.seed}:${theaterConfig.playKey}:${liveTheaterBundle.design.title}`}
                design={liveTheaterBundle.design}
                attributes={liveTheaterBundle.attrs}
                personas={liveTheaterBundle.panel}
                settings={liveTheaterBundle.runSettings}
                run={liveTheaterBundle.run}
                autoPlay
                modalMode
                canCallBrain={Boolean(projectId) && effectiveBrain.available}
                reportActionLabel="写入“报告”方案节"
                onClose={closeSiliconTheater}
                onSendToAnalysis={(handoff: DatasetHandoff) => {
                  sendSiliconToAnalysis(handoff);
                  closeSiliconTheater();
                  threads.append([
                    {
                      ...stamp(),
                      role: 'agent',
                      turn: {
                        lines: [
                          [
                            span('已将硅基预测试数据集 '),
                            span(`“${handoff.name}”`, 'strong'),
                            span(`（${liveTheaterBundle.run.responses.length} 条硅基模拟作答，含“硅基模拟”溯源列）导入右侧“数据分析”面板。`),
                          ],
                          [span('可直接在右侧运行卡方/信效度/回归，或在对话中生成可编辑三线表与矢量图。', 'dim')],
                        ],
                        chips: [
                          { label: '打开图表工坊', action: { type: 'say', text: '打开图表工坊' }, primary: true },
                          { label: '定位数据分析', action: { type: 'open', room: 'analysis' } },
                        ],
                      },
                    },
                  ]);
                }}
                onOpenReportAction={(bp: AtypicaFlowBlueprint) => {
                  const summaryBlock = [
                    `本研究组织 ${bp.enrichedPersonas.length} 位分层硅基受访者开展问卷预测试推演，共识别出 ${bp.report.metrics.blockers} 项阻断问题与 ${bp.report.metrics.warnings} 项预警提示（模拟作答仅用于题干质控），据此梳理了以下修订要点。`,
                    ...bp.report.actionChecklist,
                    bp.discussionSummary ? `焦点小组讨论进一步反映，${bp.discussionSummary}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n');
                  const targetSec =
                    paperContent.report.find(sec => sec.id === 'design.questionnaire') ??
                    paperContent.report.find(sec => /调查方案|问卷/u.test(sec.title)) ??
                    paperContent.report[2] ??
                    paperContent.report[1] ??
                    paperContent.report[0];
                  const targetSecId = targetSec?.id;
                  const nextReport = paperContent.report.map(sec =>
                    sec.id === targetSecId
                      ? {
                          ...sec,
                          body: sec.body.trim() ? `${sec.body.trim()}\n\n${summaryBlock}` : summaryBlock,
                        }
                      : sec,
                  );
                  commitStudioReport(
                    { ...paperContent, report: nextReport },
                    '已将硅基预测试洞察与焦点小组结论写入报告，并切至成文视图。',
                    liveTheaterBundle.design,
                  );
                  closeSiliconTheater();
                  if (targetSecId) requestAnimationFrame(() => pickSection(targetSecId));
                  threads.append([
                    {
                      ...stamp(),
                      role: 'agent',
                      turn: {
                        lines: [
                          [span('已将预测试阻断提示与焦点小组分歧写入报告正文，并切换至报告视图。')],
                        ],
                        chips: [
                          {
                            label: '按预测试发现精修问卷',
                            action: {
                              type: 'say',
                              text: `请结合刚才 ${bp.enrichedPersonas.length} 位硅基受访者的预测试阻断（${bp.report.metrics.blockers}项）和焦点小组意见，优化“${liveTheaterBundle.design.title}”的题干与选项设计。`,
                            },
                            primary: true,
                          },
                          { label: '打开撰稿工坊', action: { type: 'say', text: '打开撰稿工坊' } },
                        ],
                      },
                    },
                  ]);
                }}
              />
              ) : (
                <div className={styles.theaterLoading} role="status">正在准备硅基样本预测试流程</div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  </GenerationProvider></WorkbenchNavProvider></ThemeProvider>;
}

function subscribeResize(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}

const span = (text: string, mark?: Mark): Span => mark ? { text, mark } : { text };
/** A conversation entry as plain text for the model: what was said, without cards or buttons. */
function chatLine(message: Message): ChatLine[] {
  if (message.role === 'user') return [{ role: 'user', text: message.text }];
  // A question put to the user (a consent or confirmation) is not part of what was said about the research.
  if (message.role !== 'agent' || message.turn.cards?.some(card => card.kind === 'confirm' || card.kind === 'consent')) return [];
  const text = message.turn.lines.map(line => line.map(spanText).join('')).join('\n').trim();
  return text ? [{ role: 'agent', text }] : [];
}

/** The conversation as a Markdown record, dated now. */
function exportRecord(thread: RecordThread) {
  const now = Date.now();
  void loadTranscriptExport().then(({ conversationMarkdown, recordName }) => {
    download(recordName(thread, now), conversationMarkdown(thread, now));
  });
}

/** Saves text as a file the user downloads; nothing leaves the browser. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
