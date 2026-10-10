import { assertOnlyKeys, noStoreJson, readJsonObject } from '../../../_lib/http';
import { assertAgentOrigin } from '@/lib/agent-session';
import { AuthError, normalizeInvitedEmail, generateEmailCode, hashEmail, hashChallenge } from '@/lib/agent-email-auth';
import { reserveEmailChallenge, markChallengeDelivered } from '@/db/agent-account-repository';
import { sendAgentLoginCode } from '@/lib/agent-mail';
import { agentMailSettings, agentSettings, agentErrorResponse } from '../../_shared';
export async function POST(request:Request){
  try{
    assertAgentOrigin(request);const {master}=agentSettings();const mail=agentMailSettings();
    const body=await readJsonObject(request,512);assertOnlyKeys(body,['email']);
    let email:string;
    try{email=normalizeInvitedEmail(body.email,mail.invited);}catch(error){if(error instanceof AuthError)return noStoreJson({requested:true,message:'如该邮箱已受邀，验证码会发送到邮箱。'});throw error;}
    const emailHash=await hashEmail(email),id=crypto.randomUUID(),code=generateEmailCode();
    await reserveEmailChallenge(emailHash,id,await hashChallenge(emailHash,id,code,master.key));
    await sendAgentLoginCode({apiKey:mail.apiKey,from:mail.from,email,code,challengeId:id});
    await markChallengeDelivered(emailHash,id);
    return noStoreJson({requested:true,message:'如该邮箱已受邀，验证码会发送到邮箱。'});
  }catch(error){return agentErrorResponse(error);}
}
