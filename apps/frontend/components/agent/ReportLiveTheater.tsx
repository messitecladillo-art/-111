'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { Figure, ResultTable } from '@/components/editors/PaperBlocks';
import styles from './ReportLiveTheater.module.css';
import {
  buildReportDirectory,
  useLiveReportChoreography,
  type DirectoryEntry,
  type ForgePodState,
  type RobotRole,
  type SynapseBeam,
} from './useLiveReportChoreography';

export {
  buildReportDirectory,
  useLiveReportChoreography,
  type DirectoryEntry,
  type ForgePodState,
  type RobotRole,
  type SynapseBeam,
};

const ROLE_META: Record<RobotRole, { badge: string; title: string }> = {
  writer: { badge: '撰写', title: '正在撰写正文' },
  chart: { badge: '图表', title: '正在核对并置入图表' },
  xref: { badge: '引用', title: '正在关联交叉引用' },
  reviewer: { badge: '审阅', title: '正在复核本轮修订' },
};

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
                <path d={pathPrimary} className={styles.beamGlow} />
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
        <div
          className={styles.forgePod}
          data-forge-pod="true"
          data-phase={forgePod.phase}
          style={
            forgePod.flyX !== undefined && forgePod.flyY !== undefined
              ? ({
                  '--fly-x': `${forgePod.flyX}px`,
                  '--fly-y': `${forgePod.flyY}px`,
                } as CSSProperties)
              : undefined
          }
        >
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

export default ReportLiveTheater;
