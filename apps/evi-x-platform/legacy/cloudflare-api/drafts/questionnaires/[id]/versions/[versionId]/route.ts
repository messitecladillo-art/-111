import {apiErrorResponse,noStoreJson} from '@/app/api/_lib/http';
import {assertEditorOrigin,editorOwner} from '@/app/api/_lib/editor-auth';
import {readQuestionnaireVersion} from '@/db/questionnaire-repository';
import {questionnaireId} from '../../../_input';
type Context={params:Promise<{id:string;versionId:string}>};
export async function GET(request:Request,context:Context){
  try{assertEditorOrigin(request);const owner=await editorOwner(request),params=await context.params;return noStoreJson({...await readQuestionnaireVersion(questionnaireId(params.id),questionnaireId(params.versionId),owner),scope:owner,storage:'d1'});}
  catch(error){return apiErrorResponse(error);}
}
