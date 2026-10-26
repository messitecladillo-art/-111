'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { availableCaseReportIds, CASE_REPORT_STORAGE_EVENT, identifyCaseReport, saveCaseReport, type ReportFileReference } from '@/lib/case-report-storage';
import { prepareCaseReportPdf } from './case-pdf';
import styles from './CaseReportOriginals.module.css';
export type { ReportFileReference } from '@/lib/case-report-storage';

type Props = { reports: readonly ReportFileReference[]; onAvailabilityChange: (ids: string[]) => void };
type Receipt = { filename: string; ok: boolean; message: string };
export function CaseReportLibraryTools({ reports, onAvailabilityChange }: Props) {
  const [available, setAvailable] = useState<string[]>([]), [storageError, setStorageError] = useState('');
  const [receipts, setReceipts] = useState<Receipt[]>([]), [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null), alive = useRef(false), running = useRef(false), generation = useRef(0), refreshEpoch = useRef(0);
  const importing = useRef<AbortController | null>(null);
  const latest = useRef({ reports, onAvailabilityChange });
  useLayoutEffect(() => { latest.current = { reports, onAvailabilityChange }; }, [reports, onAvailabilityChange]);
  const refresh = useCallback(async () => {
    const ticket = ++refreshEpoch.current;
    try {
      const ids = await availableCaseReportIds(latest.current.reports);
      if (!alive.current || ticket !== refreshEpoch.current) return;
      setAvailable(ids); setStorageError(''); latest.current.onAvailabilityChange(ids);
    } catch (error) {
      if (!alive.current || ticket !== refreshEpoch.current) return;
      setAvailable([]); latest.current.onAvailabilityChange([]);
      setStorageError(error instanceof Error ? error.message : '原文库读取失败。');
    }
  }, []);
  const catalogKey = reports.map(report => report.id + ':' + report.sha256).join('|');
  useEffect(() => {
    const importFence = generation, availabilityFence = refreshEpoch, importController = importing;
    alive.current = true; void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener(CASE_REPORT_STORAGE_EVENT, changed);
    return () => { alive.current = false; importFence.current++; availabilityFence.current++; importController.current?.abort(); window.removeEventListener(CASE_REPORT_STORAGE_EVENT, changed); };
  }, [catalogKey, refresh]);

  async function importFiles(files: File[]) {
    if (!files.length || running.current) return;
    running.current = true;
    const controller = new AbortController(); importing.current = controller;
    const ticket = ++generation.current, catalog = latest.current.reports;
    setReceipts([]); setProgress({ done: 0, total: files.length });
    try {
      for (let index = 0; index < files.length; index++) {
        if (!alive.current || ticket !== generation.current) break;
        const file = files[index];
        let receipt: Receipt;
        try {
          const reference = await identifyCaseReport(file, catalog);
          if (!alive.current || ticket !== generation.current) break;
          const assets = await prepareCaseReportPdf(file, controller.signal);
          if (!alive.current || ticket !== generation.current) break;
          await saveCaseReport(file, [reference], assets);
          receipt = { filename: file.name, ok: true, message: reference.title + ' · ' + assets.pages + ' 页' };
        } catch (error) { receipt = { filename: file.name, ok: false, message: error instanceof Error ? error.message : '文件导入失败，未保存。' }; }
        if (!alive.current || ticket !== generation.current) break;
        setReceipts(previous => [...previous, receipt]); setProgress({ done: index + 1, total: files.length });
      }
    } finally {
      running.current = false;
      if (importing.current === controller) importing.current = null;
      if (alive.current && ticket === generation.current) { setProgress(null); await refresh(); }
    }
  }
  const succeeded = receipts.filter(receipt => receipt.ok).length;
  return <section className={styles.libraryTools} aria-label="本地原报告文件">
    <div className={styles.libraryRow}><strong className={styles.availability}>{available.length} / {reports.length} 份原文已就绪</strong><details className={styles.fileRequirements}><summary>文件要求</summary><p>仅保存在此浏览器，不会上传。按文件指纹匹配目录中的原报告；单份上限 60 MiB，原文库上限 250 MiB。</p></details><button type="button" className={styles.primary} disabled={!!progress} onClick={() => input.current?.click()}>{progress ? '正在导入…' : '导入原报告'}</button><input ref={input} hidden type="file" multiple accept=".pdf,application/pdf" aria-label="选择原报告 PDF" disabled={!!progress} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFiles(files); }}/></div>
    {progress && <p role="status">已处理 {progress.done} / {progress.total} 份，正在核对文件并缓存封面。</p>}
    {storageError && <p className={styles.error} role="alert">{storageError}<button type="button" onClick={() => void refresh()}>重试</button></p>}
    {receipts.length > 0 && <details className={styles.receipts} open={receipts.some(receipt => !receipt.ok)}><summary>{succeeded} 份已导入{receipts.length > succeeded ? `，${receipts.length - succeeded} 份未导入` : ''}</summary><ul>{receipts.map((receipt, index) => <li key={index} data-state={receipt.ok ? 'success' : 'error'}><strong>{receipt.ok ? '已保存' : '未保存'} · {receipt.filename}</strong><span>{receipt.message}</span></li>)}</ul></details>}
  </section>;
}
export default CaseReportLibraryTools;
