import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Run actual index handlers and effects. Browser layout/focus is verified separately.
const ts = createRequire(import.meta.url)('typescript');
const source = ts.transpileModule(fs.readFileSync(new URL('../components/knowledge/KnowledgeIndex.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const text = value => value == null ? '' : Array.isArray(value) ? value.map(text).join('') : typeof value === 'object' ? text(value.props?.children) : String(value);
const EntryView = () => null;
const entries = [{ id: 'alpha', name: 'Alpha', domain: 'stats', definition: '示例统计概念' }, { id: 'beta', name: 'Beta', domain: 'ml', definition: '示例机器学习概念' }];
function mount(search = async () => []) {
  const cells = [], effects = [], timers = new Set(), visits = [];
  let at = 0, dirty = true, tree;
  const control = { entries, favorites: [], ready: true, search, recordVisit: entry => visits.push(entry.id), toggleFavorite() {} };
  const hooks = {
    useState(init) { const index = at++; cells[index] ??= { value: init }; return [cells[index].value, next => { cells[index].value = typeof next === 'function' ? next(cells[index].value) : next; dirty = true; }]; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) { const index = at++; const previous = cells[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { cells[index] = { deps }; effects.push(() => { previous?.cleanup?.(); cells[index].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const imports = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, './KnowledgeProvider': { useKnowledge: () => control }, './catalog': { DOMAINS: { stats: '统计', ml: '机器学习' } }, './KnowledgeEntryView': { default: EntryView }, './Knowledge.module.css': { default: new Proxy({}, { get: (_, name) => name }) } };
  const box = { exports: {}, require(name) { assert.ok(name in imports, name); return imports[name]; }, setTimeout(fn) { const timer = { fn }; timers.add(timer); return timer; }, clearTimeout(timer) { timers.delete(timer); } };
  vm.runInNewContext(source, box);
  const screen = {
    get tree() { return tree; }, visits, control,
    async settle() { for (let turn = 0; turn < 20; turn++) { at = 0; dirty = false; tree = box.exports.default(); effects.splice(0).forEach(fn => fn()); await Promise.resolve(); if (!dirty && !effects.length) return; } throw Error('Unstable rendering'); },
    async timers() { const active = [...timers]; timers.clear(); active.forEach(timer => timer.fn()); await Promise.resolve(); await screen.settle(); },
    click(label) { const button = nodes(tree).find(node => node.type === 'button' && text(node) === label); assert.ok(button, `Missing ${label}`); button.props.onClick(); },
    query(value) { nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value } }); },
    selected() { return nodes(tree).find(node => node.type === EntryView)?.props.entry.id ?? null; },
    related(id) { const entry = nodes(tree).find(node => node.type === EntryView); assert.ok(entry); entry.props.onRelated(id); },
  };
  return screen;
}

test('knowledge filters never leave unrelated detail visible, including an empty favorites list', async () => {
  const screen = mount(); await screen.settle(); assert.equal(screen.selected(), 'alpha');
  screen.click('机器学习'); await screen.settle(); assert.equal(screen.selected(), 'beta');
  screen.click('☆ 收藏'); await screen.settle(); assert.equal(screen.selected(), null);
  assert.match(text(screen.tree), /当前筛选下还没有收藏/);
  screen.click('查看全部概念'); await screen.settle(); assert.equal(screen.selected(), 'alpha');
});

test('related concepts reconcile active filters and record the actual visited entry', async () => {
  const screen = mount(); await screen.settle(); screen.click('统计'); await screen.settle();
  screen.related('beta'); await screen.settle(); assert.equal(screen.selected(), 'beta');
  assert.deepEqual(screen.visits, ['beta']);
  assert.equal(nodes(screen.tree).find(node => node.type === 'button' && text(node) === '全部学科').props['aria-pressed'], true);
});

test('search loading and zero matches clear previous detail; late earlier results cannot overwrite a new query', async () => {
  const pending = new Map();
  const screen = mount(query => new Promise(resolve => pending.set(query, resolve)));
  await screen.settle(); screen.query('old'); await screen.settle(); assert.equal(screen.selected(), null);
  await screen.timers(); screen.query('new'); await screen.settle(); await screen.timers();
  pending.get('old')([{ entry: entries[0] }]); await screen.settle(); assert.equal(screen.selected(), null);
  pending.get('new')([]); await screen.settle(); assert.equal(screen.selected(), null);
  assert.match(text(screen.tree), /没有匹配的概念/);
  screen.query('Beta'); await screen.settle(); await screen.timers(); pending.get('Beta')([{ entry: entries[1] }]);
  await screen.settle(); assert.equal(screen.selected(), 'beta');
});
