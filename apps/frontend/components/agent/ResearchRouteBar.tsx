'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RESEARCH_STAGES, type ResearchStageId } from '@/lib/agent/research-stages';
import { Icon } from './icons';
import { useKeyedListMotion } from './useEvixMotion';
import styles from './ResearchRouteBar.module.css';

const ROUTE_GROUPS: ReadonlyArray<{ id: string; label: string; steps: readonly ResearchStageId[] }> = [
  { id: 'topic', label: '选题与文献', steps: ['topic', 'diagnosis', 'literature'] },
  { id: 'design', label: '调查设计', steps: ['questionnaire', 'sampling', 'pilot'] },
  { id: 'data', label: '数据与分析', steps: ['collection', 'quality', 'analysis'] },
  { id: 'report', label: '报告与发现', steps: ['findings', 'report'] },
  { id: 'delivery', label: '审查与交付', steps: ['review', 'export'] },
  { id: 'defense', label: '答辩', steps: ['defense'] },
];

type ResearchRouteBarProps = {
  current: ResearchStageId | null;
  overviewActive: boolean;
  onSelect: (id: ResearchStageId) => void;
  onOverview: () => void;
};

export default function ResearchRouteBar({ current, overviewActive, onSelect, onOverview }: ResearchRouteBarProps) {
  const routeId = useId();
  const nav = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const currentStep = RESEARCH_STAGES.find(step => step.id === current);
  const activeGroup = ROUTE_GROUPS.find(group => !!currentStep && group.steps.includes(currentStep.id));
  const routeMotionIds = useMemo(() => ['overview', ...ROUTE_GROUPS.map(g => g.id)], []);
  const routeIndexRef = useKeyedListMotion<HTMLDivElement>({
    ids: routeMotionIds,
    activeId: overviewActive ? 'overview' : (activeGroup?.id ?? null),
    markerAxis: 'horizontal',
  });

  useEffect(() => {
    if (!openGroup) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpenGroup(null);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [openGroup]);

  return (
    <nav
      ref={nav}
      className={styles.route}
      aria-label="研究流程导航"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenGroup(null);
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !openGroup) return;
        event.preventDefault();
        event.stopPropagation();
        trigger.current?.focus();
        setOpenGroup(null);
      }}
    >
      <div ref={routeIndexRef} className={styles.index}>
        <span data-motion-marker className={styles.routeMarker} aria-hidden="true" />
        <button
          type="button"
          data-motion-id="overview"
          className={styles.overview}
          aria-current={overviewActive ? 'page' : undefined}
          onClick={() => {
            setOpenGroup(null);
            onOverview();
          }}
        >
          <Icon name="grid" />
          概览
        </button>
        {ROUTE_GROUPS.map(group => {
          const steps = RESEARCH_STAGES.filter(step => group.steps.includes(step.id));
          const active = !!currentStep && group.steps.includes(currentStep.id);
          const expanded = openGroup === group.id;
          const panelId = `${routeId}-${group.id}`;
          return (
            <div key={group.id} className={styles.group}>
              <button
                type="button"
                data-motion-id={group.id}
                className={styles.groupButton}
                data-active={active}
                aria-label={group.label}
                aria-describedby={active ? `${panelId}-current` : undefined}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={event => {
                  trigger.current = event.currentTarget;
                  setOpenGroup(expanded ? null : group.id);
                }}
              >
                <span className={styles.groupText}>
                  <span>{group.label}</span>
                  {active && <span className={styles.current} id={`${panelId}-current`}>{currentStep.label}</span>}
                </span>
                <Icon name="down" />
              </button>
              <ul className={styles.steps} id={panelId} hidden={!expanded}>
                {steps.map(step => (
                  <li key={step.id}>
                    <button
                      type="button"
                      className={styles.step}
                      aria-current={current === step.id ? 'step' : undefined}
                      onClick={() => {
                        trigger.current?.focus();
                        setOpenGroup(null);
                        onSelect(step.id);
                      }}
                    >
                      {step.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
