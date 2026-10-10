"use client";

import {
  useId,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  CONTROL_CONTRACT_META,
  GATE_NAMES,
  GATE_VALUES,
  PROJECT_STAGES,
  type GateName,
  type GateValue,
  type ProjectStage,
} from "@/data/control-plane-contract.generated";
import {
  isLifecycleSnapshotExpired,
  LIFECYCLE_SNAPSHOT_MAX_AGE_MS,
  selectLifecyclePresentation,
} from "@/lib/lifecycle-interpretation";

export const LOCAL_AGENTCTL_BRIDGE_ORIGIN = "http://127.0.0.1:8765" as const;
export const LIFECYCLE_BRIDGE_SCHEMA_VERSION = "1.0.0" as const;

type Severity = "fatal" | "high" | "medium" | "low" | "info";
type UnknownRecord = Record<string, unknown>;

export type LifecycleGate = Readonly<{
  id: GateName;
  status: GateValue;
}>;

export type LifecyclePortalProject = Readonly<{
  id: string;
  title: string;
  controlStatus: ProjectStage;
  competitionStage: string;
  statusRevision: number;
  gates: ReadonlyArray<LifecycleGate>;
  integrity: "current" | "stale" | "contract_mismatch" | "needs_revalidation";
  updatedAt: string;
}>;

export type LifecycleProjectChoice = Readonly<{
  alias: string;
  projectId: string;
  title: string;
}>;

export type LifecycleMaterial = Readonly<{
  code: string;
  label: string;
}>;

export type LifecycleTransition = Readonly<{
  id?: string;
  from: string;
  to: string;
  requiredGates: ReadonlyArray<string>;
  requiredArtifacts: ReadonlyArray<string>;
}>;

export type LifecycleSnapshot = Readonly<{
  schemaVersion: string;
  authority: "agentctl_read_only";
  readOnly: true;
  projectAlias: string;
  projectId: string;
  observedAt: string;
  consistent: boolean;
  contract: Readonly<{
    workflowVersion: string;
    workflowSha256: string;
    gatesVersion: string;
    gatesSha256: string;
  }>;
  status: Readonly<{
    controlStatus: string;
    competitionStage: string;
    statusRevision: number;
    gates: ReadonlyArray<LifecycleGate>;
    blockingGates: ReadonlyArray<string>;
    nextTransition: LifecycleTransition | null;
    materialsNeeded: ReadonlyArray<LifecycleMaterial>;
    safeParallelWork: ReadonlyArray<string>;
    blockerSummary: Readonly<{
      total: number;
      bySeverity: Readonly<Record<Severity, number>>;
    }>;
    riskSummary: Readonly<{
      total: number;
      bySeverity: Readonly<Record<Severity, number>>;
    }>;
    inventorySummary: Readonly<{ total: number }>;
  }>;
  nextAction: Readonly<{
    action: string;
    gate?: string;
    to?: string;
    definitionOfDone: string;
  }>;
  doctor: Readonly<{
    healthy: boolean;
    exitCode: number;
    checks: ReadonlyArray<Readonly<{ name: string; passed: boolean }>>;
    failedChecks: ReadonlyArray<string>;
  }>;
  redactions: ReadonlyArray<string>;
}>;

export type LifecycleWarRoomProps = Readonly<{
  portalProject: LifecyclePortalProject | null;
}>;

const SAFE_ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const MAX_RESPONSE_CHARACTERS = 512_000;
const PROJECT_LIST_TIMEOUT_MS = 8_000;
// The bridge enforces a 75s total wall clock. Keep a response-delivery margin.
const SNAPSHOT_TIMEOUT_MS = 90_000;

const STAGE_LABELS: Record<ProjectStage, string> = {
  intake: "项目接入",
  rule_lock: "规则锁定",
  problem_framing: "问题定义",
  exploratory_research: "探索研究",
  survey_design: "调研设计",
  fieldwork: "田野执行",
  data_analysis: "数据分析",
  insight_action: "洞察行动",
  report_visual: "报告与视觉",
  defense: "答辩准备",
  submission_ready: "提交就绪",
  closed: "已封存",
};

const GATE_LABELS: Record<GateName, string> = {
  rule: "规则",
  problem: "问题",
  design: "设计",
  fieldwork: "田野",
  data: "数据",
  inference: "推断",
  action: "行动",
  visual: "视觉",
  submission: "提交",
};

const GATE_STATUS_LABELS: Record<GateValue, string> = {
  not_run: "未运行",
  running: "检查中",
  pass: "通过",
  warning: "有条件通过",
  fail: "未通过",
  unknown: "证据未知",
  stale: "结果失效",
};

const INTEGRITY_LABELS: Record<LifecyclePortalProject["integrity"], string> = {
  current: "登记记录当前",
  stale: "登记记录已失效",
  contract_mismatch: "登记契约不一致",
  needs_revalidation: "登记记录待复验",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  fatal: "致命",
  high: "高",
  medium: "中",
  low: "低",
  info: "提示/未分级",
};

const DOCTOR_LABELS: Record<string, string> = {
  contracts: "控制规则文件",
  dependency_pyyaml: "项目配置读取能力",
  dependency_jsonschema: "结构校验能力",
  project_schema: "项目配置结构",
  state_schema: "权威状态结构",
  project_id_match: "项目身份一致性",
  status_mirror: "登记镜像一致性",
  recovery_state: "恢复状态",
  runtime_config: "本地运行配置",
  active_writer_lock: "并发写入锁",
  stale_lock_audit_trail: "历史锁记录",
  event_chain: "事件链完整性",
  latest_checkpoint: "最近恢复检查点",
  gate_result_files: "质量检查结果文件",
  gate_fingerprints: "质量检查输入指纹",
  closed_manifest: "封存交接清单",
};

const REDACTION_LABELS: Record<string, string> = {
  project_absolute_path: "本机绝对路径",
  run_and_event_identifiers: "运行与事件标识",
  raw_command_text: "可执行命令文本",
  blocker_and_risk_text: "阻塞项与风险原文",
  artifact_paths_and_hashes: "材料路径与文件指纹",
  doctor_internal_details: "内部体检细节",
};

const ARTIFACT_LABELS: Record<string, string> = {
  "project.yaml": "项目主配置",
  "agent-state.json": "权威状态快照",
  "evidence/rules.json": "适用规则证据",
  "project-brief.md": "项目任务简报",
  "evidence/decision-log.md": "关键决策记录",
  "research/research-design.md": "研究设计",
  "research/instruments": "调研工具",
  "data/raw": "原始数据",
  "evidence/evidence-ledger.csv": "证据台账",
  "data/processed": "处理后数据",
  "analysis/code": "分析代码",
  "analysis/outputs": "分析结果",
  "deliverables/report": "报告成果",
  "deliverables/ppt": "答辩演示文稿",
  "evidence/visual-asset-ledger.csv": "视觉素材台账",
  "evidence/visual-preflight-checklist.csv": "视觉预检清单",
  "deliverables/defense": "答辩材料",
  "evidence/preflight-checklist.csv": "提交预检清单",
  "reviews/final-manifest.json": "最终交接清单",
};

const pageStyles = {
  shell: {
    display: "grid",
    gap: 20,
    padding: "clamp(22px, 4vw, 42px)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-lg)",
    background: "var(--white)",
    boxShadow: "var(--shadow)",
  },
  heading: {
    display: "grid",
    gap: 8,
    maxWidth: 880,
  },
  eyebrow: {
    color: "var(--teal-deep)",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.14em",
  },
  title: {
    margin: 0,
    fontSize: "clamp(27px, 4vw, 42px)",
    lineHeight: 1.18,
    letterSpacing: "-0.035em",
  },
  description: {
    margin: 0,
    color: "var(--slate)",
    fontSize: 15,
    lineHeight: 1.8,
  },
  boundary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
    padding: 16,
    border: "1px solid rgba(184, 121, 14, 0.24)",
    borderRadius: 14,
    background: "rgba(244, 185, 66, 0.07)",
  },
  connection: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
    padding: 18,
    border: "1px solid var(--line)",
    borderRadius: 16,
    background: "var(--paper)",
  },
  field: {
    display: "grid",
    gap: 7,
    alignContent: "start",
  },
  label: {
    fontSize: 14,
    fontWeight: 800,
  },
  input: {
    width: "100%",
    minHeight: 46,
    padding: "10px 12px",
    border: "1px solid var(--line)",
    borderRadius: 10,
    color: "var(--ink)",
    background: "var(--white)",
    fontSize: 15,
  },
  helper: {
    margin: 0,
    color: "var(--slate)",
    fontSize: 13,
    lineHeight: 1.55,
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 9,
    alignItems: "end",
  },
  primaryButton: {
    minHeight: 46,
    padding: "0 18px",
    border: "1px solid var(--ink)",
    borderRadius: 10,
    color: "var(--paper)",
    background: "var(--ink)",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 46,
    padding: "0 18px",
    border: "1px solid rgba(0, 121, 111, 0.3)",
    borderRadius: 10,
    color: "var(--teal-deep)",
    background: "rgba(0, 179, 164, 0.08)",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
    gap: 16,
    alignItems: "start",
  },
  card: {
    minWidth: 0,
    display: "grid",
    gap: 16,
    padding: 20,
    border: "1px solid var(--line)",
    borderRadius: 18,
    background: "var(--paper)",
  },
  localCard: {
    minWidth: 0,
    display: "grid",
    gap: 16,
    padding: 20,
    border: "1px solid rgba(0, 121, 111, 0.24)",
    borderRadius: 18,
    background: "rgba(0, 179, 164, 0.045)",
  },
  cardHead: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  cardTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.35,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "4px 9px",
    border: "1px solid rgba(83, 102, 119, 0.24)",
    borderRadius: 999,
    color: "var(--slate)",
    background: "var(--white)",
    fontSize: 12,
    fontWeight: 800,
  },
  staleBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "4px 9px",
    border: "1px solid rgba(184, 50, 57, 0.24)",
    borderRadius: 999,
    color: "var(--risk)",
    background: "rgba(184, 50, 57, 0.07)",
    fontSize: 12,
    fontWeight: 800,
  },
  facts: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 8,
    margin: 0,
  },
  fact: {
    minWidth: 0,
    padding: 11,
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "var(--white)",
  },
  term: {
    color: "var(--slate)",
    fontSize: 12,
  },
  definition: {
    overflowWrap: "anywhere",
    margin: "4px 0 0",
    color: "var(--ink)",
    fontSize: 14,
    fontWeight: 800,
  },
  subheading: {
    margin: 0,
    fontSize: 15,
  },
  gateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
    gap: 7,
  },
  gate: {
    minWidth: 0,
    padding: 10,
    border: "1px solid var(--line)",
    borderRadius: 9,
    background: "var(--white)",
  },
  notice: {
    margin: 0,
    padding: "11px 13px",
    border: "1px solid rgba(0, 121, 111, 0.2)",
    borderRadius: 10,
    color: "var(--teal-deep)",
    background: "rgba(0, 179, 164, 0.06)",
    fontSize: 14,
    lineHeight: 1.65,
  },
  warning: {
    margin: 0,
    padding: "11px 13px",
    border: "1px solid rgba(184, 121, 14, 0.24)",
    borderRadius: 10,
    color: "var(--gold-deep)",
    background: "rgba(244, 185, 66, 0.08)",
    fontSize: 14,
    lineHeight: 1.65,
  },
  error: {
    margin: 0,
    padding: "11px 13px",
    border: "1px solid rgba(184, 50, 57, 0.22)",
    borderRadius: 10,
    color: "var(--risk)",
    background: "rgba(184, 50, 57, 0.07)",
    fontSize: 14,
    lineHeight: 1.65,
  },
  list: {
    display: "grid",
    gap: 7,
    margin: 0,
    paddingLeft: 20,
    color: "var(--slate)",
    fontSize: 14,
  },
  mono: {
    overflowWrap: "anywhere",
    fontFamily: "var(--font-geist-mono), Consolas, monospace",
    fontSize: 12,
  },
  divider: {
    height: 1,
    border: 0,
    background: "var(--line)",
  },
} satisfies Record<string, CSSProperties>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`桥接响应缺少 ${field}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`桥接响应中的 ${field} 无效`);
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`桥接响应中的 ${field} 无效`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`桥接响应中的 ${field} 无效`);
  return value.map((item, index) => nonEmptyString(item, `${field}[${index}]`));
}

function gateNameArray(value: unknown, field: string): GateName[] {
  const items = stringArray(value, field);
  if (new Set(items).size !== items.length
    || items.some((item) => !(GATE_NAMES as readonly string[]).includes(item))) {
    throw new Error(`桥接响应中的 ${field} 含有未知或重复 Gate`);
  }
  return items as GateName[];
}

function parseSeveritySummary(value: unknown, field: string) {
  if (!isRecord(value) || !isRecord(value.bySeverity)) {
    throw new Error(`桥接响应中的 ${field} 无效`);
  }
  const severityRecord = value.bySeverity;
  if (Object.keys(severityRecord).some(
    (severity) => !Object.prototype.hasOwnProperty.call(SEVERITY_LABELS, severity),
  )) {
    throw new Error(`桥接响应中的 ${field} 含有未知严重级别`);
  }
  const bySeverity = Object.fromEntries(
    (Object.keys(SEVERITY_LABELS) as Severity[]).map((severity) => [
      severity,
      nonNegativeInteger(severityRecord[severity] ?? 0, `${field}.${severity}`),
    ]),
  ) as Record<Severity, number>;
  const total = nonNegativeInteger(value.total, `${field}.total`);
  if (Object.values(bySeverity).reduce((sum, count) => sum + count, 0) !== total) {
    throw new Error(`桥接响应中的 ${field} 总数与分级数量不一致`);
  }
  return { total, bySeverity };
}

function parseGates(value: unknown): LifecycleGate[] {
  const gates = new Map<GateName, GateValue>();
  if (Array.isArray(value)) {
    if (value.length !== GATE_NAMES.length) {
      throw new Error("桥接响应必须恰好包含九个 Gate");
    }
    value.forEach((item, index) => {
      if (!isRecord(item)) throw new Error(`桥接响应中的 gates[${index}] 无效`);
      const id = nonEmptyString(item.id, `gates[${index}].id`);
      const status = nonEmptyString(item.status, `gates[${index}].status`);
      if (!(GATE_NAMES as readonly string[]).includes(id)) {
        throw new Error(`桥接返回了未知 Gate：${id}`);
      }
      if (!(GATE_VALUES as readonly string[]).includes(status)) {
        throw new Error(`桥接返回了未知 Gate 状态：${status}`);
      }
      if (gates.has(id as GateName)) {
        throw new Error(`桥接返回了重复 Gate：${id}`);
      }
      gates.set(id as GateName, status as GateValue);
    });
  } else if (isRecord(value)) {
    if (Object.keys(value).length !== GATE_NAMES.length
      || Object.keys(value).some((id) => !(GATE_NAMES as readonly string[]).includes(id))) {
      throw new Error("桥接响应中的 Gate 集合不完整或含有额外字段");
    }
    GATE_NAMES.forEach((id) => {
      const raw = isRecord(value[id]) ? value[id].status : value[id];
      const status = nonEmptyString(raw, `gates.${id}`);
      if (!(GATE_VALUES as readonly string[]).includes(status)) {
        throw new Error(`桥接返回了未知 Gate 状态：${status}`);
      }
      gates.set(id, status as GateValue);
    });
  } else {
    throw new Error("桥接响应中的 gates 无效");
  }

  if (!GATE_NAMES.every((id) => gates.has(id))) {
    throw new Error("桥接响应未包含完整的九个 Gate");
  }
  return GATE_NAMES.map((id) => ({ id, status: gates.get(id) as GateValue }));
}

function parseTransition(value: unknown): LifecycleTransition | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error("桥接响应中的 nextTransition 无效");
  const target = nonEmptyString(value.to, "nextTransition.to");
  const source = nonEmptyString(value.from, "nextTransition.from");
  if (!(PROJECT_STAGES as readonly string[]).includes(target)
    || !(PROJECT_STAGES as readonly string[]).includes(source)) {
    throw new Error("桥接响应中的 nextTransition 含有未知控制状态");
  }
  return {
    id: optionalString(value.id),
    from: source,
    to: target,
    requiredGates: value.requiredGates === undefined
      ? []
      : gateNameArray(value.requiredGates, "nextTransition.requiredGates"),
    requiredArtifacts: value.requiredArtifacts === undefined
      ? []
      : stringArray(value.requiredArtifacts, "nextTransition.requiredArtifacts"),
  };
}

function parseMaterials(value: unknown): LifecycleMaterial[] {
  if (!Array.isArray(value)) throw new Error("桥接响应中的 materialsNeeded 无效");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`桥接响应中的 materialsNeeded[${index}] 无效`);
    return {
      code: nonEmptyString(item.code, `materialsNeeded[${index}].code`),
      label: nonEmptyString(item.label, `materialsNeeded[${index}].label`),
    };
  });
}

function parseSnapshot(payload: unknown): LifecycleSnapshot {
  if (!isRecord(payload) || !isRecord(payload.contract) || !isRecord(payload.status)) {
    throw new Error("本地服务返回的项目快照结构不完整");
  }
  if (!isRecord(payload.nextAction) || !isRecord(payload.doctor)) {
    throw new Error("本地服务返回的检查结果结构不完整");
  }

  const schemaVersion = nonEmptyString(payload.schemaVersion, "schemaVersion");
  if (schemaVersion !== LIFECYCLE_BRIDGE_SCHEMA_VERSION) {
    throw new Error(`本地服务版本 ${schemaVersion} 暂不受此页面支持`);
  }
  if (payload.authority !== "agentctl_read_only") {
    throw new Error("本地服务没有声明只读 agentctl 权威来源");
  }
  if (payload.readOnly !== true) {
    throw new Error("本地服务没有声明只读执行边界");
  }

  const observedAt = nonEmptyString(payload.observedAt, "observedAt");
  if (Number.isNaN(Date.parse(observedAt))) {
    throw new Error("本地服务返回的观察时间无效");
  }
  const projectAlias = nonEmptyString(payload.projectAlias, "projectAlias");
  if (!SAFE_ALIAS_PATTERN.test(projectAlias)) {
    throw new Error("本地服务返回了不安全的项目别名");
  }

  const status = payload.status;
  const nextAction = payload.nextAction;
  const doctor = payload.doctor;
  const controlStatus = nonEmptyString(status.controlStatus, "status.controlStatus");
  if (!(PROJECT_STAGES as readonly string[]).includes(controlStatus)) {
    throw new Error("桥接响应包含未知控制状态");
  }
  const action = nonEmptyString(nextAction.action, "nextAction.action");
  if (!["resolve_gate", "advance", "closed"].includes(action)) {
    throw new Error("桥接响应包含未知下一动作");
  }
  const nextGate = optionalString(nextAction.gate);
  if (nextGate && !(GATE_NAMES as readonly string[]).includes(nextGate)) {
    throw new Error("桥接响应包含未知下一动作 Gate");
  }
  const nextTarget = optionalString(nextAction.to);
  if (nextTarget && !(PROJECT_STAGES as readonly string[]).includes(nextTarget)) {
    throw new Error("桥接响应包含未知下一动作状态");
  }
  if (!Array.isArray(doctor.checks) || doctor.checks.length === 0) {
    throw new Error("桥接响应中的 doctor.checks 无效");
  }
  const seenChecks = new Set<string>();
  const checks = doctor.checks.map((item, index) => {
    if (!isRecord(item)) throw new Error(`桥接响应中的 doctor.checks[${index}] 无效`);
    const name = nonEmptyString(item.name, `doctor.checks[${index}].name`);
    if (seenChecks.has(name)) throw new Error("桥接响应中的运行健康检查项重复");
    seenChecks.add(name);
    return {
      name,
      passed: booleanValue(item.passed, `doctor.checks[${index}].passed`),
    };
  });
  const expectedCheckNames = Object.keys(DOCTOR_LABELS).filter(
    (name) => name !== "closed_manifest" || controlStatus === "closed",
  );
  if (seenChecks.size !== expectedCheckNames.length
    || expectedCheckNames.some((name) => !seenChecks.has(name))) {
    throw new Error("桥接响应缺少当前阶段要求的运行健康检查项");
  }

  const consistent = booleanValue(payload.consistent, "consistent");
  const gates = parseGates(status.gates);
  const blockingGates = gateNameArray(status.blockingGates, "status.blockingGates");
  const nextTransition = parseTransition(status.nextTransition);
  const doctorHealthy = booleanValue(doctor.healthy, "doctor.healthy");
  const doctorExitCode = nonNegativeInteger(doctor.exitCode, "doctor.exitCode");
  if (doctorExitCode > 5) throw new Error("桥接响应中的运行健康退出码无效");
  const failedChecks = stringArray(doctor.failedChecks, "doctor.failedChecks");
  const derivedFailedChecks = checks.filter((check) => !check.passed).map((check) => check.name);
  if (new Set(failedChecks).size !== failedChecks.length
    || failedChecks.length !== derivedFailedChecks.length
    || failedChecks.some((name, index) => name !== derivedFailedChecks[index])) {
    throw new Error("桥接响应中的运行健康检查汇总不一致");
  }
  if (doctorHealthy !== (doctorExitCode === 0 && derivedFailedChecks.length === 0)) {
    throw new Error("桥接响应中的运行健康状态与检查结果不一致");
  }

  if (consistent) {
    const gateValues = new Map(gates.map((gate) => [gate.id, gate.status]));
    const expectedBlocking = nextTransition
      ? nextTransition.requiredGates.filter((gate) => {
        const value = gateValues.get(gate as GateName);
        return value !== "pass" && value !== "warning";
      })
      : [];
    if (blockingGates.length !== expectedBlocking.length
      || blockingGates.some((gate, index) => gate !== expectedBlocking[index])) {
      throw new Error("桥接响应中的阻断 Gate 与 Gate 结果不一致");
    }
    if (nextTransition && nextTransition.from !== controlStatus) {
      throw new Error("桥接响应中的下一转换与当前控制状态矛盾");
    }
    if (action === "closed") {
      if (controlStatus !== "closed" || nextGate || nextTarget || nextTransition !== null || blockingGates.length > 0) {
        throw new Error("桥接响应中的封存动作与工作流状态矛盾");
      }
    } else if (action === "resolve_gate") {
      if (!nextGate || nextTarget || blockingGates[0] !== nextGate) {
        throw new Error("桥接响应中的 Gate 处理动作与阻断顺序矛盾");
      }
    } else if (!nextTarget || nextGate || !nextTransition
      || nextTarget !== nextTransition.to || blockingGates.length > 0) {
      throw new Error("桥接响应中的推进建议与下一转换矛盾");
    }
  }

  return {
    schemaVersion,
    authority: "agentctl_read_only",
    readOnly: true,
    projectAlias,
    projectId: nonEmptyString(payload.projectId, "projectId"),
    observedAt,
    consistent,
    contract: {
      workflowVersion: nonEmptyString(payload.contract.workflowVersion, "contract.workflowVersion"),
      workflowSha256: nonEmptyString(payload.contract.workflowSha256, "contract.workflowSha256"),
      gatesVersion: nonEmptyString(payload.contract.gatesVersion, "contract.gatesVersion"),
      gatesSha256: nonEmptyString(payload.contract.gatesSha256, "contract.gatesSha256"),
    },
    status: {
      controlStatus,
      competitionStage: nonEmptyString(status.competitionStage, "status.competitionStage"),
      statusRevision: nonNegativeInteger(status.statusRevision, "status.statusRevision"),
      gates,
      blockingGates,
      nextTransition,
      materialsNeeded: parseMaterials(status.materialsNeeded),
      safeParallelWork: stringArray(status.safeParallelWork, "status.safeParallelWork"),
      blockerSummary: parseSeveritySummary(status.blockerSummary, "status.blockerSummary"),
      riskSummary: parseSeveritySummary(status.riskSummary, "status.riskSummary"),
      inventorySummary: isRecord(status.inventorySummary)
        ? { total: nonNegativeInteger(status.inventorySummary.total, "status.inventorySummary.total") }
        : (() => { throw new Error("桥接响应中的 status.inventorySummary 无效"); })(),
    },
    nextAction: {
      action,
      gate: nextGate,
      to: nextTarget,
      definitionOfDone: nonEmptyString(nextAction.definitionOfDone, "nextAction.definitionOfDone"),
    },
    doctor: {
      healthy: doctorHealthy,
      exitCode: doctorExitCode,
      checks,
      failedChecks,
    },
    redactions: stringArray(payload.redactions, "redactions"),
  };
}

function parseProjectChoices(payload: unknown): LifecycleProjectChoice[] {
  if (!isRecord(payload)
    || payload.schemaVersion !== LIFECYCLE_BRIDGE_SCHEMA_VERSION
    || payload.authority !== "agentctl_read_only"
    || !Array.isArray(payload.projects)) {
    throw new Error("本地服务返回的项目清单契约无效");
  }
  const rawProjects = payload.projects;

  const seen = new Set<string>();
  return rawProjects.map((item, index) => {
    const record = isRecord(item) ? item : null;
    const alias = typeof item === "string"
      ? item.trim()
      : nonEmptyString(record?.alias ?? record?.projectAlias, `projects[${index}].alias`);
    if (!SAFE_ALIAS_PATTERN.test(alias) || seen.has(alias)) {
      throw new Error("项目清单含有重复或不安全的别名");
    }
    seen.add(alias);
    return {
      alias,
      projectId: optionalString(record?.projectId) ?? alias,
      title: optionalString(record?.title) ?? alias,
    };
  });
}

function isAllowedPageHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function subscribeToPageHost() {
  return () => undefined;
}

function readPageHostAccess(): "allowed" | "blocked" {
  return isAllowedPageHost() ? "allowed" : "blocked";
}

function readServerPageHostAccess(): "checking" {
  return "checking";
}

async function fetchBridgeJson(path: string, token: string, timeoutMs: number): Promise<unknown> {
  if (!isAllowedPageHost()) throw new Error("只有本机打开的页面可以连接本地权威状态");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${LOCAL_AGENTCTL_BRIDGE_ORIGIN}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      credentials: "omit",
      mode: "cors",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("本地口令无效或已过期，请使用本次启动服务时显示的口令");
      }
      if (response.status === 403) {
        throw new Error("当前本机页面地址未获服务授权，请核对桥接配置中的页面地址和端口");
      }
      if (response.status === 404) throw new Error("本地服务中没有这个项目别名");
      if (response.status === 409) throw new Error("读取期间项目状态发生变化，系统没有拼接新旧结果，请重新读取");
      if (response.status === 422) throw new Error("该项目尚未初始化或本机状态不完整，请先在本机修复");
      if (response.status === 429) throw new Error("读取过于频繁，请稍后再试");
      throw new Error(`本地只读服务暂时无法完成读取（${response.status}）`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("本地服务没有返回可核验的 JSON 数据");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_CHARACTERS) {
      throw new Error("本地服务响应异常过大，已停止读取");
    }
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) {
      throw new Error("本地服务响应异常过大，已停止读取");
    }
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("本地服务读取超时；旧快照仍保留在页面上");
    }
    if (error instanceof SyntaxError) throw new Error("本地服务返回的数据无法解析");
    if (error instanceof TypeError) {
      throw new Error("无法连接本地只读服务，请确认服务已启动且页面由本机打开");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function stageLabel(value: string): string {
  return (PROJECT_STAGES as readonly string[]).includes(value)
    ? STAGE_LABELS[value as ProjectStage]
    : value;
}

function nextActionLabel(action: string, gate?: string, target?: string): string {
  if (action === "resolve_gate") {
    const gateLabel = gate && (GATE_NAMES as readonly string[]).includes(gate)
      ? GATE_LABELS[gate as GateName]
      : "当前";
    return `先补齐“${gateLabel}”质量门禁所需证据`;
  }
  if (action === "advance") {
    return target
      ? `当前只读建议：仅可在本机尝试进入“${stageLabel(target)}”；是否允许推进仍由本机完整校验决定`
      : "当前只读建议仅供参考；是否允许推进仍由本机完整校验决定";
  }
  return "工作流已封存，请复验最新体检和交接状态";
}

function portalGates(project: LifecyclePortalProject | null): LifecycleGate[] {
  const values = new Map(project?.gates.map((gate) => [gate.id, gate.status]) ?? []);
  return GATE_NAMES.map((id) => ({ id, status: values.get(id) ?? "unknown" }));
}

function GateGrid({ gates, raw = false }: { gates: ReadonlyArray<LifecycleGate>; raw?: boolean }) {
  return (
    <div style={pageStyles.gateGrid} aria-label="九个质量门禁状态">
      {gates.map((gate) => {
        const color = gate.status === "pass"
          ? "var(--teal-deep)"
          : gate.status === "warning"
            ? "var(--gold-deep)"
            : gate.status === "fail"
              ? "var(--risk)"
              : "var(--slate)";
        return (
          <div key={gate.id} style={pageStyles.gate}>
            <strong style={{ display: "block", fontSize: 13 }}>
              {GATE_LABELS[gate.id]}检查
            </strong>
            <span
              style={{
                color,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {raw ? gate.status : GATE_STATUS_LABELS[gate.status]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({
  label,
  total,
  bySeverity,
}: {
  label: string;
  total: number;
  bySeverity?: Readonly<Record<Severity, number>>;
}) {
  return (
    <div style={pageStyles.fact}>
      <dt style={pageStyles.term}>{label}</dt>
      <dd style={pageStyles.definition}>{total}</dd>
      {bySeverity ? (
        <small style={{ color: "var(--slate)", fontSize: 11 }}>
          {(Object.keys(SEVERITY_LABELS) as Severity[])
            .filter((severity) => bySeverity[severity] > 0)
            .map((severity) => `${SEVERITY_LABELS[severity]} ${bySeverity[severity]}`)
            .join(" · ") || "未分级"}
        </small>
      ) : null}
    </div>
  );
}

export default function LifecycleWarRoom({ portalProject }: LifecycleWarRoomProps) {
  const id = useId();
  const pageAccess = useSyncExternalStore(
    subscribeToPageHost,
    readPageHostAccess,
    readServerPageHostAccess,
  );
  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<LifecycleProjectChoice[]>([]);
  const [selectedAlias, setSelectedAlias] = useState("");
  const [snapshot, setSnapshot] = useState<LifecycleSnapshot | null>(null);
  const [snapshotStale, setSnapshotStale] = useState(false);
  const [busy, setBusy] = useState<"projects" | "snapshot" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!snapshot) return undefined;
    const observedMs = Date.parse(snapshot.observedAt);
    const remaining = Number.isFinite(observedMs)
      ? Math.max(0, observedMs + LIFECYCLE_SNAPSHOT_MAX_AGE_MS - Date.now())
      : 0;
    const timeoutId = window.setTimeout(() => setSnapshotStale(true), remaining);
    const markExpiredWhenVisible = () => {
      if (!document.hidden && isLifecycleSnapshotExpired(snapshot.observedAt, Date.now())) {
        setSnapshotStale(true);
      }
    };
    document.addEventListener("visibilitychange", markExpiredWhenVisible);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", markExpiredWhenVisible);
    };
  }, [snapshot]);

  const contractMatches = useMemo(() => {
    if (!snapshot) return false;
    return snapshot.contract.workflowVersion === CONTROL_CONTRACT_META.workflowVersion
      && snapshot.contract.workflowSha256 === CONTROL_CONTRACT_META.workflowSha256
      && snapshot.contract.gatesVersion === CONTROL_CONTRACT_META.gatesVersion
      && snapshot.contract.gatesSha256 === CONTROL_CONTRACT_META.gatesSha256;
  }, [snapshot]);

  const presentation = selectLifecyclePresentation({
    hasSnapshot: snapshot !== null,
    contractMatches,
    consistent: snapshot?.consistent === true,
    stale: snapshotStale,
    doctorHealthy: snapshot?.doctor.healthy === true,
    doctorExitCode: snapshot?.doctor.exitCode ?? -1,
    checksPassed: snapshot?.doctor.checks.every((check) => check.passed) === true,
  });
  const snapshotLabelPrefix = presentation.showRawTechnicalDetails ? "快照记录的" : "当前";
  const snapshotHistorySuffix = presentation.showRawTechnicalDetails ? "（仅供核查）" : "";
  const selectedProject = projects.find((project) => project.alias === selectedAlias) ?? null;
  const portalGateList = portalGates(portalProject);
  const sameProject = Boolean(
    portalProject
    && snapshot
    && portalProject.id === snapshot.projectId,
  );

  function markExistingSnapshotStale() {
    if (snapshot) setSnapshotStale(true);
  }

  function ensureReady(): string | null {
    if (pageAccess !== "allowed" || !isAllowedPageHost()) {
      setError("此页面不是从 localhost 或 127.0.0.1 打开的，本机读取已阻断");
      markExistingSnapshotStale();
      return null;
    }
    const nextToken = token.trim();
    if (!nextToken) {
      setError("请输入本次启动本地服务时显示的临时口令");
      return null;
    }
    if (nextToken.length > 512) {
      setError("口令长度异常，请重新复制本次启动服务时显示的口令");
      return null;
    }
    return nextToken;
  }

  async function loadProjects(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextToken = ensureReady();
    if (!nextToken) return;
    setBusy("projects");
    setError("");
    setMessage("");
    try {
      const payload = await fetchBridgeJson("/v1/projects", nextToken, PROJECT_LIST_TIMEOUT_MS);
      const nextProjects = parseProjectChoices(payload);
      setProjects(nextProjects);
      if (snapshot && !nextProjects.some((project) => project.alias === snapshot.projectAlias)) {
        setSnapshotStale(true);
      }
      setSelectedAlias((current) => (
        nextProjects.some((project) => project.alias === current)
          ? current
          : nextProjects[0]?.alias ?? ""
      ));
      setMessage(
        nextProjects.length > 0
          ? `已读取 ${nextProjects.length} 个允许访问的本地项目，请选择后读取权威状态。`
          : "本地服务尚未配置可读取的项目。",
      );
    } catch (caught) {
      markExistingSnapshotStale();
      setError(caught instanceof Error ? caught.message : "读取本地项目清单失败");
    } finally {
      setBusy(null);
    }
  }

  async function loadSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextToken = ensureReady();
    if (!nextToken) return;
    if (!selectedProject || !SAFE_ALIAS_PATTERN.test(selectedProject.alias)) {
      setError("请先从本地服务返回的清单中选择项目");
      return;
    }
    setBusy("snapshot");
    setError("");
    setMessage("");
    try {
      const payload = await fetchBridgeJson(
        `/v1/projects/${encodeURIComponent(selectedProject.alias)}/snapshot`,
        nextToken,
        SNAPSHOT_TIMEOUT_MS,
      );
      const nextSnapshot = parseSnapshot(payload);
      if (nextSnapshot.projectAlias !== selectedProject.alias) {
        throw new Error("本地服务返回的项目别名与所选项目不一致");
      }
      if (isLifecycleSnapshotExpired(nextSnapshot.observedAt, Date.now())) {
        throw new Error("本地服务返回的快照已超过五分钟，请重新读取");
      }
      setSnapshot(nextSnapshot);
      setSnapshotStale(false);
      setMessage("本地权威状态已更新。该页面仍为只读，不会改变质量检查、阶段或交付状态。");
    } catch (caught) {
      markExistingSnapshotStale();
      setError(caught instanceof Error ? caught.message : "读取本地权威状态失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="lifecycle" style={{ ...pageStyles.shell, marginTop: 28 }} aria-labelledby={`${id}-title`}>
      <div style={pageStyles.heading}>
        <span style={pageStyles.eyebrow}>生命周期作战室 · 本地只读</span>
        <h2 id={`${id}-title`} style={pageStyles.title}>把登记信息与真实 Agent 进度分开看</h2>
        <p style={pageStyles.description}>
          门户只保存协作登记；本地权威卡只读取证据控制程序的三项安全摘要。
          本页没有质量检查修改、阶段推进或最终交接入口。
        </p>
      </div>

      <div style={pageStyles.boundary} aria-label="两类状态的权威边界">
        <div>
          <strong>门户登记态</strong>
          <p style={pageStyles.helper}>便于协作浏览，不是进度凭证，也不能覆盖本地状态。</p>
        </div>
        <div>
          <strong>本地权威态</strong>
          <p style={pageStyles.helper}>来自本机只读证据控制程序；只有当前契约一致时才解释下一转换。</p>
        </div>
      </div>

      <div style={pageStyles.connection}>
        <form onSubmit={loadProjects} style={pageStyles.field} aria-describedby={`${id}-token-help`}>
          <label htmlFor={`${id}-token`} style={pageStyles.label}>本次临时口令</label>
          <input
            id={`${id}-token`}
            name="evi-x-local-bridge-token"
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              setMessage("");
              setError("");
              markExistingSnapshotStale();
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={pageAccess !== "allowed" || busy !== null}
            style={pageStyles.input}
          />
          <p id={`${id}-token-help`} style={pageStyles.helper}>
            口令只保存在当前组件内存，不写入浏览器存储、Cookie 或网址。
          </p>
          <div style={pageStyles.buttonRow}>
            <button
              type="submit"
              disabled={pageAccess !== "allowed" || busy !== null || !token.trim()}
              style={{ ...pageStyles.primaryButton, opacity: pageAccess !== "allowed" || busy !== null || !token.trim() ? 0.55 : 1 }}
            >
              {busy === "projects" ? "正在读取…" : "读取本地项目清单"}
            </button>
          </div>
        </form>

        <form onSubmit={loadSnapshot} style={pageStyles.field}>
          <label htmlFor={`${id}-project`} style={pageStyles.label}>允许读取的项目</label>
          <select
            id={`${id}-project`}
            value={selectedAlias}
            onChange={(event) => {
              setSelectedAlias(event.target.value);
              setMessage("");
              setError("");
              markExistingSnapshotStale();
            }}
            disabled={pageAccess !== "allowed" || busy !== null || projects.length === 0}
            style={pageStyles.input}
          >
            {projects.length === 0 ? <option value="">请先读取项目清单</option> : null}
            {projects.map((project) => (
              <option key={project.alias} value={project.alias}>
                {project.title}（{project.alias}）
              </option>
            ))}
          </select>
          <p style={pageStyles.helper}>
            固定读取地址：<code style={pageStyles.mono}>{LOCAL_AGENTCTL_BRIDGE_ORIGIN}</code>
          </p>
          <div style={pageStyles.buttonRow}>
            <button
              type="submit"
              disabled={pageAccess !== "allowed" || busy !== null || !selectedProject}
              style={{ ...pageStyles.secondaryButton, opacity: pageAccess !== "allowed" || busy !== null || !selectedProject ? 0.55 : 1 }}
            >
              {busy === "snapshot" ? "正在核验…" : "读取权威状态"}
            </button>
          </div>
        </form>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {pageAccess === "checking" ? <p style={pageStyles.notice}>正在确认页面是否由本机打开…</p> : null}
        {pageAccess === "blocked" ? (
          <p role="alert" style={pageStyles.error}>
            安全阻断：只有从 <strong>localhost</strong> 或 <strong>127.0.0.1</strong> 打开的页面才能访问本机桥接服务。
          </p>
        ) : null}
        {error ? <p role="alert" style={pageStyles.error}>{error}</p> : null}
        {message ? <p role="status" style={pageStyles.notice}>{message}</p> : null}
      </div>

      <div style={pageStyles.cards}>
        <article style={pageStyles.card} aria-labelledby={`${id}-portal-title`}>
          <div style={pageStyles.cardHead}>
            <div>
              <h3 id={`${id}-portal-title`} style={pageStyles.cardTitle}>门户登记态｜不是进度凭证</h3>
              <p style={pageStyles.helper}>来自网站登记记录；仅用于协作参考。</p>
            </div>
            <span style={pageStyles.badge}>非权威</span>
          </div>

          {portalProject ? (
            <>
              <div>
                <strong>{portalProject.title}</strong>
                <p style={pageStyles.helper}>项目 ID：<code style={pageStyles.mono}>{portalProject.id}</code></p>
              </div>
              <dl style={pageStyles.facts}>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>登记控制状态</dt>
                  <dd style={pageStyles.definition}>{stageLabel(portalProject.controlStatus)}</dd>
                </div>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>赛事阶段</dt>
                  <dd style={pageStyles.definition}>{portalProject.competitionStage}</dd>
                </div>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>登记状态版本</dt>
                  <dd style={pageStyles.definition}>r{portalProject.statusRevision}</dd>
                </div>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>登记完整性</dt>
                  <dd style={pageStyles.definition}>{INTEGRITY_LABELS[portalProject.integrity]}</dd>
                </div>
              </dl>
              <div>
                <h4 style={pageStyles.subheading}>登记的九项质量检查</h4>
                <GateGrid gates={portalGateList} />
              </div>
              <p style={pageStyles.helper}>
                最后登记：<time dateTime={portalProject.updatedAt}>{formatTime(portalProject.updatedAt)}</time>
              </p>
              <p style={pageStyles.warning}>这些值不能证明质量门禁证据仍然有效，也不能授权阶段推进或最终交接。</p>
            </>
          ) : (
            <p style={pageStyles.warning}>当前没有选中的门户项目。此处保持空白，不会据此创建或推断真实项目状态。</p>
          )}
        </article>

        <article style={pageStyles.localCard} aria-labelledby={`${id}-local-title`} aria-busy={busy === "snapshot"}>
          <div style={pageStyles.cardHead}>
            <div>
              <h3 id={`${id}-local-title`} style={pageStyles.cardTitle}>本地权威态｜只读</h3>
              <p style={pageStyles.helper}>来自本机证据控制程序的安全摘要，不包含原始命令输出。</p>
            </div>
            {snapshotStale ? <span style={pageStyles.staleBadge}>旧快照 · 已过期</span> : <span style={pageStyles.badge}>只读</span>}
          </div>

          {snapshot ? (
            <>
              <div>
                <strong>{projects.find((project) => project.alias === snapshot.projectAlias)?.title ?? snapshot.projectAlias}</strong>
                <p style={pageStyles.helper}>
                  别名 <code style={pageStyles.mono}>{snapshot.projectAlias}</code> · 项目 ID <code style={pageStyles.mono}>{snapshot.projectId}</code>
                </p>
                <p style={pageStyles.helper}>
                  观察时间：<time dateTime={snapshot.observedAt}>{formatTime(snapshot.observedAt)}</time>
                </p>
              </div>

              {!sameProject && portalProject ? (
                <p style={pageStyles.warning}>两张卡的项目 ID 不一致，页面不会把它们当作同一个项目比较。</p>
              ) : null}
              {!snapshot.consistent ? (
                <p style={pageStyles.error}>三项本机只读检查的摘要不一致；仅展示原始状态，不解释下一转换。</p>
              ) : null}
              {!contractMatches ? (
                <div role="alert" style={pageStyles.error}>
                  <strong>控制契约不一致，已停止解释下一转换。</strong>
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 800 }}>查看技术校验值</summary>
                    <div style={{ ...pageStyles.mono, marginTop: 6 }}>
                      工作流：收到 {snapshot.contract.workflowVersion} / {snapshot.contract.workflowSha256.slice(0, 12)}…，页面期望 {CONTROL_CONTRACT_META.workflowVersion} / {CONTROL_CONTRACT_META.workflowSha256.slice(0, 12)}…<br />
                      质量门禁：收到 {snapshot.contract.gatesVersion} / {snapshot.contract.gatesSha256.slice(0, 12)}…，页面期望 {CONTROL_CONTRACT_META.gatesVersion} / {CONTROL_CONTRACT_META.gatesSha256.slice(0, 12)}…
                    </div>
                  </details>
                </div>
              ) : null}
              {!snapshot.doctor.healthy || snapshot.doctor.exitCode !== 0 ? (
                <p role="alert" style={pageStyles.error}>运行健康检查未通过，已停止解释下一转换与推进建议。</p>
              ) : null}
              {presentation.showRawTechnicalDetails ? (
                <p role="alert" style={pageStyles.warning}>以下为保留快照，仅供核查，不代表当前可用状态；所有行动建议均已暂停。</p>
              ) : null}

              <dl style={pageStyles.facts}>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>{snapshotLabelPrefix}控制阶段</dt>
                  <dd style={pageStyles.definition}>
                    {stageLabel(snapshot.status.controlStatus)}
                  </dd>
                </div>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>{snapshotLabelPrefix}赛事阶段</dt>
                  <dd style={pageStyles.definition}>{snapshot.status.competitionStage}</dd>
                </div>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>{snapshotLabelPrefix}状态版本</dt>
                  <dd style={pageStyles.definition}>r{snapshot.status.statusRevision}</dd>
                </div>
                <div style={pageStyles.fact}>
                  <dt style={pageStyles.term}>{snapshotLabelPrefix}未通过质量检查</dt>
                  <dd style={pageStyles.definition}>{snapshot.status.blockingGates.length}</dd>
                </div>
              </dl>

              <div>
                <h4 style={pageStyles.subheading}>{snapshotLabelPrefix}九项质量检查 {snapshotHistorySuffix}</h4>
                <GateGrid gates={snapshot.status.gates} />
              </div>

              <dl style={pageStyles.facts}>
                <SummaryCard
                  label={`${snapshotLabelPrefix}开放阻塞项${snapshotHistorySuffix}`}
                  total={snapshot.status.blockerSummary.total}
                  bySeverity={snapshot.status.blockerSummary.bySeverity}
                />
                <SummaryCard
                  label={`${snapshotLabelPrefix}开放风险${snapshotHistorySuffix}`}
                  total={snapshot.status.riskSummary.total}
                  bySeverity={snapshot.status.riskSummary.bySeverity}
                />
                <SummaryCard label={`${snapshotLabelPrefix}待复核或隔离材料${snapshotHistorySuffix}`} total={snapshot.status.inventorySummary.total} />
              </dl>

              <hr style={pageStyles.divider} />
              <div>
                <h4 style={pageStyles.subheading}>下一转换</h4>
                {presentation.showTransition ? (
                  snapshot.status.nextTransition ? (
                    <>
                      <p style={pageStyles.notice}>
                        {stageLabel(snapshot.status.nextTransition.from ?? snapshot.status.controlStatus)} → <strong>{stageLabel(snapshot.status.nextTransition.to)}</strong>
                      </p>
                      <dl style={{ ...pageStyles.facts, marginTop: 8 }}>
                        <div style={pageStyles.fact}>
                          <dt style={pageStyles.term}>所需质量检查</dt>
                          <dd style={pageStyles.definition}>
                            {snapshot.status.nextTransition.requiredGates.length
                              ? snapshot.status.nextTransition.requiredGates.map((gate) => GATE_LABELS[gate as GateName]).join("、")
                              : "无"}
                          </dd>
                        </div>
                        <div style={pageStyles.fact}>
                          <dt style={pageStyles.term}>所需产物</dt>
                          <dd style={pageStyles.definition}>
                            {snapshot.status.nextTransition.requiredArtifacts.length
                              ? snapshot.status.nextTransition.requiredArtifacts.map((artifact) => ARTIFACT_LABELS[artifact] ?? "本阶段约定材料").join("、")
                              : "无"}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p style={pageStyles.notice}>本次只读结果没有下一转换；这不等于最终交接已经通过。</p>
                  )
                ) : (
                  <p style={pageStyles.warning}>下一转换说明已暂停；请刷新快照或先修复本机检查。</p>
                )}
              </div>

              <div>
                <h4 style={pageStyles.subheading}>缺失材料</h4>
                {!presentation.showMaterials ? (
                  <p style={pageStyles.warning}>当前状态不可解释，材料建议已暂停；请刷新快照或先修复本机检查。</p>
                ) : snapshot.status.materialsNeeded.length > 0 ? (
                  <ul style={pageStyles.list}>
                    {snapshot.status.materialsNeeded.map((material) => (
                      <li key={`${material.code}-${material.label}`}>{material.label}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={pageStyles.helper}>本次结果未列出缺失材料；不代表质量检查已经通过。</p>
                )}
              </div>

              <div>
                <h4 style={pageStyles.subheading}>
                  {presentation.showNextAction ? "首要下一动作" : "下一动作已暂停"}
                </h4>
                {presentation.showNextAction ? (
                  <p style={pageStyles.notice}>{nextActionLabel(snapshot.nextAction.action, snapshot.nextAction.gate, snapshot.nextAction.to)}</p>
                ) : (
                  <p style={pageStyles.warning}>当前状态不可解释；请刷新快照或先修复本机检查。</p>
                )}
                {presentation.showNextAction ? (
                  <p style={pageStyles.helper}>
                    完成标准：{snapshot.nextAction.definitionOfDone}
                    {snapshot.nextAction.gate ? ` · 质量门禁 ${GATE_LABELS[snapshot.nextAction.gate as GateName]}` : ""}
                    {snapshot.nextAction.to ? ` · 目标 ${stageLabel(snapshot.nextAction.to)}` : ""}
                  </p>
                ) : null}
              </div>

              <div>
                <h4 style={pageStyles.subheading}>可安全并行工作</h4>
                {!presentation.showParallelWork ? (
                  <p style={pageStyles.warning}>当前状态不可解释，并行建议已暂停；请刷新快照或先修复本机检查。</p>
                ) : snapshot.status.safeParallelWork.length > 0 ? (
                  <ul style={pageStyles.list}>
                    {snapshot.status.safeParallelWork.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p style={pageStyles.helper}>本次结果未列出可安全并行项。</p>
                )}
              </div>

              <div>
                <h4 style={pageStyles.subheading}>运行健康检查</h4>
                <p style={snapshot.doctor.healthy ? pageStyles.notice : pageStyles.error}>
                  {snapshot.doctor.healthy ? "检查结果健康" : "检查发现问题"}
                </p>
                {snapshot.doctor.checks.length > 0 ? (
                  <ul style={pageStyles.list}>
                    {snapshot.doctor.checks.map((check) => (
                      <li key={check.name}>{check.passed ? "通过" : "未通过"}：{DOCTOR_LABELS[check.name] ?? "未知检查项"}</li>
                    ))}
                  </ul>
                ) : null}
                {snapshot.doctor.failedChecks.length > 0 ? (
                  <p style={pageStyles.helper}>未通过项目：{snapshot.doctor.failedChecks.map((item) => DOCTOR_LABELS[item] ?? "未知检查项").join("、")}</p>
                ) : null}
                <p style={pageStyles.warning}>检查健康只说明本次只读核验完成，不构成阶段推进或最终交接许可。</p>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>查看技术状态</summary>
                  <p style={{ ...pageStyles.mono, marginTop: 6 }}>本机检查退出码：{snapshot.doctor.exitCode}</p>
                </details>
              </div>

              {snapshot.redactions.length > 0 ? (
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 800 }}>已应用的安全脱敏</summary>
                  <ul style={{ ...pageStyles.list, marginTop: 8 }}>
                    {snapshot.redactions.map((item) => <li key={item}>{REDACTION_LABELS[item] ?? "其他本机敏感细节"}</li>)}
                  </ul>
                </details>
              ) : null}

              {presentation.showRawTechnicalDetails ? (
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>查看已暂停解释的原始技术字段</summary>
                  <p style={{ ...pageStyles.mono, marginTop: 6 }}>
                    controlStatus={snapshot.status.controlStatus}<br />
                    nextTarget={snapshot.status.nextTransition?.to ?? "null"}<br />
                    nextAction={snapshot.nextAction.action}
                  </p>
                </details>
              ) : null}
            </>
          ) : (
            <p style={pageStyles.notice}>尚未读取本地权威状态。门户登记值不会自动复制到这里。</p>
          )}
        </article>
      </div>
    </section>
  );
}
