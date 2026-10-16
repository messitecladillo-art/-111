import { parseQuestionnaire, questionnaireIssues, rejectDuplicateMembers, type Questionnaire, type DesignQuestion } from './questionnaire.ts';
import { finiteNumber, type SurveyTable } from './survey-analysis.ts';
import type { AnalysisMethod } from './analysis-recipes.ts';
import type { ResearchLink } from './research-link.ts';
import type {ImportMetadata} from './survey-import-metadata.ts';
import { assessEligibility, type RowEligibilityAssessment } from './row-eligibility.ts';
import { routingEvidence, type RoutingChoice, type RoutingEvidence } from './routing-evidence.ts';

export const MAPPING_VERSION = 'questionnaire-mapping/v1';
export const PARSER_VERSION = 'survey-csv/v1';
export type DatasetIdentity = { sourceHash: string; interpretationHash: string; parser: string; encoding: string; delimiter: string; headers: string[]; rows: number; importMetadata?:ImportMetadata };
export type Assignment = { questionId: string; column: string; representation: 'code' | 'label' };
export type Mapping = { design: Questionnaire; assignments: Assignment[]; confirmed: string | null; sourceSignature: string | null };
export type DesignSnapshot = { design: Questionnaire; pending: boolean };
export type DesignTransfer = { id: string; snapshot: DesignSnapshot };
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function hashValue(value: unknown): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function snapshotSignature(value: DesignSnapshot): string { return canonical(value); }
export async function datasetIdentity(sourceHash: string, encoding: string, table: SurveyTable): Promise<DatasetIdentity> {
  const identity = { sourceHash, parser:PARSER_VERSION as typeof PARSER_VERSION, encoding, delimiter:table.delimiter, headers:table.headers, rows:table.rows.length };
  return {...identity, interpretationHash:await hashValue(identity)};
}
export function mappingSignature(mapping: Pick<Mapping,'design'|'assignments'>, dataset: DatasetIdentity): string {
  return canonical({schema:MAPPING_VERSION, design:mapping.design, dataset, assignments:[...mapping.assignments].sort((a,b)=>a.questionId.localeCompare(b.questionId))});
}
export function mappingCurrent(mapping: Mapping, dataset: DatasetIdentity, stale: boolean): boolean {
  return !stale && mapping.confirmed !== null && mapping.confirmed === mappingSignature(mapping,dataset);
}
export function suggestAssignments(design: Questionnaire, dataset: DatasetIdentity): Assignment[] {
  return design.questions.filter(q=>dataset.headers.includes(q.variable)).map(q=>({questionId:q.id,column:q.variable,representation:'code'}));
}
export function assignmentProblems(mapping: Pick<Mapping,'design'|'assignments'>, dataset: DatasetIdentity): string[] {
  const errors:string[]=[];
  const ids=new Set<string>(),columns=new Set<string>();
  for(const a of mapping.assignments){
    if(!mapping.design.questions.some(q=>q.id===a.questionId))errors.push('存在已删除或未知题目。');
    if(!dataset.headers.includes(a.column))errors.push(`数据中不存在列 ${a.column}。`);
    if(ids.has(a.questionId)||columns.has(a.column))errors.push('一道题只能对应一列，同一列不能重复对应。');
    if(!['code','label'].includes(a.representation))errors.push('取值格式无效。');
    ids.add(a.questionId);columns.add(a.column);
  }
  return [...new Set(errors)];
}
function invalidValues(q: DesignQuestion, a: Assignment, table: SurveyTable, missing: string[]): number {
  const index=table.headers.indexOf(a.column),codes=new Set(missing);
  return table.rows.reduce((n,row)=>{
    const raw=row[index].trim();if(!raw||codes.has(raw))return n;
    if(q.type==='single')return n+Number(!q.choices.some(c=>(a.representation==='code'?c.code:c.label.trim())===raw));
    const v=finiteNumber(raw);
    return n+Number(v===null||(q.min!==null&&v<q.min)||(q.max!==null&&v>q.max)||(q.type==='likert'&&!Number.isInteger(v)));
  },0);
}
export type AnalysisRequest = { method:AnalysisMethod|'alpha'; columns:number[]; min?:number; max?:number; reverse?:number[]; construct?:string };
/** Check response values only after a separately confirmed eligibility assessment. */
function semanticProblems(mapping: Mapping, dataset: DatasetIdentity, stale: boolean, table: SurveyTable, missing: string[], request: AnalysisRequest): string[] {
  if(!mappingCurrent(mapping,dataset,stale))return [stale?'源问卷已有更改或暂存输入。请从设计页重新发送并确认对应。':'请先确认本版问卷与数据列的对应。'];
  const problems=assignmentProblems(mapping,dataset);
  const selected:DesignQuestion[]=[];
  const issues=questionnaireIssues(mapping.design);
  for(const index of request.columns){
    const a=mapping.assignments.find(x=>x.column===table.headers[index]);
    const q=a&&mapping.design.questions.find(x=>x.id===a.questionId);
    if(!q||!a){problems.push(`${table.headers[index]||'所选变量'} 尚未对应题目。`);continue;}
    selected.push(q);
    issues.filter(i=>i.level==='blocker'&&i.questionId===q.id).forEach(i=>problems.push(`${q.variable}：${i.message}`));
    if(q.type==='text'||q.type==='multi'){problems.push(`${q.variable} 需先完成${q.type==='multi'?'多选拆列及分母定义':'文本编码'}，本版暂不支持。`);continue;}
    const invalid=invalidValues(q,a,table,missing);if(invalid)problems.push(`${q.variable} 有 ${invalid} 个非缺失值不符合题目选项、数值范围或整数计分要求；未自动剔除。`);
    if(q.type!=='single'&&a.representation!=='code')problems.push(`${q.variable} 的数值/量表题应使用数值编码。`);
  }
  if(!request.columns.length)problems.push('请先选择变量。');
  if(['numeric','pearson'].includes(request.method)&&selected.some(q=>q.type!=='number'))problems.push('均值/标准差及 Pearson 在关联模式仅用于数值题，不把名义编码或量表单题自动视为连续量。');
  if(request.method==='groups'&&selected[1]?.type!=='number')problems.push('分组汇总的结果变量须为数值题。');
  if(request.method==='spearman'&&selected.some(q=>q.type!=='number'&&q.type!=='likert'))problems.push('Spearman 只接受数值题或有序量表单题，不接受名义单选编码。');
  if(request.method==='alpha'){
    if(selected.length<2||selected.some(q=>q.type!=='likert'))problems.push('α 至少需要两个量表单题；人口学或其他单选编码不构成量表。');
    if(selected.some(q=>!q.construct.trim()||q.construct.trim()!==request.construct?.trim()))problems.push('题项构念与填写的构念不一致或尚未定义。');
    if(selected.some(q=>q.min!==request.min||q.max!==request.max))problems.push('计分范围必须与各题的问卷定义一致。');
    if(selected.some((q,i)=>q.reverse!==(request.reverse||[]).includes(request.columns[i])))problems.push('反向计分必须与问卷逐题定义一致。');
  }
  return [...new Set(problems)];
}
export type PreparedAnalysis = {table:SurveyTable;problems:string[];eligibility:RoutingEvidence|null;assessment:RowEligibilityAssessment|null};
/** The returned row subset is local only. Callers MUST stop on problems, never calculate a fallback. */
export function prepareLinkedAnalysis(mapping:Mapping,dataset:DatasetIdentity,stale:boolean,table:SurveyTable,missing:string[],request:AnalysisRequest,routing?:RoutingChoice):PreparedAnalysis {
  const blocked=(problems:string[],assessment:RowEligibilityAssessment|null=null):PreparedAnalysis=>({table:{...table,rows:[]},problems:[...new Set(problems)],eligibility:null,assessment});
  if(!mappingCurrent(mapping,dataset,stale))return blocked([stale?'源问卷已有更改或暂存输入。请从设计页重新发送并确认对应。':'请先确认本版问卷与数据列的对应。']);
  const assignmentErrors=assignmentProblems(mapping,dataset);if(assignmentErrors.length)return blocked(assignmentErrors);
  if(!request.columns.length||request.columns.some(i=>!Number.isInteger(i)||i<0||i>=table.headers.length)||new Set(request.columns).size!==request.columns.length)return blocked(['请选择不重复的有效变量。']);
  const selectedIds=request.columns.map(i=>mapping.assignments.find(a=>a.column===table.headers[i])?.questionId);
  if(selectedIds.some(id=>!id))return blocked(['所选变量尚未对应题目。']);
  const assessment=assessEligibility(mapping.design,mapping.assignments,table,missing,selectedIds as string[]);
  if(assessment.problems.length)return blocked(assessment.problems,assessment);
  let eligibleTable=table,eligibility:RoutingEvidence|null=null;
  if(assessment.hasConditions){
    if(routing?.confirmed!==true)return blocked(['所选变量含条件题；请先在“跳题与应答范围”确认本版处理策略。'],assessment);
    if(!['strict','exclude'].includes(routing.policy))return blocked(['跳题处理策略无效。'],assessment);
    if(routing.policy==='strict'&&(assessment.unknownRows||assessment.contradictionRows))return blocked([`严格策略暂停：所选题目共同范围有 ${assessment.unknownRows} 行资格未明、${assessment.contradictionRows} 行越界填答。请核对原数据，或明确确认“仅分析资格明确者”。`],assessment);
    if(!assessment.eligibleRows)return blocked(['所选题目没有共同符合显示条件的记录，不能计算。'],assessment);
    eligibleTable={...table,rows:assessment.eligibleIndices.map(i=>table.rows[i])};
    try{eligibility=routingEvidence(assessment,routing.policy,selectedIds as string[]);}catch(e){return blocked([(e as Error).message],assessment);}
  }
  const problems=semanticProblems(mapping,dataset,stale,eligibleTable,missing,request);
  return problems.length?blocked(problems,assessment):{table:eligibleTable,problems:[],eligibility,assessment};
}
export function analysisProblems(mapping:Mapping,dataset:DatasetIdentity,stale:boolean,table:SurveyTable,missing:string[],request:AnalysisRequest,routing?:RoutingChoice):string[]{
  return prepareLinkedAnalysis(mapping,dataset,stale,table,missing,request,routing).problems;
}
export function scaleSuggestions(mapping:Mapping,dataset:DatasetIdentity){
  const groups=new Map<string,DesignQuestion[]>();
  const invalid=new Set(questionnaireIssues(mapping.design).filter(i=>i.level==='blocker').map(i=>i.questionId));
  mapping.design.questions.filter(q=>q.type==='likert'&&q.construct.trim()&&!invalid.has(q.id)&&mapping.assignments.some(a=>a.questionId===q.id&&a.representation==='code'&&dataset.headers.includes(a.column))).forEach(q=>{const name=q.construct.trim();groups.set(name,[...(groups.get(name)||[]),q]);});
  return [...groups].filter(([,qs])=>qs.length>=2&&qs.every(q=>q.min===qs[0].min&&q.max===qs[0].max)).map(([construct,qs])=>({construct,omitted:mapping.design.questions.filter(q=>q.type==='likert'&&q.construct.trim()===construct&&!qs.some(item=>item.id===q.id)).map(q=>q.variable),min:qs[0].min!,max:qs[0].max!,columns:qs.map(q=>dataset.headers.indexOf(mapping.assignments.find(a=>a.questionId===q.id)!.column)),reverse:qs.filter(q=>q.reverse).map(q=>dataset.headers.indexOf(mapping.assignments.find(a=>a.questionId===q.id)!.column))}));
}
export async function researchLink(mapping:Mapping,dataset:DatasetIdentity,stale:boolean):Promise<ResearchLink> {
  if(!mappingCurrent(mapping,dataset,stale)||assignmentProblems(mapping,dataset).length)throw Error('对应尚未确认。');
  const bindings=await Promise.all(mapping.assignments.map(async a=>{
    const q=mapping.design.questions.find(q=>q.id===a.questionId)!;
    return {questionId:q.id,variable:q.variable,questionHash:await hashValue(q),column:dataset.headers.indexOf(a.column),type:q.type,representation:a.representation,construct:q.construct.trim(),min:q.min,max:q.max,reverse:q.reverse,conditional:!!q.condition};
  }));
  return {schema:MAPPING_VERSION,questionnaireHash:await hashValue(mapping.design),interpretationHash:dataset.interpretationHash,mappingHash:await hashValue(mappingSignature(mapping,dataset)),bindings};
}
function exactObject(value:unknown,keys:string[],label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error(`${label} 存在未知或缺失字段。`);
  return value as Record<string,unknown>;
}
export function mappingBackup(mapping:Mapping,dataset:DatasetIdentity):string {
  const raw=JSON.stringify({schema:MAPPING_VERSION,design:mapping.design,dataset,assignments:mapping.assignments},null,2);
  if(new TextEncoder().encode(raw).length>500_000)throw Error('映射备份超过 500 KB。');
  return raw;
}
/** No raw rows, no restored approvals. Exact parsing identity is mandatory. */
export function restoreMapping(raw:string,dataset:DatasetIdentity):Mapping {
  if(new TextEncoder().encode(raw).length>500_000)throw Error('映射备份超过 500 KB。');
  let value:unknown;try{value=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{throw Error('映射 JSON 无法解析。');}rejectDuplicateMembers(raw);
  const x=exactObject(value,['schema','design','dataset','assignments'],'映射备份');
  if(x.schema!==MAPPING_VERSION)throw Error('映射备份版本不支持。');
  exactObject(x.dataset,['sourceHash','interpretationHash','parser','encoding','delimiter','headers','rows',...(dataset.importMetadata?['importMetadata']:[])],'数据身份');
  if(canonical(x.dataset)!==canonical(dataset))throw Error('数据文件或解析设置不一致；请先选择原数据及原编码/分隔符。现有对应未被替换。');
  const design=parseQuestionnaire(JSON.stringify(x.design));
  if(!Array.isArray(x.assignments)||x.assignments.length>80)throw Error('映射数量无效。');
  const assignments=x.assignments.map(v=>{const a=exactObject(v,['questionId','column','representation'],'题目对应');if(typeof a.questionId!=='string'||typeof a.column!=='string'||!['code','label'].includes(String(a.representation)))throw Error('题目对应字段无效。');return a as Assignment;});
  const mapping={design,assignments,confirmed:null,sourceSignature:null};
  const problems=assignmentProblems(mapping,dataset);if(problems.length)throw Error(problems.join(' '));
  return mapping;
}
