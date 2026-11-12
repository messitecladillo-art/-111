'use client';

import Link from 'next/link';
import { useCallback, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { Service } from '@evix/shared';
import {
  eligibleModelServices,
  getStageModelPreferences,
  getServerStageModelPreferences,
  MODEL_TASKS,
  resolveModelRoute,
  resolveStageModelRoute,
  setDefaultModelPreference,
  setModelPreference,
  setStageModelPreference,
  subscribeModelPreferences,
  type ModelTask,
} from '@/lib/agent/model-routing';
import { MODEL_CALL_IDS, MODEL_CALLS, type ModelCallId } from '@/lib/agent/research-stages';
import styles from './ModelRoutingSettings.module.css';

export type ModelRoutingSettingsProps = {
  owner: string | null;
  services: Service[];
  loading?: boolean;
  onManageServices?: () => void;
};

const TASK_COPY: Record<ModelTask, { title: string; purpose: string }> = {
  research: { title: '对话研究', purpose: '讨论选题，梳理思路与研究问题。' },
  questionnaire: { title: '问卷起草', purpose: '根据研究需求，起草问卷建议。' },
  report: { title: '报告拟稿', purpose: '为报告拟稿与段落整理选择模型。' },
};

function TaskIcon({ task }: { task: ModelTask }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {task === 'research' ? <><path d="M20 11.5a7.8 7.8 0 0 1-8 7.5 9.3 9.3 0 0 1-3.4-.6L4 20l1.4-4.1A7.2 7.2 0 0 1 4 11.5 7.8 7.8 0 0 1 12 4a7.8 7.8 0 0 1 8 7.5Z"/><path d="M8.5 10h7M8.5 13.5h4.5"/></>
      : task === 'questionnaire' ? <><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="m8 9 1 1 2-2M13.5 9h2.5M8 14h2M13.5 14h2.5M8 17h8"/></>
        : <><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10L14 3.5Z"/><path d="M14 3.5v5h5M8.5 12.5h7M8.5 16h5"/></>}
  </svg>;
}

/** Account-scoped model references only; connecting services remains in the host's service editor. */
export default function ModelRoutingSettings({ owner, services, loading = false, onManageServices }: ModelRoutingSettingsProps) {
  const id = useId();
  const pendingStepFocus = useRef<ModelCallId | null>(null);
  const overrides = useRef<HTMLDetailsElement>(null);
  const snapshot = useCallback(() => getStageModelPreferences(owner), [owner]);
  const preferences = useSyncExternalStore(subscribeModelPreferences, snapshot, getServerStageModelPreferences);
  const available = owner ? services : [];
  const routes = MODEL_TASKS.map(task => resolveModelRoute(task, available,
    preferences.tasks[task] ? { [task]: preferences.tasks[task] } : preferences.defaultServiceId ? { [task]: preferences.defaultServiceId } : {}));
  const defaultMissing = !loading && !!preferences.defaultServiceId && !available.some(service => service.id === preferences.defaultServiceId);
  const stepRoutes = MODEL_CALL_IDS.map(call => resolveStageModelRoute(call, available, preferences));
  const ready = stepRoutes.filter(route => route.service).length;
  const invalidSteps = !loading && owner ? stepRoutes.filter(route => route.reason === 'stale_selection') : [];
  const normalSteps = stepRoutes.filter(route => !invalidSteps.includes(route));
  const overrideCount = MODEL_CALL_IDS.filter(call => !!preferences.steps[call]).length;
  const allReady = !loading && !!owner && ready === MODEL_CALL_IDS.length && !preferences.invalid;
  const summary = loading ? '正在读取服务…' : !owner ? '登录后设置' : `${ready} / ${MODEL_CALL_IDS.length} 个步骤已分配`;

  useLayoutEffect(() => {
    const call = pendingStepFocus.current;
    if (!call) return;
    pendingStepFocus.current = null;
    if (stepRoutes.find(route => route.stepId === call)?.reason === 'stale_selection') return;
    const panel = overrides.current;
    if (!panel) return;
    panel.open = true;
    const selection = document.getElementById(`${id}-${call}`);
    if (selection?.isConnected) {
      selection.focus({ preventScroll: true });
      selection.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  });

  function manageAction(label: string) {
    return onManageServices
      ? <button type="button" className={styles.manage} onClick={onManageServices}>{label}<span aria-hidden="true">↗</span></button>
      : <Link className={styles.manage} href="/services">{label}<span aria-hidden="true">↗</span></Link>;
  }

  function stepSelection(call: ModelCallId) {
    const definition = MODEL_CALLS[call], route = stepRoutes.find(item => item.stepId === call)!;
    const explicit = preferences.steps[call], eligible = eligibleModelServices(definition.capability, available);
    const stale = !loading && !!explicit && !eligible.some(service => service.id === explicit);
    const inherited = !explicit && route.service;
    const inheritedLabel = inherited ? `${route.selectionSource === 'implicit' ? '自动选择' : '跟随设置'} · ${inherited.label}` : '跟随任务与默认设置';
    return <article className={styles.step} key={call} data-invalid={route.reason === 'stale_selection' || undefined}>
      <div className={styles.stepName}><h4 id={`${id}-${call}-title`}>{definition.label}</h4><span>{TASK_COPY[definition.capability].title}</span></div>
      <div className={styles.selection}>
        <label className={styles.srOnly} htmlFor={`${id}-${call}`}>{definition.label}使用模型</label>
        <select id={`${id}-${call}`} value={explicit ?? ''} disabled={loading || !owner}
          aria-invalid={!loading && !!owner && route.reason === 'stale_selection' || undefined}
          aria-describedby={route.reason === 'stale_selection' ? `${id}-${call}-route` : undefined}
          onChange={event => {
            if (route.reason === 'stale_selection') pendingStepFocus.current = call;
            setStageModelPreference(owner, call, event.target.value || null);
          }}>
          <option value="">{loading ? '正在读取服务…' : !owner ? '登录后选择模型' : inheritedLabel}</option>
          {stale && <option value={explicit} disabled>原模型已不可用</option>}
          {eligible.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
        </select>
        {route.reason === 'stale_selection' && !loading && owner && <p id={`${id}-${call}-route`} className={styles.routeWarning}>原选择已不可用，请重新选择。</p>}
      </div>
    </article>;
  }

  return <section className={styles.settings} data-self-styled aria-labelledby={`${id}-title`} aria-busy={loading}>
    <header className={styles.header}>
      <div className={styles.intro}>
        <h2 id={`${id}-title`}>为研究安排模型</h2>
        <p>先选默认模型，需要时再为任务或步骤单独指定。</p>
      </div>
      <p className={styles.summary} data-ready={allReady} data-attention={!!owner && !loading && invalidSteps.length > 0 || undefined} role="status">{summary}</p>
    </header>

    <div className={styles.body}>
      <article className={styles.defaultModel} aria-labelledby={`${id}-default-title`}>
        <div className={styles.taskCopy}><span className={styles.defaultBadge}>默认</span><h3 id={`${id}-default-title`}>默认模型</h3><p>没有单独指定的任务，优先使用它。</p></div>
        <div className={styles.selection}><label className={styles.srOnly} htmlFor={`${id}-default`}>默认使用</label>
          <select id={`${id}-default`} value={preferences.defaultServiceId ?? ''} disabled={loading || !owner}
            aria-invalid={!loading && !!owner && defaultMissing || undefined}
            onChange={event => setDefaultModelPreference(owner, event.target.value || null)}>
            <option value="">{loading ? '正在读取模型…' : '按任务分别选择'}</option>
            {defaultMissing && <option value={preferences.defaultServiceId!} disabled>原模型已不可用</option>}
            {available.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
          </select>
          {defaultMissing && <p className={styles.routeWarning}>原选择已不可用，请重新选择。</p>}
        </div>
      </article>
      {preferences.invalid && !loading && owner && <p className={styles.invalidNotice} role="alert">模型选择记录无法读取，请重新设置模型。</p>}
      <section className={styles.tasks} aria-labelledby={`${id}-tasks-title`}>
        <div className={styles.sectionHeading}><h3 id={`${id}-tasks-title`}>按任务分配</h3><span>可单独指定</span></div>
        <div className={styles.taskGrid}>{routes.map(route => {
        const task = route.task, copy = TASK_COPY[task], eligible = eligibleModelServices(task, available);
        const selected = !loading && !preferences.invalid ? route.service : null;
        const stale = !loading && (route.reason === 'stale_selection' || !!preferences.invalid);
        const needsService = route.reason === 'no_eligible' || stale;
        const inheritedLabel = selected && !preferences.tasks[task] ? `${preferences.defaultServiceId ? '使用默认' : '自动选择'} · ${selected.label}` : '继承默认模型';
        const guidance = stale
          ? '原选择已不可用，请重新选择。'
          : !eligible.length ? `尚无支持${copy.title}的服务。` : '请选择模型。';

        return <article key={task} className={styles.task} aria-labelledby={`${id}-${task}-title`}>
          <div className={styles.taskDetails}>
            <span className={styles.taskIcon}><TaskIcon task={task}/></span>
            <div className={styles.taskCopy}>
              <h3 id={`${id}-${task}-title`}>{copy.title}</h3>
              <p>{copy.purpose}</p>
            </div>
          </div>
          <div className={styles.selection}>
            <label className={styles.srOnly} htmlFor={`${id}-${task}`}>使用模型 · {copy.title}</label>
            <select
              id={`${id}-${task}`}
              value={preferences.tasks[task] ?? ''}
              disabled={loading || !owner}
              aria-describedby={!selected ? `${id}-${task}-detail` : undefined}
              aria-invalid={!loading && !!owner && stale || undefined}
              onChange={event => setModelPreference(owner, task, event.target.value || null)}
            >
              <option value="">{loading ? '正在读取模型…' : !owner ? '登录后选择模型' : inheritedLabel}</option>
              {stale && preferences.tasks[task] && <option value={preferences.tasks[task]} disabled>原模型已不可用</option>}
              {eligible.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
            </select>
            {!selected && <div id={`${id}-${task}-detail`} className={styles.guidance} data-attention={!loading && !!owner && needsService}>
              <p>{loading ? '正在读取服务…' : !owner ? '登录后可选择模型。' : guidance}</p>
              {!loading && !!owner && needsService && manageAction(stale && eligible.length ? '管理服务' : '连接服务')}
            </div>}
          </div>
        </article>;
      })}</div>
      </section>

      {invalidSteps.length > 0 && <section className={styles.issues} aria-labelledby={`${id}-issues-title`}>
        <div className={styles.sectionHeading}><h3 id={`${id}-issues-title`}>需要更新的步骤</h3><span>{invalidSteps.length} 项选择已失效</span></div>
        {invalidSteps.map(route => stepSelection(route.stepId))}
      </section>}
      <details className={styles.overrides} ref={overrides}>
        <summary><span><strong>按步骤指定</strong><span>{preferences.invalid ? '模型选择记录需要更新' : overrideCount ? `${overrideCount} 个步骤已单独设置` : '所有步骤跟随任务与默认设置'}</span></span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m7 4 6 6-6 6"/></svg></summary>
        <div className={styles.stepList}>
          {normalSteps.length ? normalSteps.map(route => stepSelection(route.stepId)) : <p className={styles.allIssues}>需更新的步骤已在上方列出。</p>}
        </div>
      </details>
    </div>

    <footer className={styles.footer}>
      <p>{!owner ? '登录后按账号保存选择。' : '修改只影响之后发起的调用。'}</p>
      {owner && manageAction('管理已连接的服务')}
    </footer>
  </section>;
}
