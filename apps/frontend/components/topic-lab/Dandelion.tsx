'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Theme } from '@/components/workbench/shell-kit';
import type { TermMap } from '@/lib/topic-lab/network';
import type { LitRecord } from '@/lib/topic-lab/parse';
import type { TermIndex } from '@/lib/topic-lab/terms';
import { ExportButton, Legend, MAX_CLUSTER_COLORS, SANS, Tip, clusterColor, fmtInt, useElementWidth } from './shared';
import { esc, exportSvgString, stamp } from './exportSvg';
import styles from './TopicLab.module.css';

type Props = { dataNote: string; records: LitRecord[]; index: TermIndex; map: TermMap; theme: Theme; basket: string[]; basketLabels: string[]; clusterNames: string[] };
const SWEEP = Math.PI * 2 * (300 / 360);
const START = -Math.PI / 2;
const INK = { light: { text: '#0a1f33', muted: '#55687a', line: 'rgba(10,31,51,0.13)', bar: 'rgba(10,31,51,0.22)' }, dark: { text: '#f1ece0', muted: '#a3b2bf', line: 'rgba(247,244,237,0.13)', bar: 'rgba(247,244,237,0.26)' } };

/** Stable pseudo-random offset in [-0.5, 0.5) from a record id, so the same file always draws the same picture. */
function jitter(id: string): number { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000 - .5; }

export default function Dandelion({ dataNote, records, index, map, theme, basket, basketLabels, clusterNames }: Props) {
  const [bodyRef, width] = useElementWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [emphasis, setEmphasis] = useState(true);
  const [hover, setHover] = useState<{ i: number; x: number; y: number; w: number } | null>(null);
  const [table, setTable] = useState(false);
  // Leave room for the reading guide beside the chart when the layout has two columns (≥ 900 px).
  const size = Math.max(280, Math.min(width - (width >= 900 ? 268 : 0), 760));
  const dated = useMemo(() => records.map((r, i) => ({ r, i })).filter(p => p.r.year !== null), [records]);
  const years = dated.map(p => p.r.year!);
  const minY = years.length ? Math.min(...years) : 0, maxY = years.length ? Math.max(...years) : 0, span = maxY - minY + 1;
  const maxC = Math.max(1, ...records.map(r => r.citations ?? 0));
  const hasCitations = records.some(r => r.citations !== null);
  const clusterOf = useMemo(() => {
    const byKey = new Map(map.nodes.map(n => [n.key, n.cluster]));
    return index.docs.map(d => {
      const counts = new Map<number, number>();
      for (const k of d) { const c = byKey.get(k); if (c !== undefined && c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1); }
      let best = -1, bestN = 0; for (const [c, n] of counts) if (n > bestN || (n === bestN && c < best)) { best = c; bestN = n; }
      return best;
    });
  }, [index.docs, map.nodes]);
  const basketSet = useMemo(() => new Set(basket), [basket]);
  const matches = useMemo(() => index.docs.map(d => d.some(k => basketSet.has(k))), [index.docs, basketSet]);
  const geo = useMemo(() => {
    const c = size / 2, R = size / 2 - 48, r0 = size * .17;
    const angle = (y: number, id: string) => START + ((y - minY) + .5 + jitter(id) * .84) / span * SWEEP;
    const radius = (cit: number | null) => cit === null ? r0 : r0 + Math.log1p(cit) / Math.log1p(maxC) * (R - r0);
    if (hasCitations) {
      const pts = dated.map(({ r, i }) => { const a = angle(r.year!, r.id), d = radius(r.citations); return { i, a, d, x: c + Math.cos(a) * d, y: c + Math.sin(a) * d }; });
      return { c, R, r0, pts, radius, stacked: false };
    }
    // No citation counts in the export: stack each year's records outward (grouped by cluster), so the
    // length of a year's sector is its record count. Distance then means count, and the guide says so.
    const sector = SWEEP / span, byYear = new Map<number, number[]>();
    for (const { r, i } of dated) (byYear.get(r.year!) ?? byYear.set(r.year!, []).get(r.year!)!).push(i);
    const most = Math.max(1, ...[...byYear.values()].map(l => l.length));
    let step = 7;
    const rowsFor = (n: number, st: number) => { let rr = r0 + 10, left = n, rows = 0; while (left > 0) { left -= Math.max(1, Math.floor(sector * .86 * rr / st)); rr += st; rows++; } return rows; };
    while (step > 2.4 && r0 + 10 + rowsFor(most, step) * step > R) step -= .4;
    const pts: Array<{ i: number; a: number; d: number; x: number; y: number }> = [];
    for (const [y, list] of byYear) {
      list.sort((p, q) => clusterOf[p] - clusterOf[q] || p - q);
      let rr = r0 + 10, k = 0;
      while (k < list.length) {
        const per = Math.max(1, Math.floor(sector * .86 * rr / step));
        for (let j = 0; j < per && k < list.length; j++, k++) {
          const a = START + (y - minY) * sector + sector * (.07 + .86 * (j + .5) / per);
          pts.push({ i: list[k], a, d: rr, x: c + Math.cos(a) * rr, y: c + Math.sin(a) * rr });
        }
        rr += step;
      }
    }
    return { c, R, r0, pts, radius, stacked: true };
  }, [size, dated, minY, span, maxC, hasCitations, clusterOf]);
  const perYear = useMemo(() => {
    const m = new Map<number, { n: number; hit: number; top: LitRecord | null }>();
    dated.forEach(({ r, i }) => { const e = m.get(r.year!) ?? { n: 0, hit: 0, top: null }; e.n++; if (matches[i]) e.hit++; if (!e.top || (r.citations ?? -1) > (e.top.citations ?? -1)) e.top = r; m.set(r.year!, e); });
    return m;
  }, [dated, matches]);

  useEffect(() => {
    const el = canvas.current; if (!el || !width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr; el.height = size * dpr;
    const ctx = el.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const ink = INK[theme], { c, R, r0, pts, radius } = geo;
    // Citation guide rings (log scale).
    ctx.font = `500 10px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const v of geo.stacked ? [] : [1, 10, 100, 1000, 10000]) {
      if (v > maxC * 1.05) break;
      const d = radius(v);
      ctx.strokeStyle = ink.line; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(c, c, d, START, START + SWEEP); ctx.stroke(); ctx.setLineDash([]);
      const ga = START + SWEEP + .09; ctx.fillStyle = ink.muted; ctx.fillText(`被引 ${v}`, c + Math.cos(ga) * d - 4, c + Math.sin(ga) * d);
    }
    // Records-per-year bars inside the inner ring.
    const maxN = Math.max(1, ...[...perYear.values()].map(e => e.n)), rin = r0 * .42, rout = r0 * .9, sector = SWEEP / span;
    for (const [y, e] of perYear) {
      const a = START + (y - minY + .5) * sector, len = e.n / maxN * (rout - rin);
      ctx.strokeStyle = ink.bar; ctx.lineWidth = Math.max(1.5, sector * rin * .7); ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * rin, c + Math.sin(a) * rin); ctx.lineTo(c + Math.cos(a) * (rin + len), c + Math.sin(a) * (rin + len)); ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.line; ctx.beginPath(); ctx.arc(c, c, r0, START, START + SWEEP); ctx.stroke();
    // Year ticks and labels.
    const every = span <= 14 ? 1 : span <= 30 ? 2 : 5;
    ctx.fillStyle = ink.muted; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'center';
    for (let y = minY; y <= maxY; y++) {
      const a = START + (y - minY) * sector;
      ctx.strokeStyle = ink.line; ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); ctx.lineTo(c + Math.cos(a) * (R + 6), c + Math.sin(a) * (R + 6)); ctx.stroke();
      if ((y - minY) % every === 0) { const m = a + sector / 2; ctx.fillText(String(y), c + Math.cos(m) * (R + 22), c + Math.sin(m) * (R + 22)); }
    }
    // Stems then seeds; emphasised records drawn last so they sit on top.
    const emph = emphasis && basket.length > 0;
    const order = [...pts].sort((p, q) => Number(emph && matches[p.i]) - Number(emph && matches[q.i]));
    for (const p of geo.stacked ? [] : order) {
      const faded = emph && !matches[p.i], col = clusterColor(theme, clusterOf[p.i]);
      ctx.globalAlpha = faded ? .05 : .2; ctx.strokeStyle = col; ctx.beginPath();
      ctx.moveTo(c + Math.cos(p.a) * r0, c + Math.sin(p.a) * r0); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    for (const p of order) {
      const faded = emph && !matches[p.i], col = clusterColor(theme, clusterOf[p.i]), none = !geo.stacked && records[p.i].citations === null;
      ctx.globalAlpha = faded ? .18 : .92;
      ctx.beginPath(); ctx.arc(p.x, p.y, emph && matches[p.i] ? 3.6 : 2.8, 0, Math.PI * 2);
      if (none) { ctx.strokeStyle = col; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink.text; ctx.font = `800 ${Math.round(size * .045)}px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText(fmtInt(dated.length), c, c - 6);
    ctx.fillStyle = ink.muted; ctx.font = `500 11px ${SANS}`; ctx.fillText('篇有年份', c, c + 14);
    if (hover) { const p = pts.find(q => q.i === hover.i); if (p) { ctx.strokeStyle = ink.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke(); } }
  }, [geo, theme, width, size, perYear, minY, maxY, span, maxC, emphasis, basket.length, matches, clusterOf, records, dated.length, hover]);

  const clusterItems = [...clusterNames.slice(0, MAX_CLUSTER_COLORS).map((n, i) => ({ color: clusterColor(theme, i), label: `${i + 1} ${n}` })), { color: clusterColor(theme, -1), label: '无高频词 / 其他' }];

  /** The same picture as the canvas, as vector shapes with no background. */
  const exportDandelion = () => {
    const ink = INK[theme], { c, R, r0, pts, radius } = geo, f = (v: number) => v.toFixed(1), out: string[] = [];
    const arc = (r: number) => { const a0 = START, a1 = START + SWEEP; return `M${f(c + Math.cos(a0) * r)} ${f(c + Math.sin(a0) * r)}A${f(r)} ${f(r)} 0 1 1 ${f(c + Math.cos(a1) * r)} ${f(c + Math.sin(a1) * r)}`; };
    for (const v of geo.stacked ? [] : [1, 10, 100, 1000, 10000]) {
      if (v > maxC * 1.05) break;
      const d = radius(v), ga = START + SWEEP + .09;
      out.push(`<path d="${arc(d)}" fill="none" stroke="${ink.line}" stroke-dasharray="2 4"/>`, `<text x="${f(c + Math.cos(ga) * d - 4)}" y="${f(c + Math.sin(ga) * d)}" font-size="10" fill="${ink.muted}" dominant-baseline="central">被引 ${v}</text>`);
    }
    const sector = SWEEP / span, maxN = Math.max(1, ...[...perYear.values()].map(e => e.n)), rin = r0 * .42, rout = r0 * .9;
    for (const [y, e] of perYear) {
      const a = START + (y - minY + .5) * sector, len = e.n / maxN * (rout - rin);
      out.push(`<line x1="${f(c + Math.cos(a) * rin)}" y1="${f(c + Math.sin(a) * rin)}" x2="${f(c + Math.cos(a) * (rin + len))}" y2="${f(c + Math.sin(a) * (rin + len))}" stroke="${ink.bar}" stroke-width="${f(Math.max(1.5, sector * rin * .7))}"/>`);
    }
    out.push(`<path d="${arc(r0)}" fill="none" stroke="${ink.line}"/>`);
    const every = span <= 14 ? 1 : span <= 30 ? 2 : 5;
    for (let y = minY; y <= maxY; y++) {
      const a = START + (y - minY) * sector, m = a + sector / 2;
      out.push(`<line x1="${f(c + Math.cos(a) * r0)}" y1="${f(c + Math.sin(a) * r0)}" x2="${f(c + Math.cos(a) * (R + 6))}" y2="${f(c + Math.sin(a) * (R + 6))}" stroke="${ink.line}"/>`);
      if ((y - minY) % every === 0) out.push(`<text x="${f(c + Math.cos(m) * (R + 22))}" y="${f(c + Math.sin(m) * (R + 22))}" font-size="11" font-weight="600" fill="${ink.muted}" text-anchor="middle" dominant-baseline="central">${y}</text>`);
    }
    const emph = emphasis && basket.length > 0;
    const order = [...pts].sort((p, q) => Number(emph && matches[p.i]) - Number(emph && matches[q.i]));
    for (const p of geo.stacked ? [] : order) out.push(`<line x1="${f(c + Math.cos(p.a) * r0)}" y1="${f(c + Math.sin(p.a) * r0)}" x2="${f(p.x)}" y2="${f(p.y)}" stroke="${clusterColor(theme, clusterOf[p.i])}" stroke-opacity="${emph && !matches[p.i] ? .05 : .2}"/>`);
    for (const p of order) {
      const col = clusterColor(theme, clusterOf[p.i]), op = emph && !matches[p.i] ? .18 : .92, rr = emph && matches[p.i] ? 3.6 : 2.8;
      out.push(!geo.stacked && records[p.i].citations === null ? `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${rr}" fill="none" stroke="${col}" opacity="${op}"/>` : `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${rr}" fill="${col}" opacity="${op}"><title>${esc(records[p.i].title)}</title></circle>`);
    }
    out.push(`<text x="${f(c)}" y="${f(c - 6)}" font-size="${Math.round(size * .045)}" font-weight="800" fill="${ink.text}" text-anchor="middle">${fmtInt(dated.length)}</text>`, `<text x="${f(c)}" y="${f(c + 14)}" font-size="11" fill="${ink.muted}" text-anchor="middle">篇有年份</text>`);
    exportSvgString(out.join(''), size, size, `时间脉络-${stamp()}.svg`, {
      title: `文献时间脉络（${minY}–${maxY}，${fmtInt(dated.length)} 篇）`,
      legend: clusterItems,
      notes: [geo.stacked ? '角度 = 发表年份（自正上方顺时针由早到晚）；导出文件未含被引次数，每年的文献按聚类向外堆叠，扇区长度 = 当年篇数；颜色 = 文献中出现最多的关键词聚类；内圈短柱 = 每年篇数。' : '角度 = 发表年份（自正上方顺时针由早到晚）；离中心距离 = 被引次数（对数刻度，导出时累计值，早年文献天然更高）；颜色 = 文献中出现最多的关键词聚类；内圈短柱 = 每年篇数。', ...(emph ? [`突出显示含选题篮词（${basketLabels.join('、')}）的文献。`] : []), dataNote],
    }, { ink: ink.text, muted: ink.muted });
  };

  if (!dated.length) return <div className={styles.emptyView}><strong>没有年份信息</strong><p>导出文件中的记录都缺少出版年份，无法绘制时间脉络。</p></div>;
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    let best = -1, bd = 64;
    for (const p of geo.pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.i; } }
    setHover(best >= 0 ? { i: best, x, y, w: b.width } : null);
  };
  const hr = hover ? records[hover.i] : null;
  return <div ref={bodyRef} className={styles.viewBody}>
    <div className={styles.viewTools}>
      <p className={styles.viewNote}>{hasCitations ? '每一根“蒲公英种子”是一篇文献。被引次数是导出时的累计值，早年发表的文献天然积累更多，不能直接比较不同年份的影响力。' : '每个点是一篇文献。导出文件未含被引次数，因此按年份堆叠，只呈现数量与聚类构成。'}</p>
      <div className={styles.toolCluster}>
        {basket.length > 0 && <label className={styles.checkLine}><input type="checkbox" checked={emphasis} onChange={e => setEmphasis(e.target.checked)} />突出含选题篮词（{basketLabels.join('、')}）的文献</label>}
        {!table && <ExportButton onExport={exportDandelion} />}
        <div className={styles.segmented} role="group" aria-label="时间脉络呈现方式">
          <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>图</button>
          <button type="button" aria-pressed={table} onClick={() => setTable(true)}>逐年表</button>
        </div>
      </div>
    </div>
    {!table && <div className={styles.dandelionLayout}>
      <div className={styles.dandelionFrame} style={{ width: size, height: size }}>
        <canvas ref={canvas} style={{ width: size, height: size }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`时间脉络：${minY}–${maxY} 年 ${fmtInt(dated.length)} 篇文献，角度表示发表年份，${hasCitations ? '离中心距离表示被引次数' : '向外堆叠表示当年篇数'}`} />
        <Tip at={hover}>{hr && <>
          <strong>{hr.title}</strong>
          <span>{hr.year} · {hr.source || '来源未注明'}</span>
          <span>{hr.citations === null ? '导出文件未含被引次数' : `被引 ${fmtInt(hr.citations)} 次（导出时）`}</span>
          <span>{clusterOf[hover!.i] >= 0 ? `主要属于聚类 ${clusterOf[hover!.i] + 1}：${clusterNames[clusterOf[hover!.i]] ?? ''}` : '未含高频词'}</span>
        </>}</Tip>
      </div>
      <aside className={styles.howTo} aria-label="怎么读这张图">
        <h4>怎么读这张图</h4>
        <div className={styles.howItem}><svg viewBox="0 0 44 44" aria-hidden="true"><path d="M22 6 A16 16 0 1 1 7 27" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M7 27 l-2 -6 M7 27 l6 -2" stroke="currentColor" strokeWidth="2" fill="none" /></svg><div><strong>角度 = 发表年份</strong><span>从正上方起顺时针，由早到晚（{minY}–{maxY}）</span></div></div>
        <div className={styles.howItem}><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="22" y1="22" x2="40" y2="8" stroke="currentColor" strokeWidth="1.2" opacity=".5" /><circle cx="31" cy="15" r="2.5" fill="currentColor" /><circle cx="40" cy="8" r="2.5" fill="currentColor" /></svg><div><strong>{hasCitations ? '离中心越远 = 被引越多' : '向外堆叠 = 当年篇数'}</strong><span>{hasCitations ? '对数刻度，虚线圈标出 1、10、100… 次' : '导出文件未含被引次数（知网导出常见），每年的文献按聚类向外堆叠'}</span></div></div>
        <div className={styles.howItem}><svg viewBox="0 0 44 44" aria-hidden="true">{[0, 1, 2].map(i => <circle key={i} cx={12 + i * 10} cy="22" r="4" fill={clusterColor(theme, i)} />)}</svg><div><strong>颜色 = 关键词聚类</strong><span>按文献中出现最多的聚类词着色</span></div></div>
        <div className={styles.howItem}><svg viewBox="0 0 44 44" aria-hidden="true">{[6, 12, 9, 15].map((h, i) => <rect key={i} x={8 + i * 8} y={34 - h} width="5" height={h} fill="currentColor" opacity=".45" />)}</svg><div><strong>内圈短柱 = 每年篇数</strong><span>看这一领域何时开始升温</span></div></div>
        {hasCitations && records.some(r => r.citations === null) && <p className={styles.muted}>空心点：该记录没有被引次数。</p>}
      </aside>
    </div>}
    {!table && <div className={styles.legendRow}><Legend title="颜色 = 聚类" items={clusterItems} /></div>}
    {table && <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>逐年记录数{basket.length ? ` 与含选题篮词的记录数` : ''}</caption>
        <thead><tr><th scope="col">年份</th><th scope="col">记录数</th>{basket.length > 0 && <th scope="col">含选题篮词</th>}<th scope="col">当年被引最多的记录（导出时）</th></tr></thead>
        <tbody>{[...perYear].sort((a, b) => a[0] - b[0]).map(([y, e]) => <tr key={y}><th scope="row">{y}</th><td>{e.n}</td>{basket.length > 0 && <td>{e.hit}</td>}<td>{e.top ? `${e.top.title}${e.top.citations !== null ? `（${fmtInt(e.top.citations)}）` : ''}` : '—'}</td></tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
