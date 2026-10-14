'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { HostedApiError, errorMessage, hostedRequest } from '@/components/hosted/api-client';
import { collectionTransfer, parseSurveyDataset, parseSurveyList, parseSurveyRelease, type DatasetTransfer, type SurveyRelease } from '@/lib/survey-collection';
import styles from './SurveyCollection.module.css';

type Mutation = { kind: 'publish'; body: { expectedQuestionnaireRevision: number; idempotencyKey: string } } | { kind: 'close'; releaseId: string; body: { expectedRevision: number; idempotencyKey: string } };
export default function SurveyCollection({ projectId, savedRevision, canPublish, writable, onAnalyze }: { projectId: string; savedRevision: number; canPublish: boolean; writable: boolean; onAnalyze: (value: DatasetTransfer) => void }) {
  const auth = useHostedSession(), cacheKey = `survey-operation:${projectId}`;
  const [cached] = useState(() => auth.getDraft(cacheKey) as Mutation | undefined);
  const [releases, setReleases] = useState<SurveyRelease[]>([]), [selectedId, setSelectedId] = useState(''), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [reading, setReading] = useState<'download' | 'analysis' | null>(null), [pending, setPending] = useState<Mutation | null>(cached || null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [closeId, setCloseId] = useState('');
  const [origin, setOrigin] = useState('');
  const selected = releases.find(r => r.id === selectedId) || releases[0];
  const shareUrl = selected && origin ? `${origin}/s/${selected.token}` : '';
  const mounted = useRef(true), lock = useRef(false), epoch = useRef(0), exportEpoch = useRef(0), currentSelection = useRef('');
  const { cacheDraft } = auth, userId = auth.session?.user?.id;
  useLayoutEffect(() => { if (userId) cacheDraft(cacheKey, pending ?? undefined, !!pending, userId); }, [cacheKey, pending, userId, cacheDraft]);
  useLayoutEffect(() => { currentSelection.current = selected?.id || ''; exportEpoch.current++; }, [selected?.id]);
  const reload = useCallback(async () => {
    const version = ++epoch.current;
    try { const rows = parseSurveyList(await hostedRequest(`/api/projects/${projectId}/surveys`)); if (rows.some(row => row.projectId !== projectId)) throw Error('调查列表不属于当前项目。'); if (mounted.current && version === epoch.current) { setReleases(rows); setOrigin(location.origin); setError(''); } }
    catch (e) { if (mounted.current && version === epoch.current) setError(errorMessage(e)); }
    finally { if (mounted.current && version === epoch.current) setLoading(false); }
  }, [projectId]);
  useEffect(() => { mounted.current = true; let current = true; const readVersion = epoch, datasetVersion = exportEpoch; queueMicrotask(() => { if (current) void reload(); }); return () => { current = false; mounted.current = false; readVersion.current++; datasetVersion.current++; }; }, [reload]);
  async function mutate(request: Mutation) {
    if (!writable || lock.current) return;
    lock.current = true; epoch.current++; setLoading(false); setBusy(true); setPending(request); setError(''); setNotice('');
    try {
      const path = request.kind === 'publish' ? `/api/projects/${projectId}/surveys` : `/api/projects/${projectId}/surveys/${request.releaseId}/close`;
      const receipt = parseSurveyRelease(await auth.mutate(path, request.body));
      if (!mounted.current) return;
      if (receipt.projectId !== projectId || (request.kind === 'close' && receipt.id !== request.releaseId) || (request.kind === 'publish' && receipt.questionnaireRevision !== request.body.expectedQuestionnaireRevision)) throw Error('发布回执与当前请求不一致。');
      setPending(null); setReleases(rows => [receipt, ...rows.filter(row => row.id !== receipt.id)]); setSelectedId(receipt.id); setCloseId('');
      setNotice(request.kind === 'publish' ? `问卷 v${receipt.questionnaireRevision} 已发布，可以分享填写链接。` : '已结束回收，历史答卷与发布版本继续保留。');
    } catch (e) {
      if (!mounted.current) return;
      setError(errorMessage(e));
      if (e instanceof HostedApiError && e.status >= 400 && e.status < 500 && e.code !== 'invalid_server_receipt') { setPending(null); if (e.status === 409) void reload(); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function exportDataset(kind: 'download' | 'analysis') {
    if (!selected || reading) return;
    const releaseId = selected.id, version = ++exportEpoch.current; setReading(kind); setError(''); setNotice('');
    try {
      const dataset = parseSurveyDataset(await hostedRequest(`/api/projects/${projectId}/surveys/${releaseId}/dataset`, { maxBytes: 16 * 1024 * 1024 }), projectId, releaseId);
      if (!mounted.current || version !== exportEpoch.current || currentSelection.current !== releaseId) return;
      if (kind === 'analysis') { const transfer = collectionTransfer(dataset, crypto.randomUUID()); onAnalyze(transfer); setNotice(`已发送 ${dataset.rowCount} 份答卷与发布 v${dataset.release.questionnaireRevision} 的问卷快照。`); }
      else {
        const url = URL.createObjectURL(new Blob(['\uFEFF', dataset.downloadCsv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `回收答卷-v${dataset.release.questionnaireRevision}-${releaseId.slice(0, 8)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(`已发起下载：${dataset.rowCount} 份答卷，含原变量、应答范围和回执编号。`);
      }
      setReleases(rows => rows.map(row => row.id === releaseId ? dataset.release : row));
    } catch (e) { if (mounted.current && version === exportEpoch.current) setError(errorMessage(e)); }
    finally { if (mounted.current) setReading(null); }
  }
  async function copyLink() { try { await navigator.clipboard.writeText(shareUrl); if (mounted.current) setNotice('填写链接已复制。'); } catch { if (mounted.current) setNotice('请选中下方填写链接并复制。'); } }
  const matching = releases.find(release => release.questionnaireRevision === savedRevision);
  return <section data-self-styled className={styles.panel} aria-labelledby="survey-collection-title">
    <header className={styles.heading}><div><span className={styles.eyebrow}>DESIGN → FIELDWORK</span><h2 id="survey-collection-title">发布与回收</h2><p>发布保存好的问卷，让每份回答对应明确的题目版本。</p></div><button type="button" disabled={loading || busy} onClick={() => { setLoading(true); setError(''); void reload(); }}>{loading ? '正在读取…' : '刷新回收情况'}</button></header>
    <div className={styles.publish}><div><strong>{savedRevision ? `当前问卷 v${savedRevision}` : '先保存一版问卷'}</strong><p>{!savedRevision ? '完成题目和调查说明后，保存版本即可发布。' : !canPublish ? '当前设计还有未保存修改，先保存后再发布。' : matching ? `这一版已${matching.status === 'open' ? '发布' : '结束回收'}。${matching.status === 'closed' ? '再次调查请先保存新版本。' : '可以在下方查看填写链接与答卷。'}` : '发布后保留这一版题目，后续修改可另存为新版本。'}</p></div>{writable && <button type="button" className={styles.primary} disabled={!savedRevision || !canPublish || !!matching || busy || !!pending || loading} onClick={() => void mutate({ kind: 'publish', body: { expectedQuestionnaireRevision: savedRevision, idempotencyKey: crypto.randomUUID() } })}>{busy && pending?.kind === 'publish' ? '正在发布…' : '发布当前版本'}</button>}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {pending && !busy && <div className={styles.pending}><span>上次{pending.kind === 'publish' ? '发布' : '结束回收'}结果待核对。</span><button type="button" disabled={!writable} onClick={() => void mutate(pending)}>核对原请求</button></div>}
    {!releases.length ? <div className={styles.empty}><span aria-hidden="true">↗</span><h3>{loading ? '正在读取已发布问卷' : '让问卷走向受访者'}</h3><p>发布后，在这里查看回收数量、下载答卷，并带入分析。</p></div> : <div className={styles.workspace}>
      <nav className={styles.directory} aria-label="已发布的调查"><h3>调查版本 <span>{releases.length}</span></h3>{releases.map(release => <button key={release.id} type="button" aria-pressed={release.id === selected?.id} onClick={() => { setSelectedId(release.id); setCloseId(''); setNotice(''); }}><span className={styles.version}>v{release.questionnaireRevision}<small data-open={release.status === 'open'}>{release.status === 'open' ? '回收中' : '已结束'}</small></span><strong>{release.title}</strong><span className={styles.count}>{release.responseCount} 份回答{release.classification === 'synthetic' ? ' · 合成验收' : ''}</span></button>)}</nav>
      {selected && <div className={styles.detail}><header className={styles.releaseHeading}><div><span className={styles.eyebrow}>发布版本 v{selected.questionnaireRevision}</span><h3>{selected.title}</h3><p>{new Date(selected.createdAt).toLocaleString('zh-CN')} 发布</p></div><span className={styles.status} data-open={selected.status === 'open'}>{selected.status === 'open' ? '正在回收' : '回收结束'}</span></header>
        <div className={styles.metrics}><div><span>已收回</span><strong>{selected.responseCount.toLocaleString()}<small> 份</small></strong></div><div><span>本批容量</span><strong>{selected.limits.responses.toLocaleString()}<small> 份</small></strong></div><div><span>回答存储</span><strong>{(selected.responseBytes / 1024).toFixed(1)}<small> / 2,048 KiB</small></strong></div></div>
        <label className={styles.share}>填写链接<div><input readOnly value={shareUrl} onFocus={event => event.target.select()}/><button type="button" onClick={() => void copyLink()}>复制</button><a href={shareUrl || undefined} target="_blank" rel="noreferrer">打开填写页 ↗</a></div></label>
        <div className={styles.dataset}><div><h4>从回收到分析</h4><p>每次读取保留完整答卷快照；分析使用这次发布的题目版本。</p></div><div className={styles.actions}><button type="button" disabled={!!reading} onClick={() => void exportDataset('download')}>{reading === 'download' ? '正在读取答卷…' : '下载答卷 CSV'}</button><button type="button" className={styles.primary} disabled={!!reading || !selected.responseCount} onClick={() => void exportDataset('analysis')}>{reading === 'analysis' ? '正在整理数据…' : '带入数据分析 →'}</button></div></div>
        {writable && selected.status === 'open' && <div className={styles.close}>{closeId === selected.id ? <><p>结束后此链接停止接收新回答，已收到的答卷继续保留。</p><button type="button" disabled={busy || !!pending} onClick={() => void mutate({ kind: 'close', releaseId: selected.id, body: { expectedRevision: selected.revision, idempotencyKey: crypto.randomUUID() } })}>确认结束回收</button><button type="button" disabled={busy} onClick={() => setCloseId('')}>继续回收</button></> : <button type="button" disabled={busy || !!pending} onClick={() => setCloseId(selected.id)}>结束本版回收</button>}</div>}
      </div>}
    </div>}
  </section>;
}
