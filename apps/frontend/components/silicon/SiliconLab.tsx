'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Questionnaire } from '@/lib/questionnaire';
import { questionnaireIssues } from '@/lib/questionnaire';
import type { DesignSnapshot } from '@/lib/questionnaire-mapping';
import { defaultConfig, parseConfig, type LabConfig } from '@/lib/silicon/config';
import { siliconExampleQuestionnaire } from '@/lib/silicon/example';
import { NEUTRAL_HALO, stageCategoryColor } from '@/lib/silicon/palette';
import { ACCESSORY_KINDS, FIGURE_PALETTE, HAIR_TONES, HAT_KINDS, attributeIssues, describePersona, fidelityRisk, generatePanel, synthesizePersonaProfile, type AccessoryKind, type Appearance, type HatKind, type Persona, type PersonaAttribute } from '@/lib/silicon/persona';
import { NO_SCENARIO, SCENARIO_TOKEN, answerLabel, demoRun, designFingerprint, renderQuestionText, type RunProgress, type RunSettings, type SiliconAnswer, type SiliconRun, type SiliconRunRequest } from '@/lib/silicon/run';
import type { FigureActivity, StageFigure, StageTip } from './PersonaStage';
import PanelDesigner from './PanelDesigner';
import PersonaAvatar from './PersonaAvatar';
import ResultsBoard, { type DatasetHandoff } from './ResultsBoard';
import RunConsole, { type ModelOption } from './RunConsole';
import SurveySetup from './SurveySetup';
import styles from './SiliconLab.module.css';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

const PersonaStage = dynamic(() => import('./PersonaStage'), { ssr: false, loading: () => <div className={styles.stageLoading} role="status">正在搭建舞台…</div> });
const AtypicaLiveTheater = dynamic(() => import('./AtypicaLiveTheater'), {
  ssr: false,
  loading: () => <div className={styles.stageLoading} role="status">正在开启实时预测试演播室…</div>,
});

function cleanLabText(value: string): string {
  return value
    .replace(/[【「『]/gu, '“')
    .replace(/[】」』]/gu, '”')
    .replace(/\[/gu, '（')
    .replace(/\]/gu, '）')
    .replace(/\{([^{}]+)\}/gu, '“$1”')
    .replace(/离线演示引擎/gu, '本地快速推演');
}

export type SiliconRunner = {
  models: ModelOption[];
  /** Server's per-run call ceiling, when known; the console warns before a run the server would refuse. */
  maxCalls?: number;
  consentLabel: string;
  run: (request: SiliconRunRequest, onProgress: (progress: RunProgress) => void, signal: AbortSignal) => Promise<SiliconRun>;
};
type Props = { designSnapshot?: DesignSnapshot | null; runner?: SiliconRunner | null; onSendToAnalysis?: (handoff: DatasetHandoff) => void; storageKey?: string };
type Step = 'panel' | 'survey' | 'run' | 'results';
const STEPS: Array<{ id: Step; label: string; hint: string }> = [
  { id: 'panel', label: '画像设定', hint: '谁来作答' },
  { id: 'survey', label: '问卷与情境', hint: '答什么' },
  { id: 'run', label: '运行预试', hint: '推演方式与规模' },
  { id: 'results', label: '结果与检验', hint: '发现了什么' },
];
const THINK_MS = 620;

function subscribeMotion(listener: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const reducedMotionNow = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NARROW = '(max-width: 899px)';
function subscribeNarrow(listener: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const narrowNow = () => window.matchMedia(NARROW).matches;

function readStored(key: string): LabConfig {
  try { return parseConfig(window.localStorage.getItem(key)); } catch { return defaultConfig(); }
}

export default function SiliconLab({ designSnapshot = null, runner = null, onSendToAnalysis, storageKey = 'evix.silicon-lab.v1' }: Props) {
  const [config, setConfig] = useState<LabConfig>(() => typeof window === 'undefined' ? defaultConfig() : readStored(storageKey));
  const update = useCallback((patch: Partial<LabConfig>) => setConfig(c => ({ ...c, ...patch })), []);
  useEffect(() => { try { window.localStorage.setItem(storageKey, JSON.stringify(config)); } catch { /* storage may be unavailable; the lab still works */ } }, [config, storageKey]);
  const reducedMotion = useSyncExternalStore(subscribeMotion, reducedMotionNow, () => false);
  const narrow = useSyncExternalStore(subscribeNarrow, narrowNow, () => false);

  const [step, setStep] = useState<Step>('panel');
  const [visited, setVisited] = useState<Step[]>(['panel']);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flat, setFlat] = useState(false);
  const [liveTheaterOpen, setLiveTheaterOpen] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [stageGroup, setStageGroup] = useState('none');
  const [stageScenario, setStageScenario] = useState('');
  const [stageModel, setStageModel] = useState('');
  const [run, setRun] = useState<SiliconRun | null>(null);
  const [runDesign, setRunDesign] = useState<Questionnaire | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [runError, setRunError] = useState('');
  const [consent, setConsent] = useState(false);
  const [reveal, setReveal] = useState<{ start: number; duration: number } | null>(null);
  const [, setClock] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const theaterMountRef = useRef<HTMLDivElement>(null);
  const theatreRef = useRef<HTMLElement>(null), barRef = useRef<HTMLDivElement>(null);

  // When embedded live theater expands, duck bottom global docks so nothing covers the studio flow.
  useEffect(() => {
    if (!liveTheaterOpen) {
      delete document.documentElement.dataset.siliconTheater;
      return;
    }
    document.documentElement.dataset.siliconTheater = 'open';
    requestAnimationFrame(() => {
      theaterMountRef.current?.scrollIntoView({
        block: 'start',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
    return () => {
      delete document.documentElement.dataset.siliconTheater;
    };
  }, [liveTheaterOpen, reducedMotion]);
  const navigationRef = useKeyedListMotion<HTMLElement>({ ids: STEPS.map(s => s.id), activeId: step, markerAxis: 'horizontal' });
  useEffect(() => {
    const bar = barRef.current, theatre = theatreRef.current;
    if (!bar || !theatre) return;
    const measure = () => { const height = bar.getBoundingClientRect().height; if (height > 0) theatre.style.setProperty('--sx-bar-height', `${Math.ceil(height)}px`); };
    const observer = new ResizeObserver(measure); observer.observe(bar); measure();
    return () => observer.disconnect();
  }, []);

  const example = useMemo(() => siliconExampleQuestionnaire(), []);
  const studioDesign = designSnapshot?.design ?? null;
  const design = config.designSource === 'studio' && studioDesign ? studioDesign : example;

  const panelAttributes = useMemo(() => config.attributes.filter(a => a.label.trim() && a.levels.length >= 2 && a.levels.every(l => l.label.trim()) && a.levels.some(l => l.weight > 0)), [config.attributes]);
  const basePersonas = useMemo(() => generatePanel({ attributes: panelAttributes, size: config.size, allocation: config.allocation, seed: config.seed, background: config.background }), [panelAttributes, config.size, config.allocation, config.seed, config.background]);
  const personas = useMemo(() => basePersonas.map(p => { const o = config.overrides[p.id]; return o ? { ...p, appearance: o.appearance ?? p.appearance, background: o.background ?? p.background } : p; }), [basePersonas, config.overrides]);
  const selected = personas.find(p => p.id === selectedId) ?? null;
  const settings: RunSettings = useMemo(() => ({ engine: config.engine, memory: config.memory, shuffleOptions: config.shuffleOptions, scenarios: config.scenarios.filter(s => s.label.trim() && s.text.trim()), models: config.engine === 'model' ? config.models : [] }), [config.engine, config.memory, config.shuffleOptions, config.scenarios, config.models]);

  const blockers = [...attributeIssues(config.attributes), ...(design.questions.length ? [] : ['问卷还没有题目。'])];
  const stale = !!run && (run.questionnaire.fingerprint !== designFingerprint(design) || run.personas.length !== personas.length || run.personas.some((p, i) => p.id !== personas[i]?.id || JSON.stringify(p.traits) !== JSON.stringify(personas[i]?.traits) || p.background !== personas[i]?.background));

  // The existing run handler starts a decorative receipt cue; completed results are available immediately.
  useEffect(() => {
    if (!reveal) return;
    const timer = window.setTimeout(() => setReveal(null), THINK_MS);
    const pause = () => { if (document.hidden) setReveal(null); };
    document.addEventListener('visibilitychange', pause);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', pause); };
  }, [reveal]);

  const scenarioIds = run?.settings.scenarios.map(s => s.id) ?? [];
  const activeScenario = scenarioIds.includes(stageScenario) ? stageScenario : scenarioIds[0] ?? NO_SCENARIO.id;
  const activeModel = run?.settings.models.includes(stageModel) ? stageModel : run?.settings.models[0] ?? '';
  const responseOf = useCallback((personaId: string) => run?.responses.find(r => r.personaId === personaId && r.scenarioId === activeScenario && r.model === activeModel), [run, activeScenario, activeModel]);


  const groupChoice = (() => {
    if (stageGroup.startsWith('attr:') && panelAttributes.some(a => a.key === stageGroup.slice(5))) return stageGroup;
    if (stageGroup.startsWith('answer:') && run && runDesign?.questions.some(q => q.id === stageGroup.slice(7) && (q.type === 'single' || q.type === 'likert'))) return stageGroup;
    return 'none';
  })();

  const { figures, groups, legend } = useMemo(() => {
    const finalActivity = (p: Persona): FigureActivity => {
      if (!run) return 'idle';
      const mine = run.responses.filter(r => r.personaId === p.id);
      if (!mine.length) return 'idle';
      if (mine.some(r => r.status === 'outcome_unknown')) return 'flagged';
      if (mine.some(r => r.status === 'failed')) return 'failed';
      return mine.some(r => r.answers.some(a => a.unclear.trim())) ? 'flagged' : 'done';
    };
    const activity = (p: Persona): FigureActivity => {
      // Aggregate call progress has no persona identity. Individual outcomes come only from saved responses.
      if (running) return 'queued';
      return finalActivity(p);
    };
    if (groupChoice.startsWith('answer:') && run && runDesign) {
      const q = runDesign.questions.find(x => x.id === groupChoice.slice(7))!;
      const cats = q.type === 'likert' ? Array.from({ length: Math.max(0, (q.max ?? 5) - (q.min ?? 1) + 1) }, (_, i) => String((q.min ?? 1) + i)) : q.choices.map(c => c.code);
      const label = (code: string) => q.type === 'likert' ? `${code} 分` : answerLabel(q, code);
      const color = new Map(cats.map((c, i) => [c, stageCategoryColor(q.type === 'likert', i, cats.length)]));
      const special = { hidden: '未显示此题', refused: '跳过 / 拒答', failed: '未能完成', unknown: '待对账', absent: '未参加本轮' };
      const keyOf = (p: Persona): string => {
        const resp = responseOf(p.id);
        if (!resp) return 'absent';
        if (resp.status === 'outcome_unknown') return 'unknown';
        if (resp.status === 'failed') return 'failed';
        const a = resp.answers.find(x => x.questionId === q.id);
        if (!a || !a.shown) return 'hidden';
        if (a.refused || a.value === null) return 'refused';
        return String(a.value);
      };
      const figs = personas.map(p => { const k = keyOf(p); const done = activity(p); return { id: p.id, code: p.code, appearance: p.appearance, group: k, halo: done === 'queued' || done === 'thinking' ? null : color.get(k) ?? NEUTRAL_HALO, activity: done }; });
      const order = [...cats.map(c => ({ key: c, label: label(c) })), ...Object.entries(special).map(([key, label]) => ({ key, label }))];
      const present = new Set(figs.map(f => f.group));
      return { figures: figs, groups: order.filter(g => present.has(g.key)), legend: order.filter(g => present.has(g.key)).map(g => ({ label: g.label, color: color.get(g.key) ?? NEUTRAL_HALO })) };
    }
    if (groupChoice.startsWith('attr:')) {
      const attr = panelAttributes.find(a => a.key === groupChoice.slice(5))!;
      return { figures: personas.map(p => ({ id: p.id, code: p.code, appearance: p.appearance, group: p.traits[attr.key] ?? '未设定', halo: null, activity: activity(p) })), groups: attr.levels.map(l => ({ key: l.label, label: l.label })), legend: [] };
    }
    return { figures: personas.map(p => ({ id: p.id, code: p.code, appearance: p.appearance, group: 'all', halo: null, activity: activity(p) })), groups: [{ key: 'all', label: '全部' }], legend: [] };
  }, [groupChoice, run, runDesign, personas, panelAttributes, running, responseOf]);

  const describe = useCallback((id: string): StageTip | null => {
    const p = personas.find(x => x.id === id);
    if (!p) return null;
    const profile = synthesizePersonaProfile(p, panelAttributes, design.title);
    const risk = fidelityRisk(p);
    const resp = responseOf(id);
    const q = groupChoice.startsWith('answer:') ? runDesign?.questions.find(x => x.id === groupChoice.slice(7)) : null;
    const answer = q && resp ? resp.answers.find(a => a.questionId === q.id) : null;
    return {
      title: `${profile.alias} · ${p.code}`,
      meta: panelAttributes.map(a => p.traits[a.key]).filter(Boolean).join(' · '),
      lines: answer
        ? [answer.shown ? (answer.refused ? '跳过了这道题' : `本题选择“${cleanLabText(answerLabel(q!, answer.value))}”`) : '按跳题规则未展示本题', `“${cleanLabText(profile.catchphrase).slice(0, 26)}…”`]
        : [`“${cleanLabText(profile.catchphrase).slice(0, 32)}…”`],
      flag: risk.level === 'elevated' ? `涉及${risk.reasons.join('、')}特征，需结合真人核对` : undefined,
    };
  }, [personas, responseOf, groupChoice, runDesign, panelAttributes, design.title]);

  const editPersona = (id: string, patch: { appearance?: Appearance; background?: string }) => update({ overrides: { ...config.overrides, [id]: { ...config.overrides[id], ...patch } } });

  async function startRun() {
    if (running || blockers.length) return;
    setRunError('');
    const designAtRun = structuredClone(design);
    if (config.engine === 'demo' || !runner) {
      const next = demoRun(designAtRun, panelAttributes, personas, settings);
      setRun(next); setRunDesign(designAtRun);
      if (!reducedMotion) { const start = performance.now(); setClock(start); setReveal({ start, duration: Math.min(3600, 700 + personas.length * 32) }); }
      if (!groupChoice.startsWith('answer:')) {
        // Open on the most telling item: a scale that varies by scenario, else any scale, else a single choice.
        const scale = designAtRun.questions.filter(q => q.type === 'likert');
        const pick = (settings.scenarios.length ? scale.find(q => q.text.includes(SCENARIO_TOKEN)) : undefined) ?? scale[0] ?? designAtRun.questions.find(q => q.type === 'single');
        if (pick) setStageGroup(`answer:${pick.id}`);
      }
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true); setProgress({ done: 0, total: personas.length * Math.max(1, settings.scenarios.length) * Math.max(1, settings.models.length) });
    try {
      const next = await runner.run({ design: designAtRun, attributes: panelAttributes, personas, settings, idempotencyKey: crypto.randomUUID() }, p => setProgress(p), controller.signal);
      setRun(next); setRunDesign(designAtRun); setStep('results');
    } catch (e) {
      if (!controller.signal.aborted) setRunError(cleanLabText(e instanceof Error ? e.message : '本轮预测试未能顺利完成，请稍后核对运行记录。'));
    } finally {
      if (abort.current === controller) abort.current = null;
      setRunning(false); setProgress(null);
    }
  }
  useEffect(() => () => abort.current?.abort(), []);
  // On narrow screens the inspector sits below the stage; bring it into view when a figure is picked.
  useEffect(() => {
    if (!narrow || !selectedId) return;
    const frame = requestAnimationFrame(() => document.getElementById('sx-inspector')?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [narrow, selectedId, reducedMotion]);

  const gotoStep = (next: Step) => { setStep(next); setVisited(v => v.includes(next) ? v : [...v, next]); requestAnimationFrame(() => stepsRef.current?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })); };
  const focusQuestion = (questionId: string) => { if (runDesign?.questions.some(q => q.id === questionId && (q.type === 'single' || q.type === 'likert'))) setStageGroup(`answer:${questionId}`); window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }); };

  const openLiveTheater = () => {
    if (!run || stale) {
      const designAtRun = structuredClone(design);
      const next = demoRun(designAtRun, panelAttributes, personas, settings);
      setRun(next);
      setRunDesign(designAtRun);
    }
    setLiveTheaterOpen(v => !v);
  };

  const liveRunData = useMemo(() => {
    if (!liveTheaterOpen) return null;
    if (run && runDesign && !stale) return { design: runDesign, run };
    const snap = structuredClone(design);
    return { design: snap, run: demoRun(snap, panelAttributes, personas, settings) };
  }, [liveTheaterOpen, run, runDesign, stale, design, panelAttributes, personas, settings]);

  const groupOptions = [
    { value: 'none', label: '全体站位' },
    ...panelAttributes.map(a => ({ value: `attr:${a.key}`, label: `按${a.label}分组` })),
    ...(run && runDesign ? runDesign.questions.filter(q => q.type === 'single' || q.type === 'likert').map(q => ({ value: `answer:${q.id}`, label: `按 ${q.variable} 作答分组` })) : []),
  ];
  const ready: Record<Step, boolean> = { panel: !attributeIssues(config.attributes).length, survey: !questionnaireIssues(design).some(i => i.level === 'blocker'), run: !!run, results: !!run && !stale };
  const doneSteps = Object.fromEntries(STEPS.map(s => [s.id, ready[s.id] && (visited.includes(s.id) || (s.id === 'run' && !!run))])) as Record<Step, boolean>;
  const engineLabel = run ? (run.engine === 'demo' ? '本地快速推演' : `${run.settings.models.length} 路深度推演`) : config.engine === 'demo' ? '本地快速推演' : '在线深度推演';
  const showFlat = flat || !webgl;

  return <section className={styles.lab} aria-labelledby="sx-title" data-self-styled>
      <nav ref={navigationRef} className={styles.stepper} aria-label="问卷预测试流程"><span className={styles.motionMarker} data-motion-marker aria-hidden="true"/>
        {STEPS.map((s, i) => <button type="button" key={s.id} data-motion-id={s.id} aria-current={step === s.id ? 'step' : undefined} data-done={doneSteps[s.id]} disabled={s.id === 'results' && !run} onClick={() => gotoStep(s.id)}>
          <span className={styles.stepIndex}>{doneSteps[s.id] && step !== s.id ? '✓' : `0${i + 1}`}</span><span><strong>{s.label}</strong><small>{s.hint}</small></span>
        </button>)}
      </nav>
    <header ref={theatreRef} className={styles.theatre} data-layout={showFlat || narrow ? 'stacked' : 'overlay'} data-flat={showFlat} data-received={!!reveal}>
      <div className={styles.stage}>
        {showFlat ? <FlatStage figures={figures} groups={groups} personas={personas} attributes={panelAttributes} selectedId={selectedId} onSelect={setSelectedId}/> :
          <PersonaStage figures={figures} groups={groups} selectedId={selectedId} onSelect={setSelectedId} describe={describe} reducedMotion={reducedMotion} onFallback={() => setWebgl(false)} stacked={narrow} label={`三维群像舞台共展示 ${personas.length} 位预测试受访者${groups.length > 1 ? `，分为 ${groups.length} 组` : ''}。可拖动旋转或点击人物查看背景档案，也可切换至平面名册浏览。`}/>}
      </div>
      <div className={styles.theatreTop}>
        <div className={styles.theatreTitle}>
          <span className={styles.eyebrow}>硅基样本 · 问卷预测试</span>
          <h2 id="sx-title">让问题，<em>先被看见</em></h2>
          <p>设定画像与情境，检查表述、选项和跳转。</p>
          <button type="button" className={styles.stageShortcut} onClick={() => gotoStep(step === 'results' ? 'results' : 'panel')}>{step === 'results' ? '查看本轮结果' : '配置画像'} <span aria-hidden="true">↗</span></button>
        </div>
        <span className={styles.simChip}><i aria-hidden="true"/>模拟回答 · 与真实调查分开</span>
      </div>
      <div ref={barRef} className={styles.theatreBar}>
        <label className={styles.stageSelect}><span>舞台分组</span><select aria-label="舞台分组" value={groupChoice} onChange={e => setStageGroup(e.target.value)}>{groupOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className={styles.stageSelect}><span>选中画像</span><select aria-label="选择舞台画像" value={selected?.id ?? ''} onChange={e => setSelectedId(e.target.value || null)}><option value="">查看全体</option>{personas.map(p => <option key={p.id} value={p.id}>{synthesizePersonaProfile(p, panelAttributes).alias} ({p.code}) · {panelAttributes.map(a => p.traits[a.key]).filter(Boolean).join(' · ')}</option>)}</select></label>
        {run && groupChoice.startsWith('answer:') && run.settings.scenarios.length > 1 && <label className={styles.stageSelect}><span>情境</span><select aria-label="切换预测试情境" value={activeScenario} onChange={e => setStageScenario(e.target.value)}>{run.settings.scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
        {run && groupChoice.startsWith('answer:') && run.settings.models.length > 1 && <label className={styles.stageSelect}><span>推演通道</span><select aria-label="切换推演通道" value={activeModel} onChange={e => setStageModel(e.target.value)}>{run.settings.models.map(m => <option key={m} value={m}>{m}</option>)}</select></label>}
        <button type="button" className={styles.viewToggle} aria-pressed={showFlat} disabled={!webgl} onClick={() => setFlat(v => !v)}>{showFlat ? '三维舞台' : '平面名册'}</button>
        <button type="button" className={`${styles.viewToggle} ${styles.atypicaToggle}`} aria-pressed={liveTheaterOpen} onClick={openLiveTheater}>
          {liveTheaterOpen ? '收起实时推演 ×' : '内置实时推演'}
        </button>
        <span className={styles.theatreMeta} role="status" aria-live="polite">{personas.length} 位 · {settings.scenarios.length || 1} 个情境 · {engineLabel}{running ? ` · 正在等待${progress ? ` · 进度 ${progress.done}/${progress.total}` : ''}` : run ? (stale ? ' · 结果已过期' : run.status === 'outcome_unknown' ? ' · 待对账' : ' · 已运行') : ' · 未运行'}</span>
      </div>
      {legend.length > 0 && <ul className={styles.stageLegend} aria-label="光环颜色图例">{legend.map(l => <li key={l.label}><i style={{ background: l.color }}/>{l.label}</li>)}</ul>}
      {run && !running && step !== 'results' && !selected && <button type="button" className={styles.runToast} onClick={() => gotoStep('results')}>
        <span>{stale ? '问卷或画像已修改 · 结果对应旧版本' : `已生成 ${run.responses.filter(r => r.status === 'ok').length} 份模拟回答`}</span><strong>查看结果与检验 →</strong>
      </button>}
      {selected && <PersonaInspector persona={selected} attributes={panelAttributes} run={run} runDesign={runDesign} response={responseOf(selected.id) ?? null} sharedBackground={config.background} onClose={() => setSelectedId(null)} onEdit={patch => editPersona(selected.id, patch)} onReset={() => { const { [selected.id]: _removed, ...rest } = config.overrides; void _removed; update({ overrides: rest }); }}/>}
    </header>

    {liveTheaterOpen && liveRunData && (
      <div ref={theaterMountRef} className={styles.theaterMount}>
        <AtypicaLiveTheater
          design={liveRunData.design}
          attributes={panelAttributes}
          personas={personas}
          settings={settings}
          run={liveRunData.run}
          expectations={config.expectations}
          autoPlay
          embeddedMode
          canCallBrain={Boolean(runner)}
          reportActionLabel="导入本页结果检验"
          onClose={() => setLiveTheaterOpen(false)}
          onSendToAnalysis={onSendToAnalysis}
          onOpenReportAction={() => {
            setLiveTheaterOpen(false);
            gotoStep('results');
          }}
        />
      </div>
    )}

    <div className={styles.workflow} ref={stepsRef}>
      <div className={styles.stepBody}>
        <div hidden={step !== 'panel'}><PanelDesigner config={config} update={update} personas={personas} selectedId={selectedId} onSelect={id => { setSelectedId(id); window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }); }}/></div>
        <div hidden={step !== 'survey'}><SurveySetup config={config} update={update} design={design} studioDesign={studioDesign} studioPending={!!designSnapshot?.pending}/></div>
        <div hidden={step !== 'run'}><RunConsole config={config} update={update} design={design} personas={personas.length} settings={settings} models={runner?.models ?? null} maxCalls={runner?.maxCalls} consentLabel={runner?.consentLabel ?? ''} consent={consent} setConsent={setConsent} blockers={blockers} running={running} progress={progress} error={runError} onRun={() => void startRun()} onCancel={() => { abort.current?.abort(); setRunning(false); setProgress(null); }} hasRun={!!run}/></div>
        <div hidden={step !== 'results'}>{run && runDesign && <ResultsBoard design={runDesign} run={run} stale={stale} expectations={config.expectations} setExpectations={expectations => update({ expectations })} onSendToAnalysis={onSendToAnalysis} onFocusQuestion={focusQuestion}/>}</div>
        <div className={styles.stepNav}>
          {step !== 'panel' && <button type="button" onClick={() => gotoStep(STEPS[STEPS.findIndex(s => s.id === step) - 1].id)}>← 上一步</button>}
          {step !== 'results' && step !== 'run' && <button type="button" className={styles.primary} onClick={() => gotoStep(STEPS[STEPS.findIndex(s => s.id === step) + 1].id)}>前往{STEPS[STEPS.findIndex(s => s.id === step) + 1].label} →</button>}
          {step === 'run' && run && !running && <button type="button" className={styles.primary} onClick={() => gotoStep('results')}>查看结果与检验 →</button>}
        </div>
      </div>
    </div>
    <details className={styles.usageDetails}><summary>用途与适用边界<span>问卷预测试 · 模拟回答隔离 · 方法预演</span></summary>
    <ul className={styles.tiers} aria-label="硅基样本的适用边界">
      <li data-tier="ok"><span>推荐用途</span><strong>预测试</strong><small>检查表述、选项与跳转，估计作答时长，演练分析流程。</small></li>
      <li data-tier="caution"><span>仅供参考</span><strong>模拟难触达人群</strong><small>模拟回答须与真实数据分开，不得填补、扩充或替代真实样本。</small></li>
      <li data-tier="limit"><span>须单独论证</span><strong>方法预演</strong><small>先验设定、情景压力推演等探索性用途需另行说明前提假设与适用局限。</small></li>
    </ul>
    </details>
  </section>;
}

function FlatStage({ figures, groups, personas, attributes, selectedId, onSelect }: { figures: StageFigure[]; groups: ReadonlyArray<{ key: string; label: string }>; personas: Persona[]; attributes: PersonaAttribute[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const byId = new Map(personas.map(p => [p.id, p]));
  const listRef = useKeyedListMotion<HTMLDivElement>({ ids: figures.map(f => f.id), activeId: selectedId });
  return <div ref={listRef} className={styles.flatStage}>
    {groups.map(g => { const members = figures.filter(f => f.group === g.key); return members.length ? <section key={g.key} aria-label={`${g.label}，${members.length} 位`}>
      {groups.length > 1 && <h3>{g.label}<small>{members.length} 位</small></h3>}
      <ul>{members.map(f => { const p = byId.get(f.id)!; const prof = synthesizePersonaProfile(p, attributes); return <li key={f.id} data-motion-id={f.id} data-activity={f.activity}>
        <button type="button" aria-pressed={selectedId === f.id} onClick={() => onSelect(f.id)} style={f.halo ? { boxShadow: `inset 0 -3px 0 ${f.halo}` } : undefined} aria-label={`${prof.alias} (${f.code})${f.activity === 'flagged' ? '，有作答困惑' : ''}`}>
          <PersonaAvatar appearance={p.appearance} size={40}/><span>{prof.alias.split(' · ').pop()}</span>
        </button>
      </li>; })}</ul>
    </section> : null; })}
  </div>;
}

function PersonaInspector({ persona, attributes, run, runDesign, response, sharedBackground, onClose, onEdit, onReset }: {
  persona: Persona; attributes: PersonaAttribute[];
  run: SiliconRun | null; runDesign: Questionnaire | null; response: SiliconRun['responses'][number] | null; sharedBackground: string;
  onClose: () => void; onEdit: (patch: { appearance?: Appearance; background?: string }) => void; onReset: () => void;
}) {
  const [tab, setTab] = useState<'profile' | 'look' | 'answers'>(run ? 'answers' : 'profile');
  const tabsRef = useKeyedListMotion<HTMLDivElement>({ ids: ['profile', 'look', 'answers'], activeId: tab, markerAxis: 'horizontal' });
  const headRef = useContentReveal<HTMLElement>({ token: persona.id });
  const answerRef = useContentReveal<HTMLDivElement>({ token: response && run ? `${run.id}:${persona.id}:${response.scenarioId}:${response.model}` : null, enabled: tab === 'answers' });
  const profile = synthesizePersonaProfile(persona, attributes, run?.questionnaire.title);
  const risk = fidelityRisk(persona);
  const look = persona.appearance;
  const set = (patch: Partial<Appearance>) => onEdit({ appearance: { ...look, ...patch } });
  const answers = new Map<string, SiliconAnswer>();
  const scenario = run?.settings.scenarios.find(s => s.id === response?.scenarioId) ?? NO_SCENARIO;
  return <aside className={styles.inspector} id="sx-inspector" aria-label={`${profile.alias} (${persona.code}) 的设定`}>
    <header ref={headRef}>
      <PersonaAvatar appearance={look} size={56}/>
      <div>
        <strong>{profile.alias} <code className={styles.codePill}>{persona.code}</code></strong>
        <small>{profile.archetype} · {attributes.map(a => persona.traits[a.key]).filter(Boolean).slice(0, 3).join(' · ')}</small>
        {risk.level === 'elevated' && <span className={styles.riskTag} role="status">保真度风险 · {risk.reasons.join('、')}</span>}
      </div>
      <button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭设定面板">×</button>
    </header>
    <div ref={tabsRef} className={styles.miniTabs} role="group" aria-label="设定面板内容"><span className={styles.motionMarker} data-motion-marker aria-hidden="true"/>
      <button type="button" data-motion-id="profile" aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>人设档案</button>
      <button type="button" data-motion-id="look" aria-pressed={tab === 'look'} onClick={() => setTab('look')}>外观</button>
      <button type="button" data-motion-id="answers" aria-pressed={tab === 'answers'} disabled={!run} onClick={() => setTab('answers')}>访谈实录</button>
    </div>
    <div className={styles.inspectorBody} hidden={tab !== 'profile'}>
      <p className={styles.provenanceLine}>{cleanLabText(profile.provenance)}</p>
      <div className={styles.tagPills}>{profile.tags.map(t => <span key={t} className={styles.tagPill}>{cleanLabText(t)}</span>)}</div>
      <blockquote className={styles.personaQuote}>“{cleanLabText(profile.catchphrase)}”</blockquote>
      <div className={styles.personaDossier}>
        {profile.monologue.split('\n\n').map((para, i) => <p key={i}>{cleanLabText(para)}</p>)}
        <small>表达习惯上，{cleanLabText(profile.toneRule)}</small>
      </div>
      <dl className={styles.traits}>{attributes.map(a => <div key={a.key}><dt>{a.label}</dt><dd>{persona.traits[a.key] ?? '未设定'}</dd></div>)}</dl>
      <label className={styles.wideField}><span>个人背景（覆盖共同背景）</span><textarea aria-label="个人背景（覆盖共同背景）" rows={2} maxLength={240} value={persona.background} placeholder={sharedBackground || '可补充个体日常情境，如家住校外、每周取件三次左右。'} onChange={e => onEdit({ background: e.target.value })}/></label>
      <details className={styles.promptPreview}><summary>作答推演使用的受访者背景档案</summary><p>{cleanLabText(describePersona(persona, attributes))}</p><small>人物外观仅用于舞台视觉区分，不参与问卷作答推演。</small></details>
    </div>
    <div className={styles.inspectorBody} hidden={tab !== 'look'}>
      <fieldset className={styles.swatches}><legend>主色</legend>{FIGURE_PALETTE.map((c, i) => <label key={c}><input type="radio" name={`hue-${persona.id}`} aria-label={`主色 ${i + 1}`} checked={look.hue === i} onChange={() => set({ hue: i })}/><i style={{ background: c }}/><span className={styles.srOnly}>颜色 {i + 1}</span></label>)}</fieldset>
      <fieldset className={styles.swatches}><legend>发色</legend>{HAIR_TONES.map((c, i) => <label key={c}><input type="radio" name={`hair-${persona.id}`} aria-label={`发色 ${i + 1}`} checked={look.hair === i} onChange={() => set({ hair: i })}/><i style={{ background: c }}/><span className={styles.srOnly}>发色 {i + 1}</span></label>)}</fieldset>
      <label className={styles.inlineField}><span>帽子</span><select aria-label="选择人物帽子" value={look.hat} onChange={e => set({ hat: e.target.value as HatKind })}>{Object.entries(HAT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className={styles.inlineField}><span>配饰</span><select aria-label="选择人物配饰" value={look.accessory} onChange={e => set({ accessory: e.target.value as AccessoryKind })}>{Object.entries(ACCESSORY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className={styles.inlineField}><span>身高</span><input type="range" aria-label="调整人物身高比例" min={0.86} max={1.14} step={0.01} value={look.height} onChange={e => set({ height: Number(e.target.value) })}/></label>
      <button type="button" className={styles.linkButton} onClick={onReset}>恢复默认外观与背景</button>
    </div>
    {run && runDesign && <div ref={answerRef} className={styles.inspectorBody} hidden={tab !== 'answers'} tabIndex={0} role="region" aria-label={`${profile.alias} 的访谈实录`}>
      {!response ? <p className={styles.hint} role="status">这位受访者未参与当前情境或推演通道的本轮试答。</p> : response.status === 'failed' ? <p className={styles.errorNote} role="alert">本轮试答未能完成（{cleanLabText(response.error || '未返回具体原因')}）。</p> : response.status === 'outcome_unknown' ? <p className={styles.errorNote} role="alert">本轮试答状态待对账（{cleanLabText(response.error || '未返回具体原因')}），为避免重复提交未自动重发。</p> :
        <ol className={styles.chatTranscript}>{runDesign.questions.map(q => {
          const a = response.answers.find(x => x.questionId === q.id);
          const text = cleanLabText(renderQuestionText(runDesign, q, scenario, answers));
          if (a) answers.set(q.id, a);
          if (!a || !a.shown) return null;
          return <li key={q.id} className={styles.chatExchange}>
            <div className={styles.chatHost}><span>证见主持</span><p>{text}</p></div>
            <div className={styles.chatGuest}>
              <span>{profile.alias}</span>
              <div>
                <strong>{a.refused ? '（跳过本题）' : cleanLabText(answerLabel(q, a.value))}</strong>
                {a.unclear && <em>💭 {cleanLabText(a.unclear)}</em>}
              </div>
            </div>
          </li>;
        })}</ol>}
      <p className={styles.small}>{run.engine === 'demo' ? '本记录由本地预测试推演生成，仅供问卷检验，模拟数据与真实调查严格隔离。' : '本记录为虚拟受访样本模拟作答，仅供问卷预测试，与真实调查严格隔离。'}</p>
    </div>}
  </aside>;
}
