'use client';
import { useMemo } from 'react';
import { randomizedResponse, type RrDesign } from '@/lib/sampling-estimators';
import { rrPlan } from '@/lib/sampling-planning';
import { attempt, Calc, Choice, Confidence, Field, fmt, Metric, Notes, parseNumber, pct, Rich, Steps, usePersistent } from '../ui';
import styles from '../Sampling.module.css';

type State = { mode: string; model: string; p: string; piU: string; truth: string; forcedYes: string; n: string; yes: string; pi: string; margin: string; confidence: string };
function design(s: State): RrDesign {
  if (s.model === 'warner') return { model: 'warner', p: parseNumber(s.p) };
  if (s.model === 'unrelated') return { model: 'unrelated', p: parseNumber(s.p), piU: parseNumber(s.piU) };
  return { model: 'forced', truth: parseNumber(s.truth), forcedYes: parseNumber(s.forcedYes) };
}
const DEVICE: Record<string, string> = {
  warner: '例：袋中 7 个红球、3 个白球，摸到红球回答“你是否在考试中作弊过？”，摸到白球回答“你是否从未在考试中作弊过？”（$p=0.7$）。',
  unrelated: '例：摸到红球回答敏感问题，摸到白球回答“你的生日是否在 1–3 月？”（$\\pi_U\\approx 0.25$，可按出生月份分布校正）。',
  forced: '例：掷骰子，1–4 点如实回答，5 点一律答“是”，6 点一律答“否”（$p_1=4/6$，$p_2=1/6$）。',
};

export function RrCalc({ mode: initialMode = 'estimate' }: { mode?: string }) {
  const [s, set] = usePersistent<State>(`rr.v1.${initialMode}`, { mode: initialMode === 'plan' ? 'plan' : 'estimate', model: 'forced', p: '0.7', piU: '0.25', truth: '0.6667', forcedYes: '0.1667', n: '400', yes: '118', pi: '0.15', margin: '0.05', confidence: '0.95' });
  const conf = Number(s.confidence);
  const result = useMemo(() => attempt(() => s.mode === 'estimate'
    ? { kind: 'estimate' as const, r: randomizedResponse(design(s), { n: parseNumber(s.n), yes: parseNumber(s.yes), confidence: conf }) }
    : { kind: 'plan' as const, r: rrPlan(design(s), { pi: parseNumber(s.pi), margin: parseNumber(s.margin), confidence: conf }) }), [s, conf]);
  return <Calc title={s.mode === 'estimate' ? '随机化回答：估计敏感比例' : '随机化回答：所需样本量'} intro={<Rich text={DEVICE[s.model]} />}
    inputs={<>
      <Choice label="做什么" value={s.mode} options={[['estimate', '估计'], ['plan', '样本量']] as const} onChange={mode => set({ ...s, mode })} />
      <Choice label="模型" value={s.model} options={[['forced', '强制回答'], ['unrelated', '无关问题'], ['warner', 'Warner']] as const} onChange={model => set({ ...s, model })} />
      {s.model === 'forced'
        ? <><Field label="如实回答的概率" tex="p_1" value={s.truth} onChange={truth => set({ ...s, truth })} /><Field label="强制答“是”的概率" tex="p_2" value={s.forcedYes} onChange={forcedYes => set({ ...s, forcedYes })} /></>
        : <><Field label={s.model === 'warner' ? '回答敏感陈述的概率' : '回答敏感问题的概率'} tex="p" value={s.p} onChange={p => set({ ...s, p })} />{s.model === 'unrelated' && <Field label="无关问题答“是”的比例" tex="\pi_U" value={s.piU} onChange={piU => set({ ...s, piU })} />}</>}
      {s.mode === 'estimate'
        ? <><Field label="有效样本量" tex="n" value={s.n} onChange={n => set({ ...s, n })} inputMode="numeric" /><Field label="回答“是”的人数" value={s.yes} onChange={yes => set({ ...s, yes })} inputMode="numeric" /></>
        : <><Field label="预估敏感比例" tex="\pi_A" value={s.pi} onChange={pi => set({ ...s, pi })} /><Field label="允许误差" tex="e" value={s.margin} onChange={margin => set({ ...s, margin })} /></>}
      <Confidence value={s.confidence} onChange={confidence => set({ ...s, confidence })} />
    </>} error={result.error}>
    {result.value?.kind === 'estimate' && <><div className={styles.metrics}><Metric accent label="敏感特征比例" value={pct(result.value.r.pi.value, 2)} note={`${Math.round(conf * 100)}% 区间 [${pct(Math.max(0, result.value.r.pi.ci.lower), 2)}, ${pct(Math.min(1, result.value.r.pi.ci.upper), 2)}]`} /><Metric label="标准误" value={pct(result.value.r.pi.se, 2)} /><Metric label="答“是”者属于 A 的概率" value={pct(result.value.r.jeopardy.yes, 1)} note="越接近样本比例，隐私保护越好" /></div>
      <Steps steps={result.value.r.steps} /><Notes items={result.value.r.warnings} /></>}
    {result.value?.kind === 'plan' && <><div className={styles.metrics}><Metric accent label="所需样本量" value={String(result.value.r.n)} unit="份" /><Metric label="直接提问所需" value={String(result.value.r.nDirect)} unit="份" /><Metric label="样本量倍数" value={fmt(result.value.r.inflation, 2)} note="隐私保护的代价" /></div>
      <Steps steps={result.value.r.steps} /></>}
  </Calc>;
}
