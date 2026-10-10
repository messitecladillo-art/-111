import { ApiError, assertOnlyKeys, readJsonObject, noStoreJson } from '../../../../_lib/http';
import { readService, recordServiceUsage } from '@/db/agent-service-repository';
import { reserveAgentCall, finishAgentCall } from '@/db/agent-run-repository';
import { serviceId, serviceRevision } from '@/lib/agent-services';
import { callAgentProvider } from '@/lib/agent-provider';
import { questionnaireAgentPrompt } from '@/lib/agent-questionnaire-proposal';
import { agentContext, agentErrorResponse } from '../../../_shared';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {owner,master,allowedBases}=await agentContext(request);
    const {id}=await params;
    const input=await readJsonObject(request,20000);
    assertOnlyKeys(input,['callId','serviceRevision','kind','brief','confirmSharing']);
    const callId=serviceId(input.callId), revision=serviceRevision(input.serviceRevision);
    if(input.kind!=='test'&&input.kind!=='questionnaire')throw new ApiError(400,'agent_capability_unavailable','此能力尚未开放执行。');
    if(input.kind==='questionnaire'&&(input.confirmSharing!==true||typeof input.brief!=='string'||!input.brief.trim()||input.brief.length>4000))throw new ApiError(400,'agent_sharing_required','请确认发送不超过4000字的研究需求。');
    if(input.kind==='test'&&(input.brief!==undefined||input.confirmSharing!==undefined))throw new ApiError(400,'agent_test_input_invalid','连接测试不接收研究材料。');
    const stored=await readService(owner,serviceId(id),master);
    if(stored.config.revision!==revision)throw new ApiError(409,'agent_service_changed','服务配置已更新，请刷新后确认。');
    if(input.kind==='questionnaire'&&!stored.config.capabilities.includes('questionnaire'))throw new ApiError(403,'agent_capability_forbidden','此服务没有绑定问卷设计。');
    await reserveAgentCall(owner,callId,id,revision,input.kind);
    const started=Date.now();
    const result=await callAgentProvider(stored.config,stored.apiKey,input.kind==='test'?{kind:'test'}:{kind:'questionnaire',prompt:questionnaireAgentPrompt(input.brief as string),maxOutputTokens:stored.config.maxOutputTokens},{allowedBases});
    const uncertain=!result.ok&&['timeout','network_failed','response_too_large','invalid_response'].includes(result.error.code);
    await finishAgentCall(owner,callId,result.ok?'succeeded':uncertain?'unknown':'failed');
    let auditWarning=false;
    if(input.kind==='questionnaire'&&!uncertain) {
      try { await recordServiceUsage(owner,{id:callId,serviceId:id,serviceRevision:revision,capability:'questionnaire',status:result.ok?'succeeded':'failed',durationMs:Math.min(120000,Date.now()-started),...(result.ok&&result.kind==='questionnaire'&&result.usage?{inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens}:{}),...(!result.ok?{errorCode:result.error.code}:{})}); }
      catch { auditWarning=true; }
    }
    return noStoreJson({callId,serviceId:id,serviceRevision:revision,model:stored.config.model,result,auditWarning},{status:result.ok?200:502});
  }catch(error){return agentErrorResponse(error);}
}
