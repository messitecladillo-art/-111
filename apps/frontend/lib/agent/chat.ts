// The 证见 Agent's model turn, as the browser sees it: what it sends (a bounded summary of the project, never data
// rows), what comes back (a reply and at most three tool requests from a fixed list), and what each failure means.
// The backend holds the same list and limits (apps/backend …/agent_chat.py); the browser checks them again.
import type { Illumination } from './illumination.ts';
import { isFrame, standingFindings, type AgentTurn, type Line, type ResultsView, type Span } from './router.ts';
import { isRoomId, roomById, type RoomId } from './rooms.ts';

export type ChatAction =
  | { tool: 'next'; args: Record<string, never> }
  | { tool: 'light' | 'blind'; args: { room?: RoomId } }
  | { tool: 'trace'; args: { reference: string } }
  | { tool: 'results'; args: { query?: string } }
  | { tool: 'place'; args: Record<string, never> }
  | { tool: 'open'; args: { room: RoomId } }
  | { tool: 'lookup'; args: { query: string } }
  | { tool: 'draft'; args: { brief: string } };
export type ChatStatus = 'running' | 'ready' | 'failed' | 'outcome_unknown';
export type ChatReceipt = { id: string; status: ChatStatus; step: number; message: string | null; reply: string | null; actions: ChatAction[]; droppedActions: number; errorCode: string | null };
/** What a read-only tool found, sent back so the model can go on from it. */
export type ToolResult = { tool: 'next' | 'light' | 'blind' | 'trace' | 'lookup' | 'results'; text: string };
export type ChatLine = { role: 'user' | 'agent'; text: string };
export type ChatContext = {
  room: RoomId | null;
  overall: number;
  rooms: { room: RoomId; name: string; score: number; summary: string; blind: string[] }[];
  traces: { reference: string; title: string }[];
  /** How much registered work the report holds; null before the report has been seen in this visit. */
  results: { registered: number; simulated: number; frames: number; confirmedFindings: number } | null;
};
export type ChatRequest = {
  schemaVersion: 1; idempotencyKey: string; message: string; history: ChatLine[]; context: ChatContext;
  serviceId: string; serviceRevision: number; consent: true;
  /** A continuation: the step it is (2 or more) and what the previous step's tools found. */
  step?: number; toolResults?: ToolResult[];
};

/** One sentence is answered in at most this many calls; the backend lets the last ask for no tools. */
export const MAX_STEPS = 3;
const RESULT_TOOLS = new Set<ChatAction['tool']>(['next', 'light', 'blind', 'trace', 'lookup', 'results']);
export const isResultTool = (tool: ChatAction['tool']): tool is ToolResult['tool'] => RESULT_TOOLS.has(tool);

/** A span as the model should read it: a formula keeps its TeX delimiters. */
export const spanText = (span: Span): string => span.mark === 'tex' ? `$${span.text}$` : span.mark === 'math' ? `$$${span.text}$$` : span.text;

/** A turn as plain text for the model, its cards' contents included, within the backend's limit. */
export function turnText(turn: AgentTurn, limit = TEXT_LIMIT): string {
  const join = (line: readonly Span[]) => line.map(spanText).join('');
  const parts = turn.lines.map(join);
  for (const card of turn.cards ?? []) {
    if (card.kind === 'tool') parts.push(card.title, ...card.lines.map(join));
    if (card.kind === 'entry') parts.push(`${card.name}：${card.definition}`, ...card.sources.map(s => `出处：${s}`));
    if (card.kind === 'trace') parts.push(`${card.reference} ${card.title}`, ...card.steps.map(s => `${s.text} ${s.detail}`));
  }
  return clip(parts.filter(p => p.trim()).join('\n'), limit);
}

export const HISTORY_LIMIT = 12, TEXT_LIMIT = 1200;
const clip = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * What the model may see of the project: each module's light, its failing checks, the report's traceable figures and
 * how many results and findings are registered. The results themselves are read only when the model asks for them.
 */
export function chatContext(room: RoomId | null, light: Illumination, traces: readonly { reference: string; title: string }[], held: ResultsView = null): ChatContext {
  return {
    room,
    overall: round(light.overall),
    rooms: light.rooms.map(r => ({ room: r.room, name: roomById(r.room).name, score: round(r.score), summary: clip(r.summary, 80),
      blind: r.checks.filter(c => !c.passed).slice(0, 6).map(c => clip(c.label, 80)) })),
    traces: traces.slice(0, 20).map(t => ({ reference: clip(t.reference, 20), title: clip(t.title, 80) })),
    results: held && { registered: held.results.filter(r => !isFrame(r)).length, simulated: held.results.filter(r => !isFrame(r) && r.classification === 'simulated').length,
      frames: held.results.filter(isFrame).length, confirmedFindings: standingFindings(held).length },
  };
}

/** The recent conversation, oldest first, each entry within the backend's limits. */
export function chatHistory(lines: readonly ChatLine[]): ChatLine[] {
  return lines.filter(l => l.text.trim()).slice(-HISTORY_LIMIT).map(l => ({ role: l.role, text: clip(l.text.trim(), TEXT_LIMIT) }));
}

/** The part of a stored message the model may read; cards and status notes say nothing about the research. */
export type SpokenMessage =
  | { role: 'user'; text: string }
  | { role: 'agent'; turn: AgentTurn; model?: { status?: string } }
  | { role: 'pending' };

/**
 * A conversation entry as the model sees it. A question put to the user is not part of what was said, and a model call
 * that is still running, failed, was refused or ended unknown is a status note, never an answer.
 */
export function chatLine(message: SpokenMessage): ChatLine[] {
  if (message.role === 'user') return [{ role: 'user', text: message.text }];
  if (message.role !== 'agent') return [];
  if (message.turn.cards?.some(card => card.kind === 'confirm' || card.kind === 'consent')) return [];
  if (message.model?.status && message.model.status !== 'ready') return [];
  const text = message.turn.lines.map(line => line.map(spanText).join('')).join('\n').trim();
  return text ? [{ role: 'agent', text }] : [];
}

const TEXT_ARGS = { trace: ['reference', 20], lookup: ['query', 60], draft: ['brief', 600] } as const;
function action(value: unknown): ChatAction | null {
  const row = value as { tool?: unknown; args?: Record<string, unknown> } | null;
  if (!row || typeof row !== 'object' || typeof row.tool !== 'string' || !row.args || typeof row.args !== 'object') return null;
  const room = typeof row.args.room === 'string' && isRoomId(row.args.room) ? row.args.room : row.args.room === undefined ? undefined : null;
  switch (row.tool) {
    case 'next': return { tool: 'next', args: {} };
    case 'place': return { tool: 'place', args: {} };
    case 'light': case 'blind': return room === undefined ? { tool: row.tool, args: {} } : room ? { tool: row.tool, args: { room } } : null;
    case 'open': return room ? { tool: 'open', args: { room } } : null;
    case 'results': {
      const given = row.args.query;
      if (given === undefined) return { tool: 'results', args: {} };
      return typeof given === 'string' && given.trim() && given.length <= 40 ? { tool: 'results', args: { query: given.trim() } } : null;
    }
    case 'trace': case 'lookup': case 'draft': {
      const [name, limit] = TEXT_ARGS[row.tool], given = row.args[name];
      if (typeof given !== 'string' || !given.trim() || given.length > limit) return null;
      return { tool: row.tool, args: { [name]: given.trim() } } as ChatAction;
    }
    default: return null;
  }
}

/** A receipt from the backend, checked again: anything outside the agreed shape is refused, an unknown tool dropped. */
export function parseChatReceipt(value: unknown): ChatReceipt {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !['running', 'ready', 'failed', 'outcome_unknown'].includes(v.status as string)) throw Error('对话回执格式无效。');
  const actions = Array.isArray(v.actions) ? v.actions.map(action).filter((a): a is ChatAction => !!a).slice(0, 3) : [];
  return { id: v.id, status: v.status as ChatStatus, step: typeof v.step === 'number' && v.step >= 1 ? v.step : 1, message: typeof v.message === 'string' ? v.message : null, reply: typeof v.reply === 'string' && v.reply.trim() ? v.reply : null, actions,
    droppedActions: typeof v.droppedActions === 'number' ? v.droppedActions : 0, errorCode: typeof v.errorCode === 'string' ? v.errorCode : null };
}

/** What a refusal or a failure means to the user, in their words. */
export const CHAT_ERRORS: Record<string, string> = {
  capability_unavailable: '所选模型服务没有启用「研究」能力；在模型服务里勾选后再试。',
  revision_conflict: '模型服务刚被修改过，请在模型菜单里重新选择后再发。',
  call_rate_limit: '每小时最多 30 次对话模型调用，请稍后再试。',
  call_active: '上一轮还在生成，请先核对它的回执。',
  consent_required: '需要先确认发送的内容。',
  input_too_large: '这段对话或项目摘要太长，新建一段对话再试。',
  sensitive_input: '内容里出现了服务密钥，请删掉后再发。',
  outcome_unknown: '同样的话有一轮结果尚未明确，请先核对那一轮的回执。',
  provider_timeout: '模型服务没有及时回应。',
  authentication_failed: '模型服务拒绝了密钥，请在模型服务里检查。',
  rate_limited: '模型服务限流了，请稍后再试。',
  invalid_response: '模型的回答不符合约定格式，没有采用。',
  provider_rejected: '模型服务拒绝了这次请求。',
  interrupted_call: '这一轮调用被中断了。',
};

// $$…$$ or \[…\] for a display formula, $…$ or \(…\) inline, **…** for emphasis. A lone $ stays text.
const MARKUP = /\$\$([^$]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\*\*([^*\n]+?)\*\*/gu;
const TEX_LIMIT = 400;
// A display formula, captured whole so splitting around it keeps it.
const DISPLAY = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/u;
/**
 * A model's reply as lines to render: a paragraph per line, its formulas typeset with KaTeX (trust off) instead of
 * shown as TeX, its emphasis in bold. A formula on a line of its own stands as a display equation; one too long to
 * be a formula stays text.
 */
export function replyLines(reply: string): Line[] {
  // A display formula inside emphasis is lifted out of it: the text on either side stays emphasised.
  const lifted = reply.replace(/\*\*([\s\S]+?)\*\*/gu, (whole, inner: string) => DISPLAY.test(inner)
    ? inner.split(DISPLAY).map((part, i) => i % 2 ? part : part.trim() ? `**${part.trim()}**` : '').join('')
    : whole);
  // A display formula written over several lines is one formula: it is folded onto a line of its own first.
  const folded = lifted.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/gu, (_, dollars?: string, bracket?: string) =>
    `\n$$${(dollars ?? bracket ?? '').replace(/\s*\n\s*/gu, ' ').trim()}$$\n`);
  return folded.split(/\n+/u).map(p => p.trim()).filter(Boolean).map(paragraph => markup(paragraph, false));
}

/** One paragraph's spans. Inside emphasis the text is read again, so a formula there is typeset too. */
function markup(text: string, strong: boolean): Line {
  const line: Line = [], plain = (value: string) => line.push(strong ? { text: value, mark: 'strong' } : { text: value });
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    const [whole, display, bracket, inline, paren, emphasis] = m;
    const tex = (display ?? bracket ?? inline ?? paren)?.trim();
    if (m.index > last) plain(text.slice(last, m.index));
    if (emphasis !== undefined) line.push(...(strong ? [{ text: emphasis, mark: 'strong' as const }] : markup(emphasis, true)));
    else if (tex && tex.length <= TEX_LIMIT) line.push({ text: tex, mark: display !== undefined || bracket !== undefined ? 'math' : 'tex' });
    else plain(whole);
    last = m.index + whole.length;
  }
  if (last < text.length) plain(text.slice(last));
  return line;
}

/** A refusal before any call: nothing was billed, so sending again is safe. */
export function isDefiniteChatRejection(status: number, code: string): boolean {
  return status === 401 || status === 403 || status === 404
    || (status === 409 && ['revision_conflict', 'idempotency_conflict', 'outcome_unknown'].includes(code))
    || (status === 422)
    || (status === 429 && ['call_active', 'call_rate_limit'].includes(code));
}
