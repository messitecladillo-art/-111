import type { PlanMethod } from './analysis-plan.ts';
import type { NumericSummary } from './survey-analysis.ts';
import type { ResearchPaletteId } from './chart-palette-reserve.ts';

export type ChartKind = 'bar' | 'horizontal_bar' | 'lollipop' | 'pie' | 'donut' | 'treemap' | 'waffle' | 'grouped_bar' | 'stacked_bar' | 'percent_stacked' | 'heatmap' | 'mosaic' | 'histogram' | 'boxplot' | 'density' | 'ecdf' | 'strip' | 'violin' | 'raincloud' | 'group_mean' | 'mean_sd' | 'group_boxplot' | 'group_violin' | 'group_density' | 'group_raincloud' | 'scatter' | 'rank_scatter' | 'item_correlation' | 'alpha_deleted' | 'item_mean' | 'table';
export type ChartFamily = 'comparison' | 'composition' | 'distribution' | 'relationship' | 'measurement' | 'table';
export type ChartThemeId = 'blue' | 'teal' | 'forest' | 'plum' | 'slate' | ResearchPaletteId;
export type ChartStyle = {
  title: string; subtitle: string; xLabel: string; yLabel: string; note: string;
  fontFamily: 'sans' | 'serif'; fontSize: number; decimals: number;
  showLegend: boolean; showLabels: boolean; showGrid: boolean; showBorder: boolean;
  background: string; ink: string; accent: string | null;
  lineWidth: number; pointSize: number; width: number; height: number;
  tableRules: 'three_line' | 'grid' | 'minimal';
};
export type FigureSettings = { kind: ChartKind; style: ChartStyle };
export type ChartWorkspaceSettings = { schema: 'chart-style/v1'; theme: ChartThemeId; figures: Record<string, FigureSettings> };
export type ChartDistribution = {
  key: string; label: string; values: number[]; summary: NumericSummary;
  bins: { start: number; end: number; count: number }[];
  box: { low: number; q1: number; median: number; q3: number; high: number; outliers: number[] };
  density: { bandwidth: number; points: [number, number][]; method: string } | null;
  ecdf: [number, number][];
};
/** In-memory only. Row-level projections never enter saved chart-format files. */
export type ChartSnapshot = {
  schema: 'analysis-chart-data/v1'; method: PlanMethod; n: number;
  binding: { dataHash: string; signature: string; computedAt: string };
  xLabel: string; yLabel: string;
  categories: { key: string; label: string; count: number; percent: number }[];
  distributions: ChartDistribution[];
  cross: { rows: string[]; columns: string[]; cells: { row: string; column: string; count: number; rowPercent: number }[] } | null;
  pairs: { values: [number, number][]; ranks: [number, number][] } | null;
  reliability: { key: string; label: string; mean: number | null; sd: number | null; correctedItemTotal: number | null; alphaIfDeleted: number | null }[];
  table: { headers: string[]; rows: (string | number | null)[][] };
  statistics: string[];
};
export type ChartModule = { id: string; title: string; question: string; current: boolean; snapshot: ChartSnapshot | null };
export type ChartChoice = { id: ChartKind; family: ChartFamily; title: string; description: string; available: boolean; reason: string };
