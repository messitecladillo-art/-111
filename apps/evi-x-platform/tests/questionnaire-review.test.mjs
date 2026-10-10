import test from 'node:test';
import assert from 'node:assert/strict';
import {newQuestionnaire,exampleQuestionnaire,questionnaireIssues} from '../lib/questionnaire.ts';
import {reviewQuestionnaire,parseQuestionnaireReviewReceipt,verifyQuestionnaireReviewReceipt,QUESTIONNAIRE_REVIEW_ENGINE} from '../lib/questionnaire-review.ts';
import {parseQuestionnaireLibraryContent} from '../lib/questionnaire-library.ts';
import {createHash} from 'node:crypto';

function sample(){const content=exampleQuestionnaire(),source={projectId:'p',id:'v',revision:2,sha256:createHash('sha256').update(parseQuestionnaireLibraryContent(content).serialized).digest('hex'),content};return{source,record:{id:'review-id',projectId:'p',versionId:'v',revision:2,sourceSha256:source.sha256,engine:QUESTIONNAIRE_REVIEW_ENGINE,createdAt:'2026-10-02T13:00:00.000Z',resultSha256:'b'.repeat(64),result:reviewQuestionnaire(content)}};}
test('mechanical review reproduces all existing issues without changing the input',()=>{
  for(const d of [newQuestionnaire(),exampleQuestionnaire()]){
    const before=JSON.stringify(d),r=reviewQuestionnaire(d),issues=questionnaireIssues(d);
    assert.equal(JSON.stringify(d),before);assert.equal(r.findings.length,issues.length);
    assert.equal(r.summary.blockers+r.summary.reviews,issues.length);
    assert.equal(new Set(r.findings.map(x=>x.id)).size,issues.length);
    for(const finding of r.findings){assert(issues.some(i=>i.code===finding.code&&i.questionId===finding.questionId&&i.message===finding.message&&i.level===finding.level));if(finding.questionId)assert.equal(d.questions[finding.questionNumber-1].id,finding.questionId);}
    assert.equal(r.nextSteps.at(-1).id,'human_review');assert.equal(r.humanChecks.length,5);
    assert(r.nextSteps.flatMap(s=>s.findingIds).every(id=>r.findings.some(f=>f.id===id)));
    assert.equal(r.classification,'automated_design_check');assert(!JSON.stringify(r).includes('approved'));
  }
});
test('zero automatic findings still requires human evidence, never a pass or verified questionnaire',()=>{
  const d=exampleQuestionnaire();d.pilotNotes='计划开展认知访谈，未实施';
  const r=reviewQuestionnaire(d);assert.equal(r.findings.length,0);assert.equal(r.status,'human_review_required');assert.equal(r.humanChecks.length,5);assert.equal(r.nextSteps.length,1);
});
test('blockers are prioritized and complete, not hidden by a top-N action limit',()=>{
  const d=newQuestionnaire();d.questions[0].variable='!';
  const r=reviewQuestionnaire(d);assert.equal(r.status,'structure_changes_needed');assert(r.summary.blockers>0);
  assert(r.findings.slice(0,r.summary.blockers).every(i=>i.level==='blocker'));
  assert.equal(r.nextSteps[0].findingIds.length,r.summary.blockers);
});
test('detached canonical review input refuses malformed and exotic drafts',()=>{
  const d=exampleQuestionnaire();assert.throws(()=>reviewQuestionnaire({...d,approved:true}));
  assert.throws(()=>reviewQuestionnaire(null));let called=false;
  Object.defineProperty(d,'title',{get(){called=true;return 'do not run';},enumerable:true});
  assert.throws(()=>reviewQuestionnaire(d));assert.equal(called,false);
});
test('exact source receipt is accepted; equivalent JSON key order is irrelevant',()=>{
  const {source,record}=sample();assert.deepEqual(parseQuestionnaireReviewReceipt(record,source),record);
  record.result=Object.fromEntries(Object.entries(record.result).reverse());assert.deepEqual(parseQuestionnaireReviewReceipt(record,source),record);
});
test('receipt rejects all mismatched source identities, versions, engine and result claims',()=>{
  const {source,record}=sample();
  for(const key of ['projectId','versionId','revision','sourceSha256','engine','createdAt','resultSha256'])assert.throws(()=>parseQuestionnaireReviewReceipt({...record,[key]:'wrong'},source),key);
  assert.throws(()=>parseQuestionnaireReviewReceipt({...record,approved:true},source));
  const changed=structuredClone(record);changed.result.summary.blockers++;assert.throws(()=>parseQuestionnaireReviewReceipt(changed,source));
  const claims=structuredClone(record);claims.result.status='pass';assert.throws(()=>parseQuestionnaireReviewReceipt(claims,source));
  const human=structuredClone(record);human.result.humanChecks=[];assert.throws(()=>parseQuestionnaireReviewReceipt(human,source));
  assert.throws(()=>parseQuestionnaireReviewReceipt(record,{...source,content:newQuestionnaire()}));
});
test('untrusted receipt getters and serialization hooks are never invoked',()=>{
  const {source,record}=sample();let called=false;
  const top={...record};Object.defineProperty(top,'result',{get(){called=true;return record.result;},enumerable:true});assert.throws(()=>parseQuestionnaireReviewReceipt(top,source));
  const nested=structuredClone(record);Object.defineProperty(nested.result,'summary',{get(){called=true;return record.result.summary;},enumerable:true});assert.throws(()=>parseQuestionnaireReviewReceipt(nested,source));
  const hook=structuredClone(record);hook.result.toJSON=()=>{called=true;return record.result;};assert.throws(()=>parseQuestionnaireReviewReceipt(hook,source));
  assert.equal(called,false);
});
test('accepted receipt is detached and the UI verifier checks the actual result fingerprint',async()=>{
  const {source,record}=sample();
  const parsed=parseQuestionnaireReviewReceipt(record,source);record.result.status='pass';assert.notEqual(parsed.result.status,'pass');
  const valid=sample().record;
  await assert.rejects(()=>verifyQuestionnaireReviewReceipt(valid,source),/指纹/);
  valid.resultSha256=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(valid.result)))).toString('hex');
  const checked=await verifyQuestionnaireReviewReceipt(valid,source);assert.deepEqual(checked,valid);
  valid.result.humanChecks.length=0;assert.equal(checked.result.humanChecks.length,5);
});
