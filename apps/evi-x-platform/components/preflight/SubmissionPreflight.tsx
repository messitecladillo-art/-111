'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useHostedSession } from '../hosted/HostedSession';
import { useThemePreference, ThemeToggle } from '../workbench/shell-kit';
import { normalizeIdentityTerms, type PreflightReport } from '../../lib/submission-preflight';
import { preflightFormat, uploadTemporaryPreflight, validatePreflightFile } from '../../lib/preflight-upload';
import styles from './SubmissionPreflight.module.css';

type FileRow = { id: string; file: File; phase: string; running?: boolean; report?: PreflightReport; error?: string; settingsKey?: string };
const phaseLabels: Record<string, string> = { idle: '待检查', fingerprint: '计算文件指纹', preflight: '核对文件结构', decompress: '读取文件部件', parse: '解析文件内容', inspect: '检查身份与编辑残留', request: '上传并检查', receipt: '接收检查回执', verify: '核对文件与清理回执', cancelled: '已取消', done: '检查完成', failed: '检查未完成' };
function saveReport(report: PreflightReport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = '提交前检查记录.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function localCheck(file: File, terms: string[], signal: AbortSignal, phase: (value: string) => void): Promise<PreflightReport> {
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null; let settled = false;
    const finish = (result?: PreflightReport, error?: Error) => {
      if (settled) return; settled = true; clearTimeout(timeout); signal.removeEventListener('abort', cancelled); worker?.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const cancelled = () => finish(undefined, new DOMException('已取消本次检查。', 'AbortError'));
    const timeout = setTimeout(() => finish(undefined, Error('本地读取超过 30 秒，请拆分文件或进行完整检查。')), 30_000);
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) { cancelled(); return; }
    phase('fingerprint');
    void file.arrayBuffer().then(buffer => {
      if (settled) return;
      try {
        worker = new Worker(new URL('../../lib/submission-preflight.worker.ts', import.meta.url), { type: 'module' });
        const id = crypto.randomUUID();
        worker.onmessage = event => {
          const value = event.data;
          if (settled || value?.id !== id) return;
          if (typeof value.phase === 'string') phase(value.phase);
          else if (value.result) finish(value.result as PreflightReport);
          else if (value.error) finish(undefined, Error(typeof value.error === 'string' ? value.error : '文件结构无法读取。'));
        };
        worker.onerror = () => finish(undefined, Error('本地检查未完成，请重新检查此文件。'));
        worker.postMessage({ id, buffer, name: file.name, terms }, [buffer]);
      } catch (error) { finish(undefined, error instanceof Error ? error : Error('无法启动本地检查。')); }
    }).catch(error => finish(undefined, error instanceof Error ? error : Error('无法读取所选文件。')));
  });
}
export default function SubmissionPreflight({ standalone = false }: { standalone?: boolean }) {
  const auth = useHostedSession(), theme = useThemePreference();
  const [rows, setRows] = useState<FileRow[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [termsInput, setTermsInput] = useState(''), [notice, setNotice] = useState(''), [dragOver, setDragOver] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null), [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');
  const controllers = useRef(new Map<string, AbortController>()), generations = useRef(new Map<string, string>()), fileInput = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null), dialogReturn = useRef<HTMLElement | null>(null);
  let terms: string[] = [], termsError = '';
  try { terms = normalizeIdentityTerms(termsInput.split(/[\n,，;；]/u)); } catch (error) { termsError = error instanceof Error ? error.message : '身份词配置无法读取。'; }
  const settingsKey = JSON.stringify(terms);
  const termsTooLong = !!termsError || terms.length > 128 || terms.some(term => term.length > 64) || new TextEncoder().encode(settingsKey).byteLength > 4096;
  const row = rows.find(value => value.id === selected) || rows[0], report = row?.report;
  const stale = !!report && (row?.settingsKey !== settingsKey || termsTooLong);
  const busy = !!row?.running;
  useEffect(() => {
    const current = controllers.current, tokens = generations.current;
    return () => { for (const controller of current.values()) controller.abort(); current.clear(); tokens.clear(); };
  }, [auth.identityEpoch]);
  useEffect(() => {
    if (!confirmation || !dialog.current) return;
    const element = dialog.current, previous = dialogReturn.current;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [confirmation]);
  const update = (id: string, patch: Partial<FileRow>) => setRows(current => current.map(value => value.id === id ? { ...value, ...patch } : value));
  const cancel = (id: string) => {
    generations.current.delete(id); controllers.current.get(id)?.abort(); controllers.current.delete(id);
    update(id, { phase: 'cancelled', running: false }); setConfirmation(null);
  };
  const addFiles = (list: FileList | File[]) => {
    if (auth.loading) { setNotice('正在核对登录状态，请稍后选择文件。'); return; }
    const added: FileRow[] = []; const problems: string[] = []; let bytes = rows.reduce((sum, value) => sum + value.file.size, 0);
    for (const file of Array.from(list)) {
      try { validatePreflightFile(file); } catch (error) { problems.push(error instanceof Error ? error.message : '无法选择文件。'); continue; }
      if (rows.length + added.length >= 5 || bytes + file.size > 50 * 1024 * 1024) { problems.push('每批最多 5 个文件，总计 50 MiB。'); break; }
      if (rows.some(value => value.file.name === file.name && value.file.size === file.size && value.file.lastModified === file.lastModified) || added.some(value => value.file.name === file.name && value.file.size === file.size && value.file.lastModified === file.lastModified)) { problems.push('相同文件已在列表中。'); continue; }
      bytes += file.size; added.push({ id: crypto.randomUUID(), file, phase: 'idle' });
    }
    setRows(current => [...current, ...added]); if (added.length) { setSelected(added[0].id); setFilter('all'); }
    setNotice([...new Set(problems)].join(' '));
  };
  const run = async (target: FileRow, scope: 'local' | 'server') => {
    if (termsTooLong) { setNotice('最多 128 个身份词，每词 64 字符，配置总计 4 KiB。'); return; }
    if (controllers.current.size >= 2 && !controllers.current.has(target.id)) { setNotice('已有两个文件正在检查，请完成或取消后继续。'); return; }
    cancel(target.id);
    const controller = new AbortController(), token = crypto.randomUUID(), inputTerms = [...terms], key = settingsKey;
    generations.current.set(target.id, token); controllers.current.set(target.id, controller);
    update(target.id, { phase: 'fingerprint', running: true, error: undefined, report: undefined, settingsKey: key }); setNotice(''); setFilter('all');
    const current = () => generations.current.get(target.id) === token && !controller.signal.aborted;
    const phase = (value: string) => { if (current()) update(target.id, { phase: value }); };
    let timedOut = false;
    const timeout = scope === 'server' ? setTimeout(() => { timedOut = true; controller.abort(); }, 75_000) : null;
    try {
      const result = scope === 'local' ? await localCheck(target.file, inputTerms, controller.signal, phase) :
        await uploadTemporaryPreflight(target.file, inputTerms, auth.session?.csrfToken || '', controller.signal, phase);
      if (current()) update(target.id, { report: result, phase: 'done', settingsKey: key });
    } catch (error) {
      if (generations.current.get(target.id) === token) update(target.id, { phase: timedOut ? 'failed' : controller.signal.aborted ? 'cancelled' : 'failed', error: timedOut ? '检查等待超时，请稍后手动重试。' : controller.signal.aborted ? undefined : error instanceof Error ? error.message : '检查未完成，请重试。' });
    } finally {
      if (timeout) clearTimeout(timeout);
      if (generations.current.get(target.id) === token) { controllers.current.delete(target.id); generations.current.delete(target.id); update(target.id, { running: false }); }
    }
  };
  const remove = (target: FileRow) => { cancel(target.id); setRows(value => value.filter(item => item.id !== target.id)); if (selected === target.id) setSelected(null); };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragOver(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); };
  const issueCount = report?.findings.length || 0;
  return <div className={styles.root + (standalone ? ' ' + styles.standalone : '')} data-theme={theme}>
    {standalone && <header className={styles.siteNav}><Link className={styles.brand} href="/">证见 <span>EVI-X</span></Link><nav><Link href="/workspace">研究工作台 ↗</Link><ThemeToggle theme={theme}/></nav></header>}
    {standalone && <div className={styles.intro}><div><p className={styles.eyebrow}>提交准备 / FILE CHECK</p><h1>提交前体检<span>。</span></h1><p className={styles.subtitle}>检查作者信息、批注、隐藏页与身份残留，定位到文件部件。</p></div><div className={styles.introTag}><span aria-hidden="true">↗</span> 本地检查 · 免费使用</div></div>}
    <div className={styles.layout}>
      <aside className={styles.inputs}>
        <section className={styles.card}><div className={styles.cardHeading}><h2>待提交文件</h2><span>{rows.length} / 5</span></div>
          <div className={styles.drop + (dragOver ? ' ' + styles.dropActive : '')} onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={drop}>
            <div className={styles.fileIcon} aria-hidden="true">↥</div><strong>拖入报告或答辩文件</strong><span>DOCX · PPTX · PDF / 每份 20 MiB</span>
            <button type="button" className={styles.primary} disabled={auth.loading} onClick={() => fileInput.current?.click()}>选择文件</button>
            <input ref={fileInput} type="file" multiple accept=".docx,.pptx,.pdf" disabled={auth.loading} aria-label="选择待检查文件" className={styles.hiddenInput} onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }}/>
            {auth.loading && <span role="status">正在核对登录状态…</span>}
          </div>
          {notice && <p className={styles.error} role="alert">{notice}</p>}
          <div className={styles.fileList}>{rows.map(item => <div className={styles.fileItem + (item.id === row?.id ? ' ' + styles.selected : '')} key={item.id}>
            <button type="button" className={styles.fileSelect} aria-pressed={item.id === row?.id} onClick={() => { setSelected(item.id); setFilter('all'); }}><span className={styles.fileType}>{preflightFormat(item.file.name).toUpperCase()}</span><span><strong title={item.file.name}>{item.file.name}</strong><small>{(item.file.size / 1024).toFixed(1)} KiB · {phaseLabels[item.phase] || '正在检查'}</small></span></button>
            <button type="button" aria-label={'移除 ' + item.file.name} className={styles.remove} onClick={() => remove(item)}>×</button>
          </div>)}</div>
        </section>
        <section className={styles.card}><div className={styles.cardHeading}><h2>身份词检查</h2><span>可选</span></div><label className={styles.label} htmlFor="preflight-terms">学校、成员、教师或团队名称</label>
          <textarea id="preflight-terms" value={termsInput} rows={4} maxLength={9000} placeholder={'每行一个，例如：\n学校全称\n指导教师姓名'} onChange={event => { setTermsInput(event.target.value); setConfirmation(null); }}/>
          {termsError && <p className={styles.error} role="alert">{termsError}</p>}
          <div className={styles.termTools}><span className={termsTooLong ? styles.error : ''}>{terms.length} / 128 个词 · {termsTooLong ? '超过配置上限' : '最多 4 KiB'}</span><button type="button" onClick={() => setTermsInput(value => [value, '证见', 'EVI-X', '獬见'].filter(Boolean).join('\n'))}>加入工具品牌词</button></div>
        </section>
        <div className={styles.localNote}><span aria-hidden="true">◉</span><p>本地检查在当前浏览器完成。完整检查由你确认后临时上传，回执包含文件清理记录。</p></div>
      </aside>
      <main className={styles.results}>
        {!row ? <section className={styles.empty}><div className={styles.emptyOrbit} aria-hidden="true"><span>文</span><span>页</span><span>注</span><i>检</i></div><p className={styles.eyebrow}>最后一步，也有据可查</p><h2>选一份文件，开始检查。</h2><p>结果按文件保存，可逐项定位、重新检查并下载记录。</p><div className={styles.emptyChecks}><span>作者与修改者</span><span>批注与修订</span><span>隐藏页与备注</span><span>身份词残留</span></div></section> :
          <><section className={styles.resultHeader}><div><p className={styles.eyebrow}>{preflightFormat(row.file.name).toUpperCase()} / {(row.file.size / 1024).toFixed(1)} KiB</p><h2>{row.file.name}</h2></div><div className={styles.actions}>
            {busy ? <button className={styles.secondary} type="button" onClick={() => cancel(row.id)}>取消检查</button> : <button className={styles.primary} type="button" disabled={termsTooLong} onClick={() => void run(row, 'local')}>本地检查</button>}
            <button className={styles.secondary} type="button" disabled={busy || termsTooLong} onClick={event => { dialogReturn.current = event.currentTarget; setConfirmation(row.id); }}>完整文件检查</button>
          </div></section>
          {busy && <div className={styles.running} role="status"><span className={styles.activity} aria-hidden="true"/>{phaseLabels[row.phase] || '正在检查文件'}<small>完成后显示真实回执</small></div>}
          {row.error && <div className={styles.failure} role="alert"><strong>检查未完成</strong><p>{row.error}</p><button type="button" onClick={() => void run(row, 'local')}>重新本地检查 ↗</button></div>}
          {row.phase === 'cancelled' && !row.report && <p className={styles.softStatus} role="status">已取消本次检查。文件保留，可重新开始。</p>}
          {stale && <p className={styles.stale} role="status">身份词已修改。请重新检查，以生成当前配置的记录。</p>}
          {report && <div className={styles.report + (stale ? ' ' + styles.staleReport : '')}>
            <section className={styles.summary}><div><span className={styles.summaryIcon} aria-hidden="true">{report.status === 'incomplete' ? '…' : issueCount ? '!' : '✓'}</span><div><p className={styles.eyebrow}>{report.scope === 'local-initial' ? '本地初检' : '完整文件检查'}</p><h3>{report.status === 'incomplete' ? '有待完成的检查' : issueCount ? '发现 ' + issueCount + ' 个待处理项' : '已检查范围未发现问题'}</h3></div></div><button type="button" disabled={stale || busy} className={styles.secondary} onClick={() => saveReport(report)}>下载检查记录</button></section>
            <section className={styles.issues}><div className={styles.sectionTitle}><h3>问题定位</h3><div className={styles.filters}>{(['all', 'error', 'warning'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? '全部' : value === 'error' ? '需处理' : '核对'}</button>)}</div></div>
              {report.findings.filter(item => filter === 'all' || item.level === filter).map((item, index) => <article className={styles.issue} key={item.code + item.location + index}><span className={item.level === 'error' ? styles.errorBadge : styles.warningBadge}>{item.level === 'error' ? '需处理' : '核对'}</span><div><h4>{item.message}</h4><code>{item.location}</code>{item.field && <small>字段：{item.field}</small>}</div></article>)}
              {!report.findings.filter(item => filter === 'all' || item.level === filter).length && <p className={styles.noIssues}>当前筛选下没有问题记录。</p>}
            </section>
            <section className={styles.coverage}><div className={styles.sectionTitle}><h3>检查覆盖与人工核对</h3><span>按当前文件</span></div>{report.coverage.map(item => <div className={styles.coverageItem} key={item.id}><span className={item.status === 'checked' ? styles.checked : styles.manual}>{item.status === 'checked' ? '已检查' : item.status === 'manual' ? '人工核对' : '待检查'}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></div>)}</section>
            <details className={styles.fingerprint}><summary>文件指纹与检查范围</summary><dl><dt>SHA-256</dt><dd>{report.sha256}</dd><dt>检查配置</dt><dd>{report.termsHash}</dd><dt>文件大小</dt><dd>{report.bytes} 字节</dd>{report.scope === 'server-deep' && <><dt>临时文件</dt><dd>已清理 · 回执确认</dd></>}</dl></details>
          </div>}
          {!report && !busy && !row.error && <section className={styles.ready}><span aria-hidden="true">↗</span><h3>文件已就绪</h3><p>{preflightFormat(row.file.name) === 'pdf' ? 'PDF 的对象、附件和历史版本在完整文件检查中读取。' : '点击本地检查，读取当前文件的内容与包内信息。'}</p></section>}
          </>}
      </main>
    </div>
    {confirmation && row?.id === confirmation && <dialog ref={dialog} className={styles.dialog} aria-labelledby="preflight-consent-title" onCancel={event => { event.preventDefault(); setConfirmation(null); }}>
      <p className={styles.eyebrow}>完整文件检查</p><h2 id="preflight-consent-title">临时上传这份文件</h2><p className={styles.consentFile}>{row.file.name}</p><p>读取包内图像元数据、嵌入对象，以及 PDF 的附件、对象和历史记录。文件仅用于本次检查，完成后清理。</p>
      <div className={styles.dialogActions}><button type="button" autoFocus className={styles.secondary} onClick={() => setConfirmation(null)}>取消</button>{auth.session?.authenticated ? <button type="button" className={styles.primary} onClick={() => { setConfirmation(null); void run(row, 'server'); }}>确认上传并检查</button> : <Link className={styles.primary} href="/login" target="_blank" rel="noopener">登录后完整检查 ↗</Link>}</div>
    </dialog>}
  </div>;
}
