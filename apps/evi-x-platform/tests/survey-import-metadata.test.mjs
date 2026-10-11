import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {exportWjxBundle} from '../lib/questionnaire-platform-export.ts';
import {importedDatasetIdentity,withImportLabels,platformMappingSuggestions,unambiguousPlatformAssignments} from '../lib/survey-import-metadata.ts';
import {profileSurvey} from '../lib/survey-analysis.ts';
import {profileColumn,numericColumnRecords} from '../lib/analysis-summary.ts';
import {runRecipe} from '../lib/analysis-recipes.ts';
import {createPlanNode,runPlanNode} from '../lib/analysis-plan.ts';
import {mappingBackup,restoreMapping,mappingSignature,hashValue} from '../lib/questionnaire-mapping.ts';
const hash='a'.repeat(64);
function fixture(){
  const table={headers:['sheet-0:col-A','sheet-0:col-B','sheet-0:col-C'],rows:[['20260001','张甲','2'],['20260002','李乙','4']],delimiter:',',skippedBlankLines:0};
  const metadata={schema:'survey-import-metadata/v1',parser:'xlsx-local/v3',columns:table.headers.map((id,i)=>({id,label:['学号','姓名','满意度'][i],questionNumber:String(i+1),headerRef:String.fromCharCode(65+i)+'1'})),selection:{sheetId:'sheet-0',headerRow:1,range:'A1:C3'}};
  return {table,metadata};
}
test('original labels preserve identifier protection throughout profiles, branches and calculations',async()=>{
  const {table,metadata}=fixture(),labelled=withImportLabels(table,metadata),profile=profileSurvey(labelled);
  assert.deepEqual(profile.columns.map(c=>c.name),table.headers);
  assert.deepEqual(profile.columns.map(c=>c.likelyIdentifier),[true,true,false]);
  assert.equal(profile.columns[0].stats,null);
  assert.equal(profileColumn({...labelled,rows:[labelled.rows[1]]},0,[]).stats,null);
  assert.throws(()=>runRecipe(labelled,{method:'numeric',x:0,y:null},[]),/标识列/);
  const alpha={...createPlanNode('alpha','alpha1'),scale:{columns:[0,2],reverse:[],min:1,max:5,construct:'测试'}};
  assert.throws(()=>runPlanNode(labelled,alpha,[]),/标识列/);
  const identity=await importedDatasetIdentity(hash,table,metadata);
  const exported=numericColumnRecords(labelled,[],null,identity,false,{policy:'strict',confirmed:false});
  assert.equal(exported[0].status,'blocked');assert.equal(exported[0].column,null);
  assert.equal(exported[2].column.stats.mean,3);
  assert.equal(table.columnLabels,undefined);assert.deepEqual(table.rows,[['20260001','张甲','2'],['20260002','李乙','4']]);
});
test('identity captures label and header interpretation before asynchronous hashing',async()=>{
  const {table,metadata}=fixture(),captured=structuredClone(metadata),headers=[...table.headers];
  const pending=importedDatasetIdentity(hash,table,metadata);
  metadata.columns[0].label='改名';metadata.selection.range='C1:C3';table.headers[0]='changed';
  const identity=await pending;
  assert.deepEqual(identity.importMetadata,captured);assert.deepEqual(identity.headers,headers);
  const {interpretationHash,...body}=identity;assert.equal(interpretationHash,await hashValue(body));
  const next=fixture();next.metadata.columns[0].label='编号';assert.notEqual((await importedDatasetIdentity(hash,next.table,next.metadata)).interpretationHash,interpretationHash);
});
test('column dictionary position and duplicate candidate ownership are explicit',async()=>{
  const {table,metadata}=fixture();metadata.columns[0].id='wrong';await assert.rejects(importedDatasetIdentity(hash,table,metadata),/列字典/);assert.throws(()=>withImportLabels(table,metadata),/列字典/);
  const f=fixture(),design=newQuestionnaire();design.questions=[{...newQuestion('one','Q1'),text:'甲'},{...newQuestion('two','Q2'),text:'乙'}];
  f.metadata.columns[0].questionNumber='1';f.metadata.columns[1].questionNumber='1';f.metadata.columns[2].questionNumber=null;
  const identity=await importedDatasetIdentity(hash,f.table,f.metadata);
  assert.equal(platformMappingSuggestions(design,identity)[0].ambiguous,true);
  assert.deepEqual(unambiguousPlatformAssignments(design,identity),[]);
});
test('multi-column questions never become a one-column approved or suggested v1 assignment',async()=>{
  const {table,metadata}=fixture(),design=newQuestionnaire();design.questions=[{...newQuestion('multi','Q1'),text:'选择原因',type:'multi'},{...newQuestion('one','Q2'),text:'说明',type:'text',choices:[]}];
  const identity=await importedDatasetIdentity(hash,table,metadata),assignments=unambiguousPlatformAssignments(design,identity);
  assert.deepEqual(assignments,[{questionId:'one',column:table.headers[1],representation:'code'}]);
});
test('manifest version drift rejected; imported metadata survives v1 backup without approval',async()=>{
  const {table,metadata}=fixture(),design=newQuestionnaire();design.questions=[{...newQuestion('one','Q1'),text:'到店频次',type:'number',min:0,max:20,choices:[]}];
  const identity=await importedDatasetIdentity(hash,table,metadata),bundle=await exportWjxBundle(design);
  assert.equal(platformMappingSuggestions(design,identity,bundle.manifest)[0].basis,'manifest-number');
  const drift=structuredClone(design);drift.questions[0].text='新版';assert.throws(()=>platformMappingSuggestions(drift,identity,bundle.manifest),/不一致/);
  const mapping={design,assignments:[{questionId:'one',column:table.headers[2],representation:'code'}],sourceSignature:null,confirmed:null};mapping.confirmed=mappingSignature(mapping,identity);
  const restored=restoreMapping(mappingBackup(mapping,identity),identity);assert.equal(restored.confirmed,null);
  const change=structuredClone(identity);change.importMetadata.columns[0].label='变更';assert.throws(()=>restoreMapping(mappingBackup(mapping,identity),change));
});
