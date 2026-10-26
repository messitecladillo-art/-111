'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { REPORT_CASES, REPORT_LIBRARY_STATS, filterReportCases, reportFacet, type ReportCase } from '@/lib/report-case-catalog';
import { useWorkbenchTheme } from '@/components/WorkbenchShell';
import { parseReportReading, reportReadingSnapshot, reportReadingServerSnapshot, saveReportReading, subscribeReportReading, type ReportReadingReceipt } from '@/lib/case-report-reading';
import CaseReportLibraryTools from './CaseReportLibraryTools';
import CaseReportReader from './CaseReportReader';
import CaseReportCover from './CaseReportCover';
import styles from './ReportCaseLibrary.module.css';

const REGIONS = reportFacet('region');
const METHODS = reportFacet('methods');

export default function ReportCaseLibrary() {
  const theme = useWorkbenchTheme();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [method, setMethod] = useState('');
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<ReportCase | null>(null);
  const [page, setPage] = useState(1);
  const [readingSession, setReadingSession] = useState(0);
  const sessionFence = useRef(0);
  const readingRaw = useSyncExternalStore(subscribeReportReading, reportReadingSnapshot, reportReadingServerSnapshot);
  const reading = useMemo(() => parseReportReading(readingRaw, REPORT_CASES), [readingRaw]);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const visible = filterReportCases({ q: query, region, method });
  const filtered = Boolean(query || region || method);
  const open = selected !== null;
  const close = useCallback(() => { sessionFence.current++; setSelected(null); }, []);
  const activeGuide = selected?.readingGuide.findLast(entry => entry.page <= page);

  const recordReading = useCallback((receipt: ReportReadingReceipt) => {
    if (sessionFence.current !== readingSession || !selected || receipt.reportId !== selected.id || receipt.sha256 !== selected.sha256) return;
    saveReportReading(receipt, REPORT_CASES);
  }, [readingSession, selected]);

  function openReport(report: ReportCase, element: HTMLElement) {
    trigger.current = element;
    setReadingSession(++sessionFence.current);
    setPage(reading[report.id]?.page ?? 1);
    setSelected(report);
  }

  useEffect(() => {
    if (!open) return;
    const regions = [...document.querySelectorAll<HTMLElement>('[data-dialog-background]')].map(element => ({ element, inert: element.inert, aria: element.getAttribute('aria-hidden') }));
    const overflow = document.body.style.overflow;
    regions.forEach(({ element }) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const leave = () => { if (location.hash !== '#cases') close(); };
    // Clicking non-focusable page text can move focus to body. Escape still
    // belongs to this open dialog, while IME and handled nested controls win.
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault(); close();
    };
    window.addEventListener('hashchange', leave);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('hashchange', leave);
      window.removeEventListener('keydown', escape);
      regions.forEach(({ element, inert, aria }) => { element.inert = inert; if (aria === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', aria); });
      document.body.style.overflow = overflow;
      if (trigger.current?.isConnected && !trigger.current.closest('[hidden]')) trigger.current.focus();
    };
  }, [open, close]);

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(element => element.getClientRects().length > 0 && !element.closest('[hidden]'));
    if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  }

  return <section id="cases" className={styles.library} aria-label="报告案例库">
    <div className={styles.intro}>
      <div><h2>打开报告，看研究如何展开。</h2><p>{REPORT_LIBRARY_STATS.fullReports} 份完整报告 · {REPORT_LIBRARY_STATS.pages} 页原文 · {REPORT_LIBRARY_STATS.readingGuides} 处阅读定位</p></div>
      <CaseReportLibraryTools reports={REPORT_CASES} onAvailabilityChange={setAvailableIds} />
    </div>
    <div className={styles.searchTools}>
    <div className={styles.filters} role="search" aria-label="检索报告">
      <label className={styles.search}><span aria-hidden="true">⌕</span><span className="sr-only">搜索报告</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜选题、研究方法或关键词" /></label>
      <label><span className="sr-only">研究地区</span><select value={region} onChange={event => setRegion(event.target.value)}><option value="">全部地区</option>{REGIONS.map(option => <option key={option.value} value={option.value}>{option.value} · {option.count}</option>)}</select></label>
      <label><span className="sr-only">研究方法</span><select value={method} onChange={event => setMethod(event.target.value)}><option value="">全部方法</option>{METHODS.map(option => <option key={option.value} value={option.value}>{option.value} · {option.count}</option>)}</select></label>
    </div>
    <div className={styles.results}><div className={styles.appliedFilters}><span aria-live="polite">{visible.length} 份报告</span>{method && <button type="button" className={styles.filterChip} onClick={() => setMethod('')} aria-label={`取消方法筛选：${method}`}>{method}<span aria-hidden="true">×</span></button>}</div>{filtered && <button type="button" onClick={() => { setQuery(''); setRegion(''); setMethod(''); }}>清除筛选</button>}</div>
    </div>
    {!visible.length ? <div className={styles.empty}><h3>暂时没有匹配的报告</h3><p>试试选题、地区或方法名称。</p><button type="button" onClick={() => { setQuery(''); setRegion(''); setMethod(''); }}>查看全部报告</button></div> : <div className={styles.grid}>
      {visible.map(report => <article className={styles.card} key={report.id}>
        <button type="button" className={styles.coverButton} aria-label={`阅读原报告：${report.title}`} onClick={event => openReport(report, event.currentTarget)}>
          <CaseReportCover report={report} available={availableIds.includes(report.id)} />
          <span className={styles.pageBadge}>{report.pages} 页</span>
        </button>
        <div className={styles.cardBody}>
          <div className={styles.tags}><span>{report.topic[0] ?? '市场研究'}</span><span>{report.region.join(' · ')}</span></div>
          <h3>{report.title}{report.subtitle && !report.title.includes(report.subtitle) && <span>{report.subtitle}</span>}</h3>
          <p>{report.summary}</p>
          <div className={styles.methods}>{report.methods.slice(0, 3).map(item => <button type="button" key={item} aria-label={`筛选方法：${item}`} aria-pressed={method === item} onClick={() => setMethod(current => current === item ? '' : item)}>{item}</button>)}{report.methods.length > 3 && <span title={report.methods.slice(3).join('、')}>+{report.methods.length - 3}</span>}</div>
          <button type="button" className={styles.readButton} onClick={event => openReport(report, event.currentTarget)}><span>{availableIds.includes(report.id) ? reading[report.id]?.page > 1 ? '继续阅读' : '阅读原报告' : '查看报告'}</span><span className={styles.readDestination}>{availableIds.includes(report.id) && reading[report.id]?.page > 1 && <em>第 {reading[report.id].page} 页</em>}<span aria-hidden="true">↗</span></span></button>
        </div>
        <span className={styles.number} aria-hidden="true">{String(REPORT_CASES.indexOf(report) + 1).padStart(2, '0')}</span>
      </article>)}
    </div>}
    {selected && createPortal(<div className={styles.overlay} data-theme={theme} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="report-reading-title" onKeyDown={handleKey}>
        <header className={styles.dialogHeader}><div><span>原报告阅读</span><h2 id="report-reading-title">{selected.title}</h2></div><button ref={closeButton} type="button" aria-label="关闭报告阅读" onClick={close}>×</button></header>
        <div className={styles.readingLayout}>
          <aside className={styles.guide} aria-label="报告阅读线索">
            <div className={styles.guideSummary}><span>{selected.region.join(' · ')} · {selected.pages} 页</span><p>{selected.summary}</p></div>
            <div className={styles.guideHeading}><h3>阅读线索</h3><button type="button" disabled={page === 1} onClick={() => setPage(1)}>回到封面</button></div>
            <nav>{selected.readingGuide.map((entry, index) => <button type="button" className={activeGuide === entry ? styles.activeGuide : undefined} aria-current={activeGuide === entry ? 'location' : undefined} key={`${entry.page}-${index}`} onClick={() => setPage(entry.page)}><span><strong>{entry.label}</strong><em>p. {entry.page}</em></span><p>{entry.note}</p></button>)}</nav>
            <div className={styles.guideMethods}><h3>文中方法</h3><div className={styles.methods}>{selected.methods.map(item => <span key={item}>{item}</span>)}</div></div>
            <details className={styles.source}><summary>文件与来源</summary><p>{selected.filename}</p><p>{selected.sourceCollection}</p>{selected.award && <p>奖项：{selected.award}</p>}<p>{selected.institution ? `学校：${selected.institution}` : '学校及奖项未独立核验'}</p><p className={styles.hash}>SHA-256 · {selected.sha256}</p></details>
          </aside>
          <div className={styles.reader}><CaseReportReader report={selected} initialPage={page} onPageChange={setPage} onPageRendered={recordReading} onClose={close} compact /></div>
        </div>
      </section>
    </div>, document.body)}
  </section>;
}
