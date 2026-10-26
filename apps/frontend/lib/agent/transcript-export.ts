// A conversation as a Markdown record, for the AI-use statement a 正大杯 entry needs: who said what, which answers a
// model wrote (with its service, step and how the call ended), and which the platform gave by rule without a model.
import { turnText } from './chat.ts';
import type { AgentCard, AgentTurn, Line } from './router.ts';

type CallStatus = 'running' | 'ready' | 'failed' | 'unknown' | 'refused';
type Call = { service: string; step: number; status?: CallStatus };
/** The parts of a conversation the record needs; the agent's thread store holds more. */
export type RecordMessage =
  | { role: 'user'; at: number; text: string }
  | { role: 'agent'; at: number; turn: AgentTurn; answered?: 'confirmed' | 'cancelled'; model?: Call }
  | { role: 'pending'; at: number };
export type RecordThread = { title: string; createdAt: number; messages: readonly RecordMessage[] };
type Said = Exclude<RecordMessage, { role: 'pending' }>;

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const FOOTER = /^(.+?) 的回答，未经核实/u;
const JOB_STATUS = { running: 'running', done: 'ready', failed: 'failed', unknown: 'unknown' } as const;
const NOT_STARTED = /^本次起草没有启动|本次没有调用模型/u;
const OUTCOME = { ready: '已完成', failed: '失败', running: '结果尚不明确', unknown: '结果尚不明确' } as const;

/** The file name for a conversation's record, safe on every system. */
export function recordName(thread: Pick<RecordThread, 'title'>, now: number): string {
  const d = new Date(now), safe = thread.title.replace(/[\\/:*?"<>|\s]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 30) || '对话';
  return `证见对话-${safe}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.md`;
}

/**
 * The model call a message holds, if any: recorded on it when it was sent; for a reply stored before calls were
 * recorded, read from its closing "unverified" note; for questionnaire drafting, read from its job card. A call the
 * service turned away, or one never sent, is kept as refused: shown, but not counted.
 */
function callOf(m: Said): (Call & { kind: 'chat' | 'draft' }) | null {
  if (m.role !== 'agent') return null;
  if (m.model) return { ...m.model, kind: 'chat' };
  const job = m.turn.cards?.find((c): c is Extract<AgentCard, { kind: 'job' }> => c.kind === 'job');
  if (job) {
    // A draft still reading the project's questionnaire has sent nothing yet; older records say so only in words.
    const none = job.noCall || (job.status === 'running' && !job.request) || (job.status === 'failed' && NOT_STARTED.test(job.detail));
    return { service: `${job.serviceLabel}（${job.model}）`, step: 1, status: none ? 'refused' : JOB_STATUS[job.status], kind: 'draft' };
  }
  const note = m.turn.lines.find(line => line[0]?.mark === 'cyan' && line[0].text.trim() === '◆');
  const service = note && FOOTER.exec(note.slice(1).map(s => s.text).join(''))?.[1];
  return service ? { service, step: 1, status: 'ready', kind: 'chat' } : null;
}

const heading = (m: Said, call: ReturnType<typeof callOf>) => {
  if (m.role === 'user') return '你';
  if (call?.kind === 'draft') return call.status === 'refused' ? `证见 · 模型起草问卷未启动（${call.service}，未调用模型）` : `证见 · 模型起草问卷（${call.service}，${OUTCOME[call.status ?? 'unknown']}）`;
  if (call) {
    const where = `${call.service}${call.step > 1 ? `，第 ${call.step} 步` : ''}`;
    if (call.status === 'refused') return `证见 · 模型调用未发出（${where}，未调用模型）`;
    if (call.status === 'failed') return `证见 · 模型调用失败（${where}）`;
    if (call.status === 'running' || call.status === 'unknown') return `证见 · 模型调用结果尚不明确（${where}）`;
    return `证见 · 模型回答（${where}，未经核实）`;
  }
  return m.turn.cards?.some(card => card.kind === 'confirm' || card.kind === 'consent') ? '证见 · 确认' : '证见 · 指令模式';
};

/** Emphasis as Markdown: a run of emphasised spans becomes one **…**. */
const bold = (line: Line): Line => line.map((span, i) => span.mark !== 'strong' ? span
  : { text: `${line[i - 1]?.mark === 'strong' ? '' : '**'}${span.text}${line[i + 1]?.mark === 'strong' ? '' : '**'}` });

/** What the record shows of cards the conversation's own text leaves out: questions put to the user, drafted questionnaires. */
function cardsText(m: Extract<Said, { role: 'agent' }>): string[] {
  return (m.turn.cards ?? []).flatMap(card => {
    if (card.kind === 'confirm') return [`需要确认：${card.title} —— ${m.answered === 'confirmed' ? '已确认' : m.answered === 'cancelled' ? '已取消' : '未回答'}`];
    if (card.kind === 'consent') return [`需要确认：调用模型起草问卷（研究需求：${card.brief}${card.serviceLabel ? `；服务：${card.serviceLabel}` : ''}${card.projectTitle ? `；项目：${card.projectTitle}` : ''}）—— ${card.state === 'submitted' ? '已确认' : card.state === 'cancelled' ? '已取消' : '未回答'}`];
    if (card.kind === 'job') return [card.detail];
    if (card.kind === 'proposal') return [`模型拟议的问卷（未经核实，带入问卷设计确认后才成为设计）：${card.design.title || '未命名问卷'}`,
      ...card.design.questions.map((q, i) => `${i + 1}. ${q.text}（${q.type}）`)];
    return [];
  });
}

/**
 * The record. It opens with what the statement needs (how many model calls, through which services, how many have no
 * known outcome) and then gives the conversation in order. Formulas keep their TeX so they can be typeset again.
 */
export function conversationMarkdown(thread: RecordThread, now: number): string {
  const said = thread.messages.filter((m): m is Said => m.role !== 'pending');
  const calls = said.map(callOf).filter((c): c is NonNullable<ReturnType<typeof callOf>> => !!c && c.status !== 'refused');
  const services = [...new Set(calls.map(c => c.service))], unclear = calls.filter(c => c.status === 'running' || c.status === 'unknown').length;
  const lines = [
    `# 证见 Agent 对话记录：${thread.title}`, '',
    `- 开始于 ${stamp(thread.createdAt)}，导出于 ${stamp(now)}`,
    calls.length
      ? `- 本段对话调用生成式模型 ${calls.length} 次${unclear ? `（其中 ${unclear} 次结果尚不明确）` : ''}，服务：${services.join('、')}。标为“模型”的内容由模型生成，未经核实；其余回答由平台按规则给出，未调用模型。`
      : '- 本段对话未调用生成式模型：全部回答由平台按规则给出（指令模式）。',
    '- 本记录只覆盖这段对话在本浏览器里保存的内容，不是完整的 AI 使用台账。',
    '',
  ];
  for (const m of said) {
    const call = callOf(m);
    // A model's answer carries a closing note that it is unverified; the heading says so already.
    const shown = m.role === 'agent' && call?.kind === 'chat' ? m.turn.lines.filter(line => !(line[0]?.mark === 'cyan' && line[0].text.trim() === '◆')) : m.role === 'agent' ? m.turn.lines : [];
    const body = m.role === 'user' ? m.text : [turnText({ ...m.turn, lines: shown.map(bold) }, Infinity), ...cardsText(m)].filter(Boolean).join('\n');
    if (body.trim()) lines.push(`## ${heading(m, call)} · ${stamp(m.at)}`, '', body.trim(), '');
  }
  return lines.join('\n');
}
