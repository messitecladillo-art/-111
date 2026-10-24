'use client';

import Link from 'next/link';
import { flushSync } from 'react-dom';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { useWorkbenchModules } from '@/components/EviXPlatform';
import { WorkbenchNavProvider, type WorkbenchNav, type WorkbenchPanel } from '@/components/WorkbenchShell';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { ThemeProvider, saveTheme, switchTheme, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { percent } from '@/lib/agent/glyphs';
import { illuminate, roomLight } from '@/lib/agent/illumination';
import { traceExhibits } from '@/lib/agent/provenance';
import { ROOM_GROUPS, ROOMS, isRoomId, roomById, type RoomGroup, type RoomId } from '@/lib/agent/rooms';
import { lookupTurn, route, type AgentAction, type AgentTurn } from '@/lib/agent/router';
import Composer from './Composer';
import { GenerationProvider, useGeneration } from './generation';
import { LightBar } from './Glyphs';
import { Icon } from './icons';
import Lobby from './Lobby';
import Sidebar from './Sidebar';
import Transcript from './Transcript';
import { stamp, threads, type Message } from './threads';
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
  const { session: account, loading: accountLoading } = useHostedSession();
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
  const [moduleMenu, setModuleMenu] = useState(false);
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
  // The module menu closes on a click outside the rail, as the composer's menus do.
  useEffect(() => {
    if (!moduleMenu) return;
    const away = (event: PointerEvent) => { if (!railRef.current?.contains(event.target as Node)) setModuleMenu(false); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [moduleMenu]);
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
  const latest = useRef({ panel, light, theme, knowledge, traces, generation, owner, lastPanel, toggleSide });
  useEffect(() => { latest.current = { panel, light, theme, knowledge, traces, generation, owner, lastPanel, toggleSide }; });
  const agent = useMemo(() => {
    const send = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const { panel, light, theme, traces, generation } = latest.current;
      const user: Message = { ...stamp(), role: 'user', text };
      const routed = route(text, { room: panel ?? 'overview', light, theme, traces });
      // Drafting with a model always starts with the user's consent, never with a call.
      if ('generate' in routed) { threads.append([user, { ...stamp(), role: 'agent', turn: generation.start(routed.generate) }]); return; }
      if ('lookup' in routed) { threads.append([user, { ...stamp(), role: 'pending', query: routed.lookup, explicit: routed.explicit }]); return; }
      threads.append([user, { ...stamp(), role: 'agent', turn: routed.turn }]);
      if (routed.turn.act) perform(routed.turn.act);
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
      if (event.key === 'Escape') setModuleMenu(false);
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
  const services = lists.services.map(s => ({ id: s.id, label: s.label, detail: s.model }));
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
        <button type="button" className={styles.railButton} aria-label="模块" title="模块" aria-haspopup="menu" aria-expanded={moduleMenu} aria-pressed={!!panel && panel !== 'overview'} onClick={() => setModuleMenu(!moduleMenu)}><Icon name="grid" /></button>
        <button type="button" className={styles.railButton} aria-label="项目全景" title="项目全景" aria-pressed={panel === 'overview'} onClick={() => panel === 'overview' ? closePanel() : go('overview')}><Icon name="lamp" /></button>
        <button type="button" className={styles.railButton} aria-label={`知识镜搜索（${shortcut}）`} title={`知识镜搜索（${shortcut}）`} onClick={knowledge.openSearch}><Icon name="book" /></button>
        <span className={styles.spacer} />
        <button type="button" className={styles.railButton} aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} title={theme === 'dark' ? '浅色' : '深色'} onClick={event => switchTheme(theme === 'dark' ? 'light' : 'dark', event)}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        {owner && owner !== 'guest' ? <span className={styles.avatar} title={email}>{(email[0] ?? '?').toUpperCase()}</span>
          : <Link className={styles.avatar} data-guest="true" href="/login" title="登录">访</Link>}
        {moduleMenu && <div className={styles.menu} role="menu" aria-label="模块" style={{ left: 50, top: 40, zIndex: 60, maxHeight: 'calc(100dvh - 56px)' }}>
          {GROUPS.map(group => <Fragment key={group}>
            <p className={styles.menuLabel}>{ROOM_GROUPS[group]}</p>
            {ROOMS.filter(r => r.group === group).map(r => {
              const lightOf = roomLight(light, r.id);
              return <button key={r.id} type="button" role="menuitemradio" className={styles.menuItem} aria-checked={panel === r.id} onClick={() => { go(r.id); setModuleMenu(false); }}>
                {r.name}{lightOf && <small>{percent(lightOf.score)}</small>}
              </button>;
            })}
          </Fragment>)}
        </div>}
      </nav>

      <Sidebar book={book} projects={projects} account={generationAccount} email={email} onNew={id => { threads.draft(id); focusInput(); }}
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
              <p>对话是指令模式：听得懂命令和常用说法，听不懂会直说，不编造。起草问卷时会调用你自己的模型服务，并先请你确认。</p>
              <div className={styles.suggestions}>{SUGGESTIONS.map(s => <button key={s} type="button" onClick={() => agent.send(s)}>{s}</button>)}</div>
            </div>}
        </div>
        <Composer onSend={agent.send} inputRef={inputRef} account={generationAccount} onNeedLists={loadLists}
          projects={projects} projectId={projectId} onProject={threads.setProject}
          services={services} serviceId={preferredService || services[0]?.id || ''} onService={prefer} onOpen={go} />
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
