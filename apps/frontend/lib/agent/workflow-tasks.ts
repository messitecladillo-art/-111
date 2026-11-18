import { parseService, type Service, type ServiceCapability } from '@evix/shared';

export const WORKFLOW_ROLES = ['research', 'survey', 'data', 'writing', 'reviewer'] as const;
export type WorkflowRole = typeof WORKFLOW_ROLES[number];
export const WORKFLOW_ROLE_STEPS = {
  research: ['review_materials', 'design_research', 'assess_feasibility'],
  survey: ['design_variables', 'design_questionnaire', 'design_sampling'],
  data: ['inspect_data', 'clean_data', 'analyze_data'],
  writing: ['outline_report', 'draft_report'],
  reviewer: ['check_evidence', 'check_consistency', 'review_deliverable'],
} as const;
export const WORKFLOW_TASK_ROLES = {
  full_research: ['research', 'survey', 'data', 'writing', 'reviewer'],
  topic_design: ['research', 'reviewer'],
  questionnaire: ['survey', 'reviewer'],
  data_analysis: ['data', 'reviewer'],
  report: ['writing', 'reviewer'],
} as const satisfies Record<string, readonly WorkflowRole[]>;
export type WorkflowTaskKind = keyof typeof WORKFLOW_TASK_ROLES;
export const WORKFLOW_ROLE_CAPABILITIES: Record<WorkflowRole, ServiceCapability> = {
  research: 'research', survey: 'questionnaire', data: 'research', writing: 'report', reviewer: 'report',
};
export const WORKFLOW_PIPELINES: Record<WorkflowTaskKind, readonly WorkflowRole[]> = {
  full_research: ['research', 'reviewer', 'survey', 'reviewer', 'data', 'reviewer', 'writing', 'reviewer'],
  topic_design: ['research', 'reviewer'], questionnaire: ['survey', 'reviewer'],
  data_analysis: ['data', 'reviewer'], report: ['writing', 'reviewer'],
};
export type WorkflowStatus = 'ready' | 'running' | 'needs_input' | 'blocked' | 'completed' | 'failed';
export type WorkflowJson = null | boolean | number | string | WorkflowJson[] | WorkflowJsonObject;
export type WorkflowJsonObject = { [key: string]: WorkflowJson };
export type WorkflowProjectScope = { projectId: string; ownerId: string };
export type WorkflowTaskScope = WorkflowProjectScope & { taskId: string };
export type WorkflowScope = WorkflowProjectScope & { taskId?: string };
export type WorkflowRoleSelections = Partial<Record<WorkflowRole, string>>;
export type WorkflowModelPlan = { schemaVersion: 1; roles: Partial<Record<WorkflowRole, { serviceId: string; revision: number }>> };
export type WorkflowModelBindings = { schemaVersion: 1; ownerId: string; steps: Record<string, { serviceId: string; revision: number; capability: ServiceCapability }> };
export type WorkflowState = {
  task_id: string; project_id: string; task_type: WorkflowTaskKind;
  requirements: WorkflowJsonObject; context: WorkflowJsonObject; input_artifact_refs: string[]; constraints: WorkflowJsonObject;
  status: WorkflowStatus; current_role: WorkflowRole | null; awaiting_approval: string | null;
  retry_count: Partial<Record<WorkflowRole, number>>; max_retries: number; artifact_refs: string[]; evidence_refs: string[];
  unresolved_questions: string[]; errors: string[]; summary: string;
  /** Pipeline position, including backwards movement on REVISE; never an API expectedRevision. */
  revision: number; agent_outputs: Partial<Record<WorkflowRole, WorkflowJsonObject>>; model_bindings?: WorkflowModelBindings;
};
export type WorkflowExecution = {
  id: string; role: WorkflowRole; status: 'running' | 'completed' | 'failed' | 'outcome_unknown' | 'cancelled' | 'discarded';
  inputRevision: number; claimedRevision: number; inputHash: string; resultHash: string | null; errorCode: string | null;
  startedAt: string; leaseExpiresAt: string; finishedAt: string | null;
};
export type WorkflowTask = {
  id: string; projectId: string; taskType: WorkflowTaskKind; status: WorkflowStatus;
  /** API mutation version. It is deliberately independent from state.revision. */
  revision: number; state: WorkflowState; createdAt: string; updatedAt: string; execution?: WorkflowExecution;
};
export type WorkflowPhasePreview = {
  schemaVersion: 1; taskId: string; projectId: string; baseRevision: number; position: number; roles: WorkflowRole[];
  phaseHash: string; inputHash: string; maxCalls: number; maxOutputTokens: number; grantSeconds: number;
  materials: WorkflowJsonObject; steps: Record<string, Service>; instructionHashes: Record<string, string>;
  available: boolean; missingTools: string[];
} & WorkflowDataDisclosure;
export type WorkflowDataset = { ref: string; title: string; status: 'open' | 'closed'; classification: 'actual' | 'synthetic'; rowCount: number; variables: number; sha256: string };
export type WorkflowDataDisclosure = { dataTool?: 'survey-release-aggregates/v1'; datasets?: WorkflowDataset[]; dataDisclosure?: 'aggregate_statistics_only_no_rows_no_open_text' };
export type WorkflowModelGrant = {
  schemaVersion: 1; id: string; ownerId: string; taskId: string; projectId: string;
  status: 'active' | 'stopped' | 'expired' | 'exhausted'; baseRevision: number; position: number; roles: WorkflowRole[];
  phaseHash: string; maxCalls: number; usedCalls: number; maxOutputTokens: number; steps: Record<string, Service>;
  createdAt: string; expiresAt: string; stopReason: string | null;
} & WorkflowDataDisclosure;
export type WorkflowModelCall = {
  schema: 'workflow-model-call/v1'; id: string; taskId: string; projectId: string; executionId: string; step: string;
  status: 'running' | 'completed' | 'failed' | 'outcome_unknown' | 'discarded'; inputRevision: number; inputHash: string;
  consentHash: string; serviceId: string; serviceRevision: number; providerMode: 'fixture' | 'live';
  startedAt: string; finishedAt: string | null; resultHash: string | null;
  usage: { inputTokens: number; outputTokens: number } | null; errorCode: string | null; grantId?: string;
};
export type WorkflowCreateRequest = {
  taskType: WorkflowTaskKind; requirements: WorkflowJsonObject; modelPlan: WorkflowModelPlan; idempotencyKey: string;
  context?: WorkflowJsonObject; inputArtifactRefs?: string[]; constraints?: WorkflowJsonObject;
};

const ERROR = '流程回执格式不匹配，请刷新核对；当前内容已保留。';
const MAX_REVISION = 2_147_483_647;
const STATE_FIELDS = ['task_id', 'project_id', 'task_type', 'requirements', 'context', 'input_artifact_refs', 'constraints', 'status', 'current_role', 'awaiting_approval', 'retry_count', 'max_retries', 'artifact_refs', 'evidence_refs', 'unresolved_questions', 'errors', 'summary', 'revision', 'agent_outputs'];
function bad(): never { throw Error(ERROR); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) bad();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key))) bad();
  if (Object.values(descriptors).some(item => !('value' in item) || !item.enumerable)) bad();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 8000, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) bad();
  // Reject lone surrogates instead of silently changing their UTF-8 representation.
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) bad(); }
    else if (unit >= 0xdc00 && unit <= 0xdfff) bad();
  }
  return value;
}
export function workflowId(value: unknown): string {
  const result = text(value, 36, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(result) || result === '00000000-0000-0000-0000-000000000000') bad();
  return result;
}
export function workflowRevision(value: unknown, min = 0, max = MAX_REVISION): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad();
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[]): T { if (typeof value !== 'string' || !values.includes(value as T)) bad(); return value as T; }
function role(value: unknown): WorkflowRole { return choice(value, WORKFLOW_ROLES); }
function kind(value: unknown): WorkflowTaskKind { return choice(value, Object.keys(WORKFLOW_TASK_ROLES) as WorkflowTaskKind[]); }
function status(value: unknown): WorkflowStatus { return choice(value, ['ready', 'running', 'needs_input', 'blocked', 'completed', 'failed']); }
function hash(value: unknown): string { const result = text(value, 64, 64); if (!/^[a-f0-9]{64}$/u.test(result)) bad(); return result; }
function timestamp(value: unknown): string {
  const result = text(value, 40), match = result.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/u), date = new Date(result);
  if (!match || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== +match[1] || date.getUTCMonth() + 1 !== +match[2] || date.getUTCDate() !== +match[3] || date.getUTCHours() !== +match[4] || date.getUTCMinutes() !== +match[5] || date.getUTCSeconds() !== +match[6]) bad();
  return result;
}
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function list<T>(value: unknown, max: number, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) bad();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key)))) bad();
  for (let i = 0; i < value.length; i++) { const item = Object.getOwnPropertyDescriptor(value, String(i)); if (!item || !('value' in item) || !item.enumerable) bad(); }
  return value.map(parse);
}
function texts(value: unknown, max = 5000, width = 8000): string[] { return list(value, max, item => text(item, width)); }
function boundedJson(value: unknown, maxBytes: number): WorkflowJson {
  let nodes = 0;
  const seen = new Set<object>();
  const copy = (item: unknown, depth: number): WorkflowJson => {
    if (++nodes > 100_000 || depth > 16) bad();
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) bad(); return item; }
    if (typeof item === 'string') return text(item, maxBytes);
    if (!item || typeof item !== 'object' || seen.has(item)) bad();
    seen.add(item);
    let result: WorkflowJson;
    if (Array.isArray(item)) result = list(item, 10_000, child => copy(child, depth + 1));
    else {
      const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(item);
      if (Object.getPrototypeOf(item) !== Object.prototype || keys.length > 10_000 || keys.some(key => typeof key !== 'string')) bad();
      const entries: [string, WorkflowJson][] = [];
      for (const key of keys as string[]) {
        const descriptor = descriptors[key];
        if (!('value' in descriptor) || !descriptor.enumerable) bad();
        entries.push([text(key, 1000), copy(descriptor.value, depth + 1)]);
      }
      result = Object.fromEntries(entries);
    }
    seen.delete(item);
    return result;
  };
  const result = copy(value, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).length > maxBytes) bad();
  return result;
}
function jsonObject(value: unknown, maxBytes = 1_000_000): WorkflowJsonObject {
  const result = boundedJson(value, maxBytes);
  if (result === null || typeof result !== 'object' || Array.isArray(result)) bad();
  return result;
}
function stepKeys(roles: readonly WorkflowRole[]): string[] { return roles.flatMap(value => WORKFLOW_ROLE_STEPS[value].map(step => `${value}.${step}`)); }
function phaseRoles(value: unknown): WorkflowRole[] {
  const roles = list(value, 2, role);
  if (!roles.length || (roles.length === 2 && (roles[0] === 'reviewer' || roles[1] !== 'reviewer'))) bad();
  return roles;
}
function dataDisclosure(row: Record<string, unknown>): WorkflowDataDisclosure {
  if (!['dataTool', 'datasets', 'dataDisclosure'].some(key => key in row)) return {};
  if (row.dataTool !== 'survey-release-aggregates/v1' || row.dataDisclosure !== 'aggregate_statistics_only_no_rows_no_open_text') bad();
  const datasets = list(row.datasets, 5, item => {
    const value = object(item, ['ref', 'title', 'status', 'classification', 'rowCount', 'variables', 'sha256']);
    const ref = text(value.ref, 60); if (!ref.startsWith('survey-release:')) bad(); workflowId(ref.slice(15));
    return { ref, title: text(value.title, 160), status: choice(value.status, ['open', 'closed']), classification: choice(value.classification, ['actual', 'synthetic']),
      rowCount: workflowRevision(value.rowCount, 0, 5000), variables: workflowRevision(value.variables, 0, 500), sha256: hash(value.sha256) };
  });
  if (new Set(datasets.map(item => item.ref)).size !== datasets.length) bad();
  return { dataTool: row.dataTool, dataDisclosure: row.dataDisclosure, datasets };
}
function services(value: unknown, roles: readonly WorkflowRole[]): Record<string, Service> {
  const keys = stepKeys(roles), row = object(value, keys);
  return Object.fromEntries(keys.map(key => {
    const parsed = parseService(row[key]), selectedRole = key.split('.')[0] as WorkflowRole;
    workflowId(parsed.id);
    if (!parsed.capabilities.includes(WORKFLOW_ROLE_CAPABILITIES[selectedRole])) bad();
    return [key, parsed];
  }));
}
function limits(row: Record<string, unknown>, steps: Record<string, Service>): { maxCalls: number; maxOutputTokens: number } {
  const maxCalls = workflowRevision(row.maxCalls, 1, 6), maxOutputTokens = workflowRevision(row.maxOutputTokens, 128, 24_576);
  if (maxCalls !== Object.keys(steps).length || maxOutputTokens !== Object.values(steps).reduce((sum, service) => sum + service.maxOutputTokens, 0)) bad();
  return { maxCalls, maxOutputTokens };
}
export function parseWorkflowScope(value: WorkflowScope, requireTask = false): WorkflowScope {
  const row = object(value, ['projectId', 'ownerId'], ['taskId']);
  return { projectId: workflowId(row.projectId), ownerId: workflowId(row.ownerId), ...(row.taskId === undefined ? (requireTask ? bad() : {}) : { taskId: workflowId(row.taskId) }) };
}
function scoped(projectId: string, taskId: string, scope?: WorkflowScope): void {
  if (!scope) return;
  const expected = parseWorkflowScope(scope);
  if (projectId !== expected.projectId || (expected.taskId !== undefined && taskId !== expected.taskId)) bad();
}
function bindings(value: unknown, taskKind: WorkflowTaskKind): WorkflowModelBindings {
  const row = object(value, ['schemaVersion', 'ownerId', 'steps']);
  if (row.schemaVersion !== 1) bad();
  const keys = stepKeys(WORKFLOW_TASK_ROLES[taskKind]), steps = object(row.steps, keys);
  return { schemaVersion: 1, ownerId: workflowId(row.ownerId), steps: Object.fromEntries(keys.map(key => {
    const item = object(steps[key], ['serviceId', 'revision', 'capability']), required = WORKFLOW_ROLE_CAPABILITIES[key.split('.')[0] as WorkflowRole];
    if (item.capability !== required) bad();
    return [key, { serviceId: workflowId(item.serviceId), revision: workflowRevision(item.revision, 1), capability: required }];
  })) };
}
function state(value: unknown): WorkflowState {
  const row = object(value, STATE_FIELDS, ['model_bindings']), taskKind = kind(row.task_type), roles = WORKFLOW_TASK_ROLES[taskKind];
  // Check the whole checkpoint before selecting fields, then return detached data.
  jsonObject(value);
  const retries = object(row.retry_count, [], roles), outputs = object(row.agent_outputs, [], roles);
  const result: WorkflowState = {
    task_id: workflowId(row.task_id), project_id: workflowId(row.project_id), task_type: taskKind,
    requirements: jsonObject(row.requirements), context: jsonObject(row.context), constraints: jsonObject(row.constraints),
    input_artifact_refs: texts(row.input_artifact_refs, 5000, 512), status: status(row.status), current_role: nullable(row.current_role, item => choice(item, roles)),
    awaiting_approval: nullable(row.awaiting_approval, item => text(item, 80)),
    retry_count: Object.fromEntries(Object.entries(retries).map(([key, count]) => [key, workflowRevision(count)])),
    max_retries: workflowRevision(row.max_retries, 0, 5), artifact_refs: texts(row.artifact_refs, 5000, 512), evidence_refs: texts(row.evidence_refs, 5000, 512),
    unresolved_questions: texts(row.unresolved_questions, 100), errors: texts(row.errors, 5000), summary: text(row.summary),
    revision: workflowRevision(row.revision, 0, WORKFLOW_PIPELINES[taskKind].length),
    agent_outputs: Object.fromEntries(Object.entries(outputs).map(([key, output]) => [key, jsonObject(output, 120_000)])),
    ...(row.model_bindings === undefined ? {} : { model_bindings: bindings(row.model_bindings, taskKind) }),
  };
  return result;
}
export function parseWorkflowExecution(value: unknown): WorkflowExecution {
  const row = object(value, ['id', 'role', 'status', 'inputRevision', 'claimedRevision', 'inputHash', 'resultHash', 'errorCode', 'startedAt', 'leaseExpiresAt', 'finishedAt']);
  const result: WorkflowExecution = {
    id: workflowId(row.id), role: role(row.role), status: choice(row.status, ['running', 'completed', 'failed', 'outcome_unknown', 'cancelled', 'discarded']),
    inputRevision: workflowRevision(row.inputRevision), claimedRevision: workflowRevision(row.claimedRevision, 1), inputHash: hash(row.inputHash), resultHash: nullable(row.resultHash, hash),
    errorCode: nullable(row.errorCode, item => text(item, 100)), startedAt: timestamp(row.startedAt), leaseExpiresAt: timestamp(row.leaseExpiresAt), finishedAt: nullable(row.finishedAt, timestamp),
  };
  if (result.claimedRevision !== result.inputRevision + 1 || Date.parse(result.leaseExpiresAt) < Date.parse(result.startedAt) || (result.finishedAt && Date.parse(result.finishedAt) < Date.parse(result.startedAt))) bad();
  return result;
}
export function parseWorkflowTask(value: unknown, scope?: WorkflowScope): WorkflowTask {
  const row = object(value, ['id', 'projectId', 'taskType', 'status', 'revision', 'state', 'createdAt', 'updatedAt'], ['execution']);
  const result: WorkflowTask = {
    id: workflowId(row.id), projectId: workflowId(row.projectId), taskType: kind(row.taskType), status: status(row.status), revision: workflowRevision(row.revision),
    state: state(row.state), createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt),
    ...(row.execution === undefined ? {} : { execution: parseWorkflowExecution(row.execution) }),
  };
  scoped(result.projectId, result.id, scope);
  if (result.state.task_id !== result.id || result.state.project_id !== result.projectId || result.state.task_type !== result.taskType || result.state.status !== result.status || Date.parse(result.updatedAt) < Date.parse(result.createdAt)) bad();
  if (result.execution && (!(WORKFLOW_TASK_ROLES[result.taskType] as readonly WorkflowRole[]).includes(result.execution.role) || result.execution.claimedRevision > result.revision)) bad();
  return result;
}
function collection<T>(value: unknown, key: string, max: number, parse: (item: unknown) => T, getId: (item: T) => string): T[] {
  const row = object(value, [key]), result = list(row[key], max, parse);
  if (new Set(result.map(getId)).size !== result.length) bad();
  return result;
}
export function parseWorkflowTasks(value: unknown, scope?: WorkflowScope): WorkflowTask[] { return collection(value, 'tasks', 50, item => parseWorkflowTask(item, scope), item => item.id); }
export function parseWorkflowExecutions(value: unknown): WorkflowExecution[] { return collection(value, 'executions', 100, parseWorkflowExecution, item => item.id); }
export function parseWorkflowPhasePreview(value: unknown, scope?: WorkflowScope): WorkflowPhasePreview {
  const row = object(value, ['schemaVersion', 'taskId', 'projectId', 'baseRevision', 'position', 'roles', 'phaseHash', 'inputHash', 'maxCalls', 'maxOutputTokens', 'grantSeconds', 'materials', 'steps', 'instructionHashes', 'available', 'missingTools'], ['dataTool', 'datasets', 'dataDisclosure']);
  if (row.schemaVersion !== 1 || typeof row.available !== 'boolean' || row.grantSeconds !== 1200) bad();
  const roles = phaseRoles(row.roles), steps = services(row.steps, roles), keys = Object.keys(steps), hashes = object(row.instructionHashes, keys);
  const result: WorkflowPhasePreview = {
    schemaVersion: 1, taskId: workflowId(row.taskId), projectId: workflowId(row.projectId), baseRevision: workflowRevision(row.baseRevision), position: workflowRevision(row.position, 0, 7), roles,
    phaseHash: hash(row.phaseHash), inputHash: hash(row.inputHash), ...limits(row, steps), grantSeconds: 1200, materials: jsonObject(row.materials, 100_000), steps,
    instructionHashes: Object.fromEntries(keys.map(key => [key, hash(hashes[key])])), available: row.available, missingTools: texts(row.missingTools, 32, 100), ...dataDisclosure(row),
  };
  scoped(result.projectId, result.taskId, scope);
  if ((result.available && result.missingTools.length) || (!result.available && !result.missingTools.length)) bad();
  return result;
}
export function parseWorkflowModelGrant(value: unknown, scope?: WorkflowScope): WorkflowModelGrant {
  const row = object(value, ['schemaVersion', 'id', 'ownerId', 'taskId', 'projectId', 'status', 'baseRevision', 'position', 'roles', 'phaseHash', 'maxCalls', 'usedCalls', 'maxOutputTokens', 'steps', 'createdAt', 'expiresAt', 'stopReason'], ['dataTool', 'datasets', 'dataDisclosure']);
  if (row.schemaVersion !== 1) bad();
  const roles = phaseRoles(row.roles), steps = services(row.steps, roles), budget = limits(row, steps);
  const result: WorkflowModelGrant = {
    schemaVersion: 1, id: workflowId(row.id), ownerId: workflowId(row.ownerId), taskId: workflowId(row.taskId), projectId: workflowId(row.projectId),
    status: choice(row.status, ['active', 'stopped', 'expired', 'exhausted']), baseRevision: workflowRevision(row.baseRevision), position: workflowRevision(row.position, 0, 7), roles,
    phaseHash: hash(row.phaseHash), ...budget, usedCalls: workflowRevision(row.usedCalls, 0, budget.maxCalls), steps,
    createdAt: timestamp(row.createdAt), expiresAt: timestamp(row.expiresAt), stopReason: nullable(row.stopReason, item => text(item, 100)), ...dataDisclosure(row),
  };
  scoped(result.projectId, result.taskId, scope);
  if (scope && result.ownerId !== parseWorkflowScope(scope).ownerId) bad();
  if (Date.parse(result.expiresAt) <= Date.parse(result.createdAt) || ((result.status === 'active') !== (result.stopReason === null))) bad();
  return result;
}
export function parseWorkflowGrants(value: unknown, scope?: WorkflowScope): WorkflowModelGrant[] { return collection(value, 'grants', 30, item => parseWorkflowModelGrant(item, scope), item => item.id); }
export function parseWorkflowModelCall(value: unknown, scope?: WorkflowScope): WorkflowModelCall {
  const row = object(value, ['schema', 'id', 'taskId', 'projectId', 'executionId', 'step', 'status', 'inputRevision', 'inputHash', 'consentHash', 'serviceId', 'serviceRevision', 'providerMode', 'startedAt', 'finishedAt', 'resultHash', 'usage', 'errorCode'], ['grantId']);
  if (row.schema !== 'workflow-model-call/v1') bad();
  const step = text(row.step, 80);
  if (!stepKeys(WORKFLOW_ROLES).includes(step)) bad();
  const result: WorkflowModelCall = {
    schema: 'workflow-model-call/v1', id: workflowId(row.id), taskId: workflowId(row.taskId), projectId: workflowId(row.projectId), executionId: workflowId(row.executionId), step,
    status: choice(row.status, ['running', 'completed', 'failed', 'outcome_unknown', 'discarded']), inputRevision: workflowRevision(row.inputRevision), inputHash: hash(row.inputHash), consentHash: hash(row.consentHash),
    serviceId: workflowId(row.serviceId), serviceRevision: workflowRevision(row.serviceRevision, 1), providerMode: choice(row.providerMode, ['fixture', 'live']),
    startedAt: timestamp(row.startedAt), finishedAt: nullable(row.finishedAt, timestamp), resultHash: nullable(row.resultHash, hash), errorCode: nullable(row.errorCode, item => text(item, 100)),
    usage: nullable(row.usage, item => { const usage = object(item, ['inputTokens', 'outputTokens']); return { inputTokens: workflowRevision(usage.inputTokens, 0, 10_000_000), outputTokens: workflowRevision(usage.outputTokens, 0, 10_000_000) }; }),
    ...(row.grantId === undefined ? {} : { grantId: workflowId(row.grantId) }),
  };
  scoped(result.projectId, result.taskId, scope);
  if (result.finishedAt && Date.parse(result.finishedAt) < Date.parse(result.startedAt)) bad();
  return result;
}
export function parseWorkflowCalls(value: unknown, scope?: WorkflowScope): WorkflowModelCall[] { return collection(value, 'calls', 100, item => parseWorkflowModelCall(item, scope), item => item.id); }

/** Run-specific role choices are intentionally separate from the legacy six call defaults. */
export function makeWorkflowModelPlan(taskKind: WorkflowTaskKind, selections: WorkflowRoleSelections, availableServices: readonly Service[]): WorkflowModelPlan {
  const task = kind(taskKind), selected = object(selections, [], WORKFLOW_ROLES), roles = WORKFLOW_TASK_ROLES[task];
  const supplied = list([...availableServices], 1000, value => { const service = parseService(value); workflowId(service.id); return service; });
  if (new Set(supplied.map(service => service.id)).size !== supplied.length) bad();
  const result: WorkflowModelPlan = { schemaVersion: 1, roles: {} };
  for (const selectedRole of roles) {
    const id = workflowId(selected[selectedRole]), service = supplied.find(item => item.id === id);
    if (!service || !service.capabilities.includes(WORKFLOW_ROLE_CAPABILITIES[selectedRole])) bad();
    result.roles[selectedRole] = { serviceId: id, revision: service.revision };
  }
  return result;
}

export function parseWorkflowCreateRequest(value: unknown): WorkflowCreateRequest {
  const row = object(value, ['taskType', 'requirements', 'modelPlan', 'idempotencyKey'], ['context', 'inputArtifactRefs', 'constraints']), taskKind = kind(row.taskType);
  const plan = object(row.modelPlan, ['schemaVersion', 'roles']);
  if (plan.schemaVersion !== 1) bad();
  const selected = object(plan.roles, WORKFLOW_TASK_ROLES[taskKind]);
  const modelPlan: WorkflowModelPlan = { schemaVersion: 1, roles: Object.fromEntries(Object.entries(selected).map(([key, value]) => {
    const item = object(value, ['serviceId', 'revision']);
    return [key, { serviceId: workflowId(item.serviceId), revision: workflowRevision(item.revision, 1) }];
  })) };
  const result: WorkflowCreateRequest = {
    taskType: taskKind, requirements: jsonObject(row.requirements, 100_000), modelPlan, idempotencyKey: workflowId(row.idempotencyKey),
    ...(row.context === undefined ? {} : { context: jsonObject(row.context, 100_000) }),
    ...(row.constraints === undefined ? {} : { constraints: jsonObject(row.constraints, 100_000) }),
    ...(row.inputArtifactRefs === undefined ? {} : { inputArtifactRefs: texts(row.inputArtifactRefs, 100, 512) }),
  };
  jsonObject(result, 100_000);
  return result;
}
