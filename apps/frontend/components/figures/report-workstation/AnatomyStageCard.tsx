'use client';

import { useState } from 'react';
import ReportWorkstation, { type WorkKind } from './ReportWorkstation';
import styles from './ReportWorkstation.module.css';

const STATIONS: ReadonlyArray<{ kind: WorkKind; short: string; label: string; summary: string }> = [
  { kind: 'survey', short: 'FORM', label: '问卷设计', summary: '构念映射、题项矩阵与测度校准' },
  { kind: 'analysis', short: 'STAT', label: '计量建模', summary: '检验统计量、效应量与稳健性检验' },
  { kind: 'research', short: 'REF', label: '知识镜检索', summary: '统计词条公式与实证边界核对' },
  { kind: 'report', short: 'TYPE', label: '成文排版', summary: 'A4 五章实证蓝图与三线表定稿' },
];

/**
 * Interactive Liquid Glass optical bench wrapping Anatomy ReportWorkstation.
 * Screen-only instrumentation; allows switching station skins and inspecting exploded iso geometry.
 */
export default function AnatomyStageCard({
  overallScore,
  blindCount,
  litCount,
  totalRooms = 4,
  defaultKind = 'survey',
  busy = false,
}: {
  overallScore: number;
  blindCount: number;
  litCount: number;
  totalRooms?: number;
  defaultKind?: WorkKind;
  busy?: boolean;
}) {
  const [kind, setKind] = useState<WorkKind>(defaultKind);
  const current = STATIONS.find((s) => s.kind === kind) ?? STATIONS[0];
  const pct = Math.round(Math.max(0, Math.min(1, overallScore)) * 100);
  const phase = busy ? 'writing' : 'waiting';

  return (
    <div className={styles.stageShell} role="region" aria-label="证见镜室等轴测实验台">
      <div className={styles.stageTop}>
        <div className={styles.stageTitleGroup}>
          <span className={styles.stageEyebrow}>
            <i aria-hidden="true" />
            ANATOMY INSTRUMENT · 镜室几何装置
          </span>
          <span className={styles.stageMetric}>
            照度 <b>{pct}%</b> · 盲区 <b>{blindCount}</b>
          </span>
        </div>
        <div className={styles.stageTabs} role="tablist" aria-label="切换装置工位">
          {STATIONS.map((s) => (
            <button
              key={s.kind}
              type="button"
              role="tab"
              aria-selected={kind === s.kind}
              className={styles.stageTab}
              onClick={() => setKind(s.kind)}
            >
              <code>{s.short}</code>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <ReportWorkstation
        compact
        inspectable
        kind={kind}
        heading={`${current.label}装置 · ${current.short}`}
        countUnit="环"
        state={{
          phase,
          completed: litCount,
          total: totalRooms,
          detail: `${current.summary} — 点击右上角「展开结构」可拆解等轴测压印机架。`,
        }}
      />
    </div>
  );
}
