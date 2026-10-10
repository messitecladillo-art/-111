"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SERVICE_CAPABILITIES, type ServiceConfig, type ServiceCapability, type ServiceProvider } from '@/lib/agent-services';
import { parseAgentQuestionnaire, type AgentQuestionnaireProposal } from '@/lib/agent-questionnaire-proposal';
import styles from './AgentServiceStudio.module.css';
const NAMES:Record<ServiceCapability,string>={questionnaire:'问卷设计',research:'选题与研究',report:'报告写作',defense:'答辩准备'};
const PROVIDERS:Record<ServiceProvider,string>={openai:'OpenAI',deepseek:'DeepSeek',qwen:'通义千问',compatible:'运营者允许的兼容服务'};
const BASES:Record<ServiceProvider,string>={openai:'https://api.openai.com/v1',deepseek:'https://api.deepseek.com/v1',qwen:'https://dashscope.aliyuncs.com/compatible-mode/v1',compatible:''};
type Form={id:string|null;revision:number;label:string;provider:ServiceProvider;baseUrl:string;model:string;capabilities:ServiceCapability[];maxOutputTokens:number};
const blank=():Form=>({id:null,revision:0,label:'我的研究模型',provider:'deepseek',baseUrl:BASES.deepseek,model:'',capabilities:['questionnaire'],maxOutputTokens:2048});
type ApiBody={configured:boolean;connected:boolean;identityMode?:'local_demo'|'email_account';emailAvailable?:boolean;message?:string;allowedCompatibleBases?:string[];services:ServiceConfig[];service:ServiceConfig;callId:string;result:{text:string;usage:{inputTokens:number;outputTokens:number}|null;error?:{message:string}};error?:{message:string};auditWarning?:boolean};
async function api(path:string, options:RequestInit={}) {
  const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json',...options.headers}});
  const body=await response.json() as ApiBody;
  if(!response.ok)throw new Error(body.result?.error?.message||body.error?.message||'操作暂时未完成，请先检查当前配置或调用记录。');
  return body;
}
export default function AgentServiceStudio({onProposal}:{onProposal:(proposal:AgentQuestionnaireProposal)=>void}) {
  const [connected,setConnected]=useState(false),[configured,setConfigured]=useState(false),[busy,setBusy]=useState(false);
  const [services,setServices]=useState<ServiceConfig[]>([]),[form,setForm]=useState<Form>(blank),[key,setKey]=useState('');
  const [allowed,setAllowed]=useState<string[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [selected,setSelected]=useState(''),[brief,setBrief]=useState(''),[consent,setConsent]=useState(false),[output,setOutput]=useState('');
  const [proposal,setProposal]=useState<AgentQuestionnaireProposal|null>(null),[usage,setUsage]=useState<string>('');
  const [identityMode,setIdentityMode]=useState<'local_demo'|'email_account'>('email_account'),[emailAvailable,setEmailAvailable]=useState(false),[email,setEmail]=useState(''),[code,setCode]=useState('');
  const lock=useRef(false),mounted=useRef(true);
  const selectedService=services.find(s=>s.id===selected&&s.capabilities.includes('questionnaire'));
  useEffect(()=>{
    mounted.current=true;
    api('/api/agent/session').then(async body=>{
      if(!mounted.current)return;
      setConfigured(body.configured);setConnected(body.connected);setAllowed(body.allowedCompatibleBases||[]);setIdentityMode(body.identityMode||'email_account');setEmailAvailable(!!body.emailAvailable);
      if(body.connected){const result=await api('/api/agent/services');if(mounted.current)setServices(result.services);}
    }).catch(e=>{if(mounted.current)setNotice(e instanceof Error?e.message:'服务设置暂时无法连接，请联系管理员。');});
    return()=>{mounted.current=false;};
  },[]);
  async function action(operation:()=>Promise<void>) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{await operation();}catch(e){setError(e instanceof Error?e.message:'操作未完成。请核查配置，不会自动重发生成请求。');}
    finally{lock.current=false;setBusy(false);}
  }
  async function reload(){const result=await api('/api/agent/services');setServices(result.services);}
  function clearResult(){setOutput('');setProposal(null);setUsage('');}
  function edit(service:ServiceConfig){if(busy)return;setForm({...service});setKey('');clearResult();setNotice('修改配置时，留空密钥表示保留原密钥；更换服务商须重新填写。');}
  async function save(event:FormEvent){event.preventDefault();await action(async()=>{
    const service={id:form.id||crypto.randomUUID(),label:form.label,provider:form.provider,baseUrl:form.baseUrl,model:form.model,capabilities:form.capabilities,maxOutputTokens:form.maxOutputTokens,...(key?{apiKey:key}:{})};
    try{const result=await api('/api/agent/services',{method:'POST',body:JSON.stringify({service,expectedRevision:form.revision})});setForm({...result.service});await reload();clearResult();setNotice('配置已保存。密钥不会回传；保存不会调用模型。');}finally{setKey('');}
  });}
  async function call(service:ServiceConfig,kind:'test'|'questionnaire') {await action(async()=>{
    clearResult();
    const body=await api(`/api/agent/services/${service.id}/call`,{method:'POST',body:JSON.stringify({callId:crypto.randomUUID(),serviceRevision:service.revision,kind,...(kind==='questionnaire'?{brief,confirmSharing:consent}:{})})});
    if(kind==='test'){setNotice('模型列表连接成功，服务商接受鉴权且列出所选模型；尚未验证实际生成。');return;}
    setOutput(body.result.text);setConsent(false);
    const tokens=body.result.usage;
    setUsage(tokens?`服务商报告：输入 ${tokens.inputTokens}，输出 ${tokens.outputTokens} tokens。费用以服务商账单为准。`:'服务商未提供可核验的 token 用量，费用以账单为准。');
    try{setProposal({id:body.callId,serviceId:service.id,serviceRevision:service.revision,model:service.model,design:parseAgentQuestionnaire(body.result.text)});setNotice('问卷草案已生成。请核对题项后带入问卷工作台。');}
    catch{setNotice('已收到文本建议，但结构不符合导入契约。请审阅文本；没有改动现有问卷。');}
    if(body.auditWarning)setNotice(previous=>`${previous} 调用记录未完整保存，请先核查服务商用量，勿重复发起同一请求。`);
  });}
  return <section className={styles.studio} aria-label="服务接入工作台">
    <header className={styles.hero}><span>YOUR SERVICES · YOUR RESEARCH</span><h2>为研究能力接入你的模型</h2><p>选题、问卷、报告与答辩可以共用一份配置，也可以分别选择服务。统计计算继续由工作台的工具完成。</p><div className={styles.steps}><b>01 配置服务</b><b>02 检查连接</b><b>03 生成建议</b><b>04 确认应用</b></div></header>
    <div className={styles.session}><div><strong>{connected?'你的服务工作区已连接':identityMode==='local_demo'?'本地合成验收模式':'受邀邮箱登录'}</strong><p>{identityMode==='local_demo'?'此站点使用独立合成数据库，按浏览器会话隔离。请勿填写真实密钥。正式站点使用受邀邮箱登录。':'邮箱验证后，服务配置绑定你的账号。登录会话有效期 30 天，可主动退出；你的密钥不会在页面显示。'}</p></div>{(connected||identityMode==='local_demo')&&<div className={styles.buttons}><button type="button" disabled={busy||!configured} onClick={()=>action(async()=>{if(!connected)await api('/api/agent/session',{method:'POST'});setConnected(true);await reload();setNotice('工作区已连接，可以配置你的模型服务。');})}>{connected?'刷新配置':'连接合成工作区'}</button>{connected&&<button type="button" disabled={busy} onClick={()=>action(async()=>{await api('/api/agent/session',{method:'DELETE'});setConnected(false);setServices([]);setForm(blank());setKey('');setSelected('');clearResult();setNotice('已退出。');})}>退出登录</button>}</div>}</div>
    {!connected&&identityMode==='email_account'&&<form className={styles.card} onSubmit={event=>{event.preventDefault();void action(async()=>{await api('/api/agent/auth/verify',{method:'POST',body:JSON.stringify({email,code})});setCode('');setKey('');clearResult();setForm(blank());setConnected(true);await reload();setNotice('邮箱已验证，可以接入你的模型服务。');});}}><fieldset disabled={busy||!configured||!emailAvailable} className={styles.fields}><label>受邀邮箱<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);setCode('');}}/></label><div className={styles.buttons}><button type="button" disabled={!email.trim()} onClick={()=>action(async()=>{const result=await api('/api/agent/auth/code',{method:'POST',body:JSON.stringify({email})});setNotice(result.message||'如该邮箱已受邀，验证码会发送到邮箱。');})}>发送验证码</button></div><label>六位验证码<input autoComplete="one-time-code" inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label><button type="submit" className={styles.primary}>验证邮箱并登录</button></fieldset>{!emailAvailable&&<p className={styles.hint}>管理员需要先配置发信服务和受邀邮箱名单，才能开放登录。</p>}</form>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.grid}>
      <form className={styles.card} onSubmit={save}><div className={styles.heading}><div><small>SERVICE CONFIGURATION</small><h3>{form.id?'编辑服务配置':'添加一份服务配置'}</h3></div><button type="button" disabled={busy} onClick={()=>{setForm(blank());setKey('');}}>新建</button></div>
        <fieldset disabled={busy||!connected} className={styles.fields}>
          <label>配置名称<input maxLength={80} required value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/></label>
          <label>服务商<select value={form.provider} onChange={e=>{const provider=e.target.value as ServiceProvider;setForm({...form,provider,baseUrl:provider==='compatible'?(allowed[0]||''):BASES[provider]});setKey('');}}>{Object.entries(PROVIDERS).map(([id,name])=><option key={id} value={id} disabled={id==='compatible'&&!allowed.length}>{name}</option>)}</select></label>
          <label>服务地址{form.provider==='compatible'?<select value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})}>{allowed.map(base=><option key={base}>{base}</option>)}</select>:<input readOnly value={form.baseUrl}/>}</label>
          <label>模型 ID<input required maxLength={120} placeholder="填写服务商控制台中的模型 ID" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></label>
          <label>API Key<input type="password" required={!form.id} autoComplete="new-password" maxLength={512} placeholder={form.id?'留空保留原密钥':'只在这里填写，保存后清空'} value={key} onChange={e=>setKey(e.target.value)}/></label>
          <p className={styles.hint}>密钥由服务端加密保管，不写入浏览器存储或生成日志。更换地址时须提供新密钥。</p>
          <label>单次输出上限<input type="number" min={128} max={4096} step={128} value={form.maxOutputTokens} onChange={e=>setForm({...form,maxOutputTokens:Number(e.target.value)})}/></label>
          <div><span>这份配置服务哪些能力</span><div className={styles.choices}>{SERVICE_CAPABILITIES.map(capability=><label key={capability}><input type="checkbox" checked={form.capabilities.includes(capability)} onChange={e=>setForm({...form,capabilities:e.target.checked?[...form.capabilities,capability]:form.capabilities.filter(c=>c!==capability)})}/>{NAMES[capability]}</label>)}</div><p className={styles.hint}>本阶段开放问卷草案执行，其余能力先保存绑定。最多保存 8 份配置。</p></div>
          <button type="submit" className={styles.primary} disabled={!form.capabilities.length}>保存配置</button>
        </fieldset>
      </form>
      <div className={styles.card}><small>CAPABILITY ROUTING</small><h3>我的能力与服务</h3><div className={styles.routes}>{SERVICE_CAPABILITIES.map(capability=><div key={capability}><strong>{NAMES[capability]}</strong><span>{services.filter(s=>s.capabilities.includes(capability)).map(s=>s.label).join('、')||'尚未绑定'}</span></div>)}</div>
        <h4>已保存的服务</h4>{!services.length&&<p className={styles.hint}>从左侧添加配置。同一份密钥可以供多个研究模块使用。</p>}
        {services.map(service=><article className={styles.service} key={service.id}><div><strong>{service.label}</strong><small>{PROVIDERS[service.provider]} · {service.model} · v{service.revision}</small></div><div className={styles.buttons}><button type="button" disabled={busy} onClick={()=>edit(service)}>编辑</button><button type="button" disabled={busy} onClick={()=>call(service,'test')}>测试连接</button><button type="button" disabled={busy} onClick={()=>action(async()=>{if(!window.confirm('移除此服务配置及其密钥？相关用量日志一并清理，调用状态记录仍保留。服务商侧的密钥不会被撤销。'))return;await api(`/api/agent/services/${service.id}`,{method:'DELETE',body:JSON.stringify({expectedRevision:service.revision})});await reload();if(form.id===service.id)setForm(blank());clearResult();setNotice('此服务配置与加密密钥已移除。');})}>移除</button></div></article>)}
      </div>
    </div>
    <div className={`${styles.card} ${styles.run}`}><small>FIRST AGENT WORKFLOW</small><h3>从研究需求生成问卷草案</h3><p>模型给出提案，你检查后再应用。这里填写的材料会发送给你选择的服务商；不发送原始答卷，也不把建议登记为调研证据。</p>
      <fieldset disabled={busy||!connected} className={styles.fields}><label>用于本次问卷建议的服务<select value={selected} onChange={e=>{setSelected(e.target.value);clearResult();setConsent(false);}}><option value="">请选择已绑定问卷能力的服务</option>{services.filter(s=>s.capabilities.includes('questionnaire')).map(s=><option value={s.id} key={s.id}>{s.label} · {s.model}</option>)}</select></label><label>研究需求<textarea rows={5} maxLength={4000} placeholder="写明研究问题、目标群体，以及拟支持的决策。请先移除个人信息。" value={brief} onChange={e=>{setBrief(e.target.value);setConsent(false);clearResult();}}/></label><label className={styles.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我确认将上述研究需求发送给所选服务商，并使用自己的额度生成建议。</label><button type="button" className={styles.primary} disabled={!selectedService||!consent||!brief.trim()} onClick={()=>selectedService&&call(selectedService,'questionnaire')}>{busy?'正在处理…':'生成问卷建议'}</button></fieldset><p className={styles.hint}>每个私密会话同时运行 1 次、每小时最多 12 次；超时不自动重试。输入与输出长度均有限制，最终费用以服务商账单为准。</p>
      {proposal&&<div className={styles.proposal}><span>拟议设计 · 尚未预测试</span><h4>{proposal.design.title}</h4><p>{proposal.design.objective}</p><ol>{proposal.design.questions.map(q=><li key={q.id}>{q.text}</li>)}</ol><button type="button" disabled={busy} onClick={()=>{onProposal(proposal);window.location.hash='design';}}>带到问卷工作台预览</button><p>工作台会再次确认替换，并保留撤销入口。</p></div>}
      {output&&<details><summary>查看模型原始文本与用量</summary><pre className={styles.output}>{output}</pre><p>{usage}</p><p>建议只保存在当前页面内存中，应用后请在问卷版本库保存。</p></details>}
    </div>
  </section>;
}
