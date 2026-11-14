/** Pure client helpers & contracts for the backend 5-role LangGraph workflow API (`/api/projects/{projectId}/agent-tasks`). */
import type { StageModelPreferences } from './model-routing.ts';
import type { LiteratureStudy } from './literature-study.ts';
import type { TopicResearchBrief, TopicSelection } from '../topic-project.ts';
import { parseSurveyList, type SurveyRelease } from '../survey-collection.ts';

export const WORKFLOW_TASK_TYPES = ['full_research', 'topic_design', 'questionnaire', 'data_analysis', 'report'] as const;
export type WorkflowTaskType = typeof WORKFLOW_TASK_TYPES[number];

export const WORKFLOW_ROLES = ['research', 'survey', 'data', 'writing', 'reviewer'] as const;
export type WorkflowRole = typeof WORKFLOW_ROLES[number];

export type WorkflowStatus = 'ready' | 'running' | 'needs_input' | 'blocked' | 'completed' | 'failed';
export type WorkflowTaskCapability = 'questionnaire' | 'research' | 'report';
export type WorkflowServiceCapability = WorkflowTaskCapability | 'defense';

export type WorkflowServiceRef = {
  id: string;
  label: string;
  model: string;
  capabilities: readonly WorkflowServiceCapability[];
  revision: number;
};

export type WorkflowModelBinding = {
  serviceId: string;
  revision: number;
};

export type WorkflowModelPlan = {
  schemaVersion: 1;
  default?: WorkflowModelBinding;
  roles?: Partial<Record<WorkflowRole, WorkflowModelBinding>>;
  steps?: Record<string, WorkflowModelBinding>;
};

export type WorkflowTaskContextLiterature = {
  title: string;
  sourceRef: string;
  excerpt: string;
  location: string;
};

export type WorkflowCreateTaskPayload = {
  taskType: WorkflowTaskType;
  requirements: {
    goal: string;
    title?: string;
    geography?: string;
    population?: string;
    decisionOwner?: string;
    decision?: string;
    researchQuestions?: string[];
  };
  context?: {
    literature?: WorkflowTaskContextLiterature[];
    user_feedback?: string;
  };
  inputArtifactRefs?: string[];
  constraints?: Record<string, string>;
  modelPlan?: WorkflowModelPlan;
};

export type WorkflowTaskExecution = {
  id: string;
  role: WorkflowRole;
  status: string;
  inputRevision: number;
  claimedRevision: number;
  inputHash: string;
  resultHash: string | null;
  errorCode: string | null;
  startedAt: string;
  leaseExpiresAt: string;
  finishedAt: string | null;
};

export type WorkflowTaskState = {
  task_id: string;
  project_id: string;
  task_type: WorkflowTaskType;
  requirements: Record<string, unknown>;
  context: Record<string, unknown>;
  input_artifact_refs: string[];
  constraints: Record<string, unknown>;
  status: WorkflowStatus;
  current_role: WorkflowRole | null;
  awaiting_approval: string | null;
  retry_count: Record<string, number>;
  max_retries: number;
  artifact_refs: string[];
  evidence_refs: string[];
  unresolved_questions: string[];
  errors: string[];
  summary: string;
  revision: number;
  agent_outputs: Partial<Record<WorkflowRole, Record<string, unknown>>>;
  model_bindings: Record<string, unknown> | null;
};

export type WorkflowTaskRecord = {
  id: string;
  projectId: string;
  taskType: WorkflowTaskType;
  status: WorkflowStatus;
  revision: number;
  state: WorkflowTaskState;
  createdAt: string;
  updatedAt: string;
  execution?: WorkflowTaskExecution | null;
};

export type WorkflowPreviewStep = {
  step: string;
  serviceId: string;
  serviceRevision: number;
  provider?: string;
  model?: string;
  maxOutputTokens?: number;
};

export type WorkflowPreviewDataset = {
  ref: string;
  releaseId: string;
  title: string;
  classification: 'actual' | 'synthetic';
  responseCount: number;
  snapshotHash: string;
  derivedContent?: string;
};

export type WorkflowModelPreview = {
  taskId: string;
  projectId: string;
  inputRevision: number;
  inputHash: string;
  role: WorkflowRole;
  materials: Record<string, unknown>;
  steps: WorkflowPreviewStep[];
  maxCalls: number;
  instructionHashes: Record<string, string>;
  maxOutputTokens: number;
  derivedContent: string | null;
  available: boolean;
  missingTools: string[];
  dataTool?: string;
  datasets?: WorkflowPreviewDataset[];
  dataDisclosure?: string;
  previewHash: string;
};

export type WorkflowModelCallReceipt = {
  id: string;
  taskId: string;
  projectId: string;
  executionId: string;
  step: string;
  status: string;
  inputRevision: number;
  inputHash: string;
  consentHash: string;
  serviceId: string;
  serviceRevision: number;
  providerMode: string;
  startedAt: string;
  finishedAt: string | null;
  resultHash: string | null;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  errorCode: string | null;
};

export type WorkflowTransport = {
  request: (path: string) => Promise<unknown>;
  mutate: (path: string, body: unknown, method?: string) => Promise<unknown>;
};

export const TASK_TYPE_META: Record<WorkflowTaskType, { label: string; description: string; roles: readonly WorkflowRole[] }> = {
  full_research: {
    label: '全流程研究协作',
    description: '选题论证 → 问卷与抽样 → 实证统计 → 报告成稿（每阶段经独立审校）',
    roles: ['research', 'survey', 'data', 'writing', 'reviewer'],
  },
  topic_design: {
    label: '选题与研究设计',
    description: '选题论证专家推演研究方案，并由审校核对可行性与证据',
    roles: ['research', 'reviewer'],
  },
  questionnaire: {
    label: '问卷与抽样设计',
    description: '问卷专家生成构念量表与抽样计划，并由审校核验题项覆盖',
    roles: ['survey', 'reviewer'],
  },
  data_analysis: {
    label: '实证数据统计分析',
    description: '数据专家读取已绑定问卷数据集执行描述/推断统计，并由审校核对指标',
    roles: ['data', 'reviewer'],
  },
  report: {
    label: '研究报告撰写',
    description: '撰稿专家汇总前期发现成文，并由审校检查口径与图表一致性',
    roles: ['writing', 'reviewer'],
  },
};

export const ROLE_META: Record<WorkflowRole, { label: string; capability: WorkflowTaskCapability; summary: string }> = {
  research: { label: '选题研究', capability: 'research', summary: '界定研究问题、决策目标与可行性边界' },
  survey: { label: '问卷抽样', capability: 'questionnaire', summary: '设计变量矩阵、问卷题项与预调研方案' },
  data: { label: '数据分析', capability: 'research', summary: '读取受控调查快照，生成可核验统计摘要' },
  writing: { label: '报告撰稿', capability: 'report', summary: '整合结构化结论与图表目录，撰写报告正文' },
  reviewer: { label: '质量审校', capability: 'report', summary: '按阶段核验逻辑闭环、证据归因与竞赛合规' },
};

export type ModelPlanResult =
  | {
    ok: true;
    plan: WorkflowModelPlan;
    resolvedRoles: Partial<Record<WorkflowRole, WorkflowServiceRef>>;
    missingRoles: [];
  }
  | {
    ok: false;
    plan: null;
    resolvedRoles: Partial<Record<WorkflowRole, WorkflowServiceRef>>;
    missingRoles: { role: WorkflowRole; capability: WorkflowTaskCapability }[];
  };

/** Resolve BYOK services for every role needed by a backend workflow taskType. */
export function buildWorkflowModelPlan(
  taskType: WorkflowTaskType,
  services: readonly WorkflowServiceRef[],
  preferences?: Pick<StageModelPreferences, 'defaultServiceId' | 'tasks'> | null,
  explicitDefaultId?: string | null,
): ModelPlanResult {
  const needed = TASK_TYPE_META[taskType].roles;
  const fallbackDefault = explicitDefaultId ?? preferences?.defaultServiceId ?? null;
  const resolvedRoles: Partial<Record<WorkflowRole, WorkflowServiceRef>> = {};
  const bindings: Partial<Record<WorkflowRole, WorkflowModelBinding>> = {};
  const missingRoles: { role: WorkflowRole; capability: WorkflowTaskCapability }[] = [];

  for (const role of needed) {
    const capability = ROLE_META[role].capability;
    const preferredId = preferences?.tasks?.[capability] ?? fallbackDefault;
    const preferred = preferredId ? services.find(s => s.id === preferredId && s.capabilities.includes(capability)) : undefined;
    const picked = preferred ?? services.find(s => s.capabilities.includes(capability));
    if (!picked) {
      missingRoles.push({ role, capability });
      continue;
    }
    resolvedRoles[role] = picked;
    bindings[role] = { serviceId: picked.id, revision: picked.revision };
  }

  if (missingRoles.length > 0) {
    return { ok: false, plan: null, resolvedRoles, missingRoles };
  }

  const defaultService = (fallbackDefault ? services.find(s => s.id === fallbackDefault) : undefined)
    ?? needed.map(role => resolvedRoles[role]).find(Boolean);

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      ...(defaultService ? { default: { serviceId: defaultService.id, revision: defaultService.revision } } : {}),
      roles: bindings,
    },
    resolvedRoles,
    missingRoles: [],
  };
}

export type WorkspaceTaskInput = {
  taskType: WorkflowTaskType;
  direction: string;
  brief?: TopicResearchBrief | null;
  selected?: TopicSelection | null;
  literatureStudy?: LiteratureStudy | null;
  inputArtifactRefs?: string[];
  modelPlan?: WorkflowModelPlan;
};

/** Map the local ResearchWorkspace draft into an allow-listed backend task payload. */
export function buildTaskPayloadFromWorkspace(input: WorkspaceTaskInput): WorkflowCreateTaskPayload {
  const brief = input.brief ?? null;
  const title = (brief?.title || input.selected?.title || input.direction || '').trim().slice(0, 160);
  const goal = (brief?.decision || title || input.direction || '完成市场调研设计与实证分析报告').trim().slice(0, 600);
  const requirements: WorkflowCreateTaskPayload['requirements'] = { goal };
  if (title) requirements.title = title;
  if (brief?.geography?.trim()) requirements.geography = brief.geography.trim().slice(0, 160);
  if (brief?.population?.trim()) requirements.population = brief.population.trim().slice(0, 300);
  if (brief?.decisionOwner?.trim()) requirements.decisionOwner = brief.decisionOwner.trim().slice(0, 160);
  if (brief?.decision?.trim()) requirements.decision = brief.decision.trim().slice(0, 600);
  const questions = (brief?.questions ?? []).map(q => q.text.trim()).filter(Boolean).slice(0, 10);
  if (questions.length > 0) requirements.researchQuestions = questions;

  const literature: WorkflowTaskContextLiterature[] = [];
  const study = input.literatureStudy;
  if (study?.evidence?.length) {
    const paperMap = new Map(study.papers.map(paper => [paper.id, paper]));
    for (const item of study.evidence.slice(0, 12)) {
      const paper = paperMap.get(item.paperId);
      const excerpt = item.quote.trim().slice(0, 600);
      if (!excerpt) continue;
      literature.push({
        title: (paper?.title || '参考研读文献').slice(0, 200),
        sourceRef: (paper?.filename || item.paperId).slice(0, 160),
        excerpt,
        location: `第 ${item.page} 页 (${item.kind})`,
      });
    }
  }
  if (brief?.sources?.length && literature.length < 16) {
    for (const src of brief.sources.slice(0, 16 - literature.length)) {
      const excerpt = (src.snippet || src.locator || src.title).trim().slice(0, 600);
      if (!excerpt) continue;
      literature.push({
        title: src.title.slice(0, 200),
        sourceRef: (src.url || src.id).slice(0, 200),
        excerpt,
        location: (src.locator || src.coverage).slice(0, 120),
      });
    }
  }

  return {
    taskType: input.taskType,
    requirements,
    ...(literature.length > 0 ? { context: { literature } } : {}),
    ...(input.inputArtifactRefs?.length ? { inputArtifactRefs: [...new Set(input.inputArtifactRefs)] } : {}),
    ...(input.modelPlan ? { modelPlan: input.modelPlan } : {}),
  };
}

export type WorkflowGate =
  | { kind: 'upload_real_data'; label: string }
  | { kind: 'approve_review'; role: string; label: string }
  | { kind: 'agent_input'; label: string };

/** Classify human-in-the-loop pause gates signaled by the backend state machine. */
export function classifyWorkflowGate(task: Pick<WorkflowTaskRecord, 'status' | 'state'>): WorkflowGate | null {
  if (task.status !== 'needs_input') return null;
  const gate = task.state.awaiting_approval;
  if (!gate) return null;
  if (gate === 'upload_real_data') {
    return { kind: 'upload_real_data', label: '请先绑定已回收答卷的问卷发布快照，再继续数据分析。' };
  }
  if (gate === 'agent_input') {
    return { kind: 'agent_input', label: '当前角色提出待澄清问题，请确认或补充说明后继续。' };
  }
  if (gate.startsWith('approve_')) {
    const role = gate.slice('approve_'.length);
    const label = ROLE_META[role as WorkflowRole]?.label ?? role;
    return { kind: 'approve_review', role, label: `「${label}」阶段已通过审校，请确认放行或退回修改。` };
  }
  return { kind: 'agent_input', label: `任务正在等待人工确认 (${gate})。` };
}

/** Extract clean stage progress for UI pipeline visualization. */
export function workflowStageProgress(task: WorkflowTaskRecord): { role: WorkflowRole; label: string; state: 'done' | 'active' | 'waiting' | 'blocked' }[] {
  const roles = TASK_TYPE_META[task.taskType]?.roles ?? WORKFLOW_ROLES;
  const outputs = task.state.agent_outputs ?? {};
  const activeRole = task.state.current_role;

  return roles.map(role => {
    const label = ROLE_META[role].label;
    if (task.status === 'completed' || (Object.hasOwn(outputs, role) && activeRole !== role)) {
      return { role, label, state: 'done' };
    }
    if (activeRole === role) {
      return { role, label, state: task.status === 'blocked' || task.status === 'failed' ? 'blocked' : 'active' };
    }
    return { role, label, state: 'waiting' };
  });
}

export async function listAgentTasks(transport: WorkflowTransport, projectId: string): Promise<WorkflowTaskRecord[]> {
  const data = await transport.request(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks`) as { tasks?: WorkflowTaskRecord[] };
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

export async function createAgentTask(transport: WorkflowTransport, projectId: string, payload: WorkflowCreateTaskPayload): Promise<WorkflowTaskRecord> {
  return await transport.mutate(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks`, payload, 'POST') as WorkflowTaskRecord;
}

export async function getAgentTask(transport: WorkflowTransport, projectId: string, taskId: string): Promise<WorkflowTaskRecord> {
  return await transport.request(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks/${encodeURIComponent(taskId)}`) as WorkflowTaskRecord;
}

export async function getModelPreview(transport: WorkflowTransport, projectId: string, taskId: string): Promise<WorkflowModelPreview> {
  return await transport.request(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks/${encodeURIComponent(taskId)}/model-preview`) as WorkflowModelPreview;
}

export async function advanceAgentTask(
  transport: WorkflowTransport,
  projectId: string,
  taskId: string,
  body: { expectedRevision: number; modelConsent?: { accepted: true; previewHash: string; maxCalls: number } },
): Promise<WorkflowTaskRecord> {
  return await transport.mutate(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks/${encodeURIComponent(taskId)}/advance`, body, 'POST') as WorkflowTaskRecord;
}

export async function getModelCalls(transport: WorkflowTransport, projectId: string, taskId: string): Promise<WorkflowModelCallReceipt[]> {
  const data = await transport.request(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks/${encodeURIComponent(taskId)}/model-calls`) as { calls?: WorkflowModelCallReceipt[] };
  return Array.isArray(data?.calls) ? data.calls : [];
}

export async function approveAgentTask(
  transport: WorkflowTransport,
  projectId: string,
  taskId: string,
  body: { expectedRevision: number; approved: boolean; feedback?: string },
): Promise<WorkflowTaskRecord> {
  return await transport.mutate(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks/${encodeURIComponent(taskId)}/approval`, body, 'POST') as WorkflowTaskRecord;
}

export async function provideTaskInput(
  transport: WorkflowTransport,
  projectId: string,
  taskId: string,
  body: { expectedRevision: number; artifactRefs: string[] },
): Promise<WorkflowTaskRecord> {
  return await transport.mutate(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks/${encodeURIComponent(taskId)}/input`, body, 'POST') as WorkflowTaskRecord;
}

export async function cancelAgentTask(transport: WorkflowTransport, projectId: string, taskId: string, expectedRevision: number): Promise<WorkflowTaskRecord> {
  return await transport.mutate(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks/${encodeURIComponent(taskId)}/cancel`, { expectedRevision }, 'POST') as WorkflowTaskRecord;
}

export async function listProjectSurveys(transport: WorkflowTransport, projectId: string): Promise<SurveyRelease[]> {
  return parseSurveyList(await transport.request(`/api/projects/${encodeURIComponent(projectId)}/surveys`));
}
