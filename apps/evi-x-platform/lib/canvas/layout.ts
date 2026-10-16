/**
 * Explicit auto layout with Dagre (left → right along data edges). Only top-level items move; nodes
 * inside a group keep their positions relative to the group. Relation links do not affect ranks.
 */
import { Graph, layout } from '@dagrejs/dagre';
import { NODE_SIZE, type CanvasDoc, type Point } from './graph.ts';

export function sizeOf(doc: CanvasDoc, id: string): { width: number; height: number } {
  const n = doc.nodes.find(x => x.id === id);
  if (n?.kind === 'group' && !n.config.collapsed) return { width: Number(n.config.width) || 600, height: Number(n.config.height) || 360 };
  return { ...NODE_SIZE };
}

export function autoLayout(doc: CanvasDoc, opts: { rankdir?: 'LR' | 'TB'; nodesep?: number; ranksep?: number } = {}): Map<string, Point> {
  const g = new Graph({ multigraph: false });
  g.setGraph({ rankdir: opts.rankdir ?? 'LR', nodesep: opts.nodesep ?? 48, ranksep: opts.ranksep ?? 96, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const top = doc.nodes.filter(n => n.parent === null);
  const owner = new Map(doc.nodes.map(n => [n.id, n.parent ?? n.id]));
  for (const n of top) g.setNode(n.id, sizeOf(doc, n.id));
  for (const e of doc.edges) {
    if (e.kind !== 'data') continue;
    const a = owner.get(e.source)!, b = owner.get(e.target)!;
    if (a !== b && g.hasNode(a) && g.hasNode(b)) g.setEdge(a, b);
  }
  layout(g);
  // Keep the drawing where the user was looking: translate so the first node keeps its place.
  const out = new Map<string, Point>();
  for (const n of top) { const p = g.node(n.id), s = sizeOf(doc, n.id); out.set(n.id, { x: Math.round(p.x - s.width / 2), y: Math.round(p.y - s.height / 2) }); }
  const anchor = top[0];
  if (anchor) {
    const moved = out.get(anchor.id)!, dx = anchor.position.x - moved.x, dy = anchor.position.y - moved.y;
    for (const [id, p] of out) out.set(id, { x: p.x + dx, y: p.y + dy });
  }
  return out;
}
