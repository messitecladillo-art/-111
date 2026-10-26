// A conversation as a Markdown record, for the AI-use statement a 正大杯 entry needs: who said what, which answers a
// model wrote (with its service and step), and which the platform gave by rule without calling any model.
import { turnText } from './chat.ts';
import type { AgentTurn } from './router.ts';

/** The parts of a conversation the record needs; the agent's thread store holds more. */
export type RecordMessage =
  | { role: 'user'; at: number; text: string }
  | { role: 'agent'; at: number; turn: AgentTurn; answered?: 'confirmed' | 'cancelled'; model?: { service: string; step: number } }
  | { role: 'pending'; at: number };
export type RecordThread = { title: string; createdAt: number; messages: readonly RecordMessage[] };

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** The file name for a conversation's record, safe on every system. */
export function recordName(thread: Pick<RecordThread, 'title'>, now: number): string {
  const d = new Date(now), safe = thread.title.replace(/[\\/:*?"<>|\s]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 30) || '对话';
  return `证见对话-${safe}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.md`;
}

/**
 * The record. It opens with what the statement needs (how many model calls, through which services) and then gives the
 * conversation in order. A model's answer is marked as unverified; formulas keep their TeX so they can be typeset again.
 */
export function conversationMarkdown(thread: RecordThread, now: number): string {
  const said = thread.messages.filter((m): m is Exclude<RecordMessage, { role: 'pending' }> => m.role !== 'pending');
  const calls = said.filter(m => m.role === 'agent' && m.model).length;
  const services = [...new Set(said.flatMap(m => m.role === 'agent' && m.model ? [m.model.service] : []))];
  const lines = [
    `# 证见 Agent 对话记录：${thread.title}`, '',
    `- 开始于 ${stamp(thread.createdAt)}，导出于 ${stamp(now)}`,
    calls
      ? `- 调用生成式模型 ${calls} 次，服务：${services.join('、')}。标为“模型回答”的内容由模型生成，未经核实；其余回答由平台按规则给出，未调用模型。`
      : '- 未调用生成式模型：全部回答由平台按规则给出（指令模式）。',
    '',
  ];
  for (const m of said) {
    const who = m.role === 'user' ? '你'
      : m.model ? `证见 · 模型回答（${m.model.service}${m.model.step > 1 ? `，第 ${m.model.step} 步` : ''}，未经核实）`
      : m.turn.cards?.some(card => card.kind === 'confirm') ? '证见 · 确认' : '证见 · 指令模式';
    // A model's answer carries a closing note that it is unverified; the heading says so already.
    const turn = m.role === 'agent' && m.model ? { ...m.turn, lines: m.turn.lines.filter(line => !(line[0]?.mark === 'cyan' && line[0].text.trim() === '◆')) } : null;
    // A question put to the user is recorded with its answer: consent to call a model is part of the statement.
    const asked = m.role === 'agent' ? (m.turn.cards ?? []).flatMap(card => card.kind === 'confirm'
      ? [`需要确认：${card.title} —— ${m.answered === 'confirmed' ? '已确认' : m.answered === 'cancelled' ? '已取消' : '未回答'}`] : []) : [];
    const body = m.role === 'user' ? m.text : [turnText(turn ?? m.turn, Infinity), ...asked].filter(Boolean).join('\n');
    if (body.trim()) lines.push(`## ${who} · ${stamp(m.at)}`, '', body.trim(), '');
  }
  return lines.join('\n');
}
