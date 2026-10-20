"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseOfficeFilename, parseOfficeLabel } from "@/lib/office-model";
import styles from "./OfficeFileLibrary.module.css";
import { EDITOR_RECOVERY_EVENT } from "@/lib/editor-recovery";
import OnlyOfficeEditor from "./OnlyOfficeEditor";
import {useKeyedListMotion} from "../motion/useWorkspaceMotion";

type OfficeKind = "docx" | "pptx";
type OfficeFile = { id: string; filename: string; kind: OfficeKind; revision: number; sha256: string; size: number; updatedAt: string };
type OfficeVersion = { id: string; fileId: string; revision: number; filename: string; kind: OfficeKind; size: number; sha256: string; label: string; createdAt: string };
type Limits = { bytes: number; files: number; versions: number };
type Library = { files: OfficeFile[]; scope: string; storage: "local-r2" | "r2"; available: boolean; limits: Limits };
type Detail = { file: OfficeFile; versions: OfficeVersion[] };
type Task = { controller: AbortController; epoch: number; kind: "refresh" | "open" | "upload" | "download" };
type Attempt = { key: string; fileId: string; versionId: string; target: string | null; baseRevision: number | null };
type RecoveryItem = { key: string; fileId: string; filename: string; kind: OfficeKind; sha256: string; size: number; expiresAt: string | null; recoveryUrl: string };
const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_LIMITS: Limits = { bytes: MAX_BYTES, files: 20, versions: 20 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const NATIVE_KEY = /^ne_[A-Za-z0-9_-]{43}$/;

class FileServiceError extends Error {
  constructor(message: string, readonly status = 0, readonly code = "") { super(message); }
}
function isFile(value: unknown): value is OfficeFile {
  if (!value || typeof value !== "object") return false;
  const f = value as OfficeFile;
  return UUID.test(f.id) && typeof f.filename === "string" && f.filename.length > 0 && ["docx", "pptx"].includes(f.kind) && Number.isInteger(f.revision) && f.revision > 0 && SHA.test(f.sha256) && Number.isInteger(f.size) && f.size > 0 && f.size <= MAX_BYTES && typeof f.updatedAt === "string";
}
function readLibrary(value: unknown): Library {
  const r = value as Library;
  if (!r || !Array.isArray(r.files) || !r.files.every(isFile) || typeof r.scope !== "string" || !r.scope || !["local-r2", "r2"].includes(r.storage) || typeof r.available !== "boolean" || !r.limits || ![r.limits.bytes, r.limits.files, r.limits.versions].every(n => Number.isInteger(n) && n > 0)) throw new FileServiceError("文件库返回格式异常，未替换当前选择。");
  return r;
}
function readDetail(value: unknown, id: string): Detail {
  const r = value as Detail;
  if (!r || !isFile(r.file) || r.file.id !== id || !Array.isArray(r.versions) || !r.versions.every(v => v && UUID.test(v.id) && v.fileId === id && Number.isInteger(v.revision) && v.revision > 0 && v.revision <= r.file.revision && ["docx", "pptx"].includes(v.kind) && v.kind === r.file.kind && SHA.test(v.sha256) && Number.isInteger(v.size) && v.size > 0 && v.size <= MAX_BYTES && typeof v.filename === "string" && typeof v.label === "string" && typeof v.createdAt === "string")) throw new FileServiceError("版本信息不完整，未替换当前文件。");
  return r;
}
function readRecoveries(value: unknown): RecoveryItem[] {
  const items = (value as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length > 20 || !items.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const r = item as RecoveryItem;
    return NATIVE_KEY.test(r.key) && UUID.test(r.fileId) && typeof r.filename === "string" && r.filename.length > 0 && r.filename.length <= 255 &&
      ["docx", "pptx"].includes(r.kind) && SHA.test(r.sha256) && Number.isInteger(r.size) && r.size > 0 && r.size <= MAX_BYTES &&
      (r.expiresAt === null || (typeof r.expiresAt === "string" && Number.isFinite(Date.parse(r.expiresAt)))) &&
      r.recoveryUrl === `/api/drafts/native/sessions/${r.key}/recovery`;
  })) throw new FileServiceError("冲突副本列表格式异常，未覆盖当前记录。");
  return items as RecoveryItem[];
}
async function responseError(response: Response): Promise<FileServiceError> {
  let message = `文件服务返回 ${response.status}，请重试。`, code = "";
  try { const body = await response.json() as { error?: { message?: unknown; code?: unknown } }; if (typeof body?.error?.message === "string") message = body.error.message; if (typeof body?.error?.code === "string") code = body.error.code; } catch { /* Preserve a useful error even for a proxy HTML response. */ }
  return new FileServiceError(message, response.status, code);
}
async function jsonRequest(url: string, signal: AbortSignal, init?: RequestInit): Promise<{ value: unknown; status: number }> {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
  if (!response.ok) throw await responseError(response);
  try { return { value: await response.json(), status: response.status }; } catch { throw new FileServiceError("文件服务没有返回完整确认，不能视为已保存。请使用相同文件重试。", response.status); }
}
async function ensureSession(signal: AbortSignal) {
  const establish = async () => { signal.throwIfAborted(); await jsonRequest("/api/drafts/session", signal, { method: "POST" }); };
  if (navigator.locks) await navigator.locks.request("evix-editor-session-v1", { signal }, establish);
  else await establish();
}
function isScopeError(error: unknown) { return error instanceof FileServiceError && ([401, 403].includes(error.status) || /scope_changed|scope_mismatch/.test(error.code)); }
function sizeLabel(size: number) { return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(2)} MiB`; }
function timeLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "时间待核验" : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function recoveryDeadline(value: string | null, now: number) {
  if (!value) return { text: "当前不自动清理", urgent: false, expired: false };
  const remaining = Date.parse(value) - now;
  if (remaining <= 0) return { text: "已到期，请刷新核对", urgent: true, expired: true };
  return { text: remaining <= 48 * 60 * 60 * 1000 ? `即将到期，请尽快下载 · ${timeLabel(value)}` : `保留至 ${timeLabel(value)}`, urgent: remaining <= 48 * 60 * 60 * 1000, expired: false };
}
function recoveryExpiredNow(value: string | null) { return value !== null && Date.parse(value) <= Date.now(); }
async function digest(bytes: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join(""); }

export default function OfficeFileLibrary() {
  const inputId = useId();
  const [files, setFiles] = useState<OfficeFile[]>([]);
  const [active, setActive] = useState<OfficeFile | null>(null);
  const [versions, setVersions] = useState<OfficeVersion[]>([]);
  const [picked, setPicked] = useState<File | null>(null);
  const [mode, setMode] = useState<"new" | "version">("new");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<Task["kind"] | null>(null);
  const [connection, setConnection] = useState<"loading" | "ready" | "unavailable" | "error" | "scope-blocked">("loading");
  const [storage, setStorage] = useState<Library["storage"] | null>(null);
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflictStep, setConflictStep] = useState<"none" | "refresh" | "reselect">("none");
  const alive = useRef(false), epoch = useRef(0), operation = useRef<Task | null>(null);
  const scope = useRef(""), scopeBlocked = useRef(false), available = useRef(false);
  const identityTransition = useRef(false);
  const [identityFrozen, setIdentityFrozen] = useState(false);
  const [nativeConfigured, setNativeConfigured] = useState(false);
  const [nativeStatus, setNativeStatus] = useState<"checking" | "ready" | "not-configured" | "error">("checking");
  const [nativeEditing, setNativeEditing] = useState<{ file: OfficeFile; scope: string } | null>(null);
  const [recoveries, setRecoveries] = useState<RecoveryItem[]>([]);
  const [recoveryStatus, setRecoveryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [recoveryBusy, setRecoveryBusy] = useState<string | null>(null);
  const [recoveryClock, setRecoveryClock] = useState(() => Date.now());
  const activeRef = useRef<OfficeFile | null>(null), pickedRef = useRef<File | null>(null);
  const modeRef = useRef<"new" | "version">("new"), limitsRef = useRef(DEFAULT_LIMITS);
  const pending = useRef<Attempt | null>(null), conflict = useRef<"none" | "refresh" | "reselect">("none");
  const blobUrls = useRef(new Set<string>());
  const recoveryEpoch = useRef(0);
  const recoveryListController = useRef<AbortController | null>(null);
  const recoveryDownloadController = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const begin = useCallback((kind: Task["kind"]) => {
    if (!alive.current || identityTransition.current || operation.current) return null;
    const task: Task = { kind, epoch: ++epoch.current, controller: new AbortController() };
    operation.current = task; setBusy(kind); setError(""); setNotice(""); return task;
  }, []);
  const current = useCallback((task: Task) => alive.current && operation.current === task && epoch.current === task.epoch && !task.controller.signal.aborted, []);
  const finish = useCallback((task: Task) => { if (operation.current === task) { operation.current = null; if (alive.current) setBusy(null); } }, []);
  const freezeScope = useCallback(() => {
    scopeBlocked.current = true; available.current = false; setConnection("scope-blocked");
    setError("当前身份或文件库归属已改变。已保留本页选择，上传和下载已暂停；不会自动把文件保存到另一身份。");
  }, []);
  const scopeHeaders = useCallback((): Record<string, string> => scope.current ? { "x-editor-scope": scope.current } : {}, []);
  const acceptLibrary = useCallback((library: Library) => {
    if (scope.current && library.scope !== scope.current) { freezeScope(); throw new FileServiceError("文件库归属已改变。", 409, "editor_scope_changed"); }
    if (scopeBlocked.current) throw new FileServiceError("请先明确重新连接当前身份。", 409, "editor_scope_changed");
    if (!scope.current) scope.current = library.scope;
    if (!library.available) throw new FileServiceError("对象存储尚未就绪。已选本地文件仍保留，请稍后刷新。", 503);
    const bounded = { bytes: Math.min(MAX_BYTES, library.limits.bytes), files: Math.min(20, library.limits.files), versions: Math.min(20, library.limits.versions) };
    available.current = true; limitsRef.current = bounded; setLimits(bounded); setFiles(library.files); setStorage(library.storage); setConnection("ready");
  }, [freezeScope]);
  const showFailure = useCallback((failure: unknown, fallback: string) => {
    if (isScopeError(failure)) { freezeScope(); return; }
    if (failure instanceof FileServiceError && failure.status === 503) { available.current = false; setConnection("unavailable"); }
    setError(failure instanceof Error ? failure.message : fallback);
  }, [freezeScope]);

  const loadLibrary = useCallback(async () => {
    if (scopeBlocked.current) return;
    const task = begin("refresh"); if (!task) return;
    try {
      await ensureSession(task.controller.signal);
      if (!current(task)) return;
      const response = await jsonRequest("/api/drafts/files", task.controller.signal, { headers: scopeHeaders() });
      if (!current(task)) return;
      const library = readLibrary(response.value); acceptLibrary(library);
      const selected = activeRef.current;
      if (selected) {
        if (library.files.some(f => f.id === selected.id)) {
          const detail = await jsonRequest(`/api/drafts/files/${selected.id}`, task.controller.signal, { headers: scopeHeaders() });
          if (!current(task)) return;
          const value = readDetail(detail.value, selected.id); activeRef.current = value.file; setActive(value.file); setVersions(value.versions);
        } else { activeRef.current = null; setActive(null); setVersions([]); }
      }
      if (conflict.current !== "none") { conflict.current = "reselect"; setConflictStep("reselect"); setNotice("已刷新服务器版本。请重新选择本地文件，并核对上传目标后再提交。"); }
      else setNotice("文件列表已刷新。选择本地文件不会自动上传。");
    } catch (failure) { if (current(task)) { if (!(failure instanceof FileServiceError && failure.status === 503) && !isScopeError(failure)) { available.current = false; setConnection("error"); } showFailure(failure, "无法连接文件库；本地选择未清空。"); } }
    finally { finish(task); }
  }, [acceptLibrary, begin, current, finish, scopeHeaders, showFailure]);

  const loadRecoveries = useCallback(async () => {
    if (!scope.current || scopeBlocked.current || identityTransition.current) return;
    recoveryListController.current?.abort();
    const controller = new AbortController(), expectedScope = scope.current, expectedEpoch = recoveryEpoch.current;
    recoveryListController.current = controller;
    const currentRecovery = () => alive.current && !controller.signal.aborted && !scopeBlocked.current && !identityTransition.current && scope.current === expectedScope && recoveryEpoch.current === expectedEpoch;
    try {
      const response = await fetch("/api/drafts/native/recoveries", { credentials: "same-origin", cache: "no-store", headers: { "x-editor-scope": expectedScope }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (!response.ok) throw await responseError(response);
      const list = readRecoveries(await response.json());
      if (!currentRecovery()) return;
      setRecoveries(list); setRecoveryClock(Date.now()); setRecoveryStatus("ready");
    } catch { if (currentRecovery()) setRecoveryStatus("error"); }
    finally { if (recoveryListController.current === controller) recoveryListController.current = null; }
  }, []);

  useEffect(() => {
    let cancelled = false; alive.current = true;
    Promise.resolve().then(() => { if (!cancelled) void loadLibrary(); });
    const urls = blobUrls.current;
    return () => { cancelled = true; alive.current = false; operation.current?.controller.abort(); operation.current = null; recoveryListController.current?.abort(); recoveryDownloadController.current?.abort(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, [loadLibrary]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pickedRef.current || operation.current?.kind === "upload") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    const freeze = () => {
      identityTransition.current = true; scopeBlocked.current = true; available.current = false;
      epoch.current += 1; operation.current?.controller.abort(); operation.current = null;
      recoveryEpoch.current += 1; recoveryListController.current?.abort(); recoveryDownloadController.current?.abort();
      setIdentityFrozen(true); setBusy(null); setConnection("scope-blocked");
      setRecoveryBusy(null);
      setError("身份恢复已启动，当前文件选择保留，所有文件请求已暂停。请先处理未保存内容，再手动刷新页面；不会自动切换文件归属。");
    };
    window.addEventListener(EDITOR_RECOVERY_EVENT, freeze);
    return () => window.removeEventListener(EDITOR_RECOVERY_EVENT, freeze);
  }, []);
  useEffect(() => {
    if (connection !== "ready" || identityFrozen || !scope.current) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/drafts/native/status", { credentials: "same-origin", cache: "no-store", headers: scopeHeaders(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw await responseError(response);
        const result = await response.json() as { configured?: unknown };
        if (controller.signal.aborted || !alive.current) return;
        setNativeConfigured(result?.configured === true);
        setNativeStatus(result?.configured === true ? "ready" : "not-configured");
      } catch {
        if (controller.signal.aborted || !alive.current) return;
        setNativeConfigured(false); setNativeStatus("error");
      }
    })();
    return () => controller.abort();
  }, [connection, identityFrozen, scopeHeaders]);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled && connection === "ready" && !identityFrozen) void loadRecoveries(); });
    return () => { cancelled = true; };
  }, [connection, identityFrozen, loadRecoveries]);
  useEffect(() => {
    if (!recoveries.length) return;
    const timer = window.setInterval(() => setRecoveryClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [recoveries.length]);

  function chooseFile(file: File | undefined) {
    if (!file || operation.current || scopeBlocked.current || conflict.current === "refresh") return;
    try { parseOfficeFilename(file.name); } catch (failure) { setError(failure instanceof Error ? failure.message : "文件名或格式无效，原有选择未改变。"); return; }
    if (file.size <= 0 || file.size > limitsRef.current.bytes) { setError(`请选择非空 DOCX / PPTX 文件，单个不超过 ${sizeLabel(limitsRef.current.bytes)}。原有选择未改变。`); return; }
    if (modeRef.current === "version" && activeRef.current && !file.name.toLowerCase().endsWith(`.${activeRef.current.kind}`)) { setError("新版本必须与所选文件保持同一格式；DOCX 和 PPTX 请分别建立文件。"); return; }
    pickedRef.current = file; setPicked(file); setError(""); setNotice("已选择本地文件，尚未上传。请核对目标与版本备注。");
    if (conflict.current === "reselect") { conflict.current = "none"; setConflictStep("none"); }
  }
  function switchMode(next: "new" | "version") {
    if (operation.current || scopeBlocked.current || (next === "version" && !activeRef.current)) return;
    modeRef.current = next; setMode(next); pickedRef.current = null; setPicked(null); pending.current = null;
    if (input.current) input.current.value = "";
    setNotice("上传目标已切换，请重新选择本地文件。"); setError("");
  }
  async function openFile(id: string) {
    if (scopeBlocked.current || !scope.current) return;
    const task = begin("open"); if (!task) return;
    try {
      const result = await jsonRequest(`/api/drafts/files/${id}`, task.controller.signal, { headers: scopeHeaders() });
      if (!current(task)) return;
      const detail = readDetail(result.value, id); activeRef.current = detail.file; setActive(detail.file); setVersions(detail.versions);
      if (modeRef.current === "version") { pickedRef.current = null; setPicked(null); pending.current = null; setNotice("版本目标已更新，请重新选择要上传的本地文件。"); }
    } catch (failure) { if (current(task)) showFailure(failure, "无法读取版本列表。"); }
    finally { finish(task); }
  }
  async function upload() {
    const file = pickedRef.current, selected = modeRef.current === "version" ? activeRef.current : null;
    if (!file || !available.current || !scope.current || scopeBlocked.current || conflict.current !== "none" || (modeRef.current === "version" && !selected)) return;
    const task = begin("upload"); if (!task) return;
    const scopeSnapshot = scope.current;
    try {
      const labelSnapshot = parseOfficeLabel(label), expectedKind = parseOfficeFilename(file.name).kind;
      if (file.size > limitsRef.current.bytes || !/\.(docx|pptx)$/i.test(file.name)) throw new FileServiceError("文件超出当前格式或大小限制。");
      // IDs are bound to exact bytes and metadata, not name/mtime heuristics.
      const hash = await digest(await file.arrayBuffer());
      if (!current(task) || file !== pickedRef.current) return;
      // A list refresh may show an already-committed ambiguous attempt. Retain its
      // original base revision and UUIDs until success or an explicit conflict.
      const key = JSON.stringify({ scope: scopeSnapshot, target: selected?.id || null, name: file.name, sha256: hash, label: labelSnapshot });
      if (pending.current?.key !== key) pending.current = { key, fileId: selected?.id || crypto.randomUUID(), versionId: crypto.randomUUID(), target: selected?.id || null, baseRevision: selected?.revision || null };
      const attempt = pending.current;
      // Reconfirm availability and ownership immediately before the explicit write.
      const check = await jsonRequest("/api/drafts/files", task.controller.signal, { headers: scopeHeaders() });
      if (!current(task)) return;
      const library = readLibrary(check.value); acceptLibrary(library);
      if (scope.current !== scopeSnapshot) throw new FileServiceError("上传前身份发生变化。", 409, "editor_scope_changed");
      if (!selected && library.files.length >= limitsRef.current.files && !library.files.some(f => f.id === attempt.fileId)) throw new FileServiceError("文件数量已达上限；本地文件未上传。请先核对现有文件。");
      const headers: Record<string, string> = { "Content-Type": "application/octet-stream", "x-editor-scope": scopeSnapshot, "x-office-version-id": attempt.versionId, "x-office-name": encodeURIComponent(file.name), "x-office-label": encodeURIComponent(labelSnapshot) };
      if (attempt.target) headers["x-office-base-revision"] = String(attempt.baseRevision);
      else headers["x-office-file-id"] = attempt.fileId;
      const result = await jsonRequest(attempt.target ? `/api/drafts/files/${attempt.target}` : "/api/drafts/files", task.controller.signal, { method: "POST", headers, body: file });
      if (!current(task)) return;
      const saved = result.value as { file: OfficeFile; version: OfficeVersion };
      if (result.status !== 201 || !isFile(saved?.file) || saved.file.id !== attempt.fileId || saved.file.kind !== expectedKind || !saved.version || saved.version.id !== attempt.versionId || saved.version.fileId !== attempt.fileId || saved.version.kind !== expectedKind || saved.version.sha256 !== hash || saved.version.size !== file.size || saved.version.filename !== file.name || saved.version.label !== labelSnapshot || saved.version.revision !== (attempt.baseRevision ?? 0) + 1) throw new FileServiceError("没有收到与本次文件完全匹配的保存确认。结果不确定，请保留相同文件与备注重试；不会重新生成重试编号。");
      activeRef.current = saved.file; setActive(saved.file); setFiles(list => [saved.file, ...list.filter(f => f.id !== saved.file.id)]);
      setVersions(list => [saved.version, ...list.filter(v => v.fileId === saved.file.id && v.id !== saved.version.id)]);
      pickedRef.current = null; setPicked(null); pending.current = null; setLabel("");
      setNotice(`服务器已确认保存：${saved.version.filename} · v${saved.version.revision}。已校验上传文件字节。`);
    } catch (failure) {
      if (current(task)) {
        if (failure instanceof FileServiceError && failure.status === 409 && !isScopeError(failure)) { conflict.current = "refresh"; setConflictStep("refresh"); pending.current = null; setError("版本或重试状态发生冲突，未覆盖已有版本。请先刷新，再重新选择本地文件并核对目标版本。"); }
        else showFailure(failure, "上传未确认，本地文件仍保留。可以使用相同文件与备注重试。");
      }
    } finally { finish(task); }
  }
  async function download(version: OfficeVersion) {
    if (scopeBlocked.current || !scope.current) return;
    const task = begin("download"); if (!task) return;
    try {
      const response = await fetch(`/api/drafts/files/${version.fileId}/versions/${version.id}`, { credentials: "same-origin", cache: "no-store", headers: scopeHeaders(), signal: AbortSignal.any([task.controller.signal, AbortSignal.timeout(60_000)]) });
      if (!response.ok) throw await responseError(response);
      if (/json|text\/html/i.test(response.headers.get("Content-Type") || "")) throw new FileServiceError("服务返回了提示信息而非 Office 文件，未生成下载。");
      const blob = await response.blob();
      if (blob.size !== version.size || blob.size > MAX_BYTES || await digest(await blob.arrayBuffer()) !== version.sha256) throw new FileServiceError("下载内容的大小或 SHA-256 与版本记录不符，已阻止保存，请刷新后重试。");
      if (!current(task)) return;
      const url = URL.createObjectURL(blob); blobUrls.current.add(url);
      const link = document.createElement("a"); link.href = url; link.download = version.filename; link.click();
      setTimeout(() => { URL.revokeObjectURL(url); blobUrls.current.delete(url); }, 60_000);
      setNotice(`v${version.revision} 文件校验通过，已交给浏览器下载。请在下载列表确认；未转换文件格式。`);
    } catch (failure) { if (current(task)) showFailure(failure, "下载失败，没有生成文件。"); }
    finally { finish(task); }
  }
  async function downloadRecoveryItem(item: RecoveryItem) {
    if (scopeBlocked.current || !scope.current || recoveryBusy || recoveryDownloadController.current) return;
    if (recoveryExpiredNow(item.expiresAt)) { setError("冲突副本已到期，不能再下载；请刷新列表核对正式文件版本。"); return; }
    const controller = new AbortController(), expectedScope = scope.current, expectedEpoch = recoveryEpoch.current;
    recoveryDownloadController.current = controller;
    const currentRecovery = () => alive.current && !controller.signal.aborted && !scopeBlocked.current && !identityTransition.current && scope.current === expectedScope && recoveryEpoch.current === expectedEpoch;
    setRecoveryBusy(item.key); setError("");
    try {
      const response = await fetch(item.recoveryUrl, { credentials: "same-origin", cache: "no-store", headers: { "x-editor-scope": expectedScope }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]) });
      if (!response.ok) throw await responseError(response);
      if (/json|text\/html/i.test(response.headers.get("content-type") || "")) throw new FileServiceError("恢复接口没有返回 Office 文件。");
      const blob = await response.blob();
      if (blob.size !== item.size || blob.size > MAX_BYTES || await digest(await blob.arrayBuffer()) !== item.sha256) throw new FileServiceError("冲突副本校验失败，未生成下载。请重试或联系管理员。");
      if (!currentRecovery()) return;
      const url = URL.createObjectURL(blob); blobUrls.current.add(url);
      const link = document.createElement("a"); link.href = url;
      link.download = `${item.filename.replace(/\.(docx|pptx)$/i, "").slice(0, 96)}-冲突编辑副本-${item.key.slice(3, 11)}.${item.kind}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => { URL.revokeObjectURL(url); blobUrls.current.delete(url); }, 60_000);
      setNotice("冲突编辑副本已校验并交给浏览器下载。请在下载列表确认并打开核对；它尚未合并入原文件。");
    } catch (failure) { if (currentRecovery()) showFailure(failure, "冲突副本下载失败，服务器记录未改变。"); }
    finally { if (recoveryDownloadController.current === controller) recoveryDownloadController.current = null; if (alive.current && recoveryEpoch.current === expectedEpoch) setRecoveryBusy(null); }
  }
  function reconnectIdentity() {
    if (identityTransition.current || operation.current || !window.confirm("清空本页的文件选择，并重新连接当前身份？不会删除本地原件或已保存版本。请勿将未确认归属的材料上传到新身份。")) return;
    recoveryEpoch.current += 1; recoveryListController.current?.abort(); recoveryDownloadController.current?.abort();
    scope.current = ""; scopeBlocked.current = false; available.current = false; pending.current = null; activeRef.current = null; pickedRef.current = null; conflict.current = "none"; modeRef.current = "new";
    setFiles([]); setActive(null); setVersions([]); setRecoveries([]); setRecoveryStatus("loading"); setRecoveryBusy(null); setPicked(null); setMode("new"); setLabel(""); setConflictStep("none"); setStorage(null); setConnection("loading");
    void loadLibrary();
  }

  const unavailable = connection !== "ready", blocked = connection === "scope-blocked";
  const canUpload = !!picked && !!label.trim() && !busy && !unavailable && !blocked && conflictStep === "none" && (mode === "new" || !!active);
  const fileMotion=useKeyedListMotion<HTMLUListElement>({ids:files.map(file=>file.id),activeId:active?.id??null});
  const versionMotion=useKeyedListMotion<HTMLOListElement>({ids:[...versions].sort((a,b)=>b.revision-a.revision).map(version=>version.id)});
  return <section className={styles.library} aria-label="Office 原文件库">
    <header className={styles.heading}><div><span className={styles.kicker}>ORIGINAL FILES · VERSIONED</span><h2>原文件，按版本保留。</h2><p>独立保存完整 DOCX 与 PPTX，与文本草稿分开管理。</p></div><span className={styles.storage} data-ready={connection === "ready"}>{connection === "loading" ? "正在连接存储" : connection === "ready" ? storage === "local-r2" ? "本地开发存储" : "对象存储已连接" : "存储连接待恢复"}</span></header>
    <div className={styles.engineNote} data-configured={nativeConfigured}><strong>{nativeStatus === "ready" ? "ONLYOFFICE 接口已配置" : "浏览器全文编辑引擎尚未连接"}</strong><p>{nativeStatus === "ready" ? "选择 DOCX 或 PPTX 开始编辑。文档服务需运行；关闭编辑器后，服务器确认保存回调才会生成新版本。" : nativeStatus === "checking" ? "正在检查 ONLYOFFICE 接入状态；原文件上传和下载不受影响。" : "可先上传、下载和保存版本。浏览器内编辑需部署并配置 ONLYOFFICE。"}</p></div>
    {storage === "local-r2" && <p className={styles.localNote}>当前为本地开发存储。请提前在上方“身份与恢复”保存恢复密钥，才能在 Cookie 丢失后恢复同一草稿与文件库。密钥不是文件备份；请同时保留本地原件和下载备份。未提前设置密钥且会话丢失时，无法凭文件名找回身份。</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p>{blocked && !identityFrozen && <button type="button" disabled={!!busy} onClick={reconnectIdentity}>清空选择并连接当前身份</button>}</div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.workspace}>
      <div className={styles.catalog} aria-busy={busy === "refresh" || busy === "open"}>
        <div className={styles.paneHeading}><div><h3>文件</h3><span>{files.length} / {limits.files} 个</span></div><button type="button" disabled={!!busy || blocked} onClick={() => void loadLibrary()}>{busy === "refresh" ? "刷新中…" : "刷新列表"}</button></div>
        {files.length ? <ul ref={fileMotion} className={styles.fileList}><li role="presentation" className={styles.motionMarker} data-motion-marker aria-hidden="true"/>{files.map(file => <li key={file.id} data-motion-id={file.id}><button type="button" className={styles.fileButton} aria-pressed={active?.id === file.id} disabled={!!busy || blocked} onClick={() => void openFile(file.id)}><span className={styles.format}>{file.kind.toUpperCase()}</span><span className={styles.fileInfo}><strong>{file.filename}</strong><small>v{file.revision} · {sizeLabel(file.size)} · {timeLabel(file.updatedAt)}</small></span><span aria-hidden="true" className={styles.arrow}>↗</span></button></li>)}</ul> : <div className={styles.empty}><span>01 / FILES</span><h4>{unavailable ? "文件库尚未就绪" : "还没有原生文件"}</h4><p>{unavailable ? "可先选择本地文件；待存储恢复后再主动上传。连接失败不会清空选择。" : "上传一份 DOCX 或 PPTX，保留完整排版、图表与文件内容。"}</p></div>}
        <p className={styles.catalogNote}>列表按当前身份隔离。此处不提供删除、覆盖或自动导入。</p>
      </div>
      <div className={styles.versionPane} aria-busy={busy === "open" || busy === "download"}>
        <div className={styles.paneHeading}><div><h3>不可变版本</h3><span>{active ? `${versions.length} / ${limits.versions} 个` : "选择左侧文件查看"}</span></div>{active && <span className={styles.format}>{active.kind.toUpperCase()}</span>}</div>
        {active ? <><div className={styles.activeFile}><strong>{active.filename}</strong><span>当前记录 v{active.revision} · {sizeLabel(active.size)}</span><div className={styles.nativeAction}><button type="button" className={styles.primary} disabled={!!busy || blocked || !nativeConfigured || identityFrozen} onClick={() => setNativeEditing({ file: active, scope: scope.current })}>{nativeConfigured ? `使用 ONLYOFFICE 编辑 ${active.kind.toUpperCase()}` : "ONLYOFFICE 尚未连接"}</button><small>仅当前版本可编辑；完成后服务器新增版本，不覆盖旧稿。</small></div><details><summary>查看当前 SHA-256</summary><code>{active.sha256}</code></details></div><ol ref={versionMotion} className={styles.versionList}>{[...versions].sort((a,b) => b.revision - a.revision).map(version => <li key={version.id} data-motion-id={version.id}><span className={styles.versionNumber}>v{version.revision}</span><div><strong>{version.label || "未填写版本备注"}</strong><span>{version.filename}</span><small>{timeLabel(version.createdAt)} · {sizeLabel(version.size)}</small><details><summary>SHA-256</summary><code>{version.sha256}</code></details></div><button type="button" disabled={!!busy || blocked} onClick={() => void download(version)} aria-label={`下载版本 ${version.revision}：${version.filename}`}>{busy === "download" ? "处理中…" : "下载原文件"}</button></li>)}</ol>{!versions.length && <p className={styles.muted}>点击刷新列表，载入历史版本。</p>}</> : <div className={styles.empty}><span>02 / VERSIONS</span><h4>每次提交，都保留一个版本</h4><p>下载原始文件字节，并校验版本 SHA-256。新版本需要你主动选择文件和确认上传。</p></div>}
      </div>
    </div>
    <div className={styles.uploadPanel}>
      <div className={styles.uploadIntro}><span className={styles.kicker}>ADD A VERSION</span><h3>选择文件，再确认提交</h3><p>支持 DOCX / PPTX，单个上限 {sizeLabel(limits.bytes)}。</p></div>
      <div className={styles.uploadControls}>
        <fieldset className={styles.mode}><legend>上传目标</legend><label><input type="radio" name={`${inputId}-mode`} checked={mode === "new"} disabled={!!busy || blocked} onChange={() => switchMode("new")}/>建立独立文件</label><label><input type="radio" name={`${inputId}-mode`} checked={mode === "version"} disabled={!!busy || blocked || !active} onChange={() => switchMode("version")}/>所选文件的新版本</label></fieldset>
        <p className={styles.target}>{mode === "new" ? "将创建一个独立文件及首个版本。" : active ? `目标：${active.filename} · 基于 v${active.revision}，已有版本不会覆盖。` : "请先在文件列表选择版本目标。"}</p>
        <label className={styles.fileInput} htmlFor={inputId}>选择 DOCX / PPTX<input ref={input} id={inputId} type="file" accept=".docx,.pptx" disabled={!!busy || blocked || conflictStep === "refresh"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; chooseFile(file); }}/></label>
        {picked && <div className={styles.selection}><div><strong>{picked.name}</strong><span>{sizeLabel(picked.size)} · 仅已选择，尚未确认保存</span></div><button type="button" disabled={!!busy} onClick={() => { pickedRef.current = null; setPicked(null); setNotice("已取消本页选择，本地原件未改变。"); }}>取消选择</button></div>}
        <label className={styles.labelField}>版本备注<span>必填，1–80 字</span><input value={label} required maxLength={80} disabled={!!busy || blocked} onChange={event => setLabel(event.target.value)} placeholder="例如：补充样本说明，提交前复核版"/></label>
        {conflictStep !== "none" && <p className={styles.conflict}>{conflictStep === "refresh" ? "先点击“刷新列表”，再重新选择文件。不会自动把本次提交套用到其他版本。" : "服务器版本已刷新。请重新选择文件，以确认使用当前目标版本。"}</p>}
        <div className={styles.submitRow}><button type="button" className={styles.primary} disabled={!canUpload} onClick={() => void upload()}>{busy === "upload" ? "正在校验并上传…" : mode === "new" ? "确认上传为新文件" : "确认上传新版本"}</button><span>{unavailable ? "存储未就绪，已选文件仍保留。" : "只有服务器返回保存确认，才会显示已保存。"}</span></div>
      </div>
    </div>
    <section className={styles.recoverySection} aria-label="原生编辑冲突副本">
      <div className={styles.paneHeading}><div><h3>冲突编辑副本</h3><span>未合并入正式文件；请及时下载核对</span></div><button type="button" disabled={blocked || recoveryStatus === "loading"} onClick={() => { setRecoveryStatus("loading"); void loadRecoveries(); }}>刷新副本</button></div>
      {recoveryStatus === "loading" && <p>正在核对当前身份的冲突副本…</p>}
      {recoveryStatus === "error" && <p role="alert">暂时无法核对冲突副本列表。已有文件版本仍可下载；请稍后重试，勿将未确认的编辑当作已保存。</p>}
      {recoveryStatus === "ready" && !recoveries.length && <p>当前身份没有仍在有效期内的冲突编辑副本。</p>}
      {recoveryStatus === "ready" && recoveries.length > 0 && <ul>{recoveries.map(item => { const deadline = recoveryDeadline(item.expiresAt, recoveryClock); return <li key={item.key} data-urgent={deadline.urgent}><div><strong>{item.filename}</strong><small>{item.kind.toUpperCase()} · {sizeLabel(item.size)} · {deadline.text}</small></div><button type="button" disabled={blocked || recoveryBusy !== null || deadline.expired} onClick={() => void downloadRecoveryItem(item)}>{recoveryBusy === item.key ? "校验中…" : "下载冲突副本"}</button></li>; })}</ul>}
    </section>
    {nativeEditing && <OnlyOfficeEditor file={nativeEditing.file} scope={nativeEditing.scope} frozen={identityFrozen || blocked} onClose={() => { setNativeEditing(null); void loadRecoveries(); }} onSaved={() => { void loadLibrary(); }}/>} 
  </section>;
}
