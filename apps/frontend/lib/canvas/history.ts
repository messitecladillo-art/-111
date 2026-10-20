/**
 * Undo / redo for the canvas. One user gesture (a drag, a paste, an auto-layout) is one entry, so a
 * single undo returns the exact ids, positions and connections that existed before it.
 */
import type { CanvasDoc } from './graph.ts';

export type Snapshot = Pick<CanvasDoc, 'nodes' | 'edges' | 'palette' | 'title'>;
export type Entry = { label: string; snap: Snapshot };
export type History = { past: Entry[]; future: Entry[] };
export const HISTORY_LIMIT = 100;
export const emptyHistory = (): History => ({ past: [], future: [] });

export const snapshotOf = (doc: CanvasDoc): Snapshot => structuredClone({ nodes: doc.nodes, edges: doc.edges, palette: doc.palette, title: doc.title });

/** Record the state *before* a change. Identical consecutive states are not recorded twice. */
export function record(h: History, label: string, before: Snapshot): History {
  const last = h.past[h.past.length - 1];
  if (last && JSON.stringify(last.snap) === JSON.stringify(before)) return { past: h.past, future: [] };
  return { past: [...h.past, { label, snap: before }].slice(-HISTORY_LIMIT), future: [] };
}
export function undo(h: History, current: Snapshot): { history: History; snap: Snapshot; label: string } | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  return { history: { past: h.past.slice(0, -1), future: [{ label: entry.label, snap: current }, ...h.future] }, snap: entry.snap, label: entry.label };
}
export function redo(h: History, current: Snapshot): { history: History; snap: Snapshot; label: string } | null {
  const entry = h.future[0];
  if (!entry) return null;
  return { history: { past: [...h.past, { label: entry.label, snap: current }], future: h.future.slice(1) }, snap: entry.snap, label: entry.label };
}
