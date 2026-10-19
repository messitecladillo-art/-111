/** Explicit stored design drafts only; never answers, implemented fieldwork, or workflow Gates. */
import {DESIGN_LIMITS,parseQuestionnaire,type Questionnaire} from './questionnaire.ts';

export const QUESTIONNAIRE_LIBRARY_LIMITS = {projects:40,versions:40,bytes:DESIGN_LIMITS.bytes} as const;
export type QuestionnaireProjectSummary = {id:string;title:string;revision:number;versionId:string;sha256:string;size:number;createdAt:string;updatedAt:string;versionCount:number};
export type QuestionnaireRepairOriginInput = {reviewId:string;questionId:string|null;code:string};
export type QuestionnaireRepairOrigin = QuestionnaireRepairOriginInput & {sourceVersionId:string;sourceRevision:number;sourceSha256:string;engine:string};
export type QuestionnaireVersionSummary = {id:string;projectId:string;revision:number;baseRevision:number;label:string;title:string;sha256:string;size:number;createdAt:string;repairOrigin?:QuestionnaireRepairOrigin|null};
export type QuestionnaireVersion = QuestionnaireVersionSummary & {content:Questionnaire};
export type QuestionnaireSaveReceipt = {project:QuestionnaireProjectSummary;version:QuestionnaireVersion;replayed:boolean};

/** Stable JSON makes key order irrelevant without changing strings, array order or draft semantics. */
function canonical(value:unknown):string {
  let count=0;
  function encode(v:unknown,depth:number):string {
    if(++count>20000||depth>16)throw new Error('问卷备份结构过大或嵌套过深。');
    if(v===null||typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='string'){if(v.length>DESIGN_LIMITS.bytes)throw new Error('问卷文本超出容量。');return JSON.stringify(v);}
    if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
    if(!v||typeof v!=='object'||Object.getOwnPropertySymbols(v).length)throw new Error('问卷必须为普通 JSON 数据。');
    if(Array.isArray(v)){
      if(v.length>2000||Object.keys(v).length!==v.length||Object.getOwnPropertyNames(v).length!==v.length+1)throw new Error('问卷数组格式无效。');
      return '['+Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))throw new Error('问卷不能包含访问器或空项。');return encode(d.value,depth+1);}).join(',')+']';
    }
    if(Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).length!==Object.getOwnPropertyNames(v).length)throw new Error('问卷必须为普通对象。');
    return '{'+Object.keys(v).sort().map(key=>{const d=Object.getOwnPropertyDescriptor(v,key)!;if(!Object.hasOwn(d,'value'))throw new Error('问卷不能包含访问器。');return JSON.stringify(key)+':'+encode(d.value,depth+1);}).join(',')+'}';
  }
  return encode(value,0);
}
export function parseQuestionnaireLibraryContent(value:unknown):{content:Questionnaire;serialized:string;size:number} {
  const content=parseQuestionnaire(canonical(value));
  const serialized=canonical(content),size=new TextEncoder().encode(serialized).length;
  if(size>QUESTIONNAIRE_LIBRARY_LIMITS.bytes)throw new Error('问卷内容超过 300 KB，未保存。');
  return {content,serialized,size};
}
export function parseQuestionnaireVersionLabel(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||value.length>80||/[\u0000-\u001f\u007f]/u.test(value))throw new Error('版本名称需为 1–80 字，不含控制字符。');
  return value;
}
export function parseQuestionnaireBaseRevision(value:unknown):number {
  if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>QUESTIONNAIRE_LIBRARY_LIMITS.versions)throw new Error('基础版本号无效，请重新读取问卷版本。');
  return value as number;
}
function originObject(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Object.getOwnPropertySymbols(value).length)throw new Error('修订来源必须为普通对象。');
  const ds=Object.getOwnPropertyDescriptors(value);
  if(Object.getOwnPropertyNames(value).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))throw new Error('修订来源字段无效。');
  return Object.fromEntries(keys.map(k=>[k,ds[k].value]));
}
function originIdentity(v:Record<string,unknown>):QuestionnaireRepairOriginInput{
  if(typeof v.reviewId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v.reviewId)||typeof v.code!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(v.code)||(v.questionId!==null&&(typeof v.questionId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v.questionId))))throw new Error('修订来源标识无效。');
  return {reviewId:v.reviewId,questionId:v.questionId as string|null,code:v.code};
}
/** Optional absence is normalized; supplied objects are exact, detached data, never trusted claims. */
export function parseQuestionnaireRepairOriginInput(value:unknown):QuestionnaireRepairOriginInput|null{
  if(value===undefined||value===null)return null;
  return originIdentity(originObject(value,['reviewId','questionId','code']));
}
export function parseQuestionnaireRepairOrigin(value:unknown):QuestionnaireRepairOrigin|null{
  if(value===undefined||value===null)return null;
  const v=originObject(value,['reviewId','questionId','code','sourceVersionId','sourceRevision','sourceSha256','engine']),input=originIdentity(v);
  if(typeof v.sourceVersionId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.sourceVersionId)||!Number.isSafeInteger(v.sourceRevision)||(v.sourceRevision as number)<1||(v.sourceRevision as number)>=QUESTIONNAIRE_LIBRARY_LIMITS.versions||typeof v.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sourceSha256)||typeof v.engine!=='string'||!/^[A-Za-z0-9_./-]{1,100}$/.test(v.engine))throw new Error('修订来源版本信息无效。');
  return {...input,sourceVersionId:v.sourceVersionId,sourceRevision:v.sourceRevision as number,sourceSha256:v.sourceSha256,engine:v.engine};
}
export function questionnaireRequestPayload(input:{kind:'create'|'append';projectId:string;versionId:string;baseRevision:number;label:string;content:Questionnaire;repairOrigin?:QuestionnaireRepairOriginInput|null}):string {
  // Omitting/null origin must preserve the exact pre-origin canonical request hash.
  const {repairOrigin,...legacy}=input,origin=parseQuestionnaireRepairOriginInput(repairOrigin);
  if(input.kind==='create'&&Object.hasOwn(input,'repairOrigin'))throw new Error('新建或复制问卷不能携带旧修订来源。');
  return canonical({schema:'questionnaire-library-request/v1',...legacy,...(origin?{repairOrigin:origin}:{})});
}
