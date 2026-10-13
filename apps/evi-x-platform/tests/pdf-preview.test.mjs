import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fitPdfCanvas, pdfPreviewPageCount, PDF_PREVIEW_LIMITS } from '../lib/pdf-preview.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const sourceUrl = new URL('../components/editors/PdfPreview.tsx', import.meta.url);
// CommonJS VM execution needs only this build-time ESM URL substitution; all component logic is real.
const source = fs.readFileSync(sourceUrl, 'utf8').replaceAll('import.meta.url', JSON.stringify(sourceUrl.href));
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => walk(child, predicate));
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
function text(node) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(text).join(''); if (typeof node === 'object') return text(node.props?.children); return String(node); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));

function harness({ pages = 3, holdCancellation = false, pageWidth = 600, pageHeight = 800 } = {}) {
  const slots = [], effects = [], loads = [], renders = [], requested = [], observers = [], listeners = new Set();
  let cursor = 0, dirty = true, mounted = true, tree, props = { url: 'blob:https://evix.test/first' }, active = 0, maxActive = 0, cleaned = 0;
  const canvas = { width: 0, height: 0, style: {} }, viewport = { clientWidth: 632 };
  const hooks = {
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], next => { const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(value, slots[index])) { assert.equal(mounted, true, 'no state write after unmount'); slots[index] = value; dirty = true; } }]; },
    useEffect(setup, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: setup() }; }); },
  };
  const pdf = {
    numPages: pages,
    async getPage(number) {
      requested.push(number);
      return {
        getViewport({ scale }) { return { width: pageWidth * scale, height: pageHeight * scale }; },
        cleanup() { cleaned++; },
        render(options) {
          assert.equal(active, 0, 'a canvas must never render concurrently');
          const wait = deferred(); active++; maxActive = Math.max(maxActive, active);
          wait.promise.then(() => { active--; }, () => { active--; });
          const task = { ...wait, options, number, cancellations: 0, cancel() { task.cancellations++; if (!holdCancellation) wait.reject(new Error('RenderingCancelledException')); } };
          renders.push(task); return task;
        },
      };
    },
  };
  const workerOptions = {};
  const fixtureModule = { exports: {} };
  const modules = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../../lib/pdf-preview': { fitPdfCanvas, pdfPreviewPageCount, PDF_PREVIEW_LIMITS },
    './PdfPreview.module.css': { default: new Proxy({}, { get: (_, name) => name }) },
    'pdfjs-dist': { GlobalWorkerOptions: workerOptions, AnnotationMode: { DISABLE: 0 }, getDocument(options) { const wait = deferred(); const task = { ...wait, options, destroys: 0, async destroy() { task.destroys++; } }; loads.push(task); return task; } },
  };
  vm.runInNewContext(javascript, { module: fixtureModule, exports: fixtureModule.exports, require: name => { if (!(name in modules)) throw new Error('Unexpected module: ' + name); return modules[name]; }, URL, window: { devicePixelRatio: 3, addEventListener(name, fn) { listeners.add(fn); }, removeEventListener(name, fn) { listeners.delete(fn); } }, ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } } });
  function render() {
    cursor = 0; dirty = false; tree = fixtureModule.exports.default(props);
    for (const node of walk(tree, node => Boolean(node.props.ref))) node.props.ref.current = node.type === 'canvas' ? canvas : viewport;
    while (effects.length) effects.shift()();
  }
  async function flush() { for (let index = 0; index < 8; index++) { if (dirty && mounted) render(); await new Promise(resolve => setImmediate(resolve)); } return tree; }
  function button(label) { const found = walk(tree, node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label))[0]; assert.ok(found, 'button exists: ' + label); return found; }
  function click(label) { const control = button(label); assert.equal(Boolean(control.props.disabled), false, 'button enabled: ' + label); control.props.onClick(); }
  function unmount() { for (const slot of slots) slot?.cleanup?.(); mounted = false; }
  render();
  return { flush, loads, renders, requested, workerOptions, canvas, observers, listeners, get tree() { return tree; }, get maxActive() { return maxActive; }, get cleaned() { return cleaned; }, button, click, unmount, pdf,
    setUrl(url) { props = { url }; dirty = true; }, resize(width) { viewport.clientWidth = width; observers[0].fn(); },
    async load() { await flush(); loads.at(-1).resolve(pdf); await flush(); },
    async finish() { renders.at(-1).resolve(); await flush(); },
  };
}

test('canvas fit bounds finite page dimensions, DPR, pixels and preview page count', () => {
  for (const dims of [[600,800,600,3], [10000,10000,10000,2], [1e12,1e12,20000,9], [1,8000,700,1], [8000,1,8192,1]]) {
    const fit = fitPdfCanvas(...dims);
    assert.ok(fit.pixelWidth * fit.pixelHeight <= 8_000_000);
    assert.ok(fit.pixelWidth <= 8192 && fit.pixelHeight <= 8192 && fit.ratio <= 2);
    assert.ok(fit.width <= dims[2]);
  }
  assert.equal(pdfPreviewPageCount(900), 500); assert.equal(pdfPreviewPageCount(1), 1);
  for (const bad of [0, NaN, Infinity, 1.5]) assert.throws(() => pdfPreviewPageCount(bad));
  for (const dims of [[0,1,1,1], [1,Infinity,1,1], [1,1,-1,1], [1e20,1,600,1], [1e-310,1e-310,600,2]]) assert.throws(() => fitPdfCanvas(...dims));
});

test('actual component loads a blob with local worker and navigates rendered pages', async () => {
  const h = harness(); await h.load();
  assert.equal(h.loads[0].options.url, 'blob:https://evix.test/first');
  assert.equal(h.loads[0].options.enableXfa, false); assert.equal(h.loads[0].options.useWorkerFetch, false);
  assert.match(h.workerOptions.workerSrc, /pdfjs-dist\/build\/pdf.worker.min.mjs$/);
  assert.equal(h.renders[0].options.annotationMode, 0); assert.equal(h.renders[0].options.transform[0], 2);
  await h.finish(); assert.equal(walk(h.tree, node => node.type === 'canvas')[0].props.hidden, false);
  h.click('下一页 PDF'); await h.flush(); assert.equal(h.renders.at(-1).number, 2); await h.finish();
  assert.match(text(h.tree), /第 2 \/ 3 页/);
  h.click('上一页 PDF'); await h.flush(); await h.finish(); assert.equal(h.renders.at(-1).number, 1);
  h.unmount(); assert.equal(h.loads[0].destroys, 1); assert.equal(h.observers[0].disconnected, true); assert.equal(h.listeners.size, 0);
});

test('rapid page and resize changes cancel and await the prior renderer before reusing canvas', async () => {
  const h = harness({ holdCancellation: true }); await h.load(); const first = h.renders[0];
  h.click('下一页 PDF'); await h.flush(); h.click('下一页 PDF'); h.resize(432); await h.flush();
  assert.equal(h.renders.length, 1); assert.ok(first.cancellations > 0); assert.equal(h.canvas.width, 1200);
  first.reject(new Error('cancel settled')); await h.flush();
  assert.equal(h.renders.length, 2); assert.equal(h.renders[1].number, 3); assert.equal(h.canvas.width, 800);
  await h.finish(); assert.equal(h.maxActive, 1); assert.equal(h.cleaned, 2);
  h.unmount();
});

test('late documents and rendering results cannot replace a newer URL or update after unmount', async () => {
  const h = harness(); await h.flush(); const old = h.loads[0];
  h.setUrl('blob:https://evix.test/second'); await h.flush(); assert.equal(old.destroys, 1);
  old.resolve(h.pdf); await h.flush(); assert.equal(h.renders.length, 0);
  h.loads[1].resolve(h.pdf); await h.flush(); const rendering = h.renders[0];
  h.unmount(); assert.equal(h.loads[1].destroys, 1); rendering.resolve(); await h.flush(); assert.ok(rendering.cancellations > 0);
});

test('document and render failures expose retry and retry creates a fresh loading lifetime', async () => {
  const h = harness(); await h.flush(); h.loads[0].reject(new Error('bad PDF')); await h.flush();
  assert.match(text(h.tree), /PDF 读取失败/); assert.equal(h.loads[0].destroys, 1);
  h.click('重新读取 PDF'); await h.load(); h.renders[0].reject(new Error('bad page')); await h.flush();
  assert.match(text(h.tree), /这一页暂时无法显示/); assert.equal(walk(h.tree, node => node.type === 'canvas')[0].props.hidden, true);
  h.click('重新读取 PDF'); await h.load(); await h.finish(); assert.equal(h.loads.length, 3); assert.doesNotMatch(text(h.tree), /无法显示|读取失败/);
  h.unmount();
});

test('non-blob inputs never start a loading task and hidden containers wait until measurable', async () => {
  const h = harness(); h.setUrl('https://example.test/private.pdf'); await h.flush();
  assert.equal(h.loads.length, 0); assert.match(text(h.tree), /本次编译/); h.unmount();
  const hidden = harness({ pages: 900 }); hidden.resize(0); await hidden.load(); assert.equal(hidden.renders.length, 0);
  hidden.resize(632); await hidden.flush(); await hidden.finish(); assert.match(text(hidden.tree), /预览前 500 页/);
  for (let index = 1; index < 500; index++) hidden.click('下一页 PDF');
  await hidden.flush(); assert.equal(hidden.renders.at(-1).number, 500); assert.equal(hidden.button('下一页 PDF').props.disabled, true);
  await hidden.finish(); hidden.unmount();
});
