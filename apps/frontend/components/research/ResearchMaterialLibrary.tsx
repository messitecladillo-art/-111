"use client";

import { useState } from 'react';
import { findMaterialCards, MATERIAL_QUESTION_GROUPS, MATERIAL_SOURCES, materialCardText, type MaterialContext } from '@/lib/research-materials';
import { QUESTION_TYPES } from '@/lib/questionnaire';
import { useContentReveal, useKeyedListMotion } from '../motion/useWorkspaceMotion';
import styles from './ResearchMaterialLibrary.module.css';

export default function ResearchMaterialLibrary({ context, onAppendGroup, appendDisabled = false }: {
  context: MaterialContext; onAppendGroup?: (id: string) => boolean; appendDisabled?: boolean;
}) {
  const [query,setQuery] = useState(''), [category,setCategory] = useState(''), [all,setAll] = useState(false);
  const [selected,setSelected] = useState(''), [preview,setPreview] = useState('');
  const [checked,setChecked] = useState<Record<string,number[]>>({}), [answers,setAnswers] = useState<Record<string,number>>({});
  const [revealed,setRevealed] = useState<Record<string,boolean>>({}), [notice,setNotice] = useState('');
  const cards = findMaterialCards(context,query,category,all);
  const categories = [...new Set(findMaterialCards(context,'','',all).map(c=>c.category))];
  const card = cards.find(c=>c.id===selected) ?? cards[0];
  const group = card?.questionGroupId ? MATERIAL_QUESTION_GROUPS.find(g=>g.id===card.questionGroupId) : undefined;
  const checks = card ? checked[card.id] ?? [] : [];
  const directory = useKeyedListMotion<HTMLDivElement>({ids:cards.map(c=>c.id),activeId:card?.id});
  const reveal = useContentReveal<HTMLElement>({token:card?.id ?? null});
  function exportCard() {
    if (!card) return;
    const url = URL.createObjectURL(new Blob([materialCardText(card,checks)],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download=`研究卡片-${card.title.replace(/[<>:"/\\|?*]/g,'')}.txt`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('已生成研究卡片文件。');
  }
  return <details className={styles.library}>
    <summary><span>研究资料库</span><small>方法 · 题组 · 报告 · 答辩</small></summary>
    <div className={styles.filters}>
      <label>搜索研究资料<input type="search" placeholder="试试：抽样、参照期、行动建议" value={query} maxLength={120} onChange={e=>{setQuery(e.target.value);setPreview('');setNotice('');}} /></label>
      <label>资料分类<select value={category} onChange={e=>{setCategory(e.target.value);setPreview('');setNotice('');}}><option value="">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className={styles.toggle}><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setCategory('');setPreview('');setNotice('');}}/>浏览全部资料</label>
      <span className={styles.count}>{cards.length} 张卡片</span>
    </div>
    <div className={styles.workspace}>
      <div className={styles.directory} ref={directory} role="navigation" aria-label="研究资料目录">
        <span className={styles.marker} data-motion-marker aria-hidden="true" />
        {cards.map(c=><button key={c.id} type="button" data-motion-id={c.id} aria-pressed={card?.id===c.id} onClick={()=>{setSelected(c.id);setPreview('');setNotice('');}}><small>{c.category}</small><strong>{c.title}</strong>{c.questionGroupId&&<span>可追加题组</span>}</button>)}
        {!cards.length&&<p>没有匹配的资料，换个关键词试试。</p>}
      </div>
      {card&&<article className={styles.content} ref={reveal} aria-label={`研究卡片：${card.title}`}>
        <header><span>{card.category}</span><button type="button" onClick={exportCard}>导出卡片</button></header>
        <h3>{card.title}</h3><p className={styles.question}>{card.researchQuestion}</p>
        {card.quiz ? <section className={styles.quiz} aria-label="知识练习">
          <div>{card.quiz.options.map((option,i)=><button type="button" key={option} aria-pressed={answers[card.id]===i} onClick={()=>{setAnswers(a=>({...a,[card.id]:i}));setRevealed(r=>({...r,[card.id]:false}));}}>{String.fromCharCode(65+i)} · {option}</button>)}</div>
          <button type="button" disabled={answers[card.id]===undefined} onClick={()=>setRevealed(r=>({...r,[card.id]:true}))}>查看解析</button>
          {revealed[card.id]&&<p role="status"><strong>{answers[card.id]===card.quiz.answer?'选择正确。':'再想一想。'} 正确答案：{String.fromCharCode(65+card.quiz.answer)}</strong><br/>{card.quiz.explanation}</p>}
        </section> : <div className={styles.columns}><section><h4>开始前</h4><ul>{card.preconditions.map(t=><li key={t}>{t}</li>)}</ul></section><section><h4>怎么做</h4><ol>{card.steps.map(t=><li key={t}>{t}</li>)}</ol></section></div>}
        <section className={styles.checks}><div><h4>本次核对</h4><small>{checks.length} / {card.diagnostics.length}</small></div>{card.diagnostics.map((t,i)=><label key={t}><input type="checkbox" checked={checks.includes(i)} onChange={()=>setChecked(s=>({...s,[card.id]:checks.includes(i)?checks.filter(x=>x!==i):[...checks,i]}))}/>{t}</label>)}</section>
        <section><h4>留下什么</h4><ul>{card.outputs.map(t=><li key={t}>{t}</li>)}</ul></section>
        {group&&onAppendGroup&&<section className={styles.proposal} aria-label="候选题组预览">
          <button type="button" aria-expanded={preview===card.id} onClick={()=>setPreview(preview===card.id?'':card.id)}>预览题组 · {group.design.questions.length} 题</button>
          {preview===card.id&&<><ol>{group.design.questions.map(q=><li key={q.id}><strong>{q.text}</strong><small>{QUESTION_TYPES[q.type]}{q.condition?` · 仅在第 ${group.design.questions.findIndex(p=>p.id===q.condition?.questionId)+1} 题选择 ${q.condition.codes.join('/')} 时显示`:''}</small>{q.choices.length>0&&<p>{q.choices.map(c=>`${c.code} ${c.label}`).join(' · ')}</p>}{q.type==='likert'&&<p>{q.min} {q.minLabel} — {q.max} {q.maxLabel}</p>}</li>)}</ol><button type="button" disabled={appendDisabled} onClick={()=>{if(onAppendGroup(group.id)){setPreview('');setNotice(`已追加 ${group.design.questions.length} 题，可在问卷中编辑或撤销。`);}}}>追加到当前问卷 · {group.design.questions.length} 题</button></>}
        </section>}
        <details className={styles.sources}><summary>方法依据与适用范围</summary><ul>{card.limits.map(t=><li key={t}>{t}</li>)}</ul>{card.sourceRefs.map(r=>{const source=MATERIAL_SOURCES.find(s=>s.id===r.sourceId);return <div key={r.sourceId}><strong>{source?.filename}</strong><p>{r.locators.join('；')}</p><small>{source?.scope} · SHA256 {source?.sha256}</small></div>;})}</details>
        {notice&&<p role="status" className={styles.notice}>{notice}</p>}
      </article>}
    </div>
  </details>;
}
