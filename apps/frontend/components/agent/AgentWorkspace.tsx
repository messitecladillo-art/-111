'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type UIEvent as ReactUIEvent } from 'react';
import { parseCollection, parseProject, parseService, type Proposal, type Project, type Service } from '@evix/shared';
import BrandMark from '@/components/brand/BrandMark';
import MirrorRoom from './MirrorRoom';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { downloadQuestionnaire, errorMessage, hostedRequest, HostedApiError } from '@/components/hosted/api-client';
import { createQuestionnaireRepository } from '@/components/hosted/questionnaire-repository';
import { createQuestionnaireProposalRepository, QuestionnaireProposalError } from '@/components/hosted/questionnaire-proposal-repository';
import { NavIcon, ThemeProvider, ThemeToggle, useThemePreference, type Theme } from '@/components/workbench/shell-kit';
import { isDefiniteGenerationRejection, prepareQuestionnaireGeneration } from '@/lib/questionnaire-proposals';
import {
  appendAgentMessage, assistantText, classifyAgentIntent, consentMessage, createAgentSession, deleteAgentSession,
  filterSessions, formatRelativeTime, groupSessionsByDay, loadActiveSessionId, loadAgentSessions, localReply,
  newAgentId, nowIso, questionnaireToolMessage, saveActiveSessionId, saveAgentSession, saveSessionIndex,
  updateAgentMessage, userMessage,
  type AgentArtifact, type AgentMessage, type AgentSession, type AgentToolStatus, type PendingGeneration,
} from '@/lib/agent-workspace';
import styles from './AgentWorkspace.module.css';

type PanelTab = 'artifacts' | 'plan' | 'context';
type ServiceState = 'idle' | 'loading' | 'ready' | 'error';
type ProjectState = 'idle' | 'loading' | 'ready' | 'error';

const QUICK_PROMPTS = [
  { label: '生成问卷', hint: '进入模型确认与可编辑提案', prompt: '帮我设计一份研究问卷。研究主题是【填写主题】，目标人群是【填写人群】，希望了解【核心问题】与【决策因素】。' },
  { label: '缩小选题', hint: '比较研究方向与首周验证', prompt: '帮我比较两个选题方向的研究价值与实施难度，并给出第一周验证计划。' },
  { label: '检查数据', hint: '前往数据质量与分析入口', prompt: '我想在项目里检查数据质量并做量表信度分析。' },
  { label: '准备答辩', hint: '梳理追问、证据与演练入口', prompt: '帮我梳理答辩中评委可能追问的问题和对应证据。' },
];

const PIPELINE = [
  { label: '选题与研究简报', note: '澄清问题、地区与资源' },
  { label: '问卷设计', note: '题项、变量与版本' },
  { label: '发布与回收', note: '真实答卷与导出' },
  { label: '数据分析', note: '质量、统计与图表' },
  { label: '报告与 PPT', note: '章节、版式与导出' },
  { label: '路演与答辩', note: '追问、计时与证据' },
];

const TOOL_STATUS: Record<AgentToolStatus, string> = { running: '[调用中]', done: '[已完成]', failed: '[未启动]', unknown: '[待核对]' };

function serviceCanQuestionnaire(service: Service) { return service.capabilities.includes('questionnaire'); }
function failureText(value: unknown) { return value instanceof Error ? value.message : '模型调用未完成。'; }
function isDefiniteFailure(value: unknown) {
  return value instanceof QuestionnaireProposalError
    && value.phase === 'request'
    && value.cause instanceof HostedApiError
    && isDefiniteGenerationRejection(value.cause.status, value.cause.code);
}
function failureCode(value: unknown) { return value instanceof QuestionnaireProposalError && value.cause instanceof HostedApiError ? value.cause.code : undefined; }

function patchTool(session: AgentSession, toolId: string, status: AgentToolStatus, detail: string, errorCode?: string): AgentSession {
  return {
    ...session,
    pending: status === 'running' || status === 'unknown' ? session.pending : null,
    messages: session.messages.map(message => message.role === 'assistant' && message.kind === 'tool' && message.id === toolId
      ? { ...message, status, detail, ...(errorCode ? { errorCode } : {}), ...(status === 'unknown' ? { canReconcile: true } : {}) }
      : message),
    updatedAt: nowIso(),
  };
}

function artifactFromProposal(proposal: Proposal, serviceLabel: string): AgentArtifact | null {
  const design = proposal.design;
  if (!design) return null;
  return {
    kind: 'questionnaire', id: proposal.id, title: design.title || '未命名问卷提案', objective: design.objective || '',
    questionCount: design.questions.length, inputRevision: proposal.inputRevision, serviceLabel, createdAt: proposal.createdAt,
    design, questions: design.questions.map(question => ({ id: question.id, text: question.text, type: question.type })),
  };
}

export default function AgentWorkspace() {
  const auth = useHostedSession();
  const theme = useThemePreference();
  return <ThemeProvider value={theme}>
    {auth.loading ? <AgentBoot theme={theme}/> : <AgentWorkspaceSession key={`${auth.session?.user?.id ?? 'guest'}:${auth.identityEpoch}`} theme={theme}/>}
  </ThemeProvider>;
}

function AgentBoot({ theme }: { theme: Theme }) {
  return <div className="workbench agent-app" data-theme={theme} aria-busy="true">
    <div className={styles.shell}>
      <aside className={styles.rail}><BrandMark size={30}/></aside>
      <aside className={styles.sessions}><div className={styles.bootPane}><span/><span/><span className={styles.lineShort}/></div></aside>
      <main className={styles.main}><div className={styles.bootThread}><span/><span/><span className={styles.lineShort}/></div></main>
      <aside className={styles.artifacts}><div className={styles.bootPane}><span/><span/><span/></div></aside>
    </div>
  </div>;
}

function AgentWorkspaceSession({ theme }: { theme: Theme }) {
  const auth = useHostedSession();
  const { session: account, identityEpoch, isCurrentAccount, mutate, logout } = auth;
  const ownerId = account?.user?.id ?? '';
  const authenticated = Boolean(account?.authenticated && ownerId);
  const [loaded, setLoaded] = useState(false);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectState, setProjectState] = useState<ProjectState>('idle');
  const [services, setServices] = useState<Service[]>([]);
  const [serviceState, setServiceState] = useState<ServiceState>('idle');
  const [headRevision, setHeadRevision] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [preferredServiceId, setPreferredServiceId] = useState('');
  const [intentMenuOpen, setIntentMenuOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [panelTab, setPanelTab] = useState<PanelTab>('artifacts');
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [roomTransition, setRoomTransition] = useState(false);
  const [sendPulse, setSendPulse] = useState(false);
  const [freshArtifact, setFreshArtifact] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const roomTimer = useRef<number | null>(null);
  const pulseTimer = useRef<number | null>(null);
  const freshTimer = useRef<number | null>(null);
  const intentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastSessionId = useRef<string | null>(null);

  const activeSession = sessions.find(session => session.id === activeId) ?? null;
  const activeProject = activeSession?.projectId ? projects.find(project => project.id === activeSession.projectId) ?? null : null;
  const messages = activeSession?.messages ?? [];
  const artifacts = activeSession?.artifacts ?? [];
  const pending = activeSession?.pending ?? null;
  const questionnaireServices = useMemo(() => services.filter(serviceCanQuestionnaire), [services]);
  const selectedServiceId = questionnaireServices.some(service => service.id === preferredServiceId) ? preferredServiceId : questionnaireServices[0]?.id ?? '';
  const selectedService = questionnaireServices.find(service => service.id === selectedServiceId) ?? null;
  const composerPlaceholder = generating
    ? '正在等待回执；可以先起草下一条消息…'
    : pending
      ? '先核对上一条调用；也可以继续起草…'
      : !activeProject
        ? '先在顶部绑定项目，再描述研究任务…'
        : !questionnaireServices.length
          ? '描述研究任务；生成问卷前需要配置模型服务…'
          : '描述你想推进的研究任务，或点击 + 选择一个意图…';
  const visibleSessions = useMemo(() => filterSessions(sessions, query), [sessions, query]);
  const groups = useMemo(() => groupSessionsByDay(visibleSessions), [visibleSessions]);
  const projectName = useCallback((projectId: string | null) => projects.find(project => project.id === projectId)?.title ?? (projectId ? '项目不可用' : '未绑定项目'), [projects]);

  useEffect(() => {
    if (!authenticated) { setSessions([]); setActiveId(null); setLoaded(true); return; }
    const rows = loadAgentSessions(ownerId);
    const last = loadActiveSessionId(ownerId);
    const initial = last && rows.some(session => session.id === last) ? rows.find(session => session.id === last)! : rows[0] ?? null;
    setSessions(rows);
    setActiveId(initial?.id ?? null);
    setDraft(initial?.draft ?? '');
    setLoaded(true);
  }, [authenticated, ownerId]);

  useEffect(() => {
    if (!authenticated || !loaded || sessions.length) return;
    const session = createAgentSession(ownerId, null);
    setSessions([session]);
    setActiveId(session.id);
    setDraft('');
  }, [authenticated, loaded, ownerId, sessions.length]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    setProjectState('loading');
    setServiceState('loading');
    void (async () => {
      try {
        const raw = await hostedRequest('/api/projects');
        if (cancelled) return;
        setProjects(parseCollection(raw, 'projects', parseProject));
        setProjectState('ready');
      } catch { if (!cancelled) setProjectState('error'); }
    })();
    void (async () => {
      try {
        const raw = await hostedRequest('/api/services');
        if (cancelled) return;
        setServices(parseCollection(raw, 'services', parseService, 8));
        setServiceState('ready');
      } catch { if (!cancelled) setServiceState('error'); }
    })();
    return () => { cancelled = true; };
  }, [authenticated, identityEpoch]);

  const activeProjectId = activeSession?.projectId ?? null;
  useEffect(() => {
    setHeadRevision(null);
    if (!authenticated || !activeProjectId) return;
    let cancelled = false;
    const repository = createQuestionnaireRepository(activeProjectId, { read: hostedRequest, mutate });
    repository.head(() => !cancelled)
      .then(head => { if (!cancelled) setHeadRevision(head?.revision ?? 0); })
      .catch(() => { if (!cancelled) setHeadRevision(null); });
    return () => { cancelled = true; };
  }, [activeProjectId, authenticated, mutate, identityEpoch]);

  useEffect(() => {
    if (!authenticated || !loaded || !ownerId) return;
    const timer = setTimeout(() => {
      let stored = true;
      for (const session of sessions) stored = saveAgentSession(session) && stored;
      stored = saveSessionIndex(ownerId, sessions) && stored;
      saveActiveSessionId(ownerId, activeId);
      if (!stored) setStorageBlocked(true);
    }, 120);
    return () => clearTimeout(timer);
  }, [sessions, activeId, authenticated, loaded, ownerId]);

  useLayoutEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    const changed = lastSessionId.current !== (activeSession?.id ?? null);
    lastSessionId.current = activeSession?.id ?? null;
    if (changed) stickToBottom.current = true;
    if (stickToBottom.current) node.scrollTop = node.scrollHeight;
  }, [activeSession?.id, messages.length, generating]);

  useEffect(() => () => {
    if (roomTimer.current) window.clearTimeout(roomTimer.current);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    if (freshTimer.current) window.clearTimeout(freshTimer.current);
  }, []);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 176)}px`;
  }, [draft]);

  useEffect(() => {
    if (!intentMenuOpen) return;
    const closeOnPointer = (event: PointerEvent) => { const target = event.target as Element | null; if (intentRef.current?.contains(event.target as Node) || target?.closest('[aria-haspopup="menu"]')) return; setIntentMenuOpen(false); };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setIntentMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnPointer); document.removeEventListener('keydown', closeOnEscape); };
  }, [intentMenuOpen]);

  useEffect(() => {
    if (!loaded || !authenticated) return;
    if (window.matchMedia('(max-width: 980px)').matches) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [loaded, authenticated, activeSession?.id]);

  const updateSession = useCallback((id: string, update: (session: AgentSession) => AgentSession) => {
    setSessions(previous => previous.map(session => session.id === id ? update(session) : session));
  }, []);

  const startSession = useCallback((projectId: string | null = activeSession?.projectId ?? null) => {
    if (!ownerId) return;
    const session = createAgentSession(ownerId, projectId);
    setSessions(previous => [session, ...previous]);
    setActiveId(session.id);
    setSessionsOpen(false);
    setArtifactsOpen(false);
    setQuery('');
    setDraft('');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRoomTransition(true);
      if (roomTimer.current) window.clearTimeout(roomTimer.current);
      roomTimer.current = window.setTimeout(() => setRoomTransition(false), 820);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [activeSession?.projectId, ownerId]);

  const selectSession = useCallback((id: string) => {
    const session = sessions.find(item => item.id === id);
    setActiveId(id);
    setSessionsOpen(false);
    setArtifactsOpen(false);
    setDraft(session?.draft ?? '');
    setError('');
    setNotice('');
  }, [sessions]);

  const removeSession = useCallback((id: string) => {
    if (!ownerId || !window.confirm('删除这段会话？本浏览器中的记录将不可恢复。')) return;
    deleteAgentSession(ownerId, id);
    const next = sessions.filter(session => session.id !== id);
    setSessions(next);
    if (activeId === id) { setActiveId(next[0]?.id ?? null); setDraft(next[0]?.draft ?? ''); }
  }, [activeId, ownerId, sessions]);

  const bindProject = useCallback((value: string) => {
    if (!activeSession) return;
    const projectId = value || null;
    if (activeSession.messages.length || activeSession.artifacts.length) {
      if (!window.confirm('切换项目会开启一段新会话，当前会话会保留在列表中。继续？')) return;
      startSession(projectId);
      return;
    }
    updateSession(activeSession.id, session => ({ ...session, projectId, updatedAt: nowIso() }));
  }, [activeSession, startSession, updateSession]);

  const finishGeneration = useCallback((sessionId: string, toolId: string, proposal: Proposal, serviceLabel: string) => {
    if (proposal.status === 'ready' && proposal.design) {
      const artifact = artifactFromProposal(proposal, serviceLabel);
      updateSession(sessionId, session => {
        const next = patchTool(session, toolId, 'done', artifact ? `已生成「${artifact.title}」· ${artifact.questionCount} 题 · 基于问卷 v${proposal.inputRevision}` : '模型返回了空提案。');
        const withArtifact = artifact ? { ...next, artifacts: [...next.artifacts.filter(item => item.id !== artifact.id), artifact].slice(-12) } : next;
        return artifact
          ? appendAgentMessage(withArtifact, assistantText(`问卷建议已生成：${artifact.questionCount} 道题，基于问卷 v${proposal.inputRevision}。右侧产物面板可以预览和下载；应用与保存仍需进入问卷设计确认。`, { source: 'model' }))
          : withArtifact;
      });
      setPanelTab('artifacts');
      setArtifactsOpen(true);
      setSessionsOpen(false);
      if (artifact) {
        setFreshArtifact(artifact.id);
        if (freshTimer.current) window.clearTimeout(freshTimer.current);
        freshTimer.current = window.setTimeout(() => setFreshArtifact(null), 2600);
      }
      return;
    }
    if (proposal.status === 'failed') {
      updateSession(sessionId, session => patchTool(session, toolId, 'failed', `模型未完成本次生成${proposal.errorCode ? `（${proposal.errorCode}）` : ''}。`, proposal.errorCode));
      updateSession(sessionId, session => appendAgentMessage(session, assistantText('本次生成失败，项目问卷没有变化。可以检查模型服务后重新发起。', { tone: 'error' })));
      return;
    }
    updateSession(sessionId, session => patchTool(session, toolId, 'unknown', '调用结果尚未明确，原请求已保留。'));
    updateSession(sessionId, session => appendAgentMessage(session, assistantText('调用结果尚未明确。可以核对原请求；核对不会自动发起新的生成。', { tone: 'error' })));
  }, [updateSession]);

  const reportFailure = useCallback((sessionId: string, toolId: string, failure: unknown) => {
    const message = failureText(failure);
    if (isDefiniteFailure(failure)) {
      updateSession(sessionId, session => patchTool(session, toolId, 'failed', `本次生成没有启动：${message}`, failureCode(failure)));
      updateSession(sessionId, session => appendAgentMessage(session, assistantText(`本次生成没有启动：${message}`, { tone: 'error' })));
      return;
    }
    updateSession(sessionId, session => patchTool(session, toolId, 'unknown', '调用结果尚未明确，原请求已保留。'));
    updateSession(sessionId, session => appendAgentMessage(session, assistantText(`调用结果尚未明确：${message} 原请求已保留；核对只重放同一请求，不会自动产生新的模型费用。`, { tone: 'error' })));
  }, [updateSession]);

  const submitConsent = useCallback(async (messageId: string, input: { brief: string; serviceId: string }) => {
    if (!activeSession || generating) return;
    const sessionId = activeSession.id, projectId = activeSession.projectId;
    if (!projectId) { setError('请先为当前会话绑定项目。'); return; }
    const service = questionnaireServices.find(item => item.id === input.serviceId);
    if (!service) { setError('请选择一个具备问卷能力的模型服务。'); return; }
    setPreferredServiceId(service.id);
    const brief = input.brief.trim();
    if (!brief || brief.length > 6000) { setError('研究需求应为 1–6,000 字符。'); return; }
    const ownerSnapshot = ownerId, epoch = identityEpoch;
    const current = () => isCurrentAccount(ownerSnapshot, epoch);
    setGenerating(true);
    setReconciling(false);
    setError('');
    setNotice('');
    updateSession(sessionId, session => updateAgentMessage(session, messageId, message => message.role === 'assistant' && message.kind === 'consent'
      ? { ...message, status: 'submitted', brief, serviceId: service.id, serviceLabel: service.label, error: undefined }
      : message));
    const toolId = newAgentId();
    updateSession(sessionId, session => appendAgentMessage(session, questionnaireToolMessage(toolId, 'running', '正在读取项目当前的问卷版本…')));
    let headRevisionValue: number;
    try {
      const repository = createQuestionnaireRepository(projectId, { read: hostedRequest, mutate });
      const head = await repository.head(current);
      if (head === undefined || !current()) return;
      headRevisionValue = head?.revision ?? 0;
    } catch (failure) {
      if (!current()) return;
      updateSession(sessionId, session => patchTool(session, toolId, 'failed', '无法读取项目当前的问卷版本，本次没有调用模型。'));
      updateSession(sessionId, session => appendAgentMessage(session, assistantText(`读取项目版本失败：${failureText(failure)} 本次没有调用模型。`, { tone: 'error' })));
      setGenerating(false);
      return;
    }
    try {
      const request = prepareQuestionnaireGeneration(service, brief, headRevisionValue, true);
      const pendingValue: PendingGeneration = { request, serviceLabel: service.label, toolMessageId: toolId, createdAt: nowIso() };
      updateSession(sessionId, session => ({
        ...session,
        pending: pendingValue,
        messages: session.messages.map(message => message.role === 'assistant' && message.kind === 'tool' && message.id === toolId ? { ...message, detail: '正在调用模型生成问卷建议…' } : message),
      }));
      const proposals = createQuestionnaireProposalRepository(projectId, { read: hostedRequest, mutate });
      const proposal = await proposals.generate(request, current);
      if (!current() || !proposal) return;
      finishGeneration(sessionId, toolId, proposal, service.label);
    } catch (failure) {
      if (!current()) return;
      reportFailure(sessionId, toolId, failure);
    } finally {
      if (current()) { setGenerating(false); setReconciling(false); }
    }
  }, [activeSession, finishGeneration, generating, identityEpoch, isCurrentAccount, mutate, ownerId, questionnaireServices, reportFailure, updateSession]);

  const reconcile = useCallback(async () => {
    if (!activeSession?.pending || generating) return;
    const sessionId = activeSession.id, projectId = activeSession.projectId, pendingValue = activeSession.pending;
    if (!projectId) return;
    const ownerSnapshot = ownerId, epoch = identityEpoch;
    const current = () => isCurrentAccount(ownerSnapshot, epoch);
    setGenerating(true);
    setReconciling(true);
    setError('');
    updateSession(sessionId, session => patchTool(session, pendingValue.toolMessageId, 'running', '正在核对原请求…'));
    try {
      const proposals = createQuestionnaireProposalRepository(projectId, { read: hostedRequest, mutate });
      const proposal = await proposals.generate(pendingValue.request, current);
      if (!current() || !proposal) return;
      finishGeneration(sessionId, pendingValue.toolMessageId, proposal, pendingValue.serviceLabel);
    } catch (failure) {
      if (!current()) return;
      reportFailure(sessionId, pendingValue.toolMessageId, failure);
    } finally {
      if (current()) { setGenerating(false); setReconciling(false); }
    }
  }, [activeSession, finishGeneration, generating, identityEpoch, isCurrentAccount, mutate, ownerId, reportFailure, updateSession]);

  const cancelConsent = useCallback((messageId: string) => {
    if (!activeSession) return;
    updateSession(activeSession.id, session => updateAgentMessage(session, messageId, message => message.role === 'assistant' && message.kind === 'consent' ? { ...message, status: 'cancelled' } : message));
  }, [activeSession, updateSession]);

  const send = useCallback((raw: string) => {
    const value = raw.trim().slice(0, 2000);
    if (!value || !activeSession) return;
    if (activeSession.pending) { setNotice('上一份问卷生成请求仍未核对，请先在对话中处理。'); return; }
    const intent = classifyAgentIntent(value);
    let next = appendAgentMessage(activeSession, userMessage(value));
    if (intent === 'questionnaire') {
      if (!activeSession.projectId) {
        next = appendAgentMessage(next, assistantText('问卷生成需要先绑定一个项目：项目决定问卷版本与保存位置。请用顶部项目选择器绑定，或先创建一个项目。', { actions: [{ label: '我的项目', href: '/projects' }] }));
      } else {
        const service = selectedService;
        next = appendAgentMessage(next, assistantText('可以。我会先读取项目当前的问卷版本，再用你选择的模型服务生成一份可编辑的问卷建议。发送范围只有这份研究需求和你的模型配置。'));
        next = appendAgentMessage(next, consentMessage({ brief: value.slice(0, 6000), serviceId: service?.id ?? '', serviceLabel: service?.label ?? '' }));
      }
    } else {
      const reply = localReply(intent, activeSession.projectId);
      next = appendAgentMessage(next, assistantText(reply.text, { actions: reply.actions }));
    }
    updateSession(activeSession.id, () => ({ ...next, draft: '' }));
    setDraft('');
    setError('');
    setNotice('');
    stickToBottom.current = true;
    setSendPulse(true);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setSendPulse(false), 480);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [activeSession, selectedService, updateSession]);

  function submitDraft() {
    if (!draft.trim() || generating || activeSession?.pending) return;
    send(draft);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
      event.preventDefault();
      submitDraft();
    }
  }

  function trackMirror(event: ReactPointerEvent<HTMLElement>) {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--ag-mx', `${Math.round(event.clientX - rect.left)}px`);
    node.style.setProperty('--ag-my', `${Math.round(event.clientY - rect.top)}px`);
  }

  function changeDraft(value: string) {
    const next = value.slice(0, 2000);
    setDraft(next);
    if (activeSession) updateSession(activeSession.id, session => session.draft === next ? session : { ...session, draft: next });
  }

  function fillPrompt(prompt: string) {
    changeDraft(prompt);
    setArtifactsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function trackScroll(event: ReactUIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
  }

  function toggleSessions() {
    setArtifactsOpen(false);
    setSessionsOpen(value => !value);
  }

  function toggleArtifacts() {
    setSessionsOpen(false);
    setArtifactsOpen(value => !value);
  }

  const statusText = generating ? (reconciling ? '正在核对原请求' : '正在等待模型回执') : pending ? '有待核对的调用' : serviceState === 'error' ? '模型服务读取失败' : authenticated ? '就绪' : '未登录';

  if (!authenticated) {
    return <div className="workbench agent-app" data-theme={theme}><div className={styles.shell}>
      <Rail authenticated={false} email="" theme={theme} onNewSession={() => {}}/>
      <SessionPanel
        authenticated={false} sessions={[]} groups={[]} query={query} activeId={null} projectState={projectState}
        onQuery={setQuery} onSelect={() => {}} onDelete={() => {}} onNewSession={() => {}} onLogout={() => {}} onClose={() => setSessionsOpen(false)} email=""
        projectName={() => '未绑定项目'} storageBlocked={false} sessionsOpen={false}
      />
      <main className={styles.main} onPointerMove={trackMirror}>
        <LoginPanel error={auth.error} onRefresh={() => void auth.refresh().catch(() => {})}/>
      </main>
      <aside className={styles.artifacts}>
        <PanelHeader onClose={() => setArtifactsOpen(false)}/>
        <div key={panelTab} className={styles.panelBody}>
          <section className={styles.guestPanel}>
            <span className={styles.panelKicker}>{'// FIRST REAL CHAIN'}</span>
            <h3>问卷生成已接通真实模型</h3>
            <p>登录后绑定项目、选择个人模型服务并明确确认，才会发出调用。其他研究环节提供工作台入口，不伪装成已完成的 Agent 操作。</p>
            <ul><li>会话按账号隔离保存在此浏览器</li><li>模型结果与本地编排明确区分</li><li>不确定的调用保留原请求供核对</li></ul>
          </section>
        </div>
      </aside>
    </div></div>;
  }

  return <div className="workbench agent-app" data-theme={theme}><div className={styles.shell}>
    <Rail authenticated email={account?.user?.email ?? ''} theme={theme} onNewSession={() => startSession()}/>
    <SessionPanel
      authenticated sessions={sessions} groups={groups} query={query} activeId={activeId} projectState={projectState}
      onQuery={setQuery} onSelect={selectSession} onDelete={removeSession} onNewSession={() => startSession()}
      onLogout={() => void logout().catch(failure => setError(errorMessage(failure)))}
      onClose={() => setSessionsOpen(false)}
      email={account?.user?.email ?? ''} projectName={projectName} storageBlocked={storageBlocked} sessionsOpen={sessionsOpen}
    />
    <main className={styles.main} aria-busy={generating} onPointerMove={trackMirror}>
      <header className={styles.mainHeader}>
        <div className={styles.headerTitle}>
          <button type="button" className={`${styles.iconButton} ${styles.sessionsToggle}`} aria-label="打开会话列表" onClick={toggleSessions}><NavIcon kind="menu"/></button>
          <div>
            <span className={styles.headerEyebrow}>:: RESEARCH AGENT ::</span>
            <h1 title={activeSession?.title}>{activeSession?.title ?? '研究 Agent'}</h1>
            <p>{activeProject?.title ?? '未绑定项目'} · {statusText}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.projectSelect}>
            <span>项目</span>
            <select aria-label="绑定项目" value={activeSession?.projectId ?? ''} disabled={!activeSession || generating || Boolean(pending)} onChange={event => bindProject(event.target.value)}>
              <option value="">未绑定项目</option>
              {projectState === 'loading' && <option value="" disabled>正在读取项目…</option>}
              {projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </label>
          <button type="button" className={`${styles.ghostButton} ${styles.panelToggle}`} onClick={toggleArtifacts}><NavIcon kind="grid"/><span>产物</span></button>
          {activeProject && <Link className={styles.ghostButton} href={`/projects/${activeProject.id}`}>打开工作台</Link>}
        </div>
        {generating && <span className={styles.headerActivity} aria-hidden="true"/>}
      </header>
      {(error || notice) && <div className={styles.noticeBar} data-tone={error ? 'alert' : 'notice'} role={error ? 'alert' : 'status'}>
        <span><b className={styles.noticeGlyph}>{error ? '!!' : '::'}</b> {error || notice}</span>
        <button type="button" aria-label="关闭提示" onClick={() => { setError(''); setNotice(''); }}><NavIcon kind="close"/></button>
      </div>}
      <div ref={threadRef} className={styles.thread} role="log" aria-live="polite" aria-relevant="additions" onScroll={trackScroll}>
        <div key={activeSession?.id ?? 'empty'} className={styles.threadInner}>
          {messages.length === 0
            ? <Welcome authenticated projectBound={Boolean(activeProject)} onPrompt={fillPrompt}/>
            : messages.map(message => <MessageView
                key={message.id} message={message} services={questionnaireServices} busy={generating} projectBound={Boolean(activeProject)}
                preferredServiceId={selectedServiceId} serviceState={serviceState} onSubmit={submitConsent} onCancel={cancelConsent} onReconcile={reconcile}
              />)}
          {generating && <p className={styles.thinking} role="status"><span aria-hidden="true"/>{reconciling ? '正在核对原请求并等待回执…' : '正在等待模型回执…'}</p>}
        </div>
      </div>
      <div className={styles.composerWrap}>
        <div className={styles.composerFrame}>
          {intentMenuOpen && <div ref={intentRef} className={styles.intentMenu} role="menu" aria-label="快捷研究意图">
            <div className={styles.intentMenuHead}><span>:: INTENT</span><span>FILL DRAFT / NO SEND</span></div>
            {QUICK_PROMPTS.map((item, index) => <button key={item.label} type="button" role="menuitem" className={styles.intentItem} onClick={() => { fillPrompt(item.prompt); setIntentMenuOpen(false); }}>
              <span className={styles.intentIndex}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.intentCopy}><b>{item.label}</b><small>{item.hint}</small></span>
              <span className={styles.intentArrow} aria-hidden="true">→</span>
            </button>)}
            <p className={styles.intentMenuNote}>选择后只填入输入框，不会直接发送。</p>
          </div>}
          <div className={styles.composerChrome}>
            <span className={styles.composerKicker}>:: PROMPT</span>
            <span className={styles.composerChromeRight}>AGENT / MIRROR ROOM</span>
          </div>
          <div className={styles.composerBox}>
            <div className={styles.composerInputRow}>
              <span className={styles.promptLine} aria-hidden="true"><b>evix@mirror</b><i>:~$</i></span>
              <div>
                <label className={styles.srOnly} htmlFor="agent-composer">告诉研究 Agent 你的任务</label>
                <textarea
                  id="agent-composer" ref={inputRef} className={styles.composerInput} rows={1} maxLength={2000}
                  value={draft} placeholder={composerPlaceholder}
                  onChange={event => changeDraft(event.target.value)} onKeyDown={onComposerKeyDown}
                  onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
                />
              </div>
            </div>
            <div className={styles.composerFoot}>
              <div className={styles.composerToolsLeft}>
                <button type="button" className={styles.addButton} data-open={intentMenuOpen || undefined} aria-label="选择快捷意图" aria-haspopup="menu" aria-expanded={intentMenuOpen} title="快捷意图" onPointerDown={event => event.preventDefault()} onClick={() => setIntentMenuOpen(value => !value)}><NavIcon kind="plus"/></button>
                <label className={styles.modelSelect} title="下一次问卷提案的默认模型">
                  <span>MODEL</span>
                  <select aria-label="选择问卷模型" value={selectedServiceId} disabled={generating || Boolean(pending) || !questionnaireServices.length} onChange={event => setPreferredServiceId(event.target.value)}>
                    {!questionnaireServices.length && <option value="">未配置</option>}
                    {questionnaireServices.map(service => <option key={service.id} value={service.id}>{service.label}</option>)}
                  </select>
                </label>
                {!questionnaireServices.length && <Link href="/services" className={styles.modelConfig}>配置</Link>}
              </div>
              <div className={styles.composerToolsRight}>
                <span className={styles.keyHint}>ENTER 发送</span>
                <span className={styles.composerCount}>{draft.length} / 2000</span>
                <button type="button" className={styles.sendButton} data-firing={sendPulse || undefined} data-busy={generating || undefined} disabled={!draft.trim() || generating || Boolean(pending)} onClick={submitDraft} aria-label="发送" title="Enter 发送 · Shift+Enter 换行"><span>{generating ? '处理中' : '发送'}</span><NavIcon kind="arrow"/></button>
              </div>
            </div>
          </div>
          <div className={styles.composerStatus}><span>[MODE: AGENT]</span><span>[STORE: LOCAL]</span><span>[SEQ: {String(messages.length).padStart(3, '0')}]</span><span className={styles.composerStatusRight}>模型只在确认后调用 · 不生成虚假数据、引用或结论</span></div>
        </div>
      </div>
    </main>
    <aside className={styles.artifacts} data-open={artifactsOpen}>
      <PanelHeader onClose={() => setArtifactsOpen(false)}/>
      <div className={styles.panelTabs} role="tablist" aria-label="会话面板">
        {([['artifacts', '产物'], ['plan', '计划'], ['context', '上下文']] as Array<[PanelTab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={panelTab === id} className={styles.panelTab} onClick={() => setPanelTab(id)}>[ {label} ]</button>)}
      </div>
      <div key={panelTab} className={styles.panelBody}>
        {panelTab === 'artifacts' && (artifacts.length
          ? artifacts.map(artifact => <ArtifactCard key={artifact.id} artifact={artifact} projectId={activeSession?.projectId ?? null} fresh={freshArtifact === artifact.id}/>)
          : <section className={styles.panelEmpty}><span className={styles.panelKicker}>{'// ARTIFACTS'}</span><h3>还没有产物</h3><p>在对话中生成问卷后，可编辑的提案会出现在这里，并保留模型服务与问卷版本。</p><pre className={styles.panelAscii}>{`+-- artifacts --------+
|  waiting for model  |
|  receipt...         |
+---------------------+`}</pre><Link href="/services">管理模型服务 →</Link></section>)}
        {panelTab === 'plan' && <PlanPanel projectId={activeSession?.projectId ?? null} hasArtifact={artifacts.length > 0} inProgress={generating || Boolean(pending)}/>}
        {panelTab === 'context' && <ContextPanel project={activeProject} headRevision={headRevision} services={questionnaireServices} serviceState={serviceState} storageBlocked={storageBlocked} hasPending={Boolean(pending)}/>}
      </div>
    </aside>
    {roomTransition && <div className={styles.roomTransition} aria-hidden="true">
      <span/><span/><span/><span/>
      <pre>{`ENTERING MIRROR ROOM
> session init_...
> mirror room linked`}</pre>
    </div>}
  </div></div>;
}

function Rail({ authenticated, email, theme, onNewSession }: { authenticated: boolean; email: string; theme: Theme; onNewSession: () => void }) {
  return <aside className={styles.rail} aria-label="研究 Agent 导航">
    <Link href="/agent" className={styles.railBrand} aria-label="研究 Agent 首页"><BrandMark size={30}/></Link>
    <button type="button" className={styles.railButton} data-active={authenticated ? 'true' : undefined} onClick={onNewSession} disabled={!authenticated} title="新会话" aria-label="新会话"><NavIcon kind="plus"/></button>
    <div className={styles.railDivider}/>
    <Link href="/projects" className={styles.railButton} title="我的项目" aria-label="我的项目"><NavIcon kind="folder"/></Link>
    <Link href="/workspace" className={styles.railButton} title="研究工作台" aria-label="研究工作台"><NavIcon kind="nodes"/></Link>
    <Link href="/knowledge" className={styles.railButton} title="知识索引" aria-label="知识索引"><NavIcon kind="search"/></Link>
    <Link href="/services" className={styles.railButton} title="模型服务" aria-label="模型服务"><NavIcon kind="target"/></Link>
    <div className={styles.railSpacer}/>
    <ThemeToggle theme={theme}/>
    {authenticated && <Link href="/projects" className={styles.avatar} title={email} aria-label={`账号：${email}`}>{(email || '证').slice(0, 1).toUpperCase()}</Link>}
  </aside>;
}

type SessionPanelProps = {
  authenticated: boolean; sessions: AgentSession[]; groups: ReturnType<typeof groupSessionsByDay>; query: string; activeId: string | null;
  projectState: ProjectState; email: string; storageBlocked: boolean; sessionsOpen: boolean;
  onQuery: (value: string) => void; onSelect: (id: string) => void; onDelete: (id: string) => void; onNewSession: () => void; onLogout: () => void; onClose: () => void;
  projectName: (id: string | null) => string;
};

function SessionPanel({ authenticated, sessions, groups, query, activeId, projectState, email, storageBlocked, sessionsOpen, onQuery, onSelect, onDelete, onNewSession, onLogout, onClose, projectName }: SessionPanelProps) {
  return <aside className={styles.sessions} data-open={sessionsOpen} aria-label="会话列表">
    <div className={styles.sessionsHead}>
      <div><span className={styles.sessionsKicker}>[ EVI-X ]</span><h2>研究 Agent</h2></div>
      <div className={styles.sessionsActions}><button type="button" className={styles.newSession} onClick={onNewSession} disabled={!authenticated}><NavIcon kind="plus"/><span>新会话</span></button><button type="button" className={styles.sessionsClose} onClick={onClose} aria-label="关闭会话列表"><NavIcon kind="close"/></button></div>
    </div>
    <label className={styles.searchBox}><NavIcon kind="search"/><input aria-label="搜索会话" value={query} onChange={event => onQuery(event.target.value)} placeholder="搜索会话" disabled={!authenticated}/></label>
    <div className={styles.sessionScroll}>
      {!authenticated && <div className={styles.guestSessions}><p>登录后，会话会按账号隔离保存在此浏览器。</p><Link href="/login">邮箱登录</Link></div>}
      {authenticated && !groups.length && <p className={styles.sessionEmpty}>{sessions.length ? '没有匹配的会话。' : '还没有会话。点击“新会话”开始。'}</p>}
      {groups.map(group => <section key={group.label} className={styles.sessionGroup}>
        <p className={styles.sessionGroupLabel}>:: {group.label}</p>
        {group.sessions.map(session => <div key={session.id} className={styles.sessionRow} data-active={activeId === session.id}>
          <button type="button" className={styles.sessionMain} onClick={() => onSelect(session.id)} aria-current={activeId === session.id ? 'page' : undefined} title={session.title}>
            <span className={styles.sessionMarker} aria-hidden="true">&gt;</span>
            <span className={styles.sessionTitle}>{session.title}</span>
            <span className={styles.sessionMeta}>{projectName(session.projectId)} · {formatRelativeTime(session.updatedAt)}</span>
          </button>
          <button type="button" className={styles.sessionDelete} aria-label={`删除会话：${session.title}`} onClick={() => onDelete(session.id)}><NavIcon kind="close"/></button>
        </div>)}
      </section>)}
    </div>
    <div className={styles.sessionsFooter}>
      {authenticated
        ? <div className={styles.footerAccount}><span title={email}>{email}</span><button type="button" onClick={onLogout}>退出</button></div>
        : <Link href="/login">邮箱登录</Link>}
      <small>{projectState === 'error' ? '项目列表读取失败，请刷新核对。' : storageBlocked ? '本地存储不可用，刷新后会丢失会话。' : '会话只保存在此浏览器；模型调用需确认。'}</small>
    </div>
  </aside>;
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return <div className={styles.panelHead}>
    <div><span className={styles.panelKicker}>{'// SESSION'}</span><h2>工作区</h2></div>
    <button type="button" className={`${styles.iconButton} ${styles.panelClose}`} aria-label="关闭产物面板" onClick={onClose}><NavIcon kind="close"/></button>
  </div>;
}

function Welcome({ authenticated, projectBound, onPrompt }: { authenticated: boolean; projectBound: boolean; onPrompt: (prompt: string) => void }) {
  if (!authenticated) return null;
  return <section className={styles.welcome}>
    <MirrorRoom/>
    <div className={styles.welcomeHead}><span className={styles.welcomeMarkSmall}><BrandMark size={30}/></span><span className={styles.welcomeKicker}>:: EVI-X RESEARCH AGENT ::</span></div>
    <h2>今天想研究什么？</h2>
    <p>先从一句真实的问题开始。我可以调用你的模型生成可编辑问卷，也会把你带到选题、分析、报告与答辩的正确入口。</p>
    <div className={styles.welcomeGrid}>
      {QUICK_PROMPTS.map(item => <button key={item.label} type="button" className={styles.promptCard} onClick={() => onPrompt(item.prompt)}><strong>{item.label}</strong><span>{item.prompt}</span></button>)}
    </div>
    <p className={styles.welcomeNote}>{projectBound ? '当前会话已绑定项目，可以生成问卷。' : '先在顶部绑定项目，问卷生成才有版本与保存位置。'}</p>
  </section>;
}

function MessageView({ message, services, busy, projectBound, preferredServiceId, serviceState, onSubmit, onCancel, onReconcile }: {
  message: AgentMessage; services: Service[]; busy: boolean; projectBound: boolean; preferredServiceId: string; serviceState: ServiceState;
  onSubmit: (id: string, input: { brief: string; serviceId: string }) => void; onCancel: (id: string) => void; onReconcile: () => void;
}) {
  if (message.role === 'user') return <article className={styles.userRow}><div className={styles.userBubble}>{message.text}</div><span className={styles.userLabel}>你</span></article>;
  if (message.kind === 'text') return <article className={styles.assistantRow}>
    <span className={styles.assistantAvatar}><BrandMark size={24}/></span>
    <div className={styles.assistantBody}>
      <div className={styles.messageMeta}>
        <strong>研究 Agent</strong>
        <span className={styles.badge} data-source={message.source}>{message.source === 'model' ? ':: 模型回执' : ':: 本地编排'}</span>
        <time dateTime={message.at}>{formatRelativeTime(message.at)}</time>
      </div>
      <div className={styles.messageText} data-tone={message.tone}>{message.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      {Boolean(message.actions?.length) && <div className={styles.messageActions}>{message.actions?.map(action => <Link key={`${action.href}:${action.label}`} href={action.href} className={styles.actionLink}>{action.label}<span aria-hidden="true">→</span></Link>)}</div>}
    </div>
  </article>;
  if (message.kind === 'tool') return <article className={styles.assistantRow}>
    <span className={styles.assistantAvatar}><BrandMark size={24}/></span>
    <div className={styles.assistantBody}>
      <div className={styles.toolCard} data-status={message.status}>
        <div className={styles.toolHead}>
          <span className={styles.toolIcon} data-status={message.status}>{message.status === 'done' ? '✓' : message.status === 'running' ? '' : '!'}</span>
          <div><strong>生成问卷建议</strong><small>q.generate :: personal-model</small></div>
          <span className={styles.toolStatus} data-status={message.status}>{TOOL_STATUS[message.status]}</span>
        </div>
        <p>{message.detail}</p>
        <code className={styles.toolTrace}>{message.status === 'running' ? '> q.generate --stream :: awaiting receipt' : message.status === 'done' ? '> receipt verified :: artifact staged' : message.status === 'unknown' ? '> receipt uncertain :: replay original request' : `> generation rejected${message.errorCode ? ` :: ${message.errorCode}` : ''}`}</code>
        {message.errorCode && <code>{message.errorCode}</code>}
        {message.status === 'running' && <div className={styles.toolProgress} aria-hidden="true"><span/></div>}
        {message.status === 'unknown' && message.canReconcile && <div className={styles.toolActions}><button type="button" disabled={busy} onClick={onReconcile}>核对原请求</button><span>只重放同一请求，不自动产生新费用。</span></div>}
      </div>
    </div>
  </article>;
  return <article className={styles.assistantRow}>
    <span className={styles.assistantAvatar}><BrandMark size={24}/></span>
    <div className={styles.assistantBody}>
      <ConsentCard message={message} services={services} busy={busy} projectBound={projectBound} preferredServiceId={preferredServiceId} serviceState={serviceState} onSubmit={onSubmit} onCancel={onCancel}/>
    </div>
  </article>;
}

function ConsentCard({ message, services, busy, projectBound, preferredServiceId, serviceState, onSubmit, onCancel }: {
  message: Extract<AgentMessage, { kind: 'consent' }>; services: Service[]; busy: boolean; projectBound: boolean; preferredServiceId: string; serviceState: ServiceState;
  onSubmit: (id: string, input: { brief: string; serviceId: string }) => void; onCancel: (id: string) => void;
}) {
  const [brief, setBrief] = useState(message.brief);
  const [serviceChoice, setServiceChoice] = useState(message.serviceId || preferredServiceId);
  const [consented, setConsented] = useState(false);
  const [localError, setLocalError] = useState('');
  const serviceId = serviceChoice || preferredServiceId || services[0]?.id || '';
  if (message.status === 'cancelled') return <div className={styles.consentDone}><span className={styles.consentStamp}>[ VOID ]</span><strong>已取消本次生成</strong><p>项目问卷没有变化。需要时可以在输入框重新发起。</p></div>;
  if (message.status === 'submitted') return <div className={styles.consentDone}><span className={styles.consentStamp}>[ SENT ]</span><strong>已确认发送</strong><p>正在读取项目版本并调用模型；回执会显示在下方。</p></div>;
  const service = services.find(item => item.id === serviceId);
  function submit() {
    if (!projectBound) { setLocalError('请先在顶部绑定项目。'); return; }
    if (!service) { setLocalError('请先选择一个具备问卷能力的模型服务。'); return; }
    if (!brief.trim()) { setLocalError('请填写研究需求。'); return; }
    if (!consented) { setLocalError('发送前需要确认模型调用。'); return; }
    setLocalError('');
    onSubmit(message.id, { brief, serviceId });
  }
  return <section className={styles.consentCard} aria-label="模型调用确认">
    <div className={styles.consentHead}><span className={styles.panelKicker}>{'// CONSENT REQUIRED'}</span><h3>调用模型前确认</h3><p>只有确认后才会读取项目版本并把研究需求发送到你选择的供应商。</p></div>
    <ol className={styles.consentPlan}>
      <li><span>1</span><div><b>读取项目问卷版本</b><small>确定这次提案基于哪一版</small></div></li>
      <li><span>2</span><div><b>发送研究需求</b><small>使用你的 API 额度</small></div></li>
      <li><span>3</span><div><b>校验回执并保存提案</b><small>提案仍需你进入问卷设计确认应用</small></div></li>
    </ol>
    <div className={styles.consentForm}>
      <label className={styles.consentField}><span>模型服务</span>
        <select value={serviceId} disabled={busy || serviceState === 'loading'} onChange={event => { setServiceChoice(event.target.value); setConsented(false); }}>
          {!services.length && <option value="">{serviceState === 'loading' ? '正在读取模型服务…' : '尚未配置问卷模型'}</option>}
          {services.map(item => <option key={item.id} value={item.id}>{item.label} · {item.provider} · v{item.revision}</option>)}
        </select>
      </label>
      <div className={styles.consentLinks}><Link href="/services">管理我的模型服务 →</Link>{!projectBound && <Link href="/projects">选择项目 →</Link>}</div>
      <label className={styles.consentField}><span>研究需求</span>
        <textarea rows={4} maxLength={6000} value={brief} disabled={busy} onChange={event => { setBrief(event.target.value); setConsented(false); }}/>
        <small>{brief.trim().length} / 6,000 字符 · 只发送这段需求与模型配置，不上传原始答卷</small>
      </label>
      <label className={styles.consentCheck}><input type="checkbox" checked={consented} disabled={busy || !service} onChange={event => setConsented(event.target.checked)}/><span>确认使用我的模型额度，把上方研究需求发送给所选供应商。</span></label>
      {localError && <p className={styles.consentError} role="alert">{localError}</p>}
      <div className={styles.consentActions}>
        <button type="button" className={styles.primaryButton} disabled={busy || !service || !projectBound || !brief.trim() || !consented} onClick={submit}>{busy ? '处理中…' : '确认并生成'}</button>
        <button type="button" className={styles.ghostButton} disabled={busy} onClick={() => onCancel(message.id)}>取消</button>
      </div>
      <p className={styles.consentNote}>结果不明确时不会自动重试；原请求会保留，供你显式核对。</p>
    </div>
  </section>;
}

function ArtifactCard({ artifact, projectId, fresh }: { artifact: AgentArtifact; projectId: string | null; fresh: boolean }) {
  return <article className={styles.artifactCard} data-fresh={fresh || undefined}>
    <header><span className={styles.panelKicker}>{'// QUESTIONNAIRE PROPOSAL'}</span><small>基于问卷 v{artifact.inputRevision}</small></header>
    <h3>{artifact.title}</h3>
    {artifact.objective && <p>{artifact.objective}</p>}
    <dl className={styles.artifactMeta}>
      <div><dt>题目</dt><dd>{artifact.questionCount}</dd></div>
      <div><dt>模型服务</dt><dd>{artifact.serviceLabel}</dd></div>
      <div><dt>生成时间</dt><dd>{new Date(artifact.createdAt).toLocaleString('zh-CN')}</dd></div>
    </dl>
    <details className={styles.artifactQuestions}><summary>查看题目</summary><ol>{artifact.questions.map(question => <li key={question.id}><b>{question.text || '题干待填写'}</b><small>{question.type}</small></li>)}</ol></details>
    <div className={styles.artifactActions}>
      {projectId && <Link href={`/projects/${projectId}`}>打开问卷设计</Link>}
      <button type="button" onClick={() => downloadQuestionnaire(artifact.design, `${artifact.title.replace(/[\\/:*?"<>|]/g, '-') || '问卷提案'}.json`)}>下载 JSON</button>
    </div>
    <p className={styles.artifactNote}>提案不会自动写入项目；应用、编辑与保存仍需在问卷设计里确认。</p>
  </article>;
}

function PlanPanel({ projectId, hasArtifact, inProgress }: { projectId: string | null; hasArtifact: boolean; inProgress: boolean }) {
  const href = projectId ? `/projects/${projectId}` : '/projects';
  return <section className={styles.planPanel}>
    <span className={styles.panelKicker}>{'// RESEARCH PIPELINE'}</span>
    <h3>研究流程</h3>
    <ol className={styles.planList}>
      {PIPELINE.map((step, index) => {
        const state = index === 1 && hasArtifact ? 'done' : index === 1 && inProgress ? 'active' : 'idle';
        return <li key={step.label} data-state={state}><span className={styles.planIndex}>{state === 'done' ? '✓' : index + 1}</span><div><b>{step.label}</b><small>{step.note}</small></div><Link href={href} aria-label={`打开${step.label}`}>→</Link></li>;
      })}
    </ol>
    <p className={styles.panelNote}>这些是工作台入口，不代表已完成或通过 Gate。真正的阶段推进仍由项目证据与审计决定。</p>
  </section>;
}

function ContextPanel({ project, headRevision, services, serviceState, storageBlocked, hasPending }: { project: Project | null; headRevision: number | null; services: Service[]; serviceState: ServiceState; storageBlocked: boolean; hasPending: boolean }) {
  return <section className={styles.contextPanel}>
    <span className={styles.panelKicker}>{'// CONTEXT'}</span>
    <h3>当前上下文</h3>
    <dl className={styles.contextList}>
      <div><dt>项目</dt><dd>{project?.title ?? '未绑定'}</dd></div>
      <div><dt>问卷版本</dt><dd>{headRevision === null ? '未知' : headRevision ? `v${headRevision}` : '尚未保存'}</dd></div>
      <div><dt>可用问卷模型</dt><dd>{serviceState === 'error' ? '读取失败' : services.length ? `${services.length} 个` : '未配置'}</dd></div>
      <div><dt>待核对调用</dt><dd>{hasPending ? '1 个' : '无'}</dd></div>
      <div><dt>会话存储</dt><dd>{storageBlocked ? '本地存储不可用' : '仅此浏览器'}</dd></div>
    </dl>
    <div className={styles.contextLinks}>{project && <Link href={`/projects/${project.id}`}>打开项目工作台 →</Link>}<Link href="/services">模型服务 →</Link><Link href="/workspace">研究工具 →</Link></div>
    <p className={styles.panelNote}>Agent 不会生成虚假受访者、原始数据、引用或模型结果；AI 概念图也不能冒充调研证据。</p>
  </section>;
}

function LoginPanel({ error, onRefresh }: { error: string; onRefresh: () => void }) {
  return <div className={styles.loginWrap}>
    <section className={styles.loginCard}>
      <MirrorRoom compact/>
      <div className={styles.loginBrand}><BrandMark size={34}/><span className={styles.panelKicker}>:: EVI-X RESEARCH AGENT ::</span></div>
      <h2>把研究任务交给一段对话</h2>
      <p>登录后，会话按账号隔离保存在这个浏览器。生成问卷时会读取项目版本，并在调用你的模型服务前征求确认。</p>
      <div className={styles.loginActions}><Link className={styles.primaryButton} href="/login">邮箱登录</Link><Link className={styles.ghostButton} href="/workspace">先看研究工具</Link></div>
      {error && <p className={styles.loginError} role="alert">{error}<button type="button" onClick={onRefresh}>重试</button></p>}
    </section>
  </div>;
}
