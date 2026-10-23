/**
 * The 证见 agent's command mode: a deterministic router from what the user types to what the shell does.
 * It understands slash commands and a fixed set of everyday phrasings. Anything else it says it cannot understand
 * rather than guessing, and knowledge questions are answered from the reviewed knowledge base verbatim, with sources.
 */
import { lightBar, percent } from './glyphs.ts';
import { LIT_ROOMS, roomLight, type Illumination, type LightCheck } from './illumination.ts';
import { exhibitKey, type Trace, type TraceStep } from './provenance.ts';
import { ROOMS, roomById, type Room, type RoomId } from './rooms.ts';

/** gold: a number with an origin · cyan: generated, unconfirmed · teal: a method or command · error: failures only. */
export type Mark = 'gold' | 'cyan' | 'teal' | 'dim' | 'error' | 'strong';
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
  | { type: 'say'; text: string };
/** A primary link is the one step the agent recommends; a turn has at most one. */
export type AgentLink = { label: string; action: AgentAction; primary?: true };
export type AgentCard =
  | { kind: 'tool'; title: string; lines: Line[]; links?: AgentLink[] }
  | { kind: 'confirm'; title: string; lines: Line[]; confirm: AgentLink; cancel: string }
  | { kind: 'entry'; id: string; name: string; english?: string; definition: string; formula?: string; sources: string[]; reviewed: boolean }
  | { kind: 'trace'; reference: string; title: string; steps: TraceStep[] };
export type AgentTurn = { lines: Line[]; cards?: AgentCard[]; chips?: AgentLink[]; chipsLabel?: string; act?: AgentAction };
/** `traces` are the report's exhibits with their paths back (provenance.ts); the shell computes them with the light. */
export type RouterContext = { room: RoomId; light: Illumination; theme?: 'light' | 'dark'; traces?: readonly Trace[] };
/** Either an answer, or a knowledge lookup the shell runs before answering with `lookupTurn`. */
export type Routed = { turn: AgentTurn } | { lookup: string; explicit: boolean };

export type Command = { name: string; args?: string; line: string; words: readonly string[] };
const ROOM_COMMANDS: Command[] = ROOMS.map(r => ({ name: r.command, line: `走进${r.name}`, words: [r.id] }));
export const COMMANDS: readonly Command[] = [
  { name: '下一步', line: '按研究动线给出最该做的一件事', words: ['next'] },
  { name: '照度', line: '各房间的证据完整度', words: ['status'] },
  { name: '盲区', line: '光到不了的角落，以及去哪里补', words: ['gaps', 'blind'] },
  { name: '来处', args: '图表编号', line: '沿光路回溯报告里一个图表的数字从哪里来', words: ['trace', 'origin'] },
  { name: '查', args: '概念或方法', line: '在知识镜中查定义、公式与出处', words: ['lookup', 'search'] },
  ...ROOM_COMMANDS,
  { name: '夜', line: '切换到深色主题', words: ['dark'] },
  { name: '昼', line: '切换到浅色主题', words: ['day'] },
  { name: '清空', line: '清空本页对话，项目数据不受影响', words: ['clear'] },
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

/** Rooms named in a sentence, the longest name first, so 问卷室 outranks a passing 数据. */
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
      { kind: 'tool', title: '命令', lines: general.map(c => [t(`/${c.name}${c.args ? ` ‹${c.args}›` : ''}`, 'teal'), t(`　${c.line}`, 'dim')]) },
      { kind: 'tool', title: '房间', lines: [ROOM_COMMANDS.map(c => t(`/${c.name} `, 'teal'))] },
      { kind: 'tool', title: '也可以这样说', lines: ['下一步做什么', '问卷还缺什么', '打开分析室', '图 1-1 的数字从哪来', '什么是设计效应', '切换到浅色模式'].map(s => [t(`“${s}”`)]) },
    ],
    chips: [recommend(say('下一步做什么')), say('/照度')],
  };
}

function lightLine(id: RoomId, light: Illumination): Line {
  const r = roomLight(light, id);
  if (!r) return [t('照度：此房间尚未接入', 'dim')];
  return [t('照度 '), t(lightBar(r.score), r.score > 0 ? 'gold' : 'dim'), t(` ${percent(r.score)}`, 'gold'), t(`　${r.summary}`, 'dim')];
}

function status(ctx: RouterContext, scope?: RoomId): AgentTurn {
  const { light } = ctx;
  if (scope) {
    const r = roomLight(light, scope)!;
    return {
      lines: [[t(`${named(scope)}的照度 `), t(percent(r.score), 'gold'), t('，逐项如下：')]],
      cards: [{ kind: 'tool', title: `读取 · ${named(scope)}`, lines: r.checks.slice(0, 12).map(c => [t(c.passed ? '✓ ' : '✕ ', c.passed ? 'gold' : 'error'), t(c.label), t(`　${c.detail}`, 'dim')]) }],
      chips: [say('下一步做什么')],
    };
  }
  return {
    lines: [[t('整体照度 '), t(percent(light.overall), 'gold'), t('。')], [t('照度只计算能看到证据的房间：问卷、抽样、分析与报告；其他房间接入 Agent 主循环后再点亮。', 'dim')]],
    cards: [{ kind: 'tool', title: '读取 · 项目照度', lines: light.rooms.map(r => [t(`${named(r.room)}　`), t(lightBar(r.score), r.score > 0 ? 'gold' : 'dim'), t(` ${percent(r.score).padStart(4, ' ')}`, 'gold'), t(`　${r.summary}`, 'dim')]) }],
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
        ...(spots.length > shown.length ? [[t(`还有 ${spots.length - shown.length} 处，前厅的照度图里列全了。`, 'dim')]] : [])],
      links: rooms.map(id => say(`去${named(id)}`, `/${roomById(id).command}`)),
    }],
  };
}

function nextStep(ctx: RouterContext): AgentTurn {
  const spot = ctx.light.blind[0];
  if (!spot) return { lines: [[t('有照度的房间，检查都通过了。')], [t('可以去答辩室演练追问，交稿前在提交前体检里查一遍文件。', 'dim')]], chips: [say('/答辩'), say('/提交')] };
  return {
    lines: [[t('下一步：'), t(spot.label, 'strong'), t('。')], [t(spot.detail, 'dim')]],
    chips: [recommend(say(`走进${named(spot.go)}`, `/${roomById(spot.go).command}`)), say('还缺什么', '/盲区')],
  };
}

/** 回溯: one exhibit's path back to its origin, or the exhibits to choose from. `arg` is an exhibit number or words of its title. */
function trace(ctx: RouterContext, arg = ''): AgentTurn {
  const traces = ctx.traces ?? [], wanted = arg.trim(), key = exhibitKey(wanted);
  if (!traces.length) return {
    lines: [[t('报告里还没有来自登记结果的图表。')], [t('在分析室完成一项分析并发送到报告，或从抽样室插入抽样框，就能沿光路回溯到数据与题目。', 'dim')]],
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

function open(room: Room, ctx: RouterContext): AgentTurn {
  if (room.id === ctx.room) return { lines: [[t('你已经在'), t(room.name, 'strong'), t('。')], [t(room.line, 'dim')]] };
  return {
    lines: [[t('走进'), t(room.name, 'strong'), t('。')]],
    cards: [{ kind: 'tool', title: `走进 · ${room.name}`, lines: [[t(room.line, 'dim')], ...(lit(room.id) ? [lightLine(room.id, ctx.light)] : [])] }],
    act: { type: 'open', room: room.id },
  };
}

function choose(rooms: Room[]): AgentTurn {
  return {
    lines: [[t('这句话涉及'), ...rooms.flatMap((r, i) => [...(i ? [t('、')] : []), t(r.name, 'strong')]), t('。')], [t('指令模式下我一次只走进一间房，先去哪一间？', 'dim')]],
    chips: rooms.map(r => say(r.name, `/${r.command}`)),
  };
}

const unknown = (): AgentTurn => ({
  lines: [[t('指令模式下我听不懂这句话，也不会去猜。')], [t('可以说“下一步做什么”“还缺什么”“打开问卷室”，或输入 ', 'dim'), t('/', 'teal'), t(' 查看全部命令。', 'dim')]],
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
    case '查': return arg ? { lookup: arg, explicit: true }
      : { turn: { lines: [[t('查什么？例如 '), t('/查 设计效应', 'teal'), t('。')]], chips: [{ label: '打开知识镜', action: { type: 'search' } }] } };
    case '夜': return { turn: ctx.theme === 'dark' ? { lines: [[t('现在就是深色主题。')]] } : { lines: [[t('已切换到深色主题。')]], act: { type: 'theme', theme: 'dark' } } };
    case '昼': return { turn: ctx.theme === 'light' ? { lines: [[t('现在就是浅色主题。')]] } : { lines: [[t('已切换到浅色主题。')]], act: { type: 'theme', theme: 'light' } } };
    case '清空': return { turn: { lines: [[t('清空之前请确认：')]], cards: [{ kind: 'confirm', title: '清空本页对话', lines: [[t('只清除这里的对话记录；问卷、数据与报告都不受影响。', 'dim')]], confirm: { label: '清空', action: { type: 'clear' } }, cancel: '保留' }] } };
    case '经典': return { turn: { lines: [[t('经典工作台保留了全部模块的原样排布。')]], chips: [{ label: '打开经典工作台 ↗', action: { type: 'href', href: `/workspace#${ctx.room}` } }] } };
    default: return { turn: help() };
  }
}

const NIGHT = /(深色|夜间|暗色|暗黑)(主题|模式)|(切换?到|换成|改成|改为|用)(深色|夜间|暗色)/u;
const DAY = /(浅色|日间|亮色|白天)(主题|模式)|(切换?到|换成|改成|改为|用)(浅色|日间|亮色)/u;
const HELP = /^(帮助|help|你能做什么|你会什么|你可以做什么|能做什么|怎么用|如何使用|有哪些命令|命令列表)$/iu;
const NEXT = /下一步|接下来|该做什么|先做什么|从哪(里)?开始|怎么开始/u;
const BLIND = /盲区|还缺|缺什么|缺了什么|哪里不足|哪里还暗|短板|没通过/u;
const STATUS = /照度|进度|到哪了|到哪一步|完成了多少|整体情况|现在怎么样|项目状态/u;
const WHERE = /^(我在哪|这是哪|当前房间|我在哪里)/u;
const TRACE = /来处|溯源|回溯|从哪(里)?来|怎么(算|得)出来/u;
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
  const scope = mentionedRooms(input).map(r => r.id).find(lit);
  if (NEXT.test(input)) return { turn: nextStep(ctx) };
  if (BLIND.test(input)) return { turn: blindSpots(ctx, scope) };
  if (STATUS.test(input)) return { turn: status(ctx, scope) };
  if (TRACE.test(input)) { const m = EXHIBIT.exec(input); return { turn: trace(ctx, m ? m[1] + m[2] : '') }; }
  if (WHERE.test(input)) { const room = roomById(ctx.room); return { turn: { lines: [[t('你在'), t(room.name, 'strong'), t('。')], [t(room.line, 'dim')]] } }; }
  for (const pattern of LOOKUP) { const m = pattern.exec(input); if (m?.[1]?.trim()) return { lookup: m[1].trim(), explicit: true }; }
  const verb = OPEN.exec(input), rooms = mentionedRooms(verb?.[1] ?? input);
  if (rooms.length === 1) return { turn: open(rooms[0], ctx) };
  if (rooms.length > 1) return { turn: choose(rooms.slice(0, 4)) };
  if (verb) return { turn: { lines: [[t('没有叫'), t(`「${verb[1]}」`, 'strong'), t('的房间。')]], chips: [say('/帮助')] } };
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
