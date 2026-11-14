'use client';

import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { usageText } from '@/lib/agent/chat';
import { Formula } from '@/components/math/Tex';
import type { AgentAction, AgentCard, Line } from '@/lib/agent/router';
import { ConsentCard, JobCard, ProposalView } from './generation';
import { Spans } from './Glyphs';
import { Icon } from './icons';
import { ChartStudioView, CodeStudioView, WritingStudioView } from './StudioCards';
import ReportWorkstation from '@/components/figures/report-workstation/ReportWorkstation';
import type { Message, ModelCall } from './threads';
import styles from './AgentShell.module.css';

type Handlers = { onAction: (action: AgentAction) => void; onAnswer: (id: string, answer: 'confirmed' | 'cancelled', action?: AgentAction) => void };

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

function MessageView({ message, active, showWork, onAction, onAnswer }: { message: Message; active: boolean; showWork: boolean } & Handlers) {
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
      {showWork && active && message.model?.status === 'running' && <ReportWorkstation inline
        heading="正在等待模型返回" state={{ phase: 'writing', detail: message.model.service, completed: 0, total: 0 }} />}
      {turn.lines.map((line, i) => <p key={i}><Spans line={line} at={message.at} /></p>)}
      {turn.cards?.map((card, i) => <Card key={i} card={card} message={message} onAction={onAction} onAnswer={onAnswer} />)}
      {!!turn.chips?.length && <div className={styles.chips}>
        {turn.chipsLabel && <span className={styles.chipsLabel}>{turn.chipsLabel}</span>}
        {turn.chips.map((chip, i) => <button key={i} type="button" className={`${styles.chip} ${chip.primary ? styles.chipPrimary : ''}`} onClick={() => onAction(chip.action)}>{chip.label}</button>)}
      </div>}
    </div>
  </div>;
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
    {status === 'running' ? <Elapsed since={at} /> : <span>{STEP_STATE[status]}</span>}
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

function Card({ card, message, onAction, onAnswer }: { card: AgentCard; message: Extract<Message, { role: 'agent' }> } & Handlers) {
  if (card.kind === 'entry') return <div className={`${styles.card} ${styles.entry}`}>
    <span className={styles.cardTitle}>知识镜 · {card.reviewed ? '已审核词条' : '待审核词条'}</span>
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
  if (card.kind === 'chart-studio') return <div className={styles.card}><span className={styles.cardTitle}>{card.title}</span><ChartStudioView data={card.studio} onAction={onAction} /></div>;
  if (card.kind === 'code-studio') return <div className={styles.card}><span className={styles.cardTitle}>{card.title}</span><CodeStudioView data={card.studio} onAction={onAction} /></div>;
  if (card.kind === 'writing-studio') return <div className={styles.card}><span className={styles.cardTitle}>{card.title}</span><WritingStudioView data={card.studio} onAction={onAction} /></div>;
  if (card.kind === 'trace') return <div className={`${styles.card} ${styles.trace}`}>
    <span className={styles.cardTitle}>回溯 · {card.reference}</span>
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
    <span className={styles.cardTitle}>{card.title}</span>
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
    <span className={styles.cardTitle}>需要你确认 · {card.title}</span>
    <div className={styles.cardLines}>{card.lines.map((line, i) => <p key={i}><Spans line={line} at={message.at} /></p>)}</div>
    {open ? <div className={styles.cardLinks}>
      <button type="button" className={`${styles.chip} ${styles.chipPrimary}`} onClick={() => onAnswer(message.id, 'confirmed', card.confirm.action)}>{card.confirm.label}（y）</button>
      <button type="button" className={styles.chip} onClick={() => onAnswer(message.id, 'cancelled')}>{card.cancel}（n）</button>
    </div> : <p className={styles.answered}>{message.answered === 'confirmed' ? `已${card.confirm.label}` : `已${card.cancel}`}</p>}
  </div>;
}
