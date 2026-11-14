'use client';

import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { usageText } from '@/lib/agent/chat';
import { Formula } from '@/components/math/Tex';
import type { AgentAction, AgentCard, Line } from '@/lib/agent/router';
import { ConsentCard, JobCard, ProposalView } from './generation';
import { Spans } from './Glyphs';
import { Icon } from './icons';
import { ChartStudioView, CodeStudioView, WritingStudioView, type WritingModelStatus } from './StudioCards';
import ReportWorkstation from '@/components/figures/report-workstation/ReportWorkstation';
import type { Message, ModelCall, ToolExecution } from './threads';
import styles from './AgentShell.module.css';

type Handlers = { onAction: (action: AgentAction) => void; onAnswer: (id: string, answer: 'confirmed' | 'cancelled', action?: AgentAction) => void; writingModelStatus?: WritingModelStatus };

/**
 * One conversation, in a centred column inside the shell's scroll area. It follows new replies unless the reader has
 * scrolled back to read; sending always brings the reader back down. Its handlers are stable, so it re-renders only
 * when the conversation does.
 */
export default memo(function Transcript({ messages, scrollRef, activeCallIds, workInPaper = false, ...handlers }: {
  messages: Message[]; scrollRef: RefObject<HTMLDivElement | null>; activeCallIds: ReadonlySet<string>; workInPaper?: boolean;
} & Handlers) {
  const pinned = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);
  useLayoutEffect(() => {
    const el = scrollRef.current, last = messages.at(-1);
    if (el && (pinned.current || last?.role === 'user' || last?.role === 'pending')) { el.scrollTop = el.scrollHeight; pinned.current = true; }
  }, [messages, scrollRef]);
  return <div className={styles.column} role="log" aria-label="对话记录" aria-live="polite" aria-relevant="additions">
    {messages.map(message => <MessageView key={message.id} message={message}
      active={activeCallIds.has(message.id)} showWork={!workInPaper && (message === messages.at(-1))} {...handlers} />)}
  </div>;
});

function MessageView({ message, active, showWork, onAction, onAnswer, writingModelStatus }: { message: Message; active: boolean; showWork: boolean } & Handlers) {
  if (message.role === 'user') return <div className={`${styles.message} ${styles.user}`}><p>{message.text}</p></div>;
  if (message.role === 'pending') return <div className={styles.message}><div className={styles.reply}>
    {showWork ? <ReportWorkstation inline kind="research" heading="正在查询知识镜"
      state={{ phase: 'writing', detail: message.query, completed: 0, total: 0 }} />
      : <p>正在查知识镜「{message.query}」</p>}
  </div></div>;
  const { turn } = message;
  return <div className={styles.message}>
    {message.model && <StepHead model={message.model} at={message.at} active={active} />}
    <div className={styles.reply}>
      {message.reasoning && <details className={styles.reasoningBox}>
        <summary className={styles.reasoningSummary}>
          <span>思维链与研判依据</span>
          <small>{message.reasoning.length} 字</small>
        </summary>
        <div className={styles.reasoningBody}>{message.reasoning}</div>
      </details>}
      {!!message.toolCalls?.length && <ToolCallLedger items={message.toolCalls} onAction={onAction} />}
      {showWork && active && message.model?.status === 'running' && !message.toolCalls?.length && <ReportWorkstation inline
        heading="正在等待模型返回" state={{ phase: 'writing', detail: message.model.service, completed: 0, total: 0 }} />}
      <ReplyBlocks lines={turn.lines} at={message.at} />
      {turn.cards?.map((card, i) => <Card key={i} card={card} message={message} onAction={onAction} onAnswer={onAnswer} writingModelStatus={writingModelStatus} />)}
      {!!turn.chips?.length && <div className={styles.chips}>
        {turn.chipsLabel && <span className={styles.chipsLabel}>{turn.chipsLabel}</span>}
        {turn.chips.map((chip, i) => <button key={i} type="button" className={`${styles.chip} ${chip.primary ? styles.chipPrimary : ''}`} onClick={() => onAction(chip.action)}>{chip.label}</button>)}
      </div>}
    </div>
  </div>;
}

const TOOL_STATE_LABEL: Record<ToolExecution['status'], string> = {
  running: '执行中',
  done: '已回传',
  awaiting_confirm: '待确认',
  error: '异常',
};

const plainLineText = (line: Line) => line.map((s) => s.text).join('');
const isTableRow = (raw: string) => /^\|.*\|$/u.test(raw.trim());
const isTableSeparator = (raw: string) => /^\|[\s:|-]+\|$/u.test(raw.trim());
const splitTableRow = (raw: string) => raw.trim().slice(1, -1).split('|').map((c) => c.trim());
const stripHeadingLine = (line: Line, prefixLen: number): Line => {
  const copy = [...line];
  if (!copy.length) return copy;
  copy[0] = { ...copy[0], text: copy[0].text.slice(prefixLen) };
  return copy.filter((s) => s.text.length > 0);
};

function ReplyBlocks({ lines, at }: { lines: Line[]; at: number }) {
  const nodes: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const raw = plainLineText(line).trim();
    if (!raw || /^---+$/.test(raw)) continue;

    // Markdown table block
    if (isTableRow(raw)) {
      const rows: string[][] = [];
      let hasHeader = false;
      while (i < lines.length) {
        const cur = plainLineText(lines[i]).trim();
        if (!isTableRow(cur)) break;
        if (isTableSeparator(cur)) {
          if (rows.length === 1) hasHeader = true;
        } else {
          rows.push(splitTableRow(cur));
        }
        i++;
      }
      i--;
      if (rows.length) {
        const header = hasHeader ? rows[0] : null;
        const bodyRows = hasHeader ? rows.slice(1) : rows;
        nodes.push(
          <div key={`tbl-${i}`} className={styles.replyTableWrap}>
            <table className={styles.replyTable}>
              {header && (
                <thead>
                  <tr>{header.map((cell, ci) => <th key={ci}>{cell}</th>)}</tr>
                </thead>
              )}
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
    }

    // Standalone display LaTeX block $$...$$ or multi-line $$ ... $$
    if (raw.startsWith('$$') && raw.endsWith('$$') && raw.length > 4) {
      nodes.push(<div key={`tex-${i}`} className={styles.replyFormula}><Formula tex={raw.slice(2, -2).trim()} compact copyable={false} /></div>);
      continue;
    }
    if (raw === '$$') {
      const texLines: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        const part = plainLineText(lines[j]).trim();
        if (part === '$$') { closed = true; break; }
        texLines.push(part);
        j++;
      }
      if (closed && texLines.length) {
        i = j;
        nodes.push(<div key={`texb-${i}`} className={styles.replyFormula}><Formula tex={texLines.join(' ')} compact copyable={false} /></div>);
        continue;
      }
    }

    // Markdown headings
    const headingMatch = /^(#{1,4})\s+/u.exec(plainLineText(line));
    if (headingMatch) {
      const level = headingMatch[1].length;
      const trimmedLine = stripHeadingLine(line, headingMatch[0].length);
      if (level <= 2) nodes.push(<h3 key={`h-${i}`} className={styles.replyH2}><Spans line={trimmedLine} at={at} /></h3>);
      else nodes.push(<h4 key={`h-${i}`} className={styles.replyH3}><Spans line={trimmedLine} at={at} /></h4>);
      continue;
    }

    // Blockquote lines
    if (/^>\s?/u.test(raw)) {
      const prefixMatch = /^>\s?/u.exec(plainLineText(line));
      const trimmedLine = prefixMatch ? stripHeadingLine(line, prefixMatch[0].length) : line;
      nodes.push(<blockquote key={`bq-${i}`} className={styles.replyQuote}><Spans line={trimmedLine} at={at} /></blockquote>);
      continue;
    }

    nodes.push(<p key={`p-${i}`}><Spans line={line} at={at} /></p>);
  }
  return <>{nodes}</>;
}

function formatToolArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  const entries = Object.entries(args).filter(([, value]) => value !== undefined && value !== '');
  return entries.map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ');
}

function ToolCallLedger({ items, onAction }: { items: ToolExecution[]; onAction: (action: AgentAction) => void }) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  const runningCount = items.filter((item) => item.status === 'running').length;
  return (
    <div className={styles.toolLedger} role="region" aria-label="工具调度轨迹">
      <div className={styles.toolLedgerHead}>
        <span className={styles.toolLedgerEyebrow}><i className={styles.toolLedgerGem} aria-hidden="true" />HARNESS · 工具调度台账</span>
        <span className={styles.toolLedgerCount}>
          {runningCount > 0 ? `正在调取 ${runningCount} / ${items.length} 项能力` : `已协调 ${items.length} 项证见工具`}
        </span>
      </div>
      <div className={styles.toolLedgerList}>
        {items.map((item) => {
          const open = !!openIds[item.id];
          const brief = formatToolArgs(item.args);
          const hasDetails = Boolean(item.resultText || (item.args && Object.keys(item.args).length > 0));
          return (
            <div key={item.id} className={styles.toolItem} data-status={item.status}>
              <div className={styles.toolRow}>
                <button
                  type="button"
                  className={styles.toolRowTrigger}
                  onClick={() => hasDetails && toggle(item.id)}
                  aria-expanded={hasDetails ? open : undefined}
                  disabled={!hasDetails}
                >
                  <span className={styles.toolBadge} aria-hidden="true">
                    {item.status === 'running' ? <i /> : item.status === 'done' ? <Icon name="check" /> : item.status === 'awaiting_confirm' ? '◆' : '!'}
                  </span>
                  <code className={styles.toolCode}>{item.tool}</code>
                  <span className={styles.toolName}>{item.label}</span>
                  {brief && <span className={styles.toolArgs}>{brief}</span>}
                  {item.summary && <span className={styles.toolSummaryText}>{item.summary}</span>}
                  <span className={styles.spacer} />
                  <span className={styles.toolMeta}>
                    {TOOL_STATE_LABEL[item.status]}
                    {item.durationMs !== undefined ? ` · ${item.durationMs}ms` : ''}
                  </span>
                  {hasDetails && <span className={styles.toolChevron}>{open ? '收起 ▴' : '详情 ▾'}</span>}
                </button>
                {item.action && (
                  <button type="button" className={styles.toolJump} onClick={() => onAction(item.action!)}>
                    定位 ↗
                  </button>
                )}
              </div>
              {open && (
                <div className={styles.toolDetail}>
                  {item.args && Object.keys(item.args).length > 0 && (
                    <div className={styles.toolDetailBlock}>
                      <span>调用参数</span>
                      <pre>{JSON.stringify(item.args, null, 2)}</pre>
                    </div>
                  )}
                  {item.resultText && (
                    <div className={styles.toolDetailBlock}>
                      <span>返回摘录</span>
                      <pre>{item.resultText}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STEP_STATE: Record<NonNullable<ModelCall['status']>, string> = { running: '进行中', ready: '完成', failed: '未完成', unknown: '待核对', refused: '未发出' };
/**
 * A model call as a step of the work: what it is doing, through which service, how long it has run and, once settled,
 * what it cost in tokens as the provider reported them.
 */
function StepHead({ model, at, active }: { model: ModelCall; at: number; active: boolean }) {
  const status = model.status === 'running' && !active ? 'unknown' : model.status ?? 'ready';
  return <div className={styles.stepHead} data-status={status}>
    <span className={styles.stepIcon} aria-hidden="true">{status === 'running' ? <i /> : status === 'ready' ? <Icon name="check" /> : '!'}</span>
    <span className={styles.stepText}>第 {model.step} 步 · {model.service}{model.modelName ? <small>{model.modelName}</small> : null}</span>
    <span className={styles.spacer} />
    <span className={styles.stepStatePill}>
      {status === 'running' ? <Elapsed since={at} /> : <span>{STEP_STATE[status]}{model.latencyMs ? ` · ${(model.latencyMs / 1000).toFixed(1)}s` : ''}</span>}
    </span>
    {model.usage && <span className={styles.stepCost} title="服务商报告的输入 / 输出 token">{usageText(model.usage)}</span>}
  </div>;
}
/** Seconds since a call was sent, while it is still running in this visit; a stale one from an earlier visit just says so. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return <span aria-live="off">{seconds > 600 ? '等待回执' : `已用 ${seconds} 秒`}</span>;
}

/** Numbers in a recorded step develop into gold; digits inside a fingerprint, a variable code or "SHA-256" stay plain. */
const NUMBER = /(?<![0-9A-Za-z.-])\d+(?:[.,]\d+)*%?(?![0-9A-Za-z])/gu;
function numbers(text: string): Line {
  const line: Line = [];
  let last = 0;
  for (const m of text.matchAll(NUMBER)) {
    if (m.index > last) line.push({ text: text.slice(last, m.index) });
    line.push({ text: m[0], mark: 'gold' });
    last = m.index + m[0].length;
  }
  if (last < text.length) line.push({ text: text.slice(last) });
  return line;
}

function Card({ card, message, onAction, onAnswer, writingModelStatus }: { card: AgentCard; message: Extract<Message, { role: 'agent' }> } & Handlers) {
  if (card.kind === 'entry') return <div className={`${styles.card} ${styles.entry}`}>
    <div className={styles.cardHead}><span className={styles.cardKindPill}>MIRROR</span><span className={styles.cardTitle}>知识镜 · {card.reviewed ? '已审核词条' : '待审核词条'}</span></div>
    <div className={styles.entryName}><strong>{card.name}</strong>{card.english && <span>{card.english}</span>}</div>
    <p>{card.definition}</p>
    {card.formula && <div className={styles.entryFormula}><Formula tex={card.formula} compact copyable={false} /></div>}
    {!!card.sources.length && <p className={styles.entrySources}>出处：{card.sources.join('；')}</p>}
    <div className={styles.cardLinks}><button type="button" className={styles.chip} onClick={() => onAction({ type: 'entry', id: card.id })}>展开词条 →</button></div>
  </div>;
  if (card.kind === 'confirm') return <Confirm card={card} message={message} onAction={onAction} onAnswer={onAnswer} />;
  if (card.kind === 'consent') return <ConsentCard messageId={message.id} card={card} at={message.at} />;
  if (card.kind === 'job') return <JobCard messageId={message.id} card={card} />;
  if (card.kind === 'proposal') return <ProposalView card={card} />;
  if (card.kind === 'chart-studio') return <div className={styles.card}><div className={styles.cardHead}><span className={styles.cardKindPill}>STUDIO</span><span className={styles.cardTitle}>{card.title}</span></div><ChartStudioView data={card.studio} onAction={onAction} /></div>;
  if (card.kind === 'code-studio') return <div className={styles.card}><div className={styles.cardHead}><span className={styles.cardKindPill}>STUDIO</span><span className={styles.cardTitle}>{card.title}</span></div><CodeStudioView data={card.studio} onAction={onAction} /></div>;
  if (card.kind === 'writing-studio') return <div className={styles.card}><div className={styles.cardHead}><span className={styles.cardKindPill}>STUDIO</span><span className={styles.cardTitle}>{card.title}</span></div><WritingStudioView data={card.studio} onAction={onAction} modelStatus={writingModelStatus} /></div>;
  if (card.kind === 'trace') return <div className={`${styles.card} ${styles.trace}`}>
    <div className={styles.cardHead}><span className={styles.cardKindPill}>TRACE</span><span className={styles.cardTitle}>回溯 · {card.reference}</span></div>
    <p className={styles.traceHead}><b>{card.reference}</b>{card.title}</p>
    <ol className={styles.path} aria-label="光路：从图表回到来处">
      {card.steps.map((step, i) => <li key={i} data-kind={step.kind}>
        <b aria-hidden="true">◀──</b>
        <div><strong><Spans line={numbers(step.text)} at={message.at} /></strong><small><Spans line={numbers(step.detail)} at={message.at} /></small></div>
      </li>)}
    </ol>
    <p className={styles.origin}><b aria-hidden="true">◉</b>来处</p>
  </div>;
  const maxCols = card.columns ? Math.max(1, ...card.lines.map(l => l.length)) : 1;
  const gridColumns = maxCols === 1
    ? 'minmax(0, 1fr)'
    : maxCols === 2
      ? 'fit-content(140px) minmax(0, 1fr)'
      : `repeat(${maxCols - 1}, fit-content(24%)) minmax(0, 1fr)`;
  return <div className={styles.card}>
    <div className={styles.cardHead}><span className={styles.cardKindPill}>PANEL</span><span className={styles.cardTitle}>{card.title}</span></div>
    {card.columns ? <div className={styles.cardGrid} style={{ gridTemplateColumns: gridColumns }}>
      {card.lines.map((line, i) => <p key={i}>{line.map((span, j) => <span key={j}><Spans line={[span]} at={message.at} /></span>)}</p>)}
    </div> : <div className={styles.cardLines}>{card.lines.map((line, i) => <p key={i}><Spans line={line} at={message.at} /></p>)}</div>}
    {!!card.links?.length && <div className={styles.cardLinks}>
      {card.links.map((link, i) => <button key={i} type="button" className={styles.chip} onClick={() => onAction(link.action)}>{link.label} →</button>)}
    </div>}
  </div>;
}

/** A double frame: the agent does nothing here until the user says yes. */
function Confirm({ card, message, onAnswer }: { card: Extract<AgentCard, { kind: 'confirm' }>; message: Extract<Message, { role: 'agent' }> } & Handlers) {
  const ref = useRef<HTMLDivElement>(null), open = !message.answered;
  // A new question takes the keyboard so y / n answer it at once; one restored from earlier does not.
  useEffect(() => { if (open && Date.now() - message.at < 1500) ref.current?.focus(); }, [open, message.at]);
  const key = (event: KeyboardEvent) => {
    if (!open || event.target !== event.currentTarget) return;
    if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); onAnswer(message.id, 'confirmed', card.confirm.action); }
    if (event.key === 'n' || event.key === 'N' || event.key === 'Escape') { event.preventDefault(); onAnswer(message.id, 'cancelled'); }
  };
  return <div ref={ref} className={`${styles.card} ${styles.confirm}`} tabIndex={open ? 0 : -1} role="group" aria-label={`需要你确认：${card.title}`} onKeyDown={key}>
    <div className={styles.cardHead}><span className={styles.cardKindPill}>GATE</span><span className={styles.cardTitle}>需要你确认 · {card.title}</span></div>
    <div className={styles.cardLines}>{card.lines.map((line, i) => <p key={i}><Spans line={line} at={message.at} /></p>)}</div>
    {open ? <div className={styles.cardLinks}>
      <button type="button" className={`${styles.chip} ${styles.chipPrimary}`} onClick={() => onAnswer(message.id, 'confirmed', card.confirm.action)}>{card.confirm.label}（y）</button>
      <button type="button" className={styles.chip} onClick={() => onAnswer(message.id, 'cancelled')}>{card.cancel}（n）</button>
    </div> : <p className={styles.answered}>{message.answered === 'confirmed' ? `已${card.confirm.label}` : `已${card.cancel}`}</p>}
  </div>;
}
