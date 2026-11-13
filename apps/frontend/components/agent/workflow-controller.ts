import type { Service } from '@evix/shared';
import { makeWorkflowModelPlan, workflowId, WORKFLOW_PIPELINES, WORKFLOW_ROLES, WORKFLOW_ROLE_CAPABILITIES,
  type WorkflowTask, type WorkflowRole, type WorkflowRoleSelections, type WorkflowModelGrant,
  type WorkflowPhasePreview, type WorkflowModelCall, type WorkflowProjectScope } from '@/lib/agent/workflow-tasks';
import * as transport from './workflow-client';

export type WorkflowSnapshot = {
  task: WorkflowTask | null; phasePreview: WorkflowPhasePreview | null; grant: WorkflowModelGrant | null;
  calls: WorkflowModelCall[]; roleSelections: WorkflowRoleSelections;
  busy: boolean; loading: boolean; error: string; reconciling: boolean; restored: boolean;
};
type Locator = { taskId: string | null; creationKey: string | null; grantKey: string | null; selections: WorkflowRoleSelections };
export type WorkflowControllerOptions = {
  scope: WorkflowProjectScope; mutate: transport.WorkflowMutate; current: () => boolean;
  services: () => readonly Service[]; defaultServiceId: () => string | null;
  inputCurrent?: (task: WorkflowTask) => boolean;
  storage: Pick<Storage, 'getItem' | 'setItem'>; onChange: (snapshot: WorkflowSnapshot) => void;
  onTask?: (task: WorkflowTask) => void; client?: typeof transport;
};
const emptyLocator = (): Locator => ({ taskId: null, creationKey: null, grantKey: null, selections: {} });
const message = (reason: unknown) => reason instanceof Error ? reason.message : '操作未完成，请核对回执。';
const unknown = (task: WorkflowTask, calls: WorkflowModelCall[]) => task.execution?.status === 'outcome_unknown'
  || calls.some(call => call.status === 'outcome_unknown');
const knownRejection = (reason: unknown) => typeof reason === 'object' && reason !== null && 'status' in reason
  && typeof reason.status === 'number' && reason.status >= 400 && reason.status < 500
  && !('code' in reason && reason.code === 'invalid_server_receipt');

/** Maps the existing team form to the model's reviewed, string-only source whitelist. */
export function workflowResearchInput(goal: string, profile: Record<string, string | number | null> = {}) {
  const allowed = ['region', 'city', 'school', 'days', 'budgetYuan'];
  if (Object.keys(profile).some(key => !allowed.includes(key)) || Object.values(profile).some(value =>
    value !== null && (typeof value === 'number' ? !Number.isFinite(value) || value < 0 : typeof value !== 'string' || value.length > 200))) throw Error('研究设置不完整，请重新核对。');
  const geography = [...new Set([profile.region, profile.city].filter(value => typeof value === 'string' && value))].join(' · ');
  const notes = [profile.school ? `学校：${profile.school}` : '', profile.days === null || profile.days === undefined ? '' : `可用时间：${profile.days}天`,
    profile.budgetYuan === null || profile.budgetYuan === undefined ? '' : `经费：${profile.budgetYuan}元`].filter(Boolean).join('；');
  return { requirements: { goal: goal.trim(), ...(geography ? { geography } : {}) }, constraints: notes ? { notes } : {} };
}

/** Owns one mounted account/project. Restoring or polling can only READ; fee calls require a user action. */
export function createWorkflowController(options: WorkflowControllerOptions) {
  const client = options.client ?? transport, scope = { ...options.scope };
  const storageKey = `evix.workflow-execution.v1:${scope.ownerId}:${scope.projectId}`;
  let locator = emptyLocator(), closed = false, operation = 0, reading = 0;
  let snapshot: WorkflowSnapshot = { task: null, phasePreview: null, grant: null, calls: [], roleSelections: {},
    busy: false, loading: true, error: '', reconciling: false, restored: false };
  const live = () => !closed && options.current();
  const requests = new Set<AbortController>();
  function request() { const controller = new AbortController(); requests.add(controller); return controller; }
  function publish(change: Partial<WorkflowSnapshot>) {
    if (!live()) return;
    snapshot = { ...snapshot, ...change }; options.onChange(snapshot);
  }
  function persist() {
    if (!live()) throw Error('账户或项目已变化。');
    // Persist only locators and service IDs. Raw material, keys and consent are never stored here.
    options.storage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, ...locator }));
  }
  function adopt(task: WorkflowTask) {
    if (!live() || task.projectId !== scope.projectId || locator.taskId && task.id !== locator.taskId) return false;
    if (snapshot.task?.id === task.id && task.revision < snapshot.task.revision) return false;
    locator.taskId = task.id;
    publish({ task }); options.onTask?.(task); return true;
  }
  const taskScope = () => { if (!locator.taskId) throw Error('请先建立研究任务。'); return { ...scope, taskId: locator.taskId }; };
  const owns = (task = snapshot.task) => !!task && task.state.model_bindings?.ownerId === scope.ownerId;
  const inputCurrent = (task: WorkflowTask) => options.inputCurrent?.(task) !== false;
  const mutable = () => { if (!live() || snapshot.busy || snapshot.loading || snapshot.reconciling) return false; return true; };
  async function details(task: WorkflowTask, signal: AbortSignal) {
    const readEpoch = reading, mutationEpoch = operation;
    const valid = () => live() && reading === readEpoch && operation === mutationEpoch && snapshot.task?.id === task.id && snapshot.task.revision <= task.revision;
    if (!owns(task)) { publish({ phasePreview: null, calls: [], grant: null }); return; }
    const selected = { ...scope, taskId: task.id };
    const [calls, grants] = await Promise.all([client.readWorkflowCalls(selected, { signal }), client.readWorkflowGrants(selected, { signal })]);
    if (!valid()) return;
    const grant = locator.grantKey ? grants.find(item => item.id === locator.grantKey) ?? null : grants[0] ?? null;
    if (locator.grantKey && !grant) {
      publish({ calls, grant: null, reconciling: true, error: '授权回执尚未找到，请稍后再核对。' }); return;
    }
    publish({ calls, grant, reconciling: false, phasePreview: null });
    const position = task.state.revision, pipeline = WORKFLOW_PIPELINES[task.taskType];
    if (task.status === 'ready' && position < pipeline.length && !unknown(task, calls)) {
      const preview = await client.readWorkflowPhasePreview(selected, { signal });
      if (valid() && snapshot.task?.revision === preview.baseRevision) publish({ phasePreview: preview });
    }
  }
  async function refresh(restoring = false) {
    if (!live()) return;
    const attempt = ++reading, controller = request();
    try {
      let task: WorkflowTask | null = null;
      if (locator.creationKey) {
        task = await client.readWorkflowCreation(scope, locator.creationKey, { signal: controller.signal });
        if (!live() || attempt !== reading) return;
        locator.creationKey = null; locator.taskId = task.id; persist();
      } else if (locator.taskId) task = await client.readWorkflowTask(taskScope(), { signal: controller.signal });
      else if (restoring) {
        const tasks = await client.readWorkflowTasks(scope, { signal: controller.signal });
        task = tasks.find(item => item.state.model_bindings?.ownerId === scope.ownerId) ?? null;
      }
      if (!live() || attempt !== reading) return;
      if (task && adopt(task)) { persist(); publish({ restored: restoring || snapshot.restored, error: '' }); await details(task, controller.signal); }
      else publish({ reconciling: false });
    } catch (reason) {
      if (live() && attempt === reading) publish({ error: locator.creationKey ? '创建回执尚未核实，请保留当前页面并稍后核对。' : message(reason), reconciling: !!locator.creationKey || !!locator.grantKey || snapshot.reconciling });
    } finally {
      requests.delete(controller);
      if (live() && attempt === reading) publish({ loading: false });
    }
  }
  async function restore() {
    try {
      const raw = options.storage.getItem(storageKey);
      if (raw) {
        if (raw.length > 8000) throw Error('流程恢复记录过大，请保留浏览器数据。');
        const value = JSON.parse(raw);
        if (value.schemaVersion !== 1 || !value.selections || typeof value.selections !== 'object') throw Error('流程恢复记录无法读取，请保留浏览器数据。');
        locator = { taskId: value.taskId === null ? null : workflowId(value.taskId), creationKey: value.creationKey === null ? null : workflowId(value.creationKey),
          grantKey: value.grantKey === null ? null : workflowId(value.grantKey), selections: {} };
        for (const role of WORKFLOW_ROLES) if (value.selections[role]) locator.selections[role] = workflowId(value.selections[role]);
      } else {
        const chosen = options.services().find(item => item.id === options.defaultServiceId());
        for (const role of WORKFLOW_ROLES) if (chosen?.capabilities.includes(WORKFLOW_ROLE_CAPABILITIES[role])) locator.selections[role] = chosen.id;
      }
      publish({ roleSelections: { ...locator.selections } });
      await refresh(true);
    } catch (reason) { publish({ loading: false, reconciling: true, error: message(reason) }); }
  }
  async function start(goal: string, context: Record<string, string | number | null> = {}) {
    if (!mutable()) return;
    if (locator.taskId || locator.creationKey) { publish({ error: '当前研究已保留，请先查看成果，或选择另建研究。' }); return; }
    const ticket = ++operation, controller = request(); reading++;
    publish({ busy: true, error: '', restored: false });
    let sent = false;
    try {
      const modelPlan = makeWorkflowModelPlan('full_research', snapshot.roleSelections, options.services());
      if (!goal.trim() || goal.length > 2000) throw Error('请填写研究方向。');
      const input = workflowResearchInput(goal, context);
      locator.creationKey = crypto.randomUUID(); persist(); sent = true;
      const task = await client.createWorkflowTask(options.mutate, scope, { taskType: 'full_research', ...input, modelPlan, idempotencyKey: locator.creationKey }, { signal: controller.signal });
      if (!live() || ticket !== operation) return;
      locator.creationKey = null; adopt(task); persist(); await details(task, controller.signal);
    } catch (reason) {
      if (live() && ticket === operation) {
        if (!sent || knownRejection(reason)) {
          locator.creationKey = null;
          if (sent) try { persist(); } catch { /* Surface the original rejection; never dispatch again. */ }
        }
        publish({ error: message(reason), reconciling: sent && !knownRejection(reason) });
      }
    } finally { requests.delete(controller); if (live() && ticket === operation) publish({ busy: false }); }
  }
  async function drive(grant: WorkflowModelGrant, ticket: number, controller: AbortController) {
    for (let count = 0; count < grant.roles.length; count++) {
      const task = snapshot.task;
      if (!live() || ticket !== operation || !task || task.status !== 'ready' || !owns(task) || unknown(task, snapshot.calls)
          || !inputCurrent(task)
          || snapshot.grant?.status !== 'active' || task.state.revision < grant.position || task.state.revision >= grant.position + grant.roles.length) return;
      const previousPosition = task.state.revision;
      const result = await client.advanceWorkflowTask(options.mutate, taskScope(), { expectedRevision: task.revision, modelGrantId: grant.id }, { signal: controller.signal });
      if (!live() || ticket !== operation) return;
      adopt(result); await details(result, controller.signal);
      if (result.state.revision <= previousPosition) return;
    }
  }
  async function execute(authorize: boolean) {
    if (!mutable() || !owns() || snapshot.task?.status !== 'ready' || !inputCurrent(snapshot.task) || unknown(snapshot.task, snapshot.calls)) return;
    const ticket = ++operation, controller = request(); reading++;
    const previousGrantKey = locator.grantKey;
    let awaitingGrantReceipt = false;
    publish({ busy: true, error: '', restored: false });
    try {
      let grant = snapshot.grant;
      if (authorize) {
        const phase = snapshot.phasePreview;
        if (!phase?.available || phase.baseRevision !== snapshot.task!.revision || grant?.status === 'active') throw Error('请先核对当前阶段与模型分工。');
        locator.grantKey = crypto.randomUUID(); persist(); awaitingGrantReceipt = true;
        grant = await client.createWorkflowGrant(options.mutate, taskScope(), { expectedRevision: phase.baseRevision, consent: true, phaseHash: phase.phaseHash, maxCalls: phase.maxCalls, idempotencyKey: locator.grantKey }, { signal: controller.signal });
        if (!live() || ticket !== operation) return;
        awaitingGrantReceipt = false;
        publish({ grant });
      }
      if (grant?.status !== 'active') throw Error('本轮授权已停止，请先核对回执。');
      await drive(grant, ticket, controller);
    } catch (reason) {
      if (live() && ticket === operation) {
        if (awaitingGrantReceipt && knownRejection(reason)) { locator.grantKey = previousGrantKey; try { persist(); } catch { /* Keep local task; no new request. */ } }
        publish({ error: message(reason), reconciling: !knownRejection(reason) });
      }
    } finally { requests.delete(controller); if (live() && ticket === operation) publish({ busy: false }); }
  }
  async function decide(approved: boolean, feedback?: string) {
    if (!mutable() || snapshot.task?.status !== 'needs_input' || !inputCurrent(snapshot.task)) return;
    const awaiting = snapshot.task.state.awaiting_approval;
    if (!awaiting?.startsWith('approve_') && awaiting !== 'agent_input') return;
    if ((!approved || awaiting === 'agent_input') && !feedback?.trim()) { publish({ error: '请填写需要补充或修改的内容。' }); return; }
    const ticket = ++operation, controller = request(); reading++; publish({ busy: true, error: '' });
    try {
      let task = await client.approveWorkflowTask(options.mutate, taskScope(), { expectedRevision: snapshot.task.revision, approved, ...(feedback ? { feedback } : {}) }, { signal: controller.signal });
      if (!live() || ticket !== operation) return;
      adopt(task);
      // Completing a pipeline is a server transition with no model handler or fee.
      if (task.status === 'ready' && (task.state.revision === WORKFLOW_PIPELINES[task.taskType].length
          || WORKFLOW_PIPELINES[task.taskType][task.state.revision] === 'data' && !task.state.input_artifact_refs.length)) {
        task = await client.advanceWorkflowTask(options.mutate, taskScope(), { expectedRevision: task.revision }, { signal: controller.signal });
        if (!live() || ticket !== operation) return;
        adopt(task);
      }
      locator.grantKey = null; persist(); publish({ grant: null }); await details(task, controller.signal);
    } catch (reason) { if (live() && ticket === operation) publish({ error: message(reason), reconciling: !knownRejection(reason) }); }
    finally { requests.delete(controller); if (live() && ticket === operation) publish({ busy: false }); }
  }
  async function stop() {
    if (!live() || !locator.taskId) return;
    // Fence this tab immediately; durable revocation also stops other tabs.
    const ticket = ++operation, controller = request(); reading++; publish({ busy: true, error: '' });
    try {
      const grantIds = [...new Set([locator.grantKey, snapshot.grant?.id].filter((id): id is string => !!id))];
      for (const grantId of grantIds) {
        const grant = await client.revokeWorkflowGrant(options.mutate, taskScope(), grantId, { signal: controller.signal });
        if (!live() || ticket !== operation) return; publish({ grant });
      }
      let task = await client.readWorkflowTask(taskScope(), { signal: controller.signal });
      if (!live() || ticket !== operation) return;
      if (task.status === 'running') task = await client.cancelWorkflowTask(options.mutate, taskScope(), task.revision, { signal: controller.signal });
      if (!live() || ticket !== operation) return;
      adopt(task); await details(task, controller.signal);
    } catch (reason) { if (live() && ticket === operation) publish({ error: message(reason), reconciling: true }); }
    finally { requests.delete(controller); if (live() && ticket === operation) publish({ busy: false }); }
  }
  return {
    restore, refresh: () => refresh(), start, authorize: () => execute(true), resume: () => execute(false),
    approve: () => decide(true), revise: (feedback: string) => decide(false, feedback), stop,
    select(role: WorkflowRole, id: string | null) {
      if (!mutable() || locator.creationKey) return;
      try {
        if (id) locator.selections[role] = workflowId(id); else delete locator.selections[role];
        persist(); publish({ roleSelections: { ...locator.selections }, error: '' });
      } catch (reason) { publish({ error: message(reason) }); }
    },
    newTask() {
      if (!mutable() || locator.creationKey || snapshot.grant?.status === 'active' || snapshot.task?.status === 'running') return;
      const previous = locator;
      try {
        locator = { ...emptyLocator(), selections: locator.selections }; persist();
        operation++; reading++; publish({ task: null, grant: null, phasePreview: null, calls: [], error: '', restored: false });
      } catch (reason) { locator = previous; publish({ error: message(reason) }); }
    },
    close() { closed = true; operation++; reading++; for (const controller of requests) controller.abort(); requests.clear(); },
    getSnapshot: () => snapshot,
  };
}
