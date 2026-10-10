"use client";

import Link from "next/link";
import { createContext, useContext, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import BrandMark from "@/components/brand/BrandMark";

/** Shared chrome for every signed-in surface: one theme store, one navigation model, one sidebar. */
export type Section = "overview" | "cases" | "diagnose" | "workspace" | "lifecycle" | "rules" | "editor" | "analysis" | "design" | "silicon" | "defense" | "services";
export type Theme = "light" | "dark";

export const NAV_ITEMS: Array<{ id: Section; title: string; description: string; icon: string; group: string }> = [
  { id: "overview", title: "概览", description: "从真实问题出发，把研究一步步做扎实。", icon: "grid", group: "我的工作台" },
  { id: "cases", title: "获奖案例库", description: "检索真实案例，分清公告核验与材料分析。", icon: "book", group: "研究与证据" },
  { id: "diagnose", title: "Agent 诊断", description: "梳理准备度，找到当前最值得补齐的证据。", icon: "spark", group: "研究与证据" },
  { id: "design", title: "问卷设计", description: "将研究问题、题项、变量与计划分析逐一对齐。", icon: "book", group: "研究与证据" },
  { id: "silicon", title: "硅基样本", description: "让 AI 扮演设定人群预答问卷，在真人作答前发现问题。", icon: "persona", group: "研究与证据" },
  { id: "analysis", title: "数据分析", description: "检查数据质量、变量分布与量表内部一致性。", icon: "grid", group: "研究与证据" },
  { id: "editor", title: "报告与 PPT", description: "在正大杯工作台中写报告、编排幻灯片，边编辑边预览。", icon: "book", group: "写作与答辩" },
  { id: "defense", title: "路演与答辩", description: "按主题演练追问，定位证据，自由编排讲述时间。", icon: "route", group: "写作与答辩" },
  { id: "workspace", title: "项目控制门户", description: "保存协作登记；真实进度以本地证据控制面为准。", icon: "folder", group: "项目管理" },
  { id: "lifecycle", title: "生命周期作战室", description: "读取本机权威状态，不代替质量门禁判定。", icon: "route", group: "项目管理" },
  { id: "rules", title: "规则与门禁", description: "对齐届次、组别、赛区、赛道与阶段。", icon: "shield", group: "质量保障" },
  { id: "services", title: "我的模型服务", description: "接入自己的 API Key，为研究能力选择服务。", icon: "spark", group: "服务与设置" },
];
export const NAV_GROUPS = [...new Set(NAV_ITEMS.map(item => item.group))];

/** In-workspace sections are hash routes; project and service pages are their own routes. */
export function navHref(id: Section, inWorkspace: boolean): string {
  if (id === "workspace") return "/projects";
  if (id === "services") return "/services";
  return inWorkspace ? `#${id}` : `/workspace#${id}`;
}

const ThemeContext = createContext<Theme>("light");
export const ThemeProvider = ThemeContext.Provider;
export const useWorkbenchTheme = () => useContext(ThemeContext);

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
export function saveTheme(value: Theme) {
  transientTheme = value;
  try { window.localStorage.setItem(THEME_KEY, value); } catch { /* Optional UI preference, never research data. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}
export function useThemePreference(): Theme {
  return useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as Theme);
}

export function NavIcon({ kind }: { kind: string }) {
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
      kind === "persona" ? <><circle cx="9" cy="7" r="3"/><path d="M3.5 20c.4-4 2.6-6.5 5.5-6.5s5.1 2.5 5.5 6.5Z"/><path d="m18 3 .9 2.1L21 6l-2.1.9L18 9l-.9-2.1L15 6l2.1-.9Z"/><path d="M16.5 13.5c2.3.4 3.7 2.7 4 6.5"/></> :
      <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/></>}
  </svg>;
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

/** Switch theme with a circular reveal from the toggle where View Transitions are available. */
function switchTheme(next: Theme, event: MouseEvent<HTMLButtonElement>) {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { saveTheme(next); return; }
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || rect.left + rect.width / 2, y = event.clientY || rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => { flushSync(() => saveTheme(next)); });
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 700, easing: "cubic-bezier(.16,.8,.12,1)", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => { /* The theme is already applied; only the flourish was skipped. */ });
}

export function ThemeToggle({ theme }: { theme: Theme }) {
  const label = theme === "light" ? "切换深色主题" : "切换浅色主题";
  return <button type="button" className="wb-theme-toggle" onClick={event => switchTheme(theme === "light" ? "dark" : "light", event)} aria-label={label} title={label}><NavIcon kind={theme === "light" ? "moon" : "sun"}/></button>;
}

type SidebarProps = {
  active: Section;
  inWorkspace: boolean;
  open: boolean;
  setOpen: (next: boolean | ((value: boolean) => boolean)) => void;
  menuRef?: RefObject<HTMLButtonElement | null>;
  onSearch?: () => void;
};

export function WorkbenchSidebar({ active, inWorkspace, open, setOpen, menuRef, onSearch }: SidebarProps) {
  const close = () => setOpen(false);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && open) { setOpen(false); menuRef?.current?.focus(); }
  };
  const brand = <><BrandMark size={34} className="wb-brand-mark"/><span><strong>证见 EVI-X</strong><small>正大杯研究工作台</small></span></>;
  return <aside className="workbench-sidebar" data-open={open} data-dialog-background onKeyDown={onKeyDown}>
    {inWorkspace
      ? <a className="wb-brand" href="#overview" title="返回工作台概览" onClick={close}>{brand}</a>
      : <Link className="wb-brand" href="/workspace" title="返回工作台概览" onClick={close}>{brand}</Link>}
    <button className="wb-menu" ref={menuRef} type="button" aria-controls="workbench-navigation" aria-expanded={open} onClick={() => setOpen(value => !value)} aria-label={open ? "关闭导航" : "打开导航"}><NavIcon kind={open ? "close" : "menu"}/></button>
    {onSearch && <button type="button" className="wb-sidebar-search" onClick={onSearch} title="搜索工作台功能"><NavIcon kind="search"/><span>快速导航</span><kbd>Ctrl K</kbd></button>}
    <nav className="wb-navigation" id="workbench-navigation" aria-label="主要导航">
      {NAV_GROUPS.map(group => <div className="wb-nav-group" key={group}>
        <p className="wb-nav-label">{group}</p>
        {NAV_ITEMS.filter(item => item.group === group).map(item => {
          const href = navHref(item.id, inWorkspace);
          const content = <><NavIcon kind={item.icon}/><span>{item.title}</span></>;
          const current = active === item.id ? "page" as const : undefined;
          return href.startsWith("#")
            ? <a className="wb-nav-link" key={item.id} href={href} aria-current={current} onClick={close}>{content}</a>
            : <Link className="wb-nav-link" key={item.id} href={href} aria-current={current} onClick={close}>{content}</Link>;
        })}
      </div>)}
    </nav>
    <div className="wb-sidebar-footer">
      <div className="wb-evidence-path" aria-label="问题、数据、洞察、行动"><span>Q</span><i/><span>D</span><i/><span>I</span><i/><span>A</span></div>
      <strong>问有据，见有策。</strong>
      <p>独立研究辅助工具 · 非官方</p>
      <span className="wb-sidebar-version">EVI-X RESEARCH WORKSPACE</span>
    </div>
  </aside>;
}

export function WorkbenchFooter() {
  return <footer className="wb-footer"><span>证见 EVI-X · 循证研究，稳步前行</span><span>独立研究辅助工具 · 不承诺奖项结果</span></footer>;
}

export function PageHeading({ group, title, description, headingRef, actions }: { group: string; title: string; description: string; headingRef?: RefObject<HTMLHeadingElement | null>; actions: ReactNode }) {
  return <header className="workbench-topbar">
    <div className="wb-page-heading" key={title}>
      <span className="wb-breadcrumb">研究空间<i aria-hidden="true"/>{group}</span>
      <h1 className="wb-page-title" ref={headingRef} tabIndex={-1}>{title}</h1>
      <p className="wb-page-description">{description}</p>
    </div>
    <div className="wb-top-actions">{actions}</div>
  </header>;
}
