import { ApiError, assertOnlyKeys, noStoreJson, readJsonObject } from '../../../_lib/http';
import { assertAgentOrigin, newAgentSession, agentCookie, agentOwner } from '@/lib/agent-session';
import { normalizeInvitedEmail, hashEmail, hashChallenge } from '@/lib/agent-email-auth';
import { getEmailChallenge, verifyEmailChallenge, bindAccountSession } from '@/db/agent-account-repository';
import { agentMailSettings, agentSettings, agentErrorResponse } from '../../_shared';
export async function POST(request:Request){
  try{
    assertAgentOrigin(request);const {master}=agentSettings();const mail=agentMailSettings();
    const body=await readJsonObject(request,600);assertOnlyKeys(body,['email','code']);
    const email=normalizeInvitedEmail(body.email,mail.invited);
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw new ApiError(400,'agent_code_invalid','验证码无效或已过期。');
    const hash=await hashEmail(email),challenge=await getEmailChallenge(hash);
    if(!challenge)throw new ApiError(400,'agent_code_invalid','验证码无效或已过期。');
    const verified=await verifyEmailChallenge(hash,challenge.id,await hashChallenge(hash,challenge.id,body.code,master.key),Date.now());
    const token=await newAgentSession(master.key);
    const sessionRequest=new Request(request.url,{method:'POST',headers:{origin:new URL(request.url).origin,cookie:`evix_agent_session=${token}`}});
    const sessionOwner=await agentOwner(sessionRequest,master.key);
    await bindAccountSession(sessionOwner,verified.accountOwner,Date.now()+30*86400000);
    return noStoreJson({connected:true,identityMode:'email_account'},{headers:{'set-cookie':agentCookie(request,token)}});
  }catch(error){return agentErrorResponse(error);}
}
