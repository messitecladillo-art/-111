'use client';

import { useId, type FormEvent, type ReactNode } from 'react';
import type { Service } from '@evix/shared';
import { MODEL_CALLS, RESEARCH_STAGES, type ModelCallId, type ResearchStageId } from '@/lib/agent/research-stages';
import styles from './ResearchJourney.module.css';

export type JourneyStepStatus = 'idle' | 'ready' | 'running' | 'needs_input' | 'awaiting_confirmation' | 'completed' | 'blocked' | 'skipped';
export type ResearchJourneyStep = {
  id: ResearchStageId;
  status: JourneyStepStatus;
  detail?: string;
  actionLabel?: string;
  optional?: boolean;
  /** The controller can add or remove a checkpoint for the user's current plan. */
  confirmation?: boolean;
};
export type JourneyModelRoute = {
  selectedServiceId: string | null;
  effectiveServiceId: string | null;
  source: 'step' | 'task' | 'default' | 'only_eligible' | 'unselected' | 'stale_selection' | 'no_eligible';
};
export type ResearchJourneyProps = {
  direction: string;
  onDirectionChange: (direction: string) => void;
  onStart: (direction: string) => void;
  steps: readonly ResearchJourneyStep[];
  services: readonly Service[];
  modelRoutes: Partial<Record<ModelCallId, JourneyModelRoute>>;
  defaultServiceId: string | null;
  onDefaultServiceChange: (serviceId: string | null) => void;
  onModelCallChange: (call: ModelCallId, serviceId: string | null) => void;
  onStepAction?: (stage: ResearchStageId) => void;
  onToggleOptional?: (stage: ResearchStageId, skipped: boolean) => void;
  onEditPlan?: () => void;
  onOpenSettings: () => void;
  busy?: boolean;
  disabled?: boolean;
  servicesLoading?: boolean;
  afterIntake?: ReactNode;
};

const STATUS: Record<JourneyStepStatus, string> = {
  idle: '待开始', ready: '可继续', running: '处理中', needs_input: '待补充',
  awaiting_confirmation: '待你确认', completed: '已完成', blocked: '暂不能继续', skipped: '已跳过',
};
const DESCRIPTION: Record<ResearchStageId, string> = {
  topic: '把大方向细化为能调查、能回答的研究题目。',
  diagnosis: '核对研究对象、决策问题和实际资源。',
  literature: '整理来源，查看关键词、词云与文献图谱。',
  questionnaire: '把研究问题转为可审阅、可修改的问卷。',
  sampling: '确定目标总体、样本量与招募渠道。',
  pilot: '用真实预测试发现问题，记录问卷修订。',
  collection: '确认调查安排，收集并保留真实材料。',
  quality: '核查缺失、异常与清洗决定。',
  analysis: '选择适用方法，登记可追溯的计算结果。',
  findings: '把已确认结果组织为发现与行动建议。',
  report: '按研究需要组织内容，在同一编辑器中写作。',
  review: '核对事实、来源、口径与跨文件一致性。',
  export: '确认成果，检查格式与匿名要求后导出。',
  defense: '围绕现有证据准备讲述与追问。',
};
const CHECKPOINTS = new Set<ResearchStageId>(['topic', 'questionnaire', 'collection', 'export']);
const DIRECTIONS = [
  ['地方特产', '想研究家乡特产的消费人群、购买顾虑和品牌选择。'],
  ['青年就业', '想研究年轻人的就业选择，以及他们需要什么支持。'],
  ['AI 与学习', '想研究大学生使用 AI 后的学习习惯与实际体验。'],
] as const;

/** Controlled view: project state, model routing, execution and persistence belong to the Agent host. */
export default function ResearchJourney({ direction, onDirectionChange, onStart, steps, services, modelRoutes, defaultServiceId,
  onDefaultServiceChange, onModelCallChange, onStepAction, onToggleOptional, onEditPlan, onOpenSettings,
  busy = false, disabled = false, servicesLoading = false, afterIntake }: ResearchJourneyProps) {
  const id = useId();
  const complete = steps.filter(step => step.status === 'completed').length;
  const planned = steps.filter(step => step.status !== 'skipped').length;
  const defaultMissing = !!defaultServiceId && !services.some(service => service.id === defaultServiceId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && !disabled && direction.trim()) onStart(direction.trim());
  };

  const indexedSteps = steps.map((step, index) => ({ step, index }));
  const isVisible = (step: ResearchJourneyStep, index: number) => index < 3 || ['running', 'ready', 'needs_input', 'awaiting_confirmation', 'blocked'].includes(step.status);
  const visibleSteps = indexedSteps.filter(({ step, index }) => isVisible(step, index));
  const laterSteps = indexedSteps.filter(({ step, index }) => !isVisible(step, index));
  const renderStep = (step: ResearchJourneyStep, index: number) => {
    const stage = RESEARCH_STAGES.find(item => item.id === step.id);
    if (!stage) return null;
    const active = ['running', 'ready', 'needs_input', 'awaiting_confirmation'].includes(step.status);
    const confirmation = step.confirmation ?? CHECKPOINTS.has(step.id);
    return <li key={step.id} className={styles.step} data-status={step.status} data-stage={step.id} aria-current={active ? 'step' : undefined}>
      <span className={styles.number} aria-hidden="true">{step.status === 'completed' ? '✓' : String(index + 1).padStart(2, '0')}</span>
      <div className={styles.stepContent}>
        <div className={styles.stepHeading}><h3>{stage.label}</h3><span className={styles.status}>{STATUS[step.status]}</span></div>
        <p className={styles.description}>{step.detail || DESCRIPTION[step.id]}</p>
        <div className={styles.tags}>
          {confirmation && <span>由你确认</span>}{step.optional && <span>可选</span>}
          {stage.availability === 'planned' ? <span data-pending="true">待接入</span> : stage.availability === 'partial' ? <span>可辅助完成</span> : null}
        </div>
        {stage.modelCalls.length ? <div className={styles.models}>{stage.modelCalls.map(call => {
          const definition = MODEL_CALLS[call], route = modelRoutes[call];
          const eligible = services.filter(service => service.capabilities.includes(definition.capability));
          const explicit = route?.selectedServiceId ?? null;
          const selectedMissing = !!explicit && !eligible.some(service => service.id === explicit);
          const effective = services.find(service => service.id === route?.effectiveServiceId);
          return <details className={styles.modelSettings} key={call}>
            <summary data-missing={!effective}><span><strong>{definition.label}</strong>{effective ? `${effective.label}${route?.source === 'step' ? ' · 本步指定' : ' · 继承设置'}` : servicesLoading ? '正在读取模型…' : route?.source === 'stale_selection' ? '原选择已不可用，请重新选择' : '尚未选择可用模型'}</span><span aria-hidden="true">⌄</span></summary>
            <div className={styles.modelRow}>
            <label htmlFor={`${id}-${call}`}>{definition.label}</label>
            <select id={`${id}-${call}`} value={explicit ?? ''} disabled={disabled || busy || servicesLoading || step.status === 'skipped'}
              aria-invalid={selectedMissing || route?.source === 'stale_selection' || undefined} aria-describedby={`${id}-${call}-effective`}
              onChange={event => onModelCallChange(call, event.target.value || null)}>
              <option value="">使用默认设置</option>
              {selectedMissing && <option value={explicit!} disabled>原模型已不可用</option>}
              {eligible.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
            </select>
            <p id={`${id}-${call}-effective`} className={styles.effective} data-missing={!effective}>
              {servicesLoading ? '正在读取模型…' : effective ? `${effective.label}${route?.source === 'step' ? ' · 本步指定' : ' · 继承设置'}`
                : route?.source === 'stale_selection' ? '原选择已不可用，请重新选择' : '尚未选择可用模型'}
            </p>
            </div>
          </details>;
        })}</div> : <p className={styles.execution}>{stage.execution === 'deterministic' ? '本地处理 · 无需模型' : stage.execution === 'manual' ? '真实材料 · 人工参与' : '自动流程待接入'}</p>}
        {step.actionLabel && onStepAction && step.status !== 'skipped' && <button type="button" className={styles.stepAction}
          disabled={disabled || busy || step.status === 'running'} onClick={() => onStepAction(step.id)}>{step.actionLabel}<span aria-hidden="true">→</span></button>}
      </div>
    </li>;
  };

  return <section className={styles.journey} aria-labelledby={`${id}-title`} aria-busy={busy}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>证见 · 研究助手</span><h1 id={`${id}-title`}>从一个想法，<br />走向有据可循的发现。</h1><p>告诉证见你的方向，一起找证据、做研究。</p></div>
      <svg className={styles.researchMark} viewBox="0 0 120 120" fill="none" aria-hidden="true"><path d="M60 8 111 37v46l-51 29L9 83V37L60 8Z" /><path d="m60 26 35 20v37L60 103 25 83V46l35-20Z" /><path d="m60 43 21 12v25L60 92 39 80V55l21-12Z" /><path d="M9 37 60 66l51-29M60 66v46M25 46l35 20 35-20" /><circle cx="60" cy="66" r="5" /></svg>
    </header>

    <form className={styles.intake} onSubmit={submit}>
      <label htmlFor={`${id}-direction`}>你想研究什么？</label>
      <textarea id={`${id}-direction`} value={direction} maxLength={2000} rows={3}
        placeholder="例如：想研究大学生使用 AI 后的学习习惯，还没有具体题目。"
        disabled={disabled || busy} onChange={event => onDirectionChange(event.target.value)}
        onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !disabled && direction.trim()) onStart(direction.trim()); } }} />
      <div className={styles.intakeActions}>
        <label className={styles.defaultModel} htmlFor={`${id}-default`}><span>默认模型</span><select id={`${id}-default`}
          value={defaultServiceId ?? ''} disabled={disabled || busy || servicesLoading}
          aria-invalid={defaultMissing || undefined} onChange={event => onDefaultServiceChange(event.target.value || null)}>
          <option value="">按任务设置</option>
          {defaultMissing && <option value={defaultServiceId!} disabled>原模型已不可用</option>}
          {services.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
        </select></label>
        <button className={styles.textButton} type="button" onClick={onOpenSettings}>管理模型</button>
        <button className={styles.primary} type="submit" disabled={busy || disabled || !direction.trim()}>{busy ? '正在推进…' : '开始推进'}</button>
      </div>
    </form>
    {!direction && <div className={styles.suggestions} role="group" aria-label="试试这些研究方向">{DIRECTIONS.map(([label, text]) => <button key={label} type="button" disabled={busy || disabled} onClick={() => onDirectionChange(text)}>{label}<span aria-hidden="true">↗</span></button>)}</div>}
    {afterIntake && <div className={styles.intakeOutput}>{afterIntake}</div>}

    <div className={styles.planHeading}>
      <p aria-live="polite"><b>研究路线</b>{complete > 0 ? `已完成 ${complete} / ${planned} 步` : `${planned} 个步骤`}</p>
      {(onEditPlan || steps.some(step => step.optional)) && <details className={styles.planEditor}><summary>调整路线</summary><div className={styles.planOptions}>
        {onEditPlan && <button type="button" className={styles.textButton} onClick={onEditPlan}>编辑研究计划</button>}
        {steps.filter(step => step.optional).map(step => <label key={step.id}><input type="checkbox" checked={step.status !== 'skipped'} disabled={disabled || busy || !onToggleOptional}
          onChange={event => onToggleOptional?.(step.id, !event.target.checked)} />{RESEARCH_STAGES.find(stage => stage.id === step.id)?.label}</label>)}
        {!onEditPlan && !steps.some(step => step.optional) && <p>当前路线没有可选步骤。</p>}
      </div></details>}
    </div>

    <ol className={styles.steps}>{visibleSteps.map(({ step, index }) => renderStep(step, index))}</ol>
    {laterSteps.length > 0 && <details className={styles.laterSteps}>
      <summary>后续研究步骤 <span>{laterSteps.length}</span></summary>
      <ol className={styles.steps}>{laterSteps.map(({ step, index }) => renderStep(step, index))}</ol>
    </details>}
  </section>;
}
