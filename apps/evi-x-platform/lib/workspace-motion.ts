/** Presentation-only motion; callers own all edits, versions and calculations. */
export const WORKSPACE_MOTION = { selection: 180, reorder: 240, reveal: 220, easing: 'cubic-bezier(.16,.8,.12,1)' } as const;
export type MotionPoint = { x: number; y: number; width: number; height: number };
export type MarkerAxis = 'vertical' | 'horizontal';
type OwnedMove = { animation: Animation; x: number; y: number };

export function layoutDelta(previous: MotionPoint, current: MotionPoint, offset = { x: 0, y: 0 }) {
  return { x: previous.x + offset.x - current.x, y: previous.y + offset.y - current.y };
}
export function markerBounds(item: MotionPoint, axis: MarkerAxis): MotionPoint {
  return axis === 'horizontal'
    ? { x: item.x, y: item.y + item.height - 2, width: item.width, height: 2 }
    : { x: item.x, y: item.y, width: 3, height: item.height };
}
export function motionProgress(animation: Animation): number {
  const progress = animation.effect?.getComputedTiming().progress;
  return progress === null || progress === undefined ? animation.playState === 'finished' ? 1 : 0 : Math.max(0, Math.min(1, progress));
}

/** Share preference/visibility cleanup without making React render every frame. */
function watchScope(root: HTMLElement, refresh: () => void) {
  const doc = root.ownerDocument, view = doc.defaultView;
  const media = view?.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, frame = 0;
  const schedule = () => {
    if (disposed || frame || !view) return;
    frame = view.requestAnimationFrame(() => { frame = 0; if (!disposed) refresh(); });
  };
  const preference = () => refresh();
  media?.addEventListener('change', preference);
  doc.addEventListener('visibilitychange', preference);
  view?.addEventListener('resize', schedule);
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
  for (let node: HTMLElement | null = root; node; node = node.parentElement) {
    observer?.observe(node, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }
  void doc.fonts?.ready.then(() => { if (!disposed) schedule(); });
  return {
    allowed: () => !disposed && !doc.hidden && !media?.matches && !root.closest('[hidden]') && root.getClientRects().length > 0,
    dispose: () => {
      disposed = true;
      if (frame) view?.cancelAnimationFrame(frame);
      observer?.disconnect();
      media?.removeEventListener('change', preference);
      doc.removeEventListener('visibilitychange', preference);
      view?.removeEventListener('resize', schedule);
    },
  };
}

export function createKeyedListMotion(root: HTMLElement) {
  let disposed = false, initialized = false, key = '', activeId: string | null = null;
  let axis: MarkerAxis = 'vertical', enabled = true;
  let positions = new Map<string, MotionPoint>();
  const knownIds = new Set<string>(), moves = new Map<HTMLElement, OwnedMove>();
  const sizes = new Map<Element, { width: number; height: number }>();
  let marker: HTMLElement | null = null, markerPoint: MotionPoint | null = null;
  let markerMove: { animation: Animation; from: MotionPoint; to: MotionPoint } | null = null;
  let observed = '';
  const elements = () => new Map(Array.from(root.querySelectorAll<HTMLElement>('[data-motion-id]')).map(node => [node.dataset.motionId!, node]));
  const cancelMoves = () => { for (const { animation } of moves.values()) animation.cancel(); moves.clear(); };
  const cancelMarker = () => { markerMove?.animation.cancel(); markerMove = null; };
  const point = (node: HTMLElement, parent: DOMRect): MotionPoint => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left - parent.left + root.scrollLeft, y: rect.top - parent.top + root.scrollTop, width: rect.width, height: rect.height };
  };
  const size = (node: Element) => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; };
  const setMarker = (next: MotionPoint | null, animate: boolean) => {
    marker = root.querySelector<HTMLElement>('[data-motion-marker]');
    if (!marker || !next) { if (marker) marker.hidden = true; cancelMarker(); markerPoint = null; return; }
    let from = markerPoint;
    if (markerMove) {
      const p = motionProgress(markerMove.animation), { from: start, to } = markerMove;
      from = { x: start.x + (to.x - start.x) * p, y: start.y + (to.y - start.y) * p, width: start.width + (to.width - start.width) * p, height: start.height + (to.height - start.height) * p };
    }
    cancelMarker();
    marker.hidden = false;
    marker.style.transform = `translate(${next.x}px,${next.y}px)`;
    marker.style.width = `${next.width}px`; marker.style.height = `${next.height}px`;
    markerPoint = next;
    if (animate && from && typeof marker.animate === 'function') {
      const animation = marker.animate([
        { transform: `translate(${from.x}px,${from.y}px)`, width: `${from.width}px`, height: `${from.height}px` },
        { transform: `translate(${next.x}px,${next.y}px)`, width: `${next.width}px`, height: `${next.height}px` },
      ], { duration: WORKSPACE_MOTION.selection, easing: WORKSPACE_MOTION.easing });
      markerMove = { animation, from, to: next };
      animation.onfinish = () => { if (markerMove?.animation === animation) markerMove = null; };
    }
  };
  const capture = () => {
    const parent = root.getBoundingClientRect(), items = elements();
    positions = new Map(Array.from(items, ([id, node]) => [id, point(node, parent)]));
    for (const node of [root, ...items.values()]) sizes.set(node, size(node));
    setMarker(activeId && positions.has(activeId) ? markerBounds(positions.get(activeId)!, axis) : null, false);
  };
  const refresh = () => { if (!disposed) { cancelMoves(); cancelMarker(); capture(); } };
  const scope = watchScope(root, refresh);
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    if (disposed) return;
    const changed = entries.some(({ target }) => {
      const previous = sizes.get(target), next = size(target);
      return !previous || Math.abs(previous.width - next.width) > .5 || Math.abs(previous.height - next.height) > .5;
    });
    if (changed) refresh();
  });
  return {
    update(ids: readonly string[], selected: string | null, nextAxis: MarkerAxis, nextEnabled: boolean) {
      if (disposed) return;
      const nextKey = JSON.stringify([ids, selected, nextAxis, nextEnabled]);
      if (key === nextKey) return;
      key = nextKey; activeId = selected; axis = nextAxis; enabled = nextEnabled;
      const items = elements(), offsets = new Map<string, { x: number; y: number }>();
      for (const [id, node] of items) {
        const move = moves.get(node);
        if (move) { const p = motionProgress(move.animation); offsets.set(id, { x: move.x * (1 - p), y: move.y * (1 - p) }); }
      }
      cancelMoves();
      const parent = root.getBoundingClientRect();
      const next = new Map(Array.from(items, ([id, node]) => [id, point(node, parent)]));
      const animate = initialized && enabled && scope.allowed();
      for (const [id, node] of items) {
        const target = next.get(id)!, previous = positions.get(id);
        if (animate && previous && typeof node.animate === 'function') {
          const delta = layoutDelta(previous, target, offsets.get(id));
          if (Math.abs(delta.x) + Math.abs(delta.y) > .5) {
            const animation = node.animate([{ transform: `translate(${delta.x}px,${delta.y}px)` }, { transform: 'translate(0px,0px)' }], { duration: WORKSPACE_MOTION.reorder, easing: WORKSPACE_MOTION.easing });
            moves.set(node, { animation, ...delta });
            animation.onfinish = () => { if (moves.get(node)?.animation === animation) moves.delete(node); };
          }
        } else if (animate && !knownIds.has(id) && typeof node.animate === 'function') {
          const animation = node.animate([{ opacity: .45, boxShadow: 'inset 3px 0 var(--wb-gold-text, #8a5a0b)' }, { opacity: 1, boxShadow: 'inset 0 0 transparent' }], { duration: WORKSPACE_MOTION.reorder, easing: WORKSPACE_MOTION.easing });
          moves.set(node, { animation, x: 0, y: 0 });
          animation.onfinish = () => { if (moves.get(node)?.animation === animation) moves.delete(node); };
        }
        knownIds.add(id);
      }
      positions = next; initialized = true;
      setMarker(selected && next.has(selected) ? markerBounds(next.get(selected)!, axis) : null, animate);
      for (const node of [root, ...items.values()]) sizes.set(node, size(node));
      const itemKey = JSON.stringify(Array.from(items.keys()));
      if (observed !== itemKey) {
        observed = itemKey; resizeObserver?.disconnect(); resizeObserver?.observe(root);
        for (const node of items.values()) resizeObserver?.observe(node);
      }
    },
    dispose() { disposed = true; cancelMoves(); cancelMarker(); scope.dispose(); resizeObserver?.disconnect(); sizes.clear(); positions.clear(); knownIds.clear(); },
  };
}

export function createContentReveal(root: HTMLElement) {
  let token: string | null = null, initialized = false, enabled = true, animation: Animation | null = null;
  const cancel = () => { animation?.cancel(); animation = null; };
  const scope = watchScope(root, cancel);
  return {
    update(next: string | null, nextEnabled: boolean) {
      if (next === token && nextEnabled === enabled && initialized) return;
      cancel();
      const shouldReveal = next !== null && next !== token && nextEnabled && scope.allowed();
      token = next; enabled = nextEnabled; initialized = true;
      if (shouldReveal && typeof root.animate === 'function') {
        animation = root.animate([{ opacity: .55 }, { opacity: 1 }], { duration: WORKSPACE_MOTION.reveal, easing: WORKSPACE_MOTION.easing });
      }
    },
    dispose() { cancel(); scope.dispose(); },
  };
}
