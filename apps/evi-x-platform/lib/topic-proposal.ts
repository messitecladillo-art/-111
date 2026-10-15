import { rejectDuplicateMembers } from './questionnaire.ts';
import { stableStringify } from './topic-advisor/parse.ts';
import { parseTopicProfile } from './topic-advisor/parse.ts';
import type { TopicProfile } from './topic-advisor/types.ts';

export type TopicProposalInput = { serviceId:string; serviceRevision:number; idempotencyKey:string; consent:true; catalogVersion:string; profile:TopicProfile; candidateIds:string[]; goal:string; lookupId?:string };
export type TopicRefinement = { patternId:string; title:string; researchQuestion:string; decisionOwner:string; decision:string; whyHere:string; firstWeekPlan:string[]; unknowns:string[]; sourceIds:string[] };
export type TopicProposalReceipt = { id:string; status:'running'|'ready'|'failed'|'outcome_unknown'; classification:'proposed'; serviceId:string; serviceRevision:number; catalogVersion:string; inputFingerprint:string; createdAt:string; finishedAt:string|null; proposal:{classification:'proposed';items:TopicRefinement[]}|null; sources:Array<{id:string;title:string;url?:string;[key:string]:unknown}>; trainingExampleIds:string[]; errorCode:string|null; providerMode:'live'|'fixture' };
export type PendingTopicProposal = { schemaVersion:1; accountId:string; body:TopicProposalInput; snapshotKey:string };
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const string=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
function record(v:unknown,keys?:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('选题回执格式无效。');const d=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(d).some(k=>typeof k!=='string'||!("value" in d[k])||!d[k].enumerable||['__proto__','constructor','prototype'].includes(k)||keys&&!keys.includes(k)))throw Error('选题回执字段无效。');return v as Record<string,unknown>;}
function strings(v:unknown,n:number,max:number):string[]{if(!Array.isArray(v)||v.length>n||v.some(x=>!string(x,max))||new Set(v).size!==v.length)throw Error('选题回执列表无效。');return v;}
export function topicSnapshot(profile:TopicProfile,ids:string[],version:string){return JSON.stringify([parseTopicProfile(profile),ids,version]);}
/** Normalize once, before the nonce is first dispatched; the resulting body is immutable by convention. */
export function freezeTopicProposal(accountId:string,input:TopicProposalInput):PendingTopicProposal{
  const body={...input,profile:parseTopicProfile(input.profile),candidateIds:[...input.candidateIds],goal:input.goal.trim()};
  return{schemaVersion:1,accountId,body,snapshotKey:topicSnapshot(body.profile,body.candidateIds,body.catalogVersion)};
}
export function parsePendingTopic(raw:string|null,accountId:string):PendingTopicProposal|null{
  if(!raw||raw.length>30000)return null;
  try{rejectDuplicateMembers(raw);const r=record(JSON.parse(raw),['schemaVersion','accountId','body','snapshotKey']);const b=record(r.body,['serviceId','serviceRevision','idempotencyKey','consent','catalogVersion','profile','candidateIds','goal','lookupId']);
    if(r.schemaVersion!==1||r.accountId!==accountId||!uuid(b.serviceId)||!uuid(b.idempotencyKey)||!Number.isInteger(b.serviceRevision)||Number(b.serviceRevision)<1||b.consent!==true||!string(b.catalogVersion,100)||!string(b.goal,800)||!string(r.snapshotKey,22000)||b.lookupId!==undefined&&!uuid(b.lookupId))return null;
    const profile=parseTopicProfile(b.profile),ids=strings(b.candidateIds,4,100);if(!ids.length||r.snapshotKey!==topicSnapshot(profile,ids,b.catalogVersion))return null;
    // Validate a normalized view, but replay the exact original JSON values. Older
    // requests may already have been dispatched with surrounding whitespace.
    return{schemaVersion:1,accountId,body:b as TopicProposalInput,snapshotKey:r.snapshotKey};
  }catch{return null;}
}
export function parseTopicReceipt(value:unknown,request:TopicProposalInput):TopicProposalReceipt{
  const r=record(value,['id','status','classification','serviceId','serviceRevision','catalogVersion','inputFingerprint','createdAt','finishedAt','proposal','sources','trainingExampleIds','errorCode','providerMode']);
  if(r.id!==request.idempotencyKey||r.serviceId!==request.serviceId||r.serviceRevision!==request.serviceRevision||r.catalogVersion!==request.catalogVersion||r.classification!=='proposed'||!['running','ready','failed','outcome_unknown'].includes(String(r.status))||!string(r.inputFingerprint,64)||!/^[a-f0-9]{64}$/.test(r.inputFingerprint)||!string(r.createdAt,40)||!Number.isFinite(Date.parse(r.createdAt))||r.finishedAt!==null&&(!string(r.finishedAt,40)||!Number.isFinite(Date.parse(r.finishedAt)))||!['live','fixture'].includes(String(r.providerMode))||r.errorCode!==null&&!string(r.errorCode,64))throw Error('选题回执与本次请求不一致。');
  strings(r.trainingExampleIds,3,100);
  if(!Array.isArray(r.sources)||r.sources.length>100)throw Error('选题来源无效。');
  const sourceIds=new Set<string>();
  for(const raw of r.sources){const s=record(raw);if(!string(s.id,160)||!string(s.title,500)||sourceIds.has(s.id))throw Error('选题来源无效。');sourceIds.add(s.id);if(s.url!==undefined){if(!string(s.url,2048))throw Error('选题来源地址无效。');const u=new URL(s.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('选题来源地址无效。');}}
  if(r.proposal!==null){const p=record(r.proposal,['classification','items']);if(p.classification!=='proposed'||!Array.isArray(p.items)||p.items.length!==request.candidateIds.length)throw Error('选题提案不完整。');const seen=new Set();for(const raw of p.items){const i=record(raw,['patternId','title','researchQuestion','decisionOwner','decision','whyHere','firstWeekPlan','unknowns','sourceIds']);if(!request.candidateIds.includes(String(i.patternId))||seen.has(i.patternId))throw Error('选题候选不一致。');seen.add(i.patternId);for(const k of ['title','researchQuestion','decisionOwner','decision','whyHere'])if(!string(i[k],k==='title'?160:600)||!(i[k]as string).trim())throw Error('选题提案字段无效。');if(!strings(i.firstWeekPlan,5,300).length)throw Error('选题验证步骤为空。');strings(i.unknowns,8,300);if(!strings(i.sourceIds,20,160).length||strings(i.sourceIds,20,160).some(id=>!sourceIds.has(id)))throw Error('选题提案引用了未提供的来源。');}}
  if(r.status==='ready'&&r.proposal===null||r.status!=='ready'&&r.proposal!==null)throw Error('选题状态与内容不一致。');
  return r as unknown as TopicProposalReceipt;
}
export function knownTopicRejection(status:number,code:string){return status>=400&&status<500&&['invalid_input','topic_infeasible','duplicate_members','consent_required','catalog_conflict','revision_conflict','capability_unavailable','not_found','lookup_unavailable','call_rate_limit','call_active','sensitive_input'].includes(code);}

export async function verifyTopicReceipt(receipt:TopicProposalReceipt,request:TopicProposalInput){
  const material={profile:request.profile,candidateIds:request.candidateIds,goal:request.goal,catalogVersion:request.catalogVersion,lookupId:request.lookupId??null};
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableStringify(material))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==receipt.inputFingerprint)throw Error('选题回执的材料指纹不一致。');
}
