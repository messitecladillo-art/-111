import {apiErrorResponse,noStoreJson} from '@/app/api/_lib/http';
import {assertEditorOrigin,editorOwner} from '@/app/api/_lib/editor-auth';
import {listQuestionnaireProjects,saveQuestionnaireVersion} from '@/db/questionnaire-repository';
import {QUESTIONNAIRE_LIBRARY_LIMITS} from '@/lib/questionnaire-library';
import {readQuestionnaireSaveInput} from './_input';
export async function GET(request:Request){
  try{assertEditorOrigin(request);const owner=await editorOwner(request);return noStoreJson({projects:await listQuestionnaireProjects(owner),limits:QUESTIONNAIRE_LIBRARY_LIMITS,scope:owner,storage:'d1'});}
  catch(error){return apiErrorResponse(error);}
}
export async function POST(request:Request){
  try{
    assertEditorOrigin(request);const owner=await editorOwner(request),input=await readQuestionnaireSaveInput(request,'create');
    const receipt=await saveQuestionnaireVersion({kind:'create',projectId:input.id,versionId:input.versionId,baseRevision:0,label:input.label,content:input.content},owner);
    return noStoreJson({...receipt,scope:owner,storage:'d1'},{status:receipt.replayed?200:201});
  }catch(error){return apiErrorResponse(error);}
}
