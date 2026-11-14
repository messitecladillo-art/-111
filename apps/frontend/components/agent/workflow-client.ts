'use client';

import { hostedRequest } from '@/components/hosted/api-client';
import { parseSurveyList, type SurveyRelease } from '@/lib/survey-collection';
import {
  parseWorkflowCalls, parseWorkflowCreateRequest, parseWorkflowExecutions, parseWorkflowGrants,
  parseWorkflowModelGrant, parseWorkflowPhasePreview, parseWorkflowScope, parseWorkflowTask, parseWorkflowTasks,
  workflowId, workflowRevision, WORKFLOW_ROLE_STEPS,
  type WorkflowCreateRequest, type WorkflowExecution, type WorkflowModelCall, type WorkflowModelGrant,
  type WorkflowPhasePreview, type WorkflowProjectScope, type WorkflowScope, type WorkflowTask, type WorkflowTaskScope,
} from '@/lib/agent/workflow-tasks';

export type WorkflowRequestOptions = { signal?: AbortSignal; timeoutMs?: number };
export type WorkflowMutate = (path: string, body?: unknown, method?: string, options?: WorkflowRequestOptions & { maxBytes?: number }) => Promise<unknown>;
export type WorkflowGrantRequest = { expectedRevision: number; consent: true; phaseHash: string; maxCalls: number; idempotencyKey: string };
export type WorkflowAdvanceRequest = { expectedRevision: number; modelGrantId?: string };
export type WorkflowApprovalRequest = { expectedRevision: number; approved: boolean; feedback?: string };

const READ_TIMEOUT = 45_000, ADVANCE_TIMEOUT = 120_000;
const TASK_BYTES = 1_100_000, TASKS_BYTES = 16 * 1024 * 1024, RECEIPTS_BYTES = 1_000_000;
function invalid(): never { throw Error('流程请求或回执不匹配，请刷新核对；当前内容已保留。'); }
function options(value: WorkflowRequestOptions | undefined, maxBytes: number, timeoutMs = READ_TIMEOUT): WorkflowRequestOptions & { maxBytes: number } {
  const requested = value?.timeoutMs ?? timeoutMs;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > timeoutMs) invalid();
  return { ...value, timeoutMs: requested, maxBytes };
}
function projectPath(scope: WorkflowScope): string { const checked = parseWorkflowScope(scope); return `/api/projects/${checked.projectId}`; }
function taskPath(scope: WorkflowTaskScope): string { const checked = parseWorkflowScope(scope, true); return `${projectPath(checked)}/agent-tasks/${checked.taskId}`; }
function checkedTaskScope(scope: WorkflowTaskScope): WorkflowTaskScope { return parseWorkflowScope(scope, true) as WorkflowTaskScope; }
function fields(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || ![...required, ...optional].includes(key)) || Object.values(descriptors).some(item => !('value' in item) || !item.enumerable)) invalid();
  return value as Record<string, unknown>;
}
function requireHash(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) invalid(); return value; }

/** Every function performs one request. An unknown POST outcome is reconciled by explicit receipt reads. */
export async function readWorkflowTasks(scope: WorkflowProjectScope, opt?: WorkflowRequestOptions): Promise<WorkflowTask[]> {
  const checked = parseWorkflowScope(scope);
  return parseWorkflowTasks(await hostedRequest(`${projectPath(checked)}/agent-tasks`, options(opt, TASKS_BYTES)), checked);
}
export async function readWorkflowTask(scope: WorkflowTaskScope, opt?: WorkflowRequestOptions): Promise<WorkflowTask> {
  const checked = checkedTaskScope(scope);
  return parseWorkflowTask(await hostedRequest(taskPath(checked), options(opt, TASK_BYTES)), checked);
}
export async function createWorkflowTask(mutate: WorkflowMutate, projectScope: WorkflowProjectScope, body: WorkflowCreateRequest, opt?: WorkflowRequestOptions): Promise<WorkflowTask> {
  const checkedScope = parseWorkflowScope(projectScope), checked = parseWorkflowCreateRequest(body);
  const result = parseWorkflowTask(await mutate(`${projectPath(checkedScope)}/agent-tasks`, checked, 'POST', options(opt, TASK_BYTES)), checkedScope);
  const bindings = result.state.model_bindings;
  if (result.taskType !== checked.taskType || !bindings || bindings.ownerId !== checkedScope.ownerId) invalid();
  for (const [selectedRole, selection] of Object.entries(checked.modelPlan.roles)) {
    for (const step of WORKFLOW_ROLE_STEPS[selectedRole as keyof typeof WORKFLOW_ROLE_STEPS]) {
      const bound = bindings.steps[`${selectedRole}.${step}`];
      if (!selection || bound.serviceId !== selection.serviceId || bound.revision !== selection.revision) invalid();
    }
  }
  return result;
}
/** A 404 is propagated unchanged; it is not proof that a timed-out creation never committed. */
export async function readWorkflowCreation(projectScope: WorkflowProjectScope, key: string, opt?: WorkflowRequestOptions): Promise<WorkflowTask> {
  const checkedScope = parseWorkflowScope(projectScope);
  const result = parseWorkflowTask(await hostedRequest(`${projectPath(checkedScope)}/agent-task-creations/${workflowId(key)}`, options(opt, TASK_BYTES)), checkedScope);
  return result;
}
export async function readWorkflowPhasePreview(scope: WorkflowTaskScope, opt?: WorkflowRequestOptions): Promise<WorkflowPhasePreview> {
  const checked = checkedTaskScope(scope);
  return parseWorkflowPhasePreview(await hostedRequest(`${taskPath(checked)}/model-phase-preview`, options(opt, RECEIPTS_BYTES)), checked);
}
export async function createWorkflowGrant(mutate: WorkflowMutate, scope: WorkflowTaskScope, body: WorkflowGrantRequest, opt?: WorkflowRequestOptions): Promise<WorkflowModelGrant> {
  const checkedScope = checkedTaskScope(scope);
  const row = fields(body, ['expectedRevision', 'consent', 'phaseHash', 'maxCalls', 'idempotencyKey']);
  if (row.consent !== true) invalid();
  const checked: WorkflowGrantRequest = { expectedRevision: workflowRevision(row.expectedRevision), consent: true, phaseHash: requireHash(row.phaseHash), maxCalls: workflowRevision(row.maxCalls, 1, 6), idempotencyKey: workflowId(row.idempotencyKey) };
  const result = parseWorkflowModelGrant(await mutate(`${taskPath(checkedScope)}/model-grants`, checked, 'POST', options(opt, RECEIPTS_BYTES)), checkedScope);
  if (result.id !== checked.idempotencyKey || result.baseRevision !== checked.expectedRevision || result.phaseHash !== checked.phaseHash || result.maxCalls !== checked.maxCalls) invalid();
  return result;
}
export async function readWorkflowGrants(scope: WorkflowTaskScope, opt?: WorkflowRequestOptions): Promise<WorkflowModelGrant[]> {
  const checked = checkedTaskScope(scope);
  return parseWorkflowGrants(await hostedRequest(`${taskPath(checked)}/model-grants`, options(opt, RECEIPTS_BYTES)), checked);
}
export async function revokeWorkflowGrant(mutate: WorkflowMutate, scope: WorkflowTaskScope, grantId: string, opt?: WorkflowRequestOptions): Promise<WorkflowModelGrant> {
  const checkedScope = checkedTaskScope(scope), checkedId = workflowId(grantId);
  const result = parseWorkflowModelGrant(await mutate(`${taskPath(checkedScope)}/model-grants/${checkedId}/revoke`, {}, 'POST', options(opt, RECEIPTS_BYTES)), checkedScope);
  if (result.id !== checkedId || result.status !== 'stopped' || result.stopReason !== 'grant_revoked') invalid();
  return result;
}
export async function advanceWorkflowTask(mutate: WorkflowMutate, scope: WorkflowTaskScope, body: WorkflowAdvanceRequest, opt?: WorkflowRequestOptions): Promise<WorkflowTask> {
  const checkedScope = checkedTaskScope(scope);
  const row = fields(body, ['expectedRevision'], ['modelGrantId']);
  // A missing grant is only useful for the server's no-dispatch completion/input
  // transitions. The backend continues to require consent before model dispatch.
  const checked: WorkflowAdvanceRequest = { expectedRevision: workflowRevision(row.expectedRevision), ...(row.modelGrantId === undefined ? {} : { modelGrantId: workflowId(row.modelGrantId) }) };
  const result = parseWorkflowTask(await mutate(`${taskPath(checkedScope)}/advance`, checked, 'POST', options(opt, TASK_BYTES, ADVANCE_TIMEOUT)), checkedScope);
  if (result.revision < checked.expectedRevision) invalid();
  return result;
}
export async function approveWorkflowTask(mutate: WorkflowMutate, scope: WorkflowTaskScope, body: WorkflowApprovalRequest, opt?: WorkflowRequestOptions): Promise<WorkflowTask> {
  const checkedScope = checkedTaskScope(scope);
  const row = fields(body, ['expectedRevision', 'approved'], ['feedback']);
  if (typeof row.approved !== 'boolean' || (row.feedback !== undefined && (typeof row.feedback !== 'string' || row.feedback.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(row.feedback)))) invalid();
  const checked: WorkflowApprovalRequest = { expectedRevision: workflowRevision(row.expectedRevision), approved: row.approved, ...(row.feedback === undefined ? {} : { feedback: row.feedback as string }) };
  const result = parseWorkflowTask(await mutate(`${taskPath(checkedScope)}/approval`, checked, 'POST', options(opt, TASK_BYTES)), checkedScope);
  if (result.revision < checked.expectedRevision) invalid();
  return result;
}
export async function cancelWorkflowTask(mutate: WorkflowMutate, scope: WorkflowTaskScope, expectedRevision: number, opt?: WorkflowRequestOptions): Promise<WorkflowTask> {
  const checkedScope = checkedTaskScope(scope), checkedRevision = workflowRevision(expectedRevision);
  const result = parseWorkflowTask(await mutate(`${taskPath(checkedScope)}/cancel`, { expectedRevision: checkedRevision }, 'POST', options(opt, TASK_BYTES)), checkedScope);
  if (result.revision < checkedRevision) invalid();
  return result;
}
export async function readWorkflowCalls(scope: WorkflowTaskScope, opt?: WorkflowRequestOptions): Promise<WorkflowModelCall[]> {
  const checked = checkedTaskScope(scope);
  return parseWorkflowCalls(await hostedRequest(`${taskPath(checked)}/model-calls`, options(opt, RECEIPTS_BYTES)), checked);
}
export async function readWorkflowExecutions(scope: WorkflowTaskScope, opt?: WorkflowRequestOptions): Promise<WorkflowExecution[]> {
  const checked = checkedTaskScope(scope);
  return parseWorkflowExecutions(await hostedRequest(`${taskPath(checked)}/executions`, options(opt, RECEIPTS_BYTES)));
}
export async function readWorkflowSurveys(scope: WorkflowProjectScope, opt?: WorkflowRequestOptions): Promise<SurveyRelease[]> {
  const checked = parseWorkflowScope(scope);
  const surveys = parseSurveyList(await hostedRequest(`${projectPath(checked)}/surveys`, options(opt, RECEIPTS_BYTES)));
  if (surveys.some(item => item.projectId !== checked.projectId)) invalid();
  return surveys;
}
export async function provideWorkflowInput(mutate: WorkflowMutate, scope: WorkflowTaskScope,
  body: { expectedRevision: number; releaseId: string }, opt?: WorkflowRequestOptions): Promise<WorkflowTask> {
  const row = fields(body, ['expectedRevision', 'releaseId']);
  const checked = parseWorkflowScope(scope, true), revision = workflowRevision(row.expectedRevision), releaseId = workflowId(row.releaseId);
  const result = parseWorkflowTask(await mutate(`${taskPath(checked as WorkflowTaskScope)}/input`, {
    expectedRevision: revision, artifactRefs: [`survey-release:${releaseId}`],
  }, 'POST', options(opt, TASK_BYTES)), checked);
  if (result.revision <= revision || !result.state.input_artifact_refs.includes(`survey-release:${releaseId}`)) invalid();
  return result;
}
