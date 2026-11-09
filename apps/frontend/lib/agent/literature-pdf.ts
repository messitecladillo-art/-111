import type { PDFDocumentLoadingTask, PDFPageProxy, PDFWorker } from 'pdfjs-dist';
import { LITERATURE_STUDY_LIMITS, type StudyPaper } from './literature-study.ts';

export const LITERATURE_PDF_LIMITS = Object.freeze({ fileBytes: 20 * 1024 * 1024, textBytes: 180 * 1024 });
export type LiteraturePdfRange = { startPage: number; endPage: number };
type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

class LiteraturePdfError extends Error {}

async function readPageText(page: PDFPageProxy, pageNumber: number, signal: AbortSignal): Promise<string> {
  const content: ReadableStream<TextContent> = page.streamTextContent({ disableNormalization: true });
  const reader = content.getReader();
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) return text.trimEnd();
      // PDF.js supplies item order, spaces and line endings. Keep that order, including across chunks.
      const addition = chunk.value.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join('');
      text = (text + addition).replace(/\r\n?|\u2028|\u2029/gu, '\n')
        .replace(/[^\S\n]+/gu, ' ').replace(/ *\n[ \n]*/gu, '\n').trimStart();
      if (text.trimEnd().length > LITERATURE_STUDY_LIMITS.pageChars) {
        throw new LiteraturePdfError(`PDF 第 ${pageNumber} 页文字超过 ${LITERATURE_STUDY_LIMITS.pageChars} 字符，无法完整导入该页。请选择其他页码范围。`);
      }
    }
  } finally {
    void reader.cancel(new Error('PDF page text reading ended.')).catch(() => undefined);
    reader.releaseLock();
  }
}

/** Extract complete text pages from local bytes. Page numbers are inclusive and 1-based. */
export async function readLiteraturePdf(file: File, signal: AbortSignal, range?: LiteraturePdfRange): Promise<StudyPaper> {
  signal.throwIfAborted();
  if (!file.size || file.size > LITERATURE_PDF_LIMITS.fileBytes) {
    throw new LiteraturePdfError('请选择不超过 20 MiB 的非空 PDF。');
  }
  const filename = file.name;
  if (!filename.trim() || filename.length > LITERATURE_STUDY_LIMITS.filenameChars || /\p{Cc}/u.test(filename)) {
    throw new LiteraturePdfError('PDF 文件名无效或过长，请重命名后重试。');
  }
  const title = filename.trim().replace(/\.pdf$/iu, '').trim() || filename.trim();
  if (range && (!Number.isSafeInteger(range.startPage) || !Number.isSafeInteger(range.endPage)
      || range.startPage < 1 || range.endPage < range.startPage
      || range.endPage - range.startPage >= LITERATURE_STUDY_LIMITS.pagesPerPaper)) {
    throw new LiteraturePdfError(`请输入连续的有效页码，每次最多读取 ${LITERATURE_STUDY_LIMITS.pagesPerPaper} 页。`);
  }

  const lifetime = new AbortController();
  const abort = () => lifetime.abort(signal.reason);
  const cancellation = new Promise<never>((_, reject) => {
    lifetime.signal.addEventListener('abort', () => reject(lifetime.signal.reason), { once: true });
  });
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => lifetime.abort(new LiteraturePdfError('读取 PDF 超时，请缩小页码范围后重试。')), 60_000);
  let task: PDFDocumentLoadingTask | undefined;
  let port: Worker | undefined;
  let worker: PDFWorker | undefined;

  async function extract(): Promise<StudyPaper> {
    const data = await file.arrayBuffer();
    lifetime.signal.throwIfAborted();
    if (!/%PDF-\d\.\d/u.test(new TextDecoder().decode(data.slice(0, 1024)))) {
      throw new LiteraturePdfError('无法识别 PDF 文件，请选择有效的 PDF 原文。');
    }
    // PDF.js transfers the buffer to its worker. Hash the original bytes first.
    const [digest, pdfjs] = await Promise.all([crypto.subtle.digest('SHA-256', data), import('pdfjs-dist/legacy/build/pdf.mjs')]);
    lifetime.signal.throwIfAborted();
    const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    // Both legacy modules include the compatibility shims needed by the message protocol.
    const workerUrl = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url);
    port = new Worker(workerUrl, { type: 'module' });
    port.addEventListener('error', () => lifetime.abort(new LiteraturePdfError('PDF 读取组件加载失败，请重试。')), { once: true });
    worker = pdfjs.PDFWorker.create({ port, verbosity: pdfjs.VerbosityLevel.ERRORS });
    task = pdfjs.getDocument({
      data, worker, stopAtErrors: true, enableXfa: false,
      disableRange: true, disableStream: true, disableAutoFetch: true, useWorkerFetch: false,
      useWasm: false, disableFontFace: true, useSystemFonts: false, maxImageSize: 0,
    });
    const pdf = await task.promise;
    lifetime.signal.throwIfAborted();
    const pageCount = pdf.numPages;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new LiteraturePdfError('PDF 页数无效。');
    if (range && range.endPage > pageCount) throw new LiteraturePdfError(`该 PDF 共 ${pageCount} 页，请调整结束页码。`);
    const startPage = range?.startPage ?? 1;
    const endPage = range?.endPage ?? Math.min(pageCount, LITERATURE_STUDY_LIMITS.pagesPerPaper);
    const pages: StudyPaper['pages'] = [];
    const encoder = new TextEncoder();
    let bytes = 0;
    for (let number = startPage; number <= endPage; number++) {
      const page = await pdf.getPage(number);
      try {
        lifetime.signal.throwIfAborted();
        const text = await readPageText(page, number, lifetime.signal);
        if (!/[^\s\p{Cc}\uFFFD]/u.test(text)) continue;
        if (/\p{Cc}/u.test(text.replaceAll('\n', ''))) {
          throw new LiteraturePdfError(`PDF 第 ${number} 页含不可读的控制字符。请选择其他页码范围或重新导出 PDF。`);
        }
        bytes += encoder.encode(text).byteLength;
        if (bytes > LITERATURE_PDF_LIMITS.textBytes) {
          throw new LiteraturePdfError('所选 PDF 页的文字超过 180 KiB，请缩小页码范围后重试。');
        }
        pages.push({ page: number, text });
      } finally {
        page.cleanup();
      }
    }
    if (!pages.length) throw new LiteraturePdfError('所选 PDF 页没有可读文字，请选择含文字层的 PDF 或其他页码范围。');
    return { id, title, filename, pageCount, pages };
  }

  try {
    return await Promise.race([extract(), cancellation]);
  } catch (error) {
    if (lifetime.signal.aborted || error instanceof LiteraturePdfError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new LiteraturePdfError('PDF 受密码保护，请选择可直接读取的原文。');
    }
    throw new LiteraturePdfError('PDF 无法读取，请检查文件是否损坏或文字层是否可用。');
  } finally {
    try {
      if (task) await Promise.race([task.destroy().catch(() => undefined), cancellation]);
    } finally {
      worker?.destroy();
      port?.terminate();
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}
