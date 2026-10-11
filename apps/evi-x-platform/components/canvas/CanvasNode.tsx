'use client';

import { memo, useEffect, useRef } from 'react';
import { Handle, Position, useStore, useUpdateNodeInternals, type NodeProps, type ReactFlowState } from '@xyflow/react';
import { nodeDef, type CategoryId } from '@/lib/canvas/catalog';
import { REL_IN, REL_OUT } from '@/lib/canvas/graph';
import type { NodeStatus } from '@/lib/canvas/execute';
import { STATUS_LABELS, nodeSummary, useCanvasContext, type FlowNode } from './canvasUi';
import styles from './Canvas.module.css';

/** Level of detail from zoom: 0 = summary and ports, 1 = title and status, 2 = title only. */
const lodOf = (s: ReactFlowState) => { const z = s.transform[2]; return z < 0.3 ? 2 : z < 0.5 ? 1 : 0; };
const portTop = (i: number, n: number) => `${((i + 1) / (n + 1)) * 100}%`;

export const CATEGORY_GLYPH: Record<CategoryId, string> = { design: '问', questionnaire: '卷', sample: '样', data: '数', stats: '统', chart: '图', flow: '流', output: '果' };

export function StatusMark({ status }: { status: NodeStatus }) {
  if (status === 'idle') return null;
  return <span className={styles.statusMark} data-status={status} title={STATUS_LABELS[status]}><i aria-hidden="true" /><span className={styles.statusText}>{STATUS_LABELS[status]}</span></span>;
}

export const ResearchNode = memo(function ResearchNode({ id, data, selected, dragging }: NodeProps<FlowNode>) {
  const ctx = useCanvasContext();
  const lod = useStore(lodOf);
  const def = nodeDef(data.node.kind), status = data.state?.status ?? 'idle';
  const updateInternals = useUpdateNodeInternals();
  const portSignature = `${id}:${def.inputs.map(p => p.id).join('|')}/${def.outputs.map(p => p.id).join('|')}`;
  const lastPorts = useRef(portSignature);
  useEffect(() => {
    // Imported IDs can retain their dimensions but acquire different handles. RF's type remains
    // "research", so its observer cannot detect this custom port change. Initial mount is measured by RF.
    if (lastPorts.current === portSignature) return;
    lastPorts.current = portSignature; updateInternals(id);
  }, [id, portSignature, updateInternals]);
  const lines = nodeSummary(data.node, data.state, ctx).filter(Boolean);
  const issue = data.issues.find(i => i.level === 'error') ?? data.issues[0];
  const message = status === 'failed' || status === 'blocked' || status === 'waiting' ? data.state?.message : issue?.message;
  return <div className={styles.node} data-category={def.category} data-status={status} data-selected={selected || undefined} data-dragging={dragging || undefined} data-lod={lod} data-enter={data.entering ?? undefined} data-issue={issue?.level}>
    {def.inputs.map((p, i) => <Handle key={p.id} type="target" position={Position.Left} id={p.id} className={styles.port} style={{ top: portTop(i, def.inputs.length) }} title={`输入：${p.label} · ${p.accepts.join(' / ')}`} aria-label={`${data.node.title}输入：${p.label}`}><span className={styles.portLabel} data-side="in">{p.label}</span></Handle>)}
    {def.outputs.map((p, i) => <Handle key={p.id} type="source" position={Position.Right} id={p.id} className={styles.port} style={{ top: portTop(i, def.outputs.length) }} title={`输出：${p.label} · ${p.type}`} aria-label={`${data.node.title}输出：${p.label}`}><span className={styles.portLabel} data-side="out">{p.label}</span></Handle>)}
    <Handle type="target" position={Position.Top} id={REL_IN} className={styles.relPort} title="说明连线（接入）" />
    <Handle type="source" position={Position.Bottom} id={REL_OUT} className={styles.relPort} title="说明连线（引出）" />
    <div className={styles.nodeShell}>
      <header className={styles.nodeHead}>
        <span className={styles.glyph} aria-hidden="true">{CATEGORY_GLYPH[def.category]}</span>
        <strong title={data.node.title}>{data.node.title}</strong>
        <StatusMark status={status} />
      </header>
      {lod < 2 && <p className={styles.nodeKind}>{def.title}{def.capability === 'reference' ? ' · 引用' : def.capability === 'note' ? ' · 注释' : ''}</p>}
      {lod === 0 && <div className={styles.nodeLines}>{lines.slice(0, 2).map((l, i) => <span key={i}>{l}</span>)}</div>}
      {lod === 0 && message && <p className={styles.nodeMessage} data-tone={status === 'failed' || issue?.level === 'error' ? 'error' : 'warn'}>{message}</p>}
      {lod === 0 && def.section && def.capability !== 'run' && <button type="button" className={`${styles.nodeOpen} nodrag`} onClick={e => { e.stopPropagation(); ctx.open(def.section!, id); }}>打开编辑器</button>}
    </div>
  </div>;
});

export const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  const ctx = useCanvasContext();
  const collapsed = !!data.node.config.collapsed;
  const counts = (data.childStatus ?? {}) as Partial<Record<NodeStatus, number>>;
  const summary = (Object.entries(counts) as [NodeStatus, number][]).filter(([s, n]) => n && s !== 'idle').map(([s, n]) => `${STATUS_LABELS[s]} ${n}`).join(' · ');
  return <div className={styles.group} data-collapsed={collapsed || undefined} data-selected={selected || undefined} data-enter={data.entering ?? undefined}>
    <header className={styles.groupHead}>
      <strong>{data.node.title}</strong>
      <span>{data.childCount} 个节点</span>
      <button type="button" className={`${styles.groupToggle} nodrag`} aria-expanded={!collapsed} onClick={e => { e.stopPropagation(); ctx.toggleGroup(id); }}>{collapsed ? '展开' : '收起'}</button>
    </header>
    {collapsed && <p className={styles.groupSummary}>{summary || '编组只整理布局，不决定执行顺序。'}</p>}
  </div>;
});
