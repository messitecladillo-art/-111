'use client';
import { useState } from 'react';
import type { Inference } from '@/lib/analysis-recipes';
import { formatP, formatStat } from '@/lib/inference';
import styles from './InferencePanel.module.css';

const ALPHA = 0.05;
function reading(p: number | null): string {
  if (p === null) return '检验不定义，原因见上方报告句。';
  return p < ALPHA
    ? '在 .05 水平下，当前样本支持存在差异或关联。差异是否重要，请看效应量及其区间。'
    : '在 .05 水平下，当前样本不足以支持存在差异或关联；这不等于证明不存在差异。';
}
const pText = (p: number | null) => formatP(p).replace(/^p = /, '').replace(/^p /, '');

/** Ready-to-cite report line, effect size, robustness check and the conditions the result depends on. */
export default function InferencePanel({ inference }: { inference: Inference }) {
  const { primary, robustness, comparisons, notes } = inference;
  const [copied, setCopied] = useState(false);
  const disagree = primary.p !== null && robustness.some(r => r.p !== null && (r.p < ALPHA) !== (primary.p! < ALPHA));
  async function copy() {
    try { await navigator.clipboard.writeText(primary.line); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); }
  }
  const effect = primary.effect;
  return <section className={styles.panel} aria-label="推断检验">
    <header className={styles.head}><span className={styles.eyebrow}>推断检验</span><strong>{primary.name}</strong></header>
    <div className={styles.report}><code>{primary.line}</code><button type="button" onClick={() => void copy()} aria-live="polite">{copied ? '已复制' : '复制报告句'}</button></div>
    <p className={styles.reading} data-tone={primary.p === null ? 'none' : primary.p < ALPHA ? 'support' : 'insufficient'}>{reading(primary.p)}</p>
    {effect && effect.value !== null && <dl className={styles.effect}><div><dt>{effect.name}</dt><dd>{formatStat(effect.value)}</dd></div>{effect.interval && <div><dt>95% 区间</dt><dd>[{formatStat(effect.interval.lower)}, {formatStat(effect.interval.upper)}]</dd></div>}</dl>}
    {disagree && <p className={styles.alert} role="note">主要检验与稳健性对照在 .05 水平的结论不一致，请审慎解读，优先报告更保守的结果。</p>}
    {!!robustness.length && <div className={styles.robust}><h5>稳健性对照</h5><ul>{robustness.map(r => <li key={r.name}><span>{r.name}</span><code>{r.line}</code></li>)}</ul></div>}
    {!!comparisons?.length && <div className={styles.pairs}><h5>两两比较 · Welch t · Holm 校正</h5><div className={styles.scroll} tabIndex={0} aria-label="两两比较结果，可横向滚动"><table>
      <thead><tr><th>比较</th><th>均值差</th><th>t</th><th>df</th><th>p</th><th>Holm 校正 p</th></tr></thead>
      <tbody>{comparisons.map(c => <tr key={`${c.a}|${c.b}`} data-supported={c.adjusted < ALPHA || undefined}><td>{c.a} − {c.b}</td><td>{formatStat(c.difference)}</td><td>{formatStat(c.t)}</td><td>{formatStat(c.df, 1)}</td><td>{pText(c.p)}</td><td>{pText(c.adjusted)}</td></tr>)}</tbody>
    </table></div></div>}
    <ul className={styles.notes}>{notes.map(n => <li key={n}>{n}</li>)}</ul>
  </section>;
}
