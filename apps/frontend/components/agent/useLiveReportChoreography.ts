'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FullReportGenerationResult } from '@/lib/agent/full-report-pipeline';
import type { ReportWorkState } from '@/lib/agent/report-work';
import type { EditorContent, ReportSection } from '@/lib/editor-model';
import type { LiveReviewState, LiveTypingState } from '@/components/editors/ReportPaper';
import { referenceNumbers } from '@/lib/references';
import { blockLabel, reportLabels } from '@/lib/report-numbering';
import { resultFor, type ReportBlock, type ResultSnapshot } from '@/lib/research-quality';

export type RobotRole = 'writer' | 'chart' | 'xref' | 'reviewer';

export type ForgePodState = {
  kind: 'chart' | 'table' | 'formula';
  label: string;
  caption: string;
  phase: 'pop' | 'fly';
  result?: ResultSnapshot;
  valueColumn?: number;
  accent?: string;
  flyX?: number;
  flyY?: number;
};

export type SynapseBeam = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type DirectoryEntry = {
  key: string;
  kind: 'figure' | 'table' | 'formula' | 'ref';
  tag: string;
  title: string;
  targetAttr: 'xref' | 'cite';
  targetId: string;
  sectionId: string;
};

const PROSE_BLOCK_KINDS = new Set<ReportBlock['kind']>(['paragraph', 'callout', 'citation']);

function sectionProseText(section: Pick<ReportSection, 'body' | 'blocks'>): string {
  const parts: string[] = [];
  if (section.body.trim()) parts.push(section.body);
  for (const block of section.blocks ?? []) {
    if (PROSE_BLOCK_KINDS.has(block.kind) && block.text.trim()) parts.push(block.text);
  }
  return parts.length ? parts.join('\n') : section.body;
}

function cleanTheaterLabel(raw: string): string {
  return raw
    .replace(/[\u300c\u300e]/gu, '“')
    .replace(/[\u300d\u300f]/gu, '”')
    .replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）')
    .trim();
}

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
      sectionId:
        content.report.find(sec => /文献|附录/u.test(sec.title))?.id ??
        content.report[content.report.length - 1]?.id ??
        '',
    });
  }

  return entries;
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
    const update = () => {
      reducedMotion.current = query.matches;
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const clearAllTimers = useCallback(() => {
    timerIds.current.forEach(id => window.clearTimeout(id));
    timerIds.current.clear();
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timerIds.current.delete(id);
      fn();
    }, delay);
    timerIds.current.add(id);
    return id;
  }, []);

  const clearActiveDomHighlights = useCallback(() => {
    paperRef.current?.querySelectorAll('[data-xref-active], [data-fly-in]').forEach(element => {
      element.removeAttribute('data-xref-active');
      element.removeAttribute('data-fly-in');
    });
  }, [paperRef]);

  const stop = useCallback(() => {
    incomingQueueRef.current = [];
    incomingBusyRef.current = false;
    clearAllTimers();
    clearActiveDomHighlights();
    setTypingState(null);
    setReviewState(null);
    setRobotVisible(false);
    setWorkState(null);
    setForgePod(null);
    setBeams([]);
    setActiveTargetKey(null);
  }, [clearAllTimers, clearActiveDomHighlights]);

  const triggerXrefSynapse = useCallback(
    (attr: 'xref' | 'cite', targetId: string, scroll = false) => {
      const container = paperRef.current;
      if (!container) return;
      clearActiveDomHighlights();
      const escaped = CSS.escape(targetId);
      const key = `${attr}:${targetId}`;
      const sources = Array.from(container.querySelectorAll<HTMLElement>(`[data-${attr}-source="${escaped}"]`));
      const target = container.querySelector<HTMLElement>(`[data-${attr}-target="${escaped}"]`);
      const directory = container.querySelector<HTMLElement>(`[data-directory-node="${CSS.escape(key)}"]`);
      sources.forEach(element => element.setAttribute('data-xref-active', 'true'));
      target?.setAttribute('data-xref-active', 'true');
      setActiveTargetKey(key);
      if (scroll) {
        (sources[0] ?? target)?.scrollIntoView({
          behavior: reducedMotion.current ? 'auto' : 'smooth',
          block: 'center',
        });
      }
      if (!reducedMotion.current) {
        schedule(
          () => {
            const rect = container.getBoundingClientRect();
            const center = (element: HTMLElement) => {
              const bounds = element.getBoundingClientRect();
              return {
                x: bounds.left - rect.left + container.scrollLeft + bounds.width / 2,
                y: bounds.top - rect.top + container.scrollTop + bounds.height / 2,
              };
            };
            const source = sources[0] ?? directory;
            if (!source || !target) return;
            const from = center(source);
            const to = center(target);
            setBeams([{ id: key, x1: from.x, y1: from.y, x2: to.x, y2: to.y }]);
          },
          scroll ? 220 : 16,
        );
      }
      schedule(() => {
        setBeams(current => (current.some(beam => beam.id === key) ? [] : current));
        setActiveTargetKey(current => (current === key ? null : current));
        clearActiveDomHighlights();
      }, 2200);
    },
    [paperRef, clearActiveDomHighlights, schedule],
  );

  useEffect(() => {
    const container = paperRef.current;
    if (!container) return;
    const focus = (event: Event) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-xref-source], [data-cite-source]',
      );
      if (!element) return;
      const attr = element.hasAttribute('data-xref-source') ? 'xref' : 'cite';
      const id = element.getAttribute(`data-${attr}-source`);
      if (id) triggerXrefSynapse(attr, id, event.type === 'click');
    };
    container.addEventListener('mouseover', focus);
    container.addEventListener('focusin', focus);
    container.addEventListener('click', focus);
    return () => {
      container.removeEventListener('mouseover', focus);
      container.removeEventListener('focusin', focus);
      container.removeEventListener('click', focus);
    };
  }, [paperRef, triggerXrefSynapse]);

  const buildTypewriterPlan = (body: string, maxBudgetMs = 1550) => {
    const frames: {
      endIndex: number;
      delayMs: number;
      lineRatio: number;
      strikeTick: number;
      returning: boolean;
    }[] = [];
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
        else lineWidth = ((lineWidth + (/[\u2e80-\uffff]/u.test(ch) ? 2 : 1)) % 42) || 42;
      }
      const lineRatio = hasNewline ? 0.04 : Math.max(0.06, Math.min(0.98, lineWidth / 42));
      const cadence = 42 + ((strikeTick * 13) % 15);
      const punctPause = hasNewline
        ? 130
        : /[。！？；.!?;]/u.test(lastChar)
          ? 85
          : /[，、：,]/u.test(lastChar)
            ? 40
            : 0;
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

  const streamSectionIntoStage = useCallback(
    (section: ReportSection, snapshot: EditorContent, onComplete?: () => void) => {
      const body = sectionProseText(section).trim();
      if (!body || reducedMotion.current) {
        onComplete?.();
        return;
      }
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
        setForgePod({
          kind: exhibit.kind,
          label,
          caption: exhibit.text || result.title,
          phase: 'pop',
          result,
          valueColumn: exhibit.kind === 'chart' ? exhibit.valueColumn : 1,
        });
        schedule(() => {
          const container = paperRef.current;
          const target = container?.querySelector<HTMLElement>(`[data-xref-target="${CSS.escape(exhibit.id)}"]`);
          const pod = container?.querySelector<HTMLElement>('[data-forge-pod="true"]');
          let flyX = -380;
          let flyY = 180;
          if (target && pod) {
            const tRect = target.getBoundingClientRect();
            const pRect = pod.getBoundingClientRect();
            flyX = Math.round(tRect.left + tRect.width / 2 - (pRect.left + pRect.width / 2));
            flyY = Math.round(tRect.top + tRect.height / 2 - (pRect.top + pRect.height / 2));
          } else if (target) {
            const tRect = target.getBoundingClientRect();
            flyX = Math.round(tRect.left + tRect.width / 2 - (window.innerWidth - 36 - 180));
            flyY = Math.round(tRect.top + tRect.height / 2 - (120 + 110));
          }
          setForgePod(previous => (previous ? { ...previous, phase: 'fly', flyX, flyY } : null));
        }, 560);
        schedule(() => {
          setForgePod(null);
          setRobotVisible(false);
          triggerXrefSynapse('xref', exhibit.id);
          const landedTarget = paperRef.current?.querySelector<HTMLElement>(
            `[data-xref-target="${CSS.escape(exhibit.id)}"]`,
          );
          landedTarget?.setAttribute('data-fly-in', 'true');
          onComplete?.();
        }, 940);
      }, finishMs);
    },
    [paperRef, schedule, triggerXrefSynapse],
  );

  const animateIncomingSection = useCallback(
    (section: ReportSection, snapshot: EditorContent) => {
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
    },
    [streamSectionIntoStage],
  );

  const runReviewAndFormatChoreography = useCallback(
    (snapshot: EditorContent, revisions: FullReportGenerationResult['revisions'] = [], onFinish?: () => void) => {
      stop();
      const revision = revisions.find(
        item => item.before !== item.after && snapshot.report.some(section => section.id === item.sectionId),
      );
      if (!revision || reducedMotion.current) {
        onFinish?.();
        return;
      }
      const cleanReason = cleanTheaterLabel(revision.reason);
      onFocusSection?.(revision.sectionId);
      setRobotVisible(true);
      setRobotRole('reviewer');
      setRobotStatusText('本轮正文审校');
      setWorkState({ phase: 'reviewing', completed: 1, total: 1, detail: `正在审校修订（${cleanReason}）` });
      const review = {
        sectionId: revision.sectionId,
        badPhrase: revision.before,
        goodPhrase: revision.after,
        reason: cleanReason,
      };
      setReviewState({ ...review, step: 'flag', typedGood: '' });
      for (let step = 1; step <= 14; step++) {
        schedule(
          () =>
            setReviewState({
              ...review,
              step: step === 14 ? 'done' : 'rewrite',
              typedGood: revision.after.slice(0, Math.ceil((revision.after.length * step) / 14)),
            }),
          480 + step * 48,
        );
      }
      schedule(() => {
        setReviewState(null);
        setRobotVisible(false);
        setWorkState(null);
        onFinish?.();
      }, 1850);
    },
    [stop, schedule, onFocusSection],
  );

  const sweepAllXrefs = useCallback(() => {
    stop();
    if (reducedMotion.current) return;
    const entries = buildReportDirectory(paperContent).slice(0, 5);
    entries.forEach((entry, index) =>
      schedule(() => triggerXrefSynapse(entry.targetAttr, entry.targetId, true), index * 1000),
    );
  }, [stop, paperContent, schedule, triggerXrefSynapse]);

  const playChaptersTypewriter = useCallback(
    (
      snapshot: EditorContent,
      sectionIds?: readonly string[],
      revisions: FullReportGenerationResult['revisions'] = [],
    ) => {
      stop();
      if (reducedMotion.current) return;
      const pool = sectionIds?.length
        ? snapshot.report.filter(item => sectionIds.includes(item.id) && sectionProseText(item).trim().length > 0)
        : snapshot.report.filter(item => sectionProseText(item).trim().length > 24).slice(0, 2);
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
        const sectionLabel = section.title ? `“${cleanTheaterLabel(section.title)}”` : `第 ${index + 1} 节`;
        setWorkState({
          phase: 'writing',
          completed: index,
          total: pool.length,
          detail: `正在撰写${sectionLabel}`,
        });
        streamSectionIntoStage(section, snapshot, () => {
          setWorkState({
            phase: 'writing',
            completed: index + 1,
            total: pool.length,
            detail: `已完成${sectionLabel}`,
          });
          schedule(() => playAt(index + 1), 160);
        });
      };
      playAt(0);
    },
    [stop, onFocusSection, streamSectionIntoStage, runReviewAndFormatChoreography, schedule],
  );

  const playFullTheaterShowcase = useCallback(
    (contentOverride?: EditorContent, revisions: FullReportGenerationResult['revisions'] = []) => {
      const content = contentOverride ?? paperContent;
      const candidates = content.report.filter(item => sectionProseText(item).trim().length > 30).slice(0, 2);
      if (!candidates.length || reducedMotion.current) return;
      playChaptersTypewriter(
        content,
        candidates.map(s => s.id),
        revisions,
      );
    },
    [paperContent, playChaptersTypewriter],
  );

  useEffect(
    () => () => {
      clearAllTimers();
      clearActiveDomHighlights();
    },
    [clearAllTimers, clearActiveDomHighlights],
  );

  return {
    typingState,
    reviewState,
    formatScanSectionId: null,
    robotRole,
    robotStatusText,
    robotVisible,
    workState,
    forgePod,
    beams,
    activeTargetKey,
    triggerXrefSynapse,
    sweepAllXrefs,
    animateIncomingSection,
    runReviewAndFormatChoreography,
    playChaptersTypewriter,
    playFullTheaterShowcase,
    setRobotVisible,
    stop,
  };
}
