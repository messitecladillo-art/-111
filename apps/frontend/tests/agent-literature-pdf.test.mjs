import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker as Thread } from 'node:worker_threads';
import { LITERATURE_PDF_LIMITS, readLiteraturePdf } from '../lib/agent/literature-pdf.ts';

const pdfWorker = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

function withWorker(t, Worker) {
  const original = globalThis.Worker;
  globalThis.Worker = Worker;
  t.after(() => { globalThis.Worker = original; });
}

// Run the installed worker and its real transferable message protocol against a synthetic PDF.
class WorkerPort extends EventTarget {
  constructor(url, options) {
    super();
    assert.match(url.pathname, /pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs$/);
    assert.deepEqual(options, { type: 'module' });
    const bootstrap = `
      import { parentPort } from 'node:worker_threads';
      import { WorkerMessageHandler } from ${JSON.stringify(pdfWorker)};
      const port = new EventTarget();
      port.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
      parentPort.on('message', data => port.dispatchEvent(new MessageEvent('message', { data })));
      WorkerMessageHandler.initializeFromPort(port);
    `;
    this.thread = new Thread(new URL('data:text/javascript,' + encodeURIComponent(bootstrap)));
    this.thread.on('message', data => this.dispatchEvent(new MessageEvent('message', { data })));
    this.thread.on('error', () => this.dispatchEvent(new Event('error')));
  }
  postMessage(data, transfer) { this.thread.postMessage(data, transfer); }
  terminate() { void this.thread.terminate(); }
}

function syntheticPdf(pageStreams, filename = 'Synthetic research paper.pdf', unicodeMap = '') {
  const pageIds = pageStreams.map((_, index) => 4 + index * 2);
  const unicodeRef = unicodeMap ? ` /ToUnicode ${4 + pageStreams.length * 2} 0 R` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica${unicodeRef} >>`,
  ];
  for (const [index, stream] of pageStreams.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 60000 800] /Contents ${pageIds[index] + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  if (unicodeMap) objects.push(`<< /Length ${unicodeMap.length} >>\nstream\n${unicodeMap}\nendstream`);
  let bytes = '%PDF-1.4\n';
  const offsets = ['0000000000 65535 f \n'];
  for (const [index, object] of objects.entries()) {
    offsets.push(`${String(bytes.length).padStart(10, '0')} 00000 n \n`);
    bytes += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const startxref = bytes.length;
  bytes += `xref\n0 ${offsets.length}\n${offsets.join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return new File([bytes], filename, { type: 'application/pdf' });
}

const textStream = (...lines) => `BT /F1 12 Tf 50 700 Td 16 TL ${lines.map(line => `(${line}) Tj`).join(' T* ')} ET`;

test('the real worker reads local text in page order with the source hash and physical page numbers', { timeout: 10_000 }, async t => {
  withWorker(t, WorkerPort);
  const file = syntheticPdf([textStream('First   line', 'Second line'), '', textStream('Third page')]);
  const expectedId = createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex');
  const signal = new AbortController().signal;
  const all = await readLiteraturePdf(file, signal);
  assert.deepEqual(all, {
    id: expectedId, filename: file.name, title: 'Synthetic research paper', pageCount: 3,
    pages: [{ page: 1, text: 'First line\nSecond line' }, { page: 3, text: 'Third page' }],
  });
  assert.deepEqual(await readLiteraturePdf(file, signal, { startPage: 3, endPage: 3 }), { ...all, pages: all.pages.slice(1) });
  await assert.rejects(readLiteraturePdf(file, signal, { startPage: 2, endPage: 2 }), /没有可读文字/u);
  await assert.rejects(readLiteraturePdf(file, signal, { startPage: 3, endPage: 4 }), /共 3 页/u);
});

test('the real worker extracts Chinese text from an embedded Unicode map', { timeout: 10_000 }, async t => {
  withWorker(t, WorkerPort);
  const unicodeMap = 'begincmap\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n'
    + '4 beginbfchar\n<61> <7814>\n<62> <7A76>\n<63> <65B9>\n<64> <6CD5>\nendbfchar\nendcmap';
  const file = syntheticPdf([textStream('ab', 'cd')], '合成文字层.pdf', unicodeMap);
  const paper = await readLiteraturePdf(file, new AbortController().signal);
  assert.equal(paper.title, '合成文字层');
  assert.deepEqual(paper.pages, [{ page: 1, text: '研究\n方法' }]);
});

test('the real worker reads at most 50 default pages and reports complete-page capacity errors', { timeout: 15_000 }, async t => {
  withWorker(t, WorkerPort);
  const signal = new AbortController().signal;
  const many = syntheticPdf(Array.from({ length: 51 }, (_, index) => textStream(`Page ${index + 1}`)));
  const result = await readLiteraturePdf(many, signal);
  assert.equal(result.pageCount, 51);
  assert.equal(result.pages.length, 50);
  assert.deepEqual((await readLiteraturePdf(many, signal, { startPage: 51, endPage: 51 })).pages, [{ page: 51, text: 'Page 51' }]);

  const oversizedPage = syntheticPdf([textStream('a'.repeat(8_001))]);
  await assert.rejects(readLiteraturePdf(oversizedPage, signal), /第 1 页文字超过 8000 字符/u);
  const oversizedRange = syntheticPdf(Array(24).fill(textStream('a'.repeat(8_000))));
  await assert.rejects(readLiteraturePdf(oversizedRange, signal), /文字超过 180 KiB/u);
  const subset = await readLiteraturePdf(oversizedRange, signal, { startPage: 1, endPage: 2 });
  assert.deepEqual(subset.pages.map(page => page.text.length), [8_000, 8_000]);
});

test('invalid inputs are rejected before any worker starts and abort terminates an unresponsive worker', { timeout: 10_000 }, async t => {
  const started = Promise.withResolvers();
  let launches = 0;
  let terminates = 0;
  withWorker(t, class extends EventTarget {
    constructor() { super(); launches++; }
    postMessage(data) { if (data.action === 'GetDocRequest') started.resolve(); }
    terminate() { terminates++; }
  });
  const controller = new AbortController();
  const file = syntheticPdf([textStream('Local evidence')]);
  await assert.rejects(readLiteraturePdf(new File(['not a PDF'], 'bad.pdf'), controller.signal), /无法识别 PDF/u);
  await assert.rejects(readLiteraturePdf(new File([new Uint8Array(LITERATURE_PDF_LIMITS.fileBytes + 1)], 'large.pdf'), controller.signal), /20 MiB/u);
  await assert.rejects(readLiteraturePdf(file, controller.signal, { startPage: 1, endPage: 51 }), /最多读取 50 页/u);
  assert.equal(launches, 0);

  const pending = readLiteraturePdf(file, controller.signal);
  await started.promise;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(launches, 1);
  assert.equal(terminates, 1);
  await assert.rejects(readLiteraturePdf(file, controller.signal), { name: 'AbortError' });
  assert.equal(launches, 1);
});
