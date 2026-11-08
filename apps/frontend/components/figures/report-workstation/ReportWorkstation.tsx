'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { ReportWorkState } from '@/lib/agent/report-work';
import type { SolidPaths } from './vendor/iso-kit';
import { BASE, CARRIAGE, CONTROL, DATA_GRID, DIAL, DIAL_NEEDLE, FEEDER, FRAME, HEIGHT, OUTPUT, PAPER_LINES, REFERENCE_CARDS, RULER, SEAMS, SHADOW, SOCKET, WIDTH, travel, type Part } from './geometry';
import styles from './ReportWorkstation.module.css';

type WorkKind = 'report' | 'analysis' | 'research';
const HEADINGS: Record<WorkKind, Record<ReportWorkState['phase'], string>> = {
  report: {
    preparing: '整理写作材料', writing: '正在撰写报告', reviewing: '正在核对与修订',
    waiting: '等待继续', error: '生成已中断', complete: '本次撰写已完成',
  },
  analysis: {
    preparing: '准备分析输入', writing: '正在计算', reviewing: '核对分析结果',
    waiting: '等待分析配置', error: '分析暂未完成', complete: '本次分析已完成',
  },
  research: {
    preparing: '准备检索资料', writing: '正在检索资料', reviewing: '正在核对来源',
    waiting: '等待检索条件', error: '检索暂未完成', complete: '本次检索已完成',
  },
};
const LABELS: Record<WorkKind, string> = { report: '报告写作', analysis: '数据分析', research: '资料检索' };
const UNITS: Record<WorkKind, string> = { report: '节', analysis: '项', research: '条' };
const PAPER: Record<WorkKind, string> = { report: PAPER_LINES, analysis: DATA_GRID, research: REFERENCE_CARDS };
const subscribePage = (notify: () => void) => {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
};
const pageSnapshot = () => document.visibilityState === 'visible';
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const motionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Adapted from Anatomy kit/react/draw.tsx; copyright/license in vendor/LICENSE. */
function Solid({ paths, material }: { paths: SolidPaths; material: Part['material'] }) {
  return <g className={styles.solid} data-material={material}>
    <path className={styles.fill} d={paths.fill} />
    {paths.shades.map((d, i) => d ? <path key={i} className={styles.shade} data-shade={i} d={d} /> : null)}
    <path className={styles.top} d={paths.top} />
    {paths.crease && <path className={styles.crease} d={paths.crease} />}
    {paths.bevel && <path className={styles.bevel} d={paths.bevel} />}
    <path className={styles.edge} d={paths.outline} />
  </g>;
}
function Parts({ parts }: { parts: Part[] }) {
  return parts.map(part => <g key={part.id} data-machine-part={part.id}>
    <Solid paths={part.shape} material={part.material} />
    {part.lines && <path className={styles.detailLine} d={part.lines} />}
  </g>);
}

/** Screen-only illustration. Phase/readout are props; no timer changes task state. */
export default function ReportWorkstation({
  state, compact = false, kind = 'report', inline = false, heading, countUnit, inspectable = false, paused = false,
}: {
  state: ReportWorkState;
  compact?: boolean;
  kind?: WorkKind;
  inline?: boolean;
  heading?: string;
  countUnit?: string;
  /** Pauses illustration motion only; the underlying task keeps its actual status. */
  paused?: boolean;
  /** Development fixtures only; production has no additional visualization controls. */
  inspectable?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const pageVisible = useSyncExternalStore(subscribePage, pageSnapshot, () => false);
  const reduced = useSyncExternalStore(subscribeMotion, motionSnapshot, () => true);
  const id = useId();
  const busy = ['preparing', 'writing', 'reviewing'].includes(state.phase);
  const moving = busy && !paused && visible && pageVisible && !reduced;

  useEffect(() => {
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      const latest = entries[entries.length - 1];
      if (latest) setVisible(latest.isIntersecting);
    });
    if (root.current) observer?.observe(root.current);
    const fallbackFrame = !observer ? window.requestAnimationFrame(() => setVisible(true)) : null;
    return () => { observer?.disconnect(); if (fallbackFrame !== null) window.cancelAnimationFrame(fallbackFrame); };
  }, []);

  const total = Number.isFinite(state.total) ? Math.max(0, Math.floor(state.total)) : 0;
  const completed = Number.isFinite(state.completed) ? Math.min(total, Math.max(0, Math.floor(state.completed))) : 0;
  return <section ref={root} className={styles.workstation} data-report-workstation="true" data-phase={state.phase}
    data-kind={kind} data-inline={inline || undefined} data-expanded={inspectable && expanded} data-running={moving} data-paused={paused || undefined} data-compact={compact || undefined}
    aria-label={`${LABELS[kind]}状态`} aria-busy={busy}>
    {inspectable && <header className={styles.header}>
      <span className={styles.eyebrow}>结构查看</span>
      <button type="button" className={styles.inspect} aria-expanded={expanded} aria-controls={`${id}-drawing`}
        onClick={() => setExpanded(v => !v)}>{expanded ? '收起结构' : '展开结构'}<span aria-hidden="true">{expanded ? '−' : '+'}</span></button>
    </header>}
    <div id={`${id}-drawing`} className={styles.drawing} style={{ '--travel-x': `${travel[0]}px`, '--travel-y': `${travel[1]}px` } as CSSProperties}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.machine} role="img" aria-label={`${LABELS[kind]}处理装置：材料输入、处理笔架与结果纸盘`}>
        <ellipse className={styles.ground} cx={SHADOW[0]} cy={SHADOW[1] + 4} rx="171" ry="31" />
        <Parts parts={BASE} />
        <path className={styles.detailLine} d={SEAMS} />
        <path className={styles.ticks} d={RULER.minor} />
        <path className={styles.detailLine} d={RULER.major} />
        <path className={styles.paperLines} d={PAPER[kind]} />
        <g className={styles.feeder}><Parts parts={FEEDER} /></g>
        <g className={styles.gantry}><Parts parts={FRAME} /></g>
        <g className={styles.carriage}><g className={styles.headMotion}><Parts parts={CARRIAGE} /></g></g>
        <g className={styles.output}><Parts parts={OUTPUT} /></g>
        <Parts parts={CONTROL} />
        <path className={styles.ticks} d={DIAL.minor} />
        <path className={styles.detailLine} d={DIAL.major} />
        <path className={styles.dialNeedle} d={DIAL_NEEDLE} />
        <path className={styles.lamp} d={SOCKET} />
      </svg>
    </div>
    <div className={styles.readout}>
      <h3 role="status" aria-live="polite" aria-atomic="true">{heading || HEADINGS[kind][state.phase]}</h3>
      {total > 0 && <span className={styles.count}><b>{completed}</b><span> / {total} {countUnit ?? UNITS[kind]}</span></span>}
    </div>
    {state.detail && <p className={styles.detail} title={state.detail}>{state.detail}</p>}
  </section>;
}
