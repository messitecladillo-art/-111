'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Service } from '@evix/shared';
import { errorMessage, hostedRequest } from '@/components/hosted/api-client';
import { useHostedSession } from '@/components/hosted/HostedSession';
import {
  getServerStageModelPreferences,
  getStageModelPreferences,
  subscribeModelPreferences,
} from '@/lib/agent/model-routing';
import type { LiteratureStudy } from '@/lib/agent/literature-study';
import {
  advanceAgentTask,
  approveAgentTask,
  buildTaskPayloadFromWorkspace,
  buildWorkflowModelPlan,
  cancelAgentTask,
  classifyWorkflowGate,
  createAgentTask,
  getAgentTask,
  getModelCalls,
  getModelPreview,
  listAgentTasks,
  listProjectSurveys,
  provideTaskInput,
  ROLE_META,
  TASK_TYPE_META,
  WORKFLOW_ROLES,
  WORKFLOW_TASK_TYPES,
  workflowStageProgress,
  type WorkflowModelCallReceipt,
  type WorkflowModelPreview,
  type WorkflowRole,
  type WorkflowTaskRecord,
  type WorkflowTaskType,
  type WorkflowTransport,
} from '@/lib/agent/workflow-task-client';
import type { SurveyRelease } from '@/lib/survey-collection';
import type { TopicResearchBrief, TopicSelection } from '@/lib/topic-project';
import type { ReportWorkState } from '@/lib/agent/report-work';
import styles from './WorkflowTaskPanel.module.css';

export type WorkflowTaskPanelProps = {
  owner: string | null;
  projectId: string | null;
  identityEpoch: number;
  services: Service[];
  defaultServiceId?: string | null;
  direction: string;
  brief?: TopicResearchBrief | null;
  selected?: TopicSelection | null;
  literatureStudy?: LiteratureStudy | null;
  disabled?: boolean;
  onOpenSettings?: () => void;
  onAdoptOutput?: (role: WorkflowRole, output: Record<string, unknown>, task: WorkflowTaskRecord) => void;
  onWorkStateChange?: (state: ReportWorkState | null) => void;
};

const STATUS_LABEL: Record<WorkflowTaskRecord['status'], string> = {
  ready: '就绪',
  running: '推进中',
  needs_input: '待确认',
  blocked: '已阻塞',
  completed: '已完成',
  failed: '已中止',
};

const STATE_LABEL: Record<'done' | 'active' | 'waiting' | 'blocked', string> = {
  done: '已完成',
  active: '当前环节',
  waiting: '等待中',
  blocked: '待处理',
};

function shortHash(value: string | null | undefined): string {
  return value ? value.slice(0, 12) : '—';
}

export default function WorkflowTaskPanel(props: WorkflowTaskPanelProps) {
  const scopeKey = `${props.owner ?? ''}|${props.identityEpoch}|${props.projectId ?? ''}`;
  return <WorkflowTaskPanelInner key={scopeKey} {...props} />;
}

function WorkflowTaskPanelInner(props: WorkflowTaskPanelProps) {
  const { owner, projectId, identityEpoch, services, defaultServiceId, direction, brief, selected, literatureStudy, disabled, onOpenSettings, onAdoptOutput, onWorkStateChange } = props;
  const { session, mutate, isCurrentAccount } = useHostedSession();

  const prefSnapshot = useCallback(() => getStageModelPreferences(owner), [owner]);
  const preferences = useSyncExternalStore(subscribeModelPreferences, prefSnapshot, getServerStageModelPreferences);

  const [taskType, setTaskType] = useState<WorkflowTaskType>('full_research');
  const [tasks, setTasks] = useState<WorkflowTaskRecord[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<{ taskId: string; revision: number; data: WorkflowModelPreview } | null>(null);
  const [callsEntry, setCallsEntry] = useState<{ taskId: string; items: WorkflowModelCallReceipt[] }>({ taskId: '', items: [] });
  const [surveys, setSurveys] = useState<SurveyRelease[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [initialSettled, setInitialSettled] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const alive = useRef(true);
  const scopeEpoch = useRef(0);

  const authenticated = !!owner && owner !== 'guest' && !!session?.authenticated && !!projectId;
  const loading = manualLoading || (authenticated && !initialSettled);
  const scopeCheck = useCallback(() => alive.current && !!owner && isCurrentAccount(owner, identityEpoch), [owner, identityEpoch, isCurrentAccount]);

  const transport = useMemo<WorkflowTransport>(() => ({
    request: hostedRequest,
    mutate,
  }), [mutate]);

  const planResult = useMemo(
    () => buildWorkflowModelPlan(taskType, services, preferences, defaultServiceId),
    [taskType, services, preferences, defaultServiceId],
  );

  const activeTask = useMemo(
    () => tasks.find(item => item.id === activeTaskId) ?? tasks[0] ?? null,
    [tasks, activeTaskId],
  );

  useEffect(() => {
    if (!onWorkStateChange) return;
    if (!authenticated || !activeTask || (!busy && activeTask.status !== 'running')) {
      onWorkStateChange(null);
      return;
    }
    const progress = workflowStageProgress(activeTask);
    const doneCount = progress.filter(item => item.state === 'done').length;
    const roleKey = activeTask.state.current_role ?? null;
    const roleLabel = roleKey ? (ROLE_META[roleKey]?.label ?? roleKey) : '协同流水线';
    const phase: ReportWorkState['phase'] = roleKey === 'writing'
      ? 'writing'
      : roleKey === 'reviewer'
        ? 'reviewing'
        : 'preparing';
    onWorkStateChange({
      phase,
      completed: doneCount,
      total: progress.length,
      detail: `全自动协同 · ${roleLabel}`,
    });
    return () => onWorkStateChange(null);
  }, [authenticated, activeTask, busy, onWorkStateChange]);

  const preview = useMemo(
    () =>
      previewEntry && activeTask && previewEntry.taskId === activeTask.id && previewEntry.revision === activeTask.revision
        ? previewEntry.data
        : null,
    [previewEntry, activeTask],
  );

  const calls = useMemo(
    () => (activeTask && callsEntry.taskId === activeTask.id ? callsEntry.items : []),
    [callsEntry, activeTask],
  );

  const gate = useMemo(
    () => (activeTask ? classifyWorkflowGate(activeTask) : null),
    [activeTask],
  );

  const upsertTask = useCallback((record: WorkflowTaskRecord) => {
    setTasks(prev => {
      const exists = prev.some(item => item.id === record.id);
      return exists ? prev.map(item => (item.id === record.id ? record : item)) : [record, ...prev];
    });
    setActiveTaskId(record.id);
  }, []);

  const refreshCalls = useCallback(async (taskId: string) => {
    if (!authenticated || !projectId) return;
    const epoch = scopeEpoch.current;
    try {
      const list = await getModelCalls(transport, projectId, taskId);
      if (scopeCheck() && epoch === scopeEpoch.current) setCallsEntry({ taskId, items: list });
    } catch {
      /* Calling getModelCalls on new tasks is informational; errors surface on explicit inspection. */
    }
  }, [authenticated, projectId, transport, scopeCheck]);

  const refreshSurveys = useCallback(async () => {
    if (!authenticated || !projectId) return;
    const epoch = scopeEpoch.current;
    try {
      const list = await listProjectSurveys(transport, projectId);
      if (!scopeCheck() || epoch !== scopeEpoch.current) return;
      setSurveys(list);
      const preferred = list.find(item => item.responseCount > 0) ?? list[0];
      if (preferred) setSelectedSurveyId(prev => (list.some(s => s.id === prev) ? prev : preferred.id));
    } catch (reason) {
      if (scopeCheck() && epoch === scopeEpoch.current) setError(errorMessage(reason));
    }
  }, [authenticated, projectId, transport, scopeCheck]);

  const loadTasks = useCallback(async () => {
    if (!authenticated || !projectId) return;
    const epoch = ++scopeEpoch.current;
    setManualLoading(true);
    setError('');
    try {
      const list = await listAgentTasks(transport, projectId);
      if (!scopeCheck() || epoch !== scopeEpoch.current) return;
      setTasks(list);
      setActiveTaskId(prev => (prev && list.some(item => item.id === prev) ? prev : list[0]?.id ?? null));
    } catch (reason) {
      if (scopeCheck() && epoch === scopeEpoch.current) setError(errorMessage(reason));
    } finally {
      if (scopeCheck() && epoch === scopeEpoch.current) {
        setManualLoading(false);
        setInitialSettled(true);
      }
    }
  }, [authenticated, projectId, transport, scopeCheck]);

  useEffect(() => {
    alive.current = true;
    const epochCounter = scopeEpoch;
    if (!authenticated || !projectId) {
      return () => {
        alive.current = false;
        epochCounter.current++;
      };
    }
    const epoch = ++epochCounter.current;
    let active = true;
    listAgentTasks(transport, projectId)
      .then(list => {
        if (!active || !scopeCheck() || epoch !== epochCounter.current) return;
        setTasks(list);
        setActiveTaskId(prev => (prev && list.some(item => item.id === prev) ? prev : list[0]?.id ?? null));
      })
      .catch(reason => {
        if (active && scopeCheck() && epoch === epochCounter.current) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active && scopeCheck() && epoch === epochCounter.current) setInitialSettled(true);
      });
    return () => {
      active = false;
      alive.current = false;
      epochCounter.current++;
    };
  }, [authenticated, projectId, transport, scopeCheck]);

  const selectedTaskId = activeTask?.id ?? null;
  const selectedGateKind = gate?.kind ?? null;

  useEffect(() => {
    if (!authenticated || !projectId || !selectedTaskId) return;
    let active = true;
    const epoch = scopeEpoch.current;
    getModelCalls(transport, projectId, selectedTaskId)
      .then(list => {
        if (active && scopeCheck() && epoch === scopeEpoch.current) {
          setCallsEntry({ taskId: selectedTaskId, items: list });
        }
      })
      .catch(() => {
        /* Calling getModelCalls on new tasks is informational; errors surface on explicit inspection. */
      });
    if (selectedGateKind === 'upload_real_data') {
      listProjectSurveys(transport, projectId)
        .then(list => {
          if (!active || !scopeCheck() || epoch !== scopeEpoch.current) return;
          setSurveys(list);
          const preferred = list.find(item => item.responseCount > 0) ?? list[0];
          if (preferred) setSelectedSurveyId(prev => (list.some(s => s.id === prev) ? prev : preferred.id));
        })
        .catch(reason => {
          if (active && scopeCheck() && epoch === scopeEpoch.current) setError(errorMessage(reason));
        });
    }
    return () => {
      active = false;
    };
  }, [authenticated, projectId, selectedTaskId, selectedGateKind, transport, scopeCheck]);

  async function runAction(label: string, action: () => Promise<void>) {
    if (busy || disabled || !authenticated || !projectId) return;
    const epoch = scopeEpoch.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (reason) {
      if (scopeCheck() && epoch === scopeEpoch.current) setError(`${label}：${errorMessage(reason)}`);
    } finally {
      if (scopeCheck() && epoch === scopeEpoch.current) setBusy(false);
    }
  }

  async function handleCreate() {
    if (!planResult.ok) return;
    await runAction('创建协同任务', async () => {
      const payload = buildTaskPayloadFromWorkspace({
        taskType,
        direction,
        brief,
        selected,
        literatureStudy,
        modelPlan: planResult.plan,
      });
      const created = await createAgentTask(transport, projectId!, payload);
      upsertTask(created);
      setNotice('协同任务已创建，可先预览下一步的模型调用范围再推进。');
      try {
        const nextPreview = await getModelPreview(transport, projectId!, created.id);
        setPreviewEntry({ taskId: created.id, revision: created.revision, data: nextPreview });
      } catch {
        /* Preview can be requested manually if task starts on a gate. */
      }
    });
  }

  async function handlePreview(task: WorkflowTaskRecord) {
    await runAction('读取调用预览', async () => {
      const result = await getModelPreview(transport, projectId!, task.id);
      setPreviewEntry({ taskId: task.id, revision: task.revision, data: result });
    });
  }

  async function handleAdvance(task: WorkflowTaskRecord, withConsent: boolean) {
    await runAction('推进当前阶段', async () => {
      if (withConsent && (!preview || preview.inputRevision !== task.revision)) {
        setError('任务版本已变化，请重新读取当前步骤的模型调用预览。');
        return;
      }
      const next = await advanceAgentTask(transport, projectId!, task.id, {
        expectedRevision: task.revision,
        ...(withConsent && preview
          ? { modelConsent: { accepted: true, previewHash: preview.previewHash, maxCalls: preview.maxCalls } }
          : {}),
      });
      setPreviewEntry(null);
      upsertTask(next);
      await refreshCalls(next.id);
      const writingOutput = next.state.agent_outputs?.writing;
      const deliverable = (writingOutput?.deliverable ?? {}) as { chapters?: unknown[] };
      if (
        writingOutput
        && !task.state.agent_outputs?.writing
        && Array.isArray(deliverable.chapters)
        && deliverable.chapters.length > 0
      ) {
        onAdoptOutput?.('writing', writingOutput, next);
      }
      setNotice(`已推进到修订 v${next.revision}（状态：${STATUS_LABEL[next.status]}）。`);
    });
  }

  async function handleApprove(task: WorkflowTaskRecord, approved: boolean) {
    await runAction(approved ? '确认放行阶段成果' : '退回修改', async () => {
      const next = await approveAgentTask(transport, projectId!, task.id, {
        expectedRevision: task.revision,
        approved,
        ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
      });
      setFeedback('');
      upsertTask(next);
      setNotice(approved ? '阶段审核已确认放行，可继续推进下一角色。' : '已将修订建议退回给当前角色。');
    });
  }

  async function handleBindDataset(task: WorkflowTaskRecord) {
    if (!selectedSurveyId) {
      setError('请先选择一份包含答卷的问卷发布快照。');
      return;
    }
    await runAction('绑定调查数据集', async () => {
      const next = await provideTaskInput(transport, projectId!, task.id, {
        expectedRevision: task.revision,
        artifactRefs: [`survey-release:${selectedSurveyId}`],
      });
      upsertTask(next);
      setNotice('调查数据快照已绑定，请先预览数据角色的工具与脱敏披露再推进。');
      try {
        const nextPreview = await getModelPreview(transport, projectId!, next.id);
        setPreviewEntry({ taskId: next.id, revision: next.revision, data: nextPreview });
      } catch {
        /* User can click preview manually. */
      }
    });
  }

  async function handleRefreshTask(task: WorkflowTaskRecord) {
    await runAction('刷新任务状态', async () => {
      const latest = await getAgentTask(transport, projectId!, task.id);
      upsertTask(latest);
      await refreshCalls(latest.id);
    });
  }

  async function handleCancel(task: WorkflowTaskRecord) {
    await runAction('取消任务', async () => {
      const cancelled = await cancelAgentTask(transport, projectId!, task.id, task.revision);
      upsertTask(cancelled);
      setNotice('当前协同任务已取消。');
    });
  }

  if (!authenticated) {
    return (
      <section className={styles.panel} aria-label="多角色研究协同任务">
        <p className={styles.kicker}>CLOUD RESEARCH WORKFLOW</p>
        <h3 className={styles.title}>多角色研究协同任务</h3>
        <p className={styles.subtitle}>登录云端账号并进入具体项目后，可启动「选题研究 → 问卷抽样 → 数据分析 → 报告撰稿 → 质量审校」五角色协同流水线。</p>
      </section>
    );
  }

  const neededRoles = TASK_TYPE_META[taskType].roles;
  const canAdvance = !!activeTask && (activeTask.status === 'ready' || activeTask.status === 'running');
  const canCancel = !!activeTask && ['ready', 'running', 'needs_input', 'blocked'].includes(activeTask.status);

  return (
    <section className={styles.panel} aria-label="多角色研究协同任务">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>CLOUD RESEARCH WORKFLOW</p>
          <h3 className={styles.title}>五角色协同流水线</h3>
          <p className={styles.subtitle}>{TASK_TYPE_META[taskType].description}</p>
        </div>
        <button type="button" className={styles.secondaryBtn} disabled={loading || busy} onClick={() => void loadTasks()}>
          {loading ? '同步中…' : '刷新任务列表'}
        </button>
      </header>

      <div className={styles.taskSelector}>
        <label>
          <select
            aria-label="选择协同任务模式"
            className={styles.select}
            value={taskType}
            disabled={busy || disabled}
            onChange={e => setTaskType(e.target.value as WorkflowTaskType)}
          >
            {WORKFLOW_TASK_TYPES.map(type => (
              <option key={type} value={type}>{TASK_TYPE_META[type].label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={busy || disabled || !planResult.ok}
          onClick={() => void handleCreate()}
        >
          基于当前简报创建任务
        </button>
      </div>

      <div className={styles.roleBindings} aria-label="各角色模型绑定">
        {neededRoles.map(role => {
          const bound = planResult.resolvedRoles[role];
          const cap = ROLE_META[role].capability;
          return (
            <span key={role} className={styles.roleChip} data-missing={!bound}>
              <strong>{ROLE_META[role].label}</strong>
              <span>{bound ? `${bound.label} (${bound.model})` : `待配置 ${cap} 能力`}</span>
            </span>
          );
        })}
        {!planResult.ok && onOpenSettings && (
          <button type="button" className={styles.secondaryBtn} onClick={onOpenSettings}>
            前往模型设置
          </button>
        )}
      </div>

      {tasks.length > 0 && (
        <div className={styles.taskTabs} aria-label="项目协同任务历史">
          {tasks.slice(0, 6).map(item => (
            <button
              key={item.id}
              type="button"
              className={styles.taskTab}
              aria-pressed={activeTask?.id === item.id}
              onClick={() => setActiveTaskId(item.id)}
            >
              <span>{TASK_TYPE_META[item.taskType]?.label ?? item.taskType}</span>
              <span>· {STATUS_LABEL[item.status]}</span>
              <span>v{item.revision}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className={styles.alert}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}

      {activeTask && (
        <div>
          <div className={styles.pipeline} aria-label="协同阶段进度">
            {workflowStageProgress(activeTask).map(item => (
              <div key={item.role} className={styles.stageNode} data-state={item.state}>
                <span className={styles.stageLabel}>{item.label}</span>
                <span className={styles.stageStatus}>{STATE_LABEL[item.state]}</span>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            {canAdvance && (
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={busy || disabled}
                onClick={() => void handlePreview(activeTask)}
              >
                预览下一步模型调用
              </button>
            )}
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={busy}
              onClick={() => void handleRefreshTask(activeTask)}
            >
              同步状态 (v{activeTask.revision})
            </button>
            {canCancel && (
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={busy}
                onClick={() => void handleCancel(activeTask)}
              >
                取消任务
              </button>
            )}
          </div>

          {activeTask.state.errors.length > 0 && (
            <div className={styles.alert} role="alert">
              <strong>当前阻塞提示：</strong>
              {activeTask.state.errors.join('；')}
            </div>
          )}

          {gate?.kind === 'upload_real_data' && (
            <div className={styles.card}>
              <h4>待绑定调查数据集</h4>
              <p>{gate.label}</p>
              <div className={styles.actions}>
                <select
                  aria-label="选择调查发布数据集"
                  className={styles.select}
                  value={selectedSurveyId}
                  onChange={e => setSelectedSurveyId(e.target.value)}
                >
                  {surveys.length === 0 && <option value="">暂无已发布的问卷快照</option>}
                  {surveys.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {item.classification === 'actual' ? '真实答卷' : '模拟答卷'} ({item.responseCount} 份 · {item.status === 'open' ? '收集中' : '已关闭'})
                    </option>
                  ))}
                </select>
                <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => void refreshSurveys()}>
                  刷新问卷快照
                </button>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy || !selectedSurveyId}
                  onClick={() => void handleBindDataset(activeTask)}
                >
                  绑定并继续
                </button>
              </div>
            </div>
          )}

          {(gate?.kind === 'approve_review' || gate?.kind === 'agent_input') && (
            <div className={styles.card}>
              <h4>人工审核关卡</h4>
              <p>{gate.label}</p>
              {activeTask.state.unresolved_questions.length > 0 && (
                <ul className={styles.stepList}>
                  {activeTask.state.unresolved_questions.map((q, index) => (
                    <li key={index}>{q}</li>
                  ))}
                </ul>
              )}
              <textarea
                aria-label="审校意见或补充说明"
                className={styles.textarea}
                rows={2}
                placeholder="可选：填写放行说明，或写明需要退回修改的问题..."
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
              />
              <div className={styles.actions}>
                <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void handleApprove(activeTask, true)}>
                  确认放行进入下一阶段
                </button>
                <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => void handleApprove(activeTask, false)}>
                  退回重修
                </button>
              </div>
            </div>
          )}

          {preview && (
            <div className={styles.card}>
              <h4>下一步调用清单与隐私披露 · {ROLE_META[preview.role]?.label ?? preview.role}</h4>
              <p>
                预计模型调用次数：{preview.maxCalls} 次 · 输出上限 {preview.maxOutputTokens} tokens ·
                <span className={styles.hashBadge}>预览指纹 {shortHash(preview.previewHash)}</span>
              </p>
              {preview.derivedContent && <p>{preview.derivedContent}</p>}
              {preview.dataDisclosure && <p>{preview.dataDisclosure}</p>}
              {preview.steps.length > 0 && (
                <ul className={styles.stepList}>
                  {preview.steps.map(step => (
                    <li key={step.step}>
                      <code>{step.step}</code> → {step.model ?? step.serviceId} (v{step.serviceRevision})
                    </li>
                  ))}
                </ul>
              )}
              {preview.datasets && preview.datasets.length > 0 && (
                <ul className={styles.datasetList}>
                  {preview.datasets.map(ds => (
                    <li key={ds.ref}>
                      数据集 <strong>{ds.title}</strong> ({ds.classification === 'actual' ? '真实答卷' : '模拟答卷'} · {ds.responseCount} 份)
                      <span className={styles.hashBadge}>{shortHash(ds.snapshotHash)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!preview.available && preview.missingTools.length > 0 && (
                <p className={styles.alert}>
                  当前缺少前置条件：{preview.missingTools.join('、')}。
                </p>
              )}
              <div className={styles.actions}>
                {preview.available ? (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={busy || disabled}
                    onClick={() => void handleAdvance(activeTask, true)}
                  >
                    确认同意并执行本阶段 ({preview.maxCalls} 次)
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    disabled={busy || disabled}
                    onClick={() => void handleAdvance(activeTask, false)}
                  >
                    转入待补充输入检查
                  </button>
                )}
              </div>
            </div>
          )}

          {Object.keys(activeTask.state.agent_outputs ?? {}).length > 0 && (
            <div className={styles.outputs} aria-label="各角色阶段产出">
              {WORKFLOW_ROLES.map(role => {
                const output = activeTask.state.agent_outputs?.[role];
                if (!output) return null;
                const deliverable = (output.deliverable ?? {}) as Record<string, unknown>;
                const chapters = Array.isArray(deliverable.chapters) ? deliverable.chapters as { title?: string; content?: string }[] : [];
                return (
                  <details key={role} className={styles.outputDetails}>
                    <summary>{ROLE_META[role].label}产出摘要</summary>
                    <div className={styles.outputBody}>
                      {typeof output.summary === 'string' && <p>{output.summary}</p>}
                      {role === 'writing' && chapters.length > 0 && (
                        <>
                          <ul className={styles.stepList}>
                            {chapters.map((ch, idx) => (
                              <li key={idx}>{ch.title || `第 ${idx + 1} 节`}</li>
                            ))}
                          </ul>
                          {onAdoptOutput && (
                            <div className={styles.actions}>
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={() => onAdoptOutput(role, output, activeTask)}
                              >
                                将撰稿章节写入当前报告画布
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          {calls.length > 0 && (
            <details className={styles.outputDetails} style={{ marginTop: '0.75rem' }}>
              <summary>模型调用回执 ({calls.length} 条)</summary>
              <ul className={styles.receiptList}>
                {calls.map(call => (
                  <li key={call.id}>
                    <code>{call.step}</code> · {call.status}
                    {call.usage?.totalTokens != null ? ` · ${call.usage.totalTokens} tokens` : ''}
                    {call.errorCode ? ` · 错误 ${call.errorCode}` : ''}
                    <span className={styles.hashBadge}>{shortHash(call.resultHash ?? call.consentHash)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
