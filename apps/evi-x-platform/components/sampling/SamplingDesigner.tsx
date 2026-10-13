'use client';
import { useEffect, useMemo, useState } from 'react';
import { achievedMargin, allocate, methodsStatement, sampleSize, SAMPLING_KINDS, validateSizePlan, type AllocationMethod, type Confidence, type SamplingKind, type SizePlan, type Stratum } from '@/lib/sampling';
import { useContentReveal, useKeyedListMotion } from '../motion/useWorkspaceMotion';
import styles from './SamplingDesigner.module.css';

type Tab = 'size' | 'allocation' | 'precision';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'size', label: '样本量', hint: '按精度要求倒推' },
  { id: 'allocation', label: '分层与配额', hint: '把样本分到各层' },
  { id: 'precision', label: '已有样本的精度', hint: '回收后复核' },
];
const STORAGE = 'evix.sampling-designer.v1';
type Saved = { kind: SamplingKind; population: string; frame: string; plan: SizePlan; strata: Stratum[]; method: AllocationMethod; minimum: number; achieved: number };
const DEFAULT: Saved = {
  kind: 'stratified', population: '', frame: '',
  plan: { target: 'proportion', confidence: '0.95', margin: 0.05, proportion: 0.5, sd: 1, population: null, designEffect: 1, validRate: 0.8, subgroups: 1 },
  strata: [{ id: 's1', name: '第一层', size: 4000, sd: null }, { id: 's2', name: '第二层', size: 3500, sd: null }, { id: 's3', name: '第三层', size: 2500, sd: null }],
  method: 'proportional', minimum: 0, achieved: 400,
};
function load(): Saved {
  try { const raw = window.localStorage.getItem(STORAGE); if (!raw) return DEFAULT; const v = JSON.parse(raw) as Saved; return v && v.plan && Array.isArray(v.strata) ? { ...DEFAULT, ...v, plan: { ...DEFAULT.plan, ...v.plan } } : DEFAULT; } catch { return DEFAULT; }
}
const num = (text: string) => { const v = Number(text.trim()); return text.trim() === '' || !Number.isFinite(v) ? NaN : v; };
const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString('zh-CN', { maximumFractionDigits: digits })}%`;
const fmt = (v: number, digits = 2) => v.toLocaleString('zh-CN', { maximumFractionDigits: digits });

export default function SamplingDesigner() {
  // Client-only component (loaded without SSR), so the saved inputs are read before the first render.
  const [state, setState] = useState<Saved>(load), [tab, setTab] = useState<Tab>('size'), [copied, setCopied] = useState(false);
  useEffect(() => { try { window.localStorage.setItem(STORAGE, JSON.stringify(state)); } catch { /* storage is a convenience only */ } }, [state]);
  const set = <K extends keyof Saved>(key: K, value: Saved[K]) => setState(s => ({ ...s, [key]: value }));
  const setPlan = <K extends keyof SizePlan>(key: K, value: SizePlan[K]) => setState(s => ({ ...s, plan: { ...s.plan, [key]: value } }));
  const meta = SAMPLING_KINDS[state.kind], plan = state.plan;
  const issues = useMemo(() => validateSizePlan(plan), [plan]);
  const result = useMemo(() => issues.length ? null : sampleSize(plan), [plan, issues]);
  const statement = result ? methodsStatement({ kind: state.kind, population: state.population.trim(), frame: state.frame.trim(), plan, result }) : '';
  const allocation = useMemo(() => {
    try { return { value: allocate(state.strata, result?.completes ?? 0, state.method, state.minimum), error: '' }; }
    catch (e) { return { value: null, error: (e as Error).message }; }
  }, [state.strata, state.method, state.minimum, result?.completes]);
  const margin = achievedMargin({ n: state.achieved, confidence: plan.confidence, proportion: plan.target === 'proportion' ? plan.proportion : 0.5, population: plan.population, designEffect: plan.designEffect });
  const tabs = useKeyedListMotion<HTMLDivElement>({ ids: TABS.map(t => t.id), activeId: tab, markerAxis: 'horizontal' });
  const resultSurface = useContentReveal<HTMLDivElement>({ token: result ? `${result.completes}:${result.contacts}` : null });
  async function copy() { try { await navigator.clipboard.writeText(statement); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); } }
  function updateStratum(index: number, patch: Partial<Stratum>) { set('strata', state.strata.map((s, i) => i === index ? { ...s, ...patch } : s)); }

  return <section className={styles.designer} data-self-styled aria-label="抽样设计">
    <p className={styles.lede}><span className={styles.eyebrow}>SAMPLING DESIGN</span>先说清目标总体和抽样框，再按精度要求算样本量、分配各层样本。抽样误差只在概率抽样下成立。</p>

    <div className={styles.kinds} role="radiogroup" aria-label="抽样方式">
      {(Object.keys(SAMPLING_KINDS) as SamplingKind[]).map(kind => <button type="button" role="radio" aria-checked={state.kind === kind} key={kind} onClick={() => set('kind', kind)} data-probability={SAMPLING_KINDS[kind].probability}>
        <strong>{SAMPLING_KINDS[kind].label}</strong><small>{SAMPLING_KINDS[kind].probability ? '概率抽样' : '非概率'}</small>
      </button>)}
    </div>
    <p className={styles.kindNote} data-probability={meta.probability}>{meta.note}{!meta.probability && ' 样本量仍可按精度公式确定规模，但报告中不写抽样误差。'}</p>

    <div className={styles.tabs} ref={tabs} role="tablist" aria-label="抽样设计步骤">
      <span data-motion-marker className={styles.marker} aria-hidden="true" />
      {TABS.map(t => <button type="button" role="tab" key={t.id} data-motion-id={t.id} aria-selected={tab === t.id} onClick={() => setTab(t.id)}><strong>{t.label}</strong><small>{t.hint}</small></button>)}
    </div>

    {tab === 'size' && <div className={styles.split}>
      <form className={styles.form} onSubmit={e => e.preventDefault()}>
        <label className={styles.wide}>目标总体<input value={state.population} maxLength={80} placeholder="例如：武汉市在校本科生" onChange={e => set('population', e.target.value)} /></label>
        <label className={styles.wide}>抽样框<input value={state.frame} maxLength={120} placeholder="例如：各校学生名册；覆盖不到的人群也写明" onChange={e => set('frame', e.target.value)} /></label>
        <fieldset className={styles.segment}><legend>估计目标</legend>
          {(['proportion', 'mean'] as const).map(t => <label key={t}><input type="radio" name="target" checked={plan.target === t} onChange={() => setPlan('target', t)} />{t === 'proportion' ? '比例（如：选择某项的人占多少）' : '均值（如：月均消费）'}</label>)}
        </fieldset>
        <label>置信水平<select value={plan.confidence} onChange={e => setPlan('confidence', e.target.value as Confidence)}><option value="0.9">90%</option><option value="0.95">95%</option><option value="0.99">99%</option></select></label>
        {plan.target === 'proportion'
          ? <><label>允许误差（± 百分点）<input inputMode="decimal" defaultValue={plan.margin * 100} key={`m${plan.target}`} onChange={e => setPlan('margin', num(e.target.value) / 100)} /></label>
            <label>预估比例（%）<input inputMode="decimal" defaultValue={plan.proportion * 100} onChange={e => setPlan('proportion', num(e.target.value) / 100)} /><small>不确定时用 50%，最保守。</small></label></>
          : <><label>允许误差（结果的单位）<input inputMode="decimal" defaultValue={plan.margin} key={`m${plan.target}`} onChange={e => setPlan('margin', num(e.target.value))} /></label>
            <label>标准差 σ<input inputMode="decimal" defaultValue={plan.sd} onChange={e => setPlan('sd', num(e.target.value))} /><small>来自预调查或已发表研究，注明来源。</small></label></>}
        <label>总体规模（可留空）<input inputMode="numeric" defaultValue={plan.population ?? ''} placeholder="很大或未知时留空" onChange={e => setPlan('population', e.target.value.trim() === '' ? null : num(e.target.value))} /></label>
        <label>设计效应<input inputMode="decimal" defaultValue={plan.designEffect} onChange={e => setPlan('designEffect', num(e.target.value))} /><small>{state.kind === 'cluster' ? '整群抽样常见 1.5–2.5，最好用预调查估计。' : '简单随机抽样取 1。'}</small></label>
        <label>预计有效回收率（%）<input inputMode="decimal" defaultValue={plan.validRate * 100} onChange={e => setPlan('validRate', num(e.target.value) / 100)} /></label>
        <label>需单独报告精度的子群数<input inputMode="numeric" defaultValue={plan.subgroups} onChange={e => setPlan('subgroups', num(e.target.value))} /><small>如需分别报告男、女的比例，填 2。</small></label>
      </form>
      <div className={styles.result} ref={resultSurface} aria-live="polite">
        {issues.length ? <ul className={styles.issues}>{issues.map(i => <li key={i}>{i}</li>)}</ul> : result && <>
          <div className={styles.headline}>
            <div><span>有效样本</span><strong>{result.completes.toLocaleString('zh-CN')}<small> 份</small></strong>{plan.subgroups > 1 && <em>每个子群 {result.perGroup} 份</em>}</div>
            <div><span>计划发放</span><strong>{result.contacts.toLocaleString('zh-CN')}<small> 份</small></strong><em>按有效回收率 {pct(plan.validRate)}</em></div>
          </div>
          <ol className={styles.steps}>{result.steps.map(s => <li key={s.label}><span>{s.label}</span><code>{s.formula}</code><b>{fmt(s.value)}</b></li>)}</ol>
          {!!result.warnings.length && <ul className={styles.notes}>{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          <div className={styles.statement}><div><span>方法部分草稿</span><button type="button" onClick={() => void copy()}>{copied ? '已复制' : '复制'}</button></div><p>{statement}</p><small>只依据上方输入生成；括号内的空项请补全，实际回收后按真实样本更新。</small></div>
        </>}
      </div>
    </div>}

    {tab === 'allocation' && <div className={styles.allocation}>
      <div className={styles.allocTools}>
        <fieldset className={styles.segment}><legend>分配方式</legend>
          {([['proportional', '比例分配', '各层样本与层规模成比例，自加权'], ['neyman', 'Neyman 分配', '变异大的层多抽，需各层标准差'], ['equal', '等额分配', '各层同样多，便于层间比较']] as const).map(([id, label, hint]) => <label key={id} title={hint}><input type="radio" name="method" checked={state.method === id} onChange={() => set('method', id)} />{label}</label>)}
        </fieldset>
        <label>每层最少样本<input inputMode="numeric" defaultValue={state.minimum} onChange={e => set('minimum', Math.max(0, Math.floor(num(e.target.value) || 0)))} /></label>
        <p className={styles.total}>总样本 <b>{result?.completes ?? '—'}</b> 份 <small>（来自“样本量”）</small></p>
      </div>
      <div className={styles.tableWrap} tabIndex={0} aria-label="分层输入与分配结果"><table>
        <thead><tr><th>层</th><th>层规模 N<sub>h</sub></th>{state.method === 'neyman' && <th>标准差 S<sub>h</sub></th>}<th>规模占比</th><th>分配 n<sub>h</sub></th><th>抽样比</th><th>设计权数</th><th>相对权数</th><th /></tr></thead>
        <tbody>{state.strata.map((s, i) => { const row = allocation.value?.rows[i]; return <tr key={s.id}>
          <td><input aria-label={`第 ${i + 1} 层名称`} value={s.name} maxLength={40} onChange={e => updateStratum(i, { name: e.target.value })} /></td>
          <td><input aria-label={`${s.name} 规模`} inputMode="numeric" defaultValue={s.size} onChange={e => updateStratum(i, { size: num(e.target.value) })} /></td>
          {state.method === 'neyman' && <td><input aria-label={`${s.name} 标准差`} inputMode="decimal" defaultValue={s.sd ?? ''} placeholder="比例用 √p(1−p)" onChange={e => updateStratum(i, { sd: e.target.value.trim() === '' ? null : num(e.target.value) })} /></td>}
          <td>{row ? pct(row.share) : '—'}</td><td><b>{row?.allocation ?? '—'}</b></td><td>{row ? pct(row.fraction, 2) : '—'}</td><td>{row ? fmt(row.weight) : '—'}</td><td>{row ? fmt(row.relativeWeight, 3) : '—'}</td>
          <td><button type="button" className={styles.remove} aria-label={`删除 ${s.name}`} disabled={state.strata.length <= 2} onClick={() => set('strata', state.strata.filter((_, j) => j !== i))}>删除</button></td>
        </tr>; })}</tbody>
      </table></div>
      <button type="button" className={styles.add} disabled={state.strata.length >= 30} onClick={() => set('strata', [...state.strata, { id: crypto.randomUUID(), name: `第${state.strata.length + 1}层`, size: 1000, sd: null }])}>＋ 添加一层</button>
      {allocation.error ? <p className={styles.error} role="alert">{allocation.error}</p> : <ul className={styles.notes}>
        {allocation.value?.warnings.map(w => <li key={w}>{w}</li>)}
        <li>层规模应来自统计年鉴、普查或名册，并在报告中注明来源与年份。</li>
        {!meta.probability && <li>当前为非概率抽样：此表即配额表，层内并非随机抽取，权数只用于把样本结构调回总体结构，不能据此计算抽样误差。</li>}
      </ul>}
    </div>}

    {tab === 'precision' && <div className={styles.split}>
      <form className={styles.form} onSubmit={e => e.preventDefault()}>
        <label>实际有效样本<input inputMode="numeric" defaultValue={state.achieved} onChange={e => set('achieved', num(e.target.value))} /></label>
        <p className={styles.reuse}>置信水平、预估比例、总体规模和设计效应沿用“样本量”中的设置。</p>
      </form>
      <div className={styles.result}>
        {!meta.probability ? <div className={styles.nonProb}><strong>当前为{meta.label}</strong><p>非概率样本的入样概率未知，不报告抽样误差或置信区间。请在报告中如实描述招募渠道、样本结构与目标总体的差异，并把结论限定在样本内。</p></div>
          : margin === null ? <p className={styles.error}>请输入不少于 2 的有效样本，且不超过总体规模。</p>
            : <div className={styles.headline}><div><span>比例估计的抽样误差</span><strong>±{fmt(margin * 100)}<small> 个百分点</small></strong><em>{Number(plan.confidence) * 100}% 置信水平，按 {plan.target === 'proportion' ? `p = ${pct(plan.proportion)}` : 'p = 50%'}{plan.designEffect !== 1 ? `、deff = ${plan.designEffect}` : ''}</em></div></div>}
        {meta.probability && margin !== null && <p className={styles.reuse}>这是抽样误差的上限估计，不包含无应答、覆盖不足和测量误差；回收率低时应在报告中说明无应答偏差的可能方向。</p>}
      </div>
    </div>}

    <footer className={styles.sources}>公式依据：Cochran, W. G. (1977). <i>Sampling Techniques</i>（样本量与有限总体校正、比例与 Neyman 分配）；Kish, L. (1965). <i>Survey Sampling</i>（设计效应）；AAPOR 关于非概率样本的透明披露要求。</footer>
  </section>;
}
