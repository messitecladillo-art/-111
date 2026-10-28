import type { Service } from '@evix/shared';

/** Existing paid tasks; capability names are shared with the API's service contract. */
export const MODEL_TASKS = ['research', 'questionnaire', 'report'] as const;
export type ModelTask = typeof MODEL_TASKS[number];
export type ModelPreferences = Readonly<Partial<Record<ModelTask, string>>>;
export type ModelRoute = {
  task: ModelTask;
  capability: ModelTask;
  service: Service | null;
  reason: 'selected' | 'only_eligible' | 'stale_selection' | 'unselected' | 'no_eligible';
};
export type ModelConsentBinding = { owner: string; identityEpoch: number; serviceId: string; serviceRevision: number };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isTask = (value: unknown): value is ModelTask => MODEL_TASKS.includes(value as ModelTask);
const EMPTY: ModelPreferences = Object.freeze({});

/** Preferences hold references only: never service configuration, credentials or arbitrary fields. */
export function parseModelPreferences(value: unknown): ModelPreferences {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return EMPTY;
  const fields = Object.getOwnPropertyDescriptors(value);
  const next: Partial<Record<ModelTask, string>> = {};
  for (const key of Reflect.ownKeys(fields)) {
    if (!isTask(key)) return EMPTY;
    const field = fields[key];
    if (!Object.hasOwn(field, 'value') || !isUuid(field.value)) return EMPTY;
    next[key] = field.value;
  }
  return Object.keys(next).length ? Object.freeze(next) : EMPTY;
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

/** A card from a previous account, login epoch or edited service requires fresh consent. */
export function matchesModelConsent(binding: ModelConsentBinding | undefined, owner: string | null, identityEpoch: number, service: Service | null): boolean {
  return !!binding && !!service && isUuid(owner) && isUuid(service.id)
    && Number.isSafeInteger(identityEpoch) && identityEpoch >= 0
    && Number.isSafeInteger(service.revision) && service.revision >= 1
    && binding.owner === owner && binding.identityEpoch === identityEpoch
    && binding.serviceId === service.id && binding.serviceRevision === service.revision;
}

const PREFIX = 'evix.agent.model-routing.v1:';
const snapshots = new Map<string, ModelPreferences>();
// A quota error can deny writes while reads still succeed. Keep those task changes, including deletions.
const unsaved = new Map<string, Partial<Record<ModelTask, string | null>>>();
const listeners = new Set<() => void>();
let listeningWindow: Window | null = null;
const same = (left: ModelPreferences, right: ModelPreferences) => MODEL_TASKS.every(task => left[task] === right[task]);
const notify = () => { for (const listener of listeners) listener(); };

function readStorage(owner: string): ModelPreferences {
  let raw: string | null;
  try { raw = window.localStorage.getItem(PREFIX + owner); }
  catch { return snapshots.get(owner) ?? EMPTY; }
  let saved: ModelPreferences;
  try { saved = parseModelPreferences(JSON.parse(raw ?? 'null')); }
  catch { saved = EMPTY; }
  const pending = unsaved.get(owner);
  if (!pending) return saved;
  const merged = { ...saved };
  for (const task of MODEL_TASKS) {
    if (!Object.hasOwn(pending, task)) continue;
    const choice = pending[task];
    if (choice === null) delete merged[task]; else if (choice !== undefined) merged[task] = choice;
  }
  return parseModelPreferences(merged);
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
  if (typeof window === 'undefined' || !isUuid(owner)) return EMPTY;
  listen();
  const existing = snapshots.get(owner);
  if (existing) return existing;
  const saved = readStorage(owner);
  snapshots.set(owner, saved);
  return saved;
}

export const getServerModelPreferences = (): ModelPreferences => EMPTY;

export function subscribeModelPreferences(listener: () => void): () => void {
  listen();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A null service clears only this task; denied storage leaves a working account-scoped in-memory choice. */
export function setModelPreference(owner: string | null, task: ModelTask, serviceId: string | null): void {
  if (typeof window === 'undefined' || !isUuid(owner) || !isTask(task) || (serviceId !== null && !isUuid(serviceId))) return;
  const previous = getModelPreferences(owner);
  // A different tab may have saved another task before its storage event reached this one.
  const saved = readStorage(owner), next = { ...saved };
  if (serviceId === null) delete next[task]; else next[task] = serviceId;
  if (same(previous, next) && same(saved, next) && !unsaved.has(owner)) return;
  const changed = !same(previous, next), snapshot = changed ? parseModelPreferences(next) : previous;
  snapshots.set(owner, snapshot);
  unsaved.set(owner, { ...unsaved.get(owner), [task]: serviceId });
  try {
    window.localStorage.setItem(PREFIX + owner, JSON.stringify(snapshot));
    unsaved.delete(owner);
  } catch { /* Pending task changes remain usable and merge with future storage reads. */ }
  if (changed) notify();
}
