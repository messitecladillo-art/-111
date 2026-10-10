"use client";

import { useState } from 'react';
import { applyDiagnosisBrief, prepareDiagnosisBrief, type BriefField, type BriefProposal, type DiagnosisBriefSource } from '@/lib/diagnosis-actions';
import type { Questionnaire } from '@/lib/questionnaire';
import styles from './DiagnosisBriefProposal.module.css';

export default function DiagnosisBriefProposal({source,design,revision,pending,onApply,onCancel}:{source:DiagnosisBriefSource;design:Questionnaire;revision:number;pending:boolean;onApply:(next:Questionnaire,expectedRevision:number)=>void;onCancel:()=>void}) {
  const [preview,setPreview]=useState<{proposal:BriefProposal;revision:number}|null>(null);
  const [selected,setSelected]=useState<BriefField[]>([]);
  const [error,setError]=useState('');
  const current=preview?.revision===revision;
  function previewChanges(){
    try {
      if(pending)throw Error('请先完成问卷中未结束的输入、导入或确认操作，再预览。');
      const proposal=prepareDiagnosisBrief(source,design);
      setPreview({proposal,revision});setSelected(proposal.fields.filter(f=>!f.before.trim()&&!f.error&&f.before!==f.after).map(f=>f.key));setError('');
    }catch(e){setError(e instanceof Error?e.message:'无法生成提案，当前设计保留。');}
  }
  function apply(){
    try {
      if(!preview||!current||pending)throw Error('设计已变化或存在未应用输入，请重新预览，原内容未修改。');
      const next=applyDiagnosisBrief(preview.proposal,source,design,selected);
      onApply(next,preview.revision);
    }catch(e){setError(e instanceof Error?e.message:'提案未应用，当前设计保留。');}
  }
  return <section className={styles.panel} aria-label="诊断到问卷的待确认提案">
    <div className={styles.heading}><div><span>诊断 → 设计 · 待确认</span><h3>核对简介字段变化</h3></div><button type="button" onClick={onCancel}>取消提案</button></div>
    <p>来自本轮项目输入“{source.input.title}”。决策主体：{source.input.decisionOwner}。内容按输入整理，证据仍待核验。</p>
    <p>应用勾选的简介字段后可撤销；题目、显示条件、抽样和预试记录保留，设计仍为待实施草稿。</p>
    {preview&&!current&&<p className={styles.warning} role="status">预览后设计发生过修改，旧提案已失效。即使撤销到原文，也需重新预览。</p>}
    {pending&&<p className={styles.warning}>请先完成问卷中的输入、导入或确认操作；未应用输入仍保留。</p>}
    <button type="button" disabled={pending} onClick={previewChanges}>{preview?'重新预览字段变化':'比较当前设计与提案'}</button>
    {preview&&current&&<><div className={styles.fields}>{preview.proposal.fields.map(field=><article key={field.key}>
      <label className={styles.choose}><input type="checkbox" checked={selected.includes(field.key)} disabled={!!field.error||field.before===field.after} onChange={e=>setSelected(old=>e.target.checked?[...old,field.key]:old.filter(k=>k!==field.key))}/><strong>{field.label}</strong><span>{field.before===field.after?'内容相同':field.before.trim()?'需明确选择覆盖':'当前为空'}</span></label>
      <div className={styles.diff}><div><small>当前内容</small><p>{field.before||'（空）'}</p></div><div><small>拟写入 · {field.after.length} / {field.max} 字符</small><p>{field.after}</p></div></div>
      {field.error&&<p className={styles.error}>此字段未选入：{field.error}。可先应用其他字段，或回诊断页精简后重新诊断。</p>}
    </article>)}</div><div className={styles.footer}><p>默认只选空白字段；已有内容不会自动覆盖。仅页面内存保存，请及时导出问卷备份。</p><button type="button" className={styles.primary} disabled={pending||!selected.length} onClick={apply}>应用 {selected.length} 个字段并检查设计</button></div></>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
  </section>;
}
