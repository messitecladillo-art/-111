import { rejectDuplicateMembers } from './questionnaire.ts';
import { stableStringify } from './topic-advisor/parse.ts';
import { parseTopicProfile, parseExecutableTopicProfile } from './topic-advisor/parse.ts';
import { regionPath } from './topic-advisor/regions.ts';
import sourceVersionData from '../content/topic-advisor/source-versions.json' with { type: 'json' };
import type { TopicProfile } from './topic-advisor/types.ts';

export type TopicProposalInput = { serviceId:string; serviceRevision:number; idempotencyKey:string; consent:true; catalogVersion:string; profile:TopicProfile; candidateIds:string[]; goal:string; lookupId?:string };
export type TopicRefinement = { patternId:string; title:string; researchQuestion:string; decisionOwner:string; decision:string; whyHere:string; firstWeekPlan:string[]; unknowns:string[]; sourceIds:string[] };
export type TopicSourceVersions = { topicDigest:string;regionCatalog:{catalogVersion:string;asOf:string;catalogSha256:string} };
export type TopicProposalReceipt = { id:string; status:'running'|'ready'|'failed'|'outcome_unknown'; classification:'proposed'; serviceId:string; serviceRevision:number; catalogVersion:string; inputFingerprint:string; createdAt:string; finishedAt:string|null; proposal:{classification:'proposed';items:TopicRefinement[]}|null; sources:Array<{id:string;title:string;url?:string;[key:string]:unknown}>; trainingExampleIds:string[]; errorCode:string|null; providerMode:'live'|'fixture';sourceVersions?:TopicSourceVersions };
export type PendingTopicProposal = { schemaVersion:1; accountId:string; body:TopicProposalInput; snapshotKey:string;sourceVersions?:TopicSourceVersions };
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const string=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
function record(v:unknown,keys?:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('选题回执格式无效。');const d=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(d).some(k=>typeof k!=='string'||!("value" in d[k])||!d[k].enumerable||['__proto__','constructor','prototype'].includes(k)||keys&&!keys.includes(k)))throw Error('选题回执字段无效。');return v as Record<string,unknown>;}
function strings(v:unknown,n:number,max:number):string[]{if(!Array.isArray(v)||v.length>n||v.some(x=>!string(x,max))||new Set(v).size!==v.length)throw Error('选题回执列表无效。');return v;}
export function parseTopicSourceVersions(value:unknown):TopicSourceVersions {
  const v=record(value,['topicDigest','regionCatalog']),region=record(v.regionCatalog,['catalogVersion','asOf','catalogSha256']);
  if(Object.keys(v).length!==2||Object.keys(region).length!==3||!string(v.topicDigest,64)||!/^[a-f0-9]{64}$/.test(v.topicDigest)||!string(region.catalogSha256,64)||!/^[a-f0-9]{64}$/.test(region.catalogSha256)||!string(region.catalogVersion,100)||region.catalogVersion!==region.catalogVersion.trim()||!/^cn-admin-[A-Za-z0-9-]+$/.test(region.catalogVersion)||!string(region.asOf,10)||!/^\d{4}-12-31$/.test(region.asOf))throw Error('选题来源版本回执无效。');
  return{topicDigest:v.topicDigest,regionCatalog:{catalogVersion:region.catalogVersion,asOf:region.asOf,catalogSha256:region.catalogSha256}};
}
const versionData=parseTopicSourceVersions(sourceVersionData);
export const TOPIC_SOURCE_VERSIONS:Readonly<TopicSourceVersions>=Object.freeze({...versionData,regionCatalog:Object.freeze(versionData.regionCatalog)});
function storedSnapshot(profile:TopicProfile,ids:string[],version:string,versions?:TopicSourceVersions){const parsed=parseTopicProfile(profile);return JSON.stringify(parsed.schemaVersion===2?[parsed,ids,version,parseTopicSourceVersions(versions)]:[parsed,ids,version]);}
/** Fresh consent/currentness must use an executable profile and the currently bundled source hashes. */
export function topicSnapshot(profile:TopicProfile,ids:string[],version:string){const parsed=parseExecutableTopicProfile(profile);return storedSnapshot(parsed,ids,version,parsed.schemaVersion===2?TOPIC_SOURCE_VERSIONS:undefined);}
export function topicGeographyLabel(profile:TopicProfile):string {const parsed=parseExecutableTopicProfile(profile);return parsed.schemaVersion===2?(parsed.regionRef?regionPath(parsed.regionRef).map(r=>r.name).join(' · '):''):[parsed.region,parsed.city].filter(Boolean).join(' ');}
/** Normalize once, before the nonce is first dispatched; the resulting body is immutable by convention. */
export function freezeTopicProposal(accountId:string,input:TopicProposalInput):PendingTopicProposal{
  const body={...input,profile:parseExecutableTopicProfile(input.profile),candidateIds:[...input.candidateIds],goal:input.goal.trim()};
  return{schemaVersion:1,accountId,body,snapshotKey:topicSnapshot(body.profile,body.candidateIds,body.catalogVersion),...(body.profile.schemaVersion===2?{sourceVersions:parseTopicSourceVersions(TOPIC_SOURCE_VERSIONS)}:{})};
}
export function parsePendingTopic(raw:string|null,accountId:string):PendingTopicProposal|null{
  if(!raw||raw.length>30000)return null;
  try{rejectDuplicateMembers(raw);const r=record(JSON.parse(raw),['schemaVersion','accountId','body','snapshotKey','sourceVersions']);const b=record(r.body,['serviceId','serviceRevision','idempotencyKey','consent','catalogVersion','profile','candidateIds','goal','lookupId']);
    if(r.schemaVersion!==1||r.accountId!==accountId||!uuid(b.serviceId)||!uuid(b.idempotencyKey)||!Number.isInteger(b.serviceRevision)||Number(b.serviceRevision)<1||b.consent!==true||!string(b.catalogVersion,100)||!string(b.goal,800)||!string(r.snapshotKey,22000)||b.lookupId!==undefined&&!uuid(b.lookupId))return null;
    const profile=parseTopicProfile(b.profile),ids=strings(b.candidateIds,4,100),versions=profile.schemaVersion===2?parseTopicSourceVersions(r.sourceVersions):undefined;
    if(profile.schemaVersion!==2&&Object.hasOwn(r,'sourceVersions')||profile.schemaVersion===2&&profile.regionRef&&profile.regionRef.catalogVersion!==versions!.regionCatalog.catalogVersion||!ids.length||r.snapshotKey!==storedSnapshot(profile,ids,b.catalogVersion,versions))return null;
    // Validate a normalized view, but replay the exact original JSON values. Older
    // requests may already have been dispatched with surrounding whitespace.
    return{schemaVersion:1,accountId,body:b as TopicProposalInput,snapshotKey:r.snapshotKey,...(versions?{sourceVersions:versions}:{})};
  }catch{return null;}
}
export function parseTopicReceipt(value:unknown,request:TopicProposalInput,expectedVersions?:TopicSourceVersions):TopicProposalReceipt{
  const versioned=request.profile.schemaVersion===2;
  const r=record(value,['id','status','classification','serviceId','serviceRevision','catalogVersion','inputFingerprint','createdAt','finishedAt','proposal','sources','trainingExampleIds','errorCode','providerMode',...(versioned?['sourceVersions']:[])]);
  if(versioned){const actual=parseTopicSourceVersions(r.sourceVersions),expected=parseTopicSourceVersions(expectedVersions??TOPIC_SOURCE_VERSIONS);if(stableStringify(actual)!==stableStringify(expected)||request.profile.regionRef&&actual.regionCatalog.catalogVersion!==request.profile.regionRef.catalogVersion)throw Error('选题回执的来源版本与原请求不一致。');}
  if(r.id!==request.idempotencyKey||r.serviceId!==request.serviceId||r.serviceRevision!==request.serviceRevision||r.catalogVersion!==request.catalogVersion||r.classification!=='proposed'||!['running','ready','failed','outcome_unknown'].includes(String(r.status))||!string(r.inputFingerprint,64)||!/^[a-f0-9]{64}$/.test(r.inputFingerprint)||!string(r.createdAt,40)||!Number.isFinite(Date.parse(r.createdAt))||r.finishedAt!==null&&(!string(r.finishedAt,40)||!Number.isFinite(Date.parse(r.finishedAt)))||!['live','fixture'].includes(String(r.providerMode))||r.errorCode!==null&&!string(r.errorCode,64))throw Error('选题回执与本次请求不一致。');
  strings(r.trainingExampleIds,3,100);
  if(!Array.isArray(r.sources)||r.sources.length>100)throw Error('选题来源无效。');
  const sourceIds=new Set<string>();
  for(const raw of r.sources){const s=record(raw);if(!string(s.id,160)||!string(s.title,500)||sourceIds.has(s.id))throw Error('选题来源无效。');sourceIds.add(s.id);if(s.url!==undefined){if(!string(s.url,2048))throw Error('选题来源地址无效。');const u=new URL(s.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('选题来源地址无效。');}}
  if(r.proposal!==null){const p=record(r.proposal,['classification','items']);if(p.classification!=='proposed'||!Array.isArray(p.items)||p.items.length!==request.candidateIds.length)throw Error('选题提案不完整。');const seen=new Set();for(const raw of p.items){const i=record(raw,['patternId','title','researchQuestion','decisionOwner','decision','whyHere','firstWeekPlan','unknowns','sourceIds']);if(!request.candidateIds.includes(String(i.patternId))||seen.has(i.patternId))throw Error('选题候选不一致。');seen.add(i.patternId);for(const k of ['title','researchQuestion','decisionOwner','decision','whyHere'])if(!string(i[k],k==='title'?160:600)||!(i[k]as string).trim())throw Error('选题提案字段无效。');if(!strings(i.firstWeekPlan,5,300).length)throw Error('选题验证步骤为空。');strings(i.unknowns,8,300);if(!strings(i.sourceIds,20,160).length||strings(i.sourceIds,20,160).some(id=>!sourceIds.has(id)))throw Error('选题提案引用了未提供的来源。');}}
  if(r.status==='ready'&&r.proposal===null||r.status!=='ready'&&r.proposal!==null)throw Error('选题状态与内容不一致。');
  return r as unknown as TopicProposalReceipt;
}
export function knownTopicRejection(status:number,code:string){return status>=400&&status<500&&['invalid_input','topic_infeasible','duplicate_members','consent_required','catalog_conflict','revision_conflict','capability_unavailable','not_found','lookup_unavailable','call_rate_limit','call_active','sensitive_input','region_catalog_mismatch','unknown_region'].includes(code);}

export async function verifyTopicReceipt(receipt:TopicProposalReceipt,request:TopicProposalInput,expectedVersions?:TopicSourceVersions){
  const validated=parseTopicReceipt(receipt,request,expectedVersions);
  const material={profile:request.profile,candidateIds:request.candidateIds,goal:request.goal,catalogVersion:request.catalogVersion,lookupId:request.lookupId??null,...(request.profile.schemaVersion===2?{sourceVersions:parseTopicSourceVersions(validated.sourceVersions)}:{})};
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableStringify(material))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==receipt.inputFingerprint)throw Error('选题回执的材料指纹不一致。');
}
