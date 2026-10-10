"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {createEditorContent,type DraftSummary} from '@/lib/editor-model';
import {evidenceSection,type EvidenceCandidate,type ResearchRun} from '@/lib/research-flow';
import {EDITOR_RECOVERY_CHANNEL,EDITOR_RECOVERY_EVENT} from '@/lib/editor-recovery';
import styles from './ResearchFlow.module.css';

async function api<T>(path:string,scope:string,body?:unknown):Promise<T>{
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(scope?{'x-editor-scope':scope}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  const value=await response.json();if(!response.ok)throw Error((value as {error?:{message?:string}}).error?.message||'服务暂时不可用，请稍后重试。');return value as T;
}
const labels={pending:'等待确认',accepted:'已写入报告',cancelled:'已取消'};
export default function ResearchFlow({candidates,localOnly=false}:{candidates:EvidenceCandidate[];localOnly?:boolean}){
  return localOnly?<LocalEvidenceSummary candidates={candidates}/>:<LegacyResearchFlow candidates={candidates}/>;
}
function LocalEvidenceSummary({candidates}:{candidates:EvidenceCandidate[]}){
  const [selected,setSelected]=useState('');
  const candidate=candidates.find(c=>c.key===selected), preview=candidate?evidenceSection(candidate.input,'本地汇总'):null;
  function download(){if(!preview||!candidate)return;const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'evix-local-evidence/v1',input:candidate.input,proposal:preview},null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='统计证据提案.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className={styles.flow} aria-label="本地统计证据提案"><header className={styles.head}><div><span className={styles.eyebrow}>计算 → 证据 → 报告</span><h3>把统计结果整理成报告段落</h3><p>固定程序根据本页实际计算生成段落，可预览与下载。云端报告写入将在成果编辑阶段接入。</p></div></header><div className={styles.compose}><div><label>选择当前有效结果<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{candidates.length?'选择统计结果':'先计算频数卡片或量表 α'}</option>{candidates.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label><button type="button" disabled={!preview} onClick={download}>下载统计证据提案</button></div><div className={styles.preview}>{preview?<><h4>{preview.title}</h4><p>{preview.body}</p><details><summary>依据与计算口径</summary><pre>{preview.source}</pre></details></>:<p>选择本页计算后形成的结果，查看可以写入报告的内容。</p>}</div></div></section>;
}
function LegacyResearchFlow({candidates}:{candidates:EvidenceCandidate[]}){
  const [runs,setRuns]=useState<ResearchRun[]>([]),[drafts,setDrafts]=useState<DraftSummary[]>([]),[scope,setScope]=useState('');
  const [candidateKey,setCandidateKey]=useState(''),[draftId,setDraftId]=useState(''),[runId,setRunId]=useState('');
  const [consent,setConsent]=useState(false),[approval,setApproval]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[frozen,setFrozen]=useState(false);
  const pending=useRef<{key:string;id:string}|null>(null),newDraftId=useRef<string|null>(null),lock=useRef(false),alive=useRef(true),scopeRef=useRef('');
  const candidate=candidates.find(c=>c.key===candidateKey),run=runs.find(r=>r.id===runId);
  const draft=drafts.find(d=>d.id===draftId);
  const runTarget=run?`${drafts.find(d=>d.id===run.draftId)?.title||'目标报告'} · ${run.draftId.slice(0,8)}`:'';
  const inputCurrent=!!run&&candidates.some(c=>JSON.stringify(c.input)===JSON.stringify(run.input));
  const stale=!!run&&run.status==='pending'&&run.currentRevision!==run.baseRevision;
  const decisionContext=JSON.stringify({candidateKey,input:candidate?.input,runId,inputCurrent,draftId,draftRevision:draft?.revision,proposalHash:run?.proposalHash,runRevision:run?.currentRevision,runStatus:run?.status,frozen});
  const [reviewedContext,setReviewedContext]=useState(decisionContext);
  // Adjust this component's own state before committing changed inputs. No
  // post-paint consent window; A → B → A must ask for a new decision each time.
  if(reviewedContext!==decisionContext){setReviewedContext(decisionContext);setConsent(false);setApproval(false);}
  const reload=useCallback(async()=>{
    const library=await api<{drafts:DraftSummary[];scope:string}>('/api/drafts',scopeRef.current);
    if(scopeRef.current&&library.scope!==scopeRef.current)throw Error('身份已改变，请刷新页面后重新连接。');
    scopeRef.current=library.scope;
    const history=await api<{runs:ResearchRun[]}>('/api/drafts/research-runs',library.scope);
    if(!alive.current)return;
    setScope(library.scope);setDrafts(library.drafts);setRuns(history.runs);
    setDraftId(old=>old||library.drafts[0]?.id||'');setRunId(old=>old||history.runs[0]?.id||'');
  },[]);
  useEffect(()=>{
    alive.current=true;
    const start=()=>api('/api/drafts/session','',{});
    (navigator.locks?navigator.locks.request('evix-editor-session-v1',start):start()).then(()=>{if(alive.current)return reload();}).catch(e=>{if(alive.current)setError(e.message);});
    return()=>{alive.current=false;};
  },[reload]);
  useEffect(()=>{
    const freeze=()=>{setFrozen(true);setError('身份恢复已启动，已暂停本页保存。请刷新后重新核对记录。');};
    window.addEventListener(EDITOR_RECOVERY_EVENT,freeze);
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(EDITOR_RECOVERY_CHANNEL);
    if(channel)channel.onmessage=e=>{if(e.data?.type==='identity-transition')freeze();};
    return()=>{window.removeEventListener(EDITOR_RECOVERY_EVENT,freeze);channel?.close();};
  },[]);
  async function operation(work:()=>Promise<void>){
    if(lock.current||frozen)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try{await work();}catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  function createReport(){void operation(async()=>{
    newDraftId.current??=crypto.randomUUID();const content=createEditorContent();content.title='统计证据工作稿';
    const response=await api<{draft:DraftSummary}>('/api/drafts',scope,{id:newDraftId.current,content});
    newDraftId.current=null;await reload();setDraftId(response.draft.id);setNotice('已新建统计证据工作稿，未写入任何统计结果。');
  });}
  function propose(){if(!candidate||!draft||!consent)return;void operation(async()=>{
    const key=JSON.stringify({draftId:draft.id,revision:draft.revision,input:candidate.input});
    if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
    const response=await api<{run:ResearchRun}>('/api/drafts/research-runs',scope,{id:pending.current.id,draftId:draft.id,baseRevision:draft.revision,input:candidate.input,consent:true});
    await reload();setRunId(response.run.id);setConsent(false);setNotice('汇总与提案已保存，报告尚未修改。请逐句核对后再确认。');
  });}
  function decide(action:'accept'|'cancel'){
    if(!run||action==='accept'&&(!approval||!inputCurrent||stale))return;
    void operation(async()=>{const response=await api<{run:ResearchRun}>(`/api/drafts/research-runs/${run.id}`,scope,{action,proposalHash:run.proposalHash});
      await reload();setRunId(response.run.id);setApproval(false);setNotice(action==='accept'?'已追加独立章节，并保存写入前、写入后两个命名版本。其他已打开编辑页不会被自动覆盖；请在编辑器草稿库中重新打开此报告。':'提案已取消，报告未改变。');});
  }
  const preview=candidate?evidenceSection(candidate.input,'本地预览'):null;
  return <section className={styles.flow} aria-label="证据写入报告" id="research-flow">
    <header className={styles.head}><div><span className={styles.eyebrow}>研究执行 · P0</span><h3>让计算结果，带着依据进入报告</h3><p>首版接入频数比例与 Cronbach α。自动形成提案，由你决定是否写入。</p></div><button type="button" disabled={busy||frozen} onClick={()=>void operation(reload)}>刷新记录</button></header>
    <ol className={styles.steps}><li><b>01</b> 本页计算</li><li><b>02</b> 保存汇总</li><li><b>03</b> 核对提案</li><li><b>04</b> 确认新版本</li></ol>
    {error&&<p className={styles.error} role="alert">{error} 如遇响应超时，先刷新记录核对；重复同一请求不会重复写入。</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.compose}><div>
      <label>选择当前有效的结果<select value={candidateKey} disabled={busy||frozen} onChange={e=>setCandidateKey(e.target.value)}><option value="">{candidates.length?'选择要保存的统计结果':'先计算一张频数卡片或量表 α'}</option>{candidates.map(c=><option value={c.key} key={c.key}>{c.label}</option>)}</select></label>
      <p className={styles.muted}>频数卡片需填写研究问题；α 需填写构念。无有效样本或未定义 α 不生成提案。</p>
      <label>新提案的目标报告<select value={draftId} disabled={busy||frozen} onChange={e=>{setDraftId(e.target.value);setConsent(false);}}><option value="">选择已保存的结构化报告</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.title} · v{d.revision}</option>)}</select></label>
      <button type="button" disabled={busy||frozen||!scope} onClick={createReport}>新建统计证据工作稿</button>
      {candidate&&<details className={styles.payload}><summary>将保存哪些信息？查看完整汇总</summary><p>数据指纹、来源分类、研究问题、变量名、缺失设置、样本数与汇总数值。关联问卷时还包含问卷/解析/对应指纹，以及所选题目的 ID、变量、题型、构念、范围和反向设置。条件题还保存处理策略、资格范围、排除和逐题六类计数（含条件父题 ID）。不上传题干、选项文字、答卷行、行位置或原文件。汇总和构念名称仍可能敏感，尤其是小样本。</p><pre>{JSON.stringify(candidate.input,null,2)}</pre></details>}
      <label className={styles.check}><input type="checkbox" checked={consent} disabled={!candidate||busy||frozen} onChange={e=>setConsent(e.target.checked)}/><span>我已检查隐私，同意将上述汇总保存到当前系统，不上传原始答卷。</span></label>
      <button type="button" className={styles.primary} disabled={!candidate||!draft||!consent||busy||frozen||!scope} onClick={propose}>{busy?'正在处理…':'保存汇总并生成提案'}</button>
    </div><div className={styles.preview}><span className={styles.eyebrow}>写入前预览 · 不自动修改报告</span>{preview?<><h4>{preview.title}</h4><p>{preview.body}</p></>:<div className={styles.empty}><h4>这里呈现实际结果，不预填结论</h4><p>完成上方计算后选择结果，即可看到报告段落。每条数字由固定公式形成，不调用大模型，也不自动联网。</p></div>}</div></div>
    <div className={styles.history}><aside><h4>已保存的执行记录 <small>{runs.length} / 80</small></h4>{!runs.length?<p>确认保存汇总后，记录可在刷新后恢复。未上传的答卷仍只在本页内存。</p>:runs.map(r=><button type="button" key={r.id} data-active={r.id===runId} onClick={()=>{setRunId(r.id);setApproval(false);}}><span>{r.input.classification==='simulated'?'模拟 · ':''}{r.proposal.title}</span><small>{labels[r.status]} · {new Date(r.createdAt).toLocaleString('zh-CN')}</small></button>)}</aside>
      <div className={styles.detail}>{run?<>
        <div className={styles.runHead}><h4>{labels[run.status]}</h4><span>{runTarget} · v{run.baseRevision}{run.acceptedRevision?` → v${run.acceptedRevision}`:''}</span></div>
        <p className={styles.muted}>本提案固定写入以上报告；上方目标选择仅用于生成新提案。</p>
        <p className={styles.muted}>{run.input.classification==='simulated'?'教学模拟，非真实调研':'用户提供，来源待核验'} · 汇总公式复核，不代表原始数据已核验</p>
        <details open><summary>将追加的独立章节 · 原有章节与 PPT 保持不变</summary><h4>{run.proposal.title}</h4><p className={styles.prose}>{run.proposal.body}</p><pre>{run.proposal.source}</pre></details>
        <details><summary>证据指纹与实际事件</summary><pre>输入：{run.inputHash}{'\n'}提案：{run.proposalHash}</pre><ul>{run.events.map(e=><li key={e.type}>{({aggregate_saved:'汇总已保存',summary_checked:'汇总规则已检查',proposal_ready:'提案已生成',accepted:'用户已确认',cancelled:'用户已取消'} as Record<string,string>)[e.type]} · {new Date(e.at).toLocaleString('zh-CN')}</li>)}</ul><p>前三步为同一次保存事务，不是后台运行或模型思考进度。外部模型调用 0 次。</p></details>
        {run.status==='pending'&&<>{(!inputCurrent||stale)&&<p className={styles.warning}>{stale?'目标报告已变化，此提案不能覆盖新版本。请取消后基于最新报告重新生成。':'历史汇总，当前输入未复核。刷新或更改数据后，请重新导入同一文件并按原设置计算，匹配后才能确认写入。'}</p>}
          <label className={styles.check}><input type="checkbox" checked={approval} disabled={!inputCurrent||stale||busy||frozen} onChange={e=>setApproval(e.target.checked)}/><span>已核对本次提案，同意追加到「{runTarget}」v{run.baseRevision}，并保留前后快照（占用 2 个命名版本）。</span></label>
          <div className={styles.actions}><button type="button" className={styles.primary} disabled={!approval||!inputCurrent||stale||busy||frozen} onClick={()=>decide('accept')}>确认写入新版本</button><button type="button" disabled={busy||frozen} onClick={()=>decide('cancel')}>取消此提案</button></div></>}
        {run.status==='accepted'&&<p className={styles.notice}>版本回执：v{run.acceptedRevision}。<a href="#editor">前往报告编辑器</a>，从草稿库打开目标报告；已有未保存编辑不会被自动替换。</p>}
      </>:<div className={styles.empty}><h4>每一次确认，都留有版本</h4><p>生成提案不会改稿。取消不会触碰报告；其他页面先改了报告时，系统会拒绝过期提案。</p></div>}</div></div>
  </section>;
}
