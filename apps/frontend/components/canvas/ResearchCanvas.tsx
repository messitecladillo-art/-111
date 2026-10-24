'use client';

import '@xyflow/react/dist/base.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent as ReactDragEvent } from 'react';
import {
  Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, ViewportPortal, getBezierPath, useConnection, useReactFlow,
  Position, type Connection, type ConnectionState, type EdgeChange, type NodeChange, type Viewport, type XYPosition,
} from '@xyflow/react';
import { isKind, nodeDef, type EditorSection, type NodeKind } from '@/lib/canvas/catalog';
import {
  CANVAS_LIMITS, CANVAS_SCHEMA, NODE_SIZE, REL_IN, REL_OUT, connectionProblem, defaultConfig, newId, parseDoc, partitionScope, preflight, runScope, serializeDoc,
  type CanvasDoc, type CanvasEdge, type CanvasNode, type Issue,
} from '@/lib/canvas/graph';
import { reviewKey, runCanvas, type Cache, type DatasetValue, type NodeState, type NodeStatus, type RunEvent } from '@/lib/canvas/execute';
import { emptyHistory, record, redo, snapshotOf, undo, type History, type Snapshot } from '@/lib/canvas/history';
import { applyPositions, cloneSelection, deleteSelection, pasteSelection, positionsChanged, type CanvasClipboard } from '@/lib/canvas/operations';
import { autoLayout } from '@/lib/canvas/layout';
import { buildTemplate } from '@/lib/canvas/templates';
import { canvasScopeKey, type CanvasStorageScope } from '@/lib/canvas/scope';
import { canvasScopeLifetime, scopedCanvasStorage } from '@/lib/canvas/storage';
import type { Delimiter } from '@/lib/survey-analysis';
import { CHART_THEMES } from '@/lib/chart-theme';
import { questionnaireIssues } from '@/lib/questionnaire';
import type { DesignSnapshot } from '@/lib/questionnaire-mapping';
import { useWorkbenchTheme } from '@/components/workbench/shell-kit';
import { CanvasContext, MOTION, readCsvFile, readGlassPreference, readMotionPreference, type CanvasContextValue, type DesignSummary, type MotionLevel } from './canvasUi';
import ViewSwitch from './ViewSwitch';
import { GroupNode, ResearchNode } from './CanvasNode';
import { EDGE_TYPES } from './CanvasEdges';
import NodeLibrary, { DRAG_MIME } from './NodeLibrary';
import ConfigPanel from './ConfigPanel';
import RunDrawer, { type DrawerTab } from './RunDrawer';
import { EMPTY_ISSUES, absolutePosition, snapToNeighbours, toFlowEdge, toFlowNode } from './flowModel';
import CanvasPerformanceProbe from './CanvasPerformanceProbe';
import styles from './Canvas.module.css';

const NODE_TYPES = { research: ResearchNode, cvgroup: GroupNode };
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };
const MULTI_SELECTION_KEYS = ['Meta', 'Control'];
/** RF allocates renderer-space `to` on every store update. Chrome only needs primitive semantics. */
const selectConnectionUi = (c: ConnectionState) => ({
  inProgress: c.inProgress, fromId: c.fromNode?.id ?? '', fromPort: c.fromHandle?.id ?? '', fromType: c.fromHandle?.type ?? null,
  toId: c.toHandle?.nodeId ?? '', toPort: c.toHandle?.id ?? '', isValid: c.isValid,
});
const ARIA = {
  'node.a11yDescription.default': '按 Enter 或空格选择节点，按 Delete 删除，方向键移动。',
  'node.a11yDescription.keyboardDisabled': '按 Enter 或空格选择节点。',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }: { direction: string; x: number; y: number }) => `节点已向${({ up: '上', down: '下', left: '左', right: '右' } as Record<string, string>)[direction] ?? direction}移动，位置 ${Math.round(x)}, ${Math.round(y)}`,
  'edge.a11yDescription.default': '按 Enter 或空格选择连线，按 Delete 断开。',
  'minimap.ariaLabel': '画布小地图',
  'handle.ariaLabel': '连接端口',
};

type Ghost = { id: string; kind: 'node'; x: number; y: number; w: number; h: number; title: string } | { id: string; kind: 'edge'; path: string; relation: boolean };
type Toast = { id: number; text: string; tone?: 'error'; action?: { label: string; run: () => void } };
export type ResearchCanvasProps = {
  storageScope: CanvasStorageScope; identityEpoch: number; isCurrentScope: () => boolean;
  workspaceDataset: DatasetValue | null; design: DesignSnapshot | null;
  onOpen: (section: EditorSection, nodeId: string, title: string) => void; onShowWorkbench: () => void;
  focus: { nodeId: string; token: number } | null; active: boolean;
};

const subscribeReduced = (cb: () => void) => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
const systemReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeVisibility = (cb: () => void) => { document.addEventListener('visibilitychange', cb); return () => document.removeEventListener('visibilitychange', cb); };
const pageVisible = () => !document.hidden;
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function ResearchCanvas(props: ResearchCanvasProps) {
  // Reset selection, undo, files, run cache and React Flow's viewport store together.
  return <ReactFlowProvider key={`${canvasScopeKey(props.storageScope)}:${props.identityEpoch}`}><CanvasInner {...props} /></ReactFlowProvider>;
}

function CanvasInner({ storageScope, isCurrentScope, workspaceDataset, design: designSnapshot, onOpen, onShowWorkbench, focus, active }: ResearchCanvasProps) {
  const rf = useReactFlow();
  const theme = useWorkbenchTheme();
  const [lifetime] = useState(() => canvasScopeLifetime(isCurrentScope));
  const isCurrent = lifetime.isCurrent;
  const [storage] = useState(() => {
    let store: Storage | null = null;
    try { store = window.localStorage; } catch { /* Save feedback reports unavailable browser storage. */ }
    return scopedCanvasStorage(storageScope, store, isCurrent);
  });
  useLayoutEffect(() => { lifetime.activate(); return lifetime.deactivate; }, [lifetime]);
  // Only counts reach the canvas; the questionnaire itself stays in its editor.
  const design = useMemo<DesignSummary>(() => designSnapshot ? { title: designSnapshot.design.title, questions: designSnapshot.design.questions.length, issues: questionnaireIssues(designSnapshot.design).filter(i => i.level === 'blocker').length } : null, [designSnapshot]);
  const [doc, setDoc] = useState<CanvasDoc>(() => storage.readDocument());
  const [initialViewport] = useState(() => storage.readViewport());
  const [history, setHistory] = useState<History>(emptyHistory);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [draggingNodes, setDraggingNodes] = useState<Set<string>>(() => new Set());
  const [states, setStates] = useState<Map<string, NodeState>>(() => new Map());
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [files, setFiles] = useState<Map<string, DatasetValue>>(() => new Map());
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('log');
  const [configClosed, setConfigClosed] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [entering, setEntering] = useState<Map<string, 'add' | 'copy' | 'restore'>>(() => new Map());
  const [enteringEdges, setEnteringEdges] = useState<Set<string>>(() => new Set());
  const [pulses, setPulses] = useState<Map<string, number>>(() => new Map());
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [toast, setToast] = useState<Toast | null>(null);
  const [motionPref, setMotionPref] = useState<MotionLevel>(readMotionPreference);
  const [glass, setGlass] = useState(readGlassPreference);
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; at: number }>({ state: 'idle', at: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [minimap, setMinimap] = useState(false);
  const [dropPreview, setDropPreview] = useState<XYPosition | null>(null);
  const [runChoice, setRunChoice] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const reduced = useSyncExternalStore(subscribeReduced, systemReduced, () => false);
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, () => true);
  // The system preference wins: "standard" becomes "reduced"; "off" stays off.
  const motion: MotionLevel = reduced && motionPref === 'standard' ? 'reduced' : motionPref;

  const docRef = useRef(doc), historyRef = useRef(history);
  useLayoutEffect(() => { docRef.current = doc; });
  const wrapper = useRef<HTMLDivElement>(null), moreButton = useRef<HTMLButtonElement>(null), addButton = useRef<HTMLButtonElement>(null), connectButton = useRef<HTMLButtonElement>(null);
  const cache = useRef<Cache>(new Map()), controller = useRef<AbortController | null>(null);
  const clipboard = useRef<(CanvasClipboard & { pastes: number }) | null>(null);
  const dragBefore = useRef<Snapshot | null>(null), dragCancelled = useRef(false), keyMoveBefore = useRef<Snapshot | null>(null), layoutFrame = useRef(0), typing = useRef<{ key: string; at: number } | null>(null);
  const altDown = useRef(false), toastTimer = useRef(0), undoRef = useRef<() => void>(() => undefined);
  const visualTimers = useRef<Set<number>>(new Set()), flashToken = useRef(0), flashes = useRef<Map<string, number>>(new Map());
  const later = useCallback((run: () => void, delay: number) => {
    const timer = window.setTimeout(() => { visualTimers.current.delete(timer); run(); }, delay);
    visualTimers.current.add(timer); return timer;
  }, []);
  const stopLayout = useCallback(() => { cancelAnimationFrame(layoutFrame.current); layoutFrame.current = 0; }, []);
  const ms = useCallback((v: number) => motion === 'standard' ? v : motion === 'reduced' ? Math.min(v, 120) : 0, [motion]);
  const recordBefore = useCallback((label: string, before: Snapshot) => {
    const next = record(historyRef.current, label, before);
    historyRef.current = next; setHistory(next);
  }, []);
  const finishKeyMove = useCallback(() => {
    const before = keyMoveBefore.current; keyMoveBefore.current = null;
    if (before && positionsChanged(before, docRef.current)) recordBefore('移动节点', before);
  }, [recordBefore]);
  const cancelDrag = useCallback(() => {
    const before = dragBefore.current;
    if (!before) return false;
    dragBefore.current = null; dragCancelled.current = true;
    const next = applyPositions(docRef.current, new Map(before.nodes.map(n => [n.id, n.position])));
    docRef.current = next; setDoc(next); setGuides({ x: null, y: null }); setDraggingNodes(new Set());
    return true;
  }, []);

  /* ───────── history-aware updates ───────── */
  const commit = useCallback((next: CanvasDoc, label: string, coalesceKey?: string) => {
    if (!isCurrent()) return;
    stopLayout(); finishKeyMove();
    if (next === docRef.current) return;
    const now = Date.now();
    // Continuous typing in one field is one undo step.
    const merge = coalesceKey && typing.current?.key === coalesceKey && now - typing.current.at < 1200;
    typing.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    // Capture "before" now: the updater runs later, when docRef already points at the new state.
    if (!merge) recordBefore(label, snapshotOf(docRef.current));
    docRef.current = next;
    setDoc(next);
  }, [finishKeyMove, recordBefore, stopLayout, isCurrent]);
  const notify = useCallback((text: string, opts: Omit<Toast, 'id' | 'text'> = {}) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, ...opts });
    toastTimer.current = window.setTimeout(() => setToast(null), opts.action ? 6000 : 3800);
  }, []);
  const flash = useCallback((ids: string[], kind: 'add' | 'copy' | 'restore', edgeIds: string[] = []) => {
    if (motion === 'off' || (!ids.length && !edgeIds.length)) return;
    const token = ++flashToken.current;
    for (const id of [...ids, ...edgeIds]) flashes.current.set(id, token);
    setEntering(m => { const n = new Map(m); ids.forEach(id => n.set(id, kind)); return n; });
    if (edgeIds.length) setEnteringEdges(s => new Set([...s, ...edgeIds]));
    later(() => {
      const current = (id: string) => flashes.current.get(id) === token;
      setEntering(m => { const n = new Map(m); ids.filter(current).forEach(id => n.delete(id)); return n; });
      if (edgeIds.length) setEnteringEdges(s => { const n = new Set(s); edgeIds.filter(current).forEach(id => n.delete(id)); return n; });
      [...ids, ...edgeIds].filter(current).forEach(id => flashes.current.delete(id));
    }, ms(Math.max(MOTION.reveal, MOTION.draw)) + 30);
  }, [later, motion, ms]);

  /* ───────── persistence (this browser only) ───────── */
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!isCurrent()) return;
      setSave({ state: 'saving', at: Date.now() });
      try { if (storage.writeDocument(doc)) setSave({ state: 'saved', at: Date.now() }); }
      catch { setSave({ state: 'error', at: Date.now() }); }
    }, 800);
    return () => window.clearTimeout(t);
  }, [doc, isCurrent, storage]);
  useEffect(() => { try { localStorage.setItem('evix.canvas.motion', motionPref); localStorage.setItem('evix.canvas.glass', String(glass)); } catch { /* preference only */ } }, [motionPref, glass]);

  /* ───────── derived flow elements ───────── */
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const issuesBy = useMemo(() => { const m = new Map<string, Issue[]>(); for (const i of issues ?? []) (m.get(i.nodeId) ?? m.set(i.nodeId, []).get(i.nodeId)!).push(i); return m; }, [issues]);
  const flowNodes = useMemo(() => {
    const byId = new Map(doc.nodes.map(n => [n.id, n]));
    const children = new Map<string, CanvasNode[]>();
    for (const n of doc.nodes) if (n.parent) (children.get(n.parent) ?? children.set(n.parent, []).get(n.parent)!).push(n);
    return doc.nodes.map(n => {
      const kids = children.get(n.id) ?? [], childStatus: Partial<Record<NodeStatus, number>> = {};
      for (const k of kids) { const s = states.get(k.id)?.status ?? 'idle'; childStatus[s] = (childStatus[s] ?? 0) + 1; }
      const flow = toFlowNode(n, { state: states.get(n.id), issues: issuesBy.get(n.id) ?? EMPTY_ISSUES, entering: entering.get(n.id) ?? null, selected: selectedSet.has(n.id), hidden: !!n.parent && !!byId.get(n.parent)?.config.collapsed, childCount: kids.length, childKey: JSON.stringify(childStatus) }, childStatus);
      return draggingNodes.has(n.id) ? { ...flow, dragging: true } : flow;
    });
  }, [doc.nodes, states, issuesBy, entering, selectedSet, draggingNodes]);
  const flowEdges = useMemo(() => {
    const hidden = new Set(doc.nodes.filter(n => n.parent && doc.nodes.find(p => p.id === n.parent)?.config.collapsed).map(n => n.id));
    const edgeSel = new Set(selectedEdges);
    return doc.edges.map(e => toFlowEdge(e, { entering: enteringEdges.has(e.id), pulse: pulses.get(e.id) ?? 0, status: states.get(e.source)?.status ?? null, selected: edgeSel.has(e.id), hidden: hidden.has(e.source) || hidden.has(e.target) }));
  }, [doc.edges, doc.nodes, enteringEdges, pulses, states, selectedEdges]);

  /* ───────── node operations ───────── */
  const viewportCentre = useCallback((): XYPosition => {
    const rect = wrapper.current?.getBoundingClientRect();
    const p = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 });
    return { x: p.x - NODE_SIZE.width / 2, y: p.y - NODE_SIZE.height / 2 };
  }, [rf]);
  /** The nearest spot (rings around the target) where a new card does not cover an existing one. */
  const freeSpot = useCallback((p: XYPosition): XYPosition => {
    const W = NODE_SIZE.width + 24, H = NODE_SIZE.height + 24;
    const rects = docRef.current.nodes.filter(n => !n.parent && !(n.kind === 'group' && !n.config.collapsed)).map(n => n.position);
    const free = (q: XYPosition) => rects.every(r => Math.abs(r.x - q.x) >= W || Math.abs(r.y - q.y) >= H);
    if (free(p)) return p;
    for (let ring = 1; ring <= 8; ring++) for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const q = { x: p.x + dx * W, y: p.y + dy * H };
      if (free(q)) return q;
    }
    return { x: p.x + 40, y: p.y + 40 };
  }, []);
  const addNode = useCallback((kind: NodeKind, at?: XYPosition) => {
    if (docRef.current.nodes.length >= CANVAS_LIMITS.nodes) { notify(`单张画布最多 ${CANVAS_LIMITS.nodes} 个节点。`, { tone: 'error' }); return; }
    const def = nodeDef(kind), id = newId('n');
    const node: CanvasNode = { id, kind, title: def.title, position: freeSpot(at ?? viewportCentre()), parent: null, config: defaultConfig(kind) };
    commit({ ...docRef.current, nodes: [...docRef.current.nodes, node] }, `添加「${def.title}」`);
    flash([id], 'add');
    setSelected([id]); setSelectedEdges([]); setConfigClosed(null);
    return id;
  }, [commit, flash, freeSpot, viewportCentre, notify]);
  /** Place a block of new nodes at the view centre, or just below the existing drawing if that spot is taken. */
  const clearOrigin = useCallback((width: number, height: number): XYPosition => {
    const c = viewportCentre(), at = { x: c.x + NODE_SIZE.width / 2 - width / 2, y: c.y + NODE_SIZE.height / 2 - height / 2 };
    const tops = docRef.current.nodes.filter(n => !n.parent);
    const sizeOf = (n: CanvasNode) => n.kind === 'group' ? { w: Number(n.config.width) || 600, h: Number(n.config.height) || 360 } : { w: NODE_SIZE.width, h: NODE_SIZE.height };
    const hit = tops.some(n => { const s = sizeOf(n); return n.position.x < at.x + width + 40 && n.position.x + s.w + 40 > at.x && n.position.y < at.y + height + 40 && n.position.y + s.h + 40 > at.y; });
    if (!hit) return at;
    return { x: Math.min(...tops.map(n => n.position.x)), y: Math.max(...tops.map(n => n.position.y + sizeOf(n).h)) + 96 };
  }, [viewportCentre]);
  const insertTemplate = useCallback((templateId: string) => {
    const probe = buildTemplate(templateId, newId, { x: 0, y: 0 });
    if (docRef.current.nodes.length + probe.nodes.length > CANVAS_LIMITS.nodes || docRef.current.edges.length + probe.edges.length > CANVAS_LIMITS.edges) { notify('参考流程会超过画布容量，请先移除部分节点或连线。', { tone: 'error' }); return; }
    const width = Math.max(...probe.nodes.map(n => n.position.x)) + NODE_SIZE.width, height = Math.max(...probe.nodes.map(n => n.position.y)) + NODE_SIZE.height;
    const built = buildTemplate(templateId, newId, clearOrigin(width, height));
    commit({ ...docRef.current, nodes: [...docRef.current.nodes, ...built.nodes], edges: [...docRef.current.edges, ...built.edges] }, '插入参考流程');
    // Batch insertions stagger only the first eight cards.
    flash(built.nodes.slice(0, 8).map(n => n.id), 'add', built.edges.map(e => e.id));
    setSelected([]); setSelectedEdges([]); setLibraryOpen(false);
    later(() => void rf.fitView({ nodes: built.nodes.map(n => ({ id: n.id })), duration: ms(MOTION.focus), padding: 0.2, maxZoom: 1 }), 30);
    notify(`已插入 ${built.nodes.length} 个节点；每个节点都可修改或删除。`);
  }, [commit, flash, clearOrigin, rf, ms, notify, later]);

  const ghostFor = useCallback((ids: string[], edgeIds: string[]) => {
    const g: Ghost[] = [], stamp = Date.now();
    const d = docRef.current;
    for (const id of ids) {
      const n = d.nodes.find(x => x.id === id), internal = rf.getInternalNode(id);
      if (!n || !internal || n.kind === 'group') continue;
      const p = internal.internals.positionAbsolute;
      g.push({ id: `gn-${id}-${stamp}`, kind: 'node', x: p.x, y: p.y, w: internal.measured.width ?? NODE_SIZE.width, h: internal.measured.height ?? NODE_SIZE.height, title: n.title });
    }
    for (const eid of edgeIds) {
      const e = d.edges.find(x => x.id === eid), s = e && rf.getInternalNode(e.source), t = e && rf.getInternalNode(e.target);
      if (!e || !s || !t) continue;
      const sp = s.internals.positionAbsolute, tp = t.internals.positionAbsolute, sw = s.measured.width ?? NODE_SIZE.width, sh = s.measured.height ?? NODE_SIZE.height, th = t.measured.height ?? NODE_SIZE.height, tw = t.measured.width ?? NODE_SIZE.width;
      const rel = e.kind === 'relation';
      const [path] = getBezierPath(rel
        ? { sourceX: sp.x + sw / 2, sourceY: sp.y + sh, sourcePosition: Position.Bottom, targetX: tp.x + tw / 2, targetY: tp.y, targetPosition: Position.Top }
        : { sourceX: sp.x + sw, sourceY: sp.y + sh / 2, sourcePosition: Position.Right, targetX: tp.x, targetY: tp.y + th / 2, targetPosition: Position.Left });
      g.push({ id: `ge-${eid}-${stamp}`, kind: 'edge', path, relation: rel });
    }
    if (!g.length || motion === 'off') return;
    setGhosts(prev => [...prev, ...g]);
    later(() => setGhosts(prev => prev.filter(x => !g.includes(x))), ms(MOTION.exit) + 30);
  }, [rf, motion, ms, later]);

  const removeElements = useCallback((nodeIds: string[], edgeIds: string[]) => {
    const d = docRef.current, groups = nodeIds.filter(id => d.nodes.find(n => n.id === id)?.kind === 'group');
    const removeNodes = new Set(nodeIds.filter(id => !groups.includes(id)));
    const removeEdges = new Set([...edgeIds, ...d.edges.filter(e => removeNodes.has(e.source) || removeNodes.has(e.target)).map(e => e.id)]);
    if (!removeNodes.size && !removeEdges.size && !groups.length) return;
    ghostFor([...removeNodes], [...removeEdges]);
    // Deleting a group frame keeps its members; their absolute positions are restored.
    commit(deleteSelection(d, nodeIds, edgeIds), removeNodes.size ? `删除 ${removeNodes.size} 个节点` : groups.length ? '解散编组' : '断开连线');
    setSelected([]); setSelectedEdges([]);
    setStates(s => { const n = new Map(s); removeNodes.forEach(id => n.delete(id)); return n; });
    if (removeNodes.size) notify(`已删除 ${removeNodes.size} 个节点；原成果文件不受影响。`, { action: { label: '撤销', run: () => undoRef.current() } });
  }, [commit, ghostFor, notify]);

  const applySnapshot = useCallback((snap: Snapshot, label: string, verb: string) => {
    const before = docRef.current, next = { ...before, ...structuredClone(snap) };
    const restored = next.nodes.filter(n => !before.nodes.some(b => b.id === n.id)).map(n => n.id);
    const restoredEdges = next.edges.filter(e => !before.edges.some(b => b.id === e.id)).map(e => e.id);
    // An undo interrupts any exit animation still playing for the same element.
    setGhosts(g => g.filter(x => !restored.some(id => x.id.startsWith(`gn-${id}-`)) && !restoredEdges.some(id => x.id.startsWith(`ge-${id}-`))));
    docRef.current = next; setDoc(next);
    flash(restored, 'restore', restoredEdges);
    setSelected(s => s.filter(id => next.nodes.some(n => n.id === id)));
    setSelectedEdges(s => s.filter(id => next.edges.some(e => e.id === id)));
    notify(`${verb}：${label}`);
  }, [flash, notify]);
  const doUndo = useCallback(() => {
    stopLayout(); finishKeyMove();
    if (cancelDrag()) return;
    const u = undo(historyRef.current, snapshotOf(docRef.current));
    if (!u) return;
    setHistory(u.history); historyRef.current = u.history; typing.current = null;
    applySnapshot(u.snap, u.label, '已撤销');
  }, [applySnapshot, cancelDrag, finishKeyMove, stopLayout]);
  useLayoutEffect(() => { undoRef.current = doUndo; }, [doUndo]);
  const doRedo = useCallback(() => {
    stopLayout(); finishKeyMove(); cancelDrag();
    const r = redo(historyRef.current, snapshotOf(docRef.current));
    if (!r) return;
    setHistory(r.history); historyRef.current = r.history; typing.current = null;
    applySnapshot(r.snap, r.label, '已恢复');
  }, [applySnapshot, cancelDrag, finishKeyMove, stopLayout]);

  const copySelection = useCallback(() => {
    const clip = cloneSelection(docRef.current, selected);
    if (!clip.nodes.length) return false;
    clipboard.current = { ...clip, pastes: 0 };
    return true;
  }, [selected]);
  const paste = useCallback(() => {
    const clip = clipboard.current;
    if (!clip) return;
    const offset = 40 * (clip.pastes + 1);
    let result: ReturnType<typeof pasteSelection>;
    try { result = pasteSelection(docRef.current, clip, { x: offset, y: offset }); }
    catch (error) { notify(error instanceof Error ? error.message : '无法复制节点。', { tone: 'error' }); return; }
    clip.pastes++;
    const { doc: next, ids } = result;
    const addedEdges = next.edges.slice(docRef.current.edges.length).map(e => e.id);
    commit(next, `粘贴 ${ids.length} 个节点`);
    flash(ids.slice(0, 8), 'copy', addedEdges);
    setSelected(next.nodes.filter(n => ids.includes(n.id) && !n.parent).map(n => n.id)); setSelectedEdges([]);
  }, [commit, flash, notify]);

  const groupSelection = useCallback(() => {
    const d = docRef.current;
    const members = d.nodes.filter(n => selected.includes(n.id) && !n.parent && n.kind !== 'group');
    if (members.length < 2) { notify('选择至少两个未编组的节点后再编组。'); return; }
    if (d.nodes.length >= CANVAS_LIMITS.nodes) { notify(`编组需要一个空余节点位置；画布上限为 ${CANVAS_LIMITS.nodes} 个节点。`, { tone: 'error' }); return; }
    const xs = members.map(n => n.position.x), ys = members.map(n => n.position.y);
    const minX = Math.min(...xs) - 28, minY = Math.min(...ys) - 56, maxX = Math.max(...xs) + NODE_SIZE.width + 28, maxY = Math.max(...ys) + NODE_SIZE.height + 28;
    const gid = newId('g');
    const group: CanvasNode = { id: gid, kind: 'group', title: '编组', position: { x: minX, y: minY }, parent: null, config: { collapsed: false, width: maxX - minX, height: maxY - minY } };
    const nodes = [group, ...d.nodes.map(n => members.includes(n) ? { ...n, parent: gid, position: { x: n.position.x - minX, y: n.position.y - minY } } : n)];
    commit({ ...d, nodes }, '编组');
    flash([gid], 'add'); setSelected([gid]);
  }, [selected, commit, flash, notify]);
  const toggleGroup = useCallback((id: string) => {
    const d = docRef.current, g = d.nodes.find(n => n.id === id);
    if (!g || g.kind !== 'group') return;
    commit({ ...d, nodes: d.nodes.map(n => n.id === id ? { ...n, config: { ...n.config, collapsed: !n.config.collapsed } } : n) }, g.config.collapsed ? '展开编组' : '收起编组');
  }, [commit]);

  const runLayout = useCallback(() => {
    const d = docRef.current, target = autoLayout(d);
    if (!target.size) return;
    const before = snapshotOf(d), from = new Map(d.nodes.map(n => [n.id, n.position]));
    finishKeyMove(); recordBefore('自动排布', before);
    const duration = ms(MOTION.layout), start = performance.now();
    cancelAnimationFrame(layoutFrame.current);
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1, k = ease(t);
      const next = { ...docRef.current, nodes: docRef.current.nodes.map(n => { const to = target.get(n.id), a = from.get(n.id); return to && a ? { ...n, position: { x: a.x + (to.x - a.x) * k, y: a.y + (to.y - a.y) * k } } : n; }) };
      docRef.current = next; setDoc(next);
      if (t < 1) layoutFrame.current = requestAnimationFrame(step);
    };
    layoutFrame.current = requestAnimationFrame(step);
    notify('已自动排布；连线随节点一起移动。', { action: { label: '撤销', run: () => doUndo() } });
  }, [ms, notify, doUndo, finishKeyMove, recordBefore]);

  /* ───────── React Flow change handlers ───────── */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    let moved: Map<string, XYPosition> | null = null;
    const sel: { id: string; selected: boolean }[] = [];
    let dragging = false;
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && !dragCancelled.current) { (moved ??= new Map()).set(ch.id, ch.position); dragging ||= !!ch.dragging; }
      if (ch.type === 'select') sel.push(ch);
    }
    const dragChanges = changes.filter((ch): ch is Extract<NodeChange, { type: 'position' }> => ch.type === 'position' && ch.dragging !== undefined);
    if (dragChanges.length && !dragCancelled.current) setDraggingNodes(prev => {
      const next = new Set(prev); for (const ch of dragChanges) { if (ch.dragging) next.add(ch.id); else next.delete(ch.id); }
      return next.size === prev.size && [...next].every(id => prev.has(id)) ? prev : next;
    });
    if (moved) {
      if (moved.size === 1 && dragging && !altDown.current) {
        const [id, pos] = [...moved][0];
        const snapped = snapToNeighbours(docRef.current, id, pos, rf.getZoom());
        moved.set(id, snapped.pos); setGuides(snapped.guides);
      } else setGuides({ x: null, y: null });
      const next = applyPositions(docRef.current, moved);
      docRef.current = next; setDoc(next);
    }
    if (sel.length) { setSelected(prev => { const s = new Set(prev); for (const c of sel) { if (c.selected) s.add(c.id); else s.delete(c.id); } return [...s]; }); setConfigClosed(null); }
  }, [rf]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const sel = changes.filter((c): c is Extract<EdgeChange, { type: 'select' }> => c.type === 'select');
    if (sel.length) setSelectedEdges(prev => { const s = new Set(prev); for (const c of sel) { if (c.selected) s.add(c.id); else s.delete(c.id); } return [...s]; });
  }, []);
  const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => {
    try { storage.writeViewport(viewport); } catch { /* viewport preference only */ }
  }, [storage]);
  const onDragStart = useCallback(() => {
    // A drag takes over from any running auto layout immediately, from the current frame.
    stopLayout(); finishKeyMove(); dragCancelled.current = false;
    dragBefore.current = snapshotOf(docRef.current);
  }, [finishKeyMove, stopLayout]);
  const onDragStop = useCallback(() => {
    const before = dragBefore.current; dragBefore.current = null; dragCancelled.current = false;
    setGuides({ x: null, y: null }); setDraggingNodes(new Set());
    if (before && positionsChanged(before, docRef.current)) recordBefore('移动节点', before);
  }, [recordBefore]);
  const toConn = (c: Connection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => ({ source: c.source, target: c.target, sourcePort: c.sourceHandle ?? '', targetPort: c.targetHandle ?? '' });
  const isValidConnection = useCallback((c: Connection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => connectionProblem(docRef.current, toConn(c)) === null, []);
  const onConnect = useCallback((c: Connection) => {
    if (docRef.current.edges.length >= CANVAS_LIMITS.edges) { notify(`单张画布最多 ${CANVAS_LIMITS.edges} 条连线。`, { tone: 'error' }); return; }
    const conn = toConn(c), problem = connectionProblem(docRef.current, conn);
    if (problem) { notify(problem, { tone: 'error' }); return; }
    const relation = conn.sourcePort === REL_OUT;
    const edge: CanvasEdge = { id: newId('e'), kind: relation ? 'relation' : 'data', ...conn };
    commit({ ...docRef.current, edges: [...docRef.current.edges, edge] }, relation ? '添加说明连线' : '连接节点');
    flash([], 'add', [edge.id]);
  }, [commit, flash, notify]);

  /* ───────── running ───────── */
  const check = useCallback((scope: string[] | null = null) => {
    const d = docRef.current, ids = runScope(d, scope);
    const found = preflight(d, ids);
    setIssues(found); setDrawerOpen(true); setDrawerTab('check');
    return { ids, found };
  }, []);
  const execute = useCallback(async (scope: string[] | null) => {
    if (!isCurrent() || controller.current) return;
    const d = docRef.current, { ids, found } = check(scope);
    if (!ids.length) { notify('没有可运行的节点。统计、数据与图表节点才会在画布上运行。'); return; }
    // Nodes that fail the check are skipped with their downstream; independent branches still run.
    const { run, skipped, blocked } = partitionScope(d, ids, found);
    const ac = new AbortController(); controller.current = ac;
    setRunning({ done: 0, total: run.length }); setDrawerOpen(true); setDrawerTab('log');
    const at = Date.now(), held: [string, NodeState][] = [
      ...[...skipped].map(([id, message]): [string, NodeState] => [id, { status: 'failed', message: `未通过检查：${message}`, hash: '', cached: false, output: null, at }]),
      ...[...blocked].map(([id, message]): [string, NodeState] => [id, { status: 'blocked', message, hash: '', cached: false, output: null, at }]),
    ];
    setStates(s => { const n = new Map(s); ids.forEach(id => n.delete(id)); held.forEach(([id, st]) => n.set(id, st)); return n; });
    setEvents(held.map(([nodeId, st], i) => ({ seq: -held.length + i, at, nodeId, type: st.status, message: st.message, hash: '' })));
    if (skipped.size) notify(run.length ? `${skipped.size} 个节点未通过检查，已跳过它们和下游；其余 ${run.length} 个节点继续运行。` : `${skipped.size} 个节点未通过检查，没有可以运行的节点。`, { tone: 'error' });
    if (!run.length) { controller.current = null; setRunning(null); return; }
    let done = 0;
    try {
      await runCanvas(d, run, { workspace: workspaceDataset, files }, {
        cache: cache.current, signal: ac.signal, yieldMs: 16,
        onState: (id, s) => { if (!isCurrent()) { ac.abort(); return; } setStates(prev => new Map(prev).set(id, s)); if (['done', 'failed', 'blocked', 'waiting'].includes(s.status)) { done++; setRunning({ done, total: run.length }); } },
        onEvent: e => {
          if (!isCurrent()) { ac.abort(); return; }
          setEvents(prev => [...prev, e]);
          // One pulse per real hand-off; it clears itself so a disabled animation never leaves a lit edge.
          if (e.type === 'handoff' && e.edgeId && motion !== 'off') {
            const edgeId = e.edgeId, key = e.seq + Date.now();
            setPulses(p => new Map(p).set(edgeId, key));
            later(() => setPulses(p => { if (p.get(edgeId) !== key) return p; const n = new Map(p); n.delete(edgeId); return n; }), MOTION.pulse + 30);
          }
        },
      });
    } finally {
      if (isCurrent()) { controller.current = null; setRunning(null); }
    }
  }, [check, notify, workspaceDataset, files, motion, later, isCurrent]);
  const cancelRun = useCallback(() => controller.current?.abort(), []);

  const approve = useCallback((nodeId: string, hash: string | null) => {
    const d = docRef.current;
    commit({ ...d, nodes: d.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, approvedHash: hash ?? '', approvedAt: hash ? new Date().toISOString() : '' } } : n) }, hash ? '确认复核' : '撤销复核');
    notify(hash ? '已确认；重新运行后下游节点会继续。' : '已撤销确认。');
  }, [commit, notify]);
  const pickFile = useCallback(async (nodeId: string, file: File, delimiter: Delimiter) => {
    if (!isCurrent()) return;
    const value = await readCsvFile(file, delimiter);
    if (!isCurrent()) return;
    setFiles(f => new Map(f).set(nodeId, value));
    const d = docRef.current;
    commit({ ...d, nodes: d.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, source: 'file', fileName: file.name, fileHash: value.sourceHash } } : n) }, '选择数据文件');
  }, [commit, isCurrent]);

  /* ───────── focus & locate ───────── */
  const locate = useCallback((id: string) => {
    const n = docRef.current.nodes.find(x => x.id === id);
    if (!n) return;
    const p = absolutePosition(docRef.current, n);
    void rf.setCenter(p.x + NODE_SIZE.width / 2, p.y + NODE_SIZE.height / 2, { zoom: Math.max(rf.getZoom(), 0.9), duration: ms(MOTION.focus) });
    setSelected([id]); setSelectedEdges([]); setConfigClosed(null);
  }, [rf, ms]);
  useEffect(() => {
    if (!focus || !active) return;
    const t = window.setTimeout(() => locate(focus.nodeId), 40);
    return () => window.clearTimeout(t);
  }, [focus, active, locate]);
  useEffect(() => { if (active) wrapper.current?.focus({ preventScroll: true }); }, [active]);

  /* ───────── keyboard ───────── */
  const selectedPositions = useCallback((dx: number, dy: number) => {
    const ids = new Set(selected), d = docRef.current;
    return new Map(d.nodes.filter(n => ids.has(n.id) && (!n.parent || !ids.has(n.parent))).map(n => [n.id, { x: n.position.x + dx, y: n.position.y + dy }]));
  }, [selected]);
  const moveSelection = useCallback((dx: number, dy: number) => {
    commit(applyPositions(docRef.current, selectedPositions(dx, dy)), '移动节点');
  }, [commit, selectedPositions]);
  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // The newly selected node may open a panel that consumes Esc. Cancel the gesture first.
    if (active && !e.nativeEvent.isComposing && e.key === 'Escape' && cancelDrag()) {
      e.preventDefault(); e.stopPropagation(); notify('已取消移动。'); return;
    }
    if (!active || e.nativeEvent.isComposing || editable(e.target) || e.ctrlKey || e.metaKey || e.altKey || !selected.length || menuOpen || libraryOpen || connectOpen) return;
    const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
    if (!direction || !(e.target instanceof HTMLElement) || (!e.target.closest('.react-flow__node') && e.target !== wrapper.current)) return;
    // Capture before React Flow's own arrow handler: one held key is one undo transaction.
    e.preventDefault(); e.stopPropagation(); stopLayout();
    keyMoveBefore.current ??= snapshotOf(docRef.current);
    const step = e.shiftKey ? 40 : 10;
    const next = applyPositions(docRef.current, selectedPositions(direction[0] * step, direction[1] * step));
    docRef.current = next; setDoc(next);
  };
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      altDown.current = e.altKey;
      if (e.isComposing || editable(e.target)) return;
      const inside = wrapper.current?.contains(e.target as Node) || e.target === document.body;
      if (!inside || document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); }
      else if (mod && key === 'c') { if (copySelection()) notify('已复制到画布剪贴板。'); }
      else if (mod && key === 'v') { e.preventDefault(); cancelDrag(); paste(); }
      else if (mod && key === 'd') { e.preventDefault(); cancelDrag(); if (copySelection()) paste(); }
      else if (mod && key === 'g') { e.preventDefault(); if (e.shiftKey) { const g = selected.find(id => docRef.current.nodes.find(n => n.id === id)?.kind === 'group'); if (g) removeElements([g], []); } else groupSelection(); }
      else if (mod && key === 'a') { e.preventDefault(); setSelected(docRef.current.nodes.map(n => n.id)); }
      else if (key === 'delete' || key === 'backspace') { if (selected.length || selectedEdges.length) { e.preventDefault(); cancelDrag(); removeElements(selected, selectedEdges); } }
      else if (key === 'escape') {
        if (cancelDrag()) { e.preventDefault(); notify('已取消移动。'); }
        else if (menuOpen) { setMenuOpen(false); moreButton.current?.focus(); }
        else if (libraryOpen) { setLibraryOpen(false); addButton.current?.focus(); }
        else if (connectOpen) { setConnectOpen(false); connectButton.current?.focus(); }
        else { setSelected([]); setSelectedEdges([]); }
      }
    };
    const up = (e: KeyboardEvent) => { altDown.current = e.altKey; if (e.key.startsWith('Arrow')) finishKeyMove(); };
    const interrupted = () => { altDown.current = false; cancelDrag(); stopLayout(); finishKeyMove(); setDropPreview(null); };
    const visibility = () => { if (document.hidden) interrupted(); };
    const dragEnd = () => setDropPreview(null);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', interrupted); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('dragend', dragEnd);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', interrupted); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('dragend', dragEnd); };
  }, [active, selected, selectedEdges, menuOpen, libraryOpen, connectOpen, doUndo, doRedo, copySelection, paste, groupSelection, removeElements, notify, cancelDrag, finishKeyMove, stopLayout]);
  useEffect(() => {
    if (!active) return;
    return () => { cancelDrag(); stopLayout(); finishKeyMove(); setDropPreview(null); };
  }, [active, cancelDrag, finishKeyMove, stopLayout]);
  useEffect(() => {
    const timers = visualTimers.current, tokens = flashes.current;
    return () => { controller.current?.abort(); cancelAnimationFrame(layoutFrame.current); window.clearTimeout(toastTimer.current); for (const t of timers) window.clearTimeout(t); timers.clear(); tokens.clear(); };
  }, []);

  /* ───────── drag from library ───────── */
  const onDragOver = (e: ReactDragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setDropPreview({ x: p.x - NODE_SIZE.width / 2, y: p.y - NODE_SIZE.height / 2 });
  };
  const onDrop = (e: ReactDragEvent) => {
    const kind = e.dataTransfer.getData(DRAG_MIME);
    setDropPreview(null);
    if (!isKind(kind) || kind === 'group') return;
    e.preventDefault();
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(kind, { x: p.x - NODE_SIZE.width / 2, y: p.y - NODE_SIZE.height / 2 });
  };

  /* ───────── panels ───────── */
  const single = selected.length === 1 ? doc.nodes.find(n => n.id === selected[0]) ?? null : null;
  const configNode = single && single.kind !== 'group' && configClosed !== single.id ? single : null;
  const upstreamDataset = useMemo(() => {
    if (!configNode) return null;
    // The dataset feeding this node: the nearest upstream dataset output, else the source it will read.
    const seen = new Set<string>(); let frontier = [configNode.id];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) for (const e of doc.edges) if (e.kind === 'data' && e.target === id && !seen.has(e.source)) {
        seen.add(e.source);
        const out = states.get(e.source)?.output;
        if (out?.type === 'dataset') return out.value;
        const src = doc.nodes.find(n => n.id === e.source);
        if (src?.kind === 'dataset') return src.config.source === 'file' ? files.get(src.id) ?? null : workspaceDataset;
        next.push(e.source);
      }
      frontier = next;
    }
    if (configNode.kind === 'dataset') return states.get(configNode.id)?.output?.type === 'dataset' ? (states.get(configNode.id)!.output!.value as DatasetValue) : null;
    return null;
  }, [configNode, doc.edges, doc.nodes, states, files, workspaceDataset]);
  const approvable = configNode?.kind === 'review' ? reviewKey(doc, configNode.id, states) : null;
  // Stable per selected node, so the memoised config panel skips drag frames.
  const configId = configNode?.id ?? '';
  const configChange = useCallback((patch: Partial<CanvasNode> & { config?: Record<string, unknown> }, label: string) => {
    const d = docRef.current;
    commit({ ...d, nodes: d.nodes.map(n => n.id === configId ? { ...n, ...patch, config: patch.config ?? n.config } : n) }, label, `${configId}:${label}`);
  }, [commit, configId]);
  const configRun = useCallback(() => void execute([configId]), [execute, configId]);
  const configClose = useCallback(() => setConfigClosed(configId), [configId]);
  const configDelete = useCallback(() => removeElements([configId], []), [removeElements, configId]);
  const configApprove = useCallback((h: string | null) => approve(configId, h), [approve, configId]);
  const configFile = useCallback((f: File, d: Delimiter) => pickFile(configId, f, d), [pickFile, configId]);

  const open = useCallback((section: EditorSection, id: string) => onOpen(section, id, docRef.current.nodes.find(n => n.id === id)?.title ?? ''), [onOpen]);
  const context = useMemo<CanvasContextValue>(() => ({ workspaceDataset, design, files, motion, open, toggleGroup, select: locate }), [workspaceDataset, design, files, motion, open, toggleGroup, locate]);
  const scopeForSelection = selected.filter(id => doc.nodes.find(n => n.id === id && n.kind !== 'group'));
  const selectionScope = scopeForSelection.length ? runScope(doc, scopeForSelection) : [];
  const connection = useConnection(selectConnectionUi);
  const connecting = connection.inProgress ? (connection.fromPort === REL_OUT || connection.fromPort === REL_IN ? 'relation' : 'data') : undefined;
  const hint = connection.inProgress && connection.toId && connection.isValid === false
    ? connectionProblem(doc, connection.fromType === 'source'
      ? { source: connection.fromId, sourcePort: connection.fromPort, target: connection.toId, targetPort: connection.toPort }
      : { source: connection.toId, sourcePort: connection.toPort, target: connection.fromId, targetPort: connection.fromPort })
    : null;
  const saveText = save.state === 'saving' ? '保存中…' : save.state === 'error' ? '保存失败：本机存储不可用' : save.state === 'saved' ? `已保存到本机 ${new Date(save.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '自动保存到本机';

  const exportDoc = () => {
    if (!isCurrent()) return;
    try {
      const url = URL.createObjectURL(new Blob([serializeDoc(doc)], { type: 'application/json;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `${doc.title || '研究画布'}.canvas.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('已导出画布结构；文件不含任何答卷数据。');
    } catch (e) { notify(e instanceof Error ? e.message : '导出失败。', { tone: 'error' }); }
    setMenuOpen(false);
  };
  const importDoc = async (file: File) => {
    if (!isCurrent()) return;
    const target = docRef.current;
    try {
      const next = parseDoc(JSON.parse(await file.text()));
      if (!isCurrent()) return;
      if (docRef.current !== target) { notify('读取期间画布已更改，请重新导入。', { tone: 'error' }); return; }
      commit(next, '导入画布'); setStates(new Map()); setIssues(null);
      setSelected([]); setSelectedEdges([]); setConfigClosed(null); setConnectOpen(false); setGhosts([]);
      flash(next.nodes.slice(0, 8).map(n => n.id), 'add');
      later(() => void rf.fitView({ duration: ms(MOTION.focus), padding: 0.2, maxZoom: 1 }), 30);
      notify(`已导入 ${next.nodes.length} 个节点；可撤销。`);
    } catch (e) { if (!isCurrent()) return; notify(e instanceof Error ? e.message : '导入失败。', { tone: 'error' }); }
    setMenuOpen(false);
  };

  return <CanvasContext.Provider value={context}>
    <div ref={wrapper} className={`${styles.canvas} wb-canvas`} data-motion={motion} data-inactive={!active || !visible || undefined} data-library={libraryOpen || undefined} data-config={configNode ? true : undefined} data-connecting={connecting} tabIndex={-1} style={{ '--cv-glass': glass } as React.CSSProperties}
      onPointerCancelCapture={() => cancelDrag()} onKeyDownCapture={onCanvasKeyDown} onDragOver={onDragOver} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropPreview(null); }} onDrop={onDrop} aria-label="研究画布">
      {process.env.NEXT_PUBLIC_EVIX_CANVAS_DIAGNOSTICS === 'true' && <CanvasPerformanceProbe hostRef={wrapper} nodes={doc.nodes.length} edges={doc.edges.length} />}
      <ReactFlow
        nodes={flowNodes} edges={flowEdges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={isValidConnection}
        onNodeDragStart={onDragStart} onSelectionDragStart={onDragStart} onNodeDragStop={onDragStop} onSelectionDragStop={onDragStop}
        onNodeClick={(e, n) => {
          // A plain click narrows a multi-selection to this node and reopens a panel closed with Esc.
          if (e.shiftKey || e.metaKey || e.ctrlKey) return;
          if (selected.length > 1) { setSelected([n.id]); setSelectedEdges([]); }
          setConfigClosed(null);
        }}
        onPaneClick={() => { setSelected([]); setSelectedEdges([]); setMenuOpen(false); setRunChoice(false); setConnectOpen(false); }}
        onMoveEnd={onMoveEnd}
        defaultViewport={initialViewport} fitView={!initialViewport && doc.nodes.length > 0} fitViewOptions={FIT_VIEW_OPTIONS} minZoom={0.15} maxZoom={2}
        deleteKeyCode={null} selectionKeyCode="Shift" multiSelectionKeyCode={MULTI_SELECTION_KEYS} panOnScroll={false} zoomOnDoubleClick={false}
        connectionRadius={28} elevateNodesOnSelect={false} colorMode={theme} ariaLabelConfig={ARIA} attributionPosition="bottom-center"
        className={styles.flow}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} className={styles.dots} />
        {minimap && <MiniMap pannable zoomable className={styles.minimap} nodeStrokeWidth={2} ariaLabel="画布小地图" />}
        <ViewportPortal>
          {guides.x !== null && <div className={styles.guideV} style={{ transform: `translateX(${guides.x}px)` }} />}
          {guides.y !== null && <div className={styles.guideH} style={{ transform: `translateY(${guides.y}px)` }} />}
          {dropPreview && <div className={styles.dropPreview} style={{ transform: `translate(${dropPreview.x}px, ${dropPreview.y}px)`, width: NODE_SIZE.width, height: NODE_SIZE.height }} />}
          {ghosts.map(g => g.kind === 'node' && <div key={g.id} className={styles.ghostNode} aria-hidden="true" style={{ '--ghost-at': `translate(${g.x}px, ${g.y}px)`, width: g.w, height: g.h } as React.CSSProperties}><strong>{g.title}</strong></div>)}
          {ghosts.some(g => g.kind === 'edge') && <svg className={styles.ghostEdges} aria-hidden="true">{ghosts.map(g => g.kind === 'edge' && <path key={g.id} d={g.path} pathLength={1} data-relation={g.relation || undefined} />)}</svg>}
        </ViewportPortal>
      </ReactFlow>

      {/* ───────── floating chrome ───────── */}
      <div className={`${styles.floatBar} ${styles.topLeft}`}>
        <input className={styles.docTitle} value={doc.title} maxLength={120} aria-label="画布名称" onChange={e => commit({ ...docRef.current, title: e.target.value }, '重命名画布', 'title')} />
        <ViewSwitch view="canvas" arrive onWorkbench={onShowWorkbench} />
        <span className={styles.saveState} data-state={save.state} role="status">{saveText}</span>
      </div>
      <div className={`${styles.floatBar} ${styles.topRight}`}>
        <button type="button" className={styles.barButton} onClick={() => { const { found } = check(null); notify(found.length ? `发现 ${found.filter(i => i.level === 'error').length} 个错误、${found.filter(i => i.level === 'warning').length} 个提示。` : '检查通过，可以运行。', found.some(i => i.level === 'error') ? { tone: 'error' } : {}); }}>检查</button>
        <div className={styles.runMorph} data-running={running ? true : undefined}>
          {running
            ? <><span className={styles.runProgress} role="status">运行中 {running.done} / {running.total}<i style={{ transform: `scaleX(${running.total ? running.done / running.total : 0})` }} /></span><button type="button" className={styles.barButton} onClick={cancelRun}>取消</button></>
            : <button type="button" className={styles.runButton} aria-haspopup={selectionScope.length ? 'menu' : undefined} aria-expanded={selectionScope.length ? runChoice : undefined} onClick={() => selectionScope.length ? setRunChoice(v => !v) : void execute(null)}>▶ 运行</button>}
          {runChoice && !running && <div className={styles.popover} role="menu">
            <button type="button" role="menuitem" onClick={() => { setRunChoice(false); void execute(scopeForSelection); }}>运行所选<small>实际执行 {selectionScope.length} 个节点（含必要前置）</small></button>
            <button type="button" role="menuitem" onClick={() => { setRunChoice(false); void execute(null); }}>运行全部<small>{runScope(doc, null).length} 个可运行节点</small></button>
          </div>}
        </div>
        <div className={styles.menuWrap}>
          <button ref={moreButton} type="button" className={styles.barButton} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)} aria-label="更多">⋯</button>
          {menuOpen && <MoreMenu doc={doc} motion={motionPref} glass={glass} onMotion={setMotionPref} onGlass={setGlass} onPalette={p => commit({ ...docRef.current, palette: p }, '修改项目配色')}
            onExport={exportDoc} onImport={f => void importDoc(f)} onLayout={() => { setMenuOpen(false); runLayout(); }}
            onClear={() => { setMenuOpen(false); if (docRef.current.nodes.length) { removeElements(docRef.current.nodes.map(n => n.id), docRef.current.edges.map(e => e.id)); } }}
            history={history} onUndo={doUndo} onRedo={doRedo} onClose={() => { setMenuOpen(false); moreButton.current?.focus(); }} />}
        </div>
      </div>

      <button ref={addButton} type="button" className={styles.addButton} data-open={libraryOpen || undefined} aria-expanded={libraryOpen} aria-label={libraryOpen ? '关闭节点库' : '打开节点库'} onClick={() => setLibraryOpen(v => !v)}><span aria-hidden="true">+</span></button>
      {libraryOpen && <NodeLibrary onAdd={k => addNode(k)} onTemplate={insertTemplate} onClose={() => { setLibraryOpen(false); addButton.current?.focus(); }} />}

      {(selected.length > 0 || selectedEdges.length > 0) && <div className={`${styles.floatBar} ${styles.selectionBar}`} role="group" aria-label="所选对象操作">
        <span className={styles.selectionCount}>{selected.length ? `${selected.length} 个节点` : `${selectedEdges.length} 条连线`}</span>
        {selected.length > 0 && <>
          <button type="button" className={styles.barButton} onClick={() => { if (copySelection()) paste(); }} aria-label="复制选中节点" title="复制（Ctrl / ⌘ D）">复制</button>
          <span className={styles.moveButtons} role="group" aria-label="移动选中节点">
            {([[-20, 0, '向左移动', '←'], [0, -20, '向上移动', '↑'], [0, 20, '向下移动', '↓'], [20, 0, '向右移动', '→']] as const).map(([x, y, label, glyph]) => <button key={label} type="button" className={styles.barButton} aria-label={label} title={`${label} 20 单位`} onClick={() => moveSelection(x, y)}>{glyph}</button>)}
          </span>
        </>}
        {single && single.kind !== 'group' && <button ref={connectButton} type="button" className={styles.barButton} aria-expanded={connectOpen} onClick={() => setConnectOpen(v => !v)}>连接…</button>}
        <button type="button" className={`${styles.barButton} ${styles.dangerItem}`} aria-label="删除选中对象" onClick={() => removeElements(selected, selectedEdges)}>删除</button>
        {connectOpen && single && single.kind !== 'group' && <ConnectionEditor key={single.id} doc={doc} source={single} onConnect={onConnect} onClose={() => { setConnectOpen(false); connectButton.current?.focus(); }} />}
      </div>}

      <div className={`${styles.floatBar} ${styles.zoomBar}`} role="group" aria-label="画布视图">
        <button type="button" className={styles.barButton} onClick={() => void rf.zoomOut({ duration: ms(160) })} aria-label="缩小" title="缩小"><Icon d="M5 12h14" /></button>
        <button type="button" className={styles.barButton} onClick={() => void rf.zoomIn({ duration: ms(160) })} aria-label="放大" title="放大"><Icon d="M12 5v14M5 12h14" /></button>
        <button type="button" className={styles.barButton} onClick={() => void rf.fitView({ duration: ms(MOTION.focus), padding: 0.2, maxZoom: 1 })} aria-label="适应全图" title="适应全图"><Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></button>
        <button type="button" className={styles.barButton} disabled={!selected.length} onClick={() => selected[0] && locate(selected[0])} aria-label="定位选中节点" title="定位选中节点"><Icon d="M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /></button>
        <button type="button" className={styles.barButton} aria-pressed={minimap} onClick={() => setMinimap(v => !v)} aria-label="小地图" title="小地图"><Icon d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6ZM9 4v14M15 6v14" /></button>
        <span className={styles.zoomDivider} aria-hidden="true" />
        <button type="button" className={styles.barButton} disabled={!history.past.length} onClick={doUndo} aria-label="撤销" title={history.past.length ? `撤销：${history.past[history.past.length - 1].label}（Ctrl / ⌘ Z）` : '撤销（Ctrl / ⌘ Z）'}><Icon d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></button>
        <button type="button" className={styles.barButton} disabled={!history.future.length} onClick={doRedo} aria-label="恢复" title={history.future.length ? `恢复：${history.future[0].label}（Ctrl / ⌘ Shift Z）` : '恢复（Ctrl / ⌘ Shift Z）'}><Icon d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></button>
        {selected.length > 1 && <><span className={styles.zoomDivider} aria-hidden="true" /><button type="button" className={styles.barButton} onClick={groupSelection} title="编组（Ctrl / ⌘ G）">编组</button></>}
      </div>

      {configNode && <ConfigPanel key={configNode.id} palette={doc.palette} node={configNode} state={states.get(configNode.id)} issues={issuesBy.get(configNode.id) ?? EMPTY_ISSUES} dataset={upstreamDataset} approvable={approvable}
        onChange={configChange} onRun={configRun} onClose={configClose} onDelete={configDelete} onApprove={configApprove} onPickFile={configFile} />}

      <RunDrawer doc={doc} states={states} events={events} issues={issues} open={drawerOpen} tab={drawerTab} onTab={setDrawerTab} onToggle={() => setDrawerOpen(v => !v)} onLocate={locate} running={running} />

      {doc.nodes.length === 0 && <EmptyState design={design} dataset={workspaceDataset}
        onAdd={() => setLibraryOpen(true)} onTemplate={() => insertTemplate('describe')}
        onAdopt={kinds => {
          const centre = viewportCentre(), nodes: CanvasNode[] = kinds.map((k, i) => ({ id: newId('n'), kind: k, title: nodeDef(k).title, position: { x: centre.x + (i - (kinds.length - 1) / 2) * 300, y: centre.y }, parent: null, config: defaultConfig(k) }));
          commit({ ...docRef.current, nodes: [...docRef.current.nodes, ...nodes] }, '引用现有成果');
          flash(nodes.map(n => n.id), 'add');
          notify('已建立节点引用；节点之间的执行关系由你连线决定。');
        }} />}

      {hint && <div className={styles.connectHint} role="status">{hint}</div>}
      {toast && <div key={toast.id} className={styles.toast} data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : 'status'}>
        <span>{toast.text}</span>
        {toast.action && <button type="button" onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>}
      </div>}
    </div>
  </CanvasContext.Provider>;
}

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

/** The same typed-port validation as drag-connect, usable with a click or keyboard. */
function ConnectionEditor({ doc, source, onConnect, onClose }: { doc: CanvasDoc; source: CanvasNode; onConnect: (c: Connection) => void; onClose: () => void }) {
  const output = nodeDef(source.kind).outputs;
  const targets = doc.nodes.filter(n => n.id !== source.id && n.kind !== 'group');
  const [sourcePort, setSourcePort] = useState(output[0]?.id ?? REL_OUT);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [inputPort, setInputPort] = useState(targets[0] ? nodeDef(targets[0].kind).inputs[0]?.id ?? '' : '');
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const target = doc.nodes.find(n => n.id === targetId), inputs = target ? nodeDef(target.kind).inputs : [];
  const targetPort = sourcePort === REL_OUT ? REL_IN : inputPort;
  const connection = { source: source.id, sourcePort, target: targetId, targetPort };
  const problem = connectionProblem(doc, connection);
  return <form className={styles.connectionEditor} role="dialog" aria-label="连接节点" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} onSubmit={e => {
    e.preventDefault(); if (problem) return;
    onConnect({ source: source.id, sourceHandle: sourcePort, target: targetId, targetHandle: targetPort }); onClose();
  }}>
    <header><strong>从「{source.title}」连接</strong><button type="button" className={styles.iconButton} aria-label="关闭连接设置" onClick={onClose}>×</button></header>
    <label className={styles.field}>输出端口<select ref={first} value={sourcePort} onChange={e => setSourcePort(e.target.value)}>
      {output.map(p => <option key={p.id} value={p.id}>{p.label} · {p.type}</option>)}<option value={REL_OUT}>研究说明（点线）</option>
    </select></label>
    <label className={styles.field}>目标节点<select value={targetId} onChange={e => { setTargetId(e.target.value); const n = doc.nodes.find(n => n.id === e.target.value); setInputPort(n ? nodeDef(n.kind).inputs[0]?.id ?? '' : ''); }}>
      {!targets.length && <option value="">先添加另一个节点</option>}{targets.map(n => <option key={n.id} value={n.id}>{n.title} · {nodeDef(n.kind).title}</option>)}
    </select></label>
    {sourcePort !== REL_OUT && <label className={styles.field}>输入端口<select value={inputPort} onChange={e => setInputPort(e.target.value)}>
      {!inputs.length && <option value="">该节点没有数据输入</option>}{inputs.map(p => <option key={p.id} value={p.id}>{p.label} · {p.accepts.join(' / ')}</option>)}
    </select></label>}
    {problem && <p className={styles.errorText} role="status">{problem}</p>}
    <button type="submit" className={styles.primary} disabled={!!problem}>建立连接</button>
  </form>;
}

function MoreMenu({ doc, motion, glass, onMotion, onGlass, onPalette, onExport, onImport, onLayout, onClear, history, onUndo, onRedo, onClose }: {
  doc: CanvasDoc; motion: MotionLevel; glass: number; onMotion: (m: MotionLevel) => void; onGlass: (g: number) => void; onPalette: (p: string) => void;
  onExport: () => void; onImport: (f: File) => void; onLayout: () => void; onClear: () => void; history: History; onUndo: () => void; onRedo: () => void; onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null), file = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return <div className={`${styles.popover} ${styles.moreMenu}`} role="dialog" aria-label="更多操作" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <button ref={first} type="button" onClick={onLayout}>自动排布<small>按数据连线从左到右排列，可撤销</small></button>
    <button type="button" disabled={!history.past.length} onClick={onUndo}>撤销{history.past.length ? `：${history.past[history.past.length - 1].label}` : ''}</button>
    <button type="button" disabled={!history.future.length} onClick={onRedo}>恢复{history.future.length ? `：${history.future[0].label}` : ''}</button>
    <hr />
    <button type="button" onClick={onExport}>导出画布结构（JSON）<small>只含节点、连线与设置，不含答卷</small></button>
    <button type="button" onClick={() => file.current?.click()}>导入画布结构</button>
    <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
    <hr />
    <label className={styles.menuField}>项目配色<select value={doc.palette} onChange={e => onPalette(e.target.value)}>{CHART_THEMES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    <fieldset className={styles.menuField}><legend>动效</legend>
      <div className={styles.segmented}>{(['standard', 'reduced', 'off'] as MotionLevel[]).map(m => <button key={m} type="button" aria-pressed={motion === m} onClick={() => onMotion(m)}>{{ standard: '标准', reduced: '减少', off: '关闭' }[m]}</button>)}</div>
      <small>系统开启“减少动态效果”时，标准自动降为减少。</small>
    </fieldset>
    <label className={styles.menuField}>工具栏不透明度<input type="range" min={0.6} max={1} step={0.02} value={glass} onChange={e => onGlass(Number(e.target.value))} /></label>
    <hr />
    <button type="button" className={styles.dangerItem} disabled={!doc.nodes.length} onClick={onClear}>清空画布<small>可撤销；原成果文件不受影响</small></button>
    <p className={styles.menuNote}>画布结构保存在本机浏览器（{CANVAS_SCHEMA}）。答卷数据从不写入画布。</p>
  </div>;
}

function EmptyState({ design, dataset, onAdd, onTemplate, onAdopt }: { design: DesignSummary; dataset: DatasetValue | null; onAdd: () => void; onTemplate: () => void; onAdopt: (kinds: NodeKind[]) => void }) {
  const found: { kind: NodeKind; label: string }[] = [
    ...(design ? [{ kind: 'questionnaire' as NodeKind, label: `问卷草稿「${design.title || '未命名'}」· ${design.questions} 题` }] : []),
    ...(dataset ? [{ kind: 'dataset' as NodeKind, label: `数据「${dataset.name}」· ${dataset.table.rows.length} 行` }] : []),
  ];
  const [chosen, setChosen] = useState<NodeKind[]>(() => found.map(f => f.kind));
  return <div className={styles.empty}>
    <div className={styles.emptyCard}>
      <span className={styles.emptyEyebrow}>研究画布</span>
      <h3>把研究的每一步摆在一张图上</h3>
      <p>问卷、数据、统计、图表和成果共用工作台里的同一份内容。连线决定数据怎么流动，运行结果与「数据分析」完全一致。</p>
      <div className={styles.emptyActions}>
        <button type="button" className={styles.emptyAction} onClick={onAdd}><strong>添加节点</strong><small>从节点库挑选，或拖到画布上</small></button>
        <button type="button" className={styles.emptyAction} onClick={onTemplate}><strong>使用参考流程</strong><small>插入后每一步都可修改</small></button>
        <button type="button" className={styles.emptyAction} disabled aria-describedby="cv-ai-reason"><strong>让 AI 提出方案</strong><small id="cv-ai-reason">需要在「我的项目」中接入模型服务；本地工作台不调用模型</small></button>
      </div>
      {found.length > 0 && <div className={styles.adopt}>
        <p>发现现有成果，可以建立为节点引用（不会自动猜测执行关系）：</p>
        {found.map(f => <label key={f.kind}><input type="checkbox" checked={chosen.includes(f.kind)} onChange={e => setChosen(c => e.target.checked ? [...c, f.kind] : c.filter(k => k !== f.kind))} />{f.label}</label>)}
        <button type="button" className={styles.secondary} disabled={!chosen.length} onClick={() => onAdopt(chosen)}>建立引用</button>
      </div>}
    </div>
  </div>;
}
