"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EDITOR_RECOVERY_EVENT } from "@/lib/editor-recovery";
import styles from "./OnlyOfficeEditor.module.css";
import { useContentReveal } from '../motion/useWorkspaceMotion';

type OfficeFile = { id: string; filename: string; kind: "docx" | "pptx"; revision: number };
type NativeSession = { key: string; fileId: string; revision: number };
type NativeLaunch = { shellUrl: string; scriptUrl: string; config: Record<string, unknown>; session: NativeSession };
type NativeRecovery = { available: true; sha256: string; size: number; expiresAt: string | null };
type NativeStatus = { state: "open" | "saving" | "closing" | "saved" | "closed" | "conflict" | "error"; savedRevision?: number; recovery?: NativeRecovery };
type Phase = "opening" | "loading" | "editing" | "waiting" | "saved" | "closed" | "conflict" | "error" | "unconfirmed" | "frozen";
type Props = { file: OfficeFile; scope: string; frozen: boolean; onClose(): void; onSaved(): void };

const CHANNEL = "evix-onlyoffice-editor-v1";
const SESSION_KEY = /^ne_[A-Za-z0-9_-]{43}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_BYTES = 20 * 1024 * 1024;

function errorMessage(value: unknown, fallback: string) {
  if (value instanceof Error && value.message) return value.message;
  return fallback;
}

function validRecovery(value: NativeStatus["recovery"]): value is NativeRecovery {
  return !!value && value.available === true && SHA256.test(value.sha256) && Number.isInteger(value.size) && value.size > 0 && value.size <= MAX_BYTES &&
    (value.expiresAt === null || (typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))));
}

async function responseError(response: Response) {
  let message = `编辑服务返回 ${response.status}，没有开始写入原文件。`;
  try {
    const body = await response.json() as { error?: { message?: unknown } };
    if (typeof body?.error?.message === "string") message = body.error.message;
  } catch { /* A proxy may return HTML. Never treat it as a success. */ }
  return new Error(message);
}

function parseLaunch(value: unknown, file: OfficeFile): NativeLaunch {
  if (!value || typeof value !== "object") throw new Error("编辑服务未返回有效会话。");
  const result = value as Partial<NativeLaunch>;
  const session = result.session;
  const config = result.config;
  if (!session || session.fileId !== file.id || session.revision !== file.revision || !SESSION_KEY.test(session.key) || !config || typeof config !== "object") throw new Error("编辑会话与所选文件或版本不一致，已停止打开。");
  const documentConfig = (config as { document?: unknown }).document;
  if (!documentConfig || typeof documentConfig !== "object" || (documentConfig as { key?: unknown }).key !== session.key || (documentConfig as { fileType?: unknown }).fileType !== file.kind || typeof (config as { token?: unknown }).token !== "string") throw new Error("ONLYOFFICE 签名配置不完整，已停止打开。");
  if (typeof result.scriptUrl !== "string" || typeof result.shellUrl !== "string") throw new Error("文档引擎或隔离页面地址未配置。");
  const script = new URL(result.scriptUrl);
  const shell = new URL(result.shellUrl);
  if (!["http:", "https:"].includes(script.protocol) || script.username || script.password || script.search || script.hash || script.pathname !== "/web-apps/apps/api/documents/api.js") throw new Error("文档引擎地址不符合预期，已停止加载。");
  if (!["http:", "https:"].includes(shell.protocol) || shell.username || shell.password || shell.search || shell.hash || shell.pathname !== "/" ||
      new Set([shell.hostname, script.hostname, window.location.hostname]).size !== 3) throw new Error("ONLYOFFICE 的应用、隔离编辑页和文档服务必须使用三个不同主机名，不能只换端口。");
  return { shellUrl: shell.href, scriptUrl: script.href, config, session };
}

export default function OnlyOfficeEditor({ file, scope, frozen, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("opening");
  const [launch, setLaunch] = useState<NativeLaunch | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<NativeRecovery | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [recoveryClock, setRecoveryClock] = useState(() => Date.now());
  const [iframeVisible, setIframeVisible] = useState(true);
  const [pollAttempt, setPollAttempt] = useState(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const openController = useRef<AbortController | null>(null);
  const recoveryController = useRef<AbortController | null>(null);
  const identityFrozenRef = useRef(frozen);
  const alive = useRef(false);
  const phaseRef = useRef<Phase>("opening");
  const nonce = useRef(crypto.randomUUID());
  const view = (next: Phase) => { phaseRef.current = next; setPhase(next); };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; recoveryController.current?.abort(); };
  }, []);

  useEffect(() => {
    identityFrozenRef.current = frozen;
    if (frozen) recoveryController.current?.abort();
  }, [frozen]);
  useEffect(() => {
    const freeze = () => { identityFrozenRef.current = true; recoveryController.current?.abort(); };
    window.addEventListener(EDITOR_RECOVERY_EVENT, freeze);
    return () => window.removeEventListener(EDITOR_RECOVERY_EVENT, freeze);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop.current);
    const previousInert = siblings.map(element => [element, element.inert] as const);
    siblings.forEach(element => { element.inert = true; });
    closeButton.current?.focus();
    return () => { previousInert.forEach(([element, inert]) => { element.inert = inert; }); previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    if (frozen) return;
    const controller = new AbortController();
    openController.current = controller;
    void (async () => {
      try {
        const response = await fetch("/api/drafts/native/sessions", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json", "x-editor-scope": scope, "x-native-editor-intent": "open" },
          body: JSON.stringify({ fileId: file.id, revision: file.revision }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.ok) throw await responseError(response);
        const result = parseLaunch(await response.json(), file);
        if (controller.signal.aborted || !alive.current || identityFrozenRef.current) return;
        setLaunch(result); view("loading");
      } catch (failure) {
        if (controller.signal.aborted || !alive.current || identityFrozenRef.current) return;
        setError(errorMessage(failure, "无法建立编辑会话。")); view("error");
      }
    })();
    return () => { controller.abort(); if (openController.current === controller) openController.current = null; };
  }, [file, scope, frozen]);

  useEffect(() => {
    if (!launch) return;
    const accept = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.origin !== new URL(launch.shellUrl).origin) return;
      const value = event.data as { channel?: unknown; nonce?: unknown; type?: unknown; message?: unknown };
      if (!value || value.channel !== CHANNEL || value.nonce !== nonce.current || typeof value.type !== "string") return;
      if (value.type === "document-ready" && ["loading", "editing", "unconfirmed"].includes(phaseRef.current) && iframe.current) { setError(""); view("editing"); }
      // ONLYOFFICE's false state only means changes reached its editing
      // service, not that our immutable file version was committed.
      if (value.type === "dirty" && value.message === "yes") { dirtyRef.current = true; setDirty(true); }
      if (value.type === "request-close") requestClose();
      if (value.type === "error" && !["waiting", "saved", "closed", "frozen"].includes(phaseRef.current)) {
        setError(typeof value.message === "string" ? value.message : "文档编辑器发生错误。");
        // A ready editor may still contain changes. An error notification alone
        // is never authority to unload the only live editing frame.
        if (["opening", "loading"].includes(phaseRef.current) && !dirtyRef.current) { setIframeVisible(false); view("error"); }
      }
    };
    window.addEventListener("message", accept);
    return () => window.removeEventListener("message", accept);
    // requestClose intentionally reads the latest dirty/phase via state refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch, dirty]);

  useEffect(() => {
    if (!launch || phase !== "loading") return;
    // A failed shell navigation or blocked Docs script need not emit an iframe
    // error. Bound startup without discarding a frame that reported changes.
    const timer = window.setTimeout(() => {
      if (!alive.current || phaseRef.current !== "loading") return;
      if (dirtyRef.current) {
        setError("ONLYOFFICE 未报告文档就绪，但已有改动信号。当前界面将保留；请核对并谨慎关闭，不能视为已保存。");
        view("unconfirmed");
        return;
      }
      setError("ONLYOFFICE 在 90 秒内未报告文档就绪。可能是编辑页、文档服务或浏览器安全策略未连通；未生成新版本。");
      setIframeVisible(false);
      view("error");
    }, 90_000);
    return () => window.clearTimeout(timer);
  }, [launch, phase]);
  useEffect(() => {
    if (!recovery || phase !== "conflict") return;
    const timer = window.setInterval(() => setRecoveryClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [recovery, phase]);

  const statusUrl = launch ? `/api/drafts/native/sessions/${encodeURIComponent(launch.session.key)}/status` : "";
  const checkStatus = useCallback(async (signal: AbortSignal): Promise<NativeStatus> => {
    const response = await fetch(statusUrl, { credentials: "same-origin", cache: "no-store", headers: { "x-editor-scope": scope }, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw await responseError(response);
    const value = await response.json() as NativeStatus;
    if (!["open", "saving", "closing", "saved", "closed", "conflict", "error"].includes(value?.state)) throw new Error("保存状态返回异常，不能视为已提交。");
    return value;
  }, [scope, statusUrl]);

  useEffect(() => {
    if (phase !== "waiting" || !launch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void checkStatus(controller.signal).then(value => {
        if (!alive.current || controller.signal.aborted) return;
        if (value.state === "saved") {
          if (!Number.isInteger(value.savedRevision) || value.savedRevision !== file.revision + 1) { setError("保存确认的版本号与本次编辑基准不一致，不能视为已保存。"); view("unconfirmed"); return; }
          dirtyRef.current = false; setSavedRevision(value.savedRevision); view("saved");
        }
        else if (value.state === "closed") {
          if (dirtyRef.current) { setError("编辑器报告曾有改动，但服务端报告无修改关闭；未生成新版本，请下载核对原文件。"); view("unconfirmed"); }
          else view("closed");
        }
        else if (value.state === "conflict") {
          if (!validRecovery(value.recovery)) { setError("版本发生冲突，但服务器没有确认可下载的编辑副本。不能视为已保存，请勿丢弃其他备份并联系管理员。"); view("unconfirmed"); return; }
          setRecovery(value.recovery);
          setError("版本发生冲突，编辑内容没有写入原文件当前版本。请先下载服务器保留的冲突副本，再决定如何合并。");
          view("conflict");
        }
        else if (value.state === "error") { setError("ONLYOFFICE 的保存回调未能提交新版本。原有版本未覆盖；请保留本地备份并核查文件库。"); view("error"); }
        else if (pollAttempt >= 19) view("unconfirmed");
        else setPollAttempt(n => n + 1);
      }).catch(failure => {
        if (!alive.current || controller.signal.aborted) return;
        setError(errorMessage(failure, "尚未收到服务器保存确认。")); view("unconfirmed");
      });
    }, pollAttempt === 0 ? 1200 : 1800);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [phase, launch, pollAttempt, checkStatus, file.revision]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && !["saved", "closed"].includes(phaseRef.current)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function requestClose() {
    if (phaseRef.current === "waiting") return;
    if (["saved", "closed", "conflict", "unconfirmed", "error"].includes(phaseRef.current) && !iframeVisible) {
      if (phaseRef.current === "conflict" && recovery && !recoveryDownloaded && !window.confirm("尚未下载本次编辑的冲突副本。离开后可能难以找回，请先下载并核对文件。仍要离开吗？")) return;
      if (phaseRef.current === "saved") onSaved(); onClose(); return;
    }
    if (dirtyRef.current && !window.confirm("ONLYOFFICE 中可能还有未提交的改动。关闭后将等待文档服务回调；只有出现新版本确认才算保存。仍要关闭编辑器吗？")) return;
    if (launch) iframe.current?.contentWindow?.postMessage({ channel: CHANNEL, nonce: nonce.current, type: "destroy" }, new URL(launch.shellUrl).origin);
    if (!launch) openController.current?.abort();
    setIframeVisible(false); setPollAttempt(0); view(launch ? "waiting" : "closed");
  }

  async function downloadRecovery() {
    if (!launch || !recovery || recoveryBusy || recoveryController.current || identityFrozenRef.current) return;
    if (recovery.expiresAt && Date.parse(recovery.expiresAt) <= Date.now()) { setError("冲突副本已到期，不能再下载；请刷新文件库核对正式版本。"); return; }
    const controller = new AbortController(); recoveryController.current = controller; setRecoveryBusy(true);
    try {
      const response = await fetch(`/api/drafts/native/sessions/${encodeURIComponent(launch.session.key)}/recovery`, {
        credentials: "same-origin", cache: "no-store", headers: { "x-editor-scope": scope },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
      });
      if (!response.ok) throw await responseError(response);
      if (/json|text\/html/i.test(response.headers.get("content-type") || "")) throw new Error("恢复接口没有返回 Office 文件。");
      const blob = await response.blob();
      if (blob.size !== recovery.size || blob.size > MAX_BYTES) throw new Error("冲突副本大小与服务器记录不一致，未下载。");
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (sha256 !== recovery.sha256) throw new Error("冲突副本校验失败，未下载。请重试或联系管理员。");
      if (controller.signal.aborted || !alive.current || identityFrozenRef.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url;
      link.download = `${file.filename.replace(/\.(docx|pptx)$/i, "").slice(0, 96)}-冲突编辑副本-${launch.session.key.slice(3, 11)}.${file.kind}`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setRecoveryDownloaded(true); setError("冲突副本已校验并交给浏览器下载。请在下载列表确认、打开核对内容；它尚未合并入原文件。");
    } catch (failure) {
      if (!controller.signal.aborted && alive.current && !identityFrozenRef.current) setError(errorMessage(failure, "冲突副本下载失败。请勿离开本页。"));
    } finally { if (recoveryController.current === controller) recoveryController.current = null; if (alive.current) setRecoveryBusy(false); }
  }

  function keepFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); requestClose(); return; }
    if (event.key !== "Tab") return;
    const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),iframe,[href],[tabindex]:not([tabindex='-1'])") ?? [])].filter(node => node.getClientRects().length > 0);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function initFrame(event: React.SyntheticEvent<HTMLIFrameElement>) {
    if (!launch || !iframeVisible) return;
    event.currentTarget.contentWindow?.postMessage({ channel: CHANNEL, nonce: nonce.current, type: "init", scriptUrl: launch.scriptUrl, config: launch.config }, new URL(launch.shellUrl).origin);
  }
  const effectivePhase = frozen && !launch ? "frozen" : phase;
  const recoveryRemaining = recovery?.expiresAt ? Date.parse(recovery.expiresAt) - recoveryClock : null;
  const busy = ["opening", "loading", "waiting"].includes(effectivePhase);
  const statusReveal = useContentReveal<HTMLElement>({ token: `${effectivePhase}:${savedRevision ?? ''}` });
  const statusText = effectivePhase === "opening" ? "正在建立受限编辑会话" : effectivePhase === "loading" ? "正在载入 ONLYOFFICE 文档引擎" : effectivePhase === "editing" ? "正在编辑 · 尚未提交新版本" : effectivePhase === "waiting" ? "正在等待关闭后的保存回调" : effectivePhase === "saved" ? `服务器已确认新版本${savedRevision ? ` v${savedRevision}` : ""}` : effectivePhase === "closed" ? "已关闭 · 文档无修改" : effectivePhase === "frozen" ? "身份正在恢复 · 编辑请求已暂停" : effectivePhase === "unconfirmed" ? "保存仍未确认" : "编辑或保存遇到问题";

  if (typeof document === "undefined") return null;
  return createPortal(<div ref={backdrop} className={styles.backdrop} role="presentation">
    <section ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-label={`编辑 ${file.filename}`} onKeyDown={keepFocus}>
      <header className={styles.header}>
        <div className={styles.title}><span className={styles.eyebrow}>ONLYOFFICE · {file.kind.toUpperCase()} · v{file.revision}</span><h2>{file.filename}</h2><p>{statusText}</p></div>
        <button ref={closeButton} className={styles.close} type="button" disabled={effectivePhase === "waiting"} onClick={requestClose} aria-label="关闭编辑器并检查保存状态">关闭编辑器</button>
      </header>
      <div className={styles.notice} role="status" data-phase={effectivePhase}><span className={busy ? styles.pulse : styles.dot} aria-hidden="true"/><strong ref={statusReveal}>{statusText}</strong><span>服务器确认保存回调并生成新版本后，文件库才显示“已保存”。</span></div>
      {frozen && launch && <p className={styles.liveError} role="alert">当前身份正在切换。已打开的旧会话会继续保留，保存目标仍是原身份，绝不会自动转入新身份。请确认保存状态后再关闭；如状态无法查询，请下载旧版并联系管理员核对。</p>}
      {error && iframeVisible && <p className={styles.liveError} role="alert">{error} 当前编辑界面仍保留；请先检查文档状态，不要直接关闭或刷新。</p>}
      {iframeVisible && launch && <iframe ref={iframe} className={styles.frame} title={`ONLYOFFICE 编辑 ${file.filename}`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads" referrerPolicy="no-referrer" src={launch.shellUrl} onLoad={initFrame}/>}
      {(!iframeVisible || !launch) && <div className={styles.statePanel}>
        <span className={styles.stateMark}>{effectivePhase === "saved" ? "✓" : effectivePhase === "closed" ? "—" : effectivePhase === "frozen" ? "!" : "···"}</span>
        <h3>{statusText}</h3>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {effectivePhase === "opening" && <p>正在验证当前身份、原文件版本与编辑服务配置。</p>}
        {effectivePhase === "waiting" && <p>ONLYOFFICE 通常会在最后一个编辑窗口关闭后异步回调。请稍等；当前列表尚不能代表已保存。</p>}
        {effectivePhase === "unconfirmed" && <p>没有得到新版本确认。不要把这次编辑视为已保存；请保留原件并稍后在文件库刷新核对。</p>}
        {effectivePhase === "conflict" && recovery && <><p>服务器已保留一个独立的编辑副本，{recovery.expiresAt ? `可下载至 ${new Date(recovery.expiresAt).toLocaleString("zh-CN")}` : "当前不自动清理"}。{recoveryRemaining !== null && recoveryRemaining <= 0 ? "已到期，不能再下载。" : recoveryRemaining !== null && recoveryRemaining <= 48 * 60 * 60 * 1000 ? "已接近到期，请立即下载。" : "请及时下载核对。"}它不是当前正式版本。</p><button type="button" className={styles.primary} disabled={recoveryBusy || (recoveryRemaining !== null && recoveryRemaining <= 0)} onClick={() => void downloadRecovery()}>{recoveryBusy ? "校验并下载中…" : recoveryDownloaded ? "重新下载冲突副本" : "下载冲突编辑副本"}</button></>}
        {effectivePhase === "closed" && <p>文档服务报告本次没有变更，原有版本保持不变。</p>}
        {effectivePhase === "saved" && <p>新版本已保存，旧版本保留。返回后请下载核对排版。</p>}
        {effectivePhase === "frozen" && <p>身份变化后不会自动把旧会话内容写入新身份。请刷新并重新确认文件归属。</p>}
        {effectivePhase === "unconfirmed" && <button type="button" onClick={() => { setError(""); setPollAttempt(0); view("waiting"); }}>重新检查保存状态</button>}
        {!busy && <button type="button" className={styles.primary} onClick={requestClose}>{effectivePhase === "saved" ? "刷新文件库并返回" : "返回文件库"}</button>}
      </div>}
      <footer className={styles.footer}><span>当前支持单人编辑，关闭后确认保存；赛事材料需另行提交。</span><span>文件将发送至本部署的 ONLYOFFICE 服务，请核对部署位置与权限。旧版本保留。</span></footer>
    </section>
  </div>, document.body);
}
