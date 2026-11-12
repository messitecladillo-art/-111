import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const source = fs.readFileSync(new URL('../components/agent/ArtifactShelf.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const record = (id, familyId, kind, version, title) => ({ id, familyId, kind, version, title, status: 'stored', origin: '合成界面验收', detail: '模拟素材', updatedAt: '2026-11-12T00:00:00Z', canUse: true, canEdit: true, canExport: true });
const records = [record('cover-old', 'cover', 'cover', 1, '旧版关键词'), record('cover-new', 'cover', 'cover', 2, '新版封面'), record('table', 'table', 'table', 1, '构成表')];
const walk = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : !node ? '' : React.Children.toArray(node.props?.children).map(text).join('');

function harness(overrides = {}) {
  const slots = []; let cursor = 0, tree;
  const calls = [], hooks = {
    useId: () => `shelf-${cursor++}`,
    useRef: value => ({ current: value }),
    useMemo: callback => callback(),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
  };
  const exports = {}, jsx = (type, props, key) => React.createElement(type, { ...props, key });
  vm.runInNewContext(compiled, { exports, Intl, Date, require: name => name === 'react' ? hooks : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === './icons' ? { Icon: 'svg' } : { default: new Proxy({}, { get: (_target, key) => key }) } });
  let props = { items: records, selectedId: 'cover-new', preview: '预览', busy: false, error: null,
    onSelect: id => calls.push(['select', id]), onClose() {}, onUse: id => calls.push(['use', id]), onEdit() {}, onExport: id => calls.push(['export', id]), onArchive() {}, onCommand: (...args) => calls.push(['command', ...args]), onImport() {}, onCapture() {}, ...overrides };
  const h = { calls, render(next) { props = { ...props, ...next }; cursor = 0; tree = exports.default(props); return tree; }, find(predicate) { return walk(tree).find(predicate); }, all(predicate) { return walk(tree).filter(predicate); }, label(value) { return h.find(node => node.type === 'button' && text(node) === value); }, thumbnail(item) { const node = h.find(node => typeof node.type === 'function' && node.props.item?.id === item.id); return node.type(node.props); } };
  h.render(); return h;
}

test('type counts deduplicate families and filtered selection remains explicit without changing the selected version', () => {
  const h = harness();
  assert.ok(h.label('全部 2')); assert.ok(h.label('封面 1')); assert.ok(h.label('表格 1'));
  h.label('表格 1').props.onClick(); h.render();
  assert.ok(h.find(node => node.props?.role === 'status' && text(node).includes('所选素材不在当前列表')));
  h.find(node => node.type === 'button' && text(node).includes('用于报告')).props.onClick();
  assert.deepEqual(h.calls, [['use', 'cover-new']]);
  h.label('显示所选版本').props.onClick(); h.render();
  assert.ok(h.find(node => node.type === 'button' && node.props['aria-pressed'] === true && text(node).includes('新版封面')));
  assert.equal(h.calls.some(call => call[0] === 'select'), false);
});

test('a matching historical version is labelled as historical rather than presented as the latest', () => {
  const h = harness();
  h.find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: '旧版关键词' } }); h.render();
  assert.ok(h.find(node => node.type === 'button' && text(node).includes('旧版关键词') && text(node).includes('历史匹配')));
  assert.ok(h.find(node => node.props?.role === 'status' && text(node) === '找到 1 项'));
});

test('material instructions remain per-version drafts through filtering and only dispatch on explicit submit', () => {
  const h = harness({ selectedId: 'cover-old' });
  h.find(node => node.type === 'textarea').props.onChange({ target: { value: ' 保留旧版配色 ' } }); h.render({ selectedId: 'cover-new' });
  assert.equal(h.find(node => node.type === 'textarea').props.value, '');
  h.render({ selectedId: 'cover-old' }); h.label('表格 1').props.onClick(); h.render();
  assert.equal(h.find(node => node.type === 'textarea').props.value, ' 保留旧版配色 ');
  assert.equal(h.calls.length, 0);
  h.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.calls, [['command', 'cover-old', '保留旧版配色']]);
});

test('thumbnails reject remote URLs and keep download-only images from acquiring an apply operation', () => {
  for (const thumbnailUrl of ['https://example.invalid/private-image.png', 'javascript:alert(1)']) {
    const item = { ...records[1], thumbnailUrl }, h = harness({ items: [item] });
    assert.equal(walk(h.thumbnail(item)).some(node => node.type === 'img'), false);
  }
  const item = { ...records[1], thumbnailUrl: 'data:image/png;base64,AAAA', useAction: 'download', useLabel: '下载原图' }, h = harness({ items: [item] });
  assert.equal(walk(h.thumbnail(item)).find(node => node.type === 'img').props.loading, 'lazy');
  assert.equal(h.label('导出'), undefined);
  h.label('下载原图').props.onClick(); assert.deepEqual(h.calls, [['use', 'cover-new']]);
  h.render({ busy: true }); assert.equal(h.label('下载原图').props.disabled, true);
});

test('an unconfirmed account or project disables mutations and gives a visible reason', () => {
  const h = harness({ unavailableReason: '账号与项目尚未确认' });
  assert.ok(h.find(node => node.props?.role === 'status' && text(node).includes('账号与项目尚未确认')));
  assert.equal(h.find(node => node.type === 'button' && text(node).includes('用于报告')).props.disabled, true);
  assert.equal(h.label('导入素材').props.disabled, true);
  h.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
});
