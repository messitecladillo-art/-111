import type { PDFDocumentLoadingTask } from 'pdfjs-dist';

export const CASE_PDF_PIXELS = 8_000_000;
// Source scans may exceed the display canvas budget (the catalogue includes
// 19.54 MP pages). Bound decoding separately so valid source images survive.
export const CASE_PDF_SOURCE_IMAGE_PIXELS = 32_000_000;
let modulePromise: Promise<typeof import('pdfjs-dist')> | null = null;
export function casePdfModule() {
  modulePromise ??= import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    return pdfjs;
  }).catch(error => { modulePromise = null; throw error; });
  return modulePromise;
}
export function casePdfOptions(data: ArrayBuffer) {
  return { data, enableXfa: false, isEvalSupported: false, stopAtErrors: true, useWasm: false, useWorkerFetch: false, disableAutoFetch: true, disableStream: true, maxImageSize: CASE_PDF_SOURCE_IMAGE_PIXELS, canvasMaxAreaInBytes: CASE_PDF_PIXELS * 4 };
}
/** Called serially during import; no cover reader starts its own PDF worker. */
export async function prepareCaseReportPdf(file: Blob, signal?: AbortSignal): Promise<{ pages: number; cover?: Blob }> {
  let task: PDFDocumentLoadingTask | null = null;
  let cancelled = false;
  const cancel = () => { cancelled = true; void task?.destroy().catch(() => undefined); };
  const assertActive = () => { if (cancelled || signal?.aborted) throw Error('已取消原文读取。'); };
  const timer = setTimeout(cancel, 60_000);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    assertActive();
    const pdfjs = await casePdfModule();
    assertActive();
    const data = await file.arrayBuffer();
    assertActive();
    task = pdfjs.getDocument(casePdfOptions(data));
    task.onPassword = cancel;
    const pdf = await task.promise;
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw Error('PDF 页数无效。');
    const page = await pdf.getPage(1), viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(220 / viewport.width, 310 / viewport.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width * scale)); canvas.height = Math.max(1, Math.round(viewport.height * scale));
    await page.render({ canvas, viewport: page.getViewport({ scale }), annotationMode: pdfjs.AnnotationMode.DISABLE, background: '#ffffff' }).promise;
    const cover = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 0;
    page.cleanup();
    return { pages: pdf.numPages, ...(cover ? { cover } : {}) };
  } catch { throw Error('PDF 无法读取，可能已损坏或需要密码。本文件未保存。'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); await task?.destroy().catch(() => undefined); }
}
