/**
 * Chart colours for the 硅基样本 lab. The 3D stage is always the dark theatre, so its halos use the
 * dark-surface steps; DOM charts read the same slots from CSS tokens (see SiliconLab.module.css).
 * Validated with the dataviz validator against #fffdf8 (light) and #0d1c2c (dark):
 * categorical adjacent CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19.3; ordinal ramps monotone with ΔL ≥ 0.06.
 */
export const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;
export const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'] as const;
export const ORDINAL_LIGHT = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'] as const;
export const ORDINAL_DARK = ['#184f95', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6'] as const;
export const NEUTRAL_HALO = '#5b6b78';

/** Slot (0-based) of category `i` among `k` ordered categories on the five-step ramp. */
export function ordinalIndex(i: number, k: number): number {
  return k <= 1 ? ORDINAL_DARK.length - 1 : Math.round(i * (ORDINAL_DARK.length - 1) / (k - 1));
}

export function stageCategoryColor(ordered: boolean, i: number, k: number): string {
  if (ordered && k <= ORDINAL_DARK.length) return ORDINAL_DARK[ordinalIndex(i, k)];
  return i < CATEGORICAL_DARK.length ? CATEGORICAL_DARK[i] : NEUTRAL_HALO;
}
