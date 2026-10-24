'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useHostedSession} from '../hosted/HostedSession';
import {uploadTemporarySav,validateSavFile,type SavUploadPhase} from '@/lib/sav-upload';
import type {NormalizedSav} from '@/lib/platform-data-mapping';
import styles from './SavImportPanel.module.css';

export type SavReady={data:NormalizedSav;name:string};
type Props={externalBusy:boolean;onBusy:(busy:boolean,name?:string)=>void;onReady:(data:SavReady,signal:AbortSignal)=>Promise<boolean>};
const phases:Record<SavUploadPhase,string>={fingerprint:'核对所选文件',request:'上传并等待解析',receipt:'读取服务回执',verify:'核验数据与临时文件清理'};
export default function SavImportPanel({externalBusy,onBusy,onReady}:Props){
  const {session,identityEpoch,loading}=useHostedSession();
  const [file,setFile]=useState<File|null>(null),[receipt,setReceipt]=useState<SavReady|null>(null),[busy,setBusy]=useState(false),[phase,setPhase]=useState(''),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),epoch=useRef(0),request=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),ownBusy=useRef(false),callbacks=useRef({onBusy,onReady});
  const identity=JSON.stringify([identityEpoch,Boolean(session?.authenticated),session?.user?.id||'',session?.csrfToken||'']),owner=useRef(identity);
  const loggedIn=Boolean(session?.authenticated&&session.user?.id&&session.csrfToken);
  useLayoutEffect(()=>{callbacks.current={onBusy,onReady};},[onBusy,onReady]);
  function stop(){epoch.current++;request.current?.abort();request.current=null;if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}}
  function endBusy(){if(ownBusy.current){ownBusy.current=false;callbacks.current.onBusy(false);}setBusy(false);}
  useLayoutEffect(()=>{
    if(owner.current===identity)return;owner.current=identity;stop();setFile(null);setReceipt(null);setPhase('');setError('');endBusy();
  },[identity]);
  useEffect(()=>()=>{epoch.current++;request.current?.abort();if(timer.current!==null)clearTimeout(timer.current);if(ownBusy.current){ownBusy.current=false;callbacks.current.onBusy(false);}},[]);
  function choose(next:File){
    if(externalBusy||ownBusy.current)return;stop();setReceipt(null);setPhase('');setError('');
    try{validateSavFile(next);setFile(next);}catch(e){setFile(null);setError(e instanceof Error?e.message:'文件无法选择。');}
  }
  function cancel(){if(externalBusy&&!ownBusy.current)return;const wasBusy=ownBusy.current;stop();setReceipt(null);setPhase('');if(!wasBusy)setFile(null);setError(wasBusy?'已取消本次读取。':'');endBusy();}
  async function begin(){
    if(externalBusy||ownBusy.current||!file)return;
    if(!loggedIn||!session?.csrfToken){setError('请先登录，再临时上传 SAV 文件。');return;}
    stop();const token=epoch.current,identityKey=owner.current,controller=new AbortController();request.current=controller;
    const current=()=>token===epoch.current&&owner.current===identityKey&&!controller.signal.aborted;
    ownBusy.current=true;setBusy(true);setError('');callbacks.current.onBusy(true,file.name);
    timer.current=setTimeout(()=>{if(!current())return;stop();setReceipt(null);setPhase('');setError('读取超时。可手动重新读取所选文件。');endBusy();},60000);
    try{
      const result=receipt||{data:await uploadTemporarySav(file,session.csrfToken,controller.signal,value=>{if(current())setPhase(phases[value]);}),name:file.name};
      if(!current())return;setReceipt(result);setPhase('已核验，正在载入');
      const adopted=await callbacks.current.onReady(result,controller.signal);
      if(!current())return;
      if(adopted){setFile(null);setReceipt(null);setPhase('已载入当前分析');}
      else setPhase('已核验，等待载入');
      if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}endBusy();
    }catch(e){if(!current())return;setPhase('');setError(e instanceof Error?e.message:'SAV 读取未完成。');if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}endBusy();}
  }
  return <section className={styles.panel} aria-label="SAV 数据导入">
    <div className={styles.heading}><div><strong>SPSS 回收数据</strong><span>读取变量、值标签和缺失定义。</span></div><button type="button" disabled={externalBusy||busy} onClick={()=>input.current?.click()}>选择 SAV 文件</button></div>
    <input ref={input} type="file" accept=".sav,application/octet-stream" hidden onChange={event=>{const selected=event.target.files?.[0];event.target.value='';if(selected)choose(selected);}}/>
    {!loggedIn&&!loading&&<p className={styles.login}>请先<a href="/login">登录</a>，再临时上传 SAV 文件。</p>}
    {file&&<div className={styles.fileCard}><div className={styles.fileInfo}><b title={file.name}>{file.name}</b><span>{(file.size/1000).toLocaleString('zh-CN',{maximumFractionDigits:1})} KB · 上限 2 MB</span></div><p>将文件临时上传到证见服务器读取数据，确认临时文件清理后载入分析。</p>
      {receipt&&<div className={styles.summary}>{receipt.data.raw.rowCount.toLocaleString()} 条记录 · {receipt.data.raw.columnCount} 个变量 · 已核验并确认临时文件清理</div>}
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={externalBusy||busy||!loggedIn} onClick={()=>void begin()}>{receipt?'载入已读取数据':'临时上传并读取 SAV'}</button><button type="button" disabled={externalBusy&&!busy} onClick={cancel}>{busy?'取消读取':'移除文件'}</button></div>
    </div>}
    {phase&&<p className={styles.status} role="status"><span className={busy?styles.active:styles.complete} aria-hidden="true"/>{phase}</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
  </section>;
}
