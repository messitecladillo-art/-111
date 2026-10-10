import type { Expectation, VarRef } from './assess.ts';
import { EXAMPLE_EXPECTATIONS, EXAMPLE_SCENARIOS } from './example.ts';
import { ACCESSORY_KINDS, FIGURE_PALETTE, HAIR_TONES, HAT_KINDS, PANEL_TEMPLATES, SILICON_LIMITS, clampPanelSize, type AccessoryKind, type Allocation, type Appearance, type HatKind, type PersonaAttribute } from './persona.ts';
import type { Engine, Memory, Scenario } from './run.ts';

/** Everything the lab remembers between visits. Runs are not stored: they are exported or rerun. */
export type LabConfig = {
  version: 1;
  template: string;
  attributes: PersonaAttribute[];
  size: number;
  allocation: Allocation;
  seed: number;
  background: string;
  overrides: Record<string, { appearance?: Appearance; background?: string }>;
  designSource: 'studio' | 'example';
  scenarios: Scenario[];
  memory: Memory;
  shuffleOptions: boolean;
  engine: Engine;
  models: string[];
  expectations: Expectation[];
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function defaultConfig(): LabConfig {
  return {
    version: 1, template: 'students', attributes: clone(PANEL_TEMPLATES.students.attributes), size: 24, allocation: 'quota', seed: 2026,
    background: '', overrides: {}, designSource: 'example', scenarios: clone(EXAMPLE_SCENARIOS), memory: 'carry', shuffleOptions: true,
    engine: 'demo', models: [], expectations: clone(EXAMPLE_EXPECTATIONS),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => typeof v === 'string' && v.length <= max ? v : null;

function appearance(v: unknown): Appearance | null {
  if (!isObject(v)) return null;
  const { hue, hat, accessory, hair, height } = v;
  if (typeof hue !== 'number' || !Number.isInteger(hue) || hue < 0 || hue >= FIGURE_PALETTE.length) return null;
  if (typeof hair !== 'number' || !Number.isInteger(hair) || hair < 0 || hair >= HAIR_TONES.length) return null;
  if (typeof hat !== 'string' || !Object.hasOwn(HAT_KINDS, hat)) return null;
  if (typeof accessory !== 'string' || !Object.hasOwn(ACCESSORY_KINDS, accessory)) return null;
  if (typeof height !== 'number' || !(height >= 0.8 && height <= 1.2)) return null;
  return { hue, hat: hat as HatKind, accessory: accessory as AccessoryKind, hair, height };
}

function attributes(v: unknown): PersonaAttribute[] | null {
  if (!Array.isArray(v) || v.length > SILICON_LIMITS.attributes) return null;
  const out: PersonaAttribute[] = [];
  for (const a of v) {
    if (!isObject(a) || !Array.isArray(a.levels) || a.levels.length > SILICON_LIMITS.levels) return null;
    const key = text(a.key, 40), label = text(a.label, SILICON_LIMITS.label * 2);
    if (!key || label === null) return null;
    const levels = a.levels.map(l => isObject(l) && text(l.value, 80) !== null && text(l.label, 80) !== null && typeof l.weight === 'number' && Number.isFinite(l.weight) ? { value: l.value as string, label: l.label as string, weight: l.weight } : null);
    if (levels.some(l => !l)) return null;
    out.push({ key, label, levels: levels as PersonaAttribute['levels'] });
  }
  return out;
}

function ref(v: unknown): VarRef | null {
  if (!isObject(v)) return null;
  if (v.kind === 'question' && text(v.id, 120)) return { kind: 'question', id: v.id as string };
  if (v.kind === 'attribute' && text(v.key, 40)) return { kind: 'attribute', key: v.key as string };
  return null;
}

/** Restore a stored config field by field; anything malformed falls back to the default for that field. */
export function parseConfig(raw: string | null): LabConfig {
  const base = defaultConfig();
  if (!raw) return base;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return base; }
  if (!isObject(v) || v.version !== 1) return base;
  const attrs = attributes(v.attributes);
  const scenarios = Array.isArray(v.scenarios) && v.scenarios.length <= SILICON_LIMITS.scenarios
    ? v.scenarios.map(s => isObject(s) && text(s.id, 40) && text(s.label, 40) !== null && text(s.text, 200) !== null ? { id: s.id as string, label: s.label as string, text: s.text as string } : null) : null;
  const expectations = Array.isArray(v.expectations) && v.expectations.length <= 12
    ? v.expectations.map(e => { if (!isObject(e)) return null; const a = ref(e.a), b = ref(e.b); return a && b && text(e.id, 60) && (e.direction === 'positive' || e.direction === 'negative') ? { id: e.id as string, a, b, direction: e.direction, note: text(e.note, 200) ?? '' } as Expectation : null; }) : null;
  const overrides: LabConfig['overrides'] = {};
  if (isObject(v.overrides)) for (const [id, o] of Object.entries(v.overrides).slice(0, SILICON_LIMITS.personas * 2)) {
    if (!isObject(o) || id.length > 80) continue;
    const look = o.appearance === undefined ? undefined : appearance(o.appearance);
    const bg = o.background === undefined ? undefined : text(o.background, SILICON_LIMITS.background);
    if (look === null || bg === null) continue;
    overrides[id] = { ...(look ? { appearance: look } : {}), ...(bg !== undefined ? { background: bg } : {}) };
  }
  return {
    version: 1,
    template: typeof v.template === 'string' && Object.hasOwn(PANEL_TEMPLATES, v.template) ? v.template : base.template,
    attributes: attrs && attrs.length ? attrs : base.attributes,
    size: typeof v.size === 'number' ? clampPanelSize(v.size) : base.size,
    allocation: v.allocation === 'random' ? 'random' : 'quota',
    seed: typeof v.seed === 'number' && Number.isInteger(v.seed) && v.seed >= 0 && v.seed < 2 ** 31 ? v.seed : base.seed,
    background: text(v.background, SILICON_LIMITS.background) ?? '',
    overrides,
    designSource: v.designSource === 'studio' ? 'studio' : 'example',
    scenarios: scenarios && scenarios.every(Boolean) ? scenarios as Scenario[] : base.scenarios,
    memory: v.memory === 'independent' ? 'independent' : 'carry',
    shuffleOptions: v.shuffleOptions !== false,
    engine: v.engine === 'model' ? 'model' : 'demo',
    models: Array.isArray(v.models) ? v.models.filter((m): m is string => typeof m === 'string' && m.length <= 80).slice(0, SILICON_LIMITS.models) : [],
    expectations: expectations && expectations.every(Boolean) ? expectations as Expectation[] : base.expectations,
  };
}
