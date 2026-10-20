'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import { newProjectReport, parseReportHead, reportContentsEqual, type ProjectReport, type ProjectReportSummary, type SaveReportRequest } from '@/lib/project-report';
import { createReportPermissionGuard } from '@/lib/report-permission';
import { parseReportHistory, parseReportVersion, prepareReportSave, reconcileReportHead, REPORT_READ_OPTIONS, validateReportSaveReceipt } from '@/lib/report-persistence';
import { errorMessage, HostedApiError, hostedRequest } from './api-client';
import { useHostedSession } from './HostedSession';

type CachedReport = {
  content: EditorContent;
  head: ProjectReport | null;
  pending: SaveReportRequest | null;
  conflict: boolean;
};

/** Own cloud-report persistence; the editor continues owning text, selection and undo history. */
export function useHostedReport({ projectId, title, writable }: { projectId: string; title: string; writable: boolean }) {
  const auth = useHostedSession(), key = `report:${projectId}`;
  const permission = useRef(createReportPermissionGuard(!writable));
  const [permissionVersion, setPermissionVersion] = useState({ writable, epoch: 0 });
  const permissionEpoch = permissionVersion.epoch + Number(permissionVersion.writable !== writable);
  if (permissionVersion.writable !== writable) setPermissionVersion({ writable, epoch: permissionEpoch });
  useLayoutEffect(() => { permission.current.update(!writable); }, [writable]);
  const canWrite = useCallback(() => writable && permission.current.allows(permissionEpoch), [writable, permissionEpoch]);
  const [cached] = useState(() => auth.getDraft(key) as CachedReport | undefined);
  const [head, setHead] = useState<ProjectReport | null>(cached?.head ?? null);
  const [content, setContent] = useState<EditorContent | null>(cached?.content ?? null);
  const [initial, setInitial] = useState<EditorContent | null>(null);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(!!cached?.pending), [conflict, setConflict] = useState(!!cached?.conflict);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [versions, setVersions] = useState<ProjectReportSummary[]>([]), [nextBefore, setNextBefore] = useState<number | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const alive = useRef(true), lock = useRef(false), pending = useRef<SaveReportRequest | null>(cached?.pending ?? null);
  const current = useRef<EditorContent | null>(cached?.content ?? null), headRef = useRef<ProjectReport | null>(cached?.head ?? null);
  const editEpoch = useRef(0), historyEpoch = useRef(0);
  const { cacheDraft, setUnsaved, mutate } = auth, userId = auth.session?.user?.id;
  const dirty = !!content && !reportContentsEqual(content, head?.content ?? newProjectReport(title));

  const onSnapshot = useCallback((value: EditorContent) => {
    const apply = () => { if (!canWrite()) return; current.current = value; editEpoch.current++; setContent(value); };
    // Child layout effects precede this hook's layout effect when edit permission returns.
    if (canWrite()) apply(); else queueMicrotask(apply);
  }, [canWrite]);
  const remember = useCallback((value: ProjectReport | null) => { headRef.current = value; setHead(value); }, []);

  useLayoutEffect(() => {
    if (content && userId) cacheDraft(key, { content, head, pending: pending.current, conflict } satisfies CachedReport, dirty || busy || uncertain, userId);
  }, [content, head, key, userId, cacheDraft, conflict, dirty, busy, uncertain]);
  useEffect(() => {
    setUnsaved(key, dirty || busy || uncertain);
    return () => setUnsaved(key, false);
  }, [key, dirty, busy, uncertain, setUnsaved]);

  const history = useCallback(async (before?: number) => {
    const epoch = ++historyEpoch.current;
    setHistoryBusy(true);
    try {
      const response = parseReportHistory(await hostedRequest(`/api/projects/${projectId}/report/versions${before ? `?beforeRevision=${before}` : ''}`), projectId);
      if (alive.current && epoch === historyEpoch.current) {
        setVersions(old => before ? [...old, ...response.versions.filter(v => !old.some(item => item.id === v.id))] : response.versions);
        setNextBefore(response.nextBeforeRevision);
      }
    } catch (e) { if (alive.current && epoch === historyEpoch.current) setError(errorMessage(e)); }
    finally { if (alive.current && epoch === historyEpoch.current) setHistoryBusy(false); }
  }, [projectId]);

  useEffect(() => {
    let live = true;
    alive.current = true;
    const counter = historyEpoch;
    void hostedRequest(`/api/projects/${projectId}/report`, REPORT_READ_OPTIONS).then(value => {
      if (!live) return;
      const saved = parseReportHead(value, projectId);
      if (cached) {
        if ((saved?.revision ?? 0) !== (cached.head?.revision ?? 0)) setConflict(true);
        current.current = cached.content; setContent(cached.content); setInitial(cached.content);
      } else {
        remember(saved);
        const first = saved?.content ?? newProjectReport(title);
        current.current = first; setContent(first); setInitial(first);
      }
      void history();
    }).catch(e => { if (live) setError(errorMessage(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; alive.current = false; counter.current++; };
  }, [projectId, title, cached, history, remember]);

  const save = useCallback(async () => {
    if (lock.current || !canWrite() || (conflict && !pending.current) || !current.current) return;
    lock.current = true; setBusy(true); setError('');
    let receivedSave = false;
    try {
      pending.current ??= prepareReportSave(current.current, headRef.current?.revision ?? 0);
      const request = pending.current;
      const raw = await mutate(`/api/projects/${projectId}/report/versions`, request, 'POST', REPORT_READ_OPTIONS);
      receivedSave = true;
      if (!alive.current || !canWrite()) return;
      const receipt = validateReportSaveReceipt(request, raw, projectId);
      const rawHead = await hostedRequest(`/api/projects/${projectId}/report`, REPORT_READ_OPTIONS);
      if (!alive.current || !canWrite()) return;
      const reconciliation = reconcileReportHead(receipt, rawHead, projectId);
      pending.current = null; setUncertain(false);
      if (reconciliation.kind === 'advanced') {
        setConflict(true); setNotice(`已保存 v${receipt.revision}；云端已有 v${reconciliation.head.revision}，请核对。`);
      } else {
        remember(reconciliation.head); setConflict(false); setNotice(`已保存报告与 PPT · v${receipt.revision}`);
      }
      void history();
    } catch (e) {
      if (!alive.current || !canWrite()) return;
      setError(errorMessage(e));
      // Only a definite POST rejection resolves the original attempt. A bad receipt
      // or a later HEAD failure may follow a committed write and must retain its key.
      if (!receivedSave && e instanceof HostedApiError && e.status >= 400 && e.status < 500 && e.code !== 'invalid_server_receipt') {
        pending.current = null; setUncertain(false);
        if (e.status === 409) setConflict(true);
      } else if (pending.current) setUncertain(true);
    } finally {
      lock.current = false;
      if (alive.current) { setBusy(false); setUncertain(!!pending.current); }
    }
  }, [canWrite, conflict, mutate, projectId, remember, history]);

  const load = useCallback(async (versionId?: string) => {
    const accepts = () => alive.current && permission.current.epoch === permissionEpoch;
    if (!accepts() || lock.current || uncertain || pending.current || !current.current) return;
    lock.current = true; setBusy(true); setError('');
    const epoch = editEpoch.current;
    try {
      const latest = parseReportHead(await hostedRequest(`/api/projects/${projectId}/report`, REPORT_READ_OPTIONS), projectId);
      if (!accepts()) return;
      const value = versionId ? parseReportVersion(await hostedRequest(`/api/projects/${projectId}/report/versions/${encodeURIComponent(versionId)}`, REPORT_READ_OPTIONS), projectId, versionId) : latest;
      if (!accepts()) return;
      if (epoch !== editEpoch.current) throw Error('读取期间已有新编辑，请重新载入。');
      if (dirty && !window.confirm('载入版本会替换当前未保存编辑。请确认已保存或下载备份。')) return;
      remember(latest);
      const next = value?.content ?? newProjectReport(title);
      current.current = next; setContent(next); setInitial(next); setGeneration(n => n + 1);
      setConflict(false); pending.current = null;
      setNotice(versionId ? `已载入历史 v${value!.revision}；保存会新增版本。` : '已载入云端最新版本。');
    } catch (e) { if (accepts()) setError(errorMessage(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }, [dirty, permissionEpoch, projectId, remember, title, uncertain]);

  const status = busy ? '正在保存或读取…' : uncertain ? '保存结果待核对' : conflict ? '云端版本已变化' : dirty ? '有未保存修改' : head ? `云端 v${head.revision}` : '新建报告';
  return { head, initial, generation, loading, busy, uncertain, conflict, error, notice, versions, nextBefore, historyBusy, dirty, status, canWrite, onSnapshot, history, save, load };
}
