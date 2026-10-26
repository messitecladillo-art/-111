'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DatasetValue } from '@/lib/canvas/execute';
import { HANDBOOK, HANDBOOK_REFERENCES, numberedFormulas, type CalcRef, type CalculatorId, type HandbookChapter } from '@/lib/sampling-handbook';
import { useKeyedListMotion } from '../motion/useWorkspaceMotion';
import { Formula } from '../math/Tex';
import SamplingDesigner from './SamplingDesigner';
import DesignBuilder from './DesignBuilder';
import type { ReportInsert } from '@/lib/report-insert';
import SamplingLab from './SamplingLab';
import { PowerCalc, SrsCalc } from './calculators/basic';
import { CumRootFCalc, StratifiedCalc, StratifiedPlanCalc } from './calculators/stratified';
import { AuxiliaryCalc } from './calculators/auxiliary';
import { PpsCalc } from './calculators/unequal';
import { ClusterCalc, TwoStageCalc } from './calculators/cluster';
import { SelectionCalc, SystematicCalc } from './calculators/systematic';
import { NonresponseCalc, TwoPhaseCalc } from './calculators/twophase';
import { RrCalc } from './calculators/sensitive';
import { ComplexCalc, WeightingCalc, type SharedWeights } from './calculators/dataset';
import { Rich } from './ui';
import styles from './Sampling.module.css';

type Page = 'guide' | 'builder' | 'size' | 'selection' | 'estimate' | 'complex' | 'weighting' | 'lab' | 'refs' | `ch-${string}`;
type NavItem = { id: Page; label: string; number?: string };
const NAV: { label: string; items: NavItem[] }[] = [
  { label: '方案设计', items: [{ id: 'guide', label: '选择抽样方式' }, { id: 'builder', label: '多阶段抽样方案' }, { id: 'size', label: '样本量与分层分配' }, { id: 'selection', label: '抽取样本' }] },
  { label: '回收后', items: [{ id: 'estimate', label: '精度与估计' }, { id: 'complex', label: '复杂样本估计' }, { id: 'weighting', label: '加权调整' }] },
  { label: '方法手册', items: HANDBOOK.map(c => ({ id: `ch-${c.id}` as Page, label: c.title, number: String(c.number) })) },
  { label: '理解与引用', items: [{ id: 'lab', label: '抽样分布实验室' }, { id: 'refs', label: '参考文献' }] },
];
const ALL_PAGES = NAV.flatMap(g => g.items.map(i => i.id));
const PAGE_LINK: Partial<Record<CalculatorId, Page>> = { size: 'size', builder: 'builder', complex: 'complex', weighting: 'weighting', selection: 'selection' };
const ESTIMATORS = [
  ['srs', '简单随机'], ['stratified', '分层'], ['auxiliary', '比率与回归'], ['cluster', '整群'], ['two-stage', '二阶'], ['systematic', '系统'], ['pps', '不等概率'], ['two-phase', '二重抽样'], ['rr', '随机化回答'],
] as const;
const ESTIMATOR_MODE: Record<string, string> = { srs: 'mean', stratified: 'mean', auxiliary: 'known', cluster: 'estimate', 'two-stage': 'estimate', systematic: 'estimate', pps: 'hh', 'two-phase': 'strata', rr: 'estimate' };

function calculator(ref: { id: CalculatorId; mode?: string }): ReactNode {
  const m = ref.mode;
  switch (ref.id) {
    case 'srs': return <SrsCalc mode={m} />;
    case 'power': return <PowerCalc />;
    case 'stratified': return <StratifiedCalc mode={m} />;
    case 'stratified-size': return <StratifiedPlanCalc mode={m} />;
    case 'cumrootf': return <CumRootFCalc />;
    case 'auxiliary': return <AuxiliaryCalc mode={m} />;
    case 'pps': return <PpsCalc mode={m} />;
    case 'cluster': return <ClusterCalc mode={m} />;
    case 'two-stage': return <TwoStageCalc mode={m} />;
    case 'systematic': return <SystematicCalc mode={m} />;
    case 'two-phase': return <TwoPhaseCalc mode={m} />;
    case 'nonresponse': return <NonresponseCalc />;
    case 'rr': return <RrCalc mode={m} />;
    case 'selection': return <SelectionCalc />;
    default: return null;
  }
}

function TryIt({ calc, onOpen }: { calc: CalcRef; onOpen: (page: Page) => void }) {
  const [mounted, setMounted] = useState(false);
  const page = PAGE_LINK[calc.id];
  if (page) return <div className={styles.tryIt}><button type="button" className={styles.linkButton} onClick={() => onOpen(page)}>{calc.label} →</button></div>;
  return <details className={styles.tryIt} onToggle={e => { if (e.currentTarget.open) setMounted(true); }}><summary>试算：{calc.label}</summary>{mounted && <div>{calculator(calc)}</div>}</details>;
}

function ChapterView({ chapter, onOpen }: { chapter: HandbookChapter; onOpen: (page: Page) => void }) {
  const numbers = useMemo(() => numberedFormulas(chapter), [chapter]);
  return <>
    <header className={styles.chapterHead}><span className={styles.number}>第 {chapter.number} 章 · {chapter.english.toUpperCase()}</span><h3>{chapter.title}</h3><p><Rich text={chapter.lede} /></p></header>
    {chapter.methods.map(m => <article key={m.id} id={`method-${m.id}`} className={styles.method}>
      <div className={styles.methodHead}><h4>{m.title}</h4>{m.english && <small>{m.english}</small>}</div>
      <p className={styles.methodSummary}><Rich text={m.summary} /></p>
      {(m.when || m.procedure) && <div className={styles.methodGrid}>
        {m.when && <section><h5>适用情形</h5><ul>{m.when.map(w => <li key={w}><Rich text={w} /></li>)}</ul></section>}
        {m.procedure && <section><h5>实施步骤</h5><ol>{m.procedure.map(p => <li key={p}><Rich text={p} /></li>)}</ol></section>}
      </div>}
      <div className={styles.formulaBlock}><h5>公式</h5><div className={styles.formulaList}>{m.formulas.map((f, i) => <div key={f.label}>
        <Formula label={f.label.includes('$') ? <Rich text={f.label} /> : f.label} tex={f.tex} number={numbers.get(`${m.id}:${i}`)} />
        {f.legend && <p className={styles.legend}><Rich text={f.legend} /></p>}
      </div>)}</div></div>
      {m.notes && <ul className={styles.notes}>{m.notes.map(n => <li key={n}><Rich text={n} /></li>)}</ul>}
      {m.calc && <TryIt calc={m.calc} onOpen={onOpen} />}
    </article>)}
  </>;
}

type Answer = 'yes' | 'no' | 'unsure';
const QUESTIONS: { id: string; text: string; yes: string; no?: string; link: Page }[] = [
  { id: 'frame', text: '能否拿到覆盖目标总体的完整名单（抽样框）？', yes: '可以用概率抽样：名单完整时从简单随机或系统抽样开始。', no: '先抽地域或机构（区、学校、社区），在入样单位内再建立名单，即多阶段抽样；若最终只能拦截访问，按非概率样本如实报告。', link: 'builder' },
  { id: 'strata', text: '总体能否按已知特征分成差异明显的部分（年级、城乡、区域）？', yes: '采用分层抽样，并按比例或 Neyman 方式分配样本；需要分组报告时规定每层最少样本。', link: 'ch-stratified' },
  { id: 'spread', text: '调查单位是否分散、逐个访问费用很高？', yes: '采用整群或多阶段抽样以控制费用，但要用设计效应放大样本量，并尽量多抽群、少抽每群人数。', link: 'ch-cluster' },
  { id: 'size', text: '第一阶段单位的规模差别是否很大（各区人口、各校人数）？', yes: '第一阶段用 PPS 抽样，后续每个入样单位抽相同人数，样本自加权。', link: 'ch-pps' },
  { id: 'aux', text: '是否有与调查指标高度相关、且总体均值已知的辅助变量？', yes: '用比率或回归估计提高精度；分层时考虑分别或联合比率估计。', link: 'ch-ratio' },
  { id: 'list', text: '是否需要在现场或名单上按固定间隔抽取？', yes: '采用系统抽样；名单按相关变量排序可获得隐含分层，注意名单是否有周期。', link: 'ch-systematic' },
  { id: 'compare', text: '研究是否要检验两组之间的差异？', yes: '另按检验功效计算每组样本量，与估计精度所需样本量取较大者。', link: 'ch-srs' },
  { id: 'sensitive', text: '是否涉及作弊、违规、隐私消费等敏感问题？', yes: '对敏感题采用随机化回答（强制回答模型最易实施），并相应增加样本量。', link: 'ch-sensitive' },
  { id: 'response', text: '预计回收率是否较低，或网络样本结构与总体差别较大？', yes: '设计追访方案，并在回收后按总体结构做加权调整；报告中说明残余偏差。', link: 'ch-weighting' },
];
function DecisionGuide({ onOpen }: { onOpen: (page: Page) => void }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => { try { return JSON.parse(window.localStorage.getItem('evix.sampling.guide') ?? '{}'); } catch { return {}; } });
  useEffect(() => { try { window.localStorage.setItem('evix.sampling.guide', JSON.stringify(answers)); } catch { /* convenience only */ } }, [answers]);
  const advice = QUESTIONS.filter(q => answers[q.id] === 'yes' || (answers[q.id] === 'no' && q.no));
  return <div className={styles.guide}>
    <ol className={styles.questions}>{QUESTIONS.map(q => <li key={q.id}>
      <span>{q.text}</span>
      <div role="radiogroup" aria-label={q.text}>{(['yes', 'no', 'unsure'] as Answer[]).map(a => <button type="button" role="radio" key={a} aria-checked={answers[q.id] === a} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: a }))}>{a === 'yes' ? '是' : a === 'no' ? '否' : '不确定'}</button>)}</div>
    </li>)}</ol>
    <section className={styles.advice} aria-live="polite"><h4>建议的设计要素</h4>
      {advice.length ? <ul>{advice.map(q => <li key={q.id}><Rich text={answers[q.id] === 'no' && q.no ? q.no : q.yes} /> <button type="button" className={styles.linkButton} onClick={() => onOpen(q.link)}>查看 →</button></li>)}</ul>
        : <p className={styles.muted}>回答左侧问题后，这里列出相应的抽样设计建议，并链接到方法手册与工具。</p>}
      {answers.frame === 'no' && <p className={styles.callout} data-tone="warn">没有完整名单且最终采用拦截或网络招募时，样本不是概率样本：可以报告样本结构与按样本量计算的参照精度，但不能报告严格的抽样误差。</p>}
    </section>
  </div>;
}

const PAGE_TITLES: Partial<Record<Page, { title: string; intro: string }>> = {
  guide: { title: '选择抽样方式', intro: '回答几个关于抽样框、总体结构和调查条件的问题，得到设计要素的建议。' },
  builder: { title: '多阶段抽样方案', intro: '按调查群体分别写出各阶段的抽样单元、抽样框与抽样方式，生成抽样框表和方法段落。' },
  size: { title: '样本量与分层分配', intro: '由精度要求计算样本量，并把样本分配到各层；所有计算步骤以公式展示。' },
  selection: { title: '抽取样本', intro: '用随机种子从名单中抽取样本，抽样记录可下载放入附录，供他人复核。' },
  estimate: { title: '精度与估计', intro: '回收后按实际设计计算估计值、标准误和置信区间。各计算器中预填的是示例数字，请替换为你的数据。' },
  complex: { title: '复杂样本估计', intro: '使用「数据分析」中读取的数据，按权数、分层与初级单元估计均值、比例或总量。' },
  weighting: { title: '加权调整', intro: '按总体结构调整权数，降低样本结构偏差；调整后的权数可直接用于复杂样本估计。' },
  lab: { title: '抽样分布实验室', intro: '在已知真值的模拟总体上反复抽样，直观比较不同设计的精度与区间覆盖率。' },
  refs: { title: '参考文献', intro: '本手册按抽样技术课程的常见顺序组织，说明文字为本系统编写，公式为下列文献中的标准结果。' },
};

export default function SamplingWorkbench({ dataset, onReportInsert }: { dataset: DatasetValue | null; onReportInsert?: (insert: ReportInsert) => void }) {
  const [page, setPageState] = useState<Page>(() => { try { const p = window.localStorage.getItem('evix.sampling.page') as Page | null; return p && ALL_PAGES.includes(p) ? p : 'builder'; } catch { return 'builder'; } });
  const [visitedPages, setVisitedPages] = useState<Page[]>([page]);
  const [visitedEstimators, setVisitedEstimators] = useState<string[]>(['srs']);
  const [query, setQuery] = useState('');
  const [estimator, setEstimator] = useState<string>('srs');
  const [raked, setRaked] = useState<SharedWeights | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  function setPage(next: Page, method: string | null = null) {
    setVisitedPages(previous => previous.includes(next) ? previous : [...previous, next]);
    setPageState(next); setFocus(method);
    try { window.localStorage.setItem('evix.sampling.page', next); } catch { /* convenience only */ }
  }
  useEffect(() => {
    if (focus) document.getElementById(`method-${focus}`)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [focus, page]);
  const rail = useKeyedListMotion<HTMLDivElement>({ ids: ALL_PAGES, activeId: page, markerAxis: 'vertical' });
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return HANDBOOK.flatMap(c => c.methods.filter(m => [m.title, m.english ?? '', m.summary, ...m.formulas.map(f => f.label)].join(' ').toLowerCase().includes(q)).map(m => ({ chapter: c, method: m }))).slice(0, 12);
  }, [query]);

  return <section className={styles.workbench} data-self-styled aria-label="抽样设计">
    <div className={styles.layout}>
      <nav className={styles.rail} aria-label="抽样设计导航">
        <div className={styles.railSearch}><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m10.5 10.5 3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg><input type="search" aria-label="搜索方法" placeholder="搜索方法，如 比率、PPS、Neyman" value={query} onChange={e => setQuery(e.target.value)} /></div>
        {query.trim() ? <div className={styles.railGroup}><span>搜索结果</span><div className={styles.railList}>{matches.length ? matches.map(({ chapter: c, method: m }) => <button type="button" key={m.id} onClick={() => { setQuery(''); setPage(`ch-${c.id}`, m.id); }}><i>{c.number}</i><span>{m.title}</span></button>) : <p className={styles.muted}>没有匹配的方法。</p>}</div></div>
          : <div ref={rail} className={styles.railList}><span data-motion-marker className={styles.railMarker} aria-hidden="true" />
            {NAV.map(group => <div key={group.label} className={styles.railGroup}><span>{group.label}</span>
              {group.items.map(item => <button type="button" key={item.id} data-motion-id={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><i>{item.number ?? '·'}</i><span>{item.label}</span></button>)}
            </div>)}</div>}
      </nav>
      <div className={styles.content}>
        <label className={styles.railSelect}>页面<select value={page} onChange={e => setPage(e.target.value as Page)}>{NAV.map(g => <optgroup key={g.label} label={g.label}>{g.items.map(i => <option key={i.id} value={i.id}>{i.number ? `${i.number}. ` : ''}{i.label}</option>)}</optgroup>)}</select></label>
        {visitedPages.map(panel => {
          const chapter = panel.startsWith('ch-') ? HANDBOOK.find(c => `ch-${c.id}` === panel) ?? null : null;
          const meta = PAGE_TITLES[panel];
          return <div key={panel} className={styles.pagePanel} hidden={page !== panel} data-sampling-page={panel}>
        {meta && <header className={styles.pageHead}><h3>{meta.title}</h3><p>{meta.intro}</p></header>}
        {panel === 'guide' && <DecisionGuide onOpen={setPage} />}
        {panel === 'builder' && <DesignBuilder onReportInsert={onReportInsert} />}
        {panel === 'size' && <SamplingDesigner embedded onReportInsert={onReportInsert} />}
        {panel === 'selection' && <div className={styles.stack}><SelectionCalc /><SystematicCalc mode="select" /><PpsCalc mode="select" /></div>}
        {panel === 'estimate' && <div className={styles.stack}>
          <div className={styles.choice}><div role="tablist" aria-label="估计方法">{ESTIMATORS.map(([id, label]) => <button type="button" role="tab" key={id} aria-selected={estimator === id} onClick={() => { setVisitedEstimators(previous => previous.includes(id) ? previous : [...previous, id]); setEstimator(id); }}>{label}</button>)}</div></div>
          {visitedEstimators.map(id => <div key={id} hidden={estimator !== id}>{calculator({ id: id as CalculatorId, mode: ESTIMATOR_MODE[id] })}</div>)}
        </div>}
        {panel === 'complex' && <ComplexCalc dataset={dataset} raked={raked} />}
        {panel === 'weighting' && <WeightingCalc dataset={dataset} shared={raked} onWeights={setRaked} />}
        {panel === 'lab' && <SamplingLab />}
        {panel === 'refs' && <div className={styles.refs}><ol>{HANDBOOK_REFERENCES.map(r => <li key={r}>{r}</li>)}</ol></div>}
        {chapter && <ChapterView chapter={chapter} onOpen={setPage} />}
          </div>;
        })}
      </div>
    </div>
  </section>;
}
