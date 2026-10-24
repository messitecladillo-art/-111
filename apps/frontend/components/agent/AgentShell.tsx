'use client';

import Link from 'next/link';
import { flushSync } from 'react-dom';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { useWorkbenchModules } from '@/components/EviXPlatform';
import { WorkbenchNavProvider, type WorkbenchNav, type WorkbenchPanel } from '@/components/WorkbenchShell';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { errorMessage, HostedApiError } from '@/components/hosted/api-client';
import { CHAT_ERRORS, HISTORY_LIMIT, MAX_STEPS, TEXT_LIMIT, chatContext, chatHistory, isDefiniteChatRejection, isResultTool, turnText, type ChatAction, type ChatLine, type ChatReceipt, type ChatRequest, type ToolResult } from '@/lib/agent/chat';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { ThemeProvider, saveTheme, switchTheme, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { percent } from '@/lib/agent/glyphs';
import { illuminate, roomLight } from '@/lib/agent/illumination';
import { traceExhibits } from '@/lib/agent/provenance';
import { ROOM_GROUPS, ROOMS, isRoomId, roomById, type RoomGroup, type RoomId } from '@/lib/agent/rooms';
import { lookupTurn, route, toolTurn, type AgentAction, type AgentTurn, type Line, type Mark, type Span } from '@/lib/agent/router';
import { readChatTurn, sendChatTurn } from './chat-client';
import Composer from './Composer';
import { GenerationProvider, useGeneration } from './generation';
import { LightBar } from './Glyphs';
import { Icon } from './icons';
import Lobby from './Lobby';
import Sidebar from './Sidebar';
import Transcript from './Transcript';
import { stamp, threads, type Message } from './threads';
import type { Service } from '@evix/shared';

/** A sentence's later steps: what the tools found, which ran already, and the service the user agreed to. */
type Chain = { step: number; results: ToolResult[]; seen: Set<string>; service: Service };
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
  const { panels, view, publishProposal } = useWorkbenchModules(true);
  const knowledge = useKnowledge();
  const theme = useThemePreference('light');
  const { session: account, loading: accountLoading, error: sessionError, logout, refresh, mutate } = useHostedSession();
  const [accountNotice, setAccountNotice] = useState('');
  // Conversations belong to whoever is signed in; they are bound once the session is known and never shown to another.
  const owner = accountLoading ? null : account?.authenticated && account.user?.id ? account.user.id : 'guest';
  useEffect(() => { if (owner) threads.bind(owner); }, [owner]);
  const book = useSyncExternalStore(threads.subscribe, () => threads.view(owner), threads.serverSnapshot);
  const thread = book.threads.find(t => t.id === book.active) ?? null;
  const messages = thread?.messages ?? EMPTY_MESSAGES;
  const panel = useSyncExternalStore(subscribeHash, currentPanel, () => null);
  const shortcut = useSyncExternalStore(subscribeNothing, searchKey, () => '⌘K');
  // The report is re-scored as it is typed; deferring keeps typing in the editor ahead of the benchmark.
  const deferredView = useDeferredValue(view);
  const light = useMemo(() => illuminate(deferredView), [deferredView]);
  const traces = useMemo(() => traceExhibits(deferredView.report, deferredView.design), [deferredView]);

  const [visited, setVisited] = useState<RoomId[]>([]);
  if (panel && panel !== 'overview' && !visited.includes(panel)) setVisited([...visited, panel]);
  const [railMenu, setRailMenu] = useState<'modules' | 'account' | null>(null);
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
  const railRef = useRef<HTMLElement>(null);
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
  const generation = useGeneration(publishProposal, go);
  const { account: generationAccount, load: loadLists, lists, preferredService, prefer } = generation;
  // Projects and services fill the sidebar and the composer's menus as soon as an account is known.
  useEffect(() => { if (generationAccount === 'ready') loadLists(); }, [generationAccount, loadLists]);
  // Talking with a model is the user's choice, for this visit; every conversation asks once before its first sentence goes.
  const [chatMode, setChatMode] = useState<'command' | 'model'>('command');
  const consented = useRef(new Set<string>());
  // The chat uses the service the model menu shows as chosen, never another one behind it.
  const chosenService = lists.services.some(s => s.id === preferredService) ? preferredService : lists.services[0]?.id ?? '';
  const chatService = lists.services.find(s => s.id === chosenService && s.capabilities.includes('research')) ?? null;

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
  const latest = useRef({ panel, light, theme, knowledge, traces, generation, owner, lastPanel, toggleSide, chatMode, chatService, mutate });
  useEffect(() => { latest.current = { panel, light, theme, knowledge, traces, generation, owner, lastPanel, toggleSide, chatMode, chatService, mutate }; });
  const agent = useMemo(() => {
    // Commands always run here, in the browser; other sentences go to the model when the user has chosen to talk with one.
    const send = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (latest.current.chatMode === 'model' && !/^[/／]/u.test(text)) ask(text);
      else local(text);
    };
    const local = (text: string) => {
      const { panel, light, theme, traces, generation } = latest.current;
      const user: Message = { ...stamp(), role: 'user', text };
      const routed = route(text, { room: panel, light, theme, traces });
      // Drafting with a model always starts with the user's consent, never with a call.
      if ('generate' in routed) { threads.append([user, { ...stamp(), role: 'agent', turn: generation.start(routed.generate) }]); return; }
      if ('lookup' in routed) { threads.append([user, { ...stamp(), role: 'pending', query: routed.lookup, explicit: routed.explicit }]); return; }
      threads.append([user, { ...stamp(), role: 'agent', turn: routed.turn }]);
      if (routed.turn.act) perform(routed.turn.act);
    };
    // The first sentence of a conversation waits for consent: what goes to the service, what never does, who pays.
    const ask = (text: string) => {
      const { generation, chatService, owner } = latest.current;
      if (generation.account !== 'ready' || !chatService) {
        // Whatever the sentence routes to here, the user learns why the model was not asked.
        local(text);
        say([span(generation.account === 'ready' ? '所选的模型服务没有启用「研究」能力（在模型菜单里换一个，或在模型服务里勾选），' : '用模型对话需要先登录，', 'dim'), span('这一句按指令模式回答。', 'dim')]);
        return;
      }
      threads.append([{ ...stamp(), role: 'user', text }]);
      if (text.length > TEXT_LIMIT) { say([span(`模型对话一次最多 ${TEXT_LIMIT} 字，这一句有 ${text.length} 字；请分开发送。`, 'error')]); return; }
      const thread = threads.view(owner).active;
      if (thread && consented.current.has(`${thread}:${chatService.id}`)) { turn(text); return; }
      threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('发给模型之前请确认：')]], cards: [{ kind: 'confirm', title: `用「${chatService.label}」回答`,
        lines: [[span('发送：这句话、这段对话最近的 '), span(String(HISTORY_LIMIT), 'gold'), span(' 条，以及项目照度、盲区与可回溯图表的摘要。')],
          [span('不发送：问卷、数据与报告的原文。模型看不到原始数据，也不能改动项目；它请求的操作由这里执行，改动前仍会问你。', 'dim')],
          [span(`模型读完工具结果后可能接着回答，一句话最多调用 ${MAX_STEPS} 次；费用按你的服务商计。这段对话之后的句子不再询问。`, 'dim')]],
        confirm: { label: '发送', action: { type: 'chat', text } }, cancel: '不发送' }] } }]);
    };
    const say = (line: Line, chips?: AgentTurn['chips']) => threads.append([{ ...stamp(), role: 'agent', turn: { lines: [line], chips } }]);
    // `next` continues a sentence from what the previous step's tools found; without it, a new sentence starts.
    // `seen` holds the tools already run for this sentence: a repeat draws no second card and finds nothing new. A
    // continuation keeps the service the sentence began with, the one the user agreed to, even if the menu has moved on.
    const turn = (text: string, next?: Chain) => {
      const { panel, light, traces, owner, mutate } = latest.current;
      const chatService = next?.service ?? latest.current.chatService;
      if (!chatService) return;
      const book = threads.view(owner), messages = book.threads.find(t => t.id === book.active)?.messages ?? [];
      const asked = messages.map(m => m.role === 'user' && m.text === text).lastIndexOf(true);
      // A sentence whose consent card was declined, or never answered, was not sent and is not sent later either.
      const declined = new Set(messages.flatMap((m, i) => m.role === 'agent' && m.answered !== 'confirmed'
        && m.turn.cards?.some(card => card.kind === 'confirm' && card.confirm.action.type === 'chat') ? [i - 1] : []));
      // A continuation sees the whole sentence so far: the reply and the tools' cards come after the question.
      const said = (next ? messages : messages.slice(0, asked < 0 ? messages.length : asked)).filter((_, i) => !declined.has(i));
      const request: ChatRequest = { schemaVersion: 1, idempotencyKey: crypto.randomUUID(), message: text, history: chatHistory(said.flatMap(chatLine)),
        context: chatContext(panel, light, traces), serviceId: chatService.id, serviceRevision: chatService.revision, consent: true,
        ...(next ? { step: next.step, toolResults: next.results } : {}) };
      const waiting: Message = { ...stamp(), role: 'agent', turn: { lines: next
        ? [[span('正在根据工具结果接着回答…', 'dim')]]
        : [[span('正在请'), span(`「${chatService.label}」`, 'strong'), span('回答…', 'dim')]] } };
      threads.append([waiting]);
      const seen = next?.seen ?? new Set<string>();
      sendChatTurn(mutate, request).then(receipt => settle(waiting.id, receipt, chatService.label, seen, chatService), failure => fail(waiting.id, failure, request.idempotencyKey, text));
    };
    const replace = (messageId: string, next: AgentTurn) => threads.patch(messageId, m => m.role === 'agent' ? { ...m, turn: next } : m);
    // A receipt in place of the waiting line: the reply, marked as unverified, then each tool it asked for, run here.
    // A receipt read back by 核对回执 has no chain to continue: it settles, and the user can ask again from there.
    const settle = (messageId: string, receipt: ChatReceipt, label: string, seen = new Set<string>(), service?: Service) => {
      if (receipt.status === 'ready' && receipt.reply) {
        replace(messageId, { lines: [...receipt.reply.split(/\n+/u).filter(p => p.trim()).map(p => [span(p)]), [span('◆ ', 'cyan'), span(`${label} 的回答，未经核实；项目里的数字以工具读到的为准。`, 'dim')]] });
        const asked = receipt.message;
        if (receipt.droppedActions) threads.appendAfter(messageId, { ...stamp(), role: 'agent', turn: { lines: [[span(`模型还请求了 ${receipt.droppedActions} 个不在清单里的操作，没有执行。`, 'dim')]] } });
        // What the read-only tools found goes back to the model, until the sentence's last step.
        const fresh = receipt.actions.filter(action => { const key = action.tool + JSON.stringify(action.args); return !seen.has(key) && !!seen.add(key); });
        void Promise.all(fresh.map(action => run(messageId, action))).then(found => {
          const results = found.filter((r): r is ToolResult => !!r).slice(0, 4);
          if (results.length && asked && service && receipt.step < MAX_STEPS) turn(asked, { step: receipt.step + 1, results, seen, service });
        });
      } else if (receipt.status === 'failed') {
        replace(messageId, { lines: [[span('这一轮没有完成：', 'error'), span(CHAT_ERRORS[receipt.errorCode ?? ''] ?? '模型服务出错了。')]], chips: receipt.message ? [{ label: '再问一次', action: { type: 'say', text: receipt.message } }] : undefined });
      } else {
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span('这一轮已记下；核对只读取回执，不会再次调用模型。')]], chips: [{ label: '核对回执', action: { type: 'check', turn: receipt.id, message: messageId }, primary: true }] });
      }
    };
    const fail = (messageId: string, failure: unknown, turnId: string, text: string) => {
      if (failure instanceof HostedApiError && isDefiniteChatRejection(failure.status, failure.code)) {
        replace(messageId, { lines: [[span('这一轮没有发出：', 'error'), span(CHAT_ERRORS[failure.code] ?? errorMessage(failure))]], chips: [{ label: '再问一次', action: { type: 'say', text } }] });
      } else {
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span(`${errorMessage(failure)} 这一轮可能已经记下；核对只读取回执，不会再次调用模型。`)]], chips: [{ label: '核对回执', action: { type: 'check', turn: turnId, message: messageId }, primary: true }] });
      }
    };
    const check = (turnId: string, messageId: string) => {
      replace(messageId, { lines: [[span('正在核对回执…', 'dim')]] });
      readChatTurn(turnId).then(receipt => settle(messageId, receipt, latest.current.chatService?.label ?? '模型'),
        failure => failure instanceof HostedApiError && failure.status === 404
          ? replace(messageId, { lines: [[span('这一轮没有发出，', 'error'), span('没有产生费用，可以再问一次。')]] })
          : fail(messageId, failure, turnId, ''));
    };
    // The knowledge index loads once per visit; a lookup in the loop waits for it a little rather than going unanswered.
    const knowledgeReady = async (limit = 10_000) => {
      for (const started = Date.now(); !latest.current.knowledge.ready && Date.now() - started < limit;) await new Promise(resolve => setTimeout(resolve, 250));
      return latest.current.knowledge.ready;
    };
    // A tool the model asked for, run as the matching command runs; drafting still begins with its own consent card.
    // A read-only tool's finding is returned so it can go back to the model.
    const run = async (afterId: string, action: ChatAction): Promise<ToolResult | null> => {
      const { panel, light, theme, traces, generation, knowledge } = latest.current;
      const routed = toolTurn(action, { room: panel, light, theme, traces });
      if ('generate' in routed) { threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: generation.start(routed.generate) }); return null; }
      if ('lookup' in routed) {
        let found: AgentTurn;
        if (!(knowledge.ready || await knowledgeReady())) found = { lines: [[span('知识镜还在加载，这次没有查到「', 'dim'), span(routed.lookup, 'strong'), span('」，稍后可以再问。', 'dim')]] };
        else {
          try { found = lookupTurn(routed.lookup, await latest.current.knowledge.search(routed.lookup), routed.explicit); }
          catch { found = { lines: [[span('知识镜暂时没有回应，请稍后再问。', 'error')]] }; }
        }
        threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: found });
        return { tool: 'lookup', text: turnText(found) };
      }
      threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: routed.turn });
      if (routed.turn.act) perform(routed.turn.act);
      return isResultTool(action.tool) ? { tool: action.tool, text: turnText(routed.turn) } : null;
    };
    const perform = (action: AgentAction) => {
      switch (action.type) {
        case 'open': go(action.room); break;
        case 'theme': saveTheme(action.theme); break;
        case 'search': latest.current.knowledge.openSearch(); break;
        case 'entry': latest.current.knowledge.open(action.id); break;
        case 'clear': { const active = threads.view(latest.current.owner).active; if (active) threads.remove(active); focusInput(); break; }
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
      }
    };
    const answer = (id: string, answered: 'confirmed' | 'cancelled', action?: AgentAction) => {
      threads.patch(id, m => m.role === 'agent' ? { ...m, answered } : m);
      if (answered === 'confirmed' && action) perform(action);
      else focusInput();
    };
    return { send, perform, answer };
  }, [go, focusInput]);

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
  const services = lists.services.map(s => ({ id: s.id, label: s.label, detail: [s.model, s.capabilities.includes('research') && '对话', s.capabilities.includes('questionnaire') && '起草'].filter(Boolean).join(' · ') }));
  const projectId = thread ? thread.projectId : book.draftProject;
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
        <button type="button" className={styles.railButton} aria-label="模块" title="模块" aria-haspopup="menu" aria-expanded={railMenu === 'modules'} aria-pressed={!!panel && panel !== 'overview'} onClick={() => setRailMenu(railMenu === 'modules' ? null : 'modules')}><Icon name="grid" /></button>
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
        {railMenu === 'modules' && <div className={styles.menu} role="menu" aria-label="模块" style={{ left: 50, top: 40, zIndex: 60, maxHeight: 'calc(100dvh - 56px)' }}>
          {GROUPS.map(group => <div key={group} role="group" aria-label={ROOM_GROUPS[group]}>
            <p className={styles.menuLabel} aria-hidden="true">{ROOM_GROUPS[group]}</p>
            {ROOMS.filter(r => r.group === group).map(r => {
              const lightOf = roomLight(light, r.id);
              return <button key={r.id} type="button" role="menuitemradio" className={styles.menuItem} aria-checked={panel === r.id} onClick={() => { go(r.id); setRailMenu(null); }}>
                {r.name}{lightOf && <small>{percent(lightOf.score)}</small>}
              </button>;
            })}
          </div>)}
        </div>}
      </nav>

      <Sidebar book={book} projects={projects} account={generationAccount} email={email} notice={accountNotice}
        failed={!!sessionError} onRetry={() => { setAccountNotice(''); refresh().catch(error => setAccountNotice(errorMessage(error))); }} onNew={id => { threads.draft(id); focusInput(); }}
        onSelect={threads.select} onRemove={threads.remove} onCollapse={() => setSideOpen(false)} />

      <main className={styles.main} aria-label="对话" data-dialog-background>
        <header className={styles.top}>
          {!sideOpen && <button type="button" className={styles.iconButton} aria-label="展开侧栏（Ctrl B）" title="展开侧栏（Ctrl B）" onClick={() => setSideOpen(true)}><Icon name="sidebar" /></button>}
          <span className={styles.topTitle}>{thread?.title ?? '新对话'}{projectLabel && <small>{projectLabel}</small>}</span>
          <span className={styles.spacer} />
          {!panel && lastPanel && <button type="button" className={styles.iconButton} aria-label={`重新打开${roomById(lastPanel).name}（Ctrl \\）`} title={`重新打开${roomById(lastPanel).name}（Ctrl \\）`} onClick={() => go(lastPanel)}><Icon name="panel" /></button>}
        </header>
        <div ref={scrollRef} className={styles.scroll}>
          {messages.length ? <Transcript messages={messages} scrollRef={scrollRef} onAction={agent.perform} onAnswer={agent.answer} />
            : <div className={styles.empty}>
              <div className={styles.emptyMark}><BrandMark size={44} /></div>
              <h1>我们要研究什么？</h1>
              <p>{chatMode === 'model'
                ? `对话由「${chatService?.label ?? '模型服务'}」回答：每段对话第一次发送前请你确认；它看不到原始数据，项目里的数字以工具读到的为准。`
                : '对话是指令模式：听得懂命令和常用说法，听不懂会直说，不编造。在模型菜单里可以改用你自己的模型服务对话。'}</p>
              <div className={styles.suggestions}>{SUGGESTIONS.map(s => <button key={s} type="button" onClick={() => agent.send(s)}>{s}</button>)}</div>
            </div>}
        </div>
        <Composer onSend={agent.send} inputRef={inputRef} account={generationAccount} onNeedLists={() => loadLists(true)}
          projects={projects} projectId={projectId} onProject={threads.setProject}
          services={services} serviceId={services.some(s => s.id === preferredService) ? preferredService : services[0]?.id ?? ''} onService={prefer}
          mode={chatMode} onMode={setChatMode} chatLabel={chatService?.label ?? ''} onOpen={go} />
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
          {panel === 'overview' && <Lobby light={light} view={deferredView} traces={traces.length} onOpen={go} onSay={agent.send} headingRef={null} />}
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
  const text = message.turn.lines.map(line => line.map(s => s.text).join('')).join('\n').trim();
  return text ? [{ role: 'agent', text }] : [];
}
