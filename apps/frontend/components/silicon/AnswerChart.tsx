'use client';

import { useId, useRef, useState } from 'react';
import type { Distribution } from '@/lib/silicon/assess';
import styles from './SiliconLab.module.css';
import { useContentReveal } from '@/components/motion/useWorkspaceMotion';

/**
 * Answer distribution for one closed item. Single choice and scales: one 100% stacked bar per group
 * (ordinal ramp for scales, categorical slots for choices). Multiple choice: share of each group that
 * picked an option, one bar per group. Colours are CSS tokens validated for both themes.
 */
const MAX_CATEGORICAL = 8;
/** Five validated steps per theme; adjacent 50-steps of the ramp are too close to tell apart (ΔL < 0.06). */
const ORDINAL_STEPS = 5;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ordinalSlot = (i: number, k: number) => k <= 1 ? ORDINAL_STEPS : 1 + Math.round(i * (ORDINAL_STEPS - 1) / (k - 1));

type Segment = { label: string; count: number; share: number; color: string };
type Tip = { x: number; y: number; title: string; rows: Array<{ label: string; value: string; color: string }> } | null;

export default function AnswerChart({ data, kind, title }: { data: Distribution; kind: 'single' | 'likert' | 'multi'; title: string }) {
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<Tip>(null);
  const frame = useRef<HTMLDivElement>(null);
  const id = useId();
  const groups = data.groups.filter(g => g.n > 0);
  const chartRef = useContentReveal<HTMLDivElement>({ token: JSON.stringify([kind, title, data.categories, data.groups, table]) });
  if (!groups.length) return <p className={styles.chartEmpty}>本题在当前结果中没有可统计的回答（未显示、拒答或无效）。</p>;
  const tooMany = kind === 'likert' && data.categories.length > ORDINAL_STEPS;

  // Fold a long nominal tail into 其他 so no hue is ever generated past the eighth slot.
  let categories = data.categories.map((c, i) => ({ ...c, indices: [i] }));
  if (kind !== 'likert' && categories.length > MAX_CATEGORICAL) {
    const head = categories.slice(0, MAX_CATEGORICAL - 1);
    categories = [...head, { key: '__other', label: '其他选项（合并）', indices: categories.slice(MAX_CATEGORICAL - 1).flatMap(c => c.indices) }];
  }
  const colorOf = (i: number) => kind === 'likert' ? `var(--ord-${ordinalSlot(i, categories.length)})` : `var(--cat-${i + 1})`;
  const countOf = (counts: number[], indices: number[]) => indices.reduce((s, i) => s + counts[i], 0);

  const place = (event: React.PointerEvent | React.FocusEvent, title: string, rows: NonNullable<Tip>['rows']) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const target = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = 'clientX' in event ? event.clientX - box.left : target.left - box.left + target.width / 2;
    const y = target.top - box.top;
    setTip({ x: Math.min(Math.max(x, 90), box.width - 90), y, title, rows });
  };
  const groupColor = (i: number) => groups.length === 1 ? 'var(--cat-1)' : `var(--cat-${(i % MAX_CATEGORICAL) + 1})`;

  return <figure className={styles.chart} aria-labelledby={`${id}-title`}>
    <figcaption className={styles.chartHead}>
      <span id={`${id}-title`}>{title}</span>
      <button type="button" aria-pressed={table || tooMany} disabled={tooMany} onClick={() => setTable(v => !v)}>{table || tooMany ? '图表视图' : '表格视图'}</button>
    </figcaption>
    <div ref={chartRef} className={styles.chartBody}>
    {(kind !== 'multi' ? categories.length > 1 : groups.length > 1) && !(table || tooMany) && <ul className={styles.legend} aria-label="图例">
      {(kind !== 'multi' ? categories.map((c, i) => ({ label: c.label, color: colorOf(i) })) : groups.map((g, i) => ({ label: g.label, color: groupColor(i) }))).map(item => <li key={item.label}><i style={{ background: item.color }}/>{item.label}</li>)}
    </ul>}
    {table || tooMany ? <div className={styles.tableWrap}>
      {tooMany && <p className={styles.chartNote}>刻度超过 {ORDINAL_STEPS} 级，以表格呈现，避免相邻色阶难以区分。</p>}
      <table className={styles.dataTable}>
        <thead><tr><th scope="col">分组</th><th scope="col">n</th>{categories.map(c => <th scope="col" key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>{groups.map(g => <tr key={g.key}><th scope="row">{g.label}</th><td>{g.n}</td>{categories.map(c => { const n = countOf(g.counts, c.indices); return <td key={c.key}>{n}<small>（{pct(n / g.n)}）</small></td>; })}</tr>)}</tbody>
      </table>
      {kind === 'multi' && <p className={styles.chartNote}>多选题：百分比为该组中选择此项的受访者比例，各列之和可超过 100%。</p>}
    </div> : <div className={styles.chartFrame} ref={frame} onPointerLeave={() => setTip(null)}>
      {kind !== 'multi' ? <div className={styles.stackRows}>
        {groups.map(g => {
          const segments: Segment[] = categories.map((c, i) => { const count = countOf(g.counts, c.indices); return { label: c.label, count, share: count / g.n, color: colorOf(i) }; });
          const rows = segments.map(s => ({ label: s.label, value: `${s.count}（${pct(s.share)}）`, color: s.color }));
          return <div key={g.key} className={styles.stackRow} tabIndex={0} aria-label={`${g.label}，n=${g.n}：${rows.map(r => `${r.label} ${r.value}`).join('，')}`} onFocus={e => place(e, `${g.label} · n=${g.n}`, rows)} onBlur={() => setTip(null)}>
            <span className={styles.rowLabel}>{g.label}</span>
            <span className={styles.stack}>{segments.filter(s => s.count > 0).map(s => <span key={s.label} className={styles.segment} style={{ flexGrow: s.share, background: s.color }} onPointerMove={e => place(e, `${g.label} · ${s.label}`, [{ label: s.label, value: `${s.count} 位（${pct(s.share)}）`, color: s.color }])}/>)}</span>
            <span className={styles.rowValue}>n={g.n}</span>
          </div>;
        })}
      </div> : <div className={styles.multiRows}>
        {categories.map(c => <div key={c.key} className={styles.multiOption}>
          <span className={styles.rowLabel}>{c.label}</span>
          <span className={styles.multiBars}>{groups.map((g, gi) => { const n = countOf(g.counts, c.indices), share = n / g.n; return <span key={g.key} className={styles.multiBar} tabIndex={0} aria-label={`${c.label} · ${g.label}：${n}/${g.n}（${pct(share)}）`} onFocus={e => place(e, c.label, [{ label: g.label, value: `${n}/${g.n}（${pct(share)}）`, color: groupColor(gi) }])} onBlur={() => setTip(null)} onPointerMove={e => place(e, c.label, [{ label: g.label, value: `${n}/${g.n}（${pct(share)}）`, color: groupColor(gi) }])}>
            <i style={{ width: `${Math.max(share * 100, 0.6)}%`, background: groupColor(gi) }}/><b>{pct(share)}</b>
          </span>; })}</span>
        </div>)}
        <p className={styles.chartNote}>每条为该组中选择此项的比例；多选题各项之和可超过 100%。</p>
      </div>}
      {tip && <div className={styles.chartTip} style={{ left: tip.x, top: tip.y }} role="status">
        <span>{tip.title}</span>
        {tip.rows.map(r => <p key={r.label}><i style={{ background: r.color }}/><strong>{r.value}</strong><small>{r.label}</small></p>)}
      </div>}
    </div>}
    </div>
  </figure>;
}
