import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as workspace from '../lib/topic-lab/workspace.ts';
import * as parse from '../lib/topic-lab/parse.ts';
import * as terms from '../lib/topic-lab/terms.ts';
import * as network from '../lib/topic-lab/network.ts';
import * as burst from '../lib/topic-lab/burst.ts';
import * as trend from '../lib/topic-lab/trend.ts';
import * as evaluate from '../lib/topic-lab/evaluate.ts';

const ts = createRequire(import.meta.url)('typescript');
const compiled = ts.transpileModule(fs.readFileSync(new URL('../components/topic-lab/TopicLab.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = v => v == null || typeof v !== 'object' ? [] : Array.isArray(v) ? v.flatMap(walk) : [v, ...walk(v.props?.children)];
const text = v => v == null ? '' : Array.isArray(v) ? v.map(text).join('') : typeof v === 'object' ? text(v.props?.children) : String(v);
const deferred = () => { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve: v => resolve(v) }; };
function mount(snapshot, overrides = {}) {
  let props = { initialSnapshot: snapshot, onSnapshot: value => published.push(value) }, cursor = 0, dirty = true, tree;
  const cells = [], effects = [], published = [];
  const hooks = {
    useState(init) { const i = cursor++; cells[i] ??= { value: typeof init === 'function' ? init() : init }; return [cells[i].value, next => { cells[i].value = typeof next === 'function' ? next(cells[i].value) : next; dirty = true; }]; },
    useRef(init) { const i = cursor++; cells[i] ??= { current: init }; return cells[i]; },
    useMemo(fn, deps) { const i = cursor++; if (!cells[i] || deps.some((v, n) => !Object.is(v, cells[i].deps[n]))) cells[i] = { deps, value: fn() }; return cells[i].value; },
    useEffect(fn, deps) { const i = cursor++, prev = cells[i]; if (!prev || deps.some((v, n) => !Object.is(v, prev.deps[n]))) { const cell = cells[i] = { deps }; effects.push(() => { prev?.cleanup?.(); cell.cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const imports = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/data/award-cases': { awardCases: [] }, '@/components/workbench/shell-kit': { useWorkbenchTheme: () => 'light' }, '@/lib/topic-lab/workspace': { ...workspace, createLiteratureWorkspaceSnapshot: (c, s) => workspace.createLiteratureWorkspaceSnapshot(structuredClone(c), structuredClone(s)), ...overrides }, '@/lib/topic-lab/parse': parse, '@/lib/topic-lab/terms': terms, '@/lib/topic-lab/network': network, '@/lib/topic-lab/burst': burst, '@/lib/topic-lab/trend': trend, '@/lib/topic-lab/evaluate': evaluate, './shared': { fmtInt: String, pct: String } };
  const exports = {}; vm.runInNewContext(compiled, { exports, require: name => imports[name] ?? { default: name }, TextDecoder, TextEncoder, Map, Set });
  async function settle() { for (let n = 0; n < 40; n++) { if (dirty) { cursor = 0; dirty = false; tree = exports.default(props); while (effects.length) effects.shift()(); } await new Promise(r => setImmediate(r)); } }
  return { settle, published, get tree() { return tree; }, change(next) { props = { ...props, ...next }; dirty = true; }, input(file) { walk(tree).find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [file], value: '' } }); }, unmount() { cells.forEach(c => c?.cleanup?.()); } };
}
async function snapshot(title) {
  const records = parse.parseLiterature(`TY  - JOUR\nTI  - ${title}\nPY  - 2024\nKW  - synthetic\nER  -`).records;
  return workspace.createLiteratureWorkspaceSnapshot({ kind: 'import', lists: [records], files: [{ name: `${title}.ris`, format: 'ris', records: records.length, skipped: 0, warnings: [] }] }, { ...workspace.DEFAULT_LITERATURE_SETTINGS, source: 'keywords', basket: ['synthetic'] });
}

test('late import is fenced on project snapshot change and unmount', async () => {
  const a = await snapshot('Synthetic first'), b = await snapshot('Synthetic second');
  const screen = mount(a); await screen.settle(); assert.match(text(screen.tree), /Synthetic first.ris/);
  const pending = deferred(); screen.input({ name: 'late.ris', size: 20, arrayBuffer: () => pending.promise });
  screen.change({ initialSnapshot: b }); await screen.settle();
  pending.resolve(new TextEncoder().encode('TY  - JOUR\nTI  - Synthetic late\nER  -').buffer); await screen.settle();
  assert.match(text(screen.tree), /Synthetic second.ris/); assert.doesNotMatch(text(screen.tree), /late.ris/);
  assert.ok(screen.published.every(s => !s.corpus?.files.some(f => f.name === 'late.ris')));
  const next = deferred(); screen.input({ name: 'unmounted.ris', size: 20, arrayBuffer: () => next.promise });
  screen.unmount(); const count = screen.published.length;
  next.resolve(new TextEncoder().encode('TY  - JOUR\nTI  - Synthetic after unmount\nER  -').buffer); await screen.settle();
  assert.equal(screen.published.length, count);
});

test('a late hash cannot publish the previous project after restoration changes', async () => {
  const a = await snapshot('Synthetic alpha'), b = await snapshot('Synthetic beta'), pending = deferred();
  const screen = mount(a, { createLiteratureWorkspaceSnapshot: (corpus, settings) => corpus?.files[0]?.name === 'Synthetic alpha.ris' ? pending.promise : workspace.createLiteratureWorkspaceSnapshot(structuredClone(corpus), structuredClone(settings)) });
  await screen.settle(); screen.change({ initialSnapshot: b }); await screen.settle(); pending.resolve(a); await screen.settle();
  assert.match(text(screen.tree), /Synthetic beta.ris/); assert.ok(screen.published.every(s => s.corpusHash !== a.corpusHash));
  screen.unmount();
});
