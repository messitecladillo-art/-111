'use client';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { buildChartOption, buildTableSVG } from '@/lib/chart-options';
import { chartFont, formatChartNumber, THREE_LINE_TABLE_RULES } from '@/lib/chart-theme';
import type { ChartKind, ChartSnapshot, ChartStyle, ChartThemeId } from '@/lib/chart-types';
import { drawChartIn } from '@/lib/workspace-motion';
import styles from './ChartPreview.module.css';

async function loadEngine() {
  return (await import('@/lib/chart-engine')).engine;
}
let enginePromise: ReturnType<typeof loadEngine> | null = null;
const getEngine = () => enginePromise ??= loadEngine().catch(error => { enginePromise = null; throw error; });
export type ChartPreviewHandle = { exportImage: (format: 'svg' | 'png') => Promise<void> };
type Props = { snapshot: ChartSnapshot; kind: ChartKind; style: ChartStyle; theme: ChartThemeId };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function png(svg: string, width: number, height: number): Promise<Blob> {
  if (height > 8192 || width * height > 16_000_000) throw Error('表格较长，请导出 SVG 保留全部行。');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(Error('图像无法转为 PNG，请导出 SVG。')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw Error('当前浏览器无法导出 PNG。');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('PNG 编码失败，请重试。')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

const ChartPreview = forwardRef<ChartPreviewHandle, Props>(function ChartPreview({ snapshot, kind, style, theme }, ref) {
  const host = useRef<HTMLDivElement>(null), live = useRef<{ key: string; chart: ECharts } | null>(null);
  const requestKey = JSON.stringify([snapshot.binding, kind, style, theme]);
  const current = useRef(requestKey), mounted = useRef(false), drawn = useRef<string | null>(null);
  // Draw in only when the data or chart type changes; format edits redraw in place.
  const drawKey = JSON.stringify([snapshot.binding, kind]);
  const generation = useRef(0);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null), [ready, setReady] = useState('');
  // A commit invalidates exports before pending encoder/import microtasks resume.
  useLayoutEffect(() => { if (current.current !== requestKey) generation.current++; current.current = requestKey; }, [requestKey]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (kind === 'table') return;
    let cancelled = false, instance: ECharts | null = null;
    const element = host.current;
    const measure = () => { if (element) element.style.setProperty('--chart-scale', String(element.getBoundingClientRect().width / style.width)); };
    measure();
    const observer = element ? new ResizeObserver(measure) : null;
    if (element) observer?.observe(element);
    void getEngine().then(engine => {
      if (cancelled || !host.current) return;
      const option = buildChartOption(snapshot, kind, style, theme);
      instance = engine.init(host.current, undefined, { renderer: 'svg', width: style.width, height: style.height });
      instance.setOption(option as EChartsCoreOption);
      const svg = host.current.querySelector('svg');
      if (svg) svg.setAttribute('viewBox', `0 0 ${style.width} ${style.height}`);
      live.current = { key: requestKey, chart: instance }; setReady(requestKey);
      if (drawn.current !== drawKey) { drawn.current = drawKey; drawChartIn(host.current, kind); }
    }).catch(error => { if (!cancelled) setFailure({ key: requestKey, message: (error as Error).message || '图表绘制失败，请重试。' }); });
    return () => { cancelled = true; observer?.disconnect(); if (live.current?.chart === instance) live.current = null; instance?.dispose(); };
  }, [snapshot, kind, style, theme, requestKey, drawKey]);

  useImperativeHandle(ref, () => ({
    async exportImage(format) {
      const startKey = requestKey;
      const startGeneration = generation.current;
      const stillCurrent = () => mounted.current && generation.current === startGeneration && current.current === startKey;
      if (!stillCurrent()) throw Error('结果或格式已变化，请重新导出。');
      let svg: string, width: number, height: number;
      if (kind === 'table') ({ svg, width, height } = buildTableSVG(snapshot, style));
      else {
        if (live.current?.key !== requestKey) throw Error('图表正在更新，请稍后导出。');
        const engine = await getEngine(); if (!stillCurrent()) throw Error('结果或格式已变化，请重新导出。');
        const instance = engine.init(null, undefined, { renderer: 'svg', ssr: true, width: style.width, height: style.height });
        try { instance.setOption(buildChartOption(snapshot, kind, style, theme) as EChartsCoreOption); svg = instance.renderToSVGString({ useViewBox: true }); }
        finally { instance.dispose(); }
        width = style.width; height = style.height;
      }
      if (!stillCurrent()) throw Error('结果或格式已变化，请重新导出。');
      const blob = format === 'svg' ? new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }) : await png(svg, width, height);
      if (!stillCurrent()) throw Error('结果或格式已变化，请重新导出。');
      const title = (style.title || '分析图表').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').slice(0, 60) || '分析图表';
      download(blob, `${title}.${format}`);
    },
  }), [requestKey, snapshot, kind, style, theme]);

  if (kind === 'table') return <div className={styles.tablePaper} data-chart-kind="table" data-chart-ready="true" style={{ background: style.background, color: style.ink, fontFamily: chartFont(style), fontSize: style.fontSize }}>
    <h3>{style.title}</h3>{style.subtitle && <p>{style.subtitle}</p>}
    <div className={styles.tableScroll} tabIndex={0} aria-label="统计结果表，可滚动"><table data-rules={style.tableRules} style={{ '--three-line-outer': `${THREE_LINE_TABLE_RULES.outerPt}pt`, '--three-line-header': `${THREE_LINE_TABLE_RULES.headerPt}pt` } as React.CSSProperties}><thead><tr>{snapshot.table.headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{snapshot.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{typeof cell === 'string' ? cell : formatChartNumber(cell, style.decimals)}</td>)}</tr>)}</tbody></table></div>
    <p className={styles.caption}>{style.note && <>{style.note}<br /></>}n = {snapshot.n}</p>
  </div>;
  return <div className={styles.paper} data-chart-kind={kind} data-chart-ready={ready === requestKey && failure?.key !== requestKey} style={{ background: style.background, aspectRatio: `${style.width} / ${style.height}` }} role="img" aria-label={`${style.title || '分析图表'}，有效样本 ${snapshot.n}，图型 ${kind}`}>
    <div ref={host} className={styles.host} />
    {failure?.key === requestKey ? <p className={styles.status} role="alert">{failure.message}</p> : ready !== requestKey && <p className={styles.status} role="status">正在绘制图表…</p>}
  </div>;
});
export default ChartPreview;
