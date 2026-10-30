"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DatasetValue } from "@/lib/canvas/execute";
import { Tex } from "@/components/math/Tex";
import AdvancedMethods from "./AdvancedMethods";
import type { ReportInsert } from "@/lib/report-insert";
import { analyzeReliability, categoryCounts, DEMO_SURVEY_CSV, finiteNumber, parseMissingCodes, parseSurveyCsv, profileSurvey, SURVEY_LIMITS, type Delimiter, type ReliabilityResult, type SurveyTable } from "@/lib/survey-analysis";
import styles from "./SurveyLab.module.css";
import {snapshotRecipe,type ResultSnapshot} from "@/lib/research-quality";
import {figuresFromRegistration,type ReportFigure,type ProjectVisualStyle} from "@/lib/report-figure";
import AnalysisRecipeBoard from "./AnalysisRecipeBoard";
import ResearchFlow from './ResearchFlow';
import {linkEvidence,reliabilityEvidence,type EvidenceCandidate} from '@/lib/research-flow';
import QuestionnaireMapping from './QuestionnaireMapping';
import {prepareLinkedAnalysis,canonical,datasetIdentity,mappingCurrent,mappingSignature,researchLink,snapshotSignature,suggestAssignments,type DatasetIdentity,type DesignSnapshot,type DesignTransfer,type Mapping} from '@/lib/questionnaire-mapping';
import type {ResearchLink} from '@/lib/research-link';
import type {ReportSection} from '@/lib/editor-model';
import RoutingAudit from './RoutingAudit';
import {routingSummary,type RoutingPolicy,type RoutingEvidence} from '@/lib/routing-evidence';
import {numericColumnRecords,profileColumn} from '@/lib/analysis-summary';
import {isSiliconTable,SILICON_ORIGIN_COLUMN} from '@/lib/silicon/export';
import {useContentReveal,useKeyedListMotion} from '@/components/motion/useWorkspaceMotion';
import AnalysisJourney from './AnalysisJourney';
import SpreadsheetImportPanel,{type SpreadsheetReady} from './SpreadsheetImportPanel';
import SavImportPanel,{type SavReady} from './SavImportPanel';
import PlatformMappingPanel,{type PlatformMappingReady} from './PlatformMappingPanel';
import {platformAnalysisDataset,platformAnalysisCurrent} from '@/lib/platform-analysis-dataset';
import {importedDatasetIdentity,importColumnLabel,withImportLabels,type ImportMetadata} from '@/lib/survey-import-metadata';
import { currentJourneyModules, journeyScope, moduleJourneyStatus, type JourneySnapshot, type JourneyModule } from '@/lib/analysis-journey';

import {collectionEvidenceSection,qualityEvidenceSection,qualityLineageStep,transferClassification,type CollectionOrigin,type DatasetTransfer,type QualityOrigin} from '@/lib/survey-collection';
import QualityPanel from './QualityPanel';
export type {DatasetTransfer} from '@/lib/survey-collection';

type Dataset = { table: SurveyTable; name: string; hash: string; kind: "simulated" | "user_provided"; silicon?: boolean; collection?:CollectionOrigin; quality?:QualityOrigin; encoding: string; identity:DatasetIdentity; importDetails?:SpreadsheetReady['result']; savDetails?:SavReady['data']; platform?:PlatformMappingReady; platformSourceSignature?:string|null };
const format = (n: number | null | undefined, digits = 3) => n === null || n === undefined ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: digits });
const pct = (n: number, denominator: number) => denominator ? `${(n / denominator * 100).toFixed(1)}%` : "—";
const SOURCES = [
  { title: "AAPOR · 调查透明披露", url: "https://aapor.org/standards-and-ethics/disclosure-standards/", note: "披露样本来源、处理规则和局限；不把便利样本包装为总体推断。" },
  { title: "NIST · 离散程度", url: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm", note: "标准差使用样本公式，分母为 n−1；单个观测不报告样本标准差。" },
  { title: "R stats · 样本分位数", url: "https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html", note: "四分位数采用 Type 7 线性插值；不同软件选项可能给出不同结果。" },
  { title: "psych · Alpha 说明", url: "https://personality-project.org/r/psych/help/alpha.html", note: "区分原始与标准化 α，反向题须有依据，不能用 α 代替效度检验。" },
];
function saveText(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SurveyLab({designSnapshot=null,designTransfer=null,datasetTransfer=null,onDatasetChange,onEvidenceProposal,onResultSnapshot,onReportInsert}:{designSnapshot?:DesignSnapshot|null;designTransfer?:DesignTransfer|null;datasetTransfer?:DatasetTransfer|null;onDatasetChange?:(value:DatasetValue|null)=>void;onEvidenceProposal?:(section:ReportSection)=>void;onResultSnapshot?:(result:ResultSnapshot,figures?:ReportFigure[],visualStyle?:ProjectVisualStyle)=>void;onReportInsert?:(insert:ReportInsert)=>void}={}) {
  const [mapping,setMapping]=useState<Mapping|null>(null);
  const [linkState,setLinkState]=useState<{signature:string;link:ResearchLink|null}>({signature:'',link:null});
  const [datasetSession,setDatasetSession] = useState(0);
  const [recipeCandidates,setRecipeCandidates] = useState<EvidenceCandidate[]>([]);
  const [journeySnapshot, setJourneySnapshot] = useState<JourneySnapshot | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [originalDataset,setOriginalDataset]=useState<Dataset|null>(null);
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [encoding, setEncoding] = useState("utf-8");
  const [paste, setPaste] = useState("");
  const [reading, setReading] = useState(false);
  const [readPhase, setReadPhase] = useState<'reading' | 'checking' | 'identity'>('reading');
  const [readName, setReadName] = useState('');
  const [importOpen, setImportOpen] = useState(true);
  const [importFormat, setImportFormat] = useState<'text' | 'xlsx' | 'sav'>('text');
  const textSettings = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState("");
  const [calculationError, setCalculationError] = useState<{ signature: string; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [missingText, setMissingText] = useState("");
  const [routingPolicy,setRoutingPolicy]=useState<RoutingPolicy>("strict");
  const [routingApproval,setRoutingApproval]=useState<string|null>(null);
  const [section, setSection] = useState<"data" | "mapping" | "recipes" | "reliability" | "advanced">("data");
  const [seenTransfer, setSeenTransfer] = useState("");
  const [detail, setDetail] = useState<number | null>(null);
  const [interpretation, setInterpretation] = useState<"numeric" | "category">("numeric");
  const [selected, setSelected] = useState<number[]>([]);
  const [reverse, setReverse] = useState<number[]>([]);
  const [minText, setMinText] = useState("1");
  const [maxText, setMaxText] = useState("5");
  const [construct, setConstruct] = useState("");
  const [result, setResult] = useState<{ signature: string; value: ReliabilityResult; eligibility:RoutingEvidence|null; computedAt: string } | null>(null);
  const [resultRun, setResultRun] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const readEpoch = useRef(0);
  const [readSource,setReadSource]=useState<'text'|'xlsx'|'sav'>('text');
  const shownImportFormat = reading ? readSource : importFormat;
  const sourceSnapshot=dataset?.collection?{design:dataset.collection.design,pending:false}:designSnapshot;
  const sourceTransfer=dataset?.collection?null:designTransfer;
  const sourceSignature=mapping?.sourceSignature||dataset?.platformSourceSignature||null;
  const mappingStale=!!sourceSignature&&(!sourceSnapshot||sourceSnapshot.pending||sourceSignature!==snapshotSignature(sourceSnapshot));
  const interpretationPending=(!!dataset?.savDetails&&!dataset.platform)||!!(dataset?.platform&&!platformAnalysisCurrent(dataset.platform,mapping,dataset.identity,mappingStale));
  const rawDataset=originalDataset||dataset;
  const platformDesign=mappingStale?null:mapping?.design||(!sourceSnapshot?.pending?sourceSnapshot?.design:null)||null;
  const datasetRef=useRef(dataset),designRef=useRef(platformDesign);
  useLayoutEffect(()=>{datasetRef.current=dataset;designRef.current=platformDesign;},[dataset,platformDesign]);
  const missing = useMemo(() => { try { return { codes: parseMissingCodes(missingText), error: "" }; } catch (e) { return { codes: [], error: (e as Error).message }; } }, [missingText]);
  const profile = useMemo(() => dataset && !missing.error ? profileSurvey(dataset.table, missing.codes) : null, [dataset, missing]);
  // The research canvas reads the same in-memory table; it never stores the rows.
  const shared = useMemo<DatasetValue|null>(() => dataset && !interpretationPending && !dataset.platform ? { name: dataset.name, sourceHash: dataset.hash, kind: dataset.kind, table: dataset.table, missingCodes: missing.error ? [] : missing.codes, lineage: [...(dataset.quality ? [qualityLineageStep(dataset.quality)] : []), ...(missing.error ? ['「数据分析」中的缺失代码设置有误，画布未继承'] : [])] } : null, [dataset, missing,interpretationPending]);
  useLayoutEffect(() => { onDatasetChange?.(shared); }, [shared, onDatasetChange]);
  const mappingKey=canonical({dataset:dataset?.identity||null,mapping:mapping&&dataset?mappingSignature(mapping,dataset.identity):mapping,confirmed:!!mapping&&!!dataset&&mappingCurrent(mapping,dataset.identity,mappingStale),stale:mappingStale});
  const approvalKey=canonical({mappingKey,missingText,policy:routingPolicy});
  const routing={policy:routingPolicy,confirmed:routingApproval===approvalKey&&!missing.error};
  const contextKey=canonical({mappingKey,routing});
  const registrationKey=JSON.stringify({contextKey,missingText,codes:missing.codes,error:missing.error});
  const qualityContextRef=useRef({key:registrationKey,epoch:0});
  useLayoutEffect(()=>{qualityContextRef.current={key:registrationKey,epoch:qualityContextRef.current.epoch+1};},[registrationKey]);
  // Invalidate during render, including A -> B -> A, before children see a link.
  // A signature change is the only synchronous adjustment; the effect resolves the new link.
  if(linkState.signature!==contextKey)setLinkState({signature:contextKey,link:null});
  const activeLink=linkState.signature===contextKey?linkState.link:null;
  const signature = JSON.stringify({ contextKey, selected, reverse, minText, maxText, construct, missingText });
  const currentResult = result?.signature === signature ? result.value : null;
  const stepsRef = useKeyedListMotion<HTMLElement>({ ids: ['data', 'mapping', 'results'], activeId: section === 'data' || section === 'mapping' ? section : 'results', markerAxis: 'horizontal' });
  const tabsRef = useKeyedListMotion<HTMLDivElement>({ ids: ['recipes', 'reliability', 'advanced'], activeId: section, markerAxis: 'horizontal' });
  const reliabilityRef = useContentReveal<HTMLDivElement>({ token: currentResult ? `${signature}:${resultRun}` : null, enabled: section === 'reliability' });
  const currentEligibility=currentResult?result?.eligibility:null;
  const rawColumn = detail === null ? null : profile?.columns[detail];
  function prepareOverview(index:number,method:'numeric'|'frequency'){
    return dataset?(interpretationPending?{table:{...dataset.table,rows:[]},problems:['先在平台编码中确认缺失值、日期与取值解释。'],eligibility:null}:mapping?prepareLinkedAnalysis(mapping,dataset.identity,mappingStale,dataset.table,missing.codes,{method,columns:[index]},routing):{table:dataset.table,problems:[],eligibility:null}):null;
  }
  const overviewMode=rawColumn&&mapping&&prepareOverview(rawColumn.index,'numeric')?.problems.length?'category':interpretation;
  const overviewPrepared=rawColumn?prepareOverview(rawColumn.index,overviewMode==='numeric'?'numeric':'frequency'):null;
  const overviewErrors=overviewPrepared?.problems||[];
  const column=rawColumn&&overviewPrepared&&!overviewErrors.length?profileColumn(overviewPrepared.table,rawColumn.index,missing.codes):rawColumn;
  const frequencies=overviewPrepared&&detail!==null&&!overviewErrors.length&&!missing.error?categoryCounts(overviewPrepared.table,detail,missing.codes):null;
  const evidenceCandidates = (()=>{
    if(!dataset||missing.error||interpretationPending)return [];
    if(mapping&&!activeLink)return [];
    const candidates=recipeCandidates.filter(c=>c.contextKey===contextKey&&c.input.sourceHash===dataset.hash&&JSON.stringify(c.input.missingCodes)===JSON.stringify(missing.codes));
    if(currentResult){try{let input=reliabilityEvidence(currentResult,{columns:selected,reverse,min:Number(minText),max:Number(maxText),missingCodes:missing.codes},{hash:dataset.hash,simulated:dataset.kind==='simulated',question:`${construct.trim()}的内部一致性如何？`});if(mapping&&activeLink)input=linkEvidence(input,activeLink,currentEligibility);candidates.push({key:'reliability',input,contextKey,label:`Cronbach α · ${construct.trim()} · n=${input.n}`});}catch{/* null or invalid alpha remains a local diagnostic */}}
    return candidates;
  })();
  useEffect(()=>{
    let active=true;
    if(mapping&&dataset&&mappingCurrent(mapping,dataset.identity,mappingStale))void researchLink(mapping,dataset.identity,mappingStale).then(link=>{if(active)setLinkState({signature:contextKey,link});}).catch(()=>{if(active)setLinkState({signature:contextKey,link:null});});
    return ()=>{active=false;};
  },[contextKey,mapping,dataset,mappingStale]);

  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => { if (dataset?.kind === "user_provided"||mapping) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dataset,mapping]);
  useEffect(() => () => { readEpoch.current++; }, []);
  // A lab handoff is read once per id, after mount, through the same path as a pasted CSV.
  const handledTransfer = useRef("");
  useEffect(() => {
    if (!datasetTransfer || handledTransfer.current === datasetTransfer.id) return;
    const timer = window.setTimeout(() => { handledTransfer.current = datasetTransfer.id; void readData(undefined, false, datasetTransfer); }, 0);
    return () => window.clearTimeout(timer);
    // readData reads current state when it runs; only a new handoff should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetTransfer]);

  function adopt(next: Dataset,keepOriginal=false) {
    if(!keepOriginal)setOriginalDataset(null);
    setImportOpen(false);
    setRoutingApproval(null);setRoutingPolicy('strict');
    setRecipeCandidates([]);setJourneySnapshot(null);setMapping(previous=>previous?{...previous,confirmed:null}:null);
    setDatasetSession(n=>n+1); setDataset(next); setMissingText(""); setSelected([]); setReverse([]); setResult(null); setDetail(null); setConstruct(""); setMinText("1"); setMaxText("5"); setSection("data"); setPaste(""); setNotice(""); setError(""); setCalculationError(null);
  }
  async function readData(file?: File, sample = false, handoff?: DatasetTransfer) {
    if (reading && !handoff) return;
    if (dataset && !window.confirm("替换当前分析数据？原始文件不会改动。请先下载需要保留的分析记录。")) return;
    const epoch = ++readEpoch.current;
    setReadSource('text'); setReading(true); setReadPhase(file ? 'reading' : 'checking'); setReadName(handoff ? handoff.name : sample ? '12 行教学模拟数据' : file?.name || '粘贴的 CSV 文本'); setError(""); setNotice("");
    try {
      if (file && file.size > SURVEY_LIMITS.bytes) throw new Error("文件超过 2 MB，请拆分后再分析。");
      const raw = file ? await file.arrayBuffer() : new TextEncoder().encode(handoff ? handoff.csv.replace(/^\uFEFF/, "") : sample ? DEMO_SURVEY_CSV : paste).buffer;
      if (epoch !== readEpoch.current) return;
      setReadPhase('checking');
      const usedEncoding = file ? encoding : "utf-8";
      let text: string;
      try { text = new TextDecoder(usedEncoding, { fatal: true }).decode(raw); } catch { throw new Error("当前编码无法完整读取文件，请核对 UTF-8 / GB18030 后重新选择。"); }
      const usedDelimiter = sample || handoff ? "," : delimiter;
      let table: SurveyTable;
      try {
        table = parseSurveyCsv(text, usedDelimiter);
      } catch (e) {
        const label = usedDelimiter === "\t" ? "制表符 Tab" : usedDelimiter === ";" ? "分号 ;" : "逗号 ,";
        throw new Error(`${e instanceof Error ? e.message : "CSV 格式无法解析。"} 当前分隔符为「${label}」，请展开读取选项核对后重试。`);
      }
      setReadPhase('identity');
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map(x => x.toString(16).padStart(2, "0")).join("");
      if (epoch !== readEpoch.current) return;
      const identity=await datasetIdentity(hash,usedEncoding,table);
      if (epoch !== readEpoch.current) return;
      // The silicon origin column marks the whole table as simulated, whatever else it contains.
      const origin=handoff?transferClassification(handoff):null;
      const silicon = !!origin?.silicon || isSiliconTable(table.headers);
      const quality=handoff?.origin?.kind==='quality'?handoff.origin:undefined;
      const collection=handoff?.origin?.kind==='collection'?handoff.origin:quality?.collection;
      adopt({ table, name: handoff ? handoff.name : sample ? "12 行教学模拟数据" : file?.name || "粘贴的 CSV 文本", hash, kind: sample || silicon || origin?.simulated ? "simulated" : "user_provided", silicon, ...(collection?{collection}:{}), ...(quality?{quality}:{}), encoding: usedEncoding,identity });
      if(quality)setMissingText(quality.missingCodes.join(';'));
      if(collection){setMapping({design:collection.design,assignments:suggestAssignments(collection.design,identity),confirmed:null,sourceSignature:snapshotSignature({design:collection.design,pending:false})});setSection('mapping');setNotice(`已读取 ${table.rows.length} 份${collection.classification==='synthetic'?'合成验收':'回收'}答卷，问卷固定为发布 v${collection.questionnaireRevision}。请核对本版变量对应。`);}
      if (silicon) setNotice(`已按模拟数据载入：表中含 ${SILICON_ORIGIN_COLUMN} 标记列，来自硅基样本。可用于演练分析流程。`);
    } catch (e) { if (epoch === readEpoch.current) setError(e instanceof Error ? e.message : "无法读取数据；原有分析未被替换。"); }
    finally { if (epoch === readEpoch.current) setReading(false); }
  }
  async function adoptSpreadsheet(data:SpreadsheetReady,signal:AbortSignal):Promise<boolean>{
    if(signal.aborted)return false;
    const epoch=++readEpoch.current;
    const metadata:ImportMetadata={schema:'survey-import-metadata/v1',parser:data.parserVersion,columns:data.result.columns,selection:data.result.selection};
    const identity=await importedDatasetIdentity(data.sourceHash,data.result.table,metadata);
    if(signal.aborted||epoch!==readEpoch.current)return false;
    if(dataset&&!window.confirm('载入所选 Excel 区域并替换当前分析数据？请先下载需要保留的记录。'))return false;
    if(signal.aborted||epoch!==readEpoch.current)return false;
    const silicon=isSiliconTable([...data.result.table.headers,...data.result.columns.flatMap(c=>[c.id,c.label])]);
    adopt({table:withImportLabels(data.result.table,metadata),name:data.name,hash:data.sourceHash,kind:silicon?'simulated':'user_provided',silicon,encoding:'XLSX · 本地读取',identity,importDetails:data.result});
    setNotice(`已读取工作表与区域 ${data.result.selection.range}，请在题目对应中核对列标签与取值。`);
    return true;
  }
  async function adoptSav(data:SavReady,signal:AbortSignal):Promise<boolean>{
    if(signal.aborted)return false;
    const epoch=++readEpoch.current;
    const identity=await importedDatasetIdentity(data.data.raw.sourceSha256,data.data.table,data.data.metadata);
    if(signal.aborted||epoch!==readEpoch.current)return false;
    if(dataset&&!window.confirm('载入 SAV 并替换当前分析数据？请先下载需要保留的记录。'))return false;
    if(signal.aborted||epoch!==readEpoch.current)return false;
    const silicon=isSiliconTable([...data.data.table.headers,...data.data.metadata.columns.flatMap(c=>[c.id,c.variableName||'',c.label])]);
    adopt({table:data.data.table,name:data.name,hash:data.data.raw.sourceSha256,kind:silicon?'simulated':'user_provided',silicon,encoding:'SAV · 原始编码',identity,savDetails:data.data});
    setSection('mapping');setNotice('SAV 原码和值标签已载入；请确认本次分析的取值和缺失规则。');return true;
  }
  async function applyPlatform(value:PlatformMappingReady,signal:AbortSignal):Promise<boolean>{
    const source=rawDataset,current=datasetRef.current,design=designRef.current;
    if(!source||!design||signal.aborted)return false;
    const epoch=++readEpoch.current;
    const derived=await platformAnalysisDataset(value.mapping,value.preview,{table:source.table,metadata:source.identity.importMetadata||null,sourceHash:source.hash,design});
    if(signal.aborted||epoch!==readEpoch.current||datasetRef.current!==current||designRef.current!==design)return false;
    setOriginalDataset(source);
    adopt({...source,table:derived.table,identity:derived.identity,encoding:'平台解释 v2 · 共同应答范围',importDetails:undefined,platform:{mapping:structuredClone(value.mapping),preview:derived.preview},platformSourceSignature:sourceSnapshot&&!sourceSnapshot.pending&&canonical(sourceSnapshot.design)===canonical(design)?snapshotSignature(sourceSnapshot):null},true);
    const bridge=derived.mapping;
    if(sourceSnapshot&&!sourceSnapshot.pending&&canonical(sourceSnapshot.design)===canonical(design))bridge.sourceSignature=snapshotSignature(sourceSnapshot);
    setMapping(bridge);setSection('recipes');setNotice(`已按确认编码载入 ${derived.table.rows.length} 行；原表 ${source.table.rows.length} 行保留。`);return true;
  }
  function restoreOriginal(){if(!originalDataset)return;readEpoch.current++;const source=originalDataset;adopt(source);setSection('mapping');setNotice('已返回原表，请重新确认分析口径。');}
  function clear() {
    if (!window.confirm("清空当前标签页的分析数据和设置？不会删除原始文件。")) return;
    setImportOpen(true);setOriginalDataset(null);
    setRoutingApproval(null);setRoutingPolicy("strict");
    setRecipeCandidates([]);setJourneySnapshot(null);setMapping(previous=>previous?{...previous,confirmed:null}:null);
    readEpoch.current++; setReading(false); setDataset(null); setResult(null); setSelected([]); setReverse([]); setDetail(null); setPaste(""); setError(""); setCalculationError(null); setConstruct(""); setMissingText(""); setMinText("1"); setMaxText("5"); setEncoding("utf-8"); setDelimiter(","); setSection("data"); setInterpretation("numeric"); setNotice("已清空本页数据和设置；原始文件未改变。");
  }
  function displayColumn(id:string){return dataset?importColumnLabel(dataset.identity,id):id;}
  function toggle(index: number) {
    if (selected.includes(index)) { setSelected(selected.filter(c => c !== index)); setReverse(reverse.filter(c => c !== index)); }
    else if (selected.length < SURVEY_LIMITS.scaleItems) setSelected([...selected, index]);
    else setCalculationError({ signature, message: "最多同时选择 30 个量表题项。" });
  }
  function calculate() {
    if (!dataset||interpretationPending) return;
    setNotice("");
    setCalculationError(null);
    try {
      if (missing.error) throw new Error(missing.error);
      if (!construct.trim()) throw new Error("请先填写构念名称，并确认选中的题项测量同一概念。");
      const min = finiteNumber(minText), max = finiteNumber(maxText);
      if (min === null || max === null) throw new Error("计分上下限必须为有效数字。");
      const prepared=mapping?prepareLinkedAnalysis(mapping,dataset.identity,mappingStale,dataset.table,missing.codes,{method:'alpha',columns:selected,min,max,reverse,construct},routing):{table:dataset.table,problems:[],eligibility:null};
      if(prepared.problems.length)throw Error(prepared.problems.join(' '));
      setResult({ signature, eligibility:prepared.eligibility, computedAt: new Date().toISOString(), value: analyzeReliability(prepared.table, { columns: selected, reverse, min, max, missingCodes: missing.codes }) });
      setResultRun(n => n + 1);
    } catch (e) { setResult(null); setCalculationError({ signature, message: (e as Error).message }); }
  }
  function exportSummary(asText = false) {
    if (!dataset || !profile || interpretationPending) return;
    const derived=!!dataset.platform,original=derived?rawDataset:dataset;
    if(!original||(derived&&original===dataset)){setNotice('当前会话缺少原表身份，请重新载入原表并确认编码后导出。');return;}
    const selection=derived?dataset.identity.importMetadata?.selection:null;
    if(derived&&['sourceInterpretationHash','mappingHash','scopeHash'].some(key=>typeof selection?.[key]!=='string'||!/^[a-f0-9]{64}$/.test(selection[key] as string))){setNotice('本版平台解释缺少完整的来源、映射或范围指纹，请重新确认编码后导出。');return;}
    const dataScope=derived?{
      kind:'platform_common_response',
      original:{rows:original.table.rows.length,columns:original.table.headers.length,identity:{sourceHash:original.identity.sourceHash,interpretationHash:original.identity.interpretationHash,parser:original.identity.parser,encoding:original.identity.encoding,delimiter:original.identity.delimiter,headers:original.identity.headers,rows:original.identity.rows}},
      analysis:{rows:dataset.table.rows.length,columns:dataset.table.headers.length,interpretationHash:dataset.identity.interpretationHash,parser:dataset.identity.parser,encoding:dataset.encoding},
      sourceInterpretationHash:typeof selection?.sourceInterpretationHash==='string'?selection.sourceInterpretationHash:null,
      mappingHash:typeof selection?.mappingHash==='string'?selection.mappingHash:null,
      scopeHash:typeof selection?.scopeHash==='string'?selection.scopeHash:null
    }:null;
    const exportProfile={...profile,scope:derived?'platform_common_response_cell_check':'raw_file_cell_check',columns:profile.columns.map(c=>({...c,stats:null}))};
    const numericSummaries=numericColumnRecords(dataset.table,missing.codes,mapping,dataset.identity,mappingStale,routing);
    const record = { schema: "survey-analysis/v2", createdAt: new Date().toISOString(), source: { name: original.name, sha256: original.hash, classification: original.kind, ...(original.silicon ? { origin: "silicon_simulated" } : {}), ...(original.quality ? { quality: { parentName: original.quality.parentName, parentSha256: original.quality.parentHash, removedRows: original.quality.removed, ledgerSha256: original.quality.ledgerHash, rules: original.quality.rules } } : {}), ...(original.collection ? { collection: { projectId: original.collection.projectId, releaseId: original.collection.releaseId, versionId: original.collection.versionId, questionnaireRevision: original.collection.questionnaireRevision, classification: original.collection.classification, snapshotHash: original.collection.snapshotHash, generatedAt: original.collection.generatedAt } } : {}), encoding: original.encoding, delimiter: original.table.delimiter, skippedBlankLines: original.table.skippedBlankLines }, ...(dataScope?{dataScope}:{}), processing: { missingCodes: missing.codes, blankIsMissing: true, trimming: "cell edges for analysis only; raw data unchanged", duplicateTreatment: "exact parsed rows detected; never automatically removed", variance: "sample n-1", quantiles: "R type 7", weighting: "none", populationInference: "not performed" }, profile:exportProfile, numericSummaries, reliability: currentResult ? { eligibility:currentEligibility, construct: construct.trim(), options: { columns: selected, reverse, min: Number(minText), max: Number(maxText), missingCodes: missing.codes }, completeCaseRule: "all selected values numeric, present, and within declared bounds", result: currentResult } : null, limits: ["User-provided provenance is not independently verified.", "No validity, causal or population representativeness claim.", "No raw response rows or category labels included in this export."], methods: SOURCES };
    if (asText) {
      const lines = [dataset.silicon ? "【硅基样本模拟数据：由 AI 扮演虚构受访者生成，不可作为调研结果，不得填补或扩充真实样本】" : dataset.kind === "simulated" ? "【教学模拟数据：不可作为实际调研结果】" : "【用户导入数据的计算摘要：来源与抽样设计仍需人工核验】", `来源：${dataset.name}`, `SHA-256：${dataset.hash}`, ...(dataScope?[
        `原文件共读取 ${dataScope.original.rows} 条记录、${dataScope.original.columns} 列。`,
        `当前共同应答范围 ${dataScope.analysis.rows} 条记录、${dataScope.analysis.columns} 列；本范围空白/缺失代码 ${profile.missingCells}/${profile.totalCells} 个单元格（不是原文件缺失口径，也不是漏答率）。`,
        `原表解析身份 SHA-256：${dataScope.original.identity.interpretationHash}`,
        `平台原始解释指纹：${dataScope.sourceInterpretationHash??'未记录'}`,
        `平台映射指纹：${dataScope.mappingHash??'未记录'}`,
        `共同应答范围指纹：${dataScope.scopeHash??'未记录'}`
      ]:[`原文件共读取 ${profile.rows} 条记录、${profile.columns.length} 列；空白/缺失代码 ${profile.missingCells}/${profile.totalCells} 个单元格（包含正常跳题，不是漏答率）。`]), `缺失口径：空白${missing.codes.length ? `及 ${missing.codes.join("、")}` : "；未指定其他代码"}；未插补，未自动删除重复记录。`, `${dataScope?'当前共同应答范围内':''}完全相同记录的额外出现次数为 ${profile.duplicateRows}，仅为检查线索。`, "", "数值列摘要（关联模式只导出通过题目语义检查的数值题；未关联时仅作原始编码检查）：", ...numericSummaries.filter(item=>item.column?.stats).flatMap(item=>{const c=item.column!;return [...(item.eligibility?[routingSummary(item.eligibility)]:[]),`${displayColumn(c.name)}：${mapping?"题项应答范围":"原编码检查"}共 ${item.total} 行，数值 n=${c.numeric}，范围内缺失=${c.missing}，非数值=${c.nonNumeric}，均值=${format(c.stats?.mean)}，样本标准差=${format(c.stats?.sd)}，中位数=${format(c.stats?.median)}。`];}),...numericSummaries.filter(item=>item.status==='blocked').map(item=>`${item.name}：未导出数值统计。${item.problems.join(" ")}`), "", ...(currentResult ? [...(currentEligibility?[routingSummary(currentEligibility)]:[]),`构念：${construct.trim()}；题项数 k=${currentResult.k}；完整案例 n=${currentResult.n}/${currentResult.total}。`, `原始 Cronbach α=${format(currentResult.alpha)}；反向计分 x'=${minText}+${maxText}−x。`, `题项：${selected.map(c => dataset.table.headers[c]).join("、")}；反向题：${reverse.map(c => dataset.table.headers[c]).join("、") || "无"}。`, `本次未纳入计算 ${currentResult.excluded} 行，未改动原文件；α 不代表效度或单维性。`, ...currentResult.warnings] : ["量表一致性：未运行或设置已改变，未导出旧结果。"]), "", "边界：以上为未加权的当前样本描述，不推断总体，不提供便利样本的简单随机抽样误差。", "请补充调查对象、招募渠道、时间、筛选与剔除依据后再写入正式报告。", "", ...SOURCES.map(s => `${s.title}：${s.url}`)];
      lines.push('',mapping?`问卷关联：${mapping.design.title}；${mappingCurrent(mapping,dataset.identity,mappingStale)?'本版对应已确认':'对应待确认或源问卷已变化'}。设计快照不证明实际施测版本。`:'未关联问卷：手动分析，未核验题目语义。',`数据解析身份 SHA-256：${dataset.identity.interpretationHash}`);
      saveText(lines.join("\n"), "调查数据分析摘要.txt", "text/plain;charset=utf-8");
    } else saveText(JSON.stringify({...record,profile:exportProfile,interpretationHash:dataset.identity.interpretationHash,questionnaire:mapping?{status:mappingCurrent(mapping,dataset.identity,mappingStale)?'confirmed_by_user':'not_current',link:activeLink,classification:'proposed',limitation:'Design snapshot does not prove the administered questionnaire version.'}:null}, null, 2), "调查数据分析记录.json", "application/json");
    setNotice("已生成本地下载。统计汇总不等于匿名：列名、文件名、极值与小样本仍可能识别个人。分享前请检查敏感列和小样本。");
  }

  if (sourceTransfer && sourceTransfer.id !== seenTransfer) {
    setSeenTransfer(sourceTransfer.id);
    setSection("mapping");
  }

  const inResults = section === "recipes" || section === "reliability" || section === "advanced";
  const incomingDesign = !!sourceTransfer && snapshotSignature(sourceTransfer.snapshot) !== mapping?.sourceSignature;
  const setupIssue = interpretationPending?'平台编码尚待确认':missing.error ? '缺失代码设置需调整' : mappingStale ? '源问卷已变化' : mapping && !activeLink ? '题目对应尚未确认' : '';
  const journeyModules: JourneyModule[] = currentJourneyModules(journeySnapshot, journeyScope(contextKey, missing.codes)).map(module => setupIssue && module.status === 'ready' ? { ...module, status: 'stale', n: null } : module);
  if (selected.length || result || calculationError?.signature === signature) journeyModules.push({
    id: 'standalone-reliability', title: '量表一致性',
    status: moduleJourneyStatus({ hasResult: !!result, current: !!currentResult && !setupIssue, error: calculationError?.signature === signature, n: currentResult?.n ?? null, estimate: currentResult?.alpha ?? null }),
    n: !setupIssue ? currentResult?.n ?? null : null, computedAt: result?.computedAt ?? null,
  });

  return <section className={styles.lab} id="analysis" aria-label="问卷数据分析工作台">
    {dataset && <div className={styles.datasetBar}>
      <div className={styles.datasetIdentity}><strong>{dataset.name}</strong><span className={styles.badge} data-demo={dataset.kind === "simulated"}>{dataset.silicon ? "硅基样本 · 模拟数据" : dataset.collection ? dataset.collection.classification === "synthetic" ? "回收流程 · 合成验收" : "问卷回收" : dataset.kind === "simulated" ? "教学模拟数据" : "用户导入"}</span><small>{dataset.table.rows.length.toLocaleString("zh-CN")} 行 · {dataset.table.headers.length} 列 · {dataset.encoding}</small>{dataset.collection && <small>回收 v{dataset.collection.questionnaireRevision} · 本页计算</small>}</div>
      <details className={styles.datasetMenu}><summary>文件与导出</summary><div>
        {originalDataset&&<button type="button" onClick={restoreOriginal}>返回原表 · {originalDataset.table.rows.length} 行</button>}<p title={dataset.hash}>SHA-256 {dataset.hash.slice(0, 12)}…<br/>跳过 {dataset.table.skippedBlankLines} 个空白行</p>
        <button type="button" disabled={!profile||interpretationPending} onClick={() => exportSummary(false)}>下载分析记录</button>
        <button type="button" disabled={!profile||interpretationPending} onClick={() => exportSummary(true)}>下载写作摘要</button>
        <button type="button" disabled={reading} onClick={clear}>清空本页数据</button>
        <p>下载基础统计汇总，不含原始答卷。模块配置与结果在“分析方案”中保存或下载。</p>
      </div></details>
    </div>}
    {error && <div className={styles.error} role="alert">{error}{dataset && " 当前已载入的数据仍保留。"}<button type="button" onClick={() => { setSection("data"); setImportOpen(true); setImportFormat(readSource); if (textSettings.current && readSource === 'text') textSettings.current.open = true; }}>检查读取选项</button></div>}
    {notice && <p className={styles.notice} data-tone={dataset?.silicon && notice.startsWith('已按模拟数据载入') ? 'caution' : undefined} role="status">{notice}</p>}
    {missing.error && <div className={styles.error} role="alert">{missing.error}{section !== "data" && <button type="button" onClick={() => setSection("data")}>修改缺失代码</button>}</div>}
    {mappingStale && section !== "mapping" && <div className={styles.warning} role="status">源问卷已变化，请重新核对对应后再分析。<button type="button" onClick={() => setSection("mapping")}>核对题目对应</button></div>}
    <div id="analysis-import" hidden={section !== "data"}>
    <details className={styles.importPanel} open={importOpen} onToggle={event => setImportOpen(event.currentTarget.open)}><summary>{dataset ? "更换数据" : "导入数据"}<span>CSV · TSV · XLSX · SAV</span></summary>
      <div className={styles.importFormats}><div role="group" aria-label="数据文件格式">{([['text','CSV / TSV'],['xlsx','Excel · XLSX'],['sav','SPSS · SAV']] as const).map(([format,label])=><button type="button" key={format} aria-pressed={shownImportFormat===format} aria-controls={`analysis-import-${format}`} disabled={reading} onClick={()=>setImportFormat(format)}>{label}</button>)}</div><button type="button" className={styles.demoButton} disabled={reading} onClick={() => void readData(undefined, true)}>试用模拟数据 · 12 行</button></div>
      <div id="analysis-import-text" className={styles.textImport} hidden={shownImportFormat!=='text'}><div className={styles.importHeading}><div><h3>导入文本数据</h3><p>首行为列名，每行一条记录。</p></div><button type="button" className={styles.primary} disabled={reading} onClick={() => fileInput.current?.click()}>{reading ? "正在读取…" : "选择 CSV / TSV"}</button></div>
      {reading && readSource==='text' && <div className={styles.reading} role="status"><div><span className={styles.activityDot} aria-hidden="true"/><span><strong>{readPhase === 'reading' ? '正在本机读取' : readPhase === 'checking' ? '正在检查编码与字段' : '正在核验文件与解析口径'}</strong><small>{readName}</small></span></div><button type="button" onClick={() => { readEpoch.current++; setReading(false); setNotice("已取消本次读取，原有数据与设置仍保留。"); }}>取消读取</button></div>}
      <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" ref={fileInput} hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void readData(file); }}/>
      <details className={styles.readOptions} ref={textSettings}><summary>读取设置<span>{encoding === 'utf-8' ? 'UTF-8' : 'GB18030 / GBK'} · {delimiter === ',' ? '逗号' : delimiter === '\t' ? 'Tab' : '分号'}</span></summary><div className={styles.importOptions}><label>文件编码<select aria-label="文件编码" value={encoding} disabled={reading} onChange={e => setEncoding(e.target.value)}><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option></select></label><label>分隔符<select aria-label="分隔符" value={delimiter} disabled={reading} onChange={e => setDelimiter(e.target.value as Delimiter)}><option value=",">逗号 ,</option><option value={"\t"}>制表符 Tab</option><option value=";">分号 ;</option></select></label><span>设置仅用于下一次读取。</span></div></details>
      <details className={styles.pasteBox}><summary>粘贴 CSV 文本</summary><textarea aria-label="CSV 文本" maxLength={2_000_000} rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'渠道,Q1,Q2\n校园,4,5'} disabled={reading}/><button type="button" disabled={reading || !paste.trim()} onClick={() => void readData()}>读取文本</button></details></div>
      <div id="analysis-import-xlsx" hidden={shownImportFormat!=='xlsx'}><SpreadsheetImportPanel externalBusy={reading} onBusy={(busy,name)=>{if(busy)setReadSource('xlsx');setReading(busy);if(name)setReadName(name);setReadPhase('checking');}} onReady={adoptSpreadsheet}/></div>
      <div id="analysis-import-sav" hidden={shownImportFormat!=='sav'}><SavImportPanel externalBusy={reading} onBusy={(busy,name)=>{if(busy)setReadSource('sav');setReading(busy);if(name)setReadName(name);setReadPhase('checking');}} onReady={adoptSav}/></div>
      <p className={styles.importLimits}>最多 2 MB、5,000 行、80 列、200,000 个单元格。</p><p className={styles.note}>导入前请去除姓名、联系方式等信息。刷新后需重新读取；恢复分析方案时，请使用原数据与原读取设置。</p>
    </details>
    </div>
    <AnalysisJourney reading={reading} readPhase={readPhase} readName={readName} dataset={dataset ? { rowCount: dataset.table.rows.length, columnCount: dataset.table.headers.length } : null} importError={error} setupIssue={setupIssue} setupTarget={missing.error ? 'data' : 'mapping'} modules={journeyModules} activeId={section === 'reliability' ? 'standalone-reliability' : journeySnapshot?.activeId ?? null} onNavigate={target => {setSection(target);if(target==='data'&&!dataset)setImportOpen(true);}}/>
    <nav ref={stepsRef} className={styles.steps} hidden={!dataset && !incomingDesign && !mapping && section === 'data'} aria-label="分析工作步骤"><span className={styles.selectionMarker} data-motion-marker aria-hidden="true"/>
      <button type="button" data-motion-id="data" aria-pressed={section === "data"} aria-controls="analysis-import analysis-data" onClick={() => setSection("data")}><span>01</span>数据检查</button>
      <button type="button" data-motion-id="mapping" aria-pressed={section === "mapping"} aria-controls="analysis-mapping" onClick={() => setSection("mapping")}><span>02</span>题目对应{incomingDesign && <i aria-label="收到设计快照"/>}</button>
      <button type="button" data-motion-id="results" aria-pressed={inResults} aria-controls="analysis-results" disabled={!dataset||interpretationPending} onClick={() => setSection("recipes")}><span>03</span>分析结果</button>
    </nav>
    <div id="analysis-data" hidden={section !== "data"}>
      {dataset && <>
      {dataset.identity.importMetadata&&<details className={styles.card}><summary>原始列标签与单元格定位</summary><div className={styles.tableScroll}><table><thead><tr><th>稳定列 ID</th><th>原始标签</th><th>题号</th><th>表头位置</th></tr></thead><tbody>{dataset.identity.importMetadata.columns.map(c=><tr key={c.id}><td>{c.id}</td><td>{c.label||'空白表头'}</td><td>{c.questionNumber||'—'}</td><td>{c.headerRef||'—'}</td></tr>)}</tbody></table></div>{dataset.importDetails?.issues.map((i,n)=><p key={n}>{i.message}</p>)}</details>}
      <div className={styles.missingSetting}><label>额外缺失代码<input value={missingText} maxLength={820} onChange={e => {setMissingText(e.target.value);setRoutingApproval(null);}} placeholder="例如 NA;N/A;99（英文分号分隔）"/></label><p>空白始终视为缺失；其他代码只按你填写的内容精确匹配。不要把有效的 0 分设为缺失。</p></div>
      {dataset.quality&&<p className={styles.note}>质控后数据：自「{dataset.quality.parentName}」剔除 {dataset.quality.removed} 行。规则：{dataset.quality.rules.join('；')}。剔除台账 SHA-256 {dataset.quality.ledgerHash.slice(0,12)}…，原始数据未改动。</p>}
      {!dataset.platform&&(missing.error?<p className={styles.warning}>缺失代码设置有误，回收质量控制暂不可用；请先修正上方缺失代码，规则会按修正后的设置判定。</p>:<QualityPanel key={dataset.identity.interpretationHash} table={dataset.table} sourceName={dataset.name} sourceHash={dataset.hash} simulated={dataset.kind==='simulated'} silicon={!!dataset.silicon} collection={dataset.collection} continueBlocked={dataset.savDetails||dataset.importDetails?'从 SAV / XLSX 导入的数据带有原始编码、值标签与平台解释步骤，直接以 CSV 重新载入会丢失这些信息。请按剔除台账在原平台筛除后重新导出，或在完成编码确认后再处理。':undefined} missingCodes={missing.codes} onApply={(csv,name,origin)=>void readData(undefined,false,{id:crypto.randomUUID(),name,csv,origin})} onRegister={onResultSnapshot?async input=>{const captured=dataset;if(!captured)return false;try{const result=await snapshotRecipe({...input,warnings:[...input.warnings,`缺失编码：${missing.codes.join("、")||"空白"}`,...(captured.quality?[qualityLineageStep(captured.quality)]:[])]},{title:"回收问卷质量控制",sourceName:captured.name,sourceUrl:"",sourceHash:captured.hash,classification:captured.kind});if(datasetRef.current!==captured)return false;onResultSnapshot(result);setNotice("已登记质量控制结果，可在报告的「发现与矢量编排」中写入「正式调查数据处理」。");return true;}catch(error){setError((error as Error).message);return false;}}:undefined}/>)}
        {profile && <>
      {dataset.platform&&rawDataset&&rawDataset!==dataset&&<p className={styles.note}>原表 {rawDataset.table.rows.length} 条记录、{rawDataset.table.headers.length} 列 → 当前共同应答范围 {dataset.table.rows.length} 条记录、{dataset.table.headers.length} 列。</p>}
<div className={styles.metrics}><Metric label={dataset.platform?"共同应答范围记录":"已读取记录"} value={format(profile.rows, 0)} note="不等同于有效问卷数"/><Metric label={dataset.platform?"分析变量列":"变量列"} value={format(profile.columns.length, 0)} note="编号与编码需另行判断"/><Metric label={dataset.platform?"共同应答范围空白 / 缺失代码":"原表空白 / 缺失代码"} value={pct(profile.missingCells, profile.totalCells)} note={`${profile.missingCells} / ${profile.totalCells} · ${dataset.platform?'当前分析范围，非漏答率':'含正常跳题，非漏答率'}`}/><Metric label="完全重复行" value={format(profile.duplicateRows, 0)} note="额外出现次数 · 未自动删除"/></div>
      {profile.columns.length === 1 && <p className={styles.warning}>只识别到一列。如原表不止一列，请核对分隔符后重新读取。</p>}
      {profile.columns.some(c => c.likelyIdentifier) && <p className={styles.warning}>发现疑似标识列：{profile.columns.filter(c => c.likelyIdentifier).map(c => displayColumn(c.name)).join("、")}。已隐藏其取值和数值统计，不参与量表选择。</p>}
<div className={styles.overviewGrid}><div className={styles.card}><h3>变量与编码</h3><p>{dataset.platform?'当前为已确认的共同应答范围，原始记录保留在原表。':'包含所有原始记录与正常跳题，不代表有效率或漏答率。'}</p><div className={styles.tableScroll} tabIndex={0} aria-label="变量概览，可横向滚动"><table><thead><tr><th>变量</th><th>数值 n</th><th>非数值</th><th>缺失</th><th>不同值</th></tr></thead><tbody>{profile.columns.map(c => <tr key={c.index} data-selected={detail === c.index}><th><button type="button" onClick={() => { setDetail(c.index); setInterpretation(c.nonNumeric || c.likelyIdentifier ? "category" : "numeric"); }}>{displayColumn(c.name)}</button></th><td>{c.numeric}</td><td>{c.nonNumeric}</td><td>{c.missing}</td><td>{c.distinct}</td></tr>)}</tbody></table></div></div><div className={styles.card}>
        {!column ? <div className={styles.emptyDetail}><h3>选择变量查看分布</h3><p>点击左侧列名，检查缺失、编码与极端值。</p></div> : <><SourceBadge simulated={dataset.kind === "simulated"}/><div className={styles.cardHeading}><h3>{displayColumn(column.name)}</h3><select aria-label="变量解释方式" value={overviewMode} disabled={interpretationPending||column.likelyIdentifier||!!mapping} onChange={e => setInterpretation(e.target.value as "numeric" | "category")}><option value="numeric">按数值解释</option><option value="category">按分类解释</option></select></div>
          {overviewPrepared?.eligibility&&<p className={styles.note}>{routingSummary(overviewPrepared.eligibility)}</p>}
          {overviewErrors.length?<p className={styles.warning}>{overviewErrors.join(" ")}</p>:overviewMode === "numeric" ? <><p>仅采用 {column.numeric} 个可解析数值；另有缺失 {column.missing}、非数值 {column.nonNumeric}。绝对值超过 10¹² 视为不可计算值。</p>{column.stats ? <dl className={styles.statsGrid}>{[["均值", column.stats.mean],["样本标准差",column.stats.sd],["中位数",column.stats.median],["最小值",column.stats.min],["Q1",column.stats.q1],["Q3",column.stats.q3],["最大值",column.stats.max]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{format(value as number | null)}</dd></div>)}</dl> : <p>没有可计算的数值。</p>}<p className={styles.note}>满意度单题均值的解释需结合有序测量假设。</p><details className={styles.statisticNotes}><summary>统计口径</summary><p>标准差使用 n−1；Q1/Q3 使用 Type 7 插值。</p></details></> : <><p>分母为非缺失记录 n={frequencies?.n}；缺失 {frequencies?.missing} 条不进入比例。</p>{column.likelyIdentifier ? <p className={styles.warning}>疑似标识列不展示取值标签，请先在原文件去标识。</p> : <div className={styles.bars}>{frequencies?.values.slice(0, 12).map(v => <div className={styles.barRow} key={v.label}><span>{v.label}</span><strong>{v.count} · {pct(v.count, frequencies.n)}</strong><div className={styles.barTrack}><i style={{ width: `${v.count / Math.max(1, frequencies.n) * 100}%` }}/></div></div>)}{(frequencies?.values.length || 0) > 12 && <p>另有 {frequencies!.values.length - 12} 类，合计 {frequencies!.values.slice(12).reduce((n,v) => n+v.count,0)} 条；只显示频数最高的 12 类。</p>}</div>}</>}
        </>}
      </div></div>
          <div className={styles.stageActions}><p>{interpretationPending?'带入当前问卷并确认平台编码与缺失规则后，进入分析。':dataset.platform?'使用已确认的共同应答范围，查看分布和组合分析。':'确认编码与缺失口径后，关联问卷或直接开始手动分析。'}</p><button type="button" onClick={() => setSection("mapping")}>对应问卷题目</button><button type="button" className={styles.primary} disabled={interpretationPending} onClick={() => setSection("recipes")}>开始分析 →</button></div>
        </>}
      </>}
    </div>
    <div id="analysis-mapping" hidden={section !== "mapping"}>
    <QuestionnaireMapping frozenRevision={dataset?.collection?.questionnaireRevision} mapping={mapping} dataset={dataset?.identity||null} stale={mappingStale} transfer={sourceTransfer} allowManual={!dataset?.savDetails&&!dataset?.platform} onChange={value=>{if(dataset?.collection&&(!value||canonical(value.design)!==canonical(dataset.collection.design))){setError("回收数据固定使用发布问卷；请在本版问卷内核对数据列。");return;}setMapping(value);setRoutingApproval(null);setRecipeCandidates([]);}} onScale={scale=>{if(interpretationPending){setNotice("请先确认平台编码与缺失规则。");return;}setResult(null);setCalculationError(null);setSelected(scale.columns);setReverse(scale.reverse);setMinText(String(scale.min));setMaxText(String(scale.max));setConstruct(scale.construct);setSection('reliability');setNotice('已填入问卷定义的题项与反向设置，尚未计算。请核对后点击计算内部一致性。');}}/>
      {rawDataset&&<PlatformMappingPanel key={rawDataset.identity.interpretationHash} table={rawDataset.table} metadata={rawDataset.identity.importMetadata||null} sourceHash={rawDataset.hash} design={platformDesign} onApply={applyPlatform}/>}
      {dataset?.savDetails&&<details className={styles.card}><summary>SAV 值标签、测量与缺失字典</summary>{dataset.savDetails.opinions.map((o,i)=><p key={i}>{o.message}</p>)}<div className={styles.tableScroll}><table><thead><tr><th>变量</th><th>测量</th><th>原格式</th><th>值标签</th><th>用户缺失</th></tr></thead><tbody>{dataset.savDetails.raw.columns.map(c=><tr key={c.name}><td>{c.label||c.name}</td><td>{c.measurement}</td><td>{c.originalFormat||'—'}</td><td>{c.valueLabels.map(v=>`${v.value} = ${v.label}`).join('；')||'—'}</td><td>{[...c.userMissingValues.map(String),...c.userMissingRanges.map(r=>`${r.lo}–${r.hi}`)].join('；')||'—'}</td></tr>)}</tbody></table></div></details>}
      {dataset && <>
      {!interpretationPending&&mapping&&<RoutingAudit mapping={mapping} table={dataset.table} missingCodes={missing.codes} current={mappingCurrent(mapping,dataset.identity,mappingStale)} invalidMissing={!!missing.error} policy={routingPolicy} confirmed={routing.confirmed} onPolicy={policy=>{setRoutingPolicy(policy);setRoutingApproval(null);}} onConfirm={()=>setRoutingApproval(approvalKey)}/>}
        <div className={styles.stageActions}><p>{interpretationPending?"带入当前问卷并确认平台编码与缺失规则后，进入分析。":mapping ? "确认对应与跳题口径后，进入分析。" : "也可以暂不关联，按原始列进行手动分析。"}</p><button type="button" className={styles.primary} disabled={interpretationPending} onClick={() => setSection("recipes")}>进入分析 →</button></div>
      </>}
    </div>
    <div id="analysis-results" hidden={!inResults}>
      {dataset && !interpretationPending && <>
        <div className={styles.resultsToolbar}><div ref={tabsRef} className={styles.tabs} role="group" aria-label="结果类型"><span className={styles.selectionMarker} data-motion-marker aria-hidden="true"/><button type="button" data-motion-id="recipes" aria-pressed={section === "recipes"} onClick={() => setSection("recipes")}>分析方案</button><button type="button" data-motion-id="reliability" aria-pressed={section === "reliability"} onClick={() => setSection("reliability")}>量表一致性</button><button type="button" data-motion-id="advanced" aria-pressed={section === "advanced"} onClick={() => setSection("advanced")}>高级方法</button></div><span>{dataset.silicon ? "硅基样本 · 模拟数据" : dataset.collection?.classification === "synthetic" ? "回收流程 · 合成验收" : dataset.kind === "simulated" ? "教学模拟数据" : "当前样本 · 未加权分析"}</span></div>
        {profile && section === "reliability" && <div className={styles.scaleGrid}><div className={styles.card}>
        <h3>量表设置</h3><label>构念名称<input value={construct} onChange={e => setConstruct(e.target.value)} maxLength={80} placeholder="例如：服务体验（需有量表或理论依据）"/></label>
        <div className={styles.bounds}><label>计分下限<input inputMode="decimal" value={minText} onChange={e => setMinText(e.target.value)} maxLength={20}/></label><label>计分上限<input inputMode="decimal" value={maxText} onChange={e => setMaxText(e.target.value)} maxLength={20}/></label></div>
        <p className={styles.note}>按原问卷设置计分范围，并勾选反向题。反向计分 = 下限 + 上限 − 原值。</p>
        <div className={styles.itemList}>{profile.columns.map(c => <div className={styles.itemRow} key={c.index}><label><input type="checkbox" checked={selected.includes(c.index)} disabled={c.numeric === 0 || c.likelyIdentifier} onChange={() => toggle(c.index)}/><span>{displayColumn(c.name)}<small>{c.likelyIdentifier ? "疑似标识列 · 不纳入量表" : `${dataset.platform?'共同范围数值':'原表数值'} ${c.numeric} · 空白/缺失代码 ${c.missing}`}</small></span></label>{selected.includes(c.index) && <label className={styles.reverse}><input type="checkbox" aria-label={`反向计分：${displayColumn(c.name)}`} checked={reverse.includes(c.index)} onChange={() => setReverse(reverse.includes(c.index) ? reverse.filter(x => x !== c.index) : [...reverse, c.index])}/>反向</label>}</div>)}</div>
        {calculationError?.signature === signature && <p className={styles.error} role="alert">{calculationError.message}</p>}
        <button type="button" className={styles.primary} disabled={selected.length < 2} onClick={calculate}>计算内部一致性 · {selected.length} 项</button>
        <p className={styles.note}>仅纳入所选题项完整、可解析且在计分范围内的案例；不插补或删改原记录。完整案例可能有选择偏差，需检查未纳入记录的特征。</p>
      </div><div ref={reliabilityRef} className={styles.card}>
        <SourceBadge simulated={dataset.kind === "simulated"}/>
        {!currentResult ? <div className={styles.emptyDetail}><h3>{result ? "设置已改变，请重新计算" : "选好题项，再计算 α"}</h3><p>不要将人口学信息、不同构念或单选题混为一个量表。α 不替代内容效度、结构效度与理论判断。</p></div> : <>{currentEligibility&&<p className={styles.note}>{routingSummary(currentEligibility)}</p>}<div className={styles.alphaHeading}><div><span>原始 Cronbach α · 未标准化</span><strong>{format(currentResult.alpha)}</strong></div><div><b>n = {currentResult.n}</b><small>完整案例 / {currentEligibility?"符合条件的":"共"} {currentResult.total} 行<br/>{currentResult.k} 个题项 · 未加权</small></div></div><p>{currentEligibility?"符合条件的范围内":"本次计算"}未纳入 {currentResult.excluded} 行：有缺失 {currentResult.missingRows}、非数值 {currentResult.nonNumericRows}、越界值 {currentResult.outOfRangeRows}。原因可能重叠，不能直接相加。</p><div className={styles.tableScroll} tabIndex={0} aria-label="量表题项诊断，可横向滚动"><table><thead><tr><th>题项</th><th>计分均值</th><th>校正题总相关</th><th>删除后 α</th></tr></thead><tbody>{currentResult.items.map(item => <tr key={item.index}><th>{item.name}{item.reversed && <small>已反向</small>}</th><td>{format(item.mean)}</td><td>{format(item.correctedItemTotal)}</td><td>{format(item.alphaIfDeleted)}</td></tr>)}</tbody></table></div><p className={styles.note}>“—”表示不适用或未定义；删除后 α 仅供诊断，不自动删题。</p><details className={styles.statisticNotes}><summary>指标说明</summary><p>校正题总相关为该题与其余题项总分的 Pearson 相关。删除后 α 使用同一完整案例集合。</p></details><ul className={styles.cautions}>{currentResult.warnings.map(w => <li key={w}>{w}</li>)}</ul></>}
      </div></div>}
      {/* Factor analysis, regression, logit, IPA, clusters and AHP, each written up for the report and sent to its blueprint section. */}
      <div hidden={section !== "advanced"}>{profile&&<AdvancedMethods key={datasetSession} table={dataset.table} profile={profile} missingCodes={missing.codes} simulated={dataset.kind === "simulated"} sourceName={dataset.name} sourceHash={dataset.hash} onReportInsert={onReportInsert}/>}</div>
      <div hidden={section !== "recipes"}><AnalysisRecipeBoard onRegister={onResultSnapshot?async(value,title,scope,stillCurrent,variables,calculation,figureContext)=>{const captured=dataset,epoch=qualityContextRef.current.epoch;if(!captured)return;try{const result=await snapshotRecipe({...value,warnings:[...value.warnings,scope,`缺失编码：${missing.codes.join("、")||"空白"}`,...(captured.quality?[qualityLineageStep(captured.quality)]:[])]},{title:title||"分析结果",sourceName:captured.name,sourceUrl:"",sourceHash:captured.hash,classification:captured.kind,variables},undefined,calculation);if(datasetRef.current!==captured||qualityContextRef.current.epoch!==epoch||qualityContextRef.current.key!==registrationKey||!stillCurrent())return;const figures=figureContext?figuresFromRegistration(result,figureContext):[];onResultSnapshot(result,figures,figureContext?{schema:"ProjectVisualStyle/v1",paletteId:figureContext.theme,version:1}:undefined);setNotice("已登记分析结果，可在报告的研究发现中整理。");}catch(error){setError((error as Error).message);}}:undefined} key={datasetSession} table={dataset.table} profile={profile || profileSurvey(dataset.table,[])} invalidMissing={!!missing.error} missingCodes={missing.codes} hash={dataset.hash} simulated={dataset.kind === "simulated"} onReliability={()=>setSection("reliability")} onCandidates={setRecipeCandidates} onProgress={setJourneySnapshot} mapping={mapping} identity={dataset.identity} mappingStale={mappingStale} activeLink={activeLink} contextKey={contextKey} routing={routing}/></div>
      </>}
      <details className={styles.evidenceDrawer}><summary>整理为报告段落 <span>{evidenceCandidates.length ? `${evidenceCandidates.length} 项当前有效结果` : "计算后可用"}</span></summary><ResearchFlow candidates={evidenceCandidates} localOnly onEvidenceProposal={onEvidenceProposal} transformSection={dataset?.collection||dataset?.quality?section=>{let next=section;if(dataset.collection)next=collectionEvidenceSection(next,dataset.collection);if(dataset.quality)next=qualityEvidenceSection(next,dataset.quality);return next;}:undefined}/></details>
    </div>
    <details className={styles.methodNotes}><summary>方法、来源与适用范围</summary><p>支持未加权描述、分组汇总、交叉关联强度、Pearson / Spearman 相关与内部一致性计算。原始 Cronbach <Tex tex="\alpha=\frac{k}{k-1}\Bigl(1-\frac{\sum_{i=1}^{k}s_i^{2}}{s_T^{2}}\Bigr)" />，其中 <Tex tex="k" /> 为题项数，<Tex tex="s_i^{2}" /> 为各题方差，<Tex tex="s_T^{2}" /> 为总分方差；所有题项使用同一完整案例集合。</p><div>{SOURCES.map(s => <article key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title} ↗</a><p>{s.note}</p></article>)}</div><p className={styles.note}>来源核查：2026-09-26。</p></details>
  </section>;
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function SourceBadge({ simulated }: { simulated: boolean }) { return <p className={styles.resultSource}><span className={styles.badge} data-demo={simulated}>{simulated ? "教学模拟结果" : "用户导入结果"}</span></p>; }
