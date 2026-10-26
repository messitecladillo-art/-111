import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const reference = { id: 'report-a', title: 'Original report', filename: 'original.pdf', sha256: 'a'.repeat(64), pages: 20, bytes: 20 };
const tick = () => new Promise(resolve => setImmediate(resolve));
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < .01, `${actual} should equal ${expected}`);
const output = ts.transpileModule(readFileSync(new URL('../components/cases/CaseReportReader.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

// Exercise the actual component with controllable PDF promises and DOM measurements.
// Layout effects can commit before passive cleanup, matching the race that matters
// for receipts. Raster pixels and CSS layout remain browser acceptance checks.
function readerHarness({ autoRender = true, missing = false, dimensions = page => page === 2 ? [1200, 600] : [600, 900], devicePixelRatio = 2 } = {}) {
  const slots = [], scheduled = new Map(), renders = [], documents = [], receipts = [];
  const counters = { loads: 0, destroyed: 0, created: 0, revoked: 0, resizeDisconnected: 0, pageCleanups: 0 };
  let cursor = 0, tree, props = { report: reference, initialPage: 1, onClose() {}, onPageRendered: receipt => receipts.push(receipt), compact: true }, rerender = false, rendering = false, mounted = true, observer;
  const element = { clientWidth: 932, clientHeight: 632, scrollTop: 0, scrollLeft: 0, scrollTo({ top, left }) { this.scrollTop = top; this.scrollLeft = left; } };
  const canvas = { width: 0, height: 0, style: {} }, root = { contains: target => target.within !== false };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { if (!mounted) return; const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(value, slots[index])) { slots[index] = value; if (rendering) rerender = true; } }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  };
  for (const name of ['useEffect', 'useLayoutEffect']) hooks[name] = (effect, deps) => { const index = cursor++, previous = slots[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) scheduled.set(index, { effect, deps, previous, layout: name === 'useLayoutEffect' }); };
  const jsx = (type, values) => ({ type, props: values ?? {} });
  const modules = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/case-report-storage': { loadCaseReport: async () => { counters.loads++; return missing ? null : new Blob(['pdf']); }, identifyCaseReport: async () => reference, saveCaseReport: async () => {} },
    './case-pdf': {
      CASE_PDF_PIXELS: 8_000_000, casePdfOptions: data => ({ data }), prepareCaseReportPdf: async () => ({ pages: 20 }),
      casePdfModule: async () => ({ AnnotationMode: { DISABLE: 0 }, getDocument() {
        const document = { number: documents.length + 1, numPages: 20, requested: [], async getPage(page) {
          document.requested.push(page);
          const [width, height] = dimensions(page);
          return { getViewport: ({ scale }) => ({ width: width * scale, height: height * scale }), cleanup() { counters.pageCleanups++; }, render(options) {
            let resolve, reject;
            const promise = autoRender ? Promise.resolve() : new Promise((a, b) => { resolve = a; reject = b; });
            const entry = { document: document.number, page, options, resolve, reject, cancelled: false };
            renders.push(entry);
            // Deliberately allow a cancelled task to settle successfully: fencing
            // cannot depend on the PDF implementation rejecting every cancellation.
            return { promise, cancel() { entry.cancelled = true; } };
          } };
        } };
        documents.push(document);
        return { promise: Promise.resolve(document), async destroy() { counters.destroyed++; } };
      } }),
    },
    './CaseReportOriginals.module.css': {},
  };
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => modules[name], URL: { createObjectURL() { counters.created++; return `blob:report-${documents.length}`; }, revokeObjectURL() { counters.revoked++; } }, AbortController, Blob, console, ResizeObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() { counters.resizeDisconnected++; } }, window: { devicePixelRatio, addEventListener() {}, removeEventListener() {} } });
  function nodes(node, result = []) { if (!node || typeof node !== 'object') return result; if (Array.isArray(node)) { node.forEach(child => nodes(child, result)); return result; } result.push(node); nodes(node.props?.children, result); return result; }
  function runEffects(layout) { for (const [index, entry] of [...scheduled]) { if (entry.layout !== layout) continue; scheduled.delete(index); entry.previous?.cleanup?.(); slots[index] = { deps: entry.deps, cleanup: entry.effect() }; } }
  function render(next = props, { passive = true } = {}) {
    props = next; let passes = 0;
    do { cursor = 0; rerender = false; rendering = true; scheduled.clear(); tree = exports.default(props); rendering = false; assert.ok(++passes < 12, 'render state must settle'); } while (rerender);
    for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = node.type === 'canvas' ? canvas : node.props['aria-label'] === '原报告页面，可滚动' ? element : { click() {} };
    runEffects(true); if (passive) runEffects(false);
    return tree;
  }
  const find = predicate => { const value = nodes(tree).find(predicate); assert.ok(value, 'rendered node exists'); return value; };
  const button = text => find(node => node.type === 'button' && node.props.children === text);
  const viewport = () => find(node => node.props['aria-label'] === '原报告页面，可滚动');
  async function flush(next = props) { for (let i = 0; i < 4; i++) { render(next); await tick(); } render(next); }
  function key(key, options = {}) {
    const { target = {}, ...rest } = options;
    const event = { key, currentTarget: root, target: { within: true, closest: () => null, ...target }, nativeEvent: { isComposing: false }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...rest };
    tree.props.onKeyDown(event);
    return event.defaultPrevented;
  }
  return {
    render, flush, renders, receipts, counters, documents, canvas, element, find, button, key,
    has: predicate => nodes(tree).some(predicate),
    props: () => props, page: () => find(node => node.props['aria-label'] === '原报告页码').props.value,
    percent: () => find(node => node.props['aria-label'] === '原报告缩放比例').props.children,
    resize(width, height) { element.clientWidth = width; element.clientHeight = height; observer(); },
    scroll(top, left = 0) { element.scrollTop = top; element.scrollLeft = left; viewport().props.onScroll(); },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('whole-page fit uses both viewport dimensions and adapts to each PDF page without reloading', async () => {
  const h = readerHarness(); await h.flush();
  closeTo(parseFloat(h.canvas.style.width), 400); closeTo(parseFloat(h.canvas.style.height), 600);
  assert.equal(h.percent(), '67%'); assert.equal(h.button('整页').props['aria-pressed'], true);
  assert.equal(h.has(node => node.type === 'a' || node.props.download !== undefined), false, 'original files have no download link');
  assert.equal(h.counters.created, 0, 'reading creates no raw-file download URL');
  h.resize(932, 932); await h.flush();
  closeTo(parseFloat(h.canvas.style.width), 600); closeTo(parseFloat(h.canvas.style.height), 900); assert.equal(h.percent(), '100%');
  h.resize(632, 632); await h.flush();
  closeTo(parseFloat(h.canvas.style.width), 400); closeTo(parseFloat(h.canvas.style.height), 600);
  h.button('下一页').props.onClick(); await h.flush();
  closeTo(parseFloat(h.canvas.style.width), 600); closeTo(parseFloat(h.canvas.style.height), 300); assert.equal(h.percent(), '50%');
  assert.equal(h.counters.loads, 1); assert.equal(h.documents.length, 1);
  h.unmount(); assert.equal(h.counters.resizeDisconnected, 1); assert.equal(h.counters.destroyed, 1); assert.equal(h.counters.revoked, 0);
});

test('width fit and manual zoom show actual scale and preserve the same reading centre', async () => {
  const h = readerHarness(); await h.flush();
  h.button('适配宽度').props.onClick(); await h.flush();
  closeTo(parseFloat(h.canvas.style.width), 900); closeTo(parseFloat(h.canvas.style.height), 1350);
  assert.equal(h.percent(), '150%'); closeTo(h.element.scrollTop, 375);
  h.scroll(500);
  h.button('＋').props.onClick(); await h.flush();
  assert.equal(h.percent(), '175%'); closeTo(h.element.scrollTop, 800 / 1350 * 1575 - 300); closeTo(h.element.scrollLeft, 75);
  h.resize(932, 932); await h.flush();
  assert.equal(h.percent(), '175%'); closeTo(h.element.scrollTop, 800 / 1350 * 1575 - 450);
  h.button('整页').props.onClick(); await h.flush();
  assert.equal(h.percent(), '100%'); assert.equal(h.element.scrollTop, 0); assert.equal(h.element.scrollLeft, 0);
  assert.equal(h.counters.loads, 1);
});

test('large zoom stays inside the pixel and dimension budgets', async () => {
  const h = readerHarness({ devicePixelRatio: 4 }); await h.flush();
  for (let i = 0; i < 16; i++) { h.button('＋').props.onClick(); await h.flush(); }
  assert.equal(h.percent(), '400%'); assert.equal(h.button('＋').props.disabled, true);
  assert.ok(h.canvas.width * h.canvas.height <= 8_000_000); assert.ok(h.canvas.width <= 8192 && h.canvas.height <= 8192);
  assert.ok(h.renders.at(-1).options.transform[0] < 1, 'output ratio shrinks rather than allocating an oversized canvas');
  for (let i = 0; i < 16; i++) { h.button('−').props.onClick(); await h.flush(); }
  assert.equal(h.percent(), '10%'); assert.equal(h.button('−').props.disabled, true);
});

test('arrow paging stays inside the reader and leaves edits, modifiers and IME untouched', async () => {
  const h = readerHarness(); let requested = 1;
  await h.flush({ ...h.props(), onPageChange: page => { requested = page; } });
  assert.equal(h.key('ArrowRight'), true); await h.flush(); assert.equal(h.page(), '2'); assert.equal(requested, 2);
  const ignored = [
    ...['input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])', '[role="textbox"]'].map(match => ({ target: { closest: selector => selector.split(',').some(part => part.trim() === match) ? {} : null } })),
    { target: { isContentEditable: true } }, { target: { within: false } },
    { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { nativeEvent: { isComposing: true } },
  ];
  for (const options of ignored) { assert.equal(h.key('ArrowRight', options), false); await h.flush(); assert.equal(h.page(), '2'); }
  assert.equal(h.key('ArrowRight', { defaultPrevented: true }), true); await h.flush(); assert.equal(h.page(), '2');
  assert.equal(h.key('ArrowDown'), false);
  assert.equal(h.key('ArrowLeft'), true); await h.flush(); assert.equal(h.page(), '1');
  h.key('ArrowLeft'); await h.flush(); assert.equal(h.page(), '1');
  await h.flush({ ...h.props(), initialPage: 20 }); h.key('ArrowRight'); await h.flush(); assert.equal(h.page(), '20');
  assert.equal(h.counters.loads, 1);
});

test('empty or invalid page entries restore the current page without navigation or render receipts', async () => {
  const h = readerHarness(), selections = [];
  await h.flush({ ...h.props(), initialPage: 10, onPageChange: page => selections.push(page) });
  const input = () => h.find(node => node.props['aria-label'] === '原报告页码');
  const enter = async value => { input().props.onChange({ target: { value } }); await h.flush(); };
  const submit = () => h.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.page(), '10'); assert.equal(h.receipts.length, 1);
  await enter(''); input().props.onBlur(); await h.flush();
  assert.equal(h.page(), '10'); assert.deepEqual(selections, []); assert.equal(h.receipts.length, 1); assert.equal(h.renders.length, 1);
  for (const invalid of [' ', 'Infinity', "AX5z'z0"]) {
    await enter(invalid); submit(); await h.flush();
    assert.equal(h.page(), '10'); assert.deepEqual(selections, []); assert.equal(h.receipts.length, 1);
  }
  await enter('500'); submit(); await h.flush();
  assert.equal(h.page(), '20'); assert.deepEqual(selections, [20]); assert.equal(h.receipts.at(-1).page, 20);
  await enter('-4'); input().props.onBlur(); await h.flush();
  assert.equal(h.page(), '1'); assert.deepEqual(selections, [20, 1]);
  assert.equal(h.button('上一页').props.title, '上一页 ←'); assert.equal(h.button('下一页').props.title, '下一页 →');
});

test('render receipts wait for a successful committed page, retain its fingerprint and use the latest callback', async () => {
  const h = readerHarness({ autoRender: false }), first = [], latest = [];
  await h.flush({ ...h.props(), initialPage: 10, onPageRendered: value => first.push(value) });
  assert.equal(h.renders.length, 1); assert.equal(first.length, 0);
  await h.flush({ ...h.props(), report: { ...reference }, onPageRendered: value => latest.push(value) });
  assert.equal(h.counters.loads, 1); assert.equal(h.renders.length, 1);
  h.renders[0].resolve(); await tick(); assert.equal(latest.length, 0, 'settling a task alone does not commit visible state');
  await h.flush(); assert.equal(first.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(latest)), [{ reportId: reference.id, sha256: reference.sha256, page: 10 }]);
  await h.flush({ ...h.props(), onPageRendered: value => latest.push(value) }); assert.equal(latest.length, 1, 'callback changes do not replay a receipt');
  h.button('下一页').props.onClick(); await h.flush(); assert.equal(latest.length, 1);
  h.renders[1].reject(Error('bad page')); await h.flush(); assert.equal(latest.length, 1, 'failed pages have no receipt');
});

test('cancelled pages and old documents cannot emit receipts even before passive cleanup', async () => {
  const h = readerHarness({ autoRender: false }), first = [], second = [];
  await h.flush({ ...h.props(), initialPage: 4, onPageRendered: value => first.push(value) });
  h.render({ ...h.props(), initialPage: 5 }, { passive: false });
  h.renders[0].resolve(); await tick(); assert.equal(first.length, 0);
  await h.flush(); assert.equal(h.renders[1].page, 5);
  const other = { ...reference, id: 'report-b', sha256: 'b'.repeat(64) };
  h.render({ ...h.props(), report: other, initialPage: 2, onPageRendered: value => second.push(value) }, { passive: false });
  h.renders[1].resolve(); await tick(); await h.flush();
  assert.equal(first.length, 0); assert.equal(second.length, 0);
  const newest = h.renders.at(-1); assert.equal(newest.document, 2); assert.equal(newest.page, 2);
  newest.resolve(); await h.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(second)), [{ reportId: other.id, sha256: other.sha256, page: 2 }]);
  h.button('下一页').props.onClick(); await h.flush(); h.unmount();
  assert.equal(h.renders.at(-1).cancelled, true);
  h.renders.at(-1).resolve(); await tick(); assert.equal(second.length, 1, 'closing the reader suppresses late success');
  assert.equal(h.counters.destroyed, 2); assert.equal(h.counters.revoked, 0);
});

test('returning to a previously rendered page waits for fresh canvas contents', async () => {
  const h = readerHarness({ autoRender: false }); await h.flush();
  h.renders[0].resolve(); await h.flush(); assert.equal(h.receipts.length, 1);
  h.button('下一页').props.onClick(); await h.flush(); assert.equal(h.renders[1].page, 2);
  h.button('上一页').props.onClick(); await h.flush();
  assert.equal(h.find(node => node.type === 'canvas').props['aria-hidden'], true, 'the old page 1 receipt must not expose an in-progress page 2 canvas');
  assert.equal(h.receipts.length, 1);
  h.renders[1].resolve(); await h.flush(); assert.equal(h.renders[2].page, 1); assert.equal(h.receipts.length, 1);
  h.renders[2].resolve(); await h.flush(); assert.equal(h.receipts.length, 2); assert.equal(h.find(node => node.type === 'canvas').props['aria-hidden'], false);
});

test('missing local files produce no reading receipt', async () => {
  const h = readerHarness({ missing: true }); await h.flush();
  assert.equal(h.receipts.length, 0); assert.equal(h.documents.length, 0); assert.equal(h.key('ArrowRight'), false);
  assert.equal(h.button('重新导入 PDF').props.disabled, false);
});
