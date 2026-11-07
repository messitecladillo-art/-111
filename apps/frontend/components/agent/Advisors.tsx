'use client';

import { ADVISORS, advisorReading, type Advisor } from '@/lib/agent/advisors';
import type { BenchmarkResult } from '@/lib/report-benchmark';
import styles from './Advisors.module.css';

/**
 * The advisors a team can hire into its report, as cards: what each answers for, how many of its checks the report
 * passes, what is still to fix, and whether it is hired. Hired advisors speak in the writing inspector beside the paper.
 */
export default function Advisors({ benchmark, hired, onHire }: { benchmark: BenchmarkResult | null; hired: string[]; onHire: (ids: string[]) => void }) {
  const toggle = (advisor: Advisor) => onHire(hired.includes(advisor.id) ? hired.filter(id => id !== advisor.id) : [...hired, advisor.id]);
  const card = (advisor: Advisor, index: number) => {
    const reading = advisorReading(advisor, benchmark), on = hired.includes(advisor.id);
    return <article key={advisor.id} className={styles.card} data-hired={on} style={{ ['--i' as string]: index }}>
      <p className={styles.line}>{advisor.line}</p>
      <h3>{advisor.name}</h3>
      <span className={styles.glyph} aria-hidden="true">{advisor.glyph}</span>
      <dl className={styles.meta}>
        <div><dt>负责检查</dt><dd>{advisor.checks.length}</dd></div>
        <div><dt>待处理</dt><dd data-alert={reading.issues.length > 0}>{reading.issues.length}</dd></div>
        <div><dt>来源</dt><dd>市调技能包</dd></div>
        <div><dt>状态</dt><dd>{on ? '已雇用' : '未雇用'}</dd></div>
      </dl>
      <ul className={styles.rules}>{advisor.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
      <button type="button" data-primary={!on} onClick={() => toggle(advisor)} aria-pressed={on}>{on ? '解除雇用' : '雇用'}</button>
    </article>;
  };
  const mine = ADVISORS.filter(a => hired.includes(a.id));
  return <div className={styles.page}>
    <header className={styles.head}><h2>顾问 <small>{ADVISORS.length}</small></h2><p>来自你的市调技能包。雇用后，顾问在报告右侧按自己的领域给出意见；意见全部来自对标体检，不另作判断。</p></header>
    <section><h4 className={styles.label}>研究全流程顾问</h4><div className={styles.grid}>{ADVISORS.map(card)}</div></section>
    <section><h4 className={styles.label}>已雇用</h4>
      {mine.length ? <div className={styles.hiredRow}>{mine.map(a => <span key={a.id} className={styles.hiredChip}><b aria-hidden="true">{a.glyph}</b>{a.name}<small>{advisorReading(a, benchmark).issues.length} 条意见</small></span>)}</div>
        : <div className={styles.empty}><span aria-hidden="true">顾</span><p>还没有雇用顾问</p></div>}
    </section>
  </div>;
}
