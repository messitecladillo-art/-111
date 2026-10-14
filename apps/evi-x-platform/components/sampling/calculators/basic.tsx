'use client';
import { useMemo } from 'react';
import { parseNumberList } from '@/lib/sampling-core';
import { srsMean, srsProportion } from '@/lib/sampling-estimators';
import { twoGroupPlan } from '@/lib/sampling-planning';
import { attempt, Calc, Choice, ciText, Confidence, Field, fmt, Metric, Notes, parseNumber, Paste, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

const nullable = (text: string) => text.trim() === '' ? null : parseNumber(text);

export function SrsCalc({ mode: initialMode = 'mean' }: { mode?: string }) {
  const [s, set] = usePersistent(`srs.v1.${initialMode}`, { mode: initialMode === 'proportion' ? 'proportion' : 'mean', values: '68 74 59 81 77 62 70 85 66 73 79 71', N: '1200', a: '86', n: '240', confidence: '0.95' });
  const conf = Number(s.confidence);
  const result = useMemo(() => attempt(() => {
    const N = nullable(s.N);
    if (Number.isNaN(N)) throw Error('总体规模须为数字，或留空。');
    if (s.mode === 'mean') {
      const { values, invalid } = parseNumberList(s.values);
      if (invalid.length) throw Error(`无法识别：${invalid.slice(0, 3).join('、')}`);
      return { kind: 'mean' as const, r: srsMean(values, { N, confidence: conf }) };
    }
    return { kind: 'proportion' as const, r: srsProportion({ a: parseNumber(s.a), n: parseNumber(s.n), N, confidence: conf }) };
  }), [s, conf]);
  return <Calc title="简单随机抽样的估计" intro="不放回简单随机抽样下的点估计、标准误与置信区间；总体规模用于有限总体校正。"
    inputs={<>
      <Choice label="估计什么" value={s.mode} options={[['mean', '均值与总量'], ['proportion', '比例']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'mean'
        ? <Paste label="样本数据（空格、逗号或换行分隔）" value={s.values} onChange={values => set({ ...s, values })} rows={5} />
        : <><Field label="具有该特征的人数" tex="a" value={s.a} onChange={a => set({ ...s, a })} inputMode="numeric" /><Field label="有效样本量" tex="n" value={s.n} onChange={n => set({ ...s, n })} inputMode="numeric" /></>}
      <Field label="总体规模（可留空）" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" placeholder="很大或未知时留空" />
      <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
    </>} error={result.error}>
    {result.value && (result.value.kind === 'mean'
      ? <><div className={styles.metrics}><Metric accent label="均值估计" value={fmt(result.value.r.mean.value)} note={`${Math.round(conf * 100)}% 区间 ${ciText(result.value.r.mean.ci)}`} /><Metric label="标准误" value={fmt(result.value.r.mean.se)} />{result.value.r.total && <Metric label="总量估计" value={fmt(result.value.r.total.value, 2)} note={`标准误 ${fmt(result.value.r.total.se, 2)}`} />}</div>
        <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>
      : <><div className={styles.metrics}><Metric accent label="比例估计" value={`${fmt(result.value.r.p.value * 100, 2)}%`} note={`${Math.round(conf * 100)}% 区间 [${fmt(result.value.r.p.ci.lower * 100, 2)}%, ${fmt(result.value.r.p.ci.upper * 100, 2)}%]`} /><Metric label="标准误" value={`${fmt(result.value.r.p.se * 100, 2)}%`} /></div>
        <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>)}
  </Calc>;
}

export function PowerCalc() {
  const [s, set] = usePersistent('power.v1', { kind: 'proportion', p1: '30', p2: '45', delta: '5', sd: '12', alpha: '0.05', power: '0.8', ratio: '1' });
  const result = useMemo(() => attempt(() => s.kind === 'proportion'
    ? twoGroupPlan({ kind: 'proportion', p1: parseNumber(s.p1) / 100, p2: parseNumber(s.p2) / 100, alpha: parseNumber(s.alpha), power: parseNumber(s.power), ratio: parseNumber(s.ratio) })
    : twoGroupPlan({ kind: 'mean', delta: parseNumber(s.delta), sd: parseNumber(s.sd), alpha: parseNumber(s.alpha), power: parseNumber(s.power), ratio: parseNumber(s.ratio) })), [s]);
  return <Calc title="比较两组所需的样本量" intro="双侧检验、正态近似。用于“两组是否有差异”的研究问题，例如大学生与居民的观看比例。"
    inputs={<>
      <Choice label="比较什么" value={s.kind} options={[['proportion', '两个比例'], ['mean', '两个均值']] as const} onChange={kind => set({ ...s, kind })} />
      {s.kind === 'proportion'
        ? <><Field label="第一组预期比例" tex="p_1" value={s.p1} onChange={p1 => set({ ...s, p1 })} suffix="%" /><Field label="第二组预期比例" tex="p_2" value={s.p2} onChange={p2 => set({ ...s, p2 })} suffix="%" /></>
        : <><Field label="希望检出的差值" tex="\Delta" value={s.delta} onChange={delta => set({ ...s, delta })} /><Field label="标准差" tex="\sigma" value={s.sd} onChange={sd => set({ ...s, sd })} /></>}
      <Field label="显著性水平" tex="\alpha" value={s.alpha} onChange={alpha => set({ ...s, alpha })} />
      <Field label="检验功效" tex="1-\beta" value={s.power} onChange={power => set({ ...s, power })} />
      <Field label="两组样本量之比" tex="k=n_2/n_1" value={s.ratio} onChange={ratio => set({ ...s, ratio })} />
    </>} error={result.error}>
    {result.value && <><div className={styles.metrics}><Metric accent label="第一组" value={String(result.value.n1)} unit="份" /><Metric label="第二组" value={String(result.value.n2)} unit="份" /><Metric label="合计" value={String(result.value.total)} unit="份" /></div>
      <Steps steps={result.value.steps} /><Notes items={result.value.warnings} /></>}
  </Calc>;
}
