"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createRecoveryKey, parseRecoveryKey } from "@/lib/editor-recovery";
import styles from "./EditorRecovery.module.css";

type Recovery = { configured: boolean; revision: number; updatedAt: string | null };
type Status = { scope: string; recovery: Recovery };
type Candidate = { key: string; revision: number; scope: string; state: "draft" | "pending" | "saved" | "conflict" };
type Task = { controller: AbortController; kind: "status" | "register" | "restore" | "copy" };
type Connection = "idle" | "ready" | "error" | "scope-blocked";
const STATUS_URL = "/api/drafts/session/recovery";
const RESTORE_URL = "/api/drafts/session/restore";
const SESSION_LOCK = "evix-editor-session-v1";
const SCOPE = /^[a-f0-9]{64}$/;

class RecoveryError extends Error {
  constructor(readonly status = 0, readonly code = "") { super("Recovery request did not receive a valid confirmation."); }
}
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { const actual = Object.keys(value); return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function readStatus(value: unknown): Status {
  if (!object(value) || !exactKeys(value, ["scope", "recovery"]) || typeof value.scope !== "string" || !SCOPE.test(value.scope) || !object(value.recovery)) throw new RecoveryError();
  const r = value.recovery;
  if (!exactKeys(r, ["configured", "revision", "updatedAt"]) || typeof r.configured !== "boolean" || !Number.isSafeInteger(r.revision) || (r.revision as number) < 0 || (r.revision as number) > 1_000_000) throw new RecoveryError();
  if (r.configured ? (r.revision as number) < 1 || typeof r.updatedAt !== "string" || !Number.isFinite(Date.parse(r.updatedAt)) : r.revision !== 0 || r.updatedAt !== null) throw new RecoveryError();
  return value as Status;
}
function readRestore(value: unknown): string {
  if (!object(value) || !exactKeys(value, ["ok", "scope"]) || value.ok !== true || typeof value.scope !== "string" || !SCOPE.test(value.scope)) throw new RecoveryError();
  return value.scope;
}
function validKey(value: string) { try { return parseRecoveryKey(value) === value; } catch { return false; } }
async function request(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { ...init, credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
  let body: unknown;
  try {
    if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new Error();
    const text = await response.text();
    if (text.length > 4096) throw new Error();
    body = JSON.parse(text);
  } catch { throw new RecoveryError(response.status); }
  if (response.status !== 200) {
    const code = object(body) && object(body.error) && typeof body.error.code === "string" ? body.error.code : "";
    // Never display server text: an intermediary could echo a submitted credential.
    throw new RecoveryError(response.status, code);
  }
  return body;
}
async function sessionLock<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  if (navigator.locks) return navigator.locks.request(SESSION_LOCK, { signal }, run);
  return run();
}
function errorText(failure: unknown) {
  if (failure instanceof RecoveryError) {
    if (failure.status === 429) return "恢复请求已达当前限制，请稍后再试。";
    if (failure.status === 503) return "恢复服务暂时不可用，尚未收到确认。";
    if (failure.status === 401) return "密钥未被接受，或当前会话已过期。不会因此创建或迁移文件。";
    if (failure.status === 403) return "当前身份或请求来源不支持此操作，请在本系统的匿名编辑会话内操作。";
    if (failure.status === 400) return "请求未被接受，请核对完整密钥和当前状态。";
  }
  return "没有收到完整、可核验的服务确认，请勿将此视为操作成功。";
}

export default function EditorRecovery({ onBeforeRestore }: { onBeforeRestore: () => void }) {
  const panelId = useId(), keyId = useId(), restoreId = useId();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [connection, setConnection] = useState<Connection>("idle");
  const [busy, setBusy] = useState<Task["kind"] | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [visible, setVisible] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [restoreKey, setRestoreKey] = useState("");
  const [restoreVisible, setRestoreVisible] = useState(false);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [hasLocks, setHasLocks] = useState<boolean | null>(null);
  const [conflictRead, setConflictRead] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const alive = useRef(false), operation = useRef<Task | null>(null);
  const pinned = useRef(""), blocked = useRef(false), fenced = useRef(false), loaded = useRef(false);
  const statusRef = useRef<Status | null>(null), candidateRef = useRef<Candidate | null>(null);
  const backupRef = useRef(false), restoreRef = useRef(""), consentRef = useRef(false), conflictReadRef = useRef(false);
  const blobUrls = useRef(new Set<string>());

  const current = useCallback((task: Task) => alive.current && operation.current === task && !task.controller.signal.aborted, []);
  const begin = useCallback((kind: Task["kind"]) => {
    if (!alive.current || operation.current) return null;
    const task: Task = { kind, controller: new AbortController() };
    operation.current = task; setBusy(kind); setError(""); setNotice(""); return task;
  }, []);
  const finish = useCallback((task: Task) => { if (operation.current === task) { operation.current = null; if (alive.current) setBusy(null); } }, []);
  const updateCandidate = useCallback((value: Candidate | null) => { candidateRef.current = value; setCandidate(value); }, []);
  const headers = useCallback((): Record<string, string> => ({ "x-editor-recovery": "1", ...(pinned.current ? { "x-editor-scope": pinned.current } : {}) }), []);
  const freezeScope = useCallback(() => {
    blocked.current = true; setConnection("scope-blocked");
    setError("当前浏览器身份已变化，恢复设置已暂停。不会自动接纳新身份。请先导出未保存内容，再手动刷新页面重新连接。");
  }, []);
  const acceptStatus = useCallback((value: Status) => {
    if (blocked.current || (pinned.current && pinned.current !== value.scope)) { freezeScope(); throw new RecoveryError(409, "editor_scope_changed"); }
    pinned.current ||= value.scope;
    statusRef.current = value; setStatus(value); setConnection("ready"); loaded.current = true;
  }, [freezeScope]);
  const scopeFailure = useCallback((failure: unknown) => {
    if (failure instanceof RecoveryError && (failure.code === "editor_scope_changed" || failure.code === "editor_session_required")) { freezeScope(); return true; }
    return false;
  }, [freezeScope]);

  const refresh = useCallback(async () => {
    const task = begin("status"); if (!task) return;
    try {
      if (!pinned.current && !fenced.current && !blocked.current) {
        await sessionLock(task.controller.signal, async () => {
          const result = await request("/api/drafts/session", task.controller.signal, { method: "POST" });
          if (!object(result) || !exactKeys(result, ["ok"]) || result.ok !== true) throw new RecoveryError();
        });
      }
      if (!current(task)) return;
      const observeOnly = fenced.current || blocked.current;
      const value = readStatus(await request(STATUS_URL, task.controller.signal, { headers: observeOnly ? { "x-editor-recovery": "1" } : headers() }));
      if (!current(task)) return;
      if (observeOnly) {
        setNotice(value.scope === pinned.current ? "当前会话仍指向原身份。本页保持保护状态；请导出未保存内容后手动刷新。" : "检测到当前会话身份已改变。未自动载入或迁移内容；请导出本页未保存内容后手动刷新。");
        return;
      }
      acceptStatus(value);
      if (candidateRef.current?.state === "conflict") { conflictReadRef.current = true; setConflictRead(true); }
      if (candidateRef.current?.state === "pending") setNotice("已读取当前状态，但仅凭版本号不能确认这把密钥已登记。请使用下方同一密钥和原版本重试。");
    } catch (failure) {
      if (!current(task)) return;
      if (!scopeFailure(failure)) { if (!fenced.current && !blocked.current) setConnection("error"); setError(errorText(failure)); }
    } finally { finish(task); }
  }, [acceptStatus, begin, current, finish, headers, scopeFailure]);

  useEffect(() => {
    alive.current = true;
    const urls = blobUrls.current;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (candidateRef.current || restoreRef.current || operation.current?.kind === "restore") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      alive.current = false; operation.current?.controller.abort(); operation.current = null;
      candidateRef.current = null; restoreRef.current = ""; backupRef.current = false; consentRef.current = false;
      urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  function toggle() {
    setExpanded(value => !value); setVisible(false); setRestoreVisible(false); setHasLocks(Boolean(navigator.locks));
    if (!expanded && !loaded.current && !operation.current && !blocked.current && !fenced.current) void refresh();
  }
  function generate() {
    if (operation.current || blocked.current || fenced.current || !statusRef.current || candidateRef.current || connection !== "ready") return;
    try {
      const key = parseRecoveryKey(createRecoveryKey());
      updateCandidate({ key, revision: statusRef.current.recovery.revision, scope: pinned.current, state: "draft" });
      setVisible(false); backupRef.current = false; setBackedUp(false); setNotice("密钥仅在本页内存中生成，尚未登记。请先保存在你信任的密码管理器或离线备份中。"); setError("");
    } catch { setError("此浏览器无法安全生成密钥，请使用支持安全随机数的浏览器。未创建恢复凭据。"); }
  }
  function clearCandidate() {
    const value = candidateRef.current;
    if (operation.current || !value || value.state === "pending" || (value.state === "conflict" && !conflictReadRef.current)) return;
    if (!window.confirm(value.state === "saved" ? "确认已妥善备份？清除后本页不能再次显示这把密钥，服务端不会返回明文。" : "确认放弃本页这把密钥？这不会撤销已登记的恢复密钥。")) return;
    updateCandidate(null); setVisible(false); backupRef.current = false; setBackedUp(false); conflictReadRef.current = false; setConflictRead(false); setNotice("已移除本页密钥显示。已有恢复凭据不会因此撤销。");
  }
  async function copyKey() {
    const value = candidateRef.current; if (!value) return;
    const task = begin("copy"); if (!task) return;
    try { await navigator.clipboard.writeText(value.key); if (current(task)) setNotice("已复制到剪贴板；请粘贴到安全位置并核对备份。剪贴板可能被其他应用读取，使用后请清理。"); }
    catch { if (current(task)) setError("浏览器未允许复制。可显示密钥后手动保存在安全位置，或自行下载备份。"); }
    finally { finish(task); }
  }
  function downloadKey() {
    const value = candidateRef.current; if (!alive.current || operation.current || !value) return;
    let url = "";
    try {
      url = URL.createObjectURL(new Blob([value.key + "\n"], { type: "text/plain;charset=utf-8" })); blobUrls.current.add(url);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "evi-x-editor-recovery-key.txt"; anchor.click();
      setNotice("已向浏览器发起密钥备份下载，请检查下载列表并确认文件内容。该文件是访问凭据，请勿上传到聊天、共享盘或公开仓库。");
      const urls = blobUrls.current; setTimeout(() => { if (urls.delete(url)) URL.revokeObjectURL(url); }, 60_000);
    } catch { if (url) { URL.revokeObjectURL(url); blobUrls.current.delete(url); } setError("未能发起备份下载，请显示密钥后手动保存在安全位置。"); }
  }
  async function register() {
    const value = candidateRef.current;
    if (blocked.current || fenced.current || !value || !backupRef.current || !["draft", "pending"].includes(value.state)) return;
    const task = begin("register"); if (!task) return;
    try {
      const latest = readStatus(await request(STATUS_URL, task.controller.signal, { headers: headers() }));
      if (!current(task)) return;
      acceptStatus(latest);
      if (value.scope !== pinned.current) { freezeScope(); return; }
      updateCandidate({ ...value, state: "pending" });
      const result = readStatus(await request(STATUS_URL, task.controller.signal, { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify({ key: value.key, revision: value.revision }) }));
      if (!current(task)) return;
      if (result.scope !== value.scope) { freezeScope(); return; }
      if (!result.recovery.configured || result.recovery.revision !== value.revision + 1) throw new RecoveryError();
      acceptStatus(result); updateCandidate({ ...value, state: "saved" }); setVisible(false);
      setNotice("恢复密钥已登记。服务端仅保存密钥验证摘要；请妥善保管你的明文备份。若这是更换密钥，旧密钥已失效，已有浏览器会话不会退出。");
    } catch (failure) {
      if (!current(task) || scopeFailure(failure)) return;
      if (failure instanceof RecoveryError && failure.status === 409) {
        updateCandidate({ ...value, state: "conflict" }); conflictReadRef.current = false; setConflictRead(false);
        setError("密钥版本发生冲突，未把它视为登记成功。请先刷新状态，再明确放弃本次密钥或保留备份；新的更换决定需重新生成。");
      } else setError(`${errorText(failure)}${candidateRef.current?.state === "pending" ? " 已保留同一密钥和原版本，重试不会自动生成另一把密钥。" : " 本页密钥仍保留。"}`);
    } finally { finish(task); }
  }
  async function restore() {
    const key = restoreRef.current;
    if (blocked.current || fenced.current || candidateRef.current || !consentRef.current || !validKey(key) || !pinned.current) return;
    if (!navigator.locks) { setError("此浏览器不支持安全的会话互斥锁，已禁用身份恢复。请使用支持 Web Locks 的安全浏览器；只读状态与密钥备份仍可使用。"); return; }
    const task = begin("restore"); if (!task) return;
    try {
      await sessionLock(task.controller.signal, async () => {
        if (!current(task)) return;
        const latest = readStatus(await request(STATUS_URL, task.controller.signal, { headers: headers() }));
        if (!current(task)) return;
        acceptStatus(latest);
        fenced.current = true; setTerminal(true); setRestoreVisible(false); consentRef.current = false; setRestoreConfirmed(false);
        setNotice("即将恢复身份，本页编辑操作已进入保护状态。请保留当前内容；结果返回后也不会自动刷新页面。");
        onBeforeRestore();
        const result = await request(RESTORE_URL, task.controller.signal, { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify({ key }) });
        if (!current(task)) return;
        readRestore(result);
        setNotice("恢复身份已获服务确认，原有文件归属没有迁移。本页仍保留当前内容且暂停编辑保存；请先导出未保存内容，再手动刷新页面查看恢复的文件。");
      });
    } catch (failure) {
      if (!current(task)) return;
      if (!fenced.current && scopeFailure(failure)) return;
      setError(`${errorText(failure)}${fenced.current ? " 本页继续暂停保存，不会自动重试恢复。请点击“检查当前会话状态”，先导出未保存内容，再手动刷新页面。" : " 恢复请求尚未发送。"}`);
    } finally { finish(task); }
  }

  const disabled = Boolean(busy) || connection !== "ready" || terminal;
  const candidateLocked = candidate?.state === "pending" || (candidate?.state === "conflict" && !conflictRead);
  return <section className={styles.panel} aria-label="编辑文件访问恢复" aria-busy={Boolean(busy)}>
    <button className={styles.disclosure} type="button" aria-expanded={expanded} aria-controls={panelId} onClick={toggle}>
      <span className={styles.symbol} aria-hidden="true">↗</span><span className={styles.heading}><strong>身份与恢复</strong><span>用恢复密钥在换浏览器或清除 Cookie 后找回文件访问权限。</span></span>
      <span className={styles.badge}>{terminal ? "本页已保护" : status?.recovery.configured ? "已设置" : "恢复设置"}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span>
    </button>
    <div id={panelId} hidden={!expanded} className={styles.body}>
      <p className={styles.scopeNote}>仅适用于匿名编辑会话：覆盖该身份的结构化草稿、演讲备注/讲稿和 Office 原文件。不包含问卷的浏览器本地设计、项目控制密钥或平台账号；不恢复尚未保存到服务端的内容。</p>
      <div className={styles.statusBar}><span>{busy === "status" ? "正在读取恢复状态…" : status ? `当前身份${status.recovery.configured ? `已设置 · 第 ${status.recovery.revision} 版` : "尚未设置恢复密钥"}` : "展开后读取当前会话"}</span><button type="button" disabled={Boolean(busy)} onClick={() => void refresh()}>{terminal || connection === "scope-blocked" ? "检查当前会话状态" : "刷新状态"}</button></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {(terminal || connection === "scope-blocked") && <div className={styles.protection}><strong>先备份，再手动刷新</strong><p>请导出未保存内容，并保留已选本地文件，再手动刷新浏览器。本页不会自动切换文件；检查状态不会解除保护。</p></div>}
      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.step}>01 / 留好备份</span><h3>{status?.recovery.configured ? "更换恢复密钥" : "创建恢复密钥"}</h3>
          <p>密钥由此浏览器随机生成，拥有它的人可访问该身份的全部编辑文件。请像密码一样保管，不要发给他人或提交到项目资料。</p>
          {status?.recovery.configured && <p className={styles.warning}>登记新密钥后，旧密钥立即失效；已登录的浏览器会话不会被撤销。</p>}
          {!candidate ? <button type="button" className={styles.secondary} disabled={disabled || Boolean(restoreKey)} onClick={generate}>生成新的恢复密钥</button> : <>
            <label className={styles.field} htmlFor={keyId}>本页生成的密钥<span>{candidate.state === "saved" ? "已登记，请保管备份" : "仅保留在本页内存"}</span></label>
            <div className={styles.secretRow}><input id={keyId} type={visible ? "text" : "password"} value={candidate.key} readOnly autoComplete="off" spellCheck={false} aria-label="本页生成的恢复密钥" /><button type="button" aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? "隐藏" : "显示"}</button></div>
            <div className={styles.actions}><button type="button" disabled={Boolean(busy)} onClick={() => void copyKey()}>复制密钥</button><button type="button" disabled={Boolean(busy)} onClick={downloadKey}>下载密钥备份</button><button type="button" disabled={Boolean(busy) || candidateLocked} onClick={clearCandidate}>清除本页密钥</button></div>
            <p className={styles.hint}>服务端不会返回密钥明文。下载或复制不等于已经妥善备份，请自行打开备份核对；刷新或离开本页会丢失此处显示。</p>
            {candidate.state !== "saved" && <><label className={styles.check}><input type="checkbox" checked={backedUp} disabled={Boolean(busy) || candidate.state === "conflict"} onChange={event => { if (operation.current) return; backupRef.current = event.target.checked; setBackedUp(event.target.checked); }} /><span>我已在安全位置保存并核对密钥，同意将它作为访问凭据发送到本站登记。</span></label><button type="button" className={styles.primary} disabled={Boolean(busy) || !backedUp || terminal || connection === "scope-blocked" || candidate.state === "conflict"} onClick={() => void register()}>{busy === "register" ? "正在等待登记确认…" : candidate.state === "pending" ? "用同一密钥重试登记" : "确认备份并登记密钥"}</button></>}
          </>}
        </div>
        <div className={styles.card}>
          <span className={styles.step}>02 / 回到原来的文件</span><h3>使用已保存的密钥</h3><p>恢复的是原文件的访问身份，不会复制、删除或合并文件。若 Cookie 和已登记密钥都已丢失，无法凭姓名或文件名找回。</p>
          <label className={styles.field} htmlFor={restoreId}>粘贴恢复密钥</label>
          <div className={styles.secretRow}><input id={restoreId} type={restoreVisible ? "text" : "password"} value={restoreKey} placeholder="粘贴完整的 evxr_… 密钥" maxLength={48} autoComplete="off" spellCheck={false} autoCapitalize="none" disabled={disabled || Boolean(candidate) || hasLocks === false} onChange={event => { if (operation.current || fenced.current || blocked.current) return; restoreRef.current = event.target.value; setRestoreKey(event.target.value); consentRef.current = false; setRestoreConfirmed(false); }} /><button type="button" disabled={terminal || !restoreKey} aria-pressed={restoreVisible} onClick={() => setRestoreVisible(value => !value)}>{restoreVisible ? "隐藏" : "显示"}</button></div>
          {hasLocks === false && <p className={styles.warning}>此浏览器不支持 Web Locks，身份恢复已禁用。请使用支持此能力的安全浏览器；只读状态与密钥备份仍可使用。</p>}
          {restoreKey && !validKey(restoreKey) && <p className={styles.warning}>请粘贴完整密钥，不要包含空格、换行或备份说明。</p>}
          {candidate && <p className={styles.hint}>请先完成当前密钥登记并保留备份，再清除本页密钥显示，才能进行身份恢复。</p>}
          <label className={styles.check}><input type="checkbox" checked={restoreConfirmed} disabled={disabled || Boolean(candidate)} onChange={event => { if (operation.current || fenced.current) return; consentRef.current = event.target.checked; setRestoreConfirmed(event.target.checked); }} /><span>我理解恢复将暂停本页编辑保存；会保留本地原件，先导出未保存内容，再自行刷新查看恢复的文件。</span></label>
          <button type="button" className={styles.primary} disabled={disabled || Boolean(candidate) || !hasLocks || !restoreConfirmed || !validKey(restoreKey)} onClick={() => void restore()}>{busy === "restore" ? "正在等待恢复确认…" : "确认并恢复访问身份"}</button>
          <p className={styles.hint}>恢复后不会自动加载文件。请求中断时也保持保护状态，不会在后台重复尝试。</p>
        </div>
      </div>
    </div>
  </section>;
}
