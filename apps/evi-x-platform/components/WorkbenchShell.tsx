"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccountStatus } from './hosted/HostedFrame';
import { useHostedSession } from './hosted/HostedSession';
import { NAV_ITEMS, NavIcon, PageHeading, ThemeProvider, ThemeToggle, WorkbenchFooter, WorkbenchSidebar, useThemePreference, type Section } from './workbench/shell-kit';

export { useWorkbenchTheme } from './workbench/shell-kit';

type Panel = Exclude<Section, "lifecycle">;
const ITEMS = NAV_ITEMS;

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function currentSection(): Section {
  const hash = window.location.hash.slice(1);
  return ITEMS.some(item => item.id === hash) ? hash as Section : "overview";
}

export default function WorkbenchShell({ panels }: { panels: Record<Panel, ReactNode> }) {
  const auth = useHostedSession();
  const section = useSyncExternalStore(subscribeHash, currentSection, () => "overview" as Section);
  const activePanel: Panel = section === "lifecycle" ? "workspace" : section;
  const current = ITEMS.find(item => item.id === section)!;
  const theme = useThemePreference();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState<Panel[]>(['overview']);
  // Panels stay mounted once visited; record the first visit during render instead of in an effect.
  if (!visited.includes(activePanel)) setVisited([...visited, activePanel]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const menuRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastSection = useRef(section);
  const commandItems = ITEMS.filter(item => `${item.title} ${item.description} ${item.group} ${item.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const activeCommand = commandItems[Math.min(commandIndex, Math.max(0, commandItems.length - 1))];

  const showCommands = () => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(false); setQuery(""); setCommandIndex(0); setCommandOpen(true);
  };
  const chooseCommand = (id: Section) => {
    returnFocusRef.current = headingRef.current;
    if (id === 'workspace' || id === 'services') auth.navigate(id === 'workspace' ? '/projects' : '/services');
    else window.location.hash = id;
    setOpen(false); setCommandOpen(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k" || event.isComposing) return;
      if (!commandOpen && document.querySelector('dialog[open], [aria-modal="true"]')) return;
      event.preventDefault();
      if (commandOpen) setCommandOpen(false);
      else {
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(false); setQuery(""); setCommandIndex(0); setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [commandOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !commandOpen) return;
    dialog.showModal();
    searchRef.current?.focus();
    return () => {
      dialog.close();
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [commandOpen]);

  useEffect(() => {
    if (commandOpen && activeCommand) document.getElementById(`wb-command-${activeCommand.id}`)?.scrollIntoView({ block: "nearest" });
  }, [commandOpen, activeCommand]);

  useEffect(() => {
    const changed = lastSection.current !== section;
    lastSection.current = section;
    const frame = requestAnimationFrame(() => {
      if (section === "lifecycle") document.getElementById("lifecycle")?.scrollIntoView({ block: "start", behavior: "instant" });
      else window.scrollTo({ top: 0, behavior: "instant" });
      if (changed) headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);

  return <ThemeProvider value={theme}>
    <div className="workbench" data-theme={theme} data-section={section}>
      <a className="skip-link" href="#top" onClick={event => { event.preventDefault(); headingRef.current?.focus(); }}>跳到主要内容</a>
      <WorkbenchSidebar active={section} inWorkspace open={open} setOpen={setOpen} menuRef={menuRef} onSearch={showCommands}/>
      <div className="workbench-main" data-dialog-background>
        <PageHeading group={current.group} title={current.title} description={current.description} headingRef={headingRef} actions={<>
          <button type="button" className="wb-search-toggle" onClick={showCommands} title="快速导航（Ctrl / ⌘ K）"><NavIcon kind="search"/><span>快速导航</span><kbd>⌘ K</kbd></button>
          <AccountStatus/>
          <ThemeToggle theme={theme}/>
          {!["editor", "design", "silicon", "analysis"].includes(section) && <a className="wb-top-cta" href="#diagnose"><NavIcon kind="plus"/>开始诊断</a>}
        </>}/>
        <div className="workbench-content"><main id="top">
          {(Object.keys(panels) as Panel[]).filter(panel => visited.includes(panel) || activePanel === panel).map(panel => <div key={panel} className="wb-panel" data-workbench-panel={panel} hidden={activePanel !== panel}>{panels[panel]}</div>)}
        </main></div>
        <WorkbenchFooter/>
      </div>
      <dialog className="wb-command-dialog" ref={dialogRef} aria-labelledby="wb-command-title" onCancel={() => setCommandOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setCommandOpen(false); } }}>
        <div className="wb-command-heading"><h2 id="wb-command-title">快速导航</h2><button type="button" className="wb-command-close" aria-label="关闭快速导航" onClick={() => setCommandOpen(false)}><NavIcon kind="close"/></button></div>
        <div className="wb-command-search"><NavIcon kind="search"/><input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); setCommandIndex(0); }} placeholder="搜索功能，例如：案例、报告、规则" aria-label="搜索工作台功能" role="combobox" aria-autocomplete="list" aria-expanded={commandOpen} aria-controls="wb-command-list" aria-activedescendant={activeCommand ? `wb-command-${activeCommand.id}` : undefined} autoComplete="off" spellCheck={false} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setCommandIndex(index => commandItems.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + commandItems.length) % commandItems.length : 0); }
          if (event.key === "Enter" && activeCommand) { event.preventDefault(); chooseCommand(activeCommand.id); }
        }}/></div>
        <div className="wb-command-list" id="wb-command-list" role="listbox" aria-label="工作台功能">
          {commandItems.map(item => <button type="button" id={`wb-command-${item.id}`} key={item.id} role="option" aria-selected={activeCommand?.id === item.id} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => chooseCommand(item.id)}><span className="wb-command-icon"><NavIcon kind={item.icon}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><NavIcon kind="arrow"/></button>)}
          {!commandItems.length && <p className="wb-command-empty" role="status">没有找到对应功能，试试“案例”“报告”或“规则”。</p>}
        </div>
        <div className="wb-command-footer"><span>搜索范围：工作区功能</span><span><kbd>↑↓</kbd> 选择 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 关闭</span></div>
      </dialog>
    </div>
  </ThemeProvider>;
}
