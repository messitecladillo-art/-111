'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { exportSvgElement, stamp } from './exportSvg';
import type { Theme } from '@/components/workbench/shell-kit';
import type { TermMap } from '@/lib/topic-lab/network';
import type { TermTrend } from '@/lib/topic-lab/trend';
import { layoutCloud } from '@/lib/topic-lab/wordcloud';
import { ExportButton, Legend, MAX_CLUSTER_COLORS, SANS, Tip, clearMeasureCache, clusterColor, fmtInt, fmtYear, pct, textWidth, trendGlyph, trendText, useElementWidth, yearBins } from './shared';
import styles from './TopicLab.module.css';

type Props = { dataNote: string; map: TermMap; trends: Map<string, TermTrend>; theme: Theme; basket: string[]; onToggle: (key: string) => void; colorBy: 'cluster' | 'year'; clusterNames: string[] };

export default function WordCloud({ dataNote, map, trends, theme, basket, onToggle, colorBy, clusterNames }: Props) {
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  const [fontsReady, setFontsReady] = useState(0);
  const [tip, setTip] = useState<{ key: string; x: number; y: number; w: number } | null>(null);
  const [table, setTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) { clearMeasureCache(); setFontsReady(n => n + 1); } });
    return () => { alive = false; };
  }, []);
  // A small vocabulary gets a shorter frame instead of floating in empty space.
  const height = Math.round(Math.min(560, Math.max(300, width * .56 * Math.min(1, Math.sqrt(map.nodes.length / 90)))));
  const { placed, dropped } = useMemo(() => {
    if (!width) return { placed: [], dropped: [] };
    void fontsReady;
    const items = map.nodes.map(n => ({ key: n.key, label: n.label, weight: n.df }));
    const maxFont = Math.max(30, Math.min(64, width / 13));
    // Small vocabularies get a larger floor so the cloud fills its frame; the √ scaling is unchanged.
    const minFont = (width < 520 ? 11 : 12) + (items.length <= 60 ? 4 : 0);
    return layoutCloud(items, { width, height, minFont, maxFont, padding: 3, measure: (t, s) => ({ w: textWidth(t, s), h: s * 1.08 }) });
  }, [map, width, height, fontsReady]);
  const bins = useMemo(() => yearBins(theme, map.nodes.map(n => n.meanYear)), [theme, map]);
  const byKey = useMemo(() => new Map(map.nodes.map(n => [n.key, n])), [map]);
  const color = (key: string) => { const n = byKey.get(key)!; return colorBy === 'year' && bins ? bins.color(n.meanYear) : clusterColor(theme, n.cluster); };
  const tipNode = tip ? byKey.get(tip.key) : null;
  const ranked = useMemo(() => [...map.nodes].sort((a, b) => b.df - a.df || a.key.localeCompare(b.key)), [map]);
  const legendItems = colorBy === 'cluster'
    ? [...clusterNames.slice(0, MAX_CLUSTER_COLORS).map((name, i) => ({ color: clusterColor(theme, i), label: `${i + 1} ${name}` })), ...(clusterNames.length > MAX_CLUSTER_COLORS ? [{ color: clusterColor(theme, 99), label: `其余 ${clusterNames.length - MAX_CLUSTER_COLORS} 个小聚类` }] : []), ...(map.nodes.some(n => n.cluster < 0) ? [{ color: clusterColor(theme, -1), label: '未共现' }] : [])]
    : bins ? bins.labels.map((l, i) => ({ color: bins.colors[i], label: l })) : [];
  const exportCloud = () => { if (svgRef.current) exportSvgElement(svgRef.current, `关键词词云-${stamp()}.svg`, { title: '关键词词云', legend: legendItems, notes: [`字号按出现篇数的平方根缩放；颜色 = ${colorBy === 'cluster' ? '关键词聚类（Louvain）' : '平均发表年份'}。共 ${placed.length} 个词${dropped.length ? `，另有 ${dropped.length} 个低频词因版面不足未显示` : ''}。`, dataNote] }); };

  return <div ref={frameRef} className={styles.viewBody}>
    <div className={styles.viewTools}>
      <p className={styles.viewNote}>字号按出现篇数的平方根缩放（同字数时面积与篇数成正比）；悬停查看精确数字，点击加入选题篮。</p>
      <div className={styles.toolCluster}>
      {!table && <ExportButton onExport={exportCloud} />}
      <div className={styles.segmented} role="group" aria-label="词云呈现方式">
        <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>词云</button>
        <button type="button" aria-pressed={table} onClick={() => setTable(true)}>表格</button>
      </div>
      </div>
    </div>
    {!table && <div className={styles.cloudFrame} style={{ height: height || 360 }} onPointerLeave={() => setTip(null)}>
      {width > 0 && <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`关键词词云：显示 ${placed.length} 个词，最大的是 ${ranked.slice(0, 5).map(n => n.label).join('、')}`}>
        {placed.map(w => {
          const inBasket = basket.includes(w.key);
          return <g key={w.key} className={styles.cloudWord} data-active={tip?.key === w.key || undefined} onPointerMove={e => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ key: w.key, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }); }} onClick={() => onToggle(w.key)}>
            {inBasket && <rect data-export="skip" x={w.x - w.w / 2 - 4} y={w.y - w.h / 2 - 1} width={w.w + 8} height={w.h + 2} rx={4} className={styles.cloudPick} />}
            <text x={w.x} y={w.y} textAnchor="middle" dominantBaseline="central" fontSize={w.size} fontWeight={600} fontFamily={SANS} style={{ fill: color(w.key) }}>{w.label}</text>
          </g>;
        })}
      </svg>}
      <Tip at={tip}>{tipNode && <>
        <strong>{tipNode.label}</strong>
        <span>出现于 {fmtInt(tipNode.df)} 篇（{pct(tipNode.df / map.totalDocs)}）</span>
        <span>平均发表年份 {fmtYear(tipNode.meanYear)}</span>
        {tipNode.meanCitations !== null && <span>平均被引 {tipNode.meanCitations.toFixed(1)} 次（导出时）</span>}
        <span>{tipNode.cluster >= 0 ? `聚类 ${tipNode.cluster + 1}：${clusterNames[tipNode.cluster] ?? ''}` : '未与其他高频词共现'}</span>
        <span>{trendText(trends.get(tipNode.key))}</span>
        <em>{basket.includes(tipNode.key) ? '点击移出选题篮' : '点击加入选题篮'}</em>
      </>}</Tip>
    </div>}
    {!table && <div className={styles.legendRow}>
      {colorBy === 'cluster'
        ? <Legend title="颜色 = 关键词聚类" items={legendItems} />
        : bins && <Legend title="颜色 = 平均发表年份" items={legendItems} />}
      {dropped.length > 0 && <p className={styles.dropNote}>{dropped.length} 个低频词因版面不足未显示，见“表格”。</p>}
    </div>}
    {table && <TermTable map={map} trends={trends} basket={basket} onToggle={onToggle} ranked={ranked} clusterNames={clusterNames} theme={theme} />}
  </div>;
}

export function TermTable({ map, trends, basket, onToggle, ranked, clusterNames, theme }: { map: TermMap; trends: Map<string, TermTrend>; basket: string[]; onToggle: (key: string) => void; ranked: TermMap['nodes']; clusterNames: string[]; theme: Theme }) {
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <caption>按出现篇数排序的前 {ranked.length} 个词（共 {fmtInt(map.totalDocs)} 篇记录）</caption>
      <thead><tr><th scope="col">#</th><th scope="col">词</th><th scope="col">篇数</th><th scope="col">占比</th><th scope="col">平均年份</th><th scope="col">聚类</th><th scope="col">近三年趋势</th><th scope="col"><span className={styles.srOnly}>操作</span></th></tr></thead>
      <tbody>{ranked.map((n, i) => {
        const t = trends.get(n.key), inBasket = basket.includes(n.key);
        return <tr key={n.key}>
          <td>{i + 1}</td><th scope="row">{n.label}</th><td>{fmtInt(n.df)}</td><td>{pct(n.df / map.totalDocs)}</td><td>{fmtYear(n.meanYear)}</td>
          <td>{n.cluster >= 0 ? <><i className={styles.swatch} style={{ background: clusterColor(theme, n.cluster) }} />{n.cluster + 1} {clusterNames[n.cluster]}</> : '—'}</td>
          <td title={trendText(t)}>{trendGlyph(t)} {t ? (t.signal === 'insufficient' ? '样本不足' : t.signal === 'rising' ? '显著上升' : t.signal === 'falling' ? '显著下降' : '无显著变化') : '—'}</td>
          <td><button type="button" className={styles.linkButton} aria-pressed={inBasket} onClick={() => onToggle(n.key)}>{inBasket ? '移出选题篮' : '加入选题篮'}<span className={styles.srOnly}>：{n.label}</span></button></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
