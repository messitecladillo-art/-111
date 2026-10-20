import {assessEligibility,type RowEligibilityAssessment} from './row-eligibility.ts';
import {confirmPlatformMapping,createPlatformMapping,platformMappingHash,platformMissingChecker,preparePlatformMapping,type PlatformMapping,type MappingContext,type PreparedPlatformMapping} from './platform-data-mapping.ts';
import type {Mapping} from './questionnaire-mapping.ts';
export type PlatformAnalysisPreview={prepared:PreparedPlatformMapping;assessment:RowEligibilityAssessment;fullMappingHash:string;sourceRowCount:number};
/** Reuse existing routing on explicitly recoded parents, then freeze the common response universe. */
export async function previewPlatformAnalysis(mapping:PlatformMapping,context:Omit<MappingContext,'rowIndices'>,policy:'strict'|'exclude'):Promise<PlatformAnalysisPreview>{
  const m=structuredClone(mapping),c=structuredClone(context);
  if(!['strict','exclude'].includes(policy))throw Error('应答范围策略无效。');
  const fullMappingHash=await platformMappingHash(m);
  if(m.confirmed!==fullMappingHash)throw Error('请先确认本版平台编码。');
  if(!m.assignments.length)throw Error('请选择本次解释的题目。');
  const parents=new Set<string>();
  for(const a of m.assignments){let q=m.design.questions.find(q=>q.id===a.questionId);const seen=new Set<string>();while(q?.condition){const id=q.condition.questionId;if(seen.has(id))throw Error('条件题存在循环。');seen.add(id);parents.add(id);q=m.design.questions.find(q=>q.id===id);if(!q)throw Error('条件父题不存在。');}}
  const parentAssignments=m.assignments.filter(a=>parents.has(a.questionId));
  if(parentAssignments.length!==parents.size||parentAssignments.some(a=>a.kind!=='column'))throw Error('请为所有条件父题配置单列编码。');
  const routingTable=structuredClone(c.table);
  if(parents.size){
    const sub=await confirmPlatformMapping(createPlatformMapping(m.design,m.dataset,parentAssignments));
    const parentData=await preparePlatformMapping(sub,{...c,rowIndices:c.table.rows.map((_,i)=>i)});
    if(parentData.problems.length)throw Error(parentData.problems.join(' '));
    for(const column of parentData.columns){const original=routingTable.headers.indexOf(column.sourceColumns[0]);routingTable.rows.forEach((row,i)=>row[original]=parentData.table.rows[i][column.index]);}
  }
  const isMissing=platformMissingChecker(c.table,c.metadata);
  const assignments=m.assignments.map(a=>{
    if(a.kind==='column'&&parents.has(a.questionId))return {questionId:a.questionId,column:a.column,representation:'code' as const};
    let marker='__platform_observed_'+a.questionId;while(routingTable.headers.includes(marker))marker+='_';
    const sourceColumns=a.kind==='column'?[a.column]:a.columns.map(b=>b.column);
    const indices=sourceColumns.map(column=>c.table.headers.indexOf(column));
    routingTable.headers.push(marker);routingTable.rows.forEach((row,i)=>row.push(indices.some((index,j)=>!isMissing(a,sourceColumns[j],c.table.rows[i][index]))?'observed':''));
    return {questionId:a.questionId,column:marker,representation:'code' as const};
  });
  const assessment=assessEligibility(m.design,assignments,routingTable,[],m.assignments.map(a=>a.questionId));
  if(assessment.problems.length)throw Error(assessment.problems.join(' '));
  if(policy==='strict'&&(assessment.unknownRows||assessment.contradictionRows))throw Error(`应答范围有 ${assessment.unknownRows} 行无法判断、${assessment.contradictionRows} 行分支外作答；请核对，或明确选择仅采用已确定符合条件的行。`);
  if(!assessment.eligibleIndices.length)throw Error('共同应答范围中没有可分析的记录。');
  const prepared=await preparePlatformMapping(m,{...c,rowIndices:assessment.eligibleIndices});
  if(prepared.problems.length)throw Error(prepared.problems.join(' '));
  return {prepared,assessment,fullMappingHash,sourceRowCount:c.table.rows.length};
}
export function bridgePlatformMapping(mapping:PlatformMapping,preview:PlatformAnalysisPreview):Mapping{
  if(!preview.prepared.mappingHash||preview.prepared.problems.length)throw Error('平台解释尚未通过检查。');
  if(preview.prepared.columns.some(c=>c.dateLike))throw Error('日期/时间列仅在平台解释中核对分类；送入通用分析前请取消选择该列。');
  return {design:structuredClone(mapping.design),sourceSignature:null,confirmed:null,assignments:preview.prepared.columns.filter(c=>c.question.type!=='multi'&&c.question.type!=='text').map(c=>({questionId:c.questionId,column:preview.prepared.table.headers[c.index],representation:'code'}))};
}
