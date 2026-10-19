'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { CATEGORICAL_DARK, CATEGORICAL_LIGHT, NEUTRAL_HALO, ORDINAL_DARK, ORDINAL_LIGHT } from '@/lib/silicon/palette';
import type { Theme } from '@/components/workbench/shell-kit';
import type { TermTrend } from '@/lib/topic-lab/trend';
import { SIGNAL_LABELS } from '@/lib/topic-lab/trend';
import styles from './TopicLab.module.css';

/** Validated categorical slots; clusters beyond the eighth share the neutral colour and say so in legends. */
export function clusterColor(theme: Theme, cluster: number): string {
  const pal = theme === 'dark' ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  return cluster >= 0 && cluster < pal.length ? pal[cluster] : NEUTRAL_HALO;
}
export const MAX_CLUSTER_COLORS = CATEGORICAL_LIGHT.length;

/** Five ordered year bins between the earliest and latest value; the most recent bin has the most contrast. */
export type YearBins = { edges: number[]; color: (year: number | null) => string; labels: string[]; colors: string[] };
export function yearBins(theme: Theme, values: Array<number | null>): YearBins | null {
  const ys = values.filter((v): v is number => v !== null);
  if (!ys.length) return null;
  const lo = Math.min(...ys), hi = Math.max(...ys), ramp = theme === 'dark' ? ORDINAL_DARK : ORDINAL_LIGHT;
  const step = (hi - lo) / ramp.length || 1;
  const edges = Array.from({ length: ramp.length + 1 }, (_, i) => lo + step * i);
  const bin = (y: number) => Math.min(ramp.length - 1, Math.max(0, Math.floor((y - lo) / step)));
  const fmt = (v: number) => hi - lo >= 5 ? String(Math.round(v)) : v.toFixed(1);
  return {
    edges,
    color: y => y === null ? NEUTRAL_HALO : ramp[bin(y)],
    labels: ramp.map((_, i) => `${fmt(edges[i])}–${fmt(edges[i + 1])}`),
    colors: [...ramp],
  };
}

/** CiteSpace convention: betweenness centrality ≥ 0.1 marks a pivot node (purple ring). */
export const PIVOT = 0.1;
export function qText(q: number) { return q >= .3 ? '大于 0.3，聚类结构清晰' : '低于 0.3，聚类边界较模糊'; }
export function sText(s: number) { return s >= .7 ? '大于 0.7，聚类内部高度一致' : s >= .5 ? '大于 0.5，聚类基本合理' : '低于 0.5，聚类划分需谨慎解读'; }

/** The ordinal ramp darkens toward recent years on light surfaces and brightens on dark ones. */
export const recentHint = (theme: Theme) => theme === 'dark' ? '越亮越新' : '越深越新';

export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(entries => { const w = Math.round(entries[0].contentRect.width); setWidth(prev => Math.abs(prev - w) > 2 ? w : prev); });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const fmtInt = (v: number) => v.toLocaleString('zh-CN');
export const fmtYear = (v: number | null) => v === null ? '—' : v.toFixed(1);
export function fmtP(p: number): string { return p < 0.001 ? '< 0.001' : p.toFixed(3); }

export function trendText(t: TermTrend | null | undefined): string {
  if (!t) return '—';
  if (t.signal === 'insufficient') return SIGNAL_LABELS.insufficient;
  return `${SIGNAL_LABELS[t.signal]}（近期 ${pct(t.recentShare)} / 此前 ${pct(t.earlyShare)}，z = ${t.z?.toFixed(2)}）`;
}
export function trendGlyph(t: TermTrend | null | undefined): string {
  if (!t) return '';
  return t.signal === 'rising' ? '↑' : t.signal === 'falling' ? '↓' : t.signal === 'stable' ? '→' : '?';
}

/** Absolutely positioned tooltip inside a relative chart frame. */
export function Tip({ at, children }: { at: { x: number; y: number; w: number } | null; children: ReactNode }) {
  if (!at) return null;
  const left = Math.min(Math.max(8, at.x + 14), Math.max(8, at.w - 268));
  return <div className={styles.tip} style={{ left, top: at.y + 16 }} role="status">{children}</div>;
}

export function Legend({ items, title }: { items: Array<{ color: string; label: string; hollow?: boolean }>; title?: string }) {
  return <div className={styles.legend}>{title && <span className={styles.legendTitle}>{title}</span>}{items.map(i => <span key={i.label} className={styles.legendItem}><i style={i.hollow ? { borderColor: i.color } : { background: i.color, borderColor: i.color }} className={i.hollow ? styles.hollow : undefined} />{i.label}</span>)}</div>;
}

/**
 * Wheel / drag / button zoom for an SVG chart, plus the frame's own width (the chart sits in a grid
 * column, so the panel width is not the chart width). The wheel listener is native so it can stop
 * page scroll; the frame ref is a callback so the observers follow the element across remounts.
 */
export function useZoom(enabled = true) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(entries => { const w = Math.round(entries[0].contentRect.width); setWidth(prev => Math.abs(prev - w) > 2 ? w : prev); });
    ro.observe(node);
    if (!enabled) return () => ro.disconnect();
    const onWheel = (e: WheelEvent) => {
      // Plain wheel keeps scrolling the page; Ctrl/⌘ + wheel and trackpad pinch zoom the chart.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
      setView(v => {
        const k = Math.min(8, Math.max(1, v.k * Math.exp(-e.deltaY * 0.0018)));
        const f = k / v.k;
        return clamp({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f }, rect.width, rect.height);
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => { ro.disconnect(); node.removeEventListener('wheel', onWheel); };
  }, [node, enabled]);
  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => { if (e.button !== 0) return; dragged.current = false; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current; if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) { d.moved = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
      d.x = e.clientX; d.y = e.clientY;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setView(v => clamp({ k: v.k, x: v.x + dx, y: v.y + dy }, rect.width, rect.height));
    },
    onPointerUp: () => { dragged.current = drag.current?.moved ?? false; drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
  };
  const zoomBy = (f: number) => {
    if (!node) return;
    const { width: w, height: h } = node.getBoundingClientRect();
    setView(v => { const k = Math.min(8, Math.max(1, v.k * f)), r = k / v.k; return clamp({ k, x: w / 2 - (w / 2 - v.x) * r, y: h / 2 - (h / 2 - v.y) * r }, w, h); });
  };
  /** True right after a drag, so the click that ends a pan does not select a node. */
  const wasDrag = () => dragged.current;
  return { frameRef: setNode, width, view, handlers, zoomIn: () => zoomBy(1.4), zoomOut: () => zoomBy(1 / 1.4), reset: () => setView({ k: 1, x: 0, y: 0 }), wasDrag };
}
/** Pointer position relative to the chart's SVG, from any element inside it. */
export function svgPoint(e: ReactPointerEvent<SVGElement>) {
  const svg = e.currentTarget instanceof SVGSVGElement ? e.currentTarget : e.currentTarget.ownerSVGElement!;
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
}
function clamp(v: { k: number; x: number; y: number }, w: number, h: number) {
  // Keep at least a quarter of the zoomed content inside the frame.
  return { k: v.k, x: Math.min(w * .75, Math.max(w * .25 - w * v.k, v.x)), y: Math.min(h * .75, Math.max(h * .25 - h * v.k, v.y)) };
}

export function ZoomControls({ view, onIn, onOut, onReset, label }: { view: { k: number; x: number; y: number }; onIn: () => void; onOut: () => void; onReset: () => void; label: string }) {
  return <div className={styles.zoomBar} role="group" aria-label={`${label}缩放`}>
    <button type="button" onClick={onIn} aria-label="放大">＋</button>
    <button type="button" onClick={onOut} aria-label="缩小" disabled={view.k <= 1}>－</button>
    <button type="button" onClick={onReset} disabled={view.k === 1 && view.x === 0 && view.y === 0}>复位</button>
    <span aria-hidden="true">{Math.round(view.k * 100)}%</span>
  </div>;
}

/** Text width in CSS pixels for the workbench sans font, measured once per (text, size). */
const measureCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null = null;
export const SANS = '"Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
export function textWidth(text: string, size: number, weight = 600): number {
  const key = `${weight}|${size}|${text}`;
  const hit = measureCache.get(key); if (hit !== undefined) return hit;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  let w = text.length * size * .62;
  if (measureCtx) { measureCtx.font = `${weight} ${size}px ${SANS}`; w = measureCtx.measureText(text).width; }
  if (measureCache.size > 20000) measureCache.clear();
  measureCache.set(key, w);
  return w;
}
export function clearMeasureCache() { measureCache.clear(); }

/** Small "导出 SVG" control placed in each chart's toolbar. */
export function ExportButton({ onExport, label = '导出 SVG' }: { onExport: () => void; label?: string }) {
  return <button type="button" className={styles.exportButton} onClick={onExport} title="导出为透明背景的 SVG（按当前主题配色，含图例与数据说明）">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 11v3h10v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{label}
  </button>;
}
