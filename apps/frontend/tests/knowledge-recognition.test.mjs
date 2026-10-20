import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectImageDimensions, boundedCanvasDimensions, createKnowledgeOcr, KNOWLEDGE_RECOGNITION_LIMITS as LIMITS } from '../lib/knowledge-recognition.ts';

function png(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set(Buffer.from('IHDR'), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

function jpeg(width, height, marker = 0xc0, appFirst = true) {
  // SOI, optional APP0, an actual SOF segment with one component, EOI.
  const prefix = appFirst ? [255, 216, 255, 224, 0, 6, 74, 70, 73, 70] : [255, 216];
  const frame = [255, marker, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0];
  const bytes = new Uint8Array(Math.max(24, prefix.length + frame.length + 2));
  bytes.set(prefix); bytes.set(frame, prefix.length); bytes.set([255, 217], prefix.length + frame.length);
  return bytes;
}

function bmp(width, height, dib = 40) {
  const bytes = new Uint8Array(54), view = new DataView(bytes.buffer);
  bytes.set(Buffer.from('BM')); view.setUint32(2, 54, true); view.setUint32(10, 54, true); view.setUint32(14, dib, true);
  if (dib === 12) { view.setUint16(18, width, true); view.setUint16(20, height, true); }
  else { view.setInt32(18, width, true); view.setInt32(22, height, true); }
  return bytes;
}

function webp(width, height, type) {
  const size = type === 'VP8L' ? 5 : 10;
  const bytes = new Uint8Array(20 + size + (size & 1)), view = new DataView(bytes.buffer);
  bytes.set(Buffer.from('RIFF')); view.setUint32(4, bytes.length - 8, true); bytes.set(Buffer.from('WEBP'), 8);
  bytes.set(Buffer.from(type), 12); view.setUint32(16, size, true);
  if (type === 'VP8X') {
    const put24 = (at, number) => { bytes[at] = number & 255; bytes[at + 1] = (number >>> 8) & 255; bytes[at + 2] = (number >>> 16) & 255; };
    put24(24, width - 1); put24(27, height - 1);
  } else if (type === 'VP8L') {
    bytes[20] = 0x2f; view.setUint32(21, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
  } else {
    bytes.set([0x9d, 1, 0x2a], 23); view.setUint16(26, width, true); view.setUint16(28, height, true);
  }
  return bytes;
}

test('independent image header gold: PNG/JPEG baseline and progressive/BMP top-down/WebP variants', () => {
  for (const bytes of [png(1280, 720), jpeg(1280, 720), jpeg(1280, 720, 0xc2),
    bmp(1280, 720), bmp(1280, -720), bmp(1280, 720, 12),
    webp(1280, 720, 'VP8X'), webp(1280, 720, 'VP8L'), webp(1280, 720, 'VP8 ')]) {
    assert.deepEqual(inspectImageDimensions(bytes), { width: 1280, height: 720 });
  }
  // Dimensions must be relative to the Uint8Array view, not backing-buffer offset.
  const framed = new Uint8Array(100); framed.set(png(900, 600), 17);
  assert.deepEqual(inspectImageDimensions(framed.subarray(17, 50)), { width: 900, height: 600 });
});

test('header preflight accepts exact pixel cap and rejects extreme aspect ratios before decode', () => {
  assert.deepEqual(inspectImageDimensions(png(4000, 2000)), { width: 4000, height: 2000 });
  assert.deepEqual(inspectImageDimensions(png(8192, 1)), { width: 8192, height: 1 });
  for (const bytes of [png(4001, 2000), png(8193, 1), png(1, 8193), png(0, 100),
    png(0xffffffff, 0xffffffff), jpeg(4001, 2000), bmp(-1, 720), bmp(1, -2147483648),
    webp(4001, 2000, 'VP8X'), webp(8193, 1, 'VP8L'), webp(1, 8193, 'VP8 ')]) {
    assert.throws(() => inspectImageDimensions(bytes));
  }
  assert.throws(() => inspectImageDimensions(new Uint8Array(LIMITS.bytes + 1)));
});

test('malformed/truncated signatures and segments do not become trusted dimensions', () => {
  const badPng = png(100, 100); badPng[4] = 0;
  assert.throws(() => inspectImageDimensions(badPng), 'The complete PNG signature is required');
  assert.throws(() => inspectImageDimensions(png(100, 100).subarray(0, 23)));
  const badJpeg = jpeg(100, 100); badJpeg[4] = 0xff; badJpeg[5] = 0xff;
  assert.throws(() => inspectImageDimensions(badJpeg));
  const badSegment = jpeg(100, 100); badSegment[4] = 0; badSegment[5] = 1;
  assert.throws(() => inspectImageDimensions(badSegment));
  const badWebp = webp(100, 100, 'VP8X'); new DataView(badWebp.buffer).setUint32(16, 1000, true);
  assert.throws(() => inspectImageDimensions(badWebp));
  assert.throws(() => inspectImageDimensions(new Uint8Array(24)));
});

test('PDF canvas gold stays within pixel/dimension bounds and has positive finite scale', () => {
  for (const [width, height] of [[595.28, 841.89], [12000, 12000], [1000000, 1], [1, 1000000], [100, 100]]) {
    const result = boundedCanvasDimensions(width, height);
    assert.ok(result.width >= 1 && result.height >= 1);
    assert.ok(result.width <= 8192 && result.height <= 8192);
    assert.ok(result.width * result.height <= 8000000);
    assert.ok(Number.isFinite(result.scale) && result.scale > 0 && result.scale <= 2);
  }
  for (const [width, height, scale] of [[NaN, 1, 2], [1, Infinity, 2], [0, 1, 2], [-1, 1, 2], [1, 1, NaN], [1, 1, 0], [1e308, 1e308, 2]]) {
    assert.throws(() => boundedCanvasDimensions(width, height, scale));
  }
  assert.equal(LIMITS.bytes, 20 * 1024 * 1024);
  assert.equal(LIMITS.timeout, 60000);
});

class FakeWorker {
  listeners = new Map(); messages = []; terminated = 0; auto = false; recognizedText = '置信区间 confidence interval';
  addEventListener(type, callback) { const list = this.listeners.get(type) ?? []; list.push(callback); this.listeners.set(type, list); }
  postMessage(message) {
    this.messages.push(structuredClone(message));
    if (this.auto) queueMicrotask(() => this.reply(message, 'resolve', message.action === 'recognize' ? { text: this.recognizedText } : {}));
  }
  terminate() { this.terminated++; }
  emit(type, event) { for (const callback of this.listeners.get(type) ?? []) callback(event); }
  reply(message, status, data, patch = {}) { this.emit('message', { data: { workerId: message.workerId, jobId: message.jobId, action: message.action, status, data, ...patch } }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('cancel owns native Worker immediately, including pending initialization and timeout dispatch', async () => {
  const worker = new FakeWorker(), client = createKnowledgeOcr({ workerFactory: () => worker });
  assert.equal(worker.messages[0].action, 'load');
  const rejected = assert.rejects(client.ready, error => error.name === 'AbortError');
  const timeout = setTimeout(() => client.terminate(), 5);
  await rejected; clearTimeout(timeout);
  assert.equal(worker.terminated, 1);
  client.terminate(); assert.equal(worker.terminated, 1);
  worker.reply(worker.messages[0], 'resolve', {}); await tick();
  assert.equal(worker.messages.length, 1, 'Late load success must not create a language job');
  await assert.rejects(client.recognize({ width: 100, height: 100 }), error => error.name === 'AbortError');
});

test('pinned worker protocol uses local assets, ordered initialization, bounded progress and ignores stale packets', async () => {
  const worker = new FakeWorker(), progress = [];
  const client = createKnowledgeOcr({ workerFactory: () => worker, onProgress: item => progress.push(item) });
  const load = worker.messages[0];
  assert.equal(load.payload.options.corePath, '/knowledge-assets/tesseract-7.0.0/');
  assert.equal(load.payload.options.lstmOnly, true);
  worker.reply(load, 'resolve', {}, { workerId: 'foreign-worker' });
  worker.reply(load, 'resolve', {}, { jobId: 'old-job' }); await tick();
  assert.equal(worker.messages.length, 1);
  worker.reply(load, 'progress', { status: 'loading', progress: Infinity });
  worker.reply(load, 'progress', { status: 'loading', progress: -5 });
  worker.reply(load, 'progress', { status: 'loading', progress: 9 });
  assert.deepEqual(progress, [{ status: 'loading', progress: 0 }, { status: 'loading', progress: 1 }]);
  worker.reply(load, 'resolve', {}); await tick();
  const language = worker.messages[1];
  assert.equal(language.action, 'loadLanguage');
  assert.deepEqual(language.payload.langs, ['chi_sim', 'eng']);
  assert.equal(language.payload.options.langPath, '/knowledge-assets/tesseract-7.0.0/lang');
  worker.reply(language, 'resolve', {}); await tick();
  assert.equal(worker.messages[2].action, 'initialize');
  assert.equal(worker.messages[2].payload.oem, 1);
  worker.reply(worker.messages[2], 'resolve', {}); await client.ready;
  client.terminate();
});

test('recognition sends bytes instead of URLs and returns only bounded text', async () => {
  const worker = new FakeWorker(); worker.auto = true;
  const client = createKnowledgeOcr({ workerFactory: () => worker });
  const fakeCanvas = { width: 100, height: 100, toBlob(callback, type) { assert.equal(type, 'image/png'); callback(new Blob([png(100, 100)])); } };
  assert.equal(await client.recognize(fakeCanvas), '置信区间 confidence interval');
  const request = worker.messages.find(item => item.action === 'recognize');
  assert.ok(request.payload.image instanceof Uint8Array);
  assert.deepEqual(request.payload.output, { text: true });
  assert.deepEqual(request.payload.options, {});
  assert.equal(request.payload.url, undefined);
  assert.equal(request.payload.query, undefined);
  worker.recognizedText = '统计'.repeat(20000);
  assert.equal((await client.recognize(fakeCanvas)).length, 12000);
  await assert.rejects(client.recognize({ width: 100, height: 100, toBlob(callback) { callback(null); } }), /图像无法读取/);
  client.terminate();
});

test('worker errors and malformed status reject pending jobs instead of displaying success', async () => {
  const malformed = new FakeWorker(), first = createKnowledgeOcr({ workerFactory: () => malformed });
  const rejected = assert.rejects(first.ready);
  malformed.reply(malformed.messages[0], 'unexpected', {}); await rejected; first.terminate();
  const broken = new FakeWorker(), second = createKnowledgeOcr({ workerFactory: () => broken });
  const errored = assert.rejects(second.ready, /加载失败/);
  broken.emit('error', {}); await errored;
  assert.equal(broken.terminated, 1);
});

test('cancellation while canvas encoding is pending never dispatches late image bytes', async () => {
  const worker = new FakeWorker(); worker.auto = true;
  const client = createKnowledgeOcr({ workerFactory: () => worker }); await client.ready;
  let encode;
  const result = client.recognize({ width: 100, height: 100, toBlob(callback) { encode = callback; } });
  const rejected = assert.rejects(result, error => error.name === 'AbortError');
  await tick(); client.terminate(); encode(new Blob([png(100, 100)])); await rejected;
  assert.equal(worker.messages.filter(item => item.action === 'recognize').length, 0);
});
