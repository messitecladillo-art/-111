"use client";

import {useEffect,useRef,useState} from 'react';
import type {QuestionnaireVersion} from '@/lib/questionnaire-library';
import {verifyQuestionnaireReviewReceipt,type QuestionnaireReviewRecord,type QuestionnaireReviewFinding} from '@/lib/questionnaire-review';
import {verifyQuestionnaireVersion,questionnaireCurrentRevision} from '@/lib/questionnaire-version';
import {compareQuestionnaireRevision,type QuestionnaireRevisionComparison} from '@/lib/questionnaire-revision';
import styles from './QuestionnaireReview.module.css';

type Props={source:QuestionnaireVersion;scope:string;currentRevision:number;disabled:boolean;isCurrent:()=>boolean;onPrepareRevision:(finding:QuestionnaireReviewFinding,record:QuestionnaireReviewRecord)=>void};
export default function QuestionnaireReview({source,scope,currentRevision,disabled,isCurrent,onPrepareRevision}:Props){
  const [record,setRecord]=useState<QuestionnaireReviewRecord|null>(null),[read,setRead]=useState(false),[consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[latest,setLatest]=useState(currentRevision);
  const [comparison,setComparison]=useState<QuestionnaireRevisionComparison|null>(null),[comparisonError,setComparisonError]=useState('');
  const origin=source.repairOrigin??null;
  const alive=useRef(true),lock=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function run(write:boolean){
    if(lock.current||disabled||!isCurrent()||(write&&!consent&&!uncertain))return;
    lock.current=true;setBusy(true);setError('');setConsent(false);setComparison(null);setComparisonError('');
    const valid=()=>alive.current&&isCurrent();
    let status=0;
    try{
      const response=await fetch(`/api/drafts/questionnaires/${source.projectId}/versions/${source.id}/review`,{
        method:write?'POST':'GET',cache:'no-store',headers:{'content-type':'application/json','x-editor-scope':scope},
        ...(write?{body:JSON.stringify({expectedSha256:source.sha256,consent:true})}:{}),signal:AbortSignal.timeout(20000),
      });status=response.status;
      const data=await response.json() as {scope?:unknown;review?:unknown;currentRevision?:unknown;error?:{message?:string}};
      if(!valid())return;
      if(!response.ok)throw new Error(data.error?.message||'检查暂时不可用，问卷内容未改变。');
      if(data.scope!==scope||!Number.isSafeInteger(data.currentRevision)||(data.currentRevision as number)<source.revision||(data.currentRevision as number)>40)throw new Error('检查返回的身份或版本不匹配，未接纳结果。');
      if(data.review===null){if(write)throw new Error('尚未收到持久化检查回执。');setRecord(null);}
      else {const checked=await verifyQuestionnaireReviewReceipt(data.review,source);if(!valid())return;setRecord(checked);}
      setLatest(data.currentRevision as number);setRead(true);setUncertain(false);
    }catch(e){if(valid()){setError(e instanceof Error?e.message:'检查失败，问卷未改变。');if(write)setUncertain(status===0||status>=500||status<400);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function compare(){
    if(lock.current||disabled||!isCurrent()||!origin||!record)return;
    lock.current=true;setBusy(true);setComparison(null);setComparisonError('');
    const valid=()=>alive.current&&isCurrent();
    const readOriginal=async(path:string)=>{
      const response=await fetch(path,{cache:'no-store',headers:{'x-editor-scope':scope},signal:AbortSignal.timeout(20000)});
      const data=await response.json() as {scope?:unknown;version?:unknown;review?:unknown;currentRevision?:unknown;error?:{message?:string}};
      if(!response.ok)throw Error(data.error?.message||'无法读取修订来源；本版检查保留，不显示未经核验的对照。');
      if(data.scope!==scope)throw Error('修订来源的访问身份不一致，未接纳结果。');
      return data;
    };
    try{
      const path=`/api/drafts/questionnaires/${source.projectId}/versions/${origin.sourceVersionId}`;
      const original=await readOriginal(path);if(!valid())return;
      const before=await verifyQuestionnaireVersion(original.version,{projectId:source.projectId,versionId:origin.sourceVersionId});
      questionnaireCurrentRevision(original.currentRevision,Math.max(before.revision,source.revision));if(!valid())return;
      const originalReview=await readOriginal(`${path}/review`);if(!valid())return;
      questionnaireCurrentRevision(originalReview.currentRevision,Math.max(before.revision,source.revision));
      if(!originalReview.review)throw Error('当前接口未返回原检查记录；可能缺失或引擎已变化，不能把它当作没有问题。');
      const beforeReview=await verifyQuestionnaireReviewReceipt(originalReview.review,before);if(!valid())return;
      const checked=await compareQuestionnaireRevision(origin,before,beforeReview,source,record);if(valid())setComparison(checked);
    }catch(e){if(valid())setComparisonError(e instanceof Error?e.message:'对照未完成；不推断问题是否解决。');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  return <section className={styles.review} aria-label="本版自动设计检查">
    <header><div><span className={styles.eyebrow}>VERSION-BOUND CHECK</span><h4>本版设计检查与修订记录</h4></div><span className={styles.badge}>机器检查 · 非人工批准</span></header>
    <p>检查对象是已保存的 <strong>v{source.revision}</strong>，不是本页未保存设计。目录最新为 v{latest}（截至本次读取）；{source.revision<latest?'这是历史版，结果不能用于替代新版检查。':'后续新版本须分别检查。'}</p>
    <p className={styles.muted}>读取服务器上的本版设计，执行结构与用途检查，保存版本指纹、引擎版本和问题清单。不修改问卷，不发送给外部模型，不核验真实调研或自动通过 Gate。</p>
    {origin&&<aside className={styles.origin} aria-label="本版持久化修订来源"><strong>本版沿自 v{origin.sourceRevision} 的一项检查</strong><p>{origin.questionId?`题目 ID ${origin.questionId}`:'研究简介 / 整体结构'} · {origin.code}</p><details><summary>查看来源记录与指纹</summary><dl><dt>原检查</dt><dd>{origin.reviewId}</dd><dt>原版本</dt><dd>{origin.sourceVersionId}</dd><dt>源 SHA-256</dt><dd>{origin.sourceSha256}</dd><dt>原引擎</dt><dd>{origin.engine}</dd></dl></details><p>这是保存时记录的修订来历，不是已解决证明。{!record?'请读取或运行本版检查，再与原检查对照。':'对照会按需读取并核验原版本与原检查。'}</p><button type="button" disabled={disabled||busy||!record} onClick={()=>void compare()}>核验原检查并对照本版</button></aside>}
    {disabled&&<p className={styles.warning}>当前预览已失效或另有操作进行中。请完成操作后重新预览。</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {uncertain&&<p className={styles.warning}>保存检查的结果尚未确认。重试只核对同一保存版与同一引擎，不重复建立检查记录，也不包含后续编辑。</p>}
    <div className={styles.actions}><button type="button" disabled={disabled||busy} onClick={()=>void run(false)}>读取本版检查记录</button></div>
    <label className={styles.consent}><input type="checkbox" checked={consent} disabled={disabled||busy||uncertain} onChange={e=>setConsent(e.target.checked)}/><span>确认检查已保存的 v{source.revision}，并在当前系统保留机器检查记录。</span></label>
    <button type="button" className={styles.primary} disabled={disabled||busy||(!consent&&!uncertain)} onClick={()=>void run(true)}>{busy?'正在核对…':uncertain?'核对并重试本版检查':'运行并保存本版检查'}</button>
    {read&&!record&&<p role="status">本版尚无当前引擎的检查记录。读取没有产生新记录。</p>}
    {record&&<div className={styles.result}>
      <p role="status"><strong>{record.result.summary.blockers?'先处理结构问题':'仍需人工复核'}</strong> · 已保存 v{record.revision} 的机器检查。不是当前页面或其他版本的批准。</p>
      <div className={styles.counts}><span><strong>{record.result.summary.blockers}</strong> 结构问题</span><span><strong>{record.result.summary.reviews}</strong> 逐项待复核</span><span><strong>{record.result.summary.questions}</strong> 题</span></div>
      <h5>下一步修订顺序</h5><ol>{record.result.nextSteps.map(step=><li key={step.id}>{step.title}{step.findingIds.length>0&&<small> · 对应 {step.findingIds.length} 项</small>}</li>)}</ol>
      <details><summary>查看全部 {record.result.findings.length} 项问题</summary>{!record.result.findings.length?<p>当前检查未发现机械问题，设计仍需人工复核。</p>:<ol className={styles.findings}>{record.result.findings.map(f=><li key={f.id}><span className={f.level==='blocker'?styles.risk:styles.muted}>{f.level==='blocker'?'结构问题':'待复核'} · {f.questionNumber===null?'研究简介':`第 ${f.questionNumber} 题 ${f.variable}`}</span><p>{f.message}</p><button type="button" disabled={disabled||busy} onClick={()=>{if(!disabled&&!busy&&isCurrent())onPrepareRevision(f,record);}}>准备修订此项</button></li>)}</ol>}</details>
      <details><summary>人工仍须提供的 5 类证据</summary><ul>{record.result.humanChecks.map(c=><li key={c.id}><strong>{c.title}</strong><p>{c.evidenceNeeded}</p></li>)}</ul></details>
      <details><summary>执行记录与版本指纹</summary><dl><dt>执行方式</dt><dd>服务器规则检查；不调用模型，仍需人工批准</dd><dt>保存时间</dt><dd>{new Date(record.createdAt).toLocaleString('zh-CN')}</dd><dt>引擎</dt><dd>{record.engine}</dd><dt>检查记录</dt><dd>{record.id}</dd><dt>源版本 SHA-256</dt><dd>{record.sourceSha256}</dd><dt>结果 SHA-256</dt><dd>{record.resultSha256}</dd></dl><p>指纹只校验记录一致性，不证明田野、量表或来源真实。</p></details>
      <p className={styles.muted}>选择“准备修订此项”后，在下方确认载入此版本，再编辑对应题目或简介。修改后保存并检查新版本；旧记录保留。</p>
    </div>}
    {comparisonError&&<p className={styles.error} role="alert">对照未完成：{comparisonError}</p>}
    {comparison&&<section className={styles.difference} aria-label="修订前后检查对照"><h5>v{comparison.sourceRevision} → v{comparison.targetRevision} · 同一引擎的检出变化</h5><p>本次定位项：<strong>{comparison.targetFinding==='still_detected'?'仍然检出':'不再检出'}</strong>。不再检出不等于问题已解决，也不代表人工批准、效度或 Gate 通过。</p><div className={styles.counts}><span><strong>{comparison.stillDetected.length}</strong> 仍然检出</span><span><strong>{comparison.newlyDetected.length}</strong> 新增检出</span><span><strong>{comparison.noLongerDetected.length}</strong> 不再检出</span></div>{comparison.removedQuestions.length>0&&<div className={styles.warning}><strong>{comparison.targetQuestionDeleted?'本次定位的题目已删除。':'原版本中有题目已删除。'}</strong><p>删除会使对应检查不再出现，不能据此认定修订成功。请另核对研究问题与变量覆盖。</p><ul>{comparison.removedQuestions.map(q=><li key={q.id}>原第 {q.number} 题 · {q.variable||'未编码'} · {q.id}</li>)}</ul></div>}{([['仍然检出',comparison.stillDetected],['新增检出',comparison.newlyDetected],['不再检出（非解决证明）',comparison.noLongerDetected]] as const).map(([title,findings])=><details key={title}><summary>{title} · {findings.length} 项</summary>{findings.length?<ul>{findings.map(f=><li key={JSON.stringify([f.questionId,f.code])}><strong>{f.questionId?`${f.variable||'未编码'} · ${f.questionId}`:'研究简介'} · {f.code}</strong><p>{f.message}</p></li>)}</ul>:<p>本类没有检出项。</p>}</details>)}<p className={styles.muted}>按稳定题目 ID 与问题代码对应，不按题序或 finding 编号配对。只反映此引擎覆盖的机械检查；题意、来源和预试仍须人工核对。</p></section>}
  </section>;
}
