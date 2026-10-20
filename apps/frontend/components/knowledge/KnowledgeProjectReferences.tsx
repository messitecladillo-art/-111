'use client';
import { useEffect, useRef, useState } from 'react';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { errorMessage } from '@/components/hosted/api-client';
import { parseKnowledgeProjectReferences, type KnowledgeProjectReferencesWire } from '@/lib/knowledge/api-contracts';
import { validateKnowledgePack, type KnowledgeEntry } from '@/lib/knowledge/types';
import { rejectDuplicateMembers } from '@evix/shared';
import KnowledgeEntryView from './KnowledgeEntryView';
import { KNOWLEDGE_ENTRIES } from './catalog';
import styles from './Knowledge.module.css';

type Intent = { method: 'POST' | 'DELETE'; referenceId?: string; entryId?: string; entryVersion?: number; expectedRevision: number; idempotencyKey: string };
type Snapshot = KnowledgeProjectReferencesWire & { status: 'loading' | 'ready' | 'saving' | 'unknown' | 'conflict' | 'error'; notice: string };
type Options = { projectId: string; request: (path: string, body: unknown, method: string, signal?: AbortSignal) => Promise<unknown>; pending?: unknown; savePending: (value: Intent | null) => void; createId?: () => string };
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function checkedArchivedEntry(value: unknown, expected: {entryId:string;entryVersion:number}, catalog:readonly KnowledgeEntry[]=KNOWLEDGE_ENTRIES):KnowledgeEntry {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('词条版本文件无效。');
  const entry=value as KnowledgeEntry;
  if(entry.id!==expected.entryId||entry.version!==expected.entryVersion||entry.review?.status!=='reviewed')throw Error('词条文件与所引用版本不一致。');
  validateKnowledgePack({schemaVersion:1,version:'exact-archive',entries:[...catalog.filter(item=>item.id!==entry.id),entry]});
  return entry;
}
function restoreIntent(value: unknown): Intent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const intent = value as Intent;
  if (Object.keys(value).some(key => !['method','referenceId','entryId','entryVersion','expectedRevision','idempotencyKey'].includes(key)) || !uuid(intent.idempotencyKey) || !Number.isSafeInteger(intent.expectedRevision) || intent.expectedRevision < 0) return null;
  if (intent.method === 'DELETE') return uuid(intent.referenceId) && intent.entryId === undefined && intent.entryVersion === undefined ? intent : null;
  return intent.method === 'POST' && intent.referenceId === undefined && typeof intent.entryId === 'string' && /^[a-z0-9][a-z0-9._-]{0,95}$/.test(intent.entryId) && Number.isInteger(intent.entryVersion) && intent.entryVersion! > 0 ? intent : null;
}
/** Exact version references; manual replay preserves the original request, not a new intent. */
export function createKnowledgeReferenceController(options: Options) {
  if (!uuid(options.projectId)) throw Error('项目标识无效。');
  const endpoint = `/api/projects/${options.projectId}/knowledge-references`;
  const listeners = new Set<() => void>(); let epoch = 0, disposed = false, active: AbortController | null = null, pending = restoreIntent(options.pending);
  let snapshot: Snapshot = { revision: 0, references: [], status: pending ? 'unknown' : 'loading', notice: pending ? '有待核对的术语引用操作。' : '' };
  const emit = (patch: Partial<Snapshot>) => { if (!disposed) { snapshot = { ...snapshot, ...patch }; for (const callback of listeners) callback(); } };
  async function reload() {
    if (disposed || snapshot.status === 'saving') return;
    active?.abort();const controller = new AbortController();active=controller;const token=++epoch;
    emit({status:pending?'unknown':'loading'});
    try { const result=parseKnowledgeProjectReferences(await options.request(endpoint, undefined,'GET',controller.signal));if(token!==epoch||disposed)return;emit({...result,status:pending?'unknown':'ready',notice:pending?'有待核对的术语引用操作。':''}); }
    catch(error){if(token===epoch&&!disposed)emit({references:[],status:pending?'unknown':'error',notice:errorMessage(error)});}
    finally{if(active===controller)active=null;}
  }
  async function submit(intent: Intent, reconcile = false) {
    if (disposed || snapshot.status==='saving') return;
    const token=++epoch,controller=new AbortController();active?.abort();active=controller;pending=intent;options.savePending(intent);emit({status:'saving',notice:reconcile?'正在核对引用回执…':'正在保存术语引用…'});
    const url=intent.referenceId?`${endpoint}/${intent.referenceId}`:endpoint;
    const body={expectedRevision:intent.expectedRevision,idempotencyKey:intent.idempotencyKey,...(intent.method==='POST'?{entryId:intent.entryId,entryVersion:intent.entryVersion}:{})};
    try{
      const accepted=parseKnowledgeProjectReferences(await options.request(url,body,intent.method,controller.signal));
      if(token!==epoch||disposed)return;
      const matches=intent.method==='POST'?accepted.references.some(ref=>ref.entryId===intent.entryId&&ref.entryVersion===intent.entryVersion):!accepted.references.some(ref=>ref.id===intent.referenceId);
      if(accepted.revision!==intent.expectedRevision+1||!matches)throw Error('术语引用回执与本次操作不一致。');
      pending=null;options.savePending(null);emit({...accepted,status:'ready',notice:'术语引用已保存。'});
      if(reconcile){
        const latest=parseKnowledgeProjectReferences(await options.request(endpoint,undefined,'GET',controller.signal));if(token!==epoch||disposed)return;
        if(latest.revision<accepted.revision)throw Error('项目术语版本回执倒退。');
        emit({...latest,status:'ready',notice:'回执已核对，当前展示项目最新术语。'});
      }
    }catch(error){
      if(token!==epoch||disposed)return;
      const issue=error as {status?:number;code?:string};
      if(!pending){emit({status:'error',notice:'操作已确认，项目最新术语暂未读取。请重新读取。'});}
      else if(issue.status===409&&issue.code==='version_conflict'){pending=null;options.savePending(null);emit({status:'conflict',notice:'项目术语已有更新，请重新读取后选择操作。'});}
      else if(issue.status&&issue.status>=400&&issue.status<500&&issue.status!==409){pending=null;options.savePending(null);emit({references:issue.status===403||issue.status===404?[]:snapshot.references,status:'error',notice:errorMessage(error)});}
      else emit({status:'unknown',notice:issue.status===409?'请求标识冲突，已保留记录，请联系管理员核对。':'引用回执未确认，请核对本次操作。'});
    }finally{if(active===controller)active=null;}
  }
  return {
    getSnapshot:()=>snapshot,subscribe(callback:()=>void){listeners.add(callback);return()=>listeners.delete(callback);},reload,
    add(entry:Pick<KnowledgeEntry,'id'|'version'>){if(snapshot.status!=='ready'||pending||snapshot.references.some(ref=>ref.entryId===entry.id&&ref.entryVersion===entry.version))return Promise.resolve();return submit({method:'POST',entryId:entry.id,entryVersion:entry.version,expectedRevision:snapshot.revision,idempotencyKey:(options.createId??(()=>crypto.randomUUID()))()});},
    remove(id:string){if(snapshot.status!=='ready'||pending||!snapshot.references.some(ref=>ref.id===id))return Promise.resolve();return submit({method:'DELETE',referenceId:id,expectedRevision:snapshot.revision,idempotencyKey:(options.createId??(()=>crypto.randomUUID()))()});},
    reconcile:()=>pending?submit(pending,true):Promise.resolve(),dispose(){disposed=true;epoch++;active?.abort();listeners.clear();},
  };
}

export default function KnowledgeProjectReferences({ projectId, selected, onChoose }: {projectId?:string;selected?:KnowledgeEntry;onChoose:(id:string)=>void}) {
  const auth=useHostedSession(),accountId=auth.session?.authenticated?auth.session.user?.id??null:null;
  const [value,setValue]=useState<{accountId:string;projectId:string;snapshot:Snapshot}|null>(null);
  const controller=useRef<ReturnType<typeof createKnowledgeReferenceController>|null>(null);
  const archiveEpoch=useRef(0),archiveRequest=useRef<AbortController|null>(null);
  const [archive,setArchive]=useState<{accountId:string;projectId:string;entry:KnowledgeEntry}|null>(null),[archiveNotice,setArchiveNotice]=useState('');
  const mutate=auth.mutate,getDraft=auth.getDraft,cacheDraft=auth.cacheDraft;
  useEffect(()=>{
    if(!projectId||!uuid(projectId)||!accountId)return;
    const key=`knowledge-references:${projectId}`;
    const current=createKnowledgeReferenceController({projectId,pending:getDraft(key),savePending:intent=>cacheDraft(key,intent,Boolean(intent),accountId),request:(path,body,method,signal)=>mutate(path,body,method,{signal,maxBytes:512000})});
    controller.current=current;const publish=()=>setValue({accountId,projectId,snapshot:current.getSnapshot()});const unsubscribe=current.subscribe(publish);publish();void current.reload();
    const archiveFence=archiveEpoch;
    return()=>{archiveFence.current++;archiveRequest.current?.abort();unsubscribe();current.dispose();if(controller.current===current)controller.current=null;};
  },[projectId,accountId,auth.identityEpoch,mutate,getDraft,cacheDraft]);
  if(!projectId||!uuid(projectId))return null;
  if(!accountId)return <p className={styles.caption}>登录后可保存项目术语表。</p>;
  const state=value?.accountId===accountId&&value.projectId===projectId?value.snapshot:null;
  async function readArchive(reference: {entryId:string;entryVersion:number}) {
    const token=++archiveEpoch.current,request=new AbortController();archiveRequest.current?.abort();archiveRequest.current=request;setArchive(null);setArchiveNotice('正在读取引用版本…');
    try{
      const response=await fetch(`/knowledge-data/entries/${encodeURIComponent(reference.entryId)}/${reference.entryVersion}`,{signal:request.signal,cache:'force-cache'});
      if(!response.ok)throw Error(response.status===404?'引用版本尚未发布，原引用已保留。':'词条版本读取未完成。');
      const reader=response.body?.getReader();if(!reader)throw Error('词条版本文件为空。');const chunks:Uint8Array[]=[];let length=0;
      try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>256000){await reader.cancel();throw Error('词条版本文件超过读取限制。');}chunks.push(part.value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);rejectDuplicateMembers(text);const entry=checkedArchivedEntry(JSON.parse(text),reference);
      if(token!==archiveEpoch.current)return;setArchive({accountId:accountId!,projectId:projectId!,entry});setArchiveNotice('');
    }catch(error){if(token===archiveEpoch.current)setArchiveNotice(errorMessage(error));}finally{if(archiveRequest.current===request)archiveRequest.current=null;}
  }
  return <details className={styles.recognition}>
    <summary>项目术语表{state?` · ${state.references.length}`:''}</summary>
    {selected&&<div className={styles.entryActions}><button disabled={state?.status!=='ready'||state.references.some(ref=>ref.entryId===selected.id&&ref.entryVersion===selected.version)} onClick={()=>void controller.current?.add(selected)}>加入「{selected.name}」v{selected.version}</button></div>}
    {state?.references.map(reference=>{const entry=KNOWLEDGE_ENTRIES.find(e=>e.id===reference.entryId);return <div className={styles.source} key={reference.id}><strong>{entry?.name??reference.entryId} · v{reference.entryVersion}</strong>{entry&&entry.version!==reference.entryVersion&&<p className={styles.meta}>所引版本 v{reference.entryVersion} · 当前词条 v{entry.version}，原引用保留。</p>}<div className={styles.entryActions}><button onClick={()=>void readArchive(reference)}>阅读引用版本</button>{entry&&entry.version!==reference.entryVersion&&<button onClick={()=>onChoose(entry.id)}>查看当前 v{entry.version}</button>}<button disabled={state.status!=='ready'} onClick={()=>void controller.current?.remove(reference.id)}>移除引用</button></div></div>;})}
    {archiveNotice&&<p role="status" className={styles.notice}>{archiveNotice}</p>}
    {archive?.accountId===accountId&&archive.projectId===projectId&&<><p className={styles.caption}>项目引用版本 · v{archive.entry.version}</p><button className={styles.back} onClick={()=>setArchive(null)}>关闭版本阅读</button><KnowledgeEntryView entry={archive.entry} onRelated={onChoose} favorite={false} onFavorite={()=>{setArchiveNotice('此处阅读项目引用版本；个人收藏可在当前词条页设置。');}}/></>}
    {(!state||state.status==='loading')&&<p role="status">正在读取项目术语…</p>}
    {state?.notice&&<p className={styles.notice} role="status">{state.notice}</p>}
    {state&&['unknown','conflict','error'].includes(state.status)&&<div className={styles.entryActions}><button onClick={()=>void controller.current?.reload()}>重新读取</button>{state.status==='unknown'&&<button onClick={()=>void controller.current?.reconcile()}>核对本次引用</button>}</div>}
  </details>;
}
