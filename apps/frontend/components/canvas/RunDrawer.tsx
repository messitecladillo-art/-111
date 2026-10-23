'use client';

import { useEffect, useRef } from 'react';
import { nodeDef } from '@/lib/canvas/catalog';
import type { CanvasDoc, Issue } from '@/lib/canvas/graph';
import type { NodeState, NodeStatus, RunEvent } from '@/lib/canvas/execute';
import { STATUS_LABELS } from './canvasUi';
import styles from './Canvas.module.css';

export type DrawerTab = 'log' | 'check' | 'nodes';
type Props = {
  doc: CanvasDoc; states: Map<string, NodeState>; events: RunEvent[]; issues: Issue[] | null; open: boolean; tab: DrawerTab; onTab: (tab: DrawerTab) => void;
  onToggle: () => void; onLocate: (id: string) => void; running: { done: number; total: number } | null;
};

/** Compact status strip that expands into a 280px drawer with the log, check results and a node list. */
export default function RunDrawer({ doc, states, events, issues, open, tab, onTab: setTab, onToggle, onLocate, running }: Props) {
  const counts = new Map<NodeStatus, number>();
  for (const s of states.values()) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
  const title = (id: string) => doc.nodes.find(n => n.id === id)?.title ?? id;
  const log = useRef<HTMLOListElement>(null);
  // Follow the newest entry while a run is writing to the log.
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [events.length, open, tab]);
  const errors = issues?.filter(i => i.level === 'error').length ?? 0;
  const summary = running ? `运行中 ${running.done} / ${running.total}` : states.size
    ? (['done', 'failed', 'blocked', 'waiting'] as NodeStatus[]).filter(s => counts.get(s)).map(s => `${STATUS_LABELS[s]} ${counts.get(s)}`).join(' · ') || '尚未运行'
    : '尚未运行';
  return <section className={styles.drawer} data-open={open || undefined} aria-label="运行状态">
    <button type="button" className={styles.drawerBar} aria-expanded={open} onClick={onToggle}>
      <span className={styles.drawerDot} data-state={running ? 'running' : counts.get('failed') ? 'failed' : counts.get('waiting') ? 'waiting' : states.size ? 'done' : 'idle'} aria-hidden="true" />
      <strong>{summary}</strong>
      {issues && <span>{errors ? `检查发现 ${errors} 个问题` : '检查通过'}</span>}
      <span className={styles.drawerToggle}>{open ? '收起' : '日志与结果'}</span>
    </button>
    {open && <div className={styles.drawerBody}>
      <div className={styles.segmented} role="tablist" aria-label="运行信息">
        <button type="button" role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>运行日志</button>
        <button type="button" role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>检查结果</button>
        <button type="button" role="tab" aria-selected={tab === 'nodes'} onClick={() => setTab('nodes')}>节点列表</button>
      </div>
      {tab === 'log' && (events.length ? <ol ref={log} className={styles.log}>{events.filter(e => e.type !== 'handoff' && e.type !== 'queued').slice(-200).map(e => <li key={e.seq} data-type={e.type}>
        <time>{new Date(e.at).toLocaleTimeString('zh-CN', { hour12: false })}</time>
        <button type="button" onClick={() => onLocate(e.nodeId)}>{title(e.nodeId)}</button>
        <span>{e.type === 'cancelled' ? '已取消' : STATUS_LABELS[e.type as NodeStatus]}{e.message ? `：${e.message}` : ''}</span>
      </li>)}</ol> : <p className={styles.muted}>运行后，这里按时间记录每个节点的状态与原因。</p>)}
      {tab === 'check' && (issues === null ? <p className={styles.muted}>点击右上角「检查」，在运行前定位缺失输入、未选变量、类型错误与循环。</p> : issues.length ? <ul className={styles.log}>{issues.map((i, k) => <li key={k} data-type={i.level === 'error' ? 'failed' : 'waiting'}>
        <span className={styles.levelTag}>{i.level === 'error' ? '错误' : '提示'}</span>
        <button type="button" onClick={() => onLocate(i.nodeId)}>{title(i.nodeId)}</button>
        <span>{i.message}</span>
      </li>)}</ul> : <p className={styles.muted}>没有发现问题，可以运行。</p>)}
      {tab === 'nodes' && <ul className={styles.log}>{doc.nodes.filter(n => n.kind !== 'group').map(n => {
        const s = states.get(n.id);
        return <li key={n.id} data-type={s?.status ?? 'idle'}>
          <span className={styles.levelTag}>{nodeDef(n.kind).title}</span>
          <button type="button" onClick={() => onLocate(n.id)}>{n.title}</button>
          <span>{s ? STATUS_LABELS[s.status] : '未运行'}{s?.message ? `：${s.message}` : ''}</span>
        </li>;
      })}</ul>}
    </div>}
  </section>;
}
