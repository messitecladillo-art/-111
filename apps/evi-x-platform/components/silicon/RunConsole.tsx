'use client';

import type { LabConfig } from '@/lib/silicon/config';
import type { Questionnaire } from '@/lib/questionnaire';
import { SILICON_LIMITS } from '@/lib/silicon/persona';
import { estimateCalls, type RunProgress, type RunSettings } from '@/lib/silicon/run';
import styles from './SiliconLab.module.css';

export type ModelOption = { id: string; label: string; detail: string };
type Props = {
  config: LabConfig; update: (patch: Partial<LabConfig>) => void; design: Questionnaire; personas: number; settings: RunSettings;
  models: ModelOption[] | null; consentLabel: string; consent: boolean; setConsent: (v: boolean) => void;
  blockers: string[]; running: boolean; progress: RunProgress | null; error: string; onRun: () => void; onCancel: () => void; hasRun: boolean;
};

export default function RunConsole({ config, update, design, personas, settings, models, consentLabel, consent, setConsent, blockers, running, progress, error, onRun, onCancel, hasRun }: Props) {
  const scenarios = Math.max(1, settings.scenarios.length);
  const engines = config.engine === 'model' ? Math.max(1, config.models.length) : 1;
  const responses = personas * scenarios * engines;
  const calls = config.engine === 'model' ? estimateCalls(design, personas, settings) : 0;
  const modelReady = config.engine === 'demo' || (!!models && config.models.length > 0 && consent);
  const toggleModel = (id: string) => update({ models: config.models.includes(id) ? config.models.filter(m => m !== id) : [...config.models, id].slice(0, SILICON_LIMITS.models) });
  return <div className={styles.designer}>
    <section className={styles.block} aria-labelledby="sx-engine">
      <div className={styles.blockHead}><h3 id="sx-engine">选择作答引擎</h3><p>两种引擎得到的都是模拟回答，导出时一律标记为模拟数据。</p></div>
      <div className={styles.sourceRow} role="radiogroup" aria-label="作答引擎">
        <button type="button" role="radio" aria-checked={config.engine === 'demo'} className={styles.sourceCard} disabled={running} onClick={() => update({ engine: 'demo' })}>
          <span className={styles.sourceKicker}>离线演示引擎 · 无需密钥</span>
          <strong>走查流程与界面</strong>
          <small>在浏览器内按种子生成可复现的随机答案，用来检查跳转、答案传递和分析流程。答案不代表任何人，不能当作预测试结论。</small>
        </button>
        <button type="button" role="radio" aria-checked={config.engine === 'model'} className={styles.sourceCard} disabled={running || !models} onClick={() => update({ engine: 'model' })}>
          <span className={styles.sourceKicker}>语言模型 · 使用你的 API 额度</span>
          <strong>真正的硅基预测试</strong>
          <small>{models ? '由你在「我的模型服务」中配置的模型扮演每位受访者，最多同时比较 3 个模型。' : '在「我的项目」中打开项目后可用：调用经服务端转发，密钥不经过浏览器。'}</small>
        </button>
      </div>
      {config.engine === 'model' && models && <div className={styles.modelPick}>
        <p className={styles.small}>选择 1–{SILICON_LIMITS.models} 个模型。多模型可检验结论是否依赖某一个模型。</p>
        {models.length ? <ul>{models.map(m => <li key={m.id}><label className={styles.checkLine}><input type="checkbox" checked={config.models.includes(m.id)} disabled={running || (!config.models.includes(m.id) && config.models.length >= SILICON_LIMITS.models)} onChange={() => toggleModel(m.id)}/><span><strong>{m.label}</strong><small>{m.detail}</small></span></label></li>)}</ul> : <p className={styles.hint}>还没有可用的模型服务。<a href="/services">去配置我的模型服务 →</a></p>}
        <label className={styles.checkLine}><input type="checkbox" checked={consent} disabled={running} onChange={e => setConsent(e.target.checked)}/><span>{consentLabel}</span></label>
      </div>}
    </section>

    <section className={styles.block} aria-labelledby="sx-launch">
      <div className={styles.blockHead}><h3 id="sx-launch">运行</h3><p>运行不会修改问卷，也不会把模拟回答写入任何真实数据集。</p></div>
      <div className={styles.launch}>
        <dl className={styles.facts}>
          <div><dt>硅基受访者</dt><dd>{personas}</dd></div>
          <div><dt>情境</dt><dd>{settings.scenarios.length ? settings.scenarios.length : '无'}</dd></div>
          <div><dt>引擎</dt><dd>{engines}</dd></div>
          <div><dt>模拟回答</dt><dd>{responses}</dd></div>
          {config.engine === 'model' && <div><dt>预计模型调用</dt><dd>{calls}</dd></div>}
        </dl>
        {blockers.length > 0 && <ul className={styles.issueList} role="status">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
        {error && <p className={styles.errorNote} role="alert">{error}</p>}
        {running && progress && <div className={styles.progress} role="progressbar" aria-label="运行进度" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}/><span>{progress.done}/{progress.total}</span></div>}
        <div className={styles.launchActions}>
          {running ? <button type="button" onClick={onCancel}>{config.engine === 'model' ? '停止等待（已发出的调用仍会计费）' : '停止'}</button>
            : <button type="button" className={styles.gold} disabled={!!blockers.length || !modelReady || !personas} onClick={onRun}>{hasRun ? '重新运行' : '开始运行'}</button>}
        </div>
      </div>
    </section>
  </div>;
}
