import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {newQuestionnaire} from '../lib/questionnaire.ts';
import {parseQuestionnaireLibraryContent} from '../lib/questionnaire-library.ts';
import {isQuestionnaireTimestamp,verifyQuestionnaireVersion,verifyQuestionnaireSaveReceipt,questionnaireCurrentRevision} from '../lib/questionnaire-version.ts';
import {reviewQuestionnaire,verifyQuestionnaireReviewReceipt,QUESTIONNAIRE_REVIEW_ENGINE} from '../lib/questionnaire-review.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
const projectId='11111111-1111-4111-8111-111111111111',versionId='22222222-2222-4222-8222-222222222222',laterId='33333333-3333-4333-8333-333333333333';
function fixture(){
 const content=newQuestionnaire(),parsed=parseQuestionnaireLibraryContent(content),createdAt='2026-10-02T14:00:00.000Z';
 const version={id:versionId,projectId,revision:1,baseRevision:0,label:'教学合成 v1',title:content.title,sha256:hash(parsed.serialized),size:parsed.size,createdAt,content};
 const project={id:projectId,title:content.title,revision:1,versionId,sha256:version.sha256,size:version.size,createdAt,updatedAt:createdAt,versionCount:1};
 const expected={projectId,versionId,baseRevision:0,label:version.label,contentKey:parsed.serialized};
 const result=reviewQuestionnaire(content),review={id:'check-1',projectId,versionId,revision:1,sourceSha256:version.sha256,engine:QUESTIONNAIRE_REVIEW_ENGINE,createdAt,resultSha256:hash(JSON.stringify(result)),result};
 return {version,project,expected,receipt:{project,version,replayed:false},review};
}
test('version binds canonical complete content, size, title and immutable version metadata',async()=>{
 const f=fixture(),checked=await verifyQuestionnaireVersion(f.version,f.expected);assert.deepEqual(checked,{...f.version,repairOrigin:null});
 checked.content.title='changed returned value';assert.notEqual(f.version.content.title,checked.content.title);
});
test('same issue projection cannot substitute for the complete questionnaire hash',async()=>{
 const f=fixture();f.version.content.title='不同目标但同一结构问题';assert.deepEqual(reviewQuestionnaire(f.version.content),f.review.result);
 await assert.rejects(()=>verifyQuestionnaireReviewReceipt(f.review,f.version),/源版本指纹/);
 await assert.rejects(()=>verifyQuestionnaireVersion(f.version,f.expected));
});
test('metadata title/size/hash/IDs/revision/base/label/date changes fail closed',async()=>{
 const f=fixture();for(const patch of [{title:'other'},{size:f.version.size+1},{size:0},{size:300001},{sha256:'0'.repeat(64)},{sha256:'A'.repeat(64)},{id:laterId},{projectId:laterId},{revision:0},{revision:41},{revision:1.5},{baseRevision:1},{label:''},{createdAt:'2026-02-30T14:00:00.000Z'},{approved:true}])await assert.rejects(()=>verifyQuestionnaireVersion({...f.version,...patch},f.expected));
});
test('timestamp uses actual canonical UTC dates, not normalization',()=>{
 for(const v of ['2024-02-29T00:00:00.000Z','2026-10-02T13:01:02.003Z'])assert.equal(isQuestionnaireTimestamp(v),true);
 for(const v of ['2026-02-29T00:00:00.000Z','2026-02-30T00:00:00.000Z','2026-04-31T00:00:00.000Z','2026-10-02T24:00:00.000Z','2026-10-02T13:01:02Z','2026-10-02T13:01:02.000+00:00',null,1])assert.equal(isQuestionnaireTimestamp(v),false);
});
test('version rejects accessors, hidden keys, symbol keys and exotic prototypes without invoking code',async()=>{
 const f=fixture();let called=0;const top={...f.version};Object.defineProperty(top,'content',{enumerable:true,get(){called++;return f.version.content;}});
 const hidden={...f.version};Object.defineProperty(hidden,'approved',{value:true});const symbol={...f.version,[Symbol('approval')]:true};
 for(const v of [top,hidden,symbol,Object.assign(Object.create(null),f.version),null,[]])await assert.rejects(()=>verifyQuestionnaireVersion(v,f.expected));assert.equal(called,0);
});
test('version captures content before digest await; later caller mutations cannot change verified return',async()=>{
 const f=fixture(),pending=verifyQuestionnaireVersion(f.version,f.expected);f.version.content.title='late mutation';f.version.sha256='0'.repeat(64);
 const checked=await pending;assert.notEqual(checked.content.title,f.version.content.title);assert.notEqual(checked.sha256,f.version.sha256);
});
test('current revision is bounded and cannot be behind inspected version',()=>{
 assert.equal(questionnaireCurrentRevision(40,1),40);for(const v of [0,41,1.2,'2',null])assert.throws(()=>questionnaireCurrentRevision(v,1));assert.throws(()=>questionnaireCurrentRevision(1,2));
});
test('save verifies exact sent snapshot and matching latest head metadata',async()=>{
 const f=fixture();assert.deepEqual(await verifyQuestionnaireSaveReceipt(f.receipt,f.expected),{...f.receipt,version:{...f.version,repairOrigin:null}});
 for(const patch of [{baseRevision:1},{label:'another'},{contentKey:'different'},{versionId:laterId},{projectId:laterId}])await assert.rejects(()=>verifyQuestionnaireSaveReceipt(f.receipt,{...f.expected,...patch}));
 for(const patch of [{id:laterId},{revision:2},{versionId:laterId},{sha256:'0'.repeat(64)},{size:1},{title:'another'},{versionCount:2},{updatedAt:'2026-10-02T14:01:00.000Z'},{createdAt:'2026-02-30T00:00:00.000Z'}])await assert.rejects(()=>verifyQuestionnaireSaveReceipt({...f.receipt,project:{...f.project,...patch}},f.expected));
 await assert.rejects(()=>verifyQuestionnaireSaveReceipt({...f.receipt,replayed:'true'},f.expected));
});
test('historical replay remains historical with a valid newer head; no new content binding',async()=>{
 const f=fixture(),head={...f.project,revision:2,versionCount:2,versionId:laterId,title:'newer source',updatedAt:'2026-10-02T14:01:00.000Z'};
 const result=await verifyQuestionnaireSaveReceipt({...f.receipt,project:head,replayed:true},f.expected);
 assert.equal(result.version.revision,1);assert.equal(result.project.revision,2);assert.equal(result.version.id,versionId);
 await assert.rejects(()=>verifyQuestionnaireSaveReceipt({...f.receipt,project:{...head,versionId}},f.expected));
});
test('save captures expected request and head before digest await',async()=>{
 const f=fixture(),pending=verifyQuestionnaireSaveReceipt(f.receipt,f.expected);f.expected.label='late';f.project.title='late';
 const checked=await pending;assert.equal(checked.version.label,'教学合成 v1');assert.notEqual(checked.project.title,'late');
});
test('complete review receipt validates both source and result hashes',async()=>{
 const f=fixture();assert.deepEqual(await verifyQuestionnaireReviewReceipt(f.review,f.version),f.review);
 await assert.rejects(()=>verifyQuestionnaireReviewReceipt({...f.review,resultSha256:'0'.repeat(64)},f.version),/指纹/);
 await assert.rejects(()=>verifyQuestionnaireReviewReceipt({...f.review,createdAt:'2026-02-30T14:00:00.000Z'},f.version),/时间/);
});
