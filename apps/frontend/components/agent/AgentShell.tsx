'use client';

import Link from 'next/link';
import { flushSync } from 'react-dom';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { useWorkbenchModules } from '@/components/EviXPlatform';
import { WorkbenchNavProvider, type WorkbenchNav, type WorkbenchPanel } from '@/components/WorkbenchShell';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { useProjectMemory } from '@/components/hosted/useProjectMemory';
import { fetchCloudThread, saveCloudThread } from '@/components/hosted/cloud-process-client';
import { errorMessage, HostedApiError } from '@/components/hosted/api-client';
import { CHAT_ERRORS, HISTORY_LIMIT, MAX_STEPS, TEXT_LIMIT, chatContext, chatHistory, isDefiniteChatRejection, isResultTool, replyLines, spanText, turnText, type ChatAction, type ChatLine, type ChatReceipt, type ChatRequest, type ToolResult } from '@/lib/agent/chat';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { ThemeProvider, saveTheme, switchTheme, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { percent } from '@/lib/agent/glyphs';
import { illuminate, roomLight } from '@/lib/agent/illumination';
import { traceExhibits } from '@/lib/agent/provenance';
import { resultPlaced, suggestedNode } from '@/lib/report-placement';
import { blueprintNode } from '@/lib/report-blueprint';
import { draftFacts, draftLine, draftRequest, draftText, sectionText, type DraftReceipt, type Fact } from '@/lib/agent/draft';
import { reportPlan } from '@/lib/agent/report-plan';
import { readDraft, sendDraft } from './draft-client';
import { ROOM_GROUPS, ROOMS, isRoomId, roomById, type RoomGroup, type RoomId } from '@/lib/agent/rooms';
import { lookupTurn, route, standingFindings, toolTurn, type AgentAction, type AgentTurn, type Line, type Mark, type ResultsView, type Span } from '@/lib/agent/router';
import { readChatTurn, sendChatTurn } from './chat-client';
import { UNRECORDED_SERVICE, conversationMarkdown, recordName } from '@/lib/agent/transcript-export';
import Composer from './Composer';
import { GenerationProvider, useGeneration } from './generation';
import { LightBar } from './Glyphs';
import { Icon } from './icons';
import Lobby from './Lobby';
import Sidebar from './Sidebar';
import Transcript from './Transcript';
import { stamp, threads, type Message, type ModelCall } from './threads';
import { makeProcessCheckpoint, makeProcessEvent, type ProcessEventKind } from '@/lib/agent/process';
import { processJournal } from './process-journal';
import ProcessTimeline from './ProcessTimeline';
import { localModel } from './local-model';
import { sendLocalChatTurn } from './local-chat-client';
import type { Service } from '@evix/shared';

/**
 * A sentence's later steps: what the tools found, which ran already, the service the user agreed to, and `after`, the
 * reply they follow, which ties them to the conversation the sentence was asked in.
 */
type Chain = { step: number; results: ToolResult[]; seen: Set<string>; service: Service; after: string };
import styles from './AgentShell.module.css';

// Every workbench module opens in the panel and every panel hosts a module: the two lists cannot drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const ROOMS_ARE_PANELS: Same<RoomId, WorkbenchPanel> = true;
void ROOMS_ARE_PANELS;

function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
/** The module open in the side panel, read from the address: none, the overview, or a workbench module. */
function currentPanel(): RoomId | null {
  const hash = window.location.hash.slice(1);
  return hash === 'lifecycle' ? 'workspace' : isRoomId(hash) ? hash : null;
}
const subscribeNothing = () => () => {};
const searchKey = () => /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
const EMPTY_MESSAGES: Message[] = [];
const PANEL_KEY = 'evix.agent.panel-width.v1';
const RAIL = 52, SIDEBAR = 264, MIN_PANEL = 480, MIN_TALK = 360;
const SUGGESTIONS = ['下一步做什么', '帮我出一份社区体育设施满意度的问卷', '什么是设计效应', '/照度'];
const GROUPS = (Object.keys(ROOM_GROUPS) as RoomGroup[]).filter(g => g !== 'lobby');

/** The panel width remembered in this browser, if any; a width is a convenience only. */
/**
 * How this identity talks to the agent, remembered: an account's choice in this browser, a guest's for the tab. It is
 * read through a store so the first client render matches the server's, which always starts in 指令模式.
 */
type ChatMode = 'command' | 'model';
const MODE_KEY = 'evix.agent.chat-mode.v1:', modeListeners = new Set<() => void>();
const modeStorage = (owner: string) => owner === 'guest' ? window.sessionStorage : window.localStorage;
function subscribeMode(listener: () => void) { modeListeners.add(listener); return () => { modeListeners.delete(listener); }; }
function readMode(owner: string | null): ChatMode {
  if (!owner) return 'command';
  try { return modeStorage(owner).getItem(MODE_KEY + owner) === 'model' ? 'model' : 'command'; } catch { return 'command'; }
}
function writeMode(owner: string | null, mode: ChatMode) {
  if (!owner) return;
  try { modeStorage(owner).setItem(MODE_KEY + owner, mode); } catch { /* Without storage the choice lasts until the page reloads. */ }
  for (const listener of modeListeners) listener();
}

function savedPanelWidth(): number | null {
  try { const saved = Number(window.localStorage.getItem(PANEL_KEY)); if (saved >= 480 && saved <= 1800) return saved; } catch { /* Not remembered without storage. */ }
  return null;
}

/**
 * 证见 Agent, laid out like Codex: an icon rail, a sidebar of projects and conversations, one conversation in the
 * middle, and every workbench module opening in a panel on the right, kept mounted once opened. The panel follows the
 * address hash, so a module that moves the user on (analysis sending a result to the report) moves the panel too.
 */
export default function AgentShell() {
  const { panels, view, publishProposal, sendToReport } = useWorkbenchModules(true);
  const knowledge = useKnowledge();
  const theme = useThemePreference('light');
  const { session: account, loading: accountLoading, error: sessionError, logout, refresh, mutate } = useHostedSession();
  const [accountNotice, setAccountNotice] = useState('');
  // Conversations belong to whoever is signed in; they are bound once the session is known and never shown to another.
  const owner = accountLoading ? null : account?.authenticated && account.user?.id ? account.user.id : 'guest';
  useEffect(() => {
    if (!owner) return;
    threads.bind(owner);
    processJournal.bind(owner);
  }, [owner]);
  const book = useSyncExternalStore(threads.subscribe, () => threads.view(owner), threads.serverSnapshot);
  const processBook = useSyncExternalStore(processJournal.subscribe, () => processJournal.view(owner), processJournal.serverSnapshot);
  const thread = book.threads.find(t => t.id === book.active) ?? null;
  const messages = thread?.messages ?? EMPTY_MESSAGES;
  const activeProcess = thread ? processBook.threads[thread.id] : undefined;
  const panel = useSyncExternalStore(subscribeHash, currentPanel, () => null);
  const shortcut = useSyncExternalStore(subscribeNothing, searchKey, () => '⌘K');
  // The report is re-scored as it is typed; deferring keeps typing in the editor ahead of the benchmark.
  const deferredView = useDeferredValue(view);
  const light = useMemo(() => illuminate(deferredView), [deferredView]);
  const traces = useMemo(() => traceExhibits(deferredView.report, deferredView.design), [deferredView]);
  // The plan makes room for the sections the registered results belong in.
  const plan = useMemo(() => deferredView.report ? reportPlan(deferredView.report, light.benchmark, (deferredView.report.quality?.results ?? []).map(suggestedNode)) : null, [deferredView, light]);
  const held = useMemo<ResultsView>(() => {
    const report = deferredView.report, results = report?.quality?.results ?? [];
    return report ? { results, findings: report.quality?.findings ?? [], pending: deferredView.resultPending, placed: results.filter(r => resultPlaced(report, r)).map(r => r.id) } : null;
  }, [deferredView]);

  const [visited, setVisited] = useState<RoomId[]>([]);
  if (panel && panel !== 'overview' && !visited.includes(panel)) setVisited([...visited, panel]);
  const [railMenu, setRailMenu] = useState<'modules' | 'account' | null>(null);
  const [showProcess, setShowProcess] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [backup, setBackup] = useState({ busy: false, note: '' });
  const lastSync = useRef(new Map<string, string>());
  // Workbench modules are laid out for a whole screen. While a panel is open on a screen under 1680px the sidebar folds to
  // give it room and comes back when the panel closes; what the user chooses in either state is kept for that state.
  const viewport = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
  const crowded = !!panel && viewport < 1680;
  const [sideAlone, setSideAlone] = useState(true), [sideBeside, setSideBeside] = useState(false);
  const sideOpen = crowded ? sideBeside : sideAlone;
  const setSideOpen = crowded ? setSideBeside : setSideAlone;
  const [expanded, setExpanded] = useState(false);
  // The panel takes seven tenths of the room beside the sidebar, or the width last dragged to, and always leaves the
  // conversation its minimum. Widths are read through stores so the first client render matches the server's.
  const savedWidth = useSyncExternalStore(subscribeNothing, savedPanelWidth, () => null);
  const [draggedWidth, setPanelWidth] = useState<number | null>(null);
  const room = viewport - RAIL - (sideOpen ? SIDEBAR : 0);
  const available = Math.max(MIN_PANEL, room - MIN_TALK);
  const panelWidth = Math.min(available, draggedWidth ?? savedWidth ?? Math.round(Math.min(1240, Math.max(MIN_PANEL, room * 0.7))));
  const [dragging, setDragging] = useState(false);
  const [lastPanel, setLastPanel] = useState<RoomId | null>(null);
  const [lastModule, setLastModule] = useState<RoomId>('overview');
  const [shownPanel, setShownPanel] = useState(panel);
  const [canvasReturn, setCanvasReturn] = useState<{ nodeId: string; title: string } | null>(null);
  const [canvasFocus, setCanvasFocus] = useState<{ nodeId: string; token: number } | null>(null);
  if (shownPanel !== panel) {
    setShownPanel(panel);
    if (panel) setLastPanel(panel);
    if (panel && panel !== 'canvas') setLastModule(panel);
    if (!panel) setExpanded(false);
  }

  const inputRef = useRef<HTMLTextAreaElement>(null), scrollRef = useRef<HTMLDivElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  const railRef = useRef<HTMLElement>(null), launcherRef = useRef<HTMLDivElement>(null), modulesRef = useRef<HTMLButtonElement>(null);
  // A module picked from the launcher takes focus at its heading once the launcher has closed, the open one included,
  // so the keyboard goes on into it rather than losing its place.
  const focusPicked = useRef(false);
  useEffect(() => {
    if (railMenu || !focusPicked.current || !panel) return;
    focusPicked.current = false;
    headingRef.current?.focus();
  }, [railMenu, panel]);
  // The launcher takes focus when it opens, on the module already open or else the first, so the keyboard starts there.
  useEffect(() => {
    const launcher = launcherRef.current;
    if (railMenu === 'modules') (launcher?.querySelector<HTMLButtonElement>('button[aria-current="true"]') ?? launcher?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [railMenu]);
  // The rail's menus close on a click outside the rail, as the composer's menus do.
  useEffect(() => {
    if (!railMenu) return;
    const away = (event: PointerEvent) => { if (!railRef.current?.contains(event.target as Node)) setRailMenu(null); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [railMenu]);
  // Every way to the input goes through here. While the panel fills the screen the input is hidden, so the conversation
  // comes back first, synchronously, and a "/" typed to get there still lands in it.
  const focusInput = useCallback(() => {
    if (inputRef.current?.offsetParent === null) flushSync(() => setExpanded(false));
    inputRef.current?.focus();
  }, []);
  const go = useCallback((id: RoomId) => { if (currentPanel() !== id) window.location.hash = id; }, []);
  const closePanel = useCallback(() => { window.location.hash = ''; }, []);
  const pick = (id: RoomId) => { focusPicked.current = true; setRailMenu(null); go(id); };
  const generation = useGeneration(publishProposal, go);
  const { account: generationAccount, load: loadLists, lists, preferredService, prefer } = generation;
  // Projects and services fill the sidebar and the composer's menus as soon as an account is known.
  useEffect(() => { if (generationAccount === 'ready') loadLists(); }, [generationAccount, loadLists]);
  // Talking with a model is the user's choice, for this visit; every conversation asks once before its first sentence goes.
  // Without storage the choice is still kept for this page, in memory.
  // It belongs to the identity that chose it; another identity reads its own.
  const [modeHere, setModeHere] = useState<{ owner: string | null; mode: ChatMode } | null>(null);
  const storedMode = useSyncExternalStore(subscribeMode, () => readMode(owner), () => 'command' as ChatMode);
  const chatMode = modeHere && modeHere.owner === owner ? modeHere.mode : storedMode;
  const setChatMode = useCallback((mode: ChatMode) => { setModeHere({ owner, mode }); writeMode(owner, mode); }, [owner]);
  const consented = useRef(new Set<string>());
  // The chat uses the service the model menu shows as chosen, never another one behind it.
  // The composer's picker offers services to talk with or to draft questionnaires with; one that only writes reports is
  // never chosen there, so it cannot leave the conversation without a model. Drafting a section finds it below.
  const localConfig = useSyncExternalStore(localModel.subscribe, localModel.view, localModel.serverSnapshot);
  const localService = useMemo<Service | null>(() => localConfig ? {
    id: 'local', label: localConfig.label, provider: localConfig.provider, baseUrl: localConfig.baseUrl,
    model: localConfig.model, maxOutputTokens: localConfig.maxOutputTokens, capabilities: ['research'], revision: 1,
  } : null, [localConfig]);
  const pickable = useMemo(() => lists.services.filter(s => s.capabilities.includes('research') || s.capabilities.includes('questionnaire')), [lists.services]);
  const chatServices = useMemo(() => localService ? [localService, ...pickable] : pickable, [localService, pickable]);
  const chosenService = localService && (preferredService === 'local' || !pickable.some(s => s.id === preferredService && s.capabilities.includes('research')))
    ? 'local' : pickable.some(s => s.id === preferredService) ? preferredService : pickable[0]?.id ?? '';
  const chatService = chatServices.find(s => s.id === chosenService && s.capabilities.includes('research')) ?? null;
  // Drafting a report section asks a service with the 报告 capability: the chosen one when it has it, else the first that does.
  const reportService = lists.services.find(s => s.id === chosenService && s.capabilities.includes('report')) ?? lists.services.find(s => s.capabilities.includes('report')) ?? null;

  const openFromCanvas = useCallback((target: Section, nodeId: string, title: string) => { setCanvasReturn({ nodeId, title }); window.location.hash = target; }, []);
  const showWorkbench = useCallback(() => { window.location.hash = lastModule; }, [lastModule]);
  const nav = useMemo<WorkbenchNav>(() => ({ section: panel ?? 'overview', openFromCanvas, showWorkbench, canvasFocus }), [panel, openFromCanvas, showWorkbench, canvasFocus]);
  const backToCanvas = () => {
    if (canvasReturn) setCanvasFocus({ nodeId: canvasReturn.nodeId, token: Date.now() });
    setCanvasReturn(null);
    window.location.hash = 'canvas';
  };

  // A panel opened by the user takes focus at its heading; one opened from the composer leaves the keyboard there.
  const lastFocusPanel = useRef<RoomId | null | undefined>(undefined);
  useEffect(() => {
    if (panel !== currentPanel()) return;
    if (lastFocusPanel.current === undefined || lastFocusPanel.current === panel) { lastFocusPanel.current = panel; return; }
    lastFocusPanel.current = panel;
    if (!panel || panel === 'canvas' || document.activeElement === inputRef.current) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  // What the agent routes against is read when a message is sent, so its handlers stay stable.
  const toggleSide = () => setSideOpen(!sideOpen);
  const report = deferredView.report, design = deferredView.design, liveReport = view.report;
  const projectId = thread ? thread.projectId : book.draftProject;
  const projectMemory = useProjectMemory(projectId);
  const latest = useRef({ panel, light, theme, knowledge, traces, held, plan, report, liveReport, design, generation, owner, lastPanel, toggleSide, chatMode, chatService, reportService, mutate, projectId, memory: projectMemory.snapshot, localConfig });
  useEffect(() => { latest.current = { panel, light, theme, knowledge, traces, held, plan, report, liveReport, design, generation, owner, lastPanel, toggleSide, chatMode, chatService, reportService, mutate, projectId, memory: projectMemory.snapshot, localConfig }; });
  // A process event is written before its call, so a reload can say what was attempted even when no reply arrived.
  const record = useCallback((threadId: string | undefined, kind: ProcessEventKind, summary: string, extra: { correlationId?: string; refs?: string[]; detail?: Record<string, string | number | boolean | null> } = {}) => {
    if (!threadId) return false;
    try {
      return processJournal.append(threadId, makeProcessEvent({ id: crypto.randomUUID(), threadId, at: Date.now(), kind, summary, ...extra }));
    } catch { return false; }
  }, []);
  const canBackup = !!thread?.projectId && !!owner && owner !== 'guest';
  const backupProcess = useCallback(async () => {
    if (!thread?.projectId || !owner || owner === 'guest') {
      setBackup({ busy: false, note: '需要登录并归入项目后才能备份。' });
      return;
    }
    const syncKey = JSON.stringify({ title: thread.title, messages: thread.messages, events: activeProcess?.events ?? [], checkpoint: activeProcess?.checkpoint ?? null });
    if (lastSync.current.get(thread.id) === syncKey) {
      if (!activeProcess?.auto) setBackup({ busy: false, note: '云端已是最新。' });
      return;
    }
    setBackup({ busy: true, note: '正在备份到项目…' });
    try {
      let cloud: { revision: number } | null = null;
      try { cloud = await fetchCloudThread(thread.projectId, thread.id); }
      catch (error) { if (!(error instanceof HostedApiError) || error.status !== 404) throw error; }
      const saved = await saveCloudThread(thread.projectId, thread.id, {
        expectedRevision: cloud?.revision ?? 0, title: thread.title, messages: thread.messages,
        events: activeProcess?.events ?? [], checkpoint: activeProcess?.checkpoint ?? null,
      });
      lastSync.current.set(thread.id, syncKey);
      processJournal.setAuto(thread.id, true);
      setBackup({ busy: false, note: `已备份第 ${saved.revision} 版；之后会自动保持最新。` });
    } catch (error) {
      setBackup({ busy: false, note: errorMessage(error) });
    }
  }, [thread, owner, activeProcess]);
  const exportProcess = useCallback(() => {
    if (!thread) return;
    const name = recordName(thread, Date.now()).replace(/\.md$/u, '-过程.json');
    download(name, JSON.stringify({
      schemaVersion: 1, threadId: thread.id, title: thread.title, projectId: thread.projectId,
      exportedAt: new Date().toISOString(), messages: thread.messages,
      events: activeProcess?.events ?? [], checkpoint: activeProcess?.checkpoint ?? null,
    }, null, 2));
  }, [thread, activeProcess]);
  const toggleAuto = useCallback(() => {
    if (!thread || !canBackup) return;
    const next = !processJournal.auto(thread.id);
    processJournal.setAuto(thread.id, next);
    setBackup({ busy: false, note: next ? '自动备份已开启。' : '自动备份已关闭。' });
  }, [thread, canBackup]);
  useEffect(() => {
    if (!activeProcess?.auto || !canBackup) return;
    const timer = setTimeout(() => { void backupProcess(); }, 1200);
    return () => clearTimeout(timer);
  }, [activeProcess?.auto, activeProcess?.events, activeProcess?.checkpoint, messages, canBackup, backupProcess]);
  const writeCheckpoint = useCallback((threadId: string | undefined, messageId?: string) => {
    if (!threadId) return;
    const events = processJournal.events(threadId), last = events.at(-1);
    if (!last) return;
    processJournal.saveCheckpoint(threadId, makeProcessCheckpoint({
      id: crypto.randomUUID(), threadId, at: Date.now(), eventId: last.id, messageId,
      projectId: latest.current.projectId, memoryRevision: latest.current.memory?.revision,
    }));
  }, []);
  const agent = useMemo(() => {
    // Commands always run here, in the browser; other sentences go to the model when the user has chosen to talk with one.
    const send = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (latest.current.chatMode === 'model' && !/^[/／]/u.test(text)) ask(text);
      else local(text);
    };
    const local = (text: string) => {
      const { panel, light, theme, traces, held, plan, generation, memory, owner } = latest.current;
      const user: Message = { ...stamp(), role: 'user', text };
      const routed = route(text, { room: panel, light, theme, traces, results: held, plan, memory });
      const active = () => threads.view(owner).active ?? undefined;
      if ('draft' in routed) {
        threads.append([user]); record(active(), 'user.message', text); askDraft(routed.draft); return;
      }
      // Drafting with a model always starts with the user's consent, never with a call.
      if ('generate' in routed) {
        const agent: Message = { ...stamp(), role: 'agent', turn: generation.start(routed.generate) };
        threads.append([user, agent]);
        record(active(), 'user.message', text);
        record(active(), 'agent.message', turnText(agent.turn, 120));
        writeCheckpoint(active(), agent.id);
        return;
      }
      if ('lookup' in routed) {
        threads.append([user, { ...stamp(), role: 'pending', query: routed.lookup, explicit: routed.explicit }]);
        record(active(), 'user.message', text);
        return;
      }
      const agent: Message = { ...stamp(), role: 'agent', turn: routed.turn };
      threads.append([user, agent]);
      record(active(), 'user.message', text);
      record(active(), 'agent.message', turnText(routed.turn, 120));
      writeCheckpoint(active(), agent.id);
      if (routed.turn.act) perform(routed.turn.act);
    };
    // The first sentence of a conversation waits for consent: what goes to the service, what never does, who pays.
    const ask = (text: string) => {
      const { generation, chatService, owner } = latest.current;
      const localChat = chatService?.id === 'local';
      if (!chatService || (!localChat && generation.account !== 'ready')) {
        // Whatever the sentence routes to here, the user learns why the model was not asked.
        local(text);
        const reason = !chatService
          ? '还没有可用的模型服务；在模型菜单里配置本地 API Key，或登录后选择服务。'
          : '用模型对话需要先登录，或改用模型菜单里的本地模型。';
        say([span(reason, 'dim'), span('这一句按指令模式回答。', 'dim')]);
        return;
      }
      threads.append([{ ...stamp(), role: 'user', text }]);
      const thread = threads.view(owner).active;
      record(thread ?? undefined, 'user.message', text);
      if (text.length > TEXT_LIMIT) {
        record(thread ?? undefined, 'error', `模型对话一次最多 ${TEXT_LIMIT} 字`);
        writeCheckpoint(thread ?? undefined);
        say([span(`模型对话一次最多 ${TEXT_LIMIT} 字，这一句有 ${text.length} 字；请分开发送。`, 'error')]);
        return;
      }
      if (thread && consented.current.has(`${thread}:${chatService.id}`)) { turn(text); return; }
      const consent: Message = { ...stamp(), role: 'agent', turn: { lines: [[span('发给模型之前请确认：')]], cards: [{ kind: 'confirm', title: `用「${chatService.label}」回答`,
        lines: [[span('发送：这句话、这段对话最近的 '), span(String(HISTORY_LIMIT), 'gold'), span(' 条，项目照度、盲区、可回溯图表、已登记结果数量与项目记忆的摘要；模型请求时，还有已登记结果的标题、方法、有效样本、主要统计量与提醒，以及已确认研究发现的标题与解释。')],
          [span('不发送：问卷、原始数据与报告正文。模型看不到原始数据，也不能改动项目；它请求的操作由这里执行，改动前仍会问你。', 'dim')],
          [span(`模型读完工具结果后可能接着回答，一句话最多调用 ${MAX_STEPS} 次；费用按你的服务商计。这段对话之后的句子不再询问。`, 'dim')]],
        confirm: { label: '发送', action: { type: 'chat', text } }, cancel: '不发送' }] } };
      threads.append([consent]);
      record(thread ?? undefined, 'agent.message', '等待你确认发送给模型的内容');
    };
    const say = (line: Line, chips?: AgentTurn['chips']) => threads.append([{ ...stamp(), role: 'agent', turn: { lines: [line], chips } }]);
    // `next` continues a sentence from what the previous step's tools found; without it, a new sentence starts.
    // `seen` holds the tools already run for this sentence: a repeat draws no second card and finds nothing new. A
    // continuation keeps the service the sentence began with, the one the user agreed to, even if the menu has moved on.
    const turn = (text: string, next?: Chain) => {
      const { panel, light, traces, held, owner, mutate, projectId, memory, localConfig } = latest.current;
      const chatService = next?.service ?? latest.current.chatService;
      if (!chatService) return;
      // A later step stays in the sentence's own conversation, whichever one is open now, and stops if it was deleted.
      const book = threads.view(owner), home = next ? threads.threadOf(next.after) : book.threads.find(t => t.id === book.active);
      if (next && !home) return;
      const messages = home?.messages ?? [];
      const asked = messages.map(m => m.role === 'user' && m.text === text).lastIndexOf(true);
      // A sentence whose consent card was declined, or never answered, was not sent and is not sent later either.
      const declined = new Set(messages.flatMap((m, i) => m.role === 'agent' && m.answered !== 'confirmed'
        && m.turn.cards?.some(card => card.kind === 'confirm' && card.confirm.action.type === 'chat') ? [i - 1] : []));
      // A continuation sees the whole sentence so far: the reply and the tools' cards come after the question.
      const said = (next ? messages : messages.slice(0, asked < 0 ? messages.length : asked)).filter((_, i) => !declined.has(i));
      const request: ChatRequest = { schemaVersion: 1, idempotencyKey: crypto.randomUUID(), message: text, history: chatHistory(said.flatMap(chatLine)),
        context: chatContext(panel, light, traces, held), serviceId: chatService.id, serviceRevision: chatService.revision, consent: true,
        ...(projectId ? { projectId } : {}),
        ...(next ? { step: next.step, toolResults: next.results } : {}) };
      const waiting: Message = { ...stamp(), role: 'agent', model: { service: chatService.label, step: next?.step ?? 1, status: 'running' }, turn: { lines: next
        ? [[span('正在根据工具结果接着回答…', 'dim')]]
        : [[span('正在请'), span(`「${chatService.label}」`, 'strong'), span('回答…', 'dim')]] } };
      if (next) threads.appendAfter(next.after, waiting); else threads.append([waiting]);
      const threadId = threads.threadOf(waiting.id)?.id;
      const recorded = record(threadId, 'model.request', `请求「${chatService.label}」回答${next ? `（第 ${next.step} 步）` : ''}`, {
        correlationId: request.idempotencyKey,
        refs: [`project:${projectId ?? 'none'}`, `memory:${memory?.revision ?? 0}`],
        detail: {
          service: chatService.id, step: request.step ?? 1, history: request.history.length,
          projectId: projectId ?? null, memoryRevision: memory?.revision ?? 0,
          promptVersion: 'agent-chat/v1', contextBytes: JSON.stringify(request.context).length, toolResults: next?.results.length ?? 0,
        },
      });
      if (!recorded) {
        mark(waiting.id, 'failed');
        replace(waiting.id, { lines: [[span('过程日志没有保存，模型没有调用。', 'error')]] });
        writeCheckpoint(threadId, waiting.id);
        return;
      }
      const seen = next?.seen ?? new Set<string>();
      if (chatService.id === 'local') {
        if (!localConfig) {
          mark(waiting.id, 'failed');
          replace(waiting.id, { lines: [[span('本地模型还没有配置，请在模型菜单里填写 API Key。', 'error')]] });
          writeCheckpoint(threadId, waiting.id);
          return;
        }
        sendLocalChatTurn(request, localConfig, memory).then(receipt => settle(waiting.id, receipt, chatService.label, seen, chatService), failure => failLocal(waiting.id, failure, text));
        return;
      }
      sendChatTurn(mutate, request).then(receipt => settle(waiting.id, receipt, chatService.label, seen, chatService), failure => fail(waiting.id, failure, request.idempotencyKey, text));
    };
    // How a model call ended, on the message that holds it; the service and step stay those it was sent with.
    const mark = (messageId: string, status: NonNullable<ModelCall['status']>, service?: string, step?: number) =>
      threads.patch(messageId, m => m.role === 'agent' && m.model ? { ...m, model: { ...m.model, ...(service ? { service } : {}), ...(step ? { step } : {}), status } } : m);
    const replace = (messageId: string, next: AgentTurn) => threads.patch(messageId, m => m.role === 'agent' ? { ...m, turn: next } : m);
    // A receipt in place of the waiting line: the reply, marked as unverified, then each tool it asked for, run here.
    // A receipt read back by 核对回执 has no chain to continue: it settles, and the user can ask again from there.
    const settle = (messageId: string, receipt: ChatReceipt, label: string, seen = new Set<string>(), service?: Service) => {
      const threadId = threads.threadOf(messageId)?.id;
      record(threadId, 'model.receipt', `模型回执：${receipt.status === 'ready' ? '完成' : receipt.status === 'failed' ? '失败' : '结果未明'}`, {
        correlationId: messageId,
        refs: [`receipt:${receipt.id}`],
        detail: { status: receipt.status, step: receipt.step, errorCode: receipt.errorCode ?? null },
      });
      if (receipt.status === 'ready' && receipt.reply) {
        mark(messageId, 'ready', label, receipt.step);
        replace(messageId, { lines: [...replyLines(receipt.reply), [span('◆ ', 'cyan'), span(`${label} 的回答，未经核实；项目里的数字以工具读到的为准。`, 'dim')]] });
        const asked = receipt.message;
        if (receipt.droppedActions) threads.appendAfter(messageId, { ...stamp(), role: 'agent', turn: { lines: [[span(`模型还请求了 ${receipt.droppedActions} 个不在清单里的操作，没有执行。`, 'dim')]] } });
        // What the read-only tools found goes back to the model, until the sentence's last step.
        const fresh = receipt.actions.filter(action => { const key = action.tool + JSON.stringify(action.args); return !seen.has(key) && !!seen.add(key); });
        void Promise.all(fresh.map(action => run(messageId, action))).then(found => {
          const results = found.filter((r): r is ToolResult => !!r).slice(0, 4);
          if (results.length && asked && service && receipt.step < MAX_STEPS) turn(asked, { step: receipt.step + 1, results, seen, service, after: messageId });
        });
      } else if (receipt.status === 'failed') {
        mark(messageId, 'failed', label, receipt.step);
        replace(messageId, { lines: [[span('这一轮没有完成：', 'error'), span(CHAT_ERRORS[receipt.errorCode ?? ''] ?? '模型服务出错了。')]], chips: receipt.message ? [{ label: '再问一次', action: { type: 'say', text: receipt.message } }] : undefined });
      } else {
        mark(messageId, 'unknown', label, receipt.step);
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span('这一轮已记下；核对只读取回执，不会再次调用模型。')]], chips: [{ label: '核对回执', action: { type: 'check', turn: receipt.id, message: messageId }, primary: true }] });
      }
      writeCheckpoint(threadId, messageId);
    };
    const fail = (messageId: string, failure: unknown, turnId: string, text: string) => {
      const threadId = threads.threadOf(messageId)?.id;
      if (failure instanceof HostedApiError && isDefiniteChatRejection(failure.status, failure.code)) {
        mark(messageId, 'refused');
        replace(messageId, { lines: [[span('这一轮没有发出：', 'error'), span(CHAT_ERRORS[failure.code] ?? errorMessage(failure))]], chips: [{ label: '再问一次', action: { type: 'say', text } }] });
        record(threadId, 'error', `模型调用未发出：${failure.code}`, { correlationId: messageId, detail: { code: failure.code, status: failure.status } });
      } else {
        mark(messageId, 'unknown');
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span(`${errorMessage(failure)} 这一轮可能已经记下；核对只读取回执，不会再次调用模型。`)]], chips: [{ label: '核对回执', action: { type: 'check', turn: turnId, message: messageId }, primary: true }] });
        record(threadId, 'error', `模型调用结果未明：${errorMessage(failure)}`, { correlationId: messageId, detail: { code: failure instanceof HostedApiError ? failure.code : 'network', status: failure instanceof HostedApiError ? failure.status : 0 } });
      }
      writeCheckpoint(threadId, messageId);
    };
    // A local call leaves no receipt on this server to read back: a refusal before the provider was reached is certain;
    // anything else may have reached it, so 再问 warns instead of offering a 核对 that could only 404.
    const failLocal = (messageId: string, failure: unknown, text: string) => {
      const threadId = threads.threadOf(messageId)?.id;
      const refused = failure instanceof HostedApiError && failure.status >= 400 && failure.status < 500;
      const code = failure instanceof HostedApiError ? failure.code : 'network', reason = CHAT_ERRORS[code] ?? errorMessage(failure);
      mark(messageId, refused ? 'refused' : 'unknown');
      replace(messageId, { lines: [[span(refused ? '这一轮没有发出：' : '本地这一轮没有拿到回执：', 'error'), span(reason),
        ...(refused ? [] : [span(' 若服务商侧已经计费，再问会作为新的一轮计费。', 'dim')])]],
        chips: [{ label: '再问一次', action: { type: 'say', text } }] });
      record(threadId, 'error', `本地模型调用${refused ? '未发出' : '结果未明'}：${code}`, { correlationId: messageId, detail: { code, status: failure instanceof HostedApiError ? failure.status : 0 } });
      writeCheckpoint(threadId, messageId);
    };
    const check = (turnId: string, messageId: string) => {
      // The call is credited to the service it went to. A message from before calls were recorded does not name one, so
      // it is recorded as unknown rather than credited to whichever service is chosen now.
      const sent = threads.find(messageId);
      const label = sent?.role === 'agent' && sent.model ? sent.model.service : UNRECORDED_SERVICE;
      if (sent?.role === 'agent' && !sent.model) threads.patch(messageId, m => m.role === 'agent' ? { ...m, model: { service: label, step: 1, status: 'unknown' } } : m);
      replace(messageId, { lines: [[span('正在核对回执…', 'dim')]] });
      readChatTurn(turnId).then(receipt => settle(messageId, receipt, label),
        failure => failure instanceof HostedApiError && failure.status === 404
          ? (mark(messageId, 'refused'), replace(messageId, { lines: [[span('这一轮没有发出，', 'error'), span('没有产生费用，可以再问一次。')]] }))
          : fail(messageId, failure, turnId, ''));
    };

    // Drafting a report section: consent first, every time, naming what goes to the service and the number rule.
    const askDraft = (nodeId: string) => {
      const { generation, reportService, held, report } = latest.current;
      const title = blueprintNode(nodeId).title;
      if (generation.account !== 'ready') { say([span('起草要调用你自己的模型服务，需要先登录。', 'dim')], [{ label: '邮箱登录 ↗', action: { type: 'href', href: '/login' }, primary: true }]); return; }
      if (!held || !report) { say([span(`起草「${title}」要先读到报告与登记结果；这次访问还没有打开报告与 PPT。`, 'dim')], [{ label: '/报告', action: { type: 'say', text: '/报告' }, primary: true }]); return; }
      if (!reportService) { say([span('起草需要一个启用了「报告」能力的模型服务（在模型服务里勾选）。', 'dim')], [{ label: '/模型', action: { type: 'say', text: '/模型' }, primary: true }]); return; }
      const facts = draftFacts(held, nodeId).length, findings = standingFindings(held).length, existing = sectionText(report, nodeId).length;
      threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('起草之前请确认：')]], cards: [{ kind: 'confirm', title: `用「${reportService.label}」起草「${title}」`,
        lines: [
          [span('发送：这一节在报告蓝图里的写作要求（目的、步骤、需要的元素）、课题名称与目的、'), span(String(facts), 'gold'),
            span(' 条事实（已登记结果的方法、有效样本、统计量与表中数字）、'), span(String(findings), 'gold'), span(` 条已确认研究发现的标题与解释${existing ? `、本节已有的 ${existing} 字正文` : ''}。`)],
          [span('不发送：问卷题目、原始数据与报告其他章节的正文。', 'dim')],
          [span('模型只能用事实编号引用数字，自己写了数字的段落整段丢弃；数字由这里按登记结果填入。拟稿未经核实，你确认后才写进报告。费用按你的服务商计。', 'dim')],
        ], confirm: { label: '起草', action: { type: 'draft', node: nodeId } }, cancel: '不起草' }] } }]);
    };
    const draftNow = (nodeId: string) => {
      const { reportService, held, report, design, mutate } = latest.current;
      if (!reportService || !held || !report) { askDraft(nodeId); return; }
      const title = blueprintNode(nodeId).title;
      const { request, facts } = draftRequest({ nodeId, held, content: report, design, service: reportService });
      const waiting: Message = { ...stamp(), role: 'agent', model: { service: reportService.label, step: 1, status: 'running' },
        turn: { lines: [[span('正在请'), span(`「${reportService.label}」`, 'strong'), span(`起草「${title}」…`, 'dim')]] } };
      threads.append([waiting]);
      sendDraft(mutate, request).then(receipt => settleDraft(waiting.id, receipt, reportService.label, nodeId, facts), failure => failDraft(waiting.id, failure, request.idempotencyKey, nodeId, facts));
    };
    const draftError = (code: string | null) => code === 'capability_unavailable' ? '这个模型服务没有启用「报告」能力。' : CHAT_ERRORS[code ?? ''] ?? '模型服务出错了。';
    // A draft in place of the waiting line: its paragraphs with each fact's value in gold, marked unverified, ready to adopt.
    const settleDraft = (messageId: string, receipt: DraftReceipt, label: string, nodeId: string, facts: Fact[]) => {
      const title = blueprintNode(nodeId).title, again = { label: '重新起草', action: { type: 'say' as const, text: `/起草 ${title}` } };
      if (receipt.status === 'ready' && receipt.paragraphs.length) {
        mark(messageId, 'ready', label, 1);
        replace(messageId, {
          lines: [[span(`「${title}」拟稿 `), span(String(receipt.paragraphs.length), 'gold'), span(' 段：')], ...receipt.paragraphs.map(p => draftLine(p, facts)),
            ...(receipt.droppedParagraphs ? [[span(`模型另写了 ${receipt.droppedParagraphs} 段自造数字或引用了不存在的事实，已丢弃。`, 'dim')]] : []),
            [span('◆ ', 'cyan'), span(`${label} 的拟稿，未经核实；金色数字由登记结果填入。`, 'dim')]],
          chips: [{ label: `写进「${title}」`.slice(0, 26), action: { type: 'adopt', node: nodeId, paragraphs: receipt.paragraphs.map(p => draftText(p, facts)),
            cited: [...new Set(receipt.paragraphs.flatMap(p => p.facts))].flatMap(id => facts.filter(f => f.id === id).map(f => f.text)) }, primary: true }, again],
        });
      } else if (receipt.status === 'failed' || receipt.status === 'ready') {
        mark(messageId, 'failed', label, 1);
        replace(messageId, { lines: [[span('这次起草没有完成：', 'error'), span(draftError(receipt.errorCode))]], chips: [again] });
      } else {
        mark(messageId, 'unknown', label, 1);
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span('这次起草已记下；核对只读取回执，不会再次调用模型。')]],
          chips: [{ label: '核对回执', action: { type: 'checkDraft', draft: receipt.id, message: messageId, node: nodeId, facts }, primary: true }] });
      }
    };
    const failDraft = (messageId: string, failure: unknown, draftId: string, nodeId: string, facts: Fact[]) => {
      const again = { label: '重新起草', action: { type: 'say' as const, text: `/起草 ${blueprintNode(nodeId).title}` } };
      if (failure instanceof HostedApiError && isDefiniteChatRejection(failure.status, failure.code)) {
        mark(messageId, 'refused');
        replace(messageId, { lines: [[span('这次起草没有发出：', 'error'), span(failure.code === 'capability_unavailable' ? draftError(failure.code) : CHAT_ERRORS[failure.code] ?? errorMessage(failure))]], chips: [again] });
      } else {
        mark(messageId, 'unknown');
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span(`${errorMessage(failure)} 这次起草可能已经记下；核对只读取回执，不会再次调用模型。`)]],
          chips: [{ label: '核对回执', action: { type: 'checkDraft', draft: draftId, message: messageId, node: nodeId, facts }, primary: true }] });
      }
    };
    const checkDraft = (draftId: string, messageId: string, nodeId: string, facts: Fact[]) => {
      const sent = threads.find(messageId);
      const label = sent?.role === 'agent' && sent.model ? sent.model.service : UNRECORDED_SERVICE;
      replace(messageId, { lines: [[span('正在核对回执…', 'dim')]] });
      readDraft(draftId, new Set(facts.map(f => f.id))).then(receipt => settleDraft(messageId, receipt, label, nodeId, facts),
        failure => failure instanceof HostedApiError && failure.status === 404
          ? (mark(messageId, 'refused'), replace(messageId, { lines: [[span('这次起草没有发出，', 'error'), span('没有产生费用，可以重新起草。')]] }))
          : failDraft(messageId, failure, draftId, nodeId, facts));
    };
    // The knowledge index loads once per visit; a lookup in the loop waits for it a little rather than going unanswered.
    const knowledgeReady = async (limit = 10_000) => {
      for (const started = Date.now(); !latest.current.knowledge.ready && Date.now() - started < limit;) await new Promise(resolve => setTimeout(resolve, 250));
      return latest.current.knowledge.ready;
    };
    // A tool the model asked for, run as the matching command runs; drafting still begins with its own consent card.
    // A read-only tool's finding is returned so it can go back to the model.
    const run = async (afterId: string, action: ChatAction): Promise<ToolResult | null> => {
      const { panel, light, theme, traces, held, plan, generation, knowledge, memory } = latest.current;
      const threadId = threads.threadOf(afterId)?.id;
      record(threadId, 'tool.request', `工具：${action.tool}`, { correlationId: afterId, detail: { tool: action.tool, args: JSON.stringify(action.args).slice(0, 500) } });
      const routed = toolTurn(action, { room: panel, light, theme, traces, results: held, plan, memory });
      if ('draft' in routed) return null;
      if ('generate' in routed) { threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: generation.start(routed.generate) }); return null; }
      if ('lookup' in routed) {
        let found: AgentTurn;
        if (!(knowledge.ready || await knowledgeReady())) found = { lines: [[span('知识镜还在加载，这次没有查到「', 'dim'), span(routed.lookup, 'strong'), span('」，稍后可以再问。', 'dim')]] };
        else {
          try { found = lookupTurn(routed.lookup, await latest.current.knowledge.search(routed.lookup), routed.explicit); }
          catch { found = { lines: [[span('知识镜暂时没有回应，请稍后再问。', 'error')]] }; }
        }
        threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: found });
        record(threadId, 'tool.result', `工具结果：${action.tool}`, { correlationId: afterId, detail: { tool: action.tool, result: turnText(found, 500) } });
        return { tool: 'lookup', text: turnText(found) };
      }
      threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: routed.turn });
      record(threadId, 'tool.result', `工具结果：${action.tool}`, { correlationId: afterId, detail: { tool: action.tool, result: turnText(routed.turn, 500) } });
      writeCheckpoint(threadId, afterId);
      if (routed.turn.act) perform(routed.turn.act);
      return isResultTool(action.tool) ? { tool: action.tool, text: turnText(routed.turn) } : null;
    };
    const perform = (action: AgentAction) => {
      switch (action.type) {
        case 'open': go(action.room); break;
        case 'theme': saveTheme(action.theme); break;
        case 'search': latest.current.knowledge.openSearch(); break;
        case 'entry': latest.current.knowledge.open(action.id); break;
        case 'clear': { const active = threads.view(latest.current.owner).active; if (active) { threads.remove(active); processJournal.remove(active); } focusInput(); break; }
        // Only paths of this site; a stored conversation is never trusted to navigate anywhere else.
        case 'href': if (/^\/(?!\/)/.test(action.href)) window.location.assign(action.href); break;
        case 'say': send(action.text); break;
        case 'chat': {
          const { owner, chatService } = latest.current, thread = threads.view(owner).active;
          if (thread && chatService) consented.current.add(`${thread}:${chatService.id}`);
          turn(action.text);
          break;
        }
        case 'check': check(action.turn, action.message); break;
        case 'draft': draftNow(action.node); break;
        case 'checkDraft': checkDraft(action.draft, action.message, action.node, action.facts); break;
        // A draft adopted from a stored conversation is checked again: a blueprint section, a few paragraphs of text.
        case 'adopt': {
          let title: string;
          try { title = blueprintNode(action.node).title; } catch { break; }
          const paragraphs = action.paragraphs.filter(p => typeof p === 'string' && p.trim()).slice(0, 8).map(p => p.slice(0, 2000));
          if (!paragraphs.length) break;
          // A draft's numbers stand only while the facts it cites are still the project's facts, word for word.
          const { liveReport } = latest.current;
          const current = liveReport ? new Set(draftFacts({ results: liveReport.quality?.results ?? [], findings: [], pending: false, placed: [] }, action.node).map(f => f.text)) : null;
          if (!current || !Array.isArray(action.cited) || action.cited.some(text => typeof text !== 'string' || !current.has(text))) {
            say([span(current ? '登记结果在起草之后变了，拟稿里的数字可能已经过时，没有写入。' : '要先读到报告与登记结果才能核对拟稿里的数字；打开报告与 PPT 后再写入。', 'error')],
              [current ? { label: '重新起草', action: { type: 'say', text: `/起草 ${title}` }, primary: true } : { label: '/报告', action: { type: 'say', text: '/报告' }, primary: true }]);
            break;
          }
          sendToReport({ id: crypto.randomUUID(), node: action.node, source: '证见 Agent 拟稿', items: paragraphs.map(text => ({ kind: 'paragraph', text })) });
          go('editor');
          say([span(`已把拟稿交给报告与 PPT，写进「${title}」；可以在编辑器里修改或撤销。`, 'dim')]);
          break;
        }
        // The report applies it as one undoable step once its editor is open, as it does for the sampling module.
        case 'place':
          sendToReport({ id: crypto.randomUUID(), node: '', source: '证见 Agent', items: action.results.map(resultId => ({ kind: 'result', resultId })) });
          go('editor');
          say([span('已交给右侧的报告与 PPT 写入；写了哪些内容会显示在编辑器顶部，可以撤销。', 'dim')]);
          break;
      }
    };
    const answer = (id: string, answered: 'confirmed' | 'cancelled', action?: AgentAction) => {
      threads.patch(id, m => m.role === 'agent' ? { ...m, answered } : m);
      if (answered === 'confirmed' && action) perform(action);
      else focusInput();
    };
    return { send, perform, answer };
  }, [go, focusInput, sendToReport, record, writeCheckpoint]);

  // Lookups wait for the knowledge index, then answer in place of their placeholder, in their own conversation.
  const pendingLookup = useMemo(() => book.threads.flatMap(t => t.messages).find(m => m.role === 'pending'), [book]);
  const { ready: knowledgeReady, search } = knowledge;
  useEffect(() => {
    if (pendingLookup?.role !== 'pending' || !knowledgeReady) return;
    let live = true;
    const settle = (turn: AgentTurn) => threads.patch(pendingLookup.id, () => ({ id: pendingLookup.id, at: Date.now(), role: 'agent', turn }));
    search(pendingLookup.query)
      .then(hits => { if (live) settle(lookupTurn(pendingLookup.query, hits, pendingLookup.explicit)); })
      .catch(() => { if (live) settle({ lines: [[{ text: '知识镜暂时没有回应，请稍后再问。', mark: 'error' }]] }); });
    return () => { live = false; };
  }, [pendingLookup, knowledgeReady, search]);

  // "/" anywhere outside a field starts a command, bringing the conversation back if the panel fills the screen;
  // Ctrl B folds the sidebar; Ctrl \ closes or reopens the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) focusInput();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'b') { event.preventDefault(); latest.current.toggleSide(); }
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        const reopen = latest.current.lastPanel;
        if (currentPanel()) window.location.hash = ''; else if (reopen) window.location.hash = reopen;
      }
      if (event.key === 'Escape') setRailMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusInput]);

  // The panel is widened or narrowed by dragging its edge; the width is remembered in this browser.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = Math.min(panelWidth, available);
    const limit = () => Math.max(MIN_PANEL, window.innerWidth - RAIL - (sideOpen ? SIDEBAR : 0) - MIN_TALK);
    setDragging(true);
    const move = (e: PointerEvent) => setPanelWidth(Math.round(Math.min(limit(), Math.max(MIN_PANEL, startWidth + startX - e.clientX))));
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPanelWidth(width => { try { if (width) window.localStorage.setItem(PANEL_KEY, String(width)); } catch { /* Not remembered without storage. */ } return width; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const projects = lists.projects.map(p => ({ id: p.id, label: p.title }));
  const services = chatServices.map(s => ({ id: s.id, label: s.label, detail: [s.model, s.capabilities.includes('research') && '对话', s.capabilities.includes('questionnaire') && '起草', s.capabilities.includes('report') && '报告'].filter(Boolean).join(' · ') }));
  const projectLabel = projects.find(p => p.id === projectId)?.label;
  const email = account?.user?.email ?? '';
  const here = panel ? roomById(panel) : null, lit = panel ? roomLight(light, panel) : null;

  return <ThemeProvider value={theme}><WorkbenchNavProvider value={nav}><GenerationProvider value={generation}>
    <div className={`workbench ${styles.shell}`} data-theme={theme} data-side={sideOpen ? 'open' : 'closed'} data-panel={panel ?? 'none'} data-expanded={expanded && !!panel}>
      <a className={styles.skip} href="#agent-command-line" onClick={event => { event.preventDefault(); focusInput(); }}>跳到输入框</a>

      <nav ref={railRef} className={styles.rail} aria-label="工具" style={{ position: 'relative' }}>
        <button type="button" className={styles.railButton} aria-label="对话" title="对话" aria-pressed={!panel} onClick={() => {
          // From a panel filling the screen the conversation comes back beside it; otherwise the panel closes.
          if (!expanded) closePanel();
          focusInput();
        }}><Icon name="chat" /></button>
        <button ref={modulesRef} type="button" className={styles.railButton} aria-label="模块" title="模块" aria-haspopup="dialog" aria-expanded={railMenu === 'modules'} aria-pressed={!!panel && panel !== 'overview'} onClick={() => setRailMenu(railMenu === 'modules' ? null : 'modules')}><Icon name="grid" /></button>
        <button type="button" className={styles.railButton} aria-label="项目全景" title="项目全景" aria-pressed={panel === 'overview'} onClick={() => panel === 'overview' ? closePanel() : go('overview')}><Icon name="lamp" /></button>
        <button type="button" className={styles.railButton} aria-label={`知识镜搜索（${shortcut}）`} title={`知识镜搜索（${shortcut}）`} onClick={knowledge.openSearch}><Icon name="book" /></button>
        <span className={styles.spacer} />
        <button type="button" className={styles.railButton} aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} title={theme === 'dark' ? '浅色' : '深色'} onClick={event => switchTheme(theme === 'dark' ? 'light' : 'dark', event)}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        {owner && owner !== 'guest'
          ? <button type="button" className={styles.avatar} aria-label={`账号：${email}`} title={email} aria-haspopup="menu" aria-expanded={railMenu === 'account'}
            onClick={() => setRailMenu(railMenu === 'account' ? null : 'account')}>{(email[0] ?? '?').toUpperCase()}</button>
          : <Link className={styles.avatar} data-guest="true" href="/login" title="登录">访</Link>}
        {railMenu === 'account' && <div className={styles.menu} role="menu" aria-label="账号" aria-describedby="agent-account-note" style={{ left: 50, bottom: 10, zIndex: 60 }}>
          <p id="agent-account-note" className={styles.menuNote} aria-hidden="true">{email}</p>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { go('workspace'); setRailMenu(null); }}>项目门户</button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { go('services'); setRailMenu(null); }}>模型服务</button>
          <Link role="menuitem" className={styles.menuItem} href="/agent/workspace">对话工作区 ↗</Link>
          <Link role="menuitem" className={styles.menuItem} href="/workspace">经典工作台 ↗</Link>
          {/* Signing out asks first when this tab still holds unsaved drafts. */}
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setRailMenu(null); setAccountNotice(''); logout().catch(error => setAccountNotice(errorMessage(error))); }}>退出登录</button>
        </div>}
        {railMenu === 'modules' && <div ref={launcherRef} className={styles.launcher} role="dialog" aria-label="模块" onKeyDown={event => {
          // Arrow keys walk the modules in order; Esc closes and gives focus back to the rail.
          if (event.key === 'Escape') { event.preventDefault(); setRailMenu(null); modulesRef.current?.focus(); return; }
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
          if (!step) return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], at = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(at + step + buttons.length) % buttons.length]?.focus();
        }}>
          <div className={styles.launcherHead}><b>模块</b><small>在右侧面板打开；也可以在输入框里输入 <kbd>/</kbd> 加模块名，例如 /问卷</small></div>
          {/* The research path in working order: what each step is for, and how much evidence it holds where that is measured. */}
          <p className={styles.launcherLabel}>{ROOM_GROUPS.path}</p>
          <div className={styles.steps}>
            {ROOMS.filter(r => r.group === 'path').map((r, i) => {
              const lightOf = roomLight(light, r.id);
              // The visible text is the name, so voice control can say what it sees: number, module, state, purpose.
              return <button key={r.id} type="button" className={styles.step} aria-current={panel === r.id ? 'true' : undefined} onClick={() => pick(r.id)}>
                <span className={styles.glyph} aria-hidden="true">{r.glyph}</span>
                <b><small>{String(i + 1).padStart(2, '0')}</small>{r.name}</b>
                <span className={styles.stepLight}>{panel === r.id ? <em>已打开</em> : lightOf && (lightOf.score > 0 ? <><LightBar score={lightOf.score} />照度 {percent(lightOf.score)}</> : <i>尚无证据</i>)}</span>
                <span className={styles.stepLine}>{r.line}</span>
              </button>;
            })}
          </div>
          {GROUPS.filter(group => group !== 'path').map(group => <div key={group}>
            <p className={styles.launcherLabel}>{ROOM_GROUPS[group]}</p>
            <div className={styles.extras}>
              {ROOMS.filter(r => r.group === group).map(r => <button key={r.id} type="button" className={styles.extra} aria-current={panel === r.id ? 'true' : undefined} title={r.line}
                onClick={() => pick(r.id)}>
                <span className={styles.glyph} aria-hidden="true">{r.glyph}</span>{r.name}
              </button>)}
            </div>
          </div>)}
        </div>}
      </nav>

      <Sidebar book={book} projects={projects} account={generationAccount} email={email} notice={accountNotice}
        failed={!!sessionError} onRetry={() => { setAccountNotice(''); refresh().catch(error => setAccountNotice(errorMessage(error))); }} onNew={id => { threads.draft(id); focusInput(); }}
        onSelect={threads.select} onRemove={id => { threads.remove(id); processJournal.remove(id); }} onRename={threads.rename} onCollapse={() => setSideOpen(false)} />

      <main className={styles.main} aria-label="对话" data-dialog-background>
        <header className={styles.top}>
          {!sideOpen && <button type="button" className={styles.iconButton} aria-label="展开侧栏（Ctrl B）" title="展开侧栏（Ctrl B）" onClick={() => setSideOpen(true)}><Icon name="sidebar" /></button>}
          <span className={styles.topTitle}>{thread?.title ?? '新对话'}{projectLabel && <small>{projectLabel}</small>}</span>
          <span className={styles.spacer} />
          {thread && <button type="button" className={styles.processButton} onClick={() => setShowProcess(true)}>过程</button>}
          {thread && messages.length > 0 && <button type="button" className={styles.iconButton} aria-label="导出对话记录（Markdown）" title="导出对话记录：可作 AI 使用说明的附件"
            onClick={() => download(recordName(thread, Date.now()), conversationMarkdown(thread, Date.now()))}><Icon name="download" /></button>}
          {!panel && lastPanel && <button type="button" className={styles.iconButton} aria-label={`重新打开${roomById(lastPanel).name}（Ctrl \\）`} title={`重新打开${roomById(lastPanel).name}（Ctrl \\）`} onClick={() => go(lastPanel)}><Icon name="panel" /></button>}
        </header>
        {showProcess && <ProcessTimeline events={activeProcess?.events ?? []} checkpoint={activeProcess?.checkpoint} onClose={() => setShowProcess(false)}
          canBackup={canBackup} backupBusy={backup.busy} backupNote={backup.note} onBackup={() => void backupProcess()}
          autoBackup={activeProcess?.auto === true} onToggleAuto={toggleAuto} onExport={exportProcess} />}
        <div ref={scrollRef} className={styles.scroll}>
          {messages.length ? <Transcript messages={messages} scrollRef={scrollRef} onAction={agent.perform} onAnswer={agent.answer} />
            : <div className={styles.empty}>
              <div className={styles.emptyMark}><BrandMark size={44} /></div>
              <h1>我们要研究什么？</h1>
              <p>{chatMode === 'model'
                ? `对话由「${chatService?.label ?? '模型服务'}」回答：每段对话第一次发送前请你确认；它看不到原始数据，项目里的数字以工具读到的为准。`
                : '对话是指令模式：听得懂命令和常用说法，听不懂会直说，不编造。在模型菜单里可以改用你自己的模型服务对话。'}</p>
              <div className={styles.suggestions}>{SUGGESTIONS.map(s => <button key={s} type="button" onClick={() => agent.send(s)}>{s}</button>)}</div>
              {!localConfig && !chatService && <p className={styles.keyHint}>
                <button type="button" onClick={() => setLocalOpen(true)}>配置 API Key 开始对话</button>
                <span>无需登录；Key 只保存在本浏览器</span>
              </p>}
              {localConfig && chatMode === 'command' && <p className={styles.keyHint}>
                <button type="button" onClick={() => setChatMode('model')}>用本地模型对话</button>
                <span>{localConfig.label}</span>
              </p>}
            </div>}
        </div>
        <Composer onSend={agent.send} inputRef={inputRef} account={generationAccount} onNeedLists={() => loadLists(true)}
          projects={projects} projectId={projectId} onProject={threads.setProject}
          services={services} serviceId={services.some(s => s.id === preferredService) ? preferredService : services[0]?.id ?? ''} onService={prefer}
          mode={chatMode} onMode={setChatMode} chatLabel={chatService?.label ?? ''} onOpen={go}
          localOpen={localOpen} onLocalOpen={setLocalOpen} />
      </main>

      <section className={styles.panel} hidden={!panel} aria-label={here ? here.name : '模块'} data-dialog-background
        style={{ ['--panel-w' as string]: `${panelWidth}px` }}>
        <div className={styles.resize} data-dragging={dragging} role="separator" aria-orientation="vertical" aria-label="拖动调整面板宽度" onPointerDown={startResize} />
        {here && <header className={styles.panelHead}>
          <h2 ref={headingRef} tabIndex={-1}>{here.name}</h2>
          {lit && <span className={styles.panelLight}><LightBar score={lit.score} /><b>{percent(lit.score)}</b>{lit.summary}</span>}
          <span className={styles.spacer} />
          {panel !== 'overview' && <Link className={styles.panelLink} href={`/workspace#${panel}`}>在经典工作台打开 ↗</Link>}
          <button type="button" className={styles.iconButton} aria-pressed={expanded} aria-label={expanded ? '还原，显示对话' : '铺满，暂时收起对话'}
            title={expanded ? '还原，显示对话' : '铺满，暂时收起对话'} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? 'shrink' : 'expand'} /></button>
          <button type="button" className={styles.iconButton} aria-label="关闭面板（Ctrl \）" title="关闭面板（Ctrl \）" onClick={closePanel}><Icon name="close" /></button>
        </header>}
        <div className={styles.panelBody} data-room={panel ?? undefined}>
          {panel === 'overview' && <Lobby light={light} view={deferredView} traces={traces.length} memory={projectMemory.snapshot} projectId={projectId} onOpen={go} onSay={agent.send} headingRef={null} />}
          {(Object.keys(panels) as WorkbenchPanel[]).filter(id => id !== 'overview' && visited.includes(id)).map(id =>
            <div key={id} className={styles.pane} data-workbench-panel={id} hidden={panel !== id}>{panels[id]}</div>)}
        </div>
        {canvasReturn && panel && panel !== 'canvas' && <div className={styles.canvasReturn} role="region" aria-label="画布返回">
          <button type="button" onClick={backToCanvas}>⟲ 返回画布{canvasReturn.title ? ` · ${canvasReturn.title}` : ''}</button>
          <button type="button" aria-label="不再显示返回画布" onClick={() => setCanvasReturn(null)}>×</button>
        </div>}
      </section>
    </div>
  </GenerationProvider></WorkbenchNavProvider></ThemeProvider>;
}

function subscribeResize(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}

const span = (text: string, mark?: Mark): Span => mark ? { text, mark } : { text };
/** A conversation entry as plain text for the model: what was said, without cards or buttons. */
function chatLine(message: Message): ChatLine[] {
  if (message.role === 'user') return [{ role: 'user', text: message.text }];
  // A question put to the user (a consent or confirmation) is not part of what was said about the research.
  if (message.role !== 'agent' || message.turn.cards?.some(card => card.kind === 'confirm' || card.kind === 'consent')) return [];
  const text = message.turn.lines.map(line => line.map(spanText).join('')).join('\n').trim();
  return text ? [{ role: 'agent', text }] : [];
}

/** Saves text as a file the user downloads; nothing leaves the browser. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
