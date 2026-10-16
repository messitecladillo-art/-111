'use client';
import { useMemo } from 'react';
import { parseNumberList } from '@/lib/sampling-core';
import { postStratified, stratifiedMean, stratifiedProportion, type StratumSummary } from '@/lib/sampling-estimators';
import { allocationGains, cumRootF, stratifiedSampleSize, type PlanStratum } from '@/lib/sampling-planning';
import { Tex } from '../../math/Tex';
import { attempt, Calc, Choice, ciText, Confidence, EditTable, Field, fmt, Metric, Notes, parseNumber, Paste, pct, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

type SummaryRow = { name: string; N: string; n: string; mean: string; sd: string; p: string };
const SUMMARY_DEFAULT: SummaryRow[] = [
  { name: '本科院校', N: '18000', n: '160', mean: '1680', sd: '520', p: '34' },
  { name: '专科院校', N: '9000', n: '90', mean: '1420', sd: '460', p: '27' },
  { name: '研究生', N: '3000', n: '50', mean: '2150', sd: '700', p: '41' },
];
function toSummaries(rows: SummaryRow[]): StratumSummary[] {
  return rows.map(r => ({ name: r.name.trim() || '未命名层', N: parseNumber(r.N), n: parseNumber(r.n), mean: parseNumber(r.mean), sd: parseNumber(r.sd) }));
}

export function StratifiedCalc({ mode: initialMode = 'mean' }: { mode?: string }) {
  const [s, set] = usePersistent(`stratified.v1.${initialMode}`, { mode: ['mean', 'proportion', 'post'].includes(initialMode) ? initialMode : 'mean', rows: SUMMARY_DEFAULT, confidence: '0.95' });
  const conf = Number(s.confidence);
  const result = useMemo(() => attempt(() => {
    if (s.mode === 'proportion') return { kind: 'st' as const, r: stratifiedProportion(s.rows.map(r => ({ name: r.name.trim() || '未命名层', N: parseNumber(r.N), n: parseNumber(r.n), p: parseNumber(r.p) / 100 })), { confidence: conf }) };
    if (s.mode === 'post') return { kind: 'post' as const, r: postStratified(toSummaries(s.rows), { confidence: conf }) };
    return { kind: 'st' as const, r: stratifiedMean(toSummaries(s.rows), { confidence: conf }) };
  }), [s, conf]);
  const proportion = s.mode === 'proportion';
  return <Calc title={s.mode === 'post' ? '事后分层估计' : '分层随机抽样的估计'} intro={s.mode === 'post' ? '调查后按已知总体层规模加权；方差按给定各层实际样本量的条件公式计算。' : '输入各层的总体规模与样本汇总（均值和标准差，或比例），按层权汇总。'}
    inputs={<>
      <Choice label="估计什么" value={s.mode} options={[['mean', '均值'], ['proportion', '比例'], ['post', '事后分层均值']] as const} onChange={mode => set({ ...s, mode })} />
      <EditTable caption="各层汇总数据" rows={s.rows} onChange={rows => set({ ...s, rows })} min={2} make={i => ({ name: `第${i + 1}层`, N: '', n: '', mean: '', sd: '', p: '' })}
        columns={[{ key: 'name', label: '层' }, { key: 'N', label: <>总体规模 <Tex tex="N_h" /></>, numeric: true }, { key: 'n', label: <>样本量 <Tex tex="n_h" /></>, numeric: true },
          ...(proportion ? [{ key: 'p' as const, label: <>样本比例 <Tex tex="p_h" />（%）</>, numeric: true }] : [{ key: 'mean' as const, label: <>样本均值 <Tex tex="\bar{y}_h" /></>, numeric: true }, { key: 'sd' as const, label: <>标准差 <Tex tex="s_h" /></>, numeric: true }])]} />
      <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
    </>} error={result.error}>
    {result.value && (result.value.kind === 'st'
      ? <><div className={styles.metrics}>
          <Metric accent label={proportion ? '比例估计' : '均值估计'} value={proportion ? pct(result.value.r.mean.value, 2) : fmt(result.value.r.mean.value)} note={`${Math.round(conf * 100)}% 区间 ${proportion ? `[${pct(result.value.r.mean.ci.lower, 2)}, ${pct(result.value.r.mean.ci.upper, 2)}]` : ciText(result.value.r.mean.ci)}`} />
          <Metric label="标准误" value={proportion ? pct(result.value.r.mean.se, 2) : fmt(result.value.r.mean.se)} />
          {result.value.r.deff !== null && <Metric label="设计效应" value={fmt(result.value.r.deff, 3)} note="相对同样本量简单随机抽样" />}
        </div>
        <div className={styles.resultTable}><table><thead><tr><th>层</th><th><Tex tex="W_h" /></th><th><Tex tex="f_h" /></th><th>{proportion ? <Tex tex="p_h" /> : <Tex tex="\bar{y}_h" />}</th><th>方差贡献</th><th>占比</th></tr></thead>
          <tbody>{result.value.r.rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{fmt(row.W, 4)}</td><td>{fmt(row.f, 4)}</td><td>{proportion ? pct(row.mean, 2) : fmt(row.mean)}</td><td>{fmt(row.contribution, 6)}</td><td data-strong={row.share > 0.5 || undefined}>{pct(row.share)}</td></tr>)}</tbody></table></div>
        <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>
      : <><div className={styles.metrics}><Metric accent label="事后分层均值" value={fmt(result.value.r.mean.value)} note={`${Math.round(conf * 100)}% 区间 ${ciText(result.value.r.mean.ci)}`} /><Metric label="条件标准误" value={fmt(result.value.r.mean.se)} /><Metric label="设计阶段近似标准误" value={fmt(Math.sqrt(result.value.r.unconditionalVariance))} /></div>
        <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>)}
  </Calc>;
}

type PlanRow = { name: string; N: string; S: string; c: string; mean: string };
const PLAN_DEFAULT: PlanRow[] = [
  { name: '中心城区', N: '42000', S: '520', c: '12', mean: '1680' },
  { name: '新城区', N: '31000', S: '610', c: '18', mean: '1510' },
  { name: '远城区', N: '17000', S: '780', c: '30', mean: '1290' },
];
export function StratifiedPlanCalc({ mode: initialMode = 'size' }: { mode?: string }) {
  const [s, set] = usePersistent(`stratified-plan.v1.${initialMode}`, { mode: initialMode === 'gains' ? 'gains' : 'size', method: 'neyman', rows: PLAN_DEFAULT, margin: '50', confidence: '0.95', n: '400' });
  const strata = (rows: PlanRow[]): PlanStratum[] => rows.map((r, i) => ({ id: String(i), name: r.name.trim() || `第${i + 1}层`, size: parseNumber(r.N), sd: parseNumber(r.S), cost: r.c.trim() ? parseNumber(r.c) : null, mean: r.mean.trim() ? parseNumber(r.mean) : null }));
  const result = useMemo(() => attempt(() => s.mode === 'gains'
    ? { kind: 'gains' as const, r: allocationGains(strata(s.rows), parseNumber(s.n)) }
    : { kind: 'size' as const, r: stratifiedSampleSize(strata(s.rows), s.method as 'proportional' | 'neyman' | 'optimal', { kind: 'margin', margin: parseNumber(s.margin), confidence: Number(s.confidence) }) }), [s]);
  return <Calc title={s.mode === 'gains' ? '分层的增益' : '达到精度所需的分层样本量'} intro={s.mode === 'gains' ? '在相同样本量下比较简单随机抽样、比例分配与 Neyman 分配的方差。' : '各层标准差可来自预调查或同类调查；比例目标可用 √(p(1−p))。'}
    inputs={<>
      <Choice label="计算什么" value={s.mode} options={[['size', '所需样本量'], ['gains', '三种方案比较']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'size' && <Choice label="分配方式" value={s.method} options={[['proportional', '比例分配'], ['neyman', 'Neyman 分配'], ['optimal', '费用最优']] as const} onChange={method => set({ ...s, method })} />}
      <EditTable caption="各层的规模、标准差与费用" rows={s.rows} onChange={rows => set({ ...s, rows })} min={2} make={i => ({ name: `第${i + 1}层`, N: '', S: '', c: '', mean: '' })}
        columns={[{ key: 'name', label: '层' }, { key: 'N', label: <Tex tex="N_h" />, numeric: true }, { key: 'S', label: <Tex tex="S_h" />, numeric: true },
          ...(s.mode === 'gains' ? [{ key: 'mean' as const, label: <Tex tex="\bar{Y}_h" />, numeric: true }] : s.method === 'optimal' ? [{ key: 'c' as const, label: <>单位费用 <Tex tex="c_h" /></>, numeric: true }] : [])]} />
      {s.mode === 'size'
        ? <><Field label="允许误差（与指标同单位）" tex="e" value={s.margin} onChange={margin => set({ ...s, margin })} /><Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} /></>
        : <Field label="总样本量" tex="n" value={s.n} onChange={n => set({ ...s, n })} inputMode="numeric" />}
    </>} error={result.error}>
    {result.value && (result.value.kind === 'size'
      ? <><div className={styles.metrics}><Metric accent label="总样本量" value={String(result.value.r.n)} unit="份" note={`公式值 ${fmt(result.value.r.nExact, 2)}`} />{result.value.r.achievedMargin !== null && <Metric label="取整后的允许误差" value={`±${fmt(result.value.r.achievedMargin, 3)}`} />}{result.value.r.cost !== null && <Metric label="变动费用" value={fmt(result.value.r.cost, 0)} />}</div>
        <div className={styles.resultTable}><table><thead><tr><th>层</th><th><Tex tex="n_h" /></th><th><Tex tex="f_h" /></th><th>设计权数</th></tr></thead><tbody>{result.value.r.rows.map(row => <tr key={row.id}><td>{row.name}</td><td data-strong>{row.allocation}</td><td>{pct(row.fraction, 2)}</td><td>{fmt(row.weight, 2)}</td></tr>)}</tbody></table></div>
        <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>
      : <><div className={styles.metrics}><Metric label="简单随机抽样" value={fmt(result.value.r.Vsrs, 4)} note="方差" /><Metric label="比例分配" value={fmt(result.value.r.Vprop, 4)} note={`为前者的 ${pct(result.value.r.Vprop / result.value.r.Vsrs)}`} /><Metric accent label="Neyman 分配" value={fmt(result.value.r.Vneyman, 4)} note={`为前者的 ${pct(result.value.r.Vneyman / result.value.r.Vsrs)}`} /></div>
        <Steps steps={result.value.r.steps} /></>)}
  </Calc>;
}

export function CumRootFCalc() {
  const [s, set] = usePersistent('cumrootf.v1', { values: '', L: '4', classes: '' });
  const values = useMemo(() => parseNumberList(s.values), [s.values]);
  const result = useMemo(() => attempt(() => {
    if (values.invalid.length) throw Error(`无法识别：${values.invalid.slice(0, 3).join('、')}`);
    if (!values.values.length) throw Error('请粘贴抽样框中各单位的辅助变量（如营业额、人数），每个单位一个数。');
    return cumRootF(values.values, parseNumber(s.L), s.classes.trim() ? parseNumber(s.classes) : 0);
  }), [values, s.L, s.classes]);
  return <Calc title="累积平方根法确定分层界限" intro="粘贴抽样框中每个单位的辅助变量值，给出近似最优的分界点，并与按人数等分的方案比较。"
    inputs={<>
      <Paste label="辅助变量（每个单位一个数）" value={s.values} onChange={v => set({ ...s, values: v })} rows={7} placeholder="例如各门店上年营业额：120 85 430 66 …" hint={values.values.length ? `已读取 ${values.values.length} 个数值` : undefined} />
      <Field label="层数" tex="L" value={s.L} onChange={L => set({ ...s, L })} inputMode="numeric" />
      <Field label="分组数（可留空自动）" tex="J" value={s.classes} onChange={classes => set({ ...s, classes })} inputMode="numeric" />
    </>} error={result.error}>
    {result.value && <><div className={styles.metrics}><Metric accent label="分界点" value={result.value.boundaries.map(b => fmt(b, 2)).join(' ｜ ')} /><Metric label="Neyman 目标值" value={fmt(result.value.objective, 1)} note={`等人数分层为 ${fmt(result.value.quantileObjective, 1)}`} /></div>
      <div className={styles.resultTable}><table><thead><tr><th>层</th><th>取值范围</th><th><Tex tex="N_h" /></th><th>均值</th><th><Tex tex="S_h" /></th></tr></thead><tbody>{result.value.strata.map((x, i) => <tr key={i}><td>第 {i + 1} 层</td><td>{fmt(x.lower, 2)} – {fmt(x.upper, 2)}</td><td>{x.count}</td><td>{fmt(x.mean, 2)}</td><td>{fmt(x.sd, 2)}</td></tr>)}</tbody></table></div>
      <Steps steps={result.value.steps} /><Notes items={result.value.warnings} /></>}
  </Calc>;
}
