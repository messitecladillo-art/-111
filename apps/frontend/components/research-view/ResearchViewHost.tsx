'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkbenchTheme } from '@/components/workbench/shell-kit';
import { createResearchViewController, type ResearchEditorSection, type ResearchViewMode } from './view-controller';
import styles from './ResearchViewHost.module.css';

export type ResearchViewHostProps = {
  identityKey: string;
  projectTitle: string;
  activeSection: string;
  onOpenEditor: (section: ResearchEditorSection) => void;
  children: ReactNode;
  enabled?: boolean;
};
const REFERENCE_LABELS: Record<ResearchEditorSection, { title: string; label: string; icon: string }> = {
  design: { title: '问卷设计', label: '问卷', icon: 'Q' },
  report: { title: '报告与 PPT', label: '报告', icon: 'A' },
};

export default function ResearchViewHost({ enabled = process.env.NEXT_PUBLIC_EVIX_RESEARCH_CANVAS === 'true', ...props }: ResearchViewHostProps) {
  if (!enabled) return props.children;
  return <MountedResearchView key={props.identityKey} {...props} />;
}

function MountedResearchView({ projectTitle, activeSection, onOpenEditor, children }: Omit<ResearchViewHostProps, 'enabled'>) {
  const theme = useWorkbenchTheme();
  const [mode, setMode] = useState<ResearchViewMode>('workbench'), [references, setReferences] = useState<ResearchEditorSection[]>([]), [libraryOpen, setLibraryOpen] = useState(false);
  const surface = useRef<HTMLElement>(null), library = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null), addButton = useRef<HTMLButtonElement>(null), workbenchButton = useRef<HTMLButtonElement>(null), lastCanvasFocus = useRef<HTMLElement | null>(null);
  const callbacks = useRef({ activeSection, onOpenEditor });
  const controller = useRef<ReturnType<typeof createResearchViewController> | null>(null);
  useLayoutEffect(() => { callbacks.current = { activeSection, onOpenEditor }; }, [activeSection, onOpenEditor]);
  useEffect(() => {
    const instance = createResearchViewController({
      getHost: () => editorHost.current,
      getSection: () => callbacks.current.activeSection,
      getCanvasFocus: () => lastCanvasFocus.current?.isConnected ? lastCanvasFocus.current : addButton.current,
      getToolbarFocus: () => workbenchButton.current,
      onModeChange: next => { setMode(next); setLibraryOpen(false); },
      onOpenEditor: section => callbacks.current.onOpenEditor(section),
      requestFrame: callback => window.requestAnimationFrame(callback),
      cancelFrame: frame => window.cancelAnimationFrame(frame),
      queueMicrotask: callback => queueMicrotask(callback),
      observeHost: (host, callback) => { const observer = new MutationObserver(callback); observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); return () => observer.disconnect(); },
      scheduleTimeout: (callback, duration) => window.setTimeout(callback, duration),
      cancelTimeout: timer => window.clearTimeout(timer),
    });
    controller.current = instance;
    const userInteraction = () => instance.userInteraction();
    document.addEventListener('pointerdown', userInteraction, true); document.addEventListener('keydown', userInteraction, true); document.addEventListener('wheel', userInteraction, { capture: true, passive: true });
    return () => { document.removeEventListener('pointerdown', userInteraction, true); document.removeEventListener('keydown', userInteraction, true); document.removeEventListener('wheel', userInteraction, true); instance.dispose(); if (controller.current === instance) controller.current = null; };
  }, []);
  useEffect(() => {
    if (!libraryOpen || mode !== 'canvas') return;
    const root = surface.current;
    if (!root) return;
    const firstChoice = library.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    (firstChoice ?? addButton.current)?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || root.dataset.researchView !== 'canvas') return;
      event.preventDefault();
      event.stopPropagation();
      setLibraryOpen(false);
      lastCanvasFocus.current = addButton.current;
      addButton.current?.focus({ preventScroll: true });
    };
    root.addEventListener('keydown', closeOnEscape);
    return () => root.removeEventListener('keydown', closeOnEscape);
  }, [libraryOpen, mode]);
  const remember = (target: EventTarget | null) => { if (target instanceof HTMLElement) controller.current?.remember(target); };
  const openReference = (section: ResearchEditorSection, target: HTMLButtonElement) => { lastCanvasFocus.current = target; controller.current?.openEditor(section); };
  return <section ref={surface} className={styles.root} data-theme={theme} data-research-view={mode} aria-label="项目研究视图">
    <div className={styles.toolbar} data-self-styled>
      <span className={styles.projectTitle} title={projectTitle}>{projectTitle}</span>
      <div className={styles.segmented} role="group" aria-label="工作视图">
        <span className={styles.selection} data-mode={mode} aria-hidden="true" />
        <button ref={workbenchButton} type="button" aria-pressed={mode === 'workbench'} onPointerDown={event => controller.current?.protectPointerDown(event)} onClick={() => controller.current?.requestMode('workbench')}>工作台</button>
        <button type="button" aria-pressed={mode === 'canvas'} onPointerDown={event => controller.current?.protectPointerDown(event)} onClick={() => controller.current?.requestMode('canvas')}>画布</button>
      </div>
      {mode === 'workbench' && <button type="button" className={styles.returnButton} onPointerDown={event => controller.current?.protectPointerDown(event)} onClick={() => controller.current?.requestMode('canvas')}>返回画布 ↗</button>}
    </div>
    <div ref={editorHost} className={styles.editorHost} hidden={mode !== 'workbench'} data-research-editor-host
      onFocusCapture={event => remember(event.target)} onBlurCapture={event => remember(event.target)} onSelectCapture={event => remember(event.target)} onInputCapture={event => remember(event.target)} onKeyUpCapture={event => remember(event.target)} onPointerUpCapture={event => remember(event.target)} onScrollCapture={event => remember(event.target)}
      onCompositionStartCapture={() => controller.current?.compositionStart()} onCompositionEndCapture={() => controller.current?.compositionEnd()}>
      {children}
    </div>
    <div className={styles.canvas} data-self-styled hidden={mode !== 'canvas'} aria-label="研究画布">
      <button ref={addButton} type="button" className={styles.addButton} aria-expanded={libraryOpen} aria-controls="research-reference-library" onClick={() => setLibraryOpen(previous => !previous)}>＋ <span>添加成果引用</span></button>
      {libraryOpen && <div ref={library} id="research-reference-library" className={styles.library} role="group" aria-label="可添加的成果引用">
        {(Object.keys(REFERENCE_LABELS) as ResearchEditorSection[]).map(section => <button key={section} type="button" disabled={references.includes(section)} onClick={() => { setReferences(previous => previous.includes(section) ? previous : [...previous, section]); setLibraryOpen(false); lastCanvasFocus.current = addButton.current; addButton.current?.focus({ preventScroll: true }); }}><span className={styles.referenceIcon}>{REFERENCE_LABELS[section].icon}</span><span><strong>{REFERENCE_LABELS[section].title}</strong><small>{references.includes(section) ? '已在画布中' : '添加到画布'}</small></span></button>)}
      </div>}
      <div className={styles.referenceArea}>
        {references.map(section => <button type="button" className={styles.referenceCard} key={section} onPointerDown={event => controller.current?.protectPointerDown(event)} onClick={event => openReference(section, event.currentTarget)}><span className={styles.cardHeading}><span className={styles.referenceIcon}>{REFERENCE_LABELS[section].icon}</span><small>项目成果 · {REFERENCE_LABELS[section].label}</small></span><strong>{REFERENCE_LABELS[section].title}</strong><span className={styles.cardFooter}>打开编辑器 <span aria-hidden="true">↗</span></span></button>)}
      </div>
    </div>
  </section>;
}