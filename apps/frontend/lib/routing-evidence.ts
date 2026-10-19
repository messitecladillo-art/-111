/** Aggregate-only branch eligibility. This is client metadata, never proof of fieldwork. */
import type { RowEligibilityAssessment, QuestionEligibilityCounts } from './row-eligibility.ts';
export type RoutingPolicy = 'strict' | 'exclude';
export type RoutingChoice = { policy: RoutingPolicy; confirmed: boolean };
export type RoutingEvidence = {
  schema: 'row-eligibility/v1'; policy: RoutingPolicy;
  totalRows: number; eligibleRows: number; ineligibleRows: number; unknownRows: number; contradictionRows: number;
  questionCounts: QuestionEligibilityCounts[];
};
const COUNT_KEYS = ['eligibleAnswered','eligibleMissing','ineligibleBlank','ineligibleAnswered','unknownBlank','unknownAnswered'] as const;
function exact(x:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))throw Error('跳题汇总字段缺失或包含未知字段。');
  return x as Record<string,unknown>;
}
function count(x:unknown,max:number):number{if(!Number.isSafeInteger(x)||(x as number)<0||(x as number)>max)throw Error('跳题样本计数无效。');return x as number;}
export function parseRoutingEvidence(value:unknown,selectedIds:readonly string[],analysisTotal:number):RoutingEvidence{
  const x=exact(value,['schema','policy','totalRows','eligibleRows','ineligibleRows','unknownRows','contradictionRows','questionCounts']);
  if(x.schema!=='row-eligibility/v1'||typeof x.policy!=='string'||!['strict','exclude'].includes(x.policy))throw Error('跳题口径版本或策略无效。');
  const totalRows=count(x.totalRows,5000),eligibleRows=count(x.eligibleRows,totalRows),ineligibleRows=count(x.ineligibleRows,totalRows),unknownRows=count(x.unknownRows,totalRows),contradictionRows=count(x.contradictionRows,totalRows);
  if(!totalRows||eligibleRows+ineligibleRows+unknownRows!==totalRows||eligibleRows!==analysisTotal||contradictionRows>ineligibleRows)throw Error('跳题分区计数与计算样本范围不一致。');
  if(x.policy==='strict'&&(unknownRows||contradictionRows))throw Error('严格策略下不能存在未明资格或越界填答。');
  if(!Array.isArray(x.questionCounts)||!x.questionCounts.length||x.questionCounts.length>80)throw Error('跳题题目计数数量无效。');
  const questionCounts=x.questionCounts.map(value=>{
    const q=exact(value,['questionId',...COUNT_KEYS]);
    if(typeof q.questionId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(q.questionId))throw Error('跳题题目 ID 无效。');
    const counts=Object.fromEntries(COUNT_KEYS.map(k=>[k,count(q[k],totalRows)])) as Record<typeof COUNT_KEYS[number],number>;
    if(Object.values(counts).reduce((a,b)=>a+b,0)!==totalRows)throw Error('逐题六类计数之和必须等于原始记录数。');
    return {questionId:q.questionId,...counts};
  });
  if(new Set(questionCounts.map(q=>q.questionId)).size!==questionCounts.length)throw Error('跳题题目 ID 重复。');
  const selected=selectedIds.map(id=>questionCounts.find(q=>q.questionId===id));
  if(!selected.length||selected.some(q=>!q))throw Error('缺少所选题目的资格计数。');
  const qs=selected as QuestionEligibilityCounts[],unknown=qs.map(q=>q.unknownBlank+q.unknownAnswered),eligible=qs.map(q=>q.eligibleAnswered+q.eligibleMissing),ineligible=qs.map(q=>q.ineligibleBlank+q.ineligibleAnswered);
  const sum=(v:number[])=>v.reduce((a,b)=>a+b,0);
  if(unknownRows+ineligibleRows<Math.max(...unknown)||unknownRows>sum(unknown)||eligibleRows>Math.min(...eligible)||eligibleRows<Math.max(0,totalRows-sum(eligible.map(n=>totalRows-n)))||ineligibleRows<Math.max(...ineligible)||ineligibleRows>sum(ineligible))throw Error('逐题资格与共同分析范围不相容。');
  const contradictions=questionCounts.map(q=>q.ineligibleAnswered);
  if(contradictionRows<Math.max(...contradictions)||contradictionRows>sum(contradictions))throw Error('越界填答总行数与逐题计数不相容。');
  return {schema:'row-eligibility/v1',policy:x.policy as RoutingPolicy,totalRows,eligibleRows,ineligibleRows,unknownRows,contradictionRows,questionCounts};
}
export function routingEvidence(assessment:RowEligibilityAssessment,policy:RoutingPolicy,selectedIds:readonly string[]):RoutingEvidence{
  const {schema,totalRows,eligibleRows,ineligibleRows,unknownRows,contradictionRows,questionCounts}=assessment;
  return parseRoutingEvidence({schema,policy,totalRows,eligibleRows,ineligibleRows,unknownRows,contradictionRows,questionCounts},selectedIds,eligibleRows);
}
export function routingSummary(e:RoutingEvidence):string{
  return `原始 ${e.totalRows} 行 → 所选题目共同符合显示条件 ${e.eligibleRows} 行；不符合 ${e.ineligibleRows} 行、资格未明 ${e.unknownRows} 行。越界填答涉及 ${e.contradictionRows} 行（与前述排除计数重叠，不相加）。策略：${e.policy==='strict'?'发现资格未明或越界填答即暂停':'经确认仅纳入资格明确且符合条件的记录'}。仅描述该题项应答范围，不将跳过者补零或推断全体比例。`;
}
