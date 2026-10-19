import {
  ALLOWED_TRANSITIONS,
  PROJECT_STAGES,
  type GateName,
  type ProjectStage,
} from "@/data/control-plane-contract.generated";

export const EVIDENCE_STATUSES = [
  "none",
  "proposed",
  "partial",
  "verified",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export type DiagnosisInput = {
  title: string;
  problem: string;
  decisionOwner: string;
  population: string;
  geography: string;
  stage: ProjectStage;
  evidenceStatus: EvidenceStatus;
};

export type DiagnosisRisk = {
  code: string;
  severity: "high" | "medium" | "low";
  message: string;
};

export type DiagnosisResult = {
  readiness: number;
  metric: "project_readiness_not_award_probability";
  scores: Record<"Q" | "D" | "I" | "A", number>;
  dimensions: Record<"Q" | "D" | "I" | "A", string>;
  risks: DiagnosisRisk[];
  nextSteps: Array<{ code: string; action: string }>;
  transitionPlan: {
    currentStage: ProjectStage;
    nextStage: ProjectStage | null;
    requiredGates: GateName[];
    requiredArtifacts: string[];
    authority: "canonical_contract_read_only";
    note: string;
  };
  disclaimer: string;
};

const ACTION_TERMS = [
  "决策",
  "选择",
  "优化",
  "改进",
  "配置",
  "投入",
  "定位",
  "提升",
  "降低",
  "制定",
  "取舍",
];

export function diagnoseProject(input: DiagnosisInput): DiagnosisResult {
  const stageIndex = PROJECT_STAGES.indexOf(input.stage);
  const evidencePoints = {
    none: 0,
    proposed: 3,
    partial: 7,
    verified: 10,
  }[input.evidenceStatus];

  const q = clamp25(
    (input.title.length >= 8 ? 5 : 3) +
      (input.problem.length >= 80 ? 8 : input.problem.length >= 40 ? 6 : 3) +
      (isGenericOwner(input.decisionOwner) ? 2 : 5) +
      (input.population.length >= 8 ? 4 : 2) +
      (input.geography.length >= 2 ? 3 : 1),
  );
  const d = clamp25(
    (input.population.length >= 8 ? 5 : 3) +
      (input.geography.length >= 2 ? 4 : 2) +
      (stageIndex >= 3 ? 6 : stageIndex >= 2 ? 4 : 2) +
      evidencePoints,
  );
  const i = clamp25(
    (input.problem.length >= 80 ? 8 : input.problem.length >= 40 ? 6 : 3) +
      evidencePoints +
      (stageIndex >= 6 ? 5 : stageIndex >= 5 ? 4 : stageIndex >= 3 ? 2 : 0) +
      (input.population.length >= 8 ? 2 : 1),
  );
  const a = clamp25(
    (isGenericOwner(input.decisionOwner) ? 2 : 6) +
      (ACTION_TERMS.some((term) => input.problem.includes(term)) ? 5 : 2) +
      (input.geography.length >= 2 ? 3 : 1) +
      (stageIndex >= 7 ? 5 : stageIndex >= 6 ? 4 : stageIndex >= 3 ? 2 : 0) +
      Math.min(6, Math.round(evidencePoints * 0.6)),
  );

  const risks = buildRisks(input, stageIndex);
  const nextSteps = buildNextSteps(risks);
  const nextTransition = ALLOWED_TRANSITIONS.find((transition) => transition.from === input.stage);

  return {
    readiness: q + d + i + a,
    metric: "project_readiness_not_award_probability",
    scores: { Q: q, D: d, I: i, A: a },
    dimensions: {
      Q: "Question：问题是否具体、边界是否清楚",
      D: "Design：研究设计与证据准备是否匹配",
      I: "Insight：是否具备形成可信洞察的条件",
      A: "Action：结论能否服务明确决策与行动",
    },
    risks,
    nextSteps,
    transitionPlan: {
      currentStage: input.stage,
      nextStage: nextTransition?.to ?? null,
      requiredGates: nextTransition ? [...nextTransition.requiredGates] : [],
      requiredArtifacts: nextTransition ? [...nextTransition.requiredArtifacts] : [],
      authority: "canonical_contract_read_only",
      note: "只读材料清单；Gate 与阶段状态以本机控制程序为准。",
    },
    disclaimer:
      "分数依据自报阶段、证据成熟度、文字长度与关键词提示准备度；内容、来源、田野与数据未核验，不代表获奖概率、质量认证或 Gate 结论。",
  };
}

function buildRisks(
  input: DiagnosisInput,
  stageIndex: number,
): DiagnosisRisk[] {
  const risks: DiagnosisRisk[] = [];
  if (input.problem.length < 40) {
    risks.push({
      code: "problem_underdefined",
      severity: "high",
      message: "问题陈述过短，尚未明确需要支持的核心取舍。",
    });
  }
  if (isGenericOwner(input.decisionOwner)) {
    risks.push({
      code: "decision_owner_unclear",
      severity: "high",
      message: "决策主体过于宽泛，建议明确到组织或职能角色。",
    });
  }
  if (input.population.length < 8) {
    risks.push({
      code: "population_too_broad",
      severity: "medium",
      message: "目标人群边界不足，抽样框与外推范围可能不清楚。",
    });
  }
  if (input.geography.length < 2) {
    risks.push({
      code: "geography_unbounded",
      severity: "medium",
      message: "地理范围尚未形成可执行的调研边界。",
    });
  }
  if (input.evidenceStatus === "none") {
    risks.push({
      code: "evidence_missing",
      severity: "high",
      message: "当前没有可核验的证据，任何结论都只能标记为拟议。",
    });
  } else if (input.evidenceStatus !== "verified") {
    risks.push({
      code: "evidence_not_verified",
      severity: "medium",
      message: "证据尚未完成来源、口径和版本核验。",
    });
  }
  if (stageIndex >= 5 && ["none", "proposed"].includes(input.evidenceStatus)) {
    risks.push({
      code: "stage_evidence_mismatch",
      severity: "high",
      message: "工作流阶段领先于证据成熟度，后续分析存在失真风险。",
    });
  }
  if (stageIndex < 2) {
    risks.push({
      code: "rule_or_problem_gate_open",
      severity: "medium",
      message: "版本、组别、赛段或真实决策问题仍需锁定。",
    });
  }
  risks.push({
    code: "method_fit_unassessed",
    severity: "low",
    message: "本次快速诊断未审查抽样、问卷与模型适配性。",
  });
  return risks;
}

function buildNextSteps(risks: DiagnosisRisk[]) {
  const actions: Record<string, string> = {
    problem_underdefined:
      "把问题改写为“谁在什么期限内，依据哪些证据，在什么选项间作出何种取舍”。",
    decision_owner_unclear: "确认真实委托方或决策职能，并记录其待决策事项。",
    population_too_broad: "定义纳入/排除标准、目标总体和可获得的抽样框。",
    geography_unbounded: "锁定研究城市、区县或场景，并说明外推边界。",
    evidence_missing: "先完成探索访谈、二手资料核验和小规模预调查，不编造数据。",
    evidence_not_verified: "建立证据台账，核验来源、样本口径、计算和输出位置。",
    stage_evidence_mismatch: "暂停推进结论，退回补齐当前阶段所需证据与 Gate。",
    rule_or_problem_gate_open: "核对届次、组别、地区、赛道与当前赛段的官方规则。",
    method_fit_unassessed: "进入设计阶段后审查抽样、问卷、变量和分析方法的一致性。",
  };
  const priority = { high: 0, medium: 1, low: 2 };
  return [...risks].sort((left, right) => priority[left.severity] - priority[right.severity]).slice(0, 5).map((risk) => ({
    code: risk.code,
    action: actions[risk.code],
  }));
}

function isGenericOwner(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  return (
    normalized.length < 3 ||
    ["政府", "企业", "学校", "社会", "相关部门", "主办方"].includes(
      normalized,
    )
  );
}

function clamp25(value: number) {
  return Math.max(0, Math.min(25, Math.round(value)));
}
