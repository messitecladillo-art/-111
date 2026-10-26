"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GATE_NAMES,
  PROJECT_STAGES,
  type GateName,
  type ProjectStage,
} from "@/data/control-plane-contract.generated";
import { RULE_CORPUS_META } from "@/data/rule-corpus.generated";
import { COMPETITION_UPDATE } from "@/data/competition-update";
import CaseLibrary from '@/components/cases/ReportCaseLibrary';
import {normalizeResultRegistration} from '@/lib/result-registration';
import ProjectPortal from "@/components/workspace/ProjectPortal";
import EvidenceFlight from "@/components/EvidenceFlight";
import ChoiceGroup from "@/components/ChoiceGroup";
import WorkbenchShell, { useWorkbenchNav, useWorkbenchTheme, type WorkbenchPanel } from "@/components/WorkbenchShell";
import type { ReactNode } from "react";
import type { EditorContent } from "@/lib/editor-model";
import type { ProjectView } from "@/lib/agent/illumination";
import type { AgentQuestionnaireProposal } from "@/lib/agent-questionnaire-proposal";
import dynamic from 'next/dynamic';
import Link from 'next/link';
const EditingStudio = dynamic(() => import('@/components/editors/EditingStudio'));
const SurveyLab = dynamic(() => import('@/components/analysis/SurveyLab'));
const QuestionnaireStudio = dynamic(() => import('@/components/design/QuestionnaireStudio'));
const NetExamStudio = dynamic(() => import('@/components/exam/NetExamStudio'), { ssr: false, loading: () => <p role="status">正在载入网赛题库…</p> });
const SamplingWorkbench = dynamic(() => import('@/components/sampling/SamplingWorkbench'), { ssr: false, loading: () => <p role="status">正在载入抽样设计…</p> });
const SubmissionPreflight = dynamic(() => import('@/components/preflight/SubmissionPreflight'), { ssr: false, loading: () => <p role="status">正在载入提交前体检…</p> });
const DefenseStudio = dynamic(() => import('@/components/defense/DefenseStudio'));
const SiliconLab = dynamic(() => import('@/components/silicon/SiliconLab'));
// React Flow and the canvas engine load only when the canvas is first opened.
const ResearchCanvas = dynamic(() => import('@/components/canvas/ResearchCanvas'), { ssr: false, loading: () => <p className="wb-canvas-loading" role="status">正在载入研究画布…</p> });
const TopicLab = dynamic(() => import('@/components/topic-lab/TopicLab'), { ssr: false, loading: () => <p className="topic-lab-loading" role="status">正在载入词云与选题…</p> });
const TopicAdvisor = dynamic(() => import('@/components/topic-advisor/TopicAdvisor'), { ssr: false, loading: () => <p role="status">正在载入选题顾问…</p> });
import TopicModelProposal from '@/components/topic-advisor/TopicModelProposal';
import topicCatalog from '@/content/topic-advisor/catalog.json';
import HostedServices from '@/components/hosted/HostedServices';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { anonymousCanvasIdentity, LOCAL_CANVAS_WORKSPACE, type CanvasIdentity } from '@/lib/canvas/scope';
import { useHandoffAcknowledgement, useWorkbenchHandoffs } from '@/components/workbench/useWorkbenchHandoffs';
import DiagnosisActions from "@/components/DiagnosisActions";
import CompetitionCalendar from '@/components/overview/CompetitionCalendar';
import ResearchPipeline from '@/components/overview/ResearchPipeline';
import type { DiagnosisBriefInput, DiagnosisBriefSource } from '@/lib/diagnosis-actions';
import type { DesignSnapshot } from '@/lib/questionnaire-mapping';
import type { DatasetValue } from '@/lib/canvas/execute';

type UnknownRecord = Record<string, unknown>;

type DiagnosisResult = {
  score: number | null;
  verdict: string;
  summary: string;
  risks: string[];
  nextActions: string[];
  actionCodes: string[];
  dimensions: Array<{ label: string; score: number }>;
  transitionPlan: {
    currentStage: ProjectStage;
    nextStage: ProjectStage | null;
    requiredGates: GateName[];
    requiredArtifacts: string[];
    note: string;
  } | null;
};

type RuleScopeInput = {
  edition: string;
  group: string;
  region: string;
  track: string;
  stage: string;
};

type RuleEvidence = {
  id: string;
  ruleType: string;
  rule: string;
  severity: "hard" | "disqualifying";
  sourceTitle: string;
  sourceUrl: string;
  publishedDate: string;
  verifiedAt: string;
};

type RuleSource = {
  id: string;
  title: string;
  url: string;
  authorityName: string;
  publishedDate: string;
  verifiedAt: string;
  sha256: string;
};

type RuleResolution = {
  match: "exact" | "none";
  blocking: boolean;
  requested: RuleScopeInput;
  rules: RuleEvidence[];
  sources: RuleSource[];
  unknowns: string[];
  sourceRawSha256: string;
  snapshotVerifiedAt: string;
};

const QDIA = [
  { code: "Q", name: "问题", english: "Question", detail: "锁定真实决策与证据缺口" },
  { code: "D", name: "数据", english: "Data", detail: "建立可追溯的样本与来源" },
  { code: "I", name: "洞察", english: "Insight", detail: "区分事实、解释与限制" },
  { code: "A", name: "行动", english: "Action", detail: "落实责任、优先级与指标" },
] as const;

const GATE_LABELS = {
  rule: "规则",
  problem: "问题",
  design: "设计",
  fieldwork: "田野",
  data: "数据",
  inference: "推断",
  action: "行动",
  visual: "视觉",
  submission: "提交",
} satisfies Record<GateName, string>;

const STAGE_LABELS = {
  intake: "项目接入",
  rule_lock: "规则锁定",
  problem_framing: "问题定义",
  exploratory_research: "探索研究",
  survey_design: "调研设计",
  fieldwork: "田野执行",
  data_analysis: "数据分析",
  insight_action: "洞察行动",
  report_visual: "报告视觉",
  defense: "答辩准备",
  submission_ready: "提交就绪",
  closed: "已封存",
} satisfies Record<ProjectStage, string>;

const STAGES = PROJECT_STAGES.map(
  (stage) => [stage, STAGE_LABELS[stage]] as const,
);


function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, keys: string[], fallback = "未知") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) {
      const text = value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
        .join("、");
      if (text) return text;
    }
  }
  return fallback;
}

function readStringArray(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item : isRecord(item) ? readString(item, ["text", "title", "action", "message"], "") : ""))
        .filter(Boolean);
    }
  }
  return [];
}

function safeScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizeDiagnosis(payload: unknown): DiagnosisResult {
  const root = isRecord(payload) && isRecord(payload.diagnosis)
    ? payload.diagnosis
    : isRecord(payload) && isRecord(payload.data)
      ? payload.data
      : payload;
  const record = isRecord(root) ? root : {};
  const dimensions: Array<{ label: string; score: number }> = [];
  const rawDimensions = record.dimensions ?? record.dimensionScores ?? record.dimension_scores;
  const rawScores = isRecord(record.scores) ? record.scores : {};
  const rawTransition = isRecord(record.transitionPlan) ? record.transitionPlan : null;
  if (Array.isArray(rawDimensions)) {
    rawDimensions.forEach((item) => {
      if (!isRecord(item)) return;
      const score = safeScore(item.score ?? item.value);
      if (score !== null) dimensions.push({ label: readString(item, ["label", "name", "dimension"], "维度"), score });
    });
  } else if (isRecord(rawDimensions)) {
    Object.entries(rawDimensions).forEach(([label, value]) => {
      const directScore = safeScore(isRecord(value) ? value.score : value);
      const quarterScore = typeof rawScores[label] === "number" ? Math.min(100, Number(rawScores[label]) * 4) : null;
      const score = directScore ?? quarterScore;
      if (score !== null) dimensions.push({ label: typeof value === "string" ? value : label, score });
    });
  }
  return {
    score: safeScore(record.score ?? record.readiness ?? record.overallScore ?? record.overall_score),
    verdict: readString(record, ["verdict", "level", "rating"], "项目准备度"),
    summary: readString(record, ["summary", "analysis", "message", "disclaimer"], "接口已返回诊断结果，请结合风险和下一步执行。"),
    risks: readStringArray(record, ["risks", "riskItems", "risk_items", "blockers"]),
    nextActions: readStringArray(record, ["nextSteps", "nextActions", "next_actions", "recommendations", "actions"]),
    actionCodes: Array.isArray(record.nextSteps) ? [...new Set(record.nextSteps.filter(isRecord).map(item=>item.code).filter((code):code is string=>typeof code==='string'&&code.length<=100))].slice(0,10) : [],
    dimensions,
    transitionPlan: rawTransition && (PROJECT_STAGES as readonly string[]).includes(String(rawTransition.currentStage))
      ? {
          currentStage: rawTransition.currentStage as ProjectStage,
          nextStage: (PROJECT_STAGES as readonly string[]).includes(String(rawTransition.nextStage)) ? rawTransition.nextStage as ProjectStage : null,
          requiredGates: readStringArray(rawTransition, ["requiredGates"]).filter((gate): gate is GateName => (GATE_NAMES as readonly string[]).includes(gate)),
          requiredArtifacts: readStringArray(rawTransition, ["requiredArtifacts"]),
          note: readString(rawTransition, ["note"], "只读材料清单不代表质量门禁已通过。"),
        }
      : null,
  };
}

function normalizeRuleResolution(payload: unknown): RuleResolution | null {
  if (!isRecord(payload) || (payload.match !== "exact" && payload.match !== "none") || !isRecord(payload.requested)) return null;
  const requested = payload.requested;
  const dimensions = ["edition", "group", "region", "track", "stage"] as const;
  if (!dimensions.every((dimension) => typeof requested[dimension] === "string" && requested[dimension].trim())) return null;
  const rules = Array.isArray(payload.rules)
    ? payload.rules.map((item) => {
        if (!isRecord(item)) return null;
        const severity: RuleEvidence["severity"] = item.severity === "disqualifying" ? "disqualifying" : "hard";
        return {
          id: readString(item, ["id"], "rule-unknown"),
          ruleType: readString(item, ["rule_type"], "other"),
          rule: readString(item, ["rule"], "规则原文未提供"),
          severity,
          sourceTitle: readString(item, ["source_title"], "来源未标注"),
          sourceUrl: readString(item, ["source_url"], ""),
          publishedDate: readString(item, ["published_date"], "未标注"),
          verifiedAt: readString(item, ["verified_at"], "未标注"),
        } satisfies RuleEvidence;
      }).filter((item): item is RuleEvidence => item !== null)
    : [];
  const sources = Array.isArray(payload.sources)
    ? payload.sources.map((item) => {
        if (!isRecord(item)) return null;
        return {
          id: readString(item, ["id"], "source-unknown"),
          title: readString(item, ["title"], "来源未标注"),
          url: readString(item, ["url"], ""),
          authorityName: readString(item, ["authority_name"], "发布主体未标注"),
          publishedDate: readString(item, ["published_date"], "未标注"),
          verifiedAt: readString(item, ["verified_at"], "未标注"),
          sha256: readString(item, ["sha256"], ""),
        } satisfies RuleSource;
      }).filter((item): item is RuleSource => item !== null)
    : [];
  const corpus = isRecord(payload.corpus) ? payload.corpus : {};
  const snapshot = isRecord(corpus.snapshot) ? corpus.snapshot : {};
  return {
    match: payload.match,
    blocking: payload.blocking === true,
    requested: Object.fromEntries(dimensions.map((dimension) => [dimension, String(requested[dimension])])) as RuleScopeInput,
    rules,
    sources,
    unknowns: Array.isArray(payload.unknowns) ? payload.unknowns.filter((item): item is string => typeof item === "string") : [],
    sourceRawSha256: readString(corpus, ["sourceRawSha256"], RULE_CORPUS_META.sourceRawSha256),
    snapshotVerifiedAt: readString(snapshot, ["verified_at"], RULE_CORPUS_META.snapshot.verified_at),
  };
}

async function apiRequest(path: string, init?: RequestInit) {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, 10_000);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const response = await fetch(path, {
      ...init,
      signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      const detail = isRecord(payload)
        ? isRecord(payload.error)
          ? readString(payload.error, ["message", "detail"], "")
          : readString(payload, ["message", "detail"], "")
        : "";
      throw new Error(detail || `服务暂时不可用（${response.status}）`);
    }
    return payload;
  } catch (error) {
    if (timedOut) throw new Error("请求超过 10 秒仍未完成，请重试");
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof Error && error.message !== "Failed to fetch") throw error;
    throw new Error("无法连接服务，请检查网络后重试");
  } finally {
    window.clearTimeout(timeout);
  }
}

export function DiagnosisPanel({onBriefSource}:{onBriefSource?:(source:DiagnosisBriefSource|null)=>void}={}) {
  const theme = useWorkbenchTheme();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [resultSource,setResultSource]=useState<DiagnosisBriefSource|null>(null);
  const [mode,setMode]=useState<"advisor"|"readiness"|"topics">("advisor");
  const [topicsOpened,setTopicsOpened]=useState(false);
  const requestEpoch=useRef(0);
  const [form, setForm] = useState({
    title: "",
    decisionOwner: "",
    population: "",
    geography: "",
    stage: "intake",
    problem: "",
    evidenceStatus: "",
  });

  const update = (field: keyof typeof form, value: string) => {
    requestEpoch.current++;setSubmitting(false);setResult(null);setResultSource(null);setError('');onBriefSource?.(null);
    setForm((current) => ({ ...current, [field]: value }));
  };
  useEffect(()=>()=>{requestEpoch.current++;},[]);
  const openMode=(next:"advisor"|"readiness"|"topics")=>{setMode(next);if(next==="topics")setTopicsOpened(true);};
  const applyTopic=(topic:{title:string;decisionOwner:string;population?:string;geography?:string;problem?:string})=>{
    requestEpoch.current++;setSubmitting(false);setResult(null);setResultSource(null);setError('');onBriefSource?.(null);
    setForm(current=>({...current,title:topic.title,decisionOwner:topic.decisionOwner||current.decisionOwner,population:topic.population??current.population,geography:topic.geography??current.geography,problem:topic.problem??current.problem,evidenceStatus:"proposed"}));
    setMode("readiness");
    requestAnimationFrame(()=>document.getElementById("diagnose")?.scrollIntoView({behavior:"smooth",block:"start"}));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);
    setResultSource(null);onBriefSource?.(null);
    const epoch=++requestEpoch.current;
    const input={...form,title:form.title.trim(),problem:form.problem.trim(),decisionOwner:form.decisionOwner.trim(),population:form.population.trim(),geography:form.geography.trim()};
    try {
      const payload = await apiRequest("/api/diagnose", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if(epoch!==requestEpoch.current)return;
      setResult(normalizeDiagnosis(payload));
      setResultSource({id:crypto.randomUUID(),input:input as DiagnosisBriefInput});
    } catch (requestError) {
      if(epoch===requestEpoch.current)setError(requestError instanceof Error ? requestError.message : "诊断服务暂时不可用");
    } finally {
      if(epoch===requestEpoch.current)setSubmitting(false);
    }
  }

  return (
    <section className="section section-diagnose" id="diagnose" aria-labelledby="diagnose-title">
      <div className="section-heading inverted">
        <div><span className="eyebrow">选题与诊断</span><h2 id="diagnose-title">{mode==="advisor"?"从身边的变化，找到值得研究的问题":mode==="topics"?"从文献里找方向，用证据筛选题目":"先暴露证据缺口，再安排最短修复路径"}</h2></div>
        <p>{mode==="advisor"?"把热点、地区与团队资源放在一起，找到一个能做深、能落地的研究切口。":mode==="topics"?"导入文献，看清领域结构、前沿与空白，再为候选题目生成逐项可追溯的证据画像。":"填写当前项目状态，缺失信息可标为未知。"}</p>
      </div>
      <div className="diagnose-modes" role="tablist" aria-label="诊断类型">
        {([["advisor","选题顾问","热点线索 · 地区资源 · 研究切口"],["readiness","项目诊断","检查证据缺口与下一步"],["topics","文献图谱","领域结构 · 研究空白 · 证据画像"]] as const).map(([id,label,hint])=><button key={id} type="button" role="tab" id={`dg-tab-${id}`} aria-selected={mode===id} aria-controls={`dg-panel-${id}`} tabIndex={mode===id?0:-1} onClick={()=>openMode(id)} onKeyDown={event=>{if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;event.preventDefault();const order=["advisor","readiness","topics"] as const;const index=order.indexOf(id);const next=event.key==="Home"?order[0]:event.key==="End"?order[2]:order[(index+(event.key==="ArrowRight"?1:2))%3];openMode(next);document.getElementById(`dg-tab-${next}`)?.focus();}}><strong>{label}</strong><small>{hint}</small></button>)}
      </div>
      <div role="tabpanel" id="dg-panel-advisor" aria-labelledby="dg-tab-advisor" hidden={mode!=="advisor"}><TopicAdvisor onUseTopic={applyTopic} renderEnhancement={context=><TopicModelProposal {...context} catalogVersion={topicCatalog.contentVersion} onUseTopic={applyTopic}/>}/></div>
      <div role="tabpanel" id="dg-panel-topics" aria-labelledby="dg-tab-topics" hidden={mode!=="topics"}>{topicsOpened&&<TopicLab onUseTopic={applyTopic}/>}</div>
      <div role="tabpanel" id="dg-panel-readiness" aria-labelledby="dg-tab-readiness" hidden={mode!=="readiness"}>
      <div className="diagnose-grid">
        <form className="diagnose-form" onSubmit={submit} aria-busy={submitting}>
          <fieldset disabled={submitting}>
            <div className="form-grid two-cols">
              <label><span>项目名称</span><input required value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="例如：银发人群智能出行研究" /></label>
              <label><span>决策主体</span><input required value={form.decisionOwner} onChange={(event) => update("decisionOwner", event.target.value)} placeholder="明确到组织或职能角色" /></label>
              <label><span>目标人群</span><input required value={form.population} onChange={(event) => update("population", event.target.value)} placeholder="写清纳入、排除边界" /></label>
              <label><span>地理范围</span><input required value={form.geography} onChange={(event) => update("geography", event.target.value)} placeholder="城市、区县或具体场景" /></label>
              <label className="diagnosis-stage"><span>自报工作阶段 <small>仅用于准备度诊断</small></span><select value={form.stage} onChange={(event) => update("stage", event.target.value)}>{STAGES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <div className="diagnosis-evidence-options">
              <ChoiceGroup legend="证据成熟度（请选择真实状态）" name="diagnosis-evidence" value={form.evidenceStatus} onChange={(value) => update("evidenceStatus", value)} tone={theme} required options={[
                { value: "none", label: "尚无证据" },
                { value: "proposed", label: "仅有拟议方案" },
                { value: "partial", label: "已有部分证据" },
                { value: "verified", label: "来源与口径已核验" },
              ]} />
              </div>
            </div>
            <label><span>真实决策问题</span><textarea required rows={4} value={form.problem} onChange={(event) => update("problem", event.target.value)} placeholder="谁要在什么期限内，依据哪些证据，在什么选项间作何取舍？" /></label>
            <button className="primary-button gold-button" type="submit">{submitting ? "正在检查…" : "检查缺口与下一步"}</button>
          </fieldset>
        </form>
        <div className="diagnosis-result" aria-live="polite" aria-busy={submitting}>
          {submitting && <div className="result-placeholder" role="status"><span className="evidence-orbit" aria-hidden="true">…</span><h3>正在检查研究准备度</h3></div>}
          {!submitting && !result && !error && <div className="result-placeholder"><span className="evidence-orbit" aria-hidden="true">Q</span><h3>等待真实输入</h3><p>诊断结果将按“分数—风险—下一步”呈现，并保留未知项。</p></div>}
          {!submitting && error && <div className="result-placeholder error-state" role="alert"><span className="evidence-orbit">!</span><h3>暂时无法完成诊断</h3><p>{error}。表单内容仍保留，可稍后重试。</p></div>}
          {!submitting && result && <>
            <div className="result-overview">
              <div className="score-ring" style={{ "--score": result.score ?? 0 } as React.CSSProperties} aria-label={result.score === null ? "综合分数未返回" : `综合分数 ${result.score} 分`}>
                <strong>{result.score ?? "—"}</strong><span>/ 100</span>
              </div>
              <div><span className="result-label">自报信息 · 启发式指标</span><h3>优先处理下面的证据缺口</h3><p>{result.summary}</p></div>
            </div>
            {result.dimensions.length > 0 && <div className="dimension-list">{result.dimensions.map((item) => <div className="dimension-row" key={item.label}><span>{item.label}</span><div className="meter"><i style={{ width: `${item.score}%` }} /></div><strong>{item.score}</strong></div>)}</div>}
            <div className="result-columns">
              <div><h4>主要风险</h4>{result.risks.length ? <ul className="risk-list">{result.risks.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">接口未返回风险项，不能据此视为无风险。</p>}</div>
              <div><h4>下一步</h4>{result.nextActions.length ? <ol className="action-list">{result.nextActions.map((item) => <li key={item}>{item}</li>)}</ol> : <p className="muted">接口未返回行动项，请补充输入后复诊。</p>}</div>
            </div>
            {result.transitionPlan && <div className="diagnosis-materials">
              <div><span className="result-label">权威工作流材料清单</span><h4>{STAGE_LABELS[result.transitionPlan.currentStage]} → {result.transitionPlan.nextStage ? STAGE_LABELS[result.transitionPlan.nextStage] : "无下一阶段"}</h4></div>
              <dl>
                <div><dt>需就绪的质量门禁</dt><dd>{result.transitionPlan.requiredGates.length ? result.transitionPlan.requiredGates.map((gate) => GATE_LABELS[gate]).join("、") : "本次转换无前置 Gate"}</dd></div>
                <div><dt>需准备的产物</dt><dd>{result.transitionPlan.requiredArtifacts.length ? result.transitionPlan.requiredArtifacts.join("、") : "无新增产物"}</dd></div>
              </dl>
              <p>{result.transitionPlan.note}</p>
            </div>}
            {resultSource&&<DiagnosisActions codes={result.actionCodes} source={resultSource} onPrepare={source=>{onBriefSource?.(source);window.location.hash='design';}}/>}
          </>}
        </div>
      </div>
      </div>
    </section>
  );
}

function RuleWorkbench() {
  const [form, setForm] = useState<RuleScopeInput>({
    edition: RULE_CORPUS_META.snapshot.edition,
    group: RULE_CORPUS_META.snapshot.group,
    region: RULE_CORPUS_META.snapshot.region,
    track: RULE_CORPUS_META.snapshot.track,
    stage: RULE_CORPUS_META.snapshot.stage,
  });
  const [result, setResult] = useState<RuleResolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(dimension: keyof RuleScopeInput, value: string) {
    setForm((current) => ({ ...current, [dimension]: value }));
  }

  async function resolveRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest("/api/rules", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const normalized = normalizeRuleResolution(payload);
      if (!normalized) throw new Error("规则服务返回了无法识别的结果");
      setResult(normalized);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "规则服务暂时不可用");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section rules-section" id="rules" aria-labelledby="rules-title">
      <div className="section-heading">
        <div><span className="eyebrow">五维赛事规则解析器</span><h2 id="rules-title">五个维度同时匹配，规则才可进入项目</h2></div>
        <p>按届次、组别、赛区、赛道与阶段匹配来源快照；五维不匹配时标为未知，停止套用。</p>
      </div>

      <aside className="rule-scope-banner" aria-label="规则快照使用边界">
        <div><strong>当前证据快照</strong><span>{RULE_CORPUS_META.snapshot.edition} · {RULE_CORPUS_META.snapshot.group} · 核验于 {RULE_CORPUS_META.snapshot.verified_at}</span></div>
        <p>历史核验快照。正式提交前，请重新核对当前项目适用的官方通知及补充文件。</p>
      </aside>

      <aside className="rule-scope-banner" aria-label="新届次官方通知核验">
        <div><strong>{COMPETITION_UPDATE.title}</strong><span>{COMPETITION_UPDATE.documentNumber} · 署期 {COMPETITION_UPDATE.signedDate} · 核验 {COMPETITION_UPDATE.verifiedAt}</span><a href={COMPETITION_UPDATE.source} target="_blank" rel="noreferrer">{COMPETITION_UPDATE.sourceLabel}</a></div>
        <div><ul>{COMPETITION_UPDATE.highlights.map(item => <li key={item}>{item}</li>)}</ul><p>{COMPETITION_UPDATE.boundary}</p><p>最近核查尝试 {COMPETITION_UPDATE.lastAttempt.date}：{COMPETITION_UPDATE.lastAttempt.result} 本次尝试不等于完整规则重新核验。</p></div>
      </aside>

      <div className="rule-workbench">
        <form className="rule-form" onSubmit={resolveRules} aria-busy={loading}>
          <div className="rule-form-grid">
            <label><span>届次</span><input required value={form.edition} onChange={(event) => update("edition", event.target.value)} /></label>
            <label><span>组别</span><input required value={form.group} onChange={(event) => update("group", event.target.value)} /></label>
            <label><span>赛区</span><input required value={form.region} onChange={(event) => update("region", event.target.value)} /></label>
            <label><span>赛道</span><input required value={form.track} onChange={(event) => update("track", event.target.value)} /></label>
            <label><span>阶段</span><input required value={form.stage} onChange={(event) => update("stage", event.target.value)} /></label>
          </div>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? "正在核对五维范围…" : "解析适用规则"}</button>
          <p>仅采用五维精确匹配的规则。</p>
        </form>

        <div className="rule-result" aria-live="polite" aria-busy={loading}>
          {!result && !error && !loading && <div className="rule-placeholder"><span className="empty-mark">5D</span><h3>等待五维核对</h3><p>当前收录 1 个来源、10 条规则。点击解析后才判断是否适用。</p></div>}
          {loading && <div className="rule-placeholder" role="status"><span className="empty-mark">…</span><h3>正在逐维匹配</h3><p>规则缺口将保持为未知，不会自动推断。</p></div>}
          {error && !loading && <div className="rule-placeholder" role="alert"><span className="empty-mark">!</span><h3>暂时无法解析规则</h3><p>{error}。输入仍保留，可直接重试。</p></div>}
          {result && !loading && !error && <>
            <div className={`rule-resolution-head ${result.blocking ? "blocked" : "matched"}`}>
              <div><span>{result.match === "exact" ? "五维范围已匹配" : "没有适用快照"}</span><h3>{result.match === "exact" ? `找到 ${result.rules.length} 条有来源规则` : "规则未知，停止套用"}</h3></div>
              <strong>{result.blocking ? "阻断" : "精确匹配"}</strong>
            </div>
            <dl className="resolved-scope">
              <div><dt>届次</dt><dd>{result.requested.edition}</dd></div>
              <div><dt>组别</dt><dd>{result.requested.group}</dd></div>
              <div><dt>赛区</dt><dd>{result.requested.region}</dd></div>
              <div><dt>赛道</dt><dd>{result.requested.track}</dd></div>
              <div><dt>阶段</dt><dd>{result.requested.stage}</dd></div>
            </dl>
            {result.rules.length > 0 && <div className="resolved-rules">{result.rules.map((rule) => <article key={rule.id} className={rule.severity === "disqualifying" ? "disqualifying" : "hard"}><div><span>{ruleTypeLabel(rule.ruleType)}</span><strong>{rule.severity === "disqualifying" ? "违规可取消资格" : "硬规则"}</strong></div><p>{rule.rule}</p><small>{rule.sourceTitle} · 发布 {rule.publishedDate} · 核验 {rule.verifiedAt}</small></article>)}</div>}
            {result.unknowns.length > 0 && <div className="rule-unknowns"><h4>仍需核验</h4><ul>{result.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {result.sources.length > 0 && <div className="rule-source-ledger"><h4>来源证据</h4>{result.sources.map((source) => <article key={source.id}><div><strong>{source.title}</strong><span>{source.authorityName}</span></div><p>来源记录 SHA-256：{source.sha256.slice(0, 16)}…</p><a href={source.url} target="_blank" rel="noreferrer">打开公开原始来源（新窗口） <span aria-hidden="true">↗</span></a></article>)}</div>}
            <p className="rule-contract-note">规则语料快照 {result.sourceRawSha256.slice(0, 12)}… · 核验日期 {result.snapshotVerifiedAt}</p>
          </>}
        </div>
      </div>
    </section>
  );
}

function ruleTypeLabel(value: string) {
  return ({
    eligibility: "参赛资格",
    topic: "选题",
    submission: "报告提交",
    anonymity: "匿名要求",
    map: "地图合规",
    integrity: "学术诚信",
    ai: "AI 使用",
    format: "赛段形式",
  } as Record<string, string>)[value] ?? "其他规则";
}

function CanvasPanel({ dataset, design }: { dataset: DatasetValue | null; design: DesignSnapshot | null }) {
  const nav = useWorkbenchNav();
  const auth = useHostedSession();
  const [guest] = useState<CanvasIdentity>(() => {
    let storage: Storage | null = null;
    try { storage = typeof window === 'undefined' ? null : window.sessionStorage; } catch { /* This mount can use an ephemeral guest scope. */ }
    return anonymousCanvasIdentity(storage, () => crypto.randomUUID());
  });
  if (auth.loading || !auth.session) return <p className="wb-canvas-loading" role="status">{auth.error ? '账号状态暂未就绪，请重新连接。' : '正在核对画布归属…'}</p>;
  const ownerId = auth.session.authenticated ? auth.session.user?.id ?? null : null;
  if (auth.session.authenticated && !ownerId) return <p className="wb-canvas-loading" role="alert">画布归属未确定，请重新登录。</p>;
  return <ResearchCanvas storageScope={{ identity: ownerId ? { kind: 'account', id: ownerId } : guest, projectId: LOCAL_CANVAS_WORKSPACE }} identityEpoch={auth.identityEpoch} isCurrentScope={() => auth.isCurrentIdentity(ownerId, auth.identityEpoch)} workspaceDataset={dataset} design={design} onOpen={nav.openFromCanvas} onShowWorkbench={nav.showWorkbench} focus={nav.canvasFocus} active={nav.section === 'canvas'} />;
}

/**
 * Every workbench module, wired to the shared handoff store, and what the agent shell may read of the project:
 * the shared questionnaire and dataset, and, when observeReport is set, the report once its room has been opened.
 * `sendToReport` hands the editor content to apply as one undoable step, as the sampling module does; the editor
 * applies it once mounted.
 * The panels are memoised, so a shell re-rendering for its own state (the report being re-scored) leaves modules alone.
 */
export function useWorkbenchModules(observeReport = false): { panels: Record<WorkbenchPanel, ReactNode>; view: ProjectView; publishProposal: (proposal: AgentQuestionnaireProposal) => void; sendToReport: (insert: import("@/lib/report-insert").ReportInsert) => void } {
  const { session, identityEpoch } = useHostedSession();
  const { store: handoffs, snapshot: exchange } = useWorkbenchHandoffs(
    JSON.stringify(['workspace', session?.user?.id ?? null, identityEpoch]),
  );
  const resultHandled = useHandoffAcknowledgement(handoffs, 'result', exchange.pending.result?.deliveryId);
  const briefHandled = useHandoffAcknowledgement(handoffs, 'brief', exchange.pending.brief?.deliveryId);
  // A model's questionnaire proposal waits in the 问卷室 for review; applying or keeping the design acknowledges it.
  const proposalHandled = useHandoffAcknowledgement(handoffs, 'questionnaire', exchange.pending.questionnaire?.deliveryId);
  const publishProposal = useCallback((proposal: AgentQuestionnaireProposal) => { handoffs.publish('questionnaire', proposal); }, [handoffs]);
  // Paragraphs, tables and formulas a workbench module sends to the report; the editor applies each once.
  const [reportInsert,setReportInsert]=useState<import("@/lib/report-insert").ReportInsert|null>(null);
  const [report,setReport]=useState<EditorContent|null>(null);
  const dataset=exchange.dataset;
  const view=useMemo<ProjectView>(()=>({design:exchange.design?.design??null,dataset:dataset?{name:dataset.name,rows:dataset.table.rows.length,simulated:dataset.kind==="simulated",hash:dataset.sourceHash,screened:dataset.lineage.some(step=>step.startsWith("质控"))}:null,report,resultPending:!!exchange.pending.result}),[exchange.design,dataset,report,exchange.pending.result]);
  const panels = useMemo<Record<WorkbenchPanel, ReactNode>>(() => {
    const registration=normalizeResultRegistration(exchange.pending.result?.payload);
    return ({
      overview: <>
      <section className="hero" id="overview" aria-labelledby="hero-title">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy">
            <span className="hero-kicker"><i /> 市场调查与分析研究工作台</span>
            <h1 id="hero-title">让每个问题，<br /><em>都循证抵达行动。</em></h1>
            <p>从规则锁定、获奖案例证据、研究设计到报告答辩，证见把问题、数据、洞察和行动收进一条可复核的证据链。</p>
            <div className="hero-actions"><Link className="primary-button gold-button" href="/projects">进入我的项目</Link><a className="ghost-button" href="#cases">查看获奖案例 <span aria-hidden="true">↗</span></a></div>
            <div className="hero-proof"><span><strong>12</strong> 阶段权威合约</span><span><strong>9</strong> 道质量 Gate</span><span><strong>5D</strong> 规则快照</span></div>
            <div className="wb-quick-start" aria-label="工作台快捷入口">
              <h2>从这里开始</h2>
              <a href="#cases"><span>01</span><div><strong>读一份真实案例</strong><small>看看好问题如何落到证据与行动</small></div><span aria-hidden="true">↗</span></a>
              <a href="#diagnose"><span>02</span><div><strong>检查当前准备度</strong><small>把模糊的不足变成下一步清单</small></div><span aria-hidden="true">↗</span></a>
              <a href="#rules"><span>03</span><div><strong>核对适用规则</strong><small>先锁定五维边界，再推进研究</small></div><span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <EvidenceFlight />
        </div>
      </section>

      <CompetitionCalendar />
      <ResearchPipeline />

      <section className="section qdia-section" aria-labelledby="qdia-title">
        <div className="section-heading"><div><span className="eyebrow">Q–D–I–A 方法链</span><h2 id="qdia-title">让问题、数据、洞察与行动对应</h2></div><p>每一阶段都回答一个可验证问题；上游证据变化时，相关 Gate 必须在受信任控制面中重新评估。</p></div>
        <div className="qdia-cards">{QDIA.map((item, index) => <article key={item.code}><span className="step-number">0{index + 1}</span><div className="step-code">{item.code}</div><h3>{item.name} <small>{item.english}</small></h3><p>{item.detail}</p><span className="step-check">{["决策主体 · 目标人群 · 证据缺口", "来源 · 样本 · 清洗 · 台账", "方法适配 · 结果 · 限制", "负责人 · 优先级 · KPI"][index]}</span></article>)}</div>
      </section>

      <section className="closing-cta"><div><span className="eyebrow">从真实状态开始</span><h2>把下一步，变成可验证的行动。</h2><p>梳理当前证据缺口，生成下一步行动清单。</p></div><a className="primary-button gold-button" href="#diagnose">开始项目诊断</a></section>

      </>,
      exam: <NetExamStudio />,
      preflight: <SubmissionPreflight />,
      sampling: <SamplingWorkbench dataset={exchange.dataset} onReportInsert={insert=>{setReportInsert(insert);window.location.hash="editor";}} />,
      cases: <CaseLibrary />,
      editor: <EditingStudio localOnly resultProposal={registration?.result} resultFigures={registration?.figures} resultVisualStyle={registration?.visualStyle} onResultHandled={resultHandled} reportInsert={reportInsert} onReportInsertHandled={()=>setReportInsert(null)} questionnaire={exchange.design?.design??null} onContentChange={observeReport?setReport:undefined}/>,
      defense: <DefenseStudio />,
      analysis: <SurveyLab onResultSnapshot={(result,figures,visualStyle)=>{handoffs.publish('result',{result,figures,visualStyle});window.location.hash="editor";}} designSnapshot={exchange.design} designTransfer={exchange.pending.design?.payload} datasetTransfer={exchange.pending.dataset?.payload} onDatasetChange={handoffs.setDataset}/>,
      canvas: <CanvasPanel dataset={exchange.dataset} design={exchange.design} />,
      silicon: <SiliconLab designSnapshot={exchange.design} onSendToAnalysis={handoff=>{handoffs.publish('dataset',handoff);window.location.hash='analysis';}}/>,
      design: <QuestionnaireStudio localOnly agentProposal={exchange.pending.questionnaire?.payload ?? null} onAgentHandled={proposalHandled} briefSource={exchange.pending.brief?.payload} onBriefHandled={briefHandled} onSnapshot={handoffs.setDesign} onAnalyze={snapshot=>{handoffs.setDesign(snapshot);handoffs.publish('design',{id:crypto.randomUUID(),snapshot});}} />,
      diagnose: <DiagnosisPanel onBriefSource={source=>{if(source)handoffs.publish('brief',source);else briefHandled();}} />,
      workspace: <ProjectPortal />,
      rules: <RuleWorkbench />,
      services: <><p className="hosted-notice"><Link href="/services">打开个人模型服务页面 →</Link></p><HostedServices/></>,
  }); }, [exchange, handoffs, resultHandled, briefHandled, proposalHandled, reportInsert, observeReport]);
  return { panels, view, publishProposal, sendToReport: setReportInsert };
}

export default function EviXPlatform() {
  return <WorkbenchShell panels={useWorkbenchModules().panels} />;
}
