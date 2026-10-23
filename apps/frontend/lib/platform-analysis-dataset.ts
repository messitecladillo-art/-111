import {canonical,mappingCurrent,mappingSignature,type DatasetIdentity,type Mapping} from './questionnaire-mapping.ts';
import {importedDatasetIdentity,type ImportMetadata} from './survey-import-metadata.ts';
import {previewPlatformAnalysis,bridgePlatformMapping,type PlatformAnalysisPreview} from './platform-analysis-adapter.ts';
import type {MappingContext,PlatformMapping} from './platform-data-mapping.ts';
/** Recompute the approved preview against current raw input before producing a v1-compatible view. */
export async function platformAnalysisDataset(mapping:PlatformMapping,preview:PlatformAnalysisPreview,context:Omit<MappingContext,'rowIndices'>):Promise<{table:MappingContext['table'];identity:DatasetIdentity;mapping:Mapping;metadata:ImportMetadata;preview:PlatformAnalysisPreview}>{
 const m=structuredClone(mapping),p=structuredClone(preview),c=structuredClone(context);
 const verified=await previewPlatformAnalysis(m,c,'exclude');
 if(canonical(p)!==canonical(verified))throw Error('编码预览与当前数据不一致，请重新核验。');
 const bridge=bridgePlatformMapping(m,verified),table=verified.prepared.table;
 const metadata:ImportMetadata={schema:'survey-import-metadata/v1',parser:'platform-analysis/v2',columns:verified.prepared.columns.map(col=>({id:table.headers[col.index],label:table.columnLabels?.[table.headers[col.index]]||col.variable,questionNumber:null})),selection:{sourceInterpretationHash:verified.prepared.dataset!.interpretationHash,mappingHash:verified.fullMappingHash,scopeHash:verified.prepared.scopeHash,sourceRowCount:c.table.rows.length,selectedRowCount:table.rows.length}};
 const identity=await importedDatasetIdentity(c.sourceHash,table,metadata);
 bridge.confirmed=mappingSignature(bridge,identity);
 return {table,identity,mapping:bridge,metadata,preview:verified};
}

/** Derived split columns cannot fall back to untyped manual statistics after unlinking. */
export function platformAnalysisCurrent(value:{mapping:PlatformMapping;preview:PlatformAnalysisPreview},mapping:Mapping|null,identity:DatasetIdentity,stale:boolean):boolean{
 if(!mapping||!mappingCurrent(mapping,identity,stale))return false;
 try{return mappingSignature(mapping,identity)===mappingSignature(bridgePlatformMapping(value.mapping,value.preview),identity);}catch{return false;}
}
