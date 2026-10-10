import { noStoreJson, readJsonObject, assertOnlyKeys } from '../../../_lib/http';
import { removeService } from '@/db/agent-service-repository';
import { agentContext, agentErrorResponse } from '../../_shared';
export async function DELETE(request: Request, {params}: {params: Promise<{id:string}>}) {
  try {
    const {owner}=await agentContext(request);
    const {id}=await params;
    const body=await readJsonObject(request,512);
    assertOnlyKeys(body,['expectedRevision']);
    await removeService(owner,id,body.expectedRevision as number);
    return noStoreJson({removed:true});
  } catch(error) { return agentErrorResponse(error); }
}
