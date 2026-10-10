"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ALLOWED_TRANSITIONS,
  CONTROL_CONTRACT_META,
  GATE_NAMES,
  GATE_VALUES,
  PROJECT_STAGES,
  type GateName,
  type GateValue,
  type ProjectStage,
} from "@/data/control-plane-contract.generated";
import { RULE_CORPUS_META } from "@/data/rule-corpus.generated";
import { COMPETITION_UPDATE } from "@/data/competition-update";
import LifecycleWarRoom from "@/components/LifecycleWarRoom";
import EvidenceFlight from "@/components/EvidenceFlight";
import ChoiceGroup from "@/components/ChoiceGroup";
import WorkbenchShell, { useWorkbenchTheme } from "@/components/WorkbenchShell";
import dynamic from 'next/dynamic';
import Link from 'next/link';
const EditingStudio = dynamic(() => import('@/components/editors/EditingStudio'));
const SurveyLab = dynamic(() => import('@/components/analysis/SurveyLab'));
const QuestionnaireStudio = dynamic(() => import('@/components/design/QuestionnaireStudio'));
const DefenseStudio = dynamic(() => import('@/components/defense/DefenseStudio'));
import HostedServices from '@/components/hosted/HostedServices';
import type {AgentQuestionnaireProposal} from '@/lib/agent-questionnaire-proposal';
import DiagnosisActions from "@/components/DiagnosisActions";
import type { DiagnosisBriefInput, DiagnosisBriefSource } from '@/lib/diagnosis-actions';
import type { DesignSnapshot, DesignTransfer } from '@/lib/questionnaire-mapping';

type UnknownRecord = Record<string, unknown>;

type CaseSourceRecord = {
  label: string;
  sourceTier: string;
  url: string;
  repositoryPath: string;
  verifiedFields: string[];
};

type CaseRecord = {
  id: string;
  title: string;
  edition: string;
  group: string;
  stage: string;
  track: string;
  region: string;
  award: string;
  institution: string;
  sourceStatus: "official_verified" | "user_attested" | "unverified";
  sourceTier: string;
  caseDepth: "listing_only" | "artifact_deep_dive" | "unknown";
  summary: string;
  problem: string;
  method: string;
  result: string;
  keywords: string[];
  takeaways: string[];
  risks: string[];
  sourceUrl: string;
  sourceRefs: CaseSourceRecord[];
};

type CaseLibraryMeta = {
  total: number;
  officialVerified: number;
  userAttested: number;
};

type CaseLibraryNotice = {
  title: string;
  body: string;
  coverage: string;
  capturedAt: string;
};

type GateStatus = GateValue;

type GateRecord = {
  id: GateName;
  status: GateStatus;
};

type ProjectRecord = {
  id: string;
  title: string;
  controlStatus: ProjectStage;
  competitionStage: string;
  statusRevision: number;
  authority: "web_registry" | "agentctl_verified" | "legacy_unverified";
  integrity: "current" | "stale" | "contract_mismatch" | "needs_revalidation";
  gates: GateRecord[];
  contract: {
    workflowVersion: string;
    workflowSha256: string;
    gatesVersion: string;
    gatesSha256: string;
  };
  legacyControlStatus: string;
  updatedAt: string;
};

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

const GATE_DEFINITIONS = GATE_NAMES.map(
  (id) => [id, GATE_LABELS[id]] as const,
);

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

const AUTHORITY_LABELS: Record<ProjectRecord["authority"], string> = {
  web_registry: "门户登记态 · 未接入本地证据控制程序",
  agentctl_verified: "本地证据控制程序已核验",
  legacy_unverified: "历史记录 · 待重新验证",
};

const INTEGRITY_LABELS: Record<ProjectRecord["integrity"], string> = {
  current: "契约一致",
  stale: "状态已失效",
  contract_mismatch: "契约不匹配",
  needs_revalidation: "需要重新验证",
};

const DEFAULT_GROUP_OPTIONS = ["全部组别"];
const DEFAULT_AWARD_OPTIONS = ["全部奖项"];
const DEFAULT_EDITION_OPTIONS = ["全部届次"];

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

function readNumber(record: UnknownRecord, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
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

function normalizeStatus(value: unknown): CaseRecord["sourceStatus"] {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (status === "official_verified" || status === "official" || status === "verified") return "official_verified";
  if (status === "user_attested" || status === "attested") return "user_attested";
  return "unverified";
}

function normalizeCaseDepth(value: unknown): CaseRecord["caseDepth"] {
  if (value === "listing_only" || value === "artifact_deep_dive") return value;
  return "unknown";
}

function normalizeSourceRefs(value: unknown): CaseSourceRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          label: `来源 ${index + 1}`,
          sourceTier: "unknown",
          url: item,
          repositoryPath: "",
          verifiedFields: [],
        };
      }
      if (!isRecord(item)) return null;
      return {
        label: readString(item, ["label", "title", "name"], `来源 ${index + 1}`),
        sourceTier: readString(item, ["sourceTier", "source_tier"], "unknown"),
        url: readString(item, ["url", "href", "sourceUrl"], ""),
        repositoryPath: readString(item, ["repositoryPath", "repository_path"], ""),
        verifiedFields: readStringArray(item, ["verifiedFields", "verified_fields"]),
      };
    })
    .filter((item): item is CaseSourceRecord => item !== null);
}

function normalizeCase(value: unknown, index: number): CaseRecord | null {
  if (!isRecord(value)) return null;
  const id = readString(value, ["id", "caseId", "case_id"], `case-${index}`);
  const title = readString(value, ["title", "name", "projectTitle", "project_title"], "未命名案例");
  const sourceRefs = normalizeSourceRefs(value.sourceRefs);
  const directSourceUrl = readString(value, ["sourceUrl", "source_url", "url"], "");
  const sourceUrl = directSourceUrl || sourceRefs.find((item) => item.url)?.url || "";
  return {
    id,
    title,
    edition: readString(value, ["edition"], "届次未标注"),
    group: readString(value, ["group"], "组别未标注"),
    stage: readString(value, ["stage"], "阶段未标注"),
    track: readString(value, ["track"], "赛道未标注"),
    region: readString(value, ["region"], "赛区未标注"),
    sourceStatus: normalizeStatus(value.sourceStatus ?? value.source_status ?? value.verificationStatus ?? value.verification),
    award: readString(value, ["award"], "奖项未标注"),
    institution: readString(value, ["institution", "school"], "单位未标注"),
    sourceTier: readString(value, ["sourceTier", "source_tier"], "unknown"),
    caseDepth: normalizeCaseDepth(value.caseDepth ?? value.case_depth),
    summary: readString(value, ["summary", "abstract", "description"], "公开来源仅提供案例元数据，未披露摘要、方法或结论。"),
    problem: readString(value, ["problem", "decisionProblem", "decision_problem"], ""),
    method: readString(value, ["method", "researchDesign", "research_design"], "") || readStringArray(value, ["methods"]).join("；"),
    result: readString(value, ["result", "findings", "outcome"], ""),
    keywords: readStringArray(value, ["topic", "topics", "keywords"]),
    takeaways: readStringArray(value, ["takeaways", "lessons", "insights", "highlights"]),
    risks: [...readStringArray(value, ["risks", "limitations", "warnings"]), ...(() => {
      const note = readString(value, ["safetyNote"], "");
      return note ? [note] : [];
    })()],
    sourceUrl,
    sourceRefs,
  };
}

function extractCollection(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return { found: true, items: payload };
  if (!isRecord(payload)) return { found: false, items: [] as unknown[] };
  for (const key of keys) {
    if (Array.isArray(payload[key])) return { found: true, items: payload[key] as unknown[] };
  }
  if (isRecord(payload.data)) {
    for (const key of keys) {
      if (Array.isArray(payload.data[key])) return { found: true, items: payload.data[key] as unknown[] };
    }
  }
  return { found: false, items: [] as unknown[] };
}

function readFacetValues(payload: unknown, key: string) {
  if (!isRecord(payload) || !isRecord(payload.facets) || !Array.isArray(payload.facets[key])) return [];
  return payload.facets[key]
    .map((item) => isRecord(item) ? readString(item, ["value"], "") : "")
    .filter(Boolean);
}

function normalizeGateStatus(value: unknown): GateStatus {
  const status = typeof value === "string" ? value.toLowerCase() : "not_run";
  return (GATE_VALUES as readonly string[]).includes(status)
    ? (status as GateStatus)
    : "not_run";
}

function normalizeGates(value: unknown): GateRecord[] {
  const found = new Map<GateName, GateStatus>();
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (!isRecord(item)) return;
      const id = readString(item, ["id", "gate", "gateId", "gate_id"], "").toLowerCase();
      if ((GATE_NAMES as readonly string[]).includes(id)) {
        found.set(id as GateName, normalizeGateStatus(item.status));
      }
    });
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([id, item]) => {
      const normalizedId = id.toLowerCase();
      if ((GATE_NAMES as readonly string[]).includes(normalizedId)) {
        found.set(
          normalizedId as GateName,
          normalizeGateStatus(isRecord(item) ? item.status : item),
        );
      }
    });
  }
  return GATE_DEFINITIONS.map(([id]) => ({ id, status: found.get(id) ?? "not_run" }));
}

function normalizeProject(value: unknown, index: number): ProjectRecord | null {
  if (!isRecord(value)) return null;
  const rawControlStatus = readString(
    value,
    ["controlStatus", "control_status", "stage"],
    "intake",
  );
  const canonicalControlStatus = (PROJECT_STAGES as readonly string[]).includes(
    rawControlStatus,
  );
  const rawAuthority = readString(value, ["authority"], "web_registry");
  const authority = ["web_registry", "agentctl_verified", "legacy_unverified"].includes(rawAuthority)
    ? (rawAuthority as ProjectRecord["authority"])
    : "legacy_unverified";
  const rawIntegrity = readString(value, ["integrity"], "needs_revalidation");
  const integrity = !canonicalControlStatus
    ? "contract_mismatch"
    : ["current", "stale", "contract_mismatch", "needs_revalidation"].includes(rawIntegrity)
      ? (rawIntegrity as ProjectRecord["integrity"])
      : "needs_revalidation";
  const contract = isRecord(value.contract) ? value.contract : {};
  const workflow = isRecord(contract.workflow) ? contract.workflow : {};
  const gates = isRecord(contract.gates) ? contract.gates : {};
  const legacy = isRecord(value.legacy) ? value.legacy : {};
  return {
    id: readString(value, ["id", "projectId", "project_id"], `project-${index}`),
    title: readString(value, ["title", "name", "projectTitle", "project_title"], "未命名项目"),
    controlStatus: canonicalControlStatus
      ? (rawControlStatus as ProjectStage)
      : "intake",
    competitionStage: readString(
      value,
      ["competitionStage", "competition_stage"],
      "unknown",
    ),
    statusRevision: readNumber(value, ["statusRevision", "status_revision"], 0),
    authority,
    integrity,
    gates: normalizeGates(value.gates ?? value.gateStatus ?? value.gateResults ?? value.gate_results),
    contract: {
      workflowVersion: readString(
        workflow,
        ["version"],
        CONTROL_CONTRACT_META.workflowVersion,
      ),
      workflowSha256: readString(
        workflow,
        ["sha256"],
        CONTROL_CONTRACT_META.workflowSha256,
      ),
      gatesVersion: readString(
        gates,
        ["version"],
        CONTROL_CONTRACT_META.gatesVersion,
      ),
      gatesSha256: readString(
        gates,
        ["sha256"],
        CONTROL_CONTRACT_META.gatesSha256,
      ),
    },
    legacyControlStatus: readString(
      legacy,
      ["controlStatus", "control_status"],
      "",
    ),
    updatedAt: readString(value, ["updatedAt", "updated_at"], ""),
  };
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

function VerificationBadge({ status }: { status: CaseRecord["sourceStatus"] }) {
  const labels = {
    official_verified: "官方来源已核验",
    user_attested: "用户陈述奖项｜未独立核验",
    unverified: "来源待核验",
  };
  return <span className={`verification-badge ${status}`}>{labels[status]}</span>;
}

function caseGroupLabel(group: string) {
  return group.trim().toLowerCase() === "unknown" ? "组别未确认" : group;
}

function caseDepthLabel(depth: CaseRecord["caseDepth"]) {
  if (depth === "listing_only") return "公告元数据卡";
  if (depth === "artifact_deep_dive") return "材料深读卡";
  return "证据深度未标注";
}

function sourceTierLabel(tier: string) {
  const labels: Record<string, string> = {
    national_organizer_notice: "全国主办方公告",
    official_university_notice: "高校官网公告",
    user_provided_artifact: "用户提供材料",
  };
  return labels[tier] ?? "来源层级未标注";
}

function verifiedFieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: "题名",
    institution: "学校",
    group: "组别",
    award: "奖项",
    edition: "届次",
    artifactClaimedEdition: "作品自述届次",
    awardStatus: "奖项陈述状态",
    artifactHashes: "文件指纹",
    abstractedPatterns: "抽象化结构",
    reuseSafetyLimits: "复用安全边界",
  };
  return labels[field] ?? field;
}

function GatePill({ gate }: { gate: GateRecord }) {
  const labels: Record<GateStatus, string> = {
    not_run: "未运行",
    running: "运行中",
    pass: "通过",
    warning: "警告",
    fail: "阻断",
    unknown: "未知",
    stale: "已失效",
  };
  const gateName = GATE_DEFINITIONS.find(([id]) => id === gate.id)?.[1] ?? gate.id;
  return (
    <div className={`gate-pill gate-${gate.status}`} title={`${gateName} Gate：${labels[gate.status]}`}>
      <span className="gate-dot" aria-hidden="true" />
      <span>{gateName}</span>
      <small>{labels[gate.status]}</small>
    </div>
  );
}

function CaseLibrary() {
  const theme = useWorkbenchTheme();
  const [query, setQuery] = useState("");
  const [edition, setEdition] = useState(DEFAULT_EDITION_OPTIONS[0]);
  const [group, setGroup] = useState(DEFAULT_GROUP_OPTIONS[0]);
  const [award, setAward] = useState(DEFAULT_AWARD_OPTIONS[0]);
  const [editionOptions, setEditionOptions] = useState(DEFAULT_EDITION_OPTIONS);
  const [groupOptions, setGroupOptions] = useState(DEFAULT_GROUP_OPTIONS);
  const [awardOptions, setAwardOptions] = useState(DEFAULT_AWARD_OPTIONS);
  const [source, setSource] = useState("全部来源");
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [libraryMeta, setLibraryMeta] = useState<CaseLibraryMeta | null>(null);
  const [libraryNotice, setLibraryNotice] = useState<CaseLibraryNotice | null>(null);
  const [selected, setSelected] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const caseTriggerRef = useRef<HTMLButtonElement>(null);
  const detailRequestRef = useRef(0);
  const isDrawerOpen = selected !== null;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (edition !== "全部届次") params.set("edition", edition);
      if (group !== "全部组别") params.set("group", group);
      if (award !== "全部奖项") params.set("award", award);
      if (source !== "全部来源") params.set("verification", source);
      try {
        const payload = await apiRequest(`/api/cases${params.size ? `?${params}` : ""}`, { signal: controller.signal });
        setCases(extractCollection(payload, ["cases", "items", "results"]).items.map(normalizeCase).filter((item): item is CaseRecord => item !== null));
        const nextEditions = readFacetValues(payload, "editions");
        const nextGroups = readFacetValues(payload, "groups");
        const nextAwards = readFacetValues(payload, "awards");
        if (nextEditions.length) setEditionOptions(["全部届次", ...nextEditions]);
        if (nextGroups.length) setGroupOptions(["全部组别", ...nextGroups]);
        if (nextAwards.length) setAwardOptions(["全部奖项", ...nextAwards]);
        if (isRecord(payload) && isRecord(payload.library)) {
          setLibraryMeta({
            total: readNumber(payload.library, ["total"]),
            officialVerified: readNumber(payload.library, ["officialVerified"]),
            userAttested: readNumber(payload.library, ["userAttested"]),
          });
        }
        if (isRecord(payload) && isRecord(payload.notice)) {
          setLibraryNotice({
            title: readString(payload.notice, ["title"], "案例库使用边界"),
            body: readString(payload.notice, ["body"], ""),
            coverage: readString(payload.notice, ["coverage"], ""),
            capturedAt: readString(payload.notice, ["capturedAt"], ""),
          });
        }
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setCases([]);
        setError(requestError instanceof Error ? requestError.message : "案例服务暂时不可用");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [award, edition, group, query, retryNonce, source]);

  async function openCase(item: CaseRecord) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelected(item);
    setDetailLoading(true);
    setDetailError("");
    try {
      const payload = await apiRequest(`/api/cases/${encodeURIComponent(item.id)}`);
      const detail = isRecord(payload) ? normalizeCase(payload.case ?? payload, 0) : null;
      if (detail && detailRequestRef.current === requestId) setSelected(detail);
    } catch (requestError) {
      if (detailRequestRef.current === requestId) {
        setDetailError(requestError instanceof Error ? requestError.message : "案例详情暂时不可用");
      }
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }

  function closeCase() {
    detailRequestRef.current += 1;
    setSelected(null);
    setDetailLoading(false);
    window.setTimeout(() => {
      const trigger = caseTriggerRef.current;
      if (trigger && !trigger.closest("[hidden]")) trigger.focus();
    }, 0);
  }

  function clearCaseFilters() {
    setQuery("");
    setEdition(DEFAULT_EDITION_OPTIONS[0]);
    setGroup(DEFAULT_GROUP_OPTIONS[0]);
    setAward(DEFAULT_AWARD_OPTIONS[0]);
    setSource("全部来源");
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCase();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute("hidden"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!isDrawerOpen) return;
    const leaveCasePanel = () => {
      if (window.location.hash === "#cases") return;
      detailRequestRef.current += 1;
      setSelected(null);
      setDetailLoading(false);
    };
    window.addEventListener("hashchange", leaveCasePanel);
    const backgroundRegions = [...document.querySelectorAll<HTMLElement>("[data-dialog-background]")];
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    backgroundRegions.forEach((region) => {
      region.inert = true;
      region.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("hashchange", leaveCasePanel);
      backgroundRegions.forEach((region) => {
        region.inert = false;
        region.removeAttribute("aria-hidden");
      });
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [isDrawerOpen]);

  return (
    <section className="section section-cases" id="cases" aria-labelledby="cases-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">获奖案例证据库</span>
          <h2 id="cases-title">只呈现证据，不补写故事</h2>
        </div>
        <p>检索已收录项目，区分公告元数据与材料深读；每张详情卡说明核验字段、来源层级和复用边界。</p>
      </div>

      {libraryMeta && libraryNotice && (
        <aside className="case-scope-note" aria-labelledby="case-scope-title">
          <div className="case-scope-main">
            <span className="case-scope-kicker">收录边界</span>
            <h3 id="case-scope-title">{libraryNotice.title}</h3>
            <p>{libraryNotice.coverage}</p>
            <details>
              <summary>查看核验口径</summary>
              <p>{libraryNotice.body}</p>
            </details>
          </div>
          <dl className="case-scope-stats">
            <div><dt>当前收录</dt><dd>{libraryMeta.total}</dd></div>
            <div><dt>公告已核验</dt><dd>{libraryMeta.officialVerified}</dd></div>
            <div><dt>用户陈述奖项</dt><dd>{libraryMeta.userAttested}</dd></div>
            <div><dt>证据快照</dt><dd>{libraryNotice.capturedAt || "未标注"}</dd></div>
          </dl>
        </aside>
      )}

      <div className="case-toolbar" role="search" aria-label="案例搜索与筛选">
        <label className="search-field">
          <span className="sr-only">搜索案例</span>
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题名、学校、届次或主题关键词" />
        </label>
        <label>
          <span className="sr-only">筛选届次</span>
          <select value={edition} onChange={(event) => setEdition(event.target.value)}>
            {editionOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">筛选组别</span>
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            {groupOptions.map((option) => <option key={option} value={option}>{caseGroupLabel(option)}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">筛选奖项</span>
          <select value={award} onChange={(event) => setAward(event.target.value)}>
            {awardOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <div className="case-source-options">
          <ChoiceGroup legend="来源状态" name="case-source" value={source} onChange={setSource} tone={theme} options={[
            { value: "全部来源", label: "全部来源" },
            { value: "official_verified", label: "官方来源已核验" },
            { value: "user_attested", label: "用户陈述奖项", description: "未独立核验" },
          ]} />
        </div>
      </div>

      {!loading && !error && <p className="case-result-count" aria-live="polite">当前显示 {cases.length} 条匹配记录</p>}

      {loading ? (
        <div className="loading-grid" aria-live="polite" aria-busy="true">
          <span className="sr-only">正在加载案例</span>
          {[0, 1, 2].map((item) => <div className="case-skeleton" key={item} />)}
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <span className="empty-mark">!</span>
          <h3>案例库暂时未连接</h3>
          <p>{error}。你仍可继续使用诊断和项目控制门户，稍后再试。</p>
          <button className="text-button" type="button" onClick={() => setRetryNonce((value) => value + 1)}>重新连接案例库</button>
        </div>
      ) : cases.length === 0 ? (
        <div className="empty-state" role="status">
          <span className="empty-mark">0</span>
          <h3>没有匹配案例</h3>
          <p>换一个关键词或放宽筛选条件。未核验案例不会被自动补造成结果。</p>
          <button className="text-button" type="button" onClick={clearCaseFilters}>清除全部筛选</button>
        </div>
      ) : (
        <div className="case-grid">
          {cases.map((item) => (
            <article className="case-card" key={item.id}>
              <div className="case-card-top">
                <VerificationBadge status={item.sourceStatus} />
                <span className="case-stage">{caseDepthLabel(item.caseDepth)} · {item.institution}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              {item.sourceStatus === "user_attested" && <p className="case-unknowns">具体奖次、组别、赛道与阶段未独立确认</p>}
              <dl className="case-meta">
                <div><dt>届次</dt><dd>{item.edition}</dd></div>
                <div><dt>组别</dt><dd>{caseGroupLabel(item.group)}</dd></div>
                <div><dt>奖项</dt><dd>{item.award}</dd></div>
              </dl>
              <button className="text-button" aria-label={`查看案例证据卡片：${item.title}`} onClick={(event) => { caseTriggerRef.current = event.currentTarget; void openCase(item); }}>查看证据卡片 <span aria-hidden="true">→</span></button>
            </article>
          ))}
        </div>
      )}

      {selected && typeof document !== "undefined" && createPortal(
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeCase()}>
          <aside className="case-drawer" role="dialog" aria-modal="true" aria-labelledby="case-drawer-title" onKeyDown={handleDrawerKeyDown}>
            <div className="drawer-head">
              <VerificationBadge status={selected.sourceStatus} />
              <button ref={closeButtonRef} className="icon-button" onClick={closeCase} aria-label="关闭案例详情">×</button>
            </div>
            <span className="eyebrow">{selected.edition} · {caseGroupLabel(selected.group)} · {selected.award}</span>
            <h3 id="case-drawer-title">{selected.title}</h3>
            <p className="drawer-context">{selected.institution} · {selected.region} · {selected.track}</p>
            <p className="drawer-depth">{caseDepthLabel(selected.caseDepth)} · {sourceTierLabel(selected.sourceTier)}</p>
            {selected.sourceStatus === "user_attested" && <p className="drawer-status error">具体奖次、组别、赛道与阶段尚未独立核验；下列结构化亮点来自材料分析，不代表评委意见或获奖原因。</p>}
            <p className="drawer-summary">{selected.summary}</p>
            {detailLoading && <p className="drawer-status" role="status">正在核对案例详情…</p>}
            {detailError && <div className="drawer-status error" role="alert"><p>{detailError}，当前展示列表中的已核验元数据。</p><button className="text-button" type="button" onClick={() => void openCase(selected)}>重新读取详情</button></div>}
            {selected.caseDepth === "listing_only" && <div className="drawer-block evidence-scope-block"><h4>本卡核验范围</h4><p>仅核验公开公告中的题名、学校、组别、奖项与届次。方法、样本、结论和评委意见未公开，不据题名补写。</p></div>}
            {selected.problem && <div className="drawer-block"><h4>决策问题</h4><p>{selected.problem}</p></div>}
            {selected.method && <div className="drawer-block"><h4>研究方法</h4><p>{selected.method}</p></div>}
            {selected.result && <div className="drawer-block"><h4>结果边界</h4><p>{selected.result}</p></div>}
            {selected.caseDepth === "listing_only" && selected.keywords.length > 0 && <div className="drawer-block"><h4>题名关键词</h4><ul className="keyword-list">{selected.keywords.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {selected.caseDepth === "artifact_deep_dive" && selected.takeaways.length > 0 && <div className="drawer-block"><h4>材料分析：可迁移结构（非获奖因果）</h4><ul>{selected.takeaways.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {selected.risks.length > 0 && <div className="drawer-block risk-block"><h4>限制与风险</h4><ul>{selected.risks.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {selected.sourceRefs.length > 0 && <div className="drawer-block source-ledger"><h4>证据来源与核验字段</h4>{selected.sourceRefs.map((sourceRef, index) => <article className="source-card" key={`${sourceRef.label}-${index}`}><div><strong>{sourceRef.label}</strong><span>{sourceTierLabel(sourceRef.sourceTier)}</span></div><p>已登记：{sourceRef.verifiedFields.length > 0 ? sourceRef.verifiedFields.map(verifiedFieldLabel).join("、") : "核验字段未标注"}</p>{sourceRef.url.startsWith("http") ? <a className="source-link" href={sourceRef.url} target="_blank" rel="noreferrer">打开公开来源（新窗口） <span aria-hidden="true">↗</span></a> : sourceRef.repositoryPath ? <span className="source-local">站内来源登记已绑定</span> : null}</article>)}</div>}
            {selected.sourceRefs.length === 0 && selected.sourceUrl.startsWith("http") && <a className="source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">打开来源记录（新窗口） <span aria-hidden="true">↗</span></a>}
          </aside>
        </div>
      , document.body)}
    </section>
  );
}

export function DiagnosisPanel({onBriefSource}:{onBriefSource?:(source:DiagnosisBriefSource|null)=>void}={}) {
  const theme = useWorkbenchTheme();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [resultSource,setResultSource]=useState<DiagnosisBriefSource|null>(null);
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
        <div><span className="eyebrow">Agent 诊断</span><h2 id="diagnose-title">先暴露证据缺口，再安排最短修复路径</h2></div>
        <p>输入当前真实状态。缺失就写未知，诊断不会用复杂术语掩盖资料不足。</p>
      </div>
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
          <p className="form-note">仅按自报信息进行启发式检查，未读取报告或核验田野证据；不是质量评分或获奖概率。不写入 Gate、不推进项目状态。请勿提交受访者个人信息或未授权企业机密。</p>
        </form>
        <div className="diagnosis-result" aria-live="polite" aria-busy={submitting}>
          {submitting && <div className="result-placeholder" role="status"><span className="evidence-orbit" aria-hidden="true">…</span><h3>正在检查自报信息</h3><p>按固定规则提示缺口，不代表证据审查。</p></div>}
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
        <p>按届次、组别、赛区、赛道与阶段核对本地哈希锁定的来源快照。没有匹配就返回未知并阻断，不会拿旧规则补位。</p>
      </div>

      <aside className="rule-scope-banner" aria-label="规则快照使用边界">
        <div><strong>当前证据快照</strong><span>{RULE_CORPUS_META.snapshot.edition} · {RULE_CORPUS_META.snapshot.group} · 核验于 {RULE_CORPUS_META.snapshot.verified_at}</span></div>
        <p>这是独立工具保存的历史核验快照，不代表赛事官方实时通知。正式提交前必须重新核对适用于当前项目的原始通知及补充文件。</p>
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
          <p>可修改任一维度验证边界；不匹配结果不会回退到相近届次或组别。</p>
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

function ProjectWorkbench() {
  const [clientKey, setClientKey] = useState("");
  const [clientKeyVisible, setClientKeyVisible] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [operation, setOperation] = useState<"load" | "create" | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = projects.find((item) => item.id === selectedId) ?? projects[0] ?? null;
  const selectedStageIndex = selected
    ? PROJECT_STAGES.indexOf(selected.controlStatus)
    : -1;
  const nextTransition = selected
    ? ALLOWED_TRANSITIONS.find((item) => item.from === selected.controlStatus)
    : undefined;
  const passCount = selected?.gates.filter((gate) => gate.status === "pass").length ?? 0;
  const warningCount = selected?.gates.filter((gate) => gate.status === "warning").length ?? 0;
  const blockingCount = selected ? selected.gates.length - passCount - warningCount : 0;

  const ingestProjects = useCallback((payload: unknown) => {
    const collection = extractCollection(payload, ["projects", "items", "results"]);
    if (collection.found) return collection.items.map(normalizeProject).filter((item): item is ProjectRecord => item !== null);
    if (isRecord(payload)) {
      const candidate = payload.project ?? (isRecord(payload.data) ? payload.data.project : undefined);
      const normalized = normalizeProject(candidate, 0);
      return normalized ? [normalized] : [];
    }
    return [];
  }, []);

  function changeClientKey(value: string) {
    setClientKey(value);
    setKeyFeedback("");
    setProjects([]);
    setSelectedId("");
    setHasLoaded(false);
    setMessage("");
    setError("");
  }

  function generateClientKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const nextKey = `evx_${token}`;
    changeClientKey(nextKey);
    setClientKeyVisible(true);
    setKeyFeedback("已生成新的匿名访问密钥，请复制并安全保存。");
  }

  async function copyClientKey() {
    if (!clientKey) return;
    try {
      await navigator.clipboard.writeText(clientKey);
      setKeyFeedback("访问密钥已复制，请保存到可信的密码管理工具中。");
    } catch {
      setClientKeyVisible(true);
      setKeyFeedback("浏览器未允许自动复制，密钥已显示，请手动复制并安全保存。");
    }
  }

  async function loadProjects(event?: FormEvent) {
    event?.preventDefault();
    setOperation("load"); setError(""); setMessage("");
    try {
      const key = clientKey.trim();
      const payload = await apiRequest("/api/projects", {
        headers: key ? { "x-client-key": key } : {},
      });
      const next = ingestProjects(payload);
      setProjects(next);
      setSelectedId(next[0]?.id ?? "");
      setHasLoaded(true);
      setMessage(next.length ? `已读取 ${next.length} 个登记项` : "当前工作区暂无登记项，可在下方创建。");
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "项目服务暂时不可用";
      setError(projects.length ? `${detail}；当前仍展示上次成功读取的结果` : detail);
    } finally { setOperation(null); }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!projectTitle.trim()) return;
    setOperation("create"); setError(""); setMessage("");
    try {
      const payload = await apiRequest("/api/projects", {
        method: "POST",
        headers: clientKey.trim() ? { "x-client-key": clientKey.trim() } : {},
        body: JSON.stringify({ title: projectTitle.trim() }),
      });
      const created = ingestProjects(payload);
      if (created.length) {
        setProjects((current) => [...created, ...current.filter((item) => !created.some((newItem) => newItem.id === item.id))]);
        setSelectedId(created[0].id);
      } else {
        throw new Error("项目已提交，但服务没有返回可识别的登记项，请重新读取");
      }
      setProjectTitle("");
      setMessage("登记项已创建，固定从“项目接入”开始，九道质量门禁均为“未运行”；这不代表已由本地证据控制程序正式初始化。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "登记项创建失败");
    } finally { setOperation(null); }
  }

  return (
    <section className="section section-workspace" id="workspace" aria-labelledby="workspace-title">
      <div className="section-heading">
        <div><span className="eyebrow">项目控制门户</span><h2 id="workspace-title">读取项目登记态，控制执行保持关闭</h2></div>
        <p>门户只登记和读取状态；质量门禁判定、阶段推进与最终交接必须由受信任的本地证据控制程序（agentctl）执行。</p>
      </div>
      <div className="workspace-shell">
        <aside className="project-sidebar">
          <div className="mvp-notice"><strong>工作区隔离说明</strong><p>登录态按账户隔离；匿名访问密钥仅在本页会话持有，请自行安全保存。禁止填写原始问卷、个人信息、敏感数据或未授权商业资料。</p></div>
          <form onSubmit={loadProjects} className="client-key-form">
            <label><span>匿名访问密钥 <small>登录用户可留空</small></span><input type={clientKeyVisible ? "text" : "password"} minLength={47} maxLength={48} pattern="(?:evx_[A-Za-z0-9_\-]{43}|[0-9A-Fa-f]{48})" value={clientKey} onChange={(event) => changeClientKey(event.target.value)} placeholder="使用本页生成的高强度密钥" autoComplete="off" spellCheck={false} aria-describedby="client-key-help client-key-status" /></label>
            <div className="key-actions">
              <button className="key-generator" type="button" onClick={generateClientKey}>生成新密钥</button>
              <button className="key-generator" type="button" disabled={!clientKey} onClick={() => setClientKeyVisible((current) => !current)}>{clientKeyVisible ? "隐藏密钥" : "显示密钥"}</button>
              <button className="key-generator" type="button" disabled={!clientKey} onClick={() => void copyClientKey()}>复制密钥</button>
            </div>
            <p id="client-key-help" className="key-help">密钥不写入浏览器存储；请求时仅通过请求头传输，服务端只保存不可逆摘要。生成后请立即安全保存。</p>
            <p id="client-key-status" className="key-status" role="status">{keyFeedback}</p>
            <button className="secondary-button" disabled={operation !== null}>{operation === "load" ? "正在读取…" : "读取登记项"}</button>
          </form>
          <div className="project-list" aria-label="项目登记项列表">
            {projects.map((project) => <button key={project.id} aria-pressed={project.id === selected?.id} className={project.id === selected?.id ? "project-list-item active" : "project-list-item"} onClick={() => setSelectedId(project.id)}><span>{project.title}</span><small>{STAGE_LABELS[project.controlStatus]}</small></button>)}
            {!projects.length && <p className="sidebar-empty">读取后在这里选择登记项。</p>}
          </div>
          <form className="new-project-form" onSubmit={createProject}>
            <label><span>新登记项</span><input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder="输入项目名称" /></label>
            <button className="text-button" disabled={operation !== null || !projectTitle.trim()}>{operation === "create" ? "正在创建…" : "＋ 创建登记项"}</button>
          </form>
        </aside>
        <div className="project-main">
          {error && <div className="inline-alert" role="alert"><strong>服务暂时不可用</strong><span>{error}。访问密钥和输入内容仍保留。</span></div>}
          {message && !error && <div className="inline-message" role="status">{message}</div>}
          {!selected ? <div className="workspace-empty"><span className="empty-mark">Q</span><h3>{hasLoaded ? "当前暂无登记项" : "先读取一个登记项"}</h3><p>{hasLoaded ? "使用左侧表单创建第一个登记项；它只会进入项目接入状态。" : "输入匿名访问密钥读取已有登记项，或在登录态下直接读取账户项目。"}</p></div> : <>
            <div className="project-head">
              <div><span className="eyebrow">{AUTHORITY_LABELS[selected.authority]}</span><h3>{selected.title}</h3><p>赛事阶段：{selected.competitionStage === "unknown" ? "未确认" : selected.competitionStage} · 状态修订 r{selected.statusRevision}</p></div>
              <span className={`project-status integrity-${selected.integrity}`}>{INTEGRITY_LABELS[selected.integrity]}</span>
            </div>
            {selected.legacyControlStatus && <div className="inline-alert legacy-alert" role="status"><strong>历史记录待复核</strong><span>旧控制值 {selected.legacyControlStatus} 已保留作审计，但未映射为当前阶段。</span></div>}
            <div className="stage-progress" aria-label={`当前控制状态：${STAGE_LABELS[selected.controlStatus]}`}>
              <div className="stage-track"><i style={{ width: `${((selectedStageIndex + 1) / PROJECT_STAGES.length) * 100}%` }} /></div>
              <div className="stage-copy"><span>当前控制状态</span><strong>{STAGE_LABELS[selected.controlStatus]}</strong><small>12 阶段中的第 {selectedStageIndex + 1} 阶段</small></div>
            </div>
            <div className="contract-strip" aria-label="控制契约版本">
              <span>workflow v{selected.contract.workflowVersion} · {selected.contract.workflowSha256.slice(0, 8)}</span>
              <span>gates v{selected.contract.gatesVersion} · {selected.contract.gatesSha256.slice(0, 8)}</span>
            </div>
            <div className="workspace-block">
              <div className="block-heading"><div><span className="mini-label">质量门禁</span><h4>9 道质量门禁（Gate）当前状态</h4></div><span className="gate-summary">通过 {passCount} · 警告 {warningCount} · 阻断或未就绪 {blockingCount}</span></div>
              <div className="gate-grid">{selected.gates.map((gate) => <GatePill gate={gate} key={gate.id} />)}</div>
            </div>
            <div className="workspace-block control-lock-card">
              <div className="block-heading"><div><span className="mini-label">可信执行边界</span><h4>控制执行器未连接</h4></div><span className="control-lock-status">默认拒绝</span></div>
              <p>当前门户不能评估质量门禁、推进控制状态或签发最终交接（handoff）。浏览器输入不会被当成本地证据控制程序的有效证据。</p>
              {nextTransition ? <div className="next-transition">
                <span><small>下一合法状态</small><strong>{STAGE_LABELS[nextTransition.to]}</strong></span>
                <span><small>所需 Gate</small><strong>{nextTransition.requiredGates.length ? nextTransition.requiredGates.map((gate) => GATE_LABELS[gate]).join("、") : "无"}</strong></span>
                <span><small>所需产物</small><strong>{nextTransition.requiredArtifacts.join("、")}</strong></span>
              </div> : <p className="closed-state-note">该状态没有下一相邻转换；正式封存仍以本地证据控制程序给出的通过/不通过（Go/No-Go）结果为准。</p>}
              <a className="primary-button" href="#lifecycle">读取本机权威状态</a>
            </div>
          </>}
        </div>
      </div>
      <LifecycleWarRoom portalProject={selected} />
    </section>
  );
}

export default function EviXPlatform() {
  const [designSnapshot,setDesignSnapshot]=useState<DesignSnapshot|null>(null);
  const [designTransfer,setDesignTransfer]=useState<DesignTransfer|null>(null);
  const [briefSource,setBriefSource]=useState<DiagnosisBriefSource|null>(null);
  const [agentProposal,setAgentProposal]=useState<AgentQuestionnaireProposal|null>(null);
  return (
    <WorkbenchShell panels={{
      overview: <>
      <section className="hero" id="overview" aria-labelledby="hero-title">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy">
            <span className="hero-kicker"><i /> 正大杯全流程循证竞赛智能体</span>
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
        <div className="independent-notice"><span>独立 · 非官方</span><p>证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。</p></div>
      </section>

      <section className="section qdia-section" aria-labelledby="qdia-title">
        <div className="section-heading"><div><span className="eyebrow">Q–D–I–A 方法链</span><h2 id="qdia-title">不是写作捷径，是证据生产系统</h2></div><p>每一阶段都回答一个可验证问题；上游证据变化时，相关 Gate 必须在受信任控制面中重新评估。</p></div>
        <div className="qdia-cards">{QDIA.map((item, index) => <article key={item.code}><span className="step-number">0{index + 1}</span><div className="step-code">{item.code}</div><h3>{item.name} <small>{item.english}</small></h3><p>{item.detail}</p><span className="step-check">{["决策主体 · 目标人群 · 证据缺口", "来源 · 样本 · 清洗 · 台账", "方法适配 · 结果 · 限制", "负责人 · 优先级 · KPI"][index]}</span></article>)}</div>
      </section>

      <section className="closing-cta"><div><span className="eyebrow">从真实状态开始</span><h2>把下一步，变成可验证的行动。</h2><p>先诊断，再进入工作台。未知不会被包装成完成，风险不会被一句“基本没问题”带过。</p></div><a className="primary-button gold-button" href="#diagnose">开始项目诊断</a></section>

      </>,
      cases: <CaseLibrary />,
      editor: <EditingStudio localOnly />,
      defense: <DefenseStudio />,
      analysis: <SurveyLab designSnapshot={designSnapshot} designTransfer={designTransfer}/>,
      design: <QuestionnaireStudio localOnly agentProposal={agentProposal} onAgentHandled={()=>setAgentProposal(null)} briefSource={briefSource} onBriefHandled={()=>setBriefSource(null)} onSnapshot={setDesignSnapshot} onAnalyze={snapshot=>{setDesignSnapshot(snapshot);setDesignTransfer({id:crypto.randomUUID(),snapshot});}} />,
      diagnose: <DiagnosisPanel onBriefSource={setBriefSource} />,
      workspace: <section className="section"><h2>项目已接入邮箱账号</h2><p>使用我的项目创建团队研究，生成、编辑并保存问卷版本。原有生命周期控制程序和证据文件继续保留。</p><Link className="primary-button" href="/projects">打开我的项目</Link><details id="lifecycle"><summary>本地生命周期工具</summary><LifecycleWarRoom portalProject={null}/></details></section>,
      rules: <RuleWorkbench />,
      services: <><p className="hosted-notice"><Link href="/services">打开个人模型服务页面 →</Link></p><HostedServices/></>,
    }} />
  );
}
