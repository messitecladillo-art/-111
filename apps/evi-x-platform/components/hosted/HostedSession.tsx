'use client';
import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { parseSession, type Session } from '@evix/shared';
import { errorMessage, hostedRequest } from './api-client';

type MutationReadOptions = { maxBytes?: number; timeoutMs?: number; signal?: AbortSignal };
type HostedContext = { session: Session | null; loading: boolean; error: string; identityEpoch: number; refresh: () => Promise<Session>; accept: (session: Session) => void; announce: () => void; logout: () => Promise<void>; isCurrentAccount:(ownerId:string,capturedEpoch:number)=>boolean; setUnsaved: (key: string, dirty: boolean) => void; getDraft:(key:string)=>unknown; cacheDraft:(key:string,value:unknown,changed:boolean,ownerId:string)=>void; navigate: (path: string) => boolean; mutate: (path: string, body?: unknown, method?: string, options?: MutationReadOptions) => Promise<unknown> };
export function clearPreviousKnowledgeCache(previous: string | null, next: string | null, storage: Pick<Storage, 'removeItem'>) {
  if (!previous || previous === next) return;
  for (const prefix of ['evix.knowledge.sync.v1:', 'evix.knowledge.lookup.v1:', 'evix.knowledge.term-request.v1:']) storage.removeItem(prefix + encodeURIComponent(previous));
}
const Context = createContext<HostedContext | null>(null);
export function useHostedSession(): HostedContext { const value = useContext(Context); if (!value) throw Error('缺少账号上下文。'); return value; }
export function HostedSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname(), locationRef = useRef<{ url: string; state: unknown } | null>(null);
  const router = useRouter(), [session, setSession] = useState<Session | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [identityEpoch, setEpoch] = useState(0);
  const sessionRef = useRef<Session | null>(null), dirty = useRef(new Set<string>()), channel = useRef<BroadcastChannel | null>(null), requestEpoch = useRef(0);
  const identityGeneration = useRef(0);
  const draftCache=useRef(new Map<string,{value:unknown;changed:boolean}>());
  const accept = useCallback((value: Session) => {
    requestEpoch.current++;
    const previous = sessionRef.current?.user?.id || null, next = value.user?.id || null;
    if (previous !== next) {
      // Invalidate old callbacks synchronously, before any keyed child cleanup.
      identityGeneration.current++;
      try { clearPreviousKnowledgeCache(previous, next, sessionStorage); } catch { /* Optional account-scoped recovery cache. */ }
      setEpoch(identityGeneration.current); dirty.current.clear(); draftCache.current.clear();
    }
    sessionRef.current = value; setSession(value); setError(''); setLoading(false);
  }, []);
  const announce = useCallback(() => { channel.current?.postMessage('changed'); }, []);
  const refresh = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    try { const value = parseSession(await hostedRequest('/api/session')); if (epoch === requestEpoch.current) accept(value); return value; }
    catch (e) { if (epoch === requestEpoch.current) { setError(errorMessage(e)); setLoading(false); } throw e; }
  }, [accept]);
  useEffect(() => { const counter = requestEpoch; void refresh().catch(() => {}); const c = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('evix-hosted-account-v1'); channel.current = c; if (c) c.onmessage = e => { if (e.data === 'changed') void refresh().catch(() => {}); }; return () => { counter.current++; c?.close(); channel.current = null; }; }, [refresh]);
  useEffect(() => { locationRef.current = { url: location.href, state: history.state }; }, [pathname]);
  useEffect(() => {
    const focus = () => { void refresh().catch(() => {}); };
    let acceptedTraversal: string | null = null;
    const back = (event: PopStateEvent) => {
      const previous = locationRef.current;
      const alreadyAccepted = acceptedTraversal === location.href;
      acceptedTraversal = null;
      if (!alreadyAccepted && previous && dirty.current.size && new URL(previous.url).pathname !== location.pathname && !window.confirm('有未保存的修改，是否返回？本标签页会保留草稿，再次进入项目可恢复。')) {
        event.stopImmediatePropagation(); history.pushState(previous.state, '', previous.url); return;
      }
      locationRef.current = { url: location.href, state: history.state };
    };
    const navigation=(window as unknown as {navigation?:EventTarget}).navigation;
    const traversal=(event:Event)=>{const e=event as Event&{navigationType?:string;destination?:{url:string}};acceptedTraversal=null;if(e.navigationType==='traverse'&&e.cancelable&&dirty.current.size&&e.destination&&new URL(e.destination.url).pathname!==location.pathname){if(!window.confirm('有未保存的修改，是否返回？本标签页会保留草稿，再次进入项目可恢复。'))e.preventDefault();else acceptedTraversal=e.destination.url;}};
    navigation?.addEventListener('navigate',traversal);
    window.addEventListener('focus', focus); window.addEventListener('pageshow', focus); window.addEventListener('popstate', back, true);
    return () => { navigation?.removeEventListener('navigate',traversal);window.removeEventListener('focus', focus); window.removeEventListener('pageshow', focus); window.removeEventListener('popstate', back, true); };
  }, [refresh]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirty.current.size||Array.from(draftCache.current.values()).some(d=>d.changed)) { e.preventDefault(); e.returnValue = ''; } };
    const click = (e: MouseEvent) => {
      if (!dirty.current.size || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest('a[href]'); if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const next = new URL(link.href); if (next.origin !== location.origin || next.pathname === location.pathname) return;
      if (!window.confirm('有未保存的修改，是否离开？本标签页会保留草稿，再次进入项目可恢复。')) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, []);
  const setUnsaved = useCallback((key: string, changed: boolean) => { if (changed) dirty.current.add(key); else dirty.current.delete(key); }, []);
  const getDraft=useCallback((key:string)=>draftCache.current.get(key)?.value,[]);
  const isCurrentAccount=useCallback((ownerId:string,capturedEpoch:number)=>sessionRef.current?.user?.id===ownerId&&identityGeneration.current===capturedEpoch,[]);
  const cacheDraft=useCallback((key:string,value:unknown,changed:boolean,ownerId:string)=>{if(sessionRef.current?.user?.id===ownerId)draftCache.current.set(key,{value,changed});},[]);
  const navigate = useCallback((path: string) => { if (dirty.current.size && !window.confirm('有未保存的修改，是否离开？本标签页会保留草稿，再次进入项目可恢复。')) return false; router.push(path); return true; }, [router]);
  const mutate = useCallback(async (path: string, body?: unknown, method = 'POST', options: MutationReadOptions = {}) => {
    const current = sessionRef.current;
    const generation = identityGeneration.current;
    if (!current?.authenticated || !current.csrfToken) throw Error('请先完成邮箱登录。');
    const value = await hostedRequest(path, { ...options, body, method, csrfToken: current.csrfToken });
    if (identityGeneration.current !== generation || sessionRef.current?.user?.id !== current.user?.id || sessionRef.current?.csrfToken !== current.csrfToken) throw Error('账号状态已经变化，这次回执未应用。请刷新核对。');
    return value;
  }, []);
  const logout = useCallback(async () => {
    if ((dirty.current.size||Array.from(draftCache.current.values()).some(d=>d.changed)) && !window.confirm('退出将清除本标签页未保存的草稿。请先保存或下载备份，确认退出？')) return;
    await mutate('/api/auth/logout'); accept({ authenticated: false, mode: sessionRef.current?.mode || 'production' }); channel.current?.postMessage('changed'); router.push('/login');
  }, [accept, mutate, router]);
  return <Context.Provider value={{ session, loading, error, identityEpoch, refresh, accept, announce, logout, isCurrentAccount, setUnsaved, getDraft,cacheDraft,navigate, mutate }}><Fragment key={identityEpoch}>{children}</Fragment></Context.Provider>;
}
