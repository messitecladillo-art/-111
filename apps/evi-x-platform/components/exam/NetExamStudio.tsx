"use client";
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import data from '../../data/net-exam-bank.json' with {type:'json'};
import {useHostedSession} from '../hosted/HostedSession';
import {useWorkbenchNav} from '../WorkbenchShell';
import {useContentReveal,useKeyedListMotion} from '../motion/useWorkspaceMotion';
import {EXAM_MODES,examProgressKey,emptyExamProgress,parseExamProgress,writeExamProgress,examQuestionPool,startExamSession,chooseExamAnswer,submitExamPractice,expireExamMock,finishExamMock,examSessionStats,moveExamQuestion,toggleExamFavorite,type ExamBank,type ExamMode,type ExamProgress} from '@/lib/net-exam-progress';
import styles from './NetExamStudio.module.css';
const BANK=data as ExamBank;
const QUESTIONS=new Map(BANK.questions.map(q=>[q.id,q]));
const MODE_LABELS:Record<ExamMode,string>={sequential:'顺序练习',random:'随机练习',chapter:'章节练习',wrong:'错题重练',favorites:'我的收藏',mock:'模拟测试'};
const TYPE_LABELS={single:'单选题',multiple:'多选题',boolean:'判断题'};
const subscribeReady=()=>()=>{};
const clientReady=()=>true;
const serverReady=()=>false;
const PAGE_SIZE=50;
function load(accountId:string){
 try{const raw=window.localStorage.getItem(examProgressKey(accountId,BANK.version)),parsed=parseExamProgress(raw,accountId,BANK);return {...parsed,readFailed:false,stored:!!raw&&!parsed.reset};}
 catch{return {progress:emptyExamProgress(accountId,BANK.version),reset:false,readFailed:true,stored:false};}
}
export default function NetExamStudio(){
 const {session,loading}=useHostedSession(),nav=useWorkbenchNav();
 const ready=useSyncExternalStore(subscribeReady,clientReady,serverReady);
 if(!ready||loading)return <div className={styles.loading}>正在准备练习…</div>;
 if(!session?.authenticated||!session.user?.id)return <div className={styles.loading}><p>登录后开始练习。</p><Link href="/login">邮箱登录</Link></div>;
 return <ExamAccount key={`${session.user.id}:${BANK.version}`} accountId={session.user.id} active={String(nav.section)==='exam'}/>;
}
function ExamAccount({accountId,active}:{accountId:string;active:boolean}){
 const [initial]=useState(()=>load(accountId));
 const [progress,setProgress]=useState(initial.progress),progressRef=useRef(initial.progress);
 const [mode,setMode]=useState<ExamMode>(initial.progress.session?.mode??'sequential'),[chapter,setChapter]=useState('');
 const [count,setCount]=useState(25),[minutes,setMinutes]=useState(30);
 const [working,setWorking]=useState(!!initial.progress.session),[cardPage,setCardPage]=useState(Math.floor((initial.progress.session?.index??0)/PAGE_SIZE));
 const [saveState,setSaveState]=useState<'ready'|'saved'|'failed'>(initial.readFailed?'failed':initial.stored?'saved':'ready'),[notice,setNotice]=useState(initial.reset?'旧练习记录无法读取，已重新开始。':initial.readFailed?'无法读取本地记录，可继续练习。':'');
 const [now,setNow]=useState(0);
 const [replacePending,setReplacePending]=useState<string|null>(null),replacePendingRef=useRef<string|null>(null);
 const heading=useRef<HTMLHeadingElement>(null);
 const key=examProgressKey(accountId,BANK.version);
 const commit=useCallback((change:(p:ExamProgress)=>ExamProgress)=>{
  const before=progressRef.current,next=change(before);if(next===before)return false;
  progressRef.current=next;setProgress(next);
  let stored=false;try{stored=writeExamProgress(window.localStorage,key,next);}catch{}
  setSaveState(stored?'saved':'failed');return true;
 },[key]);
 const session=progress.session;
 const question=session?QUESTIONS.get(session.questionIds[session.index]):undefined;
 const response=question?session?.responses[question.id]:undefined;
 const finished=session?.finishedAt!=null;
 const reveal=!!session&&(session.mode==='mock'?finished:response?.submittedAt!=null);
 const questionSurface=useContentReveal<HTMLElement>({token:question&&session?`${session.id}:${question.id}`:null,enabled:active&&working});
 const resultSurface=useContentReveal<HTMLDivElement>({token:reveal&&question?`${question.id}:${response?.submittedAt}`:null,enabled:active&&working});
 const tabs=useKeyedListMotion<HTMLDivElement>({ids:EXAM_MODES,activeId:mode,markerAxis:'horizontal',enabled:active});
 const chapters=[...new Set(BANK.questions.map(q=>q.chapter))];
 const pool=examQuestionPool(progress,BANK,mode,mode==='chapter'?chapter:'');
 const stats=session?examSessionStats(session):null;
 const records=Object.values(progress.records),attempts=records.reduce((n,r)=>n+r.attempts,0),correct=records.reduce((n,r)=>n+r.correctAttempts,0);
 const wrong=records.filter(r=>r.lastGrade==='incorrect').length;
 const remaining=session?.deadline==null?0:Math.max(0,session.deadline-(now||session.startedAt));
 const seconds=Math.ceil(remaining/1000);
 const timerRunId=session?.id,timerMode=session?.mode,timerFinishedAt=session?.finishedAt;
 useEffect(()=>{
  if(!active||!working||!timerRunId||timerMode!=='mock'||timerFinishedAt!==null)return;
  let timer:ReturnType<typeof setInterval>|null=null;
  const tick=()=>{const time=Date.now();setNow(time);commit(p=>expireExamMock(p,BANK,time));};
  const visibility=()=>{if(timer!==null){clearInterval(timer);timer=null;}if(!document.hidden){tick();timer=setInterval(tick,1000);}};
  const first=setTimeout(visibility,0);document.addEventListener('visibilitychange',visibility);
  return()=>{clearTimeout(first);if(timer!==null)clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
 },[active,working,timerRunId,timerMode,timerFinishedAt,commit]);
 useEffect(()=>{if(!active||!working)return;const focus=setTimeout(()=>heading.current?.focus({preventScroll:true}),0);return()=>clearTimeout(focus);},[active,working,question?.id]);
 const move=useCallback((index:number)=>{if(commit(p=>moveExamQuestion(p,index)))setCardPage(Math.floor(index/PAGE_SIZE));},[commit]);
 const select=useCallback((optionId:string)=>{const current=progressRef.current.session;if(!current)return;commit(p=>chooseExamAnswer(p,BANK,current.questionIds[current.index],optionId,Date.now()));},[commit]);
 const submit=useCallback(()=>{const current=progressRef.current.session;if(!current)return;commit(p=>submitExamPractice(p,BANK,current.questionIds[current.index],Date.now()));},[commit]);
 useEffect(()=>{
  if(!active||!working)return;
  const onKey=(event:KeyboardEvent)=>{
   if(event.isComposing||event.ctrlKey||event.altKey||event.metaKey||(event.target as HTMLElement)?.closest('input,select,textarea,button,a,summary'))return;
   const current=progressRef.current.session,q=current?QUESTIONS.get(current.questionIds[current.index]):null;if(!current||!q)return;
   if(/^[1-9]$/.test(event.key)){const option=q.options[Number(event.key)-1];if(option){event.preventDefault();select(option.id);}}
   if(event.key==='Enter'&&current.mode!=='mock'){event.preventDefault();submit();}
   if(event.key==='ArrowRight'){event.preventDefault();move(current.index+1);}
   if(event.key==='ArrowLeft'){event.preventDefault();move(current.index-1);}
  };
  document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
 },[active,working,select,submit,move]);
 function clearReplacement(){replacePendingRef.current=null;setReplacePending(null);}
 function resume(){
  clearReplacement();
  const time=Date.now();commit(p=>expireExamMock(p,BANK,time));
  const current=progressRef.current.session;if(!current)return;
  setMode(current.mode);setNow(time);setCardPage(Math.floor(current.index/PAGE_SIZE));setWorking(true);setNotice('');
 }
 function start(){
  try{const time=Date.now();commit(p=>startExamSession(p,BANK,{id:crypto.randomUUID(),mode,chapter:mode==='chapter'?chapter:'',count,minutes,now:time,seed:time>>>0}));clearReplacement();setNow(time);setCardPage(0);setWorking(true);setNotice('');}
  catch(e){setNotice(e instanceof Error?e.message:'无法开始这轮练习。');}
 }
 function requestStart(){
  commit(p=>expireExamMock(p,BANK,Date.now()));
  const current=progressRef.current.session;
  if(current?.mode==='mock'&&current.finishedAt===null){replacePendingRef.current=current.id;setReplacePending(current.id);return;}
  start();
 }
 function confirmReplacement(){
  const target=replacePendingRef.current,current=progressRef.current.session;
  clearReplacement();
  if(!target||current?.id!==target||current.mode!=='mock'||current.finishedAt!==null)return;
  commit(p=>expireExamMock(p,BANK,Date.now()));
  start();
 }
 function finish(){commit(p=>finishExamMock(p,BANK,Date.now()));}
 const numbered=session?.questionIds.slice(cardPage*PAGE_SIZE,(cardPage+1)*PAGE_SIZE)??[];
 const pages=session?Math.ceil(session.questionIds.length/PAGE_SIZE):0;
 return <section className={styles.studio} data-working={working&&!!session} aria-label="网赛刷题工作台">
  <header className={styles.intro}><div><span>KNOWLEDGE PRACTICE</span><h2>让每一题，成为下一次的把握。</h2><p>按章节理解，回到错题巩固，再用模拟测试检查自己。</p></div><small className={saveState==='failed'?styles.unsaved:styles.save} role="status">{saveState==='failed'?'未保存 · 本地存储不可用':saveState==='saved'?'记录保存在此设备':'此设备记录'}</small></header>
  <div className={styles.metrics}><div><span>可练习</span><strong>{BANK.questions.length}<small>题</small></strong></div><div><span>已练习</span><strong>{records.length}<small>题</small></strong></div><div><span>作答正确率</span><strong>{attempts?`${Math.round(correct/attempts*100)}%`:'—'}</strong></div><div><span>待巩固</span><strong>{wrong}<small>题</small></strong></div></div>
  <div className={styles.tabs} ref={tabs} aria-label="练习模式"><span data-motion-marker className={styles.marker} aria-hidden="true"/>{EXAM_MODES.map(m=><button type="button" key={m} data-motion-id={m} aria-pressed={mode===m} onClick={()=>{clearReplacement();setMode(m);setWorking(false);setNotice('');}}>{MODE_LABELS[m]}{m==='wrong'&&<small>{wrong}</small>}{m==='favorites'&&<small>{progress.favorites.length}</small>}</button>)}</div>
  {(!working||!session)&&<div className={styles.setup}>
   <div><span className={styles.eyebrow}>{MODE_LABELS[mode]}</span><h3>{mode==='mock'?'按照你的节奏，完成一场测试。':'从一个问题开始，逐题把知识连起来。'}</h3><p>{mode==='wrong'?'只练最近一次答错的题，答对后会从错题池移出。':mode==='favorites'?'把有价值的题留在这里，集中回看。':`${pool.length} 道可用题目，随时可返回练习设置。`}</p></div>
   {mode==='chapter'&&<label>选择章节<select value={chapter} onChange={e=>setChapter(e.target.value)}><option value="">全部章节</option>{chapters.map(c=><option key={c}>{c}</option>)}</select></label>}
   {mode==='mock'&&<div className={styles.mockSetup}><label>题目数量<input type="number" value={count} min={1} max={BANK.questions.length} onChange={e=>setCount(Number(e.target.value))}/><small>实际最多 {BANK.questions.length} 题</small></label><label>测试时长（分钟）<input type="number" value={minutes} min={1} max={180} onChange={e=>setMinutes(Number(e.target.value))}/></label><div className={styles.presets}>{[10,25,50].map(n=><button type="button" key={n} aria-pressed={count===n} onClick={()=>setCount(Math.min(n,BANK.questions.length))}>{n} 题</button>)}</div></div>}
   {replacePending?<div className={styles.replacePrompt} role="group" aria-label="确认开始新一轮"><div><strong>当前模拟测试尚未完成。</strong><p>开始新一轮会替换本轮答题；也可以保留当前测试，继续作答。</p></div><div><button type="button" className={styles.primary} disabled={!pool.length} onClick={confirmReplacement}>开始新一轮</button><button type="button" onClick={resume}>保留当前测试</button></div></div>:<div className={styles.setupActions}><button type="button" className={styles.primary} disabled={!pool.length} onClick={requestStart}>开始{mode==='mock'?'测试':'练习'} ↗</button>{session&&<button type="button" onClick={resume}>{finished?'查看本轮结果':'继续练习'} · {session.index+1}/{session.questionIds.length}</button>}</div>}
  </div>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {working&&session&&question&&<>
   <div className={styles.runBar}><div><strong>{MODE_LABELS[session.mode]}</strong><span>第 {session.index+1} / {session.questionIds.length} 题</span>{session.mode==='mock'&&!finished&&<time aria-label="模拟测试剩余时间">{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</time>}</div><div><button type="button" onClick={()=>setWorking(false)}>练习设置</button>{session.mode==='mock'&&!finished&&<button type="button" className={styles.primary} onClick={finish}>交卷 · 已答 {stats?.answered}/{stats?.total}</button>}</div></div>
   {session.mode==='mock'&&finished&&stats&&<div className={styles.summary} role="status"><div><span>测试已完成</span><h3>{stats.correct} <small>/ {stats.total} 题答对</small></h3></div><p>已答 {stats.answered} · 答错 {stats.incorrect} · 未答 {stats.unanswered}</p><button type="button" onClick={()=>{setMode('mock');setWorking(false);}}>再做一轮</button></div>}
   <div className={styles.workspace}><article className={styles.question} ref={questionSurface}>
    <div className={styles.questionMeta}><div><span>{TYPE_LABELS[question.type]}</span><small>{question.chapter}</small></div><button type="button" aria-pressed={progress.favorites.includes(question.id)} onClick={()=>commit(p=>toggleExamFavorite(p,question.id,BANK))}>{progress.favorites.includes(question.id)?'★ 已收藏':'☆ 收藏'}</button></div>
    <h3 ref={heading} tabIndex={-1}>{question.stem}</h3>
    {question.type==='multiple'&&<p className={styles.choiceHint}>选择所有符合的选项，然后提交答案。</p>}
    <div className={styles.options}>{question.options.map((option,i)=>{const selected=response?.selected.includes(option.id)??false,correctOption=reveal&&question.answer.includes(option.id),wrongOption=reveal&&selected&&!correctOption;return <button type="button" key={option.id} aria-pressed={selected} disabled={reveal||finished} data-correct={correctOption||undefined} data-wrong={wrongOption||undefined} onClick={()=>select(option.id)}><span>{question.type==='boolean'?(option.id==='true'?'✓':'×'):option.id}</span><strong>{option.text}</strong><small>{selected?(question.type==='multiple'?'已选':'选中'):(i<9?`${i+1}`:'')}</small></button>;})}</div>
    <div className={styles.questionActions}><small>{reveal?(response?.grade==='unanswered'?'未作答':'已提交答案'):question.type==='multiple'?'多选完全匹配计为答对':'请选择一个答案'}</small>{session.mode!=='mock'&&!reveal&&<button type="button" className={styles.primary} disabled={!response?.selected.length} onClick={submit}>提交答案</button>}{session.mode==='mock'&&!finished&&<span>交卷后查看答案</span>}</div>
    {reveal&&<div className={styles.feedback} data-grade={response?.grade??'unanswered'} ref={resultSurface}><strong>{response?.grade==='correct'?'回答正确':response?.grade==='incorrect'?'这题再巩固一次':'这题尚未作答'}</strong><p>资料答案：{question.answer.map(id=>{const option=question.options.find(o=>o.id===id);return question.type==='boolean'?option?.text??id:id;}).join('、')}</p>{question.explanation&&<p>{question.explanation}</p>}<details><summary>题目来源</summary>{question.sourceRefs.map((r,i)=>{const source=BANK.sources.find(s=>s.id===r.sourceId);return <div key={`${r.sourceId}-${i}`}><strong>{source?.filename??r.sourceId}</strong><p>{r.locators.join('；')}</p>{r.answerLocator&&<p>答案定位：{r.answerLocator}</p>}<small>SHA256 {source?.sha256}</small></div>;})}</details></div>}
    <footer className={styles.navigation}><button type="button" disabled={session.index===0} onClick={()=>move(session.index-1)}>← 上一题</button><small>{session.mode==='mock'?'数字键选项 · ← → 切题':'数字键选项 · Enter 提交 · ← → 切题'}</small><button type="button" disabled={session.index===session.questionIds.length-1} onClick={()=>move(session.index+1)}>下一题 →</button></footer>
   </article><aside className={styles.cardRail} aria-label="题卡"><header><h3>答题卡</h3><small>{stats?.answered}/{stats?.total} 已选</small></header><div className={styles.cards}>{numbered.map((id,i)=>{const index=cardPage*PAGE_SIZE+i,r=session.responses[id],graded=session.mode==='mock'?finished:r?.submittedAt!=null;return <button type="button" key={id} aria-label={`第 ${index+1} 题${r?.selected.length?'，已答':''}`} aria-current={session.index===index?'step':undefined} data-answered={!!r?.selected.length||undefined} data-grade={graded?r?.grade:undefined} onClick={()=>move(index)}>{index+1}</button>;})}</div><div className={styles.cardPager}><button type="button" disabled={!cardPage} onClick={()=>setCardPage(p=>p-1)}>上一页</button><span>{cardPage+1}/{pages}</span><button type="button" disabled={cardPage+1>=pages} onClick={()=>setCardPage(p=>p+1)}>下一页</button></div><p><i/>已选 <i className={styles.currentDot}/>当前题</p><small>每页最多 {PAGE_SIZE} 题</small></aside></div>
  </>}
  <details className={styles.about}><summary>练习记录与资料</summary><p>本账号的练习、错题、收藏和本轮答题保存在此设备。更换题库版本会建立新记录。</p><p>判分采用资料所列答案。模拟题数与时长由你选择。</p><small>题库版本 {BANK.version}</small></details>
 </section>;
}
