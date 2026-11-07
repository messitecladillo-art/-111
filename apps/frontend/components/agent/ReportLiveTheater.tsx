'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { EditorContent, ReportSection } from '@/lib/editor-model';
import { referenceNumbers } from '@/lib/references';
import { blockLabel, reportLabels } from '@/lib/report-numbering';
import type { LiveReviewState, LiveTypingState } from '@/components/editors/ReportPaper';
import styles from './ReportLiveTheater.module.css';

export type RobotRole = 'writer' | 'chart' | 'xref' | 'reviewer';

export type ForgePodState = {
  kind: 'chart' | 'table' | 'formula';
  label: string;
  caption: string;
  phase: 'pop' | 'fly';
};

export type SynapseBeam = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
};

type DirectoryEntry = {
  key: string;
  kind: 'figure' | 'table' | 'formula' | 'ref';
  tag: string;
  title: string;
  targetAttr: 'xref' | 'cite';
  targetId: string;
  sectionId: string;
  citedCount: number;
};

const ROLE_META: Record<RobotRole, { badge: string; title: string }> = {
  writer: { badge: '🤖 首席撰稿官', title: '正在逐字落笔正文' },
  chart: { badge: '📊 统计制图官', title: '正在锻造并飞入图表' },
  xref: { badge: '🔗 交叉引证官', title: '正在建立双轨交叉引用连线' },
  reviewer: { badge: '🔍 终审修辞官', title: '正在审稿划改与版式巡检' },
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
    reason: '方法学红线：横截面回归严禁使用“直接决定/彻底消除”等绝对化因果表述',
  },
  {
    matchSectionRe: /摘要|背景|方案|抽样|数据|建议/u,
    badPhrase: '本次调研样本完美代表了全国所有人群且不存在任何抽样偏差',
    goodPhrase: '本次分层配额样本在目标调研群体内具备良好代表性，外推时仍需控制潜在自选择偏误',
    reason: '严谨性审查：修正过度外推表述，补充样本适用边界声明',
  },
];

/**
 * Extracts all Figure Directory (图目录), Table Directory (表目录), Formula Directory (公式目录),
 * and Literature Reference Directory (文献目录) entries from the live report content, along with
 * how many times each is cross-referenced in the body text.
 */
export function buildReportDirectory(content: EditorContent): DirectoryEntry[] {
  const labels = reportLabels(content.report);
  const cited = referenceNumbers(content);
  const entries: DirectoryEntry[] = [];
  const allBodyText = content.report.map(s => s.body || '').join('\n');

  for (const s of content.report) {
    for (const b of s.blocks ?? []) {
      const labelInfo = labels.get(b.id);
      if (!labelInfo) continue;
      if (b.kind === 'chart' || b.kind === 'table' || b.kind === 'formula') {
        const tag = labelInfo.label;
        const normalizedLabel = tag.replace(/\s+/gu, ' ');
        const tokenCount = allBodyText.split(`[[${b.kind === 'chart' ? '图' : b.kind === 'table' ? '表' : '式'}:${b.id}]]`).length - 1;
        const plainRegex = new RegExp(normalizedLabel.replace(/\s+/gu, '\\s*').replace(/[()（）]/gu, '[()（）]'), 'gu');
        const plainCount = (allBodyText.match(plainRegex) ?? []).length;
        entries.push({
          key: `xref:${b.id}`,
          kind: b.kind === 'chart' ? 'figure' : b.kind === 'table' ? 'table' : 'formula',
          tag,
          title: b.text || s.title,
          targetAttr: 'xref',
          targetId: b.id,
          sectionId: s.id,
          citedCount: Math.max(1, tokenCount + plainCount),
        });
      }
    }
  }

  for (const refEntry of cited.order) {
    const num = cited.numbers.get(refEntry.id);
    if (!num) continue;
    const numStr = String(num);
    const tokenCount = allBodyText.split(`[[文献:${refEntry.id}]]`).length - 1;
    const plainCount = (allBodyText.match(new RegExp(`\\[${numStr}\\]`, 'gu')) ?? []).length;
    entries.push({
      key: `cite:${numStr}`,
      kind: 'ref',
      tag: `[${numStr}]`,
      title: `${refEntry.authors || '佚名'} (${refEntry.year || '2025'}) ${refEntry.title || ''}`.trim(),
      targetAttr: 'cite',
      targetId: numStr,
      sectionId: content.report.find(sec => /文献|附录/u.test(sec.title))?.id ?? content.report[content.report.length - 1]?.id ?? '',
      citedCount: Math.max(1, tokenCount + plainCount),
    });
  }

  // Fallback for plain-text "[1]" references in the references section when content.references is empty
  if (!cited.order.length) {
    const refSec = content.report.find(sec => /文献|附录/u.test(sec.title));
    if (refSec?.body) {
      for (const rawLine of refSec.body.split(/\r?\n/u)) {
        const m = /^\s*\[(\d+)\]\s*(.+)$/u.exec(rawLine.trim());
        if (m) {
          const numStr = m[1];
          const textBody = m[2];
          entries.push({
            key: `cite:${numStr}`,
            kind: 'ref',
            tag: `[${numStr}]`,
            title: textBody.slice(0, 48),
            targetAttr: 'cite',
            targetId: numStr,
            sectionId: refSec.id,
            citedCount: Math.max(1, (allBodyText.match(new RegExp(`\\[${numStr}\\]`, 'gu')) ?? []).length - 1),
          });
        }
      }
    }
  }

  return entries;
}

/**
 * Interactive Cross-Reference Directory Dock (图目录 · 表目录 · 文献目录) mounted above the paper.
 * Hovering or clicking any node fires the dual-line laser beam connecting the directory node,
 * the inline citation in the text, and the chart/table/reference in the paper.
 */
export function ReportXrefDock({
  content,
  activeTargetKey,
  onTriggerXref,
  onSweepAllXrefs,
  onReplayTheater,
  onStartLiveDeepSeek,
  theaterBusy,
}: {
  content: EditorContent;
  activeTargetKey: string | null;
  onTriggerXref: (targetAttr: 'xref' | 'cite', targetId: string, scrollIntoView?: boolean) => void;
  onSweepAllXrefs: () => void;
  onReplayTheater?: () => void;
  onStartLiveDeepSeek?: () => void;
  theaterBusy?: boolean;
}) {
  const entries = useMemo(() => buildReportDirectory(content), [content]);

  const figCount = entries.filter(e => e.kind === 'figure').length;
  const tblCount = entries.filter(e => e.kind === 'table').length;
  const refCount = entries.filter(e => e.kind === 'ref').length;

  return (
    <div className={styles.xrefDock} role="region" aria-label="图目录、表目录与文献交叉引用图谱">
      <div className={styles.xrefDockHead}>
        <span className={styles.xrefDockTitle}>
          <i aria-hidden="true" />
          {entries.length > 0
            ? `交叉引用神经元图谱（图目录 ${figCount} · 表目录 ${tblCount} · 文献目录 ${refCount}）`
            : '证见 AI 灵动撰稿剧场（拟人光标打字 · 浮窗飞入图表 · 双轨激光交叉引用 · 审稿划改）'}
        </span>
        <span className={styles.xrefDockHint}>
          {entries.length > 0
            ? '悬停或点击任一编号，即可触发「目录 ⇄ 正文引证词 ⇄ 图表/文献」双轨激光连线与同频爆闪'
            : '点击右侧按钮，即可在当前纸面实时观看 AI 机器人逐字落笔、图表跳出嵌入、交叉引用双线连线闪光与审稿划改全过程'}
        </span>
        {entries.length > 0 && (
          <button
            type="button"
            className={styles.dirNode}
            style={{ marginLeft: 'auto', borderColor: 'rgba(13, 148, 136, 0.45)', color: '#0f766e', fontWeight: 700 }}
            onClick={onSweepAllXrefs}
            title="自动巡检并依次点亮全篇所有图目录、表目录与文献的交叉引用双轨连线"
          >
            <span>⚡ 巡检全篇交叉引用连线</span>
          </button>
        )}
        {onReplayTheater && (
          <button
            type="button"
            className={styles.dirNode}
            disabled={theaterBusy}
            style={{
              marginLeft: entries.length > 0 ? 0 : 'auto',
              borderColor: 'rgba(217, 119, 6, 0.45)',
              color: '#b45309',
              fontWeight: 700,
            }}
            onClick={onReplayTheater}
            title="实时演示 AI 机器人逐字打字、图表浮窗飞入、交叉引用双线爆闪与终审划改全过程"
          >
            <span>{theaterBusy ? '🤖 机器人剧场演练中…' : '🎬 演示机器人打字·飞图·连线·审稿'}</span>
          </button>
        )}
        {onStartLiveDeepSeek && (
          <button
            type="button"
            className={styles.dirNode}
            disabled={theaterBusy}
            style={{
              borderColor: 'rgba(15, 118, 110, 0.55)',
              background: 'linear-gradient(135deg, #0f766e, #115e59)',
              color: '#ffffff',
              fontWeight: 700,
            }}
            onClick={onStartLiveDeepSeek}
            title="调用 DeepSeek 实时逐节撰写 26 节完整报告并在纸面同步呈现打字、飞图、交叉引用连线与审稿修订"
          >
            <span>🚀 启动 DeepSeek 实时全报告撰稿</span>
          </button>
        )}
      </div>
      {entries.length > 0 && (
        <div className={styles.xrefGroups}>
          {entries.map(entry => {
            const isLinked = activeTargetKey === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                className={styles.dirNode}
                data-directory-node={entry.key}
                data-linked={isLinked ? 'true' : undefined}
                onMouseEnter={() => onTriggerXref(entry.targetAttr, entry.targetId, false)}
                onClick={() => onTriggerXref(entry.targetAttr, entry.targetId, true)}
                title={`${entry.tag} ${entry.title}（正文已交叉引用 ${entry.citedCount} 次，点击定位并触发双线爆闪）`}
              >
                <span className={styles.dirTag}>{entry.tag}</span>
                <span>{entry.title.slice(0, 14)}{entry.title.length > 14 ? '…' : ''}</span>
                <span className={styles.dirCount}>×{entry.citedCount}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The visual overlay inside `.paperStage`:
 * 1. Renders dual intertwined glowing Bezier laser lines (`beamPrimary` + `beamSecondary`) + dual-end pulsing rings
 *    whenever a cross-reference is active.
 * 2. Renders the Autonomous Robot Cursor (`robotCursor`) tracking `[data-typing-caret="true"]` at 60fps.
 * 3. Renders the 3D Chart/Table Forge Pod (`forgePod`) popping out and flying into the paper.
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
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 1200, h: 1600 });

  useEffect(() => {
    const container = paperRef.current;
    if (!container) return;

    let rafId = 0;
    const updatePosition = () => {
      const caret = container.querySelector<HTMLElement>('[data-typing-caret="true"]');
      const cRect = container.getBoundingClientRect();
      setStageSize({
        w: Math.max(container.scrollWidth, cRect.width, 800),
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
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="evix-synapse-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#0f766e" />
            </linearGradient>
          </defs>
          {beams.map(b => {
            const dx = b.x2 - b.x1;
            const dy = b.y2 - b.y1;
            const bend = Math.min(140, Math.max(48, Math.hypot(dx, dy) * 0.24));
            // Two intertwined Bezier trajectories (Primary arc + Secondary counter-arc) that meet at both endpoints
            const pathPrimary = `M ${b.x1} ${b.y1} C ${b.x1 + dx * 0.28 + bend} ${b.y1 + dy * 0.18 - bend * 0.5}, ${b.x1 + dx * 0.72 + bend} ${b.y1 + dy * 0.82 - bend * 0.3}, ${b.x2} ${b.y2}`;
            const pathSecondary = `M ${b.x1} ${b.y1} C ${b.x1 + dx * 0.28 - bend} ${b.y1 + dy * 0.25 + bend * 0.5}, ${b.x1 + dx * 0.72 - bend} ${b.y1 + dy * 0.75 + bend * 0.3}, ${b.x2} ${b.y2}`;
            return (
              <g key={b.id}>
                <path d={pathPrimary} className={styles.beamPrimary} stroke="url(#evix-synapse-grad-1)" />
                <path d={pathSecondary} className={styles.beamSecondary} stroke="url(#evix-synapse-grad-2)" />
                <circle cx={b.x1} cy={b.y1} r={7} className={styles.nodeCore} />
                <circle cx={b.x1} cy={b.y1} r={11} className={styles.nodeRing} />
                <circle cx={b.x2} cy={b.y2} r={7} className={styles.nodeCore} />
                <circle cx={b.x2} cy={b.y2} r={11} className={styles.nodeRing} />
              </g>
            );
          })}
        </svg>
      )}

      {beams[0] && (
        <div
          className={styles.synapseBadge}
          style={{
            left: `${(beams[0].x1 + beams[0].x2) / 2}px`,
            top: `${(beams[0].y1 + beams[0].y2) / 2}px`,
          }}
        >
          ⚡ {beams[0].label}
        </div>
      )}

      {robotVisible && cursorPos && (
        <div
          className={styles.robotCursor}
          style={{ transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)` }}
        >
          <div className={styles.cursorHalo} />
          <svg className={styles.cursorPointer} viewBox="0 0 24 24" fill="none">
            <path
              d="M4 3L11.5 20L14.2 13.2L21 10.5L4 3Z"
              fill="#0f766e"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <div className={styles.cursorPill} data-role={robotRole === 'reviewer' ? 'reviewer' : robotRole === 'xref' ? 'xref' : undefined}>
            <span className={styles.cursorDot} />
            <b>{roleInfo.badge}</b>
            <span>· {robotStatusText || roleInfo.title}</span>
          </div>
        </div>
      )}

      {forgePod && (
        <div className={styles.forgePod} data-phase={forgePod.phase}>
          <div className={styles.forgePodHead}>
            <span>📊 统计制图官 · 实时出图舱</span>
            <span>{forgePod.label}</span>
          </div>
          <div className={styles.forgePodTitle}>
            正在将「{forgePod.label} {forgePod.caption}」嵌入正文并绑定目录编号…
          </div>
          <div className={styles.forgePodBars}>
            <i style={{ height: '48%' }} />
            <i style={{ height: '76%', animationDelay: '0.08s' }} />
            <i style={{ height: '94%', animationDelay: '0.16s' }} />
            <i style={{ height: '65%', animationDelay: '0.24s' }} />
            <i style={{ height: '85%', animationDelay: '0.32s' }} />
            <i style={{ height: '58%', animationDelay: '0.4s' }} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Master choreography hook that orchestrates:
 * - Character-by-character human typing simulation with the floating Robot Cursor (`typingState`)
 * - 3D Chart/Table Forge Pod pop-out & fly-in (`forgePod` + `data-fly-in="true"`)
 * - Dual-line Bezier cross-reference laser synapse & dual-end resonance flash (`beams`)
 * - Redline self-review strikethrough & character-by-character rewrite (`reviewState`)
 * - Golden formatting scanline sweep (`formatScanSectionId`)
 */
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

  /**
   * Computes exact stage-relative coordinates and fires the Dual Bezier Laser Synapse
   * between the directory node (`[data-directory-node]`), the inline citation pill (`[data-xref-source]` / `[data-cite-source]`),
   * and the target chart/table/reference (`[data-xref-target]` / `[data-cite-target]`).
   */
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
        const labelText =
          targetEl?.getAttribute('data-xref-label') ||
          primarySource?.getAttribute('data-xref-label') ||
          (targetAttr === 'cite' ? `参考文献 [${targetId}]` : '图表交叉引用');

        if (primarySource && targetEl) {
          const p1 = centerOf(primarySource);
          const p2 = centerOf(targetEl);
          newBeams.push({
            id: `beam-main-${key}`,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            label: `${labelText} · 正文 ⇄ 实体双端互证已锁定`,
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
            label: `${labelText} · 目录索引 ⇄ 正文引证点联动`,
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
            label: `${labelText} · 目录索引 ⇄ 图表/文献联动`,
          });
        }

        setBeams(newBeams);
      };

      window.setTimeout(measureAndDraw, scrollIntoView ? 220 : 16);
      window.setTimeout(() => {
        setBeams(curr => (curr.some(b => b.id.endsWith(key)) ? [] : curr));
        setActiveTargetKey(curr => (curr === key ? null : curr));
        clearActiveDomHighlights();
      }, 2800);
    },
    [paperRef, clearActiveDomHighlights],
  );

  // Event delegation on `paperRef` so hovering or clicking ANY inline citation (`[data-xref-source]` or `[data-cite-source]`)
  // in the paper triggers the dual Bezier laser beams and flashes both ends!
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

  /**
   * Animates a newly arrived section (during DeepSeek live streaming):
   * 1. Simulates rapid human-like typing with the Robot Cursor (`typingState`).
   * 2. If the section has a chart/table/formula block, pops out the Forge Pod (`forgePod`) and flies the figure in.
   * 3. Automatically fires the dual-line cross-reference laser beam if a citation or figure is present.
   */
  const animateIncomingSection = useCallback(
    (section: ReportSection, contentSnapshot: EditorContent) => {
      const fullBody = (section.body || '').trim();
      if (!fullBody) return;

      setRobotVisible(true);
      setRobotRole('writer');
      setRobotStatusText(`正在落笔「${section.title}」…`);

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
          const labelStr = labels.get(firstExhibit.id)?.label ?? '图 1-1';
          setRobotRole('chart');
          setRobotStatusText(`正在将「${labelStr}」飞入纸面…`);
          setForgePod({
            kind: firstExhibit.kind as 'chart' | 'table' | 'formula',
            label: labelStr,
            caption: firstExhibit.text || section.title,
            phase: 'pop',
          });
          const container = paperRef.current;
          const figEl = container?.querySelector<HTMLElement>(`[data-xref-target="${firstExhibit.id}"]`);
          figEl?.setAttribute('data-fly-in', 'true');

          schedule(() => {
            setForgePod(prev => (prev ? { ...prev, phase: 'fly' } : null));
          }, 560);
          schedule(() => {
            setForgePod(null);
            setRobotRole('xref');
            setRobotStatusText(`已建立「${labelStr}」目录与正文双线互证`);
            triggerXrefSynapse('xref', firstExhibit.id, false);
          }, 880);
        }
      }, (totalSteps + 1) * stepMs);
    },
    [paperRef, schedule, triggerXrefSynapse],
  );

  /**
   * Runs the Self-Review Redline Strikethrough & Rewrite + Format Scanline Sweep across the report!
   */
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
      setRobotStatusText(`正在审查「${targetSec.title}」方法学表述…`);
      onFocusSection?.(targetSec.id);

      // Phase 1: Flag bad phrase with red strikethrough
      setReviewState({
        sectionId: targetSec.id,
        badPhrase: spec.badPhrase,
        goodPhrase: spec.goodPhrase,
        reason: spec.reason,
        step: 'flag',
        typedGood: '',
      });

      // Phase 2: Character-by-character rewrite into rigorous academic phrasing
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

      // Phase 3: Format scanline sweep across sections
      const sweepStartMs = 650 + (rewriteSteps + 3) * stepMs;
      const sweepTargets = candidateSections.slice(0, 6);
      sweepTargets.forEach((sec, idx) => {
        schedule(() => {
          setRobotStatusText(`正在规整「${sec.title}」学术版式与行距层级…`);
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

  /**
   * Sweeps through all cross-references in the directory one by one with dual laser beams!
   */
  const sweepAllXrefs = useCallback(() => {
    clearAllTimers();
    const entries = buildReportDirectory(paperContent);
    if (!entries.length) return;
    setRobotVisible(true);
    setRobotRole('xref');

    const picks = entries.slice(0, 6);
    picks.forEach((entry, idx) => {
      schedule(() => {
        setRobotStatusText(`正在核验「${entry.tag}」目录与正文双端交叉引用…`);
        triggerXrefSynapse(entry.targetAttr, entry.targetId, true);
      }, idx * 1050);
    });

    schedule(() => {
      setRobotVisible(false);
    }, picks.length * 1050 + 1200);
  }, [clearAllTimers, paperContent, schedule, triggerXrefSynapse]);

  /**
   * Full 1-click Choreography Showcase (逐字打字 + 图表跳出飞入 + 交叉引用双线同频爆闪 + 审稿划改 + 格式巡检)
   * Works immediately on any loaded report!
   */
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
      }, 2100);
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
