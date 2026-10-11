/**
 * Research-canvas document: nodes, typed data edges and relation edges, plus a project palette.
 * Layout (positions, group sizes) lives in the same document but is never part of a computation key.
 * Raw respondent data is never stored here: dataset nodes keep only a file name and content hash.
 */
import { isKind, isStat, nodeDef, type NodeKind, type PortType } from './catalog.ts';

export const CANVAS_SCHEMA = 'research-canvas/v1';
export const CANVAS_LIMITS = { nodes: 200, edges: 500, text: 4000, title: 120, values: 50, columns: 30, bytes: 1_000_000 } as const;
export const NODE_SIZE = { width: 260, height: 144 } as const;

export type Point = { x: number; y: number };
export type EdgeKind = 'data' | 'relation';
export type CanvasEdge = { id: string; kind: EdgeKind; source: string; sourcePort: string; target: string; targetPort: string };
export type CanvasNode = { id: string; kind: NodeKind; title: string; position: Point; parent: string | null; config: Record<string, unknown> };
export type CanvasDoc = { schema: typeof CANVAS_SCHEMA; title: string; palette: string; nodes: CanvasNode[]; edges: CanvasEdge[] };

/** Handles for relation (dotted) links; they never carry data and never schedule anything. */
export const REL_OUT = 'rel-out', REL_IN = 'rel-in';

export function defaultConfig(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case 'question': case 'method': case 'note': case 'conclusion': return { text: '' };
    case 'material': return { text: '', source: '' };
    case 'dataset': return { source: 'workspace', fileName: '', fileHash: '', missingCodes: '' };
    case 'filter': return { column: '', values: [] };
    case 'missing': return { codes: '', complete: [] };
    case 'alpha': return { columns: [], reverse: [], min: 1, max: 5, construct: '', question: '' };
    case 'chart': return { kind: 'auto', palette: '', title: '', decimals: 2, showLabels: false, tableRules: 'three_line' };
    case 'review': return { approvedHash: '', approvedAt: '', note: '' };
    case 'report': return { heading: '' };
    case 'group': return { collapsed: false, width: 600, height: 360 };
    default: return isStat(kind) ? { x: '', y: '', question: '' } : {};
  }
}

export function emptyDoc(title = '研究画布'): CanvasDoc {
  return { schema: CANVAS_SCHEMA, title, palette: 'blue', nodes: [], edges: [] };
}

/* ───────── graph queries ───────── */

const dataEdges = (doc: CanvasDoc) => doc.edges.filter(e => e.kind === 'data');

/** Every node that can reach `id` through data edges (excluding itself). */
export function upstreamOf(doc: CanvasDoc, ids: Iterable<string>): Set<string> {
  const into = new Map<string, string[]>();
  for (const e of dataEdges(doc)) (into.get(e.target) ?? into.set(e.target, []).get(e.target)!).push(e.source);
  const seen = new Set<string>(), stack = [...ids];
  while (stack.length) for (const s of into.get(stack.pop()!) ?? []) if (!seen.has(s)) { seen.add(s); stack.push(s); }
  return seen;
}
export function downstreamOf(doc: CanvasDoc, ids: Iterable<string>): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of dataEdges(doc)) (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e.target);
  const seen = new Set<string>(), stack = [...ids];
  while (stack.length) for (const t of out.get(stack.pop()!) ?? []) if (!seen.has(t)) { seen.add(t); stack.push(t); }
  return seen;
}

/** Kahn order over data edges; nodes on a cycle are returned separately. */
export function topoOrder(doc: CanvasDoc, ids?: Set<string>): { order: string[]; cyclic: string[] } {
  const nodes = doc.nodes.filter(n => !ids || ids.has(n.id)).map(n => n.id), inside = new Set(nodes);
  const indeg = new Map(nodes.map(id => [id, 0])), out = new Map<string, string[]>();
  for (const e of dataEdges(doc)) if (inside.has(e.source) && inside.has(e.target)) { indeg.set(e.target, indeg.get(e.target)! + 1); (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e.target); }
  // Stable: ready nodes are taken in document order.
  const position = new Map(nodes.map((id, i) => [id, i]));
  const ready = nodes.filter(id => indeg.get(id) === 0), order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => position.get(a)! - position.get(b)!);
    const id = ready.shift()!; order.push(id);
    for (const t of out.get(id) ?? []) { indeg.set(t, indeg.get(t)! - 1); if (indeg.get(t) === 0) ready.push(t); }
  }
  const done = new Set(order);
  return { order, cyclic: nodes.filter(id => !done.has(id)) };
}

/** The data type leaving a port; a review node passes through whatever reaches it. */
export function outputType(doc: CanvasDoc, nodeId: string, portId: string, guard = new Set<string>()): PortType | null {
  const node = doc.nodes.find(n => n.id === nodeId);
  if (!node || guard.has(nodeId)) return null;
  const port = nodeDef(node.kind).outputs.find(p => p.id === portId);
  if (!port) return null;
  if (port.type !== 'passthrough') return port.type;
  guard.add(nodeId);
  const incoming = doc.edges.find(e => e.kind === 'data' && e.target === nodeId);
  return incoming ? outputType(doc, incoming.source, incoming.sourcePort, guard) : null;
}

export type Connection = { source: string; sourcePort: string; target: string; targetPort: string };
/** Why a connection is not allowed, or null when it is. Reasons are shown to the user verbatim. */
export function connectionProblem(doc: CanvasDoc, c: Connection, ignoreEdge?: string): string | null {
  if (c.source === c.target) return '不能连接到节点自身。';
  const source = doc.nodes.find(n => n.id === c.source), target = doc.nodes.find(n => n.id === c.target);
  if (!source || !target) return '节点不存在。';
  const edges = doc.edges.filter(e => e.id !== ignoreEdge);
  if (c.sourcePort === REL_OUT || c.targetPort === REL_IN) {
    if (c.sourcePort !== REL_OUT || c.targetPort !== REL_IN) return '说明连线只能连接节点上下两端的关联点。';
    if (edges.some(e => e.kind === 'relation' && ((e.source === c.source && e.target === c.target) || (e.source === c.target && e.target === c.source)))) return '这两个节点之间已有说明连线。';
    return null;
  }
  const out = nodeDef(source.kind).outputs.find(p => p.id === c.sourcePort), inp = nodeDef(target.kind).inputs.find(p => p.id === c.targetPort);
  if (!out) return `「${source.title}」没有这个输出端口。`;
  if (!inp) return `「${target.title}」没有这个输入端口。`;
  const type = outputType({ ...doc, edges }, source.id, out.id);
  if (type && !inp.accepts.includes(type)) return `类型不匹配：「${source.title}」输出${TYPE_LABELS[type]}，「${target.title}」的「${inp.label}」需要${inp.accepts.map(t => TYPE_LABELS[t]).join('或')}。`;
  if (edges.some(e => e.kind === 'data' && e.source === c.source && e.sourcePort === c.sourcePort && e.target === c.target && e.targetPort === c.targetPort)) return '这条连线已存在。';
  if (!inp.multiple && edges.some(e => e.kind === 'data' && e.target === c.target && e.targetPort === c.targetPort)) return `「${target.title}」的「${inp.label}」已有输入，请先断开原连线。`;
  if (upstreamOf({ ...doc, edges }, [c.source]).has(c.target) || c.target === c.source) return '这条连线会形成循环，执行图必须是有向无环的。';
  return null;
}
export const TYPE_LABELS: Record<PortType, string> = { dataset: '数据', result: '统计结果', chart: '图表', bundle: '汇集结果' };

/* ───────── preflight ───────── */

export type Issue = { nodeId: string; level: 'error' | 'warning'; message: string };
export const isRunnable = (kind: NodeKind) => nodeDef(kind).capability === 'run';

/** Runnable nodes included when running `selected`: the selection plus every data-upstream runnable node. */
export function runScope(doc: CanvasDoc, selected: string[] | null): string[] {
  const runnable = new Set(doc.nodes.filter(n => isRunnable(n.kind)).map(n => n.id));
  const wanted = selected === null ? runnable : new Set([...selected, ...upstreamOf(doc, selected)].filter(id => runnable.has(id)));
  return topoOrder(doc, wanted).order;
}

const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Static checks that need no data: missing inputs, unset variables, cycles and type mismatches. */
export function preflight(doc: CanvasDoc, scope: string[]): Issue[] {
  const issues: Issue[] = [], inScope = new Set(scope);
  const { cyclic } = topoOrder(doc);
  for (const id of cyclic) issues.push({ nodeId: id, level: 'error', message: '位于循环连线中，无法确定执行顺序。' });
  for (const e of doc.edges) {
    if (e.kind !== 'data' || !inScope.has(e.target)) continue;
    const p = connectionProblem({ ...doc, edges: doc.edges.filter(x => x.id !== e.id) }, e);
    if (p && !p.includes('循环')) issues.push({ nodeId: e.target, level: 'error', message: p });
  }
  for (const n of doc.nodes.filter(x => inScope.has(x.id))) {
    const def = nodeDef(n.kind), c = n.config;
    for (const port of def.inputs) if (!port.optional && !doc.edges.some(e => e.kind === 'data' && e.target === n.id && e.targetPort === port.id)) issues.push({ nodeId: n.id, level: 'error', message: `缺少输入：${port.label}。` });
    if (isStat(n.kind) && n.kind !== 'alpha') {
      const roles = ['frequency', 'numeric'].includes(n.kind) ? 1 : 2;
      if (!text(c.x) || (roles === 2 && !text(c.y))) issues.push({ nodeId: n.id, level: 'error', message: '请在配置中选择变量。' });
    }
    if (n.kind === 'alpha') {
      if (list(c.columns).length < 2) issues.push({ nodeId: n.id, level: 'error', message: '信度分析至少需要 2 个题项。' });
      if (!text(c.construct)) issues.push({ nodeId: n.id, level: 'error', message: '请填写这些题项共同测量的构念。' });
    }
    if (n.kind === 'filter' && (!text(c.column) || !list(c.values).length)) issues.push({ nodeId: n.id, level: 'error', message: '请选择筛选变量和至少一个纳入类别。' });
    if (n.kind === 'dataset' && c.source === 'file' && !text(c.fileHash)) issues.push({ nodeId: n.id, level: 'error', message: '请选择一个 CSV 文件。' });
    if (n.kind === 'review' && !text(c.approvedHash)) issues.push({ nodeId: n.id, level: 'warning', message: '运行到这里会暂停，等待人工确认。' });
  }
  return issues;
}

/**
 * Split a run scope by its check results: nodes with an error are skipped (and reported), their
 * downstream is blocked, and every independent branch still runs. Warnings never skip a node.
 */
export function partitionScope(doc: CanvasDoc, scope: string[], issues: Issue[]): { run: string[]; skipped: Map<string, string>; blocked: Map<string, string> } {
  const inScope = new Set(scope), skipped = new Map<string, string>();
  for (const i of issues) if (i.level === 'error' && inScope.has(i.nodeId) && !skipped.has(i.nodeId)) skipped.set(i.nodeId, i.message);
  const blocked = new Map<string, string>();
  for (const id of downstreamOf(doc, skipped.keys())) if (inScope.has(id) && !skipped.has(id)) blocked.set(id, '上游节点未通过检查，本节点没有运行。');
  return { run: scope.filter(id => !skipped.has(id) && !blocked.has(id)), skipped, blocked };
}

/* ───────── strict parsing for storage and import ───────── */

const ID = /^[A-Za-z0-9_-]{1,48}$/;
function str(v: unknown, max: number, label: string): string {
  if (typeof v !== 'string' || v.length > max) throw Error(`${label}格式不正确。`);
  return v;
}
function num(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e7) throw Error(`${label}不是有效数字。`);
  return v;
}
function strList(v: unknown, label: string, max: number = CANVAS_LIMITS.values): string[] {
  if (!Array.isArray(v) || v.length > max) throw Error(`${label}格式不正确。`);
  return v.map(x => str(x, 400, label));
}
/** Keep only known config keys with checked types; unknown keys are dropped, never executed. */
export function parseConfig(kind: NodeKind, raw: unknown): Record<string, unknown> {
  const base = defaultConfig(kind), src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(base)) {
    const v = src[key];
    if (v === undefined) { out[key] = fallback; continue; }
    if (typeof fallback === 'string') out[key] = str(v, CANVAS_LIMITS.text, '节点配置');
    else if (typeof fallback === 'number') out[key] = num(v, '节点配置');
    else if (typeof fallback === 'boolean') { if (typeof v !== 'boolean') throw Error('节点配置格式不正确。'); out[key] = v; }
    else if (Array.isArray(fallback)) out[key] = strList(v, '节点配置', key === 'values' ? CANVAS_LIMITS.values : CANVAS_LIMITS.columns);
  }
  if (kind === 'dataset' && !['workspace', 'file'].includes(out.source as string)) throw Error('数据来源无效。');
  return out;
}

export function parseDoc(value: unknown): CanvasDoc {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('画布文件格式不正确。');
  const v = value as Record<string, unknown>;
  if (v.schema !== CANVAS_SCHEMA) throw Error('画布版本不受支持。');
  if (!Array.isArray(v.nodes) || v.nodes.length > CANVAS_LIMITS.nodes) throw Error(`一张画布最多 ${CANVAS_LIMITS.nodes} 个节点。`);
  if (!Array.isArray(v.edges) || v.edges.length > CANVAS_LIMITS.edges) throw Error(`一张画布最多 ${CANVAS_LIMITS.edges} 条连线。`);
  const nodes: CanvasNode[] = v.nodes.map((raw: unknown) => {
    const n = raw as Record<string, unknown>;
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !ID.test(n.id) || !isKind(n.kind)) throw Error('节点格式不正确。');
    const p = n.position as Record<string, unknown> | undefined;
    return { id: n.id, kind: n.kind, title: str(n.title, CANVAS_LIMITS.title, '节点标题'), position: { x: num(p?.x, '节点位置'), y: num(p?.y, '节点位置') }, parent: n.parent === null || n.parent === undefined ? null : str(n.parent, 48, '编组'), config: parseConfig(n.kind, n.config) };
  });
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length) throw Error('节点 ID 重复。');
  for (const n of nodes) if (n.parent !== null && (!ids.has(n.parent) || nodes.find(x => x.id === n.parent)!.kind !== 'group')) throw Error('节点的编组不存在。');
  const edges: CanvasEdge[] = v.edges.map((raw: unknown) => {
    const e = raw as Record<string, unknown>;
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !ID.test(e.id) || (e.kind !== 'data' && e.kind !== 'relation')) throw Error('连线格式不正确。');
    const edge = { id: e.id, kind: e.kind, source: str(e.source, 48, '连线'), sourcePort: str(e.sourcePort, 24, '连线'), target: str(e.target, 48, '连线'), targetPort: str(e.targetPort, 24, '连线') } as CanvasEdge;
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw Error('连线指向不存在的节点。');
    return edge;
  });
  if (new Set(edges.map(e => e.id)).size !== edges.length) throw Error('连线 ID 重复。');
  return { schema: CANVAS_SCHEMA, title: str(v.title ?? '研究画布', CANVAS_LIMITS.title, '画布名称'), palette: str(v.palette ?? 'blue', 40, '配色'), nodes, edges };
}

export function serializeDoc(doc: CanvasDoc): string {
  const out = JSON.stringify(parseDoc(doc));
  if (new TextEncoder().encode(out).length > CANVAS_LIMITS.bytes) throw Error('画布超过 1 MB，请减少节点或文字。');
  return out;
}

/** Short, collision-resistant ids that are valid for both React Flow and the document schema. */
export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rnd}`;
}
