'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { exportSvgElement, stamp } from './exportSvg';
import type { Theme } from '@/components/workbench/shell-kit';
import type { TermMap } from '@/lib/topic-lab/network';
import type { TermTrend } from '@/lib/topic-lab/trend';
import { layoutCloud } from '@/lib/topic-lab/wordcloud';
import {
  CLOUD_SHAPES,
  cloudShapeAspectRatio,
  cloudShapePath,
  inferAgentCloudShape,
  type CloudAppearance,
} from '@/lib/topic-lab/cloud-shapes';
import WordCloudAppearance from './WordCloudAppearance';
import { ExportButton, Legend, MAX_CLUSTER_COLORS, SANS, Tip, clearMeasureCache, clusterColor, fmtInt, fmtYear, pct, textWidth, trendGlyph, trendText, useElementWidth, yearBins } from './shared';
import styles from './TopicLab.module.css';
import appearanceStyles from './WordCloudAppearance.module.css';

type Props = { dataNote: string; map: TermMap; trends: Map<string, TermTrend>; theme: Theme; basket: string[]; onToggle: (key: string) => void; colorBy: 'cluster' | 'year'; clusterNames: string[]; appearance: CloudAppearance; onAppearanceChange: (value: CloudAppearance) => void; projectPalette?: { title: string; colors: readonly string[] } };
const HEX = /^#[0-9a-f]{6}$/i;
function luminance(color: string) {
  const channels = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

export default function WordCloud({ dataNote, map, trends, theme, basket, onToggle, colorBy, clusterNames, appearance, onAppearanceChange, projectPalette }: Props) {
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  const [fontsReady, setFontsReady] = useState(0);
  const [tip, setTip] = useState<{ key: string; x: number; y: number; w: number } | null>(null);
  const [table, setTable] = useState(false);
  const [chartSurface, setChartSurface] = useState('');
  const [autoRecognize, setAutoRecognize] = useState(() => appearance.shape === 'free' && !appearance.customMask);
  const svgRef = useRef<SVGSVGElement>(null);
  const auraId = `wc-aura-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) { clearMeasureCache(); setFontsReady(n => n + 1); } });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (frameRef.current && projectPalette) setChartSurface(getComputedStyle(frameRef.current).getPropertyValue('--wb-solid').trim());
  }, [frameRef, theme, projectPalette]);

  const recognition = useMemo(
    () => inferAgentCloudShape(map.nodes.map(n => ({ label: n.label, weight: n.df })), dataNote),
    [map.nodes, dataNote],
  );
  const activeAuto = autoRecognize && appearance.shape === 'free' && !appearance.customMask;
  const effectiveAppearance: CloudAppearance = useMemo(
    () => activeAuto ? { ...appearance, shape: recognition.shape, outline: true } : appearance,
    [activeAuto, appearance, recognition.shape],
  );

  // Free layout preserves the previous viewport. Shaped layouts get room for their natural ratio.
  const height = effectiveAppearance.shape === 'free'
    ? Math.round(Math.min(560, Math.max(300, width * .56 * Math.min(1, Math.sqrt(map.nodes.length / 90)))))
    : Math.round(Math.min(720, Math.max(360, width / cloudShapeAspectRatio(effectiveAppearance))));
  const shapeName = effectiveAppearance.customMask?.label ?? CLOUD_SHAPES.find(shape => shape.id === effectiveAppearance.shape)?.label ?? '自由布局';
  const { placed, dropped } = useMemo(() => {
    if (!width) return { placed: [], dropped: [] };
    void fontsReady;
    const items = map.nodes.map(n => ({ key: n.key, label: n.label, weight: n.df }));
    const maxFont = Math.max(30, Math.min(64, width / 13));
    // Small vocabularies get a larger floor so the cloud fills its frame; the √ scaling is unchanged.
    const minFont = (width < 520 ? 11 : 12) + (items.length <= 60 ? 4 : 0);
    const shaped = effectiveAppearance.shape !== 'free';
    // Canvas width measures advances, while SVG fallback fonts may extend beyond the nominal em.
    // Reserve extra bearings around shaped text so a glyph never touches the silhouette edge.
    return layoutCloud(items, { width, height, minFont, maxFont, appearance: effectiveAppearance, measure: (t, s) => ({ w: textWidth(t, s) + (shaped ? 2 : 0), h: s * (shaped ? 1.36 : 1.08) + (shaped ? 2 : 0) }) });
  }, [map, width, height, fontsReady, effectiveAppearance]);
  const outlinePath = useMemo(() => width && effectiveAppearance.shape !== 'free' && effectiveAppearance.outline ? cloudShapePath(effectiveAppearance, width, height) : '', [effectiveAppearance, width, height]);
  const bins = useMemo(() => yearBins(theme, map.nodes.map(n => n.meanYear)), [theme, map]);
  const byKey = useMemo(() => new Map(map.nodes.map(n => [n.key, n])), [map]);
  const palette = useMemo(() => {
    if (colorBy !== 'cluster' || !projectPalette) return [];
    const surface = luminance(HEX.test(chartSurface) ? chartSurface : theme === 'dark' ? '#212125' : '#fffefa');
    return [...new Set(projectPalette.colors.filter(c => HEX.test(c)).map(c => c.toLowerCase()))].filter(c => {
      const l = luminance(c); return (Math.max(l, surface) + .05) / (Math.min(l, surface) + .05) >= 4.5;
    }).slice(0, MAX_CLUSTER_COLORS);
  }, [chartSurface, colorBy, projectPalette, theme]);
  const neutral = palette.length ? theme === 'dark' ? '#aeb9c4' : '#526272' : clusterColor(theme, -1);
  const clusterInk = (id: number) => palette.length ? palette[id] ?? neutral : clusterColor(theme, id);
  const color = (key: string) => { const n = byKey.get(key)!; return colorBy === 'year' && bins ? bins.color(n.meanYear) : clusterInk(n.cluster); };
  const tipNode = tip ? byKey.get(tip.key) : null;
  const ranked = useMemo(() => [...map.nodes].sort((a, b) => b.df - a.df || a.key.localeCompare(b.key)), [map]);
  const clusterSlots = palette.length || MAX_CLUSTER_COLORS, groupedClusters = Math.max(0, clusterNames.length - clusterSlots), hasUnconnected = map.nodes.some(n => n.cluster < 0);
  const sharedLabel = [groupedClusters ? `其余 ${groupedClusters} 组` : '', hasUnconnected ? '未共现' : ''].filter(Boolean).join('及');
  const colorTitle = palette.length ? `关键词聚类 · ${projectPalette!.title}` : '关键词聚类';
  const legendItems = colorBy === 'cluster'
    ? [...clusterNames.slice(0, clusterSlots).map((name, i) => ({ color: clusterInk(i), label: `${i + 1} ${name}` })), ...(sharedLabel ? [{ color: neutral, label: sharedLabel }] : [])]
    : bins ? bins.labels.map((l, i) => ({ color: bins.colors[i], label: l })) : [];
  const exportCloud = () => { if (svgRef.current && placed.length) exportSvgElement(svgRef.current, `关键词词云-${stamp()}.svg`, { title: '关键词词云', legend: legendItems, notes: [`字号随出现篇数增大；颜色 = ${colorBy === 'cluster' ? colorTitle : '平均发表年份'}。共 ${placed.length} 个词${dropped.length ? `，另有 ${dropped.length} 个词未能放入当前版面` : ''}。`, `形状：${shapeName}${activeAuto ? `（Agent 自动识形 · ${recognition.domain}）` : ''}；方向：${effectiveAppearance.shape === 'free' || effectiveAppearance.shape === 'circle' ? '—' : effectiveAppearance.orientation === 'horizontal' ? '横向' : '纵向'}；间距：${({ compact: '紧凑', standard: '标准', relaxed: '舒展' })[effectiveAppearance.spacing]}。`, dataNote] }); };
  const primaryGlowInk = palette[0] ?? clusterInk(0);

  return <div ref={frameRef} className={styles.viewBody}>
    <div className={styles.viewTools}>
      <p className={styles.viewNote}>字号随出现篇数增大，点击词语可加入选题篮；Agent 已自动按研究领域识别词云轮廓。</p>
      <div className={styles.toolCluster}>
      {!table && placed.length > 0 && <ExportButton onExport={exportCloud} />}
      <div className={styles.segmented} role="group" aria-label="词云呈现方式">
        <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>词云</button>
        <button type="button" aria-pressed={table} onClick={() => setTable(true)}>表格</button>
      </div>
      </div>
    </div>
    {!table && <WordCloudAppearance
      value={effectiveAppearance}
      recognition={recognition}
      autoRecognize={activeAuto}
      onToggleAuto={next => {
        setTip(null);
        setAutoRecognize(next);
        if (next) {
          const { customMask: _m, ...rest } = appearance;
          void _m;
          onAppearanceChange({ ...rest, shape: 'free', outline: true });
        } else {
          onAppearanceChange({ ...appearance, shape: 'free' });
        }
      }}
      onChange={value => { setTip(null); onAppearanceChange(value); }}
    />}
    {!table && <div className={styles.cloudFrame} style={{ height: height || 360 }} onPointerLeave={() => setTip(null)}>
      <div className={appearanceStyles.agentHud} aria-hidden="true">
        <span>✨ {activeAuto ? 'Agent 自动识形' : effectiveAppearance.customMask ? 'AI 语义构形' : '轮廓布局'}</span>
        <b>{shapeName}</b>
        {activeAuto && <span>· {recognition.domain} ({recognition.confidence}%)</span>}
      </div>
      {width > 0 && <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`关键词词云：${shapeName}，显示 ${placed.length} 个词${placed.length ? `，较大的词有 ${placed.slice(0, 5).map(n => n.label).join('、')}` : ''}`}>
        <defs>
          <radialGradient id={auraId} cx="50%" cy="50%" r="54%">
            <stop offset="0%" stopColor={primaryGlowInk} stopOpacity="0.16" />
            <stop offset="72%" stopColor={primaryGlowInk} stopOpacity="0.06" />
            <stop offset="100%" stopColor={primaryGlowInk} stopOpacity="0" />
          </radialGradient>
        </defs>
        {outlinePath && <path d={outlinePath} fill={`url(#${auraId})`} fillRule="evenodd" aria-hidden="true" />}
        {outlinePath && <path className={appearanceStyles.outlineDashed} d={outlinePath} style={palette.length ? { stroke: palette[0] } : undefined} fillRule="evenodd" aria-hidden="true" />}
        {outlinePath && <path className={appearanceStyles.outline} d={outlinePath} style={palette.length ? { stroke: palette[0] } : undefined} fillRule="evenodd" aria-hidden="true" />}
        {placed.map((w, idx) => {
          const inBasket = basket.includes(w.key);
          const tierWeight = idx < Math.max(3, Math.ceil(placed.length * 0.1)) ? 800 : idx < Math.ceil(placed.length * 0.35) ? 700 : 600;
          const tierOpacity = idx < Math.max(3, Math.ceil(placed.length * 0.1)) ? 1 : idx < Math.ceil(placed.length * 0.35) ? 0.94 : 0.85;
          return <g key={w.key} className={styles.cloudWord} data-active={tip?.key === w.key || undefined} onPointerMove={e => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ key: w.key, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }); }} onClick={() => onToggle(w.key)}>
            {inBasket && <rect data-export="skip" x={w.x - w.w / 2 - 4} y={w.y - w.h / 2 - 1} width={w.w + 8} height={w.h + 2} rx={4} className={styles.cloudPick} />}
            <text x={w.x} y={w.y} textAnchor="middle" dominantBaseline="central" fontSize={w.size} fontWeight={tierWeight} fontFamily={SANS} style={{ fill: color(w.key), opacity: tierOpacity }}>{w.label}</text>
          </g>;
        })}
      </svg>}
      {width > 0 && !placed.length && <div className={appearanceStyles.empty} role="status">当前尺寸放不下这些词。{effectiveAppearance.shape !== 'free' && <button type="button" onClick={() => { setAutoRecognize(false); onAppearanceChange({ ...appearance, shape: 'free' }); }}>返回自由布局</button>}</div>}
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
        ? <Legend title={`颜色 = ${colorTitle}`} items={legendItems} />
        : bins && <Legend title="颜色 = 平均发表年份" items={legendItems} />}
    </div>}
    {!table && (effectiveAppearance.shape !== 'free' || dropped.length > 0) && <div className={appearanceStyles.status}><span>已显示 {placed.length} / {map.nodes.length} 个词{dropped.length > 0 ? ' · 可减少显示词数或改用更宽的轮廓' : ''}</span><button type="button" onClick={() => setTable(true)}>查看全部词频</button></div>}
    {table && <TermTable map={map} trends={trends} basket={basket} onToggle={onToggle} ranked={ranked} clusterNames={clusterNames} theme={theme} clusterInk={clusterInk} />}
  </div>;
}

export function TermTable({ map, trends, basket, onToggle, ranked, clusterNames, theme, clusterInk }: { map: TermMap; trends: Map<string, TermTrend>; basket: string[]; onToggle: (key: string) => void; ranked: TermMap['nodes']; clusterNames: string[]; theme: Theme; clusterInk?: (cluster: number) => string }) {
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <caption>按出现篇数排序的前 {ranked.length} 个词（共 {fmtInt(map.totalDocs)} 篇记录）</caption>
      <thead><tr><th scope="col">#</th><th scope="col">词</th><th scope="col">篇数</th><th scope="col">占比</th><th scope="col">平均年份</th><th scope="col">聚类</th><th scope="col">近三年趋势</th><th scope="col"><span className={styles.srOnly}>操作</span></th></tr></thead>
      <tbody>{ranked.map((n, i) => {
        const t = trends.get(n.key), inBasket = basket.includes(n.key);
        return <tr key={n.key}>
          <td>{i + 1}</td><th scope="row">{n.label}</th><td>{fmtInt(n.df)}</td><td>{pct(n.df / map.totalDocs)}</td><td>{fmtYear(n.meanYear)}</td>
          <td>{n.cluster >= 0 ? <><i className={styles.swatch} style={{ background: clusterInk?.(n.cluster) ?? clusterColor(theme, n.cluster) }} />{n.cluster + 1} {clusterNames[n.cluster]}</> : '—'}</td>
          <td title={trendText(t)}>{trendGlyph(t)} {t ? (t.signal === 'insufficient' ? '样本不足' : t.signal === 'rising' ? '显著上升' : t.signal === 'falling' ? '显著下降' : '无显著变化') : '—'}</td>
          <td><button type="button" className={styles.linkButton} aria-pressed={inBasket} onClick={() => onToggle(n.key)}>{inBasket ? '移出选题篮' : '加入选题篮'}<span className={styles.srOnly}>：{n.label}</span></button></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
