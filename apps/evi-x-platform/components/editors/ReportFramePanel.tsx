'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {CHART_THEMES} from '@/lib/chart-theme';
import {approveReportFrame,createReportFrame,frameSVG,type ReportFrameStyle} from '@/lib/report-frame';
import type {ProjectVisualStyle} from '@/lib/report-figure';
import styles from './ReportFramePanel.module.css';

type Props={frame?:ReportFrameStyle;visualStyle:ProjectVisualStyle;reviewer:string;onApply:(frame:ReportFrameStyle|undefined)=>void;onPalette:(style:ProjectVisualStyle)=>void;disabled?:boolean};
function PageStudy({frame,label}:{frame?:ReportFrameStyle;label:string}){
 let svg='',error='';try{if(frame)svg=frameSVG(frame);}catch(e){error=(e as Error).message;}
 return <figure className={styles.study}><div className={styles.page}>
  {svg&&<div className={styles.decoration} aria-hidden="true" dangerouslySetInnerHTML={{__html:svg}}/>}
  <div className={styles.textStudy} aria-hidden="true"><b>研究发现</b><i/><i/><i/><i/><div className={styles.figureStudy}>{[42,68,55,84,61].map((h,i)=><span key={i} style={{height:`${h}%`,background:frame?.palette.primary??'#74828B'}}/>)}</div><i/><i/><i/></div>
 </div><figcaption>{label}</figcaption>{error&&<p className={styles.error}>{error}</p>}</figure>;
}
/** Only the candidate panel remounts after application; the report editor stays mounted. */
export default function ReportFramePanel({frame,visualStyle,reviewer,onApply,onPalette,disabled=false}:Props){
 const [draft,setDraft]=useState<ReportFrameStyle>(()=>frame?{...frame,status:'vector_draft',review:null}:createReportFrame(visualStyle)),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),latest=useRef({onApply,disabled});
 useLayoutEffect(()=>{latest.current={onApply,disabled};},[onApply,disabled]);
 useLayoutEffect(()=>()=>{generation.current++;},[]);
 function change(patch:Partial<ReportFrameStyle>){generation.current++;setDraft({...draft,...patch,status:'vector_draft',review:null});setMessage('');setBusy(false);}
 async function apply(){const ticket=++generation.current;setBusy(true);try{const next=await approveReportFrame(draft,reviewer);if(ticket!==generation.current||latest.current.disabled)return;latest.current.onApply(next);setMessage('页框已应用。');}catch(e){if(ticket===generation.current)setMessage((e as Error).message);}finally{if(ticket===generation.current)setBusy(false);}}
 const paletteMismatch=draft.palette.id!==visualStyle.paletteId||draft.palette.version!==visualStyle.version;
 return <details className={styles.panel}><summary><span className={styles.icon} aria-hidden="true">⌑</span><strong>主题页框</strong><span>{frame?frame.title:'无页框'}</span><small>A4 · 正文版心 146.4 × 246.2 mm</small></summary>
 <div className={styles.body}><header><div><p className={styles.eyebrow}>PAGE FRAME</p><h4>让题材、图表与页面成为一体</h4><p>先比较留白与轻重，再应用到作品。</p></div><label>全文配色<select aria-label="全文配色" disabled={disabled} value={visualStyle.paletteId} onChange={e=>onPalette({...visualStyle,paletteId:e.target.value as ProjectVisualStyle['paletteId'],version:visualStyle.version+1})}>{CHART_THEMES.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label></header>
 <div className={styles.comparisons}><PageStudy label="无框"/><PageStudy frame={frame} label="当前作品"/><PageStudy frame={draft} label="候选方案"/></div>
 <fieldset disabled={disabled||busy} className={styles.controls}><label>主题语言<select value={draft.theme} onChange={e=>{const next=createReportFrame(visualStyle,e.target.value as ReportFrameStyle['theme']);change({...next,appliesTo:draft.appliesTo});}}><option value="finance-grid">几何连接</option><option value="sports-track">运动轨迹</option></select></label><label>页面变体<select value={draft.variant} onChange={e=>change({variant:e.target.value as ReportFrameStyle['variant']})}><option value="body">正文 · 轻量</option><option value="chapter">章节 · 增强</option><option value="cover">封面 · 主题构图</option></select></label><label>框线形式<select value={draft.layout} onChange={e=>change({layout:e.target.value as ReportFrameStyle['layout']})}><option value="corners">边角</option><option value="open">开放框</option><option value="closed">闭合框</option><option value="none">无框</option></select></label>
 {([['lineWidthPt','线宽 / pt',.25,2,.05],['cornerSizeMm','角花 / mm',2,16,1],['density','纹样密度',0,1,.05],['strength','颜色强度',0,1,.05]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<output>{draft[key]}</output><input aria-label={label} type="range" min={min} max={max} step={step} value={draft[key]} onChange={e=>change({[key]:Number(e.target.value)})}/></label>)}
 </fieldset><fieldset disabled={disabled||busy} className={styles.scope}><legend>应用范围</legend>{([['body','正文'],['cover','封面'],['appendix','附录']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={draft.appliesTo.includes(key)} onChange={e=>{const next=e.target.checked?[...draft.appliesTo,key]:draft.appliesTo.filter(x=>x!==key);if(next.length)change({appliesTo:next});}}/>{label}</label>)}</fieldset>
 <footer>{paletteMismatch?<button type="button" disabled={disabled} onClick={()=>{const colors=CHART_THEMES.find(t=>t.id===visualStyle.paletteId)!.colors;change({palette:{id:visualStyle.paletteId,version:visualStyle.version,primary:colors[0],secondary:colors[2%colors.length],accent:colors[4%colors.length]}});}}>同步全文配色</button>:<span className={styles.swatches}>{[draft.palette.primary,draft.palette.secondary,draft.palette.accent].map(c=><i key={c} style={{background:c}}/>)}<small>正文外保留 3 mm</small></span>}<div><button type="button" disabled={disabled||busy} onClick={()=>onApply(undefined)}>使用无页框</button><button className={styles.primary} type="button" disabled={disabled||busy||paletteMismatch} onClick={apply}>{busy?'正在应用…':'应用候选页框'}</button></div></footer>{message&&<p role="status" className={styles.message}>{message}</p>}
 </div></details>;
}
