"use client";

import { DIAGNOSIS_ACTIONS, type DiagnosisBriefSource } from '@/lib/diagnosis-actions';
import styles from './DiagnosisActions.module.css';

export default function DiagnosisActions({codes,source,onPrepare}:{codes:string[];source:DiagnosisBriefSource;onPrepare:(source:DiagnosisBriefSource)=>void}) {
  return <section className={styles.actions} aria-label="诊断行动工作区">
    <div className={styles.heading}><span>下一步 · 可操作行动</span><h3>把建议接到工作台</h3><p>依据本轮自报信息安排，不代表材料已核验。打开工具不会自动完成任务。</p></div>
    <ol className={styles.list}>{codes.map(code=>{
      const action=Object.hasOwn(DIAGNOSIS_ACTIONS,code)?DIAGNOSIS_ACTIONS[code]:null;
      return <li key={code}>{action?<><strong>{action.title}</strong><dl><div><dt>准备</dt><dd>{action.input}</dd></div><div><dt>产出</dt><dd>{action.output}</dd></div><div><dt>复核</dt><dd>{action.review}</dd></div></dl><a href={action.target}>打开对应工作区 <span aria-hidden="true">↗</span></a></>:<p>此行动暂未接入工具，请人工核对；不会执行未知操作。</p>}</li>;
    })}</ol>
    <div className={styles.execute}><div><strong>从诊断创建问卷简介提案</strong><p>带入目标、对象与地域，逐项预览后选择写入；不自动生成题目、抽样或预试记录。</p></div><button type="button" onClick={()=>onPrepare(source)}>预览问卷简介提案 <span aria-hidden="true">→</span></button></div>
  </section>;
}
