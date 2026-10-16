/** Immutable canvas gestures. These operations change layout and references, never task state. */
import { CANVAS_LIMITS, newId, type CanvasDoc, type CanvasEdge, type CanvasNode, type Point } from './graph.ts';

export type CanvasClipboard = Pick<CanvasDoc, 'nodes' | 'edges'>;
export type PastedSelection = { doc: CanvasDoc; ids: string[] };

function checkedPosition(p: Point): Point {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e7 || Math.abs(p.y) > 1e7) throw Error('节点位置不是有效数字。');
  return { x: p.x, y: p.y };
}

function absolutePosition(node: CanvasNode, byId: ReadonlyMap<string, CanvasNode>): Point {
  let x = node.position.x, y = node.position.y, parent = node.parent;
  const seen = new Set([node.id]);
  while (parent !== null) {
    if (seen.has(parent)) throw Error('编组关系存在循环。');
    seen.add(parent);
    const owner = byId.get(parent);
    if (!owner) throw Error('节点的编组不存在。');
    x += owner.position.x; y += owner.position.y; parent = owner.parent;
  }
  return checkedPosition({ x, y });
}

/** Parent-before-child order keeps React Flow positions valid even when imported nodes were shuffled. */
function parentFirst(nodes: readonly CanvasNode[]): CanvasNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const visiting = new Set<string>(), added = new Set<string>(), result: CanvasNode[] = [];
  function add(node: CanvasNode) {
    if (added.has(node.id)) return;
    if (visiting.has(node.id)) throw Error('编组关系存在循环。');
    visiting.add(node.id);
    if (node.parent !== null) {
      const parent = byId.get(node.parent);
      if (!parent) throw Error('节点的编组不存在。');
      add(parent);
    }
    visiting.delete(node.id); added.add(node.id); result.push(node);
  }
  for (const node of nodes) add(node);
  return result;
}

/** Select a subgraph. A copied group includes its descendants; a lone child becomes independent. */
export function cloneSelection(doc: CanvasDoc, selectedIds: Iterable<string>): CanvasClipboard {
  const selected = new Set(selectedIds), byId = new Map(doc.nodes.map(n => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const node of doc.nodes) if (node.parent !== null) {
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node.id); children.set(node.parent, siblings);
  }
  const pending = [...selected];
  while (pending.length) {
    const id = pending.pop()!;
    for (const child of children.get(id) ?? []) if (!selected.has(child)) { selected.add(child); pending.push(child); }
  }
  const nodes = doc.nodes.filter(n => selected.has(n.id)).map(n => {
    const retainedParent = n.parent !== null && selected.has(n.parent);
    return {
      ...n,
      parent: retainedParent ? n.parent : null,
      position: retainedParent ? { ...n.position } : absolutePosition(n, byId),
      config: structuredClone(n.config),
    };
  });
  const included = new Set(nodes.map(n => n.id));
  return {
    nodes: parentFirst(nodes),
    edges: doc.edges.filter(e => included.has(e.source) && included.has(e.target)).map(e => ({ ...e })),
  };
}

/** Paste creates new identities and approval state; it does not modify the source or clipboard. */
export function pasteSelection(doc: CanvasDoc, clipboard: CanvasClipboard, offset: Point, idFactory: (prefix: string) => string = newId): PastedSelection {
  if (!clipboard.nodes.length) return { doc, ids: [] };
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) throw Error('粘贴位置不是有效数字。');
  if (doc.nodes.length + clipboard.nodes.length > CANVAS_LIMITS.nodes) throw Error(`一张画布最多 ${CANVAS_LIMITS.nodes} 个节点。`);
  const ordered = parentFirst(clipboard.nodes), oldIds = new Set(ordered.map(n => n.id));
  if (oldIds.size !== ordered.length) throw Error('节点 ID 重复。');
  const edges = clipboard.edges.filter(e => oldIds.has(e.source) && oldIds.has(e.target));
  if (doc.edges.length + edges.length > CANVAS_LIMITS.edges) throw Error(`一张画布最多 ${CANVAS_LIMITS.edges} 条连线。`);
  const used = new Set([...doc.nodes.map(n => n.id), ...doc.edges.map(e => e.id), ...ordered.map(n => n.id), ...edges.map(e => e.id)]);
  function fresh(prefix: string): string {
    const id = idFactory(prefix);
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(id) || used.has(id)) throw Error('新节点或连线 ID 无效或重复。');
    used.add(id); return id;
  }
  const ids = new Map(ordered.map(n => [n.id, fresh(n.kind === 'group' ? 'g' : 'n')]));
  const nodes = ordered.map(n => {
    const config = structuredClone(n.config);
    if (n.kind === 'review') { config.approvedHash = ''; config.approvedAt = ''; }
    const position = checkedPosition(n.parent === null ? { x: n.position.x + offset.x, y: n.position.y + offset.y } : n.position);
    return { ...n, id: ids.get(n.id)!, parent: n.parent === null ? null : ids.get(n.parent)!, position, config };
  });
  const copiedEdges: CanvasEdge[] = edges.map(e => ({ ...e, id: fresh('e'), source: ids.get(e.source)!, target: ids.get(e.target)! }));
  return { doc: { ...doc, nodes: [...doc.nodes, ...nodes], edges: [...doc.edges, ...copiedEdges] }, ids: nodes.map(n => n.id) };
}

/** Deleting a group keeps unselected children at their visible positions and unparents them. */
export function deleteSelection(doc: CanvasDoc, nodeIds: Iterable<string>, edgeIds: Iterable<string> = []): CanvasDoc {
  const nodesToDelete = new Set(nodeIds), edgesToDelete = new Set(edgeIds), byId = new Map(doc.nodes.map(n => [n.id, n]));
  const nodes = doc.nodes.filter(n => !nodesToDelete.has(n.id)).map(n => {
    if (n.parent === null || !nodesToDelete.has(n.parent)) return n;
    return { ...n, parent: null, position: absolutePosition(n, byId) };
  });
  const edges = doc.edges.filter(e => !edgesToDelete.has(e.id) && !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target));
  return nodes.length === doc.nodes.length && edges.length === doc.edges.length ? doc : { ...doc, nodes, edges };
}

/** Detect a committed drag by stable identity, including a parent change, rather than array order. */
export function positionsChanged(before: Pick<CanvasDoc, 'nodes'>, after: Pick<CanvasDoc, 'nodes'>): boolean {
  if (before.nodes.length !== after.nodes.length) return true;
  const old = new Map(before.nodes.map(n => [n.id, n]));
  return after.nodes.some(n => {
    const previous = old.get(n.id);
    return !previous || previous.parent !== n.parent || previous.position.x !== n.position.x || previous.position.y !== n.position.y;
  });
}

/** Apply only measured node positions. Unchanged nodes and a no-op document retain their identities. */
export function applyPositions(doc: CanvasDoc, positions: ReadonlyMap<string, Point>): CanvasDoc {
  let changed = false;
  const nodes = doc.nodes.map(n => {
    const p = positions.get(n.id);
    if (!p || (p.x === n.position.x && p.y === n.position.y)) return n;
    const position = checkedPosition(p);
    changed = true;
    return { ...n, position };
  });
  return changed ? { ...doc, nodes } : doc;
}
