'use client';

import { useEffect, useRef, useState } from 'react';
import type { DatasetValue } from '@/lib/canvas/execute';
import type { Questionnaire } from '@/lib/questionnaire';
import {
  fetchAutonomousRuns,
  prepareSandboxSvgForArtifact,
  resumeAutonomousResearch,
  runProjectPlotSandbox,
  sandboxSvgToDataUri,
  sanitizeAdvisorDisplayText,
  serializeDatasetForAutonomousSandbox,
  streamAutonomousResearch,
  type AutonomousDatasetMode,
  type AutonomousLeaseMode,
  type AutonomousRunView,
  type AutonomousStreamEvent,
  type PlotSandboxResult,
} from '@/lib/agent/autonomous-agent';
import styles from './AutonomousAgentTheater.module.css';

export type AutonomousAgentTheaterProps = {
  projectId: string | null;
  projectTitle?: string;
  authenticated?: boolean;
  csrfToken?: string | null;
  design: Questionnaire | null;
  dataset: DatasetValue | null;
  onCommitRun: (run: AutonomousRunView) => Promise<boolean> | boolean;
  onSavePlotArtifact?: (title: string, svg: string) => void;
  onJumpReview?: () => void;
  onJumpPaper?: () => void;
};

const RUN_STATUS_ZH: Record<AutonomousRunView['status'], string> = {
  awaiting_milestone: '待确认',
  completed: '已完成',
  cancelled: '已停止',
  failed: '未完成',
};

const METHOD_LABEL_ZH: Record<string, string> = {
  'quality-control': '样本质量核查',
  numeric: '数值分布概览',
  descriptive: '描述性统计',
  frequency: '频数分布',
  alpha: '信度检验',
  reliability: '信度检验',
  ols: '线性回归分析',
  regression: '回归分析',
  ridge: '稳健回归分析',
  lasso: '变量筛选回归',
  logit: '分类影响建模',
  logistic: '分类影响建模',
  'penalized-logistic': '稳健分类建模',
  subgroup: '人群差异分析',
  heterogeneity: '异质性检验',
  interaction: '交互效应分析',
  ttest: '组间差异检验',
  anova: '方差分析',
  nonparametric: '非参数检验',
  'mann-whitney': '秩和差异检验',
  crosstab: '交叉列联分析',
  'custom-stat': '专项稳健统计',
  groups: '组间差异检验',
  efa: '因子适切性检验',
  mediation: '中介机制分析',
  'cs-did': '多期双重差分',
  conformal: '稳健预测区间',
  kano: 'Kano 需求归类',
  rdd: '断点回归分析',
  psm: '倾向得分匹配',
  topsis: '综合评价排序',
  iv: '工具变量估计',
  ab: '分流实验检验',
  survival: '留存生存分析',
  meta: '跨研究效应合成',
  pearson: '相关矩阵分析',
  spearman: '秩相关分析',
};

function friendlyMethodLabel(method: string): string {
  const key = method.trim().toLowerCase();
  return METHOD_LABEL_ZH[key] ?? '专项统计分析';
}

function cleanUiText(raw: string): string {
  return sanitizeAdvisorDisplayText(raw)
    .replace(/^关键结论更新[：:]\s*/u, '')
    .replace(/[\u300c\u300e]/gu, '“')
    .replace(/[\u300d\u300f]/gu, '”')
    .replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）');
}

function cleanSnapTitle(title: string, method: string): string {
  const cleaned = title.replace(/^\[\d+\]\s*/u, '').trim();
  return cleanUiText(cleaned) || friendlyMethodLabel(method);
}

function friendlyProgressMessage(ev: AutonomousStreamEvent): { label: string; tone: 'neutral' | 'pivot' | 'warn' | 'done'; detail: string } {
  const t = ev.eventType;
  if (t === 'run_started') {
    return { label: '开始分析', tone: 'neutral', detail: '正在读取样本特征与分析关注点…' };
  }
  if (t === 'pivot' || t === 'reanalysis') {
    return { label: '方法优化', tone: 'pivot', detail: '已自动调整分析方法以规避潜在统计偏差。' };
  }
  if (t === 'milestone_pause') {
    return { label: '等待确认', tone: 'warn', detail: '发现关键分析分化，需要你确认后续方向。' };
  }
  if (t === 'steering') {
    return { label: '按要求调整', tone: 'pivot', detail: '正在按你的补充要求重新计算相关指标…' };
  }
  if (t === 'reviewer_critique') {
    return { label: '结论复核', tone: 'neutral', detail: '正在交叉核验各项结论的一致性与适用边界…' };
  }
  if (t === 'completed') {
    return { label: '已完成', tone: 'done', detail: '分析全部完成，已生成核心结论与统计结果。' };
  }
  if (t === 'cancelled') {
    return { label: '已停止', tone: 'warn', detail: '已按要求停止本次分析。' };
  }
  if (t === 'failed') {
    return { label: '未完成', tone: 'warn', detail: '本次分析未能顺利完成，请稍后重试。' };
  }
  return { label: '分析进行中', tone: 'neutral', detail: '正在核查样本质量并检验核心变量关系…' };
}

type PlotChartKind = 'auto' | 'bar' | 'line' | 'forest' | 'dumbbell';

const PLOT_CHART_OPTIONS: Array<{ value: PlotChartKind; label: string }> = [
  { value: 'auto', label: '自动适配' },
  { value: 'bar', label: '柱状对比图' },
  { value: 'line', label: '折线趋势图' },
  { value: 'forest', label: '效应对比图' },
  { value: 'dumbbell', label: '差异对比图' },
];

function formatRunTimestamp(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mi = String(parsed.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  }
  return trimmed.slice(0, 16).replace('T', ' ');
}

function formatRunPillTopic(item: AutonomousRunView): string {
  const rawGoal = (item as Record<string, unknown>).goal;
  const text = sanitizeAdvisorDisplayText(
    (typeof rawGoal === 'string' && rawGoal.trim())
      || item.motherInsight?.headline?.trim()
      || item.datasetSummary?.title?.trim()
      || '',
  );
  if (!text) return '';
  return text.length > 16 ? `${text.slice(0, 16)}…` : text;
}

function isAbortError(err: unknown, controller: AbortController): boolean {
  if (controller.signal.aborted) return true;
  return err instanceof Error && err.name === 'AbortError';
}

export default function AutonomousAgentTheater({
  projectId,
  projectTitle,
  authenticated = false,
  csrfToken = null,
  design,
  dataset,
  onCommitRun,
  onSavePlotArtifact,
  onJumpReview,
  onJumpPaper,
}: AutonomousAgentTheaterProps) {
  const hasWorkspaceDataset = Boolean(dataset && dataset.table.rows.length >= 10);
  const [datasetMode, setDatasetMode] = useState<AutonomousDatasetMode>(
    hasWorkspaceDataset ? 'inline_dataset' : 'planted_trap_benchmark',
  );
  const [leaseMode, setLeaseMode] = useState<AutonomousLeaseMode>('pi_autonomous');
  const [goal, setGoal] = useState(
    () => projectTitle?.trim() || '县域独居与共居老年人智慧助餐及防跌倒守护服务采纳机制调研',
  );
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState<AutonomousRunView | null>(null);
  const [liveEvents, setLiveEvents] = useState<AutonomousStreamEvent[]>([]);
  const [steeringNote, setSteeringNote] = useState('');
  const [committedRunId, setCommittedRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'results' | 'plots'>('summary');
  const [historyState, setHistoryState] = useState<{
    projectId: string;
    runs: AutonomousRunView[];
  } | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [chartKind, setChartKind] = useState<PlotChartKind>('auto');
  const [plotBusy, setPlotBusy] = useState(false);
  const [plotError, setPlotError] = useState('');
  const [plotResult, setPlotResult] = useState<{
    snapshotId: string;
    chartKind: string;
    result: PlotSandboxResult;
  } | null>(null);
  const [plotSavedId, setPlotSavedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const trimmedProjectId = projectId?.trim() ?? '';
  const activeScopeRef = useRef({ authenticated, projectId: trimmedProjectId });
  const manualRunProjectRef = useRef<string | null>(null);
  const plotRequestSeqRef = useRef(0);

  const canLoadProjectRuns = Boolean(authenticated && trimmedProjectId && !/^(?:local|demo)/i.test(trimmedProjectId));
  const historyRuns = canLoadProjectRuns && historyState?.projectId === trimmedProjectId ? historyState.runs : [];

  useEffect(() => {
    activeScopeRef.current = { authenticated, projectId: trimmedProjectId };
  }, [authenticated, trimmedProjectId]);

  async function refreshProjectRuns(targetProjectId: string, isAuthed: boolean, signal?: AbortSignal) {
    const cleanId = targetProjectId.trim();
    if (!isAuthed || !cleanId || /^(?:local|demo)/i.test(cleanId)) {
      return;
    }
    const runs = await fetchAutonomousRuns(cleanId, { signal }).catch(() => null);
    if (
      signal?.aborted
      || !activeScopeRef.current.authenticated
      || activeScopeRef.current.projectId !== cleanId
    ) {
      return;
    }
    if (runs !== null) {
      setHistoryState({ projectId: cleanId, runs });
    }
  }

  useEffect(() => {
    if (!canLoadProjectRuns || !trimmedProjectId) {
      return;
    }
    const controller = new AbortController();
    void fetchAutonomousRuns(trimmedProjectId, { signal: controller.signal })
      .catch(() => null)
      .then(runs => {
        if (
          controller.signal.aborted
          || !activeScopeRef.current.authenticated
          || activeScopeRef.current.projectId !== trimmedProjectId
        ) {
          return;
        }
        if (runs !== null) {
          setHistoryState({ projectId: trimmedProjectId, runs });
          if (manualRunProjectRef.current !== trimmedProjectId) {
            const preferredRun = runs.find(r => r.status === 'awaiting_milestone') ?? runs[0] ?? null;
            if (preferredRun) {
              setRun(prev => (prev && prev.projectId === trimmedProjectId ? prev : preferredRun));
            }
          }
        }
      });
    return () => {
      controller.abort();
    };
  }, [authenticated, canLoadProjectRuns, trimmedProjectId]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  function buildCurrentRequest() {
    const effectiveMode: AutonomousDatasetMode = datasetMode === 'inline_dataset' && !hasWorkspaceDataset
      ? 'planted_trap_benchmark'
      : datasetMode;
    const inline = effectiveMode === 'inline_dataset'
      ? serializeDatasetForAutonomousSandbox(design, dataset)
      : null;
    return {
      goal,
      geography: '县域',
      datasetMode: effectiveMode,
      leaseMode,
      maxToolCalls: 28,
      projectId: trimmedProjectId || 'local-studio',
      inlineDataset: inline,
    };
  }

  function appendStreamEvent(ev: AutonomousStreamEvent) {
    setLiveEvents(prev => (
      prev.some(item => item.seq === ev.seq && item.eventType === ev.eventType)
        ? prev
        : [...prev, ev]
    ));
  }

  function handleAbortInFlight() {
    abortRef.current?.abort();
  }

  async function handleRun() {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    manualRunProjectRef.current = trimmedProjectId || 'local-studio';
    plotRequestSeqRef.current += 1;

    setBusy(true);
    setError('');
    setLiveEvents([]);
    setSteeringNote('');
    setPlotBusy(false);
    setPlotError('');
    setPlotResult(null);
    setPlotSavedId(null);
    try {
      const result = await streamAutonomousResearch(
        buildCurrentRequest(),
        {
          auth: { authenticated, projectId: trimmedProjectId || null, csrfToken },
          signal: controller.signal,
          onEvent: appendStreamEvent,
        },
      );
      setRun(result);
      setCommittedRunId(null);
      setPlotResult(null);
      setPlotSavedId(null);
      setPlotError('');
      setActiveTab('summary');
      if (canLoadProjectRuns && trimmedProjectId) {
        void refreshProjectRuns(trimmedProjectId, authenticated);
      }
    } catch (err) {
      if (isAbortError(err, controller)) {
        setError('已停止本次数据分析。');
      } else {
        setError(err instanceof Error ? cleanUiText(err.message) : '数据分析未能顺利启动，请稍后重试。');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setBusy(false);
    }
  }

  async function handleResume(decision: 'approve' | 'steer' | 'abort') {
    if (busy || !run) return;
    const trimmedNote = steeringNote.trim();
    if (decision === 'steer' && !trimmedNote) {
      setError('请先输入你的补充分析要求再继续。');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    manualRunProjectRef.current = trimmedProjectId || 'local-studio';
    plotRequestSeqRef.current += 1;

    setBusy(true);
    setError('');
    setPlotBusy(false);
    const afterSeq = liveEvents.reduce((max, ev) => Math.max(max, ev.seq), run.eventCount ?? 0);
    try {
      const updated = await resumeAutonomousResearch({
        run,
        decision,
        steeringNote: decision === 'steer' ? trimmedNote : undefined,
        request: buildCurrentRequest(),
        auth: { authenticated, projectId: trimmedProjectId || null, csrfToken },
        signal: controller.signal,
        afterSeq,
        onEvent: appendStreamEvent,
      });
      setRun(updated);
      setCommittedRunId(null);
      setPlotResult(null);
      setPlotSavedId(null);
      setPlotError('');
      if (decision === 'steer') {
        setSteeringNote('');
      }
      if (canLoadProjectRuns && trimmedProjectId) {
        void refreshProjectRuns(trimmedProjectId, authenticated);
      }
    } catch (err) {
      if (isAbortError(err, controller)) {
        setError('已停止本次分析。');
      } else {
        setError(err instanceof Error ? cleanUiText(err.message) : '继续分析时发生异常，请稍后重试。');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setBusy(false);
    }
  }

  function handleSelectHistoryRun(item: AutonomousRunView) {
    if (busy) return;
    plotRequestSeqRef.current += 1;
    setRun(item);
    setCommittedRunId(null);
    setPlotBusy(false);
    setPlotResult(null);
    setPlotSavedId(null);
    setPlotError('');
    setError('');
    setLiveEvents([]);
    setSteeringNote('');
  }

  async function handleRenderPlot() {
    if (!run || !selectedSnap || plotBusy) return;
    if (!canLoadProjectRuns) {
      setPlotError('请先登录并选择云端项目后生成高清配图。');
      return;
    }

    const reqSeq = plotRequestSeqRef.current + 1;
    plotRequestSeqRef.current = reqSeq;
    setPlotBusy(true);
    setPlotError('');
    try {
      let res: PlotSandboxResult;
      try {
        res = await runProjectPlotSandbox(
          trimmedProjectId,
          {
            runId: run.runId,
            snapshotId: selectedSnap.id,
            chartKind,
            autoRepair: true,
          },
          { csrfToken },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        const isNotFound = /404|not[_\s-]?found|未找到/i.test(msg);
        if (!isNotFound) {
          throw err;
        }
        res = await runProjectPlotSandbox(
          trimmedProjectId,
          {
            snapshot: selectedSnap as unknown as Record<string, unknown>,
            chartKind,
            autoRepair: true,
          },
          { csrfToken },
        );
      }
      if (reqSeq !== plotRequestSeqRef.current) return;
      setPlotResult({
        snapshotId: selectedSnap.id,
        chartKind,
        result: res,
      });
      setPlotSavedId(null);
    } catch (err) {
      if (reqSeq !== plotRequestSeqRef.current) return;
      setPlotError(err instanceof Error ? cleanUiText(err.message) : '生成高清配图失败，请稍后重试。');
    } finally {
      if (reqSeq === plotRequestSeqRef.current) {
        setPlotBusy(false);
      }
    }
  }

  function handleDownloadPlotSvg() {
    if (!plotResult) return;
    const blob = new Blob([plotResult.result.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeSnapId = plotResult.snapshotId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'chart';
    link.href = url;
    link.download = `evix-${safeSnapId}-${plotResult.chartKind}.svg`;
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function handleSavePlotArtifact() {
    if (!plotResult || !onSavePlotArtifact || !currentPlotArtifactId) return;
    setPlotError('');
    try {
      const cleanSvg = prepareSandboxSvgForArtifact(plotResult.result.svg);
      onSavePlotArtifact(`${plottedSnapTitle || '统计分析配图'}`, cleanSvg);
      setPlotSavedId(currentPlotArtifactId);
    } catch (err) {
      setPlotError(err instanceof Error ? cleanUiText(err.message) : '该配图格式暂无法收藏至素材架。');
    }
  }

  async function handleCommit() {
    if (!run || committing || run.status !== 'completed') return;
    setCommitting(true);
    setError('');
    try {
      const ok = await onCommitRun(run);
      if (ok) {
        setCommittedRunId(run.runId);
      } else {
        setError('当前报告正在写入中，请稍候片刻重试同步。');
      }
    } catch (err) {
      setError(err instanceof Error ? cleanUiText(err.message) : '同步分析结果到报告时发生异常。');
    } finally {
      setCommitting(false);
    }
  }

  const rawPivots = run?.reasoningTrace.filter(step => step.pivotTaken) ?? [];
  const statisticalPivots = rawPivots.filter(
    step => step.agentRole !== 'reviewer' && step.operator !== 'mutate_epistemic_graph',
  );
  const pivots = statisticalPivots.length > 0 ? statisticalPivots : rawPivots;
  const snapshots = run?.registeredResults ?? [];
  const defaultSnap = snapshots.find(s => s.method !== 'quality-control') ?? snapshots[0] ?? null;
  const selectedSnap = snapshots.find(s => s.id === selectedSnapshotId) ?? defaultSnap;
  const plottedSnapTitle = plotResult
    ? cleanSnapTitle(snapshots.find(s => s.id === plotResult.snapshotId)?.title ?? '统计分析配图', 'descriptive')
    : '统计分析配图';
  const currentPlotArtifactId = plotResult
    ? `${run?.runId ?? 'local'}:${plotResult.snapshotId}:${plotResult.chartKind}:${plotResult.result.svgSha256}`
    : null;
  const isPlotSaved = Boolean(currentPlotArtifactId && plotSavedId === currentPlotArtifactId);

  let plotDataUri = '';
  let plotUriError = '';
  if (plotResult) {
    try {
      plotDataUri = sandboxSvgToDataUri(plotResult.result.svg);
    } catch (err) {
      plotUriError = err instanceof Error ? err.message : '配图预览暂时不可用。';
    }
  }

  const verdictDisplay = !run
    ? ''
    : run.status === 'awaiting_milestone'
      ? '待你确认'
      : run.status === 'cancelled'
        ? '已停止'
        : run.status === 'failed'
          ? '未完成'
          : run.falsificationReport.decision.toLowerCase() === 'approve'
            ? '已通过'
            : '建议复核';

  const calmProgressItems = liveEvents.reduce<Array<{ key: string; label: string; tone: 'neutral' | 'pivot' | 'warn' | 'done'; detail: string }>>(
    (acc, ev) => {
      const item = friendlyProgressMessage(ev);
      const last = acc.at(-1);
      if (last && last.label === item.label && last.detail === item.detail) return acc;
      acc.push({ key: `${ev.seq}-${ev.eventType}`, ...item });
      return acc;
    },
    [],
  );

  return (
    <section className={styles.theater} aria-label="深度数据分析与发现">
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>深度数据分析与发现</h3>
          <p className={styles.sub}>
            自动核查样本质量、规避常见统计误区，并生成可直接用于报告与答辩的核心发现与配图。
          </p>
        </div>
        <span className={styles.leaseBadge}>
          {run ? RUN_STATUS_ZH[run.status] ?? '已完成' : '数据已脱敏保护'}
        </span>
      </header>

      <div className={styles.controls}>
        <label className={styles.field}>
          <span>分析关注点</span>
          <input
            value={goal}
            maxLength={240}
            onChange={e => setGoal(e.target.value)}
            placeholder="输入想重点验证的研究问题或人群差异"
          />
        </label>

        <label className={styles.field}>
          <span>分析数据</span>
          <select
            value={datasetMode}
            onChange={e => setDatasetMode(e.target.value as AutonomousDatasetMode)}
          >
            <option value="planted_trap_benchmark">
              体验示例数据（240 份调研样本）
            </option>
            <option value="inline_dataset" disabled={!hasWorkspaceDataset}>
              {hasWorkspaceDataset
                ? `当前项目数据（${cleanUiText(dataset?.name ?? '已导入数据')} · ${dataset?.table.rows.length} 份样本）`
                : '当前项目数据（需先在分析台导入不少于 10 份样本）'}
            </option>
          </select>
        </label>

        <label className={styles.field}>
          <span>分析方式</span>
          <select
            value={leaseMode}
            onChange={e => setLeaseMode(e.target.value as AutonomousLeaseMode)}
          >
            <option value="pi_autonomous">自动完成全部分析与复核</option>
            <option value="milestone_gated">关键结论前先向我确认</option>
          </select>
        </label>

        <div className={styles.runActionRow}>
          <button
            type="button"
            className={styles.runBtn}
            disabled={busy}
            onClick={() => { void handleRun(); }}
          >
            {busy ? '正在分析数据…' : '开始深度分析'}
          </button>
          {busy && (
            <button
              type="button"
              className={styles.abortBtn}
              onClick={handleAbortInFlight}
            >
              停止分析
            </button>
          )}
        </div>
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {canLoadProjectRuns && historyRuns.length > 0 && (
        <section
          className={styles.historyStrip}
          data-autonomous-history="strip"
          aria-label="历史分析记录"
        >
          <div className={styles.historyHeader}>
            <span className={styles.historyHeading}>
              <span className={styles.historyTitle}>历史分析记录</span>
            </span>
            <span className={styles.historyCount}>
              最近 {Math.min(historyRuns.length, 5)} / {historyRuns.length} 次
            </span>
          </div>
          <div className={styles.historyPills}>
            {historyRuns.slice(0, 5).map(item => {
              const timeText = formatRunTimestamp(item.createdAt);
              const topicText = formatRunPillTopic(item);
              const statusLabel = RUN_STATUS_ZH[item.status] ?? '已完成';
              const summaryDetail = [timeText, topicText].filter(Boolean).join(' · ');
              return (
                <button
                  key={item.runId}
                  type="button"
                  className={styles.historyPill}
                  aria-pressed={run?.runId === item.runId}
                  disabled={busy}
                  title={sanitizeAdvisorDisplayText(item.motherInsight?.headline || item.datasetSummary?.title || '') || '查看此次分析结果'}
                  onClick={() => handleSelectHistoryRun(item)}
                >
                  <span className={styles.historyStatusTag} data-status={item.status}>
                    {statusLabel}
                  </span>
                  <span className={styles.historyMeta}>
                    {item.registeredResults.length} 项结果
                  </span>
                  {summaryDetail && (
                    <span className={styles.historyTime}>{summaryDetail}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {busy && (
        <section className={styles.streamFeed} aria-label="分析进度">
          <div className={styles.streamHeader}>
            <span className={styles.streamTitle}>正在深入分析您的问卷数据…</span>
          </div>
          {calmProgressItems.length === 0 ? (
            <p className={styles.streamEmpty}>正在准备分析环境，马上汇报初步结果…</p>
          ) : (
            <ol className={styles.streamList}>
              {calmProgressItems.map(item => (
                <li
                  key={item.key}
                  className={styles.streamItem}
                  data-tone={item.tone}
                >
                  <span className={styles.streamBadge}>{item.label}</span>
                  <span className={styles.streamDetail}>{item.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {run?.status === 'awaiting_milestone' && run.pendingMilestone && (
        <section
          className={styles.milestoneGate}
          data-milestone-gate="open"
          aria-label="分析方向确认"
        >
          <div className={styles.gateHeader}>
            <div>
              <h4 className={styles.gateTitle}>需要你确认后续分析方向</h4>
            </div>
            <span className={styles.gateBadge}>待你确认</span>
          </div>

          <p className={styles.gateReason}>
            <strong>当前识别情况</strong> · {cleanUiText(run.pendingMilestone.reason)}
          </p>

          <p className={styles.gateProposal}>
            <strong>推荐处理方案</strong> · {cleanUiText(run.pendingMilestone.proposedAction)}
          </p>

          <div className={styles.gateControls}>
            <input
              type="text"
              className={styles.gateInput}
              value={steeringNote}
              maxLength={500}
              disabled={busy}
              onChange={e => setSteeringNote(e.target.value)}
              placeholder="若有额外分析要求，可填写在这里（例如保留年龄分组作为控制变量）"
              aria-label="补充分析要求"
            />
            <div className={styles.gateButtons}>
              <button
                type="button"
                className={styles.gateApproveBtn}
                disabled={busy}
                onClick={() => { void handleResume('approve'); }}
              >
                按推荐方案继续
              </button>
              <button
                type="button"
                className={styles.gateSteerBtn}
                disabled={busy}
                onClick={() => { void handleResume('steer'); }}
              >
                按我的要求继续
              </button>
              <button
                type="button"
                className={styles.gateAbortBtn}
                disabled={busy}
                onClick={() => { void handleResume('abort'); }}
              >
                停止分析
              </button>
            </div>
          </div>
        </section>
      )}

      {run && (
        <>
          <div className={styles.kpiStrip}>
            <div className={styles.kpiCard}>
              <small>有效分析样本</small>
              <strong>{run.datasetSummary.cleanedRowCount} / {run.datasetSummary.rawRowCount}</strong>
            </div>
            <div className={styles.kpiCard}>
              <small>规避统计风险</small>
              <strong>{pivots.length} 项</strong>
            </div>
            <div className={styles.kpiCard}>
              <small>产出统计结果</small>
              <strong>{run.registeredResults.length} 项</strong>
            </div>
            <div className={styles.kpiCard}>
              <small>复核结论</small>
              <strong className={styles.statusValue} data-state={run.status}>{verdictDisplay}</strong>
            </div>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="分析结果视图切换">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'summary'}
              className={styles.tabBtn}
              onClick={() => setActiveTab('summary')}
            >
              核心发现与风险提醒
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'results'}
              className={styles.tabBtn}
              onClick={() => setActiveTab('results')}
            >
              统计结果清单 ({run.registeredResults.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'plots'}
              className={styles.tabBtn}
              onClick={() => setActiveTab('plots')}
            >
              配图生成与收藏 ({run.registeredResults.length})
            </button>
          </div>

          {activeTab === 'summary' && (
            <div className={styles.insightBox} aria-label="核心发现与风险提醒">
              <h4>{cleanUiText(run.motherInsight.headline) || '核心研究发现已就绪'}</h4>
              {run.motherInsight.paradoxDetail && (
                <p><strong>关键差异与机制</strong> · {cleanUiText(run.motherInsight.paradoxDetail)}</p>
              )}
              {run.motherInsight.scopeBoundary && (
                <p><strong>结论适用边界</strong> · {cleanUiText(run.motherInsight.scopeBoundary)}</p>
              )}

              {pivots.length > 0 && (
                <div className={styles.advisorBlock}>
                  <h5>分析过程中自动规避的统计隐患</h5>
                  <ul className={styles.advisorList}>
                    {pivots.map((step, idx) => (
                      <li key={`${step.phase}-${step.iteration}-${idx}`}>
                        {cleanUiText(step.pivotTaken)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.advisorBlock}>
                <h5>结论复核与答辩提醒</h5>
                <p>{cleanUiText(run.falsificationReport.summary)}</p>
                {run.falsificationReport.consistencyChecks.length > 0 && (
                  <ul className={styles.advisorList}>
                    {run.falsificationReport.consistencyChecks.map((chk, ci) => (
                      <li key={ci}>
                        <strong>{cleanUiText(chk.check)}</strong> · {cleanUiText(chk.details)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'results' && (
            <div className={styles.resultList} aria-label="统计结果清单">
              {snapshots.length === 0 ? (
                <div className={styles.sandboxPlotEmpty}>本次分析暂未生成可用的统计结果表。</div>
              ) : (
                snapshots.map((snap, idx) => {
                  const title = cleanSnapTitle(snap.title, snap.method);
                  const methodLabel = friendlyMethodLabel(snap.method);
                  const previewRows = snap.rows.slice(0, 6);
                  return (
                    <article key={`${snap.id}-${idx}`} className={styles.resultCard}>
                      <div className={styles.resultHead}>
                        <strong className={styles.resultTitle}>
                          {idx + 1}. {title}
                        </strong>
                        <div className={styles.resultMeta}>
                          <span className={styles.resultMethodBadge}>{methodLabel}</span>
                          <span className={styles.sandboxPlotBadge}>有效样本 n={snap.n}</span>
                        </div>
                      </div>

                      {snap.metrics.length > 0 && (
                        <div className={styles.sandboxPlotBadges}>
                          {snap.metrics.slice(0, 4).map((m, mi) => (
                            <span key={`${m.label}-${mi}`} className={styles.sandboxPlotBadge}>
                              {cleanUiText(m.label)} {m.value === null ? '—' : m.value}
                            </span>
                          ))}
                        </div>
                      )}

                      {snap.headers.length > 0 && previewRows.length > 0 && (
                        <div className={styles.statTableWrap}>
                          <table className={styles.statTable}>
                            <thead>
                              <tr>
                                {snap.headers.map((h, hi) => (
                                  <th key={`${h}-${hi}`}>{cleanUiText(h)}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((row, ri) => (
                                <tr key={ri}>
                                  {row.map((cell, ci) => (
                                    <td key={ci}>
                                      {cell === null || cell === undefined
                                        ? '—'
                                        : typeof cell === 'string'
                                          ? cleanUiText(cell)
                                          : String(cell)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'plots' && (
            <div
              className={styles.sandboxPlotPanel}
              data-sandbox-plot="panel"
              aria-label="配图生成与收藏"
            >
              <div className={styles.sandboxPlotToolbar}>
                <label className={styles.sandboxPlotField}>
                  <span>选择配图结果</span>
                  <select
                    value={selectedSnap?.id ?? ''}
                    disabled={plotBusy || snapshots.length === 0}
                    onChange={e => setSelectedSnapshotId(e.target.value)}
                  >
                    {snapshots.length === 0 ? (
                      <option value="">暂无可用分析结果</option>
                    ) : (
                      snapshots.map((snap, snapIdx) => (
                        <option key={`${snap.id}-${snapIdx}`} value={snap.id}>
                          {cleanSnapTitle(snap.title, snap.method)}（{friendlyMethodLabel(snap.method)} · n={snap.n}）
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className={styles.sandboxPlotField}>
                  <span>图表样式</span>
                  <select
                    value={chartKind}
                    disabled={plotBusy}
                    onChange={e => setChartKind(e.target.value as PlotChartKind)}
                  >
                    {PLOT_CHART_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className={styles.sandboxPlotBtn}
                  disabled={plotBusy || !selectedSnap}
                  onClick={() => { void handleRenderPlot(); }}
                >
                  {plotBusy ? '正在生成配图…' : '生成高清配图'}
                </button>
              </div>

              {plotError && <p role="alert" className={styles.error}>{plotError}</p>}

              {plotResult ? (
                <>
                  {plotDataUri ? (
                    <div className={styles.sandboxPlotFrame}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- SVG data URI preview */}
                      <img
                        src={plotDataUri}
                        alt={`${plottedSnapTitle} 统计配图`}
                        className={styles.sandboxPlotImg}
                      />
                    </div>
                  ) : (
                    plotUriError && <p role="alert" className={styles.error}>{plotUriError}</p>
                  )}

                  <div className={styles.sandboxPlotMeta}>
                    <div className={styles.sandboxPlotBadges}>
                      <span className={styles.sandboxPlotBadge} data-pass="true">
                        可插入报告的高清矢量配图
                      </span>
                    </div>

                    <div className={styles.sandboxPlotActions}>
                      {onSavePlotArtifact && (
                        <button
                          type="button"
                          data-sandbox-plot="save-artifact"
                          data-saved={isPlotSaved ? 'true' : undefined}
                          className={styles.sandboxPlotSaveBtn}
                          disabled={isPlotSaved}
                          onClick={handleSavePlotArtifact}
                        >
                          {isPlotSaved ? '已收藏至素材架' : '收藏至素材架'}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.sandboxPlotDownloadBtn}
                        onClick={handleDownloadPlotSvg}
                      >
                        下载矢量图
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.sandboxPlotEmpty}>
                  选择一项分析结果和图表样式后，点击“生成高清配图”即可预览并收藏至右侧素材架。
                </div>
              )}
            </div>
          )}

          <footer className={styles.footerActions}>
            <button
              type="button"
              className={styles.commitBtn}
              disabled={committing || committedRunId === run.runId || run.status !== 'completed'}
              onClick={() => { void handleCommit(); }}
            >
              {committedRunId === run.runId
                ? '已同步到报告'
                : committing
                  ? '正在写入报告…'
                  : run.status === 'awaiting_milestone'
                    ? '请先确认上方分析方向'
                    : run.status === 'cancelled'
                      ? '本次分析已停止'
                      : run.status === 'failed'
                        ? '分析未完成，请重新尝试'
                        : '将结论与结果同步到报告'}
            </button>
            {committedRunId === run.runId && (
              <>
                <span className={styles.committedNote}>
                  已将 {run.registeredResults.length} 项分析结果与核心结论写入报告。
                </span>
                {onJumpReview && (
                  <button type="button" className={styles.secondaryBtn} onClick={onJumpReview}>
                    查看审查意见 ↗
                  </button>
                )}
                {onJumpPaper && (
                  <button type="button" className={styles.secondaryBtn} onClick={onJumpPaper}>
                    进入成文视图 ↗
                  </button>
                )}
              </>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
