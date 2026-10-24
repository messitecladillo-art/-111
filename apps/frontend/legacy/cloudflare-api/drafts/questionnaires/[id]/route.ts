import {apiErrorResponse,noStoreJson} from '@/app/api/_lib/http';
import {assertEditorOrigin,editorOwner} from '@/app/api/_lib/editor-auth';
import {readQuestionnaireProject} from '@/db/questionnaire-repository';
import {questionnaireId} from '../_input';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
  try{assertEditorOrigin(request);const owner=await editorOwner(request),id=questionnaireId((await context.params).id);return noStoreJson({...await readQuestionnaireProject(id,owner),scope:owner,storage:'d1'});}
  catch(error){return apiErrorResponse(error);}
}
