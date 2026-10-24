'use client';
import { useMemo } from 'react';
import { auxiliaryEstimators, ratioOfMeans, stratifiedRatio } from '@/lib/sampling-estimators';
import { parseLabeledPairs, parsePairs } from '@/lib/sampling-input';
import { Tex } from '../../math/Tex';
import { attempt, Calc, Choice, ciText, Confidence, EditTable, Field, fmt, Metric, Notes, parseNumber, Paste, pct, Rich, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

const PAIRS = `上年营业额x,本年营业额y
48,53
65,71
32,36
90,97
55,58
41,47
77,85
60,63
38,40
84,93
52,57
70,74`;
const STRATA_ROWS = `层,x,y
城区,48,53
城区,65,71
城区,90,97
城区,77,85
城区,84,93
郊区,32,36
郊区,41,47
郊区,38,40
郊区,52,57
郊区,30,35`;

export function AuxiliaryCalc({ mode: initialMode = 'known' }: { mode?: string }) {
  const [s, set] = usePersistent(`auxiliary.v1.${initialMode}`, { mode: ['known', 'ratio', 'strata'].includes(initialMode) ? initialMode : 'known', pairs: PAIRS, strataRows: STRATA_ROWS, N: '300', Xbar: '58.6', strata: [{ name: '城区', N: '120', Xbar: '72' }, { name: '郊区', N: '180', Xbar: '40' }], confidence: '0.95' });
  const conf = Number(s.confidence);
  const result = useMemo(() => attempt(() => {
    const N = s.N.trim() === '' ? null : parseNumber(s.N);
    if (s.mode === 'strata') {
      const parsed = parseLabeledPairs(s.strataRows);
      if (parsed.errors.length) throw Error(parsed.errors[0]);
      return { kind: 'strata' as const, r: stratifiedRatio(parsed.rows.map(r => ({ stratum: r.label, x: r.x, y: r.y })), s.strata.map(x => ({ name: x.name.trim(), N: parseNumber(x.N), Xbar: parseNumber(x.Xbar) })), { confidence: conf }) };
    }
    const parsed = parsePairs(s.pairs);
    if (parsed.errors.length) throw Error(parsed.errors[0]);
    if (s.mode === 'ratio') return { kind: 'ratio' as const, r: ratioOfMeans(parsed.rows, { N, confidence: conf }) };
    return { kind: 'known' as const, r: auxiliaryEstimators(parsed.rows, { N, Xbar: parseNumber(s.Xbar), confidence: conf }) };
  }), [s, conf]);
  return <Calc title="比率估计与回归估计" intro={<Rich text="粘贴每个样本单位的辅助变量 $x$ 和调查指标 $y$（两列，可带表头）。辅助变量的总体均值须来自普查、统计年鉴等可靠来源。" />}
    inputs={<>
      <Choice label="计算什么" value={s.mode} options={[['known', '已知总体均值：三种估计比较'], ['ratio', '估计两个均值之比'], ['strata', '分层：分别与联合']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'strata'
        ? <><Paste label="样本数据（层, x, y）" value={s.strataRows} onChange={strataRows => set({ ...s, strataRows })} rows={7} />
          <EditTable caption="各层的总体规模与辅助变量均值" rows={s.strata} onChange={strata => set({ ...s, strata })} min={2} make={i => ({ name: `第${i + 1}层`, N: '', Xbar: '' })}
            columns={[{ key: 'name', label: '层（与数据中一致）' }, { key: 'N', label: <Tex tex="N_h" />, numeric: true }, { key: 'Xbar', label: <Tex tex="\bar{X}_h" />, numeric: true }]} /></>
        : <><Paste label="样本数据（x, y）" value={s.pairs} onChange={pairs => set({ ...s, pairs })} rows={7} />
          {s.mode === 'known' && <Field label="辅助变量的总体均值" tex="\bar{X}" value={s.Xbar} onChange={Xbar => set({ ...s, Xbar })} />}
          <Field label="总体规模（可留空）" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" /></>}
      <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
    </>} error={result.error}>
    {result.value?.kind === 'known' && (() => { const r = result.value.r; return <>
      <div className={styles.resultTable}><table><thead><tr><th>估计量</th><th>估计值</th><th>标准误</th><th>{Math.round(conf * 100)}% 区间</th><th>相对简单估计的效率</th></tr></thead><tbody>
        <tr><td>简单估计 <Tex tex="\bar{y}" /></td><td>{fmt(r.simple.value)}</td><td>{fmt(r.simple.se)}</td><td>{ciText(r.simple.ci)}</td><td>1</td></tr>
        <tr><td>比率估计 <Tex tex="\bar{y}_R" /></td><td>{fmt(r.ratio.value)}</td><td>{fmt(r.ratio.se)}</td><td>{ciText(r.ratio.ci)}</td><td data-strong={r.efficiency.ratio > 1 || undefined}>{fmt(r.efficiency.ratio, 2)}</td></tr>
        <tr><td>回归估计 <Tex tex="\bar{y}_{lr}" /></td><td>{fmt(r.regression.value)}</td><td>{fmt(r.regression.se)}</td><td>{ciText(r.regression.ci)}</td><td data-strong={r.efficiency.regression > 1 || undefined}>{fmt(r.efficiency.regression, 2)}</td></tr>
      </tbody></table></div>
      <div className={styles.metrics}><Metric label="相关系数" value={fmt(r.r, 3)} note={r.ratioFavoured.holds ? `高于比率估计门槛 ${fmt(r.ratioFavoured.threshold, 3)}` : `未超过门槛 ${fmt(r.ratioFavoured.threshold, 3)}`} /><Metric label="辅助变量样本均值的变异系数" value={pct(r.cvXbar, 2)} note="低于 10% 时比率估计偏倚可忽略" /></div>
      <h5 className={styles.span2}>比率估计</h5><Steps steps={r.steps.ratio} />
      <h5 className={styles.span2}>回归估计</h5><Steps steps={r.steps.regression} />
      <Notes items={r.warnings} /></>; })()}
    {result.value?.kind === 'ratio' && <><div className={styles.metrics}><Metric accent label="比率估计" value={fmt(result.value.r.R.value, 5)} note={`${Math.round(conf * 100)}% 区间 ${ciText(result.value.r.R.ci, 5)}`} /><Metric label="标准误" value={fmt(result.value.r.R.se, 5)} /></div><Steps steps={result.value.r.steps} /></>}
    {result.value?.kind === 'strata' && <><div className={styles.metrics}><Metric accent label="分别比率估计" value={fmt(result.value.r.separate.value)} note={`标准误 ${fmt(result.value.r.separate.se)}`} /><Metric label="联合比率估计" value={fmt(result.value.r.combined.value)} note={`标准误 ${fmt(result.value.r.combined.se)}`} /><Metric label="辅助变量的总体均值" value={fmt(result.value.r.Xbar)} /></div>
      <h5 className={styles.span2}>分别比率估计</h5><Steps steps={result.value.r.steps.separate} /><h5 className={styles.span2}>联合比率估计</h5><Steps steps={result.value.r.steps.combined} /><Notes items={result.value.r.warnings} /></>}
  </Calc>;
}
