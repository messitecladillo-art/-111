import type { AgentQuestionnaireProposal } from './agent-questionnaire-proposal.ts';
import type { DatasetValue } from './canvas/execute.ts';
import type { DiagnosisBriefSource } from './diagnosis-actions.ts';
import type { ReportProposal } from './project-report.ts';
import type { DesignSnapshot, DesignTransfer } from './questionnaire-mapping.ts';
import type { ResultSnapshot } from './research-quality.ts';
import type { ResultRegistration } from './result-registration.ts';
import type { DatasetTransfer } from './survey-collection.ts';

/** Delivery identity is independent of any business ID inside the payload. */
export type Envelope<T> = Readonly<{ deliveryId: string; payload: T }>;
export type WorkbenchPayloads = {
  design: DesignTransfer;
  dataset: DatasetTransfer;
  brief: DiagnosisBriefSource;
  questionnaire: AgentQuestionnaireProposal;
  result: ResultSnapshot | ResultRegistration;
  report: ReportProposal;
};
export type WorkbenchChannel = keyof WorkbenchPayloads;
export type WorkbenchPending = {
  readonly [Channel in WorkbenchChannel]: Envelope<WorkbenchPayloads[Channel]> | null;
};
export type WorkbenchSnapshot = Readonly<{
  scope: string;
  design: DesignSnapshot | null;
  dataset: DatasetValue | null;
  pending: WorkbenchPending;
}>;
export type WorkbenchHandoffs = Readonly<{
  getSnapshot: () => WorkbenchSnapshot;
  subscribe: (listener: () => void) => () => void;
  publish: <Channel extends WorkbenchChannel>(channel: Channel, payload: WorkbenchPayloads[Channel]) => string;
  acknowledge: (channel: WorkbenchChannel, deliveryId: string) => boolean;
  setDesign: (snapshot: DesignSnapshot | null) => void;
  setDataset: (dataset: DatasetValue | null) => void;
}>;
export type WorkbenchHandoffOptions = {
  /** Test seam; the factory must return a fresh delivery ID on each call. */
  makeId?: () => string;
};

/** Payload contracts consist of records and arrays. Freeze every level after copying. */
function snapshotValue<T>(value: T): T {
  const copy = structuredClone(value);
  const seen = new WeakSet<object>();
  function freeze(item: unknown): void {
    if (item === null || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  }
  freeze(copy);
  return copy;
}

/**
 * One in-memory workbench instance. Each channel keeps its latest unacknowledged
 * delivery; publishing replaces that slot, while an old acknowledgement is a no-op.
 * The owner creates a new store when its workbench scope changes.
 */
export function createWorkbenchHandoffs(
  scope: string,
  { makeId = () => crypto.randomUUID() }: WorkbenchHandoffOptions = {},
): WorkbenchHandoffs {
  let snapshot: WorkbenchSnapshot = Object.freeze({
    scope,
    design: null,
    dataset: null,
    pending: Object.freeze({
      design: null,
      dataset: null,
      brief: null,
      questionnaire: null,
      result: null,
      report: null,
    }),
  });
  const listeners = new Set<() => void>();

  function update(next: WorkbenchSnapshot): void {
    snapshot = Object.freeze(next);
    // Snapshot subscriptions so changes to the set during notification do not
    // re-run a listener or notify a newly added listener about a previous update.
    for (const listener of [...listeners]) listener();
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish<Channel extends WorkbenchChannel>(channel: Channel, payload: WorkbenchPayloads[Channel]) {
      if (!Object.hasOwn(snapshot.pending, channel)) throw new Error('Unknown workbench handoff channel.');
      const copiedPayload = snapshotValue(payload);
      const deliveryId = makeId();
      const envelope = Object.freeze({ deliveryId, payload: copiedPayload });
      update({ ...snapshot, pending: Object.freeze({ ...snapshot.pending, [channel]: envelope }) });
      return deliveryId;
    },
    acknowledge(channel: WorkbenchChannel, deliveryId: string) {
      if (!Object.hasOwn(snapshot.pending, channel)) return false;
      const current = snapshot.pending[channel];
      if (!current || current.deliveryId !== deliveryId) return false;
      update({ ...snapshot, pending: Object.freeze({ ...snapshot.pending, [channel]: null }) });
      return true;
    },
    setDesign(value: DesignSnapshot | null) {
      if (snapshot.design === value) return;
      update({ ...snapshot, design: snapshotValue(value) });
    },
    setDataset(value: DatasetValue | null) {
      if (snapshot.dataset === value) return;
      update({ ...snapshot, dataset: snapshotValue(value) });
    },
  });
}
