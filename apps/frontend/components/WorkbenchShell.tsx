"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useKnowledge } from './knowledge/KnowledgeProvider';
import { AccountStatus } from './hosted/HostedFrame';
import ViewSwitch from './canvas/ViewSwitch';
import { NAV_ITEMS, NavIcon, PageHeading, ThemeProvider, ThemeToggle, WorkbenchFooter, WorkbenchSidebar, useThemePreference, type Section } from './workbench/shell-kit';

export { useWorkbenchTheme } from './workbench/shell-kit';

type Panel = Exclude<Section, "lifecycle">;
export type WorkbenchPanel = Panel;
const ITEMS = NAV_ITEMS;

/**
 * Canvas ↔ editor navigation. A canvas node opens the same mounted editor panel the workbench uses
 * (panels stay mounted once visited), and a pill brings the user back to that node.
 */
type CanvasReturn = { nodeId: string; title: string };
export type WorkbenchNav = {
  section: Section;
  openFromCanvas: (target: Section, nodeId: string, title: string) => void;
  showWorkbench: () => void;
  canvasFocus: { nodeId: string; token: number } | null;
};
const NavContext = createContext<WorkbenchNav | null>(null);
/** Lets another shell (the agent shell) host workbench modules that navigate through this context. */
export const WorkbenchNavProvider = NavContext.Provider;
export function useWorkbenchNav(): WorkbenchNav {
  const value = useContext(NavContext);
  if (!value) throw Error("useWorkbenchNav must be used inside WorkbenchShell");
  return value;
}

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function currentSection(): Section {
  const hash = window.location.hash.slice(1);
  return ITEMS.some(item => item.id === hash) ? hash as Section : "overview";
}

export default function WorkbenchShell({ panels }: { panels: Record<Panel, ReactNode> }) {
  const { openSearch: showCommands } = useKnowledge();
  const section = useSyncExternalStore(subscribeHash, currentSection, () => "overview" as Section);
  const activePanel: Panel = section === "lifecycle" ? "workspace" : section;
  const current = ITEMS.find(item => item.id === section)!;
  const theme = useThemePreference();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState<Panel[]>(['overview']);
  // Panels stay mounted once visited; record the first visit during render instead of in an effect.
  if (!visited.includes(activePanel)) setVisited([...visited, activePanel]);
  const canvasView = section === "canvas";
  const [lastWorkbench, setLastWorkbench] = useState<Section>(canvasView ? "overview" : section);
  const [shownSection, setShownSection] = useState(section);
  const [arrived, setArrived] = useState(false);
  // Remember where the workbench was and whether the switch indicator should replay its slide.
  if (shownSection !== section) {
    setShownSection(section);
    setArrived(shownSection === "canvas" && !canvasView);
    if (!canvasView) setLastWorkbench(section);
  }
  const [canvasReturn, setCanvasReturn] = useState<CanvasReturn | null>(null);
  const [canvasFocus, setCanvasFocus] = useState<{ nodeId: string; token: number } | null>(null);
  const openFromCanvas = useCallback((target: Section, nodeId: string, title: string) => {
    setCanvasReturn({ nodeId, title });
    window.location.hash = target;
  }, []);
  const showWorkbench = useCallback(() => { window.location.hash = lastWorkbench; }, [lastWorkbench]);
  const backToCanvas = () => {
    if (canvasReturn) setCanvasFocus({ nodeId: canvasReturn.nodeId, token: Date.now() });
    setCanvasReturn(null);
    window.location.hash = "canvas";
  };
  const nav = useMemo<WorkbenchNav>(() => ({ section, openFromCanvas, showWorkbench, canvasFocus }), [section, openFromCanvas, showWorkbench, canvasFocus]);
  const menuRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastSection = useRef(section);

  useEffect(() => {
    const changed = lastSection.current !== section;
    lastSection.current = section;
    const frame = requestAnimationFrame(() => {
      if (section === "lifecycle") document.getElementById("lifecycle")?.scrollIntoView({ block: "start", behavior: "instant" });
      else window.scrollTo({ top: 0, behavior: "instant" });
      // The canvas moves focus to its own surface when it becomes active.
      if (changed && section !== "canvas") headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);

  return <ThemeProvider value={theme}><NavContext.Provider value={nav}>
    <div className="workbench" data-theme={theme} data-section={section} data-view={canvasView ? "canvas" : "workbench"}>
      <a className="skip-link" href="#top" onClick={event => { event.preventDefault(); (headingRef.current ?? document.getElementById("top"))?.focus(); }}>跳到主要内容</a>
      <WorkbenchSidebar active={section} inWorkspace open={open} setOpen={setOpen} menuRef={menuRef} onSearch={showCommands}/>
      <div className="workbench-main" data-dialog-background>
        {!canvasView && <PageHeading group={current.group} title={current.title} description={current.description} headingRef={headingRef} actions={<>
          <ViewSwitch view="workbench" arrive={arrived} onCanvas={() => { window.location.hash = "canvas"; }}/>
          <button type="button" className="wb-search-toggle" onPointerDown={event => event.preventDefault()} onClick={showCommands} title="全局搜索（Ctrl / ⌘ K）"><NavIcon kind="search"/><span>全局搜索</span><kbd>⌘ K</kbd></button>
          <AccountStatus/>
          <ThemeToggle theme={theme}/>
          {!["editor", "design", "silicon", "analysis"].includes(section) && <a className="wb-top-cta" href="#diagnose"><NavIcon kind="plus"/>开始诊断</a>}
        </>}/>}
        <div className="workbench-content"><main id="top" tabIndex={-1}>
          {(Object.keys(panels) as Panel[]).filter(panel => visited.includes(panel) || activePanel === panel).map(panel => <div key={panel} className="wb-panel" data-workbench-panel={panel} hidden={activePanel !== panel}>{panels[panel]}</div>)}
        </main></div>
        {!canvasView && <WorkbenchFooter/>}
        {canvasReturn && !canvasView && <div className="wb-canvas-return" role="region" aria-label="画布返回">
          <button type="button" onClick={backToCanvas}><NavIcon kind="nodes"/><span>返回画布</span>{canvasReturn.title && <small>{canvasReturn.title}</small>}</button>
          <button type="button" className="wb-canvas-return-close" aria-label="不再显示返回画布" onClick={() => setCanvasReturn(null)}><NavIcon kind="close"/></button>
        </div>}
      </div>

    </div>
  </NavContext.Provider></ThemeProvider>;
}
