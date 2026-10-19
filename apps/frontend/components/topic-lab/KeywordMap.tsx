'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { exportSvgElement, stamp } from './exportSvg';
import type { Theme } from '@/components/workbench/shell-kit';
import type { Burst } from '@/lib/topic-lab/burst';
import type { TermMap } from '@/lib/topic-lab/network';
import type { TermIndex } from '@/lib/topic-lab/terms';
import type { TermTrend } from '@/lib/topic-lab/trend';
import { ExportButton, Legend, MAX_CLUSTER_COLORS, PIVOT, SANS, Tip, qText, sText, ZoomControls, clusterColor, fmtInt, fmtYear, pct, recentHint, textWidth, trendText, svgPoint, useZoom, yearBins } from './shared';
import styles from './TopicLab.module.css';

type Props = { dataNote: string; map: TermMap; index: TermIndex; trends: Map<string, TermTrend>; bursts: Map<string, Burst>; lastYear: number | null; theme: Theme; basket: string[]; onToggle: (key: string) => void; colorBy: 'cluster' | 'year' };
const PAD = 36;

export default function KeywordMap({ dataNote, map, index, trends, bursts, lastYear, theme, basket, onToggle, colorBy }: Props) {
  const { frameRef, width, view: zv, handlers, zoomIn, zoomOut, reset, wasDrag } = useZoom();
  const [hover, setHover] = useState<{ i: number; x: number; y: number; w: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<'network' | 'timeline' | 'table'>('network');
  const [prune, setPrune] = useState(false);
  const [axis, setAxis] = useState<'mean' | 'first'>('mean');
  const [query, setQuery] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const nodes = map.nodes, maxDf = Math.max(1, ...nodes.map(n => n.df));
  // Narrow frames get proportionally smaller margins and nodes.
  const PADX = Math.max(24, Math.min(72, width * .08)), sz = Math.min(1, Math.max(.5, width / 900));
  const names = map.clusterInfo.map(c => c.label);
  const timeline = view === 'timeline';
  const links = timeline || prune ? map.backbone : map.links;
  const maxCount = Math.max(1, ...links.map(l => l.count));

  // Timeline: one lane per cluster (largest first), x = year the term first appears.
  const lanes = useMemo(() => {
    const shown = map.clusterInfo.slice(0, MAX_CLUSTER_COLORS).map(c => c.id);
    return { ids: shown, other: nodes.some(n => n.cluster < 0 || n.cluster >= MAX_CLUSTER_COLORS) };
  }, [map.clusterInfo, nodes]);
  const laneH = 64, axisH = 34;
  const height = timeline ? axisH + (lanes.ids.length + (lanes.other ? 1 : 0)) * laneH + 12 : Math.round(Math.min(640, Math.max(380, width * .62)));
  // Timeline x: the term's mean publication year (where its literature is centred), or the year it first
  // appears as CiteSpace places nodes. In long exports most frequent terms appear in the first year.
  const xOf = useCallback((n: TermMap['nodes'][number]) => axis === 'first' ? n.firstYear : n.meanYear, [axis]);
  const years = nodes.map(xOf).filter((y): y is number => y !== null);
  const y0 = years.length ? Math.floor(Math.min(...years)) : 0, y1 = Math.max(lastYear ?? 0, years.length ? Math.ceil(Math.max(...years)) : 0);
  const labelRoom = timeline ? Math.min(150, width * .22) : 0;
  const xYear = useCallback((y: number) => PADX + (y1 > y0 ? (y - y0) / (y1 - y0) : .5) * (width - PADX * 2 - labelRoom), [y0, y1, width, labelRoom, PADX]);
  const pos = useMemo(() => {
    if (!timeline) return nodes.map(n => ({ x: PADX + n.x * (width - PADX * 2), y: PAD + n.y * (height - PAD * 2) }));
    const laneOf = (c: number) => { const i = lanes.ids.indexOf(c); return i >= 0 ? i : lanes.ids.length; };
    const slots = new Map<string, number>();
    return nodes.map(n => {
      const x = xOf(n) ?? y0, lane = laneOf(n.cluster), key = `${lane}:${Math.round(x * 2)}`, k = slots.get(key) ?? 0; slots.set(key, k + 1);
      const offset = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 13;
      return { x: xYear(x), y: axisH + lane * laneH + laneH / 2 + Math.max(-laneH / 2 + 8, Math.min(laneH / 2 - 8, offset)) };
    });
  }, [nodes, width, height, timeline, lanes, y0, xYear, xOf, PADX]);
  const { k, x: tx, y: ty } = zv;
  const radius = useCallback((df: number) => (timeline ? 3 + 11 * Math.sqrt(df / maxDf) : 4 + 20 * Math.sqrt(df / maxDf)) * sz / Math.sqrt(k), [timeline, maxDf, k, sz]);
  const bins = useMemo(() => yearBins(theme, nodes.map(n => n.meanYear)), [theme, nodes]);
  const color = (i: number) => colorBy === 'year' && bins ? bins.color(nodes[i].meanYear) : clusterColor(theme, nodes[i].cluster);
  const focus = selected ?? hover?.i ?? null;
  const neighbours = useMemo(() => {
    const set = new Set<number>(); if (focus === null) return set;
    for (const l of links) { if (l.a === focus) set.add(l.b); if (l.b === focus) set.add(l.a); }
    return set;
  }, [focus, links]);

  const labels = useMemo(() => {
    if (!width) return [];
    const order = nodes.map((_, i) => i).sort((a, b) => {
      const pa = a === focus ? 2 : neighbours.has(a) ? 1 : 0, pb = b === focus ? 2 : neighbours.has(b) ? 1 : 0;
      return pb - pa || nodes[b].df - nodes[a].df;
    });
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [], out: Array<{ i: number; size: number }> = [];
    for (const i of order) {
      const size = Math.round((timeline ? 10.5 : 11) + (timeline ? 3 : 6) * Math.sqrt(nodes[i].df / maxDf));
      const sx = pos[i].x * k + tx, sy = pos[i].y * k + ty + (timeline ? radius(nodes[i].df) * k + size * .7 : 0), w = textWidth(nodes[i].label, size, 600) + 6, h = size * 1.2;
      if (sx < -w / 2 || sx > width + w / 2 || sy < 0 || sy > height) continue;
      if (i !== focus && boxes.some(b => Math.abs(b.x - sx) * 2 < b.w + w && Math.abs(b.y - sy) * 2 < b.h + h)) continue;
      boxes.push({ x: sx, y: sy, w, h }); out.push({ i, size });
    }
    return out;
  }, [nodes, pos, k, tx, ty, width, height, maxDf, focus, neighbours, timeline, radius]);

  const sel = selected !== null ? nodes[selected] : null;
  const coTerms = useMemo(() => {
    if (selected === null) return [];
    const key = nodes[selected].key, others = new Map(nodes.map((n, i) => [n.key, i])), counts = new Map<number, number>();
    for (const d of index.docs) if (d.includes(key)) for (const t of d) { const j = others.get(t); if (j !== undefined && j !== selected) counts.set(j, (counts.get(j) ?? 0) + 1); }
    return [...counts].map(([j, c]) => ({ j, c, s: c * map.totalDocs / (nodes[selected].df * nodes[j].df) })).sort((a, b) => b.c - a.c || b.s - a.s).slice(0, 10);
  }, [selected, nodes, index.docs, map.totalDocs]);
  const clusterRows = useMemo(() => map.clusterInfo.map(c => ({ ...c, members: nodes.filter(n => n.cluster === c.id).sort((a, b) => b.df - a.df) })), [map.clusterInfo, nodes]);
  const isolated = nodes.filter(n => n.cluster < 0);
  const pivots = nodes.filter(n => n.centrality >= PIVOT).length;
  const pick = (label: string) => { const i = nodes.findIndex(n => n.label === label || n.key === label); if (i >= 0) { setSelected(i); setQuery(''); } };
  const burstOf = (key: string) => bursts.get(key);
  const live = (b: Burst | undefined) => !!b && lastYear !== null && b.end >= lastYear;
  const legendItems = [
    ...(colorBy === 'cluster' || !bins
      ? [...names.slice(0, MAX_CLUSTER_COLORS).map((name, i) => ({ color: clusterColor(theme, i), label: `#${i + 1} ${name}` })), ...(names.length > MAX_CLUSTER_COLORS ? [{ color: clusterColor(theme, 99), label: `其余 ${names.length - MAX_CLUSTER_COLORS} 个小聚类` }] : [])]
      : bins.labels.map((l, i) => ({ color: bins.colors[i], label: `平均年份 ${l}` }))),
    ...(pivots ? [{ color: 'var(--tl-pivot)', label: `枢纽词（中介中心性 ≥ ${PIVOT}）`, ring: true }] : []),
    ...(nodes.some(n => bursts.has(n.key)) ? [{ color: 'var(--tl-burst)', label: '有突现期（实线 = 延续至最新年份）', ring: true }] : []),
  ];
  const exportMap = () => {
    const svg = svgRef.current; if (!svg) return;
    const cs = getComputedStyle(svg), resolve = (c: string) => c.startsWith('var(') ? cs.getPropertyValue(c.slice(4, -1)).trim() : c;
    exportSvgElement(svg, `${timeline ? '关键词时间线' : '关键词共现网络'}-${stamp()}.svg`, {
      title: timeline ? `关键词聚类时间线（横轴：${axis === 'first' ? '首次出现年份' : '平均发表年份'}）` : '关键词共现网络',
      legend: legendItems.map(l => ({ ...l, color: resolve(l.color) })),
      notes: [`${nodes.length} 个词、${map.clusters} 个聚类；模块度 Q = ${map.modularity.toFixed(3)}，平均轮廓值 S = ${map.silhouette.toFixed(3)}。圆面积随出现篇数增大；连线为${timeline || prune ? ' Pathfinder 剪枝后的骨干共现' : '共现（前 ' + links.length + ' 条）'}，线宽随共现篇数增加。${timeline ? '' : '位置相近表示联系紧密，坐标轴无含义。'}`, dataNote],
    });
  };
  const edgePath = (a: number, b: number) => {
    if (!timeline) return `M${pos[a].x} ${pos[a].y}L${pos[b].x} ${pos[b].y}`;
    const mx = (pos[a].x + pos[b].x) / 2, my = Math.min(pos[a].y, pos[b].y) - Math.abs(pos[a].x - pos[b].x) * .18 - 6;
    return `M${pos[a].x} ${pos[a].y}Q${mx} ${my} ${pos[b].x} ${pos[b].y}`;
  };

  return <div className={styles.viewBody}>
    <div className={styles.metricsBar}>
      <span><b>{nodes.length}</b> 个词 · <b>{fmtInt(map.totalLinks)}</b> 条共现</span>
      <span title="Newman 模块度：聚类内部连线相对随机期望的富集程度">模块度 Q = <b>{map.modularity.toFixed(3)}</b><small>{qText(map.modularity)}</small></span>
      <span title="轮廓值：每个词与本聚类的相似度减去与最近其他聚类的相似度">平均轮廓值 S = <b>{map.silhouette.toFixed(3)}</b><small>{sText(map.silhouette)}</small></span>
      <span title="在 Pathfinder 剪枝后的网络上计算的中介中心性">枢纽词 <b>{pivots}</b><small>中介中心性 ≥ {PIVOT}</small></span>
    </div>
    <div className={styles.viewTools}>
      <p className={styles.viewNote}>{timeline
        ? <>时间线视图（借鉴 CiteSpace）：每条横道是一个聚类，词落在它的{axis === 'first' ? <strong>首次出现年份</strong> : <strong>平均发表年份</strong>}；连线为 Pathfinder 剪枝后的骨干共现。可以看出每个方向何时兴起、重心是否在向近年移动。</>
        : <>圆的面积随出现篇数增大；两个词出现在同一篇文献中即连线，线越粗共现越多；位置相近表示联系紧密，坐标轴本身没有含义。按住 Ctrl/⌘ 滚动缩放，拖动平移。</>}
        {' '}<span className={styles.ringKey}><i className={styles.ringPivot} />紫圈 = 枢纽词</span> <span className={styles.ringKey}><i className={styles.ringBurst} />红圈 = 有突现期</span></p>
      <div className={styles.toolCluster}>
        <label className={styles.searchField}><span className={styles.srOnly}>查找关键词</span><input list="tl-map-terms" value={query} placeholder="查找关键词" onChange={e => { setQuery(e.target.value); pick(e.target.value); }} /></label>
        <datalist id="tl-map-terms">{nodes.map(n => <option key={n.key} value={n.label} />)}</datalist>
        <div className={styles.segmented} role="group" aria-label="共现图呈现方式">
          <button type="button" aria-pressed={view === 'network'} onClick={() => { setView('network'); reset(); }}>网络</button>
          <button type="button" aria-pressed={view === 'timeline'} onClick={() => { setView('timeline'); reset(); }}>时间线</button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>聚类表</button>
        </div>
        {timeline && <label className={styles.inlineField}>横轴<select value={axis} onChange={e => setAxis(e.target.value as 'mean' | 'first')}><option value="mean">平均发表年份</option><option value="first">首次出现年份（CiteSpace）</option></select></label>}
        {view !== 'table' && <ExportButton onExport={exportMap} />}
        {view === 'network' && <label className={styles.checkLine}><input type="checkbox" checked={prune} onChange={e => setPrune(e.target.checked)} />只显示 Pathfinder 骨干连线</label>}
      </div>
    </div>
    {view !== 'table' && <div className={styles.mapLayout}>
      <div className={styles.mapFrame} ref={frameRef} style={{ height, touchAction: k > 1 ? 'none' : 'pan-y' }} {...handlers} onPointerLeave={() => setHover(null)} onClick={() => { if (!wasDrag()) setSelected(null); }}>
        {width > 0 && <svg ref={svgRef} width={width} height={height} role="img" aria-label={timeline ? `关键词时间线：${lanes.ids.length} 个聚类，${y0}–${y1} 年` : `关键词共现网络：${nodes.length} 个词，${map.clusters} 个聚类，显示 ${links.length} 条连线`}>
          {timeline && <g className={styles.timeAxis}>
            {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).filter((y, i, all) => all.length <= 16 || (y - y0) % 2 === 0).map(y => <g key={y}><line x1={xYear(y) * k + tx} x2={xYear(y) * k + tx} y1={axisH - 6} y2={height} /><text x={xYear(y) * k + tx} y={axisH - 12} textAnchor="middle" fontFamily={SANS}>{y}</text></g>)}
            {lanes.ids.map((c, i) => <g key={c}><rect data-export="skip" x={0} y={(axisH + i * laneH) * k + ty} width={width} height={laneH * k} className={i % 2 ? styles.laneOdd : styles.laneEven} /><text x={width - 8} y={(axisH + (i + .5) * laneH) * k + ty} textAnchor="end" dominantBaseline="central" fontFamily={SANS} className={styles.laneLabel} style={{ fill: clusterColor(theme, c) }}>#{c + 1} {names[c]}</text></g>)}
            {lanes.other && <text x={width - 8} y={(axisH + (lanes.ids.length + .5) * laneH) * k + ty} textAnchor="end" dominantBaseline="central" fontFamily={SANS} className={styles.laneLabel}>其他</text>}
          </g>}
          <g transform={`translate(${tx} ${ty}) scale(${k})`}>
            <g className={styles.links}>{links.map((l, idx) => {
              const on = focus !== null && (l.a === focus || l.b === focus);
              return <path key={idx} d={edgePath(l.a, l.b)} fill="none" vectorEffect="non-scaling-stroke"
                strokeWidth={.6 + 3 * l.count / maxCount} style={{ stroke: on ? color(focus!) : undefined, opacity: focus === null ? .16 + .5 * l.count / maxCount : on ? .85 : .04 }} />;
            })}</g>
            <g>{nodes.map((n, i) => {
              const dim = focus !== null && i !== focus && !neighbours.has(i), rr = radius(n.df), b = burstOf(n.key);
              return <g key={n.key} style={{ opacity: dim ? .18 : 1 }}>
                {n.centrality >= PIVOT && <circle cx={pos[i].x} cy={pos[i].y} r={rr + 3.5 / k} className={styles.pivotRing} strokeWidth={2.5 / k} />}
                {b && <circle cx={pos[i].x} cy={pos[i].y} r={rr + (n.centrality >= PIVOT ? 6.5 : 3.5) / k} className={styles.burstRing} strokeWidth={(live(b) ? 2.5 : 1.5) / k} strokeDasharray={live(b) ? undefined : `${3 / k} ${2 / k}`} />}
                <circle cx={pos[i].x} cy={pos[i].y} r={rr} className={styles.mapNode} data-basket={basket.includes(n.key) || undefined} style={{ fill: color(i) }} vectorEffect="non-scaling-stroke"
                  onPointerMove={e => setHover({ i, ...svgPoint(e) })}
                  onClick={e => { e.stopPropagation(); if (!wasDrag()) setSelected(s => s === i ? null : i); }} />
              </g>;
            })}</g>
            <g className={styles.mapLabels}>{labels.map(({ i, size }) => {
              const dim = focus !== null && i !== focus && !neighbours.has(i);
              return <text key={nodes[i].key} x={pos[i].x} y={pos[i].y + (timeline ? radius(nodes[i].df) + size * .7 / k : 0)} fontSize={size / k} fontFamily={SANS} fontWeight={i === focus ? 800 : 600} textAnchor="middle" dominantBaseline="central" style={{ opacity: dim ? .25 : 1, strokeWidth: 3 / k }}>{nodes[i].label}</text>;
            })}</g>
          </g>
        </svg>}
        <ZoomControls view={zv} onIn={zoomIn} onOut={zoomOut} onReset={reset} label={timeline ? '时间线' : '共现图'} />
        <Tip at={hover && selected === null ? hover : null}>{hover && <>
          <strong>{nodes[hover.i].label}</strong>
          <span>出现于 {fmtInt(nodes[hover.i].df)} 篇 · 首次 {nodes[hover.i].firstYear ?? '—'} · 平均年份 {fmtYear(nodes[hover.i].meanYear)}</span>
          <span>中介中心性 {nodes[hover.i].centrality.toFixed(3)}{nodes[hover.i].centrality >= PIVOT ? '（枢纽词）' : ''}</span>
          {burstOf(nodes[hover.i].key) && <span>突现期 {burstOf(nodes[hover.i].key)!.begin}–{burstOf(nodes[hover.i].key)!.end}{live(burstOf(nodes[hover.i].key)) ? '（延续至最新年份）' : ''}</span>}
          <em>点击查看共现明细</em>
        </>}</Tip>
      </div>
      <aside className={styles.mapAside} aria-live="polite">
        {sel ? <>
          <div className={styles.asideHead}><i className={styles.swatch} style={{ background: color(selected!) }} /><h4>{sel.label}</h4><button type="button" className={styles.closeButton} onClick={() => setSelected(null)} aria-label="关闭明细">×</button></div>
          <dl className={styles.factList}>
            <div><dt>出现篇数</dt><dd>{fmtInt(sel.df)}（{pct(sel.df / map.totalDocs)}）</dd></div>
            <div><dt>首次出现 · 平均年份</dt><dd>{sel.firstYear ?? '—'} · {fmtYear(sel.meanYear)}</dd></div>
            {sel.meanCitations !== null && <div><dt>平均被引（导出时）</dt><dd>{sel.meanCitations.toFixed(1)}</dd></div>}
            <div><dt>所属聚类</dt><dd>{sel.cluster >= 0 ? `#${sel.cluster + 1} ${names[sel.cluster]}（轮廓值 ${sel.silhouette.toFixed(2)}）` : '未与其他高频词共现'}</dd></div>
            <div><dt>中介中心性</dt><dd>{sel.centrality.toFixed(3)}{sel.centrality >= PIVOT ? ' · 枢纽词：连接不同方向' : ''}</dd></div>
            <div><dt>突现</dt><dd>{burstOf(sel.key) ? `${burstOf(sel.key)!.begin}–${burstOf(sel.key)!.end}，强度 ${burstOf(sel.key)!.strength.toFixed(2)}${live(burstOf(sel.key)) ? '，延续至最新年份' : ''}` : '未检测到突现期'}</dd></div>
            <div><dt>近三年趋势</dt><dd>{trendText(trends.get(sel.key))}</dd></div>
          </dl>
          <button type="button" className={styles.primaryButton} aria-pressed={basket.includes(sel.key)} onClick={() => onToggle(sel.key)}>{basket.includes(sel.key) ? '移出选题篮' : '加入选题篮'}</button>
          <h5>最常一起出现的词</h5>
          {coTerms.length ? <ol className={styles.coList}>{coTerms.map(t => <li key={t.j}><button type="button" onClick={() => setSelected(t.j)}>{nodes[t.j].label}</button><span>{t.c} 篇</span><small title="关联强度：实际共现次数与两词独立出现时预期共现次数之比；大于 1 表示比随机更常同时出现">强度 {t.s.toFixed(2)}</small></li>)}</ol> : <p className={styles.muted}>没有与其他高频词同时出现。</p>}
        </> : <>
          <h4>聚类</h4>
          <p className={styles.muted}>Louvain 模块度聚类，按词频之和排序；聚类名取自其中出现最多的词，不是人工命名。</p>
          <ul className={styles.clusterList}>{clusterRows.map(r => <li key={r.id}><i className={styles.swatch} style={{ background: clusterColor(theme, r.id) }} /><div><strong>#{r.id + 1} {r.label}</strong><small>{r.size} 个词 · S = {r.silhouette.toFixed(2)} · 平均年份 {fmtYear(r.meanYear)}</small><small>{r.members.slice(0, 5).map(m => m.label).join('、')}{r.members.length > 5 ? '…' : ''}</small></div></li>)}</ul>
          {isolated.length > 0 && <p className={styles.muted}>{isolated.length} 个词未与其他高频词共现，单独显示。</p>}
        </>}
      </aside>
    </div>}
    {view !== 'table' && <div className={styles.legendRow}>
      {colorBy === 'cluster'
        ? <Legend title="颜色 = 聚类" items={[...names.slice(0, MAX_CLUSTER_COLORS).map((name, i) => ({ color: clusterColor(theme, i), label: `#${i + 1} ${name}` })), ...(names.length > MAX_CLUSTER_COLORS ? [{ color: clusterColor(theme, 99), label: `其余 ${names.length - MAX_CLUSTER_COLORS} 个小聚类` }] : [])]} />
        : bins && <Legend title={`颜色 = 该词所在文献的平均发表年份（${recentHint(theme)}）`} items={bins.labels.map((l, i) => ({ color: bins.colors[i], label: l }))} />}
    </div>}
    {view === 'table' && <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>{map.clusters} 个聚类、{nodes.length} 个词（出现 ≥ {map.minDf} 篇）· Q = {map.modularity.toFixed(3)} · S = {map.silhouette.toFixed(3)}</caption>
        <thead><tr><th scope="col">聚类</th><th scope="col">词数</th><th scope="col">轮廓值</th><th scope="col">平均年份</th><th scope="col">成员（篇数）</th></tr></thead>
        <tbody>{clusterRows.map(r => <tr key={r.id}><th scope="row"><i className={styles.swatch} style={{ background: clusterColor(theme, r.id) }} />#{r.id + 1} {r.label}</th><td>{r.size}</td><td>{r.silhouette.toFixed(2)}</td><td>{fmtYear(r.meanYear)}</td><td>{r.members.map(m => `${m.label}（${m.df}）`).join('、')}</td></tr>)}
          {isolated.length > 0 && <tr><th scope="row">未共现</th><td>{isolated.length}</td><td>—</td><td>—</td><td>{isolated.map(m => `${m.label}（${m.df}）`).join('、')}</td></tr>}</tbody>
      </table>
    </div>}
  </div>;
}
