import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newQuestion,newQuestionnaire} from '../lib/questionnaire.ts';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
import {platformDatasetIdentity,createPlatformMapping,confirmPlatformMapping} from '../lib/platform-data-mapping.ts';
import {previewPlatformAnalysis,bridgePlatformMapping} from '../lib/platform-analysis-adapter.ts';
const sourceHash='a'.repeat(64);
async function fixture(csv='P,H,I,N\n1,1,1,3\n2,0,0,9\n1,0,1,5'){
 const table=parseSurveyCsv(csv),design=newQuestionnaire();design.questions=[{...newQuestion('parent','SCREEN'),text:'是否到店',choices:[{code:'yes',label:'到过'},{code:'no',label:'未到过'}]},{...newQuestion('multi','REASONS'),text:'选择原因',type:'multi',choices:[{code:'near',label:'方便'},{code:'cost',label:'价格'}],condition:{questionId:'parent',codes:['yes']}},{...newQuestion('number','VISITS'),text:'次数',type:'number',choices:[],min:0,max:20}];
 const assignments=[{kind:'column',questionId:'parent',column:'P',representation:'code',recodes:[{from:'1',to:'yes'},{from:'2',to:'no'}],unmapped:'reject',missingCodes:[],userMissing:'preserve'},{kind:'binary-split',questionId:'multi',columns:[{column:'H',optionCode:'near',selectedValues:['1'],unselectedValues:['0']},{column:'I',optionCode:'cost',selectedValues:['1'],unselectedValues:['0']}],blankPolicy:'reject-partial',missingCodes:[],userMissing:'preserve'},{kind:'column',questionId:'number',column:'N',representation:'code',recodes:[],unmapped:'identity',missingCodes:[],userMissing:'preserve'}];
 const identity=await platformDatasetIdentity(table,null,sourceHash),mapping=await confirmPlatformMapping(createPlatformMapping(design,identity,assignments));
 return {mapping,context:{table,metadata:null,sourceHash,design}};
}
test('explicit recoded parents determine a shared eligible scope before multi denominators',async()=>{
 const f=await fixture(),raw=structuredClone(f.context.table);const v=await previewPlatformAnalysis(f.mapping,f.context,'exclude');
 assert.equal(v.assessment.eligibleRows,2);assert.equal(v.assessment.ineligibleRows,1);assert.deepEqual(v.prepared.sourceRows,[0,2]);
 const m=v.prepared.multiResults[0];assert.equal(m.respondents,2);assert.equal(m.selections,3);assert.equal(m.options[0].respondentPercent,50);assert.ok(Math.abs(m.options[0].selectionPercent-100/3)<1e-10);
 assert.deepEqual(f.context.table,raw);const b=bridgePlatformMapping(f.mapping,v);assert.equal(b.confirmed,null);assert.deepEqual(b.assignments.map(a=>a.questionId),['parent','number']);
});
test('strict scope does not silently discard branch-out responses',async()=>{const f=await fixture();await assert.rejects(previewPlatformAnalysis(f.mapping,f.context,'strict'),/分支外作答/);});
test('undefined or missing parent mappings fail before any result',async()=>{const f=await fixture();const m=await confirmPlatformMapping(createPlatformMapping(f.mapping.design,f.mapping.dataset,f.mapping.assignments.filter(a=>a.questionId!=='parent')));await assert.rejects(previewPlatformAnalysis(m,f.context,'exclude'),/条件父题/);});
test('unconfirmed, version-drift and empty scope do not become an analysis table',async()=>{
 const f=await fixture();await assert.rejects(previewPlatformAnalysis({...f.mapping,confirmed:null},f.context,'exclude'),/确认/);
 const c=structuredClone(f.context);c.design.questions[0].text='新版';await assert.rejects(previewPlatformAnalysis(f.mapping,c,'exclude'));
 const no=await fixture('P,H,I,N\n2,0,0,9');await assert.rejects(previewPlatformAnalysis(no.mapping,no.context,'exclude'),/没有可分析/);
});
test('input capture survives concurrent caller edits',async()=>{const f=await fixture();const pending=previewPlatformAnalysis(f.mapping,f.context,'exclude');f.context.table.rows[0][0]='2';const v=await pending;assert.deepEqual(v.prepared.sourceRows,[0,2]);});

test('branch-out multi response in a later split column is never hidden by an empty first column',async()=>{const f=await fixture('P,H,I,N\n1,1,0,3\n2,,1,9');await assert.rejects(previewPlatformAnalysis(f.mapping,f.context,'strict'),/分支外作答/);const preview=await previewPlatformAnalysis(f.mapping,f.context,'exclude');assert.equal(preview.assessment.contradictionRows,1);assert.deepEqual(preview.prepared.sourceRows,[0]);});

test('per-question missing codes are blank in routing without being treated as branch-out answers',async()=>{const f=await fixture('P,H,I,N\n1,1,0,3\n2,,99,99');f.mapping=await confirmPlatformMapping(createPlatformMapping(f.mapping.design,f.mapping.dataset,f.mapping.assignments.map(a=>a.questionId==='multi'||a.questionId==='number'?{...a,missingCodes:['99']}:a)));const v=await previewPlatformAnalysis(f.mapping,f.context,'strict');assert.equal(v.assessment.contradictionRows,0);assert.deepEqual(v.prepared.sourceRows,[0]);});
