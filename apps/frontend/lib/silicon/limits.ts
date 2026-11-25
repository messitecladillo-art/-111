export const SILICON_LIMITS = {
  personas: 120,
  attributes: 8,
  levels: 8,
  scenarios: 4,
  models: 3,
  background: 240,
  label: 24,
} as const;

export type SiliconLimits = typeof SILICON_LIMITS;
