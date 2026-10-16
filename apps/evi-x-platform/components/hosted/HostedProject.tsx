'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { newQuestionnaire, parseCollection, parseHeadResponse, parseProjectResponse, parseProposal, parseProposalSummary, summarizeProposal, parseVersionPage, parseQuestionnaireHead, parseQuestionnaireVersion, parseService, ROLE_LABELS, type MembershipRole, type Project, type Proposal, type ProposalSummary, type Questionnaire, type QuestionnaireHead, type QuestionnaireVersion, type QuestionnaireVersionSummary, type Service } from '@evix/shared';
import type { DesignSnapshot, DesignTransfer } from '@/lib/questionnaire-mapping';
import { parseQuestionnaireLibraryContent } from '@/lib/questionnaire-library';
import { HostedApiError, downloadQuestionnaire, errorMessage, hostedRequest } from './api-client';
import { LoginRequired } from './HostedFrame';
import { useHostedSession } from './HostedSession';
import HostedMembers from './HostedMembers';
import { createSiliconRunner, parseSiliconLimits, serviceNames } from './silicon-runner';
import type { DatasetTransfer } from '@/components/analysis/SurveyLab';
import type { ReportSection } from '@/lib/editor-model';
import type { ReportProposal } from '@/lib/project-report';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';
const QuestionnaireStudio = dynamic(() => import('@/components/design/QuestionnaireStudio'), { loading: () => <p role="status">正在打开问卷编辑器…</p> });
const SurveyLab = dynamic(() => import('@/components/analysis/SurveyLab'), { loading: () => <p role="status">正在打开本地分析工具…</p> });
const SiliconLab = dynamic(() => import('@/components/silicon/SiliconLab'), { loading: () => <p role="status">正在搭建硅基样本舞台…</p> });
const HostedDefense = dynamic(() => import('@/components/hosted/HostedDefense'), { loading: () => <p role="status">正在打开答辩工作区…</p> });
const HostedReport = dynamic(() => import('@/components/hosted/HostedReport'), { loading: () => <p role="status">正在打开报告与 PPT…</p> });
const SurveyCollection = dynamic(() => import('@/components/survey/SurveyCollection'), { loading: () => <p role="status">正在读取发布与回收…</p> });
type SaveRequest = { design: Questionnaire; expectedRevision: number; idempotencyKey: string; sourceProposalId?: string };
type GenerationRequest = { serviceId: string; serviceRevision: number; brief: string; expectedQuestionnaireRevision: number; idempotencyKey: string; consent: true };
type CachedProject={head:QuestionnaireHead|null;initial:Questionnaire;snapshot:DesignSnapshot|null;sourceProposal?:string;proposal:Proposal|null;brief:string;pendingSave:SaveRequest|null;pendingGeneration:GenerationRequest|null;saveUncertain:boolean;generationUncertain:boolean;conflict:boolean};
const fingerprint = (design: Questionnaire) => parseQuestionnaireLibraryContent(design).serialized;

export default function HostedProject({ projectId }: { projectId: string }) {
  const { identityEpoch } = useHostedSession();
  return <LoginRequired><ProjectEditor key={`${identityEpoch}:${projectId}`} projectId={projectId}/></LoginRequired>;
}
function ProjectEditor({ projectId }: { projectId: string }) {
  const [resultProposal,setResultProposal]=useState<import("@/lib/research-quality").ResultSnapshot|null>(null);
  const auth = useHostedSession();
  const cacheKey=`project:${projectId}`;
  // The tab-local draft is read once at mount; state (not a ref) so initializers may use it during render.
  const [cached] = useState(() => auth.getDraft(cacheKey) as CachedProject|undefined);
  const [project, setProject] = useState<Project | null>(null), [role, setRole] = useState<MembershipRole>('viewer');
  const [head, setHead] = useState<QuestionnaireHead | null>(cached?.head||null), [initial, setInitial] = useState<Questionnaire | null>(cached?.initial||null);
  const [snapshot, setSnapshot] = useState<DesignSnapshot | null>(cached?.snapshot||null), [load, setLoad] = useState<{ id: string; design: Questionnaire }>();
  const [versions, setVersions] = useState<QuestionnaireVersionSummary[]>([]), [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState(''), [brief, setBrief] = useState(cached?.brief||''), [consent, setConsent] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(cached?.proposal||null), [sourceProposal, setSourceProposal] = useState<string|undefined>(cached?.sourceProposal);
  const [proposals,setProposals] = useState<ProposalSummary[]>([]);
  const [nextBeforeRevision,setNextBeforeRevision] = useState<number|null>(null);
  const [historyError,setHistoryError] = useState(''), [callsError,setCallsError] = useState('');
  const [loadingHistory,setLoadingHistory] = useState(false);
  const [readonlyDesign,setReadonlyDesign]=useState<Questionnaire|null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [generating, setGenerating] = useState(false), [reading, setReading] = useState(false);
  const [saveUncertain, setSaveUncertain] = useState(!!cached?.pendingSave||cached?.saveUncertain||false), [generationUncertain, setGenerationUncertain] = useState(cached?.generationUncertain||false), [conflict, setConflict] = useState(cached?.conflict||false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [tab, setTab] = useState<'design' | 'silicon' | 'collection' | 'analysis' | 'report' | 'defense' | 'members'>('design');
  const [defenseOpened, setDefenseOpened] = useState(false);
  const [collectionOpened, setCollectionOpened] = useState(false);
  const [reportOpened, setReportOpened] = useState(false), [reportProposal, setReportProposal] = useState<ReportProposal|null>(null);
  const proposeEvidence = useCallback((section:ReportSection) => { setReportProposal({id:crypto.randomUUID(),section}); setReportOpened(true); setTab('report'); }, []);
  const consumeReportProposal = useCallback(() => setReportProposal(null), []);
  const [transfer, setTransfer] = useState<DesignTransfer | null>(null), [analysisOpened, setAnalysisOpened] = useState(false);
  const [siliconOpened, setSiliconOpened] = useState(false), [datasetTransfer, setDatasetTransfer] = useState<DatasetTransfer | null>(null), [siliconMaxCalls, setSiliconMaxCalls] = useState<number | undefined>();
  const alive = useRef(true), latest = useRef<DesignSnapshot | null>(cached?.snapshot||null), draftRevision = useRef(0), headRef = useRef<QuestionnaireHead | null>(cached?.head||null);
  const pendingSave = useRef<SaveRequest | null>(cached?.pendingSave||null), pendingGeneration = useRef<GenerationRequest | null>(cached?.pendingGeneration||null), operation = useRef(false);
  const writable = role === 'owner' || role === 'editor';
  const questionnaireServices = useMemo(() => services.filter(s => s.capabilities.includes('questionnaire')), [services]);
  const questionnaireNames = useMemo(() => serviceNames(questionnaireServices), [questionnaireServices]);
  // Model-backed runs are a write action on the project; viewers can still rehearse with the offline engine.
  const siliconRunner = useMemo(() => writable ? createSiliconRunner({ projectId, services, localTest: auth.session?.mode === 'local_test', mutate: auth.mutate, maxCalls: siliconMaxCalls }) : null, [writable, projectId, services, auth.session?.mode, auth.mutate, siliconMaxCalls]);
  useEffect(() => {
    if (!siliconOpened || !writable) return;
    let live = true;
    hostedRequest(`/api/projects/${projectId}/silicon-runs`).then(value => { if (live) setSiliconMaxCalls(parseSiliconLimits(value)?.maxCalls); }).catch(() => { /* the server still enforces its limit */ });
    return () => { live = false; };
  }, [siliconOpened, writable, projectId]);
  const savedFingerprint = head ? fingerprint(head.design) : initial ? fingerprint(initial) : '';
  const dirty = !!snapshot && (snapshot.pending || fingerprint(snapshot.design) !== savedFingerprint);
  const revision = head?.revision || 0;
  const tabMotion = useKeyedListMotion<HTMLDivElement>({ ids: ['design', 'silicon', 'collection', 'analysis', 'report', 'defense', 'members'], activeId: tab, markerAxis: 'horizontal' });
  const proposalMotion = useContentReveal<HTMLOListElement>({ token: proposal?.design ? `${proposal.id}:${proposal.status}` : null });
  const saveState = saving ? 'saving' : saveUncertain ? 'uncertain' : conflict ? 'conflict' : dirty ? 'dirty' : revision ? 'saved' : 'empty';
  const { cacheDraft, setUnsaved } = auth, userId = auth.session?.user?.id;
  useLayoutEffect(()=>{if(initial&&userId)cacheDraft(cacheKey,{head,initial,snapshot,sourceProposal,proposal,brief,pendingSave:pendingSave.current,pendingGeneration:pendingGeneration.current,saveUncertain:saveUncertain||saving,generationUncertain:generationUncertain||generating,conflict} satisfies CachedProject,dirty||saving||saveUncertain,userId);},[cacheKey,head,initial,snapshot,sourceProposal,proposal,brief,saveUncertain,generationUncertain,conflict,dirty,saving,generating,userId,cacheDraft]);
  const onSnapshot = useCallback((next: DesignSnapshot) => { latest.current = next; draftRevision.current++; setSnapshot(next); }, []);
  const detach = useCallback(() => setSourceProposal(undefined), []);
  const acknowledgeLoad = useCallback(() => setLoad(undefined), []);
  function rememberHead(value: QuestionnaireHead | null) { headRef.current = value; setHead(value); }
  const reloadVersions = useCallback(async (before?: number) => {
    setLoadingHistory(true);
    try {
      const page = parseVersionPage(await hostedRequest(`/api/projects/${projectId}/questionnaire/versions${before ? `?beforeRevision=${before}` : ''}`));
      if (alive.current) { setVersions(rows => before ? [...rows, ...page.versions.filter(v => !rows.some(row => row.id === v.id))] : page.versions); setNextBeforeRevision(page.nextBeforeRevision); setHistoryError(''); }
    } catch(e) { if (alive.current) setHistoryError(errorMessage(e)); }
    finally { if (alive.current) setLoadingHistory(false); }
  }, [projectId]);
  const reloadProposals = useCallback(async () => {
    try {
      const rows=parseCollection(await hostedRequest(`/api/projects/${projectId}/proposals`),'proposals',parseProposalSummary,50);
      if(alive.current) {setProposals(rows);setCallsError('');}
    } catch(e) {if(alive.current)setCallsError(errorMessage(e));}
  },[projectId]);
  useEffect(() => {
    alive.current = true;
    let cancelled=false;
    void (async () => {
      try {
        const [p, q, s] = await Promise.all([hostedRequest(`/api/projects/${projectId}`), hostedRequest(`/api/projects/${projectId}/questionnaire`), hostedRequest('/api/services').catch(() => ({services:[]}))]);
        const data = parseProjectResponse(p), saved = parseHeadResponse(q), connections = parseCollection(s, 'services', parseService, 8);
        if (!alive.current || cancelled) return;
        setProject(data.project); setRole(data.membershipRole);
        if(cached){if((saved?.revision||0)!==(cached.head?.revision||0)){setConflict(true);setNotice('已恢复本标签页的草稿；云端版本已变化，请先核对最新版本。');}else setNotice('已恢复本标签页的编辑与撤销历史。未保存内容仅在当前登录会话内保留。');}
        else{rememberHead(saved);setInitial(saved?.design||newQuestionnaire());}
        setServices(connections); setServiceId(connections.find(s => s.capabilities.includes('questionnaire'))?.id || '');
        void reloadVersions(); void reloadProposals();
      } catch (e) { if (alive.current && !cancelled) setError(errorMessage(e)); }
      finally { if (alive.current && !cancelled) setLoading(false); }
    })();
    return () => { cancelled=true; alive.current = false; };
  }, [projectId, cached, reloadVersions, reloadProposals]);
  useEffect(() => { setUnsaved(projectId, dirty || saving || saveUncertain); return () => setUnsaved(projectId, false); }, [setUnsaved, projectId, dirty, saving, saveUncertain]);
  function loadDesign(design: Questionnaire, message: string, origin?: string) {
    if(!writable){setReadonlyDesign(design);setNotice(message);return;}
    if (latest.current?.pending) { setError('请先修正暂存的数值输入，再载入设计。'); return; }
    if (dirty && !window.confirm('载入后将替换当前编辑内容，原内容仍可撤销恢复。继续载入？')) return;
    setSourceProposal(origin); setLoad({ id: crypto.randomUUID(), design }); setTab('design'); setNotice(message); setError('');
  }
  async function save() {
    if (operation.current || !writable || (!pendingSave.current && (!latest.current || latest.current.pending || conflict))) return;
    operation.current = true; setSaving(true); setError('');
    pendingSave.current ??= { design: structuredClone(latest.current!.design), expectedRevision: headRef.current?.revision || 0, idempotencyKey: crypto.randomUUID(), ...(sourceProposal ? { sourceProposalId: sourceProposal } : {}) };
    try {
      const receipt = parseQuestionnaireHead(await auth.mutate(`/api/projects/${projectId}/questionnaire/versions`, pendingSave.current));
      if (!alive.current) return;
      // A retry returns its original receipt. Read the current head separately before adopting a new base.
      const current = parseHeadResponse(await hostedRequest(`/api/projects/${projectId}/questionnaire`));
      if (!alive.current) return;
      if (!current || current.revision < receipt.revision) throw Error('保存回执与当前版本尚未完成核对，请重试原保存。');
      pendingSave.current = null; setSaveUncertain(false); setSourceProposal(undefined);
      if (current.revision > receipt.revision) { setConflict(true); setNotice(`本次已保存为 v${receipt.revision}；云端已有 v${current.revision}。当前编辑已保留，请核对最新版本。`); }
      else { rememberHead(current); setConflict(false); setNotice(`已保存 v${receipt.revision}。${latest.current && fingerprint(latest.current.design) !== fingerprint(receipt.design) ? '保存期间的新编辑仍在本页，需再次保存。' : '刷新或重新登录后可恢复。'}`); }
      await reloadVersions().catch(() => { if(alive.current)setNotice(`已保存 v${receipt.revision}，历史列表暂未刷新。`); });
    } catch (e) {
      if (!alive.current) return;
      setError(errorMessage(e));
      if (e instanceof HostedApiError && e.status === 409) { pendingSave.current = null; setSaveUncertain(false); setConflict(true); }
      else if (e instanceof HostedApiError && e.status >= 400 && e.status < 500) { pendingSave.current = null; setSaveUncertain(false); }
      else setSaveUncertain(true);
    } finally { operation.current = false; if (alive.current) setSaving(false); }
  }
  async function refreshHead(keepLocal: boolean) {
    if (operation.current || saving || saveUncertain || pendingSave.current) return;
    operation.current = true; setReading(true); setError(''); const before = draftRevision.current;
    try {
      const current = parseHeadResponse(await hostedRequest(`/api/projects/${projectId}/questionnaire`));
      if (!alive.current) return;
      if (before !== draftRevision.current) throw Error('读取期间设计已修改，已保留最新编辑。请重新核对。');
      if (!keepLocal && dirty && !window.confirm('用最新云端版本替换本页设计？当前内容可通过撤销恢复，建议先下载备份。')) return;
      if (keepLocal && !window.confirm('以最新云端版本为基础，继续保留本页手工草稿？下一次保存将形成新版本，请先比较两份内容。')) return;
      rememberHead(current); pendingSave.current = null; setSaveUncertain(false); setConflict(false); setSourceProposal(undefined);
      if (!keepLocal) {if(writable)setLoad({ id: crypto.randomUUID(), design: current?.design || newQuestionnaire() });else setReadonlyDesign(current?.design || newQuestionnaire());}
      setNotice(keepLocal ? '已核对云端版本，保留本页内容作为手工草稿。请检查后保存。' : '已载入最新云端版本。'); await reloadVersions();
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { operation.current = false; if (alive.current) setReading(false); }
  }
  async function history(version: QuestionnaireVersionSummary) {
    if (operation.current || saving || saveUncertain) return;
    operation.current = true; setReading(true); setError(''); const before = draftRevision.current;
    try {
      const data = parseQuestionnaireVersion(await hostedRequest(`/api/projects/${projectId}/questionnaire/versions/${version.id}`), true) as QuestionnaireVersion;
      if (!alive.current) return;
      if (before !== draftRevision.current) throw Error('读取期间设计已变化，未替换新编辑。请重新载入历史。');
      loadDesign(data.design, `已载入历史 v${data.revision}。保存将新增版本，保留历史原件。`);
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { operation.current = false; if (alive.current) setReading(false); }
  }
  async function generate() {
    if (generating || !writable || conflict || saving || saveUncertain) return;
    const service = services.find(s => s.id === serviceId);
    if (!pendingGeneration.current && (!service || !consent || !brief.trim())) return;
    pendingGeneration.current ??= { serviceId: service!.id, serviceRevision: service!.revision, brief: brief.trim(), expectedQuestionnaireRevision: headRef.current?.revision || 0, idempotencyKey: crypto.randomUUID(), consent: true };
    setGenerating(true); setError('');
    try {
      const value = parseProposal(await auth.mutate(`/api/projects/${projectId}/proposals`, pendingGeneration.current));
      if (!alive.current) return;
      setProposal(value); pendingGeneration.current = null; setGenerationUncertain(false);
      setProposals(rows => [summarizeProposal(value),...rows.filter(p=>p.id!==value.id)].slice(0,50));
      setNotice(value.status === 'ready' ? '问卷建议已生成，请预览后确认应用。' : value.status === 'failed' ? '本次生成未完成。当前问卷没有变化。' : '本次调用尚待核对，系统不会自动重新调用模型。');
    } catch (e) {
      if (!alive.current) return;
      setError(errorMessage(e));
      if (e instanceof HostedApiError && e.status >= 400 && e.status < 500) { pendingGeneration.current = null; setGenerationUncertain(false); }
      else setGenerationUncertain(true);
    } finally { if (alive.current) setGenerating(false); }
  }
  async function refreshProposal() {
    if (!proposal || generating) return;
    setGenerating(true); setError('');
    try { const result = parseProposal(await hostedRequest(`/api/projects/${projectId}/proposals/${proposal.id}`)); if (alive.current) setProposal(result); }
    catch (e) { if (alive.current) setError(errorMessage(e)); } finally { if (alive.current) setGenerating(false); }
  }
  async function openProposal(id: string) {
    if (generating) return;
    setGenerating(true); setCallsError('');
    try { const result = parseProposal(await hostedRequest(`/api/projects/${projectId}/proposals/${id}`)); if (alive.current) {setProposal(result); setTab('design');} }
    catch(e) {if(alive.current)setCallsError(errorMessage(e));}
    finally {if(alive.current)setGenerating(false);}
  }
  if (loading) return <p className="hosted-loading" role="status">正在恢复项目与问卷版本…</p>;
  if (!project || !initial) return <div className="hosted-empty"><h2>暂时无法打开项目</h2><p role="alert">{error}</p><Link href="/projects">返回项目列表</Link></div>;
  return <div data-knowledge-context="active" data-knowledge-module={tab === 'report' ? 'editor' : tab} data-knowledge-tags={tab === 'analysis' ? 'inference' : tab === 'design' ? 'scale' : tab === 'report' ? 'report' : undefined}>
    <div className="hosted-project-heading"><div><Link href="/projects">← 我的项目</Link><h2>{project.title}</h2><span className="hosted-small">{ROLE_LABELS[role]} · 问卷 {revision ? `v${revision}` : '尚未保存'}</span></div><div className="hosted-actions"><button onClick={() => snapshot && downloadQuestionnaire(snapshot.design)} disabled={!snapshot}>下载当前设计</button><button className="hosted-primary" onClick={() => void save()} disabled={!writable || !snapshot || snapshot.pending || saving || reading || conflict || saveUncertain || !dirty}>{saving ? '正在保存…' : '保存新版本'}</button></div></div>
    <div ref={tabMotion} className="hosted-tabs" role="group" aria-label="项目工作区"><span className="hosted-tab-marker" data-motion-marker aria-hidden="true"/><button data-motion-id="design" aria-pressed={tab === 'design'} onClick={() => setTab('design')}>问卷设计</button><button data-motion-id="silicon" aria-pressed={tab === 'silicon'} onClick={() => { setSiliconOpened(true); setTab('silicon'); }}>硅基样本</button><button data-motion-id="collection" aria-pressed={tab === 'collection'} onClick={() => { setCollectionOpened(true); setTab('collection'); }}>发布与回收</button><button data-motion-id="analysis" aria-pressed={tab === 'analysis'} onClick={() => { setAnalysisOpened(true); setTab('analysis'); }}>数据分析</button><button data-motion-id="report" aria-pressed={tab === 'report'} onClick={() => { setReportOpened(true); setTab('report'); }}>报告与 PPT</button><button data-motion-id="defense" aria-pressed={tab === 'defense'} onClick={() => { setDefenseOpened(true); setTab('defense'); }}>路演与答辩</button><button data-motion-id="members" aria-pressed={tab === 'members'} onClick={() => setTab('members')}>团队成员</button></div>
    {error && <p className="hosted-alert" role="alert">{error}</p>}{notice && <p className="hosted-notice" role="status">{notice}</p>}
    {(proposal || generationUncertain) && tab !== 'design' && <p className="hosted-notice"><span>{generationUncertain?'模型调用待核对，原请求已保留。':'模型提案已保留，可返回问卷设计查看。'}</span><button onClick={()=>setTab('design')}>查看生成结果与状态</button></p>}
    {saveUncertain && <div className="hosted-notice"><p>上次保存尚待核对。重试会使用原内容和原请求标识；本页新编辑仍保留。</p><button disabled={saving} onClick={() => void save()}>核对并重试原保存</button></div>}
    {conflict && <div className="hosted-conflict" role="alert"><strong>云端版本已更新，当前草稿已保留。</strong><p>可以先下载本页设计，再载入云端版本。也可以确认以最新版本为基础保留手工草稿。</p><div className="hosted-actions"><button disabled={reading || saving || saveUncertain} onClick={() => void refreshHead(false)}>载入最新云端版本</button><button disabled={reading || saving || saveUncertain} onClick={() => void refreshHead(true)}>保留当前草稿并核对版本</button></div></div>}
    <div hidden={tab !== 'design'}>
      <div className="hosted-project-tools"><details className="hosted-project-tool" open={!head || generationUncertain}><summary><span>生成问卷建议</span><small>{generationUncertain?'请求待核对':generating?'正在生成…':'按需使用模型'}</small></summary><div className="hosted-project-tool-body"><span className="hosted-kicker">提出需求 → 预览建议 → 确认应用</span>{writable ? <><label>模型服务<select value={serviceId} disabled={generating || generationUncertain} onChange={e => { setServiceId(e.target.value); setConsent(false); }}>{!questionnaireServices.length && <option value="">请先配置个人模型服务</option>}{questionnaireServices.map(s => <option key={s.id} value={s.id}>{questionnaireNames.get(s.id)} · v{s.revision}</option>)}</select></label><Link href="/services">管理我的模型服务 →</Link><label>研究需求<textarea rows={4} maxLength={6000} disabled={generating || generationUncertain} value={brief} placeholder="说明研究目标、目标群体，以及希望支持的决策。" onChange={e => { setBrief(e.target.value); setConsent(false); }}/></label><label className="hosted-consent"><input type="checkbox" checked={consent} disabled={generating || generationUncertain} onChange={e => setConsent(e.target.checked)}/><span>{auth.session?.mode === 'local_test' ? '确认使用合成模型验收本次需求，不产生真实模型费用。' : `同意将上方研究需求发送到 ${services.find(s => s.id === serviceId)?.provider || '所选供应商'}，用于生成问卷建议，并使用我的 API 额度。`}</span></label><button className="hosted-primary" disabled={generating || generationUncertain || !serviceId || !consent || !brief.trim() || saving || saveUncertain || conflict} onClick={() => void generate()}>{generating ? '正在等待回执…' : '生成问卷建议'}</button>{generationUncertain && <div className="hosted-notice"><p>请求回执未到，原请求已保留。</p><button disabled={generating} onClick={() => void generate()}>核对原生成请求</button></div>}</> : <p>当前角色可查看问卷和历史版本。生成与编辑由负责人或编辑成员进行。</p>}</div></details>
        <details className="hosted-project-tool"><summary><span>版本历史</span><small>{historyError?'读取未完成':revision?`当前 v${revision}`:'尚未保存'}</small></summary><div className="hosted-project-tool-body"><div className="hosted-section-title"><h3>已保存版本</h3><button disabled={loadingHistory || reading || saving || saveUncertain} onClick={() => void reloadVersions().catch(e => setError(errorMessage(e)))}>刷新</button></div><p className="hosted-small">历史载入只影响本页；保存后新增版本。每次读取 100 条。</p>{historyError&&<p role="alert">{historyError}</p>}<div className="hosted-history">{versions.length ? versions.map(v => <div key={v.id}><span><strong>v{v.revision} · {v.title || '未命名问卷'}</strong><small>{new Date(v.createdAt).toLocaleString('zh-CN')}</small></span><button disabled={reading || saving || saveUncertain} onClick={() => void history(v)}>载入编辑器</button></div>) : <p>第一次保存后，版本会出现在这里。</p>}</div>{nextBeforeRevision!==null&&<button disabled={loadingHistory || reading || saving} onClick={()=>void reloadVersions(nextBeforeRevision)}>加载更早版本</button>}<button disabled={reading || saving || saveUncertain} onClick={() => void refreshHead(false)}>核对并载入最新版本</button></div></details>
      <details className="hosted-project-tool"><summary><span>近期模型调用</span><small>{proposals.length} 条记录{callsError?' · 读取未完成':''}</small></summary><div className="hosted-project-tool-body"><p className="hosted-small">本项目由你发起的提案和调用状态可在重新登录后查看。</p><button disabled={generating} onClick={()=>void reloadProposals().catch(e=>setError(errorMessage(e)))}>刷新调用记录</button>{callsError&&<p role="alert">{callsError}</p>}<div className="hosted-history">{proposals.map(p=><div key={p.id}><span><strong>{p.title || ({running:'运行中',outcome_unknown:'结果待核对',failed:'生成失败',ready:'已生成'}[p.status])}</strong><small>{new Date(p.createdAt).toLocaleString('zh-CN')} · 基于 v{p.inputRevision}</small></span><button disabled={generating} onClick={()=>void openProposal(p.id)}>查看提案与状态</button></div>)}{!proposals.length&&<p>尚无模型调用记录。</p>}</div></div></details></div>
      {proposal && <section className="hosted-card hosted-proposal" aria-label="模型问卷提案"><span className="hosted-kicker">模型提案 · 基于问卷 v{proposal.inputRevision}</span><h3>{proposal.design?.title || '调用状态'}</h3>{proposal.design ? <><p>{proposal.design.objective}</p><ol ref={proposalMotion}>{proposal.design.questions.map(q => <li key={q.id}><strong>{q.text}</strong>{q.choices.length > 0 && <p>{q.choices.map(c => c.label).join(' / ')}</p>}</li>)}</ol>{proposal.inputRevision !== revision && <p className="hosted-alert">这份提案基于较早版本，保留供参考。请按当前版本重新生成。</p>}<div className="hosted-actions"><button className="hosted-primary" disabled={!writable || proposal.inputRevision !== revision || reading || saving || saveUncertain || conflict} onClick={() => loadDesign(proposal.design!, '已应用拟议设计，仍需检查与预测试；点击保存才会写入云端。', proposal.id)}>确认应用提案</button><button onClick={() => downloadQuestionnaire(proposal.design, '模型问卷提案.json')}>下载提案</button><button onClick={() => setProposal(null)}>收起提案</button></div></> : <><p>{proposal.status === 'failed' ? '本次生成失败。可以核对配置后再次发起。' : '调用结果尚未明确，当前设计没有改变。核对只查询已保存状态。'}</p>{proposal.errorCode && <small>状态代码：{proposal.errorCode}</small>}<button disabled={generating} onClick={() => void refreshProposal()}>核对调用状态</button></>}</section>}
      <p className="hosted-edit-status" data-state={saveState} role="status"><span className="hosted-save-indicator" aria-hidden="true"/>{saving ? '正在等待云端保存回执…' : saveUncertain ? '保存结果待核对' : conflict ? '云端版本有变化，请核对后保存' : dirty ? '有未保存的修改' : revision ? `已与云端 v${revision} 对齐` : '从空白设计开始'}{snapshot?.pending && ' · 请修正暂存数值后保存'}</p>
      {writable?<fieldset className="hosted-editor-fieldset" disabled={reading}><legend className="hosted-sr-only">项目问卷编辑器</legend><QuestionnaireStudio localOnly onSnapshot={onSnapshot} onAnalyze={value => { setTransfer({ id: crypto.randomUUID(), snapshot: value }); setAnalysisOpened(true); setTab('analysis'); }} hosted={{ initialDesign: initial,cacheKey:`questionnaire:${projectId}`, load, savedFingerprint: head ? savedFingerprint : undefined, onLoaded: acknowledgeLoad, onDetachProposal: detach }}/></fieldset>:<ReadonlyQuestionnaire design={readonlyDesign||head?.design||initial}/>}
    </div>
    {siliconOpened && <div hidden={tab !== 'silicon'}><SiliconLab designSnapshot={snapshot} runner={siliconRunner} storageKey={`evix.silicon-lab.v1:${projectId}`} onSendToAnalysis={handoff => { setDatasetTransfer(handoff); setAnalysisOpened(true); setTab('analysis'); }}/></div>}
    {collectionOpened && <div hidden={tab !== 'collection'}><SurveyCollection projectId={projectId} savedRevision={revision} canPublish={!dirty && !saving && !saveUncertain && !conflict} writable={writable} onAnalyze={value => { setDatasetTransfer(value); setAnalysisOpened(true); setTab('analysis'); }}/></div>}
    {analysisOpened && <div hidden={tab !== 'analysis'}><SurveyLab onResultSnapshot={writable?result=>{setResultProposal(result);setReportOpened(true);setTab("report");}:undefined} designSnapshot={snapshot} designTransfer={transfer} datasetTransfer={datasetTransfer} onEvidenceProposal={writable?proposeEvidence:undefined}/></div>}
    {reportOpened && <div hidden={tab !== 'report'}><HostedReport resultProposal={resultProposal} onResultHandled={()=>setResultProposal(null)} projectId={projectId} title={project.title} writable={writable} proposal={reportProposal} onProposalConsumed={consumeReportProposal}/></div>}
    {defenseOpened && <div hidden={tab !== 'defense'}><HostedDefense projectId={projectId} onOpenReport={() => { setReportOpened(true); setTab('report'); }}/></div>}
    {tab === 'members' && <HostedMembers teamId={project.teamId} role={role}/>}
  </div>;
}
function ReadonlyQuestionnaire({design}:{design:Questionnaire}){
  return <section className="hosted-card"><div className="hosted-section-title"><h3>{design.title}</h3><button onClick={()=>downloadQuestionnaire(design)}>下载所查看的版本</button></div><p>{design.objective}</p><p className="hosted-small">调查对象：{design.population||'待填写'} · 拟议设计</p><p>{design.introduction}</p><ol>{design.questions.map(q=><li key={q.id}><h4>{q.text||'题干待填写'}</h4><p className="hosted-small">{q.variable} · {q.type}{q.required?' · 拟必答':''}</p>{q.choices.length>0&&<ul>{q.choices.map((c,index)=><li key={index}>{c.code} · {c.label||'选项待填写'}</li>)}</ul>}{q.type==='likert'&&<p>{q.min}（{q.minLabel}）至 {q.max}（{q.maxLabel}）</p>}<details><summary>研究映射与依据</summary><p>{q.researchQuestion||'研究问题待填写'}</p><p>{q.decisionUse||'决策用途待填写'}</p><p>{q.source||'来源待填写'}</p>{q.condition&&<p>显示条件：{q.condition.questionId} = {q.condition.codes.join(' / ')}</p>}</details></li>)}</ol><p className="hosted-small">{design.pilotNotes}</p></section>;
}
