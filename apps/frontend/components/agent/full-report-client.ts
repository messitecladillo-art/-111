'use client';

import { parseEditorContent } from '../../lib/editor-model.ts';
import type { FullReportRequest } from '../../lib/agent/full-report-request.ts';
import type { FullReportGenerationResult, FullReportProgressEvent } from '../../lib/agent/full-report-pipeline.ts';
import { HostedApiError } from '../hosted/api-client.ts';

export type ReportReceiptEvent={type:'receipt';runId:string;id:string;nodeId:string;status:string};
export type ReportStreamEvent=(FullReportProgressEvent&{type:'init'|'section'|'repair';runId:string})|ReportReceiptEvent;
export function fullReportFailureStatus(error:unknown):'refused'|'unknown'{return error instanceof HostedApiError&&error.status>=400&&error.status<500?'refused':'unknown';}

/** A partial stream or a receipt for another project cannot become a completed candidate. */
export async function requestFullReport(input:FullReportRequest,options:{csrfToken:string;signal:AbortSignal;onEvent:(event:ReportStreamEvent)=>void}):Promise<FullReportGenerationResult>{
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(15*60*1000)]);
  const response=await fetch('/api/agent/full-report',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-csrf-token':options.csrfToken},body:JSON.stringify({...input,stream:true}),signal});
  if(!response.ok){const value=await response.json().catch(()=>({}));throw new HostedApiError(response.status,typeof value.error?.code==='string'?value.error.code:'request_failed',typeof value.error?.message==='string'?value.error.message:'报告任务未启动，请核对项目与模型服务。');}
  if(!response.body||!response.headers.get('content-type')?.includes('application/x-ndjson'))throw new HostedApiError(502,'invalid_server_receipt','未收到报告任务的进度流。');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',bytes=0,final:FullReportGenerationResult|null=null;
  const consume=(line:string)=>{
    if(!line.trim())return;const event=JSON.parse(line);
    if(!event||event.runId!==input.runId||typeof event.type!=='string')throw Error('任务回执归属不匹配。');
    if(event.type==='error')throw new HostedApiError(0,event.code??'outcome_unknown','候选稿未完成，原稿已保留。请核对已发出的模型调用回执。');
    if(final)throw Error('任务结束后收到额外回执。');
    if(event.type==='done'){
      if(event.ok!==true||!event.pack||!event.quality||!['draft','needs_review','blocked'].includes(event.quality.status)||event.quality.deliverable!==false||!Array.isArray(event.quality.checks)||!Array.isArray(event.revisions)||!event.summary)throw Error('报告验收回执不完整。');
      if(event.project?.runId!==input.runId||event.project?.inputRevision!==input.inputRevision||event.project?.projectId!==(input.projectId??'local'))throw Error('报告项目或输入版本不匹配。');
      event.report=parseEditorContent(event.report);event.pack.report=event.report;final=event;
    }else if(['init','section','repair','receipt'].includes(event.type)){
      if(event.report)event.report=parseEditorContent(event.report);options.onEvent(event as ReportStreamEvent);
    }else throw Error('不支持的报告任务回执。');
  };
  try{
    while(true){signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>128*1024*1024)throw Error('报告进度超过读取上限。');buffer+=decoder.decode(chunk.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()??'';if(buffer.length>16*1024*1024||lines.some(line=>line.length>16*1024*1024))throw Error('报告单条回执超过读取上限。');for(const line of lines)consume(line);}
    buffer+=decoder.decode();if(buffer.trim())consume(buffer);signal.throwIfAborted();
  }catch(error){void reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  if(!final)throw new HostedApiError(0,'outcome_unknown','连接已结束，但未收到完整验收回执。原稿已保留，请核对本次调用。');
  return final;
}
