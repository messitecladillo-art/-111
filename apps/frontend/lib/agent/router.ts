/**
 * The 证见 agent's command mode: a deterministic router from what the user types to what the shell does.
 * It understands slash commands and a fixed set of everyday phrasings. Anything else it says it cannot understand
 * rather than guessing, and knowledge questions are answered from the reviewed knowledge base verbatim, with sources.
 */
import { lightBar, percent } from './glyphs.ts';
import { LIT_ROOMS, roomLight, type Illumination, type LightCheck } from './illumination.ts';
import { exhibitKey, type Trace, type TraceStep } from './provenance.ts';
import { ROOMS, roomById, type Room, type RoomId } from './rooms.ts';
import type { ChatAction } from './chat.ts';
import type { Questionnaire } from '../questionnaire.ts';
import { blueprintNode } from '../report-blueprint.ts';
import { draftableNode } from './draft.ts';
import { sectionState, type ReportPlan } from './report-plan.ts';
import { METHOD_LABELS, suggestedNode } from '../report-placement.ts';
import { findingNeedsReview, type ResearchFinding, type ResultSnapshot } from '../research-quality.ts';
import type { QuestionnaireGenerationRequest } from '../questionnaire-proposals.ts';

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
  | { type: 'chat'; text: string }
  /** Reads the receipt of a model turn whose outcome was unclear; never calls the model again. */
  | { type: 'check'; turn: string; message: string }
  /** Writes these registered results into the report's blueprint sections; offered only on a confirmation card. */
  | { type: 'place'; results: string[] }
  /** Asks the user's model service to draft this blueprint section; offered only on a confirmation card. */
  | { type: 'draft'; node: string }
  /** Writes a draft's paragraphs, numbers already filled from the facts, into this blueprint section. */
  | { type: 'adopt'; node: string; paragraphs: string[] }
  /** Reads the receipt of a draft whose outcome was unclear, filling it from the facts it was sent with; never calls the model again. */
  | { type: 'checkDraft'; draft: string; message: string; node: string; facts: { id: string; text: string; value: string }[] };
/** A primary link is the one step the agent recommends; a turn has at most one. */
export type AgentLink = { label: string; action: AgentAction; primary?: true };
export type AgentCard =
  /** With `columns`, each line is a row and each span a cell, aligned under the row above. */
  | { kind: 'tool'; title: string; lines: Line[]; links?: AgentLink[]; columns?: boolean }
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
  | { kind: 'proposal'; projectId: string; proposalId: string; serviceId: string; serviceRevision: number; serviceLabel: string; model: string; inputRevision: number; design: Questionnaire };
export type AgentTurn = { lines: Line[]; cards?: AgentCard[]; chips?: AgentLink[]; chipsLabel?: string; act?: AgentAction };
/** `traces` are the report's exhibits with their paths back (provenance.ts); the shell computes them with the light. */
/** `room` is the module open in the side panel, or null while only the conversation shows. */
/** What the report holds of registered work, or null before the report has been seen in this visit. */
export type ResultsView = { results: readonly ResultSnapshot[]; findings: readonly ResearchFinding[]; pending: boolean;
  /** The results the report already shows. */
  placed: readonly string[] } | null;
export type RouterContext = { room: RoomId | null; light: Illumination; theme?: 'light' | 'dark'; traces?: readonly Trace[]; results?: ResultsView;
  /** The report as a plan of work; null before the report has been seen in this visit. */
  plan?: ReportPlan | null };
/** Either an answer, or a knowledge lookup the shell runs before answering with `lookupTurn`. */
export type Routed = { turn: AgentTurn } | { lookup: string; explicit: boolean }
  /** A request to draft a questionnaire with the user's model service; the shell asks for consent before any call. */
  | { generate: string }
  /** A request to draft a report section (a blueprint node) with the user's model service; consent comes first too. */
  | { draft: string };

export type Command = { name: string; args?: string; line: string; words: readonly string[] };
const ROOM_COMMANDS: Command[] = ROOMS.map(r => ({ name: r.command, line: `打开${r.name}`, words: [r.id] }));
export const COMMANDS: readonly Command[] = [
  { name: '下一步', line: '按研究动线给出最该做的一件事', words: ['next'] },
  { name: '照度', line: '各模块的证据完整度', words: ['status'] },
  { name: '盲区', line: '光到不了的角落，以及去哪里补', words: ['gaps', 'blind'] },
  { name: '来处', args: '图表编号', line: '沿光路回溯报告里一个图表的数字从哪里来', words: ['trace', 'origin'] },
  { name: '结果', args: '标题或方法', line: '已登记的分析结果：方法、有效样本与主要统计量', words: ['results'] },
  { name: '写入', line: '把还没写进报告的登记结果按蓝图写进对应章节，改动前确认', words: ['place'] },
  { name: '写报告', line: '按蓝图逐节看报告写到哪、缺什么，下一步做什么', words: ['plan'] },
  { name: '起草', args: '章节', line: '用你的模型服务按本项目的事实起草一节，数字只从登记结果填入', words: ['write'] },
  { name: '生成', args: '研究需求', line: '用你的模型服务起草问卷，确认后才调用', words: ['generate', 'draft'] },
  { name: '查', args: '概念或方法', line: '在知识镜中查定义、公式与出处', words: ['lookup', 'search'] },
  ...ROOM_COMMANDS,
  { name: '夜', line: '切换到深色主题', words: ['dark'] },
  { name: '昼', line: '切换到浅色主题', words: ['day'] },
  { name: '清空', line: '删除这段对话，项目数据不受影响', words: ['clear'] },
  { name: '经典', line: '打开经典工作台', words: ['classic'] },
  { name: '帮助', line: '全部命令与常用说法', words: ['help', '?'] },
];
/** Commands whose name or English word starts with what follows the slash; all of them for a bare slash. */
export function matchCommands(prefix: string): Command[] {
  const p = prefix.trim().toLowerCase();
  return COMMANDS.filter(c => !p || c.name.startsWith(p) || c.words.some(w => w.startsWith(p)));
}

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
  const general = COMMANDS.filter(c => !ROOM_COMMANDS.includes(c));
  return {
    lines: [[t('我是'), t('证见', 'strong'), t('。现在是'), t('指令模式', 'teal'), t('：还没有接入模型，我只听懂命令和下面这些说法；听不懂时会直说，不会编造。')]],
    cards: [
      { kind: 'tool', title: '命令', columns: true, lines: general.map(c => [t(`/${c.name}${c.args ? ` ‹${c.args}›` : ''}`, 'teal'), t(c.line, 'dim')]) },
      { kind: 'tool', title: '模块', lines: [ROOM_COMMANDS.map(c => t(`/${c.name} `, 'teal'))] },
      { kind: 'tool', title: '也可以这样说', lines: ['下一步做什么', '问卷还缺什么', '打开数据分析', '图 1-1 的数字从哪来', '登记了哪些结果', '把结果写进报告', '写报告', '帮我写研究背景', '帮我出一份社区体育设施满意度的问卷', '什么是设计效应', '切换到浅色模式'].map(s => [t(`“${s}”`)]) },
    ],
    chips: [recommend(say('下一步做什么')), say('/照度')],
  };
}

function lightLine(id: RoomId, light: Illumination): Line {
  const r = roomLight(light, id);
  if (!r) return [t('证据完整度：这个模块尚未接入', 'dim')];
  return [t('照度 '), t(lightBar(r.score), r.score > 0 ? 'gold' : 'dim'), t(` ${percent(r.score)}`, 'gold'), t(`　${r.summary}`, 'dim')];
}

function status(ctx: RouterContext, scope?: RoomId): AgentTurn {
  const { light } = ctx;
  if (scope) {
    const r = roomLight(light, scope)!;
    return {
      lines: [[t(`${named(scope)}的照度 `), t(percent(r.score), 'gold'), t('，逐项如下：')]],
      cards: [{ kind: 'tool', title: `读取 · ${named(scope)}`, columns: true, lines: r.checks.slice(0, 12).map(c => [t(c.passed ? '✓' : '✕', c.passed ? 'gold' : 'error'), t(c.label), t(c.detail, 'dim')]) }],
      chips: [say('下一步做什么')],
    };
  }
  return {
    lines: [[t('整体照度 '), t(percent(light.overall), 'gold'), t('。')], [t('照度只计算能看到证据的模块：问卷、抽样、分析与报告；其他模块接入 Agent 主循环后再计算。', 'dim')]],
    cards: [{ kind: 'tool', title: '读取 · 项目照度', columns: true, lines: light.rooms.map(r => [t(named(r.room)), t(lightBar(r.score), r.score > 0 ? 'gold' : 'dim'), t(percent(r.score), 'gold'), t(r.summary, 'dim')]) }],
    chips: [recommend(say('下一步做什么')), say('还缺什么', '/盲区')],
  };
}

function blindSpots(ctx: RouterContext, scope?: RoomId): AgentTurn {
  const spots = ctx.light.blind.filter(c => !scope || c.room === scope);
  const where = scope ? named(scope) : '项目';
  if (!spots.length) return { lines: [[t(`${where}没有盲区：`), t('检查全部通过', 'gold'), t('。')]], chips: [recommend(say('下一步做什么'))] };
  const shown = spots.slice(0, 8), rooms = [...new Set(shown.map(c => c.go))];
  return {
    lines: [[t(`${where}里光到不了的角落有 `), t(String(spots.length), 'gold'), t(' 处，按研究动线排列：')]],
    cards: [{
      kind: 'tool', title: '读取 · 盲区',
      lines: [...shown.map((c: LightCheck) => [t('✕ ', 'error'), t(`${named(c.room)} · `, 'dim'), t(c.label), t(`　${c.detail}`, 'dim')]),
        ...(spots.length > shown.length ? [[t(`还有 ${spots.length - shown.length} 处，项目全景里列全了。`, 'dim')]] : [])],
      links: rooms.map(id => say(`去${named(id)}`, `/${roomById(id).command}`)),
    }],
  };
}

function nextStep(ctx: RouterContext): AgentTurn {
  const spot = ctx.light.blind[0];
  if (!spot) return { lines: [[t('有照度的模块，检查都通过了。')], [t('可以打开路演答辩演练追问，交稿前用提交前体检查一遍文件。', 'dim')]], chips: [say('/答辩'), say('/提交')] };
  return {
    lines: [[t('下一步：'), t(spot.label, 'strong'), t('。')], [t(spot.detail, 'dim')]],
    chips: [recommend(say(`打开${named(spot.go)}`, `/${roomById(spot.go).command}`)), say('还缺什么', '/盲区')],
  };
}

/** 回溯: one exhibit's path back to its origin, or the exhibits to choose from. `arg` is an exhibit number or words of its title. */
function trace(ctx: RouterContext, arg = ''): AgentTurn {
  const traces = ctx.traces ?? [], wanted = arg.trim(), key = exhibitKey(wanted);
  if (!traces.length) return {
    lines: [[t('报告里还没有来自登记结果的图表。')], [t('在数据分析里完成一项分析并发送到报告，或从抽样设计插入抽样框，就能沿光路回溯到数据与题目。', 'dim')]],
    chips: [recommend(say('/分析')), say('/报告')],
  };
  const chosen = wanted ? traces.filter(x => exhibitKey(x.reference) === key || x.title.includes(wanted)) : traces.length === 1 ? traces : [];
  if (chosen.length === 1) {
    const x = chosen[0];
    return { lines: [[t(x.reference, 'strong'), t(`「${x.title}」的数字，沿光路回到来处：`)]], cards: [{ kind: 'trace', reference: x.reference, title: x.title, steps: x.steps }] };
  }
  return {
    lines: wanted ? [[t('报告里没有'), t(`「${wanted}」`, 'strong'), t('，可以回溯的图表有：')]] : [[t('报告里有 '), t(String(traces.length), 'gold'), t(' 个来自登记结果的图表，回溯哪一个？')]],
    chips: traces.slice(0, 8).map(x => say(`${x.reference} ${x.title}`.slice(0, 26), `/来处 ${x.reference}`)),
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
    chips: [recommend(say('/报告'))],
  };
  const all = [...held.results].reverse(), wanted = query.trim().toLowerCase();
  if (!all.length) return {
    lines: [[t('还没有登记的分析结果。')], [t(held.pending ? '有一项结果正在送往报告，在报告与 PPT 里收下后就能读到。' : '在数据分析里完成一项分析并登记，结果会带着方法与有效样本进入报告。', 'dim')]],
    chips: [recommend(say(held.pending ? '/报告' : '/分析'))],
  };
  const chosen = wanted ? all.filter(r => [r.title, isFrame(r) ? `抽样框 ${methodName(r)}` : `${r.method} ${methodName(r)}`, ...(r.variables ?? [])].join(' ').toLowerCase().includes(wanted)) : all;
  if (!chosen.length) return {
    lines: [[t('登记的结果里没有'), t(`「${query.trim()}」`, 'strong'), t('，现有的是：')]],
    chips: all.slice(0, 6).map(r => say(r.title.slice(0, 20), `/结果 ${r.title.slice(0, 20)}`)),
  };
  const analyses = chosen.filter(r => !isFrame(r)), frames = chosen.filter(isFrame);
  const shown = analyses.slice(0, wanted ? 4 : 8), simulated = analyses.filter(r => r.classification === 'simulated').length;
  // A finding whose results changed after it was confirmed is not shown as confirmed; the user re-confirms it first.
  const confirmed = wanted ? [] : standingFindings(held), stale = wanted ? 0 : held.findings.filter(f => f.status === 'confirmed').length - confirmed.length;
  const about = wanted ? `与「${query.trim()}」有关的` : '';
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
    chips: analyses.some(r => !held.placed.includes(r.id)) ? [recommend(say('/写入')), say('/来处')] : analyses.length ? [say('/来处'), say('/报告')] : [recommend(say('/分析')), say('/报告')],
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
    chips: [recommend(say('/报告'))],
  };
  if (!held.results.length) return { lines: [[t('还没有登记的结果可写。')], [t('在数据分析里完成一项分析并登记，再回来写入。', 'dim')]], chips: [recommend(say('/分析'))] };
  const waiting = [...held.results].filter(r => !held.placed.includes(r.id));
  if (!waiting.length) return { lines: [[t('已登记的 '), t(String(held.results.length), 'gold'), t(' 项结果都已写进报告。')]], chips: [recommend(say('/盲区 报告')), say('/报告')] };
  const sections = new Map<string, ResultSnapshot[]>();
  for (const r of waiting) { const title = blueprintNode(suggestedNode(r)).title; sections.set(title, [...(sections.get(title) ?? []), r]); }
  const simulated = waiting.filter(r => r.classification === 'simulated').length;
  return {
    lines: [[t('把 '), t(String(waiting.length), 'gold'), t(' 项还没写进报告的登记结果按蓝图写入之前，请确认：')]],
    cards: [{ kind: 'confirm', title: `写入报告 · ${waiting.length} 项结果`,
      lines: [
        ...[...sections].map(([title, rs]) => [t(`「${title}」`, 'strong'), t(`　${rs.map(r => r.title).join('、')}`, 'dim')]),
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
    chips: [recommend(say('/报告'))],
  };
  if (!plan.sections.length) return { lines: [[t('报告里还没有按蓝图组织的章节。')], [t('在报告与 PPT 里按报告类型建立蓝图骨架，再回来逐节写。', 'dim')]], chips: [recommend(say('/报告'))] };
  const unplaced = ctx.results ? ctx.results.results.filter(r => !ctx.results!.placed.includes(r.id)).length : 0;
  const empty = plan.sections.filter(s => s.draftable && ['missing', 'empty'].includes(sectionState(s)));
  // Chapters are headings; each section says where it stands: not yet in the report, empty, under way, or in place.
  const rows = plan.sections.map(s => {
    if (s.kind === 'chapter') return [t(s.title, 'strong')];
    const state = sectionState(s), missing = s.needs.filter(n => !n.met).map(n => n.label);
    return [t(`　${STATE_GLYPH[state]} `, state === 'done' ? 'gold' : 'dim'), t(s.title),
      t(state === 'missing' ? '　未建' : `　已写 ${s.written} 字${s.length ? `（建议 ${s.length[0]}–${s.length[1]}）` : ''}${missing.length ? ` · 还缺：${missing.join('、')}` : ''}`, 'dim')];
  });
  const next = unplaced ? recommend(say('/写入')) : empty.length ? recommend(say(`起草「${empty[0].title}」`.slice(0, 26), `/起草 ${empty[0].title}`)) : recommend(say('/盲区 报告'));
  return {
    lines: [
      plan.score === null ? [t('按蓝图逐节看报告：')] : [t('报告体检 '), t(String(Math.round(plan.score)), 'gold'), t(` 分，适用的 ${plan.total} 项检查通过 ${plan.passed} 项。按蓝图逐节看：`)],
      [t(unplaced ? `还有 ${unplaced} 项登记结果没写进报告，先把它们写进对应章节；` : '', 'dim'),
        t(empty.length ? `${empty.length} 节还没有内容，可以用你的模型服务按本项目的事实起草，数字只从登记结果填入。` : '每一节都已开始写。', 'dim')],
    ],
    cards: [
      { kind: 'tool', title: '读取 · 报告逐节进度', lines: rows },
      ...(plan.gaps.length ? [{ kind: 'tool' as const, title: '体检里最该补的', lines: plan.gaps.map(g => [t(g.label, 'strong'), t(`　${g.detail}`, 'dim')]) }] : []),
    ],
    chips: [next, ...empty.slice(unplaced ? 0 : 1, unplaced ? 2 : 3).map(s => say(`起草「${s.title}」`.slice(0, 26), `/起草 ${s.title}`))],
  };
}

/** A section to draft, named by its title or the words that recognise it; without one, the empty sections to choose from. */
function draftTarget(ctx: RouterContext, arg: string): Routed {
  const node = arg ? draftableNode(arg) : null;
  if (node) return { draft: node.id };
  const empty = ctx.plan?.sections.filter(s => s.draftable && sectionState(s) !== 'done') ?? [];
  return { turn: {
    lines: arg ? [[t('报告蓝图里没有'), t(`「${arg}」`, 'strong'), t('这一节。')]] : [[t('起草哪一节？')]],
    chips: empty.length ? empty.slice(0, 6).map(s => say(s.title.slice(0, 20), `/起草 ${s.title}`)) : [say('/写报告')],
  } };
}

function open(room: Room, ctx: RouterContext): AgentTurn {
  if (room.id === ctx.room) return { lines: [[t(room.name, 'strong'), t('已经在右侧打开。')], [t(room.line, 'dim')]] };
  return {
    lines: [[t('在右侧打开'), t(room.name, 'strong'), t('。')]],
    cards: [{ kind: 'tool', title: `打开 · ${room.name}`, lines: [[t(room.line, 'dim')], ...(lit(room.id) ? [lightLine(room.id, ctx.light)] : [])] }],
    act: { type: 'open', room: room.id },
  };
}

function choose(rooms: Room[]): AgentTurn {
  return {
    lines: [[t('这句话涉及'), ...rooms.flatMap((r, i) => [...(i ? [t('、')] : []), t(r.name, 'strong')]), t('。')], [t('指令模式下我一次只打开一个模块，先开哪一个？', 'dim')]],
    chips: rooms.map(r => say(r.name, `/${r.command}`)),
  };
}

const unknown = (): AgentTurn => ({
  lines: [[t('指令模式下我听不懂这句话，也不会去猜。')], [t('可以说“下一步做什么”“还缺什么”“打开问卷设计”，或输入 ', 'dim'), t('/', 'teal'), t(' 查看全部命令。', 'dim')]],
  chips: [recommend(say('下一步做什么')), say('/帮助')],
});

function slash(body: string, ctx: RouterContext): Routed {
  const [head = '', ...rest] = body.split(/\s+/u), arg = rest.join(' ').trim(), word = head.toLowerCase();
  const command = COMMANDS.find(c => c.name === head || c.words.includes(word));
  if (!command) {
    const near = matchCommands(head.slice(0, 1));
    return { turn: { lines: [[t('没有 '), t(`/${head}`, 'teal'), t(' 这个命令。')]], chips: [...near.slice(0, 3).map(c => say(`/${c.name}`)), say('/帮助')] } };
  }
  const scope = mentionedRooms(arg).map(r => r.id).find(lit);
  const room = ROOMS.find(r => r.command === command.name);
  if (room) return { turn: open(room, ctx) };
  switch (command.name) {
    case '下一步': return { turn: nextStep(ctx) };
    case '照度': return { turn: status(ctx, scope) };
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
    case '清空': return { turn: { lines: [[t('删除之前请确认：')]], cards: [{ kind: 'confirm', title: '删除这段对话', lines: [[t('只删除这段对话记录；问卷、数据与报告都不受影响。', 'dim')]], confirm: { label: '删除', action: { type: 'clear' } }, cancel: '保留' }] } };
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
const BLIND = /盲区|还缺|缺什么|缺了什么|哪里不足|哪里还暗|短板|没通过/u;
const STATUS = /照度|进度|到哪了|到哪一步|完成了多少|整体情况|现在怎么样|项目状态/u;
const WHERE = /^(我在哪|这是哪|当前模块|打开的是什么|我在哪里)/u;
const TRACE = /来处|溯源|回溯|从哪(里)?来|怎么(算|得)出来/u;
const PLAN = /^(帮我|我要|开始)?(写|撰写|完成)(一份|整份|这份)?报告$|报告(怎么写|还缺什么|写到哪|写得怎么样)/u;
const DRAFT = /^(?:帮我|请)?(?:起草|撰写|拟写|写一下|写)\s*[「“"]?(.{2,24}?)[」”"]?(?:这一?节|一节|部分|这一?章)?$/u;
const PLACE = /(把|将)?[^。]{0,10}结果[^。]{0,4}(写|放|加)(进|入|到)报告|写入报告/u;
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
  if (GENERATE.test(input)) return { generate: input };
  const scope = mentionedRooms(input).map(r => r.id).find(lit);
  if (NEXT.test(input)) return { turn: nextStep(ctx) };
  if (BLIND.test(input)) return { turn: blindSpots(ctx, scope) };
  if (STATUS.test(input)) return { turn: status(ctx, scope) };
  if (TRACE.test(input)) { const m = EXHIBIT.exec(input); return { turn: trace(ctx, m ? m[1] + m[2] : '') }; }
  if (PLAN.test(input)) return { turn: writePlan(ctx) };
  { const m = DRAFT.exec(input); const node = m && draftableNode(m[1]); if (node) return { draft: node.id }; }
  if (PLACE.test(input)) return { turn: place(ctx) };
  if (RESULTS.test(input)) return { turn: results(ctx) };
  if (WHERE.test(input)) {
    if (!ctx.room) return { turn: { lines: [[t('右侧没有打开模块，现在只显示对话。')]], chips: [say('打开项目全景', '/全景')] } };
    const room = roomById(ctx.room);
    return { turn: { lines: [[t('右侧打开的是'), t(room.name, 'strong'), t('。')], [t(room.line, 'dim')]] } };
  }
  for (const pattern of LOOKUP) { const m = pattern.exec(input); if (m?.[1]?.trim()) return { lookup: m[1].trim(), explicit: true }; }
  const verb = OPEN.exec(input), rooms = mentionedRooms(verb?.[1] ?? input);
  if (rooms.length === 1) return { turn: open(rooms[0], ctx) };
  if (rooms.length > 1) return { turn: choose(rooms.slice(0, 4)) };
  if (verb) return { turn: { lines: [[t('没有叫'), t(`「${verb[1]}」`, 'strong'), t('这个模块。')]], chips: [say('/帮助')] } };
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
  }
}

export function lookupTurn(query: string, hits: readonly KnowledgeHit[], explicit: boolean): AgentTurn {
  const strong = hits.filter(h => h.match === 'name' || h.match === 'alias' || h.match === 'prefix');
  const pool = explicit ? hits : strong;
  if (!pool.length) return explicit
    ? { lines: [[t('知识镜里没有'), t(`「${query}」`, 'strong'), t('。')], [t('换一个说法，或打开知识镜浏览全部词条。', 'dim')]], chips: [{ label: '打开知识镜', action: { type: 'search' } }] }
    : unknown();
  const top = pool[0], exact = top.match === 'name' || top.match === 'alias';
  if (top.ambiguous || (!exact && pool.length > 1)) return {
    lines: [[t(`「${query}」`, 'strong'), t('在知识镜里可能指：')]],
    chips: pool.slice(0, 5).map(h => say(h.entry.name, `/查 ${h.entry.name}`)),
  };
  const e = top.entry;
  return {
    lines: [[t('知识镜中的'), t(`「${e.name}」`, 'strong'), t('，原文照录：')]],
    cards: [{ kind: 'entry', id: e.id, name: e.name, ...(e.englishName ? { english: e.englishName } : {}), definition: e.definition,
      ...(e.formula?.tex ? { formula: e.formula.tex } : {}), sources: e.sources.map(s => s.title).slice(0, 3), reviewed: e.review.status === 'reviewed' }],
    chips: pool.slice(1, 4).map(h => say(h.entry.name, `/查 ${h.entry.name}`)),
    ...(pool.length > 1 ? { chipsLabel: '相关词条' } : {}),
  };
}
