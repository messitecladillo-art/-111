'use client';

import Link from 'next/link';
import { useCallback, useId, useSyncExternalStore } from 'react';
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
import { MODEL_CALL_IDS, MODEL_CALLS } from '@/lib/agent/research-stages';
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
  const snapshot = useCallback(() => getStageModelPreferences(owner), [owner]);
  const preferences = useSyncExternalStore(subscribeModelPreferences, snapshot, getServerStageModelPreferences);
  const available = owner ? services : [];
  const routes = MODEL_TASKS.map(task => resolveModelRoute(task, available,
    preferences.tasks[task] ? { [task]: preferences.tasks[task] } : preferences.defaultServiceId ? { [task]: preferences.defaultServiceId } : {}));
  const defaultMissing = !!preferences.defaultServiceId && !available.some(service => service.id === preferences.defaultServiceId);
  const ready = routes.filter(route => route.service).length;
  const summary = loading ? '正在读取服务…' : !owner ? '登录后设置' : ready === MODEL_TASKS.length ? '3 项任务已选择模型' : `${MODEL_TASKS.length - ready} 项任务待选择`;

  function manageAction(label: string) {
    return onManageServices
      ? <button type="button" className={styles.manage} onClick={onManageServices}>{label}<span aria-hidden="true">↗</span></button>
      : <Link className={styles.manage} href="/services">{label}<span aria-hidden="true">↗</span></Link>;
  }

  return <section className={styles.settings} data-self-styled aria-labelledby={`${id}-title`} aria-busy={loading}>
    <header className={styles.header}>
      <div className={styles.intro}>
        <h2 id={`${id}-title`}>按任务选择模型</h2>
        <p>保存命名服务，设置默认模型与各步骤的选择。</p>
      </div>
      <p className={styles.summary} data-ready={!loading && !!owner && ready === MODEL_TASKS.length} role="status">{summary}</p>
    </header>

    <div className={styles.taskList}>
      <article className={styles.task} aria-labelledby={`${id}-default-title`}>
        <div className={styles.taskCopy}><h3 id={`${id}-default-title`}>默认模型</h3><p>各步骤可继承默认设置，也可单独指定。</p></div>
        <div className={styles.selection}><label htmlFor={`${id}-default`}>默认使用</label>
          <select id={`${id}-default`} value={preferences.defaultServiceId ?? ''} disabled={loading || !owner}
            aria-invalid={!loading && !!owner && defaultMissing || undefined}
            onChange={event => setDefaultModelPreference(owner, event.target.value || null)}>
            <option value="">按任务分别选择</option>
            {defaultMissing && <option value={preferences.defaultServiceId!} disabled>原模型已不可用</option>}
            {available.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
          </select>
          {defaultMissing && <p className={styles.routeWarning}>原选择已不可用，请重新选择。</p>}
        </div>
      </article>
      {routes.map(route => {
        const task = route.task, copy = TASK_COPY[task], eligible = eligibleModelServices(task, available);
        const selected = !loading ? route.service : null;
        const stale = route.reason === 'stale_selection';
        const needsService = route.reason === 'no_eligible' || stale;
        const placeholder = loading ? '正在读取模型…' : !owner ? '登录后选择模型' : stale ? '请重新选择模型' : !eligible.length ? '暂无可用模型' : '请选择模型';
        const guidance = stale
          ? eligible.length ? '原先的服务已不可用，请重新选择模型。' : '原先的服务已不可用，连接服务后重新选择。'
          : !eligible.length ? `先连接一个支持${copy.title}的模型服务。` : '从已连接的服务中，为这项任务选择模型。';

        return <article key={task} className={styles.task} aria-labelledby={`${id}-${task}-title`}>
          <div className={styles.taskDetails}>
            <span className={styles.taskIcon}><TaskIcon task={task}/></span>
            <div className={styles.taskCopy}>
              <h3 id={`${id}-${task}-title`}>{copy.title}</h3>
              <p>{copy.purpose}</p>
            </div>
          </div>
          <div className={styles.selection}>
            <label htmlFor={`${id}-${task}`}>使用模型<span className={styles.srOnly}> · {copy.title}</span></label>
            <select
              id={`${id}-${task}`}
              value={preferences.tasks[task] ?? ''}
              disabled={loading || !owner}
              aria-describedby={`${id}-${task}-detail`}
              aria-invalid={!loading && !!owner && stale || undefined}
              onChange={event => setModelPreference(owner, task, event.target.value || null)}
            >
              <option value="">{loading || !owner ? placeholder : '继承默认模型'}</option>
              {stale && preferences.tasks[task] && <option value={preferences.tasks[task]} disabled>原模型已不可用</option>}
              {eligible.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
            </select>
            {selected ? <p id={`${id}-${task}-detail`} className={styles.current}>
              <span>当前模型</span><strong>{selected.label}</strong><span>{selected.model}</span><span className={styles.revision}>配置 v{selected.revision}</span>
            </p> : <div id={`${id}-${task}-detail`} className={styles.guidance} data-attention={!loading && !!owner && needsService}>
              <p>{loading ? '正在读取已连接的模型服务。' : !owner ? '登录后可选择并保存模型。' : guidance}</p>
              {!loading && !!owner && needsService && manageAction(stale && eligible.length ? '管理服务' : '连接服务')}
            </div>}
          </div>
        </article>;
      })}
    </div>

    <div className={styles.taskList}>
      <div className={styles.sectionHeading}><h3>按步骤指定</h3><p>修改只影响之后发起的调用。</p></div>
      {MODEL_CALL_IDS.map(call => {
        const definition = MODEL_CALLS[call], route = resolveStageModelRoute(call, available, preferences);
        const explicit = preferences.steps[call], eligible = eligibleModelServices(definition.capability, available);
        const stale = !!explicit && !eligible.some(service => service.id === explicit);
        const inheritance = route.selectionSource === 'step' ? '本步指定' : route.selectionSource === 'capability' ? '继承任务设置' : '继承默认设置';
        return <article className={styles.task} key={call}>
          <div className={styles.taskCopy}><h3>{definition.label}</h3></div>
          <div className={styles.selection}><label htmlFor={`${id}-${call}`}>使用模型</label>
            <select id={`${id}-${call}`} value={explicit ?? ''} disabled={loading || !owner}
              aria-invalid={!loading && !!owner && route.reason === 'stale_selection' || undefined}
              aria-describedby={`${id}-${call}-route`} onChange={event => setStageModelPreference(owner, call, event.target.value || null)}>
              <option value="">继承默认设置</option>
              {stale && <option value={explicit} disabled>原模型已不可用</option>}
              {eligible.map(service => <option key={service.id} value={service.id}>{service.label} · {service.model}</option>)}
            </select>
            <p id={`${id}-${call}-route`} className={route.reason === 'stale_selection' ? styles.routeWarning : styles.current}>
              {loading ? '正在读取服务…' : !owner ? '登录后选择模型' : route.service ? `${route.service.label} · ${inheritance}` : route.reason === 'stale_selection' ? '原选择已不可用，请重新选择。' : '尚未选择可用模型'}
            </p>
          </div>
        </article>;
      })}
    </div>

    <footer className={styles.footer}>
      <p>{!owner ? '登录后，你的模型选择将按账号保存。' : '同一模型可用于多项任务，也可分别选择。'}</p>
      {owner && manageAction('管理已连接的服务')}
    </footer>
  </section>;
}
