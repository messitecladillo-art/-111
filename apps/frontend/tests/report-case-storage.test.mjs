import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { CASE_REPORT_LIMITS, CaseReportStorageError, assertCaseReportBytes, assertCaseReportCapacity, identifyCaseReport, caseReportSha256, saveCaseReport, loadCaseReport, loadCaseReportCover, availableCaseReportIds } from '../lib/case-report-storage.ts';
import { casePdfOptions, CASE_PDF_PIXELS } from '../components/cases/case-pdf.ts';

const bytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const blob = new Blob([bytes], { type: 'application/pdf' });
const reference = { id: 'case-1', title: 'Original report', filename: 'original.pdf', sha256: createHash('sha256').update(bytes).digest('hex'), pages: 1, bytes: bytes.length };

test('full-resolution report scans survive decoding while output canvases remain bounded', () => {
  const options = casePdfOptions(new ArrayBuffer(0));
  // Measured XObjects from three original reports, including the education appendix.
  for (const [width, height] of [[2481, 3508], [2480, 3508], [3678, 5312]]) {
    assert.ok(width * height <= options.maxImageSize, `${width}x${height} source image must not be silently dropped`);
  }
  assert.ok(options.maxImageSize <= 32_000_000);
  assert.equal(CASE_PDF_PIXELS, 8_000_000);
  assert.equal(options.canvasMaxAreaInBytes, CASE_PDF_PIXELS * 4);
});

test('report identification uses the exact content digest, never filename or MIME', async () => {
  assert.equal(await caseReportSha256(bytes), reference.sha256);
  assert.equal((await identifyCaseReport(new File([bytes], 'different-name.dat', { type: 'text/plain' }), [reference])).id, reference.id);
  const changed = new File([new TextEncoder().encode('%PDF-1.7\nchanged content\n%%EOF')], reference.filename, { type: 'application/pdf' });
  await assert.rejects(identifyCaseReport(changed, [reference]), error => error.code === 'unknown');
  await assert.rejects(identifyCaseReport(blob, [{ ...reference, bytes: reference.bytes + 1 }]), error => error.code === 'catalog');
  await assert.rejects(identifyCaseReport(blob, [reference, { ...reference, id: 'ambiguous' }]), error => error.code === 'catalog');
});
test('empty, oversized, disguised and truncated PDFs are rejected before persistence', async () => {
  await assert.rejects(identifyCaseReport(new Blob(), [reference]), error => error.code === 'size');
  await assert.rejects(identifyCaseReport({ size: CASE_REPORT_LIMITS.fileBytes + 1, arrayBuffer() { throw Error('must not allocate'); } }, [reference]), error => error.code === 'size');
  assert.throws(() => assertCaseReportBytes(new TextEncoder().encode('<html>not a PDF</html>')), error => error.code === 'signature');
  assert.throws(() => assertCaseReportBytes(bytes.subarray(0, bytes.length - 7)), error => error.code === 'signature');
  assert.doesNotThrow(() => assertCaseReportBytes(bytes));
});
test('capacity counts replacement once and includes extra cached assets', () => {
  assert.doesNotThrow(() => assertCaseReportCapacity(CASE_REPORT_LIMITS.totalBytes, 500, 500));
  assert.throws(() => assertCaseReportCapacity(CASE_REPORT_LIMITS.totalBytes, 500, 501), error => error.code === 'capacity');
  assert.throws(() => assertCaseReportCapacity(20, 21, 2), error => error.code === 'storage');
  assert.throws(() => assertCaseReportCapacity(NaN, 0, 2), error => error.code === 'storage');
});

// A deterministic transaction boundary for commit/abort behavior; native IndexedDB is covered by the browser check.
function memoryDatabase({ quota = false } = {}) {
  const values = new Map();
  const factory = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction() {
        let aborted = false;
        const pending = [];
        const transaction = { error: null, abort() { aborted = true; queueMicrotask(() => transaction.onabort?.()); }, objectStore() { return {
          getAll() { const read = {}; queueMicrotask(() => { read.result = [...values.values()]; read.onsuccess?.(); queueMicrotask(() => { if (!aborted) { pending.forEach(([key, value]) => values.set(key, value)); transaction.oncomplete?.(); } }); }); return read; },
          get(id) { const read = {}; queueMicrotask(() => { read.result = values.get(id); read.onsuccess?.(); queueMicrotask(() => { if (!aborted) transaction.oncomplete?.(); }); }); return read; },
          put(value) { if (quota) throw new DOMException('full', 'QuotaExceededError'); pending.push([value.id, value]); },
        }; } };
        return transaction;
      } };
      request.onsuccess?.();
    });
    return request;
  } };
  return { factory, values };
}
async function withDatabase(factory, action) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });
  try { return await action(); } finally { if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor); else delete globalThis.indexedDB; }
}
test('committed originals and covers reload; replacement is idempotent and stale digest is unavailable', async () => {
  const { factory, values } = memoryDatabase();
  await withDatabase(factory, async () => {
    assert.deepEqual(await availableCaseReportIds([reference]), []);
    assert.equal(await loadCaseReport(reference), null);
    const cover = new Blob(['png-cache'], { type: 'image/png' });
    await assert.rejects(saveCaseReport(blob, [reference], { pages: 2, cover }), error => error.code === 'pages');
    assert.equal(values.size, 0);
    await saveCaseReport(blob, [reference], { pages: 1, cover });
    await saveCaseReport(blob, [reference], { pages: 1, cover });
    assert.equal(values.size, 1);
    assert.deepEqual(await availableCaseReportIds([reference]), [reference.id]);
    assert.deepEqual(new Uint8Array(await (await loadCaseReport(reference)).arrayBuffer()), bytes);
    assert.equal((await loadCaseReportCover(reference)).size, cover.size);
    const stale = { ...reference, sha256: '0'.repeat(64) };
    assert.deepEqual(await availableCaseReportIds([stale]), []);
    await assert.rejects(loadCaseReport(stale), error => error.code === 'mismatch');
    values.get(reference.id).blob = new Blob(['%PDF-1.7\ntampered content with the same size'.padEnd(bytes.length - 7, ' ') + '\n%%EOF\n']);
    await assert.rejects(loadCaseReport(reference), CaseReportStorageError);
  });
});
test('unavailable and failed IndexedDB access are explicit; quota failure never reports a stored file', async () => {
  await withDatabase(undefined, async () => { await assert.rejects(availableCaseReportIds([reference]), error => error.code === 'unavailable'); });
  const failed = { open() { const request = {}; queueMicrotask(() => { request.error = new DOMException('denied', 'SecurityError'); request.onerror?.(); }); return request; } };
  await withDatabase(failed, async () => { await assert.rejects(availableCaseReportIds([reference]), error => error.code === 'storage'); });
  const { factory, values } = memoryDatabase({ quota: true });
  await withDatabase(factory, async () => {
    await assert.rejects(saveCaseReport(blob, [reference]), error => error.code === 'quota');
    assert.equal(values.size, 0);
  });
});

const tick = () => new Promise(resolve => setImmediate(resolve));
function readerHarness({ missing = false, prepare = async () => ({ pages: 20 }) } = {}) {
  const slots = [], pendingEffects = new Map(), counters = { loads: 0, documents: 0, destroys: 0, saves: 0 };
  let cursor = 0, tree, props, rendering = false, rerender = false;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(value, slots[index])) { slots[index] = value; if (rendering) rerender = true; } }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  };
  for (const name of ['useEffect', 'useLayoutEffect']) hooks[name] = (effect, deps) => { const index = cursor++, previous = slots[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) pendingEffects.set(index, { effect, deps, previous }); };
  const jsx = (type, values) => ({ type, props: values ?? {} });
  const modules = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/case-report-storage': { loadCaseReport: async () => { counters.loads++; return missing ? null : blob; }, identifyCaseReport: async () => reference, saveCaseReport: async () => { counters.saves++; } },
    './case-pdf': { CASE_PDF_PIXELS: 8_000_000, casePdfOptions: data => ({ data }), prepareCaseReportPdf: prepare, casePdfModule: async () => ({ AnnotationMode: { DISABLE: 0 }, getDocument() { counters.documents++; return { promise: Promise.resolve({ numPages: 20 }), async destroy() { counters.destroys++; } }; } }) },
    './CaseReportOriginals.module.css': {},
  };
  const output = ts.transpileModule(readFileSync(new URL('../components/cases/CaseReportReader.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => modules[name], URL: { createObjectURL: () => 'blob:local-report', revokeObjectURL() {} }, AbortController, window: { addEventListener() {}, removeEventListener() {} }, Blob, console });
  function render(next = props) {
    props = next; let passes = 0;
    do { cursor = 0; rerender = false; rendering = true; pendingEffects.clear(); tree = exports.default(props); rendering = false; assert.ok(++passes < 10, 'render state must settle'); } while (rerender);
    for (const [index, entry] of pendingEffects) { entry.previous?.cleanup?.(); slots[index] = { deps: entry.deps, cleanup: entry.effect() }; }
    pendingEffects.clear();
    return tree;
  }
  function nodes(node, result = []) { if (!node || typeof node !== 'object') return result; if (Array.isArray(node)) { node.forEach(child => nodes(child, result)); return result; } result.push(node); nodes(node.props?.children, result); return result; }
  const find = predicate => { const value = nodes(tree).find(predicate); assert.ok(value, 'rendered node exists'); return value; };
  return { render, counters, find, button: text => find(node => node.type === 'button' && node.props.children === text), page: () => find(node => node.props?.['aria-label'] === '原报告页码').props.value };
}
test('reader manual page receipts allow returning to the same guide without reloading the PDF', async () => {
  const h = readerHarness(), selected = { ...reference, pages: 20 };
  let requested = 10;
  const props = () => ({ report: selected, initialPage: requested, onClose() {}, onPageChange: page => { requested = page; } });
  h.render(props()); await tick(); h.render(props());
  assert.equal(h.page(), '10');
  h.button('下一页').props.onClick(); h.render(props());
  assert.equal(requested, 11); assert.equal(h.page(), '11');
  requested = 10; h.render(props());
  assert.equal(h.page(), '10');
  h.render(props()); assert.equal(h.page(), '10');
  assert.equal(h.counters.loads, 1); assert.equal(h.counters.documents, 1); assert.equal(h.counters.destroys, 0);
});
test('reader import disables reload, fences old completion and resets controls across document keys', async () => {
  const attempts = [];
  const h = readerHarness({ missing: true, prepare: (_file, signal) => new Promise((resolve, reject) => { attempts.push({ signal, resolve, reject }); }) });
  const a = { ...reference, pages: 20 }, b = { ...a, id: 'case-2' }, file = new File([bytes], 'original.pdf');
  const props = report => ({ report, onClose() {} });
  const begin = () => h.find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file], value: 'original.pdf' } });
  h.render(props(a)); await tick(); h.render(); begin(); await tick(); h.render();
  assert.equal(h.button('重新读取').props.disabled, true);
  h.button('重新读取').props.onClick(); h.render();
  assert.equal(h.counters.loads, 1, 'even a captured retry callback cannot reload during import');
  h.render(props(b)); await tick(); h.render();
  assert.equal(attempts[0].signal.aborted, true);
  assert.equal(h.button('重新读取').props.disabled, false);
  assert.equal(h.button('重新导入 PDF').props.disabled, false);
  h.render(props(a)); await tick(); h.render();
  assert.equal(h.button('重新导入 PDF').props.disabled, false, 'returning to an earlier key must not revive its busy flag');
  begin(); await tick(); h.render();
  attempts[0].resolve({ pages: 20 }); await tick(); h.render();
  assert.equal(h.button('正在导入…').props.disabled, true, 'old completion cannot clear the new import lease');
  assert.equal(h.counters.saves, 0, 'cancelled file cannot reach storage');
  attempts[1].reject(Error('invalid PDF')); await tick(); h.render();
  assert.equal(h.button('重新读取').props.disabled, false); assert.equal(h.button('重新导入 PDF').props.disabled, false);
});
