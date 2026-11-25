/**
 * The 证见 agent's command mode: a deterministic router from what the user types to what the shell does.
 * It understands slash commands and a fixed set of everyday phrasings. Anything else it says it cannot understand
 * rather than guessing, and knowledge questions are answered from the reviewed knowledge base verbatim, with sources.
 */
import { COMMANDS, matchCommands, type Command } from './commands.ts';
import { lightBar, percent } from './glyphs.ts';
import type { Illumination, LightCheck } from './illumination.ts';
import type { Trace, TraceStep } from './provenance.ts';
import { ROOMS, roomById, type Room, type RoomId } from './rooms.ts';
import type { ChatAction } from './chat.ts';
import type { Questionnaire } from '../questionnaire.ts';
import type { ReferenceEntry } from '../references.ts';
import { blueprintNode, matchBlueprintNode, type BlueprintNode } from '../report-blueprint.ts';
import type { CountyGazetteerProfile } from '../resource-library/china-county-gazetteer.ts';
import type { SmartRecommendationBundle } from '../resource-library/smart-recommender.ts';
import type { PlanSection, ReportPlan } from './report-plan.ts';
import { METHOD_LABELS, suggestedNode } from '../report-placement.ts';
import { findingNeedsReview, type ResearchFinding, type ResultSnapshot } from '../research-quality.ts';
import type { QuestionnaireGenerationRequest } from '../questionnaire-proposals.ts';
import type { ModelConsentBinding } from './model-routing.ts';
import { computeSealDigest } from '../provenance-seal.ts';
import {
  buildChartStudioTurn,
  buildCoachTurn,
  buildCodeStudioTurn,
  buildDemoTurn,
  buildSiliconTheaterTurn,
  buildWritingStudioTurn,
  inferSiliconTemplate,
  type ChartStudioCardData,
  type CodeStudioCardData,
  type SiliconTheaterCardData,
  type SiliconTemplateKey,
  type WritingStudioCardData,
} from './studios.ts';

/**
 * gold: a number with an origin · cyan: generated, unconfirmed · teal: a method or command · error: failures only.
 * tex and math: the text is TeX, typeset inline or on a line of its own; formulas are never shown as plain text.
 */
export type Mark = 'gold' | 'cyan' | 'teal' | 'dim' | 'error' | 'strong' | 'tex' | 'math';
export type Span = { text: string; mark?: Mark };
export type Line = Span[];
export type AgentAction =
  | { type: 'open'; room: RoomId }
  | { type: 'theme'; theme: 'light' | 'dark' }
  | { type: 'search' }
  | { type: 'entry'; id: string }
  | { type: 'clear' }
  | { type: 'href'; href: string }
  /** Sends a command as if the user had typed it, so every step stays in the transcript. */
  | { type: 'say'; text: string }
  /** Sends a sentence to the model the user has just agreed to, from the consent card. */
  | { type: 'chat'; text: string; modelBinding?: ModelConsentBinding }
  /** Reads the receipt of a model turn whose outcome was unclear; never calls the model again. */
  | { type: 'check'; turn: string; message: string }
  /** Writes these registered results into the report's blueprint sections; offered only on a confirmation card. */
  | { type: 'place'; results: string[] }
  /** Asks the user's model service to draft this blueprint section; offered only on a confirmation card. */
  | { type: 'draft'; node: string; existingText?: string; modelBinding?: ModelConsentBinding }
  /**
   * Writes a draft's paragraphs, numbers already filled from the facts, into this blueprint section. `cited` holds the
   * statements of the facts they cite, checked against the project's current facts before anything is written.
   */
  | { type: 'adopt'; node: string; paragraphs: string[]; cited: string[] }
  /** Reads the receipt of a draft whose outcome was unclear, filling it from the facts it was sent with; never calls the model again. */
  | { type: 'checkDraft'; draft: string; message: string; node: string; facts: { id: string; text: string; value: string }[] }
  /** Loads a labelled teaching study with computed results. */
  | { type: 'loadBenchmark'; benchmarkId: string }
  /** Runs the 00–06 full-workflow LLM multi-chapter report generation pipeline (26 sections + 4 ledgers + 6-advisor self-repair). */
  | { type: 'generateFullReport'; topic: string; mode?: 'plan' | 'demonstration' | 'empirical'; modelBinding?:ModelConsentBinding; inputRevision?:string }
  /** Stores a session-scoped LLM API key in browser sessionStorage for direct full-report generation. */
  | { type: 'setApiKey'; apiKey: string }
  /** Opens the LLM consent & fact-grounded section drafting flow directly from studio/outline buttons. */
  | { type: 'draftSection'; node: string; draft?: string }
  /** Switches the active workspace stage between chat, paper, advisors, and library on demand. */
  | { type: 'stage'; stage: 'chat' | 'paper' | 'advisors' | 'library' }
  /** Inserts text/code/chart-reading paragraphs or a verified table snapshot produced in an interactive card into a blueprint section. */
  | { type: 'insertStudioBlock'; node: string; title: string; paragraphs: string[]; tableResult?: ResultSnapshot; tableCaption?: string }
  /** Registers a structured verified bibliographic entry into `content.references[]`. */
  | { type: 'insertReference'; entry: ReferenceEntry }
  /** Registers a structured empirical finding (plus optional backing ResultSnapshot) into `content.quality.findings[]`. */
  | { type: 'insertFinding'; finding: ResearchFinding; result?: ResultSnapshot; node?: string; paragraph?: string }
  /** Generates a structured local-draft questionnaire through the direct Research Brain in guest mode. */
  | { type: 'draftLocalQuestionnaire'; brief: string }
  /** Opens or plays the 1:1 Atypica × Silicon Respondents live theater inside Agent main stage. */
  | { type: 'siliconTheater'; topic?: string; templateKey?: SiliconTemplateKey; size?: number; autoPlay?: boolean; design?: Questionnaire };
/** A primary link is the one step the agent recommends; a turn has at most one. */
export type AgentLink = { label: string; action: AgentAction; primary?: true };
export type AgentCard =
  /** With `columns`, each line is a row and each span a cell, aligned under the row above. */
  | { kind: 'tool'; title: string; lines: Line[]; links?: AgentLink[]; columns?: boolean; previewSvgDataUri?: string; previewAlt?: string }
  | { kind: 'confirm'; title: string; lines: Line[]; confirm: AgentLink; cancel: string }
  | { kind: 'entry'; id: string; name: string; english?: string; definition: string; formula?: string; sources: string[]; reviewed: boolean }
  | { kind: 'trace'; reference: string; title: string; steps: TraceStep[] }
  /** The double frame before a model call: the research need as sent, the project it is saved to, the service that runs it. */
  | { kind: 'consent'; brief: string; state: 'open' | 'submitted' | 'cancelled'; projectId?: string; projectTitle?: string; serviceId?: string; serviceLabel?: string }
  /**
   * A model call. `request` is kept while its outcome is unknown, so a check replays it exactly and costs nothing new.
   * `noCall`: it failed before any model ran (refused by the service, or stopped before the request was sent).
   */
  | { kind: 'job'; status: 'running' | 'done' | 'failed' | 'unknown'; detail: string; projectId: string; serviceLabel: string; model: string; request?: QuestionnaireGenerationRequest; noCall?: true }
  /** A questionnaire the model proposed: generated and not yet reviewed, so it is shown as such until 问卷设计 applies it. */
  | { kind: 'proposal'; projectId: string; proposalId: string; serviceId: string; serviceRevision: number; serviceLabel: string; model: string; inputRevision: number; design: Questionnaire }
  /** High-freedom interactive SVG Chart Studio card. */
  | { kind: 'chart-studio'; title: string; studio: ChartStudioCardData }
  /** High-freedom multi-language (Python / R / SPSS / LaTeX) Statistical Code Studio card. */
  | { kind: 'code-studio'; title: string; studio: CodeStudioCardData }
  /** High-freedom evidence-bound Co-Authoring & 5W1H Defense Writing Studio card. */
  | { kind: 'writing-studio'; title: string; studio: WritingStudioCardData }
  /** Interactive Atypica × Silicon Respondents live theater launch card inside Agent chat. */
  | { kind: 'silicon-theater'; title: string; studio: SiliconTheaterCardData };
export type AgentTurn = { lines: Line[]; cards?: AgentCard[]; chips?: AgentLink[]; chipsLabel?: string; act?: AgentAction };
/** `traces` are the report's exhibits with their paths back (provenance.ts); the shell computes them with the light. */
/** `room` is the module open in the side panel, or null while only the conversation shows. */
/** What the report holds of registered work, or null before the report has been seen in this visit. */
export type ResultsView = { results: readonly ResultSnapshot[]; findings: readonly ResearchFinding[]; pending: boolean;
  /** The results the report already shows. */
  placed: readonly string[] } | null;
export type RouterContext = { room: RoomId | null; light: Illumination; theme?: 'light' | 'dark'; traces?: readonly Trace[]; results?: ResultsView;
  /** The report as a plan of work; null before the report has been seen in this visit. */
  plan?: ReportPlan | null;
  /** Optional active project title, questionnaire design, and dataset name for topic-adaptive studios. */
  projectTitle?: string;
  design?: Questionnaire | null;
  datasetName?: string };
/** Either an answer, a knowledge/county/resource lookup resolved by the shell, or a model consent handoff. */
export type Routed =
  | { turn: AgentTurn }
  | { lookup: string; explicit: boolean }
  | { lookupCounty: string }
  | { recommendResource: { query?: string; ctx: RouterContext } }
  /** A request to draft a questionnaire with the user's model service; the shell asks for consent before any call. */
  | { generate: string }
  /** A request to draft a report section (a blueprint node) with the user's model service; consent comes first too. */
  | { draft: string };

export { COMMANDS, matchCommands, type Command };

const LIT_ROOMS = ['design', 'sampling', 'analysis', 'editor'] as const satisfies readonly RoomId[];
const roomLight = (light: Illumination, room: RoomId) => light.rooms.find(r => r.room === room) ?? null;
const exhibitKey = (text: string) =>
  text
    .replace(/\s+/gu, '')
    .replace(/[０-９]/gu, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(/[－—.．]/gu, '-');
const draftableNode = (text: string): BlueprintNode | null => {
  const node = matchBlueprintNode(text.trim());
  return node && (node.kind === 'section' || node.kind === 'abstract') ? node : null;
};
const sectionState = (s: PlanSection): 'missing' | 'empty' | 'partial' | 'done' => {
  if (!s.present) return 'missing';
  if (!s.written && s.needs.every(n => !n.met)) return 'empty';
  if ((s.length && s.written < s.length[0]) || s.needs.some(n => !n.met)) return 'partial';
  return 'done';
};

const t = (text: string, mark?: Mark): Span => mark ? { text, mark } : { text };
const say = (label: string, text = label): AgentLink => ({ label, action: { type: 'say', text } });
const recommend = (link: AgentLink): AgentLink => ({ ...link, primary: true });
const named = (id: RoomId) => roomById(id).name;
const lit = (id: RoomId): id is (typeof LIT_ROOMS)[number] => (LIT_ROOMS as readonly RoomId[]).includes(id);

/** Modules named in a sentence, the longest name first, so 问卷设计 outranks a passing 数据. */
export function mentionedRooms(text: string): Room[] {
  const lower = text.toLowerCase();
  return ROOMS.map(room => ({ room, length: Math.max(0, ...[room.name, ...room.aliases].filter(a => lower.includes(a.toLowerCase())).map(a => a.length)) }))
    .filter(m => m.length > 0).sort((a, b) => b.length - a.length).map(m => m.room);
}

function help(): AgentTurn {
  return {
    lines: [[t('我是'), t('证见', 'strong'), t('。当前处于'), t('指令模式', 'teal'), t('，可直接使用自然中文对话触发功能；在输入框敲入 '), t('/', 'teal'), t(' 即可调出全部隐藏快捷命令。也可在右下角切换“用模型对话”。')]],
    cards: [
      {
        kind: 'tool',
        title: '常用自然说法示例',
        columns: true,
        lines: [
          [t('工作流与进度', 'dim'), t('“下一步做什么”“查看项目照度”“还缺什么”“查看备赛路线”')],
          [t('工坊与教学模拟', 'dim'), t('“生成教学模拟研究”“打开图表工坊”“打开代码工坊”“打开撰稿工坊”')],
          [t('报告与结果', 'dim'), t('“登记了哪些结果”“把结果写进报告”“查看报告进度”“图 1-1 的数字从哪来”')],
          [t('设计与知识检索', 'dim'), t('“打开问卷设计”“帮我出一份……的问卷”“什么是设计效应”“切换到深色主题”')],
        ],
      },
      {
        kind: 'tool',
        title: '隐藏命令与服务接入',
        lines: [
          [t('快捷命令已默认隐藏，在输入框键入 '), t('/', 'teal'), t(' 即可弹出全部 '), t(String(COMMANDS.length), 'gold'), t(' 项命令菜单。')],
          [t('在“服务设置”中完成接入后，可在“撰稿工坊”或输入框右下角切换“用模型对话”直接起草正文。', 'dim')],
        ],
      },
    ],
    chips: [recommend(say('下一步做什么')), say('查看项目照度'), say('查看备赛路线')],
  };
}

function lightLine(id: RoomId, light: Illumination): Line {
  const r = roomLight(light, id);
  if (!r) return [t('该模块的证据完整度暂未纳入统计', 'dim')];
  return [t('照度 '), t(lightBar(r.score), r.score > 0 ? 'gold' : 'dim'), t(` ${percent(r.score)}`, 'gold'), t(`　${r.summary}`, 'dim')];
}

function status(ctx: RouterContext, scope?: RoomId): AgentTurn {
  const { light } = ctx;
  if (scope) {
    const r = roomLight(light, scope)!;
    return {
      lines: [[t(`${named(scope)}的照度 `), t(percent(r.score), 'gold'), t('，逐项核查结果如下。')]],
      cards: [{ kind: 'tool', title: `读取 · ${named(scope)}`, columns: true, lines: r.checks.slice(0, 12).map(c => [t(c.passed ? '✓' : '✕', c.passed ? 'gold' : 'error'), t(c.label), t(c.detail, 'dim')]) }],
      chips: [say('下一步做什么')],
    };
  }
  return {
    lines: [[t('整体照度 '), t(percent(light.overall), 'gold'), t('。')], [t('照度当前计算已承载证据的问卷、抽样、分析与报告四个核心模块。', 'dim')]],
    cards: [{ kind: 'tool', title: '读取 · 项目照度', columns: true, lines: light.rooms.map(r => [t(named(r.room)), t(lightBar(r.score), r.score > 0 ? 'gold' : 'dim'), t(percent(r.score), 'gold'), t(r.summary, 'dim')]) }],
    chips: [recommend(say('下一步做什么')), say('还缺什么')],
  };
}

function sealStatus(ctx: RouterContext): AgentTurn {
  const { light } = ctx;
  const gates = light.rooms.flatMap((r, ri) =>
    r.checks.map((c, ci) => ({
      id: `G${ri + 1}${ci + 1}`,
      name: c.label,
      status: (c.passed ? 'passed' : 'pending') as 'passed' | 'pending',
    })),
  );
  const digest = computeSealDigest({
    gates,
    qdia: {
      questions: light.rooms[0]?.checks.filter(c => c.passed).length ?? 0,
      sampleRows: light.rooms[1]?.checks.filter(c => c.passed).length ?? 0,
      results: ctx.results?.results.length ?? 0,
      findings: ctx.results?.findings.length ?? 0,
    },
  });
  return {
    lines: [
      [t('九门循证核验码 '), t(digest, 'gold'), t(' · 整体照度 '), t(percent(light.overall), 'gold'), t('。')],
      [t('每一项研究结论均须绑定上游问卷、抽样与分析结果校验码。', 'dim')],
    ],
    cards: [{
      kind: 'tool',
      title: `核验印鉴 · ${digest}`,
      columns: true,
      lines: light.rooms.map(r => [t(named(r.room)), t(lightBar(r.score), r.score > 0 ? 'gold' : 'dim'), t(percent(r.score), 'gold'), t(r.summary, 'dim')]),
    }],
    chips: [recommend(say('下一步做什么')), say('查看项目照度'), say('还缺什么')],
  };
}

function blindSpots(ctx: RouterContext, scope?: RoomId): AgentTurn {
  const spots = ctx.light.blind.filter(c => !scope || c.room === scope);
  const where = scope ? named(scope) : '项目';
  if (!spots.length) return { lines: [[t(`${where}没有盲区，`), t('检查全部通过', 'gold'), t('。')]], chips: [recommend(say('下一步做什么'))] };
  const shown = spots.slice(0, 8), rooms = [...new Set(shown.map(c => c.go))];
  return {
    lines: [[t(`${where}里光到不了的角落有 `), t(String(spots.length), 'gold'), t(' 处，按研究动线依次列出。')]],
    cards: [{
      kind: 'tool', title: '读取 · 盲区',
      lines: [...shown.map((c: LightCheck) => [t('✕ ', 'error'), t(`${named(c.room)} · `, 'dim'), t(c.label), t(`　${c.detail}`, 'dim')]),
        ...(spots.length > shown.length ? [[t(`还有 ${spots.length - shown.length} 处，项目全景里列全了。`, 'dim')]] : [])],
      links: rooms.map(id => ({ label: `去${named(id)}`, action: { type: 'open' as const, room: id } })),
    }],
  };
}

function buildFullReportTurn(ctx: RouterContext, rawTopic = ''): AgentTurn {
  const topic=rawTopic.trim()||ctx.projectTitle?.trim()||'当前研究课题';
  const action:AgentAction={type:'generateFullReport',topic:rawTopic.trim()||ctx.projectTitle?.trim()||''};
  return {
    lines:[[t('从当前项目资料生成'),t('可审阅的报告候选稿','strong'),t('。')],[t(`围绕课题“${topic}”，主体章节与综合章节将分阶段起草，完成后核查再采纳。`,'dim')]],
    cards:[{kind:'tool',title:'本轮生成计划',lines:[
      [t('输入与模式','teal'),t('　使用当前问卷、数据与登记结果；研究计划、教学模拟和项目实证明确分开。','dim')],
      [t('检查与修订','teal'),t('　逐项记录已通过、待复核和未执行检查，展示实际修改前后的正文。','dim')],
      [t('原稿保护','teal'),t('　生成过程中原稿保留；比较、锁定章节后决定是否采纳为草稿。','dim')],
      [t('交付边界','teal'),t('　完整度检查不代表独立审稿或文件验收；最终导出仍需复核。','dim')],
    ],links:[{label:'查看生成计划',action,primary:true}]}],
    chips:[recommend({label:'查看生成计划',action}),say('查看报告进度'),{label:'提交前体检',action:{type:'open',room:'preflight'}}],
  };
}

function buildApiKeyTurn(): AgentTurn {
  return {lines:[[t('请在个人服务设置中完成接入并启用报告能力，请勿在对话中直接输入访问凭据。','dim')]],chips:[{label:'打开服务设置',action:{type:'open',room:'services'},primary:true}]};
}

function nextStep(ctx: RouterContext): AgentTurn {
  const spot = ctx.light.blind[0];
  if (!spot) return { lines: [[t('有照度的模块，检查都通过了。')], [t('可以打开路演答辩演练追问，交稿前用提交前体检查一遍文件。', 'dim')]], chips: [{ label: '打开路演答辩', action: { type: 'open', room: 'defense' } }, { label: '提交前体检', action: { type: 'open', room: 'preflight' } }] };
  return {
    lines: [[t('下一步：'), t(spot.label, 'strong'), t('。')], [t(spot.detail, 'dim')]],
    chips: [recommend({ label: `打开${named(spot.go)}`, action: { type: 'open', room: spot.go } }), say('还缺什么')],
  };
}

/** 回溯: one exhibit's path back to its origin, or the exhibits to choose from. `arg` is an exhibit number or words of its title. */
function trace(ctx: RouterContext, arg = ''): AgentTurn {
  const traces = ctx.traces ?? [], wanted = arg.trim(), key = exhibitKey(wanted);
  if (!traces.length) return {
    lines: [[t('报告里还没有来自登记结果的图表。')], [t('在数据分析里完成一项分析并发送到报告，或从抽样设计插入抽样框，就能沿光路回溯到数据与题目。', 'dim')]],
    chips: [recommend({ label: '打开数据分析', action: { type: 'open', room: 'analysis' } }), { label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } }],
  };
  const chosen = wanted ? traces.filter(x => exhibitKey(x.reference) === key || x.title.includes(wanted)) : traces.length === 1 ? traces : [];
  if (chosen.length === 1) {
    const x = chosen[0];
    return { lines: [[t(x.reference, 'strong'), t(`“${x.title}”的数字，沿光路回到来处。`)]], cards: [{ kind: 'trace', reference: x.reference, title: x.title, steps: x.steps }] };
  }
  return {
    lines: wanted ? [[t('报告里没有'), t(`“${wanted}”`, 'strong'), t('，可以回溯的图表如下。')]] : [[t('报告里有 '), t(String(traces.length), 'gold'), t(' 个来自登记结果的图表，回溯哪一个？')]],
    chips: traces.slice(0, 8).map(x => say(`${x.reference} ${x.title}`.slice(0, 26), `回溯：${x.reference}`)),
  };
}

/** A statistic as the record shows it: whole numbers as they are, others to four significant digits. */
export const figure = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(Math.abs(value) >= 1000 ? 7 : 4)));

/** A sampling frame inserted from 抽样设计 is registered like a result, but it is a plan, not an analysis. */
export const isFrame = (result: ResultSnapshot) => result.method === 'sampling-frame';
export const methodName = (r: ResultSnapshot) => Object.hasOwn(METHOD_LABELS, r.method) ? METHOD_LABELS[r.method] : r.method;
/** Findings that still stand: confirmed, and every result they rest on unchanged since. */
export const standingFindings = (held: NonNullable<ResultsView>) =>
  held.findings.filter(f => !findingNeedsReview(f, { version: 1, results: [...held.results], findings: [...held.findings] }));
// Each warning is its own sentence; joined, they keep one stop between them.
const warned = (r: ResultSnapshot) => `　提醒：${r.warnings.slice(0, 2).map(w => w.trim().replace(/[。；;.\s]+$/u, '')).join('；')}。`;
const known = (r: ResultSnapshot) => r.metrics.filter((m): m is { label: string; value: number } => m.value !== null && Number.isFinite(m.value));
const statistics = (r: ResultSnapshot, limit: number): Line[] => {
  const metrics = known(r).slice(0, limit);
  return metrics.length ? [metrics.flatMap((m, i) => [t(i ? '；' : '　'), t(`${m.label} `), t(figure(m.value), 'gold')])] : [];
};

/**
 * Registered results as the report holds them: each analysis with its method, effective sample and leading statistics,
 * numbers in gold, data from the teaching simulation marked as such; then the sampling frames, which are plans; then
 * the confirmed findings. A query narrows them by title, method or variable and shows more of each.
 */
function results(ctx: RouterContext, query = ''): AgentTurn {
  const held = ctx.results;
  if (!held) return {
    lines: [[t('登记的结果存在报告里；这次访问还没有打开报告与 PPT，所以我还读不到。')], [t('打开一次报告与 PPT，再问一遍。', 'dim')]],
    chips: [recommend({ label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } })],
  };
  const all = [...held.results].reverse(), wanted = query.trim().toLowerCase();
  if (!all.length) return {
    lines: [[t('还没有登记的分析结果。')], [t(held.pending ? '有一项结果正在送往报告，在报告与 PPT 里收下后就能读到。' : '在数据分析里完成一项分析并登记，结果会带着方法与有效样本进入报告。', 'dim')]],
    chips: [recommend({ label: held.pending ? '打开报告与 PPT' : '打开数据分析', action: { type: 'open', room: held.pending ? 'editor' : 'analysis' } })],
  };
  const chosen = wanted ? all.filter(r => [r.title, isFrame(r) ? `抽样框 ${methodName(r)}` : `${r.method} ${methodName(r)}`, ...(r.variables ?? [])].join(' ').toLowerCase().includes(wanted)) : all;
  if (!chosen.length) return {
    lines: [[t('登记的结果里没有'), t(`“${query.trim()}”`, 'strong'), t('，现有结果如下。')]],
    chips: all.slice(0, 6).map(r => say(r.title.slice(0, 20), `筛选结果：${r.title.slice(0, 20)}`)),
  };
  const analyses = chosen.filter(r => !isFrame(r)), frames = chosen.filter(isFrame);
  const shown = analyses.slice(0, wanted ? 4 : 8), simulated = analyses.filter(r => r.classification === 'simulated').length;
  // A finding whose results changed after it was confirmed is not shown as confirmed; the user re-confirms it first.
  const confirmed = wanted ? [] : standingFindings(held), stale = wanted ? 0 : held.findings.filter(f => f.status === 'confirmed').length - confirmed.length;
  const about = wanted ? `与“${query.trim()}”有关的` : '';
  return {
    lines: [
      analyses.length
        ? [t(`${about}已登记的分析结果 `), t(String(analyses.length), 'gold'), t(' 项'), ...(simulated ? [t(`，其中 ${simulated} 项来自教学模拟数据`, 'dim')] : []), t('。')]
        : [t(`${about ? `${about}登记里` : ''}还没有分析结果`), t(`，只有写进报告的抽样框 ${frames.length} 份。`)],
      ...(analyses.length > shown.length ? [[t(`这里列出最近的 ${shown.length} 项；在问题里写出标题或方法可以找到其余的。`, 'dim')]] : []),
      ...(stale ? [[t(`另有 ${stale} 条研究发现所依据的结果在确认后变了，需要在报告与 PPT 里重新确认，这里不列出。`, 'dim')]] : []),
    ],
    cards: [
      ...(shown.length ? [{ kind: 'tool' as const, title: '读取 · 已登记结果', lines: shown.flatMap(r => [
        [t(r.title, 'strong'), t(`　${methodName(r)} · 有效样本 `, 'dim'), t(String(r.n), 'gold'), t(` / ${r.total}`, 'dim'), ...(r.classification === 'simulated' ? [t(' · 教学模拟', 'dim')] : []),
          t(held.placed.includes(r.id) ? ' · 已写进报告' : ' · 未写进报告', 'dim')],
        ...statistics(r, wanted ? 8 : 4),
        ...(r.warnings.length ? [[t(warned(r), 'dim')]] : []),
      ]) }] : []),
      ...(frames.length ? [{ kind: 'tool' as const, title: '已写进报告的抽样框（计划，不是分析结果）', lines: frames.slice(0, 6).flatMap(r => [[t(r.title, 'strong')], ...statistics(r, 4)]) }] : []),
      ...(confirmed.length ? [{ kind: 'tool' as const, title: '已确认的研究发现', lines: confirmed.slice(0, 6).map(f => [t(f.title, 'strong'), t(`　${f.interpretation}`, 'dim')]) }] : []),
    ],
    chips: analyses.some(r => !held.placed.includes(r.id))
      ? [recommend(say('把结果写进报告')), say('沿光路回溯来处')]
      : analyses.length
        ? [say('沿光路回溯来处'), { label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } }]
        : [recommend({ label: '打开数据分析', action: { type: 'open', room: 'analysis' } }), { label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } }],
  };
}

/**
 * Registered results not yet in the report, written into their blueprint sections once the user confirms: each with
 * its method paragraph and formulas (once per method), its figure or table, and its reading paragraph.
 */
function place(ctx: RouterContext): AgentTurn {
  const held = ctx.results;
  if (!held) return {
    lines: [[t('登记的结果存在报告里；这次访问还没有打开报告与 PPT，所以我还读不到。')], [t('打开一次报告与 PPT，再说“把结果写进报告”。', 'dim')]],
    chips: [recommend({ label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } })],
  };
  if (!held.results.length) return { lines: [[t('还没有登记的结果可写。')], [t('在数据分析里完成一项分析并登记，再回来写入。', 'dim')]], chips: [recommend({ label: '打开数据分析', action: { type: 'open', room: 'analysis' } })] };
  const waiting = [...held.results].filter(r => !held.placed.includes(r.id));
  if (!waiting.length) return { lines: [[t('已登记的 '), t(String(held.results.length), 'gold'), t(' 项结果都已写进报告。')]], chips: [recommend(say('报告还缺什么')), { label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } }] };
  const sections = new Map<string, ResultSnapshot[]>();
  for (const r of waiting) { const title = blueprintNode(suggestedNode(r)).title; sections.set(title, [...(sections.get(title) ?? []), r]); }
  const simulated = waiting.filter(r => r.classification === 'simulated').length;
  return {
    lines: [[t('把 '), t(String(waiting.length), 'gold'), t(' 项还没写进报告的登记结果按蓝图写入之前，请确认。')]],
    cards: [{ kind: 'confirm', title: `写入报告 · ${waiting.length} 项结果`,
      lines: [
        ...[...sections].map(([title, rs]) => [t(`“${title}”`, 'strong'), t(`　${rs.map(r => r.title).join('、')}`, 'dim')]),
        [t('每项写入方法说明与公式（同一方法只写一次）、图或表与读数段落，数字都来自登记结果；章节不存在时按蓝图新建。', 'dim')],
        ...(simulated ? [[t(`其中 ${simulated} 项来自教学模拟数据，报告里需要如实标注。`, 'dim')]] : []),
        [t('写入后可在报告与 PPT 里撤销。', 'dim')],
      ],
      confirm: { label: '写入', action: { type: 'place', results: waiting.map(r => r.id) } }, cancel: '暂不写入' }],
  };
}

const STATE_GLYPH = { missing: '＋', empty: '○', partial: '◐', done: '●' } as const;
/**
 * The report as a plan of work, section by section in the blueprint's order: what is written against the suggested
 * length, which needed elements are in place, then the benchmark's gaps. It ends with the step to take next: write in
 * the registered results, or draft the first empty section.
 */
function writePlan(ctx: RouterContext): AgentTurn {
  const plan = ctx.plan;
  if (!plan) return {
    lines: [[t('写报告要先读到报告；这次访问还没有打开报告与 PPT。')], [t('打开一次报告与 PPT，再说“写报告”。', 'dim')]],
    chips: [recommend({ label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } })],
  };
  if (!plan.sections.length) return { lines: [[t('报告里还没有按蓝图组织的章节。')], [t('在报告与 PPT 里按报告类型建立蓝图骨架，再回来逐节写。', 'dim')]], chips: [recommend({ label: '打开报告与 PPT', action: { type: 'open', room: 'editor' } })] };
  const unplaced = ctx.results ? ctx.results.results.filter(r => !ctx.results!.placed.includes(r.id)).length : 0;
  const empty = plan.sections.filter(s => s.draftable && ['missing', 'empty'].includes(sectionState(s)));
  // Chapters are headings; each section says where it stands: not yet in the report, empty, under way, or in place.
  const rows = plan.sections.map(s => {
    if (s.kind === 'chapter') return [t(s.title, 'strong')];
    const state = sectionState(s), missing = s.needs.filter(n => !n.met).map(n => n.label);
    return [t(`　${STATE_GLYPH[state]} `, state === 'done' ? 'gold' : 'dim'), t(s.title),
      t(state === 'missing' ? '　未建' : `　已写 ${s.written} 字${s.length ? `（建议 ${s.length[0]}–${s.length[1]}）` : ''}${missing.length ? ` · 尚缺 ${missing.join('、')}` : ''}`, 'dim')];
  });
  const draftChip = (s: { title: string; node: string }): AgentLink => ({ label: `起草“${s.title}”`.slice(0, 26), action: { type: 'draftSection', node: s.node } });
  const next = unplaced ? recommend(say('把结果写进报告')) : empty.length ? recommend(draftChip(empty[0])) : recommend(say('报告还缺什么'));
  return {
    lines: [
      plan.score === null ? [t('按蓝图逐节查看报告进度。')] : [t('报告体检 '), t(String(Math.round(plan.score)), 'gold'), t(` 分，适用的 ${plan.total} 项检查通过 ${plan.passed} 项，各节进度如下。`)],
      [t(unplaced ? `还有 ${unplaced} 项登记结果没写进报告，先把它们写进对应章节；` : '', 'dim'),
        t(empty.length ? `${empty.length} 节还没有内容，可以用你的模型服务按本项目的事实起草，数字只从登记结果填入。` : '每一节都已开始写。', 'dim')],
    ],
    cards: [
      { kind: 'tool', title: '读取 · 报告逐节进度', lines: rows },
      ...(plan.gaps.length ? [{ kind: 'tool' as const, title: '体检里最该补的', lines: plan.gaps.map(g => [t(g.label, 'strong'), t(`　${g.detail}`, 'dim')]) }] : []),
    ],
    chips: [next, ...empty.slice(unplaced ? 0 : 1, unplaced ? 2 : 3).map(draftChip)],
  };
}

/** A section to draft, named by its title or the words that recognise it; without one, the empty sections to choose from. */
function draftTarget(ctx: RouterContext, arg: string): Routed {
  const node = arg ? draftableNode(arg) : null;
  if (node) return { draft: node.id };
  const empty = ctx.plan?.sections.filter(s => s.draftable && sectionState(s) !== 'done') ?? [];
  return { turn: {
    lines: arg ? [[t('报告蓝图里没有'), t(`“${arg}”`, 'strong'), t('这一节。')]] : [[t('起草哪一节？')]],
    chips: empty.length ? empty.slice(0, 6).map(s => ({ label: s.title.slice(0, 20), action: { type: 'draftSection' as const, node: s.node } })) : [say('查看报告进度')],
  } };
}

function open(room: Room, ctx: RouterContext): AgentTurn {
  const siliconLaunch = room.id === 'silicon'
    ? recommend({
        label: '唤起样本预测试推演流程',
        action: {
          type: 'siliconTheater',
          topic: ctx.projectTitle,
          templateKey: inferSiliconTemplate(`${ctx.projectTitle ?? ''} ${ctx.design?.population ?? ''}`),
          size: 24,
          autoPlay: true,
        },
        primary: true,
      })
    : null;
  if (room.id === ctx.room) return {
    lines: [[t(room.name, 'strong'), t('已经在右侧打开。')], [t(room.line, 'dim')]],
    ...(siliconLaunch ? { chips: [siliconLaunch] } : {}),
  };
  return {
    lines: [[t('在右侧打开'), t(room.name, 'strong'), t('。')]],
    cards: [{
      kind: 'tool',
      title: `打开 · ${room.name}`,
      lines: [[t(room.line, 'dim')], ...(lit(room.id) ? [lightLine(room.id, ctx.light)] : [])],
      ...(siliconLaunch ? { links: [siliconLaunch] } : {}),
    }],
    ...(siliconLaunch ? { chips: [siliconLaunch] } : {}),
    act: { type: 'open', room: room.id },
  };
}

function choose(rooms: Room[]): AgentTurn {
  return {
    lines: [[t('这句话涉及'), ...rooms.flatMap((r, i) => [...(i ? [t('、')] : []), t(r.name, 'strong')]), t('。')], [t('指令模式下我一次只打开一个模块，先开哪一个？', 'dim')]],
    chips: rooms.map(r => ({ label: r.name, action: { type: 'open' as const, room: r.id } })),
  };
}

const unknown = (): AgentTurn => ({
  lines: [[t('指令模式下我听不懂这句话，也不会去猜。')], [t('可以说“下一步做什么”“还缺什么”“打开问卷设计”，或输入 ', 'dim'), t('/', 'teal'), t(' 查看全部隐藏命令。', 'dim')]],
  chips: [recommend(say('下一步做什么')), say('查看使用帮助', '帮助')],
});

function buildAutonomousTurn(): AgentTurn {
  return {
    lines: [
      [t('已为你准备好'), t('深度数据分析与风险排查', 'strong'), t('。')],
      [t('将在保护受访者隐私的前提下自动核查数据质量、规避统计陷阱，并提炼核心发现与配图。', 'dim')],
    ],
    chips: [recommend({ label: '前往深度数据分析', action: { type: 'href', href: '#research/analysis' } }), say('查看项目照度')],
    act: { type: 'href', href: '#research/analysis' },
  };
}

export function formatRecommendResourceTurn(
  query: string | undefined,
  bundle: SmartRecommendationBundle,
): AgentTurn {
  const cleanQuery = (query ?? '').trim();
  const libraryChip: AgentLink = { label: '进入研究资料库浏览全部例图', action: { type: 'stage', stage: 'library' } };
  const lines: Line[] = [
    ...bundle.charts.slice(0, 4).map(e => [t('图表 ', 'teal'), t(e.item.title, 'strong'), t(` — ${e.reasonBadge}`, 'dim')]),
    ...bundle.tables.slice(0, 2).map(e => [t('三线表 ', 'teal'), t(e.item.title, 'strong'), t(` — ${e.reasonBadge}`, 'dim')]),
    ...bundle.diagrams.slice(0, 2).map(e => [t('框架图 ', 'teal'), t(e.item.title, 'strong'), t(` — ${e.reasonBadge}`, 'dim')]),
    ...bundle.infographics.slice(0, 2).map(e => [t('信息图板 ', 'teal'), t(e.item.label, 'strong'), t(` — ${e.reasonBadge}`, 'dim')]),
    ...bundle.palettes.slice(0, 2).map(e => [t('配色板 ', 'teal'), t(e.item.label, 'strong'), t(` — ${e.reasonBadge}`, 'dim')]),
  ];
  return {
    lines: [
      [t(cleanQuery ? `已围绕“${cleanQuery}”智能匹配研究资料库资源。` : '已结合当前研究上下文与登记结果匹配研究资料库资源。')],
    ],
    cards: [{ kind: 'tool', title: '资源推荐 · 图表/三线表/框图/配色', lines, links: [libraryChip] }],
    chips: [libraryChip],
  };
}

export function formatLookupCountyTurn(
  rawQuery: string,
  hits: readonly CountyGazetteerProfile[],
): AgentTurn {
  const q = rawQuery.trim();
  const libraryChip: AgentLink = { label: '打开中国县域风物志', action: { type: 'stage', stage: 'library' } };
  if (!hits.length) {
    return {
      lines: [[t(`中国县域风物志中未找到与“${q}”匹配的县区档案。`)]],
      cards: [{
        kind: 'tool',
        title: '区县风物检索',
        lines: [[t('未命中区县', 'dim'), t(`　未匹配到“${q}”，可输入县区全称（如“义乌市”）或 6 位区划代码（如“330782”）。`, 'dim')]],
        links: [libraryChip],
      }],
      chips: [libraryChip],
    };
  }
  const dimLimit = hits.length > 1 ? 42 : 120;
  const clipDim = (value: string) => (value.length > dimLimit ? `${value.slice(0, dimLimit - 1)}…` : value);
  const lines: Line[] = hits.flatMap((p) => {
    const curated = p.dataOrigin !== 'provincial_baseline_synthesis';
    const origin = curated ? '精选五维档案' : '全域基线';
    return [
      [
        t(`${p.code} ${p.name}`, 'strong'),
        t(` · ${p.provinceName} · ${p.prefectureName}`),
        t(` · 代表地标 ${p.landmarkName}`, 'dim'),
        t(` · ${origin}`, curated ? 'gold' : 'dim'),
      ],
      [t('标签 ', 'teal'), t(p.tags.join('、') || '区域基线特征', 'dim')],
      [t('政 ', 'teal'), t(clipDim(p.features.politicsGovernance))],
      [t('经 ', 'teal'), t(clipDim(p.features.economyIndustry))],
      [t('文 ', 'teal'), t(clipDim(p.features.cultureHeritage))],
      [t('社 ', 'teal'), t(clipDim(p.features.societyLivelihood))],
      [t('俗 ', 'teal'), t(clipDim(p.features.customsLifestyle))],
    ];
  });
  return {
    lines: [[t(`共命中 ${hits.length} 条中国县域风物档案（覆盖全国 2,845 个县域）。`)]],
    cards: [{ kind: 'tool', title: '区县风物检索', lines, links: [libraryChip] }],
    chips: [libraryChip],
  };
}

function buildRunAutonomousToolTurn(goalArg = '', datasetMode?: 'planted_trap_benchmark' | 'inline_dataset'): AgentTurn {
  const goal = goalArg.trim() || '调研数据深度分析与核心人群差异检验';
  const modeLabel = datasetMode === 'inline_dataset'
    ? '当前项目调研数据'
    : datasetMode === 'planted_trap_benchmark'
      ? '示例调研数据集'
      : '优先分析当前项目数据（样本不足时自动用示例数据集体验）';
  const theaterChip: AgentLink = { label: '前往数据分析', action: { type: 'href', href: '#research/analysis' } };
  return {
    lines: [
      [t('已为你准备发起 '), t('深度数据分析', 'strong'), t('。')],
      [t(`围绕“${goal}”开展检验 · 数据取自${modeLabel}`, 'dim')],
    ],
    cards: [{
      kind: 'tool',
      title: '深度数据分析',
      lines: [
        [t('分析重点 ', 'teal'), t(goal)],
        [t('数据来源 ', 'teal'), t(modeLabel, 'dim')],
        [t('质量保障 ', 'teal'), t('自动脱敏保护 · 规避常见统计误区 · 结果可直接写入报告', 'dim')],
      ],
      links: [theaterChip],
    }],
    chips: [theaterChip],
  };
}

function buildVerifyCitationToolTurn(query?: string, doi?: string): AgentTurn {
  const cleanQuery = (query ?? '').trim();
  const cleanDoi = (doi ?? '').trim();
  const target = cleanDoi ? `DOI ${cleanDoi}` : cleanQuery ? `关键词“${cleanQuery}”` : '方法学参考文献';
  const paperChip: AgentLink = { label: '打开文献交叉引用工作台', action: { type: 'stage', stage: 'paper' } };
  return {
    lines: [
      [t('已为你准备 '), t('文献核验', 'strong'), t('。')],
      [t(`本次核验对象为${target}（仅采纳可核实来源的文献信息，绝不编造引用）`, 'dim')],
    ],
    cards: [{
      kind: 'tool',
      title: '文献核验',
      lines: [
        ...(cleanDoi ? [[t('目标 DOI ', 'teal'), t(cleanDoi)]] : []),
        ...(cleanQuery ? [[t('检索关键词 ', 'teal'), t(cleanQuery)]] : []),
        ...(!cleanDoi && !cleanQuery ? [[t('核验提示 ', 'teal'), t('请在对话或“文献交叉引用”面板提供 DOI 或关键词', 'dim')]] : []),
        [t('核验方式 ', 'teal'), t('权威学术库与方法学文献目录联合核对', 'dim')],
      ],
      links: [paperChip],
    }],
    chips: [paperChip],
  };
}

export const CHART_KIND_LABEL_ZH: Readonly<Record<'auto' | 'bar' | 'line' | 'forest' | 'dumbbell', string>> = {
  auto: '自动适配',
  bar: '柱状对比图',
  line: '折线趋势图',
  forest: '效应对比图',
  dumbbell: '差异对比图',
};

function buildRenderSandboxPlotToolTurn(
  ctx: RouterContext,
  snapshotId?: string,
  chartKind: 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell' = 'auto',
): AgentTurn {
  const results = ctx.results?.results ?? [];
  const cleanId = (snapshotId ?? '').trim();
  const target = cleanId
    ? results.find(r => r.id === cleanId)
    : [...results].reverse().find(r => !isFrame(r) && r.method !== 'quality-control')
      ?? [...results].reverse().find(r => !isFrame(r));
  const kindLabel = CHART_KIND_LABEL_ZH[chartKind] ?? '自动适配';
  const theaterChip: AgentLink = { label: '前往图表生成', action: { type: 'href', href: '#research/analysis' } };
  const chartChip: AgentLink = { label: '打开交互绘图工坊', action: { type: 'say', text: '/绘图' } };
  return {
    lines: [
      [t('已为你准备 '), t('高清统计配图生成', 'strong'), t('。')],
      [t(target ? `配图基于“${target.title}” · 图表样式为${kindLabel}` : `配图对象为${cleanId || '最新分析结果'} · 图表样式为${kindLabel}`, 'dim')],
    ],
    cards: [{
      kind: 'tool',
      title: '高清图表生成',
      lines: [
        [t('配图对象 ', 'teal'), t(target ? `${target.title}（n=${target.n}）` : cleanId || '尚无可用分析结果，请先运行数据分析', 'dim')],
        [t('图表样式 ', 'teal'), t(kindLabel)],
        [t('交付形式 ', 'teal'), t('高清矢量配图 · 可直接收藏至素材架并插入报告', 'dim')],
      ],
      links: [theaterChip, chartChip],
    }],
    chips: [theaterChip, chartChip],
  };
}

function slash(body: string, ctx: RouterContext): Routed {
  const [head = '', ...rest] = body.split(/\s+/u), arg = rest.join(' ').trim(), word = head.toLowerCase();
  const command = COMMANDS.find(c => c.name === head || c.words.includes(word));
  if (!command) {
    const near = matchCommands(head.slice(0, 1));
    return { turn: { lines: [[t('没有 '), t(`/${head}`, 'teal'), t(' 这个命令。输入 '), t('/', 'teal'), t(' 可从弹出列表里选命令。', 'dim')]], chips: [...near.slice(0, 3).map(c => say(c.name, `/${c.name}`)), say('查看使用帮助', '帮助')] } };
  }
  const scope = mentionedRooms(arg).map(r => r.id).find(lit);
  const room = ROOMS.find(r => r.command === command.name);
  if (room) return { turn: open(room, ctx) };
  switch (command.name) {
    case '下一步': return { turn: nextStep(ctx) };
    case '自主探索': return { turn: buildAutonomousTurn() };
    case '全报告': return { turn: buildFullReportTurn(ctx, arg) };
    case '密钥': return { turn: buildApiKeyTurn() };
    case '铸造': return { turn: buildDemoTurn(ctx, arg) };
    case '硅基推演': return { turn: buildSiliconTheaterTurn(ctx, arg) };
    case '备赛': return { turn: buildCoachTurn(ctx) };
    case '绘图': return { turn: buildChartStudioTurn(ctx, arg) };
    case '编程': return { turn: buildCodeStudioTurn(ctx, arg) };
    case '撰稿': return { turn: buildWritingStudioTurn(ctx, arg) };
    case '照度': return { turn: status(ctx, scope) };
    case '印鉴': return { turn: sealStatus(ctx) };
    case '盲区': return { turn: blindSpots(ctx, scope) };
    case '来处': return { turn: trace(ctx, arg) };
    case '结果': return { turn: results(ctx, arg) };
    case '写入': return { turn: place(ctx) };
    case '写报告': return { turn: writePlan(ctx) };
    case '起草': return draftTarget(ctx, arg);
    case '生成': return { generate: arg };
    case '查': return arg ? { lookup: arg, explicit: true }
      : { turn: { lines: [[t('查什么？例如 '), t('/查 设计效应', 'teal'), t('。')]], chips: [{ label: '打开知识镜', action: { type: 'search' } }] } };
    case '夜': return { turn: ctx.theme === 'dark' ? { lines: [[t('现在就是深色主题。')]] } : { lines: [[t('已切换到深色主题。')]], act: { type: 'theme', theme: 'dark' } } };
    case '昼': return { turn: ctx.theme === 'light' ? { lines: [[t('现在就是浅色主题。')]] } : { lines: [[t('已切换到浅色主题。')]], act: { type: 'theme', theme: 'light' } } };
    case '清空': return { turn: { lines: [[t('删除之前请先确认。')]], cards: [{ kind: 'confirm', title: '删除这段对话', lines: [[t('只删除这段对话记录；问卷、数据与报告都不受影响。', 'dim')]], confirm: { label: '删除', action: { type: 'clear' } }, cancel: '保留' }] } };
    case '经典': return { turn: { lines: [[t('经典工作台保留了全部模块的原样排布。')]], chips: [{ label: '打开经典工作台 ↗', action: { type: 'href', href: ctx.room ? `/workspace#${ctx.room}` : '/workspace' } }] } };
    default: return { turn: help() };
  }
}

const NIGHT = /(深色|夜间|暗色|暗黑)(主题|模式)|(切换?到|换成|改成|改为|用)(深色|夜间|暗色)/u;
const DAY = /(浅色|日间|亮色|白天)(主题|模式)|(切换?到|换成|改成|改为|用)(浅色|日间|亮色)/u;
// Asking for a draft names an act of writing; "设计问卷" alone only opens 问卷设计.
const GENERATE = /(生成|起草|拟一份|出一份|写一份|做一份|帮我出|帮我写|帮我做|帮我拟)[^。！？]{0,30}?问卷|问卷(初稿|草稿|草案)/u;
const HELP = /^(帮助|help|你能做什么|你会什么|你可以做什么|能做什么|怎么用|如何使用|有哪些命令|命令列表)$/iu;
const NEXT = /下一步|接下来|该做什么|先做什么|从哪(里)?开始|怎么开始/u;
const AUTONOMOUS = /^(?:启动|运行|打开|进入)?自主(?:研究|统计)?探索$|react.*探索/iu;
const BLIND = /盲区|还缺|缺什么|缺了什么|哪里不足|哪里还暗|短板|没通过/u;
const STATUS = /照度|进度|到哪了|到哪一步|完成了多少|整体情况|现在怎么样|项目状态/u;
const SEAL = /印鉴|九门印鉴|核验印鉴|循证印鉴|核验码/u;
const FULL_REPORT = /(?:自动|一键|全流程|ai|大模型).{0,6}(?:生成|起草|撰写|写)(?:整份|全篇|完整|全套|全)?报告|(?:生成|起草|撰写)全报告/iu;
const DEMO = /铸造|教学模拟研究|全链条演示|国奖标杆|标杆样板/u;
const SILICON_THEATER = /(atypica|硅基.{0,10}(?:推演|剧场|深访|访谈|圆桌)|实时推演剧场|1[:：]1\s*(?:实时)?推演)/iu;
const COACH = /备赛|参赛指南|八阶|国奖路线|怎么拿国奖/u;
const PLOT_STUDIO = /^(?:打开)?(?:绘图|制图|画图|统计制图|交互绘图|图表工坊)(?:工坊)?(?:\s*[·:：]\s*.+)?$|帮我(?:画|制|绘)(?:一张|幅)?.*图/u;
const CODE_STUDIO = /^(?:打开)?(?:编程|写代码|统计编程|代码工坊|三线表代码|复现代码|python代码|r代码|spss代码)(?:工坊)?(?:\s*[·:：]\s*.+)?$|生成.*(?:python|r语言|spss|latex).*代码/iu;
const WRITING_STUDIO = /^(?:打开)?(?:撰稿|润色|写作工坊|撰稿工坊|答辩手卡|5w1h答辩)(?:工坊)?(?:\s*[·:：]\s*.+)?$/iu;
const DOI_TOKEN = /\b10\.\d{4,9}\/[^\s，。；！？、)）\]\u300d]+/iu;
const VERIFY_CITATION_TEXT = /^(?:请|帮我)?(?:核验|查证|校验|验证)(?:一下)?(?:文献|引文|参考文献|doi)(?:[：:\s]+(.+))?$/iu;
const SANDBOX_PLOT_TEXT = /(?:python|沙盒).{0,8}(?:矢量|出图|绘图|画图)|科研矢量出图/iu;

const TARGETED_SANDBOX_PLOT_TEXT =
  /^(?:请|帮我)?(?:把|将|用)\s*([^，。；\n]{1,28}?)\s*(?:生成|画成|绘成|绘制成|做成|出成|画|绘|绘制|出)(?:一张|一幅|个)?(?:高清)?(?:效应对比图|森林图|差异对比图|哑铃图|柱状对比图|折线趋势图|统计配图|矢量配图)$/iu;
const DIRECT_COUNTY_LOOKUP_TEXT =
  /^(?:请|帮我)?(?:查一下|查查|查|检索|搜一下|搜索|查询)\s*(?:一下)?\s*([^\s，。；]{2,20}?)\s*(?:的)?(?:行政区划|区划代码|县域风物(?:志)?|县域档案|区县风物)$/iu;
const DIRECT_RECALL_MEMORY_TEXT =
  /^(?:请|帮我)?(?:查看|回顾|列出|展示|看看)(?:一下)?(?:本?项目)?(?:已记住的|历史的?|积累的?)?(?:研究)?(?:记忆|历史分析记忆|已记住的研究结论)$/iu;
const DIRECT_STAT_BOOTSTRAP_TEXT =
  /(?:运行|执行|做一下|计算|跑一下|测一下).{0,10}(?:bootstrap|自助抽样|自助法|置信区间)/iu;
const DIRECT_STAT_SPEARMAN_TEXT =
  /(?:运行|执行|做一下|计算|跑一下|测一下).{0,10}(?:spearman|斯皮尔曼|秩相关)/iu;
const DIRECT_STAT_MANN_WHITNEY_TEXT =
  /(?:运行|执行|做一下|计算|跑一下|测一下).{0,10}(?:mann[\s-]*whitney|曼[\s·-]*惠特尼|秩和检验|cliff)/iu;
const DIRECT_AUTONOMOUS_AUDIT_TEXT =
  /(?:自动|一键|深度|帮我|请)?(?:重新|再|重)?(?:核查|诊断|排查|扫描|检查|分析|运行|启动|查看|跑一次)?(?:一下)?(?:问卷|样本)?(?:数据质量|数据陷阱|统计陷阱|样本异常|统计风险|自主探索|自主分析|自主研究|最新数据诊断)/u;
const DIRECT_GROUNDED_ABSTRACT_TEXT =
  /(?:汇总|整理|生成|总结|合成).{0,10}(?:执行摘要|报告摘要|研究摘要|论文摘要|摘要草稿)/u;
const DIRECT_PRESUBMISSION_AUDIT_TEXT =
  /(?:交稿前|提交前|赛前|报告)?(?:做一次|做个|跑一下|运行|帮我|请)?(?:全面|一键)?(?:合规审查|合规体检|交稿体检|交稿审查|投稿审查|盲审检查|盲审体检|报告体检|提交前体检|合规检查)/u;
const DIRECT_DEFINITION_EXCLUSION_TEXT =
  /^(?:什么是|何为|啥是)|(?:是什么意思|什么意思|怎么算|怎么计算|的定义|的公式|指的是什么)$/u;

export type DirectChatToolIntent =
  | { kind: 'verify_citation'; doi?: string; query?: string }
  | { kind: 'render_sandbox_plot'; chartKind: 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell'; targetHint?: string }
  | { kind: 'lookup_county'; query: string }
  | { kind: 'recall_memory' }
  | { kind: 'run_stat_preset'; presetId: 'bootstrap_ci' | 'spearman_matrix' | 'mann_whitney_cliff' }
  | { kind: 'run_autonomous_audit'; forceFresh: boolean }
  | { kind: 'compose_grounded_abstract' }
  | { kind: 'audit_report_readiness' };

export function parseDirectChatToolIntent(text: string): DirectChatToolIntent | null {
  const s = text.trim().replace(/[。！？!?.，,\s]+$/u, '');
  if (!s || /^[/／]/u.test(s)) return null;
  const doiMatch = DOI_TOKEN.exec(s);
  const citeMatch = VERIFY_CITATION_TEXT.exec(s);
  if (doiMatch || citeMatch) {
    const doi = doiMatch?.[0]?.trim();
    const rawArg = (citeMatch?.[1] ?? '').trim();
    const query = !doi ? (rawArg || undefined) : undefined;
    if (doi || query) return { kind: 'verify_citation', ...(doi ? { doi } : {}), ...(query ? { query } : {}) };
    return null;
  }
  const targetedPlotMatch = TARGETED_SANDBOX_PLOT_TEXT.exec(s);
  const wantsDirectPlot =
    Boolean(targetedPlotMatch)
    || SANDBOX_PLOT_TEXT.test(s)
    || /^(?:请|帮我)?(?:生成|画|绘|绘制|出)(?:一张|一幅|个)?(?:高清)?(?:效应对比图|森林图|差异对比图|哑铃图|柱状对比图|折线趋势图|统计配图|矢量配图)$/iu.test(s);
  if (wantsDirectPlot) {
    const chartKind: 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell' =
      /效应|森林|forest/iu.test(s) ? 'forest'
        : /差异|哑铃|dumbbell/iu.test(s) ? 'dumbbell'
          : /折线|趋势|line/iu.test(s) ? 'line'
            : /柱状|条形|bar/iu.test(s) ? 'bar'
              : 'auto';
    const rawHint = (targetedPlotMatch?.[1] ?? '').trim();
    const cleanedHint = rawHint.replace(/(?:的)?(?:分析结果|统计结果|结果|数据|指标)$/u, '').trim() || rawHint;
    return {
      kind: 'render_sandbox_plot',
      chartKind,
      ...(cleanedHint ? { targetHint: cleanedHint } : {}),
    };
  }
  if (/县域风物(?:志)?|行政区划|区划代码|区县风物/u.test(s) && (DIRECT_COUNTY_LOOKUP_TEXT.test(s) || COUNTY_LOOKUP_TEXT.test(s))) {
    const query = s
      .replace(/^(?:请|帮我)?(?:查一下|查查|查|检索|搜一下|搜索|查询|看下|看看)\s*(?:一下)?\s*/u, '')
      .replace(/(?:的)?(?:中国)?(?:行政区划|区划代码|县域风物志|县域风物|县域档案|区县风物)/gu, '')
      .trim();
    if (query) return { kind: 'lookup_county', query };
  }
  if (DIRECT_RECALL_MEMORY_TEXT.test(s)) {
    return { kind: 'recall_memory' };
  }
  if (DIRECT_STAT_MANN_WHITNEY_TEXT.test(s)) {
    return { kind: 'run_stat_preset', presetId: 'mann_whitney_cliff' };
  }
  if (DIRECT_STAT_SPEARMAN_TEXT.test(s)) {
    return { kind: 'run_stat_preset', presetId: 'spearman_matrix' };
  }
  if (DIRECT_STAT_BOOTSTRAP_TEXT.test(s)) {
    return { kind: 'run_stat_preset', presetId: 'bootstrap_ci' };
  }
  if (DIRECT_AUTONOMOUS_AUDIT_TEXT.test(s) && !DIRECT_DEFINITION_EXCLUSION_TEXT.test(s)) {
    return {
      kind: 'run_autonomous_audit',
      forceFresh: /(?:重新|重跑|再跑|新跑|重新运行|重新执行|重新核查)/u.test(s),
    };
  }
  if (DIRECT_GROUNDED_ABSTRACT_TEXT.test(s) && !DIRECT_DEFINITION_EXCLUSION_TEXT.test(s)) {
    return { kind: 'compose_grounded_abstract' };
  }
  if (DIRECT_PRESUBMISSION_AUDIT_TEXT.test(s) && !DIRECT_DEFINITION_EXCLUSION_TEXT.test(s)) {
    return { kind: 'audit_report_readiness' };
  }
  return null;
}
const COUNTY_LOOKUP_TEXT = /县域风物(?:志)?/u;
const WHERE = /^(我在哪|这是哪|当前模块|打开的是什么|我在哪里)/u;
const TRACE = /来处|溯源|回溯|从哪(里)?来|怎么(算|得)出来/u;
const TRACE_QUERY = /(?:回溯|来处)[：:\s]+(.+)$/u;
const PLAN = /^(?:(?:帮我|我要|开始)?(?:写|撰写|完成)(?:一份|整份|这份)?报告|(?:查看)?报告(?:怎么写|还缺什么|写到哪|写得怎么样|进度))$/u;
const DRAFT_BRACKET = /^(?:帮我|请)?(?:起草|撰写|拟写|写一下|写)\s*[\u300c“"]([^\u300d”"\n]{2,40})[\u300d”"](?:这一?节|一节|部分|这一?章)?(?:\s*[：:]\s*.+)?$/u;
const DRAFT = /^(?:帮我|请)?(?:起草|撰写|拟写|写一下|写)\s*[\u300c“"]?(.{2,32}?)[\u300d”"]?(?:这一?节|一节|部分|这一?章)?$/u;
const PLACE = /(把|将)?[^。]{0,10}结果[^。]{0,4}(写|放|加)(进|入|到)报告|写入报告/u;
const RESULTS_QUERY = /^筛选结果[：:\s]+(.+)$/u;
const RESULTS = /结果清单|(登记|已有|现有)(了|的)?(哪些)?(分析|统计)?结果|有哪些(分析|统计|检验)?结果|(分析|统计|检验)结果(是什么|是多少|怎么样|如何|有哪些)/u;
const EXHIBIT = /([图表])\s*([0-9０-９]+(?:\s*[-－—.．]\s*[0-9０-９]+)?)/u;
const LOOKUP = [/^(?:什么是|何为|啥是|解释一下|解释|查一下|查查|查|搜一下|搜索|搜)\s*(.+)$/u, /^(.+?)(?:是什么意思|是什么|是啥|什么意思|怎么算|怎么计算|的公式|的定义|指的是什么)$/u];
const OPEN = /^(?:打开|去|进入|走进|切到|切换到|带我去|回到|前往|看看|到)\s*(.+)$/u;

/** Routes one message. Slash commands first, then fixed phrasings, then rooms by name, then a cautious lookup. */
export function route(raw: string, ctx: RouterContext): Routed {
  const input = raw.trim().replace(/[。！？!?.，,\s]+$/u, '');
  if (/^[/／]/u.test(input)) return slash(input.slice(1).trim(), ctx);
  if (!input) return { turn: help() };
  if (/^(清空|清屏|清除)(对话|记录|聊天)?$/u.test(input)) return slash('清空', ctx);
  if (HELP.test(input)) return { turn: help() };
  if (NIGHT.test(input)) return slash('夜', ctx);
  if (DAY.test(input)) return slash('昼', ctx);
  {
    const bracketed = DRAFT_BRACKET.exec(input);
    const node = bracketed && draftableNode(bracketed[1]);
    if (node) return { draft: node.id };
  }
  if (GENERATE.test(input)) return { generate: input };
  const scope = mentionedRooms(input).map(r => r.id).find(lit);
  if (NEXT.test(input)) return { turn: nextStep(ctx) };
  if (AUTONOMOUS.test(input)) return { turn: buildAutonomousTurn() };
  if (SEAL.test(input)) return { turn: sealStatus(ctx) };
  if (FULL_REPORT.test(input)) return { turn: buildFullReportTurn(ctx, input.replace(FULL_REPORT, '').trim()) };
  if (DEMO.test(input)) return { turn: buildDemoTurn(ctx, input) };
  if (SILICON_THEATER.test(input)) return { turn: buildSiliconTheaterTurn(ctx, input) };
  if (COACH.test(input)) return { turn: buildCoachTurn(ctx) };
  if (PLOT_STUDIO.test(input)) return { turn: buildChartStudioTurn(ctx, input) };
  if (CODE_STUDIO.test(input)) return { turn: buildCodeStudioTurn(ctx, input) };
  if (WRITING_STUDIO.test(input)) return { turn: buildWritingStudioTurn(ctx, input) };
  {
    const doiMatch = DOI_TOKEN.exec(input);
    if (doiMatch) return { turn: buildVerifyCitationToolTurn(undefined, doiMatch[0]) };
    const citeMatch = VERIFY_CITATION_TEXT.exec(input);
    if (citeMatch) return { turn: buildVerifyCitationToolTurn(citeMatch[1]?.trim()) };
  }
  if (SANDBOX_PLOT_TEXT.test(input)) return { turn: buildRenderSandboxPlotToolTurn(ctx, undefined, 'auto') };
  if (COUNTY_LOOKUP_TEXT.test(input) || DIRECT_COUNTY_LOOKUP_TEXT.test(input)) {
    const countyQuery = input
      .replace(/^(?:请|帮我)?(?:查一下|查查|查|检索|搜一下|搜索|查询|搜|看下|看看)\s*(?:一下)?\s*/u, '')
      .replace(/(?:的)?(?:中国)?(?:行政区划|区划代码|县域风物志|县域风物|县域档案|区县风物)/gu, '')
      .trim();
    if (countyQuery) return { lookupCounty: countyQuery };
  }
  if (BLIND.test(input)) return { turn: blindSpots(ctx, scope) };
  if (STATUS.test(input)) return { turn: status(ctx, scope) };
  if (TRACE.test(input)) {
    const m = EXHIBIT.exec(input);
    const qm = !m ? TRACE_QUERY.exec(input) : null;
    return { turn: trace(ctx, m ? m[1] + m[2] : (qm?.[1] ?? '')) };
  }
  if (PLAN.test(input)) return { turn: writePlan(ctx) };
  { const m = DRAFT.exec(input); const node = m && draftableNode(m[1]); if (node) return { draft: node.id }; }
  if (PLACE.test(input)) return { turn: place(ctx) };
  { const rq = RESULTS_QUERY.exec(input); if (rq?.[1]?.trim()) return { turn: results(ctx, rq[1].trim()) }; }
  if (RESULTS.test(input)) return { turn: results(ctx) };
  if (WHERE.test(input)) {
    if (!ctx.room) return { turn: { lines: [[t('右侧没有打开模块，现在只显示对话。')]], chips: [{ label: '打开项目全景', action: { type: 'open', room: 'overview' } }] } };
    const room = roomById(ctx.room);
    return { turn: { lines: [[t('右侧打开的是'), t(room.name, 'strong'), t('。')], [t(room.line, 'dim')]] } };
  }
  for (const pattern of LOOKUP) { const m = pattern.exec(input); if (m?.[1]?.trim()) return { lookup: m[1].trim(), explicit: true }; }
  const verb = OPEN.exec(input), rooms = mentionedRooms(verb?.[1] ?? input);
  if (rooms.length === 1) return { turn: open(rooms[0], ctx) };
  if (rooms.length > 1) return { turn: choose(rooms.slice(0, 4)) };
  if (verb) return { turn: { lines: [[t('没有叫'), t(`“${verb[1]}”`, 'strong'), t('这个模块。')]], chips: [say('查看使用帮助', '帮助')] } };
  // A short phrase may be a term; a sentence the router cannot read is not guessed at.
  return input.length <= 16 ? { lookup: input, explicit: false } : { turn: unknown() };
}

/** The part of a knowledge search hit the agent reads. */
export type KnowledgeHit = {
  entry: { id: string; name: string; englishName?: string; definition: string; formula?: { tex: string }; sources: readonly { title: string }[]; review: { status: string } };
  match: string; ambiguous: boolean;
};
/**
 * Answers a lookup from knowledge search hits. An explicit question accepts any hit; a bare phrase that might be
 * a term accepts only a name or alias match, so ordinary sentences are not answered with loosely related entries.
 */
/** A tool the model asked for, run exactly as the matching command runs, against the same context. */
export function toolTurn(action: ChatAction, ctx: RouterContext): Routed {
  switch (action.tool) {
    case 'next': return { turn: nextStep(ctx) };
    case 'light': return { turn: status(ctx, action.args.room && lit(action.args.room) ? action.args.room : undefined) };
    case 'blind': return { turn: blindSpots(ctx, action.args.room && lit(action.args.room) ? action.args.room : undefined) };
    case 'trace': { const m = EXHIBIT.exec(action.args.reference); return { turn: trace(ctx, m ? m[1] + m[2] : action.args.reference) }; }
    case 'results': return { turn: results(ctx, action.args.query) };
    case 'place': return { turn: place(ctx) };
    case 'open': return { turn: open(roomById(action.args.room), ctx) };
    case 'lookup': return { lookup: action.args.query, explicit: true };
    case 'draft': return { generate: action.args.brief };
    case 'stage': {
      const label =
        action.args.view === 'paper'
          ? '已为你切换到报告成文视图。'
          : action.args.view === 'advisors'
            ? '已为你打开专家审阅圆桌。'
            : action.args.view === 'library'
              ? '已为你打开研究资料库（含图表、三线表、框图与县域风物数据库）。'
              : '已回到对话工作区。';
      return { turn: { lines: [[t(label)]], act: { type: 'stage', stage: action.args.view } } };
    }
    case 'studio': {
      switch (action.args.kind) {
        case 'chart': return { turn: buildChartStudioTurn(ctx) };
        case 'code': return { turn: buildCodeStudioTurn(ctx) };
        case 'writing': return { turn: buildWritingStudioTurn(ctx) };
        case 'coach': return { turn: buildCoachTurn(ctx) };
      }
    }
    case 'draft_section': return draftTarget(ctx, action.args.node);
    case 'generate_report': {
      const topic = (action.args.topic ?? '').trim() || ctx.projectTitle?.trim() || '';
      return { turn: { ...buildFullReportTurn(ctx, topic), act: { type: 'generateFullReport', topic } } };
    }
    case 'simulate': {
      const topic = (action.args.topic ?? '').trim();
      return { turn: { ...buildDemoTurn(ctx, topic), act: { type: 'loadBenchmark', benchmarkId: topic || 'current' } } };
    }
    case 'run_autonomous_research':
      return { turn: buildRunAutonomousToolTurn(action.args.goal, action.args.datasetMode) };
    case 'recommend_resource':
      return { recommendResource: { query: action.args.query, ctx } };
    case 'lookup_county':
      return { lookupCounty: action.args.query };
    case 'verify_citation':
      return { turn: buildVerifyCitationToolTurn(action.args.query, action.args.doi) };
    case 'render_sandbox_plot':
      return { turn: buildRenderSandboxPlotToolTurn(ctx, action.args.snapshotId, action.args.chartKind) };
  }
}

export function lookupTurn(query: string, hits: readonly KnowledgeHit[], explicit: boolean): AgentTurn {
  const strong = hits.filter(h => h.match === 'name' || h.match === 'alias' || h.match === 'prefix');
  const pool = explicit ? hits : strong;
  if (!pool.length) return explicit
    ? { lines: [[t('知识镜里没有'), t(`“${query}”`, 'strong'), t('。')], [t('换一个说法，或打开知识镜浏览全部词条。', 'dim')]], chips: [{ label: '打开知识镜', action: { type: 'search' } }] }
    : unknown();
  const top = pool[0], exact = top.match === 'name' || top.match === 'alias';
  if (top.ambiguous || (!exact && pool.length > 1)) return {
    lines: [[t(`“${query}”`, 'strong'), t('在知识镜里可能对应以下词条。')]],
    chips: pool.slice(0, 5).map(h => say(h.entry.name, `查一下 ${h.entry.name}`)),
  };
  const e = top.entry;
  return {
    lines: [[t('知识镜中的'), t(`“${e.name}”`, 'strong'), t('原文照录如下。')]],
    cards: [{ kind: 'entry', id: e.id, name: e.name, ...(e.englishName ? { english: e.englishName } : {}), definition: e.definition,
      ...(e.formula?.tex ? { formula: e.formula.tex } : {}), sources: e.sources.map(s => s.title).slice(0, 3), reviewed: e.review.status === 'reviewed' }],
    chips: pool.slice(1, 4).map(h => say(h.entry.name, `查一下 ${h.entry.name}`)),
    ...(pool.length > 1 ? { chipsLabel: '相关词条' } : {}),
  };
}
