import { apiErrorResponse, assertOnlyKeys, noStoreJson, readJsonObject, ApiError } from '../../../_lib/http';
import { assertEditorOrigin, editorOwner } from '../../../_lib/editor-auth';
import { validateProjectId } from '../../../_lib/security';
import { decideResearchRun, readResearchRun } from '@/db/research-repository';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{return noStoreJson({run:await readResearchRun(validateProjectId((await context.params).id),await editorOwner(request))});}catch(e){return apiErrorResponse(e);}}
export async function POST(request:Request,context:Context){
  try{
    assertEditorOrigin(request);const owner=await editorOwner(request),id=validateProjectId((await context.params).id);
    const body=await readJsonObject(request,1000);assertOnlyKeys(body,['action','proposalHash']);
    if(!['accept','cancel'].includes(String(body.action))||typeof body.proposalHash!=='string'||!/^[a-f0-9]{64}$/.test(body.proposalHash))throw new ApiError(400,'invalid_decision','决定或提案指纹无效。');
    return noStoreJson({run:await decideResearchRun(id,owner,body.action as 'accept'|'cancel',body.proposalHash)});
  }catch(e){return apiErrorResponse(e);}
}
