import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as regions from '../lib/topic-advisor/regions.ts';

const ts = createRequire(import.meta.url)('typescript');
const compiled = ts.transpileModule(fs.readFileSync(new URL('../components/topic-advisor/RegionPicker.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
const button = (s, label) => {
  const found = nodes(s.tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label));
  assert.ok(found, `button: ${label}`);
  return found;
};
const ref = code => ({ code, catalogVersion: regions.TOPIC_REGION_CATALOG.catalogVersion });
const path = code => regions.regionPath(code).map(row => row.name).join(' / ');

// Execute the transpiled production React component against the real directory.
// This runner keeps hooks/effects and controlled parent props; it does not replace
// the component's state transitions with a separate implementation of the picker.
function make(initial = {}) {
  let cells = [], index = 0, effects = [], dirty = true, tree;
  const changes = [], listeners = new Map(), focusEvents = [], scrollEvents = [];
  let props = { regionRef: null, onChange: value => changes.push(plain(value)), ...initial };
  const hooks = {
    useState(initialValue) {
      const at = index++;
      if (!cells[at]) cells[at] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [cells[at].value, value => {
        const next = typeof value === 'function' ? value(cells[at].value) : value;
        if (!Object.is(next, cells[at].value)) { cells[at].value = next; dirty = true; }
      }];
    },
    useId() { const at = index++; return (cells[at] ??= { value: `test-${at}` }).value; },
    useRef(initialValue) { const at = index++; return cells[at] ??= { current: initialValue }; },
    useEffect(fn, deps) {
      const at = index++;
      if (!cells[at] || !sameDeps(cells[at].deps, deps)) {
        const old = cells[at]; cells[at] = { deps };
        effects.push(() => { old?.cleanup?.(); cells[at].cleanup = fn(); });
      }
    },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  const wrapped = { ...regions };
  for (const name of ['regionPath', 'resolveLegacyRegion', 'searchRegions']) wrapped[name] = (...args) => regions[name](...args.map(plain));
  const jsx = (type, props, key) => ({ type, props, key });
  const imports = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/topic-advisor/regions': wrapped, './RegionPicker.module.css': { default: {} } };
  class FakeNode {}
  const box = {
    exports: {}, require: name => { assert.ok(name in imports, name); return imports[name]; },
    console, JSON, Node: FakeNode, queueMicrotask,
    document: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
      getElementById: id => ({ scrollIntoView: options => scrollEvents.push({ id, options }) }),
    },
  };
  vm.runInNewContext(compiled, box);
  const s = {
    get tree() { return tree; }, changes, focusEvents, scrollEvents,
    async settle() {
      for (let n = 0; n < 20; n++) {
        index = 0; dirty = false; tree = box.exports.default(props);
        for (const node of nodes(tree)) {
          if (node.props?.ref && typeof node.props.ref === 'object') {
            const element = new FakeNode(); element.focus = () => focusEvents.push(node.props.id);
            element.contains = target => target === element;
            node.props.ref.current = element;
          }
        }
        const queue = effects; effects = []; queue.forEach(fn => fn());
        await Promise.resolve();
        if (!dirty && !effects.length) return;
      }
      throw Error('Unstable component effects');
    },
    update(patch) { props = { ...props, ...patch }; },
    async open() { nodes(tree).find(node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog').props.onClick(); await s.settle(); },
    get input() { return nodes(tree).find(node => node.type === 'input' && node.props.role === 'combobox'); },
    async search(value) { s.input.props.onChange({ target: { value } }); await s.settle(); },
    async click(label) { const node = button(s, label); assert.notEqual(node.props.disabled, true, label); node.props.onClick(); await s.settle(); },
    async stage(code) { await s.click(`选择 ${path(code)}`); },
    async key(key, extra = {}) {
      const event = { key, keyCode: 0, nativeEvent: {}, preventDefault() {}, stopPropagation() {}, ...extra };
      s.input.props.onKeyDown(event); await s.settle();
    },
    async escape(extra = {}) {
      nodes(tree).find(node => node.props?.role === 'dialog').props.onKeyDown({ key: 'Escape', keyCode: 27, nativeEvent: {}, preventDefault() {}, stopPropagation() {}, ...extra });
      await s.settle();
    },
    async outside() { listeners.get('pointerdown')?.({ target: new FakeNode() }); await s.settle(); },
    unmount() { cells.forEach(cell => cell.cleanup?.()); assert.equal(listeners.size, 0, 'global pointer listener released'); },
  };
  return s;
}

test('legacy province/city suggests a complete path and requires explicit confirmation', async () => {
  const s = make({ region: '湖北', city: '武汉' }); await s.settle();
  assert.ok(text(s.tree).includes('湖北 / 武汉')); assert.deepEqual(s.changes, []);
  await s.open();
  assert.equal(button(s, '确认地区').props.disabled, true);
  await s.click('预选旧输入候选 湖北省 / 武汉市');
  assert.deepEqual(s.changes, []);
  assert.ok(text(s.tree).includes('待确认范围湖北省 / 武汉市地级'));
  assert.ok(!text(s.tree).includes('待确认范围湖北省 / 武汉市 / 洪山区'));
  await s.click('确认地区'); assert.deepEqual(s.changes, [ref('420100')]); s.unmount();
});

test('province conflicts and historical/ambiguous legacy inputs never silently migrate', async () => {
  const conflict = make({ region: '广东', city: '武汉' }); await conflict.settle(); await conflict.open();
  assert.equal(button(conflict, '确认地区').props.disabled, true); assert.deepEqual(conflict.changes, []);
  assert.equal(nodes(conflict.tree).filter(node => node.props?.['aria-label']?.startsWith('预选旧输入候选')).length, 0); conflict.unmount();
  const history = make({ region: '河北', city: '桥东区' }); await history.settle(); await history.open();
  const candidates = nodes(history.tree).filter(node => node.type === 'button' && node.props['aria-label']?.startsWith('预选旧输入候选'));
  assert.ok(candidates.length > 1); assert.ok(text(history.tree).includes('历史名称可能涉及撤并或分割'));
  candidates[0].props.onClick(); await history.settle(); assert.deepEqual(history.changes, []);
  await history.click('取消'); assert.deepEqual(history.changes, []); history.unmount();
});

test('cascade allows province, prefecture, county and real province-direct county paths', async () => {
  for (const code of ['420000', '420100', '420111', '429004', '110101']) {
    const s = make(); await s.settle(); await s.open();
    for (const row of regions.regionPath(code)) await s.stage(row.code);
    assert.ok(text(s.tree).includes(`待确认范围${path(code)}`)); assert.deepEqual(s.changes, []);
    await s.click('确认地区'); assert.deepEqual(s.changes, [ref(code)]); s.unmount();
  }
});

test('province-only coverage remains selectable and never fabricates child nodes', async () => {
  const s = make(); await s.settle(); await s.open(); await s.stage('810000');
  assert.ok(text(s.tree).includes('该地区仅有省级目录，尚无市县明细。'));
  const columns = nodes(s.tree).filter(node => node.type === 'section');
  assert.equal(nodes(columns[1]).filter(node => node.type === 'button').length, 0);
  assert.equal(nodes(columns[2]).filter(node => node.type === 'button').length, 0);
  await s.click('确认地区'); assert.deepEqual(s.changes, [ref('810000')]); s.unmount();
});

test('cascade columns offer one Tab stop each and arrow navigation does not commit a selection', async () => {
  const s = make(); await s.settle(); await s.open();
  const group = nodes(s.tree).find(node => node.props?.role === 'group' && node.props['aria-label'] === '省 / 直辖市列表');
  const buttons = nodes(group).filter(node => node.type === 'button');
  assert.equal(buttons.filter(node => node.props.tabIndex === 0).length, 1);
  const focus = [], dom = buttons.map((_, index) => ({ focus: () => focus.push(index) }));
  const key = (value, at) => group.props.onKeyDown({ key: value, target: dom[at], currentTarget: { querySelectorAll: () => dom }, preventDefault() {} });
  key('ArrowDown', 0); key('ArrowUp', 0); key('Home', 4); key('End', 4);
  assert.deepEqual(focus, [1, dom.length - 1, 0, dom.length - 1]); assert.deepEqual(s.changes, []);
  assert.equal(button(s, '确认地区').props.disabled, true); s.unmount();
});

test('global search disambiguates same names by full path and supports six-digit codes', async () => {
  const s = make(); await s.settle(); await s.open(); await s.search('鼓楼区');
  const options = nodes(s.tree).filter(node => node.props?.role === 'option');
  assert.ok(options.length > 1);
  assert.ok(text(s.tree).includes('江苏省 / 南京市 / 鼓楼区'));
  assert.ok(text(s.tree).includes('福建省 / 福州市 / 鼓楼区'));
  await s.search('420111'); await s.key('Enter'); assert.deepEqual(s.changes, []);
  await s.click('确认地区'); assert.deepEqual(s.changes, [ref('420111')]); s.unmount();
});

test('search keyboard navigation stages the active option; IME Enter and Escape do not select or cancel', async () => {
  const s = make(); await s.settle(); await s.open(); await s.search('鼓楼区');
  const before = s.input.props['aria-activedescendant']; await s.key('ArrowDown');
  assert.notEqual(s.input.props['aria-activedescendant'], before);
  assert.equal(s.scrollEvents.at(-1).id, s.input.props['aria-activedescendant']);
  const active = nodes(s.tree).find(node => node.props?.role === 'option' && node.props['aria-selected']);
  const expectedCode = /\d{6}/u.exec(text(active))[0];
  s.input.props.onCompositionStart(); await s.key('Enter');
  assert.equal(button(s, '确认地区').props.disabled, true);
  const focusBeforeImeEscape = [...s.focusEvents];
  await s.escape({ nativeEvent: { isComposing: true } }); assert.ok(s.input);
  assert.deepEqual(s.focusEvents, focusBeforeImeEscape, 'IME Escape preserves input focus');
  s.input.props.onCompositionEnd(); await s.key('Enter', { keyCode: 229 });
  assert.equal(button(s, '确认地区').props.disabled, true);
  await s.key('Enter'); await s.click('确认地区'); assert.deepEqual(s.changes, [ref(expectedCode)]); s.unmount();
});

test('cancel, Escape, outside-click, and controlled project change discard unconfirmed selections', async () => {
  const s = make({ regionRef: ref('420100') }); await s.settle();
  for (const cancel of ['cancel', 'escape', 'outside']) {
    await s.open(); await s.stage('420111');
    const triggerId = nodes(s.tree).find(node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog').props.id;
    if (cancel === 'cancel') await s.click('取消'); else if (cancel === 'escape') await s.escape(); else await s.outside();
    assert.equal(nodes(s.tree).some(node => node.props?.role === 'dialog'), false); assert.deepEqual(s.changes, []);
    if (cancel !== 'outside') assert.equal(s.focusEvents.at(-1), triggerId, `${cancel} restores trigger focus`);
    assert.ok(text(s.tree).includes('湖北省 / 武汉市'));
  }
  await s.open(); await s.stage('420111'); s.update({ regionRef: ref('320100') }); await s.settle();
  assert.equal(nodes(s.tree).some(node => node.props?.role === 'dialog'), false); assert.deepEqual(s.changes, []);
  await s.open(); assert.ok(text(s.tree).includes('待确认范围江苏省 / 南京市')); s.unmount();
});

test('old versions and unknown refs remain visible until explicit reselect; clear is explicit', async () => {
  const old = { code: '420111', catalogVersion: 'cn-admin-1999-test' };
  const s = make({ regionRef: old, region: '旧省', city: '旧市' }); await s.settle();
  assert.ok(text(s.tree).includes('420111 · cn-admin-1999-test 已保留')); assert.deepEqual(s.changes, []);
  await s.open(); assert.equal(button(s, '确认地区').props.disabled, true);
  await s.search('420111'); await s.key('Enter'); assert.deepEqual(s.changes, []);
  await s.click('确认地区'); assert.deepEqual(s.changes, [ref('420111')]);
  s.update({ regionRef: ref('420111'), region: '', city: '' }); await s.settle(); await s.click('清除研究地区');
  assert.deepEqual(s.changes, [ref('420111'), null]); s.unmount();
  const unknown = make({ regionRef: ref('999999') }); await unknown.settle(); await unknown.open();
  assert.equal(button(unknown, '确认地区').props.disabled, true); assert.ok(text(unknown.tree).includes('原目录引用继续保留')); unknown.unmount();
});

test('scope changes with identical geography close drafts and reject retained handlers across accounts/projects', async () => {
  const changesA = [], changesB = [];
  const s = make({ regionRef: ref('420100'), region: '湖北', city: '武汉', scopeKey: 'account-a:project-a', onChange: value => changesA.push(plain(value)) });
  await s.settle(); await s.open(); await s.stage('420111');
  const staleConfirm = button(s, '确认地区').props.onClick;
  const staleClear = button(s, '清除研究地区').props.onClick;
  const staleStage = button(s, '选择 湖北省 / 武汉市').props.onClick;
  s.update({ scopeKey: 'account-b:project-b', onChange: value => changesB.push(plain(value)) }); await s.settle();
  assert.equal(nodes(s.tree).some(node => node.props?.role === 'dialog'), false);
  staleConfirm(); staleClear(); staleStage(); await s.settle();
  assert.deepEqual(changesA, []); assert.deepEqual(changesB, []);
  await s.open(); assert.ok(text(s.tree).includes('待确认范围湖北省 / 武汉市地级'));
  await s.stage('420111'); staleConfirm(); staleClear(); await s.settle();
  assert.deepEqual(changesA, []); assert.deepEqual(changesB, []);
  await s.click('确认地区'); assert.deepEqual(changesB, [ref('420111')]);
  await s.open(); await s.stage('420111'); const unmountedConfirm = button(s, '确认地区').props.onClick;
  s.unmount(); unmountedConfirm(); assert.deepEqual(changesB, [ref('420111')]);
});

test('cancelled draft cannot be committed by a retained confirmation callback', async () => {
  const s = make(); await s.settle(); await s.open(); await s.stage('420000');
  const staleConfirm = button(s, '确认地区').props.onClick;
  await s.click('取消'); staleConfirm(); await s.settle(); assert.deepEqual(s.changes, []); s.unmount();
});

test('empty search, clear search and malformed legacy data recover without emitting a selection', async () => {
  const s = make({ region: 'a'.repeat(161), city: '' }); await s.settle(); await s.open();
  assert.ok(text(s.tree).includes('旧地区输入无法解析')); await s.search('不存在的地区');
  assert.ok(text(s.tree).includes('没有匹配地区')); await s.key('ArrowDown'); await s.key('Enter');
  assert.deepEqual(s.changes, []); await s.click('清空地区搜索'); assert.equal(s.input.props.value, '');
  assert.ok(nodes(s.tree).some(node => node.type === 'section' && node.props['aria-label'] === '省 / 直辖市'));
  await s.search('42\u0000\n0111'); assert.equal(s.input.props.value, '420111'); s.unmount();
});

test('read-only and disabled controls expose their value without mutations and close active drafts', async () => {
  for (const flag of ['readOnly', 'disabled']) {
    const s = make({ regionRef: ref('420100'), [flag]: true }); await s.settle();
    const trigger = nodes(s.tree).find(node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog');
    assert.equal(trigger.props.disabled, true); trigger.props.onClick(); button(s, '清除研究地区').props.onClick(); await s.settle();
    assert.deepEqual(s.changes, []); assert.equal(nodes(s.tree).some(node => node.props?.role === 'dialog'), false);
    s.update({ [flag]: false }); await s.settle(); await s.open(); await s.stage('420111');
    s.update({ [flag]: true }); await s.settle(); assert.equal(nodes(s.tree).some(node => node.props?.role === 'dialog'), false);
    s.update({ [flag]: false }); await s.settle(); assert.equal(nodes(s.tree).some(node => node.props?.role === 'dialog'), false); s.unmount();
  }
});
