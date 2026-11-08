import type { Service } from '@evix/shared';
import { MODEL_CALL_IDS, MODEL_CALLS, isModelCallId, type ModelCallId } from './research-stages.ts';

/** Existing paid tasks; capability names are shared with the API's service contract. */
export const MODEL_TASKS = ['research', 'questionnaire', 'report'] as const;
export type ModelTask = typeof MODEL_TASKS[number];
/** Secret-free invalidation; consumers reread canonical service receipts under their own account. */
export const MODEL_SERVICES_UPDATED = 'evix:model-services-updated';
export type ModelPreferences = Readonly<Partial<Record<ModelTask, string>>>;
export type ModelRoute = {
  task: ModelTask;
  capability: ModelTask;
  service: Service | null;
  reason: 'selected' | 'only_eligible' | 'stale_selection' | 'unselected' | 'no_eligible';
};
export type ModelConsentBinding = { owner: string; identityEpoch: number; serviceId: string; serviceRevision: number };
export type StageModelPreferences = Readonly<{
  schemaVersion: 2;
  defaultServiceId?: string;
  tasks: ModelPreferences;
  steps: Readonly<Partial<Record<ModelCallId, string>>>;
  /** A malformed versioned preference must not silently select a different paid destination. */
  invalid?: true;
}>;
export type StageModelRoute = ModelRoute & {
  stepId: ModelCallId;
  selectionSource: 'step' | 'capability' | 'default' | 'implicit' | null;
};

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isTask = (value: unknown): value is ModelTask => MODEL_TASKS.includes(value as ModelTask);
const EMPTY: ModelPreferences = Object.freeze({});
const EMPTY_STEPS = Object.freeze({});
const EMPTY_STAGE: StageModelPreferences = Object.freeze({ schemaVersion: 2, tasks: EMPTY, steps: EMPTY_STEPS });
const INVALID_STAGE: StageModelPreferences = Object.freeze({ ...EMPTY_STAGE, invalid: true });

function dataFields(value: unknown): Record<string, PropertyDescriptor> | null {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !Object.hasOwn(fields[key], 'value'))) return null;
  return fields;
}

function references<Key extends string>(value: unknown, accepts: (key: unknown) => key is Key): Readonly<Partial<Record<Key, string>>> | null {
  const fields = dataFields(value);
  if (!fields) return null;
  const result: Partial<Record<Key, string>> = {};
  for (const key of Object.keys(fields)) {
    if (!accepts(key) || !isUuid(fields[key].value)) return null;
    result[key] = fields[key].value;
  }
  return Object.freeze(result);
}

/** Version 1 was a flat map of capability defaults; both formats use the existing account key. */
export function parseStageModelPreferences(value: unknown): StageModelPreferences {
  const fields = dataFields(value);
  if (!fields) return INVALID_STAGE;
  if (!Object.hasOwn(fields, 'schemaVersion')) {
    const tasks = references(value, isTask);
    return tasks ? Object.freeze({ schemaVersion: 2, tasks, steps: EMPTY_STEPS }) : INVALID_STAGE;
  }
  if (fields.schemaVersion.value !== 2 || Object.keys(fields).some(key => !['schemaVersion', 'defaultServiceId', 'tasks', 'steps'].includes(key))) return INVALID_STAGE;
  const tasks = references(fields.tasks?.value, isTask), steps = references(fields.steps?.value, isModelCallId);
  if (!tasks || !steps || (fields.defaultServiceId && !isUuid(fields.defaultServiceId.value))) return INVALID_STAGE;
  return Object.freeze({ schemaVersion: 2, ...(fields.defaultServiceId ? { defaultServiceId: fields.defaultServiceId.value as string } : {}), tasks, steps });
}

/** Preferences hold references only: never service configuration, credentials or arbitrary fields. */
export function parseModelPreferences(value: unknown): ModelPreferences {
  return parseStageModelPreferences(value).tasks;
}

export function eligibleModelServices(task: ModelTask, services: readonly Service[]): Service[] {
  return isTask(task) ? services.filter(service => service.capabilities.includes(task)) : [];
}

/** An explicit choice never changes destination silently, even when only one other service remains. */
export function resolveModelRoute(task: ModelTask, services: readonly Service[], preferences: ModelPreferences): ModelRoute {
  const eligible = eligibleModelServices(task, services);
  if (Object.hasOwn(preferences, task)) {
    const selected = eligible.find(service => service.id === preferences[task]) ?? null;
    return { task, capability: task, service: selected, reason: selected ? 'selected' : 'stale_selection' };
  }
  if (eligible.length === 1) return { task, capability: task, service: eligible[0], reason: 'only_eligible' };
  return { task, capability: task, service: null, reason: eligible.length ? 'unselected' : 'no_eligible' };
}

/** Resolve a real existing model call, not a deterministic workflow stage. */
export function resolveStageModelRoute(stepId: ModelCallId, services: readonly Service[], preferences: StageModelPreferences): StageModelRoute {
  const task = MODEL_CALLS[stepId]?.capability;
  if (!task) throw new TypeError('Unknown model call');
  const base = { task, capability: task, stepId };
  if (preferences.invalid) return { ...base, service: null, reason: 'stale_selection', selectionSource: null };
  const source = Object.hasOwn(preferences.steps, stepId) ? 'step'
    : Object.hasOwn(preferences.tasks, task) ? 'capability'
      : preferences.defaultServiceId !== undefined ? 'default' : null;
  const selected = source === 'step' ? preferences.steps[stepId]
    : source === 'capability' ? preferences.tasks[task] : preferences.defaultServiceId;
  if (source) {
    const service = eligibleModelServices(task, services).find(item => item.id === selected) ?? null;
    return { ...base, service, reason: service ? 'selected' : 'stale_selection', selectionSource: source };
  }
  return { ...resolveModelRoute(task, services, preferences.tasks), stepId, selectionSource: 'implicit' };
}

/** A card from a previous account, login epoch or edited service requires fresh consent. */
export function matchesModelConsent(binding: ModelConsentBinding | undefined, owner: string | null, identityEpoch: number, service: Service | null): boolean {
  return !!binding && !!service && isUuid(owner) && isUuid(service.id)
    && Number.isSafeInteger(identityEpoch) && identityEpoch >= 0
    && Number.isSafeInteger(service.revision) && service.revision >= 1
    && binding.owner === owner && binding.identityEpoch === identityEpoch
    && binding.serviceId === service.id && binding.serviceRevision === service.revision;
}

const PREFIX = 'evix.agent.model-routing.v1:';
const snapshots = new Map<string, StageModelPreferences>();
type PreferenceChange = { kind: 'default'; value: string | null }
  | { kind: 'task'; key: ModelTask; value: string | null }
  | { kind: 'step'; key: ModelCallId; value: string | null };
// A quota error can deny writes while reads still succeed. Retain field-level edits, including removals.
const unsaved = new Map<string, Map<string, PreferenceChange>>();
const listeners = new Set<() => void>();
let listeningWindow: Window | null = null;
const sameTasks = (left: ModelPreferences, right: ModelPreferences) => MODEL_TASKS.every(task => left[task] === right[task]);
const same = (left: StageModelPreferences, right: StageModelPreferences) => left.invalid === right.invalid
  && left.defaultServiceId === right.defaultServiceId && sameTasks(left.tasks, right.tasks)
  && MODEL_CALL_IDS.every(step => left.steps[step] === right.steps[step]);
const notify = () => { for (const listener of listeners) listener(); };

function applyChanges(saved: StageModelPreferences, changes: Iterable<PreferenceChange>): StageModelPreferences {
  const tasks = { ...saved.tasks }, steps = { ...saved.steps };
  let defaultServiceId = saved.defaultServiceId;
  for (const change of changes) {
    if (change.kind === 'default') defaultServiceId = change.value ?? undefined;
    else if (change.kind === 'task') {
      if (change.value === null) delete tasks[change.key]; else tasks[change.key] = change.value;
    } else {
      if (change.value === null) delete steps[change.key]; else steps[change.key] = change.value;
    }
  }
  return Object.freeze({ schemaVersion: 2, ...(defaultServiceId ? { defaultServiceId } : {}),
    tasks: sameTasks(tasks, saved.tasks) ? saved.tasks : Object.freeze(tasks), steps: Object.freeze(steps) });
}

function readStorage(owner: string): StageModelPreferences {
  let raw: string | null;
  try { raw = window.localStorage.getItem(PREFIX + owner); }
  catch { return snapshots.get(owner) ?? EMPTY_STAGE; }
  let saved: StageModelPreferences;
  try { saved = raw === null ? EMPTY_STAGE : parseStageModelPreferences(JSON.parse(raw)); }
  catch { saved = INVALID_STAGE; }
  const pending = unsaved.get(owner);
  if (!pending) return saved;
  return applyChanges(saved, pending.values());
}

function listen() {
  if (typeof window === 'undefined' || listeningWindow === window) return;
  listeningWindow = window;
  window.addEventListener('storage', event => {
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
    catch { return; }
    const owners = event.key === null ? [...snapshots.keys()]
      : event.key.startsWith(PREFIX) ? [event.key.slice(PREFIX.length)] : [];
    let changed = false;
    for (const owner of owners) {
      const previous = snapshots.get(owner);
      if (!previous) continue;
      const next = readStorage(owner);
      if (!same(previous, next)) { snapshots.set(owner, next); changed = true; }
    }
    if (changed) notify();
  });
}

/** Stable snapshots for useSyncExternalStore; checking an account never exposes another one's choice. */
export function getModelPreferences(owner: string | null): ModelPreferences {
  return getStageModelPreferences(owner).tasks;
}

export function getStageModelPreferences(owner: string | null): StageModelPreferences {
  if (typeof window === 'undefined' || !isUuid(owner)) return EMPTY_STAGE;
  listen();
  const existing = snapshots.get(owner);
  if (existing) return existing;
  const saved = readStorage(owner);
  snapshots.set(owner, saved);
  return saved;
}

export const getServerModelPreferences = (): ModelPreferences => EMPTY;
export const getServerStageModelPreferences = (): StageModelPreferences => EMPTY_STAGE;

export function subscribeModelPreferences(listener: () => void): () => void {
  listen();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A null service clears only this task; denied storage leaves a working account-scoped in-memory choice. */
export function setModelPreference(owner: string | null, task: ModelTask, serviceId: string | null): void {
  if (typeof window === 'undefined' || !isUuid(owner) || !isTask(task) || (serviceId !== null && !isUuid(serviceId))) return;
  updatePreference(owner, { kind: 'task', key: task, value: serviceId });
}

export function setDefaultModelPreference(owner: string | null, serviceId: string | null): void {
  if (typeof window === 'undefined' || !isUuid(owner) || (serviceId !== null && !isUuid(serviceId))) return;
  updatePreference(owner, { kind: 'default', value: serviceId });
}

export function setStageModelPreference(owner: string | null, step: ModelCallId, serviceId: string | null): void {
  if (typeof window === 'undefined' || !isUuid(owner) || !isModelCallId(step) || (serviceId !== null && !isUuid(serviceId))) return;
  updatePreference(owner, { kind: 'step', key: step, value: serviceId });
}

function updatePreference(owner: string, change: PreferenceChange): void {
  const previous = getStageModelPreferences(owner);
  // Merge another tab's unrelated settings even if its storage event has not arrived.
  const saved = readStorage(owner), next = applyChanges(saved, [change]);
  if (same(previous, next) && same(saved, next) && !unsaved.has(owner)) return;
  const changed = !same(previous, next), snapshot = changed ? next : previous;
  snapshots.set(owner, snapshot);
  const pending = unsaved.get(owner) ?? new Map<string, PreferenceChange>();
  pending.set(change.kind === 'default' ? 'default' : `${change.kind}:${change.key}`, change);
  unsaved.set(owner, pending);
  try {
    // Keep capability-only storage compatible with existing v1 clients and legacy tests.
    const stored = snapshot.defaultServiceId === undefined && !Object.keys(snapshot.steps).length ? snapshot.tasks : snapshot;
    window.localStorage.setItem(PREFIX + owner, JSON.stringify(stored));
    unsaved.delete(owner);
  } catch { /* Pending edits remain usable and merge with future storage reads. */ }
  if (changed) notify();
}
