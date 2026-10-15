'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { parseCollection, parseService, type Service } from '@evix/shared';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { hostedRequest, errorMessage, HostedApiError } from '@/components/hosted/api-client';
import KnowledgeLookupPanel from '@/components/knowledge/KnowledgeLookupPanel';
import type { KnowledgeLookupWire } from '@/lib/knowledge/api-contracts';
import type { TopicProfile, TopicRecommendation } from '@/lib/topic-advisor/types';
import { freezeTopicProposal, knownTopicRejection, parsePendingTopic, parseTopicReceipt, verifyTopicReceipt, topicSnapshot, type PendingTopicProposal, type TopicProposalReceipt } from '@/lib/topic-proposal';
import styles from './TopicModelProposal.module.css';

export type RefinedTopicHandoff = { title:string;decisionOwner:string;population?:string;geography?:string;problem?:string };
type Props={profile:TopicProfile;recommendation:TopicRecommendation|null;stale:boolean;catalogVersion:string;onUseTopic?:(topic:RefinedTopicHandoff)=>void};
const cacheKey=(id:string)=>`evix.topic.proposal.v1:${encodeURIComponent(id)}`;
function read(id:string|null){try{return id?parsePendingTopic(sessionStorage.getItem(cacheKey(id)),id):null;}catch{return null;}}

/** The model adds a proposal. Local feasibility and the research draft are unchanged until adoption. */
export default function TopicModelProposal({profile,recommendation,stale,catalogVersion,onUseTopic}:Props){
  const auth=useHostedSession(),accountId=auth.session?.user?.id??null;
  const draft=auth.getDraft('topic-model-draft') as {ownerId?:string;goal?:string;serviceId?:string}|undefined;
  const restored=draft?.ownerId===accountId?draft:undefined,original=read(accountId);
  const [services,setServices]=useState<Service[]>([]),[serviceId,setServiceId]=useState(restored?.serviceId??original?.body.serviceId??''),[goal,setGoal]=useState(restored?.goal??original?.body.goal??''),[consent,setConsent]=useState(false),[consentStamp,setConsentStamp]=useState('');
  const [history,setHistory]=useState<Array<{id:string;status:string;createdAt:string}>>([]);
  const [lookup,setLookup]=useState<KnowledgeLookupWire|null>(null),[includeLookup,setIncludeLookup]=useState(false);
  const [pending,setPending]=useState<PendingTopicProposal|null>(()=>read(accountId)),[receipt,setReceipt]=useState<TopicProposalReceipt|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const request=useRef(pending),busyRef=useRef(false),alive=useRef(true),epoch=auth.identityEpoch;
  const {isCurrentAccount}=auth;
  const chosen=services.find(s=>s.id===serviceId),ids=recommendation?[recommendation.patternId]:[];
  let snapshot='';try{snapshot=topicSnapshot(profile,ids,catalogVersion);}catch{/* Partially edited dates and numbers remain editable. */}
  const invalid=!snapshot;
  const consentKey=JSON.stringify([snapshot,serviceId,chosen?.revision,goal,includeLookup?lookup?.id:null]),consented=!invalid&&consent&&consentStamp===consentKey,unresolved=Boolean(pending&&(!receipt||!['ready','failed'].includes(receipt.status)));
  const allowed=()=>Boolean(accountId&&alive.current&&isCurrentAccount(accountId,epoch));
  function remember(value:PendingTopicProposal|null){if(!allowed()||!accountId)return;request.current=value;setPending(value);try{if(value)sessionStorage.setItem(cacheKey(accountId),JSON.stringify(value));else sessionStorage.removeItem(cacheKey(accountId));}catch{/* The server receipt remains addressable by its operation ID. */}}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{let active=true;if(!accountId)return;void hostedRequest('/api/services').then(raw=>{if(!active||!isCurrentAccount(accountId,epoch))return;const rows=parseCollection(raw,'services',parseService,8).filter(s=>s.capabilities.includes('research'));setServices(rows);setServiceId(current=>rows.some(row=>row.id===current)?current:rows[0]?.id??'');}).catch(error=>{if(active&&isCurrentAccount(accountId,epoch))setNotice(errorMessage(error));});return()=>{active=false;};},[accountId,epoch,isCurrentAccount]);
  async function generate(reconcile=false){
    if(busyRef.current||!allowed()||!accountId)return;
    let operation=request.current;
    if(!reconcile){
      if(unresolved||invalid||!recommendation||stale||!chosen||!consented)return;
      operation=freezeTopicProposal(accountId,{serviceId:chosen.id,serviceRevision:chosen.revision,idempotencyKey:crypto.randomUUID(),consent:true,catalogVersion,profile,candidateIds:ids,goal,...(includeLookup&&lookup?.status==='ready'?{lookupId:lookup.id}:{})});
      remember(operation);setReceipt(null);
    }
    if(!operation)return;
    busyRef.current=true;setBusy(true);setNotice(reconcile?'正在核对原请求…':'正在提交选题材料…');
    try{
      // Reusing the frozen nonce also reconciles a request whose first HTTP receipt was lost.
      const raw=await auth.mutate('/api/topic-advisor/proposals',operation.body,'POST',{maxBytes:100000,timeoutMs:45000});
      if(!allowed())return;
      const result=parseTopicReceipt(raw,operation.body);await verifyTopicReceipt(result,operation.body);if(!allowed())return;setReceipt(result);setNotice('');
    }catch(error){if(!allowed())return;setNotice(errorMessage(error));if(!reconcile&&error instanceof HostedApiError&&knownTopicRejection(error.status,error.code))remember(null);}
    finally{if(allowed()){busyRef.current=false;setBusy(false);}}
  }
  async function loadHistory(){
    if(!allowed())return;
    try{const raw=await hostedRequest('/api/topic-advisor/proposals') as {receipts?:unknown[]};if(!allowed())return;
      if(!Array.isArray(raw.receipts)||raw.receipts.length>20)throw Error('调用记录格式无效。');
      const rows=raw.receipts.map(value=>{const r=value as Record<string,unknown>;if(!r||typeof r.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(r.id)||!['running','ready','failed','outcome_unknown'].includes(String(r.status))||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt)))throw Error('调用记录格式无效。');return {id:r.id,status:String(r.status),createdAt:r.createdAt};});setHistory(rows);setNotice(rows.length?'':'暂无选题模型调用。');
    }catch(error){if(allowed())setNotice(errorMessage(error));}
  }
  async function exportReceipt(id:string){
    try{const raw=await hostedRequest(`/api/topic-advisor/proposals/${id}`,{maxBytes:100000});if(!allowed())return;const blob=new Blob([JSON.stringify(raw,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`选题回执-${id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){if(allowed())setNotice(errorMessage(error));}
  }
  const {setUnsaved,cacheDraft}=auth;
  useEffect(()=>{if(accountId)cacheDraft('topic-model-draft',{ownerId:accountId,goal,serviceId},Boolean(goal),accountId);},[cacheDraft,accountId,goal,serviceId]);
  useEffect(()=>{setUnsaved('topic-model-proposal',unresolved||Boolean(goal.trim()&&(!pending||pending.body.goal!==goal.trim())));return()=>setUnsaved('topic-model-proposal',false);},[setUnsaved,unresolved,goal,pending]);
  const receiptStale=Boolean(pending&&(invalid||pending.snapshotKey!==snapshot||stale||pending.body.goal!==goal.trim()||(pending.body.lookupId??null)!==(includeLookup?lookup?.id??null:null)||pending.body.serviceId!==serviceId||pending.body.serviceRevision!==chosen?.revision));
  const searchSeed=[profile.city||profile.region||'全国',profile.referenceDate.slice(0,4),recommendation?.title||'科技 就业 消费 文旅','政策 公开数据'].filter(Boolean).join(' ').slice(0,120);
  return <section className={styles.root} data-self-styled aria-label="选题研究助手">
    <KnowledgeLookupPanel initialQuery={searchSeed} purpose="topics" onLookupReady={result=>{setLookup(result);setIncludeLookup(false);setConsent(false);}}/>
    <details className={styles.panel}>
      <summary><span>让选题顾问继续深挖</span><small>形成可修改的研究提案</small></summary>
      {!accountId?<p className={styles.note}><Link href="/login">登录</Link>后可使用个人研究模型。</p>:<>
        <p className={styles.note}>{recommendation?`当前方向：${recommendation.title}`:'先从推荐中选择一个方向，再细化调查问题与验证步骤。'}</p>
        <div className={styles.fields}>
          <label>研究模型<select aria-label="选题研究模型" value={serviceId} disabled={busy||unresolved} onChange={e=>{setServiceId(e.target.value);setConsent(false);}}>{!services.length&&<option value="">尚未配置研究模型</option>}{services.map(s=><option key={s.id} value={s.id}>{s.label} · {s.provider} · v{s.revision}</option>)}</select></label>
          <Link href="/services">管理模型服务 ↗</Link>
        </div>
        <label className={styles.goal}>希望重点挖掘什么？<textarea aria-label="选题细化要求" rows={3} maxLength={800} value={goal} disabled={busy||unresolved} placeholder="例如：从政策落地后的服务缺口切入，比较已使用者与未使用者。" onChange={e=>{setGoal(e.target.value);setConsent(false);}}/></label>
        {lookup&&<label className={styles.check}><input type="checkbox" checked={includeLookup} disabled={busy||unresolved} onChange={e=>{setIncludeLookup(e.target.checked);setConsent(false);}}/>加入刚刚检索的 {lookup.results.length} 条公开线索（{lookup.query}）</label>}
        <details className={styles.scope}><summary>查看本次发送范围</summary><p>地区：{profile.region} {profile.city}；学校：{profile.school||'未填写'}；专业：{profile.discipline||'未填写'}。还包含上方填写的团队资源、调查渠道、时间预算、当前方向及所勾选的公开线索。</p></details>
        <label className={styles.check}><input type="checkbox" aria-label="确认选题模型调用" checked={consented} disabled={busy||unresolved} onChange={e=>{setConsent(e.target.checked);setConsentStamp(consentKey);}}/>{auth.session?.mode==='local_test'?'使用合成模型验收这次提案':'确认将上述选题材料发送至所选模型，使用我的 API 额度'}</label>
        {invalid&&<p className={styles.notice}>请补全时间范围，并检查天数与预算。</p>}
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={busy||unresolved||stale||!chosen||!consented||!recommendation} onClick={()=>void generate()}>{busy?'等待模型回执…':'生成细化提案'}</button>{pending&&<button type="button" disabled={busy} onClick={()=>void generate(true)}>核对原请求</button>}</div>
        <div className={styles.actions}><button type="button" onClick={()=>void loadHistory()}>查找之前的调用</button></div>
        {history.length>0&&<ul>{history.map(row=><li key={row.id}>{new Date(row.createdAt).toLocaleString('zh-CN')} · {{ready:'已返回',running:'生成中',failed:'未完成',outcome_unknown:'待核对'}[row.status]} <button type="button" onClick={()=>void exportReceipt(row.id)}>下载回执</button></li>)}</ul>}
        {notice&&<p role="status" className={styles.notice}>{notice}</p>}
        {receipt&&<div className={styles.receipt} aria-live="polite">
          <p className={styles.meta}>{receipt.status==='ready'?'细化提案已返回':receipt.status==='outcome_unknown'?'调用结果待核对':receipt.status==='failed'?'本次生成未完成':'请求已接收'} · {receipt.providerMode==='fixture'?'合成模型验收':'个人研究模型'}{receipt.finishedAt&&` · ${new Date(receipt.finishedAt).toLocaleString('zh-CN')}`}</p>
          {receiptStale&&<p className={styles.notice}>研究背景或当前方向已变化，这份提案保留供对照。</p>}
          {receipt.proposal?.items.map(item=><article className={styles.proposal} key={item.patternId}><h4>{item.title}</h4><p className={styles.question}>{item.researchQuestion}</p><dl><dt>地区与团队契合点</dt><dd>{item.whyHere}</dd><dt>拟支持的决策</dt><dd>{item.decisionOwner}：{item.decision}</dd></dl><h5>先做这几步</h5><ol>{item.firstWeekPlan.map((step,index)=><li key={index}>{step}</li>)}</ol>{item.unknowns.length>0&&<details><summary>待核实条件 · {item.unknowns.length}</summary><ul>{item.unknowns.map((x,i)=><li key={i}>{x}</li>)}</ul></details>}<div className={styles.sources}>{item.sourceIds.map(id=>{const source=receipt.sources.find(s=>s.id===id);return source?.url?<a href={source.url} key={id} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>:<span key={id}>{source?.title}</span>;})}</div><button type="button" disabled={receiptStale||!onUseTopic} onClick={()=>onUseTopic?.({title:item.title,decisionOwner:item.decisionOwner,population:recommendation?.population,geography:[profile.region,profile.city].filter(Boolean).join(' '),problem:item.researchQuestion})}>采用此提案，继续项目诊断</button></article>)}
        </div>}
      </>}
    </details>
  </section>;
}
