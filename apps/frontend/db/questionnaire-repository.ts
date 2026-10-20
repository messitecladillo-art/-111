import {env} from 'cloudflare:workers';
import {ApiError} from '../app/api/_lib/http';
import {sha256Hex} from '../app/api/_lib/security';
import {QUESTIONNAIRE_LIBRARY_LIMITS,parseQuestionnaireLibraryContent,parseQuestionnaireRepairOriginInput,parseQuestionnaireRepairOrigin,questionnaireRequestPayload,type QuestionnaireProjectSummary,type QuestionnaireVersionSummary,type QuestionnaireVersion,type QuestionnaireSaveReceipt,type QuestionnaireRepairOriginInput,type QuestionnaireRepairOrigin} from '../lib/questionnaire-library';
import {verifyStoredQuestionnaireReview,type QuestionnaireReviewRow} from './questionnaire-review-integrity';
import type {QuestionnaireReviewRecord} from '../lib/questionnaire-review';
import type {Questionnaire} from '../lib/questionnaire';

type Row={id:string;project_id:string;owner_hash:string;revision:number;base_revision:number;operation:'create'|'append';label:string;title:string;content:string;content_sha256:string;request_sha256:string;size:number;created_at:string;project_created_at?:string;repair_review_id:string|null;repair_question_id:string|null;repair_code:string|null};
function database():D1Database {
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)throw new ApiError(503,'questionnaire_storage_unavailable','问卷库未连接；当前设计未保存，请保留页面或下载备份。');
  return db;
}
const fields='id,project_id,owner_hash,revision,base_revision,operation,label,title,content_sha256,request_sha256,size,created_at,repair_review_id,repair_question_id,repair_code';
function summary(row:Row):QuestionnaireVersionSummary{return {id:row.id,projectId:row.project_id,revision:row.revision,baseRevision:row.base_revision,label:row.label,title:row.title,sha256:row.content_sha256,size:row.size,createdAt:row.created_at,repairOrigin:null};}
function project(row:Row):QuestionnaireProjectSummary{return {id:row.project_id,title:row.title,revision:row.revision,versionId:row.id,sha256:row.content_sha256,size:row.size,createdAt:row.project_created_at??row.created_at,updatedAt:row.created_at,versionCount:row.revision};}
/** Source-only validation deliberately does not traverse the source's own repair history. */
async function rawVersion(row:Row):Promise<QuestionnaireVersion>{
  try{
    const parsed=parseQuestionnaireLibraryContent(JSON.parse(row.content));
    if(parsed.serialized!==row.content||parsed.size!==row.size||parsed.content.title!==row.title||await sha256Hex(row.content)!==row.content_sha256)throw new Error('source');
    const origin=storedOriginInput(row);
    const request=questionnaireRequestPayload({kind:row.operation,projectId:row.project_id,versionId:row.id,baseRevision:row.base_revision,label:row.label,content:parsed.content,...(origin?{repairOrigin:origin}:{})});
    if(await sha256Hex(request)!==row.request_sha256)throw new Error('request binding');
    return {...summary(row),content:parsed.content};
  }catch{throw new ApiError(409,'questionnaire_integrity','保存的问卷与版本指纹不一致，已停止读取，请保留现有设计。');}
}
async function resolveOrigin(input:QuestionnaireRepairOriginInput,projectId:string,owner:string,newRevision:number):Promise<QuestionnaireRepairOrigin>{
  const row=await database().prepare('SELECT * FROM questionnaire_design_reviews WHERE id=? AND owner_hash=? AND project_id=?').bind(input.reviewId,owner,projectId).first<QuestionnaireReviewRow>();
  if(!row)throw new ApiError(404,'questionnaire_repair_origin_not_found','修订来源不存在或不属于这份问卷；未保存新版本。');
  const source=await ownedToken(row.version_id,owner);
  if(!source||source.project_id!==projectId||source.revision>=newRevision)throw new ApiError(409,'questionnaire_repair_origin_invalid','修订来源版本关系无效，未保存新版本。');
  const record=await verifyStoredQuestionnaireReview(row,await rawVersion(source),owner);
  return originFromRecord(input,record,newRevision);
}
function originFromRecord(input:QuestionnaireRepairOriginInput,record:QuestionnaireReviewRecord,newRevision:number):QuestionnaireRepairOrigin{
  if(record.revision>=newRevision)throw new ApiError(409,'questionnaire_repair_origin_invalid','修订来源版本关系无效，未保存新版本。');
  if(!record.result.findings.some(f=>f.questionId===input.questionId&&f.code===input.code))throw new ApiError(409,'questionnaire_repair_finding_missing','选择的问题不属于原检查结果，未保存新版本。');
  return parseQuestionnaireRepairOrigin({...input,sourceVersionId:record.versionId,sourceRevision:record.revision,sourceSha256:record.sourceSha256,engine:record.engine})!;
}
function storedOriginInput(row:Row):QuestionnaireRepairOriginInput|null{
  if(row.repair_review_id==null&&row.repair_question_id==null&&row.repair_code==null)return null;
  try{return parseQuestionnaireRepairOriginInput({reviewId:row.repair_review_id,questionId:row.repair_question_id,code:row.repair_code});}
  catch{throw new ApiError(409,'questionnaire_repair_origin_invalid','保存的修订来源结构无效，已停止读取。');}
}
async function rowOrigin(row:Row):Promise<QuestionnaireRepairOrigin|null>{
  const input=storedOriginInput(row);if(!input)return null;
  return resolveOrigin(input!,row.project_id,row.owner_hash,row.revision);
}
async function version(row:Row):Promise<QuestionnaireVersion>{
  return {...await rawVersion(row),repairOrigin:await rowOrigin(row)};
}
async function ownedToken(id:string,owner:string):Promise<Row|null>{return database().prepare('SELECT * FROM questionnaire_versions WHERE id=? AND owner_hash=?').bind(id,owner).first<Row>();}
async function latest(id:string,owner:string):Promise<Row>{
  const row=await database().prepare(`SELECT v.*,(SELECT created_at FROM questionnaire_versions WHERE project_id=v.project_id AND owner_hash=v.owner_hash AND revision=1) AS project_created_at FROM questionnaire_versions v WHERE v.project_id=? AND v.owner_hash=? ORDER BY v.revision DESC LIMIT 1`).bind(id,owner).first<Row>();
  if(!row)throw new ApiError(404,'questionnaire_not_found','问卷不存在或无权访问。');
  return row;
}
export async function listQuestionnaireProjects(owner:string):Promise<QuestionnaireProjectSummary[]>{
  const rows=await database().prepare(`SELECT ${fields.split(',').map(k=>'v.'+k).join(',')},(SELECT created_at FROM questionnaire_versions WHERE project_id=v.project_id AND owner_hash=v.owner_hash AND revision=1) AS project_created_at FROM questionnaire_versions v WHERE v.owner_hash=? AND v.revision=(SELECT MAX(revision) FROM questionnaire_versions WHERE project_id=v.project_id) ORDER BY v.created_at DESC,v.project_id DESC LIMIT ?`).bind(owner,QUESTIONNAIRE_LIBRARY_LIMITS.projects).all<Row>();
  return rows.results.map(project);
}
export async function readQuestionnaireProject(id:string,owner:string){const row=await latest(id,owner);return {project:project(row),version:await version(row)};}
export async function listQuestionnaireVersions(id:string,owner:string):Promise<QuestionnaireVersionSummary[]>{
  await latest(id,owner);
  const rows=await database().prepare(`SELECT ${fields} FROM questionnaire_versions WHERE project_id=? AND owner_hash=? ORDER BY revision DESC LIMIT ?`).bind(id,owner,QUESTIONNAIRE_LIBRARY_LIMITS.versions).all<Row>();
  const origins=rows.results.map(storedOriginInput),reviewIds=[...new Set(origins.flatMap(origin=>origin?[origin.reviewId]:[]))];
  const reviewRows=new Map<string,QuestionnaireReviewRow>(),sourceRows=new Map<string,Row>();
  // At 40 versions, at most 39 reviews and 39 source versions: 2 + 10 + 10
  // SELECTs, below D1 Free's 50-query request budget. Sequential groups of four
  // also bound response size and connections; no per-row fan-out or recursion.
  for(let offset=0;offset<reviewIds.length;offset+=4){
    const ids=reviewIds.slice(offset,offset+4);
    const batch=await database().prepare(`SELECT * FROM questionnaire_design_reviews WHERE owner_hash=? AND project_id=? AND id IN (${ids.map(()=>'?').join(',')})`).bind(owner,id,...ids).all<QuestionnaireReviewRow>();
    for(const row of batch.results)reviewRows.set(row.id,row);
  }
  if(reviewRows.size!==reviewIds.length)throw new ApiError(404,'questionnaire_repair_origin_not_found','修订来源不存在或不属于这份问卷，已停止读取。');
  const sourceIds=[...new Set([...reviewRows.values()].map(row=>row.version_id))];
  for(let offset=0;offset<sourceIds.length;offset+=4){
    const ids=sourceIds.slice(offset,offset+4);
    const batch=await database().prepare(`SELECT * FROM questionnaire_versions WHERE owner_hash=? AND project_id=? AND id IN (${ids.map(()=>'?').join(',')})`).bind(owner,id,...ids).all<Row>();
    for(const row of batch.results)sourceRows.set(row.id,row);
  }
  if(sourceRows.size!==sourceIds.length)throw new ApiError(409,'questionnaire_repair_origin_invalid','修订来源版本关系无效，已停止读取。');
  const sourceCache=new Map<string,QuestionnaireVersion>(),recordCache=new Map<string,QuestionnaireReviewRecord>();
  for(const row of reviewRows.values()){
    const source=sourceRows.get(row.version_id)!;
    let checked=sourceCache.get(source.id);if(!checked){checked=await rawVersion(source);sourceCache.set(source.id,checked);}
    recordCache.set(row.id,await verifyStoredQuestionnaireReview(row,checked,owner));
  }
  return rows.results.map((row,index)=>({...summary(row),repairOrigin:origins[index]?originFromRecord(origins[index]!,recordCache.get(origins[index]!.reviewId)!,row.revision):null}));
}
export async function readQuestionnaireVersion(id:string,versionId:string,owner:string){
  const row=await ownedToken(versionId,owner);
  if(!row||row.project_id!==id)throw new ApiError(404,'questionnaire_version_not_found','问卷版本不存在或无权访问。');
  return {version:await version(row),currentRevision:(await latest(id,owner)).revision};
}

export async function saveQuestionnaireVersion(input:{kind:'create'|'append';projectId:string;versionId:string;baseRevision:number;label:string;content:Questionnaire;repairOrigin?:QuestionnaireRepairOriginInput|null},owner:string):Promise<QuestionnaireSaveReceipt>{
  if(input.kind==='create'&&Object.hasOwn(input,'repairOrigin'))throw new ApiError(400,'questionnaire_repair_origin_on_create','新建或复制问卷不能携带旧修订来源。');
  let originInput:QuestionnaireRepairOriginInput|null;
  try{originInput=parseQuestionnaireRepairOriginInput(input.repairOrigin);}catch{throw new ApiError(400,'invalid_questionnaire_repair_origin','修订来源格式无效。');}
  const parsed=parseQuestionnaireLibraryContent(input.content);
  // Freeze exactly the values hashed and inserted before the first asynchronous boundary.
  input={kind:input.kind,projectId:input.projectId,versionId:input.versionId,baseRevision:input.baseRevision,label:input.label,content:parsed.content,...(originInput?{repairOrigin:originInput}:{})};
  const requestHash=await sha256Hex(questionnaireRequestPayload(input)),contentHash=await sha256Hex(parsed.serialized);
  const retry=async(row:Row):Promise<QuestionnaireSaveReceipt>=>{
    if(row.project_id!==input.projectId||row.request_sha256!==requestHash)throw new ApiError(409,'questionnaire_request_reused','保存标识已用于另一份请求；旧版本未改变，请核对后生成新的保存请求。');
    return {project:project(await latest(input.projectId,owner)),version:await version(row),replayed:true};
  };
  const existing=await ownedToken(input.versionId,owner);if(existing)return retry(existing);
  if(input.kind==='append')await latest(input.projectId,owner);
  if(originInput)await resolveOrigin(originInput,input.projectId,owner,input.baseRevision+1);
  const time=new Date().toISOString(),db=database();
  // A logical project is its append-only version group, not a second mutable parent.
  // Each guarded INSERT is the complete SQLite/D1 transaction: no orphan parent or partial receipt.
  const values=[input.versionId,input.projectId,owner,input.baseRevision+1,input.baseRevision,input.kind,input.label,parsed.content.title,parsed.serialized,contentHash,requestHash,parsed.size,time,originInput?.reviewId??null,originInput?.questionId??null,originInput?.code??null];
  const condition=input.kind==='create'
    ? 'NOT EXISTS(SELECT 1 FROM questionnaire_versions WHERE project_id=?) AND (SELECT COUNT(DISTINCT project_id) FROM questionnaire_versions WHERE owner_hash=?)<?'
    : '(SELECT MAX(revision) FROM questionnaire_versions WHERE project_id=? AND owner_hash=?)=? AND ?<?';
  const guard=input.kind==='create'?[input.projectId,owner,QUESTIONNAIRE_LIBRARY_LIMITS.projects]:[input.projectId,owner,input.baseRevision,input.baseRevision,QUESTIONNAIRE_LIBRARY_LIMITS.versions];
  const saved=await db.prepare(`INSERT INTO questionnaire_versions(id,project_id,owner_hash,revision,base_revision,operation,label,title,content,content_sha256,request_sha256,size,created_at,repair_review_id,repair_question_id,repair_code) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${condition} ON CONFLICT DO NOTHING RETURNING *`).bind(...values,...guard).first<Row>();
  if(saved)return {project:project(await latest(input.projectId,owner)),version:await version(saved),replayed:false};
  const raced=await ownedToken(input.versionId,owner);if(raced)return retry(raced);
  if(input.kind==='append'){
    const current=await latest(input.projectId,owner);
    if(current.revision!==input.baseRevision)throw new ApiError(409,'questionnaire_conflict','问卷已产生新版本；未覆盖当前设计，请核对最新版或另存问卷。');
    if(current.revision>=QUESTIONNAIRE_LIBRARY_LIMITS.versions)throw new ApiError(409,'questionnaire_version_limit','每份问卷最多 40 个版本；旧版本不会删除，请备份或另存问卷。');
  }
  throw new ApiError(409,'questionnaire_capacity_or_id_conflict','问卷库已满（最多 40 份），或保存标识已被占用；已有问卷和版本均未改变。');
}
