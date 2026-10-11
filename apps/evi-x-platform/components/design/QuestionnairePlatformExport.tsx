"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Questionnaire} from '@/lib/questionnaire';
import {exportWjxBundle,reviewWjxExport} from '@/lib/questionnaire-platform-export';
import styles from './QuestionnairePlatformExport.module.css';

type Bundle=Awaited<ReturnType<typeof exportWjxBundle>>;
export default function QuestionnairePlatformExport({design,revision,blocked}:{design:Questionnaire;revision:number;blocked:boolean}){
  const [open,setOpen]=useState(false),[busyRevision,setBusyRevision]=useState<number|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [prepared,setPrepared]=useState<{revision:number;bundle:Bundle}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),epoch=useRef(0),latest=useRef(revision);
  useLayoutEffect(()=>{latest.current=revision;epoch.current++;},[revision]);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  useEffect(()=>()=>{epoch.current++;},[]);
  const busy=busyRevision===revision;
  const review=reviewWjxExport(design),current=prepared?.revision===revision&&!blocked?prepared.bundle:null;
  function close(){epoch.current++;setBusyRevision(null);setOpen(false);trigger.current?.focus();}
  async function prepare(){
    const token=++epoch.current,captured=revision;setBusyRevision(captured);setError('');setNotice('');
    try{const bundle=await exportWjxBundle(design,{sourceRevision:captured});if(token===epoch.current&&captured===latest.current)setPrepared({revision:captured,bundle});}
    catch(e){if(token===epoch.current)setError(e instanceof Error?e.message:'未能准备导出，请检查题目。');}
    finally{if(token===epoch.current)setBusyRevision(null);}
  }
  async function download(){
    if(!current)return;
    const token=++epoch.current,captured=revision;setBusyRevision(captured);setError('');setNotice('');
    try{
      const {default:JSZip}=await import('jszip');const zip=new JSZip();
      zip.file('问卷星文本导入.txt',current.text);
      zip.file('问卷往返清单.json',JSON.stringify(current.manifest,null,2));
      zip.file('平台待设置清单.json',JSON.stringify(current.settings,null,2));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
      if(token!==epoch.current||captured!==latest.current)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='问卷星导入包.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice('导入包已生成。导入后按清单核对题型、选项、计分和跳题设置。');
    }catch(e){if(token===epoch.current)setError(e instanceof Error?e.message:'生成下载失败，请重试。');}
    finally{if(token===epoch.current)setBusyRevision(null);}
  }
  return <><button type="button" ref={trigger} disabled={blocked} onClick={()=>{setOpen(true);setError('');setNotice('');}}>问卷星导出</button>
    <dialog ref={dialog} className={styles.dialog} onCancel={e=>{e.preventDefault();close();}} aria-label="问卷星文本导出">
      <header><div><span>QUESTIONNAIRE → PLATFORM</span><h3>带着题目与编码，继续调查</h3></div><button type="button" onClick={close} aria-label="关闭问卷星导出">×</button></header>
      <p>保留原草稿导出。这个导入包包含专用文本、版本往返清单和平台待设置项。</p>
      <div className={styles.columns}><section><h4>导入题目 · {review.questions.length} 题</h4><ol>{review.questions.map(q=><li key={q.questionId}><b>{q.platformNumber}. {q.stem}</b><small>{{single:'单选',multi:'多选',likert:'量表',number:'数值',text:'开放题'}[q.originalType]} → {{single:'单选',multi:'多选',text:'填空'}[q.platformType]}</small></li>)}</ol></section>
      <section><h4>导入后核对</h4><ul>{review.manualSettings.map((s,i)=><li key={i}>{s.message}</li>)}</ul><a href="https://www.wjx.cn/help/help.aspx?h=1&helpid=138" target="_blank" rel="noreferrer">问卷星文本导入说明 ↗</a></section></div>
      {review.blockers.length>0&&<div role="alert" className={styles.error}>{review.blockers.map((item,i)=><p key={i}>{item.questionNumber?`第 ${item.questionNumber} 题：`:''}{item.message}</p>)}</div>}
      {prepared&&!current&&<p role="status">问卷已变化，请重新准备这一版导出。</p>}
      {current&&<details><summary>查看导入文本</summary><pre>{current.text}</pre></details>}
      {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status">{notice}</p>}
      <footer><button type="button" onClick={close}>返回编辑</button><button type="button" disabled={busy||blocked||review.blockers.length>0} onClick={()=>void prepare()}>{busy?'正在准备…':current?'重新准备':'预览这一版'}</button><button type="button" disabled={busy||!current} onClick={()=>void download()}>下载导入包</button></footer>
    </dialog></>;
}
