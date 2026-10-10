import { noStoreJson } from '../../_lib/http';
import { agentCookie, newAgentSession, agentOwner, assertAgentOrigin } from '@/lib/agent-session';
import { agentContext, agentDemo, agentErrorResponse, agentSettings, agentMailSettings } from '../_shared';
import { revokeAccountSession } from '@/db/agent-account-repository';
export async function GET(request: Request) {
  try {
    assertAgentOrigin(request,false);
    const settings=agentSettings();
    let connected=false;
    try { await agentContext(request); connected=true; } catch { /* No identity or expired session. */ }
    let emailAvailable=false;try{agentMailSettings();emailAvailable=true;}catch{ /* Operator mail setup still required. */ }
    return noStoreJson({configured:true,connected,identityMode:agentDemo(request)?'local_demo':'email_account',emailAvailable,capabilities:['questionnaire','research','report','defense'],executableCapabilities:['questionnaire'],allowedCompatibleBases:settings.allowedBases.compatible||[]});
  } catch(error) { return agentErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertAgentOrigin(request);
    const settings=agentSettings();
    if(!agentDemo(request))return noStoreJson({error:{code:'agent_email_login_required',message:'请通过受邀邮箱验证码登录。'}},{status:401});
    // Do not silently replace a live session and strand its stored credentials.
    try { await agentOwner(request,settings.master.key); return noStoreJson({connected:true,identityMode:'private_session'}); } catch { /* First or expired connection. */ }
    const token=await newAgentSession(settings.master.key);
    return noStoreJson({connected:true,identityMode:'private_session'},{headers:{'set-cookie':agentCookie(request,token)}});
  } catch(error) { return agentErrorResponse(error); }
}
export async function DELETE(request:Request){
  try{
    const context=await agentContext(request);
    if(!agentDemo(request))await revokeAccountSession(context.sessionOwner);
    return noStoreJson({signedOut:true},{headers:{'set-cookie':`evix_agent_session=; HttpOnly; SameSite=Strict; Path=/api/agent; Max-Age=0${new URL(request.url).protocol==='https:'?'; Secure':''}`}});
  }catch(error){return agentErrorResponse(error);}
}
