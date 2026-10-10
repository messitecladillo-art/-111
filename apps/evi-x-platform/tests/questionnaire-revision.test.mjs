import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exampleQuestionnaire,newQuestionnaire,DESIGN_LIMITS} from '../lib/questionnaire.ts';
import {parseQuestionnaireLibraryContent} from '../lib/questionnaire-library.ts';
import {reviewQuestionnaire,QUESTIONNAIRE_REVIEW_ENGINE} from '../lib/questionnaire-review.ts';
import {initialRevisionHistory,commitQuestionnaireRevision,travelQuestionnaireRevision,revisionSnapshot,repairOriginInput,prepareQuestionnaireRepair,compareQuestionnaireRevision} from '../lib/questionnaire-revision.ts';

const hash=s=>createHash('sha256').update(s).digest('hex');
const projectId='11111111-1111-4111-8111-111111111111',v1='22222222-2222-4222-8222-222222222222',v2='33333333-3333-4333-8333-333333333333';
const key=f=>JSON.stringify([f.questionId,f.code]);
function version(content,revision=1,repairOrigin=null){
  const p=parseQuestionnaireLibraryContent(content);
  return {id:revision===1?v1:v2,projectId,revision,baseRevision:revision-1,label:`合成测试 v${revision}`,title:p.content.title,sha256:hash(p.serialized),size:p.size,createdAt:'2026-10-02T14:00:00.000Z',content:p.content,repairOrigin};
}
function review(source){
  const result=reviewQuestionnaire(source.content);
  return {id:`check-${source.revision}`,projectId:source.projectId,versionId:source.id,revision:source.revision,sourceSha256:source.sha256,engine:QUESTIONNAIRE_REVIEW_ENGINE,createdAt:source.createdAt,resultSha256:hash(JSON.stringify(result)),result};
}
async function fixture(){
  const content=exampleQuestionnaire();content.questions[0].text='';
  const before=version(content),prior=review(before),finding=prior.result.findings.find(f=>f.code==='text_missing');
  assert(finding);const origin=await prepareQuestionnaireRepair(before,prior,finding);
  const changed=structuredClone(content);changed.questions[0].text='你目前的选择是什么？';changed.questions[1].variable='!';
  const after=version(changed,2,origin),next=review(after);
  return {before,prior,finding,origin,after,next};
}

test('confirmed revision captures detached content and origin; ordinary edits preserve both history dimensions',async()=>{
  const f=await fixture(),start=initialRevisionHistory(newQuestionnaire());
  let h=commitQuestionnaireRevision(start,f.before.content,f.origin);
  const loaded=structuredClone(h.present),edited={...h.present.content,title:'修改后的标题'};
  h=commitQuestionnaireRevision(h,edited);assert.deepEqual(h.present.repairOrigin,f.origin);
  f.origin.code='other';f.before.content.title='caller mutation';edited.title='later mutation';
  assert.equal(h.present.content.title,'修改后的标题');assert.equal(h.present.repairOrigin.code,'text_missing');
  h=travelQuestionnaireRevision(h,true);assert.deepEqual(h.present,loaded);
  h=travelQuestionnaireRevision(h,false);assert.equal(h.present.content.title,'修改后的标题');assert.equal(h.present.repairOrigin.code,'text_missing');
});

test('new/import/example/unrelated replacement and copy clear origin; undo/redo restores the exact pair',async()=>{
  const f=await fixture();let h=commitQuestionnaireRevision(initialRevisionHistory(newQuestionnaire()),f.before.content,f.origin);
  for(const replacement of [newQuestionnaire(),exampleQuestionnaire(),f.after.content,h.present.content]){
    const previous=h.present;h=commitQuestionnaireRevision(h,replacement,null);assert.equal(h.present.repairOrigin,null);
    h=travelQuestionnaireRevision(h,true);assert.deepEqual(h.present,previous);
    h=travelQuestionnaireRevision(h,false);assert.equal(h.present.repairOrigin,null);
    h=commitQuestionnaireRevision(h,f.before.content,f.origin);
  }
});

test('history is bounded, redo is discarded by edits and empty travel is a no-op',()=>{
  let h=initialRevisionHistory(newQuestionnaire());assert.equal(travelQuestionnaireRevision(h,true),h);assert.equal(travelQuestionnaireRevision(h,false),h);
  for(let i=0;i<DESIGN_LIMITS.history+5;i++)h=commitQuestionnaireRevision(h,{...h.present.content,title:`t${i}`});
  assert.equal(h.past.length,DESIGN_LIMITS.history);h=travelQuestionnaireRevision(h,true);assert.equal(h.future.length,1);
  h=commitQuestionnaireRevision(h,{...h.present.content,title:'branch'});assert.equal(h.future.length,0);
});

test('append input projects only three detached identity fields; origin absence is not invented',async()=>{
  const {origin}=await fixture(),input=repairOriginInput(origin);
  assert.deepEqual(Object.keys(input).sort(),['code','questionId','reviewId']);origin.code='other';assert.equal(input.code,'text_missing');
  assert.equal(repairOriginInput(null),null);assert.equal(revisionSnapshot(newQuestionnaire()).repairOrigin,null);
  let called=false;const evil={...origin};Object.defineProperty(evil,'code',{enumerable:true,get(){called=true;return 'text_missing';}});
  assert.throws(()=>repairOriginInput(evil));assert.equal(called,false);
});

test('preparing verifies exact finding membership, complete source and result digest',async()=>{
  const f=await fixture();assert.deepEqual(await prepareQuestionnaireRepair(f.before,f.prior,f.finding),f.origin);
  await assert.rejects(()=>prepareQuestionnaireRepair(f.before,f.prior,{questionId:f.finding.questionId,code:'invented'}));
  await assert.rejects(()=>prepareQuestionnaireRepair(f.before,f.prior,{questionId:null,code:f.finding.code}));
  await assert.rejects(()=>prepareQuestionnaireRepair({...f.before,size:f.before.size+1},f.prior,f.finding));
  await assert.rejects(()=>prepareQuestionnaireRepair(f.before,{...f.prior,resultSha256:'0'.repeat(64)},f.finding));
  const altered=structuredClone(f.before);altered.content.title='different content, same findings';
  assert.deepEqual(reviewQuestionnaire(altered.content),f.prior.result);
  await assert.rejects(()=>prepareQuestionnaireRepair(altered,f.prior,f.finding));
});

test('comparison partitions stable question ID/code sets, never transient finding IDs or question numbers',async()=>{
  const f=await fixture(),content=structuredClone(f.after.content);content.questions.reverse();
  content.questions.find(q=>q.id===f.finding.questionId).variable='RENAMED';
  f.after=version(content,2,f.origin);f.next=review(f.after);
  const result=await compareQuestionnaireRevision(f.origin,f.before,f.prior,f.after,f.next);
  const old=new Set(f.prior.result.findings.map(key)),fresh=new Set(f.next.result.findings.map(key));
  assert.deepEqual(result.stillDetected.map(key),f.next.result.findings.filter(f=>old.has(key(f))).map(key));
  assert.deepEqual(result.newlyDetected.map(key),f.next.result.findings.filter(f=>!old.has(key(f))).map(key));
  assert.deepEqual(result.noLongerDetected.map(key),f.prior.result.findings.filter(f=>!fresh.has(key(f))).map(key));
  assert.equal(result.targetFinding,'no_longer_detected');assert.equal(result.targetQuestionDeleted,false);assert.equal(result.removedQuestions.length,0);
  assert(result.newlyDetected.some(f=>f.code==='variable_invalid'));assert(result.noLongerDetected.some(f=>f.code==='text_missing'));
  assert(!Object.hasOwn(result,'resolved'));assert(!Object.hasOwn(result,'approved'));
});

test('unchanged issue stays detected, including global null-ID findings',async()=>{
  const f=await fixture(),after=version(f.before.content,2,f.origin);
  const result=await compareQuestionnaireRevision(f.origin,f.before,f.prior,after,review(after));
  assert.equal(result.targetFinding,'still_detected');assert.equal(result.newlyDetected.length,0);assert.equal(result.noLongerDetected.length,0);
  const global=f.prior.result.findings.find(f=>f.questionId===null);assert(global);
  const origin=await prepareQuestionnaireRepair(f.before,f.prior,global),globalTarget=version(f.before.content,2,origin);
  assert.equal((await compareQuestionnaireRevision(origin,f.before,f.prior,globalTarget,review(globalTarget))).targetFinding,'still_detected');
});

test('deletion is surfaced independently and never described as resolution',async()=>{
  const f=await fixture(),content=structuredClone(f.before.content);content.questions=content.questions.filter(q=>q.id!==f.finding.questionId);
  const after=version(content,2,f.origin),result=await compareQuestionnaireRevision(f.origin,f.before,f.prior,after,review(after));
  assert.equal(result.targetQuestionDeleted,true);assert.equal(result.targetFinding,'no_longer_detected');
  assert(result.removedQuestions.some(q=>q.id===f.finding.questionId));assert(result.noLongerDetected.some(x=>key(x)===key(f.finding)));
  assert(!Object.hasOwn(result,'resolved'));
});

test('comparison rejects missing/foreign origin and every original identity mismatch',async()=>{
  const f=await fixture();
  for(const patch of [{reviewId:'wrong-check'},{sourceVersionId:v2},{sourceRevision:2},{sourceSha256:'0'.repeat(64)},{questionId:null},{code:'other'}]){
    const origin={...f.origin,...patch};await assert.rejects(()=>compareQuestionnaireRevision(origin,f.before,f.prior,{...f.after,repairOrigin:origin},f.next));
  }
  await assert.rejects(()=>compareQuestionnaireRevision(f.origin,f.before,f.prior,{...f.after,repairOrigin:null},f.next));
  await assert.rejects(()=>compareQuestionnaireRevision(f.origin,f.before,f.prior,{...f.after,projectId:v1},f.next));
  await assert.rejects(()=>compareQuestionnaireRevision(null,f.before,f.prior,f.after,f.next));
});

test('both original and new full sources and receipts must verify, not only issue projections',async()=>{
  const f=await fixture();
  for(const side of ['before','after']){
    const bad=structuredClone(f[side]);bad.content.title='not the hashed design';
    await assert.rejects(()=>compareQuestionnaireRevision(f.origin,side==='before'?bad:f.before,f.prior,side==='after'?bad:f.after,f.next));
  }
  for(const side of ['prior','next'])for(const patch of [{resultSha256:'0'.repeat(64)},{sourceSha256:'0'.repeat(64)},{versionId:v1},{revision:40},{projectId:v2}]){
    if(patch.versionId===f[side].versionId)continue;
    const bad={...f[side],...patch};await assert.rejects(()=>compareQuestionnaireRevision(f.origin,f.before,side==='prior'?bad:f.prior,f.after,side==='next'?bad:f.next));
  }
  const bad=structuredClone(f.next);bad.result.summary.blockers=0;bad.resultSha256=hash(JSON.stringify(bad.result));
  await assert.rejects(()=>compareQuestionnaireRevision(f.origin,f.before,f.prior,f.after,bad));
});

test('different engines are not silently compared or interpreted as an empty result',async()=>{
  const f=await fixture();await assert.rejects(()=>compareQuestionnaireRevision(f.origin,f.before,f.prior,f.after,{...f.next,engine:'questionnaire-structure/2'}),/引擎版本不同/);
  await assert.rejects(()=>compareQuestionnaireRevision(f.origin,f.before,f.prior,f.after,null));
});

test('prepare and compare snapshot all caller inputs before digest awaits',async()=>{
  const f=await fixture(),source=structuredClone(f.before),record=structuredClone(f.prior),finding={...f.finding};
  const pending=prepareQuestionnaireRepair(source,record,finding);source.content.title='late';record.id='late';record.resultSha256='0'.repeat(64);finding.code='late';
  assert.deepEqual(await pending,f.origin);
  const origin=structuredClone(f.origin),before=structuredClone(f.before),after=structuredClone(f.after),prior=structuredClone(f.prior),next=structuredClone(f.next);
  const comparison=compareQuestionnaireRevision(origin,before,prior,after,next);origin.code='late';before.content.title='late';after.content.title='late';prior.id='late';next.resultSha256='0'.repeat(64);
  assert.equal((await comparison).targetFinding,'no_longer_detected');
});
