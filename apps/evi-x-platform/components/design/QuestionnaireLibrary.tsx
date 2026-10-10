"use client";

import { useEffect, useRef, useState } from 'react';
import { parseQuestionnaire, questionnaireIssues, type Questionnaire } from '@/lib/questionnaire';
import type { QuestionnaireProjectSummary, QuestionnaireVersion, QuestionnaireVersionSummary, QuestionnaireSaveReceipt, QuestionnaireRepairOrigin } from '@/lib/questionnaire-library';
import { parseQuestionnaireLibraryContent,parseQuestionnaireRepairOrigin } from '@/lib/questionnaire-library';
import {verifyQuestionnaireVersion,verifyQuestionnaireSaveReceipt,questionnaireCurrentRevision} from '@/lib/questionnaire-version';
import type {QuestionnaireReviewFinding} from '@/lib/questionnaire-review';
import {prepareQuestionnaireRepair,repairOriginInput} from '@/lib/questionnaire-revision';
import { EDITOR_RECOVERY_CHANNEL, EDITOR_RECOVERY_EVENT } from '@/lib/editor-recovery';
import styles from './QuestionnaireLibrary.module.css';
import QuestionnaireReview from './QuestionnaireReview';

type Props = {
  design: Questionnaire; repairOrigin:QuestionnaireRepairOrigin|null; editRevision: number; blocked: boolean; resetKey: number;
  isCurrent: (revision: number) => boolean;
  getIdentity: () => number;
  onCopySaved: (expectedIdentity:number)=>boolean;
  onLoad: (content: Questionnaire, expectedRevision: number, target?: Pick<QuestionnaireReviewFinding,'questionId'|'code'>,origin?:QuestionnaireRepairOrigin|null) => boolean;
};
type Binding = { projectId: string; revision: number; versionId: string; contentKey: string; originKey:string; title: string };
type Preview = { version: QuestionnaireVersion; currentRevision: number; editRevision: number; identity: number };
type SaveAttempt = { path: string; body: Record<string, unknown>; projectId: string; versionId: string; baseRevision: number; contentKey: string; repairOrigin:QuestionnaireRepairOrigin|null; label: string; identity: number; scope: string };
class LibraryError extends Error { constructor(message: string, readonly status = 0) { super(message); } }
async function api<T>(path: string, scope: string, body?: unknown): Promise<T & {scope:string}> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: { 'content-type':'application/json', ...(scope ? {'x-editor-scope':scope} : {}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(20000) });
  const value = await response.json() as {scope?:unknown;error?:{message?:string}};
  if (!response.ok) throw new LibraryError(value?.error?.message || '问卷库暂时不可用，当前设计仍保留。', response.status);
  if (scope && value.scope !== scope) throw new LibraryError('返回身份与连接身份不一致，未接纳保存或读取结果。');
  return value as T & {scope:string};
}
const time = (value:string) => new Date(value).toLocaleString('zh-CN');

export default function QuestionnaireLibrary({design,repairOrigin,editRevision,blocked,resetKey,isCurrent,getIdentity,onLoad,onCopySaved}:Props) {
  const [scope,setScope]=useState(''), [projects,setProjects]=useState<QuestionnaireProjectSummary[]>([]);
  const [selected,setSelected]=useState(''), [versions,setVersions]=useState<QuestionnaireVersionSummary[]>([]);
  const [binding,setBinding]=useState<Binding|null>(null), [preview,setPreview]=useState<Preview|null>(null);
  const [label,setLabel]=useState(''), [consent,setConsent]=useState(false), [approval,setApproval]=useState(false);
  const [pending,setPending]=useState<SaveAttempt|null>(null);
  const [repairTarget,setRepairTarget]=useState<{finding:QuestionnaireReviewFinding;origin:QuestionnaireRepairOrigin}|null>(null);
  const [busy,setBusy]=useState(false), [frozen,setFrozen]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('');
  const alive=useRef(true), lock=useRef(false), epoch=useRef(0), scopeRef=useRef(''), frozenRef=useRef(false);
  const [identity,setIdentity]=useState(resetKey);
  if(identity!==resetKey){setIdentity(resetKey);setBinding(null);setPreview(null);setConsent(false);setApproval(false);}
  const contentKey=parseQuestionnaireLibraryContent(design).serialized;
  const originKey=JSON.stringify(repairOrigin??null);
  const savedCurrent=!!binding && binding.contentKey===contentKey && binding.originKey===originKey && !blocked;
  const stalePreview=!!preview && (preview.editRevision!==editRevision || preview.identity!==resetKey || blocked);
  const context=JSON.stringify({editRevision,originKey,blocked,resetKey,label,scope,frozen,binding:binding?.versionId,preview:preview?.version.id,previewEdit:preview?.editRevision,selected});
  const [reviewedContext,setReviewedContext]=useState(context);
  if(reviewedContext!==context){setReviewedContext(context);setConsent(false);setApproval(false);setRepairTarget(null);}

  useEffect(()=>{
    alive.current=true;
    const requestEpoch=epoch;
    const freeze=()=>{frozenRef.current=true;epoch.current++;setFrozen(true);setConsent(false);setApproval(false);setError('身份恢复已启动，本页问卷库已冻结。请先下载未保存设计，再刷新连接；不会把旧请求归入新身份。');};
    window.addEventListener(EDITOR_RECOVERY_EVENT,freeze);
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(EDITOR_RECOVERY_CHANNEL);
    if(channel)channel.onmessage=e=>{if(e.data?.type==='identity-transition')freeze();};
    return()=>{alive.current=false;requestEpoch.current++;window.removeEventListener(EDITOR_RECOVERY_EVENT,freeze);channel?.close();};
  },[]);
  async function operation(work:(valid:()=>boolean)=>Promise<void>) {
    if(lock.current || frozenRef.current)return;
    lock.current=true;const ticket=++epoch.current;setBusy(true);setError('');setNotice('');
    const valid=()=>alive.current&&!frozenRef.current&&epoch.current===ticket;
    try{await work(valid);}catch(e){if(valid())setError(e instanceof Error?e.message:'操作失败，当前设计保留。');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  function connect(){void operation(async valid=>{
    if(!scopeRef.current){
      const start=()=>{if(!valid())return Promise.resolve();return fetch('/api/drafts/session',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)}).then(async r=>{if(!r.ok)throw new LibraryError(((await r.json()) as {error?:{message?:string}})?.error?.message||'无法连接编辑身份。',r.status);});};
      if(navigator.locks)await navigator.locks.request('evix-editor-session-v1',start);else await start();
    }
    if(!valid())return;
    const result=await api<{projects:QuestionnaireProjectSummary[]}>('/api/drafts/questionnaires',scopeRef.current);
    if(!valid())return;
    if(!/^[a-f0-9]{64}$/.test(result.scope))throw new LibraryError('问卷库身份无效，未连接。');
    scopeRef.current=result.scope;setScope(result.scope);setProjects(result.projects);
    if(selected){const history=await api<{versions:QuestionnaireVersionSummary[]}>(`/api/drafts/questionnaires/${selected}/versions`,result.scope);if(valid())setVersions(history.versions);}
    setNotice('已读取问卷目录；当前设计保留，本次未上传。');
  });}
  function selectProject(id:string){if(lock.current||frozenRef.current)return;setSelected(id);setPreview(null);setVersions([]);if(!id)return;void operation(async valid=>{
    const result=await api<{versions:QuestionnaireVersionSummary[]}>(`/api/drafts/questionnaires/${id}/versions`,scopeRef.current);
    if(valid())setVersions(result.versions);
  });}
  function inspect(versionId:string){if(!selected||blocked||lock.current||frozenRef.current)return;const projectId=selected,revision=editRevision,identity=getIdentity();setPreview(null);void operation(async valid=>{
    const result=await api<{version:QuestionnaireVersion;currentRevision:number}>(`/api/drafts/questionnaires/${projectId}/versions/${versionId}`,scopeRef.current);
    if(!valid())return;
    const version=await verifyQuestionnaireVersion(result.version,{projectId,versionId});
    const currentRevision=questionnaireCurrentRevision(result.currentRevision,version.revision);
    if(!valid())return;
    if(!isCurrent(revision)||getIdentity()!==identity)throw new LibraryError('读取或核验期间设计已变化，未替换任何内容。请重新预览此版本。');
    setPreview({version,currentRevision,editRevision:revision,identity});
  });}
  function applyPreview(){
    if(!preview||!approval||busy||lock.current||pending||frozenRef.current||blocked||!isCurrent(preview.editRevision)||getIdentity()!==preview.identity)return;
    if(repairTarget&&!questionnaireIssues(preview.version.content).some(i=>i.code===repairTarget.finding.code&&i.questionId===repairTarget.finding.questionId)){setError('修订目标与预览版本不一致，请重新读取检查记录。');return;}
    if(!onLoad(preview.version.content,preview.editRevision,repairTarget?{questionId:repairTarget.finding.questionId,code:repairTarget.finding.code}:undefined,repairTarget?.origin??null)){setError('当前设计已变化，未载入旧预览。请重新预览。');return;}
    // Restoring an older immutable version prepares a new draft. The current
    // server revision is the CAS base; no historical snapshot is overwritten.
    setBinding({projectId:preview.version.projectId,revision:preview.currentRevision,versionId:preview.version.id,contentKey:preview.version.revision===preview.currentRevision?parseQuestionnaireLibraryContent(preview.version.content).serialized:'',originKey:JSON.stringify(preview.version.repairOrigin??null),title:preview.version.title});
    setPreview(null);setApproval(false);setRepairTarget(null);setLabel('');setNotice(`已载入 v${preview.version.revision}${repairTarget?' 并定位修订目标':''}，可一次撤销。${preview.version.revision!==preview.currentRevision?'这是历史内容；保存时将追加新版本，不覆盖历史。':'本页继续修改后须显式保存。'}`);
  }
  async function saveAttempt(attempt:SaveAttempt,valid:()=>boolean){
    try{
      const response=await api<QuestionnaireSaveReceipt>(attempt.path,attempt.scope,attempt.body);
      if(!valid())return;
      const result=await verifyQuestionnaireSaveReceipt({project:response.project,version:response.version,replayed:response.replayed},attempt);
      if(!valid())return;
      setPending(null);setConsent(false);
      setProjects(old=>[result.project,...old.filter(p=>p.id!==result.project.id)]);
      if(getIdentity()===attempt.identity&&(attempt.path!=='/api/drafts/questionnaires'||onCopySaved(attempt.identity)))setBinding({projectId:attempt.projectId,revision:result.version.revision,versionId:result.version.id,contentKey:attempt.contentKey,originKey:JSON.stringify(attempt.repairOrigin),title:result.version.title});
      setNotice(`快照已保存为 v${result.version.revision}${result.replayed?'（同一请求已核对，未重复创建）':''}。${result.project.revision>result.version.revision?'库中已有更高版本；继续追加前请重新载入核对。':''}本页后续编辑不会被保存回执覆盖。请预览新版本，显式读取或运行它的检查。`);
      if(selected===attempt.projectId)setVersions(old=>[result.version,...old.filter(v=>v.id!==result.version.id)].sort((a,b)=>b.revision-a.revision));
      else if(attempt.path==='/api/drafts/questionnaires'){setSelected(attempt.projectId);setVersions([result.version]);}
    }catch(e){
      // A definite 4xx is a rejected operation; an unknown/5xx outcome keeps
      // the exact payload and idempotency token for reconciliation by retry.
      if(valid()&&e instanceof LibraryError&&e.status>=400&&e.status<500)setPending(null);
      throw e;
    }
  }
  function save(copy:boolean){
    if(!scope||!consent||blocked||pending||lock.current||frozenRef.current||!label.trim()||busy||(!copy&&!binding))return;
    let content:Questionnaire;try{content=parseQuestionnaire(JSON.stringify(design));}catch(e){setError((e as Error).message);return;}
    const projectId=copy?crypto.randomUUID():binding!.projectId,versionId=crypto.randomUUID(),versionLabel=label.trim();
    const origin=copy?null:parseQuestionnaireRepairOrigin(repairOrigin),originInput=repairOriginInput(origin);
    const attempt:SaveAttempt={path:copy?'/api/drafts/questionnaires':`/api/drafts/questionnaires/${projectId}/versions`,body:copy?{id:projectId,versionId,label:versionLabel,content,consent:true}:{id:versionId,baseRevision:binding!.revision,label:versionLabel,content,consent:true,...(originInput?{repairOrigin:originInput}:{})},projectId,versionId,baseRevision:copy?0:binding!.revision,contentKey:parseQuestionnaireLibraryContent(content).serialized,repairOrigin:origin,label:versionLabel,identity:getIdentity(),scope};
    setPending(attempt);void operation(valid=>saveAttempt(attempt,valid));
  }
  const previewIssues=preview?questionnaireIssues(preview.version.content):[];
  return <details className={styles.library}>
    <summary><span>问卷项目与版本</span><small>{frozen?'身份已冻结':binding?(savedCurrent?`已保存 · v${binding.revision}`:'有未保存更改'):scope?'已连接 · 本页尚未绑定':'按需连接 · 本页设计暂存内存'}</small></summary>
    <div className={styles.body}>
      <header className={styles.head}><div><span className={styles.eyebrow}>DESIGN HISTORY</span><h3>保存问卷与历史版本</h3><p>勾选并保存后，问卷文字才会上传到当前系统。问卷库独立于赛事控制项目与 Gate。</p></div><button type="button" disabled={busy||frozen} onClick={connect}>{scope?'刷新问卷目录':'连接问卷库'}</button></header>
      <p className={styles.privacy}>保存范围：简介、题干、选项、变量、显示条件、来源与预试备注；不含答卷、演练答案、未应用的数值或拼装输入。请删除个人信息、未授权材料和机密。已存版本不自动删除，请同时保留本地备份。</p>
      {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
      {blocked&&<p className={styles.warning}>请先完成数值输入、文件读取或当前确认；问卷库暂不保存和载入。</p>}
      <div className={styles.grid}>
        <section className={styles.save} aria-label="保存当前问卷版本"><h4>保存当前设计</h4>
          <p>{binding?<>当前绑定：{binding.title||'未命名问卷'} · 追加基线 v{binding.revision}<br/><small>项目 {binding.projectId.slice(0,8)} · {savedCurrent?'当前内容与保存快照一致':'本页内容尚未全部保存'}</small></>:<>尚未绑定问卷项目。首次保存将创建独立问卷项目。</>}</p>
          {repairOrigin&&<aside className={styles.origin} aria-label="当前修订来源"><strong>修订来历 · 原 v{repairOrigin.sourceRevision}</strong><p>{repairOrigin.questionId?`题目 ${repairOrigin.questionId}`:'研究简介 / 整体结构'} · {repairOrigin.code}</p><p>{binding?'保存下一版时关联这一原检查；另存新项目不继承它。':'当前未绑定项目，另存新问卷不会继承这一来源。'}</p><small>原检查 {repairOrigin.reviewId} · 仅表示来历，不表示问题已解决。</small></aside>}
          <label>本次版本说明<input value={label} maxLength={80} placeholder="例如：认知访谈后修订筛选题" disabled={busy||frozen||!!pending} onChange={e=>setLabel(e.target.value)}/></label>
          <label className={styles.check}><input type="checkbox" checked={consent} disabled={!scope||busy||frozen||blocked||!!pending} onChange={e=>setConsent(e.target.checked)}/><span>已检查当前问卷的隐私与权利，同意将本版完整设计保存到当前系统。</span></label>
          <div className={styles.actions}>{binding&&<button type="button" className={styles.primary} disabled={!scope||!consent||!label.trim()||busy||frozen||blocked||!!pending} onClick={()=>save(false)}>保存为下一版本</button>}<button type="button" className={!binding?styles.primary:undefined} disabled={!scope||!consent||!label.trim()||busy||frozen||blocked||!!pending} onClick={()=>save(true)}>{binding?'另存为新问卷项目':'创建问卷项目并保存'}</button></div>
          <small>每个身份最多 40 个问卷项目，每项目最多 40 个版本；已存版本不可覆盖。</small>
          {pending&&!busy&&<div className={styles.warning}><strong>上次保存结果尚未确认</strong><p>版本说明：{pending.label}。重试只发送原快照和当时的修订来源，不包含后续新编辑，也不会重复创建。{pending.repairOrigin?`原检查：${pending.repairOrigin.reviewId}。`:'本次保存不含修订来源。'}</p><button type="button" disabled={frozen} onClick={()=>void operation(valid=>saveAttempt(pending,valid))}>核对并重试上次保存</button></div>}
        </section>
        <section className={styles.history} aria-label="已保存的问卷项目"><h4>已保存的问卷 <small>{projects.length} / 40</small></h4>
          <label>选择问卷项目<select value={selected} disabled={!scope||busy||frozen} onChange={e=>selectProject(e.target.value)}><option value="">{scope?'选择要查看的问卷':'连接后读取目录'}</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title||'未命名问卷'} · v{p.revision} · {p.id.slice(0,8)}</option>)}</select></label>
          {!versions.length?<p className={styles.empty}>{selected?'选择问卷项目后读取版本列表；保存新版本后请重新选择或刷新。':'选择项目只读取版本目录，不替换当前编辑。'}</p>:<ol className={styles.versions}>{versions.map(v=><li key={v.id}><div><strong>v{v.revision} · {v.label}</strong><small>{time(v.createdAt)} · {(v.size/1024).toFixed(1)} KB</small></div><button type="button" disabled={busy||frozen||blocked} onClick={()=>inspect(v.id)}>预览 v{v.revision}</button></li>)}</ol>}
        </section>
      </div>
      {preview&&<section className={styles.preview} aria-label="保存版本载入前预览"><header><div><span className={styles.eyebrow}>READ BEFORE RESTORE</span><h4>{preview.version.title||'未命名问卷'} · v{preview.version.revision}</h4></div><button type="button" disabled={busy} onClick={()=>{setPreview(null);setApproval(false);}}>取消载入</button></header>
        <div className={styles.comparison}><div><small>当前页面</small><strong>{design.title}</strong><p>{design.questions.length} 题 · 未保存编辑不会自动丢弃</p></div><div><small>拟载入的不可变版本</small><strong>{preview.version.label}</strong><p>{preview.version.content.questions.length} 题 · {previewIssues.filter(i=>i.level==='blocker').length} 项结构问题 · {previewIssues.filter(i=>i.level==='review').length} 项待复核</p></div></div>
        <details><summary>核对完整设计与服务端 SHA-256</summary><p className={styles.hash}>{preview.version.sha256}</p><pre>{JSON.stringify(preview.version.content,null,2)}</pre></details>
        <QuestionnaireReview key={`${scope}:${preview.version.id}:${editRevision}:${resetKey}:${blocked}:${frozen}`} source={preview.version} scope={scope} currentRevision={preview.currentRevision} disabled={stalePreview||busy||frozen||!!pending} isCurrent={()=>!frozenRef.current&&isCurrent(preview.editRevision)&&getIdentity()===preview.identity} onPrepareRevision={(finding,record)=>{
          if(busy||lock.current||pending||frozenRef.current||blocked||!isCurrent(preview.editRevision)||getIdentity()!==preview.identity)return;
          if(!questionnaireIssues(preview.version.content).some(i=>i.code===finding.code&&i.questionId===finding.questionId))return;
          void operation(async valid=>{const origin=await prepareQuestionnaireRepair(preview.version,record,finding);if(!valid()||!isCurrent(preview.editRevision)||getIdentity()!==preview.identity)return;setRepairTarget({finding:{...finding},origin});setApproval(false);});
        }}/>
        {repairTarget&&<p className={styles.notice} role="status">待定位：{repairTarget.finding.questionId?`第 ${repairTarget.finding.questionNumber} 题 ${repairTarget.finding.variable}`:'研究简介 / 题目结构'} · {repairTarget.finding.message}。原检查 {repairTarget.origin.reviewId} 已核对；当前内容尚未改变，请重新勾选并确认载入。</p>}
        <p>载入会替换当前已应用设计，可一次撤销；不会覆盖任何已存版本。保存、哈希一致或结构检查不代表问卷已验证、预试已实施或 Gate 通过。</p>
        {stalePreview&&<p className={styles.warning}>预览后当前设计已变化。请取消并重新预览；恢复原文字或撤销也不会使旧预览重新有效。</p>}
        <label className={styles.check}><input type="checkbox" checked={approval} disabled={stalePreview||busy||frozen} onChange={e=>setApproval(e.target.checked)}/><span>已核对本版内容，同意替换当前设计；重要内容已下载备份。</span></label>
        {pending&&<p className={styles.warning}>请先核对上次保存结果，再载入另一版本。</p>}
        <button type="button" className={styles.primary} disabled={!approval||stalePreview||busy||frozen||!!pending} onClick={applyPreview}>{repairTarget?'载入此版本并定位问题':'载入此版本到编辑区'}</button>
      </section>}
      {scope&&<p className={styles.muted}>问卷库沿用报告编辑身份。更换设备或清除 Cookie 前，请到<a href="#editor">报告与 PPT</a>配置恢复备份。恢复身份只能找回已保存版本，不能找回页内未保存内容。</p>}
    </div>
  </details>;
}
