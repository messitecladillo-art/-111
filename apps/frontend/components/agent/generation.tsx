'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { parseCollection, parseProject, parseService, type Project, type Proposal, type Service } from '@evix/shared';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { downloadQuestionnaire, hostedRequest, HostedApiError } from '@/components/hosted/api-client';
import { createQuestionnaireRepository } from '@/components/hosted/questionnaire-repository';
import { createQuestionnaireProposalRepository, QuestionnaireProposalError } from '@/components/hosted/questionnaire-proposal-repository';
import type { AgentQuestionnaireProposal } from '@/lib/agent-questionnaire-proposal';
import type { AgentCard, AgentTurn, Mark, Span } from '@/lib/agent/router';
import type { RoomId } from '@/lib/agent/rooms';
import { QUESTION_TYPES } from '@/lib/questionnaire';
import { isDefiniteGenerationRejection, prepareQuestionnaireGeneration, type QuestionnaireGenerationRequest } from '@/lib/questionnaire-proposals';
import { stamp, threads } from './threads';
import styles from './AgentShell.module.css';

/**
 * 起草问卷: the agent's first tool that calls a model — the user's own service, through the hosted project API.
 * Nothing is sent before the user confirms the brief, the project and the service in a double frame. The call is
 * idempotent: when its outcome is unknown the original request is kept, and checking it replays that request exactly,
 * so no second charge arises. The result is a proposal saved in the project; it changes nothing until the user applies
 * it in 问卷设计.
 */
type Consent = Extract<AgentCard, { kind: 'consent' }>;
type Job = Extract<AgentCard, { kind: 'job' }>;
type ProposalCard = Extract<AgentCard, { kind: 'proposal' }>;
type Lists = { state: 'idle' | 'loading' | 'ready' | 'error'; projects: Project[]; services: Service[]; error: string };
export type Generation = {
  account: 'loading' | 'guest' | 'ready';
  lists: Lists;
  busy: boolean;
  /** The service the composer's model chip points at; the consent card starts from it. */
  preferredService: string;
  prefer: (serviceId: string) => void;
  load: () => void;
  start: (brief: string) => AgentTurn;
  submit: (messageId: string, input: { brief: string; projectId: string; serviceId: string }) => void;
  cancel: (messageId: string) => void;
  reconcile: (messageId: string) => void;
  bring: (card: ProposalCard) => void;
};

export const BRIEF_LIMIT = 6000;
const EMPTY: Lists = { state: 'idle', projects: [], services: [], error: '' };
const t = (text: string, mark?: Mark): Span => mark ? { text, mark } : { text };
const reason = (failure: unknown) => failure instanceof Error ? failure.message : '模型调用未完成。';
/** Only a rejection the server answered before any model call is definite; anything else may have run. */
const definite = (failure: unknown) => failure instanceof QuestionnaireProposalError && failure.phase === 'request'
  && failure.cause instanceof HostedApiError && isDefiniteGenerationRejection(failure.cause.status, failure.cause.code);

function patchCard<K extends AgentCard['kind']>(messageId: string, kind: K, change: (card: Extract<AgentCard, { kind: K }>) => Extract<AgentCard, { kind: K }>) {
  threads.patch(messageId, m => m.role === 'agent' && m.turn.cards
    ? { ...m, turn: { ...m.turn, cards: m.turn.cards.map(c => c.kind === kind ? change(c as Extract<AgentCard, { kind: K }>) : c) } } : m);
}
/** A finished or failed call drops its request; only an unknown outcome keeps it for an exact replay. */
function setJob(messageId: string, status: Job['status'], detail: string, request?: QuestionnaireGenerationRequest) {
  patchCard(messageId, 'job', card => {
    const next: Job = { ...card, status, detail };
    if (request) next.request = request; else delete next.request;
    return next;
  });
}
/** A reply goes to the conversation the call came from, even if the user has opened another one since. */
const reply = (afterId: string, turn: AgentTurn) => threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn });

const GenerationContext = createContext<Generation | null>(null);
export const GenerationProvider = GenerationContext.Provider;

export function useGeneration(onProposal: (proposal: AgentQuestionnaireProposal) => void, openRoom: (room: RoomId) => void): Generation {
  const { session, loading, identityEpoch, isCurrentAccount, mutate } = useHostedSession();
  const owner = session?.authenticated ? session.user?.id ?? '' : '';
  const account: Generation['account'] = loading ? 'loading' : owner ? 'ready' : 'guest';
  const [lists, setLists] = useState<Lists>(EMPTY);
  const [preferredService, prefer] = useState('');
  // Another account never sees the previous account's projects or services, nor its choice of service.
  const [listsFor, setListsFor] = useState(`${owner}:${identityEpoch}`);
  if (listsFor !== `${owner}:${identityEpoch}`) { setListsFor(`${owner}:${identityEpoch}`); setLists(EMPTY); prefer(''); }
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const release = useCallback(() => { lock.current = false; setBusy(false); }, []);
  const transport = useMemo(() => ({ read: hostedRequest, mutate }), [mutate]);

  const load = useCallback(() => {
    if (!owner || lists.state === 'loading' || lists.state === 'ready') return;
    const epoch = identityEpoch, current = () => isCurrentAccount(owner, epoch);
    setLists(value => ({ ...value, state: 'loading', error: '' }));
    Promise.all([hostedRequest('/api/projects'), hostedRequest('/api/services')])
      .then(([projects, services]) => {
        if (current()) setLists({ state: 'ready', projects: parseCollection(projects, 'projects', parseProject), services: parseCollection(services, 'services', parseService, 8).filter(s => s.capabilities.includes('questionnaire')), error: '' });
      })
      .catch(failure => { if (current()) setLists(value => ({ ...value, state: 'error', error: reason(failure) })); });
  }, [owner, identityEpoch, isCurrentAccount, lists.state]);

  const start = useCallback((brief: string): AgentTurn => account === 'guest'
    ? { lines: [[t('起草问卷要调用你自己的模型服务，结果存进你的项目，所以需要先登录。')], [t('登录后再说一次，我会先请你确认要发送的内容。', 'dim')]],
      chips: [{ label: '邮箱登录 ↗', action: { type: 'href', href: '/login' }, primary: true }] }
    : { lines: [[t('可以。我会先读取项目当前的问卷版本，再用你选的模型服务起草一份问卷建议。')],
        [t('发送给服务商的只有下面这段研究需求；费用按你的服务商用量计。结果存为项目里的模型提案，不改动现有问卷。', 'dim')]],
      cards: [{ kind: 'consent', brief: brief.slice(0, BRIEF_LIMIT), state: 'open' }] }, [account]);

  const finish = useCallback((jobId: string, projectId: string, proposal: Proposal, request: QuestionnaireGenerationRequest, service: { label: string; model: string }) => {
    if (proposal.status === 'ready' && proposal.design) {
      const design = proposal.design, n = design.questions.length;
      setJob(jobId, 'done', `已起草「${design.title || '未命名问卷'}」· ${n} 题 · 基于问卷 v${proposal.inputRevision}`);
      reply(jobId, {
        lines: [[t(`模型拟了 ${n} 道题。`), t('它还只是建议：带进问卷设计审阅，确认应用后才成为你的设计。', 'dim')]],
        cards: [{ kind: 'proposal', projectId, proposalId: proposal.id, serviceId: proposal.serviceId, serviceRevision: proposal.serviceRevision, serviceLabel: service.label, model: service.model, inputRevision: proposal.inputRevision, design }],
      });
    } else if (proposal.status === 'failed') {
      setJob(jobId, 'failed', `模型没有完成本次起草${proposal.errorCode ? `（${proposal.errorCode}）` : ''}；项目问卷没有变化。`);
    } else {
      setJob(jobId, 'unknown', '模型仍在处理或结果尚未明确。原请求已保留，稍后核对只会重放同一请求，不会产生新的模型费用。', request);
    }
  }, []);

  const run = useCallback(async (jobId: string, projectId: string, request: QuestionnaireGenerationRequest, service: { label: string; model: string }, current: () => boolean) => {
    try {
      const proposal = await createQuestionnaireProposalRepository(projectId, transport).generate(request, current);
      if (current() && proposal) finish(jobId, projectId, proposal, request, service);
    } catch (failure) {
      if (!current()) return;
      if (definite(failure)) setJob(jobId, 'failed', `本次起草没有启动：${reason(failure)}`);
      else setJob(jobId, 'unknown', `调用结果尚未明确：${reason(failure)} 原请求已保留；核对只重放同一请求，不会产生新的模型费用。`, request);
    } finally { release(); }
  }, [transport, finish, release]);

  const submit = useCallback((messageId: string, input: { brief: string; projectId: string; serviceId: string }) => {
    const brief = input.brief.trim(), project = lists.projects.find(p => p.id === input.projectId), service = lists.services.find(s => s.id === input.serviceId);
    if (lock.current || !owner || !brief || brief.length > BRIEF_LIMIT || !project || !service) return;
    lock.current = true;
    setBusy(true);
    const epoch = identityEpoch, current = () => isCurrentAccount(owner, epoch);
    patchCard(messageId, 'consent', card => ({ ...card, state: 'submitted', brief, projectId: project.id, projectTitle: project.title, serviceId: service.id, serviceLabel: service.label }));
    const job = { ...stamp(), role: 'agent' as const, turn: { lines: [[t('开始起草。')]], cards: [{ kind: 'job' as const, status: 'running' as const, detail: '正在读取项目当前的问卷版本…', projectId: project.id, serviceLabel: service.label, model: service.model }] } };
    threads.appendAfter(messageId, job);
    threads.file(messageId, project.id);
    void (async () => {
      let revision: number;
      try {
        const head = await createQuestionnaireRepository(project.id, transport).head(current);
        if (head === undefined || !current()) { release(); return; }
        revision = head?.revision ?? 0;
      } catch (failure) {
        if (current()) setJob(job.id, 'failed', `无法读取项目当前的问卷版本，本次没有调用模型：${reason(failure)}`);
        release();
        return;
      }
      let request: QuestionnaireGenerationRequest;
      try { request = prepareQuestionnaireGeneration(service, brief, revision, true); }
      catch (failure) { if (current()) setJob(job.id, 'failed', reason(failure)); release(); return; }
      setJob(job.id, 'running', '正在调用模型起草问卷…', request);
      await run(job.id, project.id, request, { label: service.label, model: service.model }, current);
    })();
  }, [lists, owner, identityEpoch, isCurrentAccount, transport, run, release]);

  const reconcile = useCallback((messageId: string) => {
    const message = threads.find(messageId);
    const job = message?.role === 'agent' ? message.turn.cards?.find((c): c is Job => c.kind === 'job') : undefined;
    if (lock.current || !owner || !job?.request) return;
    lock.current = true;
    setBusy(true);
    const epoch = identityEpoch, current = () => isCurrentAccount(owner, epoch);
    setJob(messageId, 'running', '正在核对原请求…', job.request);
    void run(messageId, job.projectId, job.request, { label: job.serviceLabel, model: job.model }, current);
  }, [owner, identityEpoch, isCurrentAccount, run]);

  const cancel = useCallback((messageId: string) => patchCard(messageId, 'consent', card => ({ ...card, state: 'cancelled' })), []);
  const bring = useCallback((card: ProposalCard) => {
    onProposal({ id: card.proposalId, serviceId: card.serviceId, serviceRevision: card.serviceRevision, model: card.model, design: card.design });
    openRoom('design');
  }, [onProposal, openRoom]);

  return useMemo(() => ({ account, lists, busy, preferredService, prefer, load, start, submit, cancel, reconcile, bring }), [account, lists, busy, preferredService, load, start, submit, cancel, reconcile, bring]);
}

/** The double frame: what is sent, where it is saved, and which service runs it. Nothing runs until 起草 (y). */
export function ConsentCard({ messageId, card, at }: { messageId: string; card: Consent; at: number }) {
  const g = useContext(GenerationContext);
  const [brief, setBrief] = useState(card.brief);
  const [projectId, setProjectId] = useState('');
  const [serviceId, setServiceId] = useState('');
  // The conversation's project is followed as it changes, so filing it elsewhere moves the default with it.
  const filed = useSyncExternalStore(threads.subscribe, () => threads.projectOf(messageId), () => null);
  const ref = useRef<HTMLDivElement>(null), open = card.state === 'open';
  const load = g?.load;
  useEffect(() => { if (open) load?.(); }, [open, load]);
  useEffect(() => { if (open && Date.now() - at < 1500) ref.current?.focus(); }, [open, at]);
  if (!g) return null;
  const { projects, services } = g.lists;
  // The conversation's own project comes first, as the preferred service does.
  const project = [projectId, filed].find(id => projects.some(p => p.id === id)) ?? projects[0]?.id ?? '';
  const service = [serviceId, g.preferredService].find(id => services.some(s => s.id === id)) ?? services[0]?.id ?? '';
  const ready = open && g.account === 'ready' && g.lists.state === 'ready' && !!brief.trim() && brief.length <= BRIEF_LIMIT && !!project && !!service && !g.busy;
  const submit = () => { if (ready) g.submit(messageId, { brief, projectId: project, serviceId: service }); };
  const key = (event: KeyboardEvent) => {
    if (!open || event.target !== event.currentTarget) return;
    if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); submit(); }
    if (event.key === 'n' || event.key === 'N' || event.key === 'Escape') { event.preventDefault(); g.cancel(messageId); }
  };
  return <div ref={ref} className={`${styles.card} ${styles.confirm}`} role="group" aria-label="需要你确认：调用模型起草问卷" tabIndex={open ? 0 : -1} onKeyDown={key}>
    <span className={styles.cardTitle}>需要你确认 · 调用模型起草问卷</span>
    {open ? <div className={styles.consentForm}>
      <label className={styles.field}><span>研究需求</span>
        <textarea value={brief} maxLength={BRIEF_LIMIT} rows={3} placeholder="例如：了解甲区居民对社区体育设施的使用与满意度，为设施改造排序。" onChange={event => setBrief(event.target.value)} />
        <small>{brief.length} / {BRIEF_LIMIT}</small>
      </label>
      {g.account !== 'ready' ? <p className={styles.fieldNote}>正在核对登录状态…</p>
        : g.lists.state === 'error' ? <p className={styles.fieldError}>读取项目与模型服务失败：{g.lists.error} <button type="button" className={styles.chip} onClick={g.load}>重试</button></p>
        : g.lists.state !== 'ready' ? <p className={styles.fieldNote}>正在读取你的项目与模型服务…</p>
        : <>
          <label className={styles.field}><span>保存到项目</span>
            {projects.length ? <select value={project} onChange={event => setProjectId(event.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
              : <span className={styles.fieldNote}>还没有项目。<Link href="/projects">新建项目 ↗</Link></span>}
          </label>
          <label className={styles.field}><span>模型服务</span>
            {services.length ? <select value={service} onChange={event => setServiceId(event.target.value)}>{services.map(s => <option key={s.id} value={s.id}>{s.label} · {s.model}</option>)}</select>
              : <span className={styles.fieldNote}>还没有能起草问卷的模型服务。<Link href="/services">接入模型 ↗</Link></span>}
          </label>
        </>}
      <p className={styles.scope}>发送范围：只有上面这段研究需求与你的模型配置。生成结果存为项目里的模型提案，不会改动现有问卷。</p>
      <div className={styles.cardLinks}>
        <button type="button" className={`${styles.chip} ${styles.chipPrimary}`} disabled={!ready} onClick={submit}>起草（y）</button>
        <button type="button" className={styles.chip} onClick={() => g.cancel(messageId)}>取消（n）</button>
      </div>
    </div> : <p className={styles.answered}>{card.state === 'submitted' ? `已确认：保存到「${card.projectTitle ?? '项目'}」，由 ${card.serviceLabel ?? '所选服务'} 起草。` : '已取消，没有调用模型。'}</p>}
  </div>;
}

const JOB_MARK: Record<Job['status'], string> = { running: '◌', done: '✓', failed: '✕', unknown: '?' };
/** A model call as it happens. An unknown outcome offers a check that replays the original request. */
export function JobCard({ messageId, card }: { messageId: string; card: Job }) {
  const g = useContext(GenerationContext);
  return <div className={`${styles.card} ${styles.job}`} data-status={card.status}>
    <span className={styles.cardTitle}>工具 · 起草问卷 · {card.serviceLabel}</span>
    <p className={styles.jobLine}><b aria-hidden="true">{JOB_MARK[card.status]}</b><span>{card.detail}</span></p>
    {card.status === 'unknown' && card.request && <div className={styles.cardLinks}>
      <button type="button" className={styles.chip} disabled={!g || g.busy} onClick={() => g?.reconcile(messageId)}>核对原请求</button>
    </div>}
  </div>;
}

/** The model's questionnaire as proposed: its stems in cyan, since nothing in it is verified until 问卷设计 applies it. */
export function ProposalView({ card }: { card: ProposalCard }) {
  const g = useContext(GenerationContext), d = card.design;
  return <div className={`${styles.card} ${styles.proposal}`}>
    <span className={styles.cardTitle}>模型提案 · 待审阅</span>
    <p className={styles.proposalTitle}>{d.title || '未命名问卷'}</p>
    {!!d.objective.trim() && <p className={styles.proposalMeta}>{d.objective}</p>}
    {!!d.population.trim() && <p className={styles.proposalMeta}>调查对象：{d.population}</p>}
    <ol className={styles.proposalItems}>{d.questions.map(q => <li key={q.id}><span>{q.text}</span><small>{QUESTION_TYPES[q.type]}</small></li>)}</ol>
    <p className={styles.proposalFoot}>AI 拟议 · 尚未预测试 · {card.serviceLabel}（{card.model}）· 基于问卷 v{card.inputRevision}</p>
    <div className={styles.cardLinks}>
      <button type="button" className={`${styles.chip} ${styles.chipPrimary}`} disabled={!g} onClick={() => g?.bring(card)}>带入问卷设计审阅 →</button>
      <Link className={styles.chip} href={`/projects/${encodeURIComponent(card.projectId)}`}>在项目中打开 ↗</Link>
      <button type="button" className={styles.chip} onClick={() => downloadQuestionnaire(d, `${(d.title || '问卷提案').replace(/[\\/:*?"<>|]/g, '-')}.json`)}>下载 JSON</button>
    </div>
  </div>;
}
