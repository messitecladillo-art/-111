import {ApiError,assertOnlyKeys,readJsonObject} from '@/app/api/_lib/http';
import {validateProjectId} from '@/app/api/_lib/security';
import {QUESTIONNAIRE_LIBRARY_LIMITS,parseQuestionnaireLibraryContent,parseQuestionnaireBaseRevision,parseQuestionnaireVersionLabel,parseQuestionnaireRepairOriginInput} from '@/lib/questionnaire-library';
import {rejectDuplicateMembers} from '@/lib/questionnaire';

export function questionnaireId(value:unknown):string {
  if(typeof value!=='string')throw new ApiError(400,'invalid_questionnaire_id','问卷或版本 ID 格式无效。');
  return validateProjectId(value).toLowerCase();
}
export async function readQuestionnaireSaveInput(request:Request,kind:'create'|'append') {
  // Inspect exact text only after the shared bounded read succeeds. Avoid an extra
  // pipeline and duplicate chunk buffers before shared header/body validation.
  const body=await readJsonObject(request,QUESTIONNAIRE_LIBRARY_LIMITS.bytes+4096,raw=>{
    try{rejectDuplicateMembers(raw);}catch(error){throw new ApiError(400,'invalid_json',error instanceof Error?error.message:'问卷请求 JSON 无效。');}
  });
  assertOnlyKeys(body,kind==='create'?['id','versionId','label','content','consent']:['id','baseRevision','label','content','consent','repairOrigin']);
  if(body.consent!==true)throw new ApiError(400,'questionnaire_consent_required','请先确认已检查题目与备注中的隐私信息，再明确同意保存问卷设计。');
  const id=questionnaireId(body.id),versionId=kind==='create'?questionnaireId(body.versionId):id;
  try {
    return {id,versionId,label:parseQuestionnaireVersionLabel(body.label),content:parseQuestionnaireLibraryContent(body.content).content,baseRevision:kind==='create'?0:parseQuestionnaireBaseRevision(body.baseRevision),repairOrigin:kind==='append'?parseQuestionnaireRepairOriginInput(body.repairOrigin):null};
  }catch(error){throw new ApiError(400,'invalid_questionnaire',error instanceof Error?error.message:'问卷设计格式无效。');}
}
