'use client';

import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { FlowEdge } from './canvasUi';
import styles from './Canvas.module.css';

/**
 * Solid line = data. A new edge draws itself in once; a data hand-off (a real result reaching the
 * next node) plays one short pulse keyed by the event, so repeated renders never replay it.
 */
export const DataEdge = memo(function DataEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<FlowEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.32 });
  const status = data?.status ?? null;
  return <>
    <BaseEdge id={id} path={path} className={styles.dataEdge} data-status={status ?? undefined} data-selected={selected || undefined} data-entering={data?.entering || undefined} interactionWidth={18} />
    {data?.entering && <path d={path} className={styles.edgeDraw} pathLength={1} aria-hidden="true" />}
    {!!data?.pulse && <path key={data.pulse} d={path} className={styles.edgePulse} pathLength={1} aria-hidden="true" />}
    {selected && <EdgeLabelRenderer><span className={`${styles.edgeTag} nodrag nopan`} style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>数据连线 · Delete 断开</span></EdgeLabelRenderer>}
  </>;
});

/** Dotted line = research relation or explanation. It never carries data and never schedules work. */
export const RelationEdge = memo(function RelationEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<FlowEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.25 });
  return <>
    <BaseEdge id={id} path={path} className={styles.relationEdge} data-selected={selected || undefined} interactionWidth={16} />
    {data?.entering && <path d={path} className={`${styles.edgeDraw} ${styles.edgeDrawRelation}`} pathLength={1} aria-hidden="true" />}
  </>;
});

export const EDGE_TYPES = { data: DataEdge, relation: RelationEdge };
