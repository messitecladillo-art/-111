'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { fitPdfCanvas, pdfPreviewPageCount, PDF_PREVIEW_LIMITS } from '../../lib/pdf-preview';
import styles from './PdfPreview.module.css';

type Props = { url: string; label?: string };
type DocumentState = { url: string; attempt: number; pdf: PDFDocumentProxy; annotationMode: number };
type RenderState = { document: DocumentState; page: number; width: number; attempt: number; error?: string };

export default function PdfPreview({ url, label = '编译后的报告 PDF' }: Props) {
  const viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve()), rendering = useRef<RenderTask | null>(null);
  const [width, setWidth] = useState(0), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [fitAttempt, setFitAttempt] = useState(0);
  const [loaded, setLoaded] = useState<DocumentState | null>(null), [loadError, setLoadError] = useState<{ url: string; attempt: number; message: string } | null>(null);
  const [rendered, setRendered] = useState<RenderState | null>(null);
  const document = loaded?.url === url && loaded.attempt === attempt ? loaded : null;
  const currentRender = rendered?.document === document && rendered.page === page && rendered.width === width && rendered.attempt === fitAttempt ? rendered : null;
  const error = loadError?.url === url && loadError.attempt === attempt ? loadError.message : currentRender?.error;
  const ready = Boolean(currentRender && !error);
  const pages = document ? pdfPreviewPageCount(document.pdf.numPages) : 0;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(0, Math.floor(element.clientWidth - 32)));
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    let cancelled = false, loading: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        // The caller owns a compiled PDF blob; never fetch a third-party document.
        if (new URL(url).protocol !== 'blob:') throw new Error('请使用本次编译生成的 PDF。');
        const pdfjs = await import('pdfjs-dist');
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        loading = pdfjs.getDocument({ url, enableXfa: false, stopAtErrors: true, useWasm: false, useWorkerFetch: false, disableAutoFetch: true, disableStream: true, maxImageSize: PDF_PREVIEW_LIMITS.pixels, canvasMaxAreaInBytes: PDF_PREVIEW_LIMITS.pixels * 4 });
        const pdf = await loading.promise;
        if (cancelled) return;
        pdfPreviewPageCount(pdf.numPages);
        setPage(1);
        setLoaded({ url, attempt, pdf, annotationMode: pdfjs.AnnotationMode.DISABLE });
      } catch (cause) {
        if (loading) { void loading.destroy().catch(() => undefined); loading = null; }
        if (!cancelled) setLoadError({ url, attempt, message: cause instanceof Error && cause.message === '请使用本次编译生成的 PDF。' ? cause.message : 'PDF 读取失败，请重试或下载查看。' });
      }
    })();
    return () => {
      cancelled = true; rendering.current?.cancel();
      if (loading) void loading.destroy().catch(() => undefined);
    };
  }, [url, attempt]);

  useEffect(() => {
    if (!document || width < 1) return;
    let cancelled = false, task: RenderTask | null = null;
    const state = { document, page, width, attempt: fitAttempt };
    // A canvas may only have one renderer. Cancellation must settle before reuse.
    queue.current = queue.current.catch(() => undefined).then(async () => {
      if (cancelled || !canvas.current) return;
      let pdfPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
      try {
        pdfPage = await document.pdf.getPage(page);
        if (cancelled || !canvas.current) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const fit = fitPdfCanvas(natural.width, natural.height, width, window.devicePixelRatio);
        const element = canvas.current;
        element.width = fit.pixelWidth; element.height = fit.pixelHeight;
        element.style.width = fit.width + 'px'; element.style.height = fit.height + 'px';
        task = pdfPage.render({ canvas: element, viewport: pdfPage.getViewport({ scale: fit.scale }), transform: [fit.ratio, 0, 0, fit.ratio, 0, 0], annotationMode: document.annotationMode, background: '#ffffff' });
        rendering.current = task;
        await task.promise;
        if (!cancelled) setRendered(state);
      } catch {
        if (!cancelled) setRendered({ ...state, error: '这一页暂时无法显示，请重试或下载 PDF。' });
      } finally {
        if (rendering.current === task) rendering.current = null;
        try { pdfPage?.cleanup(); } catch { /* A destroyed worker may already have released this page. */ }
      }
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [document, page, width, fitAttempt]);

  const fitWidth = () => { if (viewport.current) setWidth(Math.max(0, Math.floor(viewport.current.clientWidth - 32))); setFitAttempt(value => value + 1); };
  return <div className={styles.preview} aria-label={label}>
    <div className={styles.toolbar} aria-label="PDF 翻页">
      <button type="button" aria-label="上一页 PDF" disabled={!document || page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>←</button>
      <span className={styles.pageCount} aria-live="polite">{document ? '第 ' + page + ' / ' + document.pdf.numPages + ' 页' : '读取 PDF…'}</span>
      <button type="button" aria-label="下一页 PDF" disabled={!document || page >= pages} onClick={() => setPage(value => Math.min(pages, value + 1))}>→</button>
      <button type="button" className={styles.fit} disabled={!document} onClick={fitWidth}>适配宽度</button>
    </div>
    {document && document.pdf.numPages > pages && <p className={styles.limit}>预览前 {pages} 页，下载包含全部页面。</p>}
    <div ref={viewport} className={styles.viewport} aria-busy={!ready && !error}>
      <canvas ref={canvas} className={styles.canvas} hidden={!ready} role="img" aria-label={label + '，第 ' + page + ' 页'} />
      {error ? <div className={styles.message} role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新读取 PDF</button></div> : !ready && <div className={styles.message} role="status">{document ? '正在绘制第 ' + page + ' 页…' : '正在读取 PDF…'}</div>}
    </div>
  </div>;
}
