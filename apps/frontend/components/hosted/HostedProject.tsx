'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { newQuestionnaire, parseCollection, parseHeadResponse, parseProjectResponse, parseProposal, parseProposalSummary, summarizeProposal, parseVersionPage, parseQuestionnaireHead, parseQuestionnaireVersion, parseService, ROLE_LABELS, type MembershipRole, type Project, type Proposal, type ProposalSummary, type Questionnaire, type QuestionnaireHead, type QuestionnaireVersion, type QuestionnaireVersionSummary, type Service } from '@evix/shared';
import {canonical,type DesignSnapshot} from '@/lib/questionnaire-mapping';
import TopicQuestionnaireProposal from '@/components/topic-advisor/TopicQuestionnaireProposal';
import type {HostedDesignLoad} from '@/components/design/QuestionnaireStudio';
import {prepareTopicQuestionnaireMutation,prepareTopicRestoreMutation,verifyTopicBindingReceipt,type TopicBindingMutation,type TopicBindingReceipt} from '@/lib/topic-questionnaire-api';
import type {TopicQuestionnaireApplication,TopicQuestionnaireBinding,TopicQuestionnaireSource,TopicQuestionnaireTarget} from '@/lib/topic-questionnaire';
import type {TopicResearchBrief,TopicVersionSummary} from '@/lib/topic-project';
import { parseQuestionnaireLibraryContent } from '@/lib/questionnaire-library';
import { HostedApiError, downloadQuestionnaire, errorMessage, hostedRequest } from './api-client';
import { LoginRequired } from './HostedFrame';
import { useHostedSession } from './HostedSession';
import HostedMembers from './HostedMembers';
import ResearchViewHost from '../research-view/ResearchViewHost';
import { createSiliconRunner, parseSiliconLimits, serviceNames } from './silicon-runner';
import type { ReportSection } from '@/lib/editor-model';
import { useHandoffAcknowledgement, useWorkbenchHandoffs } from '@/components/workbench/useWorkbenchHandoffs';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';
const QuestionnaireStudio = dynamic(() => import('@/components/design/QuestionnaireStudio'), { loading: () => <p role="status">正在打开问卷编辑器…</p> });
const SurveyLab = dynamic(() => import('@/components/analysis/SurveyLab'), { loading: () => <p role="status">正在打开本地分析工具…</p> });
const SiliconLab = dynamic(() => import('@/components/silicon/SiliconLab'), { loading: () => <p role="status">正在搭建硅基样本舞台…</p> });
const HostedDefense = dynamic(() => import('@/components/hosted/HostedDefense'), { loading: () => <p role="status">正在打开答辩工作区…</p> });
const HostedReport = dynamic(() => import('@/components/hosted/HostedReport'), { loading: () => <p role="status">正在打开报告与 PPT…</p> });
const SurveyCollection = dynamic(() => import('@/components/survey/SurveyCollection'), { loading: () => <p role="status">正在读取发布与回收…</p> });
const HostedTopic = dynamic(() => import('@/components/hosted/HostedTopic'), { loading: () => <p role="status">正在恢复选题与研究简报…</p> });

type ProjectTab = 'topic' | 'design' | 'silicon' | 'collection' | 'analysis' | 'report' | 'defense' | 'members';
type SaveRequest = { design: Questionnaire; expectedRevision: number; idempotencyKey: string; sourceProposalId?: string; topicBindingMutation?:TopicBindingMutation };
type PendingTopicApply={application:TopicQuestionnaireApplication;source:TopicQuestionnaireSource;target:TopicQuestionnaireTarget;editRevision:number;expectedBefore:string};
type TopicReconciliation={versionId:string;beforeBinding:TopicQuestionnaireBinding|null};
type GenerationRequest = { serviceId: string; serviceRevision: number; brief: string; expectedQuestionnaireRevision: number; idempotencyKey: string; consent: true };
type CachedProject={head:QuestionnaireHead|null;headBinding?:TopicQuestionnaireBinding|null;initial:Questionnaire;snapshot:DesignSnapshot|null;sourceProposal?:string;proposal:Proposal|null;brief:string;pendingSave:SaveRequest|null;pendingBinding?:TopicQuestionnaireBinding|null;pendingTopicApply?:PendingTopicApply|null;topicReconciliation?:TopicReconciliation|null;pendingGeneration:GenerationRequest|null;saveUncertain:boolean;generationUncertain:boolean;conflict:boolean;tab?:ProjectTab};
const fingerprint = (design: Questionnaire) => parseQuestionnaireLibraryContent(design).serialized;

export default function HostedProject({ projectId }: { projectId: string }) {
  const { identityEpoch } = useHostedSession();
  return <LoginRequired><ProjectEditor key={`${identityEpoch}:${projectId}`} projectId={projectId}/></LoginRequired>;
}
function ProjectEditor({ projectId }: { projectId: string }) {
  const auth = useHostedSession();
  const { store: handoffs, snapshot: exchange } = useWorkbenchHandoffs(
    JSON.stringify(['project', auth.session?.user?.id ?? null, auth.identityEpoch, projectId]),
  );
  const consumeResult = useHandoffAcknowledgement(handoffs, 'result', exchange.pending.result?.deliveryId);
  const consumeReportProposal = useHandoffAcknowledgement(handoffs, 'report', exchange.pending.report?.deliveryId);
  const cacheKey=`project:${projectId}`;
  // The tab-local draft is read once at mount; state (not a ref) so initializers may use it during render.
  const [cached] = useState(() => auth.getDraft(cacheKey) as CachedProject|undefined);
  const [project, setProject] = useState<Project | null>(null), [role, setRole] = useState<MembershipRole>('viewer');
  const [head, setHead] = useState<QuestionnaireHead | null>(cached?.head||null), [initial, setInitial] = useState<Questionnaire | null>(cached?.initial||null);
  const [snapshot, setSnapshot] = useState<DesignSnapshot | null>(cached?.snapshot||null), [load, setLoad] = useState<HostedDesignLoad>();
  const [headBinding,setHeadBinding]=useState<TopicQuestionnaireBinding|null>(cached?.headBinding??null),[bindingReady,setBindingReady]=useState(false);
  const [topicSource,setTopicSource]=useState<TopicQuestionnaireSource|null>(null),[topicProposalOpen,setTopicProposalOpen]=useState(false);
  const [topicReconciliation,setTopicReconciliation]=useState<TopicReconciliation|null>(cached?.topicReconciliation??null);
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
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [tab, setTab] = useState<ProjectTab>(cached?.tab || 'design');
  const [topicOpened, setTopicOpened] = useState(cached?.tab === 'topic');
  const [defenseOpened, setDefenseOpened] = useState(cached?.tab === 'defense');
  const [collectionOpened, setCollectionOpened] = useState(cached?.tab === 'collection');
  const [reportOpened, setReportOpened] = useState(cached?.tab === 'report');
  const proposeEvidence = useCallback((section:ReportSection) => { handoffs.publish('report',{id:crypto.randomUUID(),section}); setReportOpened(true); setTab('report'); }, [handoffs]);
  const openResearchEditor = useCallback((section: 'design' | 'report') => { if (section === 'report') setReportOpened(true); setTab(section); }, []);
  const [analysisOpened, setAnalysisOpened] = useState(cached?.tab === 'analysis');
  const [siliconOpened, setSiliconOpened] = useState(cached?.tab === 'silicon'), [siliconMaxCalls, setSiliconMaxCalls] = useState<number | undefined>();
  const alive = useRef(true), latest = useRef<DesignSnapshot | null>(cached?.snapshot||null), draftRevision = useRef(0), headRef = useRef<QuestionnaireHead | null>(cached?.head||null);
  const pendingSave = useRef<SaveRequest | null>(cached?.pendingSave||null), pendingGeneration = useRef<GenerationRequest | null>(cached?.pendingGeneration||null), operation = useRef(false);
  const pendingTopicApply=useRef<PendingTopicApply|null>(cached?.pendingTopicApply??null),sourceLive=useRef<TopicQuestionnaireSource|null>(null),selectedSource=useRef<TopicQuestionnaireSource|null>(null),sourceEpoch=useRef(0);
  const pendingBinding=useRef<TopicQuestionnaireBinding|null>(cached?.pendingBinding??null),publishedRevision=useRef(0);
  const reconciliationRef=useRef(topicReconciliation);
  const loadCompletion=useRef<{id:string;resolve:(accepted:boolean)=>void}|null>(null),headBindingRef=useRef(headBinding),writableRef=useRef(false);
  const writable = role === 'owner' || role === 'editor';
  const ownerId=auth.session?.user?.id??'',identityEpoch=auth.identityEpoch,isCurrentAccount=auth.isCurrentAccount;
  const [mountedScope]=useState(()=>({ownerId,identityEpoch,projectId}));
  const liveScope=useRef({ownerId,identityEpoch,projectId});
  const currentAccount=useCallback(()=>alive.current&&mountedScope.ownerId===ownerId&&mountedScope.identityEpoch===identityEpoch&&mountedScope.projectId===projectId&&liveScope.current.ownerId===ownerId&&liveScope.current.identityEpoch===identityEpoch&&liveScope.current.projectId===projectId&&isCurrentAccount(ownerId,identityEpoch),[isCurrentAccount,ownerId,identityEpoch,projectId,mountedScope]);
  useLayoutEffect(()=>{writableRef.current=writable;headBindingRef.current=headBinding;liveScope.current={ownerId,identityEpoch,projectId};},[writable,headBinding,ownerId,identityEpoch,projectId]);
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
  const dirty = !!snapshot && (snapshot.pending || fingerprint(snapshot.design) !== savedFingerprint||canonical(snapshot.topicBinding??null)!==canonical(headBinding));
  const revision = head?.revision || 0;
  const tabMotion = useKeyedListMotion<HTMLDivElement>({ ids: ['topic', 'design', 'silicon', 'collection', 'analysis', 'report', 'defense', 'members'], activeId: tab, markerAxis: 'horizontal' });
  const proposalMotion = useContentReveal<HTMLOListElement>({ token: proposal?.design ? `${proposal.id}:${proposal.status}` : null });
  const saveState = saving ? 'saving' : saveUncertain ? 'uncertain' : conflict ? 'conflict' : dirty ? 'dirty' : revision ? 'saved' : 'empty';
  const topicDisabledReason=saving?'正在等待本次保存回执，请保留当前提案。':saveUncertain?'保存回执尚待核对。请使用原保存请求核对，所选字段仍保留。':reading?'正在读取版本与来源绑定，请稍后继续。':conflict?'云端基础版本需要核对，请先选择保留草稿或载入已保存版本。':!bindingReady?'正在核对来源绑定，请稍后继续。':'';
  const { cacheDraft, setUnsaved } = auth, userId = auth.session?.user?.id;
  useLayoutEffect(()=>{if(initial&&userId)cacheDraft(cacheKey,{head,headBinding,initial,snapshot,sourceProposal,proposal,brief,pendingSave:pendingSave.current,pendingBinding:pendingBinding.current,pendingTopicApply:pendingTopicApply.current,topicReconciliation,pendingGeneration:pendingGeneration.current,saveUncertain:saveUncertain||saving,generationUncertain:generationUncertain||generating,conflict,tab} satisfies CachedProject,dirty||saving||saveUncertain,userId);},[cacheKey,head,headBinding,initial,snapshot,sourceProposal,proposal,brief,saveUncertain,generationUncertain,conflict,dirty,saving,generating,userId,cacheDraft,tab,topicReconciliation]);
  const onSnapshot = useCallback((next: DesignSnapshot) => {if(!currentAccount())return; latest.current = next; draftRevision.current++;publishedRevision.current=draftRevision.current; setSnapshot(next); }, [currentAccount]);
  const detach = useCallback(() => setSourceProposal(undefined), []);
  const acknowledgeLoad = useCallback((id:string,accepted:boolean) => {setLoad(value=>value?.id===id?undefined:value);if(loadCompletion.current?.id===id){loadCompletion.current.resolve(accepted);loadCompletion.current=null;}}, []);
  const onEditorEdit=useCallback(()=>{if(currentAccount()&&writableRef.current)draftRevision.current++;},[currentAccount]);
  const sourceChange=useCallback((source:TopicQuestionnaireSource|null)=>{if(!currentAccount())return;sourceEpoch.current++;sourceLive.current=source;if(selectedSource.current&&canonical(selectedSource.current)!==canonical(source)){selectedSource.current=null;setTopicSource(null);}},[currentAccount]);
  const startQuestionnaire=useCallback((brief:TopicResearchBrief,version:TopicVersionSummary,decisionRevision:number)=>{const source={brief:structuredClone(brief),version:structuredClone(version),dirty:false,decisionRevision};if(!currentAccount()||!writableRef.current||!sourceLive.current||canonical(source)!==canonical(sourceLive.current))return;selectedSource.current=source;setTopicSource(source);setTopicProposalOpen(true);setTab('design');},[currentAccount]);
  function rememberHead(value: QuestionnaireHead | null) { headRef.current = value; setHead(value); }
  const bindingFor=useCallback(async(value:Pick<QuestionnaireHead,'id'|'design'>):Promise<TopicBindingReceipt>=>verifyTopicBindingReceipt(await hostedRequest(`/api/projects/${projectId}/questionnaire/versions/${encodeURIComponent(value.id)}/topic-binding`,{maxBytes:2_100_000}),{versionId:value.id,design:value.design}),[projectId]);
  function loadPaired(intent:Omit<HostedDesignLoad,'id'>):Promise<boolean>{const id=crypto.randomUUID();loadCompletion.current?.resolve(false);return new Promise(resolve=>{loadCompletion.current={id,resolve};setLoad({id,...intent});});}
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
        const base=cached?.head??saved,sidecar=base?await bindingFor(base):null;
        if (!alive.current || cancelled) return;
        setHeadBinding(sidecar?.binding??null);headBindingRef.current=sidecar?.binding??null;setBindingReady(true);
        setProject(data.project); setRole(data.membershipRole);
        if(cached){if((saved?.revision||0)!==(cached.head?.revision||0)){setConflict(true);setNotice('已恢复本标签页的草稿；云端版本已变化，请先核对最新版本。');}else setNotice('已恢复本标签页的编辑与撤销历史。未保存内容仅在当前登录会话内保留。');}
        else{rememberHead(saved);setInitial(saved?.design||newQuestionnaire());if(!saved){setTopicOpened(true);setTab('topic');}}
        setServices(connections); setServiceId(connections.find(s => s.capabilities.includes('questionnaire'))?.id || '');
        void reloadVersions(); void reloadProposals();
      } catch (e) { if (alive.current && !cancelled) setError(errorMessage(e)); }
      finally { if (alive.current && !cancelled) setLoading(false); }
    })();
    return () => { cancelled=true; alive.current = false;loadCompletion.current?.resolve(false);loadCompletion.current=null; };
  }, [projectId, cached, reloadVersions, reloadProposals,bindingFor]);
  useEffect(() => { setUnsaved(projectId, dirty || saving || saveUncertain); return () => setUnsaved(projectId, false); }, [setUnsaved, projectId, dirty, saving, saveUncertain]);
  function loadDesign(design: Questionnaire, message: string, origin?: string,paired?:Pick<HostedDesignLoad,'topicBinding'|'topicRestoreOrigin'>) {
    if(!writable){setReadonlyDesign(design);setNotice(message);return;}
    if (latest.current?.pending) { setError('请先修正暂存的数值输入，再载入设计。'); return; }
    if (dirty && !window.confirm('载入后将替换当前编辑内容，原内容仍可撤销恢复。继续载入？')) return;
    setSourceProposal(origin); setLoad({ id: crypto.randomUUID(), design,...paired,expectedEditRevision:latest.current?.editRevision }); setTab('design'); setNotice(message); setError('');
  }
  function rememberReconciliation(value:TopicReconciliation|null){reconciliationRef.current=value;setTopicReconciliation(value);}
  function persistPending(overrides:Partial<CachedProject>={}){if(initial&&userId&&currentAccount())cacheDraft(cacheKey,{head:headRef.current,headBinding:headBindingRef.current,initial,snapshot:latest.current,sourceProposal,proposal,brief,pendingSave:pendingSave.current,pendingBinding:pendingBinding.current,pendingTopicApply:pendingTopicApply.current,topicReconciliation:reconciliationRef.current,pendingGeneration:pendingGeneration.current,saveUncertain:true,generationUncertain,conflict,tab,...overrides} satisfies CachedProject,true,userId);}
  async function sendPendingSave(freshSourceEpoch?:number):Promise<boolean>{
    const request=pendingSave.current,application=pendingTopicApply.current,before=draftRevision.current;
    if(!request)throw Error('缺少原保存请求。');
    persistPending();
    const receipt=parseQuestionnaireHead(await auth.mutate(`/api/projects/${projectId}/questionnaire/versions`,request));
    if(!currentAccount()||!writableRef.current)return false;
    if(receipt.projectId!==projectId||receipt.revision!==request.expectedRevision+1||fingerprint(receipt.design)!==fingerprint(request.design))throw Error('保存回执与原请求不一致，请核对原保存。');
    const savedBinding=await bindingFor(receipt);
    if(!currentAccount()||!writableRef.current)return false;
    if(canonical(savedBinding.binding)!==canonical(application?.application.binding??pendingBinding.current))throw Error('已保存版本的来源绑定与原保存请求不一致，请保留原请求核对。');
    const current=parseHeadResponse(await hostedRequest(`/api/projects/${projectId}/questionnaire`));
    if(!currentAccount()||!writableRef.current)return false;
    if(!current||current.revision<receipt.revision||current.revision===receipt.revision&&(current.id!==receipt.id||fingerprint(current.design)!==fingerprint(receipt.design)))throw Error('保存回执与当前版本尚未完成核对，请重试原保存。');
    const currentBinding=current.id===receipt.id?savedBinding:await bindingFor(current);
    if(!currentAccount()||!writableRef.current)return false;
    const resolved=()=>{pendingSave.current=null;pendingTopicApply.current=null;setSaveUncertain(false);setSourceProposal(undefined);};
    if(application){rememberReconciliation({versionId:receipt.id,beforeBinding:application.application.beforeBinding});persistPending();}
    if(current.revision>receipt.revision){resolved();setConflict(true);persistPending({saveUncertain:false,conflict:true});setNotice(`本次已保存为 v${receipt.revision}；云端已有 v${current.revision}。当前编辑已保留，请核对最新版本。`);void reloadVersions();return false;}
    rememberHead(current);headBindingRef.current=currentBinding.binding;setHeadBinding(currentBinding.binding);setBindingReady(true);
    if(application){
      const live=latest.current,unchanged=before===draftRevision.current&&live&&!live.pending&&live.editRevision===application.editRevision&&canonical({design:live.design,binding:live.topicBinding??null})===application.expectedBefore&&(freshSourceEpoch===undefined||freshSourceEpoch===sourceEpoch.current);
      if(!unchanged){resolved();setConflict(true);persistPending({saveUncertain:false,conflict:true});setNotice(`所选字段已保存为 v${receipt.revision}；保存期间状态已变化，新编辑仍在本页。请核对后选择保留草稿或载入已保存版本。`);void reloadVersions();return false;}
      persistPending({conflict:true});
      const accepted=await loadPaired({design:receipt.design,topicBinding:savedBinding.binding,topicRestoreOrigin:{questionnaireVersionId:receipt.id},applicationVersionId:receipt.id,expectedEditRevision:application.editRevision,expectedBefore:application.expectedBefore});
      if(!currentAccount()||!writableRef.current)return false;
      if(!accepted){resolved();setConflict(true);persistPending({saveUncertain:false,conflict:true});setNotice(`v${receipt.revision} 已保存，编辑器保留了更新的草稿。请核对后载入。`);return false;}
      const published=latest.current;
      if(!published||published.pending||fingerprint(published.design)!==fingerprint(receipt.design)||canonical(published.topicBinding??null)!==canonical(savedBinding.binding)||canonical(published.topicRestoreOrigin??null)!==canonical({questionnaireVersionId:receipt.id}))throw Error('编辑器尚未发布完整内容与来源绑定，原保存请求仍保留，请核对原保存。');
      resolved();rememberReconciliation(null);setConflict(false);setTopicProposalOpen(false);setNotice(`已将所选字段与来源绑定一起保存为 v${receipt.revision}。可在同一编辑器撤销。`);
    }else{resolved();setConflict(false);setNotice(`已保存 v${receipt.revision}。${latest.current&&fingerprint(latest.current.design)!==fingerprint(receipt.design)?'保存期间的新编辑仍在本页，需再次保存。':'刷新或重新登录后可恢复。'}`);}
    void reloadVersions();return true;
  }
  function saveFailure(e:unknown){if(!currentAccount())return;setError(errorMessage(e));if(e instanceof HostedApiError&&e.status>=400&&e.status<500&&e.code!=='invalid_server_receipt'){pendingSave.current=null;pendingTopicApply.current=null;setSaveUncertain(false);if(e.status===409)setConflict(true);if(e.status===403){writableRef.current=false;setRole('viewer');}}else if(pendingSave.current)setSaveUncertain(true);}
  async function save(){
    if(operation.current||!currentAccount()||!writableRef.current||!bindingReady||!pendingSave.current&&(!latest.current||latest.current.pending||conflict))return;
    operation.current=true;setSaving(true);setError('');
    try{
      if(!pendingSave.current){
        const next=structuredClone(latest.current!),before=draftRevision.current,base=headRef.current,headReceipt=base?await bindingFor(base):null;
        if(!currentAccount()||!writableRef.current)return;
        if(before!==draftRevision.current||latest.current?.pending)throw Error('核对绑定期间已有新编辑，未发送旧草稿。请重新保存。');
        let mutation:TopicBindingMutation|undefined;
        if(canonical(next.topicBinding??null)!==canonical(headReceipt?.binding??null)){
          if(!next.topicRestoreOrigin)throw Error('这份草稿的绑定恢复来源尚未核对，请先载入已保存版本或核对原采纳结果。');
          mutation=prepareTopicRestoreMutation(headReceipt?.bindingHash??null,next.topicRestoreOrigin);
        }
        pendingBinding.current=next.topicBinding??null;pendingSave.current={design:next.design,expectedRevision:base?.revision??0,idempotencyKey:crypto.randomUUID(),...(sourceProposal?{sourceProposalId:sourceProposal}:{}),...(mutation?{topicBindingMutation:mutation}:{})};
      }
      await sendPendingSave();
    }catch(e){saveFailure(e);}finally{operation.current=false;if(currentAccount())setSaving(false);}
  }
  async function applyTopic(applicationInput:TopicQuestionnaireApplication){
    if(operation.current||!currentAccount()||!writableRef.current||!bindingReady||conflict||pendingSave.current||!latest.current||latest.current.pending||!selectedSource.current||publishedRevision.current!==draftRevision.current||snapshot?.editRevision!==latest.current.editRevision||canonical(snapshot?.design)!==canonical(latest.current.design))throw Error('请先完成问卷输入或核对原保存，再重新预览。');
    const application=structuredClone(applicationInput),source=structuredClone(selectedSource.current),base=headRef.current,live=structuredClone(latest.current),sourceGeneration=sourceEpoch.current,before=draftRevision.current;
    const target:TopicQuestionnaireTarget={design:live.design,pending:live.pending,versionId:base?.id??null,revision:base?.revision??0};
    const guard=()=>currentAccount()&&writableRef.current&&before===draftRevision.current&&sourceGeneration===sourceEpoch.current&&canonical(selectedSource.current)===canonical(source)&&canonical(sourceLive.current)===canonical(source)&&headRef.current?.id===base?.id;
    operation.current=true;setSaving(true);setError('');
    try{
      const mutation=await prepareTopicQuestionnaireMutation(application,source,target);
      if(!guard())throw Error('核对期间来源或问卷已变化，请重新预览。');
      const receipt=base?await bindingFor(base):null;
      if(!guard())throw Error('读取来源绑定期间已有新编辑，请重新预览。');
      if(canonical(receipt?.binding??null)!==canonical(application.beforeBinding))throw Error('当前草稿的来源绑定与云端基础版本不同，请先保存恢复的草稿，再预览本次采纳。');
      pendingTopicApply.current={application,source,target,editRevision:live.editRevision??0,expectedBefore:canonical({design:application.before,binding:application.beforeBinding})};
      pendingBinding.current=application.binding;pendingSave.current={design:structuredClone(application.after),expectedRevision:base?.revision??0,idempotencyKey:crypto.randomUUID(),topicBindingMutation:mutation};
      if(!await sendPendingSave(sourceGeneration))throw Error('保存结果需要核对；当前草稿已保留，请使用原保存请求或核对最新版本。');
    }catch(e){saveFailure(e);throw e;}finally{operation.current=false;if(currentAccount())setSaving(false);}
  }
  async function refreshHead(keepLocal: boolean) {
    if (operation.current || saving || saveUncertain || pendingSave.current) return;
    operation.current = true; setReading(true); setError(''); const before = draftRevision.current;
    try {
      const current = parseHeadResponse(await hostedRequest(`/api/projects/${projectId}/questionnaire`));
      if (!currentAccount()) return;
      const sidecar=current?await bindingFor(current):null;
      if(!currentAccount())return;
      if (before !== draftRevision.current) throw Error('读取期间设计已修改，已保留最新编辑。请重新核对。');
      if (!keepLocal && dirty && !window.confirm('用最新云端版本替换本页设计？当前内容可通过撤销恢复，建议先下载备份。')) return;
      if (keepLocal && !window.confirm('以最新云端版本为基础，继续保留本页手工草稿？下一次保存将形成新版本，请先比较两份内容。')) return;
      if(keepLocal&&latest.current&&canonical(latest.current.topicBinding??null)!==canonical(sidecar?.binding??null)){
        const local=latest.current,origin=local.topicRestoreOrigin??(topicReconciliation&&canonical(local.topicBinding??null)===canonical(topicReconciliation.beforeBinding)?{applicationVersionId:topicReconciliation.versionId,phase:'before' as const}:null);
        if(!origin)throw Error('当前草稿缺少可核对的绑定恢复来源，请下载备份并载入已保存版本。');
        if(!await loadPaired({design:local.design,topicBinding:local.topicBinding??null,topicRestoreOrigin:origin,metadataOnly:true,expectedEditRevision:local.editRevision,expectedBefore:canonical({design:local.design,binding:local.topicBinding??null})}))throw Error('核对期间已有新编辑，草稿保留，请重新核对。');
        if(!currentAccount())return;
      }
      rememberHead(current);headBindingRef.current=sidecar?.binding??null;setHeadBinding(sidecar?.binding??null);setBindingReady(true); pendingSave.current = null;rememberReconciliation(null); setSaveUncertain(false); setConflict(false); setSourceProposal(undefined);
      if (!keepLocal) {if(writable)setLoad({ id: crypto.randomUUID(), design: current?.design || newQuestionnaire(),topicBinding:sidecar?.binding??null,topicRestoreOrigin:current?{questionnaireVersionId:current.id}:null,expectedEditRevision:latest.current?.editRevision });else setReadonlyDesign(current?.design || newQuestionnaire());}
      setNotice(keepLocal ? '已核对云端版本，保留本页内容作为手工草稿。请检查后保存。' : '已载入最新云端版本。'); await reloadVersions();
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { operation.current = false; if (alive.current) setReading(false); }
  }
  async function history(version: QuestionnaireVersionSummary) {
    if (operation.current || saving || saveUncertain) return;
    operation.current = true; setReading(true); setError(''); const before = draftRevision.current;
    try {
      const data = parseQuestionnaireVersion(await hostedRequest(`/api/projects/${projectId}/questionnaire/versions/${version.id}`), true) as QuestionnaireVersion;
      if (!currentAccount()) return;
      const sidecar=await bindingFor({id:data.id,design:data.design});
      if(!currentAccount())return;
      if (before !== draftRevision.current) throw Error('读取期间设计已变化，未替换新编辑。请重新载入历史。');
      loadDesign(data.design, `已载入历史 v${data.revision}。保存将新增版本，保留历史原件。`,undefined,{topicBinding:sidecar.binding,topicRestoreOrigin:{questionnaireVersionId:data.id}});
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
  return <ResearchViewHost identityKey={`${auth.identityEpoch}:${projectId}`} projectTitle={project.title} activeSection={tab} onOpenEditor={openResearchEditor}><div data-knowledge-context="active" data-knowledge-module={tab === 'report' ? 'editor' : tab === 'topic' ? 'diagnose' : tab} data-knowledge-tags={tab === 'analysis' ? 'inference' : tab === 'design' ? 'scale' : tab === 'report' ? 'report' : undefined}>
    <div className="hosted-project-heading"><div><Link href="/projects">← 我的项目</Link><h2>{project.title}</h2><span className="hosted-small">{ROLE_LABELS[role]}{tab === 'design' && <> · 问卷 {revision ? `v${revision}` : '尚未保存'}</>}</span></div>{tab === 'design' && <div className="hosted-actions"><button onClick={() => snapshot && downloadQuestionnaire(snapshot.design)} disabled={!snapshot}>下载当前设计</button><button className="hosted-primary" onClick={() => void save()} disabled={!writable || !snapshot || snapshot.pending || saving || reading || conflict || saveUncertain || !dirty}>{saving ? '正在保存…' : '保存新版本'}</button></div>}</div>
    <div ref={tabMotion} className="hosted-tabs" role="group" aria-label="项目工作区"><span className="hosted-tab-marker" data-motion-marker aria-hidden="true"/><button data-motion-id="topic" aria-pressed={tab === 'topic'} onClick={() => { setTopicOpened(true); setTab('topic'); }}>选题与研究简报</button><button data-motion-id="design" aria-pressed={tab === 'design'} onClick={() => setTab('design')}>问卷设计</button><button data-motion-id="silicon" aria-pressed={tab === 'silicon'} onClick={() => { setSiliconOpened(true); setTab('silicon'); }}>硅基样本</button><button data-motion-id="collection" aria-pressed={tab === 'collection'} onClick={() => { setCollectionOpened(true); setTab('collection'); }}>发布与回收</button><button data-motion-id="analysis" aria-pressed={tab === 'analysis'} onClick={() => { setAnalysisOpened(true); setTab('analysis'); }}>数据分析</button><button data-motion-id="report" aria-pressed={tab === 'report'} onClick={() => { setReportOpened(true); setTab('report'); }}>报告与 PPT</button><button data-motion-id="defense" aria-pressed={tab === 'defense'} onClick={() => { setDefenseOpened(true); setTab('defense'); }}>路演与答辩</button><button data-motion-id="members" aria-pressed={tab === 'members'} onClick={() => setTab('members')}>团队成员</button></div>
    {error && <p className="hosted-alert" role="alert">{error}</p>}{notice && <p className="hosted-notice" role="status">{notice}</p>}
    {(proposal || generationUncertain) && tab !== 'design' && <p className="hosted-notice"><span>{generationUncertain?'模型调用待核对，原请求已保留。':'模型提案已保留，可返回问卷设计查看。'}</span><button onClick={()=>setTab('design')}>查看生成结果与状态</button></p>}
    {saveUncertain && <div className="hosted-notice"><p>上次保存尚待核对。重试会使用原内容和原请求标识；本页新编辑仍保留。</p><button disabled={saving} onClick={() => void save()}>核对并重试原保存</button></div>}
    {conflict && <div className="hosted-conflict" role="alert"><strong>云端版本已更新，当前草稿已保留。</strong><p>可以先下载本页设计，再载入云端版本。也可以确认以最新版本为基础保留手工草稿。</p><div className="hosted-actions"><button disabled={reading || saving || saveUncertain} onClick={() => void refreshHead(false)}>载入最新云端版本</button><button disabled={reading || saving || saveUncertain} onClick={() => void refreshHead(true)}>保留当前草稿并核对版本</button></div></div>}
    {topicOpened && <div hidden={tab !== 'topic'}><HostedTopic projectId={projectId} canEdit={writable} onStartQuestionnaire={startQuestionnaire} onSourceChange={sourceChange}/></div>}
    <div hidden={tab !== 'design'}>
      {topicProposalOpen&&snapshot&&<TopicQuestionnaireProposal scopeKey={`${ownerId}:${identityEpoch}:${projectId}`} source={topicSource} target={{design:snapshot.design,pending:snapshot.pending,versionId:head?.id??null,revision}} binding={snapshot.topicBinding??null} writable={writable} disabledReason={topicDisabledReason} applyLabel="确认应用并保存新版本" onApply={applyTopic} onClose={()=>{sourceEpoch.current++;selectedSource.current=null;setTopicSource(null);setTopicProposalOpen(false);}}/>}
      <div className="hosted-project-tools"><details className="hosted-project-tool" open={!head || generationUncertain}><summary><span>生成问卷建议</span><small>{generationUncertain?'请求待核对':generating?'正在生成…':'按需使用模型'}</small></summary><div className="hosted-project-tool-body"><span className="hosted-kicker">提出需求 → 预览建议 → 确认应用</span>{writable ? <><label>模型服务<select value={serviceId} disabled={generating || generationUncertain} onChange={e => { setServiceId(e.target.value); setConsent(false); }}>{!questionnaireServices.length && <option value="">请先配置个人模型服务</option>}{questionnaireServices.map(s => <option key={s.id} value={s.id}>{questionnaireNames.get(s.id)} · v{s.revision}</option>)}</select></label><Link href="/services">管理我的模型服务 →</Link><label>研究需求<textarea rows={4} maxLength={6000} disabled={generating || generationUncertain} value={brief} placeholder="说明研究目标、目标群体，以及希望支持的决策。" onChange={e => { setBrief(e.target.value); setConsent(false); }}/></label><label className="hosted-consent"><input type="checkbox" checked={consent} disabled={generating || generationUncertain} onChange={e => setConsent(e.target.checked)}/><span>{auth.session?.mode === 'local_test' ? '确认使用合成模型验收本次需求，不产生真实模型费用。' : `同意将上方研究需求发送到 ${services.find(s => s.id === serviceId)?.provider || '所选供应商'}，用于生成问卷建议，并使用我的 API 额度。`}</span></label><button className="hosted-primary" disabled={generating || generationUncertain || !serviceId || !consent || !brief.trim() || saving || saveUncertain || conflict} onClick={() => void generate()}>{generating ? '正在等待回执…' : '生成问卷建议'}</button>{generationUncertain && <div className="hosted-notice"><p>请求回执未到，原请求已保留。</p><button disabled={generating} onClick={() => void generate()}>核对原生成请求</button></div>}</> : <p>当前角色可查看问卷和历史版本。生成与编辑由负责人或编辑成员进行。</p>}</div></details>
        <details className="hosted-project-tool"><summary><span>版本历史</span><small>{historyError?'读取未完成':revision?`当前 v${revision}`:'尚未保存'}</small></summary><div className="hosted-project-tool-body"><div className="hosted-section-title"><h3>已保存版本</h3><button disabled={loadingHistory || reading || saving || saveUncertain} onClick={() => void reloadVersions().catch(e => setError(errorMessage(e)))}>刷新</button></div><p className="hosted-small">历史载入只影响本页；保存后新增版本。每次读取 100 条。</p>{historyError&&<p role="alert">{historyError}</p>}<div className="hosted-history">{versions.length ? versions.map(v => <div key={v.id}><span><strong>v{v.revision} · {v.title || '未命名问卷'}</strong><small>{new Date(v.createdAt).toLocaleString('zh-CN')}</small></span><button disabled={reading || saving || saveUncertain} onClick={() => void history(v)}>载入编辑器</button></div>) : <p>第一次保存后，版本会出现在这里。</p>}</div>{nextBeforeRevision!==null&&<button disabled={loadingHistory || reading || saving} onClick={()=>void reloadVersions(nextBeforeRevision)}>加载更早版本</button>}<button disabled={reading || saving || saveUncertain} onClick={() => void refreshHead(false)}>核对并载入最新版本</button></div></details>
      <details className="hosted-project-tool"><summary><span>近期模型调用</span><small>{proposals.length} 条记录{callsError?' · 读取未完成':''}</small></summary><div className="hosted-project-tool-body"><p className="hosted-small">本项目由你发起的提案和调用状态可在重新登录后查看。</p><button disabled={generating} onClick={()=>void reloadProposals().catch(e=>setError(errorMessage(e)))}>刷新调用记录</button>{callsError&&<p role="alert">{callsError}</p>}<div className="hosted-history">{proposals.map(p=><div key={p.id}><span><strong>{p.title || ({running:'运行中',outcome_unknown:'结果待核对',failed:'生成失败',ready:'已生成'}[p.status])}</strong><small>{new Date(p.createdAt).toLocaleString('zh-CN')} · 基于 v{p.inputRevision}</small></span><button disabled={generating} onClick={()=>void openProposal(p.id)}>查看提案与状态</button></div>)}{!proposals.length&&<p>尚无模型调用记录。</p>}</div></div></details></div>
      {proposal && <section className="hosted-card hosted-proposal" aria-label="模型问卷提案"><span className="hosted-kicker">模型提案 · 基于问卷 v{proposal.inputRevision}</span><h3>{proposal.design?.title || '调用状态'}</h3>{proposal.design ? <><p>{proposal.design.objective}</p><ol ref={proposalMotion}>{proposal.design.questions.map(q => <li key={q.id}><strong>{q.text}</strong>{q.choices.length > 0 && <p>{q.choices.map(c => c.label).join(' / ')}</p>}</li>)}</ol>{proposal.inputRevision !== revision && <p className="hosted-alert">这份提案基于较早版本，保留供参考。请按当前版本重新生成。</p>}<div className="hosted-actions"><button className="hosted-primary" disabled={!writable || proposal.inputRevision !== revision || reading || saving || saveUncertain || conflict} onClick={() => loadDesign(proposal.design!, '已应用拟议设计，仍需检查与预测试；点击保存才会写入云端。', proposal.id)}>确认应用提案</button><button onClick={() => downloadQuestionnaire(proposal.design, '模型问卷提案.json')}>下载提案</button><button onClick={() => setProposal(null)}>收起提案</button></div></> : <><p>{proposal.status === 'failed' ? '本次生成失败。可以核对配置后再次发起。' : '调用结果尚未明确，当前设计没有改变。核对只查询已保存状态。'}</p>{proposal.errorCode && <small>状态代码：{proposal.errorCode}</small>}<button disabled={generating} onClick={() => void refreshProposal()}>核对调用状态</button></>}</section>}
      <p className="hosted-edit-status" data-state={saveState} role="status"><span className="hosted-save-indicator" aria-hidden="true"/>{saving ? '正在等待云端保存回执…' : saveUncertain ? '保存结果待核对' : conflict ? '云端版本有变化，请核对后保存' : dirty ? '有未保存的修改' : revision ? `已与云端 v${revision} 对齐` : '从空白设计开始'}{snapshot?.pending && ' · 请修正暂存数值后保存'}</p>
      {writable?<fieldset className="hosted-editor-fieldset" disabled={reading}><legend className="hosted-sr-only">项目问卷编辑器</legend><QuestionnaireStudio localOnly onSnapshot={onSnapshot} onAnalyze={value => { handoffs.publish('design',{ id: crypto.randomUUID(), snapshot: value }); setAnalysisOpened(true); setTab('analysis'); }} hosted={{ initialDesign: initial,initialBinding:headBinding,initialRestoreOrigin:head?{questionnaireVersionId:head.id}:null,writable,onEdit:onEditorEdit,cacheKey:`questionnaire:${projectId}`, load, savedFingerprint,savedBinding:headBinding, onLoaded: acknowledgeLoad, onDetachProposal: detach }}/></fieldset>:<ReadonlyQuestionnaire design={readonlyDesign||head?.design||initial}/>}
    </div>
    {siliconOpened && <div hidden={tab !== 'silicon'}><SiliconLab designSnapshot={snapshot} runner={siliconRunner} storageKey={`evix.silicon-lab.v1:${projectId}`} onSendToAnalysis={handoff => { handoffs.publish('dataset',handoff); setAnalysisOpened(true); setTab('analysis'); }}/></div>}
    {collectionOpened && <div hidden={tab !== 'collection'}><SurveyCollection projectId={projectId} savedRevision={revision} canPublish={!dirty && !saving && !saveUncertain && !conflict} writable={writable} onAnalyze={value => { handoffs.publish('dataset',value); setAnalysisOpened(true); setTab('analysis'); }}/></div>}
    {analysisOpened && <div hidden={tab !== 'analysis'}><SurveyLab onResultSnapshot={writable?result=>{handoffs.publish('result',result);setReportOpened(true);setTab("report");}:undefined} designSnapshot={snapshot} designTransfer={exchange.pending.design?.payload} datasetTransfer={exchange.pending.dataset?.payload} onEvidenceProposal={writable?proposeEvidence:undefined}/></div>}
    {reportOpened && <div hidden={tab !== 'report'}><HostedReport resultProposal={exchange.pending.result?.payload} onResultHandled={consumeResult} projectId={projectId} title={project.title} writable={writable} proposal={exchange.pending.report?.payload??null} onProposalConsumed={consumeReportProposal}/></div>}
    {defenseOpened && <div hidden={tab !== 'defense'}><HostedDefense projectId={projectId} onOpenReport={() => { setReportOpened(true); setTab('report'); }}/></div>}
    {tab === 'members' && <HostedMembers teamId={project.teamId} role={role}/>}
  </div></ResearchViewHost>;
}
function ReadonlyQuestionnaire({design}:{design:Questionnaire}){
  return <section className="hosted-card"><div className="hosted-section-title"><h3>{design.title}</h3><button onClick={()=>downloadQuestionnaire(design)}>下载所查看的版本</button></div><p>{design.objective}</p><p className="hosted-small">调查对象：{design.population||'待填写'} · 拟议设计</p><p>{design.introduction}</p><ol>{design.questions.map(q=><li key={q.id}><h4>{q.text||'题干待填写'}</h4><p className="hosted-small">{q.variable} · {q.type}{q.required?' · 拟必答':''}</p>{q.choices.length>0&&<ul>{q.choices.map((c,index)=><li key={index}>{c.code} · {c.label||'选项待填写'}</li>)}</ul>}{q.type==='likert'&&<p>{q.min}（{q.minLabel}）至 {q.max}（{q.maxLabel}）</p>}<details><summary>研究映射与依据</summary><p>{q.researchQuestion||'研究问题待填写'}</p><p>{q.decisionUse||'决策用途待填写'}</p><p>{q.source||'来源待填写'}</p>{q.condition&&<p>显示条件：{q.condition.questionId} = {q.condition.codes.join(' / ')}</p>}</details></li>)}</ol><p className="hosted-small">{design.pilotNotes}</p></section>;
}
