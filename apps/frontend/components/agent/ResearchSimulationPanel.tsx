'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { TopicProjectDocument } from '@/lib/topic-project';
import type { DemoBlueprint, DemoPack } from '@/lib/agent/demo-study';
import { hasUserResearchSource, reportSourceKey, type ReportRunSource } from '@/lib/agent/report-run';
import type { Questionnaire } from '@/lib/questionnaire';
import styles from './ResearchWorkspace.module.css';

export type ResearchSimulationHost = {
  source: ReportRunSource;
  apply: (pack: DemoPack, expected: ReportRunSource) => 'applied' | 'conflict' | 'storage_failed';
  openReport: () => void;
  startWriting: (title: string) => void;
};

type Preparation = {
  blueprint: DemoBlueprint;
  design: Questionnaire;
  source: ReportRunSource;
};
type Computed = {
  pack: DemoPack;
  received: number;
  checked: number;
  planned: number;
  audit: { passed: number; total: number };
  omitted: string[];
};

export default function ResearchSimulationPanel({ topic, host, sourceLines, disabled, canSave }: {
  topic: TopicProjectDocument;
  host: ResearchSimulationHost;
  sourceLines: string[];
  disabled: boolean;
  canSave: boolean;
}) {
  const [prepared, setPrepared] = useState<Preparation | null>(null);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [adopted, setAdopted] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const operation = useRef(false);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const occupied = hasUserResearchSource(host.source);
  const changed = prepared && !adopted && reportSourceKey(prepared.source) !== reportSourceKey(host.source);
  const canDraft = adopted && !occupied && host.source.dataset?.sourceHash === computed?.pack.dataset.sourceHash;
  const busy = !!progress;

  async function prepare() {
    if (disabled || operation.current || occupied) return;
    operation.current = true;
    setError('');
    setProgress('正在准备演练问卷…');
    try {
      const source = structuredClone(host.source);
      const { decomposeTopic, buildDemoQuestionnaire } = await import('@/lib/agent/demo-study');
      const { title, geography } = topic.brief;
      const blueprint = { ...decomposeTopic(title), title, region: geography };
      const design = buildDemoQuestionnaire(blueprint);
      if (active.current) { setPrepared({ blueprint, design, source }); setComputed(null); setAdopted(false); }
    } catch {
      if (active.current) setError('无法准备演练问卷，请核对选题后重试。');
    } finally {
      operation.current = false;
      if (active.current) setProgress('');
    }
  }

  async function run() {
    if (!prepared || changed || occupied || disabled || operation.current || computed) return;
    operation.current = true;
    setError('');
    setProgress('正在生成教学模拟数据…');
    try {
      const [{ simulateDemoStudy, computeDemoReport }, { sampleSize }, { benchmarkReport }, { writeAppendix }, { applyReportInsert, sampleSizeInsert }] = await Promise.all([
        import('@/lib/agent/demo-study'), import('@/lib/sampling'), import('@/lib/report-benchmark'), import('@/lib/report-appendices'),
        import('@/lib/report-insert'),
      ]);
      if (!active.current) return;
      const plan = { target: 'proportion', confidence: '0.95', margin: 0.05, proportion: 0.5,
        sd: 0, population: null, designEffect: 1, validRate: 1, subgroups: 1 } as const;
      const sampling = sampleSize(plan);
      const study = await simulateDemoStudy(prepared.blueprint, prepared.design);
      if (!active.current) return;
      setProgress('正在质控、计算统计结果并编排报告…');
      const omitted: string[] = [];
      const { report: draft, dataset } = await computeDemoReport(study, { onLog: line => {
        if (!line.startsWith('ok ')) omitted.push(line);
      } });
      const measured = applyReportInsert(draft, sampleSizeInsert(plan, sampling,
        '教学模拟的样本量测算示例。按简单随机抽样假设、95% 置信水平和 ±5 个百分点计算。模拟数据的行数另行设定。')).content;
      const report = sourceLines.length ? writeAppendix(measured, 'appendix.data', ['选题研读资料定位', ...sourceLines]).content : measured;
      const review = benchmarkReport(report);
      if (active.current) setComputed({
        pack: { ...study, report, dataset }, received: study.dataset.table.rows.length,
        checked: dataset.table.rows.length, planned: sampling.completes, omitted,
        audit: { passed: review.checks.filter(check => check.status === 'pass').length, total: review.checks.length },
      });
    } catch {
      if (active.current) setError('演练没有完成，请重试。当前项目内容已保留。');
    } finally {
      operation.current = false;
      if (active.current) setProgress('');
    }
  }

  function adopt() {
    if (!computed || !prepared || !canSave || occupied || changed || disabled || operation.current || adopted) return;
    const result = host.apply(computed.pack, prepared.source);
    if (result !== 'applied') { setError(result === 'conflict' ? '工作区已有更新，请重新准备演练。' : '未能保存候选稿，请检查浏览器存储。'); return; }
    setAdopted(true);
    setError('');
  }

  return <details className={styles.simulation}>
    <summary>教学模拟全流程</summary>
    <div className={styles.simulationBody} aria-label="教学模拟全流程" aria-busy={busy}>
      <p>用已确认的选题演练。问卷确认后自动运行抽样测算、模拟、质控和统计，候选稿由你决定是否采纳。</p>
      {occupied && !adopted && <p role="status">当前工作区已有研究资料。请切换到空白项目演练。</p>}
      {changed && <p role="status">工作区已变化，请重新准备问卷。</p>}
      {(!prepared || changed) && <button type="button" disabled={disabled || busy || occupied} onClick={() => void prepare()}>准备演练问卷</button>}
      {prepared && !changed && <>
        <p><strong>问卷设计 · {prepared.design.questions.length} 道题</strong>　{prepared.design.title}</p>
        {!!sourceLines.length && <p>{sourceLines.length} 篇已核对原文的定位会随候选稿交接。</p>}
        <details className={styles.simulationQuestions}><summary>查看演练问卷</summary>
          <ol>{prepared.design.questions.map(question => <li key={question.id}>{question.text}
            {!!question.choices.length && <small>{question.choices.map(choice => choice.label).join(' · ')}</small>}
            {question.type === 'likert' && <small>{question.min} {question.minLabel} → {question.max} {question.maxLabel}</small>}
          </li>)}</ol>
        </details>
        {!computed && <button type="button" disabled={disabled || busy || occupied} onClick={() => void run()}>确认演练问卷并运行</button>}
      </>}
      {progress && <p role="status">{progress}</p>}
      {computed && !changed && <section className={styles.simulationResult} aria-label="教学模拟运行回执">
        <ol>
          <li><strong>研究设计 → 抽样测算</strong><span>简单随机抽样示例，95% 置信水平、±5 个百分点，参考值 {computed.planned} 份。模拟数据另行生成。</span></li>
          <li><strong>模拟数据 → 质量检查</strong><span>生成 {computed.received} 份教学模拟作答，规则筛查后保留 {computed.checked} 份。</span></li>
          <li><strong>统计分析 → 报告编排</strong><span>登记 {computed.pack.report.quality?.results.length ?? 0} 项计算结果，图表与附录已进入候选稿。</span></li>
          <li><strong>草稿审查 → 用户确认</strong><span>报告结构检查 {computed.audit.passed}/{computed.audit.total} 项通过，叙述章节待起草。</span></li>
        </ol>
        {!!computed.omitted.length && <details><summary>{computed.omitted.length} 项分析待核对</summary><ul>{computed.omitted.map((line, index) => <li key={index}>{line}</li>)}</ul></details>}
        {!adopted && <><button type="button" disabled={!canSave || disabled || occupied} onClick={adopt}>采纳教学候选稿</button>
          {!canSave && <p>访客可完成演练。登录后可将候选稿存入当前工作区。</p>}</>}
        {adopted && <div className={styles.simulationActions}>
          <button type="button" onClick={host.openReport}>打开报告与导出</button>
          <button type="button" disabled={!canDraft} onClick={() => host.startWriting(host.source.report?.title ?? computed.pack.report.title)}>选择模型并起草整稿</button>
        </div>}
      </section>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  </details>;
}
