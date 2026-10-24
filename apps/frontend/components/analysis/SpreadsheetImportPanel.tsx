"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {SpreadsheetInspection,SpreadsheetImportResult,SpreadsheetWorkerResponse} from '@/lib/spreadsheet-import';
import styles from './SpreadsheetImportPanel.module.css';
export type SpreadsheetReady={result:SpreadsheetImportResult;name:string;sourceHash:string;parserVersion:string};
export default function SpreadsheetImportPanel({externalBusy,onBusy,onReady}:{externalBusy:boolean;onBusy:(busy:boolean,name?:string)=>void;onReady:(data:SpreadsheetReady,signal:AbortSignal)=>Promise<boolean>}){
  const [inspection,setInspection]=useState<SpreadsheetInspection|null>(null),[sheetId,setSheetId]=useState(''),[headerRow,setHeaderRow]=useState('1'),[range,setRange]=useState('');
  const [name,setName]=useState(''),[phase,setPhase]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),worker=useRef<Worker|null>(null),epoch=useRef(0),request=useRef(''),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const source=useRef<{name:string;sourceHash:string;parserVersion:string}|null>(null),cancellation=useRef<AbortController|null>(null),callbacks=useRef({onBusy,onReady});
  useLayoutEffect(()=>{callbacks.current={onBusy,onReady};},[onBusy,onReady]);
  const activeSheet=inspection?.sheets.find(s=>s.id===sheetId);
  function endTimer(){if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}}
  function dispose(){epoch.current++;cancellation.current?.abort();cancellation.current=null;request.current='';worker.current?.terminate();worker.current=null;source.current=null;endTimer();}
  useEffect(()=>()=>{epoch.current++;cancellation.current?.abort();worker.current?.terminate();if(timer.current!==null)clearTimeout(timer.current);},[]);
  function cancel(){if(externalBusy&&!busy)return;dispose();setBusy(false);callbacks.current.onBusy(false);setInspection(null);setPhase('');setError('已取消读取，当前分析数据仍保留。');input.current?.focus();}
  function fail(message:string){setError(message);setBusy(false);setPhase('');endTimer();callbacks.current.onBusy(false);}
  function armTimeout(){endTimer();timer.current=setTimeout(()=>{dispose();fail('工作簿读取超时，请减少文件规模后重新选择。');setInspection(null);},20000);}
  async function open(file:File){
    if(externalBusy&&!busy)return;
    dispose();cancellation.current=new AbortController();const token=epoch.current;setBusy(true);setError('');setInspection(null);setName(file.name);setPhase('读取文件');callbacks.current.onBusy(true,file.name);armTimeout();
    try{
      if(!file.name.toLowerCase().endsWith('.xlsx'))throw Error('请选择 .xlsx 工作簿。');
      if(file.size>2000000)throw Error('文件超过 2 MB，请拆分后再分析。');
      const buffer=await file.arrayBuffer();if(token!==epoch.current)return;
      const digest=await crypto.subtle.digest('SHA-256',buffer);if(token!==epoch.current)return;
      source.current={name:file.name,sourceHash:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),parserVersion:''};
      const instance=new Worker(new URL('../../workers/spreadsheet-import.worker.ts',import.meta.url));worker.current=instance;
      instance.onerror=()=>{if(token===epoch.current){dispose();setInspection(null);fail('读取器启动失败，请重新选择文件。');}};
      instance.onmessage=(event:MessageEvent<SpreadsheetWorkerResponse>)=>{
        if(token!==epoch.current||event.data.requestId!==request.current)return;
        const message=event.data;
        if(message.type==='progress'){setPhase({preflight:'检查文件边界',decompress:'核对压缩内容',parse:'读取工作表',inspect:'整理字段预览'}[message.phase]);return;}
        endTimer();
        if(message.type==='opened'){
          if(source.current)source.current={...source.current,parserVersion:message.inspection.parserVersion};setInspection(message.inspection);const first=message.inspection.sheets.find(s=>s.range)||message.inspection.sheets[0];
          setSheetId(first?.id||'');setHeaderRow(first?.previewRows[0]?String(first.previewRows[0].rowNumber):'1');setRange(first?.range||'');setBusy(false);setPhase('');callbacks.current.onBusy(false);
        }else if(message.type==='error'){fail(message.error.message);}
        else if(message.type==='selected'){
          const original=source.current,signal=cancellation.current?.signal;if(!original||!signal){fail('原文件已取消，请重新选择。');return;}setPhase('核对解析版本');
          void callbacks.current.onReady({...original,result:message.result},signal).then(adopted=>{if(token===epoch.current){if(adopted){dispose();setInspection(null);}setBusy(false);setPhase('');callbacks.current.onBusy(false);}}).catch(e=>{if(token===epoch.current)fail(e instanceof Error?e.message:'未能载入所选区域。');});
        }
      };
      const requestId=crypto.randomUUID();request.current=requestId;instance.postMessage({type:'open',requestId,buffer},[buffer]);
    }catch(e){if(token===epoch.current){dispose();fail(e instanceof Error?e.message:'未能读取工作簿。');}}
  }
  function select(){
    if(externalBusy||busy||!worker.current||!activeSheet)return;
    const header=headerRow.trim()===''?null:Number(headerRow);
    if(header!==null&&(!Number.isSafeInteger(header)||header<1)){setError('表头行填写 Excel 行号；无表头时留空。');return;}
    setBusy(true);setError('');setPhase('检查选定区域');callbacks.current.onBusy(true,name);armTimeout();
    const requestId=crypto.randomUUID();request.current=requestId;worker.current.postMessage({type:'select',requestId,selection:{sheetId,headerRow:header,range:range.trim()||undefined}});
  }
  return <section className={styles.panel} aria-label="Excel 工作簿导入">
    <div className={styles.heading}><div><strong>Excel 回收数据</strong><span>工作表、表头与数据范围由你选择。</span></div><button type="button" disabled={externalBusy||busy} onClick={()=>input.current?.click()}>选择 XLSX 工作簿</button></div>
    <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void open(file);}}/>
    {busy&&<div className={styles.status} role="status"><span>{name} · {phase}</span><button type="button" onClick={cancel}>取消工作簿读取</button></div>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {inspection&&<div className={styles.configuration}><header><b>{name}</b><button type="button" disabled={externalBusy&&!busy} onClick={cancel}>关闭工作簿</button></header>
      <div className={styles.fields}><label>工作表<select disabled={externalBusy||busy} value={sheetId} onChange={e=>{const sheet=inspection.sheets.find(s=>s.id===e.target.value);setSheetId(e.target.value);setRange(sheet?.range||'');setHeaderRow(sheet?.previewRows[0]?String(sheet.previewRows[0].rowNumber):'1');setError('');}}>{inspection.sheets.map(s=><option key={s.id} value={s.id}>{s.name}{s.hidden?' · 隐藏表':''} · {s.rows} 行 / {s.columns} 列</option>)}</select></label>
      <label>表头行<input value={headerRow} disabled={externalBusy||busy} inputMode="numeric" maxLength={7} placeholder="无表头可留空" onChange={e=>setHeaderRow(e.target.value)}/></label>
      <label>数据区域<input value={range} disabled={externalBusy||busy} maxLength={40} placeholder="例如 A1:H200" onChange={e=>setRange(e.target.value)}/></label></div>
      {activeSheet&&<div className={styles.preview} tabIndex={0} aria-label="工作表前六行预览"><table><thead><tr><th>Excel 行号</th>{activeSheet.previewRows[0]?.refs.map(ref=><th key={ref}>{ref.replace(/[0-9]+$/,'')}</th>)}</tr></thead><tbody>{activeSheet.previewRows.map(row=><tr key={row.rowNumber}><th>{row.rowNumber}</th>{row.values.map((value,i)=><td key={row.refs[i]} title={row.refs[i]}>{value||'—'}</td>)}</tr>)}</tbody></table></div>}
      {inspection.issues.length>0&&<details><summary>工作簿读取记录 · {inspection.issues.length} 项</summary><ul>{inspection.issues.map((issue,i)=><li key={i}>{issue.message}</li>)}</ul></details>}
      <footer><span>最多 5,000 条记录、80 列、200,000 个单元格。</span><button type="button" disabled={externalBusy||busy||!activeSheet?.range} onClick={select}>载入所选区域</button></footer>
    </div>}
  </section>;
}
