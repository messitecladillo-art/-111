'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useWorkbenchModules } from '@/components/EviXPlatform';
import { WorkbenchNavProvider, type WorkbenchNav, type WorkbenchPanel } from '@/components/WorkbenchShell';
import { AccountStatus } from '@/components/hosted/HostedFrame';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { NavIcon, ThemeProvider, saveTheme, switchTheme, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { percent } from '@/lib/agent/glyphs';
import { illuminate, roomLight } from '@/lib/agent/illumination';
import { isRoomId, roomById, type RoomId } from '@/lib/agent/rooms';
import { lookupTurn, route, type AgentAction, type AgentTurn } from '@/lib/agent/router';
import Composer from './Composer';
import { LightBar } from './Glyphs';
import Lobby from './Lobby';
import RoomRail from './RoomRail';
import Transcript from './Transcript';
import { stamp, transcript, type Message } from './transcript-store';
import styles from './AgentShell.module.css';

// Every workbench module is a room and every room hosts a module: the two lists cannot drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const ROOMS_ARE_PANELS: Same<RoomId, WorkbenchPanel> = true;
void ROOMS_ARE_PANELS;

function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
function currentRoom(): RoomId {
  const hash = window.location.hash.slice(1);
  return hash === 'lifecycle' ? 'workspace' : isRoomId(hash) ? hash : 'overview';
}
// Below 1025px one pane shows at a time; below 1600px a room needs the whole mirror, so the conversation floats over it.
const NARROW = '(max-width: 1024px)', MEDIUM = '(max-width: 1599px)';
const subscribeNothing = () => () => {};
const searchKey = () => /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
function subscribeMedia(listener: () => void) {
  const media = [window.matchMedia(NARROW), window.matchMedia(MEDIUM)];
  for (const m of media) m.addEventListener('change', listener);
  return () => { for (const m of media) m.removeEventListener('change', listener); };
}
const viewport = () => window.matchMedia(NARROW).matches ? 'narrow' : window.matchMedia(MEDIUM).matches ? 'medium' : 'wide';

/**
 * 证见 · 镜室: the agent shell. One conversation is the spine; every workbench module is a room the agent walks
 * into, kept mounted once visited. The rail shows where the light reaches; the status line says the rest in one row.
 */
export default function AgentShell() {
  const { panels, view } = useWorkbenchModules(true);
  const knowledge = useKnowledge();
  const theme = useThemePreference(true);
  const room = useSyncExternalStore(subscribeHash, currentRoom, () => 'overview' as RoomId);
  const width = useSyncExternalStore(subscribeMedia, viewport, () => 'wide' as const), narrow = width === 'narrow';
  const overlay = width === 'medium' && room !== 'overview';
  const messages = useSyncExternalStore(transcript.subscribe, transcript.snapshot, transcript.serverSnapshot);
  const shortcut = useSyncExternalStore(subscribeNothing, searchKey, () => '⌘K');
  // The report is re-scored as it is typed; deferring keeps typing in the editor ahead of the benchmark.
  const deferredView = useDeferredValue(view);
  const light = useMemo(() => illuminate(deferredView), [deferredView]);

  const [visited, setVisited] = useState<RoomId[]>([room]);
  const [talkOpen, setTalkOpen] = useState(true);
  const [pane, setPane] = useState<'talk' | 'mirror'>('talk');
  const [railOpen, setRailOpen] = useState(false);
  const [lastRoom, setLastRoom] = useState<RoomId>('overview');
  const [shownRoom, setShownRoom] = useState(room);
  const [canvasReturn, setCanvasReturn] = useState<{ nodeId: string; title: string } | null>(null);
  const [canvasFocus, setCanvasFocus] = useState<{ nodeId: string; token: number } | null>(null);
  // Arriving in a room mounts its module for good, shows the mirror on a narrow screen, closes the drawer, and on a
  // laptop lets the room have the whole mirror; the lobby is the conversation's home, so it opens there again.
  if (!visited.includes(room)) setVisited([...visited, room]);
  if (shownRoom !== room) {
    setShownRoom(room);
    if (room !== 'canvas') setLastRoom(room);
    setPane('mirror');
    setRailOpen(false);
    if (width === 'medium') setTalkOpen(room === 'overview');
  }

  const inputRef = useRef<HTMLTextAreaElement>(null), headingRef = useRef<HTMLHeadingElement>(null), mirrorRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const go = useCallback((id: RoomId) => { if (currentRoom() !== id) window.location.hash = id; }, []);
  const openFromCanvas = useCallback((target: Section, nodeId: string, title: string) => { setCanvasReturn({ nodeId, title }); window.location.hash = target; }, []);
  const showWorkbench = useCallback(() => { window.location.hash = lastRoom; }, [lastRoom]);
  const nav = useMemo<WorkbenchNav>(() => ({ section: room, openFromCanvas, showWorkbench, canvasFocus }), [room, openFromCanvas, showWorkbench, canvasFocus]);
  const backToCanvas = () => {
    if (canvasReturn) setCanvasFocus({ nodeId: canvasReturn.nodeId, token: Date.now() });
    setCanvasReturn(null);
    window.location.hash = 'canvas';
  };

  // A new room takes focus at its heading, unless the user is typing to the agent: commands keep the command line.
  // A render from the server's guess, before the address was read, records nothing; the first room seen is where the
  // page opened, so arriving by link moves no focus. Only later moves take it.
  const lastFocusRoom = useRef<RoomId | null>(null);
  useEffect(() => {
    if (room !== currentRoom()) return;
    if (lastFocusRoom.current === null || lastFocusRoom.current === room) { lastFocusRoom.current = room; return; }
    lastFocusRoom.current = room;
    mirrorRef.current?.scrollTo({ top: 0 });
    if (document.activeElement === inputRef.current || room === 'canvas') return;
    const frame = requestAnimationFrame(() => (headingRef.current ?? mirrorRef.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [room]);

  // What the agent routes against is read when a message is sent, so its handlers stay stable while the
  // report is re-scored on every keystroke and the transcript need not re-render with it.
  const latest = useRef({ room, light, theme, knowledge });
  useEffect(() => { latest.current = { room, light, theme, knowledge }; });
  const agent = useMemo(() => {
    const send = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const { room, light, theme } = latest.current;
      const user: Message = { ...stamp(), role: 'user', text };
      const routed = route(text, { room, light, theme });
      setTalkOpen(true);
      setPane('talk');
      if ('lookup' in routed) {
        transcript.update(list => [...list, user, { ...stamp(), role: 'pending', query: routed.lookup, explicit: routed.explicit }]);
        return;
      }
      transcript.update(list => [...list, user, { ...stamp(), role: 'agent', turn: routed.turn }]);
      if (routed.turn.act) perform(routed.turn.act);
    };
    const perform = (action: AgentAction) => {
      switch (action.type) {
        case 'open': go(action.room); break;
        case 'theme': saveTheme(action.theme); break;
        case 'search': latest.current.knowledge.openSearch(); break;
        case 'entry': latest.current.knowledge.open(action.id); break;
        case 'clear': transcript.update(() => []); inputRef.current?.focus(); break;
        // Only paths of this site; a stored transcript is never trusted to navigate anywhere else.
        case 'href': if (/^\/(?!\/)/.test(action.href)) window.location.assign(action.href); break;
        case 'say': send(action.text); break;
      }
    };
    const answer = (id: string, answered: 'confirmed' | 'cancelled', action?: AgentAction) => {
      transcript.update(list => list.map(m => m.id === id && m.role === 'agent' ? { ...m, answered } : m));
      if (answered === 'confirmed' && action) perform(action);
      else inputRef.current?.focus();
    };
    return { send, perform, answer };
  }, [go]);

  // Lookups wait for the knowledge index, then answer in place of their placeholder.
  const pendingLookup = messages.find(m => m.role === 'pending');
  const { ready: knowledgeReady, search } = knowledge;
  useEffect(() => {
    if (pendingLookup?.role !== 'pending' || !knowledgeReady) return;
    let live = true;
    const settle = (turn: AgentTurn) =>
      transcript.update(list => list.map(m => m.id === pendingLookup.id ? { id: m.id, at: Date.now(), role: 'agent', turn } : m));
    search(pendingLookup.query)
      .then(hits => { if (live) settle(lookupTurn(pendingLookup.query, hits, pendingLookup.explicit)); })
      .catch(() => { if (live) settle({ lines: [[{ text: '知识镜暂时没有回应，请稍后再问。', mark: 'error' }]] }); });
    return () => { live = false; };
  }, [pendingLookup, knowledgeReady, search]);

  // "/" anywhere outside a field starts a command; Ctrl/⌘ + \ shows or hides the conversation.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
      // Focus moves before the key is typed, so the slash itself lands in the command line.
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) inputRef.current?.focus();
      if (event.key === '\\' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); setTalkOpen(open => !open); }
      // Escape puts the phone drawer away; focus inside it goes back to the button that opened it, not into hiding.
      if (event.key === 'Escape' && document.querySelector('[data-rail="open"]')) {
        if (document.getElementById('agent-rail')?.contains(document.activeElement)) menuRef.current?.focus();
        setRailOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const here = roomById(room), lit = roomLight(light, room);
  const project = view.design?.title.trim() || (view.report && view.report.title !== '我的市场调查研究' ? view.report.title.trim() : '') || '未命名研究';
  const passed = light.benchmark ? roomLight(light, 'editor')!.checks.filter(c => c.passed).length : 0;
  const total = light.benchmark ? roomLight(light, 'editor')!.checks.length : 0;

  return <ThemeProvider value={theme}><WorkbenchNavProvider value={nav}>
    <div className={`workbench ${styles.shell}`} data-theme={theme} data-room={room} data-talk={talkOpen ? 'open' : 'closed'} data-dock={overlay ? 'overlay' : 'docked'} data-pane={pane} data-rail={railOpen ? 'open' : 'closed'}
      // On a phone the rail is a drawer: a tap anywhere else puts it away.
      onPointerDown={event => { if (railOpen && !(event.target as Element).closest('#agent-rail, [aria-controls="agent-rail"]')) setRailOpen(false); }}>
      <a className={styles.skip} href="#mirror" onClick={event => { event.preventDefault(); mirrorRef.current?.focus(); }}>跳到主要内容</a>

      <header className={styles.bar}>
        <button ref={menuRef} type="button" className={`${styles.iconButton} ${styles.menu}`} aria-label="房间" aria-expanded={railOpen} aria-controls="agent-rail" onClick={() => setRailOpen(!railOpen)}>☰</button>
        <a className={styles.brand} href="#overview"><b aria-hidden="true">◇</b><strong>证见</strong><small>镜室</small></a>
        <span className={styles.crumb}><i aria-hidden="true">›</i>{here.name}<span>{project === '未命名研究' ? '' : `· ${project}`}</span></span>
        <span className={styles.spacer} />
        {narrow && <div className={styles.switch} role="tablist" aria-label="显示">
          <button type="button" role="tab" aria-selected={pane === 'talk'} onClick={() => setPane('talk')}>对话</button>
          <button type="button" role="tab" aria-selected={pane === 'mirror'} onClick={() => setPane('mirror')}>{here.name}</button>
        </div>}
        <button type="button" className={`${styles.barButton} ${styles.hideNarrow}`} onClick={knowledge.openSearch} title={`全局搜索（${shortcut}）`}><kbd>{shortcut}</kbd>搜索</button>
        <button type="button" className={styles.barButton} onClick={event => switchTheme(theme === 'dark' ? 'light' : 'dark', event)} aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} title={theme === 'dark' ? '昼' : '夜'}>
          <NavIcon kind={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <Link className={`${styles.barButton} ${styles.hideNarrow}`} href={`/workspace#${room}`}>经典工作台</Link>
        <div className={styles.account}><AccountStatus /></div>
      </header>

      <RoomRail room={room} light={light} onNavigate={() => setRailOpen(false)} />

      <section className={styles.talk} aria-label="与证见对话" data-dialog-background>
        <div className={styles.talkInner}>
          <div className={styles.talkHead}>
            <b aria-hidden="true">◆</b><span>证见</span><span className={styles.modeTag}>指令模式</span><span className={styles.spacer} />
            <button type="button" className={`${styles.iconButton} ${styles.collapse}`} onClick={() => setTalkOpen(false)} aria-label="收起对话（Ctrl / ⌘ \）" title="收起对话（Ctrl / ⌘ \）">⇤</button>
          </div>
          <Transcript messages={messages} onSay={agent.send} onAction={agent.perform} onAnswer={agent.answer} />
        </div>
      </section>

      <main ref={mirrorRef} id="mirror" className={styles.mirror} data-room={room} tabIndex={-1} aria-label={`镜面：${here.name}`} data-dialog-background
        onPointerDown={() => { if (overlay && talkOpen) setTalkOpen(false); }}>
        {!narrow && <button type="button" className={styles.talkTab} onClick={() => setTalkOpen(true)} aria-label="展开对话">◆ 对话</button>}
        {room === 'overview' ? <Lobby light={light} view={deferredView} onOpen={go} headingRef={headingRef} />
          : room !== 'canvas' && <header className={styles.roomHead}>
            <h1 ref={headingRef} tabIndex={-1}>{here.name}</h1>
            {lit && <span className={styles.roomLight}><LightBar score={lit.score} /><b>{percent(lit.score)}</b>{lit.summary}</span>}
            <p>{here.line}</p>
          </header>}
        {(Object.keys(panels) as WorkbenchPanel[]).filter(id => id !== 'overview' && visited.includes(id)).map(id =>
          <div key={id} className={styles.panel} data-workbench-panel={id} hidden={room !== id}>{panels[id]}</div>)}
        {canvasReturn && room !== 'canvas' && <div className={styles.canvasReturn} role="region" aria-label="画布返回">
          <button type="button" onClick={backToCanvas}>⟲ 返回画布{canvasReturn.title ? ` · ${canvasReturn.title}` : ''}</button>
          <button type="button" aria-label="不再显示返回画布" onClick={() => setCanvasReturn(null)}>×</button>
        </div>}
      </main>

      <Composer onSend={agent.send} inputRef={inputRef} />

      <footer className={styles.status} aria-label="状态线">
        <span>◇ {project}</span><i>·</i><span>{here.name}</span><i>·</i>
        <span>照度 <b>{percent(light.overall)}</b></span><i>·</i><span>盲区 <b>{light.blind.length}</b></span>
        {light.benchmark && <><i className={styles.hideNarrow}>·</i><span className={styles.hideNarrow}>体检 <b>{passed}/{total}</b></span></>}
        <span className={styles.spacer} />
        <span className={`${styles.modeLine} ${styles.hideNarrow}`}>指令模式 · 未接入模型</span><i className={styles.hideNarrow}>·</i>
        <span className={styles.hideNarrow}>本地草稿，未同步云端</span>
      </footer>
    </div>
  </WorkbenchNavProvider></ThemeProvider>;
}
