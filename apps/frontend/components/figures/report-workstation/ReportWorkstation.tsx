'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { ReportWorkState } from '@/lib/agent/report-work';
import type { SolidPaths } from './vendor/iso-kit';
import { BASE, CARRIAGE, CONTROL, DATA_GRID, DIAL, DIAL_NEEDLE, FEEDER, FRAME, HEIGHT, OUTPUT, PAPER_LINES, REFERENCE_CARDS, RULER, SEAMS, SHADOW, SOCKET, WIDTH, travel, type Part } from './geometry';
import styles from './ReportWorkstation.module.css';

export type WorkKind = 'report' | 'analysis' | 'research' | 'diagram' | 'crossref' | 'imaging' | 'defense' | 'survey';
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
  diagram: {
    preparing: '解析节点拓扑', writing: '正在布局研究框架', reviewing: '同步矢量化绘图',
    waiting: '画布就绪', error: '画布校验异常', complete: '架构图已入库',
  },
  crossref: {
    preparing: '扫描全文语义锚点', writing: '匹配最佳引用位置', reviewing: '校验文献格式与编号',
    waiting: '等待选中文献', error: '匹配暂未完成', complete: '交叉引用已注入',
  },
  imaging: {
    preparing: '解析视觉提示词', writing: '生成视觉素材中', reviewing: '矢量封装与计量记录',
    waiting: '生图工坊就绪', error: '生成未通过', complete: '素材已产出',
  },
  defense: {
    preparing: '索引报告全文语义', writing: '定位原文章节与标红', reviewing: '生成问辩答复草稿',
    waiting: 'Q/A 问答待命', error: '检索未命中', complete: '问辩稿已备妥',
  },
  survey: {
    preparing: '同步问卷结构树', writing: '生成极简测评题组', reviewing: '打包问卷星与附录导出',
    waiting: '问卷工坊就绪', error: '题项规则校验提醒', complete: '问卷配置已同步',
  },
};
const LABELS: Record<WorkKind, string> = {
  report: '报告写作', analysis: '数据分析', research: '资料检索',
  diagram: '流程图排版', crossref: '交叉引用匹配', imaging: '生图工作坊', defense: 'Q/A 标红与答辩', survey: '极简问卷工坊',
};
const UNITS: Record<WorkKind, string> = {
  report: '节', analysis: '项', research: '条',
  diagram: '节点', crossref: '处', imaging: '张', defense: '命中', survey: '题',
};
const PAPER: Record<WorkKind, string> = {
  report: PAPER_LINES, analysis: DATA_GRID, research: REFERENCE_CARDS,
  diagram: DATA_GRID, crossref: REFERENCE_CARDS, imaging: PAPER_LINES, defense: REFERENCE_CARDS, survey: DATA_GRID,
};
const SKIN_TAGS: Record<WorkKind, string> = {
  report: 'ANATOMY · TYPE',
  analysis: 'ANATOMY · STAT',
  research: 'ANATOMY · REF',
  diagram: 'ANATOMY · DRAW',
  crossref: 'ANATOMY · XREF',
  imaging: 'ANATOMY · IMAGE',
  defense: 'ANATOMY · Q/A',
  survey: 'ANATOMY · FORM',
};
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

export type WorkstationTelemetry = {
  /** 0..1 carriage progress across the active line. */
  lineRatio?: number;
  /** Incrementing keystroke counter for keybar strike pulses. */
  strikeTick?: number;
  /** True briefly on carriage return / newline snap. */
  returning?: boolean;
  /** Trailing excerpt of the line currently being struck on paper. */
  activePhrase?: string;
};

function dialPivot(path: string): string | undefined {
  const m = /^M(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/u.exec(path);
  return m ? `${m[1]}px ${m[2]}px` : undefined;
}

/** Screen-only illustration. Phase/readout are props; no timer changes task state. */
export default function ReportWorkstation({
  state, compact = false, kind = 'report', inline = false, heading, countUnit, inspectable = false, paused = false, telemetry,
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
  /** Optional screen-only typewriter telemetry driving carriage travel and keybar strike cadence. */
  telemetry?: WorkstationTelemetry;
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
  const driven = moving && typeof telemetry?.lineRatio === 'number';
  const lineRatio = driven ? Math.max(0, Math.min(1, telemetry!.lineRatio!)) : 0;
  const strikeParity = moving && typeof telemetry?.strikeTick === 'number' ? telemetry.strikeTick % 2 : undefined;
  const dialRatio = total > 0 ? Math.max(0, Math.min(1, (completed + (driven ? lineRatio * 0.65 : 0)) / total)) : moving ? 0.38 : 0;
  const dialAngle = Math.round(-75 + dialRatio * 205);
  const needleOrigin = dialPivot(DIAL_NEEDLE);
  const paperDashOffset = Math.max(0, 260 - Math.round((total > 0 ? dialRatio : lineRatio) * 260));
  const activePhrase = telemetry?.activePhrase?.trim();
  const drawingStyle = {
    '--travel-x': `${travel[0]}px`,
    '--travel-y': `${travel[1]}px`,
    '--drive-x': `${(lineRatio * travel[0]).toFixed(2)}px`,
    '--drive-y': `${(lineRatio * travel[1]).toFixed(2)}px`,
  } as CSSProperties;

  return <section ref={root} className={styles.workstation} data-report-workstation="true" data-phase={state.phase}
    data-kind={kind} data-inline={inline || undefined} data-expanded={inspectable && expanded} data-running={moving}
    data-typing={driven || undefined} data-paused={paused || undefined} data-compact={compact || undefined}
    aria-label={`${LABELS[kind]}状态`} aria-busy={busy}>
    {inspectable && <header className={styles.header}>
      <span className={styles.eyebrow}>结构查看</span>
      <button type="button" className={styles.inspect} aria-expanded={expanded} aria-controls={`${id}-drawing`}
        onClick={() => setExpanded(v => !v)}>{expanded ? '收起结构' : '展开结构'}<span aria-hidden="true">{expanded ? '−' : '+'}</span></button>
    </header>}
    <div id={`${id}-drawing`} className={styles.drawing} style={drawingStyle}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.machine} role="img" aria-label={`${LABELS[kind]}处理装置：材料输入、处理笔架与结果纸盘`}>
        <ellipse className={styles.ground} cx={SHADOW[0]} cy={SHADOW[1] + 4} rx="171" ry="31" />
        <Parts parts={BASE} />
        <path className={styles.detailLine} d={SEAMS} />
        <path className={styles.ticks} d={RULER.minor} />
        <path className={styles.detailLine} d={RULER.major} />
        <path className={styles.paperLines} d={PAPER[kind]} />
        {moving && PAPER[kind] && (
          <path className={styles.paperLinesActive} d={PAPER[kind]} style={{ strokeDashoffset: paperDashOffset }} />
        )}
        <g className={styles.feeder}><Parts parts={FEEDER} /></g>
        <g className={styles.gantry}><Parts parts={FRAME} /></g>
        <g className={styles.carriage}>
          <g className={styles.headMotion} data-driven={driven || undefined} data-returning={(driven && telemetry?.returning) || undefined}>
            <g className={styles.striker} data-strike={strikeParity}>
              <Parts parts={CARRIAGE} />
            </g>
          </g>
        </g>
        <g className={styles.output}><Parts parts={OUTPUT} /></g>
        <Parts parts={CONTROL} />
        <path className={styles.ticks} d={DIAL.minor} />
        <path className={styles.detailLine} d={DIAL.major} />
        <path
          className={styles.dialNeedle}
          d={DIAL_NEEDLE}
          style={needleOrigin ? { transformOrigin: needleOrigin, transform: `rotate(${dialAngle}deg)` } : undefined}
        />
        <path className={styles.lamp} d={SOCKET} />
      </svg>
    </div>
    <div className={styles.readout}>
      <div className={styles.readoutMain}>
        <h3 role="status" aria-live="polite" aria-atomic="true">{heading || HEADINGS[kind][state.phase]}</h3>
        {(kind !== 'report' || driven || telemetry || busy) && (
          <span className={styles.skinTag} aria-hidden="true"><i />{SKIN_TAGS[kind]}</span>
        )}
      </div>
      {total > 0 && <span className={styles.count}><b>{completed}</b><span> / {total} {countUnit ?? UNITS[kind]}</span></span>}
    </div>
    {activePhrase && busy && (
      <div className={styles.tickerRow} aria-hidden="true">
        <span>▸</span>
        <code>{activePhrase}</code>
      </div>
    )}
    {state.detail && <p className={styles.detail} title={state.detail}>{state.detail}</p>}
  </section>;
}
