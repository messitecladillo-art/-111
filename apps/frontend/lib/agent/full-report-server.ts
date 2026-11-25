import { ApiError, apiErrorResponse, readJsonObject } from '../../app/api/_lib/http.ts';
import { rejectDuplicateMembers } from '../questionnaire.ts';
import { digestText, parseResultSnapshot, resultPayload, type ResultSnapshot } from '../research-quality.ts';
import { serializeDatasetForAutonomousSandbox } from './autonomous-agent.ts';
import { fullReportInputRevision, parseFullReportRequest } from './full-report-request.ts';
import { FullReportInputError, FullReportProviderError, generateFullReportWithAgent, validateFullReportBase, type FullReportPack, type FullReportSectionGenerator, type ReportEvidenceGap } from './full-report-pipeline.ts';

type Options={apiOrigin?:string;fetcher?:typeof fetch;generate?:typeof generateFullReportWithAgent;enableEvidenceGapSupplement?:boolean};
export async function reportSectionCallId(runId:string,nodeId:string,purpose:string,attempt:number):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['report-section/v1',runId,nodeId,purpose,attempt])))).slice(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function backendOrigin(value:string):string{
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Invalid operator backend origin');
  return url.origin;
}
async function boundedJson(response:Response,maxBytes=150_000):Promise<Record<string,unknown>>{
  const reader=response.body?.getReader();let raw='',bytes=0;const decoder=new TextDecoder('utf-8',{fatal:true});
  try{if(reader)while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxBytes)throw Error('Bounded receipt');raw+=decoder.decode(next.value,{stream:true});}raw+=decoder.decode();const value=JSON.parse(raw);rejectDuplicateMembers(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
  catch{void reader?.cancel().catch(()=>{});throw new ApiError(502,'invalid_server_receipt','未收到可核对的模型服务回执，请核对已发出的调用。');}
  finally{reader?.releaseLock();}
}
async function normalizeAutonomousSnapshots(rawResults:unknown,mode:'empirical'|'demonstration',datasetHash:string,fallbackSource:string):Promise<ResultSnapshot[]>{
  if(!Array.isArray(rawResults)||!datasetHash)return [];
  const classification:ResultSnapshot['classification']=mode==='empirical'?'user_provided':'simulated';
  const out:ResultSnapshot[]=[];
  const seen=new Set<string>();
  for(const item of rawResults){
    if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const rec=item as Record<string,unknown>;
    const id=typeof rec.id==='string'?rec.id.trim().slice(0,80):'';
    const method=typeof rec.method==='string'?rec.method.trim().slice(0,80):'autonomous-isa';
    const title=typeof rec.title==='string'?rec.title.trim().slice(0,150):'';
    const rawHeaders=Array.isArray(rec.headers)?rec.headers.slice(0,30).map((h,i)=>String(h??'').trim().slice(0,160)||`指标${i+1}`):[];
    if(!id||seen.has(id)||!title||rawHeaders.length===0)continue;
    const total=typeof rec.total==='number'&&Number.isFinite(rec.total)?Math.max(0,Math.min(5000,Math.round(rec.total))):typeof rec.n==='number'&&Number.isFinite(rec.n)?Math.max(0,Math.min(5000,Math.round(rec.n))):0;
    const n=typeof rec.n==='number'&&Number.isFinite(rec.n)?Math.max(0,Math.min(total,Math.round(rec.n))):total;
    const rows=Array.isArray(rec.rows)?rec.rows.slice(0,400).map(row=>{
      const cells=Array.isArray(row)?row:[];
      return rawHeaders.map((_,ci)=>{
        const cell=cells[ci];
        if(cell===null||cell===undefined)return null;
        if(typeof cell==='number')return Number.isFinite(cell)?cell:null;
        return String(cell).slice(0,1900);
      });
    }):[];
    const metrics=Array.isArray(rec.metrics)?rec.metrics.slice(0,150).map(m=>{
      const mObj=m&&typeof m==='object'&&!Array.isArray(m)?(m as Record<string,unknown>):{};
      const val=typeof mObj.value==='number'&&Number.isFinite(mObj.value)?mObj.value:null;
      return {label:String(mObj.label??'').trim().slice(0,160)||'指标',value:val};
    }):[];
    const warnings=Array.isArray(rec.warnings)?rec.warnings.slice(0,30).map(w=>String(w??'').slice(0,1000)):[];
    const variables=Array.isArray(rec.variables)?rec.variables.filter((v):v is string=>typeof v==='string'&&v.trim().length>0).slice(0,4).map(v=>v.trim().slice(0,160)):undefined;
    try{
      const draft=parseResultSnapshot({
        id,
        title,
        sourceName:(typeof rec.sourceName==='string'&&rec.sourceName.trim()?rec.sourceName.trim():fallbackSource).slice(0,240),
        sourceUrl:'',
        sourceHash:datasetHash,
        resultHash:'0'.repeat(64),
        classification,
        method,
        n,
        total,
        headers:rawHeaders,
        rows,
        metrics,
        warnings,
        ...(variables?.length?{variables}:{}),
      });
      const signed:ResultSnapshot={...draft,resultHash:await digestText(JSON.stringify(resultPayload(draft)))};
      seen.add(signed.id);
      out.push(signed);
    }catch{continue;}
  }
  return out;
}
function safeCode(value:unknown):string{return typeof value==='string'&&/^[a-z0-9_]{1,80}$/.test(value)?value:'request_failed';}
function providerCode(value:unknown,status?:number):string{
  const code=safeCode(value);
  const aliases:Record<string,string>={authentication_failed:'provider_auth',rate_limited:'provider_rate_limit',insufficient_quota:'provider_quota',session_required:'unauthorized',permission_denied:'forbidden',revision_conflict:'service_version_conflict',invalid_response:'invalid_provider_response',response_too_large:'invalid_provider_response'};
  if(code==='not_found'||code==='capability_unavailable'||status===404)return 'model_service_unavailable';
  if(status===422)return 'invalid_report_input';
  return aliases[code]??code;
}
function refusalMessage(status:number):string{
  if(status===401)return '请登录后再生成候选稿。';
  if(status===403)return '本轮权限或安全校验未通过，请重新核对登录和项目权限。';
  if(status===409)return '项目或模型服务版本已变化，请重新确认生成计划。';
  if(status===429)return '本轮调用已达到限制，请核对已有回执后再操作。';
  return '模型服务未接受本轮生成计划，请核对项目资料和模型设置。';
}
/** Receives only a selected service/version; provider keys stay in the backend vault. */
export function createFullReportHandler(options:Options={}){
  return async function POST(request:Request):Promise<Response>{
    try{
      let input;
      try{input=parseFullReportRequest(await readJsonObject(request,8*1024*1024,rejectDuplicateMembers));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(422,'invalid_report_input','报告输入无效，请核对当前项目、资料和模型服务。');}
      if(input.inputRevision!==await fullReportInputRevision(input))throw new ApiError(409,'input_revision_changed','确认后项目输入已变化，请基于最新资料重新生成。');
      const project={projectId:input.projectId??'local',runId:input.runId,inputRevision:input.inputRevision};
      try{await validateFullReportBase(input.base,input.mode,project);}catch(error){if(error instanceof FullReportInputError)throw new ApiError(422,error.code,error.message);throw error;}
      const origin=backendOrigin(options.apiOrigin??process.env.EVIX_API_ORIGIN??'http://127.0.0.1:8180');
      const fetcher=options.fetcher??fetch,headers=new Headers({'content-type':'application/json'});
      for(const key of ['cookie','origin','x-csrf-token','sec-fetch-site']){const value=request.headers.get(key);if(value)headers.set(key,value);}
      const context={schemaVersion:1,runId:input.runId,projectId:input.projectId,inputRevision:input.inputRevision,serviceId:input.serviceId,serviceRevision:input.serviceRevision,consent:true,mode:input.mode};
      const upstream=async(path:string,body:unknown,signal:AbortSignal,maxBytes=150_000)=>{
        let response:Response;
        try{response=await fetcher(origin+path,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(100_000)])});}
        catch{throw new ApiError(502,'network_outcome_unknown','连接未完成，已发出的调用结果仍需核对。');}
        const value=await boundedJson(response,maxBytes);
        if(!response.ok){const error=value.error as {code?:unknown}|undefined;throw new ApiError(response.status,safeCode(error?.code),refusalMessage(response.status));}
        return value;
      };
      const preflight=await upstream('/api/agent/report-sections/preflight',context,request.signal);
      if(Object.entries(context).some(([key,value])=>preflight[key]!==value)||preflight.status!=='authorized'||typeof preflight.provider!=='string'||typeof preflight.model!=='string'||!['live','fixture'].includes(preflight.providerMode as string)||!Number.isInteger(preflight.maxConcurrency)||(preflight.maxConcurrency as number)<1||(preflight.maxConcurrency as number)>6)throw new ApiError(502,'invalid_server_receipt','模型服务预检回执与本轮项目或配置不一致。');
      const abort=new AbortController(),signal=AbortSignal.any([request.signal,abort.signal]);
      let send:(value:Record<string,unknown>)=>void=()=>{};
      const sectionGenerator:FullReportSectionGenerator=async section=>{
        signal.throwIfAborted();
        const id=await reportSectionCallId(input.runId,section.nodeId,section.purpose,section.attempt);
        send({type:'receipt',id,nodeId:section.nodeId,status:'dispatched'});
        let receipt:Record<string,unknown>;
        try{receipt=await upstream('/api/agent/report-sections',{...context,idempotencyKey:id,nodeId:section.nodeId,prompt:section.prompt,wave:section.wave,attempt:section.attempt,purpose:section.purpose},section.signal?AbortSignal.any([signal,section.signal]):signal);}
        catch(error){send({type:'receipt',id,nodeId:section.nodeId,status:'outcome_unknown'});if(signal.aborted)throw signal.reason;throw new FullReportProviderError(error instanceof ApiError?providerCode(error.code,error.status):'network_outcome_unknown',{unknown:!(error instanceof ApiError)||error.status>=500||error.status===408,status:error instanceof ApiError?error.status:undefined});}
        if(receipt.id!==id||['schemaVersion','runId','projectId','inputRevision','serviceId','serviceRevision','mode'].some(key=>receipt[key]!==context[key as keyof typeof context])||receipt.nodeId!==section.nodeId||receipt.wave!==section.wave||receipt.purpose!==section.purpose||receipt.attempt!==section.attempt||!['running','ready','failed','outcome_unknown'].includes(receipt.status as string))throw new FullReportProviderError('invalid_server_receipt',{unknown:true});
        send({type:'receipt',id,nodeId:section.nodeId,status:receipt.status});
        if(receipt.status!=='ready'||typeof receipt.content!=='string')throw new FullReportProviderError(providerCode(receipt.errorCode),{unknown:receipt.status==='outcome_unknown'||receipt.status==='running'});
        const usage=receipt.usage as {inputTokens?:unknown;outputTokens?:unknown}|null;
        const valid=!!usage&&Number.isSafeInteger(usage.inputTokens)&&Number.isSafeInteger(usage.outputTokens)&&(usage.inputTokens as number)>=0&&(usage.outputTokens as number)>=0;
        return {content:receipt.content,...(valid?{usage:{prompt:usage!.inputTokens as number,completion:usage!.outputTokens as number,total:(usage!.inputTokens as number)+(usage!.outputTokens as number)}}:{})};
      };
      const canSupplementGaps=
        options.enableEvidenceGapSupplement!==false&&
        Boolean(input.projectId&&!/^(?:local|demo)/i.test(input.projectId))&&
        (input.mode==='empirical'||input.mode==='demonstration')&&
        (input.base?.dataset?.table.rows.length??0)>=10&&
        (input.base?.design?.questions.length??0)>0;
      const onEvidenceGap=canSupplementGaps
        ? async (gaps:readonly ReportEvidenceGap[],pack:FullReportPack):Promise<readonly ResultSnapshot[]>=>{
            signal.throwIfAborted();
            send({type:'evidence_gap',phase:'gap_detected',count:gaps.length,gaps:gaps.slice(0,8).map(g=>({id:g.id,nodeId:g.nodeId,kind:g.kind,severity:g.severity,description:g.description,recommendedOperator:g.recommendedOperator}))});
            const datasetHash=pack.dataset?.sourceHash??'';
            const serialized=serializeDatasetForAutonomousSandbox(pack.design,pack.dataset);
            const hasSubstantiveVars=Boolean(serialized?.questions.some(q=>q.type!=='text'));
            if(!datasetHash||!serialized||serialized.rows.length<10||!hasSubstantiveVars){
              send({type:'evidence_gap',phase:'gap_skipped'});
              return [];
            }
            const supplementMode=input.mode==='empirical'?'empirical':'demonstration';
            try{
              const idempotencyKey=await reportSectionCallId(input.runId,'evidence_gap','supplement',1);
              const gapTopics=gaps.slice(0,4).map(g=>g.description||g.recommendedOperator).filter(Boolean).join('；')||'关键模型与子群差异';
              const goal=`补齐报告实证缺口（${gapTopics}）`.slice(0,380);
              const autoRes=await upstream(
                `/api/projects/${encodeURIComponent(input.projectId!)}/autonomous-runs`,
                {
                  idempotencyKey,
                  goal,
                  geography:'',
                  datasetMode:'inline_dataset',
                  leaseMode:'pi_autonomous',
                  maxToolCalls:12,
                  serviceId:input.serviceId,
                  serviceRevision:input.serviceRevision,
                  inlineDataset:{
                    title:serialized.title.slice(0,150),
                    classification:supplementMode==='empirical'?'actual':'simulated',
                    questions:serialized.questions,
                    rows:serialized.rows,
                  },
                },
                signal,
                1_500_000,
              );
              signal.throwIfAborted();
              const supplemented=await normalizeAutonomousSnapshots(
                autoRes.registeredResults,
                supplementMode,
                datasetHash,
                serialized.title||input.topic||'工作区调查数据',
              );
              send({
                type:'evidence_gap',
                phase:'gap_supplemented',
                count:supplemented.length,
                autonomousRunId:typeof autoRes.runId==='string'?autoRes.runId:'',
              });
              return supplemented;
            }catch(error){
              if(signal.aborted)throw error;
              send({type:'evidence_gap',phase:'gap_skipped'});
              return [];
            }
          }
        : undefined;
      const run=async()=>{
        const result=await (options.generate??generateFullReportWithAgent)({topic:input.topic,mode:input.mode,base:input.base,sectionNodes:input.sectionNodes,steeringNotes:input.steeringNotes,project,signal,concurrency:Math.min(input.concurrency??3,typeof preflight.maxConcurrency==='number'?Math.max(1,preflight.maxConcurrency):3),sectionGenerator,...(onEvidenceGap?{onEvidenceGap}:{}),onProgress:event=>{if(event.phase==='done')return;send({type:event.phase==='contract'?'init':event.phase==='repair'?'repair':'section',...event});}});
        signal.throwIfAborted();
        if(preflight.providerMode==='fixture'){
          result.quality.checks.push({id:'provider_fixture',label:'模型服务模式',status:'warning',detail:'本轮使用合成服务回执，仅用于验证流程，未完成真实模型生成验收。'});
          result.quality.blockers.push('模型服务使用合成回执，正文仍需复核。');
          if(result.quality.status==='draft')result.quality.status='needs_review';
        }
        return result;
      };
      if(!input.stream)return Response.json({ok:true,...await run()},{headers:{'cache-control':'no-store'}});
      const encoder=new TextEncoder();let closed=false;
      const stream=new ReadableStream<Uint8Array>({
        start(controller){
          send=value=>{if(!closed&&!signal.aborted)controller.enqueue(encoder.encode(JSON.stringify({...value,runId:input.runId})+'\n'));};
          void run().then(result=>send({type:'done',ok:true,...result})).catch(()=>{if(!closed&&!signal.aborted)send({type:'error',code:'outcome_unknown'});}).finally(()=>{if(!closed){closed=true;controller.close();}});
        },
        cancel(){closed=true;abort.abort(new DOMException('Cancelled','AbortError'));},
      });
      return new Response(stream,{headers:{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store, no-transform'}});
    }catch(error){return apiErrorResponse(error);}
  };
}
