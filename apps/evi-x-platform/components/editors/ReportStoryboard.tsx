"use client";
import {useEffect,useRef,useState} from 'react';
import type {EditorContent,Slide} from '@/lib/editor-model';
import {blankStoryCard,buildStoryboard,LINK_LABELS,reportLinkState,selectMainSources,STORY_CLASSES,STORY_JOBS,type LinkState,type StoryCard,type StorySourceSelection} from '@/lib/report-storyboard';
import {QualitySlidePreview} from './QualityStudio';
import styles from './ReportStoryboard.module.css';
import {useContentReveal,useKeyedListMotion} from '../motion/useWorkspaceMotion';

export function ReportLinkNotice({content,slide}:{content:EditorContent;slide:Slide}){
  const signature=JSON.stringify({report:content.report,quality:content.quality,figures:content.figures,visualStyle:content.visualStyle,slide});
  const [result,setResult]=useState<{signature:string;state:LinkState}|null>(null);
  useEffect(()=>{let live=true;reportLinkState(content,slide).then(state=>{if(live)setResult({signature,state});}).catch(()=>{if(live)setResult(null);});return()=>{live=false;};},[content,slide,signature]);
  if(!slide.reportLink)return null;
  const state=result?.signature===signature?result.state:null;
  return <p role="status" className={styles.linkNotice} data-warning={state!=='current'}>{state?LINK_LABELS[state]:'正在核对报告关联指纹…'}。关联记录只检查编辑变化，不判断事实真假；不会自动覆盖报告或 PPT。</p>;
}

const blockLabels={paragraph:'段落',callout:'重点说明',citation:'引用',chart:'图表',table:'表格',formula:'公式'};
function visualCount(content:EditorContent,sources:StorySourceSelection[]){
  return sources.reduce((count,ref)=>count+ref.blockIds.filter(id=>content.report.find(s=>s.id===ref.sectionId)?.blocks?.some(b=>b.id===id&&['chart','table'].includes(b.kind))).length,0);
}
function SourcePicker({content,card,onChange}:{content:EditorContent;card:StoryCard;onChange:(sources:StorySourceSelection[])=>void}){
  const [query,setQuery]=useState('');
  const sources=card.sources??[],count=visualCount(content,sources),needle=query.trim().toLocaleLowerCase();
  function toggleSection(sectionId:string,checked:boolean){onChange(checked?[...sources,{sectionId,blockIds:[]}]:sources.filter(s=>s.sectionId!==sectionId));}
  function toggleBlock(sectionId:string,blockId:string,checked:boolean){onChange(sources.map(s=>s.sectionId===sectionId?{...s,blockIds:checked?[...s.blockIds,blockId]:s.blockIds.filter(id=>id!==blockId)}:s));}
  return <section className={styles.sourcePicker} aria-label="本页多来源选择">
    <div className={styles.selectionHeading}><strong>组合本页证据</strong><span>{sources.length} / 12 个来源 <b>{count} / 2 幅图表</b></span></div>
    <p className={styles.selectionHelp}>复用报告中的图表及其数据版本。段落可加入摘要，章节也可仅作为背景来源。</p>
    <label className={styles.sourceSearch}><span>查找章节</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入章节标题"/></label>
    <div className={styles.chapterChoices} aria-label="来源章节">
      {content.report.filter(s=>!needle||s.title.toLocaleLowerCase().includes(needle)).map(s=>{
        const checked=sources.some(ref=>ref.sectionId===s.id);
        return <label key={s.id}><input type="checkbox" checked={checked} disabled={s.id===card.sectionId||(!checked&&sources.length>=12)} onChange={e=>toggleSection(s.id,e.target.checked)}/><span>{s.title||'未命名章节'}{s.id===card.sectionId&&<small>主讲章节</small>}</span></label>;
      })}
    </div>
    <div className={styles.selectedSources}>
      {sources.map(ref=>{const section=content.report.find(s=>s.id===ref.sectionId);return <details key={ref.sectionId} open>
        <summary>{section?.title||'来源章节已移除'}<span>{ref.blockIds.length} 个内容块</span></summary>
        {ref.sectionId!==card.sectionId&&<button type="button" className={styles.clearSelection} onClick={()=>toggleSection(ref.sectionId,false)}>移除此来源</button>}
        {!section?<p className={styles.selectionHelp}>请移除失效来源后重新选择。</p>:<>
          <div className={styles.blockChoices}>{section.blocks?.filter(b=>b.kind!=='formula').map(block=>{
            const checked=ref.blockIds.includes(block.id),visual=['chart','table'].includes(block.kind);
            return <label key={block.id} data-selected={checked}><input type="checkbox" checked={checked} disabled={!checked&&visual&&count>=2} onChange={e=>toggleBlock(section.id,block.id,e.target.checked)}/><span><small>{blockLabels[block.kind]}{block.figureId?' · 共享图形':''}</small><span className={styles.blockText}>{block.text||content.figures?.find(f=>f.id===block.figureId)?.title||'未命名内容块'}</span></span></label>;
          })}</div>
          {!section.blocks?.some(b=>b.kind!=='formula')&&<p className={styles.selectionHelp}>此章以正文作为背景。可先在报告中添加图表或内容块，再回到这里选择。</p>}
          {!!ref.blockIds.length&&<button type="button" className={styles.clearSelection} onClick={()=>onChange(sources.map(s=>s.sectionId===ref.sectionId?{...s,blockIds:[]}:s))}>清空本章内容块</button>}
        </>}
      </details>;})}
    </div>
    <p className={styles.selectionHelp}>一页保留最多两幅图表。预览若提示拥挤，请改为单图或拆页；应用后仍可自由调整对象。</p>
  </section>;
}

export default function ReportStoryboard({content,disabled,onApply,onClose}:{content:EditorContent;disabled:boolean;onApply:(slides:Slide[],base:string,contentVersion?:3)=>boolean;onClose:()=>void}){
  const [cards,setCards]=useState<StoryCard[]>(()=>[blankStoryCard(content.report[0].id)]);
  const [mode,setMode]=useState<'append'|'replace'>('append'),[selected,setSelected]=useState(0),[minutes,setMinutes]=useState(10);
  const [preview,setPreview]=useState<{signature:string;base:string;slides:Slide[];contentVersion?:3}|null>(null),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const alive=useRef(true),operation=useRef(false),sourceDrafts=useRef(new Map<string,StorySourceSelection[]>());
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const card=cards[selected],source=content.report.find(s=>s.id===card.sectionId),multi=Boolean(card.sources);
  const base=JSON.stringify(content),signature=JSON.stringify({base,cards,mode});
  const current=preview?.signature===signature;
  function change(next:StoryCard[]){setCards(next);setConfirmed(false);setError('');}
  function patch(p:Partial<StoryCard>){change(cards.map((c,i)=>i===selected?{...c,...p}:c));}
  function selectMain(sectionId:string){try{const sources=card.sources?selectMainSources(card.sources,sectionId):undefined;patch({sectionId,excerpt:'',locator:'',...(sources?{sources}:{})});}catch(e){setError((e as Error).message);}}
  function sourceMode(combine:boolean){if(combine===Boolean(card.sources))return;const next={...card};if(combine){const previous=sourceDrafts.current.get(card.id);next.sources=previous?.[0]?.sectionId===card.sectionId?structuredClone(previous):[{sectionId:card.sectionId,blockIds:[]}];}else{sourceDrafts.current.set(card.id,structuredClone(card.sources!));delete next.sources;}change(cards.map((c,i)=>i===selected?next:c));}
  function move(delta:number){const to=selected+delta;if(to<0||to>=cards.length)return;const next=[...cards];[next[selected],next[to]]=[next[to],next[selected]];change(next);setSelected(to);}
  async function prepare(){
    if(operation.current||disabled)return;operation.current=true;setBusy(true);setError('');setConfirmed(false);
    try{const slides=await buildStoryboard(content,cards,mode);if(alive.current)setPreview({signature,base,slides,...(cards.some(c=>c.sources)?{contentVersion:3 as const}:{})});}
    catch(e){if(alive.current)setError((e as Error).message);}finally{operation.current=false;if(alive.current)setBusy(false);}
  }
  const total=cards.reduce((sum,c)=>sum+(Number.isFinite(c.seconds)?c.seconds:0),0);
  const directoryMotion=useKeyedListMotion<HTMLElement>({ids:cards.map(c=>c.id),activeId:card.id});
  const previewReveal=useContentReveal<HTMLDivElement>({token:preview?.signature??null});
  const sourceReveal=useContentReveal<HTMLElement>({token:card.sectionId});
  return <section className={styles.board} aria-label="报告分镜工作台">
    <header><div><span className={styles.kicker}>报告依据 · 逐页重组</span><h3>组织一页要讲清的内容</h3><p>从报告中选择原文与图表，保留各自来源。页序、讲法和对象位置由你决定。</p></div><button type="button" onClick={onClose} disabled={busy}>收起分镜</button></header>
    <div className={styles.topbar}><label>写入方式<select value={mode} disabled={disabled||busy} onChange={e=>{setMode(e.target.value as 'append'|'replace');setConfirmed(false);}}><option value="append">追加，保留现有 {content.slides.length} 页</option><option value="replace">替换现有全部幻灯片</option></select></label><label>排练目标（分钟）<input type="number" min={1} max={60} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><span>{cards.length} 张分镜 · 预计 {Math.floor(total/60)} 分 {total%60} 秒{Number.isFinite(minutes)&&total>minutes*60?'，超过排练目标':''}</span></div>
    <div className={styles.grid}><nav ref={directoryMotion} aria-label="分镜顺序"><span className={styles.motionMarker} data-motion-marker aria-hidden="true"/>{cards.map((c,i)=><button type="button" key={c.id} data-motion-id={c.id} aria-current={selected===i?'step':undefined} onClick={()=>setSelected(i)}><b>{String(i+1).padStart(2,'0')}</b><span>{c.title||'尚未填写标题'}<small>{STORY_JOBS[c.job]} · {c.seconds} 秒</small></span></button>)}<button type="button" disabled={disabled||busy||cards.length>=40} onClick={()=>{change([...cards,blankStoryCard(source?.id||content.report[0].id)]);setSelected(cards.length);}}>添加一页分镜</button></nav>
    <fieldset disabled={disabled||busy} className={styles.fields}><legend>第 {selected+1} 页</legend><div className={styles.actions}><button type="button" disabled={selected===0} onClick={()=>move(-1)}>分镜上移</button><button type="button" disabled={selected===cards.length-1} onClick={()=>move(1)}>分镜下移</button><button type="button" disabled={cards.length===1} onClick={()=>{change(cards.filter((_,i)=>i!==selected));setSelected(Math.max(0,selected-1));}}>移除此分镜</button></div>
      <div className={styles.sourceModes} role="group" aria-label="分镜来源方式"><button type="button" aria-pressed={!multi} onClick={()=>sourceMode(false)}>单章讲述</button><button type="button" aria-pressed={multi} onClick={()=>sourceMode(true)}>多证据组合</button></div>
      <label>主讲章节<select value={card.sectionId} onChange={e=>selectMain(e.target.value)}>{!source&&<option value={card.sectionId}>原章节已移除</option>}{content.report.map(s=><option value={s.id} key={s.id} disabled={Boolean(card.sources&&card.sources.length>=12&&!card.sources.some(ref=>ref.sectionId===s.id))}>{s.title||'未命名章节'}</option>)}</select></label>
      {multi&&<SourcePicker key={card.id} content={content} card={card} onChange={sources=>patch({sources})}/>}
      <div className={styles.pair}><label>本页任务<select value={card.job} onChange={e=>patch({job:e.target.value as StoryCard['job']})}>{Object.entries(STORY_JOBS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><label>内容类别<select value={card.classification} onChange={e=>patch({classification:e.target.value as StoryCard['classification']})}>{Object.entries(STORY_CLASSES).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label></div>
      <label>页面标题 / 本页判断<input value={card.title} maxLength={120} placeholder="根据材料填写，不自动生成结论" onChange={e=>patch({title:e.target.value})}/></label>
      <label>报告原文节选<textarea value={card.excerpt} rows={4} maxLength={400} placeholder="从右侧原文复制一段完整表述，最多 400 字" onChange={e=>patch({excerpt:e.target.value})}/></label>
      <label>适用边界<textarea value={card.limitation} rows={2} maxLength={220} placeholder="适用人群、时间、分母与不能推出什么" onChange={e=>patch({limitation:e.target.value})}/></label>
      <label>意义或下一步<textarea value={card.implication} rows={2} maxLength={220} placeholder="这条证据影响什么判断或行动？" onChange={e=>patch({implication:e.target.value})}/></label>
      <div className={styles.pair}><label>版本 / 页表定位<input value={card.locator} maxLength={160} placeholder="例如：修订 3，第三章表 2（自行核对）" onChange={e=>patch({locator:e.target.value})}/></label><label>预计讲述（秒）<input type="number" min={10} max={300} value={card.seconds} onChange={e=>patch({seconds:Number(e.target.value)})}/></label></div>
    </fieldset><aside ref={sourceReveal} className={styles.source}><span className={styles.kicker}>当前章节原文 · 不截断</span><h4>{source?.title||'请重新选择章节'}</h4><div>{source?.body}</div><h4>来源与说明</h4><div>{source?.source||'本章尚未填写来源，不能据此判定已核验。'}</div><p>来源全文会保留在新页面的讲稿备注中。草稿导出含备注，匿名提交前须另行审查，不能直接视为提交版。</p></aside></div>
    <footer><button type="button" disabled={disabled||busy} onClick={()=>void prepare()}>{busy?'正在核对…':'检查并预览分镜'}</button><span>按所选原文组装，无外部模型调用。</span></footer>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {preview&&<div className={styles.preview} aria-label="分镜写入预览">{!current?<p role="status" className={styles.error}>报告、页面或分镜已变化。请重新检查预览，旧预览不可写入。</p>:<>
      <h4>{mode==='append'?'追加':'替换为'} {cards.length} 页</h4>
      <div ref={previewReveal} className={styles.previews}>{preview.slides.slice(mode==='append'?content.slides.length:0).map(s=><article key={s.id} className={s.objects?styles.composedPreview:undefined}>
        {s.objects?<QualitySlidePreview slide={s} quality={content.quality} figures={content.figures} visualStyle={content.visualStyle} label={s.title}/>:<><h4>{s.title}</h4><p>{s.body}</p><blockquote>{s.aside}</blockquote></>}
        <details><summary>本页文字与完整来源</summary><p>{s.body}</p><p>{s.aside}</p><p>{s.notes}</p></details>
      </article>)}</div>
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={disabled||busy} onChange={e=>setConfirmed(e.target.checked)}/><span>我已核对本页内容、适用范围和来源，确认{mode==='append'?'追加新页面，保留原 PPT':'替换现有全部幻灯片'}。</span></label>
      <button type="button" disabled={!confirmed||disabled||busy} onClick={()=>{if(current&&confirmed&&onApply(preview.slides,preview.base,preview.contentVersion)){setPreview(null);setConfirmed(false);}else setError('作品已变化或暂不可写入，请重新检查预览。');}}>确认{mode==='append'?'追加':'替换'}到 PPT</button>
    </>}</div>}
  </section>;
}
