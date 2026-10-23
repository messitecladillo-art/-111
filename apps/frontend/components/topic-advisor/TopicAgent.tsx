'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { parseCollection, parseService, type Service } from '@evix/shared';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { errorMessage, hostedRequest, HostedApiError } from '@/components/hosted/api-client';
import KnowledgeLookupPanel from '@/components/knowledge/KnowledgeLookupPanel';
import { useWorkbenchTheme } from '@/components/workbench/shell-kit';
import { parseKnowledgeLookup, type KnowledgeLookupWire } from '@/lib/knowledge/api-contracts';
import { profileFingerprint, recommendTopics, type TopicProfile } from '@/lib/topic-advisor';
import { stableStringify } from '@/lib/topic-advisor/parse';
import { TOPIC_BUNDLE } from '@/lib/topic-advisor/client-bundle';
import { TOPIC_SOURCE_VERSIONS, topicGeographyLabel, type TopicRefinement } from '@/lib/topic-proposal';
import { freezeTopicAgentRequest, inferTopicAgentIntent, knownTopicAgentRejection, parseTopicAgentConversation, parseTopicAgentPending, parseTopicAgentTurn, proposeTopicProfile, runLocalTopicAgent, topicAgentContinuationCandidates, topicAgentConversationResumable, topicAgentScopeQuery, verifyTopicAgentTurn, type AgentIntent, type TopicAgentPending, type TopicAgentTurn } from '@/lib/topic-agent';
import styles from './TopicAgent.module.css';

export type TopicAgentProps = { profile: TopicProfile; projectId?: string | null; cacheNamespace?: string; readOnly?: boolean; onChoose?: (item: TopicRefinement, profile: TopicProfile, turn?: TopicAgentTurn) => void; onProfileChange?: (profile: TopicProfile) => void };
type Entry = { turn: TopicAgentTurn; context: string };
type Pending = TopicAgentPending;
type LookupEvidence = { receipt: KnowledgeLookupWire; context: string };
type LookupBinding = { context: string; epoch: number };
type AgentDraft = { ownerId: string; namespace: string; projectId?: string | null; local: Entry[]; model: Entry[]; pending: Pending | null; message: string; inputVersion: number; lookup?: LookupEvidence | null };
const INTENTS: Array<{ id: AgentIntent; label: string }> = [{ id: 'recommend', label: '发现方向' }, { id: 'compare', label: '比较潜力' }, { id: 'refine', label: '细化问题' }, { id: 'plan', label: '验证计划' }];
const TOOL_NAMES = { context: '核对调研条件', catalog: '检索研究方向', feasibility: '检查可行性', sources: '核对资料来源', draft: '组织研究提案' };
const TURN_STATUS = { running: '正在处理', ready: '已返回', failed: '未完成', outcome_unknown: '结果待核对' };
const PROMPTS = ['结合我所在的地区，推荐可以实际开展的研究方向', '比较这些方向的研究价值和实施难度', '把研究问题缩小到可以调查的人群和情境', '给我一份第一周的选题验证计划'];
const copy = <T,>(value: T): T => structuredClone(value);
function profileKey(profile: TopicProfile) { try { return profileFingerprint(profile); } catch { return ''; } }
function ready(entries: Entry[]) { return [...entries].reverse().find(entry => entry.turn.status === 'ready')?.turn; }
function paragraphs(value: string) { return value.split(/\n\s*\n/).filter(Boolean); }
function savedLookup(value: unknown): LookupEvidence | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(key => !['receipt', 'context'].includes(key)) || typeof row.context !== 'string' || row.context.length > 30000) return null;
    const receipt = parseKnowledgeLookup(row.receipt);
    return receipt.status === 'ready' ? { receipt: copy(receipt), context: row.context } : null;
  } catch { return null; }
}
function suggestedProfile(profile: TopicProfile, message: string) {
  try { const proposed = proposeTopicProfile(profile, message); return proposed && profileKey(proposed.profile) !== profileKey(profile) ? proposed : null; } catch { return null; }
}
function pendingKey(ownerId: string, namespace: string) { return `evix.topic.agent.pending.v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(namespace)}`; }
function parseScopedPending(raw: unknown, ownerId: string, namespace: string, legacyNamespace: string): Pending | null {
  try { const parsed = parseTopicAgentPending(raw, ownerId, namespace); if (parsed) return parsed; } catch { /* Try only the historical missing-field namespace next. */ }
  if (namespace !== legacyNamespace) { try { const old = parseTopicAgentPending(raw, ownerId, legacyNamespace); if (old && !Object.hasOwn(old.request, 'projectId')) return old; } catch { /* Invalid recovery input remains unapplied. */ } }
  return null;
}
function readPending(ownerId: string, namespace: string, legacyNamespace: string): Pending | null {
  if (!ownerId) return null;
  try { return parseScopedPending(sessionStorage.getItem(pendingKey(ownerId, namespace)), ownerId, namespace, legacyNamespace) ?? (namespace === legacyNamespace ? null : parseScopedPending(sessionStorage.getItem(pendingKey(ownerId, legacyNamespace)), ownerId, namespace, legacyNamespace)); } catch { return null; }
}
function clearPendingOwner(ownerId: string) {
  try { const prefix = `evix.topic.agent.pending.v1:${encodeURIComponent(ownerId)}:`; const keys: string[] = []; for (let index = 0; index < sessionStorage.length; index++) { const key = sessionStorage.key(index); if (key?.startsWith(prefix)) keys.push(key); } keys.forEach(key => sessionStorage.removeItem(key)); } catch { /* Each remaining record is still owner- and project-bound. */ }
}
function sameScope(left?: string | null, right?: string | null) { return (left ?? null) === (right ?? null); }
function continuationIssue(turns: TopicAgentTurn[]) {
  if (turns.some(turn => turn.status === 'failed')) return '这段讨论未完成，保留记录后可以开始新讨论。';
  if (turns.some(turn => turn.status !== 'ready')) return '这段讨论仍有未完成的回执，先核对原调用。';
  if (turns.length >= 12) return '这段讨论已满 12 轮，可以查看记录或开启新讨论。';
  if (turns.some(turn => turn.mode !== 'model')) return '这是资料库研究记录，可以查阅内容；继续研究请使用资料库。';
  return '资料版本已更新。可以保留这段记录，按当前资料开启新讨论。';
}

/** The keyed controller never carries a private conversation into another account/project. */
export default function TopicAgent(props: TopicAgentProps) {
  const auth = useHostedSession(), projectId = props.projectId ?? null, supplied = props.cacheNamespace ?? 'global';
  const namespace = projectId && supplied !== `project:${projectId}` ? `${supplied}:project:${projectId}` : supplied;
  return <TopicAgentSession key={JSON.stringify([auth.session?.user?.id ?? '', auth.identityEpoch, namespace, projectId])} {...props} projectId={projectId} cacheNamespace={namespace} />;
}

function TopicAgentSession({ profile, projectId = null, cacheNamespace = 'global', readOnly = false, onChoose, onProfileChange }: TopicAgentProps) {
  const auth = useHostedSession(), theme = useWorkbenchTheme(), ownerId = auth.session?.user?.id ?? '', identityEpoch = auth.identityEpoch;
  const { getDraft, cacheDraft, setUnsaved, isCurrentAccount } = auth;
  const cacheKey = `topic-agent:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(cacheNamespace)}`;
  const pendingNamespace = projectId ? `project:${projectId}` : 'global';
  const [initial] = useState(() => {
    const value = ownerId ? getDraft(cacheKey) as AgentDraft | undefined : undefined;
    const storedPending = readPending(ownerId, pendingNamespace, cacheNamespace);
    if (!value || value.ownerId !== ownerId || value.namespace !== cacheNamespace || !sameScope(value.projectId, projectId)) return { local: [], model: [], pending: storedPending, message: '', inputVersion: 0, lookup: null };
    try { return { ...value, lookup: savedLookup(value.lookup), pending: parseScopedPending(value.pending, ownerId, pendingNamespace, cacheNamespace) ?? storedPending, local: value.local.slice(-12).map(entry => ({ ...entry, turn: parseTopicAgentTurn(entry.turn) })).filter(entry => sameScope(entry.turn.projectId, projectId)), model: value.model.slice(-12).map(entry => ({ ...entry, turn: parseTopicAgentTurn(entry.turn) })).filter(entry => sameScope(entry.turn.projectId, projectId)) }; } catch { return { local: [], model: [], pending: storedPending, message: '', inputVersion: 0, lookup: null }; }
  });
  const [local, setLocal] = useState<Entry[]>(initial?.local ?? []), [model, setModel] = useState<Entry[]>(initial?.model ?? []);
  const [mode, setMode] = useState<'local' | 'model'>(initial.pending ? 'model' : 'local'), [intent, setIntent] = useState<AgentIntent>(initial.pending?.request.intent ?? 'recommend');
  const [intentExplicit, setIntentExplicit] = useState(false);
  const [inputVersion, setInputVersion] = useState(initial?.inputVersion ?? 0);
  const adoptionEpoch = useRef(inputVersion), binding = useRef('');
  const [message, setMessage] = useState(initial?.message ?? ''), [pending, setPending] = useState<Pending | null>(initial?.pending ?? null);
  const [services, setServices] = useState<Service[]>([]), [serviceId, setServiceId] = useState(initial?.pending?.request.serviceId ?? ''), [servicesLoaded, setServicesLoaded] = useState(false);
  const [chosenIds, setChosenIds] = useState<string[]>([]), [consentStamp, setConsentStamp] = useState('');
  const [lookup, setLookup] = useState<LookupEvidence | null>(initial.lookup ?? null), [includeLookup, setIncludeLookup] = useState(false), [lookupBinding, setLookupBinding] = useState<LookupBinding | null>(null);
  const lookupSequence = useRef(0), lookupGuard = useRef<LookupBinding | null>(null), lookupReference = useRef('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [missingReceipt, setMissingReceipt] = useState(false), [retryStamp, setRetryStamp] = useState('');
  const [history, setHistory] = useState<TopicAgentTurn[]>([]), [historyLoaded, setHistoryLoaded] = useState(false), [inspectedId, setInspectedId] = useState('');
  const [historyConversation, setHistoryConversation] = useState<TopicAgentTurn[] | null>(null), [recoveredLegacy, setRecoveredLegacy] = useState<Pick<TopicAgentTurn, 'id' | 'status'> | null>(null);
  const alive = useRef(true), generation = useRef(0), lock = useRef(false), composing = useRef(false), input = useRef<HTMLTextAreaElement>(null), conversation = useRef<HTMLDivElement>(null);
  const [resumeFocusVersion, setResumeFocusVersion] = useState(0);
  const resumeFocus = useRef<{ ownerId: string; identityEpoch: number; projectId: string | null; epoch: number } | null>(null);
  const scope = useRef({ profile, projectId, readOnly, mode, intent, serviceId, namespace: cacheNamespace });
  useLayoutEffect(() => { scope.current = { profile, projectId, readOnly, mode, intent, serviceId, namespace: cacheNamespace }; }, [profile, projectId, readOnly, mode, intent, serviceId, cacheNamespace]);
  useEffect(() => { alive.current = true; const counter = generation; return () => { alive.current = false; counter.current++; if (ownerId && !isCurrentAccount(ownerId, identityEpoch)) clearPendingOwner(ownerId); }; }, [ownerId, identityEpoch, isCurrentAccount]);
  const current = () => alive.current && (!ownerId || isCurrentAccount(ownerId, identityEpoch));
  const currentWritable = () => current() && !scope.current.readOnly;
  function invalidateAdoption() { adoptionEpoch.current++; setInputVersion(adoptionEpoch.current); }
  const entries = mode === 'local' ? local : model, last = entries[entries.length - 1]?.turn, parent = ready(entries);
  const service = services.find(item => item.id === serviceId), key = profileKey(profile);
  let geography = ''; try { geography = topicGeographyLabel(profile); } catch { /* An unfinished region remains editable in the profile form. */ }
  const latestLocal = ready(local), localCandidates = latestLocal && sameScope(latestLocal.projectId, projectId) && profileKey(latestLocal.profile) === key ? latestLocal.assistant?.items ?? [] : [];
  const candidates = localCandidates.length ? localCandidates : topicAgentContinuationCandidates(profile, model.map(entry => entry.turn));
  const candidateIds = chosenIds.filter(id => candidates.some(candidate => candidate.patternId === id)).slice(0, 3);
  const lookupContext = JSON.stringify([projectId, key, TOPIC_SOURCE_VERSIONS, mode, intent, candidateIds]);
  const lookupCurrent = Boolean(lookup && lookup.context === lookupContext), lookupId = mode === 'model' && lookupCurrent && includeLookup ? lookup?.receipt.id : undefined;
  const lookupSeed = [geography, profile.interests.slice(0, 2).join(' '), candidates.filter(item => candidateIds.includes(item.patternId)).map(item => item.title).join(' '), profile.referenceDate].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 120);
  const context = JSON.stringify([projectId, key, TOPIC_SOURCE_VERSIONS, mode, intent, mode === 'model' ? serviceId : null, mode === 'model' ? service?.revision ?? null : null, mode === 'model' ? candidateIds : [], lookupId ?? null, inputVersion]);
  const consentKey = JSON.stringify([context, message.trim(), candidateIds, parent?.id ?? null]);
  const consented = consentStamp === consentKey;
  const unresolved = Boolean(pending), full = entries.length >= 12;
  const lookupAllowed = Boolean(ownerId && mode === 'model' && !readOnly && !busy && !unresolved);
  const frozenRetryKey = JSON.stringify([pending?.request.idempotencyKey, key, readOnly, inputVersion]);
  useLayoutEffect(() => {
    const next = JSON.stringify([key, readOnly, TOPIC_SOURCE_VERSIONS]);
    if (binding.current && binding.current !== next) { adoptionEpoch.current++; setInputVersion(adoptionEpoch.current); }
    binding.current = next;
  }, [key, readOnly]);
  useLayoutEffect(() => {
    const reference = JSON.stringify([lookupContext, readOnly]);
    if (lookupReference.current && lookupReference.current !== reference) { setIncludeLookup(false); setConsentStamp(''); }
    lookupReference.current = reference;
  }, [lookupContext, readOnly]);
  useLayoutEffect(() => {
    lookupGuard.current = null;
    if (!lookupAllowed) return;
    const next = { context: lookupContext, epoch: ++lookupSequence.current }; lookupGuard.current = next; setLookupBinding(next);
    return () => { if (lookupGuard.current === next) lookupGuard.current = null; };
  }, [lookupContext, lookupAllowed]);

  useEffect(() => {
    if (!ownerId || !isCurrentAccount(ownerId, identityEpoch)) return;
    const dirty = Boolean(message.trim() || pending);
    cacheDraft(cacheKey, { ownerId, namespace: cacheNamespace, projectId, local, model, pending, message, inputVersion, lookup } satisfies AgentDraft, dirty, ownerId);
    setUnsaved(cacheKey, dirty);
    return () => setUnsaved(cacheKey, false);
  }, [ownerId, identityEpoch, isCurrentAccount, cacheDraft, setUnsaved, cacheKey, cacheNamespace, projectId, local, model, pending, message, inputVersion, lookup]);
  useEffect(() => {
    const element = conversation.current; if (!element) return;
    const latest = element.querySelector<HTMLElement>('[data-agent-turn]:last-of-type');
    if (latest && !busy) element.scrollTop += latest.getBoundingClientRect().top - element.getBoundingClientRect().top - 16;
    else if (busy) element.scrollTop = element.scrollHeight;
  }, [local.length, model.length, mode, busy]);
  useEffect(() => {
    const request = resumeFocus.current; if (!request) return;
    if (!alive.current || composing.current || readOnly || scope.current.readOnly || request.epoch !== adoptionEpoch.current || request.ownerId !== ownerId || request.identityEpoch !== identityEpoch || !sameScope(request.projectId, projectId) || !sameScope(request.projectId, scope.current.projectId) || !isCurrentAccount(ownerId, identityEpoch)) { resumeFocus.current = null; return; }
    if (busy) return;
    resumeFocus.current = null;
    const element = input.current; if (!element || element.disabled) return;
    element.focus({ preventScroll: true }); element.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [resumeFocusVersion, busy, ownerId, identityEpoch, projectId, readOnly, isCurrentAccount]);

  function storePending(value: Pending | null) {
    setPending(value);
    if (ownerId && current()) { try { if (value) sessionStorage.setItem(pendingKey(ownerId, value.namespace), JSON.stringify(value)); else sessionStorage.removeItem(pendingKey(ownerId, pending?.namespace ?? pendingNamespace)); } catch { /* The owned server history remains queryable by the frozen nonce. */ } }
    if (ownerId && current()) cacheDraft(cacheKey, { ownerId, namespace: cacheNamespace, projectId, local, model, pending: value, message, inputVersion, lookup } satisfies AgentDraft, Boolean(value || message.trim()), ownerId);
  }
  function accept(turn: TopicAgentTurn, stamp: string) {
    if (!sameScope(turn.projectId, projectId)) { setRecoveredLegacy({ id: turn.id, status: turn.status }); setNotice('旧版独立讨论的调用已核对。完整内容请在独立讨论中查看。'); return; }
    const append = (history: Entry[]) => [...history.filter(entry => entry.turn.id !== turn.id), { turn, context: stamp }].slice(-12);
    if (turn.mode === 'local') setLocal(append); else setModel(append);
  }
  async function loadServices() {
    if (!ownerId || lock.current || !current()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const raw = await hostedRequest('/api/services'); if (!current()) return;
      const list = parseCollection(raw, 'services', parseService, 8).filter(item => item.capabilities.includes('research'));
      setServices(list); setServicesLoaded(true); setServiceId(previous => list.some(item => item.id === previous) ? previous : list[0]?.id ?? ''); setConsentStamp(''); invalidateAdoption();
    } catch (failure) { if (current()) setError(errorMessage(failure)); }
    finally { lock.current = false; if (current()) setBusy(false); }
  }
  async function send() {
    if (lock.current || !currentWritable() || !key || !message.trim() || unresolved || full) return;
    if (mode === 'model' && (!ownerId || !service || !consented || !candidateIds.length)) return;
    lock.current = true; setBusy(true); setError(''); setNotice(''); const attempt = ++generation.current, stamp = context;
    try {
      if (mode === 'local') {
        const turn = await runLocalTopicAgent({ profile: copy(profile), projectId, message: message.trim(), intent, previous: ready(local) });
        if (!current() || generation.current !== attempt) return;
        accept(turn, stamp); setMessage(''); setIntentExplicit(false);
      } else {
        const request = freezeTopicAgentRequest({ profile, projectId, message: message.trim(), intent, candidateIds, parentTurnId: ready(model)?.id ?? null, mode: 'model', serviceId: service!.id, serviceRevision: service!.revision, consent: true, ...(lookupId ? { lookupId } : {}) });
        const operation: Pending = { schemaVersion: 1, ownerId, namespace: pendingNamespace, request, context: stamp, sourceVersions: copy(TOPIC_SOURCE_VERSIONS) }; storePending(operation); setMissingReceipt(false); setRetryStamp('');
        try {
          const raw = await auth.mutate('/api/topic-agent/turns', request, 'POST', { maxBytes: 150000, timeoutMs: 45000 });
          const turn = parseTopicAgentTurn(raw); await verifyTopicAgentTurn(turn, request, operation.sourceVersions);
          if (!current() || generation.current !== attempt) return;
          accept(turn, stamp); if (['ready', 'failed'].includes(turn.status)) storePending(null);
          setMessage(''); setIntentExplicit(false);
        } catch (failure) {
          if (!current() || generation.current !== attempt) return;
          if (failure instanceof HostedApiError && failure.status >= 400 && failure.status < 500 && failure.code !== 'idempotency_conflict' && knownTopicAgentRejection(failure.code)) storePending(null);
          throw failure;
        }
      }
    } catch (failure) { if (current() && generation.current === attempt) setError(errorMessage(failure)); }
    finally { lock.current = false; if (current() && generation.current === attempt) { setBusy(false); setConsentStamp(''); } }
  }
  async function reconcile() {
    if (!pending || !ownerId || lock.current || !current()) return;
    lock.current = true; setBusy(true); setError(''); const operation = pending, attempt = ++generation.current;
    try {
      const raw = await hostedRequest(`/api/topic-agent/turns/${encodeURIComponent(operation.request.idempotencyKey)}${topicAgentScopeQuery(operation.request.projectId)}`, { maxBytes: 150000 });
      const turn = parseTopicAgentTurn(raw); await verifyTopicAgentTurn(turn, operation.request, operation.sourceVersions);
      if (!current() || generation.current !== attempt) return;
      accept(turn, operation.context); setMissingReceipt(false); if (['ready', 'failed'].includes(turn.status)) { storePending(null); setMessage(''); }
      else setNotice('原调用仍待回执，稍后可以继续核对。');
    } catch (failure) { if (current() && generation.current === attempt) { setError(errorMessage(failure)); if (failure instanceof HostedApiError && failure.status === 404 && failure.code === 'not_found') setMissingReceipt(true); } }
    finally { lock.current = false; if (current() && generation.current === attempt) setBusy(false); }
  }
  async function retryFrozen() {
    if (!pending || !missingReceipt || retryStamp !== frozenRetryKey || !currentWritable() || lock.current) return;
    lock.current = true; setBusy(true); setError(''); const operation = pending, attempt = ++generation.current;
    try {
      const raw = await auth.mutate('/api/topic-agent/turns', operation.request, 'POST', { maxBytes: 150000, timeoutMs: 45000 });
      const turn = parseTopicAgentTurn(raw); await verifyTopicAgentTurn(turn, operation.request, operation.sourceVersions);
      if (!current() || generation.current !== attempt) return;
      accept(turn, operation.context); setMissingReceipt(false); if (['ready', 'failed'].includes(turn.status)) storePending(null);
    } catch (failure) { if (current() && generation.current === attempt) { setError(errorMessage(failure)); if (failure instanceof HostedApiError && failure.status >= 400 && failure.status < 500 && failure.code !== 'idempotency_conflict' && knownTopicAgentRejection(failure.code)) storePending(null); } }
    finally { lock.current = false; if (current() && generation.current === attempt) { setBusy(false); setRetryStamp(''); } }
  }
  async function loadHistory() {
    if (!ownerId || lock.current || !current()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const raw = await hostedRequest(`/api/topic-agent/turns${topicAgentScopeQuery(projectId)}`, { maxBytes: 2000000 }) as { turns?: unknown[] };
      if (!Array.isArray(raw.turns) || raw.turns.length > 30) throw Error('会话记录格式无效。');
      const rows = raw.turns.map(parseTopicAgentTurn); if (rows.some(turn => !sameScope(turn.projectId, projectId))) throw Error('会话记录与当前项目不一致。'); if (!current()) return;
      setHistory(rows); setHistoryLoaded(true); setInspectedId(rows[0]?.id ?? ''); setHistoryConversation(null);
    } catch (failure) { if (current()) setError(errorMessage(failure)); }
    finally { lock.current = false; if (current()) setBusy(false); }
  }
  async function inspectReceipt(id: string) {
    if (!ownerId || lock.current || !current()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const turn = parseTopicAgentTurn(await hostedRequest(`/api/topic-agent/turns/${encodeURIComponent(id)}${topicAgentScopeQuery(projectId)}`, { maxBytes: 150000 }));
      if (!current()) return;
      if (turn.id !== id || !sameScope(turn.projectId, projectId)) throw Error('调用记录与目标范围不一致。');
      setHistory(previous => previous.map(row => row.id === id ? turn : row)); setInspectedId(id); setHistoryConversation(null);
    } catch (failure) { if (current()) setError(errorMessage(failure)); }
    finally { lock.current = false; if (current()) setBusy(false); }
  }
  async function restoreConversation(id: string, resume: boolean) {
    if (!ownerId || lock.current || !current() || resume && (unresolved || !currentWritable())) return;
    lock.current = true; setBusy(true); setError(''); const stamp = adoptionEpoch.current;
    try {
      const raw = await hostedRequest(`/api/topic-agent/turns/${encodeURIComponent(id)}/conversation${topicAgentScopeQuery(projectId)}`, { maxBytes: 2000000 });
      const turns = parseTopicAgentConversation(raw, projectId);
      if (turns.at(-1)?.id !== id) throw Error('完整讨论与所选回执不一致。');
      if (!current() || stamp !== adoptionEpoch.current || !sameScope(scope.current.projectId, projectId)) return;
      setHistoryConversation(turns);
      if (!resume) return;
      if (!currentWritable()) return;
      if (!topicAgentConversationResumable(turns, projectId)) { setNotice(continuationIssue(turns)); return; }
      const leaf = turns[turns.length - 1];
      setModel(turns.map(turn => ({ turn, context: `restored:${id}` }))); setMode('model'); if (!message.trim()) { setIntent(leaf.intent); setIntentExplicit(false); } setChosenIds([]); setConsentStamp(''); setServices([]); setServicesLoaded(false); setServiceId(''); invalidateAdoption();
      setNotice('已恢复完整讨论。选择研究模型和候选方向后，可以继续提问。');
      resumeFocus.current = { ownerId, identityEpoch, projectId, epoch: adoptionEpoch.current }; setResumeFocusVersion(value => value + 1);
    } catch (failure) { if (current() && stamp === adoptionEpoch.current) setError(errorMessage(failure)); }
    finally { lock.current = false; if (current()) setBusy(false); }
  }
  function openIndependentRecovery() {
    if (!pending || !current() || sameScope(pending.request.projectId, projectId)) return;
    try {
      const existingRaw = sessionStorage.getItem(pendingKey(ownerId, 'global'));
      const existing = readPending(ownerId, 'global', 'global');
      if (existingRaw && (!existing || existing.request.idempotencyKey !== pending.request.idempotencyKey || stableStringify(existing.request) !== stableStringify(pending.request) || stableStringify(existing.sourceVersions) !== stableStringify(pending.sourceVersions))) throw Error('独立讨论中已有待核对的调用，请先核对那份记录。');
      sessionStorage.setItem(pendingKey(ownerId, 'global'), JSON.stringify({ ...pending, namespace: 'global', context: `recovered-independent:${pending.request.idempotencyKey}` }));
      if (auth.navigate('/workspace#diagnose')) storePending(null);
    } catch (failure) { setError(errorMessage(failure)); }
  }
  function canAdopt(entry: Entry, item: TopicRefinement) {
    if (readOnly || unresolved || busy || !sameScope(entry.turn.projectId, projectId) || entry.turn.id !== last?.id || entry.turn.status !== 'ready' || entry.context !== context || profileKey(entry.turn.profile) !== key || JSON.stringify(entry.turn.sourceVersions) !== JSON.stringify(TOPIC_SOURCE_VERSIONS)) return false;
    try { return recommendTopics(entry.turn.profile, TOPIC_BUNDLE, 50).items.some(row => row.patternId === item.patternId && row.feasibility !== 'blocked'); } catch { return false; }
  }
  function adoptionControl(entry: Entry, item: TopicRefinement, comparison = false) {
    return onChoose && <button type="button" className={styles.primary} aria-label={comparison ? `采用方向：${item.title}` : undefined} disabled={!canAdopt(entry, item)} onClick={() => { if (currentWritable() && inputVersion === adoptionEpoch.current && profileKey(entry.turn.profile) === profileKey(scope.current.profile) && canAdopt(entry, item)) onChoose(copy(item), copy(entry.turn.profile), copy(entry.turn)); }}>采用到研究简报 <span aria-hidden="true">→</span></button>;
  }
  function receiveLookup(raw: KnowledgeLookupWire, expected: LookupBinding) {
    if (!currentWritable() || lock.current || lookupGuard.current !== expected || scope.current.mode !== 'model') return;
    try {
      const receipt = parseKnowledgeLookup(raw); if (receipt.status !== 'ready') return;
      setLookup({ receipt: copy(receipt), context: expected.context }); setIncludeLookup(false); setConsentStamp(''); invalidateAdoption();
    } catch (failure) { setError(errorMessage(failure)); }
  }
  function ask(value: string) { if (!currentWritable() || busy || unresolved) return; setMessage(value.slice(0, 1200)); invalidateAdoption(); setConsentStamp(''); input.current?.focus(); }
  function keyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void send(); }
  }
  const latestSources = last?.sources ?? [];
  const inspected = history.find(turn => turn.id === inspectedId);
  const legacyPending = Boolean(pending && !sameScope(pending.request.projectId, projectId));
  const inspectedConversation = historyConversation?.at(-1)?.id === inspectedId ? historyConversation : null;
  const inspectedResumable = inspectedConversation ? topicAgentConversationResumable(inspectedConversation, projectId) : Boolean(inspected && inspected.status === 'ready' && inspected.mode === 'model' && inspected.turnIndex < 12);
  return <section className={styles.agent} data-theme={theme} data-self-styled aria-label="选题对话 Agent">
    <header className={styles.heading}><div><span className={styles.mark} aria-hidden="true">✧</span><div><h4>一起找到值得研究的问题</h4><p>{geography || '从你的调研条件出发'}{profile.school && ` · ${profile.school}`}</p></div></div><span className={styles.mode}>{mode === 'local' ? '资料库研究' : '个人研究模型'}</span></header>
    <div className={styles.layout}><div className={styles.chat}>
      <div ref={conversation} className={styles.conversation} role="log" aria-label="选题对话记录" aria-live="polite" aria-relevant="additions">
        {!entries.length && <div className={styles.welcome}><span className={styles.eyebrow}>TOPIC RESEARCH AGENT</span><h5>好选题，从一次追问开始。</h5><p>说说你关注的现象。我会查找资料、比较可行性，再和你一起缩小研究范围。</p></div>}
        {entries.map(entry => { const update = suggestedProfile(entry.turn.profile, entry.turn.message), updateAllowed = !readOnly && !busy && !unresolved && entry.turn.id === last?.id && entry.context === context && profileKey(entry.turn.profile) === key; return <article className={styles.turn} data-agent-turn key={entry.turn.id}>
          <div className={styles.userMessage}><span>你</span><p>{entry.turn.message}</p></div>
          <div className={styles.answer}><div className={styles.answerMeta}><strong>选题顾问</strong><span>{TURN_STATUS[entry.turn.status]}{entry.turn.providerMode === 'fixture' ? ' · 合成模型验收' : entry.turn.mode === 'local' ? ' · 资料库' : ' · 个人模型'}</span></div>
            {update && onProfileChange && <div className={styles.profileProposal}><div><b>将你提到的条件带入团队背景</b><ul>{update.changes.map(change => <li key={change}>{change}</li>)}</ul></div><button type="button" disabled={!updateAllowed} onClick={() => { if (currentWritable() && inputVersion === adoptionEpoch.current && entry.context === context && !busy && !unresolved && entry.turn.id === last?.id && profileKey(entry.turn.profile) === profileKey(scope.current.profile)) onProfileChange(copy(update.profile)); }}>更新团队条件</button></div>}
            {entry.turn.tools.length > 0 && <details className={styles.tools}><summary>{entry.turn.tools.filter(tool => tool.status === 'complete').length} 项研究步骤已完成</summary><ol>{entry.turn.tools.map((tool, index) => <li key={`${tool.name}-${index}`}><span data-blocked={tool.status === 'blocked'}>{tool.status === 'complete' ? '✓' : '!'}</span><div><b>{TOOL_NAMES[tool.name]}</b><p>{tool.summary}</p></div></li>)}</ol></details>}
            {entry.turn.assistant ? <><div className={styles.prose}>{paragraphs(entry.turn.assistant.text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
              {entry.turn.assistant.questions.length > 0 && <div className={styles.questions}><span>下一步想确认</span>{entry.turn.assistant.questions.map(question => <button type="button" key={question} disabled={readOnly || busy || unresolved} onClick={() => ask(`${question}\n我的补充：`)}>{question}<i aria-hidden="true">↗</i></button>)}</div>}
              {entry.turn.intent === 'compare' && entry.turn.assistant.items.length >= 2 ? <section className={styles.comparison} aria-label="研究方向对照"><header><h5>方向对照</h5><span>{entry.turn.assistant.items.length} 个拟议方向</span></header><div className={styles.comparisonScroll} role="region" tabIndex={0} aria-label="方向对照表，可横向滚动"><table className={styles.comparisonTable} data-count={entry.turn.assistant.items.length}><caption className={styles.srOnly}>按研究问题、决策价值、待确认条件和第一步验证比较候选方向</caption><colgroup><col className={styles.comparisonDimension} />{entry.turn.assistant.items.map(item => <col key={item.patternId} />)}</colgroup><thead><tr><th scope="col">比较维度</th>{entry.turn.assistant.items.map(item => <th scope="col" key={item.patternId}><span className={styles.proposalLabel}>拟议方向{!canAdopt(entry, item) && ' · 保留供对照'}</span><h6>{item.title}</h6></th>)}</tr></thead><tbody><tr><th scope="row">研究问题</th>{entry.turn.assistant.items.map(item => <td key={item.patternId}>{item.researchQuestion}</td>)}</tr><tr><th scope="row">支持的决定</th>{entry.turn.assistant.items.map(item => <td key={item.patternId}><b className={styles.decisionOwner}>{item.decisionOwner}</b><p>{item.decision}</p></td>)}</tr><tr><th scope="row">待确认条件</th>{entry.turn.assistant.items.map(item => <td key={item.patternId}>{item.unknowns.length ? <ul>{item.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul> : <span className={styles.notProvided}>未列出</span>}</td>)}</tr><tr><th scope="row">第一步验证</th>{entry.turn.assistant.items.map(item => <td key={item.patternId}>{item.firstWeekPlan[0] ?? '未提供'}</td>)}</tr><tr><th scope="row">资料依据</th>{entry.turn.assistant.items.map(item => <td key={item.patternId}><span className={styles.sourceCount}>{item.sourceIds.length} 条资料</span></td>)}</tr>{onChoose && <tr className={styles.comparisonActions}><th scope="row">选择方向</th>{entry.turn.assistant.items.map(item => <td key={item.patternId}>{adoptionControl(entry, item, true)}</td>)}</tr>}</tbody></table></div></section> : <div className={styles.proposals}>{entry.turn.assistant.items.map(item => { const adoptable = canAdopt(entry, item); return <article className={styles.proposal} key={item.patternId}><div className={styles.proposalLabel}>拟议方向{!adoptable && ' · 保留供对照'}</div><h5>{item.title}</h5><p className={styles.researchQuestion}>{item.researchQuestion}</p><dl><dt>适合这里的原因</dt><dd>{item.whyHere}</dd><dt>支持的决定</dt><dd>{item.decisionOwner} · {item.decision}</dd></dl>{entry.turn.intent === 'plan' ? <section className={styles.actionPlan} aria-label="首周验证计划"><header><h6>首周验证计划</h6><span>拟执行</span></header><ol>{item.firstWeekPlan.map((step, index) => <li key={index}>{step}</li>)}</ol>{item.unknowns.length > 0 && <div><b>待确认条件</b><ul>{item.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></div>}</section> : <details><summary>验证计划与待确认条件</summary><ol>{item.firstWeekPlan.map((step, index) => <li key={index}>{step}</li>)}</ol>{item.unknowns.length > 0 && <ul>{item.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul>}</details>}<footer><span>{item.sourceIds.length} 条资料依据</span>{adoptionControl(entry, item)}</footer></article>; })}</div>}
            </> : <p className={styles.turnError}>{entry.turn.status === 'running' ? '请求已接收，等待返回研究提案。' : entry.turn.status === 'outcome_unknown' ? '调用可能已处理，请先核对原请求。' : `这轮未完成${entry.turn.errorCode ? `（${entry.turn.errorCode}）` : ''}。`}</p>}
          </div>
        </article>; })}
        {busy && <p role="status" className={styles.activity}>{mode === 'local' ? '正在检索资料与核对条件…' : '正在等待服务回执…'}</p>}
      </div>
      {unresolved && <div className={styles.pending} role="status"><div><strong>原调用结果待核对</strong><span>核对只读取回执，不会重新调用模型。</span></div><button type="button" disabled={busy} onClick={() => void reconcile()}>核对原请求</button></div>}
      {pending && legacyPending && <div className={styles.recovery}><strong>旧版独立讨论的待核对调用</strong><p>这份调用未绑定项目，完整内容在独立讨论中保留。</p><button type="button" disabled={busy} onClick={openIndependentRecovery}>到独立讨论核对</button></div>}
      {pending && missingReceipt && !legacyPending && <div className={styles.recovery}><strong>服务器暂未找到原回执</strong><details><summary>查看冻结的原材料</summary><p>{pending.request.message}</p><p>地区：{pending.request.profile.city || pending.request.profile.region || '未限定'} · 模型配置 v{pending.request.serviceRevision}</p></details><label><input type="checkbox" aria-label="确认按原材料重试同一请求" checked={retryStamp === frozenRetryKey} disabled={busy || readOnly} onChange={event => setRetryStamp(event.target.checked ? frozenRetryKey : '')} />确认按原材料重试同一请求，使用原模型额度。</label><button type="button" disabled={busy || readOnly || retryStamp !== frozenRetryKey} onClick={() => void retryFrozen()}>重试原请求</button></div>}
      {recoveredLegacy && <p className={styles.notice} role="status">旧版独立讨论 · {TURN_STATUS[recoveredLegacy.status]} · {recoveredLegacy.id.slice(0, 8)} <Link href="/workspace#diagnose">查看独立讨论 ↗</Link></p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
      <div className={styles.composer}>
        <div className={styles.intents} aria-label="这轮研究目标">{INTENTS.map((item, index) => <button type="button" key={item.id} aria-pressed={intent === item.id} disabled={readOnly || busy || unresolved} onClick={() => { setIntent(item.id); setIntentExplicit(true); if (!message.trim()) ask(PROMPTS[index]); else invalidateAdoption(); setConsentStamp(''); }}>{item.label}</button>)}</div>
        <label className={styles.srOnly} htmlFor={`topic-agent-message-${encodeURIComponent(cacheNamespace)}`}>告诉选题顾问你的想法</label>
        <textarea ref={input} id={`topic-agent-message-${encodeURIComponent(cacheNamespace)}`} rows={2} maxLength={1200} disabled={readOnly || busy || unresolved || full} value={message} placeholder="你关注什么现象？希望帮助谁作出怎样的决定？" onChange={event => { setMessage(event.target.value); if (!intentExplicit) setIntent(inferTopicAgentIntent(event.target.value)); invalidateAdoption(); setConsentStamp(''); }} onKeyDown={keyboard} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
        <div className={styles.composerActions}><div><span>{readOnly ? '当前项目为只读' : full ? '本轮已满 12 次，可开始新对话' : 'Enter 发送 · Shift Enter 换行'}</span>{entries.length > 0 && <button type="button" disabled={busy || unresolved || readOnly} onClick={() => { if (mode === 'local') setLocal([]); else setModel([]); setMessage(''); setConsentStamp(''); setNotice(''); }}>新对话</button>}</div><button type="button" className={styles.send} disabled={readOnly || busy || unresolved || full || !key || !message.trim() || mode === 'model' && (!ownerId || !service || !consented || !candidateIds.length)} onClick={() => void send()}>{busy ? '处理中…' : '发送'}<span aria-hidden="true">↑</span></button></div>
      </div>
    </div><aside className={styles.sidebar} aria-label="选题研究依据">
      <section className={styles.context}><span className={styles.eyebrow}>当前调研条件</span><h5>{geography || '地区尚未限定'}</h5><dl><div><dt>可投入时间</dt><dd>{profile.days === null ? '待确认' : `${profile.days} 天`}</dd></div><div><dt>预算</dt><dd>{profile.budgetYuan === null ? '待确认' : `${profile.budgetYuan} 元`}</dd></div><div><dt>已确认渠道</dt><dd>{Object.values(profile.access).filter(value => value === 'confirmed').length} 项</dd></div></dl><p>修改左侧条件后，新一轮对话会按新条件重新核对。</p></section>
      <details className={styles.modelSettings}><summary>研究方式<span>{mode === 'local' ? '资料库' : '个人模型'}</span></summary><div className={styles.modeChoices}><button type="button" aria-pressed={mode === 'local'} disabled={busy || unresolved || readOnly} onClick={() => { setMode('local'); invalidateAdoption(); setConsentStamp(''); }}>资料库研究</button><button type="button" aria-pressed={mode === 'model'} disabled={busy || unresolved || readOnly} onClick={() => { setMode('model'); invalidateAdoption(); setConsentStamp(''); }}>个人模型</button></div>
        {mode === 'model' && (!ownerId ? <p><Link href="/login">登录</Link>后接入研究模型。</p> : <><button type="button" disabled={busy || unresolved} onClick={() => void loadServices()}>{servicesLoaded ? '刷新研究模型' : '读取我的研究模型'}</button>{servicesLoaded && <label className={styles.service}>研究模型<select aria-label="选题 Agent 研究模型" value={serviceId} disabled={busy || unresolved || readOnly} onChange={event => { setServiceId(event.target.value); invalidateAdoption(); setConsentStamp(''); }}><option value="">选择模型服务</option>{services.map(item => <option key={item.id} value={item.id}>{item.label} · {item.provider} · v{item.revision}</option>)}</select></label>}<Link href="/services">管理模型服务 ↗</Link><div className={styles.candidateChoices}><b>发送给模型的研究方向</b>{!candidates.length ? <p>先使用资料库整理方向，再选择要深入的候选。</p> : candidates.map(item => <label key={item.patternId}><input type="checkbox" checked={candidateIds.includes(item.patternId)} disabled={busy || unresolved || readOnly || !candidateIds.includes(item.patternId) && candidateIds.length >= 3} onChange={event => { setChosenIds(previous => event.target.checked ? [...previous, item.patternId].slice(0, 3) : previous.filter(id => id !== item.patternId)); invalidateAdoption(); setConsentStamp(''); }} />{item.title}</label>)}</div><section className={styles.lookup} aria-label="选题公开来源检索"><header><b>公开来源</b><span>用于模型研究</span></header>
          {lookupAllowed && lookupBinding?.context === lookupContext ? <KnowledgeLookupPanel key={`${lookupBinding.context}:${lookupBinding.epoch}`} initialQuery={lookupSeed} purpose="topics" onLookupReady={receipt => receiveLookup(receipt, lookupBinding)} /> : <p>{readOnly ? '当前项目为只读' : unresolved ? '核对原调用后可继续检索' : '等待本轮完成后可继续检索'}</p>}
          {lookup && <div className={styles.lookupReceipt}><label><input type="checkbox" aria-label="将检索回执用于本轮模型" checked={Boolean(lookupId)} disabled={!lookupCurrent || !lookup.receipt.results.length || readOnly || busy || unresolved} onChange={event => { if (!currentWritable() || lock.current || !lookupCurrent) return; setIncludeLookup(event.target.checked); setConsentStamp(''); invalidateAdoption(); }} />采用这份检索 · {lookup.receipt.results.length} 条来源</label><p>检索词：{lookup.receipt.query}</p>{!lookupCurrent && <p>研究条件已变更，请重新确认相关来源。</p>}<details><summary>查看来源与回执</summary><span>{lookup.receipt.finishedAt ? new Date(lookup.receipt.finishedAt).toLocaleString('zh-CN') : ''} · {lookup.receipt.credits} credit</span>{lookup.receipt.results.map((source, index) => <article key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || new URL(source.url).hostname} ↗</a><p>{source.snippet}</p></article>)}</details></div>}
        </section><details className={styles.payload}><summary>本次发送范围</summary><p>左侧调研条件、所选方向、这轮问题及最多 6 轮已保存的模型对话。</p></details><label className={styles.consent}><input type="checkbox" aria-label="确认选题 Agent 模型调用" checked={consented} disabled={busy || unresolved || readOnly || !service || !candidateIds.length || !message.trim()} onChange={event => setConsentStamp(event.target.checked ? consentKey : '')} />{auth.session?.mode === 'local_test' ? '使用合成模型验收本轮提案' : '确认发送并使用我的模型额度'}</label></>)}
      </details>
      {ownerId && <details className={styles.history}><summary>{projectId ? '当前项目讨论' : '我的独立讨论'}</summary><button type="button" disabled={busy} onClick={() => void loadHistory()}>{historyLoaded ? '刷新会话记录' : '查找会话记录'}</button>{historyLoaded && !history.length && <p>尚无已保存的会话记录。</p>}{history.length > 0 && <ol>{history.map(turn => <li key={turn.id}><button type="button" aria-pressed={inspectedId === turn.id} disabled={busy} onClick={() => void inspectReceipt(turn.id)}><span>{TURN_STATUS[turn.status]}</span><span className={styles.historySnippet}>{turn.message.replace(/\s+/g, ' ').trim()}</span><time>{new Date(turn.createdAt).toLocaleString('zh-CN')}</time></button></li>)}</ol>}{inspected && <article className={styles.historyReceipt} aria-label="历史选题回执"><strong>{TURN_STATUS[inspected.status]}{inspected.providerMode === 'fixture' && ' · 合成模型验收'}</strong><p>{inspected.message}</p>{inspected.assistant && <><p>{inspected.assistant.text}</p><ul>{inspected.assistant.items.map(item => <li key={item.patternId}>{item.title}</li>)}</ul></>}{inspected.errorCode && <p>{inspected.errorCode}</p>}<span>只读回执 · {inspected.sources.length} 条依据</span><div className={styles.historyActions}><button type="button" disabled={busy} onClick={() => void restoreConversation(inspected.id, false)}>查看完整讨论</button><button type="button" className={styles.primary} disabled={busy || readOnly || unresolved || !inspectedResumable} onClick={() => void restoreConversation(inspected.id, true)}>继续这段讨论</button></div>{inspectedConversation && !inspectedResumable && <p>{continuationIssue(inspectedConversation)}</p>}</article>}{inspectedConversation && <section className={styles.historyConversation} aria-label="历史选题完整讨论"><header><strong>完整讨论 · {inspectedConversation.length} 轮</strong><span>只读记录</span></header><ol>{inspectedConversation.map(turn => <li key={turn.id}><b>第 {turn.turnIndex} 轮 · {TURN_STATUS[turn.status]}</b><p>{turn.message}</p>{turn.assistant && <><p>{turn.assistant.text}</p><ul>{turn.assistant.items.map(item => <li key={item.patternId}>{item.title}</li>)}</ul></>}<span>{turn.tools.length} 项研究步骤 · {turn.sources.length} 条依据</span></li>)}</ol></section>}</details>}
      <section className={styles.sources}><div><span className={styles.eyebrow}>本轮资料</span><span>{latestSources.length}</span></div>{latestSources.length ? latestSources.map(source => <details key={source.id}><summary>{source.title}</summary><p>{source.authority} · {source.coverage === 'fulltext' ? '全文资料' : source.coverage === 'listing_only' ? '公告题录' : source.coverage === 'search_excerpt' ? '网页片段' : '参考资料'}</p>{source.locator && <p>{source.locator}</p>}{source.snippet && <p>{source.snippet}</p>}{source.url && <a href={source.url} target="_blank" rel="noopener noreferrer">查看出处 ↗</a>}{Boolean(source.limitations?.length) && <p>{source.limitations?.join('；')}</p>}</details>) : <p>开始对话后，实际使用的资料会显示在这里。</p>}</section>
    </aside></div>
  </section>;
}
