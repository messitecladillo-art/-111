/** Client-side receipt integrity. Hash agreement is not source authenticity or human approval. */
import {parseQuestionnaireLibraryContent,parseQuestionnaireVersionLabel,parseQuestionnaireRepairOrigin,QUESTIONNAIRE_LIBRARY_LIMITS,type QuestionnaireVersion,type QuestionnaireProjectSummary,type QuestionnaireSaveReceipt,type QuestionnaireRepairOrigin} from './questionnaire-library.ts';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
function fail():never {throw new Error('问卷版本回执与内容或请求不一致，未接纳结果；请保留当前设计。');}
function object(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Object.getOwnPropertySymbols(value).length)fail();
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.getOwnPropertyNames(value).length!==keys.length||keys.some(k=>!descriptors[k]?.enumerable||!Object.hasOwn(descriptors[k],'value')))fail();
  return Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
}
export function isQuestionnaireTimestamp(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return false;
  const millis=Date.parse(value);return Number.isFinite(millis)&&new Date(millis).toISOString()===value;
}
function id(value:unknown):string {if(typeof value!=='string'||!uuid.test(value))fail();return value;}
function revision(value:unknown):number {if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>QUESTIONNAIRE_LIBRARY_LIMITS.versions)fail();return value as number;}
function fingerprint(value:unknown):string {if(typeof value!=='string'||!digest.test(value))fail();return value;}
function size(value:unknown):number {if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>QUESTIONNAIRE_LIBRARY_LIMITS.bytes)fail();return value as number;}
function title(value:unknown):string {if(typeof value!=='string'||value.length>160)fail();return value;}
function timestamp(value:unknown):string {if(!isQuestionnaireTimestamp(value))fail();return value;}
export async function questionnaireContentSha256(serialized:string):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}

/** Snapshot before awaiting; caller mutation cannot change the verified return value. */
export async function verifyQuestionnaireVersion(value:unknown,expected:{projectId:string;versionId:string}):Promise<QuestionnaireVersion>{
  const keys=['id','projectId','revision','baseRevision','label','title','sha256','size','createdAt','content'];
  if(value&&typeof value==='object'&&Object.hasOwn(value,'repairOrigin'))keys.push('repairOrigin');
  const v=object(value,keys),repairOrigin=parseQuestionnaireRepairOrigin(v.repairOrigin);
  const result:QuestionnaireVersion={id:id(v.id),projectId:id(v.projectId),revision:revision(v.revision),baseRevision:0,
    label:parseQuestionnaireVersionLabel(v.label),title:title(v.title),sha256:fingerprint(v.sha256),size:size(v.size),createdAt:timestamp(v.createdAt),content:parseQuestionnaireLibraryContent(v.content).content,repairOrigin};
  if(result.id!==expected.versionId||result.projectId!==expected.projectId||!Number.isSafeInteger(v.baseRevision)||v.baseRevision!==result.revision-1)fail();
  if(repairOrigin&&(repairOrigin.sourceRevision>=result.revision||repairOrigin.sourceVersionId===result.id))fail();
  result.baseRevision=v.baseRevision as number;
  const parsed=parseQuestionnaireLibraryContent(result.content);
  if(result.title!==parsed.content.title||result.size!==parsed.size||result.sha256!==await questionnaireContentSha256(parsed.serialized))fail();
  return result;
}
export function questionnaireCurrentRevision(value:unknown,versionRevision:number):number {
  const head=revision(value);if(head<versionRevision)fail();return head;
}
function project(value:unknown):QuestionnaireProjectSummary {
  const p=object(value,['id','title','revision','versionId','sha256','size','createdAt','updatedAt','versionCount']);
  const result:QuestionnaireProjectSummary={id:id(p.id),title:title(p.title),revision:revision(p.revision),versionId:id(p.versionId),sha256:fingerprint(p.sha256),size:size(p.size),createdAt:timestamp(p.createdAt),updatedAt:timestamp(p.updatedAt),versionCount:revision(p.versionCount)};
  if(result.versionCount!==result.revision)fail();
  return result;
}
/** A replay may return a historical saved version and a newer head; never rebind to that head. */
export async function verifyQuestionnaireSaveReceipt(value:unknown,expected:{projectId:string;versionId:string;baseRevision:number;label:string;contentKey:string;repairOrigin?:QuestionnaireRepairOrigin|null}):Promise<QuestionnaireSaveReceipt>{
  const request={projectId:expected.projectId,versionId:expected.versionId,baseRevision:expected.baseRevision,label:expected.label,contentKey:expected.contentKey,repairOrigin:parseQuestionnaireRepairOrigin(expected.repairOrigin)};
  const receipt=object(value,['project','version','replayed']);
  if(typeof receipt.replayed!=='boolean')fail();
  const head=project(receipt.project);
  const version=await verifyQuestionnaireVersion(receipt.version,request);
  if(JSON.stringify(version.repairOrigin)!==JSON.stringify(request.repairOrigin))fail();
  if(version.baseRevision!==request.baseRevision||version.label!==request.label||parseQuestionnaireLibraryContent(version.content).serialized!==request.contentKey||head.id!==version.projectId||head.revision<version.revision)fail();
  if(head.revision===version.revision&&(head.versionId!==version.id||head.sha256!==version.sha256||head.size!==version.size||head.title!==version.title||head.updatedAt!==version.createdAt))fail();
  if(head.revision>version.revision&&head.versionId===version.id)fail();
  return {project:head,version,replayed:receipt.replayed};
}
