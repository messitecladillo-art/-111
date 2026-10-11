'use client';

import type { Ref } from 'react';
import type { Status, TopicEvaluation } from '@/lib/topic-lab/evaluate';
import { SANS } from './shared';
import styles from './TopicLab.module.css';

type Leaf = { label: string; status: Status };
type Branch = { label: string; status: Status; leaves: Leaf[] };

const short = (s: string, n = 12) => [...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s;
/** Shorten to an approximate width in em (CJK ≈ 1, Latin ≈ 0.56), so English terms keep more letters. */
const fit = (s: string, em: number) => { let w = 0, out = ''; for (const ch of s) { const cw = /[\u2E80-\uFFEF]/.test(ch) ? 1 : .56; if (w + cw > em) return out + '…'; out += ch; w += cw; } return out; };
const mainTitle = (t: string) => t.split(/——|—|：|:/)[0].replace(/[“”"]/g, '');

export function evidenceBranches(ev: TopicEvaluation): Branch[] {
  const terms = ev.terms;
  return [
    { label: '文献基础', status: ev.base.status, leaves: terms.length ? [...terms.slice(0, 5).map(t => ({ label: `${fit(t.label, 12)} ${t.df}篇`, status: (t.df >= 3 ? 'ok' : 'attention') as Status })), ...ev.base.pivots.slice(0, 1).map(p => ({ label: `枢纽 ${fit(p.label, 11)}`, status: 'ok' as Status }))] : [{ label: '未识别核心词', status: 'unknown' }] },
    { label: '新颖度', status: ev.novelty.status, leaves: ev.novelty.kind === 'unknown' ? [{ label: '需两个以上核心词', status: 'unknown' }] : [
      { label: `全部要素同现 ${ev.novelty.joint} 篇`, status: ev.novelty.status },
      ...ev.novelty.pairs.slice(0, 4).map(p => ({ label: `${fit(p.a, 6)} × ${fit(p.b, 6)}  ${p.observed}/${p.expected.toFixed(1)}`, status: (p.observed / Math.max(p.expected, 1e-9) <= .5 ? 'ok' : 'neutral') as Status })),
    ] },
    { label: '时效', status: ev.trend.status, leaves: [
      ...ev.trend.bursts.slice(0, 3).map(b => ({ label: `${fit(b.label, 10)} 突现${b.live ? '至今' : `${b.begin}–${b.end}`}`, status: (b.live ? 'ok' : 'neutral') as Status })),
      ...terms.filter(t => t.trend).slice(0, 4).map(t => ({ label: `${fit(t.label, 11)} ${t.trend!.signal === 'rising' ? '↑ 上升' : t.trend!.signal === 'falling' ? '↓ 下降' : t.trend!.signal === 'stable' ? '→ 平稳' : '? 样本不足'}`, status: (t.trend!.signal === 'rising' ? 'ok' : t.trend!.signal === 'falling' ? 'attention' : t.trend!.signal === 'stable' ? 'neutral' : 'unknown') as Status })),
    ].slice(0, 6).concat(!terms.some(t => t.trend) && !ev.trend.bursts.length ? [{ label: '年份数据不足', status: 'unknown' as Status }] : []) },
    { label: '获奖题目参照', status: ev.award.status, leaves: ev.award.similar.length ? ev.award.similar.slice(0, 3).map(c => ({ label: `${fit(mainTitle(c.title), 11)} 相似 ${(c.similarity * 100).toFixed(0)}`, status: (c.titleJaccard >= .35 ? 'attention' : 'neutral') as Status })) : [{ label: '无题面相近项', status: 'neutral' }] },
    { label: '题目要素', status: ev.structure.status, leaves: ev.structure.features.map(f => ({ label: f.match ? `${f.label}：${short(f.match, 6)}` : `缺${f.label}`, status: (f.match ? 'ok' : 'attention') as Status })) },
    { label: '可行性（自评）', status: ev.feasibility.status, leaves: ev.feasibility.status === 'unknown' ? [{ label: '尚未填写', status: 'unknown' }] : ev.feasibility.issues.length ? ev.feasibility.issues.slice(0, 4).map(i => ({ label: fit(i, 15), status: 'attention' as Status })) : [{ label: '自评无明显障碍', status: 'ok' }] },
  ];
}

/**
 * "Neurone" tree: the candidate at the centre, six evidence dimensions as dendrites (three per side),
 * evidence items as leaves stacked in a column so labels never collide.
 */
export default function EvidenceTree({ ev, svgRef }: { ev: TopicEvaluation; svgRef?: Ref<SVGSVGElement> }) {
  const branches = evidenceBranches(ev);
  const sides = [branches.filter((_, i) => i % 2 === 0), branches.filter((_, i) => i % 2 === 1)];
  const ROW = 27, GAP = 18, W = 1120;
  const sideHeight = (list: Branch[]) => list.reduce((h, b) => h + b.leaves.length * ROW, 0) + GAP * (list.length - 1);
  const H = Math.max(360, Math.max(...sides.map(sideHeight)) + 70), cx = W / 2, cy = H / 2;
  const titleLines = (() => { const chars = [...mainTitle(ev.title) || ev.title]; return chars.length <= 9 ? [chars.join('')] : [chars.slice(0, 9).join(''), short(chars.slice(9).join(''), 9)]; })();
  const layout = sides.flatMap((list, side) => {
    const dir = side === 0 ? 1 : -1;
    let y = cy - sideHeight(list) / 2 + ROW / 2;
    return list.map(b => {
      const leaves = b.leaves.map(leaf => { const ly = y; y += ROW; return { ...leaf, y: ly }; });
      y += GAP;
      const ky = leaves.reduce((s, l) => s + l.y, 0) / leaves.length;
      return { b, dir, kx: cx + dir * 180, ky, lx: cx + dir * 310, leaves };
    });
  });
  const label = (b: Branch) => `${b.label}${b.status === 'ok' ? '有证据支持' : b.status === 'attention' ? '需要补强' : b.status === 'unknown' ? '无法判断' : '仅作参考'}`;
  return <svg ref={svgRef} className={styles.tree} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`证据画像：${branches.map(label).join('，')}`}>
    {layout.map(({ b, dir, kx, ky, lx, leaves }) => <g key={b.label} className={styles[`st_${b.status}`]}>
      <path d={`M${cx + dir * 40} ${cy}C${cx + dir * 100} ${cy} ${kx - dir * 70} ${ky} ${kx} ${ky}`} className={styles.treeTrunk} />
      <path d={`M${cx + dir * 40} ${cy}C${cx + dir * 100} ${cy} ${kx - dir * 70} ${ky} ${kx} ${ky}`} className={styles.treeCore} />
      {leaves.map((leaf, j) => <g key={j} className={styles[`st_${leaf.status}`]}>
        <path d={`M${kx} ${ky}C${kx + dir * 60} ${ky} ${lx - dir * 70} ${leaf.y} ${lx} ${leaf.y}`} className={styles.treeTwig} />
        <circle cx={lx} cy={leaf.y} r={5.5} className={styles.treeLeaf} />
        <text x={lx + dir * 11} y={leaf.y} textAnchor={dir > 0 ? 'start' : 'end'} dominantBaseline="central" fontFamily={SANS} className={styles.treeLeafText}>{leaf.label}</text>
      </g>)}
      <circle cx={kx} cy={ky} r={8} className={styles.treeKnot} />
      <text x={kx} y={ky - 15} textAnchor="middle" fontFamily={SANS} className={styles.treeBranchText}>{b.label}</text>
    </g>)}
    <circle cx={cx} cy={cy} r={56} className={styles.treeRoot} />
    {titleLines.map((l, i) => <text key={i} x={cx} y={cy + (i - (titleLines.length - 1) / 2) * 19} textAnchor="middle" dominantBaseline="central" fontFamily={SANS} className={styles.treeRootText}>{l}</text>)}
  </svg>;
}
