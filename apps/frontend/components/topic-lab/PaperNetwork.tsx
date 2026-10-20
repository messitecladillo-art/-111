'use client';

import { useMemo, useRef, useState } from 'react';
import { exportSvgElement, stamp } from './exportSvg';
import type { Theme } from '@/components/workbench/shell-kit';
import type { LitRecord } from '@/lib/topic-lab/parse';
import { cocitationGraph, paperGraph, topCitedReferences } from '@/lib/topic-lab/papers';
import type { TermIndex } from '@/lib/topic-lab/terms';
import { ExportButton, Legend, PIVOT, SANS, Tip, recentHint, ZoomControls, fmtInt, textWidth, svgPoint, useZoom, yearBins } from './shared';
import styles from './TopicLab.module.css';

type Props = { dataNote: string; records: LitRecord[]; index: TermIndex; theme: Theme; basket: string[]; basketLabels: string[] };
const PAD = 40;

const padX = (w: number) => Math.max(24, Math.min(64, w * .07));
const sizeScale = (w: number) => Math.min(1, Math.max(.55, w / 900));

/** "Collins 2007": first author's family name (or full CJK name) and year, as Connected Papers labels nodes. */
export function paperLabel(r: LitRecord): string {
  const a = r.authors[0] ?? '';
  const name = /\p{Script=Han}/u.test(a) ? a : a.split(/[,\s]+/)[0];
  return `${name || r.title.slice(0, 8)}${r.year ? ` ${r.year}` : ''}`;
}

function CouplingMap({ dataNote, records, index, theme, basket, basketLabels }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { frameRef, width, view: zv, handlers, zoomIn, zoomOut, reset, wasDrag } = useZoom();
  const [useBasket, setUseBasket] = useState(true);
  const [hover, setHover] = useState<{ i: number; x: number; y: number; w: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const focus = useMemo(() => useBasket ? basket : [], [useBasket, basket]);
  const graph = useMemo(() => paperGraph(records, index.docs, { focus, max: 120 }), [records, index.docs, focus]);
  const cited = useMemo(() => topCitedReferences(records, 12), [records]);
  const height = Math.round(Math.min(620, Math.max(380, width * .6)));
  const { k, x: tx, y: ty } = zv;
  const nodes = graph.nodes;
  const maxC = Math.max(1, ...nodes.map(n => n.citations ?? 0));
  const hasCitations = nodes.some(n => n.citations !== null), maxDeg = Math.max(1, ...nodes.map(n => n.degree));
  const pos = useMemo(() => nodes.map(n => ({ x: padX(width) + n.x * (width - padX(width) * 2), y: PAD + n.y * (height - PAD * 2) })), [nodes, width, height]);
  // Size encodes log citations; without citation counts it encodes the number of relations instead.
  const r = (i: number) => (3 + 10 * Math.sqrt(hasCitations ? Math.log1p(nodes[i].citations ?? 0) / Math.log1p(maxC) : nodes[i].degree / maxDeg)) * sizeScale(width) / Math.sqrt(k);
  const bins = useMemo(() => yearBins(theme, nodes.map(n => n.year)), [theme, nodes]);
  const fill = (i: number) => bins ? bins.color(nodes[i].year) : 'var(--wb-muted)';
  const active = selected ?? hover?.i ?? null;
  const adj = useMemo(() => {
    const m = new Map<number, Array<{ j: number; shared: number; weight: number }>>();
    for (const l of graph.links) { (m.get(l.a) ?? m.set(l.a, []).get(l.a)!).push({ j: l.b, shared: l.shared, weight: l.weight }); (m.get(l.b) ?? m.set(l.b, []).get(l.b)!).push({ j: l.a, shared: l.shared, weight: l.weight }); }
    for (const list of m.values()) list.sort((a, b) => b.weight - a.weight);
    return m;
  }, [graph.links]);
  const near = new Set((active !== null ? adj.get(active) ?? [] : []).map(n => n.j));
  const maxW = Math.max(1e-9, ...graph.links.map(l => l.weight));
  const labels = useMemo(() => {
    if (!width) return [];
    const order = nodes.map((_, i) => i).sort((a, b) => (b === active ? 1 : 0) - (a === active ? 1 : 0) || (nodes[b].citations ?? 0) - (nodes[a].citations ?? 0));
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [], out: number[] = [];
    for (const i of order) {
      const sx = pos[i].x * k + tx, sy = pos[i].y * k + ty + 14, w = textWidth(paperLabel(records[nodes[i].index]), 11, 600) + 6, h = 15;
      if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
      if (i !== active && boxes.some(b => Math.abs(b.x - sx) * 2 < b.w + w && Math.abs(b.y - sy) * 2 < b.h + h)) continue;
      boxes.push({ x: sx, y: sy, w, h }); out.push(i);
      if (out.length >= 60) break;
    }
    return out;
  }, [nodes, pos, k, tx, ty, width, height, active, records]);

  const exportCoupling = () => {
    if (!svgRef.current) return;
    exportSvgElement(svgRef.current, `文献${graph.mode === 'coupling' ? '耦合' : '相似'}网络-${stamp()}.svg`, {
      title: graph.mode === 'coupling' ? '施引文献书目耦合网络' : '施引文献关键词相似网络',
      legend: bins ? bins.labels.map((l, i) => ({ color: bins.colors[i], label: `发表年份 ${l}` })) : [],
      notes: [`${nodes.length} 篇文献（${focus.length ? '含选题篮词的文献中按命中词数' : '按'}${hasCitations ? '被引次数' : '关键词数'}选取），${graph.links.length} 条关系；${graph.mode === 'coupling' ? '连线 = 共同引用的参考文献（余弦归一化）' : '导出文件参考文献不足，连线 = 关键词 Jaccard 相似度，不表示引用关系'}；${hasCitations ? '圆面积随 log(被引 + 1) 增大，被引为导出时累计值' : '导出文件未含被引次数，圆面积随关系数增大'}。`, dataNote],
    });
  };
  if (records.length < 5) return <div className={styles.emptyView}><strong>记录太少</strong><p>至少需要 5 条记录才能绘制文献关系图。</p></div>;
  const sel = selected !== null ? nodes[selected] : null, selRec = sel ? records[sel.index] : null;

  return <div className={styles.viewBody}>
    <div className={styles.viewTools}>
      <p className={styles.viewNote}>
        {graph.mode === 'coupling'
          ? <>连线 = <strong>书目耦合</strong>：两篇文献引用了相同的参考文献，共同引用越多线越粗（余弦归一化）。{fmtInt(graph.withRefs)} / {fmtInt(records.length)} 篇记录带有参考文献。</>
          : <>导出文件中参考文献不足（{fmtInt(graph.withRefs)} / {fmtInt(records.length)} 篇带参考文献），连线改用<strong>关键词相似度</strong>（Jaccard），只表示用词相近，不表示引用关系。</>}
        {' '}{hasCitations ? '圆越大被引越多' : '导出文件未含被引次数，圆越大关系越多'}，颜色{recentHint(theme)}。
      </p>
      <div className={styles.toolCluster}><ExportButton onExport={exportCoupling} />
      {basket.length > 0 && <label className={styles.checkLine}><input type="checkbox" checked={useBasket} onChange={e => { setUseBasket(e.target.checked); setSelected(null); }} />只看与选题篮（{basketLabels.join('、')}）相关的文献</label>}
      </div>
    </div>
    <p className={styles.viewMeta}>{focus.length ? `含选题篮词的文献中，按命中词数${hasCitations ? '与被引次数' : '与关键词数'}取前 ${nodes.length} 篇` : `按${hasCitations ? '被引次数' : '关键词数'}取前 ${nodes.length} 篇`}（共 {fmtInt(records.length)} 篇）· {graph.links.length} 条关系，每篇最多保留 6 条最强关系</p>
    <div className={styles.mapLayout}>
      <div className={styles.mapFrame} ref={frameRef} style={{ height, touchAction: k > 1 ? 'none' : 'pan-y' }} {...handlers} onPointerLeave={() => setHover(null)} onClick={() => { if (!wasDrag()) setSelected(null); }}>
        {width > 0 && nodes.length > 0 && <svg ref={svgRef} width={width} height={height} role="img" aria-label={`文献关系图：${nodes.length} 篇文献，${graph.links.length} 条${graph.mode === 'coupling' ? '书目耦合' : '关键词相似'}关系`}>
          <g transform={`translate(${tx} ${ty}) scale(${k})`}>
            <g className={styles.links}>{graph.links.map((l, idx) => {
              const on = active !== null && (l.a === active || l.b === active);
              return <line key={idx} x1={pos[l.a].x} y1={pos[l.a].y} x2={pos[l.b].x} y2={pos[l.b].y} vectorEffect="non-scaling-stroke" strokeWidth={.6 + 3 * l.weight / maxW} style={{ opacity: active === null ? .14 + .4 * l.weight / maxW : on ? .9 : .04, stroke: on ? 'var(--wb-accent)' : undefined }} />;
            })}</g>
            <g>{nodes.map((n, i) => <circle key={n.id} cx={pos[i].x} cy={pos[i].y} r={r(i)} className={styles.paperNode} data-active={i === active || undefined}
              style={{ fill: fill(i), opacity: active !== null && i !== active && !near.has(i) ? .2 : 1 }} vectorEffect="non-scaling-stroke"
              onPointerMove={e => setHover({ i, ...svgPoint(e) })}
              onClick={e => { e.stopPropagation(); if (!wasDrag()) setSelected(s => s === i ? null : i); }} />)}</g>
            <g className={styles.mapLabels}>{labels.map(i => <text key={nodes[i].id} x={pos[i].x} y={pos[i].y + (r(i) + 9 / k)} fontSize={11 / k} fontFamily={SANS} fontWeight={i === active ? 800 : 600} textAnchor="middle" style={{ strokeWidth: 3 / k, opacity: active !== null && i !== active && !near.has(i) ? .25 : 1 }}>{paperLabel(records[nodes[i].index])}</text>)}</g>
          </g>
        </svg>}
        {nodes.length === 0 && <div className={styles.emptyView}><strong>没有匹配的文献</strong><p>选题篮中的词没有出现在任何记录里。</p></div>}
        <ZoomControls view={zv} onIn={zoomIn} onOut={zoomOut} onReset={reset} label="文献关系图" />
        <Tip at={hover && selected === null ? hover : null}>{hover && <>
          <strong>{records[nodes[hover.i].index].title}</strong>
          <span>{paperLabel(records[nodes[hover.i].index])} · {records[nodes[hover.i].index].source || '来源未注明'}</span>
          <span>{nodes[hover.i].citations === null ? '导出文件未含被引次数' : `被引 ${fmtInt(nodes[hover.i].citations!)} 次（导出时）`} · {nodes[hover.i].degree} 条关系</span>
        </>}</Tip>
      </div>
      <aside className={styles.mapAside} aria-live="polite">
        {sel && selRec ? <>
          <div className={styles.asideHead}><h4>{selRec.title}</h4><button type="button" className={styles.closeButton} onClick={() => setSelected(null)} aria-label="关闭明细">×</button></div>
          <dl className={styles.factList}>
            <div><dt>作者</dt><dd>{selRec.authors.length ? selRec.authors.slice(0, 6).join('；') + (selRec.authors.length > 6 ? ' 等' : '') : '导出文件未含作者'}</dd></div>
            <div><dt>年份 · 来源</dt><dd>{selRec.year ?? '—'} · {selRec.source || '—'}</dd></div>
            <div><dt>被引（导出时）</dt><dd>{selRec.citations === null ? '未提供' : fmtInt(selRec.citations)}</dd></div>
            {selRec.doi && <div><dt>DOI</dt><dd><a href={`https://doi.org/${selRec.doi}`} target="_blank" rel="noreferrer">{selRec.doi}<span className={styles.srOnly}>（新窗口）</span></a></dd></div>}
          </dl>
          <h5>{graph.mode === 'coupling' ? '共同引用最多的文献' : '用词最相近的文献'}</h5>
          <ol className={styles.coList}>{(adj.get(selected!) ?? []).map(n => <li key={n.j}><button type="button" onClick={() => setSelected(n.j)}>{paperLabel(records[nodes[n.j].index])}</button><span>{graph.mode === 'coupling' ? `${n.shared} 篇共引` : `${n.shared} 个共同词`}</span><small>{n.weight.toFixed(2)}</small></li>)}</ol>
        </> : <>
          <h4>奠基文献</h4>
          <p className={styles.muted}>被你导入的文献引用次数最多的参考文献，即这一领域共同的知识基础（只统计本集合内部的引用）。</p>
          {cited.length ? <ol className={styles.refList}>{cited.map(c => <li key={c.key}><span className={styles.refCount}>{c.count}</span><span>{c.key.startsWith('doi:') ? <a href={`https://doi.org/${c.key.slice(4)}`} target="_blank" rel="noreferrer">{c.label}<span className={styles.srOnly}>（新窗口）</span></a> : c.label}</span></li>)}</ol>
            : <p className={styles.muted}>导出文件不含参考文献字段。Web of Science 导出时选择“全记录与引用的参考文献”即可得到。</p>}
        </>}
      </aside>
    </div>
    {bins && <div className={styles.legendRow}><Legend title={`颜色 = 发表年份（${recentHint(theme)}）`} items={bins.labels.map((l, i) => ({ color: bins.colors[i], label: l }))} /><span className={styles.legendNote}>{hasCitations ? '圆面积随 log(被引 + 1) 增大' : '圆面积随关系数增大'}</span></div>}
  </div>;
}

export default function PaperNetwork(props: Props) {
  const withRefs = props.records.filter(r => r.refs.length > 0).length;
  const [mode, setMode] = useState<'coupling' | 'cocitation'>('coupling');
  const canCocite = withRefs >= 20;
  return <>
    <div className={styles.modeBar}>
      <div className={styles.segmented} role="group" aria-label="文献网络类型">
        <button type="button" aria-pressed={mode === 'coupling'} onClick={() => setMode('coupling')}>施引文献 · 书目耦合</button>
        <button type="button" aria-pressed={mode === 'cocitation'} onClick={() => setMode('cocitation')} disabled={!canCocite} title={canCocite ? undefined : '需要至少 20 篇带参考文献的记录'}>被引文献 · 共被引</button>
      </div>
      <span className={styles.muted}>{mode === 'coupling' ? '看你导入的文献彼此有多近（Connected Papers 的思路）' : '看这些文献共同引用的经典文献如何成簇（CiteSpace 默认网络）'}</span>
    </div>
    {mode === 'coupling' || !canCocite ? <CouplingMap {...props} /> : <CoCitationMap records={props.records} theme={props.theme} dataNote={props.dataNote} />}
  </>;
}

function CoCitationMap({ records, theme, dataNote }: { records: LitRecord[]; theme: Theme; dataNote: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { frameRef, width, view: zv, handlers, zoomIn, zoomOut, reset, wasDrag } = useZoom();
  const [hover, setHover] = useState<{ i: number; x: number; y: number; w: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const graph = useMemo(() => cocitationGraph(records, { top: 100 }), [records]);
  const height = Math.round(Math.min(620, Math.max(380, width * .6)));
  const { k, x: tx, y: ty } = zv;
  const nodes = graph.nodes, maxN = Math.max(1, ...nodes.map(n => n.count)), maxW = Math.max(1e-9, ...graph.links.map(l => l.weight));
  const pos = useMemo(() => nodes.map(n => ({ x: padX(width) + n.x * (width - padX(width) * 2), y: PAD + n.y * (height - PAD * 2) })), [nodes, width, height]);
  const r = (c: number) => (3 + 12 * Math.sqrt(c / maxN)) * sizeScale(width) / Math.sqrt(k);
  const bins = useMemo(() => yearBins(theme, nodes.map(n => n.year)), [theme, nodes]);
  const active = selected ?? hover?.i ?? null;
  const adj = useMemo(() => {
    const m = new Map<number, Array<{ j: number; shared: number; weight: number }>>();
    for (const l of graph.links) { (m.get(l.a) ?? m.set(l.a, []).get(l.a)!).push({ j: l.b, shared: l.shared, weight: l.weight }); (m.get(l.b) ?? m.set(l.b, []).get(l.b)!).push({ j: l.a, shared: l.shared, weight: l.weight }); }
    for (const list of m.values()) list.sort((a, b) => b.shared - a.shared);
    return m;
  }, [graph.links]);
  const near = new Set((active !== null ? adj.get(active) ?? [] : []).map(n => n.j));
  const labels = useMemo(() => {
    if (!width) return [];
    const order = nodes.map((_, i) => i).sort((a, b) => (b === active ? 1 : 0) - (a === active ? 1 : 0) || nodes[b].count - nodes[a].count);
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [], out: number[] = [];
    for (const i of order) {
      const sx = pos[i].x * k + tx, sy = pos[i].y * k + ty + 14, w = textWidth(nodes[i].short, 11, 600) + 6, h = 15;
      if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
      if (i !== active && boxes.some(b => Math.abs(b.x - sx) * 2 < b.w + w && Math.abs(b.y - sy) * 2 < b.h + h)) continue;
      boxes.push({ x: sx, y: sy, w, h }); out.push(i);
    }
    return out;
  }, [nodes, pos, k, tx, ty, width, height, active]);
  const exportCocitation = () => {
    const svg = svgRef.current; if (!svg) return;
    const pivot = getComputedStyle(svg).getPropertyValue('--tl-pivot').trim();
    exportSvgElement(svg, `参考文献共被引网络-${stamp()}.svg`, {
      title: '参考文献共被引网络',
      legend: [...(bins ? bins.labels.map((l, i) => ({ color: bins.colors[i], label: `被引文献发表年份 ${l}` })) : []), { color: pivot, label: `枢纽文献（中介中心性 ≥ ${PIVOT}）`, ring: true }],
      notes: [`被本集合引用最多的 ${nodes.length} 篇参考文献，${graph.links.length} 条共被引关系（${fmtInt(graph.citing)} 篇施引记录）；圆面积随被引次数增大；中介中心性在 Pathfinder 骨干网络上计算。参考文献按引用字符串或 DOI 识别。`, dataNote],
    });
  };
  if (nodes.length < 3) return <div className={styles.emptyView}><strong>共被引关系太少</strong><p>被引至少 2 次的参考文献不足 3 篇。</p></div>;
  const sel = selected !== null ? nodes[selected] : null;
  return <div className={styles.viewBody}>
    <div className={styles.viewTools}>
      <ExportButton onExport={exportCocitation} />
      <p className={styles.viewNote}>节点 = 被你导入的文献引用的参考文献（取被引最多的 {nodes.length} 篇）；同一篇文献同时引用两者即连线，共被引越多线越粗；圆越大被引越多，颜色{recentHint(theme)}；紫圈为中介中心性 ≥ {PIVOT} 的枢纽文献（Pathfinder 骨干网络上计算）。共 {fmtInt(graph.citing)} 篇施引记录。</p>
    </div>
    <div className={styles.mapLayout}>
      <div className={styles.mapFrame} ref={frameRef} style={{ height, touchAction: k > 1 ? 'none' : 'pan-y' }} {...handlers} onPointerLeave={() => setHover(null)} onClick={() => { if (!wasDrag()) setSelected(null); }}>
        {width > 0 && <svg ref={svgRef} width={width} height={height} role="img" aria-label={`参考文献共被引网络：${nodes.length} 篇被引文献，${graph.links.length} 条共被引关系`}>
          <g transform={`translate(${tx} ${ty}) scale(${k})`}>
            <g className={styles.links}>{graph.links.map((l, idx) => {
              const on = active !== null && (l.a === active || l.b === active);
              return <line key={idx} x1={pos[l.a].x} y1={pos[l.a].y} x2={pos[l.b].x} y2={pos[l.b].y} vectorEffect="non-scaling-stroke" strokeWidth={.6 + 3 * l.weight / maxW} style={{ opacity: active === null ? .14 + .4 * l.weight / maxW : on ? .9 : .04, stroke: on ? 'var(--wb-accent)' : undefined }} />;
            })}</g>
            <g>{nodes.map((n, i) => <g key={n.key} style={{ opacity: active !== null && i !== active && !near.has(i) ? .2 : 1 }}>
              {n.centrality >= PIVOT && <circle cx={pos[i].x} cy={pos[i].y} r={r(n.count) + 3.5 / k} className={styles.pivotRing} strokeWidth={2.5 / k} />}
              <circle cx={pos[i].x} cy={pos[i].y} r={r(n.count)} className={styles.paperNode} data-active={i === active || undefined} style={{ fill: bins ? bins.color(n.year) : 'var(--wb-muted)' }} vectorEffect="non-scaling-stroke"
                onPointerMove={e => setHover({ i, ...svgPoint(e) })}
                onClick={e => { e.stopPropagation(); if (!wasDrag()) setSelected(s => s === i ? null : i); }} />
            </g>)}</g>
            <g className={styles.mapLabels}>{labels.map(i => <text key={nodes[i].key} x={pos[i].x} y={pos[i].y + r(nodes[i].count) + 9 / k} fontSize={11 / k} fontFamily={SANS} fontWeight={i === active ? 800 : 600} textAnchor="middle" style={{ strokeWidth: 3 / k, opacity: active !== null && i !== active && !near.has(i) ? .25 : 1 }}>{nodes[i].short}</text>)}</g>
          </g>
        </svg>}
        <ZoomControls view={zv} onIn={zoomIn} onOut={zoomOut} onReset={reset} label="共被引网络" />
        <Tip at={hover && selected === null ? hover : null}>{hover && <>
          <strong>{nodes[hover.i].label}</strong>
          <span>被本集合 {nodes[hover.i].count} 篇文献引用 · 中介中心性 {nodes[hover.i].centrality.toFixed(3)}</span>
        </>}</Tip>
      </div>
      <aside className={styles.mapAside} aria-live="polite">
        {sel ? <>
          <div className={styles.asideHead}><h4>{sel.short}</h4><button type="button" className={styles.closeButton} onClick={() => setSelected(null)} aria-label="关闭明细">×</button></div>
          <p className={styles.refFull}>{sel.key.startsWith('doi:') ? <a href={`https://doi.org/${sel.key.slice(4)}`} target="_blank" rel="noreferrer">{sel.label}<span className={styles.srOnly}>（新窗口）</span></a> : sel.label}</p>
          <dl className={styles.factList}>
            <div><dt>被本集合引用</dt><dd>{sel.count} 篇</dd></div>
            <div><dt>发表年份</dt><dd>{sel.year ?? '引用字符串中未识别'}</dd></div>
            <div><dt>中介中心性</dt><dd>{sel.centrality.toFixed(3)}{sel.centrality >= PIVOT ? ' · 枢纽文献' : ''}</dd></div>
          </dl>
          <h5>最常被一起引用</h5>
          <ol className={styles.coList}>{(adj.get(selected!) ?? []).slice(0, 10).map(n => <li key={n.j}><button type="button" onClick={() => setSelected(n.j)}>{nodes[n.j].short}</button><span>{n.shared} 次</span><small>{n.weight.toFixed(2)}</small></li>)}</ol>
        </> : <>
          <h4>怎么用</h4>
          <p className={styles.muted}>被一起引用的经典文献组成一个“知识基础”簇；先读每簇中被引最多、颜色最深的几篇，就能快速掌握这一方向的理论来源。紫圈文献连接不同的簇，常是跨方向的关键文献。</p>
          <ol className={styles.refList}>{[...nodes].sort((a, b) => b.count - a.count).slice(0, 8).map(n => <li key={n.key}><span className={styles.refCount}>{n.count}</span><button type="button" className={styles.linkButton} onClick={() => setSelected(nodes.indexOf(n))}>{n.short}</button></li>)}</ol>
        </>}
      </aside>
    </div>
    {bins && <div className={styles.legendRow}><Legend title={`颜色 = 被引文献的发表年份（${recentHint(theme)}）`} items={bins.labels.map((l, i) => ({ color: bins.colors[i], label: l }))} /><span className={styles.legendNote}><i className={styles.ringPivot} /> 枢纽文献</span></div>}
  </div>;
}
