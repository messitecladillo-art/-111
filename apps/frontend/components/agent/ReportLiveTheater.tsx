'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FullReportGenerationResult } from '@/lib/agent/full-report-pipeline';
import type { ReportWorkState } from '@/lib/agent/report-work';
import type { EditorContent, ReportSection } from '@/lib/editor-model';
import { referenceNumbers } from '@/lib/references';
import { blockLabel, reportLabels } from '@/lib/report-numbering';
import { resultFor, type ResultSnapshot } from '@/lib/research-quality';
import { Figure, ResultTable } from '@/components/editors/PaperBlocks';
import type { LiveReviewState, LiveTypingState } from '@/components/editors/ReportPaper';
import styles from './ReportLiveTheater.module.css';

export type RobotRole = 'writer' | 'chart' | 'xref' | 'reviewer';

export type ForgePodState = {
  kind: 'chart' | 'table' | 'formula';
  label: string;
  caption: string;
  phase: 'pop' | 'fly';
  result?: ResultSnapshot;
  valueColumn?: number;
  accent?: string;
};

export type SynapseBeam = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DirectoryEntry = {
  key: string;
  kind: 'figure' | 'table' | 'formula' | 'ref';
  tag: string;
  title: string;
  targetAttr: 'xref' | 'cite';
  targetId: string;
  sectionId: string;
};

const ROLE_META: Record<RobotRole, { badge: string; title: string }> = {
  writer: { badge: '撰写', title: '正在输入正文' },
  chart: { badge: '图表', title: '展示已登记图表' },
  xref: { badge: '引用', title: '正在关联交叉引用' },
  reviewer: { badge: '审阅', title: '展示本轮实际修订' },
};

export function buildReportDirectory(content: EditorContent): DirectoryEntry[] {
  const labels = reportLabels(content.report);
  const cited = referenceNumbers(content);
  const entries: DirectoryEntry[] = [];

  for (const s of content.report) {
    for (const b of s.blocks ?? []) {
      const labelInfo = blockLabel(labels, s.id, b.id);
      if (!labelInfo) continue;
      if (b.kind === 'chart' || b.kind === 'table' || b.kind === 'formula') {
        entries.push({
          key: `xref:${b.id}`,
          kind: b.kind === 'chart' ? 'figure' : b.kind === 'table' ? 'table' : 'formula',
          tag: labelInfo.label,
          title: b.text || s.title,
          targetAttr: 'xref',
          targetId: b.id,
          sectionId: s.id,
        });
      }
    }
  }

  for (const refEntry of cited.order) {
    const num = cited.numbers.get(refEntry.id);
    if (!num) continue;
    const numStr = String(num);
    entries.push({
      key: `cite:${numStr}`,
      kind: 'ref',
      tag: `[${numStr}]`,
      title: `${refEntry.authors || ''} (${refEntry.year || '年份待核对'}) ${refEntry.title || ''}`.trim(),
      targetAttr: 'cite',
      targetId: numStr,
      sectionId: content.report.find(sec => /文献|附录/u.test(sec.title))?.id ?? content.report[content.report.length - 1]?.id ?? '',
    });
  }

  return entries;
}

/**
 * Subtle, refined visual overlay inside `.paperStage`:
 * 1. Dual intertwined Bezier lines (`beamPrimary` + `beamSecondary`) + dual-end pulsing rings connecting
 *    the paper's 图目录/表目录, inline citation words, and figures/references.
 * 2. Minimalist editorial pointer (`robotCursor`) tracking `[data-typing-caret="true"]`.
 * 3. Real built-in SVG chart / three-line table preview card (`forgePod`) popping out and flying into the paper.
 */
export function ReportLiveTheater({
  paperRef,
  robotRole,
  robotStatusText,
  robotVisible,
  forgePod,
  beams,
}: {
  paperRef: RefObject<HTMLDivElement | null>;
  robotRole: RobotRole;
  robotStatusText: string;
  robotVisible: boolean;
  forgePod: ForgePodState | null;
  beams: SynapseBeam[];
}) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 320, h: 1600 });

  useEffect(() => {
    const container = paperRef.current;
    if (!container) return;

    let rafId = 0;
    const updatePosition = () => {
      const caret = container.querySelector<HTMLElement>('[data-typing-caret="true"]');
      const cRect = container.getBoundingClientRect();
      // The overlay covers the visible width only: sized from scrollWidth it counted its own width and never shrank,
      // which left the paper stage scrolling sideways.
      setStageSize({
        w: Math.max(container.clientWidth, 1),
        h: Math.max(container.scrollHeight, cRect.height, 1000),
      });
      if (caret && robotVisible) {
        const rect = caret.getBoundingClientRect();
        const x = rect.left - cRect.left + container.scrollLeft + 4;
        const y = rect.top - cRect.top + container.scrollTop + rect.height * 0.65;
        setCursorPos({ x, y });
      } else if (!robotVisible) {
        setCursorPos(null);
      }
      if (robotVisible) {
        rafId = requestAnimationFrame(updatePosition);
      }
    };

    updatePosition();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [paperRef, robotVisible, robotRole, robotStatusText]);

  const roleInfo = ROLE_META[robotRole];

  return (
    <div
      className={styles.theaterOverlay}
      style={{ width: `${stageSize.w}px`, height: `${stageSize.h}px` }}
      aria-hidden="true"
    >
      {beams.length > 0 && (
        <svg
          className={styles.synapseSvg}
          width={stageSize.w}
          height={stageSize.h}
          viewBox={`0 0 ${stageSize.w} ${stageSize.h}`}
        >
          <defs>
            <linearGradient id="evix-synapse-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0d9488" />
              <stop offset="50%" stopColor="#14b8a6" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id="evix-synapse-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="50%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#0f766e" />
            </linearGradient>
          </defs>
          {beams.map(b => {
            const dx = b.x2 - b.x1;
            const dy = b.y2 - b.y1;
            const bend = Math.min(130, Math.max(42, Math.hypot(dx, dy) * 0.22));
            const pathPrimary = `M ${b.x1} ${b.y1} C ${b.x1 + dx * 0.28 + bend} ${b.y1 + dy * 0.18 - bend * 0.45}, ${b.x1 + dx * 0.72 + bend} ${b.y1 + dy * 0.82 - bend * 0.25}, ${b.x2} ${b.y2}`;
            const pathSecondary = `M ${b.x1} ${b.y1} C ${b.x1 + dx * 0.28 - bend} ${b.y1 + dy * 0.25 + bend * 0.45}, ${b.x1 + dx * 0.72 - bend} ${b.y1 + dy * 0.75 + bend * 0.25}, ${b.x2} ${b.y2}`;
            return (
              <g key={b.id}>
                <path d={pathPrimary} className={styles.beamPrimary} stroke="url(#evix-synapse-grad-1)" />
                <path d={pathSecondary} className={styles.beamSecondary} stroke="url(#evix-synapse-grad-2)" />
                <circle cx={b.x1} cy={b.y1} r={5.5} className={styles.nodeCore} />
                <circle cx={b.x1} cy={b.y1} r={9.5} className={styles.nodeRing} />
                <circle cx={b.x2} cy={b.y2} r={5.5} className={styles.nodeCore} />
                <circle cx={b.x2} cy={b.y2} r={9.5} className={styles.nodeRing} />
              </g>
            );
          })}
        </svg>
      )}

      {robotVisible && cursorPos && (
        <div
          className={styles.robotCursor}
          style={{ transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)` }}
        >
          <div className={styles.cursorHalo} />
          <svg className={styles.cursorPointer} viewBox="0 0 24 24" fill="none">
            <path
              d="M4 3L11.2 19.6L13.9 13L20.5 10.3L4 3Z"
              fill="#0f766e"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <div
            className={styles.cursorPill}
            data-role={robotRole === 'reviewer' ? 'reviewer' : robotRole === 'xref' ? 'xref' : undefined}
          >
            <span className={styles.cursorDot} />
            <b>{roleInfo.badge}</b>
            <span>{robotStatusText || roleInfo.title}</span>
          </div>
        </div>
      )}

      {forgePod && (
        <div className={styles.forgePod} data-phase={forgePod.phase}>
          <div className={styles.forgePodHead}>
            <span>{forgePod.label}</span>
            <span>{forgePod.caption}</span>
          </div>
          <div className={styles.forgePodPreview}>
            {forgePod.result && forgePod.kind === 'chart' ? (
              <Figure
                result={forgePod.result}
                column={forgePod.valueColumn ?? 1}
                accent={forgePod.accent ?? '#0F766E'}
              />
            ) : forgePod.result && forgePod.kind === 'table' ? (
              <ResultTable result={forgePod.result} />
            ) : (
              <p className={styles.forgePodNote}>查看报告内已有公式或图表</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function useLiveReportChoreography(
  paperRef: RefObject<HTMLDivElement | null>,
  paperContent: EditorContent,
  onFocusSection?: (sectionId: string) => void,
) {
  const [typingState, setTypingState] = useState<LiveTypingState | null>(null);
  const [reviewState, setReviewState] = useState<LiveReviewState | null>(null);
  const [robotRole, setRobotRole] = useState<RobotRole>('writer');
  const [robotStatusText, setRobotStatusText] = useState('');
  const [robotVisible, setRobotVisible] = useState(false);
  const [workState, setWorkState] = useState<ReportWorkState | null>(null);
  const [forgePod, setForgePod] = useState<ForgePodState | null>(null);
  const [beams, setBeams] = useState<SynapseBeam[]>([]);
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(null);
  const timerIds = useRef(new Set<number>());
  const reducedMotion = useRef(false);
  const incomingQueueRef = useRef<{ section: ReportSection; snapshot: EditorContent }[]>([]);
  const incomingBusyRef = useRef(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = query.matches; };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const clearAllTimers = useCallback(() => {
    timerIds.current.forEach(id => window.clearTimeout(id)); timerIds.current.clear();
  }, []);
  const schedule = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(() => { timerIds.current.delete(id); fn(); }, delay);
    timerIds.current.add(id); return id;
  }, []);
  const clearActiveDomHighlights = useCallback(() => {
    paperRef.current?.querySelectorAll('[data-xref-active], [data-fly-in]').forEach(element => {
      element.removeAttribute('data-xref-active'); element.removeAttribute('data-fly-in');
    });
  }, [paperRef]);
  const stop = useCallback(() => {
    incomingQueueRef.current = []; incomingBusyRef.current = false;
    clearAllTimers(); clearActiveDomHighlights(); setTypingState(null); setReviewState(null);
    setRobotVisible(false); setWorkState(null); setForgePod(null); setBeams([]); setActiveTargetKey(null);
  }, [clearAllTimers, clearActiveDomHighlights]);

  const triggerXrefSynapse = useCallback((attr: 'xref' | 'cite', targetId: string, scroll = false) => {
    const container = paperRef.current;
    if (!container) return;
    clearActiveDomHighlights();
    const escaped = CSS.escape(targetId), key = `${attr}:${targetId}`;
    const sources = Array.from(container.querySelectorAll<HTMLElement>(`[data-${attr}-source="${escaped}"]`));
    const target = container.querySelector<HTMLElement>(`[data-${attr}-target="${escaped}"]`);
    const directory = container.querySelector<HTMLElement>(`[data-directory-node="${CSS.escape(key)}"]`);
    sources.forEach(element => element.setAttribute('data-xref-active', 'true'));
    target?.setAttribute('data-xref-active', 'true'); setActiveTargetKey(key);
    if (scroll) (sources[0] ?? target)?.scrollIntoView({ behavior: reducedMotion.current ? 'auto' : 'smooth', block: 'center' });
    if (!reducedMotion.current) schedule(() => {
      const rect = container.getBoundingClientRect();
      const center = (element: HTMLElement) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.left - rect.left + container.scrollLeft + bounds.width / 2, y: bounds.top - rect.top + container.scrollTop + bounds.height / 2 };
      };
      const source = sources[0] ?? directory;
      if (!source || !target) return;
      const from = center(source), to = center(target);
      setBeams([{ id: key, x1: from.x, y1: from.y, x2: to.x, y2: to.y }]);
    }, scroll ? 220 : 16);
    schedule(() => { setBeams(current => current.some(beam => beam.id === key) ? [] : current); setActiveTargetKey(current => current === key ? null : current); clearActiveDomHighlights(); }, 2200);
  }, [paperRef, clearActiveDomHighlights, schedule]);

  useEffect(() => {
    const container = paperRef.current;
    if (!container) return;
    const focus = (event: Event) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-xref-source], [data-cite-source]');
      if (!element) return;
      const attr = element.hasAttribute('data-xref-source') ? 'xref' : 'cite';
      const id = element.getAttribute(`data-${attr}-source`);
      if (id) triggerXrefSynapse(attr, id, event.type === 'click');
    };
    container.addEventListener('mouseover', focus); container.addEventListener('focusin', focus); container.addEventListener('click', focus);
    return () => { container.removeEventListener('mouseover', focus); container.removeEventListener('focusin', focus); container.removeEventListener('click', focus); };
  }, [paperRef, triggerXrefSynapse]);

  const buildTypewriterPlan = (body: string, maxBudgetMs = 1550) => {
    const frames: { endIndex: number; delayMs: number; lineRatio: number; strikeTick: number; returning: boolean }[] = [];
    const total = body.length;
    if (!total) return frames;
    const targetFrames = Math.min(32, Math.max(10, Math.ceil(total / 2)));
    const avgChunk = Math.max(1, Math.ceil(total / targetFrames));
    let pos = 0;
    let elapsed = 0;
    let strikeTick = 0;
    let lineWidth = 0;
    while (pos < total) {
      const step = pos < 22 ? 1 : avgChunk;
      let next = Math.min(total, pos + step);
      const nl = body.indexOf('\n', pos);
      if (nl >= pos && nl < next) next = nl + 1;
      const slice = body.slice(pos, next);
      const hasNewline = slice.endsWith('\n');
      const lastChar = slice.trimEnd().slice(-1);
      for (const ch of slice) {
        if (ch === '\n') lineWidth = 0;
        else lineWidth = (lineWidth + (/[\u2e80-\uffff]/u.test(ch) ? 2 : 1)) % 42 || 42;
      }
      const lineRatio = hasNewline ? 0.04 : Math.max(0.06, Math.min(0.98, lineWidth / 42));
      const cadence = 42 + ((strikeTick * 13) % 15);
      const punctPause = hasNewline ? 130 : /[。！？；.!?;]/u.test(lastChar) ? 85 : /[，、：,]/u.test(lastChar) ? 40 : 0;
      elapsed += cadence + punctPause;
      strikeTick += 1;
      frames.push({ endIndex: next, delayMs: elapsed, lineRatio, strikeTick, returning: hasNewline });
      pos = next;
    }
    const totalDelay = frames.at(-1)?.delayMs ?? 0;
    if (totalDelay > maxBudgetMs && maxBudgetMs > 0) {
      const scale = maxBudgetMs / totalDelay;
      for (const f of frames) f.delayMs = Math.max(22, Math.round(f.delayMs * scale));
    }
    return frames;
  };

  const streamSectionIntoStage = useCallback((
    section: ReportSection,
    snapshot: EditorContent,
    onComplete?: () => void,
  ) => {
    const body = (section.body || '').trim();
    if (!body || reducedMotion.current) { onComplete?.(); return; }
    setRobotVisible(true);
    setRobotRole('writer');
    setRobotStatusText(section.title);
    const plan = buildTypewriterPlan(body);
    for (const frame of plan) {
      schedule(() => {
        setTypingState({
          sectionId: section.id,
          visibleBody: body.slice(0, frame.endIndex),
          lineRatio: frame.lineRatio,
          strikeTick: frame.strikeTick,
          returning: frame.returning,
        });
      }, frame.delayMs);
    }
    const finishMs = (plan.at(-1)?.delayMs ?? 360) + 90;
    schedule(() => {
      setTypingState(null);
      const exhibit = section.blocks?.find(block => block.kind === 'chart' || block.kind === 'table');
      if (!exhibit || (exhibit.kind !== 'chart' && exhibit.kind !== 'table')) {
        setRobotVisible(false);
        onComplete?.();
        return;
      }
      const result = resultFor(snapshot.quality, exhibit.evidenceId);
      if (!result) {
        setRobotVisible(false);
        onComplete?.();
        return;
      }
      const label = blockLabel(reportLabels(snapshot.report), section.id, exhibit.id)?.label ?? '已登记图表';
      setRobotRole('chart');
      setRobotStatusText(label);
      setForgePod({ kind: exhibit.kind, label, caption: exhibit.text || result.title, phase: 'pop', result, valueColumn: exhibit.kind === 'chart' ? exhibit.valueColumn : 1 });
      schedule(() => setForgePod(previous => previous ? { ...previous, phase: 'fly' } : null), 560);
      schedule(() => {
        setForgePod(null);
        setRobotVisible(false);
        triggerXrefSynapse('xref', exhibit.id);
        onComplete?.();
      }, 940);
    }, finishMs);
  }, [schedule, triggerXrefSynapse]);

  const animateIncomingSection = useCallback((section: ReportSection, snapshot: EditorContent) => {
    if (incomingBusyRef.current) {
      if (incomingQueueRef.current.length >= 3) {
        incomingQueueRef.current.shift();
      }
      incomingQueueRef.current.push({ section, snapshot });
      return;
    }
    const pump = (sec: ReportSection, snap: EditorContent) => {
      incomingBusyRef.current = true;
      streamSectionIntoStage(sec, snap, () => {
        const next = incomingQueueRef.current.shift();
        if (next) {
          pump(next.section, next.snapshot);
        } else {
          incomingBusyRef.current = false;
        }
      });
    };
    pump(section, snapshot);
  }, [streamSectionIntoStage]);

  const runReviewAndFormatChoreography = useCallback((snapshot: EditorContent, revisions: FullReportGenerationResult['revisions'] = [], onFinish?: () => void) => {
    stop();
    const revision = revisions.find(item => item.before !== item.after && snapshot.report.some(section => section.id === item.sectionId));
    if (!revision || reducedMotion.current) { onFinish?.(); return; }
    onFocusSection?.(revision.sectionId); setRobotVisible(true); setRobotRole('reviewer'); setRobotStatusText('本轮实际修订');
    setWorkState({ phase: 'reviewing', completed: 1, total: 1, detail: `审校修订：${revision.reason}` });
    const review = { sectionId: revision.sectionId, badPhrase: revision.before, goodPhrase: revision.after, reason: revision.reason };
    setReviewState({ ...review, step: 'flag', typedGood: '' });
    for (let step = 1; step <= 14; step++) schedule(() => setReviewState({ ...review, step: step === 14 ? 'done' : 'rewrite', typedGood: revision.after.slice(0, Math.ceil(revision.after.length * step / 14)) }), 480 + step * 48);
    schedule(() => { setReviewState(null); setRobotVisible(false); setWorkState(null); onFinish?.(); }, 1850);
  }, [stop, schedule, onFocusSection]);

  const sweepAllXrefs = useCallback(() => {
    stop(); if (reducedMotion.current) return;
    const entries = buildReportDirectory(paperContent).slice(0, 5);
    entries.forEach((entry, index) => schedule(() => triggerXrefSynapse(entry.targetAttr, entry.targetId, true), index * 1000));
  }, [stop, paperContent, schedule, triggerXrefSynapse]);

  const playChaptersTypewriter = useCallback((
    snapshot: EditorContent,
    sectionIds?: readonly string[],
    revisions: FullReportGenerationResult['revisions'] = [],
  ) => {
    stop();
    if (reducedMotion.current) return;
    const pool = sectionIds?.length
      ? snapshot.report.filter(item => sectionIds.includes(item.id) && item.body.trim().length > 0)
      : snapshot.report.filter(item => item.body.trim().length > 24).slice(0, 2);
    if (!pool.length) return;
    const playAt = (index: number) => {
      const section = pool[index];
      if (!section) {
        if (revisions.length) {
          runReviewAndFormatChoreography(snapshot, revisions, () => setWorkState(null));
        } else {
          setWorkState(null);
          setRobotVisible(false);
        }
        return;
      }
      onFocusSection?.(section.id);
      setWorkState({
        phase: 'writing',
        completed: index,
        total: pool.length,
        detail: `打字机撰写：${section.title || `第 ${index + 1} 节`}`,
      });
      streamSectionIntoStage(section, snapshot, () => {
        setWorkState({
          phase: 'writing',
          completed: index + 1,
          total: pool.length,
          detail: `已完成：${section.title || `第 ${index + 1} 节`}`,
        });
        schedule(() => playAt(index + 1), 160);
      });
    };
    playAt(0);
  }, [stop, onFocusSection, streamSectionIntoStage, runReviewAndFormatChoreography, schedule]);

  const playFullTheaterShowcase = useCallback((contentOverride?: EditorContent, revisions: FullReportGenerationResult['revisions'] = []) => {
    const content = contentOverride ?? paperContent;
    const candidates = content.report.filter(item => item.body.trim().length > 30).slice(0, 2);
    if (!candidates.length || reducedMotion.current) return;
    playChaptersTypewriter(content, candidates.map(s => s.id), revisions);
  }, [paperContent, playChaptersTypewriter]);
  useEffect(() => () => { clearAllTimers(); clearActiveDomHighlights(); }, [clearAllTimers, clearActiveDomHighlights]);

  return { typingState, reviewState, formatScanSectionId: null, robotRole, robotStatusText, robotVisible, workState, forgePod, beams, activeTargetKey, triggerXrefSynapse, sweepAllXrefs, animateIncomingSection, runReviewAndFormatChoreography, playChaptersTypewriter, playFullTheaterShowcase, setRobotVisible, stop };
}
