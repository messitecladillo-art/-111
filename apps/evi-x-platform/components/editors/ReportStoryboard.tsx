"use client";
import {useEffect,useRef,useState} from 'react';
import type {EditorContent,Slide} from '@/lib/editor-model';
import {blankStoryCard,buildStoryboard,LINK_LABELS,reportLinkState,STORY_CLASSES,STORY_JOBS,type LinkState,type StoryCard} from '@/lib/report-storyboard';
import styles from './ReportStoryboard.module.css';

export function ReportLinkNotice({content,slide}:{content:EditorContent;slide:Slide}){
  const signature=JSON.stringify({report:content.report,slide});
  const [result,setResult]=useState<{signature:string;state:LinkState}|null>(null);
  useEffect(()=>{let live=true;reportLinkState(content,slide).then(state=>{if(live)setResult({signature,state});}).catch(()=>{if(live)setResult(null);});return()=>{live=false;};},[content,slide,signature]);
  if(!slide.reportLink)return null;
  const state=result?.signature===signature?result.state:null;
  return <p role="status" className={styles.linkNotice} data-warning={state!=='current'}>{state?LINK_LABELS[state]:'正在核对报告关联指纹…'}。关联记录只检查编辑变化，不判断事实真假；不会自动覆盖报告或 PPT。</p>;
}

export default function ReportStoryboard({content,disabled,onApply,onClose}:{content:EditorContent;disabled:boolean;onApply:(slides:Slide[],base:string)=>boolean;onClose:()=>void}){
  const [cards,setCards]=useState<StoryCard[]>(()=>[blankStoryCard(content.report[0].id)]);
  const [mode,setMode]=useState<'append'|'replace'>('append'),[selected,setSelected]=useState(0),[minutes,setMinutes]=useState(10);
  const [preview,setPreview]=useState<{signature:string;base:string;slides:Slide[]}|null>(null),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const alive=useRef(true),operation=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const card=cards[selected],source=content.report.find(s=>s.id===card.sectionId);
  const base=JSON.stringify(content),signature=JSON.stringify({base,cards,mode});
  const current=preview?.signature===signature;
  function change(next:StoryCard[]){setCards(next);setConfirmed(false);setError('');}
  function patch(p:Partial<StoryCard>){change(cards.map((c,i)=>i===selected?{...c,...p}:c));}
  function move(delta:number){const to=selected+delta;if(to<0||to>=cards.length)return;const next=[...cards];[next[selected],next[to]]=[next[to],next[selected]];change(next);setSelected(to);}
  async function prepare(){
    if(operation.current||disabled)return;operation.current=true;setBusy(true);setError('');setConfirmed(false);
    try{const slides=await buildStoryboard(content,cards,mode);if(alive.current)setPreview({signature,base,slides});}
    catch(e){if(alive.current)setError((e as Error).message);}finally{operation.current=false;if(alive.current)setBusy(false);}
  }
  const total=cards.reduce((sum,c)=>sum+(Number.isFinite(c.seconds)?c.seconds:0),0);
  return <section className={styles.board} aria-label="报告分镜工作台">
    <header><div><span className={styles.kicker}>报告依据 · 逐页重组</span><h3>每页一个任务</h3><p>选择原文，填写标题、边界与下一步。同一章可拆成多页，也可跳过。</p></div><button type="button" onClick={onClose} disabled={busy}>收起分镜</button></header>
    <p className={styles.notice}>分镜计划仅存于当前页面，收起后保留；刷新、关闭或切换作品会丢失。确认后生成的页面及关联记录随草稿保存。撤销只在本页有效，不能代替命名版本；替换前请下载 JSON 备份。</p>
    <div className={styles.topbar}><label>写入方式<select value={mode} disabled={disabled||busy} onChange={e=>{setMode(e.target.value as 'append'|'replace');setConfirmed(false);}}><option value="append">追加，保留现有 {content.slides.length} 页</option><option value="replace">替换现有全部幻灯片</option></select></label><label>排练目标（分钟）<input type="number" min={1} max={60} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><span>{cards.length} 张分镜 · 预计 {Math.floor(total/60)} 分 {total%60} 秒{Number.isFinite(minutes)&&total>minutes*60?'，超过排练目标':''}<small>时间由你规划，不是赛事规定</small></span></div>
    <div className={styles.grid}><nav aria-label="分镜顺序">{cards.map((c,i)=><button type="button" key={c.id} aria-current={selected===i?'step':undefined} onClick={()=>setSelected(i)}><b>{String(i+1).padStart(2,'0')}</b><span>{c.title||'尚未填写标题'}<small>{STORY_JOBS[c.job]} · {c.seconds} 秒</small></span></button>)}<button type="button" disabled={disabled||busy||cards.length>=40} onClick={()=>{change([...cards,blankStoryCard(source?.id||content.report[0].id)]);setSelected(cards.length);}}>添加一页分镜</button></nav>
    <fieldset disabled={disabled||busy} className={styles.fields}><legend>第 {selected+1} 页</legend><div className={styles.actions}><button type="button" disabled={selected===0} onClick={()=>move(-1)}>分镜上移</button><button type="button" disabled={selected===cards.length-1} onClick={()=>move(1)}>分镜下移</button><button type="button" disabled={cards.length===1} onClick={()=>{change(cards.filter((_,i)=>i!==selected));setSelected(Math.max(0,selected-1));}}>移除此分镜</button></div>
      <label>依据章节<select value={card.sectionId} onChange={e=>patch({sectionId:e.target.value,excerpt:'',locator:''})}>{!source&&<option value={card.sectionId}>原章节已移除</option>}{content.report.map(s=><option value={s.id} key={s.id}>{s.title||'未命名章节'}</option>)}</select></label>
      <div className={styles.pair}><label>本页任务<select value={card.job} onChange={e=>patch({job:e.target.value as StoryCard['job']})}>{Object.entries(STORY_JOBS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><label>内容类别<select value={card.classification} onChange={e=>patch({classification:e.target.value as StoryCard['classification']})}>{Object.entries(STORY_CLASSES).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label></div>
      <label>页面标题 / 本页判断<input value={card.title} maxLength={120} placeholder="根据材料填写，不自动生成结论" onChange={e=>patch({title:e.target.value})}/></label>
      <label>报告原文节选<textarea value={card.excerpt} rows={4} maxLength={400} placeholder="从右侧原文复制一段完整表述，最多 400 字" onChange={e=>patch({excerpt:e.target.value})}/></label>
      <label>适用边界<textarea value={card.limitation} rows={2} maxLength={220} placeholder="适用人群、时间、分母与不能推出什么" onChange={e=>patch({limitation:e.target.value})}/></label>
      <label>意义或下一步<textarea value={card.implication} rows={2} maxLength={220} placeholder="这条证据影响什么判断或行动？" onChange={e=>patch({implication:e.target.value})}/></label>
      <div className={styles.pair}><label>版本 / 页表定位<input value={card.locator} maxLength={160} placeholder="例如：修订 3，第三章表 2（自行核对）" onChange={e=>patch({locator:e.target.value})}/></label><label>预计讲述（秒）<input type="number" min={10} max={300} value={card.seconds} onChange={e=>patch({seconds:Number(e.target.value)})}/></label></div>
    </fieldset><aside className={styles.source}><span className={styles.kicker}>当前章节原文 · 不截断</span><h4>{source?.title||'请重新选择章节'}</h4><div>{source?.body}</div><h4>来源与说明</h4><div>{source?.source||'本章尚未填写来源，不能据此判定已核验。'}</div><p>来源全文会保留在新页面的讲稿备注中。草稿导出含备注，匿名提交前须另行审查，不能直接视为提交版。</p></aside></div>
    <footer><button type="button" disabled={disabled||busy} onClick={()=>void prepare()}>{busy?'正在核对…':'检查并预览分镜'}</button><span>按所选原文组装，无外部模型调用。</span></footer>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {preview&&<div className={styles.preview} aria-label="分镜写入预览">{!current?<p role="status" className={styles.error}>报告、页面或分镜已变化。请重新检查预览，旧预览不可写入。</p>:<><h4>{mode==='append'?'追加':'替换为'} {cards.length} 页 · 确认前不会修改作品</h4><div className={styles.previews}>{preview.slides.slice(mode==='append'?content.slides.length:0).map(s=><article key={s.id}><h4>{s.title}</h4><p>{s.body}</p><blockquote>{s.aside}</blockquote><details><summary>完整来源与讲稿</summary><p>{s.notes}</p></details></article>)}</div><label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={disabled||busy} onChange={e=>setConfirmed(e.target.checked)}/><span>我已核对节选、判断、边界和来源，确认{mode==='append'?'追加新页面，保留原 PPT':'替换现有全部幻灯片（请先备份）'}。这是人工确认，不是系统核验通过。</span></label><button type="button" disabled={!confirmed||disabled||busy} onClick={()=>{if(current&&confirmed&&onApply(preview.slides,preview.base)){setPreview(null);setConfirmed(false);}else setError('作品已变化或暂不可写入，请重新检查预览。');}}>确认{mode==='append'?'追加':'替换'}到 PPT</button></>}</div>}
  </section>;
}
