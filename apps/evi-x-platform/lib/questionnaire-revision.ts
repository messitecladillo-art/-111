/** Revision intent and mechanical recheck differences, never human approval. */
import {DESIGN_LIMITS,type Questionnaire} from './questionnaire.ts';
import {parseQuestionnaireLibraryContent,parseQuestionnaireRepairOrigin,type QuestionnaireRepairOrigin,type QuestionnaireRepairOriginInput,type QuestionnaireVersion} from './questionnaire-library.ts';
import {verifyQuestionnaireVersion} from './questionnaire-version.ts';
import {verifyQuestionnaireReviewReceipt,type QuestionnaireReviewFinding,type QuestionnaireReviewRecord} from './questionnaire-review.ts';

export type QuestionnaireRevision = {content:Questionnaire;repairOrigin:QuestionnaireRepairOrigin|null};
export type QuestionnaireRevisionHistory = {past:QuestionnaireRevision[];present:QuestionnaireRevision;future:QuestionnaireRevision[]};
export function revisionSnapshot(content:Questionnaire,repairOrigin:QuestionnaireRepairOrigin|null=null):QuestionnaireRevision {
  return {content:parseQuestionnaireLibraryContent(content).content,repairOrigin:repairOrigin===null?null:parseQuestionnaireRepairOrigin(repairOrigin)};
}
export function initialRevisionHistory(content:Questionnaire):QuestionnaireRevisionHistory {
  return {past:[],present:revisionSnapshot(content),future:[]};
}
/** Omitted origin means ordinary edit; explicit null means unrelated replacement/copy. */
export function commitQuestionnaireRevision(history:QuestionnaireRevisionHistory,content:Questionnaire,repairOrigin:QuestionnaireRepairOrigin|null=history.present.repairOrigin):QuestionnaireRevisionHistory {
  return {past:[...history.past,history.present].slice(-DESIGN_LIMITS.history),present:revisionSnapshot(content,repairOrigin),future:[]};
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
