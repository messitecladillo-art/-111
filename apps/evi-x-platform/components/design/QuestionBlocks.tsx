"use client";
import { useState } from 'react';
import { QUESTION_BLOCKS, appendQuestionBlocks, appendScaleBlock, type QuestionBlockId } from '@/lib/research-blocks';
import type { Questionnaire } from '@/lib/questionnaire';
import styles from './ResearchBlocks.module.css';

export default function QuestionBlocks({ design, onAppend }: { design: Questionnaire; onAppend: (next: Questionnaire) => void }) {
  const [selected,setSelected] = useState<QuestionBlockId[]>([]), [topic,setTopic] = useState('就业与成长支持');
  const [construct,setConstruct] = useState(''), [lines,setLines] = useState(''), [points,setPoints] = useState<5|7>(5);
  const [low,setLow] = useState('非常不同意'), [high,setHigh] = useState('非常同意'), [source,setSource] = useState(''), [error,setError] = useState('');
  const count = selected.reduce((sum,id) => sum + (QUESTION_BLOCKS.find(b=>b.id===id)?.count || 0),0);
  function add(scale=false) {
    try { const next = scale ? appendScaleBlock(design,{construct,lines,points,minLabel:low,maxLabel:high,source},()=>crypto.randomUUID()) : appendQuestionBlocks(design,selected,topic,()=>crypto.randomUUID()); onAppend(next); setSelected([]); setError(''); }
    catch(e) { setError((e as Error).message); }
  }
  return <div className={styles.builder}>
    <div className={styles.heading}><div><h3>按研究问题选择题组</h3><p>所选模块按顺序追加到题目末尾，整批可撤销。</p></div><span>自编草稿 · 不是成熟量表</span></div>
    <p>尚未加入问卷的模块选择与题组输入不包含在备份中；请先加入问卷再下载保存。</p>
    <div className={styles.topic}><label>本次研究主题<input value={topic} maxLength={60} onChange={e=>setTopic(e.target.value)}/></label><p>默认主题为就业研究，请按调查对象修改主题与题目。</p></div>
    <div className={styles.tiles} aria-label="问卷模块选项">{QUESTION_BLOCKS.map(block=> <button type="button" key={block.id} aria-pressed={selected.includes(block.id)} onClick={()=>setSelected(prev=>prev.includes(block.id)?prev.filter(id=>id!==block.id):[...prev,block.id])}><span>{block.stage}<b>{selected.includes(block.id)?'已选':'＋'}</b></span><strong>{block.title}</strong><p>{block.description}</p><small>{block.count} 道题 · 可继续逐题编辑</small></button>)}</div>
    <div className={styles.tray}><div><strong>已选 {selected.length} 个模块 · 新增 {count} 题</strong><p>{selected.map(id=>QUESTION_BLOCKS.find(b=>b.id===id)?.title).join(' / ') || '按研究需要选择模块。'}</p></div><button type="button" className={styles.primary} disabled={!count || design.questions.length+count>80} onClick={()=>add()}>加入问卷 · {count} 题</button></div>
    {design.questions.length+count>80&&<p role="alert">合计超过 80 题，请减少所选模块。</p>}
    <details className={styles.scale}><summary>自定义量表题组 · 一次添加多道题</summary><p>每行一题，共享计分范围和来源。相同计分范围不等于同一构念；反向题加入后须逐题勾选，系统不自动判断。</p><div className={styles.fields}><label>构念 / 维度<input value={construct} maxLength={120} onChange={e=>setConstruct(e.target.value)} placeholder="例如：职业认同（须有理论依据）"/></label><label>计分点数<select value={points} onChange={e=>setPoints(Number(e.target.value) as 5|7)}><option value={5}>1–5 点</option><option value={7}>1–7 点</option></select></label></div><label>量表题项 · 每行一题<textarea value={lines} rows={5} maxLength={7212} onChange={e=>setLines(e.target.value)} placeholder="粘贴经授权的量表题项，或填写待预试的自编题项"/></label><div className={styles.fields}><label>1 分含义<input value={low} maxLength={120} onChange={e=>setLow(e.target.value)}/></label><label>{points} 分含义<input value={high} maxLength={120} onChange={e=>setHigh(e.target.value)}/></label></div><label>来源与改编说明<textarea value={source} maxLength={500} rows={2} onChange={e=>setSource(e.target.value)} placeholder="文献、版本、授权情况、适用对象、改编理由；自编则明确标注"/></label><button type="button" onClick={()=>add(true)}>加入自定义题组</button></details>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <details className={styles.guide}><summary>从拼装到正式发放，还需要做什么？</summary><ol><li>明确对象、参照期、抽样框与招募方式；便利抽样不等于总体代表性。</li><li>每个研究题对应研究问题、变量、分析和决策；删除无明确用途的题。</li><li>核对互斥与穷尽、拒答与不适用、敏感信息最小化；筛选题不会自动连接下游。</li><li>请目标对象解释他们如何理解题目，记录认知访谈与预试修改，再检查跳题路径。</li><li>量表来源、反向计分、信度和效度分别论证；题目已拼装不代表问卷已验证。</li></ol></details>
  </div>;
}
