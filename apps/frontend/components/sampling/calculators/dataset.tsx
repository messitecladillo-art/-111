'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DatasetValue } from '@/lib/canvas/execute';
import { tableCsv } from '@/lib/data-quality';
import { textHash } from '@/lib/sampling-core';
import { buildDesignRows, describeColumn, marginsFromShares, marginValues, MISSING_CATEGORY } from '@/lib/sampling-dataset';
import { describeDesign, designEstimate, type DesignEstimate, type VarianceMethod } from '@/lib/sampling-variance';
import { kish, postStratify, rake } from '@/lib/sampling-weights';
import { parseSurveyCsv, type SurveyTable } from '@/lib/survey-analysis';
import { Formula, Tex } from '../../math/Tex';
import { attempt, Calc, Choice, ciText, Confidence, Download, Field, fmt, Metric, Notes, parseNumber, Paste, pct, Statement, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

export type SharedWeights = { key: string; values: number[]; label: string };
export type Source = { name: string; table: SurveyTable; codes: string[]; key: string; simulated: boolean } | null;
/**
 * Weights are bound to the exact data they were computed on: the workspace content hash (or a hash of the
 * pasted text) plus the missing-code setting, so a dataset replaced with the same shape cannot reuse them.
 */
export const sourceKey = (kind: 'workspace' | 'paste', contentHash: string, table: SurveyTable, codes: string[]) => `${kind}:${contentHash}:${table.rows.length}:${textHash(codes.join('\u0001'))}`;

/** The dataset from 数据分析, or a CSV pasted here when nothing is loaded. */
function useSource(dataset: DatasetValue | null, storageKey: string): { source: Source; picker: ReactNode; error: string | null } {
  const [paste, setPaste] = usePersistent(`${storageKey}.paste`, { text: '' });
  const [mode, setMode] = useState<'workspace' | 'paste'>(dataset ? 'workspace' : 'paste');
  const parsed = useMemo(() => attempt(() => paste.text.trim() ? parseSurveyCsv(paste.text) : null), [paste.text]);
  const useWorkspace = mode === 'workspace' && !!dataset;
  // Memoised so that results computed from the source keep their identity between renders.
  const source = useMemo<Source>(() => useWorkspace && dataset
    ? { name: dataset.name, table: dataset.table, codes: dataset.missingCodes, key: sourceKey('workspace', dataset.sourceHash, dataset.table, dataset.missingCodes), simulated: dataset.kind === 'simulated' }
    : parsed.value ? { name: '粘贴的数据', table: parsed.value, codes: [], key: sourceKey('paste', textHash(paste.text), parsed.value, []), simulated: false } : null,
  [useWorkspace, dataset, parsed.value, paste.text]);
  const picker = <>
    {dataset && <Choice label="数据来源" value={mode} options={[['workspace', `数据分析：${dataset.name}`], ['paste', '在此粘贴 CSV']] as const} onChange={setMode} />}
    {!useWorkspace && <Paste label="CSV 数据（第一行为表头）" value={paste.text} onChange={text => setPaste({ text })} rows={6} placeholder={'学校,班级,权数,满意度\n甲校,1班,32.5,4\n…'} hint={dataset ? undefined : '也可以先在「数据分析」中读取问卷数据，这里会自动使用同一份数据与缺失代码设置。'} />}
  </>;
  return { source, picker, error: !useWorkspace && paste.text.trim() ? parsed.error : null };
}
const byName = (table: SurveyTable, name: string) => name ? table.headers.indexOf(name) : -1;
function ColumnSelect({ label, table, value, onChange, optional = true, filter }: { label: string; table: SurveyTable; value: string; onChange: (name: string) => void; optional?: boolean; filter?: (index: number) => boolean }) {
  return <div className={styles.field}><label>{label}<select className={styles.select} value={table.headers.includes(value) ? value : ''} onChange={e => onChange(e.target.value)}>
    {optional ? <option value="">（不使用）</option> : <option value="" disabled>请选择</option>}
    {table.headers.map((h, i) => (!filter || filter(i)) && <option key={`${h}-${i}`} value={h}>{h}</option>)}
  </select></label></div>;
}
const METHOD_LABEL: Record<VarianceMethod, string> = { linearization: '泰勒线性化', jackknife: '刀切法（JKn）', brr: '平衡半样本（Fay 0.5）', bootstrap: '自助法（1000 次）', 'random-groups': '随机组（10 组）' };

export function ComplexCalc({ dataset, raked }: { dataset: DatasetValue | null; raked: SharedWeights | null }) {
  const { source, picker, error: sourceError } = useSource(dataset, 'complex');
  const [s, set] = usePersistent('complex.v1', { y: '', stat: 'mean', category: '', weight: '', useRaked: false, stratum: '', psu: '', domainColumn: '', domainValue: '', methods: ['linearization', 'jackknife'] as VarianceMethod[], confidence: '0.95' });
  const conf = Number(s.confidence);
  const table = source?.table ?? null;
  const yColumn = table ? describeColumn(table, Math.max(0, byName(table, s.y)), source!.codes) : null;
  const rakedUsable = !!raked && !!source && raked.key === source.key;
  const result = useMemo(() => attempt(() => {
    if (!source || !table) return null;
    const y = byName(table, s.y);
    if (y < 0) throw Error('请选择结果变量。');
    const proportion = s.stat === 'proportion';
    if (proportion && !s.category) throw Error('请选择要估计比例的类别。');
    const domainColumn = byName(table, s.domainColumn);
    const build = buildDesignRows(table, {
      y, category: proportion ? s.category : null, weight: s.useRaked && rakedUsable ? null : byName(table, s.weight) >= 0 ? byName(table, s.weight) : null,
      stratum: byName(table, s.stratum) >= 0 ? byName(table, s.stratum) : null, psu: byName(table, s.psu) >= 0 ? byName(table, s.psu) : null,
      domain: domainColumn >= 0 && s.domainValue ? { column: domainColumn, value: s.domainValue } : null,
    }, source.codes, s.useRaked && rakedUsable ? raked!.values : null);
    const statistic = s.stat === 'total' ? 'total' as const : 'mean' as const;
    const summary = describeDesign(build.rows);
    const estimates: (DesignEstimate | { method: VarianceMethod; error: string })[] = ['linearization' as VarianceMethod, ...s.methods.filter(m => m !== 'linearization')].map(method => {
      try { return designEstimate(build.rows, { statistic, confidence: conf, method, fay: method === 'brr' ? 0.5 : undefined, replicates: 1000, seed: 'evix-bootstrap', groups: Math.min(10, summary.psus) }); }
      catch (e) { return { method, error: (e as Error).message }; }
    });
    return { build, summary, estimates, proportion, statistic };
  }), [source, table, s, conf, rakedUsable, raked]);
  const main = result.value?.estimates.find((e): e is DesignEstimate => 'estimate' in e && e.method === 'linearization');
  const show = (v: number) => result.value?.proportion ? pct(v, 2) : fmt(v);
  const statement = main && result.value && table ? [
    `对${s.domainColumn && s.domainValue ? `「${s.domainColumn}」为“${s.domainValue}”的子总体` : '全体样本'}，`,
    `${s.stratum ? `以「${s.stratum}」分层（${result.value.summary.strata} 层），` : ''}${s.psu ? `以「${s.psu}」为初级抽样单元（共 ${result.value.summary.psus} 个），` : '以每条记录为抽样单元，'}`,
    `${s.useRaked && rakedUsable ? `使用${raked!.label}，` : s.weight ? `使用「${s.weight}」作为权数，` : '不加权，'}`,
    `采用泰勒线性化方法估计方差（自由度 ${main.df}）。`,
    `「${s.y}」${result.value.proportion ? `中“${s.category}”的加权比例` : result.value.statistic === 'total' ? '的加权总量' : '的加权均值'}为 ${show(main.estimate)}，标准误 ${show(main.se)}，${Math.round(conf * 100)}% 置信区间为 ${result.value.proportion && main.logitCi ? `[${pct(main.logitCi.lower, 2)}, ${pct(main.logitCi.upper, 2)}]（logit 变换）` : `[${show(main.ci.lower)}, ${show(main.ci.upper)}]`}`,
    `${main.deff !== null ? `，设计效应为 ${fmt(main.deff, 3)}` : ''}。`,
  ].join('') : '';
  return <Calc title="复杂样本的估计与方差" intro="按权数、分层与初级单元计算加权估计及其标准误；子总体估计保留完整设计。各方法的结果应彼此接近，差异过大说明初级单元太少。"
    inputs={<>
      {picker}
      {table && <>
        <ColumnSelect label="结果变量" table={table} value={s.y} onChange={y => set({ ...s, y, category: '' })} optional={false} />
        <Choice label="估计什么" value={s.stat} options={[['mean', '均值'], ['proportion', '某一类别的比例'], ['total', '总量']] as const} onChange={stat => set({ ...s, stat })} />
        {s.stat === 'proportion' && yColumn && <div className={styles.field}><label>类别<select className={styles.select} value={s.category} onChange={e => set({ ...s, category: e.target.value })}><option value="">请选择</option>{yColumn.categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label>{!yColumn.categories.length && <small>该列取值超过 30 种，不适合按类别估计比例。</small>}</div>}
        {rakedUsable && <Choice label="权数" value={s.useRaked ? 'raked' : 'column'} options={[['raked', raked!.label], ['column', '数据中的权数列']] as const} onChange={v => set({ ...s, useRaked: v === 'raked' })} />}
        {!(s.useRaked && rakedUsable) && <ColumnSelect label="权数列" table={table} value={s.weight} onChange={weight => set({ ...s, weight })} />}
        <ColumnSelect label="分层变量" table={table} value={s.stratum} onChange={stratum => set({ ...s, stratum })} />
        <ColumnSelect label="初级单元（群）编号" table={table} value={s.psu} onChange={psu => set({ ...s, psu })} />
        <ColumnSelect label="子总体变量（可选）" table={table} value={s.domainColumn} onChange={domainColumn => set({ ...s, domainColumn, domainValue: '' })} />
        {s.domainColumn && byName(table, s.domainColumn) >= 0 && <div className={styles.field}><label>子总体取值<select className={styles.select} value={s.domainValue} onChange={e => set({ ...s, domainValue: e.target.value })}><option value="">请选择</option>{describeColumn(table, byName(table, s.domainColumn), source!.codes).categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>}
        <fieldset className={styles.choice}><legend>同时比较的方差估计方法</legend><div>{(['jackknife', 'brr', 'bootstrap', 'random-groups'] as VarianceMethod[]).map(m => <button type="button" role="checkbox" aria-checked={s.methods.includes(m)} key={m} onClick={() => set({ ...s, methods: s.methods.includes(m) ? s.methods.filter(x => x !== m) : [...s.methods, m] })}>{METHOD_LABEL[m]}</button>)}</div></fieldset>
        <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
      </>}
    </>} error={sourceError ?? result.error}>
    {!table && <p className={styles.callout}>请先在「数据分析」中读取数据，或在左侧粘贴 CSV。</p>}
    {result.value && main && <>
      {source?.simulated && <p className={styles.callout} data-tone="warn">当前为教学模拟数据，结果只用于演示方法。</p>}
      <div className={styles.metrics}>
        <Metric accent label={result.value.proportion ? '加权比例' : result.value.statistic === 'total' ? '加权总量' : '加权均值'} value={show(main.estimate)} note={`${Math.round(conf * 100)}% 区间 ${result.value.proportion && main.logitCi ? `[${pct(main.logitCi.lower, 2)}, ${pct(main.logitCi.upper, 2)}]` : ciText(main.ci)}`} />
        <Metric label="标准误" value={show(main.se)} />
        {main.deff !== null && <Metric label="设计效应" value={fmt(main.deff, 3)} note={`有效样本量约 ${fmt(result.value.summary.domainN / main.deff, 0)}`} />}
      </div>
      <div className={styles.metrics}><Metric label="记录" value={String(result.value.summary.n)} /><Metric label="层" value={String(result.value.summary.strata)} /><Metric label="初级单元" value={String(result.value.summary.psus)} /><Metric label="自由度" value={String(result.value.summary.df)} /><Metric label="权数的设计效应" value={fmt(result.value.summary.kishDeff, 3)} note={<Tex tex="1+CV_w^{2}" />} /></div>
      <div className={styles.resultTable}><table><thead><tr><th>方法</th><th>估计值</th><th>标准误</th><th>区间</th><th>自由度</th><th>设计效应</th></tr></thead><tbody>
        {result.value.estimates.map(e => 'error' in e
          ? <tr key={e.method}><td>{METHOD_LABEL[e.method]}</td><td colSpan={5} className={styles.muted}>{e.error}</td></tr>
          : <tr key={e.method}><td>{METHOD_LABEL[e.method]}</td><td>{show(e.estimate)}</td><td data-strong={e.method === 'linearization' || undefined}>{show(e.se)}</td><td>{result.value!.proportion ? `[${pct(e.ci.lower, 2)}, ${pct(e.ci.upper, 2)}]` : ciText(e.ci)}</td><td>{e.df}</td><td>{e.deff === null ? '—' : fmt(e.deff, 3)}</td></tr>)}
      </tbody></table></div>
      <Formula compact label="线性化方差估计" tex={String.raw`v(\hat{\bar{Y}})=\sum_{h=1}^{H}\frac{n_h}{n_h-1}\sum_{i=1}^{n_h}\bigl(z_{hi}-\bar{z}_h\bigr)^{2},\quad z_{hi}=\sum_{k\in(h,i)}\frac{w_k\bigl(y_k-\hat{\bar{Y}}\bigr)}{\sum_{j}w_j}`} />
      <Statement text={statement} footnote="依据当前选择自动生成；请核对变量含义与权数来源后再写入报告。" />
      <Notes items={[...new Set([...result.value.build.warnings, ...result.value.estimates.flatMap(e => 'notes' in e ? e.notes : [])])]} />
    </>}
  </Calc>;
}

type Control = { column: string; shares: Record<string, string> };
export function WeightingCalc({ dataset, shared, onWeights }: { dataset: DatasetValue | null; shared: SharedWeights | null; onWeights: (weights: SharedWeights | null) => void }) {
  const { source, picker, error: sourceError } = useSource(dataset, 'weighting');
  const [s, set] = usePersistent('weighting.v1', { method: 'rake', controls: [] as Control[], base: '', scale: 'sample', N: '', cap: '', source: '' });
  const table = source?.table ?? null;
  const candidates = table ? table.headers.map((_, i) => describeColumn(table, i, source!.codes)).filter(c => c.categories.length >= 2 && c.categories.length <= 20) : [];
  const controls = useMemo(() => table ? s.controls.filter(c => table.headers.includes(c.column)) : [], [table, s.controls]);
  const counts = (column: string) => { if (!table) return new Map<string, number>(); const m = new Map<string, number>(); marginValues(table, byName(table, column), source!.codes).forEach(v => m.set(v, (m.get(v) ?? 0) + 1)); return m; };
  const result = useMemo(() => attempt(() => {
    if (!source || !table || !controls.length) return null;
    if (s.method === 'post' && controls.length !== 1) throw Error('事后分层加权只用一个控制变量；多个变量请用迭代校准。');
    const n = table.rows.length, baseIndex = byName(table, s.base);
    const base = table.rows.map((row, i) => { if (baseIndex < 0) return 1; const v = Number((row[baseIndex] ?? '').trim()); if (!(v > 0)) throw Error(`第 ${i + 1} 行的初始权数缺失或不为正数。`); return v; });
    const total = s.scale === 'population' ? parseNumber(s.N) : n;
    const margins = marginsFromShares(table, controls.map(c => ({ column: byName(table, c.column), shares: Object.fromEntries(Object.entries(c.shares).map(([k, v]) => [k, parseNumber(v)])) })), source.codes, total);
    const cap = s.cap.trim() ? parseNumber(s.cap) : null;
    if (cap !== null && !(cap > 1)) throw Error('调整因子上限须大于 1。');
    if (s.method === 'post') {
      const r = postStratify(margins[0].values, base, margins[0].targets);
      return { weights: r.weights, fits: [{ name: margins[0].name, categories: r.fits }], iterations: 1, converged: true, warnings: [] as string[] };
    }
    return rake(margins, base, { maxIterations: 200, tolerance: 1e-8, bounds: cap ? { lower: 1 / cap, upper: cap } : null });
  }), [source, table, controls, s.method, s.base, s.scale, s.N, s.cap]);
  const summary = result.value ? kish(result.value.weights) : null;
  function addControl(column: string) {
    if (!table || !column || controls.some(c => c.column === column)) return;
    const m = counts(column), n = table.rows.length;
    set({ ...s, controls: [...controls, { column, shares: Object.fromEntries([...m.entries()].map(([k, v]) => [k, (v / n * 100).toFixed(1)])) }] });
  }
  const label = s.method === 'post' ? '事后分层权数' : '迭代校准权数';
  const linked = !!shared && !!source && shared.key === source.key;
  // While linked, the shared weights follow every recalculation; an error or an empty result unlinks them.
  useEffect(() => {
    if (!linked || !source) return;
    if (!result.value) onWeights(null);
    else if (shared!.values !== result.value.weights || shared!.label !== label) onWeights({ key: source.key, values: result.value.weights, label });
  }, [linked, result.value, label, source, shared, onWeights]);
  const statement = result.value && summary && table ? `以${s.source.trim() || '〔请填写目标分布的来源，如统计年鉴、普查年份〕'}中${controls.map(c => `「${c.column}」`).join('、')}的分布为目标，${s.method === 'post' ? '采用事后分层法调整权数' : `采用迭代比例拟合（raking）法调整权数，经 ${result.value.iterations} 次迭代${result.value.converged ? '收敛' : '仍未完全收敛'}`}${s.cap.trim() ? `，调整因子限制在 1/${s.cap.trim()} 至 ${s.cap.trim()} 倍之间` : ''}。调整后权数的最大值与最小值之比为 ${fmt(summary.ratio, 2)}，有效样本量为 ${fmt(summary.nEff, 0)}（权数造成的设计效应 ${fmt(summary.deff, 3)}）。加权使样本在上述变量上的结构与总体一致，但只能减少与这些变量相关的偏差${source?.simulated ? '；当前数据为教学模拟数据' : ''}。` : '';
  const csv = () => { if (!table || !result.value) return ''; return tableCsv({ ...table, headers: [...table.headers, label], rows: table.rows.map((r, i) => [...r, String(result.value!.weights[i])]) }); };
  return <Calc title="权数调整：迭代校准与事后分层" intro="选择控制变量并填写总体中各类别的占比（来自统计年鉴、普查或学校名册），把样本结构调整到总体结构。目标占比默认等于样本占比，请改为可靠来源的数字。"
    inputs={<>
      {picker}
      {table && <>
        <Choice label="方法" value={s.method} options={[['rake', '迭代校准（多个变量的边际分布）'], ['post', '事后分层（一个变量）']] as const} onChange={method => set({ ...s, method })} />
        <div className={styles.field} data-wide><label>添加控制变量<select className={styles.select} value="" onChange={e => addControl(e.target.value)}><option value="">选择一个类别变量…</option>{candidates.filter(c => !controls.some(x => x.column === c.name)).map(c => <option key={c.index} value={c.name}>{c.name}（{c.categories.length} 类）</option>)}</select></label></div>
        {controls.map(c => { const m = counts(c.column), n = table.rows.length, sumShares = Object.values(c.shares).reduce((a, v) => a + (parseNumber(v) || 0), 0); return <div key={c.column} className={styles.controlBlock}>
          <div className={styles.row}><strong>{c.column}</strong><span className={styles.muted}>目标合计 {fmt(sumShares, 1)}%</span><button type="button" className={styles.ghost} onClick={() => set({ ...s, controls: controls.filter(x => x.column !== c.column) })}>移除</button></div>
          <div className={styles.tableScroll}><table><thead><tr><th>类别</th><th>样本人数</th><th>样本占比</th><th>目标占比（%）</th></tr></thead><tbody>{[...m.entries()].map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td><td>{pct(v / n)}</td><td><input aria-label={`${c.column} ${k} 的目标占比`} inputMode="decimal" value={c.shares[k] ?? ''} onChange={e => set({ ...s, controls: controls.map(x => x.column === c.column ? { ...x, shares: { ...x.shares, [k]: e.target.value } } : x) })} /></td></tr>)}</tbody></table></div>
          {m.has(MISSING_CATEGORY) && <small className={styles.muted}>“{MISSING_CATEGORY}”是未作答的记录，需要单独的目标占比；也可在数据分析中先处理缺失。</small>}
        </div>; })}
        <ColumnSelect label="初始权数列（可选）" table={table} value={s.base} onChange={base => set({ ...s, base })} />
        <Choice label="权数合计" value={s.scale} options={[['sample', '等于样本量（平均权数为 1）'], ['population', '等于总体规模']] as const} onChange={scale => set({ ...s, scale })} />
        {s.scale === 'population' && <Field label="总体规模" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" />}
        <Field label="调整因子上限（可选）" value={s.cap} onChange={cap => set({ ...s, cap })} placeholder="如 5" hint="限制单个权数的放大倍数，避免极端权数。" />
        <Field label="目标分布的来源" value={s.source} onChange={v => set({ ...s, source: v })} inputMode="text" placeholder="如：2024 年武汉市统计年鉴" wide />
      </>}
    </>} error={sourceError ?? result.error}>
    {!table && <p className={styles.callout}>请先在「数据分析」中读取数据，或在左侧粘贴 CSV。</p>}
    {table && !controls.length && <p className={styles.callout}>添加至少一个控制变量后开始计算。</p>}
    {result.value && summary && <>
      {source?.simulated && <p className={styles.callout} data-tone="warn">当前为教学模拟数据，权数只用于演示方法。</p>}
      <div className={styles.metrics}><Metric accent label="有效样本量" value={fmt(summary.nEff, 0)} note={`原样本 ${summary.n}`} /><Metric label="权数的设计效应" value={fmt(summary.deff, 3)} /><Metric label="最大 / 最小权数" value={fmt(summary.ratio, 2)} note={`${fmt(summary.min, 3)} – ${fmt(summary.max, 3)}`} /><Metric label={s.method === 'post' ? '方法' : '迭代次数'} value={s.method === 'post' ? '事后分层' : String(result.value.iterations)} note={result.value.converged ? '已收敛' : '未收敛'} /></div>
      {result.value.fits.map(f => <div key={f.name} className={styles.resultTable}><table><thead><tr><th>{f.name}</th><th>调整前</th><th>目标</th><th>调整后</th></tr></thead><tbody>{f.categories.map(c => { const tot = f.categories.reduce((a, x) => a + x.target, 0), before = f.categories.reduce((a, x) => a + x.before, 0); return <tr key={c.category}><td>{c.category}</td><td>{pct(c.before / before)}</td><td>{pct(c.target / tot)}</td><td data-strong>{pct(c.after / f.categories.reduce((a, x) => a + x.after, 0))}</td></tr>; })}</tbody></table></div>)}
      <Formula compact label={s.method === 'post' ? '事后分层权数' : '迭代校准'} tex={s.method === 'post' ? String.raw`w_i=d_i\cdot\frac{N_g}{\sum_{k\in r_g}d_k}` : String.raw`w_i^{(t+1)}=w_i^{(t)}\cdot\frac{T_{kc}}{\sum_{j:\,x_{jk}=c}w_j^{(t)}},\qquad n_{\text{eff}}=\frac{\left(\sum_iw_i\right)^{2}}{\sum_iw_i^{2}}`} />
      <div className={styles.row}>
        <Download label="下载带权数的数据（CSV）" filename={`${source?.name ?? '数据'}-${label}.csv`} content={csv} />
        {linked
          ? <><span className={styles.badge}>已用于复杂样本估计，随调整自动更新</span><button type="button" className={styles.ghost} onClick={() => onWeights(null)}>取消使用</button></>
          : <button type="button" className={styles.primary} onClick={() => onWeights({ key: source!.key, values: result.value!.weights, label })}>用于复杂样本估计</button>}
      </div>
      <Statement text={statement} footnote="来源年份与口径请在报告中写明；非概率样本加权后仍不是概率样本。" />
      <Notes items={result.value.warnings} />
    </>}
  </Calc>;
}
