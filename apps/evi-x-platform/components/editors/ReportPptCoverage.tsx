'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {EditorContent,Slide} from '@/lib/editor-model';
import {buildReportBlockSlide,reportFigureCoverage,reportLinkState,type FigureCoverage} from '@/lib/report-storyboard';
import styles from './QualityStudio.module.css';
type Props={content:EditorContent;disabled:boolean;onApply:(next:EditorContent)=>boolean|void;renderPreview:(slide:Slide)=>ReactNode};
export default function ReportPptCoverage({content,disabled,onApply,renderPreview}:Props){
  const [coverage,setCoverage]=useState<{base:string;figures:FigureCoverage[];chapters:{id:string;pages:number[];review:boolean}[]}|null>(null);
  const [excerpts,setExcerpts]=useState<Record<string,string>>({}),[pending,setPending]=useState<{base:string;key:string;excerpt:string;slide:Slide}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),operation=useRef(false),base=JSON.stringify(content);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{let live=true;const snapshot=structuredClone(content);void (async()=>{
    const figures=await reportFigureCoverage(snapshot),chapters=[];
    for(const section of snapshot.report){const pages:number[]=[];let review=false;for(const [i,s] of snapshot.slides.entries())if(s.reportLink?.sectionId===section.id){pages.push(i+1);review||=await reportLinkState(snapshot,s)!=='current';}chapters.push({id:section.id,pages,review});}
    if(live)setCoverage({base,figures,chapters});
  })().catch(()=>{if(live)setCoverage(null);});return()=>{live=false;};},[content,base]);
  async function prepare(sectionId:string,blockId:string,key:string,excerpt:string){
    if(disabled||operation.current)return;operation.current=true;setBusy(true);setError('');
    try{const slide=await buildReportBlockSlide(content,sectionId,blockId,excerpt);if(alive.current)setPending({base,key,excerpt,slide});}
    catch(e){if(alive.current)setError((e as Error).message);}finally{operation.current=false;if(alive.current)setBusy(false);}
  }
  const current=coverage?.base===base,validPending=pending?.base===base&&(!pending||pending.excerpt===(excerpts[pending.key]??content.report.find(s=>s.id===pending.slide.reportLink?.sectionId)?.body));
  return <section aria-label="报告与PPT图文对应" className={styles.coverage}>
    <h4>报告 → PPT · 图文对应</h4>
    <p>从报告选择证据与讲述重点，逐页组织。新增页面保留原有 PPT。</p>
    <div className={styles.coverageChapters}>{content.report.map(s=>{const entry=current?coverage.chapters.find(c=>c.id===s.id):null;return <p key={s.id}><strong>{s.title}</strong><span>{entry?.pages.length?'第 '+entry.pages.join('、')+' 页'+(entry.review?' · 待复核':' · 版本一致'):'尚未编排'}</span></p>;})}</div>
    {content.report.flatMap(section=>(section.blocks??[]).filter(b=>['chart','table'].includes(b.kind)).map(block=>{
      const key=JSON.stringify([section.id,block.id]),entry=current?coverage.figures.find(f=>f.sectionId===section.id&&f.blockId===block.id):null,excerpt=excerpts[key]??section.body;
      return <article key={key} className={styles.section}>
        <strong>{block.text||section.title}</strong>
        <p>{!entry?'核对中…':entry.state==='unused'?'尚未进入PPT':entry.state==='review'?'第 '+entry.pages.join('、')+' 页 · 待复核':'第 '+entry.pages.join('、')+' 页 · 已编排'}</p>
        <label>PPT 讲述重点<textarea aria-label={'PPT讲述重点：'+(block.text||section.title)} disabled={disabled||busy} maxLength={600} value={excerpt} onChange={e=>setExcerpts({...excerpts,[key]:e.target.value})}/></label>
        <button type="button" disabled={disabled||busy||content.slides.length>=40} onClick={()=>void prepare(section.id,block.id,key,excerpt)}>预览图文页</button>
      </article>;
    }))}
    {error&&<p role="alert">{error}</p>}
    {pending&&<div className={styles.proposal} aria-label="报告图文页提案">
      <h4>{pending.slide.title}</h4>{renderPreview(pending.slide)}
      {!validPending&&<p role="status">报告、页面或讲述重点已更新，请重新预览。</p>}
      <div className={styles.actions}><button type="button" disabled={disabled||busy||!validPending} onClick={()=>{if(pending.base!==JSON.stringify(content)){setError('作品已更新，请重新预览。');return;}if(onApply({...content,slides:[...content.slides,pending.slide]})!==false)setPending(null);}}>追加到PPT</button><button type="button" onClick={()=>setPending(null)}>取消</button></div>
    </div>}
  </section>;
}
