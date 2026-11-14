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
import * as cloudShapes from '../lib/topic-lab/cloud-shapes.ts';

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
  const imports = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/data/award-cases': { awardCases: [] }, '@/data/zhengda-corpus-2015-2027': { ZHENGDA_ARCHIVE_META: { totalReports: 204 }, zhengdaArchiveLitRecords: () => [], TOPICS_2027_POOL: [], TOPIC_THEMES_2027: [] }, '@/components/workbench/shell-kit': { useWorkbenchTheme: () => 'light' }, '@/lib/topic-lab/workspace': { ...workspace, createLiteratureWorkspaceSnapshot: (c, s) => workspace.createLiteratureWorkspaceSnapshot(structuredClone(c), structuredClone(s)), ...overrides }, '@/lib/topic-lab/parse': parse, '@/lib/topic-lab/terms': terms, '@/lib/topic-lab/network': network, '@/lib/topic-lab/burst': burst, '@/lib/topic-lab/trend': trend, '@/lib/topic-lab/evaluate': evaluate, './shared': { fmtInt: String, pct: String } };
  imports['@/lib/topic-lab/cloud-shapes'] = cloudShapes;
  const exports = {}; vm.runInNewContext(compiled, { exports, require: name => imports[name] ?? { default: name }, TextDecoder, TextEncoder, Map, Set });
  async function turn() { if (dirty) { cursor = 0; dirty = false; tree = exports.default(props); while (effects.length) effects.shift()(); } await new Promise(r => setImmediate(r)); }
  async function settle() { for (let n = 0; n < 40; n++) await turn(); }
  async function waitFor(predicate, description, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    do { await turn(); if (predicate()) return; } while (Date.now() < deadline);
    assert.fail(`Timed out after ${timeoutMs}ms waiting for ${description}. Last rendered text: ${text(tree).slice(0, 1200)}`);
  }
  const restored = filename => text(tree).includes(filename) && !text(tree).includes('正在核对项目文献快照');
  return { settle, waitFor, restored, published, get tree() { return tree; }, change(next) { props = { ...props, ...next }; dirty = true; }, input(file) { walk(tree).find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [file], value: '' } }); }, unmount() { cells.forEach(c => c?.cleanup?.()); } };
}
async function snapshot(title) {
  const records = parse.parseLiterature(`TY  - JOUR\nTI  - ${title}\nPY  - 2024\nKW  - synthetic\nER  -`).records;
  return workspace.createLiteratureWorkspaceSnapshot({ kind: 'import', lists: [records], files: [{ name: `${title}.ris`, format: 'ris', records: records.length, skipped: 0, warnings: [] }] }, { ...workspace.DEFAULT_LITERATURE_SETTINGS, source: 'keywords', basket: ['synthetic'] });
}

test('late import is fenced on project snapshot change and unmount', async () => {
  const a = await snapshot('Synthetic first'), b = await snapshot('Synthetic second');
  const screen = mount(a);
  await screen.waitFor(() => screen.restored('Synthetic first.ris'), 'initial A snapshot restoration');
  assert.match(text(screen.tree), /Synthetic first.ris/);
  const pending = deferred(); screen.input({ name: 'late.ris', size: 20, arrayBuffer: () => pending.promise });
  screen.change({ initialSnapshot: b });
  await screen.waitFor(() => screen.restored('Synthetic second.ris'), 'project B snapshot restoration');
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
  await screen.waitFor(() => screen.restored('Synthetic alpha.ris'), 'initial A snapshot restoration before its pending hash');
  screen.change({ initialSnapshot: b });
  await screen.waitFor(() => screen.restored('Synthetic beta.ris'), 'project B snapshot restoration before resolving the old hash');
  pending.resolve(a); await screen.settle();
  assert.match(text(screen.tree), /Synthetic beta.ris/); assert.ok(screen.published.every(s => s.corpusHash !== a.corpusHash));
  screen.unmount();
});

test('shape editing survives snapshot recovery, and switching project restores the other project shape', async () => {
  const make = async (name, shape) => {
    const records = parse.parseLiterature(`TY  - JOUR\nTI  - ${name}\nPY  - 2024\nKW  - synthetic\nKW  - quality\nKW  - service\nER  -`).records;
    return workspace.createLiteratureWorkspaceSnapshot({ kind: 'import', lists: [records], files: [{ name, format: 'ris', records: 1, skipped: 0, warnings: [] }] }, { ...workspace.DEFAULT_LITERATURE_SETTINGS, source: 'keywords', minDf: 1, cloud: { ...cloudShapes.DEFAULT_CLOUD_APPEARANCE, shape } });
  };
  const a = await make('Synthetic shape A', 'crayfish'), b = await make('Synthetic shape B', 'circle'), screen = mount(a);
  const cloud = () => walk(screen.tree).find(n => n.type === './WordCloud');
  await screen.waitFor(() => cloud()?.props.appearance.shape === 'crayfish', 'project A shape');
  cloud().props.onAppearanceChange({ ...cloud().props.appearance, shape: 'leaf' });
  await screen.waitFor(() => screen.published.some(s => s.settings.cloud?.shape === 'leaf'), 'leaf appearance snapshot');
  const saved = screen.published.findLast(s => s.settings.cloud?.shape === 'leaf');
  assert.equal(saved.parameterHash, a.parameterHash);
  screen.change({ initialSnapshot: b });
  await screen.waitFor(() => cloud()?.props.appearance.shape === 'circle', 'project B isolated shape');
  screen.change({ initialSnapshot: saved });
  await screen.waitFor(() => cloud()?.props.appearance.shape === 'leaf', 'restored A shape');
  walk(screen.tree).find(n => n.type === 'button' && text(n) === '清除').props.onClick();
  await screen.waitFor(() => screen.published.some(s => s.corpus === null && !s.settings.cloud), 'clear resets custom appearance');
  screen.unmount();
});
