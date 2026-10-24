'use client';
import { useMemo } from 'react';
import { texNum } from '@/lib/sampling-core';
import { clusterSample, twoStage } from '@/lib/sampling-estimators';
import { parseLabeled } from '@/lib/sampling-input';
import { clusterPlan, twoStagePlan } from '@/lib/sampling-planning';
import { Tex } from '../../math/Tex';
import { attempt, Calc, Choice, ciText, Confidence, Field, fmt, Metric, Notes, parseNumber, Paste, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

const CLUSTER_ROWS = `群（班级）,y
一班,7
一班,9
一班,6
一班,8
二班,4
二班,5
二班,6
三班,8
三班,10
三班,9
三班,7
四班,5
四班,6
四班,4`;

export function ClusterCalc({ mode: initialMode = 'plan' }: { mode?: string }) {
  const [s, set] = usePersistent(`cluster.v1.${initialMode}`, { mode: initialMode === 'estimate' ? 'estimate' : 'plan', rows: CLUSTER_ROWS, N: '60', Mbar: '', nSrs: '385', rho: '0.05', mbar: '30', cv: '0', confidence: '0.95' });
  const conf = Number(s.confidence);
  const result = useMemo(() => attempt(() => {
    if (s.mode === 'plan') return { kind: 'plan' as const, r: clusterPlan({ nSrs: parseNumber(s.nSrs), rho: parseNumber(s.rho), mbar: parseNumber(s.mbar), cv: s.cv.trim() ? parseNumber(s.cv) : 0 }) };
    const parsed = parseLabeled(s.rows);
    if (parsed.errors.length) throw Error(parsed.errors[0]);
    return { kind: 'estimate' as const, r: clusterSample(parsed.rows.map(r => ({ cluster: r.label, y: r.value })), { N: s.N.trim() ? parseNumber(s.N) : null, Mbar: s.Mbar.trim() ? parseNumber(s.Mbar) : null, confidence: conf }) };
  }), [s, conf]);
  return <Calc title={s.mode === 'plan' ? '整群抽样需要多少群' : '整群样本的估计'} intro={s.mode === 'plan' ? '先按简单随机抽样算出样本量，再乘以设计效应，换算为群数。' : '每行一个被调查单位：所在群的名称和调查值；入样群内的所有单位都应列出。'}
    inputs={<>
      <Choice label="计算什么" value={s.mode} options={[['plan', '所需群数'], ['estimate', '由数据估计']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'plan' ? <>
        <Field label="简单随机抽样所需样本量" tex="n_{srs}" value={s.nSrs} onChange={nSrs => set({ ...s, nSrs })} hint="来自“样本量”页面" />
        <Field label="群内相关系数" tex="\rho" value={s.rho} onChange={rho => set({ ...s, rho })} hint="最好由预调查估计" />
        <Field label="平均每群调查人数" tex="\bar{m}" value={s.mbar} onChange={mbar => set({ ...s, mbar })} />
        <Field label="群规模变异系数（可选）" tex="CV_M" value={s.cv} onChange={cv => set({ ...s, cv })} hint="各群人数相差大时填写" />
      </> : <>
        <Paste label="样本数据（群, y）" value={s.rows} onChange={rows => set({ ...s, rows })} rows={8} />
        <Field label="总体群数（可留空）" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" />
        <Field label="总体平均群规模（可留空）" tex="\bar{M}" value={s.Mbar} onChange={Mbar => set({ ...s, Mbar })} />
        <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
      </>}
    </>} error={result.error}>
    {result.value?.kind === 'plan' && <><div className={styles.metrics}><Metric accent label="所需群数" value={String(result.value.r.clusters)} unit="个" /><Metric label="调查人数" value={String(result.value.r.elements)} unit="人" /><Metric label="设计效应" value={fmt(result.value.r.deff, 3)} /></div>
      <Steps steps={result.value.r.steps} />
      <div className={styles.resultTable}><table><thead><tr><th>群内相关系数 <Tex tex="\rho" /></th><th>设计效应</th><th>所需群数</th></tr></thead><tbody>{result.value.r.sensitivity.map(x => <tr key={x.rho}><td>{x.rho}</td><td>{fmt(x.deff, 3)}</td><td>{x.clusters}</td></tr>)}</tbody></table></div>
      <Notes items={['ρ 的取值对结果影响很大：上表给出不同 ρ 下所需的群数，供论证时参考。']} /></>}
    {result.value?.kind === 'estimate' && <><div className={styles.metrics}><Metric accent label="均值估计" value={fmt(result.value.r.mean.value)} note={`${Math.round(conf * 100)}% 区间 ${ciText(result.value.r.mean.ci)}`} /><Metric label="标准误" value={fmt(result.value.r.mean.se)} />{result.value.r.icc !== null && <Metric label="群内相关系数" value={fmt(result.value.r.icc, 3)} />}{result.value.r.deff !== null && <Metric label="设计效应" value={fmt(result.value.r.deff, 3)} />}</div>
      <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>}
  </Calc>;
}

const TWO_STAGE_ROWS = `初级单元,y
A社区,32
A社区,41
A社区,37
A社区,29
B社区,45
B社区,52
B社区,47
B社区,50
C社区,30
C社区,35
C社区,28
C社区,33
D社区,40
D社区,38
D社区,44
D社区,42`;

export function TwoStageCalc({ mode: initialMode = 'plan' }: { mode?: string }) {
  const [s, set] = usePersistent(`two-stage.v1.${initialMode}`, { mode: initialMode === 'estimate' ? 'estimate' : 'plan', input: 'rho', S: '12', rho: '0.08', S1: '', S2: '', M: '200', N: '', c1: '300', c2: '20', constraint: 'budget', budget: '20000', margin: '1.5', confidence: '0.95', rows: TWO_STAGE_ROWS, Ne: '40', Me: '120' });
  const conf = Number(s.confidence);
  const result = useMemo(() => attempt(() => {
    if (s.mode === 'estimate') {
      const parsed = parseLabeled(s.rows);
      if (parsed.errors.length) throw Error(parsed.errors[0]);
      return { kind: 'estimate' as const, r: twoStage(parsed.rows.map(r => ({ psu: r.label, y: r.value })), { N: parseNumber(s.Ne), M: parseNumber(s.Me), confidence: conf }) };
    }
    return { kind: 'plan' as const, r: twoStagePlan({
      components: s.input === 'rho' ? { S: parseNumber(s.S), rho: parseNumber(s.rho) } : { S1: parseNumber(s.S1), S2: parseNumber(s.S2) },
      M: parseNumber(s.M), N: s.N.trim() ? parseNumber(s.N) : null, c1: parseNumber(s.c1), c2: parseNumber(s.c2),
      constraint: s.constraint === 'budget' ? { kind: 'budget', budget: parseNumber(s.budget) } : { kind: 'precision', target: { kind: 'margin', margin: parseNumber(s.margin), confidence: conf } },
    }) };
  }), [s, conf]);
  return <Calc title={s.mode === 'plan' ? '二阶抽样的最优设计' : '二阶样本的估计'} intro={s.mode === 'plan' ? '给定两级调查费用，求每个初级单元抽多少人、抽多少个初级单元。' : '每行一个被调查单位：初级单元名称和调查值；各初级单元的样本数须相等。'}
    inputs={<>
      <Choice label="计算什么" value={s.mode} options={[['plan', '最优设计'], ['estimate', '由数据估计']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'plan' ? <>
        <Choice label="已知信息" value={s.input} options={[['rho', '标准差与群内相关'], ['components', '两级方差']] as const} onChange={input => set({ ...s, input })} />
        {s.input === 'rho'
          ? <><Field label="单位层面标准差" tex="S" value={s.S} onChange={S => set({ ...s, S })} /><Field label="群内相关系数" tex="\rho" value={s.rho} onChange={rho => set({ ...s, rho })} /></>
          : <><Field label="初级单元间方差" tex="S_1^2" value={s.S1} onChange={S1 => set({ ...s, S1 })} /><Field label="初级单元内方差" tex="S_2^2" value={s.S2} onChange={S2 => set({ ...s, S2 })} /></>}
        <Field label="每个初级单元的二级单元数" tex="M" value={s.M} onChange={M => set({ ...s, M })} inputMode="numeric" />
        <Field label="初级单元总数（可留空）" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" />
        <Field label="每个初级单元的费用" tex="c_1" value={s.c1} onChange={c1 => set({ ...s, c1 })} hint="交通、联系、组织" />
        <Field label="每个二级单元的费用" tex="c_2" value={s.c2} onChange={c2 => set({ ...s, c2 })} hint="礼品、访问时间" />
        <Choice label="约束" value={s.constraint} options={[['budget', '给定预算'], ['precision', '给定精度']] as const} onChange={constraint => set({ ...s, constraint })} />
        {s.constraint === 'budget' ? <Field label="总预算" tex="C" value={s.budget} onChange={budget => set({ ...s, budget })} /> : <><Field label="允许误差" tex="e" value={s.margin} onChange={margin => set({ ...s, margin })} /><Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} /></>}
      </> : <>
        <Paste label="样本数据（初级单元, y）" value={s.rows} onChange={rows => set({ ...s, rows })} rows={8} />
        <Field label="初级单元总数" tex="N" value={s.Ne} onChange={Ne => set({ ...s, Ne })} inputMode="numeric" />
        <Field label="每个初级单元的二级单元数" tex="M" value={s.Me} onChange={Me => set({ ...s, Me })} inputMode="numeric" />
        <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
      </>}
    </>} error={result.error}>
    {result.value?.kind === 'plan' && <><div className={styles.metrics}><Metric accent label="每个初级单元抽" value={String(result.value.r.m)} unit="人" note={`公式值 ${fmt(result.value.r.mExact, 2)}`} /><Metric accent label="初级单元数" value={String(result.value.r.n)} unit="个" /><Metric label="总费用" value={fmt(result.value.r.cost, 0)} />{result.value.r.margin !== null && <Metric label="允许误差" value={`±${fmt(result.value.r.margin, 3)}`} />}<Metric label="设计效应" value={fmt(result.value.r.deff, 3)} /></div>
      <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>}
    {result.value?.kind === 'estimate' && <><div className={styles.metrics}><Metric accent label="均值估计" value={fmt(result.value.r.mean.value)} note={`${Math.round(conf * 100)}% 区间 ${ciText(result.value.r.mean.ci)}`} /><Metric label="标准误" value={fmt(result.value.r.mean.se)} /><Metric label="总量估计" value={fmt(result.value.r.total.value, 0)} /></div>
      <Steps steps={result.value.r.steps} />
      <div className={styles.callout}>供下一次设计使用的方差分量：<Tex tex={String.raw`\hat{S}_1^{2}=${texNum(result.value.r.components.S1, 5)},\ \hat{S}_2^{2}=${texNum(result.value.r.components.S2, 5)}`} /></div>
      <Notes items={result.value.r.warnings} /></>}
  </Calc>;
}
