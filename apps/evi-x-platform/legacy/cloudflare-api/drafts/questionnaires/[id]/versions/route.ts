import {apiErrorResponse,noStoreJson} from '@/app/api/_lib/http';
import {assertEditorOrigin,editorOwner} from '@/app/api/_lib/editor-auth';
import {listQuestionnaireVersions,saveQuestionnaireVersion} from '@/db/questionnaire-repository';
import {QUESTIONNAIRE_LIBRARY_LIMITS} from '@/lib/questionnaire-library';
import {questionnaireId,readQuestionnaireSaveInput} from '../../_input';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
  try{assertEditorOrigin(request);const owner=await editorOwner(request),id=questionnaireId((await context.params).id);return noStoreJson({versions:await listQuestionnaireVersions(id,owner),limit:QUESTIONNAIRE_LIBRARY_LIMITS.versions,scope:owner,storage:'d1'});}
  catch(error){return apiErrorResponse(error);}
}
export async function POST(request:Request,context:Context){
  try{
    assertEditorOrigin(request);const owner=await editorOwner(request),projectId=questionnaireId((await context.params).id),input=await readQuestionnaireSaveInput(request,'append');
    const receipt=await saveQuestionnaireVersion({kind:'append',projectId,versionId:input.id,baseRevision:input.baseRevision,label:input.label,content:input.content,repairOrigin:input.repairOrigin},owner);
    return noStoreJson({...receipt,scope:owner,storage:'d1'},{status:receipt.replayed?200:201});
  }catch(error){return apiErrorResponse(error);}
}
