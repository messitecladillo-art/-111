import { parseEditorContent } from '../editor-model.ts';
import { parseQuestionnaire } from '../questionnaire.ts';
import { canonical } from '../questionnaire-mapping.ts';
import { SURVEY_LIMITS } from '../survey-analysis.ts';
import type { DatasetValue } from '../canvas/execute.ts';
import type { FullReportBase, ProjectResearchMode } from './full-report-pipeline.ts';

export type FullReportRequest = {
  schemaVersion: 1; runId: string; projectId: string | null; inputRevision: string;
  serviceId: string; serviceRevision: number; consent: true; topic: string; mode: ProjectResearchMode;
  base?: FullReportBase; concurrency?: number; sectionNodes?: string[]; stream?: boolean;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validId=(value:unknown):value is string=>typeof value==='string'&&UUID.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const NODES = new Set(['intro.background','intro.significance','intro.literature','intro.roadmap','intro.innovation','design.purpose','design.population','design.content','design.methods','design.sampling','design.schedule','design.qc','data.pilot','data.cleaning','data.testing','sample.profile','sample.descriptive','compare.tests','drivers.model','diagnosis.evaluation','diagnosis.problems','plan.measures','conclusion.findings','conclusion.suggestions','conclusion.limits','abstract']);
const fail = (): never => { throw new Error('报告输入字段无效，请重新核对项目资料和模型服务。'); };
function record(value: unknown, keys: readonly string[], required = keys): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  const v = value as Record<string,unknown>;
  if (Object.keys(v).some(key=>!keys.includes(key)) || required.some(key=>!Object.hasOwn(v,key))) return fail();
  return v;
}
function text(value: unknown, limit: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > limit || (nonempty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return fail();
  return value;
}
function strings(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value) || value.length > max) return fail();
  return value.map(v=>text(v,length));
}
export function parseReportDataset(value: unknown): DatasetValue | null {
  if (value === null) return null;
  const v=record(value,['name','sourceHash','kind','table','missingCodes','lineage']);
  const name=text(v.name,240,true),sourceHash=text(v.sourceHash,64,true);
  if (!/^[a-f0-9]{64}$/.test(sourceHash) || !['simulated','user_provided'].includes(v.kind as string)) return fail();
  const t=record(v.table,['headers','rows','skippedBlankLines','delimiter','columnLabels'],['headers','rows','skippedBlankLines','delimiter']);
  const headers=strings(t.headers,SURVEY_LIMITS.columns,120);
  if (!headers.length || headers.some(h=>!h.trim()) || new Set(headers).size !== headers.length || !Array.isArray(t.rows) || !t.rows.length || t.rows.length > SURVEY_LIMITS.rows || t.rows.length*headers.length>SURVEY_LIMITS.cells) return fail();
  const rows=t.rows.map(row=>{const cells=strings(row,SURVEY_LIMITS.columns,SURVEY_LIMITS.cellLength);if(cells.length!==headers.length)return fail();return cells;});
  if (!Number.isSafeInteger(t.skippedBlankLines) || (t.skippedBlankLines as number)<0 || ![',','\t',';'].includes(t.delimiter as string)) return fail();
  let columnLabels: Record<string,string>|undefined;
  if(t.columnLabels!==undefined){const labels=record(t.columnLabels,headers,[]);columnLabels=Object.fromEntries(Object.entries(labels).map(([key,value])=>[key,text(value,500)]));}
  return {name,sourceHash,kind:v.kind as DatasetValue['kind'],table:{headers,rows,skippedBlankLines:t.skippedBlankLines as number,delimiter:t.delimiter as DatasetValue['table']['delimiter'],...(columnLabels?{columnLabels}:{})},missingCodes:strings(v.missingCodes,100,120),lineage:strings(v.lineage,100,2000)};
}
export function parseFullReportRequest(value: unknown): FullReportRequest {
  const required=['schemaVersion','runId','projectId','inputRevision','serviceId','serviceRevision','consent','topic','mode'];
  const v=record(value,[...required,'base','concurrency','sectionNodes','stream'],required);
  if(v.schemaVersion!==1 || v.consent!==true || !validId(v.runId) || !validId(v.serviceId) || (v.projectId!==null && !validId(v.projectId)) || !Number.isSafeInteger(v.serviceRevision) || (v.serviceRevision as number)<1 || (v.serviceRevision as number)>2147483647) return fail();
  if(typeof v.inputRevision!=='string'||!/^[a-f0-9]{64}$/.test(v.inputRevision)||!['plan','demonstration','empirical'].includes(v.mode as string))return fail();
  const topic=text(v.topic,160,true),mode=v.mode as ProjectResearchMode;
  if(v.stream!==undefined && typeof v.stream!=='boolean')return fail();
  if(v.concurrency!==undefined && (!Number.isSafeInteger(v.concurrency)||(v.concurrency as number)<1||(v.concurrency as number)>6))return fail();
  let sectionNodes:string[]|undefined;
  if(v.sectionNodes!==undefined){sectionNodes=strings(v.sectionNodes,26,60);if(!sectionNodes.length||new Set(sectionNodes).size!==sectionNodes.length||sectionNodes.some(n=>!NODES.has(n)))return fail();}
  let base:FullReportBase|undefined;
  if(v.base!==undefined){const b=record(v.base,['design','dataset','report']);base={design:parseQuestionnaire(JSON.stringify(b.design)),dataset:parseReportDataset(b.dataset),report:parseEditorContent(b.report)};}
  if(mode!=='demonstration'&&!base)return fail();
  if(mode==='empirical'&&!v.projectId)return fail();
  return {schemaVersion:1,runId:v.runId,projectId:v.projectId as string|null,inputRevision:v.inputRevision,serviceId:v.serviceId,serviceRevision:v.serviceRevision as number,consent:true,topic,mode,...(base?{base}:{}),concurrency:(v.concurrency as number|undefined)??3,...(sectionNodes?{sectionNodes}:{}),stream:v.stream===true};
}
/** Hash the JSON wire representation so absent optional properties agree on both sides. */
export async function fullReportInputRevision(input: Pick<FullReportRequest,'topic'|'mode'|'base'|'sectionNodes'>):Promise<string>{
  const value=JSON.parse(JSON.stringify({topic:input.topic,mode:input.mode,base:input.base,sectionNodes:input.sectionNodes}));
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
