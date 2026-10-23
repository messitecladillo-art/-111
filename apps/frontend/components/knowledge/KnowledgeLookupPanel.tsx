'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { errorMessage, HostedApiError } from '@/components/hosted/api-client';
import { parseKnowledgeLookup, type KnowledgeLookupWire } from '@/lib/knowledge/api-contracts';
import { confirmedKnowledgeQuery, isKnownLookupRejection, parseStoredKnowledgeLookup, type StoredKnowledgeLookup } from '@/lib/knowledge/account-sync';
import { KNOWLEDGE_DOMAINS } from '@/lib/knowledge/types';
import styles from './Knowledge.module.css';

type TermIntent = { accountId: string; idempotencyKey: string; term: string; domain: string; note: string };
const lookupCacheKey = (accountId: string) => `evix.knowledge.lookup.v1:${encodeURIComponent(accountId)}`;
const termCacheKey = (accountId: string) => `evix.knowledge.term-request.v1:${encodeURIComponent(accountId)}`;
const shortSeed = (value: string) => { try { return confirmedKnowledgeQuery(value); } catch { return ''; } };
function readLookup(accountId: string) {
  try { return parseStoredKnowledgeLookup(sessionStorage.getItem(lookupCacheKey(accountId)), accountId); } catch { return null; }
}
function storeLookup(value: StoredKnowledgeLookup | null, accountId: string) {
  try { if (value) sessionStorage.setItem(lookupCacheKey(accountId), JSON.stringify(value)); else sessionStorage.removeItem(lookupCacheKey(accountId)); } catch { /* Optional recovery locator; no source pages or OCR files. */ }
}
function readTerm(accountId: string): TermIntent | null {
  try {
    const raw = sessionStorage.getItem(termCacheKey(accountId)); if (!raw || raw.length > 4000) return null;
    const value = JSON.parse(raw) as TermIntent;
    if (value.accountId !== accountId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.idempotencyKey) || confirmedKnowledgeQuery(value.term) !== value.term || typeof value.domain !== 'string' || value.domain.length > 60 || typeof value.note !== 'string' || value.note.length > 500 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value.note) || Object.keys(value).some(key => !['accountId', 'idempotencyKey', 'term', 'domain', 'note'].includes(key))) return null;
    return value;
  } catch { return null; }
}
function termReceipt(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('补词申请回执无效。');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !['id', 'status', 'createdAt'].includes(key)) || typeof row.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id) || row.status !== 'submitted' || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) throw Error('补词申请回执无效。');
  return row;
}
const statusLabel = (status: KnowledgeLookupWire['status']) => ({ queued: '已排队', running: '正在查证', ready: '查证完成', failed: '本次查证未完成', outcome_unknown: '调用待核对' })[status];
function lookupError(code: string | null) {
  if (code === 'lookup_rate_limited') return '检索服务暂时繁忙，可以稍后重试。';
  if (code === 'lookup_rejected') return '检索服务没有接受这次请求。';
  if (code === 'lookup_usage_unknown') return '结果已返回，用量仍待核对。';
  if (code === 'lookup_usage_anomaly') return '服务用量与预留额度不一致，正在等待核对。';
  return '这次调用的完整结果尚未确认。';
}

/** A closed panel performs no lookup. Every external query is edited and explicitly submitted. */
export default function KnowledgeLookupPanel({ initialQuery = '', purpose = 'knowledge', onLookupReady }: { initialQuery?: string; purpose?: 'knowledge'|'topics'; onLookupReady?: (receipt: KnowledgeLookupWire) => void }) {
  const auth = useHostedSession();
  const accountId = auth.session?.authenticated ? auth.session.user?.id ?? null : null;
  const identity = useRef(accountId);
  useLayoutEffect(() => { identity.current = accountId; }, [accountId]);
  const epoch = useRef(0), request = useRef<StoredKnowledgeLookup | null>(null), active = useRef<AbortController | null>(null), busyGuard = useRef(false);
  const termRequest = useRef<TermIntent | null>(null), termBusy = useRef(false);
  const completedTerm = useRef<TermIntent | null>(null);
  const [stateAccount, setStateAccount] = useState(accountId), [query, setQuery] = useState(() => shortSeed(initialQuery)), [receipt, setReceipt] = useState<KnowledgeLookupWire | null>(null);
  const [pending, setPending] = useState<StoredKnowledgeLookup | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [term, setTerm] = useState(() => shortSeed(initialQuery)), [domain, setDomain] = useState(''), [note, setNote] = useState(''), [termStatus, setTermStatus] = useState(''), [termWorking, setTermWorking] = useState(false), [termUnknown, setTermUnknown] = useState(false);
  const owned = stateAccount === accountId;
  useEffect(() => {
    const fence = epoch;
    const token = ++epoch.current;
    active.current?.abort(); active.current = null; busyGuard.current = false; termBusy.current = false;
    const saved = accountId ? readLookup(accountId) : null, savedTerm = accountId ? readTerm(accountId) : null;
    request.current = saved; termRequest.current = savedTerm; completedTerm.current = null;
    queueMicrotask(() => {
      if (token !== epoch.current) return;
      setStateAccount(accountId); setPending(saved); setReceipt(null); setBusy(false); setNotice('');
      setQuery(saved?.query ?? shortSeed(initialQuery)); setTerm(savedTerm?.term ?? shortSeed(initialQuery)); setDomain(savedTerm?.domain ?? ''); setNote(savedTerm?.note ?? ''); setTermWorking(false); setTermUnknown(Boolean(savedTerm)); setTermStatus(savedTerm ? '有待核对的补词申请。' : '');
    });
    return () => {
      fence.current++; active.current?.abort(); active.current = null;
      if (accountId && identity.current !== accountId) { storeLookup(null, accountId); try { sessionStorage.removeItem(termCacheKey(accountId)); } catch { /* Optional cache. */ } }
    };
    // initialQuery is a user-chosen starting term; subsequent changes must not replace an edited query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, auth.identityEpoch]);
  async function runLookup(reconcile = false) {
    if (!accountId) { setNotice('登录后可联网查证。'); return; }
    if (busyGuard.current) return;
    let operation: StoredKnowledgeLookup;
    try {
      if (reconcile && request.current?.accountId === accountId) operation = request.current;
      else {
        if (request.current && !['ready', 'failed'].includes(request.current.status ?? 'running')) return;
        operation = { schemaVersion: 1, accountId, idempotencyKey: crypto.randomUUID(), query: confirmedKnowledgeQuery(query), status: 'running' };
      }
    } catch (error) { setNotice(errorMessage(error)); return; }
    const token = epoch.current, controller = new AbortController(); active.current = controller; busyGuard.current = true;
    request.current = operation; storeLookup(operation, accountId); setPending(operation); if (!reconcile) setReceipt(null); setBusy(true); setNotice(reconcile ? '正在核对回执…' : '正在提交检索…');
    try {
      const raw = operation.receiptId && reconcile
        ? await auth.mutate(`/api/knowledge/lookups/${operation.receiptId}`, undefined, 'GET', { signal: controller.signal, maxBytes: 20000 })
        : await auth.mutate('/api/knowledge/lookups', { query: operation.query, idempotencyKey: operation.idempotencyKey }, 'POST', { signal: controller.signal, maxBytes: 20000 });
      const result = parseKnowledgeLookup(raw);
      if (token !== epoch.current || identity.current !== accountId) return;
      if (result.query !== operation.query || (operation.receiptId && result.id !== operation.receiptId)) throw Error('查证回执与本次检索不一致。');
      const saved: StoredKnowledgeLookup = { ...operation, receiptId: result.id, status: result.status === 'queued' ? 'running' : result.status };
      request.current = saved; storeLookup(saved, accountId); setPending(saved); setReceipt(result); setNotice(''); if (result.status === 'ready') onLookupReady?.(result);
    } catch (error) {
      if (token !== epoch.current || identity.current !== accountId) return;
      const rejected = error instanceof HostedApiError && isKnownLookupRejection(error.status, error.code, Boolean(operation.receiptId));
      if (rejected) { request.current = null; storeLookup(null, accountId); setPending(null); setNotice(errorMessage(error)); }
      else { const saved: StoredKnowledgeLookup = { ...operation, status: 'outcome_unknown' }; request.current = saved; storeLookup(saved, accountId); setPending(saved); setNotice(error instanceof HostedApiError && error.status === 409 ? '请求标识发生冲突，已保留本次记录，请联系管理员核对。' : '检索回执未到达，请核对本次请求。'); }
    } finally { if (token === epoch.current) { busyGuard.current = false; setBusy(false); } if (active.current === controller) active.current = null; }
  }
  async function sendTerm(reconcile = false) {
    if (!accountId) { setTermStatus('登录后可提交补词申请。'); return; }
    if (termBusy.current) return;
    let operation: TermIntent;
    try {
      if (reconcile && termRequest.current?.accountId === accountId) operation = termRequest.current;
      else {
        if (termRequest.current) return;
        const cleanNote = note.trim();
        if (cleanNote.length > 500 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(cleanNote)) throw Error('备注请使用不超过 500 字的单行说明。');
        operation = { accountId, idempotencyKey: crypto.randomUUID(), term: confirmedKnowledgeQuery(term), domain, note: cleanNote };
        if (completedTerm.current?.accountId === accountId && completedTerm.current.term === operation.term && completedTerm.current.domain === operation.domain && completedTerm.current.note === operation.note) { setTermStatus('这个补词申请已经收到。'); return; }
      }
    } catch (error) { setTermStatus(errorMessage(error)); return; }
    termBusy.current = true; termRequest.current = operation;
    try { sessionStorage.setItem(termCacheKey(accountId), JSON.stringify(operation)); } catch { /* Optional recovery cache. */ }
    const token = epoch.current; setTermWorking(true); setTermStatus('正在提交申请…');
    try {
      termReceipt(await auth.mutate('/api/knowledge/term-requests', { idempotencyKey: operation.idempotencyKey, term: operation.term, domain: operation.domain, note: operation.note }, 'POST', { maxBytes: 2000 }));
      if (token !== epoch.current || identity.current !== accountId) return;
      completedTerm.current = operation; termRequest.current = null; setTermUnknown(false); setTermStatus('补词申请已收到。');
      try { sessionStorage.removeItem(termCacheKey(accountId)); } catch { /* Optional cache. */ }
    } catch (error) {
      if (token !== epoch.current || identity.current !== accountId) return;
      if (error instanceof HostedApiError && isKnownLookupRejection(error.status, error.code)) {
        termRequest.current = null; setTermUnknown(false); setTermStatus(errorMessage(error)); try { sessionStorage.removeItem(termCacheKey(accountId)); } catch { /* Optional cache. */ }
      } else { setTermUnknown(true); setTermStatus('申请回执未到达，请核对本次申请。'); }
    } finally { if (token === epoch.current) { termBusy.current = false; setTermWorking(false); } }
  }
  const unresolved = owned && pending && !['ready', 'failed'].includes(pending.status ?? 'running');
  const shownReceipt = owned ? receipt : null;
  return <details className={styles.recognition}>
    <summary>{purpose === 'topics' ? '检索最新热点' : '联网查证与补词'}</summary>
    <p className={styles.caption}>{purpose === 'topics' ? '编辑地区、领域与时间范围，查找新的公开线索。' : '内置知识没有覆盖时，查阅原始来源。'}</p>
    {purpose==='topics'&&<button type="button" disabled={busy||Boolean(unresolved)} onClick={()=>setQuery(shortSeed(initialQuery))}>使用当前地区与方向</button>}
    <label className={styles.fileInput}>确认检索词<div className={styles.searchBox}><input aria-label="联网检索词" value={owned ? query : ''} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="输入简短的概念或问题" disabled={busy || Boolean(unresolved)}/></div></label>
    <div className={styles.entryActions}>
      <button type="button" disabled={busy || Boolean(unresolved)} onClick={() => void runLookup()}>{busy ? '提交中…' : '确认检索'}</button>
      {owned && pending && <button type="button" disabled={busy} onClick={() => void runLookup(true)}>{unresolved ? '核对本次请求' : '查看检索回执'}</button>}
    </div>
    {owned && notice && <p role="status" className={styles.notice}>{notice}</p>}
    {shownReceipt && <section aria-label="联网查证结果">
      <p className={styles.eyebrow}><span>{statusLabel(shownReceipt.status)}</span><span>{shownReceipt.credits === null ? '用量待核对' : `${shownReceipt.credits} credit`}</span></p>
      <p className={styles.meta}>检索词：{shownReceipt.query}<br/>{shownReceipt.finishedAt ? `回执时间：${new Date(shownReceipt.finishedAt).toLocaleString('zh-CN')}` : `请求时间：${new Date(shownReceipt.createdAt).toLocaleString('zh-CN')}`}</p>
      {shownReceipt.errorCode && <p className={styles.notice} role="status">{lookupError(shownReceipt.errorCode)}</p>}
      {shownReceipt.results.map((result, index) => <div className={styles.source} key={`${result.url}-${index}`}><a href={result.url} target="_blank" rel="noopener noreferrer">{result.title || new URL(result.url).hostname} ↗</a><p className={styles.sourceSnippet}>{result.snippet}</p>{result.snippet.length>180&&<details className={styles.sourceExcerpt}><summary>展开来源片段</summary><p>{result.snippet}</p></details>}<small>{new URL(result.url).hostname}</small></div>)}
      {shownReceipt.status === 'ready' && shownReceipt.results.length === 0 && <p className={styles.empty}>本次没有找到匹配来源，可调整检索词。</p>}
    </section>}
    {purpose === 'knowledge' && <details className={styles.recognition}>
      <summary>申请收录一个概念</summary>
      <label className={styles.fileInput}>概念名称<div className={styles.searchBox}><input aria-label="补词名称" value={owned ? term : ''} maxLength={120} onChange={event => setTerm(event.target.value)} disabled={termWorking || termUnknown} placeholder="中文、英文或常用缩写"/></div></label>
      <label className={styles.fileInput}>所属学科<select aria-label="补词学科" value={owned ? domain : ''} onChange={event => setDomain(event.target.value)} disabled={termWorking || termUnknown}><option value="">暂不确定</option>{Object.entries(KNOWLEDGE_DOMAINS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className={styles.fileInput}>使用场景（选填）<div className={styles.searchBox}><input aria-label="补词使用场景" value={owned ? note : ''} maxLength={500} onChange={event => setNote(event.target.value)} disabled={termWorking || termUnknown} placeholder="在哪个环节遇到这个概念"/></div></label>
      <div className={styles.entryActions}><button type="button" disabled={termWorking} onClick={() => void sendTerm(termUnknown)}>{termWorking ? '提交中…' : termUnknown ? '核对本次申请' : '提交补词申请'}</button></div>
      {owned && termStatus && <p role="status" className={styles.notice}>{termStatus}</p>}
    </details>}
  </details>;
}
