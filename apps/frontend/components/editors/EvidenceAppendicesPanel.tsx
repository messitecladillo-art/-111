"use client";
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {EditorContent,ReportSection} from '@/lib/editor-model';
import {APPENDIX_LABELS,createEvidenceAppendixProposal,parseAiUsageLedger,type AiUsageLedger,type AppendixKind,type EvidenceAppendixProposal} from '@/lib/evidence-appendices';
import {useContentReveal} from '../motion/useWorkspaceMotion';
import styles from './EvidenceAppendicesPanel.module.css';

const kinds:AppendixKind[]=['data','ai','claims'];

function inputSignature(base:string,projectId:string|undefined,aiLedger:unknown):string{
  try{return JSON.stringify({base,projectId,aiLedger});}catch{return 'invalid-ledger';}
}

function appendixDisplayLabel(kind:AppendixKind):string{
  return kind==='ai'?'智能辅助使用记录':APPENDIX_LABELS[kind];
}

function cleanPreviewText(raw:string):string{
  return raw
    .replace(/[\u300c\u300e]/gu,'“')
    .replace(/[\u300d\u300f]/gu,'”')
    .replace(/\u3010([^\u3011]+)\u3011/gu,'（$1）')
    .replace(/[{}]/gu,'')
    .replace(/\btokens?\b/giu,'词元')
    .replace(/AI\s*使用记录/gu,'智能辅助使用记录')
    .replace(/AI\s*使用凭据/gu,'智能辅助使用凭据')
    .replace(/使用过\s*AI/gu,'使用过智能辅助工具')
    .replace(/未使用\s*AI/gu,'未使用智能辅助工具')
    .replace(/\bPPT\b/gu,'演示文稿');
}

function cleanPreviewBody(raw:string):string{
  return cleanPreviewText(raw)
    .replace(/区间\s*\[([^\]]+)\]/gu,'置信区间（$1）')
    .replace(/\[([^\]]+)\]/gu,'（$1）')
    .replace(/SHA-256[：:]\s*/gu,'校验码 ')
    .replace(/(^|\n|；)([\u4e00-\u9fffA-Za-z0-9\s（）()/－-]{1,18})：/gu,'$1$2 · ');
}

export default function EvidenceAppendicesPanel({content,projectId,aiLedger,disabled=false,onApply,onRefreshAi,aiLoading=false}:{
  content:EditorContent;projectId?:string;aiLedger?:unknown;disabled?:boolean;
  onRefreshAi?:()=>void;aiLoading?:boolean;
  onApply:(sections:ReportSection[],base:string)=>boolean;
}){
  const [proposal,setProposal]=useState<{signature:string;value:EvidenceAppendixProposal}|null>(null);
  const [selected,setSelected]=useState<AppendixKind[]>([...kinds]),[active,setActive]=useState<AppendixKind>('data');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const alive=useRef(true),operation=useRef(false),generation=useRef(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const signature=useMemo(()=>inputSignature(JSON.stringify(content),projectId,aiLedger),[content,projectId,aiLedger]);
  const current=proposal?.signature===signature;
  const aiSummary=useMemo<AiUsageLedger|null>(()=>{
    try{return parseAiUsageLedger(aiLedger,projectId);}catch{return null;}
  },[aiLedger,projectId]);
  const previewReveal=useContentReveal<HTMLDivElement>({token:proposal?.signature??null});
  const sections=proposal?.value.sections.filter(s=>selected.some(kind=>proposal.value.groups[kind].includes(s.id)))??[];
  const newCount=sections.filter(s=>!content.report.some(r=>r.id===s.id)).length;
  const live={signature,proposal,selected,confirmed,busy,disabled,aiLoading,onApply,onRefreshAi,sections,newCount};
  const latest=useRef<typeof live|null>(null);
  // Only callbacks from the latest committed render may use its confirmation.
  useLayoutEffect(()=>{latest.current=live;return()=>{if(latest.current===live)latest.current=null;};});
  async function prepare(){
    const gate=latest.current;
    if(!alive.current||gate!==live||operation.current||gate.disabled||gate.aiLoading||gate.busy)return;
    latest.current=null;operation.current=true;const request=++generation.current;
    setBusy(true);setError('');setMessage('');setConfirmed(false);
    try{const value=await createEvidenceAppendixProposal(content,{projectId,aiLedger});if(alive.current&&generation.current===request)setProposal({signature,value});}
    catch(e){if(alive.current&&generation.current===request)setError((e as Error).message);}
    finally{operation.current=false;if(alive.current&&generation.current===request)setBusy(false);}
  }
  function toggle(kind:AppendixKind){
    const gate=latest.current;if(gate!==live||gate.disabled||gate.busy||gate.aiLoading)return;
    latest.current=null;setSelected(value=>value.includes(kind)?value.filter(k=>k!==kind):[...value,kind]);setConfirmed(false);setMessage('');
  }
  function confirm(value:boolean){
    const gate=latest.current;if(gate!==live||gate.disabled||gate.busy||gate.aiLoading||!gate.sections.length)return;
    latest.current=null;setConfirmed(value);
  }
  function refresh(){
    const gate=latest.current;if(gate!==live||gate.disabled||gate.busy||gate.aiLoading||!gate.onRefreshAi)return;
    latest.current=null;setConfirmed(false);gate.onRefreshAi();
  }
  function apply(){
    const gate=latest.current;
    if(!alive.current||gate!==live||operation.current||gate.signature!==signature||gate.proposal!==proposal||gate.selected!==selected||!gate.confirmed||gate.disabled||gate.busy||gate.aiLoading||!gate.sections.length||!gate.proposal||gate.proposal.signature!==gate.signature)return;
    // Consume before entering a parent callback, including a same-event replay.
    latest.current=null;
    try{
      if(!gate.onApply(structuredClone(gate.sections),gate.proposal.value.base)){setError('作品已变化或暂不可写入，请重新生成预览。');return;}
      setMessage(gate.newCount?`已添加 ${gate.newCount} 节附录。`:'所选附录已在报告中，保留现有内容。');setProposal(null);setConfirmed(false);setError('');
    }catch(e){setError((e as Error).message);}
  }
  return <details className={styles.panel}>
    <summary><span className={styles.mark} aria-hidden="true">≡</span><span><strong>证据附录</strong><small>来源与口径 · 智能辅助记录 · 主张对应</small></span><span className={styles.summaryAction}>整理成提案</span></summary>
    <div className={styles.body}>
      <header><div><span className={styles.kicker}>研究记录 · 随稿留存</span><h4>把依据随作品交代清楚</h4><p>根据当前保存的分析与发现整理。先核对，再选择加入哪些附录；原有章节保持完整。</p></div><div className={styles.headerActions}>{onRefreshAi&&<button type="button" disabled={disabled||busy||aiLoading} onClick={refresh}>{aiLoading?'正在更新辅助记录…':'更新辅助记录'}</button>}<button type="button" className={styles.primary} disabled={disabled||busy||aiLoading} onClick={()=>void prepare()}>{busy?'正在核对记录…':proposal?'重新生成预览':'生成附录预览'}</button></div></header>
      <div className={styles.coverage} aria-label="当前记录概况"><div><span>分析结果</span><b>{content.quality?.results.length??0}</b><small>按保存版本登记</small></div><div><span>研究发现</span><b>{content.quality?.findings.length??0}</b><small>保留确认与复核状态</small></div><div><span>智能辅助记录</span><b>{aiLoading?'…':aiSummary?.coverage==='partial'?aiSummary.records.length:'—'}</b><small>{aiLoading?'正在更新本人记录…':aiSummary?.coverage==='partial'?(aiSummary.scope?'仅含本人问卷提案最近 200 条，其他模块、队友与外部工具未覆盖':'仅含部分凭据，完整覆盖范围尚未核验'):'项目级使用凭据尚未接入'}</small></div></div>
      {error&&<p role="alert" className={styles.error}>{cleanPreviewBody(error)}</p>}
      {message&&<p role="status" aria-live="polite" className={styles.message}>{message}</p>}
      {proposal&&<div ref={previewReveal} className={styles.preview}>
        {!current?<p role="status" className={styles.stale}>作品或记录已变化，请重新生成后确认。</p>:<>
          <fieldset className={styles.choices} disabled={disabled||busy||aiLoading}><legend>加入报告的内容</legend>{kinds.map((kind,index)=><label key={kind} data-selected={selected.includes(kind)}><input type="checkbox" aria-label={`选择将“${appendixDisplayLabel(kind)}”加入报告`} checked={selected.includes(kind)} onChange={()=>toggle(kind)}/><span><b>{String(index+1).padStart(2,'0')}</b><strong>{appendixDisplayLabel(kind)}</strong><small>{proposal.value.groups[kind].length} 节</small></span></label>)}</fieldset>
          <div className={styles.reader}><nav aria-label="附录预览类别">{kinds.map(kind=><button key={kind} type="button" aria-label={`预览${appendixDisplayLabel(kind)}`} aria-pressed={active===kind} onClick={()=>setActive(kind)}>{appendixDisplayLabel(kind)}</button>)}</nav><div className={styles.pages}>{proposal.value.sections.filter(s=>proposal.value.groups[active].includes(s.id)).map(s=><article key={s.id}><h5>{cleanPreviewText(s.title)}</h5><p>{cleanPreviewBody(s.body)}</p><footer>{cleanPreviewBody(s.source)}</footer></article>)}</div></div>
          {proposal.value.coverage.legacyReceiptCount>0&&<p role="status" className={styles.gap}>{proposal.value.coverage.legacyReceiptCount} 项历史结果缺少计算凭据，附录已标出未登记项。</p>}
          <div className={styles.apply}><label><input type="checkbox" aria-label={`确认已核对所选 ${sections.length} 节附录并追加到报告`} checked={confirmed} disabled={disabled||busy||aiLoading||!sections.length} onChange={e=>confirm(e.target.checked)}/><span>我已核对所选 {sections.length} 节，确认追加到报告。</span></label><button type="button" className={styles.primary} disabled={!confirmed||disabled||busy||aiLoading||!sections.length} onClick={apply}>{newCount?`添加 ${newCount} 节附录`:'核对已添加附录'}</button></div>
          <p className={styles.footnote}>相同版本会识别为已添加；修改过的同名记录保留原文。应用后可在报告中自由调整与撤销。</p>
        </>}
      </div>}
    </div>
  </details>;
}
