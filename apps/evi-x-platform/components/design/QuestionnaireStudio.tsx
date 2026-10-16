"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ANALYSIS_PLANS, DESIGN_LIMITS, QUESTION_TYPES, designDictionary, exampleQuestionnaire, newQuestion, newQuestionnaire, nextVariable, parseBoundDraft, parseQuestionnaire, questionDirectory, questionIsMapped, questionnaireIssues, questionnaireText, routeDependencies, visibleQuestionIds, type DesignQuestion, type Questionnaire, type QuestionType, type QuestionFilter } from "@/lib/questionnaire";
import styles from "./QuestionnaireStudio.module.css";
import QuestionBlocks from "./QuestionBlocks";
import QuestionnairePlatformExport from "./QuestionnairePlatformExport";
import ResearchMaterialLibrary from "../research/ResearchMaterialLibrary";
import { appendMaterialQuestionGroup } from "@/lib/research-materials";
import type { DesignSnapshot } from '@/lib/questionnaire-mapping';
import DiagnosisBriefProposal from './DiagnosisBriefProposal';
import type { DiagnosisBriefSource } from '@/lib/diagnosis-actions';
import QuestionnaireLibrary from './QuestionnaireLibrary';
import type {QuestionnaireRepairOrigin} from '@/lib/questionnaire-library';
import {parseQuestionnaireLibraryContent} from '@/lib/questionnaire-library';
import {initialRevisionHistory,commitQuestionnaireRevision,travelQuestionnaireRevision,type QuestionnaireRevisionHistory} from '@/lib/questionnaire-revision';
import type {AgentQuestionnaireProposal} from '@/lib/agent-questionnaire-proposal';
import {useHostedSession} from '../hosted/HostedSession';
import {useContentReveal,useKeyedListMotion} from '@/components/motion/useWorkspaceMotion';

type History = QuestionnaireRevisionHistory;
const initial = (): History => initialRevisionHistory(newQuestionnaire());
function download(value: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([value], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type NumericDrafts=Record<string,{questionId:string;field:'min'|'max';raw:string;error:string}>;
type SessionDesignDraft={history:History;numericDrafts:NumericDrafts;activeId:string};
export type HostedDesignBridge = { initialDesign: Questionnaire; cacheKey?:string; load?: { id: string; design: Questionnaire }; savedFingerprint?: string; onLoaded?: () => void; onDetachProposal?: () => void };
export default function QuestionnaireStudio({onSnapshot,onAnalyze,briefSource,onBriefHandled,agentProposal,onAgentHandled,onAgentApplied,localOnly=false,hosted}:{onSnapshot?:(value:DesignSnapshot)=>void;onAnalyze?:(value:DesignSnapshot)=>void;briefSource?:DiagnosisBriefSource|null;onBriefHandled?:()=>void;agentProposal?:AgentQuestionnaireProposal|null;onAgentHandled?:()=>void;onAgentApplied?:(value:AgentQuestionnaireProposal)=>void;localOnly?:boolean;hosted?:HostedDesignBridge}={}) {
  const session=useHostedSession();
  // Read once at mount; state rather than a ref so the initializers below may use it during render.
  const [cached]=useState(()=>(hosted?.cacheKey?session.getDraft(hosted.cacheKey):undefined) as SessionDesignDraft|undefined);
  const [history, setHistory] = useState<History>(()=>cached?.history||(hosted?initialRevisionHistory(hosted.initialDesign):initial()));
  const [activeId, setActiveId] = useState(()=>cached?.activeId||hosted?.initialDesign.questions[0]?.id || "initial-question");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"assemble" | "edit" | "review">("edit");
  const [preview, setPreview] = useState<"current" | "all" | "route">("current");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QuestionFilter>("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "blocker" | "review">("all");
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const [focusRequest, setFocusRequest] = useState<{questionId: string; code: string; sequence: number} | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null), cancelConfirm = useRef<HTMLButtonElement>(null);
  const confirmOperation = useRef<{resolve: (answer: boolean)=>void; revision: number; returnFocus: HTMLElement | null} | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const {setUnsaved,cacheDraft}=session, isHosted=!!hosted, userId=session.session?.user?.id;
  const cacheKey=hosted?.cacheKey, savedFingerprint=hosted?.savedFingerprint, hostedLoad=hosted?.load, onLoaded=hosted?.onLoaded;
  useEffect(()=>{if(localOnly&&!isHosted)setUnsaved('local-questionnaire',dirty);return()=>{if(!isHosted)setUnsaved('local-questionnaire',false);};},[dirty,localOnly,isHosted,setUnsaved]);
  const [previewRevision,setPreviewRevision]=useState(0);
  const [libraryResetKey,setLibraryResetKey]=useState(0);
  const libraryIdentity=useRef(0);
  function detachLibrary(){libraryIdentity.current++;setLibraryResetKey(libraryIdentity.current);}
  const [numericDrafts, setNumericDrafts] = useState<NumericDrafts>(()=>cached?.numericDrafts||{});
  const editRevision = useRef(0), readEpoch = useRef(0);
  const agentProposalRef=useRef(agentProposal);
  useLayoutEffect(()=>{agentProposalRef.current=agentProposal;},[agentProposal]);
  function markEdit(){const revision=editRevision.current+1;editRevision.current=revision;setPreviewRevision(revision);}
  const input = useRef<HTMLInputElement>(null);
  const variableInput = useRef<HTMLInputElement>(null), pendingFocus = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null), briefRef = useRef<HTMLDetailsElement>(null);
  // Dropdown menus are <details>; close them once an item is chosen, on an outside click and on Escape.
  const closeMenuAfterAction = (event: React.MouseEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.closest('details')?.removeAttribute('open'); };
  useEffect(() => {
    const close = (keep: EventTarget | null) => document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]').forEach(menu => { if (!(keep instanceof Node && menu.contains(keep))) menu.open = false; });
    const onPointer = (event: PointerEvent) => close(event.target);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(null); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, []);
  const design = history.present.content;
  const repairOrigin = history.present.repairOrigin;
  const active = design.questions.find(q => q.id === activeId) || design.questions[0];
  const activeIndex = active ? design.questions.findIndex(q => q.id === active.id) : -1;
  const issues = useMemo(() => questionnaireIssues(design), [design]);
  const visible = useMemo(() => new Set(visibleQuestionIds(design, answers)), [design, answers]);
  const blockers = issues.filter(i => i.level === "blocker");
  const pendingNumbers = Object.entries(numericDrafts).filter(([,draft])=>draft.error);
  const hasPendingNumbers=pendingNumbers.length>0;
  useLayoutEffect(()=>{if(cacheKey&&userId)cacheDraft(cacheKey,{history,numericDrafts,activeId},hasPendingNumbers||savedFingerprint!==parseQuestionnaireLibraryContent(design).serialized,userId);},[history,numericDrafts,activeId,hasPendingNumbers,design,cacheKey,savedFingerprint,userId,cacheDraft]);
  useLayoutEffect(()=>{onSnapshot?.({design,pending:hasPendingNumbers});},[design,hasPendingNumbers,onSnapshot]);
  const loadedIntent=useRef('');
  useEffect(()=>{
    if(!hostedLoad || hostedLoad.id===loadedIntent.current)return;
    const safe=parseQuestionnaire(JSON.stringify(hostedLoad.design));loadedIntent.current=hostedLoad.id;
    setHistory(h=>commitQuestionnaireRevision(h,safe,null));markEdit();setNumericDrafts({});setAnswers({});setDirty(true);setActiveId(safe.questions[0]?.id||'');setNotice('已按确认载入设计；可撤销恢复先前本地内容。');onLoaded?.();
  },[hostedLoad,onLoaded]);
  // When the design comes back to the saved version, it is clean again (adjusted during render, not in an effect).
  const savedMatch=useMemo(()=>!!hosted&&hosted.savedFingerprint===parseQuestionnaireLibraryContent(design).serialized&&!hasPendingNumbers,[hosted,design,hasPendingNumbers]);
  const [lastSavedMatch,setLastSavedMatch]=useState(savedMatch);
  if(savedMatch!==lastSavedMatch){setLastSavedMatch(savedMatch);if(savedMatch)setDirty(false);}
  const activeIssueId = active ? `design-${active.id}-issues` : undefined;
  const hasIssue = (...codes: string[]) => issues.some(i=>i.questionId===active?.id && codes.includes(i.code));
  const mapped = design.questions.filter(questionIsMapped).length;
  const directory = questionDirectory(design, query, filter, pendingNumbers.map(([,d])=>d.questionId));
  const directoryMotion = useKeyedListMotion<HTMLDivElement>({ids:directory.map(entry=>entry.question.id),activeId:active?.id,enabled:view==='edit'});
  const viewMotion = useKeyedListMotion<HTMLDivElement>({ids:['edit','assemble','review'],activeId:view,markerAxis:'horizontal'});
  const agentPreviewMotion = useContentReveal<HTMLOListElement>({token:agentProposal?.id??null});
  const reviewIssues = issues.filter(issue=>reviewFilter==='all'||issue.level===reviewFilter);
  const briefIssues = issues.filter(issue=>issue.questionId===null);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unload); return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => () => { readEpoch.current++; confirmOperation.current?.resolve(false); confirmOperation.current=null; }, []);
  useEffect(() => {
    const dialog = confirmDialog.current;
    if (!confirmation || !dialog) return;
    dialog.showModal(); cancelConfirm.current?.focus();
    return () => { dialog.close(); };
  }, [confirmation]);
  useEffect(() => { if (pendingFocus.current && view === "edit" && mobilePane === "edit") { variableInput.current?.focus(); pendingFocus.current=false; } }, [activeId,view,mobilePane]);
  useEffect(() => {
    if (!focusRequest || view !== "edit" || focusRequest.questionId !== activeId) return;
    const code = focusRequest.code;
    const field = code==='pending_min' ? 'min' : code==='pending_max' ? 'max' : code.startsWith('variable') ? 'variable' : code.startsWith('choice') ? 'choices' :
      code.startsWith('route_') ? 'condition' : code==='scale_bounds'||code==='number_bounds' ? 'bounds' :
      code==='scale_anchors' ? 'anchors' : code==='text_missing'||code==='leading_possible'||code==='double_possible' ? 'text' :
      code.startsWith('reverse') ? 'reverse' : code==='required_text' ? 'required' : 'mapping';
    const selector = field==='bounds' ? '[data-design-field="min"]' : `[data-design-field="${field}"]`;
    const target = editorRef.current?.querySelector<HTMLElement>(selector);
    const details = target?.closest('details');
    if (details) details.open = true;
    const input = target?.matches('input,textarea,select') ? target : target?.querySelector<HTMLElement>('input,textarea,select');
    (input || variableInput.current)?.focus();
  }, [focusRequest,view,activeId,mobilePane]);

  function confirmChange(message: string): Promise<boolean> {
    if (confirmOperation.current) return Promise.resolve(false);
    return new Promise(resolve=>{
      confirmOperation.current={resolve,revision:editRevision.current,returnFocus:document.activeElement instanceof HTMLElement?document.activeElement:null};
      setConfirmation(message);
    });
  }
  function finishConfirmation(accepted: boolean) {
    const pending = confirmOperation.current;
    confirmOperation.current=null;
    confirmDialog.current?.close(); setConfirmation(null);
    if (!pending) return;
    pending.returnFocus?.focus({preventScroll:true});
    const current = pending.revision===editRevision.current;
    if (accepted && !current) setError('确认期间设计已变化，已保留最新编辑。请重新发起操作。');
    pending.resolve(accepted && current);
  }

  function selectQuestion(id: string, code?: string) {
    pendingFocus.current=true; setActiveId(id); setView("edit"); setMobilePane("edit");
    setFocusRequest(previous=>code?{questionId:id,code,sequence:(previous?.sequence ?? 0)+1}:null);
    if (view==='edit' && mobilePane==='edit' && active?.id===id) { variableInput.current?.focus(); pendingFocus.current=false; }
  }
  function openBrief(code = '') {
    const brief = briefRef.current;
    if (!brief) return;
    brief.open = true;
    const field = code.startsWith('brief_') ? code.slice(6) : code==='pilot_missing' ? 'pilotNotes' : 'title';
    brief.querySelector<HTMLElement>(`[data-brief-field="${field}"]`)?.focus();
  }
  function showReview(level: typeof reviewFilter = 'all') { setReviewFilter(level); setView('review'); }
  function clearFilters() { setQuery(''); setFilter('all'); }
  function clearNumericDraft(key: string) { setNumericDrafts(d=>Object.fromEntries(Object.entries(d).filter(([k])=>k!==key))); }
  function previewAnswer(id: string, value: string) {
    const next={...answers,[id]:value}, shown=new Set(visibleQuestionIds(design,next));
    setAnswers(Object.fromEntries(Object.entries(next).filter(([key])=>shown.has(key))));
  }
  function boundInput(field: "min" | "max", label: string) {
    if (!active) return null;
    const key=`${active.id}-${field}`, draft=numericDrafts[key], errorId=`design-${key}-error`;
    return <label>{label}<input data-design-field={field} aria-label={label} type="text" inputMode="decimal" maxLength={64} value={draft?.raw ?? active[field] ?? ''} aria-invalid={!!draft?.error || hasIssue('scale_bounds','number_bounds')} aria-describedby={draft?.error?errorId:hasIssue('scale_bounds','number_bounds')?activeIssueId:undefined}
      onChange={e=>{
        const raw=e.target.value, parsed=parseBoundDraft(raw);
        markEdit(); setDirty(true);
        setNumericDrafts(d=>({...d,[key]:{questionId:active.id,field,raw,error:parsed.error}}));
        if (!parsed.error) updateQuestion({[field]:parsed.value});
      }} onBlur={()=>{if(draft && !draft.error)clearNumericDraft(key);}}/>
      {draft?.error&&<span className={styles.fieldError} id={errorId}>{draft.error} 当前生效值：{active[field]??'不限 / 未填'}。</span>}
    </label>;
  }

  function commit(next: Questionnaire, message = "", origin?:QuestionnaireRepairOrigin|null) {
    try {
      const safe = parseQuestionnaire(JSON.stringify(next));
      markEdit(); setDirty(true); setAnswers({}); setError(""); setNotice(message);
      setHistory(h => commitQuestionnaireRevision(h,safe,origin===undefined?h.present.repairOrigin:origin));
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }
  function updateQuestion(patch: Partial<DesignQuestion>) {
    if (active) commit({ ...design, questions: design.questions.map(q => q.id === active.id ? { ...q, ...patch } : q) });
  }
  function travel(back: boolean) {
    const target = back ? history.past.at(-1) : history.future[0]; if (!target) return;
    markEdit(); setDirty(true); setAnswers({}); setNumericDrafts({}); setError(""); setNotice(`${back ? "已撤销。" : "已重做。"}${pendingNumbers.length?'未应用的数值输入也已清除。':''}`);
    setHistory(travelQuestionnaireRevision(history,back));detachLibrary();hosted?.onDetachProposal?.();
    if (!target.content.questions.some(q=>q.id===activeId)) setActiveId(target.content.questions[0]?.id || "");
  }
  async function replace(next: Questionnaire, message: string) {
    if (!await confirmChange(`替换当前问卷设计？当前已应用内容可撤销恢复，但刷新后不会保留。请先下载需要的备份。${pendingNumbers.length?'这也会放弃尚未应用的数值输入。':''}`)) return;
    readEpoch.current++; setReading(false); setNumericDrafts({}); if(commit(next, message,null)){detachLibrary();hosted?.onDetachProposal?.();} setActiveId(next.questions[0]?.id || "");
  }
  async function applyAgentProposal() {
    if(reading||hasPendingNumbers||confirmation){setError('请先完成文件读取或修正暂存的数值输入，再应用草案。');return;}
    const current=agentProposalRef.current;if(!current)return;
    let safe:Questionnaire;let fingerprint:string;
    try{safe=parseQuestionnaire(JSON.stringify(current.design));fingerprint=JSON.stringify(current);}
    catch{setError('草案格式已变化或不完整，未修改当前设计。');return;}
    if(!await confirmChange('将模型草案作为当前设计？现有设计会进入撤销历史，模型内容尚未核验。'))return;
    if(!agentProposalRef.current||JSON.stringify(agentProposalRef.current)!==fingerprint){setError('确认期间模型草案已更新，已保留当前设计。请预览新草案后再确认。');return;}
    if(!commit(safe,'已应用模型拟议草案，可撤销。',null))return;
    setNumericDrafts({});detachLibrary();setActiveId(safe.questions[0]?.id||'');setView('review');onAgentApplied?.(current);onAgentHandled?.();
  }
  function add(copy = false) {
    if (design.questions.length >= DESIGN_LIMITS.questions) { setError("最多 80 道题，请拆分设计。"); return; }
    const id = crypto.randomUUID(), variable = nextVariable(design);
    const q = copy && active ? { ...structuredClone(active), id, variable } : newQuestion(id, variable);
    const questions = [...design.questions]; questions.splice(copy ? activeIndex + 1 : questions.length, 0, q);
    commit({ ...design, questions }); selectQuestion(id);
  }
  async function remove() {
    if (!active) return;
    const dependencies = routeDependencies(design, active.id);
    if (dependencies.length) { setError(`本题被 ${dependencies.map(q=>q.variable || '未编码题').join('、')} 的显示条件引用。请先调整这些条件，再删除。`); return; }
    if (!await confirmChange(`移除题目 ${activeIndex + 1}？已应用内容可以撤销恢复。${pendingNumbers.some(([,d])=>d.questionId===active.id)?'这会放弃本题尚未应用的数值输入。':''}`)) return;
    commit({ ...design, questions: design.questions.filter(q=>q.id!==active.id) }); setNumericDrafts(d=>Object.fromEntries(Object.entries(d).filter(([,v])=>v.questionId!==active.id))); selectQuestion(design.questions[activeIndex-1]?.id || design.questions[activeIndex+1]?.id || "");
  }
  function move(direction: number) {
    const target = activeIndex + direction; if (target < 0 || target >= design.questions.length) return;
    const questions = [...design.questions]; [questions[activeIndex],questions[target]]=[questions[target],questions[activeIndex]];
    const next = { ...design, questions }, oldRoutes = new Set(issues.filter(i=>i.code==='route_source').map(i=>i.questionId));
    if (questionnaireIssues(next).some(i=>i.code==='route_source' && !oldRoutes.has(i.questionId))) { setError("移动后会让显示条件引用后面的题目。请先调整条件或题序。"); return; }
    commit(next);
  }
  function changeType(type: QuestionType) {
    if (!active) return;
    if (pendingNumbers.some(([,d])=>d.questionId===active.id)) { setError("请先完成或恢复本题暂存的数值输入，再修改题型。"); return; }
    if (active.type === "single" && type !== "single" && routeDependencies(design,active.id).length) { setError("其他题的显示条件依赖本单选题，请先解除引用，再修改题型。"); return; }
    updateQuestion({ type, reverse: type === "likert" ? active.reverse : false, ...(type === "number" ? {min:null,max:null} : {}) });
  }
  function changeChoice(index: number, field: "code" | "label", value: string) {
    if (!active) return;
    if (field === "code" && routeDependencies(design,active.id,active.choices[index].code).length) { setError("这个编码正被显示条件引用，请先解除引用再改编码；选项文字仍可编辑。"); return; }
    updateQuestion({ choices: active.choices.map((c,i)=>i===index?{...c,[field]:value}:c) });
  }
  function removeChoice(index: number) {
    if (!active) return;
    if (routeDependencies(design,active.id,active.choices[index].code).length) { setError("这个选项正被显示条件引用，请先解除引用再移除。"); return; }
    updateQuestion({ choices: active.choices.filter((_,i)=>i!==index) });
  }
  async function importFile(file: File) {
    if (reading) return;
    markEdit();
    const epoch=++readEpoch.current, revision=editRevision.current; setReading(true); setError(""); setNotice("");
    try {
      if (file.size > DESIGN_LIMITS.bytes) throw new Error("备份超过 300 KB，未读取。");
      const raw = await file.arrayBuffer();
      const next = parseQuestionnaire(new TextDecoder("utf-8",{fatal:true}).decode(raw));
      if (epoch !== readEpoch.current) return;
      if (revision !== editRevision.current) throw new Error("读取期间你修改了设计，已保留新编辑。请重新选择备份后再导入。");
      if (!await confirmChange(`已校验备份“${next.title || '未命名问卷'}”，含 ${next.questions.length} 道题。替换当前设计？已应用内容可撤销恢复。${pendingNumbers.length?'这会放弃尚未应用的数值输入。':''}`)) return;
      if (epoch !== readEpoch.current) return;
      if (revision !== editRevision.current) throw new Error('确认期间设计已变化，已保留最新编辑。请重新导入。');
      setNumericDrafts({}); if(commit(next,"已恢复备份；来源、预试与内容质量仍需人工核验。",null)){detachLibrary();hosted?.onDetachProposal?.();} setActiveId(next.questions[0]?.id || "");
    } catch(e) { if(epoch===readEpoch.current) setError(`导入未完成，原设计保留。${e instanceof Error?e.message:'请核对备份格式。'}`); }
    finally { if(epoch===readEpoch.current) setReading(false); }
  }
  function exportFile(kind: "backup" | "text" | "dictionary") {
    try {
      if (pendingNumbers.length) throw new Error("有未应用的数值输入，未生成下载。请先完成输入，或点击提示中的恢复按钮。");
      const safe = parseQuestionnaire(JSON.stringify(design));
      if (kind === "backup") download(JSON.stringify(safe,null,2),"问卷设计备份.json","application/json");
      else if(kind === "text") download(questionnaireText(safe),"问卷设计草稿.txt","text/plain;charset=utf-8");
      else download(JSON.stringify(designDictionary(safe),null,2),"问卷变量与分析字典.json","application/json");
      setNotice("已生成下载文件。JSON 备份可用于恢复编辑。");
    } catch(e) { setError((e as Error).message); }
  }
  function sendToAnalysis(){
    try{
      if(pendingNumbers.length)throw Error('请先完成或恢复尚未应用的数值输入，再发送问卷快照。');
      onAnalyze?.({design:parseQuestionnaire(JSON.stringify(design)),pending:false});
      setNotice('已将本版快照发送到分析页，请核对数据列并确认对应；实际施测版本仍需另行核验。');
      window.location.hash='analysis';
    }catch(e){setError((e as Error).message);}
  }

  return <section className={styles.studio} id="design" aria-label="问卷设计工作台">
    {agentProposal&&<div role="region" aria-label="模型问卷草案预览" className={styles.notice}><strong>待确认的模型草案：{agentProposal.design.title}</strong><p>{agentProposal.model} · 服务配置 v{agentProposal.serviceRevision} · {agentProposal.design.questions.length} 道拟议题项。应用后仍需机器检查与预测试。</p><ol ref={agentPreviewMotion}>{agentProposal.design.questions.map(q=><li key={q.id}>{q.text}</li>)}</ol><button type="button" disabled={reading||hasPendingNumbers||!!confirmation} onClick={applyAgentProposal}>确认应用草案</button><button type="button" disabled={!!confirmation} onClick={()=>onAgentHandled?.()}>保留现有设计</button></div>}
    <header className={styles.heading}>
      <div className={styles.documentTitle}><div className={styles.documentState}><span>问卷设计</span><small>待实施草稿</small><small>{hosted?(hosted.savedFingerprint===parseQuestionnaireLibraryContent(design).serialized&&!hasPendingNumbers?'已保存到项目':'有未保存修改'):'本页编辑 · 不自动保存'}</small></div><h2>{design.title || '未命名问卷设计'}</h2></div>
      <div className={styles.toolbar} role="group" aria-label="问卷文件与编辑操作">
        <div className={styles.toolGroup}><button type="button" disabled={!history.past.length} onClick={()=>travel(true)}>撤销</button><button type="button" disabled={!history.future.length} onClick={()=>travel(false)}>重做</button></div>
        <details className={styles.fileMenu} data-menu><summary>文件</summary><div onClick={closeMenuAfterAction}>
          <button type="button" onClick={()=>replace(newQuestionnaire(),"已新建空白设计，可撤销恢复上一版。")}>新建空白问卷</button>
          <button type="button" onClick={()=>replace(exampleQuestionnaire(),"已载入自编教学示例，使用前需修改与预试。")}>载入教学示例</button>
          <button type="button" disabled={reading} onClick={()=>input.current?.click()}>{reading?"正在读取…":"恢复备份"}</button>
          <hr/><button type="button" onClick={()=>exportFile('text')}>导出问卷草稿</button><button type="button" onClick={()=>exportFile('dictionary')}>导出变量字典</button>
        </div></details>
        <QuestionnairePlatformExport design={design} revision={previewRevision} blocked={reading||hasPendingNumbers||!!confirmation}/>
        <button type="button" className={styles.primary} onClick={()=>exportFile('backup')}>下载备份</button>
        {onAnalyze&&<button type="button" className={styles.analysisLink} disabled={reading||hasPendingNumbers} onClick={sendToAnalysis}>送到数据分析 →</button>}
      </div>
      <input type="file" hidden ref={input} accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importFile(file);}}/>
    </header>
    {briefSource&&<DiagnosisBriefProposal key={briefSource.id} source={briefSource} design={design} revision={previewRevision} pending={hasPendingNumbers||reading||!!confirmation} onCancel={()=>{onBriefHandled?.();setNotice('已取消诊断提案，问卷没有改变。');}} onApply={(next,expectedRevision)=>{
      if(expectedRevision!==editRevision.current||hasPendingNumbers||reading||confirmation)throw Error('当前设计或输入状态已变化，请重新预览。');
      if(!commit(next,'已应用所选简介字段，题目与预试记录保留。请检查研究映射与设计问题；可用撤销恢复，记得导出问卷备份。'))throw Error('简介未应用，请检查设计格式。');
      onBriefHandled?.();showReview();if(briefRef.current)briefRef.current.open=true;
    }}/>} 
    {!(localOnly||hosted)&&<QuestionnaireLibrary design={design} repairOrigin={repairOrigin} editRevision={previewRevision} blocked={hasPendingNumbers||reading||!!confirmation} resetKey={libraryResetKey} isCurrent={revision=>revision===editRevision.current} getIdentity={()=>libraryIdentity.current} onCopySaved={expectedIdentity=>{
      if(expectedIdentity!==libraryIdentity.current)return false;
      // A copy is a new project, even if its request resolved after ordinary edits.
      // Keep all current content, but never carry A's repair origin into project B.
      markEdit();setHistory(h=>h.present.repairOrigin?commitQuestionnaireRevision(h,h.present.content,null):h);
      return true;
    }} onLoad={(content,expectedRevision,target,origin)=>{
      if(expectedRevision!==editRevision.current||hasPendingNumbers||reading||confirmation)return false;
      if(target&&!questionnaireIssues(content).some(i=>i.questionId===target.questionId&&i.code===target.code))return false;
      if(!commit(content,'已载入保存版本。结构与来源仍需复核；可一次撤销回原设计。',origin??null))return false;
      readEpoch.current++;setActiveId(content.questions[0]?.id||'');setNumericDrafts({});clearFilters();showReview();onBriefHandled?.();
      if(target?.questionId)selectQuestion(target.questionId,target.code);
      else if(target&&target.code!=='empty')openBrief(target.code);
      return true;
    }}/>}
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {pendingNumbers.length>0&&<div className={styles.pendingNumbers} role="alert"><strong>有 {pendingNumbers.length} 处数值尚未应用，暂不能导出。</strong><p>临时输入保留在本页，预览仍显示上次有效值。请完成输入或明确恢复；不会把不完整数值当作空值。</p>{pendingNumbers.map(([key,draft])=><div key={key}><button type="button" onClick={()=>selectQuestion(draft.questionId,`pending_${draft.field}`)}>定位 {design.questions.find(q=>q.id===draft.questionId)?.variable || '未编码题'} {draft.field==='min'?'下限':'上限'}</button><code>{draft.raw}</code><button type="button" onClick={()=>{clearNumericDraft(key);setNotice('已明确恢复上次有效数值，清除了这处未应用输入。');}}>恢复上次有效值</button></div>)}</div>}
    <details className={styles.brief} ref={briefRef}><summary>研究简介与预试记录 <small>{briefIssues.length?`${briefIssues.length} 项待补充 / 复核`:'记录已填写，仍需人工核验'}</small></summary><div className={styles.briefGrid}>
      {([["title","问卷名称",160],["population","调查对象与纳入条件",160],["geography","调查地域",160],["period","问题参照期",160]] as const).map(([key,label,max])=><label key={key}>{label}<input data-brief-field={key} value={design[key]} maxLength={max} onChange={e=>commit({...design,[key]:e.target.value})}/></label>)}
      {([["objective","决策目标",600],["recruitment","招募与抽样方案",600],["introduction","告知与自愿参与说明",2000],["pilotNotes","预试计划 / 已完成预试的证据与修改",2000]] as const).map(([key,label,max])=><label key={key}>{label}<textarea data-brief-field={key} rows={3} value={design[key]} maxLength={max} onChange={e=>commit({...design,[key]:e.target.value})}/></label>)}
    </div><p>说明研究目的、预计时长、退出与拒答权利、数据用途和咨询渠道；按实际要求完成伦理审查。填写预试记录不等于系统已验证预试。</p></details>
    <div className={styles.workspaceBar}><div className={styles.viewTabs} ref={viewMotion} role="group" aria-label="问卷工作区视图"><span className={styles.motionMarker} data-motion-marker aria-hidden="true" hidden/><button type="button" data-motion-id="edit" aria-pressed={view==='edit'} onClick={()=>{setView('edit');setMobilePane('edit');}}>题目编辑</button><button type="button" data-motion-id="assemble" aria-pressed={view==='assemble'} onClick={()=>setView('assemble')}>模块拼装</button><button type="button" data-motion-id="review" aria-pressed={view==='review'} onClick={()=>showReview()}>映射与检查</button></div>
      <div className={styles.summary} aria-label="设计检查概况"><button type="button" onClick={()=>{clearFilters();setView('edit');setMobilePane('edit');}} ><b>{design.questions.length}</b><span>题</span><span className="sr-only">，上限 80 题</span></button><button type="button" onClick={()=>{setQuery('');setFilter('unmapped');setView('edit');setMobilePane('edit');}} ><b>{mapped}/{design.questions.length}</b><span>已映射</span><span className="sr-only">，查看未映射题目</span></button><button type="button" data-tone={blockers.length?'risk':undefined} onClick={()=>showReview('blocker')}><b>{blockers.length}</b><span>结构问题</span></button><button type="button" onClick={()=>showReview('review')}><b>{issues.length-blockers.length}</b><span>待复核</span></button></div>
    </div>
    <ResearchMaterialLibrary context="questionnaire" appendDisabled={reading||hasPendingNumbers||!!confirmation} onAppendGroup={id=>{
      if(reading||hasPendingNumbers||confirmation){setError('请先完成读取或数值输入，再追加题组。');return false;}
      try{const next=appendMaterialQuestionGroup(design,id,()=>crypto.randomUUID());const first=next.questions[design.questions.length];
        if(!commit(next,`已追加 ${next.questions.length-design.questions.length} 道题，可整批撤销。`))return false;
        clearFilters();if(first)selectQuestion(first.id);return true;
      }catch(e){setError(e instanceof Error?e.message:'题组未加入，请检查设计。');return false;}
    }}/>
    <div hidden={view!=='assemble'}><QuestionBlocks design={design} onAppend={next=>{const first=next.questions[design.questions.length];commit(next,`已追加 ${next.questions.length-design.questions.length} 道自编草稿题；研究用途、选项与显示条件需继续核对。`);clearFilters();if(first)selectQuestion(first.id);}}/></div>
    {view==='assemble'?null:view==='edit'?<><div className={styles.mobileTabs} role="group" aria-label="小屏工作区"><button type="button" aria-pressed={mobilePane==='edit'} onClick={()=>setMobilePane('edit')}>编辑题目</button><button type="button" aria-pressed={mobilePane==='preview'} onClick={()=>setMobilePane('preview')}>查看预览</button></div><div className={styles.workspace} data-mobile-pane={mobilePane}>
      <nav className={styles.outline} aria-label="问卷题目目录"><h3><span>题目目录 <small>{directory.length} / {design.questions.length}</small></span><button type="button" aria-label="添加题目" disabled={design.questions.length>=80} onClick={()=>{clearFilters();add();}}>＋</button></h3><details className={styles.directoryFilters}><summary>查找与筛选{query||filter!=='all'?' · 已启用':''}</summary><label className={styles.searchLabel}>查找题目<input type="search" value={query} maxLength={160} onChange={e=>setQuery(e.target.value)} placeholder="搜索题干、变量或构念"/></label><label className={styles.filterLabel}>筛选题目<select value={filter} onChange={e=>setFilter(e.target.value as QuestionFilter)}><option value="all">全部题目</option><option value="blocker">有结构问题</option><option value="unmapped">研究用途未映射</option><option value="conditional">有显示条件</option><option value="pending">有未应用数值</option></select></label></details><div className={styles.questionList} ref={directoryMotion}><span className={styles.motionMarker} data-motion-marker aria-hidden="true" hidden/>{directory.map(({question:q,number,blockers:count,pending})=><button type="button" key={q.id} data-motion-id={q.id} aria-current={q.id===active?.id?'true':undefined} onClick={()=>{setActiveId(q.id);setError('');}}><span>{String(number).padStart(2,'0')} · {q.variable || '未编码'}{pending?<em>数值待应用</em>:count>0?<em>{count} 项结构问题</em>:null}</span><strong>{q.text || '填写题干'}</strong><small>{QUESTION_TYPES[q.type]}{q.condition?' · 条件显示':''}</small></button>)}</div>{!directory.length&&<p className={styles.noResults}>没有匹配的题目，请调整搜索或筛选。</p>}{(query||filter!=='all')&&<button type="button" className={styles.clearFilter} onClick={clearFilters}>清除搜索与筛选</button>}</nav>
      <div className={styles.card} ref={editorRef} aria-label="当前题项编辑">{active?<>
        {!directory.some(entry=>entry.question.id===active.id)&&<p className={styles.filteredActive}>当前题目不在筛选结果中，编辑内容仍保留。<button type="button" onClick={clearFilters}>显示全部</button></p>}
        <div className={styles.cardHeading}><h3>第 {activeIndex+1} 题 <small>/ {design.questions.length}</small></h3><details className={styles.fileMenu} data-menu><summary>题目操作</summary><div onClick={closeMenuAfterAction}><button type="button" disabled={activeIndex===0} onClick={()=>move(-1)}>上移</button><button type="button" disabled={activeIndex===design.questions.length-1} onClick={()=>move(1)}>下移</button><button type="button" onClick={()=>add(true)}>复制</button><button type="button" onClick={remove}>移除</button></div></details></div>
        <label>题干<textarea data-design-field="text" aria-invalid={hasIssue('text_missing')} aria-describedby={hasIssue('text_missing')?activeIssueId:undefined} rows={3} value={active.text} maxLength={600} placeholder="一次只询问一个明确的问题" onChange={e=>updateQuestion({text:e.target.value})}/></label>
        <div className={styles.fields}><label>变量编码<input data-design-field="variable" ref={variableInput} aria-invalid={hasIssue('variable_invalid','variable_duplicate')} aria-describedby={hasIssue('variable_invalid','variable_duplicate')?activeIssueId:undefined} value={active.variable} maxLength={32} onChange={e=>updateQuestion({variable:e.target.value})}/></label><label>题型<select value={active.type} onChange={e=>changeType(e.target.value as QuestionType)}>{Object.entries(QUESTION_TYPES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
        <div className={styles.fields}><label>题目角色<select value={active.purpose} onChange={e=>updateQuestion({purpose:e.target.value as DesignQuestion['purpose']})}><option value="research">研究题</option><option value="screening">筛选 / 路由题</option><option value="background">背景信息题</option></select></label><label className={styles.check}><input data-design-field="required" type="checkbox" checked={active.required} onChange={e=>updateQuestion({required:e.target.checked})}/>拟设为必答</label></div>
        {(active.type==='single'||active.type==='multi')&&<fieldset className={styles.choices} data-design-field="choices"><legend>选项编码与文字</legend>{active.choices.map((c,i)=><div key={i}><input aria-label={`选项 ${i+1} 编码`} aria-invalid={hasIssue('choice_codes')} aria-describedby={hasIssue('choice_codes')?activeIssueId:undefined} value={c.code} maxLength={16} onChange={e=>changeChoice(i,'code',e.target.value)}/><input aria-label={`选项 ${i+1} 文字`} aria-invalid={hasIssue('choice_labels')} aria-describedby={hasIssue('choice_labels')?activeIssueId:undefined} value={c.label} maxLength={160} onChange={e=>changeChoice(i,'label',e.target.value)}/><button type="button" aria-label={`移除选项 ${i+1}`} onClick={()=>removeChoice(i)}>×</button></div>)}<button type="button" disabled={active.choices.length>=30} onClick={()=>{let n=1;while(active.choices.some(c=>c.code===String(n)))n++;updateQuestion({choices:[...active.choices,{code:String(n),label:''}]});}}>＋ 添加选项</button><p>检查互斥与覆盖范围；“不知道 / 不适用 / 拒答”按需要单独编码，不默认等于 0 或未作答。</p></fieldset>}
        {(active.type==='likert'||active.type==='number')&&<><div className={styles.fields}>{boundInput('min',active.type==='likert'?'计分下限':'允许最小值')}{boundInput('max',active.type==='likert'?'计分上限':'允许最大值')}</div>{active.type==='likert'&&<><div className={styles.fields}><label>下限锚点<input data-design-field="anchors" aria-invalid={!active.minLabel.trim()} aria-describedby={!active.minLabel.trim()?activeIssueId:undefined} value={active.minLabel} maxLength={120} onChange={e=>updateQuestion({minLabel:e.target.value})}/></label><label>上限锚点<input aria-invalid={!active.maxLabel.trim()} aria-describedby={!active.maxLabel.trim()?activeIssueId:undefined} value={active.maxLabel} maxLength={120} onChange={e=>updateQuestion({maxLabel:e.target.value})}/></label></div><label className={styles.check}><input data-design-field="reverse" type="checkbox" checked={active.reverse} onChange={e=>updateQuestion({reverse:e.target.checked})}/>分析时反向计分：下限 + 上限 − 原值</label><p>默认 1–5 只是编辑起点，须按原量表核对。反向题由原题语义决定，不自动修改题干。</p></>}</>}
        <details className={styles.mapping} data-design-field="mapping"><summary>研究用途与来源</summary><label>回答哪个研究问题？<textarea rows={2} value={active.researchQuestion} maxLength={500} onChange={e=>updateQuestion({researchQuestion:e.target.value})}/></label><label>构念 / 维度<input value={active.construct} maxLength={120} onChange={e=>updateQuestion({construct:e.target.value})}/></label><label>计划分析用途<select value={active.analysis} onChange={e=>updateQuestion({analysis:e.target.value as DesignQuestion['analysis']})}>{Object.entries(ANALYSIS_PLANS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>如何影响决策 / 筛选？<textarea rows={2} value={active.decisionUse} maxLength={500} onChange={e=>updateQuestion({decisionUse:e.target.value})}/></label><label>来源、改编或自编依据<textarea rows={2} value={active.source} maxLength={500} onChange={e=>updateQuestion({source:e.target.value})}/></label><p>这里记录的是设计意图，不代表模型适用性、文献真实性或效度已核实。</p></details>
        <details className={styles.mapping} data-design-field="condition"><summary>显示条件 {active.condition?'· 已配置':'· 始终显示'}</summary><label>只有此前单选题满足条件时显示<select value={active.condition?.questionId || ''} onChange={e=>updateQuestion({condition:e.target.value?{questionId:e.target.value,codes:[]}:null})}><option value="">始终显示</option>{active.condition && !design.questions.slice(0,activeIndex).some(q=>q.id===active.condition?.questionId&&q.type==='single')&&<option value={active.condition.questionId}>失效来源 · 请重新选择</option>}{design.questions.slice(0,activeIndex).filter(q=>q.type==='single').map(q=><option key={q.id} value={q.id}>{q.variable} · {q.text.slice(0,35)||'未填写题干'}</option>)}</select></label>{active.condition&&<fieldset className={styles.branchChoices}><legend>符合任一选项时显示（须主动勾选）</legend>{design.questions.find(q=>q.id===active.condition?.questionId)?.choices.map((c,i)=><label key={i} className={styles.check}><input type="checkbox" checked={active.condition!.codes.includes(c.code)} onChange={e=>updateQuestion({condition:{questionId:active.condition!.questionId,codes:e.target.checked?[...active.condition!.codes,c.code]:active.condition!.codes.filter(x=>x!==c.code)}})}/>{c.code || '未编码'} · {c.label || '选项待填写'}</label>)}</fieldset>}<p>来源题隐藏或未作答时，本题也隐藏。不支持任意表达式、多源条件和跳往指定题。</p></details>
        {issues.filter(i=>i.questionId===active.id).length>0&&<div className={styles.inlineIssues} id={activeIssueId}><h4>本题待处理</h4><ul>{issues.filter(i=>i.questionId===active.id).map(i=><li key={i.code} data-level={i.level}>{i.level==='blocker'?'结构：':'复核：'}{i.message}</li>)}</ul></div>}
      </>:<div className={styles.empty}><h3>从第一道题开始</h3><p>先明确要支持的决策，再设计需要测量的变量。</p><button type="button" onClick={()=>add()}>添加题目</button></div>}</div>
      <aside className={styles.preview} aria-label="问卷实时预览"><div className={styles.previewHeading}><h3>问卷预览</h3><div role="group" aria-label="预览方式"><button type="button" aria-pressed={preview==='current'} onClick={()=>setPreview('current')}>当前题</button><button type="button" aria-pressed={preview==='all'} onClick={()=>setPreview('all')}>全部题目</button><button type="button" aria-pressed={preview==='route'} onClick={()=>setPreview('route')}>路由预演</button></div></div><p>{preview==='current'?'聚焦当前编辑的题目，保留原题序；不执行跳题。':preview==='all'?'显示全部题目及条件，便于通读；不执行跳题。':'只模拟单选答案驱动的显示路径，不保存答卷，不等于受访者预试。修改设计会清空模拟选择。'}</p>{preview==='route'&&<button type="button" onClick={()=>setAnswers({})}>重置预演选择</button>}
        <div className={styles.paper}><span className={styles.draftBadge}>待实施草稿</span><h4>{design.title || '未命名问卷'}</h4><p>{preview==='current'?`第 ${activeIndex+1} / ${design.questions.length} 题 · 编辑内容实时同步`:design.introduction || '请补充告知、自愿参与与数据使用说明。'}</p>{design.questions.map((q,i)=>{
          if(preview==='current'&&q.id!==active?.id)return null;
          if(preview==='route'&&!visible.has(q.id))return null;
          return <article key={q.id}><h5>{i+1}. {q.text || '[题干待填写]'}{q.required&&<small>拟必答</small>}</h5><small>{QUESTION_TYPES[q.type]} · {q.variable || '未编码'}</small>{q.condition&&<p className={styles.routeNote}>仅当 {design.questions.find(p=>p.id===q.condition?.questionId)?.variable || '[来源题缺失]'} 回答编码为 {q.condition.codes.join(' / ') || '[尚未选择]'} 时显示</p>}
            {q.type==='single'&&preview==='route'?<label>模拟第 {i+1} 题选择<select aria-label={`模拟第 ${i+1} 题选择`} value={answers[q.id] || ''} onChange={e=>previewAnswer(q.id,e.target.value)}><option value="">未作答</option>{q.choices.map((c,j)=><option key={j} value={c.code}>{c.label || '[选项待填写]'} ({c.code})</option>)}</select></label>:(q.type==='single'||q.type==='multi')?<ul className={styles.answerChoices}>{q.choices.map((c,j)=><li key={j}><i aria-hidden="true">{q.type==='single'?'○':'□'}</i>{c.label || '[选项待填写]'} <small>{c.code}</small></li>)}</ul>:q.type==='likert'?<div className={styles.scalePreview}><span>{q.min??'?'} · {q.minLabel || '[下限锚点]'}</span><span>至</span><span>{q.max??'?'} · {q.maxLabel || '[上限锚点]'}</span></div>:<div className={styles.answerSpace}>{q.type==='number'?`数值：${q.min??'不限'} 至 ${q.max??'不限'}`:'开放回答区域 · 此处不收集答卷'}</div>}
          </article>;
        })}{preview==='current'&&!active&&<p>暂无题目，请返回编辑区添加。</p>}{preview==='route'&&<p className={styles.routeNote}>当前显示 {visible.size} / {design.questions.length} 题。无效条件不会展示下游题，请在“映射与检查”修复。</p>}</div>
      </aside>
    </div></>:<div className={styles.review}>
      <div className={styles.card}><h3>问题—变量—分析—行动</h3><p>点击变量返回题目，补充研究依据与分析用途。</p><div className={styles.tableScroll} tabIndex={0} aria-label="研究用途映射表，可横向滚动"><table><thead><tr><th>变量 / 题型</th><th>研究问题</th><th>构念</th><th>拟分析</th><th>决策用途</th><th>来源 / 改编</th></tr></thead><tbody>{design.questions.map(q=><tr key={q.id}><th><button type="button" onClick={()=>selectQuestion(q.id,'question_unmapped')}>{q.variable || '未编码'}</button><small>{QUESTION_TYPES[q.type]}</small></th><td>{q.researchQuestion || (q.purpose==='screening'?'筛选 / 路由':'待补充')}</td><td>{q.construct || '未填写'}</td><td>{ANALYSIS_PLANS[q.analysis]}</td><td>{q.decisionUse || '待补充'}</td><td>{q.source || '待补充'}</td></tr>)}</tbody></table></div></div>
      <div className={styles.card}><h3>结构问题与人工复核</h3><p>逐项检查题目结构、研究依据与预试记录。</p><div className={styles.reviewFilters} role="group" aria-label="检查项筛选">{([['all','全部'],['blocker','结构问题'],['review','人工复核']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={reviewFilter===value} onClick={()=>setReviewFilter(value)}>{label}</button>)}</div>{reviewIssues.length?<ul className={styles.issueList}>{reviewIssues.map(i=><li key={`${i.questionId}-${i.code}`} data-level={i.level}><span>{i.level==='blocker'?'结构问题':'人工复核'}</span><div><button type="button" onClick={()=>i.questionId?selectQuestion(i.questionId,i.code):i.code==='empty'?add():openBrief(i.code)}>{i.questionId?`定位 ${design.questions.find(q=>q.id===i.questionId)?.variable || '未编码题'}`:i.code==='empty'?'添加第一道题':'补充研究简介'}</button><p>{i.message}</p></div></li>)}</ul>:<p className={styles.notice}>{issues.length?'此分类下没有检查项，可切换至其他分类。':'当前规则未发现问题，仍须专家审查与预试。'}</p>}</div>
    </div>}
    <details className={styles.sources}><summary>保存说明与设计依据</summary><p className={styles.storage}>编辑保留在本页，本页不收集受访者答卷。{hosted?'云端保存与历史版本见项目工作台；请明确保存当前设计。':localOnly?'请下载本地备份；也可到“我的项目”编辑并保存云端版本。':'可下载本地备份，或在问卷库中明确保存。'}刷新会丢失未保存编辑和暂存输入。最多 80 题，支持最近 40 步撤销。</p><p>自动检查只核对结构与少量措辞线索；合理选项是否齐全、题意是否被正确理解、量表是否适用，都需要实际研究。</p><ul><li><a href="https://aapor.org/standards-and-ethics/best-practices/" target="_blank" rel="noopener noreferrer">AAPOR · 调查设计与预试</a></li><li><a href="https://www.pewresearch.org/writing-survey-questions/" target="_blank" rel="noopener noreferrer">Pew Research Center · 题目措辞与顺序</a></li><li><a href="https://www.census.gov/about/policies/quality/standards/standarda2.html" target="_blank" rel="noopener noreferrer">U.S. Census · 工具预试与功能测试参考</a></li></ul><p>核查日期：2026-09-27。</p></details>
    <dialog className={styles.confirmDialog} ref={confirmDialog} aria-labelledby="design-confirm-title" aria-describedby="design-confirm-description" onCancel={event=>{event.preventDefault();finishConfirmation(false);}}>
      <span className={styles.confirmEyebrow}>保护当前设计</span><h3 id="design-confirm-title">确认这次更改？</h3><p id="design-confirm-description">{confirmation}</p>
      <div><button type="button" ref={cancelConfirm} onClick={()=>finishConfirmation(false)}>取消，保留当前设计</button><button type="button" className={styles.primary} onClick={()=>finishConfirmation(true)}>确认更改</button></div>
    </dialog>
  </section>;
}
