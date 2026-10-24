import { profileSurvey, type SurveyTable, type ColumnSummary } from './survey-analysis.ts';
import { prepareLinkedAnalysis, type Mapping, type DatasetIdentity } from './questionnaire-mapping.ts';
import type { RoutingChoice, RoutingEvidence } from './routing-evidence.ts';

/** Keep a column's original position while calculating only its explicitly selected universe. */
export function profileColumn(table:SurveyTable,index:number,missing:string[]):ColumnSummary {
  const single={...table,headers:[table.headers[index]],rows:table.rows.map(row=>[row[index]])};
  return {...profileSurvey(single,missing).columns[0],index};
}
export type NumericColumnRecord={index:number;name:string;status:'computed'|'blocked';scope:'raw_encoding_check'|'question_response_universe';total:number|null;column:ColumnSummary|null;eligibility:RoutingEvidence|null;problems:string[]};
/** Raw-file missingness is exported separately. Never mix it with eligible-universe means. */
export function numericColumnRecords(table:SurveyTable,missing:string[],mapping:Mapping|null,dataset:DatasetIdentity,stale:boolean,routing:RoutingChoice):NumericColumnRecord[]{
  return table.headers.map((name,index)=>{
    const prepared=mapping?prepareLinkedAnalysis(mapping,dataset,stale,table,missing,{method:'numeric',columns:[index]},routing):{table,problems:[],eligibility:null};
    const column=prepared.problems.length?null:profileColumn(prepared.table,index,missing);
    const problems=column?.likelyIdentifier?['疑似标识列，不导出数值统计。']:prepared.problems;
    return {index,name,status:problems.length?'blocked':'computed',scope:mapping?'question_response_universe':'raw_encoding_check',total:problems.length?null:prepared.table.rows.length,column:problems.length?null:column,eligibility:problems.length?null:prepared.eligibility,problems};
  });
}
