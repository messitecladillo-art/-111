'use client';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { identifyCaseReport, loadCaseReport, saveCaseReport, type ReportFileReference } from '@/lib/case-report-storage';
import { CASE_PDF_PIXELS, casePdfModule, casePdfOptions, prepareCaseReportPdf } from './case-pdf';
import styles from './CaseReportOriginals.module.css';
export type { ReportFileReference } from '@/lib/case-report-storage';

export type CaseReportRenderReceipt = { reportId: string; sha256: string; page: number };
type Props = { report: ReportFileReference; initialPage?: number; onClose: () => void; compact?: boolean; onPageChange?: (page: number) => void; onPageRendered?: (receipt: CaseReportRenderReceipt) => void };
type Loaded = { key: string; reportId: string; sha256: string; pdf: PDFDocumentProxy; annotationMode: number };
type Size = { width: number; height: number };
type Magnification = { mode: 'page' | 'width' } | { mode: 'custom'; scale: number };
type ViewRequest = { source: Loaded | null; page: number; box: Size; magnification: Magnification };
type Rendered = { source: Loaded; page: number; view: ViewRequest; size: Size; error?: string };
type Position = { source: Loaded; page: number; x: number; y: number };
const boundedPage = (value: number, pages: number) => Number.isFinite(value) ? Math.max(1, Math.min(pages, Math.trunc(value))) : 1;
const pageScale = (natural: Size, box: Size, magnification: Magnification) => magnification.mode === 'custom' ? magnification.scale : magnification.mode === 'width' ? box.width / natural.width : Math.min(box.width / natural.width, box.height / natural.height);
const MIN_SCALE = .1, MAX_SCALE = 4, VIEWPORT_PADDING = 32;

export function CaseReportReader({ report, initialPage = 1, onClose, compact = false, onPageChange, onPageRendered }: Props) {
  const [attempt, setAttempt] = useState(0), [page, setPage] = useState(1), [pageInput, setPageInput] = useState('1');
  const [magnification, setMagnification] = useState<Magnification>({ mode: 'page' }), [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState<{ source: Loaded; page: number; size: Size } | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null), [rendered, setRendered] = useState<Rendered | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null), [importingKey, setImportingKey] = useState<string | null>(null), [importFailure, setImportFailure] = useState<{ key: string; message: string } | null>(null);
  const [appliedRequest, setAppliedRequest] = useState('');
  const viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), input = useRef<HTMLInputElement>(null);
  const rendering = useRef<RenderTask | null>(null), queue = useRef<Promise<void>>(Promise.resolve()), importEpoch = useRef(0);
  const importController = useRef<AbortController | null>(null);
  const reportFile = useRef(report), pageChange = useRef(onPageChange), pageRendered = useRef(onPageRendered);
  const renderEpoch = useRef(0), receipt = useRef<Rendered | null>(null), position = useRef<Position | null>(null);
  useLayoutEffect(() => { reportFile.current = report; pageChange.current = onPageChange; pageRendered.current = onPageRendered; }, [report, onPageChange, onPageRendered]);
  const key = report.id + ':' + report.sha256 + ':' + attempt;
  const [importViewKey, setImportViewKey] = useState(key);
  if (importViewKey !== key) { setImportViewKey(key); setImportingKey(null); setImportFailure(null); }
  const importing = importingKey === key, importError = importFailure?.key === key ? importFailure.message : '';
  const source = loaded?.key === key ? loaded : null;
  const [view, setView] = useState<ViewRequest>({ source, page, box, magnification });
  if (view.source !== source || view.page !== page || view.box !== box || view.magnification !== magnification) setView({ source, page, box, magnification });
  const current = source && rendered?.view === view ? rendered : null;
  const scale = naturalSize?.source === source && naturalSize?.page === page && box.width > 0 && box.height > 0 ? pageScale(naturalSize.size, box, magnification) : null;
  const error = loadError?.key === key ? loadError.message : current?.error;
  const ready = !!current && !error;

  // Reading-guide changes only select a page; the existing PDF document stays alive.
  const requestKey = key + ':' + initialPage;
  if (source && appliedRequest !== requestKey) {
    const next = boundedPage(initialPage, source.pdf.numPages);
    setAppliedRequest(requestKey); setPage(next); setPageInput(String(next));
  }

  // Invalidate before passive cleanup; a settled old render cannot become a receipt.
  useLayoutEffect(() => { const fence = renderEpoch; fence.current++; return () => { fence.current++; }; }, [key, view]);
  useLayoutEffect(() => {
    if (current && !current.error && receipt.current !== current) {
      receipt.current = current;
      pageRendered.current?.({ reportId: current.source.reportId, sha256: current.source.sha256, page: current.page });
    }
  }, [current]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const width = Math.max(0, Math.floor(element.clientWidth - VIEWPORT_PADDING)), height = Math.max(0, Math.floor(element.clientHeight - VIEWPORT_PADDING));
      setBox(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => { const fence = importEpoch, controller = importController; return () => { fence.current++; const active = controller.current; controller.current = null; active?.abort(); }; }, [key]);
  useEffect(() => {
    let cancelled = false, loading: PDFDocumentLoadingTask | null = null;
    const file = reportFile.current;
    void (async () => {
      try {
        const blob = await loadCaseReport(file);
        if (cancelled) return;
        if (!blob) throw Error('此浏览器还没有这份原报告，或本地缓存已被清理。请重新导入 PDF。');
        const pdfjs = await casePdfModule();
        if (cancelled) return;
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        loading = pdfjs.getDocument(casePdfOptions(data));
        loading.onPassword = () => { void loading?.destroy(); };
        const pdf = await loading.promise;
        if (cancelled) return;
        if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw Error('PDF 页数无效，请重新导入。');
        setMagnification({ mode: 'page' });
        setLoaded({ key, reportId: file.id, sha256: file.sha256, pdf, annotationMode: pdfjs.AnnotationMode.DISABLE });
      } catch (cause) {
        if (loading) { void loading.destroy().catch(() => undefined); loading = null; }
        if (!cancelled) setLoadError({ key, message: cause instanceof Error ? cause.message : '原报告读取失败，请重新导入 PDF。' });
      }
    })();
    return () => { cancelled = true; rendering.current?.cancel(); if (loading) void loading.destroy().catch(() => undefined); };
  }, [key]);
  useEffect(() => {
    const { source, page, box, magnification } = view;
    if (!source || box.width < 1 || box.height < 1) return;
    let cancelled = false, task: RenderTask | null = null;
    const ticket = renderEpoch.current, state = { source, page, view };
    const active = () => !cancelled && ticket === renderEpoch.current;
    queue.current = queue.current.catch(() => undefined).then(async () => {
      let pdfPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
      try {
        if (!active() || !canvas.current) return;
        pdfPage = await source.pdf.getPage(page);
        if (!active() || !canvas.current) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        if (![natural.width, natural.height].every(value => Number.isFinite(value) && value > 0)) throw Error('页面尺寸无效。');
        setNaturalSize({ source, page, size: { width: natural.width, height: natural.height } });
        const scale = pageScale(natural, box, magnification), cssWidth = natural.width * scale, cssHeight = natural.height * scale;
        const ratio = Math.min(Math.max(1, window.devicePixelRatio || 1), 2, Math.sqrt(CASE_PDF_PIXELS / (cssWidth * cssHeight)), 8192 / cssWidth, 8192 / cssHeight);
        const element = canvas.current;
        element.width = Math.max(1, Math.floor(cssWidth * ratio)); element.height = Math.max(1, Math.floor(cssHeight * ratio));
        element.style.width = cssWidth + 'px'; element.style.height = cssHeight + 'px';
        task = pdfPage.render({ canvas: element, viewport: pdfPage.getViewport({ scale }), transform: [ratio, 0, 0, ratio, 0, 0], annotationMode: source.annotationMode, background: '#ffffff' });
        rendering.current = task;
        await task.promise;
        if (active()) {
          const prior = position.current, samePage = prior?.source === source && prior.page === page;
          const left = Math.min(Math.max(0, cssWidth - box.width), Math.max(0, samePage ? cssWidth * prior.x - box.width / 2 : (cssWidth - box.width) / 2));
          const top = Math.min(Math.max(0, cssHeight - box.height), Math.max(0, samePage ? cssHeight * prior.y - box.height / 2 : 0));
          viewport.current?.scrollTo({ top, left });
          position.current = { source, page, x: cssWidth <= box.width ? .5 : (left + box.width / 2) / cssWidth, y: cssHeight <= box.height ? .5 : (top + box.height / 2) / cssHeight };
          setRendered({ ...state, size: { width: cssWidth, height: cssHeight } });
        }
      } catch { if (active()) setRendered({ ...state, size: { width: 0, height: 0 }, error: '这一页无法显示，请重新读取或重新导入 PDF。' }); }
      finally { if (rendering.current === task) rendering.current = null; try { pdfPage?.cleanup(); } catch { /* Document destruction already released this page. */ } }
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [view]);

  function goTo(value: number) { if (!source) return; const next = boundedPage(value, source.pdf.numPages); setPage(next); setPageInput(String(next)); pageChange.current?.(next); }
  function commitPageInput() {
    const value = Number(pageInput);
    if (!pageInput.trim() || !Number.isFinite(value)) { setPageInput(String(page)); return; }
    goTo(value);
  }
  function changeScale(delta: number) {
    if (scale === null) return;
    setMagnification(previous => ({ mode: 'custom', scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, (previous.mode === 'custom' ? previous.scale : scale) + delta)) }));
  }
  function rememberPosition() {
    const element = viewport.current;
    if (!element || !current || current.error) return;
    position.current = { source: current.source, page, x: current.size.width <= box.width ? .5 : Math.min(1, (element.scrollLeft + box.width / 2) / current.size.width), y: current.size.height <= box.height ? .5 : Math.min(1, (element.scrollTop + box.height / 2) / current.size.height) };
  }
  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (!source || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target) || target.isContentEditable || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    event.preventDefault(); goTo(page + (event.key === 'ArrowRight' ? 1 : -1));
  }
  async function reimport(file: File | undefined) {
    if (!file || importController.current) return;
    const ticket = ++importEpoch.current; setImportingKey(key); setImportFailure(null);
    const controller = new AbortController(); importController.current = controller;
    try {
      await identifyCaseReport(file, [report]);
      if (ticket !== importEpoch.current) return;
      const assets = await prepareCaseReportPdf(file, controller.signal);
      if (ticket !== importEpoch.current) return;
      await saveCaseReport(file, [report], assets);
      if (ticket === importEpoch.current) setAttempt(value => value + 1);
    } catch (cause) { if (ticket === importEpoch.current) setImportFailure({ key, message: cause instanceof Error ? cause.message : '导入失败，未保存。' }); }
    finally { if (importController.current === controller) importController.current = null; if (ticket === importEpoch.current) setImportingKey(null); }
  }
  return <section className={styles.reader} data-compact={compact} aria-label={report.title + '原文阅读器'} onKeyDown={handleKey}>
    {!compact && <header className={styles.readerHeader}><div><span>原报告</span><h3>{report.title}</h3></div><button type="button" onClick={onClose} aria-label="关闭原文阅读器">关闭</button></header>}
    <div className={styles.readerToolbar} aria-label="原文翻页与缩放">
      <div className={styles.paging}><button type="button" title="上一页 ←" disabled={!source || page <= 1} onClick={() => goTo(page - 1)}>上一页</button><form noValidate onSubmit={event => { event.preventDefault(); commitPageInput(); }}><label>第<input type="number" min={1} max={source?.pdf.numPages ?? 1} value={pageInput} disabled={!source} aria-label="原报告页码" onChange={event => setPageInput(event.target.value)} onBlur={commitPageInput}/>页</label><span aria-live="polite">/ {source?.pdf.numPages ?? '—'}</span></form><button type="button" title="下一页 →" disabled={!source || page >= source.pdf.numPages} onClick={() => goTo(page + 1)}>下一页</button></div>
      <div className={styles.zoom}><button type="button" disabled={scale === null || scale <= MIN_SCALE} aria-label="缩小原报告" onClick={() => changeScale(-.25)}>−</button><span aria-label="原报告缩放比例">{scale === null ? '—' : `${Math.round(scale * 100)}%`}</span><button type="button" disabled={scale === null || scale >= MAX_SCALE} aria-label="放大原报告" onClick={() => changeScale(.25)}>＋</button><button type="button" disabled={!source} aria-pressed={magnification.mode === 'page'} onClick={() => setMagnification({ mode: 'page' })}>整页</button><button type="button" disabled={!source} aria-pressed={magnification.mode === 'width'} onClick={() => setMagnification({ mode: 'width' })}>适配宽度</button></div>
    </div>
    <div className={styles.readerBody}><div ref={viewport} className={styles.readerViewport} tabIndex={0} aria-label="原报告页面，可滚动" aria-busy={!ready && !error} onScroll={rememberPosition}>
      <div className={styles.pageStage}><canvas ref={canvas} className={styles.pageCanvas} data-pending={!ready} aria-hidden={!ready} role="img" aria-label={report.title + '，第 ' + page + ' 页'}/></div>
      </div>
      {error ? <div className={styles.readerMessage} role="alert"><p>{error}</p><div><button type="button" disabled={importing} onClick={() => { if (!importController.current) setAttempt(value => value + 1); }}>重新读取</button><button type="button" disabled={importing} onClick={() => input.current?.click()}>{importing ? '正在导入…' : '重新导入 PDF'}</button></div><input ref={input} type="file" hidden accept=".pdf,application/pdf" aria-label="重新选择这份原报告 PDF" disabled={importing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void reimport(file); }}/>{importError && <p className={styles.error}>{importError}</p>}</div> : !ready && <div className={styles.readerMessage} role="status">{source ? `正在显示第 ${page} 页…` : '正在核对并读取原报告…'}</div>}
    </div>
  </section>;
}
export default CaseReportReader;
