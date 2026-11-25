'use client';

import dynamic from 'next/dynamic';
import type { AgentAction } from '@/lib/agent/router';
import type {
  ChartStudioCardData,
  CodeStudioCardData,
  CodeStudioLang,
  SiliconTheaterCardData,
  SiliconTemplateKey,
  StudioChartKind,
  StudioPaletteId,
  WritingStudioCardData,
} from '@/lib/agent/studios';
import type { WritingModelStatus } from './StudioCardsImpl';
import styles from './AgentShell.module.css';

export type {
  ChartStudioCardData,
  CodeStudioCardData,
  CodeStudioLang,
  SiliconTheaterCardData,
  SiliconTemplateKey,
  StudioChartKind,
  StudioPaletteId,
  WritingModelStatus,
  WritingStudioCardData,
};

export type ChartStudioViewProps = {
  data: ChartStudioCardData;
  onAction: (action: AgentAction) => void;
};

export type CodeStudioViewProps = {
  data: CodeStudioCardData;
  onAction: (action: AgentAction) => void;
};

export type WritingStudioViewProps = {
  data: WritingStudioCardData;
  onAction: (action: AgentAction) => void;
  modelStatus?: WritingModelStatus;
};

export type SiliconTheaterViewProps = {
  data: SiliconTheaterCardData;
  onAction?: (action: AgentAction) => void;
};

export const ChartStudioView = dynamic<ChartStudioViewProps>(
  () => import('./StudioCardsImpl').then(mod => mod.ChartStudioView),
  {
    ssr: false,
    loading: () => <p className={styles.studioEmpty} role="status" aria-live="polite">正在载入制图工坊…</p>,
  },
);

export const CodeStudioView = dynamic<CodeStudioViewProps>(
  () => import('./StudioCardsImpl').then(mod => mod.CodeStudioView),
  {
    ssr: false,
    loading: () => <p className={styles.studioEmpty} role="status" aria-live="polite">正在载入统计脚本工坊…</p>,
  },
);

export const WritingStudioView = dynamic<WritingStudioViewProps>(
  () => import('./StudioCardsImpl').then(mod => mod.WritingStudioView),
  {
    ssr: false,
    loading: () => <p className={styles.studioEmpty} role="status" aria-live="polite">正在载入写作润色工坊…</p>,
  },
);

export const SiliconTheaterView = dynamic<SiliconTheaterViewProps>(
  () => import('./StudioCardsImpl').then(mod => mod.SiliconTheaterStudioView),
  {
    ssr: false,
    loading: () => <p className={styles.studioEmpty} role="status" aria-live="polite">正在载入预测试推演面板…</p>,
  },
);

export const SiliconTheaterStudioView = SiliconTheaterView;
