/** Server-side email adapter. No invitation, recipient or secret is logged. */
export class AgentMailError extends Error {
  constructor(){super('验证码邮件暂未发出，请稍后重试。');}
}
export async function sendAgentLoginCode({apiKey,from,email,code,challengeId}:{apiKey:string;from:string;email:string;code:string;challengeId:string},fetcher:typeof fetch=fetch):Promise<void> {
  if(!/^[\x21-\x7e]{8,512}$/.test(apiKey)||!/^\S+@\S+\.\S+$/.test(from)||from.length>254||/[\r\n]/.test(from)||!/^\d{6}$/.test(code))throw new AgentMailError();
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AgentMailError());},10000);});
  try {
    const response=await Promise.race([fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json','idempotency-key':`evix-login-${challengeId}`},body:JSON.stringify({from,to:[email],subject:'证见 EVI-X 登录验证码',text:`你的登录验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略本邮件。`}),signal:controller.signal,redirect:'error'}),deadline]);
    if(!response.ok||response.redirected){void response.body?.cancel().catch(()=>{});throw new AgentMailError();}
    const reader=response.body?.getReader();
    if(!reader)throw new AgentMailError();
    let size=0;const parts:Uint8Array[]=[];
    try{for(;;){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;size+=part.value.byteLength;if(size>8192)throw new AgentMailError();parts.push(part.value);}}
    finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    const data:unknown=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
    if(!data||typeof data!=='object'||typeof (data as {id?:unknown}).id!=='string')throw new AgentMailError();
  }catch{throw new AgentMailError();}finally{clearTimeout(timer);}
}
