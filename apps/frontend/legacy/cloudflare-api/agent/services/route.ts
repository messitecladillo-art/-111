import { noStoreJson, readJsonObject, assertOnlyKeys } from '../../_lib/http';
import { listServices, saveService } from '@/db/agent-service-repository';
import { parseServiceInput } from '@/lib/agent-services';
import { validateProviderBase } from '@/lib/agent-provider';
import { agentContext, agentErrorResponse } from '../_shared';
export async function GET(request: Request) {
  try { const {owner}=await agentContext(request); return noStoreJson({services:await listServices(owner)}); }
  catch(error) { return agentErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const {owner,master,allowedBases}=await agentContext(request);
    const body=await readJsonObject(request,10000);
    assertOnlyKeys(body,['service','expectedRevision']);
    const service=parseServiceInput(body.service);
    validateProviderBase(service,allowedBases);
    return noStoreJson({service:await saveService(owner,service,body.expectedRevision as number,master)});
  } catch(error) { return agentErrorResponse(error); }
}
