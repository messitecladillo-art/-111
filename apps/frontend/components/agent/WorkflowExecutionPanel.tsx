'use client';

import { useId, useState, type ReactNode } from 'react';
import type { Service } from '@evix/shared';
import {
  WORKFLOW_PIPELINES, WORKFLOW_ROLE_CAPABILITIES, WORKFLOW_TASK_ROLES,
  type WorkflowModelCall, type WorkflowModelGrant, type WorkflowPhasePreview, type WorkflowRole,
  type WorkflowRoleSelections, type WorkflowTask, type WorkflowTaskKind,
} from '@/lib/agent/workflow-tasks';
import styles from './WorkflowExecutionPanel.module.css';

export type WorkflowExecutionPanelProps = {
  task: WorkflowTask | null;
  taskKind?: WorkflowTaskKind;
  phasePreview: WorkflowPhasePreview | null;
  grant: WorkflowModelGrant | null;
  calls: readonly WorkflowModelCall[];
  services: readonly Service[];
  roleSelections: WorkflowRoleSelections;
  canManage: boolean;
  busy?: boolean;
  loading?: boolean;
  error?: string;
  reconciling?: boolean;
  sourceChanged?: boolean;
  restored?: boolean;
  onAuthorize: () => void;
  onContinue: () => void;
  onRefresh: () => void;
  onCancel: () => void;
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  onOpenSettings: () => void;
  onOpenAnalysis: () => void;
  onRoleSelectionChange: (role: WorkflowRole, serviceId: string | null) => void;
  onPrepare?: () => void;
  onNewTask?: () => void;
};

const ROLE_LABELS: Record<WorkflowRole, string> = {
  research: '研究设计', survey: '问卷与抽样', data: '数据分析', writing: '报告写作', reviewer: '独立审阅',
};
const STATUS_LABELS: Record<string, string> = {
  ready: '待继续', running: '正在处理', needs_input: '待你确认', blocked: '需要处理', completed: '已完成',
  failed: '未完成', outcome_unknown: '结果待核对', cancelled: '已停止', discarded: '结果未写入',
  active: '已授权', stopped: '授权已停止', expired: '授权已到期', exhausted: '本阶段额度已用完',
};
const STEP_LABELS: Record<string, string> = {
  review_materials: '整理研究材料', design_research: '拟定研究设计', assess_feasibility: '评估可行性',
  design_variables: '确定测量变量', design_questionnaire: '拟定问卷', design_sampling: '设计抽样方案',
  inspect_data: '检查数据', clean_data: '整理数据', analyze_data: '分析数据',
  outline_report: '组织报告结构', draft_report: '撰写报告内容', check_evidence: '核查证据',
  check_consistency: '核对一致性', review_deliverable: '审阅本阶段成果',
};
const FIELD_LABELS: Record<string, string> = {
  title: '题目', background: '研究背景', research_questions: '研究问题', objectives: '研究目标',
  population: '研究对象', geography: '研究地区', period: '研究时间', framework: '研究框架',
  feasibility: '可行性', evidence_plan: '证据计划', assumptions: '前提与假设',
  variables: '测量变量', questionnaire: '问卷方案', sampling: '抽样方案', pilot_plan: '预测试计划',
  privacy_and_ethics: '隐私与伦理', data_status: '数据状态', input_artifact_refs: '输入材料引用',
  schema_findings: '数据检查', cleaning_log: '清洗记录', descriptive_statistics: '描述性统计',
  tests: '统计检验', charts: '图表', limitations: '适用限制', abstract: '摘要', chapters: '章节',
  conclusions: '结论', recommendations: '建议', missing_material: '待补材料', export_artifact_ref: '导出成果引用',
  decision: '审阅结论', stage: '审阅阶段', findings: '需要修改的问题', consistency_checks: '一致性检查',
  evidence_gaps: '证据缺口', ethics_and_privacy: '伦理与隐私', competition_readiness: '提交准备核查',
  revision_request: '返修要求', summary: '本阶段摘要', artifact_refs: '成果引用', evidence_refs: '证据引用',
  unresolved_questions: '待补充的问题', errors: '处理说明', severity: '程度', location: '位置', issue: '问题',
  evidence_ref: '证据引用', required_change: '修改建议', check: '检查项', result: '结果', details: '说明',
  status: '状态', items: '检查项目', basis: '依据', name: '名称', description: '说明', question: '问题',
};
const VALUE_LABELS: Record<string, string> = {
  approve: '通过', revise: '需要修改', reject: '未通过', blocking: '阻断问题', major: '主要问题', minor: '一般问题',
  pass: '通过', fail: '未通过', uncertain: '待核实', ready: '已准备', not_ready: '尚未准备', not_assessed: '尚未核查',
  proposed: '拟议', simulated: '模拟', inferred: '推断', actual: '实际', analyzed: '已分析', needs_data: '待补真实数据',
};
const PRIMARY_FIELDS: Record<WorkflowRole, readonly string[]> = {
  research: ['title', 'research_questions', 'population', 'geography'], survey: ['variables', 'questionnaire'],
  data: ['data_status', 'descriptive_statistics', 'limitations'], writing: ['title', 'abstract'],
  reviewer: ['decision', 'findings', 'revision_request', 'evidence_gaps'],
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function hasContent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
}
function content(value: unknown, depth = 0): ReactNode {
  if (value === null || value === undefined) return <span className={styles.muted}>未提供</span>;
  if (typeof value === 'string') return <span className={styles.prose}>{VALUE_LABELS[value] ?? value}</span>;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (depth >= 4) return <pre className={styles.json}>{JSON.stringify(value, null, 2)}</pre>;
  if (Array.isArray(value)) return value.length
    ? <ul className={styles.valueList}>{value.map((item, index) => <li key={index}>{content(item, depth + 1)}</li>)}</ul>
    : <span className={styles.muted}>无</span>;
  return <dl className={styles.fields}>{Object.entries(record(value)).map(([key, item]) =>
    <div key={key}><dt>{FIELD_LABELS[key] ?? key}</dt><dd>{content(item, depth + 1)}</dd></div>)}</dl>;
}
function stepLabel(step: string): string {
  const [role, name] = step.split('.');
  return STEP_LABELS[name] ?? ROLE_LABELS[role as WorkflowRole] ?? '模型处理';
}
function frozenModels(steps: Record<string, Service>, roles: readonly WorkflowRole[]) {
  return roles.map(role => {
    const unique = new Map<string, Service>();
    for (const [step, service] of Object.entries(steps)) {
      if (step.startsWith(`${role}.`)) unique.set(`${service.id}:${service.revision}:${service.model}`, service);
    }
    return { role, models: [...unique.values()] };
  });
}

/** A controlled view of server tasks. Rendering, disclosure and refresh never dispatch a model call. */
export default function WorkflowExecutionPanel({ task, taskKind = 'full_research', phasePreview, grant, calls, services,
  roleSelections, canManage, busy = false, loading = false, error = '', reconciling = false, sourceChanged = false,
  restored = false, onAuthorize, onContinue, onRefresh, onCancel, onApprove, onRevise, onOpenSettings,
  onOpenAnalysis, onRoleSelectionChange, onPrepare, onNewTask }: WorkflowExecutionPanelProps) {
  const id = useId();
  const [acceptedPhase, setAcceptedPhase] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState({ checkpoint: '', text: '' });
  const kind = task?.taskType ?? taskKind;
  const roles = WORKFLOW_TASK_ROLES[kind];
  const pipeline = WORKFLOW_PIPELINES[kind];
  const position = task?.state.revision ?? 0;
  const preview = task && phasePreview?.taskId === task.id && phasePreview.projectId === task.projectId
    && phasePreview.baseRevision === task.revision && phasePreview.position === position ? phasePreview : null;
  const activeGrant = task && grant?.taskId === task.id && grant.projectId === task.projectId ? grant : null;
  const taskCalls = task ? calls.filter(call => call.taskId === task.id && call.projectId === task.projectId) : [];
  const unknown = task?.execution?.status === 'outcome_unknown' || taskCalls.some(call => call.status === 'outcome_unknown');
  const running = task?.status === 'running' || task?.execution?.status === 'running';
  const cancelled = task?.execution?.status === 'cancelled';
  const awaiting = task?.state.awaiting_approval;
  const humanReview = task?.status === 'needs_input' && !!awaiting?.startsWith('approve_');
  const needsAnswer = task?.status === 'needs_input' && awaiting === 'agent_input';
  const needsData = task?.status === 'needs_input' && awaiting === 'upload_real_data';
  const mutationAllowed = canManage && !busy && !loading && !reconciling && !sourceChanged && !unknown && !running;
  const phaseKey = preview ? `${preview.taskId}:${preview.baseRevision}:${preview.phaseHash}` : null;
  const accepted = !!phaseKey && acceptedPhase === phaseKey;
  const canAuthorize = mutationAllowed && task?.status === 'ready' && !!preview?.available && activeGrant?.status !== 'active';
  const canContinue = mutationAllowed && task?.status === 'ready' && activeGrant?.status === 'active'
    && position >= activeGrant.position && position < activeGrant.position + activeGrant.roles.length;
  const canCancel = canManage && !loading && (running || busy || activeGrant?.status === 'active');
  const shownGrant = activeGrant && (activeGrant.status === 'active' || !preview) ? activeGrant : null;
  const frozen = shownGrant ?? preview;
  const feedbackCheckpoint = `${task?.id}:${position}:${awaiting}`;
  const feedback = feedbackDraft.checkpoint === feedbackCheckpoint ? feedbackDraft.text : '';
  const outputs = task ? roles.filter(role => hasContent(task.state.agent_outputs[role])) : [];
  const phaseRoles = frozen?.roles.map(role => ROLE_LABELS[role]).join(' + ');
  const nextRole = pipeline[position];
  const heading = task?.status === 'completed' ? '本次研究任务已完成'
    : humanReview ? '本阶段成果，等你确认' : needsAnswer ? '补充说明后再继续'
      : needsData ? '下一步需要真实数据' : unknown ? '先核对本次执行结果'
        : running ? `${ROLE_LABELS[task?.execution?.role ?? task?.state.current_role ?? nextRole ?? 'research']}正在处理`
          : task ? nextRole ? `接下来，${ROLE_LABELS[nextRole]}` : '本次任务正在完成核对' : '确定本次研究的模型分工';

  return <section className={styles.panel} aria-labelledby={`${id}-title`} aria-busy={busy || loading}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>研究推进</p><h2 id={`${id}-title`}>{heading}</h2></div>
      {task && !sourceChanged && onNewTask && <button type="button" className={styles.secondary}
        disabled={!mutationAllowed || activeGrant?.status === 'active'} onClick={() => { if (mutationAllowed && activeGrant?.status !== 'active') onNewTask(); }}>另建研究任务</button>}
      {task && <span className={styles.status} data-attention={unknown || humanReview || task.status === 'blocked'}>
        {unknown ? '结果待核对' : cancelled ? '已停止' : STATUS_LABELS[task.status] ?? task.status}</span>}
    </header>

    {loading && <p className={styles.notice} role="status">正在读取任务与执行回执…</p>}
    {!canManage && <p className={styles.notice}>当前为只读状态，可以查看已有成果与回执。推进研究需要登录并拥有项目编辑权限。</p>}
    {restored && task && <p className={styles.notice}>已恢复上次任务。查看记录不会重新调用模型。</p>}
    {sourceChanged && <div className={styles.attention} role="status"><p>研究材料已变化。以下保留原任务记录，请按当前材料新建任务后再推进。</p>
      {onNewTask && <button type="button" className={styles.secondary} disabled={!canManage || busy || loading || reconciling || unknown || running}
        onClick={() => { if (canManage && !busy && !loading && !reconciling && !unknown && !running) onNewTask(); }}>按当前材料新建任务</button>}</div>}
    {error && <p className={styles.error} role="alert">{error}</p>}

    <details className={styles.settings}>
      <summary><span>{task ? '新任务的模型分工' : '模型分工'}<small>{roles.length} 个角色</small></span><span aria-hidden="true">⌄</span></summary>
      <div className={styles.settingsBody}>
        <p className={styles.muted}>{task ? '本任务使用创建时固定的配置。这里的选择用于新任务。' : '为各角色选择已保存的模型。开始前还会列出本阶段材料与调用上限，由你授权。'}</p>
        <div className={styles.modelGrid}>{roles.map(role => {
          const eligible = services.filter(service => service.capabilities.includes(WORKFLOW_ROLE_CAPABILITIES[role]));
          const selected = roleSelections[role] ?? '';
          const missing = !!selected && !eligible.some(service => service.id === selected);
          return <label key={role} htmlFor={`${id}-${role}`}><span>{ROLE_LABELS[role]}</span>
            <select id={`${id}-${role}`} value={selected} disabled={!canManage || busy || loading || reconciling}
              aria-invalid={missing || undefined} onChange={event => { if (canManage && !busy && !loading && !reconciling) onRoleSelectionChange(role, event.target.value || null); }}>
              <option value="">选择模型</option>{missing && <option value={selected} disabled>原模型已不可用，请重新选择</option>}
              {eligible.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
            </select></label>;
        })}</div>
        <button type="button" className={styles.textButton} onClick={onOpenSettings}>管理已保存的模型</button>
      </div>
    </details>

    {!task && !loading && <p className={styles.empty}>填写上方的研究方向，点击“开始推进”建立任务。研究设计与问卷由你确认，其余步骤在本阶段授权范围内自动推进。</p>}

    {task && <>
      <ol className={styles.progress} aria-label="任务实际进度">{pipeline.map((role, index) => {
        const done = task.status === 'completed' || index < position;
        const current = index === position && task.status !== 'completed';
        const label = role === 'reviewer' ? `审阅${ROLE_LABELS[pipeline[index - 1]]}` : ROLE_LABELS[role];
        return <li key={`${role}-${index}`} data-done={done} aria-current={current ? 'step' : undefined}>
          <span className={styles.progressDot} aria-hidden="true">{done ? '✓' : index + 1}</span><span>{label}</span>
          <span className={styles.srOnly}>{done ? '已完成' : current ? '当前步骤' : '待开始'}</span></li>;
      })}</ol>

      {(unknown || cancelled || reconciling) && <div className={styles.attention} role="status">
        <p>{unknown ? '本次调用的结果尚未确定。请先核对服务器回执，核对前不会再次发送材料。'
          : cancelled ? '本次结果写入已停止。已经发出的模型请求可能仍在处理，请核对调用回执。'
            : '正在核对服务器中的任务和调用记录，核对期间暂停新的执行。'}</p>
      </div>}

      {frozen && !sourceChanged && <section className={styles.authorization} aria-labelledby={`${id}-authorization`}>
        <div className={styles.sectionHeading}><h3 id={`${id}-authorization`}>{shownGrant ? '本阶段授权' : '开始前，请核对本阶段'}</h3>
          {shownGrant && <span className={styles.muted}>{STATUS_LABELS[shownGrant.status]}</span>}</div>
        <p className={styles.phaseName}>{phaseRoles}</p>
        <ul className={styles.frozenModels}>{frozenModels(frozen.steps, frozen.roles).map(({ role, models }) => <li key={role}>
          <span>{ROLE_LABELS[role]}</span><div>{models.length ? models.map(service => <p key={`${service.id}-${service.revision}-${service.model}`}>
            <strong>{service.label} · {service.model}</strong><small>配置 v{service.revision}</small></p>) : <p>尚无可用的固定模型</p>}</div>
        </li>)}</ul>
        <p className={styles.limits}>最多 <strong>{frozen.maxCalls}</strong> 次模型调用<span aria-hidden="true"> · </span>本阶段输出上限 <strong>{frozen.maxOutputTokens.toLocaleString('en-US')}</strong> token
          {shownGrant && <span className={styles.used}>已使用 {shownGrant.usedCalls} / {shownGrant.maxCalls} 次</span>}</p>
        {preview && !shownGrant && <>
          <details className={styles.materials}><summary>查看将发送的完整材料</summary>
            <p className={styles.muted}>本阶段后续步骤还会使用前序步骤生成的有界结果。人工确认、返修、取消或结果未知时，本阶段授权停止。</p>
            <pre className={styles.json} tabIndex={0} aria-label="本阶段完整外发材料">{JSON.stringify(preview.materials, null, 2)}</pre>
          </details>
          {!preview.available && <div><p className={styles.error}>本阶段所需工具尚未接入，暂不能调用模型。{preview.missingTools.length > 0 ? '请先补齐实际材料读取与处理能力。' : ''}</p>
            {preview.roles.includes('data') && <button type="button" className={styles.textButton} onClick={onOpenAnalysis}>查看现有数据与分析</button>}</div>}
          <label className={styles.consent}><input type="checkbox" checked={accepted} disabled={!canAuthorize}
            onChange={event => setAcceptedPhase(event.target.checked && phaseKey ? phaseKey : null)} />
            <span>我已核对材料、模型和上限，同意本阶段调用。</span></label>
          <button type="button" className={styles.primary} disabled={!canAuthorize || !accepted}
            onClick={() => { if (canAuthorize && accepted) { setAcceptedPhase(null); onAuthorize(); } }}>授权并推进本阶段</button>
        </>}
        {canContinue && <button type="button" className={styles.primary} onClick={() => { if (canContinue) onContinue(); }}>继续本阶段</button>}
        {shownGrant && shownGrant.status !== 'active' && <p className={styles.muted}>本次授权已结束。下一阶段需要重新核对并授权。</p>}
      </section>}

      {!preview && activeGrant?.status !== 'active' && task.status === 'ready' && nextRole && !sourceChanged && onPrepare && <div className={styles.prepare}>
        <p>先查看本阶段的实际模型、材料与调用上限。</p><button type="button" className={styles.secondary}
          disabled={!mutationAllowed} onClick={() => { if (mutationAllowed) onPrepare(); }}>核对本阶段材料</button></div>}

      {outputs.length > 0 && <section className={styles.outputs} aria-labelledby={`${id}-outputs`}><h3 id={`${id}-outputs`}>已有阶段成果</h3>
        {outputs.map(role => {
          const output = record(task.state.agent_outputs[role]);
          const deliverable = record(output.deliverable);
          const primary = PRIMARY_FIELDS[role].filter(key => hasContent(deliverable[key]));
          const remaining = Object.entries(deliverable).filter(([key, value]) => !primary.includes(key) && hasContent(value));
          return <article className={styles.output} key={role} aria-labelledby={`${id}-output-${role}`}>
            <h4 id={`${id}-output-${role}`}>{ROLE_LABELS[role]}</h4>
            {hasContent(output.summary) && <p className={styles.outputSummary}>{content(output.summary)}</p>}
            {primary.length > 0 && <dl className={styles.fields}>{primary.map(key => <div key={key}><dt>{FIELD_LABELS[key]}</dt><dd>{content(deliverable[key])}</dd></div>)}</dl>}
            {remaining.length > 0 && <details className={styles.more}><summary>展开完整阶段内容</summary><dl className={styles.fields}>
              {remaining.map(([key, value]) => <div key={key}><dt>{FIELD_LABELS[key] ?? key}</dt><dd>{content(value)}</dd></div>)}</dl></details>}
            {hasContent(output.unresolved_questions) && <div className={styles.outputNote}><strong>待补充的问题</strong>{content(output.unresolved_questions)}</div>}
            <details className={styles.raw}><summary>查看原始结构化结果</summary><pre className={styles.json} tabIndex={0}>{JSON.stringify(output, null, 2)}</pre></details>
          </article>;
        })}</section>}

      {(humanReview || needsAnswer) && <section className={styles.review} aria-labelledby={`${id}-review`}>
        <h3 id={`${id}-review`}>{humanReview ? '确认本阶段成果' : '补充研究说明'}</h3>
        <p>{humanReview ? '请结合实际资源核对以上成果。确认后才会进入下一阶段；如需修改，可以直接写下意见。' : '请回答以下问题。补充说明后，下一次模型调用仍需重新授权。'}</p>
        {task.state.unresolved_questions.length > 0 && <ul>{task.state.unresolved_questions.map((question, index) => <li key={index}>{question}</li>)}</ul>}
        <label htmlFor={`${id}-feedback`}>{humanReview ? '修改意见' : '补充说明'}</label>
        <textarea id={`${id}-feedback`} value={feedback} rows={3} maxLength={8000} disabled={!mutationAllowed}
          placeholder={humanReview ? '例如：缩小调查范围，保留能在两周内接触到的人群。' : '填写需要补充的实际情况。'}
          onChange={event => setFeedbackDraft({ checkpoint: feedbackCheckpoint, text: event.target.value })} />
        <div className={styles.actions}>{humanReview && <button type="button" className={styles.primary} disabled={!mutationAllowed}
          onClick={() => { if (mutationAllowed) onApprove(); }}>确认成果，进入下一阶段</button>}
          <button type="button" className={styles.secondary} disabled={!mutationAllowed || !feedback.trim()}
            onClick={() => { if (mutationAllowed && feedback.trim()) onRevise(feedback.trim()); }}>{humanReview ? '提交修改意见' : '提交补充说明'}</button></div>
      </section>}

      {needsData && <div className={styles.attention}><p>研究已到真实数据环节。请先导入并核查数据，才能继续分析。</p>
        <button type="button" className={styles.secondary} onClick={onOpenAnalysis}>前往数据分析</button></div>}
      {task.status === 'blocked' && !unknown && !cancelled && <p className={styles.notice}>流程暂时停止。请核对已有成果、待补材料与执行记录，再决定下一步。</p>}
      {task.state.errors.length > 0 && <details className={styles.raw}><summary>查看处理说明</summary>{content(task.state.errors)}</details>}

      <footer className={styles.footer}>
        <p className={styles.muted}>{taskCalls.length > 0 ? `已登记 ${taskCalls.length} 次模型调用` : '尚无模型调用回执'}</p>
        <div className={styles.actions}><button type="button" className={styles.secondary} disabled={loading}
          onClick={() => { if (!loading) onRefresh(); }}>{reconciling ? '核对服务器回执' : '刷新任务与回执'}</button>
          {canCancel && <button type="button" className={styles.textButton} onClick={() => { if (canCancel) onCancel(); }}>停止本阶段</button>}</div>
      </footer>
      {(taskCalls.length > 0 || task.execution) && <details className={styles.receipts}><summary>查看执行与调用记录</summary>
        {task.execution && <p className={styles.receiptSummary}>最近执行：{ROLE_LABELS[task.execution.role]} · {STATUS_LABELS[task.execution.status] ?? task.execution.status}</p>}
        {taskCalls.length > 0 && <ul>{taskCalls.map(call => {
          const config = activeGrant?.steps[call.step];
          const exactConfig = config?.id === call.serviceId && config.revision === call.serviceRevision ? config : null;
          return <li key={call.id}><div><strong>{stepLabel(call.step)}</strong><span>{STATUS_LABELS[call.status] ?? call.status}</span></div>
            <p>{exactConfig ? `${exactConfig.label} · ${exactConfig.model}` : `个人模型配置 v${call.serviceRevision}`}</p>
            {call.usage && <p>实际用量：输入 {call.usage.inputTokens} / 输出 {call.usage.outputTokens} token</p>}
            <small>{call.startedAt}{call.errorCode ? ` · ${call.errorCode}` : ''}</small></li>;
        })}</ul>}
        <p className={styles.muted}>回执记录执行状态；模型返回不代表真实调研、统计或提交检查已经完成。</p>
      </details>}
    </>}
  </section>;
}
