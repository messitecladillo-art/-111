import {parseSavImport, type NormalizedSav} from './platform-data-mapping.ts';
import {rejectDuplicateMembers} from './questionnaire.ts';

export const SAV_UPLOAD_LIMITS = {fileBytes:2_000_000,responseBytes:16*1024*1024} as const;
export type SavUploadPhase = 'fingerprint'|'request'|'receipt'|'verify';
export type SavUploadFile = Pick<File,'name'|'size'|'arrayBuffer'>;
export class SavUploadError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,message:string,status=0){super(message);this.name='SavUploadError';this.code=code;this.status=status;}
}
export function validateSavFile(file:SavUploadFile):void {
  if(!/\.sav$/iu.test(file.name))throw new SavUploadError('file_type','请选择 .sav 格式的数据文件。');
  if(!Number.isSafeInteger(file.size)||file.size<1||file.size>SAV_UPLOAD_LIMITS.fileBytes)throw new SavUploadError('file_limit','SAV 文件须在 2 MB 以内，且不能为空。');
}
function checkAbort(signal:AbortSignal):void {
  if(signal.aborted)throw new DOMException('本次读取已取消。','AbortError');
}
async function readReceipt(response:Response,signal:AbortSignal):Promise<string> {
  const refuse=(code:string,message:string):never=>{void response.body?.cancel().catch(()=>{});throw new SavUploadError(code,message,response.status);};
  if(!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get('content-type')||''))refuse('invalid_receipt','服务未返回可核验的 JSON 数据。');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/u.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>SAV_UPLOAD_LIMITS.responseBytes))refuse('response_limit','SAV 读取回执超过处理上限。');
  const reader=response.body?.getReader();
  if(!reader)throw new SavUploadError('invalid_receipt','服务回执为空。',response.status);
  const chunks:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try {
    checkAbort(signal);
    while(true){const next=await reader.read();checkAbort(signal);if(next.done)break;size+=next.value.byteLength;if(size>SAV_UPLOAD_LIMITS.responseBytes)throw new SavUploadError('response_limit','SAV 读取回执超过处理上限。',response.status);chunks.push(next.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let raw:string;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new SavUploadError('invalid_utf8','服务回执不是完整的 UTF-8 数据。',response.status);}
    try{JSON.parse(raw);rejectDuplicateMembers(raw);}catch{throw new SavUploadError('invalid_receipt','服务回执无法核验或包含重复字段。',response.status);}
    return raw;
  }catch(error){void reader.cancel().catch(()=>{});throw error;}
  finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
/** One explicit temporary upload. No retries, timers, persistence or model calls. */
export async function uploadTemporarySav(file:SavUploadFile,csrfToken:string,signal:AbortSignal,onPhase:(phase:SavUploadPhase)=>void=()=>{},fetcher:typeof fetch=fetch):Promise<NormalizedSav> {
  validateSavFile(file);checkAbort(signal);
  if(!csrfToken)throw new SavUploadError('login_required','请先登录，再临时上传 SAV 文件。');
  onPhase('fingerprint');
  const buffer=await file.arrayBuffer();checkAbort(signal);
  if(buffer.byteLength!==file.size||buffer.byteLength>SAV_UPLOAD_LIMITS.fileBytes)throw new SavUploadError('file_changed','文件内容与所选文件大小不一致，请重新选择。');
  const digest=await crypto.subtle.digest('SHA-256',buffer);checkAbort(signal);
  const localHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  onPhase('request');checkAbort(signal);
  let response:Response;
  try{response=await fetcher('/api/imports/sav',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/octet-stream','Accept':'application/json','X-EVIX-Temporary-Upload':'accepted','X-CSRF-Token':csrfToken},body:buffer,signal});}
  catch(error){checkAbort(signal);if(error instanceof SavUploadError)throw error;throw new SavUploadError('network_error','连接未完成。文件仍保留，可手动重新读取。');}
  checkAbort(signal);onPhase('receipt');
  const raw=await readReceipt(response,signal);checkAbort(signal);
  if(!response.ok){const value=JSON.parse(raw) as {error?:{code?:unknown;message?:unknown}};const detail=value?.error;const code=typeof detail?.code==='string'&&/^[a-z0-9_]{1,80}$/u.test(detail.code)?detail.code:'request_failed';const message=typeof detail?.message==='string'&&detail.message.length<=400&&!/[\u0000-\u001f\u007f]/u.test(detail.message)?detail.message:'SAV 读取未完成，请核对文件后重试。';throw new SavUploadError(code,message,response.status);}
  onPhase('verify');checkAbort(signal);
  let data:NormalizedSav;try{data=parseSavImport(raw);}catch(error){throw new SavUploadError('invalid_receipt',error instanceof Error?error.message:'SAV 数据无法核验。',response.status);}
  if(data.raw.sourceSha256!==localHash||data.raw.bytes!==buffer.byteLength)throw new SavUploadError('source_mismatch','返回数据与所选文件的内容指纹不一致，未载入本次结果。',response.status);
  if(data.raw.cleanup.completed!==true||data.raw.cleanup.reason!=='temporary-upload')throw new SavUploadError('cleanup_unconfirmed','临时文件尚未确认清理，未载入本次结果。',response.status);
  checkAbort(signal);return data;
}
