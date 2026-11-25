'use client';

import dynamic from 'next/dynamic';
import { useId, useMemo, useReducer, useState } from 'react';
import { newQuestion, newQuestionnaire } from '@/lib/questionnaire';
import { generatePanel, PANEL_TEMPLATES } from '@/lib/silicon/persona';
import { demoRun } from '@/lib/silicon/run';
import styles from './LandingDemo.module.css';

const AtypicaLiveTheater = dynamic(() => import('@/components/silicon/AtypicaLiveTheater'), {
  ssr: false,
  loading: () => <div role="status" aria-live="polite" style={{ padding: 32, color: '#a1a1aa' }}>正在准备实时预测试演播室…</div>,
});

type DemoView = 'questionnaire' | 'sample' | 'report' | 'live';
export type SampleMode = 'concentrated' | 'distributed';
export type DemoQuestion = { id: string; title: string; short: string; purpose: string; options: string[] };
export type DemoState = { questions: DemoQuestion[]; history: DemoQuestion[][]; editingKey: string | null; sampleMode: SampleMode };
export type DemoAction =
  | { type: 'title'; id: string; value: string }
  | { type: 'option'; id: string; index: number; value: string }
  | { type: 'add'; id: string }
  | { type: 'end-edit' }
  | { type: 'undo' }
  | { type: 'reset' }
  | { type: 'sample'; mode: SampleMode };

export const DEMO_OPTION_LIMIT = 6;
const HISTORY_LIMIT = 32;
const INITIAL_QUESTIONS: DemoQuestion[] = [
  {
    id: 'q1', short: '选择因素',
    title: '回想最近一次到店，最影响你选择这家店的因素是什么？',
    purpose: '从最近一次具体选择入手，把泛泛的“喜欢”转为可比较的选择因素。',
    options: ['距离更近，顺路方便', '餐品口味符合偏好', '价格或套餐更合适', '同行者或朋友推荐'],
  },
  {
    id: 'q2', short: '到店情境',
    title: '最近一次到这家店消费，发生在以下哪个时段？',
    purpose: '记录选择发生的情境。后续比较午间和晚间，也要检查两类样本来自哪里。',
    options: ['工作日午间', '工作日晚间', '周末午间', '周末晚间'],
  },
  {
    id: 'q3', short: '改善方向',
    title: '如果只能先改善一件事，你最希望这家店改进什么？',
    purpose: '让研究问题连接到行动优先级；具体建议仍需结合调查结果和经营约束。',
    options: ['缩短排队等候', '改善座位与环境', '提高餐品稳定性', '调整价格与套餐'],
  },
];

export function createDemoState(): DemoState {
  return { questions: INITIAL_QUESTIONS.map(q => ({ ...q, options: [...q.options] })), history: [], editingKey: null, sampleMode: 'concentrated' };
}

/** An edit session is one undo step; switching fields or adding an option starts the next. */
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'reset') return createDemoState();
  if (action.type === 'end-edit') return { ...state, editingKey: null };
  if (action.type === 'sample') return { ...state, sampleMode: action.mode, editingKey: null };
  if (action.type === 'undo') {
    if (!state.history.length) return state;
    return { ...state, questions: state.history[state.history.length - 1], history: state.history.slice(0, -1), editingKey: null };
  }
  const question = state.questions.find(q => q.id === action.id);
  if (!question) return state;
  let next: DemoQuestion;
  let editingKey: string | null = null;
  if (action.type === 'add') {
    if (question.options.length >= DEMO_OPTION_LIMIT) return state;
    next = { ...question, options: [...question.options, ''] };
  } else if (action.type === 'title') {
    const value = action.value.slice(0, 180);
    if (value === question.title) return state;
    next = { ...question, title: value };
    editingKey = `${action.id}:title`;
  } else {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= question.options.length) return state;
    const value = action.value.slice(0, 80);
    if (value === question.options[action.index]) return state;
    next = { ...question, options: question.options.map((option, i) => i === action.index ? value : option) };
    editingKey = `${action.id}:option:${action.index}`;
  }
  const history = editingKey !== null && state.editingKey === editingKey
    ? state.history
    : [...state.history, state.questions].slice(-HISTORY_LIMIT);
  return { ...state, questions: state.questions.map(q => q.id === question.id ? next : q), history, editingKey };
}

export function sampleSummary(mode: SampleMode) {
  const counts = mode === 'concentrated' ? [[24, 0], [0, 0], [0, 0]] : [[4, 4], [4, 4], [4, 4]];
  const rows = ['门店周边', '商圈东侧', '商圈西侧'].map((label, i) => ({ label, noon: counts[i][0], evening: counts[i][1] }));
  const total = rows.reduce((sum, row) => sum + row.noon + row.evening, 0);
  return {
    rows, total,
    areas: rows.filter(row => row.noon + row.evening > 0).length,
    periods: Number(rows.some(row => row.noon > 0)) + Number(rows.some(row => row.evening > 0)),
  };
}

function ViewIcon({ view }: { view: DemoView }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {view === 'questionnaire' ? <><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="m8 8 1 1 2-2m-3 6 1 1 2-2m3-4h2m-2 5h2M8 17h8"/></>
      : view === 'sample' ? <><path d="M4 20h16M6 17v-5m6 5V5m6 12V9"/><circle cx="6" cy="9" r="1"/><circle cx="18" cy="6" r="1"/></>
      : view === 'report' ? <><path d="M14 3H6a1 1 0 0 0-1 1v16h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/></>
      : <><circle cx="12" cy="12" r="8"/><path d="m10 8.5 6 3.5-6 3.5V8.5Z"/></>}
  </svg>;
}

const VIEW_LABELS: Record<DemoView, string> = { questionnaire: '问卷设计', sample: '样本核验', report: '报告预览', live: '预测试演示' };

export default function LandingDemo() {
  const [view, setView] = useState<DemoView>('questionnaire');
  const [selected, setSelected] = useState(0);
  const [state, dispatch] = useReducer(demoReducer, undefined, createDemoState);
  const [notice, setNotice] = useState('可以直接修改题目和选项，试着把问题问得更具体。');
  const id = useId();
  const question = state.questions[selected];
  const sample = sampleSummary(state.sampleMode);
  const distributed = state.sampleMode === 'distributed';

  const liveTheaterBundle = useMemo(() => {
    if (view !== 'live') return null;
    const design = newQuestionnaire();
    design.title = '人们为什么选择这家店？';
    design.population = state.sampleMode === 'distributed' ? '三个商圈与两个时段的到店消费人群' : '门店周边雨天午间到店人群';
    design.objective = '把生活场景直觉转化为可比较的选店驱动因素与改善优先级';
    design.questions = state.questions.map((dq, i) => {
      const q = newQuestion(`demo-${dq.id}`, `Q${i + 1}`);
      q.text = dq.title;
      q.type = 'single';
      q.choices = dq.options.filter(Boolean).map((opt, oi) => ({ code: String(oi + 1), label: opt }));
      if (!q.choices.length) q.choices = [{ code: '1', label: '一般' }, { code: '2', label: '较好' }];
      return q;
    });
    const ratingQ = newQuestion('demo-sat', 'SAT_OVR');
    ratingQ.text = state.sampleMode === 'distributed'
      ? '结合本次到店时段与商圈环境，你对整体消费体验的满意程度如何？'
      : '结合雨天午间到店体验，你对整体消费服务的满意程度如何？';
    ratingQ.type = 'likert';
    ratingQ.min = 1;
    ratingQ.max = 5;
    ratingQ.minLabel = '很不满意';
    ratingQ.maxLabel = '非常满意';
    design.questions.push(ratingQ);

    const openQ = newQuestion('demo-idea', 'IDEA');
    openQ.text = '如果只能先改一处地方，你会先动哪里？';
    openQ.type = 'text';
    design.questions.push(openQ);

    const attrs = PANEL_TEMPLATES.residents.attributes;
    const panel = generatePanel({ attributes: attrs, size: 24, allocation: 'quota', seed: 42, background: design.population });
    const runSettings = {
      engine: 'demo' as const,
      memory: 'carry' as const,
      shuffleOptions: false,
      scenarios: [],
      models: [],
    };
    const run = demoRun(design, attrs, panel, runSettings);
    return { design, attrs, panel, runSettings, run };
  }, [view, state.questions, state.sampleMode]);

  function chooseView(next: DemoView) {
    dispatch({ type: 'end-edit' }); setView(next);
    setNotice(next === 'questionnaire' ? '可以直接修改题目和选项，试着把问题问得更具体。'
      : next === 'sample' ? '切换采样方式，观察相同数量的记录覆盖了谁。'
      : next === 'live' ? '同步你刚编辑的题目与采样方式，按同等结构实时演示预测试流程。'
      : '报告中的样本数字与当前合成示例一致。点击依据可以追溯输入。');
  }
  function chooseSample(mode: SampleMode) {
    dispatch({ type: 'sample', mode });
    setNotice(mode === 'distributed' ? '仍是 24 条合成记录，现在覆盖 3 个区域、2 个时段。' : '仍是 24 条合成记录，集中在同一门店的雨天午间。');
  }

  return <div className={styles.demo} aria-label="证见交互产品示例">
    <div className={styles.chrome}>
      <div className={styles.windowDots} aria-hidden="true"><i/><i/><i/></div>
      <span className={styles.windowLabel}>证见 · 交互示例项目</span>
    </div>
    <div className={styles.projectBar}>
      <div><span className={styles.projectEyebrow}>一个关于日常选择的研究</span><h3>人们为什么选择这家店？</h3></div>
      <span className={styles.exampleStamp}>示例项目<br/><strong>01 · 研究立意</strong></span>
    </div>
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <span className={styles.directoryLabel}>项目目录</span>
        <div className={styles.navigation} role="group" aria-label="产品演示视图">
          {(Object.keys(VIEW_LABELS) as DemoView[]).map((item, index) => <button key={item} type="button" aria-pressed={view === item} onClick={() => chooseView(item)}>
            <ViewIcon view={item}/><span>{VIEW_LABELS[item]}</span><small>0{index + 1}</small>
          </button>)}
        </div>
        <div className={styles.sidebarFoot}><span>Q → D → I → A</span><p>每一步，<br/>都留有依据。</p></div>
      </aside>
      <div className={styles.canvas}>
        <div className={styles.toolbar}>
          <span className={styles.breadcrumb}>示例项目 <i>·</i> {VIEW_LABELS[view]}</span>
          <div className={styles.historyActions}>
            <button type="button" disabled={!state.history.length} onClick={() => { dispatch({ type: 'undo' }); setNotice('已撤销上一次问卷修改。'); }} aria-label="撤销上一次问卷修改"><span aria-hidden="true">↶</span> 撤销修改</button>
            <button type="button" onClick={() => { dispatch({ type: 'reset' }); setSelected(0); setNotice('题目、选项和采样方式已恢复为初始示例。'); }}>重置示例</button>
          </div>
        </div>

        {view === 'questionnaire' && <div className={styles.questionnaire} role="region" aria-label="问卷设计示例">
          <div className={styles.viewHeading}><span className={styles.eyebrow}>01 · 把问题问准</span><h4>把一个好奇，写成可回答的问题。</h4><p>点击题目或选项即可改写。</p></div>
          <div className={styles.questionIndex} role="group" aria-label="选择示例题目">{state.questions.map((q, index) => <button type="button" key={q.id} aria-pressed={selected === index} onClick={() => { setSelected(index); dispatch({ type: 'end-edit' }); setNotice(`正在编辑第 ${index + 1} 题“${q.short}”。`); }}><span>0{index + 1}</span>{q.short}</button>)}</div>
          <div className={styles.questionEditor}>
            <div className={styles.questionMeta}><span>Q{selected + 1}</span><span>单选题</span><span>{question.options.length} 个选项</span></div>
            <label className={styles.titleLabel} htmlFor={`${id}-question`}>题目文字</label>
            <textarea id={`${id}-question`} aria-label="题目文字" className={styles.questionTitle} value={question.title} rows={2} maxLength={180} placeholder="写下一个清楚、具体的问题" onBlur={() => dispatch({ type: 'end-edit' })} onChange={event => { dispatch({ type: 'title', id: question.id, value: event.target.value }); setNotice('题目已修改，可撤销。'); }}/>
            <div className={styles.options}>{question.options.map((option, index) => <label key={`${question.id}-${index}`} className={styles.option}><span aria-hidden="true">{String.fromCharCode(65 + index)}</span><input aria-label={`第 ${selected + 1} 题选项 ${String.fromCharCode(65 + index)}`} value={option} maxLength={80} placeholder="填写选项内容" onBlur={() => dispatch({ type: 'end-edit' })} onChange={event => { dispatch({ type: 'option', id: question.id, index, value: event.target.value }); setNotice('选项已修改。'); }}/></label>)}</div>
            <div className={styles.optionFooter}><button type="button" className={styles.addOption} disabled={question.options.length >= DEMO_OPTION_LIMIT} onClick={() => { dispatch({ type: 'add', id: question.id }); setNotice('已添加一个可编辑选项。'); }}><span aria-hidden="true">＋</span>{question.options.length >= DEMO_OPTION_LIMIT ? '已达到 6 个选项' : '添加选项'}</button><span>最多 6 项 · 可撤销</span></div>
          </div>
          <div className={styles.reason}><span>原题设计思路</span><p>{question.purpose}</p></div>
        </div>}

        {view === 'sample' && <div className={styles.sample} role="region" aria-label="合成样本核验示例">
          <div className={styles.viewHeading}><span className={styles.eyebrow}>02 · 核验样本代表性</span><h4>一样的数量，不一样的覆盖。</h4><p>以下 24 条记录全部为合成示例。切换采样方式，比较区域和时段。</p></div>
          <div className={styles.scenarios} role="group" aria-label="合成采样方式"><button type="button" aria-pressed={!distributed} onClick={() => chooseSample('concentrated')}><span>方式 A</span>同一家店 · 雨天午间</button><button type="button" aria-pressed={distributed} onClick={() => chooseSample('distributed')}><span>方式 B</span>多区域 · 多时段</button></div>
          <div className={styles.sampleNumbers}><div><strong>{sample.total}</strong><span>条合成记录</span></div><div><strong>{sample.areas}<small> / 3</small></strong><span>覆盖区域</span></div><div><strong>{sample.periods}<small> / 2</small></strong><span>覆盖时段</span></div></div>
          <figure className={styles.chart}>
            <figcaption>记录的区域与时段分布 <span>（单位为条）</span></figcaption>
            <div className={styles.legend}><span><i/>午间</span><span><i/>晚间</span></div>
            {sample.rows.map(row => <div className={styles.chartRow} key={row.label}><div className={styles.chartLabel}><strong>{row.label}</strong><span>午间 {row.noon} · 晚间 {row.evening}</span></div><div className={styles.barTrack} role="img" aria-label={`${row.label}午间 ${row.noon} 条，晚间 ${row.evening} 条，共 ${row.noon + row.evening} 条`}><span className={styles.noonBar} style={{ width: `${row.noon / sample.total * 100}%` }}/><span className={styles.eveningBar} style={{ width: `${row.evening / sample.total * 100}%` }}/></div></div>)}
            <div className={styles.chartAxis} aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
          </figure>
          <div className={styles.sampleReading}><span>{distributed ? '覆盖更分散，仍需检查代表性。' : '先看见了谁，也要问漏掉了谁。'}</span><p>{distributed ? '24 条记录覆盖 3 个区域、2 个时段，仍属非随机样本。判断代表性还需核对招募方式、拒访与未到店人群。' : '记录仅覆盖雨天午间的到店者，遗漏其他区域、时段与未到店人群，结论只能描述这批记录。'}</p></div>
        </div>}

        {view === 'report' && <div className={styles.report} role="region" aria-label="研究报告结构示例">
          <div className={styles.reportMeta}><span>研究札记 · 01</span><span>结构化报告片段 · 合成示例</span></div>
          <div className={styles.reportTitle}><span>关于一家店的选择研究</span><h4>先确认看见了谁，<br/>再解释为什么选择。</h4><p>研究备忘录 · 当前示例输入</p></div>
          <div className={styles.reportBody}>
            <div className={styles.reportSection}><span>01</span><div><h5>研究问题</h5><p>比较具体到店情境下的选择因素，为门店改善确定值得进一步验证的方向。</p><details className={styles.evidence}><summary>查看题目依据 Q1</summary><blockquote>{state.questions[0].title || '待填写题目'}</blockquote><p>当前共有选项“{state.questions[0].options.map(option => option || '待填写').join('”“')}”。</p></details></div></div>
            <div className={styles.reportSection}><span>02</span><div><h5>证据与适用范围</h5><p>当前 {sample.total} 条合成记录覆盖 {sample.areas} 个区域、{sample.periods} 个时段。{distributed ? '区域与时段更分散，仍需验证招募方式和目标人群覆盖。' : '记录全部来自门店周边的雨天午间，无法描述其他情境。'}</p><details className={styles.evidence}><summary>查看样本依据 S1</summary><ul>{sample.rows.map(row => <li key={row.label}>{row.label}计午间 {row.noon} 条、晚间 {row.evening} 条。</li>)}</ul><small>数据取自本页固定合成示例，与“样本核验”所选方式实时同步。</small></details></div></div>
            <div className={styles.reportSection}><span>03</span><div><h5>下一步行动</h5><p>{distributed ? '检查未到店人群与拒访记录，再决定是否追加样本。收到真实作答后，按情境比较选择因素。' : '先补充其他时段、其他区域及未到店人群的观察，再比较不同情境下的选择因素。'}</p></div></div>
          </div>
          <div className={styles.reportEnd}><span>问题 → 输入 → 判断 → 下一步</span><p>正式工作台可编辑报告并本地导出可编辑文档。</p><a href="/workspace#editor">打开报告编辑工具 <span aria-hidden="true">↗</span></a></div>
        </div>}
        {view === 'live' && liveTheaterBundle && <div style={{ padding: 12 }} role="region" aria-label="实时预测试演播室">
          <AtypicaLiveTheater
            design={liveTheaterBundle.design}
            attributes={liveTheaterBundle.attrs}
            personas={liveTheaterBundle.panel}
            settings={liveTheaterBundle.runSettings}
            run={liveTheaterBundle.run}
            autoPlay
          />
        </div>}

        <div className={styles.statusLine} role="status" aria-live="polite"><span aria-hidden="true"/> {notice}</div>
      </div>
    </div>
  </div>;
}
