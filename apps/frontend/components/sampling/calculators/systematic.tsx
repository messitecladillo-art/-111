'use client';
import { useMemo } from 'react';
import { parseNumberList } from '@/lib/sampling-core';
import { systematicEstimate } from '@/lib/sampling-estimators';
import { systematicPlan } from '@/lib/sampling-planning';
import { selectSrs, selectStratified, selectSystematic } from '@/lib/sampling-selection';
import { Tex } from '../../math/Tex';
import { attempt, Calc, Choice, ciText, Confidence, Download, EditTable, Field, fmt, Metric, Notes, parseNumber, Paste, Rich, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

const positionsCsv = (rows: { group?: string; positions: number[] }[]) => ['组别,序号,名单中的位置', ...rows.flatMap(r => r.positions.map((p, i) => [r.group ?? '全部', i + 1, p].join(',')))].join('\r\n');
function PositionList({ positions }: { positions: number[] }) {
  return <div className={styles.positions} aria-label="入样位置">{positions.map(p => <span key={p}>{p}</span>)}</div>;
}

export function SystematicCalc({ mode: initialMode = 'select' }: { mode?: string }) {
  const [s, set] = usePersistent(`systematic.v1.${initialMode}`, { mode: initialMode === 'estimate' ? 'estimate' : 'select', N: '1250', n: '60', seed: '20261014', values: '12 15 14 18 21 19 23 26 24 29 31 30 34', Nest: '400', confidence: '0.95' });
  const conf = Number(s.confidence);
  const result = useMemo(() => attempt(() => {
    if (s.mode === 'select') {
      const N = parseNumber(s.N), n = parseNumber(s.n);
      if (!s.seed.trim()) throw Error('请填写随机种子。');
      return { kind: 'select' as const, plan: systematicPlan(N, n), draw: selectSystematic(N, n, s.seed.trim()) };
    }
    const { values, invalid } = parseNumberList(s.values);
    if (invalid.length) throw Error(`无法识别：${invalid.slice(0, 3).join('、')}`);
    return { kind: 'estimate' as const, r: systematicEstimate(values, { N: s.Nest.trim() ? parseNumber(s.Nest) : null, confidence: conf }) };
  }), [s, conf]);
  return <Calc title={s.mode === 'select' ? '生成等距样本' : '系统样本的估计'} intro={<Rich text={s.mode === 'select' ? '按名单顺序编号 $1,\\dots,N$，给出入样位置；间距不是整数时采用分数间距，保证每个单位的入样概率都是 $n/N$。' : '按抽样顺序粘贴样本值，比较两种方差近似。'} />}
    inputs={<>
      <Choice label="做什么" value={s.mode} options={[['select', '抽取'], ['estimate', '估计']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'select' ? <>
        <Field label="名单单位数" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" />
        <Field label="样本量" tex="n" value={s.n} onChange={n => set({ ...s, n })} inputMode="numeric" />
        <Field label="随机种子" value={s.seed} onChange={seed => set({ ...s, seed })} inputMode="text" wide />
      </> : <>
        <Paste label="样本值（按名单顺序）" value={s.values} onChange={values => set({ ...s, values })} rows={5} />
        <Field label="名单单位数（可留空）" tex="N" value={s.Nest} onChange={Nest => set({ ...s, Nest })} inputMode="numeric" />
        <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
      </>}
    </>} error={result.error}>
    {result.value?.kind === 'select' && <><div className={styles.metrics}><Metric accent label="抽样间距" value={fmt(result.value.draw.interval, 4)} /><Metric label="随机起点" value={fmt(result.value.draw.start, 4)} /><Metric label="入样概率" value={fmt(parseNumber(s.n) / parseNumber(s.N), 5)} /></div>
      <Steps steps={result.value.plan.steps} /><PositionList positions={result.value.draw.positions} />
      <div className={styles.row}><Download label="下载入样位置（CSV）" filename="系统抽样入样位置.csv" content={() => positionsCsv([{ positions: result.value!.kind === 'select' ? result.value!.draw.positions : [] }])} /><span className={styles.badge}>随机种子 {s.seed.trim()}</span></div></>}
    {result.value?.kind === 'estimate' && <><div className={styles.metrics}><Metric accent label="均值估计" value={fmt(result.value.r.mean.value)} note={`${Math.round(conf * 100)}% 区间（差分法）${ciText(result.value.r.mean.ci)}`} /><Metric label="标准误（简单随机近似）" value={fmt(Math.sqrt(result.value.r.vSrs))} /><Metric label="标准误（相邻差分）" value={fmt(Math.sqrt(result.value.r.vDiff))} /></div>
      <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>}
  </Calc>;
}

export function SelectionCalc() {
  const [s, set] = usePersistent('selection.v1', { mode: 'srs', N: '860', n: '40', seed: '20261014', strata: [{ name: '本科生', N: '620', n: '28' }, { name: '研究生', N: '240', n: '12' }] });
  const result = useMemo(() => attempt(() => {
    if (!s.seed.trim()) throw Error('请填写随机种子。');
    if (s.mode === 'srs') return [{ group: '全部', positions: selectSrs(parseNumber(s.N), parseNumber(s.n), s.seed.trim()) }];
    return selectStratified(s.strata.map(x => ({ name: x.name.trim() || '未命名层', N: parseNumber(x.N), n: parseNumber(x.n) })), s.seed.trim()).map(d => ({ group: d.name, positions: d.positions }));
  }), [s]);
  return <Calc title="从名单中随机抽取" intro={<Rich text="把名单按任意固定顺序编号 $1,\dots,N$（分层时每层单独编号），用随机种子抽取；同一种子可重现同一结果。" />}
    inputs={<>
      <Choice label="方式" value={s.mode} options={[['srs', '简单随机抽样'], ['stratified', '分层随机抽样']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'srs'
        ? <><Field label="名单单位数" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" /><Field label="样本量" tex="n" value={s.n} onChange={n => set({ ...s, n })} inputMode="numeric" /></>
        : <EditTable caption="各层名单规模与样本量" rows={s.strata} onChange={strata => set({ ...s, strata })} min={2} make={i => ({ name: `第${i + 1}层`, N: '', n: '' })}
          columns={[{ key: 'name', label: '层' }, { key: 'N', label: <Tex tex="N_h" />, numeric: true }, { key: 'n', label: <Tex tex="n_h" />, numeric: true }]} />}
      <Field label="随机种子" value={s.seed} onChange={seed => set({ ...s, seed })} inputMode="text" wide />
    </>} error={result.error}>
    {result.value && <>{result.value.map(g => <div key={g.group} className={styles.span2}><h5>{g.group} · {g.positions.length} 个</h5><PositionList positions={g.positions} /></div>)}
      <div className={styles.row}><Download label="下载入样名单位置（CSV）" filename="随机抽样入样位置.csv" content={() => positionsCsv(result.value ?? [])} /><span className={styles.badge}>随机种子 {s.seed.trim()}</span></div>
      <Notes items={['抽样记录（名单版本、编号规则、随机种子、入样位置）应放入附录，便于复核。']} /></>}
  </Calc>;
}
