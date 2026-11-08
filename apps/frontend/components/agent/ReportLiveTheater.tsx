'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
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
  chart: { badge: '图表', title: '正在生成并嵌入图表' },
  xref: { badge: '引用', title: '正在关联交叉引用' },
  reviewer: { badge: '审阅', title: '正在修订表述与版式' },
};

const SAMPLE_REDLINES: {
  matchSectionRe: RegExp;
  badPhrase: string;
  goodPhrase: string;
  reason: string;
}[] = [
  {
    matchSectionRe: /假设|回归|聚类|实证|发现|结论/u,
    badPhrase: '这充分证明了核心自变量直接决定了用户满意度并消除了全部误差',
    goodPhrase: '这表明核心自变量与满意度呈显著正向关联（横截面样本不支持直接因果推断）',
    reason: '方法学规范：横截面回归不宜使用绝对化因果表述',
  },
  {
    matchSectionRe: /摘要|背景|方案|抽样|数据|建议/u,
    badPhrase: '本次调研样本完美代表了全国所有人群且不存在任何抽样偏差',
    goodPhrase: '本次分层配额样本在目标调研群体内具备代表性，外推时仍需控制潜在自选择偏误',
    reason: '外推边界规范：补充样本适用范围说明',
  },
];

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
      title: `${refEntry.authors || ''} (${refEntry.year || '2025'}) ${refEntry.title || ''}`.trim(),
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
        w: Math.max(container.clientWidth, 320),
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
              <div className={styles.forgePodBars}>
                <i style={{ height: '48%' }} />
                <i style={{ height: '76%' }} />
                <i style={{ height: '94%' }} />
                <i style={{ height: '65%' }} />
                <i style={{ height: '85%' }} />
              </div>
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
  const [formatScanSectionId, setFormatScanSectionId] = useState<string | null>(null);
  const [robotRole, setRobotRole] = useState<RobotRole>('writer');
  const [robotStatusText, setRobotStatusText] = useState<string>('');
  const [robotVisible, setRobotVisible] = useState<boolean>(false);
  const [forgePod, setForgePod] = useState<ForgePodState | null>(null);
  const [beams, setBeams] = useState<SynapseBeam[]>([]);
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(null);

  const timerIdsRef = useRef<number[]>([]);
  const clearAllTimers = useCallback(() => {
    for (const id of timerIdsRef.current) window.clearTimeout(id);
    timerIdsRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(fn, delayMs);
    timerIdsRef.current.push(id);
    return id;
  }, []);

  const clearActiveDomHighlights = useCallback(() => {
    const container = paperRef.current;
    if (!container) return;
    container
      .querySelectorAll('[data-xref-active="true"]')
      .forEach(el => el.removeAttribute('data-xref-active'));
  }, [paperRef]);

  const triggerXrefSynapse = useCallback(
    (targetAttr: 'xref' | 'cite', targetId: string, scrollIntoView = false) => {
      const container = paperRef.current;
      if (!container) return;

      clearActiveDomHighlights();
      const key = `${targetAttr}:${targetId}`;
      setActiveTargetKey(key);

      const sourceSelector =
        targetAttr === 'xref'
          ? `[data-xref-source="${targetId}"]`
          : `[data-cite-source="${targetId}"]`;
      const targetSelector =
        targetAttr === 'xref'
          ? `[data-xref-target="${targetId}"]`
          : `[data-cite-target="${targetId}"]`;
      const dirSelector = `[data-directory-node="${key}"]`;

      const sources = Array.from(container.querySelectorAll<HTMLElement>(sourceSelector));
      const targetEl = container.querySelector<HTMLElement>(targetSelector);
      const dirEl = container.querySelector<HTMLElement>(dirSelector);

      sources.forEach(el => el.setAttribute('data-xref-active', 'true'));
      targetEl?.setAttribute('data-xref-active', 'true');

      const primarySource = sources[0] ?? null;
      if (scrollIntoView) {
        if (primarySource) {
          primarySource.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      const measureAndDraw = () => {
        const cRect = container.getBoundingClientRect();
        const centerOf = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.left - cRect.left + container.scrollLeft + r.width / 2,
            y: r.top - cRect.top + container.scrollTop + r.height / 2,
          };
        };

        const newBeams: SynapseBeam[] = [];
        if (primarySource && targetEl) {
          const p1 = centerOf(primarySource);
          const p2 = centerOf(targetEl);
          newBeams.push({
            id: `beam-main-${key}`,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
          });
        }
        if (dirEl && primarySource) {
          const d = centerOf(dirEl);
          const p1 = centerOf(primarySource);
          newBeams.push({
            id: `beam-dir-${key}`,
            x1: d.x,
            y1: d.y,
            x2: p1.x,
            y2: p1.y,
          });
        } else if (dirEl && targetEl) {
          const d = centerOf(dirEl);
          const p2 = centerOf(targetEl);
          newBeams.push({
            id: `beam-dir-target-${key}`,
            x1: d.x,
            y1: d.y,
            x2: p2.x,
            y2: p2.y,
          });
        }

        setBeams(newBeams);
      };

      window.setTimeout(measureAndDraw, scrollIntoView ? 220 : 16);
      window.setTimeout(() => {
        setBeams(curr => (curr.some(b => b.id.endsWith(key)) ? [] : curr));
        setActiveTargetKey(curr => (curr === key ? null : curr));
        clearActiveDomHighlights();
      }, 2400);
    },
    [paperRef, clearActiveDomHighlights],
  );

  useEffect(() => {
    const container = paperRef.current;
    if (!container) return;

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const xrefEl = target.closest<HTMLElement>('[data-xref-source]');
      if (xrefEl) {
        const id = xrefEl.getAttribute('data-xref-source');
        if (id) triggerXrefSynapse('xref', id, false);
        return;
      }
      const citeEl = target.closest<HTMLElement>('[data-cite-source]');
      if (citeEl) {
        const id = citeEl.getAttribute('data-cite-source');
        if (id) triggerXrefSynapse('cite', id, false);
      }
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const xrefEl = target.closest<HTMLElement>('[data-xref-source]');
      if (xrefEl) {
        e.stopPropagation();
        const id = xrefEl.getAttribute('data-xref-source');
        if (id) triggerXrefSynapse('xref', id, true);
        return;
      }
      const citeEl = target.closest<HTMLElement>('[data-cite-source]');
      if (citeEl) {
        e.stopPropagation();
        const id = citeEl.getAttribute('data-cite-source');
        if (id) triggerXrefSynapse('cite', id, true);
      }
    };

    container.addEventListener('mouseover', onMouseOver);
    container.addEventListener('click', onClick);
    return () => {
      container.removeEventListener('mouseover', onMouseOver);
      container.removeEventListener('click', onClick);
    };
  }, [paperRef, triggerXrefSynapse]);

  const animateIncomingSection = useCallback(
    (section: ReportSection, contentSnapshot: EditorContent) => {
      const fullBody = (section.body || '').trim();
      if (!fullBody) return;

      setRobotVisible(true);
      setRobotRole('writer');
      setRobotStatusText(section.title);

      const totalLen = fullBody.length;
      const totalSteps = 18;
      const stepMs = 42;

      for (let step = 1; step <= totalSteps; step++) {
        schedule(() => {
          const sliceLen = Math.min(totalLen, Math.round((totalLen * step) / totalSteps));
          setTypingState({
            sectionId: section.id,
            visibleBody: fullBody.slice(0, sliceLen),
          });
        }, step * stepMs);
      }

      schedule(() => {
        setTypingState(null);
        const exhibits = (section.blocks ?? []).filter(
          b => b.kind === 'chart' || b.kind === 'table' || b.kind === 'formula',
        );
        if (exhibits.length > 0) {
          const firstExhibit = exhibits[0];
          const labels = reportLabels(contentSnapshot.report);
          const labelStr = blockLabel(labels, section.id, firstExhibit.id)?.label ?? '图 1-1';
          let matchedResult: ResultSnapshot | undefined;
          try {
            if (firstExhibit.kind === 'chart' || firstExhibit.kind === 'table') {
              matchedResult = resultFor(contentSnapshot.quality, firstExhibit.evidenceId);
            }
          } catch {
            matchedResult = undefined;
          }
          setRobotRole('chart');
          setRobotStatusText(labelStr);
          setForgePod({
            kind: firstExhibit.kind as 'chart' | 'table' | 'formula',
            label: labelStr,
            caption: firstExhibit.text || matchedResult?.title || section.title,
            phase: 'pop',
            result: matchedResult,
            valueColumn: firstExhibit.kind === 'chart' ? firstExhibit.valueColumn : 1,
          });
          const container = paperRef.current;
          const figEl = container?.querySelector<HTMLElement>(`[data-xref-target="${firstExhibit.id}"]`);
          figEl?.setAttribute('data-fly-in', 'true');

          schedule(() => {
            setForgePod(prev => (prev ? { ...prev, phase: 'fly' } : null));
          }, 680);
          schedule(() => {
            setForgePod(null);
            setRobotRole('xref');
            setRobotStatusText(labelStr);
            triggerXrefSynapse('xref', firstExhibit.id, false);
          }, 1020);
        }
      }, (totalSteps + 1) * stepMs);
    },
    [paperRef, schedule, triggerXrefSynapse],
  );

  const runReviewAndFormatChoreography = useCallback(
    (contentSnapshot: EditorContent, onFinish?: () => void) => {
      const candidateSections = contentSnapshot.report.filter(s => (s.body || '').trim().length > 40);
      if (!candidateSections.length) {
        onFinish?.();
        return;
      }

      const targetSec =
        candidateSections.find(s => /假设|回归|发现|实证/u.test(s.title)) ??
        candidateSections[Math.min(2, candidateSections.length - 1)];
      const spec =
        SAMPLE_REDLINES.find(r => r.matchSectionRe.test(targetSec.title)) ?? SAMPLE_REDLINES[0];

      setRobotVisible(true);
      setRobotRole('reviewer');
      setRobotStatusText(targetSec.title);
      onFocusSection?.(targetSec.id);

      setReviewState({
        sectionId: targetSec.id,
        badPhrase: spec.badPhrase,
        goodPhrase: spec.goodPhrase,
        reason: spec.reason,
        step: 'flag',
        typedGood: '',
      });

      const rewriteSteps = 16;
      const stepMs = 45;
      for (let i = 1; i <= rewriteSteps; i++) {
        schedule(() => {
          const chars = Math.round((spec.goodPhrase.length * i) / rewriteSteps);
          setReviewState({
            sectionId: targetSec.id,
            badPhrase: spec.badPhrase,
            goodPhrase: spec.goodPhrase,
            reason: spec.reason,
            step: i === rewriteSteps ? 'done' : 'rewrite',
            typedGood: spec.goodPhrase.slice(0, chars),
          });
        }, 650 + i * stepMs);
      }

      const sweepStartMs = 650 + (rewriteSteps + 3) * stepMs;
      const sweepTargets = candidateSections.slice(0, 6);
      sweepTargets.forEach((sec, idx) => {
        schedule(() => {
          setRobotStatusText(sec.title);
          setFormatScanSectionId(sec.id);
        }, sweepStartMs + idx * 240);
      });

      schedule(
        () => {
          setFormatScanSectionId(null);
          setReviewState(null);
          setRobotVisible(false);
          onFinish?.();
        },
        sweepStartMs + sweepTargets.length * 240 + 600,
      );
    },
    [onFocusSection, schedule],
  );

  const sweepAllXrefs = useCallback(() => {
    clearAllTimers();
    const entries = buildReportDirectory(paperContent);
    if (!entries.length) return;
    setRobotVisible(true);
    setRobotRole('xref');

    const picks = entries.slice(0, 6);
    picks.forEach((entry, idx) => {
      schedule(() => {
        setRobotStatusText(entry.tag);
        triggerXrefSynapse(entry.targetAttr, entry.targetId, true);
      }, idx * 1050);
    });

    schedule(() => {
      setRobotVisible(false);
    }, picks.length * 1050 + 1200);
  }, [clearAllTimers, paperContent, schedule, triggerXrefSynapse]);

  const playFullTheaterShowcase = useCallback(
    (contentOverride?: EditorContent) => {
      const targetContent = contentOverride ?? paperContent;
      clearAllTimers();

      const writtenSecs = targetContent.report.filter(s => (s.body || '').trim().length > 30);
      if (!writtenSecs.length) return;

      const secWithExhibit =
        writtenSecs.find(s => (s.blocks ?? []).some(b => b.kind === 'chart' || b.kind === 'table')) ??
        writtenSecs[0];

      onFocusSection?.(secWithExhibit.id);
      animateIncomingSection(secWithExhibit, targetContent);

      schedule(() => {
        runReviewAndFormatChoreography(targetContent);
      }, 2200);
    },
    [paperContent, clearAllTimers, onFocusSection, animateIncomingSection, schedule, runReviewAndFormatChoreography],
  );

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  return {
    typingState,
    reviewState,
    formatScanSectionId,
    robotRole,
    robotStatusText,
    robotVisible,
    forgePod,
    beams,
    activeTargetKey,
    triggerXrefSynapse,
    sweepAllXrefs,
    animateIncomingSection,
    runReviewAndFormatChoreography,
    playFullTheaterShowcase,
    setRobotVisible,
  };
}
