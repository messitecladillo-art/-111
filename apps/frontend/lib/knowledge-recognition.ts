/** Bounded headers are checked before decoding an untrusted local image. */
export const KNOWLEDGE_RECOGNITION_LIMITS = { bytes: 20 * 1024 * 1024, pixels: 8_000_000, dimension: 8192, timeout: 60_000, text: 12000 } as const;
function checked(width: number, height: number) {
  const limits = KNOWLEDGE_RECOGNITION_LIMITS;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > limits.dimension || height > limits.dimension || width * height > limits.pixels) throw Error('图片超过 800 万像素或边长 8192，请先裁剪要识别的区域。');
  return { width, height };
}
export function inspectImageDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || bytes.length > KNOWLEDGE_RECOGNITION_LIMITS.bytes) throw Error('图片文件不完整或超过 20 MiB。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, count: number) => String.fromCharCode(...bytes.subarray(at, at + count));
  if ([137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value) && ascii(12, 4) === 'IHDR') return checked(view.getUint32(16), view.getUint32(20));
  if (ascii(0, 2) === 'BM' && bytes.length >= 26) {
    const dib = view.getUint32(14, true);
    if (dib === 12) return checked(view.getUint16(18, true), view.getUint16(20, true));
    if (dib >= 40) return checked(view.getInt32(18, true), Math.abs(view.getInt32(22, true)));
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = ascii(offset, 4), size = view.getUint32(offset + 4, true), data = offset + 8;
      if (size > bytes.length - data) throw Error('WebP 文件不完整。');
      const uint24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
      if (type === 'VP8X' && size >= 10) return checked(uint24(data + 4) + 1, uint24(data + 7) + 1);
      if (type === 'VP8L' && size >= 5 && bytes[data] === 0x2f) { const bits = view.getUint32(data + 1, true); return checked((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1); }
      if (type === 'VP8 ' && size >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 1 && bytes[data + 5] === 0x2a) return checked(view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff);
      offset = data + size + (size & 1);
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) throw Error('JPEG 文件结构无效。');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || size > bytes.length - offset) throw Error('JPEG 文件不完整。');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) return checked(view.getUint16(offset + 5), view.getUint16(offset + 3));
      offset += size;
    }
  }
  throw Error('无法读取图片尺寸，请转换为 PNG 或 JPEG 后重试。');
}
export function boundedCanvasDimensions(width: number, height: number, maxScale = 2) {
  const limits = KNOWLEDGE_RECOGNITION_LIMITS;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(width * height) || width <= 0 || height <= 0 || !Number.isFinite(maxScale) || maxScale <= 0) throw Error('页面尺寸无效。');
  const scale = Math.min(maxScale, limits.dimension / width, limits.dimension / height, Math.sqrt(limits.pixels / (width * height)));
  if (!Number.isFinite(scale) || scale <= 0) throw Error('页面尺寸无效。');
  const pixelWidth = Math.max(1, Math.floor(width * scale)), pixelHeight = Math.max(1, Math.floor(height * scale));
  return { ...checked(pixelWidth, pixelHeight), scale };
}

type Progress = { status: string; progress: number };
type WorkerResponse = { workerId: string; jobId: string; action: string; status: 'progress' | 'resolve' | 'reject'; data: unknown };
type Handle = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener'>;
/** Adapter pinned to Tesseract.js 7's audited worker protocol. Own handle exists before initialization. */
export function createKnowledgeOcr({ onProgress, workerFactory }: { onProgress?: (event: Progress) => void; workerFactory?: () => Handle } = {}) {
  const workerId = 'evix-ocr-7', worker = workerFactory ? workerFactory() : new Worker('/knowledge-assets/tesseract-7.0.0/worker.min.js', { name: workerId });
  let disposed = false, sequence = 0;
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const terminate = () => { if (disposed) return; disposed = true; worker.terminate(); for (const item of pending.values()) item.reject(new DOMException('已取消识别。', 'AbortError')); pending.clear(); };
  worker.addEventListener('message', ((event: MessageEvent<WorkerResponse>) => {
    if (disposed || event.data?.workerId !== workerId) return;
    const message = event.data, key = `${message.action}:${message.jobId}`, request = pending.get(key);
    if (!request) return;
    if (message.status === 'progress') { const data = message.data as Progress; if (typeof data?.status === 'string' && Number.isFinite(data.progress)) onProgress?.({ status: data.status, progress: Math.max(0, Math.min(1, data.progress)) }); return; }
    pending.delete(key);
    if (message.status === 'resolve') request.resolve(message.data); else request.reject(Error('本地识别器未能完成处理，请重试。'));
  }) as EventListener);
  worker.addEventListener('error', () => { for (const item of pending.values()) item.reject(Error('本地识别器加载失败，请重新识别。')); pending.clear(); terminate(); });
  function job(action: string, payload: unknown) {
    if (disposed) return Promise.reject(new DOMException('已取消识别。', 'AbortError'));
    const jobId = `ocr-${++sequence}`;
    return new Promise<unknown>((resolve, reject) => { pending.set(`${action}:${jobId}`, { resolve, reject }); try { worker.postMessage({ workerId, jobId, action, payload }); } catch (error) { pending.delete(`${action}:${jobId}`); reject(error instanceof Error ? error : Error('识别请求未发送。')); } });
  }
  const ready = job('load', { options: { lstmOnly: true, corePath: '/knowledge-assets/tesseract-7.0.0/', logging: false } })
    .then(() => job('loadLanguage', { langs: ['chi_sim', 'eng'], options: { langPath: '/knowledge-assets/tesseract-7.0.0/lang', cachePath: 'evix-knowledge-ocr-v7', cacheMethod: 'write', gzip: true, lstmOnly: true } }))
    .then(() => job('initialize', { langs: 'chi_sim+eng', oem: 1, config: {} }));
  // Consumers await ready, but cancellation may happen before the caller can attach its handler.
  void ready.catch(() => undefined);
  return { ready, terminate, async recognize(canvas: HTMLCanvasElement): Promise<string> {
    await ready; if (disposed) throw new DOMException('已取消识别。', 'AbortError');
    checked(canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('页面图像无法读取。')), 'image/png'));
    if (disposed) throw new DOMException('已取消识别。', 'AbortError');
    const image = new Uint8Array(await blob.arrayBuffer());
    const result = await job('recognize', { image, options: {}, output: { text: true } }) as { text?: unknown };
    return typeof result.text === 'string' ? result.text.slice(0, KNOWLEDGE_RECOGNITION_LIMITS.text) : '';
  } };
}
