'use client';
import { useEffect, useState } from 'react';
import { CASE_REPORT_STORAGE_EVENT, loadCaseReportCover, type ReportFileReference } from '@/lib/case-report-storage';
import styles from './CaseReportOriginals.module.css';

export function CaseReportCover({ report, available }: { report: ReportFileReference; available: boolean }) {
  const [cover, setCover] = useState<{ key: string; url: string } | null>(null), [revision, setRevision] = useState(0);
  const key = report.id + ':' + report.sha256 + ':' + revision;
  useEffect(() => { const changed = () => setRevision(value => value + 1); window.addEventListener(CASE_REPORT_STORAGE_EVENT, changed); return () => window.removeEventListener(CASE_REPORT_STORAGE_EVENT, changed); }, []);
  useEffect(() => {
    let cancelled = false, url: string | null = null;
    if (available) void loadCaseReportCover(report).then(blob => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob); setCover({ key, url });
    }).catch(() => { /* A missing thumbnail must not make an original report unavailable. */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [report, available, key]);
  const url = available && cover?.key === key ? cover.url : null;
  // eslint-disable-next-line @next/next/no-img-element -- Private Blob URLs stay in this browser and cannot use an image optimizer.
  return <div className={styles.cover}>{url ? <img src={url} alt={report.title + '原报告封面'} loading="lazy"/> : <div className={styles.coverPlaceholder}><span>研究报告</span><strong>{report.title}</strong><small>{available ? '原文已就绪' : '导入 PDF 后查看原文'}</small></div>}</div>;
}
export default CaseReportCover;
