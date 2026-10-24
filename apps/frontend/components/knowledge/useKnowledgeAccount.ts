'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { createKnowledgeAccountSync, emptyKnowledgeAccount, isFavoriteReference, type KnowledgeAccountSnapshot } from '@/lib/knowledge/account-sync';
import type { KnowledgePreferencesWire } from '@/lib/knowledge/api-contracts';
import type { KnowledgeEntry } from '@/lib/knowledge/types';
export function accountBoundRecoveryStorage(actual: Pick<Storage,'getItem'|'setItem'|'removeItem'>, accountId: string | null, capturedEpoch: number, isCurrentAccount: (id:string,epoch:number)=>boolean) {
  const active = () => !!accountId && isCurrentAccount(accountId, capturedEpoch);
  return { getItem:(key:string)=>active()?actual.getItem(key):null,
    setItem:(key:string,value:string)=>{if(active())actual.setItem(key,value);},
    removeItem:(key:string)=>{if(active())actual.removeItem(key);} };
}

/** Mount once in the shared knowledge host. Identity changes clear all visible private state. */
export default function useKnowledgeAccount() {
  const auth = useHostedSession();
  const accountId = auth.session?.authenticated ? auth.session.user?.id ?? null : null;
  const identity = useRef(accountId), mutate = auth.mutate, isCurrentAccount = auth.isCurrentAccount;
  const identityEpoch = auth.identityEpoch;
  useLayoutEffect(() => { identity.current = accountId; }, [accountId]);
  const sync = useRef<ReturnType<typeof createKnowledgeAccountSync> | null>(null);
  const [snapshot, setSnapshot] = useState<KnowledgeAccountSnapshot>(() => emptyKnowledgeAccount());
  useEffect(() => {
    let storage: Pick<Storage,'getItem'|'setItem'|'removeItem'> | null = null;
    try {
      const actual = sessionStorage;
      storage = accountBoundRecoveryStorage(actual,accountId,identityEpoch,isCurrentAccount);
    } catch { /* Optional account-scoped draft cache. */ }
    const controller = createKnowledgeAccountSync({
      storage, debounceMs: 800,
      read: signal => mutate('/api/me/knowledge-state', undefined, 'GET', { signal, maxBytes: 100000 }),
      write: (payload, signal) => mutate('/api/me/knowledge-state', payload, 'PUT', { signal, maxBytes: 100000 }),
    });
    sync.current = controller;
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()));
    void controller.setIdentity(accountId);
    return () => { unsubscribe(); controller.dispose(identity.current !== accountId); if (sync.current === controller) sync.current = null; };
  }, [accountId, identityEpoch, mutate, isCurrentAccount]);
  const setFavorite = useCallback((entry: Pick<KnowledgeEntry, 'id' | 'version'>, enabled?: boolean) => sync.current?.setFavorite(entry, enabled), []);
  const recordVisit = useCallback((entry: Pick<KnowledgeEntry, 'id' | 'version'>) => sync.current?.recordVisit(entry), []);
  const updatePrefs = useCallback((patch: KnowledgePreferencesWire) => sync.current?.updatePrefs(patch), []);
  const reload = useCallback(async () => { await sync.current?.reload(); }, []);
  const reconcile = useCallback(async () => { await sync.current?.reconcile(); }, []);
  const discardLocalAndReload = useCallback(async () => { await sync.current?.discardLocalAndReload(); }, []);
  // This render guard precedes effect cleanup, so even a single frame cannot show another account.
  const current = snapshot.accountId === accountId ? snapshot : emptyKnowledgeAccount(accountId);
  return { ...current, setFavorite, recordVisit, updatePrefs, reload, reconcile, discardLocalAndReload,
    isFavorite: (entry: Pick<KnowledgeEntry, 'id' | 'version'>) => isFavoriteReference(current.state.favorites, entry) };
}
