/** Pure, versioned platform decoding and explicit mapping. No I/O or inferred coding. */
import {parseQuestionnaire, questionnaireIssues, rejectDuplicateMembers, type Questionnaire, type DesignQuestion} from './questionnaire.ts';
import {canonical, hashValue, type AnalysisRequest} from './questionnaire-mapping.ts';
import {finiteNumber, profileSurvey, SURVEY_LIMITS, type SurveyTable} from './survey-analysis.ts';
import type {ImportMetadata} from './survey-import-metadata.ts';

export const PLATFORM_MAPPING_VERSION = 'questionnaire-mapping/v2' as const;
const DATASET_VERSION = 'platform-dataset/v2' as const;
const MAX_SAV_JSON_BYTES = 12 * 1024 * 1024;
const MAX_MAPPING_BYTES = 500_000;
type Scalar = string | number;
export type SavColumn = {
  name:string; label:string|null; measurement:'nominal'|'ordinal'|'scale'|'unknown';
  originalFormat:string|null; storageType:string|null; alignment:string|null;
  valueLabels:{value:Scalar;label:string}[]; userMissingValues:Scalar[];
  userMissingRanges:{lo:number;hi:number}[];
  dateEncoding:null|{kind:'date-time'|'duration';unit:'seconds';epoch:string|null;timezone:null};
  systemMissingCount:number;
};
export type SavDecoded = {
  schema:'survey-import/sav-v1';format:'sav';parser:'pyreadstat/1.3.6';
  sourceSha256:string;bytes:number;rowCount:number;columnCount:number;fileEncoding:string|null;
  columns:SavColumn[];rows:(Scalar|null)[][];
  cleanup:{completed:true;reason:'temporary-upload'};
};
export type ImportOpinion = {code:'user-missing'|'system-missing'|'date-format'|'duplicate-label';column:string;message:string};
export type NormalizedSav = {table:SurveyTable;metadata:ImportMetadata;raw:SavDecoded;opinions:ImportOpinion[]};
export type PlatformDatasetIdentity = {
  schema:typeof DATASET_VERSION;sourceHash:string;interpretationHash:string;parser:string;headers:string[];rows:number;
};
type MissingPolicy = {missingCodes:string[];userMissing:'preserve'|'exclude'};
export type ColumnAssignment = MissingPolicy & {
  kind:'column';questionId:string;column:string;representation:'code'|'label';
  recodes:{from:string;to:string}[];unmapped:'reject'|'identity';
};
export type BinaryAssignment = MissingPolicy & {
  kind:'binary-split';questionId:string;
  columns:{column:string;optionCode:string;selectedValues:string[];unselectedValues:string[]}[];
  blankPolicy:'reject-partial'|'unselected-if-any-observed';
};
export type PlatformAssignment = ColumnAssignment | BinaryAssignment;
export type PlatformMapping = {
  schema:typeof PLATFORM_MAPPING_VERSION;design:Questionnaire;dataset:PlatformDatasetIdentity;
  assignments:PlatformAssignment[];confirmed:string|null;
};
export type MappingContext = {table:SurveyTable;metadata:ImportMetadata|null;sourceHash:string;design:Questionnaire;rowIndices:number[]};
export type MappedColumn = {index:number;questionId:string;variable:string;sourceColumns:string[];question:DesignQuestion;dateLike:boolean};
export type MultiResult = {
  questionId:string;eligible:number;respondents:number;unanswered:number;excludedMissing:number;selections:number;
  options:{code:string;label:string;count:number;respondentPercent:number|null;selectionPercent:number|null}[];
};
export type PreparedPlatformMapping = {
  schema:typeof PLATFORM_MAPPING_VERSION;table:SurveyTable;problems:string[];columns:MappedColumn[];
  sourceRows:number[];mappingHash:string|null;scopeHash:string|null;dataset:PlatformDatasetIdentity|null;multiResults:MultiResult[];
};

function exact(value:unknown, required:string[], optional:string[]=[]):Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.getPrototypeOf(value)!==Object.prototype) throw Error('字段必须为普通 JSON 对象。');
  const x=value as Record<string,unknown>, keys=Object.keys(x);
  if (required.some(k=>!Object.hasOwn(x,k)) || keys.some(k=>!required.includes(k)&&!optional.includes(k))) throw Error('存在未知或缺失字段。');
  return x;
}
function text(value:unknown,max:number=SURVEY_LIMITS.cellLength,nonempty=false):string {
  if (typeof value!=='string' || value.length>max || (nonempty&&!value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw Error('文字为空、过长或包含不支持的控制字符。');
  for(let i=0;i<value.length;i++){
    const c=value.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('文字包含未配对的 Unicode 代理字符。');}
    else if(c>=0xdc00&&c<=0xdfff)throw Error('文字包含未配对的 Unicode 代理字符。');
  }
  return value;
}
function nullableText(value:unknown):string|null{return value===null?null:text(value);}
function scalar(value:unknown):Scalar{
  if(typeof value==='string')return text(value);
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('数值不是有限值或超过 JavaScript 安全范围。');
  return value;
}
function integer(value:unknown,max:number,min=0):number{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw Error('计数或索引超出范围。');return value;
}
function digest(value:unknown):string{
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error('内容指纹无效。');return value;
}
function jsonTree(value:unknown,depth=0):void{
  if(depth>16)throw Error('JSON 嵌套过深。');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='string'){text(value);return;}
  if(typeof value==='number'){scalar(value);return;}
  if(Array.isArray(value)){value.forEach(v=>jsonTree(v,depth+1));return;}
  if(!value||typeof value!=='object')throw Error('JSON 值必须是有限数值、文字或普通对象。');
  const x=exact(value,[],Object.keys(value));
  Object.entries(x).forEach(([k,v])=>{text(k);jsonTree(v,depth+1);});
}
function strictJson(raw:string,maxBytes:number):unknown{
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>maxBytes)throw Error('JSON 超过处理上限。');
  let value:unknown;try{value=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{throw Error('JSON 无法解析。');}
  rejectDuplicateMembers(raw);
  // Inspect numeric tokens outside quoted strings: reject lexical unsafe integers
  // and underflow before JSON's rounding/zero can be treated as genuine data.
  const tokens=raw.matchAll(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
  for(const [token] of tokens){
    if(token.startsWith('"'))continue;
    const n=Number(token);
    if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER||(n===0&&/[1-9]/.test(token.split(/[eE]/)[0])))throw Error('JSON 数值超出可表示范围。');
    if(/^-?\d+$/.test(token)){
      const digits=token.replace(/^-/,'');
      if(digits.length>16||BigInt(digits)>BigInt(Number.MAX_SAFE_INTEGER))throw Error('JSON 整数超出安全范围。');
    }
  }
  jsonTree(value);return value;
}
function freeze<T>(value:T):T{
  if(value&&typeof value==='object'){Object.values(value).forEach(v=>freeze(v));Object.freeze(value);}return value;
}
function cloneJson<T>(value:T,max=MAX_SAV_JSON_BYTES):T{
  jsonTree(value);return strictJson(JSON.stringify(value),max) as T;
}
function savColumn(value:unknown):SavColumn{
  const x=exact(value,['name','label','measurement','originalFormat','storageType','alignment','valueLabels','userMissingValues','userMissingRanges','dateEncoding','systemMissingCount']);
  const name=text(x.name,2000,true),label=nullableText(x.label);
  if(typeof x.measurement!=='string'||!['nominal','ordinal','scale','unknown'].includes(x.measurement))throw Error('测量层级无效。');
  if(!Array.isArray(x.valueLabels)||!Array.isArray(x.userMissingValues)||!Array.isArray(x.userMissingRanges))throw Error('变量标签或缺失定义无效。');
  const valueLabels=x.valueLabels.map(v=>{const p=exact(v,['value','label']);return {value:scalar(p.value),label:text(p.label)};});
  if(new Set(valueLabels.map(v=>canonical(v.value))).size!==valueLabels.length)throw Error('同一原始编码的标签定义重复。');
  const userMissingValues=x.userMissingValues.map(scalar);
  const userMissingRanges=x.userMissingRanges.map(v=>{const p=exact(v,['lo','hi']),lo=scalar(p.lo),hi=scalar(p.hi);if(typeof lo!=='number'||typeof hi!=='number'||lo>=hi)throw Error('用户缺失范围无效。');return {lo,hi};});
  let dateEncoding:SavColumn['dateEncoding']=null;
  if(x.dateEncoding!==null){
    const d=exact(x.dateEncoding,['kind','unit','epoch','timezone']);
    if(typeof d.kind!=='string'||!['date-time','duration'].includes(d.kind)||d.unit!=='seconds'||d.timezone!==null||(d.kind==='date-time'?d.epoch!=='1582-10-14T00:00:00':d.epoch!==null))throw Error('日期编码元数据无效。');
    dateEncoding={kind:d.kind as 'date-time'|'duration',unit:'seconds',epoch:d.epoch as string|null,timezone:null};
  }
  return {name,label,measurement:x.measurement as SavColumn['measurement'],originalFormat:nullableText(x.originalFormat),storageType:nullableText(x.storageType),alignment:nullableText(x.alignment),valueLabels,userMissingValues,userMissingRanges,dateEncoding,systemMissingCount:integer(x.systemMissingCount,SURVEY_LIMITS.rows)};
}
function dateLike(column:SavColumn|undefined):boolean{
  return !!column&&(column.dateEncoding!==null||/^(?:DATE|ADATE|EDATE|JDATE|SDATE|DATETIME|YMDHMS|TIME|DTIME|MOYR|QYR|WKYR|MONTH|WKDAY)(?:\d|$)/i.test(column.originalFormat||''));
}
/** Decode only the exact bounded API receipt. Labels never replace raw codes. */
export function parseSavImport(rawJson:string):NormalizedSav{
  const x=exact(strictJson(rawJson,MAX_SAV_JSON_BYTES),['schema','format','parser','sourceSha256','bytes','rowCount','columnCount','fileEncoding','columns','rows','cleanup']);
  if(x.schema!=='survey-import/sav-v1'||x.format!=='sav'||x.parser!=='pyreadstat/1.3.6')throw Error('SAV 解析契约版本不支持。');
  const cleanup=exact(x.cleanup,['completed','reason']);
  if(cleanup.completed!==true||cleanup.reason!=='temporary-upload')throw Error('临时上传尚未确认清理。');
  const rowCount=integer(x.rowCount,SURVEY_LIMITS.rows,1),columnCount=integer(x.columnCount,SURVEY_LIMITS.columns,1);
  if(rowCount*columnCount>SURVEY_LIMITS.cells||!Array.isArray(x.columns)||x.columns.length!==columnCount||!Array.isArray(x.rows)||x.rows.length!==rowCount)throw Error('数据维度不一致或超过上限。');
  const columns=x.columns.map(savColumn);
  if(new Set(columns.map(c=>c.name)).size!==columns.length)throw Error('变量名称重复。');
  const rows=x.rows.map(row=>{if(!Array.isArray(row)||row.length!==columnCount)throw Error('数据行宽不一致。');return row.map(v=>v===null?null:scalar(v));});
  columns.forEach((c,i)=>{if(rows.filter(row=>row[i]===null).length!==c.systemMissingCount)throw Error('系统缺失计数与原始数据不一致。');});
  const raw:SavDecoded={schema:'survey-import/sav-v1',format:'sav',parser:'pyreadstat/1.3.6',sourceSha256:digest(x.sourceSha256),bytes:integer(x.bytes,SURVEY_LIMITS.bytes,1),rowCount,columnCount,fileEncoding:nullableText(x.fileEncoding),columns,rows,cleanup:{completed:true,reason:'temporary-upload'}};
  const table:SurveyTable={headers:columns.map(c=>c.name),rows:rows.map(row=>row.map(v=>v===null?'':String(v))),skippedBlankLines:0,delimiter:',',columnLabels:Object.fromEntries(columns.map(c=>[c.name,c.label||c.name]))};
  const metadata:ImportMetadata={schema:'survey-import-metadata/v1',parser:raw.parser,columns:columns.map(c=>({id:c.name,label:c.label||c.name,questionNumber:null,variableName:c.name})),selection:{format:'sav',sourceSha256:raw.sourceSha256,bytes:raw.bytes,fileEncoding:raw.fileEncoding,savColumns:columns}};
  const opinions:ImportOpinion[]=[];
  const labels=new Map<string,number>();columns.forEach(c=>{if(c.label)labels.set(c.label,(labels.get(c.label)||0)+1);});
  for(const c of columns){
    if(c.userMissingValues.length||c.userMissingRanges.length)opinions.push({code:'user-missing',column:c.name,message:'保留原始用户缺失编码；请明确选择保留或排除，不自动改成 0。'});
    if(c.systemMissingCount)opinions.push({code:'system-missing',column:c.name,message:'系统缺失在分析表中显示为空白，原始 JSON 的 null 保留。'});
    if(dateLike(c))opinions.push({code:'date-format',column:c.name,message:'保留原始日期/时间编码与显示格式；该变量不进入数值统计。'});
    if(c.label&&(labels.get(c.label)||0)>1)opinions.push({code:'duplicate-label',column:c.name,message:'显示标签相同，仍使用唯一变量名称区分列。'});
  }
  return freeze({table,metadata,raw,opinions});
}
function checkedTable(value:SurveyTable):SurveyTable{
  const x=exact(value,['headers','rows','skippedBlankLines','delimiter'],['columnLabels']);
  if(!Array.isArray(x.headers)||!Array.isArray(x.rows)||!x.headers.length||!x.rows.length)throw Error('至少需要一个变量和一条记录。');
  if(x.headers.length>SURVEY_LIMITS.columns||x.rows.length>SURVEY_LIMITS.rows||x.headers.length*x.rows.length>SURVEY_LIMITS.cells)throw Error('数据超过行、列或单元格上限。');
  const headers=x.headers.map(h=>text(h,2000,true));if(new Set(headers).size!==headers.length)throw Error('变量名称重复。');
  if(typeof x.delimiter!=='string'||![',',';','\t'].includes(x.delimiter))throw Error('分隔符无效。');
  const rows=x.rows.map(r=>{if(!Array.isArray(r)||r.length!==headers.length)throw Error('数据行宽不一致。');return r.map(v=>text(v));});
  const result:SurveyTable={headers,rows,delimiter:x.delimiter as SurveyTable['delimiter'],skippedBlankLines:integer(x.skippedBlankLines,SURVEY_LIMITS.rows)};
  if(Object.hasOwn(x,'columnLabels')){
    const labels=exact(x.columnLabels,[],headers);
    result.columnLabels=Object.fromEntries(Object.entries(labels).map(([id,label])=>[id,text(label,4001)]));
  }
  return result;
}
function checkedMetadata(value:ImportMetadata|null,table:SurveyTable):ImportMetadata|null{
  if(value===null)return null;
  const x=exact(cloneJson(value),['schema','parser','columns','selection']);
  if(x.schema!=='survey-import-metadata/v1'||!Array.isArray(x.columns)||x.columns.length!==table.headers.length)throw Error('列元数据版本或数量不一致。');
  text(x.parser,120,true);if(!x.selection||typeof x.selection!=='object'||Array.isArray(x.selection))throw Error('导入来源选择必须为普通对象。');exact(x.selection,[],Object.keys(x.selection));
  x.columns.forEach((value,i)=>{const c=exact(value,['id','label','questionNumber'],['variableName','headerRef','columnIndex','columnLetter']);if(text(c.id)!==table.headers[i])throw Error('列元数据与原表顺序不一致。');text(c.label);if(c.questionNumber!==null)text(c.questionNumber);if(c.variableName!==undefined)text(c.variableName);if(c.headerRef!==undefined&&c.headerRef!==null)text(c.headerRef);if(c.columnIndex!==undefined)integer(c.columnIndex,16383);if(c.columnLetter!==undefined&&(!/^[A-Z]{1,3}$/.test(text(c.columnLetter,3,true))))throw Error('Excel 列定位无效。');});
  if((x.selection as Record<string,unknown>).format==='sav'){
    const defs=(x.selection as Record<string,unknown>).savColumns;if(!Array.isArray(defs)||defs.length!==table.headers.length)throw Error('SAV 变量定义不完整。');
    defs.forEach((c,i)=>{if(savColumn(c).name!==table.headers[i])throw Error('SAV 变量定义顺序不一致。');});
  }
  return x as unknown as ImportMetadata;
}
function savDefinitions(metadata:ImportMetadata|null):SavColumn[]{
  if(metadata?.selection.format!=='sav')return [];
  return (metadata.selection.savColumns as unknown[]).map(savColumn);
}
export async function platformDatasetIdentity(table:SurveyTable,metadata:ImportMetadata|null,sourceHash:string):Promise<PlatformDatasetIdentity>{
  const snapshot=checkedTable(table),meta=checkedMetadata(metadata,snapshot),source=digest(sourceHash);
  return freeze({schema:DATASET_VERSION,sourceHash:source,interpretationHash:await hashValue({schema:DATASET_VERSION,sourceHash:source,table:snapshot,metadata:meta}),parser:meta?.parser||'survey-csv/v1',headers:snapshot.headers,rows:snapshot.rows.length});
}
function checkedIdentity(value:unknown):PlatformDatasetIdentity{
  const x=exact(value,['schema','sourceHash','interpretationHash','parser','headers','rows']);
  if(x.schema!==DATASET_VERSION||!Array.isArray(x.headers)||!x.headers.length||x.headers.length>SURVEY_LIMITS.columns)throw Error('数据身份版本无效。');
  const headers=x.headers.map(h=>text(h,2000,true));if(new Set(headers).size!==headers.length)throw Error('数据身份变量重复。');
  return {schema:DATASET_VERSION,sourceHash:digest(x.sourceHash),interpretationHash:digest(x.interpretationHash),parser:text(x.parser,120,true),headers,rows:integer(x.rows,SURVEY_LIMITS.rows,1)};
}
function tokens(value:unknown,max=30):string[]{
  if(!Array.isArray(value)||value.length>max)throw Error('取值列表超过上限。');
  const values=value.map(v=>text(v,2000,true));if(new Set(values).size!==values.length)throw Error('取值列表重复。');return values;
}
function assignment(value:unknown):PlatformAssignment{
  const head=exact(value,['kind','questionId','missingCodes','userMissing'],['column','representation','recodes','unmapped','columns','blankPolicy']);
  const questionId=text(head.questionId,64,true),missingCodes=tokens(head.missingCodes,20);
  if(!/^[A-Za-z0-9_-]+$/.test(questionId)||typeof head.userMissing!=='string'||!['preserve','exclude'].includes(head.userMissing))throw Error('题目 ID 或用户缺失策略无效。');
  const common={questionId,missingCodes,userMissing:head.userMissing as MissingPolicy['userMissing']};
  if(head.kind==='column'){
    const x=exact(value,['kind','questionId','missingCodes','userMissing','column','representation','recodes','unmapped']);
    if(typeof x.representation!=='string'||!['code','label'].includes(x.representation)||typeof x.unmapped!=='string'||!['reject','identity'].includes(x.unmapped)||!Array.isArray(x.recodes)||x.recodes.length>SURVEY_LIMITS.rows)throw Error('单列重编码配置无效。');
    const recodes=x.recodes.map(v=>{const r=exact(v,['from','to']);return {from:text(r.from,2000,true),to:text(r.to,2000,true)};});
    if(new Set(recodes.map(r=>r.from)).size!==recodes.length)throw Error('同一原始取值不能重复重编码。');
    return {...common,kind:'column',column:text(x.column,2000,true),representation:x.representation as ColumnAssignment['representation'],recodes,unmapped:x.unmapped as ColumnAssignment['unmapped']};
  }
  if(head.kind==='binary-split'){
    const x=exact(value,['kind','questionId','missingCodes','userMissing','columns','blankPolicy']);
    if(typeof x.blankPolicy!=='string'||!['reject-partial','unselected-if-any-observed'].includes(x.blankPolicy)||!Array.isArray(x.columns)||!x.columns.length||x.columns.length>30)throw Error('多选拆列配置无效。');
    const columns=x.columns.map(v=>{const c=exact(v,['column','optionCode','selectedValues','unselectedValues']),selectedValues=tokens(c.selectedValues),unselectedValues=tokens(c.unselectedValues);if(!selectedValues.length||!unselectedValues.length||selectedValues.some(v=>unselectedValues.includes(v)))throw Error('选中与未选取值必须非空且不相交。');return {column:text(c.column,2000,true),optionCode:text(c.optionCode,16,true),selectedValues,unselectedValues};});
    if(new Set(columns.map(c=>c.column)).size!==columns.length||new Set(columns.map(c=>c.optionCode)).size!==columns.length)throw Error('多选拆列或选项重复。');
    return {...common,kind:'binary-split',columns,blankPolicy:x.blankPolicy as BinaryAssignment['blankPolicy']};
  }
  throw Error('对应类型不支持。');
}
function checkedMapping(value:unknown):PlatformMapping{
  jsonTree(value);
  const x=exact(value,['schema','design','dataset','assignments','confirmed']);
  if(x.schema!==PLATFORM_MAPPING_VERSION||!Array.isArray(x.assignments)||x.assignments.length>80)throw Error('映射版本或题目数量无效。');
  const design=parseQuestionnaire(JSON.stringify(x.design)),dataset=checkedIdentity(x.dataset),assignments=x.assignments.map(assignment);
  if(new Set(assignments.map(a=>a.questionId)).size!==assignments.length)throw Error('题目对应重复。');
  const used=new Set<string>();
  for(const a of assignments){
    if(!design.questions.some(q=>q.id===a.questionId))throw Error('对应题目不存在。');
    for(const c of a.kind==='column'?[a.column]:a.columns.map(c=>c.column)){
      if(!dataset.headers.includes(c)||used.has(c))throw Error('对应列不存在或被重复使用。');used.add(c);
    }
  }
  const confirmed=x.confirmed===null?null:digest(x.confirmed);
  return {schema:PLATFORM_MAPPING_VERSION,design,dataset,assignments,confirmed};
}
export function createPlatformMapping(design:Questionnaire,dataset:PlatformDatasetIdentity,assignments:PlatformAssignment[]):PlatformMapping{
  return freeze(checkedMapping(cloneJson({schema:PLATFORM_MAPPING_VERSION,design,dataset,assignments,confirmed:null},MAX_MAPPING_BYTES)));
}
function unsigned(mapping:PlatformMapping):unknown{return {schema:mapping.schema,design:mapping.design,dataset:mapping.dataset,assignments:[...mapping.assignments].sort((a,b)=>a.questionId.localeCompare(b.questionId))};}
export async function platformMappingHash(mapping:PlatformMapping):Promise<string>{return hashValue(unsigned(checkedMapping(cloneJson(mapping,MAX_MAPPING_BYTES))));}
export async function confirmPlatformMapping(mapping:PlatformMapping):Promise<PlatformMapping>{
  const copy=checkedMapping(cloneJson(mapping,MAX_MAPPING_BYTES));return freeze({...copy,confirmed:await hashValue(unsigned(copy))});
}
export function platformMappingBackup(mapping:PlatformMapping):string{
  const copy=checkedMapping(cloneJson(mapping,MAX_MAPPING_BYTES));return JSON.stringify({...copy,confirmed:null},null,2);
}
/** Restoring configuration never restores an approval. */
export function parsePlatformMapping(raw:string):PlatformMapping{
  const copy=checkedMapping(strictJson(raw,MAX_MAPPING_BYTES));return freeze({...copy,confirmed:null});
}
function userMissing(cell:string,definition:SavColumn|undefined):boolean{
  if(!definition)return false;
  const numeric=/^(?:double|float|int\d*)$/i.test(definition.storageType||'')?Number(cell):null;
  return definition.userMissingValues.some(v=>typeof v==='number'?numeric!==null&&numeric===v:cell===v)||
    definition.userMissingRanges.some(r=>numeric!==null&&Number.isFinite(numeric)&&numeric>=r.lo&&numeric<=r.hi);
}
function missing(cell:string,a:PlatformAssignment,definition:SavColumn|undefined):boolean{
  return !cell.trim()||a.missingCodes.includes(cell)||a.userMissing==='exclude'&&userMissing(cell,definition);
}
function questionValue(q:DesignQuestion,value:string):boolean{
  if(q.type==='single')return q.choices.some(c=>c.code===value);
  if(q.type==='text')return true;
  if(q.type==='multi')return false;
  const n=finiteNumber(value);return n!==null&&(q.min===null||n>=q.min)&&(q.max===null||n<=q.max)&&(q.type!=='likert'||Number.isInteger(n));
}
function semanticConfiguration(mapping:PlatformMapping):string[]{
  const problems:string[]=[];
  const issues=questionnaireIssues(mapping.design);
  for(const a of mapping.assignments){
    const q=mapping.design.questions.find(q=>q.id===a.questionId)!;
    issues.filter(i=>i.questionId===q.id&&i.level==='blocker').forEach(i=>problems.push(q.variable+'：'+i.message));
    if(a.kind==='binary-split'){
      if(q.type!=='multi')problems.push(q.variable+' 只有多选题可以拆列。');
      if(q.choices.length!==a.columns.length||q.choices.some(c=>!a.columns.some(b=>b.optionCode===c.code)))problems.push(q.variable+' 必须为全部选项配置真实数据列；缺失列不能按 0 补齐。');
    }else{
      if(q.type==='multi')problems.push(q.variable+' 多选题必须显式配置拆列。');
      if(q.type!=='single'&&a.representation!=='code'&&q.type!=='text')problems.push(q.variable+' 数值或量表须使用数值编码。');
      if(q.type==='single'&&a.representation==='label'&&new Set(q.choices.map(c=>c.label)).size!==q.choices.length)problems.push(q.variable+' 选项标签重复，不能按标签反查编码。');
      if(a.recodes.some(r=>!questionValue(q,r.to)))problems.push(q.variable+' 重编码目标不符合原题选项或计分范围。');
    }
  }
  return [...new Set(problems)];
}
/** Eligibility is supplied by the existing caller; this module never guesses routes. */
export async function preparePlatformMapping(mapping:PlatformMapping,context:MappingContext):Promise<PreparedPlatformMapping>{
  const empty=(problems:string[],dataset:PlatformDatasetIdentity|null=null):PreparedPlatformMapping=>freeze({schema:PLATFORM_MAPPING_VERSION,table:{headers:[],rows:[],skippedBlankLines:0,delimiter:','},problems:[...new Set(problems)],columns:[],sourceRows:[],mappingHash:null,scopeHash:null,dataset,multiResults:[]});
  try{
    const copy=checkedMapping(cloneJson(mapping,MAX_MAPPING_BYTES)),table=checkedTable(context.table),metadata=checkedMetadata(context.metadata,table),design=parseQuestionnaire(JSON.stringify(cloneJson(context.design)));
    if(!Array.isArray(context.rowIndices)||context.rowIndices.some(i=>!Number.isSafeInteger(i)||i<0||i>=table.rows.length)||new Set(context.rowIndices).size!==context.rowIndices.length)throw Error('应答范围必须为不重复的有效行索引。');
    const sourceRows=[...context.rowIndices],sourceHash=digest(context.sourceHash);
    const dataset=await platformDatasetIdentity(table,metadata,sourceHash);
    if(canonical(copy.dataset)!==canonical(dataset)||canonical(copy.design)!==canonical(design))return empty(['数据、元数据或问卷版本已有变化，请重新预览并确认对应。'],dataset);
    const mappingHash=await hashValue(unsigned(copy));
    if(copy.confirmed!==mappingHash)return empty(['请先确认本版重编码、缺失策略和多选拆列。'],dataset);
    const problems=semanticConfiguration(copy);if(problems.length)return empty(problems,dataset);
    if(!sourceRows.length)return empty(['确认的共同应答范围没有记录。'],dataset);
    const definitions=savDefinitions(metadata),byName=new Map(definitions.map(c=>[c.name,c]));
    const labels:[string,string][]=[],headers:string[]=[],columns:MappedColumn[]=[],output:string[][]=sourceRows.map(()=>[]),multiResults:MultiResult[]=[];
    function sourceLabel(id:string):string{
      const label=table.columnLabels&&Object.hasOwn(table.columnLabels,id)?table.columnLabels[id]:metadata?.columns.find(c=>c.id===id)?.label||id;
      return text(label===id||label.startsWith(id+' · ')?label:id+' · '+label,4001);
    }
    for(const qid of copy.design.questions.map(q=>q.id)){
      const a=copy.assignments.find(a=>a.questionId===qid);if(!a)continue;
      const q=copy.design.questions.find(q=>q.id===a.questionId)!;
      if(a.kind==='column'){
        const source=table.headers.indexOf(a.column),definition=byName.get(a.column);
        const index=headers.length;headers.push(q.variable);labels.push([q.variable,sourceLabel(a.column)]);columns.push({index,questionId:q.id,variable:q.variable,sourceColumns:[a.column],question:q,dateLike:dateLike(definition)});
        const recodes=new Map(a.recodes.map(r=>[r.from,r.to]));
        sourceRows.forEach((rowIndex,r)=>{
          const raw=table.rows[rowIndex][source];
          if(missing(raw,a,definition)){output[r].push('');return;}
          const explicit=recodes.get(raw);
          let value=explicit;
          if(value===undefined&&a.unmapped==='identity'){
            value=a.representation==='label'&&q.type==='single'?q.choices.find(c=>c.label===raw)?.code:raw;
          }
          if(value===undefined||!questionValue(q,value)){problems.push(q.variable+' 第 '+(rowIndex+1)+' 行取值未被明确映射或不符合计分定义。');output[r].push('');return;}
          output[r].push(value);
        });
      }else{
        const bound=q.choices.map(choice=>({choice,b:a.columns.find(c=>c.optionCode===choice.code)!}));
        const starts=headers.length;
        bound.forEach(({choice,b})=>{const index=headers.length;headers.push(q.variable+'__'+choice.code);labels.push([q.variable+'__'+choice.code,sourceLabel(b.column)]);columns.push({index,questionId:q.id,variable:q.variable,sourceColumns:[b.column],question:q,dateLike:dateLike(byName.get(b.column))});});
        const counts=bound.map(()=>0);let respondents=0,unanswered=0,excludedMissing=0,selections=0;
        sourceRows.forEach((rowIndex,r)=>{
          const states=bound.map(({b})=>{
            const raw=table.rows[rowIndex][table.headers.indexOf(b.column)];
            if(!raw.trim())return null;
            if(a.missingCodes.includes(raw)||a.userMissing==='exclude'&&userMissing(raw,byName.get(b.column)))return -2;
            if(b.selectedValues.includes(raw))return 1;
            if(b.unselectedValues.includes(raw))return 0;
            return -1;
          });
          if(states.includes(-1)){problems.push(q.variable+' 第 '+(rowIndex+1)+' 行含未定义的拆列编码。');output[r].push(...bound.map(()=>''));return;}
          if(states.includes(-2)){excludedMissing++;output[r].push(...bound.map(()=>''));return;}
          if(states.every(v=>v===null)){unanswered++;output[r].push(...bound.map(()=>''));return;}
          if(states.some(v=>v===null)&&a.blankPolicy==='reject-partial'){problems.push(q.variable+' 第 '+(rowIndex+1)+' 行部分拆列为空，请明确空白策略。');output[r].push(...bound.map(()=>''));return;}
          respondents++;
          states.forEach((state,i)=>{const selected=state===1?1:0;counts[i]+=selected;selections+=selected;output[r].push(String(selected));});
        });
        multiResults.push({questionId:q.id,eligible:sourceRows.length,respondents,unanswered,excludedMissing,selections,options:bound.map(({choice},i)=>({code:choice.code,label:choice.label,count:counts[i],respondentPercent:respondents?counts[i]/respondents*100:null,selectionPercent:selections?counts[i]/selections*100:null}))});
        if(headers.length!==starts+bound.length)throw Error('多选输出维度不一致。');
      }
    }
    if(problems.length)return empty(problems,dataset);
    if(!headers.length||headers.length>SURVEY_LIMITS.columns||headers.length*sourceRows.length>SURVEY_LIMITS.cells||new Set(headers).size!==headers.length)return empty(['映射输出为空、变量重复或超过计算上限。'],dataset);
    const scopeHash=await hashValue({schema:'platform-analysis-scope/v1',mappingHash,sourceRows});
    return freeze({schema:PLATFORM_MAPPING_VERSION,table:{headers,rows:output,skippedBlankLines:0,delimiter:table.delimiter,columnLabels:Object.fromEntries(labels)},problems:[],columns,sourceRows,mappingHash,scopeHash,dataset,multiResults});
  }catch(error){return empty([error instanceof Error?error.message:'对应无法验证。']);}
}
export function platformMultiCounts(prepared:PreparedPlatformMapping,questionId:string):MultiResult{
  if(prepared.problems.length||!prepared.mappingHash)throw Error('对应尚未通过检查，不能计算多选频数。');
  const result=prepared.multiResults.find(r=>r.questionId===questionId);if(!result)throw Error('所选题目不是已配置的多选拆列。');
  return result;
}
/** Call this before invoking any existing deterministic numeric/statistical tool. */
export function platformNumericProblems(prepared:PreparedPlatformMapping,request:AnalysisRequest):string[]{
  if(prepared.problems.length)return [...prepared.problems];
  if(!request.columns.length||request.columns.some(i=>!Number.isSafeInteger(i)||i<0||i>=prepared.columns.length)||new Set(request.columns).size!==request.columns.length)return ['请选择不重复的有效变量。'];
  const selected=request.columns.map(i=>prepared.columns[i]),problems:string[]=[];
  const profile=profileSurvey(prepared.table);
  if(request.columns.some(i=>profile.columns[i]?.likelyIdentifier))problems.push('标识性字段不能用于统计，请保留原始字段并选择研究变量。');
  const numerical=['numeric','pearson','spearman','alpha'].includes(request.method)?selected:request.method==='groups'?selected.slice(1):[];
  if(numerical.some(c=>c.dateLike))problems.push('日期/时间变量保留原始编码，不能作为数值统计或量表题项。');
  if(selected.some(c=>c.question.type==='text'||c.question.type==='multi'))problems.push('文本与多选题需使用对应编码或多选频数工具。');
  if(['numeric','pearson'].includes(request.method)&&selected.some(c=>c.question.type!=='number'))problems.push('均值/标准差及 Pearson 只接受数值题。');
  if(request.method==='groups'&&selected[1]?.question.type!=='number')problems.push('分组汇总的结果变量须为数值题。');
  if(request.method==='spearman'&&selected.some(c=>!['number','likert'].includes(c.question.type)))problems.push('Spearman 只接受数值或有序量表。');
  if(request.method==='alpha'){
    const qs=selected.map(c=>c.question);
    if(qs.length<2||qs.some(q=>q.type!=='likert'))problems.push('α 至少需要两个量表单题。');
    if(qs.some(q=>!q.construct.trim()||q.construct.trim()!==request.construct?.trim()||q.min!==request.min||q.max!==request.max))problems.push('构念及计分范围须与问卷逐题定义一致。');
    if(qs.some((q,i)=>q.reverse!==(request.reverse||[]).includes(request.columns[i])))problems.push('反向计分须与问卷逐题定义一致。');
  }
  return [...new Set(problems)];
}

/** Share exactly the explicit missing policy with routing without recoding raw values. */
export function platformMissingChecker(table:SurveyTable,metadata:ImportMetadata|null):(assignment:PlatformAssignment,column:string,raw:string)=>boolean {
  const definitions=new Map(savDefinitions(checkedMetadata(metadata,checkedTable(table))).map(c=>[c.name,c]));
  return (a,column,raw)=>missing(raw,a,definitions.get(column));
}
