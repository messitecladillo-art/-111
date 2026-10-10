'use client';

import { Fragment } from 'react';
import type { LabConfig } from '@/lib/silicon/config';
import { QUESTION_TYPES, questionnaireIssues, type Questionnaire } from '@/lib/questionnaire';
import { SILICON_LIMITS } from '@/lib/silicon/persona';
import { SCENARIO_TOKEN, placeholderIssues, type Scenario } from '@/lib/silicon/run';
import styles from './SiliconLab.module.css';
import { useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

type Props = { config: LabConfig; update: (patch: Partial<LabConfig>) => void; design: Questionnaire; studioDesign: Questionnaire | null; studioPending: boolean };

const TOKEN = /(\{情境\}|\{[A-Za-z][A-Za-z0-9_]{0,31}\})/g;
function Highlighted({ text }: { text: string }) {
  return <>{text.split(TOKEN).map((part, i) => i % 2 ? <mark key={i} className={styles.token}>{part}</mark> : <Fragment key={i}>{part}</Fragment>)}</>;
}

export default function SurveySetup({ config, update, design, studioDesign, studioPending }: Props) {
  const scenarios = config.scenarios;
  const sourceRef = useKeyedListMotion<HTMLDivElement>({ ids: ['studio', 'example'], activeId: config.designSource, markerAxis: 'horizontal' });
  const setScenarios = (next: Scenario[]) => update({ scenarios: next });
  const blockers = questionnaireIssues(design).filter(i => i.level === 'blocker');
  const tokens = placeholderIssues(design, scenarios);
  const index = new Map(design.questions.map((q, i) => [q.id, i + 1]));

  return <div className={styles.designer}>
    <section className={styles.block} aria-labelledby="sx-source">
      <div className={styles.blockHead}><h3 id="sx-source">要预测试的问卷</h3><p>使用当前题干、选项与跳转逻辑，保留原设计。</p></div>
      <div ref={sourceRef} className={styles.sourceRow} role="radiogroup" aria-label="问卷来源"><span className={styles.motionMarker} data-motion-marker aria-hidden="true"/>
        <button type="button" data-motion-id="studio" role="radio" aria-checked={config.designSource === 'studio'} disabled={!studioDesign} className={styles.sourceCard} onClick={() => update({ designSource: 'studio' })}>
          <span className={styles.sourceKicker}>问卷设计 · 当前草稿</span>
          <strong>{studioDesign ? studioDesign.title || '未命名问卷' : '尚未打开问卷设计'}</strong>
          <small>{studioDesign ? `${studioDesign.questions.length} 道题${studioPending ? ' · 有未提交的编辑，按当前内容预测试' : ''}` : '先在「问卷设计」中编辑或载入问卷，这里会自动同步。'}</small>
        </button>
        <button type="button" data-motion-id="example" role="radio" aria-checked={config.designSource === 'example'} className={styles.sourceCard} onClick={() => update({ designSource: 'example' })}>
          <span className={styles.sourceKicker}>教学示例</span>
          <strong>校园快递取件体验</strong>
          <small>8 道题，演示情境、答案传递、反向题与跳转；不是经过验证的量表。</small>
        </button>
      </div>
      {!studioDesign && <p className={styles.hint}><a href="#design">打开问卷设计 →</a></p>}
    </section>

    <section className={styles.block} aria-labelledby="sx-questions">
      <div className={styles.blockHead}><h3 id="sx-questions">{design.title || '未命名问卷'}</h3><p>{design.questions.length} 道题 · 高亮处为情境与答案传递占位符。</p></div>
      {blockers.length > 0 && <p className={styles.warnNote} role="status"><b>结构问题</b>问卷还有 {blockers.length} 个阻断项。可以照常预测试，模拟受访者会在这些题上报告困惑；正式发放前请先在问卷设计中修正。</p>}
      <ol className={styles.questionList}>
        {design.questions.map(q => <li key={q.id}>
          <span className={styles.qVar}>{q.variable || '—'}</span>
          <span className={styles.qText}><Highlighted text={q.text || '（题干为空）'}/>{q.condition && <small>仅当第 {index.get(q.condition.questionId) ?? '?'} 题选 {q.condition.codes.join(' / ')} 时显示</small>}</span>
          <span className={styles.qType}>{QUESTION_TYPES[q.type]}{q.reverse ? ' · 反向' : ''}</span>
        </li>)}
      </ol>
    </section>

    <section className={styles.block} aria-labelledby="sx-scenarios">
      <div className={styles.blockHead}><h3 id="sx-scenarios">情境参数化</h3><p>题干中的 <mark className={styles.token}>{SCENARIO_TOKEN}</mark> 会被每个情境替换；每位硅基受访者在每个情境下各答一遍，结果可按情境比较。</p></div>
      <div className={styles.scenarioList}>
        {scenarios.map((s, i) => <div key={s.id} className={styles.scenarioRow}>
          <label><span>情境名称</span><input value={s.label} maxLength={20} onChange={e => setScenarios(scenarios.map((x, k) => k === i ? { ...x, label: e.target.value } : x))}/></label>
          <label className={styles.grow}><span>替换进题干的文字</span><input value={s.text} maxLength={80} onChange={e => setScenarios(scenarios.map((x, k) => k === i ? { ...x, text: e.target.value } : x))}/></label>
          <button type="button" className={styles.iconButton} aria-label={`删除情境「${s.label || i + 1}」`} onClick={() => setScenarios(scenarios.filter((_, k) => k !== i))}>×</button>
        </div>)}
        {!scenarios.length && <p className={styles.hint}>未设置情境：所有题目按原文作答一次。</p>}
        <button type="button" className={styles.linkButton} disabled={scenarios.length >= SILICON_LIMITS.scenarios} onClick={() => setScenarios([...scenarios, { id: `sc-${Date.now().toString(36)}`, label: '', text: '' }])}>＋ 添加情境（最多 {SILICON_LIMITS.scenarios} 个）</button>
      </div>
    </section>

    <section className={styles.block} aria-labelledby="sx-memory">
      <div className={styles.blockHead}><h3 id="sx-memory">记忆与答案传递</h3><p>在题干中写 <mark className={styles.token}>{'{变量名}'}</mark>（如 <mark className={styles.token}>{'{FREQ}'}</mark>），会替换成这位受访者此前对该题的回答。</p></div>
      <fieldset className={styles.segmented}><legend>作答方式</legend>
        <label><input type="radio" name="sx-memory" checked={config.memory === 'carry'} onChange={() => update({ memory: 'carry' })}/><span>连续作答<small>保留前序问答，适合整卷走查</small></span></label>
        <label><input type="radio" name="sx-memory" checked={config.memory === 'independent'} onChange={() => update({ memory: 'independent' })}/><span>逐题独立<small>每题单独提问、互不影响，便于检查单题表述；模型调用次数更多</small></span></label>
      </fieldset>
      <label className={styles.checkLine}><input type="checkbox" checked={config.shuffleOptions} onChange={e => update({ shuffleOptions: e.target.checked })}/><span>随机展示选项顺序，按原编码回收答案</span></label>
      {tokens.length > 0 && <ul className={styles.issueList} role="status">{tokens.map(t => <li key={t}>{t}</li>)}</ul>}
    </section>
  </div>;
}
