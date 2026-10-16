'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { createKnowledgeOcr, inspectImageDimensions, boundedCanvasDimensions, KNOWLEDGE_RECOGNITION_LIMITS as LIMITS } from '@/lib/knowledge-recognition';
import type { KnowledgeSearchHit } from '@/lib/knowledge/types';
import styles from './Knowledge.module.css';

type DocumentSource = { name: string; pdf?: PDFDocumentProxy; image?: ImageBitmap };
/** Files stay inside this browser. Text extraction precedes OCR; cancellation fences every await. */
export default function KnowledgeRecognition({ recognize, onChoose, embedded = false }: {
  recognize: (text: string) => Promise<KnowledgeSearchHit[]>; onChoose: (id: string) => void; embedded?: boolean;
}) {
  const [source, setSource] = useState<DocumentSource | null>(null), [page, setPage] = useState(1), [text, setText] = useState(''), [hits, setHits] = useState<KnowledgeSearchHit[]>([]);
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), epoch = useRef(0), candidateEpoch = useRef(0), worker = useRef<ReturnType<typeof createKnowledgeOcr> | null>(null), loading = useRef<PDFDocumentLoadingTask | null>(null), rendering = useRef<RenderTask | null>(null);
  const sourceRef = useRef<DocumentSource | null>(null), alive = useRef(true), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    epoch.current++; candidateEpoch.current++; if (timer.current) clearTimeout(timer.current); timer.current = null;
    if (!sourceRef.current && loading.current) { void loading.current.destroy().catch(() => undefined); loading.current = null; }
    rendering.current?.cancel(); rendering.current = null;
    const current = worker.current; worker.current = null; current?.terminate();
    if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; }
    setBusy(false);
  };
  useEffect(() => {
    alive.current = true;
    const fence = epoch;
    return () => { alive.current = false; fence.current++; if (timer.current) clearTimeout(timer.current); rendering.current?.cancel(); worker.current?.terminate(); void loading.current?.destroy().catch(() => undefined); sourceRef.current?.image?.close(); };
  }, []);
  useEffect(() => { const hide = () => { if (document.hidden) stop(); }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide); }, []);
  async function loadFile(file: File | undefined) {
    if (!file) return;
    stop(); const token = epoch.current;
    void loading.current?.destroy().catch(() => undefined); loading.current = null;
    sourceRef.current?.image?.close(); sourceRef.current = null;
    setSource(null); setText(''); setHits([]); setError('');
    try {
      if (!file.size || file.size > LIMITS.bytes) throw Error('请选择不超过 20 MiB 的 PDF 或图片。');
      setBusy(true); setStatus('正在读取文件…');
      timer.current = setTimeout(() => { if (token === epoch.current) { stop(); setError('文件读取超过 60 秒，请重新选择。'); } }, LIMITS.timeout);
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const pdfjs = await import('pdfjs-dist'); if (token !== epoch.current) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const buffer = await file.arrayBuffer(); if (token !== epoch.current) return;
        const task = pdfjs.getDocument({ data: buffer, enableXfa: false, useWasm: false, useWorkerFetch: false, disableAutoFetch: true, disableStream: true, maxImageSize: LIMITS.pixels, canvasMaxAreaInBytes: LIMITS.pixels * 4 });
        loading.current = task; const pdf = await task.promise;
        if (token !== epoch.current) { void task.destroy(); return; }
        const next = { name: file.name, pdf }; sourceRef.current = next; setSource(next); setPage(1); setStatus(`共 ${pdf.numPages} 页，选择一页后识别。`);
      } else if (['image/png', 'image/jpeg', 'image/webp', 'image/bmp'].includes(file.type)) {
        // Inspect dimensions before decoding to avoid allocating an unbounded bitmap.
        const buffer = await file.arrayBuffer(); if (token !== epoch.current) return;
        inspectImageDimensions(new Uint8Array(buffer));
        const image = await createImageBitmap(file); if (token !== epoch.current) { image.close(); return; }
        if (image.width * image.height > LIMITS.pixels) { image.close(); throw Error('图片超过 800 万像素，请先裁剪要识别的区域。'); }
        const next = { name: file.name, image }; sourceRef.current = next; setSource(next); setPage(1); setStatus('图片已就绪，点击识别。');
      } else throw Error('请选择 PDF、PNG、JPEG、WebP 或 BMP 文件。');
    } catch (cause) { if (token === epoch.current) setError(cause instanceof Error ? cause.message : '文件读取失败。'); }
    finally { if (token === epoch.current) { if (timer.current) clearTimeout(timer.current); timer.current = null; setBusy(false); } }
  }
  async function identify(forceOcr = false) {
    if (!source || busy) return;
    stop(); const token = epoch.current; setBusy(true); setError(''); setText(''); setHits([]);
    timer.current = setTimeout(() => { if (token === epoch.current) { stop(); setError('本页识别超过 60 秒，请裁剪区域后重试。'); } }, LIMITS.timeout);
    const valid = () => alive.current && token === epoch.current;
    let created: ReturnType<typeof createKnowledgeOcr> | null = null;
    try {
      let content = '';
      if (source.pdf && !forceOcr) {
        setStatus('正在提取本页文字…');
        const pdfPage = await source.pdf.getPage(page); if (!valid()) return; const extracted = await pdfPage.getTextContent();
        if (!valid()) return;
        for (const item of extracted.items) { if ('str' in item) content += item.str.slice(0, LIMITS.text - content.length) + ' '; if (content.length >= LIMITS.text) break; }
        content = content.slice(0, LIMITS.text);
        pdfPage.cleanup();
      }
      if (!content.trim()) {
        if (!canvas.current) throw Error('页面画布尚未就绪。');
        const target = canvas.current;
        if (source.pdf) {
          const pdfPage = await source.pdf.getPage(page); if (!valid()) return;
          const natural = pdfPage.getViewport({ scale: 1 }); const bounds = boundedCanvasDimensions(natural.width, natural.height);
          const viewport = pdfPage.getViewport({ scale: bounds.scale }); target.width = bounds.width; target.height = bounds.height;
          const task = pdfPage.render({ canvas: target, viewport, annotationMode: 0, background: '#fff' }); rendering.current = task; await task.promise; rendering.current = null; pdfPage.cleanup();
        } else if (source.image) {
          target.width = source.image.width; target.height = source.image.height; target.getContext('2d')?.drawImage(source.image, 0, 0);
        }
        if (!valid()) return;
        setStatus('正在加载中文与英文识别器…');
        created = createKnowledgeOcr({ onProgress: event => { if (valid()) setStatus(event.status === 'recognizing text' ? `正在识别本页 · ${Math.round(event.progress * 100)}%` : '正在准备本地识别器…'); } });
        worker.current = created;
        await created.ready; if (!valid()) return;
        content = await created.recognize(target); if (!valid()) return;
      }
      setText(content); setStatus(content.trim() ? '文字已读取，可以校正后提取概念。' : '本页没有识别到文字，可换页或裁剪清晰区域。');
      const candidateToken = ++candidateEpoch.current;
      const candidates = await recognize(content); if (valid() && candidateToken === candidateEpoch.current) setHits(candidates);
    } catch (cause) { if (valid()) setError(cause instanceof Error ? cause.message : '本页识别失败，请重试。'); }
    finally {
      if (created) { if (worker.current === created) worker.current = null; created.terminate(); }
      if (canvas.current && valid()) { canvas.current.width = 0; canvas.current.height = 0; }
      if (valid()) { if (timer.current) clearTimeout(timer.current); timer.current = null; setBusy(false); }
    }
  }
  function recheck() {
    const token = ++candidateEpoch.current;
    void recognize(text).then(result => { if (alive.current && token === candidateEpoch.current) setHits(result); }).catch(() => { if (alive.current && token === candidateEpoch.current) setError('概念检索未完成，请重试。'); });
  }
  const content = <>
    <label className={styles.fileInput}>选择文件<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp" onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }}/></label>
    {busy && !source && <button onClick={() => { stop(); void loading.current?.destroy().catch(() => undefined); setStatus('已取消读取。'); }}>取消读取</button>}
    {source && <><p>{source.name}</p>{source.pdf && <div className={styles.pageControls}><button disabled={page <= 1} onClick={() => { stop(); setPage(value => value - 1); setText(''); setHits([]); }}>←</button><span>第 {page} / {source.pdf.numPages} 页</span><button disabled={page >= source.pdf.numPages} onClick={() => { stop(); setPage(value => value + 1); setText(''); setHits([]); }}>→</button></div>}<div className={styles.entryActions}><button disabled={busy} onClick={() => void identify()}>识别这一页</button>{source.pdf && <button disabled={busy} onClick={() => void identify(true)}>按扫描页识别</button>}{busy && <button onClick={() => { stop(); setStatus('已取消识别。'); }}>取消</button>}</div></>}
    <canvas ref={canvas} hidden/>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
    {text && <><label>校正识别文字<textarea aria-label="校正识别文字" value={text} onChange={event => { candidateEpoch.current++; setText(event.target.value); }} maxLength={12000}/></label><button disabled={busy} onClick={() => recheck()}>重新提取概念</button></>}
    {hits.map(hit => <button className={styles.result} key={hit.entry.id} onClick={() => onChoose(hit.entry.id)}>{hit.entry.name} · {hit.entry.englishName}</button>)}
  </>;
  return embedded ? <section aria-label="本地文件识别">{content}</section> : <details className={styles.recognition} onToggle={event => { if (!event.currentTarget.open) { stop(); setStatus('已取消识别。'); } }}><summary>识别本地 PDF 或图片</summary>{content}</details>;
}
