"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ACCENTS, createEditorContent, EDITOR_LIMITS, parseEditorContent, parseVersionLabel, type Draft, type DraftSummary, type DraftVersion, type DraftVersionSummary, type EditorContent, type ReportSection, type Slide } from "@/lib/editor-model";
import ReportStoryboard, { ReportLinkNotice } from './ReportStoryboard';
import { LINK_LABELS, reportExportWarnings } from '@/lib/report-storyboard';
import styles from "./EditingStudio.module.css";
import OfficeFileLibrary from "./OfficeFileLibrary";
import EditorRecovery from "./EditorRecovery";
import { EDITOR_RECOVERY_CHANNEL, EDITOR_RECOVERY_EVENT } from "@/lib/editor-recovery";
import { useHostedSession } from '../hosted/HostedSession';
import { DEFAULT_REPORT_OPTIONS, REPORT_FORMAT, reportFormatNotices, reportPart, type ReportFormatOptions } from '@/lib/report-format';

type Phase = "loading" | "ready" | "saving" | "saved" | "error" | "conflict";
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...options?.headers }, signal: AbortSignal.timeout(20000) });
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error(`草稿服务返回异常（${response.status}），请重试或导出备份。`); }
  if (!response.ok) {
    const failure = result as { error?: { message?: string; code?: string } };
    throw Object.assign(new Error(failure.error?.message || "草稿服务暂时不可用。"), { status: response.status, code: failure.error?.code });
  }
  return result as T;
}
async function ensureEditorSession() {
  const establish = () => request("/api/drafts/session", { method: "POST" });
  // Coordinate first-time cookie setup across tabs without storing a credential in JS storage.
  return navigator.locks ? navigator.locks.request("evix-editor-session-v1", establish) : establish();
}
function subscribeNarrowScreen(listener: () => void) {
  const media = window.matchMedia("(max-width: 600px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const isNarrowScreen = () => window.matchMedia("(max-width: 600px)").matches;

export default function EditingStudio({localOnly=false}:{localOnly?:boolean}={}) {
  const hostedSession = useHostedSession();
  const [reportFormat,setReportFormat]=useState<ReportFormatOptions>({...DEFAULT_REPORT_OPTIONS});
  const [content, setContent] = useState<EditorContent>(createEditorContent);
  const [mode, setMode] = useState<"report" | "slides">("report");
  const [fileLibraryOpen, setFileLibraryOpen] = useState(false);
  const [storyboardOpen, setStoryboardOpen] = useState(false);
  const [storyboardGeneration, setStoryboardGeneration] = useState(0);
  const [identityFrozen, setIdentityFrozen] = useState(false);
  const identityTransition = useRef(false);
  const recoveryChannel = useRef<BroadcastChannel | null>(null);
  const [sectionId, setSectionId] = useState("section-1");
  const [slideId, setSlideId] = useState("slide-1");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [phase, setPhase] = useState<Phase>(localOnly ? "ready" : "loading");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [past, setPast] = useState<EditorContent[]>([]);
  const [future, setFuture] = useState<EditorContent[]>([]);
  const [saveTime, setSaveTime] = useState("");
  const [connected, setConnected] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [view, setView] = useState<"split" | "write" | "preview">("split");
  const [outlineOverride, setOutlineOpen] = useState<boolean | null>(null);
  const narrowScreen = useSyncExternalStore(subscribeNarrowScreen, isNarrowScreen, () => false);
  const outlineOpen = outlineOverride ?? !narrowScreen;
  const [outlineQuery, setOutlineQuery] = useState("");
  const [versions, setVersions] = useState<DraftVersionSummary[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(content));
  const studioRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const presentRef = useRef<HTMLDialogElement>(null);
  const presentationTrigger = useRef<HTMLButtonElement>(null);
  const versionOperation = useRef(false);
  const versionEpoch = useRef(0);
  const pendingVersion = useRef<{ id: string; draftId: string; label: string; revision: number } | null>(null);
  const current = useRef(content);
  const record = useRef<DraftSummary | null>(null);
  const pendingId = useRef<string | null>(null);
  const saved = useRef(JSON.stringify(content));
  const busy = useRef(false);
  const blocked = useRef(false);
  const scope = useRef("");
  const importInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const section = content.report.find(s => s.id === sectionId) || content.report[0];
  const slide = content.slides.find(s => s.id === slideId) || content.slides[0];
  const dirty = JSON.stringify(content) !== savedSnapshot;
  const { setUnsaved } = hostedSession;
  useEffect(() => { if(localOnly) setUnsaved('local-report',dirty); return () => setUnsaved('local-report',false); },[localOnly,dirty,setUnsaved]);

  const resetVersions = useCallback(() => { versionEpoch.current += 1; setVersions([]); setVersionLoading(false); pendingVersion.current = null; }, []);
  // Refs coordinate async operations; state is the sole source for rendered status.
  const setRecord = useCallback((draft: DraftSummary | null) => { record.current = draft; setActiveDraftId(draft?.id ?? null); }, []);
  const acknowledgeSaved = useCallback((snapshot: string) => { saved.current = snapshot; setSavedSnapshot(snapshot); }, []);

  const adopt = useCallback((draft: Draft) => {
    if (!alive.current || identityTransition.current) return;
    setStoryboardOpen(false);
    setStoryboardGeneration(value=>value+1);
    resetVersions();
    setOutlineQuery(""); previewRef.current?.scrollTo({ top: 0 });
    setRecord(draft); pendingId.current = null; acknowledgeSaved(JSON.stringify(draft.content));
    current.current = draft.content; setContent(draft.content); setPast([]); setFuture([]);
    setSectionId(draft.content.report[0].id); setSlideId(draft.content.slides[0].id);
    setSaveTime(new Date(draft.updatedAt).toLocaleTimeString("zh-CN")); setPhase("saved"); blocked.current = false; setMessage("");
  }, [resetVersions, setRecord, acknowledgeSaved]);
  const connect = useCallback(async (sessionEstablished = false) => {
    if(localOnly)return;
    if (identityTransition.current || busy.current || versionOperation.current) return;
    busy.current = true;
    try {
      if (!sessionEstablished) await ensureEditorSession();
      if (!alive.current || identityTransition.current) return;
      const result = await request<{ drafts: DraftSummary[]; scope: string }>("/api/drafts");
      if (!alive.current || identityTransition.current) return;
      if (scope.current && scope.current !== result.scope) {
        blocked.current = true; setPhase("conflict"); setMessage("登录身份已改变。当前内容已保留且暂停保存，请先备份，或点“另存副本”明确保存到当前身份。"); return;
      }
      scope.current = result.scope;
      setDrafts(result.drafts); setConnected(true); blocked.current = false;
      // Never replace locally edited text while reconnecting.
      if (!record.current && JSON.stringify(current.current) === saved.current && result.drafts.length) {
        const value = await request<{ draft: Draft }>(`/api/drafts/${result.drafts[0].id}`, { headers: { "x-editor-scope": scope.current } });
        if (alive.current) adopt(value.draft);
      } else setPhase("ready");
    } catch (e) { if (alive.current && !identityTransition.current) { blocked.current = true; setPhase("error"); setMessage(e instanceof Error ? e.message : "无法连接草稿库。可继续编辑并导出备份。"); } }
    finally { busy.current = false; }
  }, [adopt,localOnly]);

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    if(localOnly)return()=>{alive.current=false;};
    // Session establishment is external I/O; state updates follow its completion.
    ensureEditorSession().then(() => {
      if (!cancelled) void connect(true);
    }).catch(e => {
      if (cancelled || identityTransition.current) return;
      blocked.current = true; setPhase("error");
      setMessage(e instanceof Error ? e.message : "无法连接草稿库。可继续编辑并导出备份。");
    });
    return () => { cancelled = true; alive.current = false; };
  }, [connect,localOnly]);
  useEffect(() => {
    const freeze = () => {
      identityTransition.current = true; blocked.current = true;
      versionEpoch.current += 1;
      setIdentityFrozen(true); setConnected(false); setPhase("conflict"); setVersionLoading(false);
      setMessage("身份恢复已启动，本页已暂停全部服务器写入。正文和本地文件选择仍保留；请先导出未保存内容，再手动刷新页面。失败或取消也不会自动解锁。");
    };
    window.addEventListener(EDITOR_RECOVERY_EVENT, freeze);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(EDITOR_RECOVERY_CHANNEL);
    recoveryChannel.current = channel;
    if (channel) channel.onmessage = event => { if (event.data?.type === "identity-transition") window.dispatchEvent(new Event(EDITOR_RECOVERY_EVENT)); };
    return () => { window.removeEventListener(EDITOR_RECOVERY_EVENT, freeze); channel?.close(); recoveryChannel.current = null; };
  }, []);
  const beforeRestore = useCallback(() => {
    window.dispatchEvent(new Event(EDITOR_RECOVERY_EVENT));
    recoveryChannel.current?.postMessage({ type: "identity-transition" });
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (JSON.stringify(current.current) !== saved.current || busy.current || versionOperation.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const save = useCallback(async (copy = false, forVersion = false): Promise<Draft | null> => {
    if(localOnly){setMessage('当前为本地编辑。请下载 JSON 备份保存进度；可继续导出 Word 和 PPTX。');return null;}
    if (identityTransition.current || busy.current || (versionOperation.current && !forVersion)) return null;
    busy.current = true; setPhase("saving"); setMessage("");
    const snapshot = JSON.stringify(current.current);
    try {
      const data = parseEditorContent(current.current);
      if (forVersion && record.current && saved.current === snapshot) return { ...record.current, content: data };
      if (!connected || copy) {
        await ensureEditorSession();
        if (!alive.current || identityTransition.current) return null;
        const library = await request<{ drafts: DraftSummary[]; scope: string }>("/api/drafts");
        if (!alive.current || identityTransition.current) return null;
        if (scope.current && scope.current !== library.scope && !copy) throw Object.assign(new Error("登录身份已改变，请先备份或明确另存副本。"), { code: "editor_scope_changed" });
        scope.current = library.scope; setDrafts(library.drafts);
        setConnected(true);
      }
      if (copy) { setRecord(null); pendingId.current = null; resetVersions(); }
      const active = record.current;
      const id = active?.id || pendingId.current || crypto.randomUUID();
      if (!active) pendingId.current = id;
      const result = await request<{ draft: Draft }>(active ? `/api/drafts/${id}` : "/api/drafts", {
        method: active ? "PUT" : "POST", headers: { "x-editor-scope": scope.current }, body: JSON.stringify(active ? { revision: active.revision, content: data } : { id, content: data }),
      });
      if (!alive.current || identityTransition.current) return null;
      // Compare server content too: an idempotent POST retry may return an older snapshot.
      setRecord(result.draft); pendingId.current = null; acknowledgeSaved(JSON.stringify(result.draft.content));
      setDrafts(list => [result.draft, ...list.filter(d => d.id !== result.draft.id)]);
      setSaveTime(new Date(result.draft.updatedAt).toLocaleTimeString("zh-CN"));
      blocked.current = false; setPhase(snapshot === JSON.stringify(current.current) && saved.current === snapshot ? "saved" : "ready");
      return result.draft;
    } catch (e) {
      if (!alive.current || identityTransition.current) return null;
      blocked.current = true;
      setPhase(["draft_conflict", "editor_scope_changed"].includes((e as { code?: string }).code || "") ? "conflict" : "error");
      setMessage(e instanceof Error ? e.message : "保存失败，内容仍在当前页面。请重试或导出备份。");
      return null;
    } finally { busy.current = false; }
  }, [connected, resetVersions, setRecord, acknowledgeSaved,localOnly]);

  useEffect(() => {
    if (!dirty || blocked.current || busy.current || versionOperation.current || phase === "loading" || !connected) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [content, dirty, phase, connected, save, versionBusy]);

  function edit(next: EditorContent) {
    if (versionOperation.current) return false;
    const recoverable = next.title.trim() ? next : { ...next, title: "未命名研究" };
    if (new TextEncoder().encode(JSON.stringify(recoverable)).length > EDITOR_LIMITS.bytes) {
      setMessage("此作品已接近 500 KB 上限，本次输入未加入。请先导出备份，并将内容拆分为另一作品。"); return false;
    }
    const previous = current.current;
    setPast(items => [...items.slice(-59), previous]); setFuture([]);
    current.current = next; setContent(next);
    if (!blocked.current && !busy.current) setPhase("ready");
    return true;
  }
  function undo() {
    const previous = past[past.length - 1]; if (!previous) return;
    setPast(past.slice(0, -1)); setFuture([current.current, ...future]); current.current = previous; setContent(previous);
  }
  function redo() {
    if (!future[0]) return;
    setPast([...past, current.current]); current.current = future[0]; setContent(future[0]); setFuture(future.slice(1));
  }
  function canReplace() { return !identityTransition.current && !busy.current && !versionOperation.current && (!dirty || window.confirm("当前有尚未保存的修改。确定放弃这些修改并切换？建议先保存或导出备份。")); }
  async function openDraft(id: string) {
    if (!id || !canReplace()) return;
    busy.current = true; setPhase("loading");
    try { const result = await request<{ draft: Draft }>(`/api/drafts/${id}`, { headers: { "x-editor-scope": scope.current } }); adopt(result.draft); }
    catch (e) { if (!alive.current || identityTransition.current) return; setPhase("error"); blocked.current = true; setMessage(e instanceof Error ? e.message : "读取失败。"); }
    finally { busy.current = false; }
  }
  function newDraft() {
    if (!canReplace()) return;
    setStoryboardOpen(false);
    setStoryboardGeneration(value=>value+1);
    const next = createEditorContent();
    resetVersions();
    setSectionId(next.report[0].id); setSlideId(next.slides[0].id); setOutlineQuery(""); previewRef.current?.scrollTo({ top: 0 });
    setRecord(null); pendingId.current = null; acknowledgeSaved(""); blocked.current = false;
    current.current = next; setContent(next); setPast([]); setFuture([]); setPhase("ready"); setMessage(""); setSaveTime("");
  }
  function patchSection(patch: Partial<ReportSection>) { edit({ ...content, report: content.report.map(s => s.id === section.id ? { ...s, ...patch } : s) }); }
  function patchSlide(patch: Partial<Slide>) { edit({ ...content, slides: content.slides.map(s => s.id === slide.id ? { ...s, ...patch } : s) }); }
  function addItem() {
    if (mode === "report") {
      const item: ReportSection = { id: crypto.randomUUID(), title: "新章节", body: "", source: "" };
      if (edit({ ...content, report: [...content.report, item] })) setSectionId(item.id);
    } else {
      const item: Slide = { id: crypto.randomUUID(), title: "新的一页", body: "", aside: "", notes: "", layout: "content" };
      if (edit({ ...content, slides: [...content.slides, item] })) setSlideId(item.id);
    }
  }
  function moveItem(delta: number) {
    if (mode === "report") {
      const items = [...content.report], index = items.findIndex(s => s.id === section.id), target = index + delta;
      if (target < 0 || target >= items.length) return;
      [items[index], items[target]] = [items[target], items[index]]; edit({ ...content, report: items });
    } else {
      const items = [...content.slides], index = items.findIndex(s => s.id === slide.id), target = index + delta;
      if (target < 0 || target >= items.length) return;
      [items[index], items[target]] = [items[target], items[index]]; edit({ ...content, slides: items });
    }
  }
  function duplicateItem() {
    if (mode === "report") { const item = { ...section, id: crypto.randomUUID(), title: `${section.title.slice(0, 145)} 副本` }; if (edit({ ...content, report: [...content.report, item] })) setSectionId(item.id); }
    else { const item = { ...slide, id: crypto.randomUUID(), title: `${slide.title.slice(0, 145)} 副本` }; if (edit({ ...content, slides: [...content.slides, item] })) setSlideId(item.id); }
  }
  function removeItem() {
    if (mode === "report") { if (content.report.length < 2) return; const index = content.report.findIndex(s => s.id === section.id); const remaining = content.report.filter(s => s.id !== section.id); edit({ ...content, report: remaining }); setSectionId(remaining[Math.min(index, remaining.length - 1)].id); }
    else { if (content.slides.length < 2) return; const index = content.slides.findIndex(s => s.id === slide.id); const remaining = content.slides.filter(s => s.id !== slide.id); edit({ ...content, slides: remaining }); setSlideId(remaining[Math.min(index, remaining.length - 1)].id); }
    setMessage("已移除，可点“撤销”恢复。");
  }
  async function exportFile(kind: "docx" | "appendix" | "pptx" | "json") {
    setExporting(true); setMessage("");
    try {
      const { buildDocx, buildPptx, downloadBlob, fileName } = await import("@/lib/editor-export");
      // Backup must remain available even while a required title is temporarily blank.
      const data = kind === "json" ? current.current : parseEditorContent(current.current);
      if(kind==="pptx"){
        const warnings=await reportExportWarnings(data);
        if(warnings.length&&!window.confirm(`本次 PPT 草稿有 ${warnings.length} 页需复核报告关联：\n${warnings.map(w=>`第 ${w.page} 页：${w.state==='check_failed'?'关联检查未完成':LINK_LABELS[w.state]}`).join('\n')}\n\n这不判断事实真假，也不会自动覆盖内容。确定仍导出这份草稿？取消后可返回核对。`)){
          setMessage("已取消导出，未修改作品。请核对提示页的报告依据与页面内容。");return;
        }
      }
      const blob = kind === "docx" || kind === "appendix" ? await buildDocx(data,{...reportFormat,part:kind==='appendix'?'appendix':'main'}) : kind === "pptx" ? await buildPptx(data) : new Blob([JSON.stringify(data)], { type: "application/json" });
      downloadBlob(blob, `${fileName(data.title)}${kind==='docx'?'-报告正文':kind==='appendix'?'-附录':''}.${kind==='appendix'?'docx':kind}`);
      setMessage(kind==='docx'||kind==='appendix'?`已按公开格式范本生成${kind==='appendix'?'独立附录':'报告正文'}。请在 Word/WPS 更新目录并核对实际分页、匿名和引用。${reportFormatNotices(data.report).join('')}`:"已生成下载文件。导出的是编辑草稿，不代表已通过赛事合规检查。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "导出失败，请重试。"); }
    finally { setExporting(false); }
  }
  async function importBackup(file: File | undefined) {
    if (!file || !canReplace()) return;
    busy.current = true; setPhase("loading");
    try {
      if (file.size > EDITOR_LIMITS.bytes) throw new Error("备份超过 500 KB。");
      const raw: unknown = JSON.parse(await file.text());
      if (!alive.current || identityTransition.current) return;
      if (raw && typeof raw === "object" && "title" in raw && typeof raw.title === "string" && !raw.title.trim()) raw.title = "未命名研究";
      const next = parseEditorContent(raw);
      setStoryboardOpen(false);
      setStoryboardGeneration(value=>value+1);
      resetVersions();
      setSectionId(next.report[0].id); setSlideId(next.slides[0].id); setOutlineQuery(""); previewRef.current?.scrollTo({ top: 0 });
      setRecord(null); pendingId.current = null; acknowledgeSaved(""); blocked.current = false;
      current.current = next; setContent(next); setPast([]); setFuture([]);
      setMessage("已载入备份，将另存为新草稿，不覆盖原作品。");
    } catch (e) { if (!identityTransition.current) setMessage(e instanceof Error ? e.message : "备份格式不正确。"); }
    finally { busy.current = false; if (!identityTransition.current) setPhase(blocked.current ? "error" : "ready"); }
  }

  const loadVersions = useCallback(async () => {
    if (identityTransition.current) return;
    const active = record.current;
    if (!active) { setVersions([]); return; }
    const epoch = ++versionEpoch.current;
    setVersionLoading(true);
    try {
      const result = await request<{ versions: DraftVersionSummary[] }>(`/api/drafts/${active.id}/versions`, { headers: { "x-editor-scope": scope.current } });
      if (epoch === versionEpoch.current && record.current?.id === active.id) setVersions(result.versions);
    } catch (e) { if (epoch === versionEpoch.current) setMessage(e instanceof Error ? e.message : "版本列表读取失败。"); }
    finally { if (epoch === versionEpoch.current) setVersionLoading(false); }
  }, []);
  useEffect(() => { if (libraryOpen) void loadVersions(); }, [libraryOpen, activeDraftId, loadVersions]);

  async function createVersion() {
    if (busy.current || versionOperation.current || blocked.current) return;
    let label: string;
    try { label = parseVersionLabel(versionLabel); } catch (e) { setMessage((e as Error).message); return; }
    const requested = JSON.stringify(current.current);
    versionOperation.current = true; setVersionBusy(true);
    try {
      const persisted = await save(false, true);
      if (!persisted || identityTransition.current) return;
      if (JSON.stringify(persisted.content) !== requested) throw new Error("上次重试返回了先前保存的内容。当前文字仍保留，请先点立即保存，再保存命名版本。");
      const previous = pendingVersion.current;
      const attempt = previous && previous.draftId === persisted.id && previous.label === label && previous.revision === persisted.revision ? previous : { id: crypto.randomUUID(), draftId: persisted.id, label, revision: persisted.revision };
      pendingVersion.current = attempt;
      const result = await request<{ version: DraftVersionSummary }>(`/api/drafts/${persisted.id}/versions`, { method: "POST", headers: { "x-editor-scope": scope.current }, body: JSON.stringify({ id: attempt.id, label, revision: persisted.revision }) });
      if (!alive.current || identityTransition.current) return;
      pendingVersion.current = null;
      versionEpoch.current += 1; setVersionLoading(false);
      setVersions(list => [result.version, ...list.filter(v => v.id !== result.version.id)]);
      setVersionLabel(""); setMessage(`已保存命名版本“${result.version.label}”。恢复时会创建副本，不覆盖原稿。`);
    } catch (e) {
      if (!alive.current || identityTransition.current) return;
      if (["draft_conflict", "editor_scope_changed"].includes((e as { code?: string }).code || "")) { blocked.current = true; setPhase("conflict"); }
      setMessage(e instanceof Error ? e.message : "命名版本保存失败，原稿与当前内容未改变。");
    } finally {
      versionOperation.current = false; setVersionBusy(false);
      if (!blocked.current) setPhase(JSON.stringify(current.current) === saved.current ? "saved" : "ready");
    }
  }
  async function restoreVersion(version: DraftVersionSummary) {
    if (!canReplace()) return;
    busy.current = true; setPhase("loading");
    try {
      const result = await request<{ version: DraftVersion }>(`/api/drafts/${version.draftId}/versions/${version.id}`, { headers: { "x-editor-scope": scope.current } });
      if (!alive.current || identityTransition.current) return;
      const next = parseEditorContent(result.version.content);
      resetVersions(); setRecord(null); pendingId.current = null; acknowledgeSaved(""); blocked.current = false;
      setStoryboardOpen(false);setStoryboardGeneration(value=>value+1);
      setOutlineQuery(""); previewRef.current?.scrollTo({ top: 0 });
      current.current = next; setContent(next); setPast([]); setFuture([]); setSectionId(next.report[0].id); setSlideId(next.slides[0].id); setSaveTime("");
      setMessage(`已将“${version.label}”打开为新作品，自动保存后生成独立草稿。原稿和历史版本均保留。`);
    } catch (e) { if (!identityTransition.current) setMessage(e instanceof Error ? e.message : "读取版本失败，当前内容未改变。"); }
    finally { busy.current = false; if (!identityTransition.current) setPhase(blocked.current ? "error" : "ready"); }
  }

  useEffect(() => {
    if (mode !== "report" || view === "write") return;
    const box = previewRef.current;
    const target = box && [...box.querySelectorAll<HTMLElement>("[data-report-section]")].find(el => el.dataset.reportSection === sectionId);
    if (box && target) box.scrollTo({ top: box.scrollTop + target.getBoundingClientRect().top - box.getBoundingClientRect().top - 24, behavior: "instant" });
  }, [sectionId, mode, view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (fileLibraryOpen || !studioRef.current?.getClientRects().length || event.isComposing || event.altKey || presenting || document.querySelector('dialog[open]')) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") { event.preventDefault(); if (phase !== "loading" && !busy.current && !versionOperation.current && !blocked.current) void save(); return; }
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input,textarea,select") || target.isContentEditable)) return;
      if (phase === "loading" || versionOperation.current) return;
      if (key === "z" || key === "y") { event.preventDefault(); if (key === "y" || event.shiftKey) redo(); else undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const dialog = presentRef.current;
    const studio = studioRef.current;
    const trigger = presentationTrigger.current;
    if (!presenting || !dialog) return;
    dialog.showModal();
    const leave = () => { if (window.location.hash !== "#editor") setPresenting(false); };
    window.addEventListener("hashchange", leave);
    return () => { window.removeEventListener("hashchange", leave); dialog.close(); if (studio?.getClientRects().length) trigger?.focus({ preventScroll: true }); };
  }, [presenting]);
  const items = mode === "report" ? content.report : content.slides;
  const selectedId = mode === "report" ? section.id : slide.id;
  const selectedIndex = items.findIndex(s => s.id === selectedId);
  const statusText = versionBusy ? "正在保存命名版本…" : phase === "loading" ? "正在读取草稿…" : phase === "saving" ? "正在保存…" : phase === "conflict" ? "版本冲突 · 已暂停保存" : phase === "error" ? "未保存 · 请重试" : dirty ? "有修改 · 即将保存" : activeDraftId ? `已保存 ${saveTime}` : "模板 · 编辑后自动保存";
  const locked = identityFrozen || phase === "loading" || phase === "saving" || versionBusy;
  const visibleItems = items.map((item, index) => ({ item, index })).filter(({ item }) => item.title.toLocaleLowerCase().includes(outlineQuery.trim().toLocaleLowerCase()));
  const presentationSlide = content.slides[presentIndex] || content.slides[0];

  return <section className={styles.studio} id="editor" ref={studioRef} data-view={view} data-outline={outlineOpen} aria-label="报告与 PPT 实时编辑工作区">
    <div className={styles.documentBar} aria-label="选择文档工作区">
      <div className={styles.modeGroup}>
        <button type="button" aria-pressed={!fileLibraryOpen} onClick={() => setFileLibraryOpen(false)}>文本草稿</button>
        {!localOnly&&<button type="button" aria-pressed={fileLibraryOpen} onClick={() => setFileLibraryOpen(true)}>Office 原文件</button>}
      </div>
      <span className={styles.saveStatus}>全文排版引擎待接入 · 原文件独立保存</span>
    </div>
    {!localOnly&&<EditorRecovery onBeforeRestore={beforeRestore}/>}
    {localOnly&&<div className={styles.notice}><span>本地编辑模式，支持分镜、撤销和 Word / PPTX 导出。请下载 JSON 保存进度。</span><button type="button" onClick={()=>void exportFile('json')}>下载 JSON 备份</button><button type="button" onClick={()=>importInput.current?.click()}>恢复备份</button></div>}
    {identityFrozen && <div className={styles.notice} role="alert"><span>身份切换保护已开启：当前页不再读写服务器作品。请先导出未保存内容，再手动刷新；页面不会自动丢弃正文。</span><button type="button" onClick={() => void exportFile("json")} disabled={exporting}>下载当前正文备份</button></div>}
    {!localOnly&&fileLibraryOpen&&<div><OfficeFileLibrary/></div>}
    <div hidden={fileLibraryOpen}>
    <div className={styles.documentBar}>
      <div className={styles.identity}><label><span>研究作品</span><input aria-label="作品名称" maxLength={120} value={content.title} disabled={phase === "loading" || versionBusy} onChange={e => edit({ ...content, title: e.target.value })}/></label></div>
      <div className={styles.saveGroup}><span role="status" aria-live="polite" className={styles.saveStatus} data-warning={phase === "error" || phase === "conflict"}>{localOnly?(dirty?'本页有未备份修改':'本地编辑模式'):statusText}</span>{!localOnly&&<><button type="button" title="Ctrl / ⌘ S" onClick={() => void save()} disabled={locked || phase === "conflict"}>立即保存</button><button type="button" aria-expanded={libraryOpen} aria-controls="editor-library" onClick={() => setLibraryOpen(!libraryOpen)}>草稿与版本</button></>}</div>
    </div>
    <div className={styles.libraryPanel} id="editor-library" hidden={localOnly||!libraryOpen}>
    <div className={styles.libraryBar}>
      <label>草稿库<select aria-label="选择已保存草稿" value={activeDraftId || ""} disabled={locked} onChange={e => void openDraft(e.target.value)}><option value="">未保存的新作品</option>{drafts.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
      <button type="button" onClick={newDraft} disabled={locked}>＋ 新建作品</button>
      <button type="button" onClick={() => void save(true)} disabled={locked}>另存副本</button>
      <button type="button" onClick={() => { setPhase("loading"); setMessage(""); void connect(); }} disabled={locked}>刷新草稿库</button>
      <button type="button" onClick={() => void exportFile("json")} disabled={exporting}>下载 JSON 备份</button>
      <button type="button" disabled={locked} onClick={() => importInput.current?.click()}>恢复备份</button>
      <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={e => { void importBackup(e.target.files?.[0]); e.target.value = ""; }}/>
      <details className={styles.storageNote}><summary>保存与隐私</summary><p>正文与讲稿保存到服务器，按账户或浏览器私密会话隔离。匿名用户请提前在“身份与恢复”保存恢复密钥，以便 Cookie 丢失或会话过期后找回文件库；未设置密钥时只能导入自行下载的备份。密钥不能代替文件备份，服务器数据仍需保留。请定期导出 JSON，不填写原始问卷、个人信息或未授权资料。当前支持单人编辑。</p></details>
    </div>
    <div className={styles.versionManager}>
      <div><strong>命名版本</strong><p>自动保存当前进度；在关键节点保留独立版本。每份作品最多 20 个，不自动删除。</p></div>
      <div className={styles.versionForm}><input aria-label="版本名称" maxLength={80} placeholder="例如：初稿完成、答辩前定稿" value={versionLabel} disabled={locked} onChange={e => setVersionLabel(e.target.value)}/><button type="button" title={phase === "error" ? "请先点立即保存，成功后再保存命名版本" : "保存当前已确认的正文和幻灯片"} onClick={() => void createVersion()} disabled={locked || phase === "conflict" || phase === "error" || !versionLabel.trim()}>保存命名版本</button><button type="button" onClick={() => void loadVersions()} disabled={!activeDraftId || versionLoading || locked}>刷新版本</button></div>
      <div className={styles.versionList} aria-busy={versionLoading}>{versions.map(v => <article key={v.id}><div><strong>{v.label}</strong><span>{new Date(v.createdAt).toLocaleString("zh-CN")} · 修订 {v.sourceRevision}</span></div><button type="button" disabled={locked} onClick={() => void restoreVersion(v)}>打开为新作品</button></article>)}{!versions.length && <p>{versionLoading ? "正在读取版本…" : "尚无命名版本。自动保存不会创建历史快照。"}</p>}</div>
    </div></div>
    {message && <div className={styles.notice} role={phase === "error" || phase === "conflict" ? "alert" : "status"}><span>{message}</span>{phase === "conflict" && <button type="button" disabled={locked} onClick={() => void save(true)}>保留当前内容为副本</button>}<button type="button" aria-label="关闭提示" onClick={() => setMessage("")}>×</button></div>}
    <div className={styles.toolbar}>
      <div className={styles.modeGroup} role="group" aria-label="编辑内容类型"><button type="button" aria-pressed={mode === "report"} onClick={() => setMode("report")}>报告书</button><button type="button" aria-pressed={mode === "slides"} onClick={() => setMode("slides")}>PPT 幻灯片</button></div>
      <div className={styles.history}><button type="button" onClick={undo} disabled={!past.length || phase === "loading" || versionBusy}>↶ 撤销</button><button type="button" onClick={redo} disabled={!future.length || phase === "loading" || versionBusy}>↷ 重做</button></div>
      <div className={styles.exports}>{mode === "slides" && <button ref={presentationTrigger} type="button" onClick={() => { setPresentIndex(selectedIndex); setShowNotes(false); setPresenting(true); }}>演示预览</button>}{mode==='report'&&<button type="button" disabled={exporting||!content.report.some(s=>reportPart(s.title)==='appendix')} onClick={()=>void exportFile('appendix')}>单独导出 Word 附录</button>}<button type="button" className={styles.primary} onClick={() => void exportFile(mode === "report" ? "docx" : "pptx")} disabled={exporting}>{exporting ? "正在生成…" : mode === "report" ? "导出 Word 报告正文" : "导出 PPTX 草稿"}</button></div>
    </div>
    {mode==='report'&&<details className={styles.reportFormat}><summary>报告排版范本与导出设置 · {REPORT_FORMAT.label}</summary><p><a href={REPORT_FORMAT.sourceUrl} target="_blank" rel="noopener noreferrer">{REPORT_FORMAT.sourceTitle}</a> · 核验日期 {REPORT_FORMAT.verifiedAt}</p><p>{REPORT_FORMAT.sourceScope}</p><ul>{Object.values(REPORT_FORMAT.verified).map(value=><li key={value}>{value}</li>)}</ul><p>正文导出依次排列标题页、已有摘要、自动目录、普通正文、参考文献，各类章节保持原有顺序；明确命名为“附录”的章节单独导出。正文中“一、”“（一）”“1.”等编号开头的短行映射为对应层级标题。旧“参考文献与附录”章节会完整保留，请先拆分。</p><label>首行缩进（原附件未规定，可调整）<select value={reportFormat.firstLineChars} onChange={e=>setReportFormat(f=>({...f,firstLineChars:Number(e.target.value) as 0|2}))}><option value={2}>2 字符</option><option value={0}>不缩进</option></select></label><label><input type="checkbox" checked={reportFormat.numberPages} onChange={e=>setReportFormat(f=>({...f,numberPages:e.target.checked}))}/>加入页码（版式选项）：标题页不编号；摘要与目录用罗马数字；正文从 1 起，参考文献续编；独立附录从 1 起。</label><p>这些选项用于本次导出，不改写旧备份结构。网页是内容预览，Word/WPS 排版为最终分页依据。65 页上限、图表题位置、参考文献著录及匿名需在最终文件中核对；系统不会把样式应用当作提交验收通过。</p>{reportFormatNotices(content.report).map(message=><p key={message}>{message}</p>)}</details>}
    <div hidden={!storyboardOpen}><ReportStoryboard key={storyboardGeneration} content={content} disabled={locked} onClose={()=>setStoryboardOpen(false)} onApply={(slides,base)=>{
      if(identityTransition.current||busy.current||versionOperation.current||JSON.stringify(current.current)!==base)return false;
      try {
        const next=parseEditorContent({...current.current,slides});
        const firstNew=slides.find(s=>!current.current.slides.some(old=>old.id===s.id));
        if(!edit(next))return false;
        setMode('slides');setSlideId(firstNew?.id||slides[0].id);setStoryboardOpen(false);
        setMessage('已按确认分镜更新 PPT，报告原文未改变。可在本页撤销；请核对保存状态或下载 JSON 备份。');return true;
      } catch(e){setMessage((e as Error).message);return false;}
    }}/></div>
    <div className={styles.viewBar}><button type="button" aria-pressed={outlineOpen} onClick={() => setOutlineOpen(!outlineOpen)}>{outlineOpen ? "收起目录" : "展开目录"}</button><div role="group" aria-label="工作区视图"><button type="button" aria-pressed={view === "write"} onClick={() => setView("write")}>专注写作</button><button type="button" aria-pressed={view === "split"} onClick={() => setView("split")}><span className={styles.wideLabel}>编辑与预览</span><span className={styles.compactLabel}>编辑</span></button><button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>仅预览</button></div><span>{mode === "report" ? `${content.report.reduce((n,s) => n+s.body.length,0).toLocaleString()} 字正文` : `${content.slides.length} 页幻灯片`}</span></div>
    <div className={styles.editorGrid}>
      <aside className={styles.outline} aria-label={mode === "report" ? "报告目录" : "幻灯片列表"}>
        <div className={styles.paneLabel}><strong>{mode === "report" ? "章节目录" : "幻灯片"}</strong><span>{items.length} / 40</span></div>
        <input className={styles.outlineSearch} aria-label="搜索目录" placeholder="搜索目录…" value={outlineQuery} onChange={e => setOutlineQuery(e.target.value)}/>
        <div className={styles.itemList}>{visibleItems.map(({ item, index }) => <button type="button" key={item.id} data-mode={mode} aria-current={selectedId === item.id ? "true" : undefined} onClick={() => mode === "report" ? setSectionId(item.id) : setSlideId(item.id)}><span className={styles.itemLabel}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><span>{item.title || "未命名"}</span></span>{mode === "slides" && <span className={styles.thumbnail} aria-hidden="true" style={{ borderColor: `#${ACCENTS[content.accent]}` }}><strong>{item.title}</strong><span>{item.body.slice(0, 90)}</span></span>}</button>)}{!visibleItems.length && <p className={styles.noResults}>没有匹配标题。<button type="button" onClick={() => setOutlineQuery("")}>清除搜索</button></p>}</div>
        <button type="button" className={styles.addItem} disabled={items.length >= 40 || phase === "loading" || versionBusy} onClick={addItem}>＋ {mode === "report" ? "添加章节" : "添加页面"}</button>
      </aside>
      <fieldset className={styles.fields} disabled={phase === "loading" || versionBusy}>
        <legend>{mode === "report" ? "章节编辑" : "页面编辑"}</legend>
        <div className={styles.itemActions}><span>第 {selectedIndex + 1} {mode === "report" ? "章" : "页"}</span><button type="button" disabled={selectedIndex === 0} onClick={() => moveItem(-1)} aria-label="向上移动">↑</button><button type="button" disabled={selectedIndex === items.length - 1} onClick={() => moveItem(1)} aria-label="向下移动">↓</button><button type="button" disabled={items.length >= 40} onClick={duplicateItem}>复制</button><button type="button" disabled={items.length < 2} onClick={removeItem}>移除</button></div>
        {mode === "report" ? <>
          <label>章节标题<input maxLength={150} value={section.title} onChange={e => patchSection({ title: e.target.value })}/></label>
          <label>正文<textarea className={styles.bodyInput} maxLength={12000} value={section.body} onChange={e => patchSection({ body: e.target.value })} placeholder="写下本章内容，每次换行形成一个段落。"/></label>
          <span className={styles.counter}>{section.body.length.toLocaleString()} / 12,000 字</span>
          <label>来源与说明<textarea rows={3} maxLength={1500} value={section.source} onChange={e => patchSection({ source: e.target.value })} placeholder="文献、报告页码、访谈编号或尚待核实的依据"/></label>
          <details className={styles.coverSettings}><summary>封面设置</summary><label>报告副标题<input maxLength={240} value={content.subtitle} onChange={e => edit({ ...content, subtitle: e.target.value })}/></label></details>
          <button type="button" className={styles.outlineButton} aria-expanded={storyboardOpen} onClick={()=>setStoryboardOpen(!storyboardOpen)}>报告分镜：选择证据并制作 PPT</button>
        </> : <>
          <ReportLinkNotice content={content} slide={slide}/>
          <button type="button" className={styles.outlineButton} aria-expanded={storyboardOpen} onClick={()=>setStoryboardOpen(!storyboardOpen)}>打开报告分镜</button>
          <div className={styles.designSettings}><label>版式<select value={slide.layout} onChange={e => patchSlide({ layout: e.target.value as Slide["layout"] })}><option value="cover">封面</option><option value="content">标题与正文</option><option value="two-column">正文与旁注</option></select></label>
          <label>强调色<select value={content.accent} onChange={e => edit({ ...content, accent: e.target.value as EditorContent["accent"] })}><option value="teal">深青</option><option value="blue">学术蓝</option><option value="burgundy">酒红</option></select></label></div>
          <label>页面标题<input maxLength={150} value={slide.title} onChange={e => patchSlide({ title: e.target.value })}/></label>
          <label>页面正文<textarea rows={8} maxLength={1800} value={slide.body} onChange={e => patchSlide({ body: e.target.value })}/></label>
          {slide.layout === "two-column" && <label>右侧旁注<textarea rows={4} maxLength={1800} value={slide.aside} onChange={e => patchSlide({ aside: e.target.value })}/></label>}
          <label>演讲备注（不显示在画面中）<textarea rows={4} maxLength={6000} value={slide.notes} onChange={e => patchSlide({ notes: e.target.value })}/></label>
          {slide.body.length + (slide.layout === "two-column" ? slide.aside.length : 0) > 420 && <p className={styles.warning}>这一页文字较多，建议拆页。PPTX 导出会尝试缩小字号，实际可读性请在演示软件中复核。</p>}
        </>}
      </fieldset>
      <div className={styles.previewPane}>
        <div className={styles.previewHeading}><strong>实时预览</strong><span>{mode === "report" ? "正文连续预览 · 导出为 A4" : "16:9 · 原生文字可编辑"}</span></div>
        <div className={styles.previewScroll} ref={previewRef} tabIndex={0} role="region" aria-label="实时预览（可滚动）">
          {mode === "report" ? <article className={styles.paper} aria-label="报告书实时预览"><header><h2>{content.title}</h2><p>{content.subtitle}</p></header>{content.report.map(s => <section key={s.id} data-report-section={s.id} className={s.id === section.id ? styles.activeSection : undefined}><h3>{s.title || "未命名章节"}</h3>{s.body.split("\n").map((line, i) => <p key={i}>{line || "\u00A0"}</p>)}{s.source && <p className={styles.source}>来源 / 说明：{s.source}</p>}</section>)}</article> : <SlidePreview slide={slide} accent={content.accent} index={selectedIndex} label="PPT 实时预览"/>}
        </div>
        <div className={styles.previewFoot}><span>{mode === "report" ? `${content.report.reduce((n, s) => n + s.body.length, 0).toLocaleString()} 字正文` : `${content.slides.length} 页幻灯片`}</span><span>预览为版式参考 · 导出后复核分页与字体</span></div>
      </div>
    </div>
    <p className={styles.boundary}>模板仅作写作提示。导出保留文字和讲稿，不添加系统品牌；提交前请核对当届规则、匿名要求和 AI 披露。此处不支持导入原有 Word / PowerPoint 排版。</p>
    <dialog ref={presentRef} className={styles.presentation} aria-label="幻灯片演示预览" onCancel={() => setPresenting(false)} onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); setPresentIndex(i => Math.min(content.slides.length-1,i+1)); }
      if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); setPresentIndex(i => Math.max(0,i-1)); }
    }}><header><span>演示预览 · {presentIndex+1} / {content.slides.length}</span><button type="button" autoFocus onClick={() => setPresenting(false)}>退出演示（Esc）</button></header><div className={styles.presentationStage}><SlidePreview slide={presentationSlide} accent={content.accent} index={presentIndex} label="当前演示页面"/></div><footer><button type="button" disabled={presentIndex === 0} onClick={() => setPresentIndex(i => i-1)}>上一页</button><button type="button" aria-pressed={showNotes} onClick={() => setShowNotes(!showNotes)}>演讲备注</button><button type="button" disabled={presentIndex >= content.slides.length-1} onClick={() => setPresentIndex(i => i+1)}>下一页</button></footer>{showNotes && <p className={styles.speakerNotes}>{presentationSlide.notes || "此页尚无演讲备注。"}</p>}</dialog>
    </div>
  </section>;
}

function SlidePreview({ slide, accent, index, label }: { slide: Slide; accent: EditorContent["accent"]; index: number; label: string }) {
  return <div className={styles.slideCanvas} data-layout={slide.layout} style={{ "--slide-accent": `#${ACCENTS[accent]}` } as React.CSSProperties} aria-label={label}><h2>{slide.title}</h2><div className={styles.slideBody}><p>{slide.body}</p>{slide.layout === "two-column" && <aside>{slide.aside}</aside>}</div><span className={styles.slideNumber}>{String(index + 1).padStart(2,"0")}</span></div>;
}
