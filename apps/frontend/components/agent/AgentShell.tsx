'use client';

import Link from 'next/link';
import { flushSync } from 'react-dom';
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { useWorkbenchModules } from '@/components/EviXPlatform';
import { WorkbenchNavProvider, type WorkbenchNav, type WorkbenchPanel } from '@/components/WorkbenchShell';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { errorMessage, HostedApiError } from '@/components/hosted/api-client';
import { CHAT_ERRORS, HISTORY_LIMIT, MAX_STEPS, TEXT_LIMIT, chatContext, chatHistory, isDefiniteChatRejection, isResultTool, replyLines, spanText, thousands, turnText, type ChatAction, type ChatLine, type ChatReceipt, type ChatRequest, type ToolResult, usageText, type TokenUsage } from '@/lib/agent/chat';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { ThemeProvider, saveTheme, switchTheme, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { percent } from '@/lib/agent/glyphs';
import { illuminate, roomLight } from '@/lib/agent/illumination';
import { traceExhibits } from '@/lib/agent/provenance';
import { resultPlaced, suggestedNode } from '@/lib/report-placement';
import { blueprintNode } from '@/lib/report-blueprint';
import { SYNTHESIS_NODES, draftFacts, draftLine, draftRequest, draftText, reportOutline, sectionText, type DraftReceipt, type Fact } from '@/lib/agent/draft';
import { reportPlan } from '@/lib/agent/report-plan';
import { readDraft, sendDraft } from './draft-client';
import { ROOM_GROUPS, ROOMS, isRoomId, roomById, type RoomGroup, type RoomId } from '@/lib/agent/rooms';
import { lookupTurn, route, standingFindings, toolTurn, type AgentAction, type AgentTurn, type Line, type Mark, type ResultsView, type Span } from '@/lib/agent/router';
import { readChatTurn, sendChatTurn } from './chat-client';
import { UNRECORDED_SERVICE, conversationMarkdown, recordName } from '@/lib/agent/transcript-export';
import Composer from './Composer';
import ArtifactShelf, { ArtifactShelfLauncher } from './ArtifactShelf';
import { useArtifactLibrary } from './useArtifactLibrary';
import { artifactScope, sectionRevisionArtifact } from '@/lib/agent/artifact-library';
import SectionRevision from './SectionRevision';
import { useSectionRevision } from './useSectionRevision';
import { reportWorkState, sameReportRunScope, type ReportRunScope } from '@/lib/agent/report-work';
import { GenerationProvider, useGeneration } from './generation';
import { LightBar } from './Glyphs';
import { Icon } from './icons';
import Lobby from './Lobby';
import OutputPanel from './OutputPanel';
import { useHired, useShowCode, useStage } from './code-view';
import Advisors from './Advisors';
import { ADVISORS, advisorReading } from '@/lib/agent/advisors';
import CursorTrail from './CursorTrail';
import ReportPaper, { type DocFormatMode } from '@/components/editors/ReportPaper';
import { PaperToolbar, ReportInspector, ReportNav, type LiveWritingStatus } from './ReportWorkspace';
import { ReportLiveTheater, useLiveReportChoreography } from './ReportLiveTheater';
import { matchBlueprintNode } from '@/lib/report-blueprint';
import type { InsertItem } from '@/lib/report-insert';
import { benchmarkReport } from '@/lib/report-benchmark';
import { createEditorContent, type EditorContent } from '@/lib/editor-model';
import { METHOD_LABELS } from '@/lib/report-placement';
import { applyFigureChange, figureOf, parseFigureRequest } from '@/lib/agent/figure-tweak';
import Sidebar from './Sidebar';
import Transcript from './Transcript';
import { stamp, threads, type Message, type ModelCall } from './threads';
import type { Service } from '@evix/shared';
import { eligibleModelServices, getStageModelPreferences, getServerStageModelPreferences, matchesModelConsent, resolveStageModelRoute, setDefaultModelPreference, setStageModelPreference, subscribeModelPreferences, type ModelConsentBinding, type ModelTask } from '@/lib/agent/model-routing';
import { MODEL_CALL_IDS, type ModelCallId, type ResearchStageId } from '@/lib/agent/research-stages';
import type { JourneyModelRoute } from './ResearchJourney';
import ResearchWorkspace from './ResearchWorkspace';

/**
 * A sentence's later steps: what the tools found, which ran already, the service the user agreed to, and `after`, the
 * reply they follow, which ties them to the conversation the sentence was asked in.
 */
type Chain = { step: number; results: ToolResult[]; seen: Set<string>; service: Service; after: string; owner: string; epoch: number };
import styles from './AgentShell.module.css';
import type { FullReportGenerationResult, FullReportPack, ProjectResearchMode } from '@/lib/agent/full-report-pipeline';
import { canAcceptReportCandidate, hasUserResearchSource, mergeReportCandidate, reportChanges, reportSourceKey, type ReportRunSource } from '@/lib/agent/report-run';
import { fullReportInputRevision } from '@/lib/agent/full-report-request';
import { requestFullReport, fullReportFailureStatus } from './full-report-client';
import AgentRunReview from './AgentRunReview';

type ReportCandidate = { runId: string; scope: string; threadId: string | null; sourceKey: string; source: ReportRunSource; mode: ProjectResearchMode; before: EditorContent; preview: EditorContent; pack?: FullReportPack; result?: FullReportGenerationResult; pending: boolean; failed?: string; receipts: { id: string; nodeId: string; status: string }[] };
type ReportRunHandle = { runId: string; scope: ReportRunScope; threadId: string | null; owner: string; epoch: number; messageId: string; controller: AbortController };
const REPORT_MODES: Record<ProjectResearchMode, string> = { plan: '研究方案', demonstration: '教学模拟', empirical: '真实资料' };

// Every workbench module opens in the panel and every panel hosts a module: the two lists cannot drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const ROOMS_ARE_PANELS: Same<RoomId, WorkbenchPanel> = true;
void ROOMS_ARE_PANELS;

function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
/** The module open in the side panel, read from the address: none, the overview, or a workbench module. */
function currentPanel(): RoomId | null {
  const hash = window.location.hash.slice(1);
  return hash === 'lifecycle' ? 'workspace' : isRoomId(hash) ? hash : null;
}
/** A registered result opened beside the conversation, `#output/<id>`; it takes the panel's place while no module is open. */
function currentOutput(): string | null {
  const match = /^#output\/(.{1,400})$/.exec(window.location.hash);
  try { return match ? decodeURIComponent(match[1]) : null; } catch { return null; }
}
/** The research path as the sidebar shows it, in working order. */
const STAGES: RoomId[] = ['diagnose', 'design', 'sampling', 'analysis', 'editor', 'defense'];
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const subscribeNothing = () => () => {};
const searchKey = () => /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
const EMPTY_MESSAGES: Message[] = [];
const PANEL_KEY = 'evix.agent.panel-width.v1';
// Gutters: the canvas padding on the right and the margins between floating panels (see AgentShell.module.css).
const RAIL = 52, SIDEBAR = 264, GUTTERS = 24, MIN_PANEL = 480, MIN_TALK = 360, INSPECTOR = 248;
const GROUPS = (Object.keys(ROOM_GROUPS) as RoomGroup[]).filter(g => g !== 'lobby');

/** The panel width remembered in this browser, if any; a width is a convenience only. */
/**
 * How this identity talks to the agent, remembered: an account's choice in this browser, a guest's for the tab. It is
 * read through a store so the first client render matches the server's, which always starts in 指令模式.
 */
type ChatMode = 'command' | 'model';
const MODE_KEY = 'evix.agent.chat-mode.v1:', modeListeners = new Set<() => void>();
const modeStorage = (owner: string) => owner === 'guest' ? window.sessionStorage : window.localStorage;
function subscribeMode(listener: () => void) { modeListeners.add(listener); return () => { modeListeners.delete(listener); }; }
function readMode(owner: string | null): ChatMode {
  if (!owner) return 'command';
  try { return modeStorage(owner).getItem(MODE_KEY + owner) === 'model' ? 'model' : 'command'; } catch { return 'command'; }
}
function writeMode(owner: string | null, mode: ChatMode) {
  if (!owner) return;
  try { modeStorage(owner).setItem(MODE_KEY + owner, mode); } catch { /* Without storage the choice lasts until the page reloads. */ }
  for (const listener of modeListeners) listener();
}

function savedPanelWidth(): number | null {
  try { const saved = Number(window.localStorage.getItem(PANEL_KEY)); if (saved >= 480 && saved <= 1800) return saved; } catch { /* Not remembered without storage. */ }
  return null;
}

/**
 * 证见 Agent, laid out like Codex: an icon rail, a sidebar of projects and conversations, one conversation in the
 * middle, and every workbench module opening in a panel on the right, kept mounted once opened. The panel follows the
 * address hash, so a module that moves the user on (analysis sending a result to the report) moves the panel too.
 */
export default function AgentShell() {
  const knowledge = useKnowledge();
  const theme = useThemePreference('light');
  const { session: account, loading: accountLoading, error: sessionError, logout, refresh, mutate, identityEpoch, isCurrentAccount, isCurrentIdentity } = useHostedSession();
  const [accountNotice, setAccountNotice] = useState('');
  // Conversations belong to whoever is signed in; they are bound once the session is known and never shown to another.
  const owner = accountLoading ? null : account?.authenticated && account.user?.id ? account.user.id : 'guest';
  useEffect(() => { if (owner) threads.bind(owner); }, [owner]);
  const book = useSyncExternalStore(threads.subscribe, () => threads.view(owner), threads.serverSnapshot);
  const thread = book.threads.find(t => t.id === book.active) ?? null;
  const projectId = thread ? thread.projectId : book.draftProject;
  const displayScope: ReportRunScope = { owner: owner === 'guest' ? null : owner, epoch: identityEpoch, thread: thread?.id ?? null, project: projectId };
  const readReportScope = useCallback((): ReportRunScope => {
    const live = threads.view(owner), selected = live.threads.find(item => item.id === live.active);
    return { owner: owner && owner !== 'guest' && isCurrentAccount(owner, identityEpoch) ? owner : null, epoch: identityEpoch,
      thread: selected?.id ?? null, project: selected ? selected.projectId : live.draftProject };
  }, [owner, identityEpoch, isCurrentAccount]);
  const { panels, view, reportSource, publishProposal, sendToReport, tweakFigure, loadBenchmark, applyCandidate, reportVersions, restoreReportVersion, readRevisionSnapshot, reviseSection, applyArtifact, research } = useWorkbenchModules(true, projectId);
  const reportScope = `${owner ?? 'loading'}:${identityEpoch}:${projectId ?? 'local'}`;
  const activeReportRun = useRef<ReportRunHandle | null>(null);
  const preparingReport = useRef<{ id: string; scope: ReportRunScope } | null>(null);
  const [candidate, setCandidate] = useState<ReportCandidate | null>(null);
  const [lockedSections, setLockedSections] = useState<{ runId: string; ids: string[] }>({ runId: '', ids: [] });
  const [reviewNotice, setReviewNotice] = useState('');
  const visibleCandidate = candidate?.scope === reportScope && candidate.threadId === book.active ? candidate : null;
  const sourceKey = useMemo(() => reportSourceKey(reportSource), [reportSource]);
  const candidateConflict = !!visibleCandidate && (visibleCandidate.sourceKey !== sourceKey || !!reportSource.inputPending);
  const candidateChanges = useMemo(() => visibleCandidate ? reportChanges(visibleCandidate.before, visibleCandidate.preview) : [], [visibleCandidate]);
  const lockedSectionIds = lockedSections.runId === visibleCandidate?.runId ? lockedSections.ids : [];
  // Remove the legacy direct-key slot; credentials are entered only in the hosted model-service form.
  useEffect(() => { try { window.sessionStorage.removeItem('evix.agent.direct-api-key.v1'); } catch { /* no browser storage */ } }, []);
  const messages = thread?.messages ?? EMPTY_MESSAGES;
  const panel = useSyncExternalStore(subscribeHash, currentPanel, () => null);
  const outputId = useSyncExternalStore(subscribeHash, currentOutput, () => null);
  const [showCode, setShowCode] = useShowCode(owner);
  const [stage, setStage] = useStage(owner);
  const [hired, setHired] = useHired(owner);
  // In the report stage the conversation is a copilot card; it starts folded to a pill, as an assistant waits to be asked.
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [pickedSection, setPickedSection] = useState<string | null>(null);
  const [docFormat, setDocFormat] = useState<DocFormatMode>('latex');
  // Only requests dispatched in this mounted workspace may animate. Restored messages are records, not live jobs.
  const [activeCalls, setActiveCalls] = useState<{ id: string; owner: string; epoch: number }[]>([]);
  const startCall = useCallback((id: string, owner: string, epoch: number) => {
    setActiveCalls(calls => [...calls.filter(call => call.id !== id), { id, owner, epoch }]);
  }, []);
  const finishCall = useCallback((id: string) => setActiveCalls(calls => calls.filter(call => call.id !== id)), []);

  const [writingEnvelope, setWritingEnvelope] = useState<{ scope: ReportRunScope; status: LiveWritingStatus } | null>(null);
  const liveWriting = writingEnvelope && sameReportRunScope(writingEnvelope.scope, displayScope) ? writingEnvelope.status : null;
  const setReportWriting = useCallback((scope: ReportRunScope, update: LiveWritingStatus | null | ((previous: LiveWritingStatus) => LiveWritingStatus)) => {
    setWritingEnvelope(previous => {
      if (typeof update === 'function') return previous && sameReportRunScope(previous.scope, scope) ? { ...previous, status: update(previous.status) } : previous;
      return update ? { scope: { ...scope }, status: update } : previous && sameReportRunScope(previous.scope, scope) ? null : previous;
    });
  }, []);
  const autoFollowRef = useRef(true);
  const toggleAutoFollow = useCallback(() => {
    autoFollowRef.current = !autoFollowRef.current;
    setReportWriting(readReportScope(), previous => ({ ...previous, autoFollow: autoFollowRef.current }));
  }, [readReportScope, setReportWriting]);
  // Before any report exists in this browser the paper shows the blank template, as the editor would open it.
  const [blankReport] = useState(createEditorContent);
  const shortcut = useSyncExternalStore(subscribeNothing, searchKey, () => '⌘K');
  // The report is re-scored as it is typed; deferring keeps typing in the editor ahead of the benchmark.
  const deferredView = useDeferredValue(view);
  const light = useMemo(() => illuminate(deferredView), [deferredView]);
  const paperContent = visibleCandidate?.preview ?? view.report ?? blankReport;
  const paperRef = useRef<HTMLDivElement>(null);
  // The report check runs on whatever the paper shows, the blank template included, so the inspector always has a score.
  const paperBenchmark = useMemo(() => benchmarkReport(paperContent), [paperContent]);
  // The writing inspector stands where the module panel would, while the report fills the centre and no module is open.
  const inspecting = stage === 'paper' && !panel && !outputId;
  // A section picked from the outline is scrolled into view on the paper.
  const pickSection = useCallback((id: string) => {
    setPickedSection(id);
    const box = paperRef.current, target = box?.querySelector<HTMLElement>(`[data-report-section="${CSS.escape(id)}"]`);
    if (box && target) {
      const bounds = box.getBoundingClientRect(), toolbar = box.querySelector<HTMLElement>('[data-report-toolbar]');
      const inset = Math.max(24, (toolbar?.getBoundingClientRect().bottom ?? bounds.top) - bounds.top + 16);
      box.scrollTo({ top: Math.max(0, box.scrollTop + target.getBoundingClientRect().top - bounds.top - inset),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, []);
  const choreo = useLiveReportChoreography(paperRef, paperContent, pickSection);
  // In the report, [ and ] step to the previous and next section, as a reader pages through.
  const stepSection = useCallback((by: number) => {
    if (stage !== 'paper') return;
    const list = paperContent.report; if (!list.length) return;
    const at = list.findIndex(sec => sec.id === pickedSection);
    const next = list[Math.max(0, Math.min(list.length - 1, at < 0 ? (by > 0 ? 0 : list.length - 1) : at + by))];
    pickSection(next.id);
  }, [stage, paperContent, pickedSection, pickSection]);

  const traces = useMemo(() => traceExhibits(deferredView.report, deferredView.design), [deferredView]);
  // The plan makes room for the sections the registered results belong in.
  const plan = useMemo(() => deferredView.report ? reportPlan(deferredView.report, light.benchmark, (deferredView.report.quality?.results ?? []).map(suggestedNode)) : null, [deferredView, light]);
  const held = useMemo<ResultsView>(() => {
    const report = deferredView.report, results = report?.quality?.results ?? [];
    return report ? { results, findings: report.quality?.findings ?? [], pending: deferredView.resultPending, placed: results.filter(r => resultPlaced(report, r)).map(r => r.id) } : null;
  }, [deferredView]);

  // A result opened beside the conversation, while no module holds the panel and the result is known in this visit.
  const output = !panel && outputId ? held?.results.find(r => r.id === outputId) ?? null : null;
  const [visited, setVisited] = useState<RoomId[]>([]);
  if (stage === 'paper' && !visited.includes('editor')) setVisited([...visited, 'editor']);
  if (panel && panel !== 'overview' && !visited.includes(panel)) setVisited([...visited, panel]);
  const [railMenu, setRailMenu] = useState<'modules' | 'account' | null>(null);
  // Workbench modules are laid out for a whole screen. While a panel is open on a screen under 1680px the sidebar folds to
  // give it room and comes back when the panel closes; what the user chooses in either state is kept for that state.
  const viewport = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
  const crowded = viewport < 960 || ((!!panel || !!output) && viewport < 1680);
  const [sideAlone, setSideAlone] = useState(true), [sideBeside, setSideBeside] = useState(false);
  const sideOpen = crowded ? sideBeside : sideAlone;
  const setSideOpen = crowded ? setSideBeside : setSideAlone;
  const [expanded, setExpanded] = useState(false);
  const [artifactOpen,setArtifactOpen]=useState(false),[artifactNotice,setArtifactNotice]=useState<string|null>(null);
  // The panel takes seven tenths of the room beside the sidebar, or the width last dragged to, and always leaves the
  // conversation its minimum. Widths are read through stores so the first client render matches the server's.
  const savedWidth = useSyncExternalStore(subscribeNothing, savedPanelWidth, () => null);
  const [draggedWidth, setPanelWidth] = useState<number | null>(null);
  const room = viewport - RAIL - GUTTERS - (sideOpen ? SIDEBAR : 0);
  const available = Math.max(MIN_PANEL, room - MIN_TALK);
  const panelWidth = Math.min(available, draggedWidth ?? savedWidth ?? Math.round(Math.min(1240, Math.max(MIN_PANEL, room * 0.7))));
  const [dragging, setDragging] = useState(false);
  const [lastPanel, setLastPanel] = useState<RoomId | null>(null);
  const [lastModule, setLastModule] = useState<RoomId>('overview');
  const [shownPanel, setShownPanel] = useState(panel);
  const [canvasReturn, setCanvasReturn] = useState<{ nodeId: string; title: string } | null>(null);
  const [canvasFocus, setCanvasFocus] = useState<{ nodeId: string; token: number } | null>(null);
  if (shownPanel !== panel) {
    setShownPanel(panel);
    if (panel) setLastPanel(panel);
    if (panel && panel !== 'canvas') setLastModule(panel);
    if (!panel) setExpanded(false);
  }

  const inputRef = useRef<HTMLTextAreaElement>(null), scrollRef = useRef<HTMLDivElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  const railRef = useRef<HTMLElement>(null), launcherRef = useRef<HTMLDivElement>(null), modulesRef = useRef<HTMLButtonElement>(null);
  // A module picked from the launcher takes focus at its heading once the launcher has closed, the open one included,
  // so the keyboard goes on into it rather than losing its place.
  const focusPicked = useRef(false);
  useEffect(() => {
    if (railMenu || !focusPicked.current || !panel) return;
    focusPicked.current = false;
    headingRef.current?.focus();
  }, [railMenu, panel]);
  // The launcher takes focus when it opens, on the module already open or else the first, so the keyboard starts there.
  useEffect(() => {
    const launcher = launcherRef.current;
    if (railMenu === 'modules') (launcher?.querySelector<HTMLButtonElement>('button[aria-current="true"]') ?? launcher?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [railMenu]);
  // The rail's menus close on a click outside the rail, as the composer's menus do.
  useEffect(() => {
    if (!railMenu) return;
    const away = (event: PointerEvent) => { if (!railRef.current?.contains(event.target as Node)) setRailMenu(null); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [railMenu]);
  // Every way to the input goes through here. While the panel fills the screen the input is hidden, so the conversation
  // comes back first, synchronously, and a "/" typed to get there still lands in it.
  const focusInput = useCallback(() => {
    if (inputRef.current?.offsetParent === null) flushSync(() => setExpanded(false));
    inputRef.current?.focus();
  }, []);
  const go = useCallback((id: RoomId) => {
    if (id === 'services') { setArtifactOpen(false); setExpanded(true); }
    if (currentPanel() !== id) window.location.hash = id;
  }, []);
  const closePanel = useCallback(() => { window.location.hash = ''; }, []);
  const pick = (id: RoomId) => { focusPicked.current = true; setRailMenu(null); go(id); };
  const generation = useGeneration(publishProposal, go, projectId);
  const { account: generationAccount, load: loadLists, lists } = generation;
  // Projects and services fill the sidebar and the composer's menus as soon as an account is known.
  useEffect(() => { if (generationAccount === 'ready') loadLists(); }, [generationAccount, loadLists]);
  // Talking with a model is the user's choice, for this visit; every conversation asks once before its first sentence goes.
  // Without storage the choice is still kept for this page, in memory.
  // It belongs to the identity that chose it; another identity reads its own.
  const [modeHere, setModeHere] = useState<{ owner: string | null; mode: ChatMode } | null>(null);
  const storedMode = useSyncExternalStore(subscribeMode, () => readMode(owner), () => 'command' as ChatMode);
  const chatMode = modeHere && modeHere.owner === owner ? modeHere.mode : storedMode;
  const setChatMode = useCallback((mode: ChatMode) => { setModeHere({ owner, mode }); writeMode(owner, mode); }, [owner]);
  const consented = useRef(new Set<string>());
  const stagePreferences=useSyncExternalStore(subscribeModelPreferences,()=>getStageModelPreferences(owner),getServerStageModelPreferences);
  const chatService = resolveStageModelRoute('research.conversation', lists.services, stagePreferences).service;
  const reportService = resolveStageModelRoute('report.revision', lists.services, stagePreferences).service;
  const journeyModelRoutes = useMemo<Partial<Record<ModelCallId, JourneyModelRoute>>>(() => Object.fromEntries(MODEL_CALL_IDS.map(call => {
    const selected = resolveStageModelRoute(call, lists.services, stagePreferences);
    const source: JourneyModelRoute['source'] = selected.reason === 'stale_selection' || selected.reason === 'no_eligible' || selected.reason === 'unselected'
      ? selected.reason : selected.selectionSource === 'step' ? 'step' : selected.selectionSource === 'capability' ? 'task'
        : selected.selectionSource === 'default' ? 'default' : 'only_eligible';
    return [call, { selectedServiceId: stagePreferences.steps[call] ?? null, effectiveServiceId: selected.service?.id ?? null, source }];
  })), [lists.services, stagePreferences]);
  const openResearchStage = useCallback((id: ResearchStageId) => {
    research.open(id);
    const destinations: Record<ResearchStageId, RoomId> = {
      topic: 'diagnose', diagnosis: 'diagnose', literature: 'diagnose', questionnaire: 'design', sampling: 'sampling',
      pilot: 'silicon', collection: 'workspace', quality: 'analysis', analysis: 'analysis', findings: 'editor', report: 'editor',
      review: 'preflight', export: 'editor', defense: 'defense',
    };
    go(destinations[id]);
  }, [go, research]);

  const revisionScope = useCallback((): ReportRunScope => {
    const b = threads.view(owner), t = b.threads.find(item => item.id === b.active);
    if (!owner || owner === 'guest' || !isCurrentAccount(owner, identityEpoch)) return { owner: null, epoch: identityEpoch, thread: t?.id ?? null, project: t ? t.projectId : b.draftProject };
    return { owner, epoch: identityEpoch, thread: t?.id ?? null, project: t ? t.projectId : b.draftProject };
  }, [owner, identityEpoch, isCurrentAccount]);
  const openRevisionSettings = useCallback(() => go('services'), [go]);
  const revision = useSectionRevision({
    sectionId: pickedSection, scope: { owner: owner === 'guest' ? null : owner, epoch: identityEpoch, thread: thread?.id ?? null, project: projectId }, service: reportService, design: view.design,
    readScope: revisionScope, readSnapshot: readRevisionSnapshot, apply: reviseSection,
    mountEditor: () => setVisited(v => v.includes('editor') ? v : [...v, 'editor']),
    openSettings: openRevisionSettings, mutate, disabled: !!liveWriting?.active || !!visibleCandidate, disabledReason: visibleCandidate ? '请先采纳或关闭整稿候选，再修订当前报告。' : undefined, readDisabled: () => !!activeReportRun.current || !!preparingReport.current,
  });

  const draftWriter=useRef<{scope:string;write:(text:string)=>boolean}|null>(null);
  const artifactThreadId=`${thread?.id??''}`;
  const artifactProjectId=projectId==null?null:`${projectId}`;
  const composerScope=useMemo(()=>JSON.stringify([owner,identityEpoch,artifactThreadId,artifactProjectId]),[owner,identityEpoch,artifactThreadId,artifactProjectId]);
  const registerDraftWriter=useCallback((write:(text:string)=>boolean)=>{
    const registration={scope:composerScope,write};draftWriter.current=registration;
    return()=>{if(draftWriter.current===registration)draftWriter.current=null;};
  },[composerScope]);
  const readArtifactCurrent=useCallback(()=>{
    const b=threads.view(owner),t=b.threads.find(item=>item.id===b.active),actualProject=t?t.projectId:b.draftProject;
    const fresh=!!owner&&isCurrentIdentity(owner==='guest'?null:owner,identityEpoch)&&(b.active??'')===artifactThreadId&&actualProject===artifactProjectId;
    return {scope:fresh?artifactScope(owner!,artifactProjectId):null,content:readRevisionSnapshot()?.content??view.report,sectionId:pickedSection,blocked:!!activeReportRun.current||!!preparingReport.current||!!visibleCandidate};
  },[owner,identityEpoch,isCurrentIdentity,artifactThreadId,artifactProjectId,readRevisionSnapshot,view.report,pickedSection,visibleCandidate]);
  const prefillArtifactCommand=useCallback((text:string)=>{
    const captured=readArtifactCurrent().scope,registration=draftWriter.current;if(!captured||!registration)return;
    setArtifactNotice(null);setCopilotOpen(true);if(stage==='advisors')setStage('chat');
    window.requestAnimationFrame(()=>{if(readArtifactCurrent().scope!==captured||draftWriter.current!==registration)return;if(registration.scope!==composerScope||!registration.write(text))setArtifactNotice('输入框暂时无法加入指令，请保留现有草稿后重试。');});
  },[readArtifactCurrent,stage,setStage,composerScope]);
  const stableArtifactCandidate=useMemo(()=>visibleCandidate?.result&&!visibleCandidate.pending&&!visibleCandidate.failed?{id:visibleCandidate.runId,report:visibleCandidate.preview}:null,[visibleCandidate]);
  const sectionArtifactCandidate=useMemo(()=>revision.artifactCandidate?{id:revision.artifactCandidate.id,seed:sectionRevisionArtifact(revision.artifactCandidate)}:null,[revision.artifactCandidate]);
  const artifacts=useArtifactLibrary({owner,projectId,content:view.report,candidate:stableArtifactCandidate,sectionCandidate:sectionArtifactCandidate,selectedSectionId:pickedSection,readCurrent:readArtifactCurrent,apply:applyArtifact,onSay:prefillArtifactCommand});
  const examplePending=useRef(false);
  const addInfographicExample=useCallback(async()=>{
    const captured=readArtifactCurrent().scope;if(!captured||examplePending.current)return;
    const existing=artifacts.items.find(item=>item.origin==='内置示例');if(existing){artifacts.onSelect(existing.id);return;}
    examplePending.current=true;setArtifactNotice(null);
    try{const response=await fetch('/research-visuals/respondent-profile-concept.png');if(!response.ok)throw Error('示例素材暂时无法读取。');const blob=await response.blob();if(readArtifactCurrent().scope!==captured)return;await artifacts.onImport(new File([blob],'湖北主题受访者画像图.png',{type:'image/png'}),'diagram',{origin:'内置示例',classification:'simulated'});}
    catch(error){if(readArtifactCurrent().scope===captured)setArtifactNotice(error instanceof Error?error.message:'示例素材未能加入。');}
    finally{examplePending.current=false;}
  },[readArtifactCurrent,artifacts]);
  const openArtifactShelf=()=>{setVisited(v=>v.includes('editor')?v:[...v,'editor']);setArtifactOpen(v=>!v);};
  const artifactPanelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!artifactOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panelElement = artifactPanelRef.current;
    const frame = requestAnimationFrame(() => panelElement?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      if (previous?.isConnected && (document.activeElement === document.body || panelElement?.contains(document.activeElement))) previous.focus({ preventScroll: true });
    };
  }, [artifactOpen]);

  const openFromCanvas = useCallback((target: Section, nodeId: string, title: string) => { setCanvasReturn({ nodeId, title }); window.location.hash = target; }, [setCanvasReturn]);
  const showWorkbench = useCallback(() => { window.location.hash = lastModule; }, [lastModule]);
  const nav = useMemo<WorkbenchNav>(() => ({ section: panel ?? 'overview', openFromCanvas, showWorkbench, canvasFocus }), [panel, openFromCanvas, showWorkbench, canvasFocus]);
  const backToCanvas = () => {
    if (canvasReturn) setCanvasFocus({ nodeId: canvasReturn.nodeId, token: Date.now() });
    setCanvasReturn(null);
    window.location.hash = 'canvas';
  };

  // A panel opened by the user takes focus at its heading; one opened from the composer leaves the keyboard there.
  const lastFocusPanel = useRef<RoomId | null | undefined>(undefined);
  useEffect(() => {
    if (panel !== currentPanel()) return;
    if (lastFocusPanel.current === undefined || lastFocusPanel.current === panel) { lastFocusPanel.current = panel; return; }
    lastFocusPanel.current = panel;
    if (!panel || panel === 'canvas' || document.activeElement === inputRef.current) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  // What the agent routes against is read when a message is sent, so its handlers stay stable.
  const toggleSide = () => setSideOpen(!sideOpen);
  const report = deferredView.report, design = deferredView.design, dataset = deferredView.dataset, liveReport = view.report;
  // The editor must be mounted to take a figure change; it then stays mounted, hidden, as a visited module does.
  const mountEditor = useCallback(() => setVisited(v => v.includes('editor') ? v : [...v, 'editor']), []);
  const latest = useRef({ projectId, reportScope, reportSource, csrfToken: account?.csrfToken, panel, light, theme, knowledge, traces, held, plan, report, liveReport, design, dataset, generation, owner, identityEpoch, isCurrentAccount, lastPanel, toggleSide, chatMode, chatService, reportService, mutate, outputId, tweakFigure, mountEditor, stepSection });
  useLayoutEffect(() => { latest.current = { projectId, reportScope, reportSource, csrfToken: account?.csrfToken, panel, light, theme, knowledge, traces, held, plan, report, liveReport, design, dataset, generation, owner, identityEpoch, isCurrentAccount, lastPanel, toggleSide, chatMode, chatService, reportService, mutate, outputId, tweakFigure, mountEditor, stepSection }; });
  const stopChoreography = choreo.stop;
  const stopReportRun = useCallback((reason = '已取消运行；原稿已保留。已发出的调用可能仍计费，请核对回执。') => {
    preparingReport.current = null;
    const run = activeReportRun.current;
    if (run) {
      activeReportRun.current = null; run.controller.abort();
      finishCall(run.messageId);
      threads.patch(run.messageId, message => message.role === 'agent' ? { ...message, model: message.model ? { ...message.model, status: 'unknown' } : undefined, turn: { lines: [[span(reason, 'dim')]], chips: [{ label: '核对本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${run.runId}` } }] } } : message);
      setCandidate(previous => previous?.runId === run.runId ? { ...previous, pending: false, failed: reason } : previous);
      setReportWriting(run.scope, previous => ({ ...previous, active: false, phase: 'cancelled' }));
    }
    stopChoreography();
  }, [stopChoreography, finishCall, setReportWriting]);
  useLayoutEffect(() => {
    const scope: ReportRunScope = { owner: owner === 'guest' ? null : owner, epoch: identityEpoch, thread: thread?.id ?? null, project: projectId };
    const run = activeReportRun.current;
    if (run && !sameReportRunScope(run.scope, readReportScope())) stopReportRun('账号、项目或对话已切换。本次运行已停止接收，请核对原对话中的调用回执。');
    else stopChoreography();
    return () => {
      const current = activeReportRun.current;
      if (current && sameReportRunScope(current.scope, scope)) stopReportRun('账号、项目或对话已切换。本次运行已停止接收，请核对原对话中的调用回执。');
      if (preparingReport.current && sameReportRunScope(preparingReport.current.scope, scope)) preparingReport.current = null;
      setReportWriting(scope, null);
    };
  }, [owner, identityEpoch, thread?.id, projectId, readReportScope, stopReportRun, stopChoreography, setReportWriting]);
  useEffect(() => () => { activeReportRun.current?.controller.abort(); activeReportRun.current = null; preparingReport.current = null; }, []);

  const agent = useMemo(() => {
    // Read the store synchronously at dispatch: a selection can change before the next effect updates `latest`.
    const currentService = (task: ModelTask, call?:ModelCallId) => resolveStageModelRoute(call??(task==='research'?'research.conversation':task==='questionnaire'?'survey.questionnaire':'report.draft'), latest.current.generation.lists.services, getStageModelPreferences(latest.current.owner)).service;
    // Commands always run here, in the browser; other sentences go to the model when the user has chosen to talk with one.
    const send = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (/^[/／]密钥(?:\s|$)|\bsk-[A-Za-z0-9_-]{12,}/u.test(text)) {
        say([span('检测到可能的服务密钥，本条内容未写入对话。请在模型设置中接入服务。', 'dim')]); go('services'); return;
      }
      if (restyle(text)) return;
      if (latest.current.chatMode === 'model' && !/^[/／]/u.test(text)) ask(text);
      else local(text);
    };
    // With an output open, a sentence about its figure changes the report's figure directly, in either mode: no model is
    // needed to recolour a chart. The reply lists each change, from what it was to what it is now.
    const restyle = (text: string) => {
      const { outputId, liveReport, tweakFigure, mountEditor } = latest.current;
      const result = outputId && liveReport ? liveReport.quality?.results.find(r => r.id === outputId) : undefined;
      const request = result ? parseFigureRequest(text) : null;
      if (!result || !liveReport || !request) return false;
      const lines: Line[] = [];
      let changed = false;
      if (Object.keys(request.change).length) {
        try {
          const preview = applyFigureChange(liveReport, result.id, request.change);
          if (preview.changes.length) {
            mountEditor();
            tweakFigure({ id: crypto.randomUUID(), resultId: result.id, change: request.change });
            lines.push([span('已改「'), span(result.title, 'strong'), span('」的图：')], ...preview.changes.map(c => [span('· ', 'dim'), span(c, 'teal')]));
            changed = true;
          } else lines.push([span('图已经是这样了，没有改动。', 'dim')]);
        } catch (error) { lines.push([span('没有改：', 'error'), span((error as Error).message)]); }
      }
      for (const note of request.unsupported) lines.push([span(note, 'dim')]);
      if (changed) lines.push([span('◆ ', 'cyan'), span('改动写进了报告，在「报告与 PPT」里可以撤销。', 'dim')]);
      threads.append([{ ...stamp(), role: 'user', text }, { ...stamp(), role: 'agent', turn: { lines } }]);
      return true;
    };
    const local = (text: string) => {
      const { panel, light, theme, traces, held, plan, report, design, dataset, generation } = latest.current;
      const user: Message = { ...stamp(), role: 'user', text };
      const routed = route(text, { room: panel, light, theme, traces, results: held, plan, projectTitle: report?.title || design?.title, design, datasetName: dataset?.name });
      if ('draft' in routed) { threads.append([user]); askDraft(routed.draft); return; }
      // Drafting with a model always starts with the user's consent, never with a call.
      if ('generate' in routed) { threads.append([user, { ...stamp(), role: 'agent', turn: generation.start(routed.generate) }]); return; }
      if ('lookup' in routed) { threads.append([user, { ...stamp(), role: 'pending', query: routed.lookup, explicit: routed.explicit }]); return; }
      threads.append([user, { ...stamp(), role: 'agent', turn: routed.turn }]);
      if (routed.turn.act) perform(routed.turn.act);
    };
    // The first sentence of a conversation waits for consent: what goes to the service, what never does, who pays.
    const ask = (text: string) => {
      const { generation, owner, identityEpoch } = latest.current;
      const chatService = currentService('research');
      if (generation.account !== 'ready' || !chatService) {
        // Whatever the sentence routes to here, the user learns why the model was not asked.
        local(text);
        say([span(generation.account === 'ready' ? '请在输入框选择当前对话模型，或到模型设置接入服务，' : '用模型对话需要先登录，', 'dim'), span('这一句按指令模式回答。', 'dim')]);
        return;
      }
      threads.append([{ ...stamp(), role: 'user', text }]);
      if (text.length > TEXT_LIMIT) { say([span(`模型对话一次最多 ${TEXT_LIMIT} 字，这一句有 ${text.length} 字；请分开发送。`, 'error')]); return; }
      const thread = threads.view(owner).active;
      if (thread && consented.current.has(`${owner}:${identityEpoch}:${thread}:${chatService.id}:${chatService.revision}`)) { turn(text); return; }
      threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('发给模型之前请确认：')]], cards: [{ kind: 'confirm', title: `用「${chatService.label} · ${chatService.model} · v${chatService.revision}」回答`,
        lines: [[span('发送：这句话、这段对话最近的 '), span(String(HISTORY_LIMIT), 'gold'), span(' 条，项目照度、盲区、可回溯图表与已登记结果数量的摘要；模型请求时，还有已登记结果的标题、方法、有效样本、主要统计量与提醒，以及已确认研究发现的标题与解释。')],
          [span('不发送：问卷、原始数据与报告正文。模型看不到原始数据，也不能改动项目；它请求的操作由这里执行，改动前仍会问你。', 'dim')],
          [span(`模型读完工具结果后可能接着回答，一句话最多调用 ${MAX_STEPS} 次；费用按你的服务商计。这段对话之后的句子不再询问。`, 'dim')]],
        confirm: { label: '发送', action: { type: 'chat', text, modelBinding: { owner: owner!, identityEpoch, serviceId: chatService.id, serviceRevision: chatService.revision } } }, cancel: '不发送' }] } }]);
    };
    const say = (line: Line, chips?: AgentTurn['chips']) => threads.append([{ ...stamp(), role: 'agent', turn: { lines: [line], chips } }]);
    // `next` continues a sentence from what the previous step's tools found; without it, a new sentence starts.
    // `seen` holds the tools already run for this sentence: a repeat draws no second card and finds nothing new. A
    // continuation keeps the service the sentence began with, the one the user agreed to, even if the menu has moved on.
    const turn = (text: string, next?: Chain, selectedService?: Service) => {
      const { panel, light, traces, held, owner, mutate, identityEpoch, isCurrentAccount } = latest.current;
      const callOwner = next?.owner ?? owner, callEpoch = next?.epoch ?? identityEpoch;
      if (!callOwner || !isCurrentAccount(callOwner, callEpoch)) return false;
      const chatService = next?.service ?? selectedService ?? currentService('research');
      if (!chatService) return false;
      // A later step stays in the sentence's own conversation, whichever one is open now, and stops if it was deleted.
      const book = threads.view(owner), home = next ? threads.threadOf(next.after) : book.threads.find(t => t.id === book.active);
      if (next && !home) return false;
      const messages = home?.messages ?? [];
      const asked = messages.map(m => m.role === 'user' && m.text === text).lastIndexOf(true);
      // A sentence whose consent card was declined, or never answered, was not sent and is not sent later either.
      const declined = new Set(messages.flatMap((m, i) => m.role === 'agent' && m.answered !== 'confirmed'
        && m.turn.cards?.some(card => card.kind === 'confirm' && card.confirm.action.type === 'chat') ? [i - 1] : []));
      // A continuation sees the whole sentence so far: the reply and the tools' cards come after the question.
      const said = (next ? messages : messages.slice(0, asked < 0 ? messages.length : asked)).filter((_, i) => !declined.has(i));
      const request: ChatRequest = { schemaVersion: 1, idempotencyKey: crypto.randomUUID(), message: text, history: chatHistory(said.flatMap(chatLine)),
        context: chatContext(panel, light, traces, held), serviceId: chatService.id, serviceRevision: chatService.revision, consent: true,
        ...(next ? { step: next.step, toolResults: next.results } : {}) };
      const waiting: Message = { ...stamp(), role: 'agent', model: { service: chatService.label, serviceId: chatService.id, serviceRevision: chatService.revision, provider: chatService.provider, modelName: chatService.model, step: next?.step ?? 1, status: 'running' }, turn: { lines: next
        ? [[span('正在根据工具结果接着回答…', 'dim')]]
        : [[span('正在请'), span(`「${chatService.label}」`, 'strong'), span('回答…', 'dim')]] } };
      if (next) threads.appendAfter(next.after, waiting); else threads.append([waiting]);
      const seen = next?.seen ?? new Set<string>();
      startCall(waiting.id, callOwner, callEpoch);
      sendChatTurn(mutate, request).then(receipt => { if (isCurrentAccount(callOwner, callEpoch)) settle(waiting.id, receipt, chatService.label, seen, chatService, callOwner, callEpoch); }, failure => { if (isCurrentAccount(callOwner, callEpoch)) fail(waiting.id, failure, request.idempotencyKey, text); }).finally(() => finishCall(waiting.id));
      return true;
    };
    // How a model call ended, on the message that holds it; the service and step stay those it was sent with.
    const mark = (messageId: string, status: NonNullable<ModelCall['status']>, service?: string, step?: number, usage?: TokenUsage | null) =>
      threads.patch(messageId, m => m.role === 'agent' && m.model ? { ...m, model: { ...m.model, ...(service ? { service } : {}), ...(step ? { step } : {}), ...(usage ? { usage } : {}), status } } : m);
    // What the call cost, beside the answer, when the provider said.
    const spent = (usage: TokenUsage | null) => (usage ? [span(' · ', 'dim'), span(usageText(usage), 'dim')] : []);
    const replace = (messageId: string, next: AgentTurn) => threads.patch(messageId, m => m.role === 'agent' ? { ...m, turn: next } : m);
    // A receipt in place of the waiting line: the reply, marked as unverified, then each tool it asked for, run here.
    // A receipt read back by 核对回执 has no chain to continue: it settles, and the user can ask again from there.
    const settle = (messageId: string, receipt: ChatReceipt, label: string, seen = new Set<string>(), service?: Service, callOwner?: string, callEpoch?: number) => {
      if (receipt.status === 'ready' && receipt.reply) {
        mark(messageId, 'ready', label, receipt.step, receipt.usage);
        replace(messageId, { lines: [...replyLines(receipt.reply), [span('◆ ', 'cyan'), span(`${label} 的回答，未经核实；项目里的数字以工具读到的为准。`, 'dim'), ...spent(receipt.usage)]] });
        const asked = receipt.message;
        if (receipt.droppedActions) threads.appendAfter(messageId, { ...stamp(), role: 'agent', turn: { lines: [[span(`模型还请求了 ${receipt.droppedActions} 个不在清单里的操作，没有执行。`, 'dim')]] } });
        // What the read-only tools found goes back to the model, until the sentence's last step.
        const fresh = receipt.actions.filter(action => { const key = action.tool + JSON.stringify(action.args); return !seen.has(key) && !!seen.add(key); });
        const current = () => !!callOwner && callEpoch !== undefined && latest.current.isCurrentAccount(callOwner, callEpoch) && !!threads.threadOf(messageId);
        void Promise.all(fresh.map(action => run(messageId, action, current))).then(found => {
          if (!current()) return;
          const results = found.filter((r): r is ToolResult => !!r).slice(0, 4);
          if (results.length && asked && service && callOwner && callEpoch !== undefined && receipt.step < MAX_STEPS) turn(asked, { step: receipt.step + 1, results, seen, service, after: messageId, owner: callOwner, epoch: callEpoch });
        });
      } else if (receipt.status === 'failed') {
        mark(messageId, 'failed', label, receipt.step, receipt.usage);
        replace(messageId, { lines: [[span('这一轮没有完成：', 'error'), span(CHAT_ERRORS[receipt.errorCode ?? ''] ?? '模型服务出错了。'), ...spent(receipt.usage)]], chips: receipt.message ? [{ label: '再问一次', action: { type: 'say', text: receipt.message } }] : undefined });
      } else {
        mark(messageId, 'unknown', label, receipt.step);
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span('这一轮已记下；核对只读取回执，不会再次调用模型。')]], chips: [{ label: '核对回执', action: { type: 'check', turn: receipt.id, message: messageId }, primary: true }] });
      }
    };
    const fail = (messageId: string, failure: unknown, turnId: string, text: string) => {
      if (failure instanceof HostedApiError && isDefiniteChatRejection(failure.status, failure.code)) {
        mark(messageId, 'refused');
        replace(messageId, { lines: [[span('这一轮没有发出：', 'error'), span(CHAT_ERRORS[failure.code] ?? errorMessage(failure))]], chips: [{ label: '再问一次', action: { type: 'say', text } }] });
      } else {
        mark(messageId, 'unknown');
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span(`${errorMessage(failure)} 这一轮可能已经记下；核对只读取回执，不会再次调用模型。`)]], chips: [{ label: '核对回执', action: { type: 'check', turn: turnId, message: messageId }, primary: true }] });
      }
    };
    const check = (turnId: string, messageId: string) => {
      const { owner, identityEpoch, isCurrentAccount } = latest.current;
      const current = () => !!owner && isCurrentAccount(owner, identityEpoch) && !!threads.threadOf(messageId);
      if (!current()) return;
      // The call is credited to the service it went to. A message from before calls were recorded does not name one, so
      // it is recorded as unknown rather than credited to whichever service is chosen now.
      const sent = threads.find(messageId);
      const label = sent?.role === 'agent' && sent.model ? sent.model.service : UNRECORDED_SERVICE;
      if (sent?.role === 'agent' && !sent.model) threads.patch(messageId, m => m.role === 'agent' ? { ...m, model: { service: label, step: 1, status: 'unknown' } } : m);
      replace(messageId, { lines: [[span('正在核对回执…', 'dim')]] });
      readChatTurn(turnId).then(receipt => { if (current()) settle(messageId, receipt, label, new Set(), undefined, owner!, identityEpoch); },
        failure => !current() ? undefined : failure instanceof HostedApiError && failure.status === 404
          ? (mark(messageId, 'refused'), replace(messageId, { lines: [[span('这一轮没有发出，', 'error'), span('没有产生费用，可以再问一次。')]] }))
          : fail(messageId, failure, turnId, ''));
    };

    // Drafting a report section: consent first, every time, naming what goes to the service and the number rule.
    const askDraft = (nodeId: string) => {
      const { generation, held, report, owner, identityEpoch } = latest.current;
      const reportService = currentService('report');
      const title = blueprintNode(nodeId).title;
      if (generation.account !== 'ready') { say([span('起草要调用你自己的模型服务，需要先登录。', 'dim')], [{ label: '邮箱登录 ↗', action: { type: 'href', href: '/login' }, primary: true }]); return; }
      if (!held || !report) { say([span(`起草「${title}」要先读到报告与登记结果；这次访问还没有打开报告与 PPT。`, 'dim')], [{ label: '/报告', action: { type: 'say', text: '/报告' }, primary: true }]); return; }
      if (!reportService) { say([span('请到模型设置的「任务分工」选择报告拟稿服务；服务需启用报告能力。', 'dim')], [{ label: '/模型', action: { type: 'say', text: '/模型' }, primary: true }]); return; }
      const facts = draftFacts(held, nodeId).length, findings = standingFindings(held).length, existing = sectionText(report, nodeId).length;
      const outline = SYNTHESIS_NODES.has(nodeId) ? reportOutline(report, nodeId).length : 0;
      threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('起草之前请确认：')]], cards: [{ kind: 'confirm', title: `用「${reportService.label} · ${reportService.model} · v${reportService.revision}」起草「${title}」`,
        lines: [
          [span('发送：这一节在报告蓝图里的写作要求（目的、步骤、需要的元素）、课题名称与目的、'), span(String(facts), 'gold'),
            span(' 条事实（已登记结果的方法、有效样本、统计量与表中数字）、'), span(String(findings), 'gold'), span(` 条已确认研究发现的标题与解释${existing ? `、本节已有的 ${existing} 字正文` : ''}${outline ? `，以及报告其他 ${outline} 个章节的标题与开头摘录（每节至多 400 字），供这一节概括` : ''}。`)],
          [span(outline ? '不发送：问卷题目、原始数据，以及其他章节在摘录以外的正文。' : '不发送：问卷题目、原始数据与报告其他章节的正文。', 'dim')],
          [span('模型只能用事实编号引用数字，自己写了数字的段落整段丢弃；数字由这里按登记结果填入。拟稿未经核实，你确认后才写进报告。费用按你的服务商计。', 'dim')],
        ], confirm: { label: '起草', action: { type: 'draft', node: nodeId, modelBinding: { owner: owner!, identityEpoch, serviceId: reportService.id, serviceRevision: reportService.revision } } }, cancel: '不起草' }] } }]);
    };
    const draftNow = (nodeId: string, binding?: ModelConsentBinding) => {
      const { held, report, design, mutate, owner, identityEpoch, isCurrentAccount } = latest.current;
      if (!owner || !isCurrentAccount(owner, identityEpoch)) return false;
      const reportService = currentService('report');
      if (!matchesModelConsent(binding, owner, identityEpoch, reportService)) { say([span('模型配置或登录状态已变化，请重新确认本次拟稿。', 'dim')]); askDraft(nodeId); return false; }
      if (!reportService || !held || !report) { askDraft(nodeId); return false; }
      const title = blueprintNode(nodeId).title;
      const { request, facts } = draftRequest({ nodeId, held, content: report, design, service: reportService });
      const waiting: Message = { ...stamp(), role: 'agent', model: { service: reportService.label, serviceId: reportService.id, serviceRevision: reportService.revision, provider: reportService.provider, modelName: reportService.model, step: 1, status: 'running' },
        turn: { lines: [[span('正在请'), span(`「${reportService.label}」`, 'strong'), span(`起草「${title}」…`, 'dim')]] } };
      threads.append([waiting]);
      startCall(waiting.id, owner, identityEpoch);
      sendDraft(mutate, request).then(receipt => { if (owner && isCurrentAccount(owner, identityEpoch)) settleDraft(waiting.id, receipt, reportService.label, nodeId, facts); }, failure => { if (owner && isCurrentAccount(owner, identityEpoch)) failDraft(waiting.id, failure, request.idempotencyKey, nodeId, facts); }).finally(() => finishCall(waiting.id));
      return true;
    };
    const draftError = (code: string | null) => code === 'capability_unavailable' ? '这个模型服务没有启用「报告」能力。' : CHAT_ERRORS[code ?? ''] ?? '模型服务出错了。';
    // A draft in place of the waiting line: its paragraphs with each fact's value in gold, marked unverified, ready to adopt.
    const settleDraft = (messageId: string, receipt: DraftReceipt, label: string, nodeId: string, facts: Fact[]) => {
      const title = blueprintNode(nodeId).title, again = { label: '重新起草', action: { type: 'say' as const, text: `/起草 ${title}` } };
      if (receipt.status === 'ready' && receipt.paragraphs.length) {
        mark(messageId, 'ready', label, 1, receipt.usage);
        replace(messageId, {
          lines: [[span(`「${title}」拟稿 `), span(String(receipt.paragraphs.length), 'gold'), span(' 段：')], ...receipt.paragraphs.map(p => draftLine(p, facts)),
            ...(receipt.droppedParagraphs ? [[span(`模型另写了 ${receipt.droppedParagraphs} 段自造数字或引用了不存在的事实，已丢弃。`, 'dim')]] : []),
            [span('◆ ', 'cyan'), span(`${label} 的拟稿，未经核实；金色数字由登记结果填入。`, 'dim'), ...spent(receipt.usage)]],
          chips: [{ label: `写进「${title}」`.slice(0, 26), action: { type: 'adopt', node: nodeId, paragraphs: receipt.paragraphs.map(p => draftText(p, facts)),
            cited: [...new Set(receipt.paragraphs.flatMap(p => p.facts))].flatMap(id => facts.filter(f => f.id === id).map(f => f.text)) }, primary: true }, again],
        });
      } else if (receipt.status === 'failed' || receipt.status === 'ready') {
        mark(messageId, 'failed', label, 1, receipt.usage);
        replace(messageId, { lines: [[span('这次起草没有完成：', 'error'), span(draftError(receipt.errorCode)), ...spent(receipt.usage)]], chips: [again] });
      } else {
        mark(messageId, 'unknown', label, 1);
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span('这次起草已记下；核对只读取回执，不会再次调用模型。')]],
          chips: [{ label: '核对回执', action: { type: 'checkDraft', draft: receipt.id, message: messageId, node: nodeId, facts }, primary: true }] });
      }
    };
    const failDraft = (messageId: string, failure: unknown, draftId: string, nodeId: string, facts: Fact[]) => {
      const again = { label: '重新起草', action: { type: 'say' as const, text: `/起草 ${blueprintNode(nodeId).title}` } };
      if (failure instanceof HostedApiError && isDefiniteChatRejection(failure.status, failure.code)) {
        mark(messageId, 'refused');
        replace(messageId, { lines: [[span('这次起草没有发出：', 'error'), span(failure.code === 'capability_unavailable' ? draftError(failure.code) : CHAT_ERRORS[failure.code] ?? errorMessage(failure))]], chips: [again] });
      } else {
        mark(messageId, 'unknown');
        replace(messageId, { lines: [[span('结果尚未明确：', 'error'), span(`${errorMessage(failure)} 这次起草可能已经记下；核对只读取回执，不会再次调用模型。`)]],
          chips: [{ label: '核对回执', action: { type: 'checkDraft', draft: draftId, message: messageId, node: nodeId, facts }, primary: true }] });
      }
    };
    const checkDraft = (draftId: string, messageId: string, nodeId: string, facts: Fact[]) => {
      const { owner, identityEpoch, isCurrentAccount } = latest.current;
      const current = () => !!owner && isCurrentAccount(owner, identityEpoch) && !!threads.threadOf(messageId);
      if (!current()) return;
      const sent = threads.find(messageId);
      const label = sent?.role === 'agent' && sent.model ? sent.model.service : UNRECORDED_SERVICE;
      replace(messageId, { lines: [[span('正在核对回执…', 'dim')]] });
      readDraft(draftId, new Set(facts.map(f => f.id))).then(receipt => { if (current()) settleDraft(messageId, receipt, label, nodeId, facts); },
        failure => !current() ? undefined : failure instanceof HostedApiError && failure.status === 404
          ? (mark(messageId, 'refused'), replace(messageId, { lines: [[span('这次起草没有发出，', 'error'), span('没有产生费用，可以重新起草。')]] }))
          : failDraft(messageId, failure, draftId, nodeId, facts));
    };
    // The knowledge index loads once per visit; a lookup in the loop waits for it a little rather than going unanswered.
    const knowledgeReady = async (current: () => boolean, limit = 10_000) => {
      for (const started = Date.now(); current() && !latest.current.knowledge.ready && Date.now() - started < limit;) await new Promise(resolve => setTimeout(resolve, 250));
      return current() && latest.current.knowledge.ready;
    };
    // A tool the model asked for, run as the matching command runs; drafting still begins with its own consent card.
    // A read-only tool's finding is returned so it can go back to the model.
    const run = async (afterId: string, action: ChatAction, current: () => boolean): Promise<ToolResult | null> => {
      if (!current()) return null;
      const { panel, light, theme, traces, held, plan, report, design, dataset, generation, knowledge } = latest.current;
      const routed = toolTurn(action, { room: panel, light, theme, traces, results: held, plan, projectTitle: report?.title || design?.title, design, datasetName: dataset?.name });
      if ('draft' in routed) return null;
      if ('generate' in routed) { threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: generation.start(routed.generate) }); return null; }
      if ('lookup' in routed) {
        let found: AgentTurn;
        if (!(knowledge.ready || await knowledgeReady(current))) found = { lines: [[span('知识镜还在加载，这次没有查到「', 'dim'), span(routed.lookup, 'strong'), span('」，稍后可以再问。', 'dim')]] };
        else {
          if (!current()) return null;
          try { found = lookupTurn(routed.lookup, await latest.current.knowledge.search(routed.lookup), routed.explicit); }
          catch { found = { lines: [[span('知识镜暂时没有回应，请稍后再问。', 'error')]] }; }
        }
        if (!current()) return null;
        threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: found });
        return { tool: 'lookup', text: turnText(found) };
      }
      threads.appendAfter(afterId, { ...stamp(), role: 'agent', turn: routed.turn });
      if (routed.turn.act) perform(routed.turn.act);
      return isResultTool(action.tool) ? { tool: action.tool, text: turnText(routed.turn) } : null;
    };
    const perform = (action: AgentAction) => {
      switch (action.type) {
        case 'open': go(action.room); break;
        case 'theme': saveTheme(action.theme); break;
        case 'search': latest.current.knowledge.openSearch(); break;
        case 'entry': latest.current.knowledge.open(action.id); break;
        case 'clear': { const active = threads.view(latest.current.owner).active; if (active) threads.remove(active); focusInput(); break; }
        // Only paths of this site; a stored conversation is never trusted to navigate anywhere else.
        case 'href': if (/^\/(?!\/)/.test(action.href)) window.location.assign(action.href); break;
        case 'say': send(action.text); break;
        case 'chat': {
          const { owner, identityEpoch } = latest.current, thread = threads.view(owner).active;
          const chatService = currentService('research');
          if (!matchesModelConsent(action.modelBinding, owner, identityEpoch, chatService)) { say([span('模型配置或登录状态已变化，请重新确认发送。', 'dim')]); ask(action.text); return false; }
          const started = turn(action.text, undefined, chatService ?? undefined);
          if (started && thread && chatService) consented.current.add(`${owner}:${identityEpoch}:${thread}:${chatService.id}:${chatService.revision}`);
          return started;
        }
        case 'check': check(action.turn, action.message); break;
        case 'draft': return draftNow(action.node, action.modelBinding);
        case 'checkDraft': checkDraft(action.draft, action.message, action.node, action.facts); break;
        // A draft adopted from a stored conversation is checked again: a blueprint section, a few paragraphs of text.
        case 'adopt': {
          let title: string;
          try { title = blueprintNode(action.node).title; } catch { break; }
          const paragraphs = action.paragraphs.filter(p => typeof p === 'string' && p.trim()).slice(0, 8).map(p => p.slice(0, 2000));
          if (!paragraphs.length) break;
          // A draft's numbers stand only while the facts it cites are still the project's facts, word for word.
          const { liveReport } = latest.current;
          const current = liveReport ? new Set(draftFacts({ results: liveReport.quality?.results ?? [], findings: [], pending: false, placed: [] }, action.node).map(f => f.text)) : null;
          if (!current || !Array.isArray(action.cited) || action.cited.some(text => typeof text !== 'string' || !current.has(text))) {
            say([span(current ? '登记结果在起草之后变了，拟稿里的数字可能已经过时，没有写入。' : '要先读到报告与登记结果才能核对拟稿里的数字；打开报告与 PPT 后再写入。', 'error')],
              [current ? { label: '重新起草', action: { type: 'say', text: `/起草 ${title}` }, primary: true } : { label: '/报告', action: { type: 'say', text: '/报告' }, primary: true }]);
            break;
          }
          sendToReport({ id: crypto.randomUUID(), node: action.node, source: '证见 Agent 拟稿', items: paragraphs.map(text => ({ kind: 'paragraph', text })) });
          go('editor');
          say([span(`已把拟稿交给报告与 PPT，写进「${title}」；可以在编辑器里修改或撤销。`, 'dim')]);
          break;
        }
        // The report applies it as one undoable step once its editor is open, as it does for the sampling module.
        case 'place':
          sendToReport({ id: crypto.randomUUID(), node: '', source: '证见 Agent', items: action.results.map(resultId => ({ kind: 'result', resultId })) });
          go('editor');
          say([span('已交给右侧的报告与 PPT 写入；写了哪些内容会显示在编辑器顶部，可以撤销。', 'dim')]);
          break;
        case 'setApiKey': {
          say([span('请在「模型设置」中保存服务密钥。对话框不会保存或使用直接粘贴的密钥。', 'dim')], [{ label: '打开模型设置', action: { type: 'open', room: 'services' } }]);
          go('services');
          break;
        }
        case 'generateFullReport': {
          if (activeReportRun.current || preparingReport.current) { say([span('当前已有候选稿任务在准备或生成，请等待完成或取消运行。', 'dim')]); break; }
          const current = latest.current;
          const service = currentService('report','report.full');
          if (!current.owner || current.owner === 'guest' || current.generation.account !== 'ready' || !service || !current.csrfToken) {
            say([span('生成候选稿需要登录并在模型设置中选择可用的报告服务。', 'dim')]); go('services'); break;
          }
          const requestScope = readReportScope();
          if (requestScope.owner !== current.owner || requestScope.epoch !== current.identityEpoch || requestScope.project !== current.projectId) {
            say([span('登录或项目已变化，请等待当前资料就绪后重新生成。', 'dim')]); break;
          }
          const source = current.reportSource;
          if (source.inputPending) { say([span('原稿或研究资料仍在载入，请等待载入完成后再生成。', 'dim')]); break; }
          const mode = action.mode ?? (source.dataset?.kind === 'simulated' ? 'demonstration' : source.dataset ? 'empirical' : 'plan');
          if (mode === 'demonstration' && hasUserResearchSource(source)) {
            say([span('当前工作区已有用户资料。请新建空白项目载入教学模拟，避免混用研究来源。', 'dim')]); go('workspace'); break;
          }
          if (mode !== 'demonstration' && !source.design) {
            say([span('先完成调查设计，再以当前资料生成研究方案或实证候选稿。空白工作区也可明确载入教学模拟。', 'dim')], [{ label: '打开调查设计', action: { type: 'open', room: 'design' }, primary: true }, { label: '教学模拟', action: { type: 'generateFullReport', topic: action.topic, mode: 'demonstration' } }]); break;
          }
          if (mode === 'empirical' && !current.projectId) { say([span('真实资料报告需要先关联一个项目，以便核对调用归属和资料版本。', 'dim')]); go('workspace'); break; }
          const topic = (action.topic.trim() || source.design?.title || source.report?.title || '当前研究课题').slice(0, 160);
          const before = source.report ?? blankReport;
          const base = source.design && (mode !== 'demonstration' || source.dataset?.kind === 'simulated') ? { design: source.design, dataset: source.dataset, report: before } : undefined;
          const sourceKey = reportSourceKey(source), scope = current.reportScope, callOwner = current.owner, callEpoch = current.identityEpoch;
          const preparation = { id: crypto.randomUUID(), scope: { ...requestScope } };
          preparingReport.current = preparation;
          setCopilotOpen(true);
          void (async () => {
            let handle: ReportRunHandle | null = null;
            try {
              const inputRevision = await fullReportInputRevision({ topic, mode, base });
              if (preparingReport.current !== preparation || !sameReportRunScope(requestScope, readReportScope()) || reportSourceKey(latest.current.reportSource) !== sourceKey) return;
              const selected = currentService('report','report.full');
              if (!selected || selected.id !== service.id || selected.revision !== service.revision) { say([span('报告模型配置已变化，请重新点击生成并核对服务。', 'dim')]); return; }
              if (!matchesModelConsent(action.modelBinding, callOwner, callEpoch, service) || action.inputRevision !== inputRevision) {
                threads.append([{ ...stamp(), role: 'agent', turn: { lines: [[span('发送前核对本次任务：')]], cards: [{ kind: 'confirm', title: `${REPORT_MODES[mode]} · ${service.label} · ${service.model} · v${service.revision}`,
                  lines: [
                    [span(`课题：${topic}。本次生成独立候选稿，审阅后再决定是否采纳。`)],
                    [span(`资料范围：${base ? `当前调查设计、${source.dataset ? `${source.dataset.table.rows.length} 行${source.dataset.kind === 'simulated' ? '模拟' : '用户'}数据的本地分析结果` : '无采集数据'}、原稿正文与已登记证据` : '由课题构建并明确标注的教学模拟资料'}。`)],
                    [span('应用服务核对问卷、数据指纹及登记结果；模型收到研究设计、章节上下文和证据摘要，原始逐行作答不发送给模型。', 'dim')],
                    [span('全篇最多处理 26 节，包含有限重试及返修时最多 104 次模型调用。用量按服务商实际回执显示，费用以服务商账单为准。', 'dim')],
                    [span(`输入版本：${inputRevision.slice(0, 12)}。资料、模型或账号变更后需重新确认。`, 'dim')],
                  ], confirm: { label: '确认并生成候选稿', action: { ...action, topic, mode, inputRevision, modelBinding: { owner: callOwner, identityEpoch: callEpoch, serviceId: service.id, serviceRevision: service.revision } } }, cancel: '暂不发送' }] } }]);
                return;
              }
              const runId = crypto.randomUUID(), controller = new AbortController();
              const waiting: Message = { ...stamp(), role: 'agent', model: { service: service.label, serviceId: service.id, serviceRevision: service.revision, provider: service.provider, modelName: service.model, reportRunId: runId, step: 1, status: 'running' }, turn: { lines: [[span(`正在生成「${topic}」的独立候选稿。原稿保持在编辑器中。`, 'dim')]], chips: [{ label: '查看本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${runId}` } }] } };
              threads.append([waiting]);
              const runScope = { ...requestScope, thread: threads.threadOf(waiting.id)?.id ?? null };
              handle = { runId, scope: runScope, owner: callOwner, epoch: callEpoch, threadId: runScope.thread, messageId: waiting.id, controller };
              activeReportRun.current = handle;
              startCall(waiting.id, callOwner, callEpoch);
              const run = handle;
              const stillCurrent = () => activeReportRun.current === run && !controller.signal.aborted && sameReportRunScope(run.scope, readReportScope()) && !!threads.threadOf(waiting.id);
              if (!stillCurrent()) { mark(waiting.id, 'refused'); replace(waiting.id, { lines: [[span('项目或对话已变化，本次尚未发送模型请求。', 'dim')]] }); return; }
              setCandidate({ runId, scope, threadId: handle.threadId, sourceKey, source, mode, before, preview: before, pending: true, receipts: [] });
              setLockedSections({ runId, ids: [] }); setReviewNotice('');
              setStage('paper'); closePanel(); setCopilotOpen(false); choreo.stop();
              setReportWriting(run.scope, { active: true, phase: 'contract', completed: 0, total: 0, paragraphs: 0, facts: 0, lastSectionId: null, lastSectionTitle: '', topicTitle: topic, autoFollow: autoFollowRef.current });
              const seenSections = new Map<string, { paragraphs: number; facts: string[] }>();
              const result = await requestFullReport({ schemaVersion: 1, runId, projectId: current.projectId, inputRevision, serviceId: service.id, serviceRevision: service.revision, consent: true, topic, mode, base, stream: true, concurrency: 3 }, {
                csrfToken: current.csrfToken!, signal: controller.signal,
                onEvent: event => {
                  if (!stillCurrent()) return;
                  if (event.type === 'receipt') {
                    setCandidate(previous => previous?.runId === runId ? { ...previous, receipts: [...previous.receipts.filter(receipt => receipt.id !== event.id), { id: event.id, nodeId: event.nodeId, status: event.status }] } : previous);
                    return;
                  }
                  if (event.report || event.pack) setCandidate(previous => previous?.runId === runId ? { ...previous, preview: event.report ?? event.pack!.report } : previous);
                  if (event.sectionId && event.trace) seenSections.set(event.sectionId, { paragraphs: event.trace.status === 'llm_generated' ? event.trace.keptParagraphs : 0, facts: event.trace.status === 'llm_generated' ? event.trace.citedFacts : [] });
                  const sections = [...seenSections.values()];
                  setReportWriting(run.scope, previous => ({ ...previous, phase: event.phase, completed: event.completed, total: event.total, paragraphs: sections.reduce((sum, section) => sum + section.paragraphs, 0), facts: new Set(sections.flatMap(section => section.facts)).size, lastSectionId: event.sectionId ?? previous.lastSectionId, lastSectionTitle: event.title ?? previous.lastSectionTitle, autoFollow: autoFollowRef.current }));
                  if (event.type === 'section' && event.report && event.sectionId) {
                    const section = event.report.report.find(item => item.id === event.sectionId);
                    if (section && event.trace?.status === 'llm_generated') choreo.animateIncomingSection(section, event.report);
                    if (autoFollowRef.current) pickSection(event.sectionId);
                  }
                  if (event.type === 'repair' && event.report && event.revisions?.length) choreo.runReviewAndFormatChoreography(event.report, event.revisions);
                  replace(waiting.id, { lines: [[span(`候选稿已处理 ${event.completed}/${event.total} 节；所有内容仍待完整检查与审阅。`, 'dim')]], chips: [{ label: '查看本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${runId}` } }] });
                },
              });
              if (!stillCurrent()) return;
              setCandidate(previous => previous?.runId === runId ? { ...previous, preview: result.report, pack: result.pack, result, pending: false } : previous);
              setReportWriting(run.scope, previous => ({ ...previous, active: false, phase: 'done', completed: result.summary.totalSectionsGenerated, total: result.summary.totalSectionsGenerated, paragraphs: result.summary.totalParagraphsWritten, facts: result.summary.totalFactsCited }));
              mark(waiting.id, result.summary.llmSuccessCount > 0 ? 'ready' : 'failed', undefined, undefined, result.summary.usageReported ? { inputTokens: result.summary.promptTokens, outputTokens: result.summary.completionTokens } : undefined);
              replace(waiting.id, { lines: [[span(`本轮模型写成 ${result.summary.llmSuccessCount}/${result.summary.totalSectionsGenerated} 节，${result.summary.fallbackCount} 节待补写。`, 'strong')], [span(result.quality.status === 'blocked' ? '存在阻断项，暂不能采纳。请查看候选稿审阅工作台。' : '候选稿已就绪，请检查证据、实际修订和原稿差异后采纳。', 'dim')], [span(result.summary.usageReported ? `服务商报告输入 ${result.summary.promptTokens} / 输出 ${result.summary.completionTokens} tokens。` : '服务商未完整报告用量；未推算 token 或费用。', 'dim')]], chips: [{ label: '查看本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${runId}` } }] });
              if (result.revisions.length) choreo.runReviewAndFormatChoreography(result.report, result.revisions); else choreo.stop();
            } catch (error) {
              if (!handle) { if (sameReportRunScope(requestScope, readReportScope())) say([span('无法核对本次资料版本，尚未启动生成。请重新检查资料。', 'error')]); return; }
              if (activeReportRun.current !== handle || handle.controller.signal.aborted || !sameReportRunScope(handle.scope, readReportScope()) || !threads.threadOf(handle.messageId)) return;
              const notice = error instanceof HostedApiError ? error.message : '连接或结果校验未完成，原稿已保留。请先核对本轮调用回执。';
              setCandidate(previous => previous?.runId === handle!.runId ? { ...previous, pending: false, failed: notice } : previous);
              setReportWriting(handle.scope, previous => ({ ...previous, active: false, phase: 'failed' })); choreo.stop();
              mark(handle.messageId, fullReportFailureStatus(error));
              replace(handle.messageId, { lines: [[span(notice, 'error')]], chips: [{ label: '核对本轮运行回执', action: { type: 'href', href: `/api/agent/report-runs/${handle.runId}` } }] });
            } finally {
              if (handle) finishCall(handle.messageId);
              if (handle && activeReportRun.current === handle) activeReportRun.current = null;
              if (preparingReport.current === preparation) preparingReport.current = null;
            }
          })();
          break;
        }
        case 'loadBenchmark': {
          const source = latest.current.reportSource, scope = latest.current.reportScope, activeThread = threads.view(latest.current.owner).active;
          if (activeReportRun.current || hasUserResearchSource(source)) { say([span('当前已有生成任务或用户资料。请先完成任务，或切换到空白项目再载入教学模拟。', 'dim')]); break; }
          setStage('paper'); closePanel();
          void loadBenchmark(action.benchmarkId).then(loaded => {
            if (latest.current.reportScope !== scope || threads.view(latest.current.owner).active !== activeThread) return;
            if (!loaded) { say([span('教学模拟未载入，当前工作区已保留。请核对资料来源。', 'dim')]); return; }
            setCandidate(null); choreo.stop();
            say([span('已载入明确标注的教学模拟研究。模拟结果由分析引擎计算，不能作为真实调研证据；叙述性章节可另行生成候选稿。', 'dim')], [{ label: '生成模拟候选稿', action: { type: 'generateFullReport', topic: '', mode: 'demonstration' }, primary: true }]);
          });
          break;
        }
        case 'insertStudioBlock': {
          const cleanParagraphs = action.paragraphs.filter(p => typeof p === 'string' && p.trim()).slice(0, 12);
          if (!cleanParagraphs.length) break;
          sendToReport({
            id: crypto.randomUUID(),
            node: action.node,
            source: '证见工坊',
            items: cleanParagraphs.map(text => ({ kind: 'paragraph', text })),
          });
          setStage('paper');
          closePanel();
          say([span(`已将工坊产出「${action.title}」写入中间报告画布对应章节，可在编辑器顶部随时撤销。`, 'dim')]);
          break;
        }
      }
    };
    const answer = (id: string, answered: 'confirmed' | 'cancelled', action?: AgentAction) => {
      if (answered === 'confirmed' && action && (action.type === 'chat' || action.type === 'draft')) {
        const accepted = perform(action);
        threads.patch(id, m => m.role === 'agent' ? { ...m, answered: accepted === false ? 'cancelled' : 'confirmed' } : m);
        return;
      }
      threads.patch(id, m => m.role === 'agent' ? { ...m, answered } : m);
      if (answered === 'confirmed' && action) perform(action);
      else focusInput();
    };
    return { send, perform, answer };
  }, [go, closePanel, setStage, pickSection, focusInput, sendToReport, loadBenchmark, choreo, blankReport, readReportScope, setReportWriting, startCall, finishCall]);

  // The toolbar writes into the section in view through the editor, as one undoable step; the paper shows it at once.
  const insertIntoSection = useCallback((items: InsertItem[]) => {
    if (visibleCandidate) return;
    const section = paperContent.report.find(s => s.id === pickedSection);
    if (!section) return;
    sendToReport({ id: crypto.randomUUID(), node: matchBlueprintNode(section.title)?.id ?? '', source: '报告工具栏', items, sectionId: section.id });
  }, [paperContent, pickedSection, sendToReport, visibleCandidate]);
  // A writing tool opens the copilot and says its command there, as if typed.
  const sayFromTool = useCallback((text: string) => { setCopilotOpen(true); agent.send(text); }, [agent]);

  // Lookups wait for the knowledge index, then answer in place of their placeholder, in their own conversation.
  const pendingLookup = useMemo(() => book.threads.flatMap(t => t.messages).find(m => m.role === 'pending'), [book]);
  const { ready: knowledgeReady, search } = knowledge;
  useEffect(() => {
    if (pendingLookup?.role !== 'pending' || !knowledgeReady) return;
    let live = true;
    const settle = (turn: AgentTurn) => threads.patch(pendingLookup.id, () => ({ id: pendingLookup.id, at: Date.now(), role: 'agent', turn }));
    search(pendingLookup.query)
      .then(hits => { if (live) settle(lookupTurn(pendingLookup.query, hits, pendingLookup.explicit)); })
      .catch(() => { if (live) settle({ lines: [[{ text: '知识镜暂时没有回应，请稍后再问。', mark: 'error' }]] }); });
    return () => { live = false; };
  }, [pendingLookup, knowledgeReady, search]);

  // "/" anywhere outside a field starts a command, bringing the conversation back if the panel fills the screen;
  // Ctrl B folds the sidebar; Ctrl \ closes or reopens the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) focusInput();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'b') { event.preventDefault(); latest.current.toggleSide(); }
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        const reopen = latest.current.lastPanel;
        if (currentPanel()) window.location.hash = ''; else if (reopen) window.location.hash = reopen;
      }
      if (event.key === 'Escape') setRailMenu(null);
      if (!typing && (event.key === '[' || event.key === ']') && !event.ctrlKey && !event.metaKey && !event.altKey) latest.current.stepSection(event.key === ']' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusInput]);

  // The panel is widened or narrowed by dragging its edge; the width is remembered in this browser.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = Math.min(panelWidth, available);
    const limit = () => Math.max(MIN_PANEL, window.innerWidth - RAIL - GUTTERS - (sideOpen ? SIDEBAR : 0) - MIN_TALK);
    setDragging(true);
    const move = (e: PointerEvent) => setPanelWidth(Math.round(Math.min(limit(), Math.max(MIN_PANEL, startWidth + startX - e.clientX))));
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPanelWidth(width => { try { if (width) window.localStorage.setItem(PANEL_KEY, String(width)); } catch { /* Not remembered without storage. */ } return width; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const projects = lists.projects.map(p => ({ id: p.id, label: p.title }));
  const services = eligibleModelServices('research', lists.services).map(s => ({ id: s.id, label: s.label, detail: `${s.model} · v${s.revision}` }));
  const projectLabel = projects.find(p => p.id === projectId)?.label;
  const email = account?.user?.email ?? '';
  const here = panel ? roomById(panel) : null, lit = panel ? roomLight(light, panel) : null;
  const outputs = [...(held?.results ?? [])].reverse().map(r => ({ id: r.id, title: r.title, detail: `${METHOD_LABELS[r.method] ?? r.method} · 有效样本 ${r.n}` }));
  const stages = STAGES.map(id => ({ id, name: roomById(id).name, glyph: roomById(id).glyph, score: roomLight(light, id)?.score ?? null }));
  // The work in view: the call still running in this conversation, and what its model calls have cost so far.
  const running = messages.find(m => m.role === 'agent' && m.model?.status === 'running') as Extract<Message, { role: 'agent' }> | undefined;
  const looking = messages.some(m => m.role === 'pending');
  const spent = messages.reduce((sum, m) => m.role === 'agent' && m.model?.usage ? { inputTokens: sum.inputTokens + m.model.usage.inputTokens, outputTokens: sum.outputTokens + m.model.usage.outputTokens } : sum, { inputTokens: 0, outputTokens: 0 });
  const today = useSyncExternalStore(subscribeNothing, startOfToday, () => 0);
  const todayTokens = book.threads.reduce((total, t) => total + t.messages.reduce((sum, m) => m.role === 'agent' && m.at >= today && m.model?.usage ? sum + m.model.usage.inputTokens + m.model.usage.outputTokens : sum, 0), 0);
  const exportThread = thread && messages.length > 0 ? () => exportRecord(thread) : null;

  return <ThemeProvider value={theme}><WorkbenchNavProvider value={nav}><GenerationProvider value={generation}>
    <div className={`workbench ${styles.shell}`} data-theme={theme} data-side={sideOpen ? 'open' : 'closed'} data-panel={panel ?? (output ? 'output' : 'none')} data-expanded={expanded && !!panel}>
      <CursorTrail />
      <a className={styles.skip} href="#agent-command-line" onClick={event => { event.preventDefault(); focusInput(); }}>跳到输入框</a>

      <nav ref={railRef} className={styles.rail} aria-label="工具" style={{ position: 'relative' }}>
        <button type="button" className={styles.railButton} aria-label="对话" title="对话" aria-pressed={!panel} onClick={() => {
          // From a panel filling the screen the conversation comes back beside it; otherwise the panel closes.
          if (!expanded) closePanel();
          focusInput();
        }}><Icon name="chat" /></button>
        <button ref={modulesRef} type="button" className={styles.railButton} aria-label="模块" title="模块" aria-haspopup="dialog" aria-expanded={railMenu === 'modules'} aria-pressed={!!panel && panel !== 'overview'} onClick={() => setRailMenu(railMenu === 'modules' ? null : 'modules')}><Icon name="grid" /></button>
        <button type="button" className={styles.railButton} aria-label="项目全景" title="项目全景" aria-pressed={panel === 'overview'} onClick={() => panel === 'overview' ? closePanel() : go('overview')}><Icon name="lamp" /></button>
        <button type="button" className={styles.railButton} aria-label={`知识镜搜索（${shortcut}）`} title={`知识镜搜索（${shortcut}）`} onClick={knowledge.openSearch}><Icon name="book" /></button>
        <span className={styles.spacer} />
        <button type="button" className={styles.railButton} aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} title={theme === 'dark' ? '浅色' : '深色'} onClick={event => switchTheme(theme === 'dark' ? 'light' : 'dark', event)}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        {owner && owner !== 'guest'
          ? <button type="button" className={styles.avatar} aria-label={`账号：${email}`} title={email} aria-haspopup="menu" aria-expanded={railMenu === 'account'}
            onClick={() => setRailMenu(railMenu === 'account' ? null : 'account')}>{(email[0] ?? '?').toUpperCase()}</button>
          : <Link className={styles.avatar} data-guest="true" href="/login" title="登录">访</Link>}
        {railMenu === 'account' && <div className={styles.menu} role="menu" aria-label="账号" aria-describedby="agent-account-note" style={{ left: 50, bottom: 10, zIndex: 60 }}>
          <p id="agent-account-note" className={styles.menuNote} aria-hidden="true">{email}</p>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { go('workspace'); setRailMenu(null); }}>项目门户</button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { go('services'); setRailMenu(null); }}>模型服务</button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { closePanel(); setStage('chat'); setRailMenu(null); }}>研究路线</button>
          {/* Signing out asks first when this tab still holds unsaved drafts. */}
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setRailMenu(null); setAccountNotice(''); logout().catch(error => setAccountNotice(errorMessage(error))); }}>退出登录</button>
        </div>}
        {railMenu === 'modules' && <div ref={launcherRef} className={styles.launcher} role="dialog" aria-label="模块" onKeyDown={event => {
          // Arrow keys walk the modules in order; Esc closes and gives focus back to the rail.
          if (event.key === 'Escape') { event.preventDefault(); setRailMenu(null); modulesRef.current?.focus(); return; }
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
          if (!step) return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], at = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(at + step + buttons.length) % buttons.length]?.focus();
        }}>
          <div className={styles.launcherHead}><b>模块</b><small>在右侧面板打开；也可以在输入框里输入 <kbd>/</kbd> 加模块名，例如 /问卷</small></div>
          {/* The research path in working order: what each step is for, and how much evidence it holds where that is measured. */}
          <p className={styles.launcherLabel}>{ROOM_GROUPS.path}</p>
          <div className={styles.steps}>
            {ROOMS.filter(r => r.group === 'path').map((r, i) => {
              const lightOf = roomLight(light, r.id);
              // The visible text is the name, so voice control can say what it sees: number, module, state, purpose.
              return <button key={r.id} type="button" className={styles.step} aria-current={panel === r.id ? 'true' : undefined} onClick={() => pick(r.id)}>
                <span className={styles.glyph} aria-hidden="true">{r.glyph}</span>
                <b><small>{String(i + 1).padStart(2, '0')}</small>{r.name}</b>
                <span className={styles.stepLight}>{panel === r.id ? <em>已打开</em> : lightOf && (lightOf.score > 0 ? <><LightBar score={lightOf.score} />照度 {percent(lightOf.score)}</> : <i>尚无证据</i>)}</span>
                <span className={styles.stepLine}>{r.line}</span>
              </button>;
            })}
          </div>
          {GROUPS.filter(group => group !== 'path').map(group => <div key={group}>
            <p className={styles.launcherLabel}>{ROOM_GROUPS[group]}</p>
            <div className={styles.extras}>
              {ROOMS.filter(r => r.group === group).map(r => <button key={r.id} type="button" className={styles.extra} aria-current={panel === r.id ? 'true' : undefined} title={r.line}
                onClick={() => pick(r.id)}>
                <span className={styles.glyph} aria-hidden="true">{r.glyph}</span>{r.name}
              </button>)}
            </div>
          </div>)}
        </div>}
      </nav>

      <Sidebar book={book} projects={projects} account={generationAccount} email={email} notice={accountNotice}
        failed={!!sessionError} onRetry={() => { setAccountNotice(''); refresh().catch(error => setAccountNotice(errorMessage(error))); }} onNew={id => { threads.draft(id); focusInput(); }}
        onSelect={threads.select} onRemove={threads.remove} onRename={threads.rename} onCollapse={() => setSideOpen(false)}
        stages={stages} openRoom={panel} onRoom={go} outputs={outputs} openOutput={output?.id ?? null} onOutput={id => { window.location.hash = `output/${encodeURIComponent(id)}`; }}
        todayTokens={todayTokens} onModels={() => go('services')} onExport={exportThread}
        onLogout={() => { setAccountNotice(''); logout().catch(error => setAccountNotice(errorMessage(error))); }}
        nav={stage === 'paper' ? <ReportNav content={paperContent} picked={pickedSection} onPick={pickSection} onSay={sayFromTool} onStartFullReport={topic => agent.perform({ type: 'generateFullReport', topic: topic ?? '' })} liveWriting={liveWriting} /> : undefined} />

      <main className={styles.main} aria-label={stage === 'paper' ? '报告' : '对话'} data-stage={stage} data-dialog-background>
        <header className={styles.top}>
          {!sideOpen && <button type="button" className={styles.iconButton} aria-label="展开侧栏（Ctrl B）" title="展开侧栏（Ctrl B）" onClick={() => setSideOpen(true)}><Icon name="sidebar" /></button>}
          <span className={styles.topTitle}>{stage === 'paper' ? paperContent.title : thread?.title ?? '新对话'}{projectLabel && <small>{projectLabel}</small>}</span>
          <span className={styles.stageSwitch} role="group" aria-label="中间显示">
            <button type="button" aria-pressed={stage === 'chat'} onClick={() => setStage('chat')}><Icon name="chat" />对话</button>
            <button type="button" aria-pressed={stage === 'paper'} onClick={() => setStage('paper')}><Icon name="book" />报告</button>
            <button type="button" aria-pressed={stage === 'advisors'} onClick={() => setStage('advisors')}><Icon name="lamp" />顾问{hired.length ? <small>{hired.length}</small> : null}</button>
          </span>
          <span className={styles.workState} data-busy={!!running || looking || !!liveWriting?.active} role="status">
            <i aria-hidden="true" />{liveWriting?.active ? `实时撰稿中 · ${liveWriting.completed}/${liveWriting.total} 节` : running?.model ? `工作中 · 第 ${running.model.step} 步 · ${running.model.service}` : looking ? '工作中 · 查知识镜' : '就绪'}
          </span>
          <ArtifactShelfLauncher count={artifacts.count} open={artifactOpen} onClick={openArtifactShelf} />
          <span className={styles.spacer} />
          <button type="button" className={styles.chip} onClick={() => go('services')} aria-label="模型配置">模型配置</button>
          <details className={styles.topMore} onKeyDown={event => {
            if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
          }} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
          }}>
            <summary aria-label="更多对话操作" title="更多对话操作"><Icon name="more" /></summary>
            <div className={styles.topMenu}>
              <p>{chatMode === 'model' ? chatService ? `${chatService.label} · ${chatService.model}` : '未选模型' : '指令模式'}</p>
              {(spent.inputTokens > 0 || spent.outputTokens > 0) && <p>本次对话 {thousands(spent.inputTokens + spent.outputTokens)} tokens<br />输入 {thousands(spent.inputTokens)} · 输出 {thousands(spent.outputTokens)}</p>}
              <button type="button" aria-pressed={showCode} onClick={event => { setShowCode(!showCode); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Icon name="code" />{showCode ? '隐藏代码' : '显示代码'}</button>
              {exportThread && <button type="button" onClick={event => { exportThread(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Icon name="download" />导出对话记录</button>}
            </div>
          </details>
          {!panel && lastPanel && <button type="button" className={styles.iconButton} aria-label={`重新打开${roomById(lastPanel).name}（Ctrl \\）`} title={`重新打开${roomById(lastPanel).name}（Ctrl \\）`} onClick={() => go(lastPanel)}><Icon name="panel" /></button>}
        </header>
        {stage === 'advisors' && <Advisors benchmark={paperBenchmark} hired={hired} onHire={setHired} />}
        {stage === 'paper' && <div ref={paperRef} className={styles.paperStage} role="region" aria-label="报告实时排版">
          <PaperToolbar
            content={paperContent}
            section={paperContent.report.find(s => s.id === pickedSection) ?? null}
            results={paperContent.quality?.results ?? []}
            onInsert={insertIntoSection}
            onEdit={() => go('editor')}
            onStartFullReport={topic => agent.perform({ type: 'generateFullReport', topic: topic ?? '' })}
            onInstantForge={topic => agent.perform({ type: 'loadBenchmark', benchmarkId: topic || 'current' })}
            previewOnly={!!visibleCandidate}
            onPlayChoreography={() => choreo.playFullTheaterShowcase(paperContent, visibleCandidate?.result?.revisions ?? [])}
            liveWriting={liveWriting}
            onToggleAutoFollow={toggleAutoFollow}
            onJumpToSection={pickSection}
            docFormat={docFormat}
            onChangeDocFormat={setDocFormat}
          />
          {reviewNotice && <p className={styles.reviewNotice} role="status">{reviewNotice}</p>}
          {reportVersions.length > 0 && <details className={styles.versions}>
            <summary>最近 {Math.min(reportVersions.length, 3)} 个原稿版本</summary>
            <p>采纳候选稿和恢复版本前保留原稿，最多保留最近三版。</p>
            <ul>{reportVersions.slice(0, 3).map((version, index) => <li key={`${version.savedAt}-${index}`}>
              <div><b>{version.content.title}</b><small>{new Date(version.savedAt).toLocaleString('zh-CN')} · {version.content.report.length} 节</small></div>
              <button type="button" disabled={!!liveWriting?.active || !!reportSource.inputPending} onClick={() => {
                const scope = readReportScope();
                if (scope.owner !== owner || scope.epoch !== identityEpoch || scope.project !== projectId) { setReviewNotice('登录或项目已变化，请重新核对版本。'); return; }
                const outcome = restoreReportVersion(version.content, latest.current.reportSource);
                if (outcome === 'applied') { choreo.stop(); setCandidate(null); setReviewNotice('已恢复所选原稿版本，恢复前的版本也已保留。'); }
                else setReviewNotice(outcome === 'conflict' ? '原稿正在更新，请等待资料载入完成后再恢复。' : '无法保存版本，当前原稿未被替换。');
              }}>恢复此版</button>
            </li>)}</ul>
          </details>}
          {visibleCandidate && <>
            <AgentRunReview quality={visibleCandidate.result?.quality} revisions={visibleCandidate.result?.revisions} summary={visibleCandidate.result?.summary} mode={visibleCandidate.mode} conflict={candidateConflict} pending={visibleCandidate.pending} failed={visibleCandidate.failed} changes={candidateChanges} lockedSectionIds={lockedSectionIds}
              onCancel={() => stopReportRun()}
              onDiscard={() => { stopReportRun(); setCandidate(null); setReportWriting(readReportScope(), null); setReviewNotice('候选稿已丢弃，原稿保留。'); }}
              onSelectSection={pickSection}
              onToggleSectionLock={id => setLockedSections(previous => { const ids = previous.runId === visibleCandidate.runId ? previous.ids : []; return { runId: visibleCandidate.runId, ids: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] }; })}
              onApply={() => {
                const result = visibleCandidate.result, pack = visibleCandidate.pack;
                const scope = readReportScope();
                if (!scope.owner || visibleCandidate.scope !== `${scope.owner}:${scope.epoch}:${scope.project ?? 'local'}` || visibleCandidate.threadId !== scope.thread) { setReviewNotice('登录、项目或对话已变化，请重新核对候选稿。'); return; }
                if (!result || !pack || visibleCandidate.failed || !canAcceptReportCandidate({ sourceKey: visibleCandidate.sourceKey, currentSource: latest.current.reportSource, status: result.quality.status, pending: visibleCandidate.pending })) { setReviewNotice('原稿或资料已变化，当前候选稿不能采纳。请重新核对输入。'); return; }
                const merged = mergeReportCandidate(latest.current.reportSource.report ?? blankReport, pack.report, lockedSectionIds);
                const outcome = applyCandidate({ ...pack, report: merged }, visibleCandidate.source);
                if (outcome === 'applied') { choreo.stop(); setCandidate(null); setReportWriting(scope, null); setReviewNotice('已采纳所选变更，采纳前的原稿可从最近版本中恢复。'); }
                else setReviewNotice(outcome === 'conflict' ? '原稿或研究资料已修改，没有覆盖当前版本。' : '无法保存原稿快照，本次没有采纳。请检查浏览器可用存储。');
              }} />
            <details className={styles.receipts}>
              <summary>本轮调用记录 · {visibleCandidate.receipts.length} 条</summary>
              <a href={`/api/agent/report-runs/${visibleCandidate.runId}`} target="_blank" rel="noreferrer">核对运行回执 ↗</a>
              <p>“已发出”表示等待回执核对。取消或断流不会自动撤销已发出的服务商调用。</p>
              <ul>{visibleCandidate.receipts.map(receipt => <li key={receipt.id}><a href={`/api/agent/report-sections/${encodeURIComponent(receipt.id)}`} target="_blank" rel="noreferrer">{blueprintNode(receipt.nodeId)?.title ?? receipt.nodeId} ↗</a><span>{({ dispatched: '已发出 · 待核对', ready: '已返回', failed: '失败', unknown: '结果待核对', running: '处理中' } as Record<string, string>)[receipt.status] ?? '待核对'}</span></li>)}</ul>
            </details>
          </>}
          <ReportLiveTheater
            paperRef={paperRef}
            robotRole={choreo.robotRole}
            robotStatusText={choreo.robotStatusText}
            robotVisible={choreo.robotVisible}
            forgePod={choreo.forgePod}
            beams={choreo.beams}
          />
          <ReportPaper
            content={paperContent}
            activeSectionId={pickedSection}
            onPick={setPickedSection}
            label="报告实时排版"
            writingActive={!!liveWriting?.active}
            workState={reportWorkState(liveWriting)}
            typingState={choreo.typingState}
            reviewState={choreo.reviewState}
            formatScanSectionId={choreo.formatScanSectionId}
            activeCatalogKey={choreo.activeTargetKey}
            onCatalogHover={(attr, id) => choreo.triggerXrefSynapse(attr, id, false)}
            onCatalogClick={(attr, id) => choreo.triggerXrefSynapse(attr, id, true)}
            docFormat={docFormat}
          />
        </div>}
        {stage === 'paper' && !copilotOpen && <button type="button" className={styles.copilotPill} onClick={() => setCopilotOpen(true)}>
          <BrandMark size={16} />证见 AI{running || looking ? <i aria-label="工作中" /> : null}
        </button>}
        <div className={stage === 'paper' ? styles.copilot : styles.chatColumn} hidden={(stage === 'paper' && !copilotOpen) || stage === 'advisors'}>
        {stage === 'paper' && <div className={styles.copilotHead}>
          <BrandMark size={16} /><b>证见 AI</b><small>{thread?.title ?? '新对话'}</small>
          <span className={styles.spacer} />
          <button type="button" className={styles.iconButton} aria-label="收起证见 AI" title="收起" onClick={() => setCopilotOpen(false)}><Icon name="down" /></button>
        </div>}
        <div ref={scrollRef} className={styles.scroll}>
          <details className={styles.researchDisclosure} open={!messages.length} data-fresh={!messages.length}>
            <summary><span><Icon name="spark" />研究路线</span><small>选题 · 文献 · 问卷 · 分析</small><span className={styles.disclosureAction} /><Icon name="down" /></summary>
          <ResearchWorkspace key={`${owner ?? 'loading'}:${identityEpoch}:${projectId ?? 'local'}`}
            owner={owner} projectId={projectId} identityEpoch={identityEpoch} services={lists.services}
            modelRoutes={journeyModelRoutes} defaultServiceId={stagePreferences.defaultServiceId ?? null}
            onDefaultServiceChange={id => setDefaultModelPreference(owner, id)}
            onModelCallChange={(call, id) => setStageModelPreference(owner, call, id)}
            onOpenSettings={() => go('services')} onOpenStage={openResearchStage}
            onTopic={research.topic} onRetractTopic={research.retractTopic} literature={research.literature} onLiterature={research.setLiterature}
            onLiteratureToReport={lines => {
              sendToReport({ id: crypto.randomUUID(), node: 'appendix.data', source: '选题研读资料',
                items: lines.map(text => ({ kind: 'paragraph', text })) });
              go('editor');
            }}
            onDraftQuestionnaire={({ input }, destination) => {
              if (destination !== readReportScope().project) return;
              const brief = [input.title, input.problem, `决策主体：${input.decisionOwner}`,
                `调查对象：${input.population}`, `地区：${input.geography}`].join('\n');
              threads.append([{ ...stamp(), role: 'agent', turn: generation.start(brief, destination) }]);
            }}
            simulation={{ source: reportSource, apply: applyCandidate, openReport: () => go('editor'),
              startWriting: title => agent.perform({ type: 'generateFullReport', topic: title, mode: 'demonstration' }) }} />
          </details>
          {!!messages.length && <Transcript activeCallIds={new Set(activeCalls.filter(c => c.owner === owner && c.epoch === identityEpoch).map(c => c.id))} messages={messages} scrollRef={scrollRef} workInPaper={stage === 'paper' && !!reportWorkState(liveWriting)} onAction={agent.perform} onAnswer={agent.answer} />}
        </div>
        <Composer onDraftWriter={registerDraftWriter} onSend={agent.send} inputRef={inputRef} account={generationAccount} onNeedLists={() => loadLists(true)}
          projects={projects} projectId={projectId} onProject={threads.setProject}
          services={services} serviceId={chatService?.id ?? ''} onService={id => setStageModelPreference(owner, 'research.conversation', id || null)}
          mode={chatMode} onMode={setChatMode} chatLabel={chatService?.label ?? ''} onOpen={go} />
        </div>
      </main>

      <section ref={artifactPanelRef} className={styles.panel} hidden={!panel && !output && !inspecting && !artifactOpen} aria-label={artifactOpen ? '成果架' : here ? here.name : output ? '产出' : inspecting ? '写作检查器' : '模块'} data-dialog-background
        onKeyDown={event => { if (artifactOpen && event.key === 'Escape') { event.stopPropagation(); setArtifactOpen(false); } }}
        data-inspector={inspecting || artifactOpen || undefined} style={{ ['--panel-w' as string]: `${artifactOpen ? 360 : inspecting ? INSPECTOR : panelWidth}px` }}>
        {artifactOpen && <ArtifactShelf {...artifacts} error={artifacts.error??artifactNotice} onClose={()=>setArtifactOpen(false)} onExample={()=>void addInfographicExample()} />}
        {!artifactOpen && inspecting && <ReportInspector content={paperContent} picked={pickedSection} benchmark={paperBenchmark}
          advisors={ADVISORS.filter(a => hired.includes(a.id)).map(a => advisorReading(a, paperBenchmark))} onSay={sayFromTool} onEdit={() => go('editor')} onAdvisors={() => setStage('advisors')} revision={<SectionRevision {...revision} />} />}
        <div className={styles.resize} data-dragging={dragging} role="separator" aria-orientation="vertical" aria-label="拖动调整面板宽度" onPointerDown={startResize} />
        {!artifactOpen && here && <header className={styles.panelHead}>
          <h2 ref={headingRef} tabIndex={-1}>{here.name}</h2>
          {lit && <span className={styles.panelLight}><LightBar score={lit.score} /><b>{percent(lit.score)}</b>{lit.summary}</span>}
          <span className={styles.spacer} />
          {panel !== 'overview' && <button type="button" className={styles.codeToggle} onClick={() => setExpanded(true)}><Icon name="edit" />展开编辑</button>}
          <button type="button" className={styles.iconButton} aria-pressed={expanded} aria-label={expanded ? '还原，显示对话' : '铺满，暂时收起对话'}
            title={expanded ? '还原，显示对话' : '铺满，暂时收起对话'} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? 'shrink' : 'expand'} /></button>
          <button type="button" className={styles.iconButton} aria-label="关闭面板（Ctrl \）" title="关闭面板（Ctrl \）" onClick={closePanel}><Icon name="close" /></button>
        </header>}
        {!artifactOpen && output && <OutputPanel key={output.id} result={output} showCode={showCode} onClose={closePanel} onOpenAnalysis={() => go('analysis')} onSay={agent.send}
          figure={deferredView.report ? figureOf(deferredView.report, output) : null} visualStyle={deferredView.report?.visualStyle} />}
        <div className={styles.panelBody} data-room={panel ?? undefined} hidden={!panel || artifactOpen}>
          {panel === 'overview' && <Lobby light={light} view={deferredView} traces={traces.length} onOpen={go} onSay={agent.send} headingRef={null} />}
          {/* The report editor stays mounted, hidden, while the report fills the centre: the paper shows its content and the
              toolbar writes through it. */}
          {(Object.keys(panels) as WorkbenchPanel[]).filter(id => id !== 'overview' && (visited.includes(id) || (id === 'editor' && stage === 'paper'))).map(id =>
            <div key={id} className={styles.pane} data-workbench-panel={id} hidden={panel !== id}>{panels[id]}</div>)}
        </div>
        {canvasReturn && panel && panel !== 'canvas' && <div className={styles.canvasReturn} role="region" aria-label="画布返回">
          <button type="button" onClick={backToCanvas}>⟲ 返回画布{canvasReturn.title ? ` · ${canvasReturn.title}` : ''}</button>
          <button type="button" aria-label="不再显示返回画布" onClick={() => setCanvasReturn(null)}>×</button>
        </div>}
      </section>
    </div>
  </GenerationProvider></WorkbenchNavProvider></ThemeProvider>;
}

function subscribeResize(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}

const span = (text: string, mark?: Mark): Span => mark ? { text, mark } : { text };
/** A conversation entry as plain text for the model: what was said, without cards or buttons. */
function chatLine(message: Message): ChatLine[] {
  if (message.role === 'user') return [{ role: 'user', text: message.text }];
  // A question put to the user (a consent or confirmation) is not part of what was said about the research.
  if (message.role !== 'agent' || message.turn.cards?.some(card => card.kind === 'confirm' || card.kind === 'consent')) return [];
  const text = message.turn.lines.map(line => line.map(spanText).join('')).join('\n').trim();
  return text ? [{ role: 'agent', text }] : [];
}

/** The conversation as a Markdown record, dated now. */
function exportRecord(thread: Parameters<typeof conversationMarkdown>[0]) {
  const now = Date.now();
  download(recordName(thread, now), conversationMarkdown(thread, now));
}

/** Saves text as a file the user downloads; nothing leaves the browser. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
