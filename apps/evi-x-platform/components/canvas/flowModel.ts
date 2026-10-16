/**
 * Document → React Flow mapping with identity-preserving memoisation: a node whose document object,
 * run state and decorations are unchanged keeps the same flow object, so dragging one card does not
 * re-render the other 199. The caches are keyed by immutable document objects only.
 */
import type { XYPosition } from '@xyflow/react';
import { nodeDef } from '@/lib/canvas/catalog';
import { NODE_SIZE, type CanvasDoc, type CanvasEdge, type CanvasNode, type Issue } from '@/lib/canvas/graph';
import type { NodeState, NodeStatus } from '@/lib/canvas/execute';
import { STATUS_LABELS, type FlowEdge, type FlowNode } from './canvasUi';

export const EMPTY_ISSUES: Issue[] = [];
type NodeExtras = { state: NodeState | undefined; issues: Issue[]; entering: 'add' | 'copy' | 'restore' | null; selected: boolean; hidden: boolean; childCount: number; childKey: string };
const nodeCache = new WeakMap<CanvasNode, NodeExtras & { flow: FlowNode }>();

export const GROUP_COLLAPSED = { width: 260, height: 112 } as const;

export function toFlowNode(n: CanvasNode, x: NodeExtras, childStatus: Partial<Record<NodeStatus, number>>): FlowNode {
  const prev = nodeCache.get(n);
  if (prev && prev.state === x.state && prev.issues === x.issues && prev.entering === x.entering && prev.selected === x.selected && prev.hidden === x.hidden && prev.childCount === x.childCount && prev.childKey === x.childKey) return prev.flow;
  const def = nodeDef(n.kind), group = n.kind === 'group', collapsed = group && !!n.config.collapsed;
  const status = x.state?.status ?? 'idle';
  const size = group ? (collapsed ? { ...GROUP_COLLAPSED } : { width: Number(n.config.width) || 600, height: Number(n.config.height) || 360 }) : { width: NODE_SIZE.width, height: NODE_SIZE.height };
  const flow: FlowNode = {
    id: n.id, type: group ? 'cvgroup' : 'research', position: n.position,
    ...(n.parent ? { parentId: n.parent, extent: 'parent' as const } : {}),
    hidden: x.hidden, selected: x.selected,
    // Sizes are fixed by the document, so they are passed as already measured: React Flow then keeps
    // its handle positions when a status update hands it a new node object, and edges never blink out.
    measured: size,
    // An open frame sits behind its members; a collapsed one is a card and sits with the others.
    ...(group ? { style: size, zIndex: collapsed ? 0 : -1 } : size),
    ariaLabel: group ? `编组「${n.title}」，${x.childCount} 个节点${collapsed ? '，已收起' : ''}` : `${n.title}，${def.title}${status !== 'idle' ? `，${STATUS_LABELS[status]}` : ''}`,
    data: { node: n, state: x.state, issues: x.issues, entering: x.entering, childCount: x.childCount, childStatus },
  };
  nodeCache.set(n, { ...x, flow });
  return flow;
}

type EdgeExtras = { entering: boolean; pulse: number; status: NodeStatus | null; selected: boolean; hidden: boolean };
const edgeCache = new WeakMap<CanvasEdge, EdgeExtras & { flow: FlowEdge }>();
export function toFlowEdge(e: CanvasEdge, x: EdgeExtras): FlowEdge {
  const prev = edgeCache.get(e);
  if (prev && prev.entering === x.entering && prev.pulse === x.pulse && prev.status === x.status && prev.selected === x.selected && prev.hidden === x.hidden) return prev.flow;
  const flow: FlowEdge = {
    id: e.id, type: e.kind, source: e.source, target: e.target, sourceHandle: e.sourcePort, targetHandle: e.targetPort,
    selected: x.selected, hidden: x.hidden, ariaLabel: e.kind === 'data' ? '数据连线' : '说明连线',
    data: { kind: e.kind, entering: x.entering, pulse: x.pulse, status: x.status },
  };
  edgeCache.set(e, { ...x, flow });
  return flow;
}

/** Absolute position of a node (children are stored relative to their group). */
export function absolutePosition(doc: CanvasDoc, n: CanvasNode): XYPosition {
  if (!n.parent) return n.position;
  const p = doc.nodes.find(x => x.id === n.parent);
  return p ? { x: p.position.x + n.position.x, y: p.position.y + n.position.y } : n.position;
}

/**
 * Snap a dragged node to the edges and centres of nearby nodes. Returns the snapped position and
 * the guide lines to draw (flow coordinates). Threshold is in screen pixels.
 */
export function snapToNeighbours(doc: CanvasDoc, id: string, pos: XYPosition, zoom: number, threshold = 6): { pos: XYPosition; guides: { x: number | null; y: number | null } } {
  const me = doc.nodes.find(n => n.id === id);
  if (!me || me.parent || me.kind === 'group') return { pos, guides: { x: null, y: null } };
  const t = threshold / Math.max(zoom, 0.1), w = NODE_SIZE.width, h = NODE_SIZE.height;
  let bestX: { d: number; v: number; line: number } | null = null, bestY: { d: number; v: number; line: number } | null = null;
  for (const o of doc.nodes) {
    if (o.id === id || o.parent || o.kind === 'group') continue;
    for (const [mine, theirs] of [[0, 0], [w / 2, w / 2], [w, w], [0, w], [w, 0]] as const) {
      const d = Math.abs(pos.x + mine - (o.position.x + theirs));
      if (d < t && (!bestX || d < bestX.d)) bestX = { d, v: o.position.x + theirs - mine, line: o.position.x + theirs };
    }
    for (const [mine, theirs] of [[0, 0], [h / 2, h / 2], [h, h]] as const) {
      const d = Math.abs(pos.y + mine - (o.position.y + theirs));
      if (d < t && (!bestY || d < bestY.d)) bestY = { d, v: o.position.y + theirs - mine, line: o.position.y + theirs };
    }
  }
  return { pos: { x: bestX ? bestX.v : pos.x, y: bestY ? bestY.v : pos.y }, guides: { x: bestX?.line ?? null, y: bestY?.line ?? null } };
}
