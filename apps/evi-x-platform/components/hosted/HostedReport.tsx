'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import EditingStudio, { type EditingStudioHandle } from '../editors/EditingStudio';
import { parseEditorContent, type EditorContent } from '@/lib/editor-model';
import { newProjectReport, parseProjectReport, parseReportHead, type ProjectReport, type ProjectReportSummary, type ReportProposal, type SaveReportRequest } from '@/lib/project-report';
import { errorMessage, HostedApiError, hostedRequest } from './api-client';
import { useHostedSession } from './HostedSession';

type CachedReport = { content: EditorContent; head: ProjectReport | null; pending: SaveReportRequest | null; conflict: boolean };
export default function HostedReport({ projectId, title, writable, proposal, onProposalConsumed }: { projectId: string; title: string; writable: boolean; proposal: ReportProposal | null; onProposalConsumed: () => void }) {
  const auth = useHostedSession(), key = `report:${projectId}`;
  const [cached] = useState(()=>auth.getDraft(key) as CachedReport | undefined);
  const [head, setHead] = useState<ProjectReport | null>(cached?.head ?? null);
  const [content, setContent] = useState<EditorContent | null>(cached?.content ?? null);
  const [initial, setInitial] = useState<EditorContent | null>(null);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(!!cached?.pending), [conflict, setConflict] = useState(!!cached?.conflict);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [versions, setVersions] = useState<ProjectReportSummary[]>([]), [nextBefore, setNextBefore] = useState<number | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const alive = useRef(true), lock = useRef(false), pending = useRef<SaveReportRequest | null>(cached?.pending ?? null);
  const current = useRef<EditorContent | null>(cached?.content ?? null), headRef = useRef<ProjectReport | null>(cached?.head ?? null);
  const editEpoch = useRef(0), historyEpoch = useRef(0), editor = useRef<EditingStudioHandle>(null);
  const { cacheDraft, setUnsaved, mutate } = auth, userId = auth.session?.user?.id;
  const dirty = !!content && JSON.stringify(content) !== JSON.stringify(head?.content ?? newProjectReport(title));
  const onSnapshot = useCallback((value: EditorContent)=>{current.current=value;editEpoch.current++;setContent(value);},[]);
  const remember = useCallback((value: ProjectReport | null)=>{headRef.current=value;setHead(value);},[]);
  useLayoutEffect(()=>{if(content&&userId)cacheDraft(key,{content,head,pending:pending.current,conflict} satisfies CachedReport,dirty||busy||uncertain,userId);},[content,head,key,userId,cacheDraft,conflict,dirty,busy,uncertain]);
  useEffect(()=>{setUnsaved(key,dirty||busy||uncertain);return()=>setUnsaved(key,false);},[key,dirty,busy,uncertain,setUnsaved]);

  const history = useCallback(async(before?: number)=>{
    const epoch=++historyEpoch.current;setHistoryBusy(true);
    try {
      const response=await hostedRequest(`/api/projects/${projectId}/report/versions${before?`?beforeRevision=${before}`:''}`) as {versions:unknown[];nextBeforeRevision:number|null};
      if(!Array.isArray(response.versions)||response.versions.length>30||(response.nextBeforeRevision!==null&&(!Number.isSafeInteger(response.nextBeforeRevision)||response.nextBeforeRevision<1)))throw Error('版本目录回执无效。');
      const rows=response.versions.map(v=>parseProjectReport(v,projectId,false));
      if(alive.current&&epoch===historyEpoch.current){setVersions(old=>before?[...old,...rows.filter(v=>!old.some(item=>item.id===v.id))]:rows);setNextBefore(response.nextBeforeRevision);}
    }catch(e){if(alive.current&&epoch===historyEpoch.current)setError(errorMessage(e));}
    finally{if(alive.current&&epoch===historyEpoch.current)setHistoryBusy(false);}
  },[projectId]);
  useEffect(()=>{
    let live=true;alive.current=true;const counter=historyEpoch;
    void hostedRequest(`/api/projects/${projectId}/report`).then(value=>{
      if(!live)return;
      const saved=parseReportHead(value,projectId);
      if(cached){if((saved?.revision??0)!==(cached.head?.revision??0))setConflict(true);current.current=cached.content;setContent(cached.content);setInitial(cached.content);}
      else{remember(saved);const first=saved?.content??newProjectReport(title);current.current=first;setContent(first);setInitial(first);}
      void history();
    }).catch(e=>{if(live)setError(errorMessage(e));}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;alive.current=false;counter.current++;};
  },[projectId,title,cached,history,remember]);

  const save = useCallback(async()=>{
    if(lock.current||!writable||(conflict&&!pending.current)||!current.current)return;
    lock.current=true;setBusy(true);setError('');
    try{
      pending.current ??= {content:parseEditorContent(structuredClone(current.current)),expectedRevision:headRef.current?.revision??0,idempotencyKey:crypto.randomUUID()};
      const receipt=parseProjectReport(await mutate(`/api/projects/${projectId}/report/versions`,pending.current),projectId);
      if(!alive.current)return;
      const latest=parseReportHead(await hostedRequest(`/api/projects/${projectId}/report`),projectId);
      if(!alive.current)return;
      if(!latest||latest.revision<receipt.revision)throw Error('保存回执尚未与当前版本匹配，请重试原保存。');
      pending.current=null;setUncertain(false);
      if(latest.revision>receipt.revision){setConflict(true);setNotice(`已保存 v${receipt.revision}；云端已有 v${latest.revision}，请核对。`);}
      else{remember(latest);setConflict(false);setNotice(`已保存报告与 PPT · v${receipt.revision}`);}
      void history();
    }catch(e){
      if(!alive.current)return;setError(errorMessage(e));
      if(e instanceof HostedApiError&&e.status>=400&&e.status<500){pending.current=null;setUncertain(false);if(e.status===409)setConflict(true);}
      else if(pending.current)setUncertain(true);
    }finally{lock.current=false;if(alive.current)setBusy(false);}
  },[writable,conflict,mutate,projectId,remember,history]);

  async function load(versionId?:string){
    if(lock.current||uncertain||!current.current)return;
    lock.current=true;setBusy(true);setError('');const epoch=editEpoch.current;
    try{
      const latest=parseReportHead(await hostedRequest(`/api/projects/${projectId}/report`),projectId);
      const value=versionId?parseProjectReport(await hostedRequest(`/api/projects/${projectId}/report/versions/${versionId}`),projectId):latest;
      if(!alive.current)return;
      if(epoch!==editEpoch.current)throw Error('读取期间已有新编辑，请重新载入。');
      if(dirty&&!window.confirm('载入版本会替换当前未保存编辑。请确认已保存或下载备份。'))return;
      remember(latest);const next=value?.content??newProjectReport(title);current.current=next;setContent(next);setInitial(next);setGeneration(n=>n+1);setConflict(false);pending.current=null;
      setNotice(versionId?`已载入历史 v${value!.revision}；保存会新增版本。`:'已载入云端最新版本。');
    }catch(e){if(alive.current)setError(errorMessage(e));}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  if(loading)return <p role="status">正在恢复报告与 PPT…</p>;
  if(!initial)return <div className="hosted-empty"><p role="alert">{error||'报告暂未载入。'}</p><button onClick={()=>location.reload()}>重新载入</button></div>;
  const status=busy?'正在保存或读取…':uncertain?'保存结果待核对':conflict?'云端版本已变化':dirty?'有未保存修改':head?`云端 v${head.revision}`:'新建报告';
  return <section aria-label="项目报告与 PPT">
    <div className="hosted-project-heading"><div><h3>报告与 PPT</h3><span role="status">{status}</span></div><div className="hosted-actions"><button disabled={busy||uncertain} onClick={()=>void load()}>载入最新版本</button><button className="hosted-primary" disabled={!writable||busy||(conflict&&!uncertain)||(!dirty&&!!head&&!uncertain)} onClick={()=>void save()}>{uncertain?'核对并重试原保存':'保存报告与 PPT'}</button></div></div>
    {error&&<p role="alert" className="hosted-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {proposal&&<aside className="hosted-empty" aria-label="统计章节提案"><h4>{proposal.section.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{proposal.section.body}</p><details><summary>依据与计算口径</summary><pre style={{whiteSpace:'pre-wrap'}}>{proposal.section.source}</pre></details><div className="hosted-actions"><button disabled={busy||!writable||conflict||uncertain} onClick={()=>{if(editor.current?.appendSection(proposal.section))onProposalConsumed();}}>添加为新章节</button><button onClick={onProposalConsumed}>取消提案</button></div></aside>}
    <details><summary>报告版本 · {versions.length} 个已载入</summary><div className="hosted-actions">{versions.map(version=><button key={version.id} disabled={busy||uncertain} onClick={()=>void load(version.id)}>v{version.revision} · {version.title}</button>)}{nextBefore&&<button disabled={historyBusy} onClick={()=>void history(nextBefore)}>读取更早版本</button>}</div></details>
    <EditingStudio key={generation} controllerRef={editor} localOnly projectBinding={{initialContent:initial,status,onSnapshot,onSave:()=>void save()}}/>
  </section>;
}
