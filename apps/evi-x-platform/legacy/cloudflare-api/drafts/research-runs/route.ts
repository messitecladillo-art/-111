import { apiErrorResponse, assertOnlyKeys, noStoreJson, readJsonObject, ApiError } from '../../_lib/http';
import { assertEditorOrigin, editorOwner } from '../../_lib/editor-auth';
import { validateProjectId } from '../../_lib/security';
import { createResearchRun, listResearchRuns } from '@/db/research-repository';
import { parseEvidence } from '@/lib/research-flow';
export async function GET(request:Request) {
  try { const owner=await editorOwner(request);return noStoreJson({runs:await listResearchRuns(owner),scope:owner}); }catch(e){return apiErrorResponse(e);}
}
export async function POST(request:Request) {
  try {
    assertEditorOrigin(request);const owner=await editorOwner(request);
    const body=await readJsonObject(request,96000);assertOnlyKeys(body,['id','draftId','baseRevision','input','consent']);
    if(body.consent!==true)throw new ApiError(400,'consent_required','请先确认保存所选汇总，不上传原始答卷。');
    if(!Number.isSafeInteger(body.baseRevision)||(body.baseRevision as number)<1)throw new ApiError(400,'invalid_revision','目标版本无效。');
    let input;try{input=parseEvidence(body.input);}catch(e){throw new ApiError(400,'invalid_evidence',(e as Error).message);}
    const run=await createResearchRun(validateProjectId(String(body.id)),owner,validateProjectId(String(body.draftId)),body.baseRevision as number,input);
    return noStoreJson({run},{status:201});
  }catch(e){return apiErrorResponse(e);}
}
