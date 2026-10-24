'use client';
import { useMemo, useState } from 'react';
import { texNum } from '@/lib/sampling-core';
import { LAB_DESIGNS, makePopulation, runLab, type LabResult } from '@/lib/sampling-lab';
import { Formula, Tex } from '../math/Tex';
import { Choice, fmt, pct, Rich } from './ui';
import styles from './Sampling.module.css';

const BINS = 32;
function Histogram({ result, range, truth }: { result: LabResult; range: [number, number]; truth: number }) {
  const [lo, hi] = range, width = (hi - lo) / BINS, counts = new Array<number>(BINS).fill(0);
  for (const e of result.estimates) counts[Math.min(BINS - 1, Math.max(0, Math.floor((e - lo) / width)))]++;
  const max = Math.max(...counts), x = (v: number) => (v - lo) / (hi - lo) * 300;
  return <svg className={styles.histogram} viewBox="0 0 300 128" role="img" aria-label={`${LAB_DESIGNS[result.design].label}的估计值分布`}>
    <line x1="0" x2="300" y1="100" y2="100" className={styles.axis} />
    {counts.map((c, i) => c > 0 && <rect key={i} className={styles.bar} style={{ ['--i' as string]: i }} x={i * 300 / BINS + 0.6} width={300 / BINS - 1.2} y={100 - c / max * 92} height={c / max * 92} />)}
    <line className={styles.truth} x1={x(truth)} x2={x(truth)} y1="2" y2="104" />
    <text className={styles.tick} x="0" y="124">{fmt(lo, 0)}</text><text className={styles.tick} x="300" y="124" textAnchor="end">{fmt(hi, 0)}</text>
  </svg>;
}

export default function SamplingLab() {
  const pop = useMemo(() => makePopulation(), []);
  const [n, setN] = useState('200'), [reps, setReps] = useState('1000');
  const [results, setResults] = useState<LabResult[] | null>(null), [running, setRunning] = useState(false);
  function run() {
    setRunning(true);
    window.setTimeout(() => { setResults(runLab(pop, { n: Number(n), reps: Number(reps), seed: `lab-${n}-${reps}` })); setRunning(false); }, 30);
  }
  const range = useMemo<[number, number]>(() => {
    if (!results) return [0, 1];
    const all = results.flatMap(r => r.estimates), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.04;
    return [lo - pad, hi + pad];
  }, [results]);
  const k = Math.round(pop.units.length / Number(n)), m = pop.clusterSize;
  return <div className={styles.lab}>
    <p className={styles.callout}><Rich text={`模拟总体由程序生成，不代表任何真实人群：6 000 名学生分属 4 个年级、240 个班（每班 25 人），月消费总体均值 $\\bar{Y}=${texNum(pop.Ybar, 5)}$ 元；生活费与月消费的相关系数 $\\rho=${texNum(pop.rho, 3)}$，班内相关系数 $\\rho_c=${texNum(pop.icc, 3)}$。每种设计重复抽样后，比较估计值的分布、偏倚、实际标准误与公式给出的标准误，以及 95% 区间的覆盖率。`} /></p>
    <div className={styles.row}>
      <Choice label="样本量" value={n} options={[['100', '100'], ['200', '200'], ['400', '400']] as const} onChange={setN} />
      <Choice label="重复次数" value={reps} options={[['500', '500 次'], ['1000', '1 000 次'], ['2000', '2 000 次']] as const} onChange={setReps} />
      <button type="button" className={styles.primary} onClick={run} disabled={running}>{running ? '正在抽样…' : results ? '重新抽样' : '开始抽样'}</button>
    </div>
    {results && <>
      <div className={styles.labGrid}>{results.map(r => <article key={r.design} className={styles.labCard}>
        <header><strong>{LAB_DESIGNS[r.design].label}</strong><small>{LAB_DESIGNS[r.design].detail}{r.design === 'cluster' ? `（${r.sampleSize / m} 个班）` : ''}</small></header>
        <Histogram result={r} range={range} truth={pop.Ybar} />
        <dl>
          <div><dt>偏倚</dt><dd>{fmt(r.bias, 2)}</dd></div>
          <div><dt>实际标准误</dt><dd>{fmt(r.empiricalSe, 2)}</dd></div>
          <div><dt>公式标准误（平均）</dt><dd>{fmt(r.meanSe, 2)}</dd></div>
          <div><dt>95% 区间覆盖率</dt><dd data-warn={r.coverage < 0.92 || undefined}>{pct(r.coverage, 1)}</dd></div>
          <div><dt>相对简单随机抽样的效率</dt><dd data-strong>{fmt(r.efficiency, 2)}</dd></div>
        </dl>
      </article>)}</div>
      <p className={styles.muted}>虚线为总体真值 {fmt(pop.Ybar, 1)} 元。效率是同样调查人数的简单随机抽样方差与该设计实际方差之比，大于 1 表示该设计更精确。</p>
      <div className={styles.formulaList}>
        <Formula label="整群抽样的设计效应（用总体参数计算）" tex={String.raw`\mathrm{deff}\approx1+(m-1)\rho_c=1+(${m}-1)\times ${texNum(pop.icc, 3)}=${texNum(1 + (m - 1) * pop.icc, 3)},\qquad \text{效率}\approx\frac{1}{\mathrm{deff}}=${texNum(1 / (1 + (m - 1) * pop.icc), 3)}`} />
        <Formula label="辅助信息带来的增益（回归估计的近似）" tex={String.raw`\frac{V(\bar{y})}{V(\bar{y}_{lr})}\approx\frac{1}{1-\rho^{2}}=\frac{1}{1-${texNum(pop.rho, 3)}^{2}}=${texNum(1 / (1 - pop.rho ** 2), 3)}`} />
        <Formula label="系统抽样的可能样本数" tex={String.raw`k=\frac{N}{n}=\frac{6000}{${n}}=${k}`} />
      </div>
      <ul className={styles.notes}>
        <li>分层的增益来自层间均值差异；本例年级间差异有限，增益不大。</li>
        <li>整群抽样的标准误明显变大：班内学生消费相似，200 人只相当于约 <Tex tex={String.raw`200/\mathrm{deff}`} /> 个独立样本。</li>
        <li>系统抽样把名单按生活费排序，相当于隐含分层，精度很高；但只有 <Tex tex="k" /> 种可能样本，单次抽样的方差只能近似估计，这里的近似偏保守。</li>
        <li>比率估计利用了已知的生活费总体均值，相关越强，增益越大。</li>
      </ul>
    </>}
  </div>;
}
