/** Shared record verification, with no repository imports and no recursive origin traversal. */
import {ApiError} from '../app/api/_lib/http';
import {sha256Hex} from '../app/api/_lib/security';
import {parseQuestionnaireLibraryContent,type QuestionnaireVersion} from '../lib/questionnaire-library';
import {QUESTIONNAIRE_REVIEW_ENGINE,reviewQuestionnaire,parseQuestionnaireReviewReceipt,type QuestionnaireReviewRecord} from '../lib/questionnaire-review';

export const QUESTIONNAIRE_REVIEW_RESULT_BYTES=1_048_576;
export type QuestionnaireReviewRow={id:string;owner_hash:string;project_id:string;version_id:string;source_revision:number;source_sha256:string;engine_version:string;result_json:string;result_sha256:string;result_size:number;created_at:string};
export async function verifyStoredQuestionnaireReview(row:QuestionnaireReviewRow,source:QuestionnaireVersion,owner:string):Promise<QuestionnaireReviewRecord>{
  try{
    if(row.owner_hash!==owner||row.project_id!==source.projectId||row.version_id!==source.id||row.source_revision!==source.revision||row.source_sha256!==source.sha256||row.engine_version!==QUESTIONNAIRE_REVIEW_ENGINE)throw new Error('binding');
    const parsed=parseQuestionnaireLibraryContent(source.content);
    if(parsed.content.title!==source.title||parsed.size!==source.size||await sha256Hex(parsed.serialized)!==source.sha256)throw new Error('source');
    if(typeof row.result_json!=='string'||new TextEncoder().encode(row.result_json).length!==row.result_size||row.result_size<1||row.result_size>QUESTIONNAIRE_REVIEW_RESULT_BYTES||await sha256Hex(row.result_json)!==row.result_sha256)throw new Error('result');
    if(row.result_json!==JSON.stringify(reviewQuestionnaire(parsed.content)))throw new Error('reproduction');
    const record=parseQuestionnaireReviewReceipt({id:row.id,projectId:row.project_id,versionId:row.version_id,revision:row.source_revision,sourceSha256:row.source_sha256,engine:row.engine_version,createdAt:row.created_at,resultSha256:row.result_sha256,result:JSON.parse(row.result_json)},source);
    if(new Date(record.createdAt).toISOString()!==record.createdAt)throw new Error('date');
    return record;
  }catch{throw new ApiError(409,'questionnaire_review_integrity','检查记录与保存版本或当前引擎不一致，已停止读取；不能将其当作复核通过。');}
}
