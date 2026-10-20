'use client';

import { useRef } from 'react';
import EditingStudio, { type EditingStudioHandle } from '../editors/EditingStudio';
import type { ReportProposal } from '@/lib/project-report';
import { useHostedReport } from './useHostedReport';

export default function HostedReport({ projectId, title, writable, proposal, onProposalConsumed,resultProposal,onResultHandled }: { projectId: string; title: string; writable: boolean; proposal: ReportProposal | null; onProposalConsumed: () => void;resultProposal?:import("@/lib/research-quality").ResultSnapshot|null;onResultHandled?:()=>void }) {
  const editor = useRef<EditingStudioHandle>(null);
  const { head, initial, generation, loading, busy, uncertain, conflict, error, notice, versions, nextBefore, historyBusy, dirty, status, canWrite, onSnapshot, history, save, load } = useHostedReport({ projectId, title, writable });

  if(loading)return <p role="status">正在恢复报告与 PPT…</p>;
  if(!initial)return <div className="hosted-empty"><p role="alert">{error||'报告暂未载入。'}</p><button onClick={()=>location.reload()}>重新载入</button></div>;
  return <section aria-label="项目报告与 PPT">
    <div className="hosted-project-heading"><div><h3>报告与 PPT</h3><span role="status">{status}</span></div><div className="hosted-actions"><button disabled={busy||uncertain} onClick={()=>void load()}>载入最新版本</button><button className="hosted-primary" disabled={!writable||busy||(conflict&&!uncertain)||(!dirty&&!!head&&!uncertain)} onClick={()=>void save()}>{uncertain?'核对并重试原保存':'保存报告与 PPT'}</button></div></div>
    {error&&<p role="alert" className="hosted-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {proposal&&<aside className="hosted-empty" aria-label="统计章节提案"><h4>{proposal.section.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{proposal.section.body}</p><details><summary>依据与计算口径</summary><pre style={{whiteSpace:'pre-wrap'}}>{proposal.section.source}</pre></details><div className="hosted-actions"><button disabled={busy||!writable||conflict||uncertain} onClick={()=>{if(canWrite()&&editor.current?.appendSection(proposal.section))onProposalConsumed();}}>添加为新章节</button><button onClick={onProposalConsumed}>取消提案</button></div></aside>}
    <details><summary>报告版本 · {versions.length} 个已载入</summary><div className="hosted-actions">{versions.map(version=><button key={version.id} disabled={busy||uncertain} onClick={()=>void load(version.id)}>v{version.revision} · {version.title}</button>)}{nextBefore&&<button disabled={historyBusy} onClick={()=>void history(nextBefore)}>读取更早版本</button>}</div></details>
    <EditingStudio resultProposal={resultProposal} onResultHandled={onResultHandled} key={generation} controllerRef={editor} localOnly projectBinding={{initialContent:initial,status,projectId,readOnly:!writable,onSnapshot,onSave:()=>void save()}}/>
  </section>;
}
