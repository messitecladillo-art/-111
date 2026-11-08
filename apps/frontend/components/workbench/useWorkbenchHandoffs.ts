'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { createWorkbenchHandoffs, type WorkbenchChannel, type WorkbenchHandoffs } from '@/lib/workbench-handoffs';

/** One in-memory exchange per mounted account/project, never a global event bus. */
export function useWorkbenchHandoffs(scope: string, identityScope = scope) {
  const [cache,setCache]=useState(()=>({identity:identityScope,stores:new Map<string,WorkbenchHandoffs>()}));
  const available=cache.identity===identityScope?cache.stores:new Map<string,WorkbenchHandoffs>();
  let store=available.get(scope);
  if(!store){store=createWorkbenchHandoffs(scope);setCache({identity:identityScope,stores:new Map([...available,[scope,store]])});}
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { store, snapshot };
}

/**
 * Bind a consumer's existing completion callback to the delivery it rendered.
 * An old callback cannot clear a later delivery, even when the business ID repeats.
 */
export function useHandoffAcknowledgement(
  store: WorkbenchHandoffs,
  channel: WorkbenchChannel,
  deliveryId: string | undefined,
) {
  return useCallback(() => {
    if (deliveryId) store.acknowledge(channel, deliveryId);
  }, [store, channel, deliveryId]);
}
