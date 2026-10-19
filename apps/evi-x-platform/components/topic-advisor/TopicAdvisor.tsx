'use client';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { useWorkbenchTheme } from '@/components/workbench/shell-kit';
import { ACCESS_OPTIONS, RESOURCE_OPTIONS, SETTING_OPTIONS, DOMAIN_OPTIONS, EMPTY_TOPIC_PROFILE, EMPTY_TOPIC_CANDIDATE, TOPIC_REGION_CATALOG, regionPath, profileRegionStatus, evaluateCandidate, eventLeadsForProfile, profileFingerprint, recommendTopics, type RegionRef, type TopicProfile, type TopicCandidate, type TopicRecommendation, type CandidateEvaluation } from '@/lib/topic-advisor';
import { TOPIC_BUNDLE } from '@/lib/topic-advisor/client-bundle';
import styles from './TopicAdvisor.module.css';
import { readTopicBackup, topicDraftFor, MAX_TOPIC_BACKUP_BYTES } from './draft';
import RegionPicker from './RegionPicker';
import PublishedCountyEvidence from './PublishedCountyEvidence';
import type { TopicWorkspace } from '@/lib/topic-project';
import type { TopicRefinement } from '@/lib/topic-proposal';
import TopicAgent from './TopicAgent';
import { parseTopicAgentTurn, type AgentSource, type TopicAgentTurn } from '@/lib/topic-agent';

type Run = { profile: TopicProfile; result: ReturnType<typeof recommendTopics>; createdAt: string };
type CandidateRun = { profile: TopicProfile; candidate: TopicCandidate; result: CandidateEvaluation };
type Tab = 'agent' | 'recommend' | 'signals' | 'candidate';
type DetailTab = 'decision' | 'evidence' | 'plan';
export type TopicHandoff = { title: string; decisionOwner: string; population: string; geography: string; problem: string; evidenceStatus: string };
export type TopicAgentAdoption = { item: TopicRefinement; profile: TopicProfile; sources: AgentSource[] };
export type TopicAdvisorProps = { projectId?: string | null; embedded?: boolean; pinnedComparisonId?: string; initialWorkspace?: TopicWorkspace; workspaceRevision?: number; cacheNamespace?: string; readOnly?: boolean; onWorkspaceChange?: (workspace: TopicWorkspace) => void; onChooseRecommendation?: (item: TopicRecommendation, profile: TopicProfile) => void; onChooseCandidate?: (candidate: TopicCandidate, evaluation: CandidateEvaluation, agent?: TopicAgentAdoption) => void; onUseTopic?: (topic: TopicHandoff) => void; renderEnhancement?: (context: { profile: TopicProfile; recommendation: TopicRecommendation | null; stale: boolean }) => ReactNode };
const TABS: { id: Tab; label: string }[] = [{ id: 'agent', label: '选题对话' }, { id: 'recommend', label: '推荐方向' }, { id: 'signals', label: '热点与命题' }, { id: 'candidate', label: '评估我的题目' }];
const DETAILS: { id: DetailTab; label: string }[] = [{ id: 'decision', label: '问题与可行性' }, { id: 'evidence', label: '来源与边界' }, { id: 'plan', label: '第一周怎么做' }];
const FEASIBILITY = { ready: '可优先验证', conditional: '补条件后再推进', blocked: '先解决执行障碍' };
const STATUS = { supported: '有依据', proposed: '待验证建议', unknown: '尚未确认', blocked: '存在障碍' };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function freshProfile(): TopicProfile { return { ...clone(EMPTY_TOPIC_PROFILE), schemaVersion: 2, regionRef: null, referenceDate: today() }; }
function geographyLabel(profile: TopicProfile) { if (profile.schemaVersion !== 2) return [profile.region, profile.city].filter(Boolean).join(' · '); try { return profile.regionRef ? regionPath(profile.regionRef).map(row => row.name).join(' · ') : ''; } catch { return `待确认地区 ${profile.regionRef?.code ?? ''}`; } }
function terms(value: string) { return value.split(/[，,、;；\n]/).map(item => item.trim()).filter(Boolean).slice(0, 12); }
function safeFingerprint(profile: TopicProfile) { try { return profileFingerprint(profile); } catch { return ''; } }
function domain(id: string) { return DOMAIN_OPTIONS.find(item => item.id === id)?.label ?? id; }
function message(error: unknown) { return error instanceof Error ? error.message : '操作未完成，请检查输入后重试。'; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function tabKey<T extends string>(event: KeyboardEvent<HTMLButtonElement>, current: T, tabs: { id: T }[], select: (id: T) => void, prefix: string) {
  const at = tabs.findIndex(item => item.id === current), next = event.key === 'ArrowRight' ? (at + 1) % tabs.length : event.key === 'ArrowLeft' ? (at + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
  if (next < 0) return; event.preventDefault(); select(tabs[next].id); document.getElementById(`${prefix}-${tabs[next].id}`)?.focus();
}
export default function TopicAdvisor({ projectId = null, onUseTopic, renderEnhancement, embedded = false, pinnedComparisonId = '', initialWorkspace, workspaceRevision = 0, cacheNamespace = 'global', readOnly = false, onWorkspaceChange, onChooseRecommendation, onChooseCandidate }: TopicAdvisorProps = {}) {
  const theme = useWorkbenchTheme(), auth = useHostedSession();
  const { getDraft, cacheDraft, setUnsaved, isCurrentAccount, identityEpoch } = auth;
  const ownerId = auth.session?.user?.id ?? '', cacheKey = `topic-advisor:v1:${encodeURIComponent(ownerId)}${cacheNamespace === 'global' ? '' : `:${encodeURIComponent(cacheNamespace)}`}`;
  const managed = Boolean(onWorkspaceChange);
  const initialRevision = useRef(workspaceRevision), emittedWorkspace = useRef(''), syncingWorkspace = useRef(false);
  const [profile, setProfile] = useState<TopicProfile>(() => initialWorkspace ? clone(initialWorkspace.profile) : freshProfile()), [candidate, setCandidate] = useState<TopicCandidate>(() => clone(initialWorkspace?.candidate ?? EMPTY_TOPIC_CANDIDATE));
  const [interestText, setInterestText] = useState(initialWorkspace?.profile.interests.join('、') ?? ''), [differenceText, setDifferenceText] = useState(initialWorkspace?.candidate?.differentiators.join('、') ?? '');
  const [run, setRun] = useState<Run | null>(null), [candidateRun, setCandidateRun] = useState<CandidateRun | null>(null);
  const [selectedId, setSelectedId] = useState(initialWorkspace?.selectedId ?? ''), [compareIds, setCompareIds] = useState<string[]>(() => [...(initialWorkspace?.shortlistIds ?? [])]);
  const [tab, setTab] = useState<Tab>('agent'), [detailTab, setDetailTab] = useState<DetailTab>('decision');
  const [lens, setLens] = useState<'all' | 'national' | 'local'>('all');
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [dirty, setDirty] = useState(false), [restored, setRestored] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), editEpoch = useRef(0), importEpoch = useRef(0), active = useRef(true), loadedOwner = useRef('');
  const profileKey = safeFingerprint(profile), stale = Boolean(run && profileKey !== run.result.profileKey);
  const migrationRequired = profileRegionStatus(profile) === 'migration_required';
  const pickerScope = JSON.stringify([ownerId, identityEpoch, cacheNamespace]);
  const candidateStale = Boolean(candidateRun && (profileFingerprint(candidateRun.profile) !== profileKey || JSON.stringify(candidateRun.candidate) !== JSON.stringify(candidate)));
  const selected = run?.result.items.find(item => item.patternId === selectedId) ?? run?.result.items[0] ?? null;
  const comparisonIds = pinnedComparisonId ? [pinnedComparisonId, ...compareIds.filter(id => id !== pinnedComparisonId)].slice(0, 3) : compareIds;
  const comparison = run?.result.items.filter(item => comparisonIds.includes(item.patternId)) ?? [];
  const confirmedChannels = Object.values(profile.access).filter(value => value === 'confirmed').length, confirmedResources = Object.values(profile.resources).filter(value => value === 'confirmed').length;
  useEffect(() => { const requests = importEpoch; active.current = true; return () => { active.current = false; requests.current++; }; }, []);
  useEffect(() => {
    if (managed) return;
    if (!ownerId || loadedOwner.current === cacheKey) return;
    const saved = getDraft(cacheKey); let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !isCurrentAccount(ownerId, identityEpoch)) return; loadedOwner.current = cacheKey;
      if (record(saved) && saved.ownerId === ownerId && record(saved.snapshot)) {
        try {
          const input = saved.snapshot, draft = topicDraftFor(input.profile, input.candidate);
          setProfile(draft.profile); setInterestText(draft.profile.interests.join('、')); setCandidate(draft.candidate ?? clone(EMPTY_TOPIC_CANDIDATE)); setDifferenceText(draft.candidate?.differentiators.join('、') ?? '');
          if (input.analysisProfile) { const frozen = topicDraftFor(input.analysisProfile).profile; if (profileRegionStatus(frozen) !== 'migration_required') setRun({ profile: frozen, result: recommendTopics(frozen, TOPIC_BUNDLE, 6), createdAt: new Date().toISOString() }); }
          setSelectedId(typeof input.selectedId === 'string' ? input.selectedId : ''); setCompareIds(Array.isArray(input.compareIds) ? input.compareIds.filter((id): id is string => typeof id === 'string').slice(0, 3) : []);
          setNotice(profileRegionStatus(draft.profile) === 'migration_required' ? '已恢复草稿；原地区引用已保留，请重新选择并确认后推荐。' : '已恢复本账号在当前标签页的草稿。'); setDirty(saved.dirty === true);
        } catch { setNotice('原草稿无法读取，可以重新打开导出的文件。'); }
      }
      setRestored(true);
    }); return () => { cancelled = true; };
  }, [getDraft, isCurrentAccount, cacheKey, identityEpoch, ownerId, managed]);
  useEffect(() => {
    if (managed || !restored || !ownerId || !isCurrentAccount(ownerId, identityEpoch)) return;
    cacheDraft(cacheKey, { ownerId, snapshot: { profile, candidate, analysisProfile: run?.profile ?? null, selectedId, compareIds }, dirty }, dirty, ownerId); setUnsaved(cacheKey, dirty);
  }, [cacheDraft, setUnsaved, isCurrentAccount, cacheKey, ownerId, identityEpoch, restored, dirty, profile, candidate, run, selectedId, compareIds, managed]);
  useEffect(() => () => { setUnsaved(cacheKey, false); }, [setUnsaved, cacheKey]);
  useEffect(() => {
    if (!managed || initialRevision.current === workspaceRevision || !initialWorkspace) return;
    initialRevision.current = workspaceRevision; syncingWorkspace.current = true; importEpoch.current++; editEpoch.current++;
    const snapshot = clone(initialWorkspace); setProfile(snapshot.profile); setCandidate(snapshot.candidate ?? clone(EMPTY_TOPIC_CANDIDATE));
    setInterestText(snapshot.profile.interests.join('、')); setDifferenceText(snapshot.candidate?.differentiators.join('、') ?? '');
    setCompareIds(snapshot.shortlistIds); setSelectedId(snapshot.selectedId); setRun(null); setCandidateRun(null); setDirty(false);
    emittedWorkspace.current = JSON.stringify(snapshot);
  }, [managed, workspaceRevision, initialWorkspace]);
  useEffect(() => {
    if (!managed || readOnly || initialRevision.current !== workspaceRevision) return;
    if(syncingWorkspace.current){syncingWorkspace.current=false;return;}
    const snapshot: TopicWorkspace = { profile, candidate, shortlistIds: pinnedComparisonId ? [pinnedComparisonId, ...compareIds.filter(id => id !== pinnedComparisonId)].slice(0, 3) : compareIds, selectedId };
    const fingerprint = JSON.stringify(snapshot); if (fingerprint === emittedWorkspace.current) return;
    emittedWorkspace.current = fingerprint; onWorkspaceChange?.(snapshot);
  }, [managed, readOnly, workspaceRevision, profile, candidate, compareIds, pinnedComparisonId, selectedId, onWorkspaceChange]);
  function changed() { editEpoch.current++; setDirty(true); setNotice(''); setError(''); }
  function changeProfile<K extends keyof TopicProfile>(field: K, value: TopicProfile[K]) { if(readOnly)return; changed(); setProfile(current => ({ ...current, [field]: value })); }
  function changeRegion(regionRef: RegionRef | null) {
    if (readOnly || !active.current || ownerId && !isCurrentAccount(ownerId, identityEpoch)) return;
    const path = regionRef ? regionPath(regionRef) : [], province = path.find(row => row.level === 'province'), city = path.find(row => row.level === 'prefecture');
    changed(); setProfile(current => ({ ...current, schemaVersion: 2, regionRef, region: province?.name ?? '', city: city?.name ?? (province && ['110000','120000','310000','500000'].includes(province.code) ? province.name : '') }));
  }
  function changeCandidate<K extends keyof TopicCandidate>(field: K, value: TopicCandidate[K]) { if(readOnly)return; changed(); setCandidate(current => ({ ...current, [field]: value })); }
  function recommend(input = profile) {
    editEpoch.current++; setError(''); try { const frozen = topicDraftFor(input).profile, result = recommendTopics(frozen, TOPIC_BUNDLE, 6);
      setRun({ profile: clone(frozen), result, createdAt: new Date().toISOString() }); setSelectedId(result.items[0]?.patternId ?? ''); setCompareIds(pinnedComparisonId ? [pinnedComparisonId] : []); setTab('recommend'); setDetailTab('decision'); setDirty(true);
      setNotice(`已按当前条件整理 ${result.items.length} 个方向。先确认可触达条件，再开展小范围验证。`);
    } catch (failure) { setError(message(failure)); }
  }
  function evaluate() { editEpoch.current++; setError(''); try { const draft = topicDraftFor(profile, candidate); if (!draft.candidate) throw Error('请先写下要评估的题目。'); setCandidateRun({ profile: clone(draft.profile), candidate: clone(draft.candidate), result: evaluateCandidate(draft.candidate, draft.profile, TOPIC_BUNDLE) }); setDirty(true); setNotice('已整理这道题的可行性与证据缺口。'); } catch (failure) { setError(message(failure)); } }
  function toggleCompare(id: string) { if(readOnly || id === pinnedComparisonId)return; editEpoch.current++; setCompareIds(comparisonIds.includes(id) ? comparisonIds.filter(value => value !== id) : comparisonIds.length < 3 ? [...comparisonIds, id] : comparisonIds); setDirty(true); }
  function saveDraft() {
    if (!ownerId || !isCurrentAccount(ownerId, identityEpoch)) { setError('账号状态已变化，请重新进入选题顾问。'); return; }
    try { topicDraftFor(profile, candidate); } catch (failure) { setError(message(failure)); return; }
    cacheDraft(cacheKey, { ownerId, snapshot: { profile, candidate, analysisProfile: run?.profile ?? null, selectedId, compareIds }, dirty: false }, false, ownerId); setUnsaved(cacheKey, false); setDirty(false); setNotice('草稿已保留在本账号的当前标签页中。关闭标签页前，可导出文件长期留存。');
  }
  function exportDraft() {
    if (!ownerId || !isCurrentAccount(ownerId, identityEpoch)) { setError('请先登录，再导出本账号的草稿。'); return; }
    try { const draft = topicDraftFor(profile, candidate); const payload = { kind: 'evix-topic-advisor', schemaVersion: 1, ownerId, exportedAt: new Date().toISOString(), contentVersion: TOPIC_BUNDLE.catalog.contentVersion, modelVersion: TOPIC_BUNDLE.model.modelVersion, draft, analysisProfile: run?.profile ?? null, compareIds, selectedId };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })), link = document.createElement('a'); link.href = url; link.download = `选题草稿-${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setDirty(false); setNotice('已导出选题条件与候选题目。重新打开时将按当前资料重新计算建议。');
    } catch (failure) { setError(message(failure)); }
  }
  async function importDraft(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; const request = ++importEpoch.current, capturedEdit = editEpoch.current; setError('');
    try {
      if (!ownerId) throw Error('请先登录，再打开本账号的草稿。'); if (file.size > MAX_TOPIC_BACKUP_BYTES) throw Error('草稿文件不能超过 128 KB。');
      const raw = await file.text();
      if (!active.current || request !== importEpoch.current || !isCurrentAccount(ownerId, identityEpoch)) return;
      if (capturedEdit !== editEpoch.current) throw Error('读取时你修改了条件，本次导入未覆盖修改。请重新打开文件。');
      const input = readTopicBackup(raw, ownerId);
      const draft = input.draft, frozen = input.analysisProfile, needsMigration = profileRegionStatus(draft.profile) === 'migration_required' || Boolean(frozen && profileRegionStatus(frozen) === 'migration_required'), rebuilt = frozen && !needsMigration ? recommendTopics(frozen, TOPIC_BUNDLE, 6) : null;
      setProfile(draft.profile); setInterestText(draft.profile.interests.join('、')); setCandidate(draft.candidate ?? clone(EMPTY_TOPIC_CANDIDATE)); setDifferenceText(draft.candidate?.differentiators.join('、') ?? ''); setCandidateRun(null); setRun(frozen && rebuilt ? { profile: frozen, result: rebuilt, createdAt: new Date().toISOString() } : null);
      setCompareIds(input.compareIds.filter(id => needsMigration || Boolean(rebuilt?.items.some(item => item.patternId === id))));
      setSelectedId(needsMigration ? input.selectedId : rebuilt?.items.some(item => item.patternId === input.selectedId) ? input.selectedId : rebuilt?.items[0]?.patternId ?? ''); editEpoch.current++; setDirty(false); setNotice(needsMigration ? '已打开草稿；原地区引用和候选已保留，请重新选择并确认后推荐。' : '已打开草稿，并按当前资料重新计算已保存的推荐条件。');
    } catch (failure) { if (active.current && request === importEpoch.current && isCurrentAccount(ownerId, identityEpoch)) setError(message(failure)); }
  }
  function applyRecommendation(item: TopicRecommendation, frozen: TopicProfile) { if (readOnly || stale || item.feasibility === 'blocked') return; if(onChooseRecommendation){onChooseRecommendation(item,frozen);return;} onUseTopic?.({ title: item.title, decisionOwner: item.decisionOwner, population: item.population, geography: geographyLabel(frozen), problem: `${item.question}\n拟支持的决策：${item.decision}`, evidenceStatus: `选题顾问建议，尚未开展实地调查。${item.unknowns.join('；')}` }); }
  function applyAgent(item: TopicRefinement, frozen: TopicProfile, receipt?: TopicAgentTurn) {
    if (readOnly || !active.current || profileKey !== safeFingerprint(frozen) || ownerId && !isCurrentAccount(ownerId, identityEpoch)) return;
    let sources: AgentSource[];
    try {
      if (receipt) {
        const turn = parseTopicAgentTurn(receipt);
        if (turn.status !== 'ready' || (turn.projectId ?? null) !== projectId || safeFingerprint(turn.profile) !== profileKey || !turn.assistant?.items.some(row => JSON.stringify(row) === JSON.stringify(item))) return;
        sources = clone(turn.sources.filter(source => item.sourceIds.includes(source.id)));
      } else sources = clone(TOPIC_BUNDLE.sources.sources.filter(source => item.sourceIds.includes(source.id)));
      if (item.sourceIds.some(id => !sources.some(source => source.id === id))) throw Error('这份提案的引用未完整返回，请先核对来源。');
    } catch (failure) { setError(message(failure)); return; }
    const pattern = TOPIC_BUNDLE.catalog.patterns.find(row => row.id === item.patternId);
    if (!pattern) return;
    const proposed: TopicCandidate = { ...clone(EMPTY_TOPIC_CANDIDATE), title: item.title.slice(0, 200), decisionOwner: item.decisionOwner.slice(0, 160), decision: item.decision.slice(0, 240), population: pattern.population.slice(0, 160), geography: geographyLabel(frozen).slice(0, 100), accessNeeds: [...pattern.accessNeeds], resourceNeeds: [...pattern.resourceNeeds], evidencePlan: pattern.minimumEvidence.join('\n').slice(0, 1200), differentiators: pattern.differentiators.slice(0, 8), action: item.decision.slice(0, 300), sensitive: pattern.sensitive };
    const evaluated = evaluateCandidate(proposed, frozen, TOPIC_BUNDLE);
    if (evaluated.feasibility === 'blocked') { setError('这份提案仍有执行障碍，请先补充可触达条件。'); return; }
    const evaluation: CandidateEvaluation = { ...evaluated, patternId: item.patternId, question: item.researchQuestion, firstWeekPlan: [...item.firstWeekPlan], unknowns: [...new Set([...evaluated.unknowns, ...item.unknowns])].slice(0, 20), sourceIds: [...item.sourceIds] };
    if (onChooseCandidate) { onChooseCandidate(proposed, evaluation, { item: clone(item), profile: clone(frozen), sources }); return; }
    onUseTopic?.({ title: proposed.title, decisionOwner: proposed.decisionOwner, population: proposed.population, geography: proposed.geography, problem: `${item.researchQuestion}\n拟支持的决策：${item.decision}`, evidenceStatus: `选题顾问提案，尚未开展实地调查。${item.unknowns.join('；')}` });
  }
  function applyAgentProfile(next: TopicProfile) {
    if (readOnly || !active.current || ownerId && !isCurrentAccount(ownerId, identityEpoch)) return;
    const validated = topicDraftFor(next).profile; changed(); setProfile(clone(validated)); setInterestText(validated.interests.join('、')); setNotice('已更新调研条件，下一轮将按这些条件重新核对。');
  }
  function wuhan(start = false) { if(readOnly)return; changed(); const input: TopicProfile = { ...freshProfile(), schemaVersion: 2, regionRef: { code: '420100', catalogVersion: TOPIC_REGION_CATALOG.catalogVersion }, region: '湖北省', city: '武汉市' }; setProfile(input); setInterestText(''); if (start) recommend(input); }
  const signals = run ? eventLeadsForProfile(run.profile, TOPIC_BUNDLE.events, TOPIC_BUNDLE.sources) : [];
  const visibleSignals = signals.filter(signal => lens === 'all' || (lens === 'national' ? signal.geography.level === 'national' : signal.geography.level !== 'national'));
  return <section className={styles.root} data-theme={theme} aria-label="选题顾问" data-visual-mode="agent_ui">
    {!embedded && <header className={styles.header}><div><p className={styles.eyebrow}>RESEARCH DIRECTION / 选题顾问</p><h3>让值得研究的问题，落到你能做到的地方。</h3><p>从地区热点和真实可用资源出发，把一个方向收敛成可调查、可行动的题目。</p></div>{!managed && <div className={styles.draftActions}><span>{dirty ? '有未保存修改' : '本标签页草稿'}</span><button type="button" onClick={saveDraft} disabled={!ownerId}>保存草稿</button><button type="button" onClick={exportDraft} disabled={!ownerId}>导出</button><button type="button" onClick={() => fileInput.current?.click()} disabled={!ownerId}>重新打开</button><input ref={fileInput} type="file" accept="application/json,.json" onChange={importDraft} className={styles.srOnly} aria-label="重新打开选题草稿" /></div>}</header>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.layout}><fieldset disabled={readOnly} className={styles.profile} aria-label="我的调研条件">
      <div className={styles.profileHeading}><div><span className={styles.step}>01</span><h4>我的调研条件</h4></div><button type="button" className={styles.textButton} onClick={() => wuhan()}>试试武汉</button></div><p className={styles.hint}>未知可以留空。学校名称不参与排名；可行性取决于你能触达谁、拿到什么。</p>
      <RegionPicker key={pickerScope} scopeKey={pickerScope} regionRef={profile.schemaVersion === 2 ? profile.regionRef : null} region={profile.schemaVersion !== 2 || profile.regionRef ? profile.region : ''} city={profile.schemaVersion !== 2 || profile.regionRef ? profile.city : ''} readOnly={readOnly} onChange={changeRegion} />
      {migrationRequired && <p className={styles.stale} role="status">原地区引用已保留。重新选择并确认后，可继续推荐和云端保存。</p>}
      <Field label="学校（可选）"><input value={profile.school} maxLength={100} placeholder="未知或暂不填写" onChange={e => changeProfile('school', e.target.value)} /></Field><Field label="专业 / 擅长方向（可选）"><input value={profile.discipline} maxLength={100} placeholder="如：统计、社会学、设计" onChange={e => changeProfile('discipline', e.target.value)} /></Field>
      <Field label="感兴趣的问题"><input value={interestText} maxLength={220} placeholder="如：青年就业、文旅、社区服务" onChange={e => { setInterestText(e.target.value); changeProfile('interests', terms(e.target.value)); }} /></Field>
      <div className={styles.fieldPair}><Field label="可投入天数"><input type="number" min="1" max="365" placeholder="未知" value={profile.days ?? ''} onChange={e => changeProfile('days', e.target.value === '' ? null : Number(e.target.value))} /></Field><Field label="调研预算（元）"><input type="number" min="0" max="1000000" placeholder="未知" value={profile.budgetYuan ?? ''} onChange={e => changeProfile('budgetYuan', e.target.value === '' ? null : Number(e.target.value))} /></Field></div>
      <details className={styles.profileDetails}><summary><span>样本渠道与调研资源</span><small>{confirmedChannels} 项渠道 · {confirmedResources} 项资源已确认</small></summary><p className={styles.hint}>“有机会”仍需联系确认；未选择按未知处理。</p><AccessFields label="能接触到哪些人" options={ACCESS_OPTIONS} values={profile.access} onChange={value => changeProfile('access', value)} /><AccessFields label="可使用的调查资源" options={RESOURCE_OPTIONS} values={profile.resources} onChange={value => changeProfile('resources', value)} /></details>
      <details className={styles.profileDetails}><summary><span>场景与调查边界</span><small>{profile.schoolContext.length ? `${profile.schoolContext.length} 个场景` : '可选'}</small></summary><ChipChoices label="能够进入的场景" options={SETTING_OPTIONS} selected={profile.schoolContext} onChange={value => changeProfile('schoolContext', value)} /><Field label="敏感人群 / 信息"><select value={profile.sensitiveData} onChange={e => changeProfile('sensitiveData', e.target.value as TopicProfile['sensitiveData'])}><option value="avoid">优先避开敏感数据</option><option value="review_required">可能涉及，仍需审查</option><option value="approved">已完成所需伦理审查（自报）</option></select></Field></details>
      <details className={styles.profileDetails}><summary><span>关注领域与时间窗口</span><small>{profile.domains.length ? `${profile.domains.length} 个领域` : '全部领域'}</small></summary><ChipChoices label="关注领域" options={DOMAIN_OPTIONS} selected={profile.domains} onChange={value => changeProfile('domains', value)} /><Field label="判断时效的参考日期"><input type="date" value={profile.referenceDate} onChange={e => changeProfile('referenceDate', e.target.value)} /></Field><div className={styles.fieldPair}><Field label="窗口开始"><input type="date" value={profile.competitionWindow?.start ?? ''} onChange={e => changeProfile('competitionWindow', { start: e.target.value, end: profile.competitionWindow?.end ?? '' })} /></Field><Field label="窗口结束"><input type="date" value={profile.competitionWindow?.end ?? ''} onChange={e => changeProfile('competitionWindow', { start: profile.competitionWindow?.start ?? '', end: e.target.value })} /></Field></div><p className={styles.hint}>时间窗口由你设置，不代表已核实的赛事日程。</p>{profile.competitionWindow && <button type="button" className={styles.textButton} onClick={() => changeProfile('competitionWindow', null)}>清除时间窗口</button>}</details>
      <button type="button" className={styles.primary} disabled={migrationRequired} onClick={() => recommend()}>{run ? '按当前条件重新推荐' : '发现适合我的方向'}<span aria-hidden="true">↗</span></button><p className={styles.localNote}>使用已登记资料与可解释模型；建议先经小范围验证。</p>
    </fieldset><div className={styles.workspace}>
      <div className={styles.workspaceTop}><span className={styles.step}>02</span><div className={styles.tabs} role="tablist" aria-label="选题工作方式">{TABS.map(item => <button type="button" role="tab" key={item.id} id={`ta-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`ta-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => tabKey(event, item.id, TABS, setTab, 'ta-tab')}>{item.label}</button>)}</div></div>
      {stale && <div className={styles.stale} role="status"><strong>调研条件已改变</strong><span>下方仍依据上一次条件。重新推荐后，才能带入诊断。</span><button type="button" disabled={migrationRequired} onClick={() => recommend()}>更新建议</button></div>}
      <div role="tabpanel" id="ta-panel-agent" aria-labelledby="ta-tab-agent" hidden={tab !== 'agent'}><TopicAgent profile={profile} projectId={projectId} cacheNamespace={cacheNamespace} readOnly={readOnly} onChoose={onUseTopic || onChooseCandidate ? applyAgent : undefined} onProfileChange={applyAgentProfile} /></div>
      <div role="tabpanel" id="ta-panel-recommend" aria-labelledby="ta-tab-recommend" hidden={tab !== 'recommend'}>
        {!run ? <div className={styles.empty}><span className={styles.emptyMark} aria-hidden="true">Q <i>→</i> D <i>→</i> I <i>→</i> A</span><h4>先找一个能验证的问题。</h4><p>选择地区、写下兴趣，再确认样本和资源。我们会给出题目方向、证据缺口与第一周的验证路径。</p><div className={styles.emptySteps}><p><b>看见变化</b><span>全国政策与本地事件，找到真实的决策压力。</span></p><p><b>找到入口</b><span>把问题放进你能接触的社区、企业或校园。</span></p><p><b>缩小题目</b><span>明确为谁调查、支持什么决定、先补哪条证据。</span></p></div><button type="button" className={styles.secondary} onClick={() => wuhan(true)}>从武汉开始探索 <span aria-hidden="true">→</span></button><p className={styles.hint}>仅填写湖北、武汉，其余条件保留未知。</p></div> : <>
          <div className={styles.resultHeading}><div><h4>{run.result.items.length} 个值得进一步验证的方向</h4><p>{geographyLabel(run.profile) || '地区尚未限定'} · 依据 {run.profile.referenceDate || '未指定日期'} 的条件</p></div><span className={styles.smallTag}>可比较 3 个方向</span></div>
          {run.result.warnings.length > 0 && <details className={styles.warnings}><summary>本次建议的 {run.result.warnings.length} 项范围提示</summary><ul>{run.result.warnings.map(item => <li key={item}>{item}</li>)}</ul></details>}
          <div className={styles.recommendations}>{run.result.items.map((item, index) => <article key={item.patternId} className={styles.recommendation} data-selected={selected?.patternId === item.patternId}><button type="button" className={styles.recommendationSelect} aria-pressed={selected?.patternId === item.patternId} onClick={() => { editEpoch.current++; setSelectedId(item.patternId); setDetailTab('decision'); }}><span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span><span><small>{domain(item.domain)} · {FEASIBILITY[item.feasibility]}</small><strong>{item.title}</strong><em>{item.matchReasons[0] || item.decision}</em></span></button><label className={styles.compareCheck}><input type="checkbox" checked={comparisonIds.includes(item.patternId)} disabled={readOnly || item.patternId === pinnedComparisonId || !comparisonIds.includes(item.patternId) && comparisonIds.length >= 3} onChange={() => toggleCompare(item.patternId)} /><span>{item.patternId === pinnedComparisonId ? '已采用' : '对比'}<span className={styles.srOnly}>：{item.title}</span></span></label></article>)}</div>
          {!run.result.items.length && <p className={styles.notice}>当前条件没有可继续推进的方向。查看执行障碍，或调整样本渠道与资源后再试。</p>}
          {selected && <article className={styles.detail} key={selected.patternId}><header><span className={styles.eyebrow}>当前查看 · 拟议研究</span><h4>{selected.title}</h4><p>{selected.question}</p></header><div className={styles.tabs} role="tablist" aria-label="题目详情">{DETAILS.map(item => <button type="button" role="tab" key={item.id} id={`ta-detail-${item.id}`} aria-selected={detailTab === item.id} aria-controls={`ta-detail-panel-${item.id}`} tabIndex={detailTab === item.id ? 0 : -1} onClick={() => setDetailTab(item.id)} onKeyDown={event => tabKey(event, item.id, DETAILS, setDetailTab, 'ta-detail')}>{item.label}</button>)}</div>
            <div role="tabpanel" id="ta-detail-panel-decision" aria-labelledby="ta-detail-decision" hidden={detailTab !== 'decision'}><dl className={styles.decisionGrid}><div><dt>谁来做决定</dt><dd>{selected.decisionOwner}</dd></div><div><dt>调查谁</dt><dd>{selected.population}</dd></div><div className={styles.spanFull}><dt>这项研究要改变的决定</dt><dd>{selected.decision}</dd></div></dl><Dimensions dimensions={selected.dimensions} /><Needs blockers={selected.blockers} unknowns={selected.unknowns} /></div>
            <div role="tabpanel" id="ta-detail-panel-evidence" aria-labelledby="ta-detail-evidence" hidden={detailTab !== 'evidence'}><p className={styles.hint}>材料支持问题背景与设计思路；本地需求、触达渠道和真实行为仍需调查核实。</p><Sources ids={selected.sourceIds} /><ul className={styles.limitations}>{selected.scopeLimits.map(item => <li key={item}>{item}</li>)}</ul></div>
            <div role="tabpanel" id="ta-detail-panel-plan" aria-labelledby="ta-detail-plan" hidden={detailTab !== 'plan'}><p className={styles.hint}>以下为拟议安排，完成后据实际记录判断是否继续。</p><Plan items={selected.firstWeekPlan} /></div>
            <footer className={styles.detailFooter}><span>{FEASIBILITY[selected.feasibility]}</span>{(onUseTopic || onChooseRecommendation) && <button type="button" className={styles.primary} disabled={readOnly || stale || selected.feasibility === 'blocked'} onClick={() => applyRecommendation(selected, run.profile)}>{onChooseRecommendation ? '选定方向，编辑研究简报' : '选定方向，带入准备度诊断'} <span aria-hidden="true">→</span></button>}</footer></article>}
          {comparison.length > 0 && <section className={styles.comparison}><div className={styles.resultHeading}><h4>并排看清取舍 <span>{comparison.length} / 3</span></h4><button type="button" className={styles.textButton} disabled={readOnly} onClick={() => { if(readOnly)return; editEpoch.current++; setCompareIds(pinnedComparisonId ? [pinnedComparisonId] : []); setDirty(true); }}>清空对比</button></div><div className={styles.tableWrap}><table><caption className={styles.srOnly}>候选选题的决策价值、可行性与待补证据</caption><thead><tr><th scope="col">比较维度</th>{comparison.map(item => <th scope="col" key={item.patternId}>{item.title}<button type="button" className={styles.textButton} disabled={readOnly || item.patternId === pinnedComparisonId} onClick={() => toggleCompare(item.patternId)}>{item.patternId === pinnedComparisonId ? '已采用' : '移除'}<span className={styles.srOnly}>：{item.title}</span></button></th>)}</tr></thead><tbody>{[{ label: '决策', value: (item: TopicRecommendation) => item.decision }, { label: '可行性', value: (item: TopicRecommendation) => FEASIBILITY[item.feasibility] }, { label: '首要待确认', value: (item: TopicRecommendation) => [...item.blockers, ...item.unknowns][0] || '按第一周计划开展验证' }, { label: '来源覆盖', value: (item: TopicRecommendation) => `${item.sourceIds.length} 条已登记材料` }].map(row => <tr key={row.label}><th scope="row">{row.label}</th>{comparison.map(item => <td key={item.patternId}>{row.value(item)}</td>)}</tr>)}</tbody></table></div></section>}
          {run.result.excluded.length > 0 && <details className={styles.warnings}><summary>{run.result.excluded.length} 个方向因条件限制暂不优先</summary>{run.result.excluded.map(item => <p key={item.patternId}><strong>{item.title}</strong><br />{item.blockers.join('；')}</p>)}</details>}
        </>}
      </div>
      <div role="tabpanel" id="ta-panel-signals" aria-labelledby="ta-tab-signals" hidden={tab !== 'signals'}><div className={styles.signalHeader}><h4>把发生的变化，转成可调查的问题</h4><p>按当前推荐条件整理。全国信号提供背景，本地线索仍需核对适用地区和时间。</p><div className={styles.lenses} aria-label="热点地域范围">{([{ id: 'all', label: '全部线索' }, { id: 'national', label: '全国视角' }, { id: 'local', label: '本地视角' }] as const).map(item => <button type="button" key={item.id} aria-pressed={lens === item.id} onClick={() => setLens(item.id)}>{item.label}</button>)}</div></div>
        {!run ? <p className={styles.notice}>先在左侧设置地区、关注领域与时间窗口，再生成推荐以查看关联热点。</p> : !visibleSignals.length ? <p className={styles.notice}>当前资料中没有符合这一范围的热点线索。可扩大领域或日期窗口；这不代表当地没有值得研究的变化。</p> : <div className={styles.signals}>{visibleSignals.map(signal => <article key={signal.id}><div className={styles.signalMeta}><span>{domain(signal.domain)}</span><time dateTime={signal.publishedAt}>发布 {signal.publishedAt || '待核实'}</time>{TOPIC_BUNDLE.events.events.find(event => event.id === signal.id)?.eventDate && <span>事件 {TOPIC_BUNDLE.events.events.find(event => event.id === signal.id)?.eventDate}</span>}<span data-status={signal.temporalStatus}>{signal.temporalStatus === 'current' ? '窗口内线索' : signal.temporalStatus === 'historical' ? '历史背景' : '时效待核实'}</span></div><h5>{signal.title}</h5><p>{signal.summary}</p><div className={styles.hypothesis}><span>可验证的命题</span><ul>{signal.researchHypotheses.map(item => <li key={item}>{item}</li>)}</ul></div><p className={styles.hint}>{signal.geographyReason}</p><p className={styles.hint}>{signal.validityBasis}</p><details><summary>查看来源与适用边界</summary><Sources ids={signal.sourceIds} /><ul className={styles.limitations}>{signal.limitations.map(item => <li key={item}>{item}</li>)}</ul></details></article>)}</div>}
      </div>
      <div role="tabpanel" id="ta-panel-candidate" aria-labelledby="ta-tab-candidate" hidden={tab !== 'candidate'}><div className={styles.signalHeader}><h4>已经有一个题目？把它拆开验证。</h4><p>评估同时参考左侧条件。先写清研究要支持的决定，缺失项会成为下一步任务。</p></div><fieldset className={styles.candidateFieldset} disabled={readOnly}><form className={styles.candidateForm} onSubmit={event => { event.preventDefault(); evaluate(); }}>
        <Field label="候选题目"><textarea required rows={2} maxLength={200} value={candidate.title} onChange={e => changeCandidate('title', e.target.value)} placeholder="写下你想研究的问题" /></Field><div className={styles.fieldPair}><Field label="谁会使用研究结果"><input maxLength={160} value={candidate.decisionOwner} onChange={e => changeCandidate('decisionOwner', e.target.value)} placeholder="具体机构、企业或服务负责人" /></Field><Field label="目标人群"><input maxLength={160} value={candidate.population} onChange={e => changeCandidate('population', e.target.value)} placeholder="具体到可招募的人群" /></Field></div>
        <Field label="要支持什么决定"><input maxLength={240} value={candidate.decision} onChange={e => changeCandidate('decision', e.target.value)} placeholder="例如：决定优先改造哪些服务触点" /></Field><Field label="调研范围"><input maxLength={100} value={candidate.geography} onChange={e => changeCandidate('geography', e.target.value)} placeholder="具体城市、区县或场所" /></Field>
        <details className={styles.profileDetails}><summary>补充证据、差异点与执行条件</summary><Field label="准备怎样取得证据"><textarea rows={2} maxLength={1200} value={candidate.evidencePlan} onChange={e => changeCandidate('evidencePlan', e.target.value)} placeholder="计划开展哪些问卷、访谈、观察或资料核验" /></Field><Field label="与已有研究的实质区别"><input maxLength={500} value={differenceText} onChange={e => { setDifferenceText(e.target.value); changeCandidate('differentiators', terms(e.target.value).slice(0, 8)); }} placeholder="用逗号分隔，不只更换题目说法" /></Field><Field label="研究完成后的行动"><input maxLength={300} value={candidate.action} onChange={e => changeCandidate('action', e.target.value)} placeholder="谁实施什么改变，怎样观察效果" /></Field><ChipChoices label="这道题需要的样本渠道" options={ACCESS_OPTIONS} selected={candidate.accessNeeds} onChange={value => changeCandidate('accessNeeds', value)} /><ChipChoices label="这道题需要的调研资源" options={RESOURCE_OPTIONS} selected={candidate.resourceNeeds} onChange={value => changeCandidate('resourceNeeds', value)} /><label className={styles.sensitive}><input type="checkbox" checked={candidate.sensitive} onChange={e => changeCandidate('sensitive', e.target.checked)} />涉及敏感人群或个人敏感信息</label></details>
        <button type="submit" className={styles.primary} disabled={migrationRequired || !candidate.title.trim()}>评估这个题目 <span aria-hidden="true">→</span></button>
      </form></fieldset>{candidateRun && <article className={styles.candidateResult}>{candidateStale && <p className={styles.stale}>题目或条件已修改，下方是上一次评估。请重新评估后再采用。</p>}<p className={styles.eyebrow}>候选题目诊断</p><h4>{candidateRun.candidate.title}</h4><Dimensions dimensions={candidateRun.result.dimensions} /><Needs blockers={candidateRun.result.blockers} unknowns={candidateRun.result.unknowns} /><details><summary>第一周验证路径</summary><Plan items={candidateRun.result.firstWeekPlan} /></details><details><summary>参考来源</summary><Sources ids={candidateRun.result.sourceIds} /></details>{(onUseTopic || onChooseCandidate) && <button type="button" className={styles.primary} disabled={readOnly || candidateStale || candidateRun.result.feasibility === 'blocked'} onClick={() => {if(readOnly)return;if(onChooseCandidate){onChooseCandidate(candidateRun.candidate,candidateRun.result);return;}onUseTopic?.({ title: candidateRun.candidate.title, decisionOwner: candidateRun.candidate.decisionOwner, population: candidateRun.candidate.population, geography: candidateRun.candidate.geography, problem: candidateRun.candidate.decision, evidenceStatus: `候选题目评估，尚未开展实地调查。${candidateRun.result.unknowns.join('；')}` });}}>采用这个题目{onChooseCandidate ? '，编辑研究简报' : '，带入诊断'} <span aria-hidden="true">→</span></button>}</article>}</div>
      <PublishedCountyEvidence profile={profile} />
      {renderEnhancement?.({ profile, recommendation: selected, stale })}
    </div></div>
  </section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className={styles.field}><span>{label}</span>{children}</label>; }
function ChipChoices({ label, options, selected, onChange }: { label: string; options: readonly { id: string; label: string }[]; selected: string[]; onChange: (value: string[]) => void }) { return <fieldset className={styles.chipField}><legend>{label}</legend><div>{options.map(item => <button type="button" key={item.id} aria-pressed={selected.includes(item.id)} onClick={() => onChange(selected.includes(item.id) ? selected.filter(value => value !== item.id) : [...selected, item.id])}>{item.label}</button>)}</div></fieldset>; }
function AccessFields({ label, options, values, onChange }: { label: string; options: readonly { id: string; label: string }[]; values: TopicProfile['access']; onChange: (value: TopicProfile['access']) => void }) { return <fieldset className={styles.accessFields}><legend>{label}</legend>{options.map(item => <label key={item.id}><span>{item.label}</span><select value={values[item.id] ?? ''} onChange={event => { const next = { ...values }; if (event.target.value) next[item.id] = event.target.value as TopicProfile['access'][string]; else delete next[item.id]; onChange(next); }}><option value="">未知</option><option value="confirmed">已确认</option><option value="possible">有机会</option><option value="unavailable">不可用</option></select></label>)}</fieldset>; }
function Dimensions({ dimensions }: { dimensions: TopicRecommendation['dimensions'] }) { return <div className={styles.dimensions}>{dimensions.map(item => <details key={item.id}><summary><strong>{item.label}</strong><span data-status={item.status}>{STATUS[item.status]}</span></summary><p>{item.reason}</p><p className={styles.verification}><b>怎么确认</b>{item.verification}</p></details>)}</div>; }
function Needs({ blockers, unknowns }: { blockers: string[]; unknowns: string[] }) { return <>{blockers.length > 0 && <div className={styles.blockers}><h5>推进前先解决</h5><ul>{blockers.map(item => <li key={item}>{item}</li>)}</ul></div>}{unknowns.length > 0 && <div className={styles.needs}><h5>最需要补充的证据</h5><ul>{unknowns.map(item => <li key={item}>{item}</li>)}</ul></div>}</>; }
function Plan({ items }: { items: string[] }) { return <ol className={styles.plan}>{items.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>; }
function Sources({ ids }: { ids: string[] }) {
  const sources = TOPIC_BUNDLE.sources.sources.filter(source => ids.includes(source.id));
  return <div className={styles.sources}>{sources.length ? sources.map(source => <article key={source.id}><div><strong>{source.title}</strong><span>{source.coverage === 'listing_only' ? '仅公告 / 题录' : source.coverage === 'fulltext' ? '可读原文' : '方法参照'}</span></div><p className={styles.hint}>{source.authority} · {source.publishedAt ? `发布 ${source.publishedAt}` : '发布日期未登记'}{source.retrievedAt ? ` · 核验 ${source.retrievedAt}` : ''}</p>{Boolean(source.supportedClaims?.length) && <p>支持范围：{source.supportedClaims?.join('；')}</p>}{source.limitations.length > 0 && <p className={styles.sourceLimit}>边界：{source.limitations.join('；')}</p>}{source.url && /^https:\/\//.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer">查看原始来源 <span aria-hidden="true">↗</span><span className={styles.srOnly}>（新窗口）</span></a>}</article>) : <p className={styles.hint}>此项尚无可展示的来源记录，需先补充依据。</p>}</div>;
}
