import {canonical,hashValue,type DatasetIdentity,type Assignment} from './questionnaire-mapping.ts';
import type {Questionnaire} from './questionnaire.ts';
import type {SurveyTable} from './survey-analysis.ts';
import type {WjxExportManifest} from './questionnaire-platform-export.ts';
export type ImportColumn={id:string;label:string;questionNumber:string|null;variableName?:string;headerRef?:string|null};
export type ImportMetadata={schema:'survey-import-metadata/v1';parser:string;columns:ImportColumn[];selection:Record<string,unknown>};
export async function importedDatasetIdentity(sourceHash:string,table:SurveyTable,metadata:ImportMetadata):Promise<DatasetIdentity>{
  if(metadata.columns.length!==table.headers.length||metadata.columns.some((c,i)=>c.id!==table.headers[i]))throw Error('列字典与数据列不一致。');
  const captured=structuredClone(metadata);
  const identity={sourceHash,parser:captured.parser,encoding:'binary',delimiter:table.delimiter,headers:[...table.headers],rows:table.rows.length,importMetadata:captured};
  return {...identity,interpretationHash:await hashValue(identity)};
}
export function importColumnLabel(dataset:DatasetIdentity,id:string):string{
  return dataset.importMetadata?.columns.find(c=>c.id===id)?.label||id;
}
export type MappingSuggestion={questionId:string;columns:string[];basis:'manifest-number'|'variable'|'question-number'|'none';ambiguous:boolean};
/** Suggestions are explicit candidates, never confirmed bindings or inferred coding. */
export function platformMappingSuggestions(design:Questionnaire,dataset:DatasetIdentity,manifest:WjxExportManifest|null=null):MappingSuggestion[]{
  if(manifest&&canonical(manifest.source.questionnaire)!==canonical(design))throw Error('往返清单与当前问卷不一致，请核对版本。');
  const columns=dataset.importMetadata?.columns||dataset.headers.map(id=>({id,label:id,questionNumber:null,variableName:id}));
  const suggestions=design.questions.map((q,index)=>{
    const exact=columns.filter(c=>c.id===q.variable||c.variableName===q.variable||c.label===q.variable).map(c=>c.id);
    if(exact.length)return {questionId:q.id,columns:exact,basis:'variable' as const,ambiguous:exact.length!==1};
    const number=manifest?.questions.find(item=>item.questionId===q.id)?.platformNumber??index+1;
    const numbered=columns.filter(c=>c.questionNumber!==null&&Number(c.questionNumber)===number).map(c=>c.id);
    return {questionId:q.id,columns:numbered,basis:numbered.length?(manifest?'manifest-number' as const:'question-number' as const):'none' as const,ambiguous:numbered.length>1};
  });
  const used=new Map<string,number>();suggestions.forEach(s=>s.columns.forEach(c=>used.set(c,(used.get(c)||0)+1)));
  return suggestions.map(s=>({...s,ambiguous:s.ambiguous||s.columns.some(c=>(used.get(c)||0)>1)}));
}
export function unambiguousPlatformAssignments(design:Questionnaire,dataset:DatasetIdentity,manifest:WjxExportManifest|null=null):Assignment[]{
  return platformMappingSuggestions(design,dataset,manifest).filter(s=>!s.ambiguous&&s.columns.length===1&&design.questions.find(q=>q.id===s.questionId)?.type!=='multi').map(s=>({questionId:s.questionId,column:s.columns[0],representation:'code'}));
}

/** Keep canonical IDs while carrying original labels through every analysis branch. */
export function withImportLabels(table:SurveyTable,metadata:ImportMetadata):SurveyTable {
  if(metadata.columns.length!==table.headers.length||metadata.columns.some((c,i)=>c.id!==table.headers[i]))throw Error('列字典与数据列不一致。');
  return {...table,columnLabels:Object.fromEntries(metadata.columns.map(c=>[c.id,c.label]))};
}
