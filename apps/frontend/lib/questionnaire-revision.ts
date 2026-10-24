/** Revision intent and mechanical recheck differences, never human approval. */
import {DESIGN_LIMITS,type Questionnaire} from './questionnaire.ts';
import {parseQuestionnaireLibraryContent,parseQuestionnaireRepairOrigin,type QuestionnaireRepairOrigin,type QuestionnaireRepairOriginInput,type QuestionnaireVersion} from './questionnaire-library.ts';
import {verifyQuestionnaireVersion} from './questionnaire-version.ts';
import {verifyQuestionnaireReviewReceipt,type QuestionnaireReviewFinding,type QuestionnaireReviewRecord} from './questionnaire-review.ts';
import {parseTopicQuestionnaireBinding,type TopicQuestionnaireBinding} from './topic-questionnaire.ts';
import type {TopicBindingRestoreOrigin} from './topic-questionnaire-api.ts';

export type QuestionnaireRevision = {content:Questionnaire;repairOrigin:QuestionnaireRepairOrigin|null;topicBinding:TopicQuestionnaireBinding|null;topicRestoreOrigin:TopicBindingRestoreOrigin|null};
export type QuestionnaireRevisionHistory = {past:QuestionnaireRevision[];present:QuestionnaireRevision;future:QuestionnaireRevision[]};
export function parseQuestionnaireTopicOrigin(value:unknown):TopicBindingRestoreOrigin|null {
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('问卷绑定恢复来源无效。');
  const row=value as Record<string,unknown>,keys=Object.keys(row).sort().join(','),id=keys==='questionnaireVersionId'?row.questionnaireVersionId:keys==='applicationVersionId,phase'&&row.phase==='before'?row.applicationVersionId:null;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('问卷绑定恢复来源无效。');
  return keys==='questionnaireVersionId'?{questionnaireVersionId:id}:{applicationVersionId:id,phase:'before'};
}
export function revisionSnapshot(content:Questionnaire,repairOrigin:QuestionnaireRepairOrigin|null=null,topicBinding:TopicQuestionnaireBinding|null=null,topicRestoreOrigin:TopicBindingRestoreOrigin|null=null):QuestionnaireRevision {
  return {content:parseQuestionnaireLibraryContent(content).content,repairOrigin:repairOrigin===null?null:parseQuestionnaireRepairOrigin(repairOrigin),topicBinding:topicBinding===null?null:parseTopicQuestionnaireBinding(topicBinding),topicRestoreOrigin:parseQuestionnaireTopicOrigin(topicRestoreOrigin)};
}
export function initialRevisionHistory(content:Questionnaire,topicBinding:TopicQuestionnaireBinding|null=null,topicRestoreOrigin:TopicBindingRestoreOrigin|null=null):QuestionnaireRevisionHistory {
  return {past:[],present:revisionSnapshot(content,null,topicBinding,topicRestoreOrigin),future:[]};
}
/** Omitted origin means ordinary edit; explicit null means unrelated replacement/copy. */
export function commitQuestionnaireRevision(history:QuestionnaireRevisionHistory,content:Questionnaire,repairOrigin:QuestionnaireRepairOrigin|null=history.present.repairOrigin,topicBinding:TopicQuestionnaireBinding|null=history.present.topicBinding??null,topicRestoreOrigin:TopicBindingRestoreOrigin|null=history.present.topicRestoreOrigin??null):QuestionnaireRevisionHistory {
  return {past:[...history.past,history.present].slice(-DESIGN_LIMITS.history),present:revisionSnapshot(content,repairOrigin,topicBinding,topicRestoreOrigin),future:[]};
}
/** One saved application is one undo step. Its before binding is resolved by the immutable server audit. */
export function commitTopicQuestionnaireRevision(history:QuestionnaireRevisionHistory,content:Questionnaire,binding:TopicQuestionnaireBinding,applicationVersionId:string):QuestionnaireRevisionHistory {
  const before=revisionSnapshot(history.present.content,history.present.repairOrigin,history.present.topicBinding??null,{applicationVersionId,phase:'before'});
  // Unsaved older edits can share this exact before binding without having an immutable origin yet.
  // The server audit authenticates that binding independently of their different questionnaire text.
  const bindingKey=(value:TopicQuestionnaireBinding|null)=>JSON.stringify(value===null?null:parseTopicQuestionnaireBinding(value));
  const beforeKey=bindingKey(before.topicBinding);
  const past=history.past.map(entry=>entry.topicRestoreOrigin==null&&bindingKey(entry.topicBinding??null)===beforeKey?revisionSnapshot(entry.content,entry.repairOrigin,entry.topicBinding??null,before.topicRestoreOrigin):entry);
  return commitQuestionnaireRevision({...history,past,present:before},content,null,binding,{questionnaireVersionId:applicationVersionId});
}
export function travelQuestionnaireRevision(history:QuestionnaireRevisionHistory,back:boolean):QuestionnaireRevisionHistory {
  const target=back?history.past.at(-1):history.future[0];
  if(!target)return history;
  return back?{past:history.past.slice(0,-1),present:target,future:[history.present,...history.future]}:{past:[...history.past,history.present].slice(-DESIGN_LIMITS.history),present:target,future:history.future.slice(1)};
}
export function repairOriginInput(origin:QuestionnaireRepairOrigin|null):QuestionnaireRepairOriginInput|null {
  if(origin===null)return null;
  const checked=parseQuestionnaireRepairOrigin(origin);
  if(!checked)throw Error('修订来源不能为空。');
  return {reviewId:checked.reviewId,questionId:checked.questionId,code:checked.code};
}
const findingKey=(finding:Pick<QuestionnaireReviewFinding,'questionId'|'code'>)=>JSON.stringify([finding.questionId,finding.code]);
function originMatchesRecord(origin:QuestionnaireRepairOrigin,source:QuestionnaireVersion,record:QuestionnaireReviewRecord){
  if(origin.sourceVersionId!==source.id||origin.sourceRevision!==source.revision||origin.sourceSha256!==source.sha256||origin.reviewId!==record.id||origin.engine!==record.engine||!record.result.findings.some(f=>findingKey(f)===findingKey(origin)))throw Error('修订来源与原版本、原检查或问题条目不一致，不能比较。');
}
/** Read/prepare alone returns intent; only the caller's confirmed load may adopt it. */
export async function prepareQuestionnaireRepair(source:QuestionnaireVersion,record:QuestionnaireReviewRecord,finding:Pick<QuestionnaireReviewFinding,'questionId'|'code'>):Promise<QuestionnaireRepairOrigin> {
  const selected={questionId:finding.questionId,code:finding.code};
  const [checked,reviewed]=await Promise.all([
    verifyQuestionnaireVersion(source,{projectId:source.projectId,versionId:source.id}),
    verifyQuestionnaireReviewReceipt(record,source),
  ]);
  if(!reviewed.result.findings.some(f=>findingKey(f)===findingKey(selected)))throw Error('该修订条目不属于已核验的检查记录。');
  const origin=parseQuestionnaireRepairOrigin({reviewId:reviewed.id,...selected,sourceVersionId:checked.id,sourceRevision:checked.revision,sourceSha256:checked.sha256,engine:reviewed.engine});
  if(!origin)throw Error('修订来源不能为空。');
  return origin;
}
export type QuestionnaireRevisionComparison = {
  sourceRevision:number;targetRevision:number;engine:string;
  stillDetected:QuestionnaireReviewFinding[];newlyDetected:QuestionnaireReviewFinding[];noLongerDetected:QuestionnaireReviewFinding[];
  removedQuestions:{id:string;variable:string;number:number}[];
  targetFinding:'still_detected'|'no_longer_detected';targetQuestionDeleted:boolean;
};
/** Every comparison verifies both complete immutable sources and both receipts first. */
export async function compareQuestionnaireRevision(origin:QuestionnaireRepairOrigin,source:QuestionnaireVersion,sourceReview:QuestionnaireReviewRecord,target:QuestionnaireVersion,targetReview:QuestionnaireReviewRecord):Promise<QuestionnaireRevisionComparison> {
  const expected=parseQuestionnaireRepairOrigin(origin);
  if(!expected)throw Error('缺少修订来源，不能比较。');
  if(sourceReview.engine!==targetReview.engine||sourceReview.engine!==expected.engine)throw Error('检查引擎版本不同，不能自动比较；请保留各自的原始记录。');
  // All four verifiers snapshot synchronously before the first await.
  const [before,after,prior,next]=await Promise.all([
    verifyQuestionnaireVersion(source,{projectId:source.projectId,versionId:expected.sourceVersionId}),
    verifyQuestionnaireVersion(target,{projectId:source.projectId,versionId:target.id}),
    verifyQuestionnaireReviewReceipt(sourceReview,source),
    verifyQuestionnaireReviewReceipt(targetReview,target),
  ]);
  if(after.revision<=before.revision||after.repairOrigin==null||JSON.stringify(parseQuestionnaireRepairOrigin(after.repairOrigin))!==JSON.stringify(expected))throw Error('新版本未绑定这一修订来源，不能比较。');
  originMatchesRecord(expected,before,prior);
  const oldKeys=new Set(prior.result.findings.map(findingKey)),newKeys=new Set(next.result.findings.map(findingKey));
  const nextIds=new Set(after.content.questions.map(q=>q.id));
  return {
    sourceRevision:before.revision,targetRevision:after.revision,engine:prior.engine,
    stillDetected:next.result.findings.filter(f=>oldKeys.has(findingKey(f))),
    newlyDetected:next.result.findings.filter(f=>!oldKeys.has(findingKey(f))),
    noLongerDetected:prior.result.findings.filter(f=>!newKeys.has(findingKey(f))),
    removedQuestions:before.content.questions.flatMap((q,index)=>nextIds.has(q.id)?[]:[{id:q.id,variable:q.variable,number:index+1}]),
    targetFinding:newKeys.has(findingKey(expected))?'still_detected':'no_longer_detected',
    targetQuestionDeleted:expected.questionId!==null&&!nextIds.has(expected.questionId),
  };
}
