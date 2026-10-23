'use client';
import { useMemo } from 'react';
import { twoPhaseAuxiliary, twoPhaseStratified } from '@/lib/sampling-estimators';
import { parseLabeled, parsePairs } from '@/lib/sampling-input';
import { nonresponsePlan, twoPhasePlan } from '@/lib/sampling-planning';
import { Tex } from '../../math/Tex';
import { attempt, Calc, Choice, ciText, Confidence, EditTable, Field, fmt, Metric, Notes, parseNumber, Paste, pct, Rich, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

const PHASE2_ROWS = `层,y
有车,860
有车,920
有车,780
有车,1010
无车,420
无车,380
无车,460
无车,510
无车,350`;
const PHASE2_PAIRS = `x（第一相已知）,y
12,31
18,44
9,25
22,57
15,38
11,30
20,49
14,36`;

export function TwoPhaseCalc({ mode: initialMode = 'plan' }: { mode?: string }) {
  const [s, set] = usePersistent(`two-phase.v1.${initialMode}`, { mode: ['strata', 'aux', 'plan'].includes(initialMode) ? initialMode : 'plan', phase1: [{ name: '有车', count: '140' }, { name: '无车', count: '260' }], rows: PHASE2_ROWS, pairs: PHASE2_PAIRS, n1: '400', xbar1: '15.2', N: '', rho: '0.8', c: '40', c1: '2', Sy: '10', budget: '6000', confidence: '0.95' });
  const conf = Number(s.confidence);
  const N = s.N.trim() ? parseNumber(s.N) : null;
  const result = useMemo(() => attempt(() => {
    if (s.mode === 'plan') return { kind: 'plan' as const, r: twoPhasePlan({ rho: parseNumber(s.rho), c: parseNumber(s.c), c1: parseNumber(s.c1), Sy: parseNumber(s.Sy), budget: parseNumber(s.budget) }) };
    if (s.mode === 'strata') {
      const parsed = parseLabeled(s.rows);
      if (parsed.errors.length) throw Error(parsed.errors[0]);
      return { kind: 'strata' as const, r: twoPhaseStratified(s.phase1.map(p => ({ name: p.name.trim(), count: parseNumber(p.count) })), parsed.rows.map(r => ({ stratum: r.label, y: r.value })), { N, confidence: conf }) };
    }
    const parsed = parsePairs(s.pairs);
    if (parsed.errors.length) throw Error(parsed.errors[0]);
    return { kind: 'aux' as const, r: twoPhaseAuxiliary({ n1: parseNumber(s.n1), xbar1: parseNumber(s.xbar1) }, parsed.rows, { N, confidence: conf }) };
  }), [s, conf, N]);
  return <Calc title={s.mode === 'plan' ? '是否值得做二重抽样' : s.mode === 'strata' ? '二重分层估计' : '二重比率与回归估计'}
    intro={<Rich text={s.mode === 'plan' ? '比较“第一相便宜地测辅助变量、第二相测主要指标”与“全部预算直接调查”的精度。' : s.mode === 'strata' ? '第一相样本给出各层计数 $n\'_h$，第二相在各层抽子样本测量 $y$。' : '第一相样本给出辅助变量均值 $\\bar{x}\'$，第二相同时测量 $x$ 与 $y$。'} />}
    inputs={<>
      <Choice label="计算什么" value={s.mode} options={[['plan', '最优分配'], ['strata', '二重分层'], ['aux', '二重比率/回归']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'plan' && <>
        <Field label="辅助变量与指标的相关系数" tex="\rho" value={s.rho} onChange={rho => set({ ...s, rho })} />
        <Field label="指标的标准差" tex="S_y" value={s.Sy} onChange={Sy => set({ ...s, Sy })} />
        <Field label="第二相每单位费用" tex="c" value={s.c} onChange={c => set({ ...s, c })} />
        <Field label="第一相每单位费用" tex="c'" value={s.c1} onChange={c1 => set({ ...s, c1 })} />
        <Field label="总预算" tex="C" value={s.budget} onChange={budget => set({ ...s, budget })} wide />
      </>}
      {s.mode === 'strata' && <>
        <EditTable caption="第一相样本中各层的计数" rows={s.phase1} onChange={phase1 => set({ ...s, phase1 })} min={2} make={i => ({ name: `第${i + 1}层`, count: '' })}
          columns={[{ key: 'name', label: '层（与第二相数据一致）' }, { key: 'count', label: <Tex tex="n'_h" />, numeric: true }]} />
        <Paste label="第二相数据（层, y）" value={s.rows} onChange={rows => set({ ...s, rows })} rows={7} />
      </>}
      {s.mode === 'aux' && <>
        <Field label="第一相样本量" tex="n'" value={s.n1} onChange={n1 => set({ ...s, n1 })} inputMode="numeric" />
        <Field label="第一相 x 的均值" tex="\bar{x}'" value={s.xbar1} onChange={xbar1 => set({ ...s, xbar1 })} />
        <Paste label="第二相数据（x, y）" value={s.pairs} onChange={pairs => set({ ...s, pairs })} rows={7} />
      </>}
      {s.mode !== 'plan' && <><Field label="总体规模（可留空）" tex="N" value={s.N} onChange={v => set({ ...s, N: v })} inputMode="numeric" /><Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} /></>}
    </>} error={result.error}>
    {result.value?.kind === 'plan' && (() => { const r = result.value.r; return <>
      <div className={styles.callout} data-tone={r.useful ? undefined : 'warn'}>{r.useful ? `值得采用二重抽样：在同样预算下方差约为直接调查的 ${pct(1 / r.gain)}。` : '不值得采用二重抽样：相关不够强或两相费用差距不够大，建议把预算全部用于直接调查。'}</div>
      <div className={styles.metrics}><Metric accent label="第一相样本" value={String(r.n1)} unit="个" /><Metric accent label="第二相样本" value={String(r.n)} unit="个" /><Metric label="相对效率" value={fmt(r.gain, 3)} note="直接调查方差 ÷ 二重抽样方差" /></div>
      <Steps steps={r.steps} /></>; })()}
    {result.value?.kind === 'strata' && <><div className={styles.metrics}><Metric accent label="均值估计" value={fmt(result.value.r.mean.value)} note={`${Math.round(conf * 100)}% 区间 ${ciText(result.value.r.mean.ci)}`} /><Metric label="标准误" value={fmt(result.value.r.mean.se)} /></div><Steps steps={result.value.r.steps} /></>}
    {result.value?.kind === 'aux' && <><div className={styles.resultTable}><table><thead><tr><th>估计量</th><th>估计值</th><th>标准误</th><th>{Math.round(conf * 100)}% 区间</th></tr></thead><tbody>
      <tr><td>二重比率 <Tex tex="\bar{y}_{Rd}" /></td><td>{fmt(result.value.r.ratio.value)}</td><td>{fmt(result.value.r.ratio.se)}</td><td>{ciText(result.value.r.ratio.ci)}</td></tr>
      <tr><td>二重回归 <Tex tex="\bar{y}_{lrd}" /></td><td>{fmt(result.value.r.regression.value)}</td><td>{fmt(result.value.r.regression.se)}</td><td>{ciText(result.value.r.regression.ci)}</td></tr></tbody></table></div>
      <Steps steps={[...result.value.r.steps.ratio, ...result.value.r.steps.regression]} /></>}
  </Calc>;
}

export function NonresponseCalc() {
  const [s, set] = usePersistent('nonresponse.v1', { S: '15', S2: '18', W2: '40', c0: '1', c1: '3', c2: '40', margin: '1.5', confidence: '0.95', N: '' });
  const result = useMemo(() => attempt(() => nonresponsePlan({ S2: parseNumber(s.S) ** 2, S2nr: parseNumber(s.S2) ** 2, W2: parseNumber(s.W2) / 100, c0: parseNumber(s.c0), c1: parseNumber(s.c1), c2: parseNumber(s.c2), target: { kind: 'margin', margin: parseNumber(s.margin), confidence: Number(s.confidence) }, N: s.N.trim() ? parseNumber(s.N) : null })), [s]);
  return <Calc title="无回答者的再抽样追访" intro="第一轮（网络、电话）后，从无回答者中按 1/k 抽取子样本进行强化访问。给出最优追访比例与初始样本量。"
    inputs={<>
      <Field label="全体的标准差" tex="S" value={s.S} onChange={S => set({ ...s, S })} />
      <Field label="无回答者的标准差" tex="S_2" value={s.S2} onChange={S2 => set({ ...s, S2 })} />
      <Field label="预计无回答比例" tex="W_2" value={s.W2} onChange={W2 => set({ ...s, W2 })} suffix="%" />
      <Field label="每个初始样本的接触费用" tex="c_0" value={s.c0} onChange={c0 => set({ ...s, c0 })} />
      <Field label="每个第一轮回答的处理费用" tex="c_1" value={s.c1} onChange={c1 => set({ ...s, c1 })} />
      <Field label="每个追访的费用" tex="c_2" value={s.c2} onChange={c2 => set({ ...s, c2 })} />
      <Field label="允许误差" tex="e" value={s.margin} onChange={margin => set({ ...s, margin })} />
      <Field label="总体规模（可留空）" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" />
      <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
    </>} error={result.error}>
    {result.value && <><div className={styles.metrics}><Metric accent label="追访比例" value={`1/${fmt(result.value.k, 2)}`} /><Metric accent label="初始样本量" value={String(result.value.n)} unit="份" /><Metric label="需追访" value={String(result.value.followUp)} unit="人" /><Metric label="预计费用" value={fmt(result.value.cost, 0)} /></div>
      <Steps steps={result.value.steps} /><Notes items={result.value.warnings} /></>}
  </Calc>;
}
