import { env } from 'cloudflare:workers';
import { ApiError, apiErrorResponse } from '../_lib/http';
import { AgentSessionError, agentOwner } from '@/lib/agent-session';
import { ServiceError, type MasterKey } from '@/lib/agent-services';
import { ProviderCallError, type ProviderAllowedBases } from '@/lib/agent-provider';
import { resolveAccountSession } from '@/db/agent-account-repository';
import { AuthError, hashEmail, stableAccountOwner, normalizeInvitedEmail } from '@/lib/agent-email-auth';
import { AgentMailError } from '@/lib/agent-mail';

type AgentEnv = { EVI_X_AGENT_MASTER_KEY?: string; EVI_X_AGENT_KEY_ID?: string; EVI_X_AGENT_ALLOWED_BASES?: string; EVI_X_AGENT_DEMO?:string; EVI_X_AGENT_INVITED_EMAILS?:string; EVI_X_AGENT_MAIL_API_KEY?:string; EVI_X_AGENT_MAIL_FROM?:string; DB?: D1Database };
export function agentDemo(request:Request):boolean {
  return (env as unknown as AgentEnv).EVI_X_AGENT_DEMO==='1'&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
}
export function agentInvitedEmails():string[]{
  const config=env as unknown as AgentEnv;
  let invited:unknown;
  try{invited=JSON.parse(config.EVI_X_AGENT_INVITED_EMAILS||'null');}catch{throw new ApiError(503,'agent_email_unavailable','邮箱登录配置暂不可用。');}
  if(!Array.isArray(invited)||!invited.length||invited.length>100||invited.some(value=>typeof value!=='string'))throw new ApiError(503,'agent_email_unavailable','邮箱登录配置暂不可用。');
  try{for(const email of invited)normalizeInvitedEmail(email,invited);}catch{throw new ApiError(503,'agent_email_unavailable','邮箱登录配置暂不可用。');}
  return invited as string[];
}
export function agentMailSettings(){
  const config=env as unknown as AgentEnv;
  const invited=agentInvitedEmails();
  if(!config.EVI_X_AGENT_MAIL_API_KEY||!config.EVI_X_AGENT_MAIL_FROM)throw new ApiError(503,'agent_email_unavailable','邮箱登录尚未启用，请联系网站管理员。');
  return{apiKey:config.EVI_X_AGENT_MAIL_API_KEY,from:config.EVI_X_AGENT_MAIL_FROM,invited};
}
export function agentSettings(): {master: MasterKey; allowedBases: ProviderAllowedBases} {
  const config=env as unknown as AgentEnv;
  const hex=config.EVI_X_AGENT_MASTER_KEY || '';
  const keyId=config.EVI_X_AGENT_KEY_ID || 'v1';
  if(!/^[0-9a-f]{64}$/i.test(hex) || !/^[a-zA-Z0-9_-]{1,32}$/.test(keyId)) throw new ApiError(503,'agent_not_configured','服务接入尚未启用，请联系网站管理员。');
  const key=Uint8Array.from(hex.match(/../g)!,v=>parseInt(v,16));
  if(new Set(key).size<16) throw new ApiError(503,'agent_not_configured','服务接入尚未启用，请联系网站管理员。');
  if(!config.DB) throw new ApiError(503,'agent_storage_unavailable','服务配置存储尚未连接。');
  let allowedBases: ProviderAllowedBases = {};
  if(config.EVI_X_AGENT_ALLOWED_BASES) {
    try {
      const bases: unknown=JSON.parse(config.EVI_X_AGENT_ALLOWED_BASES);
      if(!Array.isArray(bases) || bases.length>10 || bases.some(v=>typeof v!=='string'||v.length>256)) throw new Error();
      allowedBases={compatible:bases};
    } catch { throw new ApiError(503,'agent_allowlist_invalid','服务接入名单配置无效，请联系网站管理员。'); }
  }
  return {master:{keyId,key},allowedBases};
}
export async function agentContext(request: Request) {
  const settings=agentSettings();
  const sessionOwner=await agentOwner(request,settings.master.key);
  if(agentDemo(request))return {...settings,owner:sessionOwner,sessionOwner,identityMode:'local_demo' as const};
  const owner=await resolveAccountSession(sessionOwner);
  if(!owner)throw new ApiError(401,'agent_email_login_required','请使用受邀邮箱登录。');
  const invitations=agentInvitedEmails();
  const allowedOwners=await Promise.all(invitations.map(async email=>stableAccountOwner(await hashEmail(normalizeInvitedEmail(email,invitations)))));
  if(!allowedOwners.includes(owner))throw new ApiError(403,'agent_account_not_invited','此账号的内测访问权限已停用。');
  return { ...settings,owner,sessionOwner,identityMode:'email_account' as const };
}
export function agentErrorResponse(error: unknown): Response {
  if(error instanceof ProviderCallError) return apiErrorResponse(new ApiError(400,error.code,error.message));
  if(error instanceof AgentMailError)return apiErrorResponse(new ApiError(503,'agent_mail_failed',error.message));
  if(error instanceof AuthError)return apiErrorResponse(new ApiError(error.status,error.code,error.message));
  if(error instanceof AgentSessionError || error instanceof ServiceError) return apiErrorResponse(new ApiError(error.status,error.code,error.message));
  return apiErrorResponse(error);
}
