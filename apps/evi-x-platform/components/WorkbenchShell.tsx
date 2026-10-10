"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccountStatus, EnvironmentNotice } from './hosted/HostedFrame';
import { useHostedSession } from './hosted/HostedSession';

type Section = "overview" | "cases" | "diagnose" | "workspace" | "lifecycle" | "rules" | "editor" | "analysis" | "design" | "defense" | "services";
type Panel = Exclude<Section, "lifecycle">;
type Theme = "light" | "dark";
const ThemeContext = createContext<Theme>("light");
export const useWorkbenchTheme = () => useContext(ThemeContext);

const ITEMS: Array<{ id: Section; title: string; description: string; icon: string; group: string }> = [
  { id: "overview", title: "概览", description: "从真实问题出发，把研究一步步做扎实。", icon: "grid", group: "我的工作台" },
  { id: "cases", title: "获奖案例库", description: "检索真实案例，分清公告核验与材料分析。", icon: "book", group: "研究与证据" },
  { id: "diagnose", title: "Agent 诊断", description: "梳理准备度，找到当前最值得补齐的证据。", icon: "spark", group: "研究与证据" },
  { id: "design", title: "问卷设计", description: "将研究问题、题项、变量与计划分析逐一对齐。", icon: "book", group: "研究与证据" },
  { id: "analysis", title: "数据分析", description: "检查数据质量、变量分布与量表内部一致性。", icon: "grid", group: "研究与证据" },
  { id: "editor", title: "报告与 PPT", description: "在正大杯工作台中写报告、编排幻灯片，边编辑边预览。", icon: "book", group: "写作与答辩" },
  { id: "defense", title: "路演与答辩", description: "按主题演练追问，定位证据，自由编排讲述时间。", icon: "route", group: "写作与答辩" },
  { id: "workspace", title: "项目控制门户", description: "保存协作登记；真实进度以本地证据控制面为准。", icon: "folder", group: "项目管理" },
  { id: "lifecycle", title: "生命周期作战室", description: "读取本机权威状态，不代替质量门禁判定。", icon: "route", group: "项目管理" },
  { id: "rules", title: "规则与门禁", description: "对齐届次、组别、赛区、赛道与阶段。", icon: "shield", group: "质量保障" },
  { id: "services", title: "我的模型服务", description: "接入自己的 API Key，为研究能力选择服务。", icon: "spark", group: "服务与设置" },
];
const GROUPS = [...new Set(ITEMS.map(item => item.group))];
const THEME_KEY = "evix.workbench.theme.v1";
const THEME_EVENT = "evix:theme-change";
let transientTheme: Theme | null = null;

function currentTheme(): Theme {
  if (transientTheme) return transientTheme;
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Private or restricted browsing still supports an in-memory preference. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function subscribeTheme(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) { transientTheme = null; listener(); } };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, listener);
  media.addEventListener("change", listener);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(THEME_EVENT, listener); media.removeEventListener("change", listener); };
}
function saveTheme(value: Theme) {
  transientTheme = value;
  try { window.localStorage.setItem(THEME_KEY, value); } catch { /* Optional UI preference, never research data. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function currentSection(): Section {
  const hash = window.location.hash.slice(1);
  return ITEMS.some(item => item.id === hash) ? hash as Section : "overview";
}

function NavIcon({ kind }: { kind: string }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "grid" ? <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></> :
      kind === "book" ? <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/></> :
      kind === "folder" ? <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3V7Z"/> :
      kind === "shield" ? <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></> :
      kind === "route" ? <><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/></> :
      kind === "search" ? <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></> :
      kind === "close" ? <path d="m6 6 12 12M18 6 6 18"/> :
      kind === "menu" ? <path d="M4 6h16M4 12h16M4 18h16"/> :
      kind === "moon" ? <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/> :
      kind === "sun" ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></> :
      kind === "plus" ? <path d="M12 5v14M5 12h14"/> :
      kind === "arrow" ? <path d="M5 12h14m-5-5 5 5-5 5"/> :
      <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/></>}
  </svg>;
}

export default function WorkbenchShell({ panels }: { panels: Record<Panel, ReactNode> }) {
  const auth = useHostedSession();
  const section = useSyncExternalStore(subscribeHash, currentSection, () => "overview" as Section);
  const activePanel: Panel = section === "lifecycle" ? "workspace" : section;
  const current = ITEMS.find(item => item.id === section)!;
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as Theme);
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState<Panel[]>(['overview']);
  useEffect(() => { setVisited(previous => previous.includes(activePanel) ? previous : [...previous, activePanel]); }, [activePanel]);
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

  return <ThemeContext.Provider value={theme}>
    <div className="workbench" data-theme={theme} data-section={section}>
      <a className="skip-link" href="#top" onClick={event => { event.preventDefault(); headingRef.current?.focus(); }}>跳到主要内容</a>
      <aside className="workbench-sidebar" data-open={open} data-dialog-background onKeyDown={event => {
        if (event.key === "Escape" && open) { setOpen(false); menuRef.current?.focus(); }
      }}>
        <a className="brand wb-brand" href="#overview" aria-label="证见 EVI-X 首页" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>
          <span><strong>证见 EVI-X</strong><small>正大杯研究工作台</small></span>
        </a>
        <button className="wb-menu" ref={menuRef} type="button" aria-controls="workbench-navigation" aria-expanded={open} onClick={() => setOpen(value => !value)} aria-label={open ? "关闭导航" : "打开导航"}><NavIcon kind={open ? "close" : "menu"}/></button>
        <button type="button" className="wb-sidebar-search" onClick={showCommands} aria-label="搜索工作台功能"><NavIcon kind="search"/><span>快速导航</span><kbd>Ctrl K</kbd></button>
        <nav className="wb-navigation" id="workbench-navigation" aria-label="主要导航">
          {GROUPS.map(group => <div className="wb-nav-group" key={group}>
            <p className="wb-nav-label">{group}</p>
            {ITEMS.filter(item => item.group === group).map(item => <a className="wb-nav-link" key={item.id} href={item.id === 'workspace' ? '/projects' : item.id === 'services' ? '/services' : `#${item.id}`} aria-current={section === item.id ? "page" : undefined} onClick={() => setOpen(false)}><NavIcon kind={item.icon}/><span>{item.title}</span></a>)}
          </div>)}
        </nav>
        <div className="wb-sidebar-footer"><div className="wb-evidence-path" aria-label="问题、数据、洞察、行动"><span>Q</span><i/><span>D</span><i/><span>I</span><i/><span>A</span></div><strong>问有据，见有策。</strong><p>独立研究辅助工具 · 非官方</p><span className="wb-sidebar-version">EVI-X RESEARCH WORKSPACE</span></div>
      </aside>
      <div className="workbench-main" data-dialog-background>
        <header className="workbench-topbar">
          <div className="wb-page-heading"><span className="wb-breadcrumb">研究空间<span aria-hidden="true"> / </span>{current.group}</span><h1 className="wb-page-title" ref={headingRef} tabIndex={-1}>{current.title}</h1><p className="wb-page-description">{current.description}</p></div>
          <div className="wb-top-actions"><button type="button" className="wb-search-toggle" onClick={showCommands} aria-label="打开快速导航" title="快速导航（Ctrl / ⌘ K）"><NavIcon kind="search"/><span>快速导航</span><kbd>⌘ K</kbd></button><button type="button" className="wb-theme-toggle" onClick={() => saveTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? "切换深色主题" : "切换浅色主题"} title={theme === "light" ? "切换深色主题" : "切换浅色主题"}><NavIcon kind={theme === "light" ? "moon" : "sun"}/></button>{section !== "editor" && <a className="wb-top-cta" href="#diagnose"><NavIcon kind="plus"/>开始诊断</a>}</div>
        </header>
        <div className="workbench-content"><AccountStatus/><EnvironmentNotice/><main id="top">
          {(Object.keys(panels) as Panel[]).filter(panel => visited.includes(panel) || activePanel === panel).map(panel => <div key={panel} className="wb-panel" data-workbench-panel={panel} hidden={activePanel !== panel}>{panels[panel]}</div>)}
        </main></div>
        <footer className="wb-footer"><span>证见 EVI-X · 循证研究，稳步前行</span><span>独立研究辅助工具 · 不承诺奖项结果</span></footer>
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
        <div className="wb-command-footer"><span>只搜索工作区功能，不检索研究内容。</span><span><kbd>↑↓</kbd> 选择 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 关闭</span></div>
      </dialog>
    </div>
  </ThemeContext.Provider>;
}
