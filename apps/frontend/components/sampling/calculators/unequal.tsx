'use client';
import { useMemo } from 'react';
import { hansenHurwitz, horvitzThompson } from '@/lib/sampling-estimators';
import { parseLabeled, parseTable } from '@/lib/sampling-input';
import { selectPpsSystematic, selectPpsWithReplacement } from '@/lib/sampling-selection';
import { Formula, Tex } from '../../math/Tex';
import { attempt, Calc, Choice, ciText, Confidence, Download, Field, fmt, Metric, Notes, parseNumber, Paste, Rich, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

const FRAME = `单位,规模
甲区,1120000
乙区,880000
丙区,1350000
丁区,640000
戊区,970000
己区,450000
庚区,760000
辛区,1510000
壬区,520000
癸区,690000`;
const HH_DATA = `y（单位总量）,p（每次抽中的概率）
2350,0.12
1840,0.09
2720,0.14
990,0.05`;
const HT_DATA = `y（单位总量）,π（入样概率）
2350,0.48
1840,0.36
2720,0.56
990,0.20`;

export function PpsCalc({ mode: initialMode = 'select' }: { mode?: string }) {
  const [s, set] = usePersistent(`pps.v1.${initialMode}`, { mode: ['select', 'hh', 'ht'].includes(initialMode) ? initialMode : 'select', method: 'systematic', frame: FRAME, n: '4', seed: '20261014', hh: HH_DATA, ht: HT_DATA, N: '', confidence: '0.95' });
  const conf = Number(s.confidence);
  const selection = useMemo(() => attempt(() => {
    if (s.mode !== 'select') return null;
    const parsed = parseLabeled(s.frame);
    if (parsed.errors.length) throw Error(parsed.errors[0]);
    const units = parsed.rows.map(r => ({ name: r.label, size: r.value })), n = parseNumber(s.n);
    if (!s.seed.trim()) throw Error('请填写随机种子，便于复核。');
    return s.method === 'systematic'
      ? { kind: 'sys' as const, units, r: selectPpsSystematic(units, n, s.seed.trim()) }
      : { kind: 'wr' as const, units, r: selectPpsWithReplacement(units, n, s.seed.trim(), s.method === 'lahiri' ? 'lahiri' : 'cumulative') };
  }), [s]);
  const estimate = useMemo(() => attempt(() => {
    if (s.mode === 'select') return null;
    const parsed = parseTable(s.mode === 'hh' ? s.hh : s.ht, ['number', 'number']);
    if (parsed.errors.length) throw Error(parsed.errors[0]);
    const N = s.N.trim() === '' ? null : parseNumber(s.N);
    return s.mode === 'hh'
      ? hansenHurwitz(parsed.rows.map(([y, p]) => ({ y: y as number, p: p as number })), { N, confidence: conf })
      : horvitzThompson(parsed.rows.map(([y, pi]) => ({ y: y as number, pi: pi as number })), { N, confidence: conf });
  }), [s, conf]);
  const csv = () => {
    if (!selection.value) return '';
    if (selection.value.kind === 'sys') return ['序号,单位,规模,入样概率,设计权数,必然入样', ...selection.value.r.selected.map((u, i) => [i + 1, u.name, u.size, u.pi, 1 / u.pi, u.certainty ? '是' : '否'].join(','))].join('\r\n');
    return ['抽取次序,随机数,单位,规模,每次抽中概率', ...selection.value.r.draws.map(d => [d.order, d.random, d.name, selection.value!.units[d.index].size, d.p].join(','))].join('\r\n');
  };
  return <Calc title={s.mode === 'select' ? '按规模大小成比例抽取单位' : s.mode === 'hh' ? 'Hansen–Hurwitz 估计' : 'Horvitz–Thompson 估计'}
    intro={<Rich text={s.mode === 'select' ? '粘贴抽样框（名称, 规模），用固定的随机种子抽取；同一种子总能重现同一样本，可放入附录供复核。' : s.mode === 'hh' ? '每行一个抽取结果：该单位的调查总量 $y_i$ 与每次抽中的概率 $p_i$。' : '每行一个入样单位：该单位的调查总量 $y_i$ 与入样概率 $\\pi_i$。'} />}
    inputs={<>
      <Choice label="做什么" value={s.mode} options={[['select', '抽取单位'], ['hh', '放回 PPS 估计'], ['ht', '不放回 πPS 估计']] as const} onChange={mode => set({ ...s, mode })} />
      {s.mode === 'select' ? <>
        <Choice label="抽取方法" value={s.method} options={[['systematic', '系统 PPS（不放回）'], ['cumulative', '代码法（放回）'], ['lahiri', '拉希里法（放回）']] as const} onChange={method => set({ ...s, method })} />
        <Paste label="抽样框（名称, 规模）" value={s.frame} onChange={frame => set({ ...s, frame })} rows={8} hint="规模可用常住人口、学生数、营业额等；按地理或规模顺序排列可获得隐含分层。" />
        <Field label={s.method === 'systematic' ? '入样单位数' : '抽取次数'} tex="n" value={s.n} onChange={n => set({ ...s, n })} inputMode="numeric" />
        <Field label="随机种子" value={s.seed} onChange={seed => set({ ...s, seed })} inputMode="text" hint="任意文字或数字，记录在报告附录中。" />
      </> : <>
        <Paste label={s.mode === 'hh' ? '入样数据（总量, 每次抽中概率）' : '入样数据（总量, 入样概率）'} value={s.mode === 'hh' ? s.hh : s.ht} onChange={v => set(s.mode === 'hh' ? { ...s, hh: v } : { ...s, ht: v })} rows={6} />
        <Field label="总体单位数（可留空，用于求均值）" tex="N" value={s.N} onChange={N => set({ ...s, N })} inputMode="numeric" />
        <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
      </>}
    </>} error={s.mode === 'select' ? selection.error : estimate.error}>
    {s.mode === 'select' && selection.value && <>
      {selection.value.kind === 'sys'
        ? <><div className={styles.metrics}><Metric accent label="入样单位" value={String(selection.value.r.selected.length)} unit="个" note={selection.value.r.certainty ? `其中 ${selection.value.r.certainty} 个必然入样` : undefined} /><Metric label="抽样间距" value={fmt(selection.value.r.interval, 2)} /><Metric label="随机起点" value={fmt(selection.value.r.start, 2)} /></div>
          <Formula compact label="入样概率" tex={String.raw`\pi_i=\frac{n'M_i}{M'},\qquad I=\frac{M'}{n'}`} />
          <div className={styles.resultTable}><table><thead><tr><th>单位</th><th>规模 <Tex tex="M_i" /></th><th>入样概率 <Tex tex="\pi_i" /></th><th>设计权数 <Tex tex="1/\pi_i" /></th></tr></thead><tbody>{selection.value.r.selected.map(u => <tr key={u.index}><td>{u.name}{u.certainty && <span className={styles.badge}> 必然</span>}</td><td>{fmt(u.size, 0)}</td><td>{fmt(u.pi, 4)}</td><td>{fmt(1 / u.pi, 3)}</td></tr>)}</tbody></table></div></>
        : <><div className={styles.metrics}><Metric accent label="抽取次数" value={String(selection.value.r.draws.length)} /><Metric label="规模合计" value={fmt(selection.value.r.total, 0)} />{selection.value.r.method === 'lahiri' && <Metric label="尝试次数" value={String(selection.value.r.attempts)} note="拉希里法有一部分尝试会被拒绝" />}</div>
          <div className={styles.resultTable}><table><thead><tr><th>次序</th><th>随机数</th><th>抽中单位</th><th><Tex tex="p_i=M_i/M_0" /></th></tr></thead><tbody>{selection.value.r.draws.map(d => <tr key={d.order}><td>{d.order}</td><td>{fmt(d.random, 2)}</td><td>{d.name}</td><td>{fmt(d.p, 4)}</td></tr>)}</tbody></table></div></>}
      <div className={styles.row}><Download label="下载抽样记录（CSV）" filename="PPS抽样记录.csv" content={csv} /><span className={styles.badge}>随机种子 {s.seed.trim()}</span></div>
    </>}
    {s.mode !== 'select' && estimate.value && <><div className={styles.metrics}><Metric accent label="总量估计" value={fmt(estimate.value.total.value, 2)} note={`${Math.round(conf * 100)}% 区间 ${ciText(estimate.value.total.ci, 2)}`} /><Metric label="标准误" value={fmt(estimate.value.total.se, 2)} />{estimate.value.mean && <Metric label="均值估计" value={fmt(estimate.value.mean.value)} note={`标准误 ${fmt(estimate.value.mean.se)}`} />}</div>
      <Steps steps={estimate.value.steps} /><Notes items={estimate.value.warnings} /></>}
  </Calc>;
}
