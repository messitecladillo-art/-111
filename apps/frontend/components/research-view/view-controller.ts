export type ResearchViewMode = 'workbench' | 'canvas';
export type ResearchEditorSection = 'design' | 'report';
type Selection = { start: number; end: number; direction: 'forward' | 'backward' | 'none' | null };
type FocusSnapshot = { element: HTMLElement; section: string; selection: Selection | null; scroll: { element: HTMLElement; top: number; left: number }[] };
export type ResearchViewControllerOptions = {
  getHost: () => HTMLElement | null;
  getSection: () => string;
  getCanvasFocus: () => HTMLElement | null;
  getToolbarFocus: () => HTMLElement | null;
  onModeChange: (mode: ResearchViewMode) => void;
  onOpenEditor: (section: ResearchEditorSection) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  queueMicrotask: (callback: () => void) => void;
  observeHost?: (host: HTMLElement, callback: () => void) => () => void;
  scheduleTimeout?: (callback: () => void, duration: number) => number;
  cancelTimeout?: (id: number) => void;
};
const editable = (element: HTMLElement): boolean => element.tagName === 'TEXTAREA' || element.tagName === 'INPUT' && !['button','checkbox','radio','submit','reset','file','range','color','hidden'].includes((element as HTMLInputElement).type);
const visible = (element: HTMLElement): boolean => element.isConnected && !element.closest('[hidden],[inert]') && element.getClientRects().length > 0 && element.ownerDocument.defaultView?.getComputedStyle(element).visibility !== 'hidden';
const eligible = (element: HTMLElement): boolean => editable(element) && visible(element) && !element.matches(':disabled');

/** Owns view and focus handoff only. It never edits, serializes or saves research content. */
export function createResearchViewController(options: ResearchViewControllerOptions) {
  let mode: ResearchViewMode = 'workbench', composing = false, settling = false, disposed = false, restoring = false, epoch = 0;
  let pending: { mode: ResearchViewMode; section?: ResearchEditorSection } | null = null;
  let focusEpoch = 0;
  let focusWait: { cleanup: () => void; timer?: number } | null = null;
  const cancelFocusWait = () => { const waiting = focusWait; focusWait = null; if (waiting) { waiting.cleanup(); if (waiting.timer !== undefined) options.cancelTimeout?.(waiting.timer); } };
  const frames = new Set<number>(), inputs = new Map<string, FocusSnapshot>();
  const cancelScheduled = () => { epoch++; frames.forEach(options.cancelFrame); frames.clear(); cancelFocusWait(); };
  const frame = (callback: () => void, token = epoch) => {
    const id = options.requestFrame(() => { frames.delete(id); if (!disposed && token === epoch) callback(); }); frames.add(id);
  };
  const remember = (target?: HTMLElement | null) => {
    if (disposed || restoring || mode !== 'workbench') return;
    if (target) cancelFocusWait();
    const host = options.getHost(), element = target ?? host?.ownerDocument.activeElement as HTMLElement | null;
    if (!host || !element || !host.contains(element) || !eligible(element)) return;
    const field = element as HTMLInputElement | HTMLTextAreaElement;
    const selection = typeof field.selectionStart === 'number' && typeof field.selectionEnd === 'number' ? { start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection } : null;
    const scroll: FocusSnapshot['scroll'] = []; let ancestor: HTMLElement | null = element;
    while (ancestor) { scroll.push({ element: ancestor, top: ancestor.scrollTop, left: ancestor.scrollLeft }); ancestor = ancestor.parentElement; }
    const section = options.getSection(); inputs.set(section, { element, section, selection, scroll });
  };
  const restore = () => {
    const host = options.getHost(); if (!host || host.hidden || mode !== 'workbench') return false;
    const section = options.getSection(), snapshot = inputs.get(section);
    const remembered = snapshot && snapshot.section === section && host.contains(snapshot.element) && eligible(snapshot.element) ? snapshot.element : null;
    const candidates = [...new Set([...(remembered ? [remembered] : []), ...host.querySelectorAll<HTMLElement>('textarea,input')])].filter(eligible);
    restoring = true;
    try {
      for (const target of candidates) {
        target.focus({ preventScroll: true });
        if (host.ownerDocument.activeElement !== target) continue;
        if (snapshot && target === snapshot.element) {
          const field = target as HTMLInputElement | HTMLTextAreaElement;
          if (snapshot.selection && typeof field.setSelectionRange === 'function') { const length = field.value.length; try { field.setSelectionRange(Math.min(snapshot.selection.start,length),Math.min(snapshot.selection.end,length),snapshot.selection.direction ?? undefined); } catch { /* Unsupported input types retain focus without text selection. */ } }
          snapshot.scroll.filter(item => item.element.isConnected).forEach(item => { item.element.scrollTop = item.top; item.element.scrollLeft = item.left; });
        }
        return true;
      }
      const toolbar = options.getToolbarFocus(); if (toolbar && visible(toolbar) && !toolbar.matches(':disabled')) toolbar.focus({ preventScroll: true });
      return false;
    } finally { restoring = false; }
  };  const restoreWhenMounted = (focusToken: number) => {
    if (restore()) return;
    const host = options.getHost(), toolbar = options.getToolbarFocus(), section = options.getSection(), token = epoch;
    if (!host || !toolbar || host.ownerDocument.activeElement !== toolbar || !options.observeHost) return;
    const waiting = { cleanup: () => {}, timer: undefined as number | undefined }; focusWait = waiting; let queued = false;
    const valid = () => !disposed && focusWait === waiting && epoch === token && focusEpoch === focusToken && mode === 'workbench' && options.getSection() === section && host.ownerDocument.activeElement === toolbar;
    waiting.cleanup = options.observeHost(host, () => {
      if (!valid()) { cancelFocusWait(); return; } if (queued) return; queued = true;
      frame(() => { queued = false; if (!valid()) { cancelFocusWait(); return; } if (restore()) cancelFocusWait(); }, token);
    });
    waiting.timer = options.scheduleTimeout?.(cancelFocusWait, 5000);
  };
  const apply = (request: { mode: ResearchViewMode; section?: ResearchEditorSection }) => {
    if (disposed) return;
    cancelScheduled(); pending = null; settling = false;
    if (request.section) options.onOpenEditor(request.section);
    mode = request.mode; options.onModeChange(mode); const focusToken = ++focusEpoch;
    frame(() => frame(() => {
      if (focusToken !== focusEpoch) return;
      if (mode === 'workbench') restoreWhenMounted(focusToken);
      else { const focus = options.getCanvasFocus(); if (focus && visible(focus)) focus.focus({ preventScroll: true }); }
    }));
  };
  const request = (next: ResearchViewMode, section?: ResearchEditorSection) => {
    if (disposed) return;
    remember();
    if (composing || settling) { pending = { mode: next, section }; return; }
    apply({ mode: next, section });
  };
  const compositionStart = () => { if (disposed) return; composing = true; settling = false; cancelScheduled(); remember(); };
  const compositionEnd = () => {
    if (disposed) return; composing = false; remember(); if (!pending) return;
    settling = true; cancelScheduled(); const token = epoch;
    options.queueMicrotask(() => { if (disposed || token !== epoch || composing) return; frame(() => frame(() => { settling = false; const next = pending; if (next) apply(next); }), token); });
  };
  return {
    remember,
    userInteraction: () => { focusEpoch++; cancelFocusWait(); },
    requestMode: (next: ResearchViewMode) => request(next),
    openEditor: (section: ResearchEditorSection) => request('workbench', section),
    compositionStart,
    compositionEnd,
    protectPointerDown: (event: { preventDefault: () => void }) => { focusEpoch++; cancelFocusWait(); remember(); if (composing || settling) event.preventDefault(); },
    dispose: () => { disposed = true; pending = null; composing = false; settling = false; cancelScheduled(); inputs.clear(); },
  };
}