"use client";
import { useState } from 'react';
import { assessEligibility } from '@/lib/row-eligibility';
import type { Mapping } from '@/lib/questionnaire-mapping';
import type { SurveyTable } from '@/lib/survey-analysis';
import type { RoutingPolicy } from '@/lib/routing-evidence';
import styles from './RoutingAudit.module.css';

export default function RoutingAudit({mapping,table,missingCodes,current,invalidMissing,policy,confirmed,onPolicy,onConfirm}:{mapping:Mapping;table:SurveyTable;missingCodes:string[];current:boolean;invalidMissing:boolean;policy:RoutingPolicy;confirmed:boolean;onPolicy:(policy:RoutingPolicy)=>void;onConfirm:()=>void}){
  const questions=mapping.design.questions.filter(q=>q.condition);
  const [choice,setChoice]=useState('');
  const question=questions.find(q=>q.id===choice)||questions[0];
  const assessment=question&&current&&!invalidMissing?assessEligibility(mapping.design,mapping.assignments,table,missingCodes,[question.id]):null;
  const counts=assessment?.questionCounts.find(q=>q.questionId===question?.id);
  if(!questions.length)return null;
  return <section className={styles.panel} aria-label="跳题与应答范围">
    <header className={styles.header}><div><span className={styles.eyebrow}>RESPONSE UNIVERSE</span><h3>先确认应答范围，再检查跳题</h3><p>逐题检查父题与嵌套条件，再为每次分析确定共同应答范围。</p></div><span className={styles.state} data-ready={confirmed}>{confirmed?'本版策略已确认':'需要确认分析口径'}</span></header>
    <div className={styles.body}>
      <div className={styles.inspect}><label>选择条件题检查<select value={question.id} onChange={e=>setChoice(e.target.value)}>{questions.map(q=><option key={q.id} value={q.id}>{q.variable} · {q.text||'未填写题干'}</option>)}</select></label><p>{question.text}</p></div>
      {!current||invalidMissing?<p className={styles.warning} role="status">请确认当前问卷与数据对应，并修复缺失代码后重新检查。</p>:assessment?.problems.length?<div className={styles.warning} role="status">{assessment.problems.join(' ')}</div>:counts&&<>
        <div className={styles.counts}>
          <article><span>符合条件</span><strong>{counts.eligibleAnswered+counts.eligibleMissing}</strong><p>有作答 {counts.eligibleAnswered}<br/>应答但缺失 {counts.eligibleMissing}</p></article>
          <article><span>不符合条件</span><strong>{counts.ineligibleBlank+counts.ineligibleAnswered}</strong><p>按条件跳过 {counts.ineligibleBlank}<br/>越界填答 {counts.ineligibleAnswered}</p></article>
          <article><span>资格未明</span><strong>{counts.unknownBlank+counts.unknownAnswered}</strong><p>无作答 {counts.unknownBlank}<br/>有作答 {counts.unknownAnswered}</p></article>
        </div>
        <p className={styles.note}>三类合计 {table.rows.length} 行。父题缺失或非法取值会导致资格未明；隐藏父题中填入的答案不会重新激活子题。此处“有作答”不代表取值有效。</p>
        <details><summary>查看父题链检查（含本题）</summary><div className={styles.table} tabIndex={0} aria-label="父题链资格计数，可横向滚动"><table><thead><tr><th>变量</th><th>符合</th><th>不符合</th><th>未明</th><th>越界填答</th></tr></thead><tbody>{assessment?.questionCounts.map(q=><tr key={q.questionId}><th>{mapping.design.questions.find(item=>item.id===q.questionId)?.variable}</th><td>{q.eligibleAnswered+q.eligibleMissing}</td><td>{q.ineligibleBlank+q.ineligibleAnswered}</td><td>{q.unknownBlank+q.unknownAnswered}</td><td>{q.ineligibleAnswered}</td></tr>)}</tbody></table></div></details>
      </>}
      <fieldset className={styles.policies}><legend>选择处理方式 · 应用于后续每次条件题分析</legend>
        <label data-selected={policy==='strict'}><input type="radio" name="routing-policy" checked={policy==='strict'} onChange={()=>onPolicy('strict')}/><span><strong>发现异常时暂停</strong><small>共同范围资格未明或父题链存在越界填答时，先核对再计算。正常跳过者不进入当前应答范围。</small></span></label>
        <label data-selected={policy==='exclude'}><input type="radio" name="routing-policy" checked={policy==='exclude'} onChange={()=>onPolicy('exclude')}/><span><strong>仅分析资格明确者</strong><small>不符合条件或共同资格未明的记录不进入计算；保留排除计数，原数据不改动。</small></span></label>
      </fieldset>
      <div className={styles.confirm}><p>仅描述满足所选题目显示条件者的已观察应答。多变量使用共同范围，再处理缺失；任一题确定不符合时，该行不属于共同范围。全体比例需另定义派生变量，不自动补零。修改问卷、对应、数据或缺失设置后须重新确认。</p><button type="button" disabled={!current||invalidMissing||confirmed} onClick={onConfirm}>{confirmed?'已确认本版处理方式':'确认本版跳题处理方式'}</button></div>
      <details className={styles.sources}><summary>跳题、缺失与分母如何区分？</summary><p>显示条件决定题目适用于谁；目标总体与指标决定最终分母。整份问卷的有效性和纠错需另行核查。</p><a href="https://wwwn.cdc.gov/nchs/nhanes/tutorials/datasets.aspx" target="_blank" rel="noopener noreferrer">CDC/NCHS：跳题、目标人群与分母 ↗</a><a href="https://aapor.org/standards-and-ethics/transparency-initiative/" target="_blank" rel="noopener noreferrer">AAPOR：质量检查与剔除规则披露 ↗</a></details>
    </div>
  </section>;
}
